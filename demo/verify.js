/**
 * MEIProxy Demo - 链路验证脚本
 * 验证模拟云端节点的 HTTP CONNECT 隧道、SOCKS5 握手/认证/转发是否正常。
 * 由于演示环境无法直连外网 HTTPS，使用本机 HTTP 端口作为隧道目标，
 * 通过隧道发送明文 HTTP 请求来证明「隧道字节转发」链路正确。
 *
 * 运行：node demo/verify.js
 */

'use strict';

const net = require('net');

const HTTP_PORT = parseInt(process.env.MEIDEMO_HTTP_PORT || '8899', 10);
const SOCKS_PORT = parseInt(process.env.MEIDEMO_SOCKS_PORT || '8898', 10);
const DEMO_USER = 'demo-user';
const DEMO_PASS = 'demo-pass';

let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name} ${extra ? '-> ' + extra : ''}`);
  }
}

function recvUntil(sock, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    sock.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const result = predicate(buffer);
      if (result) {
        clearTimeout(timer);
        resolve(buffer);
      }
    });
    sock.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    sock.on('close', () => {
      clearTimeout(timer);
      reject(new Error('socket closed'));
    });
  });
}

const GET_IP_REQUEST = 'GET /ip HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n';

// 测试 1: HTTP CONNECT 隧道（目标为本机 HTTP 端口，隧道内发明文 GET）
async function testHttpConnect() {
  console.log('\n[测试 1] HTTP CONNECT 隧道');
  const sock = net.connect(HTTP_PORT, '127.0.0.1');
  sock.write(`CONNECT 127.0.0.1:${HTTP_PORT} HTTP/1.1\r\nHost: 127.0.0.1:${HTTP_PORT}\r\n\r\n`);
  const resp = await recvUntil(sock, (buf) => buf.toString().includes('\r\n\r\n'));
  ok('CONNECT 返回 200 Connection Established', resp.toString().startsWith('HTTP/1.1 200'), resp.toString().split('\r\n')[0]);
  sock.write(GET_IP_REQUEST);
  const body = await recvUntil(sock, (buf) => buf.toString().includes('模拟出口'));
  ok('隧道内 GET /ip 返回代理出口 JSON', body.toString().includes('"ip"') && body.toString().includes('203.0.113.99'));
  sock.destroy();
}

// 测试 2: HTTP CONNECT 错误认证返回 407
async function testHttpConnectAuthFail() {
  console.log('\n[测试 2] HTTP CONNECT 错误认证');
  const sock = net.connect(HTTP_PORT, '127.0.0.1');
  const badAuth = Buffer.from('wrong:wrong').toString('base64');
  sock.write(`CONNECT 127.0.0.1:${HTTP_PORT} HTTP/1.1\r\nHost: 127.0.0.1\r\nProxy-Authorization: Basic ${badAuth}\r\n\r\n`);
  const resp = await recvUntil(sock, (buf) => buf.toString().includes('\r\n\r\n'));
  ok('错误凭据返回 407', resp.toString().startsWith('HTTP/1.1 407'), resp.toString().split('\r\n')[0]);
  sock.destroy();
}

// 测试 3: SOCKS5 无认证握手 + CONNECT
async function testSocks5NoAuth() {
  console.log('\n[测试 3] SOCKS5 无认证握手 + CONNECT');
  const sock = net.connect(SOCKS_PORT, '127.0.0.1');
  sock.write(Buffer.from([0x05, 0x01, 0x00]));
  const greeting = await recvUntil(sock, (buf) => buf.length >= 2);
  ok('握手回复 NO AUTH(0x00)', greeting[0] === 0x05 && greeting[1] === 0x00, JSON.stringify(greeting));

  const req = Buffer.alloc(10);
  req.writeUInt8(0x05, 0); req.writeUInt8(0x01, 1); req.writeUInt8(0x00, 2); req.writeUInt8(0x01, 3);
  req.writeUInt32BE(0x7f000001, 4); req.writeUInt16BE(HTTP_PORT, 8);
  sock.write(req);
  const ack = await recvUntil(sock, (buf) => buf.length >= 10);
  ok('CONNECT 回复成功(0x00)', ack[0] === 0x05 && ack[1] === 0x00, JSON.stringify(ack));

  sock.write(GET_IP_REQUEST);
  const body = await recvUntil(sock, (buf) => buf.toString().includes('模拟出口'));
  ok('SOCKS5 隧道内 GET /ip 成功', body.toString().includes('203.0.113.99'));
  sock.destroy();
}

// 测试 4: SOCKS5 用户名密码认证
async function testSocks5UserPass() {
  console.log('\n[测试 4] SOCKS5 用户名密码认证');
  const sock = net.connect(SOCKS_PORT, '127.0.0.1');
  sock.write(Buffer.from([0x05, 0x01, 0x02]));
  const greeting = await recvUntil(sock, (buf) => buf.length >= 2);
  ok('握手回复要求 USERPASS(0x02)', greeting[0] === 0x05 && greeting[1] === 0x02, JSON.stringify(greeting));

  const userBuf = Buffer.from(DEMO_USER);
  const passBuf = Buffer.from(DEMO_PASS);
  const authFrame = Buffer.concat([
    Buffer.from([0x01, userBuf.length]),
    userBuf,
    Buffer.from([passBuf.length]),
    passBuf
  ]);
  sock.write(authFrame);
  const authResp = await recvUntil(sock, (buf) => buf.length >= 2);
  ok('认证通过(0x00)', authResp[0] === 0x01 && authResp[1] === 0x00, JSON.stringify(authResp));

  const req = Buffer.alloc(10);
  req.writeUInt8(0x05, 0); req.writeUInt8(0x01, 1); req.writeUInt8(0x00, 2); req.writeUInt8(0x01, 3);
  req.writeUInt32BE(0x7f000001, 4); req.writeUInt16BE(HTTP_PORT, 8);
  sock.write(req);
  const ack = await recvUntil(sock, (buf) => buf.length >= 10);
  ok('认证后 CONNECT 成功', ack[0] === 0x05 && ack[1] === 0x00, JSON.stringify(ack));
  sock.destroy();
}

async function main() {
  await testHttpConnect();
  await testHttpConnectAuthFail();
  await testSocks5NoAuth();
  await testSocks5UserPass();
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('验证异常:', e.message);
  process.exit(1);
});
