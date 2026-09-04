// Question Grid — analytics
// Sends a handful of anonymous, aggregate usage events to Supabase:
// site loads, quizzes generated, time visible, and click activity.
// There is deliberately no cookie and no persistent identifier - the
// only per-visit id is a random token kept in sessionStorage, which
// the browser throws away the moment the tab/window is closed, and it
// never leaves this device attached to anything identifying. Because
// nothing persists across visits and no personal data is collected,
// this does not require a cookie-consent banner.
//
// If CONFIG.SUPABASE_URL / SUPABASE_ANON_KEY aren't filled in, every
// call below is a silent no-op - the app works exactly the same
// without analytics configured.

const Analytics = (() => {

  // Check-in schedule backs off the longer a page stays open, so a
  // long lesson doesn't keep hammering the network every 2 minutes
  // forever: 1-minute check-ins for the first 5 minutes, then every 2
  // minutes for the next 10, then every 5 minutes indefinitely after
  // that. "Visible time" is credited whenever the tab is genuinely
  // visible and focused at each check-in - clicks are tracked
  // separately (see below) and don't gate this at all, since a
  // projector display with the grid up while students work on paper
  // is real, legitimate use even with long gaps between clicks.
  const TIERS = [
    { untilMs: 5 * 60 * 1000, intervalMs: 1 * 60 * 1000 },
    { untilMs: 15 * 60 * 1000, intervalMs: 2 * 60 * 1000 },
    { untilMs: Infinity, intervalMs: 5 * 60 * 1000 }
  ];

  let sessionId = null;
  let heartbeatTimeoutId = null;
  let scheduleStartedAt = null;
  let clicksSinceLastCheckIn = 0;

  function isConfigured() {
    return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  }

  // Uses the browser's CSPRNG rather than Math.random() - not because this
  // id is used for anything sensitive (it's a throwaway per-tab
  // correlation key for anonymous analytics rows, gone when the tab
  // closes), but because automated scanners flag Math.random() wherever
  // it produces an "id"-shaped value, regardless of what it's used for.
  // crypto.getRandomValues is supported everywhere this site targets, so
  // there's no need for a Math.random() fallback at all.
  function generateId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      let sid = sessionStorage.getItem('doNow9_sid');
      if (!sid) {
        sid = generateId();
        sessionStorage.setItem('doNow9_sid', sid);
      }
      sessionId = sid;
    } catch (e) {
      // Private-browsing modes etc. can block sessionStorage - fall back
      // to an in-memory id for the life of this page view only.
      sessionId = generateId();
    }
    return sessionId;
  }

  function sendEvent(eventType, value) {
    if (!isConfigured()) return;
    const payload = { session_id: getSessionId(), event_type: eventType };
    if (value !== undefined) payload.value = value;

    fetch(`${CONFIG.SUPABASE_URL}/rest/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Only the apikey header is sent - Supabase's gateway derives the
        // anonymous role from it either way. This deliberately avoids
        // Authorization: Bearer, since Supabase's newer "publishable" key
        // format (replacing the older "anon" key) is rejected outright if
        // sent there - apikey-only works for both key formats.
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload),
      keepalive: true // lets the request finish even if the tab is closing
    }).catch(() => { /* best-effort only - a failed beacon shouldn't affect the app */ });
  }

  function trackPageLoad() {
    sendEvent('page_load');
  }

  function trackQuizGenerated() {
    sendEvent('quiz_generated');
  }

  function currentIntervalMs(elapsedMs) {
    for (const tier of TIERS) {
      if (elapsedMs < tier.untilMs) return tier.intervalMs;
    }
    return TIERS[TIERS.length - 1].intervalMs;
  }

  function incrementTimeTick(seconds) {
    if (!isConfigured()) return;
    // Calls a database function (see analytics-consolidate-time.sql)
    // that adds to this session's existing time_tick row rather than
    // inserting a new row every check-in - one row per session that
    // just grows, instead of the table filling up with a fresh row
    // every 1-5 minutes for as long as a page stays open.
    fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/increment_time_tick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ p_session: getSessionId(), p_seconds: seconds }),
      keepalive: true
    }).catch(() => { /* best-effort only - a failed beacon shouldn't affect the app */ });
  }

  function onCheckIn(intervalMs) {
    // visibilityState alone only means "this is the active tab, window
    // isn't minimized" - it does NOT reliably detect another
    // application window sitting on top of the browser. hasFocus()
    // catches that: it's only true when this window currently has real
    // OS-level input focus, so alt-tabbing away drops it to false even
    // if the tab itself never changed.
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      incrementTimeTick(Math.round(intervalMs / 1000));
    }

    if (clicksSinceLastCheckIn > 0) {
      sendEvent('click_batch', clicksSinceLastCheckIn);
      clicksSinceLastCheckIn = 0;
    }

    scheduleNextCheckIn();
  }

  function scheduleNextCheckIn() {
    const elapsed = Date.now() - scheduleStartedAt;
    const intervalMs = currentIntervalMs(elapsed);
    heartbeatTimeoutId = setTimeout(() => onCheckIn(intervalMs), intervalMs);
  }

  function startHeartbeat() {
    if (heartbeatTimeoutId) return;
    scheduleStartedAt = Date.now();
    scheduleNextCheckIn();
  }

  function trackClicks() {
    // One delegated listener on the whole document catches every click
    // anywhere in the app (shutters, answer icons, refresh, Generate,
    // etc.) via event bubbling - no need to attach or enumerate
    // listeners per button. Clicks are batched and sent alongside the
    // regular check-ins rather than firing a network request per
    // click.
    document.addEventListener('click', () => {
      clicksSinceLastCheckIn++;
    }, { passive: true });
  }

  function init() {
    if (!isConfigured()) return;
    trackPageLoad();
    trackClicks();
    startHeartbeat();
  }

  return { init, trackQuizGenerated };
})();
