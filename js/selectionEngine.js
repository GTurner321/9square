// Question Grid — selection engine
// Question picking: recency methods, level/topic rules, and
// duplicate-free refresh, for a 3x3 (9-square) grid.

const SelectionEngine = (() => {

  const SQUARE_COUNT = 9;
  const GRID_ROWS = 3;

  /**
   * Returns topics with enough eligible questions to be offered in the
   * "By topic" dropdown, sorted alphabetically, each with a count so the
   * UI can optionally show it (e.g. "Fractions (12)").
   */
  function getEligibleTopics(questions) {
    const counts = {};
    questions.forEach(q => {
      const topic = (q.topic || '').trim();
      if (!topic) return;
      counts[topic] = (counts[topic] || 0) + 1;
    });

    return Object.keys(counts)
      .filter(topic => counts[topic] >= CONFIG.MIN_QUESTIONS_PER_TOPIC)
      .sort((a, b) => a.localeCompare(b))
      .map(topic => ({ topic, count: counts[topic] }));
  }

  /**
   * Whether this bank has enough level-tagged (1-4) questions to make
   * level-specific selection meaningful. Below the threshold, level
   * options should fall back to "Full random mix" only.
   */
  function bankHasUsableLevels(questions) {
    const tagged = questions.filter(q => q.level !== null && q.level >= 1 && q.level <= 4);
    return tagged.length >= CONFIG.MIN_LEVEL_TAGGED_QUESTIONS;
  }

  return { getEligibleTopics, bankHasUsableLevels, generate, refreshSlot, SQUARE_COUNT };

  /**
   * Builds the 9-square (3x3) selection for a Generate action.
   * Returns { squares, basePool } where squares is an array of 9
   * entries, each either:
   *   { question, levelTarget }   - a filled square
   *   null                        - a blank square (pool exhausted)
   * levelTarget is stored per-square so refresh can respect the same
   * row-level rule the square was originally generated with.
   */
  function generate(config) {
    const basePool = (config.topics && config.topics.length)
      ? config.questions.filter(q => config.topics.includes(q.topic))
      : config.questions.slice();

    const levelTargets = computeLevelTargets(config.levelMode);
    const used = new Set();
    const squares = [];

    for (let i = 0; i < SQUARE_COUNT; i++) {
      const levelTarget = levelTargets[i];
      const picked = pickForSlot(basePool, levelTarget, config.method, used);
      if (picked) {
        used.add(picked);
        squares.push({ question: picked, levelTarget });
      } else {
        squares.push(null);
      }
    }

    return { squares, basePool };
  }

  /**
   * Picks a replacement question for one square's refresh action.
   * currentlyDisplayed is the set of question objects currently showing
   * in the *other* 15 squares (never includes this square's own current
   * question, so it's free to be picked again in principle - though in
   * practice it rarely will be, since it's one candidate among many).
   * Returns null if no alternative exists (caller should leave the
   * square as-is and indicate no alternative is available).
   */
  function refreshSlot(basePool, levelTarget, method, currentlyDisplayed) {
    return pickForSlot(basePool, levelTarget, method, currentlyDisplayed);
  }

  function computeLevelTargets(levelMode) {
    if (levelMode === 'progressive') {
      const targets = [];
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_ROWS; col++) targets.push(row + 1);
      }
      return targets;
    }
    if (['1', '2', '3'].includes(levelMode)) {
      return new Array(SQUARE_COUNT).fill(Number(levelMode));
    }
    return new Array(SQUARE_COUNT).fill(null); // 'mix'
  }

  /**
   * Core picking logic shared by generate and refresh.
   * excludeSet: questions that must not be picked (already used /
   * currently displayed elsewhere).
   * levelTarget: if set, prefer questions of that level; fall back to
   * the full (topic-filtered) pool if none of that level remain -
   * i.e. level gives way before topic does.
   */
  function pickForSlot(pool, levelTarget, method, excludeSet) {
    let candidates = pool.filter(q => !excludeSet.has(q));
    if (candidates.length === 0) return null;

    if (levelTarget !== null) {
      const withLevel = candidates.filter(q => q.level === levelTarget);
      if (withLevel.length > 0) candidates = withLevel;
    }

    return pickByMethod(candidates, method);
  }

  function pickByMethod(candidates, method) {
    if (method === 'mix') {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Both 'recent' and 'weighted' care about orderAdded rank, oldest first
    const sorted = candidates.slice().sort((a, b) => Number(a.orderAdded) - Number(b.orderAdded));

    if (method === 'recent') {
      const windowSize = Math.max(1, Math.ceil(sorted.length * CONFIG.RECENT_WINDOW_FRACTION));
      const window = sorted.slice(sorted.length - windowSize);
      return window[Math.floor(Math.random() * window.length)];
    }

    if (method === 'weighted') {
      const weights = sorted.map((q, idx) => idx + 1); // linear: oldest=1 ... newest=N
      return weightedRandomPick(sorted, weights);
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function weightedRandomPick(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
})();
