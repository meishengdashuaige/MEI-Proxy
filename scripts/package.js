/**
 * MEI Proxy - Packaging & Release Build Script
 * Generates ready-to-use distribution packages for both Chromium and Firefox browsers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

console.log('========================================');
console.log('📦 开始打包 MEI Proxy 扩展程序');
console.log('========================================\n');

// 确保 dist 目录存在且清空
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const filesToInclude = [
  'manifest.json',
  'background.js',
  'README.md',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'options/options.html',
  'options/options.css',
  'options/options.js',
  'lib/pac_builder.js',
  'lib/preset_rules.js',
  'lib/storage.js',
  'lib/subscription.js',
  'lib/utils.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'icons/icon.svg'
];

/**
 * 安全清理：删除失败仅警告、不中断打包流程
 * （某些环境下 fs 的删除操作会被安全删除机制拦截，如回收站不可用时）
 */
function safeClean(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (err) {
    console.warn(`   ⚠️ 清理失败（可手动删除 ${target}）: ${err.message}`);
  }
}

function safeUnlink(target) {
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (err) {
    console.warn(`   ⚠️ 删除失败（可手动删除 ${target}）: ${err.message}`);
  }
}

/**
 * 复制文件到临时打包目录
 */
function stageFiles(targetDir, isFirefox = false) {
  safeClean(targetDir);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const relPath of filesToInclude) {
    const src = path.resolve(rootDir, relPath);
    const dest = path.resolve(targetDir, relPath);
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }

  const manifestPath = path.resolve(targetDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (isFirefox) {
    // Firefox MV3 规范与 AMO 上架合规要求
    // 关键：剔除 Chrome 专属权限 webRequestAuthProvider（Chrome 112+ 才存在，
    // Firefox 不认识该权限，会导致 manifest 校验失败、扩展无法加载）。
    // 代码中的 onAuthRequired 已降级为 'blocking' 模式，Firefox 下无需该权限。
    manifest.permissions = (manifest.permissions || []).filter(p => p !== 'webRequestAuthProvider');
    manifest.browser_specific_settings = {
      gecko: {
        id: "meiproxy@mei.local",
        strict_min_version: "115.0"
        // 注意：不要添加 data_collection_permissions —— 该字段 Firefox 131+ 才支持，
        // 与 strict_min_version 115 冲突，115~130 上会报未知字段警告。
      }
    };
    // Firefox 版所有 JS 打包为单文件（无 import），规避扩展页面 module 兼容风险
    const bundleOut = path.resolve(targetDir, '__bundle_out');
    execSync(`node "${path.resolve(__dirname, 'build_firefox_bundle.js')}" "${bundleOut}"`, { stdio: 'pipe' });
    for (const rel of ['background.js', 'popup/popup.js', 'options/options.js']) {
      fs.copyFileSync(path.resolve(bundleOut, rel), path.resolve(targetDir, rel));
    }
    safeClean(bundleOut);
    // popup/options HTML 改用普通脚本加载（bundle 为 IIFE，无需 module）
    for (const htmlRel of ['popup/popup.html', 'options/options.html']) {
      const htmlPath = path.resolve(targetDir, htmlRel);
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html.replace(/<script type="module" src="/g, '<script src="');
      fs.writeFileSync(htmlPath, html, 'utf8');
    }
    manifest.background = {
      scripts: ["background.js"]
      // 不加 type: "module"：bundle 是普通 IIFE 脚本，兼容所有 Firefox 版本
    };
  } else {
    // Chromium (Chrome/Edge/Brave) 规范
    manifest.background = {
      service_worker: "background.js",
      type: "module"
    };
    delete manifest.browser_specific_settings;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * 定位可用的 Python 解释器（用于标准 zip 打包）
 */
function findPython() {
  const candidates = ['python', 'py -3'];
  for (const c of candidates) {
    try {
      execSync(`${c} --version`, { stdio: 'pipe' });
      return c;
    } catch {
      // 尝试下一个
    }
  }
  // 兜底：使用 WorkBuddy 托管的 Python 运行时
  return '"C:\\Users\\34738\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe"';
}

/**
 * 用 Python zipfile 生成标准 zip（替代 PowerShell Compress-Archive）：
 * - 路径强制正斜杠 '/'，符合 zip 规范，避免浏览器解压兼容性问题
 * - 输出为对 Firefox/Chrome 完全兼容的标准 zip
 */
function zipDir(stageDir, zipPath) {
  const python = findPython();
  const script = path.resolve(__dirname, 'zip_dir.py');
  execSync(`${python} "${script}" "${stageDir}" "${zipPath}"`, { stdio: 'pipe' });
}

// 1. 打包 Chrome / Chromium 版本
const chromeStageDir = path.resolve(distDir, 'chrome_stage');
const chromeZipPath = path.resolve(distDir, 'MEI-Proxy-Chrome.zip');
safeUnlink(chromeZipPath);

console.log('1. 正在构建 Chromium 扩展包 (Chrome / Edge / Brave / Vivaldi)...');
stageFiles(chromeStageDir, false);

try {
  zipDir(chromeStageDir, chromeZipPath);
  console.log(`   ✓ 成功生成: ${path.relative(rootDir, chromeZipPath)} (${(fs.statSync(chromeZipPath).size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('   ❌ 生成 Chromium 压缩包失败:', err.message);
} finally {
  safeClean(chromeStageDir);
}

// 2. 打包 Firefox (Gecko) 版本 (.zip 和 .xpi)
const firefoxStageDir = path.resolve(distDir, 'firefox_stage');
const firefoxZipPath = path.resolve(distDir, 'MEI-Proxy-Firefox.zip');
const firefoxXpiPath = path.resolve(distDir, 'MEI-Proxy-Firefox.xpi');
safeUnlink(firefoxZipPath);
safeUnlink(firefoxXpiPath);

console.log('\n2. 正在构建 Firefox (Gecko) 扩展包 (Firefox / Floorp / Zen / Waterfox)...');
stageFiles(firefoxStageDir, true);

try {
  zipDir(firefoxStageDir, firefoxZipPath);
  // 复制为标准 .xpi 格式
  fs.copyFileSync(firefoxZipPath, firefoxXpiPath);
  console.log(`   ✓ 成功生成: ${path.relative(rootDir, firefoxZipPath)} (${(fs.statSync(firefoxZipPath).size / 1024).toFixed(1)} KB)`);
  console.log(`   ✓ 成功生成: ${path.relative(rootDir, firefoxXpiPath)} (${(fs.statSync(firefoxXpiPath).size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('   ❌ 生成 Firefox 扩展包失败:', err.message);
} finally {
  safeClean(firefoxStageDir);
}

console.log('\n========================================');
console.log('🎉 全部平台打包完成！文件均已保存至 dist/ 目录。');
console.log('========================================\n');
