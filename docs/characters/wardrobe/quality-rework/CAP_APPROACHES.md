# Cap construction reset

Priority: believable cloth shape and head fit; retain the game's stylised shading.
The previous cap is rejected. Its primitive-like crown, wide visor attachment and
surface seams do not meet the selected reference. Added detail did not repair it.

| Method | Strength | Main risk | Decision |
| --- | --- | --- | --- |
| Licensed scanned/artist-authored cap, retargeted | Real construction already present | No suitable inspected source; adapting can distort crown | Keep as fallback; inspected downloads rejected |
| Sew six flat cloth patterns in Blender | Physical seams and natural ease | Pattern drafting and simulation introduce another fit variable | Useful for final cloth relaxation, expensive as the starting point |
| Derive a cage from the approved scalp, retopologize as six panels | Exact anatomical envelope; controlled clearance | Must add cloth ease so it does not become a painted skullcap | Selected starting construction |
| Sculpt a cap over a head duplicate, then retopologize | Strong artistic control over folds and silhouette | Slow, easy to lose the intended construction | Use for local silhouette adjustments after fit is established |
| Parametric Bezier/NURBS crown with separately curved visor | Fast repeatable construction | Already produced a generic rigid dome and poor attachment | Rejected for this rebuild |

Selected path: approved scalp-derived cage, six cloth panel regions, a narrow
finished lower band, and a separate curved visor with a physically plausible
sewn root. Establish the silhouette without stitches first. Check eye clearance,
ears, occipital fit and hair compression from front/side/back. Only then add
restrained surface detail. Inspect the actual exported mesh at matching views.

Source head, skeleton and animations remain unchanged. A new experimental source
is kept separately from the rejected cap and the runtime installation.
