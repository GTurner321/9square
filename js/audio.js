// Question Grid — sound effects
// Most of these are simple synthesized tones via Web Audio API - no
// files to host or manage. The shutter click is the one exception: it
// plays an actual recorded clip (assets/shutter_click.mp3), decoded
// once up front into an AudioBuffer so every later play is instant.

const Sound = (() => {
  let ctx;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  // The very first sound played through a freshly created AudioContext
  // can carry a noticeable one-off startup latency on some devices,
  // while the audio hardware pipeline spins up - and the shutter click
  // is typically the first sound of a session (shutters get revealed
  // before any answer/timer interaction), so it's the one most likely
  // to visibly wear that delay. Silently warming the context up on the
  // very first tap/click/keypress anywhere on the page - almost always
  // something on the setup page, well before the grid or any shutter
  // exists - means the pipeline is already spun up by the time a real
  // shutter click needs to play.
  let warmedUp = false;
  function warmUpAudioContext() {
    if (warmedUp) return;
    warmedUp = true;
    const c = getCtx();
    if (c.state === 'suspended') c.resume().catch(() => {});
    const osc = c.createOscillator();
    const gain = c.createGain();
    gain.gain.value = 0.0001; // inaudible - this is purely to spin up the pipeline, not to be heard
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.01);
  }
  document.addEventListener('pointerdown', warmUpAudioContext, { once: true });
  document.addEventListener('keydown', warmUpAudioContext, { once: true });

  function tone(freq, duration, type, gainVal, delay) {
    const c = getCtx();
    const startAt = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = gainVal || 0.15;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.stop(startAt + duration);
  }

  function playCorrect() {
    tone(880, 0.15, 'sine', 0.15, 0);
    tone(1175, 0.2, 'sine', 0.15, 0.12);
  }

  function playIncorrect() {
    tone(180, 0.3, 'square', 0.1, 0);
  }

  function playTimerEnd() {
    tone(660, 0.18, 'sine', 0.18, 0);
    tone(660, 0.18, 'sine', 0.18, 0.25);
    tone(660, 0.25, 'sine', 0.18, 0.5);
  }

  // Fetched and decoded once, as soon as this script runs - well
  // before the setup page is even filled in, let alone a grid
  // generated - so by the time a real shutter gets clicked, the fetch
  // has almost certainly finished (index.html also carries a <link
  // rel="preload"> for this file, so the browser starts downloading it
  // even earlier, in parallel with everything else on the page, before
  // this script has even run). shutterClickBuffer is set the moment
  // decoding finishes, checked synchronously below - not awaited via
  // the promise - so playShutterReveal never has to wait on a fetch
  // that's already long done by click time.
  let shutterClickBuffer = null;
  function loadShutterClickBuffer() {
    return fetch('assets/shutter_click.mp3')
      .then(res => res.arrayBuffer())
      .then(data => getCtx().decodeAudioData(data))
      .then(buffer => { shutterClickBuffer = buffer; });
  }
  if (typeof fetch === 'function') loadShutterClickBuffer().catch(() => {});

  // A single square's shutter being revealed by hand - see
  // grid.js, which calls this only from the one-by-one click path
  // (never from "reveal all" or browse/swap's automatic reveal). Plays
  // the real recorded clip once it's loaded (the overwhelmingly common
  // case - by the time anyone reaches a shutter they've been through
  // the whole setup page first, giving the fetch above plenty of
  // time); on the off chance a shutter is clicked before that fetch
  // has finished, falls back to an instant synthesized click rather
  // than making the person wait on a network request, so there's
  // never a perceptible delay either way.
  function playShutterReveal() {
    const c = getCtx();
    if (shutterClickBuffer) {
      const source = c.createBufferSource();
      source.buffer = shutterClickBuffer;
      source.connect(c.destination);
      source.start();
    } else {
      tone(140, 0.05, 'square', 0.12, 0);
      tone(90, 0.04, 'square', 0.09, 0.045);
    }
  }

  // A short filtered-noise "whoosh" - a burst of white noise swept
  // through a downward-moving bandpass filter, the standard Web Audio
  // trick for an airy send/swipe sound without needing an audio file.
  // Played by contactModal.js right as the typed message starts
  // fading out, not at the moment Send is first clicked.
  function playSendWhoosh() {
    const c = getCtx();
    const duration = 0.55;
    const startAt = c.currentTime;

    const bufferSize = Math.max(1, Math.round(c.sampleRate * duration));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1;
    filter.frequency.setValueAtTime(2400, startAt);
    filter.frequency.exponentialRampToValueAtTime(240, startAt + duration);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    noise.start(startAt);
    noise.stop(startAt + duration);
  }

  return { playCorrect, playIncorrect, playTimerEnd, playSendWhoosh, playShutterReveal };
})();
