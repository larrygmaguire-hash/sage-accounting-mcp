#!/usr/bin/env node
/**
 * Sage OAuth Helper
 *
 * This script starts a local server to capture the OAuth callback,
 * then exchanges the code for tokens automatically.
 *
 * Usage:
 *   SAGE_CLIENT_ID=your_id SAGE_CLIENT_SECRET=your_secret node oauth-helper.cjs
 *
 * Or create a .env file with:
 *   SAGE_CLIENT_ID=your_client_id
 *   SAGE_CLIENT_SECRET=your_client_secret
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// Load .env file if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// Get credentials from environment
const CLIENT_ID = process.env.SAGE_CLIENT_ID;
const CLIENT_SECRET = process.env.SAGE_CLIENT_SECRET;
const REDIRECT_URI = process.env.SAGE_REDIRECT_URI || 'http://localhost:3000/callback';
const PORT = parseInt(process.env.SAGE_PORT || '3000', 10);
const COUNTRY = process.env.SAGE_COUNTRY || 'ie';

// Validate required credentials
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n=== Sage OAuth Helper ===\n');
  console.error('Error: Missing required credentials.\n');
  console.error('Please provide SAGE_CLIENT_ID and SAGE_CLIENT_SECRET either:');
  console.error('  1. As environment variables:');
  console.error('     SAGE_CLIENT_ID=your_id SAGE_CLIENT_SECRET=your_secret node oauth-helper.cjs\n');
  console.error('  2. In a .env file in this directory:');
  console.error('     SAGE_CLIENT_ID=your_client_id');
  console.error('     SAGE_CLIENT_SECRET=your_client_secret\n');
  process.exit(1);
}

// Build auth URL
const authUrl = `https://www.sageone.com/oauth2/auth/central?filter=apiv3.1&response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=full_access&state=sage_auth&country=${COUNTRY}`;

console.log('\n=== Sage OAuth Helper ===\n');
console.log('Starting local server on port', PORT);
console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\n(Or copy and paste it)\n');
console.log('Waiting for callback...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      console.log('Error:', error);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error</h1><p>${error}</p>`);
      server.close();
      return;
    }

    if (code) {
      console.log('Got authorization code:', code.substring(0, 20) + '...');
      console.log('\nExchanging for tokens...\n');

      // Exchange code for tokens
      const tokenData = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      });

      const tokenReq = https.request('https://oauth.accounting.sage.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      }, (tokenRes) => {
        let data = '';
        tokenRes.on('data', chunk => data += chunk);
        tokenRes.on('end', () => {
          try {
            const tokens = JSON.parse(data);

            if (tokens.access_token) {
              console.log('=== SUCCESS! ===\n');
              console.log('Access Token:');
              console.log(tokens.access_token);
              console.log('\nRefresh Token:');
              console.log(tokens.refresh_token);
              console.log('\nExpires in:', tokens.expires_in, 'seconds');
              console.log('Refresh token expires in:', tokens.refresh_token_expires_in, 'seconds');
              console.log('\n=== Copy these tokens to configure the MCP ===\n');

              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                <head><title>Sage OAuth Success</title></head>
                <body style="font-family: system-ui; padding: 40px; max-width: 800px; margin: 0 auto;">
                  <h1 style="color: green;">Success!</h1>
                  <p>Tokens have been printed to the terminal. You can close this window.</p>
                  <h3>Access Token:</h3>
                  <textarea style="width: 100%; height: 100px; font-family: monospace; font-size: 12px;">${tokens.access_token}</textarea>
                  <h3>Refresh Token:</h3>
                  <textarea style="width: 100%; height: 100px; font-family: monospace; font-size: 12px;">${tokens.refresh_token}</textarea>
                </body>
                </html>
              `);
            } else {
              console.log('Token exchange failed:', data);
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`<h1>Token Exchange Failed</h1><pre>${data}</pre>`);
            }
          } catch (e) {
            console.log('Parse error:', e.message);
            console.log('Raw response:', data);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Error</h1><pre>${data}</pre>`);
          }

          server.close();
        });
      });

      tokenReq.on('error', (e) => {
        console.log('Request error:', e.message);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>Error</h1><p>${e.message}</p>`);
        server.close();
      });

      tokenReq.write(tokenData.toString());
      tokenReq.end();
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  // Try to open browser automatically
  const { exec } = require('child_process');
  exec(`open "${authUrl}"`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use. Please close other applications using this port.`);
  } else {
    console.log('Server error:', e.message);
  }
  process.exit(1);
});
