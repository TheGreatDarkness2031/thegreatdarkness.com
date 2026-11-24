// VISITOR PASS on the homepage (2026-11-23, owner). The visitor is a guest
// on a GN (not cleared) badge, like the guests in the watch log, but no
// escort is available. The badge number and first issue time stay in this
// browser (localStorage oerVisitorPass); nothing is sent anywhere.
// The reading path lives in /assets/start-path.js.
// Nothing here calls Apps Script; the reading path reads the published log
// copies only when a visitor opens it.
(function () {
  "use strict";

  var PASS_KEY = "oerVisitorPass";
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  // "23 NOV 2026 21:14 CENTRAL" (facility time). Worked out with the US
  // clock-change rule (2007+: second Sunday of March to first Sunday of
  // November, 02:00 local) instead of Intl's time zone tables, which cost
  // ~70 ms on a slow phone the first time they load.
  function facilityTime(ms) {
    var y = new Date(ms).getUTCFullYear();
    function sunday(month, n) {
      var first = new Date(Date.UTC(y, month, 1)).getUTCDay();
      return 1 + (7 - first) % 7 + 7 * (n - 1);
    }
    var dst = ms >= Date.UTC(y, 2, sunday(2, 2), 8) && ms < Date.UTC(y, 10, sunday(10, 1), 7);
    var c = new Date(ms - (dst ? 5 : 6) * 3600000);
    return pad(c.getUTCDate()) + " " + MONTHS[c.getUTCMonth()] + " " + c.getUTCFullYear() + " " +
      pad(c.getUTCHours()) + ":" + pad(c.getUTCMinutes()) + " CENTRAL";
  }

  // ---- the pass ----
  // GN-01..GN-10, the guest pool that is not cleared (OER_Personnel Badges).
  function readPass() {
    var pass = null;
    try { pass = JSON.parse(localStorage.getItem(PASS_KEY) || "null"); } catch (e) { pass = null; }
    if (!pass || !(pass.no >= 1 && pass.no <= 10) || !(pass.at > 0)) {
      pass = { no: 1 + Math.floor(Math.random() * 10), at: Date.now() };
      try { localStorage.setItem(PASS_KEY, JSON.stringify(pass)); } catch (e) {}
    }
    return pass;
  }
  function renderPass() {
    var no = $("passNo"), issued = $("passIssued");
    if (!no || !issued) return;
    var pass = readPass();
    no.textContent = pad(pass.no);
    issued.textContent = "ISSUED " + facilityTime(pass.at);
  }

  // ---- SUGGESTED READING ----
  var path = Array.isArray(window.OER_START_PATH) ? window.OER_START_PATH : [];
  var files = {};       // url -> Promise of records
  var maintIndex = null;
  var at = 0;

  function getJson(url) {
    if (!files[url]) {
      files[url] = fetch(url, { cache: "force-cache" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
      files[url].catch(function () { delete files[url]; });
    }
    return files[url];
  }
  function maintYear(id) {
    if (!maintIndex) maintIndex = getJson("/data/maintenance/index.json");
    return maintIndex.then(function (d) {
      var n = Number(id);
      var y = (d.years || []).filter(function (x) { return n >= Number(x.firstId) && n <= Number(x.lastId); })[0];
      if (!y) throw new Error("NOT INDEXED");
      return y.year;
    });
  }
  function loadRecord(item) {
    if (item.log === "watch") {
      var year = String(item.id).slice(0, 4);
      return getJson("/data/watch/WatchLog_" + year + ".json").then(function (d) {
        var r = (d.records || []).filter(function (x) { return String(x.recordId) === String(item.id); })[0];
        if (!r) throw new Error("NOT FOUND");
        var t = String(r.timestampLocal || "").split(" ")[1] || "";
        return {
          head: "WATCH LOG // RECORD " + r.recordId,
          meta: r.dateKey + (t ? " " + t.slice(0, 2) + ":" + t.slice(2) : "") + " // " + String(r.name || "").toUpperCase() + ", " + String(r.responsibleRole || ""),
          text: r.logEntry,
          href: "/watch/?year=" + year + "&date=" + r.dateKey
        };
      });
    }
    return maintYear(item.id).then(function (year) {
      return getJson("/data/maintenance/" + year + ".json").then(function (d) {
        var r = (d.records || []).filter(function (x) { return String(x.id) === String(item.id); })[0];
        if (!r) throw new Error("NOT FOUND");
        return {
          head: "MAINTENANCE LOG // ENTRY #" + r.id + (r.era ? " // " + r.era : ""),
          meta: r.date + " // " + String(r.author || "").toUpperCase() + ", " + String(r.role || "").toUpperCase(),
          text: r.entry,
          href: "/maintenance/?view=records&year=" + year
        };
      });
    });
  }

  function renderReader() {
    var box = $("orientReader");
    if (!box || !path.length) return;
    box.hidden = false;
    box.textContent = "";
    var n = el("div", "orient-meta", "RECORD " + (at + 1 < 10 ? "0" : "") + (at + 1) + " OF " + (path.length < 10 ? "0" : "") + path.length);
    var head = el("div", "orient-rec-head", "RETRIEVING...");
    var meta = el("div", "orient-meta", "");
    var text = el("blockquote", "orient-quote", "");
    var nav = el("div", "orient-nav");
    var prev = el("button", "orient-btn", "[ << PREVIOUS ]");
    var next = el("button", "orient-btn", at + 1 < path.length ? "[ NEXT >> ]" : "[ BACK TO THE FIRST ]");
    var open = el("a", "orient-go", "[ OPEN IN THE LOG ]");
    prev.type = next.type = "button";
    prev.disabled = at === 0;
    prev.addEventListener("click", function () { if (at > 0) { at--; renderReader(); } });
    next.addEventListener("click", function () { at = at + 1 < path.length ? at + 1 : 0; renderReader(); });
    open.hidden = true;
    nav.appendChild(prev); nav.appendChild(next); nav.appendChild(open);
    box.appendChild(n); box.appendChild(head); box.appendChild(meta); box.appendChild(text); box.appendChild(nav);
    var want = at;
    loadRecord(path[at]).then(function (r) {
      if (want !== at) return;
      head.textContent = r.head;
      meta.textContent = r.meta;
      text.textContent = r.text;
      open.href = r.href;
      open.hidden = false;
    }).catch(function () {
      if (want !== at) return;
      head.textContent = "RECORD UNAVAILABLE";
      text.textContent = "THE ARCHIVE COPY COULD NOT BE READ. TRY AGAIN LATER.";
    });
  }

  function start() {
    renderPass();
    var begin = $("orientBegin");
    if (begin) {
      if (!path.length) { begin.hidden = true; }
      begin.addEventListener("click", function () {
        begin.hidden = true;
        at = 0;
        renderReader();
      });
    }
    var leave = $("passLeave");
    if (leave) {
      leave.addEventListener("click", function (e) {
        var target = $("publicLog");
        var handle = $("bbsHandle");
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (handle) setTimeout(function () { try { handle.focus({ preventScroll: true }); } catch (x) { handle.focus(); } }, 400);
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
