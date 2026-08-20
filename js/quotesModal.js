// Question Grid — quotes popup
// A lightweight overlay triggered from the grid header's "…" button.
// Quotes are fetched once (via DataService, which caches the parsed
// CSV) and then picked at random client-side on open and on refresh -
// no network call after the first open.

const QuotesModal = (() => {
  let el = {};
  let quotes = [];
  let loaded = false;

  function init() {
    el.overlay = document.getElementById('quotesOverlay');
    el.text = document.getElementById('quotesText');
    el.author = document.getElementById('quotesAuthor');
    el.refreshBtn = document.getElementById('quotesRefreshBtn');
    el.closeBtn = document.getElementById('quotesCloseBtn');

    el.refreshBtn.addEventListener('click', showRandom);
    el.closeBtn.addEventListener('click', close);

    // Click on the dimmed backdrop (not the card itself) closes it.
    el.overlay.addEventListener('click', e => {
      if (e.target === el.overlay) close();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !el.overlay.hidden) close();
    });
  }

  async function open() {
    el.overlay.hidden = false;

    if (!loaded) {
      el.text.textContent = 'Loading…';
      el.author.textContent = '';
      try {
        quotes = await DataService.loadQuotes();
        loaded = true;
      } catch (err) {
        el.text.textContent = "Couldn't load quotes.";
        return;
      }
    }

    showRandom();
  }

  function showRandom() {
    if (!quotes.length) {
      el.text.textContent = 'No quotes available.';
      el.author.textContent = '';
      return;
    }
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    el.text.textContent = q.quote;
    el.author.textContent = q.author ? `— ${q.author}` : '';
  }

  function close() {
    el.overlay.hidden = true;
  }

  return { init, open };
})();
