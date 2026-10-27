# better-locale vNext：本体语言包定位收窄 + 跟版引擎

> 2026-08-28 · 设计已批准（drift 检测 + 文档强化 + scope 锁测试全量；繁中 fallback 顺手改 zh；drift 机制选型 typecheck 断言 + 清单扫描）

## 背景与动机

v0.1.2-alpha.1 适配后，插件已是 DSH 原生语言包 API（`locale.addLanguage` + `locale.register(ns, locale, dict)`）之上的纯语言包：19 种语言 × 30 命名空间 / 736 key，当前 100% 覆盖。

两个遗留问题：

1. **覆盖是快照不是过程**。上游每个版本都在新增/改名命名空间与 key（`LocaleNamespaceMap` merge 遍布 26+ 个包）。目前没有任何机制暴露缺口——新版本上线后用户直接看到英文回退，发现滞后且靠肉眼。
2. **边界靠自觉**。理论上可以往插件词典里塞第三方插件命名空间的翻译，与该插件未来自己注册的 `(ns, locale)` 槽位撞车（上游 single-occupant，后注册者 throw，加载失败）。

本期把定位收窄并锁死：**better-locale 只做 DSH 本体内置命名空间的翻译提供**，第三方插件命名空间归插件自己（原生 API + 迁移文档），未迁移插件零报错；同时建立跟版引擎，让"在新版本发挥价值"成为可维护的流程。

## 设计目标 / 非目标

**目标**

1. 插件词典 ns 集合被 typecheck **双向锁死**在上游本体 `LocaleNamespaceMap` 集合内（缺 = 漏翻译，溢 = 插足别人，均 compile error）。
2. 上游新增 ns / key 后，插件侧 `pnpm typecheck` 一红即知缺口（含 key 级精度）。
3. 第三方插件迁移文档：如何用原生 API 注册自己 ns 的第三语言词典；明确"未迁移零报错"的承诺与边界。
4. 共存测试证明：未迁移 / 已迁移 / 越权注册三个场景的行为。
5. zh-HK / zh-TW / zh-MO 的 fallback 链从 `en` 改为 `zh`（上游仅要求链终点是 `en`，`zh-TW → zh → en` 合法）。

**非目标**

- 不为第三方插件的 ns 提供翻译（明确拒绝，机制锁定）。
- 不把词典上游化推进 dsh 本体。
- 不引入运行时检测、CLI 报告工具（纯 typecheck + 脚本层）。
- 不改 apply 流程与注册结构（纯数据层、类型层、文档层改造）。

## 决策记录（用户拍板）

| 决策点 | 结论 |
|---|---|
| 本期范围 | 全量：drift 检测 + 文档强化 + scope 锁定测试 |
| 繁中 fallback | 顺手改为 `zh` |
| drift 机制 | typecheck 断言 + merge 清单扫描脚本（否决 compiler API 解析器与运行时探测） |

## 设计

### A. 定位与边界

- better-locale = **DSH 本体内置命名空间的 19 语言语言包**，唯一职责。词典 ns 集合被 typecheck 双向锁死（见 B/C），任何人往里塞第三方 ns 翻译直接编译失败——"不插足别人"由机制保证。
- 第三方插件自己负责自己 ns 的第三语言词典（原生 `ctx.locale` API），迁移文档指导（见 E）。
- **未迁移插件零报错的机制论证**：未迁移插件只注册自己 ns 的 `(ns, 'zh'/'en')`（typed form），与 better-locale 注册的 `(本体 ns, 19 种第三语言)` **无任何槽位交集**；用户选 ja 时其 ns 走原生 fallback 链命中英文，无 throw。唯一报错场景是第三方插件去注册**本体 ns** 的第三语言（single-occupant 撞车，后注册者 throw）——文档明令禁止，且加共存测试验证（见 C）。

### B. drift 检测（typecheck 断言 + 清单扫描）

#### B1. 词典类型化

19 个 `src/client/dictionaries/<lang>.ts` 头部去宽化注解：

```ts
// 旧
export const dicts: Record<string, Record<string, string>> = { ... }
// 新
export const dicts = { ... } satisfies Record<string, Record<string, string>>
```

- key 字面量类型保留（`keyof typeof dicts` 精确到每个 ns 的 key 全集），mutable 不变，上游 `register` 签名兼容。
- `languages.ts` 的 `BundledLanguage.dicts: Record<...>` 宽化注解**不动**（断言文件直连 dictionaries，不走 BUNDLED_LANGUAGES 聚合——数组元素类型 union 会把 keyof 收窄成交集，不能用）。
- gen 脚本（`generate-translation-md.mjs`）按行级正则解析 ns/key 条目，`satisfies` 尾缀不影响；Phase 1 后立即重跑 gen 验证 diff 为空。

#### B2. 断言文件 `src/client/upstream-coverage.ts`

- **不被任何 entry import** → 不进 bundle（tsdown 只打包 entry 可达图）；仅被 `tsc --noEmit` 检查（tsconfig `include: ["src"]`）。
- type-only import 全部本体 merge 模块（26 个非 experimental merge 点；merge 不都在 `/client` 入口——`ui-conversation` 在 `client/apply`、`ui-message-feedback` / `ui-reference` / `ui-trajectory` / `extensions/ui-cordis` 在 `client/locales`、`ui-approval` / `ui-chat` 在 `client/contract/slots`——按实际文件 import）。
- 聚合 + 四向断言草案：

```ts
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client/apply'
// ...全部 merge 模块
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'
import { dicts as ja } from './dictionaries/ja.ts'
// ...19 个

type UpstreamNS = keyof LocaleNamespaceMap & string
type UpstreamKeys<N extends UpstreamNS> = LocaleNamespaceMap[N] & string

/** 聚合保留每语言精确 dict 类型 */
const ALL = { ja, de, fr, /* ... */ } as const

type AssertDicts<D> =
  | Exclude<UpstreamNS, keyof D & string>                                  // missing ns
  | Exclude<keyof D & string, UpstreamNS>                                  // extra ns
  | { [K in UpstreamNS]: K extends keyof D
      ? Exclude<UpstreamKeys<K>, keyof D[K] & string> : never }[UpstreamNS]  // missing keys
  | { [K in UpstreamNS]: K extends keyof D
      ? Exclude<keyof D[K] & string, UpstreamKeys<K>> : never }[UpstreamNS]  // extra keys

type Violation = AssertDicts<(typeof ALL)[keyof typeof ALL & keyof typeof ALL]>

// 违例时 Violation 非 never → 赋值报错，错误消息列出缺失/溢出项
const assertCoverage: [Violation] extends [never] ? true : { error: Violation } = true
```

- 断言语义与上游 `LocaleDictOf<N> = Record<LocaleNamespaceMap[N] & string, string>` 对齐（不含 `CommonKeyOf` 并集——common 借用是 translate 层行为，不进词典形状）。

#### B3. tsconfig paths

逐包补 `paths`（指向 `C:/Users/Administrator/.dsh/source/current/packages/<group>/<pkg>/lib/types/...`），tsc module-not-found 报错驱动补齐；merge 在子路径的包按子路径映射。

#### B4. 扫描脚本 `scripts/check-upstream-merges.mjs`

- 扫 `source/current/packages/*/*/src/client/**/*.ts`，匹配行首 `interface LocaleNamespaceMap {` 且后续有缩进成员（排除 experimental 组、字符串内的签名文本——后者行首是 `declaration:` 天然不匹配）。
- 提取 merge 文件清单 → 包名/子路径 → 与断言文件 import 清单 diff；不同步即非零退出，错误信息指明加/删哪行 import（防"上游新包加了 merge 但插件没 import"导致检测静默失效）。

#### B5. 命令集成

`package.json` 的 `typecheck` 改为 `tsc --noEmit && node scripts/check-upstream-merges.mjs`。

**工作流**：上游升级 SOP（pull + install + build `source/current`）→ 插件 `pnpm typecheck` → 红即缺口（缺 ns / 缺 key），补翻译至绿。

### C. scope 锁定 + 共存测试

- 锁定即 B2 的四向断言（插件词典出现非本体 ns / key → 编译失败）。
- `tests/apply.spec.ts` 新增三用例（复用 FakeCtx / FakeLocaleRuntime）：
  1. **未迁移插件**：apply better-locale 后，模拟第三方只 `register(自己ns, { zh, en })` → 无 throw；active 'ja' 下 `t(自己ns, key)` 返回英文（fallback 链命中）。
  2. **已迁移插件**：第三方 `register(自己ns, 'ja', dict)` → 无 throw，返回其词典值。
  3. **越权注册**：第三方试图 `register('common', 'ja', ...)` → throw（上游 single-occupant；文档规则的机制验证）。

### D. 繁中 fallback

- `src/client/languages.ts`：`BundledLanguage['fallback']` 类型 `'en'` → `'en' | 'zh'`；zh-HK / zh-TW / zh-MO 三条目 `fallback: 'zh'`。
- `tests/languages.spec.ts` 断言同步（zh* → zh，其余 → en）。
- 行为影响：当前 100% 覆盖下零可见变化；未来出现缺口时繁中用户看到简中而非英文（链 `zh-TW → zh → en`）。

### E. 文档

- **`docs/developer-guide/README.md` + `README.zh-CN.md`（迁移指南）强化**：
  - 开头加定位/边界块：better-locale 只管本体 ns；你的插件 ns 归你；两者互不干涉。
  - 新增「未迁移插件的行为」节：零配置零报错，自己的 ns 在 19 语言下自动 fallback en；Language 行、`locale.preference`、`<html lang>` 全部原生。
  - 强化所有权规则：一个 `(ns, locale)` 一个 owner；只注册自己拥有的 ns；本体 ns 的第三语言槽位已被 better-locale 占用，后注册者 throw（Troubleshooting 已有条目展开）。
  - 保留既有内容：peer 声明、词典准备、apply 注册、addLanguage 自加语言、单测模板、手动验证。
- **主 `README.md` + `README.zh-CN.md`**：定位改写（本体语言包 + 跟版引擎）；「覆盖范围」明确仅本体 ns，第三方指引到 developer-guide；「已知限制」更新（繁中条目改为新行为，新增跟版工作流说明）。
- **插件 `AGENTS.md`**：文件职责表加 `upstream-coverage.ts` 与 `check-upstream-merges.mjs`，命令节加 typecheck 新语义。

## 实现步骤

| # | 步骤 | 产出 |
|---|---|---|
| 1 | 19 个词典文件去注解改 `satisfies`；跑 `gen:translations` 验证 diff 为空 | B1 |
| 2 | 新建 `src/client/upstream-coverage.ts`（imports + 四向断言）；按 tsc 报错补 paths 至绿 | B2/B3 |
| 3 | 新建 `scripts/check-upstream-merges.mjs`；typecheck script 接入 | B4/B5 |
| 4 | `languages.ts` fallback 放宽 + 三条目改 `'zh'`；`tests/languages.spec.ts` 同步 | D |
| 5 | `tests/apply.spec.ts` 三用例（未迁移 / 已迁移 / 越权） | C |
| 6 | developer-guide 双语强化；主 README 双语更新；AGENTS.md 更新 | E |
| 7 | `pnpm typecheck && pnpm test && pnpm run build`；`gen:translations` 重生成 | 验证 |
| 8 | minor bump → 按 SOP 提交发布（GitHub + npm + profile update） | 发布 |

## 验证

```sh
pnpm typecheck     # 四向断言 + merge 清单扫描（故意删一个 key / 加一个假 ns 应红）
pnpm test          # languages + apply（含三共存用例）
pnpm run build     # 三产物不变形状（断言文件不进 bundle，diff lib/client.js 应无实质变化）
node scripts/generate-translation-md.mjs && git diff --exit-code TRANSLATION.md
```

## 风险与已知边界

| 风险 | 缓解 |
|---|---|
| merge 模块 import 路径发现成本（入口不一定 re-export merge 文件） | 扫描脚本输出 merge 文件路径；实现时逐个确认，入口不达则 import 子路径 + paths 映射 |
| `source/current` 未 build 时 lib/types 缺失 → typecheck 假红 | 前置依赖上游升级 SOP（pull + install + build）；README 工作流注明 |
| type 断言错误消息可读性 | 用 `{ error: Violation }` 模式让 tsc 错误直接展开缺失项 union |
| 上游未来把 merge 挪位置 / 改写法 | 扫描脚本 diff 失败即提示更新 import；这正是检测器要捕获的变化 |
| 断言文件被误 import 进 entry → 词典进 bundle | code review + build 产物 diff 检查（lib/client.js 大小应基本不变） |
| gen 正则与 `satisfies` 尾缀 | 步骤 1 后立即 gen 验证 diff 为空 |
