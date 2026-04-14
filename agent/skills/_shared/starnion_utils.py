"""starnion_utils — shared helpers for StarNion skill scripts.

Provides:
  - _load_starnion_yaml()        : parse ~/.starnion/starnion.yaml
  - decrypt_value(val, key)      : AES-256-GCM decrypt for enc:-prefixed values
  - psql(sql, db_url)            : run a psql query and return stripped stdout
  - sign_file_url(url, user_id, jwt_secret, ttl=300)
                                 : append ?exp&sig query to a /api/files/
                                   URL so the skill can read user-scoped files
                                   without the 401 that a bare fetch would hit

Usage in skill scripts:
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
    from starnion_utils import _load_starnion_yaml, decrypt_value, psql, sign_file_url
"""
import base64
import hashlib
import hmac
import os
import subprocess
import time
from urllib.parse import urlparse, urlunparse


# ── YAML loader ───────────────────────────────────────────────────────────────

def _load_starnion_yaml() -> dict:
    """Parse ~/.starnion/starnion.yaml with a simple line-based parser."""
    path = os.path.expanduser("~/.starnion/starnion.yaml")
    if not os.path.exists(path):
        return {}
    config: dict = {}
    section = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip()
            if not line or line.lstrip().startswith("#"):
                continue
            stripped = line.lstrip()
            if ":" not in stripped:
                continue
            indent = len(line) - len(stripped)
            key, _, val = stripped.partition(":")
            key, val = key.strip(), val.strip()
            if indent == 0:
                config[key] = val if val else {}
                section = None if val else key
            elif section is not None:
                config.setdefault(section, {})[key] = val
    return config


# ── AES-256-GCM decrypt / encrypt (mirrors gateway/internal/crypto/aes.go) ────
#
# Two ciphertext formats coexist on disk:
#
#   v2 (current, written by gateway 2026-04+):
#       "enc:v2:" + base64(salt[16] || nonce[12] || ciphertext)
#       key = HKDF-SHA256(master_key, salt=random16, info="starnion-aes-v2")
#
#   v1 (legacy):
#       "enc:" + base64(nonce[12] || ciphertext)
#       key = SHA256(master_key)
#
# Decrypt understands both so old rows still open. Encrypt always writes v2
# so any new rows the skills create stay consistent with the gateway.

V2_PREFIX = "enc:v2:"
V1_PREFIX = "enc:"
V2_INFO = b"starnion-aes-v2"
V2_SALT_LEN = 16
GCM_NONCE_LEN = 12


def _derive_key_v1(master_key: str) -> bytes:
    """SHA-256 of master_key UTF-8 bytes → 32-byte AES key (legacy v1)."""
    return hashlib.sha256(master_key.encode()).digest()


def _derive_key_v2(master_key: str, salt: bytes) -> bytes:
    """HKDF-SHA256 with per-record salt and fixed info tag (current v2)."""
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=V2_INFO,
    )
    return hkdf.derive(master_key.encode())


def decrypt_value(val: str, master_key: str) -> str:
    """Decrypt a value encrypted by Go's crypto.Encrypt.

    Recognises both v2 ("enc:v2:") and v1 ("enc:") formats.
    Values NOT prefixed with "enc:" are returned unchanged (backwards-compat).
    Returns the original value on any error.
    """
    if not val or not master_key:
        return val

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        import sys
        print("[starnion_utils] WARNING: 'cryptography' package not installed. "
              "Run: pip install cryptography", file=sys.stderr)
        return val

    # v2: salt(16) || nonce(12) || ciphertext, HKDF-derived key
    if val.startswith(V2_PREFIX):
        try:
            raw = base64.b64decode(val[len(V2_PREFIX):])
            if len(raw) < V2_SALT_LEN + GCM_NONCE_LEN:
                return val
            salt = raw[:V2_SALT_LEN]
            nonce = raw[V2_SALT_LEN:V2_SALT_LEN + GCM_NONCE_LEN]
            ciphertext = raw[V2_SALT_LEN + GCM_NONCE_LEN:]
            key = _derive_key_v2(master_key, salt)
            plaintext = AESGCM(key).decrypt(nonce, ciphertext, None)
            return plaintext.decode()
        except Exception:
            return val

    # v1: nonce(12) || ciphertext, SHA256-derived key
    if val.startswith(V1_PREFIX):
        try:
            raw = base64.b64decode(val[len(V1_PREFIX):])
            if len(raw) < GCM_NONCE_LEN:
                return val
            nonce, ciphertext = raw[:GCM_NONCE_LEN], raw[GCM_NONCE_LEN:]
            key = _derive_key_v1(master_key)
            plaintext = AESGCM(key).decrypt(nonce, ciphertext, None)
            return plaintext.decode()
        except Exception:
            return val

    # plaintext stored before encryption was enabled
    return val


def encrypt_value(val: str, master_key: str) -> str:
    """Encrypt a value using AES-256-GCM in the current v2 format.

    Returns "enc:v2:<base64(salt+nonce+ciphertext)>" or the original
    value when encryption is unavailable / fails. Already-encrypted
    inputs (either v1 or v2) are returned unchanged.
    """
    if not val or not master_key:
        return val
    if val.startswith(V1_PREFIX):  # already encrypted (v1 or v2)
        return val

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        return val

    try:
        salt = os.urandom(V2_SALT_LEN)
        nonce = os.urandom(GCM_NONCE_LEN)
        key = _derive_key_v2(master_key, salt)
        ciphertext = AESGCM(key).encrypt(nonce, val.encode(), None)
        return V2_PREFIX + base64.b64encode(salt + nonce + ciphertext).decode()
    except Exception:
        return val


# ── DB helper ─────────────────────────────────────────────────────────────────

def psql(sql: str, db_url: str, params: tuple | list | None = None) -> str:
    """Execute a SQL query and return results as pipe-delimited text.

    Uses psycopg2 (pure Python) instead of the psql CLI to avoid
    requiring postgresql-client to be installed on the server.
    Falls back to psql CLI if psycopg2 is not available.

    Returns results in the same format as `psql -t -A` (no headers,
    columns separated by |, rows separated by newlines).
    """
    if not db_url:
        return ""

    try:
        import psycopg2
    except ImportError:
        # Fallback to psql CLI if psycopg2 is not installed
        if params:
            import sys
            print("ERROR: psycopg2 not installed — parameterized queries require psycopg2. Install with: pip install psycopg2-binary", file=sys.stderr)
            return ""
        result = subprocess.run(
            ["psql", db_url, "-t", "-A", "-q", "-c", sql],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            return ""
        return result.stdout.strip()

    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        if params:
            cur.execute(sql, params)
        else:
            cur.execute(sql)

        # For queries that return rows (SELECT, RETURNING, etc.)
        if cur.description:
            rows = cur.fetchall()
            lines = []
            for row in rows:
                lines.append("|".join("" if v is None else str(v) for v in row))
            result = "\n".join(lines)
        else:
            result = ""

        cur.close()
        conn.close()
        return result.strip()
    except Exception as e:
        import sys
        print(f"DB error: {e}", file=sys.stderr)
        return ""


# ── Signed /api/files URL helper ──────────────────────────────────────────────
#
# Mirrors gateway/internal/adapter/http/signedurl/signedurl.go#Sign. The
# gateway's /api/files/* route rejects unauthenticated requests to user-
# scoped paths; skills that fetch a file URL without signing it will get a
# 401. This helper lets skills mint a short-lived HMAC signature that the
# gateway verifies on the way in.
#
# Signature layout (must stay in sync with the Go side):
#   payload = f"{object_key}:{exp}:{user_id}"
#   sig     = HMAC-SHA256(jwt_secret, payload)[:16].hex()  → 32 hex chars
#
# The signed query is appended as "?exp=<unix>&sig=<hex>" (or "&…" when a
# query string already exists on the URL).

def sign_file_url(
    file_url: str,
    user_id: str,
    jwt_secret: str,
    ttl_seconds: int = 300,
) -> str:
    """Return the /api/files URL with an HMAC-signed `?exp&sig` query.

    - Only URLs whose path starts with `/api/files/users/<user_id>/…` are
      signed. Other URLs (absolute off-gateway, `/api/files/browser/…`,
      or non-user-scoped) are returned unchanged.
    - If the URL already carries `sig=`, it is returned unchanged.
    - If `jwt_secret` or `user_id` is empty, the URL is returned unchanged
      (the caller will fall back to its existing behaviour, which is usually
      a bare fetch that 401s loudly).
    """
    if not file_url or not user_id or not jwt_secret:
        return file_url

    parsed = urlparse(file_url)
    path = parsed.path or ""
    if not path.startswith("/api/files/"):
        return file_url
    object_key = path[len("/api/files/"):]
    if not object_key.startswith(f"users/{user_id}/"):
        return file_url  # not this user's file — don't silently sign
    if parsed.query and "sig=" in parsed.query:
        return file_url  # already signed

    exp = int(time.time()) + max(1, int(ttl_seconds))
    payload = f"{object_key}:{exp}:{user_id}".encode("utf-8")
    mac = hmac.new(jwt_secret.encode("utf-8"), payload, hashlib.sha256).digest()
    sig = mac[:16].hex()
    new_query = f"exp={exp}&sig={sig}"
    if parsed.query:
        new_query = f"{parsed.query}&{new_query}"
    return urlunparse(parsed._replace(query=new_query))
