// Question Grid — central configuration
// CSV files live in /csv alongside /css and /js at the repo root.
// Paste your shared Dr Frost reference Google Sheet link into
// DF_REFS_SHEET_URL below - the "look up skill numbers" link on the
// setup page stays hidden until this is filled in.

const CONFIG = {
  PRACTICE_SET_CSV: 'csv/practice_set.csv',
  PEARSON_BOOKS_CSV: 'csv/pearson_books.csv',
  WRM_SET_CSV: 'csv/WRM_full_set.csv',
  DF_TALLY_CSV: 'csv/df_tally.csv',
  QUOTES_CSV: 'csv/quotes.csv',

  DF_REFS_SHEET_URL: 'https://docs.google.com/spreadsheets/d/11OmFm5H_AHGHPGFbjY3X6-VAVuiJWHZUR_W-bwZhhYk/edit?usp=sharing',

  // --- Analytics (Supabase) ---
  // Leave both blank to disable analytics entirely (Analytics.init()
  // becomes a no-op). See analytics-setup.sql / README for how to
  // create the table and get these values from your Supabase project
  // (Project Settings -> API). The anon key is safe to expose here -
  // row-level security on the table only allows INSERT, never SELECT,
  // so this key can add rows but can't be used to read data back.
  SUPABASE_URL: 'https://kwonkpphuoczmahkyltq.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Al3Tpa2ymhl_r7xZQxeRCA_EZsG4VRm',   // Settings -> API Keys in Supabase: the "Publishable key"
                            // (sb_publishable_...) on newer projects, or the legacy
                            // "anon / public" key on older ones. NEVER use the
                            // "Secret key" / service_role key here - that one must
                            // stay private and never appear in this file.

  // --- Contact form (Formspree) ---
  // Sign up free at formspree.io, create a form pointed at your email,
  // and paste its endpoint ID here (the part after "https://formspree.io/f/").
  // Leave blank to disable the contact button.
  FORMSPREE_FORM_ID: '',

  // --- Buy me a coffee ---
  // A Ko-fi, Buy Me a Coffee, or Stripe Payment Link URL. Leave blank
  // to disable the coffee button.
  COFFEE_URL: 'https://ko-fi.com/gturner123',

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
