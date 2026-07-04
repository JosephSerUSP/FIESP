import bpy
import json
import sys

filepath = "d:/Antigravity/FIESP/assets/FiespScreen.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=filepath)

obj = next((o for o in bpy.context.scene.objects if o.type == 'MESH'), None)
if not obj: sys.exit()

mesh = obj.data
uv_layer = mesh.uv_layers[2]

triangles = []
for poly in mesh.polygons:
    if len(poly.loop_indices) == 3:
        tri = []
        for loop_index in poly.loop_indices:
            uv = uv_layer.data[loop_index].uv
            tri.append({"u": round(uv.x, 5), "v": round(uv.y, 5)})
        triangles.append(tri)

with open('d:/Antigravity/FIESP/uv_triangles.json', 'w') as f:
    json.dump(triangles, f, indent=2)

print("Saved UV triangles to uv_triangles.json")
