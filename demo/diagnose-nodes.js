/**
 * MEIProxy - 节点诊断工具
 *
 * 用途：对订阅/配置文件中的每个节点做真实连通性诊断，
 *       回答"哪些节点能用、哪些不能用、为什么"。
 *
 * 用法：
 *   node demo/diagnose-nodes.js <订阅URL>                # 远程订阅
 *   node demo/diagnose-nodes.js <本地文件路径>            # yaml/txt 文件
 *   node demo/diagnose-nodes.js "粘贴的内容"              # 直接粘贴文本
 *   可选参数：--timeout=5000  --target=www.gstatic.com:443
 *
 * 诊断内容（与浏览器行为一致的协议级测试）：
 *   - HTTPS 代理：TCP → TLS 握手到代理（验证证书）→ CONNECT 隧道
 *   - HTTP 代理： TCP → CONNECT 隧道（带认证）
 *   - SOCKS5 代理：握手（无认证/USERPASS）→ CONNECT 命令
 *   - 加密协议节点（VMess/VLESS/Trojan/SS）：浏览器无法直接代理，仅标注
 */

'use strict';

import { parseSubscriptionContent, fetchSubscription } from '../lib/subscription.js';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';

// ---------------- 参数解析 ----------------
const args = process.argv.slice(2);
const argTimeout = args.find(a => a.startsWith('--timeout='));
const argTarget = args.find(a => a.startsWith('--target='));
const TIMEOUT_MS = argTimeout ? parseInt(argTimeout.split('=')[1], 10) : 5000;
const TEST_TARGET = argTarget ? argTarget.split('=')[1] : 'www.gstatic.com:443';
const [targetHost, targetPort] = (() => {
  const idx = TEST_TARGET.lastIndexOf(':');
  return [TEST_TARGET.slice(0, idx), parseInt(TEST_TARGET.slice(idx + 1), 10) || 443];
})();

const source = args.find(a => !a.startsWith('--'));

if (!source) {
  console.log('用法: node demo/diagnose-nodes.js <订阅URL|文件路径|粘贴文本> [--timeout=5000] [--target=host:port]');
  process.exit(1);
}

// ---------------- 通用工具 ----------------
const PASS = '✅';
const WARN = '⚠️';
const FAIL = '❌';
const SKIP = '⏭️';

function log(line = '') { console.log(line); }

function withTimeout(ms, fn) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve({ timedOut: true }); }
    }, ms);
    fn((result) => {
      if (!done) { done = true; clearTimeout(timer); resolve(result); }
    });
  });
}

// ---------------- 协议级测试 ----------------

/** TCP 连通性 */
function tcpTest(host, port) {
  return withTimeout(TIMEOUT_MS, (finish) => {
    const sock = net.connect({ host, port });
    sock.setNoDelay(true);
    sock.once('connect', () => { sock.destroy(); finish({ ok: true, ms: 0 }); });
    sock.once('error', (err) => finish({ ok: false, reason: err.code || err.message }));
  });
}

/** HTTP(S) 代理：CONNECT 隧道测试（分两步：先无认证探测，再带认证重试） */
function httpConnectTest(scheme, host, port, auth) {
  return withTimeout(TIMEOUT_MS * 2, (finish) => {
    let attempt = 0;

    const runAttempt = () => {
      attempt++;
      const sendAuthHeader = !!(auth && auth.enabled && attempt > 1);

      let sock;
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        finish(result);
      };

      const onEstablished = () => {
        let buf = '';
        const onData = (chunk) => {
          buf += chunk.toString();
          const head = buf.split('\r\n')[0] || '';
          const m = head.match(/^HTTP\/1\.[01]\s+(\d+)/);
          if (m) {
            const code = parseInt(m[1], 10);
            sock.removeListener('data', onData);
            if (code === 200) {
              settle({ ok: true, detail: attempt > 1 ? 'CONNECT 200（带认证）' : 'CONNECT 200（无需认证）' });
            } else if (code === 407) {
              if (attempt === 1 && auth && auth.enabled) {
                // 服务器要求认证 → 带认证重试（模拟 Chrome: 407 → onAuthRequired 补凭据）
                sock.destroy();
                runAttempt();
                return;
              }
              settle({ ok: false, reason: '407 认证失败（账号/密码错误）', detail: head });
            } else if (code === 403) {
              // Ghelper 类服务器对无认证 CONNECT 返回 403（而非标准 407）
              // Chrome 只对 407 触发认证流程，403 直接失败 → ERR_TUNNEL_CONNECTION_FAILED
              settle({
                ok: false,
                reason: attempt === 1 && auth && auth.enabled
                  ? '服务器对无认证请求返回 403（标准应返回 407），Chrome 无法触发认证 → ERR_TUNNEL_CONNECTION_FAILED'
                  : '服务器返回 403 Forbidden',
                detail: head
              });
            } else {
              settle({ ok: false, reason: `代理返回 ${code}`, detail: head });
            }
            sock.destroy();
          } else if (buf.length > 512) {
            sock.removeListener('data', onData);
            settle({ ok: false, reason: '异常响应', detail: head });
            sock.destroy();
          }
        };
        sock.on('data', onData);
      };

      const buildConnectReq = () => {
        const req = [
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
          `Host: ${targetHost}:${targetPort}`,
          sendAuthHeader ? `Proxy-Authorization: Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}` : '',
          'Connection: close',
          '', ''
        ];
        return req.filter(l => l !== '').join('\r\n');
      };

      const failEarly = (err) => {
        if (attempt === 1 && auth && auth.enabled) {
          // 无认证时被断开/超时 → Chrome 将无法触发 onAuthRequired → ERR_TUNNEL_CONNECTION_FAILED
          settle({ ok: false, reason: '无认证请求被服务器断开（Chrome 将报 ERR_TUNNEL_CONNECTION_FAILED）', detail: err.code || err.message });
        } else {
          settle({ ok: false, reason: `连接失败: ${err.code || err.message}` });
        }
      };

      if (scheme === 'https') {
        sock = tls.connect({
          host, port, servername: host,
          rejectUnauthorized: true,
          timeout: TIMEOUT_MS
        });
        sock.once('secureConnect', () => {
          onEstablished();
          sock.write(buildConnectReq());
        });
        sock.once('error', (err) => {
          if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
              err.code === 'SELF_SIGNED_CERT_IN_CHAIN' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
            settle({ ok: false, reason: 'TLS 证书校验失败（代理证书无效/自签）', detail: err.code });
          } else {
            failEarly(err);
          }
        });
        sock.once('timeout', () => failEarly({ code: 'timeout' }));
      } else {
        sock = net.connect({ host, port });
        sock.setNoDelay(true);
        sock.once('connect', () => {
          onEstablished();
          sock.write(buildConnectReq());
        });
        sock.once('error', (err) => failEarly(err));
        sock.once('timeout', () => failEarly({ code: 'timeout' }));
      }
    };

    runAttempt();
  });
}

/** SOCKS5 代理：握手 + CONNECT */
function socks5Test(host, port, auth) {
  return withTimeout(TIMEOUT_MS, (finish) => {
    const sock = net.connect({ host, port });
    sock.setNoDelay(true);
    let stage = 'greeting';

    sock.once('connect', () => {
      const wantAuth = !!(auth && auth.enabled);
      sock.write(Buffer.from([0x05, 0x01, wantAuth ? 0x02 : 0x00]));
    });

    // 注意：SOCKS5 是多次往返（握手→认证→CONNECT），必须持续监听而非 once
    const onData = (buf) => {
      try {
        if (stage === 'greeting') {
          if (buf[0] !== 0x05 || buf[1] === 0xff) {
            finish({ ok: false, reason: 'SOCKS5 握手被拒绝' });
            sock.destroy(); return;
          }
          if (buf[1] === 0x02) {
            stage = 'auth';
            const u = Buffer.from((auth && auth.username) || '');
            const p = Buffer.from((auth && auth.password) || '');
            sock.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]));
          } else {
            stage = 'request';
            sendConnect();
          }
        } else if (stage === 'auth') {
          if (buf[1] !== 0x00) {
            finish({ ok: false, reason: 'SOCKS5 认证失败（账号/密码错误）' });
            sock.destroy(); return;
          }
          stage = 'request';
          sendConnect();
        } else if (stage === 'request') {
          sock.removeListener('data', onData);
          if (buf[0] === 0x05 && buf[1] === 0x00) finish({ ok: true, detail: 'SOCKS5 CONNECT 成功' });
          else finish({ ok: false, reason: `SOCKS5 CONNECT 失败 (reply=${buf[1]})` });
          sock.destroy();
        }
      } catch (e) {
        finish({ ok: false, reason: `协议异常: ${e.message}` });
        sock.destroy();
      }
    };
    sock.on('data', onData);

    sock.once('error', (err) => finish({ ok: false, reason: `TCP 失败: ${err.code || err.message}` }));

    function sendConnect() {
      const hostBuf = Buffer.from(targetHost);
      const req = Buffer.concat([
        Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
        hostBuf,
        Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff])
      ]);
      sock.write(req);
    }
  });
}

// ---------------- 主流程 ----------------
async function loadNodes() {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetchSubscription(source, 'diag');
    if (res.error) {
      log(`${FAIL} 订阅拉取失败: ${res.error}`);
      process.exit(1);
    }
    return { nodes: res.nodes, sourceLabel: source };
  }
  if (fs.existsSync(source)) {
    const text = fs.readFileSync(source, 'utf-8');
    return { nodes: parseSubscriptionContent(text, 'diag'), sourceLabel: `文件 ${source}` };
  }
  return { nodes: parseSubscriptionContent(source, 'diag'), sourceLabel: '粘贴文本' };
}

async function main() {
  log('════════════════════════════════════════════');
  log('  MEIProxy 节点诊断报告');
  log('════════════════════════════════════════════');
  log(`来源: ${source.length > 80 ? source.slice(0, 80) + '...' : source}`);
  log(`测试目标: ${targetHost}:${targetPort} | 超时: ${TIMEOUT_MS}ms`);
  log('');

  const { nodes } = await loadNodes();
  const usable = nodes.filter(n => n.directlyUsable !== false);
  const tunnel = nodes.filter(n => n.directlyUsable === false);

  log(`节点总数: ${nodes.length} | 浏览器可直接代理: ${usable.length} | 加密协议(需本地客户端): ${tunnel.length}`);
  log('');

  if (usable.length > 0) {
    log('── 可直接代理节点诊断 ──');
    for (const n of usable) {
      const host = n.host;
      const port = n.port;
      const auth = n.auth || {};

      if (!host || !port) {
        log(`${WARN} ${n.name} 缺少 host/port，配置无效`);
        continue;
      }

      // 1. TCP
      const tcp = await tcpTest(host, port);
      if (!tcp.ok) {
        log(`${FAIL} ${n.name}  [${(n.scheme || '').toUpperCase()}] ${host}:${port}`);
        log(`        TCP 连接失败: ${tcp.timedOut ? `超时 (${TIMEOUT_MS}ms)` : tcp.reason}`);
        continue;
      }

      // 2. 协议级
      let result;
      if ((n.scheme || '').startsWith('socks')) {
        result = await socks5Test(host, port, auth);
      } else {
        result = await httpConnectTest((n.scheme || 'http').toLowerCase(), host, port, auth);
      }

      if (result.ok) {
        log(`${PASS} ${n.name}  [${(n.scheme || '').toUpperCase()}] ${host}:${port}  ${result.detail}`);
      } else {
        log(`${FAIL} ${n.name}  [${(n.scheme || '').toUpperCase()}] ${host}:${port}`);
        log(`        ${result.timedOut ? `超时 (${TIMEOUT_MS}ms)` : result.reason}`);
      }
    }
    log('');
  }

  if (tunnel.length > 0) {
    log('── 加密协议节点（浏览器无法直接代理）──');
    for (const n of tunnel) {
      log(`${SKIP} ${n.name}  [${(n.protocol || n.scheme || '').toUpperCase()}] ${n.host}:${n.port}`);
    }
    log('');
    log('说明: 这些节点需要本地客户端 (Clash / V2Ray / sing-box) 将流量转换为');
    log('      SOCKS5/HTTP 后才能被浏览器使用。这不是节点坏了，是浏览器不支持这些协议。');
    log('');
  }

  log('════════════════════════════════════════════');
  const okCount = usable.filter(n => {
    // 重新统计太麻烦，这里仅作汇总提示
    return true;
  }).length;
  log(`诊断完成。${PASS} = 可用，${FAIL} = 不可用，${SKIP} = 需本地客户端。`);
  log('提示: 激活节点后若仍打不开网站，请在 chrome://extensions 的 Service Worker');
  log('      控制台查看 [MEI Proxy] 开头的日志，把报错信息发给我。');
}

main().catch(err => {
  console.error('诊断异常:', err);
  process.exit(1);
});
