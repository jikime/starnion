#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Starnion Release Script
#
# Usage:
#   ./scripts/release.sh 1.2.3          # full release (tag + push)
#   ./scripts/release.sh 1.2.3 --dry    # goreleaser snapshot (no upload)
#   ./scripts/release.sh --pages        # deploy docs only (no release)
#
# What this script does (full release):
#   1. Validates the working tree is clean and on main
#   2. Creates a git tag v<version>
#   3. Pushes the tag to origin
#   4. GitHub Actions (release.yml) takes over:
#      - Builds Go binaries (darwin/linux × amd64/arm64) via goreleaser
#      - Packages Next.js standalone UI + Python agent source into tarballs
#      - Uploads to GitHub Releases
#      - Updates docs/install.sh with new version → triggers Pages rebuild
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

for arg in "$@"; do
  case "$arg" in
    --dry)        DRY=1 ;;
    --pages)      PAGES_ONLY=1 ;;
    v*)           VERSION="${arg#v}" ;;
    [0-9]*)       VERSION="$arg" ;;
    *)            fail "Unknown argument: $arg" ;;
  esac
done

# ─── Mode: docs only ─────────────────────────────────────────────────────────
if [[ "$PAGES_ONLY" == "1" ]]; then
  echo
  echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
  echo -e "${GOLD}  ✦  Starnion Docs Deploy                  ${NC}"
  echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
  echo

  # Check we're on main
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" != "main" ]]; then
    fail "현재 브랜치가 main이 아닙니다: $BRANCH"
  fi

  # Stage docs changes
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

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "버전 형식이 올바르지 않습니다: $VERSION (예: 1.2.3)"
fi

TAG="v${VERSION}"

echo
echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
echo -e "${GOLD}  ✦  Starnion Release ${TAG}               ${NC}"
echo -e "${GOLD}  ══════════════════════════════════════════${NC}"
echo

# ─── Dry run mode: goreleaser snapshot ───────────────────────────────────────
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

# Must be on main branch
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  fail "main 브랜치에서만 릴리즈할 수 있습니다. 현재: $BRANCH"
fi

# Working tree must be clean
if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "커밋되지 않은 변경사항이 있습니다. 먼저 커밋하세요."
fi

# Must be in sync with remote
git fetch origin main --quiet
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [[ "$LOCAL" != "$REMOTE" ]]; then
  fail "로컬이 origin/main 과 다릅니다. git pull 또는 git push 를 먼저 실행하세요."
fi

# Tag must not already exist
if git tag | grep -qx "$TAG"; then
  fail "태그 $TAG 가 이미 존재합니다."
fi

ok "Pre-flight 검사 통과"

# ─── Confirm ─────────────────────────────────────────────────────────────────
echo
echo -e "  릴리즈 정보:"
echo -e "    버전:   ${CYAN}${TAG}${NC}"
echo -e "    브랜치: ${CYAN}${BRANCH}${NC}"
echo -e "    커밋:   ${CYAN}$(git rev-parse --short HEAD)${NC}"
echo
read -rp "  릴리즈를 진행하시겠습니까? [y/N] " confirm
if [[ "${confirm,,}" != "y" ]]; then
  info "취소되었습니다."
  exit 0
fi

# ─── Create and push tag ─────────────────────────────────────────────────────
echo
info "태그 생성 중: $TAG"
git tag "$TAG"
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
echo -e "    2. Next.js UI standalone 빌드"
echo -e "    3. tarball 패키징 → GitHub Releases 업로드"
echo -e "    4. docs/install.sh 버전 자동 업데이트"
echo -e "    5. GitHub Pages 재빌드"
echo
echo -e "  Actions:  ${CYAN}https://github.com/jikime/starnion/actions${NC}"
echo -e "  Release:  ${CYAN}https://github.com/jikime/starnion/releases/tag/${TAG}${NC}"
echo -e "  Docs:     ${CYAN}https://jikime.github.io/starnion/${NC}"
echo
