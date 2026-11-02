"""Connected garment surfaces with explicit armholes, UVs and canonical skinning."""
import math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


class Surface:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.uvs = []

    def point(self, xyz):
        self.vertices.append(tuple(xyz))
        return len(self.vertices) - 1

    def face(self, indices, uvs):
        self.faces.append(tuple(indices))
        self.uvs.append(uvs)

    def object(self, name, material):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        uv = mesh.uv_layers.new(name="FabricUV")
        for polygon, coordinates in zip(mesh.polygons, self.uvs):
            polygon.use_smooth = True
            for loop, coordinate in zip(polygon.loop_indices, coordinates):
                uv.data[loop].uv = coordinate
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(material)
        return obj


def knit_surface(material, profiles=None, front_gaps=None, name="Wardrobe_Top_WeekendKnit"):
    # Reference-specific torso profiles (z, half width, front depth, back depth).
    # Shoulder holes share their edge vertices with the sleeve surface.
    profiles = profiles or [
        (.99, .190, .155, .145), (1.005, .194, .156, .146),
        (1.035, .195, .158, .148), (1.10, .185, .150, .140),
        (1.24, .205, .168, .145), (1.37, .219, .177, .145),
        (1.43, .227, .174, .145), (1.48, .233, .158, .140),
        (1.52, .228, .130, .123), (1.555, .080, .069, .065),
        (1.575, .077, .067, .063),
    ]
    surface = Surface()
    count = 48
    rings = []
    low, high = 5, 8
    holes = [(8, 16), (32, 40)]
    for z, width, front, back in profiles:
        ring = []
        for j in range(count):
            gap = front_gaps[len(rings)] if front_gaps else 0
            angle = (gap + j*(math.tau-2*gap)/(count-1)) if front_gaps else j*math.tau/count
            cosine, sine = math.cos(angle), math.sin(angle)
            depth = front if cosine >= 0 else back
            fold = .0015 * math.sin(angle * 7 + z * 31) if z < 1.40 else 0
            ring.append(surface.point((sine * (width + fold), .045 - cosine * (depth + fold), z)))
        rings.append(ring)
    for level in range(len(rings) - 1):
        for j in range(count):
            if front_gaps and j == count-1:
                continue
            if low <= level < high and any(a <= j < b for a, b in holes):
                continue
            n = (j + 1) % count
            u, un = j / count * 4.5, (j + 1) / count * 4.5
            v, vn = profiles[level][0] / .24, profiles[level + 1][0] / .24
            surface.face((rings[level][j], rings[level][n], rings[level + 1][n], rings[level + 1][j]),
                         [(u, v), (un, v), (un, vn), (u, vn)])
    for side, (a, b) in zip([1, -1], holes):
        border = ([rings[low][j] for j in range(a, b + 1)]
                  + [rings[k][b] for k in range(low + 1, high + 1)]
                  + [rings[high][j] for j in range(b - 1, a - 1, -1)]
                  + [rings[k][a] for k in range(high - 1, low, -1)])
        angles = [math.atan2(surface.vertices[i][2] - 1.4555,
                             surface.vertices[i][1] - .0654) for i in border]
        previous = border
        sleeve = [(.29, .078), (.37, .071), (.435, .068), (.448, .071),
                  (.46, .065), (.474, .070), (.50, .062), (.57, .057),
                  (.65, .052), (.684, .050), (.69, .048), (.710, .047)]
        for level, (x, radius) in enumerate(sleeve):
            cy = .0654 + .006 * math.sin((x - .21) * math.pi / .5)
            current = [surface.point((side * x, cy + math.cos(angle) * radius,
                                      1.4555 + math.sin(angle) * radius)) for angle in angles]
            for j in range(len(border)):
                n = (j + 1) % len(border)
                u, un = j / len(border) * 1.85, (j + 1) / len(border) * 1.85
                v = (sleeve[level - 1][0] if level else .22) / .24
                vn = x / .24
                surface.face((previous[j], previous[n], current[n], current[j]),
                             [(u, v), (un, v), (un, vn), (u, vn)])
            previous = current
    return surface.object(name, material)


def rib_band(name, profiles, material, axis="z", side=1, center=(0, .045, 0)):
    """Close-spaced ribs live in geometry, retaining their reading at game distance."""
    surface = Surface()
    rings, count = [], 96
    for distance, rx, ry in profiles:
        ring=[]
        for j in range(count):
            angle=j*math.tau/count
            ridge=.0008*math.cos(angle*48)
            a,b=(rx+ridge)*math.sin(angle),(ry+ridge)*math.cos(angle)
            point=(a+center[0],center[1]-b,distance) if axis=="z" else (
                side*distance,center[1]+a,center[2]+b)
            ring.append(surface.point(point))
        rings.append(ring)
    for k in range(len(rings)-1):
        for j in range(count):
            n=(j+1)%count
            u,un=j/count*1.5,(j+1)/count*1.5
            v,vn=k*.12,(k+1)*.12
            surface.face((rings[k][j],rings[k][n],rings[k+1][n],rings[k+1][j]),
                         [(u,v),(un,v),(un,vn),(u,vn)])
    obj=surface.object(name,material)
    bpy.context.view_layer.objects.active=obj
    shell=obj.modifiers.new("Rib band bound edge","SOLIDIFY")
    shell.thickness=.002
    bpy.ops.object.modifier_apply(modifier=shell.name)
    return obj


def finish_garment(obj, thickness=.003):
    bpy.context.view_layer.objects.active = obj
    subdivision = obj.modifiers.new("Authored smooth garment cage", "SUBSURF")
    subdivision.levels = 1
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    shell = obj.modifiers.new("Real hems and garment thickness", "SOLIDIFY")
    shell.thickness = thickness
    shell.offset = 0
    shell.use_even_offset = True
    bpy.ops.object.modifier_apply(modifier=shell.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def reduce_garment(obj,ratio=.4):
    """Keep the fitted subdivision silhouette, then reduce the exported skin."""
    bpy.context.view_layer.objects.active=obj
    modifier=obj.modifiers.new("Mobile garment surface reduction","DECIMATE")
    modifier.ratio=ratio
    modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def bind_surface(obj, body, rig):
    """Transfer interpolated source-surface weights, bounded to four influences."""
    body.data.calc_loop_triangles()
    triangles = [tuple(t.vertices) for t in body.data.loop_triangles]
    positions = [v.co.copy() for v in body.data.vertices]
    tree = BVHTree.FromPolygons(positions, triangles, all_triangles=True)
    groups = {g.index: g.name for g in body.vertex_groups}
    target = {name: obj.vertex_groups.new(name=name) for name in groups.values()}
    for vertex in obj.data.vertices:
        point, _, index, _ = tree.find_nearest(vertex.co)
        if index is None:
            raise RuntimeError("Garment has no source skin surface")
        indices = triangles[index]
        a, b, c = [positions[i] for i in indices]
        ab, ac, ap = b - a, c - a, point - a
        denominator = ab.dot(ab) * ac.dot(ac) - ab.dot(ac) ** 2
        if abs(denominator) < 1e-15:
            factors = [1, 0, 0]
        else:
            v = (ac.dot(ac) * ap.dot(ab) - ab.dot(ac) * ap.dot(ac)) / denominator
            w = (ab.dot(ab) * ap.dot(ac) - ab.dot(ac) * ap.dot(ab)) / denominator
            factors = [1 - v - w, v, w]
        weights = {}
        for source_index, factor in zip(indices, factors):
            for group in body.data.vertices[source_index].groups:
                name = groups[group.group]
                if name not in rig.data.bones:
                    raise RuntimeError(f"Unknown garment bone {name}")
                weights[name] = weights.get(name, 0) + max(0, factor) * group.weight
        values = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(weight for _, weight in values)
        if total < .0001:
            raise RuntimeError("Unweighted garment vertex")
        for name, weight in values:
            if weight > 0:
                target[name].add([vertex.index], weight / total, "REPLACE")
    obj.parent = rig
    modifier = obj.modifiers.new("Canonical actor skin", "ARMATURE")
    modifier.object = rig
