/**
 * MEIProxy - Service Worker (Background Script)
 * Manages Chromium & Firefox Proxy Settings, Authentication, Badge Status, and Message Dispatching
 */

import { loadConfig, saveConfig, DEFAULT_SETTINGS, generateId } from './lib/storage.js';
import { buildPacScript, formatProfileToPacString } from './lib/pac_builder.js';

// 当前运行态配置缓存
let currentConfig = null;

/**
 * 检测是否处于 Firefox (Gecko) 内核环境
 */
function isFirefoxEnvironment() {
  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo) {
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Firefox')) {
    return true;
  }
  return false;
}

/**
 * 判断协议是否可被浏览器原生直接代理 (HTTP/HTTPS/SOCKS4/SOCKS5)
 */
function isProtocolDirectlyUsable(proto) {
  const p = (proto || '').toLowerCase();
  return ['http', 'https', 'socks5', 'socks4', 'socks'].includes(p);
}

/**
 * 检查 fixed 类型 profile 是否可被浏览器原生代理直接使用
 * @param {Object} profile
 * @returns {{ usable: boolean, reason: string }}
 */
function checkProfileDirectlyUsable(profile) {
  if (!profile || profile.type !== 'fixed') {
    return { usable: true, reason: '' };
  }

  if (typeof profile.directlyUsable === 'boolean') {
    if (!profile.directlyUsable) {
      const proto = (profile.protocol || '未知').toUpperCase();
      return {
        usable: false,
        reason: `${proto} 协议节点无法被浏览器直接代理，请先在本地启动客户端，再用其提供的本地 SOCKS5/HTTP 端口新建节点`
      };
    }
    return { usable: true, reason: '' };
  }

  const proto = (profile.protocol || profile.scheme || 'http').toLowerCase();
  if (!isProtocolDirectlyUsable(proto)) {
    return {
      usable: false,
      reason: `${proto.toUpperCase()} 协议节点无法被浏览器直接代理，请先在本地启动客户端，再用其提供的本地 SOCKS5/HTTP 端口新建节点`
    };
  }
  return { usable: true, reason: '' };
}

/**
 * 将配置应用到浏览器代理设置核心 (自动适配 Chromium 与 Firefox 内核)
 */
async function applyProxySettings(config) {
  if (!config) {
    config = await loadConfig();
  }
  currentConfig = config;

  const activeId = config.activeProfileId || 'auto_switch';
  const profile = config.profiles.find(p => p.id === activeId) || config.profiles[0];

  if (!profile) {
    console.error('[MEI Proxy] Active profile not found:', activeId);
    return;
  }

  // fixed 类型节点必须通过浏览器原生协议可用性校验，否则强制回退 direct
  let forcedFallbackToDirect = false;
  let fallbackReason = '';
  if (profile.type === 'fixed') {
    const check = checkProfileDirectlyUsable(profile);
    if (!check.usable) {
      forcedFallbackToDirect = true;
      fallbackReason = check.reason;
      console.warn(`[MEI Proxy] 节点「${profile.name}」(${profile.protocol || profile.scheme}) 不可直接代理: ${check.reason}`);
    }
  }

  const isFirefox = isFirefoxEnvironment();
  let proxySettingsValue = null;

  if (isFirefox) {
    // Firefox (Gecko) 代理配置规范
    switch (profile.type) {
      case 'direct':
        proxySettingsValue = { proxyType: 'none' };
        break;

      case 'system':
        proxySettingsValue = { proxyType: 'system' };
        break;

      case 'fixed': {
        if (forcedFallbackToDirect) {
          proxySettingsValue = { proxyType: 'none' };
          break;
        }
        const scheme = (profile.scheme || 'http').toLowerCase();
        const host = (profile.host || '127.0.0.1').trim();
        const port = parseInt(profile.port, 10) || 8080;
        const passthrough = (config.bypassList && config.bypassList.length > 0) ? config.bypassList.join(', ') : 'localhost, 127.0.0.1';

        if (scheme.startsWith('socks')) {
          proxySettingsValue = {
            proxyType: 'manual',
            socks: `${host}:${port}`,
            socksVersion: scheme === 'socks4' ? 4 : 5,
            passthrough: passthrough
          };
        } else if (scheme === 'https') {
          proxySettingsValue = {
            proxyType: 'manual',
            ssl: `${host}:${port}`,
            httpProxyAll: true,
            passthrough: passthrough
          };
        } else {
          proxySettingsValue = {
            proxyType: 'manual',
            http: `${host}:${port}`,
            httpProxyAll: true,
            passthrough: passthrough
          };
        }
        break;
      }

      case 'auto_switch': {
        const pacCode = buildPacScript({
          rules: filterUsableProfilesForPac(config.rules || [], config.profiles || []),
          profiles: config.profiles || [],
          bypassList: config.bypassList || [],
          defaultProfileId: profile.defaultProfileId || 'direct'
        });
        const pacBase64 = (typeof btoa === 'function')
          ? btoa(unescape(encodeURIComponent(pacCode)))
          : Buffer.from(pacCode).toString('base64');
        proxySettingsValue = {
          proxyType: 'autoConfig',
          autoConfigUrl: `data:application/x-ns-proxy-autoconfig;charset=utf-8;base64,${pacBase64}`
        };
        break;
      }

      case 'pac': {
        if (profile.url) {
          proxySettingsValue = {
            proxyType: 'autoConfig',
            autoConfigUrl: profile.url
          };
        } else {
          const pacCode = profile.script || 'function FindProxyForURL() { return "DIRECT"; }';
          const pacBase64 = (typeof btoa === 'function')
            ? btoa(unescape(encodeURIComponent(pacCode)))
            : Buffer.from(pacCode).toString('base64');
          proxySettingsValue = {
            proxyType: 'autoConfig',
            autoConfigUrl: `data:application/x-ns-proxy-autoconfig;charset=utf-8;base64,${pacBase64}`
          };
        }
        break;
      }

      default:
        proxySettingsValue = { proxyType: 'none' };
        break;
    }
  } else {
    // Chromium 代理配置规范
    switch (profile.type) {
      case 'direct':
        proxySettingsValue = { mode: 'direct' };
        break;

      case 'system':
        proxySettingsValue = { mode: 'system' };
        break;

      case 'fixed': {
        if (forcedFallbackToDirect) {
          proxySettingsValue = { mode: 'direct' };
          break;
        }
        const scheme = (profile.scheme || 'http').toLowerCase();
        const host = (profile.host || '127.0.0.1').trim();
        const port = parseInt(profile.port, 10) || 8080;
        const bypassList = (config.bypassList && config.bypassList.length > 0) ? config.bypassList : ['<local>'];

        proxySettingsValue = {
          mode: 'fixed_servers',
          rules: {
            singleProxy: {
              scheme: scheme,
              host: host,
              port: port
            },
            bypassList: bypassList
          }
        };
        break;
      }

      case 'auto_switch': {
        const pacCode = buildPacScript({
          rules: filterUsableProfilesForPac(config.rules || [], config.profiles || []),
          profiles: config.profiles || [],
          bypassList: config.bypassList || [],
          defaultProfileId: profile.defaultProfileId || 'direct'
        });

        proxySettingsValue = {
          mode: 'pac_script',
          pacScript: {
            data: pacCode,
            mandatory: true
          }
        };
        break;
      }

      case 'pac': {
        if (profile.url) {
          proxySettingsValue = {
            mode: 'pac_script',
            pacScript: { url: profile.url, mandatory: true }
          };
        } else {
          proxySettingsValue = {
            mode: 'pac_script',
            pacScript: { data: profile.script || 'function FindProxyForURL() { return "DIRECT"; }', mandatory: true }
          };
        }
        break;
      }

      default:
        proxySettingsValue = { mode: 'direct' };
        break;
    }
  }

  // 提交到 Proxy API (支持 Chrome 和 Firefox)
  const proxyApi = (typeof browser !== 'undefined' && browser.proxy) || (typeof chrome !== 'undefined' && chrome.proxy);

  if (proxyApi && proxyApi.settings) {
    proxyApi.settings.set(
      {
        value: proxySettingsValue,
        scope: 'regular'
      },
      () => {
        const lastErr = (typeof chrome !== 'undefined' && chrome.runtime?.lastError) || (typeof browser !== 'undefined' && browser.runtime?.lastError);
        if (lastErr) {
          console.error('[MEI Proxy] Error setting proxy:', lastErr.message);
        } else {
          if (forcedFallbackToDirect) {
            console.warn(`[MEI Proxy] 已回退到直接连接。原因: ${fallbackReason}`);
          } else {
            console.log('[MEI Proxy] Successfully applied proxy mode:', profile.type, profile.name);
          }
          updateBadge(profile, config, { forcedFallbackToDirect, fallbackReason });
        }
      }
    );
  }
}

/**
 * 过滤掉指向不可直接代理节点的分流规则
 */
function filterUsableProfilesForPac(rules, profiles) {
  const unusableIds = new Set();
  profiles.forEach(p => {
    if (p.type === 'fixed' && !checkProfileDirectlyUsable(p).usable) {
      unusableIds.add(p.id);
    }
  });
  if (unusableIds.size === 0) return rules;
  return rules.map(r => {
    if (unusableIds.has(r.targetProfileId)) {
      return { ...r, _unusableTarget: true };
    }
    return r;
  });
}

/**
 * 更新浏览器扩展图标角标 (Badge) 与 Tooltip
 */
function updateBadge(profile, config, status = {}) {
  const actionApi = (typeof chrome !== 'undefined' && chrome.action) ||
                    (typeof browser !== 'undefined' && browser.action) ||
                    (typeof browser !== 'undefined' && browser.browserAction) ||
                    (typeof chrome !== 'undefined' && chrome.browserAction);

  if (!actionApi) return;

  const showBadge = config?.general?.showBadge !== false;

  if (!showBadge) {
    if (actionApi.setBadgeText) actionApi.setBadgeText({ text: '' });
    return;
  }

  let badgeText = '';
  let badgeColor = profile?.color || '#3b82f6';
  let tooltipMode = profile?.name || '';

  if (status.forcedFallbackToDirect) {
    badgeText = '不支持';
    badgeColor = '#ef4444';
    tooltipMode = `${profile?.name || ''} (协议不支持 · 已回退直连)`;
  } else if (profile.type === 'direct') {
    badgeText = '直连';
  } else if (profile.type === 'system') {
    badgeText = '系统';
  } else if (profile.type === 'auto_switch') {
    badgeText = '分流';
  } else {
    const name = profile.name || '';
    if (/[\u4e00-\u9fa5]/.test(name)) {
      badgeText = name.slice(0, 2);
    } else {
      badgeText = (name.replace(/[^a-zA-Z0-9]/g, '') || 'PROX').slice(0, 4).toUpperCase();
    }
  }

  if (actionApi.setBadgeText) {
    actionApi.setBadgeText({ text: badgeText });
  }
  if (actionApi.setBadgeBackgroundColor) {
    actionApi.setBadgeBackgroundColor({ color: badgeColor });
  }
  if (actionApi.setTitle) {
    const fallbackHint = status.forcedFallbackToDirect
      ? `\n⚠️ ${status.fallbackReason || '该协议无法被浏览器直接代理'}`
      : '';
    actionApi.setTitle({
      title: `MEI Proxy\n当前模式: ${tooltipMode}\n协议: ${profile.type.toUpperCase()}${fallbackHint}`
    });
  }
}

/**
 * 处理代理服务器账号密码认证请求
 */
if (chrome.webRequest && chrome.webRequest.onAuthRequired) {
  const authListener = (details, asyncCallback) => {
    if (!details.isProxy) {
      if (asyncCallback) asyncCallback({});
      return {};
    }

    const resolveAuth = async () => {
      try {
        let config = currentConfig;
        if (!config) {
          config = await loadConfig();
        }

        const profiles = config?.profiles || [];
        const activeId = config?.activeProfileId;
        const activeProfile = profiles.find(p => p.id === activeId);

        // 1. 优先检查当前激活选中的 fixed 代理节点
        if (activeProfile && activeProfile.type === 'fixed' && activeProfile.auth && activeProfile.auth.enabled && activeProfile.auth.username) {
          return {
            authCredentials: {
              username: activeProfile.auth.username,
              password: activeProfile.auth.password || ''
            }
          };
        }

        // 2. 根据 challenger host / port 遍历匹配全部已配置认证的 profile
        const challengerHost = (details.challenger?.host || '').toLowerCase().trim();
        const challengerPort = details.challenger?.port ? parseInt(details.challenger.port, 10) : 0;

        for (const p of profiles) {
          if (p.auth && p.auth.enabled && p.auth.username) {
            const pHost = (p.host || '').toLowerCase().trim();
            const pPort = p.port ? parseInt(p.port, 10) : 0;

            if (
              (challengerHost && (challengerHost === pHost || challengerHost.includes(pHost) || pHost.includes(challengerHost))) ||
              (challengerPort && pPort && challengerPort === pPort)
            ) {
              return {
                authCredentials: {
                  username: p.auth.username,
                  password: p.auth.password || ''
                }
              };
            }
          }
        }
        return {};
      } catch (err) {
        console.error('[MEIProxy] Error resolving auth:', err);
        return {};
      }
    };

    if (asyncCallback) {
      resolveAuth().then(response => {
        asyncCallback(response || {});
      });
    } else {
      return resolveAuth();
    }
  };

  try {
    chrome.webRequest.onAuthRequired.addListener(
      authListener,
      { urls: ['<all_urls>'] },
      ['asyncBlocking']
    );
  } catch (err) {
    try {
      chrome.webRequest.onAuthRequired.addListener(
        authListener,
        { urls: ['<all_urls>'] },
        ['blocking']
      );
    } catch (e2) {
      console.warn('[MEIProxy] Failed to register onAuthRequired listener:', e2);
    }
  }
}

/**
 * 消息通信监听器
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  if (action === 'GET_CONFIG') {
    loadConfig().then(config => {
      currentConfig = config;
      sendResponse({ success: true, config });
    });
    return true;
  }

  if (action === 'SET_ACTIVE_PROFILE') {
    loadConfig().then(async (config) => {
      config.activeProfileId = payload.profileId;
      await saveConfig(config);
      await applyProxySettings(config);
      sendResponse({ success: true, config });
    });
    return true;
  }

  if (action === 'SAVE_FULL_CONFIG') {
    saveConfig(payload.config).then(async () => {
      await applyProxySettings(payload.config);
      sendResponse({ success: true });
    });
    return true;
  }

  if (action === 'ADD_RULE') {
    loadConfig().then(async (config) => {
      const newRule = {
        id: generateId('rule'),
        enabled: true,
        type: payload.type || 'wildcard',
        pattern: payload.pattern,
        targetProfileId: payload.targetProfileId,
        comment: payload.comment || `来自快捷添加 (${new Date().toLocaleDateString()})`
      };
      config.rules = [newRule, ...(config.rules || [])];
      await saveConfig(config);
      await applyProxySettings(config);
      sendResponse({ success: true, rule: newRule, config });
    });
    return true;
  }

  if (action === 'RELOAD_PROXY') {
    loadConfig().then(async (config) => {
      await applyProxySettings(config);
      sendResponse({ success: true });
    });
    return true;
  }
});

/**
 * 扩展安装或更新初始化
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[MEIProxy] Extension installed / updated:', details.reason);
  const config = await loadConfig();
  await applyProxySettings(config);
});

/**
 * 浏览器启动初始化
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[MEIProxy] Browser startup');
  const config = await loadConfig();
  await applyProxySettings(config);
});

// 监听 storage 变更以保持多窗口同步
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.meiproxy_config) {
      currentConfig = changes.meiproxy_config.newValue;
      applyProxySettings(currentConfig);
    }
  });
}
