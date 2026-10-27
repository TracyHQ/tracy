# better-locale 开发者指南

**中文** | [English](README.md)

面向**第三方插件作者**：如何让你的插件 UI 文案支持 better-locale 内置的 19 种第三语言（ja / ko / fr / ...）。

> **需要 DSH ≥ v0.1.2-alpha.1。** 从该版本起本插件是 DSH 原生语言包 API 之上的纯字典包。0.1.x 的接入方式（`ctx.betterLocale` 服务、围绕它的 activation-order-safe 模式、「先切 DSH 到 English」约束）已全部移除。

## 定位与边界

- **better-locale 只翻译 DSH 本体内置命名空间**（`common`、`conversation`、`settings.*`、……——即合并进 DSH `LocaleNamespaceMap` 的全部条目），共 19 种语言。词典范围在编译期被机器锁死在该表内。
- **你的插件命名空间归你。** 第三语言词典由你通过原生 `ctx.locale` API 自行注册（见本指南）。
- 两者互不干涉：better-locale 占用的是 `(本体 ns, 第三语言)` 槽位；你注册的是 `(你的 ns, locale)` 槽位。一个 `(ns, locale)` 词典对有且仅有一个属主，由 DSH 强制（重复 `register` 抛错）。**不要**为本体命名空间注册第三语言——这些槽位已被 better-locale 占用，后注册者会在加载时失败。

## 目录

- [现在的机制](#现在的机制)
- [未迁移插件的行为](#未迁移插件的行为)
- [为你的插件添加第三语言词典](#为你的插件添加第三语言词典)
- [添加 better-locale 未内置的语言](#添加-better-locale-未内置的语言)
- [测试你的接入](#测试你的接入)

---

## 现在的机制

better-locale 在 client 激活时注册一次：

```
ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' })   // 目录项
ctx.locale.register('common', 'ja', {...})                             // 词典，按 ns
ctx.locale.register('conversation', 'ja', {...})
...
```

其余全部由 DSH 的 locale 服务接管：语言出现在设置页原生 Language 行，选中后写入持久化设置 `locale.preference`，`<html lang>` 同步，翻译查找沿 key 级 fallback 链（`ja` → `en`；繁中三变体声明的是 `zh-HK/zh-TW/zh-MO` → `zh` → `en`）。没有 `ctx.betterLocale` 服务、没有 monkey-patch、没有 localStorage，也不要求 active locale 是 `en`。

让你的插件说第三语言，只需像注册 zh/en 一样，通过 `ctx.locale` 为同一 locale id 注册词典。

---

## 未迁移插件的行为

从不注册 zh/en 之外词典的插件，与 better-locale 共存**零配置、零报错**：

- 你注册的 `(你的 ns, 'zh'/'en')` 与 better-locale 注册的 `(本体 ns, 19 种第三语言)` 没有任何槽位交集，不会抛错。
- 用户选中如 日本語 时，DSH 界面经 better-locale 词典切换；**你的插件文案沿 key 级 fallback 链回退英文**——行为不变、可读、无破坏。
- Language 行、`locale.preference` 持久化、`<html lang>` 同步都是 DSH 原生行为——无论是否迁移，你的插件都自动享有。

迁移（下文）是纯增量：你的命名空间的 key 从回退英文变为按所选语言解析。

---

## 为你的插件添加第三语言词典

### 1. 声明 locale peer

`package.json`：

```jsonc
{
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-locale": "^0.1.2-alpha.1"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/dsh-client-locale": { "optional": true }
  }
}
```

### 2. 准备词典

每种语言一个扁平字典，key 与你的 zh/en 词典一致：

```ts
// src/client/dictionaries.ts
export const dicts: Record<string, Record<string, string>> = {
  ja: {
    'tab.title': 'サブエージェント',
    'settings.title': 'サブエージェント設定',
    // ... 你的 key
  },
  ko: {
    'tab.title': '서브에이전트',
    'settings.title': '서브에이전트 설정',
  },
  // ... 其他语言
}
```

### 3. 在 client `apply` 中注册

```ts
import { dicts } from './dictionaries.ts'
import { en, NS, zh } from './locales.ts'

export const inject = ['locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'my-plugin: zh/en')
  ctx.effect(() => {
    const disposers = Object.entries(dicts).map(([locale, dict]) => ctx.locale.register(NS, locale, dict))
    return () => { for (const dispose of disposers) dispose() }
  }, 'my-plugin: third-language dicts')
}
```

完成。用户在 设置 → General → Language 选中该语言后，你插件的 `t(key)` 返回你的词典文本；未翻译的 key 沿 fallback 链回退（你的词典 → en），其他插件的文案各自独立回退。

注意：

- 为某 locale 注册词典**不要求**该语言已注册（「词典可以先于/晚于语言定义注册」），但用户要能选中它，语言必须在目录里——ja / ko / ... 这 19 种由 better-locale 内置，你只需注册词典。
- 每份贡献都放进 `ctx.effect`，HMR / fiber 销毁时精确移除。

---

## 添加 better-locale 未内置的语言

如果你的插件想要 better-locale 未打包的语言（如世界语 `eo`），自己注册目录项即可——`addLanguage` 是普通公开 API，不由 better-locale 独占：

```ts
ctx.effect(() => {
  const disposeLanguage = ctx.locale.addLanguage({ id: 'eo', label: 'Esperanto', fallback: 'en' })
  const disposeDict = ctx.locale.register(NS, 'eo', { 'tab.title': 'Mia kromaĵo' })
  return () => { disposeLanguage(); disposeDict() }
}, 'my-plugin: eo')
```

locale 服务强制校验：id 必须匹配 BCP 47 风格的 `LOCALE_ID_PATTERN`，fallback 必须已注册，且 fallback 链必须终止于 `en`。重复目录 id 与重复 `(ns, locale)` 词典会抛错。

如果你想做一门 DSH 全量语言（覆盖 DSH 自身命名空间的词典），更建议贡献到 better-locale 的 `src/client/dictionaries/<lang>.ts`：加一个语言文件、在 `src/client/languages.ts` 的 `BUNDLED_LANGUAGES` 加一项、跑 `pnpm run gen:translations`、重新构建。

---

## 测试你的接入

### 单元测试

断言你的词典 key 集合与 en 词典一致：

```ts
// tests/dictionaries.spec.ts
import { describe, it, expect } from 'vitest'
import { en } from '../src/client/locales.ts'
import { dicts } from '../src/client/dictionaries.ts'

describe('dictionaries key-set integrity', () => {
  const enKeys = Object.keys(en).sort()
  for (const [lang, dict] of Object.entries(dicts)) {
    it(`${lang} has the same key set as en`, () => {
      expect(Object.keys(dict).sort()).toEqual(enKeys)
    })
  }
})
```

（严格 key 对齐是可选做法而非运行时要求——缺失 key 在查找时回退英文。）

### 手动验证

1. 把 better-locale + 你的插件装进 profile；启动 `dsh web`，硬刷新。
2. 设置 → General → Language → 选目标语言。
3. 你的插件文案切换；better-locale 覆盖到的 DSH 界面同步切换。
4. 切回 中文 / English——你的插件跟随。

### 疑难排查

| 现象 | 原因 |
|---|---|
| Language 行里没有某语言 | 目录项未注册（对 19 种内置语言即：better-locale 未安装 / 未激活） |
| 你的 key 显示英文 | 词典缺 key，或注册调用没执行（检查控制台有无重复 register 抛错） |
| `locale namespace "X" already has locale "ja"` | 该 (ns, locale) 已有属主；每个词典对只有一个所有者。若 `X` 是 **DSH 本体命名空间**（`common`、`conversation`、……），属主即 better-locale——只注册你自己拥有的命名空间 |
| 重启后语言选择丢失 | DSH `locale.preference` 写入失败（检查 settings 服务）——选择已不再存 localStorage |
