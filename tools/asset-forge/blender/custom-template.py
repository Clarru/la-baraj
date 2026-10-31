"""Write trusted geometry here. The tool owns materials, normalization, export and QA.

context.parts: box, beam, square_band, chain_link, bolt, extrude_z, ...
context.material: approved timber/iron atlas material
context.parameters: your asset.json parameters
context.joints: declared joint name -> three surface-depth probes in Blender coordinates
Declare every critical joined assembly in asset.json requiredJoints. The tool checks
the actual optimized GLB before a build, review or package can pass.
Author in metres with Blender +Z up. Return named socket positions in the same space.
The tool converts sockets and the GLB into +Y up, floor-centred game coordinates.
See tools/asset-forge/examples/workbench.py for a working recipe.
"""
def build(context):
    raise NotImplementedError('Implement the new asset geometry using context.parts and context.material')
