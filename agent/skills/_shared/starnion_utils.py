"""starnion_utils — shared helpers for StarNion skill scripts.

Provides:
  - _load_starnion_yaml()  : parse ~/.starnion/starnion.yaml
  - decrypt_value(val, key): AES-256-GCM decrypt for enc:-prefixed values
  - psql(sql, db_url)      : run a psql query and return stripped stdout

Usage in skill scripts:
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
    from starnion_utils import _load_starnion_yaml, decrypt_value, psql
"""
import base64
import hashlib
import os
import subprocess


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


# ── AES-256-GCM decrypt (mirrors gateway/internal/crypto/aes.go) ──────────────

def _derive_key(master_key: str) -> bytes:
    """SHA-256 of master_key UTF-8 bytes → 32-byte AES key."""
    return hashlib.sha256(master_key.encode()).digest()


def decrypt_value(val: str, master_key: str) -> str:
    """Decrypt a value encrypted by Go's crypto.Encrypt.

    Values NOT prefixed with "enc:" are returned unchanged (backwards-compat).
    Returns the original value on any error.
    """
    if not val or not master_key:
        return val
    if not val.startswith("enc:"):
        return val  # plaintext stored before encryption was enabled

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        # cryptography package not installed — return raw value and warn
        import sys
        print("[starnion_utils] WARNING: 'cryptography' package not installed. "
              "Run: pip install cryptography", file=sys.stderr)
        return val

    try:
        raw = base64.b64decode(val[4:])
        nonce_size = 12  # standard GCM nonce
        if len(raw) < nonce_size:
            return val
        nonce, ciphertext = raw[:nonce_size], raw[nonce_size:]
        key = _derive_key(master_key)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode()
    except Exception:
        return val


def encrypt_value(val: str, master_key: str) -> str:
    """Encrypt a value using AES-256-GCM (mirrors Go's crypto.Encrypt).

    Returns "enc:<base64(nonce+ciphertext)>" or plain value if encryption unavailable.
    """
    if not val or not master_key:
        return val

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        return val

    try:
        nonce = os.urandom(12)
        key = _derive_key(master_key)
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, val.encode(), None)
        return "enc:" + base64.b64encode(nonce + ciphertext).decode()
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
