const fs = require('fs');
// Mock global variables for THREE to load GLTFLoader without DOM
global.window = global;
global.document = { createElement: () => ({ style: {} }) };
global.self = global;

const THREE = require('three');
require('three/examples/jsm/loaders/GLTFLoader.js');

const buffer = fs.readFileSync('assets/Fiesp.glb');
const toArrayBuffer = (buf) => {
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
};

const loader = new THREE.GLTFLoader();
loader.parse(toArrayBuffer(buffer), '', (gltf) => {
    let screenMesh = null;
    gltf.scene.traverse((child) => {
        if (child.isMesh && (child.name.includes('Painel') || child.name.includes('Fiesp'))) {
            screenMesh = child;
        }
    });

    if (!screenMesh) {
        console.log("No mesh found");
        return;
    }

    const pos = screenMesh.geometry.attributes.position;
    const uv0 = screenMesh.geometry.attributes.uv;
    const uv1 = screenMesh.geometry.attributes.uv1;
    const uv2 = screenMesh.geometry.attributes.uv2;

    // Find the vertices with the highest Y and lowest Y
    let maxY = -Infinity, minY = Infinity;
    let maxYIdx = -1, minYIdx = -1;

    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y > maxY) { maxY = y; maxYIdx = i; }
        if (y < minY) { minY = y; minYIdx = i; }
    }

    console.log(`Top of building (Y=${maxY.toFixed(2)}), Vertex ${maxYIdx}:`);
    if (uv0) console.log(`  uv0: ${uv0.getX(maxYIdx).toFixed(3)}, ${uv0.getY(maxYIdx).toFixed(3)}`);
    if (uv1) console.log(`  uv1: ${uv1.getX(maxYIdx).toFixed(3)}, ${uv1.getY(maxYIdx).toFixed(3)}`);
    if (uv2) console.log(`  uv2: ${uv2.getX(maxYIdx).toFixed(3)}, ${uv2.getY(maxYIdx).toFixed(3)}`);

    console.log(`Bottom of building (Y=${minY.toFixed(2)}), Vertex ${minYIdx}:`);
    if (uv0) console.log(`  uv0: ${uv0.getX(minYIdx).toFixed(3)}, ${uv0.getY(minYIdx).toFixed(3)}`);
    if (uv1) console.log(`  uv1: ${uv1.getX(minYIdx).toFixed(3)}, ${uv1.getY(minYIdx).toFixed(3)}`);
    if (uv2) console.log(`  uv2: ${uv2.getX(minYIdx).toFixed(3)}, ${uv2.getY(minYIdx).toFixed(3)}`);
    
    // Print max V for each channel
    const getMaxV = (attr) => {
        if (!attr) return 'N/A';
        let maxV = -Infinity;
        for (let i = 0; i < attr.count; i++) {
            if (attr.getY(i) > maxV) maxV = attr.getY(i);
        }
        return maxV.toFixed(3);
    };
    console.log(`Max V - uv0: ${getMaxV(uv0)}, uv1: ${getMaxV(uv1)}, uv2: ${getMaxV(uv2)}`);
});
