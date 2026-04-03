#!/usr/bin/env python3
"""starnion-naver-map — Naver Maps REST API CLI for StarNion agent.

Supports geocoding, reverse geocoding, and static map image generation.
NAVER_MAP_CLIENT_ID and NAVER_MAP_CLIENT_SECRET are injected into the
subprocess environment by the agent runner.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

_GEOCODE_URL         = "https://openapi.naver.com/v1/map/geocode"
_REVERSE_GEOCODE_URL = "https://openapi.naver.com/v1/map/reversegeocode"
_STATIC_MAP_URL      = "https://openapi.naver.com/v1/map/staticmap"


def get_naver_map_credentials(user_id: str) -> tuple[str, str] | None:
    """Return (client_id, client_secret) injected by the agent runner via env vars."""
    env_id = os.environ.get("NAVER_MAP_CLIENT_ID")
    env_secret = os.environ.get("NAVER_MAP_CLIENT_SECRET")
    if env_id and env_secret:
        return env_id, env_secret
    return None


def _not_linked() -> str:
    return (
        "Naver Maps API is not connected. "
        "Please register your Client ID and Client Secret "
        "in the skill settings. (https://developers.naver.com/apps)"
    )


# ── Naver API caller ────────────────────────────────────────────────────────────
def _naver_request(url: str, client_id: str, client_secret: str) -> dict:
    req = urllib.request.Request(url, headers={
        "X-Naver-Client-Id":     client_id,
        "X-Naver-Client-Secret": client_secret,
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()
        except Exception:
            pass
        if e.code == 401:
            return {"error": "Invalid Naver API key. Please re-register your credentials in the skill settings."}
        if e.code == 403:
            return {"error": "No permission to use Naver Maps API. Check your application settings at developers.naver.com."}
        return {"error": f"Naver Maps API error (HTTP {e.code}): {body}"}
    except Exception as e:
        return {"error": f"Naver Maps API error: {e}"}


# ── Geocode ────────────────────────────────────────────────────────────────────
def cmd_geocode(args, client_id: str, client_secret: str) -> None:
    params = urllib.parse.urlencode({"query": args.address})
    url = f"{_GEOCODE_URL}?{params}"
    data = _naver_request(url, client_id, client_secret)

    if "error" in data:
        print(data["error"], file=sys.stderr)
        if args.json:
            print(json.dumps({"error": data["error"]}))
        else:
            print(data["error"])
        return

    items = data.get("result", {}).get("items", [])
    if not items:
        if args.json:
            print(json.dumps({"error": f"No geocoding result for '{args.address}'"}))
        else:
            print(f"❌ No geocoding result for '{args.address}'.")
        return

    item = items[0]
    lat  = float(item["point"]["y"])
    lng  = float(item["point"]["x"])
    road = item.get("address", args.address)

    if args.json:
        print(json.dumps({"lat": lat, "lng": lng, "address": road}))
    else:
        print(f"📍 lat: {lat}, lng: {lng} | {road}")


# ── Reverse Geocode ────────────────────────────────────────────────────────────
def cmd_reverse_geocode(args, client_id: str, client_secret: str) -> None:
    params = urllib.parse.urlencode({
        "coords": f"{args.lng},{args.lat}",
        "output": "json",
    })
    url = f"{_REVERSE_GEOCODE_URL}?{params}"
    data = _naver_request(url, client_id, client_secret)

    if "error" in data:
        print(data["error"], file=sys.stderr)
        print(data["error"])
        return

    items = data.get("result", {}).get("items", [])
    if not items:
        print(f"❌ No reverse geocoding result for ({args.lat}, {args.lng}).")
        return

    address = items[0].get("address", f"({args.lat}, {args.lng})")

    if args.json:
        print(json.dumps({"lat": args.lat, "lng": args.lng, "address": address}))
    else:
        print(f"📍 {address}")


# ── Static Map ─────────────────────────────────────────────────────────────────
def cmd_static_map(args, client_id: str, client_secret: str) -> None:
    zoom   = max(1, min(args.zoom, 21))
    width  = max(1, min(args.width, 2048))
    height = max(1, min(args.height, 2048))

    params: dict = {
        "center": f"{args.lng},{args.lat}",
        "level":  zoom,
        "w":      width,
        "h":      height,
    }
    if args.marker:
        params["markers"] = f"type:d|size:mid|pos:{args.lng} {args.lat}"

    # Append auth params for direct browser access
    params["X-Naver-Client-Id"]     = client_id
    params["X-Naver-Client-Secret"] = client_secret

    url = f"{_STATIC_MAP_URL}?{urllib.parse.urlencode(params)}"

    if args.json:
        print(json.dumps({"url": url, "lat": args.lat, "lng": args.lng,
                          "zoom": zoom, "width": width, "height": height}))
    else:
        print(f"🗺️ {url}")


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="StarNion Naver Maps")
    parser.add_argument("--user-id", required=True, help="User ID")

    sub = parser.add_subparsers(dest="command", required=True)

    # geocode
    p_geo = sub.add_parser("geocode", help="Convert address to coordinates")
    p_geo.add_argument("--address", required=True, help="Address string to geocode")
    p_geo.add_argument("--json", action="store_true", help="Output as JSON")

    # reverse-geocode
    p_rev = sub.add_parser("reverse-geocode", help="Convert coordinates to address")
    p_rev.add_argument("--lat", type=float, required=True, help="Latitude")
    p_rev.add_argument("--lng", type=float, required=True, help="Longitude")
    p_rev.add_argument("--json", action="store_true", help="Output as JSON")

    # static-map
    p_map = sub.add_parser("static-map", help="Generate static map image URL")
    p_map.add_argument("--lat",    type=float, required=True, help="Center latitude")
    p_map.add_argument("--lng",    type=float, required=True, help="Center longitude")
    p_map.add_argument("--zoom",   type=int, default=15, help="Zoom level 1-21 (default: 15)")
    p_map.add_argument("--width",  type=int, default=600, help="Image width px (default: 600)")
    p_map.add_argument("--height", type=int, default=400, help="Image height px (default: 400)")
    p_map.add_argument("--marker", action="store_true", help="Add a pin at center")
    p_map.add_argument("--json",   action="store_true", help="Output as JSON")

    args = parser.parse_args()

    creds = get_naver_map_credentials(args.user_id)
    if not creds:
        print(_not_linked())
        return

    client_id, client_secret = creds

    if args.command == "geocode":
        cmd_geocode(args, client_id, client_secret)
    elif args.command == "reverse-geocode":
        cmd_reverse_geocode(args, client_id, client_secret)
    elif args.command == "static-map":
        cmd_static_map(args, client_id, client_secret)


if __name__ == "__main__":
    main()
