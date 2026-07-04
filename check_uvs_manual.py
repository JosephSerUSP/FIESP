import json
import struct

def parse_glb(filepath):
    with open(filepath, 'rb') as f:
        magic, version, length = struct.unpack('<III', f.read(12))
        chunk_len, chunk_type = struct.unpack('<II', f.read(8))
        json_data = json.loads(f.read(chunk_len).decode('utf-8'))
        
        chunk_len, chunk_type = struct.unpack('<II', f.read(8))
        bin_data = f.read(chunk_len)
        
    return json_data, bin_data

def get_buffer_view(json_data, bin_data, view_idx):
    view = json_data['bufferViews'][view_idx]
    start = view.get('byteOffset', 0)
    length = view['byteLength']
    return bin_data[start:start+length]

def get_accessor_data(json_data, bin_data, acc_idx):
    acc = json_data['accessors'][acc_idx]
    view_data = get_buffer_view(json_data, bin_data, acc['bufferView'])
    offset = acc.get('byteOffset', 0)
    count = acc['count']
    
    # Float32 is 5126
    if acc['componentType'] != 5126: return None
    
    if acc['type'] == 'VEC3':
        fmt = f'<{count*3}f'
        data = struct.unpack(fmt, view_data[offset:offset+count*3*4])
        return [data[i:i+3] for i in range(0, count*3, 3)]
    elif acc['type'] == 'VEC2':
        fmt = f'<{count*2}f'
        data = struct.unpack(fmt, view_data[offset:offset+count*2*4])
        return [data[i:i+2] for i in range(0, count*2, 2)]
    return None

json_data, bin_data = parse_glb('assets/Fiesp.glb')
mesh = json_data['meshes'][0]
prim = mesh['primitives'][0]

pos_data = get_accessor_data(json_data, bin_data, prim['attributes']['POSITION'])
uv0_data = get_accessor_data(json_data, bin_data, prim['attributes']['TEXCOORD_0'])
uv1_data = get_accessor_data(json_data, bin_data, prim['attributes'].get('TEXCOORD_1', 0)) if 'TEXCOORD_1' in prim['attributes'] else None
uv2_data = get_accessor_data(json_data, bin_data, prim['attributes'].get('TEXCOORD_2', 0)) if 'TEXCOORD_2' in prim['attributes'] else None

max_y = -float('inf')
min_y = float('inf')
max_idx = -1
min_idx = -1

for i, p in enumerate(pos_data):
    if p[1] > max_y: max_y, max_idx = p[1], i
    if p[1] < min_y: min_y, min_idx = p[1], i

print(f"Top of building (Y={max_y:.2f}), Vertex {max_idx}:")
print(f"  uv0: {uv0_data[max_idx][0]:.3f}, {uv0_data[max_idx][1]:.3f}")
if uv1_data: print(f"  uv1: {uv1_data[max_idx][0]:.3f}, {uv1_data[max_idx][1]:.3f}")
if uv2_data: print(f"  uv2: {uv2_data[max_idx][0]:.3f}, {uv2_data[max_idx][1]:.3f}")

print(f"Bottom of building (Y={min_y:.2f}), Vertex {min_idx}:")
print(f"  uv0: {uv0_data[min_idx][0]:.3f}, {uv0_data[min_idx][1]:.3f}")
if uv1_data: print(f"  uv1: {uv1_data[min_idx][0]:.3f}, {uv1_data[min_idx][1]:.3f}")
if uv2_data: print(f"  uv2: {uv2_data[min_idx][0]:.3f}, {uv2_data[min_idx][1]:.3f}")

def print_max_v(name, data):
    if data:
        max_v = max(v[1] for v in data)
        print(f"  {name}: {max_v:.3f}")

print("\nMax V values:")
print_max_v("uv0", uv0_data)
print_max_v("uv1", uv1_data)
print_max_v("uv2", uv2_data)
