// Question Grid — data layer
// Loads and normalises the two CSV files the app needs at runtime:
// the practice set (the question bank) and the Pearson books curriculum
// map (book -> chapter -> hidden DF ref numbers). Each is fetched and
// parsed once, then cached in memory for the rest of the session -
// nothing here talks to a network again after the first successful load.
//
// Requires PapaParse (loaded via CDN in index.html) for CSV parsing,
// since question/answer text can contain commas and needs proper
// quote-aware parsing rather than a naive split.

const DataService = (() => {

  let practiceSetPromise = null;
  let pearsonBooksPromise = null;
  let wrmSetPromise = null;
  let quotesPromise = null;
  let dfTallyPromise = null;

  function parseCsv(url) {
    return new Promise((resolve, reject) => {
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data),
        error: err => reject(new Error(`Could not load ${url}: ${err.message || err}`))
      });
    });
  }

  // Prefers the "(notated)" column when it has content, falling back
  // to "(raw)" - the notated columns are mostly still empty, so most
  // questions run on raw for now.
  function pickNotatedOrRaw(row, notatedKey, rawKey) {
    const notated = (row[notatedKey] || '').toString().trim();
    return stripLeadingApostrophe(notated ? notated : row[rawKey]);
  }

  // Question-writing convention leads a bare fraction cell (e.g. '5/14)
  // with an apostrophe so Excel doesn't auto-convert it to a date. That
  // apostrophe is an authoring escape only - never part of the actual
  // question/answer text - so it's stripped here before display.
  function stripLeadingApostrophe(str) {
    if (typeof str !== 'string') return str;
    return str.startsWith("'") ? str.slice(1) : str;
  }

  function normalisePracticeRow(row) {
    const levelRaw = row['Level'];
    const level = (levelRaw !== undefined && String(levelRaw).trim() !== '')
      ? Number(levelRaw)
      : null;
    const qNum = Number(row['Q#']);

    // Diagram Type is optional - most rows have no diagram, so an
    // empty/missing cell normalises to null (checked with a simple
    // truthiness test at render time) rather than ''. Diagram Params
    // is left as the raw semicolon-delimited string; DiagramRenderer
    // parses it itself, same as it always has.
    const diagramTypeRaw = (row['Diagram Type'] || '').toString().trim();

    return {
      orderAdded: qNum, // global, sequential - doubles as the "recent" ranking key
      q: qNum,
      dfRef: row['DF ref'],
      dfRefNum: Number(row['DF ref #']),
      level: (level !== null && !isNaN(level)) ? level : null,
      calculator: row['Calculator'],
      question: pickNotatedOrRaw(row, 'Question (notated)', 'Question (raw)'),
      answer: pickNotatedOrRaw(row, 'Answer (notated)', 'Answer (raw)'),
      wrong1: pickNotatedOrRaw(row, 'Wrong1 (notated)', 'Wrong1 (raw)'),
      wrong2: pickNotatedOrRaw(row, 'Wrong 2 (notated)', 'Wrong 2 (raw)'),
      workedAnswer: pickNotatedOrRaw(row, 'Worked Answer (notated)', 'Worked Answer (raw)'),
      hint: stripLeadingApostrophe(row['Hint']),
      diagramType: diagramTypeRaw || null,
      diagramParams: row['Diagram Params'] || ''
    };
  }

  function normalisePearsonRow(row) {
    const refs = String(row['DF Topic Refs'] || '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n));

    return {
      book: row['Book'],
      chapter: row['Chapter'],
      subTopic: row['Sub-Topic'],
      refs
    };
  }

  // The White Rose sheet's "Year/Course" column packs several tags into
  // one comma-separated cell, e.g. "Year 10, GCSE Foundation, GCSE
  // Higher" - a single row can belong to more than one of the setup
  // page's Year/Course choices (that exact row also satisfies "Year 10
  // Higher"), which a single flat value couldn't represent. Term, Unit,
  // and "DF Topic Names (review)" are read but intentionally unused.
  function normaliseWrmRow(row) {
    const yearTags = String(row['Year/Course'] || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const refs = String(row['DF Topic Refs'] || '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n));

    return {
      yearTags,
      block: row['Block'],
      smallStep: row['Small Step'],
      refs
    };
  }

  /**
   * Returns every White Rose row (one per Year/Course/block/small step)
   * with its Year/Course tags split out and its DF ref numbers already
   * parsed out of the hidden semicolon-joined column.
   */
  async function loadWrmSet() {
    if (!wrmSetPromise) {
      wrmSetPromise = parseCsv(CONFIG.WRM_SET_CSV).then(rows =>
        rows.filter(r => r['Year/Course']).map(normaliseWrmRow)
      );
    }
    return wrmSetPromise;
  }

  /**
   * Returns every practice-set question that has a DF ref number and
   * question text - i.e. skips any placeholder/not-yet-written rows.
   */
  async function loadPracticeSet() {
    if (!practiceSetPromise) {
      practiceSetPromise = parseCsv(CONFIG.PRACTICE_SET_CSV).then(rows =>
        rows
          .filter(r => r['DF ref #'] && String(r['DF ref #']).trim() !== '')
          .map(normalisePracticeRow)
          .filter(q => !isNaN(q.dfRefNum) && !isNaN(q.orderAdded) && q.question)
      );
    }
    return practiceSetPromise;
  }

  /**
   * Returns every Pearson-books row (one per book/chapter/sub-topic)
   * with its DF ref numbers already parsed out of the hidden
   * semicolon-joined column.
   */
  async function loadPearsonBooks() {
    if (!pearsonBooksPromise) {
      pearsonBooksPromise = parseCsv(CONFIG.PEARSON_BOOKS_CSV).then(rows =>
        rows.filter(r => r['Book']).map(normalisePearsonRow)
      );
    }
    return pearsonBooksPromise;
  }

  function normaliseQuoteRow(row) {
    return {
      number: row['number'],
      quote: row['quote'],
      author: (row['author'] || '').trim()
    };
  }

  /**
   * Returns every quote row that actually has quote text.
   */
  async function loadQuotes() {
    if (!quotesPromise) {
      quotesPromise = parseCsv(CONFIG.QUOTES_CSV).then(rows =>
        rows
          .filter(r => r['quote'] && String(r['quote']).trim() !== '')
          .map(normaliseQuoteRow)
      );
    }
    return quotesPromise;
  }

  function normaliseDfTallyRow(row) {
    return {
      topicNum: Number(row['DF Topic #']),
      topicName: row['DF Topic Name']
    };
  }

  /**
   * Returns every df_tally row that has a valid DF Topic number - used
   * as the search index for the Dr Frost skill-name search (topic
   * number -> topic name). Year/course selection is now handled via
   * the Pearson-books and White Rose files instead, so this file's
   * former Tally/Tags columns (and the code that read them) are gone.
   */
  async function loadDfTally() {
    if (!dfTallyPromise) {
      dfTallyPromise = parseCsv(CONFIG.DF_TALLY_CSV).then(rows =>
        rows
          .filter(r => r['DF Topic #'] && String(r['DF Topic #']).trim() !== '')
          .map(normaliseDfTallyRow)
          .filter(r => !isNaN(r.topicNum))
      );
    }
    return dfTallyPromise;
  }

  return { loadPracticeSet, loadPearsonBooks, loadWrmSet, loadQuotes, loadDfTally };
})();
