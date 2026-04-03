#!/usr/bin/env python3
"""Memory Security Validator — Starnion

Validates text before it is stored in memory to prevent:
  1. Invisible unicode characters (prompt injection vectors)
  2. Prompt injection keyword patterns
  3. Exfiltration patterns (curl/wget with secrets)
  4. Entry length violations (max 2200 chars)

Usage:
  echo "text to validate" | python3 validate_memory.py
  python3 validate_memory.py --text "text to validate"

Exit codes:
  0 — PASS (safe to store)
  1 — BLOCKED (unsafe, reason printed to stderr)
"""

import sys
import re
import argparse

# ── Configuration ─────────────────────────────────────────────────────────────

MAX_CHARS = 2200

# Invisible / zero-width unicode that can hide injected instructions
INVISIBLE_UNICODE = [
    "\u200b",  # Zero Width Space
    "\u200c",  # Zero Width Non-Joiner
    "\u200d",  # Zero Width Joiner
    "\u200e",  # Left-to-Right Mark
    "\u200f",  # Right-to-Left Mark
    "\u202a",  # Left-to-Right Embedding
    "\u202b",  # Right-to-Left Embedding
    "\u202c",  # Pop Directional Formatting
    "\u202d",  # Left-to-Right Override
    "\u202e",  # Right-to-Left Override (classic injection)
    "\u2060",  # Word Joiner
    "\u2061",  # Function Application
    "\u2062",  # Invisible Times
    "\u2063",  # Invisible Separator
    "\u2064",  # Invisible Plus
    "\ufeff",  # Byte Order Mark (BOM)
    "\u00ad",  # Soft Hyphen
]

# Prompt injection keyword patterns (case-insensitive)
INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|above)\s+instructions?",
    r"disregard\s+(previous|all|above)\s+instructions?",
    r"forget\s+(everything|all|previous|your\s+instructions?)",
    r"you\s+are\s+now\s+(a|an)\s+\w+",
    r"act\s+as\s+(a|an)\s+(different|new|unrestricted)\s+\w+",
    r"new\s+system\s*:?\s*prompt",
    r"\[?\bsystem\b\]?\s*:",
    r"###\s*(system|instruction|override)",
    r"<\s*(system|instructions?|prompt)\s*>",
    r"your\s+true\s+(self|purpose|instructions?)\s+is",
    r"jailbreak",
    r"dan\s+mode",
]

# Exfiltration patterns: network tools combined with secret-like arguments
EXFIL_TOOL_RE = re.compile(r"\b(curl|wget|nc|netcat|python3?\s+-c|bash\s+-c)\b", re.I)
EXFIL_SECRET_RE = re.compile(
    r"(\$[A-Z_]{4,}|api[_-]?key|secret|token|password|passwd|bearer|auth)",
    re.I,
)


# ── Validators ────────────────────────────────────────────────────────────────

def check_length(text: str) -> str | None:
    if len(text) > MAX_CHARS:
        return f"Entry too long ({len(text)} chars, max {MAX_CHARS})"
    return None


def check_invisible_unicode(text: str) -> str | None:
    found = [hex(ord(c)) for c in text if c in INVISIBLE_UNICODE]
    if found:
        return f"Invisible unicode detected: {', '.join(found[:5])}"
    return None


def check_injection(text: str) -> str | None:
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return f"Prompt injection pattern detected: '{pattern}'"
    return None


def check_exfiltration(text: str) -> str | None:
    if EXFIL_TOOL_RE.search(text) and EXFIL_SECRET_RE.search(text):
        return "Potential exfiltration pattern detected (network tool + secret reference)"
    return None


VALIDATORS = [
    check_length,
    check_invisible_unicode,
    check_injection,
    check_exfiltration,
]


# ── Main ──────────────────────────────────────────────────────────────────────

def validate(text: str) -> list[str]:
    """Run all validators. Returns list of violation messages (empty = PASS)."""
    violations = []
    for fn in VALIDATORS:
        result = fn(text)
        if result:
            violations.append(result)
    return violations


def main() -> None:
    parser = argparse.ArgumentParser(description="Memory Security Validator")
    parser.add_argument("--text", help="Text to validate (default: read from stdin)")
    args = parser.parse_args()

    if args.text is not None:
        text = args.text
    else:
        text = sys.stdin.read()

    violations = validate(text)
    if violations:
        for v in violations:
            print(f"BLOCKED: {v}", file=sys.stderr)
        sys.exit(1)
    else:
        print("OK")
        sys.exit(0)


if __name__ == "__main__":
    main()
