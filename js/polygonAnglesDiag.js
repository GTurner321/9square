/* ============================================================
   polygonAnglesDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 149/151 (angle sum in triangles and
   quadrilaterals), plus the parallelogram/rhombus/kite angle-fact
   rows of DF 262.

   Two exact constructions, both verified numerically (zero error)
   against every angle set this app currently uses:

   - Triangle: standard ASA construction (a ray from each of two base
     vertices at its own interior angle, intersected) - the three
     given angles fully and rigidly determine the triangle.

   - Quadrilateral (also used for parallelogram/rhombus/kite - the
     geometry is identical, "shape" is purely descriptive): a
     quadrilateral is NOT rigidly determined by its four angles alone
     (one degree of freedom remains even once all four are fixed), so
     it's built as two ASA triangles sharing the diagonal v0-v2, with
     vertex 0's angle split between them at the midpoint of whatever
     range keeps both triangles' angles positive. A naive fixed 50/50
     split can land outside that range and produce a self-intersecting
     shape for lopsided angle sets - verified against this app's
     actual rows, including a 65/65/80/150 kite where a naive split
     fails but the range-midpoint split doesn't.

   Trapezium is a separate, simpler, dedicated construction (a base
   and one leg only) rather than going through the generic
   quadrilateral path, since a trapezium's defining property -
   genuinely parallel sides - isn't guaranteed by the angle-only
   construction above, and the DF262 trapezium question only ever
   concerns one leg's two angles anyway.

   Diagram Params format:
     shape=triangle|quadrilateral|parallelogram|rhombus|kite
     angles=<deg>:<label>|<deg>:<label>|...   (3 or 4, going round the
                                                shape in vertex order)
     extend=<vertexIndex>:<both|next>          (optional)
       'both' extends BOTH sides meeting at that vertex past it,
       exposing the angle vertically opposite the interior one.
       'next' extends just the incoming side (from the previous
       vertex) past this vertex, exposing the adjacent exterior angle.
     exterior=<vertexIndex>:<deg>:<label>      (required if extend
                                                given - the value shown
                                                at the exposed angle)

     shape=trapezium
     given=<deg>:<label>;find=<deg>:<label>   (the one leg's two
                                                co-interior angles -
                                                the other leg is fixed/
                                                decorative, since it's
                                                never part of the
                                                question)

   Registers itself into DiagramRenderer under 'polygon_angles' (the
   CSV's Diagram Type value - `shape=` inside Diagram Params picks the
   specific construction, it isn't a separate registry key). See
   trigPythagDiag.js for the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const PolygonAnglesDiag = (() => {

  const DEG2RAD = Math.PI / 180;

  // Same internal-frame convention as parallelLinesDiag.js: standard
  // CCW-from-east, Y-up geometry, converted to SVG (Y-down) only at
  // the point coordinates are emitted.
  function direction(angleDeg) {
    const rad = angleDeg * DEG2RAD;
    return [Math.cos(rad), Math.sin(rad)];
  }
  function addScaled(P, dir, len) { return [P[0] + dir[0] * len, P[1] + dir[1] * len]; }
  function toSvg(P) { return [P[0], -P[1]]; }
  function normalize(v) { const m = Math.hypot(v[0], v[1]); return [v[0] / m, v[1] / m]; }

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lineEl(a, b, dashed) {
    const A = toSvg(a), B = toSvg(b);
    return `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"${dashed ? ' stroke-dasharray="5,4"' : ''}/>`;
  }
  function arcPath(p1, p2, r, largeArcFlag, sweepFlag) {
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

  // Exact ASA triangle construction: given base P->Q and the interior
  // angles at P and Q, returns the third vertex R. side=+1 places R
  // on the CCW (left) side of directed line P->Q, -1 the other side.
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

  function crossSign(P, Q, ref) {
    const c = (Q[0] - P[0]) * (ref[1] - P[1]) - (Q[1] - P[1]) * (ref[0] - P[0]);
    return Math.sign(c);
  }

  function buildTriangle(angles, baseLen) {
    const [a0, a1] = angles;
    const v0 = [0, 0], v1 = [baseLen, 0];
    const v2 = triangleThirdVertex(v0, v1, a0, a1, +1);
    return [v0, v1, v2];
  }

  // See file header - v0's angle is split between the two triangles
  // sharing diagonal v0-v2 at the midpoint of the range that keeps
  // every sub-angle positive, not a naive fixed 50/50.
  function buildQuadrilateral(angles, baseLen) {
    const [a0, a1, a2] = angles;
    const v0 = [0, 0], v1 = [baseLen, 0];
    const lower = Math.max(0, 180 - a1 - a2);
    const upper = Math.min(a0, 180 - a1);
    const x = (lower + upper) / 2;
    const v2 = triangleThirdVertex(v0, v1, x, a1, +1);
    const a2A = 180 - a1 - x, a0B = a0 - x, a2B = a2 - a2A;
    const sideOfV1 = crossSign(v0, v2, v1);
    const v3 = triangleThirdVertex(v0, v2, a0B, a2B, -sideOfV1);
    return [v0, v1, v2, v3];
  }

  function bisectorDirection(prev, V, next) {
    const dPrev = normalize([prev[0] - V[0], prev[1] - V[1]]);
    const dNext = normalize([next[0] - V[0], next[1] - V[1]]);
    return normalize([dPrev[0] + dNext[0], dPrev[1] + dNext[1]]);
  }

  function buildPolygonAnglesSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const baseLen = opts.baseLen || 110;
    const arcRadius = opts.arcRadius || 26;
    const labelRadius = opts.labelRadius || 46;
    const extLen = opts.extLen || 40;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };
    const extendSvg = (P) => extend(...toSvg(P));

    let body = '';

    if (params.shape === 'trapezium') {
      const [givenDeg, givenLabel] = params.given.split(':');
      const [findDeg, findLabel] = params.find.split(':');
      const g = Number(givenDeg);
      const h = 85;          // fixed decorative height
      const legAngle = 62;   // fixed decorative angle for the OTHER (untested) leg
      const baseW = 190;

      const v0 = [0, 0], v1 = [baseW, 0];
      const v3 = [h / Math.tan(g * DEG2RAD), h];
      const v2 = [baseW - h / Math.tan(legAngle * DEG2RAD), h];

      body += lineEl(v0, v1);
      body += lineEl(v3, v2);
      body += lineEl(v0, v3);
      body += lineEl(v1, v2);
      [v0, v1, v3, v2].forEach(extendSvg);

      // Parallel tick-marks on the two horizontal (parallel) sides.
      [[v0, v1], [v3, v2]].forEach(([A, B]) => {
        const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        [-6, 6].forEach(off => {
          const c = addScaled(mid, direction(0), off);
          body += lineEl(addScaled(c, direction(60), 7), addScaled(c, direction(-60), 7));
        });
      });

      // Given angle at v0, its co-interior partner at v3 (find) - the
      // leg v0-v3 is the transversal cutting the two parallel sides.
      const gp1 = addScaled(v0, direction(0), arcRadius);
      const gp2 = addScaled(v0, direction(g), arcRadius);
      body += arcPath(gp1, gp2, arcRadius, g > 180 ? 1 : 0, 1);
      const gl = addScaled(v0, direction(g / 2), arcRadius + 20);
      body += textEl(gl, givenLabel, 'middle', fontSize);
      extend(...textBoundsBox(gl, 'middle', givenLabel, fontSize));

      const findAngle = 180 - g; // co-interior
      const fp1 = addScaled(v3, direction(180), arcRadius);
      const fp2 = addScaled(v3, direction(180 + findAngle), arcRadius);
      body += arcPath(fp1, fp2, arcRadius, findAngle > 180 ? 1 : 0, 1);
      const fl = addScaled(v3, direction(180 + findAngle / 2), arcRadius + 20);
      body += textEl(fl, findLabel, 'middle', fontSize);
      extend(...textBoundsBox(fl, 'middle', findLabel, fontSize));
      void findDeg; // the true value is derived (co-interior); the params copy is for CSV self-documentation only

    } else {
      const angleDefs = params.angles.split('|').map(pair => {
        const idx = pair.indexOf(':');
        return { deg: Number(pair.slice(0, idx)), label: pair.slice(idx + 1) };
      });
      const n = angleDefs.length;
      const isTriangle = n === 3;
      const angles = angleDefs.map(a => a.deg);

      const sum = angles.reduce((s, a) => s + a, 0);
      const expectedSum = isTriangle ? 180 : 360;
      if (Math.abs(sum - expectedSum) > 0.6) {
        console.warn(`PolygonAnglesDiag: angles sum to ${sum}, expected ${expectedSum}`);
      }

      const vertices = isTriangle ? buildTriangle(angles, baseLen) : buildQuadrilateral(angles, baseLen);

      // Outline.
      for (let i = 0; i < n; i++) {
        body += lineEl(vertices[i], vertices[(i + 1) % n]);
        extendSvg(vertices[i]);
      }

      // Interior angle arc + label at each vertex that has one.
      for (let i = 0; i < n; i++) {
        const label = angleDefs[i].label;
        if (!label) continue;
        const prev = vertices[(i - 1 + n) % n], V = vertices[i], next = vertices[(i + 1) % n];
        const dPrev = normalize([prev[0] - V[0], prev[1] - V[1]]);
        const dNext = normalize([next[0] - V[0], next[1] - V[1]]);
        const p1 = addScaled(V, dPrev, arcRadius);
        const p2 = addScaled(V, dNext, arcRadius);
        const sweepFlag = crossSign(V, addScaled(V, dPrev, 1), addScaled(V, dNext, 1)) > 0 ? 1 : 0;
        body += arcPath(p1, p2, arcRadius, angleDefs[i].deg > 180 ? 1 : 0, sweepFlag);
        const lp = addScaled(V, bisectorDirection(prev, V, next), labelRadius);
        body += textEl(lp, label, 'middle', fontSize);
        extend(...textBoundsBox(lp, 'middle', label, fontSize));
      }

      // Side extension, exposing an exterior or vertically-opposite angle.
      if (params.extend) {
        const [viStr, kind] = params.extend.split(':');
        const vi = Number(viStr);
        const V = vertices[vi], prev = vertices[(vi - 1 + n) % n], next = vertices[(vi + 1) % n];
        const dToPrev = normalize([prev[0] - V[0], prev[1] - V[1]]);
        const dToNext = normalize([next[0] - V[0], next[1] - V[1]]);
        const dAwayPrev = [-dToPrev[0], -dToPrev[1]];
        const dAwayNext = [-dToNext[0], -dToNext[1]];

        const exteriorParts = params.exterior.split(':');
        const extDeg = Number(exteriorParts[1]);
        const extLabel = exteriorParts[2];

        const rayAway = kind === 'next' ? dAwayPrev : null; // 'next' extends only the incoming edge

        if (kind === 'next') {
          const extTip = addScaled(V, dAwayPrev, extLen);
          body += lineEl(V, extTip, true);
          extendSvg(extTip);
          const p1 = addScaled(V, dAwayPrev, arcRadius);
          const p2 = addScaled(V, dToNext, arcRadius);
          const sweepFlag = crossSign(V, addScaled(V, dAwayPrev, 1), addScaled(V, dToNext, 1)) > 0 ? 1 : 0;
          body += arcPath(p1, p2, arcRadius, extDeg > 180 ? 1 : 0, sweepFlag);
          const lp = addScaled(V, normalize([dAwayPrev[0] + dToNext[0], dAwayPrev[1] + dToNext[1]]), labelRadius);
          body += textEl(lp, extLabel, 'middle', fontSize);
          extend(...textBoundsBox(lp, 'middle', extLabel, fontSize));
        } else { // 'both'
          const extTip1 = addScaled(V, dAwayPrev, extLen);
          const extTip2 = addScaled(V, dAwayNext, extLen);
          body += lineEl(V, extTip1, true);
          body += lineEl(V, extTip2, true);
          extendSvg(extTip1); extendSvg(extTip2);
          const p1 = addScaled(V, dAwayPrev, arcRadius);
          const p2 = addScaled(V, dAwayNext, arcRadius);
          const sweepFlag = crossSign(V, addScaled(V, dAwayPrev, 1), addScaled(V, dAwayNext, 1)) > 0 ? 1 : 0;
          body += arcPath(p1, p2, arcRadius, extDeg > 180 ? 1 : 0, sweepFlag);
          const lp = addScaled(V, normalize([dAwayPrev[0] + dAwayNext[0], dAwayPrev[1] + dAwayNext[1]]), labelRadius);
          body += textEl(lp, extLabel, 'middle', fontSize);
          extend(...textBoundsBox(lp, 'middle', extLabel, fontSize));
        }
        void rayAway;
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
        body += `<text x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${promptFontSize}" font-family="sans-serif" font-weight="700">${escapeXml(line)}</text>`;
        const w = line.length * promptFontSize * 0.6;
        extend(cx - w / 2, y - promptFontSize * 0.7, cx + w / 2, y + promptFontSize * 0.4);
      });
    }

    const vbX = bx0 - pad, vbY = by0 - pad, vbW = (bx1 - bx0) + 2 * pad, vbH = (by1 - by0) + 2 * pad;
    return `<svg viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  return { buildPolygonAnglesSVG };
})();

DiagramRenderer.register('polygon_angles', PolygonAnglesDiag.buildPolygonAnglesSVG);
