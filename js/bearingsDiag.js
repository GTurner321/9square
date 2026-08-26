/* ============================================================
   bearingsDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 264 (bearings). Two modes, chosen by
   which params are present:

     bearing=<deg>;from=<label>;to=<label>[;parallel=true]
       Two-point mode. Draws point "from" and point "to" joined by a
       line, a north arrow at each, an arc+label at "from" showing
       the GIVEN bearing, and an arc+label at "to" showing the actual
       reciprocal bearing geometrically (roughly correct, same
       philosophy as every other diagram type here) but labelled "x"
       rather than its numeric value, since that's what's being
       asked. `parallel=true` adds a small tick mark to both north
       lines - the standard way to notate "these two lines are
       parallel" - for the specific sub-skill where seeing that IS
       the point (justifying the ±180° rule via co-interior angles).

     bearing=<deg>;label=<compass name>
       Single-ray mode. One point, a north arrow, and a second ray at
       the given bearing labelled with the compass name (N/SE/S/NW/
       etc.) rather than the numeric bearing, since the number is the
       answer.

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const BearingsDiag = (() => {

  const DEG2RAD = Math.PI / 180;

  // Same bearing convention as angleSectorsDiag.js/pieChartDiag.js:
  // degrees measured clockwise from straight up.
  function angleToXY(vertex, bearingDeg, radius) {
    const rad = bearingDeg * DEG2RAD;
    return [vertex[0] + radius * Math.sin(rad), vertex[1] - radius * Math.cos(rad)];
  }

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

  // Arrowhead as a small filled triangle at point `tip`, pointing in
  // the direction of travel implied by bearing `bearingDeg`.
  function arrowHead(tip, bearingDeg, size) {
    const back = angleToXY(tip, bearingDeg + 180, size);
    const left = angleToXY(back, bearingDeg - 90, size * 0.4);
    const right = angleToXY(back, bearingDeg + 90, size * 0.4);
    return `<polygon points="${tip[0].toFixed(1)},${tip[1].toFixed(1)} ${left[0].toFixed(1)},${left[1].toFixed(1)} ${right[0].toFixed(1)},${right[1].toFixed(1)}" fill="#1a1a1a"/>`;
  }

  function buildBearingsSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;

    const isTwoPoint = params.from !== undefined && params.to !== undefined;
    const bearingDeg = Number(params.bearing);
    const bearingLabel = `${params.bearing}°`;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };

    let body = '';

    if (isTwoPoint) {
      const lineLength = opts.lineLength || 150;
      const northLength = opts.northLength || 65;
      const arcRadius = opts.arcRadius || 34;
      const labelGap = 18;

      const from = [0, 0];
      const to = angleToXY(from, bearingDeg, lineLength);
      extend(from[0], from[1]);
      extend(to[0], to[1]);

      // Main line between the two points.
      body += lineEl(from, to, false);

      // North arrows at both points - seeing both is what makes the
      // ±180° reciprocal-bearing rule visually obvious, not just a
      // rule to memorise, so both are drawn regardless of `parallel`.
      const fromNorthTip = angleToXY(from, 0, northLength);
      const toNorthTip = angleToXY(to, 0, northLength);
      body += lineEl(from, fromNorthTip, false);
      body += lineEl(to, toNorthTip, false);
      body += arrowHead(fromNorthTip, 0, 9);
      body += arrowHead(toNorthTip, 0, 9);
      extend(...fromNorthTip);
      extend(...toNorthTip);
      body += textEl(fromNorthTip[0], fromNorthTip[1] - 10, 'N', 'middle', fontSize);
      body += textEl(toNorthTip[0], toNorthTip[1] - 10, 'N', 'middle', fontSize);
      extend(...textBoundsBox(fromNorthTip[0], fromNorthTip[1] - 10, 'middle', 'N', fontSize));
      extend(...textBoundsBox(toNorthTip[0], toNorthTip[1] - 10, 'middle', 'N', fontSize));

      // Given bearing, arc + label at "from" (north -> line, sweeping
      // through whichever side the actual bearing lies on).
      const p1 = angleToXY(from, 0, arcRadius);
      const p2 = angleToXY(from, bearingDeg, arcRadius);
      const largeArc1 = bearingDeg > 180 ? 1 : 0;
      body += `<path d="M ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} A ${arcRadius} ${arcRadius} 0 ${largeArc1} 1 ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="#1e5f5f" stroke-width="1.5"/>`;
      const fromLabelPt = angleToXY(from, bearingDeg / 2, arcRadius + labelGap);
      body += textEl(fromLabelPt[0], fromLabelPt[1], bearingLabel, 'middle', fontSize);
      extend(...textBoundsBox(fromLabelPt[0], fromLabelPt[1], 'middle', bearingLabel, fontSize));

      // Unknown reciprocal bearing at "to" - drawn at its true
      // (correct) angle, same as every other unknown in this app's
      // diagrams, but labelled "x" rather than the numeric answer.
      const reciprocal = (bearingDeg + 180) % 360;
      const backBearing = (bearingDeg + 180) % 360; // direction from "to" back toward "from"
      const q1 = angleToXY(to, 0, arcRadius);
      const q2 = angleToXY(to, backBearing, arcRadius);
      const largeArc2 = reciprocal > 180 ? 1 : 0;
      body += `<path d="M ${q1[0].toFixed(1)} ${q1[1].toFixed(1)} A ${arcRadius} ${arcRadius} 0 ${largeArc2} 1 ${q2[0].toFixed(1)} ${q2[1].toFixed(1)}" fill="none" stroke="#1e5f5f" stroke-width="1.5"/>`;
      const toLabelPt = angleToXY(to, backBearing / 2, arcRadius + labelGap);
      body += textEl(toLabelPt[0], toLabelPt[1], 'x', 'middle', fontSize);
      extend(...textBoundsBox(toLabelPt[0], toLabelPt[1], 'middle', 'x', fontSize));

      // Point labels (A/B, D/C, etc.), offset clear of the line and arrows.
      const fromLabelDir = (bearingDeg + 180 + 30) % 360;
      const toLabelDir = (backBearing + 180 + 30) % 360;
      const fromNamePt = angleToXY(from, fromLabelDir, 16);
      const toNamePt = angleToXY(to, toLabelDir, 16);
      body += textEl(fromNamePt[0], fromNamePt[1], params.from, 'middle', fontSize, 700);
      body += textEl(toNamePt[0], toNamePt[1], params.to, 'middle', fontSize, 700);
      extend(...textBoundsBox(fromNamePt[0], fromNamePt[1], 'middle', params.from, fontSize));
      extend(...textBoundsBox(toNamePt[0], toNamePt[1], 'middle', params.to, fontSize));

    } else {
      // Single-ray compass mode.
      const rayLength = opts.rayLength || 110;
      const arcRadius = opts.arcRadius || 34;
      const labelGap = 18;

      const vertex = [0, 0];
      extend(vertex[0], vertex[1]);

      const northTip = angleToXY(vertex, 0, rayLength);
      const rayTip = angleToXY(vertex, bearingDeg, rayLength);
      body += lineEl(vertex, northTip, false);
      body += lineEl(vertex, rayTip, false);
      body += arrowHead(northTip, 0, 9);
      body += arrowHead(rayTip, bearingDeg, 9);
      extend(...northTip);
      extend(...rayTip);

      body += textEl(northTip[0], northTip[1] - 10, 'N', 'middle', fontSize);
      extend(...textBoundsBox(northTip[0], northTip[1] - 10, 'middle', 'N', fontSize));

      if (bearingDeg > 0.5) { // no separate arc needed when the ray IS north
        const p1 = angleToXY(vertex, 0, arcRadius);
        const p2 = angleToXY(vertex, bearingDeg, arcRadius);
        const largeArc = bearingDeg > 180 ? 1 : 0;
        body += `<path d="M ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="#1e5f5f" stroke-width="1.5"/>`;
      }

      // Labelled with the compass direction name, not the numeric
      // bearing - the number is the answer being asked for.
      const rayLabelPt = angleToXY(vertex, bearingDeg, rayLength + labelGap);
      body += textEl(rayLabelPt[0], rayLabelPt[1], params.label, 'middle', fontSize, 700);
      extend(...textBoundsBox(rayLabelPt[0], rayLabelPt[1], 'middle', params.label, fontSize));
    }

    // Prompt caption to the left, as a centred block - same
    // placement rule as every other diagram type in this app. (The
    // previous below-diagram placement mixed fontSize into its first
    // line's vertical offset instead of promptFontSize, which is what
    // produced the uneven line spacing - this shared block sidesteps
    // that entirely rather than patching it.)
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

  return { buildBearingsSVG };
})();

DiagramRenderer.register('bearings', BearingsDiag.buildBearingsSVG);
