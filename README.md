# MEI Proxy

**MEI Proxy** 是一款现代化、高颜值且功能强大的浏览器代理管理扩展插件，全面兼容 **Chromium**（Chrome / Edge / Brave / Vivaldi 等）与 **Firefox**（Gecko）浏览器内核，旨在为开发者和重度网络用户提供丝滑、稳定、高效的代理切换与智能分流体验。

---

## 🌟 核心特性

1. **多种代理模式全面支持**：
   - **直接连接 (Direct)**：所有网络请求直连目标服务器。
   - **系统代理 (System)**：无缝遵循操作系统默认网络代理设置。
   - **固定代理节点 (Fixed Server)**：全面支持 **HTTP**、**HTTPS**、**SOCKS4**、**SOCKS5** 协议，支持主机、端口及账号密码鉴权。
   - **智能分流路由 (Auto Switch)**：依据预设的域名通配符、正则表达式、关键词或精确匹配规则，全自动分流网络流量（首条命中原则）。
   - **自定义 PAC 脚本**：支持远程 PAC 订阅 URL 及内置 JS PAC 脚本编辑器。

2. **节点订阅管理与多协议解析引擎**：
   - **多格式订阅解析**：支持直接输入订阅链接 URL 或粘贴 Base64 订阅内容、V2rayN 协议（VMess / VLESS / Trojan / SS / SSR）、纯链接列表（`http://`, `https://`, `socks5://`）及 Clash YAML 配置文件。
   - **浏览器原生代理（关键限制）**：浏览器 `chrome.proxy` / `browser.proxy` API **仅支持 HTTP / HTTPS / SOCKS4 / SOCKS5 传输层代理协议**。
     - ✅ 订阅中上述协议的节点可直接被浏览器代理，**无需任何第三方代理软件**。
     - ⚠️ VMess / VLESS / Trojan / Shadowsocks / SSR 等加密协议节点**无法被浏览器直接代理**——这些协议需要由本地客户端（V2Ray / Xray / Clash / sing-box 等）转换为本地 SOCKS5/HTTP 端口后，再在 MEIProxy 中新建一个指向 `127.0.0.1:<客户端端口>` 的节点才能使用。
     - MEIProxy 会自动识别每个订阅节点的原始协议并标注可用性：对加密协议节点禁用"激活"按钮、在 PAC 编译时让指向该节点的规则回退到直连，避免无效代理导致请求失败。
   - **订阅后台自动更新**：基于 `chrome.alarms` 实现后台非阻塞定时静默同步。
   - **一键批量并发测速**：一键对所有"可直接代理"的订阅节点并发测试延时（Ping 毫秒数），自动标注优劣；加密协议节点因浏览器无法直连而自动跳过。

3. **常用规则集一键导入与模板存储**：
   - 内置 **AI 智能与全球开发**、**全球流媒体与社交**、**中国大陆直连白名单**、**广告与隐私追踪屏蔽**等多套精品规则集。
   - 支持实时规则预览、增量追加/全量覆盖与自定义规则模板存储。

4. **精美 Popup 快捷菜单**：
   - 一键快速切换代理模式与节点，支持按订阅源分组筛选。
   - 实时出口 IP 归属地检测与节点网络延迟测速。
   - **一键分流**：自动识别当前访问标签页的顶级域名，一键将其加入智能分流规则。

---

## 🚀 安装指南

### 1. Chromium 浏览器 (Google Chrome / Microsoft Edge / Brave / Vivaldi 等)
1. 打开浏览器扩展管理页面（例如 Chrome 地址栏输入 `chrome://extensions/`，Edge 输入 `edge://extensions/`）。
2. 开启右上角的 **「开发者模式」 (Developer Mode)**。
3. 点击 **「加载已解压的扩展程序」 (Load unpacked)**。
4. 选择本项目目录 `MEIProxy` 即可完成安装并立即使用。

### 2. Firefox 浏览器 (Firefox / Floorp / Zen / Waterfox 等)
1. 打开 Firefox 地址栏输入 `about:debugging#/runtime/this-firefox`。
2. 点击 **「临时载入附加组件」 (Load Temporary Add-on)**。
3. 选择 `manifest.json` 文件或 `dist/MEI-Proxy-Firefox.zip` 即可完成载入。

---

## 📖 使用指南

### 1. 快捷切换与当前网站加规则 (Popup)
- 点击浏览器工具栏的 **MEIProxy 图标** 打开快捷菜单。
- 单击列表中任意节点或模式（如「智能分流」或「直接连接」），即刻生效。
- 访问任意海外或内网网站时，点击底部的 **「加入分流」**，即可将该域名永久分配至指定代理。

### 2. 管理代理节点与分流规则 (Options Dashboard)
- 在 Popup 菜单右上角点击 **⚙️ 设置图标**，或右键扩展图标选择 **「选项」** 打开仪表盘。
- **添加新节点**：在「代理节点管理」中点击「新建代理节点」，选择协议类型（如 SOCKS5）并填入 `127.0.0.1:10808`。
- **调试分流规则**：在「智能分流规则」页面中的沙盒测试框中输入任意网址（例如 `https://api.openai.com/v1`），点击「模拟测试」即可实时验证分流流向。

---

## 🛠️ 项目目录结构

```
MEIProxy/
├── manifest.json              # Chrome Manifest V3 扩展清单
├── background.js              # 后台 Service Worker (chrome.proxy 调度与角标状态)
├── icons/                     # 高清矢量与各尺寸图标
│   ├── icon.svg
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── lib/
│   ├── pac_builder.js         # 高性能动态 PAC 脚本编译引擎
│   ├── storage.js             # 本地配置持久化与默认模板
│   └── utils.js               # 延时测速、IP 查询与规则沙盒模拟器
├── popup/
│   ├── popup.html             # 快捷切换弹出面板
│   ├── popup.css              # 毛玻璃与暗黑/明亮主题样式
│   └── popup.js               # 弹窗交互控制逻辑
├── options/
│   ├── options.html           # 完整设置与管理控制台
│   ├── options.css            # 响应式后台仪表盘样式
│   └── options.js             # 节点、规则增删改查与备份还原逻辑
├── test/
│   └── test_core.js           # 核心逻辑自动化测试套件
└── README.md                  # 说明文档
```

---

## ⚖️ 许可与规范
- 基于 **Google Chrome Extensions Manifest V3** 标准。
- 零第三方重型依赖，轻量极速，完全开源透明。
