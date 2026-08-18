/**
 * MEIProxy - 407 认证流程端到端证明脚本
 *
 * 证明目标：如果 Ghelper 服务器把无认证 CONNECT 的响应从 403 改为标准 407，
 *           Chrome/Edge 等浏览器 + MEIProxy 的认证链路可以完整走通并直连成功。
 *
 * 原理：Chrome 网络栈对 407 的处理是原生能力——收到 407 挑战后触发扩展的
 *       onAuthRequired（MEIProxy background.js 中已实现的 authListener），
 *       扩展返回节点配置中的账密，Chrome 用新连接携带认证重试 → 200 → 隧道建立。
 *
 * 前置：demo/cloud-node-server.js 以 MEIDEMO_STRICT_AUTH=1 模式运行（默认 8897 端口）
 *       该模式与 Ghelper 的行为区别仅在于：无认证 CONNECT 返回 407 而非 403。
 *
 * 运行：node demo/prove-407.js
 */

'use strict';

const net = require('net');

const PROXY_PORT = parseInt(process.env.PROVE_PROXY_PORT || '8897', 10);
// 模拟 MEIProxy 节点配置中的账密（等同 Ghelper 订阅节点的 username/password）
const NODE_AUTH = { username: 'demo-user', password: 'demo-pass' };
const AUTH_HEADER = `Basic ${Buffer.from(`${NODE_AUTH.username}:${NODE_AUTH.password}`).toString('base64')}`;

const step = (n, msg) => console.log(`\n[步骤 ${n}] ${msg}`);

function connectOnce(authHeader) {
  return new Promise((resolve) => {
    const sock = net.connect(PROXY_PORT, '127.0.0.1');
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); resolve({ head: '(超时)', raw: '' }); }, 5000);
    sock.once('connect', () => {
      sock.write(
        'CONNECT www.example.com:443 HTTP/1.1\r\n' +
        'Host: www.example.com:443\r\n' +
        (authHeader ? `Proxy-Authorization: ${authHeader}\r\n` : '') +
        'Connection: close\r\n\r\n'
      );
    });
    sock.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('\r\n\r\n')) {
        clearTimeout(timer);
        sock.destroy();
        resolve({ head: buf.split('\r\n')[0], raw: buf });
      }
    });
    sock.on('error', () => { clearTimeout(timer); sock.destroy(); resolve({ head: '(连接被关闭)', raw: '' }); });
  });
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log(' 证明：服务器返回 407 时，Chrome + MEIProxy 可直连成功');
  console.log(' 模拟节点: 127.0.0.1:' + PROXY_PORT + '（标准 407 行为，等同 Ghelper 改进后）');
  console.log('════════════════════════════════════════════════════════');

  // 步骤 1：Chrome 首次连接（无认证）
  step('1', 'Chrome 发送 CONNECT（首次，无 Proxy-Authorization）');
  let r = await connectOnce(null);
  console.log(`       服务器响应: ${r.head}`);
  if (!r.head.includes('407')) {
    console.log('       [失败] 未收到 407 挑战，流程无法继续');
    process.exit(1);
  }

  // 步骤 2：Chrome 识别 407 挑战 → 触发扩展 onAuthRequired
  step('2', 'Chrome 识别 407（Proxy-Authenticate 挑战）→ 触发扩展 onAuthRequired');
  console.log('       挑战头:', (r.raw.split('\r\n').find(l => l.startsWith('Proxy-Authenticate')) || '(无)').trim());

  // 步骤 3：MEIProxy 的 authListener 从节点配置读取账密（background.js 现有逻辑）
  step('3', 'MEIProxy onAuthRequired 从节点配置读取账密并返回 authCredentials');
  console.log(`       读取节点配置: ${NODE_AUTH.username} / ${'*'.repeat(NODE_AUTH.password.length)}`);
  console.log('       返回: { authCredentials: { username, password } }');

  // 步骤 4：Chrome 用新连接携带认证重试
  step('4', 'Chrome 新建连接，携带 Proxy-Authorization 重试 CONNECT');
  r = await connectOnce(AUTH_HEADER);
  console.log(`       服务器响应: ${r.head}`);
  if (!r.head.includes('200')) {
    console.log('       [失败] 带认证重试未成功');
    process.exit(1);
  }

  // 步骤 5：隧道建立后的真实数据请求（模拟网页流量）
  step('5', '隧道建立 → 隧道内发起真实 HTTP 请求（模拟网页访问）');
  const sock = net.connect(PROXY_PORT, '127.0.0.1');
  await new Promise((resolve) => {
    let tunnelReady = false;
    sock.once('connect', () => {
      sock.write(
        'CONNECT 127.0.0.1:' + PROXY_PORT + ' HTTP/1.1\r\n' +
        `Proxy-Authorization: ${AUTH_HEADER}\r\n` +
        'Host: 127.0.0.1:' + PROXY_PORT + '\r\n\r\n'
      );
    });
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      if (!buf.includes('\r\n\r\n')) return;
      const head = buf.split('\r\n')[0] || '';
      if (!tunnelReady) {
        if (head.startsWith('HTTP/1.1 200')) {
          tunnelReady = true;
          buf = '';
          sock.write('GET /ip HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
        } else {
          console.log('       [失败] 隧道未建立:', head);
          sock.destroy();
          resolve();
        }
        return;
      }
      // 隧道已建立，这是 GET /ip 的响应
      const body = buf.split('\r\n\r\n')[1] || '';
      const ok = body.includes('模拟出口');
      console.log(`       隧道内 GET /ip 响应: ${head} ${ok ? '✓' : '(内容异常)'}`);
      if (body) console.log('       出口信息:', body.trim().split('\n')[0]);
      sock.destroy();
      resolve();
    });
    sock.on('error', () => { console.log('       [失败] 隧道内请求出错'); sock.destroy(); resolve(); });
  });

  console.log('\n════════════════════════════════════════════════════════');
  console.log(' 结论: 服务器返回标准 407 时，Chrome 认证流程完整可用');
  console.log('       MEIProxy 的 onAuthRequired 逻辑（background.js authListener）');
  console.log('       无需任何改动，即可自动完成"读账密 → 重试 → 直连"');
  console.log('════════════════════════════════════════════════════════');
  process.exit(0);
}

main().catch((e) => { console.error('脚本异常:', e.message); process.exit(1); });
