#!/usr/bin/env python3
"""starnion-weather — Weather CLI for StarNion agent using wttr.in (no API key required)."""
import argparse, sys, json
from urllib.request import urlopen, Request
from urllib.parse import quote
from urllib.error import URLError, HTTPError

WTTR_URL = "https://wttr.in/{location}?format=j1"

# wttr.in weather codes → (description, emoji)
_WEATHER_CODES: dict[int, tuple[str, str]] = {
    113: ("Clear", "☀️"),
    116: ("Partly cloudy", "⛅"),
    119: ("Cloudy", "☁️"),
    122: ("Overcast", "☁️"),
    143: ("Mist", "🌫️"),
    176: ("Light rain shower", "🌦️"),
    179: ("Light snow", "🌨️"),
    182: ("Sleet", "🌨️"),
    185: ("Freezing drizzle", "🌨️"),
    200: ("Thunderstorm", "⛈️"),
    227: ("Blowing snow", "❄️"),
    230: ("Blizzard", "❄️"),
    248: ("Fog", "🌫️"),
    260: ("Freezing fog", "🌫️"),
    263: ("Light drizzle", "🌦️"),
    266: ("Drizzle", "🌦️"),
    281: ("Freezing drizzle", "🌨️"),
    284: ("Heavy freezing drizzle", "🌨️"),
    293: ("Light rain", "🌧️"),
    296: ("Light rain", "🌧️"),
    299: ("Moderate rain", "🌧️"),
    302: ("Moderate rain", "🌧️"),
    305: ("Heavy rain", "🌧️"),
    308: ("Very heavy rain", "🌧️"),
    311: ("Freezing rain", "🌨️"),
    314: ("Freezing rain", "🌨️"),
    317: ("Sleet", "🌨️"),
    320: ("Moderate sleet", "🌨️"),
    323: ("Light snow", "🌨️"),
    326: ("Light snow", "🌨️"),
    329: ("Moderate snow", "❄️"),
    332: ("Moderate snow", "❄️"),
    335: ("Heavy snow", "❄️"),
    338: ("Heavy snow", "❄️"),
    350: ("Ice pellets", "❄️"),
    353: ("Light rain shower", "🌦️"),
    356: ("Heavy rain shower", "🌦️"),
    359: ("Torrential rain", "⛈️"),
    362: ("Sleet shower", "🌨️"),
    365: ("Sleet shower", "🌨️"),
    368: ("Snow shower", "🌨️"),
    371: ("Heavy snow shower", "🌨️"),
    374: ("Ice pellet shower", "❄️"),
    377: ("Ice pellet shower", "❄️"),
    386: ("Thunderstorm", "⛈️"),
    389: ("Heavy thunderstorm", "⛈️"),
    392: ("Snow thunderstorm", "⛈️"),
    395: ("Heavy snow thunderstorm", "⛈️"),
}


def _code_info(code: int) -> tuple[str, str]:
    return _WEATHER_CODES.get(code, ("Unknown", "🌈"))


def _fetch(location: str) -> dict:
    url = WTTR_URL.format(location=quote(location, safe=""))
    req = Request(url, headers={"User-Agent": "starnion-weather/1.0"})
    try:
        with urlopen(req, timeout=10) as resp:
            raw = resp.read()
        data = json.loads(raw)
        # newer API wraps under 'data' key
        return data.get("data", data)
    except HTTPError as e:
        print(f"❌ Weather API error {e.code}: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"❌ Network error: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


def _display_name(data: dict, fallback: str) -> str:
    try:
        area = data["nearest_area"][0]
        city = area["areaName"][0]["value"]
        country = area["country"][0]["value"]
        return f"{city}, {country}" if country else city
    except (KeyError, IndexError):
        pass
    try:
        return data["request"][0]["query"]
    except (KeyError, IndexError):
        return fallback


# ── Commands ─────────────────────────────────────────────────────────────────

def cmd_current(args):
    data = _fetch(args.location)
    cond = data["current_condition"][0]
    display = _display_name(data, args.location)
    code = int(cond["weatherCode"])
    desc, emoji = _code_info(code)

    print(f"{emoji} {display} current weather: {desc}")
    print(f"🌡️ Temp: {cond['temp_C']}°C (feels like {cond['FeelsLikeC']}°C)")
    print(f"💧 Humidity: {cond['humidity']}%")
    print(f"💨 Wind: {cond['windspeedKmph']} km/h")
    uv = cond.get("uvIndex", "")
    if uv:
        print(f"☀️ UV index: {uv}")


def cmd_forecast(args):
    days = max(1, min(args.days, 3))
    data = _fetch(args.location)
    display = _display_name(data, args.location)
    forecast_days = data["weather"][:days]

    print(f"📅 {display} {days}-day forecast\n")
    for day in forecast_days:
        date = day["date"]
        # index 4 = 12:00 noon (wttr.in provides 3-hourly: 0,3,6,9,12,15,18,21)
        code = int(day["hourly"][4]["weatherCode"])
        desc, emoji = _code_info(code)
        tmax = day["maxtempC"]
        tmin = day["mintempC"]
        precip = max(
            int(h.get("chanceofrain") or h.get("precipProbability") or 0)
            for h in day["hourly"]
        )
        print(f"{emoji} {date}: {desc}, {tmin}°C ~ {tmax}°C, precip {precip}%")


# ── CLI ───────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="StarNion weather via wttr.in")
parser.add_argument("--user-id", required=True, help="User UUID (unused, for interface consistency)")

sub = parser.add_subparsers(dest="cmd")

p_cur = sub.add_parser("current", help="Get current weather")
p_cur.add_argument("--location", default="Seoul", help="City name (default: Seoul)")

p_fc = sub.add_parser("forecast", help="Get weather forecast")
p_fc.add_argument("--location", default="Seoul", help="City name (default: Seoul)")
p_fc.add_argument("--days", type=int, default=3, choices=[1, 2, 3], help="Forecast days (1-3, default: 3)")

args = parser.parse_args()
if args.cmd == "current":
    cmd_current(args)
elif args.cmd == "forecast":
    cmd_forecast(args)
else:
    parser.print_help()
