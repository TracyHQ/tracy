// dsh-passwords 的 dsh 插件入口（cordis 插件：name/inject/apply）。
// dsh 通过 cordis.yml 里的 insert 条目按包名加载本包时，解析的就是这个入口。
// 网关进程本体在 src/cli.ts（bin 入口），两者互不干扰。
export { name, inject, apply } from './plugin.js';
