/**
 * MEIProxy - Dynamic PAC (Proxy Auto-Config) Script Builder
 * Compiles visual routing rules and profile configurations into standard Chromium PAC script.
 *
 * 重要：浏览器原生仅支持 HTTP/HTTPS/SOCKS4/SOCKS5 代理协议。对于订阅导入的
 * VMess / VLESS / Trojan / SS / SSR 等加密协议节点，浏览器无法直接代理，
 * 因此 formatProfileToPacString 在遇到 directlyUsable===false 的节点时会
 * 返回 'DIRECT'，避免 PAC 把流量引导到不存在的"伪 HTTP 代理"导致请求失败。
 */

/**
 * 判断 profile 是否可被浏览器原生代理直接使用
 * 对缺少 directlyUsable 字段的旧配置做向后兼容：按 scheme 字段判断
 */
function isProfileDirectlyUsable(profile) {
  if (!profile || profile.type !== 'fixed') return true;
  if (typeof profile.directlyUsable === 'boolean') return profile.directlyUsable;
  const proto = (profile.protocol || profile.scheme || 'http').toLowerCase();
  return ['http', 'https', 'socks5', 'socks4', 'socks'].includes(proto);
}

/**
 * 将 Profile 转换为 PAC 格式的代理指令字符串
 * @param {Object} profile
 * @returns {string} 例如 "PROXY 127.0.0.1:7890; DIRECT" 或 "SOCKS5 127.0.0.1:10808; SOCKS 127.0.0.1:10808; DIRECT" 或 "DIRECT"
 */
export function formatProfileToPacString(profile) {
  if (!profile || profile.type === 'direct' || profile.id === 'direct') {
    return 'DIRECT';
  }
  if (profile.type === 'system' || profile.id === 'system') {
    return 'SYSTEM'; // PAC 内部通常回退到 DIRECT 或系统默认
  }
  if (profile.type === 'fixed') {
    // 关键防护：加密协议节点（VMess/VLESS/Trojan/SS/SSR）浏览器无法直接代理，
    // 让规则匹配到这种节点时回退 DIRECT，避免 PAC 输出无效的 PROXY host:port
    if (!isProfileDirectlyUsable(profile)) {
      return 'DIRECT';
    }
    const { scheme, host, port } = profile;
    const cleanHost = (host || '127.0.0.1').trim();
    const cleanPort = port || 8080;

    switch ((scheme || 'http').toLowerCase()) {
      case 'socks5':
        return `SOCKS5 ${cleanHost}:${cleanPort}; SOCKS ${cleanHost}:${cleanPort}; DIRECT`;
      case 'socks4':
        return `SOCKS ${cleanHost}:${cleanPort}; DIRECT`;
      case 'https':
        return `HTTPS ${cleanHost}:${cleanPort}; PROXY ${cleanHost}:${cleanPort}; DIRECT`;
      case 'http':
      default:
        return `PROXY ${cleanHost}:${cleanPort}; DIRECT`;
    }
  }
  return 'DIRECT';
}

/**
 * 将通配符模式转为正则表达式源码 (例如 *.google.com -> ^([^.]+\.)*google\.com$)
 */
function wildcardToRegExpStr(pattern) {
  let p = pattern.trim();
  // 特殊处理以点号开头的域名规则，如 .google.com 匹配 google.com 和 *.google.com
  if (p.startsWith('.')) {
    p = '*' + p;
  }
  const escaped = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义正则保留字（除 * 与 ?）
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return `^${escaped}$`;
}

/**
 * 生成完整的 PAC 脚本
 * @param {Object} options
 * @param {Array} options.rules 规则数组
 * @param {Array} options.profiles 节点配置列表
 * @param {Array} options.bypassList 绕过列表
 * @param {string} options.defaultProfileId 默认回退节点 ID
 * @returns {string} 完整的可执行 PAC 脚本字符串
 */
export function buildPacScript({ rules = [], profiles = [], bypassList = [], defaultProfileId = 'direct' }) {
  const profileMap = new Map();
  profiles.forEach(p => {
    profileMap.set(p.id, formatProfileToPacString(p));
  });

  const defaultProxyString = profileMap.get(defaultProfileId) || 'DIRECT';

  // 1. 过滤并编译已启用的规则
  const compiledRules = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const targetProxyString = profileMap.get(rule.targetProfileId) || 'DIRECT';
    const pattern = (rule.pattern || '').trim();
    if (!pattern) continue;

    const ruleType = rule.type || 'wildcard';

    compiledRules.push({
      type: ruleType,
      pattern: pattern,
      target: targetProxyString,
      comment: rule.comment || ''
    });
  }

  // 2. 编译 Bypass 列表
  const cleanBypass = (bypassList || []).map(item => item.trim()).filter(Boolean);

  const pacCode = `
/**
 * MEIProxy Generated PAC Script
 * Generated at: ${new Date().toISOString()}
 */
var BYPASS_LIST = ${JSON.stringify(cleanBypass)};
var COMPILED_RULES = ${JSON.stringify(compiledRules)};
var DEFAULT_ACTION = ${JSON.stringify(defaultProxyString)};

function FindProxyForURL(url, host) {
  // 1. 本地直连检测
  if (isPlainHostName(host)) {
    return "DIRECT";
  }

  // 2. 绕过列表匹配 (Bypass List)
  for (var i = 0; i < BYPASS_LIST.length; i++) {
    var item = BYPASS_LIST[i];
    if (item === "<local>") {
      if (isPlainHostName(host) || host === "127.0.0.1" || host === "localhost") return "DIRECT";
    } else if (shExpMatch(host, item) || host === item) {
      return "DIRECT";
    }
  }

  // 3. 局域网私有 IP 范围直连
  if (
    isInNet(host, "10.0.0.0", "255.0.0.0") ||
    isInNet(host, "172.16.0.0", "255.240.0.0") ||
    isInNet(host, "192.168.0.0", "255.255.0.0") ||
    isInNet(host, "127.0.0.0", "255.0.0.0")
  ) {
    return "DIRECT";
  }

  // 4. 智能规则逐条匹配 (首条命中原则)
  var lowerHost = host.toLowerCase();
  var lowerUrl = url.toLowerCase();

  for (var j = 0; j < COMPILED_RULES.length; j++) {
    var r = COMPILED_RULES[j];
    var p = r.pattern.toLowerCase();

    try {
      if (r.type === 'exact') {
        if (lowerHost === p) {
          return r.target;
        }
      } else if (r.type === 'wildcard') {
        // 通配符匹配：支持通配表达式、根域名与多级子域名
        if (
          shExpMatch(lowerHost, p) ||
          shExpMatch(lowerUrl, p) ||
          (p.indexOf('*.') === 0 && (lowerHost === p.substring(2) || dnsDomainIs(lowerHost, p.substring(1)))) ||
          (p.indexOf('*') === -1 && (lowerHost === p || dnsDomainIs(lowerHost, '.' + p)))
        ) {
          return r.target;
        }
      } else if (r.type === 'keyword') {
        if (lowerHost.indexOf(p) !== -1 || lowerUrl.indexOf(p) !== -1) {
          return r.target;
        }
      } else if (r.type === 'regex') {
        var re = new RegExp(r.pattern, 'i');
        if (re.test(lowerHost) || re.test(url)) {
          return r.target;
        }
      }
    } catch (e) {
      // 规则执行容错，继续下一条
    }
  }

  // 5. 默认回退动作
  return DEFAULT_ACTION;
}
`.trim();

  return pacCode;
}
