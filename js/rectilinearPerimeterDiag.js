/* ============================================================
   rectilinearPerimeterDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 180 (composite rectilinear perimeter).
   Every shape here only ever has horizontal/vertical edges, which is
   what makes each of these constructible exactly from a handful of
   given lengths - a genuinely freeform composite shape would need a
   different (much harder) system.

   Six kinds:
     kind=notch;width=<l>;height=<l>;notchW=<l>;notchH=<l>[;showMissing=true]
       A rectangle with a rectangular notch removed from the top-right
       corner. showMissing=true additionally labels the two DERIVED
       side lengths (width-notchW, height-notchH) - off by default,
       since the DF180a-row1 point is precisely that you don't need them.
     kind=staircase;width=<l>;height=<l>;steps=<n>
       A staircase boundary from bottom-right to top-left inside a
       width x height bounding box, `steps` equal steps.
     kind=joined;seg1=<l>;seg2=<l>;height=<l>
       Two rectangles joined along their `height`-length edge, shown
       as one combined rectangle with a dashed line marking the join.
       A segment given algebraically ("x", "x+3") renders at the same
       width as the height rather than guessing a size from it - this
       also covers the DF-expand-brackets-via-area-model shadow set
       (Area = height x (seg1+seg2), expanded).
     kind=joinedAreas;height=<l>;area1=<l>;area2=<l>
       Same two-rectangle shape, but each rectangle's AREA is written
       inside it instead of a length below it - the factorising-
       direction counterpart to `joined` (given both areas and the
       height, find a missing width).
     kind=cross;squareSide=<l>
       A plus-sign made of 5 identical squares.

   All six accept an optional `caption` (a given value with nowhere
   else to live) shown centred below the shape.

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const RectilinearPerimeterDiag = (() => {

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lineEl(a, b, dashed) {
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"${dashed ? ' stroke-dasharray="5,4"' : ''}/>`;
  }
  function polyEl(pts) {
    return `<polygon points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="#1a1a1a" stroke-width="2"/>`;
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

  function buildRectilinearPerimeterSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 16;
    const capFontSize = opts.capFontSize || 16;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const maxDim = opts.maxDim || 160;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };
    const label = (x, y, text, anchor, fs) => {
      let out = textEl(x, y, text, anchor, fs || fontSize);
      extend(...textBoundsBox(x, y, anchor, text, fs || fontSize));
      return out;
    };

    let body = '';

    if (params.kind === 'notch') {
      const wVal = numericValue(params.width), hVal = numericValue(params.height);
      const scale = maxDim / Math.max(wVal, hVal);
      const W = wVal * scale, H = hVal * scale;
      const nwVal = numericValue(params.notchW), nhVal = numericValue(params.notchH);
      const NW = nwVal * scale, NH = nhVal * scale;

      const v0 = [0, H], v1 = [W, H], v2 = [W, NH], v3 = [W - NW, NH], v4 = [W - NW, 0], v5 = [0, 0];
      [v0, v1, v2, v3, v4, v5].forEach(p => extend(...p));
      body += polyEl([v0, v1, v2, v3, v4, v5]);

      body += label(W / 2, H + 20, params.width, 'middle');
      body += label(-12, H / 2, params.height, 'end');
      // showNotchDims defaults to true (unchanged behaviour for every
      // existing row) - set to 'false' when the notch's own dimensions
      // are stated in the question text instead, so the diagram doesn't
      // give away the very subtraction step the question is testing.
      if (params.showNotchDims !== 'false') {
        body += label((v2[0] + v3[0]) / 2, NH - 10, params.notchW, 'middle');
        body += label(v3[0] - 12, NH / 2, params.notchH, 'end');
      }

      if (params.showMissing === 'true') {
        const missingTop = wVal - nwVal, missingRight = hVal - nhVal;
        body += label((v4[0] + v5[0]) / 2, -12, `${missingTop}${(String(params.width).match(/[a-zA-Z²°%]+$/) || [''])[0]}`, 'middle');
        body += label(v1[0] + 14, (v1[1] + v2[1]) / 2, `${missingRight}${(String(params.height).match(/[a-zA-Z²°%]+$/) || [''])[0]}`, 'start');
      }

      if (params.caption) body += label(W / 2, H + 44, params.caption, 'middle', capFontSize);

    } else if (params.kind === 'staircase') {
      const wVal = numericValue(params.width), hVal = numericValue(params.height);
      const scale = maxDim / Math.max(wVal, hVal);
      const W = wVal * scale, H = hVal * scale;
      const steps = Number(params.steps) || 3;

      const pts = [[0, H], [W, H]]; // bottom-left, bottom-right
      let cx = W, cy = H;
      for (let i = 0; i < steps; i++) {
        cy -= H / steps;
        pts.push([cx, cy]);
        cx -= W / steps;
        pts.push([cx, cy]);
      }
      pts.forEach(p => extend(...p));
      body += polyEl(pts);

      body += label(W / 2, H + 20, params.width, 'middle');
      body += label(-12, H / 2, params.height, 'end');
      if (params.caption) body += label(W / 2, H + 44, params.caption, 'middle', capFontSize);

    } else if (params.kind === 'joined') {
      const s1Val = numericValue(params.seg1), s2Val = numericValue(params.seg2), hVal = numericValue(params.height);
      // Height is always the one real given number in these questions
      // (it's never the unknown), so it anchors the scale - a segment
      // given as a plain number scales against it properly; an
      // algebraic segment ("x", "x+3") renders at the same width as
      // the height rather than trying to extract a misleading partial
      // value from it (the bug that made "2a" render as a sliver
      // elsewhere in this app).
      const H = 90;
      const pxPerUnit = hVal !== null ? H / hVal : H / 6;
      const S1 = s1Val !== null ? s1Val * pxPerUnit : H;
      const S2 = s2Val !== null ? s2Val * pxPerUnit : H;

      const v0 = [0, H], v1 = [S1 + S2, H], v2 = [S1 + S2, 0], v3 = [0, 0];
      [v0, v1, v2, v3].forEach(p => extend(...p));
      body += polyEl([v0, v1, v2, v3]);
      body += lineEl([S1, 0], [S1, H], true);

      body += label(S1 / 2, H + 20, params.seg1, 'middle');
      body += label(S1 + S2 / 2, H + 20, params.seg2, 'middle');
      body += label(-12, H / 2, params.height, 'end');
      if (params.caption) body += label((S1 + S2) / 2, H + 44, params.caption, 'middle', capFontSize);

    } else if (params.kind === 'joinedAreas') {
      // Same two-rectangle shape as 'joined', but each sub-rectangle's
      // AREA is written inside it rather than a length below it - for
      // the factorising-direction questions (given the two areas,
      // find the missing dimension). Both rectangles are drawn equal-
      // width deliberately: inferring a width from an area expression
      // would need dividing by the height, which may itself not be a
      // clean number, so this sidesteps that rather than guessing.
      const hVal = numericValue(params.height);
      const H = 90;
      const pxPerUnit = hVal !== null ? H / hVal : H / 6;
      void pxPerUnit; // height is drawn at a fixed pixel size regardless - only used for the printed label
      const W = 90; // fixed width per rectangle

      const v0 = [0, H], v1 = [2 * W, H], v2 = [2 * W, 0], v3 = [0, 0];
      [v0, v1, v2, v3].forEach(p => extend(...p));
      body += polyEl([v0, v1, v2, v3]);
      body += lineEl([W, 0], [W, H], true);

      body += label(W / 2, H / 2, params.area1, 'middle');
      body += label(W + W / 2, H / 2, params.area2, 'middle');
      body += label(-12, H / 2, params.height, 'end');
      if (params.caption) body += label(W, H + 24, params.caption, 'middle', capFontSize);

    } else { // cross
      const sVal = numericValue(params.squareSide);
      const s = Math.max(40, maxDim / 3);
      const pts = [
        [s, 0], [2 * s, 0], [2 * s, s], [3 * s, s], [3 * s, 2 * s], [2 * s, 2 * s],
        [2 * s, 3 * s], [s, 3 * s], [s, 2 * s], [0, 2 * s], [0, s], [s, s]
      ];
      pts.forEach(p => extend(...p));
      body += polyEl(pts);
      body += label(1.5 * s, -14, params.squareSide, 'middle');
      void sVal;
      if (params.caption) body += label(1.5 * s, 3 * s + 30, params.caption, 'middle', capFontSize);
    }

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

  return { buildRectilinearPerimeterSVG };
})();

DiagramRenderer.register('rectilinear_perimeter', RectilinearPerimeterDiag.buildRectilinearPerimeterSVG);
