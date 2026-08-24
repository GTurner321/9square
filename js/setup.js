// Question Grid — setup view controller
// Owns everything on the landing page: loading the CSVs, the four-way
// selection method (Pearson book / Dr Frost skill numbers / Year-course
// / saved starter), the student paste-in box, and building the config
// object that Generate hands off to the grid.

const Setup = (() => {

  let currentMethod = 'pearsonBook'; // 'pearsonBook' | 'wrm' | 'dfRefs' | 'saved'

  let practiceSet = [];          // full practice set, loaded once
  let pearsonBooks = [];         // full Pearson books map, loaded once
  let wrmSet = [];                // full White Rose map, loaded once
  let dfTally = [];              // DF Topic # -> DF Topic Name lookup, loaded once (search index for the Dr Frost skill-name search)
  let books = [];                 // unique book names, in sheet order
  let currentChapterFlatItems = []; // {book, chapter} pairs, parallel to chapterChecklist's rendered indices
  let currentSubtopicRows = [];   // Pearson-books rows available for the selected chapters (single-book mode only)
  let currentSubtopicFlatItems = []; // rows parallel to subtopicChecklist's rendered (grouped-by-chapter) indices

  let currentBlockFlatItems = [];  // block names, parallel to blockChecklist's rendered indices
  let currentSmallStepRows = [];   // White Rose rows available for the selected year + blocks
  let currentSmallStepFlatItems = []; // rows parallel to smallStepChecklist's rendered (grouped-by-block) indices

  let students = [];             // parsed, deduped student names
  let savedQuizzes = [];         // valid (non-expired) saved starters
  let savedGroups = [];          // saved class lists (group1..group10)

  const el = {}; // populated in init() once the DOM exists

  function init() {
    cacheElements();
    bindChecklistSelectAll(el.bookChecklist);
    bindChecklistSelectAll(el.chapterChecklist);
    bindChecklistSelectAll(el.subtopicChecklist);
    bindChecklistSelectAll(el.yearChecklist);
    bindChecklistSelectAll(el.blockChecklist);
    bindChecklistSelectAll(el.smallStepChecklist);
    bindEvents();
    loadData();
    loadSavedQuizzes();
    loadSavedGroups();
    setupDfRefsLink();
    switchMethod('pearsonBook');
    switchStudentMethod('fresh');
  }

  function cacheElements() {
    el.methodTabs = document.getElementById('methodTabs');

    el.panelPearsonBook = document.getElementById('panelPearsonBook');
    el.panelWrm = document.getElementById('panelWrm');
    el.panelDfRefs = document.getElementById('panelDfRefs');
    el.panelSaved = document.getElementById('panelSaved');
    el.commonQuizFields = document.getElementById('commonQuizFields');
    el.questionLevelField = document.getElementById('questionLevelField');
    el.poolCountHint = document.getElementById('poolCountHint');
    el.calculatorField = document.getElementById('calculatorField');

    el.bookChecklist = document.getElementById('bookChecklist');
    el.chaptersField = document.getElementById('chaptersField');
    el.chapterChecklist = document.getElementById('chapterChecklist');
    el.chapterHelp = document.getElementById('chapterHelp');
    el.subtopicField = document.getElementById('subtopicField');
    el.subtopicChecklist = document.getElementById('subtopicChecklist');
    el.subtopicHelp = document.getElementById('subtopicHelp');

    el.yearChecklist = document.getElementById('yearChecklist');
    el.blocksField = document.getElementById('blocksField');
    el.blockChecklist = document.getElementById('blockChecklist');
    el.blockHelp = document.getElementById('blockHelp');
    el.smallStepsField = document.getElementById('smallStepsField');
    el.smallStepChecklist = document.getElementById('smallStepChecklist');
    el.smallStepHelp = document.getElementById('smallStepHelp');

    el.dfRefsInput = document.getElementById('dfRefsInput');
    el.dfRefsLookupLink = document.getElementById('dfRefsLookupLink');
    el.dfSkillSearchInput = document.getElementById('dfSkillSearchInput');
    el.dfSkillPreview = document.getElementById('dfSkillPreview');
    el.dfSkillPreviewFooter = document.getElementById('dfSkillPreviewFooter');
    el.dfSkillSelectedField = document.getElementById('dfSkillSelectedField');
    el.dfSkillChips = document.getElementById('dfSkillChips');


    el.savedQuizSelect = document.getElementById('savedQuizSelect');
    el.savedQuizHint = document.getElementById('savedQuizHint');

    el.levelSelect = document.getElementById('levelSelect');
    el.levelCountHint = document.getElementById('levelCountHint');

    el.calculatorSelect = document.getElementById('calculatorSelect');

    el.studentMethodTabs = document.getElementById('studentMethodTabs');
    el.panelStudentsFresh = document.getElementById('panelStudentsFresh');
    el.panelStudentsSaved = document.getElementById('panelStudentsSaved');
    el.savedGroupSelect = document.getElementById('savedGroupSelect');
    el.studentsInput = document.getElementById('studentsInput');
    el.addStudentsBtn = document.getElementById('addStudentsBtn');
    el.saveClassListBtn = document.getElementById('saveClassListBtn');
    el.studentsSummary = document.getElementById('studentsSummary');

    el.generateBtn = document.getElementById('generateBtn');
    el.statusMessage = document.getElementById('statusMessage');
  }

  function bindEvents() {
    el.methodTabs.addEventListener('click', onMethodTabClick);
    el.studentMethodTabs.addEventListener('click', onStudentMethodTabClick);

    el.bookChecklist.addEventListener('change', onBookChecklistChange);
    el.chapterChecklist.addEventListener('change', onChapterChecklistChange);
    el.subtopicChecklist.addEventListener('change', onSelectionChanged);
    el.yearChecklist.addEventListener('change', onYearChecklistChange);
    el.blockChecklist.addEventListener('change', onBlockChecklistChange);
    el.smallStepChecklist.addEventListener('change', onSelectionChanged);
    el.dfRefsInput.addEventListener('input', onSelectionChanged);
    el.dfSkillSearchInput.addEventListener('input', onDfSkillSearchInput);
    el.dfSkillPreview.addEventListener('click', onDfSkillPreviewClick);
    el.dfSkillChips.addEventListener('click', onDfSkillChipsClick);
    el.savedQuizSelect.addEventListener('change', onSavedQuizChange);
    el.savedGroupSelect.addEventListener('change', onSavedGroupChange);
    el.levelSelect.addEventListener('change', updateQuestionCounts);
    el.calculatorSelect.addEventListener('change', onSelectionChanged);

    el.addStudentsBtn.addEventListener('click', onAddStudents);
    el.saveClassListBtn.addEventListener('click', onSaveClassList);

    el.generateBtn.addEventListener('click', onGenerate);
  }

  function setupDfRefsLink() {
    if (CONFIG.DF_REFS_SHEET_URL) {
      el.dfRefsLookupLink.href = CONFIG.DF_REFS_SHEET_URL;
      el.dfRefsLookupLink.hidden = false;
    } else {
      el.dfRefsLookupLink.hidden = true;
    }
  }

  // ---------------- Method tabs ----------------

  function onMethodTabClick(e) {
    const btn = e.target.closest('.method-tab');
    if (!btn) return;
    switchMethod(btn.dataset.method);
  }

  function switchMethod(method) {
    currentMethod = method;

    Array.from(el.methodTabs.querySelectorAll('.method-tab')).forEach(btn => {
      btn.classList.toggle('method-tab--active', btn.dataset.method === method);
    });

    el.panelPearsonBook.hidden = method !== 'pearsonBook';
    el.panelWrm.hidden = method !== 'wrm';
    el.panelDfRefs.hidden = method !== 'dfRefs';
    el.panelSaved.hidden = method !== 'saved';
    el.commonQuizFields.hidden = method === 'saved';

    el.generateBtn.textContent = method === 'saved' ? 'Load saved starter' : 'Generate';
    setStatus('');
    onSelectionChanged();
  }

  // ---------------- Student method tabs ----------------

  let currentStudentMethod = 'fresh'; // 'fresh' | 'saved'

  function onStudentMethodTabClick(e) {
    const btn = e.target.closest('.method-tab');
    if (!btn) return;
    switchStudentMethod(btn.dataset.method);
  }

  function switchStudentMethod(method) {
    currentStudentMethod = method;

    Array.from(el.studentMethodTabs.querySelectorAll('.method-tab')).forEach(btn => {
      btn.classList.toggle('method-tab--active', btn.dataset.method === method);
    });

    el.panelStudentsFresh.hidden = method !== 'fresh';
    el.panelStudentsSaved.hidden = method !== 'saved';

    // Require an explicit action in whichever tab is now active (Add
    // students, or picking a saved group) rather than silently reusing
    // whatever the other tab had set - avoids students staying loaded
    // from a saved group while the UI reads as "start fresh", or vice versa.
    students = [];
    el.studentsSummary.textContent = 'No students added yet — question squares will show no student banner.';
    if (method === 'saved') {
      el.savedGroupSelect.value = savedGroups.length ? '' : 'none';
    }
  }

  // ---------------- Data loading ----------------

  async function loadData() {
    setStatus('Loading question data…', 'info');
    try {
      const [practice, pearson, wrm, tally] = await Promise.all([
        DataService.loadPracticeSet(),
        DataService.loadPearsonBooks(),
        DataService.loadWrmSet(),
        DataService.loadDfTally()
      ]);
      practiceSet = practice;
      pearsonBooks = pearson;
      wrmSet = wrm;
      dfTally = tally;

      books = [];
      pearson.forEach(row => { if (!books.includes(row.book)) books.push(row.book); });

      renderChecklist(el.bookChecklist, books.map(b => ({ label: b })), 'Select all', false);

      initWrmYearChecklist();

      setStatus('');
    } catch (err) {
      setStatus(`Couldn't load question data: ${err.message}`, 'error');
    }
    onSelectionChanged();
  }

  // ---------------- Reusable checklist-with-select-all ----------------

  /**
   * Renders a checklist of checkboxes into `container`, with a
   * "select all" master row at the top that both drives and reflects
   * the state of every item below it. `items` is an array of
   * { label } - the caller reads back which *indices* ended up
   * checked via readCheckedIndices(container).
   */
  function renderChecklist(container, items, selectAllLabel, defaultChecked) {
    container.innerHTML = '';

    if (!items.length) {
      return;
    }

    const selectAllRow = document.createElement('label');
    selectAllRow.className = 'checklist-select-all';
    selectAllRow.innerHTML = `<input type="checkbox" data-role="select-all"><span>${escapeHtml(selectAllLabel)}</span>`;
    container.appendChild(selectAllRow);

    items.forEach((item, idx) => {
      const label = document.createElement('label');
      label.innerHTML = `
        <input type="checkbox" data-index="${idx}">
        <span>${escapeHtml(item.label)}</span>
      `;
      container.appendChild(label);
    });

    const selectAllCb = container.querySelector('[data-role="select-all"]');
    const itemCbs = Array.from(container.querySelectorAll('input[data-index]'));
    itemCbs.forEach(cb => { cb.checked = defaultChecked; });
    selectAllCb.checked = defaultChecked;
  }

  /**
   * Like renderChecklist, but items are organised into groups, each
   * with its own header row - used for the chapter checklist once more
   * than one book is selected, since chapter names aren't unique across
   * books (every book has its own "Chapter 1"). Headers are only shown
   * when there's more than one group; a single group renders exactly
   * like a flat renderChecklist. `groups` is an array of
   * { header, items: [{ label, data }] } - the caller reads back
   * whichever `data` values ended up checked via
   * readCheckedGroupedData(container, flatItems), where flatItems is
   * this function's return value.
   */
  function renderGroupedChecklist(container, groups, selectAllLabel, defaultChecked) {
    container.innerHTML = '';
    const flatItems = [];

    if (!groups.length) return flatItems;

    const selectAllRow = document.createElement('label');
    selectAllRow.className = 'checklist-select-all';
    selectAllRow.innerHTML = `<input type="checkbox" data-role="select-all"><span>${escapeHtml(selectAllLabel)}</span>`;
    container.appendChild(selectAllRow);

    groups.forEach((group, gi) => {
      if (groups.length > 1) {
        const header = document.createElement('div');
        header.className = 'checklist-group-header' + (gi === 0 ? ' checklist-group-header--first' : '');
        header.textContent = group.header;
        container.appendChild(header);
      }
      group.items.forEach(item => {
        const idx = flatItems.length;
        flatItems.push(item.data);
        const label = document.createElement('label');
        label.innerHTML = `
          <input type="checkbox" data-index="${idx}">
          <span>${escapeHtml(item.label)}</span>
        `;
        container.appendChild(label);
      });
    });

    const selectAllCb = container.querySelector('[data-role="select-all"]');
    const itemCbs = Array.from(container.querySelectorAll('input[data-index]'));
    itemCbs.forEach(cb => { cb.checked = defaultChecked; });
    selectAllCb.checked = defaultChecked;

    return flatItems;
  }

  function bindChecklistSelectAll(container) {
    container.addEventListener('change', e => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;

      const itemCbs = Array.from(container.querySelectorAll('input[data-index]'));
      const selectAllCb = container.querySelector('[data-role="select-all"]');

      if (target.dataset.role === 'select-all') {
        itemCbs.forEach(cb => { cb.checked = target.checked; });
      } else {
        selectAllCb.checked = itemCbs.length > 0 && itemCbs.every(cb => cb.checked);
      }
    });
  }

  function readCheckedIndices(container) {
    return Array.from(container.querySelectorAll('input[data-index]:checked'))
      .map(cb => Number(cb.dataset.index));
  }

  // ---------------- Pearson book flow ----------------

  function getSelectedBooks() {
    return readCheckedIndices(el.bookChecklist).map(idx => books[idx]);
  }

  function onBookChecklistChange() {
    const selectedBooks = getSelectedBooks();

    const groups = selectedBooks.map(book => {
      const chapters = [];
      pearsonBooks.forEach(row => {
        if (row.book === book && !chapters.includes(row.chapter)) chapters.push(row.chapter);
      });
      return {
        header: book,
        items: chapters.map(chapter => ({ label: chapter, data: { book, chapter } }))
      };
    });

    currentChapterFlatItems = renderGroupedChecklist(el.chapterChecklist, groups, 'Select all', false);

    // Chapters (and, in turn, sub-topics) stay hidden entirely until
    // there's actually a book to show chapters for, rather than
    // displaying an empty checklist with a "choose a book" placeholder.
    el.chaptersField.hidden = selectedBooks.length === 0;

    if (!selectedBooks.length) {
      el.chapterChecklist.innerHTML = '<p class="hint">Choose at least one book above.</p>';
    }
    el.chapterHelp.hidden = true;

    onChapterChecklistChange();
  }

  function getSelectedChapterPairs() {
    return readCheckedIndices(el.chapterChecklist).map(idx => currentChapterFlatItems[idx]);
  }

  function onChapterChecklistChange() {
    const selectedBooks = getSelectedBooks();
    const chapterPairs = getSelectedChapterPairs();

    // Sub-topic-level filtering only makes sense with one book on
    // screen - with several books selected, the combined sub-topic
    // list would be too large to be a useful filter, so it's hidden
    // and the pool is built from every sub-topic under the selected
    // chapters directly (equivalent to "everything ticked").
    if (selectedBooks.length === 1 && chapterPairs.length > 0) {
      el.subtopicField.hidden = false;
      const book = selectedBooks[0];
      const chapterNames = chapterPairs.map(p => p.chapter);
      currentSubtopicRows = PoolBuilder.getSubtopicRows(pearsonBooks, book, chapterNames);

      // Grouped by chapter, in the order chapters were selected - each
      // chapter's sub-topics sit under their own header/divider, so a
      // name that happens to repeat across chapters (e.g. "Surds")
      // reads unambiguously without needing a "(chapter)" suffix.
      const groups = chapterNames
        .map(chapter => ({
          header: chapter,
          items: currentSubtopicRows
            .filter(row => row.chapter === chapter)
            .map(row => ({ label: row.subTopic, data: row }))
        }))
        .filter(g => g.items.length > 0);

      currentSubtopicFlatItems = renderGroupedChecklist(el.subtopicChecklist, groups, 'Select all', true);

      if (!currentSubtopicRows.length) {
        el.subtopicChecklist.innerHTML = '<p class="hint">No sub-topics — choose at least one chapter above.</p>';
      }
      el.subtopicHelp.hidden = true;
    } else {
      el.subtopicField.hidden = true;
      currentSubtopicRows = [];
      currentSubtopicFlatItems = [];
    }

    onSelectionChanged();
  }

  function getSelectedSubtopicRows() {
    return readCheckedIndices(el.subtopicChecklist).map(idx => currentSubtopicFlatItems[idx]);
  }

  /**
   * The exact set of Pearson-books rows in play for the current
   * selection - user-filtered sub-topics when one book is selected,
   * or every sub-topic under the selected chapters when several books
   * are selected. Used for both the live pool and the save descriptor,
   * so the two always agree.
   */
  function getEffectiveSubtopicRows() {
    const selectedBooks = getSelectedBooks();
    if (selectedBooks.length === 1) {
      return getSelectedSubtopicRows();
    }
    return PoolBuilder.getSubtopicRowsMultiBook(pearsonBooks, getSelectedChapterPairs());
  }

  // ---------------- White Rose flow ----------------
  // Mirrors the Pearson-book flow above exactly: Year/Course is now a
  // checklist (multiple can be selected, like Books), Blocks are
  // grouped by year once more than one is selected (same as Chapters
  // grouped by book), and Small steps only show with exactly one year
  // selected (same reasoning as Sub-topics: block/small-step names
  // aren't guaranteed unique across years).

  let years = [];  // unique year option values that actually have data, in WRM_YEAR_OPTIONS order

  function initWrmYearChecklist() {
    years = PoolBuilder.WRM_YEAR_OPTIONS
      .map(o => o.value)
      .filter(v => PoolBuilder.getWrmRowsForYear(wrmSet, v).length > 0);
    const items = years.map(v => ({
      label: PoolBuilder.WRM_YEAR_OPTIONS.find(o => o.value === v).label
    }));
    renderChecklist(el.yearChecklist, items, 'Select all', false);
  }

  function getSelectedYears() {
    return readCheckedIndices(el.yearChecklist).map(idx => years[idx]);
  }

  function onYearChecklistChange() {
    const selectedYears = getSelectedYears();

    const groups = selectedYears.map(yearValue => {
      const yearLabel = PoolBuilder.WRM_YEAR_OPTIONS.find(o => o.value === yearValue).label;
      const blocks = [];
      PoolBuilder.getWrmRowsForYear(wrmSet, yearValue).forEach(row => {
        if (!blocks.includes(row.block)) blocks.push(row.block);
      });
      return {
        header: yearLabel,
        items: blocks.map(block => ({ label: block, data: { year: yearValue, block } }))
      };
    });

    currentBlockFlatItems = renderGroupedChecklist(el.blockChecklist, groups, 'Select all', false);

    // Blocks (and, in turn, small steps) stay hidden entirely until
    // there's actually a year/course to show blocks for, same pattern
    // as Chapters/Sub-topics on the Pearson-book side.
    el.blocksField.hidden = selectedYears.length === 0;

    if (!selectedYears.length) {
      el.blockChecklist.innerHTML = '<p class="hint">Choose at least one year/course above.</p>';
    }
    el.blockHelp.hidden = true;

    onBlockChecklistChange();
  }

  function getSelectedBlockPairs() {
    return readCheckedIndices(el.blockChecklist).map(idx => currentBlockFlatItems[idx]);
  }

  function onBlockChecklistChange() {
    const selectedYears = getSelectedYears();
    const blockPairs = getSelectedBlockPairs();

    // Small-step-level filtering only makes sense with one year/course
    // on screen - with several selected, the combined small-step list
    // would be too large to be a useful filter, so it's hidden and the
    // pool is built from every small step under the selected blocks
    // directly (equivalent to "everything ticked").
    if (selectedYears.length === 1 && blockPairs.length > 0) {
      el.smallStepsField.hidden = false;
      const year = selectedYears[0];
      const blocks = blockPairs.map(p => p.block);
      currentSmallStepRows = PoolBuilder.getWrmSmallStepRows(wrmSet, year, blocks);

      // Grouped by block, in the order blocks were selected - same
      // reasoning as sub-topics grouped by chapter.
      const groups = blocks
        .map(block => ({
          header: block,
          items: currentSmallStepRows
            .filter(row => row.block === block)
            .map(row => ({ label: row.smallStep, data: row }))
        }))
        .filter(g => g.items.length > 0);

      currentSmallStepFlatItems = renderGroupedChecklist(el.smallStepChecklist, groups, 'Select all', true);

      if (!currentSmallStepRows.length) {
        el.smallStepChecklist.innerHTML = '<p class="hint">No small steps — choose at least one block above.</p>';
      }
      el.smallStepHelp.hidden = true;
    } else {
      el.smallStepsField.hidden = true;
      currentSmallStepRows = [];
      currentSmallStepFlatItems = [];
    }

    onSelectionChanged();
  }

  function getSelectedSmallStepRows() {
    return readCheckedIndices(el.smallStepChecklist).map(idx => currentSmallStepFlatItems[idx]);
  }

  /**
   * The exact set of White Rose rows in play for the current
   * selection - user-filtered small steps when one year/course is
   * selected, or every small step under the selected blocks when
   * several years are selected. Used for both the live pool and the
   * save descriptor, so the two always agree (mirrors
   * getEffectiveSubtopicRows).
   */
  function getEffectiveWrmSmallStepRows() {
    const selectedYears = getSelectedYears();
    if (selectedYears.length === 1) {
      return getSelectedSmallStepRows();
    }
    return PoolBuilder.getWrmSmallStepRowsMultiYear(wrmSet, getSelectedBlockPairs());
  }

  // ---------------- Dr Frost skill numbers flow ----------------

  function parseDfRefsInput() {
    return el.dfRefsInput.value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n));
  }

  // ---------------- Dr Frost skill search-by-name ----------------
  // A friendlier way to build the same comma-separated number list
  // above, not a parallel system: picking a match just appends its
  // number into dfRefsInput (deduped), and removing a "chip" here
  // removes that number back out. Manual edits to the number box itself
  // are left alone either way - chips are a picking aid, not a strict
  // two-way mirror of whatever's currently typed there.

  const DF_MATCH_LIMIT_SHORT = 10; // 1-3 letter queries - these tend to be broad, so stay tight
  const DF_MATCH_LIMIT_LONG = 50;  // 4+ letter queries - specific enough to be generous with
  let selectedDfSkills = []; // [{ topicNum, topicName }], accumulated across searches

  function searchDfTally(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return dfTally.filter(row => (row.topicName || '').toLowerCase().includes(q));
  }

  function onDfSkillSearchInput() {
    const query = el.dfSkillSearchInput.value;
    const trimmed = query.trim();
    if (!trimmed) {
      el.dfSkillPreview.hidden = true;
      el.dfSkillPreview.innerHTML = '';
      el.dfSkillPreviewFooter.hidden = true;
      return;
    }

    // Already-picked topics drop out of the list entirely (they're
    // already shown as a chip below) rather than staying clickable and
    // risking a confusing double-add.
    const pickedNums = new Set(selectedDfSkills.map(s => s.topicNum));
    const matches = searchDfTally(query).filter(row => !pickedNums.has(row.topicNum));

    if (!matches.length) {
      el.dfSkillPreview.innerHTML = '<p class="hint">No matching skills/topics found.</p>';
      el.dfSkillPreview.hidden = false;
      el.dfSkillPreviewFooter.hidden = true;
      return;
    }

    const isShortQuery = trimmed.length <= 3;
    const limit = isShortQuery ? DF_MATCH_LIMIT_SHORT : DF_MATCH_LIMIT_LONG;
    const shown = matches.slice(0, limit);

    const rows = shown.map(row =>
      `<button type="button" class="df-search-preview__item" data-topic-num="${row.topicNum}">${row.topicNum}. ${escapeHtml(row.topicName)}</button>`
    ).join('');

    // A short (1-3 letter) query tends to be too broad to say anything
    // useful about the count, so it just nudges toward typing more.
    // Once there's an actual count worth showing (4+ letters), a small
    // enough result list (4 or fewer matches) drops the "keep typing"
    // suggestion entirely - there's nothing left to narrow.
    let footer;
    if (isShortQuery) {
      footer = 'Keep typing to narrow it down.';
    } else if (matches.length > limit) {
      footer = `Showing ${limit} of ${matches.length} — keep typing to narrow it down.`;
    } else if (matches.length <= 4) {
      footer = `${matches.length} skill${matches.length === 1 ? '' : 's'} found.`;
    } else {
      footer = `${matches.length} skill${matches.length === 1 ? '' : 's'} found — keep typing to narrow it down.`;
    }

    // Footer sits outside/below the scrollable list (a separate element,
    // not part of its innerHTML) specifically so it's always visible
    // without having to scroll down through the results first.
    el.dfSkillPreview.innerHTML = rows;
    el.dfSkillPreview.hidden = false;
    el.dfSkillPreviewFooter.textContent = footer;
    el.dfSkillPreviewFooter.hidden = false;
  }

  function onDfSkillPreviewClick(e) {
    const item = e.target.closest('.df-search-preview__item');
    if (!item) return;

    const topicNum = Number(item.dataset.topicNum);
    const row = dfTally.find(r => r.topicNum === topicNum);
    if (!row || selectedDfSkills.some(s => s.topicNum === topicNum)) return; // already picked

    selectedDfSkills.push({ topicNum: row.topicNum, topicName: row.topicName });
    addDfRefNumber(topicNum);
    renderDfSkillChips();
    onDfSkillSearchInput(); // refresh the list so the just-picked item drops out of it
  }

  function addDfRefNumber(num) {
    const current = parseDfRefsInput();
    if (current.includes(num)) return;
    const text = el.dfRefsInput.value.trim();
    el.dfRefsInput.value = text ? `${text}, ${num}` : String(num);
    onSelectionChanged();
  }

  function removeDfRefNumber(num) {
    const current = parseDfRefsInput().filter(n => n !== num);
    el.dfRefsInput.value = current.join(', ');
    onSelectionChanged();
  }

  function renderDfSkillChips() {
    el.dfSkillSelectedField.hidden = selectedDfSkills.length === 0;
    el.dfSkillChips.innerHTML = selectedDfSkills.map(s => `
      <span class="df-skill-chip">
        ${escapeHtml(s.topicName)}
        <button type="button" class="df-skill-chip__remove" data-topic-num="${s.topicNum}" title="Remove">✕</button>
      </span>
    `).join('');
  }

  function onDfSkillChipsClick(e) {
    const btn = e.target.closest('.df-skill-chip__remove');
    if (!btn) return;
    const topicNum = Number(btn.dataset.topicNum);
    selectedDfSkills = selectedDfSkills.filter(s => s.topicNum !== topicNum);
    removeDfRefNumber(topicNum);
    renderDfSkillChips();
    onDfSkillSearchInput(); // the removed item should reappear in the list if its search term is still active
  }

  // ---------------- Saved starters ----------------

  function loadSavedQuizzes() {
    savedQuizzes = SaveQuiz.listValid();

    if (!savedQuizzes.length) {
      el.savedQuizSelect.innerHTML = '<option value="none">None saved yet</option>';
      return;
    }

    el.savedQuizSelect.innerHTML = '<option value="" disabled selected>Choose a saved starter…</option>';
    savedQuizzes.forEach(sq => {
      try {
        const opt = document.createElement('option');
        opt.value = String(sq.slot);
        opt.textContent = `quiz${sq.slot} — ${PoolBuilder.describeDescriptor(sq.descriptor)} (${SaveQuiz.relativeTime(sq.savedAt)})`;
        el.savedQuizSelect.appendChild(opt);
      } catch (err) {
        // A stale/unreadable saved entry shouldn't be able to break
        // page load for everything else - skip it and carry on.
      }
    });
  }

  function onSavedQuizChange() {
    const usingSaved = !!getSelectedSavedQuiz();
    el.savedQuizHint.hidden = !usingSaved;
    onSelectionChanged();
  }

  function getSelectedSavedQuiz() {
    const val = el.savedQuizSelect.value;
    if (!val || val === 'none') return null;
    return savedQuizzes.find(q => String(q.slot) === val) || null;
  }

  // ---------------- Saved class lists (groups) ----------------

  function loadSavedGroups() {
    savedGroups = SaveClass.listValid();

    if (!savedGroups.length) {
      el.savedGroupSelect.innerHTML = '<option value="none">None saved yet</option>';
      return;
    }

    el.savedGroupSelect.innerHTML = '<option value="" disabled selected>Choose a saved group…</option>';
    savedGroups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = String(g.slot);
      opt.textContent = `group${g.slot} — ${g.students.length} student${g.students.length === 1 ? '' : 's'} (${SaveQuiz.relativeTime(g.savedAt)})`;
      el.savedGroupSelect.appendChild(opt);
    });
  }

  function onSavedGroupChange() {
    const val = el.savedGroupSelect.value;
    const group = val && val !== 'none' ? savedGroups.find(g => String(g.slot) === val) : null;

    if (group) {
      students = group.students.slice();
    } else {
      students = [];
    }
  }

  // ---------------- Students ----------------

  function parseStudentsFromTextarea() {
    const raw = el.studentsInput.value;
    const parsed = raw
      .split(/[\n,\t]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const seen = new Set();
    return parsed.filter(name => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function flashSummarySaved() {
    el.studentsSummary.classList.add('hint-box--saved');
    setTimeout(() => el.studentsSummary.classList.remove('hint-box--saved'), 2200);
  }

  function onAddStudents() {
    students = parseStudentsFromTextarea();
    el.studentsSummary.textContent = students.length
      ? `${students.length} student${students.length === 1 ? '' : 's'} added, assigned randomly to questions.`
      : 'No students added yet — question squares will show no student banner.';
    flashSummarySaved();
  }

  function onSaveClassList() {
    const parsed = parseStudentsFromTextarea();
    if (!parsed.length) {
      el.studentsSummary.textContent = 'Paste at least one name before saving a class list.';
      el.studentsSummary.classList.remove('hint-box--saved');
      return;
    }
    students = parsed;
    const slotName = SaveClass.save(students);
    el.studentsSummary.textContent = `${students.length} student${students.length === 1 ? '' : 's'} saved as ${slotName} in local storage.`;
    flashSummarySaved();
    loadSavedGroups();
  }

  // ---------------- Pool / level count / generate availability ----------------

  /**
   * The pool for whichever method is currently active, before any
   * level filtering. Returns [] for the saved-starter tab (that path
   * doesn't build a pool live - it's reconstructed on load instead).
   */
  function buildRawPool() {
    if (currentMethod === 'pearsonBook') {
      return PoolBuilder.fromSubtopicRows(practiceSet, getEffectiveSubtopicRows());
    }
    if (currentMethod === 'wrm') {
      return PoolBuilder.fromSubtopicRows(practiceSet, getEffectiveWrmSmallStepRows());
    }
    if (currentMethod === 'dfRefs') {
      return PoolBuilder.fromDfRefs(practiceSet, parseDfRefsInput());
    }
    return [];
  }

  function getCurrentPool() {
    const pool = buildRawPool();
    const calcMode = el.calculatorSelect.value;
    if (calcMode === 'noncalc') return pool.filter(q => q.calculator === 'No');
    if (calcMode === 'calc') return pool.filter(q => q.calculator === 'Yes');
    return pool;
  }

  /**
   * How many questions in `pool` match the given level-select value.
   * Progressive/mix draw from any level, so they report the whole pool.
   */
  function countForLevelMode(pool, levelMode) {
    if (levelMode === '1') return pool.filter(q => q.level === 1).length;
    if (levelMode === '2') return pool.filter(q => q.level === 2).length;
    if (levelMode === '3') return pool.filter(q => q.level === 3).length;
    if (levelMode === 'levels12') return pool.filter(q => q.level === 1 || q.level === 2).length;
    if (levelMode === 'levels23') return pool.filter(q => q.level === 2 || q.level === 3).length;
    return pool.length;
  }

  function onSelectionChanged() {
    updateGenerateAvailability();
    updateQuestionCounts();
    updateCommonFieldsVisibility();
  }

  // Question level (and, once that's visible, Calculator use) stay
  // hidden until there's actually a question selection to apply them
  // to - same "don't show a control until it means something" pattern
  // as Chapters/Sub-topics and Blocks/Small steps above, just gated on
  // "has anything been picked yet" rather than "has a parent choice
  // been made" specifically. Keeps the page more compact by default,
  // which in turn keeps the Generate button in view without scrolling
  // on first load.
  function updateCommonFieldsVisibility() {
    let hasSelection = false;
    if (currentMethod === 'pearsonBook') {
      hasSelection = getSelectedChapterPairs().length > 0;
    } else if (currentMethod === 'wrm') {
      hasSelection = getSelectedBlockPairs().length > 0;
    } else if (currentMethod === 'dfRefs') {
      hasSelection = parseDfRefsInput().length > 0;
    }
    el.questionLevelField.hidden = !hasSelection;
    el.calculatorField.hidden = !hasSelection;
  }

  // Two separate counts: how many questions the topic selection alone
  // offers (above Question level, unaffected by level/calculator), and
  // - only when it actually differs from that - how many remain once
  // level and calculator are also applied. With the defaults (Level
  // 1-3 progressive, Mixed) nothing gets filtered out, so the second
  // line has nothing useful to add and stays hidden.
  function updateQuestionCounts() {
    if (currentMethod === 'saved') {
      el.poolCountHint.hidden = true;
      el.levelCountHint.hidden = true;
      return;
    }

    const rawCount = buildRawPool().length;
    el.poolCountHint.textContent = `${rawCount} question${rawCount === 1 ? '' : 's'} available for this selection.`;
    el.poolCountHint.hidden = false;

    const filteredCount = countForLevelMode(getCurrentPool(), el.levelSelect.value);
    if (filteredCount !== rawCount) {
      el.levelCountHint.textContent = `${filteredCount} question${filteredCount === 1 ? '' : 's'} remain after level and calculator selections.`;
      el.levelCountHint.hidden = false;
    } else {
      el.levelCountHint.hidden = true;
    }
  }

  function updateGenerateAvailability() {
    if (currentMethod === 'pearsonBook') {
      el.generateBtn.disabled = getSelectedChapterPairs().length === 0 || getCurrentPool().length === 0;
    } else if (currentMethod === 'wrm') {
      el.generateBtn.disabled = getSelectedBlockPairs().length === 0 || getCurrentPool().length === 0;
    } else if (currentMethod === 'dfRefs') {
      el.generateBtn.disabled = parseDfRefsInput().length === 0 || getCurrentPool().length === 0;
    } else {
      el.generateBtn.disabled = !getSelectedSavedQuiz();
    }
  }

  // ---------------- Generate / Load ----------------

  function buildConfig() {
    let pool, source;

    if (currentMethod === 'pearsonBook') {
      const subtopicRows = getEffectiveSubtopicRows();
      pool = PoolBuilder.fromSubtopicRows(practiceSet, subtopicRows);
      source = {
        method: 'pearsonBook',
        books: getSelectedBooks(),
        chapters: getSelectedChapterPairs(),
        subtopics: subtopicRows.map(row => ({ book: row.book, chapter: row.chapter, subTopic: row.subTopic }))
      };
    } else if (currentMethod === 'wrm') {
      const smallStepRows = getEffectiveWrmSmallStepRows();
      pool = PoolBuilder.fromSubtopicRows(practiceSet, smallStepRows);
      source = {
        method: 'wrm',
        years: getSelectedYears(),
        blocks: getSelectedBlockPairs(),
        smallSteps: smallStepRows.map(row => ({ yearTags: row.yearTags, block: row.block, smallStep: row.smallStep }))
      };
    } else {
      const dfRefs = parseDfRefsInput();
      pool = PoolBuilder.fromDfRefs(practiceSet, dfRefs);
      source = { method: 'dfRefs', dfRefs };
    }

    // "Levels 1 and 2" / "Levels 2 and 3" aren't understood by
    // SelectionEngine directly - pre-filter the pool to just those
    // levels and hand it "mix" instead, which then just draws from
    // whatever's left.
    let questions = pool;

    // Calculator use is filtered the same way - "Mixed" (the default)
    // leaves the pool untouched, including any rows that don't have
    // the column tagged at all.
    const calcMode = el.calculatorSelect.value;
    if (calcMode === 'noncalc') {
      questions = questions.filter(q => q.calculator === 'No');
    } else if (calcMode === 'calc') {
      questions = questions.filter(q => q.calculator === 'Yes');
    }

    let levelMode = el.levelSelect.value;
    if (levelMode === 'levels12') {
      questions = questions.filter(q => q.level === 1 || q.level === 2);
      levelMode = 'mix';
    } else if (levelMode === 'levels23') {
      questions = questions.filter(q => q.level === 2 || q.level === 3);
      levelMode = 'mix';
    }

    return {
      source,
      questions,
      topics: [],
      method: 'mix', // selection-method dropdown removed - full mix is the only mode
      levelMode,
      students: students.slice()
    };
  }

  function onGenerate() {
    if (currentMethod === 'saved') {
      const savedQuiz = getSelectedSavedQuiz();
      if (savedQuiz) loadSavedStarter(savedQuiz);
      return;
    }

    const config = buildConfig();

    if (config.questions.length === 0) {
      setStatus("No questions found for that selection — this Dr Frost skill hasn't been written into the practice set yet.", 'error');
      return;
    }

    App.showGrid(config);
  }

  function loadSavedStarter(savedQuiz) {
    const pool = PoolBuilder.fromDescriptor(practiceSet, pearsonBooks, wrmSet, savedQuiz.descriptor);

    if (pool.length === 0) {
      setStatus("Couldn't rebuild this saved starter — none of its questions are in the practice set anymore.", 'error');
      return;
    }

    const config = {
      source: savedQuiz.descriptor,
      questions: pool,
      topics: [],
      method: 'mix',
      levelMode: 'mix',
      students: students.slice()
    };

    App.showGridFromSaved(config, savedQuiz.order);
  }

  function setStatus(message, kind) {
    el.statusMessage.textContent = message;
    el.statusMessage.className = 'status' + (kind ? ` status--${kind}` : '');
    el.statusMessage.hidden = !message;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { init };
})();
