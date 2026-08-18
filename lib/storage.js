/**
 * MEIProxy - Storage & Configuration Management
 * Handles persistent settings, default profiles, and rules
 */

export const DEFAULT_PROFILES = [
  {
    id: 'direct',
    name: '直接连接 (Direct)',
    type: 'direct',
    color: '#10b981', // emerald green
    builtIn: true,
    description: '不使用任何代理，所有网络流量直接连接目标服务器'
  },
  {
    id: 'system',
    name: '系统代理 (System)',
    type: 'system',
    color: '#6b7280', // gray
    builtIn: true,
    description: '使用操作系统默认的网络代理设置'
  },
  {
    id: 'auto_switch',
    name: '智能分流 (Auto Switch)',
    type: 'auto_switch',
    color: '#8b5cf6', // purple
    builtIn: true,
    defaultProfileId: 'direct', // fallback if no rule matches
    description: '根据预设的网址规则，智能分流匹配不同的代理节点'
  },
  {
    id: 'clash_default',
    name: 'Clash 本地混合端口',
    type: 'fixed',
    scheme: 'http',
    protocol: 'http',
    directlyUsable: true,
    host: '127.0.0.1',
    port: 7897,
    color: '#3b82f6', // blue
    builtIn: false,
    auth: { enabled: false, username: '', password: '' },
    description: '默认 Clash / Meta 混合代理端口 7897'
  },
  {
    id: 'socks5_local',
    name: 'SOCKS5 本地节点',
    type: 'fixed',
    scheme: 'socks5',
    protocol: 'socks5',
    directlyUsable: true,
    host: '127.0.0.1',
    port: 10808,
    color: '#f59e0b', // amber
    builtIn: false,
    auth: { enabled: false, username: '', password: '' },
    description: '本地通用 SOCKS5 代理端口 10808'
  }
];

export const DEFAULT_RULES = [
  {
    id: 'rule_google',
    enabled: true,
    type: 'wildcard',
    pattern: '*.google.com',
    targetProfileId: 'clash_default',
    comment: 'Google 核心服务'
  },
  {
    id: 'rule_gstatic',
    enabled: true,
    type: 'wildcard',
    pattern: '*.gstatic.com',
    targetProfileId: 'clash_default',
    comment: 'Google 静态资源'
  },
  {
    id: 'rule_youtube',
    enabled: true,
    type: 'wildcard',
    pattern: '*.youtube.com',
    targetProfileId: 'clash_default',
    comment: 'YouTube 视频网站'
  },
  {
    id: 'rule_github',
    enabled: true,
    type: 'wildcard',
    pattern: '*.github.com',
    targetProfileId: 'clash_default',
    comment: 'GitHub 开发者平台'
  },
  {
    id: 'rule_githubusercontent',
    enabled: true,
    type: 'wildcard',
    pattern: '*.githubusercontent.com',
    targetProfileId: 'clash_default',
    comment: 'GitHub 用户资源与文件'
  },
  {
    id: 'rule_openai',
    enabled: true,
    type: 'wildcard',
    pattern: '*.openai.com',
    targetProfileId: 'clash_default',
    comment: 'OpenAI 官方服务'
  },
  {
    id: 'rule_anthropic',
    enabled: true,
    type: 'wildcard',
    pattern: '*.anthropic.com',
    targetProfileId: 'clash_default',
    comment: 'Anthropic Claude'
  },
  {
    id: 'rule_local_lan',
    enabled: true,
    type: 'wildcard',
    pattern: '192.168.*',
    targetProfileId: 'direct',
    comment: '局域网 IP 直连'
  }
];

export const DEFAULT_BYPASS_LIST = [
  '<local>',
  'localhost',
  '127.0.0.1',
  '::1',
  '192.168.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12'
];

export const DEFAULT_PAC_SCRIPT = `function FindProxyForURL(url, host) {
  // 本地主机名直接连接
  if (isPlainHostName(host) || shExpMatch(host, "*.local") || isInNet(host, "127.0.0.0", "255.0.0.0") || isInNet(host, "192.168.0.0", "255.255.0.0")) {
    return "DIRECT";
  }

  // 示例规则：特定域名走 HTTP 代理
  if (shExpMatch(host, "*.google.com") || shExpMatch(host, "*.github.com")) {
    return "PROXY 127.0.0.1:7890; DIRECT";
  }

  // 默认直连
  return "DIRECT";
}`;

export const DEFAULT_SETTINGS = {
  activeProfileId: 'auto_switch', // 默认激活智能分流模式
  profiles: DEFAULT_PROFILES,
  rules: DEFAULT_RULES,
  savedRuleSets: [], // 用户存储与预置规则集
  subscriptions: [], // 节点订阅源列表 { id, name, url, defaultAuth, autoUpdate, lastSyncAt }
  bypassList: DEFAULT_BYPASS_LIST,
  customPac: {
    enabled: false,
    url: '',
    script: DEFAULT_PAC_SCRIPT
  },
  general: {
    showBadge: true,
    theme: 'auto', // 'auto' | 'dark' | 'light'
    notifyOnSwitch: true,
    autoCheckIp: true,
    autoUpdateInterval: '12h' // 'off' | '6h' | '12h' | '24h'
  }
};

function sanitizeConfig(config) {
  if (!config) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  let profiles = Array.isArray(config.profiles) ? [...config.profiles] : [];
  
  // 1. 确保 built-in 模式节点（direct, system, auto_switch）永远存在且置顶
  const builtInProfiles = DEFAULT_PROFILES.filter(p => p.builtIn);
  for (const bp of builtInProfiles) {
    if (!profiles.some(p => p.id === bp.id)) {
      profiles.unshift(bp);
    }
  }

  // 2. 如果没有任何 fixed 代理节点，自动补全默认 7897 节点
  const hasFixed = profiles.some(p => p.type === 'fixed');
  if (!hasFixed) {
    const defaultFixed = DEFAULT_PROFILES.filter(p => p.type === 'fixed');
    profiles.push(...defaultFixed);
  }

  return {
    ...DEFAULT_SETTINGS,
    ...config,
    profiles: profiles,
    rules: Array.isArray(config.rules) && config.rules.length > 0 ? config.rules : DEFAULT_RULES,
    bypassList: Array.isArray(config.bypassList) ? config.bypassList : DEFAULT_BYPASS_LIST,
    savedRuleSets: Array.isArray(config.savedRuleSets) ? config.savedRuleSets : [],
    subscriptions: Array.isArray(config.subscriptions) ? config.subscriptions : [],
    general: { ...DEFAULT_SETTINGS.general, ...(config.general || {}) }
  };
}

/**
 * 读写存储封装 (支持 chrome.storage.local 与 localStorage 回退)
 */
export async function loadConfig() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['meiproxy_config'], (result) => {
        if (result && result.meiproxy_config) {
          resolve(sanitizeConfig(result.meiproxy_config));
        } else {
          resolve(sanitizeConfig(DEFAULT_SETTINGS));
        }
      });
    });
  } else {
    try {
      const data = localStorage.getItem('meiproxy_config');
      return data ? sanitizeConfig(JSON.parse(data)) : sanitizeConfig(DEFAULT_SETTINGS);
    } catch {
      return sanitizeConfig(DEFAULT_SETTINGS);
    }
  }
}

export async function saveConfig(config) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ meiproxy_config: config }, () => {
        resolve(true);
      });
    });
  } else {
    localStorage.setItem('meiproxy_config', JSON.stringify(config));
    return true;
  }
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}
