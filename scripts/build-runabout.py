"""Original 6.1 m varnished-mahogany runabout for La Baraj: detailed and LOD GLBs plus previews.

Run headless: Blender --background --python scripts/build-runabout.py
Modelling axes: x = port (the driver's left), f = forward, z = up, z = 0 on the lake surface.
Blender receives (x, -f, z), so the glTF export (+Y up) puts the bow at +Z and port at +X.
The origin is the turning pivot: on the centreline, 40% of the hull length forward of the transom.
Wood grain, deck seams, leather and gauge faces are generated as textures (numpy), not node trees.
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
QUICK = os.environ.get('RUNABOUT_QUICK') == '1'
OUT_RENDER = BASE / 'docs/art-direction/runabout'
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def P(x, f, z):
    return Vector((x, -f, z))


# ---------------------------------------------------------------- hull lines
L = 6.1
F_STERN, F_BOW = -0.4 * L, 0.6 * L       # transom centre and stem head
BULGE = 0.10                              # plan-view roundness of the transom
F0 = F_STERN + BULGE                      # transom corners
LS = F_BOW - F0
BMAX, BT, KEEL = 1.08, 0.98, -0.40
FR, FF, HW, CR = -1.35, 1.05, 0.86, 0.22  # cockpit opening: rear, front, half width, corner radius
ZF = 0.06                                 # cockpit floor (DriverSeat height), kept above the lake surface
SEAT = ZF + 0.29                          # top of the seat bases
SKIN = 0.03                               # planking thickness: the lining sits this far inboard


def u_of(f):
    return min(1.0, max(0.0, (f - F0) / LS))


def B(u):
    """Half beam at the sheer: rounded quarters aft, a fine pointed entry forward."""
    if u < 0.45:
        return BMAX - (BMAX - BT) * ((0.45 - u) / 0.45) ** 2.2
    t = (u - 0.45) / 0.55
    return BMAX * (1 - t * t)


def S(u):
    """Sheer height: low aft, sweeping up toward the bow."""
    return 0.64 + 0.22 * u ** 2.2 - 0.02 * math.sin(math.pi * u)


def K(u):
    """Keel and stem profile: flat run aft, curved forefoot, raked stem meeting the sheer."""
    s = max(0.0, (u - 0.62) / 0.38)
    return KEEL + (S(1) - KEEL) * s ** 3


def beta(u):
    return math.radians(10 + 28 * u if u < 0.5 else 24 + 60 * (u - 0.5))


def chine(u):
    k, b, s = K(u), B(u), S(u)
    return min(k + 0.9 * b * math.tan(beta(u)), k + 0.62 * (s - k))


def section(u, nb, nt):
    """Half section keel -> V bottom -> rounded chine -> flared topsides -> sheer, as (x, z)."""
    k, b, s = K(u), B(u), S(u)
    bc, zc = 0.9 * b, chine(u)
    cb, ct = 0.05, 0.06
    bottom = lambda t: (bc * t, k + (zc - k) * t - 0.03 * bc * math.sin(math.pi * t))
    top = lambda t: (bc + (b - bc) * t * (1.3 - 0.3 * t), zc + (s - zc) * t)
    pts = [bottom((1 - cb) * i / nb) for i in range(nb + 1)]
    a, m, e = bottom(1 - cb), (bc, zc), top(ct)
    pts += [tuple((1 - w) ** 2 * a[i] + 2 * (1 - w) * w * m[i] + w * w * e[i] for i in range(2))
            for w in (0.25, 0.5, 0.75)]
    pts += [top(ct + (1 - ct) * j / nt) for j in range(nt + 1)]
    return pts


def hull_x(f, z):
    """Outer half breadth of the hull at station f and height z."""
    pts = section(u_of(f), 16, 16)
    if z <= pts[0][1]:
        return 0.0
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        if z0 <= z <= z1:
            return x0 + (x1 - x0) * (z - z0) / max(z1 - z0, 1e-9)
    return pts[-1][0]


def inner(f, z):
    return hull_x(f, z) - SKIN


def zdeck(x, f):
    """Cambered deck: the sheer at the edge, crowned toward the king plank."""
    u = u_of(f)
    b = B(u)
    if b < 1e-6:
        return S(u)
    return S(u) + 0.06 * b / BMAX * max(0.0, 1 - (x / b) ** 2)


def opening(f):
    """Half width of the cockpit opening (a rounded rectangle) at station f."""
    if f < FR or f > FF:
        return 0.0
    d = max(FR + CR - f, f - (FF - CR), 0.0)
    return HW - CR + math.sqrt(max(CR * CR - d * d, 0.0))


def cockpit_rows(n_corner, n_mid):
    a = [FR + CR - CR * math.cos(math.pi / 2 * i / n_corner) for i in range(n_corner)]
    mid = list(np.linspace(FR + CR, FF - CR, n_mid + 1))
    b = [FF - CR + CR * math.sin(math.pi / 2 * i / n_corner) for i in range(1, n_corner + 1)]
    return a + mid + b


# ---------------------------------------------------------------- geometry accumulator
class Geo:
    """Vertices and faces with material, optional per-corner UVs and smoothing."""

    def __init__(self):
        self.V, self.F = [], []

    def v(self, p):
        self.V.append(Vector(p))
        return len(self.V) - 1

    def face(self, idx, mat, uv=None, smooth=False):
        keep = [k for k in range(len(idx)) if (self.V[idx[k]] - self.V[idx[k - 1]]).length > 1e-7]
        if len(keep) < 3:
            return
        self.F.append([[idx[k] for k in keep], mat, None if uv is None else [uv[k] for k in keep], smooth])

    def normal(self, idx):
        n = Vector()
        for a, b in zip(idx, idx[1:] + idx[:1]):
            p, q = self.V[a], self.V[b]
            n += Vector(((p.y - q.y) * (p.z + q.z), (p.z - q.z) * (p.x + q.x), (p.x - q.x) * (p.y + q.y)))
        c = sum((self.V[i] for i in idx), Vector()) / len(idx)
        return n, c

    def orient(self, start, hint):
        """Flip a patch built with consistent winding if most of it faces against hint(centre)."""
        score = 0.0
        for f in self.F[start:]:
            n, c = self.normal(f[0])
            score += n.dot(hint(c))
        if score < 0:
            for f in self.F[start:]:
                f[0].reverse()
                if f[2]:
                    f[2].reverse()

    def grid(self, rows, mat, uvs=None, smooth=True, wrap=False, hint=None):
        start = len(self.F)
        ids = [[self.v(p) for p in row] for row in rows]
        for i in range(len(rows) - 1):
            n = len(rows[i])
            for j in range(n if wrap else n - 1):
                j2 = (j + 1) % n
                q = [ids[i][j], ids[i][j2], ids[i + 1][j2], ids[i + 1][j]]
                uv = None if uvs is None else [uvs[i][j], uvs[i][j2], uvs[i + 1][j2], uvs[i + 1][j]]
                self.face(q, mat, uv, smooth)
        if hint:
            self.orient(start, hint)
        return start

    def add_bm(self, bm, mat, smooth=False, M=Matrix()):
        bm.verts.index_update()
        base = len(self.V)
        self.V += [M @ v.co for v in bm.verts]
        for f in bm.faces:
            self.face([base + v.index for v in f.verts], mat, None, smooth)
        bm.free()

    def tris(self):
        return sum(len(f[0]) - 2 for f in self.F)


def box(G, c, size, mat, R=Matrix.Identity(3), chamfer=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if chamfer:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=chamfer, segments=1, affect='EDGES')
    G.add_bm(bm, mat, False, Matrix.Translation(c) @ R.to_4x4())


def sphere(G, c, r, mat, scale=(1, 1, 1), R=Matrix.Identity(3), seg=(10, 6)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1.0)
    G.add_bm(bm, mat, True, Matrix.Translation(c) @ R.to_4x4() @ Matrix.Diagonal((r * scale[0], r * scale[1], r * scale[2], 1)))


def frame_for(axis):
    axis = axis.normalized()
    u = (X if abs(axis.x) < 0.9 else Y).cross(axis).normalized()
    return u, axis.cross(u), axis


def cyl(G, p0, p1, r, mat, n=12, caps=True, r1=None):
    p0, p1 = Vector(p0), Vector(p1)
    u, w, ax = frame_for(p1 - p0)
    r1 = r if r1 is None else r1
    ring = [(math.cos(2 * math.pi * k / n), math.sin(2 * math.pi * k / n)) for k in range(n)]
    b = [G.v(p0 + r * (c * u + s * w)) for c, s in ring]
    t = [G.v(p1 + r1 * (c * u + s * w)) for c, s in ring]
    for k in range(n):
        G.face([b[k], b[(k + 1) % n], t[(k + 1) % n], t[k]], mat, None, True)
    if caps:
        G.face([G.v(G.V[i]) for i in t], mat)
        G.face([G.v(G.V[i]) for i in reversed(b)], mat)


def sweep(G, path, profile, mat, closed=False, up=Z, side=None, caps=True, smooth=True, uv_scale=None):
    """Extrude a closed 2D profile (l, h) along a path; l runs along the side axis, h along the normal."""
    path = [Vector(p) for p in path]
    n = len(path)
    rings = []
    for i, p in enumerate(path):
        if closed:
            T = path[(i + 1) % n] - path[i - 1]
        else:
            T = path[min(i + 1, n - 1)] - path[max(i - 1, 0)]
        T.normalize()
        if side is not None:
            Lv = (side - side.dot(T) * T).normalized()
        else:
            Lv = up.cross(T)
            Lv = Lv.normalized() if Lv.length > 1e-6 else X.copy()
        N = T.cross(Lv)
        rings.append([p + l * Lv + h * N for l, h in profile])
    rows = rings + ([rings[0]] if closed else [])
    uvs = None
    if uv_scale:
        acc, along = 0.0, [0.0]
        for a, b in zip(rows, rows[1:]):
            acc += (Vector(b[0]) - Vector(a[0])).length
            along.append(acc)
        per, pacc = [0.0], 0.0
        for a, b in zip(profile, profile[1:]):
            pacc += math.dist(a, b)
            per.append(pacc)
        uvs = [[(s * uv_scale, per[j] * uv_scale) for j in range(len(profile))] for s in along]
    start = len(G.F)
    centres = [sum(r, Vector()) / len(r) for r in rows]
    G.grid(rows, mat, uvs, smooth, wrap=True)
    score = 0.0
    for k, f in enumerate(G.F[start:]):
        nrm, c = G.normal(f[0])
        i = min(range(len(centres)), key=lambda m: (centres[m] - c).length)
        score += nrm.dot(c - centres[i])
    if score < 0:
        for f in G.F[start:]:
            f[0].reverse()
            if f[2]:
                f[2].reverse()
    if caps and not closed:
        for ring, sign in ((rings[0], -1), (rings[-1], 1)):
            s0 = len(G.F)
            G.face([G.v(p) for p in ring], mat)
            T = (rings[-1][0] - rings[-2][0]) if sign > 0 else (rings[0][0] - rings[1][0])
            G.orient(s0, lambda c, T=T: T)


def circle(r, n, sx=1.0, sy=1.0, dy=0.0):
    return [(r * sx * math.cos(2 * math.pi * k / n), dy + r * sy * math.sin(2 * math.pi * k / n)) for k in range(n)]


# ---------------------------------------------------------------- textures (numpy)
def fnoise(h, w, lx, ly, seed):
    """Tileable gaussian-filtered noise; lx, ly are correlation lengths in pixels."""
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    filt = np.exp(-2 * np.pi ** 2 * ((fx * lx) ** 2 + (fy * ly) ** 2))
    r = np.fft.ifft2(np.fft.fft2(n) * filt).real
    return (r - r.mean()) / (r.std() + 1e-9)


def ramp(t, stops):
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,))
    xs = [s[0] for s in stops]
    for c in range(3):
        out[..., c] = np.interp(t, xs, [s[1][c] for s in stops])
    return out


MAHOGANY = [(0.0, (40, 12, 6)), (0.3, (80, 25, 11)), (0.55, (114, 40, 17)), (0.8, (146, 58, 26)), (1.0, (172, 80, 40))]


def mahogany(h, w, seed, lx=80, ly=1.2):
    """Grain along image x: crisp short streaks, ribbon figure, mottle, rays and open pores."""
    fine = fnoise(h, w, lx, ly, seed)
    streak = fnoise(h, w, lx * 1.5, ly * 4, seed + 1)
    ribbon = np.sin(np.linspace(0, 2 * np.pi * 14, h, endpoint=False)[:, None] + 2.2 * fnoise(h, w, lx * 2, 40, seed + 2))
    mottle = fnoise(h, w, 40, 26, seed + 3)
    t = 0.55 + 0.09 * fine + 0.05 * streak + 0.05 * ribbon + 0.09 * mottle
    col = ramp(t, MAHOGANY)
    rays = np.clip((fnoise(h, w, 3, 9, seed + 5) - 1.9) * 0.6, 0, 0.25)   # short pale flecks across the grain
    col = col * (1 + rays[..., None])
    pores = np.clip((fnoise(h, w, 14, 0.6, seed + 4) - 1.3) * 0.7, 0, 0.5)
    return col * (1 - pores[..., None])


def hull_texture(n=1024):
    """Topsides planking: five strakes per tile (v), grain along the hull (u), fine dark seams."""
    planks = 5
    col = np.zeros((n, n, 3))
    rng = np.random.default_rng(11)
    field = mahogany(n, n, 21)
    for p in range(planks):
        y0, y1 = p * n // planks, (p + 1) * n // planks
        shifted = np.roll(np.roll(field, rng.integers(0, n), axis=1), rng.integers(0, n), axis=0)
        col[y0:y1] = shifted[y0:y1] * rng.uniform(0.9, 1.08)
    y = np.arange(n)[:, None]
    d = np.min([np.abs(y - p * n / planks) for p in range(planks + 1)], axis=0)
    seam = np.clip(1.6 - d, 0, 1)
    col = col * (1 - 0.8 * seam[..., None])
    return col / 255


def deck_texture(n=1024):
    """Deck planking across u: a pale, wide king plank and 8 strakes per side with pale caulked seams."""
    king, per_side = 0.10, 8
    edges = [0.5 - king / 2 - k * (0.5 - king / 2) / per_side for k in range(per_side + 1)]
    edges = sorted(set([round(e, 6) for e in edges] + [round(1 - e, 6) for e in edges]))
    field = mahogany(n, n, 31, lx=260, ly=1.5).transpose(1, 0, 2)   # grain along v (image y)
    rng = np.random.default_rng(5)
    col = np.zeros((n, n, 3))
    x = (np.arange(n) + 0.5) / n
    for a, b in zip(edges, edges[1:]):
        m = (x >= a) & (x < b)
        shifted = np.roll(np.roll(field, rng.integers(0, n), axis=0), rng.integers(0, n), axis=1)
        if abs((a + b) / 2 - 0.5) < 0.01:   # king plank: a paler wood
            col[:, m] = shifted[:, m] * 0.55 + np.array([196, 132, 82]) * 0.45
        else:
            col[:, m] = shifted[:, m] * rng.uniform(0.86, 1.1)
    d = np.min([np.abs(x * n - e * n) for e in edges], axis=0)
    seam = np.clip(2.2 - d, 0, 1)[None, :].repeat(n, 0)
    caulk = np.array([232, 218, 186])
    col = col * (1 - seam[..., None]) + caulk * seam[..., None]
    height = 1 - np.clip(2.6 - d, 0, 1)[None, :].repeat(n, 0)
    return col / 255, normal_from(height, 2.5)


def normal_from(h, strength):
    gy, gx = np.gradient(h)
    nrm = np.dstack((-gx * strength, -gy * strength, np.ones_like(h)))
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    return nrm * 0.5 + 0.5


def leather_texture(n=512):
    mottle = fnoise(n, n, 50, 50, 41)
    grain = fnoise(n, n, 1.6, 1.6, 42)
    base = np.array([226, 211, 182]) / 255
    col = base * (1 + 0.035 * mottle[..., None] - 0.025 * np.clip(grain, 0, 3)[..., None] / 3)
    return np.clip(col, 0, 1), normal_from(fnoise(n, n, 2.2, 2.2, 43), 0.12)


def gauge_texture(n=256):
    y, x = np.mgrid[0:n, 0:n]
    cx, cy = (x + 0.5) / n * 2 - 1, (y + 0.5) / n * 2 - 1
    r = np.hypot(cx, cy)
    col = np.zeros((n, n, 3)) + np.array([0.035, 0.04, 0.05]) * (1.15 - 0.3 * r)[..., None]
    cream = np.array([0.93, 0.88, 0.74])

    def paint(mask, c):
        nonlocal col
        col = col * (1 - mask[..., None]) + np.array(c) * mask[..., None]

    def segment(a, r0, r1, w):
        dx, dy = math.sin(a), math.cos(a)
        t = np.clip(cx * dx + cy * dy, r0, r1)
        d = np.hypot(cx - t * dx, cy - t * dy)
        return np.clip((w - d) * n / 2 + 0.5, 0, 1)

    paint(np.clip((0.012 - np.abs(r - 0.9)) * n / 2 + 0.5, 0, 1), cream)
    for k in range(41):
        a = math.radians(-135 + 270 * k / 40)
        major = k % 5 == 0
        paint(segment(a, 0.62 if major else 0.72, 0.85, 0.022 if major else 0.009), cream)
    paint(segment(math.radians(-48), -0.12, 0.74, 0.016), (0.85, 0.16, 0.08))
    paint(np.clip((0.075 - r) * n / 2 + 0.5, 0, 1), (0.55, 0.55, 0.57))
    paint(np.clip((r - 0.97) * n / 2 + 0.5, 0, 1), (0.6, 0.6, 0.62))
    return col


def image(name, arr, data=False):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    if data:
        img.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


# ---------------------------------------------------------------- materials
MATS = ['Varnish', 'DeckPlanks', 'Chrome', 'Leather', 'Tufting', 'Glass', 'GaugeGlass', 'Ivory', 'BottomPaint',
        'BootStripe', 'Floor', 'GaugeFace', 'Pennant']
BOX_UV = {'Varnish': 0.5, 'Leather': 4.0, 'Tufting': 4.0}


def principled(name, color=(1, 1, 1), rough=0.5, metal=0.0, tex=None, normal=None, coat=0.0,
               coat_rough=0.03, alpha=1.0, cull=True):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = tex
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if normal:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = coat_rough
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = cull
    return m


def make_materials():
    print('generating textures', flush=True)
    hull = image('Mahogany_Topsides', hull_texture(512 if QUICK else 1024))
    deck_c, deck_n = deck_texture(512 if QUICK else 1024)
    leather_c, leather_n = leather_texture(512)
    return {
        'Varnish': principled('Varnish', rough=0.32, tex=hull, coat=1.0, coat_rough=0.04),
        'DeckPlanks': principled('DeckPlanks', rough=0.34, tex=image('Mahogany_Deck', deck_c),
                                 normal=image('Mahogany_Deck_Normal', deck_n, True), coat=0.8, coat_rough=0.05),
        'Chrome': principled('Chrome', (0.92, 0.93, 0.95), 0.08, 1.0),
        'Leather': principled('Leather', rough=0.55, tex=image('Leather_Cream', leather_c),
                              normal=image('Leather_Cream_Normal', leather_n, True)),
        'Tufting': principled('Tufting', (0.13, 0.095, 0.06), 0.4),
        'Glass': principled('Glass', (0.20, 0.30, 0.28), 0.03, alpha=0.4, cull=False),
        'GaugeGlass': principled('GaugeGlass', (0.9, 0.92, 0.92), 0.02, alpha=0.1),
        'Ivory': principled('Ivory', (0.86, 0.78, 0.6), 0.25),
        'BottomPaint': principled('BottomPaint', (0.15, 0.03, 0.022), 0.55),
        'BootStripe': principled('BootStripe', (0.80, 0.74, 0.58), 0.3, coat=0.5),
        'Floor': principled('Floor', (0.03, 0.03, 0.032), 0.8),
        'GaugeFace': principled('GaugeFace', rough=0.35, tex=image('Gauge_Face', gauge_texture())),
        'Pennant': principled('Pennant', (0.62, 0.03, 0.02), 0.7, cull=False),
    }


def preview_culling(materials, on):
    """Cycles ignores backface culling; emulate three.js FrontSide so the previews are honest."""
    for m in materials.values():
        if not m.use_backface_culling:
            continue
        nt = m.node_tree
        out, p = nt.nodes['Material Output'], nt.nodes['Principled BSDF']
        for node in [n for n in nt.nodes if n.name.startswith('cull_')]:
            nt.nodes.remove(node)
        if on:
            g = nt.nodes.new('ShaderNodeNewGeometry'); g.name = 'cull_geo'
            t = nt.nodes.new('ShaderNodeBsdfTransparent'); t.name = 'cull_tr'
            mix = nt.nodes.new('ShaderNodeMixShader'); mix.name = 'cull_mix'
            nt.links.new(g.outputs['Backfacing'], mix.inputs[0])
            nt.links.new(p.outputs['BSDF'], mix.inputs[1])
            nt.links.new(t.outputs['BSDF'], mix.inputs[2])
            nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
        else:
            nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])


def finalize(G, name, materials):
    me = bpy.data.meshes.new(name)
    for m in MATS:
        me.materials.append(materials[m])
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in G.V]
    uvl = bm.loops.layers.uv.new('UVMap')
    for idx, mat, uv, smooth in G.F:
        try:
            f = bm.faces.new([verts[i] for i in idx])
        except ValueError:
            continue
        f.material_index = MATS.index(mat)
        f.smooth = smooth
        if uv is None:
            s = BOX_UV.get(mat, 1.0)
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            pick = {0: (1, 2), 1: (0, 2), 2: (1, 0)}[ax]
            uv = [(v.co[pick[0]] * s, v.co[pick[1]] * s) for v in f.verts]
        for loop, t in zip(f.loops, uv):
            loop[uvl].uv = t
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- hull, decks, cockpit shell
def build_hull(G, q):
    nu, nb, nt = (60, 8, 11) if q else (20, 3, 4)
    B0 = B(0)
    bm = bmesh.new()
    part = bm.faces.layers.int.new('part')

    def f_at(u, x):
        return F0 + u * LS - BULGE * max(0.0, 1 - u / 0.05) ** 2 * max(0.0, 1 - (x / B0) ** 2)

    us = [0.5 - 0.5 * math.cos(math.pi * i / nu) for i in range(nu + 1)]
    rows = [[(x, f_at(u, x), z) for x, z in section(u, nb, nt)] for u in us]
    for side in (1, -1):
        V = [[bm.verts.new(P(side * x, f, z)) for x, f, z in row] for row in rows[:-1]]
        tip = bm.verts.new(P(0, *rows[-1][0][1:]))
        faces = []
        for i in range(len(V)):
            for j in range(len(V[i]) - 1):
                if i + 1 < len(V):
                    q4 = [V[i][j], V[i][j + 1], V[i + 1][j + 1], V[i + 1][j]]
                else:
                    q4 = [V[i][j], V[i][j + 1], tip]
                faces.append(bm.faces.new(q4))
        orient_bm(bm, faces, lambda c, s=side: Vector((s, 0, -0.2)))
    # Rounded transom: rows across the stern at each section height, then the crowned deck edge.
    pts = section(0, nb, nt)
    ncol = 14 if q else 4
    trows = []
    for x, z in pts:
        trows.append([(x * (2 * k / ncol - 1), z) for k in range(ncol + 1)])
    trows.append([(B0 * (2 * k / ncol - 1), zdeck(B0 * (2 * k / ncol - 1), F0)) for k in range(ncol + 1)])
    TV = []
    for row in trows:
        if abs(row[0][0]) < 1e-9:
            v = bm.verts.new(P(0, f_at(0, 0), row[0][1]))
            TV.append([v] * len(row))
        else:
            TV.append([bm.verts.new(P(x, f_at(0, x), z)) for x, z in row])
    tfaces = []
    for i in range(len(TV) - 1):
        for j in range(ncol):
            vs = []
            for v in (TV[i][j], TV[i][j + 1], TV[i + 1][j + 1], TV[i + 1][j]):
                if v not in vs:
                    vs.append(v)
            if len(vs) >= 3:
                try:
                    tfaces.append(bm.faces.new(vs))
                except ValueError:
                    pass
    for f in tfaces:
        f[part] = 1
    orient_bm(bm, tfaces, lambda c: Y)
    # Waterline: dark red-brown bottom, a cream boot stripe rising slightly toward the bow, varnish above.
    k = 0.012
    for dz in (0.0, 0.085):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6,
                               plane_co=Vector((0, 0, -F_STERN * k + dz)), plane_no=Vector((0, k, 1)))
    bm.verts.index_update()
    base = len(G.V)
    G.V += [v.co.copy() for v in bm.verts]
    for f in bm.faces:
        c = f.calc_center_median()
        d = c.z + k * c.y + F_STERN * k
        mat = 'BottomPaint' if d < 0 else 'BootStripe' if d < 0.085 else 'Varnish'
        uv = []
        for v in f.verts:
            fv = -v.co.y
            if f[part]:
                zc = chine(0)
                uv.append((v.co.x * 0.5, (v.co.z - zc) / (S(0) - zc)))
            else:
                u = u_of(fv)
                zc = chine(u)
                uv.append((fv * 0.5, (v.co.z - zc) / max(S(u) - zc, 1e-3)))
        G.face([base + v.index for v in f.verts], mat, uv, True)
    bm.free()


def orient_bm(bm, faces, hint):
    for f in faces:
        f.normal_update()
    score = sum(f.calc_area() * (1 if f.normal.dot(hint(f.calc_center_median())) > 0 else -1) for f in faces)
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=faces)


def build_decks(G, q):
    step = 0.065 if q else 0.3
    ncol = 24 if q else 6

    def uv(x, f, b):
        return (0.5 + 0.5 * x / b if b > 1e-6 else 0.5, f * 0.5)

    up = lambda c: Z
    # Foredeck
    fs = list(np.linspace(FF, F_BOW, max(3, int((F_BOW - FF) / step)) + 1))
    rows, uvs = [], []
    for f in fs:
        b = B(u_of(f))
        xs = [b * (2 * j / ncol - 1) for j in range(ncol + 1)]
        rows.append([P(x, f, zdeck(x, f)) for x in xs])
        uvs.append([uv(x, f, b) for x in xs])
    G.grid(rows, 'DeckPlanks', uvs, True, hint=up)
    # Stern deck, bulging round the transom
    B0 = B(0)
    nr = max(2, int((FR - F0) / step))
    rows, uvs = [], []
    for i in range(nr + 1):
        r = i / nr
        fn = F0 + (FR - F0) * r
        b = B(u_of(fn))
        row, urow = [], []
        for j in range(ncol + 1):
            s = 2 * j / ncol - 1
            x = s * b
            f = fn - BULGE * max(0.0, 1 - (x / B0) ** 2) * (1 - r) ** 3
            row.append(P(x, f, zdeck(x, f)))
            urow.append(uv(x, f, b))
        rows.append(row)
        uvs.append(urow)
    G.grid(rows, 'DeckPlanks', uvs, True, hint=up)
    # Side decks between the opening and the sheer
    nside = 5 if q else 2
    for side in (1, -1):
        rows, uvs = [], []
        for f in cockpit_rows(8 if q else 2, 30 if q else 4):
            b, o = B(u_of(f)), opening(f)
            xs = [side * (o + (b - o) * j / nside) for j in range(nside + 1)]
            rows.append([P(x, f, zdeck(x, f)) for x in xs])
            uvs.append([uv(x, f, b) for x in xs])
        G.grid(rows, 'DeckPlanks', uvs, True, hint=up)


def outline(n_arc, step):
    """Cockpit opening loop in (x, f), counter-clockwise seen from above."""
    pts = []
    corners = [((HW - CR, FF - CR), 0), ((-(HW - CR), FF - CR), 90), ((-(HW - CR), FR + CR), 180), ((HW - CR, FR + CR), 270)]
    for (cx, cf), a0 in corners:
        for k in range(n_arc + 1):
            a = math.radians(a0 + 90 * k / n_arc)
            pts.append((cx + CR * math.cos(a), cf + CR * math.sin(a)))
        nxt = corners[(corners.index(((cx, cf), a0)) + 1) % 4]
        a1 = math.radians(a0 + 90)
        p0 = (cx + CR * math.cos(a1), cf + CR * math.sin(a1))
        a2 = math.radians(nxt[1])
        p1 = (nxt[0][0] + CR * math.cos(a2), nxt[0][1] + CR * math.sin(a2))
        segs = max(1, int(math.dist(p0, p1) / step))
        pts += [(p0[0] + (p1[0] - p0[0]) * t / segs, p0[1] + (p1[1] - p0[1]) * t / segs) for t in range(1, segs)]
    return pts


def build_cockpit(G, q):
    # Varnished coaming around the opening
    loop = outline(6 if q else 2, 0.08 if q else 0.6)
    path = [P(x, f, zdeck(x, f)) for x, f in loop]
    prof = [(-0.022, -0.065), (0.012, -0.065), (0.012, 0.042), (0.006, 0.062), (-0.006, 0.07), (-0.018, 0.064), (-0.022, 0.05)]
    centre = P(0, (FR + FF) / 2, 0)
    probe = path[0]
    T = (path[1] - path[-1]).normalized()
    if Z.cross(T).dot(probe - centre) < 0:
        prof = [(-l, h) for l, h in prof]
    sweep(G, path, prof, 'Varnish', closed=True, uv_scale=0.5)
    # Lining inside the planking, closing under the side decks with a flange to the coaming
    nz = 9 if q else 2
    rowsf = cockpit_rows(6 if q else 2, 20 if q else 3)
    for side in (1, -1):
        rows = []
        for f in rowsf:
            top = S(u_of(f)) - 0.03
            zs = np.linspace(ZF - 0.03, top, nz + 1)
            row = [P(side * inner(f, z), f, z) for z in zs]
            row.append(P(side * (opening(f) - 0.004), f, top))
            rows.append(row)
        G.grid(rows, 'Varnish', None, True, hint=lambda c, s=side: Vector((-s, 0, 0)))
    # Floor
    rows = []
    for f in np.linspace(FR, FF, 12 if q else 3):
        w = inner(f, ZF) + 0.004
        rows.append([P(w * (2 * j / 6 - 1), f, ZF) for j in range(7)])
    G.grid(rows, 'Floor', None, False, hint=lambda c: Z)
    # Bulkheads: rear (varnish), dark footwell, varnished dashboard
    bulkhead(G, FR, ZF - 0.03, lambda x: zdeck(x, FR) - 0.03, 'Varnish', -1, q)
    lip = ZF + 0.30
    bulkhead(G, FF, ZF - 0.03, lambda x: lip + 0.02, 'Floor', 1, q)
    bulkhead(G, FF - 0.03, lip, lambda x: zdeck(x, FF) - 0.025, 'Varnish', 1, q)
    w = inner(FF, lip) - 0.004
    box(G, P(0, FF - 0.022, lip + 0.002), (2 * w, 0.046, 0.03), 'Varnish', chamfer=0.006 if q else 0)


def bulkhead(G, f, z0, ztop, mat, facing, q):
    """A panel across the hull at station f, clipped to the planking; facing +1 looks aft."""
    ncol, nrow = (16, 6) if q else (4, 2)
    rows = []
    for i in range(nrow + 1):
        row = []
        for j in range(ncol + 1):
            s = 2 * j / ncol - 1
            zt = ztop(s * inner(f, 0.5))
            z = z0 + (zt - z0) * i / nrow
            row.append(P(s * inner(f, z), f, z))
        rows.append(row)
    G.grid(rows, mat, None, False, hint=lambda c: Y * facing)


# ---------------------------------------------------------------- seats
def cushion(G, base_centre, ex, ey, W, D, H, q, tufts=True):
    """Leather pad on the plane (ex, ey); ez = ey x ex is its face. Diamond tufting when q."""
    ez = ey.cross(ex).normalized()
    r = 0.035 if q else 0.03
    Wi, Di = W - 2 * r, D - 2 * r
    nx, ny = (max(4, round(Wi / 0.033)), max(2, round(Di / 0.05))) if q else (max(1, round(Wi / 0.4)), 1)
    if tufts and q:
        nx, ny = nx - nx % 4, ny + ny % 2   # diamond creases then run along grid diagonals
    a = np.linspace(-Wi / 2, Wi / 2, nx + 1)
    b = np.linspace(-Di / 2, Di / 2, ny + 1)
    A, Bv = np.meshgrid(a, b)
    h = np.full(A.shape, H)
    buttons = []
    if tufts and q:
        h += 0.026 * (1 - (2 * A / Wi) ** 6) * (1 - (2 * Bv / Di) ** 4)
        br, bc = 2, 4
        rowsj = list(range(2, ny - 1, br))
        for k, j in enumerate(rowsj):
            off = 0 if k % 2 == 0 else bc // 2
            for i in range(2 + off, nx - 1, bc):
                buttons.append((i, j))
        dent = np.zeros(A.shape)
        for i, j in buttons:
            d2 = (A - a[i]) ** 2 + (Bv - b[j]) ** 2
            dent = np.maximum(dent, 0.04 * np.exp(-d2 / (2 * 0.02 ** 2)))
        bset = set(buttons)
        for i, j in buttons:
            for di in (-bc // 2, bc // 2):
                nb_ = (i + di, j + br)
                if nb_ in bset:
                    p0, p1 = np.array([a[i], b[j]]), np.array([a[nb_[0]], b[nb_[1]]])
                    dvec = p1 - p0
                    t = np.clip(((A - p0[0]) * dvec[0] + (Bv - p0[1]) * dvec[1]) / dvec.dot(dvec), 0, 1)
                    dd = (A - p0[0] - t * dvec[0]) ** 2 + (Bv - p0[1] - t * dvec[1]) ** 2
                    dent = np.maximum(dent, 0.03 * np.exp(-dd / (2 * 0.014 ** 2)))
        h -= dent
    O = Vector(base_centre)
    pt = lambda x, y, z: O + ex * x + ey * y + ez * z
    rows = [[pt(a[i], b[j], h[j, i]) for i in range(nx + 1)] for j in range(ny + 1)]
    uvs = [[(a[i] * 4, b[j] * 4) for i in range(nx + 1)] for j in range(ny + 1)]
    G.grid(rows, 'Leather', uvs, True, hint=lambda c: ez)
    # Rolled edge down to a vertical welt
    ring = [(i, 0) for i in range(nx + 1)] + [(nx, j) for j in range(1, ny + 1)] + \
           [(i, ny) for i in range(nx - 1, -1, -1)] + [(0, j) for j in range(ny - 1, 0, -1)]
    dirs = []
    for i, j in ring:
        dx = (1 if i == nx else -1 if i == 0 else 0)
        dy = (1 if j == ny else -1 if j == 0 else 0)
        ln = math.hypot(dx, dy)
        dirs.append((dx / ln, dy / ln))
    nr = 3 if q else 1
    rings = []
    for k in range(nr + 1):
        ph = math.pi / 2 * k / nr
        rings.append([pt(a[i] + dx * r * math.sin(ph), b[j] + dy * r * math.sin(ph), H - r * (1 - math.cos(ph)))
                      for (i, j), (dx, dy) in zip(ring, dirs)])
    rings.append([p - ez * (H - r) for p in rings[-1]])
    along = [0.0]
    for p0, p1 in zip(rings[0], rings[0][1:] + rings[0][:1]):
        along.append(along[-1] + (p1 - p0).length)
    down = [r * math.pi / 2 * k / nr for k in range(nr + 1)] + [r * math.pi / 2 + H - r]
    uvs = [[(s_ * 4, d * 4) for s_ in along] for d in down]
    rings = [row + row[:1] for row in rings]
    s0 = len(G.F)
    G.grid(rings, 'Leather', uvs, True)
    mid = pt(0, 0, H / 2)
    G.orient(s0, lambda c: c - mid)
    if tufts and q:
        for i, j in buttons:
            button(G, pt(a[i], b[j], h[j, i] + 0.001), ex, ey, ez)
        welt = [pt(a[i], b[j], H + 0.002) for n_, (i, j) in enumerate(ring) if n_ % 3 == 0]
        sweep(G, welt, circle(0.0065, 5), 'Tufting', closed=True, side=None, up=ez)


def button(G, c, ex, ey, ez, r=0.019, h=0.012):
    """Leather-covered tufting button: a low six-sided dome."""
    ring = lambda rr, hh: [G.v(c + ex * rr * math.cos(k * math.pi / 3) + ey * rr * math.sin(k * math.pi / 3) + ez * hh) for k in range(6)]
    outer, mid, apex = ring(r, 0), ring(r * 0.7, h * 0.75), G.v(c + ez * h)
    s0 = len(G.F)
    for k in range(6):
        k2 = (k + 1) % 6
        G.face([outer[k], outer[k2], mid[k2], mid[k]], 'Tufting', None, True)
        G.face([mid[k], mid[k2], apex], 'Tufting', None, True)
    G.orient(s0, lambda p: ez)


def build_seats(G, q):
    def width_at(f0, f1, z, cap):
        return min(min(2 * (inner(f, z) - 0.03) for f in np.linspace(f0, f1, 5)), cap)

    for fc, fb, bf, tilt, d_back in ((FRONT_ROW, 0.47, FRONT_ROW - 0.235, 14, 0.56), (REAR_ROW, 0.44, -1.08, 12, 0.54)):
        f0, f1 = fc - fb / 2, fc + fb / 2
        bw = width_at(f0 + 0.04, f1 - 0.04, ZF, 1.58)
        box(G, P(0, fc - 0.01, (ZF + SEAT) / 2), (bw, fb - 0.07, SEAT - ZF), 'Varnish', chamfer=0.01 if q else 0)
        cw = width_at(f0, f1, SEAT, 2 * (HW - 0.05))
        cushion(G, P(0, fc, SEAT), X, -Y, cw, fb, 0.11, q)
        t = math.radians(tilt)
        ey = Vector((0, math.sin(t), math.cos(t)))
        ez = ey.cross(-X)
        Hb = 0.10
        origin = P(0, bf, SEAT + 0.07) + ey * (d_back / 2) - ez * Hb
        cushion(G, origin, -X, ey, cw, d_back, Hb, q)
        R = Matrix((X, ey, X.cross(ey))).transposed()
        box(G, origin - ez * 0.016 + ey * 0.005, (cw + 0.03, d_back + 0.03, 0.03), 'Varnish', R, chamfer=0.008 if q else 0)


# ---------------------------------------------------------------- helm, windshield, hardware
TILT, RIM = 0.55, 0.20
FRONT_ROW, REAR_ROW = 0.305, -0.86            # seat cushion centres
HIPS_FRONT = FRONT_ROW + 0.235 - 0.165       # seated hips: 0.165 m behind the front cushion edge
HIPS_REAR = REAR_ROW + 0.22 - 0.165
HUB = P(-0.52, HIPS_FRONT + 0.32, ZF + 0.54)   # within arm's reach of the seated driver's shoulders
WHEEL_R = Matrix.Rotation(TILT, 3, 'X')


def build_wheel(q):
    """Rim, spokes and hub in WheelSpin space: wheel plane is local XZ, the driver looks along -Y."""
    G = Geo()
    n, m = (48, 10) if q else (16, 5)
    rim = [Vector((RIM * math.cos(2 * math.pi * k / n), 0, RIM * math.sin(2 * math.pi * k / n))) for k in range(n)]
    sweep(G, rim, circle(0.016, m), 'Ivory', closed=True, side=Y)
    wires = (-0.011, 0, 0.011) if q else (0,)
    for ang in (0, 180, 270):
        a = math.radians(ang)
        d, s = Vector((math.cos(a), 0, math.sin(a))), Vector((-math.sin(a), 0, math.cos(a)))
        for o in wires:
            cyl(G, d * 0.03 + s * o * 0.6 - Y * 0.035, d * (RIM - 0.008) + s * o, 0.0042 if q else 0.008, 'Chrome', 6 if q else 4, False)
    cyl(G, -Y * 0.075, -Y * 0.02, 0.036, 'Chrome', 20 if q else 8)
    cyl(G, -Y * 0.02, Y * 0.0, 0.03, 'Chrome', 20 if q else 8)
    cyl(G, Y * 0.0, Y * 0.012, 0.022, 'Ivory', 16 if q else 6)
    return G


def build_helm(G, q):
    d = WHEEL_R @ -Y
    dash_y = -(FF - 0.03)
    length = (dash_y - HUB.y) / d.y
    cyl(G, HUB + d * 0.07, HUB + d * length, 0.021, 'Chrome', 14 if q else 6)
    cyl(G, HUB + d * (length - 0.02), HUB + d * (length + 0.005), 0.034, 'Chrome', 18 if q else 6)
    face_y = dash_y + 0.004
    for x, z, r in ((-0.02, 0.575, 0.058), (-0.19, 0.55, 0.044), (0.15, 0.55, 0.044)):
        c = Vector((x, face_y, ZF + z))
        ring = [c + Vector((r * math.cos(2 * math.pi * k / 28), 0, r * math.sin(2 * math.pi * k / 28))) for k in range(28 if q else 10)]
        sweep(G, ring, circle(0.0075, 8 if q else 4), 'Chrome', closed=True, side=Y)
        n = 24 if q else 8
        ids = [G.v(c + Vector((r * math.cos(2 * math.pi * k / n), 0.004, r * math.sin(2 * math.pi * k / n)))) for k in range(n)]
        uv = [(0.5 + 0.5 * math.cos(2 * math.pi * k / n), 0.5 + 0.5 * math.sin(2 * math.pi * k / n)) for k in range(n)]
        s0 = len(G.F)
        G.face(ids, 'GaugeFace', uv)
        G.orient(s0, lambda c_: Y)
        if q:
            sphere(G, c + Vector((0, 0.006, 0)), r * 0.96, 'GaugeGlass', (1, 0.18, 1), seg=(20, 6))
    zs, zh = ZF + 0.45, ZF + 0.56
    for k, x in enumerate((0.27, 0.32, 0.37)):
        cyl(G, Vector((x, face_y, zs)), Vector((x, face_y + 0.012, zs)), 0.011, 'Chrome', 10 if q else 5)
        cyl(G, Vector((x, face_y, zs)), Vector((x, face_y + 0.035, zs + 0.015)), 0.0035, 'Chrome', 5 if q else 3, False)
    cyl(G, Vector((-0.02, face_y, zs - 0.01)), Vector((-0.02, face_y + 0.012, zs - 0.01)), 0.02, 'Chrome', 14 if q else 6)
    for x in (0.46, 0.76):
        cyl(G, Vector((x, face_y, zh)), Vector((x, face_y + 0.045, zh)), 0.009, 'Chrome', 8 if q else 4)
    cyl(G, Vector((0.44, face_y + 0.045, zh)), Vector((0.78, face_y + 0.045, zh)), 0.011, 'Chrome', 10 if q else 5)


def build_windshield(G, q):
    n = 36 if q else 10
    ss = [2 * k / n - 1 for k in range(n + 1)]
    fb = lambda s: 1.42 - 0.34 * abs(s) ** 3
    base = [P(0.93 * s, fb(s), zdeck(0.93 * s, fb(s)) + 0.014) for s in ss]
    top = [Vector((b.x * 0.965, b.y + 0.19, b.z + 0.33)) for b in base]
    glass_rows = [[b.lerp(t, w) for b, t in zip(base, top)] for w in (0.03, 0.5, 0.97)]
    G.grid(glass_rows, 'Glass', None, True)
    prof = [(-0.013, -0.006), (0.013, -0.006), (0.013, 0.01), (0.007, 0.02), (-0.007, 0.02), (-0.013, 0.01)]
    sweep(G, base, prof, 'Chrome', side=None, up=Z)
    sweep(G, top, circle(0.011, 8 if q else 4), 'Chrome', up=Z)
    for i in (0, n):
        cyl(G, base[i] - Z * 0.01, top[i], 0.015, 'Chrome', 12 if q else 5)
        sphere(G, top[i], 0.017, 'Chrome', seg=(10, 6) if q else (6, 3))
        foot = base[i] + Vector((0.035 * (1 if base[i].x > 0 else -1), 0.03, -0.006))
        box(G, foot, (0.05, 0.09, 0.012), 'Chrome', chamfer=0.004 if q else 0)
    mid = n // 2
    cyl(G, base[mid], top[mid], 0.009, 'Chrome', 10 if q else 4)


def cleat(G, x, f, q):
    z = zdeck(x, f)
    box(G, P(x, f, z + 0.006), (0.035, 0.09, 0.012), 'Chrome', chamfer=0.003 if q else 0)
    for df in (-0.025, 0.025):
        cyl(G, P(x, f + df, z), P(x, f + df, z + 0.035), 0.009, 'Chrome', 8 if q else 4)
    cyl(G, P(x, f - 0.085, z + 0.038), P(x, f + 0.085, z + 0.038), 0.011, 'Chrome', 10 if q else 5, r1=0.011)
    if q:
        sphere(G, P(x, f - 0.085, z + 0.038), 0.011, 'Chrome', seg=(8, 4))
        sphere(G, P(x, f + 0.085, z + 0.038), 0.011, 'Chrome', seg=(8, 4))


def build_hardware(G, q):
    B0 = B(0)
    # Rub rail: one loop along both sheers and the transom cap
    nu = 56 if q else 18
    side_pts = []
    for i in range(nu + 1):
        u = i / nu
        side_pts.append((B(u), F0 + u * LS, S(u)))
    port = [P(x, f, z) for x, f, z in reversed(side_pts)]
    stbd = [P(-x, f, z) for x, f, z in side_pts]
    trans = [P(B0 * s, F0 - BULGE * (1 - s * s), zdeck(B0 * s, F0)) for s in np.linspace(1, -1, 18 if q else 6)[1:-1]]
    loop = port + trans + stbd[:-1]
    centre = P(0, 0.61, 0)
    rail = []
    for i, p in enumerate(loop):
        T = (loop[(i + 1) % len(loop)] - loop[i - 1])
        nh = Z.cross(T)
        nh.z = 0
        nh = nh.normalized() if nh.length > 1e-6 else X.copy()
        if nh.dot(Vector((p.x, p.y - centre.y, 0))) < 0:
            nh = -nh
        rail.append(p + nh * 0.008 - Z * 0.01)
    sweep(G, rail, circle(0.017, 7 if q else 4), 'Chrome', closed=True)
    # Cutwater: a chrome strip down the stem from the foredeck to the waterline
    path = [P(0, f, zdeck(0, f) + 0.004) for f in np.linspace(F_BOW - 0.32, F_BOW - 0.02, 5)]
    u = 1.0
    while K(u) > -0.07:
        path.append(P(0, F0 + u * LS + 0.004, K(u)))
        u -= 0.004 if q else 0.02
    sweep(G, path, circle(0.017, 10 if q else 4, sy=0.7), 'Chrome', side=X)
    # Bow light
    fz = F_BOW - 0.42
    z = zdeck(0, fz)
    cyl(G, P(0, fz, z), P(0, fz, z + 0.012), 0.03, 'Chrome', 14 if q else 6)
    cyl(G, P(0, fz, z), P(0, fz, z + 0.11), 0.011, 'Chrome', 10 if q else 4)
    sphere(G, P(0, fz, z + 0.125), 0.024, 'Ivory', (1, 1, 0.8), seg=(12, 6) if q else (6, 3))
    cyl(G, P(0, fz, z + 0.14), P(0, fz, z + 0.155), 0.02, 'Chrome', 12 if q else 5)
    for x, f in ((0.36, 2.45), (-0.36, 2.45), (0.8, -2.0), (-0.8, -2.0)):
        cleat(G, x, f, q)
    # Engine hatch: seam outline, louvred chrome vents, lift handles, filler cap
    x0, x1, f0, f1 = -0.62, 0.62, -2.02, -1.5
    seam = []
    for xa, fa, xb, fb in ((x0, f0, x1, f0), (x1, f0, x1, f1), (x1, f1, x0, f1), (x0, f1, x0, f0)):
        n = 12 if q else 2
        pts = [(xa + (xb - xa) * t / n, fa + (fb - fa) * t / n) for t in range(n + 1)]
        dx, df = xb - xa, fb - fa
        ln = math.hypot(dx, df)
        nx_, nf = -df / ln * 0.005, dx / ln * 0.005
        rows = [[P(x + nx_ * s, f + nf * s, zdeck(x, f) + 0.0015) for x, f in pts] for s in (-1, 1)]
        G.grid(rows, 'Floor', None, False, hint=lambda c: Z)
    for x in (0.4, -0.4):
        fcen, z = (f0 + f1) / 2, zdeck(x, (f0 + f1) / 2)
        L_, W_ = 0.3, 0.15
        rows = [[P(x + W_ / 2 * sx, fcen + L_ / 2 * sf, zdeck(x + W_ / 2 * sx, fcen) + 0.002) for sx in (-1, 1)] for sf in (-1, 1)]
        G.grid(rows, 'Floor', None, False, hint=lambda c: Z)
        for sx in (-1, 1):
            box(G, P(x + sx * W_ / 2, fcen, z + 0.012), (0.014, L_ + 0.014, 0.022), 'Chrome', chamfer=0.003 if q else 0)
        for sf in (-1, 1):
            box(G, P(x, fcen + sf * L_ / 2, z + 0.012), (W_ + 0.014, 0.014, 0.022), 'Chrome', chamfer=0.003 if q else 0)
        if q:
            for k in range(7):
                fk = fcen - L_ / 2 + (k + 0.5) * L_ / 7
                box(G, P(x, fk, z + 0.014), (W_ - 0.004, 0.032, 0.004), 'Chrome', Matrix.Rotation(0.6, 3, 'X'))
    for x in (0.16, -0.16):
        z = zdeck(x, f1 + 0.08)
        for df in (-0.05, 0.05):
            cyl(G, P(x, f1 + 0.08 + df, z), P(x, f1 + 0.08 + df, z + 0.03), 0.007, 'Chrome', 6 if q else 3)
        cyl(G, P(x, f1 + 0.02, z + 0.03), P(x, f1 + 0.14, z + 0.03), 0.009, 'Chrome', 8 if q else 4)
    z = zdeck(0.75, -1.62)
    cyl(G, P(0.75, -1.62, z), P(0.75, -1.62, z + 0.014), 0.045, 'Chrome', 18 if q else 6)
    # Stern flagstaff with a small red pennant
    fs = -2.12
    z = zdeck(0, fs)
    cyl(G, P(0, fs, z), P(0, fs, z + 0.012), 0.03, 'Chrome', 14 if q else 6)
    rake = math.radians(10)
    top = P(0, fs - 0.62 * math.sin(rake), z + 0.62 * math.cos(rake))
    cyl(G, P(0, fs, z), top, 0.008, 'Chrome', 8 if q else 4)
    sphere(G, top, 0.014, 'Chrome', seg=(10, 5) if q else (6, 3))
    hoist = [top.lerp(P(0, fs, z), t) for t in np.linspace(0.03, 0.27, 6 if q else 2)]
    rows = []
    nfly = 10 if q else 3
    for k in range(nfly + 1):
        w = k / nfly
        mid_ = (hoist[0] + hoist[-1]) / 2
        row = []
        for hp in hoist:
            p = hp.lerp(mid_, w) + Vector((0, 0.21 * w, -0.02 * w))
            p.x += 0.022 * math.sin(math.pi * 1.6 * w) * w
            row.append(p)
        rows.append(row)
    G.grid(rows, 'Pennant', None, True)
    # Twin exhaust tips through the transom, a skeg and a rudder below
    for x in (0.42, -0.42):
        ft = F0 - BULGE * (1 - (x / B0) ** 2)
        cyl(G, P(x, ft + 0.03, 0.17), P(x, F_STERN + 0.005, 0.17), 0.032, 'Chrome', 16 if q else 6, False)
        cyl(G, P(x, ft + 0.03, 0.17), P(x, F_STERN + 0.004, 0.17), 0.024, 'Floor', 12 if q else 5)
    box(G, P(0, -1.75, KEEL - 0.025), (0.03, 0.9, 0.07), 'BottomPaint')
    box(G, P(0, -2.25, KEEL - 0.04), (0.012, 0.14, 0.12), 'Chrome', chamfer=0.003 if q else 0)


# ---------------------------------------------------------------- contract nodes
def empty(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.08
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def contract_nodes():
    wheel = empty('SteeringWheel', HUB, rot=(TILT, 0, 0))
    spin = empty('WheelSpin', parent=wheel)
    grips = [empty('Grip_L', (RIM, 0, 0), spin), empty('Grip_R', (-RIM, 0, 0), spin)]
    seats = [empty('DriverSeat', P(-0.52, HIPS_FRONT, ZF))]
    rows = [(x, HIPS_FRONT) for x in (-0.52, 0, 0.52)] + [(x, HIPS_REAR) for x in (-0.52, 0, 0.52)]
    for i, (x, f) in enumerate(rows):
        seats.append(empty(f'Seat_{i}', P(x, f, ZF)))
    return wheel, spin, grips, seats


def build(q, materials, spin, suffix=''):
    G = Geo()
    for part in (build_hull, build_decks, build_cockpit, build_seats, build_helm, build_windshield, build_hardware):
        before = G.tris()
        part(G, q)
        print(f'  {part.__name__}: {G.tris() - before} triangles', flush=True)
    hull = finalize(G, 'Runabout' + suffix, materials)
    rim = finalize(build_wheel(q), 'WheelRim' + suffix, materials)
    rim.parent = spin
    return hull, rim


def triangles(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def drop_unused_slots(ob):
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.material_slot_remove_unused()
    ob.select_set(False)


# ---------------------------------------------------------------- preview scene
def look(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()


def stage():
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Lake sky')
    scene.world = world
    nt = world.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    cr = nt.nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].position = 0.45
    cr.color_ramp.elements[0].color = (0.62, 0.68, 0.70, 1)
    cr.color_ramp.elements[1].position = 0.9
    cr.color_ramp.elements[1].color = (0.20, 0.36, 0.58, 1)
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -1
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], cr.inputs['Fac'])
    nt.links.new(cr.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.1
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(3)
    sun.name = 'Sun'
    scene.collection.objects.link(sun)
    for name, loc, energy, size in (('Softbox', (-3, 1, 9), 1100, 6),):
        lamp = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        lamp.data.energy = energy
        lamp.data.size = size
        lamp.location = loc
        look(lamp, (0, 0, 0.3))
        scene.collection.objects.link(lamp)
    water = bpy.data.materials.new('Lake water')
    p = water.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.015, 0.05, 0.06, 1)
    p.inputs['Roughness'].default_value = 0.07
    p.inputs['IOR'].default_value = 1.33
    nt = water.node_tree
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.4
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.04
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    me = bpy.data.meshes.new('Lake')
    me.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
    me.materials.append(water)
    lake = bpy.data.objects.new('Lake', me)
    scene.collection.objects.link(lake)
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = 'GPU'
    except Exception as e:
        print('GPU unavailable, using CPU:', e)
    scene.cycles.samples = 24 if QUICK else 160
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = (700, 400) if QUICK else (1400, 800)
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    return cam, sun


def render(cam, sun, loc, target, lens, path):
    """Key light from over the camera's left shoulder, so the sun's glint stays out of frame."""
    cam.location = loc
    look(cam, target)
    d = Vector(target) - Vector(loc)
    d.z = 0
    frm = Matrix.Rotation(math.radians(40), 3, 'Z') @ -d.normalized()
    el = math.radians(52)
    frm = frm * math.cos(el) + Z * math.sin(el)
    sun.rotation_euler = (-frm).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    scene = bpy.context.scene
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print('rendered', path, flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = make_materials()
    wheel, spin, grips, seats = contract_nodes()
    hull, rim = build(1, materials, spin)
    print('detailed triangles', triangles(hull) + triangles(rim), flush=True)
    cam, sun = stage()
    preview_culling(materials, True)
    OUT_RENDER.mkdir(parents=True, exist_ok=True)
    if os.environ.get('RUNABOUT_RENDER', '1') == '1':
        render(cam, sun, P(-5.4, 7.6, 3.2), P(0, 0.5, 0.35), 45, OUT_RENDER / 'runabout-blender.png')
        render(cam, sun, P(-2.4, -0.25, 3.0), P(0.1, 0.3, 0.35), 28, OUT_RENDER / 'runabout-blender-cockpit.png')
    for extra in os.environ.get('RUNABOUT_VIEWS', '').split(';'):
        if extra:
            name, x, f, z, tx, tf, tz, lens = extra.split(',')
            render(cam, sun, P(float(x), float(f), float(z)), P(float(tx), float(tf), float(tz)), float(lens),
                   Path(os.environ['RUNABOUT_VIEW_DIR']) / f'{name}.png')
    preview_culling(materials, False)
    # LOD: lower-resolution lines without tufting, buttons or gauge glass, then decimated to budget.
    hull_lod, rim_lod = build(0, materials, spin, '_LOD')
    budget = 7400 - triangles(rim_lod)
    if triangles(hull_lod) > budget:
        mod = hull_lod.modifiers.new('Decimate', 'DECIMATE')
        mod.ratio = budget / triangles(hull_lod) * 0.98
        bpy.context.view_layer.objects.active = hull_lod
        bpy.ops.object.modifier_apply(modifier=mod.name)
    print('LOD triangles', triangles(hull_lod) + triangles(rim_lod), flush=True)
    for ob in (hull, rim, hull_lod, rim_lod):
        drop_unused_slots(ob)
    for ob in (hull_lod, rim_lod):
        ob.hide_render = True
    (BASE / 'assets/blender').mkdir(parents=True, exist_ok=True)
    OUT = BASE / 'assets/house-source'
    OUT.mkdir(parents=True, exist_ok=True)
    nodes = [wheel, spin, *grips, *seats]
    for name, meshes in (('Lake_Runabout', (hull, rim)), ('Lake_Runabout_LOD', (hull_lod, rim_lod))):
        bpy.ops.object.select_all(action='DESELECT')
        for ob in (*meshes, *nodes):
            ob.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.export_scene.gltf(filepath=str(OUT / f'{name}.glb'), export_format='GLB', use_selection=True,
                                  export_apply=True, export_animations=False, export_cameras=False,
                                  export_lights=False, export_extras=False, export_yup=True)
        print('exported', name, flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BASE / 'assets/blender/Runabout.blend'), compress=True)
    print('saved Runabout.blend', flush=True)


main()
