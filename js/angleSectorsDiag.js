/* ============================================================
   angleSectorsDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 110 (angles on a straight line /
   around a point / in a right angle). One shared "fan of rays from
   a vertex" engine handles all three - which one is picked is
   entirely determined by `total` (180 / 360 / 90), and every sector
   is drawn at its actual solved angle (the CSV always gives the real
   degree value to draw, even when the label shown is "x", "3x-15",
   a ratio part, etc.) - so the diagram is always roughly correct,
   whatever the label says.

   Diagram Params format (semicolon-delimited, same convention as
   trigPythagDiag.js):
     total=180;sectors=<deg>:<label>|<deg>:<label>|...
   e.g. total=360;sectors=150:5x|120:4x|60:2x|30:x

   Registers itself into DiagramRenderer at the bottom - see
   trigPythagDiag.js for the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const AngleSectorsDiag = (() => {

  const DEG2RAD = Math.PI / 180;

  // Bearing convention throughout this file: degrees measured
  // CLOCKWISE from straight up (12 o'clock) - i.e. compass bearings,
  // not standard maths angles. Chosen because all three modes read
  // more naturally described this way ("start pointing up, sweep
  // clockwise" / "start pointing right, sweep down to pointing up").
  function angleToXY(vertex, bearingDeg, radius) {
    const rad = bearingDeg * DEG2RAD;
    return [vertex[0] + radius * Math.sin(rad), vertex[1] - radius * Math.cos(rad)];
  }

  // Which direction each mode's fan opens, expressed as a starting
  // bearing and a sweep direction (+1 = clockwise, -1 = counter-
  // clockwise) - everything else (which rays get drawn, where the
  // caption goes) follows from these two numbers plus `mode` itself.
  //   line:       270 (west) -> sweeping through 180 (south) -> 90
  //               (east). Fan opens DOWNWARD, so the straight line
  //               itself sits at the top with empty space above it -
  //               that's where the caption goes.
  //   point:      0 (north) -> sweeping clockwise all the way round.
  //   rightAngle: 90 (east) -> sweeping through 45 (NE) -> 0 (north).
  //               Fan fills the upper-right quadrant only.
  const MODE_CONFIG = {
    line: { startBearing: 270, sweepDir: -1 },
    point: { startBearing: 0, sweepDir: 1 },
    rightAngle: { startBearing: 90, sweepDir: -1 }
  };

  function modeForTotal(total) {
    if (Math.abs(total - 180) < 0.5) return 'line';
    if (Math.abs(total - 360) < 0.5) return 'point';
    if (Math.abs(total - 90) < 0.5) return 'rightAngle';
    return 'point'; // fallback: an unrecognised total still draws *something* sensible
  }

  // bearings[0..n] for n sectors - bearings[i] is the ray between
  // sector i-1 and sector i (bearings[0] and bearings[n] are the two
  // outer edges of the whole fan).
  function computeBearings(sectorDegs, startBearing, sweepDir) {
    const bearings = [startBearing];
    let cumulative = 0;
    sectorDegs.forEach(d => {
      cumulative += d;
      bearings.push(startBearing + sweepDir * cumulative);
    });
    return bearings;
  }

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function lineEl(a, b) {
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"/>`;
  }

  function textEl(x, y, text, anchor, fontSize, weight) {
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${fontSize}" font-family="sans-serif"${weight ? ` font-weight="${weight}"` : ''}>${escapeXml(text)}</text>`;
  }

  // Same rough-extent estimate as trigPythagDiag.js's textBoundsBox -
  // doesn't need to be exact, just close enough that a long algebra
  // label ("3x-15") or a wide caption line never gets clipped by the
  // final crop.
  function textBoundsBox(x, y, anchor, text, fontSize) {
    const w = text.length * fontSize * 0.6;
    let x0, x1;
    if (anchor === 'start') { x0 = x; x1 = x + w; }
    else if (anchor === 'end') { x0 = x - w; x1 = x; }
    else { x0 = x - w / 2; x1 = x + w / 2; }
    return [x0, y - fontSize * 0.7, x1, y + fontSize * 0.4];
  }

  // Greedy word-wrap to a pixel width budget - there's no native wrap
  // for SVG <text>, so multi-line captions are built as one <tspan>
  // per line instead (see captionLines below).
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

  function buildAngleSectorsSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 18;           // sector labels
    const promptFontSize = opts.promptFontSize || 16; // caption
    const baseRayLength = opts.rayLength || 130;
    const arcRadius = opts.arcRadius || 32;
    const labelRadius = opts.labelRadius || 62;
    const lineHeight = promptFontSize * 1.25;
    const pad = opts.pad || 8;

    const total = Number(params.total);
    const sectorDefs = (params.sectors || '').split('|').filter(Boolean).map(pair => {
      const idx = pair.indexOf(':');
      return { deg: Number(pair.slice(0, idx)), label: pair.slice(idx + 1) };
    });
    const n = sectorDefs.length;

    // Sanity check only - a mismatch doesn't stop the diagram (the
    // question may still be gettable), but it means either the CSV
    // row's sector degrees don't actually sum to `total`, or `total`
    // itself is wrong, so it's worth a console warning to catch at
    // authoring time rather than only noticing a wonky-looking diagram.
    const sumDeg = sectorDefs.reduce((s, d) => s + d.deg, 0);
    if (Math.abs(sumDeg - total) > 0.6) {
      console.warn(`AngleSectorsDiag: sector degrees sum to ${sumDeg}, expected total=${total}`);
    }

    const mode = modeForTotal(total);
    const cfg = MODE_CONFIG[mode];
    const vertex = [0, 0];
    const bearings = computeBearings(sectorDefs.map(s => s.deg), cfg.startBearing, cfg.sweepDir);

    // Arm length by mode - a full circle of long rays around a point
    // reads as much busier than the same length fanned into a
    // half-disk or quarter-disk, so point/line each get shortened
    // (rightAngle is left at the base length, per feedback that mode
    // was already fine).
    const rayLength = mode === 'point' ? baseRayLength * 0.6
      : mode === 'line' ? baseRayLength * 0.8
      : baseRayLength;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };

    // Each mode's nominal footprint is known exactly in advance (a
    // half-disk / full disk / quarter-disk of radius rayLength), so
    // it's cheaper and tighter to state it directly than to derive it
    // from individually-drawn rays.
    if (mode === 'line') {
      extend(vertex[0] - rayLength, vertex[1], vertex[0] + rayLength, vertex[1] + rayLength);
    } else if (mode === 'point') {
      extend(vertex[0] - rayLength, vertex[1] - rayLength, vertex[0] + rayLength, vertex[1] + rayLength);
    } else { // rightAngle
      extend(vertex[0], vertex[1] - rayLength, vertex[0] + rayLength, vertex[1]);
    }

    let body = '';

    // --- Outer boundary + rays (which ones need drawing at all
    //     differs per mode - see the comment on each branch). ---
    if (mode === 'line') {
      // bearings[0] and bearings[n] are opposite ends of ONE straight
      // line (270 and 90 are collinear), so that's a single line, not
      // two separate rays.
      body += lineEl(angleToXY(vertex, bearings[0], rayLength), angleToXY(vertex, bearings[n], rayLength));
      for (let i = 1; i < n; i++) {
        body += lineEl(vertex, angleToXY(vertex, bearings[i], rayLength));
      }
    } else if (mode === 'point') {
      // All n boundaries are distinct rays (bearings[n] wraps back to
      // bearings[0], so it's the same ray - only draw 0..n-1).
      for (let i = 0; i < n; i++) {
        body += lineEl(vertex, angleToXY(vertex, bearings[i], rayLength));
      }
      body += `<circle cx="${vertex[0]}" cy="${vertex[1]}" r="3" fill="#1a1a1a"/>`;
    } else { // rightAngle
      // Unlike "line", the two outer edges here (east and north) are
      // perpendicular, not collinear - both need their own ray.
      for (let i = 0; i <= n; i++) {
        body += lineEl(vertex, angleToXY(vertex, bearings[i], rayLength));
      }
      const rs = 14; // right-angle bracket, matching trigPythagDiag.js's marker style
      body += `<path d="M ${(vertex[0] + rs).toFixed(1)} ${vertex[1].toFixed(1)} L ${(vertex[0] + rs).toFixed(1)} ${(vertex[1] - rs).toFixed(1)} L ${vertex[0].toFixed(1)} ${(vertex[1] - rs).toFixed(1)}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;
    }

    // --- Sector arcs + labels. ---
    for (let i = 0; i < n; i++) {
      const b0 = bearings[i], b1 = bearings[i + 1];
      const sweepDeg = Math.abs(b1 - b0);
      const p1 = angleToXY(vertex, b0, arcRadius);
      const p2 = angleToXY(vertex, b1, arcRadius);
      const largeArcFlag = sweepDeg > 180 ? 1 : 0;
      const sweepFlag = cfg.sweepDir > 0 ? 1 : 0; // increasing bearing = clockwise on screen = SVG sweep-flag 1
      body += `<path d="M ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} ${sweepFlag} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="#1e5f5f" stroke-width="1.5"/>`;
      // Endpoints alone don't bound the arc for a wide sweep (up to
      // 235° in this app's actual data) - it can bulge well past
      // either endpoint, so extend the full circle it's drawn on.
      extend(vertex[0] - arcRadius, vertex[1] - arcRadius, vertex[0] + arcRadius, vertex[1] + arcRadius);

      const midBearing = b0 + (b1 - b0) / 2;
      const lp = angleToXY(vertex, midBearing, labelRadius);
      const labelText = sectorDefs[i].label;
      body += textEl(lp[0], lp[1], labelText, 'middle', fontSize);
      extend(...textBoundsBox(lp[0], lp[1], 'middle', labelText, fontSize));
    }

    // --- Prompt caption, embedded in the diagram itself, always to
    //     the left as a centred block (one shared placement rule
    //     across every mode, rather than mode-dependent). ---
    if (opts.promptText) {
      const columnWidth = 150;
      const lines = wrapText(opts.promptText, columnWidth, promptFontSize);
      const gap = 14; // buffer between the caption column and the diagram
      const blockHeight = lines.length * lineHeight;
      const cy = (by0 + by1) / 2;
      const startY = cy - blockHeight / 2 + promptFontSize * 0.8;
      // Centred as a block (equal-length lines share one centre x),
      // not right-justified against the diagram's edge - a ragged
      // left edge from anchor="end" was reading as accidental
      // right-justification when line lengths varied.
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

  return { buildAngleSectorsSVG, modeForTotal };
})();

DiagramRenderer.register('angle_sectors', AngleSectorsDiag.buildAngleSectorsSVG);
