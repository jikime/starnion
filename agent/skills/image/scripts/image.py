#!/usr/bin/env python3
"""starnion-image — Gemini image generation CLI for StarNion agent.

Config priority (highest → lowest):
  1. Environment variables   — Docker / container deployments
  2. ~/.starnion/starnion.yaml — written by `starnion setup`
  3. Hardcoded defaults

Required: DATABASE_URL (or database section in YAML),
          MINIO_ACCESS_KEY / MINIO_SECRET_KEY (or minio section in YAML)
"""
import argparse, subprocess, sys, os, json, base64
import hashlib, hmac, uuid
import urllib.request, urllib.error
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import _load_starnion_yaml, decrypt_value, psql as _psql


_yaml = _load_starnion_yaml()
_db   = _yaml.get("database", {}) if isinstance(_yaml.get("database"), dict) else {}
_mn   = _yaml.get("minio",    {}) if isinstance(_yaml.get("minio"),    dict) else {}

# Database — env var > YAML > default
_db_url_default = (
    f"postgresql://{_db.get('user','postgres')}:{_db.get('password','')}"
    f"@{_db.get('host','localhost')}:{_db.get('port','5432')}"
    f"/{_db.get('name','starnion')}?sslmode={_db.get('ssl_mode','disable')}"
) if _db else ""

DB_URL = os.environ.get("DATABASE_URL") or _db_url_default

_auth = _yaml.get("auth", {}) if isinstance(_yaml.get("auth"), dict) else {}
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY") or _auth.get("encryption_key", "")

if not DB_URL:
    print("❌ DATABASE_URL is not set. Configure the environment variable or check ~/.starnion/starnion.yaml.", file=sys.stderr)
    sys.exit(1)

# MinIO — env var > YAML > default
MINIO_ENDPOINT   = os.environ.get("MINIO_ENDPOINT")   or _mn.get("endpoint",   "localhost:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY") or _mn.get("access_key", "")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY") or _mn.get("secret_key", "")
MINIO_BUCKET     = os.environ.get("MINIO_BUCKET")     or _mn.get("bucket",     "starnion-files")
MINIO_USE_SSL    = (
    os.environ.get("MINIO_USE_SSL", "").lower() == "true"
    or str(_mn.get("use_ssl", "false")).lower() == "true"
)

GEMINI_MODEL = "gemini-3.1-flash-image-preview"
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)


# ── DB helpers ────────────────────────────────────────────────────────────────
def esc(s: str) -> str:
    return (s or "").replace("'", "''")


def get_gemini_api_key(user_id: str) -> str | None:
    """Look up Gemini API key: integration_keys first, then providers table."""
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


# ── Gemini image generation ───────────────────────────────────────────────────
def generate_image_gemini(api_key: str, prompt: str, aspect_ratio: str = "1:1"):
    """Call Gemini generateContent API. Returns (image_bytes, mime_type)."""
    # aspect_ratio is appended to the prompt — Gemini image generation
    # does not support imageGenerationConfig in the generateContent API.
    ratio_hint = f" Aspect ratio: {aspect_ratio}." if aspect_ratio != "1:1" else ""
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt + ratio_hint}]}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
        },
    }).encode()

    req = urllib.request.Request(
        GEMINI_API_URL,
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"❌ Gemini API error {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ Network error: {e.reason}", file=sys.stderr)
        sys.exit(1)

    candidates = data.get("candidates", [])
    if not candidates:
        print(f"❌ No candidates in Gemini response: {json.dumps(data)[:300]}", file=sys.stderr)
        sys.exit(1)

    for part in candidates[0].get("content", {}).get("parts", []):
        if "inlineData" in part:
            inline = part["inlineData"]
            return base64.b64decode(inline["data"]), inline.get("mimeType", "image/png")

    print("❌ No image found in Gemini response.", file=sys.stderr)
    sys.exit(1)


# ── MinIO direct upload (AWS Signature V4, stdlib only) ──────────────────────
def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _signing_key(secret: str, date_stamp: str) -> bytes:
    k = _sign(("AWS4" + secret).encode("utf-8"), date_stamp)
    k = _sign(k, "us-east-1")
    k = _sign(k, "s3")
    return _sign(k, "aws4_request")


def upload_to_minio(img_bytes: bytes, object_key: str, content_type: str) -> str:
    """PUT object to MinIO using AWS Signature V4. Returns the /api/files URL."""
    if not MINIO_ACCESS_KEY or not MINIO_SECRET_KEY:
        print(
            "❌ MinIO credentials not configured.\n"
            "   Check the minio section in ~/.starnion/starnion.yaml.",
            file=sys.stderr,
        )
        sys.exit(1)

    scheme  = "https" if MINIO_USE_SSL else "http"
    host    = MINIO_ENDPOINT
    url     = f"{scheme}://{host}/{MINIO_BUCKET}/{object_key}"

    now        = datetime.now(timezone.utc)
    amz_date   = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    payload_hash = hashlib.sha256(img_bytes).hexdigest()

    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join([
        "PUT",
        f"/{MINIO_BUCKET}/{object_key}",
        "",
        canonical_headers,
        signed_headers,
        payload_hash,
    ])

    credential_scope = f"{date_stamp}/us-east-1/s3/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        hashlib.sha256(canonical_request.encode()).hexdigest(),
    ])

    sig = hmac.new(
        _signing_key(MINIO_SECRET_KEY, date_stamp),
        string_to_sign.encode(),
        hashlib.sha256,
    ).hexdigest()

    authorization = (
        f"AWS4-HMAC-SHA256 Credential={MINIO_ACCESS_KEY}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={sig}"
    )

    req = urllib.request.Request(
        url,
        data=img_bytes,
        headers={
            "Authorization":        authorization,
            "Content-Type":         content_type,
            "x-amz-date":           amz_date,
            "x-amz-content-sha256": payload_hash,
        },
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            _ = resp.read()
    except urllib.error.HTTPError as e:
        print(f"❌ MinIO upload error {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ MinIO connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)

    return f"/api/files/{object_key}"


# ── Command: generate ─────────────────────────────────────────────────────────
def cmd_generate(args):
    api_key = get_gemini_api_key(args.user_id)
    if not api_key:
        print(
            "❌ Gemini API key is not configured.\n"
            "   Go to Web UI → Integrations → Gemini to register your API key.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"🎨 Generating image... (prompt: {args.prompt[:60]})", flush=True)
    img_bytes, mime = generate_image_gemini(api_key, args.prompt, args.aspect_ratio)

    ext = ".jpg" if "jpeg" in mime or "jpg" in mime else (".webp" if "webp" in mime else ".png")
    object_key = (
        f"users/{args.user_id}/"
        f"{datetime.now(timezone.utc).strftime('%Y')}/"
        f"{uuid.uuid4()}{ext}"
    )

    print("☁️  Uploading to MinIO...", flush=True)
    file_url = upload_to_minio(img_bytes, object_key, mime)

    _psql(
        f"INSERT INTO files (user_id, url, name, mime, file_type, size, source, sub_type, prompt) "
        f"VALUES ('{args.user_id}', '{file_url}', 'generated{ext}', '{mime}', "
        f"'image', {len(img_bytes)}, 'gemini', 'generated', '{esc(args.prompt)}');",
        DB_URL,
    )

    print(f"✅ Image generated!")
    print(f"Size: {len(img_bytes) // 1024}KB | Aspect ratio: {args.aspect_ratio}")
    print(f"\nImage URL: {file_url}")
    print(f"\nMarkdown:")
    print(f"![Generated image]({file_url})")


# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="StarNion image generation via Gemini")
parser.add_argument("--user-id", required=True, help="User UUID")

sub = parser.add_subparsers(dest="cmd")

p_gen = sub.add_parser("generate", help="Generate an image from a text prompt")
p_gen.add_argument("--prompt", required=True, help="Image description")
p_gen.add_argument(
    "--aspect-ratio",
    default="1:1",
    choices=["1:1", "16:9", "9:16", "4:3", "3:4"],
    help="Aspect ratio (default: 1:1)",
)

args = parser.parse_args()
if args.cmd == "generate":
    cmd_generate(args)
else:
    parser.print_help()
