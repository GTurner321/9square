/* ============================================================
   triangleGeneralDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 465/466 (sine rule, cosine rule).
   Unlike trigPythagDiag.js (which only ever draws a RIGHT triangle),
   this builds a general triangle from whichever combination of
   sides/angles the question actually gives - always solving for
   every unlabelled value first so the picture is genuinely to scale,
   then displaying only whatever label text each slot was given
   (a real value, an "x"/"y" placeholder, or nothing).

   Standard convention throughout: vertex X's opposite side is
   lowercase x (side a is opposite angle A, etc.).

   Diagram Params format - `mode` picks the construction, every
   side/angle slot is independently labelled via sideA/sideB/sideC
   and angleA/angleB/angleC:

     mode=label
       A fixed illustrative triangle - no construction inputs needed,
       just shows all six standard labels (a,b,c,A,B,C) at their
       true positions. For the "which side pairs with which angle"
       and formula-recall questions, where nothing should be solved.

     mode=sas
       One angle real (the "hub"), the two sides adjacent to it used
       to construct - the third side and any other angle are always
       solved for exactly (law of cosines / sine rule) regardless of
       whether that slot is numeric or a placeholder like "x". An
       algebraic side (e.g. "x+2") falls back to a decorative
       construction value the same way non-numeric values do
       elsewhere in this app - only the DISPLAYED label is literal.

     mode=sss
       All three sides real - one angle solved via the cosine rule
       and displayed at whichever slot has a label.

     mode=asa
       Two angles real, one side real - crucially the given side is
       OPPOSITE one of the two given angles (not between them, i.e.
       genuinely AAS), so the base needed for construction is solved
       via the sine rule first, then built with the same exact
       construction as polygonAnglesDiag.js's triangle.

     mode=ssa;case=acute|obtuse
       The ambiguous case: one angle, its own adjacent side, and the
       OPPOSITE side, all real. Two triangles can satisfy this (a
       genuine quadratic with two positive roots) - `case` picks
       which one to draw by classifying each root's resulting angle B.
       If only one root exists (not actually ambiguous for this
       particular data), that one is used regardless of `case`.

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const TriangleGeneralDiag = (() => {

  const DEG2RAD = Math.PI / 180;

  // Internal geometry in a standard (CCW-from-east, Y-up) frame -
  // same convention as parallelLinesDiag.js/polygonAnglesDiag.js -
  // converted to SVG (Y-down) only at the point coordinates are emitted.
  function direction(angleDeg) {
    const rad = angleDeg * DEG2RAD;
    return [Math.cos(rad), Math.sin(rad)];
  }
  function addScaled(P, dir, len) { return [P[0] + dir[0] * len, P[1] + dir[1] * len]; }
  function toSvg(P) { return [P[0], -P[1]]; }
  function normalize(v) { const m = Math.hypot(v[0], v[1]); return [v[0] / m, v[1] / m]; }
  function dist(P, Q) { return Math.hypot(Q[0] - P[0], Q[1] - P[1]); }
  function angleBetween(u, v) {
    const dot = u[0] * v[0] + u[1] * v[1];
    return Math.acos(Math.max(-1, Math.min(1, dot))) / DEG2RAD;
  }

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lineEl(a, b) {
    const A = toSvg(a), B = toSvg(b);
    return `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"/>`;
  }
  function arcPath(V, p1, p2, r, largeArcFlag, sweepFlag) {
    const s1 = toSvg(p1), s2 = toSvg(p2);
    return `<path d="M ${s1[0].toFixed(1)} ${s1[1].toFixed(1)} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${s2[0].toFixed(1)} ${s2[1].toFixed(1)}" fill="none" stroke="#1e5f5f" stroke-width="1.5"/>`;
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
  const KNOWN_UNITS = ['cm²', 'cm', 'm²', 'm', 'mm²', 'mm', '°', '%'];
  function numericValue(label) {
    if (label === undefined || label === null) return null;
    const s = String(label).trim();
    const m = s.match(/^-?\d+(\.\d+)?/);
    if (!m) return null;
    const rest = s.slice(m[0].length).trim();
    if (rest !== '' && !KNOWN_UNITS.includes(rest)) return null;
    return parseFloat(m[0]);
  }

  // Exact ASA construction (same as polygonAnglesDiag.js): given base
  // P->Q and the interior angles at P and Q, returns the third vertex.
  function triangleThirdVertex(P, Q, angleP, angleQ, side) {
    const dx = Q[0] - P[0], dy = Q[1] - P[1];
    const baseLen = Math.hypot(dx, dy);
    const baseAngle = Math.atan2(dy, dx);
    const angleR = 180 - angleP - angleQ;
    const t = baseLen * Math.sin(angleQ * DEG2RAD) / Math.sin(angleR * DEG2RAD);
    const lx = t * Math.cos(angleP * DEG2RAD);
    const ly = side * t * Math.sin(angleP * DEG2RAD);
    return [
      P[0] + lx * Math.cos(baseAngle) - ly * Math.sin(baseAngle),
      P[1] + lx * Math.sin(baseAngle) + ly * Math.cos(baseAngle)
    ];
  }

  function buildTriangleGeneralSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const baseLen = opts.baseLen || 130;
    const arcRadius = opts.arcRadius || 14;
    const vertexLabelR = opts.vertexLabelR || 18;
    const sideLabelGap = opts.sideLabelGap || 16;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };
    const extendSvg = (P) => extend(...toSvg(P));

    // --- Resolve vertices A, B, C for whichever mode was requested. ---
    let A, B, C;

    if (params.mode === 'label') {
      A = [0, 0]; B = [baseLen, 0];
      C = triangleThirdVertex(A, B, 50, 65, +1);

    } else if (params.mode === 'sas') {
      // Whichever angle slot is numeric is the "hub" vertex; the two
      // OTHER sides (not opposite the hub) are its adjacent sides.
      const angleSlots = { A: numericValue(params.angleA), B: numericValue(params.angleB), C: numericValue(params.angleC) };
      const hub = Object.keys(angleSlots).find(k => angleSlots[k] !== null);
      const hubAngle = angleSlots[hub];
      const sideVal = (letter) => {
        const raw = params['side' + letter];
        const v = numericValue(raw);
        return v !== null ? v : 6; // decorative fallback for an algebraic side (e.g. "x", "x+2")
      };
      // The two non-hub vertices, X and Y - crucially, the segment
      // from hub to X is side Y (opposite Y, i.e. it doesn't touch Y),
      // NOT side X. Assigning sideVal(X) to the hub-to-X distance
      // would place both far vertices at each other's given lengths.
      const [X, Y] = ['A', 'B', 'C'].filter(l => l !== hub);
      const valForX = sideVal(Y), valForY = sideVal(X);
      const scale = baseLen / Math.max(valForX, valForY);
      const lenToX = valForX * scale, lenToY = valForY * scale;

      const hubPt = [0, 0];
      const pX = addScaled(hubPt, direction(0), lenToX);
      const pY = addScaled(hubPt, direction(hubAngle), lenToY);
      const verts = { [hub]: hubPt, [X]: pX, [Y]: pY };
      A = verts.A; B = verts.B; C = verts.C;

    } else if (params.mode === 'sss') {
      const aVal = numericValue(params.sideA), bVal = numericValue(params.sideB), cVal = numericValue(params.sideC);
      const scale = baseLen / Math.max(aVal, bVal, cVal);
      const a = aVal * scale, b = bVal * scale, c = cVal * scale;
      // cosA = (b^2+c^2-a^2)/(2bc)
      const angleA = Math.acos((b * b + c * c - a * a) / (2 * b * c)) / DEG2RAD;
      A = [0, 0]; B = [c, 0];
      C = addScaled(A, direction(angleA), b);

    } else if (params.mode === 'asa') {
      const angleAVal = numericValue(params.angleA), angleBVal = numericValue(params.angleB);
      const sideAVal = numericValue(params.sideA);
      const angleC = 180 - angleAVal - angleBVal;
      // Sine rule: side c (the base, A-to-B) from the given side a (opposite A).
      const cVal = sideAVal * Math.sin(angleC * DEG2RAD) / Math.sin(angleAVal * DEG2RAD);
      const scale = baseLen / cVal;
      A = [0, 0]; B = [cVal * scale, 0];
      C = triangleThirdVertex(A, B, angleAVal, angleBVal, +1);

    } else { // ssa
      const aVal = numericValue(params.sideA), bVal = numericValue(params.sideB), angleAVal = numericValue(params.angleA);
      const scale = baseLen / Math.max(aVal, bVal);
      const a = aVal * scale, b = bVal * scale;
      // A=[0,0], C=[b,0] (side b along the x-axis); B on ray from A at
      // angle A from AC, distance t=side c, satisfying |B-C|=a - a
      // quadratic in t with up to two positive roots (the ambiguous case).
      const rad = angleAVal * DEG2RAD;
      const p = -2 * b * Math.cos(rad), q = b * b - a * a;
      const disc = p * p - 4 * q;
      const roots = disc >= 0
        ? [(-p + Math.sqrt(disc)) / 2, (-p - Math.sqrt(disc)) / 2].filter(t => t > 1e-6)
        : [];
      A = [0, 0]; C = [b, 0];
      const candidates = roots.map(t => {
        const Bpt = addScaled(A, direction(angleAVal), t);
        const dBA = normalize([A[0] - Bpt[0], A[1] - Bpt[1]]);
        const dBC = normalize([C[0] - Bpt[0], C[1] - Bpt[1]]);
        const angleB = angleBetween(dBA, dBC);
        return { Bpt, angleB };
      });
      const wanted = params.case === 'obtuse' ? candidates.find(c => c.angleB > 90) : candidates.find(c => c.angleB < 90);
      B = (wanted || candidates[0]).Bpt;
    }

    let body = '';

    // --- Outline. ---
    body += lineEl(A, B); body += lineEl(B, C); body += lineEl(C, A);
    [A, B, C].forEach(extendSvg);

    // --- Vertex letters, placed just outside each vertex along its
    //     own outward bisector (away from the triangle's centroid). ---
    const centroid = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
    [['A', A], ['B', B], ['C', C]].forEach(([letter, V]) => {
      const outward = normalize([V[0] - centroid[0], V[1] - centroid[1]]);
      const lp = addScaled(V, outward, vertexLabelR);
      body += textEl(lp, letter, 'middle', fontSize, 700);
      extend(...textBoundsBox(lp, 'middle', letter, fontSize));
    });

    // --- Angle arcs + labels (only where a label was actually given). ---
    const angleLabels = { A: params.angleA, B: params.angleB, C: params.angleC };
    [['A', A, B, C], ['B', B, C, A], ['C', C, A, B]].forEach(([letter, V, N1, N2]) => {
      const label = angleLabels[letter];
      if (label === undefined) return;
      const d1 = normalize([N1[0] - V[0], N1[1] - V[1]]);
      const d2 = normalize([N2[0] - V[0], N2[1] - V[1]]);
      const p1 = addScaled(V, d1, arcRadius), p2 = addScaled(V, d2, arcRadius);
      const sweepDeg = angleBetween(d1, d2);
      const sweepFlag = ((d1[0] * d2[1] - d1[1] * d2[0]) > 0) ? 0 : 1;
      body += arcPath(V, p1, p2, arcRadius, sweepDeg > 180 ? 1 : 0, sweepFlag);
      const bis = normalize([d1[0] + d2[0], d1[1] + d2[1]]);
      const lp = addScaled(V, bis, arcRadius + 12);
      body += textEl(lp, label, 'middle', fontSize);
      extend(...textBoundsBox(lp, 'middle', label, fontSize));
    });

    // --- Side labels, at each side's midpoint, offset outward
    //     (away from the opposite vertex). ---
    const sideLabels = { A: params.sideA, B: params.sideB, C: params.sideC }; // side X is opposite vertex X
    [['A', B, C, A], ['B', C, A, B], ['C', A, B, C]].forEach(([letter, P, Q, opp]) => {
      const label = sideLabels[letter];
      if (label === undefined) return;
      const mid = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
      const outward = normalize([mid[0] - opp[0], mid[1] - opp[1]]);
      const lp = addScaled(mid, outward, sideLabelGap);
      body += textEl(lp, label, 'middle', fontSize);
      extend(...textBoundsBox(lp, 'middle', label, fontSize));
    });

    // --- Prompt caption, left column - same placement as every other
    //     diagram type in this app. ---
    if (opts.promptText) {
      const columnWidth = 130;
      const lines = wrapText(opts.promptText, columnWidth, promptFontSize);
      const gap = 8;
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

  return { buildTriangleGeneralSVG };
})();

DiagramRenderer.register('triangle_general', TriangleGeneralDiag.buildTriangleGeneralSVG);
