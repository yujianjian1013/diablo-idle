/**
 * build.js —— 把整个游戏打包成单个 HTML 文件
 * 用法：node build.js
 * 输出：dist/diablo-idle.html（双击即玩，方便分享）
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

let html = read('index.html');

/* 1. 内联 CSS */
const css = read('css/style.css');
html = html.replace(
  /<link rel="stylesheet" href="css\/style\.css">/,
  '<style>\n' + css + '\n</style>'
);

/* 2. 依次内联 JS（保持原有顺序） */
const scripts = [
  'js/audio.js',
  'js/data.js',
  'js/map.js',
  'js/core.js',
  'js/ui.js',
  'js/main.js',
];
for (const rel of scripts) {
  const code = read(rel);
  const tag = '<script src="' + rel + '"></script>';
  if (html.indexOf(tag) < 0) {
    console.error('找不到脚本标签: ' + tag);
    process.exit(1);
  }
  html = html.replace(tag, '<script>\n' + code + '\n</script>');
}

/* 3. 加一句构建标记 */
html = html.replace(
  '<title>',
  '<!-- 单文件构建 · ' + new Date().toISOString().slice(0, 19) + ' -->\n<title>'
);

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);
const out = path.join(DIST, 'diablo-idle.html');
fs.writeFileSync(out, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('已生成: dist/diablo-idle.html (' + kb + ' KB)');
