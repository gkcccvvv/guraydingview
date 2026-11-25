// Drawing engine — unlimited drawings on a Lightweight Charts (v4.1+) series primitive.
// Points are stored as {t: unix seconds, p: price}, so drawings stay in place when the interval changes.
//
// Drawing object (all optional fields have defaults):
//   color, width, style(0 solid, 1 dashed, 2 dotted), lineOpacity
//   fillColor, fillOpacity                       (rectangle, ellipse, channel, fib, date range)
//   text, textColor, textSize, bold, italic, textAlign(left|center|right), textVAlign(top|middle|bottom)
//   extL, extR, mono(fib tek renk), locked

const FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
const DASH = [[], [6, 4], [1.5, 3]];
const FIB = [
  [0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'],
  [0.786, '#00bcd4'], [1, '#787b86'], [1.618, '#2962ff'], [2.618, '#f23645'],
];
const FILL_DEFAULT = { rect: 0.15, channel: 0.12, ellipse: 0.15, daterange: 0.22, fib: 0.08 };
export const FILLABLE = new Set(['rect', 'channel', 'ellipse', 'daterange', 'fib']);
export const TEXTABLE = new Set(['line', 'hline', 'hray', 'vline', 'rect', 'channel', 'ellipse', 'text']);
export const STYLE_KEYS = ['color', 'width', 'style', 'lineOpacity', 'fillColor', 'fillOpacity', 'textColor',
  'textSize', 'bold', 'italic', 'textAlign', 'textVAlign'];

export const TOOL_DEFS = {
  trend:     { type: 'line', n: 2, color: '#2962ff' },
  ray:       { type: 'line', n: 2, color: '#2962ff', extR: true },
  extended:  { type: 'line', n: 2, color: '#2962ff', extL: true, extR: true },
  hline:     { type: 'hline', n: 1, color: '#2962ff' },
  hray:      { type: 'hray', n: 1, color: '#2962ff' },
  vline:     { type: 'vline', n: 1, color: '#2962ff' },
  channel:   { type: 'channel', n: 3, color: '#2962ff' },
  rect:      { type: 'rect', n: 2, color: '#9c27b0' },
  ellipse:   { type: 'ellipse', n: 2, color: '#ff9800' },
  fib:       { type: 'fib', n: 2, color: '#787b86' },
  daterange: { type: 'daterange', n: 2, color: '#2962ff' },
  text:      { type: 'text', n: 1, color: '#2962ff' },
  measure:   { type: 'measure', n: 2, color: '#2962ff' },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (o) => JSON.parse(JSON.stringify(o));

function rgb(hex) {
  let h = String(hex || '#2962ff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const alpha = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a == null ? 1 : a})`; };
const isLight = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62; };
const lineColor = (d) => alpha(d.color, d.lineOpacity ?? 1);
const fillColor = (d) => alpha(d.fillColor || d.color, d.fillOpacity ?? FILL_DEFAULT[d.type] ?? 0.15);
const fontOf = (size, bold, italic, weight = 400) => `${italic ? 'italic ' : ''}${bold ? 700 : weight} ${size}px ${FONT}`;

function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

// extend line a→b to the screen box (extL: behind a, extR: beyond b)
function extendSeg(a, b, extL, extR, W, H) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return [a, b];
  const box = { x0: -50, x1: W + 50, y0: -50, y1: H + 50 };
  const tExit = (px, py, sx, sy) => {
    let t = Infinity;
    if (sx > 0) t = Math.min(t, (box.x1 - px) / sx); else if (sx < 0) t = Math.min(t, (box.x0 - px) / sx);
    if (sy > 0) t = Math.min(t, (box.y1 - py) / sy); else if (sy < 0) t = Math.min(t, (box.y0 - py) / sy);
    return Math.max(0, t);
  };
  let s = a, e = b;
  if (extR) { const t = tExit(b.x, b.y, dx, dy); e = { x: b.x + dx * t, y: b.y + dy * t }; }
  if (extL) { const t = tExit(a.x, a.y, -dx, -dy); s = { x: a.x - dx * t, y: a.y - dy * t }; }
  return [s, e];
}

class AxisLabel {
  constructor(c, text, bg) { this._c = c; this._t = text; this._bg = bg; }
  coordinate() { return this._c; }
  text() { return this._t; }
  textColor() { return isLight(this._bg) ? '#131722' : '#ffffff'; }
  backColor() { return this._bg; }
  visible() { return true; }
  tickVisible() { return true; }
}

class DrawingPrimitive {
  constructor(engine) {
    this.e = engine;
    this._req = null;
    this.pAxis = [];
    this.tAxis = [];
    this._view = { zOrder: () => 'top', renderer: () => ({ draw: (target) => engine._draw(target) }) };
  }
  attached({ requestUpdate }) { this._req = requestUpdate; }
  detached() { this._req = null; }
  updateAllViews() { this.e._buildAxisViews(this); }
  paneViews() { return [this._view]; }
  priceAxisViews() { return this.pAxis; }
  timeAxisViews() { return this.tAxis; }
  request() { if (this._req) this._req(); }
}

export class DrawingEngine {
  constructor({ chart, el, formatTime, formatPrice, onChange, onSelect, onTool, onEdit, askText }) {
    this.chart = chart;
    this.el = el;
    this.ts = chart.timeScale();
    this.formatTime = formatTime;
    this.formatPrice = formatPrice;
    this.onChange = onChange || (() => {});
    this.onSelect = onSelect || (() => {});
    this.onTool = onTool || (() => {});
    this.onEdit = onEdit || (() => {});
    this.askText = askText || (async (t, v) => window.prompt(t, v || ''));
    this.series = null;
    this.bars = [];
    this.times = [];
    this.stepEnd = 86400;
    this.stepStart = 86400;
    this.drawings = [];
    this.selectedId = null;
    this.hoverId = null;
    this.tool = 'cursor';
    this.stay = false;
    this.magnet = false;
    this.hidden = false;
    this.creating = null;
    this.drag = null;
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = null;
    this._co = null;
    this.defaults = this._loadDefaults();
    this.prim = new DrawingPrimitive(this);
    this._mctx = document.createElement('canvas').getContext('2d');
    this._swallow = false;
    this._bind();
  }

  // ------------------------------------------------------------ veri / seri
  setSeries(s) {
    if (this.series && this.series !== s) { try { this.series.detachPrimitive(this.prim); } catch (_) { /* ignore */ } }
    if (this.series !== s) { this.series = s; if (s) s.attachPrimitive(this.prim); }
  }

  setData(bars) {
    this.bars = bars;
    this.times = bars.map((b) => b.time);
    const d = [];
    for (let i = 1; i < this.times.length; i++) d.push(this.times[i] - this.times[i - 1]);
    this.stepEnd = median(d.slice(-80)) || 86400;
    this.stepStart = median(d.slice(0, 80)) || this.stepEnd;
    this.request();
  }

  updateBar(bar) {
    const n = this.times.length;
    if (n && bar.time === this.times[n - 1]) this.bars[n - 1] = bar;
    else if (!n || bar.time > this.times[n - 1]) { this.bars.push(bar); this.times.push(bar.time); }
  }

  t2l(t) {
    const T = this.times, n = T.length;
    if (!n) return 0;
    if (t <= T[0]) return (t - T[0]) / this.stepStart;
    if (t >= T[n - 1]) return n - 1 + (t - T[n - 1]) / this.stepEnd;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    return lo + (t - T[lo]) / (T[hi] - T[lo]);
  }

  l2t(l) {
    const T = this.times, n = T.length;
    if (!n) return 0;
    if (l <= 0) return Math.round(T[0] + l * this.stepStart);
    if (l >= n - 1) return Math.round(T[n - 1] + (l - (n - 1)) * this.stepEnd);
    const i = Math.floor(l), f = l - i;
    return Math.round(T[i] + f * (T[i + 1] - T[i]));
  }

  // Lightweight Charts returns 0 for non-integer indexes: interpolate between two bars ourselves
  _l2x(l) {
    const i = Math.floor(l), f = l - i;
    const x0 = this.ts.logicalToCoordinate(i);
    if (x0 == null || !f) return x0;
    const x1 = this.ts.logicalToCoordinate(i + 1);
    return x1 == null ? x0 : x0 + (x1 - x0) * f;
  }

  x(t) { return this._l2x(this.t2l(t)); }
  y(p) { return this.series ? this.series.priceToCoordinate(p) : null; }
  paneW() { return this.ts.width(); }
  paneH() { return this.el.clientHeight - this.ts.height(); }
  request() { this.prim.request(); }

  // ------------------------------------------------------------ public API
  load(list) {
    this.drawings = (Array.isArray(list) ? list : []).filter((d) => d && d.type && Array.isArray(d.pts));
    this.drawings.forEach((d) => { if (!d.id) d.id = uid(); });
    this.undoStack = [];
    this.redoStack = [];
    this.creating = null;
    this.drag = null;
    this.selectedId = null;
    this.hoverId = null;
    this._co = null;
    this.onSelect(null);
    this.request();
  }

  // The drawings were changed somewhere else (another tab, the Claude connector): show the new list but keep the
  // undo history, so Ctrl+Z takes the change back. Nothing is saved here (onChange is not called).
  applyExternal(list) {
    if (this.creating) this._cancelCreate();
    this.drag = null;
    const snap = this._snapshot();
    const temp = this.drawings.filter((d) => d.temp);
    this.drawings = (Array.isArray(list) ? list : []).filter((d) => d && d.type && Array.isArray(d.pts));
    this.drawings.forEach((d) => { if (!d.id) d.id = uid(); });
    this.drawings.push(...temp);
    if (snap !== this._snapshot()) {
      this.undoStack.push(snap);
      if (this.undoStack.length > 300) this.undoStack.shift();
      this.redoStack = [];
    }
    this._co = null;
    if (!this.selected()) { this.selectedId = null; this.onSelect(null); } else this.onSelect(this.selected());
    this.request();
  }

  getDrawings() { return clone(this.drawings.filter((d) => !d.temp)); }
  selected() { return this.drawings.find((d) => d.id === this.selectedId) || null; }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this._co = null;
    this.onSelect(this.selected());
    this.request();
  }

  setTool(tool) {
    if (this.creating) this._cancelCreate();
    this._clearTemp();
    this.tool = tool;
    if (tool !== 'cursor') this.select(null);
    this._setCursor(null);
    this.onTool(tool);
  }

  setMagnet(v) { this.magnet = v; this.onTool(this.tool); }
  setStay(v) { this.stay = v; this.onTool(this.tool); }
  setHidden(v) {
    this.hidden = v;
    if (v) this.select(null);
    this.onTool(this.tool);
    this.request();
  }

  cancel() {
    if (this.creating) { this._cancelCreate(); return true; }
    if (this._clearTemp()) return true;
    if (this.tool !== 'cursor') { this.setTool('cursor'); return true; }
    if (this.selectedId) { this.select(null); return true; }
    return false;
  }

  deleteSelected() {
    const d = this.selected();
    if (!d) return false;
    const snap = this._snapshot();
    this.drawings = this.drawings.filter((x) => x !== d);
    this.selectedId = null;
    this.onSelect(null);
    this._commit(snap);
    return true;
  }

  deleteAll() {
    if (!this.drawings.length) return;
    const snap = this._snapshot();
    this.drawings = [];
    this.selectedId = null;
    this.onSelect(null);
    this._commit(snap);
  }

  count() { return this.drawings.filter((d) => !d.temp).length; }

  // coalesceKey: merge rapid changes (e.g. a slider) into a single undo step
  updateSelected(patch, coalesceKey = null) {
    const d = this.selected();
    if (!d) return;
    const now = Date.now();
    const merge = coalesceKey && this._co && this._co.key === coalesceKey && this._co.id === d.id && now - this._co.t < 2500;
    const snap = merge ? null : this._snapshot();
    Object.assign(d, patch);
    for (const k of STYLE_KEYS) {
      if (k in patch && d.tool) this.defaults[d.tool] = { ...(this.defaults[d.tool] || {}), [k]: patch[k] };
    }
    this._saveDefaults();
    if (snap === null) { this.onChange(); this.request(); } else this._commit(snap);
    this._co = coalesceKey ? { key: coalesceKey, id: d.id, t: now } : null;
    this.onSelect(d);
  }

  undo() {
    if (this.creating) { this._cancelCreate(); return; }
    if (!this.undoStack.length) return;
    this.redoStack.push(this._snapshot());
    this.drawings = JSON.parse(this.undoStack.pop());
    this._afterHistory();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this._snapshot());
    this.drawings = JSON.parse(this.redoStack.pop());
    this._afterHistory();
  }

  copy() { const d = this.selected(); if (d) this.clipboard = clone(d); return !!d; }

  paste() {
    if (!this.clipboard) return;
    this.duplicate(this.clipboard);
  }

  duplicate(src = this.selected()) {
    if (!src) return;
    const snap = this._snapshot();
    const d = clone(src);
    d.id = uid();
    d.locked = false;
    const r = this.ts.getVisibleLogicalRange();
    const shift = Math.max(3, Math.round(((r?.to ?? 50) - (r?.from ?? 0)) * 0.04));
    if (d.type !== 'hline') d.pts = d.pts.map((p) => ({ t: this.l2t(this.t2l(p.t) + shift), p: p.p }));
    if (d.type === 'hline' || d.type === 'hray') {
      const y = this.y(d.pts[0].p);
      if (y != null) d.pts = d.pts.map((p) => ({ t: p.t, p: this.series.coordinateToPrice(y + 20) ?? p.p }));
    }
    this.drawings.push(d);
    this._commit(snap);
    this.select(d.id);
  }

  addAt(tool, pt) {
    if (!pt || pt.p == null || !isFinite(pt.p)) return;
    const snap = this._snapshot();
    const d = this._newDrawing(tool, pt);
    this.drawings.push(d);
    this._commit(snap);
    this.select(d.id);
  }

  // ------------------------------------------------------------ internals
  _afterHistory() {
    this.creating = null;
    this.drag = null;
    this._co = null;
    if (!this.selected()) { this.selectedId = null; this.onSelect(null); } else this.onSelect(this.selected());
    this.onChange();
    this.request();
  }

  _snapshot() { return JSON.stringify(this.drawings.filter((d) => !d.temp)); }

  _commit(prevSnap) {
    if (prevSnap !== this._snapshot()) {
      this.undoStack.push(prevSnap);
      if (this.undoStack.length > 300) this.undoStack.shift();
      this.redoStack = [];
      this.onChange();
    }
    this.request();
  }

  _loadDefaults() { try { return JSON.parse(localStorage.getItem('gm.drawDefaults') || '{}'); } catch (_) { return {}; } }
  _saveDefaults() { try { localStorage.setItem('gm.drawDefaults', JSON.stringify(this.defaults)); } catch (_) { /* ignore */ } }

  _newDrawing(tool, pt) {
    const def = TOOL_DEFS[tool];
    const user = this.defaults[tool] || {};
    const d = {
      id: uid(), tool, type: def.type,
      pts: Array.from({ length: def.n }, () => ({ t: pt.t, p: pt.p })),
      color: def.color, width: 1, style: 0,
    };
    for (const k of STYLE_KEYS) if (user[k] != null) d[k] = user[k];
    if (def.extL) d.extL = true;
    if (def.extR) d.extR = true;
    if (tool === 'text') d.textSize = d.textSize || 14;
    if (tool === 'measure') d.temp = true;
    return d;
  }

  _clearTemp() {
    const before = this.drawings.length;
    this.drawings = this.drawings.filter((d) => !d.temp);
    if (this.drawings.length !== before) { this.request(); return true; }
    return false;
  }

  _cancelCreate() {
    if (!this.creating) return;
    this.drawings = this.drawings.filter((d) => d !== this.creating.d);
    this.creating = null;
    this.request();
  }

  _xy(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _inPane(x, y) { return x >= 0 && y >= 0 && x <= this.paneW() && y <= this.paneH(); }

  _point(x, y) {
    if (!this.series || !this.times.length) return null;
    let l = this.ts.coordinateToLogical(x);
    if (l == null) return null;
    l = Math.round(l);
    let p = this.series.coordinateToPrice(y);
    if (p == null || !isFinite(p)) return null;
    if (this.magnet && l >= 0 && l < this.bars.length) {
      const b = this.bars[l];
      let best = null, bd = Infinity;
      for (const v of [b.open, b.high, b.low, b.close]) {
        const yy = this.series.priceToCoordinate(v);
        if (yy == null) continue;
        const dd = Math.abs(yy - y);
        if (dd < bd) { bd = dd; best = v; }
      }
      if (best != null && bd < 40) p = best;
    }
    return { t: this.l2t(l), p };
  }

  _setCursor(kind) {
    this.el.classList.toggle('dw-pointer', kind === 'pointer');
    this.el.classList.toggle('dw-move', kind === 'move');
    this.el.classList.toggle('dw-grabbing', kind === 'grabbing');
  }

  _swallowEvent(e) {
    e.stopPropagation();
    this._swallow = true;
  }

  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => this._onDown(e), true);
    el.addEventListener('mousedown', (e) => {
      if (this._swallow) { e.stopPropagation(); e.preventDefault(); this._swallow = false; }
    }, true);
    el.addEventListener('pointermove', (e) => this._onMove(e), true);
    window.addEventListener('pointermove', (e) => { if (this.drag) this._onMove(e); });
    window.addEventListener('pointerup', (e) => this._onUp(e), true);
    el.addEventListener('dblclick', (e) => this._onDbl(e), true);
    el.addEventListener('pointerleave', () => {
      if (this.hoverId && !this.drag) { this.hoverId = null; this.request(); }
    });
  }

  _onDown(e) {
    if (e.button !== 0) return;
    const { x, y } = this._xy(e);
    if (!this._inPane(x, y) || !this.series) return;

    // Shift + drag = quick measure
    if (this.tool === 'cursor' && e.shiftKey && !this.creating) {
      this._swallowEvent(e);
      this._clearTemp();
      const pt = this._point(x, y);
      if (!pt) return;
      this._beginCreate('measure', pt, x, y);
      return;
    }

    if (this.tool === 'cursor' && !this.creating) {
      this._clearTemp();
      if (this.hidden) return;
      const hit = this._hitTest(x, y);
      if (hit) {
        this._swallowEvent(e);
        this.select(hit.d.id);
        if (hit.d.locked) return; // locked: can be selected but not moved
        this.drag = {
          d: hit.d, handle: hit.handle, startX: x, startY: y,
          startL: this.ts.coordinateToLogical(x), snapshot: this._snapshot(),
          orig: clone(hit.d.pts), origXY: hit.d.pts.map((p) => ({ l: this.t2l(p.t), y: this.y(p.p) })), moved: false,
        };
        this._setCursor('grabbing');
        return;
      }
      if (this.selectedId) this.select(null);
      return; // let the chart pan
    }

    // drawing tools
    this._swallowEvent(e);
    const pt = this._point(x, y);
    if (!pt) return;
    if (this.hidden) this.setHidden(false);
    if (!this.creating) {
      this._clearTemp();
      const def = TOOL_DEFS[this.tool];
      if (!def) return;
      if (this.tool === 'text') { this._createText(pt); return; }
      if (def.n === 1) {
        const snap = this._snapshot();
        const d = this._newDrawing(this.tool, pt);
        this.drawings.push(d);
        this._commit(snap);
        this._finishTool(d);
        return;
      }
      this._beginCreate(this.tool, pt, x, y);
    } else {
      this._advanceCreate(pt);
    }
  }

  _beginCreate(tool, pt, x, y) {
    const snapshot = this._snapshot();
    const d = this._newDrawing(tool, pt);
    this.drawings.push(d);
    this.creating = { d, idx: 1, downX: x, downY: y, snapshot, n: TOOL_DEFS[tool].n };
    this.request();
  }

  _advanceCreate(pt) {
    const c = this.creating;
    c.d.pts[c.idx] = pt;
    if (c.d.type === 'channel' && c.idx === 1) c.d.pts[2] = { ...pt };
    c.idx++;
    if (c.idx >= c.n) {
      this.creating = null;
      if (c.d.temp) { this.request(); if (this.tool === 'measure') { this.tool = 'cursor'; this.onTool('cursor'); } return; }
      this._commit(c.snapshot);
      this._finishTool(c.d);
    } else {
      this.request();
    }
  }

  _finishTool(d) {
    this.select(d.id);
    if (!this.stay) { this.tool = 'cursor'; this.onTool('cursor'); }
  }

  async _createText(pt) {
    const txt = await this.askText('Text', '');
    if (!txt || !txt.trim()) return;
    const snap = this._snapshot();
    const d = this._newDrawing('text', pt);
    d.text = txt;
    this.drawings.push(d);
    this._commit(snap);
    this._finishTool(d);
  }

  _onMove(e) {
    const { x, y } = this._xy(e);
    if (this.drag) { this._dragMove(x, y); return; }
    if (this.creating) {
      const pt = this._point(x, y);
      if (pt) {
        const c = this.creating;
        c.d.pts[c.idx] = pt;
        if (c.d.type === 'channel' && c.idx === 1) c.d.pts[2] = { ...pt };
        this.request();
      }
      return;
    }
    if (this.tool !== 'cursor' || this.hidden) return;
    const hit = this._inPane(x, y) ? this._hitTest(x, y) : null;
    const id = hit ? hit.d.id : null;
    this._setCursor(hit ? (hit.d.locked ? 'pointer' : hit.handle != null ? 'move' : 'pointer') : null);
    if (id !== this.hoverId) { this.hoverId = id; this.request(); }
  }

  _dragMove(x, y) {
    const dr = this.drag, d = dr.d;
    if (!dr.moved && Math.hypot(x - dr.startX, y - dr.startY) < 3) return;
    dr.moved = true;
    if (dr.handle != null) {
      const pt = this._point(x, y);
      if (pt) this._applyHandle(d, dr.handle, pt);
    } else {
      const lNow = this.ts.coordinateToLogical(x);
      const dl = lNow == null || dr.startL == null ? 0 : Math.round(lNow - dr.startL);
      const dy = y - dr.startY;
      d.pts = dr.origXY.map((o, i) => {
        const np = o.y == null ? dr.orig[i].p : this.series.coordinateToPrice(o.y + dy);
        return { t: this.l2t(o.l + dl), p: np == null ? dr.orig[i].p : np };
      });
    }
    this.request();
  }

  _applyHandle(d, h, pt) {
    if (d.type === 'rect' || d.type === 'ellipse') {
      const [a, b] = d.pts;
      if (h === 0) d.pts[0] = pt;
      else if (h === 1) d.pts[1] = pt;
      else if (h === 2) { d.pts[0] = { t: pt.t, p: a.p }; d.pts[1] = { t: b.t, p: pt.p }; }
      else if (h === 3) { d.pts[1] = { t: pt.t, p: b.p }; d.pts[0] = { t: a.t, p: pt.p }; }
      return;
    }
    d.pts[h] = pt;
  }

  _onUp(e) {
    if (this.drag) {
      const dr = this.drag;
      this.drag = null;
      this._setCursor(null);
      if (dr.moved) this._commit(dr.snapshot);
      return;
    }
    if (this.creating && this.creating.idx === 1) {
      // press-drag-release drawing
      const { x, y } = this._xy(e);
      if (Math.hypot(x - this.creating.downX, y - this.creating.downY) > 6) {
        const pt = this._point(x, y);
        if (pt) this._advanceCreate(pt);
      }
    }
  }

  _onDbl(e) {
    const { x, y } = this._xy(e);
    if (!this._inPane(x, y) || this.tool !== 'cursor') return;
    const hit = this._hitTest(x, y);
    if (!hit) return;
    e.stopPropagation();
    this.select(hit.d.id);
    this.onEdit(hit.d); // double-click: settings dialog
  }

  _hitTest(x, y) {
    const list = this.drawings.filter((d) => !d.temp);
    const order = list.reverse();
    const si = order.findIndex((d) => d.id === this.selectedId);
    if (si > 0) order.unshift(order.splice(si, 1)[0]);
    const geoms = order.map((d) => [d, this._geom(d)]).filter(([, g]) => g);
    for (const [d, g] of geoms) {
      if (d.id !== this.selectedId && d.id !== this.hoverId) continue;
      for (const h of g.handles) if (Math.hypot(h.x - x, h.y - y) <= 7) return { d, handle: h.i };
    }
    // lines/text first, then filled areas (so a line inside a rectangle can be selected)
    for (const [d, g] of geoms) {
      for (const s of g.segs) if (!s.deco && distSeg(x, y, s.x1, s.y1, s.x2, s.y2) <= 5) return { d, handle: null };
      for (const b of g.boxes) if (x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y - 3 && y <= b.y + b.h + 3) return { d, handle: null };
      for (const el of g.ellipses) {
        const r = Math.hypot((x - el.cx) / (el.rx || 1), (y - el.cy) / (el.ry || 1));
        if (Math.abs(r - 1) * Math.min(el.rx, el.ry) <= 5) return { d, handle: null };
      }
    }
    for (const [d, g] of geoms) {
      if (['rect', 'channel', 'daterange'].includes(d.type) && g.polys.some((p) => inPoly(x, y, p.pts))) return { d, handle: null };
      if (g.ellipses.some((el) => ((x - el.cx) / (el.rx || 1)) ** 2 + ((y - el.cy) / (el.ry || 1)) ** 2 <= 1)) return { d, handle: null };
    }
    return null;
  }

  _textSize(text, font, size) {
    this._mctx.font = font;
    const lines = String(text ?? '').split('\n');
    const lh = Math.round(size * 1.35);
    return { w: Math.max(1, ...lines.map((l) => this._mctx.measureText(l).width)), h: lines.length * lh, lines, lh };
  }

  // text attached to a drawing (TradingView's "Text" tab)
  _label(d, g, anchor) {
    if (!d.text || d.type === 'text') return;
    const base = { text: d.text, color: d.textColor || d.color, size: d.textSize || 14, bold: d.bold, italic: d.italic };
    const ha = d.textAlign || 'center';
    const va = d.textVAlign || (anchor.kind === 'box' ? 'middle' : 'top');
    if (anchor.kind === 'seg') {
      let { a, b } = anchor;
      if (b.x < a.x) [a, b] = [b, a];
      const f = ha === 'left' ? 0 : ha === 'right' ? 1 : 0.5;
      g.texts.push({
        ...base, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x),
        align: ha === 'left' ? 'left' : ha === 'right' ? 'right' : 'center',
        valign: va === 'top' ? 'bottom' : va === 'bottom' ? 'top' : 'middle', offset: va === 'top' ? -4 : va === 'bottom' ? 4 : 0,
      });
    } else if (anchor.kind === 'vline') {
      const H = this.paneH();
      const pos = va === 'bottom' ? { y: H - 8, align: 'left' } : va === 'middle' ? { y: H / 2, align: 'center' } : { y: 8, align: 'right' };
      g.texts.push({ ...base, x: anchor.x, y: pos.y, angle: -Math.PI / 2, align: pos.align, valign: 'bottom', offset: -4 });
    } else if (anchor.kind === 'box') {
      const { x1, y1, x2, y2 } = anchor;
      const x = ha === 'left' ? x1 + 6 : ha === 'right' ? x2 - 6 : (x1 + x2) / 2;
      const y = va === 'top' ? y1 + 4 : va === 'bottom' ? y2 - 4 : (y1 + y2) / 2;
      g.texts.push({ ...base, x, y, align: ha, valign: va });
    }
  }

  _geom(d) {
    if (!this.series || !this.times.length) return null;
    const W = this.paneW(), H = this.paneH();
    const P = d.pts.map((p) => ({ x: this.x(p.t), y: this.y(p.p) }));
    if (P.some((p) => p.x == null || p.y == null || !isFinite(p.x) || !isFinite(p.y))) return null;
    const g = { segs: [], polys: [], ellipses: [], texts: [], handles: [], boxes: [] };
    const col = lineColor(d), w = d.width || 1, dash = DASH[d.style || 0];
    const seg = (a, b, extra = {}) => g.segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: col, width: w, dash, ...extra });

    switch (d.type) {
      case 'line': {
        const [a, b] = P;
        const [s, e] = extendSeg(a, b, d.extL, d.extR, W, H);
        seg(s, e);
        g.handles.push({ x: a.x, y: a.y, i: 0 }, { x: b.x, y: b.y, i: 1 });
        this._label(d, g, { kind: 'seg', a, b });
        break;
      }
      case 'hline': {
        const { y } = P[0];
        seg({ x: -5, y }, { x: W + 5, y });
        g.handles.push({ x: Math.min(Math.max(P[0].x, 24), W - 24), y, i: 0 });
        this._label(d, g, { kind: 'seg', a: { x: 8, y }, b: { x: W - 8, y } });
        break;
      }
      case 'hray': {
        const { x, y } = P[0];
        seg({ x, y }, { x: W + 5, y });
        g.handles.push({ x, y, i: 0 });
        this._label(d, g, { kind: 'seg', a: { x: x + 4, y }, b: { x: W - 8, y } });
        break;
      }
      case 'vline': {
        const { x } = P[0];
        seg({ x, y: -5 }, { x, y: H + 5 });
        g.handles.push({ x, y: Math.min(Math.max(P[0].y, 24), H - 24), i: 0 });
        this._label(d, g, { kind: 'vline', x });
        break;
      }
      case 'rect': {
        const [a, b] = P;
        const c1 = { x: a.x, y: b.y }, c2 = { x: b.x, y: a.y };
        g.polys.push({ pts: [[a.x, a.y], [c2.x, c2.y], [b.x, b.y], [c1.x, c1.y]], fill: fillColor(d) });
        seg(a, c2); seg(c2, b); seg(b, c1); seg(c1, a);
        g.handles.push({ x: a.x, y: a.y, i: 0 }, { x: b.x, y: b.y, i: 1 }, { x: a.x, y: b.y, i: 2 }, { x: b.x, y: a.y, i: 3 });
        this._label(d, g, { kind: 'box', x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x), y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y) });
        break;
      }
      case 'ellipse': {
        const [a, b] = P;
        const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
        g.ellipses.push({ cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: (x2 - x1) / 2, ry: (y2 - y1) / 2, stroke: col, width: w, dash, fill: fillColor(d) });
        g.handles.push({ x: a.x, y: a.y, i: 0 }, { x: b.x, y: b.y, i: 1 }, { x: a.x, y: b.y, i: 2 }, { x: b.x, y: a.y, i: 3 });
        this._label(d, g, { kind: 'box', x1, x2, y1, y2 });
        break;
      }
      case 'channel': {
        const [a, b, c] = P;
        const dx = b.x - a.x;
        const yOn = (xx) => (dx === 0 ? a.y : a.y + ((b.y - a.y) * (xx - a.x)) / dx);
        const off = c.y - yOn(c.x);
        const a2 = { x: a.x, y: a.y + off }, b2 = { x: b.x, y: b.y + off };
        const am = { x: a.x, y: a.y + off / 2 }, bm = { x: b.x, y: b.y + off / 2 };
        const [s1, e1] = extendSeg(a, b, d.extL, d.extR, W, H);
        const [s2, e2] = extendSeg(a2, b2, d.extL, d.extR, W, H);
        const [s3, e3] = extendSeg(am, bm, d.extL, d.extR, W, H);
        g.polys.push({ pts: [[s1.x, s1.y], [e1.x, e1.y], [e2.x, e2.y], [s2.x, s2.y]], fill: fillColor(d) });
        seg(s1, e1); seg(s2, e2);
        seg(s3, e3, { dash: [4, 4], width: 1, deco: true });
        g.handles.push({ x: a.x, y: a.y, i: 0 }, { x: b.x, y: b.y, i: 1 }, { x: c.x, y: c.y, i: 2 });
        this._label(d, g, { kind: 'seg', a, b });
        break;
      }
      case 'fib': {
        const [a, b] = P;
        const pa = d.pts[0].p, pb = d.pts[1].p;
        const xl = Math.min(a.x, b.x), xr = d.extR ? W + 5 : Math.max(a.x, b.x);
        let prevY = null;
        const labelLeft = xl > 130;
        const fo = d.fillOpacity ?? FILL_DEFAULT.fib;
        for (const [lv, lc] of FIB) {
          const price = pb + (pa - pb) * lv;
          const yy = this.y(price);
          if (yy == null) continue;
          const c = d.mono ? d.color : lc;
          g.segs.push({ x1: xl, y1: yy, x2: xr, y2: yy, color: alpha(c, d.lineOpacity ?? 1), width: w, dash });
          if (prevY != null && fo > 0) g.polys.push({ pts: [[xl, prevY], [xr, prevY], [xr, yy], [xl, yy]], fill: alpha(c, fo) });
          g.texts.push({
            x: labelLeft ? xl - 6 : xl + 4, y: labelLeft ? yy : yy - 2, text: `${lv} (${this.formatPrice(price)})`,
            color: c, size: 11, align: labelLeft ? 'right' : 'left', valign: labelLeft ? 'middle' : 'bottom',
          });
          prevY = yy;
        }
        g.segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: '#787b86', width: 1, dash: [4, 4], deco: true });
        g.handles.push({ x: a.x, y: a.y, i: 0 }, { x: b.x, y: b.y, i: 1 });
        break;
      }
      case 'daterange': {
        // TradingView-style "Date range": box + arrow + "26 bars, 791d" label (persistent)
        const [a, b] = P;
        const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
        g.polys.push({ pts: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], fill: fillColor(d) });
        seg({ x: a.x, y: y1 }, { x: a.x, y: y2 });
        seg({ x: b.x, y: y1 }, { x: b.x, y: y2 });
        const my = (y1 + y2) / 2, dir = b.x >= a.x ? 1 : -1;
        seg({ x: a.x, y: my }, { x: b.x, y: my }, { dash: [] });
        seg({ x: b.x, y: my }, { x: b.x - 8 * dir, y: my - 5 }, { dash: [], deco: true });
        seg({ x: b.x, y: my }, { x: b.x - 8 * dir, y: my + 5 }, { dash: [], deco: true });
        const bars = Math.round(Math.abs(this.t2l(d.pts[1].t) - this.t2l(d.pts[0].t)));
        const days = Math.round(Math.abs(d.pts[1].t - d.pts[0].t) / 86400);
        const span = days >= 1 ? `${days.toLocaleString('en-US')}d` : `${Math.round(Math.abs(d.pts[1].t - d.pts[0].t) / 3600)}h`;
        const up = d.pts[1].p >= d.pts[0].p;
        g.texts.push({
          x: (x1 + x2) / 2, y: up ? y1 - 8 : y2 + 8, text: d.text || `${bars} bars, ${span}`,
          color: '#ffffff', bg: 'rgba(42,46,57,0.92)', size: 12, bold: true, align: 'center', valign: up ? 'bottom' : 'top',
        });
        g.handles.push({ x: a.x, y: a.y, i: 0 }, { x: b.x, y: b.y, i: 1 });
        break;
      }
      case 'text': {
        const { x, y } = P[0];
        const size = d.textSize || d.size || 14;
        const font = fontOf(size, d.bold, d.italic, 500);
        const m = this._textSize(d.text, font, size);
        const align = d.textAlign || 'left';
        const bx = align === 'right' ? x - m.w : align === 'center' ? x - m.w / 2 : x;
        g.texts.push({ x, y, text: d.text, color: lineColor(d), size, bold: d.bold, italic: d.italic, weight: 500, align, valign: 'top' });
        g.boxes.push({ x: bx, y, w: m.w, h: m.h });
        break;
      }
      case 'measure': {
        const [a, b] = P;
        const pa = d.pts[0].p, pb = d.pts[1].p;
        const up = pb >= pa;
        const c = up ? '#2962ff' : '#f23645';
        const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
        g.polys.push({ pts: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], fill: alpha(c, 0.18) });
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        g.segs.push({ x1: mx, y1: a.y, x2: mx, y2: b.y, color: c, width: 1, dash: [] });
        g.segs.push({ x1: a.x, y1: my, x2: b.x, y2: my, color: c, width: 1, dash: [] });
        const dp = pb - pa, pct = pa ? (dp / pa) * 100 : 0;
        const bars = Math.round(this.t2l(d.pts[1].t) - this.t2l(d.pts[0].t));
        const secs = Math.abs(d.pts[1].t - d.pts[0].t);
        const span = secs >= 86400 ? `${Math.round(secs / 86400)}d` : `${Math.round(secs / 3600)}h`;
        const sign = dp > 0 ? '+' : dp < 0 ? '−' : '';
        g.texts.push({
          x: mx, y: up ? y1 - 8 : y2 + 8,
          text: `${sign}${this.formatPrice(Math.abs(dp))} (${sign}${Math.abs(pct).toFixed(2)}%)\n${bars} bars, ${span}`,
          color: '#ffffff', bg: c, size: 12, align: 'center', valign: up ? 'bottom' : 'top',
        });
        break;
      }
      default:
        return null;
    }
    return g;
  }

  _buildAxisViews(prim) {
    const pa = [], ta = [];
    if (this.series && !this.hidden && this.times.length) {
      const fmt = (p) => this.formatPrice(p);
      for (const d of this.drawings) {
        if (d.type === 'hline' || d.type === 'hray') {
          const y = this.y(d.pts[0].p);
          if (y != null) pa.push(new AxisLabel(y, fmt(d.pts[0].p), d.color));
        }
      }
      const sel = this.creating ? this.creating.d : this.selected();
      if (sel && sel.type !== 'hline' && sel.type !== 'hray') {
        const color = sel.type === 'fib' && !sel.mono ? '#2962ff' : sel.color;
        const pts = sel.type === 'vline' ? [] : sel.pts;
        for (const p of pts) {
          const y = this.y(p.p);
          if (y != null) pa.push(new AxisLabel(y, fmt(p.p), color));
        }
        for (const p of sel.pts) {
          const x = this.x(p.t);
          if (x != null) ta.push(new AxisLabel(x, this.formatTime(p.t), color));
        }
      }
    }
    prim.pAxis = pa;
    prim.tAxis = ta;
  }

  _draw(target) {
    if (!this.series || !this.times.length) return;
    if (this.hidden && !this.creating) return;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      for (const d of this.drawings) {
        const g = this._geom(d);
        if (!g) continue;
        const active = d.id === this.selectedId || (this.creating && this.creating.d === d);
        const showHandles = active || d.id === this.hoverId;

        for (const p of g.polys) {
          ctx.beginPath();
          p.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * hr, py * vr) : ctx.moveTo(px * hr, py * vr)));
          ctx.closePath();
          ctx.fillStyle = p.fill;
          ctx.fill();
        }

        for (const el of g.ellipses) {
          ctx.beginPath();
          ctx.ellipse(el.cx * hr, el.cy * vr, Math.max(0.5, el.rx * hr), Math.max(0.5, el.ry * vr), 0, 0, Math.PI * 2);
          ctx.fillStyle = el.fill;
          ctx.fill();
          ctx.lineWidth = Math.max(1, Math.round(el.width * hr));
          ctx.strokeStyle = el.stroke;
          ctx.setLineDash((el.dash || []).map((v) => v * hr));
          ctx.stroke();
          ctx.setLineDash([]);
        }

        for (const s of g.segs) {
          const lw = Math.max(1, Math.round((s.width || 1) * hr));
          ctx.lineWidth = lw;
          ctx.strokeStyle = s.color;
          ctx.setLineDash((s.dash || []).map((v) => v * hr));
          let x1 = s.x1 * hr, y1 = s.y1 * vr, x2 = s.x2 * hr, y2 = s.y2 * vr;
          const off = lw % 2 ? 0.5 : 0;
          if (Math.abs(y1 - y2) < 0.01) { y1 = y2 = Math.round(y1) + off; }
          if (Math.abs(x1 - x2) < 0.01) { x1 = x2 = Math.round(x1) + off; }
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        if (g.texts.length || (active && g.boxes.length)) {
          ctx.save();
          ctx.scale(hr, vr);
          for (const t of g.texts) this._drawText(ctx, t);
          if (active) {
            for (const b of g.boxes) {
              ctx.strokeStyle = '#2962ff';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
              ctx.setLineDash([]);
            }
          }
          ctx.restore();
        }

        if (showHandles && !d.temp) {
          const hc = d.type === 'fib' && !d.mono ? '#2962ff' : d.color;
          for (const h of g.handles) {
            ctx.beginPath();
            ctx.arc(h.x * hr, h.y * vr, 5 * hr, 0, Math.PI * 2);
            ctx.fillStyle = '#0f0f0f';
            ctx.fill();
            ctx.lineWidth = Math.max(1, Math.round(1.5 * hr));
            ctx.strokeStyle = d.locked ? '#787b86' : hc;
            ctx.stroke();
          }
        }
      }
    });
  }

  _drawText(ctx, t) {
    const size = t.size || 12;
    const font = fontOf(size, t.bold, t.italic, t.weight || 400);
    const { w, h, lines, lh } = this._textSize(t.text, font, size);
    ctx.save();
    ctx.translate(t.x, t.y);
    if (t.angle) ctx.rotate(t.angle);
    if (t.offset) ctx.translate(0, t.offset);
    const x0 = t.align === 'right' ? -w : t.align === 'center' ? -w / 2 : 0;
    const y0 = t.valign === 'bottom' ? -h : t.valign === 'middle' ? -h / 2 : 0;
    if (t.bg) {
      const px = 7, py = 4;
      ctx.fillStyle = t.bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0 - px, y0 - py, w + px * 2, h + py * 2, 4);
      else ctx.rect(x0 - px, y0 - py, w + px * 2, h + py * 2);
      ctx.fill();
    }
    ctx.font = font;
    ctx.fillStyle = t.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    lines.forEach((ln, i) => {
      const lw = ctx.measureText(ln).width;
      const lx = t.align === 'center' ? x0 + (w - lw) / 2 : t.align === 'right' ? x0 + (w - lw) : x0;
      ctx.fillText(ln, lx, y0 + i * lh + lh / 2);
    });
    ctx.restore();
  }
}
