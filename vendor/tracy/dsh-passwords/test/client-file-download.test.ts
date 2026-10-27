// 右侧栏文件下载按钮：纯函数与词典一致性测试 + 源码契约断言（无真实 DOM，
// 与 client-picker-delete 的静态断言方式一致）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { downloadUrlFor, downloadText } from '../src/client/file-download';
import { zh, en } from '../src/client/locales';

test('downloadUrlFor：query 参数整体编码（防 %/#/& 与路径注入）', () => {
  assert.equal(downloadUrlFor('/root/file.md'), '/gateway/api/download?path=%2Froot%2Ffile.md');
  // Windows 混合分隔符路径（官方 data-files-path 的真实形态）
  assert.equal(
    downloadUrlFor('D:\\ws/src/report#1.md'),
    '/gateway/api/download?path=D%3A%5Cws%2Fsrc%2Freport%231.md',
  );
  assert.equal(
    downloadUrlFor('/tmp/a b&c=d%.txt'),
    '/gateway/api/download?path=%2Ftmp%2Fa%20b%26c%3Dd%25.txt',
  );
});

test('downloadText/locales：zh 与 en 键完全一致且下载文案非空', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of ['dlFile', 'dlDenied', 'dlFailed', 'dlStarted'] as const) {
    assert.ok((zh[key] as string).length > 0, `zh.${key} 非空`);
    assert.ok((en[key] as string).length > 0, `en.${key} 非空`);
  }
  for (const value of Object.values(downloadText)) assert.ok(value.length > 0);
});

// ── 源码契约：键盘可达/可激活（Node 侧无真实 DOM，做静态断言） ──

function fileDownloadSource(): string {
  return readFileSync(new URL('../src/client/file-download.ts', import.meta.url), 'utf8');
}

test('源码契约：下载控件是原生 button（键盘可达，Enter/Space 原生可激活）', () => {
  const source = fileDownloadSource();
  assert.match(source, /document\.createElement\('button'\)/, '注入控件必须是原生 <button>');
  assert.match(source, /node\.type = 'button'/, '显式 type=button（不参与表单提交）');
  assert.doesNotMatch(source, /document\.createElement\('span'\)/, '不得再用不可聚焦的 span');
  assert.doesNotMatch(source, /setAttribute\('tabindex'/, '原生 button 默认进入 Tab 序列，不得再显式退出');
  assert.doesNotMatch(source, /setAttribute\('role', 'button'\)/, '原生 button 自带语义，无需 role=button');
});

test('源码契约：原生 button 复位 UA 样式（边框/内边距/外观），保持既有视觉', () => {
  const base = /\.dshpw-dl\{([^}]*)\}/.exec(fileDownloadSource());
  assert.ok(base, '应存在 .dshpw-dl 基础规则');
  for (const declaration of ['border:0', 'padding:0', 'appearance:none']) {
    assert.ok(base[1].includes(declaration), `基础规则应包含 ${declaration}`);
  }
});

test('源码契约：键盘激活与鼠标共用同一 click 路径（不绕开 HEAD 探测/下载语义）', () => {
  const source = fileDownloadSource();
  assert.match(source, /node\.addEventListener\('click'/, '原生 button 的 Enter/Space 会 native 触发 click');
  assert.doesNotMatch(source, /addEventListener\('keydown'/, '不得用自定义 keydown 另开一条激活路径');
  assert.match(source, /event\.preventDefault\(\)/, '点击必须阻止官方行打开预览');
  assert.match(source, /event\.stopPropagation\(\)/, '点击必须阻止冒泡到官方行');
});
