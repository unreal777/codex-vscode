// Image viewer / editor in its own VS Code editor tab (src/imageEditor.ts): an attached picture shown big, with pen, eraser (the drawing
// only), text, colours, undo and clear on a layer above it. "Save changes" sends the merged PNG back (it replaces the attached picture);
// a new sketch starts white and is attached. Pictures of sent messages are only shown (no tools).
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const STR = {
    pen: 'Pen', eraser: 'Eraser', text: 'Text', textHint: 'Click where the text goes, type, Enter', color: 'Colour', size: 'Brush and text size',
    undo: 'Undo (Ctrl+Z)', clear: 'Clear drawing', close: 'Close', save: 'Save changes', attach: 'Attach', sketch: 'Sketch',
  };
  const COLORS = ['#e03131', '#111111', '#ffffff', '#1971c2', '#2f9e44', '#f08c00'];
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) el.append(c);
    return el;
  };
  const PEN = '<svg viewBox="0 0 16 16"><path d="M11 2.5l2.5 2.5-8 8H3v-2.5z"/></svg>';

  let opts = null;
  window.addEventListener('message', (e) => { if (e.data && e.data.kind === 'init') start(e.data); });
  vscode.postMessage({ type: 'ready' });

  function start(o) {
    opts = o;
    const app = document.getElementById('app');
    app.innerHTML = '';
    const editable = o.editable !== false;
    let color = COLORS[0], size = 5, mode = 'pen', dirty = !!o.blank;
    let textBox = null, textAt = null;
    const base = h('canvas', { class: 'base' }), canvas = h('canvas', { class: 'draw', 'aria-label': o.name || STR.sketch });
    const bctx = base.getContext('2d'), ctx = canvas.getContext('2d');
    const stage = h('div', { class: 'stage' }, h('div', { class: 'board' }, base, canvas));
    const board = stage.firstChild;

    // ---- toolbar ----
    const btn = (label, cls, fn, html) => h('button', { type: 'button', class: 'tb ' + (cls || ''), title: label, 'aria-label': label, html: html || null, text: html ? null : label, onclick: fn });
    const penB = btn(STR.pen, 'tool', () => setMode('pen'), PEN);
    const eraseB = btn(STR.eraser, 'tool', () => setMode('eraser'));
    const textB = btn(STR.text, 'tool', () => setMode('text'));
    textB.title = STR.textHint;
    const sw = COLORS.map((c) => {
      const b = h('button', { type: 'button', class: 'sw', style: 'background:' + c, title: STR.color + ' ' + c, 'aria-label': STR.color + ' ' + c, 'aria-pressed': String(c === color) });
      b.addEventListener('click', () => { color = c; if (mode === 'eraser') setMode('pen'); sw.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); if (textBox) textBox.style.color = c; });
      return b;
    });
    const range = h('input', { type: 'range', min: '1', max: '30', value: String(size), title: STR.size, 'aria-label': STR.size });
    range.addEventListener('input', () => { size = parseInt(range.value, 10) || 5; if (textBox) textBox.style.fontSize = textPx() + 'px'; });
    const undoB = btn(STR.undo, '', () => undo(), '↶');
    const clearB = btn(STR.clear, '', () => clear());
    const saveB = h('button', { type: 'button', class: 'tb primary', text: o.blank ? STR.attach : STR.save, onclick: () => save() });
    const closeB = h('button', { type: 'button', class: 'tb', text: STR.close, onclick: () => vscode.postMessage({ type: 'close' }) });
    const bar = h('div', { class: 'bar' }, h('span', { class: 'name', text: o.name || STR.sketch }),
      editable ? [h('span', { class: 'sep' }), penB, eraseB, textB, h('span', { class: 'sws' }, sw), range, undoB, clearB] : null,
      h('span', { class: 'spacer' }), editable ? saveB : null, closeB);
    app.append(bar, stage);
    const refreshSave = () => { saveB.disabled = !dirty; };
    refreshSave();

    function setMode(m) {
      commitText();
      mode = m;
      [[penB, 'pen'], [eraseB, 'eraser'], [textB, 'text']].forEach(([b, k]) => b.setAttribute('aria-pressed', String(k === m)));
      canvas.style.cursor = !editable ? 'default' : m === 'text' ? 'text' : 'crosshair';
    }

    // ---- sizes: the picture keeps its pixels, the board is fitted into the stage ----
    function fit() {
      const r = stage.getBoundingClientRect(), w = base.width || 1, hh = base.height || 1;
      const k = Math.min((r.width - 32) / w, (r.height - 32) / hh, o.blank ? 10 : 2);
      board.style.width = Math.max(1, Math.floor(w * k)) + 'px';
      board.style.height = Math.max(1, Math.floor(hh * k)) + 'px';
    }
    window.addEventListener('resize', fit);
    const ready = () => { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; fit(); setMode(editable ? 'pen' : 'none'); };
    if (o.blank) {
      [base, canvas].forEach((c) => { c.width = 1200; c.height = 800; });
      bctx.fillStyle = '#ffffff'; bctx.fillRect(0, 0, 1200, 800);
      ready();
    } else {
      const img = new Image();
      img.onload = () => {
        [base, canvas].forEach((c) => { c.width = img.naturalWidth; c.height = img.naturalHeight; });
        bctx.drawImage(img, 0, 0);
        ready();
      };
      img.src = o.url;
    }

    // ---- drawing ----
    const undoStack = [];
    const remember = () => { try { undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height)); if (undoStack.length > 40) undoStack.shift(); } catch (e) { /* ignore */ } };
    const changed = () => { dirty = true; refreshSave(); };
    function undo() { commitText(); const d = undoStack.pop(); if (d) { ctx.putImageData(d, 0, 0); changed(); } }
    function clear() { commitText(); remember(); ctx.clearRect(0, 0, canvas.width, canvas.height); changed(); }
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
    const scale = () => canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    function stroke(from, to) {
      ctx.globalCompositeOperation = mode === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.lineWidth = (mode === 'eraser' ? size * 3 : size) * scale();
      ctx.beginPath();
      if (!to) { ctx.arc(from[0], from[1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); } else { ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    const textPx = () => Math.max(12, size * 4);
    function commitText() {
      if (!textBox) return;
      const t = textBox.value, at = textAt, px = textPx() * scale();
      textBox.remove(); textBox = null; textAt = null;
      if (!t.trim()) return;
      remember();
      ctx.fillStyle = color; ctx.textBaseline = 'top';
      ctx.font = '600 ' + px + 'px ' + getComputedStyle(document.body).fontFamily;
      ctx.fillText(t, at[0], at[1]);
      changed();
    }
    function startText(e) {
      commitText();
      textAt = pos(e);
      const r = board.getBoundingClientRect();
      textBox = h('input', { type: 'text', class: 'textbox', placeholder: STR.text,
        style: 'left:' + (e.clientX - r.left) + 'px;top:' + (e.clientY - r.top) + 'px;color:' + color + ';font-size:' + textPx() + 'px' });
      textBox.addEventListener('keydown', (k) => {
        if (k.key === 'Enter') { k.preventDefault(); commitText(); }
        else if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); textBox.remove(); textBox = null; textAt = null; }
      });
      board.append(textBox);
      setTimeout(() => textBox && textBox.focus(), 0);
    }
    let last = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!editable) return;
      if (mode === 'text') { e.preventDefault(); startText(e); return; }
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      remember();
      last = pos(e); stroke(last); changed();
    });
    canvas.addEventListener('pointermove', (e) => { if (!last) return; const p = pos(e); stroke(last, p); last = p; });
    const stop = () => { last = null; };
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);

    function save() {
      commitText();
      if (!dirty) return;
      const out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      const c = out.getContext('2d');
      c.drawImage(base, 0, 0); c.drawImage(canvas, 0, 0);
      vscode.postMessage({ type: 'save', url: out.toDataURL('image/png') });
    }
    document.onkeydown = (e) => {
      if (textBox) return;
      if (e.key === 'Escape') { e.preventDefault(); vscode.postMessage({ type: 'close' }); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
    };
    // test hook (isolated VS Code checks)
    window.__imageEditor = { save, setMode, isDirty: () => dirty };
  }
})();
