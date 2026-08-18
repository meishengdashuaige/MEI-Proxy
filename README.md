# MEI Proxy

MEI Proxy 是一个轻量、高效的浏览器代理管理与智能分流扩展，支持 **Chromium**（Chrome / Edge / Brave / Vivaldi 等）与 **Firefox**（Gecko）浏览器。

---

## 核心功能

### 1. 代理模式
- **直接连接 (Direct)**：不使用代理，所有网络请求直连目标服务器。
- **系统代理 (System)**：遵循操作系统默认的网络代理设置。
- **固定代理节点 (Fixed Server)**：支持 **HTTP**、**HTTPS**、**SOCKS4**、**SOCKS5** 协议，支持主机、端口及账号密码鉴权。
- **智能分流路由 (Auto Switch)**：支持通配符（如 `*.google.com`）、关键词和正则表达式规则，按列表自上而下匹配分流；未命中规则走默认回退动作。
- **自定义 PAC 脚本**：支持加载远程 PAC 脚本 URL，或在内置编辑器中编写自定义 PAC JavaScript 代码。

### 2. 节点订阅与自动分组
- **多格式订阅解析**：支持输入订阅链接或直接粘贴 Base64 订阅内容、Clash YAML 配置及链接列表。
- **自动分组隔离**：自动根据订阅源将节点归入不同组别，支持组别筛选与管理。
- **定时自动同步**：基于后台 Alarms 机制定时更新订阅节点。

### 3. 纯直连测速与分组选优
- **测速强制直连**：测速探针强制直连，不经过自身代理，避免代理流量回环影响测速准确性。
- **分组优先测速**：在选项页和 Popup 弹窗中测速时，优先在当前选中的分组内进行并发测速与选优切换。

### 4. 协议兼容性与提示
- **原生直连协议**：HTTP / HTTPS / SOCKS4 / SOCKS5 可直接被浏览器底层代理，**无需在本地运行任何第三方客户端**。
- **隧道加密协议**：VMess / VLESS / Trojan / Shadowsocks / SSR 等复杂协议浏览器原生无法直接建立连接。扩展会自动识别并标注「需客户端」，在本地客户端（如 Clash / V2Ray / Xray）转换为本地端口后添加即可使用。
- **Ghelper 专线支持**：Firefox 完整支持通过 `browser.proxy.onRequest` 主动注入认证使用 Ghelper 节点。

### 5. 规则沙盒模拟器与预置规则集
- **分流沙盒测试**：在规则页输入任意 URL，实时测试其命中哪条规则以及最终路由给哪个代理节点。
- **精品规则集导入**：内置 AI 平台、开发工具、全球流媒体与国内白名单等多套常用规则集，可一键导入。

### 6. 数据安全与备份
- **100% 本地存储**：所有节点、订阅和规则均保存在浏览器本地 Storage 中，不向任何服务器上传数据。
- **一键导入/导出**：支持将所有配置导出为 JSON 备份文件，方便跨浏览器或跨设备迁移。

---

## 协议支持说明

| 协议类型 | 浏览器直接使用 | 说明 |
| :--- | :--- | :--- |
| **HTTP / HTTPS** | 支持 | 浏览器底层原生支持，支持账号密码鉴权 |
| **SOCKS4 / SOCKS5** | 支持 | 浏览器底层原生支持（TCP 代理） |
| **VMess / VLESS / Trojan / SS** | 需本地客户端 | 复杂加密隧道，需在本地启动客户端转换出 HTTP/SOCKS 端口后接入 |

---

## 安装方法

### 1. Chrome / Edge / Chromium 内核浏览器
1. 下载 `dist/MEI-Proxy-Chrome.zip` 并解压。
2. 打开浏览器扩展页面（Chrome 输入 `chrome://extensions/`，Edge 输入 `edge://extensions/`）。
3. 开启右上角 **「开发者模式」**。
4. 点击 **「加载已解压的扩展程序」**，选择解压出的文件夹即可。

### 2. Firefox / Gecko 内核浏览器
- **长期使用（推荐开发者版 / Floorp / Zen / Nightly）**：
  1. 在 `about:config` 中将 `xpinstall.signatures.required` 设为 `false`。
  2. 将 `dist/MEI-Proxy-Firefox.xpi` 直接拖入浏览器窗口完成安装。
- **临时调试使用（标准版 Firefox）**：
  1. 打开 `about:debugging#/runtime/this-firefox`。
  2. 点击 **「临时载入附加组件」**，选择解压目录下的 `manifest.json` 或 `dist/MEI-Proxy-Firefox.zip`。

---

## 项目结构

```
MEIProxy/
├── manifest.json              # 扩展配置文件 (Manifest V3)
├── background.js              # 后台 Service Worker (代理调度与订阅同步)
├── index.html                 # 官方介绍与下载页面
├── assets/                    # 官网静态资源
├── icons/                     # 扩展图标
├── lib/
│   ├── pac_builder.js         # PAC 脚本编译引擎
│   ├── preset_rules.js        # 预置分流规则集数据
│   ├── storage.js             # 本地配置存储管理
│   ├── subscription.js        # 订阅解析引擎 (Base64 / Clash YAML / 链接)
│   └── utils.js               # 工具函数 (测速、IP 查询、沙盒匹配、协议检测)
├── popup/
│   ├── popup.html             # 快捷切换弹出面板
│   ├── popup.css              # 弹出面板样式
│   └── popup.js               # 弹出面板交互逻辑
├── options/
│   ├── options.html           # 完整管理控制台 (节点/订阅/规则/PAC/备份)
│   ├── options.css            # 控制台样式
│   └── options.js             # 控制台业务逻辑
├── scripts/
│   ├── build_firefox_bundle.js # Firefox 单文件安全打包
│   ├── generate_icons.js       # 图标生成工具
│   ├── package.js              # 自动化打包构建脚本
│   └── zip_dir.py              # 标准 zip 压缩工具
```

---

## 开发与构建

```bash
# 构建并生成 Chrome zip 与 Firefox xpi 安装包
node scripts/package.js
```

---

## 许可证
开源项目，基于 MIT 协议。
