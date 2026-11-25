#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Guraydingview — local charting server (unlimited drawings).

    python server.py          -> http://127.0.0.1:8765
    python server.py --open   -> starts the server and opens the browser

Data sources : Yahoo Finance, Binance, FRED, ISM (ism-feed), TCMB EVDS, multpl.com, data/csv/*.csv
Saved data   : data/watchlist.json, data/drawings.json, data/config.json
Python standard library only (no pip install needed).
"""
import bisect
import csv
import html
import io
import json
import os
import re
import shutil
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
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(ROOT, "static")
DATA_DIR = os.path.join(ROOT, "data")
CSV_DIR = os.path.join(DATA_DIR, "csv")
WATCHLIST_FILE = os.path.join(DATA_DIR, "watchlist.json")
DRAWINGS_FILE = os.path.join(DATA_DIR, "drawings.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
EVDS_BASE = "https://evds3.tcmb.gov.tr/igmevdsms-dis/"  # TCMB EVDS official web service (key sent in the 'key' header)
HOST = "127.0.0.1"
PORT = int(os.environ.get("GV_PORT") or os.environ.get("GRAFIK_PORT") or "8765")

DAY = 86400
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
YAHOO_UA = "Mozilla/5.0"
PLAIN_UA = "guraydingview/1.0"  # FRED blocks clients that pretend to be a browser


class SymbolError(Exception):
    """Symbol not found / no data — the message is shown to the user."""


# ----------------------------------------------------------------------------
# Symbol table: short name -> (source, code at the source, description, multiplier)
# Anything else: "FRED:UNRATE", "BINANCE:ETHUSDT", "BIST:THYAO", "MULTPL:shiller-pe",
# "CSV:file", or a plain Yahoo ticker (AAPL, THYAO.IS, EURUSD=X).
# For a ratio, join two symbols with "/": GOLD/SILVER, XU030/USDTRY
# ----------------------------------------------------------------------------
ALIASES = {
    "GOLD": ("yahoo", "GC=F", "Gold · USD/oz", 1),
    "SILVER": ("yahoo", "SI=F", "Silver · USD/oz", 1),
    "PLATINUM": ("yahoo", "PL=F", "Platinum", 1),
    "COPPER": ("yahoo", "HG=F", "Copper", 1),
    "USOIL": ("yahoo", "CL=F", "Crude oil (WTI)", 1),
    "UKOIL": ("yahoo", "BZ=F", "Brent crude", 1),
    "BTCUSD": ("binance", "BTCUSDT", "Bitcoin / US Dollar", 1),
    "ETHUSD": ("binance", "ETHUSDT", "Ethereum / US Dollar", 1),
    "SOLUSD": ("binance", "SOLUSDT", "Solana / US Dollar", 1),
    "USDTRY": ("yahoo", "TRY=X", "US Dollar / Turkish Lira", 1),
    "EURTRY": ("yahoo", "EURTRY=X", "Euro / Turkish Lira", 1),
    "EURUSD": ("yahoo", "EURUSD=X", "Euro / US Dollar", 1),
    "DXY": ("yahoo", "DX-Y.NYB", "US Dollar Index", 1),
    "SPX": ("yahoo", "^GSPC", "S&P 500", 1),
    "NDX": ("yahoo", "^NDX", "Nasdaq 100", 1),
    "DJI": ("yahoo", "^DJI", "Dow Jones", 1),
    "VIX": ("yahoo", "^VIX", "Volatility Index", 1),
    "US10Y": ("yahoo", "^TNX", "US 10-year yield", 1),
    "XU030": ("yahoo", "XU030.IS", "BIST 30", 1),
    "XU100": ("yahoo", "XU100.IS", "BIST 100", 1),
    "WALCL": ("fred", "WALCL", "Fed balance sheet (total assets)", 1e6),
    "USM2": ("fred", "M2SL", "US M2 money supply", 1e9),
    "TCU": ("fred", "TCU", "US capacity utilization", 1),
    "M2V": ("fred", "M2V", "M2 money velocity", 1),
    "UNRATE": ("fred", "UNRATE", "US unemployment rate", 1),
    "SHILLER": ("multpl", "shiller-pe", "Shiller CAPE (S&P 500)", 1),
    # ISM Manufacturing (since 2013, from GitHub ism-feed, updated monthly from the ISM release).
    # A file with the same name in data/csv (e.g. a longer history) takes priority.
    "USBCOI": ("ism", "PMI", "US ISM Manufacturing PMI", 1),
    "USMNO": ("ism", "New Orders", "US ISM Manufacturing New Orders", 1),
    "USISMMI": ("ism", "Inventories", "US ISM Manufacturing Inventories", 1),
    "USISMEMP": ("ism", "Employment", "US ISM Manufacturing Employment", 1),
}
ISM_FEED_URL = "https://raw.githubusercontent.com/sofiaverma06/ism-feed/main/ism_history.csv"

# Short names served from TCMB EVDS. Codes can be changed in Settings (saved in data/config.json).
DEFAULT_CONFIG = {
    "evds_key": "",
    "evds_series": {
        # weekly "Money Supply" table (bie_hpbitablo1), thousand TL -> ×1000; matches TradingView TRM1/TRM2
        "TRM1": {"code": "TP.HPBITABLO1.2", "mult": 1000, "name": "Turkey M1 money supply"},
        "TRM2": {"code": "TP.HPBITABLO1.11", "mult": 1000, "name": "Turkey M2 money supply"},
    },
}

SOURCE_LABEL = {"yahoo": "Yahoo", "binance": "Binance", "fred": "FRED",
                "multpl": "multpl", "csv": "CSV", "ratio": "Ratio", "evds": "TCMB EVDS", "ism": "ISM"}

DEFAULT_WATCHLIST = {"groups": [
    {"name": "", "symbols": ["WALCL", "USM2"]},
    {"name": "STOCKS", "symbols": ["GOOGL"]},
    {"name": "CRYPTO", "symbols": ["GOLD/BTCUSD", "BTCUSD"]},
    {"name": "COMMODITY", "symbols": ["GOLD", "SILVER", "GOLD/SILVER"]},
    {"name": "ETF", "symbols": ["VT", "FXI", "KWEB", "TQQQ"]},
    {"name": "BIST", "symbols": ["XU030/USDTRY"]},
    {"name": "INDEX", "symbols": ["TCU", "M2V", "SHILLER", "TRM1", "TRM2", "USDTRY"]},
]}


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def http_get(url, ua=PLAIN_UA, timeout=25):
    last = None
    for _ in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                raise
            last = e
        except Exception as e:  # timeout etc. -> try once more
            last = e
        time.sleep(0.4)
    raise last


_cache = {}
_cache_lock = threading.Lock()


def cached(key, ttl, fn):
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
    if hit and hit[0] > now:
        if isinstance(hit[1], Exception):
            raise hit[1]
        return hit[1]
    try:
        val = fn()
    except SymbolError as e:  # don't keep querying a symbol that doesn't exist
        with _cache_lock:
            _cache[key] = (now + 120, e)
        raise
    with _cache_lock:
        _cache[key] = (now + ttl, val)
    return val


def ts_of(y, m, d):
    return int((datetime(y, m, d, tzinfo=timezone.utc) - EPOCH).total_seconds())


def dt_of(t):  # fromtimestamp fails for negative timestamps on Windows
    return EPOCH + timedelta(seconds=t)


def week_floor(t):
    d = t // DAY
    return ((d + 3) // 7 * 7 - 3) * DAY  # weeks start on Monday


def month_floor(t):
    dt = dt_of(t)
    return ts_of(dt.year, dt.month, 1)


def dedupe(bars):
    """Sort by time and merge bars with the same timestamp."""
    bars.sort(key=lambda b: b[0])
    out = []
    for b in bars:
        if out and out[-1][0] == b[0]:
            o = out[-1]
            o[2] = max(o[2], b[2])
            o[3] = min(o[3], b[3])
            o[4] = b[4]
        else:
            out.append(list(b))
    return out


def resample(bars, iv):
    floor = {"4h": lambda t: t // 14400 * 14400, "1w": week_floor, "1M": month_floor}[iv]
    out = []
    for t, o, h, l, c in bars:
        k = floor(t)
        if out and out[-1][0] == k:
            x = out[-1]
            x[2] = max(x[2], h)
            x[3] = min(x[3], l)
            x[4] = c
        else:
            out.append([k, o, h, l, c])
    return out


def median_step(bars):
    ts = [b[0] for b in bars[-120:]]
    diffs = sorted(b - a for a, b in zip(ts, ts[1:]) if b > a)
    return diffs[len(diffs) // 2] if diffs else DAY


MONTHS_EN = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def parse_date_any(s):
    s = s.strip().strip('"')
    m = re.match(r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})", s)
    if m:
        return ts_of(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"^(\d{1,2})[-./](\d{1,2})[-./](\d{4})", s)
    if m:  # dd.mm.yyyy
        return ts_of(int(m[3]), int(m[2]), int(m[1]))
    m = re.match(r"^(\d{4})[-/]Q([1-4])$", s, re.I)
    if m:
        return ts_of(int(m[1]), (int(m[2]) - 1) * 3 + 1, 1)
    m = re.match(r"^(\d{4})[-./](\d{1,2})$", s)
    if m:  # yyyy-mm (EVDS monthly)
        return ts_of(int(m[1]), int(m[2]), 1)
    m = re.match(r"^(\d{4})-S([12])$", s, re.I)
    if m:  # yyyy-S1 (EVDS semiannual)
        return ts_of(int(m[1]), 1 if m[2] == "1" else 7, 1)
    m = re.match(r"^(\d{4})$", s)
    if m:  # yearly
        return ts_of(int(m[1]), 1, 1)
    m = re.match(r"^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$", s)
    if m and m[1].lower() in MONTHS_EN:
        return ts_of(int(m[3]), MONTHS_EN[m[1].lower()], int(m[2]))
    if re.match(r"^\d{9,11}$", s):
        return int(s)
    raise ValueError(s)


def parse_num(s):
    s = s.strip().strip('"').replace(" ", "").replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    return float(s)


# ----------------------------------------------------------------------------
# data sources
# ----------------------------------------------------------------------------
def _session_info(meta):
    """Regular session start/end in exchange local time, and whether there is an extended session."""
    ctp = meta.get("currentTradingPeriod") or {}
    reg, pre, post = ctp.get("regular") or {}, ctp.get("pre") or {}, ctp.get("post") or {}
    off = int(meta.get("gmtoffset") or 0)
    if not reg.get("start"):
        return None
    has_ext = (pre.get("end", 0) - pre.get("start", 0) > 0) or (post.get("end", 0) - post.get("start", 0) > 0)
    return {"off": off, "regStart": (reg["start"] + off) % DAY, "regEnd": (reg["end"] + off) % DAY, "ext": has_ext}


def fetch_yahoo(ticker, base, short, ext=False):
    ext = ext and base != "1d"  # pre/after-hours bars only on intraday intervals
    if base == "1d":
        q = "range=3mo&interval=1d" if short else \
            f"period1=-2208988800&period2={int(time.time()) + DAY}&interval=1d"
    elif base == "1h":
        q = "range=5d&interval=60m" if short else "range=730d&interval=60m"
    else:
        q = "range=5d&interval=15m" if short else "range=60d&interval=15m"
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           + urllib.parse.quote(ticker, safe="") + "?" + q + f"&includePrePost={'true' if ext else 'false'}")
    try:
        raw = http_get(url, YAHOO_UA)
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            raise SymbolError(f"Not found on Yahoo: {ticker}")
        raise
    res = ((json.loads(raw).get("chart") or {}).get("result") or [None])[0]
    if not res or not res.get("timestamp"):
        raise SymbolError(f"No data on Yahoo: {ticker}")
    meta = res.get("meta") or {}
    off = int(meta.get("gmtoffset") or 0)
    q = res["indicators"]["quote"][0]
    O, H, L, C = q.get("open"), q.get("high"), q.get("low"), q.get("close")
    step = {"1h": 3600, "15m": 900}.get(base)
    bars = []
    for i, t in enumerate(res["timestamp"]):
        c = C[i]
        if c is None or c <= 0:
            continue
        o = O[i] if O[i] else c
        h = H[i] if H[i] else max(o, c)
        l = L[i] if L[i] else min(o, c)
        if base == "1d":
            t = (t + off) // DAY * DAY  # exchange local date
        elif not ext:
            t = t // step * step
        bars.append([int(t), o, max(h, o, c), min(l, o, c), c])
    bars = dedupe(bars)
    if ext and len(bars) > 1 and bars[-1][0] - bars[-2][0] < step:
        # Yahoo stamps the live bar with the current time: merge it into the previous bar
        last = bars.pop()
        bars[-1][2] = max(bars[-1][2], last[2])
        bars[-1][3] = min(bars[-1][3], last[3])
        bars[-1][4] = last[4]
    info = {"name": meta.get("longName") or meta.get("shortName") or ticker,
            "exchange": meta.get("fullExchangeName") or meta.get("exchangeName") or "",
            "currency": meta.get("currency") or "", "session": _session_info(meta),
            "type": meta.get("instrumentType") or ""}
    return bars, info


def yahoo_ext_quote(ticker):
    """Latest pre-market or after-hours price for US stocks/ETFs (None while the regular session is open)."""
    def fn():
        url = ("https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(ticker, safe="")
               + "?interval=5m&range=2d&includePrePost=true")
        res = ((json.loads(http_get(url, YAHOO_UA)).get("chart") or {}).get("result") or [None])[0]
        if not res:
            return None
        meta = res.get("meta") or {}
        sess = _session_info(meta)
        if not sess or not sess["ext"] or meta.get("instrumentType") not in ("EQUITY", "ETF"):
            return None
        reg = (meta.get("currentTradingPeriod") or {}).get("regular") or {}
        now = time.time()
        if reg.get("start", 0) <= now < reg.get("end", 0):
            return None  # regular session is open
        closes = res["indicators"]["quote"][0].get("close") or []
        pts = [(t, c) for t, c in zip(res.get("timestamp") or [], closes) if c]
        if not pts:
            return None
        t, price = pts[-1]
        local = (t + sess["off"]) % DAY
        if sess["regStart"] <= local < sess["regEnd"]:
            return None  # last trade was in the regular session: no extended-hours price yet
        base = meta.get("regularMarketPrice")
        if not base:
            return None
        chg = price - base
        return {"session": "pre" if local < sess["regStart"] else "post", "price": _r(price),
                "chg": _r(chg), "pct": _r(chg / base * 100), "t": int(t)}
    try:
        return cached(("yext", ticker), 60, fn)
    except Exception:
        return None


def fetch_binance(pair, base, short):
    api = "https://api.binance.com/api/v3/klines"

    def get(params):
        try:
            return json.loads(http_get(api + "?" + urllib.parse.urlencode(params)))
        except urllib.error.HTTPError as e:
            if e.code == 400:
                raise SymbolError(f"Not found on Binance: {pair}")
            raise

    rows = []
    if short:
        rows = get({"symbol": pair, "interval": base, "limit": 100})
    elif base == "1d":
        start = 0
        while True:
            chunk = get({"symbol": pair, "interval": base, "limit": 1000, "startTime": start})
            rows += chunk
            if len(chunk) < 1000:
                break
            start = chunk[-1][0] + 1
    else:
        end = None
        for _ in range(6):
            p = {"symbol": pair, "interval": base, "limit": 1000}
            if end:
                p["endTime"] = end
            chunk = get(p)
            rows = chunk + rows
            if len(chunk) < 1000:
                break
            end = chunk[0][0] - 1
    if not rows:
        raise SymbolError(f"No data on Binance: {pair}")
    bars = [[r[0] // 1000, float(r[1]), float(r[2]), float(r[3]), float(r[4])] for r in rows]
    return dedupe(bars), {"name": pair, "exchange": "Binance", "currency": "USDT"}


def fetch_fred(sid):
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + urllib.parse.quote(sid, safe="")
    try:
        txt = http_get(url).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            raise SymbolError(f"Not found on FRED: {sid}")
        raise
    lines = txt.strip().splitlines()
    if not lines or "," not in lines[0] or lines[0].lstrip().startswith("<"):
        raise SymbolError(f"Not found on FRED: {sid}")
    bars = []
    for row in csv.reader(lines[1:]):
        if len(row) < 2 or row[1].strip() in ("", "."):
            continue
        try:
            t, v = parse_date_any(row[0]), float(row[1])
        except ValueError:
            continue
        bars.append([t, v, v, v, v])
    if not bars:
        raise SymbolError(f"No data on FRED: {sid}")
    return dedupe(bars), {"name": sid, "exchange": "FRED", "currency": ""}


def _cell(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def fetch_multpl(slug):
    url = f"https://www.multpl.com/{urllib.parse.quote(slug)}/table/by-month"
    try:
        page = http_get(url, YAHOO_UA).decode("utf-8", "replace")
    except urllib.error.HTTPError:
        raise SymbolError(f"Not found on multpl.com: {slug}")
    except Exception as e:
        raise SymbolError(f"Could not reach multpl.com ({e.__class__.__name__})")
    bars = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S | re.I):
        cells = [_cell(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]
        if len(cells) < 2:
            continue
        try:
            t = parse_date_any(cells[0])
        except ValueError:
            continue
        m = re.search(r"-?\d+(?:\.\d+)?", cells[1].replace(",", ""))
        if m:
            v = float(m[0])
            bars.append([t, v, v, v, v])
    if not bars:
        raise SymbolError(f"Could not read data from multpl.com: {slug}")
    return dedupe(bars), {"name": slug, "exchange": "multpl.com", "currency": ""}


def find_csv(name):
    if not os.path.isdir(CSV_DIR):
        return None
    target = name.strip().lower()
    for f in os.listdir(CSV_DIR):
        stem, ext = os.path.splitext(f)
        if ext.lower() in (".csv", ".txt") and stem.lower() == target:
            return os.path.join(CSV_DIR, f)
    return None


def fetch_csv(path):
    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        text = f.read()
    first = text.splitlines()[0] if text.strip() else ""
    delim = ";" if ";" in first else ("\t" if "\t" in first else ",")
    bars = []
    for row in csv.reader(io.StringIO(text), delimiter=delim):
        row = [c for c in row if c.strip() != ""]
        if len(row) < 2:
            continue
        try:
            t = parse_date_any(row[0])
            vals = [parse_num(x) for x in row[1:5]]
        except ValueError:
            continue  # header row etc.
        if len(vals) >= 4:
            o, h, l, c = vals[:4]
        else:
            o = h = l = c = vals[-1]
        bars.append([t, o, max(o, h, l, c), min(o, h, l, c), c])
    if not bars:
        raise SymbolError(f"Could not read CSV: {os.path.basename(path)} (expected: date,value)")
    return dedupe(bars), {"name": os.path.splitext(os.path.basename(path))[0], "exchange": "CSV", "currency": ""}


ISM_BASE_FILE = os.path.join(DATA_DIR, "ism_base.csv")
ISM_COLS = ["PMI", "New Orders", "Inventories", "Employment"]
FRED_MD_ISM = {"PMI": "NAPM", "New Orders": "NAPMNOI", "Inventories": "NAPMII", "Employment": "NAPMEI"}


def _find_fredmd_zip():
    """FRED-MD archive downloaded by the user: project folder, data/ or Downloads."""
    for d in (ROOT, DATA_DIR, os.path.join(os.path.expanduser("~"), "Downloads")):
        try:
            for f in sorted(os.listdir(d)):
                if f.lower().startswith("historical-vintages-of-fred-md") and f.lower().endswith(".zip"):
                    return os.path.join(d, f)
        except OSError:
            continue
    return None


def build_ism_base(zip_path):
    """Extract the 1959–2016 ISM history from the 2016 FRED-MD vintage (the last one before ISM series were removed)."""
    import zipfile
    with zipfile.ZipFile(zip_path) as z:
        members = sorted((n for n in z.namelist() if n.lower().endswith(".csv")), reverse=True)
        for name in [n for n in members if re.search(r"201[56]-\d\d", os.path.basename(n))]:
            text = z.read(name).decode("utf-8-sig", "replace")
            rows = list(csv.reader(io.StringIO(text)))
            if not rows or "NAPM" not in rows[0]:
                continue  # 2016-06 and later: ISM series removed
            idx = {c: rows[0].index(col) for c, col in FRED_MD_ISM.items() if col in rows[0]}
            out = ["date," + ",".join(ISM_COLS)]
            for r in rows[1:]:
                m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", r[0].strip()) if r else None
                if not m:
                    continue  # "Transform:" row etc.
                vals = [r[idx[c]].strip() if c in idx and idx[c] < len(r) else "" for c in ISM_COLS]
                if any(vals):
                    out.append(f"{m[3]}-{int(m[1]):02d}-01," + ",".join(vals))
            if len(out) > 100:
                tmp = ISM_BASE_FILE + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write("\n".join(out) + "\n")
                os.replace(tmp, ISM_BASE_FILE)
                return name, len(out) - 1
    return None, 0


def _ism_rows(text, column):
    rows = list(csv.reader(io.StringIO(text)))
    if not rows or column not in rows[0]:
        return []
    ci = rows[0].index(column)
    bars = []
    for r in rows[1:]:
        if len(r) <= ci or not r[ci].strip():
            continue
        try:
            dt = dt_of(parse_date_any(r[0]))
            v = float(r[ci])
        except ValueError:
            continue
        # TradingView plots a value on its release date (October data → Nov 2): use the 1st of the next month
        y, m = (dt.year + 1, 1) if dt.month == 12 else (dt.year, dt.month + 1)
        bars.append([ts_of(y, m, 1), v, v, v, v])
    return bars


def fetch_ism(column):
    """ISM Manufacturing: GitHub ism-feed since 2013 (updated monthly) + the 1959–2016 FRED-MD history if present."""
    try:
        text = http_get(ISM_FEED_URL).decode("utf-8-sig", "replace")
    except Exception as e:
        raise SymbolError(f"Could not reach ISM data ({e.__class__.__name__})")
    bars = _ism_rows(text, column)
    if not bars:
        raise SymbolError(f"ISM data has no '{column}' column")
    if not os.path.exists(ISM_BASE_FILE):
        z = _find_fredmd_zip()
        if z:
            try:
                build_ism_base(z)
            except Exception:
                traceback.print_exc()
    if os.path.exists(ISM_BASE_FILE):
        feed_start = min(b[0] for b in bars)
        with open(ISM_BASE_FILE, encoding="utf-8") as f:
            old = [b for b in _ism_rows(f.read(), column) if b[0] < feed_start]  # overlapping months: the current source wins
        bars = old + bars
    return dedupe(bars), {"name": column, "exchange": "Institute for Supply Management", "currency": ""}


# ----------------------------------------------------------------------------
# TCMB EVDS (official web service, with the user's free API key)
# ----------------------------------------------------------------------------
class EvdsAuthError(SymbolError):
    pass


EVDS_ARCHIVED = {"", "TP.PR.ARZ01", "TP.PR.ARZ13", "TP.PR.ARZ22"}  # money supply series archived by TCMB in 2025
EVDS_ROW_CAP = 1000  # EVDS returns at most this many rows per request

EVDS_NO_KEY = ("No EVDS API key yet. Enter your TCMB EVDS key in ⚙ Settings (top right) "
               "(evds3.tcmb.gov.tr → Profile → API Key, free).")


def load_config():
    cfg = read_json(CONFIG_FILE, {})
    out = {"evds_key": str(cfg.get("evds_key") or ""), "evds_series": {}}
    series = cfg.get("evds_series") if isinstance(cfg.get("evds_series"), dict) else {}
    for alias, d in {**DEFAULT_CONFIG["evds_series"], **series}.items():
        base = DEFAULT_CONFIG["evds_series"].get(alias, {})
        d = d if isinstance(d, dict) else {}
        code = str(d.get("code", base.get("code", "")) or "").strip().upper()
        if code in EVDS_ARCHIVED and alias.upper() in DEFAULT_CONFIG["evds_series"]:
            code = base.get("code", code)  # switch from an archived TCMB code to the current series
        out["evds_series"][alias.upper()] = {
            "code": code,
            "mult": float(d.get("mult", base.get("mult", 1)) or 1),
            "name": d.get("name") or base.get("name") or alias.upper(),
        }
    return out


def _pick(d, *names):
    if not isinstance(d, dict):
        return None
    up = {str(k).upper(): v for k, v in d.items()}
    for n in names:
        if n in up and up[n] not in (None, ""):
            return up[n]
    return None


def _items(j):
    if isinstance(j, list):
        return j
    if isinstance(j, dict):
        for k in ("items", "data", "result"):
            if isinstance(j.get(k), list):
                return j[k]
    return []


def evds_get(path):
    key = load_config()["evds_key"].strip()
    if not key:
        raise EvdsAuthError(EVDS_NO_KEY)
    req = urllib.request.Request(EVDS_BASE + path, headers={
        "User-Agent": PLAIN_UA, "Accept": "application/json", "key": key})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        body = e.read()[:300].decode("utf-8", "replace")
        if e.code in (401, 403):
            raise EvdsAuthError("EVDS rejected the API key (wrong or invalid). Check it in Settings.")
        if e.code in (400, 404):
            raise SymbolError(f"EVDS rejected the request ({e.code}): {body.strip()[:160]}")
        raise
    txt = raw.decode("utf-8", "replace").strip()
    if not txt:
        return []
    try:
        return json.loads(txt)
    except ValueError:
        raise SymbolError(f"Unexpected response from EVDS: {txt[:120]}")


def _evds_rows(code, start, end, depth=0):
    """EVDS truncates at 1000 rows: when the cap is hit, split the range in two and ask again."""
    j = evds_get(f"series={urllib.parse.quote(code, safe='.')}&startDate={start:%d-%m-%Y}"
                 f"&endDate={end:%d-%m-%Y}&type=json")
    items = _items(j)
    if len(items) >= EVDS_ROW_CAP and depth < 10 and (end - start).days > 40:
        mid = start + (end - start) / 2
        return _evds_rows(code, start, mid, depth + 1) + _evds_rows(code, mid + timedelta(days=1), end, depth + 1)
    return items


def fetch_evds(code):
    rows = _evds_rows(code, datetime(1970, 1, 1), datetime.now(timezone.utc).replace(tzinfo=None))
    col = code.replace(".", "_").upper()
    bars = []
    for it in rows:
        if not isinstance(it, dict):
            continue
        v = _pick(it, col)
        if v is None:  # if the column name differs, take the first field that is not a date
            v = next((x for k, x in it.items() if str(k).upper() not in ("TARIH", "UNIXTIME", "YEARWEEK")), None)
        try:
            x = float(str(v).replace(",", "."))
        except (TypeError, ValueError):
            continue
        t = None
        tarih = _pick(it, "TARIH")
        if tarih:
            try:
                t = parse_date_any(str(tarih))
            except ValueError:
                t = None
        if t is None:
            ux = _pick(it, "UNIXTIME")
            if isinstance(ux, dict):
                ux = ux.get("$numberLong")
            if ux:
                t = (int(ux) + 3 * 3600) // DAY * DAY
        if t is not None:
            bars.append([t, x, x, x, x])
    if not bars:
        raise SymbolError(f"No data on EVDS or wrong code: {code}")
    return dedupe(bars), {"name": code, "exchange": "TCMB EVDS", "currency": "TRY"}


def evds_test():
    cfg = load_config()
    out = []
    for alias, e in cfg["evds_series"].items():
        row = {"alias": alias, "code": e["code"], "mult": e["mult"]}
        if not e["code"]:
            row["error"] = "No series code chosen"
        else:
            try:
                bars, _ = fetch_evds(e["code"])
                row.update(last=_r(bars[-1][4] * e["mult"]), raw=_r(bars[-1][4]), t=bars[-1][0], count=len(bars))
                try:
                    meta = _items(evds_get(f"serieList/type=json&code={urllib.parse.quote(e['code'], safe='.')}"))
                    if meta:
                        row["name"] = _pick(meta[0], "SERIE_NAME", "SERIE_NAME_ENG")
                except EvdsAuthError:
                    raise
                except Exception:
                    pass
            except EvdsAuthError as ex:
                return {"error": str(ex)}
            except SymbolError as ex:
                row["error"] = str(ex)
            except Exception as ex:
                row["error"] = f"Connection error: {ex.__class__.__name__}"
        out.append(row)
    return {"results": out}


MONEY_RE = re.compile(r"para\s*arz|parasal\s*b|money\s*supply|monetary\s*aggregate", re.I)


def evds_find(seed):
    """Find the money supply series via the official EVDS metadata service."""
    groups = {}
    # 1) from the data group of a known series code
    for code in [c for c in [seed, "TP.HPBITABLO1.11"] if c]:
        try:
            for m in _items(evds_get(f"serieList/type=json&code={urllib.parse.quote(code, safe='.')}")):
                gc = _pick(m, "DATAGROUP_CODE")
                if gc:
                    groups.setdefault(gc, _pick(m, "DATAGROUP_NAME", "DATAGROUP_NAME_ENG") or gc)
        except EvdsAuthError:
            raise
        except Exception:
            pass
    # 2) search category and data group names for "money supply" (skipping archive categories)
    if True:
        for c in _items(evds_get("categories/type=json")):
            title = " ".join(str(_pick(c, n) or "") for n in ("TOPIC_TITLE_TR", "TOPIC_TITLE_ENG", "CATEGORY_NAME"))
            cid = _pick(c, "CATEGORY_ID")
            if cid is None or not re.search(r"para|monet|banka|bank", title, re.I) or re.search(r"arşiv|archive", title, re.I):
                continue
            try:
                cid = int(float(cid))  # EVDS sends ids like "450101.0"; the decimal form gives HTTP 400
                for g in _items(evds_get(f"datagroups/mode=2&code={cid}&type=json")):
                    name = " ".join(str(_pick(g, n) or "") for n in ("DATAGROUP_NAME", "DATAGROUP_NAME_ENG"))
                    gc = _pick(g, "DATAGROUP_CODE")
                    if gc and MONEY_RE.search(name):
                        groups.setdefault(gc, _pick(g, "DATAGROUP_NAME") or gc)
            except EvdsAuthError:
                raise
            except Exception:
                continue
    result = []
    for gc, gname in list(groups.items())[:6]:
        try:
            series = [{"code": _pick(s, "SERIE_CODE"), "name": _pick(s, "SERIE_NAME", "SERIE_NAME_ENG") or "",
                       "freq": _pick(s, "FREQUENCY_STR", "FREQUENCY") or ""}
                      for s in _items(evds_get(f"serieList/type=json&code={urllib.parse.quote(gc, safe='._')}"))]
        except EvdsAuthError:
            raise
        except Exception:
            series = []
        series = [s for s in series if s["code"]]
        archived = bool(series) and all("arşiv" in s["name"].lower() or "arsiv" in s["name"].lower() for s in series)
        result.append({"code": gc, "name": gname + (" (archive)" if archived else ""), "archived": archived,
                       "series": series})
    result.sort(key=lambda g: g["archived"])  # current groups first
    if not result:
        raise SymbolError("No money supply data group found on EVDS. You can look up the code on the EVDS site and type it in.")
    return {"groups": result}


# ----------------------------------------------------------------------------
# symbol resolution and series building
# ----------------------------------------------------------------------------
def _spec(src, code, name=None, mult=1):
    return {"key": f"{src}:{code}", "src": src, "code": code, "name": name or code,
            "named": bool(name), "mult": mult, "lowfreq": src in ("fred", "multpl", "csv", "evds", "ism")}


def resolve(sym):
    s = (sym or "").strip()
    if not s:
        raise SymbolError("Empty symbol")
    if "/" in s:
        left, right = s.split("/", 1)
        a, b = resolve(left), resolve(right)
        return {"key": f"({a['key']})/({b['key']})", "src": "ratio", "a": a, "b": b,
                "name": f"{a['name']} / {b['name']}", "named": True,
                "lowfreq": a["lowfreq"] or b["lowfreq"]}
    u = s.upper()
    if u in ALIASES:
        src, code, name, mult = ALIASES[u]
        if src == "ism" and find_csv(u):
            return _spec("csv", u, name)  # a (longer) CSV provided by the user takes priority
        return _spec(src, code, name, mult)
    cfg = load_config()
    if u in cfg["evds_series"]:
        e = cfg["evds_series"][u]
        if find_csv(u) and (not e["code"] or not cfg["evds_key"]):
            return _spec("csv", u, e["name"])  # without a key, use a CSV placed by hand
        if not e["code"]:
            raise SymbolError(f"No EVDS series code chosen for {u}. Pick one in ⚙ Settings (top right).")
        return _spec("evds", e["code"], e["name"], e["mult"])
    if ":" in s:
        prefix, rest = (x.strip() for x in s.split(":", 1))
        prefix = prefix.upper()
        if prefix == "FRED":
            return _spec("fred", rest.upper())
        if prefix == "BINANCE":
            return _spec("binance", rest.upper())
        if prefix in ("YAHOO", "Y"):
            return _spec("yahoo", rest.upper())
        if prefix == "BIST":
            return _spec("yahoo", rest.upper() + ".IS")
        if prefix == "MULTPL":
            return _spec("multpl", rest.lower())
        if prefix == "CSV":
            return _spec("csv", rest)
        if prefix in ("EVDS", "TCMB"):
            return _spec("evds", rest.upper())
        raise SymbolError(f"Unknown source prefix: {prefix}")
    if find_csv(s):
        return _spec("csv", s)
    if re.fullmatch(r"[A-Z0-9]{2,20}USDT", u):  # e.g. ETHUSDT -> Binance
        return _spec("binance", u)
    return _spec("yahoo", u)


def ratio_bars(a, b, base):
    """Divide a by b on a's calendar, using b's bar at that time (or the latest before it)."""
    bt = [x[0] for x in b]
    maxgap = 45 * DAY if base == "1d" else 2 * DAY
    out = []
    for t, o, h, l, c in a:
        i = bisect.bisect_right(bt, t) - 1
        if i < 0 or t - bt[i] > maxgap:
            continue
        _, bo, bh, bl, bc = b[i]
        if bt[i] != t:
            bo = bh = bl = bc
        if not (bo and bh and bl and bc):
            continue
        ro, rc = o / bo, c / bc
        out.append([t, ro, max(ro, rc, h / bh), min(ro, rc, l / bl), rc])
    return out


def load(spec, base, short, ext=False):
    src = spec["src"]
    if spec["lowfreq"]:
        base, short = "1d", False
    if src == "ratio":
        A, _ = load(spec["a"], base, short)
        B, _ = load(spec["b"], base, short)
        bars = ratio_bars(A, B, base)
        if not bars:
            raise SymbolError("Cannot compute the ratio: the two symbols have no common dates")
        return bars, {"name": spec["name"], "exchange": "Ratio", "currency": ""}
    if src == "csv":
        path = find_csv(spec["code"])
        if not path:
            raise SymbolError(f"{spec['code']}: no data file. Drag & drop a CSV file onto the chart "
                              f"(e.g. TradingView → Export chart data) or save it as data/csv/{spec['code']}.csv.")
        return cached(("csv", path, os.path.getmtime(path)), 3600, lambda: fetch_csv(path))

    ttl = {"yahoo": 15 if short else 120, "binance": 10 if short else 120,
           "fred": 3600, "multpl": 3600, "evds": 3600, "ism": 3600}[src]

    def fn():
        if src == "yahoo":
            bars, info = fetch_yahoo(spec["code"], base, short, ext)
        elif src == "binance":
            bars, info = fetch_binance(spec["code"], base, short)
        elif src == "fred":
            bars, info = fetch_fred(spec["code"])
        elif src == "evds":
            bars, info = fetch_evds(spec["code"])
        elif src == "ism":
            bars, info = fetch_ism(spec["code"])
        else:
            bars, info = fetch_multpl(spec["code"])
        m = spec["mult"]
        if m != 1:
            bars = [[b[0]] + [v * m for v in b[1:]] for b in bars]
        return bars, info

    ext = ext and src == "yahoo" and base != "1d"
    return cached((src, spec["code"], base, short, ext), ttl, fn)


INTERVALS = {"15m": ("15m", 900), "1h": ("1h", 3600), "4h": ("1h", 14400),
             "1d": ("1d", DAY), "1w": ("1d", 7 * DAY), "1M": ("1d", 30 * DAY)}


def get_series(sym, iv, short=False, ext=False):
    if iv not in INTERVALS:
        raise SymbolError(f"Invalid interval: {iv}")
    spec = resolve(sym)
    base, target = INTERVALS[iv]
    ext = ext and spec["src"] == "yahoo" and base != "1d"
    bars, info = load(spec, base, short, ext)
    if not bars:
        raise SymbolError("No data")
    if iv in ("4h", "1w", "1M") and target > median_step(bars) * 1.2:
        bars = resample(bars, iv)
    kind = "line" if all(b[1] == b[2] == b[3] == b[4] for b in bars[-60:]) else "ohlc"
    name = spec["name"] if spec.get("named") else info.get("name") or spec["name"]
    src = spec["src"]
    meta = {"name": name, "exchange": info.get("exchange", ""), "currency": info.get("currency", ""),
            "source": SOURCE_LABEL.get(src, src), "kind": kind,
            "lowfreq": spec["lowfreq"], "interval": iv}
    if ext and info.get("session") and info["session"].get("ext"):
        meta["session"] = info["session"]  # the client shades pre-market / after-hours bars
    return meta, bars


def _r(v):
    return float(f"{v:.10g}")


def quote(sym):
    try:
        meta, bars = get_series(sym, "1d", short=True)
        last = bars[-1][4]
        prev = bars[-2][4] if len(bars) > 1 else None
        chg = last - prev if prev is not None else 0.0
        pct = chg / prev * 100 if prev else 0.0
        out = {"last": _r(last), "chg": _r(chg), "pct": _r(pct), "t": bars[-1][0],
               "name": meta["name"], "source": meta["source"], "exchange": meta["exchange"]}
        spec = resolve(sym)
        if spec["src"] == "yahoo":
            ext = yahoo_ext_quote(spec["code"])
            if ext:
                out["ext"] = ext
        return out
    except SymbolError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"Connection error: {e.__class__.__name__}"}


_pool = ThreadPoolExecutor(max_workers=8)


# ----------------------------------------------------------------------------
# Symbol library: US stock list (rreichel3/US-Stock-Symbols) + Binance USDT pairs.
# Only the symbol list; prices are fetched only for the symbol you open.
# Loaded on first search, kept in memory for a day (not written to disk).
# ----------------------------------------------------------------------------
US_TICKER_SOURCES = {
    "NASDAQ": "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json",
    "NYSE": "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json",
    "AMEX": "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_full_tickers.json",
}
BINANCE_EXCHANGE_INFO = "https://api.binance.com/api/v3/exchangeInfo?permissions=SPOT"
POPULAR_COINS = ["BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "TRX", "AVAX", "LINK", "TON",
                 "SUI", "DOT", "LTC", "BCH", "NEAR", "PEPE", "APT", "UNI", "ARB"]
CATEGORIES = ("all", "stock", "fund", "futures", "forex", "crypto", "index", "economy")
CAT_LABEL = {"stock": "Stock", "fund": "Fund", "futures": "Futures", "forex": "Forex",
             "crypto": "Crypto", "index": "Index", "economy": "Economy"}
YAHOO_CAT = {"EQUITY": "stock", "ETF": "fund", "MUTUALFUND": "fund", "INDEX": "index",
             "FUTURE": "futures", "CURRENCY": "forex", "CRYPTOCURRENCY": "crypto"}

_catalog = {"t": 0, "stocks": [], "crypto": []}
_catalog_lock = threading.Lock()


def load_catalog():
    with _catalog_lock:
        if _catalog["t"] > time.time():
            return _catalog
        stocks, crypto, seen, failed = [], [], set(), False
        for exch, url in US_TICKER_SOURCES.items():
            try:
                for e in json.loads(http_get(url, timeout=30)):
                    sym = (e.get("symbol") or "").strip().upper()
                    if not sym or "^" in sym or "." in sym:
                        continue  # preferred / unusual share classes
                    sym = sym.replace("/", "-")
                    if sym in seen:
                        continue
                    seen.add(sym)
                    try:
                        mc = float(e.get("marketCap") or 0)
                    except ValueError:
                        mc = 0.0
                    stocks.append({"symbol": sym, "name": (e.get("name") or "").strip(), "exch": exch,
                                   "cat": "stock", "sector": e.get("sector") or "", "mc": mc})
            except Exception:
                failed = True
                traceback.print_exc()
        try:
            for s in json.loads(http_get(BINANCE_EXCHANGE_INFO, timeout=40)).get("symbols", []):
                if s.get("quoteAsset") != "USDT" or s.get("status") != "TRADING" or not s.get("isSpotTradingAllowed"):
                    continue
                crypto.append({"symbol": s["symbol"], "name": f"{s['baseAsset']} / TetherUS", "exch": "BINANCE",
                               "cat": "crypto", "base": s["baseAsset"]})
        except Exception:
            failed = True
            traceback.print_exc()
        if stocks:
            _catalog["stocks"] = stocks
        if crypto:
            _catalog["crypto"] = crypto
        # on error retry in 10 minutes, otherwise refresh daily
        _catalog["t"] = time.time() + (600 if failed else DAY)
        return _catalog


def alias_cat(src, code):
    if src == "binance":
        return "crypto"
    if src in ("fred", "multpl", "evds", "csv", "ism"):
        return "economy"
    if code.startswith("^") or code in ("DX-Y.NYB",) or (code.startswith("XU") and code.endswith(".IS")):
        return "index"
    if code.endswith("=F"):
        return "futures"
    if code.endswith("=X"):
        return "forex"
    return "stock"


def _score(q, sym, name, base=None):
    s, n = sym.upper(), name.upper()
    if s == q or (base and base.upper() == q):
        return 0.0
    if s.startswith(q):
        return 1 + len(s) / 100
    if n.startswith(q):
        return 2.0
    if q in s:
        return 3.0
    if re.search(r"(^|[^A-Z0-9])" + re.escape(q), n):
        return 4.0
    return None


def search(q, cat="all"):
    q = q.strip()
    cat = cat if cat in CATEGORIES else "all"
    uq = q.upper()
    want = lambda c: cat == "all" or c == cat  # noqa: E731
    found = []  # (score, -market cap, record)

    # short names (GOLD, USDTRY, WALCL...) and EVDS/CSV
    local = [(k, name, alias_cat(src, code), SOURCE_LABEL[src]) for k, (src, code, name, _m) in ALIASES.items()]
    local += [(k, e["name"], "economy", "TCMB EVDS") for k, e in load_config()["evds_series"].items()]
    if os.path.isdir(CSV_DIR):
        local += [(os.path.splitext(f)[0].upper(), "CSV file", "economy", "CSV")
                  for f in os.listdir(CSV_DIR) if f.lower().endswith((".csv", ".txt"))]
    for i, (k, name, c, exch) in enumerate(local):
        if not want(c):
            continue
        sc = _score(uq, k, name) if q else 1 + i / 1000
        if sc is not None:
            found.append((sc - 0.5, 0, {"symbol": k, "name": name, "exch": exch, "cat": c}))

    cata = load_catalog()
    if want("crypto"):
        if q:
            for it in cata["crypto"]:
                sc = _score(uq, it["symbol"], it["name"], it["base"])
                if sc is not None:
                    found.append((sc, 0, it))
        elif cat == "crypto":
            by_base = {it["base"]: it for it in cata["crypto"]}
            found += [(1 + i / 100, 0, by_base[b]) for i, b in enumerate(POPULAR_COINS) if b in by_base]
    if want("stock"):
        if q:
            for it in cata["stocks"]:
                sc = _score(uq, it["symbol"], it["name"])
                if sc is not None:
                    found.append((sc, -it["mc"], it))
        elif cat == "stock":
            found += [(1, -it["mc"], it) for it in sorted(cata["stocks"], key=lambda x: -x["mc"])[:40]]

    found.sort(key=lambda x: (x[0], x[1]))
    out, seen = [], set()
    for _s, _m, it in found:
        if it["symbol"] not in seen:
            seen.add(it["symbol"])
            out.append({k: it.get(k) for k in ("symbol", "name", "exch", "cat", "sector")})
        if len(out) >= 40:
            break

    # Yahoo search: ETFs, indices, futures, forex and non-US stocks (incl. BIST)
    if q and cat in ("all", "stock", "fund", "index", "futures", "forex"):
        try:
            url = "https://query1.finance.yahoo.com/v1/finance/search?" + urllib.parse.urlencode(
                {"q": q, "quotesCount": 20, "newsCount": 0, "listsCount": 0})
            extra = []
            for it in json.loads(http_get(url, YAHOO_UA, timeout=8)).get("quotes", []):
                s, c = it.get("symbol"), YAHOO_CAT.get(it.get("quoteType", ""), "")
                if not s or not c or s.upper() in seen or not want(c):
                    continue
                seen.add(s.upper())
                extra.append({"symbol": s, "name": it.get("longname") or it.get("shortname") or "",
                              "exch": it.get("exchDisp") or it.get("exchange") or "", "cat": c})
            # keep an exact Yahoo match (e.g. THYAO.IS, QQQ) on top
            top = [e for e in extra if e["symbol"].upper().split(".")[0] == uq]
            out = top + out + [e for e in extra if e not in top]
        except Exception:
            pass
    for o in out:
        o["type"] = CAT_LABEL.get(o.get("cat"), "")
    return out[:50]


# ----------------------------------------------------------------------------
# Logos: downloaded on first request and kept in data/logos.
# ----------------------------------------------------------------------------
LOGO_DIR = os.path.join(DATA_DIR, "logos")
STOCK_LOGO_SOURCES = [  # FMP also covers small caps, Parqet as fallback
    "https://images.financialmodelingprep.com/symbol/{s}.png",
    "https://assets.parqet.com/logos/symbol/{s}",
]
CRYPTO_LOGO_SOURCES = [  # spothq + CoinCap for newer coins
    "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/{l}.svg",
    "https://assets.coincap.io/assets/icons/{l}@2x.png",
]
FLAG_SOURCE = "https://hatscripts.github.io/circle-flags/flags/{c}.svg"  # Windows does not render flag emoji
FX_FLAGS = {"USD": "us", "EUR": "eu", "TRY": "tr", "GBP": "gb", "JPY": "jp", "CHF": "ch", "CAD": "ca",
            "AUD": "au", "NZD": "nz", "CNY": "cn", "CNH": "cn", "RUB": "ru", "SEK": "se", "NOK": "no",
            "DKK": "dk", "PLN": "pl", "ZAR": "za", "MXN": "mx", "BRL": "br", "INR": "in", "KRW": "kr",
            "SGD": "sg", "HKD": "hk", "SAR": "sa", "AED": "ae", "HUF": "hu", "CZK": "cz"}


def logo_target(sym):
    """Symbol -> (kind, id): ('stock','AAPL'), ('crypto','BTC'), ('flag','tr') or (None, None)."""
    s = (sym or "").strip().upper()
    if "/" in s:  # for ratios, the first symbol's logo
        s = s.split("/", 1)[0].strip()
    if s in load_config()["evds_series"]:
        return "flag", "tr"
    if s in ALIASES:
        src, code, _n, _m = ALIASES[s]
        if src == "binance":
            return "crypto", code[:-4] if code.endswith("USDT") else code
        if src in ("fred", "multpl", "ism") or (src == "csv" and s.startswith("US")):
            return "flag", "us"
        if code.endswith(".IS"):
            return "flag", "tr"
        if code.endswith("=X"):
            return "flag", FX_FLAGS.get(s[:3])
        if code.startswith("^") or code == "DX-Y.NYB":
            return "flag", "us"
        return None, None  # commodity futures: letter icon
    if ":" in s:
        prefix, rest = (x.strip() for x in s.split(":", 1))
        if prefix == "FRED":
            return "flag", "us"
        if prefix in ("EVDS", "TCMB"):
            return "flag", "tr"
        if prefix == "BIST":
            return "stock", rest + ".IS"
        if prefix not in ("BINANCE", "YAHOO", "Y"):
            return None, None
        s = rest
    if re.fullmatch(r"[A-Z0-9]{2,20}USDT", s):
        return "crypto", s[:-4]
    if s.endswith("=X"):
        return "flag", FX_FLAGS.get(s[:3])
    if s.startswith("^"):
        return "flag", "us"
    if s.endswith("=F") or find_csv(s):
        return None, None
    if re.fullmatch(r"[A-Z0-9][A-Z0-9.\-]{0,14}", s):
        return "stock", s
    return None, None


def get_logo(sym="", flag=""):
    kind, ident = ("flag", flag.lower()) if flag else logo_target(sym)
    if not kind or not ident:
        return None
    safe = re.sub(r"[^A-Za-z0-9.\-]", "", ident)
    if not safe:
        return None
    key = f"{kind}_{safe}"
    os.makedirs(LOGO_DIR, exist_ok=True)
    for ext, ctype in ((".png", "image/png"), (".svg", "image/svg+xml")):
        p = os.path.join(LOGO_DIR, key + ext)
        if os.path.exists(p):
            with open(p, "rb") as f:
                return f.read(), ctype
    miss = os.path.join(LOGO_DIR, key + ".none")
    if os.path.exists(miss) and os.path.getmtime(miss) > time.time() - 7 * DAY:
        return None  # not found recently, don't hammer the sources
    if kind == "flag":
        urls = [FLAG_SOURCE.format(c=safe.lower())]
    elif kind == "crypto":
        urls = [u.format(l=safe.lower()) for u in CRYPTO_LOGO_SOURCES]
    else:
        urls = [u.format(s=safe) for u in STOCK_LOGO_SOURCES]
        if safe.endswith(".IS"):
            urls.append(FLAG_SOURCE.format(c="tr"))
    for url in urls:
        try:
            data = http_get(url, timeout=6)
        except Exception:
            continue
        head = data[:300].lstrip()
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            ext, ctype = ".png", "image/png"
        elif head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in head):
            ext, ctype = ".svg", "image/svg+xml"
        else:
            continue
        with open(os.path.join(LOGO_DIR, key + ext), "wb") as f:
            f.write(data)
        return data, ctype
    with open(miss, "w") as f:
        f.write("")
    return None


# ----------------------------------------------------------------------------
# persistent storage
# ----------------------------------------------------------------------------
_file_lock = threading.RLock()


def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except Exception:
        traceback.print_exc()
        return default


def write_json(path, obj):
    with _file_lock:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        os.replace(tmp, path)


def sym_key(s):
    return (s or "").strip().upper()


REV_KEY = "__rev__"  # per-symbol revision numbers inside drawings.json


def save_csv(symbol, raw):
    """Validate a drag & dropped CSV and save it as data/csv/SYMBOL.csv."""
    name = re.sub(r"[^A-Z0-9_.\-]", "", sym_key(symbol).replace("/", "_"))
    if not name:
        raise SymbolError("Invalid symbol name")
    if name in ALIASES and ALIASES[name][0] != "csv":
        raise SymbolError(f"{name} already comes from {SOURCE_LABEL[ALIASES[name][0]]}; choose another name.")
    os.makedirs(CSV_DIR, exist_ok=True)
    tmp = os.path.join(CSV_DIR, f".{name}.upload")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(raw.decode("utf-8-sig", "replace"))
    try:
        bars, _ = fetch_csv(tmp)
    except Exception:
        os.remove(tmp)
        raise
    old = find_csv(name)
    if old:
        os.remove(old)
    os.replace(tmp, os.path.join(CSV_DIR, name + ".csv"))
    with _cache_lock:
        _cache.clear()
    return {"ok": True, "symbol": name, "count": len(bars), "first": bars[0][0], "last": bars[-1][0]}


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "application/javascript", ".mjs": "application/javascript",
                      ".css": "text/css", ".html": "text/html", ".json": "application/json",
                      ".svg": "image/svg+xml"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC_DIR, **kw)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        if not getattr(self, "_cacheable", False):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_image(self, data, ctype):
        self._cacheable = True
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=604800")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "script-src 'none'")  # external SVGs must not run scripts
        try:
            self.end_headers()
            self.wfile.write(data)
        except ConnectionError:
            self.close_connection = True

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        try:
            self.end_headers()
            self.wfile.write(body)
        except ConnectionError:  # the browser aborted the request (page reload etc.) — harmless
            self.close_connection = True

    def read_raw(self, limit=50 * 1024 * 1024):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("request too large")
        return self.rfile.read(n)

    def read_body(self):
        return json.loads(self.read_raw().decode("utf-8") or "null")

    def blocked(self, method):
        """Block requests to this local server from other websites (CSRF / DNS rebinding)."""
        allowed = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
        if (self.headers.get("Host") or "").lower() not in allowed:
            return True
        origin = (self.headers.get("Origin") or "").rstrip("/").lower()
        if origin and origin not in {f"http://{h}" for h in allowed}:
            return True
        # custom header: a browser cannot send it from another site without a preflight
        return method == "POST" and self.headers.get("X-Guraydingview") != "1"

    def do_GET(self):
        self._cacheable = False
        u = urllib.parse.urlsplit(self.path)
        if u.path.startswith("/api/"):
            return self.api("GET", u)
        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path.startswith("/api/"):
            return self.api("POST", u)
        self.send_error(404)

    def api(self, method, u):
        qs = urllib.parse.parse_qs(u.query)

        def arg(k, d=""):
            return (qs.get(k) or [d])[0]

        if self.blocked(method):
            return self.send_json({"error": "This request is only allowed from the Guraydingview page. "
                                            "If an old tab is open, close it and reload the page (Ctrl+F5)."}, 403)
        try:
            if u.path == "/api/bars":
                meta, bars = get_series(arg("symbol"), arg("interval", "1d"), arg("short") == "1", arg("ext") == "1")
                meta["symbol"] = sym_key(arg("symbol"))
                meta["bars"] = [[b[0], _r(b[1]), _r(b[2]), _r(b[3]), _r(b[4])] for b in bars]
                return self.send_json(meta)
            if u.path == "/api/quotes":
                syms = [s for s in arg("symbols").split(",") if s.strip()]
                res = dict(zip(syms, _pool.map(quote, syms)))
                return self.send_json(res)
            if u.path == "/api/logo":
                img = get_logo(arg("symbol"), arg("flag"))
                if not img:
                    self.send_response(404)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return None
                return self.send_image(*img)
            if u.path == "/api/search":
                return self.send_json(search(arg("q"), arg("cat", "all")))
            if u.path == "/api/watchlist":
                if method == "POST":
                    wl = self.read_body()
                    if not isinstance(wl, dict) or not isinstance(wl.get("groups"), list):
                        return self.send_json({"error": "invalid list"}, 400)
                    write_json(WATCHLIST_FILE, wl)
                    return self.send_json({"ok": True})
                return self.send_json(read_json(WATCHLIST_FILE, DEFAULT_WATCHLIST))
            if u.path == "/api/drawings":
                # Each symbol has a revision number: a stale tab (or drawings that failed to load)
                # cannot overwrite a newer save — it gets 409 and loads the latest version.
                key = sym_key(arg("symbol"))
                if method == "POST":
                    body = self.read_body()
                    if not isinstance(body, dict) or not isinstance(body.get("items"), list):
                        return self.send_json({"error": "This page is out of date — reload it (Ctrl+F5)."}, 409)
                    items = body["items"]
                    with _file_lock:
                        data = read_json(DRAWINGS_FILE, {})
                        revs = data.setdefault(REV_KEY, {})
                        cur = int(revs.get(key, 0))
                        if int(body.get("rev", -1)) != cur:
                            return self.send_json({"error": "The drawings were changed in another tab; the latest version was loaded.",
                                                   "items": data.get(key, []), "rev": cur}, 409)
                        if items:
                            data[key] = items
                        else:
                            data.pop(key, None)
                        revs[key] = cur + 1
                        write_json(DRAWINGS_FILE, data)
                    return self.send_json({"ok": True, "count": len(items), "rev": cur + 1})
                data = read_json(DRAWINGS_FILE, {})
                if not key:
                    return self.send_json({k: v for k, v in data.items() if k != REV_KEY})
                return self.send_json({"items": data.get(key, []), "rev": int(data.get(REV_KEY, {}).get(key, 0))})
            if u.path == "/api/csv" and method == "POST":
                return self.send_json(save_csv(arg("symbol"), self.read_raw(20 * 1024 * 1024)))
            if u.path == "/api/config":
                if method == "POST":
                    body = self.read_body() or {}
                    with _file_lock:
                        cfg = read_json(CONFIG_FILE, {})
                        if "evds_key" in body:
                            cfg["evds_key"] = str(body["evds_key"] or "").strip()
                        if isinstance(body.get("evds_series"), dict):
                            cur = load_config()["evds_series"]
                            for alias, d in body["evds_series"].items():
                                if isinstance(d, dict):
                                    cur[alias.upper()] = {**cur.get(alias.upper(), {}), **{
                                        k: d[k] for k in ("code", "mult", "name") if k in d}}
                            cfg["evds_series"] = cur
                        write_json(CONFIG_FILE, cfg)
                    with _cache_lock:
                        _cache.clear()  # code/multiplier/key changed: forget cached data
                cfg = load_config()
                key = cfg["evds_key"]
                return self.send_json({"evds_key_set": bool(key), "evds_key_hint": ("…" + key[-4:]) if key else "",
                                       "evds_series": cfg["evds_series"]})
            if u.path == "/api/evds/test":
                return self.send_json(evds_test())
            if u.path == "/api/evds/find":
                return self.send_json(evds_find(sym_key(arg("seed"))))
            return self.send_json({"error": "bilinmeyen adres"}, 404)
        except SymbolError as e:
            return self.send_json({"error": str(e)}, 404)
        except ConnectionError:
            self.close_connection = True  # the browser closed the connection
        except Exception as e:
            traceback.print_exc()
            return self.send_json({"error": f"Server error: {e}"}, 502)


class QuietServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # no traceback for connections the browser aborted (WinError 10053/10054)
        if isinstance(sys.exc_info()[1], ConnectionError):
            return
        super().handle_error(request, client_address)


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass
    os.makedirs(CSV_DIR, exist_ok=True)
    if os.path.exists(DRAWINGS_FILE):  # back up the drawings on every start
        shutil.copyfile(DRAWINGS_FILE, os.path.join(DATA_DIR, "drawings.backup.json"))
    url = f"http://{HOST}:{PORT}/"
    try:
        srv = QuietServer((HOST, PORT), Handler)
    except OSError:
        print(f"Port {PORT} is in use — Guraydingview may already be running: {url}")
        if "--open" in sys.argv:
            webbrowser.open(url)
        return
    print(f"Guraydingview is running: {url}   (close this window or press Ctrl+C to stop)")
    if "--open" in sys.argv:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
