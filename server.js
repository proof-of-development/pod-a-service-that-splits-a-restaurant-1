'use strict';

const http = require('http');

const PORT = 3000;
const HOST = '0.0.0.0';
const MAX_PEOPLE = 1000;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

// Parses a money amount into integer cents, or returns null if invalid.
function parseTotalCents(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const m = /^(\d*)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = m[1];
  const frac = m[2] || '';
  if (whole === '' && frac === '') return null;
  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  return cents;
}

// Parses a whole number of people in [1, MAX_PEOPLE], or returns null.
function parsePeople(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_PEOPLE) return null;
  return n;
}

function splitCents(totalCents, people) {
  const base = Math.floor(totalCents / people);
  const remainder = totalCents - base * people;
  const shares = new Array(people);
  for (let i = 0; i < people; i++) {
    const cents = base + (i < remainder ? 1 : 0);
    shares[i] = cents / 100;
  }
  return shares;
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    sendJson(res, 400, { error: 'Malformed request URL' });
    return;
  }

  if (url.pathname !== '/split') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const params = url.searchParams;
  const rawTotal = params.get('total');
  const rawPeople = params.get('people');

  if (rawTotal === null || rawTotal.trim() === '') {
    sendJson(res, 400, { error: 'Missing required parameter: total' });
    return;
  }
  if (rawPeople === null || rawPeople.trim() === '') {
    sendJson(res, 400, { error: 'Missing required parameter: people' });
    return;
  }

  const totalCents = parseTotalCents(rawTotal);
  if (totalCents === null) {
    sendJson(res, 400, {
      error: 'Invalid total: must be a non-negative amount with at most two decimal places',
    });
    return;
  }

  const people = parsePeople(rawPeople);
  if (people === null) {
    sendJson(res, 400, {
      error: `Invalid people: must be a whole number from 1 to ${MAX_PEOPLE}`,
    });
    return;
  }

  const shares = splitCents(totalCents, people);
  sendJson(res, 200, {
    total: totalCents / 100,
    people,
    shares,
  });
});

server.on('clientError', (err, socket) => {
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  } else {
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Bill splitter listening on http://${HOST}:${PORT}`);
});
