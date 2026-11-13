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
  var snapshot = location.pathname.indexOf("/monitor/") === 0 && window.fetch
    ? fetch("/data/monitors.json", { cache: "no-cache" })
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; })
    : null;
  var snapshotUsed = {};

  function call(name, args, onOk, onFail, userObject) {
    var cb = "tgdRpc" + Date.now().toString(36) + "_" + (++seq);
    var script = document.createElement("script");
    var done = false;
    var timer = setTimeout(function() { finish(null, "NO RESPONSE"); }, TIMEOUT_MS);

    function finish(answer, problem) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // The console frame's applet box and failure dialog (console.js).
      if (window.oerRpcEnd) window.oerRpcEnd(!!(answer && answer.ok) || shown);
      window[cb] = function() {};
      if (script.parentNode) script.parentNode.removeChild(script);
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
    window[cb] = function(answer) { finish(answer); };
    script.onerror = function() { finish(null, "NETWORK ERROR"); };
    script.src = TGD_API_URL +
      "?rpc=" + encodeURIComponent(name) +
      "&args=" + encodeURIComponent(JSON.stringify(args)) +
      "&callback=" + cb;
    document.head.appendChild(script);
  }

  function runner(onOk, onFail, userObject) {
    return new Proxy({}, {
      get: function(target, prop) {
        if (prop === "withSuccessHandler") return function(f) { return runner(f, onFail, userObject); };
        if (prop === "withFailureHandler") return function(f) { return runner(onOk, f, userObject); };
        if (prop === "withUserObject") return function(o) { return runner(onOk, onFail, o); };
        if (typeof prop !== "string" || prop === "then") return undefined;
        return function() { call(prop, Array.prototype.slice.call(arguments), onOk, onFail, userObject); };
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
