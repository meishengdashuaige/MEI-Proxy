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
 * 复制文件到临时打包目录
 */
function stageFiles(targetDir, isFirefox = false) {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
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
    manifest.browser_specific_settings = {
      gecko: {
        id: "meiproxy@mei.local",
        strict_min_version: "115.0",
        data_collection_permissions: {
          required: ["none"]
        }
      }
    };
    manifest.background = {
      scripts: ["background.js"],
      type: "module"
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

// 1. 打包 Chrome / Chromium 版本
const chromeStageDir = path.resolve(distDir, 'chrome_stage');
const chromeZipPath = path.resolve(distDir, 'MEI-Proxy-Chrome.zip');
if (fs.existsSync(chromeZipPath)) fs.unlinkSync(chromeZipPath);

console.log('1. 正在构建 Chromium 扩展包 (Chrome / Edge / Brave / Vivaldi)...');
stageFiles(chromeStageDir, false);

try {
  execSync(`powershell -Command "Compress-Archive -Path '${chromeStageDir}\\*' -DestinationPath '${chromeZipPath}' -Force"`);
  console.log(`   ✓ 成功生成: ${path.relative(rootDir, chromeZipPath)} (${(fs.statSync(chromeZipPath).size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('   ❌ 生成 Chromium 压缩包失败:', err.message);
} finally {
  fs.rmSync(chromeStageDir, { recursive: true, force: true });
}

// 2. 打包 Firefox (Gecko) 版本 (.zip 和 .xpi)
const firefoxStageDir = path.resolve(distDir, 'firefox_stage');
const firefoxZipPath = path.resolve(distDir, 'MEI-Proxy-Firefox.zip');
const firefoxXpiPath = path.resolve(distDir, 'MEI-Proxy-Firefox.xpi');
if (fs.existsSync(firefoxZipPath)) fs.unlinkSync(firefoxZipPath);
if (fs.existsSync(firefoxXpiPath)) fs.unlinkSync(firefoxXpiPath);

console.log('\n2. 正在构建 Firefox (Gecko) 扩展包 (Firefox / Floorp / Zen / Waterfox)...');
stageFiles(firefoxStageDir, true);

try {
  execSync(`powershell -Command "Compress-Archive -Path '${firefoxStageDir}\\*' -DestinationPath '${firefoxZipPath}' -Force"`);
  // 复制为标准 .xpi 格式
  fs.copyFileSync(firefoxZipPath, firefoxXpiPath);
  console.log(`   ✓ 成功生成: ${path.relative(rootDir, firefoxZipPath)} (${(fs.statSync(firefoxZipPath).size / 1024).toFixed(1)} KB)`);
  console.log(`   ✓ 成功生成: ${path.relative(rootDir, firefoxXpiPath)} (${(fs.statSync(firefoxXpiPath).size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('   ❌ 生成 Firefox 扩展包失败:', err.message);
} finally {
  fs.rmSync(firefoxStageDir, { recursive: true, force: true });
}

console.log('\n========================================');
console.log('🎉 全部平台打包完成！文件均已保存至 dist/ 目录。');
console.log('========================================\n');
