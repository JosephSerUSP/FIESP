const fs = require('fs');
const path = require('path');

function parseGLB(filePath) {
  const data = fs.readFileSync(filePath);
  const jsonLength = data.readUInt32LE(12);
  const jsonChunk = data.slice(20, 20 + jsonLength);
  return JSON.parse(jsonChunk.toString('utf8'));
}

const json = parseGLB(path.join(__dirname, 'assets', 'FiespScreen.glb'));

console.log('--- Accessors ---');
json.accessors.forEach((acc, idx) => {
  console.log(`Accessor [${idx}]: bufferView=${acc.bufferView}, count=${acc.count}, type=${acc.type}, componentType=${acc.componentType}`);
});

console.log('--- Primitives ---');
const prim = json.meshes[0].primitives[0];
console.log('Attributes:', prim.attributes);
console.log('Indices accessor:', prim.indices);
