// Question Grid — app controller
// Thin layer that owns which view is visible and the grid header
// controls (back, reveal-all, global student reveal, save, fullscreen).
// All the real logic lives in Setup, Grid, Timer and SaveQuiz.

const App = (() => {
  let el = {};
  let shutterToggleState = 'reveal'; // 'hide' | 'reveal' - describes the button's CURRENT label/action

  // Inline icons (currentColor so they inherit .icon-btn's chalk-yellow)
  const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.3 21.3 0 0 1 5.06-5.94M9.9 4.24A10.6 10.6 0 0 1 12 5c7 0 11 7 11 7a21.3 21.3 0 0 1-2.61 3.68M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function init() {
    el.setupView = document.getElementById('setupView');
    el.gridView = document.getElementById('gridView');

    el.backBtn = document.getElementById('backBtn');
    el.quotesBtn = document.getElementById('quotesBtn');
    el.hideAllBtn = document.getElementById('hideAllBtn');
    el.gridSizeBtn = document.getElementById('gridSizeBtn');
    el.globalStudentBtn = document.getElementById('globalStudentBtn');
    el.saveBtn = document.getElementById('saveBtn');
    el.fullscreenBtn = document.getElementById('fullscreenBtn');
    el.saveConfirm = document.getElementById('saveConfirm');
    el.returnQuizBtn = document.getElementById('returnQuizBtn');
    el.setupForwardBtn = document.getElementById('setupForwardBtn');
    el.setupFullscreenBtn = document.getElementById('setupFullscreenBtn');
    el.coffeeBtn = document.getElementById('coffeeBtn');
    el.contactBtn = document.getElementById('contactBtn');

    el.backBtn.addEventListener('click', backToSetup);
    el.quotesBtn.addEventListener('click', () => QuotesModal.open());
    el.hideAllBtn.addEventListener('click', onHideRevealClick);
    el.gridSizeBtn.addEventListener('click', onGridSizeClick);
    el.globalStudentBtn.addEventListener('click', () => Grid.toggleGlobalStudents());
    el.saveBtn.addEventListener('click', onSaveClick);
    el.fullscreenBtn.addEventListener('click', toggleFullscreen);
    el.returnQuizBtn.addEventListener('click', returnToQuiz);
    el.setupForwardBtn.addEventListener('click', returnToQuiz);
    el.setupFullscreenBtn.addEventListener('click', toggleFullscreen);
    el.coffeeBtn.addEventListener('click', onCoffeeClick);
    el.contactBtn.addEventListener('click', () => ContactModal.open());

    document.addEventListener('fullscreenchange', () => {
      // Layout dimensions change on entering/exiting fullscreen, so every
      // piece of scaled text needs reassessing against its new box size.
      requestAnimationFrame(() => Grid.autosizeAll());
    });

    // Each module's init runs independently - a bug in one (e.g. bad
    // data left over in localStorage) shouldn't be able to prevent the
    // others from initializing too, which is what actually happened
    // when a stale saved-starter entry once broke Setup.init() and, as
    // a side effect, silently skipped Grid.init() right after it.
    [Setup, Grid, Timer, QuotesModal, ContactModal, Analytics].forEach(mod => {
      try {
        mod.init();
      } catch (err) {
        console.error('Module failed to initialize:', err);
      }
    });
  }

  function onCoffeeClick() {
    if (!CONFIG.COFFEE_URL) return;
    window.open(CONFIG.COFFEE_URL, '_blank', 'noopener');
  }

  function resetShutterToggle() {
    shutterToggleState = 'reveal';
    el.hideAllBtn.innerHTML = ICON_EYE;
    el.hideAllBtn.title = 'Reveal all questions';
  }

  function resetGridSizeToggle() {
    el.gridSizeBtn.innerHTML = '9&#x27A4;4';
    el.gridSizeBtn.title = 'Switch to 4 squares';
  }

  function onGridSizeClick() {
    const mode = Grid.toggleGridMode();
    el.gridSizeBtn.innerHTML = mode === '4' ? '4&#x27A4;9' : '9&#x27A4;4';
    el.gridSizeBtn.title = mode === '4' ? 'Switch back to 9 squares' : 'Switch to 4 squares';
    requestAnimationFrame(() => Grid.autosizeAll());
  }

  function onHideRevealClick() {
    if (shutterToggleState === 'hide') {
      Grid.hideAllShutters();
      shutterToggleState = 'reveal';
      el.hideAllBtn.innerHTML = ICON_EYE;
      el.hideAllBtn.title = 'Reveal all questions';
    } else {
      Grid.revealAllShutters();
      shutterToggleState = 'hide';
      el.hideAllBtn.innerHTML = ICON_EYE_OFF;
      el.hideAllBtn.title = 'Cover all questions with shutters again';
    }
  }

  function showGrid(config) {
    el.setupView.hidden = true;
    el.gridView.hidden = false;
    Grid.generate(config);
    Timer.reset();
    resetShutterToggle();
    resetGridSizeToggle();
    Analytics.trackQuizGenerated();
  }

  function showGridFromSaved(config, orderList) {
    el.setupView.hidden = true;
    el.gridView.hidden = false;
    Grid.generateFromSaved(config, orderList);
    Timer.reset();
    resetShutterToggle();
    resetGridSizeToggle();
    Analytics.trackQuizGenerated();
  }

  function backToSetup() {
    // Deliberate action only - never triggered by an accidental page
    // refresh, per design: a real reload discards everything and
    // returns here naturally, but this button is the only in-session way.
    el.gridView.hidden = true;
    el.setupView.hidden = false;
    // A live grid now exists to jump straight back to, without
    // re-generating or re-loading anything.
    el.returnQuizBtn.hidden = false;
    el.setupForwardBtn.hidden = false;
  }

  function returnToQuiz() {
    el.setupView.hidden = true;
    el.gridView.hidden = false;
  }

  function onSaveClick() {
    const data = Grid.getSaveData();
    if (!data) return;
    const slotName = SaveQuiz.save(data.descriptor, data.order);
    el.saveConfirm.textContent = `Saved as ${slotName} — expires in 2 days, only visible in this browser.`;
    el.saveConfirm.hidden = false;
    setTimeout(() => { el.saveConfirm.hidden = true; }, 5000);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return { init, showGrid, showGridFromSaved };
})();

document.addEventListener('DOMContentLoaded', App.init);
