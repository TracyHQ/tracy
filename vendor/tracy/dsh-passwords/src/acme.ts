// 极简 ACME v2 客户端（RFC 8555）：HTTP-01 挑战 + ES256 JWS + P-256 密钥。
// 零外部依赖：node:crypto（密钥/签名/CSR）+ fetch（请求）+ 手写 DER 编码器。
//
// 用途：dsh-passwords 的"自动 HTTPS"——网关启动时自动向 Let's Encrypt
// 申请/续期证书（默认域名为 <公网IP>.sslip.io），用户零操作获得
// 浏览器信任的 HTTPS。密钥与证书持久化在 <db目录>/acme/ 下：
//   account.key.pem   账户密钥（P-256，复用于续期）
//   cert.key.pem      证书私钥（P-256，TLS 用）
//   fullchain.pem     证书链（叶子 + 中间证书）
import { createHash, createPrivateKey, createPublicKey, createSign, generateKeyPairSync, randomBytes, X509Certificate, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { isPublicIp } from './config.js';

const DIRECTORIES = {
  production: 'https://acme-v02.api.letsencrypt.org/directory',
  staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
} as const;

/** 续期阈值：证书剩余有效期小于该值时触发续期 */
const RENEW_BEFORE_MS = 30 * 24 * 3600 * 1000;

interface AcmeResult {
  certPath: string;
  keyPath: string;
  expiresAt: number;
}

const b64u = (buf: Buffer): string => buf.toString('base64url');

// ── 最小 DER 编码器（只覆盖 CSR 需要的结构） ──────────────────

function derLen(n: number): Buffer {
  if (n < 128) return Buffer.from([n]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derWrap(tag: number, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(body.length), body]);
}

const derSeq = (...parts: Buffer[]): Buffer => derWrap(0x30, Buffer.concat(parts));
const derSet = (...parts: Buffer[]): Buffer => derWrap(0x31, Buffer.concat(parts));
const derOid = (oid: Buffer): Buffer => derWrap(0x06, oid);
const derNull = Buffer.from([0x05, 0x00]);

function derUtf8(value: string): Buffer {
  return derWrap(0x0c, Buffer.from(value, 'utf8'));
}

function derBitString(bytes: Buffer): Buffer {
  return derWrap(0x03, Buffer.concat([Buffer.from([0]), bytes]));
}

function derOctetString(bytes: Buffer): Buffer {
  return derWrap(0x04, bytes);
}

function derInt(n: number): Buffer {
  if (n === 0) return Buffer.from([0x02, 0x01, 0x00]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  if ((bytes[0] & 0x80) !== 0) bytes.unshift(0);
  return Buffer.concat([Buffer.from([0x02]), derLen(bytes.length), Buffer.from(bytes)]);
}

/** commonName OID: 2.5.4.3 */
const OID_CN = Buffer.from([0x55, 0x04, 0x03]);
/** ecdsa-with-SHA256 OID: 1.2.840.10045.4.3.2 */
const OID_ECDSA_SHA256 = Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]);
/** extensionRequest OID: 1.2.840.113549.1.9.14（CSR 属性里携带扩展） */
const OID_EXT_REQ = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x0e]);
/** subjectAltName OID: 2.5.29.17 */
const OID_SAN = Buffer.from([0x55, 0x1d, 0x11]);

/**
 * 用 node:crypto 生成 PKCS#10 CSR（DER 编码）：
 * CertificationRequestInfo = SEQ { INTEGER 0, Name(CN=domain),
 *   SPKI（直接取 publicKey.export spki DER）,
 *   [0] extensionRequest{ SAN(dNSName=domain) } }
 * 签名用 P-256 + SHA256，签名值以 DER 形式放入 BIT STRING。
 * 同时写入 CN 与 SAN：RFC 6125 下浏览器只认 SAN，仅 CN 的证书在严格
 * 客户端（及部分 CA 策略）会被视为缺 SAN；两者一致是最兼容形态。
 */
export function buildCsr(privateKey: KeyObject, domain: string): Buffer {
  const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }) as Buffer;
  const name = derSeq(derSet(derSeq(derOid(OID_CN), derUtf8(domain))));
  // SAN：Extension = SEQ { OID(2.5.29.17), OCTET STRING{ GeneralNames = SEQ { [2] dNSName } } }
  // extnValue 必须是 OCTET STRING（RFC 5280 §4.2），其内容才是 DER GeneralNames——
  // 少这层封装会被严格 CA/解析器视为非法扩展。
  const generalNames = derSeq(derWrap(0x82, Buffer.from(domain, 'utf8')));
  const sanExt = derSeq(derOid(OID_SAN), derOctetString(generalNames));
  const extensionRequest = derSeq(derOid(OID_EXT_REQ), derSet(derSeq(sanExt)));
  const attributes = derWrap(0xa0, extensionRequest);
  const info = derSeq(derInt(0), name, spki, attributes);
  const sign = createSign('SHA256');
  sign.update(info);
  const signature = sign.sign(privateKey); // DER ECDSA-Sig-Value
  const algId = derSeq(derOid(OID_ECDSA_SHA256), derNull);
  return derSeq(info, algId, derBitString(signature));
}

// ── JWS（RFC 7515 ES256） ───────────────────────────────────

/** DER ECDSA 签名 → JOSE raw r||s（各 32 字节） */
function derSigToRaw(der: Buffer): Buffer {
  let offset = 0;
  const readByte = (): number => {
    if (offset >= der.length) throw new Error('bad DER signature');
    return der[offset++];
  };
  const readLen = (): number => {
    const first = readByte();
    if ((first & 0x80) === 0) return first;
    const count = first & 0x7f;
    let value = 0;
    for (let i = 0; i < count; i++) value = value * 256 + readByte();
    return value;
  };
  const readInt = (): Buffer => {
    if (readByte() !== 0x02) throw new Error('bad DER signature');
    const len = readLen();
    let value = Buffer.from(der.subarray(offset, offset + len));
    offset += len;
    if (value.length > 32 && value[0] === 0) value = value.subarray(1);
    const pad = Buffer.alloc(Math.max(0, 32 - value.length));
    return Buffer.concat([pad, value]);
  };
  if (readByte() !== 0x30) throw new Error('bad DER signature');
  readLen();
  return Buffer.concat([readInt(), readInt()]);
}

/** RFC 7638 JWK 指纹：按 kty 取规范字段（字典序）做 SHA-256 */
function jwkThumbprint(jwk: JsonWebKey): string {
  const canonical =
    jwk.kty === 'EC'
      ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
      : { e: jwk.e, kty: jwk.kty, n: jwk.n };
  return b64u(createHash('sha256').update(JSON.stringify(canonical)).digest());
}

/** 签署一个 JWS，返回 POST body */
function signJws(
  privateKey: KeyObject,
  payload: string,
  url: string,
  nonce: string,
  kid: string | null,
): string {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as JsonWebKey;
  const protectedHeader = {
    alg: 'ES256',
    nonce,
    url,
    ...(kid ? { kid } : { jwk }),
  };
  const headerB64 = b64u(Buffer.from(JSON.stringify(protectedHeader), 'utf8'));
  const payloadB64 = b64u(Buffer.from(payload, 'utf8'));
  const sign = createSign('SHA256');
  sign.update(`${headerB64}.${payloadB64}`);
  const derSig = sign.sign(privateKey);
  const rawSig = derSigToRaw(derSig);
  return JSON.stringify({
    protected: headerB64,
    payload: payloadB64,
    signature: b64u(rawSig),
  });
}

interface AcmeResponse {
  status: number;
  body: unknown;
  nonce: string | null;
  location: string | null;
}

/** ACME 服务端错误（带 type/detail，便于日志定位） */
class AcmeError extends Error {
  constructor(
    public readonly type: string,
    detail: string,
  ) {
    super(`ACME ${type}: ${detail}`);
  }
}

class AcmeClient {
  private nonce: string;
  private kid: string | null;

  private constructor(
    private directoryUrl: string,
    /** 完整 directory 响应（端点地址一律从这里取，不要自行拼路径） */
    readonly directory: Record<string, unknown>,
    private accountKey: KeyObject,
    nonce: string,
  ) {
    this.nonce = nonce;
    this.kid = null;
  }

  static async connect(directoryUrl: string, accountKey: KeyObject): Promise<AcmeClient> {
    const directory = (await fetchJson(directoryUrl, 'GET')) as Record<string, unknown>;
    const newNonceUrl = directory.newNonce as string;
    if (!newNonceUrl) throw new AcmeError('directory', 'directory 缺少 newNonce 端点');
    const nonce = await fetchNonce(newNonceUrl);
    return new AcmeClient(directoryUrl, directory, accountKey, nonce);
  }

  /** 账户注册完成后切换为按 kid 签名（JWS 常规形式） */
  useKid(kid: string): void {
    this.kid = kid;
  }

  /** 发一个签名请求；POST-as-GET 时 payload 传 ''。JSON 响应解析为对象，其余按文本返回。 */
  async signedRequest(url: string, payload: Record<string, unknown> | ''): Promise<AcmeResponse> {
    const payloadStr = payload === '' ? '' : JSON.stringify(payload);
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = signJws(this.accountKey, payloadStr, url, this.nonce, this.kid);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/jose+json' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      const isJson = (res.headers.get('content-type') ?? '').includes('json');
      let parsed: unknown = null;
      if (text !== '') {
        try {
          parsed = isJson ? JSON.parse(text) : text;
        } catch {
          parsed = text;
        }
      }
      const nonce = res.headers.get('replay-nonce');
      if (nonce) this.nonce = nonce;
      if (res.status === 400 && isProblem(parsed) && (parsed as { type: string }).type === 'urn:ietf:params:acme:error:badNonce') {
        const directory = (await fetchJson(this.directoryUrl, 'GET')) as Record<string, unknown>;
        this.nonce = await fetchNonce(directory.newNonce as string);
        continue;
      }
      if (res.status >= 400 && isProblem(parsed)) {
        throw new AcmeError(
          (parsed as { type: string }).type,
          (parsed as { detail?: string }).detail ?? `HTTP ${res.status}`,
        );
      }
      if (res.status >= 400) {
        throw new AcmeError('http-error', `HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return {
        status: res.status,
        body: parsed,
        nonce,
        location: res.headers.get('location'),
      };
    }
    throw new AcmeError('badNonce', 'nonce retry exhausted');
  }

  /** 注册（或复用）账户，返回 kid。同一把 key 重复启动会复用已有账户。 */
  async ensureAccount(email: string | undefined): Promise<string> {
    const newAccountUrl = this.directory.newAccount as string;
    if (!newAccountUrl) throw new AcmeError('directory', 'directory 缺少 newAccount 端点');
    try {
      const probe = await this.signedRequest(newAccountUrl, { onlyReturnExisting: true });
      if (probe.status === 200 && probe.location) return probe.location;
    } catch (error) {
      // 账户不存在（首次运行）：继续走创建流程；其他错误照抛
      if (!(error instanceof AcmeError) || !error.type.includes('accountDoesNotExist')) throw error;
    }

    const payload: Record<string, unknown> = { termsOfServiceAgreed: true };
    if (email) payload.contact = [`mailto:${email}`];
    const created = await this.signedRequest(newAccountUrl, payload);
    if ((created.status === 200 || created.status === 201) && created.location) {
      return created.location;
    }
    throw new AcmeError('account', `new-account 返回 ${created.status}`);
  }
}

function isProblem(value: unknown): value is { type: string; detail?: string } {
  return typeof value === 'object' && value !== null && 'type' in value;
}

async function fetchJson(url: string, method: string): Promise<unknown> {
  const res = await fetch(url, { method, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new AcmeError('http-error', `${method} ${url} → HTTP ${res.status}`);
  return res.json();
}

async function fetchNonce(url: string): Promise<string> {
  const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  const nonce = res.headers.get('replay-nonce');
  if (!nonce) throw new AcmeError('nonce', `new-nonce 未返回 Replay-Nonce（HTTP ${res.status}）`);
  return nonce;
}

/** 轮询授权直到 valid（LE 通常 3-10 秒） */
async function waitForValid(client: AcmeClient, url: string, label: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const res = await client.signedRequest(url, '');
    const status = (res.body as { status?: string } | null)?.status;
    if (status === 'valid') return;
    if (status === 'invalid') {
      throw new AcmeError('validation', `${label} 校验失败（invalid）`);
    }
    if (Date.now() > deadline) throw new AcmeError('timeout', `${label} 校验超时`);
    await sleep(2500);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureKeyFile(file: string): KeyObject {
  if (existsSync(file)) {
    return createPrivateKey(readFileSync(file, 'utf8'));
  }
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  // 原子写：进程/主机在写入中断时不留截断的 key 文件（下次 createPrivateKey 失败
  // 会让自动签发/续期永久不可用）；与证书/meta 的 tmp+rename 同口径
  const tmp = `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    writeFileSync(tmp, pem, { mode: 0o600 });
    renameSync(tmp, file);
  } catch (error) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
    throw error;
  }
  return privateKey;
}

/** 证书（fullchain.pem）到期时间；文件缺失/解析失败返回 null */
export function certExpiryMs(fullchainPath: string): number | null {
  try {
    const pem = readFileSync(fullchainPath, 'utf8');
    const leaf = new X509Certificate(pem);
    return new Date(leaf.validTo).getTime();
  } catch {
    return null;
  }
}

/** 读取签发元数据（{domain, staging}）；缺失/损坏/结构不符返回 null。 */
export function readCertMeta(metaPath: string): { domain: string; staging: boolean } | null {
  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as { domain?: unknown; staging?: unknown };
    if (typeof parsed.domain === 'string' && typeof parsed.staging === 'boolean') {
      return { domain: parsed.domain, staging: parsed.staging };
    }
    return null;
  } catch {
    return null;
  }
}

/** 证书 leaf 的 SAN/CN 是否覆盖目标域名（旧证书无 meta.json 时的兼容判定）。
 *  RFC 6125/2818：证书存在 DNS SAN 时以 SAN 为准，CN 不参与主机名匹配——
 *  旧实现 `san.includes(domain) || cn === domain` 会接受“SAN=other、CN=target”
 *  这类浏览器必然拒绝的证书。DNS 名不区分大小写，统一转小写比较。 */
export function certMatchesDomain(certPath: string, domain: string): boolean {
  try {
    const pem = readFileSync(certPath, 'utf8');
    const leaf = new X509Certificate(pem);
    const target = domain.toLowerCase();
    const san = String(leaf.subjectAltName ?? '')
      .split(/,\s*/)
      .map((entry) => entry.replace(/^DNS:/, '').trim().toLowerCase())
      .filter((entry) => entry !== '');
    if (san.length > 0) return san.includes(target);
    // 无 DNS SAN 才允许回退 CN（自签/旧证书兼容路径）
    const cn = leaf.subject
      .split('\n')
      .find((line) => line.startsWith('CN='))
      ?.slice(3)
      .trim()
      .toLowerCase();
    return cn === target;
  } catch {
    return false;
  }
}

/** 零配置兜底：探测本机公网 IP（外部服务，5 秒超时，失败返回 null） */
export async function detectPublicIp(): Promise<string | null> {
  for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com']) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const text = (await res.text()).trim();
      if (isPublicIp(text)) return text;
    } catch {
      // 尝试下一个服务
    }
  }
  return null;
}

/**
 * 申请或续期证书（幂等：证书未到期时直接返回现有证书，不发起网络请求）。
 * @param opts.acmeDir 数据目录（account/cert 密钥与 fullchain 持久化于此）
 * @param opts.challengeStore token → keyAuthorization（80 端口服务器应答用）
 */
export async function ensureCertificate(opts: {
  domain: string;
  email?: string;
  staging?: boolean;
  acmeDir: string;
  challengeStore: Map<string, string>;
}): Promise<AcmeResult> {
  // 域名白名单（防注入/异常输入）：字母、数字、点、连字符，≤253 字符
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(opts.domain)) {
    throw new AcmeError('domain', '非法域名');
  }
  mkdirSync(opts.acmeDir, { recursive: true });
  const certPath = path.join(opts.acmeDir, 'fullchain.pem');
  const keyPath = path.join(opts.acmeDir, 'cert.key.pem');
  const accountKeyPath = path.join(opts.acmeDir, 'account.key.pem');
  const metaPath = path.join(opts.acmeDir, 'meta.json');

  // 已有未到期证书：直接复用（重启/短期多次启动不会重复签发）。
  // 复用判定用签发时记录的 meta.json（{domain, staging}）：域名或签发环境
  // 与当前配置不一致时重新签发，而不是复用——也不删旧证书：新签发失败时
  // 旧证书仍在原位可继续服务（删旧证书会让失败窗口裸奔无证书可加载）。
  const existing = certExpiryMs(certPath);
  if (existing !== null && existsSync(keyPath) && existing - Date.now() > RENEW_BEFORE_MS) {
    const meta = readCertMeta(metaPath);
    if (meta !== null && meta.domain === opts.domain && meta.staging === (opts.staging === true)) {
      return { certPath, keyPath, expiresAt: existing };
    }
    // meta 缺失（旧版本签发）或域名/staging 不匹配：走下方重新签发流程
  }

  const accountKey = ensureKeyFile(accountKeyPath);
  const certKey = ensureKeyFile(keyPath);
  const directoryUrl = DIRECTORIES[opts.staging ? 'staging' : 'production'];

  const client = await AcmeClient.connect(directoryUrl, accountKey);
  const kid = await client.ensureAccount(opts.email);

  // 拿到 kid 后按 kid 签名（首次创建时用 jwk，服务端会接受任一形式）
  client.useKid(kid);

  // newOrder → authorizations → http-01 challenge → keyAuthorization 进 store
  const newOrderUrl = client.directory.newOrder as string;
  if (!newOrderUrl) throw new AcmeError('directory', 'directory 缺少 newOrder 端点');
  const order = await client.signedRequest(newOrderUrl, {
    identifiers: [{ type: 'dns', value: opts.domain }],
  });
  const orderUrl = order.location;
  const orderBody = order.body as {
    authorizations: string[];
    finalize: string;
    status: string;
    certificate?: string;
  };
  if (!orderUrl || orderBody.status === 'invalid') {
    throw new AcmeError('order', 'new-order 失败');
  }

  const accountJwk = createPublicKey(accountKey).export({ format: 'jwk' }) as JsonWebKey;
  for (const authzUrl of orderBody.authorizations) {
    const authz = await client.signedRequest(authzUrl, '');
    const challenges = (authz.body as { challenges: Array<{ type: string; token: string; url: string }> }).challenges;
    const challenge = challenges.find((item) => item.type === 'http-01');
    if (!challenge) throw new AcmeError('challenge', '未提供 http-01 挑战');
    const keyAuthorization = `${challenge.token}.${jwkThumbprint(accountJwk)}`;
    opts.challengeStore.set(challenge.token, keyAuthorization);
    try {
      await client.signedRequest(challenge.url, {});
      await waitForValid(client, authzUrl, `授权 ${opts.domain}`);
    } finally {
      opts.challengeStore.delete(challenge.token);
    }
  }

  // 最终化：CSR（P-256，CN=domain）→ 轮询 order → 下载证书链
  const csrDer = buildCsr(certKey, opts.domain);
  const finalized = await client.signedRequest(orderBody.finalize, { csr: b64u(csrDer) });
  const finalBody = finalized.body as { status: string; certificate?: string };
  if (finalBody.status !== 'valid') {
    await waitForValid(client, orderUrl, '签发');
    const refreshed = await client.signedRequest(orderUrl, '');
    const refreshedBody = refreshed.body as { status: string; certificate?: string };
    if (refreshedBody.status !== 'valid' || !refreshedBody.certificate) {
      throw new AcmeError('finalize', `签发后状态异常: ${refreshedBody.status}`);
    }
  }
  const certUrl =
    finalBody.certificate ??
    ((await client.signedRequest(orderUrl, '')).body as { certificate?: string }).certificate;
  if (!certUrl) throw new AcmeError('finalize', 'order 未返回证书地址');

  const certRes = await client.signedRequest(certUrl, '');
  const chainPem =
    typeof certRes.body === 'string'
      ? certRes.body
      : ((certRes.body as { data?: string } | null)?.data ?? '');
  if (!chainPem.includes('BEGIN CERTIFICATE')) {
    throw new AcmeError('certificate', '证书下载内容不是 PEM');
  }
  // 原子写入：临时文件 + rename。SNICallback 每次 TLS 握手都重新读这两个文件，
  // 直接 writeFileSync 可能在续期瞬间读到半截证书/私钥导致握手失败。
  const tmpCert = `${certPath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  writeFileSync(tmpCert, chainPem, { mode: 0o600 });
  renameSync(tmpCert, certPath);
  // meta 同样原子写：cert rename 成功、meta 写入中断时，下次启动会把有效证书
  // 误判为“不匹配”而重复签发（可能撞 ACME 限速）。
  const tmpMeta = `${metaPath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  writeFileSync(tmpMeta, JSON.stringify({ domain: opts.domain, staging: opts.staging === true }), { mode: 0o600 });
  renameSync(tmpMeta, metaPath);

  const expiresAt = certExpiryMs(certPath);
  if (expiresAt === null) throw new AcmeError('certificate', '签发后的证书无法解析有效期');
  return { certPath, keyPath, expiresAt };
}
