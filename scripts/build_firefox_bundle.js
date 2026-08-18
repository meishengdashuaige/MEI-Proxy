/**
 * build_firefox_bundle.js - Firefox 专用单文件打包
 *
 * 背景：popup/options/background 使用 ES module 跨目录 import（../lib/*.js）。
 * Firefox 对扩展页面 module 加载存在兼容性风险（按钮无反应等），
 * 社区标准做法是打包成单文件。本脚本把三个入口各打成一个无依赖 bundle。
 *
 * 优先使用 esbuild（在 managed node workspace 安装），
 * 找不到 esbuild 时回退到内置的简易合并器（本项目模块形态可控）。
 *
 * 用法: node scripts/build_firefox_bundle.js <输出目录>
 *   输出: <输出目录>/background.bundle.js / popup.bundle.js / options.bundle.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(rootDir, 'dist', 'firefox_bundles');

// 依赖库（按初始化顺序：函数提升无依赖，const 依次初始化）
const LIB_ORDER = [
  'lib/utils.js',
  'lib/storage.js',
  'lib/preset_rules.js',
  'lib/pac_builder.js',
  'lib/subscription.js',
  'lib/theme.js'
];

const ENTRIES = [
  { name: 'background', file: 'background.js' },
  { name: 'popup', file: 'popup/popup.js' },
  { name: 'options', file: 'options/options.js' }
];

function read(rel) {
  return fs.readFileSync(path.resolve(rootDir, rel), 'utf8');
}

/**
 * 简易合并器：删除 import 行 + 去掉 export 关键字
 */
function simpleBundle(entryRel) {
  const parts = [];
  for (const lib of LIB_ORDER) {
    let code = read(lib);
    // 去掉 export 前缀
    code = code
      .replace(/^export\s+async\s+function\s+/gm, 'async function ')
      .replace(/^export\s+function\s+/gm, 'function ')
      .replace(/^export\s+const\s+/gm, 'const ')
      .replace(/^export\s+let\s+/gm, 'let ')
      .replace(/^export\s+var\s+/gm, 'var ')
      .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
      .replace(/^export\s+default\s+/gm, '');
    parts.push(`/* ===== ${lib} ===== */\n${code}`);
  }

  let entry = read(entryRel);
  // 删除所有 import 语句行
  entry = entry.replace(/^import\s[^;]*;?\s*$/gm, '');
  parts.push(`/* ===== ${entryRel} ===== */\n${entry}`);

  return parts.join('\n\n');
}

function bundleWithEsbuild(entryRel) {
  const esbuild = require('esbuild');
  return esbuild.buildSync({
    entryPoints: [path.resolve(rootDir, entryRel)],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['firefox115'],
    minify: false,
    sourcemap: false,
    logLevel: 'silent'
  }).outputFiles[0].text;
}

fs.mkdirSync(outDir, { recursive: true });
let mode = 'esbuild';
let hasEsbuild = true;
try {
  require.resolve('esbuild');
} catch {
  hasEsbuild = false;
  mode = 'simple';
}
console.log(`[bundle] 打包模式: ${mode}`);

for (const entry of ENTRIES) {
  const code = hasEsbuild ? bundleWithEsbuild(entry.file) : simpleBundle(entry.file);
  // 输出路径与扩展内原文件同名，便于直接覆盖 stage 中的源文件
  const relOut = entry.name === 'background' ? 'background.js' : `${entry.name}/${entry.name}.js`;
  const outFile = path.resolve(outDir, relOut);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, code, 'utf8');
  console.log(`[bundle] ✓ ${relOut} (${(code.length / 1024).toFixed(1)} KB)`);
}

console.log(`[bundle] 完成，输出目录: ${outDir}`);
