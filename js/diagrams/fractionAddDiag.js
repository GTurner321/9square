/* ============================================================
   fractionAddDiag.js
   ------------------------------------------------------------
   Diagram builder for adding two fractions (DF skill 100/102/117/
   118). Reuses the same "equal sectors, shade the numerator's worth"
   visual language as pieChartDiag.js, just drawn twice (each circle
   entirely independent - its own denominator, its own equal wedges)
   with a "+" between them. Always exactly two fractions, always
   proper (never a mixed number going in) - the diagram shows what's
   being added, never the answer.

   Diagram Params format:
     a=<numerator>/<denominator>;b=<numerator>/<denominator>

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const FractionAddDiag = (() => {

  const DEG2RAD = Math.PI / 180;
  const SHADE_FILL = '#E0C877'; // matches the app's own chalk-yellow-dark accent (see pieChartDiag.js)

  function angleToXY(vertex, bearingDeg, radius) {
    const rad = bearingDeg * DEG2RAD;
    return [vertex[0] + radius * Math.sin(rad), vertex[1] - radius * Math.cos(rad)];
  }
  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  // Draws one equal-sector pie, `num` of `den` wedges shaded, centred
  // at `cx` - identical geometry to pieChartDiag.js's plain case,
  // just parameterised by a plain fraction rather than Diagram Params.
  function drawPie(cx, radius, num, den, extend) {
    let body = '';
    for (let i = 0; i < den; i++) {
      const b0 = (360 / den) * i, b1 = (360 / den) * (i + 1);
      const p0 = angleToXY([cx, 0], b0, radius);
      const p1 = angleToXY([cx, 0], b1, radius);
      const largeArcFlag = (b1 - b0) > 180 ? 1 : 0;
      const fill = i < num ? SHADE_FILL : 'none';
      body += `<path d="M ${cx} 0 L ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} Z" fill="${fill}" stroke="#1a1a1a" stroke-width="1.5"/>`;
    }
    extend(cx - radius, -radius, cx + radius, radius);
    return body;
  }

  function buildFractionAddSVG(params, opts = {}) {
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const radius = opts.radius || 62;
    const gapBetween = opts.gapBetween || 70;

    const [aNum, aDen] = params.a.split('/').map(Number);
    const [bNum, bDen] = params.b.split('/').map(Number);

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };

    const cxA = 0, cxB = 2 * radius + gapBetween;
    let body = '';
    body += drawPie(cxA, radius, aNum, aDen, extend);
    body += drawPie(cxB, radius, bNum, bDen, extend);

    // "+" sign, centred in the gap between the two circles.
    const plusCx = (cxA + cxB) / 2, plusArm = 12;
    body += `<line x1="${(plusCx - plusArm).toFixed(1)}" y1="0" x2="${(plusCx + plusArm).toFixed(1)}" y2="0" stroke="#1a1a1a" stroke-width="3"/>`;
    body += `<line x1="${plusCx.toFixed(1)}" y1="${-plusArm}" x2="${plusCx.toFixed(1)}" y2="${plusArm}" stroke="#1a1a1a" stroke-width="3"/>`;
    extend(plusCx - plusArm, -plusArm, plusCx + plusArm, plusArm);

    if (opts.promptText) {
      const columnWidth = 130;
      const lines = wrapText(opts.promptText, columnWidth, promptFontSize);
      const gap = 4;
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

  return { buildFractionAddSVG };
})();

DiagramRenderer.register('fraction_add', FractionAddDiag.buildFractionAddSVG);
