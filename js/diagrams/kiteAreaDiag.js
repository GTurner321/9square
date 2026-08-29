/* ============================================================
   kiteAreaDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 183 (kite area). Two modes:

   mode=legs - a kite formed from two congruent right-angled
   triangles mirrored across their shared long leg. That shared leg
   becomes one full diagonal (length = leg1); the short leg, mirrored
   on both sides, becomes the other diagonal at double its own length
   (2 x leg2) - the diagram makes that doubling visible rather than
   leaving it implicit, since it's the one part of this construction
   that isn't obvious from the words alone.

   mode=diagonals - the kite drawn directly from its two (perpendicular)
   diagonals.

   Diagram Params format:
     mode=legs;leg1=<label>;leg2=<label>[;caption=<text>]
     mode=diagonals;d1=<label>;d2=<label>[;caption=<text>]

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const KiteAreaDiag = (() => {

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
  // Recognised unit suffixes only - this is what lets "8cm" parse as
  // 8 while "2a" or "3x" correctly parse as null (an algebraic
  // coefficient, not a unit), rather than silently misreading the
  // leading digit as the whole value.
  const KNOWN_UNITS = ['cm²', 'cm', 'm²', 'm', 'mm²', 'mm', '°', '%'];
  function numericValue(label) {
    const s = String(label).trim();
    const m = s.match(/^-?\d+(\.\d+)?/);
    if (!m) return null;
    const rest = s.slice(m[0].length).trim();
    if (rest !== '' && !KNOWN_UNITS.includes(rest)) return null;
    return parseFloat(m[0]);
  }

  function buildKiteAreaSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const capFontSize = opts.capFontSize || 16;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const maxDim = opts.maxDim || 150;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };

    let body = '';

    if (params.mode === 'legs') {
      const l1Val = numericValue(params.leg1), l2Val = numericValue(params.leg2);
      const known = [l1Val, l2Val].filter(v => v !== null);
      const refVal = known.length ? Math.max(...known) : 10;
      const scale = maxDim / refVal;
      const longPx = (l1Val !== null ? l1Val : refVal * 0.85) * scale;
      const shortPx = (l2Val !== null ? l2Val : refVal * 0.55) * scale;

      const top = [0, 0], bottom = [0, longPx], right = [shortPx, 0], left = [-shortPx, 0];
      // The shared long leg sits at the SHORT diagonal's own crossing
      // height (0 here - top of the long leg), matching the real
      // construction: mirroring a right triangle across its long leg,
      // the short leg is horizontal AT the vertex where the two meet.
      [top, bottom, right, left].forEach(p => extend(...p));
      body += lineEl(top, right); body += lineEl(right, bottom);
      body += lineEl(bottom, left); body += lineEl(left, top);
      body += lineEl(top, bottom, true); // shared long leg, dashed (construction line)

      // Right-angle mark where the shared leg meets the right short leg.
      const rs = 9;
      body += `<path d="M ${rs} 0 L ${rs} ${rs} L 0 ${rs}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;

      const l1p = [8, longPx * 0.62];
      body += textEl(l1p[0], l1p[1], params.leg1, 'start', fontSize);
      extend(...textBoundsBox(l1p[0], l1p[1], 'start', params.leg1, fontSize));

      const l2p = [shortPx * 0.22, -12];
      body += textEl(l2p[0], l2p[1], params.leg2, 'middle', fontSize);
      extend(...textBoundsBox(l2p[0], l2p[1], 'middle', params.leg2, fontSize));

      if (params.caption) {
        const cy = longPx + 26;
        body += textEl(0, cy, params.caption, 'middle', capFontSize, 700);
        extend(...textBoundsBox(0, cy, 'middle', params.caption, capFontSize));
      }

    } else { // mode=diagonals
      const d1Val = numericValue(params.d1), d2Val = numericValue(params.d2);
      const known = [d1Val, d2Val].filter(v => v !== null);
      const refVal = known.length ? Math.max(...known) : 10;
      const scale = maxDim / refVal;
      const d1Px = (d1Val !== null ? d1Val : refVal * 0.85) * scale;
      const d2Px = (d2Val !== null ? d2Val : refVal * 0.6) * scale;
      const crossY = d1Px * 0.38; // asymmetric crossing point - the realistic case, not a rhombus

      const top = [0, 0], bottom = [0, d1Px], right = [d2Px / 2, crossY], left = [-d2Px / 2, crossY];
      [top, bottom, right, left].forEach(p => extend(...p));
      body += lineEl(top, right); body += lineEl(right, bottom);
      body += lineEl(bottom, left); body += lineEl(left, top);
      body += lineEl(top, bottom, true);
      body += lineEl(left, right, true);

      const rs = 9;
      body += `<path d="M ${rs} ${crossY} L ${rs} ${crossY + rs} L 0 ${(crossY + rs).toFixed(1)}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;

      const d1p = [10, d1Px * 0.62];
      body += textEl(d1p[0], d1p[1], params.d1, 'start', fontSize);
      extend(...textBoundsBox(d1p[0], d1p[1], 'start', params.d1, fontSize));

      const d2p = [-d2Px * 0.2, crossY - 14];
      body += textEl(d2p[0], d2p[1], params.d2, 'middle', fontSize);
      extend(...textBoundsBox(d2p[0], d2p[1], 'middle', params.d2, fontSize));

      if (params.caption) {
        const cy = d1Px + 26;
        body += textEl(0, cy, params.caption, 'middle', capFontSize, 700);
        extend(...textBoundsBox(0, cy, 'middle', params.caption, capFontSize));
      }
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

  return { buildKiteAreaSVG };
})();

DiagramRenderer.register('kite_area', KiteAreaDiag.buildKiteAreaSVG);
