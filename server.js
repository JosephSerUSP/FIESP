const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const logPath = path.join(__dirname, 'browser_logs.txt');

// Reset log file on start
fs.writeFileSync(logPath, `=== Browser Logs Started at ${new Date().toISOString()} ===\n`);

http.createServer((req, res) => {
  const safeUrl = req.url.split('?')[0];

  // Route for logging from browser
  if (safeUrl === '/log' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const logLine = `[${payload.type.toUpperCase()}] ${payload.msg}\n`;
        fs.appendFileSync(logPath, logLine);
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('ok');
      } catch (err) {
        res.writeHead(400);
        res.end('bad json');
      }
    });
    return;
  }

  let filePath = path.join(__dirname, safeUrl === '/' ? 'index.html' : safeUrl);
  
  const ext = path.extname(filePath);
  let contentType = 'text/html';
  
  switch (ext) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.glb':
      contentType = 'model/gltf-binary';
      break;
    case '.gltf':
      contentType = 'model/gltf+json';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.jpg':
    case '.jpeg':
      contentType = 'image/jpeg';
      break;
    case '.ico':
      contentType = 'image/x-icon';
      break;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    }
  });
}).listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/`);
});
