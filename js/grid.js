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

  let gridMode = '9';        // '9' | '4'
  const CENTER_INDEX = 4;
  const CORNER_INDICES = [0, 2, 6, 8];
  const HIDDEN_INDICES = [1, 3, 4, 5, 7]; // reading order - the 5 squares dropped in 4-mode
  let refreshQueue = [];     // indices from HIDDEN_INDICES, consumed by refresh while in 4-mode

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

  function renderMath(rawText) {
    let text = escapeHtml(rawText == null ? '' : String(rawText));

    // Roots first, since they also consume a {...} span.
    text = text.replace(/sqrt\{([^{}]+)\}/g, (m, inner) =>
      `<span class="radical"><span class="radical__sym">√</span><span class="radical__body">${inner}</span></span>`);
    text = text.replace(/cbrt\{([^{}]+)\}/g, (m, inner) =>
      `<span class="radical radical--cube"><span class="radical__sym">∛</span><span class="radical__body">${inner}</span></span>`);

    // Exponents and subscripts next, and specifically before the
    // fraction pass below - x^{1/3} is a superscripted "1/3", not a
    // stacked fraction sitting in superscript position, so ^{...}/_{...}
    // need to claim their braces before the generic {a/b} fraction
    // regex gets a chance to see them.
    text = text.replace(/\^(\{[^{}]+\}|-?[A-Za-z0-9])/g, (m, exp) =>
      `<sup>${exp.startsWith('{') ? exp.slice(1, -1) : exp}</sup>`);
    text = text.replace(/_(\{[^{}]+\}|[A-Za-z0-9])/g, (m, sub) =>
      `<sub>${sub.startsWith('{') ? sub.slice(1, -1) : sub}</sub>`);

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
      const slashIndex = inner.indexOf('/');
      if (slashIndex === -1) return m; // no slash - leave the braces as literal text
      const num = inner.slice(0, slashIndex);
      const den = inner.slice(slashIndex + 1);
      const denWider = den.length > num.length;
      return `<span class="frac"><span class="frac__num${denWider ? '' : ' frac__num--line'}">${num}</span><span class="frac__den${denWider ? ' frac__den--line' : ''}">${den}</span></span>`;
    });

    // Column vectors: [top/bottom] - same stacking mechanism as a {}
    // fraction, but square brackets and no dividing line.
    text = text.replace(/\[([^\[\]]+)\]/g, (m, inner) => {
      const slashIndex = inner.indexOf('/');
      if (slashIndex === -1) return m; // no slash - leave the brackets as literal text
      const top = inner.slice(0, slashIndex);
      const bottom = inner.slice(slashIndex + 1);
      return `<span class="vector"><span class="vector__bracket">[</span><span class="vector__stack"><span class="vector__top">${top}</span><span class="vector__bottom">${bottom}</span></span><span class="vector__bracket">]</span></span>`;
    });

    return text;
  }

  function init() {
    el.container = document.getElementById('gridContainer');
    el.container.addEventListener('click', onGridClick);
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

    squareStates = squares.map(square => {
      if (!square) return null;
      return {
        activePanel: null,
        choiceOrder: null,
        choiceResolved: false,
        questionHidden: false,
        studentName: hasStudents ? StudentPicker.next(studentQueue) : null,
        studentRevealed: false,
        shuttered: true,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        shutterKind: null,
        shutterHtml: null
      };
    });

    assignShutterContent([0, 1, 2, 3, 4, 5, 6, 7, 8], SHUTTER_SUMS_9, true);

    gridMode = '9';
    refreshQueue = [];
    globalRevealed = false;
    render();
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

  function render() {
    el.container.innerHTML = '';
    el.container.classList.toggle('grid--four', gridMode === '4');
    visibleIndices().forEach(i => {
      el.container.appendChild(renderSquare(squares[i], squareStates[i], i));
    });
    requestAnimationFrame(autosizeAll);
  }

  /**
   * Switches between the 9-square and 4-square (corners only) layouts.
   * Squares outside the 4-square view aren't destroyed, just not
   * rendered - so switching back to 9 always restores them exactly as
   * they were, with whatever the visible corners did in the meantime
   * left untouched. Returns the new mode.
   */
  function toggleGridMode() {
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

    wrap.innerHTML = `
      <div class="square__content ${isSplit ? 'square__content--split' : ''}">
        <div class="square__question" ${state.activePanel && !isSplit ? 'hidden' : ''}>${renderMath(q.question)}</div>
        ${state.activePanel ? renderPanel(q, state) : ''}
      </div>
      ${showHideToggle ? `<button class="square__hide-question-btn" data-action="toggle-question" title="${state.questionHidden ? 'Show question' : 'Hide question'}">${state.questionHidden ? ICON_EYE_SMALL : ICON_EYE_OFF_SMALL}</button>` : ''}
      <div class="square__footer">
        <div class="square__icons">
          ${showCalcIcon ? `<span class="icon icon--indicator" title="${isCalc ? 'Calculator allowed' : 'No calculator'}">${isCalc ? ICON_CALC : ICON_NO_CALC}</span>` : ''}
          <button class="icon" data-action="answer" title="Show answer" aria-pressed="${state.activePanel === 'answer'}">✓</button>
          ${hasChoices ? `<button class="icon" data-action="choices" title="Show answer choices" aria-pressed="${state.activePanel === 'choices'}">☰</button>` : ''}
          ${hasHint ? `<button class="icon" data-action="hint" title="Show hint" aria-pressed="${state.activePanel === 'hint'}">?</button>` : ''}
          ${hasExplain ? `<button class="icon" data-action="explain" title="Show explanation" aria-pressed="${state.activePanel === 'explain'}">i</button>` : ''}
          <button class="icon" data-action="refresh" title="Choose a different question">↻</button>
        </div>
        ${hasStudents ? renderStudentChip(state) : ''}
      </div>
      ${state.shuttered ? `<div class="square__shutter" data-shutter="true"><span class="square__shutter-text${state.shutterKind === 'title' ? ' square__shutter-text--title' : ''}">${state.shutterKind === 'title' ? '9 SQUARE' : state.shutterHtml}</span></div>` : ''}
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
    const squareEl = e.target.closest('.square');
    if (!squareEl) return;
    const index = Number(squareEl.dataset.index);
    const square = squares[index];
    if (!square) return;
    const state = squareStates[index];

    // A shutter intercepts every click while present - nothing beneath
    // it is reachable until it's removed (one-way, no re-covering).
    const shutter = e.target.closest('.square__shutter');
    if (shutter) {
      state.shuttered = false;
      rerenderSquare(index);
      return;
    }

    const hideQuestionBtn = e.target.closest('[data-action="toggle-question"]');
    if (hideQuestionBtn) {
      state.questionHidden = !state.questionHidden;
      rerenderSquare(index);
      return;
    }

    const panelBtn = e.target.closest('.icon[data-action]');
    if (panelBtn) {
      const action = panelBtn.dataset.action;
      if (action === 'refresh') {
        handleRefreshQuestion(index);
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
    if (gridMode === '4') {
      while (refreshQueue.length > 0) {
        const sourceIndex = refreshQueue.shift();
        const sourceSquare = squares[sourceIndex];
        if (sourceSquare) {
          applyReplacement(index, sourceSquare.question, sourceSquare.levelTarget);
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

    applyReplacement(index, replacement, levelTarget);
  }

  function applyReplacement(index, question, levelTarget) {
    squares[index] = { question, levelTarget };
    squareStates[index] = {
      activePanel: null,
      choiceOrder: null,
      choiceResolved: false,
      questionHidden: false,
      studentName: squareStates[index].studentName,
      studentRevealed: squareStates[index].studentRevealed,
      shuttered: false, // a square already interacted with (refreshed) stays unshuttered
      color: squareStates[index].color,
      shutterKind: squareStates[index].shutterKind,
      shutterHtml: squareStates[index].shutterHtml
    };
    rerenderSquare(index);
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
    if (config.students.length === 0) return;
    globalRevealed = !globalRevealed;
    squareStates.forEach(state => {
      if (state) state.studentRevealed = globalRevealed;
    });
    render();
  }

  function hideAllShutters() {
    squareStates.forEach(state => {
      if (state) state.shuttered = true;
    });
    render();
  }

  function revealAllShutters() {
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
    autosizeSquare(newEl);
  }

  // ---------------- Text autosizing ----------------
  // Applies to question text, full-replace panel text (hint/answer/
  // explain), and choice button labels - anything whose container size
  // is fixed and must never scroll. Re-run on fullscreen toggle too,
  // since the boxes' pixel dimensions change.

  function autosizeAll() {
    el.container.querySelectorAll('.square').forEach(autosizeSquare);
  }

  function autosizeSquare(squareEl) {
    if (!squareEl) return;

    // Answer box / panel text size first, since their footprint can
    // change how much vertical space is left for the question above
    // them - sizing the question before them would measure a stale
    // container height and under- or over-shrink it.
    const answerBox = squareEl.querySelector('.answer-box');
    if (answerBox) autosizeElement(answerBox, 1.15, 0.65);

    const panelText = squareEl.querySelector('.panel-text');
    if (panelText) autosizeElement(panelText, 1.15, 0.65);

    const question = squareEl.querySelector('.square__question:not([hidden])');
    if (question) autosizeElement(question, 1.3, 0.7, true);

    const shutterText = squareEl.querySelector('.square__shutter-text');
    if (shutterText) autosizeElement(shutterText, 2.2, 1.2);

    squareEl.querySelectorAll('.choice-btn__label').forEach(label => {
      autosizeElement(label, 0.95, 0.6);
    });
  }

  function autosizeElement(el, maxRem, minRem, measureSelf) {
    const container = measureSelf ? el : el.parentElement;
    let size = maxRem;
    el.style.fontSize = size + 'rem';
    let guard = 0;
    while (
      (el.scrollHeight > container.clientHeight || el.scrollWidth > container.clientWidth) &&
      size > minRem &&
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

  return { init, generate, generateFromSaved, getSaveData, toggleGlobalStudents, hideAllShutters, revealAllShutters, autosizeAll, toggleGridMode };
})();
