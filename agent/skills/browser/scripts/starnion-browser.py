#!/usr/bin/env python3
"""Browser control client for NewStarNion agent.

Communicates with the local browser control server (http://127.0.0.1:18791)
which manages Chrome via chrome-devtools-mcp.
"""

import argparse
import json
import sys
import urllib.request
import urllib.error

import os
_port = os.environ.get("BROWSER_CONTROL_PORT", "18793")
BROWSER_URL = f"http://127.0.0.1:{_port}"


_DEFAULT_TIMEOUT = int(os.environ.get("BROWSER_CLIENT_TIMEOUT", "60"))


def request(method: str, path: str, body: dict | None = None, auth_token: str | None = None, timeout: int | None = None) -> dict:
    url = BROWSER_URL + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if auth_token:
        req.add_header("Authorization", f"Bearer {auth_token}")
    effective_timeout = timeout if timeout is not None else _DEFAULT_TIMEOUT
    try:
        with urllib.request.urlopen(req, timeout=effective_timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        try:
            err = json.loads(body_bytes)
        except Exception:
            err = {"error": body_bytes.decode(errors="replace")}
        print(json.dumps({"ok": False, "status": e.code, **err}))
        sys.exit(1)
    except urllib.error.URLError as e:
        print(json.dumps({"ok": False, "error": f"Cannot connect to browser server: {e.reason}. Is the agent running?"}))
        sys.exit(1)


def cmd_status(args):
    result = request("GET", "/", auth_token=args.token, timeout=args.timeout)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_tabs(args):
    result = request("GET", "/tabs", auth_token=args.token, timeout=args.timeout)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_open(args):
    result = request("POST", "/tabs", body={"url": args.url}, auth_token=args.token, timeout=args.timeout)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_snapshot(args):
    path = f"/agent/snapshot?format={args.format}"
    if args.target_id:
        path += f"&targetId={args.target_id}"
    result = request("GET", path, auth_token=args.token, timeout=args.timeout)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_act(args):
    body: dict = {"kind": args.kind}
    if args.target_id:
        body["targetId"] = args.target_id
    if args.url:
        body["url"] = args.url
    if args.uid:
        body["uid"] = args.uid
    if args.value is not None:
        body["value"] = args.value
    if args.key:
        body["key"] = args.key
    if args.text:
        body["text"] = args.text
    if args.width:
        body["width"] = args.width
    if args.height:
        body["height"] = args.height
    if args.full_page:
        body["fullPage"] = True
    if args.fmt:
        body["format"] = args.fmt
    if args.double_click:
        body["doubleClick"] = True
    if args.elements:
        try:
            body["elements"] = json.loads(args.elements)
        except json.JSONDecodeError:
            print(json.dumps({"ok": False, "error": "elements must be valid JSON"}))
            sys.exit(1)
    result = request("POST", "/agent/act", body=body, auth_token=args.token, timeout=args.timeout)
    # For screenshot responses, strip the raw base64 data if a `url` is available.
    # The agent should use the `url` field to include the image as markdown.
    if body.get("kind") == "screenshot" and result.get("url") and result.get("screenshot"):
        result = {k: v for k, v in result.items() if k != "screenshot"}
    print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="NewStarNion browser control")
    parser.add_argument("--token", help="Auth token (BROWSER_AUTH_TOKEN)")
    parser.add_argument("--timeout", type=int, default=None,
                        help=f"Request timeout in seconds (default: {_DEFAULT_TIMEOUT}, or BROWSER_CLIENT_TIMEOUT env)")

    sub = parser.add_subparsers(dest="command", required=True)

    # status
    sub.add_parser("status", help="Check server status")

    # tabs
    sub.add_parser("tabs", help="List open tabs")

    # open
    p_open = sub.add_parser("open", help="Open a new tab")
    p_open.add_argument("url", help="URL to open")

    # snapshot
    p_snap = sub.add_parser("snapshot", help="Take page snapshot")
    p_snap.add_argument("--target-id", help="Tab target ID (uses first tab if omitted)")
    p_snap.add_argument("--format", choices=["ai", "aria"], default="ai", help="Snapshot format")

    # act
    p_act = sub.add_parser("act", help="Perform browser action")
    p_act.add_argument("kind", choices=[
        "navigate", "click", "fill", "fill_form", "hover", "drag",
        "press", "screenshot", "upload", "resize", "focus", "wait", "evaluate"
    ])
    p_act.add_argument("--target-id", help="Tab target ID")
    p_act.add_argument("--url", help="URL (navigate)")
    p_act.add_argument("--uid", help="Element ref (click, fill, hover, drag, upload)")
    p_act.add_argument("--value", help="Fill value")
    p_act.add_argument("--key", help="Key name (press)")
    p_act.add_argument("--text", help="Text to wait for (wait)")
    p_act.add_argument("--width", type=int, help="Width (resize)")
    p_act.add_argument("--height", type=int, help="Height (resize)")
    p_act.add_argument("--full-page", action="store_true", help="Full page screenshot")
    p_act.add_argument("--fmt", choices=["png", "jpeg"], help="Screenshot format")
    p_act.add_argument("--double-click", action="store_true")
    p_act.add_argument("--elements", help="JSON array of {uid, value} for fill_form")

    args = parser.parse_args()

    dispatch = {
        "status": cmd_status,
        "tabs": cmd_tabs,
        "open": cmd_open,
        "snapshot": cmd_snapshot,
        "act": cmd_act,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
