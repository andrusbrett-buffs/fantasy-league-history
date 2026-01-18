/**
 * Simple proxy server for ESPN Fantasy Football API
 * Handles CORS and cookie authentication for private leagues
 *
 * Usage: node server.js
 * Then open http://localhost:3000 in your browser
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

// MIME types for serving static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

/**
 * Serve static files from the current directory
 */
function serveStaticFile(req, res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + err.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(content);
        }
    });
}

/**
 * Proxy requests to ESPN API
 */
function proxyESPNRequest(req, res, targetUrl, espnS2, swid) {
    const parsedUrl = new URL(targetUrl);

    const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
    };

    // Add cookies for private league access
    if (espnS2 || swid) {
        const cookies = [];
        if (espnS2) cookies.push(`espn_s2=${espnS2}`);
        if (swid) cookies.push(`SWID=${swid}`);
        options.headers['Cookie'] = cookies.join('; ');
    }

    const proxyReq = https.request(options, (proxyRes) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        res.writeHead(proxyRes.statusCode);

        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy request error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    });

    proxyReq.end();
}

/**
 * Main request handler
 */
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204);
        res.end();
        return;
    }

    // API proxy endpoint
    if (pathname === '/api/espn') {
        const targetUrl = parsedUrl.query.url;
        const espnS2 = parsedUrl.query.espn_s2;
        const swid = parsedUrl.query.swid;

        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
        }

        console.log(`Proxying request to: ${targetUrl}`);
        proxyESPNRequest(req, res, targetUrl, espnS2, swid);
        return;
    }

    // Serve static files
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    serveStaticFile(req, res, filePath);
});

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║     Fantasy Football League History Server                ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Server running at: http://localhost:${PORT}                 ║
║                                                           ║
║  Open this URL in your browser to access the site.        ║
║                                                           ║
║  Press Ctrl+C to stop the server.                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
});
