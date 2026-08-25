// Question Grid — sound effects
// Simple synthesized tones via Web Audio API - no files to host or
// manage. Swap these for real audio files later if preferred, by
// replacing the internals of playCorrect/playIncorrect only.

const Sound = (() => {
  let ctx;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

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

  // A short, dry mechanical "tock" - two quick clicks (down-stroke,
  // release) rather than a musical tone, for a single shutter being
  // revealed by hand. Deliberately percussive/short so it doesn't
  // overlap or blur into itself if several squares are clicked open in
  // quick succession.
  function playShutterReveal() {
    tone(140, 0.05, 'square', 0.12, 0);
    tone(90, 0.04, 'square', 0.09, 0.045);
  }

  // A short filtered-noise "whoosh" - a burst of white noise swept
  // through a downward-moving bandpass filter, the standard Web Audio
  // trick for an airy send/swipe sound without needing an audio file.
  // Used as the audible feedback when the contact form's Send button
  // is pressed.
  function playSendWhoosh() {
    const c = getCtx();
    const duration = 0.35;
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
    filter.frequency.exponentialRampToValueAtTime(280, startAt + duration);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    noise.start(startAt);
    noise.stop(startAt + duration);
  }

  return { playCorrect, playIncorrect, playTimerEnd, playSendWhoosh, playShutterReveal };
})();
