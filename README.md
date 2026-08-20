# Question Grid

## Getting this onto GitHub Pages (all via the browser, no downloads needed)

1. On github.com, create a new **public** repository (e.g. `question-grid`).
2. On the repo page, use **Add file → Upload files**, and drag in:
   - `index.html`
   - the `css` folder (with `styles.css` inside)
   - the `js` folder (with all the `.js` files inside)
   - the `csv` folder (with `pearson_books.csv` and `practice_set.csv` inside — export these from `Do_now_grid.xlsx`'s "Pearson books" and "Practice set" tabs)
   - If GitHub flattens folders on upload, create files individually instead via **Add file → Create new file** and type the path (e.g. `css/styles.css`) into the filename box — GitHub creates the folder automatically.
3. Commit the files.
4. Go to **Settings → Pages**.
5. Source: **Deploy from a branch**, Branch: `main`, folder: `/ (root)` → **Save**.
6. GitHub gives you a URL, usually `https://<yourusername>.github.io/question-grid/` — allow a minute or two the first time.

## Current status

**Both the setup page and the 9-square grid are built and wired together.**
Question data now comes from two committed CSV files instead of a shared
Google Sheet + Apps Script backend — no server involved.

Setup page — three ways to choose a set of questions, picked via tabs:
- **Pearson book**: pick a book, then multi-select chapters. Each chapter's
  hidden Dr Frost ref numbers (from `pearson_books.csv`) are unioned and
  used to filter `practice_set.csv`.
- **Dr Frost skills**: type skill numbers directly, comma-separated
  (e.g. `112, 115`). A "look up skill numbers" link points at your shared
  reference sheet once `DF_REFS_SHEET_URL` is set in `js/config.js`.
- **Saved starter**: reload a previously saved 9-box layout — rebuilds the
  same pool from a saved descriptor, then re-fetches live question text.

If a selection has no matching questions, Generate shows a plain warning
rather than silently producing an empty/half-empty grid.

Also on the setup page:
- Question level dropdown (full mix / progressive / single level)
- Pasted student list, deduped, with save/reuse of class lists
- Generate hands everything off to the grid

Grid view:
- 16 squares, filled from the fetched bank only (no further network calls - survives a dropped connection)
- Never duplicates a question across the grid; blank squares appear only if the pool genuinely runs short
- "Level 1-4 progressive" mode puts level 1 on the top row through level 4 on the bottom row; if a row+topic combo runs short, it fills the rest of that row from any level in the same topic
- Per-square icons: ✓ answer, ☰ answer choices, ? hint, i explanation - each only appears if that data exists for the question; only one panel open at a time
- Answer choices: click one, correct highlights green, both wrong ones show red with a strike-through, with a short correct/incorrect tone
- ↻ refresh picks a different question for that square only, never duplicating what's showing elsewhere
- Student banner (only shown if a class list was pasted): first reveal uses a fair round-robin so everyone's used once before anyone repeats; the icon becomes a refresh after reveal for a genuinely random re-pick (never clashing with names currently shown elsewhere)
- Header: back to setup, quote popup, reveal-all (shutters), 9↔4 square toggle, global student show/hide-all, save, fullscreen; a stopwatch (00:00, +1/-1 min, single play/pause toggle) sits inline in the header row
- Covered squares show an embossed sum-to-9 expression (random per square); the centre square always shows the "9 SQUARE" title instead - purely cosmetic, the real question underneath is unaffected
- The 9↔4 toggle hides 5 squares (keeping the 4 corners) without discarding them - switching back restores the hidden 5 exactly as they were. While in 4-square mode, the refresh (↻) button draws from those 5 hidden questions first, in reading order, before falling back to a normal random pick
- Question text auto-shrinks to fit its square, and re-checks on entering/exiting fullscreen
- Save: stores just the bank name + each box's question (by "order added") to this browser's localStorage, expiring after 2 days; the setup page shows a "Use saved quiz" picker when any exist, which collapses everything down to just the student list

## File overview

```
index.html               Setup view + grid view markup
css/styles.css            All styling
csv/pearson_books.csv      Book -> chapter -> hidden Dr Frost ref numbers
csv/practice_set.csv       The question bank
js/config.js               CSV paths + tunable thresholds + Dr Frost sheet link
js/dataService.js          Loads and normalises the two CSVs (via PapaParse)
js/poolBuilder.js          Filters the practice set by book/chapters or by Dr Frost refs
js/selectionEngine.js      Question picking: recency methods, level rules, duplicate-free refresh
js/studentPicker.js        Fair round-robin (Generate) + random-excluding (refresh)
js/saveQuiz.js              Save/load a fixed 9-question layout to this browser (2-day expiry)
js/audio.js                 Synthesized correct/incorrect tones
js/timer.js                  Header stopwatch: 00:00 start, +1/-1 min, start/pause
js/grid.js                  Renders and manages the 9 squares, shutters, pastel colours
js/setup.js                 Setup page controller: the three selection-method tabs, students, saved starters
js/app.js                   View switching + grid header controls
```

## Worth testing once it's live

- A bank with genuinely fewer than 16 eligible questions (confirms blank squares, no crash)
- "Level 1-4 progressive" on a bank with only a little level data (confirms the fallback fills rows sensibly)
- Ticking two topics together
- A question missing a hint or worked answer (confirms that icon simply doesn't appear)
- Refreshing the same square repeatedly near the end of a small pool (confirms it stops changing gracefully rather than erroring, once no alternative remains)
- Fullscreen and the draggable timer on the actual device/browser you'll use in class
