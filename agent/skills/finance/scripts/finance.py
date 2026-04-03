#!/usr/bin/env python3
"""starnion-finance — finance record CLI for StarNion agent."""
import argparse, sys, os, json, re  # noqa: E401
import urllib.error, urllib.request, urllib.parse  # noqa: E401
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql
try:
    from starnion_utils import decrypt_value as _decrypt_value
except ImportError:
    _decrypt_value = None

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("❌ DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)

def psql(sql): return _shared_psql(sql, DB_URL)

def esc(s: str) -> str:
    """Escape single quotes for SQL."""
    return str(s).replace("'", "''")

ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")
if not ENCRYPTION_KEY:
    print("[finance] ⚠️  ENCRYPTION_KEY is not set — credential decryption will fail", file=sys.stderr)


_creds_cache: dict[str, tuple[str, str] | None] = {}

def _get_naver_search_creds(user_id: str) -> tuple[str, str] | None:
    """Get Naver Search API credentials from integration_keys (provider='naver_search').
    결과를 프로세스 내 메모리에 캐시하여 슬라이스 재시도 시 DB 중복 조회 방지.
    """
    if user_id in _creds_cache:
        print(f"[geocode] 🔑 naver_search creds (cached)", file=sys.stderr)
        return _creds_cache[user_id]

    if not user_id:
        print("[geocode] ⚠️  user_id is empty — cannot look up naver_search credentials", file=sys.stderr)
        return None
    if not DB_URL:
        print("[geocode] ⚠️  DATABASE_URL not set", file=sys.stderr)
        return None
    try:
        print(f"[geocode] 🔑 looking up naver_search credentials for user_id='{user_id}'", file=sys.stderr)
        row = psql(
            f"SELECT api_key FROM integration_keys "
            f"WHERE user_id = '{esc(user_id)}' AND provider = 'naver_search' LIMIT 1;"
        )
        if not row:
            print("[geocode] ⚠️  naver_search credentials not registered in DB", file=sys.stderr)
            _creds_cache[user_id] = None
            return None
        print(f"[geocode] 🔑 naver_search row found (len={len(row)})", file=sys.stderr)
        if _decrypt_value and ENCRYPTION_KEY:
            decrypted = _decrypt_value(row, ENCRYPTION_KEY)
            print(f"[geocode] 🔑 decryption succeeded", file=sys.stderr)
        else:
            print(f"[geocode] ⚠️  skipping decryption: _decrypt_value={bool(_decrypt_value)} ENCRYPTION_KEY={'set' if ENCRYPTION_KEY else 'MISSING'}", file=sys.stderr)
            decrypted = row
        client_id, sep, client_secret = decrypted.partition(":")
        if sep and client_id and client_secret:
            print(f"[geocode] 🔑 naver_search creds parsed OK (client_id len={len(client_id)})", file=sys.stderr)
            _creds_cache[user_id] = (client_id, client_secret)
            return client_id, client_secret
        print(f"[geocode] ⚠️  naver_search credential format invalid (expected 'id:secret', got no ':' separator)", file=sys.stderr)
    except Exception as e:
        print(f"[geocode] ⚠️  Could not load naver_search creds: {type(e).__name__}: {e}", file=sys.stderr)
    _creds_cache[user_id] = None
    return None


def _naver_local_search(query: str, user_id: str = "") -> dict | None:
    """Naver Search Local API for place/store name lookup.
    openapi.naver.com/v1/search/local.json
    Headers: X-Naver-Client-Id / X-Naver-Client-Secret (from integration_keys)
    Response: items[0].mapx = lng × 1e7, items[0].mapy = lat × 1e7
    """
    creds = _get_naver_search_creds(user_id)
    if not creds:
        print("[geocode] ⚠️  naver_search credentials not found, skipping local search", file=sys.stderr)
        return None
    client_id, client_secret = creds
    params = urllib.parse.urlencode({"query": query, "display": "1"})
    url = f"https://openapi.naver.com/v1/search/local.json?{params}"
    print(f"[geocode] 🌐 try(naver-local) GET {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers={
        "X-Naver-Client-Id":     client_id,
        "X-Naver-Client-Secret": client_secret,
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            raw = res.read().decode()
            print(f"[geocode] 📥 (naver-local) response: {raw[:300]}", file=sys.stderr)
            data = json.loads(raw)
            items = data.get("items", [])
            if items:
                item = items[0]
                lat = float(item["mapy"]) * 1e-7
                lng = float(item["mapx"]) * 1e-7
                title = re.sub(r'<[^>]+>', '', item.get("title", "")).strip()
                print(f"[geocode] ✅ (naver-local) '{query}' → lat={lat:.6f}, lng={lng:.6f} | {title}", file=sys.stderr)
                return {"lat": lat, "lng": lng}
            print(f"[geocode] ❌ (naver-local) no results for '{query}' (total={data.get('total', 0)})", file=sys.stderr)
    except urllib.error.HTTPError as e:
        body = ""
        try: body = e.read().decode()
        except Exception: pass
        print(f"[geocode] ❌ (naver-local) HTTP {e.code} for '{query}': {body[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"[geocode] ❌ (naver-local) error '{query}': {type(e).__name__}: {e}", file=sys.stderr)
    return None




_BRANCH_SUFFIX = re.compile(r'(점|지점|본점|분점|매장|가게|센터)$')

def geocode(query: str, user_id: str = "") -> dict | None:
    """Geocode a place name or address via Naver Local Search.
    Tries the full query first, then progressively shorter prefixes.
    openapi.naver.com/v1/map/geocode is 404 on Naver Developers portal → not used.
    """
    tokens = query.split()

    # Step 1: 전체 쿼리로 시도
    result = _naver_local_search(query, user_id)
    if result:
        return result

    # Step 2: 토큰 수를 줄여가며 재시도 (긴 설명문에서 가게명 추출)
    # e.g. "양재 나주곰탕 나주우거지곰탕" → "양재 나주곰탕" → "양재"
    for n in range(len(tokens) - 1, 0, -1):
        candidate = " ".join(tokens[:n])
        print(f"[geocode] 🔁 retry [{n}tok]: '{candidate}'", file=sys.stderr)
        result = _naver_local_search(candidate, user_id)
        if result:
            return result

    # Step 3: 지점명 접미사 제거 후 재시도
    # e.g. "스타벅스강남점" → "스타벅스강남", "나주곰탕 가게" → "나주곰탕"
    for i, tok in enumerate(tokens):
        m = _BRANCH_SUFFIX.search(tok)
        if m:
            area = _BRANCH_SUFFIX.sub('', tok)
            if len(area) >= 2:
                print(f"[geocode] 🔁 retry (suffix strip): '{area}'", file=sys.stderr)
                result = _naver_local_search(area, user_id)
            elif i > 0:
                fallback = " ".join(tokens[:i])
                if len(fallback) >= 2:
                    print(f"[geocode] 🔁 retry (standalone suffix strip): '{fallback}'", file=sys.stderr)
                    result = _naver_local_search(fallback, user_id)
                else:
                    result = None
            else:
                result = None
            if result:
                return result
            break

    print(f"[geocode] ❌ all strategies failed for '{query}'", file=sys.stderr)
    return None


def geocode_address(address: str, user_id: str = "") -> dict | None:
    """Geocode a structured address string via Naver Local Search."""
    result = _naver_local_search(address, user_id)
    if not result:
        print(f"[geocode] ❌ address geocoding failed for '{address}'", file=sys.stderr)
    return result

def extract_location_from_text(text: str) -> str | None:
    """Extract a location/store name from free-form user text.
    Handles Korean 'X에서' pattern and common store suffixes.
    Returns the extracted name, or None if nothing found.
    """
    if not text:
        return None

    # Korean: capture everything before 에서 (e.g. "스타벅스 강남점에서")
    m = re.search(r'(.+?)에서', text)
    if m:
        loc = m.group(1).strip()
        # Skip generic/non-mappable terms
        skip = {'집', '학교', '회사', '사무실', '여기', '저기', '어디', '어딘가'}
        if len(loc) >= 2 and loc not in skip:
            return loc

    # English: "at <Place>" pattern (e.g. "at Starbucks Gangnam")
    m = re.search(r'\bat\s+([A-Za-z0-9][A-Za-z0-9 &\']+?)(?=\s+\d|\s+for|\s+spent|$)', text)
    if m:
        loc = m.group(1).strip()
        if len(loc) >= 3:
            return loc

    return None


def extract_location_from_description(desc: str) -> str | None:
    """Fallback: extract store/place from description by looking for
    Korean store-suffix patterns (점, 역, 마트, 카페, ...).
    e.g. "스타벅스 강남점 아메리카노" → "스타벅스 강남점"
    """
    if not desc:
        return None
    store_suffixes = (
        '점', '역', '마트', '카페', '병원', '약국', '편의점',
        '주유소', '식당', '음식점', '센터', '몰', '백화점',
        '본점', '지점', '매장', '가게', '분점',
    )
    tokens = desc.split()
    for i, token in enumerate(tokens):
        if any(token.endswith(s) for s in store_suffixes):
            # Include the preceding token as the brand name
            if i > 0:
                return f"{tokens[i-1]} {token}"
            return token
    return None


def build_location_sql(args) -> tuple[str, str | None]:
    """Build the location JSON value for SQL.
    Returns (sql_value, resolved_location_label) where label is for display.
    sql_value is either a quoted JSON string or 'NULL'.
    """
    lat     = getattr(args, "lat",           None)
    lng     = getattr(args, "lng",           None)
    name    = getattr(args, "location_name", None)
    address = getattr(args, "address",       None)
    user_id = getattr(args, "user_id",       "")
    raw_text = getattr(args, "text",         None)

    print(
        f"[location] 📋 args: lat={lat} lng={lng} name={name!r} "
        f"address={address!r} text={raw_text!r}",
        file=sys.stderr,
    )

    # Priority 0: explicit address → Local Search / Geocoding API
    if address and not (lat and lng):
        print(f"[location] 🗺  path=address → geocoding '{address}'", file=sys.stderr)
        coords = geocode_address(address, user_id)
        if coords:
            loc = {**coords, "name": address}
            label = f"{address} ({coords['lat']:.4f},{coords['lng']:.4f})"
            print(f"[location] ✅ address geocoded → {label}", file=sys.stderr)
            return f"'{esc(json.dumps(loc, ensure_ascii=False))}'", label
        loc = {"name": address}
        print(f"[location] ⚠️  address geocoding failed, name-only", file=sys.stderr)
        return f"'{esc(json.dumps(loc, ensure_ascii=False))}'", address

    # Fallback 1: extract from --text
    if not name and not (lat and lng):
        if raw_text:
            name = extract_location_from_text(raw_text)
            if name:
                print(f"[location] 🔍 extracted from --text: '{name}'", file=sys.stderr)
            else:
                print(f"[location] ℹ️  no location found in --text", file=sys.stderr)

    # Fallback 2: extract from --description
    if not name and not (lat and lng):
        desc_text = getattr(args, "description", None)
        if desc_text:
            name = extract_location_from_description(desc_text)
            if name:
                print(f"[location] 🔍 extracted from description (suffix): '{name}'", file=sys.stderr)
            else:
                # Fallback 2b: description 토큰을 점진적으로 줄여가며 장소명으로 시도
                # "양재 나주곰탕 나주우거지곰탕" → "양재 나주곰탕" → "양재" 순서
                # 에이전트가 --text 없이 description에 가게명+메뉴명을 섞어 넣는 경우 대응
                toks = desc_text.split()
                for n in range(len(toks), 0, -1):
                    candidate = " ".join(toks[:n])
                    print(f"[location] 🔍 trying description slice [{n}tok]: '{candidate}'", file=sys.stderr)
                    coords = _naver_local_search(candidate, user_id)
                    if coords:
                        loc = {**coords, "name": candidate}
                        label = f"{candidate} ({coords['lat']:.4f},{coords['lng']:.4f})"
                        print(f"[location] ✅ geocoded via description slice → {label}", file=sys.stderr)
                        return f"'{esc(json.dumps(loc, ensure_ascii=False))}'", label
                # 모두 실패 → 이름만 저장
                print(f"[location] ⚠️  all description slices failed, name-only: '{toks[0] if toks else desc_text}'", file=sys.stderr)
                name = toks[0] if len(toks) > 1 else desc_text

    # Case 1: explicit coordinates
    if lat and lng:
        loc: dict = {"lat": float(lat), "lng": float(lng)}
        if name:
            loc["name"] = name
        label = f"{name or ''} ({lat},{lng})"
        print(f"[location] ✅ using explicit coords: {label}", file=sys.stderr)
        return f"'{esc(json.dumps(loc, ensure_ascii=False))}'", label

    # Case 2: name → geocode
    if name:
        print(f"[location] 🗺  path=name → geocoding '{name}'", file=sys.stderr)
        coords = geocode(name, user_id)
        if coords:
            loc = {**coords, "name": name}
            label = f"{name} ({coords['lat']:.4f},{coords['lng']:.4f})"
            print(f"[location] ✅ geocoded → {label}", file=sys.stderr)
        else:
            loc = {"name": name}
            label = f"{name} (좌표 없음)"
            print(f"[location] ⚠️  geocoding failed, name-only: '{name}'", file=sys.stderr)
        return f"'{esc(json.dumps(loc, ensure_ascii=False))}'", label

    print(f"[location] ℹ️  no location data → NULL", file=sys.stderr)
    return "NULL", None

def cmd_save(args):
    location_sql, location_label = build_location_sql(args)
    desc = esc(args.description or args.category)
    cat  = esc(args.category)
    sql = (
        f"INSERT INTO finances (user_id, amount, category, description, location) "
        f"VALUES ('{args.user_id}', {int(args.amount)}, "
        f"'{cat}', '{desc}', {location_sql});"
    )
    psql(sql)
    word = "expense" if int(args.amount) < 0 else "income"
    loc_note = f" 📍 {location_label}" if location_label else ""
    print(f"✅ {word} recorded: {args.category} {abs(int(args.amount)):,}{loc_note}")

def cmd_monthly(args):
    month = args.month or datetime.now().strftime("%Y-%m")
    cat_filter = f"AND category = '{esc(args.category)}'" if args.category else ""
    sql = (
        f"SELECT category, SUM(amount), COUNT(*) FROM finances "
        f"WHERE user_id = '{args.user_id}' "
        f"AND TO_CHAR(created_at, 'YYYY-MM') = '{month}' "
        f"{cat_filter} GROUP BY category ORDER BY SUM(amount);"
    )
    rows = psql(sql)
    if not rows:
        print(f"📊 {month}: no records")
        return
    total = 0
    print(f"📊 {month} transactions:")
    for row in rows.splitlines():
        parts = row.split("|")
        if len(parts) >= 3:
            cat, amt, cnt = parts[0], int(parts[1]), parts[2]
            total += amt
            print(f"  {cat}: {abs(amt):,} ({cnt})")
    print(f"  Total: {abs(total):,}")

def cmd_list(args):
    limit = args.limit or 10
    sql = (
        f"SELECT created_at, category, amount, description FROM finances "
        f"WHERE user_id = '{args.user_id}' "
        f"ORDER BY created_at DESC LIMIT {limit};"
    )
    rows = psql(sql)
    if not rows:
        print("📋 No records found.")
        return
    print(f"📋 Recent {limit} records:")
    for row in rows.splitlines():
        parts = row.split("|")
        if len(parts) >= 4:
            dt, cat, amt, desc = parts[0][:10], parts[1], int(parts[2]), parts[3]
            word = "expense" if amt < 0 else "income"
            print(f"  [{dt}] {cat} {abs(amt):,} - {desc} ({word})")

def cmd_set_budget(args):
    category = args.category or "total"
    period = args.period or "monthly"
    sql = (
        f"INSERT INTO budgets (user_id, category, amount, period) "
        f"VALUES ('{args.user_id}', '{esc(category)}', {int(args.amount)}, '{period}') "
        f"ON CONFLICT (user_id, category, period) "
        f"DO UPDATE SET amount = {int(args.amount)}, updated_at = NOW();"
    )
    psql(sql)
    print(f"✅ Budget set for '{category}': {int(args.amount):,} ({period})")

# ── CLI ────────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")

p_save = sub.add_parser("save")
p_save.add_argument("--amount",        required=True)
p_save.add_argument("--category",      required=True)
p_save.add_argument("--description")
# Location — any combination is accepted:
#   --address only             → geocode via Naver Geocoding API (structured address)
#   --location-name only       → geocode via Naver Local Search (place/store name)
#   --lat + --lng              → use coordinates directly (no geocoding)
#   --location-name + lat/lng  → use coordinates + attach name
p_save.add_argument("--address", dest="address", default=None,
                    help="Structured address string (도로명/지번주소) → geocoded via Naver Geocoding API")
p_save.add_argument("--location-name", dest="location_name", default=None,
                    help="Place or store name (e.g. '스타벅스 강남점') → geocoded via Naver Local Search")
p_save.add_argument("--lat",  type=float, default=None, help="Latitude  (optional, skips geocoding)")
p_save.add_argument("--lng",  type=float, default=None, help="Longitude (optional, skips geocoding)")
p_save.add_argument("--text", default=None,
                    help="Raw user message — used to auto-extract location if neither --address nor --location-name is given")

p_monthly = sub.add_parser("monthly")
p_monthly.add_argument("--category")
p_monthly.add_argument("--month")

p_list = sub.add_parser("list")
p_list.add_argument("--limit", type=int, default=10)

p_set_budget = sub.add_parser("set-budget")
p_set_budget.add_argument("--amount",   required=True)
p_set_budget.add_argument("--category")
p_set_budget.add_argument("--period",   default="monthly")

args = parser.parse_args()
if   args.cmd == "save":       cmd_save(args)
elif args.cmd == "monthly":    cmd_monthly(args)
elif args.cmd == "list":       cmd_list(args)
elif args.cmd == "set-budget": cmd_set_budget(args)
else: parser.print_help()
