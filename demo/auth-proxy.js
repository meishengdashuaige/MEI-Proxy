/**
 * MEIProxy - Ghelper 认证注入代理
 *
 * 背景：Ghelper 节点服务器对"无认证 CONNECT"返回 403（而非标准 407），
 *       而 Chrome 扩展只能在 407 时通过 onAuthRequired 注入凭据，
 *       因此任何浏览器扩展都无法直接使用 Ghelper 认证节点。
 *
 * 本工具解决方式：在本地监听一个端口，把浏览器的 CONNECT 隧道请求
 *       透明转发到 Ghelper 上游节点，并在转发时自动附加 Proxy-Authorization。
 *       对浏览器而言这就是一个"无需认证的本地 HTTP 代理"。
 *
 * 用法：
 *   node demo/auth-proxy.js [--config demo/ghelper_sub_raw.txt] [--node "节点名"|auto] [--port 8899]
 *   --config  订阅来源：本地文件路径或订阅 URL（默认 demo/ghelper_sub_raw.txt）
 *   --node    节点名称（默认 auto：自动测速选择最快节点；也可指定名称）
 *   --port    本地监听端口（默认 8899）
 *
 * 然后在 MEIProxy 中新建节点：HTTP / 127.0.0.1 / 8899（无需认证），即可使用。
 * 智能分流多节点：可启动多个实例（不同 --port），分别绑定不同 --node。
 */

'use strict';

import { parseSubscriptionContent, fetchSubscription } from '../lib/subscription.js';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';

// ---------------- 参数解析 ----------------
const args = process.argv.slice(2);
const argOf = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
};
const CONFIG = argOf('--config') || 'demo/ghelper_sub_raw.txt';
const NODE_NAME = argOf('--node') || null;
const LOCAL_PORT = parseInt(argOf('--port') || '8899', 10);
const TIMEOUT_MS = parseInt(argOf('--timeout') || '10000', 10);

// ---------------- 加载节点 ----------------
async function loadTargetNode() {
  let nodes;
  if (/^https?:\/\//i.test(CONFIG)) {
    const res = await fetchSubscription(CONFIG, 'authproxy');
    if (res.error || res.nodes.length === 0) {
      console.error(`[auth-proxy] 订阅拉取失败: ${res.error || '无节点'}`);
      process.exit(1);
    }
    nodes = res.nodes;
  } else {
    if (!fs.existsSync(CONFIG)) {
      console.error(`[auth-proxy] 配置文件不存在: ${CONFIG}`);
      process.exit(1);
    }
    nodes = parseSubscriptionContent(fs.readFileSync(CONFIG, 'utf-8'), 'authproxy');
  }

  const usable = nodes.filter(n => n.directlyUsable !== false);
  if (usable.length === 0) {
    console.error('[auth-proxy] 配置中没有浏览器可直接代理的节点（HTTP/HTTPS/SOCKS5）');
    process.exit(1);
  }

  if (NODE_NAME === 'auto' || !NODE_NAME) {
    return await autoSelectNode(usable);
  }

  const target = usable.find(n => n.name.includes(NODE_NAME));
  if (!target) {
    console.error(`[auth-proxy] 未找到节点「${NODE_NAME}」，可用节点:`);
    usable.forEach(n => console.error(`   - ${n.name}  [${n.scheme}] ${n.host}:${n.port}`));
    process.exit(1);
  }
  return target;
}

/**
 * 自动测速：对全部可用节点做带认证的 CONNECT 计时，选出最快节点
 */
async function autoSelectNode(nodes) {
  const TEST_TARGET = 'www.gstatic.com:443';
  const [tHost, tPort] = TEST_TARGET.split(':');
  const PROBE_TIMEOUT = 4000;

  const results = await Promise.all(nodes.map(n => new Promise((resolve) => {
    if (!n.host || !n.port) return resolve({ node: n, ok: false });

    const start = Date.now();
    const sock = tls.connect({
      host: n.host, port: n.port, servername: n.host,
      rejectUnauthorized: true, timeout: PROBE_TIMEOUT
    });
    let done = false;
    const settle = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ node: n, ok, ms: Date.now() - start });
    };

    sock.once('secureConnect', () => {
      const authHeader = (n.auth && n.auth.enabled)
        ? `Proxy-Authorization: Basic ${Buffer.from(`${n.auth.username}:${n.auth.password}`).toString('base64')}\r\n`
        : '';
      sock.write(`CONNECT ${tHost}:${tPort} HTTP/1.1\r\nHost: ${tHost}:${tPort}\r\n${authHeader}Connection: close\r\n\r\n`);
      let buf = '';
      sock.on('data', (chunk) => {
        buf += chunk.toString();
        const m = buf.match(/^HTTP\/1\.[01]\s+(\d+)/);
        if (m) {
          sock.removeAllListeners('data');
          settle(parseInt(m[1], 10) === 200);
        } else if (buf.length > 1024) {
          settle(false);
        }
      });
    });
    sock.once('error', () => settle(false));
    sock.once('timeout', () => settle(false));
  })));

  const ok = results.filter(r => r.ok).sort((a, b) => a.ms - b.ms);
  if (ok.length === 0) {
    console.error('[auth-proxy] 全部节点探测失败，请检查网络或稍后重试（--node 可指定具体节点）');
    process.exit(1);
  }

  console.log(`[auth-proxy] 节点测速完成: ${ok.length}/${nodes.length} 可用`);
  ok.slice(0, 5).forEach((r, i) => {
    console.log(`   ${i === 0 ? '★' : ' '} ${r.node.name}  ${r.ms}ms`);
  });
  return ok[0].node;
}

// ---------------- 本地代理服务器 ----------------
function startLocalProxy(target) {
  const server = httpServer(target);

  server.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log('════════════════════════════════════════════');
    console.log('  MEIProxy 认证注入代理已启动');
    console.log('════════════════════════════════════════════');
    console.log(`  本地监听   http://127.0.0.1:${LOCAL_PORT}   (浏览器/M E I Proxy 指向这里)`);
    console.log(`  上游节点   ${target.name}  [${target.scheme}] ${target.host}:${target.port}`);
    console.log(`  认证注入   ${target.auth && target.auth.enabled ? 'Basic 认证已启用' : '无认证'}`);
    console.log('');
    console.log('  MEIProxy 使用方式: 新建节点 → HTTP → 127.0.0.1 → 端口 ' + LOCAL_PORT + ' → 激活');
    console.log('  Ctrl+C 停止');
    console.log('════════════════════════════════════════════');
  });
  return server;
}

function httpServer(target) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'MEIProxy 认证注入代理\n' +
      `上游: ${target.name} (${target.host}:${target.port})\n` +
      '本服务仅接受 CONNECT 隧道（浏览器代理流量），请在 MEIProxy 中使用。\n'
    );
  });

  // CONNECT 隧道：转发到上游并注入认证
  server.on('connect', (req, clientSocket, head) => {
    clientSocket.on('error', () => {});
    const [targetHost, portStr] = (req.url || '').split(':');
    const targetPort = parseInt(portStr, 10) || 443;

    const upstream = tls.connect({
      host: target.host,
      port: target.port,
      servername: target.host,
      rejectUnauthorized: true,
      timeout: TIMEOUT_MS
    }, () => {
      // 向 Ghelper 节点发送带认证的 CONNECT
      const authHeader = (target.auth && target.auth.enabled)
        ? `Proxy-Authorization: Basic ${Buffer.from(`${target.auth.username}:${target.auth.password}`).toString('base64')}\r\n`
        : '';
      upstream.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
        `Host: ${targetHost}:${targetPort}\r\n` +
        authHeader +
        'Connection: close\r\n\r\n'
      );
    });

    let stage = 'waiting_upstream';
    let buf = '';
    const onUpstreamData = (chunk) => {
      if (stage !== 'waiting_upstream') return;
      buf += chunk.toString();
      const head = buf.split('\r\n')[0] || '';
      const m = head.match(/^HTTP\/1\.[01]\s+(\d+)/);
      if (m) {
        const code = parseInt(m[1], 10);
        if (code === 200) {
          stage = 'tunnel';
          upstream.removeListener('data', onUpstreamData);
          // 响应头之后的字节属于隧道内数据（上游可能已先行发送），unshift 回去
          const rest = buf.slice(buf.indexOf('\r\n\r\n') + 4);
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (rest.length) upstream.unshift(Buffer.from(rest));
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
        } else {
          console.error(`[auth-proxy] 上游返回 ${code}，认证失败或节点不可用`);
          clientSocket.write(`HTTP/1.1 ${code} Bad Gateway\r\n\r\n`);
          clientSocket.end();
          upstream.destroy();
        }
      } else if (buf.length > 2048) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
        upstream.destroy();
      }
    };
    upstream.on('data', onUpstreamData);

    upstream.on('error', (err) => {
      console.error(`[auth-proxy] 上游连接失败: ${err.code || err.message}`);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    });
    upstream.on('timeout', () => {
      console.error('[auth-proxy] 上游连接超时');
      clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
      clientSocket.end();
      upstream.destroy();
    });
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
  });

  return server;
}

// ---------------- 入口 ----------------
loadTargetNode().then((target) => {
  startLocalProxy(target);
}).catch((err) => {
  console.error('[auth-proxy] 启动失败:', err.message);
  process.exit(1);
});
