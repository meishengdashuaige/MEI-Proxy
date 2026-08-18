/**
 * MEIProxy - Service Worker (Background Script)
 * Manages Chromium & Firefox Proxy Settings, Authentication, Badge Status, and Message Dispatching
 */

import { loadConfig, saveConfig, DEFAULT_SETTINGS, generateId } from './lib/storage.js';
import { buildPacScript, formatProfileToPacString } from './lib/pac_builder.js';
import { fetchSubscription, parseSubscriptionContent } from './lib/subscription.js';
import { simulateRuleMatch, isProfileDirectlyUsable, isGhelperSource, detectBrowserEnvironment } from './lib/utils.js';

// 当前运行态配置缓存
let currentConfig = null;

/**
 * 检测是否处于 Firefox (Gecko) 内核环境
 */
function isFirefoxEnvironment() {
  return detectBrowserEnvironment().isFirefox;
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

  const usable = isProfileDirectlyUsable(profile);
  if (!usable) {
    const proto = (profile.protocol || profile.scheme || '未知').toUpperCase();
    return {
      usable: false,
      reason: `${proto} 协议为复杂加密协议，浏览器原生仅支持 HTTP/HTTPS/SOCKS5，无法直接代理。请在本地启动客户端并在插件中添加其本地端口。`
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

  // Firefox 认证直连模式：配置中存在带认证的节点时，由 onRequest 全权接管代理决策
  // （browser.proxy.onRequest 返回的 ProxyInfo 可携带 proxyAuthorizationHeader，
  //   主动注入认证，解决 Ghelper 等"非挑战式认证"节点无法直连的问题）
  if (isFirefox && (config.profiles || []).some(p =>
    p.type === 'fixed' && p.auth && p.auth.enabled && p.auth.username
  )) {
    ensureFirefoxAuthProxy();
    updateBadge(profile, config, {});
    return;
  }
  removeFirefoxAuthProxy();

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
 * 同步单个订阅源：拉取 → 解析 → 替换该订阅下的旧节点 → 保存并生效
 * @param {string} subId 订阅 ID
 * @param {Object} [config] 配置（可传入避免重复加载）
 * @returns {Promise<{success: boolean, nodes?: number, error?: string}>}
 */
async function syncSubscription(subId, config) {
  if (!config) config = await loadConfig();
  const sub = (config.subscriptions || []).find(s => s.id === subId);
  if (!sub) return { success: false, error: '订阅不存在，请先在设置中添加' };

  const isFirefox = isFirefoxEnvironment();
  if (!isFirefox && (isGhelperSource(sub.url) || isGhelperSource(sub.name))) {
    return {
      success: false,
      error: 'Chrome / Chromium 浏览器不支持 Ghelper 节点直连（由于 Chrome 无法主动发送代理认证头，而 Ghelper 服务器返回 403 阻断了 407 握手）。请在 Firefox 浏览器中使用或配合本地客户端。'
    };
  }

  const { nodes, error } = await fetchSubscription(sub.url, subId, sub.defaultAuth, sub.name);
  if (error || !nodes || nodes.length === 0) {
    return { success: false, error: error || '订阅内容为空或格式无法识别' };
  }

  // 仅替换该订阅导入的固定节点（保留内置与手动添加的节点）
  const kept = (config.profiles || []).filter(p => !(p.subId === subId && p.type === 'fixed'));
  config.profiles = [...kept, ...nodes];
  sub.lastSyncAt = new Date().toISOString();
  await saveConfig(config);
  await applyProxySettings(config);
  return { success: true, nodes: nodes.length, name: sub.name };
}

/**
 * 同步所有启用自动更新的订阅源
 */
async function syncAllSubscriptions(config) {
  if (!config) config = await loadConfig();
  const subs = (config.subscriptions || []).filter(s => s.autoUpdate !== false);
  const results = [];
  for (const sub of subs) {
    results.push(await syncSubscription(sub.id, config));
  }
  return results;
}

/**
 * ============================================================
 * Firefox 认证直连模式 (browser.proxy.onRequest)
 * ============================================================
 * 背景：Ghelper 等机场节点对"无认证 CONNECT"返回 403 而非标准 407，
 *       Chrome 扩展只能靠 407 触发 onAuthRequired，因此无法直连。
 *       Firefox 的 ProxyInfo 支持 proxyAuthorizationHeader 字段：
 *       浏览器会在 CONNECT 请求中主动携带 Proxy-Authorization，
 *       专门用于"非挑战式认证"（non-challenging authentication）的代理。
 *       因此 Firefox 系浏览器可以纯插件直连 Ghelper 认证节点。
 */

let firefoxAuthProxyActive = false;

/**
 * 根据 profile 构造 Firefox ProxyInfo（含认证头注入）
 */
function buildFirefoxProxyInfo(profile) {
  if (!profile || profile.type === 'direct' || profile.id === 'direct') {
    return { type: 'direct' };
  }
  if (profile.type === 'system') {
    // onRequest 不支持 system，回退直连（保留 settings 路径的场景不受影响）
    return { type: 'direct' };
  }
  if (profile.type !== 'fixed') {
    return { type: 'direct' };
  }
  // 加密协议节点（VMess/VLESS/Trojan/SS 等）浏览器无法直接代理
  if (profile.directlyUsable === false) {
    return { type: 'direct' };
  }

  const scheme = (profile.scheme || profile.protocol || 'http').toLowerCase();
  if (!['http', 'https', 'socks', 'socks4', 'socks5'].includes(scheme)) {
    return { type: 'direct' };
  }

  const info = {
    type: scheme.startsWith('socks') ? (scheme === 'socks4' ? 'socks4' : 'socks') : scheme,
    host: (profile.host || '').trim(),
    port: parseInt(profile.port, 10) || 8080
  };
  if (!info.host) return { type: 'direct' };

  const auth = profile.auth || {};
  if (info.type === 'socks' || info.type === 'socks4') {
    // SOCKS 使用 ProxyInfo 的 username/password 字段
    if (auth.enabled && auth.username) {
      info.username = auth.username;
      info.password = auth.password || '';
    }
  } else if (auth.enabled && auth.username) {
    // HTTP/HTTPS 代理：通过 proxyAuthorizationHeader 主动携带认证 (标准 HTTP Basic Auth 格式)
    const cred = auth.username + ':' + (auth.password || '');
    const b64 = (typeof btoa === 'function')
      ? btoa(unescape(encodeURIComponent(cred)))
      : Buffer.from(cred, 'utf8').toString('base64');
    info.proxyAuthorizationHeader = `Basic ${b64}`;
  }
  return info;
}

/**
 * Firefox onRequest 监听器：为每个请求决定代理并注入认证
 */
async function handleFirefoxProxyRequest(requestInfo) {
  const reqUrl = requestInfo.url || '';

  // 0. 测速与连通性探测请求强制 DIRECT 直连（不走代理）
  if (
    reqUrl.includes('__direct_test=1') ||
    reqUrl.includes('connectivitycheck.gstatic.com') ||
    reqUrl.includes('cp.cloudflare.com') ||
    reqUrl.includes('1.1.1.1/cdn-cgi/trace')
  ) {
    return { type: 'direct' };
  }

  const config = currentConfig || await loadConfig();
  const activeId = config.activeProfileId || 'auto_switch';
  const activeProfile = config.profiles.find(p => p.id === activeId) || config.profiles[0];
  if (!activeProfile) return { type: 'direct' };

  if (activeProfile.type === 'auto_switch') {
    const match = simulateRuleMatch(
      reqUrl,
      config.rules || [],
      config.bypassList || [],
      activeProfile.defaultProfileId || 'direct'
    );
    const target = config.profiles.find(p => p.id === match.targetProfileId);
    return buildFirefoxProxyInfo(target);
  }
  return buildFirefoxProxyInfo(activeProfile);
}

/**
 * 注册 Firefox onRequest 认证直连监听器
 */
function ensureFirefoxAuthProxy() {
  if (firefoxAuthProxyActive) return;
  if (typeof browser === 'undefined' || !browser.proxy || !browser.proxy.onRequest) return;
  try {
    browser.proxy.onRequest.addListener(handleFirefoxProxyRequest, { urls: ['<all_urls>'] });
    if (browser.proxy.onError) {
      browser.proxy.onError.addListener((err) => {
        console.error('[MEIProxy] proxy.onError:', err);
      });
    }
    firefoxAuthProxyActive = true;
    console.log('[MEIProxy] Firefox 认证直连模式已启用 (onRequest + proxyAuthorizationHeader)');
  } catch (err) {
    console.error('[MEIProxy] 注册 Firefox onRequest 失败:', err);
  }
}

/**
 * 注销 Firefox onRequest 认证直连监听器
 */
function removeFirefoxAuthProxy() {
  if (!firefoxAuthProxyActive) return;
  try {
    browser.proxy.onRequest.removeListener(handleFirefoxProxyRequest);
  } catch (e) {
    // 忽略
  }
  firefoxAuthProxyActive = false;
}

/**
 * 消息通信监听器 (同时完美兼容 Firefox Promise 与 Chromium sendResponse)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message || {};

  const handleAsync = async () => {
    try {
      if (action === 'GET_CONFIG') {
        const config = await loadConfig();
        currentConfig = config;
        return { success: true, config };
      }

      if (action === 'SET_ACTIVE_PROFILE') {
        const config = await loadConfig();
        config.activeProfileId = payload.profileId;
        await saveConfig(config);
        await applyProxySettings(config);
        return { success: true, config };
      }

      if (action === 'SAVE_FULL_CONFIG') {
        await saveConfig(payload.config);
        await applyProxySettings(payload.config);
        return { success: true };
      }

      if (action === 'ADD_RULE') {
        const config = await loadConfig();
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
        return { success: true, rule: newRule, config };
      }

      if (action === 'RELOAD_PROXY') {
        const config = await loadConfig();
        await applyProxySettings(config);
        return { success: true };
      }

      if (action === 'SYNC_SUBSCRIPTION') {
        return await syncSubscription(payload?.subId);
      }

      if (action === 'SYNC_ALL_SUBSCRIPTIONS') {
        const results = await syncAllSubscriptions();
        return { success: true, results };
      }

      if (action === 'SAVE_SUBSCRIPTIONS') {
        const config = await loadConfig();
        config.subscriptions = payload?.subscriptions || [];
        await saveConfig(config);
        return { success: true };
      }

      if (action === 'IMPORT_SUBSCRIPTION_CONTENT') {
        const config = await loadConfig();
        const { name, content } = payload || {};
        const subName = name || '粘贴导入';

        const isFirefox = isFirefoxEnvironment();
        if (!isFirefox && (isGhelperSource(content) || isGhelperSource(name))) {
          return {
            success: false,
            error: 'Chrome / Chromium 浏览器不支持 Ghelper 节点直连（由于 Chrome 无法主动发送代理认证头，而 Ghelper 服务器返回 403 阻断了 407 握手）。请在 Firefox 浏览器中使用或配合本地客户端。'
          };
        }

        const subId = payload?.subId || 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const nodes = parseSubscriptionContent(content || '', subId, payload?.defaultAuth || null, subName);
        if (!nodes || nodes.length === 0) {
          return { success: false, error: '内容无法识别为代理节点，支持 Clash YAML、Base64 订阅与纯链接列表' };
        }
        // 同 subId 覆盖，否则追加
        const kept = (config.profiles || []).filter(p => !(p.subId === subId && p.type === 'fixed'));
        config.profiles = [...kept, ...nodes];
        // 记录为粘贴导入型订阅（不自动更新，URL 为空）
        config.subscriptions = config.subscriptions || [];
        if (!config.subscriptions.some(s => s.id === subId)) {
          config.subscriptions.push({
            id: subId,
            name: subName,
            url: '',
            defaultAuth: payload?.defaultAuth || { enabled: false, username: '', password: '' },
            autoUpdate: false,
            lastSyncAt: new Date().toISOString()
          });
        }
        await saveConfig(config);
        await applyProxySettings(config);
        return { success: true, nodes: nodes.length, subId };
      }

      return { success: false, error: `未知的操作指令: ${action}` };
    } catch (err) {
      console.error('[MEIProxy] onMessage error:', err);
      return { success: false, error: err.message || '后台处理异常' };
    }
  };

  handleAsync().then(res => {
    try {
      sendResponse(res);
    } catch (e) {
      // 忽略
    }
  });

  return true;
});

/**
 * 订阅自动更新定时器（每 12 小时）
 */
const SUBSCRIPTION_ALARM_NAME = 'meiproxy_sub_sync';

function scheduleSubscriptionAlarm() {
  if (!chrome.alarms) return;
  chrome.alarms.create(SUBSCRIPTION_ALARM_NAME, { periodInMinutes: 12 * 60 });
}

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== SUBSCRIPTION_ALARM_NAME) return;
    console.log('[MEIProxy] 定时同步节点订阅...');
    syncAllSubscriptions().then(results => {
      const ok = results.filter(r => r.success).length;
      console.log(`[MEIProxy] 订阅同步完成: ${ok}/${results.length} 成功`);
    }).catch(err => console.error('[MEIProxy] 订阅同步失败:', err));
  });
}

/**
 * 扩展安装或更新初始化
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[MEIProxy] Extension installed / updated:', details.reason);
  const config = await loadConfig();
  await applyProxySettings(config);
  scheduleSubscriptionAlarm();
});

/**
 * 浏览器启动初始化
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[MEIProxy] Browser startup');
  const config = await loadConfig();
  await applyProxySettings(config);
  scheduleSubscriptionAlarm();
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
