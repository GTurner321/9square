// Question Grid — contact popup
// A lightweight overlay (same pattern as QuotesModal) for sending a
// message to the creator. Prefers Formspree when configured (keeps the
// destination address fully out of this file/the page's HTML), and
// falls back to a plain mailto: link otherwise, so the button works
// right away even before Formspree is set up - see config.js.

const ContactModal = (() => {
  let el = {};

  function init() {
    el.overlay = document.getElementById('contactOverlay');
    el.closeBtn = document.getElementById('contactCloseBtn');
    el.form = document.getElementById('contactForm');
    el.sendBtn = document.getElementById('contactSendBtn');
    el.status = document.getElementById('contactStatus');
    el.messageField = document.getElementById('contactMessage');
    el.dfLink = document.getElementById('contactDfLink');
    el.emailLink = document.getElementById('contactEmailLink');

    // Same source of truth as the "look up skill numbers" link on the
    // Dr Frost setup tab (see setup.js) - if that sheet URL is ever
    // changed in config.js, this one stays in sync automatically.
    if (el.dfLink && CONFIG.DF_REFS_SHEET_URL) el.dfLink.href = CONFIG.DF_REFS_SHEET_URL;
    if (el.emailLink) el.emailLink.href = `mailto:${CONFIG.CONTACT_EMAIL}`;

    el.closeBtn.addEventListener('click', close);
    el.overlay.addEventListener('click', e => {
      if (e.target === el.overlay) close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !el.overlay.hidden) close();
    });
    el.form.addEventListener('submit', onSubmit);
  }

  function open() {
    resetFormUI();
    el.overlay.hidden = false;
    // Lock the page behind the popup from scrolling while it's open -
    // without this, on mobile in particular, the underlying page can
    // still scroll under a "fixed" overlay, which is what made this
    // look like something you scroll down to reach rather than a
    // proper popup, and let the overlay's edges drift to the sides of
    // the page instead of staying centred with buffer either side.
    document.body.style.overflow = 'hidden';
  }

  function close() {
    clearSentTimeouts(); // a still-running fade/whoosh sequence shouldn't fire against whatever's in the box next time it's opened
    el.overlay.hidden = true;
    document.body.style.overflow = '';
  }

  function setStatus(message, isError) {
    el.status.textContent = message;
    el.status.hidden = !message;
    el.status.classList.toggle('status--error', !!isError);
  }

  // A quick, visible press animation on the Send button, restarted on
  // every click (removing then re-adding the class forces the CSS
  // animation to replay even on a rapid double-click).
  function flashSendClick() {
    el.sendBtn.classList.remove('btn--clicked');
    void el.sendBtn.offsetWidth; // force reflow so the removal above actually takes effect first
    el.sendBtn.classList.add('btn--clicked');
  }

  // Timed sequence once a send has genuinely gone (or as gone as it
  // can be, for the mailto fallback - see sendViaMailto). The
  // confirmation text lives right inside the message box itself
  // (rather than a separate element elsewhere in the popup), reusing
  // the exact same color transition for both halves: adding
  // .contact-message--fading fades the typed text OUT (to transparent -
  // the box itself, border and background, stays put throughout), and
  // later removing that same class fades the grey confirmation text
  // back IN in its place - one mechanism, run in each direction. Every
  // step's timer id is tracked so a mid-sequence close() (very likely -
  // most people will just close the popup once they see it start) can
  // cancel whatever hasn't fired yet, rather than it going off later
  // against a fresh, unrelated draft.
  let sentTimeoutIds = [];
  function clearSentTimeouts() {
    sentTimeoutIds.forEach(id => window.clearTimeout(id));
    sentTimeoutIds = [];
  }

  function fadeOutMessageThenConfirm() {
    Sound.playSendWhoosh();
    el.messageField.classList.add('contact-message--fading'); // text -> transparent over 0.5s, box stays visible

    sentTimeoutIds.push(window.setTimeout(() => {
      // Text is fully transparent at this point - safe to swap what's
      // underneath without the change itself being seen.
      el.messageField.value = '(message has been sent)';
      el.messageField.classList.add('contact-message--sent');

      sentTimeoutIds.push(window.setTimeout(() => {
        // Removing the class reverses the same transition - color
        // climbs back from transparent to grey, fading the
        // confirmation text in.
        el.messageField.classList.remove('contact-message--fading');
      }, 1000));
    }, 500));
  }

  // Send -> Close as a fade-swap-fade rather than an instant text
  // jump: the label fades to transparent, swaps underneath while
  // invisible, then fades back in reading "Close".
  function morphSendButtonToClose() {
    el.sendBtn.classList.add('btn--label-fading');
    sentTimeoutIds.push(window.setTimeout(() => {
      el.sendBtn.textContent = 'Close';
      el.sendBtn.type = 'button';
      el.sendBtn.addEventListener('click', close);
      el.sendBtn.classList.remove('btn--label-fading');
    }, 250));
  }

  // Once a message is genuinely away (or as away as it can be, for the
  // mailto fallback - see sendViaMailto), the button smoothly becomes
  // the confirmation too: it turns into a plain "Close" and stops
  // being a submit button, so there's nothing left to auto-hide or
  // time out - the popup only ever closes on a deliberate action, and
  // the "(message has been sent)" text in the box stays right there
  // until it does.
  function enterSentState() {
    el.messageField.disabled = true;
    el.sendBtn.disabled = false;
    setStatus('', false);
    morphSendButtonToClose();
    fadeOutMessageThenConfirm();
  }

  function resetFormUI() {
    clearSentTimeouts();
    el.sendBtn.removeEventListener('click', close);
    el.sendBtn.disabled = false;
    el.sendBtn.textContent = 'Send message';
    el.sendBtn.type = 'submit';
    el.sendBtn.classList.remove('btn--clicked', 'btn--label-fading');
    el.messageField.disabled = false;
    // Only clear the box if it's currently showing our own
    // confirmation text - an unsent draft left over from simply
    // closing the popup without sending is deliberately preserved
    // across a reopen, same as before this feature existed.
    if (el.messageField.classList.contains('contact-message--sent')) {
      el.messageField.value = '';
    }
    el.messageField.classList.remove('contact-message--fading', 'contact-message--sent');
    setStatus('', false);
  }

  function sendViaMailto() {
    const message = el.messageField.value.trim();
    const mailto = `mailto:${CONFIG.CONTACT_EMAIL}?subject=${encodeURIComponent('9 Square feedback')}&body=${encodeURIComponent(message)}`;
    window.location.href = mailto;
    // Can't know whether the person's device actually has an email
    // client configured to catch this, so there's no confident status
    // text here - the "Close" button just means the app has done all
    // it can on this path, not a guarantee of delivery. The message
    // stays visible until the usual fade sequence clears it, same as
    // the Formspree path.
    enterSentState();
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!el.messageField.value.trim()) return;

    flashSendClick();

    if (!CONFIG.FORMSPREE_FORM_ID) {
      sendViaMailto();
      return;
    }

    el.sendBtn.disabled = true;
    setStatus('Sending…', false);

    try {
      const res = await fetch(`https://formspree.io/f/${CONFIG.FORMSPREE_FORM_ID}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(el.form)
      });

      if (res.ok) {
        enterSentState();
      } else {
        setStatus("Couldn't send that — please try again shortly.", true);
      }
    } catch (err) {
      setStatus("Couldn't send that — check your connection and try again.", true);
    } finally {
      el.sendBtn.disabled = false;
    }
  }

  return { init, open };
})();
