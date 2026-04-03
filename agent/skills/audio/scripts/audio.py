#!/usr/bin/env python3
"""starnion-audio — Audio transcription CLI for StarNion agent.

Calls OpenAI (gpt-4o-mini-transcribe) or Groq (whisper-large-v3-turbo) STT API.
Provider is auto-selected from the user's providers table (OpenAI first, Groq fallback).

Config priority (highest → lowest):
  1. Environment variables   — Docker / container deployments
  2. ~/.starnion/starnion.yaml — written by `starnion setup`
  3. Hardcoded defaults

Required: DATABASE_URL (or database section in YAML)
Optional: MINIO_* vars (needed when file_url is a /api/files/ path)
"""
import argparse, subprocess, sys, os, json
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

# Gateway base URL (for resolving /api/files/ paths when MinIO is unavailable)
GATEWAY_URL = os.environ.get("GATEWAY_URL") or _yaml.get("gateway_url", "http://localhost:8080")


# ── DB helpers ────────────────────────────────────────────────────────────────
def esc(s: str) -> str:
    return (s or "").replace("'", "''")


# ── Provider lookup ────────────────────────────────────────────────────────────
def get_stt_provider(user_id: str):
    """Return (api_key, endpoint, model) — OpenAI preferred, Groq fallback."""
    row = _psql(
        f"SELECT api_key FROM providers "
        f"WHERE user_id = '{user_id}' AND provider = 'openai' LIMIT 1;",
        DB_URL,
    )
    if row:
        return decrypt_value(row, ENCRYPTION_KEY), "https://api.openai.com/v1/audio/transcriptions", "gpt-4o-mini-transcribe"

    row = _psql(
        f"SELECT api_key FROM providers "
        f"WHERE user_id = '{user_id}' AND provider = 'groq' LIMIT 1;",
        DB_URL,
    )
    if row:
        return decrypt_value(row, ENCRYPTION_KEY), "https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3-turbo"

    return None, None, None


# ── File download ─────────────────────────────────────────────────────────────
def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _signing_key(secret: str, date_stamp: str) -> bytes:
    k = _sign(("AWS4" + secret).encode("utf-8"), date_stamp)
    k = _sign(k, "us-east-1")
    k = _sign(k, "s3")
    return _sign(k, "aws4_request")


def _minio_put(object_key: str, data: bytes, content_type: str = "audio/mpeg") -> None:
    """Upload an object to MinIO using AWS Signature V4 PUT."""
    scheme = "https" if MINIO_USE_SSL else "http"
    host   = MINIO_ENDPOINT

    now        = datetime.now(timezone.utc)
    amz_date   = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    body_hash = hashlib.sha256(data).hexdigest()

    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-content-sha256:{body_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join([
        "PUT",
        f"/{MINIO_BUCKET}/{object_key}",
        "",
        canonical_headers,
        signed_headers,
        body_hash,
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

    url = f"{scheme}://{host}/{MINIO_BUCKET}/{object_key}"
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization":        authorization,
            "Content-Type":         content_type,
            "x-amz-date":           amz_date,
            "x-amz-content-sha256": body_hash,
        },
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as e:
        print(f"❌ MinIO upload error {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ MinIO connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def _minio_get(object_key: str) -> bytes:
    """Download an object from MinIO using AWS Signature V4."""
    scheme = "https" if MINIO_USE_SSL else "http"
    host   = MINIO_ENDPOINT

    now        = datetime.now(timezone.utc)
    amz_date   = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    canonical_headers = (
        f"host:{host}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "host;x-amz-date"
    canonical_request = "\n".join([
        "GET",
        f"/{MINIO_BUCKET}/{object_key}",
        "",
        canonical_headers,
        signed_headers,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",  # empty body hash
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

    url = f"{scheme}://{host}/{MINIO_BUCKET}/{object_key}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": authorization, "x-amz-date": amz_date},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        print(f"❌ MinIO download error {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ MinIO connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def download_audio(file_url: str) -> tuple:
    """Download audio from a URL. Returns (audio_bytes, filename).

    Supports:
      - /api/v1/files/<key>   → extract key, fetch from MinIO
      - /api/files/<key>      → same
      - http(s)://...         → direct HTTP download
    """
    filename = os.path.basename(file_url.split("?")[0]) or "audio.webm"

    # Local gateway path — extract MinIO object key
    for prefix in ("/api/v1/files/", "/api/files/"):
        if file_url.startswith(prefix):
            object_key = file_url[len(prefix):]
            if MINIO_ACCESS_KEY and MINIO_SECRET_KEY:
                audio_bytes = _minio_get(object_key)
            else:
                # Fallback: try gateway HTTP directly
                full_url = GATEWAY_URL.rstrip("/") + file_url
                req = urllib.request.Request(full_url, method="GET")
                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        audio_bytes = resp.read()
                except urllib.error.URLError as e:
                    print(f"❌ File download error: {e}", file=sys.stderr)
                    sys.exit(1)
            return audio_bytes, filename

    # Full HTTP URL
    if file_url.startswith("http://") or file_url.startswith("https://"):
        try:
            with urllib.request.urlopen(file_url, timeout=60) as resp:
                return resp.read(), filename
        except urllib.error.URLError as e:
            print(f"❌ File download error: {e}", file=sys.stderr)
            sys.exit(1)

    print(f"❌ Unsupported file URL format: {file_url}", file=sys.stderr)
    sys.exit(1)


# ── Multipart form helper ─────────────────────────────────────────────────────
def _build_multipart(fields: dict, file_field: str, filename: str, file_bytes: bytes, file_mime: str):
    """Build multipart/form-data body. Returns (body_bytes, content_type_header)."""
    boundary = uuid.uuid4().hex
    lines = []
    for name, value in fields.items():
        lines.append(f"--{boundary}".encode())
        lines.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        lines.append(b"")
        lines.append(value.encode())
    # File part
    lines.append(f"--{boundary}".encode())
    lines.append(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"'.encode()
    )
    lines.append(f"Content-Type: {file_mime}".encode())
    lines.append(b"")
    lines.append(file_bytes)
    lines.append(f"--{boundary}--".encode())

    body = b"\r\n".join(lines)
    content_type = f"multipart/form-data; boundary={boundary}"
    return body, content_type


# ── Transcription API call ────────────────────────────────────────────────────
def _guess_mime(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return {
        ".webm": "audio/webm",
        ".mp3":  "audio/mpeg",
        ".mp4":  "audio/mp4",
        ".m4a":  "audio/mp4",
        ".ogg":  "audio/ogg",
        ".wav":  "audio/wav",
        ".flac": "audio/flac",
    }.get(ext, "audio/webm")


def call_transcription_api(api_key: str, endpoint: str, model: str,
                            audio_bytes: bytes, filename: str, language: str) -> str:
    """POST to transcription API. Returns transcript text."""
    mime = _guess_mime(filename)
    body, content_type = _build_multipart(
        fields={"model": model, "language": language},
        file_field="file",
        filename=filename,
        file_bytes=audio_bytes,
        file_mime=mime,
    )

    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  content_type,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"❌ Transcription API error {e.code}: {err_body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ Network error: {e.reason}", file=sys.stderr)
        sys.exit(1)

    return data.get("text", "")


# ── TTS provider lookup ───────────────────────────────────────────────────────
def get_tts_provider(user_id: str):
    """Return (api_key,) — only OpenAI supports TTS."""
    row = _psql(
        f"SELECT api_key FROM providers "
        f"WHERE user_id = '{user_id}' AND provider = 'openai' LIMIT 1;",
        DB_URL,
    )
    if row:
        return decrypt_value(row, ENCRYPTION_KEY)
    return None


# ── TTS API call ──────────────────────────────────────────────────────────────
def call_tts_api(api_key: str, text: str, voice: str, model: str) -> bytes:
    """POST to OpenAI TTS API. Returns raw MP3 bytes."""
    body = json.dumps({"model": model, "input": text, "voice": voice}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"❌ TTS API error {e.code}: {err_body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ Network error: {e.reason}", file=sys.stderr)
        sys.exit(1)


# ── TTS file save ─────────────────────────────────────────────────────────────
def save_tts_file(mp3_bytes: bytes, user_id: str) -> str:
    """Upload MP3 to MinIO (or local disk). Returns public file URL."""
    filename  = f"tts-{uuid.uuid4().hex[:12]}.mp3"
    object_key = f"users/{user_id}/tts/{filename}"

    if MINIO_ACCESS_KEY and MINIO_SECRET_KEY:
        _minio_put(object_key, mp3_bytes, "audio/mpeg")
    else:
        # Fallback: save to local session dir
        session_dir = os.environ.get("SESSION_DIR", os.path.expanduser("~/.starnion/sessions"))
        local_dir   = os.path.join(session_dir, "uploads", "users", user_id, "tts")
        os.makedirs(local_dir, exist_ok=True)
        with open(os.path.join(local_dir, filename), "wb") as f:
            f.write(mp3_bytes)

    file_url = f"/api/files/{object_key}"

    try:
        _psql(
            f"INSERT INTO files (user_id, name, mime, file_type, url, object_key, size, source, sub_type) "
            f"VALUES ('{esc(user_id)}', '{esc(filename)}', 'audio/mpeg', 'audio', '{esc(file_url)}', "
            f"'{esc(object_key)}', {len(mp3_bytes)}, 'tts', 'tts');",
            DB_URL,
        )
    except Exception:
        pass  # DB save is best-effort

    return file_url


# ── Command: transcribe ────────────────────────────────────────────────────────
def cmd_transcribe(args):
    api_key, endpoint, model = get_stt_provider(args.user_id)
    if not api_key or not endpoint or not model:
        print(
            "❌ OpenAI or Groq API key required for transcription.\n"
            "   Go to Settings → Models → Providers to configure.",
            file=sys.stderr,
        )
        sys.exit(1)

    provider_name = "OpenAI" if "openai.com" in endpoint else "Groq"
    print(f"🎙️  Transcribing... (provider: {provider_name}, model: {model})", flush=True)

    audio_bytes, filename = download_audio(args.file_url)
    print(f"📥 File downloaded: {filename} ({len(audio_bytes) // 1024}KB)", flush=True)

    text = call_transcription_api(api_key, endpoint, model, audio_bytes, filename, args.language)

    if not text:
        print("⚠️  Transcription result is empty.", file=sys.stderr)
        sys.exit(1)

    print(f"✅ Transcription complete!")
    print(f"\nResult:\n{text}")


# ── Command: tts ──────────────────────────────────────────────────────────────
def cmd_tts(args):
    api_key = get_tts_provider(args.user_id)
    if not api_key:
        print(
            "❌ OpenAI API key required for TTS.\n"
            "   Go to Settings → Models → Providers to configure.",
            file=sys.stderr,
        )
        sys.exit(1)

    text = args.text
    if len(text) > 4096:
        print(f"⚠️  Text truncated to 4096 characters (was {len(text)}).", flush=True)
        text = text[:4096]

    print(f"🔊 Generating speech... (voice: {args.voice}, model: {args.model})", flush=True)
    mp3_bytes = call_tts_api(api_key, text, args.voice, args.model)
    print(f"✅ Generated: {len(mp3_bytes) // 1024}KB", flush=True)

    file_url = save_tts_file(mp3_bytes, args.user_id)
    print(f"\n음성 파일 URL: {file_url}")


# ── CLI ────────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="StarNion audio — STT (transcribe) and TTS (tts)")
parser.add_argument("--user-id", required=True, help="User UUID")

sub = parser.add_subparsers(dest="cmd")

p_transcribe = sub.add_parser("transcribe", help="Transcribe an audio file to text")
p_transcribe.add_argument(
    "--file-url", required=True,
    help="Audio file URL (/api/v1/files/<key>, /api/files/<key>, or full http URL)",
)
p_transcribe.add_argument(
    "--language", default="en",
    help="Language code (default: en)",
)

p_tts = sub.add_parser("tts", help="Convert text to speech (MP3)")
p_tts.add_argument("--text", required=True, help="Text to convert to speech")
p_tts.add_argument(
    "--voice", default="nova",
    choices=["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    help="Voice preset (default: nova)",
)
p_tts.add_argument(
    "--model", default="tts-1",
    choices=["tts-1", "tts-1-hd"],
    help="TTS model (default: tts-1; tts-1-hd for higher quality)",
)

args = parser.parse_args()
if args.cmd == "transcribe":
    cmd_transcribe(args)
elif args.cmd == "tts":
    cmd_tts(args)
else:
    parser.print_help()
