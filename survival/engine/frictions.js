/* SURVIVAL engine: real-world events as unknown friction (owner, 2026-11-24).
   The site's live monitors (published as /data/signals.json by the Publish site
   workflow) are read now and then and folded into the game as things that just
   happen: a cold snap, a gusty day, a squall, a smoky haze that hides signal
   smoke, a tremor, search aircraft held on the ground, search teams slowed,
   an aurora. The game never says where they came from. The data is used as
   reported; only how the game reacts to it is the game's choice.

   fromSignals(g, sc, signals) -> new friction entries (pure, seeded by the game
   seed + the snapshot time). apply(g, sc, signals) adds them to the game and to
   the action log (["~friction", entries]) so a replay gives the same game.
   window.SURVIVAL.frictions / require(). */
(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var W = node ? require("./world.js") : root.SURVIVAL.world;
  var G = node ? require("./game.js") : root.SURVIVAL.game;

  var MIN_REAL_GAP_MS = 3 * 3600 * 1000;   // look at the signals at most every 3 real hours
  var MIN_GAME_GAP_MIN = 12 * 60;          // ... or every 12 game hours, for someone playing straight through
  var RANK = { NOMINAL: 0, WATCH: 1, ELEVATED: 2, CRITICAL: 3 };

  var TEXT = {
    SMOKE: "A brown haze has crept in. The sun is a dull orange disc and the air smells faintly of smoke from somewhere far off.",
    TREMOR: "The ground shivers under you for a few seconds. Somewhere a dead tree lets go and comes down with a long, splintering crash.",
    AURORA: "Pale green light is moving across the northern sky, folding and unfolding like a curtain.",
    WIND: "The wind is rising. The treetops have started to roar.",
    DOWNPOUR: "A dark squall line is coming in fast.",
    COLD: null, WARM: null, GROUNDED: null, GPS: null       // felt, never announced
  };

  function active(g, kind, atMin) {
    return (g.friction || []).some(function (f) { return f.kind === kind && atMin < f.toMin; });
  }

  function count(titles, re) {
    var n = 0;
    Object.keys(titles || {}).forEach(function (t) { if (re.test(t)) n += titles[t]; });
    return n;
  }

  function fromSignals(g, sc, s) {
    if (!s || !s.built) return [];
    var out = [], key = s.built;
    var r = function (what) { return W.roll(g.seed, "fr", key, what); };
    var add = function (kind, hours, mag, extra) {
      if (active(g, kind, g.min)) return;
      var start = g.min + 20 + Math.floor(r(kind + "at") * 160);
      var f = { kind: kind, fromMin: start, toMin: start + Math.round(hours * 60), mag: Math.round(mag * 10) / 10 };
      if (TEXT[kind]) f.text = (sc.frictionText && sc.frictionText[kind]) || TEXT[kind];
      if (kind === "AURORA") f.night = true;
      if (kind === "TREMOR") f.data = { adds: { "large branch": 1 } };
      if (extra) Object.keys(extra).forEach(function (k) { f[k] = extra[k]; });
      out.push(f);
    };
    var wx = s.severewx || {}, titles = wx.titles || {};
    // The country always has some warnings up; the monitor's own status sets how much they weigh.
    var lift = 0.1 * (RANK[wx.status] || 0);
    var p = function (n) { return n ? Math.min(0.55, 0.08 + lift + 0.01 * Math.min(n, 15)) : 0; };
    var windy = count(titles, /WIND|BLIZZARD|TORNADO|THUNDERSTORM|HURRICANE|TROPICAL/);
    var wet = count(titles, /FLOOD|RAIN|STORM|THUNDERSTORM|HURRICANE|TROPICAL/);
    var cold = count(titles, /FREEZE|FROST|WINTER|BLIZZARD|ICE|COLD|CHILL|SNOW/);
    var heat = count(titles, /HEAT/);
    if (r("wind") < p(windy)) add("WIND", 6 + r("windh") * 8, 8 + r("windm") * 10);
    if (r("rain") < p(wet)) add("DOWNPOUR", 1.5 + r("rainh") * 2.5, 0.6 + r("rainm") * 0.25);
    if (r("cold") < p(cold)) add("COLD", 10 + r("coldh") * 10, 1.5 + r("coldm") * 2.5);
    if (r("heat") < p(heat)) add("WARM", 12, 2);
    var t = s.temp || {};
    if (typeof t.dev === "number" && Math.abs(t.dev) >= 3 && r("temp") < 0.7) add(t.dev < 0 ? "COLD" : "WARM", 24, Math.min(3, Math.abs(t.dev) / 1.8 * 0.6));
    var wf = s.wildfire || {};
    if (r("smoke") < (RANK[wf.status] ? 0.5 : wf.concern > 0 ? 0.15 : 0)) add("SMOKE", 12 + r("smokeh") * 12, 1);
    var q = s.quake || {};
    if (q.max24 >= 5 && r("quake") < 0.6 || q.max24 >= 4 && r("quake") < 0.25) add("TREMOR", 12, q.max24);
    var sp = s.spacewx || {};
    if (sp.kp >= 5 && r("aurora") < 0.8) add("AURORA", 4, sp.kp);
    if (s.gps && s.gps.status && s.gps.status !== "NOMINAL") add("GPS", 24, 1);
    var tr = s.transport || {};
    if ((tr.worst === "CRITICAL" || tr.worst === "ELEVATED") && r("ground") < 0.6) add("GROUNDED", 4 + r("groundh") * 4, 1);
    return out;
  }

  // Use a signals snapshot: at most every 3 real hours, never the same snapshot twice.
  function apply(g, sc, signals, nowRealMs) {
    if (!signals || !signals.built || g.over) return [];
    var last = g.flags.signalsAt || 0, lastBuilt = g.flags.signalsBuilt, lastMin = g.flags.signalsMin != null ? g.flags.signalsMin : -1e9;
    if (lastBuilt === signals.built) return [];
    if (nowRealMs && nowRealMs - last < MIN_REAL_GAP_MS && g.min - lastMin < MIN_GAME_GAP_MIN) return [];
    var list = fromSignals(g, sc, signals);
    record(g, list, nowRealMs || 0, signals.built);
    g.actions.push(["~friction", list, nowRealMs || 0, signals.built]);
    return list;
  }

  function record(g, list, at, built) {
    g.flags.signalsAt = at; g.flags.signalsBuilt = built; g.flags.signalsMin = g.min;
    if (list.length) g.friction = (g.friction || []).concat(list);
  }

  var api = { record: record, fromSignals: fromSignals, apply: apply, MIN_REAL_GAP_MS: MIN_REAL_GAP_MS, MIN_GAME_GAP_MIN: MIN_GAME_GAP_MIN };
  if (node) module.exports = api;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.frictions = api; }
})(this);
