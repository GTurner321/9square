// Question Grid — analytics
// Sends a handful of anonymous, aggregate usage events to Supabase:
// site loads, quizzes generated, and "time visible" heartbeats. There
// is deliberately no cookie and no persistent identifier - the only
// per-visit id is a random token kept in sessionStorage, which the
// browser throws away the moment the tab/window is closed, and it
// never leaves this device attached to anything identifying. Because
// nothing persists across visits and no personal data is collected,
// this does not require a cookie-consent banner.
//
// If CONFIG.SUPABASE_URL / SUPABASE_ANON_KEY aren't filled in, every
// call below is a silent no-op - the app works exactly the same
// without analytics configured.

const Analytics = (() => {

  const HEARTBEAT_MS = 2 * 60 * 1000; // 2-minute "is it actually visible" check-ins
  const TICK_SECONDS = 120;           // seconds credited per successful check-in

  let sessionId = null;
  let heartbeatTimer = null;

  function isConfigured() {
    return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  }

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      let sid = sessionStorage.getItem('doNow9_sid');
      if (!sid) {
        sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        sessionStorage.setItem('doNow9_sid', sid);
      }
      sessionId = sid;
    } catch (e) {
      // Private-browsing modes etc. can block sessionStorage - fall back
      // to an in-memory id for the life of this page view only.
      sessionId = String(Date.now()) + Math.random().toString(16).slice(2);
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
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
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

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      // Only credits time if the page is genuinely the visible tab right
      // now, not just still open in a background tab.
      if (document.visibilityState === 'visible') {
        sendEvent('time_tick', TICK_SECONDS);
      }
    }, HEARTBEAT_MS);
  }

  function init() {
    if (!isConfigured()) return;
    trackPageLoad();
    startHeartbeat();
  }

  return { init, trackQuizGenerated };
})();
