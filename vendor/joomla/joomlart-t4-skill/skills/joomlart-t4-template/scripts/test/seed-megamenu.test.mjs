import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMegaSettings } from '../seed-megamenu.mjs';

test('buildMegaSettings keys columns by real menu item ids', () => {
  const menuItems = [
    { id: 101, title: 'Home', megabuild: 0 },
    { id: 102, title: 'Shop', megabuild: 1, columns: [{ title: 'Cats', type: 'items', items: '106,107' }] },
  ];
  const json = buildMegaSettings('mainmenu', menuItems);
  const parsed = JSON.parse(json);
  assert.ok(parsed.mainmenu['101']);
  assert.equal(parsed.mainmenu['102'].megabuild, 1);
  assert.equal(parsed.mainmenu['102'].settings[0].contents[0].items, '106,107');
});
