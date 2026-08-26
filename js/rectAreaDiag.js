/* ============================================================
   rectAreaDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 138 (rectangle/square area and
   perimeter). Drawn to real proportions whenever both dimensions are
   known numbers - when one side is unknown ('x' or similar), that
   side falls back to a fixed fraction of the known one, purely for a
   plausible-looking box (the real value is what's being solved for).

   Diagram Params format:
     shape=rectangle;length=<label>;width=<label>[;caption=<text>]
     shape=square;side=<label>[;caption=<text>]
   `caption` is a given value with nowhere else to live (an area or
   perimeter stated in the question but not shown on any one side),
   shown centred below the shape.

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const RectAreaDiag = (() => {

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lineEl(a, b) {
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"/>`;
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
  // Extracts the leading numeric magnitude from a label like "12cm" -
  // returns null for an unknown ('x', an algebraic expression), so
  // callers can fall back to a decorative default for that side.
  function numericValue(label) {
    const m = String(label).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function buildRectAreaSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const capFontSize = opts.capFontSize || 16;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const maxDim = opts.maxDim || 165;
    const minDim = opts.minDim || 75;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };

    let body = '';
    let W, H, lengthLabel, widthLabel, isSquare = false;

    if (params.shape === 'square') {
      isSquare = true;
      W = H = (minDim + maxDim) / 2;
      lengthLabel = params.side;
      widthLabel = params.side;
    } else {
      const lVal = numericValue(params.length), wVal = numericValue(params.width);
      if (lVal !== null && wVal !== null) {
        const scale = maxDim / Math.max(lVal, wVal);
        W = Math.max(minDim, lVal * scale);
        H = Math.max(minDim, wVal * scale);
      } else if (lVal !== null) {
        W = maxDim * (lVal >= 10 ? 1 : 0.75);
        H = W * 0.62; // unknown width - decorative fallback proportion
      } else if (wVal !== null) {
        H = maxDim * (wVal >= 10 ? 1 : 0.75);
        W = H * 1.6; // unknown length - decorative fallback proportion
      } else {
        W = maxDim; H = minDim;
      }
      lengthLabel = params.length;
      widthLabel = params.width;
    }

    const v0 = [0, 0], v1 = [W, 0], v2 = [W, H], v3 = [0, H];
    [v0, v1, v2, v3].forEach(p => extend(...p));
    body += lineEl(v0, v1); body += lineEl(v1, v2); body += lineEl(v2, v3); body += lineEl(v3, v0);

    if (isSquare) {
      // Single-tick equal-side marks, standard convention for "all sides equal".
      const tick = (mid, dir) => {
        const [x, y] = mid;
        if (dir === 'h') return lineEl([x - 5, y - 6], [x + 5, y + 6]);
        return lineEl([x - 6, y - 5], [x + 6, y + 5]);
      };
      body += tick([W / 2, 0], 'h');
      body += tick([W, H / 2], 'v');
      body += tick([W / 2, H], 'h');
      body += tick([0, H / 2], 'v');
    }

    // Length (top) and width (left) labels.
    const lp = [W / 2, -18];
    body += textEl(lp[0], lp[1], lengthLabel, 'middle', fontSize);
    extend(...textBoundsBox(lp[0], lp[1], 'middle', lengthLabel, fontSize));

    const wp = [-14, H / 2];
    body += textEl(wp[0], wp[1], widthLabel, 'end', fontSize);
    extend(...textBoundsBox(wp[0], wp[1], 'end', widthLabel, fontSize));

    if (params.caption) {
      const cy = H + 26;
      body += textEl(W / 2, cy, params.caption, 'middle', capFontSize, 700);
      extend(...textBoundsBox(W / 2, cy, 'middle', params.caption, capFontSize));
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

  return { buildRectAreaSVG };
})();

DiagramRenderer.register('rect_area', RectAreaDiag.buildRectAreaSVG);
