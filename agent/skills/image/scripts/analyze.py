#!/usr/bin/env python3
"""starnion-image — Gemini Vision image analysis CLI for StarNion agent.

Usage:
  python3 image/scripts/analyze.py \
    --user-id {user_id} \
    --file-url {image_url} \
    [--query "이미지를 분석해주세요."]
"""
import argparse, sys, os, json, base64
import urllib.request, urllib.error

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import _load_starnion_yaml, decrypt_value, psql as _psql

_yaml = _load_starnion_yaml()
_db   = _yaml.get("database", {}) if isinstance(_yaml.get("database"), dict) else {}
_auth = _yaml.get("auth", {}) if isinstance(_yaml.get("auth"), dict) else {}

_db_url_default = (
    f"postgresql://{_db.get('user','postgres')}:{_db.get('password','')}"
    f"@{_db.get('host','localhost')}:{_db.get('port','5432')}"
    f"/{_db.get('name','starnion')}?sslmode={_db.get('ssl_mode','disable')}"
) if _db else ""

DB_URL         = os.environ.get("DATABASE_URL") or _db_url_default
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY") or _auth.get("encryption_key", "")
GATEWAY_URL    = os.environ.get("GATEWAY_URL", "http://localhost:8080").rstrip("/")

# Same model as image generation for consistency
GEMINI_VISION_MODEL = "gemini-3.1-flash-image-preview"
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_VISION_MODEL}:generateContent"
)

if not DB_URL:
    print("❌ DATABASE_URL not configured.", file=sys.stderr)
    sys.exit(1)


def esc(s: str) -> str:
    return (s or "").replace("'", "''")


def get_gemini_api_key(user_id: str) -> str | None:
    """Look up Gemini API key from DB (integration_keys → providers)."""
    row = _psql(
        f"SELECT api_key FROM integration_keys "
        f"WHERE user_id = '{user_id}' AND provider = 'gemini' LIMIT 1;",
        DB_URL,
    )
    if row:
        return decrypt_value(row, ENCRYPTION_KEY)
    row = _psql(
        f"SELECT api_key FROM providers "
        f"WHERE user_id = '{user_id}' AND provider = 'gemini' LIMIT 1;",
        DB_URL,
    )
    if row:
        return decrypt_value(row, ENCRYPTION_KEY)
    return None


def resolve_url(file_url: str) -> str:
    """Resolve relative /api/files/... paths to absolute using GATEWAY_URL."""
    if file_url.startswith("http"):
        return file_url
    return GATEWAY_URL + file_url


def fetch_image(url: str) -> tuple[bytes, str]:
    """Fetch image bytes and detect MIME type."""
    url = resolve_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": "StarNion-Agent/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
            data = resp.read()
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP {e.code} fetching image: {url}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ Network error fetching image: {e.reason}", file=sys.stderr)
        sys.exit(1)

    # Fallback MIME from extension
    lower = url.lower().split("?")[0]
    if content_type == "application/octet-stream":
        if lower.endswith(".png"):
            content_type = "image/png"
        elif lower.endswith(".gif"):
            content_type = "image/gif"
        elif lower.endswith(".webp"):
            content_type = "image/webp"
        else:
            content_type = "image/jpeg"

    return data, content_type


def analyze_with_gemini(api_key: str, image_bytes: bytes, mime_type: str, query: str) -> str:
    """Call Gemini Vision API with the image and return analysis text."""
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    body = json.dumps({
        "contents": [{
            "parts": [
                {"text": query},
                {"inline_data": {"mime_type": mime_type, "data": b64}},
            ]
        }],
        "generationConfig": {
            "maxOutputTokens": 2048,
            "temperature": 0.4,
        },
    }).encode()

    req = urllib.request.Request(
        GEMINI_API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"❌ Gemini API error {e.code}: {err}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ Gemini network error: {e.reason}", file=sys.stderr)
        sys.exit(1)

    candidates = data.get("candidates", [])
    if not candidates:
        print(f"❌ No candidates from Gemini: {json.dumps(data)[:300]}", file=sys.stderr)
        sys.exit(1)

    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [p.get("text", "") for p in parts if "text" in p]
    return "\n".join(texts).strip()


def cmd_analyze(args):
    api_key = get_gemini_api_key(args.user_id)
    if not api_key:
        print(
            "❌ Gemini API key is not configured.\n"
            "   Go to Web UI → Integrations → Gemini to register your API key.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"🔍 Fetching image: {args.file_url.split('/')[-1]}", flush=True, file=sys.stderr)
    image_bytes, mime_type = fetch_image(args.file_url)
    print(f"📐 Image size: {len(image_bytes) // 1024}KB | MIME: {mime_type}", flush=True, file=sys.stderr)

    print("🤖 Analyzing with Gemini Vision...", flush=True, file=sys.stderr)
    result = analyze_with_gemini(api_key, image_bytes, mime_type, args.query)

    # Persist analysis result to files table
    try:
        name = args.file_url.rstrip("/").split("/")[-1] or "image"
        _psql(
            f"INSERT INTO files (user_id, url, name, mime, file_type, size, source, sub_type, prompt, analysis) "
            f"VALUES ('{args.user_id}', '{esc(args.file_url)}', '{esc(name)}', '{mime_type}', "
            f"'image', {len(image_bytes)}, 'web', 'analyzed', '{esc(args.query)}', '{esc(result)}') "
            f"ON CONFLICT DO NOTHING;",
            DB_URL,
        )
    except Exception:
        pass  # DB save is best-effort

    print(result)


# ── CLI ────────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="StarNion image analysis via Gemini Vision")
parser.add_argument("--user-id", required=True, help="User UUID")

sub = parser.add_subparsers(dest="cmd")

p_analyze = sub.add_parser("analyze", help="Analyze an image from URL")
p_analyze.add_argument("--file-url", required=True, help="Image URL (MinIO or /api/files/...)")
p_analyze.add_argument(
    "--query",
    default="이 이미지를 자세히 분석해주세요.",
    help="Analysis query / question about the image",
)

args = parser.parse_args()
if args.cmd == "analyze":
    cmd_analyze(args)
else:
    parser.print_help()
