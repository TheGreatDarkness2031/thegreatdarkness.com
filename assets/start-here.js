// VISITOR ORIENTATION panel on the homepage (2026-11-23).
// Settings (reading path, last watch record) live in /assets/start-path.js.
// Nothing here calls Apps Script; the reading path reads the published log
// copies only when a visitor opens it.
(function () {
  "use strict";

  var DAY = 86400000;
  // Same rotation as /schedule/ and the watch log (WatchLogGen.js wlgCrew_):
  // a 10-day cycle from 24 June 1998, Red on days 0, 1, 5, 6, 7. A crew holds
  // the floor 07:00-07:00 Central. The rotation was posted through 2026.
  var POSTED_END = Date.UTC(2027, 0, 1, 6, 0);

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function crewOn(y, m, d) {
    var n = Math.floor((Date.UTC(y, m, d) - Date.UTC(1998, 5, 24)) / DAY);
    n = ((n % 10) + 10) % 10;
    return [0, 1, 5, 6, 7].indexOf(n) >= 0 ? "RED" : "BLUE";
  }
  function central(ms) {
    var o = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23"
    }).formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month - 1, d: +o.day, h: +o.hour };
  }

  // ---- 02 TODAY'S WATCH ----
  function renderWatch() {
    var box = $("orientWatch");
    if (!box) return;
    box.textContent = "";
    var line = el("div", "orient-line");
    if (Date.now() >= POSTED_END) {
      line.textContent = "NO WATCH BILL POSTED.";
    } else {
      var c = central(Date.now());
      var base = c.h < 7 ? new Date(Date.UTC(c.y, c.m, c.d) - DAY) : new Date(Date.UTC(c.y, c.m, c.d));
      var crew = crewOn(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
      var day = c.h >= 7 && c.h < 19;
      line.appendChild(document.createTextNode("POSTED: "));
      line.appendChild(el("b", null, crew + " CREW // " + (day ? "DAY WATCH 07:00-19:00" : "NIGHT WATCH 19:00-07:00") + " CENTRAL"));
      line.appendChild(document.createTextNode(" "));
      var bill = el("a", null, "[ WATCH BILL ]");
      bill.href = "/schedule/";
      line.appendChild(bill);
    }
    box.appendChild(line);

    var last = window.OER_START_LAST_WATCH;
    if (last && last.text) {
      box.appendChild(el("div", "orient-meta", "LAST WATCH LOG ENTRY // " + last.date + " " + last.time + " // " + last.role));
      box.appendChild(el("blockquote", "orient-quote", last.text));
      var more = el("a", "orient-go", "[ READ THE WATCH LOG ]");
      more.href = "/watch/?year=" + last.date.slice(0, 4) + "&date=" + last.date;
      box.appendChild(more);
    }
  }

  // ---- 03 FROM THE BEGINNING ----
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
    renderWatch();
    var begin = $("orientBegin");
    if (begin) {
      if (!path.length) { begin.hidden = true; }
      begin.addEventListener("click", function () {
        begin.hidden = true;
        at = 0;
        renderReader();
      });
    }
    var leave = $("orientLeave");
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
