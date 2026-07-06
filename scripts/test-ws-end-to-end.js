// scripts/test-ws-end-to-end.js
// Test del WebSocket: abre una conexión WS, dispara una notificación via HTTP,
// y verifica que llegue el mensaje.

const http = require('http');
const WebSocket = require('ws');

const BASE = 'http://localhost:5000';
const WS_URL = 'ws://localhost:5000/ws';

function request(method, path, body, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        const newCookies = setCookie ? setCookie.map((c) => c.split(';')[0]).join('; ') : cookies;
        let parsed;
        try { parsed = JSON.parse(data); }
        catch { parsed = data; }
        resolve({ status: res.statusCode, cookies: newCookies, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== 1. Login admin ===');
  const login = await request('POST', '/auth/login', {
    login: 'admin@vuela.com', password: 'Admin123!', scope: 'operacion',
  });
  console.log('Status:', login.status, '| Token?', typeof login.body?.token);
  if (!login.body?.token) {
    console.log('NO HAY TOKEN EN EL BODY DEL LOGIN. El backend no lo está enviando.');
    process.exit(1);
  }
  const token = login.body.token;
  const cookies = login.cookies;
  const me = await request('GET', '/auth/session', null, cookies);
  const companyId = me.body?.companyId;
  console.log('companyId:', companyId);

  console.log('\n=== 2. Conectar WebSocket ===');
  await new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    let received = null;
    const timeout = setTimeout(() => {
      if (!received) {
        console.log('TIMEOUT: no llegó ninguna notificación en 8s');
        ws.close();
        resolve(null);
      }
    }, 8000);

    ws.on('open', () => {
      console.log('[WS] conectado OK');
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log('[WS] mensaje recibido:', JSON.stringify(msg).slice(0, 200));
      if (msg.type === 'hello') {
        console.log('[WS] hello OK');
        // Disparar la notif después del hello
        console.log('\n=== 3. Disparar notif via POST /maintenances ===');
        request('GET', `/company/${companyId}/assets?pageSize=1`, null, cookies).then((a) => {
          const asset = a.body?.data?.[0];
          const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
          return request('POST', `/company/${companyId}/maintenances`, {
            assetId: asset.id,
            title: 'WS TEST ' + Date.now(),
            type: 'Correctivo',
            status: 'Programado',
            scheduledFor: tomorrow.toISOString(),
          }, cookies);
        }).then((r) => {
          console.log('[HTTP] crear mantenimiento:', r.status);
        });
      }
      if (msg.type === 'notification') {
        clearTimeout(timeout);
        received = msg;
        console.log('[WS] ✅ NOTIFICACIÓN RECIBIDA:', msg.data.title);
        ws.close();
        resolve(received);
      }
    });
    ws.on('error', (err) => {
      console.log('[WS] error:', err.message);
      clearTimeout(timeout);
      resolve(null);
    });
    ws.on('close', (code, reason) => {
      console.log('[WS] cerrado:', code, reason.toString());
      if (!received) resolve(null);
    });
  });
}

main().catch((err) => { console.error('ERROR:', err); process.exit(1); });