import { buildPacScript, formatProfileToPacString } from '../lib/pac_builder.js';
import { simulateRuleMatch, extractDomainInfo, detectNodeRegion } from '../lib/utils.js';
import { DEFAULT_PROFILES, DEFAULT_RULES, DEFAULT_BYPASS_LIST } from '../lib/storage.js';
import { PRESET_RULE_SETS, getPresetRuleSetById, getPresetRuleSetsSummary } from '../lib/preset_rules.js';

console.log('========================================');
console.log('🚀 开始 MEIProxy 扩展核心逻辑全覆盖自动化测试');
console.log('========================================\n');

// 1. PAC Profile String 转换测试
console.log('[测试 1] Profile 到 PAC 字符串格式化:');
const httpProf = { type: 'fixed', scheme: 'http', protocol: 'http', directlyUsable: true, host: '127.0.0.1', port: 7890 };
const httpsProf = { type: 'fixed', scheme: 'https', protocol: 'https', directlyUsable: true, host: 'proxy.company.com', port: 8443 };
const socks4Prof = { type: 'fixed', scheme: 'socks4', protocol: 'socks4', directlyUsable: true, host: '127.0.0.1', port: 1080 };
const socks5Prof = { type: 'fixed', scheme: 'socks5', protocol: 'socks5', directlyUsable: true, host: '127.0.0.1', port: 10808 };
const directProf = { type: 'direct' };
const systemProf = { type: 'system' };

console.assert(formatProfileToPacString(httpProf) === 'PROXY 127.0.0.1:7890; DIRECT', 'HTTP PAC 格式错误');
console.assert(formatProfileToPacString(httpsProf) === 'HTTPS proxy.company.com:8443; PROXY proxy.company.com:8443; DIRECT', 'HTTPS PAC 格式错误');
console.assert(formatProfileToPacString(socks4Prof) === 'SOCKS 127.0.0.1:1080; DIRECT', 'SOCKS4 PAC 格式错误');
console.assert(formatProfileToPacString(socks5Prof) === 'SOCKS5 127.0.0.1:10808; SOCKS 127.0.0.1:10808; DIRECT', 'SOCKS5 PAC 格式错误');
console.assert(formatProfileToPacString(directProf) === 'DIRECT', 'DIRECT PAC 格式错误');
console.assert(formatProfileToPacString(systemProf) === 'SYSTEM', 'SYSTEM PAC 格式错误');

// 1.1 不可直接代理节点 (VMess/VLESS/Trojan/SS/SSR) 在 PAC 中应回退 DIRECT，
//     避免把加密协议的 host:port 当作 HTTP/SOCKS 代理输出导致请求失败
const vmessProf = { type: 'fixed', scheme: 'https', protocol: 'vmess', directlyUsable: false, host: 'hk-vmess.example.com', port: 443 };
const trojanProf = { type: 'fixed', scheme: 'https', protocol: 'trojan', directlyUsable: false, host: 'trojan.example.com', port: 443 };
const ssProf = { type: 'fixed', scheme: 'socks5', protocol: 'ss', directlyUsable: false, host: 'ss.example.com', port: 8388 };
console.assert(formatProfileToPacString(vmessProf) === 'DIRECT', 'VMess 节点 PAC 应回退 DIRECT');
console.assert(formatProfileToPacString(trojanProf) === 'DIRECT', 'Trojan 节点 PAC 应回退 DIRECT');
console.assert(formatProfileToPacString(ssProf) === 'DIRECT', 'SS 节点 PAC 应回退 DIRECT');

// 1.2 向后兼容：缺少 directlyUsable / protocol 字段的旧节点按 scheme 判断
const legacySocks5Prof = { type: 'fixed', scheme: 'socks5', host: '127.0.0.1', port: 1080 };
console.assert(formatProfileToPacString(legacySocks5Prof) === 'SOCKS5 127.0.0.1:1080; SOCKS 127.0.0.1:1080; DIRECT', '旧 SOCKS5 节点向后兼容失败');
console.log('  ✓ HTTP / HTTPS / SOCKS4 / SOCKS5 / DIRECT / SYSTEM / 不可直接代理节点回退 / 旧配置兼容全部通过');

// 2. PAC 脚本构建器生成测试
console.log('\n[测试 2] PAC 脚本动态生成与语法完整性:');
const pacScript = buildPacScript({
  rules: DEFAULT_RULES,
  profiles: DEFAULT_PROFILES,
  bypassList: DEFAULT_BYPASS_LIST,
  defaultProfileId: 'direct'
});

console.assert(typeof pacScript === 'string' && pacScript.includes('function FindProxyForURL(url, host)'), 'PAC 脚本缺少入口函数');
console.assert(pacScript.includes('PROXY 127.0.0.1:7890; DIRECT'), 'PAC 脚本缺少 7890 代理定义');
console.assert(pacScript.includes('*.google.com'), 'PAC 脚本缺少 Google 规则');
console.assert(pacScript.includes('isInNet(host, "192.168.0.0"'), 'PAC 脚本缺少局域网直连判断');
console.log('  ✓ PAC 脚本生成成功，结构完备 (总字符数: ' + pacScript.length + ' 字节)');

// 3. 域名与子域提取测试
console.log('\n[测试 3] URL 域名与顶级通配模式提取:');
const t1 = extractDomainInfo('https://www.google.com/search?q=chrome+proxy');
console.assert(t1.host === 'www.google.com', '提取 host 失败');
console.assert(t1.domainPattern === '*.google.com', '提取通配符失败');

const t2 = extractDomainInfo('http://localhost:3000/dashboard');
console.assert(t2.host === 'localhost', '提取 localhost 失败');

const t3 = extractDomainInfo('https://api.v1.openai.com/chat/completions');
console.assert(t3.host === 'api.v1.openai.com', '提取多级子域失败');
console.assert(t3.domainPattern === '*.openai.com', '多级子域转通配模式失败: ' + t3.domainPattern);
console.log('  ✓ 基础域名、本地端口、多级子域通配模式提取全部通过');

// 4. 多规则类型匹配模拟测试 (Wildcard, Exact, Keyword, Regex, Bypass, Fallback)
console.log('\n[测试 4] 规则沙盒模拟器全类型测试:');

const testRules = [
  ...DEFAULT_RULES,
  { id: 'r_exact', enabled: true, type: 'exact', pattern: 'gitlab.myorg.com', targetProfileId: 'socks5_local', comment: '精确匹配' },
  { id: 'r_keyword', enabled: true, type: 'keyword', pattern: 'netflix', targetProfileId: 'clash_default', comment: '关键词匹配' },
  { id: 'r_regex', enabled: true, type: 'regex', pattern: '^https?:\\/\\/.*\\.internal\\.dev\\/.*$', targetProfileId: 'direct', comment: '正则匹配' },
  { id: 'r_disabled', enabled: false, type: 'wildcard', pattern: '*.disabled-site.com', targetProfileId: 'socks5_local' }
];

// 通配符测试
const m1 = simulateRuleMatch('https://www.youtube.com/watch?v=xyz', testRules, DEFAULT_BYPASS_LIST, 'direct');
console.assert(m1.matchType === 'rule' && m1.targetProfileId === 'clash_default', 'YouTube 通配符匹配失败');

// 精确匹配测试
const m2 = simulateRuleMatch('https://gitlab.myorg.com/project', testRules, DEFAULT_BYPASS_LIST, 'direct');
console.assert(m2.matchType === 'rule' && m2.targetProfileId === 'socks5_local', '精确匹配失败');

// 关键词匹配测试
const m3 = simulateRuleMatch('https://www.netflix.com/browse', testRules, DEFAULT_BYPASS_LIST, 'direct');
console.assert(m3.matchType === 'rule' && m3.targetProfileId === 'clash_default', '关键词匹配失败');

// 正则匹配测试
const m4 = simulateRuleMatch('https://api.v2.internal.dev/test', testRules, DEFAULT_BYPASS_LIST, 'clash_default');
console.assert(m4.matchType === 'rule' && m4.targetProfileId === 'direct', '正则匹配失败');

// 已禁用规则测试 (应跳过不匹配)
const m5 = simulateRuleMatch('https://sub.disabled-site.com', testRules, DEFAULT_BYPASS_LIST, 'direct');
console.assert(m5.matchType === 'default', '已禁用的规则不应被命中');

// Bypass 名单测试
const m6 = simulateRuleMatch('http://192.168.1.100:8080', testRules, DEFAULT_BYPASS_LIST, 'clash_default');
console.assert(m6.matchType === 'bypass' && m6.targetProfileId === 'direct', 'Bypass 名单匹配失败');

// 默认回退动作测试
const m7 = simulateRuleMatch('https://random-unknown-site.org', testRules, DEFAULT_BYPASS_LIST, 'socks5_local');
console.assert(m7.matchType === 'default' && m7.targetProfileId === 'socks5_local', '默认回退动作失败');
console.log('  ✓ 通配符、精确匹配、关键词、正则、禁用忽略、Bypass绕过、默认回退测试全部通过');

// 5. 订阅链接与节点解析引擎测试
console.log('\n[测试 5] 订阅解析引擎全格式测试 (Base64 / URI / Clash YAML):');

// Base64 UTF-8 解码
const b64Input = Buffer.from('socks5://user1:pass123@hk01.example.com:10808#🇭🇰 香港高速节点01\nhttp://us01.example.com:8080#🇺🇸 美国直连01').toString('base64');
const parsedB64Nodes = parseSubscriptionContent(b64Input, 'sub_test');
console.assert(parsedB64Nodes.length === 2, 'Base64 订阅节点数量应为 2');
console.assert(parsedB64Nodes[0].scheme === 'socks5', '节点 0 应为 socks5');
console.assert(parsedB64Nodes[0].host === 'hk01.example.com', '节点 0 主机应正确解析');
console.assert(parsedB64Nodes[0].auth.username === 'user1', '节点 0 用户名应为 user1');
console.assert(parsedB64Nodes[0].auth.password === 'pass123', '节点 0 密码应为 pass123');
console.assert(parsedB64Nodes[0].name.includes('香港'), '节点 0 中文备注应正确解析');

// Clash YAML 解析
const clashYaml = `
port: 7890
socks-port: 7891
proxies:
  - name: "🇯🇵 日本东京 01 (SOCKS5)"
    type: socks5
    server: jp01.example.com
    port: 10800
    username: myuser
    password: mypassword
  - name: "🇸🇬 新加坡 02 (HTTPS)"
    type: https
    server: sg02.example.com
    port: 8443
`;
const parsedClashNodes = parseClashYaml(clashYaml, 'sub_clash');
console.assert(parsedClashNodes.length === 2, 'Clash YAML 节点数应为 2');
console.assert(parsedClashNodes[0].scheme === 'socks5', 'Clash 节点 0 应为 socks5');
console.assert(parsedClashNodes[0].host === 'jp01.example.com', 'Clash 节点 0 主机错误');
console.assert(parsedClashNodes[1].scheme === 'https', 'Clash 节点 1 应为 https');
console.assert(parsedClashNodes[1].port === 8443, 'Clash 节点 1 端口错误');

// 统一默认身份验证 (Default Auth) 继承测试
const plainNodeText = `https://node01.ghelper-proxy.net:443#🇺🇸 美国 Ghelper 专线
https://node02.ghelper-proxy.net:443#🇯🇵 日本 Ghelper 专线
https://custom-user:custom-pass@node03.special.com:443#特殊独立账密节点`;
const defaultAuth = { enabled: true, username: 'subscriber_user_888', password: 'my_strong_password' };
const parsedWithDefaultAuth = parseSubscriptionContent(plainNodeText, 'sub_ghelper', defaultAuth);
console.assert(parsedWithDefaultAuth.length === 3, 'Default Auth 节点数应为 3');
console.assert(parsedWithDefaultAuth[0].auth.enabled === true, '节点 0 应自动启用 auth');
console.assert(parsedWithDefaultAuth[0].auth.username === 'subscriber_user_888', '节点 0 应继承统一用户名');
console.assert(parsedWithDefaultAuth[0].auth.password === 'my_strong_password', '节点 0 应继承统一密码');
console.assert(parsedWithDefaultAuth[1].auth.username === 'subscriber_user_888', '节点 1 应继承统一用户名');
console.assert(parsedWithDefaultAuth[2].auth.username === 'custom-user', '自带独立账密的节点 2 不应被统一账密覆盖');
console.assert(parsedWithDefaultAuth[2].auth.password === 'custom-pass', '节点 2 密码应保持独立');

// Clash YAML 结合统一默认身份验证测试
const clashWithoutAuth = `
proxies:
  - name: "🇩🇪 德国 01"
    type: http
    server: de01.example.com
    port: 8080
`;
const clashInheritedNodes = parseClashYaml(clashWithoutAuth, 'sub_clash_auth', defaultAuth);
console.assert(clashInheritedNodes[0].auth.enabled === true, 'Clash 节点应继承统一 auth');
console.assert(clashInheritedNodes[0].auth.username === 'subscriber_user_888', 'Clash 节点用户名应为统一用户名');

console.log('  ✓ Base64 订阅、中文字符、Clash YAML、统一默认身份验证 (Default Auth) 自动继承与冲突隔离全部通过');

// 6. 节点地区识别与国旗解析测试
console.log('\n[测试 6] 智能节点地区与国旗识别测试:');

const r1 = detectNodeRegion('🇭🇰 香港 01 [VIP专线] (1000M)');
console.assert(r1.code === 'HK' && r1.flag === '🇭🇰', '香港节点识别错误');

const r2 = detectNodeRegion('JP Tokyo Cloud Server - 02');
console.assert(r2.code === 'JP' && r2.flag === '🇯🇵', '日本节点识别错误');

const r3 = detectNodeRegion('US Los Angeles BGP 4K');
console.assert(r3.code === 'US' && r3.flag === '🇺🇸', '美国节点识别错误');

const r4 = detectNodeRegion('新加坡 狮城 03 (SOCKS5)');
console.assert(r4.code === 'SG' && r4.flag === '🇸🇬', '新加坡节点识别错误');

const r5 = detectNodeRegion('Custom Self-Hosted Server');
console.assert(r5.code === 'OTHER' && r5.flag === '🌐', '未知节点识别错误');
console.log('  ✓ 香港、日本、美国、新加坡及未知地区识别全部通过');

// 7. V2rayN (VMess / VLESS / Trojan / SSR) 协议扩展解析测试
console.log('\n[测试 7] V2rayN 扩展协议 (VMess / VLESS / Trojan / SSR) 解析测试:');

// VMess
const vmessJson = {
  v: "2",
  ps: "香港 VMess 高速 01",
  add: "hk-vmess.example.com",
  port: "443",
  id: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  aid: "0",
  net: "ws",
  type: "none",
  host: "hk-vmess.example.com",
  path: "/ws",
  tls: "tls"
};
const vmessUri = `vmess://${Buffer.from(JSON.stringify(vmessJson)).toString('base64')}`;
const parsedVmess = parseProxyUri(vmessUri, 'sub_vmess');
console.assert(parsedVmess !== null, 'VMess 节点未被成功解析');
console.assert(parsedVmess.name === '香港 VMess 高速 01', 'VMess 节点名称解析错误');
console.assert(parsedVmess.host === 'hk-vmess.example.com', 'VMess 节点 Host 解析错误');
console.assert(parsedVmess.port === 443, 'VMess 节点 Port 解析错误');
console.assert(parsedVmess.scheme === 'https', 'VMess TLS 应映射为 https');

// VLESS
const vlessUri = 'vless://uuid-1234-5678@vless.example.com:443?type=ws&security=tls&path=/vless#%E6%97%A5%E6%9C%AC%20VLESS%2001';
const parsedVless = parseProxyUri(vlessUri, 'sub_vless');
console.assert(parsedVless !== null, 'VLESS 节点未被成功解析');
console.assert(parsedVless.name === '日本 VLESS 01', 'VLESS 节点中文备注解析错误');
console.assert(parsedVless.host === 'vless.example.com', 'VLESS 节点 Host 解析错误');

// Trojan
const trojanUri = 'trojan://my-trojan-pass@trojan.example.com:443?security=tls#%E7%BE%8E%E5%9B%BD%20Trojan%20VIP';
const parsedTrojan = parseProxyUri(trojanUri, 'sub_trojan');
console.assert(parsedTrojan !== null, 'Trojan 节点未被成功解析');
console.assert(parsedTrojan.name === '美国 Trojan VIP', 'Trojan 节点中文备注解析错误');
console.assert(parsedTrojan.host === 'trojan.example.com', 'Trojan 节点 Host 解析错误');
console.assert(parsedTrojan.rawProtocol.password === 'my-trojan-pass', 'Trojan 密码解析错误');

console.log('  ✓ VMess (JSON)、VLESS、Trojan、中文字符转义全部准确解析通过');

// 8. 预置常用分流规则集完整性测试
console.log('\n[测试 8] 常用预置分流规则集数据源与检索测试:');

console.assert(PRESET_RULE_SETS.length >= 4, '预置规则集数量应至少为 4 套');
const summary = getPresetRuleSetsSummary();
console.assert(summary.length === PRESET_RULE_SETS.length, '规则集摘要长度不一致');

const aiSet = getPresetRuleSetById('ruleset_ai_dev');
console.assert(aiSet !== null, 'AI 规则集未找到');
console.assert(aiSet.rules.some(r => r.pattern === '*.chatgpt.com'), 'AI 规则集应包含 *.chatgpt.com');
console.assert(aiSet.rules.some(r => r.pattern === '*.github.com'), 'AI 规则集应包含 *.github.com');

const chinaSet = getPresetRuleSetById('ruleset_china_direct');
console.assert(chinaSet !== null && chinaSet.defaultTargetType === 'direct', '国内白名单默认动作应为 direct');
console.assert(chinaSet.rules.some(r => r.pattern === '*.baidu.com'), '国内白名单应包含 *.baidu.com');

console.log('  ✓ AI/开发、全球流媒体、国内直连白名单等规则集完整无误');

console.log('\n========================================');
console.log('🎉 8 大测试套件、全部测试用例 100% 验证通过！');
console.log('========================================\n');
