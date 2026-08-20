// Question Grid — central configuration
// CSV files live in /csv alongside /css and /js at the repo root.
// Paste your shared Dr Frost reference Google Sheet link into
// DF_REFS_SHEET_URL below - the "look up skill numbers" link on the
// setup page stays hidden until this is filled in.

const CONFIG = {
  PRACTICE_SET_CSV: 'csv/practice_set.csv',
  PEARSON_BOOKS_CSV: 'csv/pearson_books.csv',
  DF_TALLY_CSV: 'csv/df_tally.csv',
  QUOTES_CSV: 'csv/quotes.csv',

  DF_REFS_SHEET_URL: 'https://docs.google.com/spreadsheets/d/11OmFm5H_AHGHPGFbjY3X6-VAVuiJWHZUR_W-bwZhhYk/edit?usp=sharing',

  // Minimum number of level-tagged questions (level 1-3) a pool needs
  // before level-specific selection is meaningful. Currently unused by
  // setup.js (level select is always fully enabled), but still read by
  // SelectionEngine.bankHasUsableLevels if you wire that back in.
  MIN_LEVEL_TAGGED_QUESTIONS: 4,

  // "Most recent" draws from the newest slice of the eligible pool;
  // this is how big that slice is, as a fraction of the pool (min 1
  // question). "Weighted towards recent" uses the whole pool but
  // weights the random draw linearly by recency rank.
  RECENT_WINDOW_FRACTION: 0.3
};
