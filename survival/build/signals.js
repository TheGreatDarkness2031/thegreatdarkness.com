/* SURVIVAL: the world outside, for the game's unknown friction (engine/frictions.js).
   Reads the Publish site workflow's monitor snapshot (data/monitors.json) and
   writes a small data/signals.json: only the numbers the game reacts to, as the
   monitors reported them. No text from the monitors reaches the game.
     node survival/build/signals.js [monitors.json] [signals.json]
   build(snapshot) is pure (tests/test_survival_frictions.js). */
"use strict";

function answer(a, name, args) {
  var k = Object.keys(a).filter(function (x) { return x.indexOf(name + (args || "")) === 0; })[0];
  return k ? a[k] : null;
}

var RANK = { NOMINAL: 0, WATCH: 1, ELEVATED: 2, CRITICAL: 3 };

function build(snap) {
  if (!snap || !snap.answers) return null;
  var a = snap.answers, out = { built: snap.built || new Date().toISOString() };
  var sw = answer(a, "getTgdMonitorPage", '["severewx"');
  if (sw) {
    var titles = {};
    (sw.items || []).forEach(function (i) { var t = String(i.title || "").toUpperCase(); if (t) titles[t] = (titles[t] || 0) + 1; });
    out.severewx = { status: sw.status || "", titles: titles };
  }
  var wf = answer(a, "getTgdMonitorPage", '["wildfire"');
  if (wf) { var m = /(\d+) OF CONCERN/.exec(wf.summary || ""); out.wildfire = { status: wf.status || "", concern: m ? +m[1] : 0 }; }
  var sp = answer(a, "getTgdMonitorPage", '["spacewx"');
  if (sp) { var k = /KP ([\d.]+)/.exec(sp.summary || ""); out.spacewx = { status: sp.status || "", kp: k ? +k[1] : 0 }; }
  var gps = answer(a, "getTgdMonitorPage", '["gps"');
  if (gps) out.gps = { status: gps.status || "" };
  var q = answer(a, "getQuakeStatus");
  if (q) out.quake = { status: q.status || "", max24: +q.highestMagnitude || 0 };
  var t = answer(a, "getTempViewSummary");
  if (t && typeof t.networkDeviation === "number") out.temp = { status: t.status || "", dev: t.networkDeviation };
  // Transportation: the worst status its Event Log rows show in the 12 hours before the snapshot.
  var builtMs = Date.parse(out.built) || Date.now(), worst = "NOMINAL";
  Object.keys(a).filter(function (x) { return x.indexOf("getEventFeedData") === 0; }).forEach(function (x) {
    (a[x].events || []).forEach(function (e) {
      if (e.source === "TRANSPORT" && builtMs - (e.loggedAtMillis || 0) <= 12 * 3600000 && (RANK[e.status] || 0) > RANK[worst]) worst = e.status;
    });
  });
  out.transport = { worst: worst };
  return out;
}

if (require.main === module) {
  var fs = require("fs");
  var src = process.argv[2] || "data/monitors.json", dst = process.argv[3] || "data/signals.json";
  try {
    var s = build(JSON.parse(fs.readFileSync(src, "utf8")));
    if (!s) { console.log("::warning::no signals: monitor snapshot unreadable"); process.exit(0); }
    fs.writeFileSync(dst, JSON.stringify(s));
    console.log("signals: " + Object.keys(s).join(", "));
  } catch (e) { console.log("::warning::no signals: " + e.message); }
}

module.exports = { build: build };
