import trimesh
import numpy as np

scene = trimesh.load('assets/Fiesp.glb', force='scene')
mesh = None
for name, geom in scene.geometry.items():
    if 'Screen' in name or 'Painel' in name or 'LED' in name or 'Fiesp' in name:
        mesh = geom
        break
if mesh is None: mesh = list(scene.geometry.values())[0]

verts = mesh.vertices
min_y = np.min(verts[:, 1])
max_y = np.max(verts[:, 1])

min_idx = np.argmin(verts[:, 1])
max_idx = np.argmax(verts[:, 1])

print(f"Top of building (Y={max_y:.2f}), Vertex {max_idx}:")
for ch_name, ch_data in mesh.visual.uv_by_name.items():
    print(f"  {ch_name}: {ch_data[max_idx][0]:.3f}, {ch_data[max_idx][1]:.3f}")
    
print(f"Bottom of building (Y={min_y:.2f}), Vertex {min_idx}:")
for ch_name, ch_data in mesh.visual.uv_by_name.items():
    print(f"  {ch_name}: {ch_data[min_idx][0]:.3f}, {ch_data[min_idx][1]:.3f}")

print("\nMax V values:")
for ch_name, ch_data in mesh.visual.uv_by_name.items():
    print(f"  {ch_name}: {np.max(ch_data[:, 1]):.3f}")
