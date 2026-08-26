/* ============================================================
   parallelLinesDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 262 (angle facts with parallel lines
   and a transversal). Two horizontal lines (T = top, B = bottom), one
   transversal crossing both. Every angle at either crossing is
   identified by a slot: T|B for which line, NE|SE|SW|NW for which of
   the four angles at that crossing (matching real screen position).

   The geometry never needs a per-pair-type lookup table (corresponding
   / alternate / co-interior / vertically opposite): every angle at
   both crossings reduces to one of two values, theta or 180-theta,
   where theta is whatever the transversal's own angle turns out to
   be. NE and SW always hold theta; NW and SE always hold 180-theta.
   Solve for theta from whichever slot is "given", then read off
   whichever slot is "find" via its own theta/180-theta role - this
   reproduces every relationship (corresponding: same letter -> same
   role -> equal; alternate: opposite-role letters at different lines
   -> equal; co-interior: opposite-role letters -> sum to 180;
   vertically opposite: opposite-role letters at the SAME line ->
   equal) without hardcoding which pair is which.

   Diagram Params format:
     given=<slot>:<deg>;find=<slot>[;reveal=true]
       reveal=true labels `find` with its real computed value instead
       of "x" - for "name this angle pair" questions, where both
       numbers being visible is the point rather than something to
       solve for.
     mode=verify;given=<slot>:<deg>|<slot>:<deg>
       For "are these lines parallel?" questions - two independent
       given values, each labelled with exactly what was given (no
       derivation, since the two might genuinely be inconsistent).
       Drawn at a fixed decorative slope rather than derived from the
       data, and WITHOUT the parallel tick-marks the normal mode
       shows, since claiming parallel would give the answer away.

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const ParallelLinesDiag = (() => {

  const DEG2RAD = Math.PI / 180;

  // Internal geometry is built in a standard (CCW-from-east, Y-up)
  // frame, since the theta/180-theta derivation below reads far more
  // naturally that way - SVG's Y-down convention is applied only at
  // the point of emitting coordinates, via toSvg().
  function direction(angleDeg) {
    const rad = angleDeg * DEG2RAD;
    return [Math.cos(rad), Math.sin(rad)];
  }
  function addScaled(P, dir, len) { return [P[0] + dir[0] * len, P[1] + dir[1] * len]; }
  function toSvg(P) { return [P[0], -P[1]]; }

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lineEl(a, b) {
    const A = toSvg(a), B = toSvg(b);
    return `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"/>`;
  }
  function textEl(P, text, anchor, fontSize, weight) {
    const S = toSvg(P);
    return `<text x="${S[0].toFixed(1)}" y="${S[1].toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${fontSize}" font-family="sans-serif"${weight ? ` font-weight="${weight}"` : ''}>${escapeXml(text)}</text>`;
  }
  function textBoundsBox(P, anchor, text, fontSize) {
    const [x, y] = toSvg(P);
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

  function isPrimaryCorner(corner) { return corner === 'NE' || corner === 'SW'; }

  // Bisector angle (in the internal frame) of the named corner's
  // angular region at a crossing whose transversal ray sits at `theta`.
  function cornerBisector(corner, theta) {
    switch (corner) {
      case 'NE': return theta / 2;
      case 'NW': return theta / 2 + 90;
      case 'SW': return theta / 2 + 180;
      case 'SE': return theta / 2 + 270;
    }
  }

  function parseSlot(slot) {
    return { line: slot[0], corner: slot.slice(1) }; // 'T'/'B', 'NE'/'SE'/'SW'/'NW'
  }

  function buildParallelLinesSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const vGap = opts.vGap || 65;
    const halfWidth = opts.halfWidth || 95;
    const overhang = opts.overhang || 42;
    const arcRadius = opts.arcRadius || 28;
    const labelGap = 18;

    const isVerify = params.mode === 'verify';
    const crossingT = [0, vGap];

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };
    const extendSvg = (P) => extend(...toSvg(P));

    let body = '';

    // Both crossings lie on ONE straight transversal at angle theta -
    // crossingB's position is derived from crossingT + theta, not
    // independently placed, so the two horizontal lines' crossings
    // are genuinely collinear (this is what makes drawing the
    // transversal as a single unbroken line below correct, rather
    // than two independently-angled segments that only coincidentally
    // looked similar).
    function crossingsOnTransversal(theta) {
      const crossingT = [0, vGap];
      const t = (2 * vGap) / Math.sin(theta * DEG2RAD);
      const crossingB = addScaled(crossingT, direction(theta + 180), t);
      return { T: crossingT, B: crossingB };
    }

    // Draws one crossing's horizontal line (+ optional parallel tick).
    function drawHorizontalLine(crossing, tickMark) {
      const hLeft = addScaled(crossing, direction(180), halfWidth);
      const hRight = addScaled(crossing, direction(0), halfWidth);
      body += lineEl(hLeft, hRight);
      extendSvg(hLeft); extendSvg(hRight);

      if (tickMark) {
        // Standard single-arrowhead parallel-line tick, partway along
        // the horizontal line.
        const tickCenter = addScaled(crossing, direction(0), halfWidth * 0.45);
        const a = addScaled(tickCenter, direction(60), 7);
        const b = addScaled(tickCenter, direction(-60), 7);
        body += lineEl(tickCenter, a);
        body += lineEl(tickCenter, b);
      }
    }

    // Draws the transversal as ONE unbroken line spanning both
    // crossings, with overhang only at its two outer ends - not one
    // segment per crossing (which is what was producing a visible
    // split down the middle).
    function drawTransversal(theta, crossingT, crossingB) {
      const tEnd1 = addScaled(crossingT, direction(theta), overhang);
      const tEnd2 = addScaled(crossingB, direction(theta + 180), overhang);
      body += lineEl(tEnd1, tEnd2);
      extendSvg(tEnd1); extendSvg(tEnd2);
    }

    // Draws the small arc + label for one named corner at a crossing.
    function labelCorner(crossing, corner, theta, text) {
      const bis = cornerBisector(corner, theta);

      // Arc endpoints are the two rays bounding this corner's region.
      let a0, a1;
      switch (corner) {
        case 'NE': a0 = 0; a1 = theta; break;
        case 'NW': a0 = theta; a1 = 180; break;
        case 'SW': a0 = 180; a1 = theta + 180; break;
        case 'SE': a0 = theta + 180; a1 = 360; break;
      }
      const q1 = addScaled(crossing, direction(a0), arcRadius);
      const q2 = addScaled(crossing, direction(a1), arcRadius);
      const sq1 = toSvg(q1), sq2 = toSvg(q2);
      const sweepDeg = a1 - a0;
      const largeArcFlag = sweepDeg > 180 ? 1 : 0;
      // toSvg negates Y, which reverses the visual winding direction,
      // so the SVG sweep-flag is the opposite of the "increasing
      // angle" sweep-flag it would be in the internal frame.
      body += `<path d="M ${sq1[0].toFixed(1)} ${sq1[1].toFixed(1)} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} 0 ${sq2[0].toFixed(1)} ${sq2[1].toFixed(1)}" fill="none" stroke="#1e5f5f" stroke-width="1.5"/>`;

      const labelPt = addScaled(crossing, direction(bis), arcRadius + labelGap);
      body += textEl(labelPt, text, 'middle', fontSize);
      extend(...textBoundsBox(labelPt, 'middle', text, fontSize));
    }

    if (isVerify) {
      const decorativeTheta = 58;
      const parts = (params.given || '').split('|').map(s => {
        const [slot, deg] = s.split(':');
        return { ...parseSlot(slot), deg };
      });
      const { T: crossingT, B: crossingB } = crossingsOnTransversal(decorativeTheta);
      const crossingByLine = { T: crossingT, B: crossingB };
      drawHorizontalLine(crossingT, false);
      drawHorizontalLine(crossingB, false);
      drawTransversal(decorativeTheta, crossingT, crossingB);
      parts.forEach(p => {
        labelCorner(crossingByLine[p.line], p.corner, decorativeTheta, `${p.deg}°`);
      });
    } else {
      const given = parseSlot((params.given || '').split(':')[0]);
      const givenDeg = Number((params.given || '').split(':')[1]);
      const find = parseSlot(params.find);

      const theta = isPrimaryCorner(given.corner) ? givenDeg : 180 - givenDeg;
      const findDeg = isPrimaryCorner(find.corner) ? theta : 180 - theta;

      const { T: crossingT, B: crossingB } = crossingsOnTransversal(theta);
      const crossingByLine = { T: crossingT, B: crossingB };
      drawHorizontalLine(crossingT, true);
      drawHorizontalLine(crossingB, true);
      drawTransversal(theta, crossingT, crossingB);

      labelCorner(crossingByLine[given.line], given.corner, theta, `${givenDeg}°`);
      const findLabel = params.reveal === 'true' ? `${Math.round(findDeg * 10) / 10}°` : 'x';
      labelCorner(crossingByLine[find.line], find.corner, theta, findLabel);
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
        body += `<text x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${promptFontSize}" font-family="sans-serif" font-weight="700">${escapeXml(line)}</text>`;
        const w = line.length * promptFontSize * 0.6;
        extend(cx - w / 2, y - promptFontSize * 0.7, cx + w / 2, y + promptFontSize * 0.4);
      });
    }

    const vbX = bx0 - pad, vbY = by0 - pad, vbW = (bx1 - bx0) + 2 * pad, vbH = (by1 - by0) + 2 * pad;
    return `<svg viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  return { buildParallelLinesSVG };
})();

DiagramRenderer.register('parallel_lines', ParallelLinesDiag.buildParallelLinesSVG);
