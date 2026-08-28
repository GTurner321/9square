// Question Grid — grid view controller
// Owns the 9 squares once Generate has been pressed: rendering,
// shutters, answer/hint/choices/explanation panels (one open at a time
// per square; choices and answer split the box top/bottom with the
// question, and can hand the question's share to the panel via the
// hide-question toggle; hint/explain fully replace the question),
// student assignment and reveal, and refresh - all operating on data
// already fetched, so it keeps working through a connection drop.

const Grid = (() => {
  let el = {};
  let config = null;
  let squares = [];          // 9 entries: { question, levelTarget } | null
  let squareStates = [];     // per-square UI state, parallel to squares
  let studentQueue = null;   // round-robin queue for initial assignment
  let globalRevealed = false;
  let cachedBasePool = null;

  // Must match the max-width in styles.css's "Mobile mode" media query
  // - below this width, squares start already revealed (no shutter),
  // since that view has no reveal-all button to uncover them with.
  const MOBILE_BREAKPOINT = 700;
  function isMobileView() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  let gridMode = '9';        // '9' | '4'
  const CENTER_INDEX = 4;
  const CORNER_INDICES = [0, 2, 6, 8];
  const HIDDEN_INDICES = [1, 3, 4, 5, 7]; // reading order - the 5 squares dropped in 4-mode
  let refreshQueue = [];     // indices from HIDDEN_INDICES, consumed by refresh while in 4-mode

  // How long the "go back" undo button stays available after a
  // refresh, in ms. Any further refresh OR undo click on that square
  // resets the countdown, so a fast run of clicks keeps undo available
  // the whole time - it only disappears after this many ms of genuine
  // inactivity on that square.
  const UNDO_VISIBLE_MS = 10000;
  let undoTimeoutIds = []; // per square index, parallel to squares/squareStates

  // ---------------- Browse & swap (prep-time question picker) ----------------
  // Freezes the live 9-square grid with a numbered target overlaid on
  // each square, and offers up to BROWSE_PAGE_SIZE further candidate
  // questions at a time (from the same pool the grid was generated
  // from) that can be dropped into any of the 9 positions. Only ever
  // available in 9-square mode - see toggleBrowseMode.
  const BROWSE_PAGE_SIZE = 30;
  let browseModeActive = false;
  let browsePool = [];       // ordered candidate questions for this browse session
  let browsePage = 0;        // 0-indexed page into browsePool
  let openPickerIndex = null; // browsePool index whose 1-9 target picker is currently open

  // Metal-plate palette for the shutter background - lightest to
  // darkest. Darker tones were pulled up several steps lighter than
  // before (previously ran all the way down to a near-charcoal ~127
  // average brightness; the floor now sits around ~165) per request to
  // lighten/remove the darkest tones, rather than literally deleting
  // entries and ending up with fewer stops to work with.
  const SHUTTER_PALETTE = [
    '#D5D5CB', '#CECEC4', '#C7C7BD', '#C0C0B6', '#B9B9AF', '#B2B2A8', '#ABABA1', '#A5A59B'
  ];

  // Occasional very narrow accent lines - a touch darker than the
  // palette's own darkest tone, or a touch lighter than its own
  // lightest - that can appear right next to (never instead of) their
  // respective end of the palette, like the thin highlight/shadow line
  // real brushed metal often shows at a tonal transition.
  const SHUTTER_ACCENT_DARK = '#919187';
  const SHUTTER_ACCENT_LIGHT = '#E9E9DF';

  // Fixed so every shutter's "grain" runs the same direction, even
  // though the colour sequence and band widths below are randomised
  // per shutter - a shared angle is what makes them read as the same
  // material despite each one looking otherwise different.
  const SHUTTER_ANGLE_DEG = 120;

  /**
   * Builds one randomised metal-plate gradient string - a random
   * sequence of colours drawn from SHUTTER_PALETTE and a random band
   * width per stop, at the shared angle above - so every shutter looks
   * like a slightly different sheet of brushed metal rather than all
   * sharing one identical pattern. Biases on top of the randomness:
   * darker tones lean strongly toward narrow bands (lighter tones can
   * reach much wider ones), and a lighter-or-equal pick has a mild
   * preference for a similar lightness to the one before it - darker
   * picks don't share that preference, so dark bands no longer tend to
   * cluster with other dark bands, only light-with-light does.
   *
   * Stops are generated in a loop until they actually reach 100% width,
   * rather than a fixed stop count - a fixed count (tuned for the
   * originally wider bands) stopped covering the full box once bands
   * were narrowed down: CSS just extends the last stop's colour to
   * fill whatever's left past 100%, which is exactly what produced the
   * "only the first 20% has any texture, then it's flat" look.
   */
  function randomShutterGradient() {
    let pos = 0;
    let prevIndex = null;
    const stops = [];
    let guard = 0;
    while (pos < 100 && guard < 60) {
      guard++;
      const index = pickPaletteIndex(prevIndex);
      prevIndex = index;
      stops.push(`${SHUTTER_PALETTE[index]} ${pos.toFixed(1)}%`);
      pos += bandWidthFor(index);

      // A narrow accent line has a modest chance of following directly
      // after a genuinely darkest/lightest pick specifically - not
      // after every dark/light-ish band, just the two true extremes.
      if (index === SHUTTER_PALETTE.length - 1 && Math.random() < 0.18) {
        stops.push(`${SHUTTER_ACCENT_DARK} ${pos.toFixed(1)}%`);
        pos += 1 + Math.random() * 2;
      } else if (index === 0 && Math.random() < 0.18) {
        stops.push(`${SHUTTER_ACCENT_LIGHT} ${pos.toFixed(1)}%`);
        pos += 1 + Math.random() * 2;
      }
    }
    return `linear-gradient(${SHUTTER_ANGLE_DEG}deg, ${stops.join(', ')})`;
  }

  // Band width peaks at the middle grey tone(s) and narrows sharply
  // toward both extremes. Both ends of the random range now scale with
  // closeness-to-middle, not just the ceiling: the darkest/lightest
  // tones get pushed narrower still (down toward a ~1 floor, from ~2
  // before), while the middle tones get a genuinely higher MINIMUM
  // width too (not just a higher maximum) - previously a middle pick
  // could occasionally roll as low as ~2 by chance since the floor was
  // flat across every tone; now the middle's floor sits around ~8,
  // guaranteeing it reads as a wide band even on an unlucky roll.
  function bandWidthFor(index) {
    const middle = (SHUTTER_PALETTE.length - 1) / 2; // 3.5 for 8 entries
    const maxDistance = middle; // furthest an index can be from the middle
    const distance = Math.abs(index - middle);
    const closeness = 1 - distance / maxDistance; // 1 at the middle, 0 at either extreme
    const minWidth = 1 + Math.pow(closeness, 4) * 13;
    const maxWidth = minWidth + Math.pow(closeness, 6) * 90;
    return minWidth + Math.random() * (maxWidth - minWidth);
  }

  // Weighted pick that mildly favours a palette index close to the
  // previous one (i.e. similar lightness, since the palette is sorted)
  // - but only among indices at or lighter than the previous one.
  // Indices darker than the previous pick are weighted uniformly, with
  // no distance preference at all, so dark tones no longer cluster with
  // other dark tones the way light tones still mildly do with other
  // light tones.
  function pickPaletteIndex(prevIndex) {
    if (prevIndex === null) return Math.floor(Math.random() * SHUTTER_PALETTE.length);
    const weights = SHUTTER_PALETTE.map((_, i) =>
      i <= prevIndex ? 1 / (1 + (prevIndex - i) * 0.35) : 1
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  // Operator characters that read as too small/light in the shutter's
  // display font (Josefin Sans draws +, minus, times, divide etc.
  // noticeably smaller than its digits) - swapped to the body font and
  // bumped slightly at render time instead, rather than changing the
  // whole shutter font over a handful of symbol glyphs.
  const SHUTTER_SYMBOL_RE = /[+\-−×÷√∛!]/g;
  function wrapShutterSymbols(html) {
    return html.replace(SHUTTER_SYMBOL_RE, ch => `<span class="shutter-symbol">${ch}</span>`);
  }

  // Sum-to-9 expressions shown (embossed) on the shutter face of every
  // covered square except the centre one, which always shows the title
  // instead. Purely decorative - has no bearing on the real question
  // underneath, which is revealed as normal once the shutter is clicked.
  const SHUTTER_SUMS_9 = [
    '81<sup>1/2</sup>',
    '3²',
    '1² + 2² + 2²',
    '9 × 10⁰',
    '9 ÷ 1',
    '∛729',
    '9¹',
    '27<sup>2/3</sup>',
    '1.5 × 6',
    '3³ ÷ 3',
    '0.9 × 10',
    '3 + 3 + 3',
    '√100 − 1',
    '3! + 3'
  ];

  // Used for the 4 corner squares once in 4-square mode - there's no
  // centre square in a 2x2 layout, so no title exception here.
  const SHUTTER_SUMS_4 = [
    '4¹',
    '2²',
    '√16',
    '16<sup>1/2</sup>',
    '∛64',
    '64<sup>2/3</sup>',
    '4 × 10⁰',
    '4 ÷ 1',
    '0.4 × 10',
    '2 + 2',
    '2 × 2',
    '1 + 1 + 1 + 1'
  ];

  // Pastel palette: background + a darker shade of the same hue for
  // text, so each square reads clearly without needing a separate
  // contrast check per colour.
  const PALETTE = [
    { bg: '#FCE4E4', text: '#8B3A3A' },
    { bg: '#FDF0D5', text: '#8A6A1E' },
    { bg: '#FBF3C8', text: '#8A7A1E' },
    { bg: '#E3F3E3', text: '#2E6B2E' },
    { bg: '#E1F0F5', text: '#235C73' },
    { bg: '#E9E3F5', text: '#4B3B7A' },
    { bg: '#F5E3EF', text: '#7A3B63' },
    { bg: '#F0E9DD', text: '#6B5A3E' }
  ];

  // ---------------- Math markup ----------------
  // Plain-text question data can embed a small, unambiguous markup for
  // the handful of maths constructs that turn up in GCSE/A-level "do
  // now" questions. Deliberately not relying on Unicode fraction/
  // superscript glyphs - font support is patchy and they render too
  // small on a projector - so each construct is rendered as real HTML/
  // CSS instead, which scales cleanly with the existing autosize logic.
  //
  //   {num/den}        ->  stacked fraction (num/den can be anything,
  //                         e.g. {3/4} or {(3x+2)/(x-2)}; a leading
  //                         whole number like 1{3/4} makes a mixed
  //                         number for free, since it's just adjacent
  //                         text)
  //   base^exp          ->  superscript; use base^{expr} for anything
  //                         longer than one character, e.g. 5^2 or
  //                         (x+1)^{2}
  //   sqrt{expr}         ->  square root with an overline spanning expr
  //   cbrt{expr}         ->  cube root with an overline spanning expr
  //
  // Constructs don't nest inside each other's braces (no fraction
  // inside a root, etc.) - rare enough at this level to leave out
  // rather than write a recursive parser for it.

  // Shared "base" pattern for anything that can be an exponent's or
  // subscript's base: a run of letters/digits/decimal points, or a
  // single-level parenthesised group like "(x+1)".
  const BASE_PATTERN = '(?:\\([^()]*\\)|[A-Za-z0-9.]+)';

  // Per-digit superscript/subscript glyph maps (Unicode has a real
  // character for every digit 0-9 plus a minus sign, in both forms -
  // ²/³ are the well-known ones, but ⁰¹⁴⁵⁶⁷⁸⁹⁻ and ₀-₉₋ exist too and
  // are just as widely supported, being either Latin-1 Supplement or
  // the dedicated Superscripts/Subscripts block. Building an exponent
  // like "x^23" or "10^-4" out of these (x²³, 10⁻⁴) is genuinely
  // immune to every problem a constructed <sup> has: nothing to sit
  // too low (it's real running text, not a manually offset box),
  // nothing to detach from its base across a line-break (no separate
  // element exists to detach), and no line-wrap point for a space to
  // land invisibly next to (same reason).
  const SUP_GLYPH = { '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079', '-': '\u207B' };
  const SUB_GLYPH = { '0': '\u2080', '1': '\u2081', '2': '\u2082', '3': '\u2083', '4': '\u2084', '5': '\u2085', '6': '\u2086', '7': '\u2087', '8': '\u2088', '9': '\u2089', '-': '\u208B' };

  // A second, smaller set: +, =, ( and ) also have real glyphs in the
  // very same well-supported Unicode block as the digits above (so
  // just as safe to use), and a handful of the algebra letters most
  // likely to turn up as an exponent (a, b, c, n, x, y) have assigned
  // superscript codepoints too. Subscript letters are deliberately
  // left out of this second set even though a few exist (a e i o r u v
  // x) - notably NOT n, which is missing from Unicode entirely, and
  // "u_n"/"a_n" sequence notation is probably the single most common
  // subscript in this curriculum. Having some subscript letters render
  // as glyphs and others silently fall back would be more confusing
  // than useful, so subscript letters stay on the constructed <sub>
  // fallback across the board.
  const SUP_EXTRA_GLYPH = Object.assign({}, SUP_GLYPH, {
    '+': '\u207A', '=': '\u207C', '(': '\u207D', ')': '\u207E',
    'a': '\u1D43', 'b': '\u1D47', 'c': '\u1D9C', 'n': '\u207F', 'x': '\u02E3', 'y': '\u02B8'
  });
  const SUB_EXTRA_GLYPH = Object.assign({}, SUB_GLYPH, {
    '+': '\u208A', '=': '\u208C', '(': '\u208D', ')': '\u208E'
  });

  const toGlyphs = (chars, map) => chars.split('').map(c => map[c] || c).join('');
  // Only ], \, ^, and - are actually special inside a [...] character
  // class - escaping every character indiscriminately (including
  // plain letters) is a real bug, not just unnecessary: \n, \b, and \x
  // mean newline/backspace/hex-escape in a regex, not the literal
  // letters n, b, x - which would have silently broken glyph matching
  // for exactly the letters this feature exists to support.
  // `exclude` (optional) drops specific characters from the class -
  // used to keep ( and ) out of the "bare" alternative while still
  // allowing them inside braces (see the exponent pass below).
  const charClass = (map, exclude) => {
    const excluded = exclude ? exclude.split('') : [];
    const chars = Object.keys(map).filter(c => !excluded.includes(c));
    return '[' + chars.map(c => /[\]\\^-]/.test(c) ? '\\' + c : c).join('') + ']';
  };

  function renderMath(rawText) {
    let text = escapeHtml(rawText == null ? '' : String(rawText));

    // Roots first, since they also consume a {...} span.
    text = text.replace(/sqrt\{([^{}]+)\}/g, (m, inner) =>
      `<span class="radical"><span class="radical__sym">√</span><span class="radical__body">${inner}</span></span>`);
    text = text.replace(/cbrt\{([^{}]+)\}/g, (m, inner) =>
      `<span class="radical radical--cube"><span class="radical__sym">∛</span><span class="radical__body">${inner}</span></span>`);

    // Purely-numeric exponents/subscripts (any length, optional
    // leading minus - "9", "23", "-4" all qualify) become real Unicode
    // glyphs rather than a constructed <sup>/<sub>, for every reason
    // laid out above SUP_GLYPH/SUB_GLYPH. Runs before the general
    // exponent/subscript pass below so it gets first claim on anything
    // it can fully render as plain text.
    text = text.replace(new RegExp('(' + BASE_PATTERN + ')\\^(\\{-?[0-9]+\\}|-?[0-9]+)', 'g'), (m, base, exp) =>
      base + toGlyphs(exp.startsWith('{') ? exp.slice(1, -1) : exp, SUP_GLYPH));
    text = text.replace(new RegExp('(' + BASE_PATTERN + ')_(\\{-?[0-9]+\\}|-?[0-9]+)', 'g'), (m, base, sub) =>
      base + toGlyphs(sub.startsWith('{') ? sub.slice(1, -1) : sub, SUB_GLYPH));

    // Second glyph pass: braced content built entirely from the wider
    // safe set (digits, +, =, (, ), and - for superscript only - a, b,
    // c, n, x, y) also becomes plain glyphs. A bare (non-braced)
    // exponent/subscript only ever gets ONE glyph here, same rule as
    // the constructed-<sup> pass below uses for anything else - a bare
    // "x^2y" is "x² then a separate y", not "x to the power 2y"; that
    // needs braces, x^{2y}, to be unambiguous, same as it always has.
    // ( and ) are excluded from the BARE alternative specifically -
    // "x^(-1/2)" used to match just the "(" as a complete one-character
    // exponent (⁽), leaving "-1/2)" as stray literal text, since a
    // standalone opening bracket with no matching close is never
    // actually what was meant. They're still fine inside braces, where
    // the boundary is unambiguous: x^{(2n)}.
    const supBareClass = charClass(SUP_EXTRA_GLYPH, '()');
    const supBracedClass = charClass(SUP_EXTRA_GLYPH);
    text = text.replace(new RegExp('(' + BASE_PATTERN + ')\\^(\\{' + supBracedClass + '+\\}|' + supBareClass + ')', 'g'), (m, base, exp) =>
      base + toGlyphs(exp.startsWith('{') ? exp.slice(1, -1) : exp, SUP_EXTRA_GLYPH));
    const subBareClass = charClass(SUB_EXTRA_GLYPH, '()');
    const subBracedClass = charClass(SUB_EXTRA_GLYPH);
    text = text.replace(new RegExp('(' + BASE_PATTERN + ')_(\\{' + subBracedClass + '+\\}|' + subBareClass + ')', 'g'), (m, base, sub) =>
      base + toGlyphs(sub.startsWith('{') ? sub.slice(1, -1) : sub, SUB_EXTRA_GLYPH));

    // Exponents and subscripts next, and specifically before the
    // fraction pass below - x^{1/3} is a superscripted "1/3", not a
    // stacked fraction sitting in superscript position, so ^{...}/_{...}
    // need to claim their braces before the generic {a/b} fraction
    // regex gets a chance to see them.
    //
    // Everything left at this point has a letter somewhere in the
    // exponent/subscript (the purely-numeric cases were already
    // handled above), so it can't be done as plain glyphs and needs a
    // constructed <sup>/<sub>. A word joiner (U+2060, invisible,
    // zero-width - designed for exactly this) sits between the base and
    // the tag on each side, rather than wrapping both in a
    // white-space:nowrap span: nowrap turned out to visually swallow a
    // normal space sitting right against its boundary (confirmed by
    // testing - "Simplify x^9" rendered as "Simplifyx⁹" in practice),
    // and to fragment a wrapped sentence into oddly independently-
    // centred pieces when the span was too wide to share a line with
    // anything else. A word joiner has neither problem: it's not an
    // element with a boundary at all, just a character that means
    // "don't break the line here" and nothing else.
    const BASE = BASE_PATTERN;
    const WJ = '\u2060';
    text = text.replace(new RegExp(BASE + '\\^(\\{[^{}]+\\}|-?[A-Za-z0-9])', 'g'), (m, exp) => {
      const base = m.slice(0, m.indexOf('^'));
      const expInner = exp.startsWith('{') ? exp.slice(1, -1) : exp;
      return `${base}${WJ}<sup>${expInner}</sup>${WJ}`;
    });
    text = text.replace(new RegExp(BASE + '_(\\{[^{}]+\\}|[A-Za-z0-9])', 'g'), (m, sub) => {
      const base = m.slice(0, m.indexOf('_'));
      const subInner = sub.startsWith('{') ? sub.slice(1, -1) : sub;
      return `${base}${WJ}<sub>${subInner}</sub>${WJ}`;
    });

    // Any {...} left with a slash inside is a fraction. Per the
    // authoring rules, {a/b} is only ever used standalone (never mixed
    // into a sentence), so it doesn't need to be shrunk to avoid
    // colliding with surrounding prose - one consistently larger size
    // for both numeric and algebraic content. The divider line sits
    // under the numerator normally, but switches to sitting over the
    // denominator when the denominator has more characters - putting
    // it under the shorter, narrower numerator would leave a divider
    // that doesn't span the wider content below it.
    text = text.replace(/\{([^{}]+)\}/g, (m, inner) => {
      const slashIndex = findDivisionSlash(inner);
      if (slashIndex === -1) return m; // no slash - leave the braces as literal text
      const num = inner.slice(0, slashIndex);
      const den = inner.slice(slashIndex + 1);
      const denWider = den.length > num.length;
      return `<span class="frac"><span class="frac__num${denWider ? '' : ' frac__num--line'}">${num}</span><span class="frac__den${denWider ? ' frac__den--line' : ''}">${den}</span></span>`;
    });

    // Column vectors: [top/bottom] - same stacking mechanism as a {}
    // fraction, but square brackets and no dividing line.
    text = text.replace(/\[([^\[\]]+)\]/g, (m, inner) => {
      const slashIndex = findDivisionSlash(inner);
      if (slashIndex === -1) return m; // no slash - leave the brackets as literal text
      const top = inner.slice(0, slashIndex);
      const bottom = inner.slice(slashIndex + 1);
      return `<span class="vector"><span class="vector__bracket">[</span><span class="vector__stack"><span class="vector__top">${top}</span><span class="vector__bottom">${bottom}</span></span><span class="vector__bracket">]</span></span>`;
    });

    return text;
  }

  // Finds the "real" division slash inside a {...} or [...] block,
  // ignoring any "/" that's actually part of an HTML closing tag
  // already inserted by an earlier pass (e.g. exponents run first, so
  // "4x^2/6x^2" becomes "4x<sup>2</sup>/6x<sup>2</sup>" before this
  // runs - a naive indexOf('/') finds the "/" inside "</sup>" first
  // and splits the fraction there instead of at the real division
  // sign, producing broken half-tags like "4x<sup>2<" as the
  // numerator). A closing tag's slash is always immediately followed
  // by a run of letters then ">" (</sup>, </sub>, </span>), so
  // excluding slashes that match that pattern reliably finds the
  // actual division slash instead.
  function findDivisionSlash(inner) {
    const match = inner.match(/\/(?![a-zA-Z]+>)/);
    return match ? match.index : -1;
  }

  function init() {
    el.container = document.getElementById('gridContainer');
    el.container.addEventListener('click', onGridClick);

    el.gridView = document.getElementById('gridView');
    el.browsePanel = document.getElementById('browsePanel');
    el.browseGrid = document.getElementById('browseGrid');
    el.browsePager = document.getElementById('browsePager');
    if (el.browsePanel) el.browsePanel.addEventListener('click', onBrowsePanelClick);
  }



  function generate(cfg) {
    config = cfg;
    cachedBasePool = null;
    const result = SelectionEngine.generate(config);
    squares = result.squares;
    buildStatesAndRender();
  }

  function generateFromSaved(cfg, orderList) {
    config = cfg;
    cachedBasePool = null;

    squares = orderList.map(orderVal => {
      if (orderVal === null || orderVal === undefined) return null;
      const found = config.questions.find(q => String(q.orderAdded) === String(orderVal));
      return found ? { question: found, levelTarget: found.level } : null;
    });

    buildStatesAndRender();
  }

  /**
   * Returns { descriptor, order } describing the current 9-box layout,
   * ready to hand to SaveQuiz.save(). descriptor records how the pool
   * was chosen (Pearson book + chapters, or Dr Frost skill numbers) so
   * it can be rebuilt on load. order[i] is the question's Q#
   * (orderAdded), or null for a blank box.
   */
  function getSaveData() {
    if (!config) return null;
    return {
      descriptor: config.source,
      order: squares.map(s => s ? s.question.orderAdded : null)
    };
  }

  function buildStatesAndRender() {
    const hasStudents = config.students.length > 0;
    studentQueue = hasStudents ? StudentPicker.createQueue(config.students) : null;

    // A brand new grid has no refresh history to go back to - clear
    // any timers left over from the previous grid so a stale one can't
    // fire against the new squares array.
    undoTimeoutIds.forEach(id => { if (id) clearTimeout(id); });
    undoTimeoutIds = [];

    // Likewise, a fresh Generate always starts outside browse mode,
    // even if the previous grid was left with it open.
    browseModeActive = false;
    browsePool = [];
    browsePage = 0;
    openPickerIndex = null;
    if (el.gridView) el.gridView.classList.remove('browsing');
    if (el.browsePanel) el.browsePanel.hidden = true;

    squareStates = squares.map(square => {
      if (!square) return null;
      return {
        activePanel: null,
        choiceOrder: null,
        choiceResolved: false,
        questionHidden: false,
        cleared: false,
        studentName: hasStudents ? StudentPicker.next(studentQueue) : null,
        studentRevealed: false,
        shuttered: !isMobileView(),
        shutterGradient: randomShutterGradient(),
        // Question/hint/explanation each remember their own zoom level
        // independently (switching between them doesn't reset the
        // others - going back to a previously-zoomed one picks up
        // where it was left). Answer/choices were never in the zoom
        // control's scope, so they don't get an entry here - they just
        // render at their normal size.
        zoomOffsets: { question: 0, hint: 0, explain: 0 },
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        shutterKind: null,
        shutterHtml: null,
        // Decided once per displayed question (not per render) so the
        // diagram doesn't visibly jump every time the square
        // re-renders (zoom, panel toggle, autosize) - only a genuinely
        // new question (refresh/undo/new grid) gets a fresh flip.
        diagramFlip: { h: Math.random() < 0.5, v: Math.random() < 0.5 },
        undoStack: [] // questions this square previously showed, most-recent last
      };
    });

    assignShutterContent([0, 1, 2, 3, 4, 5, 6, 7, 8], SHUTTER_SUMS_9, true);

    gridMode = '9';
    refreshQueue = [];
    globalRevealed = false;
    render();
    // Disabled per request - startShutterPulse()/stopShutterPulse() are
    // left fully intact below in case this gets switched back on later,
    // this is just the one call site that turns it on.
    // startShutterPulse();
  }

  /**
   * Assigns shutter cover artwork to the given square indices, drawn
   * (shuffled, no repeats) from sumsList. When allowTitle is true, the
   * centre square gets the "9 SQUARE" title instead of a sum - only
   * meaningful for the full 9-square layout, since 4-square mode has
   * no centre square among its indices anyway.
   */
  function assignShutterContent(indices, sumsList, allowTitle) {
    const shuffled = shuffle(sumsList);
    let cursor = 0;
    indices.forEach(i => {
      const state = squareStates[i];
      if (!state) return;
      if (allowTitle && i === CENTER_INDEX) {
        state.shutterKind = 'title';
        state.shutterHtml = null;
      } else {
        state.shutterKind = 'sum';
        state.shutterHtml = shuffled[cursor++ % shuffled.length];
      }
    });
  }

  function visibleIndices() {
    return gridMode === '4' ? CORNER_INDICES : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  }

  // Draws attention to an untouched grid before anyone's clicked
  // anything yet: every 7 seconds, one still-shuttered square (picked
  // at random) gets a subtle one-shot pulse. Stops for good the moment
  // any shutter is actually clicked (see onGridClick) - it's an
  // invitation to start, not an ongoing distraction.
  let pulseIntervalId = null;

  function startShutterPulse() {
    stopShutterPulse();
    pulseIntervalId = setInterval(() => {
      const shutters = el.container.querySelectorAll('.square__shutter');
      if (!shutters.length) {
        stopShutterPulse();
        return;
      }
      const target = shutters[Math.floor(Math.random() * shutters.length)];
      target.classList.add('square__shutter--pulsing');
      target.addEventListener('animationend', () => {
        target.classList.remove('square__shutter--pulsing');
      }, { once: true });
    }, 7000);
  }

  function stopShutterPulse() {
    if (pulseIntervalId) {
      clearInterval(pulseIntervalId);
      pulseIntervalId = null;
    }
  }

  function render() {
    el.container.innerHTML = '';
    el.container.classList.toggle('grid--four', gridMode === '4');
    el.container.classList.toggle('grid--browsing', browseModeActive);
    visibleIndices().forEach(i => {
      const squareEl = renderSquare(squares[i], squareStates[i], i);
      el.container.appendChild(squareEl);
      if (browseModeActive) attachBrowseBadge(squareEl, i);
    });
    if (browseModeActive) attachScrollArrows();
    requestAnimationFrame(autosizeAll);
  }

  /**
   * Switches between the 9-square and 4-square (corners only) layouts.
   * Squares outside the 4-square view aren't destroyed, just not
   * rendered - so switching back to 9 always restores them exactly as
   * they were, with whatever the visible corners did in the meantime
   * left untouched. Returns the new mode. A no-op while browse/swap is
   * open (that control is only ever available in 9-square mode, and
   * the header button that would trigger this is disabled for the
   * same reason - this is just belt-and-braces).
   */
  function toggleGridMode() {
    if (browseModeActive) return gridMode;
    gridMode = gridMode === '9' ? '4' : '9';
    if (gridMode === '4') {
      refreshQueue = HIDDEN_INDICES.slice();
      assignShutterContent(CORNER_INDICES, SHUTTER_SUMS_4, false);
    } else {
      assignShutterContent(CORNER_INDICES, SHUTTER_SUMS_9, false);
    }
    render();
    return gridMode;
  }

  // ---------------- Rendering ----------------

  const ICON_EYE_SMALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICON_EYE_OFF_SMALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.3 21.3 0 0 1 5.06-5.94M9.9 4.24A10.6 10.6 0 0 1 12 5c7 0 11 7 11 7a21.3 21.3 0 0 1-2.61 3.68M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const ICON_CALC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11.01"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="16" y1="11" x2="16" y2="11.01"/><line x1="8" y1="15" x2="8" y2="15.01"/><line x1="12" y1="15" x2="12" y2="15.01"/><line x1="16" y1="15" x2="16" y2="15.01"/><line x1="8" y1="19" x2="8" y2="19.01"/><line x1="12" y1="19" x2="12" y2="19.01"/></svg>';
  const ICON_NO_CALC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11.01"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="16" y1="11" x2="16" y2="11.01"/><line x1="8" y1="15" x2="8" y2="15.01"/><line x1="12" y1="15" x2="12" y2="15.01"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function renderSquare(square, state, index) {
    const wrap = document.createElement('div');
    wrap.className = 'square';
    wrap.dataset.index = String(index);

    if (!square) {
      wrap.classList.add('square--blank');
      return wrap;
    }

    wrap.style.background = state.color.bg;
    wrap.style.setProperty('--square-text', state.color.text);

    // A cleared square shows nothing but a small restore button - same
    // visual treatment as a genuinely blank square (dashed border,
    // striped background), reinforcing the "board getting emptier"
    // effect this is for, rather than looking like a different kind of
    // empty. Everything else about the square (active panel, choices
    // already answered, zoom level, student reveal state) stays intact
    // underneath - restoring brings all of it straight back.
    if (state.cleared) {
      wrap.classList.add('square--blank', 'square--cleared');
      wrap.innerHTML = `<button class="square__restore-btn" data-action="restore-square" title="Bring this question back">⊕</button>`;
      return wrap;
    }

    const q = square.question;
    const hasChoices = q.wrong1 && q.wrong2;
    const hasHint = !!q.hint;
    const hasExplain = !!q.workedAnswer;
    const hasStudents = config.students.length > 0;
    const calcRaw = String(q.calculator || '').trim().toLowerCase();
    const showCalcIcon = calcRaw === 'yes' || calcRaw === 'no';
    const isCalc = calcRaw === 'yes';
    // 'choices' and 'answer' both show the question alongside the
    // panel by default (question on top); hint/explain still fully
    // replace the question, since there's no natural "3 buttons" or
    // "one box" split for a block of explanatory text.
    const splitPanels = ['choices', 'answer'];
    const isSplit = splitPanels.includes(state.activePanel) && !state.questionHidden;
    const showHideToggle = splitPanels.includes(state.activePanel);
    // The clear ("X") button only appears once a square is actually
    // unshuttered - clearing a still-covered square doesn't mean
    // anything. When the hide-question eye icon is also showing (only
    // during the split answer/choices view), it shifts left so the two
    // don't overlap in the same corner.
    const showClearBtn = !state.shuttered;

    const hasDiagram = !!q.diagramType;

    // For a diagram question, the diagram *is* the question - the
    // prompt text is dropped entirely (not just made small) so the
    // whole box is available to it, in both the plain view and the
    // split choices/answer view. flipH/flipV are pinned per-square
    // (see diagramFlip above) so the diagram doesn't change on every
    // re-render of the same question (zoom clicks, panel toggles).
    const diagramSvg = hasDiagram
      ? DiagramRenderer.renderDiagram(q.diagramType, q.diagramParams, {
          flipH: state.diagramFlip.h,
          flipV: state.diagramFlip.v,
          promptText: q.question
        })
      : '';

    wrap.innerHTML = `
      <div class="square__content ${isSplit ? 'square__content--split' : ''} ${hasDiagram ? 'square__content--diagram' : ''}">
        <div class="square__question ${hasDiagram ? 'square__question--diagram' : ''}" ${state.activePanel && !isSplit ? 'hidden' : ''}>${hasDiagram ? diagramSvg : renderMath(q.question)}</div>
        ${state.activePanel ? renderPanel(q, state) : ''}
      </div>
      ${showHideToggle ? `<button class="square__hide-question-btn${showClearBtn ? ' square__hide-question-btn--shifted' : ''}" data-action="toggle-question" title="${state.questionHidden ? 'Show question' : 'Hide question'}">${state.questionHidden ? ICON_EYE_SMALL : ICON_EYE_OFF_SMALL}</button>` : ''}
      ${showClearBtn ? `<button class="square__clear-btn" data-action="clear-square" title="Hide this question">✕</button>` : ''}
      ${!state.shuttered ? `<div class="square__zoom-control" title="Adjust text size">
        <button class="square__zoom-btn" data-action="zoom-in" title="Larger text">+</button>
        <button class="square__zoom-btn" data-action="zoom-out" title="Smaller text">−</button>
      </div>` : ''}
      <div class="square__footer">
        <div class="square__icons">
          ${showCalcIcon ? `<span class="icon icon--indicator" title="${isCalc ? 'Calculator allowed' : 'No calculator'}">${isCalc ? ICON_CALC : ICON_NO_CALC}</span>` : ''}
          <button class="icon" data-action="answer" title="Show answer" aria-pressed="${state.activePanel === 'answer'}">✓</button>
          ${hasChoices ? `<button class="icon" data-action="choices" title="Show answer choices" aria-pressed="${state.activePanel === 'choices'}">☰</button>` : ''}
          ${hasHint ? `<button class="icon" data-action="hint" title="Show hint" aria-pressed="${state.activePanel === 'hint'}">?</button>` : ''}
          ${hasExplain ? `<button class="icon" data-action="explain" title="Show explanation" aria-pressed="${state.activePanel === 'explain'}">i</button>` : ''}
          <button class="icon" data-action="refresh" title="Choose a different question">↻</button>
          ${state.undoStack && state.undoStack.length > 0 ? `<button class="icon icon--undo" data-action="undo-refresh" title="Go back to the previous question">↩</button>` : ''}
        </div>
        ${hasStudents ? renderStudentChip(state) : ''}
      </div>
      ${state.shuttered ? `<div class="square__shutter" data-shutter="true" style="background: ${state.shutterGradient};"><span class="square__shutter-text${state.shutterKind === 'title' ? ' square__shutter-text--title' : ''}">${state.shutterKind === 'title' ? '9 SQUARE' : wrapShutterSymbols(state.shutterHtml)}</span></div>` : ''}
    `;

    return wrap;
  }

  function renderPanel(q, state) {
    if (state.activePanel === 'choices') {
      if (!state.choiceOrder) {
        state.choiceOrder = shuffle([
          { text: q.answer, correct: true },
          { text: q.wrong1, correct: false },
          { text: q.wrong2, correct: false }
        ]);
        state.choiceStatuses = state.choiceOrder.map(() => 'active');
        state.choiceResolved = false;
        state.correctWasClicked = false;
      }

      const buttonsHtml = state.choiceOrder.map((c, i) => {
        const status = state.choiceStatuses[i];

        let cls = 'choice-btn';
        let mark = '';
        let disabled = state.choiceResolved;

        if (status === 'wrong-shown' || status === 'fading' || status === 'removed') {
          cls += ' choice-btn--wrong';
          mark = ' ✕';
          disabled = true;
        }
        // 'removed' looks identical to 'fading' (fully faded) - it just
        // never leaves the DOM, so its flex slot keeps the gap instead
        // of the other buttons expanding to fill the space.
        if (status === 'fading' || status === 'removed') cls += ' choice-btn--fading';

        if (c.correct && state.choiceResolved) {
          cls += ' choice-btn--correct';
          mark = state.correctWasClicked ? ' ✓' : '';
        }

        return `<button class="${cls}" data-choice-index="${i}" ${disabled ? 'disabled' : ''}><span class="choice-btn__label">${renderMath(c.text)}${mark}</span></button>`;
      }).join('');

      return `<div class="choices">${buttonsHtml}</div>`;
    }

    if (state.activePanel === 'answer') {
      // Same visual language as the revealed-correct choice button
      // (green box, centered, bold) - just delivered as a single box
      // rather than picked from three, since there's nothing to choose.
      // Sits below the question by default (same split as choices);
      // the hide-question toggle lets it claim the full box instead.
      // The box itself shrink-wraps to the answer text (answer-box-wrap
      // centers it within the full panel area) rather than stretching
      // the border edge-to-edge regardless of how short the answer is.
      return `<div class="square__panel-full answer-box-wrap"><div class="answer-box">${renderMath(q.answer)}</div></div>`;
    }

    let text = '';
    if (state.activePanel === 'hint') text = q.hint;
    if (state.activePanel === 'explain') text = q.workedAnswer;
    return `<div class="square__panel-full"><div class="panel-text">${renderMath(text)}</div></div>`;
  }

  function renderStudentChip(state) {
    const revealed = state.studentRevealed;
    return `
      <div class="square__studentchip ${revealed ? 'square__studentchip--revealed' : ''}">
        <span class="student-name">${revealed ? escapeHtml(state.studentName || '') : ''}</span>
        <button class="student-icon" data-action="student" title="${revealed ? 'Pick a different student' : 'Reveal student'}">${revealed ? '↻' : '👤'}</button>
      </div>
    `;
  }

  // ---------------- Interaction ----------------

  function onGridClick(e) {
    // The grid is a frozen reference view while browse/swap is open -
    // every normal interaction (shutters, panels, refresh, clear...)
    // is inert until it's closed again.
    if (browseModeActive) return;

    const squareEl = e.target.closest('.square');
    if (!squareEl) return;
    const index = Number(squareEl.dataset.index);
    const square = squares[index];
    if (!square) return;
    const state = squareStates[index];

    const restoreBtn = e.target.closest('[data-action="restore-square"]');
    if (restoreBtn) {
      state.cleared = false;
      rerenderSquare(index);
      return;
    }

    // A shutter intercepts every click while present - nothing beneath
    // it is reachable until it's removed (one-way, no re-covering).
    // A reveal sound was tried here (twice - a synthesized tock, then
    // a recorded clip) but both consistently played ~1s after the
    // click on the reporter's device with no code-level cause found;
    // disabled per request rather than keep guessing at a fix that
    // can't be verified without hands-on access to that device.
    const shutter = e.target.closest('.square__shutter');
    if (shutter) {
      state.shuttered = false;
      stopShutterPulse(); // the attention-grabbing pulse has done its job
      rerenderSquare(index);
      return;
    }

    const clearBtn = e.target.closest('[data-action="clear-square"]');
    if (clearBtn) {
      // Purely a display toggle - everything underneath (active panel,
      // choices already answered, zoom level, student reveal) is left
      // completely untouched, so restoring brings all of it straight
      // back exactly as it was.
      state.cleared = true;
      rerenderSquare(index);
      return;
    }

    const hideQuestionBtn = e.target.closest('[data-action="toggle-question"]');
    if (hideQuestionBtn) {
      state.questionHidden = !state.questionHidden;
      rerenderSquare(index);
      return;
    }

    // Offsets both ends of the automatic shrink range together (see
    // autosizeSquare/autosizeElement) rather than replacing automatic
    // sizing outright - the shrink-to-fit loop still runs and still
    // prevents genuine overflow, this just biases where it lands.
    // Resets to 0 on every new grid (or a refresh of this square), same
    // as any other per-square UI state - it's not saved as part of a
    // quiz's descriptor. Adjusts whichever of question/hint/explain is
    // currently on screen (see questionZoomKey) - each remembers its
    // own level independently, so switching to a different one shows
    // it at its own last-set size, not whatever was just clicked.
    const zoomBtn = e.target.closest('[data-action="zoom-in"], [data-action="zoom-out"]');
    if (zoomBtn) {
      const step = 0.08;
      const delta = zoomBtn.dataset.action === 'zoom-in' ? step : -step;
      const key = questionZoomKey(state);
      const current = state.zoomOffsets[key] || 0;
      state.zoomOffsets[key] = Math.max(-0.4, Math.min(0.9, current + delta));
      autosizeSquare(squareEl, state);
      return;
    }

    const panelBtn = e.target.closest('.icon[data-action]');
    if (panelBtn) {
      const action = panelBtn.dataset.action;
      if (action === 'refresh') {
        handleRefreshQuestion(index);
      } else if (action === 'undo-refresh') {
        handleUndoRefresh(index);
      } else {
        state.activePanel = (state.activePanel === action) ? null : action;
        rerenderSquare(index);
      }
      return;
    }

    const studentBtn = e.target.closest('.student-icon');
    if (studentBtn) {
      handleStudentIconClick(index);
      return;
    }

    const choiceBtn = e.target.closest('.choice-btn[data-choice-index]');
    if (choiceBtn) {
      handleChoiceClick(index, Number(choiceBtn.dataset.choiceIndex));
      return;
    }
  }

  function handleChoiceClick(squareIndex, choiceIndex) {
    const state = squareStates[squareIndex];
    if (!state || state.choiceResolved) return;
    if (state.choiceStatuses[choiceIndex] !== 'active') return;

    const chosen = state.choiceOrder[choiceIndex];

    if (chosen.correct) {
      resolveWithCorrectClicked(state, squareIndex);
      return;
    }

    // Wrong answer clicked.
    state.wrongClickedIndices = state.wrongClickedIndices || [];
    if (!state.wrongClickedIndices.includes(choiceIndex)) {
      state.wrongClickedIndices.push(choiceIndex);
    }
    state.choiceStatuses[choiceIndex] = 'wrong-shown';
    Sound.playIncorrect();

    if (state.wrongClickedIndices.length >= 2) {
      // Second distinct wrong option: auto-reveal the correct answer
      // (green, no tick - it wasn't chosen), freeze everything, no
      // further fading or removal from here on. The first wrong option
      // is left exactly as it already was (mid-fade, fully removed, or
      // still shown if the second click came in fast) - it must never
      // pop back into view. In the steady-state case that leaves just
      // two items visible: the correct answer and this last wrong pick.
      state.choiceResolved = true;
      state.correctWasClicked = false;
      rerenderSquare(squareIndex);
      return;
    }

    // First wrong click: show it, then fade + leave a gap after a
    // couple of seconds. The other two stay live for another attempt.
    // This timeline runs to completion even if a second wrong click
    // resolves the square in the meantime (checked below via
    // state.choiceStatuses, not state.choiceResolved) - a fast double
    // wrong-click shouldn't rob the first pick of its fade-out.
    rerenderSquare(squareIndex);
    setTimeout(() => {
      if (squareStates[squareIndex] !== state) return;
      if (state.choiceStatuses[choiceIndex] !== 'wrong-shown') return;
      state.choiceStatuses[choiceIndex] = 'fading';
      rerenderSquare(squareIndex);

      setTimeout(() => {
        if (squareStates[squareIndex] !== state) return;
        if (state.choiceStatuses[choiceIndex] !== 'fading') return;
        state.choiceStatuses[choiceIndex] = 'removed';
        rerenderSquare(squareIndex);
      }, 1000);
    }, 2000);
  }

  function resolveWithCorrectClicked(state, squareIndex) {
    state.choiceResolved = true;
    state.correctWasClicked = true;
    Sound.playCorrect();

    // Both wrong options show red/cross immediately (un-fading either
    // if one was already mid-fade from an earlier wrong click).
    state.choiceStatuses = state.choiceOrder.map((c, i) => (c.correct ? state.choiceStatuses[i] : 'wrong-shown'));
    rerenderSquare(squareIndex);

    // After a pause, both wrongs fade together and leave a gap - the
    // correct answer stays green+ticked permanently, no rearranging.
    setTimeout(() => {
      if (squareStates[squareIndex] !== state) return;
      state.choiceStatuses = state.choiceOrder.map((c, i) => (c.correct ? state.choiceStatuses[i] : 'fading'));
      rerenderSquare(squareIndex);

      setTimeout(() => {
        if (squareStates[squareIndex] !== state) return;
        state.choiceStatuses = state.choiceOrder.map((c, i) => (c.correct ? state.choiceStatuses[i] : 'removed'));
        rerenderSquare(squareIndex);
      }, 1000);
    }, 2000);
  }

  function handleRefreshQuestion(index) {
    const previous = squares[index]; // what this square showed just before this refresh

    if (gridMode === '4') {
      while (refreshQueue.length > 0) {
        const sourceIndex = refreshQueue.shift();
        const sourceSquare = squares[sourceIndex];
        if (sourceSquare) {
          applyReplacement(index, sourceSquare.question, sourceSquare.levelTarget, previous);
          return;
        }
      }
      // Queue exhausted (or the hidden squares it pointed to were
      // already blank) - fall through to the normal random refresh.
    }

    const currentlyDisplayed = new Set(
      squares
        .filter((s, i) => s && i !== index)
        .map(s => s.question)
    );
    const levelTarget = squares[index].levelTarget;
    const replacement = SelectionEngine.refreshSlot(
      getBasePoolForRefresh(),
      levelTarget,
      config.method,
      currentlyDisplayed
    );

    if (!replacement) {
      flashNoAlternative(index);
      return;
    }

    applyReplacement(index, replacement, levelTarget, previous);
  }

  /**
   * Restores whatever this square showed one refresh ago. Only
   * reachable while the ↩ button is visible (i.e. within
   * UNDO_VISIBLE_MS of the last refresh/undo on this square - see
   * scheduleUndoExpiry). Popping further just keeps walking back
   * through the same square's history, one step per click.
   */
  function handleUndoRefresh(index) {
    const state = squareStates[index];
    if (!state || !state.undoStack || state.undoStack.length === 0) return;

    const restored = state.undoStack.pop();
    const remainingUndoStack = state.undoStack;

    squares[index] = restored;
    squareStates[index] = {
      activePanel: null,
      choiceOrder: null,
      choiceResolved: false,
      questionHidden: false,
      cleared: false,
      studentName: state.studentName,
      studentRevealed: state.studentRevealed,
      shuttered: false,
      color: state.color,
      shutterKind: state.shutterKind,
      shutterHtml: state.shutterHtml,
      zoomOffsets: { question: 0, hint: 0, explain: 0 },
      diagramFlip: { h: Math.random() < 0.5, v: Math.random() < 0.5 },
      undoStack: remainingUndoStack
    };

    if (remainingUndoStack.length > 0) {
      scheduleUndoExpiry(index);
    } else {
      clearUndoTimer(index);
    }

    rerenderSquare(index);
  }

  function clearUndoTimer(index) {
    if (undoTimeoutIds[index]) {
      clearTimeout(undoTimeoutIds[index]);
      undoTimeoutIds[index] = null;
    }
  }

  // Restarts (rather than merely starting) the countdown on every call -
  // called after both a refresh and an undo, so a burst of activity on
  // one square keeps its ↩ button available the whole time, and it only
  // vanishes after UNDO_VISIBLE_MS of that square being left alone.
  function scheduleUndoExpiry(index) {
    clearUndoTimer(index);
    undoTimeoutIds[index] = setTimeout(() => {
      undoTimeoutIds[index] = null;
      const state = squareStates[index];
      if (!state || !state.undoStack || state.undoStack.length === 0) return;
      state.undoStack = [];
      rerenderSquare(index);
    }, UNDO_VISIBLE_MS);
  }

  function applyReplacement(index, question, levelTarget, previousForUndo) {
    const priorState = squareStates[index]; // null if this square was genuinely blank - only reachable via browse/swap (normal refresh never targets a blank square)
    const undoStack = (priorState && priorState.undoStack) || [];
    if (previousForUndo) undoStack.push(previousForUndo);

    squares[index] = { question, levelTarget };
    squareStates[index] = {
      activePanel: null,
      choiceOrder: null,
      choiceResolved: false,
      questionHidden: false,
      cleared: false, // a refreshed question always comes back visible, even if the old one had been cleared
      studentName: priorState ? priorState.studentName : (config.students.length > 0 ? StudentPicker.next(studentQueue) : null),
      studentRevealed: priorState ? priorState.studentRevealed : false,
      shuttered: false, // a square already interacted with (refreshed) stays unshuttered
      color: priorState ? priorState.color : PALETTE[Math.floor(Math.random() * PALETTE.length)],
      shutterKind: priorState ? priorState.shutterKind : null,
      shutterHtml: priorState ? priorState.shutterHtml : null,
      diagramFlip: { h: Math.random() < 0.5, v: Math.random() < 0.5 },
      // Fresh content gets a fresh zoom level, same reasoning as a
      // whole new grid - this was also missing outright before, which
      // was the actual cause of zoom silently breaking after a
      // refresh: state.zoomOffsetRem became undefined, then
      // undefined + delta evaluated to NaN on the next click, which -
      // once stored - stayed NaN forever after (NaN + anything is
      // still NaN), even though the render code's `|| 0` fallback
      // masked it by always visually defaulting back to 0.
      zoomOffsets: { question: 0, hint: 0, explain: 0 },
      undoStack
    };

    if (undoStack.length > 0) scheduleUndoExpiry(index);

    rerenderSquare(index);
  }

  /**
   * Opens or closes the browse/swap overlay. Only ever available in
   * 9-square mode (the header button is disabled otherwise - see
   * app.js). Opening it force-reveals every shutter (this is a
   * prep-time tool: never expose upcoming questions live off the back
   * of it) and freezes the grid underneath a numbered target on every
   * square. Returns the new state (true = now open).
   */
  function toggleBrowseMode() {
    if (gridMode !== '9') return browseModeActive;

    browseModeActive = !browseModeActive;

    if (browseModeActive) {
      squareStates.forEach(state => { if (state) state.shuttered = false; });
      stopShutterPulse();

      browsePool = buildBrowsePool();
      browsePage = 0;
      openPickerIndex = null;

      // The header stays pinned (position: sticky) while the page
      // scrolls through extra candidates below the frozen grid - it
      // needs to know its own rendered height to size the grid to
      // exactly fill the rest of the viewport underneath it.
      const header = document.querySelector('#gridView .board--grid');
      if (header && el.gridView) {
        el.gridView.style.setProperty('--browse-header-h', header.getBoundingClientRect().height + 'px');
      }
      if (el.gridView) el.gridView.classList.add('browsing');
      if (el.browsePanel) el.browsePanel.hidden = false;
    } else {
      browsePool = [];
      browsePage = 0;
      openPickerIndex = null;
      if (el.gridView) el.gridView.classList.remove('browsing');
      if (el.browsePanel) el.browsePanel.hidden = true;
    }

    render();
    if (browseModeActive) renderBrowsePanel();
    return browseModeActive;
  }

  /**
   * Builds the ordered list of candidate questions for a browse
   * session: whatever's in the current pool (topic-filtered, same as
   * a normal refresh) minus whatever the 9 squares are currently
   * showing. When the grid has level targets in play (e.g. Level 1-3
   * progressive), candidates are interleaved across those levels first
   * - so early pages offer a spread across levels rather than
   * happening to be dominated by one - and only once a level's
   * candidates run out does the list fall back to whatever's left over
   * from any level. A bank with no level structure (Full random mix)
   * has nothing to match, so it's just offered in a random order.
   */
  function buildBrowsePool() {
    const shown = new Set(squares.filter(Boolean).map(s => s.question));
    const remaining = getBasePoolForRefresh().filter(q => !shown.has(q));

    const levelsInPlay = [];
    squares.forEach(s => {
      if (s && s.levelTarget !== null && s.levelTarget !== undefined && !levelsInPlay.includes(s.levelTarget)) {
        levelsInPlay.push(s.levelTarget);
      }
    });

    if (levelsInPlay.length === 0) return shuffle(remaining);

    const buckets = new Map(levelsInPlay.map(l => [l, []]));
    const leftover = [];
    remaining.forEach(q => {
      if (buckets.has(q.level)) buckets.get(q.level).push(q);
      else leftover.push(q);
    });
    buckets.forEach((arr, l) => buckets.set(l, shuffle(arr)));

    const ordered = [];
    let anyLeft = true;
    while (anyLeft) {
      anyLeft = false;
      for (const l of levelsInPlay) {
        const bucket = buckets.get(l);
        if (bucket.length) {
          ordered.push(bucket.shift());
          anyLeft = true;
        }
      }
    }
    return ordered.concat(shuffle(leftover));
  }

  function renderBrowseCard(q, globalIndex) {
    const isOpen = openPickerIndex === globalIndex;
    const hasLevel = q.level !== null && q.level !== undefined;
    const hasDiagram = !!q.diagramType;
    const pickerHtml = isOpen ? `
      <div class="browse-card__picker">
        ${squares.map((s, i) => `<button class="browse-card__picker-btn" data-swap-target="${i}" title="Replace question ${i + 1}">${i + 1}</button>`).join('')}
      </div>
    ` : '';

    // No pinned flip here (unlike the live grid) - a browse card only
    // ever renders once per page view, so there's no re-render to be
    // stable against. Caption is embedded in the SVG itself (see
    // trigPythagDiag.js), so the separate question text below is
    // skipped entirely for a diagram card - showing both would just
    // repeat the same short prompt twice.
    const diagramSvg = hasDiagram
      ? DiagramRenderer.renderDiagram(q.diagramType, q.diagramParams, { promptText: q.question })
      : '';

    return `
      <div class="browse-card${isOpen ? ' browse-card--open' : ''}" data-browse-index="${globalIndex}">
        ${hasLevel ? `<span class="browse-card__level">L${escapeHtml(q.level)}</span>` : ''}
        ${diagramSvg ? `<div class="browse-card__diagram">${diagramSvg}</div>` : `<div class="browse-card__question">${renderMath(q.question)}</div>`}
        ${pickerHtml}
      </div>
    `;
  }

  function renderBrowsePanel() {
    if (!el.browseGrid || !el.browsePager) return;

    if (browsePool.length === 0) {
      el.browseGrid.innerHTML = '<p class="browse-panel__empty">No other questions are available for this selection.</p>';
      el.browsePager.innerHTML = '';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(browsePool.length / BROWSE_PAGE_SIZE));
    if (browsePage >= totalPages) browsePage = totalPages - 1;
    if (browsePage < 0) browsePage = 0;

    const start = browsePage * BROWSE_PAGE_SIZE;
    const end = Math.min(start + BROWSE_PAGE_SIZE, browsePool.length);

    // Which questions land in this batch of (up to) 30 is still
    // decided by buildBrowsePool's level-matched interleave above -
    // this just re-sorts that fixed batch for display, L1s first
    // through L3s last (anything untagged goes after), so the
    // swap-target index each card carries stays tied to its real
    // position in browsePool regardless of the on-screen reordering.
    const pageEntries = browsePool.slice(start, end).map((q, i) => ({ question: q, globalIndex: start + i }));
    pageEntries.sort((a, b) => {
      const la = (a.question.level === null || a.question.level === undefined) ? Infinity : a.question.level;
      const lb = (b.question.level === null || b.question.level === undefined) ? Infinity : b.question.level;
      return la - lb;
    });

    el.browseGrid.innerHTML = pageEntries.map(entry => renderBrowseCard(entry.question, entry.globalIndex)).join('');

    // Left/right either side of the count, per request - left steps
    // back to the previous batch offered, right moves on to the next.
    // Nothing to say when everything fits on one page (30 or fewer) -
    // a static, never-changing count would just be noise there.
    if (totalPages <= 1) {
      el.browsePager.innerHTML = '';
    } else {
      el.browsePager.innerHTML = `
        <button class="browse-panel__nav" data-page-nav="prev" ${browsePage === 0 ? 'disabled' : ''} title="Previous questions">‹</button>
        <span class="browse-panel__count">${start + 1}-${end} of ${browsePool.length} additional questions</span>
        <button class="browse-panel__nav" data-page-nav="next" ${browsePage >= totalPages - 1 ? 'disabled' : ''} title="Next questions">›</button>
      `;
    }
  }

  function onBrowsePanelClick(e) {
    const pickerBtn = e.target.closest('[data-swap-target]');
    if (pickerBtn) {
      const card = e.target.closest('.browse-card');
      performBrowseSwap(Number(card.dataset.browseIndex), Number(pickerBtn.dataset.swapTarget));
      return;
    }

    const card = e.target.closest('.browse-card');
    if (card) {
      const globalIndex = Number(card.dataset.browseIndex);
      openPickerIndex = (openPickerIndex === globalIndex) ? null : globalIndex;
      renderBrowsePanel();
      return;
    }

    const pagerBtn = e.target.closest('[data-page-nav]');
    if (pagerBtn) {
      const totalPages = Math.max(1, Math.ceil(browsePool.length / BROWSE_PAGE_SIZE));
      if (pagerBtn.dataset.pageNav === 'prev' && browsePage > 0) browsePage--;
      if (pagerBtn.dataset.pageNav === 'next' && browsePage < totalPages - 1) browsePage++;
      openPickerIndex = null;
      renderBrowsePanel();
    }
  }

  /**
   * Drops browsePool[globalIndex] into squares[targetIndex], reusing
   * applyReplacement so a browse swap gets the same undo-within-5s
   * safety net as a normal refresh. Whatever targetIndex held before
   * (including nothing, if it was a genuinely blank square) goes back
   * into browsePool at the same slot so it stays available to browse
   * further in this session, rather than reshuffling the whole list.
   */
  function performBrowseSwap(globalIndex, targetIndex) {
    const candidate = browsePool[globalIndex];
    if (!candidate) return;

    const targetSquare = squares[targetIndex]; // may be null - a blank square is a valid swap target
    const levelTarget = targetSquare ? targetSquare.levelTarget : null;

    applyReplacement(targetIndex, candidate, levelTarget, targetSquare);

    if (targetSquare) {
      browsePool[globalIndex] = targetSquare.question;
    } else {
      browsePool.splice(globalIndex, 1);
    }

    openPickerIndex = null;
    renderBrowsePanel();
  }

  function getBasePoolForRefresh() {
    if (cachedBasePool) return cachedBasePool;
    cachedBasePool = (config.topics && config.topics.length)
      ? config.questions.filter(q => config.topics.includes(q.topic))
      : config.questions.slice();
    return cachedBasePool;
  }

  function handleStudentIconClick(index) {
    const state = squareStates[index];
    if (!state.studentRevealed) {
      state.studentRevealed = true;
    } else {
      const shownElsewhere = new Set(
        squareStates
          .filter((s, i) => s && s.studentRevealed && i !== index)
          .map(s => s.studentName)
      );
      shownElsewhere.add(state.studentName);
      let replacement = StudentPicker.randomExcluding(config.students, shownElsewhere);

      // With a small class (or once every square has been revealed via
      // the global "show all" button), every other student may already
      // be showing somewhere else on the grid, leaving no candidate
      // that avoids all of them - that used to make refresh silently
      // do nothing ("the choice is fixed"). Falling back to "just pick
      // someone other than who's currently in THIS box" guarantees the
      // click always changes something, even if that means briefly
      // duplicating a name shown elsewhere.
      if (!replacement) {
        replacement = StudentPicker.randomExcluding(config.students, new Set([state.studentName]));
      }

      if (replacement) state.studentName = replacement;
    }
    rerenderSquare(index);
  }

  function toggleGlobalStudents() {
    if (browseModeActive) return;
    if (config.students.length === 0) return 'no-students';
    globalRevealed = !globalRevealed;
    squareStates.forEach(state => {
      if (state) state.studentRevealed = globalRevealed;
    });
    render();
  }

  function hideAllShutters() {
    if (browseModeActive) return;
    squareStates.forEach(state => {
      if (state) state.shuttered = true;
    });
    render();
  }

  function revealAllShutters() {
    if (browseModeActive) return;
    squareStates.forEach(state => {
      if (state) state.shuttered = false;
    });
    render();
  }

  function flashNoAlternative(index) {
    const squareEl = el.container.querySelector(`.square[data-index="${index}"]`);
    if (!squareEl) return;
    squareEl.classList.add('square--noalt');
    setTimeout(() => squareEl.classList.remove('square--noalt'), 400);
  }

  function rerenderSquare(index) {
    const oldEl = el.container.querySelector(`.square[data-index="${index}"]`);
    const newEl = renderSquare(squares[index], squareStates[index], index);
    oldEl.replaceWith(newEl);
    if (browseModeActive) attachBrowseBadge(newEl, index);
    autosizeSquare(newEl, squareStates[index]);
  }

  // The numbered red target overlaid on each square while browse/swap
  // is open. Appended after the fact rather than baked into
  // renderSquare's own markup, since it needs to appear on every
  // square regardless of which of renderSquare's early-return branches
  // (blank, cleared, normal) fired - a blank or cleared square is
  // still a valid swap target.
  function attachBrowseBadge(squareEl, index) {
    const badge = document.createElement('div');
    badge.className = 'square__browse-badge';
    badge.textContent = String(index + 1);
    squareEl.appendChild(badge);
  }

  // Two large "SCROLL" markers straddling the two internal seams of
  // the bottom row (between squares 7&8, and between 8&9) - the
  // "choose replacement questions" panel below the grid is off-screen
  // until scrolled to, so this puts an unmissable cue for it directly
  // on the part of the page that's already in view, rather than
  // relying on the note text at the top of that panel alone. Appended
  // straight onto the grid container (not any one square), positioned
  // at the two column-boundary fractions of an equal 3-column grid.
  function attachScrollArrows() {
    ['33.333%', '66.666%'].forEach(leftPct => {
      const arrow = document.createElement('div');
      arrow.className = 'browse-scroll-arrow';
      arrow.style.left = leftPct;
      arrow.innerHTML = '<span class="browse-scroll-arrow__chevron">▼</span><span class="browse-scroll-arrow__label">SCROLL</span>';
      el.container.appendChild(arrow);
    });
  }

  // ---------------- Text autosizing ----------------
  // Applies to question text, full-replace panel text (hint/answer/
  // explain), and choice button labels - anything whose container size
  // is fixed and must never scroll. Re-run on fullscreen toggle too,
  // since the boxes' pixel dimensions change.

  function autosizeAll() {
    el.container.querySelectorAll('.square').forEach(squareEl => {
      const index = Number(squareEl.dataset.index);
      autosizeSquare(squareEl, squareStates[index]);
    });
  }

  // Which of state.zoomOffsets applies to the question element right
  // now - hint/explain fully replace the question (so their own key
  // applies), but choices/answer split the box with the question still
  // showing above, and were never in the zoom control's scope, so the
  // question's own key applies then too, same as when no panel is open
  // at all.
  function questionZoomKey(state) {
    return (state && (state.activePanel === 'hint' || state.activePanel === 'explain'))
      ? state.activePanel
      : 'question';
  }

  function autosizeSquare(squareEl, state) {
    if (!squareEl) return;
    const zoomOffsets = (state && state.zoomOffsets) || {};

    // Answer box / panel text size first, since their footprint can
    // change how much vertical space is left for the question above
    // them - sizing the question before them would measure a stale
    // container height and under- or over-shrink it.
    const answerBox = squareEl.querySelector('.answer-box');
    if (answerBox) autosizeElement(answerBox, 1.15, 0.65);

    // No automatic "prefer one line" behaviour here (removed - it kept
    // fighting the manual zoom control below, since it would shrink
    // things back down regardless of where +/- had set the starting
    // size). Sizing is purely: fit the box, then apply whatever manual
    // offset the person has clicked to for whichever of
    // question/hint/explain is currently showing - each remembers its
    // own independently (see questionZoomKey above and the click
    // handler in onGridClick).
    const panelKey = state ? state.activePanel : null;
    const panelOffset = (panelKey && zoomOffsets[panelKey]) || 0;
    const panelText = squareEl.querySelector('.panel-text');
    if (panelText) autosizeElement(panelText, 1.15 + panelOffset, 0.65 + panelOffset);

    const questionOffset = zoomOffsets[questionZoomKey(state)] || 0;
    const question = squareEl.querySelector('.square__question:not([hidden])');
    // A diagram square has no text in .square__question to size - the
    // SVG fills it via CSS (width/height: 100%) regardless of zoom.
    if (question && !question.classList.contains('square__question--diagram')) {
      autosizeElement(question, 1.3 + questionOffset, 0.7 + questionOffset, true);
    }

    const shutterText = squareEl.querySelector('.square__shutter-text');
    if (shutterText) autosizeElement(shutterText, 2.2, 1.2);

    squareEl.querySelectorAll('.choice-btn__label').forEach(label => {
      autosizeElement(label, 0.95, 0.6);
    });
  }

  function autosizeElement(el, maxRem, minRem, measureSelf) {
    const container = measureSelf ? el : el.parentElement;

    // A stacked column vector like [a/b] can be visually taller or
    // wider than a line of plain text at the same font-size, which can
    // make this loop hit its usual floor before the line has actually
    // narrowed enough to stop wrapping, and wrapping mid-line is worse
    // than going smaller, so it gets a lower floor.
    const hasWideAtomic = !!el.querySelector('.vector');
    const effectiveMinRem = hasWideAtomic ? Math.min(minRem, 0.45) : minRem;

    let size = maxRem;
    el.style.fontSize = size + 'rem';
    let guard = 0;
    while (
      (el.scrollHeight > container.clientHeight || el.scrollWidth > container.clientWidth) &&
      size > effectiveMinRem &&
      guard < 40
    ) {
      size -= 0.03;
      el.style.fontSize = size + 'rem';
      guard++;
    }
  }

  // ---------------- Utilities ----------------

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  return { init, generate, generateFromSaved, getSaveData, toggleGlobalStudents, hideAllShutters, revealAllShutters, autosizeAll, toggleGridMode, toggleBrowseMode };
})();
