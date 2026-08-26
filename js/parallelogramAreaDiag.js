/* ============================================================
   parallelogramAreaDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 139 (parallelogram area). The slanted
   side is always drawn (it's a real parallelogram) but never
   labelled - that's exactly the "distractor" DF139d tests: the
   picture shows it, but nothing about it is ever given as a number,
   so there's nothing to read off it.

   Diagram Params format:
     shape=parallelogram;base=<label>;height=<label>[;caption=<text>]

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const ParallelogramAreaDiag = (() => {

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lineEl(a, b, dashed) {
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"${dashed ? ' stroke-dasharray="5,4"' : ''}/>`;
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

  function buildParallelogramAreaSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const capFontSize = opts.capFontSize || 16;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const maxDim = opts.maxDim || 160;
    const minDim = opts.minDim || 70;

    const bVal = numericValue(params.base), hVal = numericValue(params.height);
    let basePx, heightPx;
    if (bVal !== null && hVal !== null) {
      const scale = maxDim / Math.max(bVal, hVal);
      basePx = Math.max(minDim, bVal * scale);
      heightPx = Math.max(minDim * 0.6, hVal * scale);
    } else if (bVal !== null) {
      basePx = maxDim; heightPx = basePx * 0.55;
    } else if (hVal !== null) {
      heightPx = maxDim * 0.65; basePx = heightPx * 1.7;
    } else {
      basePx = maxDim; heightPx = minDim;
    }
    const shear = heightPx * 0.55;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };

    const v0 = [0, heightPx], v1 = [basePx, heightPx], v2 = [basePx + shear, 0], v3 = [shear, 0];
    [v0, v1, v2, v3].forEach(p => extend(...p));

    let body = '';
    body += lineEl(v0, v1); body += lineEl(v1, v2); body += lineEl(v2, v3); body += lineEl(v3, v0);

    // Dashed perpendicular height from the top-left vertex down to
    // its foot on the (possibly extended) base line, with a
    // right-angle mark - the standard "true height, not the slant"
    // illustration.
    const foot = [shear, heightPx];
    body += lineEl(v3, foot, true);
    extend(...foot);
    const rs = 10;
    body += `<path d="M ${(foot[0] - rs).toFixed(1)} ${heightPx.toFixed(1)} L ${(foot[0] - rs).toFixed(1)} ${(heightPx - rs).toFixed(1)} L ${foot[0].toFixed(1)} ${(heightPx - rs).toFixed(1)}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;

    const basePt = [(v0[0] + v1[0]) / 2, heightPx + 20];
    body += textEl(basePt[0], basePt[1], params.base, 'middle', fontSize);
    extend(...textBoundsBox(basePt[0], basePt[1], 'middle', params.base, fontSize));

    const heightPt = [shear + 12, heightPx / 2];
    body += textEl(heightPt[0], heightPt[1], params.height, 'start', fontSize);
    extend(...textBoundsBox(heightPt[0], heightPt[1], 'start', params.height, fontSize));

    if (params.caption) {
      const cy = heightPx + (params.base ? 46 : 26);
      const cx = (v0[0] + v1[0]) / 2;
      body += textEl(cx, cy, params.caption, 'middle', capFontSize, 700);
      extend(...textBoundsBox(cx, cy, 'middle', params.caption, capFontSize));
    }

    if (opts.promptText) {
      const columnWidth = 150;
      const lines = wrapText(opts.promptText, columnWidth, promptFontSize);
      const gap = 24;
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

  return { buildParallelogramAreaSVG };
})();

DiagramRenderer.register('parallelogram_area', ParallelogramAreaDiag.buildParallelogramAreaSVG);
