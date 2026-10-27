// F-21 回归测试：文件夹白名单点段路径绕过
// 攻击面：folderAllowed 纯字符串前缀匹配不解析 .. 点段，/root/11/../21
// 在文件系统层等于 /root/21，可绕过白名单（实锤写/删白名单外文件、建会话到 /etc）。
// 修复后：normalizePath 用 path.posix.normalize 解析点段，前后端同口径。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  folderAllowed,
  isWorkspaceRestricted,
} from '../src/permissions.js';


const WL = ['/root/11'];

test('F-21：白名单内路径正常放行', () => {
  assert.equal(folderAllowed('/root/11', WL), true, '等于白名单目录');
  assert.equal(folderAllowed('/root/11/sub/dir', WL), true, '子目录');
  assert.equal(folderAllowed('/root/11/', WL), true, '尾部斜杠');
});

test('F-21：.. 点段不再绕过白名单（核心回归）', () => {
  assert.equal(folderAllowed('/root/11/../21', WL), false, '../21 解析后是白名单外');
  assert.equal(folderAllowed('/root/11/../21/../../etc', WL), false, '多层 .. 到 /etc');
  assert.equal(folderAllowed('/root/11/../21/x.txt', WL), false, '子文件形态');
  assert.equal(folderAllowed('/root/11/../../etc/passwd', WL), false, '读敏感文件路径');
});

test('F-21：点段保留在白名单内的路径仍放行', () => {
  // /root/11/sub/../sub2 → /root/11/sub2（白名单内）
  assert.equal(folderAllowed('/root/11/sub/../sub2', WL), true, '白名单内点段');
  assert.equal(folderAllowed('/root/11/./sub', WL), true, '当前目录点段');
  assert.equal(folderAllowed('/root/11//sub', WL), true, '双斜杠');
});

test('F-21：相对/反斜杠/混合形态', () => {
  assert.equal(folderAllowed('\\root\\11\\..\\21', WL), false, '反斜杠 + 点段');
  assert.equal(folderAllowed('root/11', WL), false, '相对路径无前导斜杠（保守拒绝）');
  assert.equal(folderAllowed('../root/11', WL), false, '相对点段前缀');
});

test('F-21：白名单条目自身也解析点段', () => {
  // 白名单条目带点段（主用户配置异常值）：/root/11/sub/.. → /root/11
  assert.equal(folderAllowed('/root/11/x', ['/root/11/sub/..']), true, '条目规范化后匹配');
});

test('F-21：空白名单 / 哨兵 / 根语义保持', () => {
  assert.equal(folderAllowed('/anywhere', []), true, '空白名单全允许');
  assert.equal(folderAllowed('/root/11', ['__deny__']), false, '哨兵禁止所有');
  assert.equal(folderAllowed('/anything', ['/']), true, '根条目全盘允许');
  assert.equal(folderAllowed('/anything', ['']), true, '空条目全盘允许');
});


test('isWorkspaceRestricted 语义', () => {
  assert.equal(isWorkspaceRestricted([]), false);
  assert.equal(isWorkspaceRestricted(['/root/11']), true);
  assert.equal(isWorkspaceRestricted(['__deny__']), true);
});
