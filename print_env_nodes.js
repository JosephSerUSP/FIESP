const fs = require('fs');
const path = require('path');

function parseGLB(filePath) {
  const data = fs.readFileSync(filePath);
  const jsonLength = data.readUInt32LE(12);
  const jsonChunk = data.slice(20, 20 + jsonLength);
  return JSON.parse(jsonChunk.toString('utf8'));
}

const envJson = parseGLB(path.join(__dirname, 'assets', 'FiespEnv.glb'));
console.log('=== FiespEnv.glb Nodes ===');
envJson.nodes.forEach((node, index) => {
  if (node.scale || node.translation || node.name.toLowerCase().includes('screen') || node.name.toLowerCase().includes('fiesp')) {
    console.log(`Node [${index}]: name="${node.name}"`, 
                node.translation ? `translation=[${node.translation.map(n => n.toFixed(6)).join(', ')}]` : '', 
                node.scale ? `scale=[${node.scale.map(n => n.toFixed(6)).join(', ')}]` : '',
                node.mesh !== undefined ? `mesh=${node.mesh}` : '');
  }
});
