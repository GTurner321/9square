/* ============================================================
   pieChartDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 131/246 (reading and interpreting
   pie charts). Reuses the same "fan of wedges from a centre point"
   geometry as angleSectorsDiag.js's 'point' mode, but draws each
   wedge as a filled/unfilled slice rather than an open arc - a pie
   chart's shading IS the thing being read, so there's no separate
   angle-arc marker here the way the angle-facts diagrams have one.

   Diagram Params format:
     sectors=<deg>:<label>|<deg>:<label>|...
     fill=<comma-separated 0-based wedge indices to shade>
     total=<n>                (optional - a real-world count/amount)
     center=<text>             (optional - label shown at the circle's
                                centre, typically the total, since
                                that's the one spot no wedge occupies)

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const PieChartDiag = (() => {

  const DEG2RAD = Math.PI / 180;
  const SHADE_FILL = '#E0C877'; // matches the app's own chalk-yellow-dark accent

  // Same bearing convention as angleSectorsDiag.js: degrees measured
  // clockwise from straight up.
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
      if (trial.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function buildPieChartSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const centerFontSize = opts.centerFontSize || 15;
    const promptFontSize = opts.promptFontSize || 16;
    const radius = opts.radius || 115;
    const labelRadius = opts.labelRadius || 72;
    const lineHeight = promptFontSize * 1.25;
    const pad = opts.pad || 8;

    const sectorDefs = (params.sectors || '').split('|').filter(Boolean).map(pair => {
      const idx = pair.indexOf(':');
      return { deg: Number(pair.slice(0, idx)), label: pair.slice(idx + 1) };
    });
    const n = sectorDefs.length;
    const fillSet = new Set((params.fill || '').split(',').filter(s => s !== '').map(Number));

    const sumDeg = sectorDefs.reduce((s, d) => s + d.deg, 0);
    if (Math.abs(sumDeg - 360) > 0.6) {
      console.warn(`PieChartDiag: sector degrees sum to ${sumDeg}, expected 360`);
    }

    const vertex = [0, 0];
    const bearings = [0];
    let cumulative = 0;
    sectorDefs.forEach(d => { cumulative += d.deg; bearings.push(cumulative); });

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };
    extend(vertex[0] - radius, vertex[1] - radius, vertex[0] + radius, vertex[1] + radius);

    let body = '';

    // Each wedge is its own closed path (centre -> arc -> centre), so
    // the radial dividing lines between wedges come for free as each
    // wedge's own straight edges - no separate ray-drawing needed,
    // unlike angleSectorsDiag.js's open-arc style.
    for (let i = 0; i < n; i++) {
      const b0 = bearings[i], b1 = bearings[i + 1];
      const sweepDeg = b1 - b0;
      const p0 = angleToXY(vertex, b0, radius);
      const p1 = angleToXY(vertex, b1, radius);
      const largeArcFlag = sweepDeg > 180 ? 1 : 0;
      const fill = fillSet.has(i) ? SHADE_FILL : 'none';
      body += `<path d="M ${vertex[0]} ${vertex[1]} L ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} Z" fill="${fill}" stroke="#1a1a1a" stroke-width="1.5"/>`;

      const labelText = sectorDefs[i].label;
      if (labelText) {
        const midBearing = b0 + sweepDeg / 2;
        const lp = angleToXY(vertex, midBearing, labelRadius);
        body += textEl(lp[0], lp[1], labelText, 'middle', fontSize);
        extend(...textBoundsBox(lp[0], lp[1], 'middle', labelText, fontSize));
      }
    }

    // Centre label (typically the total) - the one spot on a pie
    // chart no wedge boundary passes directly through, so it reads
    // cleanly even with every radial line converging there.
    if (params.center) {
      body += textEl(vertex[0], vertex[1], params.center, 'middle', centerFontSize, 700);
      extend(...textBoundsBox(vertex[0], vertex[1], 'middle', params.center, centerFontSize));
    }

    // Prompt caption above the circle - never collides with the centre
    // label or any wedge, so it's a safe, consistent spot regardless
    // of which wedges are shaded.
    if (opts.promptText) {
      const lines = wrapText(opts.promptText, Math.max(180, bx1 - bx0), promptFontSize);
      const cx = (bx0 + bx1) / 2;
      const gap = 10;
      const blockHeight = lines.length * lineHeight;
      const topY = by0 - gap - blockHeight + promptFontSize * 0.8;
      lines.forEach((line, i) => {
        const y = topY + i * lineHeight;
        body += textEl(cx, y, line, 'middle', promptFontSize, 700);
        extend(...textBoundsBox(cx, y, 'middle', line, promptFontSize));
      });
    }

    const vbX = bx0 - pad, vbY = by0 - pad, vbW = (bx1 - bx0) + 2 * pad, vbH = (by1 - by0) + 2 * pad;
    return `<svg viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  return { buildPieChartSVG };
})();

DiagramRenderer.register('pie_chart', PieChartDiag.buildPieChartSVG);
