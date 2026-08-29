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
    el.browseBtn = document.getElementById('browseBtn');
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
    el.browseBtn.addEventListener('click', onBrowseClick);
    el.globalStudentBtn.addEventListener('click', onGlobalStudentClick);
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

    initSetupTitleAnimation();
  }

  // Idle-time "9 SQUARE" <-> "MATHS STARTER GRIDS" title swap on the
  // setup page: first cycle 5s after load, then every 5s of continued
  // idleness after that, until any interaction happens - at which
  // point it settles on "9 SQUARE" for good and never cycles again.
  function initSetupTitleAnimation() {
    const titleEl = document.getElementById('setupTitleText');
    if (!titleEl) return; // not on this view
    // Mobile just says "9 SQUARE" throughout - no cycling to "MATHS
    // STARTER GRIDS" and back. Must match the breakpoint styles.css
    // and grid.js use for mobile mode. titleEl's markup already
    // defaults to "9 SQUARE", so skipping the schedule is enough.
    if (window.matchMedia('(max-width: 700px)').matches) return;
    // Scoped to #setupView specifically - .board__title-squares also
    // exists in the grid view's header, which uses the exact same
    // class names.
    const setupView = document.getElementById('setupView');
    const squareEls = [
      setupView.querySelector('.board__title-squares--left'),
      setupView.querySelector('.board__title-squares--right')
    ].filter(Boolean);

    let interacted = false;
    const timeoutIds = [];
    const schedule = (fn, ms) => { timeoutIds.push(setTimeout(fn, ms)); };

    // Fade-outs are quicker (1s) than fade-ins (2s) - different
    // transition-duration per direction, so it's set explicitly before
    // each opacity change rather than relying on one fixed CSS value.
    function setOpacity(elements, value, durationMs) {
      elements.forEach(el => {
        el.style.transitionDuration = (durationMs / 1000) + 's';
        el.style.opacity = value;
      });
    }

    function stopForGood() {
      if (interacted) return;
      interacted = true;
      timeoutIds.forEach(clearTimeout);
      titleEl.textContent = '9 SQUARE';
      setOpacity([titleEl, ...squareEls], '1', 0);
    }
    ['pointerdown', 'keydown'].forEach(evt =>
      document.addEventListener(evt, stopForGood, { once: true })
    );

    function runCycle() {
      if (interacted) return;
      // The decorative squares either side of the title fade in and out
      // together with whatever text is currently showing - both "9
      // SQUARE" and "MATHS STARTER GRIDS" - not just tied to "9 SQUARE"
      // specifically.
      setOpacity([titleEl, ...squareEls], '0', 1000); // fade out "9 SQUARE" (+ squares)
      schedule(() => {
        if (interacted) return;
        titleEl.textContent = 'MATHS STARTER GRIDS';
        setOpacity([titleEl, ...squareEls], '1', 2000); // fade in (+ squares)
        schedule(() => {
          if (interacted) return;
          setOpacity([titleEl, ...squareEls], '0', 1000); // stayed 4s, now fade out (+ squares)
          schedule(() => {
            if (interacted) return;
            titleEl.textContent = '9 SQUARE';
            setOpacity([titleEl, ...squareEls], '1', 2000); // fade back in together
            schedule(runCycle, 5000); // idle 5s, then repeat if still no interaction
          }, 1000);
        }, 4000);
      }, 1000);
    }

    schedule(runCycle, 5000); // first cycle starts 5s after load
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

  // Browse/swap is 9-square-mode only, so its button and the 9<->4
  // toggle disable each other while the other is active - simpler and
  // safer than trying to keep both features consistent if the layout
  // changed underneath one of them. Cover-shutters and show/hide
  // students act on every square at once, which would fight with a
  // frozen/mid-swap grid, so they're disabled for the same window.
  function resetBrowseToggle() {
    el.browseBtn.classList.remove('icon-btn--active');
    el.browseBtn.title = 'Browse & swap questions';
    el.browseBtn.disabled = false;
    el.gridSizeBtn.disabled = false;
    el.hideAllBtn.disabled = false;
    el.globalStudentBtn.disabled = false;
  }

  function onBrowseClick() {
    const active = Grid.toggleBrowseMode();
    el.browseBtn.classList.toggle('icon-btn--active', active);
    el.browseBtn.title = active ? 'Exit browse & swap' : 'Browse & swap questions';
    el.gridSizeBtn.disabled = active;
    el.hideAllBtn.disabled = active;
    el.globalStudentBtn.disabled = active;
  }

  function onGridSizeClick() {
    const mode = Grid.toggleGridMode();
    el.gridSizeBtn.innerHTML = mode === '4' ? '4&#x27A4;9' : '9&#x27A4;4';
    el.gridSizeBtn.title = mode === '4' ? 'Switch back to 9 squares' : 'Switch to 4 squares';
    el.browseBtn.disabled = (mode === '4');
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

  function onGlobalStudentClick() {
    const result = Grid.toggleGlobalStudents();
    if (result === 'no-students') showHeaderMessage('No students added', 2000);
  }

  // Shared banner (the same element the save confirmation uses) for
  // any short-lived header message, click-triggered rather than a
  // hover tooltip - "No students added" needs to actually be seen,
  // not just be sitting in a title attribute nobody hovers over. Only
  // one message is ever showing at a time; a new call always replaces
  // whatever's currently displayed and restarts its own countdown.
  let headerMessageTimeoutId = null;
  function showHeaderMessage(text, durationMs) {
    if (headerMessageTimeoutId) clearTimeout(headerMessageTimeoutId);
    el.saveConfirm.textContent = text;
    el.saveConfirm.hidden = false;
    headerMessageTimeoutId = setTimeout(() => {
      el.saveConfirm.hidden = true;
      headerMessageTimeoutId = null;
    }, durationMs);
  }

  function showGrid(config) {
    el.setupView.hidden = true;
    el.gridView.hidden = false;
    Grid.generate(config);
    Timer.reset();
    resetShutterToggle();
    resetGridSizeToggle();
    resetBrowseToggle();
    Analytics.trackQuizGenerated();
  }

  function showGridFromSaved(config, orderList) {
    el.setupView.hidden = true;
    el.gridView.hidden = false;
    Grid.generateFromSaved(config, orderList);
    Timer.reset();
    resetShutterToggle();
    resetGridSizeToggle();
    resetBrowseToggle();
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
    // Local storage survives normal AND hard refreshes - it's only
    // lost if this browser's site data/cookies get cleared, or the
    // page is opened in a private/incognito window that then closes.
    showHeaderMessage(`Saved as ${slotName} — expires in 2 days. Survives refreshes, but is lost if this browser's site data is cleared.`, 5000);
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
