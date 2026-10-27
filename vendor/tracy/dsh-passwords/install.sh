#!/usr/bin/env bash
# dsh-passwords 一键安装（Linux/macOS 引导壳；实际安装逻辑在 scripts/install.mjs）
#
# 用法（二选一）:
#   1) curl 直接装:  curl -fsSL https://raw.githubusercontent.com/slywalker2006/dsh-passwords/main/install.sh | bash
#   2) 先 clone 再装: git clone https://github.com/slywalker2006/dsh-passwords && cd dsh-passwords && bash install.sh
# Windows 用户请运行 install.bat。
#
# 做什么：检查 Node.js 22.19+ 或 24+ / git / dsh，缺了自动装（apt/dnf/brew）；
# 然后下载项目，交给 scripts/install.mjs 完成安装（pnpm 缺了也会自动装）。
set -euo pipefail

CYAN='\033[0;36m'
RED='\033[0;31m'
GREEN='\033[0;32m'
RESET='\033[0m'

say() { printf "${CYAN}[dsh-passwords]${RESET} %s\n" "$*"; }
ok()  { printf "${GREEN}[dsh-passwords]${RESET} %s\n" "$*"; }
err() { printf "${RED}[dsh-passwords]${RESET} %s\n" "$*" >&2; }

# ── 0. 已 clone 源码定位 ──
# clone 安装与 curl 安装共用下面的 Node/git/dsh 预检，避免同一入口存在两套行为。
SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
SOURCE_DIR=""
if [ -f "$SCRIPT_SOURCE" ]; then
  SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$SCRIPT_SOURCE")" && pwd)"
  if [ -f "$SCRIPT_DIR/scripts/install.mjs" ]; then
    SOURCE_DIR="$SCRIPT_DIR"
  fi
fi

# ── 1. Node.js（缺了自动安装；版本不够直接报错） ──
check_node_version() {
  NODE_VERSION="$(node -v 2>/dev/null || true)"
  if ! printf '%s\n' "$NODE_VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+'; then
    err "无法读取 Node.js 版本（当前：${NODE_VERSION:-unknown}），请安装 Node.js 22.19+ 或 24+ 后重跑。"
    exit 1
  fi
  NODE_MAJOR="$(printf '%s\n' "$NODE_VERSION" | sed -E 's/^v([0-9]+)\..*/\1/')"
  NODE_MINOR="$(printf '%s\n' "$NODE_VERSION" | sed -E 's/^v[0-9]+\.([0-9]+)\..*/\1/')"
  if [ "$NODE_MAJOR" -lt 22 ] || [ "$NODE_MAJOR" -eq 23 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
    err "Node.js 版本不受支持（当前 $NODE_VERSION），需要 22.19+ 或 24+。请升级后重跑本脚本。"
    exit 1
  fi
  ok "Node.js $NODE_VERSION ✓"
}

if command -v node >/dev/null 2>&1; then
  check_node_version
else
  say "未找到 Node.js，正在自动安装…"
  if command -v apt-get >/dev/null 2>&1; then
    # Debian/Ubuntu：用 NodeSource 装 22.x
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - || {
      err "NodeSource 安装失败，请手动安装 Node.js 22.19+ 或 24+（https://nodejs.org/）。"; exit 1; }
    apt-get install -y nodejs || {
      err "apt 安装 nodejs 失败（可能需要 sudo 试试：sudo apt-get install -y nodejs）。"; exit 1; }
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs || {
      err "dnf 安装 nodejs 失败，请手动安装 Node.js 22.19+ 或 24+（https://nodejs.org/）。"; exit 1; }
  elif command -v brew >/dev/null 2>&1; then
    brew install node@22 || {
      err "brew 安装 node 失败，请手动安装 Node.js 22.19+ 或 24+（https://nodejs.org/）。"; exit 1; }
  else
    err "没有可用的包管理器，请手动安装 Node.js 22.19+ 或 24+（https://nodejs.org/）后重跑。"
    exit 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js 装完仍不可用，可能需要新开一个终端再重跑本脚本。"
    exit 1
  fi
  check_node_version
fi

# ── 2. git（缺了自动安装） ──
if command -v git >/dev/null 2>&1; then
  ok "git $(git --version | sed 's/git version //') ✓"
else
  say "未找到 git，正在自动安装…"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get install -y git || {
      err "apt 安装 git 失败（可能需要 sudo 试试：sudo apt-get install -y git）。"; exit 1; }
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y git || {
      err "dnf 安装 git 失败，请手动安装后重跑。"; exit 1; }
  elif command -v brew >/dev/null 2>&1; then
    brew install git || {
      err "brew 安装 git 失败，请手动安装后重跑。"; exit 1; }
  else
    err "没有可用的包管理器，请手动安装 git 后重跑。"
    exit 1
  fi
  if ! command -v git >/dev/null 2>&1; then
    err "git 装完仍不可用，可能需要新开一个终端再重跑本脚本。"
    exit 1
  fi
  ok "git ✓"
fi

# ── 3. dsh（DeepSeek Harness，缺了自动安装） ──
if command -v dsh >/dev/null 2>&1; then
  ok "dsh ✓"
else
  say "未找到 dsh（DeepSeek Harness），正在自动安装…"
  # dsh 依赖原生构建，npm 新版会拦截脚本，先放行再装
  npm config set allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs --location=user || true
  npm install -g @deepseek-ai/dsh@0.2.1-alpha.1 || {
    err "dsh 自动安装失败，请手动执行：npm install -g @deepseek-ai/dsh@0.2.1-alpha.1"
    err "然后用 DEEPSEEK_API_KEY=sk-你的key dsh web 先跑一次确认能用，再重跑本脚本。"
    exit 1; }
  ok "dsh ✓"
fi

# ── 4. 首次安装权限与目标目录 ──
# 非 root 仅能重跑已有 .env 的显式 HTTP/反代部署；首次自动 HTTPS 必须监听 80/443。
# 因此 root 要求只在确认是首次安装（尚无 .env）时生效，已安装的普通用户可直接重跑。
require_root() {
  if [ "$(id -u)" = "0" ]; then return 0; fi
  err "首次安装需要 root 权限（自动 HTTPS 会监听 80/443）；请使用 sudo 重跑：$1"
  err "非特权部署请先创建 .env，显式关闭自动 HTTPS 并配置高位端口后再重跑。"
  exit 1
}

# .env 位置与 scripts/install.mjs 同口径：DSH_PASSWORDS_ENV_FILE 优先，否则包根。
env_file_for() {
  if [ -n "${DSH_PASSWORDS_ENV_FILE:-}" ]; then
    printf '%s' "$DSH_PASSWORDS_ENV_FILE"
  else
    printf '%s/.env' "$1"
  fi
}

if [ -n "$SOURCE_DIR" ]; then
  if [ ! -f "$(env_file_for "$SOURCE_DIR")" ]; then
    require_root "sudo bash install.sh"
  fi
  exec node "$SOURCE_DIR/scripts/install.mjs"
fi

DEST="${DSH_PASSWORDS_DIR:-/opt/dsh-passwords}"
if [ -d "$DEST" ]; then
  if [ -f "$DEST/package.json" ] && grep -q '"name": "dsh-passwords"' "$DEST/package.json"; then
    # 已有安装：有 .env 属幂等重跑，普通用户可直接执行；无 .env 仍是首次安装，需要 root。
    if [ ! -f "$(env_file_for "$DEST")" ]; then
      require_root "curl -fsSL https://raw.githubusercontent.com/slywalker2006/dsh-passwords/main/install.sh | sudo bash"
    fi
    say "检测到已有 dsh-passwords 安装，就地执行幂等安装…"
    exec node "$DEST/scripts/install.mjs"
  fi
  err "目标目录已存在且不是 dsh-passwords 安装：$DEST"
  exit 1
fi

# ── 5. 下载项目 + 执行安装 ──
# 目录不存在 => 真正首次安装；下载前先确认 root，避免装到一半才发现无法监听 80/443。
require_root "curl -fsSL https://raw.githubusercontent.com/slywalker2006/dsh-passwords/main/install.sh | sudo bash"
say "下载项目到 $DEST …"
git clone --depth 1 https://github.com/slywalker2006/dsh-passwords.git "$DEST" || {
  err "项目下载失败，请检查网络后重跑。"; exit 1; }
exec node "$DEST/scripts/install.mjs"