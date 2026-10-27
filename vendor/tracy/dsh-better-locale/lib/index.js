//#region src/index.ts
const name = "dsh-plugin-better-locale";
const inject = [];
/**
* Host apply — no-op. The language-pack layer is a pure client-side
* contribution; no host-side resources are used.
* @param _ctx - host context (unused).
*/
function apply(_ctx) {}

//#endregion
export { apply, inject, name };