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

  return { playCorrect, playIncorrect, playTimerEnd };
})();
