# better-locale：覆盖 DSH i18n 的多语言扩展插件

> 2026-08-23 · 设计阶段

## 背景与动机

DSH 本体（`@deepseek-ai/dsh-client-locale`）只内置 zh/en 两种语言：

- `LOCALE_IDS = ['zh', 'en'] as const`（`locale-settings.ts:12`）
- `LOCALES` 数组 `Object.freeze` 且为 private（`client/index.ts:107`）
- `LocaleSettingsSchema.preference = z.union([...LOCALE_IDS])` 拒绝其他语言（`locale-settings.ts:25`）
- `installLocale()` boot-once 抛错，renderer 直接捕获 LocaleFace 实例
- `ctx.provide('locale', x)` 二次注册抛错（cordis `reflect.ts:290`）
- `ctx.set('locale', x)` 仅 owner fiber 可写

DSH 未提供新增语言的官方扩展点。本插件通过运行时 monkey-patch `LocaleRuntime.prototype` 实现「保持 active='en'，覆盖 en 词典内容」的方式接入第三语言（ja/ko/fr 等），让所有依赖 `ctx.locale` 的插件无感切换。

## 设计目标

1. 不写 dsh 源码（符合 AGENTS.md 「零源码 patch」字面约束）。
2. 不污染 dsh 原生 UI——LanguageRow 仍只显示 zh/en；用户在新插件自有页面切换其他语言。
3. 不写入 host `locale.preference`（绕开 schema 枚举拒绝）。
4. 第三方插件可通过服务注册自己的多语言翻译。
5. 未安装本插件时其他插件无感降级（按 dsh 原生 zh/en 行为运行）。

## 核心机制

### 数据流

```
用户在 better-locale 页面选「日语」
  ↓
betterLocaleStore.setActive('ja')               // plugin 自管，写入 pluginSettings
  ↓
(ctx.locale as any).publish(active, true)        // active 不变（'zh' 或 'en'），
  ↓                                              // bump revision + 触发 locale/change
renderer 收到 revision 变化，重渲染所有 outlet
  ↓
translate(ns, key) → patched lookup
  ↓
betterLocaleStore.getOverride(active, ns, key)
  ├─ active='en' + 选了 ja + ja 词典有该 key → 返回 ja 文本
  └─ 否则 → origLookup.call(this, ns, key)       // 走 dsh 原生回退
```

关键点：**active locale 保持 dsh 原值**（zh 或 en），better-locale 只在 lookup 层注入覆盖文本。这样：

- Host schema 不需要改（active 仍是合法值）。
- LanguageRow 仍按原 LOCALES 列表渲染。
- `locale/change` 事件正常触发（用 `publish(active, true)`），所有监听者（含 better-sidebar 的 `attachLocale`）正确响应。

### 为什么不直接改 active

改 active 为 `'ja'` 会被 `setLocale` 拒绝（不在 LOCALES）；走 patch 也得改 `setLocale`、`adopt`、`detectBrowserLocale`、`syncDocumentLanguage`、`DOCUMENT_LANGUAGE` 多处。保持 active 原值、只 patch `lookup` 是最小侵入面。

### LocaleRuntime patch 内容

```ts
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale'

const origLookup = LocaleRuntime.prototype.lookup  // TS private, 运行时可读
LocaleRuntime.prototype.lookup = function (ns: string, key: string): string | undefined {
  const override = betterLocaleStore.getOverride(this.getLocale().active, ns, key)
  if (override !== undefined) return override
  return origLookup.call(this, ns, key)
}
```

`publish` 调用走 `any` 断言：

```ts
;(ctx.locale as any).publish(ctx.locale.getLocale().active, true)
```

注意 dsh 若改用 ES `#private` 真私有字段会破坏 patch（见「已知风险」）。

## 服务契约

### `ctx.betterLocale`

```ts
interface BetterLocaleService {
  /** 当前选中的覆盖语言 id（'ja'/'ko'/...），undefined 表示不覆盖 */
  readonly active: string | undefined
  /** 已注册的可选语言列表（按注册顺序） */
  readonly languages: readonly LocaleDefinition[]
  /** 选择覆盖语言；undefined 关闭覆盖，回到 dsh 原生行为 */
  setActive(localeId: string | undefined): void
  /** 订阅激活状态变化 */
  subscribe(listener: () => void): () => void
  /** 注册一个命名空间的多语言翻译（第三方插件协作接口） */
  register(ns: string, dicts: Record<string, LocaleDict>): () => void
  /** 读取当前覆盖语言下某 (ns, key) 的翻译，无则 undefined */
  getOverride(active: string, ns: string, key: string): string | undefined
}

interface LocaleDefinition {
  id: string         // 'ja' / 'ko' / 'fr' ...
  label: string      // 自描述名（'日本語'）
}
```

### 第三方插件协作

```ts
// 第三方插件的 client half
export const inject = ['betterLocale']  // peerDependenciesMeta.optional: true

export function apply(ctx: Context) {
  ctx.effect(() =>
    ctx.betterLocale.register('myPlugin', {
      ja: { hello: 'こんにちは' },
      ko: { hello: '안녕하세요' },
    })
  )
}
```

未安装 better-locale 时 `ctx.betterLocale` 为 undefined，注册代码跳过——同 better-sidebar 的 `ctx.betterSidebar` 模式。

## 用户入口

### 方案 A：注册到 better-sidebar 的 tab（推荐）

better-sidebar 暴露 `ctx.betterSidebar.registerTab`（见其 AGENTS.md §3），better-locale 注册一个「语言」tab：

```ts
ctx.betterSidebar.registerTab({
  id: 'better-locale:switcher',
  title: () => ctx.betterLocale.active ?? t('language'),
  icon: <GlobeIcon />,
  order: 60,
  single: true,
  component: ({ scope }) => <LanguageSwitcher sessionId={scope.sessionId} />,
})
```

`LanguageSwitcher` 列出已注册语言 + 「关闭覆盖（用 DSH 原生 zh/en）」选项，点击调用 `ctx.betterLocale.setActive(id)`。

### 方案 B：注册到 dsh settings 的 slot

`ctx.slots.register({ name: 'settings.general.item', ... }, LanguageRow)`，在 DSH 设置页 General 分区追加一行。需研究 ui-settings-general 的 slot 契约（better-sidebar 没用这条路径，需新调研）。

**初版选 A**，依赖 better-sidebar 已安装（`peerDependenciesMeta.optional: true`）。后续可补 B 作为无 better-sidebar 时的兜底。

## dsh 本体 en 词典覆盖

better-locale 自带 common / settings 等核心命名空间的 ja/ko/... 翻译，启动时：

```ts
ctx.effect(() => {
  // 不调 ctx.locale.register —— 那会冲突 duplicate 'en'
  // 直接存进 betterLocaleStore，由 patched lookup 返回
  betterLocaleStore.register('common', { ja: commonJa, ko: commonKo, ... })
  betterLocaleStore.register('settings', { ja: settingsJa, ... })
  // ... 各 dsh 内置 ns
})
```

需要覆盖的命名空间清单（启动时枚举 dsh 各 client 包注册的 ns，或维护一份硬编码清单 + 测试守护）：

- `common`（`@deepseek-ai/dsh-client-locale` 自带）
- `settings.locale`、`settings.general`、`settings.plugins`、...
- 各 ui-* 包自有的 ns

**初版策略**：手动维护 common + settings.* 翻译，其他 ns 未覆盖时 fallback 到原 en（用户看到的混合：核心 UI 翻译了，部分子页面仍 en）。后续按需扩展。

## 持久化

- 写入 `pluginSettings`（dsh 设置文档的开放 map，better-sidebar 已用此机制存 `pluginSettings[<descriptor id>]`）。
- 不写 `locale.preference`（绕开 schema 枚举）。
- 浏览器语言检测不变（dsh 原行为：detectBrowserLocale 仍只识别 zh/en，其他语言走 fallback en）。

## 已知风险

| 风险 | 缓解 |
|---|---|
| dsh 重构 LocaleRuntime（方法重命名/改用 ES `#private`）→ patch 失效 | peer dep 钉死版本范围；启动时探测 `LocaleRuntime.prototype.lookup` 是否可读，失败时 console.error + 降级（不 patch，仅暴露服务供未来兼容） |
| `publish` 是 private，TS 类型层面调用报错 | 用 `(ctx.locale as any)` 绕过；封装 `bumpRevision(ctx)` 助手函数集中处理 |
| 上游 dsh 改 LanguageRow / settings slot 注册路径 | better-locale 不动这些路径，只读 active；上游变化不直接影响 |
| `locale/change` 事件触发频次过高 | `setActive` 内部去重：active 未变不调 publish |
| 第三方插件注册的 ns 名冲突 | `register` 同 better-sidebar 的同款契约：duplicate (ns, locale) 抛错 |
| common 命名空间翻译不全 | 缺失 key 自动 fallback 到原 en（patched lookup 仅在 override 存在时返回）；用户看到混合语言是已知 limitation |
| 与未来 dsh 上游 i18n 扩展冲突 | 若 dsh 上游开放了新语言注册 API，本插件废弃，迁移到上游 API |

## 兼容性

- peer dep: `@deepseek-ai/dsh-client-locale: ^0.1.0-rc.x`（具体版本上线时定）
- 可选 peer: `dsh-better-sidebar: ^x.y.z`（用于方案 A 的 tab 注册；未安装时无 UI 入口但服务可用）
- 浏览器：现代浏览器（与 dsh 一致）

## 验收

- `pnpm typecheck` / `pnpm test` / `pnpm build` 全绿
- 单元测试覆盖：
  - `BetterLocaleService.register` / `setActive` / `getOverride` 行为
  - patched `lookup` 在覆盖存在/缺失时的回退
  - `bumpRevision` 触发 renderer 重渲染（mock LocaleRuntime）
  - duplicate (ns, locale) 抛错
- 集成测试（vitest + jsdom）：
  - 安装 better-locale + mock dsh LocaleRuntime → 选 ja → 所有 translate 调用返回 ja 文本
  - 选 ja 后某 ns 缺 ja 翻译 → 该 ns 回退到 en
  - 切换 active → `locale/change` 事件触发一次
- 手动 e2e：
  - `dsh plugin --profile web add link:...` 安装
  - 重启 dsh web，better-sidebar 「语言」tab 出现
  - 选「日本語」→ 全部 better-sidebar 文案切换为日语（better-sidebar 自带 ja 词典的前提）
  - 选「关闭覆盖」→ 回到 dsh 原生 zh/en 行为
  - 刷新页面 → 选择持久化

## 实施分期

1. **MVP**：项目骨架 + `BetterLocaleService` + `LocaleRuntime` patch + better-sidebar tab 入口 + common ns 的 ja 翻译样例。
2. **扩展**：补 settings.* 等核心 ns 翻译；接入第三方插件协作 API 测试样例。
3. **稳定**：启动时探测 + 降级路径；上游 dsh 版本兼容性矩阵；README 文档。
