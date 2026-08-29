/* ============================================================
   barModelDiag.js
   ------------------------------------------------------------
   Diagram builder for DF skill 225/226 (ratio sharing, and ratio's
   relationship to fractions/percentages). Two modes:

   Split bar (default) - a single bar divided into segments, each
   drawn to its real relative size (same "draw the actual given
   numbers to scale" philosophy as every other diagram in this app -
   a ratio's own numbers ARE the true proportions, so there's no
   decorative guessing needed here the way an unknown length
   elsewhere sometimes needs a fallback).
     parts=<value>:<label>|<value>:<label>|...
     fill=<comma-separated 0-based segment indices to shade>
     total=<n>                 (optional - falls back to an auto
                                 caption "Total = <n>" only if
                                 `caption` itself is omitted)
     caption=<text>             (optional - a given value with
                                 nowhere else to live, shown below)

   Compare bar (mode=compare) - two separate stacked bars at their
   own relative lengths, for difference-based questions or for
   showing a direct A:B relationship that isn't "two parts of one
   whole" (e.g. "A is 40% of B").
     mode=compare;bars=<value>:<label>|<value>:<label>[;diffLabel=<text>]
   diffLabel is optional - when present, a bracket spans the excess
   of the longer bar over the shorter one, labelled with the given/
   asked difference; when absent, just the two proportional bars are
   drawn (e.g. for a plain ratio-relationship comparison).

   Registers itself into DiagramRenderer - see trigPythagDiag.js for
   the extension-point pattern this follows.

   Load AFTER diagramRenderer.js, and BEFORE grid.js.
   ============================================================ */

const BarModelDiag = (() => {

  const SHADE_FILL = '#E0C877'; // matches the app's own chalk-yellow-dark accent (see pieChartDiag.js)

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lineEl(a, b) {
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#1a1a1a" stroke-width="2"/>`;
  }
  function rectEl(x, y, w, h, fill) {
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" stroke="#1a1a1a" stroke-width="2"/>`;
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
  function parseSegments(str) {
    return str.split('|').map(pair => {
      const idx = pair.indexOf(':');
      return { val: Number(pair.slice(0, idx)), label: pair.slice(idx + 1) };
    });
  }

  function buildBarModelSVG(params, opts = {}) {
    const fontSize = opts.fontSize || 17;
    const capFontSize = opts.capFontSize || 16;
    const promptFontSize = opts.promptFontSize || 16;
    const pad = opts.pad || 8;
    const lineHeight = promptFontSize * 1.25;
    const maxDim = opts.maxDim || 200;

    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const extend = (x0, y0, x1 = x0, y1 = y0) => {
      bx0 = Math.min(bx0, x0, x1); by0 = Math.min(by0, y0, y1);
      bx1 = Math.max(bx1, x0, x1); by1 = Math.max(by1, y0, y1);
    };

    let body = '';

    if (params.mode === 'compare') {
      const barDefs = parseSegments(params.bars);
      const barHeight = 34, barGap = 16;
      const maxVal = Math.max(...barDefs.map(b => b.val));
      const scale = maxDim / maxVal;
      const widths = barDefs.map(b => b.val * scale);

      let y = 0;
      const barTops = [];
      widths.forEach((w, i) => {
        body += rectEl(0, y, w, barHeight, 'none');
        extend(0, y, w, y + barHeight);
        if (barDefs[i].label) {
          const lx = w + 10;
          const ly = y + barHeight / 2;
          body += textEl(lx, ly, barDefs[i].label, 'start', fontSize);
          extend(...textBoundsBox(lx, ly, 'start', barDefs[i].label, fontSize));
        }
        barTops.push(y);
        y += barHeight + barGap;
      });

      if (params.diffLabel && barDefs.length === 2) {
        const longerIdx = widths[0] >= widths[1] ? 0 : 1;
        const shorterIdx = 1 - longerIdx;
        const excessStart = widths[shorterIdx], excessEnd = widths[longerIdx];
        const bracketY = barTops[longerIdx] + barHeight + 8;
        body += lineEl([excessStart, bracketY], [excessEnd, bracketY]);
        body += lineEl([excessStart, bracketY], [excessStart, bracketY - 6]);
        body += lineEl([excessEnd, bracketY], [excessEnd, bracketY - 6]);
        extend(excessStart, bracketY - 6, excessEnd, bracketY);
        const lx = (excessStart + excessEnd) / 2, ly = bracketY + 16;
        body += textEl(lx, ly, params.diffLabel, 'middle', fontSize, 700);
        extend(...textBoundsBox(lx, ly, 'middle', params.diffLabel, fontSize));
      }

    } else {
      const partDefs = parseSegments(params.parts);
      const n = partDefs.length;
      const totalVal = partDefs.reduce((s, p) => s + p.val, 0);
      const scale = maxDim / totalVal;
      const barHeight = 60;
      const fillSet = new Set((params.fill || '').split(',').filter(s => s !== '').map(Number));

      let cum = 0;
      for (let i = 0; i < n; i++) {
        const w = partDefs[i].val * scale;
        const fill = fillSet.has(i) ? SHADE_FILL : 'none';
        body += rectEl(cum, 0, w, barHeight, fill);
        extend(cum, 0, cum + w, barHeight);
        if (partDefs[i].label) {
          const lx = cum + w / 2, ly = barHeight / 2;
          body += textEl(lx, ly, partDefs[i].label, 'middle', fontSize);
          extend(...textBoundsBox(lx, ly, 'middle', partDefs[i].label, fontSize));
        }
        cum += w;
      }

      const captionText = params.caption || (params.total ? `Total = ${params.total}` : null);
      if (captionText) {
        const cx = cum / 2, cy = barHeight + 22;
        body += textEl(cx, cy, captionText, 'middle', capFontSize, 700);
        extend(...textBoundsBox(cx, cy, 'middle', captionText, capFontSize));
      }
    }

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
        body += textEl(cx, y, line, 'middle', promptFontSize, 700);
        extend(...textBoundsBox(cx, y, 'middle', line, promptFontSize));
      });
    }

    const vbX = bx0 - pad, vbY = by0 - pad, vbW = (bx1 - bx0) + 2 * pad, vbH = (by1 - by0) + 2 * pad;
    return `<svg viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  return { buildBarModelSVG };
})();

DiagramRenderer.register('bar_model', BarModelDiag.buildBarModelSVG);
