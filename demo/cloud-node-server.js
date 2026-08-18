/**
 * MEIProxy Demo - 模拟"云端代理节点"服务器
 *
 * 用途：端到端演示 Ghelper 式架构 —— 浏览器扩展不依赖任何本地代理客户端，
 *       仅凭 chrome.proxy API + PAC 分流即可使用远端 HTTP/SOCKS5 节点。
 *       本脚本在本地模拟一个"部署在云端的节点"，协议层面与真实云端节点完全一致，
 *       把监听地址换成任何远程服务器 IP 就是 Ghelper 的运营模式。
 *
 * 启动：
 *   node demo/cloud-node-server.js                # 默认端口 8899(HTTP) / 8898(SOCKS5)
 *   MEIDEMO_HTTP_PORT=9900 MEIDEMO_SOCKS_PORT=9901 node demo/cloud-node-server.js
 *
 * 提供的服务：
 *   1. HTTP CONNECT 代理 (8899)：代理 http:// 与 https:// 流量（含 Proxy-Authorization 认证）
 *   2. SOCKS5 代理 (8898)：支持 CONNECT 命令，无认证与用户名密码认证
 *   3. 订阅端点 GET /subscribe：返回纯文本节点列表，可直接粘贴进 MEIProxy 订阅管理
 *   4. 出口信息 GET /ip：返回模拟出口 IP 的 JSON（用于验证代理链路生效）
 *
 * 在 MEIProxy 中使用：
 *   1. 打开扩展选项 → 订阅管理 → 粘贴 http://127.0.0.1:8899/subscribe 并同步
 *   2. 4 个节点将自动导入（HTTP 无认证 / HTTP 带认证 / SOCKS5 无认证 / SOCKS5 带认证）
 *   3. 激活任一节点或智能分流模式即可生效 —— 全程无需安装任何代理软件
 *
 * 注意：浏览器代理 API 只认 HTTP / HTTPS / SOCKS4 / SOCKS5 协议。
 *       这就是 Ghelper 节点全部采用 https:// 端口 443 直连形式的原因；
 *       而 VMess / VLESS / Trojan / SS 等加密协议必须走本地客户端（图二模式）。
 */

'use strict';

const http = require('http');
const net = require('net');
const { URL } = require('url');

const HTTP_PORT = parseInt(process.env.MEIDEMO_HTTP_PORT || '8899', 10);
const SOCKS_PORT = parseInt(process.env.MEIDEMO_SOCKS_PORT || '8898', 10);

// 演示认证凭据（订阅节点中会体现，扩展的 webRequestAuthProvider 可自动填充）
const DEMO_USER = 'demo-user';
const DEMO_PASS = 'demo-pass';
const DEMO_AUTH_B64 = Buffer.from(`${DEMO_USER}:${DEMO_PASS}`).toString('base64');

// 纯文本订阅内容 —— MEIProxy 订阅解析引擎原生支持该格式
const SUBSCRIBE_TEXT = [
  `http://127.0.0.1:${HTTP_PORT}#MEI 模拟云端节点-01 (HTTP 无认证)`,
  `http://${DEMO_USER}:${DEMO_PASS}@127.0.0.1:${HTTP_PORT}#MEI 模拟云端节点-02 (HTTP 带认证)`,
  `socks5://127.0.0.1:${SOCKS_PORT}#MEI 模拟云端节点-03 (SOCKS5 无认证)`,
  `socks5://${DEMO_USER}:${DEMO_PASS}@127.0.0.1:${SOCKS_PORT}#MEI 模拟云端节点-04 (SOCKS5 带认证)`
].join('\n');

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// 判断目标是否指向本机自身（防止代理转发死循环）
function isSelfTarget(host, port) {
  const hostNorm = (host || '').toLowerCase();
  return (
    (hostNorm === '127.0.0.1' || hostNorm === 'localhost' || hostNorm === '::1') &&
    (port === HTTP_PORT || port === SOCKS_PORT)
  );
}

// 本地路由（订阅 / 出口信息 / 首页）
function routeLocalPath(pathname, req, res) {
  if (pathname === '/subscribe' || pathname === '/subscribe.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(SUBSCRIBE_TEXT + '\n');
    return true;
  }
  if (pathname === '/ip') {
    sendJson(res, 200, {
      ip: '203.0.113.99 (模拟出口)',
      country: 'CloudNode Demo',
      org: 'MEIProxy 演示节点',
      note: '该响应经由代理链路返回，证明代理转发正常'
    });
    return true;
  }
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'MEIProxy 模拟云端节点已运行\n' +
      `HTTP 代理端口: ${HTTP_PORT}\n` +
      `SOCKS5 代理端口: ${SOCKS_PORT}\n` +
      `订阅地址: http://127.0.0.1:${HTTP_PORT}/subscribe\n` +
      `出口信息: http://127.0.0.1:${HTTP_PORT}/ip\n`
    );
    return true;
  }
  return false;
}

// 校验 Proxy-Authorization（基本认证）
function checkAuth(req) {
  const auth = req.headers['proxy-authorization'] || '';
  return auth === `Basic ${DEMO_AUTH_B64}`;
}

/* ---------------- HTTP 服务器：普通请求转发 + CONNECT 隧道 ---------------- */

const httpServer = http.createServer((req, res) => {
  const isAbsolute = /^https?:\/\//i.test(req.url);

  // 相对路径（非代理转发请求）→ 本地路由
  if (!isAbsolute) {
    const pathname = req.url.split('?')[0];
    if (routeLocalPath(pathname, req, res)) return;
    sendJson(res, 404, { error: `本演示节点仅支持 /subscribe /ip / 及代理转发，收到: ${req.url}` });
    return;
  }

  let targetUrl = null;
  try {
    targetUrl = new URL(req.url);
  } catch (e) {
    sendJson(res, 400, { error: 'invalid url' });
    return;
  }

  const host = targetUrl.hostname;
  const port = parseInt(targetUrl.port, 10) || (targetUrl.protocol === 'https:' ? 443 : 80);

  // 代理模式下浏览器会发送绝对 URL（GET http://host/path），指向自身则走本地路由
  if (isSelfTarget(host, port)) {
    if (routeLocalPath(targetUrl.pathname, req, res)) return;
    sendJson(res, 404, { error: `本演示节点仅支持 /subscribe /ip / 及代理转发，收到: ${req.url}` });
    return;
  }

  // 普通 HTTP 代理转发（非 CONNECT，即 http:// 目标）
  const proxyReq = http.request(
    {
      host,
      port,
      method: req.method,
      path: targetUrl.pathname + targetUrl.search,
      headers: Object.assign({}, req.headers, { host: targetUrl.host })
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );
  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad gateway');
  });
  req.pipe(proxyReq);
});

// CONNECT 隧道：https:// 流量的标准代理方式
httpServer.on('connect', (req, clientSocket, head) => {
  const [host, portStr] = (req.url || '').split(':');
  const port = parseInt(portStr, 10) || 443;

  // 客户端异常断开（ECONNRESET）等必须兜底，否则未处理的 error 会拖垮整个服务器
  clientSocket.on('error', () => {});

  // 认证校验：默认无认证放行（模拟无认证节点）
  // MEIDEMO_STRICT_AUTH=1 时模拟 Ghelper 场景的严格模式：
  //   无认证 → 407 挑战（标准代理行为）；错误认证 → 407；正确认证 → 200
  const authHeader = req.headers['proxy-authorization'];
  if (process.env.MEIDEMO_STRICT_AUTH === '1' && !authHeader) {
    clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="mei-demo"\r\n\r\n');
    clientSocket.end();
    return;
  }
  if (authHeader && !checkAuth(req)) {
    clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="mei-demo"\r\n\r\n');
    clientSocket.end();
    return;
  }

  const upstream = net.connect(port, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  upstream.on('error', () => {
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.end();
  });
});

// 普通 HTTP 请求层的客户端错误兜底
httpServer.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  socket.destroy();
});

/* ---------------- SOCKS5 代理服务器 ---------------- */

const socksServer = net.createServer((client) => {
  let stage = 'greeting';

  client.on('data', (buf) => {
    try {
      if (stage === 'greeting') {
        // VER=0x05 NMETHODS METHODS... → 回复支持 NO AUTH(0x00) 与 USERPASS(0x02)
        if (buf.length < 2 || buf[0] !== 0x05) return client.destroy();
        const methods = Array.from(buf.subarray(2, 2 + buf[1]));
        const reply = methods.includes(0x00) ? 0x00 : methods.includes(0x02) ? 0x02 : 0xff;
        stage = reply === 0x02 ? 'auth' : 'request';
        client.write(Buffer.from([0x05, reply]));
        if (reply === 0xff) client.destroy();
      } else if (stage === 'auth') {
        // VER=0x01 ULEN USER PLEN PASS
        const ulen = buf[1];
        const plen = buf[2 + ulen];
        const user = buf.subarray(2, 2 + ulen).toString();
        const pass = buf.subarray(3 + ulen, 3 + ulen + plen).toString();
        const ok = user === DEMO_USER && pass === DEMO_PASS;
        client.write(Buffer.from([0x01, ok ? 0x00 : 0x01]));
        if (!ok) return client.destroy();
        stage = 'request';
      } else if (stage === 'request') {
        // VER CMD RSV ATYP [ADDR] [PORT] — 仅支持 CONNECT(0x01)
        if (buf[0] !== 0x05 || buf[1] !== 0x01) {
          client.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          return client.destroy();
        }
        const atyp = buf[3];
        let host;
        let cursor;
        if (atyp === 0x01) {
          host = Array.from(buf.subarray(4, 8)).join('.');
          cursor = 8;
        } else if (atyp === 0x03) {
          const len = buf[4];
          host = buf.subarray(5, 5 + len).toString();
          cursor = 5 + len;
        } else if (atyp === 0x04) {
          const raw = buf.subarray(4, 20);
          host = Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join(':');
          cursor = 20;
        } else {
          return client.destroy();
        }
        const port = buf.readUInt16BE(cursor);

        const upstream = net.connect(port, host, () => {
          client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          upstream.pipe(client);
          client.pipe(upstream);
        });
        upstream.on('error', () => {
          client.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          client.destroy();
        });
        stage = 'tunnel';
      }
    } catch (e) {
      client.destroy();
    }
  });

  client.on('error', () => {});
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[MEI Demo] HTTP 代理就绪    http://127.0.0.1:${HTTP_PORT}   (CONNECT + 转发 + 订阅)`);
  console.log(`[MEI Demo] 订阅地址          http://127.0.0.1:${HTTP_PORT}/subscribe`);
  console.log(`[MEI Demo] 出口信息          http://127.0.0.1:${HTTP_PORT}/ip`);
});

socksServer.listen(SOCKS_PORT, '127.0.0.1', () => {
  console.log(`[MEI Demo] SOCKS5 代理就绪  socks5://127.0.0.1:${SOCKS_PORT}  (CONNECT 命令)`);
  console.log(`[MEI Demo] 认证凭据          ${DEMO_USER} / ${DEMO_PASS}`);
});
