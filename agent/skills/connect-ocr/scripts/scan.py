#!/usr/bin/env python3
"""starnion-connect-ocr — Gemini Vision business-card OCR CLI for StarNion agent.

Emits a JSON object on stdout that matches the
POST /api/v1/connections/scan-business-card payload shape. The agent
is responsible for actually calling the gateway with it — this script
does OCR only.

BR-SOCIAL-3: this script never populates social_profiles. The output
shape deliberately omits that field so even if Gemini hallucinates a
Facebook handle it cannot leak into the Connect row.

Usage:
  python3 connect-ocr/scripts/scan.py \\
    --user-id {user_id} scan \\
    --file-url {image_url} \\
    [--meeting-location "{where you met}"]
"""
import argparse, sys, os, json, base64, re
from datetime import datetime, timezone
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

GEMINI_MODEL = "gemini-3.1-flash-image-preview"
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

if not DB_URL:
    print("❌ DATABASE_URL not configured.", file=sys.stderr)
    sys.exit(1)


def get_gemini_api_key(user_id: str):
    """Look up the user's Gemini API key from integration_keys → providers."""
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
    if file_url.startswith("http"):
        return file_url
    return GATEWAY_URL + file_url


def fetch_image(url: str):
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

    lower = url.lower().split("?")[0]
    if content_type == "application/octet-stream":
        if lower.endswith(".png"):
            content_type = "image/png"
        elif lower.endswith(".webp"):
            content_type = "image/webp"
        else:
            content_type = "image/jpeg"
    return data, content_type


# Gemini free-text response often wraps JSON in ```json fences. This
# regex peels the first fenced block; if no fences are present we fall
# back to the first `{`..matching `}` slice.
_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _extract_json_object(text: str):
    """Pull the first JSON object from a Gemini response. Returns a dict
    or raises ValueError."""
    text = (text or "").strip()
    if not text:
        raise ValueError("empty response")
    m = _FENCE_RE.search(text)
    if m:
        text = m.group(1)
    else:
        # Naive slice from first `{` to matching `}`. Good enough for a
        # single top-level object; business-card output never contains
        # nested braces in string values except curly quotes, which we
        # don't care about.
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end < 0 or end <= start:
            raise ValueError("no JSON object in response")
        text = text[start:end + 1]
    return json.loads(text)


OCR_PROMPT = """You are a business-card OCR assistant. Extract structured
contact information from the attached business card image.

Return ONE JSON object ONLY, with no commentary, no markdown, exactly
these keys (use empty string "" when a field is not visible):

{
  "name": "",              // person's full name (prefer native script)
  "role": "",              // job title (e.g. "Product Manager")
  "company": "",           // company name as shown on the card
  "email": "",             // primary email address
  "phone": "",             // primary phone (E.164 format if possible)
  "company_name_en": "",   // English/Latin-script company name if visible
  "dept": "",              // department / team
  "address": "",           // street / office address
  "website": "",           // full URL starting with http/https
  "fax": "",               // fax number
  "ocr_raw_text": ""       // every line of visible text, newline-separated
}

DO NOT add any other keys. DO NOT include social-media or SNS handles
(facebook, instagram, linkedin, x/twitter, threads) — those must be
entered manually by the user later. If the card shows multiple emails
or phones, pick the first primary one and dump the rest into
`ocr_raw_text`.
"""


def analyze_with_gemini(api_key: str, image_bytes: bytes, mime_type: str):
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    body = json.dumps({
        "contents": [{
            "parts": [
                {"text": OCR_PROMPT},
                {"inline_data": {"mime_type": mime_type, "data": b64}},
            ]
        }],
        "generationConfig": {
            "maxOutputTokens": 2048,
            "temperature": 0.1,  # OCR → want determinism
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
    text = "\n".join(p.get("text", "") for p in parts if "text" in p).strip()
    try:
        return _extract_json_object(text)
    except (ValueError, json.JSONDecodeError) as e:
        print(f"❌ Could not parse Gemini OCR JSON: {e}\nraw:\n{text[:500]}", file=sys.stderr)
        sys.exit(1)


# ── Allow-listed keys. Anything else Gemini emits is dropped on the
# floor BEFORE we build the POST body — the gateway also rejects
# unknown fields, but this is belt-and-braces. Note: `social_*` is
# deliberately NOT in this list (BR-SOCIAL-3).
_ALLOWED_BC_KEYS = {
    "company_name_en", "dept", "address", "website", "fax", "ocr_raw_text"
}
_ALLOWED_TOP_KEYS = {"name", "role", "company", "email", "phone"}


def _nonempty(s):
    return s if isinstance(s, str) and s.strip() else None


def build_payload(ocr, file_url: str, meeting_location: str | None):
    """Turn the Gemini OCR dict into a POST body for the gateway's
    scan-business-card endpoint. Fields we can't confidently fill are
    omitted (None) so the gateway defaults kick in."""
    top = {
        "name": (ocr.get("name") or "").strip(),
        "role": _nonempty(ocr.get("role")),
        "company": _nonempty(ocr.get("company")),
        "email": _nonempty(ocr.get("email")),
        "phone": _nonempty(ocr.get("phone")),
        "meeting_location": _nonempty(meeting_location),
        "tags": [],
    }
    if not top["name"]:
        print("❌ OCR did not produce a name field — cannot register without a name.", file=sys.stderr)
        sys.exit(2)

    bc = {
        "image_url": file_url,  # gateway requires this
        "scanned_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    for k in _ALLOWED_BC_KEYS:
        v = ocr.get(k)
        if isinstance(v, str) and v.strip():
            bc[k] = v.strip()

    top["business_card"] = bc
    # BR-SOCIAL-3: strip any social_profiles Gemini may have hallucinated.
    # Our prompt forbids it but we defend in depth.
    top.pop("social_profiles", None)
    return top


def cmd_scan(args):
    api_key = get_gemini_api_key(args.user_id)
    if not api_key:
        print(
            "❌ Gemini API key is not configured.\n"
            "   Go to Web UI → Integrations → Gemini to register your API key.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"🔍 Fetching card image: {args.file_url.split('/')[-1]}", flush=True, file=sys.stderr)
    image_bytes, mime_type = fetch_image(args.file_url)
    print(f"📐 Image size: {len(image_bytes) // 1024}KB | MIME: {mime_type}", flush=True, file=sys.stderr)

    print("🤖 Running Gemini Vision OCR…", flush=True, file=sys.stderr)
    ocr = analyze_with_gemini(api_key, image_bytes, mime_type)

    payload = build_payload(ocr, args.file_url, args.meeting_location)
    # Stable key order so downstream diffs are clean.
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


# ── CLI ────────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="StarNion business-card OCR via Gemini Vision")
parser.add_argument("--user-id", required=True, help="User UUID")

sub = parser.add_subparsers(dest="cmd")

p_scan = sub.add_parser("scan", help="Scan a business card image and emit a gateway payload")
p_scan.add_argument("--file-url", required=True, help="Image URL (MinIO or /api/files/...)")
p_scan.add_argument("--meeting-location", default=None, help="Optional: where the user met this person")

args = parser.parse_args()
if args.cmd == "scan":
    cmd_scan(args)
else:
    parser.print_help()
