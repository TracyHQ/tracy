// dsh-passwords 设置分区（settings.section 一级分区）。
// 在设置页左侧导航注册一个独立分区（有自己的 label），分区体 = 静态标题 +
// 描述 + 子槽卡片列表（renderSlot 渲染注册进 dsh-passwords.plugin.item 的卡片）。
// 这样 dsh-passwords 的设置不再挤在官方"插件"列表里，而是单独成区。
import { createElement as h } from 'react';
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from './locales';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'dsh-passwords.plugin.item': {
      kind: 'list';
      scope: 'root';
    };
  }
}

// 与官方 settings section 一样按 share 组合 props，不在插件内重写 renderSlot/t。
type SectionProps = PropsRuntime<'settings.section'>
  & PropsRenderSlots<'dsh-passwords.plugin.item'>
  & PropsLocale<'dshpw'>;

const CSS = `
.dshpw-section-root{display:flex;flex-direction:column;gap:10px}
.dshpw-section-heading{font-size:16px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary);margin:0}
.dshpw-section-lede{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary);margin:0 0 4px}
.dshpw-section-cards{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.dshpw-section-cards>li{min-width:0}
`;

if (typeof document !== 'undefined') {
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function DshPasswordsSection(props: SectionProps) {
  const { t, renderSlot } = props;
  return h(
    'div',
    { className: 'dshpw-section-root' },
    h('h2', { className: 'dshpw-section-heading', title: t('sectionTitle') }, t('sectionTitle')),
    h('p', { className: 'dshpw-section-lede', title: t('sectionDesc') }, t('sectionDesc')),
    h('ul', { className: 'dshpw-section-cards' }, renderSlot('dsh-passwords.plugin.item', {})),
  );
}
