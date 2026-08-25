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
    setStatus('', false);
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
    el.overlay.hidden = true;
    document.body.style.overflow = '';
  }

  function setStatus(message, isError) {
    el.status.textContent = message;
    el.status.hidden = !message;
    el.status.classList.toggle('status--error', !!isError);
  }

  function sendViaMailto() {
    const message = el.messageField.value.trim();
    const mailto = `mailto:${CONFIG.CONTACT_EMAIL}?subject=${encodeURIComponent('9 Square feedback')}&body=${encodeURIComponent(message)}`;
    window.location.href = mailto;

    // Can't know whether the person's device actually has an email
    // client configured to catch this, so the confirmation is phrased
    // accordingly rather than claiming it's definitely sent.
    setStatus('Opening your email app to send this…', false);
    setTimeout(() => {
      el.form.reset();
      close();
    }, 2500);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!el.messageField.value.trim()) return;

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
        el.form.reset();
        setStatus('Thanks — your message has been sent!', false);
        setTimeout(close, 2000);
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
