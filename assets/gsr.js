// google.script.run for pages on thegreatdarkness.com.
// Apps Script pages call server functions with google.script.run; that
// only exists on pages Apps Script serves. This file provides the same
// calls (withSuccessHandler, withFailureHandler, withUserObject) and sends
// them to the web app's ?rpc= address (WebApi.js), so page code is the
// same as before. Also google.script.url.getLocation (reads this page's
// address). Needs config.js first.
(function() {
  var seq = 0;
  var TIMEOUT_MS = 60000;

  // Monitor snapshots (2026-11-12): the Publish site workflow saves each
  // monitor page's first answers in /data/monitors.json every half hour.
  // On a monitor page the first call for one of those answers is handed
  // the saved copy at once (from GitHub, ~0.1 s), then the live answer
  // replaces it when Apps Script replies. If the live call fails after a
  // copy was shown, the copy stays and no failure is reported.
  // Since 2026-11-13 the same file also holds the first answers of the
  // Event Log (/events/, /events/text/) and the System Log (/maintenance/).
  var snapshotPage = /^\/(monitor|events|maintenance)\//.test(location.pathname);
  var snapshot = snapshotPage && window.fetch
    ? fetch("/data/monitors.json", { cache: "no-cache" })
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; })
    : null;
  var snapshotUsed = {};

  // Busy retry (2026-11-13): when Google is running too many scripts it
  // answers with an error web page instead of our script, so the callback
  // never runs. That is spotted when the script finishes loading, and the
  // call is sent again after a random 1-3 s pause (up to BUSY_RETRIES
  // times). Apps Script never ran the refused call, so a retry is safe.
  var BUSY_RETRIES = 2;
  function call(name, args, onOk, onFail, userObject) {
    var cb = "";
    var script = null;
    var done = false, tries = 0;
    var timer = setTimeout(function() { finish(null, "NO RESPONSE"); }, TIMEOUT_MS);

    function finish(answer, problem) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // The console frame's applet box and failure dialog (console.js).
      if (window.oerRpcEnd) window.oerRpcEnd(!!(answer && answer.ok) || shown);
      window[cb] = function() {};
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (answer && answer.ok) {
        if (onOk) onOk(answer.result, userObject);
      } else {
        var error = new Error(problem || (answer && answer.error) || "REQUEST FAILED");
        if (shown) console.log(name + ": live answer failed, showing the saved copy: " + error.message);
        else if (onFail) onFail(error, userObject);
        else console.error(name + ": " + error.message);
      }
    }

    if (window.oerRpcStart) window.oerRpcStart();
    var shown = false;
    var key = name + JSON.stringify(args);
    if (snapshot && !snapshotUsed[key]) {
      snapshotUsed[key] = true;
      snapshot.then(function(d) {
        if (done || !d || d.ok !== true || !d.answers || !Object.prototype.hasOwnProperty.call(d.answers, key)) return;
        shown = true;
        // Closes the loading box without waiting for the live answer.
        if (window.oerRpcEnd) { window.oerRpcEnd(true); if (window.oerRpcStart) window.oerRpcStart(); }
        if (onOk) onOk(d.answers[key], userObject);
      });
    }
    // Cacheable public answers go through the caching Worker (config.js);
    // if it fails, the same call goes straight to Apps Script.
    var viaCache = typeof TGD_CACHE_RPC !== "undefined" && TGD_CACHE_RPC.indexOf(name) !== -1;
    function send() {
      if (done) return;
      var base = viaCache && tgdCacheOn() ? TGD_CACHE_URL : TGD_API_URL;
      tries++;
      cb = "tgdRpc" + Date.now().toString(36) + "_" + (++seq);
      script = document.createElement("script");
      var answered = false, mine = cb, tag = script;
      window[mine] = function(answer) { answered = true; finish(answer); };
      function retryDirect() {
        window[mine] = function() {};
        if (tag.parentNode) tag.parentNode.removeChild(tag);
        tries--;
        send();
      }
      script.onerror = function() {
        if (tgdCacheFailed(tag.src)) { retryDirect(); return; }
        finish(null, "NETWORK ERROR");
      };
      script.onload = function() {
        if (answered || done) return;
        if (tgdCacheFailed(tag.src)) { retryDirect(); return; }
        // Loaded but never called back: Google's busy page.
        window[mine] = function() {};
        if (tag.parentNode) tag.parentNode.removeChild(tag);
        if (tries > BUSY_RETRIES) { finish(null, "SERVICE BUSY"); return; }
        setTimeout(send, 1000 + Math.floor(Math.random() * 2000));
      };
      script.src = base +
        "?rpc=" + encodeURIComponent(name) +
        "&args=" + encodeURIComponent(JSON.stringify(args)) +
        "&callback=" + cb;
      document.head.appendChild(script);
    }
    send();
  }

  // Arcade boards on Supabase (2026-11-28): the score reads are answered from
  // Supabase's copy of the Scores sheet (rpc arcade_read, publishable key,
  // public by design), worked out the same way as Scores.js. Apps Script
  // answers when Supabase fails, has no copy of that game, its copy job has
  // been silent 30 min, or this browser saved a score in the last 3 min
  // (the copy follows a save within a minute). Saving stays on Apps Script.
  var SB_ARCADE = "https://lshgovxyhbaznshylzhq.supabase.co/rest/v1/rpc/arcade_read";
  var SB_ARCADE_KEY = "sb_publishable_gy85z3j_jLrWu1xPluTOrg_n8AJ_fb-";
  var SCORE_READS = ["getGameBoardScores", "getHighScores", "getArcadeLeaders", "qualifiesForHighScore", "getHighScoreNameLength"];
  var arcadeCopy = null, arcadeCopyAt = 0, arcadeDownUntil = 0;

  function ownScoreRecent() {
    try { return Date.now() - Number(sessionStorage.getItem("oerScoreSavedAt") || 0) < 180000; } catch (e) { return false; }
  }

  function readArcadeCopy() {
    if (arcadeCopy && Date.now() - arcadeCopyAt < 20000) return arcadeCopy;
    arcadeCopyAt = Date.now();
    var ctl = window.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function() { ctl.abort(); }, 5000) : 0;
    arcadeCopy = fetch(SB_ARCADE, { headers: { apikey: SB_ARCADE_KEY, Authorization: "Bearer " + SB_ARCADE_KEY }, cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function(r) { clearTimeout(t); return r.ok ? r.json() : null; })
      .then(function(d) {
        if (d && d.games && Date.now() - Date.parse(d.checkedAt) < 1800000) return d;
        throw new Error("no copy");
      })
      .catch(function() { arcadeDownUntil = Date.now() + 600000; arcadeCopy = null; return null; });
    return arcadeCopy;
  }

  // The Apps Script answer from the copy, or undefined (= ask Apps Script).
  function arcadeAnswer(d, name, args) {
    var s = d.settings || {};
    if (name === "getHighScoreNameLength") return s.score_name_length || undefined;
    if (name === "getArcadeLeaders") {
      if (!d.leaders || !d.leaders.length) return undefined;
      var leaders = {};
      for (var i = 0; i !== d.leaders.length; i++) {
        var list = d.games[String(d.leaders[i]).toLowerCase()];
        leaders[d.leaders[i]] = list && list[0] ? { name: list[0].name, score: list[0].score } : null;
      }
      return { success: true, leaders: leaders };
    }
    var board = d.games[String(args[0] || "").trim().toLowerCase()];
    if (!board || !s.hall_of_fame_count || !s.score_display_count) return undefined;
    var copy = function(n) { return board.slice(0, n).map(function(e) { return { name: e.name, score: e.score }; }); };
    if (name === "getHighScores") return copy(s.score_display_count);
    if (name === "getGameBoardScores") return copy(s.hall_of_fame_count);
    if (name === "qualifiesForHighScore") {
      var kept = board.slice(0, s.hall_of_fame_count);
      return kept.length < s.hall_of_fame_count || Math.floor(Number(args[1])) > kept[s.hall_of_fame_count - 1].score;
    }
    return undefined;
  }

  function scoreCall(name, args, onOk, onFail, userObject) {
    if (name === "submitHighScore") {
      try { sessionStorage.setItem("oerScoreSavedAt", String(Date.now())); } catch (e) {}
      arcadeCopy = null;
      call(name, args, function(result, uo) {
        try { sessionStorage.setItem("oerScoreSavedAt", String(Date.now())); } catch (e) {}
        if (onOk) onOk(result, uo);
      }, onFail, userObject);
      return;
    }
    if (!window.fetch || ownScoreRecent() || Date.now() < arcadeDownUntil) { call(name, args, onOk, onFail, userObject); return; }
    readArcadeCopy().then(function(d) {
      var result;
      try { result = d ? arcadeAnswer(d, name, args) : undefined; } catch (e) { result = undefined; }
      if (result === undefined) { call(name, args, onOk, onFail, userObject); return; }
      if (onOk) onOk(result, userObject);
    });
  }

  function runner(onOk, onFail, userObject) {
    return new Proxy({}, {
      get: function(target, prop) {
        if (prop === "withSuccessHandler") return function(f) { return runner(f, onFail, userObject); };
        if (prop === "withFailureHandler") return function(f) { return runner(onOk, f, userObject); };
        if (prop === "withUserObject") return function(o) { return runner(onOk, onFail, o); };
        if (typeof prop !== "string" || prop === "then") return undefined;
        return function() {
          var args = Array.prototype.slice.call(arguments);
          if (prop === "submitHighScore" || SCORE_READS.indexOf(prop) !== -1) scoreCall(prop, args, onOk, onFail, userObject);
          else call(prop, args, onOk, onFail, userObject);
        };
      }
    });
  }

  function getLocation(callback) {
    var parameter = {}, parameters = {};
    new URLSearchParams(location.search).forEach(function(v, k) {
      if (!(k in parameter)) parameter[k] = v;
      (parameters[k] = parameters[k] || []).push(v);
    });
    callback({ parameter: parameter, parameters: parameters, hash: location.hash.replace(/^#/, "") });
  }

  window.google = window.google || {};
  window.google.script = {
    get run() { return runner(null, null, undefined); },
    url: { getLocation: getLocation }
  };
})();

// Page refresh timer that rests while the browser tab is hidden
// (2026-11-13): a hidden tab makes no requests, and a tab shown again
// after a missed refresh refreshes at once. Saves Apps Script runs.
window.oerEvery = function (fn, ms) {
  var last = Date.now();
  function run() { last = Date.now(); fn(); }
  setInterval(function () {
    if (!document.hidden && Date.now() - last >= ms - 1000) run();
  }, ms);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && Date.now() - last >= ms) run();
  });
};
