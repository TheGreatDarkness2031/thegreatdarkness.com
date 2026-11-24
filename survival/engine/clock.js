/* SURVIVAL engine: the clock (design: C:\TGD\docs\survival\design.md, section 6).
   Game time is counted in minutes since the scenario started. While playing,
   only actions move it. While the player is away it moves at AWAY_RATE of real
   time (owner 2026-11-23: quarter speed, "I work where I can't have my phone").
   Pure functions: window.SURVIVAL.clock in the browser, require() in node. */
(function (root) {
  "use strict";

  var AWAY_RATE = 0.25;          // 1 real hour away = 15 game minutes
  var MIN_AWAY_REAL_MS = 60000;  // under a minute (reload, tab switch) is not "away"
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // scenario: { startHour: 12, startMinute: 0, year, month (0-11), day,
  //             sunrise: "07:30", sunset: "18:15" }
  function parts(scenario, gameMin) {
    var startMin = (scenario.startHour || 0) * 60 + (scenario.startMinute || 0);
    var total = startMin + Math.floor(gameMin);
    var dayIndex = Math.floor(total / 1440);
    var m = total - dayIndex * 1440;
    return { day: dayIndex + 1, hour: Math.floor(m / 60), minute: m % 60, minuteOfDay: m };
  }

  // "DAY 1 13:20"
  function label(scenario, gameMin) {
    var p = parts(scenario, gameMin);
    return "DAY " + p.day + " " + pad(p.hour) + ":" + pad(p.minute);
  }

  // Calendar date for the epilogue: "26 OCT".
  function dateLabel(scenario, gameMin) {
    var p = parts(scenario, gameMin);
    var d = new Date(Date.UTC(scenario.year || 2026, scenario.month || 9, (scenario.day || 24) + p.day - 1));
    return pad(d.getUTCDate()) + " " + MONTHS[d.getUTCMonth()];
  }

  function hm(s) { var a = String(s).split(":"); return (+a[0]) * 60 + (+a[1] || 0); }

  // Light level 0 (night) .. 1 (day), with 30 minutes of twilight each side.
  function light(scenario, gameMin) {
    var m = parts(scenario, gameMin).minuteOfDay;
    var rise = hm(scenario.sunrise || "07:30"), set = hm(scenario.sunset || "18:15"), tw = 30;
    if (m >= rise + tw && m <= set - tw) return 1;
    if (m <= rise - tw || m >= set + tw) return 0;
    if (m < rise + tw) return (m - (rise - tw)) / (2 * tw);
    return ((set + tw) - m) / (2 * tw);
  }

  function isDark(scenario, gameMin) { return light(scenario, gameMin) < 0.35; }

  // Game minutes until the next sunset / sunrise (for "2 H OF DAYLIGHT LEFT").
  function minutesUntil(scenario, gameMin, hhmm) {
    var m = parts(scenario, gameMin).minuteOfDay, t = hm(hhmm);
    return t > m ? t - m : t + 1440 - m;
  }

  // Game minutes that passed while away, from the real time of the last save.
  function awayGameMinutes(lastSaveRealMs, nowRealMs, rate) {
    var gap = nowRealMs - lastSaveRealMs;
    if (!(gap >= MIN_AWAY_REAL_MS)) return 0;
    return Math.floor(gap / 60000 * (rate != null ? rate : AWAY_RATE));
  }

  var api = { AWAY_RATE: AWAY_RATE, MIN_AWAY_REAL_MS: MIN_AWAY_REAL_MS, parts: parts, label: label, dateLabel: dateLabel,
              light: light, isDark: isDark, minutesUntil: minutesUntil, awayGameMinutes: awayGameMinutes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.clock = api; }
})(this);
