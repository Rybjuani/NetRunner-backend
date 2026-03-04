#!/usr/bin/env node
// doctor.js - Diagnóstico de entorno NetRunner
const net = require('net');
const http = require('http');
const { execSync } = require('child_process');

const GREEN = '\x1b[32m✔\x1b[0m';
const RED = '\x1b[31m✖\x1b[0m';

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, '127.0.0.1');
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

function checkHeaders() {
  return new Promise((resolve) => {
    http.get('http://localhost:8080', (res) => {
      const coop = res.headers['cross-origin-opener-policy'];
      const coep = res.headers['cross-origin-embedder-policy'];
      resolve({ coop, coep });
    }).on('error', () => resolve({ coop: null, coep: null }));
  });
}

function checkNodeVersion() {
  try {
    const version = execSync('node -v').toString().trim();
    return version;
  } catch {
    return null;
  }
}

(async () => {
  console.log('--- NetRunner Doctor ---');

  // Puerto 8080
  const portOk = await checkPort(8080);
  console.log(`${portOk ? GREEN : RED} Puerto 8080 disponible`);

  // Headers COOP/COEP
  const { coop, coep } = await checkHeaders();
  console.log(`${coop === 'same-origin' ? GREEN : RED} Header COOP: ${coop || 'No detectado'}`);
  console.log(`${coep === 'require-corp' ? GREEN : RED} Header COEP: ${coep || 'No detectado'}`);

  // Node.js
  const nodeVersion = checkNodeVersion();
  console.log(`${nodeVersion ? GREEN : RED} Node.js: ${nodeVersion || 'No detectado'}`);

  // Resumen
  if (portOk && coop === 'same-origin' && coep === 'require-corp' && nodeVersion) {
    console.log(GREEN + ' Entorno NetRunner operativo');
  } else {
    console.log(RED + ' Entorno NetRunner incompleto');
  }
})();
