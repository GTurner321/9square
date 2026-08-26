/* ============================================================
   trapeziumAreaDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 184 (trapezium area). Two shapes:

   Plain (no `split`): a symmetric trapezium with parallel sides a
   (top) and b (bottom), a dashed perpendicular height line + right-
   angle mark.

   `split=<segA>:<segB>` (DF184e): a RIGHT trapezium instead (one
   already-vertical side, doubling as the height line with no
   separate dashed construction needed) with a dashed internal line
   splitting it into the rectangle (width segA) and triangle (base
   segB) the question decomposes it into - the base is labelled in
   two parts rather than as one combined length.

   Diagram Params format:
     shape=trapezium;a=<label>;b=<label>;height=<label>[;caption=<text>]
     shape=trapezium;a=<label>;height=<label>;split=<segA>:<segB>[;caption=<text>]

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const TrapeziumAreaDiag = (() => {

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

  function buildTrapeziumAreaSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const capFontSize = opts.capFontSize || 16;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const maxDim = opts.maxDim || 170;
    const minDim = opts.minDim || 65;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };

    let body = '';
    const hVal = numericValue(params.height);

    if (params.split) {
      const [segALabel, segBLabel] = params.split.split(':');
      const segAVal = numericValue(segALabel) || numericValue(params.a) || 8;
      const segBVal = numericValue(segBLabel) || segAVal * 0.35;
      const scale = maxDim / (segAVal + segBVal);
      const heightPx = Math.max(minDim, (hVal !== null ? hVal : segAVal * 0.6) * scale);
      const rectW = segAVal * scale, triW = segBVal * scale;

      const v0 = [0, heightPx], v1 = [rectW + triW, heightPx], v2 = [rectW, 0], v3 = [0, 0];
      [v0, v1, v2, v3].forEach(p => extend(...p));
      body += lineEl(v0, v1); body += lineEl(v1, v2); body += lineEl(v2, v3); body += lineEl(v3, v0);

      // Dashed split line (rectangle | triangle), and a right-angle
      // mark at the left edge (which already serves as the height,
      // being vertical by construction - no separate dashed height
      // line needed here).
      body += lineEl([rectW, 0], [rectW, heightPx], true);
      const rs = 10;
      body += `<path d="M ${rs} 0 L ${rs} ${rs} L 0 ${rs}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;

      const segAPt = [rectW / 2, heightPx + 20];
      body += textEl(segAPt[0], segAPt[1], segALabel, 'middle', fontSize);
      extend(...textBoundsBox(segAPt[0], segAPt[1], 'middle', segALabel, fontSize));

      const segBPt = [rectW + triW / 2, heightPx + 20];
      body += textEl(segBPt[0], segBPt[1], segBLabel, 'middle', fontSize);
      extend(...textBoundsBox(segBPt[0], segBPt[1], 'middle', segBLabel, fontSize));

      const heightPt = [-12, heightPx / 2];
      body += textEl(heightPt[0], heightPt[1], params.height, 'end', fontSize);
      extend(...textBoundsBox(heightPt[0], heightPt[1], 'end', params.height, fontSize));

      if (params.caption) {
        const cy = heightPx + 44;
        const cx = (v0[0] + v1[0]) / 2;
        body += textEl(cx, cy, params.caption, 'middle', capFontSize, 700);
        extend(...textBoundsBox(cx, cy, 'middle', params.caption, capFontSize));
      }

    } else {
      const aVal = numericValue(params.a), bVal = numericValue(params.b);
      let aPx, bPx, pxPerUnit;
      if (aVal !== null && bVal !== null) {
        pxPerUnit = maxDim / Math.max(aVal, bVal);
        aPx = aVal * pxPerUnit; bPx = bVal * pxPerUnit;
      } else if (bVal !== null) {
        bPx = maxDim; aPx = bPx * 0.6;
        pxPerUnit = bPx / bVal;
      } else if (aVal !== null) {
        aPx = maxDim * 0.7; bPx = aPx * 1.5;
        pxPerUnit = aPx / aVal;
      } else {
        aPx = maxDim * 0.6; bPx = maxDim;
        pxPerUnit = maxDim / 15; // no real unit known on either side - arbitrary decorative scale
      }
      const heightPx = Math.max(minDim, (hVal !== null ? hVal * pxPerUnit : Math.min(aPx, bPx) * 0.5));
      const offset = (bPx - aPx) / 2;

      const v0 = [0, heightPx], v1 = [bPx, heightPx], v2 = [offset + aPx, 0], v3 = [offset, 0];
      [v0, v1, v2, v3].forEach(p => extend(...p));
      body += lineEl(v0, v1); body += lineEl(v1, v2); body += lineEl(v2, v3); body += lineEl(v3, v0);

      const foot = [offset, heightPx];
      body += lineEl(v3, foot, true);
      extend(...foot);
      const rs = 10;
      body += `<path d="M ${(offset - rs).toFixed(1)} ${heightPx.toFixed(1)} L ${(offset - rs).toFixed(1)} ${(heightPx - rs).toFixed(1)} L ${offset.toFixed(1)} ${(heightPx - rs).toFixed(1)}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;

      const aPt = [offset + aPx / 2, -16];
      body += textEl(aPt[0], aPt[1], params.a, 'middle', fontSize);
      extend(...textBoundsBox(aPt[0], aPt[1], 'middle', params.a, fontSize));

      const bPt = [bPx / 2, heightPx + 20];
      body += textEl(bPt[0], bPt[1], params.b, 'middle', fontSize);
      extend(...textBoundsBox(bPt[0], bPt[1], 'middle', params.b, fontSize));

      const heightPt = [offset - 22, heightPx / 2];
      body += textEl(heightPt[0], heightPt[1], params.height, 'end', fontSize);
      extend(...textBoundsBox(heightPt[0], heightPt[1], 'end', params.height, fontSize));

      if (params.caption) {
        const cy = heightPx + 44;
        const cx = bPx / 2;
        body += textEl(cx, cy, params.caption, 'middle', capFontSize, 700);
        extend(...textBoundsBox(cx, cy, 'middle', params.caption, capFontSize));
      }
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

  return { buildTrapeziumAreaSVG };
})();

DiagramRenderer.register('trapezium_area', TrapeziumAreaDiag.buildTrapeziumAreaSVG);
