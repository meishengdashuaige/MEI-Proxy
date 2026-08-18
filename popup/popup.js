/**
 * MEIProxy - Liquid Glass Popup Interface Logic
 * Features: Star Favorites, Batch Latency & Zero Emojis (Pure SVG)
 */

import { extractDomainInfo, fetchCurrentIpInfo, measureLatency, isProfileDirectlyUsable, getProtocolDisplay } from '../lib/utils.js';
import { loadConfig, saveConfig } from '../lib/storage.js';
import { applyTheme } from '../lib/theme.js';

let currentConfig = null;
let currentTabDomain = '';
let currentTabPattern = '';
let activeFilterType = 'ALL'; // 'ALL' | 'FAV' | 'CUSTOM' | subId
let activeSearchQuery = '';
const nodeLatencyMap = new Map();

// SVG Icons
const SVG_ICONS = {
  layers: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`,
  star: `<svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  starOutline: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  server: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`,
  link: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
};

const THEME_ICONS = {
  auto: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"></path></svg>`,
  light: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
  dark: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`
};

/**
 * 简单 HTML 转义
 */
function escapeHtmlText(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// DOM Elements
const activeProfileSubtitle = document.getElementById('activeProfileSubtitle');
const headerLiveBadge = document.getElementById('headerLiveBadge');
const currentIpValue = document.getElementById('currentIpValue');
const latencyValue = document.getElementById('latencyValue');
const locationText = document.getElementById('locationText');
const btnRefreshStatus = document.getElementById('btnRefreshStatus');
const btnToggleTheme = document.getElementById('btnToggleTheme');
const btnOpenOptions = document.getElementById('btnOpenOptions');
const linkDashboard = document.getElementById('linkDashboard');
const toastMessage = document.getElementById('toastMessage');

// Segmented Mode Buttons
const btnModeAuto = document.getElementById('btnModeAuto');
const btnModeDirect = document.getElementById('btnModeDirect');
const btnModeSystem = document.getElementById('btnModeSystem');

// Nodes Elements
const profileListContainer = document.getElementById('profileListContainer');
const nodesCountTag = document.getElementById('nodesCountTag');
const filterPillsBar = document.getElementById('filterPillsBar');
const btnToggleSearch = document.getElementById('btnToggleSearch');
const searchRow = document.getElementById('searchRow');
const nodeSearchInput = document.getElementById('nodeSearchInput');
const btnClearSearch = document.getElementById('btnClearSearch');
const btnSelectFastest = document.getElementById('btnSelectFastest');

// Quick Rule Elements
const currentDomainText = document.getElementById('currentDomainText');
const quickRuleTargetSelect = document.getElementById('quickRuleTargetSelect');
const btnQuickAddRule = document.getElementById('btnQuickAddRule');

/**
 * 更新主题 UI 与图标
 */
function updateThemeUI(theme = 'auto') {
  applyTheme(theme);
  if (btnToggleTheme) {
    const iconHtml = THEME_ICONS[theme] || THEME_ICONS.auto;
    btnToggleTheme.innerHTML = iconHtml;
    const titleText = theme === 'auto'
      ? '当前：跟随系统 (点击切换浅色)'
      : (theme === 'light' ? '当前：浅色明亮 (点击切换深色)' : '当前：深色暗黑 (点击切换跟随系统)');
    btnToggleTheme.title = titleText;
  }
}

/**
 * 显示浮动 Toast
 */
function showToast(text, isSuccess = false) {
  toastMessage.textContent = text;
  toastMessage.className = 'footer-tip ' + (isSuccess ? 'success' : '');
  setTimeout(() => {
    toastMessage.textContent = '就绪';
    toastMessage.className = 'footer-tip';
  }, 2500);
}

/**
 * 初始化 Popup
 */
async function initPopup() {
  setupEvents();

  try {
    currentConfig = await loadConfig();
    updateThemeUI(currentConfig.general?.theme || 'auto');
    renderTopSegmentedModes();
    renderFilterPills();
    renderNodeList();
    populateQuickRuleTargets();
  } catch (err) {
    console.error('[MEI Proxy] Failed to load initial config in popup:', err);
  }

  // 同时向 background 发送获取最新状态
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ action: 'GET_CONFIG' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[MEI Proxy] Background script not reachable:', chrome.runtime.lastError.message);
          return;
        }
        if (response && response.config) {
          currentConfig = response.config;
          updateThemeUI(currentConfig.general?.theme || 'auto');
          renderTopSegmentedModes();
          renderFilterPills();
          renderNodeList();
          populateQuickRuleTargets();
        }
      });
    } catch (err) {
      console.warn('[MEI Proxy] Failed to send message to background:', err);
    }
  }

  // 2. 检测当前标签页
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) return;
        if (tabs && tabs[0] && tabs[0].url) {
          const tabUrl = tabs[0].url;
          if (tabUrl.startsWith('http://') || tabUrl.startsWith('https://')) {
            const info = extractDomainInfo(tabUrl);
            currentTabDomain = info.host;
            currentTabPattern = info.domainPattern;
            if (currentDomainText) currentDomainText.textContent = currentTabPattern;
          } else {
            if (currentDomainText) currentDomainText.textContent = '本地/系统页面 (免代理)';
            if (btnQuickAddRule) {
              btnQuickAddRule.disabled = true;
              btnQuickAddRule.style.opacity = '0.5';
            }
          }
        }
      });
    } catch (e) {
      console.warn('[MEI Proxy] Tab query failed:', e);
    }
  }

  // 3. 初始网络测试
  try {
    refreshNetworkStatus();
  } catch (e) {
    console.warn('[MEI Proxy] refreshNetworkStatus failed:', e);
  }
}

/**
 * 渲染顶部核心模式分段切换栏
 */
function renderTopSegmentedModes() {
  if (!currentConfig) return;
  const activeId = currentConfig.activeProfileId || 'auto_switch';

  btnModeAuto.classList.toggle('active', activeId === 'auto_switch');
  btnModeDirect.classList.toggle('active', activeId === 'direct');
  btnModeSystem.classList.toggle('active', activeId === 'system');

  const activeProfile = currentConfig.profiles.find(p => p.id === activeId);
  if (activeProfile) {
    activeProfileSubtitle.textContent = activeProfile.name;
    if (activeId === 'auto_switch') {
      headerLiveBadge.textContent = '智能分流';
      headerLiveBadge.style.color = 'var(--accent-primary)';
      headerLiveBadge.style.background = 'var(--bg-badge)';
      headerLiveBadge.style.borderColor = 'var(--border-control)';
    } else if (activeId === 'direct') {
      headerLiveBadge.textContent = '直连模式';
      headerLiveBadge.style.color = 'var(--success)';
      headerLiveBadge.style.background = 'color-mix(in srgb, var(--success) 15%, transparent)';
      headerLiveBadge.style.borderColor = 'color-mix(in srgb, var(--success) 30%, transparent)';
    } else if (activeId === 'system') {
      headerLiveBadge.textContent = '系统代理';
      headerLiveBadge.style.color = 'var(--text-muted)';
      headerLiveBadge.style.background = 'color-mix(in srgb, var(--text-muted) 15%, transparent)';
      headerLiveBadge.style.borderColor = 'color-mix(in srgb, var(--text-muted) 30%, transparent)';
    } else {
      const color = activeProfile.color || '#3b82f6';
      headerLiveBadge.textContent = (activeProfile.scheme || '代理').toUpperCase();
      headerLiveBadge.style.color = color;
      headerLiveBadge.style.background = `color-mix(in srgb, ${color} 15%, transparent)`;
      headerLiveBadge.style.borderColor = `color-mix(in srgb, ${color} 30%, transparent)`;
    }
  }
}

/**
 * 渲染按订阅源分类的筛选胶囊栏 (基于订阅链接分类)
 */
function renderFilterPills() {
  if (!currentConfig || !currentConfig.profiles) return;

  const fixedProfiles = currentConfig.profiles.filter(p => p.type === 'fixed');

  // 计算各分类计数
  let favCount = 0;
  let customCount = 0;

  fixedProfiles.forEach(p => {
    if (p.favorite) favCount++;
    if (!p.subId || p.subId === 'custom') customCount++;
  });

  filterPillsBar.innerHTML = '';

  // 1. 全部节点 Pill
  const pillAll = document.createElement('button');
  pillAll.className = `filter-pill ${activeFilterType === 'ALL' ? 'active' : ''}`;
  pillAll.dataset.filter = 'ALL';
  pillAll.innerHTML = `${SVG_ICONS.layers}<span>全部 (${fixedProfiles.length})</span>`;
  filterPillsBar.appendChild(pillAll);

  // 2. 常用收藏 Pill
  const pillFav = document.createElement('button');
  pillFav.className = `filter-pill ${activeFilterType === 'FAV' ? 'active' : ''}`;
  pillFav.dataset.filter = 'FAV';
  pillFav.innerHTML = `${SVG_ICONS.star}<span>收藏 (${favCount})</span>`;
  filterPillsBar.appendChild(pillFav);

  // 3. 自定义节点 Pill
  if (customCount > 0) {
    const pillCustom = document.createElement('button');
    pillCustom.className = `filter-pill ${activeFilterType === 'CUSTOM' ? 'active' : ''}`;
    pillCustom.dataset.filter = 'CUSTOM';
    pillCustom.innerHTML = `${SVG_ICONS.server}<span>自定义 (${customCount})</span>`;
    filterPillsBar.appendChild(pillCustom);
  }

  // 4. 各个订阅源分组专属 Pill
  const subs = currentConfig.subscriptions || [];
  subs.forEach(sub => {
    const subNodes = fixedProfiles.filter(p => p.subId === sub.id);
    if (subNodes.length > 0) {
      const pillSub = document.createElement('button');
      pillSub.className = `filter-pill ${activeFilterType === sub.id ? 'active' : ''}`;
      pillSub.dataset.filter = sub.id;
      pillSub.innerHTML = `${SVG_ICONS.link}<span>${escapeHtmlText(sub.name || '订阅')} (${subNodes.length})</span>`;
      filterPillsBar.appendChild(pillSub);
    }
  });

  // 绑定点击事件
  filterPillsBar.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeFilterType = e.currentTarget.dataset.filter;
      filterPillsBar.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      renderNodeList();
    });
  });
}

/**
 * 返回节点的友好协议名
 */
function getProtocolLabel(profile) {
  return getProtocolDisplay(profile);
}

/**
 * 渲染过滤后的代理节点列表
 */
function renderNodeList() {
  if (!currentConfig || !currentConfig.profiles) return;
  profileListContainer.innerHTML = '';

  const activeId = currentConfig.activeProfileId;
  const fixedProfiles = currentConfig.profiles.filter(p => p.type === 'fixed');

  // 1. 按订阅或收藏过滤
  const filtered = fixedProfiles.filter(p => {
    if (activeFilterType === 'FAV' && !p.favorite) return false;
    if (activeFilterType === 'CUSTOM' && p.subId && p.subId !== 'custom') return false;
    if (activeFilterType !== 'ALL' && activeFilterType !== 'FAV' && activeFilterType !== 'CUSTOM') {
      if (p.subId !== activeFilterType) return false;
    }

    // 搜索词过滤
    if (activeSearchQuery) {
      const q = activeSearchQuery.toLowerCase();
      const matchName = p.name && p.name.toLowerCase().includes(q);
      const matchHost = p.host && p.host.toLowerCase().includes(q);
      const matchPort = p.port && String(p.port).includes(q);
      const matchSub = p.subName && p.subName.toLowerCase().includes(q);
      if (!matchName && !matchHost && !matchPort && !matchSub) return false;
    }

    return true;
  });

  // 2. 排序：可用节点优先；其次收藏置顶；最后按测速延时
  filtered.sort((a, b) => {
    const ua = isProfileDirectlyUsable(a) ? 0 : 1;
    const ub = isProfileDirectlyUsable(b) ? 0 : 1;
    if (ua !== ub) return ua - ub;

    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;

    const latA = nodeLatencyMap.get(a.id) ?? 99999;
    const latB = nodeLatencyMap.get(b.id) ?? 99999;
    return latA - latB;
  });

  nodesCountTag.textContent = filtered.length;

  if (filtered.length === 0) {
    profileListContainer.innerHTML = `
      <div class="empty-nodes-tip">
        <span>当前分类下暂无代理节点</span>
      </div>
    `;
    return;
  }

  filtered.forEach(profile => {
    const usable = isProfileDirectlyUsable(profile);
    const item = document.createElement('div');
    item.className = `node-item ${profile.id === activeId ? 'active' : ''} ${!usable ? 'unusable' : ''}`;
    item.dataset.id = profile.id;

    const latency = nodeLatencyMap.get(profile.id);
    let latencyText = '--';
    let latencyColor = 'var(--text-muted)';
    if (latency !== undefined) {
      if (latency >= 0) {
        latencyText = `${latency} ms`;
        latencyColor = latency < 180 ? 'var(--success)' : (latency < 450 ? 'var(--warning)' : 'var(--danger)');
      } else {
        latencyText = '超时';
        latencyColor = 'var(--danger)';
      }
    }

    const protoLabel = getProtocolLabel(profile);
    const warnTag = usable ? '' : `<span class="node-warn-tag" title="此节点为 ${protoLabel} 协议，浏览器无法直接代理，需本地客户端转换">需客户端</span>`;

    // 订阅分组展示
    const sub = profile.subId ? (currentConfig.subscriptions || []).find(s => s.id === profile.subId) : null;
    const subName = sub ? sub.name : (profile.subName && profile.subName !== 'custom' ? profile.subName : '');
    const groupTag = subName ? `<span class="node-group-badge" title="所属订阅: ${escapeHtmlText(subName)}">${escapeHtmlText(subName)}</span>` : '';

    item.innerHTML = `
      <div class="node-left">
        <button class="star-btn ${profile.favorite ? 'starred' : ''}" data-id="${profile.id}" title="${profile.favorite ? '取消收藏' : '加入收藏'}">
          ${profile.favorite ? SVG_ICONS.star : SVG_ICONS.starOutline}
        </button>
        <div class="node-type-icon">
          ${SVG_ICONS.server}
        </div>
        <div class="node-meta">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="node-name" title="${profile.name}${!usable ? ' · ' + protoLabel + ' 协议需本地客户端' : ''}">${profile.name}</span>
            ${groupTag}
          </div>
          <span class="node-server-sub">${profile.host}:${profile.port}</span>
        </div>
      </div>
      <div class="node-right">
        <span class="node-proto-tag" title="${usable ? '' : protoLabel + ' 协议浏览器不可直接代理'}">${protoLabel}</span>
        ${warnTag}
        <div class="node-bottom-status">
          <span class="node-latency-tag" id="ping-${profile.id}" style="color: ${latencyColor};">${latencyText}</span>
          <div class="node-check-icon">${SVG_ICONS.check}</div>
        </div>
      </div>
    `;

    // 点击切换节点
    item.addEventListener('click', (e) => {
      if (e.target.closest('.star-btn')) return;
      switchProfile(profile.id);
    });

    // 收藏切换
    const starBtn = item.querySelector('.star-btn');
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(profile.id);
    });

    profileListContainer.appendChild(item);
  });
}

/**
 * 切换收藏状态
 */
async function toggleFavorite(profileId) {
  const p = currentConfig.profiles.find(item => item.id === profileId);
  if (!p) return;

  p.favorite = !p.favorite;
  chrome.runtime.sendMessage(
    { action: 'SAVE_FULL_CONFIG', payload: { config: currentConfig } },
    () => {
      saveConfig(currentConfig);
    }
  );
  renderFilterPills();
  renderNodeList();
}

/**
 * 切换选中的代理 Profile
 */
function switchProfile(profileId) {
  if (currentConfig.activeProfileId === profileId) return;

  const target = currentConfig.profiles.find(p => p.id === profileId);
  if (!target) return;

  // 关键拦截：浏览器原生无法直接代理 VMess/VLESS/Trojan/SS/SSR 等协议，
  // 必须由本地客户端转换。这里阻止无效切换并告知用户原因。
  if (!isProfileDirectlyUsable(target)) {
    const protoLabel = getProtocolLabel(target);
    showToast(`${protoLabel} 协议无法被浏览器直接代理，请先在本地启动 V2Ray/Clash/Xray 客户端，然后选择其提供的本地 SOCKS5/HTTP 节点`);
    return;
  }

  currentConfig.activeProfileId = profileId;
  renderTopSegmentedModes();
  renderNodeList();
  showToast('已切换生效代理', true);

  chrome.runtime.sendMessage(
    { action: 'SET_ACTIVE_PROFILE', payload: { profileId } },
    (res) => {
      if (res && res.success) {
        setTimeout(refreshNetworkStatus, 600);
      }
    }
  );
}

/**
 * 测速并自动选优 (优先在当前所选分类/分组中测速选优)
 */
async function handleSelectFastest() {
  const fixedProfiles = currentConfig.profiles.filter(p => p.type === 'fixed' && isProfileDirectlyUsable(p));
  
  // 按照当前所选分类（ALL / FAV / CUSTOM / subId）筛选候选测速节点
  let candidates = fixedProfiles;
  let groupTitle = '全部可用节点';
  if (activeFilterType === 'FAV') {
    candidates = fixedProfiles.filter(p => p.favorite);
    groupTitle = '常用收藏';
  } else if (activeFilterType === 'CUSTOM') {
    candidates = fixedProfiles.filter(p => !p.subId || p.subId === 'custom');
    groupTitle = '默认与手动节点';
  } else if (activeFilterType !== 'ALL') {
    const sub = (currentConfig.subscriptions || []).find(s => s.id === activeFilterType);
    const subName = sub ? sub.name : '当前分组';
    candidates = fixedProfiles.filter(p => p.subId === activeFilterType);
    groupTitle = `分组「${subName}」`;
  }

  if (candidates.length === 0) {
    showToast(`当前${groupTitle}下暂无可测速的直连节点`);
    return;
  }

  btnSelectFastest.disabled = true;
  btnSelectFastest.innerHTML = '<span>测速中...</span>';
  showToast(`正在对 ${groupTitle} (${candidates.length} 个节点) 进行直连测速...`);

  let bestNode = null;
  let minLatency = 999999;

  await Promise.all(candidates.map(async (p) => {
    const pingEl = document.getElementById(`ping-${p.id}`);
    if (pingEl) pingEl.textContent = '...';

    const res = await measureLatency();
    const lat = res.success ? res.latency : -1;
    nodeLatencyMap.set(p.id, lat);

    if (res.success && lat > 0 && lat < minLatency) {
      minLatency = lat;
      bestNode = p;
    }
  }));

  renderNodeList();

  if (bestNode) {
    switchProfile(bestNode.id);
    showToast(`已选优切换至: ${bestNode.name} (${minLatency} ms)`, true);
  } else {
    showToast(`${groupTitle}节点测速均超时`);
  }

  btnSelectFastest.disabled = false;
  btnSelectFastest.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> <span>测速选优</span>';
}

/**
 * 填充快捷添加规则的下拉目标节点
 */
function populateQuickRuleTargets() {
  if (!currentConfig || !currentConfig.profiles) return;
  quickRuleTargetSelect.innerHTML = '';
  const validTargets = currentConfig.profiles.filter(p => p.type !== 'auto_switch');

  validTargets.forEach(profile => {
    const opt = document.createElement('option');
    const usable = isProfileDirectlyUsable(profile);
    const protoLabel = getProtocolLabel(profile);
    opt.value = profile.id;
    opt.textContent = usable
      ? `走 ${profile.name} (${protoLabel})`
      : `[需客户端] ${profile.name} (${protoLabel})`;
    if (!usable) opt.style.color = 'var(--danger)';
    quickRuleTargetSelect.appendChild(opt);
  });
}

/**
 * 快捷添加当前网站到分流规则
 */
function handleQuickAddRule() {
  if (!currentTabPattern) {
    showToast('无法获取当前域名');
    return;
  }

  const targetProfileId = quickRuleTargetSelect.value;
  const targetProfile = currentConfig.profiles.find(p => p.id === targetProfileId);
  const targetName = targetProfile ? targetProfile.name : targetProfileId;

  btnQuickAddRule.disabled = true;
  btnQuickAddRule.innerHTML = '<span>添加中</span>';

  chrome.runtime.sendMessage(
    {
      action: 'ADD_RULE',
      payload: {
        pattern: currentTabPattern,
        type: 'wildcard',
        targetProfileId: targetProfileId,
        comment: `快捷添加: ${currentTabDomain}`
      }
    },
    (response) => {
      btnQuickAddRule.disabled = false;
      btnQuickAddRule.innerHTML = '<span>加入规则</span>';
      if (response && response.success) {
        showToast(`已将 ${currentTabPattern} 分流给 ${targetName}`, true);
      }
    }
  );
}

/**
 * 刷新网络信息与延迟
 */
async function refreshNetworkStatus() {
  btnRefreshStatus.classList.add('rotating');
  currentIpValue.textContent = '检测中...';
  latencyValue.textContent = '-- ms';
  locationText.textContent = '定位中...';

  try {
    const [ipData, latencyData] = await Promise.all([
      fetchCurrentIpInfo(),
      measureLatency('https://www.gstatic.com/generate_204')
    ]);

    currentIpValue.textContent = ipData.ip || '未知';
    const locParts = [ipData.country, ipData.city].filter(Boolean);
    locationText.textContent = locParts.length > 0 ? locParts.join(' · ') : '未知归属';

    if (latencyData.success && latencyData.latency >= 0) {
      latencyValue.textContent = `${latencyData.latency} ms`;
      latencyValue.style.color = latencyData.latency < 180 ? 'var(--success)' : (latencyData.latency < 450 ? 'var(--warning)' : 'var(--danger)');
    } else {
      latencyValue.textContent = '超时';
      latencyValue.style.color = 'var(--danger)';
    }
  } catch {
    currentIpValue.textContent = '检测失败';
  } finally {
    btnRefreshStatus.classList.remove('rotating');
  }
}

/**
 * 打开设置页面
 */
function openOptionsPage(e) {
  if (e) e.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options/options.html'));
  }
}

/**
 * 绑定全部事件
 */
function setupEvents() {
  btnModeAuto.addEventListener('click', () => switchProfile('auto_switch'));
  btnModeDirect.addEventListener('click', () => switchProfile('direct'));
  btnModeSystem.addEventListener('click', () => switchProfile('system'));

  btnToggleSearch.addEventListener('click', () => {
    searchRow.classList.toggle('hidden');
    if (!searchRow.classList.contains('hidden')) {
      nodeSearchInput.focus();
    }
  });

  nodeSearchInput.addEventListener('input', (e) => {
    activeSearchQuery = e.target.value.trim();
    renderNodeList();
  });

  btnClearSearch.addEventListener('click', () => {
    nodeSearchInput.value = '';
    activeSearchQuery = '';
    renderNodeList();
  });

  btnSelectFastest.addEventListener('click', handleSelectFastest);
  btnQuickAddRule.addEventListener('click', handleQuickAddRule);
  btnRefreshStatus.addEventListener('click', refreshNetworkStatus);
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', async () => {
      const currentTheme = currentConfig?.general?.theme || 'auto';
      let nextTheme = 'light';
      let msg = '已切换为浅色明亮主题';
      if (currentTheme === 'auto') {
        nextTheme = 'light';
        msg = '已切换为浅色明亮主题';
      } else if (currentTheme === 'light') {
        nextTheme = 'dark';
        msg = '已切换为深色暗黑主题';
      } else {
        nextTheme = 'auto';
        msg = '已切换为跟随系统主题';
      }

      currentConfig.general = {
        ...(currentConfig.general || {}),
        theme: nextTheme
      };
      updateThemeUI(nextTheme);
      await saveConfig(currentConfig);
      showToast(msg, true);
    });
  }
  btnOpenOptions.addEventListener('click', openOptionsPage);
  linkDashboard.addEventListener('click', openOptionsPage);

  // 快捷键支持：按 / 或 Ctrl+F 聚焦搜索，Esc 关闭搜索
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== nodeSearchInput) {
      e.preventDefault();
      searchRow.classList.remove('hidden');
      nodeSearchInput.focus();
    } else if (e.key === 'Escape') {
      if (!searchRow.classList.contains('hidden')) {
        searchRow.classList.add('hidden');
        nodeSearchInput.value = '';
        activeSearchQuery = '';
        renderNodeList();
      }
    }
  });

  // 多页面/后台状态实时监听同步
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.meiproxy_config) {
        currentConfig = changes.meiproxy_config.newValue;
        renderTopSegmentedModes();
        renderFilterPills();
        renderNodeList();
        populateQuickRuleTargets();
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
