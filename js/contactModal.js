// Question Grid — contact popup
// A lightweight overlay (same pattern as QuotesModal) for sending a
// message to the creator. Submits via Formspree so the destination
// email address never needs to appear anywhere in this file or in the
// page's HTML - only Formspree's dashboard (set up separately, once)
// knows where it goes.

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
  }

  function close() {
    el.overlay.hidden = true;
  }

  function setStatus(message, isError) {
    el.status.textContent = message;
    el.status.hidden = !message;
    el.status.classList.toggle('status--error', !!isError);
  }

  async function onSubmit(e) {
    e.preventDefault();

    if (!CONFIG.FORMSPREE_FORM_ID) {
      setStatus("Sorry, the message form isn't set up yet.", true);
      return;
    }
    if (!el.messageField.value.trim()) return;

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
