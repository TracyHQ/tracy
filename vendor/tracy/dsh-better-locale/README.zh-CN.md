<p align="center">
  <a href="https://dshfind.com/zh/plugins/huanlinoto/dsh-plugin-better-locale"><img src="https://dshfind.com/api/card/huanlinoto/dsh-plugin-better-locale?lang=zh" alt="dsh-plugin-better-locale card"></a>
</p>

# dsh-plugin-better-locale

**中文** | [English](README.md)

DSH web 插件：为 DSH 本体内置 UI 命名空间内置 19 种第三语言字典（日语 / 韩语 / 法语 / 德语 / ...），并附带让词典**跟版上游发布**的编译期 drift 引擎。通过 DSH v0.1.2-alpha.1 的原生第三方语言 API（`locale.addLanguage` + `locale.register(ns, locale, dict)`）注册，语言直接出现在 DSH 设置页原生 Language 行中；未覆盖文案按 DSH 的 key 级 fallback 链回退。

| | |
|---|---|
| **包名** | `@huanlin/dsh-plugin-better-locale` |
| **仓库** | `huanlinoto/dsh-plugin-better-locale` |
| **要求** | DSH `dsh-v0.1.2-alpha.1` 及以上 |
| **License** | AGPL-3.0 |

## 支持的语言

| 语言 | id | 显示名 |
|---|---|---|
| 日语 | `ja` | 日本語 |
| 韩语 | `ko` | 한국어 |
| 法语 | `fr` | Français |
| 德语 | `de` | Deutsch |
| 葡萄牙语 | `pt` | Português |
| 阿拉伯语 | `ar` | العربية |
| 印地语 | `hi` | हिन्दी |
| 印尼语 | `id` | Bahasa Indonesia |
| 土耳其语 | `tr` | Türkçe |
| 越南语 | `vi` | Tiếng Việt |
| 泰语 | `th` | ไทย |
| 俄语 | `ru` | Русский |
| 意大利语 | `it` | Italiano |
| 荷兰语 | `nl` | Nederlands |
| 瑞典语 | `sv` | Svenska |
| 波兰语 | `pl` | Polski |
| 繁体中文（香港） | `zh-HK` | 繁體中文（香港） |
| 繁体中文（台湾） | `zh-TW` | 繁體中文（台灣） |
| 繁体中文（澳门） | `zh-MO` | 繁體中文（澳門） |

## 安装

```sh
# npm registry
dsh plugin --profile web add "@huanlin/dsh-plugin-better-locale"

# 或 github 引用
dsh plugin --profile web add "github:huanlinoto/dsh-plugin-better-locale"
```

安装后重启 `dsh web`，浏览器硬刷新（`Ctrl+Shift+R`）。

## 使用

打开 **设置 → General → Language**：19 种语言与 DSH 内置的中文 / English 并列。点选任意语言，整个界面立即切换——选择持久化在 DSH 的 `locale.preference` 设置里（同一 DSH home 下跨浏览器 / 跨设备共享），`<html lang>` 同步更新。

未覆盖的命名空间 / key 通过 DSH 的 key 级 fallback 链回退（所选语言 → 声明的 fallback → `en`；繁中三变体声明的是 `zh`，缺口显示简体而非英文）。翻译对照表见 `TRANSLATION.md`（`pnpm run gen:translations` 重新生成）。

## 覆盖范围与边界

- **只做 DSH 本体**：词典翻译的是 DSH 内置命名空间（`common` / `settings.locale` / `command` / 等——合并进 DSH `LocaleNamespaceMap` 的全部条目，当前 27 命名空间 / 893 key × 19 语言）。范围被**编译期机器锁死**：`pnpm typecheck` 在词典缺失上游命名空间 / key（跟版缺口）或出现上游不存在的条目（越界插足）时直接失败。
- **跟版引擎**：升级 DSH checkout 后跑 `pnpm typecheck`——红即上游新增 / 改名了文案，补翻译至绿。同一命令里的 `scripts/check-upstream-merges.mjs` 会在上游出现新的 merge 模块而断言文件未引入时失败，新命名空间不会被静默漏掉。
- **第三方插件不在此列（设计如此）**：插件自己的命名空间归插件作者。未迁移插件零报错共存（其文案回退英文）；迁移只需几行原生 API——见[开发者指南](docs/developer-guide/README.zh-CN.md)。

## 从 0.1.x 迁移（v0.1.2-alpha.1 适配）

0.1.x 通过 monkey-patch `LocaleRuntime.prototype.lookup`、借用 DSH 英文槽位的方式注入第三语言（自定义设置行 + localStorage 持久化 + 仅英文时生效）。DSH v0.1.2-alpha.1 将这些全部原生化了，插件随之移除了该 hack：

- 自定义的「语言覆盖」设置行已移除——直接用 DSH 原生 Language 行；
- 持久化从浏览器 localStorage 改为 DSH 的 `locale.preference` 设置；
- 任意 DSH 语言下覆盖都生效（不再需要「先切到 English」）；
- `ctx.betterLocale` 服务已移除——插件词典直接通过 `ctx.locale` 注册。

## 已知限制

- **覆盖是一个过程而非承诺**：词典在本插件每次发布时与上游 merge 表精确对齐（当前 27 命名空间 / 893 key × 19 语言）；DSH 升级后到 better-locale 更新前，新增上游文案沿 fallback 链回退。仓库内跑 `pnpm typecheck` 可见全部缺口。
- **繁体中文变体回退简体中文**：`zh-HK` / `zh-TW` / `zh-MO` 声明的 fallback 是 `zh`——缺失 key 显示简体字典（链 `zh-TW` → `zh` → `en`），而非英文。
- **不翻译第三方插件文案**：那些命名空间归各插件（见开发者指南）；未迁移插件在第三语言激活时显示英文。
- **仅 web 平台**：client bundle 为浏览器设计，不在 node 端运行。

## License

AGPL-3.0
