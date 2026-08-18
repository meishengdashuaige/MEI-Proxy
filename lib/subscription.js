/**
 * MEIProxy - 节点订阅解析引擎
 * 支持 Base64 编码订阅、纯文本链接列表、V2rayN URI 与 Clash YAML 配置。
 *
 * 关键规则：浏览器 proxy API 仅原生支持 HTTP/HTTPS/SOCKS4/SOCKS5 协议，
 * 因此 http/https/socks 链接节点标记 directlyUsable: true（无需本地程序，
 * Ghelper 在 Firefox 下即此模式）；vmess/vless/trojan/ss/ssr/hysteria 等加密协议
 * 节点解析后标记 directlyUsable: false（需本地客户端转换，激活与 PAC 编译会自动跳过）。
 */

import { generateId } from './storage.js';
import { isGhelperSource } from './utils.js';

export { isGhelperSource };

export const PROXY_SCHEMES = ['http', 'https', 'socks4', 'socks5', 'socks'];
export const TUNNEL_PROTOCOLS = [
  'vmess', 'vless', 'trojan', 'ss', 'ssr', 'shadowsocks',
  'hysteria', 'hysteria2', 'hy2', 'tuic', 'wireguard', 'wg', 'snell', 'juicity', 'ssh'
];

/**
 * 解析订阅内容为节点列表（自动识别 Base64 / 明文链接 / URI）
 * @param {string} content 原始订阅内容
 * @param {string} subId 所属订阅 ID
 * @param {Object} [defaultAuth] 统一默认认证 { enabled, username, password }
 * @param {string} [subName] 所属订阅名称
 * @returns {Array} 节点配置数组（与 DEFAULT_PROFILES 中 fixed 节点同构）
 */
export function parseSubscriptionContent(content, subId = 'custom', defaultAuth = null, subName = '') {
  if (!content || typeof content !== 'string') return [];

  let text = content.trim();
  if (!text) return [];

  // 尝试 Base64 解码（URL-safe 与标准 Base64，UTF-8）
  // 阈值取 0.4：中文/emoji 经 UTF-8 编码后 base64 膨胀率高（实测可低至 ~0.58）
  // 并以"含协议前缀或换行"作为订阅内容特征校验，避免误解码纯文本
  if (!/^(http|https|socks|vmess|vless|trojan|ss|ssr|hysteria|hy2|tuic|wireguard|wg|snell):/i.test(text) && !text.includes('\n')) {
    const decoded = tryDecodeBase64(text);
    if (decoded && decoded.length > text.length * 0.4 && (/:\/\//.test(decoded) || decoded.includes('\n'))) {
      text = decoded.trim();
    }
  }

  // 若为 Clash YAML（含 proxies: 列表、顶层键或裸节点列表片段）则走 YAML 解析
  if (
    /^\s*proxies:/m.test(text) ||
    (/^[a-zA-Z]+:\s*$/m.test(text) && text.includes('server:')) ||
    /^- name:\s*\S/m.test(text)
  ) {
    return parseClashYaml(text, subId, defaultAuth, subName);
  }

  const nodes = [];
  const seen = new Set();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    // 优先将整行作为一个节点解析（hash 备注可含空格），失败再按空白拆分多链接
    const lineNodes = tryParseLine(line, subId, defaultAuth, subName);
    for (const node of lineNodes) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        nodes.push(node);
      }
    }
  }
  return nodes;
}

/**
 * 解析单行内容：先尝试整行作为一个节点，失败后按空白拆分为多个链接
 */
function tryParseLine(line, subId, defaultAuth, subName = '') {
  const single = parseProxyUri(line, subId, defaultAuth, subName);
  if (single) return [single];
  const nodes = [];
  for (const token of line.split(/\s+/)) {
    if (!token) continue;
    const node = parseProxyUri(token, subId, defaultAuth, subName);
    if (node) nodes.push(node);
  }
  return nodes;
}

/**
 * 解析单条节点 URI（链接或隧道协议），供单节点导入与订阅解析共用
 * @param {string} token 节点 URI
 * @param {string} subId 所属订阅 ID
 * @param {Object} [defaultAuth] 统一默认认证
 * @param {string} [subName] 所属订阅名称
 * @returns {Object|null} 节点配置
 */
export function parseProxyUri(token, subId = 'custom', defaultAuth = null, subName = '') {
  const lower = token.toLowerCase();
  const schemeMatch = lower.match(/^([a-z0-9+.-]+):\/\//);
  if (!schemeMatch) return null;

  const scheme = schemeMatch[1].toLowerCase();

  // ---------- 隧道加密协议（浏览器无法直接代理，仅提取元信息） ----------
  if (TUNNEL_PROTOCOLS.includes(scheme)) {
    return buildTunnelNode(scheme, token, subId, subName);
  }

  // ---------- 标准代理链接 http/https/socks4/socks5 ----------
  if (!PROXY_SCHEMES.includes(scheme)) return null;

  let url;
  try {
    url = new URL(token);
  } catch (e) {
    return null;
  }

  const host = url.hostname || '';
  if (!host) return null;
  const port = parseInt(url.port, 10) || (scheme === 'https' ? 443 : scheme.startsWith('socks') ? 1080 : 80);
  const name = decodeURIComponent(url.hash ? url.hash.slice(1) : '') || `${host}:${port}`;

  const auth = { enabled: false, username: '', password: '' };
  if (url.username) {
    auth.enabled = true;
    auth.username = decodeURIComponent(url.username);
    auth.password = decodeURIComponent(url.password || '');
  } else if (defaultAuth && defaultAuth.enabled && defaultAuth.username) {
    auth.enabled = true;
    auth.username = defaultAuth.username;
    auth.password = defaultAuth.password || '';
  }

  const isGhelper = isGhelperSource(token) || isGhelperSource(host) || isGhelperSource(name) || isGhelperSource(subName);

  return {
    id: generateId('node'),
    name,
    type: 'fixed',
    scheme,
    protocol: scheme,
    directlyUsable: true,
    isGhelper,
    host,
    port,
    subId,
    subName: subName || (subId !== 'custom' ? subId : ''),
    auth,
    color: pickNodeColor(host),
    description: isGhelper
      ? `来自 Ghelper 订阅 · HTTPS 专线（Firefox 支持直接代理认证）`
      : `来自订阅导入 · ${scheme.toUpperCase()} 节点（浏览器可直接代理）`
  };
}

/**
 * 解析 VMess / VLESS / Trojan / SS / SSR / Hysteria 等加密协议 URI（元信息提取）
 */
function buildTunnelNode(scheme, token, subId, subName = '') {
  let host = '';
  let port = 0;
  let name = '';
  const rawProtocol = { protocol: scheme };

  // 统一提取 #fragment 备注（可能含空格与 URL 编码）
  if (token.includes('#')) {
    try {
      name = decodeURIComponent(token.split('#').slice(1).join('#'));
    } catch (e) {
      name = '';
    }
  }

  try {
    if (scheme === 'vmess') {
      const b64 = token.slice('vmess://'.length).split('?')[0];
      const json = JSON.parse(tryDecodeBase64(b64) || '{}');
      host = json.add || '';
      port = parseInt(json.port, 10) || 0;
      if (!name && json.ps) name = decodeURIComponent(json.ps);
      rawProtocol.id = json.id || '';
      rawProtocol.aid = json.aid || '0';
      rawProtocol.net = json.net || '';
      rawProtocol.tls = json.tls || '';
      rawProtocol.path = json.path || '';
    } else if (scheme === 'vless' || scheme === 'trojan') {
      const rest = token.slice(`${scheme}://`.length).split('#')[0];
      const query = rest.includes('?') ? rest.slice(rest.indexOf('?') + 1) : '';
      const authority = rest.split('?')[0];
      const atIdx = authority.lastIndexOf('@');
      if (atIdx >= 0) {
        rawProtocol.password = authority.slice(0, atIdx);
        const hp = authority.slice(atIdx + 1).split(':');
        host = hp[0] || '';
        port = parseInt(hp[1], 10) || 0;
      }
      const params = new URLSearchParams(query);
      rawProtocol.network = params.get('type') || '';
      rawProtocol.security = params.get('security') || '';
      rawProtocol.path = params.get('path') || '';
      rawProtocol.sni = params.get('sni') || '';
    } else if (scheme === 'ss' || scheme === 'ssr' || scheme === 'shadowsocks') {
      const body = token.slice(`${scheme}://`.length).split('#')[0];
      // ss:// 支持 base64(方法:密码)@host:port 与 base64(方法:密码@host:port) 两种形态
      if (body.includes('@')) {
        const atIdx = body.lastIndexOf('@');
        rawProtocol.password = body.slice(0, atIdx);
        const hp = body.slice(atIdx + 1).split(':');
        host = hp[0] || '';
        port = parseInt(hp[1], 10) || 0;
      } else {
        const decoded = tryDecodeBase64(body);
        if (decoded) {
          const atIdx = decoded.lastIndexOf('@');
          rawProtocol.password = decoded.slice(0, atIdx);
          const hp = decoded.slice(atIdx + 1).split(':');
          host = hp[0] || '';
          port = parseInt(hp[1], 10) || 0;
        }
      }
    } else if (scheme.startsWith('hysteria') || scheme === 'hy2' || scheme === 'tuic') {
      const rest = token.slice(token.indexOf('://') + 3).split('#')[0];
      const authority = rest.split('?')[0];
      const atIdx = authority.lastIndexOf('@');
      const hp = (atIdx >= 0 ? authority.slice(atIdx + 1) : authority).split(':');
      host = hp[0] || '';
      port = parseInt(hp[1], 10) || 0;
    }
  } catch (e) {
    return null;
  }

  if (!host || !port) return null;

  return {
    id: generateId('node'),
    name: name || `${host}:${port}`,
    type: 'fixed',
    scheme: 'https', // 占位协议：用于 UI 展示，实际不可直接用
    protocol: scheme,
    directlyUsable: false,
    host,
    port,
    subId,
    subName: subName || (subId !== 'custom' ? subId : ''),
    rawProtocol,
    auth: { enabled: false, username: '', password: '' },
    color: '#6b7280',
    description: `来自订阅导入 · ${scheme.toUpperCase()} 加密协议节点（需本地客户端转换后才能使用）`
  };
}

/**
 * 轻量解析 Clash YAML 的 proxies 列表（零依赖，按缩进解析）
 */
export function parseClashYaml(yaml, subId = 'custom', defaultAuth = null, subName = '') {
  if (!yaml || typeof yaml !== 'string') return [];

  const lines = yaml.split(/\r?\n/);
  const proxies = [];
  let inProxies = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, '');
    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^proxies:\s*$/i.test(trimmed)) {
      inProxies = true;
      continue;
    }
    // 裸节点列表片段（无 proxies: 头，直接以 - name: 开头）
    if (!inProxies && /^- name:/.test(trimmed)) {
      inProxies = true;
    }
    if (/^[a-zA-Z0-9_-]+:\s*$/.test(trimmed) && !trimmed.startsWith('- ')) {
      if (inProxies && indent <= 0) inProxies = false; // 离开 proxies 顶层区块
    }
    if (!inProxies) continue;

    if (trimmed.startsWith('- ')) {
      if (current) proxies.push(current);
      current = { name: '', type: '', server: '', port: 0, username: '', password: '', tls: '' };
      const firstKey = trimmed.slice(2).match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (firstKey) {
        current[firstKey[1]] = firstKey[2].trim().replace(/^["']|["']$/g, '');
      }
    } else if (current) {
      const kv = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (kv) {
        let val = kv[2].trim();
        // 列表/映射类值跳过（如 port-hopping）
        if (val.startsWith('[') || val.startsWith('{') || val.startsWith('&')) continue;
        val = val.replace(/^["']|["']$/g, '');
        if (kv[1] === 'port') {
          current.port = parseInt(val, 10) || 0;
        } else if (['name', 'type', 'server', 'username', 'password', 'sni', 'network', 'security', 'tls'].includes(kv[1])) {
          current[kv[1]] = val;
        }
      }
    }
  }
  if (current) proxies.push(current);

  const nodes = [];
  const seen = new Set();

  for (const p of proxies) {
    if (!p.server || !p.port) continue;
    const type = (p.type || '').toLowerCase();
    const isTunnel = TUNNEL_PROTOCOLS.includes(type) || !PROXY_SCHEMES.includes(type);
    // Clash 中 type: http + tls: true 即 HTTPS 代理，浏览器原生支持
    const tlsEnabled = String(p.tls || '').toLowerCase() === 'true';
    const scheme = isTunnel ? 'https' : tlsEnabled ? 'https' : type;

    const auth = { enabled: false, username: '', password: '' };
    if (p.username) {
      auth.enabled = true;
      auth.username = p.username;
      auth.password = p.password || '';
    } else if (defaultAuth && defaultAuth.enabled && defaultAuth.username) {
      auth.enabled = true;
      auth.username = defaultAuth.username;
      auth.password = defaultAuth.password || '';
    }

    const nodeName = p.name || `${p.server}:${p.port}`;
    const isGhelper = isGhelperSource(p.server) || isGhelperSource(nodeName) || isGhelperSource(subName);

    const node = {
      id: generateId('node'),
      name: nodeName,
      type: 'fixed',
      scheme,
      protocol: isTunnel ? type : scheme,
      directlyUsable: !isTunnel,
      isGhelper,
      host: p.server,
      port: p.port,
      subId,
      subName: subName || (subId !== 'custom' ? subId : ''),
      auth,
      color: isTunnel ? '#6b7280' : pickNodeColor(p.server),
      description: isTunnel
        ? `来自订阅导入 · ${type.toUpperCase()} 加密协议节点（需本地客户端转换后才能使用）`
        : isGhelper
          ? `来自 Ghelper 订阅 · HTTPS 专线（Firefox 支持直接代理认证）`
          : `来自订阅导入 · ${scheme.toUpperCase()} 节点（浏览器可直接代理）`
    };

    if (!seen.has(node.id)) {
      seen.add(node.id);
      nodes.push(node);
    }
  }
  return nodes;
}

/**
 * 拉取远程订阅并解析为节点列表
 * @param {string} url 订阅地址
 * @param {string} subId 订阅 ID
 * @param {Object} [defaultAuth] 统一默认认证
 * @param {string} [subName] 订阅名称
 * @param {number} [timeoutMs]
 * @returns {Promise<{ nodes: Array, source: string, error?: string }>}
 */
export async function fetchSubscription(url, subId = 'custom', defaultAuth = null, subName = '', timeoutMs = 15000) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { nodes: [], source: url, error: '订阅地址无效，需以 http:// 或 https:// 开头' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Accept': '*/*'
      }
    });
    clearTimeout(timer);
    if (!res.ok) {
      let detail = '';
      if (res.status === 403) {
        detail = ' (HTTP 403: 服务器拒绝访问/Token可能已过期，可使用「粘贴导入」直接粘贴配置)';
      } else if (res.status === 404) {
        detail = ' (HTTP 404: 订阅地址不存在，请检查链接)';
      } else if (res.status >= 500) {
        detail = ` (HTTP ${res.status}: 订阅服务器内部错误)`;
      } else {
        detail = ` (HTTP ${res.status})`;
      }
      return { nodes: [], source: url, error: `订阅请求失败${detail}` };
    }
    const text = await res.text();
    const nodes = parseSubscriptionContent(text, subId, defaultAuth, subName);
    if (nodes.length === 0) {
      return { nodes: [], source: url, error: '订阅内容为空或格式无法识别（若为特殊格式请使用「粘贴导入」）' };
    }
    return { nodes, source: url };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    const msg = isTimeout ? '网络连接超时（请检查网络或使用「粘贴导入」）' : err.message;
    return { nodes: [], source: url, error: `订阅拉取失败: ${msg}` };
  }
}

/**
 * 尝试 Base64 解码（兼容 URL-safe 与 UTF-8），失败返回 null
 */
function tryDecodeBase64(input) {
  if (!input) return null;
  const candidates = [input, input.replace(/-/g, '+').replace(/_/g, '/')];
  for (const c of candidates) {
    const padded = c + '='.repeat((4 - (c.length % 4)) % 4);
    try {
      const decoded = decodeURIComponent(
        atob(padded)
          .split('')
          .map(ch => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
      );
      if (decoded && /[\x20-\x7e\u4e00-\u9fff]/.test(decoded)) return decoded;
    } catch (e) {
      // 尝试下一个候选
    }
  }
  return null;
}

/**
 * 根据主机名稳定生成节点颜色
 */
function pickNodeColor(host) {
  const palettes = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  let hash = 0;
  const s = String(host || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length];
}
