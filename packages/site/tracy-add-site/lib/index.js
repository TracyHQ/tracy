// src/host/operation-signal.ts
import { mkdir as mkdir2, readdir, readFile as readFile2, unlink as unlink2 } from "node:fs/promises";
import path2 from "node:path";

// src/host/json-book.mjs
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
var chains = /* @__PURE__ */ new Map();
function serialised(file, task) {
  const previous = chains.get(file) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => void 0);
  chains.set(file, settled);
  void settled.then(() => {
    if (chains.get(file) === settled) chains.delete(file);
  });
  return run;
}
async function writeAtomic(file, text2, mode) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temp, text2, mode === void 0 ? "utf8" : { encoding: "utf8", mode });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => void 0);
    throw error;
  }
}
async function readBook(file) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return (
      /** @type {Book} */
      typeof parsed === "object" && parsed !== null ? parsed : {}
    );
  } catch {
    return (
      /** @type {Book} */
      {}
    );
  }
}
function updateBook(file, change) {
  return serialised(file, async () => {
    const book = await readBook(file);
    if (await change(book) === false) return;
    await writeAtomic(file, JSON.stringify(book, null, 2));
  });
}

// src/host/operation-signal.ts
var directory = () => path2.join(process.env.DSH_HOME ?? process.cwd(), "tracy-add-site", "operation-results");
var draining = null;
async function reportImportResult(notice) {
  try {
    const dir = directory();
    await mkdir2(dir, { recursive: true, mode: 448 });
    const file = path2.join(dir, `${notice.result.run_id}.json`);
    await writeAtomic(file, JSON.stringify(notice), 384);
    await flushImportResults();
  } catch {
    console.warn("[tracy-add-site] could not queue import operation result");
  }
}
function flushImportResults(fetchImpl = fetch) {
  if (draining) return draining;
  draining = (async () => {
    const dir = directory();
    const files = await readdir(dir).catch(() => []);
    for (const name2 of files.filter((f) => /^(?:[a-f0-9-]{36}|[a-z0-9]{10,32})\.json$/.test(f))) {
      const file = path2.join(dir, name2);
      try {
        const notice = JSON.parse(await readFile2(file, "utf8"));
        const url = new URL(`/api/sites/${encodeURIComponent(notice.siteKey)}/import-result`, notice.origin);
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: notice.cookie },
          body: JSON.stringify(notice.result),
          signal: AbortSignal.timeout(5e3),
          redirect: "error"
        });
        if (response.ok) await unlink2(file);
      } catch {
        console.warn("[tracy-add-site] import operation result will be retried");
      }
    }
  })().finally(() => {
    draining = null;
  });
  return draining;
}

// src/host/index.ts
import { readFileSync } from "node:fs";

// src/host/error-code.mjs
var MAX_DEPTH = 4;
function failureCode(error, accept) {
  const queue = [{ value: error, depth: 0 }];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || !next.value || typeof next.value !== "object" || next.depth >= MAX_DEPTH) continue;
    const { code, errors, cause } = (
      /** @type {{ code?: unknown, errors?: unknown, cause?: unknown }} */
      next.value
    );
    if (typeof code === "string" && accept(code)) return code;
    if (Array.isArray(errors))
      for (const member of errors) queue.push({ value: member, depth: next.depth + 1 });
    queue.push({ value: cause, depth: next.depth + 1 });
  }
  return void 0;
}

// src/host/diagnostic.mjs
var DIAGNOSTIC_ACTIONS = /* @__PURE__ */ new Set([
  "info",
  "site.fingerprint",
  "db.tables",
  "db.dump",
  "db.dump_many",
  "files.pack"
]);
var DIAGNOSTIC_ENGINE_ERRORS = /* @__PURE__ */ new Set([
  "bad_action",
  "bad_params",
  "dump_failed",
  "fatal",
  "list_failed",
  "pack_failed",
  "read_failed",
  "too_large",
  "unauthorized",
  "unavailable",
  "unsupported",
  "upload_failed",
  "walk_failed",
  "other"
]);
function usernameIsEmail(username) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((username ?? "").trim());
}
var DIAGNOSTIC_PATHS = /* @__PURE__ */ new Set([
  "/",
  "/index.php",
  "/administrator",
  "/administrator/",
  "/administrator/index.php",
  "/api/index.php",
  "/wp-admin/update.php"
]);
var DIAGNOSTIC_ERRORS = /* @__PURE__ */ new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "EPROTO",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
  "AbortError",
  "TimeoutError",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE",
  "ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION",
  "ERR_SSL_UNSUPPORTED_PROTOCOL",
  "untrusted_redirect",
  "too_many_redirects",
  "other"
]);
function diagnosticPath(url, base = "") {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return void 0;
  }
  let prefix = base;
  try {
    prefix = new URL(base).pathname;
  } catch {
  }
  prefix = prefix.replace(/\/+$/, "");
  if (prefix && pathname.startsWith(`${prefix}/`)) pathname = pathname.slice(prefix.length);
  return DIAGNOSTIC_PATHS.has(pathname) ? pathname : void 0;
}
function diagnosticError(error) {
  const code = failureCode(error, (candidate) => DIAGNOSTIC_ERRORS.has(candidate));
  if (code) return code;
  const message = error instanceof Error ? error.message : "";
  if (message === "untrusted redirect target") return "untrusted_redirect";
  if (message === "too many redirects") return "too_many_redirects";
  const name2 = error instanceof Error ? error.name : "";
  return DIAGNOSTIC_ERRORS.has(name2) ? name2 : "other";
}

// src/host/firewall.mjs
var USER_AGENT = "Tracy/1.0 (+https://tracy.ai)";
var BODY_MARKERS = [
  ["cloudflare", /<title>\s*Just a moment\.\.\.|\/cdn-cgi\/challenge-platform\/|_cf_chl_opt/i],
  ["sucuri", /Sucuri WebSite Firewall|sucuri\.net\/privacy-policy|Access Denied - Sucuri/i],
  [
    "wordfence",
    /Generated by Wordfence|Your access to this site has been limited by the site owner|wordfence\.com\/help\/\?query=locked-out/i
  ],
  ["imunify360", /Imunify360|imunify360-webshield/i],
  ["modsecurity", /Mod_?Security|This error was generated by Mod_Security/i]
];
var CLOUDFLARE_BLOCK = /<title>\s*Attention Required! \| Cloudflare|Sorry, you have been blocked|cf-error-details/i;
function firewallOf(status, headers, body, options = {}) {
  if (headers.get("cf-mitigated")) return "cloudflare";
  if (headers.get("x-sucuri-block")) return "sucuri";
  if (status < 400) return null;
  const text2 = body.slice(0, 64 * 1024);
  for (const [name2, marker] of BODY_MARKERS) if (marker.test(text2)) return name2;
  if ((status === 403 || status === 429) && CLOUDFLARE_BLOCK.test(text2)) return "cloudflare";
  if (options.generic && (status === 403 || status === 406) && !looksLikeJson(text2)) return "firewall";
  return null;
}
function looksLikeJson(text2) {
  try {
    JSON.parse(text2);
    return true;
  } catch {
    return false;
  }
}
var CLOUDFLARE_ORIGIN_DOWN = /* @__PURE__ */ new Set([521, 522, 523, 530]);
var CLOUDFLARE_ERROR_PAGE = /id="cf-error-details"|id="cf-wrapper"/i;
function gatewayOf(status, headers, body) {
  if (CLOUDFLARE_ORIGIN_DOWN.has(status)) return "cloudflare";
  if (status !== 502 && status !== 504) return null;
  const edge = /^cloudflare$/i.test((headers.get("server") ?? "").trim());
  return edge && CLOUDFLARE_ERROR_PAGE.test(body.slice(0, 64 * 1024)) ? "cloudflare" : null;
}

// src/host/joomla.ts
import { createHash as createHash2 } from "node:crypto";

// src/host/slim-package.ts
import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
var COMPONENT = "packages/com_claudecowork.zip";
var CONTRACTS = "administrator/lib/contracts/";
var INDEX = "administrator/lib/contracts.json";
var SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function safeContractId(id) {
  const parts = id.split("/");
  return parts.length === 3 && parts.every((p) => SAFE_NAME.test(p) && !p.includes("..")) && /^j\d+$/.test(parts[1]);
}
function safeAssetName(name2) {
  return SAFE_NAME.test(name2) && !name2.includes("..") && name2.endsWith(".zip");
}
function readZip(zip) {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 101010256) {
      end = i;
      break;
    }
  }
  if (end < 0) return void 0;
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  if (count === 65535 || at === 4294967295) return void 0;
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 33639248) return void 0;
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const compressedSize = zip.readUInt32LE(at + 20);
    if (zip.readUInt32LE(local) !== 67324752) return void 0;
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    entries.push({
      name: zip.subarray(at + 46, at + 46 + nameLength),
      method,
      flags: flags & ~8,
      // sizes are written in the local header below: no data descriptor
      time: zip.readUInt16LE(at + 12),
      date: zip.readUInt16LE(at + 14),
      crc: zip.readUInt32LE(at + 16),
      compressed: zip.subarray(dataAt, dataAt + compressedSize),
      size: zip.readUInt32LE(at + 24),
      external: zip.readUInt32LE(at + 38),
      versionMadeBy: zip.readUInt16LE(at + 4)
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(67324752, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(e.flags, 6);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt16LE(e.time, 10);
    local.writeUInt16LE(e.date, 12);
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.compressed.length, 18);
    local.writeUInt32LE(e.size, 22);
    local.writeUInt16LE(e.name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(33639248, 0);
    central.writeUInt16LE(e.versionMadeBy, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(e.flags, 8);
    central.writeUInt16LE(e.method, 10);
    central.writeUInt16LE(e.time, 12);
    central.writeUInt16LE(e.date, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.compressed.length, 20);
    central.writeUInt32LE(e.size, 24);
    central.writeUInt16LE(e.name.length, 28);
    central.writeUInt32LE(e.external, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, e.name, e.compressed);
    centrals.push(central, e.name);
    offset += 30 + e.name.length + e.compressed.length;
  }
  const directory3 = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(101010256, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory3.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory3, end]);
}
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let c = 4294967295;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function contentOf(e) {
  if (e.method === 0) return e.compressed;
  if (e.method === 8) return inflateRawSync(e.compressed);
  return void 0;
}
function jsonOf(e) {
  try {
    return e ? JSON.parse(contentOf(e)?.toString("utf8") ?? "") : void 0;
  } catch {
    return void 0;
  }
}
function componentOf(pkg) {
  const outer = readZip(Buffer.from(pkg));
  const component = outer?.find((e) => e.name.toString("utf8") === COMPONENT);
  if (!outer || !component) return void 0;
  const componentBytes = contentOf(component);
  const inner = componentBytes && readZip(componentBytes);
  return inner ? { outer, component, inner } : void 0;
}
function contractIndex(pkg) {
  const inner = componentOf(pkg)?.inner;
  const index = inner?.find((e) => e.name.toString("utf8") === INDEX);
  if (!index) return void 0;
  const contracts = jsonOf(index)?.contracts;
  const out = /* @__PURE__ */ new Map();
  if (!contracts || typeof contracts !== "object") return out;
  for (const [id, row] of Object.entries(contracts)) {
    if (!safeContractId(id) || !row || typeof row !== "object") continue;
    const { asset, sha256, bytes, template, names } = row;
    if (typeof asset !== "string" || !safeAssetName(asset)) continue;
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(sha256)) continue;
    if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes <= 0) continue;
    out.set(id, {
      asset,
      sha256: sha256.toLowerCase(),
      bytes,
      ...typeof template === "string" ? { template } : {},
      ...typeof names === "string" && names !== id && safeContractId(names) ? { names } : {}
    });
  }
  return out;
}
function indexedCandidates(pkg, templates) {
  const index = contractIndex(pkg);
  if (!index || templates.size === 0) return [];
  const carried = carriedIds(pkg);
  return [...index].filter(([id, row]) => !carried.has(id) && templates.has(String(row.template ?? "").toLowerCase())).map(([id]) => id);
}
function carriedIds(pkg) {
  const ids = /* @__PURE__ */ new Set();
  for (const e of componentOf(pkg)?.inner ?? []) {
    const name2 = e.name.toString("utf8");
    if (!name2.startsWith(CONTRACTS)) continue;
    const id = name2.slice(CONTRACTS.length).split("/").slice(0, 3);
    if (id.length === 3 && id[2] !== "") ids.add(id.join("/"));
  }
  return ids;
}
function verifiedAsset(bytes, row) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length !== row.bytes) return void 0;
  if (createHash("sha256").update(buffer).digest("hex") !== row.sha256) return void 0;
  const entries = readZip(buffer);
  if (!entries?.every((e) => SAFE_NAME.test(e.name.toString("utf8")) && !e.name.toString("utf8").includes("..")))
    return void 0;
  if (!entries.some((e) => e.name.toString("utf8") === "manifest.json")) return void 0;
  return { entries };
}
async function fetchContractAssets(pkg, ids, fetchAsset) {
  const index = contractIndex(pkg);
  const out = /* @__PURE__ */ new Map();
  if (!index) return out;
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const row = index.get(id);
      if (!row) return;
      try {
        const bytes = await fetchAsset(row.asset);
        const asset = bytes && verifiedAsset(bytes, row);
        if (asset) out.set(id, asset);
      } catch {
      }
    })
  );
  return out;
}
function contractCandidates(pkg, templates, assets = /* @__PURE__ */ new Map()) {
  const inner = componentOf(pkg)?.inner;
  if (!inner || templates.size === 0) return [];
  const byName = new Map(inner.map((e) => [e.name.toString("utf8"), e]));
  for (const [id, asset] of assets)
    for (const e of asset.entries) {
      const name2 = `${CONTRACTS}${id}/${e.name.toString("utf8")}`;
      if (!byName.has(name2)) byName.set(name2, e);
    }
  const out = [];
  for (const name2 of byName.keys()) {
    const id = name2.startsWith(CONTRACTS) && name2.endsWith("/manifest.json") ? name2.slice(CONTRACTS.length, -14) : "";
    if (id.split("/").length !== 3) continue;
    const manifest = jsonOf(byName.get(name2));
    const template = manifest?.template;
    if (typeof template !== "string" || !templates.has(template.toLowerCase())) continue;
    const lock = jsonOf(byName.get(`${CONTRACTS}${id}/presentation-lock.json`));
    const files = lock?.files && typeof lock.files === "object" ? lock.files : {};
    const names = manifest?.quickstart?.contract;
    out.push({ id, files, ...typeof names === "string" && names !== id ? { names } : {} });
  }
  return out;
}
var PUBLIC_FILE = /^(templates|media)\/[^?#]+\.(css|js|xml|svg)$/;
function probePaths(candidates, max = 8) {
  if (candidates.length < 2) return [];
  const paths = new Set(candidates.flatMap((c) => Object.keys(c.files)).filter((p) => PUBLIC_FILE.test(p)));
  const spread = (p) => new Set(candidates.map((c) => c.files[p] ?? "")).size;
  return [...paths].map((p) => ({ p, n: spread(p) })).filter(({ n }) => n > 1).sort((a, b) => b.n - a.n || (a.p < b.p ? -1 : 1)).slice(0, max).map(({ p }) => p);
}
function pickContracts(candidates, seen) {
  const all = new Set(candidates.map((c) => c.id));
  if (candidates.length < 2 || seen.size === 0) return withNamed(candidates, all);
  const score = (c) => [...seen].filter(([p, h]) => c.files[p] === h).length;
  const best = Math.max(...candidates.map(score));
  if (best === 0) return withNamed(candidates, all);
  return withNamed(candidates, new Set(candidates.filter((c) => score(c) === best).map((c) => c.id)));
}
function withNamed(candidates, ids) {
  for (const c of candidates) if (ids.has(c.id) && c.names) ids.add(c.names);
  return ids;
}
function packageForImport(pkg, keep = /* @__PURE__ */ new Set(), assets = /* @__PURE__ */ new Map()) {
  const parts = componentOf(pkg);
  if (!parts) return void 0;
  const { outer, component, inner } = parts;
  const keptFolders = [...keep].map((id) => `${CONTRACTS}${id}/`);
  const kept = inner.filter((e) => {
    const name2 = e.name.toString("utf8");
    return !name2.startsWith(CONTRACTS) || keptFolders.some((folder) => name2.startsWith(folder));
  });
  const dropped = inner.length - kept.length;
  const carried = (id) => kept.some((e) => e.name.toString("utf8").startsWith(`${CONTRACTS}${id}/`));
  const inserted = [...keep].filter((id) => !carried(id) && assets.has(id) && safeContractId(id)).sort();
  if (dropped === 0 && inserted.length === 0) return void 0;
  const keptIds = [...keep].filter(carried);
  const added = inserted.flatMap(
    (id) => (assets.get(id)?.entries ?? []).map((e) => ({
      ...e,
      name: Buffer.concat([Buffer.from(`${CONTRACTS}${id}/`, "utf8"), e.name])
    }))
  );
  const slimComponent = writeZip([...kept, ...added]);
  const rewritten = {
    ...component,
    method: 8,
    crc: crc32(slimComponent),
    size: slimComponent.length,
    compressed: deflateRawSync(slimComponent)
  };
  const out = writeZip(outer.map((e) => e === component ? rewritten : e));
  const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
  return {
    bytes,
    from: pkg.byteLength,
    to: out.length,
    dropped,
    kept: [.../* @__PURE__ */ new Set([...keptIds, ...inserted])].sort(),
    inserted
  };
}

// src/host/cookie-jar.ts
var COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
function siteOf(host) {
  return host.toLowerCase().replace(/^\.+/, "").replace(/^www\./, "");
}
function parse(url) {
  try {
    return new URL(url);
  } catch {
    return void 0;
  }
}
function defaultPath(pathname) {
  if (!pathname.startsWith("/")) return "/";
  const last = pathname.lastIndexOf("/");
  return last <= 0 ? "/" : pathname.slice(0, last);
}
function pathMatches(requestPath, cookiePath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}
function expiryOf(maxAge, expires, now) {
  if (maxAge !== void 0) {
    if (!/^-?\d+$/.test(maxAge)) return Number.NEGATIVE_INFINITY;
    const seconds = Number(maxAge);
    return seconds <= 0 ? Number.NEGATIVE_INFINITY : now + seconds * 1e3;
  }
  if (expires !== void 0) {
    const at = Date.parse(expires);
    return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
  }
  return Number.POSITIVE_INFINITY;
}
var CookieJar = class _CookieJar {
  cookies = /* @__PURE__ */ new Map();
  /** A jar holding a plain `cookie` header's pairs, scoped to `url`'s site at path `/`. */
  static fromHeader(header, url) {
    const jar = new _CookieJar();
    const site = siteOf(parse(url)?.hostname ?? "");
    if (!site) return jar;
    for (const pair of header.split(";")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name2 = pair.slice(0, eq).trim();
      if (!COOKIE_NAME.test(name2)) continue;
      jar.put({
        name: name2,
        value: pair.slice(eq + 1).trim(),
        site,
        path: "/",
        secure: false,
        expiresAt: Number.POSITIVE_INFINITY
      });
    }
    return jar;
  }
  /** Take every Set-Cookie of `response`, which answered a request to `url`. */
  absorb(response, url) {
    const from = parse(url);
    if (!from) return;
    const now = Date.now();
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name2 = pair.slice(0, eq).trim();
      if (!COOKIE_NAME.test(name2)) continue;
      let path10;
      let domain;
      let maxAge;
      let expires;
      let secure = false;
      for (const attribute of attributes) {
        const at = attribute.indexOf("=");
        const key = (at < 0 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
        const value = at < 0 ? "" : attribute.slice(at + 1).trim();
        if (key === "path" && value.startsWith("/")) path10 = value;
        else if (key === "domain" && value) domain = value;
        else if (key === "max-age") maxAge = value;
        else if (key === "expires") expires = value;
        else if (key === "secure") secure = true;
      }
      const site = siteOf(from.hostname);
      if (domain !== void 0 && siteOf(domain) !== site) continue;
      const cookie = {
        name: name2,
        value: pair.slice(eq + 1).trim(),
        site,
        path: path10 ?? defaultPath(from.pathname),
        secure,
        expiresAt: expiryOf(maxAge, expires, now)
      };
      if (cookie.expiresAt <= now) this.cookies.delete(keyOf(cookie));
      else this.put(cookie);
    }
  }
  /** The `cookie` header for a request to `url`: `''` for another site, or when nothing applies. */
  header(url) {
    const to = parse(url);
    if (!to) return "";
    const site = siteOf(to.hostname);
    const now = Date.now();
    const sent = [];
    for (const [key, cookie] of this.cookies) {
      if (cookie.expiresAt <= now) {
        this.cookies.delete(key);
        continue;
      }
      if (cookie.site !== site || !pathMatches(to.pathname, cookie.path)) continue;
      if (cookie.secure && to.protocol !== "https:") continue;
      sent.push(cookie);
    }
    sent.sort((a, b) => b.path.length - a.path.length);
    return sent.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }
  put(cookie) {
    const key = keyOf(cookie);
    this.cookies.delete(key);
    this.cookies.set(key, cookie);
  }
};
var keyOf = (cookie) => `${cookie.site}
${cookie.path}
${cookie.name}`;

// src/host/doors.mjs
var QUERY = "option=com_claudecowork&task=api.exec&format=json";
function apiDoors(webRootUrl) {
  const root = webRootUrl.replace(/\/+$/, "");
  return [`${root}/index.php?${QUERY}`, `${root}/administrator/index.php?${QUERY}`];
}
function isEngineAnswer(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof /** @type {{ ok?: unknown }} */
  value.ok === "boolean";
}
function engineReply(text2) {
  const parsed = parseJson(text2);
  if (isEngineAnswer(parsed)) return (
    /** @type {Record<string, unknown>} */
    parsed
  );
  const rest = afterPhpNotices(text2);
  if (rest === null) return null;
  const again2 = parseJson(rest);
  return isEngineAnswer(again2) ? (
    /** @type {Record<string, unknown>} */
    again2
  ) : null;
}
function parseJson(text2) {
  try {
    return JSON.parse(text2);
  } catch {
    return void 0;
  }
}
var PHP_NOTICE_LINE = /^(?:<br\s*\/?>)?\s*(?:PHP\s+)?(?:<b>)?(?:Deprecated|Notice|Warning|Strict Standards|User Deprecated|User Notice|User Warning)(?:<\/b>)?:\s.*\bon line\b/i;
function afterPhpNotices(text2) {
  const lines = String(text2).split(/\r?\n/);
  let k = 0;
  let notices = 0;
  while (k < lines.length) {
    const line = lines[k].trim();
    if (line === "" || /^<br\s*\/?>$/i.test(line)) k += 1;
    else if (PHP_NOTICE_LINE.test(line)) {
      notices += 1;
      k += 1;
    } else break;
  }
  return notices > 0 && k < lines.length ? lines.slice(k).join("\n") : null;
}
function answerKind(text2) {
  const t = String(text2 ?? "").trim();
  if (t === "") return "empty";
  if (/\b(?:Fatal error|Parse error|Uncaught\s+\w+)\b/.test(t)) return "php_fatal";
  if (PHP_NOTICE_LINE.test(
    t.split(/\r?\n/).find((line) => line.trim() !== "" && !/^<br\s*\/?>$/i.test(line.trim())) ?? ""
  ))
    return "php_notice";
  if (t.startsWith("<")) return "html";
  if (parseJson(t) !== void 0) return "json";
  return "text";
}
function isPhpParseFailure(status, text2) {
  return status >= 500 && /\b(?:Parse error|syntax error, unexpected)\b/i.test(text2);
}

// src/host/manifest.ts
var MANIFEST_URL = {
  joomla: "https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/update.json",
  wordpress: "https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/update.json"
};
var RELEASE_PREFIX = "https://github.com/TracyHQ/claude-cowork/releases/download/";
var MANIFEST_TIMEOUT_MS = 15e3;
var ManifestUnavailable = class extends Error {
  constructor(reason) {
    super(`Could not read the Claude Cowork manifest: ${reason}`);
    this.reason = reason;
    this.name = "ManifestUnavailable";
  }
};
function isNewer(a, b) {
  const parts = (version) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const [l, r] = [left[index] ?? 0, right[index] ?? 0];
    if (l !== r) return l > r;
  }
  return false;
}
function needsInstall(installed, latest) {
  if (!installed) return true;
  return isNewer(latest, installed);
}
function versionOf(payload) {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload.version;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
function stringField(payload, field) {
  const value = payload?.[field];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
async function latestExtension(platform, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(MANIFEST_URL[platform], {
      signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS)
    });
  } catch {
    throw new ManifestUnavailable("unreachable");
  }
  if (!response.ok) throw new ManifestUnavailable("unreachable");
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ManifestUnavailable("unreadable");
  }
  const version = versionOf(payload);
  const packageUrl = stringField(payload, "package");
  if (!version || !packageUrl) throw new ManifestUnavailable("no_version");
  if (!packageUrl.startsWith(RELEASE_PREFIX)) throw new ManifestUnavailable("untrusted_url");
  const releaseUrl = stringField(payload, "url");
  const requiresPhp = stringField(payload, "requires_php") ?? void 0;
  return {
    version,
    packageUrl,
    ...requiresPhp ? { requiresPhp } : {},
    // The release page must belong to that repo too — it is what users are shown to press.
    releaseUrl: releaseUrl && releaseUrl.startsWith("https://github.com/TracyHQ/claude-cowork/") ? releaseUrl : null
  };
}

// src/host/site-link.ts
var ENGINE_CALL_GAP_MS = 1e3;
var MAX_RETRY_AFTER_MS = 12e4;
var BAN_AFTER_FAILURES = 3;
var CONNECTION_CODES = /* @__PURE__ */ new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "EHOSTUNREACH",
  "ENETUNREACH"
]);
function connectionFailure(error) {
  return failureCode(error, (code) => CONNECTION_CODES.has(code));
}
function retryAfterMs(value, now = Date.now()) {
  if (!value) return void 0;
  const trimmed = value.trim();
  const ms = /^\d+$/.test(trimmed) ? Number(trimmed) * 1e3 : Date.parse(trimmed) - now;
  if (!Number.isFinite(ms)) return void 0;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ms));
}
var BlockedByHost = class extends Error {
  constructor(code) {
    super(`The site's host stopped accepting connections: ${code}`);
    this.code = code;
    this.name = "BlockedByHost";
  }
};
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var SiteLink = class {
  gapMs;
  notBefore = 0;
  answered;
  failures = 0;
  constructor(options = {}) {
    this.gapMs = options.gapMs ?? ENGINE_CALL_GAP_MS;
    this.answered = options.bannedBefore ?? false;
  }
  /** Waits until the next call to the site may start. */
  async ready() {
    const wait = this.notBefore - Date.now();
    if (wait > 0) await sleep(wait);
  }
  /**
   * The site answered over HTTP, whatever the status; `retryAfter` is its `Retry-After` header when
   * it sent one with a 429 or 503.
   */
  answeredWith(retryAfter) {
    this.answered = true;
    this.failures = 0;
    this.notBefore = Date.now() + Math.max(this.gapMs, retryAfter ?? 0);
  }
  /**
   * A call threw before any answer. Throws `BlockedByHost` when this is a ban, else returns so the
   * caller rethrows the original error to the retry ladder.
   */
  failed(error) {
    this.notBefore = Date.now() + this.gapMs;
    const code = connectionFailure(error);
    if (!code) {
      this.failures = 0;
      return;
    }
    this.failures += 1;
    if (this.answered && this.failures >= BAN_AFTER_FAILURES) throw new BlockedByHost(code);
  }
};

// src/host/url-policy.mjs
var SUPPORTED = /* @__PURE__ */ new Set(["http:", "https:"]);
function parse2(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
function isSupportedUrl(url) {
  const u = parse2(url);
  if (!u) return false;
  if (!SUPPORTED.has(u.protocol)) return false;
  if (u.username !== "" || u.password !== "") return false;
  return true;
}
function sameHost(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}
function apexWwwPair(a, b) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return false;
  return la === `www.${lb}` || lb === `www.${la}`;
}
function nextRedirectUrl(currentUrl, location) {
  const current = parse2(currentUrl);
  if (!current) return null;
  let next;
  try {
    next = new URL(location, current);
  } catch {
    return null;
  }
  if (!SUPPORTED.has(next.protocol)) return null;
  if (next.username !== "" || next.password !== "") return null;
  if (current.protocol === "https:" && next.protocol === "http:" && sameHost(current.hostname, next.hostname)) {
    if (next.port !== current.port) return null;
    next.protocol = "https:";
  }
  return next.toString();
}
function isTrustedHop(anchorUrl, toUrl, opts = {}) {
  const anchor = parse2(anchorUrl);
  const to = parse2(toUrl);
  if (!anchor || !to) return false;
  if (!isSupportedUrl(anchorUrl) || !isSupportedUrl(toUrl)) return false;
  const secured = opts.secure === true || anchor.protocol === "https:";
  if (secured && to.protocol !== "https:") return false;
  const sameName = sameHost(anchor.hostname, to.hostname);
  if (!sameName && !apexWwwPair(anchor.hostname, to.hostname)) return false;
  return portsCompatible(anchor, to);
}
function portsCompatible(a, b) {
  if (a.port === "" && b.port === "") return true;
  return a.port === b.port;
}
function pathNoTrail(u) {
  return u.pathname.replace(/\/+$/, "");
}
function secureRetryWebRoot(intentUrl, sourceWebRootUrl) {
  const intent = parse2(intentUrl);
  const source = parse2(sourceWebRootUrl);
  if (!intent || !source) return null;
  if (!isSupportedUrl(intentUrl)) return null;
  if (intent.protocol !== "https:") return null;
  if (!sameHost(intent.hostname, source.hostname)) return null;
  if (pathNoTrail(intent) !== pathNoTrail(source)) return null;
  if (!portsCompatible(intent, source)) return null;
  return `${intent.origin}${pathNoTrail(intent)}`;
}

// src/host/joomla.ts
var REQUEST_TIMEOUT_MS = 15e3;
var INSTALL_TIMEOUT_MS = 3e5;
var URL_INSTALL_TIMEOUT_MS = 6e4;
var MAX_HTML_BYTES = 4 * 1024 * 1024;
var MAX_PACKAGE_BYTES = 128 * 1024 * 1024;
var MAX_POST_BODY_BYTES = 64 * 1024;
var MEMORY_EXHAUSTED = /Allowed memory size of \d+ bytes exhausted|Out of memory \(allocated \d+\)/i;
var CSRF_FIELD = /name="([a-f0-9]{32})"\s+value="1"/;
var TITLE = /<title>([^<]*)<\/title>/i;
var LOGGED_IN = /option=com_login&(?:amp;)?task=logout/i;
var MFA_REQUIRED = /option=com_users&(?:amp;)?(?:view=captive|task=captive\.)/i;
var NO_BACKEND_ACCESS = /do not have access to the Administrator/i;
var INVALID_SECRETKEY = /(?:two factor|multi-factor) authentication Secret Key is invalid/i;
var INVALID_PASS = /Username and password do not match/i;
var REFUSAL_KEYS = {
  JGLOBAL_AUTH_INVALID_SECRETKEY: "mfa_required",
  JERROR_LOGIN_DENIED: "no_backend_access",
  JGLOBAL_AUTH_INVALID_PASS: "invalid_credential",
  JGLOBAL_AUTH_NO_USER: "invalid_credential"
};
var ENGLISH_REFUSALS = [
  [INVALID_SECRETKEY, "mfa_required"],
  [NO_BACKEND_ACCESS, "no_backend_access"],
  [INVALID_PASS, "invalid_credential"]
];
var LANGUAGE_READ_BUDGET = 2;
var RETURN_PARAM = "aW5kZXgucGhw";
var TOKEN_VALUE = /id="jform_token"[\s\S]{0,160}?value="([a-f0-9]{32,})"/i;
var TEMPLATE_PATH = /\/templates\/(?:site\/)?([a-z0-9_-]{2,64})\//gi;
var COMPONENT2 = "com_claudecowork";
var timeout = (ms = REQUEST_TIMEOUT_MS) => AbortSignal.timeout(ms);
async function readCappedBody(response, cap = MAX_HTML_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (size + value.length > cap) {
      chunks.push(value.subarray(0, cap - size));
      await reader.cancel().catch(() => void 0);
      break;
    }
    size += value.length;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function basicAuthHeader(basicAuth) {
  if (!basicAuth) return {};
  const encoded = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString("base64");
  return { authorization: `Basic ${encoded}` };
}
async function fetchFollowing(startUrl, authHeader, opts = {}) {
  const anchor = opts.anchor ?? startUrl;
  const maxRedirects = opts.maxRedirects ?? 5;
  const jar = opts.jar ?? new CookieJar();
  let url = startUrl;
  let secure = opts.secure === true || isHttps(anchor) || isHttps(startUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isTrustedHop(anchor, url, { secure })) throw new Error("untrusted redirect target");
    if (opts.budget) {
      if (opts.budget.left <= 0) throw new Error("request budget spent");
      opts.budget.left -= 1;
    }
    const cookie = jar.header(url);
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        ...authHeader,
        ...cookie ? { cookie } : {}
      },
      signal: timeout()
    });
    if (isHttps(url)) secure = true;
    jar.absorb(response, url);
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) return { response, jar };
    const next = nextRedirectUrl(url, location);
    if (!next) return { response, jar };
    await disposeBody(response);
    url = next;
  }
  throw new Error("too many redirects");
}
function isHttps(url) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
async function disposeBody(response) {
  try {
    await response.body?.cancel();
  } catch {
  }
}
function isBasicAuthChallenge(response) {
  return response.status === 401 && /^basic\b/i.test(response.headers.get("www-authenticate") ?? "");
}
var TLS_CODES = /* @__PURE__ */ new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE",
  "ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION",
  "ERR_SSL_UNSUPPORTED_PROTOCOL",
  "EPROTO"
]);
function isTlsFailure(error) {
  return failureCode(error, (code) => TLS_CODES.has(code) || code.startsWith("ERR_SSL_")) !== void 0;
}
function thrownRefusal(error) {
  return isTlsFailure(error) ? "tls_invalid" : "unreachable";
}
var errorCode = diagnosticError;
function diagnoser(base) {
  return {
    answered(at, check, response, url) {
      const path10 = diagnosticPath(response.url || url || "", base);
      return { at, check, status: response.status, ...path10 ? { path: path10 } : {} };
    },
    thrown(at, error) {
      return { at, check: isTlsFailure(error) ? "tls" : "network", error: diagnosticError(error) };
    }
  };
}
function isJoomlaPage(html) {
  return /\/media\/templates\/administrator\/|\/administrator\/templates\/|\/media\/system\/(?:js|css)\//i.test(
    html
  );
}
function adminGateOf(html, status = 200, where) {
  if (status === 403) return "admin_gate";
  if (/name=["']?rsf_backend_password/i.test(html)) return "admin_gate";
  if (isFrontLoginPage(html, where)) return "admin_form_not_found";
  if (/<input[^>]+type=["']?password/i.test(html) && !/wp-login\.php|name=["']?log["'\s>]/i.test(html))
    return "admin_gate";
  return "admin_form_not_found";
}
function inspectAdminPage(html, status, pageUrl, adminUrl) {
  const where = { pageUrl, adminBase: adminBasePath(adminUrl) };
  const signInFound = status < 400 && !isFrontLoginPage(html, where) && CSRF_FIELD.test(html);
  return {
    signInFound,
    locked: !signInFound && adminGateOf(html, status, where) === "admin_gate"
  };
}
function forbiddenBy(response, html) {
  const firewall = firewallOf(response.status, response.headers, html);
  return firewall ? { reason: "blocked_by_firewall", firewall } : { reason: "admin_gate" };
}
function adminBasePath(adminUrl) {
  const path10 = new URL(adminUrl).pathname.replace(/\/index\.php$/i, "");
  return path10.endsWith("/") ? path10 : `${path10}/`;
}
function isUnderAdmin(url, adminBase) {
  let path10;
  try {
    path10 = new URL(url).pathname;
  } catch {
    return false;
  }
  return path10.startsWith(adminBase) || `${path10}/` === adminBase;
}
function isFrontLoginPage(html, where) {
  for (const form of html.match(/<form\b[\s\S]*?(?:<\/form>|$)/gi) ?? []) {
    const tag = form.match(/^<form\b[^>]*>/i)?.[0] ?? "";
    const action = (tag.match(/\baction=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find((v) => v !== void 0) ?? "").replace(/&amp;/gi, "&");
    if (/[?&](?:option=com_users|task=user\.)/i.test(action)) return true;
    if (where && /<input\b[^>]*\btype=["']?password/i.test(form)) {
      let target;
      try {
        target = new URL(action || where.pageUrl, where.pageUrl).toString();
      } catch {
      }
      if (!target || !isUnderAdmin(target, where.adminBase)) return true;
    }
    for (const input of form.match(/<input\b[^>]*>/gi) ?? []) {
      const name2 = input.match(/\bname=["']?([\w.[\]-]+)/i)?.[1]?.toLowerCase();
      const value = input.match(/\bvalue=["']?([\w.-]+)/i)?.[1]?.toLowerCase();
      if (name2 === "option" && value === "com_users" || name2 === "task" && value?.startsWith("user."))
        return true;
    }
  }
  return false;
}
function loginPostUrl(resolvedAdminUrl) {
  const url = new URL(resolvedAdminUrl);
  if (!/\/index\.php$/i.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/+$/, "")}/index.php`;
  url.hash = "";
  return url.toString();
}
function adminPageState(html, url = "") {
  if (MFA_REQUIRED.test(html) || MFA_REQUIRED.test(url)) return "captive";
  const title = html.match(TITLE)?.[1] ?? "";
  return title.startsWith("Home Dashboard") || LOGGED_IN.test(html) ? "in" : "out";
}
function siteBaseOf(adminUrl) {
  try {
    return webRootFrom(adminUrl);
  } catch {
    return "";
  }
}
function webRootFrom(loginUrl) {
  const url = new URL(loginUrl);
  const path10 = url.pathname.replace(/\/administrator(\/index\.php)?\/?$/i, "");
  return `${url.origin}${path10}`;
}
async function loginToAdmin(adminUrl, username, password, basicAuth) {
  const authHeader = basicAuthHeader(basicAuth);
  const { answered, thrown } = diagnoser(siteBaseOf(adminUrl));
  const jar = new CookieJar();
  let getResponse;
  let loginPageHtml;
  try {
    ;
    ({ response: getResponse } = await fetchFollowing(adminUrl, authHeader, { jar }));
    if (isBasicAuthChallenge(getResponse)) {
      await disposeBody(getResponse);
      return {
        ok: false,
        reason: basicAuth ? "basic_auth_invalid" : "basic_auth_required",
        detail: answered("login_page", "basic_challenge", getResponse)
      };
    }
    if (getResponse.status === 403) {
      const html = await readCappedBody(getResponse);
      return isJoomlaPage(html) ? { ok: false, reason: "unreachable", detail: answered("login_page", "joomla_denied", getResponse) } : {
        ok: false,
        ...forbiddenBy(getResponse, html),
        detail: answered("login_page", "forbidden", getResponse)
      };
    }
    if (!getResponse.ok) {
      const html = await readCappedBody(getResponse);
      const firewall = firewallOf(getResponse.status, getResponse.headers, html);
      return firewall ? {
        ok: false,
        reason: "blocked_by_firewall",
        firewall,
        detail: answered("login_page", "firewall", getResponse)
      } : { ok: false, reason: "unreachable", detail: answered("login_page", "http_status", getResponse) };
    }
    loginPageHtml = await readCappedBody(getResponse);
  } catch (error) {
    return { ok: false, reason: thrownRefusal(error), detail: thrown("login_page", error) };
  }
  const where = { pageUrl: getResponse.url || adminUrl, adminBase: adminBasePath(adminUrl) };
  const csrfField = isFrontLoginPage(loginPageHtml, where) ? void 0 : loginPageHtml.match(CSRF_FIELD)?.[1];
  if (!csrfField) {
    const firewall = firewallOf(getResponse.status, getResponse.headers, loginPageHtml);
    if (firewall)
      return {
        ok: false,
        reason: "blocked_by_firewall",
        firewall,
        detail: answered("login_page", "firewall", getResponse)
      };
    const reason = adminGateOf(loginPageHtml, getResponse.status, where);
    return { ok: false, reason, detail: answered("login_page", reason, getResponse) };
  }
  const body = new URLSearchParams({
    username,
    passwd: password,
    option: "com_login",
    task: "login",
    return: RETURN_PARAM,
    [csrfField]: "1"
  });
  const loginUrl = loginPostUrl(getResponse.url || adminUrl);
  if (!isTrustedHop(adminUrl, loginUrl, { secure: isHttps(adminUrl) })) {
    return { ok: false, reason: "unreachable", detail: { at: "login_post", check: "untrusted_target" } };
  }
  if (!isUnderAdmin(loginUrl, where.adminBase)) {
    return {
      ok: false,
      reason: "admin_form_not_found",
      detail: answered("login_page", "admin_form_not_found", getResponse)
    };
  }
  let redirectResponse;
  try {
    redirectResponse = await fetch(loginUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        "content-type": "application/x-www-form-urlencoded",
        cookie: jar.header(loginUrl),
        ...authHeader
      },
      body,
      signal: timeout()
    });
  } catch (error) {
    return { ok: false, reason: thrownRefusal(error), detail: thrown("login_post", error) };
  }
  if (redirectResponse.status === 403) {
    const html = await readCappedBody(redirectResponse);
    return isJoomlaPage(html) ? {
      ok: false,
      reason: "unreachable",
      detail: answered("login_post", "joomla_denied", redirectResponse, loginUrl)
    } : {
      ok: false,
      ...forbiddenBy(redirectResponse, html),
      detail: answered("login_post", "forbidden", redirectResponse, loginUrl)
    };
  }
  const location = redirectResponse.headers.get("location");
  if (redirectResponse.status < 300 || redirectResponse.status >= 400 || !location) {
    const html = await readCappedBody(redirectResponse);
    const firewall = firewallOf(redirectResponse.status, redirectResponse.headers, html);
    if (firewall)
      return {
        ok: false,
        reason: "blocked_by_firewall",
        firewall,
        detail: answered("login_post", "firewall", redirectResponse, loginUrl)
      };
    if (redirectResponse.status === 200 && isAdminLoginForm(html, { pageUrl: loginUrl, adminBase: where.adminBase }))
      return refusedSignIn("login_post", html, redirectResponse, { adminUrl, loginUrl, authHeader });
    return {
      ok: false,
      reason: "unreachable",
      detail: answered("login_post", "no_redirect", redirectResponse, loginUrl)
    };
  }
  jar.absorb(redirectResponse, loginUrl);
  const landingUrl = nextRedirectUrl(loginUrl, location);
  if (!landingUrl)
    return { ok: false, reason: "unreachable", detail: { at: "login_landing", check: "bad_location" } };
  let landingHtml;
  let landingResponse;
  try {
    const { response: landing } = await fetchFollowing(landingUrl, authHeader, {
      anchor: adminUrl,
      jar,
      // The login already ran over https (`loginUrl`); the landing must stay https even when it
      // points at a trusted www alias, so the session cookie and Basic auth never ride an http hop.
      secure: isHttps(loginUrl)
    });
    if (landing.status === 403) {
      const html = await readCappedBody(landing);
      return isJoomlaPage(html) ? {
        ok: false,
        reason: "no_backend_access",
        detail: answered("login_landing", "joomla_denied", landing)
      } : {
        ok: false,
        ...forbiddenBy(landing, html),
        detail: answered("login_landing", "server_denied", landing)
      };
    }
    landingHtml = await readCappedBody(landing);
    landingResponse = landing;
    const firewall = firewallOf(landing.status, landing.headers, landingHtml);
    if (firewall)
      return {
        ok: false,
        reason: "blocked_by_firewall",
        firewall,
        detail: answered("login_landing", "firewall", landing)
      };
    if (!landing.ok)
      return { ok: false, reason: "unreachable", detail: answered("login_landing", "http_status", landing) };
  } catch (error) {
    return { ok: false, reason: "unreachable", detail: thrown("login_landing", error) };
  }
  const state = adminPageState(landingHtml, location);
  if (state === "captive")
    return { ok: false, reason: "mfa_required", detail: { at: "login_landing", check: "mfa" } };
  if (state === "out")
    return refusedSignIn("login_landing", landingHtml, landingResponse, { adminUrl, loginUrl, authHeader });
  return {
    ok: true,
    cookie: jar.header(loginUrl),
    jar,
    authHeader,
    webRootUrl: webRootFrom(loginUrl)
  };
}
function isAdminLoginForm(html, where) {
  return isJoomlaPage(html) && /<form\b[^>]*\bid=["']?form-login["'\s>]/i.test(html) && /<input\b[^>]*\bname=["']?passwd["'\s>]/i.test(html) && !isFrontLoginPage(html, where);
}
async function refusedSignIn(at, html, response, where) {
  const refusal = await landingRefusal(html, response, where);
  if (refusal === "mfa_required") return { ok: false, reason: "mfa_required", detail: { at, check: "mfa" } };
  if (refusal === "no_backend_access")
    return { ok: false, reason: "no_backend_access", detail: { at, check: "no_backend_access" } };
  return {
    ok: false,
    reason: "invalid_credential",
    detail: { at, check: refusal === "invalid_credential" ? "invalid_credential" : "message_unread" }
  };
}
async function landingRefusal(html, landing, where) {
  const messages = messagesOf(html);
  if (messages.length === 0) return void 0;
  for (const [english, reason] of ENGLISH_REFUSALS)
    if (messages.some((message) => english.test(message))) return reason;
  const tag = languageTagOf(html);
  if (!tag || tag.startsWith("en-")) return void 0;
  if (firewallOf(landing.status, landing.headers, html)) return void 0;
  const sentences = await refusalSentences(tag, where);
  for (const [key, reason] of Object.entries(REFUSAL_KEYS)) {
    const sentence = sentences.get(key);
    if (sentence && messages.some((message) => message.includes(sentence))) return reason;
  }
  return void 0;
}
function messagesOf(html) {
  const found = [];
  for (const [, json] of html.matchAll(
    /<script\b[^>]*\bclass=["'][^"']*\bjoomla-script-options\b[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let options;
    try {
      options = JSON.parse(json);
    } catch {
      continue;
    }
    const queued = options?.["joomla.messages"];
    for (const group of Array.isArray(queued) ? queued : [])
      for (const list of Object.values(group ?? {}))
        for (const message of Array.isArray(list) ? list : [])
          if (typeof message === "string") found.push(message);
  }
  if (found.length === 0) {
    const container = html.match(
      /<div\b[^>]*\bid=["']system-message-container["'][^>]*>\s*<noscript\b[^>]*>([\s\S]*?)<\/noscript>/i
    )?.[1];
    for (const [, message] of container?.matchAll(
      /<div\b[^>]*\bclass=["']alert\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
    ) ?? [])
      found.push(message);
    for (const [, message] of html.matchAll(
      /<div\b[^>]*\bclass=["']alert-message["'][^>]*>([\s\S]*?)<\/div>/gi
    ))
      found.push(message);
  }
  return found.map(plainText).filter(Boolean);
}
function languageTagOf(html) {
  const match = html.match(/<html\b[^>]*?\blang=["']([a-z]{2,3})-([a-z]{2,4})["']/i);
  return match ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : void 0;
}
async function refusalSentences(tag, where) {
  const sentences = /* @__PURE__ */ new Map();
  const folder = new URL(`${adminBasePath(where.loginUrl)}language/${tag}/`, where.loginUrl);
  const budget = { left: LANGUAGE_READ_BUDGET };
  for (const file of ["joomla.ini", `${tag}.ini`]) {
    if (budget.left <= 0) break;
    let response;
    try {
      ;
      ({ response } = await fetchFollowing(new URL(file, folder).toString(), where.authHeader, {
        anchor: where.adminUrl,
        secure: isHttps(where.loginUrl),
        budget
      }));
    } catch {
      continue;
    }
    const body = await readCappedBody(response);
    if ([401, 403, 429].includes(response.status) || firewallOf(response.status, response.headers, body))
      break;
    if (!response.ok) continue;
    for (const [key, value] of iniEntries(body))
      if (key in REFUSAL_KEYS && value) sentences.set(key, plainText(value));
    if (sentences.size > 0) break;
  }
  return sentences;
}
function iniEntries(ini) {
  const entries = [];
  for (const line of ini.split(/\r?\n/)) {
    const head = line.match(/^[ \t]*([A-Za-z0-9_.-]+)[ \t]*=[ \t]*"/);
    if (!head) continue;
    let value = "";
    let at = head[0].length;
    let closed = false;
    while (at < line.length) {
      if (line.startsWith('"_QQ_"', at)) {
        value += '"';
        at += 6;
      } else if (line.startsWith('\\"', at)) {
        value += '"';
        at += 2;
      } else if (line[at] === '"') {
        closed = true;
        at += 1;
        break;
      } else {
        value += line[at];
        at += 1;
      }
    }
    if (closed && /^[ \t]*(?:;.*)?$/.test(line.slice(at))) entries.push([head[1], value]);
  }
  return entries;
}
var LATIN1_ENTITIES = "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml".split(
  " "
);
var ENTITIES = {
  ...Object.fromEntries(LATIN1_ENTITIES.map((name2, i) => [name2, String.fromCharCode(160 + i)])),
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  OElig: "\u0152",
  oelig: "\u0153",
  Scaron: "\u0160",
  scaron: "\u0161",
  Yuml: "\u0178",
  ndash: "\u2013",
  mdash: "\u2014",
  lsquo: "\u2018",
  rsquo: "\u2019",
  sbquo: "\u201A",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bdquo: "\u201E",
  hellip: "\u2026",
  euro: "\u20AC"
};
function codePoint(value) {
  return Number.isInteger(value) && value > 0 && value <= 1114111 && (value < 55296 || value > 57343) ? String.fromCodePoint(value) : "\uFFFD";
}
function plainText(text2) {
  return text2.replace(/<[^>]*>/g, " ").replace(
    /&#(?:[xX]([0-9a-fA-F]+)|(\d+));/g,
    (_, hex, dec) => codePoint(hex ? Number.parseInt(hex, 16) : Number(dec))
  ).replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (entity, name2) => ENTITIES[name2] ?? entity).replace(/\s+/g, " ").trim();
}
function authedFetcher(session) {
  const jar = session.jar ?? CookieJar.fromHeader(session.cookie, session.webRootUrl);
  const secure = isHttps(session.webRootUrl);
  return async (url, init = {}) => {
    let current = url;
    let method = init.method ?? "GET";
    let body = init.body;
    for (let hop = 0; ; hop++) {
      const cookie = jar.header(current);
      const response = await fetch(current, {
        ...init,
        method,
        body,
        redirect: "manual",
        headers: {
          "user-agent": USER_AGENT,
          ...cookie ? { cookie } : {},
          ...session.authHeader,
          ...init.headers
        }
      });
      jar.absorb(response, current);
      if (init.redirect === "manual") return response;
      const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
      const next = location ? nextRedirectUrl(current, location) : void 0;
      if (!next || hop >= 5 || !isTrustedHop(session.webRootUrl, next, { secure })) return response;
      await disposeBody(response);
      if (response.status === 303 || (response.status === 301 || response.status === 302) && method === "POST") {
        method = "GET";
        body = void 0;
      }
      current = next;
    }
  };
}
async function readSiteInfo(endpoint, token, opts = {}) {
  try {
    await opts.link?.ready();
    const response = await fetch(endpoint, {
      method: "POST",
      // When verifying an https endpoint the token must not be replayed to a redirect target: a
      // 3xx here (an https endpoint 307ing to http or to another host) is refused, not followed.
      redirect: opts.noFollow ? "manual" : "follow",
      // `headers` carries the site's HTTP Basic credential: a site that asks for one on
      // /administrator answers the administrator door 401 without it.
      headers: { ...opts.headers, "content-type": "application/json" },
      body: JSON.stringify({ token, action: "info" }),
      signal: timeout()
    });
    opts.link?.answeredWith(
      response.status === 429 || response.status === 503 ? retryAfterMs(response.headers.get("retry-after")) : void 0
    );
    if (opts.noFollow && !response.ok) {
      await response.body?.cancel();
      const firewall = firewallOf(response.status, response.headers, "");
      return {
        ok: false,
        reached: false,
        status: response.status,
        ...isBasicAuthChallenge(response) ? { basicChallenge: true } : {},
        ...firewall ? { firewall } : {}
      };
    }
    const text2 = await readCappedBody(response);
    if (isPhpParseFailure(response.status, text2))
      return { ok: false, reached: false, status: response.status, phpError: true };
    let result;
    try {
      result = JSON.parse(text2);
    } catch {
      const firewall = firewallOf(response.status, response.headers, text2);
      return {
        ok: false,
        reached: false,
        status: response.status,
        ...isBasicAuthChallenge(response) ? { basicChallenge: true } : {},
        ...firewall ? { firewall } : {}
      };
    }
    if (result?.ok === false && result.error === "php_too_old")
      return {
        ok: false,
        reached: false,
        status: response.status,
        phpError: true,
        ...bareVersion(result.php) ? { php: bareVersion(result.php) } : {},
        ...bareVersion(result.min) ? { minimumPhp: bareVersion(result.min) } : {}
      };
    const component = result?.info?.component ?? result?.info?.version ?? result?.component ?? result?.version;
    return {
      ok: result?.ok === true,
      component,
      ...result?.ok !== true && typeof result?.error === "string" ? { error: result.error } : {},
      // Which road the host can upload a part by (0.8.22+): 'curl', 'stream', or 'none' for a
      // host with no outbound connection at all. Older engines say nothing, which reads as "the
      // usual road" — exactly what they had.
      upload: typeof result?.info?.upload === "string" ? result.info.upload : void 0,
      dbDumpMany: result?.info?.db_dump_many && typeof result.info.db_dump_many === "object" ? result.info.db_dump_many : void 0,
      reached: isEngineAnswer(result),
      status: response.status,
      ...isBasicAuthChallenge(response) ? { basicChallenge: true } : {}
    };
  } catch (error) {
    opts.link?.failed(error);
    return { ok: false, reached: false };
  }
}
async function findDoor(webRootUrl, token, opts = {}) {
  return (await askDoors(webRootUrl, token, opts)).door;
}
async function askDoors(webRootUrl, token, opts) {
  const misses = [];
  for (const endpoint of apiDoors(webRootUrl)) {
    const info = await readSiteInfo(endpoint, token, opts);
    if (info.reached)
      return {
        door: {
          endpoint,
          ok: info.ok,
          component: info.component,
          error: info.error,
          upload: info.upload,
          dbDumpMany: info.dbDumpMany
        },
        misses
      };
    misses.push({ ...info, endpoint, webRootUrl });
  }
  return { misses };
}
function bareVersion(value) {
  return typeof value === "string" && /^\d+(\.\d+){0,3}$/.test(value) ? value : void 0;
}
function phpOfMisses(misses, php, minimum) {
  const said = misses.find((miss) => miss.phpError && miss.minimumPhp);
  if (said) return { ...said.php ? { php: said.php } : {}, minimumPhp: said.minimumPhp };
  return phpDetail(php, minimum);
}
function doorMiss(at, misses) {
  const miss = [...misses].reverse().find((one) => one.phpError) ?? misses.at(-1);
  if (!miss) return { at, check: "no_door" };
  const path10 = diagnosticPath(miss.endpoint, miss.webRootUrl);
  const check = miss.phpError ? miss.minimumPhp ? "below_minimum" : "parse_error" : miss.status !== void 0 ? "no_engine" : "network";
  return {
    at,
    check,
    ...miss.status !== void 0 ? { status: miss.status } : {},
    ...path10 ? { path: path10 } : {}
  };
}
function firewallMiss(at, misses) {
  const miss = [...misses].reverse().find((one) => one.firewall);
  if (!miss?.firewall) return void 0;
  const path10 = diagnosticPath(miss.endpoint, miss.webRootUrl);
  return {
    firewall: miss.firewall,
    detail: {
      at,
      check: "firewall",
      ...miss.status !== void 0 ? { status: miss.status } : {},
      ...path10 ? { path: path10 } : {}
    }
  };
}
async function resolveDoor(webRootUrl, token, opts = {}) {
  const { headers } = opts;
  let { door, misses } = await askDoors(webRootUrl, token, { headers, link: opts.link });
  if (!door && !misses.some((miss) => miss.phpError)) {
    await new Promise((resolve) => setTimeout(resolve, opts.secondLookMs ?? 2e3));
    ({ door, misses } = await askDoors(webRootUrl, token, { headers, link: opts.link }));
  }
  if (!door) {
    const challenge = Object.keys(headers ?? {}).length === 0 && misses.find((miss) => miss.basicChallenge);
    if (challenge) {
      const path10 = diagnosticPath(challenge.endpoint, challenge.webRootUrl);
      return {
        refusal: "basic_auth_required",
        detail: {
          at: "api_door",
          check: "basic_challenge",
          ...challenge.status !== void 0 ? { status: challenge.status } : {},
          ...path10 ? { path: path10 } : {}
        }
      };
    }
    if (misses.some((miss) => miss.phpError))
      return {
        refusal: "php_too_old",
        detail: doorMiss("api_door", misses),
        ...phpOfMisses(misses, void 0, void 0)
      };
    const blocked = firewallMiss("api_door", misses);
    if (blocked) return { refusal: "blocked_by_firewall", ...blocked };
    return { refusal: "cowork_not_answering", detail: doorMiss("api_door", misses) };
  }
  return {
    endpoint: door.endpoint,
    inline: door.upload === "none",
    ...door.dbDumpMany ? { dbDumpMany: door.dbDumpMany } : {}
  };
}
async function readPhpInfo(fetchAuthed, adminBase, onAnswer) {
  try {
    const url = `${adminBase}?option=com_admin&view=sysinfo&layout=phpinfo`;
    const page = await fetchAuthed(url, { signal: timeout() });
    const html = await readCappedBody(page);
    onAnswer?.(page, html, url);
    const limits = phpLimits(html);
    const fromPage = html.match(/<h1 class="p">PHP Version (\d+\.\d+(?:\.\d+)?)/)?.[1];
    const php = fromPage ?? page.headers.get("x-powered-by")?.match(/PHP\/(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? await readSysinfoPhp(fetchAuthed, adminBase);
    return { ...php ? { php } : {}, limits };
  } catch {
    return { limits: {} };
  }
}
async function readSysinfoPhp(fetchAuthed, adminBase) {
  try {
    const page = await fetchAuthed(`${adminBase}?option=com_admin&view=sysinfo&format=json`, {
      signal: timeout()
    });
    const body = await readCappedBody(page);
    return page.ok ? body.match(/"phpversion"\s*:\s*"(\d+\.\d+(?:\.\d+)?)/)?.[1] : void 0;
  } catch {
    return void 0;
  }
}
function installerPhpFloor(html) {
  const said = html.match(
    /Claude Cowork needs PHP (\d+\.\d+(?:\.\d+)?) or newer; this site runs PHP (\d+\.\d+(?:\.\d+)?)/
  );
  return said ? { php: said[2], minimumPhp: said[1] } : void 0;
}
var PHP_LIMIT_NAMES = ["memory_limit", "upload_max_filesize", "post_max_size"];
function phpLimits(html) {
  const limits = {};
  for (const name2 of PHP_LIMIT_NAMES) {
    const local = html.match(
      new RegExp(`<td class="e">\\s*${name2}\\s*</td>\\s*<td class="v">\\s*([^<]*?)\\s*</td>`, "i")
    )?.[1];
    const bytes = phpSizeBytes(local);
    if (bytes !== void 0) limits[name2] = bytes;
  }
  return limits;
}
function phpSizeBytes(value) {
  const match = value?.trim().match(/^(-?\d+)\s*([kmg])?$/i);
  if (!match) return void 0;
  const amount = Number(match[1]);
  if (amount < 0) return -1;
  const unit = match[2]?.toLowerCase();
  const bytes = amount * (unit === "g" ? 1024 ** 3 : unit === "m" ? 1024 ** 2 : unit === "k" ? 1024 : 1);
  return Number.isSafeInteger(bytes) ? bytes : void 0;
}
function uploadBlockedBy(bytes, limits, requestBytes = bytes) {
  const blocking = [];
  const file = limits.upload_max_filesize;
  if (file !== void 0 && file > 0 && bytes > file) blocking.push(file);
  const post = limits.post_max_size;
  if (post !== void 0 && post > 0 && requestBytes > post) blocking.push(post);
  return blocking.length ? Math.min(...blocking) : void 0;
}
function uploadForm(file, fileName, csrf) {
  const form = new FormData();
  form.append("install_package", new Blob([file], { type: "application/zip" }), fileName);
  form.append("installtype", "upload");
  form.append("task", "install.install");
  form.append("return", "");
  form.append(csrf, "1");
  return form;
}
async function uploadRequestBytes(bytes, fileName, csrf = "0".repeat(32)) {
  const envelope = await new Response(uploadForm(new ArrayBuffer(0), fileName, csrf)).arrayBuffer();
  return envelope.byteLength + bytes;
}
function megabytes(bytes) {
  const mb = bytes / 1024 ** 2;
  return mb < 10 ? String(Math.round(mb * 10) / 10) : String(Math.round(mb));
}
function versionBelow(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
function minimumPhp(declared) {
  return declared && /^\d+(\.\d+)*$/.test(declared) ? declared : void 0;
}
function phpDetail(php, minimum) {
  if (!minimum) return {};
  if (!php) return { minimumPhp: minimum };
  return versionBelow(php, minimum) ? { php, minimumPhp: minimum } : {};
}
function packageFileName(packageUrl) {
  try {
    const last = new URL(packageUrl).pathname.split("/").pop() ?? "";
    return /\.zip$/i.test(last) ? last : "pkg_claudecowork.zip";
  } catch {
    return "pkg_claudecowork.zip";
  }
}
async function downloadPackage(packageUrl) {
  try {
    const response = await fetch(packageUrl, {
      headers: { "user-agent": USER_AGENT },
      signal: timeout(6e4)
    });
    if (!response.ok) return void 0;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PACKAGE_BYTES) return void 0;
    return bytes;
  } catch {
    return void 0;
  }
}
async function installCowork(session, packageUrl, latestVersion, existingToken, options = {}) {
  const met = {};
  const result = await installSteps(session, packageUrl, latestVersion, existingToken, options, met);
  if (!result.ok && met.firewall && met.detail && GENERIC_INSTALL_FAILURES.has(result.reason)) {
    const { roads, php_limits, package_bytes } = result.detail ?? {};
    return {
      ok: false,
      reason: "blocked_by_firewall",
      firewall: met.firewall,
      detail: {
        ...met.detail,
        ...roads ? { roads } : {},
        ...php_limits ? { php_limits } : {},
        ...package_bytes !== void 0 ? { package_bytes } : {}
      }
    };
  }
  return result;
}
var GENERIC_INSTALL_FAILURES = /* @__PURE__ */ new Set(["unreachable", "install_failed", "configure_failed"]);
async function installSteps(session, packageUrl, latestVersion, existingToken, options, met) {
  const fetchAuthed = authedFetcher(session);
  const doorOpts = { headers: session.authHeader, link: options.link };
  const { answered, thrown } = diagnoser(session.webRootUrl);
  const needPhp = minimumPhp(options.requiresPhp);
  const adminBase = `${session.webRootUrl}/administrator/index.php`;
  const optionsUrl = `${adminBase}?option=com_config&view=component&component=${COMPONENT2}`;
  const note = (at, response, html, url) => {
    if (met.firewall) return;
    const firewall = firewallOf(response.status, response.headers, html);
    if (firewall) Object.assign(met, { firewall, detail: answered(at, "firewall", response, url) });
  };
  const noteDoors = (at, misses2) => {
    if (met.firewall) return;
    const blocked = firewallMiss(at, misses2);
    if (blocked) Object.assign(met, blocked);
  };
  const readInstalledToken = async (at) => {
    try {
      const response = await fetchAuthed(optionsUrl, { signal: timeout() });
      const html = await readCappedBody(response);
      note(at, response, html, optionsUrl);
      return html.match(TOKEN_VALUE)?.[1];
    } catch {
      return void 0;
    }
  };
  const siteTemplates = async () => {
    const names = /* @__PURE__ */ new Set();
    for (const url of [
      `${adminBase}?option=com_templates&view=styles&client_id=0`,
      `${session.webRootUrl}/`
    ]) {
      try {
        const html = await readCappedBody(await fetchAuthed(url, { signal: timeout() }));
        for (const m of html.matchAll(TEMPLATE_PATH)) names.add(m[1].toLowerCase());
      } catch {
      }
    }
    return names;
  };
  const contractsToKeep = async (pkg) => {
    const templates = await siteTemplates();
    const fetchAsset = (asset) => downloadPackage(new URL(asset, packageUrl).toString());
    const assets = await fetchContractAssets(pkg, indexedCandidates(pkg, templates), fetchAsset);
    const candidates = contractCandidates(pkg, templates, assets);
    const seen = /* @__PURE__ */ new Map();
    for (const path10 of probePaths(candidates)) {
      try {
        const response = await fetchAuthed(`${session.webRootUrl}/${path10}`, { signal: timeout() });
        if (!response.ok) {
          await disposeBody(response);
          continue;
        }
        seen.set(
          path10,
          createHash2("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex")
        );
      } catch {
      }
    }
    const keep = pickContracts(candidates, seen);
    const named = [...keep].filter((id) => !assets.has(id));
    for (const [id, asset] of await fetchContractAssets(pkg, named, fetchAsset)) assets.set(id, asset);
    return { keep, assets };
  };
  if (existingToken) {
    const { door: alive, misses: misses2 } = await askDoors(session.webRootUrl, existingToken, doorOpts);
    noteDoors("api_door", misses2);
    if (alive?.ok && !needsInstall(alive.component, latestVersion)) {
      return { ok: true, token: existingToken, version: alive.component };
    }
  }
  const present = await readInstalledToken("install_page");
  if (present) {
    const { door: info, misses: misses2 } = await askDoors(session.webRootUrl, present, doorOpts);
    noteDoors("api_door", misses2);
    if (info?.ok && !needsInstall(info.component, latestVersion)) {
      return { ok: true, token: present, version: info.component };
    }
  }
  const installUrl = `${adminBase}?option=com_installer&view=install`;
  let installPage;
  let installPageHtml;
  try {
    installPage = await fetchAuthed(installUrl, { signal: timeout() });
    installPageHtml = await readCappedBody(installPage);
  } catch (error) {
    return { ok: false, reason: "unreachable", detail: thrown("install_page", error) };
  }
  if (installPage.status === 403) {
    return isJoomlaPage(installPageHtml) ? {
      ok: false,
      reason: "install_forbidden",
      detail: answered("install_page", "joomla_denied", installPage, installUrl)
    } : {
      ok: false,
      ...forbiddenBy(installPage, installPageHtml),
      detail: answered("install_page", "server_denied", installPage, installUrl)
    };
  }
  const installFirewall = firewallOf(installPage.status, installPage.headers, installPageHtml);
  if (installFirewall)
    return {
      ok: false,
      reason: "blocked_by_firewall",
      firewall: installFirewall,
      detail: answered("install_page", "firewall", installPage, installUrl)
    };
  if (!installPage.ok)
    return {
      ok: false,
      reason: "unreachable",
      detail: answered("install_page", "http_status", installPage, installUrl)
    };
  const csrf = installPageHtml.match(CSRF_FIELD)?.[1];
  const onInstaller = /[?&]option=com_installer\b/i.test(installPage.url || installUrl);
  if (!onInstaller || !csrf) {
    const check = !onInstaller ? "left_installer" : LOGGED_IN.test(installPageHtml) ? "no_csrf" : "signed_out";
    return {
      ok: false,
      reason: "unreachable",
      detail: answered("install_page", check, installPage, installUrl)
    };
  }
  const { php, limits } = await readPhpInfo(
    fetchAuthed,
    adminBase,
    (page, html, url) => note("php_check", page, html, url)
  );
  if (php && needPhp && versionBelow(php, needPhp))
    return {
      ok: false,
      reason: "php_too_old",
      php,
      minimumPhp: needPhp,
      detail: { at: "php_check", check: "below_minimum" }
    };
  const installedNow = async (at) => {
    const token2 = await readInstalledToken(at);
    if (!token2) return false;
    const { door: info, misses: misses2 } = await askDoors(session.webRootUrl, token2, doorOpts);
    noteDoors(at, misses2);
    return info?.ok === true && !needsInstall(info.component, latestVersion);
  };
  let lastResult;
  let phpFloor;
  let postDenied;
  let tooLarge;
  const roads = {};
  let packageBytes;
  const withEvidence = (detail) => ({
    ...detail,
    ...Object.keys(roads).length ? { roads } : {},
    ...Object.keys(limits).length ? { php_limits: limits } : {},
    ...packageBytes !== void 0 ? { package_bytes: packageBytes } : {}
  });
  const submitInstall = async (body, waitMs = INSTALL_TIMEOUT_MS) => {
    const posted = await fetchAuthed(installUrl, {
      method: "POST",
      redirect: "manual",
      body,
      signal: timeout(waitMs)
    });
    const at = body instanceof FormData ? "upload_install" : "url_install";
    const road = { post_status: posted.status };
    roads[at] = road;
    if (posted.status === 403) {
      const html = await readCappedBody(posted);
      postDenied = { by: isJoomlaPage(html) ? "joomla" : "server", response: posted, at, html };
      return false;
    } else {
      postDenied = void 0;
      if (posted.status === 413 && at === "upload_install") {
        await disposeBody(posted);
        road.cause = "too_large";
        tooLarge = posted;
        return false;
      }
      if (posted.status >= 300 && posted.status < 400) {
        note(at, posted, "", installUrl);
        await disposeBody(posted);
      } else {
        const html = await readCappedBody(posted, MAX_POST_BODY_BYTES);
        note(at, posted, html, installUrl);
        if (MEMORY_EXHAUSTED.test(html)) road.cause = "memory_exhausted";
        phpFloor = installerPhpFloor(html) ?? phpFloor;
      }
    }
    lastResult = await fetchAuthed(installUrl, { signal: timeout() });
    road.result_status = lastResult.status;
    const resultHtml = await readCappedBody(lastResult);
    note(at, lastResult, resultHtml, installUrl);
    phpFloor = installerPhpFloor(resultHtml) ?? phpFloor;
    if (/alert-success">\s*Installation of the \w+ was successful/i.test(resultHtml)) return true;
    return installedNow(at);
  };
  const memoryRoad = () => ["url_install", "upload_install"].find((name2) => roads[name2]?.cause === "memory_exhausted");
  let blockedBy;
  const recordedCause = () => {
    if (postDenied)
      return postDenied.by === "joomla" ? {
        ok: false,
        reason: "install_forbidden",
        detail: withEvidence(answered(postDenied.at, "joomla_denied", postDenied.response, installUrl))
      } : {
        ok: false,
        ...forbiddenBy(postDenied.response, postDenied.html),
        detail: withEvidence(answered(postDenied.at, "server_denied", postDenied.response, installUrl))
      };
    const memory = memoryRoad();
    if (memory)
      return {
        ok: false,
        reason: "site_resource_limit",
        detail: withEvidence({
          at: memory,
          check: "memory_exhausted",
          ...roads[memory]?.post_status !== void 0 ? { status: roads[memory]?.post_status } : {}
        })
      };
    if (blockedBy !== void 0 && packageBytes !== void 0)
      return {
        ok: false,
        reason: "upload_too_large",
        uploadMb: { package: megabytes(packageBytes), limit: megabytes(blockedBy) },
        detail: withEvidence({ at: "upload_install", check: "over_limit" })
      };
    if (tooLarge)
      return {
        ok: false,
        reason: "upload_too_large",
        detail: withEvidence(answered("upload_install", "too_large", tooLarge, installUrl))
      };
    return void 0;
  };
  let installed = false;
  let lastRoad = "upload_install";
  let uploadThrown;
  let carried = await downloadPackage(packageUrl);
  if (carried) {
    const { keep, assets } = await contractsToKeep(carried);
    carried = packageForImport(carried, keep, assets)?.bytes ?? carried;
    packageBytes = carried.byteLength;
    blockedBy = uploadBlockedBy(
      carried.byteLength,
      limits,
      await uploadRequestBytes(carried.byteLength, packageFileName(packageUrl))
    );
    if (blockedBy !== void 0) roads.upload_install = { cause: "over_limit" };
  }
  if (carried && blockedBy === void 0) {
    try {
      installed = await submitInstall(uploadForm(carried, packageFileName(packageUrl), csrf));
    } catch (error) {
      uploadThrown = thrown("upload_install", error);
      roads.upload_install = { ...roads.upload_install, error: errorCode(error) };
      installed = await installedNow("upload_install");
    }
    if (!installed && postDenied?.by === "joomla") return recordedCause();
  }
  const uploadDenied = postDenied;
  let urlError;
  if (!installed) {
    let urlCsrf = csrf;
    if (roads.upload_install?.post_status !== void 0 || uploadThrown) {
      try {
        const page = await fetchAuthed(installUrl, { signal: timeout() });
        const pageHtml = await readCappedBody(page);
        note("install_page", page, pageHtml, installUrl);
        if (page.status === 403)
          return isJoomlaPage(pageHtml) ? {
            ok: false,
            reason: "install_forbidden",
            detail: withEvidence(answered("install_page", "joomla_denied", page, installUrl))
          } : {
            ok: false,
            ...forbiddenBy(page, pageHtml),
            detail: withEvidence(answered("install_page", "server_denied", page, installUrl))
          };
        urlCsrf = pageHtml.match(CSRF_FIELD)?.[1];
        if (!urlCsrf)
          return recordedCause() ?? {
            ok: false,
            reason: "install_failed",
            detail: withEvidence(answered("install_page", "no_csrf", page, installUrl))
          };
      } catch (error) {
        return recordedCause() ?? {
          ok: false,
          reason: "unreachable",
          detail: withEvidence(uploadThrown ?? thrown("install_page", error))
        };
      }
    }
    lastRoad = "url_install";
    try {
      installed = await submitInstall(
        new URLSearchParams({
          installtype: "url",
          install_url: packageUrl,
          task: "install.install",
          return: "",
          [urlCsrf]: "1"
        }),
        URL_INSTALL_TIMEOUT_MS
      );
    } catch (error) {
      urlError = errorCode(error);
      roads.url_install = { ...roads.url_install, error: urlError };
      installed = await installedNow("url_install");
    }
  }
  if (!installed && !postDenied) postDenied = uploadDenied;
  if (!installed && !carried)
    return recordedCause() ?? {
      ok: false,
      reason: "install_failed",
      detail: withEvidence({
        at: "package_download",
        check: "not_downloaded",
        ...urlError ? { error: urlError } : {}
      })
    };
  if (!installed && uploadThrown && urlError)
    return recordedCause() ?? { ok: false, reason: "unreachable", detail: withEvidence(uploadThrown) };
  if (!installed) {
    if (phpFloor)
      return {
        ok: false,
        reason: "php_too_old",
        ...phpFloor,
        detail: withEvidence({ at: lastRoad, check: "installer_php_floor" })
      };
    const cause = recordedCause();
    if (cause) return cause;
    const landed = await readInstalledToken("proof");
    if (landed) {
      const { door: proof2, misses: misses2 } = await askDoors(session.webRootUrl, landed, doorOpts);
      noteDoors("proof", misses2);
      if (proof2?.error === "contract_unavailable")
        return {
          ok: false,
          reason: "install_failed",
          detail: withEvidence({ at: "proof", check: "contract_unavailable" })
        };
      if (misses2.some((m) => m.phpError))
        return {
          ok: false,
          reason: "php_too_old",
          ...phpOfMisses(misses2, php, needPhp),
          detail: withEvidence(doorMiss(lastRoad, misses2))
        };
    }
    return {
      ok: false,
      reason: "install_failed",
      detail: withEvidence(
        lastResult ? answered(lastRoad, landed ? "not_answering" : "not_installed", lastResult, installUrl) : { at: lastRoad, check: "not_installed" }
      )
    };
  }
  const token = await readInstalledToken("proof");
  if (!token) return { ok: false, reason: "configure_failed", detail: { at: "proof", check: "no_token" } };
  const { door: proof, misses } = await askDoors(session.webRootUrl, token, doorOpts);
  noteDoors("proof", misses);
  if (!proof?.ok) {
    if (!proof && misses.some((miss) => miss.phpError))
      return {
        ok: false,
        reason: "php_too_old",
        ...phpOfMisses(misses, php, needPhp),
        detail: doorMiss("proof", misses)
      };
    return {
      ok: false,
      reason: "configure_failed",
      detail: proof ? { at: "proof", check: "refused" } : doorMiss("proof", misses)
    };
  }
  return { ok: true, token, version: proof.component };
}

// src/host/detect.ts
var TIMEOUT_MS = 1e4;
var MAX_BYTES = 512 * 1024;
var MARKS = [
  { platform: "wordpress", pattern: /\/wp-(?:content|includes)\//i },
  { platform: "joomla", pattern: /\/media\/(?:system|templates)\/js\//i },
  { platform: "joomla", pattern: /\/templates\/[a-z0-9_-]+\/(?:css|js)\//i },
  { platform: "wordpress", pattern: /<meta[^>]+name=["']generator["'][^>]+WordPress/i },
  { platform: "joomla", pattern: /<meta[^>]+name=["']generator["'][^>]+Joomla/i },
  { platform: "joomla", pattern: /\/index\.php\?option=com_/i }
];
async function readPrefix(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  try {
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = value.subarray(0, MAX_BYTES - size);
      chunks.push(chunk);
      size += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => void 0);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function inspectAddress(address, fetchImpl = fetch, admin = false, platform = "joomla") {
  const initial = /^https?:\/\//i.test(address) ? address : `https://${address}`;
  const unknown = { platform: null, reachable: false, secure: null, blocked: false };
  if (admin) unknown.admin = { signInFound: null, locked: false, basicAuthRequired: false };
  if (!isSupportedUrl(initial)) return { ...unknown, error: "other" };
  const secure = new URL(initial).protocol === "https:";
  let url = initial;
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let response;
    for (let hop = 0; hop < 6; hop++) {
      response = await fetchImpl(url, { redirect: "manual", signal, headers: { "user-agent": USER_AGENT } });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) break;
      await response.body?.cancel().catch(() => void 0);
      if (hop === 5) throw new Error("too many redirects");
      const next = nextRedirectUrl(url, location);
      if (!next || secure && new URL(next).protocol !== "https:")
        throw new Error("untrusted redirect target");
      url = next;
    }
    if (!response) return unknown;
    const html = await readPrefix(response);
    const blockedBy = firewallOf(response.status, response.headers, html);
    const firewall = blockedBy ?? (/cloudflare/i.test(response.headers.get("server") ?? "") ? "cloudflare" : null);
    const basicAuthRequired = response.status === 401 && /^basic\b/i.test(response.headers.get("www-authenticate") ?? "");
    const answer = {
      platform: MARKS.find((mark) => mark.pattern.test(html))?.platform ?? null,
      reachable: response.ok || basicAuthRequired || !!blockedBy || admin && response.status === 403,
      secure: new URL(url).protocol === "https:",
      blocked: !!blockedBy,
      status: response.status,
      ...firewall ? { firewall } : {}
    };
    if (admin)
      answer.admin = {
        ...basicAuthRequired || blockedBy ? { signInFound: null, locked: false } : platform === "wordpress" ? {
          signInFound: response.ok && /<form\b[^>]*\bid=["']loginform["']/i.test(html),
          locked: response.status === 403
        } : inspectAdminPage(html, response.status, url, initial),
        basicAuthRequired
      };
    return answer;
  } catch (error) {
    return {
      ...unknown,
      ...isTlsFailure(error) ? { reachable: true, secure: false } : {},
      error: diagnosticError(error)
    };
  }
}

// ../../core/tracy-core/src/lease/index.mjs
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path3 from "node:path";
var HEARTBEAT_MS = 3e4;
var DRAIN_STALE_MS = 60 * 6e4;
function home() {
  return process.env.DSH_HOME ?? process.cwd();
}
function draining2(now = Date.now()) {
  try {
    return now - statSync(path3.join(home(), "draining")).mtimeMs < DRAIN_STALE_MS;
  } catch {
    return false;
  }
}
function holdLease(id, info) {
  const dir = path3.join(home(), "leases");
  const file = path3.join(dir, `${id}.json`);
  let current = { ...info };
  let released = false;
  const write = () => {
    if (released) return;
    try {
      mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ id, ...current, heartbeatAt: (/* @__PURE__ */ new Date()).toISOString() }));
      renameSync(tmp, file);
    } catch (error) {
      console.warn(
        `[lease] could not write ${file}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  write();
  const timer = setInterval(write, HEARTBEAT_MS);
  timer.unref();
  return {
    update(patch) {
      current = { ...current, ...patch };
    },
    release() {
      if (released) return;
      released = true;
      clearInterval(timer);
      rmSync(file, { force: true });
    }
  };
}

// src/host/run.ts
import { rm } from "node:fs/promises";
import path9 from "node:path";

// src/host/artifacts.ts
var ArtifactRefused = class extends Error {
  constructor(code) {
    super(`The relay refused an artifact call: ${code}`);
    this.code = code;
    this.name = "ArtifactRefused";
  }
};
async function call(caller, siteKey, step, body) {
  const fetchImpl = caller.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${caller.origin}/api/sites/${encodeURIComponent(siteKey)}/artifacts/${step}`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", cookie: caller.cookie },
      body: JSON.stringify(body)
    }
  );
  const parsed = await response.json().catch(() => null);
  if (!response.ok || !parsed) throw new ArtifactRefused(parsed?.code ?? `HTTP_${response.status}`);
  return parsed;
}
function artifactsFor(siteKey, caller) {
  return {
    /** One URL for a whole small object — the database dump, which needs no multipart. */
    async signPut(kind) {
      return call(caller, siteKey, "put", { kind });
    },
    /** Open a multipart upload. The other side names the key. */
    async begin(kind) {
      return call(caller, siteKey, "begin", { kind });
    },
    /** A short-lived URL, used exactly once for exactly one part. */
    async signPart(key, uploadId, partNumber) {
      const { url } = await call(caller, siteKey, "part", { key, uploadId, partNumber });
      return url;
    },
    /** Join the parts. */
    async finish(key, uploadId, parts) {
      await call(caller, siteKey, "finish", { key, uploadId, parts });
    },
    /**
     * Throw away an unfinished upload.
     *
     * Best-effort by nature: this runs on the failure path, and storage refusing to let go of
     * an unfinished upload must not turn one error into two.
     */
    async abandon(key, uploadId) {
      await call(caller, siteKey, "abort", { key, uploadId }).catch(() => void 0);
    },
    /** Drop a finished object this run no longer needs. Best effort: cleaning never fails a run. */
    async remove(key) {
      await call(caller, siteKey, "delete", { key }).catch(() => void 0);
    }
  };
}
var PART_SIZE = 8 * 1024 * 1024;

// src/host/export.ts
import { createGzip } from "node:zlib";

// src/host/resume.ts
import path4 from "node:path";

// src/host/import-ttl.mjs
var RUN_TTL_MS = 6 * 60 * 6e4;
var UPLOAD_IDLE_MS = 6 * 60 * 6e4;

// src/host/resume.ts
var IDLE_MS = UPLOAD_IDLE_MS;
var MAX_AGE_MS = 24 * 60 * 6e4;
function isFresh(held, now = Date.now()) {
  return now - (held.updatedAt ?? held.startedAt) < IDLE_MS && now - held.startedAt < MAX_AGE_MS;
}
function bookPath() {
  const home2 = process.env.DSH_HOME ?? process.cwd();
  return path4.join(home2, "tracy-add-site", "uploads.json");
}
async function heldUpload(siteKey) {
  const held = (await readBook(bookPath()))[siteKey];
  if (!held) return void 0;
  return isFresh(held) ? held : void 0;
}
async function staleUpload(siteKey) {
  const held = (await readBook(bookPath()))[siteKey];
  if (!held) return void 0;
  return isFresh(held) ? void 0 : held;
}
async function rememberUpload(siteKey, cursor) {
  await updateBook(bookPath(), (book) => {
    book[siteKey] = { ...cursor, parts: [...cursor.parts], updatedAt: cursor.updatedAt ?? Date.now() };
  });
}
async function forgetUpload(siteKey) {
  await updateBook(bookPath(), (book) => {
    if (!(siteKey in book)) return false;
    delete book[siteKey];
  });
}

// src/host/retry.ts
var sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var ATTEMPTS = 4;
var FIRST_DELAY_MS = 1e3;
var RELAYED = "RelayedTransportError";
function relayedTransportError(message) {
  const error = new Error(message);
  error.name = RELAYED;
  return error;
}
function isTransport(error) {
  if (!(error instanceof Error)) return false;
  if (error.name === RELAYED) return true;
  return error.name === "TypeError" || error.name === "TimeoutError" || error.name === "AbortError";
}
async function withRetry(call2, onRetry) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await call2();
    } catch (error) {
      lastError = error;
      if (!isTransport(error) || attempt === ATTEMPTS) break;
      const delay = FIRST_DELAY_MS * 2 ** (attempt - 1);
      onRetry?.(attempt, delay);
      await sleep2(delay);
    }
  }
  throw lastError;
}
var PART_ATTEMPTS = 6;
var PART_FIRST_DELAY_MS = 2e3;
async function withPartRetry(attemptOnce, onRetry) {
  let lastError;
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
    try {
      return await attemptOnce(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransport(error) || attempt === PART_ATTEMPTS) break;
      const delay = PART_FIRST_DELAY_MS * 2 ** (attempt - 1);
      onRetry?.(attempt, delay);
      await sleep2(delay);
    }
  }
  throw lastError;
}

// src/host/export.ts
var REQUEST_TIMEOUT_MS2 = 12e4;
var DB_CHUNK_LIMIT = 5e3;
var MIN_DB_CHUNK_LIMIT = 50;
var TARGET_PART_BYTES = 8 * 1024 * 1024;
var SLOW_UPLINK_BYTES_PER_S = 16 * 1024;
function packTimeoutMs(inline, targetBytes) {
  if (!inline) return REQUEST_TIMEOUT_MS2 + 6e4;
  return REQUEST_TIMEOUT_MS2 + Math.ceil(targetBytes * 4 / 3 / SLOW_UPLINK_BYTES_PER_S * 1e3);
}
var MAX_PARTS = 1e4;
var ExportFailed = class extends Error {
  /**
   * @param detail What the operator log needs beyond the reason — the firewall's name, or on
   *   `blocked_by_host` the connection error (`ECONNREFUSED`…).
   */
  constructor(reason, detail, diagnostic) {
    super(detail ? `The export stopped: ${reason} (${detail})` : `The export stopped: ${reason}`);
    this.reason = reason;
    this.detail = detail;
    this.diagnostic = diagnostic;
    this.name = "ExportFailed";
  }
};
var siteOverloads = /* @__PURE__ */ new WeakSet();
var isSiteOverload = (error) => error instanceof Error && siteOverloads.has(error);
var siteOffline = /* @__PURE__ */ new WeakMap();
var OFFLINE_CODES = /* @__PURE__ */ new Set(["ECONNREFUSED", "ECONNRESET", "UND_ERR_SOCKET", "EHOSTUNREACH", "ENETUNREACH"]);
var slowParts = /* @__PURE__ */ new WeakSet();
var isOwnTimeout = (error) => error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
var isSlowPart = (error) => isOwnTimeout(error) || error instanceof Error && slowParts.has(error);
async function overloadAware(step) {
  try {
    return await step;
  } catch (error) {
    if (isSiteOverload(error)) throw new ExportFailed("site_resource_limit");
    const offline = error instanceof Error ? siteOffline.get(error) : void 0;
    if (offline) throw new ExportFailed("site_offline", offline);
    throw error;
  }
}
var etagOf = (response) => (response.headers.get("etag") ?? "").replace(/^"|"$/g, "");
async function callPlugin(endpoint, token, action, params, site, timeoutMs = REQUEST_TIMEOUT_MS2) {
  await site.link.ready();
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      // The same user agent the sign-in used: bot rules on shared hosting that let the login through
      // blocked the runtime's default `node` on the first engine call (measured 2026-10-19).
      headers: { ...site.headers, "content-type": "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify({ token, action, params }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    try {
      site.link.failed(error);
    } catch (ban) {
      if (ban instanceof BlockedByHost) throw new ExportFailed("blocked_by_host", ban.code);
      throw ban;
    }
    const code = failureCode(error, (candidate) => OFFLINE_CODES.has(candidate));
    if (error instanceof Error && code) siteOffline.set(error, code);
    throw error;
  }
  site.link.answeredWith(
    response.status === 429 || response.status === 503 ? retryAfterMs(response.headers.get("retry-after")) : void 0
  );
  let text2;
  try {
    text2 = await response.text();
  } catch (error) {
    const code = failureCode(error, (candidate) => OFFLINE_CODES.has(candidate));
    if (error instanceof Error && code) siteOffline.set(error, code);
    throw error;
  }
  const result = engineReply(text2);
  if (result === null) {
    if (isPhpParseFailure(response.status, text2)) throw new ExportFailed("php_too_old");
    const firewall = firewallOf(response.status, response.headers, text2, { generic: true });
    if (firewall) throw new ExportFailed("blocked_by_firewall", firewall);
    const detail = `${action} answered ${response.status} without an engine reply: ${text2.slice(0, 120)}`;
    if (response.status === 429 || response.status >= 500) {
      const error = relayedTransportError(detail);
      const gateway = gatewayOf(response.status, response.headers, text2);
      if (gateway) siteOffline.set(error, `${gateway} ${response.status}`);
      else siteOverloads.add(error);
      throw error;
    }
    throw new ExportFailed("call_failed", detail, {
      at: "export",
      check: "no_engine_reply",
      status: response.status,
      ...DIAGNOSTIC_ACTIONS.has(action) ? { action } : {},
      answer: answerKind(text2)
    });
  }
  if (!result.ok) {
    const detail = `${action} failed: ${JSON.stringify(result).slice(0, 200)}`;
    if (result.error === "upload_failed") {
      const status = Number(/HTTP (\d{3})/.exec(String(result.message ?? ""))?.[1]);
      if (status === 429 || status >= 500 && status <= 599) throw relayedTransportError(detail);
      if (!Number.isFinite(status) || status === 0) {
        const error = relayedTransportError(detail);
        slowParts.add(error);
        throw error;
      }
    }
    const code = typeof result.error === "string" && DIAGNOSTIC_ENGINE_ERRORS.has(result.error) ? result.error : "other";
    throw new ExportFailed("call_failed", detail, {
      at: "export",
      check: "engine_refused",
      status: response.status,
      ...DIAGNOSTIC_ACTIONS.has(action) ? { action } : {},
      engine_error: code
    });
  }
  return result;
}
var siteCall = (options) => ({
  headers: options.headers ?? {},
  link: options.link ?? new SiteLink()
});
var SKIP_COLUMNS = [
  "hits",
  "checked_out",
  "checked_out_time",
  "lastvisitDate",
  "lastResetTime",
  "resetCount",
  "last_execution",
  "next_execution",
  "times_executed",
  "times_failed",
  "last_exit_code",
  "locked",
  "last_check_timestamp"
];
async function takeFingerprint(endpoint, token, options = {}) {
  const site = siteCall(options);
  try {
    const { info } = await callPlugin(endpoint, token, "info", {}, site);
    const advertised = info?.site_fingerprint;
    if (!(Number(advertised?.version) >= 2)) return void 0;
    const pageSize = Math.max(1e3, Math.min(5e4, Math.floor(Number(advertised?.max_files) || 2e4)));
    const pages = [];
    let count = 0;
    let bytes = 0;
    let tables = null;
    let after = "";
    for (let page = 0; page < 1e3; page++) {
      const { fingerprint } = await withRetry(
        () => callPlugin(
          endpoint,
          token,
          "site.fingerprint",
          {
            after,
            limit: pageSize,
            checksums: page === 0,
            ...page === 0 ? { skip_columns: SKIP_COLUMNS } : {}
          },
          site
        )
      );
      if (page === 0) tables = fingerprint?.tables ?? null;
      const files = fingerprint?.files;
      if (!files || typeof files.digest !== "string") break;
      pages.push(files.digest);
      count += files.count ?? 0;
      bytes += files.bytes ?? 0;
      if (!files.next_after) break;
      after = files.next_after;
    }
    return { version: 1, pageSize, skip: SKIP_COLUMNS, files: { count, bytes, pages }, tables };
  } catch {
    return void 0;
  }
}
async function exportDatabase(endpoint, token, artifacts, onTable, options = {}) {
  const site = siteCall(options);
  const tableReply = await overloadAware(
    withRetry(() => callPlugin(endpoint, token, "db.tables", {}, site))
  );
  const prefix = options.platform === "wordpress" ? tableReply.base_prefix || tableReply.prefix : tableReply.prefix;
  let tables = tableReply.tables;
  if (prefix) {
    const wordpress = options.platform === "wordpress";
    const marker = wordpress ? ["options", "posts", "postmeta"] : ["extensions", "content", "menu", "assets"];
    const multisite = wordpress && (tableReply.prefix && tableReply.base_prefix && tableReply.prefix !== tableReply.base_prefix || tables.includes(`${prefix}blogs`));
    const candidates = [
      ...new Set(
        tables.flatMap(
          (table) => marker.filter((name2) => table.startsWith(prefix) && table.endsWith(name2)).map((name2) => table.slice(0, -name2.length))
        )
      )
    ].filter((candidate) => candidate.length > prefix.length && candidate.endsWith("_"));
    const otherPrefixes = candidates.filter((candidate) => {
      if (multisite && /^\d+_$/.test(candidate.slice(prefix.length))) return false;
      return marker.every((name2) => tables.includes(`${candidate}${name2}`));
    });
    tables = tables.filter(
      (table) => table.startsWith(prefix) && !otherPrefixes.some((other) => table.startsWith(other))
    );
  }
  const gzip = createGzip({ level: 9 });
  const compressed = [];
  gzip.on("data", (piece) => compressed.push(piece));
  const gzipped = new Promise((resolve, reject) => {
    gzip.on("end", resolve);
    gzip.on("error", reject);
  });
  let bytes = 0;
  let tablesDone = 0;
  const completedTables = /* @__PURE__ */ new Set();
  let limit = DB_CHUNK_LIMIT;
  if (options.dbDumpMany) {
    const advertisedMaxTables = Number(options.dbDumpMany.max_tables ?? 5e3);
    const maxTables = Number.isFinite(advertisedMaxTables) ? Math.max(1, Math.min(5e3, Math.floor(advertisedMaxTables))) : 5e3;
    for (let start = 0; start < tables.length; start += maxTables) {
      const tableBatch = tables.slice(start, start + maxTables);
      let cursor = null;
      const seenCursors = /* @__PURE__ */ new Set();
      let lastErrorCursor = null;
      for (; ; ) {
        const chunk = await overloadAware(
          withRetry(
            () => callPlugin(
              endpoint,
              token,
              "db.dump_many",
              {
                tables: tableBatch,
                cursor,
                limit
              },
              site
            ).catch((error) => {
              if (isSiteOverload(error)) limit = Math.max(MIN_DB_CHUNK_LIMIT, Math.floor(limit / 2));
              throw error;
            })
          )
        );
        const sql = Buffer.from(chunk.sql_b64, "base64");
        bytes += sql.length;
        gzip.write(sql);
        for (const progress of chunk.progress ?? []) {
          if (progress.done && !completedTables.has(progress.table)) {
            completedTables.add(progress.table);
            tablesDone += 1;
            onTable?.({
              tables: tables.length,
              table: progress.table,
              rows: progress.total,
              done: tablesDone
            });
          }
        }
        const previous = cursor;
        cursor = chunk.next_cursor;
        if (!chunk.done && !cursor) throw new ExportFailed("call_failed");
        if (cursor) {
          const key = `${cursor.table}:${cursor.row}`;
          const previousRow = Number(previous?.row);
          const nextRow = Number(cursor.row);
          const previousKey = previous ? `${previous.table}:${previous.row}` : null;
          const repeatedAtInput = previousKey === key;
          if (seenCursors.has(key) && !(chunk.stopped === "error" && repeatedAtInput) || previous && cursor.table < previous.table || previous && cursor.table === previous.table && Number.isFinite(previousRow) && Number.isFinite(nextRow) && nextRow < previousRow) {
            throw new ExportFailed("call_failed");
          }
          if (chunk.stopped === "error") {
            if (repeatedAtInput && lastErrorCursor === key) throw new ExportFailed("call_failed");
            lastErrorCursor = key;
          } else {
            lastErrorCursor = null;
          }
          seenCursors.add(key);
        }
        if (chunk.done || !cursor) break;
      }
    }
  } else
    for (const table of tables) {
      let cursor = null;
      let offset = 0;
      let byOffset = false;
      let rows = 0;
      for (; ; ) {
        const chunk = await overloadAware(
          withRetry(
            () => callPlugin(
              endpoint,
              token,
              "db.dump",
              {
                table,
                limit,
                ...byOffset ? { offset } : { cursor: cursor ?? "" }
              },
              site
            ).catch((error) => {
              if (isSiteOverload(error)) limit = Math.max(MIN_DB_CHUNK_LIMIT, Math.floor(limit / 2));
              throw error;
            })
          )
        );
        const sql = Buffer.from(chunk.sql_b64, "base64");
        bytes += sql.length;
        gzip.write(sql);
        if (typeof chunk.next_cursor === "string") {
          cursor = chunk.next_cursor;
        } else {
          byOffset = true;
          offset = chunk.next_offset ?? offset + chunk.rows;
        }
        rows = chunk.total;
        if (chunk.done) break;
      }
      tablesDone += 1;
      onTable?.({ tables: tables.length, table, rows, done: tablesDone });
    }
  gzip.end();
  await gzipped;
  const gz = Buffer.concat(compressed);
  const signed = await artifacts.signPut("db");
  const put = await fetch(signed.url, {
    method: "PUT",
    body: new Uint8Array(gz),
    headers: { "content-type": "application/gzip" }
  });
  if (!put.ok) throw new ExportFailed("store_refused");
  return { key: signed.key, tables: tables.length, bytes };
}
async function exportFiles(endpoint, token, artifacts, siteKey, onPart, options = {}) {
  const stale = await staleUpload(siteKey);
  if (stale) {
    await artifacts.abandon(stale.key, stale.uploadId);
    await forgetUpload(siteKey);
  }
  const held = await heldUpload(siteKey);
  const site = siteCall(options);
  const { key, uploadId } = held ?? await artifacts.begin("webroot");
  const parts = held ? [...held.parts] : [];
  let path10 = held?.cursor.path ?? "";
  let offset = held?.cursor.offset ?? 0;
  let declaredSize = held?.cursor.size ?? 0;
  let files = held?.files ?? 0;
  let bytes = held?.bytes ?? 0;
  const startedAt = held?.startedAt ?? Date.now();
  let inline = options.inline === true;
  const targetBytes = TARGET_PART_BYTES;
  let nextPart = Math.max(held?.nextPart ?? 1, ...parts.map((part) => part.PartNumber + 1));
  const saveCursor = () => rememberUpload(siteKey, {
    key,
    uploadId,
    parts,
    nextPart,
    cursor: { path: path10, offset, size: declaredSize },
    files,
    bytes,
    startedAt
  });
  const total = await siteBytes(endpoint, token, site);
  const runStarted = Date.now();
  const bytesBefore = bytes;
  let partStartedAt = runStarted;
  const progress = (extra = {}) => {
    const seconds = (Date.now() - runStarted) / 1e3;
    return {
      files,
      bytes,
      parts: parts.length,
      partStartedAt,
      ...total !== void 0 ? { total } : {},
      ...seconds >= 1 && bytes > bytesBefore ? { rate: Math.round((bytes - bytesBefore) / seconds) } : {},
      ...extra
    };
  };
  for (; ; ) {
    partStartedAt = Date.now();
    onPart?.(progress());
    let partNumber = nextPart;
    const packed = await overloadAware(
      withPartRetry(
        async () => {
          partNumber = nextPart;
          if (partNumber > MAX_PARTS) {
            await artifacts.abandon(key, uploadId);
            await forgetUpload(siteKey);
            throw new ExportFailed("too_many_parts");
          }
          const putUrl = await artifacts.signPart(key, uploadId, partNumber);
          nextPart = partNumber + 1;
          await saveCursor();
          const asked = { inline, targetBytes, partNumber };
          try {
            return await packPart(putUrl, asked);
          } catch (error) {
            if (isSlowPart(error)) inline = true;
            throw error;
          }
        },
        (attempt) => onPart?.(progress({ retrying: attempt }))
      )
    );
    parts.push({ PartNumber: partNumber, ETag: packed.etag });
    files += packed.files;
    bytes += packed.bytes;
    path10 = packed.next_path;
    offset = packed.next_offset;
    declaredSize = packed.next_size ?? 0;
    onPart?.(progress());
    await saveCursor();
    if (packed.done) break;
  }
  await artifacts.finish(key, uploadId, parts);
  await forgetUpload(siteKey);
  return { key, files, bytes, parts: parts.length };
  async function packPart(putUrl, asked) {
    const timeoutMs = packTimeoutMs(asked.inline, asked.targetBytes);
    if (!asked.inline) {
      return callPlugin(
        endpoint,
        token,
        "files.pack",
        {
          put_url: putUrl,
          target_bytes: asked.targetBytes,
          path: path10,
          offset,
          size: declaredSize
        },
        site,
        timeoutMs
      );
    }
    const packed = await callPlugin(
      endpoint,
      token,
      "files.pack",
      {
        inline: true,
        target_bytes: asked.targetBytes,
        path: path10,
        offset,
        size: declaredSize
      },
      site,
      timeoutMs
    );
    if (typeof packed.part_b64 !== "string") throw new ExportFailed("call_failed");
    const body = Buffer.from(packed.part_b64, "base64");
    const put = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(body)
    });
    if (!put.ok) {
      if (put.status === 429 || put.status >= 500)
        throw relayedTransportError(`part ${asked.partNumber}: HTTP ${put.status}`);
      throw new ExportFailed("store_refused");
    }
    const etag = etagOf(put);
    if (!etag) throw new ExportFailed("store_refused");
    return { ...packed, etag, part_b64: null };
  }
}
var MAX_FINGERPRINT_PAGES = 20;
async function siteBytes(endpoint, token, site) {
  let bytes = 0;
  let after = "";
  try {
    for (let page = 0; page < MAX_FINGERPRINT_PAGES; page++) {
      const answer = await callPlugin(
        endpoint,
        token,
        "site.fingerprint",
        { after, limit: 2e4, checksums: false },
        site
      );
      const files = answer.fingerprint?.files;
      if (!files || typeof files.bytes !== "number" || !Number.isFinite(files.bytes)) return void 0;
      bytes += files.bytes;
      if (typeof files.next_after !== "string" || files.next_after === "")
        return bytes > 0 ? bytes : void 0;
      after = files.next_after;
    }
  } catch {
  }
  return void 0;
}

// src/host/fleet-handover.ts
import { mkdir as mkdir3, readdir as readdir2, readFile as readFile3, unlink as unlink3 } from "node:fs/promises";
import path6 from "node:path";

// src/host/handover.ts
import path5 from "node:path";
var FRESH_MS = 2 * 60 * 6e4;
function bookPath2() {
  const home2 = process.env.DSH_HOME ?? process.cwd();
  return path5.join(home2, "tracy-add-site", "handovers.json");
}
function isFresh2(read, now, freshMs = FRESH_MS) {
  return now - read.finishedAt < freshMs;
}
async function heldHandover(siteKey) {
  const held = (await readBook(bookPath2()))[siteKey];
  if (!held?.result || held.finishedAt === void 0) return void 0;
  const read = { result: held.result, finishedAt: held.finishedAt };
  return isFresh2(read, Date.now()) ? read : void 0;
}
async function takeOrSweep(siteKey, remove) {
  const fresh = await heldHandover(siteKey);
  if (fresh) return fresh;
  const file = bookPath2();
  const entry = (await readBook(file))[siteKey];
  if (!entry) return void 0;
  const leftovers = [entry.pending?.dbKey, entry.result?.dbKey, entry.result?.webrootKey].filter(
    (key) => typeof key === "string" && key !== ""
  );
  const swept = JSON.stringify(entry);
  for (const key of leftovers) await remove(key);
  await updateBook(file, (book) => {
    if (JSON.stringify(book[siteKey]) !== swept) return false;
    delete book[siteKey];
  });
  return void 0;
}
async function rememberPartial(siteKey, dbKey) {
  await updateBook(bookPath2(), (book) => {
    book[siteKey] = { pending: { dbKey } };
  });
}
async function rememberHandover(siteKey, result) {
  await updateBook(bookPath2(), (book) => {
    book[siteKey] = { result, finishedAt: Date.now() };
  });
}
async function handoverKeys(siteKey) {
  const entry = (await readBook(bookPath2()))[siteKey];
  if (!entry) return [];
  return [entry.pending?.dbKey, entry.result?.dbKey, entry.result?.webrootKey].filter(
    (key) => typeof key === "string" && key !== ""
  );
}
async function forgetHandover(siteKey) {
  await updateBook(bookPath2(), (book) => {
    if (!(siteKey in book)) return false;
    delete book[siteKey];
  });
}

// src/host/fleet-handover.ts
var TAKEN_ATTEMPTS = 3;
var TAKEN_PAUSE_MS = 3e3;
var directory2 = () => path6.join(process.env.DSH_HOME ?? process.cwd(), "tracy-add-site", "fleet-handovers");
var SAFE_RUN_ID = /^[a-z0-9]{10,32}$/;
async function queueFleetHandover(notice) {
  if (!SAFE_RUN_ID.test(notice.runId)) throw new Error("unsafe run id");
  const dir = directory2();
  await mkdir3(dir, { recursive: true, mode: 448 });
  await writeAtomic(path6.join(dir, `${notice.runId}.json`), JSON.stringify(notice), 384);
}
async function fileProvision(notice, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(
      new URL(`/api/sites/${encodeURIComponent(notice.siteKey)}/provision`, notice.origin),
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", cookie: notice.cookie },
        body: JSON.stringify({ platform: notice.platform, ...notice.result }),
        // The door signs the store's URLs and asks the host to start: seconds, not minutes.
        signal: AbortSignal.timeout(6e4),
        redirect: "error"
      }
    );
  } catch {
    return "retry";
  }
  const body = await response.json().catch(() => null);
  if (response.status === 202 && typeof body?.jobId === "string" && body.jobId)
    return { state: "filed", jobId: body.jobId };
  const code = typeof body?.code === "string" && /^[A-Z0-9_]{1,40}$/.test(body.code) ? body.code : null;
  if (response.status === 409 && code === "TAKEN") return "taken";
  if (response.status >= 500 || response.status === 429) return "retry";
  return { state: "refused", code: code ?? `HTTP_${response.status}` };
}
async function forgetFleetHandovers(siteKey) {
  const dir = directory2();
  for (const name2 of await readdir2(dir).catch(() => [])) {
    const file = path6.join(dir, name2);
    const notice = await readFile3(file, "utf8").then((text2) => JSON.parse(text2)).catch(() => null);
    if (notice?.siteKey === siteKey) await unlink3(file).catch(() => void 0);
  }
}
var draining3 = null;
var again = false;
function flushFleetHandovers(settled, { fetchImpl = fetch, now = Date.now, pauseMs = TAKEN_PAUSE_MS } = {}) {
  if (draining3) {
    again = true;
    return draining3;
  }
  draining3 = (async () => {
    do {
      again = false;
      await flushOnce(settled, { fetchImpl, now, pauseMs });
    } while (again);
  })().finally(() => {
    draining3 = null;
  });
  return draining3;
}
async function flushOnce(settled, { fetchImpl, now, pauseMs }) {
  const dir = directory2();
  const files = await readdir2(dir).catch(() => []);
  for (const name2 of files.filter((f) => /^[a-z0-9]{10,32}\.json$/.test(f))) {
    const file = path6.join(dir, name2);
    try {
      const notice = JSON.parse(await readFile3(file, "utf8"));
      if (!isFresh2({ result: notice.result, finishedAt: notice.finishedAt }, now())) {
        await unlink3(file);
        await settled(notice.runId, { state: "refused", code: "HANDOVER_EXPIRED" });
        continue;
      }
      let outcome = await fileProvision(notice, fetchImpl);
      for (let attempt = 1; outcome === "taken" && attempt < TAKEN_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
        outcome = await fileProvision(notice, fetchImpl);
      }
      if (outcome === "retry") continue;
      await unlink3(file);
      await settled(notice.runId, outcome === "taken" ? { state: "refused", code: "TAKEN" } : outcome);
    } catch {
      console.warn("[tracy-add-site] a handover to the fleet will be retried");
    }
  }
}

// src/host/hold.ts
import { createHash as createHash3, createHmac, timingSafeEqual } from "node:crypto";
import path7 from "node:path";
var HOLD_TTL_MS = 15 * 6e4;
var holds = /* @__PURE__ */ new Map();
function holdBookPath() {
  return path7.join(process.env.DSH_HOME ?? process.cwd(), "tracy-add-site", "holds.json");
}
var restored;
function restoreHolds() {
  restored ??= (async () => {
    const book = await readBook(holdBookPath());
    for (const [siteKey, entry] of Object.entries(book))
      if (typeof entry?.heldAt === "number" && !holds.has(siteKey)) holds.set(siteKey, entry.heldAt);
  })().catch(
    (error) => console.warn(
      `[tracy-add-site] could not read site holds: ${error instanceof Error ? error.message : String(error)}`
    )
  );
  return restored;
}
function isHeld(siteKey, now = Date.now()) {
  const heldAt = holds.get(siteKey);
  return heldAt !== void 0 && now - heldAt < HOLD_TTL_MS;
}
async function holdSite(siteKey, now = Date.now()) {
  holds.set(siteKey, now);
  await updateBook(holdBookPath(), (book) => {
    book[siteKey] = { heldAt: now };
  });
}
async function releaseSite(siteKey) {
  holds.delete(siteKey);
  await updateBook(holdBookPath(), (book) => {
    if (!(siteKey in book)) return false;
    delete book[siteKey];
  });
}
var SiteHeld = class extends Error {
  constructor(siteKey) {
    super(`import of ${siteKey} is being removed`);
    this.siteKey = siteKey;
  }
};
var FRESHNESS_MS = 6e4;
var NONCE_MEMORY_MS = 12e4;
var spent = /* @__PURE__ */ new Map();
function signedByTracy(input) {
  const now = input.now ?? Date.now();
  if (!input.secret || !input.timestamp || !input.nonce || !input.signature) return false;
  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > FRESHNESS_MS) return false;
  const bodyHash = createHash3("sha256").update(input.body).digest("hex");
  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}
${input.nonce}
POST
${input.path}
${bodyHash}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  for (const [nonce, expiresAt] of spent) if (expiresAt <= now) spent.delete(nonce);
  if (spent.has(input.nonce)) return false;
  spent.set(input.nonce, now + NONCE_MEMORY_MS);
  return true;
}

// src/host/tokens.ts
import path8 from "node:path";
function bookPath3() {
  const home2 = process.env.DSH_HOME ?? process.cwd();
  return path8.join(home2, "tracy-add-site", "site-tokens.json");
}
async function rememberedToken(siteKey) {
  const book = await readBook(bookPath3());
  return book[siteKey];
}
async function rememberToken(siteKey, entry) {
  await updateBook(bookPath3(), (book) => {
    book[siteKey] = { ...entry, savedAt: Date.now() };
  });
}
async function forgetToken(siteKey) {
  await updateBook(bookPath3(), (book) => {
    if (!(siteKey in book)) return false;
    delete book[siteKey];
  });
}

// src/host/webroot.mjs
var USER_AGENT2 = "Tracy/1.0 (+https://tracy.ai)";
var MAX_HOPS = 5;
var TIMEOUT_MS2 = 15e3;
var trimRoot = (url) => url.replace(/\/+$/, "");
var pathOf = (url) => url.pathname.replace(/\/+$/, "");
async function resolveWebRoot(webRootUrl, fetchImpl = fetch, headers = {}) {
  const anchor = `${trimRoot(webRootUrl)}/`;
  const anchorOrigin = new URL(anchor).origin;
  let current = new URL(anchor);
  let secure = current.protocol === "https:";
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let response;
    try {
      response = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        // Keep caller credentials on the origin the customer supplied. An http→https hop changes
        // origin even on the same host, so it must not carry Authorization either.
        headers: {
          ...current.origin === anchorOrigin ? headers : {},
          "user-agent": USER_AGENT2
        },
        signal: AbortSignal.timeout(TIMEOUT_MS2)
      });
    } catch {
      break;
    }
    if (current.protocol === "https:") secure = true;
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) break;
    const resolved = nextRedirectUrl(current.toString(), location);
    if (!resolved) break;
    let next;
    try {
      next = new URL(resolved);
    } catch {
      break;
    }
    if (!isTrustedHop(anchor, resolved, { secure })) break;
    if (pathOf(next) !== pathOf(current)) break;
    current = next;
  }
  return trimRoot(`${current.origin}${current.pathname}`);
}

// src/host/wordpress.ts
var REQUEST_TIMEOUT_MS3 = 6e4;
var MAX_HTML_BYTES2 = 4 * 1024 * 1024;
var MAX_PACKAGE_BYTES2 = 8 * 1024 * 1024;
var LOGGED_IN_COOKIE = /^wordpress_logged_in_/;
var NONCE_FIELD = /name="_wpnonce"[^>]*value="([a-z0-9]+)"/i;
var TOKEN_VALUE2 = /id="claude_cowork_token"[\s\S]{0,200}?value="([A-Za-z0-9]{16,})"/i;
var NOT_ALLOWED = /not allowed to access this page/i;
var LOGIN_FORM = /<form\b[^>]*\bid=["']loginform["']/i;
var SETTINGS_PAGE = "claude-cowork";
var MFA_STEP = /name=["']wp-auth-(?:id|nonce)["']|action=validate_2fa|wfls-token|wfls_twofactor|name=["']mo2f_/i;
var LOGIN_ERROR = /<div[^>]*\bid=["']login_error["'][^>]*>([\s\S]*?)<\/div>/i;
var WRONG_PASSWORD = /password you entered|is not registered on this site|unknown (?:username|email address)/i;
var CAPTCHA_ERROR = /captcha|turnstile|\bhuman\b|\brobot\b/i;
var LOCKED_OUT = /too many (?:failed |invalid )?(?:login |sign-in )?(?:attempts|retries)|(?:been|is|are) (?:temporarily )?locked out|exceeded (?:the )?maximum (?:number of )?(?:login|sign-in) (?:attempts|retries)/i;
var FS_CREDENTIALS_FORM = /id=["']request-filesystem-credentials-form["']|name=["']connection_type["']/i;
function apiEndpoint(webRootUrl) {
  return `${webRootUrl}/wp-admin/admin-ajax.php?action=claude_cowork`;
}
var timeout2 = (ms = REQUEST_TIMEOUT_MS3) => AbortSignal.timeout(ms);
async function readCappedBody2(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.length;
    if (size > MAX_HTML_BYTES2) {
      await reader.cancel().catch(() => void 0);
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function drainBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || size >= MAX_HTML_BYTES2) continue;
    size += value.length;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
var CookieJar2 = class {
  jar = /* @__PURE__ */ new Map();
  /**
   * Keyed by name only, on purpose: the flow talks to one site. A Set-Cookie that deletes or expires
   * a name removes it, whatever its Path, because WordPress signs in and then clears the same auth
   * cookies in one response (a `reauth=1` login, #556); keeping the valid copy would read as signed in.
   */
  absorb(response) {
    const now = Date.now();
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name2 = pair.slice(0, eq).trim();
      if (!COOKIE_NAME2.test(name2)) continue;
      const value = pair.slice(eq + 1).trim();
      const expiresAt = expiryOf2(attributes, now);
      if (isDeletionValue(value) || expiresAt <= now) {
        this.jar.delete(name2);
        continue;
      }
      this.jar.set(name2, { pair: `${name2}=${value}`, expiresAt });
    }
  }
  /** True only for a cookie still live now, never for one that was deleted or has since expired. */
  has(pattern) {
    for (const name2 of this.live().keys()) if (pattern.test(name2)) return true;
    return false;
  }
  get header() {
    return [...this.live().values()].join("; ");
  }
  live() {
    const now = Date.now();
    const live = /* @__PURE__ */ new Map();
    for (const [name2, cookie] of this.jar) {
      if (cookie.expiresAt > now) live.set(name2, cookie.pair);
      else this.jar.delete(name2);
    }
    return live;
  }
};
var COOKIE_NAME2 = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
function isDeletionValue(value) {
  if (value === "deleted") return true;
  let decoded = value.replace(/\+/g, " ");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
  }
  return decoded.trim() === "";
}
function expiryOf2(attributes, now) {
  let maxAge;
  let expires;
  for (const attribute of attributes) {
    const eq = attribute.indexOf("=");
    const key = (eq < 0 ? attribute : attribute.slice(0, eq)).trim().toLowerCase();
    const value = eq < 0 ? "" : attribute.slice(eq + 1).trim();
    if (key === "max-age") maxAge = value;
    else if (key === "expires") expires = value;
  }
  if (maxAge !== void 0) {
    if (!/^-?\d+$/.test(maxAge)) return Number.NEGATIVE_INFINITY;
    const seconds = Number(maxAge);
    return seconds <= 0 ? Number.NEGATIVE_INFINITY : now + seconds * 1e3;
  }
  if (expires !== void 0) {
    const at = Date.parse(expires);
    return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
  }
  return Number.POSITIVE_INFINITY;
}
function basicAuthHeader2(basicAuth) {
  if (!basicAuth) return {};
  const encoded = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString("base64");
  return { authorization: `Basic ${encoded}` };
}
function isBasicAuthChallenge2(response) {
  return response.status === 401 && /^basic\b/i.test(response.headers.get("www-authenticate") ?? "");
}
function isHttps2(url) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
async function disposeBody2(response) {
  try {
    await response.body?.cancel();
  } catch {
  }
}
async function followRedirects(startUrl, jar, authHeader, opts = {}) {
  const anchor = opts.anchor ?? startUrl;
  const maxRedirects = opts.maxRedirects ?? 5;
  let url = startUrl;
  let secure = opts.secure === true || isHttps2(anchor) || isHttps2(startUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isTrustedHop(anchor, url, { secure })) throw new Error("untrusted redirect target");
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        ...authHeader,
        ...jar.header ? { cookie: jar.header } : {}
      },
      signal: timeout2()
    });
    if (isHttps2(url)) secure = true;
    opts.visited?.push(url);
    jar.absorb(response);
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) return response;
    const next = nextRedirectUrl(url, location);
    if (!next) return response;
    await disposeBody2(response);
    url = next;
  }
  throw new Error("too many redirects");
}
function webRootFrom2(loginUrl) {
  const url = new URL(loginUrl);
  return `${url.origin}${url.pathname.replace(/\/wp-login\.php$/i, "")}`;
}
function withoutReauth(loginUrl) {
  let url;
  try {
    url = new URL(loginUrl);
  } catch {
    return loginUrl;
  }
  if (!url.searchParams.has("reauth")) return loginUrl;
  const kept = url.search.slice(1).split("&").filter((pair) => queryName(pair) !== "reauth");
  url.search = kept.length > 0 ? `?${kept.join("&")}` : "";
  return url.href;
}
function queryName(pair) {
  const eq = pair.indexOf("=");
  const raw = (eq < 0 ? pair : pair.slice(0, eq)).replace(/\+/g, " ");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
var MAX_WEB_ROOT_GUESSES = 4;
function webRootCandidates(html, resolvedLoginUrl) {
  let page;
  try {
    page = new URL(resolvedLoginUrl);
  } catch {
    return [];
  }
  const paths = [];
  const add = (path10) => {
    if (!paths.includes(path10)) paths.push(path10);
  };
  const pathOf2 = (raw) => {
    try {
      const url = new URL(raw.replace(/&amp;/g, "&"), page);
      return url.hostname === page.hostname ? url.pathname.replace(/\/+$/, "") : null;
    } catch {
      return null;
    }
  };
  const form = /<form\b[^>]*\bid=["']loginform["'][^>]*>/i.exec(html)?.[0] ?? "";
  const action = /\baction=["']([^"']+)["']/i.exec(form)?.[1];
  for (const path10 of [action ? pathOf2(action) : null, page.pathname]) {
    const root = path10 ? /^(.*)\/wp-login\.php$/i.exec(path10) : null;
    if (root) add(root[1]);
  }
  const assets = [];
  for (const [, base] of html.matchAll(
    /(?:href|src)=["']([^"']*?)\/(?:wp-admin\/(?:load-styles\.php|css\/)|wp-includes\/)/gi
  )) {
    const path10 = pathOf2(`${base}/`);
    if (path10 !== null && !assets.includes(path10)) assets.push(path10);
  }
  const under = (path10) => page.pathname.startsWith(`${path10}/`);
  for (const path10 of assets.filter(under).sort((a, b) => b.length - a.length)) add(path10);
  for (const path10 of assets) add(path10);
  const segments = page.pathname.replace(/\/+$/, "").split("/");
  for (let depth = segments.length - 1; depth > 1; depth--) add(segments.slice(0, depth).join("/"));
  const guesses = paths.filter((path10) => path10 !== "").slice(0, MAX_WEB_ROOT_GUESSES - 1);
  return [...guesses, ""].map((path10) => `${page.origin}${path10}`);
}
function webRootOf(visited, resolvedLoginUrl, loginHtml = "") {
  const redirected = visited.slice(0, -1);
  for (let i = redirected.length - 1; i >= 0; i--) {
    let hop;
    try {
      hop = new URL(redirected[i]);
    } catch {
      continue;
    }
    const admin = /^(.*)\/wp-admin\/?$/i.exec(hop.pathname);
    if (admin) return [`${new URL(resolvedLoginUrl).origin}${admin[1]}`];
  }
  return webRootCandidates(loginHtml, resolvedLoginUrl);
}
function webRootFromAuthCookie(response, origin) {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair, ...attributes] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const value = pair.slice(eq + 1).trim();
    if (!/^wordpress_(?:sec_)?[0-9a-f]+$/i.test(pair.slice(0, eq).trim())) continue;
    if (value === "" || value === "+" || value === "deleted") continue;
    const path10 = attributes.map((attribute) => attribute.trim()).find((attribute) => /^path=/i.test(attribute))?.slice(5);
    const root = path10 ? /^(.*)\/wp-admin\/?$/i.exec(path10) : null;
    if (root) return `${origin}${root[1]}`;
  }
  return null;
}
function loginRefusalOf(loginHtml, postedHtml) {
  if (MFA_STEP.test(postedHtml)) return "mfa_required";
  if (LOCKED_OUT.test(postedHtml) || LOCKED_OUT.test(loginHtml)) return "login_locked_out";
  const error = LOGIN_ERROR.exec(postedHtml)?.[1] ?? "";
  if (WRONG_PASSWORD.test(error)) return "invalid_credential";
  if (CAPTCHA_ERROR.test(error)) return "captcha_required";
  return "message_unread";
}
async function installAccessOf(adminUrl, jar, authHeader, secure) {
  try {
    const response = await followRedirects(`${adminUrl}/plugin-install.php?tab=upload`, jar, authHeader, {
      anchor: adminUrl,
      secure
    });
    const html = await readCappedBody2(response);
    const firewall = firewallOf(response.status, response.headers, html);
    if (firewall) return { firewall };
    if (!response.ok) return response.status === 403 ? "no_backend_access" : "unreachable";
    if (NOT_ALLOWED.test(html)) return "no_backend_access";
    if (LOGIN_FORM.test(html)) return "signed_out";
    if (!NONCE_FIELD.test(html)) return "installs_disabled";
    return "ok";
  } catch {
    return "unreachable";
  }
}
async function loginToAdmin2(loginUrl, username, password, basicAuth) {
  const authHeader = basicAuthHeader2(basicAuth);
  const jar = new CookieJar2();
  let resolvedLoginUrl = loginUrl;
  let loginHtml = "";
  const visited = [];
  try {
    const page = await followRedirects(loginUrl, jar, authHeader, { anchor: loginUrl, visited });
    if (isBasicAuthChallenge2(page)) {
      return { ok: false, reason: basicAuth ? "basic_auth_invalid" : "basic_auth_required" };
    }
    loginHtml = await readCappedBody2(page);
    const firewall2 = firewallOf(page.status, page.headers, loginHtml, { generic: true });
    if (firewall2) return { ok: false, reason: "blocked_by_firewall", firewall: firewall2 };
    if (!page.ok) return { ok: false, reason: "unreachable" };
    resolvedLoginUrl = page.url || loginUrl;
  } catch (error) {
    const connection = connectionFailure(error);
    return {
      ok: false,
      reason: "unreachable",
      ...connection ? { connection } : {},
      detail: { at: "login_page", check: "network", error: diagnosticError(error) }
    };
  }
  const guesses = webRootOf(visited, resolvedLoginUrl, loginHtml);
  const adminUrl = `${guesses[0]}/wp-admin`;
  const postUrl = withoutReauth(resolvedLoginUrl);
  if (!isTrustedHop(loginUrl, postUrl, { secure: isHttps2(loginUrl) })) {
    return { ok: false, reason: "unreachable" };
  }
  let posted;
  try {
    posted = await fetch(postUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        "content-type": "application/x-www-form-urlencoded",
        cookie: jar.header,
        ...authHeader
      },
      body: new URLSearchParams({
        log: username,
        pwd: password,
        "wp-submit": "Log In",
        redirect_to: `${adminUrl}/`,
        testcookie: "1"
      }),
      signal: timeout2()
    });
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      detail: { at: "login_post", check: "network", error: diagnosticError(error) }
    };
  }
  jar.absorb(posted);
  const postedHtml = posted.status >= 300 && posted.status < 400 ? "" : await readCappedBody2(posted).catch(() => "");
  const firewall = firewallOf(posted.status, posted.headers, postedHtml, { generic: true });
  if (firewall) return { ok: false, reason: "blocked_by_firewall", firewall };
  if (!jar.has(LOGGED_IN_COOKIE)) {
    const refusal = loginRefusalOf(loginHtml, postedHtml);
    return refusal === "message_unread" ? { ok: false, reason: "invalid_credential", detail: { at: "login_post", check: "message_unread" } } : { ok: false, reason: refusal };
  }
  const cookieRoot = webRootFromAuthCookie(posted, new URL(postUrl).origin);
  const roots = cookieRoot ? [cookieRoot] : guesses;
  let firstMiss;
  for (const webRootUrl of roots) {
    const rootAdminUrl = `${webRootUrl}/wp-admin`;
    const access = await installAccessOf(rootAdminUrl, jar, authHeader, isHttps2(resolvedLoginUrl));
    if (typeof access === "object")
      return { ok: false, reason: "blocked_by_firewall", firewall: access.firewall };
    if (access === "ok")
      return { ok: true, cookie: jar.header, authHeader, webRootUrl, adminUrl: rootAdminUrl };
    if (access === "unreachable" || access === "signed_out") {
      firstMiss ??= access;
      continue;
    }
    return { ok: false, reason: access };
  }
  return { ok: false, reason: firstMiss === "signed_out" ? "installs_disabled" : "unreachable" };
}
function authedFetcher2(session) {
  let cookie = session.cookie;
  return async (url, init = {}) => {
    const response = await fetch(url, {
      ...init,
      redirect: init.redirect ?? "follow",
      headers: {
        "user-agent": USER_AGENT,
        cookie,
        ...session.authHeader,
        ...init.headers
      }
    });
    const set = response.headers.getSetCookie?.() ?? [];
    if (set.length > 0) cookie = [cookie, ...set.map((one) => one.split(";")[0])].filter(Boolean).join("; ");
    return response;
  };
}
var WP_DIE_PAGE = /<body[^>]*\bid=["']error-page["']|class=["'][^"']*\bwp-die-message\b/i;
function uploadRefusal(posted, html, uploadUrl, base) {
  if (posted.status !== 413 && posted.status !== 403) return null;
  const path10 = diagnosticPath(posted.url || uploadUrl, base);
  const detail = (check) => ({
    at: "upload_install",
    check,
    status: posted.status,
    ...path10 ? { path: path10 } : {}
  });
  if (posted.status === 413)
    return { stop: { ok: false, reason: "upload_too_large", detail: detail("too_large") } };
  const named = firewallOf(posted.status, posted.headers, html);
  if (!named && WP_DIE_PAGE.test(html))
    return { stop: { ok: false, reason: "install_failed", detail: detail("forbidden") } };
  return {
    stop: {
      ok: false,
      reason: "blocked_by_firewall",
      firewall: named ?? "firewall",
      detail: detail("server_denied")
    }
  };
}
function blockerIn(response, html) {
  const firewall = firewallOf(response.status, response.headers, html);
  if (firewall) return { firewall };
  if (FS_CREDENTIALS_FORM.test(html)) return "fs_credentials_required";
  return null;
}
function presenceIn(html) {
  if (/href="[^"]*action=deactivate[^"]*claude-cowork/i.test(html)) return "active";
  if (/href="[^"]*action=activate[^"]*claude-cowork/i.test(html)) return "inactive";
  return "absent";
}
async function readSiteInfo2(webRootUrl, token, opts = {}) {
  try {
    await opts.link?.ready();
    const response = await fetch(apiEndpoint(webRootUrl), {
      method: "POST",
      // When verifying an https endpoint the token must not be replayed to a redirect target: a
      // 3xx here (an https endpoint 307ing to http or to another host) is refused, not followed.
      redirect: opts.noFollow ? "manual" : "follow",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify({ token, action: "info" }),
      signal: timeout2(3e4)
    });
    opts.link?.answeredWith(
      response.status === 429 || response.status === 503 ? retryAfterMs(response.headers.get("retry-after")) : void 0
    );
    if (opts.noFollow && !response.ok) {
      await response.body?.cancel();
      return { ok: false };
    }
    const text2 = await readCappedBody2(response);
    const firewall = firewallOf(response.status, response.headers, text2, { generic: true });
    if (firewall) return { ok: false, firewall };
    const result = JSON.parse(text2);
    const version = result?.info?.component ?? result?.info?.plugin ?? result?.info?.version ?? result?.plugin ?? result?.version;
    return {
      ok: result?.ok === true,
      version,
      ...result?.info?.db_dump_many && typeof result.info.db_dump_many === "object" ? { dbDumpMany: result.info.db_dump_many } : {}
    };
  } catch (error) {
    opts.link?.failed(error);
    return { ok: false };
  }
}
async function upgradeInPlace(fetchAuthed, admin) {
  try {
    const checked = await fetchAuthed(`${admin}/update-core.php?force-check=1`);
    const checkedBlocker = blockerIn(checked, await readCappedBody2(checked));
    if (checkedBlocker) return checkedBlocker;
    const plugins = await fetchAuthed(`${admin}/plugins.php`);
    const html = await readCappedBody2(plugins);
    const pluginsBlocker = blockerIn(plugins, html);
    if (pluginsBlocker) return pluginsBlocker;
    if (!plugins.ok) return "failed";
    const link = html.match(/href="([^"]*action=upgrade-plugin[^"]*claude-cowork[^"]*)"/i)?.[1]?.replace(/&amp;/g, "&");
    if (!link) return "failed";
    const taken = await fetchAuthed(new URL(link, `${admin}/`).toString());
    const page = await drainBody(taken);
    return blockerIn(taken, page) ?? (taken.ok ? "ok" : "failed");
  } catch {
    return "failed";
  }
}
async function uploadPackage(fetchAuthed, admin, packageUrl, wasPresent, webRootUrl) {
  try {
    const form = await fetchAuthed(`${admin}/plugin-install.php?tab=upload`);
    const formHtml = await readCappedBody2(form);
    if (!form.ok) return blockerIn(form, formHtml) ?? "failed";
    const nonce = formHtml.match(NONCE_FIELD)?.[1];
    if (!nonce) return "failed";
    const download = await fetch(packageUrl, { headers: { "user-agent": USER_AGENT }, signal: timeout2() });
    if (!download.ok) return "failed";
    const bytes = await download.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PACKAGE_BYTES2) return "failed";
    const body = new FormData();
    body.append("_wpnonce", nonce);
    body.append("_wp_http_referer", "/wp-admin/plugin-install.php?tab=upload");
    body.append("pluginzip", new Blob([bytes], { type: "application/zip" }), "claude-cowork.zip");
    body.append("install-plugin-submit", "Install Now");
    const uploadUrl = `${admin}/update.php?action=upload-plugin`;
    const posted = await fetchAuthed(uploadUrl, { method: "POST", body });
    const html = await drainBody(posted);
    const refused = uploadRefusal(posted, html, uploadUrl, webRootUrl);
    if (refused) return refused;
    const blocked = blockerIn(posted, html);
    if (blocked) return blocked;
    const replace = html.match(/href="([^"]*overwrite=update-plugin[^"]*)"/i)?.[1]?.replace(/&amp;/g, "&");
    if (!replace && wasPresent) return "failed";
    if (replace) {
      const replaced = await fetchAuthed(new URL(replace, `${admin}/`).toString());
      const replacedHtml = await drainBody(replaced);
      const stopped = blockerIn(replaced, replacedHtml);
      if (stopped) return stopped;
      if (!replaced.ok) return "failed";
    }
    const after = await fetchAuthed(`${admin}/plugins.php`);
    const afterHtml = await readCappedBody2(after);
    const afterBlocker = blockerIn(after, afterHtml);
    if (afterBlocker) return afterBlocker;
    if (!after.ok) return "failed";
    return presenceIn(afterHtml) !== "absent" ? "ok" : "failed";
  } catch {
    return "failed";
  }
}
async function installCowork2(session, packageUrl, latestVersion, existingToken, options = {}) {
  const fetchAuthed = authedFetcher2(session);
  const admin = session.adminUrl;
  const readInstalledToken = async () => {
    try {
      const page = await fetchAuthed(`${admin}/options-general.php?page=${SETTINGS_PAGE}`);
      const html = await readCappedBody2(page);
      const firewall2 = firewallOf(page.status, page.headers, html);
      if (firewall2) return { firewall: firewall2 };
      if (!page.ok) return {};
      return { token: html.match(TOKEN_VALUE2)?.[1] };
    } catch {
      return {};
    }
  };
  const blocked = (firewall2) => ({
    ok: false,
    reason: "blocked_by_firewall",
    firewall: firewall2
  });
  if (existingToken) {
    const alive = await readSiteInfo2(session.webRootUrl, existingToken, { link: options.link });
    if (alive.ok && !needsInstall(alive.version, latestVersion)) {
      return {
        ok: true,
        token: existingToken,
        version: alive.version,
        ...alive.dbDumpMany ? { dbDumpMany: alive.dbDumpMany } : {}
      };
    }
  }
  let present;
  try {
    const plugins = await fetchAuthed(`${admin}/plugins.php`);
    const html = await readCappedBody2(plugins);
    const firewall2 = firewallOf(plugins.status, plugins.headers, html);
    if (firewall2) return { ok: false, reason: "blocked_by_firewall", firewall: firewall2 };
    if (!plugins.ok) return { ok: false, reason: "unreachable" };
    present = presenceIn(html);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  let blocker = null;
  if (present === "active") {
    const { token: token2, firewall: firewall2 } = await readInstalledToken();
    if (firewall2) return blocked(firewall2);
    if (token2) {
      const info = await readSiteInfo2(session.webRootUrl, token2, { link: options.link });
      if (info.ok && !needsInstall(info.version, latestVersion)) {
        return {
          ok: true,
          token: token2,
          version: info.version,
          ...info.dbDumpMany ? { dbDumpMany: info.dbDumpMany } : {}
        };
      }
      const upgraded = await upgradeInPlace(fetchAuthed, admin);
      if (upgraded === "ok") {
        const { token: after, firewall: afterFirewall } = await readInstalledToken();
        if (afterFirewall) return blocked(afterFirewall);
        if (after) {
          const proof2 = await readSiteInfo2(session.webRootUrl, after, { link: options.link });
          if (proof2.firewall) return blocked(proof2.firewall);
          if (proof2.ok && !needsInstall(proof2.version, latestVersion)) {
            return {
              ok: true,
              token: after,
              version: proof2.version,
              ...proof2.dbDumpMany ? { dbDumpMany: proof2.dbDumpMany } : {}
            };
          }
        }
      } else if (upgraded !== "failed") {
        blocker = upgraded;
      }
    }
  }
  const uploaded = await uploadPackage(
    fetchAuthed,
    admin,
    packageUrl,
    present !== "absent",
    session.webRootUrl
  );
  if (typeof uploaded === "object" && "stop" in uploaded) return uploaded.stop;
  if (uploaded !== "ok" && uploaded !== "failed") blocker = uploaded;
  if (uploaded !== "ok" && present === "absent") return refusalOf(blocker, "install_failed");
  try {
    const plugins = await fetchAuthed(`${admin}/plugins.php`);
    const html = await readCappedBody2(plugins);
    const firewall2 = firewallOf(plugins.status, plugins.headers, html);
    if (firewall2) return blocked(firewall2);
    const state = presenceIn(html);
    if (state === "absent") return refusalOf(blocker, "install_failed");
    if (state === "inactive") {
      if (present === "inactive" && uploaded !== "ok") return refusalOf(blocker, "install_failed");
      const link = html.match(/href="([^"]*action=activate[^"]*claude-cowork[^"]*)"/i)?.[1]?.replace(/&amp;/g, "&");
      if (!link) return { ok: false, reason: "activate_failed" };
      const activated = await fetchAuthed(new URL(link, `${admin}/`).toString());
      const activatedHtml = await readCappedBody2(activated);
      const activateFirewall = firewallOf(activated.status, activated.headers, activatedHtml);
      if (activateFirewall) return blocked(activateFirewall);
      if (!activated.ok) return { ok: false, reason: "activate_failed" };
    }
  } catch {
    return { ok: false, reason: "activate_failed" };
  }
  const { token, firewall } = await readInstalledToken();
  if (firewall) return blocked(firewall);
  if (!token) return { ok: false, reason: "configure_failed" };
  const proof = await readSiteInfo2(session.webRootUrl, token, { link: options.link });
  if (proof.firewall) return blocked(proof.firewall);
  if (!proof.ok) return { ok: false, reason: "configure_failed" };
  if (proof.version !== void 0 && needsInstall(proof.version, latestVersion)) {
    const refused = refusalOf(blocker, "upgrade_failed");
    return refused.reason === "upgrade_failed" ? { ...refused, have: proof.version, need: latestVersion } : refused;
  }
  return {
    ok: true,
    token,
    version: proof.version,
    ...proof.dbDumpMany ? { dbDumpMany: proof.dbDumpMany } : {}
  };
}
function refusalOf(blocker, fallback) {
  if (blocker === "fs_credentials_required") return { ok: false, reason: "fs_credentials_required" };
  if (blocker) return { ok: false, reason: "blocked_by_firewall", firewall: blocker.firewall };
  return { ok: false, reason: fallback };
}

// src/host/run.ts
var runs = /* @__PURE__ */ new Map();
var RUN_TTL_MS2 = RUN_TTL_MS;
function sweep() {
  const now = Date.now();
  for (const [id, run] of runs) if (now - run.updatedAt > RUN_TTL_MS2) runs.delete(id);
}
var dshHome = () => process.env.DSH_HOME ?? process.cwd();
function runBookPath() {
  return path9.join(dshHome(), "tracy-add-site", "runs.json");
}
function persist(run) {
  const copy = { ...run, detail: { ...run.detail } };
  void updateBook(runBookPath(), (book) => {
    const now = Date.now();
    for (const [id, saved] of Object.entries(book))
      if (!saved || now - saved.updatedAt > RUN_TTL_MS2) delete book[id];
    book[copy.id] = copy;
  }).catch(
    (error) => console.warn(
      `[tracy-add-site] could not record run ${run.id}: ${error instanceof Error ? error.message : String(error)}`
    )
  );
}
var restored2;
function restoreRuns() {
  restored2 ??= (async () => {
    await restoreHolds();
    const file = runBookPath();
    const book = await readBook(file);
    const now = Date.now();
    const cut = [];
    for (const saved of Object.values(book)) {
      if (!saved?.id || runs.has(saved.id) || now - saved.updatedAt > RUN_TTL_MS2) continue;
      if (saved.state !== "running") {
        runs.set(saved.id, saved);
        continue;
      }
      const { retrying: _retrying, partStartedAt: _partStartedAt, ...detail } = saved.detail ?? {};
      const interrupted = {
        ...saved,
        detail,
        state: "error",
        error: "interrupted",
        resumable: await rememberedToken(saved.siteKey) !== void 0
      };
      runs.set(saved.id, interrupted);
      cut.push(interrupted);
      console.warn(
        `[tracy-add-site] run ${saved.id} (${saved.siteKey}) was cut at ${saved.step} by a restart: interrupted`
      );
      await rm(path9.join(dshHome(), "leases", `${saved.id}.json`), { force: true }).catch(() => void 0);
    }
    if (cut.length)
      await updateBook(file, (written) => {
        for (const run of cut) written[run.id] = run;
      });
  })().catch(
    (error) => console.warn(
      `[tracy-add-site] could not read earlier runs: ${error instanceof Error ? error.message : String(error)}`
    )
  );
  return restored2;
}
function runStatus(id) {
  sweep();
  return runs.get(id);
}
function runForSite(siteKey) {
  sweep();
  let latest;
  for (const run of runs.values()) {
    if (run.siteKey === siteKey && (!latest || run.startedAt >= latest.startedAt)) latest = run;
  }
  return latest;
}
function lastRunActivity(siteKey) {
  sweep();
  let latest;
  for (const run of runs.values())
    if (run.siteKey === siteKey && (latest === void 0 || run.updatedAt > latest)) latest = run.updatedAt;
  return latest;
}
function siteArchiveKeys(siteKey) {
  sweep();
  const keys = /* @__PURE__ */ new Set();
  for (const run of runs.values())
    if (run.siteKey === siteKey && run.result) {
      for (const key of [run.result.webrootKey, run.result.dbKey]) if (key) keys.add(key);
    }
  return [...keys];
}
async function forgetSiteRuns(siteKey) {
  const keys = /* @__PURE__ */ new Set();
  for (const [id, run] of runs) {
    if (run.siteKey !== siteKey) continue;
    if (run.result) {
      for (const key of [run.result.webrootKey, run.result.dbKey]) if (key) keys.add(key);
    }
    runs.delete(id);
  }
  await updateBook(runBookPath(), (book) => {
    let changed = false;
    for (const [id, saved] of Object.entries(book))
      if (saved?.siteKey === siteKey) {
        if (saved.result) {
          for (const key of [saved.result.webrootKey, saved.result.dbKey]) if (key) keys.add(key);
        }
        delete book[id];
        changed = true;
      }
    if (!changed) return false;
  });
  await forgetToken(siteKey);
  await forgetFleetHandovers(siteKey);
  await forgetHandover(siteKey);
  return [...keys];
}
function reasonOf(error) {
  if (error instanceof ExportFailed) return error.reason;
  if (error instanceof ManifestUnavailable) return `manifest_${error.reason}`;
  if (error instanceof ArtifactRefused) return "store_refused";
  return "unexpected";
}
function logFirewall(run, firewall) {
  console.warn(
    `[tracy-add-site] run ${run.id} (${run.siteKey}) blocked by ${firewall ?? "a firewall"} at ${run.step}`
  );
}
function failWith(run, failure) {
  if (failure.reason === "blocked_by_firewall") logFirewall(run, failure.firewall);
  update(run, {
    state: "error",
    error: failure.reason,
    ...failure.firewall || failure.have || failure.need ? {
      errorDetail: {
        ...failure.firewall ? { firewall: failure.firewall } : {},
        ...failure.have ? { have: failure.have } : {},
        ...failure.need ? { need: failure.need } : {}
      }
    } : {},
    ...failure.detail ? { diagnostic: failure.detail } : {}
  });
}
var ACCOUNT_REFUSALS = /* @__PURE__ */ new Set(["invalid_credential", "no_backend_access"]);
function signInRefusal(reason, detail, username) {
  if (!ACCOUNT_REFUSALS.has(reason)) return detail;
  return {
    ...detail ?? { at: "login_post", check: reason },
    username_is_email: usernameIsEmail(username)
  };
}
function signInWay(input) {
  if (input.token && input.webRootUrl) return "code";
  return input.adminUrl && input.username && input.password ? "password" : "saved";
}
function update(run, patch) {
  Object.assign(run, patch, { updatedAt: Date.now() });
  persist(run);
}
function superseded(input) {
  if (!input.press) return false;
  const own = BigInt(input.press);
  const after = input.after ? BigInt(input.after) : void 0;
  for (const run of runs.values()) {
    if (run.siteKey !== input.siteKey || !run.press) continue;
    const press = BigInt(run.press);
    if (press >= own || after !== void 0 && press <= after) return true;
  }
  return false;
}
function startRun(input) {
  if (isHeld(input.siteKey)) throw new SiteHeld(input.siteKey);
  const standing = runForSite(input.siteKey);
  if (standing?.state === "running" || input.retryOf && standing && standing.id !== input.retryOf)
    return standing;
  if (standing && superseded(input)) return standing;
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const run = {
    id,
    siteKey: input.siteKey,
    platform: input.platform,
    state: "running",
    step: "signing_in",
    detail: {},
    ...input.press ? { press: input.press } : {},
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
  const bannedBefore = runForSite(input.siteKey)?.error === "blocked_by_host";
  runs.set(id, run);
  persist(run);
  const lease = holdLease(id, { kind: "import", siteKey: input.siteKey });
  void execute(run, input, bannedBefore).catch((error) => {
    const reason = reasonOf(error);
    if (error instanceof BlockedByHost) {
      failBlocked(run, {
        at: "api_door",
        check: bannedBefore ? "connection_refused_after_ban" : "connection_refused_after_progress",
        error: error.code
      });
      return;
    }
    if (reason === "unexpected" || reason === "store_refused") {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(
        `[tracy-add-site] run ${run.id} (${run.siteKey}) failed at ${run.step}: ${reason}
${detail}`
      );
    }
    if (reason === "call_failed" && error instanceof ExportFailed && error.detail)
      console.warn(
        `[tracy-add-site] run ${run.id} (${run.siteKey}) call_failed at ${run.step}: ${error.detail}`
      );
    const firewall = error instanceof ExportFailed && reason === "blocked_by_firewall" ? error.detail : void 0;
    if (reason === "blocked_by_firewall") logFirewall(run, firewall);
    const diagnostic = error instanceof ExportFailed ? error.diagnostic : void 0;
    update(run, {
      state: "error",
      error: reason,
      ...firewall ? { errorDetail: { firewall } } : {},
      ...diagnostic ? { diagnostic } : {}
    });
  }).finally(async () => {
    if (run.handover?.state === "pending") await settleFleetHandovers();
    await reportImportResult({
      origin: input.origin,
      cookie: input.cookie,
      siteKey: run.siteKey,
      result: {
        run_id: run.id,
        state: run.state,
        step: run.step,
        reason: run.error ?? null,
        seconds: Math.max(0, (Date.now() - run.startedAt) / 1e3),
        platform: input.platform,
        // Beside the diagnostic, not in it: a run that fails with none still says how it came in.
        sign_in: signInWay(input),
        ...run.diagnostic ? { detail: run.diagnostic } : {}
      }
    });
    lease.release();
  });
  return run;
}
function failBlocked(run, diagnostic) {
  console.warn(
    `[tracy-add-site] run ${run.id} (${run.siteKey}) blocked by the site's host at ${run.step}: ${diagnostic.check} ${diagnostic.error ?? ""}`
  );
  update(run, {
    state: "error",
    error: "blocked_by_host",
    diagnostic
  });
}
function stillBanned(bannedBefore, reason, error) {
  return bannedBefore && reason === "unreachable" && !!connectionFailure({ code: error });
}
async function execute(run, input, bannedBefore = false) {
  const platform = input.platform;
  const link = new SiteLink({ bannedBefore });
  const artifacts = artifactsFor(input.siteKey, {
    origin: input.origin,
    cookie: input.cookie
  });
  const given = givenCredentials(input);
  if (given === "incomplete") {
    update(run, { state: "error", error: "credentials_required" });
    return;
  }
  const finished = given ? void 0 : await takeOrSweep(input.siteKey, (key) => artifacts.remove(key));
  if (finished) {
    const result2 = await recoverCachedHandover(input, platform, finished.result, link);
    update(run, {
      state: "done",
      step: "handing_over",
      result: result2,
      ...await queuedHandover(run, input, result2, finished.finishedAt)
    });
    return;
  }
  const latest = await latestExtension(platform);
  let siteHeaders = basicAuthHeader(input.basicAuth);
  let token;
  let webRootUrl;
  let dbDumpMany;
  let wordpressInfoRead = false;
  if (input.token && input.webRootUrl) {
    token = input.token;
    webRootUrl = await resolveWebRoot(input.webRootUrl, fetch, siteHeaders);
    if (platform === "wordpress") {
      const info = await readSiteInfo2(webRootUrl, token, { link });
      dbDumpMany = info.dbDumpMany;
      wordpressInfoRead = true;
    }
  } else {
    const held = await rememberedToken(input.siteKey);
    if (!input.adminUrl || !input.username || !input.password) {
      if (!held) {
        update(run, { state: "error", error: "credentials_required" });
        return;
      }
      token = held.token;
      const intent = secureRetryIntent(input, platform);
      const upgraded = intent ? secureRetryWebRoot(intent, held.webRootUrl) : null;
      webRootUrl = upgraded ?? await resolveWebRoot(held.webRootUrl);
      if (webRootUrl !== held.webRootUrl) {
        await rememberToken(input.siteKey, { token, webRootUrl, platform, version: held.version });
      }
    } else {
      update(run, { step: "signing_in" });
      if (platform === "joomla") {
        const session = await loginToAdmin(
          input.adminUrl,
          input.username,
          input.password,
          input.basicAuth
        );
        if (!session.ok) {
          if (session.detail?.at === "login_page" && stillBanned(bannedBefore, session.reason, session.detail.error)) {
            failBlocked(run, { ...session.detail, check: "connection_refused_after_ban" });
            return;
          }
          failWith(run, {
            ...session,
            detail: signInRefusal(session.reason, session.detail, input.username)
          });
          return;
        }
        update(run, { step: "installing" });
        siteHeaders = session.authHeader;
        const installed = await installCowork(
          session,
          latest.packageUrl,
          latest.version,
          held?.token,
          { requiresPhp: latest.requiresPhp, link }
        );
        if (!installed.ok) {
          if (installed.reason === "blocked_by_firewall") logFirewall(run, installed.firewall);
          update(run, {
            state: "error",
            error: installed.reason,
            ...installed.firewall ? { errorDetail: { firewall: installed.firewall } } : {},
            ...installed.reason === "php_too_old" && (installed.php || installed.minimumPhp) ? { errorDetail: { php: installed.php, minimumPhp: installed.minimumPhp } } : {},
            ...installed.uploadMb ? {
              errorDetail: { packageMb: installed.uploadMb.package, limitMb: installed.uploadMb.limit }
            } : {},
            ...installed.detail ? { diagnostic: installed.detail } : {}
          });
          return;
        }
        token = installed.token;
        webRootUrl = session.webRootUrl;
        await rememberToken(input.siteKey, {
          token,
          webRootUrl,
          platform,
          version: installed.version
        });
      } else {
        const session = await loginToAdmin2(
          input.adminUrl,
          input.username,
          input.password,
          input.basicAuth
        );
        if (!session.ok) {
          if (stillBanned(bannedBefore, session.reason, session.connection)) {
            failBlocked(run, {
              at: "login_page",
              check: "connection_refused_after_ban",
              error: session.connection
            });
            return;
          }
          failWith(run, {
            ...session,
            detail: signInRefusal(session.reason, session.detail, input.username)
          });
          return;
        }
        update(run, { step: "installing" });
        const installed = await installCowork2(
          session,
          latest.packageUrl,
          latest.version,
          held?.token,
          { link }
        );
        if (!installed.ok) {
          failWith(run, installed);
          return;
        }
        token = installed.token;
        dbDumpMany = installed.dbDumpMany;
        wordpressInfoRead = true;
        webRootUrl = session.webRootUrl;
        await rememberToken(input.siteKey, {
          token,
          webRootUrl,
          platform,
          version: installed.version
        });
      }
    }
  }
  const needPhp = () => {
    const minimumPhp2 = minimumPhp(latest.requiresPhp);
    return minimumPhp2 ? { errorDetail: { minimumPhp: minimumPhp2 } } : {};
  };
  const door = platform === "joomla" ? await resolveDoor(webRootUrl, token, { headers: siteHeaders, link }) : { endpoint: apiEndpoint(webRootUrl), inline: false };
  if ("refusal" in door) {
    if (door.refusal === "blocked_by_firewall") {
      failWith(run, { reason: door.refusal, firewall: door.firewall, detail: door.detail });
      return;
    }
    update(run, {
      state: "error",
      error: door.refusal,
      // The engine's own versions when it named them, else the manifest's minimum.
      ...door.refusal === "php_too_old" ? door.minimumPhp ? { errorDetail: { ...door.php ? { php: door.php } : {}, minimumPhp: door.minimumPhp } } : needPhp() : {},
      diagnostic: door.detail
    });
    return;
  }
  const endpoint = door.endpoint;
  if (platform === "joomla" && "endpoint" in door) dbDumpMany = door.dbDumpMany;
  if (platform === "wordpress" && !wordpressInfoRead) {
    const info = await readSiteInfo2(webRootUrl, token, { link });
    dbDumpMany = info.dbDumpMany;
  }
  const callOptions = platform === "joomla" ? { headers: siteHeaders, link, dbDumpMany, platform } : { link, dbDumpMany, platform };
  await registerComponentCredential(input, endpoint, token);
  update(run, { step: "reading_content" });
  const sayPhp = (error) => {
    if (error instanceof ExportFailed && error.reason === "php_too_old")
      update(run, { ...needPhp(), diagnostic: { at: "export", check: "parse_error" } });
    if (error instanceof ExportFailed && error.reason === "blocked_by_host") {
      failBlocked(run, {
        at: "export",
        check: bannedBefore ? "connection_refused_after_ban" : "connection_refused_after_progress",
        ...error.detail ? { error: error.detail } : {}
      });
    }
    if (error instanceof ExportFailed && error.reason === "site_offline")
      update(run, {
        diagnostic: { at: "export", check: "site_offline", ...error.detail ? { error: error.detail } : {} }
      });
    throw error;
  };
  const fingerprint = platform === "joomla" || platform === "wordpress" ? await takeFingerprint(endpoint, token, callOptions) : void 0;
  const db = await exportDatabase(
    endpoint,
    token,
    artifacts,
    (progress) => {
      update(run, {
        detail: { ...run.detail, tables: progress.tables, table: progress.table }
      });
    },
    callOptions
  ).catch(sayPhp);
  await rememberPartial(input.siteKey, db.key);
  update(run, { step: "reading_files" });
  const files = await exportFiles(
    endpoint,
    token,
    artifacts,
    input.siteKey,
    (progress) => {
      update(run, {
        detail: {
          ...run.detail,
          files: progress.files,
          bytes: progress.bytes,
          parts: progress.parts,
          // Say so while retrying; never let the screen stand still: a number that does not move for
          // two minutes reads as "hung", and people close the tab right when it was about to go on.
          retrying: progress.retrying,
          totalBytes: progress.total,
          rate: progress.rate,
          partStartedAt: progress.partStartedAt
        }
      });
    },
    { inline: door.inline, ...callOptions }
  ).catch(sayPhp);
  const result = {
    webrootKey: files.key,
    dbKey: db.key,
    liveSite: webRootUrl,
    ...fingerprint ? { fingerprint } : {}
  };
  await rememberHandover(input.siteKey, result);
  update(run, {
    state: "done",
    step: "handing_over",
    result,
    ...await queuedHandover(run, input, result, Date.now())
  });
}
async function queuedHandover(run, input, result, finishedAt) {
  if (!input.origin || !input.cookie) return {};
  try {
    await queueFleetHandover({
      origin: input.origin,
      cookie: input.cookie,
      runId: run.id,
      siteKey: input.siteKey,
      platform: input.platform,
      result,
      finishedAt
    });
    return { handover: { state: "pending" } };
  } catch (error) {
    console.warn(
      `[tracy-add-site] run ${run.id} (${run.siteKey}) could not queue its handover; the wizard hands it over: ${error instanceof Error ? error.message : String(error)}`
    );
    return {};
  }
}
async function settleFleetHandovers(fetchImpl = fetch) {
  await restoreRuns();
  await flushFleetHandovers(
    (runId, outcome) => {
      const run = runs.get(runId);
      (outcome.state === "filed" ? console.log : console.warn)(
        `[tracy-add-site] run ${runId}${run ? ` (${run.siteKey})` : ""} handover to the fleet: ${outcome.state === "filed" ? `job ${outcome.jobId}` : `${outcome.state} ${"code" in outcome ? outcome.code : ""}`}`
      );
      if (run) update(run, { handover: outcome });
    },
    { fetchImpl }
  );
}
async function recoverCachedHandover(input, platform, cached, link) {
  try {
    const held = await rememberedToken(input.siteKey);
    const token = held?.token;
    const source = cached.liveSite;
    const intent = secureRetryIntent(input, platform);
    if (!token || !intent) {
      console.warn(
        `[tracy-add-site] cached handover for ${input.siteKey}: no trustworthy https retry intent to recover the component credential \u2014 retry with an explicit https adminUrl or webRootUrl, or import the site again`
      );
      return cached;
    }
    const secureWebRoot = secureRetryWebRoot(intent, source);
    if (!secureWebRoot) {
      console.warn(
        `[tracy-add-site] cached handover for ${input.siteKey}: the https retry does not name the same source site \u2014 not rewriting the source identity; import the site again to recover`
      );
      return cached;
    }
    const door = await verifiedHttpsDoor(platform, secureWebRoot, token, input.basicAuth, link);
    if (!door) {
      console.warn(
        `[tracy-add-site] cached handover for ${input.siteKey}: the component did not answer over https at the retry address \u2014 the credential was not re-registered`
      );
      return cached;
    }
    const registered = await registerComponentCredential(input, door.endpoint, token);
    if (!registered) {
      console.warn(
        `[tracy-add-site] cached handover for ${input.siteKey}: the seat book did not accept the component credential \u2014 the handover is unchanged; import the site again to recover`
      );
      return cached;
    }
    if (held && held.webRootUrl !== secureWebRoot) {
      await rememberToken(input.siteKey, {
        token,
        webRootUrl: secureWebRoot,
        platform,
        version: held.version
      });
    }
    return { ...cached, liveSite: secureWebRoot };
  } catch {
    return cached;
  }
}
function credentialsFrom(body) {
  const sent = (value) => value === void 0 ? void 0 : typeof value === "string" ? value.trim() : "";
  const raw = (value) => typeof value === "string" ? value : "";
  const basic = body.basicAuth ?? {};
  return {
    username: sent(body.username),
    password: sent(body.password),
    basicAuth: body.basicAuth === void 0 ? void 0 : (
      // Kept verbatim, as before; `givenCredentials` judges blankness itself.
      { username: raw(basic.username), password: raw(basic.password) }
    ),
    token: sent(body.token)
  };
}
function givenCredentials(input) {
  const { token, username, password, basicAuth } = input;
  if (token === void 0 && username === void 0 && password === void 0 && basicAuth === void 0) {
    return void 0;
  }
  const filled = (value) => value !== void 0 && value.trim() !== "";
  if (basicAuth && !(filled(basicAuth.username) && filled(basicAuth.password))) return "incomplete";
  if (filled(token) && filled(input.webRootUrl)) return "token";
  if (filled(input.adminUrl) && filled(username) && filled(password)) return "login";
  return "incomplete";
}
function secureRetryIntent(input, platform) {
  const candidates = [];
  if (input.webRootUrl) candidates.push(input.webRootUrl);
  if (input.adminUrl) {
    try {
      candidates.push(
        platform === "joomla" ? webRootFrom(input.adminUrl) : webRootFrom2(input.adminUrl)
      );
    } catch {
    }
  }
  return candidates.find((url) => /^https:/i.test(url));
}
async function verifiedHttpsDoor(platform, secureWebRoot, token, basicAuth, link) {
  if (platform === "joomla") {
    const door = await findDoor(secureWebRoot, token, {
      noFollow: true,
      headers: basicAuthHeader(basicAuth),
      link
    });
    return door?.ok ? { endpoint: door.endpoint } : void 0;
  }
  const info = await readSiteInfo2(secureWebRoot, token, { noFollow: true, link });
  return info.ok ? { endpoint: apiEndpoint(secureWebRoot) } : void 0;
}
async function registerComponentCredential(input, endpoint, token) {
  if (!input.origin || !input.cookie) return false;
  try {
    const res = await fetch(
      `${input.origin}/api/sites/${encodeURIComponent(input.siteKey)}/component-credential`,
      {
        method: "PUT",
        headers: {
          cookie: input.cookie,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({ endpoint, token })
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.warn(`[tracy-add-site] component credential not registered: ${res.status} ${body?.code ?? ""}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      `[tracy-add-site] component credential not registered: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

// src/host/http.ts
var MAX_BODY = 64 * 1024;
var BodyTooLarge = class extends Error {
};
function writeJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
  return parseJsonObject(await readTextBody(req));
}
function readTextBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (tooLarge) return;
      if (size > MAX_BODY) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(new BodyTooLarge());
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}
function parseJsonObject(raw) {
  const text2 = raw.trim();
  if (text2 === "") return {};
  try {
    const parsed = JSON.parse(text2);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// src/host/hold-door.ts
var text = (value) => typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
async function answerHold(body, now = Date.now) {
  const siteKey = text(body.siteKey);
  const op = text(body.op);
  if (!siteKey || !op) return { status: 400, body: { code: "INVALID_REQUEST" } };
  await restoreRuns();
  if (op === "release") {
    await releaseSite(siteKey);
    return { status: 200, body: { released: true } };
  }
  if (op === "hold") {
    const quietFor = typeof body.quietForMs === "number" && body.quietForMs > 0 ? body.quietForMs : 0;
    const cursor = await heldUpload(siteKey) ?? await staleUpload(siteKey);
    const handed = await handoverKeys(siteKey);
    const standing = runForSite(siteKey);
    if (standing?.state === "running")
      return { status: 409, body: { code: "RUN_ACTIVE", runId: standing.id } };
    const seen = [
      lastRunActivity(siteKey),
      cursor ? cursor.updatedAt ?? cursor.startedAt : void 0
    ].filter((value) => typeof value === "number");
    const lastActivityAt = seen.length ? Math.max(...seen) : null;
    const at = now();
    if (quietFor && lastActivityAt !== null && at - lastActivityAt < quietFor)
      return { status: 409, body: { code: "RECENT_ACTIVITY", lastActivityAt } };
    await holdSite(siteKey, at);
    return {
      status: 200,
      body: {
        held: true,
        lastActivityAt,
        upload: cursor ? { key: cursor.key, uploadId: cursor.uploadId } : null,
        // `handovers.json` goes at `forget`, so its keys (a pending dump included) are named here.
        archives: [.../* @__PURE__ */ new Set([...siteArchiveKeys(siteKey), ...handed])]
      }
    };
  }
  if (op === "forget") {
    if (!isHeld(siteKey)) return { status: 409, body: { code: "NOT_HELD" } };
    await forgetSiteRuns(siteKey);
    await forgetUpload(siteKey);
    await holdSite(siteKey, now());
    return { status: 200, body: { forgotten: true } };
  }
  return { status: 400, body: { code: "INVALID_REQUEST" } };
}

// src/client/credentials.mjs
var TOKEN_SHAPE = /^v1\./;
var DEFAULT_TTL_MS = 30 * 60 * 1e3;
var CredentialStore = class {
  /**
   * @param {() => number} now The clock. Injected so tests do not have to really wait.
   */
  constructor(now = () => Date.now()) {
    this.entries = /* @__PURE__ */ new Map();
    this.now = now;
  }
  /** How many keys are held. Present so tests can assert that expired keys do NOT linger. */
  get size() {
    return this.entries.size;
  }
  /**
   * Take a key for a host.
   *
   * A token of the wrong shape is IGNORED silently: the caller just asked for it from `cowork-web`, which already checked
   * the shape once: a strange value arriving here means something in between answered instead, and storing it
   * would let the promise break on the customer's page load.
   * @param {string} host The site's host, e.g. `a.tracy.ai`.
   * @param {string} token The viewing-session token.
   * @param {number} ttlMs Lifetime.
   * @returns {void}
   */
  put(host, token, ttlMs = DEFAULT_TTL_MS) {
    if (typeof token !== "string" || !TOKEN_SHAPE.test(token)) return;
    if (typeof host !== "string" || host === "") return;
    this.entries.set(host.toLowerCase(), {
      cookie: `tracy_sess=${token}`,
      expiresAt: this.now() + ttlMs
    });
  }
  /**
   * The key for a host, or `null`.
   *
   * An expired key is DELETED right here, not just ignored — a table that only grows is a memory
   * leak, and a dead token lingering in memory is a token still readable.
   * @param {string} host The site's host.
   * @returns {{cookie: string}|null} The key, or null.
   */
  forHost(host) {
    if (typeof host !== "string") return null;
    const key = host.toLowerCase();
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return { cookie: entry.cookie };
  }
  /**
   * Forget a host's key.
   * @param {string} host The site's host.
   * @returns {void}
   */
  forget(host) {
    if (typeof host === "string") this.entries.delete(host.toLowerCase());
  }
};

// src/host/callback-origin.mjs
function callbackOrigin({ configured, forwardedHost, forwardedProto, host } = {}) {
  const set = typeof configured === "string" ? configured.trim() : "";
  if (/^https?:\/\/[^/\s]+/i.test(set)) return set.replace(/\/+$/, "");
  const where = forwardedHost || host || "";
  return where ? `${forwardedProto || "http"}://${where}` : "";
}

// src/host/index.ts
var name = "tracy-add-site";
var inject = ["webServer", "sidebarFrame"];
var PREFIX = "/api/tracy-add-site";
function dshSetting(name2) {
  const value = process.env[name2]?.trim();
  if (value) return value;
  const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim();
  if (!file) return null;
  try {
    const m = new RegExp(`^${name2}=(.+)$`, "m").exec(readFileSync(file, "utf8"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}
var credentials = new CredentialStore();
async function handleCredentials(body, context) {
  const input = body ?? {};
  const siteKey = typeof input.siteKey === "string" ? input.siteKey : "";
  const host = typeof input.host === "string" ? input.host : "";
  if (!siteKey || !host) return { status: 400, body: { code: "INVALID_REQUEST" } };
  if (!context.origin || !context.cookie) return { status: 401, body: { code: "NOT_SIGNED_IN" } };
  let response;
  try {
    response = await fetch(`${context.origin}/api/sites/${encodeURIComponent(siteKey)}/viewing-session`, {
      method: "GET",
      headers: { cookie: context.cookie }
    });
  } catch {
    return { status: 502, body: { code: "SEAT_BOOK_UNREACHABLE" } };
  }
  const answer = await response.json().catch(() => null);
  if (!response.ok || typeof answer?.token !== "string") {
    return { status: response.status || 502, body: answer ?? { code: "NO_VIEWING_SESSION" } };
  }
  credentials.put(host, answer.token);
  return { status: 200, body: { ok: true } };
}
var PLATFORMS = /* @__PURE__ */ new Set(["joomla", "wordpress"]);
var asPlatform = (value) => typeof value === "string" && PLATFORMS.has(value) ? value : null;
async function handleExtension(body) {
  const platform = asPlatform(body.platform);
  if (!platform) return { status: 400, body: { code: "UNSUPPORTED_PLATFORM" } };
  try {
    const latest = await latestExtension(platform);
    return { status: 200, body: latest };
  } catch (error) {
    if (error instanceof ManifestUnavailable) {
      return { status: 502, body: { code: "EXTENSION_MANIFEST_UNAVAILABLE", reason: error.reason } };
    }
    throw error;
  }
}
var asString = (value) => typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
async function handleStart(body, context) {
  const platform = asPlatform(body.platform);
  const siteKey = asString(body.siteKey);
  if (!platform || !siteKey) return { status: 400, body: { code: "INVALID_REQUEST" } };
  const press = asString(body.press);
  const after = asString(body.after);
  if ([press, after].some((value) => value !== void 0 && !/^\d{1,20}$/.test(value)))
    return { status: 400, body: { code: "INVALID_REQUEST" } };
  if (!context.cookie) return { status: 401, body: { code: "NOT_SIGNED_IN" } };
  if (draining2()) return { status: 503, body: { code: "HOST_UPDATING" } };
  await restoreRuns();
  let run;
  try {
    run = startRun({
      siteKey,
      platform,
      retryOf: asString(body.retryOf),
      ...press ? { press } : {},
      ...press && after ? { after } : {},
      adminUrl: asString(body.adminUrl),
      // Sent-but-blank credentials stay sent: blank is `credentials_required`, never "none given" (#530).
      ...credentialsFrom(body),
      webRootUrl: asString(body.webRootUrl),
      origin: context.origin,
      cookie: context.cookie
    });
  } catch (error) {
    if (error instanceof SiteHeld) return { status: 409, body: { code: "IMPORT_REMOVING" } };
    throw error;
  }
  return { status: 202, body: { runId: run.id } };
}
async function handleStatus(body) {
  const runId = asString(body.runId);
  const siteKey = asString(body.siteKey);
  await restoreRuns();
  const run = runId ? runStatus(runId) : siteKey ? runForSite(siteKey) : void 0;
  if (!run) return { status: 404, body: { code: "RUN_UNKNOWN" } };
  return { status: 200, body: { ...run, now: Date.now() } };
}
async function handleDetect(body) {
  const siteKey = asString(body.siteKey);
  if (!siteKey) return { status: 400, body: { code: "INVALID_REQUEST" } };
  const adminUrl = asString(body.adminUrl);
  return {
    status: 200,
    body: await inspectAddress(adminUrl ?? siteKey, fetch, !!adminUrl, asPlatform(body.platform) ?? "joomla")
  };
}
var ROUTES = {
  extension: handleExtension,
  credentials: handleCredentials,
  detect: (body) => handleDetect(body),
  start: handleStart,
  status: (body) => handleStatus(body)
};
function apply(ctx) {
  void restoreRuns();
  ctx.effect(() => {
    const drain = () => {
      void flushImportResults().catch(
        () => console.warn("[tracy-add-site] operation result queue unavailable")
      );
      void settleFleetHandovers().catch(
        () => console.warn("[tracy-add-site] fleet handover queue unavailable")
      );
    };
    drain();
    const timer = setInterval(drain, 3e4);
    timer.unref?.();
    return () => clearInterval(timer);
  });
  const route = {
    kind: "prefix",
    path: PREFIX,
    handler: (req, res) => {
      if (req.method !== "POST") {
        writeJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        return;
      }
      const path10 = (req.url ?? "").split("?")[0] ?? "";
      const step = path10.slice(PREFIX.length).replace(/^\/+/, "");
      if (step === "hold") {
        const header = (name2) => {
          const value = req.headers[name2];
          return (Array.isArray(value) ? value[0] : value) ?? "";
        };
        readTextBody(req).then((raw) => {
          const signed = signedByTracy({
            secret: dshSetting("MCP_SEAT_SECRET"),
            path: `${PREFIX}/hold`,
            body: raw,
            timestamp: header("x-seat-timestamp"),
            nonce: header("x-seat-nonce"),
            signature: header("x-seat-signature")
          });
          if (!signed) return { status: 403, body: { code: "NOT_TRACY" } };
          return answerHold(parseJsonObject(raw));
        }).then((answer) => writeJson(res, answer.status, answer.body)).catch(
          (error) => writeJson(res, error instanceof BodyTooLarge ? 413 : 500, {
            code: error instanceof BodyTooLarge ? "BODY_TOO_LARGE" : "INTERNAL_ERROR"
          })
        );
        return;
      }
      const handler = ROUTES[step];
      if (!handler) {
        writeJson(res, 404, { code: "UNKNOWN_STEP" });
        return;
      }
      const first = (name2) => {
        const value = req.headers[name2];
        return (Array.isArray(value) ? value[0] : value) ?? "";
      };
      const forwardedSession = first("x-tracy-session");
      const cookie = forwardedSession ? `tracy_sess=${forwardedSession}` : req.headers.cookie ?? "";
      const origin = callbackOrigin({
        configured: dshSetting("MCP_TRACY_ORIGIN"),
        forwardedHost: first("x-forwarded-host"),
        forwardedProto: first("x-forwarded-proto"),
        host: req.headers.host ?? ""
      });
      const context = { cookie, origin };
      readJsonBody(req).then((body) => handler(body, context)).then((answer) => writeJson(res, answer.status, answer.body)).catch((error) => {
        if (error instanceof BodyTooLarge) {
          writeJson(res, 413, { code: "BODY_TOO_LARGE" });
          return;
        }
        writeJson(res, 500, { code: "INTERNAL_ERROR" });
      });
    }
  };
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route);
    return () => dispose();
  }, "tracy-add-site: host routes");
  ctx.effect(
    () => ctx.sidebarFrame.useCredentials((url) => credentials.forHost(url.hostname)),
    "tracy-add-site: frame credentials"
  );
}
export {
  apply,
  inject,
  name
};
