/* ============================================================
   rectilinearPerimeterDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 180 (composite rectilinear perimeter).
   Every shape here only ever has horizontal/vertical edges, which is
   what makes each of these constructible exactly from a handful of
   given lengths - a genuinely freeform composite shape would need a
   different (much harder) system.

   Four kinds:
     kind=notch;width=<l>;height=<l>;notchW=<l>;notchH=<l>[;showMissing=true]
       A rectangle with a rectangular notch removed from the top-right
       corner. showMissing=true additionally labels the two DERIVED
       side lengths (width-notchW, height-notchH) - off by default,
       since the DF180a-row1 point is precisely that you don't need them.
     kind=staircase;width=<l>;height=<l>;steps=<n>
       A staircase boundary from bottom-right to top-left inside a
       width x height bounding box, `steps` equal steps.
     kind=joined;seg1=<l>;seg2=<l>;height=<l>
       Two rectangles joined along their `height`-length edge, shown
       as one combined rectangle with a dashed line marking the join.
     kind=cross;squareSide=<l>
       A plus-sign made of 5 identical squares.

   All four accept an optional `caption` (a given value with nowhere
   else to live) shown centred below the shape.

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const RectilinearPerimeterDiag = (() => {

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lineEl(a, b, dashed) {
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"${dashed ? ' stroke-dasharray="5,4"' : ''}/>`;
  }
  function polyEl(pts) {
    return `<polygon points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="#1a1a1a" stroke-width="2"/>`;
  }
  function textEl(x, y, text, anchor, fontSize, weight) {
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${fontSize}" font-family="sans-serif"${weight ? ` font-weight="${weight}"` : ''}>${escapeXml(text)}</text>`;
  }
  function textBoundsBox(x, y, anchor, text, fontSize) {
    const w = text.length * fontSize * 0.6;
    let x0, x1;
    if (anchor === 'start') { x0 = x; x1 = x + w; }
    else if (anchor === 'end') { x0 = x - w; x1 = x; }
    else { x0 = x - w / 2; x1 = x + w / 2; }
    return [x0, y - fontSize * 0.7, x1, y + fontSize * 0.4];
  }
  function wrapText(text, maxWidthPx, fontSize) {
    const avgCharWidth = fontSize * 0.58;
    const maxChars = Math.max(6, Math.floor(maxWidthPx / avgCharWidth));
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    words.forEach(word => {
      const trial = current ? current + ' ' + word : word;
      if (trial.length > maxChars && current) { lines.push(current); current = word; }
      else current = trial;
    });
    if (current) lines.push(current);
    return lines;
  }
  function numericValue(label) {
    const m = String(label).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function buildRectilinearPerimeterSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 16;
    const capFontSize = opts.capFontSize || 16;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const maxDim = opts.maxDim || 160;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };
    const label = (x, y, text, anchor, fs) => {
      let out = textEl(x, y, text, anchor, fs || fontSize);
      extend(...textBoundsBox(x, y, anchor, text, fs || fontSize));
      return out;
    };

    let body = '';

    if (params.kind === 'notch') {
      const wVal = numericValue(params.width), hVal = numericValue(params.height);
      const scale = maxDim / Math.max(wVal, hVal);
      const W = wVal * scale, H = hVal * scale;
      const nwVal = numericValue(params.notchW), nhVal = numericValue(params.notchH);
      const NW = nwVal * scale, NH = nhVal * scale;

      const v0 = [0, H], v1 = [W, H], v2 = [W, NH], v3 = [W - NW, NH], v4 = [W - NW, 0], v5 = [0, 0];
      [v0, v1, v2, v3, v4, v5].forEach(p => extend(...p));
      body += polyEl([v0, v1, v2, v3, v4, v5]);

      body += label(W / 2, H + 20, params.width, 'middle');
      body += label(-12, H / 2, params.height, 'end');
      body += label((v2[0] + v3[0]) / 2, NH - 10, params.notchW, 'middle');
      body += label(v3[0] + 12, NH / 2, params.notchH, 'start');

      if (params.showMissing === 'true') {
        const missingTop = wVal - nwVal, missingRight = hVal - nhVal;
        body += label((v4[0] + v5[0]) / 2, -12, `${missingTop}${(String(params.width).match(/[a-zA-Z²°%]+$/) || [''])[0]}`, 'middle');
        body += label(v1[0] + 14, (v1[1] + v2[1]) / 2, `${missingRight}${(String(params.height).match(/[a-zA-Z²°%]+$/) || [''])[0]}`, 'start');
      }

      if (params.caption) body += label(W / 2, H + 44, params.caption, 'middle', capFontSize);

    } else if (params.kind === 'staircase') {
      const wVal = numericValue(params.width), hVal = numericValue(params.height);
      const scale = maxDim / Math.max(wVal, hVal);
      const W = wVal * scale, H = hVal * scale;
      const steps = Number(params.steps) || 3;

      const pts = [[0, H], [W, H]]; // bottom-left, bottom-right
      let cx = W, cy = H;
      for (let i = 0; i < steps; i++) {
        cy -= H / steps;
        pts.push([cx, cy]);
        cx -= W / steps;
        pts.push([cx, cy]);
      }
      pts.forEach(p => extend(...p));
      body += polyEl(pts);

      body += label(W / 2, H + 20, params.width, 'middle');
      body += label(-12, H / 2, params.height, 'end');
      if (params.caption) body += label(W / 2, H + 44, params.caption, 'middle', capFontSize);

    } else if (params.kind === 'joined') {
      const s1Val = numericValue(params.seg1), s2Val = numericValue(params.seg2), hVal = numericValue(params.height);
      const scale = maxDim / (s1Val + s2Val);
      const S1 = s1Val * scale, S2 = s2Val * scale, H = Math.max(50, hVal * scale);

      const v0 = [0, H], v1 = [S1 + S2, H], v2 = [S1 + S2, 0], v3 = [0, 0];
      [v0, v1, v2, v3].forEach(p => extend(...p));
      body += polyEl([v0, v1, v2, v3]);
      body += lineEl([S1, 0], [S1, H], true);

      body += label(S1 / 2, H + 20, params.seg1, 'middle');
      body += label(S1 + S2 / 2, H + 20, params.seg2, 'middle');
      body += label(-12, H / 2, params.height, 'end');
      if (params.caption) body += label((S1 + S2) / 2, H + 44, params.caption, 'middle', capFontSize);

    } else { // cross
      const sVal = numericValue(params.squareSide);
      const s = Math.max(40, maxDim / 3);
      const pts = [
        [s, 0], [2 * s, 0], [2 * s, s], [3 * s, s], [3 * s, 2 * s], [2 * s, 2 * s],
        [2 * s, 3 * s], [s, 3 * s], [s, 2 * s], [0, 2 * s], [0, s], [s, s]
      ];
      pts.forEach(p => extend(...p));
      body += polyEl(pts);
      body += label(1.5 * s, -14, params.squareSide, 'middle');
      void sVal;
      if (params.caption) body += label(1.5 * s, 3 * s + 30, params.caption, 'middle', capFontSize);
    }

    if (opts.promptText) {
      const columnWidth = 150;
      const lines = wrapText(opts.promptText, columnWidth, promptFontSize);
      const gap = 14;
      const blockHeight = lines.length * lineHeight;
      const cy = (by0 + by1) / 2;
      const startY = cy - blockHeight / 2 + promptFontSize * 0.8;
      const cx = bx0 - gap - columnWidth / 2;
      lines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        body += textEl(cx, y, line, 'middle', promptFontSize, 700);
        extend(...textBoundsBox(cx, y, 'middle', line, promptFontSize));
      });
    }

    const vbX = bx0 - pad, vbY = by0 - pad, vbW = (bx1 - bx0) + 2 * pad, vbH = (by1 - by0) + 2 * pad;
    return `<svg viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  return { buildRectilinearPerimeterSVG };
})();

DiagramRenderer.register('rectilinear_perimeter', RectilinearPerimeterDiag.buildRectilinearPerimeterSVG);
