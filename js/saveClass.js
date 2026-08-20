// Question Grid — save class list
// Saves a pasted student list to localStorage so it can be reused in a
// future lesson without re-pasting. Unlike SaveQuiz, there's no time
// expiry - instead the slots simply cycle: group1, group2, ... group10,
// then group1 again, overwriting the oldest. No custom naming; the
// slot number is assigned automatically.

const SaveClass = (() => {
  const PREFIX = 'doNow9_class_';
  const POINTER_KEY = 'doNow9_class_nextSlot';
  const MAX_SLOTS = 10;

  function getNextSlot() {
    const raw = localStorage.getItem(POINTER_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return (n >= 1 && n <= MAX_SLOTS) ? n : 1;
  }

  function advancePointer(justSavedSlot) {
    const next = (justSavedSlot % MAX_SLOTS) + 1;
    localStorage.setItem(POINTER_KEY, String(next));
  }

  function readSlot(slot) {
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null; // corrupt entry, treat as empty
    }
  }

  /**
   * Returns every currently-populated group as
   * { slot, students, savedAt }, sorted by slot number.
   */
  function listValid() {
    const results = [];
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
      const data = readSlot(slot);
      if (data) results.push({ slot, students: data.students, savedAt: data.savedAt });
    }
    return results;
  }

  /**
   * Saves the given student list to the next slot in rotation.
   * Returns the slot name used, e.g. "group3".
   */
  function save(students) {
    const slot = getNextSlot();
    const data = { students: students.slice(), savedAt: Date.now() };
    localStorage.setItem(PREFIX + slot, JSON.stringify(data));
    advancePointer(slot);
    return 'group' + slot;
  }

  return { listValid, save };
})();
