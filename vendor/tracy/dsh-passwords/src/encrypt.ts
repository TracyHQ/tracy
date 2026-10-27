// 字段级静态加密（data-at-rest encryption）
//   目标：即使 data/platform.db 文件被整体窃取（备份泄露/服务器失陷），
//   其中的用户数据（用户名/IP/UA/审计详情）也无法被直接读取。
//   密钥来源（优先级）：MCP_DB_ENC_KEY（推荐，独立 256 位随机）> SETUP_KEY 派生。
//   域分离：字段加密密钥与等值散列密钥从主密钥分别派生，互不通用。
//   ⚠ 启用后主密钥不可更换/删除，否则历史加密数据无法解密。
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

const VERSION = 'v1:';
const HASH_VERSION = 'h1:';

export interface FieldCrypto {
  /** AES-256-GCM（随机 IV）加密；null 透传 */
  encrypt(plain: string | null): string | null;
  /** 解密；非加密的旧明文原样返回（迁移前的兼容读） */
  decrypt(cipher: string | null): string | null;
  /** 等值查询键：HMAC-SHA256（不可逆，但同一原文散列恒等，供 WHERE = 查询） */
  lookupHash(plain: string): string;
}

export function createFieldCrypto(dbEncKey: string, setupKey: string): FieldCrypto {
  const master = dbEncKey || setupKey;
  if (!master) {
    // 纵深防御：主密钥为空时“加密”退化为可预测密钥（等于没加密）。
    // 正常入口（cli/plugin）都强制 SETUP_KEY 非空，这里兜底防未来新增入口漏拦。
    throw new Error('字段加密主密钥为空：请配置 SETUP_KEY 或 MCP_DB_ENC_KEY');
  }
  // 域分离：两个子密钥互不通用（HMAC 密钥即使泄露也无法解密字段数据）
  const fieldKey = createHash('sha256').update('dsh-field:' + master).digest();
  const lookupKey = createHash('sha256').update('dsh-lookup:' + master).digest();

  function encrypt(plain: string | null): string | null {
    if (plain === null) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', fieldKey, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return VERSION + Buffer.concat([iv, tag, ct]).toString('base64');
  }

  function decrypt(cipher: string | null): string | null {
    if (cipher === null) return null;
    if (!cipher.startsWith(VERSION)) return cipher; // 旧明文数据：原样返回（迁移前兼容）
    try {
      const buf = Buffer.from(cipher.slice(VERSION.length), 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const ct = buf.subarray(28);
      const d = createDecipheriv('aes-256-gcm', fieldKey, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    } catch {
      // 密钥不匹配/数据损坏：标记而不是抛出（审计读取不阻断主流程）
      return '⟨无法解密⟩';
    }
  }

  function lookupHash(plain: string): string {
    return HASH_VERSION + createHmac('sha256', lookupKey).update(plain).digest('hex');
  }

  return { encrypt, decrypt, lookupHash };
}
