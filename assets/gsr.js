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
      if (window.oerRpcEnd) window.oerRpcEnd(!!(answer && answer.ok));
      window[cb] = function() {};
      if (script.parentNode) script.parentNode.removeChild(script);
      if (answer && answer.ok) {
        if (onOk) onOk(answer.result, userObject);
      } else {
        var error = new Error(problem || (answer && answer.error) || "REQUEST FAILED");
        if (onFail) onFail(error, userObject);
        else console.error(name + ": " + error.message);
      }
    }

    if (window.oerRpcStart) window.oerRpcStart();
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
