#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Guraydingview connector for Claude (an MCP server).

Lets Claude (in the Claude desktop app or Claude Code) read chart data, quotes, your watchlist and your
drawings, draw on your charts and switch the chart you are looking at. It talks to the running Guraydingview
app on http://127.0.0.1:8765 and starts the app if it is not running.

    python mcp_server.py --install      add the connector to the Claude desktop app (then restart Claude)
    python mcp_server.py --uninstall    remove it again
    python mcp_server.py                run as an MCP server on stdin/stdout (Claude starts it this way)

Python standard library only.
"""
import glob
import json
import math
import os
import random
import re
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("GV_PORT") or os.environ.get("GRAFIK_PORT") or "8765")
BASE = f"http://127.0.0.1:{PORT}"
SERVER_NAME = "guraydingview"
VERSION = "1.0.0"
CHART_TZ = timedelta(hours=3)  # the chart shows intraday times in Istanbul time (UTC+3), see TZ in static/app.js
INTERVALS = ["15m", "1h", "4h", "1d", "1w", "1M"]
INTRADAY = {"15m", "1h", "4h"}

# drawing tools: number of points, stored type, default colour (same as TOOL_DEFS in static/drawings.js)
TOOLS = {
    "trend": (2, "line", "#2962ff"), "ray": (2, "line", "#2962ff"), "extended": (2, "line", "#2962ff"),
    "hline": (1, "hline", "#2962ff"), "hray": (1, "hray", "#2962ff"), "vline": (1, "vline", "#2962ff"),
    "channel": (3, "channel", "#2962ff"), "rect": (2, "rect", "#9c27b0"), "ellipse": (2, "ellipse", "#ff9800"),
    "fib": (2, "fib", "#787b86"), "daterange": (2, "daterange", "#2962ff"), "text": (1, "text", "#2962ff"),
}
TOOL_ALIASES = {
    "trendline": "trend", "trend_line": "trend", "line": "trend", "extended_line": "extended",
    "horizontal": "hline", "horizontal_line": "hline", "horizontal_ray": "hray", "vertical": "vline",
    "vertical_line": "vline", "parallel_channel": "channel", "rectangle": "rect", "box": "rect",
    "fibonacci": "fib", "fib_retracement": "fib", "date_range": "daterange", "label": "text", "note": "text",
}
FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618]
LINE_STYLES = {"solid": 0, "dashed": 1, "dotted": 2}
COLOR_NAMES = {
    "blue": "#2962ff", "red": "#f23645", "green": "#089981", "orange": "#ff9800", "yellow": "#ffeb3b",
    "purple": "#9c27b0", "pink": "#e91e63", "teal": "#00bcd4", "cyan": "#00bcd4", "gray": "#787b86",
    "grey": "#787b86", "white": "#ffffff", "black": "#000000", "lime": "#4caf50",
}

INSTRUCTIONS = """\
Guraydingview is the user's own TradingView-style charting app running on their computer. These tools read
market and macro data, read and edit the user's watchlist, and read and draw on the user's charts.

Symbols: tickers such as GOOGL, VT, BTCUSD, GOLD, SILVER, XU030, USDTRY; macro series such as WALCL (Fed balance
sheet), USM2, M2V, TCU, USBCOI (ISM manufacturing PMI), USMNO (ISM new orders), USISMMI, TRM1/TRM2 (Turkish M1/M2);
ratios of two symbols such as GOLD/SILVER; FRED:CODE and EVDS:CODE for other series. Use search_symbols when unsure.

Times: daily and longer bars are dated YYYY-MM-DD; intraday times are chart time (Istanbul, UTC+3).
Values of a billion and more are shown as B / T (T = 10^12); give drawing prices as plain numbers.

Drawings belong to a symbol and show on every interval. Drawings you add are marked as yours. Before you change
or delete drawings the user made, list them and touch only what the user asked about. Keep drawings few and
purposeful, and label key levels with short text. After drawing on a symbol the user is not looking at, call
open_chart so they see it. Describe what the data shows; do not present it as personal investment advice."""


class ToolError(Exception):
    """A problem the user (or Claude) can fix; returned as a tool error, not a protocol error."""


def log(*a):
    print("[guraydingview]", *a, file=sys.stderr, flush=True)


# ----------------------------------------------------------------------------
# Talking to the app
# ----------------------------------------------------------------------------
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # never send local requests via a proxy
_app_lock = threading.Lock()


class AppError(ToolError):
    def __init__(self, msg, status=0, data=None):
        super().__init__(msg)
        self.status = status
        self.data = data


def call(method, path, body=None, timeout=90):
    headers, data = {}, None
    if method != "GET":
        data = json.dumps(body if body is not None else {}).encode("utf-8")
        headers = {"X-Guraydingview": "1", "X-Client-Id": "claude", "Content-Type": "application/json"}
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with _opener.open(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read() or b"null")
        except ValueError:
            payload = None
        msg = payload.get("error") if isinstance(payload, dict) else None
        raise AppError(msg or f"HTTP {e.code}", e.code, payload) from None
    except (urllib.error.URLError, OSError) as e:
        raise AppError(f"Could not reach Guraydingview at {BASE} ({getattr(e, 'reason', e)}).") from None
    return json.loads(raw or b"null")


def q(s):
    return urllib.parse.quote(str(s), safe="")


def app_running():
    try:
        with _opener.open(BASE + "/api/watchlist", timeout=3) as r:
            r.read()
        return True
    except urllib.error.HTTPError:
        return True  # something answered
    except Exception:
        return False


def start_app():
    log("Guraydingview is not running - starting it")
    kw = dict(cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
    if sys.platform == "win32":
        exe = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
        args = [exe if os.path.exists(exe) else sys.executable, os.path.join(ROOT, "tray.py"), "--no-open"]
        flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        try:  # CREATE_BREAKAWAY_FROM_JOB: keep running after Claude closes this connector
            subprocess.Popen(args, creationflags=flags | 0x01000000, **kw)
        except OSError:
            subprocess.Popen(args, creationflags=flags, **kw)
    else:
        subprocess.Popen([sys.executable, os.path.join(ROOT, "server.py")], start_new_session=True, **kw)


def ensure_app():
    with _app_lock:
        if app_running():
            return
        start_app()
        deadline = time.time() + 30
        while time.time() < deadline:
            time.sleep(0.5)
            if app_running():
                return
    raise ToolError("Guraydingview is not running and could not be started. Start it with the Guraydingview "
                    "shortcut (or Start.bat) and try again.")


# ----------------------------------------------------------------------------
# Formatting and parsing
# ----------------------------------------------------------------------------
def num(v, ref=None):
    """A readable number; 'ref' (e.g. the price for a price change) sets the precision. Values of a billion
    and more get a B / T suffix (T = 10^12)."""
    if v is None:
        return "-"
    a = abs(v) if ref is None else abs(ref)
    if max(a, abs(v)) >= 1e9:  # a big value, or a change of one: T / B / M
        for unit, div in (("T", 1e12), ("B", 1e9), ("M", 1e6)):
            if abs(v) >= div:
                return f"{v / div:.4f}".rstrip("0").rstrip(".") + unit
        return f"{v:.0f}"
    if v == 0:
        return "0"
    if a < 1:
        return f"{v:.6g}" if ref is None else f"{v:.{max(2, 6 - int(math.floor(math.log10(a or 1e-9))))}f}".rstrip("0")
    s = f"{v:.2f}" if a >= 100 else f"{v:.4f}"
    return s.rstrip("0").rstrip(".")


def signed(v, pct=False, ref=None):
    s = ("+" if v > 0 else "") + (f"{v:.2f}" if pct else num(v, ref))
    return s + ("%" if pct else "")


def fmt_time(t, intraday=None):
    dt = datetime.fromtimestamp(t, timezone.utc)
    if intraday is None:
        intraday = t % 86400 != 0
    return (dt + CHART_TZ).strftime("%Y-%m-%d %H:%M") if intraday else dt.strftime("%Y-%m-%d")


def to_unix(v, what="time"):
    """'2024-03-15' (a daily bar), '2024-03' / '2024', '2024-03-15 14:30' (chart time, Istanbul),
    an ISO time with an offset ('...Z', '+00:00') or unix seconds."""
    if isinstance(v, bool) or v is None:
        raise ToolError(f"{what} is missing")
    if isinstance(v, (int, float)):
        t = float(v)
        return int(t / 1000 if t > 1e11 else t)  # milliseconds -> seconds
    s = str(v).strip()
    if re.fullmatch(r"-?\d{6,}(\.\d+)?", s):
        return to_unix(float(s), what)
    if re.search(r"\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$", s):  # a time with an explicit offset
        try:
            return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
        except ValueError:
            pass
    m = re.fullmatch(r"(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?", s)
    if not m:
        raise ToolError(f"cannot read {what} {v!r}: use YYYY-MM-DD, or YYYY-MM-DD HH:MM for intraday")
    y, mo, d, hh, mi, ss = m.groups()
    try:
        dt = datetime(int(y), int(mo or 1), int(d or 1), int(hh or 0), int(mi or 0), int(ss or 0), tzinfo=timezone.utc)
    except ValueError as e:
        raise ToolError(f"invalid {what} {v!r}: {e}") from None
    if hh is not None:
        dt -= CHART_TZ  # a clock time is chart time
    return int(dt.timestamp())


def req_str(args, key):
    v = args.get(key)
    if not isinstance(v, str) or not v.strip():
        raise ToolError(f"'{key}' is required")
    return v.strip()


def interval_arg(args, default="1d"):
    iv = args.get("interval") or default
    if iv not in INTERVALS:
        raise ToolError(f"interval must be one of {', '.join(INTERVALS)}")
    return iv


def color_arg(v, what="color"):
    s = str(v).strip().lower()
    s = COLOR_NAMES.get(s, s)
    if not re.fullmatch(r"#([0-9a-f]{3}|[0-9a-f]{6})", s):
        raise ToolError(f"{what} must be a hex colour like #2962ff (got {v!r})")
    return s


def unit_arg(v, what):
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ToolError(f"{what} must be a number between 0 and 1") from None
    if not 0 <= f <= 1:
        raise ToolError(f"{what} must be between 0 and 1")
    return f


def symbol_list(v, what="symbols"):
    if isinstance(v, str):
        v = v.split(",")
    if not isinstance(v, list):
        raise ToolError(f"'{what}' must be a list of symbols")
    out = []
    for s in v:
        s = str(s).strip().upper()
        if s and s not in out:
            out.append(s)
    return out


# ----------------------------------------------------------------------------
# Tools: data
# ----------------------------------------------------------------------------
def get_bars(args):
    sym = req_str(args, "symbol")
    iv = interval_arg(args)
    ext = bool(args.get("extended_hours"))
    try:
        limit = max(1, min(5000, int(args.get("limit") or 300)))
    except (TypeError, ValueError):
        raise ToolError("limit must be a number") from None
    j = call("GET", f"/api/bars?symbol={q(sym)}&interval={iv}&ext={1 if ext else 0}")
    bars = j.get("bars") or []
    lo_t = to_unix(args["start"], "start") if args.get("start") else None
    hi_t = None
    if args.get("end"):
        hi_t = to_unix(args["end"], "end")
        if re.fullmatch(r"\d{4}(-\d{1,2}){0,2}", str(args["end"]).strip()):
            hi_t += 86400 - 1  # a date: include that whole day
    sel = [b for b in bars if (lo_t is None or b[0] >= lo_t) and (hi_t is None or b[0] <= hi_t)]
    if not sel:
        raise ToolError(f"{j.get('symbol', sym)} has no {iv} bars in that date range "
                        f"(data runs {fmt_time(bars[0][0])} to {fmt_time(bars[-1][0])})." if bars else "No data.")
    shown = sel[-limit:]
    intraday = iv in INTRADAY
    line = j.get("kind") == "line"
    head = " · ".join(x for x in (f"{j.get('symbol', sym.upper())} — {j.get('name', '')}", j.get("exchange"),
                                   j.get("currency"), f"source: {j.get('source', '')}") if x)
    out = [head, f"Interval {iv}" + (" (a low-frequency series: one value per period)" if j.get("lowfreq") else "")
           + (" · pre-market / after-hours bars included" if j.get("session") else "")]
    first, last = shown[0], shown[-1]
    hi = max(shown, key=lambda b: b[2])
    lo = min(shown, key=lambda b: b[3])
    chg = (last[4] / first[4] - 1) * 100 if first[4] else 0
    out.append(f"{len(shown)} bars shown, {fmt_time(first[0], intraday)} to {fmt_time(last[0], intraday)}"
               + (" (chart time, Istanbul UTC+3)" if intraday else "")
               + (f"; {len(sel) - len(shown)} older bars left out (raise limit, set start/end, or use a longer interval)"
                  if len(sel) > len(shown) else ""))
    out.append(f"Last {num(last[4])} · change over the shown bars {signed(chg, True)} · high {num(hi[2])} "
               f"({fmt_time(hi[0], intraday)}) · low {num(lo[3])} ({fmt_time(lo[0], intraday)})")
    out.append("")
    if line:
        out.append("time,value")
        out += [f"{fmt_time(b[0], intraday)},{num(b[4])}" for b in shown]
    else:
        out.append("time,open,high,low,close")
        out += [f"{fmt_time(b[0], intraday)},{num(b[1])},{num(b[2])},{num(b[3])},{num(b[4])}" for b in shown]
    return "\n".join(out)


def quote_line(sym, qt):
    if not qt or qt.get("error"):
        return f"{sym}: {(qt or {}).get('error') or 'no data'}"
    s = (f"{sym} ({qt.get('name', '')}): {num(qt['last'])}  {signed(qt['chg'], ref=qt['last'])} ({signed(qt['pct'], True)})"
         f"  · last bar {fmt_time(qt['t'])}")
    ext = qt.get("ext")
    if ext:
        label = "pre-market" if ext.get("session") == "pre" else "after hours"
        s += f"  · {label} {num(ext['price'])} ({signed(ext['pct'], True)})"
    return s


def get_quotes(args):
    syms = symbol_list(args.get("symbols"))
    if not syms:
        raise ToolError("give at least one symbol")
    if len(syms) > 50:
        raise ToolError("at most 50 symbols at a time")
    res = call("GET", f"/api/quotes?symbols={q(','.join(syms))}")
    return "Change is against the previous bar's close (previous day for daily data, previous release for "\
           "monthly macro data).\n" + "\n".join(quote_line(s, res.get(s)) for s in syms)


def search_symbols(args):
    query = req_str(args, "query")
    cat = args.get("category") or "all"
    res = call("GET", f"/api/search?q={q(query)}&cat={q(cat)}")
    if not res:
        return f"Nothing found for {query!r}. Any Yahoo Finance ticker also works (e.g. THYAO.IS, EURUSD=X, ^GSPC), " \
               "as do FRED:CODE and EVDS:CODE, and ratios like GOLD/SILVER."
    lines = [f"{r['symbol']} — {r.get('name', '')} ({r.get('type') or r.get('cat', '')}"
             + (f", {r['exch']}" if r.get("exch") else "") + ")" for r in res[:30]]
    return "\n".join(lines)


# ----------------------------------------------------------------------------
# Tools: watchlist
# ----------------------------------------------------------------------------
def get_watchlist(args):
    wl = call("GET", "/api/watchlist")
    groups = wl.get("groups") or []
    syms = [s for g in groups for s in g.get("symbols", [])]
    quotes = {}
    if syms and args.get("with_quotes", True):
        quotes = call("GET", f"/api/quotes?symbols={q(','.join(syms))}")
    out = []
    for g in groups:
        out.append(f"## {g.get('name') or '(top, no section name)'}")
        out += [("- " + quote_line(s, quotes.get(s))) if quotes else f"- {s}" for s in g.get("symbols", [])]
        if not g.get("symbols"):
            out.append("- (empty)")
    return "\n".join(out) or "The watchlist is empty."


def edit_watchlist(args):
    add = symbol_list(args.get("add") or [], "add")
    remove = symbol_list(args.get("remove") or [], "remove")
    section = args.get("section")
    section = section.strip().upper() if isinstance(section, str) else None
    if not add and not remove:
        raise ToolError("nothing to do: give 'add' and/or 'remove'")
    wl = call("GET", "/api/watchlist")
    groups = wl.setdefault("groups", [])
    if not groups:
        groups.append({"name": "", "symbols": []})
    notes = []
    bad = []
    if add:  # only add symbols that have data
        res = call("GET", f"/api/quotes?symbols={q(','.join(add))}")
        bad = [s for s in add if not res.get(s) or res[s].get("error")]
        for s in bad:
            notes.append(f"{s}: not added — {(res.get(s) or {}).get('error') or 'no data'}")
        add = [s for s in add if s not in bad]
    for s in remove:
        found = False
        for g in groups:
            if s in g.get("symbols", []):
                g["symbols"].remove(s)
                found = True
        notes.append(f"{s}: removed" if found else f"{s}: was not in the watchlist")
    if add:
        if section is not None:
            target = next((g for g in groups if (g.get("name") or "").upper() == section), None)
            if target is None:
                target = {"name": section, "symbols": []}
                groups.append(target)
                notes.append(f"new section {section or '(no name)'}")
        for s in add:
            where = [g for g in groups if s in g.get("symbols", [])]
            if section is None:
                if where:
                    notes.append(f"{s}: already in the watchlist")
                    continue
                target = groups[-1]
            elif where == [target]:
                notes.append(f"{s}: already in {target.get('name') or '(top section)'}")
                continue
            for g in where:
                g["symbols"].remove(s)
            target.setdefault("symbols", []).append(s)
            notes.append(f"{s}: {'moved to' if where else 'added to'} {target.get('name') or '(top section)'}")
    call("POST", "/api/watchlist", wl)
    return "\n".join(notes) + "\nThe watchlist in open chart tabs updates by itself."


# ----------------------------------------------------------------------------
# Tools: drawings
# ----------------------------------------------------------------------------
def new_id():
    return "c" + format(int(time.time() * 1000), "x") + format(random.getrandbits(20), "05x")


def describe(d):
    typ = d.get("type")
    pts = d.get("pts") or []
    if not pts:
        return f"- {d.get('id')}: {d.get('tool') or typ} (no points)"
    if typ == "hline":
        where = f"at price {num(pts[0]['p'])}"
    elif typ == "vline":
        where = f"at {fmt_time(pts[0]['t'])}"
    else:
        where = " → ".join(f"({fmt_time(p['t'])}, {num(p['p'])})" for p in pts)
    bits = [f"- {d.get('id')}: {d.get('tool') or typ} {where}", f"color {d.get('color', '')}"]
    if d.get("width", 1) != 1:
        bits.append(f"width {d['width']}")
    if d.get("style"):
        bits.append({1: "dashed", 2: "dotted"}.get(d["style"], ""))
    if d.get("extL") or d.get("extR"):
        bits.append("extended " + "+".join(x for x, on in (("left", d.get("extL")), ("right", d.get("extR"))) if on))
    if d.get("text"):
        t = str(d["text"]).replace("\n", " ")
        bits.append(f'text "{t[:80]}{"…" if len(t) > 80 else ""}"')
    if typ == "fib" and len(pts) == 2:
        a, b = pts[0]["p"], pts[1]["p"]
        bits.append("levels " + ", ".join(f"{lv}={num(b + (a - b) * lv)}" for lv in FIB_LEVELS))
    if typ == "channel" and len(pts) == 3:
        (a, b, c) = pts
        if b["t"] != a["t"]:
            base = a["p"] + (b["p"] - a["p"]) * (c["t"] - a["t"]) / (b["t"] - a["t"])
            bits.append(f"parallel line offset {signed(c['p'] - base)} from the base line")
    if d.get("locked"):
        bits.append("locked")
    bits.append("added by Claude" if d.get("by") == "claude" else "drawn by the user")
    return " · ".join(b for b in bits if b)


def make_points(tool, pts_in, last_t, last_p):
    n, typ, _ = TOOLS[tool]
    if not isinstance(pts_in, list) or len(pts_in) != n:
        raise ToolError(f"{tool} needs exactly {n} point{'s' if n > 1 else ''} in 'points'")
    pts = []
    for i, p in enumerate(pts_in, 1):
        if not isinstance(p, dict):
            raise ToolError(f"point {i} must be an object with time and price")
        t = p.get("time")
        price = p.get("price")
        t = last_t if (t is None and typ == "hline") else to_unix(t, f"point {i} time")
        if price is None and typ == "vline":
            price = last_p
        try:
            price = float(price)
        except (TypeError, ValueError):
            raise ToolError(f"point {i} needs a numeric price") from None
        if not math.isfinite(price):
            raise ToolError(f"point {i} price is not a finite number")
        pts.append({"t": t, "p": price})
    return pts


def apply_style(d, spec):
    if "color" in spec:
        d["color"] = color_arg(spec["color"])
    if "width" in spec:
        try:
            d["width"] = max(1, min(10, int(spec["width"])))
        except (TypeError, ValueError):
            raise ToolError("width must be a whole number from 1 to 10") from None
    if "line_style" in spec:
        if spec["line_style"] not in LINE_STYLES:
            raise ToolError("line_style must be solid, dashed or dotted")
        d["style"] = LINE_STYLES[spec["line_style"]]
    if "line_opacity" in spec:
        d["lineOpacity"] = unit_arg(spec["line_opacity"], "line_opacity")
    if "fill_color" in spec:
        d["fillColor"] = color_arg(spec["fill_color"], "fill_color")
    if "fill_opacity" in spec:
        d["fillOpacity"] = unit_arg(spec["fill_opacity"], "fill_opacity")
    if "text" in spec:
        t = str(spec["text"] or "")[:500]
        if t:
            d["text"] = t
        else:
            d.pop("text", None)
    if "text_color" in spec:
        d["textColor"] = color_arg(spec["text_color"], "text_color")
    if "text_size" in spec:
        try:
            d["textSize"] = max(8, min(48, int(spec["text_size"])))
        except (TypeError, ValueError):
            raise ToolError("text_size must be a whole number from 8 to 48") from None
    for key, field in (("bold", "bold"), ("italic", "italic"), ("extend_left", "extL"), ("extend_right", "extR"),
                       ("locked", "locked")):
        if key in spec:
            if spec[key]:
                d[field] = True
            else:
                d.pop(field, None)
    for key, field, allowed in (("text_align", "textAlign", ("left", "center", "right")),
                                ("text_valign", "textVAlign", ("top", "middle", "bottom"))):
        if key in spec:
            if spec[key] not in allowed:
                raise ToolError(f"{key} must be one of {', '.join(allowed)}")
            d[field] = spec[key]
    if d.get("type") == "text" and not d.get("text"):
        raise ToolError("a text drawing needs 'text'")


def last_bar(sym):
    """Check that the symbol has data; returns (last time, last close) for points that leave them out."""
    j = call("GET", f"/api/bars?symbol={q(sym)}&interval=1d")
    b = (j.get("bars") or [[int(time.time()), 0, 0, 0, 0]])[-1]
    return b[0], b[4]


def mutate(sym, fn):
    """Read-modify-write the symbol's drawings, retrying if the chart saved in between (revision check)."""
    for attempt in range(5):
        r = call("GET", f"/api/drawings?symbol={q(sym)}")
        items, result = fn([dict(d) for d in (r.get("items") or [])])
        try:
            call("POST", f"/api/drawings?symbol={q(sym)}", {"items": items, "rev": r.get("rev", 0)})
            return result
        except AppError as e:
            if e.status != 409 or attempt == 4:
                raise
    raise ToolError("the drawings kept changing while saving; try again")


def list_drawings(args):
    sym = (args.get("symbol") or "").strip()
    if not sym:
        data = call("GET", "/api/drawings")
        rows = sorted(((k, v) for k, v in data.items() if isinstance(v, list) and v), key=lambda kv: -len(kv[1]))
        if not rows:
            return "There are no drawings yet."
        return "Drawings per symbol:\n" + "\n".join(
            f"- {k}: {len(v)}" + (f" ({sum(d.get('by') == 'claude' for d in v)} added by Claude)"
                                  if any(d.get("by") == "claude" for d in v) else "") for k, v in rows)
    r = call("GET", f"/api/drawings?symbol={q(sym)}")
    items = r.get("items") or []
    if not items:
        return f"{sym.upper()} has no drawings."
    return (f"{sym.upper()}: {len(items)} drawing{'s' if len(items) != 1 else ''} (times: YYYY-MM-DD, or chart time "
            "for intraday points)\n" + "\n".join(describe(d) for d in items))


def add_drawings(args):
    sym = req_str(args, "symbol").upper()
    specs = args.get("drawings")
    if not isinstance(specs, list) or not specs:
        raise ToolError("'drawings' must be a non-empty list")
    if len(specs) > 100:
        raise ToolError("at most 100 drawings per call")
    last_t, last_p = last_bar(sym)
    new, errors = [], []
    for i, spec in enumerate(specs, 1):
        try:
            if not isinstance(spec, dict):
                raise ToolError("must be an object")
            tool = str(spec.get("tool", "")).strip().lower()
            tool = TOOL_ALIASES.get(tool, tool)
            if tool not in TOOLS:
                raise ToolError(f"unknown tool {spec.get('tool')!r}; use one of {', '.join(TOOLS)}")
            n, typ, color = TOOLS[tool]
            d = {"id": new_id(), "tool": tool, "type": typ, "pts": make_points(tool, spec.get("points"), last_t, last_p),
                 "color": color, "width": 1, "style": 0, "by": "claude"}
            if tool in ("ray", "extended"):
                d["extR"] = True
            if tool == "extended":
                d["extL"] = True
            if tool == "text":
                d["textSize"] = 14
            apply_style(d, spec)
            new.append(d)
        except ToolError as e:
            errors.append(f"drawing {i}: {e}")
    if errors:
        raise ToolError("Nothing was drawn:\n" + "\n".join(errors))
    mutate(sym, lambda items: (items + new, None))
    return (f"Added {len(new)} drawing{'s' if len(new) != 1 else ''} to {sym}:\n" + "\n".join(describe(d) for d in new)
            + f"\nOpen chart tabs showing {sym} update by themselves (Ctrl+Z there takes the change back).")


def update_drawings(args):
    sym = req_str(args, "symbol").upper()
    updates = args.get("updates")
    if not isinstance(updates, list) or not updates:
        raise ToolError("'updates' must be a non-empty list of {id, ...changes}")
    need_last = any(isinstance(u, dict) and "points" in u for u in updates)
    last_t, last_p = last_bar(sym) if need_last else (None, None)

    def fn(items):
        by_id = {d.get("id"): d for d in items}
        changed = []
        for i, u in enumerate(updates, 1):
            if not isinstance(u, dict) or u.get("id") not in by_id:
                raise ToolError(f"update {i}: no drawing with id {u.get('id') if isinstance(u, dict) else u!r} "
                                f"on {sym} (use list_drawings)")
            d = by_id[u["id"]]
            if "points" in u:
                tool = d.get("tool") if d.get("tool") in TOOLS else next(
                    (k for k, v in TOOLS.items() if v[1] == d.get("type")), None)
                if not tool:
                    raise ToolError(f"update {i}: this kind of drawing cannot be moved here")
                d["pts"] = make_points(tool, u["points"], last_t, last_p)
            apply_style(d, u)
            changed.append(d)
        return items, changed

    changed = mutate(sym, fn)
    return f"Updated {len(changed)} drawing{'s' if len(changed) != 1 else ''} on {sym}:\n" + \
        "\n".join(describe(d) for d in changed)


def delete_drawings(args):
    sym = req_str(args, "symbol").upper()
    ids = set(str(i) for i in (args.get("ids") or []))
    mine = bool(args.get("all_added_by_claude"))
    if not ids and not mine:
        raise ToolError("give 'ids' (see list_drawings) or set all_added_by_claude")

    def fn(items):
        keep = [d for d in items if not (d.get("id") in ids or (mine and d.get("by") == "claude"))]
        missing = ids - {d.get("id") for d in items}
        return keep, (len(items) - len(keep), missing)

    removed, missing = mutate(sym, fn)
    msg = f"Deleted {removed} drawing{'s' if removed != 1 else ''} from {sym}."
    if missing:
        msg += f" Not found: {', '.join(sorted(missing))}."
    if removed:
        msg += f" In an open chart of {sym}, Ctrl+Z brings them back."
    return msg


RANGES = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "All"]
SCALES = ["linear", "log", "percent"]


def open_chart(args):
    sym = req_str(args, "symbol").upper()
    iv = interval_arg(args, None) if args.get("interval") else ""
    rng = args.get("range") or ""
    scale = args.get("scale") or ""
    if rng and rng not in RANGES:
        raise ToolError(f"range must be one of {', '.join(RANGES)}")
    if scale and scale not in SCALES:
        raise ToolError(f"scale must be one of {', '.join(SCALES)}")
    j = call("GET", f"/api/bars?symbol={q(sym)}&interval={iv or '1d'}")  # check it has data first
    extra = "".join(f"&{k}={q(v)}" for k, v in (("interval", iv), ("range", rng), ("scale", scale)) if v)
    r = call("POST", f"/api/show?symbol={q(sym)}{extra}")
    name = f"{sym} ({j.get('name', '')})"
    how = ", ".join(x for x in (f"{iv} interval" if iv else "", f"range {rng}" if rng else "",
                                f"{scale} scale" if scale else "") if x)
    if r.get("tabs"):
        return f"Switched the open chart to {name}" + (f" ({how})." if how else ".")
    url = f"{BASE}/?symbol={q(sym)}{extra}"
    webbrowser.open(url)
    return f"No chart tab was open, so {name} was opened in the browser: {url}"


# ----------------------------------------------------------------------------
# Tool definitions (MCP)
# ----------------------------------------------------------------------------
SYMBOL = {"type": "string", "description": "Symbol, e.g. GOOGL, BTCUSD, GOLD, USBCOI, TRM2, GOLD/SILVER."}
INTERVAL = {"type": "string", "enum": INTERVALS, "description": "Bar interval (default 1d). 1M = monthly."}
TIME = {"type": ["string", "number"],
        "description": "YYYY-MM-DD (a daily bar), YYYY-MM-DD HH:MM (chart time, Istanbul UTC+3) or unix seconds. "
                       "Times after the last bar are fine, e.g. to project a line into the future."}
POINT = {"type": "object", "properties": {"time": TIME, "price": {"type": "number"}}}
STYLE = {
    "color": {"type": "string", "description": "Line colour, hex like #2962ff (for a text drawing: the text colour)."},
    "width": {"type": "integer", "minimum": 1, "maximum": 10, "description": "Line width in px (default 1)."},
    "line_style": {"type": "string", "enum": list(LINE_STYLES)},
    "line_opacity": {"type": "number", "minimum": 0, "maximum": 1},
    "fill_color": {"type": "string", "description": "Background colour of rect, ellipse, channel, fib, daterange "
                                                    "(default: the line colour)."},
    "fill_opacity": {"type": "number", "minimum": 0, "maximum": 1},
    "text": {"type": "string", "description": "Label on the drawing; required for tool 'text'. On a daterange it "
                                              "replaces the bars/days label. Empty string removes it."},
    "text_color": {"type": "string"},
    "text_size": {"type": "integer", "minimum": 8, "maximum": 48},
    "bold": {"type": "boolean"},
    "italic": {"type": "boolean"},
    "text_align": {"type": "string", "enum": ["left", "center", "right"]},
    "text_valign": {"type": "string", "enum": ["top", "middle", "bottom"]},
    "extend_left": {"type": "boolean", "description": "Extend a line or channel to the left edge."},
    "extend_right": {"type": "boolean", "description": "Extend a line, channel or fib to the right edge."},
    "locked": {"type": "boolean", "description": "Lock against accidental moves on the chart."},
}
DRAW_HELP = """Points per tool:
- trend: 2 points. ray: 2 points, continues past point 2. extended: 2 points, continues both ways.
- hline: 1 point, only price needed. hray: 1 point, a horizontal line from that time to the right.
- vline: 1 point, only time needed.
- channel: 3 points; 1 and 2 are the base line, 3 is any point on the parallel line.
- rect, ellipse: 2 opposite corners. daterange: 2 points; shows the bars and days between them.
- fib: point 1 = start of the swing, point 2 = end; level 0 is at point 2 and 1 at point 1
  (levels 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618).
- text: 1 point (top-left of the text), needs 'text'."""

TOOL_LIST = [
    {"name": "get_bars", "title": "Get price / data bars",
     "description": "Price or data history of a symbol as a table (time, open, high, low, close; or time, value "
                    "for macro series), with the last value, high, low and change over the period. Returns the most "
                    "recent 'limit' bars inside start/end.",
     "inputSchema": {"type": "object", "properties": {
         "symbol": SYMBOL, "interval": INTERVAL,
         "start": {"type": "string", "description": "First date, YYYY-MM-DD (optional)."},
         "end": {"type": "string", "description": "Last date, YYYY-MM-DD (optional)."},
         "limit": {"type": "integer", "minimum": 1, "maximum": 5000, "description": "Max bars (default 300)."},
         "extended_hours": {"type": "boolean", "description": "Include pre-market / after-hours bars "
                                                              "(US stocks and ETFs, intraday intervals)."}},
         "required": ["symbol"]},
     "annotations": {"readOnlyHint": True, "openWorldHint": True}},
    {"name": "get_quotes", "title": "Get quotes",
     "description": "Latest value and change of up to 50 symbols, including pre-market / after-hours prices "
                    "for US stocks and ETFs.",
     "inputSchema": {"type": "object", "properties": {
         "symbols": {"type": "array", "items": {"type": "string"}, "description": "e.g. [\"GOOGL\", \"BTCUSD\"]"}},
         "required": ["symbols"]},
     "annotations": {"readOnlyHint": True, "openWorldHint": True}},
    {"name": "search_symbols", "title": "Search symbols",
     "description": "Find symbols by ticker or name (US stocks and ETFs, crypto, futures, forex, indices, "
                    "economic series).",
     "inputSchema": {"type": "object", "properties": {
         "query": {"type": "string"},
         "category": {"type": "string", "enum": ["all", "stock", "fund", "futures", "forex", "crypto", "index",
                                                 "economy"]}},
         "required": ["query"]},
     "annotations": {"readOnlyHint": True, "openWorldHint": True}},
    {"name": "get_watchlist", "title": "Get watchlist",
     "description": "The user's watchlist by section, with the latest value and change of each symbol.",
     "inputSchema": {"type": "object", "properties": {
         "with_quotes": {"type": "boolean", "description": "Include prices (default true)."}}},
     "annotations": {"readOnlyHint": True, "openWorldHint": True}},
    {"name": "edit_watchlist", "title": "Edit watchlist",
     "description": "Add symbols to the watchlist, move them to a section, or remove them. With 'section', the "
                    "added symbols go to (or move to) that section, which is created if needed; without it they go "
                    "to the end of the list. Symbols without data are not added.",
     "inputSchema": {"type": "object", "properties": {
         "add": {"type": "array", "items": {"type": "string"}},
         "remove": {"type": "array", "items": {"type": "string"}},
         "section": {"type": "string", "description": "Section name (shown in capitals); \"\" = the top section."}}},
     "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True}},
    {"name": "list_drawings", "title": "List drawings",
     "description": "Drawings on a symbol's chart with their ids, points, colours and text, and who made them. "
                    "Without a symbol: how many drawings each symbol has.",
     "inputSchema": {"type": "object", "properties": {"symbol": SYMBOL}},
     "annotations": {"readOnlyHint": True}},
    {"name": "add_drawings", "title": "Draw on a chart",
     "description": "Draw on a symbol's chart: trend lines, horizontal levels, channels, rectangles, Fibonacci "
                    "retracements, date ranges, text notes. They appear in open chart tabs right away and are "
                    "saved like the user's own drawings.\n" + DRAW_HELP,
     "inputSchema": {"type": "object", "properties": {
         "symbol": SYMBOL,
         "drawings": {"type": "array", "minItems": 1, "maxItems": 100, "items": {
             "type": "object", "properties": {"tool": {"type": "string", "enum": list(TOOLS)},
                                              "points": {"type": "array", "items": POINT}, **STYLE},
             "required": ["tool", "points"]}}},
         "required": ["symbol", "drawings"]},
     "annotations": {"readOnlyHint": False, "destructiveHint": False}},
    {"name": "update_drawings", "title": "Change drawings",
     "description": "Change drawings by id (from list_drawings): move them with new 'points' (same count as the "
                    "tool needs) or change colour, width, style, text, fill and so on. Only change the user's own "
                    "drawings when they ask you to.",
     "inputSchema": {"type": "object", "properties": {
         "symbol": SYMBOL,
         "updates": {"type": "array", "minItems": 1, "items": {
             "type": "object", "properties": {"id": {"type": "string"}, "points": {"type": "array", "items": POINT},
                                              **STYLE},
             "required": ["id"]}}},
         "required": ["symbol", "updates"]},
     "annotations": {"readOnlyHint": False, "destructiveHint": True}},
    {"name": "delete_drawings", "title": "Delete drawings",
     "description": "Delete drawings from a symbol by id (from list_drawings), or every drawing Claude added there. "
                    "Only delete the user's own drawings when they ask you to.",
     "inputSchema": {"type": "object", "properties": {
         "symbol": SYMBOL,
         "ids": {"type": "array", "items": {"type": "string"}},
         "all_added_by_claude": {"type": "boolean"}},
         "required": ["symbol"]},
     "annotations": {"readOnlyHint": False, "destructiveHint": True}},
    {"name": "open_chart", "title": "Show a chart",
     "description": "Show a symbol in the user's open chart tab (or open it in the browser if no tab is open), "
                    "optionally with an interval, a date range (like the range buttons; All = the whole history) "
                    "and a price scale (log suits long histories such as BTC since 2010).",
     "inputSchema": {"type": "object", "properties": {
         "symbol": SYMBOL, "interval": INTERVAL,
         "range": {"type": "string", "enum": RANGES},
         "scale": {"type": "string", "enum": SCALES}},
         "required": ["symbol"]},
     "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True}},
]
HANDLERS = {"get_bars": get_bars, "get_quotes": get_quotes, "search_symbols": search_symbols,
            "get_watchlist": get_watchlist, "edit_watchlist": edit_watchlist, "list_drawings": list_drawings,
            "add_drawings": add_drawings, "update_drawings": update_drawings, "delete_drawings": delete_drawings,
            "open_chart": open_chart}


# ----------------------------------------------------------------------------
# MCP over stdio: one JSON-RPC 2.0 message per line
# ----------------------------------------------------------------------------
_out = None
_out_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=4)


def send(obj):
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
    with _out_lock:
        _out.write(data)
        _out.flush()


def reply(mid, result):
    send({"jsonrpc": "2.0", "id": mid, "result": result})


def reply_error(mid, code, message):
    send({"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": message}})


def run_tool(mid, params):
    name = params.get("name")
    args = params.get("arguments") or {}
    fn = HANDLERS.get(name)
    if not fn:
        return reply_error(mid, -32602, f"Unknown tool: {name}")
    if not isinstance(args, dict):
        return reply_error(mid, -32602, "arguments must be an object")
    try:
        ensure_app()
        text = fn(args)
        reply(mid, {"content": [{"type": "text", "text": text}], "isError": False})
    except ToolError as e:
        reply(mid, {"content": [{"type": "text", "text": str(e)}], "isError": True})
    except Exception as e:  # a bug: report it instead of hanging the call
        traceback.print_exc(file=sys.stderr)
        reply(mid, {"content": [{"type": "text", "text": f"Unexpected error in the Guraydingview connector: {e!r}"}],
                    "isError": True})


def handle(msg):
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
        return reply_error(msg.get("id") if isinstance(msg, dict) else None, -32600, "Invalid request")
    method = msg.get("method")
    if not isinstance(method, str):
        return  # a response to a request we never sent
    mid = msg.get("id")
    is_request = "id" in msg
    params = msg.get("params") or {}
    if method == "initialize":
        pv = params.get("protocolVersion")
        reply(mid, {"protocolVersion": pv if isinstance(pv, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", pv)
                    else "2025-06-18",
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": SERVER_NAME, "title": "Guraydingview", "version": VERSION},
                    "instructions": INSTRUCTIONS})
    elif method == "ping":
        reply(mid, {})
    elif method == "tools/list":
        reply(mid, {"tools": TOOL_LIST})
    elif method == "tools/call":
        _pool.submit(run_tool, mid, params)
    elif is_request:
        reply_error(mid, -32601, f"Method not found: {method}")
    # notifications (initialized, cancelled, ...) need no answer


def serve():
    global _out
    _out = sys.stdout.buffer
    sys.stdout = sys.stderr  # a stray print() must never corrupt the protocol stream
    log(f"connector {VERSION} ready (app: {BASE})")
    stdin = sys.stdin.buffer
    while True:
        line = stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            reply_error(None, -32700, "Parse error")
            continue
        for m in (msg if isinstance(msg, list) else [msg]):
            try:
                handle(m)
            except Exception:
                traceback.print_exc(file=sys.stderr)
    _pool.shutdown(wait=True)


# ----------------------------------------------------------------------------
# --install / --uninstall: the Claude desktop app's config file
# ----------------------------------------------------------------------------
def _moved_away(folder):
    return bool(glob.glob(os.path.join(folder, ".user-data-left*")))  # the app moved its data elsewhere


def claude_config_path():
    if "--config" in sys.argv:
        return sys.argv[sys.argv.index("--config") + 1]
    name = "claude_desktop_config.json"
    if sys.platform == "win32":
        la, ad = os.environ.get("LOCALAPPDATA", ""), os.environ.get("APPDATA", "")
        files = sorted(glob.glob(os.path.join(la, "Claude-Data", "*", name)), key=os.path.getmtime, reverse=True)
        folders = [os.path.dirname(f) for f in files] + [os.path.join(ad, "Claude")] + \
            glob.glob(os.path.join(la, "Packages", "Claude_*", "LocalCache", "Roaming", "Claude"))
    elif sys.platform == "darwin":
        folders = [os.path.expanduser("~/Library/Application Support/Claude")]
    else:
        folders = [os.path.expanduser("~/.config/Claude")]
    live = [f for f in folders if os.path.isdir(f) and not _moved_away(f)]
    for f in live:
        if os.path.exists(os.path.join(f, name)):
            return os.path.join(f, name)
    return os.path.join((live or folders)[0], name)


def install(remove=False):
    path = claude_config_path()
    cfg = {}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                cfg = json.load(f)
        except ValueError as e:
            print(f"Could not read {path} ({e}); it was not changed.")
            return 1
        with open(path, encoding="utf-8") as src, open(path + ".guraydingview.bak", "w", encoding="utf-8") as dst:
            dst.write(src.read())
    servers = cfg.setdefault("mcpServers", {})
    if remove:
        if servers.pop(SERVER_NAME, None) is None:
            print("Guraydingview was not in the Claude desktop app's config.")
            return 0
    else:
        py = sys.executable
        if os.path.basename(py).lower() == "pythonw.exe":
            py = os.path.join(os.path.dirname(py), "python.exe")
        entry = {"command": py, "args": [os.path.abspath(__file__)]}
        if os.environ.get("GV_PORT"):
            entry["env"] = {"GV_PORT": os.environ["GV_PORT"]}
        servers[SERVER_NAME] = entry
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    print(f"{'Removed Guraydingview from' if remove else 'Added Guraydingview to'} the Claude desktop app: {path}")
    print("Quit Claude completely (right-click its tray icon -> Quit) and open it again.")
    return 0


if __name__ == "__main__":
    if "--install" in sys.argv:
        sys.exit(install())
    if "--uninstall" in sys.argv:
        sys.exit(install(remove=True))
    serve()
