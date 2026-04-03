#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# StarNion Release Script
#
# Usage:
#   ./scripts/release.sh 1.2.3                       # full release (tag + push)
#   ./scripts/release.sh 1.2.3 -m "릴리즈 메시지"   # release with message
#   ./scripts/release.sh 1.2.3 --dry                 # goreleaser snapshot (no upload)
#   ./scripts/release.sh --pages                      # deploy docs only (no release)
#
# What this script does (full release):
#   1. Validates the working tree is clean and on main
#   2. Updates docs/install.sh _STARNION_PINNED and commits+pushes to main
#      → triggers GitHub Pages rebuild immediately
#   3. Creates a git tag v<version> and pushes it to origin
#   4. GitHub Actions (release.yml) takes over:
#      - Builds Go binaries (darwin/linux × amd64/arm64) via goreleaser
#      - Packages TypeScript agent + Next.js standalone web into tarballs
#      - Uploads to GitHub Releases
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; GOLD='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}  ℹ  $*${NC}"; }
ok()   { echo -e "${GREEN}  ✓  $*${NC}"; }
warn() { echo -e "${GOLD}  ⚠  $*${NC}"; }
fail() { echo -e "${RED}  ✗  $*${NC}" >&2; exit 1; }

# ─── Parse arguments ─────────────────────────────────────────────────────────
VERSION=""
DRY=0
PAGES_ONLY=0
MESSAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry)        DRY=1 ;;
    --pages)      PAGES_ONLY=1 ;;
    -m|--message) shift; MESSAGE="$1" ;;
    v*)           VERSION="${1#v}" ;;
    [0-9]*)       VERSION="$1" ;;
    *)            fail "Unknown argument: $1" ;;
  esac
  shift
done

# ─── Mode: docs only ─────────────────────────────────────────────────────────
if [[ "$PAGES_ONLY" == "1" ]]; then
  echo
  echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
  echo -e "${GOLD}  ✦  StarNion Docs Deploy                   ${NC}"
  echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
  echo

  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" != "main" ]]; then
    fail "현재 브랜치가 main이 아닙니다: $BRANCH"
  fi

  if git diff --quiet docs/ && git diff --cached --quiet docs/; then
    warn "docs/ 에 변경사항이 없습니다."
  else
    info "docs/ 변경사항 커밋 중..."
    git add docs/
    git commit -m "docs: update documentation site"
    ok "커밋 완료"
  fi

  info "main 브랜치 push 중..."
  git push origin main
  ok "Push 완료"
  echo
  echo -e "  GitHub Actions (pages.yml) 가 자동으로 빌드를 시작합니다."
  echo -e "  확인: ${CYAN}https://github.com/jikime/starnion/actions${NC}"
  echo -e "  사이트: ${CYAN}https://jikime.github.io/starnion/${NC}"
  echo
  exit 0
fi

# ─── Mode: full release ───────────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  echo "Usage:"
  echo "  $0 <version>         # full release (예: 1.2.3)"
  echo "  $0 <version> --dry   # local test (goreleaser snapshot)"
  echo "  $0 --pages           # docs only deploy"
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "버전 형식이 올바르지 않습니다: $VERSION (예: 1.2.3)"
fi

TAG="v${VERSION}"

echo
echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
echo -e "${GOLD}  ✦  StarNion Release ${TAG}                ${NC}"
echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
echo

# ─── Dry run mode ────────────────────────────────────────────────────────────
if [[ "$DRY" == "1" ]]; then
  info "[Dry Run] goreleaser snapshot 빌드 시작..."
  warn "이 모드는 업로드하지 않고 로컬에서만 빌드합니다."
  echo

  if ! command -v goreleaser &>/dev/null; then
    fail "goreleaser 가 설치되어 있지 않습니다.\n  brew install goreleaser"
  fi

  goreleaser release --snapshot --clean
  echo
  ok "Snapshot 빌드 완료. 결과물: dist/"
  ls dist/*.tar.gz 2>/dev/null || ls dist/
  exit 0
fi

# ─── Pre-flight checks ───────────────────────────────────────────────────────
info "Pre-flight 검사 중..."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  fail "main 브랜치에서만 릴리즈할 수 있습니다. 현재: $BRANCH"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "커밋되지 않은 변경사항이 있습니다. 먼저 커밋하세요."
fi

git fetch origin main --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [[ "$LOCAL" != "$REMOTE" ]]; then
  fail "로컬이 origin/main 과 다릅니다. git pull 또는 git push 를 먼저 실행하세요."
fi

if git tag | grep -qx "$TAG"; then
  fail "태그 $TAG 가 이미 로컬에 존재합니다."
fi
if git ls-remote --tags origin | grep -q "refs/tags/${TAG}$"; then
  fail "태그 $TAG 가 이미 원격에 존재합니다."
fi

ok "Pre-flight 검사 통과"

# ─── Update docs/install.sh ──────────────────────────────────────────────────
echo
info "docs/install.sh 버전 업데이트 중..."
INSTALL_SH="docs/install.sh"

perl -i -pe "s/^_STARNION_PINNED=.*/_STARNION_PINNED=\"${VERSION}\"/" "$INSTALL_SH"

if ! grep -qF "_STARNION_PINNED=\"${VERSION}\"" "$INSTALL_SH"; then
  fail "docs/install.sh 업데이트 실패 — _STARNION_PINNED 패턴을 찾을 수 없습니다."
fi

# ─── Update docs/_config.yml ─────────────────────────────────────────────────
info "docs/_config.yml 버전 업데이트 중..."
CONFIG_YML="docs/_config.yml"

perl -i -pe "s/^starnion_version:.*/starnion_version: \"${VERSION}\"/" "$CONFIG_YML"
perl -i -pe "s|releases/tag/v[0-9.]+|releases/tag/v${VERSION}|g" "$CONFIG_YML"
perl -i -pe "s|>v[0-9.]+</a>|>v${VERSION}</a>|g" "$CONFIG_YML"

if ! grep -qF "starnion_version: \"${VERSION}\"" "$CONFIG_YML"; then
  fail "docs/_config.yml 업데이트 실패 — starnion_version 패턴을 찾을 수 없습니다."
fi
ok "_config.yml → v${VERSION}"

git add "$INSTALL_SH" "$CONFIG_YML"
if ! git diff --staged --quiet; then
  git commit -m "chore: bump version to v${VERSION}"
  git push origin main
  ok "docs 버전 → v${VERSION} 업데이트 및 push 완료"
else
  ok "docs 이미 v${VERSION} 상태"
fi

# ─── Confirm ─────────────────────────────────────────────────────────────────
echo
echo -e "  릴리즈 정보:"
echo -e "    버전:   ${CYAN}${TAG}${NC}"
echo -e "    브랜치: ${CYAN}${BRANCH}${NC}"
echo -e "    커밋:   ${CYAN}$(git rev-parse --short HEAD)${NC}"
if [[ -n "$MESSAGE" ]]; then
  echo -e "    메시지: ${CYAN}${MESSAGE}${NC}"
fi
echo
read -rp "  릴리즈를 진행하시겠습니까? [y/N] " confirm
if [[ "$(echo "$confirm" | tr '[:upper:]' '[:lower:]')" != "y" ]]; then
  info "취소되었습니다."
  exit 0
fi

# ─── Create and push tag ─────────────────────────────────────────────────────
echo
info "태그 생성 중: $TAG"
if [[ -n "$MESSAGE" ]]; then
  git tag -a "$TAG" -m "$MESSAGE"
else
  git tag "$TAG"
fi
ok "태그 생성 완료"

info "태그 push 중..."
git push origin "$TAG"
ok "Push 완료"

# ─── Done ────────────────────────────────────────────────────────────────────
echo
echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
echo -e "${GOLD}  ✦  릴리즈 트리거 완료                    ${NC}"
echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
echo
echo -e "  GitHub Actions 가 자동으로 다음을 수행합니다:"
echo -e "    1. Go 바이너리 빌드 (darwin/linux × amd64/arm64)"
echo -e "    2. TypeScript agent 빌드 (pnpm build)"
echo -e "    3. Next.js Web standalone 빌드"
echo -e "    4. tarball 패키징 → GitHub Releases 업로드"
echo
echo -e "  Actions:  ${CYAN}https://github.com/jikime/starnion/actions${NC}"
echo -e "  Release:  ${CYAN}https://github.com/jikime/starnion/releases/tag/${TAG}${NC}"
echo -e "  Docs:     ${CYAN}https://jikime.github.io/starnion/${NC}"
echo
