// Question Grid — sound effects
// Simple synthesized tones via Web Audio API - no files to host or
// manage. (An earlier version briefly played a recorded shutter-click
// clip; that's been disabled - see grid.js's shutter click handler -
// so nothing here fetches an audio file any more.)

const Sound = (() => {
  let ctx;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  // The very first sound played through a freshly created AudioContext
  // can carry a noticeable one-off startup latency on some devices,
  // while the audio hardware pipeline spins up. Silently warming the
  // context up on the very first tap/click/keypress anywhere on the
  // page means that latency lands on something inaudible early on,
  // rather than on whichever real sound happens to play first.
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

  // A filtered-noise "whoosh" - a burst of white noise swept through a
  // downward-moving bandpass filter, the standard Web Audio trick for
  // an airy send/swipe sound without needing an audio file. Played by
  // contactModal.js right as the typed message starts fading out.
  function playSendWhoosh() {
    const c = getCtx();
    const duration = 1.1;
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
    filter.frequency.setValueAtTime(2800, startAt);
    filter.frequency.exponentialRampToValueAtTime(180, startAt + duration);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.26, startAt + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    noise.start(startAt);
    noise.stop(startAt + duration);
  }

  return { playCorrect, playIncorrect, playTimerEnd, playSendWhoosh };
})();
