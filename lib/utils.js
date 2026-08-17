/**
 * MEIProxy - Utility Helper Functions
 * Includes URL parsing, IP testing, Latency measurement, and Rule simulation
 */

/**
 * 从 URL 中提取主机名和顶级通配符模式
 * @param {string} urlString 
 * @returns {{ host: string, domainPattern: string, protocol: string }}
 */
export function extractDomainInfo(urlString) {
  if (!urlString) return { host: '', domainPattern: '', protocol: '' };
  try {
    const url = new URL(urlString);
    const host = url.hostname;
    const protocol = url.protocol.replace(':', '');

    // 计算顶级/二级通配符，如 sub.example.com -> *.example.com
    const parts = host.split('.');
    let domainPattern = host;
    if (parts.length >= 2 && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      if (parts.length > 2) {
        domainPattern = `*.${parts.slice(-2).join('.')}`;
      } else {
        domainPattern = `*.${host}`;
      }
    }

    return { host, domainPattern, protocol };
  } catch {
    return { host: urlString, domainPattern: `*.${urlString}`, protocol: 'http' };
  }
}

/**
 * 测试当前出口 IP 与地理位置信息
 * @returns {Promise<{ ip: string, country?: string, city?: string, org?: string, error?: string }>}
 */
export async function fetchCurrentIpInfo() {
  const apis = [
    {
      url: 'https://api.myip.la/cn?json',
      parser: (data) => ({
        ip: data.ip,
        country: data.location?.country_name || data.location?.country_code,
        city: data.location?.city
      })
    },
    {
      url: 'https://ipwho.is/',
      parser: (data) => ({
        ip: data.ip,
        country: data.country,
        city: data.city,
        org: data.connection?.isp || data.connection?.org
      })
    },
    {
      url: 'https://api.ipify.org?format=json',
      parser: (data) => ({ ip: data.ip })
    }
  ];

  for (const api of apis) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(api.url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        const info = api.parser(json);
        if (info.ip) return info;
      }
    } catch {
      // 尝试下一个备用 API
    }
  }

  return { ip: '未知或检测超时', error: '无法获取出口 IP' };
}

/**
 * 测速探测 (测试节点延迟)
 * @param {string} testUrl 测速探测地址
 * @returns {Promise<{ latency: number, success: boolean }>} 毫秒
 */
export async function measureLatency(testUrl = 'https://www.gstatic.com/generate_204') {
  const startTime = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    // 加随机参数防止 HTTP 缓存
    const cacheBusterUrl = `${testUrl}${testUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    await fetch(cacheBusterUrl, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);
    return { latency, success: true };
  } catch {
    return { latency: -1, success: false };
  }
}

/**
 * 模拟规则匹配 (用于 Options 页面中的实时匹配调试器)
 * @param {string} testUrl 输入的待测试 URL 或域名
 * @param {Array} rules 规则列表
 * @param {Array} bypassList 绕过列表
 * @param {string} defaultProfileId 默认回退节点 ID
 * @returns {{ matchedRule: Object|null, targetProfileId: string, matchType: string }}
 */
export function simulateRuleMatch(testUrl, rules = [], bypassList = [], defaultProfileId = 'direct') {
  if (!testUrl) return { matchedRule: null, targetProfileId: defaultProfileId, matchType: 'default' };

  let host = testUrl.trim();
  let url = testUrl.trim();

  try {
    if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
      url = 'https://' + testUrl;
    }
    const parsed = new URL(url);
    host = parsed.hostname;
  } catch {
    host = testUrl;
  }

  const lowerHost = host.toLowerCase();
  const lowerUrl = url.toLowerCase();

  // 1. Bypass 检查
  for (const bypass of bypassList) {
    const item = bypass.trim().toLowerCase();
    if (!item) continue;
    if (item === '<local>' && (!host.includes('.') || host === '127.0.0.1' || host === 'localhost')) {
      return { matchedRule: { pattern: '<local>', comment: '本地/局域网绕过' }, targetProfileId: 'direct', matchType: 'bypass' };
    }
    if (item === lowerHost || matchWildcard(lowerHost, item)) {
      return { matchedRule: { pattern: item, comment: '绕过名单规则' }, targetProfileId: 'direct', matchType: 'bypass' };
    }
  }

  // 2. 规则列表检查
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const pattern = (rule.pattern || '').trim().toLowerCase();
    if (!pattern) continue;

    const ruleType = rule.type || 'wildcard';

    if (ruleType === 'exact') {
      if (lowerHost === pattern) {
        return { matchedRule: rule, targetProfileId: rule.targetProfileId, matchType: 'rule' };
      }
    } else if (ruleType === 'wildcard') {
      if (matchWildcard(lowerHost, pattern) || matchWildcard(lowerUrl, pattern)) {
        return { matchedRule: rule, targetProfileId: rule.targetProfileId, matchType: 'rule' };
      }
    } else if (ruleType === 'keyword') {
      if (lowerHost.includes(pattern) || lowerUrl.includes(pattern)) {
        return { matchedRule: rule, targetProfileId: rule.targetProfileId, matchType: 'rule' };
      }
    } else if (ruleType === 'regex') {
      try {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(lowerHost) || re.test(url)) {
          return { matchedRule: rule, targetProfileId: rule.targetProfileId, matchType: 'rule' };
        }
      } catch {
        // 忽略无效正则
      }
    }
  }

  // 3. 回退默认
  return { matchedRule: null, targetProfileId: defaultProfileId, matchType: 'default' };
}

/**
 * 判断 IP 是否属于 CIDR 子网 (如 192.168.1.1 属于 192.168.0.0/16)
 */
function ipInCidr(ip, cidr) {
  if (!cidr.includes('/')) return false;
  const [range, bits = 32] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
  const ipToInt = (ipStr) => ipStr.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  try {
    return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
  } catch {
    return false;
  }
}

/**
 * 通配符与子网匹配辅助函数
 */
function matchWildcard(str, rule) {
  if (!rule || !str) return false;
  const s = str.trim().toLowerCase();
  const r = rule.trim().toLowerCase();

  if (r === '*' || r === '*.*') return true;

  // CIDR 检测
  if (r.includes('/') && /^\d+\.\d+\.\d+\.\d+$/.test(s)) {
    return ipInCidr(s, r);
  }
  
  // 处理 *.example.com 也能匹配 example.com 的常见场景
  if (r.startsWith('*.')) {
    const baseDomain = r.slice(2);
    if (s === baseDomain) return true;
  }

  // 安全转义除 * 和 ? 之外的字符
  const escaped = r
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  try {
    const regex = new RegExp(`^${escaped}$`, 'i');
    return regex.test(s);
  } catch {
    return false;
  }
}

/**
 * 智能识别节点名称中的地区代码与国旗 Emoji
 * @param {string} nodeName 
 * @returns {{ code: string, name: string, flag: string }}
 */
export function detectNodeRegion(nodeName) {
  if (!nodeName || typeof nodeName !== 'string') {
    return { code: 'OTHER', name: '其它', flag: '🌐' };
  }

  const n = nodeName.toLowerCase();

  // 香港
  if (n.includes('香港') || n.includes('hongkong') || n.includes('hong kong') || /\bhk\b/i.test(nodeName) || nodeName.includes('🇭🇰')) {
    return { code: 'HK', name: '香港', flag: '🇭🇰' };
  }
  // 日本
  if (n.includes('日本') || n.includes('japan') || n.includes('tokyo') || n.includes('osaka') || /\bjp\b/i.test(nodeName) || nodeName.includes('🇯🇵')) {
    return { code: 'JP', name: '日本', flag: '🇯🇵' };
  }
  // 美国
  if (n.includes('美国') || n.includes('usa') || n.includes('america') || n.includes('los angeles') || n.includes('california') || n.includes('silicon') || /\bus\b/i.test(nodeName) || nodeName.includes('🇺🇸')) {
    return { code: 'US', name: '美国', flag: '🇺🇸' };
  }
  // 新加坡
  if (n.includes('新加坡') || n.includes('singapore') || n.includes('狮城') || /\bsg\b/i.test(nodeName) || nodeName.includes('🇸🇬')) {
    return { code: 'SG', name: '新加坡', flag: '🇸🇬' };
  }
  // 台湾
  if (n.includes('台湾') || n.includes('taiwan') || n.includes('taipei') || /\btw\b/i.test(nodeName) || nodeName.includes('🇹🇼')) {
    return { code: 'TW', name: '台湾', flag: '🇹🇼' };
  }
  // 韩国
  if (n.includes('韩国') || n.includes('korea') || n.includes('seoul') || /\bkr\b/i.test(nodeName) || nodeName.includes('🇰🇷')) {
    return { code: 'KR', name: '韩国', flag: '🇰🇷' };
  }
  // 英国
  if (n.includes('英国') || n.includes('britain') || n.includes('london') || n.includes('england') || /\buk\b/i.test(nodeName) || /\bgb\b/i.test(nodeName) || nodeName.includes('🇬🇧')) {
    return { code: 'UK', name: '英国', flag: '🇬🇧' };
  }
  // 德国
  if (n.includes('德国') || n.includes('germany') || n.includes('frankfurt') || /\bde\b/i.test(nodeName) || nodeName.includes('🇩🇪')) {
    return { code: 'DE', name: '德国', flag: '🇩🇪' };
  }
  // 加拿大
  if (n.includes('加拿大') || n.includes('canada') || /\bca\b/i.test(nodeName) || nodeName.includes('🇨🇦')) {
    return { code: 'CA', name: '加拿大', flag: '🇨🇦' };
  }
  // 澳大利亚
  if (n.includes('澳大利亚') || n.includes('澳洲') || n.includes('australia') || n.includes('sydney') || /\bau\b/i.test(nodeName) || nodeName.includes('🇦🇺')) {
    return { code: 'AU', name: '澳大利亚', flag: '🇦🇺' };
  }
  // 法国
  if (n.includes('法国') || n.includes('france') || n.includes('paris') || /\bfr\b/i.test(nodeName) || nodeName.includes('🇫🇷')) {
    return { code: 'FR', name: '法国', flag: '🇫🇷' };
  }
  // 中国
  if (n.includes('中国') || n.includes('china') || n.includes('国内') || n.includes('回国') || /\bcn\b/i.test(nodeName) || nodeName.includes('🇨🇳')) {
    return { code: 'CN', name: '中国', flag: '🇨🇳' };
  }

  return { code: 'OTHER', name: '其它', flag: '🌐' };
}
