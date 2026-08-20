// Question Grid — student picker
// Two distinct behaviours, deliberately:
//  - Generate time: a shuffled queue guarantees every student is used
//    once before anyone repeats (fair round-robin).
//  - Refresh (per-square or a re-click on an already-revealed square):
//    genuinely random, only avoiding whoever's currently visible
//    elsewhere in the grid and whoever was just showing on this square.

const StudentPicker = (() => {

  function createQueue(students) {
    return {
      pool: shuffle(students.slice()),
      original: students.slice()
    };
  }

  function next(queueState) {
    if (queueState.pool.length === 0) {
      queueState.pool = shuffle(queueState.original.slice());
    }
    return queueState.pool.shift();
  }

  function randomExcluding(students, excludeNames) {
    const candidates = students.filter(s => !excludeNames.has(s));
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { createQueue, next, randomExcluding };
})();
