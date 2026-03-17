#!/usr/bin/env bash
# StarNion Installer
# Usage: curl -fsSL https://jikime.github.io/starnion/install.sh | bash
#
# Environment variables:
#   STARNION_VERSION  — install specific version (default: latest from releases)
#   STARNION_DIR      — install directory (default: /usr/local/bin or ~/.local/bin)
#   NO_PROMPT=1       — skip all interactive prompts
set -euo pipefail
# When invoked via `bash -s` (e.g. starnion update), the inherited cwd may be
# a directory that no longer exists, causing getcwd to fail inside subshells.
# Switch to a guaranteed-valid directory immediately.
cd "${HOME:-/tmp}"

# ── Pinned version (updated automatically on release) ─────────────────────────
# _STARNION_PINNED is the auto-bumped default; STARNION_VERSION env var overrides it.
# Using a separate variable prevents the assignment from clobbering an env override.
_STARNION_PINNED="1.5.16"
STARNION_VERSION="${STARNION_VERSION:-$_STARNION_PINNED}"

# ── Colors ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]] && [[ "${NO_COLOR:-}" == "" ]]; then
  GOLD='\033[0;33m'
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  CYAN='\033[0;36m'
  DIM='\033[2m'
  NC='\033[0m'
else
  GOLD='' GREEN='' RED='' CYAN='' DIM='' NC=''
fi

info()    { echo -e "${CYAN}  ℹ  $*${NC}"; }
ok()      { echo -e "${GREEN}  ✓  $*${NC}"; }
warn()    { echo -e "${GOLD}  ⚠  $*${NC}"; }
fail()    { echo -e "${RED}  ✗  $*${NC}" >&2; exit 1; }
dim()     { echo -e "${DIM}      $*${NC}"; }

REPO="jikime/starnion"
BINARY="starnion"
TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT

# ── Banner ────────────────────────────────────────────────────────────────────
echo
echo -e "${GOLD}  ╔══════════════════════════════════════╗${NC}"
echo -e "${GOLD}  ║     ✦  StarNion  Installer  ✦        ║${NC}"
echo -e "${GOLD}  ╚══════════════════════════════════════╝${NC}"
echo

# ── Detect downloader ─────────────────────────────────────────────────────────
DOWNLOADER=""
if command -v curl &>/dev/null; then
  DOWNLOADER="curl"
elif command -v wget &>/dev/null; then
  DOWNLOADER="wget"
else
  fail "curl 또는 wget이 필요합니다."
fi

download() {
  local url="$1" out="$2"
  if [[ "$DOWNLOADER" == "curl" ]]; then
    curl -fsSL --retry 3 --retry-delay 1 -o "$out" "$url"
  else
    wget -q --tries=3 --timeout=20 -O "$out" "$url"
  fi
}

# ── Detect OS & arch ──────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux"  ;;
  *) fail "지원하지 않는 운영체제: $OS (macOS 또는 Linux만 지원)" ;;
esac

case "$ARCH" in
  x86_64|amd64)   ARCH="amd64" ;;
  arm64|aarch64)  ARCH="arm64" ;;
  *) fail "지원하지 않는 아키텍처: $ARCH (amd64 또는 arm64만 지원)" ;;
esac

info "OS: ${OS} / Arch: ${ARCH}"

# ── Resolve version ───────────────────────────────────────────────────────────
VERSION="${STARNION_VERSION}"

# If "latest" or "dev", resolve from GitHub API
if [[ "$VERSION" == "latest" || "$VERSION" == "dev" ]]; then
  info "최신 버전 조회 중..."
  RELEASES_URL="https://api.github.com/repos/${REPO}/releases/latest"
  RELEASE_JSON="$TMPDIR_WORK/release.json"
  if download "$RELEASES_URL" "$RELEASE_JSON" 2>/dev/null; then
    VERSION="$(grep '"tag_name"' "$RELEASE_JSON" | sed 's/.*"v\([^"]*\)".*/\1/' | head -1)"
  fi
fi

if [[ -z "$VERSION" ]]; then
  fail "버전을 확인할 수 없습니다. STARNION_VERSION 환경변수로 지정하세요."
fi

info "설치 버전: v${VERSION}"

# ── Check existing install ────────────────────────────────────────────────────
if command -v starnion &>/dev/null; then
  CURRENT="$(starnion version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
  if [[ -n "$CURRENT" && "$CURRENT" == "$VERSION" ]]; then
    ok "StarNion v${VERSION}이 이미 설치되어 있습니다."
    exit 0
  fi
  if [[ -n "$CURRENT" ]]; then
    info "현재 버전 v${CURRENT} → v${VERSION}으로 업데이트합니다."
  fi
fi

# ── Determine install directory ───────────────────────────────────────────────
if [[ -n "${STARNION_DIR:-}" ]]; then
  INSTALL_DIR="$STARNION_DIR"
elif [[ -w "/usr/local/bin" ]]; then
  INSTALL_DIR="/usr/local/bin"
elif sudo -n true 2>/dev/null; then
  INSTALL_DIR="/usr/local/bin"
  USE_SUDO=1
else
  INSTALL_DIR="${HOME}/.local/bin"
fi

USE_SUDO="${USE_SUDO:-0}"

# If INSTALL_DIR was explicitly specified (e.g. by starnion update) but is not
# writable by the current user, fall back to sudo automatically.
if [[ -n "${STARNION_DIR:-}" && "$USE_SUDO" == "0" && ! -w "$INSTALL_DIR" ]]; then
  if sudo -n true 2>/dev/null || sudo true 2>/dev/null; then
    USE_SUDO=1
  else
    warn "${INSTALL_DIR}에 쓰기 권한이 없습니다. sudo 없이 진행합니다 (실패할 수 있음)."
  fi
fi

mkdir -p "$INSTALL_DIR"
info "설치 위치: ${INSTALL_DIR}"

# ── Download ──────────────────────────────────────────────────────────────────
ASSET="starnion_${OS}_${ARCH}.tar.gz"
BASE_URL="https://github.com/${REPO}/releases/download/v${VERSION}"
TARBALL_URL="${BASE_URL}/${ASSET}"
CHECKSUMS_URL="${BASE_URL}/checksums.txt"

TARBALL="$TMPDIR_WORK/$ASSET"
CHECKSUMS="$TMPDIR_WORK/checksums.txt"

info "다운로드 중..."
dim "$TARBALL_URL"

if ! download "$TARBALL_URL" "$TARBALL"; then
  fail "다운로드 실패: $TARBALL_URL"
fi

# ── Verify checksum ───────────────────────────────────────────────────────────
if download "$CHECKSUMS_URL" "$CHECKSUMS" 2>/dev/null; then
  info "체크섬 검증 중..."
  (cd "$TMPDIR_WORK" && grep "$ASSET" checksums.txt | \
    { command -v sha256sum &>/dev/null && sha256sum --check --ignore-missing || \
      shasum -a 256 --check --ignore-missing; } >/dev/null 2>&1) \
    && ok "체크섬 검증 완료" \
    || warn "체크섬 검증 실패 — 계속 진행합니다 (신뢰할 수 있는 소스에서만 설치하세요)"
else
  warn "checksums.txt를 가져올 수 없습니다 — 검증 건너뜀"
fi

# ── Extract & install ─────────────────────────────────────────────────────────
info "설치 중..."
tar -xzf "$TARBALL" -C "$TMPDIR_WORK"

# Install CLI binary
BINARY_SRC="$TMPDIR_WORK/$BINARY"
if [[ ! -f "$BINARY_SRC" ]]; then
  fail "바이너리를 찾을 수 없습니다: $BINARY_SRC"
fi
chmod +x "$BINARY_SRC"

BINARY_DEST="${INSTALL_DIR}/${BINARY}"
if [[ "$USE_SUDO" == "1" ]]; then
  sudo mv "$BINARY_SRC" "$BINARY_DEST"
else
  mv "$BINARY_SRC" "$BINARY_DEST"
fi

# Install gateway server binary, agent and ui to ~/.starnion/
STARNION_HOME="${HOME}/.starnion"
mkdir -p "${STARNION_HOME}/bin"

GW_SRC="$TMPDIR_WORK/starnion-gateway"
if [[ -f "$GW_SRC" ]]; then
  chmod +x "$GW_SRC"
  mv "$GW_SRC" "${STARNION_HOME}/bin/starnion-gateway"
fi

if [[ -d "$TMPDIR_WORK/agent" ]]; then
  rm -rf "${STARNION_HOME}/agent"
  mv "$TMPDIR_WORK/agent" "${STARNION_HOME}/agent"
fi

if [[ -d "$TMPDIR_WORK/ui" ]]; then
  rm -rf "${STARNION_HOME}/ui"
  mv "$TMPDIR_WORK/ui" "${STARNION_HOME}/ui"
fi

# Install docker/ files to ~/.starnion/docker/
# starnion.yaml is never touched (it is the user's config source of truth).
# docker/.env contains DB credentials — back it up, replace the whole dir, restore it.
if [[ -d "$TMPDIR_WORK/docker" ]]; then
  DOCKER_ENV_BACKUP=""
  if [[ -f "${STARNION_HOME}/docker/.env" ]]; then
    DOCKER_ENV_BACKUP="$(cat "${STARNION_HOME}/docker/.env")"
  fi
  rm -rf "${STARNION_HOME}/docker"
  mv "$TMPDIR_WORK/docker" "${STARNION_HOME}/docker"
  if [[ -n "$DOCKER_ENV_BACKUP" ]]; then
    printf '%s' "$DOCKER_ENV_BACKUP" > "${STARNION_HOME}/docker/.env"
  fi
fi

ok "StarNion v${VERSION} 설치 완료 → ${BINARY_DEST}"
ok "런타임 파일 설치 완료 → ${STARNION_HOME}/"

# ── PATH check ────────────────────────────────────────────────────────────────
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo
  warn "${INSTALL_DIR}이 PATH에 없습니다. 쉘 프로필에 추가하세요:"
  echo
  echo -e "    ${DIM}# ~/.bashrc 또는 ~/.zshrc에 추가${NC}"
  echo -e "    ${CYAN}export PATH=\"${INSTALL_DIR}:\$PATH\"${NC}"
  echo
  warn "추가 후 터미널을 재시작하거나 다음을 실행하세요:"
  echo -e "    ${CYAN}source ~/.zshrc${NC}  또는  ${CYAN}source ~/.bashrc${NC}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
echo -e "${GOLD}  ✦  설치 완료  ✦${NC}"
echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
echo
echo -e "  시작하기:"
dim "1) PostgreSQL + MinIO 시작 (기존 서버가 있으면 건너뜀)"
dim "   cp ~/.starnion/docker/.env.example ~/.starnion/docker/.env"
dim "   docker compose -f ~/.starnion/docker/docker-compose.yml up -d postgres minio"
echo
dim "2) 초기 설정 및 실행"
dim "   starnion setup      # 초기 설정 마법사"
dim "   starnion dev        # 전체 서비스 실행"
echo
dim "starnion update     # 최신 버전으로 업데이트"
echo
