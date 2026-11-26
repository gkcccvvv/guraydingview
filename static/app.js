// Guraydingview — main application
import { DrawingEngine, FILLABLE, TEXTABLE, alpha } from './drawings.js';

const LC = window.LightweightCharts;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const enc = encodeURIComponent;
const FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
const TZ = 3 * 3600; // Istanbul, UTC+3
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const C = { bg: '#0f0f0f', grid: 'rgba(242,242,242,0.06)', text: '#b2b5be', up: '#089981', down: '#f23645', line: '#2962ff', border: '#2e2e2e' };
// TradingView-style palette: grays on top, then 10 hues in 6 shades
const PALETTE_ROWS = [
  ['#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722', '#000000'],
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
  ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#ace5dc', '#b2ebf2', '#bbd9fb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
  ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#70ccbd', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1'],
  ['#f7525f', '#ffb74d', '#fff176', '#81c784', '#42bda8', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292'],
  ['#b22833', '#f57c00', '#fbc02d', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b'],
  ['#801922', '#e65100', '#f57f17', '#1b5e20', '#00332a', '#006064', '#0c3299', '#311b92', '#4a148c', '#880e4f'],
];

const INTERVALS = [
  { id: '15m', label: '15m', intraday: true }, { id: '1h', label: '1h', intraday: true },
  { id: '4h', label: '4h', intraday: true }, { id: '1d', label: 'D' }, { id: '1w', label: 'W' }, { id: '1M', label: 'M' },
];
const IV_NAME = { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1D', '1w': '1W', '1M': '1M' };
const RANGES = [['1D', 1], ['5D', 5], ['1M', 30], ['3M', 91], ['6M', 182], ['YTD', 'ytd'], ['1Y', 365], ['5Y', 1826], ['All', 'all']];

const ICONS = {
  cursor: '<path d="M14 4v8M14 16v8M4 14h8M16 14h8"/>',
  trend: '<path d="M8.4 19.6 19.6 8.4"/><circle cx="7" cy="21" r="2"/><circle cx="21" cy="7" r="2"/>',
  ray: '<path d="M8.4 19.6 13.6 14.4M16.4 11.6 25 3"/><circle cx="7" cy="21" r="2"/><circle cx="15" cy="13" r="2"/>',
  extended: '<path d="M3 25 8.6 19.4M11.4 16.6 16.6 11.4M19.4 8.6 25 3"/><circle cx="10" cy="18" r="2"/><circle cx="18" cy="10" r="2"/>',
  hline: '<path d="M3 14h8.5M16.5 14H25"/><circle cx="14" cy="14" r="2.5"/>',
  hray: '<path d="M9.5 14H25"/><circle cx="7" cy="14" r="2.5"/>',
  vline: '<path d="M14 3v8.5M14 16.5V25"/><circle cx="14" cy="14" r="2.5"/>',
  channel: '<path d="M4 17 15.6 5.4M12.4 22.6 24 11"/><circle cx="17" cy="4" r="1.8"/><circle cx="11" cy="24" r="1.8"/>',
  rect: '<path d="M8 6h12M8 22h12M6 8v12M22 8v12"/><circle cx="6" cy="6" r="1.8"/><circle cx="22" cy="6" r="1.8"/><circle cx="6" cy="22" r="1.8"/><circle cx="22" cy="22" r="1.8"/>',
  fib: '<path d="M4 6h20M4 11h20M4 16h20M4 21h20"/><path d="M5 21 23 6" stroke-dasharray="2 2"/>',
  text: '<path d="M8 7h12M14 7v15M11 22h6"/>',
  measure: '<path d="M4.5 18.5 18.5 4.5l5 5-14 14z"/><path d="M8 15l2 2M10.5 12.5l3 3M13 10l2 2M15.5 7.5l3 3"/>',
  magnet: '<path d="M8 5v9a6 6 0 0 0 12 0V5h-4v9a2 2 0 0 1-4 0V5z"/><path d="M8 9h4M16 9h4"/>',
  stay: '<path d="M7 21l1-4L19 6l3 3-11 11z"/><path d="M17 8l3 3"/><path d="M5 24h18" stroke-dasharray="2 2"/>',
  hide: '<path d="M3 14s4-7 11-7 11 7 11 7-4 7-11 7S3 14 3 14z"/><circle cx="14" cy="14" r="3"/>',
  hidden: '<path d="M3 14s4-7 11-7 11 7 11 7-4 7-11 7S3 14 3 14z"/><circle cx="14" cy="14" r="3"/><path d="M5 23 23 5"/>',
  trash: '<path d="M6 8h16M11 8V5.5h6V8M8 8l1 14h10l1-14M12 12v7M16 12v7"/>',
  candles: '<path d="M9 4v4M9 20v4M19 6v4M19 18v4"/><rect x="7" y="8" width="4" height="12"/><rect x="17" y="10" width="4" height="8"/>',
  bars: '<path d="M9 5v18M6 9h3M9 19h3M19 7v15M16 18h3M19 10h3"/>',
  line: '<path d="M3 20l6-7 5 4 10-11"/>',
  extL: '<path d="M10 14h14M4 14l4-3M4 14l4 3"/><circle cx="12" cy="14" r="1.5"/>',
  extR: '<path d="M4 14h14M24 14l-4-3M24 14l-4 3"/><circle cx="16" cy="14" r="1.5"/>',
  clone: '<rect x="9" y="9" width="12" height="12" rx="1"/><path d="M6 17V7a1 1 0 0 1 1-1h10"/>',
  edit: '<path d="M6 21l1-4L18 6l3 3-11 11z"/>',
  rainbow: '<path d="M4 18a10 10 0 0 1 20 0" stroke="#f23645"/><path d="M7 18a7 7 0 0 1 14 0" stroke="#ff9800"/><path d="M10 18a4 4 0 0 1 8 0" stroke="#089981"/>',
  ellipse: '<ellipse cx="14" cy="14" rx="10" ry="7"/><circle cx="4" cy="14" r="1.6"/><circle cx="24" cy="14" r="1.6"/>',
  daterange: '<path d="M5 6v16M23 6v16M7 14h14M18 11l3 3-3 3"/>',
  lock: '<rect x="8" y="13" width="12" height="9" rx="1"/><path d="M10.5 13v-3a3.5 3.5 0 0 1 7 0v3"/>',
  unlock: '<rect x="8" y="13" width="12" height="9" rx="1"/><path d="M10.5 13v-3a3.5 3.5 0 0 1 6.8-1.2"/>',
  gear: '<circle cx="14" cy="14" r="3"/><circle cx="14" cy="14" r="7"/><path d="M14 4v3M14 21v3M4 14h3M21 14h3M6.9 6.9l2.1 2.1M19 19l2.1 2.1M6.9 21.1 9 19M19 9l2.1-2.1"/>',
  textT: '<path d="M8 7h12M14 7v14"/>',
  fill: '<path d="M7 13 13 7l7 7-6 6z"/><path d="M22 17c0 1.5-1 2.5-1.5 2.5S19 18.5 19 17s1.5-3 1.5-3 1.5 1.5 1.5 3z"/>',
};
const svg = (name, size = 28) => `<svg viewBox="0 0 28 28" width="${size}" height="${size}">${ICONS[name]}</svg>`;

const TOOLBAR = [
  ['cursor', 'Cursor (Esc)'], '|',
  ['trend', 'Trend line (Alt+T)'], ['ray', 'Ray'], ['extended', 'Extended line'],
  ['hline', 'Horizontal line (Alt+H)'], ['hray', 'Horizontal ray (Alt+J)'], ['vline', 'Vertical line (Alt+V)'],
  ['channel', 'Parallel channel (Alt+C)'], ['rect', 'Rectangle (Alt+R)'], ['ellipse', 'Ellipse / circle (Alt+E)'],
  ['fib', 'Fibonacci retracement (Alt+F)'], ['daterange', 'Date range'],
  ['text', 'Text'], ['measure', 'Measure (Shift + drag)'], '|',
  ['magnet', 'Magnet: snap points to the bar O/H/L/C'], ['stay', 'Stay in drawing mode'],
  ['hide', 'Hide / show drawings'], ['trash', 'Remove all drawings on this symbol'],
];

// ------------------------------------------------------------------ helpers
const store = {
  get(k, d) { try { const v = localStorage.getItem('gm.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('gm.' + k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};

// identifies this tab in the server's live updates, so it can ignore the echo of its own saves
const clientId = Math.random().toString(36).slice(2, 10);

async function api(path, opts = {}) {
  // custom header on POSTs: the server uses it to reject requests coming from other websites
  if (opts.method && opts.method !== 'GET') opts.headers = { 'X-Guraydingview': '1', 'X-Client-Id': clientId, 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const r = await fetch(path, opts);
  let j = null;
  try { j = await r.json(); } catch (_) { /* empty body */ }
  if (!r.ok) {
    const err = new Error((j && j.error) || `HTTP ${r.status}`);
    err.status = r.status;
    err.data = j;
    throw err;
  }
  return j;
}
const postJSON = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

const symKey = (s) => String(s || '').trim().toUpperCase();
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function decimalsFor(v) {
  const a = Math.abs(v || 0);
  if (a >= 100) return 2;
  if (a >= 10) return 3;
  if (a >= 1) return 4;
  if (a >= 0.1) return 5;
  if (a >= 0.001) return 6;
  return 8;
}
function nfmt(v, d) { return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtBig(v, dp) {
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(dp) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(dp) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(dp) + 'M';
  return null;
}
function fmtNum(v, dec, bigDp = 2) {
  if (v == null || !isFinite(v)) return '—';
  return (Math.abs(v) >= 1e6 ? fmtBig(v, bigDp) : null) ?? nfmt(v, dec);
}
const fmtPrice = (v) => fmtNum(v, state.dec, 3);
const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');

const isIntraday = () => !!INTERVALS.find((i) => i.id === state.interval)?.intraday;
function dparts(t) {
  const d = new Date((t + (isIntraday() ? TZ : 0)) * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(), wd: d.getUTCDay() };
}
function fmtTime(t) {
  const p = dparts(t);
  const s = `${DAYS[p.wd]} ${p.d} ${MONTHS[p.m]} '${String(p.y).slice(2)}`;
  return isIntraday() ? `${s}  ${pad(p.H)}:${pad(p.M)}` : s;
}
function tickFmt(t, type) {
  const p = dparts(t);
  if (type === 0) return String(p.y);
  if (type === 1) return MONTHS[p.m];
  if (type === 2) return String(p.d);
  return `${pad(p.H)}:${pad(p.M)}`;
}

function iconFor(sym) {
  const s = symKey(sym);
  const colors = ['#2962ff', '#e91e63', '#089981', '#ff9800', '#9c27b0', '#00bcd4', '#f23645', '#4caf50', '#795548', '#607d8b'];
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  let bg = colors[h % colors.length];
  if (s.includes('/')) bg = '#363a45';
  else if (s.startsWith('BTC')) bg = '#f7931a';
  else if (s === 'GOLD') bg = '#c9a227';
  else if (s === 'SILVER') bg = '#8a8f98';
  else if (/TRY|^XU|^TR|\.IS$|^BIST:/.test(s)) bg = '#e30a17';
  else if (/^(WALCL|USM2|TCU|M2V|UNRATE|SHILLER|FRED:)/.test(s)) bg = '#3c3b6e';
  else if (/^(EVDS|TCMB):/.test(s)) bg = '#e30a17';
  const letter = (s.replace(/^[A-Z]+:/, '').match(/[A-Z0-9]/) || ['?'])[0];
  // currency pairs: two overlapping flags, like TradingView
  const fx = s.split('/')[0].match(/^([A-Z]{3})([A-Z]{3})$/);
  if (fx && FX_FLAGS[fx[1]] && FX_FLAGS[fx[2]]) {
    return `<span class="ico ico-fx" style="background:${bg}">${esc(letter)}`
      + `<img src="/api/logo?flag=${FX_FLAGS[fx[1]]}" alt="" loading="lazy" onerror="this.remove()">`
      + `<img src="/api/logo?flag=${FX_FLAGS[fx[2]]}" alt="" loading="lazy" onerror="this.remove()"></span>`;
  }
  // no logo (404): the image removes itself and the letter underneath shows
  return `<span class="ico" style="background:${bg}">${esc(letter)}`
    + `<img src="/api/logo?symbol=${enc(s)}" alt="" loading="lazy" onerror="this.remove()" onload="logoBg(this)"></span>`;
}
// light logos on a transparent background (e.g. white text) would vanish on a light circle: use a dark one
window.logoBg = (img) => {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data;
    let n = 0, lum = 0, clear = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) { clear++; continue; }
      n++;
      lum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    }
    if (n && clear > 25 && lum / n > 0.8) img.style.background = '#2a2a2a';
  } catch (_) { /* ignore */ }
};
const FX_FLAGS = {
  USD: 'us', EUR: 'eu', TRY: 'tr', GBP: 'gb', JPY: 'jp', CHF: 'ch', CAD: 'ca', AUD: 'au', NZD: 'nz', CNY: 'cn',
  CNH: 'cn', RUB: 'ru', SEK: 'se', NOK: 'no', DKK: 'dk', PLN: 'pl', ZAR: 'za', MXN: 'mx', BRL: 'br', INR: 'in',
  KRW: 'kr', SGD: 'sg', HKD: 'hk', SAR: 'sa', AED: 'ae', HUF: 'hu', CZK: 'cz',
};

// ------------------------------------------------------------------ durum
const urlParams = new URLSearchParams(location.search); // open directly with ?symbol=USMNO&interval=1w
const state = {
  symbol: (urlParams.get('symbol') || store.get('symbol', 'BTCUSD')).toUpperCase(),
  interval: ['15m', '1h', '4h', '1d', '1w', '1M'].includes(urlParams.get('interval')) ? urlParams.get('interval') : store.get('interval', '1d'),
  chartType: store.get('chartType', 'candles'),
  scaleMode: store.get('scaleMode', 0),
  ext: store.get('extHours', true), // pre-market / after hours (extended session)
  rainbow: urlParams.get('rainbow') === '1' || store.get('rainbow', true), // Bitcoin rainbow bands (BTC charts)
  meta: null,
  bars: [],
  dec: 2,
  big: false,
  quotes: {},
  crosshair: null,
};

// ------------------------------------------------------------------ grafik
// chart style (Settings → Chart style), kept in the browser
const CS_DEFAULT = {
  bg: C.bg, text: C.text, grid: true, gridColor: C.grid,
  up: C.up, down: C.down, border: false, wick: true,
  lineColor: C.line, lineWidth: 2, priceLine: true, priceLineColor: '', priceLineStyle: 2,
  // pre-market / after hours (orange, like TradingView)
  extPreColor: '#ff9800', extPostColor: '#ff9800', extLine: true, extLineStyle: 2,
  preBg: 'rgba(255,152,0,0.07)', postBg: 'rgba(41,98,255,0.09)',
};
const CS = { ...CS_DEFAULT, ...store.get('chartStyle', {}) };
const chartLayout = () => ({
  layout: { background: { type: 'solid', color: CS.bg }, textColor: CS.text, fontSize: 12, fontFamily: FONT },
  grid: { vertLines: { visible: CS.grid, color: CS.gridColor }, horzLines: { visible: CS.grid, color: CS.gridColor } },
});

const chartEl = $('#chart');
const chart = LC.createChart(chartEl, {
  autoSize: true,
  ...chartLayout(),
  crosshair: {
    mode: LC.CrosshairMode.Normal,
    vertLine: { color: '#9598a1', width: 1, style: LC.LineStyle.Dashed, labelBackgroundColor: '#363a45' },
    horzLine: { color: '#9598a1', width: 1, style: LC.LineStyle.Dashed, labelBackgroundColor: '#363a45' },
  },
  rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.1, bottom: 0.08 }, mode: state.scaleMode },
  timeScale: { borderColor: C.border, rightOffset: 12, barSpacing: 7, minBarSpacing: 0.2, tickMarkFormatter: tickFmt },
  localization: { locale: 'en-US', timeFormatter: fmtTime, priceFormatter: (p) => fmtPrice(p) },
  kineticScroll: { mouse: false, touch: true },
});
let series = null;

// Empty future slots after the last bar: they put future dates on the time axis and let you scroll and draw into
// the future. They sit on a hidden series of their own, so live updates of the price series keep working.
const futureSeries = chart.addLineSeries({ visible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
const DAY = 86400;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;
const isWeekend = (t) => [0, 6].includes(new Date(t * 1000).getUTCDay());

function futureTimes(bars) {
  const n = bars.length;
  if (n < 2) return [];
  const steps = [];
  for (let i = Math.max(1, n - 80); i < n; i++) steps.push(bars[i].time - bars[i - 1].time);
  steps.sort((a, b) => a - b);
  const step = steps[steps.length >> 1];
  const last = bars[n - 1].time;
  const out = [];
  if (step >= 25 * DAY) { // monthly / quarterly data: calendar months, 20 years
    const k = Math.max(1, Math.round(step / (30.44 * DAY)));
    const d = new Date(last * 1000);
    for (let i = 1; i <= Math.ceil(240 / k); i++) out.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i * k, Math.min(d.getUTCDate(), 28)) / 1000);
  } else if (step >= 5 * DAY) { // weekly: 10 years
    for (let i = 1; i <= 520; i++) out.push(last + i * step);
  } else if (step >= 0.9 * DAY) { // daily: 5 years, weekdays only unless the market trades at weekends (crypto)
    const weekends = bars.slice(-60).some((b) => isWeekend(b.time));
    for (let t = last + DAY; t <= last + 5 * YEAR; t += DAY) if (weekends || !isWeekend(t)) out.push(t);
  } else { // intraday: only at the times of the week the market traded in the last 8 weeks (sessions, weekends)
    const slot = (t) => ((t % WEEK) + WEEK) % WEEK;
    const open = new Set(bars.filter((b) => b.time > last - 8 * WEEK).map((b) => slot(b.time)));
    const horizon = last + (step >= 4 * 3600 ? 3 : step >= 3600 ? 2 : 1) * YEAR;
    for (let t = last + step; t <= horizon && out.length < 20000; t += step) if (open.has(slot(t))) out.push(t);
  }
  return out;
}

function setFuture() {
  const fut = futureTimes(state.bars);
  futureSeries.setData(fut.map((t) => ({ time: t })));
  engine.setFuture(fut);
}

function priceFormat() {
  return { type: 'custom', minMove: state.big ? 1 : Math.pow(10, -state.dec), formatter: (p) => fmtPrice(p) };
}

function seriesStyle(type) {
  const common = {
    priceLineVisible: CS.priceLine, priceLineStyle: CS.priceLineStyle,
    ...(CS.priceLineColor ? { priceLineColor: CS.priceLineColor } : {}),
  };
  if (type === 'line') return { ...common, color: CS.lineColor, lineWidth: CS.lineWidth, crosshairMarkerRadius: 4 };
  if (type === 'bars') return { ...common, upColor: CS.up, downColor: CS.down, thinBars: false };
  return {
    ...common, upColor: CS.up, downColor: CS.down, borderVisible: CS.border, borderUpColor: CS.up, borderDownColor: CS.down,
    wickVisible: CS.wick, wickUpColor: CS.up, wickDownColor: CS.down,
  };
}

function createSeries(type) {
  const opts = { ...seriesStyle(type), priceFormat: priceFormat() };
  if (type === 'line') return chart.addLineSeries(opts);
  if (type === 'bars') return chart.addBarSeries(opts);
  return chart.addCandlestickSeries(opts);
}

function applyChartStyle() {
  store.set('chartStyle', CS);
  chart.applyOptions(chartLayout());
  if (series) series.applyOptions(seriesStyle(effType()));
  shade.set(sessionFlags()); // session background colors
  updateExtLine();
  renderWatchlist();
  renderDetail();
}

const effType = () => (state.meta?.kind === 'line' ? 'line' : state.chartType);
const toSeriesData = (bars, type) => (type === 'line' ? bars.map((b) => ({ time: b.time, value: b.close })) : bars);

// ---- pre-market / after hours: shade those bars' background like TradingView
const extColor = (session) => (session === 'pre' ? CS.extPreColor : CS.extPostColor);
class SessionShade {
  constructor() {
    this._req = null;
    this.flags = [];
    this.view = { zOrder: () => 'bottom', renderer: () => ({ draw: (t) => this.draw(t) }) };
  }
  attached({ requestUpdate }) { this._req = requestUpdate; }
  detached() { this._req = null; }
  paneViews() { return this.flags.length ? [this.view] : []; }
  set(flags) { this.flags = flags; if (this._req) this._req(); }
  draw(target) {
    const ts = chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r) return;
    const from = Math.max(0, Math.floor(r.from) - 1), to = Math.min(this.flags.length - 1, Math.ceil(r.to) + 1);
    const a = ts.logicalToCoordinate(from), b = ts.logicalToCoordinate(from + 1);
    if (a == null || b == null) return;
    const sp = b - a;
    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hr }) => {
      for (let i = from; i <= to; i++) {
        const f = this.flags[i];
        if (!f) continue;
        const x = ts.logicalToCoordinate(i);
        if (x == null) continue;
        ctx.fillStyle = f === 'pre' ? CS.preBg : CS.postBg;
        ctx.fillRect(Math.floor((x - sp / 2) * hr), 0, Math.ceil(sp * hr) + 1, bitmapSize.height);
      }
    });
  }
}
const shade = new SessionShade();

// ---- Bitcoin rainbow chart: colored log-regression bands behind the price (parameters from /api/rainbow)
const isBtc = (s) => /^(BINANCE:)?BTCUSDT?$|^BTC-USD$/.test(symKey(s));
class Rainbow {
  constructor() {
    this._req = null;
    this.p = null;
    this.view = { zOrder: () => 'bottom', renderer: () => ({ draw: (t) => this.draw(t) }) };
  }
  attached({ requestUpdate }) { this._req = requestUpdate; }
  detached() { this._req = null; }
  paneViews() { return this.p ? [this.view] : []; }
  set(p) { this.p = p; if (this._req) this._req(); }
  draw(target) {
    const p = this.p, ts = chart.timeScale();
    if (!p || !series || !state.bars.length) return;
    const W = ts.width(), nb = p.names.length;
    // bottom and top of the rainbow (log10 price) are straight lines in ln(days since genesis); they narrow over time
    const xs = [], lo = [], hi = [];
    for (let x = 0; x <= W + 4; x += 4) {
      const l = ts.coordinateToLogical(x);
      const t = l == null ? null : engine.l2t(l);
      if (t == null || t <= p.genesis + DAY) continue;
      const lnd = Math.log((t - p.genesis) / DAY);
      const bottom = p.lower[0] * lnd + p.lower[1];
      xs.push(x);
      lo.push(bottom);
      hi.push(Math.max(p.upper[0] * lnd + p.upper[1], bottom + 0.3)); // never collapse, even far in the future
    }
    if (xs.length < 2) return;
    const yAt = (i, k) => series.priceToCoordinate(10 ** (lo[i] + ((hi[i] - lo[i]) * k) / nb));
    target.useBitmapCoordinateSpace(({ context: ctx, mediaSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      let unnamed = 0; // bands too thin for their name: listed in a small legend instead
      for (let k = 0; k < nb; k++) {
        const up = [], dn = [];
        xs.forEach((x, i) => {
          const a = yAt(i, k + 1), b = yAt(i, k);
          if (a != null && b != null) { up.push([x, a]); dn.push([x, b]); }
        });
        if (up.length < 2) continue;
        ctx.beginPath();
        up.forEach(([x, y], i) => (i ? ctx.lineTo(x * hr, y * vr) : ctx.moveTo(x * hr, y * vr)));
        for (let i = dn.length - 1; i >= 0; i--) ctx.lineTo(dn[i][0] * hr, dn[i][1] * vr);
        ctx.closePath();
        ctx.fillStyle = alpha(p.colors[k], 0.3);
        ctx.fill();
        // band name at the right edge, where the band is tall enough
        const [xr, yTop] = up[up.length - 1], yBot = dn[dn.length - 1][1];
        if (yBot - yTop >= 14 && yTop < mediaSize.height && yBot > 0) {
          ctx.font = `${Math.round(11 * vr)}px ${FONT}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = alpha(p.colors[k], 0.95);
          ctx.fillText(p.names[k], (xr - 8) * hr, ((yTop + yBot) / 2) * vr);
        } else unnamed++;
      }
      if (unnamed) { // legend, top band first, under the symbol legend
        const x0 = 10, y0 = 56, row = 15;
        ctx.fillStyle = 'rgba(19,23,34,0.78)';
        ctx.fillRect(x0 * hr, y0 * vr, 172 * hr, (nb * row + 8) * vr);
        ctx.font = `${Math.round(11 * vr)}px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (let k = nb - 1, r = 0; k >= 0; k--, r++) {
          const y = y0 + 4 + r * row + row / 2;
          ctx.fillStyle = alpha(p.colors[k], 0.85);
          ctx.fillRect((x0 + 6) * hr, (y - 5) * vr, 10 * hr, 10 * vr);
          ctx.fillStyle = '#d1d4dc';
          ctx.fillText(p.names[k], (x0 + 22) * hr, y * vr);
        }
      }
    });
  }
}
const rainbow = new Rainbow();
let rainbowParams = null;
async function updateRainbow() {
  const on = state.rainbow && isBtc(state.symbol);
  $('#rainbowBtn').hidden = !isBtc(state.symbol);
  $('#rainbowBtn').classList.toggle('on', on);
  if (on && !rainbowParams) {
    try { rainbowParams = await api('/api/rainbow'); } catch (_) { rainbowParams = null; }
    if (rainbowParams) $('#rainbowBtn').title = `Bitcoin rainbow chart: ${rainbowParams.fit}`;
  }
  rainbow.set(on ? rainbowParams : null);
}
function sessionFlags() {
  const s = state.meta?.session;
  if (!s || !state.ext || !isIntraday()) return [];
  return state.bars.map((b) => {
    const local = (((b.time + s.off) % 86400) + 86400) % 86400;
    return local < s.regStart ? 'pre' : local >= s.regEnd ? 'post' : null;
  });
}

// on daily and higher intervals, show the pre-market / after-hours price as a horizontal line
let extLine = null;
function updateExtLine() {
  const q = state.quotes[state.symbol];
  const ext = state.ext && CS.extLine && !isIntraday() && series && q?.ext ? q.ext : null;
  if (!ext) { if (extLine && series) series.removePriceLine(extLine); extLine = null; return; }
  const opts = {
    price: ext.price, color: extColor(ext.session), lineWidth: 1, lineStyle: CS.extLineStyle,
    axisLabelVisible: true, title: ext.session === 'pre' ? 'Pre' : 'Post',
  };
  if (extLine) extLine.applyOptions(opts); else extLine = series.createPriceLine(opts);
}

function rebuildSeries() {
  engine.setSeries(null);
  if (series) {
    for (const prim of [shade, rainbow]) try { series.detachPrimitive(prim); } catch (_) { /* ignore */ }
    chart.removeSeries(series);
    series = null;
  }
  extLine = null;
  futureSeries.setData([]);
  if (!state.bars.length) return;
  const type = effType();
  series = createSeries(type);
  series.setData(toSeriesData(state.bars, type));
  series.attachPrimitive(rainbow);
  series.attachPrimitive(shade);
  shade.set(sessionFlags());
  updateRainbow();
  engine.setSeries(series);
  engine.setData(state.bars);
  setFuture();
  updateExtLine();
}

// ------------------------------------------------------------------ drawing engine
const engine = new DrawingEngine({
  chart,
  el: chartEl,
  formatTime: fmtTime,
  formatPrice: (p) => fmtPrice(p),
  onChange: () => scheduleSave(),
  onSelect: (d) => renderDrawBar(d),
  onTool: () => renderTools(),
  onEdit: (d) => openDrawingSettings(d.type === 'text' ? 'text' : 'style'),
  askText: (title, v) => askText(title, v),
});

// drawings are saved on the server (data/drawings.json). Each symbol has a revision number:
// a stale tab cannot overwrite a newer save — the server answers 409 and the latest version is loaded.
const drawCache = {};
const drawRev = {};
const drawFailed = {};
let saveTimer = null;
let saveSym = null;
const drawChannel = 'BroadcastChannel' in window ? new BroadcastChannel('grafik-cizimler') : null;

function setSaveState(kind, msg) {
  const el = $('#saveState');
  el.classList.toggle('err', kind === 'error');
  el.textContent = kind === 'saving' ? 'Saving…' : kind === 'saved' ? 'Saved ✓' : kind === 'error' ? `Not saved: ${msg}` : '';
  updateDrawCount();
}
function updateDrawCount() {
  const n = engine.count();
  $('#drawCount').textContent = n ? `${n} drawing${n === 1 ? '' : 's'}` : '';
}

function scheduleSave() {
  const k = symKey(state.symbol);
  updateUndo();
  if (drawFailed[k]) { setSaveState('error', 'drawings could not be loaded, so nothing is saved — reload the page'); return; }
  drawCache[k] = engine.getDrawings();
  saveSym = k;
  setSaveState('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushSave(), 400);
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const k = saveSym;
  if (!k) return;
  saveSym = null;
  try {
    const r = await postJSON(`/api/drawings?symbol=${enc(k)}`, { items: drawCache[k] || [], rev: drawRev[k] ?? 0 });
    drawRev[k] = r.rev;
    if (drawChannel) drawChannel.postMessage({ sym: k, rev: r.rev });
    if (!saveSym) setSaveState('saved');
  } catch (e) {
    if (e.status === 409 && e.data && Array.isArray(e.data.items)) {
      // changed in another tab: take the latest version and show it
      drawCache[k] = e.data.items;
      drawRev[k] = e.data.rev;
      if (symKey(state.symbol) === k) engine.load(JSON.parse(JSON.stringify(e.data.items)));
      setSaveState('error', e.message);
    } else setSaveState('error', e.message);
  }
}

// the drawings of a symbol were changed somewhere else (another tab or the Claude connector)
async function externalDrawings(sym, rev) {
  if (drawRev[sym] === rev) return;
  delete drawCache[sym];
  if (symKey(state.symbol) !== sym || saveSym || drawFailed[sym]) return;
  const list = await loadDrawings(sym);
  if (symKey(state.symbol) !== sym || saveSym) return;
  engine.applyExternal(list); // Ctrl+Z takes the change back
  updateDrawCount();
  updateUndo();
}

if (drawChannel) drawChannel.onmessage = ({ data }) => { if (data) externalDrawings(data.sym, data.rev); };

// the most recently used tab is the one that follows "show this chart" requests from Claude
function markActiveTab() { if (document.visibilityState === 'visible') store.set('activeTab', clientId); }
window.addEventListener('focus', markActiveTab);
document.addEventListener('visibilitychange', markActiveTab);
window.addEventListener('beforeunload', () => { if (store.get('activeTab', null) === clientId) store.set('activeTab', null); });
markActiveTab();

async function showChart(sym, iv, range = '', scale = '') {
  sym = symKey(sym);
  let changed = false;
  if (['15m', '1h', '4h', '1d', '1w', '1M'].includes(iv) && iv !== state.interval) {
    state.interval = iv;
    store.set('interval', iv);
    renderIntervals();
    changed = true;
  }
  if (sym && sym !== symKey(state.symbol)) {
    state.symbol = sym;
    store.set('symbol', sym);
    engine.setTool('cursor');
    changed = true;
  }
  if (changed) { renderWatchlist(); await loadChart(); }
  showRangeAndScale(range, scale);
}

async function showRangeAndScale(range, scale) {
  if (!range && !scale) return;
  // after restoreView has finished (it re-freezes a saved manual price range two frames after loading)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (scale) setScaleByName(scale);
  if (range) {
    chart.priceScale('right').applyOptions({ autoScale: true }); // fit the prices of the whole range
    applyRange(range);
    renderScaleBtns();
  }
}

// Live updates from the server (/api/events). Only one tab per browser keeps the connection open (browsers allow
// just 6 connections to a site, shared by all tabs) and passes the events on to the other tabs.
const evRelay = 'BroadcastChannel' in window ? new BroadcastChannel('gv-events') : null;
if (evRelay) evRelay.onmessage = ({ data }) => handleServerEvent(data);
function listenToServer() {
  return new Promise(() => { // never resolves: this tab keeps the lock (and the connection) until it closes
    new EventSource('/api/events').onmessage = ({ data }) => {
      let ev;
      try { ev = JSON.parse(data); } catch (_) { return; }
      handleServerEvent(ev);
      if (evRelay) evRelay.postMessage(ev);
    };
  });
}
if ('EventSource' in window) {
  if (navigator.locks && evRelay) navigator.locks.request('guraydingview-events', listenToServer);
  else listenToServer();
}

function handleServerEvent(ev) {
  if (!ev) return;
  if (ev.type === 'hello') { // (re)connected: catch up on changes made while disconnected
    for (const [k, rev] of Object.entries(ev.revs || {})) if (k in drawRev && drawRev[k] !== rev) externalDrawings(k, rev);
  } else if (ev.type === 'drawings' && ev.src !== clientId) externalDrawings(ev.sym, ev.rev);
  else if (ev.type === 'watchlist' && ev.src !== clientId) loadWatchlist();
  else if (ev.type === 'show') {
    const active = store.get('activeTab', null);
    if (!active || active === clientId) showChart(ev.symbol, ev.interval, ev.range, ev.scale);
  }
}

window.addEventListener('beforeunload', () => {
  if (saveSym) {
    fetch(`/api/drawings?symbol=${enc(saveSym)}`, {
      method: 'POST', keepalive: true, headers: { 'X-Guraydingview': '1', 'X-Client-Id': clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: drawCache[saveSym] || [], rev: drawRev[saveSym] ?? 0 }),
    });
  }
});

async function loadDrawings(sym) {
  const k = symKey(sym);
  if (!drawCache[k]) {
    try {
      const r = await api(`/api/drawings?symbol=${enc(k)}`);
      drawCache[k] = Array.isArray(r.items) ? r.items : [];
      drawRev[k] = r.rev ?? 0;
      delete drawFailed[k];
    } catch (_) {
      drawFailed[k] = true; // never save an empty list over the drawings on the server
      return [];
    }
  }
  return JSON.parse(JSON.stringify(drawCache[k]));
}

// ------------------------------------------------------------------ data loading
let loadSeq = 0;

// ---- remember each chart's view (zoom, scroll and manual price scale) per symbol + interval
const views = store.get('views', {});
let shownKey = null; // the symbol|interval currently on screen
let viewTimer = null;
let restoring = false;
const viewKey = () => `${symKey(state.symbol)}|${state.interval}`;

function saveView() {
  clearTimeout(viewTimer);
  if (!shownKey || !series || !state.bars.length || restoring) return;
  const r = chart.timeScale().getVisibleLogicalRange();
  if (!r) return;
  const v = { from: engine.l2t(r.from), to: engine.l2t(r.to), at: Date.now() };
  if (!chart.priceScale('right').options().autoScale) {
    // price at the inner edges (inside the scale margins) so restoring lands on exactly the same range
    const h = chartEl.clientHeight - chart.timeScale().height();
    const hi = series.coordinateToPrice(h * 0.1), lo = series.coordinateToPrice(h * 0.92);
    if (hi != null && lo != null && isFinite(hi) && isFinite(lo)) v.price = [lo, hi];
  }
  views[shownKey] = v;
  const keys = Object.keys(views);
  if (keys.length > 400) keys.sort((a, b) => views[a].at - views[b].at).slice(0, keys.length - 400).forEach((k) => delete views[k]);
  store.set('views', views);
}
const scheduleViewSave = () => { clearTimeout(viewTimer); viewTimer = setTimeout(saveView, 400); };chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleViewSave);
chartEl.addEventListener('wheel', scheduleViewSave, { passive: true });
chartEl.addEventListener('mouseup', scheduleViewSave);
window.addEventListener('beforeunload', saveView);

function restoreView(key) {
  const v = views[key];
  if (!v || !series) return false;
  restoring = true;
  chart.timeScale().setVisibleLogicalRange({ from: engine.t2l(v.from), to: engine.t2l(v.to) });
  const ps = chart.priceScale('right');
  ps.applyOptions({ autoScale: true });
  if (v.price) {
    // no direct "set price range" in this chart version: autoscale to the saved range once, then freeze it
    const [lo, hi] = v.price;
    series.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: lo, maxValue: hi } }) });
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (v.price && series) {
      ps.applyOptions({ autoScale: false });
      series.applyOptions({ autoscaleInfoProvider: undefined });
    }
    restoring = false;
    renderScaleBtns();
  }));
  return true;
}

function showOverlay(msg, isErr = false) {
  const o = $('#overlay');
  o.hidden = !msg;
  o.classList.toggle('err', isErr);
  o.innerHTML = msg ? (isErr ? `<div class="box">${esc(msg)}</div>` : esc(msg)) : '';
}

async function loadChart({ keepView = false } = {}) {
  const seq = ++loadSeq;
  const sym = state.symbol;
  const symChanged = symKey(sym) !== engine._loadedSym;
  if (saveSym && symChanged) await flushSave();

  // on interval change keep the right-edge time and the number of visible bars
  let view = null;
  if (keepView && series && state.bars.length) {
    const r = chart.timeScale().getVisibleLogicalRange();
    if (r) view = { right: engine.l2t(r.to), width: r.to - r.from };
  }

  saveView(); // keep the view of the chart we are leaving
  showOverlay('Loading…');
  renderHeader();
  let j, drawings;
  try {
    [j, drawings] = await Promise.all([
      api(`/api/bars?symbol=${enc(sym)}&interval=${state.interval}&ext=${state.ext ? 1 : 0}`),
      symChanged ? loadDrawings(sym) : Promise.resolve(null),
    ]);
  } catch (e) {
    if (seq !== loadSeq) return;
    state.meta = null;
    state.bars = [];
    shownKey = null;
    rebuildSeries();
    engine._loadedSym = null;
    engine.load([]);
    state.missingCsv = /no data file/.test(e.message) ? symKey(sym) : null;
    showOverlay(`${sym}: ${e.message}`, true);
    document.title = `${sym} — Guraydingview`;
    renderLegend();
    renderDetail();
    return;
  }
  if (seq !== loadSeq) return;

  state.meta = j;
  state.bars = j.bars.map(([t, o, h, l, c]) => ({ time: t, open: o, high: h, low: l, close: c }));
  const last = state.bars.at(-1)?.close ?? 0;
  state.big = Math.abs(last) >= 1e6;
  state.dec = decimalsFor(last);
  chart.applyOptions({ timeScale: { timeVisible: isIntraday(), secondsVisible: false } });
  rebuildSeries();
  if (drawings) {
    engine.load(drawings);
    engine._loadedSym = symKey(sym);
    setSaveState('');
  }
  showOverlay('');

  const n = state.bars.length;
  const ts = chart.timeScale();
  if (view) {
    const r = engine.t2l(view.right);
    ts.setVisibleLogicalRange({ from: r - view.width, to: r });
  } else if (!restoreView(viewKey())) {
    // first visit: latest bars, automatic price scale (don't carry another symbol's manual range)
    chart.priceScale('right').applyOptions({ autoScale: true });
    const w = j.kind === 'line' ? Math.min(n, 400) : Math.min(n, 180);
    ts.setVisibleLogicalRange({ from: n - w, to: n - 1 + 12 });
    renderScaleBtns();
  }
  shownKey = viewKey();
  renderLegend();
  renderDetail();
  updateDrawCount();
  updateUndo();
  document.title = `${sym} ${fmtPrice(last)} — Guraydingview`;
}

async function liveUpdate() {
  if (!series || !state.meta || document.hidden) return;
  const sym = state.symbol, iv = state.interval;
  try {
    const j = await api(`/api/bars?symbol=${enc(sym)}&interval=${iv}&short=1&ext=${state.ext ? 1 : 0}`);
    if (sym !== state.symbol || iv !== state.interval || !series) return;
    const nBefore = state.bars.length;
    const lastT = state.bars.at(-1)?.time ?? -Infinity;
    const type = effType();
    for (const [t, o, h, l, c] of j.bars) {
      if (t < lastT) continue;
      const bar = { time: t, open: o, high: h, low: l, close: c };
      if (t === state.bars.at(-1)?.time) state.bars[state.bars.length - 1] = bar; else state.bars.push(bar);
      series.update(type === 'line' ? { time: t, value: c } : bar);
      engine.updateBar(bar);
    }
    if (state.bars.length !== nBefore) { shade.set(sessionFlags()); setFuture(); }
    if (!state.crosshair) renderLegend();
    document.title = `${sym} ${fmtPrice(state.bars.at(-1).close)} — Guraydingview`;
  } catch (_) { /* temporary error — retried next round */ }
}

function openSymbol(sym) {
  sym = symKey(sym);
  if (!sym) return;
  state.symbol = sym;
  store.set('symbol', sym);
  engine.setTool('cursor');
  loadChart();
  renderWatchlist();
}

function setInterval_(iv) {
  if (iv === state.interval) return;
  state.interval = iv;
  store.set('interval', iv);
  renderIntervals();
  loadChart({ keepView: true });
}

// ------------------------------------------------------------------ legend / detay
function renderHeader() {
  $('#symText').textContent = state.symbol;
  $('#lgSym').textContent = state.meta?.name && state.meta.symbol === symKey(state.symbol) ? state.meta.name : state.symbol;
  $('#lgIv').textContent = IV_NAME[state.interval] || state.interval;
  $('#lgSrc').textContent = state.meta?.source || '';
}

function renderLegend(idx = null) {
  renderHeader();
  const el = $('#lgVals');
  const bars = state.bars;
  if (!bars.length) { el.innerHTML = ''; return; }
  const i = idx != null && idx >= 0 && idx < bars.length ? idx : bars.length - 1;
  const b = bars[i], prev = bars[i - 1];
  const chg = prev ? b.close - prev.close : 0;
  const pct = prev && prev.close ? (chg / prev.close) * 100 : 0;
  const cc = chg >= 0 ? 'up' : 'down';
  const chgHtml = `<span class="chg ${cc}">${sign(chg)}${fmtPrice(Math.abs(chg))} (${sign(chg)}${Math.abs(pct).toFixed(2)}%)</span>`;
  if (state.meta?.kind === 'line') {
    el.innerHTML = `<span class="${cc}">${fmtPrice(b.close)}</span>${chgHtml}`;
  } else {
    const bc = b.close >= b.open ? 'up' : 'down';
    el.innerHTML = ['O', 'H', 'L', 'C'].map((k, n) => `<span class="k">${k}</span><span class="${bc}">${fmtPrice([b.open, b.high, b.low, b.close][n])}</span>`).join('') + chgHtml;
  }
}

function renderDetail() {
  const s = state.symbol;
  const q = state.quotes[s];
  const m = state.meta && state.meta.symbol === symKey(s) ? state.meta : null;
  const name = m?.name || q?.name || '';
  const src = [m?.exchange || q?.exchange, m?.source || q?.source].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
  let price = '';
  if (q && !q.error) {
    const dec = decimalsFor(q.last), cls = q.chg >= 0 ? 'up' : 'down';
    price = `<div class="d-price"><span class="d-last">${fmtNum(q.last, dec)}</span><span class="d-chg ${cls}">${sign(q.chg)}${fmtNum(Math.abs(q.chg), dec)} (${sign(q.chg)}${Math.abs(q.pct).toFixed(2)}%)</span></div>`;
    if (q.ext && state.ext) {
      const e = q.ext, ec = e.chg >= 0 ? 'up' : 'down';
      price += `<div class="d-ext"><span class="ext-dot" style="background:${extColor(e.session)}"></span><span style="color:${extColor(e.session)}">${e.session === 'pre' ? 'Pre-market' : 'After hours'}</span>
        <b>${fmtNum(e.price, dec)}</b><span class="${ec}">${sign(e.chg)}${fmtNum(Math.abs(e.chg), dec)} (${sign(e.chg)}${Math.abs(e.pct).toFixed(2)}%)</span></div>`;
    }
  }
  $('#detail').innerHTML = `<div class="d-top">${iconFor(s)}<span>${esc(s)}</span></div><div class="d-name">${esc(name)}${src ? ' · ' + esc(src) : ''}</div>${price}`;
}

chart.subscribeCrosshairMove((param) => {
  if (!param || !param.point || param.logical == null) {
    state.crosshair = null;
    renderLegend();
    return;
  }
  const i = Math.round(param.logical);
  state.crosshair = { logical: i, price: series ? series.coordinateToPrice(param.point.y) : null };
  renderLegend(i);
});

// ------------------------------------------------------------------ top / bottom bars
function renderIntervals() {
  $('#ivBox').innerHTML = INTERVALS.map((i) => `<button class="tb-btn${i.id === state.interval ? ' active' : ''}" data-iv="${i.id}">${i.label}</button>`).join('');
}
$('#ivBox').addEventListener('click', (e) => { const b = e.target.closest('[data-iv]'); if (b) setInterval_(b.dataset.iv); });

function renderTypes() {
  const types = [['candles', 'Candles'], ['bars', 'Bars'], ['line', 'Line']];
  $('#typeBox').innerHTML = types.map(([id, t]) => `<button class="tb-btn tb-icon${id === state.chartType ? ' active' : ''}" data-type="${id}" title="${t}">${svg(id)}</button>`).join('');
}
$('#typeBox').addEventListener('click', (e) => {
  const b = e.target.closest('[data-type]');
  if (!b) return;
  state.chartType = b.dataset.type;
  store.set('chartType', state.chartType);
  renderTypes();
  const r = chart.timeScale().getVisibleLogicalRange();
  rebuildSeries();
  if (r) chart.timeScale().setVisibleLogicalRange(r);
});

function renderRanges() {
  $('#rangeBox').innerHTML = RANGES.map(([l]) => `<button class="bb-btn" data-range="${l}">${l}</button>`).join('');
}
$('#rangeBox').addEventListener('click', (e) => {
  const b = e.target.closest('[data-range]');
  if (b) applyRange(b.dataset.range);
});

// show a date range (a RANGES label: 1D … 5Y, All)
function applyRange(label) {
  const r = RANGES.find(([l]) => l.toLowerCase() === String(label).toLowerCase());
  if (!r || !state.bars.length) return;
  const spec = r[1];
  const n = state.bars.length, lastT = state.bars[n - 1].time;
  let from;
  if (spec === 'all') from = 0;
  else if (spec === 'ytd') from = engine.t2l(Date.UTC(new Date(lastT * 1000).getUTCFullYear(), 0, 1) / 1000);
  else from = engine.t2l(lastT - spec * 86400);
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(from, -5), to: n - 1 + 6 });
}

function renderScaleBtns() {
  const mode = chart.priceScale('right').options().mode;
  const auto = chart.priceScale('right').options().autoScale;
  $('#pctBtn').classList.toggle('on', mode === 2);
  $('#logBtn').classList.toggle('on', mode === 1);
  $('#autoBtn').classList.toggle('on', !!auto);
}
function setScaleMode(m) {
  const cur = chart.priceScale('right').options().mode;
  const next = cur === m ? 0 : m;
  chart.priceScale('right').applyOptions({ mode: next });
  store.set('scaleMode', next);
  renderScaleBtns();
}
// set the price scale by name (from Claude's "show chart" or the URL): linear, log or percent
function setScaleByName(name) {
  const m = { linear: 0, log: 1, percent: 2 }[name];
  if (m === undefined) return;
  chart.priceScale('right').applyOptions({ mode: m });
  store.set('scaleMode', m);
  renderScaleBtns();
}
$('#pctBtn').onclick = () => setScaleMode(2);
$('#logBtn').onclick = () => setScaleMode(1);
$('#autoBtn').onclick = () => { chart.priceScale('right').applyOptions({ autoScale: true }); renderScaleBtns(); };
// pre-market / after hours on-off (TradingView "Extended trading hours")
$('#rainbowBtn').onclick = () => {
  state.rainbow = !state.rainbow;
  store.set('rainbow', state.rainbow);
  updateRainbow();
};
const renderExtBtn = () => $('#extBtn').classList.toggle('on', state.ext);
$('#extBtn').onclick = () => {
  state.ext = !state.ext;
  store.set('extHours', state.ext);
  renderExtBtn();
  renderWatchlist();
  renderDetail();
  updateExtLine();
  if (isIntraday()) loadChart({ keepView: true });
};
renderExtBtn();
chartEl.addEventListener('mouseup', () => setTimeout(renderScaleBtns, 0));
chartEl.addEventListener('dblclick', () => setTimeout(renderScaleBtns, 0));

function tickClock() {
  const d = new Date(Date.now() + TZ * 1000);
  $('#clock').textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} (UTC+3)`;
}

function updateUndo() {
  $('#undoBtn').disabled = !engine.undoStack.length;
  $('#redoBtn').disabled = !engine.redoStack.length;
}
$('#undoBtn').onclick = () => { engine.undo(); updateUndo(); };
$('#redoBtn').onclick = () => { engine.redo(); updateUndo(); };
$('#symBtn').onclick = () => openSearch('open');
$('#helpBtn').onclick = () => openHelp();

// ------------------------------------------------------------------ left toolbar
function renderTools() {
  $('#tools').innerHTML = TOOLBAR.map((t) => {
    if (t === '|') return '<div class="tool-sep"></div>';
    const [id, title] = t;
    let active = engine.tool === id;
    let icon = id;
    if (id === 'magnet') active = engine.magnet;
    if (id === 'stay') active = engine.stay;
    if (id === 'hide') { active = engine.hidden; icon = engine.hidden ? 'hidden' : 'hide'; }
    if (id === 'trash') active = false;
    return `<button class="tool${active ? ' active' : ''}" data-tool="${id}" title="${esc(title)}"><svg viewBox="0 0 28 28">${ICONS[icon]}</svg></button>`;
  }).join('');
}
$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  const id = b.dataset.tool;
  if (id === 'magnet') engine.setMagnet(!engine.magnet);
  else if (id === 'stay') engine.setStay(!engine.stay);
  else if (id === 'hide') engine.setHidden(!engine.hidden);
  else if (id === 'trash') {
    const n = engine.count();
    if (n && confirm(`Remove all ${n} drawings on ${state.symbol}? (Ctrl+Z undoes this)`)) engine.deleteAll();
  } else engine.setTool(engine.tool === id && id !== 'cursor' ? 'cursor' : id);
  renderTools();
});

// ------------------------------------------------------------------ selected drawing toolbar
// ---- color picker (TradingView palette + opacity + custom color)
function parseColor(s) {
  const m = String(s || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
    return { hex, a: m[4] == null ? 1 : Number(m[4]) };
  }
  return { hex: /^#[0-9a-f]{6}$/i.test(s) ? s : '#2962ff', a: 1 };
}
const colorStr = (hex, a) => (a >= 1 ? hex : alpha(hex, Math.round(a * 100) / 100));
const FILL_DEF = { rect: 0.15, channel: 0.12, ellipse: 0.15, daterange: 0.22, fib: 0.08 };

let colorPop = null;
function closeColorPicker() { if (colorPop) { colorPop.remove(); colorPop = null; } }
function openColorPicker(anchor, { color, opacity = 1, showOpacity = true }, onPick) {
  closeColorPicker();
  let cur = { hex: parseColor(color).hex, a: opacity };
  const pop = document.createElement('div');
  pop.className = 'cpop';
  pop.innerHTML = `<div class="cp-grid">${PALETTE_ROWS.map((row) => row.map((c) => `<button data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')).join('')}</div>
    ${showOpacity ? `<div class="cp-row"><span>Opacity</span><input type="range" min="0" max="100" value="${Math.round(cur.a * 100)}" class="cp-op"><b class="cp-opv">${Math.round(cur.a * 100)}%</b></div>` : ''}
    <div class="cp-row"><span>Custom</span><input type="color" class="cp-custom" value="${cur.hex}"></div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pw - 8, r.left))}px`;
  pop.style.top = `${r.bottom + 6 + ph > window.innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6}px`;
  const mark = () => pop.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === cur.hex.toLowerCase()));
  mark();
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    cur.hex = b.dataset.c;
    mark();
    pop.querySelector('.cp-custom').value = cur.hex;
    onPick(cur.hex, cur.a);
  });
  pop.querySelector('.cp-op')?.addEventListener('input', (e) => {
    cur.a = Number(e.target.value) / 100;
    pop.querySelector('.cp-opv').textContent = `${e.target.value}%`;
    onPick(cur.hex, cur.a);
  });
  pop.querySelector('.cp-custom').addEventListener('input', (e) => { cur.hex = e.target.value; mark(); onPick(cur.hex, cur.a); });
  colorPop = pop;
}
document.addEventListener('mousedown', (e) => {
  if (colorPop && !colorPop.contains(e.target) && !e.target.closest('[data-cp]')) closeColorPicker();
}, true);

// which fields each color button of the selected drawing changes
function colorTarget(d, which) {
  if (which === 'line') {
    return {
      color: d.type === 'fib' && !d.mono ? '#787b86' : d.color, opacity: d.lineOpacity ?? 1,
      apply: (c, a) => engine.updateSelected(d.type === 'fib' ? { color: c, lineOpacity: a, mono: true } : { color: c, lineOpacity: a }, 'line'),
    };
  }
  if (which === 'fill') {
    return {
      color: d.fillColor || d.color, opacity: d.fillOpacity ?? FILL_DEF[d.type] ?? 0.15,
      apply: (c, a) => engine.updateSelected({ fillColor: c, fillOpacity: a }, 'fill'),
    };
  }
  if (d.type === 'text') return { color: d.color, opacity: d.lineOpacity ?? 1, apply: (c, a) => engine.updateSelected({ color: c, lineOpacity: a }, 'tcolor') };
  return { color: d.textColor || d.color, opacity: 1, showOpacity: false, apply: (c) => engine.updateSelected({ textColor: c }, 'tcolor') };
}

// ---- floating toolbar of the selected drawing (like TradingView)
function renderDrawBar(d) {
  const bar = $('#drawBar');
  if (!d) { bar.hidden = true; closeColorPicker(); return; }
  const parts = [];
  const lineSw = d.type === 'fib' && !d.mono ? 'conic-gradient(#f23645,#ff9800,#4caf50,#089981,#00bcd4,#2962ff,#f23645)' : alpha(d.color, d.lineOpacity ?? 1);
  const und = (col, icon, act, title) => `<button class="db-btn db-col" data-act="${act}" data-cp title="${title}">${svg(icon, 22)}<i style="background:${col}"></i></button>`;
  if (d.type !== 'text') parts.push(und(lineSw, 'edit', 'line', 'Line color and opacity'));
  if (FILLABLE.has(d.type)) parts.push(und(alpha(d.fillColor || d.color, Math.max(0.35, d.fillOpacity ?? FILL_DEF[d.type] ?? 0.15)), 'fill', 'fill', 'Background color and opacity'));
  if (TEXTABLE.has(d.type)) parts.push(und(d.type === 'text' ? d.color : (d.textColor || d.color), 'textT', 'tcolor', 'Text color'));
  if (d.type === 'fib' && d.mono) parts.push(`<button class="db-btn" data-act="rainbow" title="Multi-color levels">${svg('rainbow', 22)}</button>`);
  if (d.type !== 'text') {
    parts.push(`<button class="db-btn" data-act="width" title="Width"><svg viewBox="0 0 28 28"><path d="M4 14h20" stroke-width="${d.width || 1}"/></svg>${d.width || 1}px</button>`);
    const dash = ['', '4 3', '1.5 3'][d.style || 0];
    parts.push(`<button class="db-btn" data-act="style" title="Line style"><svg viewBox="0 0 28 28"><path d="M3 14h22" stroke-width="2" stroke-dasharray="${dash}"/></svg></button>`);
  }
  if (d.type === 'text') {
    parts.push('<button class="db-btn" data-act="smaller" title="Smaller">A−</button>');
    parts.push(`<span class="db-val">${d.textSize || d.size || 14}</span>`);
    parts.push('<button class="db-btn" data-act="bigger" title="Bigger">A+</button>');
  }
  if (d.type === 'line' || d.type === 'channel') {
    parts.push('<span class="db-sep"></span>');
    parts.push(`<button class="db-btn${d.extL ? ' on' : ''}" data-act="extL" title="Extend left">${svg('extL', 22)}</button>`);
    parts.push(`<button class="db-btn${d.extR ? ' on' : ''}" data-act="extR" title="Extend right">${svg('extR', 22)}</button>`);
  }
  if (d.type === 'fib') parts.push(`<button class="db-btn${d.extR ? ' on' : ''}" data-act="extR" title="Extend levels right">${svg('extR', 22)}</button>`);
  parts.push('<span class="db-sep"></span>');
  if (TEXTABLE.has(d.type)) parts.push(`<button class="db-btn" data-act="text" title="${d.type === 'text' ? 'Edit text' : 'Add / edit text on the drawing'}">${svg('textT', 22)}<span>${d.text && d.type !== 'text' ? '✓' : ''}</span></button>`);
  parts.push(`<button class="db-btn" data-act="settings" title="Settings (double-click)">${svg('gear', 22)}</button>`);
  parts.push(`<button class="db-btn${d.locked ? ' on' : ''}" data-act="lock" title="${d.locked ? 'Unlock' : 'Lock (prevent moving)'}">${svg(d.locked ? 'lock' : 'unlock', 22)}</button>`);
  parts.push(`<button class="db-btn" data-act="clone" title="Clone (Ctrl+C / Ctrl+V)">${svg('clone', 22)}</button>`);
  parts.push(`<button class="db-btn" data-act="delete" title="Delete (Del)">${svg('trash', 22)}</button>`);
  bar.innerHTML = parts.join('');
  bar.hidden = false;
}

$('#drawBar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  const d = engine.selected();
  if (!b || !d) return;
  const act = b.dataset.act;
  if (act === 'line' || act === 'fill' || act === 'tcolor') {
    if (colorPop) { closeColorPicker(); return; }
    const t = colorTarget(d, act);
    openColorPicker(b, t, (c, a) => t.apply(c, a));
    return;
  }
  if (act === 'rainbow') engine.updateSelected({ mono: false });
  else if (act === 'width') engine.updateSelected({ width: ((d.width || 1) % 4) + 1 });
  else if (act === 'style') engine.updateSelected({ style: ((d.style || 0) + 1) % 3 });
  else if (act === 'extL') engine.updateSelected({ extL: !d.extL });
  else if (act === 'extR') engine.updateSelected({ extR: !d.extR });
  else if (act === 'smaller') engine.updateSelected({ textSize: Math.max(8, (d.textSize || d.size || 14) - 2) }, 'tsize');
  else if (act === 'bigger') engine.updateSelected({ textSize: Math.min(72, (d.textSize || d.size || 14) + 2) }, 'tsize');
  else if (act === 'lock') engine.updateSelected({ locked: !d.locked });
  else if (act === 'clone') engine.duplicate();
  else if (act === 'delete') engine.deleteSelected();
  else if (act === 'text') openDrawingSettings('text');
  else if (act === 'settings') openDrawingSettings('style');
});

// ---- drawing settings dialog (TradingView: Style / Text)
const SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
function openDrawingSettings(tab = 'style') {
  const d0 = engine.selected();
  if (!d0) return;
  const original = JSON.parse(JSON.stringify(d0));
  const canText = TEXTABLE.has(d0.type), canFill = FILLABLE.has(d0.type);
  if (!canText) tab = 'style';
  const NAMES = { line: 'Trend line', hline: 'Horizontal line', hray: 'Horizontal ray', vline: 'Vertical line', channel: 'Parallel channel', rect: 'Rectangle', ellipse: 'Ellipse', fib: 'Fibonacci', daterange: 'Date range', text: 'Text' };
  const opt = (v, cur, label = v) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
  const render = () => {
    const d = engine.selected();
    if (!d) { closeModal(null); return; }
    const sw = (key, col) => `<button class="set-sw" data-cp data-color="${key}"><i style="background:${col}"></i></button>`;
    const style = `
      ${d.type !== 'text' ? `<div class="ds-row"><span>Line</span>${sw('line', alpha(d.color, d.lineOpacity ?? 1))}
        <select class="m-input sm" data-k="width">${[1, 2, 3, 4].map((w) => opt(w, d.width || 1, `${w}px`)).join('')}</select>
        <select class="m-input sm" data-k="style">${opt(0, d.style || 0, 'Solid')}${opt(1, d.style || 0, 'Dashed')}${opt(2, d.style || 0, 'Dotted')}</select></div>` : ''}
      ${canFill ? `<div class="ds-row"><span>Background</span>${sw('fill', alpha(d.fillColor || d.color, d.fillOpacity ?? FILL_DEF[d.type] ?? 0.15))}
        <input type="range" min="0" max="100" data-k="fillOpacity" value="${Math.round((d.fillOpacity ?? FILL_DEF[d.type] ?? 0.15) * 100)}">
        <b class="ds-v">${Math.round((d.fillOpacity ?? FILL_DEF[d.type] ?? 0.15) * 100)}%</b></div>` : ''}
      ${d.type !== 'text' ? `<div class="ds-row"><span>Line opacity</span><input type="range" min="5" max="100" data-k="lineOpacity" value="${Math.round((d.lineOpacity ?? 1) * 100)}">
        <b class="ds-v">${Math.round((d.lineOpacity ?? 1) * 100)}%</b></div>` : ''}
      ${d.type === 'line' || d.type === 'channel' ? `<div class="ds-row"><span>Extend</span>
        <label class="ds-chk"><input type="checkbox" data-k="extL"${d.extL ? ' checked' : ''}> Left</label>
        <label class="ds-chk"><input type="checkbox" data-k="extR"${d.extR ? ' checked' : ''}> Right</label></div>` : ''}
      ${d.type === 'fib' ? `<div class="ds-row"><span>Levels</span>
        <label class="ds-chk"><input type="checkbox" data-k="extR"${d.extR ? ' checked' : ''}> Extend right</label>
        <label class="ds-chk"><input type="checkbox" data-k="mono"${d.mono ? ' checked' : ''}> Single color</label></div>` : ''}
      <div class="ds-row"><span>Lock</span><label class="ds-chk"><input type="checkbox" data-k="locked"${d.locked ? ' checked' : ''}> Prevent moving</label></div>`;
    const tcol = d.type === 'text' ? alpha(d.color, d.lineOpacity ?? 1) : (d.textColor || d.color);
    const isV = d.type === 'vline';
    const text = `
      <textarea class="m-input ds-text" data-k="text" placeholder="Write text…">${esc(d.text || '')}</textarea>
      <div class="ds-row"><span>Font</span>${sw('tcolor', tcol)}
        <select class="m-input sm" data-k="textSize">${SIZES.map((s) => opt(s, d.textSize || d.size || 14, `${s}`)).join('')}</select>
        <button class="ds-tog${d.bold ? ' on' : ''}" data-tog="bold" title="Bold"><b>B</b></button>
        <button class="ds-tog${d.italic ? ' on' : ''}" data-tog="italic" title="Italic"><i>I</i></button></div>
      ${isV ? '' : `<div class="ds-row"><span>Horizontal align</span><select class="m-input sm" data-k="textAlign">${opt('left', d.textAlign || (d.type === 'text' ? 'left' : 'center'), 'Left')}${opt('center', d.textAlign || (d.type === 'text' ? 'left' : 'center'), 'Center')}${opt('right', d.textAlign || (d.type === 'text' ? 'left' : 'center'), 'Right')}</select></div>`}
      ${d.type === 'text' ? '' : `<div class="ds-row"><span>${isV ? 'Position' : 'Vertical align'}</span><select class="m-input sm" data-k="textVAlign">${(() => {
        const cur = d.textVAlign || (['rect', 'ellipse'].includes(d.type) ? 'middle' : 'top');
        return opt('top', cur, 'Top') + opt('middle', cur, 'Middle') + opt('bottom', cur, 'Bottom');
      })()}</select></div>`}`;
    $('#modalBody').innerHTML = `
      <div class="s-tabs ds-tabs"><button class="s-tab${tab === 'style' ? ' on' : ''}" data-tab="style">Style</button>${canText ? `<button class="s-tab${tab === 'text' ? ' on' : ''}" data-tab="text">Text</button>` : ''}</div>
      <div class="ds-body">${tab === 'style' ? style : text}</div>
      <div class="m-actions"><button class="m-btn" id="dsCancel">Cancel</button><button class="m-btn primary" id="dsOk">OK</button></div>`;
    if (tab === 'text') { const ta = $('#modalBody .ds-text'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  };
  openModal(NAMES[d0.type] || 'Drawing', '');
  $('#modal').classList.add('light');
  const body = $('#modalBody');
  modalClose = () => {
    $('#modal').classList.remove('light');
    closeColorPicker();
    body.onclick = body.oninput = body.onchange = null; // don't leak into the next dialog
  };
  render();
  const set = (patch, key) => engine.updateSelected(patch, 'dlg-' + key);
  body.onclick = (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; render(); return; }
    const tg = e.target.closest('[data-tog]');
    if (tg) { const d = engine.selected(); set({ [tg.dataset.tog]: !d[tg.dataset.tog] }, tg.dataset.tog); tg.classList.toggle('on'); return; }
    const c = e.target.closest('[data-color]');
    if (c) {
      const d = engine.selected();
      const tgt = colorTarget(d, c.dataset.color);
      openColorPicker(c, tgt, (col, a) => { tgt.apply(col, a); const nd = engine.selected(); if (nd) c.querySelector('i').style.background = c.dataset.color === 'fill' ? alpha(nd.fillColor || nd.color, nd.fillOpacity ?? 0.15) : c.dataset.color === 'line' ? alpha(nd.color, nd.lineOpacity ?? 1) : (nd.type === 'text' ? nd.color : nd.textColor || nd.color); });
      return;
    }
    if (e.target.id === 'dsOk') { closeModal(null); return; }
    if (e.target.id === 'dsCancel') {
      const d = engine.selected();
      if (d) {
        const patch = {};
        for (const k of new Set([...Object.keys(d), ...Object.keys(original)])) if (k !== 'id') patch[k] = original[k];
        engine.updateSelected(patch);
      }
      closeModal(null);
    }
  };
  body.oninput = (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (['width', 'style', 'textSize'].includes(k)) v = Number(v);
    if (k === 'fillOpacity' || k === 'lineOpacity') { v = Number(v) / 100; e.target.nextElementSibling.textContent = `${Math.round(v * 100)}%`; }
    set({ [k]: v }, k);
  };
  body.onchange = body.oninput;
}

// ------------------------------------------------------------------ watchlist
let wl = { groups: [] };

const flatSymbols = () => wl.groups.flatMap((g) => g.symbols);

async function loadWatchlist() {
  try { wl = await api('/api/watchlist'); } catch (_) { wl = { groups: [{ name: '', symbols: [state.symbol] }] }; }
  if (!wl.groups?.length) wl = { groups: [{ name: '', symbols: [] }] };
  renderWatchlist();
  refreshQuotes();
}

function saveWatchlist() {
  api('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wl) }).catch(() => {});
}

function quoteCells(s) {
  const q = state.quotes[s];
  if (!q) return '<span class="wl-last muted">…</span><span></span><span></span>';
  if (q.error) return '<span class="wl-last">—</span><span></span><span></span>';
  const dec = decimalsFor(q.last), cls = q.chg > 0 ? 'up' : q.chg < 0 ? 'down' : 'muted';
  const minus = q.chg < 0 ? '−' : '';
  return `<span class="wl-last">${fmtNum(q.last, dec)}</span><span class="${cls}">${minus}${fmtNum(Math.abs(q.chg), dec)}</span><span class="${cls}">${q.pct < 0 ? '−' : ''}${Math.abs(q.pct).toFixed(2)}%</span>`;
}

function renderWatchlist() {
  const cur = symKey(state.symbol);
  const html = [];
  wl.groups.forEach((g, gi) => {
    if (g.name) {
      html.push(`<div class="wl-group${g.collapsed ? ' collapsed' : ''}" data-gi="${gi}" title="Double-click: rename">
        <svg viewBox="0 0 18 18" width="12" height="12"><path d="M5 7l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>${esc(g.name)}
        <button class="wl-x" data-delgroup="${gi}" title="Delete section">×</button></div>`);
    }
    if (g.collapsed) return;
    g.symbols.forEach((s, si) => {
      const q = state.quotes[s];
      const title = q?.error ? q.error : (q?.name || s);
      html.push(`<div class="wl-row${symKey(s) === cur ? ' active' : ''}${q?.error ? ' err' : ''}" draggable="true" data-gi="${gi}" data-si="${si}" data-sym="${esc(s)}" title="${esc(title)}">
        <span class="wl-sym">${iconFor(s)}<b>${esc(s)}</b>${q?.ext && state.ext ? `<span class="ext-dot" style="background:${extColor(q.ext.session)}" title="${q.ext.session === 'pre' ? 'Pre-market' : 'After hours'}: ${fmtNum(q.ext.price, decimalsFor(q.ext.price))} (${sign(q.ext.chg)}${Math.abs(q.ext.pct).toFixed(2)}%)"></span>` : ''}</span>${quoteCells(s)}
        <button class="wl-x" data-del="${gi}:${si}" title="Remove from list">×</button></div>`);
    });
  });
  $('#wlBody').innerHTML = html.join('');
}

const prevQuotes = {};
async function refreshQuotes() {
  const syms = [...new Set(flatSymbols())];
  if (!syms.length) return;
  try {
    const res = await api(`/api/quotes?symbols=${syms.map(enc).join(',')}`);
    Object.assign(state.quotes, res);
  } catch (_) { return; }
  renderWatchlist();
  for (const [s, q] of Object.entries(state.quotes)) {
    const p = prevQuotes[s];
    if (p != null && q.last != null && q.last !== p) {
      const row = document.querySelector(`.wl-row[data-sym="${CSS.escape(s)}"]`);
      if (row) { row.classList.add(q.last > p ? 'flash-up' : 'flash-down'); }
    }
    if (q.last != null) prevQuotes[s] = q.last;
  }
  renderDetail();
  updateExtLine();
}

$('#wlBody').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    const [gi, si] = del.dataset.del.split(':').map(Number);
    wl.groups[gi].symbols.splice(si, 1);
    saveWatchlist();
    renderWatchlist();
    return;
  }
  const dg = e.target.closest('[data-delgroup]');
  if (dg) {
    e.stopPropagation();
    const gi = Number(dg.dataset.delgroup), g = wl.groups[gi];
    if (g.symbols.length && !confirm(`Delete section "${g.name}" and its ${g.symbols.length} symbols?`)) return;
    wl.groups.splice(gi, 1);
    if (!wl.groups.length) wl.groups.push({ name: '', symbols: [] });
    saveWatchlist();
    renderWatchlist();
    return;
  }
  const grp = e.target.closest('.wl-group');
  if (grp) {
    const g = wl.groups[Number(grp.dataset.gi)];
    g.collapsed = !g.collapsed;
    saveWatchlist();
    renderWatchlist();
    return;
  }
  const row = e.target.closest('.wl-row');
  if (row) openSymbol(row.dataset.sym);
});

$('#wlBody').addEventListener('dblclick', async (e) => {
  const grp = e.target.closest('.wl-group');
  if (!grp) return;
  const g = wl.groups[Number(grp.dataset.gi)];
  const name = await askText('Section name', g.name, false);
  if (name != null && name.trim()) { g.name = name.trim().toUpperCase(); saveWatchlist(); renderWatchlist(); }
});

// drag & drop reordering
let dragSrc = null;
$('#wlBody').addEventListener('dragstart', (e) => {
  const row = e.target.closest('.wl-row');
  if (!row) return;
  dragSrc = { gi: Number(row.dataset.gi), si: Number(row.dataset.si) };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', row.dataset.sym);
});
$('#wlBody').addEventListener('dragover', (e) => {
  if (!dragSrc) return;
  const t = e.target.closest('.wl-row, .wl-group');
  document.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
  if (t) { e.preventDefault(); t.classList.add('drop-before'); }
});
$('#wlBody').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#wlBody').contains(e.relatedTarget)) document.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before')); });
$('#wlBody').addEventListener('drop', (e) => {
  document.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
  if (!dragSrc) return;
  e.preventDefault();
  const t = e.target.closest('.wl-row, .wl-group');
  if (!t) return;
  const sym = wl.groups[dragSrc.gi].symbols[dragSrc.si];
  let gi = Number(t.dataset.gi), si;
  if (t.classList.contains('wl-group')) {
    // dropped on a section header: append to the previous section (just above the header)
    if (gi > 0) { gi -= 1; si = wl.groups[gi].symbols.length; } else si = 0;
  } else si = Number(t.dataset.si);
  wl.groups[dragSrc.gi].symbols.splice(dragSrc.si, 1);
  if (gi === dragSrc.gi && si > dragSrc.si) si -= 1;
  wl.groups[gi].symbols.splice(si, 0, sym);
  dragSrc = null;
  saveWatchlist();
  renderWatchlist();
});
$('#wlBody').addEventListener('dragend', () => { dragSrc = null; });

function addToWatchlist(sym, open = true) {
  sym = symKey(sym);
  if (!sym) return;
  if (flatSymbols().map(symKey).includes(sym)) { if (open) openSymbol(sym); return; }
  const cur = symKey(state.symbol);
  let gi = wl.groups.findIndex((g) => g.symbols.map(symKey).includes(cur));
  if (gi < 0) gi = wl.groups.length - 1;
  wl.groups[gi].symbols.push(sym);
  saveWatchlist();
  renderWatchlist();
  refreshQuotes();
  if (open) openSymbol(sym);
}

function wlStep(dir) {
  const visible = wl.groups.flatMap((g) => (g.collapsed ? [] : g.symbols));
  if (!visible.length) return;
  const i = visible.map(symKey).indexOf(symKey(state.symbol));
  const next = visible[(i + dir + visible.length) % visible.length];
  openSymbol(next);
  const row = document.querySelector(`.wl-row[data-sym="${CSS.escape(next)}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
}

$('#wlAdd').onclick = () => openSearch('add');
$('#wlMenuBtn').onclick = (e) => { e.stopPropagation(); $('#wlMenu').hidden = !$('#wlMenu').hidden; };
$('#wlMenu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  $('#wlMenu').hidden = true;
  if (!b) return;
  if (b.dataset.act === 'refresh') refreshQuotes();
  if (b.dataset.act === 'csv') $('#csvFile').click();
  if (b.dataset.act === 'group') {
    const name = await askText('New section name', '', false);
    if (name && name.trim()) { wl.groups.push({ name: name.trim().toUpperCase(), symbols: [] }); saveWatchlist(); renderWatchlist(); }
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#wlMenu') && !e.target.closest('#wlMenuBtn')) $('#wlMenu').hidden = true;
});

// ------------------------------------------------------------------ modallar
let modalClose = null;
function openModal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal(result) {
  if ($('#modal').hidden) return;
  $('#modal').hidden = true;
  $('#modalBody').innerHTML = '';
  const cb = modalClose;
  modalClose = null;
  if (cb) cb(result);
}
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(null); });

function askText(title, value = '', multiline = true) {
  return new Promise((resolve) => {
    const field = multiline
      ? `<textarea class="m-input" id="askInput">${esc(value)}</textarea>`
      : `<input class="m-input" id="askInput" value="${esc(value)}">`;
    openModal(title, `${field}<div class="m-hint">${multiline ? 'Enter: OK · Shift+Enter: new line · Esc: cancel' : 'Enter: OK · Esc: cancel'}</div>
      <div class="m-actions"><button class="m-btn" data-close>Cancel</button><button class="m-btn primary" id="askOk">OK</button></div>`);
    modalClose = resolve;
    const inp = $('#askInput');
    inp.focus();
    inp.select();
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeModal(inp.value); }
      if (e.key === 'Escape') { e.preventDefault(); closeModal(null); }
    });
    $('#askOk').onclick = () => closeModal(inp.value);
  });
}

const SEARCH_TABS = [['all', 'All'], ['stock', 'Stocks'], ['fund', 'Funds'], ['futures', 'Futures'], ['forex', 'Forex'],
  ['crypto', 'Crypto'], ['index', 'Indices'], ['economy', 'Economy']];

function openSearch(mode, initial = '') {
  openModal(mode === 'add' ? 'Add symbol to watchlist' : 'Symbol search', `
    <input class="m-input" id="sInput" placeholder="Symbol or name (e.g. AAPL, THYAO, ETH, gold)" autocomplete="off" spellcheck="false">
    <div class="s-tabs" id="sTabs">${SEARCH_TABS.map(([id, l]) => `<button class="s-tab" data-cat="${id}">${l}</button>`).join('')}</div>
    <div class="m-results" id="sResults"></div>
    <div class="m-hint">Enter: open what you typed · Ratio: <code>GOLD/SILVER</code> · Source prefix: <code>FRED:UNRATE</code> <code>EVDS:TP.DK.USD.A.YTL</code> <code>BIST:THYAO</code></div>`);
  const inp = $('#sInput');
  inp.value = initial;
  inp.focus();
  let cat = store.get('searchCat', 'all');
  let results = [], sel = -1, timer = null, seq = 0, loading = false, errMsg = '';
  const inList = () => new Set(flatSymbols().map(symKey));

  const renderTabs = () => $$('#sTabs .s-tab').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
  const render = () => {
    const have = inList();
    const note = (t) => { $('#sResults').innerHTML = `<div class="m-hint" style="padding:10px 18px">${t}</div>`; };
    if (loading && !results.length) { note('Loading the symbol library… (takes a few seconds the first time)'); return; }
    if (errMsg) { note(`<span style="color:var(--down)">Search failed: ${esc(errMsg)}</span>`); return; }
    if (!results.length) { note(inp.value.trim() ? 'No results — press Enter to open what you typed anyway.' : 'Nothing featured in this category — type to search.'); return; }
    $('#sResults').innerHTML = results.map((r, i) => {
      const added = have.has(symKey(r.symbol));
      return `<div class="m-res${i === sel ? ' sel' : ''}" data-i="${i}">${iconFor(r.symbol)}<b>${esc(r.symbol)}</b><span title="${esc(r.name)}">${esc(r.name)}</span>
        <i>${esc([r.type, r.exch].filter(Boolean).join(' · '))}</i>
        <button class="s-add${added ? ' on' : ''}" data-add="${i}" title="${added ? 'In watchlist' : 'Add to watchlist'}">${added ? '✓' : '+'}</button></div>`;
    }).join('');
    const s = $('#sResults .m-res.sel');
    if (s) s.scrollIntoView({ block: 'nearest' });
  };
  const run = async () => {
    const q = inp.value.trim();
    const my = ++seq;
    loading = true;
    errMsg = '';
    render();
    try {
      const r = await api(`/api/search?q=${enc(q)}&cat=${cat}`);
      if (my !== seq) return;
      results = Array.isArray(r) ? r : [];
      sel = q && results.length ? 0 : -1;
    } catch (e) {
      if (my === seq) { results = []; errMsg = e.message || 'connection error'; }
    }
    if (my === seq) { loading = false; render(); }
  };
  const add = (r) => { addToWatchlist(r.symbol, false); render(); };
  const pick = (r) => { closeModal(null); if (mode === 'add') addToWatchlist(r.symbol); else openSymbol(r.symbol); };

  $('#sTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    cat = b.dataset.cat;
    store.set('searchCat', cat);
    renderTabs();
    run();
    inp.focus();
  });
  inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(-1, sel - 1); render(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel >= 0 && results[sel]) pick(results[sel]);
      else if (inp.value.trim()) pick({ symbol: inp.value.trim() });
    } else if (e.key === 'Escape') { e.preventDefault(); closeModal(null); }
  });
  $('#sResults').addEventListener('click', (e) => {
    const a = e.target.closest('[data-add]');
    if (a) { e.stopPropagation(); add(results[Number(a.dataset.add)]); return; }
    const r = e.target.closest('[data-i]');
    if (r) pick(results[Number(r.dataset.i)]);
  });
  renderTabs();
  run();
}

function openHelp() {
  const keys = [
    ['Type a letter', 'Symbol search'], ['↑ / ↓', 'Previous / next symbol in the watchlist'],
    ['Alt+T', 'Trend line'], ['Alt+H', 'Horizontal line at the cursor price'], ['Alt+J', 'Horizontal ray tool'],
    ['Alt+V', 'Vertical line at the cursor time'], ['Alt+F', 'Fibonacci'], ['Alt+C', 'Parallel channel'], ['Alt+R', 'Rectangle'], ['Alt+E', 'Ellipse'],
    ['Shift + drag', 'Quick measure'], ['Del', 'Delete the selected drawing'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
    ['Ctrl+C / Ctrl+V', 'Copy / paste a drawing (also onto another symbol)'], ['Esc', 'Cancel drawing / deselect'],
    ['Double-click a drawing', 'Drawing settings'], ['Drag the price axis', 'Vertical scale'], ['Double-click an axis', 'Reset the scale'],
  ];
  openModal('Shortcuts', `<div class="m-keys">${keys.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
    <div class="m-hint" style="margin-top:14px">Drawings are saved per symbol and stay in place when you change the interval. Each chart also remembers its zoom and scroll. Saved in: <code>data/drawings.json</code></div>`);
}

// ------------------------------------------------------------------ ayarlar (TCMB EVDS)
const MULTS = [[1, '×1 (raw value)'], [1000, '×1000 (thousand TL)'], [1e6, '×1,000,000 (million TL)']];
const fmtDate = (t) => { const d = new Date(t * 1000); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const keyPlaceholder = (c) => (c.evds_key_set ? `Saved (${c.evds_key_hint}) — paste a new key to replace it` : 'Paste your EVDS API key here');

// ---- Settings dialog tabs: Chart style | TCMB EVDS
const settingsTabs = (cur) => `<div class="s-tabs set-tabs"><button class="s-tab${cur === 'chart' ? ' on' : ''}" data-stab="chart">Chart style</button><button class="s-tab${cur === 'evds' ? ' on' : ''}" data-stab="evds">TCMB EVDS</button></div>`;
function wireSettingsTabs() {
  $('#modalBody .set-tabs').onclick = (e) => {
    const b = e.target.closest('[data-stab]');
    if (!b) return;
    closeModal(null);
    if (b.dataset.stab === 'chart') openChartSettings(); else openSettings();
  };
}

function openChartSettings() {
  const row = (label, inner) => `<div class="ds-row"><span>${label}</span>${inner}</div>`;
  const sw = (key) => `<button class="set-sw" data-cp data-cs="${key}"><i style="background:${CS[key] || 'transparent'}"></i></button>`;
  const chk = (key, label) => `<label class="ds-chk"><input type="checkbox" data-csk="${key}"${CS[key] ? ' checked' : ''}> ${label}</label>`;
  const render = () => {
    $('#modalBody').innerHTML = `${settingsTabs('chart')}
      <div class="set-group">Line chart (single-line data: ISM, M2, Fed…)</div>
      ${row('Line', `${sw('lineColor')}<select class="m-input sm" data-csn="lineWidth">${[1, 2, 3, 4].map((w) => `<option value="${w}"${CS.lineWidth === w ? ' selected' : ''}>${w}px</option>`).join('')}</select>`)}
      <div class="set-group">Candles and bars</div>
      ${row('Up', sw('up'))}
      ${row('Down', sw('down'))}
      ${row('Show', `${chk('wick', 'Wicks')} ${chk('border', 'Borders')}`)}
      <div class="set-group">Last price line</div>
      ${row('Show', `${chk('priceLine', 'On')} ${sw('priceLineColor')}<button class="m-btn sm" data-csauto="priceLineColor" title="Use the candle / line color">Auto</button>
        <select class="m-input sm" data-csn="priceLineStyle">${[[0, 'Solid'], [2, 'Dashed'], [1, 'Dotted']].map(([v, l]) => `<option value="${v}"${CS.priceLineStyle === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}
      <div class="set-group">Background</div>
      ${row('Background', sw('bg'))}
      ${row('Grid', `${chk('grid', 'On')} ${sw('gridColor')}`)}
      ${row('Scale text', sw('text'))}
      <div class="set-group">Pre-market / after hours (US stocks and ETFs)</div>
      ${row('Pre-market', `${sw('extPreColor')}<span class="muted" style="font-size:12px">dot, price, line</span>`)}
      ${row('After hours', `${sw('extPostColor')}<span class="muted" style="font-size:12px">dot, price, line</span>`)}
      ${row('Price line', `${chk('extLine', 'Show on daily charts')}
        <select class="m-input sm" data-csn="extLineStyle">${[[0, 'Solid'], [2, 'Dashed'], [1, 'Dotted']].map(([v, l]) => `<option value="${v}"${CS.extLineStyle === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${row('Background', `${sw('preBg')}<span class="muted" style="font-size:12px">pre-market</span> ${sw('postBg')}<span class="muted" style="font-size:12px">after hours (intraday charts)</span>`)}
      <div class="m-actions"><button class="m-btn" id="csReset" style="margin-right:auto">Reset to defaults</button><button class="m-btn primary" data-close>OK</button></div>`;
    wireSettingsTabs();
  };
  openModal('Settings', '');
  $('#modal').classList.add('light');
  const body = $('#modalBody');
  modalClose = () => { $('#modal').classList.remove('light'); closeColorPicker(); body.onclick = body.oninput = null; };
  render();
  body.onclick = (e) => {
    const s = e.target.closest('[data-cs]');
    if (s) {
      const key = s.dataset.cs;
      const pc = parseColor(CS[key] || (key === 'priceLineColor' ? CS.lineColor : '#2962ff'));
      openColorPicker(s, { color: pc.hex, opacity: pc.a }, (hex, a) => {
        CS[key] = colorStr(hex, a);
        s.querySelector('i').style.background = CS[key];
        applyChartStyle();
      });
      return;
    }
    const au = e.target.closest('[data-csauto]');
    if (au) { CS[au.dataset.csauto] = ''; applyChartStyle(); render(); return; }
    if (e.target.id === 'csReset') { Object.assign(CS, CS_DEFAULT); applyChartStyle(); rebuildKeepView(); render(); }
  };
  body.oninput = (e) => {
    const t = e.target;
    if (t.dataset.csk) { CS[t.dataset.csk] = t.checked; applyChartStyle(); }
    if (t.dataset.csn) { CS[t.dataset.csn] = Number(t.value); applyChartStyle(); }
  };
}
function rebuildKeepView() {
  const r = chart.timeScale().getVisibleLogicalRange();
  rebuildSeries();
  if (r) chart.timeScale().setVisibleLogicalRange(r);
}

async function openSettings() {
  let cfg;
  try { cfg = await api('/api/config'); } catch (e) { alert(e.message); return; }
  const aliases = Object.keys(cfg.evds_series);
  const rows = aliases.map((a) => {
    const s = cfg.evds_series[a];
    const opts = MULTS.map(([v, l]) => `<option value="${v}"${Number(s.mult) === v ? ' selected' : ''}>${l}</option>`).join('');
    return `<b>${esc(a)}</b><input class="m-input sm" data-code="${esc(a)}" value="${esc(s.code)}" placeholder="e.g. TP.HPBITABLO1.11" spellcheck="false">
      <select class="m-input sm" data-mult="${esc(a)}">${opts}</select>`;
  }).join('');
  openModal('Settings', `${settingsTabs('evds')}
    <div class="set-title">TCMB EVDS — ${esc(aliases.join(', '))} and other Turkish central bank series</div>
    <label class="set-label" for="evKey">API key</label>
    <input class="m-input" id="evKey" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(keyPlaceholder(cfg))}">
    <div class="m-hint">The key is free: <a href="https://evds3.tcmb.gov.tr" target="_blank" rel="noopener">evds3.tcmb.gov.tr</a> → sign in / sign up → your user name → Profile → API Key.
      The key stays on this computer (<code>data/config.json</code>) and is only sent to TCMB.</div>
    <div class="set-grid"><span>Symbol</span><span>EVDS series code</span><span>Unit multiplier</span>${rows}</div>
    <div class="m-hint">For any other TCMB series, type <code>EVDS:SERIES.CODE</code> in symbol search (e.g. <code>EVDS:TP.DK.USD.A.YTL</code>).</div>
    <div class="m-actions">
      ${cfg.evds_key_set ? '<button class="m-btn" id="evDel" style="margin-right:auto">Delete key</button>' : ''}
      <button class="m-btn" id="evFind">Find M1/M2 codes on EVDS</button>
      <button class="m-btn primary" id="evSave">Save and test</button>
    </div>
    <div id="evOut" class="set-out"></div>`);

  wireSettingsTabs();
  const out = $('#evOut');
  const payload = () => {
    const series = {};
    aliases.forEach((a) => { series[a] = { code: $(`[data-code="${a}"]`).value.trim().toUpperCase(), mult: Number($(`[data-mult="${a}"]`).value) }; });
    const b = { evds_series: series };
    const k = $('#evKey').value.trim();
    if (k) b.evds_key = k;
    return b;
  };
  const save = async (extra = {}) => {
    const r = await api('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload(), ...extra }) });
    $('#evKey').value = '';
    $('#evKey').placeholder = keyPlaceholder(r);
    return r;
  };
  const afterChange = () => {
    aliases.forEach((a) => { delete state.quotes[a]; });
    refreshQuotes();
    if (aliases.includes(symKey(state.symbol)) || symKey(state.symbol).startsWith('EVDS:')) loadChart();
  };

  $('#evSave').onclick = async () => {
    out.innerHTML = '<span class="muted">Saving, asking EVDS…</span>';
    try {
      await save();
      const t = await api('/api/evds/test');
      if (t.error) out.innerHTML = `<div class="bad">${esc(t.error)}</div>`;
      else {
        out.innerHTML = t.results.map((r) => (r.error
          ? `<div class="set-row"><b>${esc(r.alias)}</b> <code>${esc(r.code || '—')}</code> · <span class="bad">${esc(r.error)}</span></div>`
          : `<div class="set-row"><b>${esc(r.alias)}</b> <code>${esc(r.code)}</code> <span class="ok">✓</span> ${esc(r.name || '')}<br>
              <span class="muted">Last value:</span> ${fmtNum(r.last, 2)} <span class="muted">· ${fmtDate(r.t)} · ${r.count} points · raw EVDS value ${nfmt(r.raw, 2)}</span></div>`)).join('')
          + '<div class="m-hint">Compare with TradingView (TRM1 ≈ 11.22T, TRM2 ≈ 30.01T). If it does not match, change the code or multiplier and test again.</div>';
      }
    } catch (e) { out.innerHTML = `<div class="bad">${esc(e.message)}</div>`; }
    afterChange();
  };

  $('#evFind').onclick = async () => {
    out.innerHTML = '<span class="muted">Searching EVDS for money supply series…</span>';
    try {
      await save();
      const seed = $('[data-code="TRM2"]')?.value.trim() || '';
      const r = await api(`/api/evds/find?seed=${enc(seed)}`);
      const want = { TRM1: /(^|[^A-Z0-9])M1([^A-Z0-9]|$)/i, TRM2: /(^|[^A-Z0-9])M2([^A-Z0-9]|$)/i };
      const picked = {};
      for (const g of r.groups) for (const s of g.series) {
        for (const [a, re] of Object.entries(want)) if (aliases.includes(a) && !picked[a] && re.test(s.name) && !/ar[şs]iv/i.test(s.name)) picked[a] = s.code;
      }
      for (const [a, code] of Object.entries(picked)) $(`[data-code="${a}"]`).value = code;
      const btns = (code) => aliases.map((a) => `<button data-assign="${esc(a)}" data-c="${esc(code)}">${esc(a)}</button>`).join('');
      out.innerHTML = (Object.keys(picked).length
        ? `<div class="ok">Found and filled in: ${Object.entries(picked).map(([a, c]) => `${esc(a)} = <code>${esc(c)}</code>`).join(', ')}. Now press “Save and test”.</div>`
        : '<div class="muted">Could not pick the M1/M2 series automatically; choose from the list.</div>')
        + r.groups.map((g) => `<div class="set-group">${esc(g.name)} · <code>${esc(g.code)}</code></div>`
          + g.series.slice(0, 80).map((s) => `<div class="set-ser${Object.values(picked).includes(s.code) ? ' hit' : ''}"><code>${esc(s.code)}</code>
              <span title="${esc(s.name)}">${esc(s.name)} <i class="muted">${esc(s.freq)}</i></span><span>${btns(s.code)}</span></div>`).join('')).join('');
    } catch (e) { out.innerHTML = `<div class="bad">${esc(e.message)}</div>`; }
  };

  out.addEventListener('click', (e) => {
    const b = e.target.closest('[data-assign]');
    if (!b) return;
    $(`[data-code="${b.dataset.assign}"]`).value = b.dataset.c;
    b.closest('.set-ser').classList.add('hit');
  });

  const del = $('#evDel');
  if (del) {
    del.onclick = async () => {
      if (!confirm('Delete the EVDS API key?')) return;
      try { await save({ evds_key: '' }); out.innerHTML = '<div class="muted">Key deleted.</div>'; del.remove(); } catch (e) { out.innerHTML = `<div class="bad">${esc(e.message)}</div>`; }
      afterChange();
    };
  }
}
$('#settingsBtn').onclick = () => openChartSettings();

// ------------------------------------------------------------------ CSV import (drag & drop or the ⋯ menu)
async function importCsvFile(file) {
  if (!file) return;
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '_').toUpperCase();
  const guess = state.missingCsv || stem;
  const name = await askText(`Save "${file.name}" as which symbol?`, guess, false);
  if (!name || !name.trim()) return;
  try {
    const r = await fetch(`/api/csv?symbol=${enc(name.trim())}`, {
      method: 'POST', headers: { 'X-Guraydingview': '1', 'Content-Type': 'text/csv' }, body: await file.text(),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    state.missingCsv = null;
    delete state.quotes[j.symbol];
    addToWatchlist(j.symbol);
    openSymbol(j.symbol);
  } catch (e) {
    showOverlay(`CSV import failed: ${e.message}`, true);
  }
}
$('#csvFile').addEventListener('change', (e) => { importCsvFile(e.target.files[0]); e.target.value = ''; });
const wrapEl = $('#chartWrap');
wrapEl.addEventListener('dragover', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  wrapEl.classList.add('drop');
});
wrapEl.addEventListener('dragleave', (e) => { if (!wrapEl.contains(e.relatedTarget)) wrapEl.classList.remove('drop'); });
wrapEl.addEventListener('drop', (e) => {
  wrapEl.classList.remove('drop');
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  e.preventDefault();
  importCsvFile(f);
});

// ------------------------------------------------------------------ klavye
document.addEventListener('keydown', (e) => {
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(null); return; }
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const k = e.key, lk = k.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && lk === 'z') { e.preventDefault(); if (e.shiftKey) engine.redo(); else engine.undo(); updateUndo(); return; }
  if (mod && lk === 'y') { e.preventDefault(); engine.redo(); updateUndo(); return; }
  if (mod && lk === 'c') { engine.copy(); return; }
  if (mod && lk === 'v') { e.preventDefault(); engine.paste(); return; }
  if (k === 'Delete' || k === 'Backspace') { if (engine.deleteSelected()) e.preventDefault(); return; }
  if (k === 'Escape') { engine.cancel(); renderTools(); return; }
  if (e.altKey && !mod) {
    const cx = state.crosshair;
    if (lk === 'h' && cx?.price != null) { e.preventDefault(); engine.addAt('hline', { t: engine.l2t(cx.logical), p: cx.price }); return; }
    if (lk === 'v' && cx) { e.preventDefault(); engine.addAt('vline', { t: engine.l2t(cx.logical), p: cx.price ?? state.bars.at(-1)?.close }); return; }
    const map = { t: 'trend', h: 'hline', j: 'hray', v: 'vline', f: 'fib', c: 'channel', r: 'rect', e: 'ellipse' };
    if (map[lk]) { e.preventDefault(); engine.setTool(map[lk]); return; }
  }
  if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); wlStep(k === 'ArrowDown' ? 1 : -1); return; }
  if (!mod && !e.altKey && k.length === 1 && /[a-z0-9]/i.test(k)) { e.preventDefault(); openSearch('open', k.toUpperCase()); }
});

// ------------------------------------------------------------------ start
renderTools();
renderIntervals();
renderTypes();
renderRanges();
renderScaleBtns();
tickClock();
setInterval(tickClock, 1000);
loadWatchlist();
// ?range=All&scale=log in the address also set the date range and price scale
loadChart().then(() => showRangeAndScale(urlParams.get('range') || '', urlParams.get('scale') || ''));
// warm up the symbol library in the background so search is ready when opened
setTimeout(() => { fetch('/api/search?q=&cat=crypto').catch(() => {}); }, 1500);
setInterval(liveUpdate, 20000);
setInterval(refreshQuotes, 30000);
