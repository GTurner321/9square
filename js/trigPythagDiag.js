/* ============================================================
   trigPythagDiag.js
   ------------------------------------------------------------
   Diagram builder for right-angled triangles: "right_triangle_trig"
   (trig, one angle labelled) and "right_triangle_pythagoras" (no
   angle labelled) - one shared geometry+drawing engine
   (buildRightTriangleSVG) handles both, since the only real
   difference between them is whether an angle is given/labelled.

   Registers itself into DiagramRenderer (diagramRenderer.js) at the
   bottom - nothing outside this file needs to change to add it.
   A future diagram type (bearings, circle theorems, ...) is a new
   file following this same pattern: geometry/drawing code, then one
   DiagramRenderer.register(...) call at the end.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const TrigPythagDiag = (() => {

  const DEG2RAD = Math.PI / 180;

  // 2. Resolve full triangle geometry (real numbers for all of
  //    opposite/adjacent/hypotenuse/angle) from whichever two
  //    quantities are actually given — one angle + one side
  //    (trig "find a length"), or two sides with no angle
  //    (Pythagoras, or trig "find an angle").
  //    `shown` preserves the original label text ("6 cm", "x",
  //    "30°") so the renderer knows what to print and where —
  //    a key absent from params is left out of `shown` entirely
  //    (nothing drawn for that side/angle).
  // ------------------------------------------------------------
  function numOrNull(raw) {
    if (raw === undefined || raw === 'x') return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  
  function resolveRightTriangle(params) {
    let opposite = numOrNull(params.opposite);
    let adjacent = numOrNull(params.adjacent);
    let hypotenuse = numOrNull(params.hypotenuse);
    let angle = numOrNull(params.angle);
  
    if (angle !== null) {
      // angle + exactly one side given -> solve the other two sides
      const rad = angle * DEG2RAD;
      if (opposite !== null) {
        adjacent = opposite / Math.tan(rad);
        hypotenuse = opposite / Math.sin(rad);
      } else if (adjacent !== null) {
        opposite = adjacent * Math.tan(rad);
        hypotenuse = adjacent / Math.cos(rad);
      } else if (hypotenuse !== null) {
        opposite = hypotenuse * Math.sin(rad);
        adjacent = hypotenuse * Math.cos(rad);
      }
    } else {
      // no angle given -> two sides given, solve the third + the angle
      if (opposite !== null && adjacent !== null) {
        hypotenuse = Math.sqrt(opposite ** 2 + adjacent ** 2);
        angle = Math.atan(opposite / adjacent) / DEG2RAD;
      } else if (opposite !== null && hypotenuse !== null) {
        adjacent = Math.sqrt(hypotenuse ** 2 - opposite ** 2);
        angle = Math.asin(opposite / hypotenuse) / DEG2RAD;
      } else if (adjacent !== null && hypotenuse !== null) {
        opposite = Math.sqrt(hypotenuse ** 2 - adjacent ** 2);
        angle = Math.acos(adjacent / hypotenuse) / DEG2RAD;
      }
    }
  
    if ([opposite, adjacent, hypotenuse, angle].some(v => v === null || !Number.isFinite(v))) {
      throw new Error('resolveRightTriangle: params did not give enough information to solve the triangle: ' + JSON.stringify(params));
    }
  
    return {
      opposite, adjacent, hypotenuse, angle,
      shown: {
        opposite: params.opposite,
        adjacent: params.adjacent,
        hypotenuse: params.hypotenuse,
        angle: params.angle, // undefined for Pythagoras params -> nothing drawn
      },
    };
  }
  
  // ------------------------------------------------------------
  // 3. Small geometry helpers
  // ------------------------------------------------------------
  function unit(x, y) {
    const n = Math.hypot(x, y);
    return [x / n, y / n];
  }
  
  // Quadratic-bezier angle-arc between two rays from a vertex —
  // same technique as the earlier angle-triangle mockups.
  function arcAndLabel(Vx, Vy, P1x, P1y, P2x, P2y, r, labelR, text) {
    const [d1x, d1y] = unit(P1x - Vx, P1y - Vy);
    const [d2x, d2y] = unit(P2x - Vx, P2y - Vy);
    const p1 = [Vx + r * d1x, Vy + r * d1y];
    const p2 = [Vx + r * d2x, Vy + r * d2y];
    const [bx, by] = unit(d1x + d2x, d1y + d2y);
    const mid = [Vx + r * bx, Vy + r * by];
    const ctrl = [2 * mid[0] - 0.5 * (p1[0] + p2[0]), 2 * mid[1] - 0.5 * (p1[1] + p2[1])];
    const label = [Vx + labelR * bx, Vy + labelR * by];
    return { p1, ctrl, p2, label, text };
  }
  
  // ------------------------------------------------------------
  // 4. Flip helpers — the shape is built once in a canonical,
  //    unflipped layout (right angle bottom-right); every point
  //    is then passed through T() and every text-anchor through
  //    A() at the point of emission. This mirrors positions
  //    correctly WITHOUT mirroring the text itself.
  // ------------------------------------------------------------
  function makeFlipHelpers(flipH, flipV, width, height) {
    const T = (x, y) => [flipH ? width - x : x, flipV ? height - y : y];
    const A = (anchor) => {
      if (!flipH) return anchor;
      if (anchor === 'start') return 'end';
      if (anchor === 'end') return 'start';
      return anchor; // 'middle' is unaffected by a horizontal flip
    };
    return { T, A };
  }
  
  // ------------------------------------------------------------
  // 5. Core renderer — right_triangle_trig AND
  //    right_triangle_pythagoras both go through this. Pythagoras
  //    params simply never include "angle", so no angle arc/label
  //    is drawn — everything else (orientation, scaling, flips)
  //    is identical.
  // ------------------------------------------------------------
  // Rough visible extent of a text label, used only to trim the final
  // viewBox tightly around actual content — doesn't need to be exact,
  // just close enough that nothing gets clipped. Vertical extent is
  // asymmetric on purpose: every label in this diagram set is digits,
  // "cm", "°", or "x" — none of them have a descender, so the box below
  // the text's centre can be noticeably tighter than the box above it.
  function textBoundsBox(x, y, anchor, text, fontSize) {
    const w = text.length * fontSize * 0.62;
    let x0, x1;
    if (anchor === 'start') { x0 = x; x1 = x + w; }
    else if (anchor === 'end') { x0 = x - w; x1 = x; }
    else { x0 = x - w / 2; x1 = x + w / 2; }
    return [x0, y - fontSize * 0.68, x1, y + fontSize * 0.38];
  }
  
  function buildRightTriangleSVG(params, opts = {}) {
    const {
      width = 400,
      height = 300,
      margin = 50,
      maxLegPx = 210,       // the longer leg is always scaled to this
      flipH = Math.random() < 0.5,
      flipV = Math.random() < 0.5,
      pad = 8,               // final breathing room after tight-cropping the viewBox
      fontSize = 19,         // labels — sized for whiteboard viewing distance
    } = opts;
  
    const geo = resolveRightTriangle(params);
    const { T, A } = makeFlipHelpers(flipH, flipV, width, height);
  
    // Tracks the true bounding box of everything actually drawn, in final
    // (post-flip) coordinates — the viewBox is cropped to this at the end,
    // rather than shipping the full working canvas with its wide margins.
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };
  
    // --- Orientation: shorter of opposite/adjacent is drawn vertical,
    //     so a large angle (long opposite) can never blow out the height.
    const oppIsVertical = geo.opposite <= geo.adjacent;
    const vName = oppIsVertical ? 'opposite' : 'adjacent';
    const hName = oppIsVertical ? 'adjacent' : 'opposite';
    const vLen = geo[vName];
    const hLen = geo[hName];
  
    // --- Scale so the (longer) horizontal leg fills maxLegPx; the
    //     vertical leg is proportionally smaller, guaranteed to fit.
    const scale = maxLegPx / hLen;
    const hPx = hLen * scale;
    const vPx = vLen * scale;
  
    // --- Canonical (unflipped) vertex positions.
    const rightAngleV = [margin + hPx, height - margin];       // bottom-right
    const hVertex = [margin, height - margin];                 // bottom-left — where the H leg meets the hypotenuse
    const vVertex = [margin + hPx, height - margin - vPx];      // top — where the V leg meets the hypotenuse
  
    // The vertex whose adjacent-leg IS the named "adjacent" side always
    // carries the real angle value, wherever that leg physically ended up.
    const angleVertexPos = (hName === 'adjacent') ? hVertex : vVertex;
    const angleOtherPts = (hName === 'adjacent')
      ? [rightAngleV, vVertex]   // rays from hVertex go to rightAngleV and vVertex
      : [rightAngleV, hVertex];  // rays from vVertex go to rightAngleV and hVertex
  
    // --- Right-angle marker (small square bracket at rightAngleV,
    //     pointing into the triangle interior).
    const rs = 16;
    const rightSqPts = [
      [rightAngleV[0] - rs, rightAngleV[1]],
      [rightAngleV[0] - rs, rightAngleV[1] - rs],
      [rightAngleV[0], rightAngleV[1] - rs],
    ];
  
    let body = '';
  
    // Triangle outline
    const polyPts = [hVertex, rightAngleV, vVertex].map(p => T(...p));
    polyPts.forEach(([x, y]) => extend(x, y));
    body += `<polygon points="${polyPts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#1a1a1a" stroke-width="2"/>`;
  
    // Right-angle marker
    const sqPts = rightSqPts.map(p => T(...p));
    sqPts.forEach(([x, y]) => extend(x, y));
    const sqPath = sqPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.join(' ')}`).join(' ');
    body += `<path d="${sqPath}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;
  
    // Angle arc + label (Pythagoras params have no "angle" -> shown.angle is undefined -> skipped)
    if (geo.shown.angle !== undefined) {
      const al = arcAndLabel(
        angleVertexPos[0], angleVertexPos[1],
        angleOtherPts[0][0], angleOtherPts[0][1],
        angleOtherPts[1][0], angleOtherPts[1][1],
        34, 54, geo.shown.angle
      );
      const p1 = T(...al.p1), ctrl = T(...al.ctrl), p2 = T(...al.p2), lbl = T(...al.label);
      body += `<path d="M ${p1.join(' ')} Q ${ctrl.join(' ')} ${p2.join(' ')}" fill="none" stroke="#1e5f5f" stroke-width="1.5"/>`;
      body += `<text x="${lbl[0]}" y="${lbl[1]}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-family="sans-serif">${al.text}</text>`;
      extend(...textBoundsBox(lbl[0], lbl[1], 'middle', al.text, fontSize));
    }
  
    // Side labels — placed relative to wherever each named side physically
    // ended up (H or V) after the orientation swap. The offset off the line
    // is pulled in for a bare "x" — a single glyph reads as "lost" out at
    // the same distance a longer "9.5 cm"-style label needs.
    function sideLabel(name, text) {
      if (text === undefined) return; // nothing given for this side -> draw nothing
      const isTarget = text === 'x';
      let x, y, anchor;
      if (name === hName) {
        // horizontal leg -> label centred underneath it
        [x, y] = T((hVertex[0] + rightAngleV[0]) / 2, hVertex[1] + (isTarget ? 15 : 24));
        anchor = A('middle');
      } else if (name === vName) {
        // vertical leg -> label to the right of it
        [x, y] = T(rightAngleV[0] + (isTarget ? 10 : 18), (rightAngleV[1] + vVertex[1]) / 2);
        anchor = A('start');
      } else {
        // hypotenuse -> label near its midpoint, offset outward
        const mx = (hVertex[0] + vVertex[0]) / 2, my = (hVertex[1] + vVertex[1]) / 2;
        const d = isTarget ? [-9, -5] : [-14, -8];
        [x, y] = T(mx + d[0], my + d[1]);
        anchor = A('end');
      }
      body += `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${fontSize}" font-family="sans-serif">${text}</text>`;
      extend(...textBoundsBox(x, y, anchor, text, fontSize));
    }
    sideLabel('opposite', geo.shown.opposite);
    sideLabel('adjacent', geo.shown.adjacent);
    sideLabel('hypotenuse', geo.shown.hypotenuse);
  
    const vbX = bx0 - pad, vbY = by0 - pad, vbW = (bx1 - bx0) + 2 * pad, vbH = (by1 - by0) + 2 * pad;
    return `<svg viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }
  

  return { buildRightTriangleSVG, resolveRightTriangle };
})();

DiagramRenderer.register(['right_triangle_trig', 'right_triangle_pythagoras'], TrigPythagDiag.buildRightTriangleSVG);
