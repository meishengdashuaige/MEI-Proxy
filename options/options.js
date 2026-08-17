/**
 * MEIProxy - Options Management Dashboard Logic
 */

import { loadConfig, saveConfig, DEFAULT_SETTINGS, generateId } from '../lib/storage.js';
import { simulateRuleMatch, measureLatency } from '../lib/utils.js';
import { PRESET_RULE_SETS, getPresetRuleSetById } from '../lib/preset_rules.js';

// SVG Icons
const SVG_ICONS = {
  star: `<svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  starOutline: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  server: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`,
  link: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`
};

let appConfig = null;
let currentTab = 'tab-profiles';
let activeRuleSearchQuery = '';

// Profile Filter & View States
let activeProfileSearchQuery = '';
let activeProfileProtocolFilter = 'ALL';
let activeProfileSortOption = 'DEFAULT';
let activeViewMode = 'grid'; // 'grid' | 'list'
const nodeLatencyMap = new Map();

/**
 * 判断 fixed 类型节点是否可被浏览器原生代理直接使用
 */
function isProfileDirectlyUsable(profile) {
  if (!profile || profile.type !== 'fixed') return true;
  if (typeof profile.directlyUsable === 'boolean') return profile.directlyUsable;
  const proto = (profile.protocol || profile.scheme || 'http').toLowerCase();
  return ['http', 'https', 'socks5', 'socks4', 'socks'].includes(proto);
}

/**
 * 返回节点的友好协议名 (用于 UI 展示)
 */
function getProtocolLabel(profile) {
  const proto = (profile.protocol || profile.scheme || '').toLowerCase();
  const labels = {
    vmess: 'VMess',
    vless: 'VLESS',
    trojan: 'Trojan',
    ss: 'Shadowsocks',
    ssr: 'SSR',
    http: 'HTTP',
    https: 'HTTPS',
    socks5: 'SOCKS5',
    socks4: 'SOCKS4'
  };
  return labels[proto] || proto.toUpperCase();
}

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');
const profilesGrid = document.getElementById('profilesGrid');
const profilesListCard = document.getElementById('profilesListCard');
const profilesTableBody = document.getElementById('profilesTableBody');
const profileSearchInput = document.getElementById('profileSearchInput');
const filterProfileProtocol = document.getElementById('filterProfileProtocol');
const sortProfileOption = document.getElementById('sortProfileOption');
const btnViewGrid = document.getElementById('btnViewGrid');
const btnViewList = document.getElementById('btnViewList');
const btnCleanDeadNodes = document.getElementById('btnCleanDeadNodes');
const rulesTableBody = document.getElementById('rulesTableBody');
const ruleSearchInput = document.getElementById('ruleSearchInput');
const selectDefaultFallbackProfile = document.getElementById('selectDefaultFallbackProfile');
const bypassListTextarea = document.getElementById('bypassListTextarea');
const pacUrlInput = document.getElementById('pacUrlInput');
const pacScriptTextarea = document.getElementById('pacScriptTextarea');
const chkShowBadge = document.getElementById('chkShowBadge');
const chkAutoCheckIp = document.getElementById('chkAutoCheckIp');
const toastContainer = document.getElementById('toastContainer');

// Preset Rule Sets Modal Elements
const presetRuleSetModal = document.getElementById('presetRuleSetModal');
const btnOpenPresetRuleSetModal = document.getElementById('btnOpenPresetRuleSetModal');
const btnSaveCurrentRulesAsTemplate = document.getElementById('btnSaveCurrentRulesAsTemplate');
const btnClosePresetRuleSetModal = document.getElementById('btnClosePresetRuleSetModal');
const btnCancelPresetRuleSetModal = document.getElementById('btnCancelPresetRuleSetModal');
const selectPresetRuleSet = document.getElementById('selectPresetRuleSet');
const presetRuleSetName = document.getElementById('presetRuleSetName');
const presetRuleSetTag = document.getElementById('presetRuleSetTag');
const presetRuleSetDesc = document.getElementById('presetRuleSetDesc');
const presetRuleSetCount = document.getElementById('presetRuleSetCount');
const presetRuleSetPreviewList = document.getElementById('presetRuleSetPreviewList');
const selectPresetRuleTargetProfile = document.getElementById('selectPresetRuleTargetProfile');
const selectPresetRuleImportMode = document.getElementById('selectPresetRuleImportMode');
const btnConfirmImportPresetRuleSet = document.getElementById('btnConfirmImportPresetRuleSet');

// Sandbox Elements
const sandboxInput = document.getElementById('sandboxInput');
const btnTestSandbox = document.getElementById('btnTestSandbox');
const sandboxResult = document.getElementById('sandboxResult');

// Profile Modal Elements
const profileModal = document.getElementById('profileModal');
const profileModalTitle = document.getElementById('profileModalTitle');
const profileForm = document.getElementById('profileForm');
const profileFormId = document.getElementById('profileFormId');
const profileNameInput = document.getElementById('profileNameInput');
const profileSchemeSelect = document.getElementById('profileSchemeSelect');
const profileColorInput = document.getElementById('profileColorInput');
const profileHostInput = document.getElementById('profileHostInput');
const profilePortInput = document.getElementById('profilePortInput');
const profileAuthUserInput = document.getElementById('profileAuthUserInput');
const profileAuthPassInput = document.getElementById('profileAuthPassInput');
const profileDescInput = document.getElementById('profileDescInput');
const btnOpenAddProfileModal = document.getElementById('btnOpenAddProfileModal');
const btnCloseProfileModal = document.getElementById('btnCloseProfileModal');
const btnCancelProfileModal = document.getElementById('btnCancelProfileModal');
const btnSaveProfile = document.getElementById('btnSaveProfile');

// Rule Modal Elements
const ruleModal = document.getElementById('ruleModal');
const ruleModalTitle = document.getElementById('ruleModalTitle');
const ruleFormId = document.getElementById('ruleFormId');
const ruleTypeSelect = document.getElementById('ruleTypeSelect');
const ruleTargetSelect = document.getElementById('ruleTargetSelect');
const rulePatternInput = document.getElementById('rulePatternInput');
const ruleCommentInput = document.getElementById('ruleCommentInput');
const ruleTypeHelp = document.getElementById('ruleTypeHelp');
const btnOpenAddRuleModal = document.getElementById('btnOpenAddRuleModal');
const btnCloseRuleModal = document.getElementById('btnCloseRuleModal');
const btnCancelRuleModal = document.getElementById('btnCancelRuleModal');
const btnSaveRule = document.getElementById('btnSaveRule');

// Action Buttons
const btnSaveBypass = document.getElementById('btnSaveBypass');
const btnSavePac = document.getElementById('btnSavePac');
const btnSaveGeneral = document.getElementById('btnSaveGeneral');
const btnExportConfig = document.getElementById('btnExportConfig');
const btnTriggerImport = document.getElementById('btnTriggerImport');
const importFileInput = document.getElementById('importFileInput');
const btnResetDefaults = document.getElementById('btnResetDefaults');

/**
 * Toast 提示
 */
function showToast(message, type = 'success') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠️'}</span>
    <div>${message}</div>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * 保存全局配置并通知 Background 同步
 */
async function syncAndSaveConfig(toastMsg = '设置已保存并生效') {
  if (!appConfig) return;
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(
      { action: 'SAVE_FULL_CONFIG', payload: { config: appConfig } },
      (res) => {
        if (res && res.success) {
          showToast(toastMsg, 'success');
        } else {
          saveConfig(appConfig);
          showToast(toastMsg, 'success');
        }
      }
    );
  } else {
    await saveConfig(appConfig);
    showToast(toastMsg, 'success');
  }
}

/**
 * 初始化页面
 */
async function initOptions() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: 'GET_CONFIG' }, async (res) => {
      if (res && res.config) {
        appConfig = res.config;
      } else {
        appConfig = await loadConfig();
      }
      renderAll();
    });
  } else {
    appConfig = await loadConfig();
    renderAll();
  }

  setupEventListeners();
}

/**
 * 全量渲染页面
 */
function renderAll() {
  renderProfilesGrid();
  renderRulesTable();
  renderBypassList();
  renderPacSettings();
  renderGeneralSettings();
  populateDropdownOptions();
}

/**
 * 切换选项卡
 */
function switchTab(tabId) {
  currentTab = tabId;
  navItems.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  tabPanes.forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });
}

/**
 * 渲染代理节点列表
 */
function renderProfilesGrid() {
  if (!appConfig || !appConfig.profiles) return;

  const activeId = appConfig.activeProfileId || 'auto_switch';

  // 1. 筛选节点
  let filtered = appConfig.profiles.filter(p => {
    // 基础模式处理
    if (p.type === 'direct' || p.type === 'system' || p.type === 'auto_switch') {
      if (activeProfileProtocolFilter !== 'ALL' || activeProfileSortOption === 'FAV_FIRST') {
        return false;
      }
      return true;
    }

    // 协议类型过滤
    if (activeProfileProtocolFilter !== 'ALL') {
      const scheme = (p.scheme || p.type).toLowerCase();
      if (scheme !== activeProfileProtocolFilter.toLowerCase()) return false;
    }

    // 搜索词过滤
    if (activeProfileSearchQuery) {
      const q = activeProfileSearchQuery.toLowerCase();
      const matchName = p.name && p.name.toLowerCase().includes(q);
      const matchHost = p.host && p.host.toLowerCase().includes(q);
      const matchPort = p.port && String(p.port).includes(q);
      if (!matchName && !matchHost && !matchPort) return false;
    }

    return true;
  });

  // 2. 排序
  filtered.sort((a, b) => {
    if (activeProfileSortOption === 'FAV_FIRST') {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
    } else if (activeProfileSortOption === 'LATENCY_ASC') {
      const latA = nodeLatencyMap.get(a.id) ?? 99999;
      const latB = nodeLatencyMap.get(b.id) ?? 99999;
      return latA - latB;
    } else if (activeProfileSortOption === 'NAME_ASC') {
      return (a.name || '').localeCompare(b.name || '');
    }
    return 0;
  });

  // 3. 渲染
  if (activeViewMode === 'grid') {
    if (profilesGrid) profilesGrid.classList.remove('hidden');
    if (profilesListCard) profilesListCard.classList.add('hidden');
    renderGridView(filtered, activeId);
  } else {
    if (profilesGrid) profilesGrid.classList.add('hidden');
    if (profilesListCard) profilesListCard.classList.remove('hidden');
    renderListView(filtered, activeId);
  }
}

/**
 * 渲染卡片网格视图
 */
function renderGridView(profiles, activeId) {
  if (!profilesGrid) return;
  profilesGrid.innerHTML = '';

  if (profiles.length === 0) {
    profilesGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">没有符合当前筛选条件的节点</div>';
    return;
  }

  profiles.forEach(profile => {
    const card = document.createElement('div');
    const usable = isProfileDirectlyUsable(profile);
    card.className = `profile-card ${profile.id === activeId ? 'active' : ''} ${!usable ? 'unusable' : ''}`;

    const protoLabel = getProtocolLabel(profile);

    let serverDisplay = '';
    if (profile.type === 'fixed') {
      serverDisplay = `${protoLabel} · ${profile.host}:${profile.port}`;
    } else if (profile.type === 'direct') {
      serverDisplay = '不使用代理 · 所有请求直连';
    } else if (profile.type === 'system') {
      serverDisplay = '操作系统默认代理配置';
    } else if (profile.type === 'auto_switch') {
      serverDisplay = '智能路由 · 按规则列表自动分流';
    }

    let subTag = '';
    if (profile.type === 'fixed') {
      subTag = `<span class="profile-type-tag">自定义节点</span>`;
    }

    const latency = nodeLatencyMap.get(profile.id);
    let latencyDisplay = '';
    if (latency !== undefined) {
      const color = latency >= 0 && latency < 200 ? 'var(--success)' : (latency >= 0 && latency < 500 ? 'var(--warning)' : 'var(--danger)');
      latencyDisplay = `<span style="color: ${color}; font-weight: 600; margin-right: 6px;">${latency >= 0 ? latency + ' ms' : '超时'}</span>`;
    }

    const warnBanner = usable ? '' : `
      <div class="profile-warn-banner" title="浏览器原生仅支持 HTTP/HTTPS/SOCKS4/SOCKS5 传输层协议">
        ⚠️ ${protoLabel} 协议 · 浏览器无法直接代理
      </div>
    `;

    card.innerHTML = `
      <div>
        <div class="profile-card-header">
          <div class="profile-card-title-group" style="min-width: 0; flex: 1;">
            ${profile.type === 'fixed' ? `
              <button class="star-btn-sm ${profile.favorite ? 'starred' : ''}" data-id="${profile.id}" title="收藏">
                ${profile.favorite ? SVG_ICONS.star : SVG_ICONS.starOutline}
              </button>
            ` : `<span class="profile-card-badge" style="background-color: ${profile.color || '#3b82f6'};"></span>`}
            <span class="profile-card-name" title="${profile.name}${!usable ? ' · ' + protoLabel + ' 协议需本地客户端' : ''}">${profile.name}</span>
          </div>
          <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
            ${subTag}
            <span class="profile-type-tag">${protoLabel}</span>
          </div>
        </div>
        <div class="profile-card-body" style="margin-top: 10px;">
          <div class="profile-server-info">${serverDisplay}</div>
          <div class="profile-card-desc">${profile.description || '无备注说明'}</div>
          ${warnBanner}
        </div>
      </div>
      <div class="profile-card-footer">
        <div class="profile-latency-tag" id="latency-${profile.id}" style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center;">
          ${latencyDisplay}
          ${profile.type === 'fixed' ? '<button class="btn btn-secondary btn-sm btn-test-latency" data-id="' + profile.id + '">测速</button>' : ''}
        </div>
        <div class="profile-actions">
          ${!profile.builtIn ? `
            <button class="btn btn-secondary btn-sm btn-edit-profile" data-id="${profile.id}">编辑</button>
            <button class="btn btn-secondary btn-sm btn-delete-profile" data-id="${profile.id}" style="color: var(--danger);">删除</button>
          ` : ''}
          <button class="btn ${profile.id === activeId ? 'btn-primary' : 'btn-secondary'} btn-sm btn-activate-profile" data-id="${profile.id}" ${!usable ? 'disabled style="opacity: 0.5; cursor: not-allowed;" title="此协议浏览器无法直接代理"' : ''}>
            ${profile.id === activeId ? '当前生效' : '激活'}
          </button>
        </div>
      </div>
    `;

    profilesGrid.appendChild(card);
  });

  bindProfileCardEvents();
}

/**
 * 渲染紧凑表格列表视图
 */
function renderListView(profiles, activeId) {
  if (!profilesTableBody) return;
  profilesTableBody.innerHTML = '';

  if (profiles.length === 0) {
    profilesTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">没有符合当前筛选条件的节点</td></tr>';
    return;
  }

  profiles.forEach(profile => {
    const row = document.createElement('tr');
    const usable = isProfileDirectlyUsable(profile);
    const protoLabel = getProtocolLabel(profile);
    if (!usable) row.classList.add('unusable-row');
    if (profile.id === activeId) {
      row.style.background = 'var(--bg-active)';
    }

    const latency = nodeLatencyMap.get(profile.id);
    let latencyText = '--';
    let latencyColor = 'var(--text-muted)';
    if (latency !== undefined) {
      if (latency >= 0) {
        latencyText = `${latency} ms`;
        latencyColor = latency < 200 ? 'var(--success)' : (latency < 500 ? 'var(--warning)' : 'var(--danger)');
      } else {
        latencyText = '超时';
        latencyColor = 'var(--danger)';
      }
    }

    row.innerHTML = `
      <td>
        ${profile.type === 'fixed' ? `
          <button class="star-btn-sm ${profile.favorite ? 'starred' : ''}" data-id="${profile.id}">
            ${profile.favorite ? SVG_ICONS.star : SVG_ICONS.starOutline}
          </button>
        ` : '-'}
      </td>
      <td style="font-weight: 600;">
        <span title="${profile.name}${!usable ? ' · ' + protoLabel + ' 协议需本地客户端' : ''}">${profile.name}</span>
        ${!usable ? `<div style="font-size: 10px; color: var(--danger); margin-top: 2px;">${protoLabel} · 需客户端</div>` : ''}
      </td>
      <td><span class="profile-type-tag">${protoLabel}</span></td>
      <td class="font-mono">${profile.host ? profile.host + ':' + profile.port : '-'}</td>
      <td style="color: ${latencyColor}; font-weight: 600;" id="lat-row-${profile.id}">${latencyText}</td>
      <td class="text-right">
        ${profile.type === 'fixed' ? `<button class="btn btn-secondary btn-sm btn-test-latency" data-id="${profile.id}">测速</button>` : ''}
        ${!profile.builtIn ? `<button class="btn btn-secondary btn-sm btn-delete-profile" data-id="${profile.id}" style="color: var(--danger);">删除</button>` : ''}
        <button class="btn ${profile.id === activeId ? 'btn-primary' : 'btn-secondary'} btn-sm btn-activate-profile" data-id="${profile.id}" ${!usable ? 'disabled style="opacity: 0.5; cursor: not-allowed;" title="此协议浏览器无法直接代理"' : ''}>
          ${profile.id === activeId ? '已激活' : '激活'}
        </button>
      </td>
    `;

    profilesTableBody.appendChild(row);
  });

  bindProfileCardEvents();
}

/**
 * 绑定卡片与列表中的通用事件
 */
function bindProfileCardEvents() {
  document.querySelectorAll('.btn-activate-profile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const target = appConfig.profiles.find(p => p.id === id);
      if (!target) return;

      if (!isProfileDirectlyUsable(target)) {
        const protoLabel = getProtocolLabel(target);
        showToast(`${protoLabel} 协议浏览器无法直接代理，请先在本地启动客户端，并选择其提供的本地 SOCKS5/HTTP 节点`, 'error');
        return;
      }

      appConfig.activeProfileId = id;
      syncAndSaveConfig(`已激活代理模式: ${target.name}`);
      renderProfilesGrid();
    });
  });

  document.querySelectorAll('.star-btn-sm').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const p = appConfig.profiles.find(item => item.id === id);
      if (p) {
        p.favorite = !p.favorite;
        await syncAndSaveConfig(p.favorite ? '已加入常用收藏' : '已取消收藏');
        renderProfilesGrid();
      }
    });
  });

  document.querySelectorAll('.btn-edit-profile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      openEditProfileModal(id);
    });
  });

  document.querySelectorAll('.btn-delete-profile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      deleteProfile(id);
    });
  });

  document.querySelectorAll('.btn-test-latency').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const targetEl = document.getElementById(`latency-${id}`) || document.getElementById(`lat-row-${id}`);
      if (targetEl) {
        targetEl.innerHTML = '<span style="color: var(--warning);">测试中...</span>';
        const res = await measureLatency();
        const lat = res.success ? res.latency : -1;
        nodeLatencyMap.set(id, lat);
        renderProfilesGrid();
      }
    });
  });
}

/**
 * 一键清理失效与超时节点
 */
async function handleCleanDeadNodes() {
  const fixedProfiles = (appConfig.profiles || []).filter(p => p.type === 'fixed' && isProfileDirectlyUsable(p));
  if (fixedProfiles.length === 0) {
    showToast('暂无可直接代理的节点 (HTTP/HTTPS/SOCKS4/SOCKS5) 可清理', 'error');
    return;
  }

  btnCleanDeadNodes.disabled = true;
  btnCleanDeadNodes.innerHTML = '<span>正在并发探测不可达节点...</span>';
  showToast('正在探测全部可用节点连通性...');

  const deadIds = [];

  await Promise.all(fixedProfiles.map(async (p) => {
    const res = await measureLatency();
    if (!res.success || res.latency < 0) {
      deadIds.push(p.id);
    }
  }));

  btnCleanDeadNodes.disabled = false;
  btnCleanDeadNodes.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg> 清理失效节点';

  if (deadIds.length === 0) {
    showToast('所有可用节点均可正常连接，无需清理！', 'success');
    return;
  }

  if (confirm(`共检测到 ${deadIds.length} 个连接超时或失效的节点，确定要一键清理移除它们吗？`)) {
    appConfig.profiles = appConfig.profiles.filter(p => !deadIds.includes(p.id));
    if (deadIds.includes(appConfig.activeProfileId)) {
      appConfig.activeProfileId = 'auto_switch';
    }
    syncAndSaveConfig(`已清理 ${deadIds.length} 个失效节点`);
    renderProfilesGrid();
  }
}

/**
 * 渲染分流规则表格
 */
function renderRulesTable() {
  if (!appConfig || !appConfig.rules || !rulesTableBody) return;
  rulesTableBody.innerHTML = '';

  const profileMap = new Map();
  appConfig.profiles.forEach(p => profileMap.set(p.id, p));

  const filteredRules = appConfig.rules.filter(rule => {
    if (!activeRuleSearchQuery) return true;
    const q = activeRuleSearchQuery.toLowerCase();
    return (
      (rule.pattern && rule.pattern.toLowerCase().includes(q)) ||
      (rule.comment && rule.comment.toLowerCase().includes(q))
    );
  });

  if (filteredRules.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
      <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px 0;">
        没有匹配的规则条件
      </td>
    `;
    rulesTableBody.appendChild(emptyRow);
    return;
  }

  filteredRules.forEach((rule) => {
    const targetProfile = profileMap.get(rule.targetProfileId) || { name: rule.targetProfileId, color: '#6b7280' };
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>
        <label class="switch" style="transform: scale(0.75); transform-origin: left center;">
          <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <span class="rule-type-badge ${rule.type || 'wildcard'}">${rule.type || 'wildcard'}</span>
      </td>
      <td class="font-mono" style="font-weight: 600; color: ${rule.enabled ? 'var(--text-primary)' : 'var(--text-muted)'};">
        ${rule.pattern}
      </td>
      <td>
        <div class="target-profile-pill">
          <span class="target-dot" style="background-color: ${targetProfile.color || '#3b82f6'};"></span>
          <span>${targetProfile.name}</span>
        </div>
      </td>
      <td style="color: var(--text-secondary); font-size: 13px;">
        ${rule.comment || '-'}
      </td>
      <td class="text-right">
        <button class="btn btn-secondary btn-sm btn-edit-rule" data-id="${rule.id}">编辑</button>
        <button class="btn btn-secondary btn-sm btn-delete-rule" data-id="${rule.id}" style="color: var(--danger);">删除</button>
      </td>
    `;

    rulesTableBody.appendChild(row);
  });

  // 绑定规则行事件
  rulesTableBody.querySelectorAll('.rule-toggle').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const r = appConfig.rules.find(item => item.id === id);
      if (r) {
        r.enabled = e.target.checked;
        syncAndSaveConfig('规则状态已更新');
      }
    });
  });

  rulesTableBody.querySelectorAll('.btn-edit-rule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      openEditRuleModal(id);
    });
  });

  rulesTableBody.querySelectorAll('.btn-delete-rule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      deleteRule(id);
    });
  });
}

/**
 * 渲染 Bypass 列表
 */
function renderBypassList() {
  if (!appConfig || !bypassListTextarea) return;
  bypassListTextarea.value = (appConfig.bypassList || []).join('\n');
}

/**
 * 渲染 PAC 脚本设置
 */
function renderPacSettings() {
  if (!appConfig) return;
  if (pacUrlInput) pacUrlInput.value = appConfig.customPac?.url || '';
  if (pacScriptTextarea) pacScriptTextarea.value = appConfig.customPac?.script || '';
}

/**
 * 渲染偏好设置
 */
function renderGeneralSettings() {
  if (!appConfig) return;
  if (chkShowBadge) chkShowBadge.checked = appConfig.general?.showBadge !== false;
  if (chkAutoCheckIp) chkAutoCheckIp.checked = appConfig.general?.autoCheckIp !== false;
}

/**
 * 填充全局下拉菜单
 */
function populateDropdownOptions() {
  if (!appConfig || !appConfig.profiles) return;

  // 1. 规则目标下拉菜单
  if (ruleTargetSelect) {
    ruleTargetSelect.innerHTML = '';
    const targets = appConfig.profiles.filter(p => p.type !== 'auto_switch');
    targets.forEach(p => {
      const opt = document.createElement('option');
      const usable = isProfileDirectlyUsable(p);
      const protoLabel = getProtocolLabel(p);
      opt.value = p.id;
      opt.textContent = usable
        ? `${p.name} (${protoLabel})`
        : `⚠️ ${p.name} (${protoLabel} · 协议不支持)`;
      if (!usable) {
        opt.style.color = 'var(--danger)';
      }
      ruleTargetSelect.appendChild(opt);
    });
  }

  // 2. 默认回退动作下拉菜单
  if (selectDefaultFallbackProfile) {
    selectDefaultFallbackProfile.innerHTML = '';
    const targets = appConfig.profiles.filter(p => p.type !== 'auto_switch');
    targets.forEach(p => {
      const opt = document.createElement('option');
      const usable = isProfileDirectlyUsable(p);
      opt.value = p.id;
      opt.textContent = usable ? p.name : `⚠️ ${p.name} (协议不支持)`;
      if (!usable) opt.style.color = 'var(--danger)';
      if (p.id === (appConfig.defaultProfileId || 'direct')) {
        opt.selected = true;
      }
      selectDefaultFallbackProfile.appendChild(opt);
    });
  }
}

/**
 * 打开新建节点 Modal
 */
function openAddProfileModal() {
  profileModalTitle.textContent = '新建代理节点';
  profileFormId.value = '';
  profileNameInput.value = '';
  profileSchemeSelect.value = 'http';
  profileColorInput.value = '#3b82f6';
  profileHostInput.value = '127.0.0.1';
  profilePortInput.value = '7890';
  profileAuthUserInput.value = '';
  profileAuthPassInput.value = '';
  profileDescInput.value = '';

  profileModal.classList.add('open');
}

/**
 * 打开编辑节点 Modal
 */
function openEditProfileModal(id) {
  const profile = appConfig.profiles.find(p => p.id === id);
  if (!profile) return;

  profileModalTitle.textContent = '编辑代理节点';
  profileFormId.value = profile.id;
  profileNameInput.value = profile.name || '';
  profileSchemeSelect.value = profile.scheme || 'http';
  profileColorInput.value = profile.color || '#3b82f6';
  profileHostInput.value = profile.host || '127.0.0.1';
  profilePortInput.value = profile.port || 7890;

  profileAuthUserInput.value = profile.auth?.username || '';
  profileAuthPassInput.value = profile.auth?.password || '';
  profileDescInput.value = profile.description || '';

  profileModal.classList.add('open');
}

/**
 * 保存代理节点
 */
function handleSaveProfile(e) {
  e.preventDefault();

  const name = profileNameInput.value.trim();
  const host = profileHostInput.value.trim();
  const port = parseInt(profilePortInput.value.trim(), 10);
  const scheme = profileSchemeSelect.value;
  const color = profileColorInput.value;
  const desc = profileDescInput.value.trim();
  const authUser = profileAuthUserInput.value.trim();
  const authPass = profileAuthPassInput.value;
  const authEnabled = Boolean(authUser);

  if (!name || !host || isNaN(port) || port < 1 || port > 65535) {
    showToast('请完整填写节点名称、服务器地址和有效端口 (1-65535)', 'error');
    return;
  }

  const editId = profileFormId.value;

  if (editId) {
    const p = appConfig.profiles.find(item => item.id === editId);
    if (p) {
      p.name = name;
      p.scheme = scheme;
      p.protocol = scheme;
      p.directlyUsable = true;
      p.host = host;
      p.port = port;
      p.color = color;
      p.description = desc;
      p.auth = {
        enabled: authEnabled,
        username: authUser,
        password: authPass
      };
    }
  } else {
    const newProfile = {
      id: generateId('profile'),
      name,
      type: 'fixed',
      scheme,
      protocol: scheme,
      directlyUsable: true,
      host,
      port,
      color,
      builtIn: false,
      description: desc,
      auth: {
        enabled: authEnabled,
        username: authUser,
        password: authPass
      }
    };
    appConfig.profiles.push(newProfile);
  }

  profileModal.classList.remove('open');
  syncAndSaveConfig('代理节点已保存');
  renderProfilesGrid();
  populateDropdownOptions();
}

/**
 * 删除代理节点
 */
function deleteProfile(id) {
  const profile = appConfig.profiles.find(p => p.id === id);
  if (!profile || profile.builtIn) {
    showToast('内置节点不可删除', 'error');
    return;
  }

  if (confirm(`确定要删除代理节点「${profile.name}」吗？关联的分流规则将失效。`)) {
    appConfig.profiles = appConfig.profiles.filter(p => p.id !== id);
    if (appConfig.activeProfileId === id) {
      appConfig.activeProfileId = 'auto_switch';
    }
    syncAndSaveConfig('代理节点已删除');
    renderProfilesGrid();
    renderRulesTable();
    populateDropdownOptions();
  }
}

/**
 * 打开添加规则 Modal
 */
function openAddRuleModal() {
  populateDropdownOptions();
  ruleModalTitle.textContent = '添加分流规则';
  ruleFormId.value = '';
  ruleTypeSelect.value = 'wildcard';
  rulePatternInput.value = '';
  ruleCommentInput.value = '';
  updateRuleTypeHelp();

  ruleModal.classList.add('open');
}

/**
 * 打开编辑规则 Modal
 */
function openEditRuleModal(id) {
  populateDropdownOptions();
  const rule = appConfig.rules.find(r => r.id === id);
  if (!rule) return;

  ruleModalTitle.textContent = '编辑分流规则';
  ruleFormId.value = rule.id;
  ruleTypeSelect.value = rule.type || 'wildcard';
  rulePatternInput.value = rule.pattern || '';
  ruleTargetSelect.value = rule.targetProfileId;
  ruleCommentInput.value = rule.comment || '';
  updateRuleTypeHelp();

  ruleModal.classList.add('open');
}

/**
 * 保存分流规则
 */
function handleSaveRule(e) {
  e.preventDefault();

  const pattern = rulePatternInput.value.trim();
  const type = ruleTypeSelect.value;
  const targetProfileId = ruleTargetSelect.value;
  const comment = ruleCommentInput.value.trim();

  if (!pattern) {
    showToast('请填写匹配表达式 (Pattern)', 'error');
    return;
  }

  const editId = ruleFormId.value;

  if (editId) {
    const r = appConfig.rules.find(item => item.id === editId);
    if (r) {
      r.pattern = pattern;
      r.type = type;
      r.targetProfileId = targetProfileId;
      r.comment = comment;
    }
  } else {
    const newRule = {
      id: generateId('rule'),
      enabled: true,
      type,
      pattern,
      targetProfileId,
      comment
    };
    appConfig.rules.unshift(newRule);
  }

  ruleModal.classList.remove('open');
  syncAndSaveConfig('分流规则已保存');
  renderRulesTable();
}

/**
 * 删除分流规则
 */
function deleteRule(id) {
  const rule = appConfig.rules.find(r => r.id === id);
  if (!rule) return;

  if (confirm(`确定要删除规则「${rule.pattern}」吗？`)) {
    appConfig.rules = appConfig.rules.filter(r => r.id !== id);
    syncAndSaveConfig('规则已删除');
    renderRulesTable();
  }
}

/**
 * 规则帮助提示更新
 */
function updateRuleTypeHelp() {
  if (!ruleTypeSelect || !ruleTypeHelp) return;
  const t = ruleTypeSelect.value;
  if (t === 'wildcard') {
    ruleTypeHelp.textContent = '通配符模式：支持 * 和 ?，如 *.google.com 匹配所有子域名';
  } else if (t === 'exact') {
    ruleTypeHelp.textContent = '精确匹配：仅当域名完全一致时命中，如 github.com';
  } else if (t === 'keyword') {
    ruleTypeHelp.textContent = '关键词匹配：网址或域名包含该字符串即命中，如 youtube';
  } else if (t === 'regex') {
    ruleTypeHelp.textContent = '正则表达式：如 ^https?://.*\\.example\\.com/.*$';
  }
}

/**
 * 沙盒规则实时模拟测试
 */
function handleTestSandbox() {
  const inputUrl = sandboxInput.value.trim();
  if (!inputUrl) {
    showToast('请输入要测试的 URL 或域名', 'error');
    return;
  }

  const fallbackId = selectDefaultFallbackProfile.value || 'direct';
  const result = simulateRuleMatch(inputUrl, appConfig.rules, appConfig.bypassList, fallbackId);

  const profileMap = new Map();
  appConfig.profiles.forEach(p => profileMap.set(p.id, p));

  const targetProfile = profileMap.get(result.targetProfileId) || { name: result.targetProfileId, color: '#6b7280' };

  sandboxResult.className = 'sandbox-result match-success';
  sandboxResult.innerHTML = `
    <div>
      <div><strong>测试目标:</strong> <code>${inputUrl}</code></div>
      <div style="margin-top: 4px; color: var(--text-secondary);">
        命中机制: <strong>${result.matchType === 'rule' ? '规则命中 (' + (result.matchedRule?.pattern || '') + ')' : (result.matchType === 'bypass' ? '绕过名单 Direct' : '默认回退动作')}</strong>
        ${result.matchedRule?.comment ? `· <em>${result.matchedRule.comment}</em>` : ''}
      </div>
    </div>
    <div class="target-profile-pill" style="font-size: 14px; background: var(--bg-sidebar); padding: 6px 12px; border-radius: var(--radius-sm);">
      <span class="target-dot" style="background-color: ${targetProfile.color || '#3b82f6'};"></span>
      <strong>流量出口: ${targetProfile.name}</strong>
    </div>
  `;
}

/**
 * 导出配置 JSON
 */
function exportConfigFile() {
  const jsonStr = JSON.stringify(appConfig, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MEIProxy_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('配置备份已导出');
}

/**
 * 打开常用规则集一键导入 Modal
 */
function openPresetRuleSetModal() {
  selectPresetRuleSet.innerHTML = '';

  // 1. 预置精品规则集
  const optGroupPresets = document.createElement('optgroup');
  optGroupPresets.label = '— 预置精品规则集 —';
  PRESET_RULE_SETS.forEach(set => {
    const opt = document.createElement('option');
    opt.value = set.id;
    opt.textContent = `${set.name} (${set.rules.length} 条)`;
    optGroupPresets.appendChild(opt);
  });
  selectPresetRuleSet.appendChild(optGroupPresets);

  // 2. 用户自定义模板
  const savedSets = appConfig.savedRuleSets || [];
  if (savedSets.length > 0) {
    const optGroupSaved = document.createElement('optgroup');
    optGroupSaved.label = '— 我的自定义模板 —';
    savedSets.forEach(set => {
      const opt = document.createElement('option');
      opt.value = set.id;
      opt.textContent = `${set.name} (${set.rules.length} 条)`;
      optGroupSaved.appendChild(opt);
    });
    selectPresetRuleSet.appendChild(optGroupSaved);
  }

  // 3. 填充目标出口节点
  selectPresetRuleTargetProfile.innerHTML = '';
  const validTargets = (appConfig.profiles || []).filter(p => p.type !== 'auto_switch');
  validTargets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${(p.scheme || p.type).toUpperCase()})`;
    selectPresetRuleTargetProfile.appendChild(opt);
  });

  // 更新预览
  updatePresetRuleSetPreview(selectPresetRuleSet.value);
  presetRuleSetModal.classList.add('open');
}

/**
 * 更新规则集预览面板
 */
function updatePresetRuleSetPreview(setId) {
  let set = PRESET_RULE_SETS.find(s => s.id === setId);
  if (!set && appConfig.savedRuleSets) {
    set = appConfig.savedRuleSets.find(s => s.id === setId);
  }
  if (!set) set = PRESET_RULE_SETS[0];

  presetRuleSetName.textContent = set.name;
  presetRuleSetTag.textContent = set.tag || '自定义模板';
  presetRuleSetDesc.textContent = set.description || '包含常用网址的分流匹配规则集';
  presetRuleSetCount.textContent = set.rules.length;

  presetRuleSetPreviewList.innerHTML = '';
  set.rules.forEach(r => {
    const item = document.createElement('div');
    item.className = 'ruleset-preview-item';
    item.innerHTML = `
      <span class="ruleset-preview-pattern">${r.pattern}</span>
      <span class="ruleset-preview-comment">${r.comment || ''}</span>
    `;
    presetRuleSetPreviewList.appendChild(item);
  });

  if (set.defaultTargetType === 'direct') {
    selectPresetRuleTargetProfile.value = 'direct';
  } else {
    const firstFixed = (appConfig.profiles || []).find(p => p.type === 'fixed');
    if (firstFixed) {
      selectPresetRuleTargetProfile.value = firstFixed.id;
    }
  }
}

/**
 * 确认导入规则集
 */
function handleConfirmImportPresetRuleSet() {
  const setId = selectPresetRuleSet.value;
  let set = PRESET_RULE_SETS.find(s => s.id === setId);
  if (!set && appConfig.savedRuleSets) {
    set = appConfig.savedRuleSets.find(s => s.id === setId);
  }
  if (!set) return;

  const targetProfileId = selectPresetRuleTargetProfile.value;
  const importMode = selectPresetRuleImportMode.value; // 'append' | 'overwrite'

  const newRules = set.rules.map(r => ({
    id: generateId('rule'),
    enabled: true,
    type: r.type || 'wildcard',
    pattern: r.pattern,
    targetProfileId: targetProfileId,
    comment: r.comment ? `${r.comment} (来自「${set.name}」)` : `来自「${set.name}」`
  }));

  if (importMode === 'overwrite') {
    appConfig.rules = newRules;
  } else {
    const existingPatterns = new Set((appConfig.rules || []).map(r => (r.pattern || '').toLowerCase()));
    const uniqueRules = newRules.filter(r => !existingPatterns.has(r.pattern.toLowerCase()));
    appConfig.rules = [...uniqueRules, ...(appConfig.rules || [])];
  }

  presetRuleSetModal.classList.remove('open');
  syncAndSaveConfig(`成功导入规则集「${set.name}」共 ${newRules.length} 条规则！`);
  renderRulesTable();
}

/**
 * 将当前启用的规则保存为模板
 */
function handleSaveCurrentRulesAsTemplate() {
  const enabledRules = (appConfig.rules || []).filter(r => r.enabled);
  if (enabledRules.length === 0) {
    showToast('当前没有已启用的规则可供保存', 'error');
    return;
  }

  const name = prompt('请输入新规则集模板名称：', `我的规则模板 (${new Date().toLocaleDateString()})`);
  if (!name || !name.trim()) return;

  if (!appConfig.savedRuleSets) appConfig.savedRuleSets = [];

  const template = {
    id: generateId('ruleset'),
    name: name.trim(),
    description: `用户自定义保存的规则模板，共 ${enabledRules.length} 条规则`,
    tag: '自定义模板',
    defaultTargetType: 'proxy',
    rules: enabledRules.map(r => ({
      pattern: r.pattern,
      type: r.type || 'wildcard',
      comment: r.comment || ''
    }))
  };

  appConfig.savedRuleSets.push(template);
  syncAndSaveConfig(`已将当前规则保存为模板「${name.trim()}」！`);
}

/**
 * 导入配置 JSON
 */
function importConfigFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (imported && imported.profiles && imported.rules) {
        appConfig = { ...DEFAULT_SETTINGS, ...imported };
        syncAndSaveConfig('配置还原成功！');
        renderAll();
      } else {
        showToast('无效的备份文件格式', 'error');
      }
    } catch {
      showToast('解析 JSON 文件失败', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/**
 * 重置为初始默认配置
 */
function handleResetDefaults() {
  if (confirm('确定要恢复出厂默认设置吗？所有自定义节点与规则都将被重置为初始状态。')) {
    appConfig = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    syncAndSaveConfig('已重置为初始配置');
    renderAll();
  }
}

/**
 * 绑定全部交互事件
 */
function setupEventListeners() {
  // 节点过滤、搜索、排序与视图切换
  if (profileSearchInput) {
    profileSearchInput.addEventListener('input', (e) => {
      activeProfileSearchQuery = e.target.value.trim();
      renderProfilesGrid();
    });
  }

  if (filterProfileProtocol) {
    filterProfileProtocol.addEventListener('change', (e) => {
      activeProfileProtocolFilter = e.target.value;
      renderProfilesGrid();
    });
  }

  if (sortProfileOption) {
    sortProfileOption.addEventListener('change', (e) => {
      activeProfileSortOption = e.target.value;
      renderProfilesGrid();
    });
  }

  if (btnViewGrid) {
    btnViewGrid.addEventListener('click', () => {
      activeViewMode = 'grid';
      btnViewGrid.classList.add('active');
      if (btnViewList) btnViewList.classList.remove('active');
      renderProfilesGrid();
    });
  }

  if (btnViewList) {
    btnViewList.addEventListener('click', () => {
      activeViewMode = 'list';
      btnViewList.classList.add('active');
      if (btnViewGrid) btnViewGrid.classList.remove('active');
      renderProfilesGrid();
    });
  }

  if (btnCleanDeadNodes) {
    btnCleanDeadNodes.addEventListener('click', handleCleanDeadNodes);
  }

  // 导航切换
  navItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  // 规则搜索
  if (ruleSearchInput) {
    ruleSearchInput.addEventListener('input', (e) => {
      activeRuleSearchQuery = e.target.value.trim();
      renderRulesTable();
    });
  }

  // 默认回退选择
  if (selectDefaultFallbackProfile) {
    selectDefaultFallbackProfile.addEventListener('change', (e) => {
      const autoSwitchProfile = appConfig.profiles.find(p => p.type === 'auto_switch');
      if (autoSwitchProfile) {
        autoSwitchProfile.defaultProfileId = e.target.value;
      }
      appConfig.defaultProfileId = e.target.value;
      syncAndSaveConfig('默认未匹配动作已更新');
    });
  }

  // 节点 Modal
  if (btnOpenAddProfileModal) btnOpenAddProfileModal.addEventListener('click', openAddProfileModal);
  if (btnCloseProfileModal) btnCloseProfileModal.addEventListener('click', () => profileModal.classList.remove('open'));
  if (btnCancelProfileModal) btnCancelProfileModal.addEventListener('click', () => profileModal.classList.remove('open'));
  if (btnSaveProfile) btnSaveProfile.addEventListener('click', handleSaveProfile);

  // 规则集 Modal 与保存模板
  if (btnOpenPresetRuleSetModal) btnOpenPresetRuleSetModal.addEventListener('click', openPresetRuleSetModal);
  if (btnSaveCurrentRulesAsTemplate) btnSaveCurrentRulesAsTemplate.addEventListener('click', handleSaveCurrentRulesAsTemplate);
  if (btnClosePresetRuleSetModal) btnClosePresetRuleSetModal.addEventListener('click', () => presetRuleSetModal.classList.remove('open'));
  if (btnCancelPresetRuleSetModal) btnCancelPresetRuleSetModal.addEventListener('click', () => presetRuleSetModal.classList.remove('open'));
  if (selectPresetRuleSet) selectPresetRuleSet.addEventListener('change', (e) => updatePresetRuleSetPreview(e.target.value));
  if (btnConfirmImportPresetRuleSet) btnConfirmImportPresetRuleSet.addEventListener('click', handleConfirmImportPresetRuleSet);

  // 规则 Modal
  if (btnOpenAddRuleModal) btnOpenAddRuleModal.addEventListener('click', openAddRuleModal);
  if (btnCloseRuleModal) btnCloseRuleModal.addEventListener('click', () => ruleModal.classList.remove('open'));
  if (btnCancelRuleModal) btnCancelRuleModal.addEventListener('click', () => ruleModal.classList.remove('open'));
  if (btnSaveRule) btnSaveRule.addEventListener('click', handleSaveRule);
  if (ruleTypeSelect) ruleTypeSelect.addEventListener('change', updateRuleTypeHelp);

  // 沙盒测试
  if (btnTestSandbox) btnTestSandbox.addEventListener('click', handleTestSandbox);
  if (sandboxInput) {
    sandboxInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleTestSandbox();
    });
  }

  // 保存 Bypass
  if (btnSaveBypass) {
    btnSaveBypass.addEventListener('click', () => {
      const list = bypassListTextarea.value.split('\n').map(s => s.trim()).filter(Boolean);
      appConfig.bypassList = list;
      syncAndSaveConfig('绕过名单已保存');
    });
  }

  // 保存 PAC
  if (btnSavePac) {
    btnSavePac.addEventListener('click', () => {
      appConfig.customPac = {
        enabled: true,
        url: pacUrlInput.value.trim(),
        script: pacScriptTextarea.value
      };
      syncAndSaveConfig('自定义 PAC 设置已保存');
    });
  }

  // 保存 General
  if (btnSaveGeneral) {
    btnSaveGeneral.addEventListener('click', () => {
      appConfig.general = {
        ...appConfig.general,
        showBadge: chkShowBadge.checked,
        autoCheckIp: chkAutoCheckIp.checked
      };
      syncAndSaveConfig('偏好设置已保存');
    });
  }

  // 备份与还原
  if (btnExportConfig) btnExportConfig.addEventListener('click', exportConfigFile);
  if (btnTriggerImport) btnTriggerImport.addEventListener('click', () => importFileInput.click());
  if (importFileInput) importFileInput.addEventListener('change', importConfigFile);
  if (btnResetDefaults) btnResetDefaults.addEventListener('click', handleResetDefaults);

  // 监听外部配置变更
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.meiproxy_config) {
        appConfig = changes.meiproxy_config.newValue;
        renderAll();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initOptions);
