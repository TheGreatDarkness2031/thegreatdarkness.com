/* SURVIVAL engine: the world (design: C:\TGD\docs\survival\design.md, sections 2 and 6).
   Weather, daylight, places, travel, the creek and events, all worked out from the
   scenario data + one seed. Nothing here is stored: the same seed and minute always
   give the same answer, so a game is replayable from seed + action log.
   window.SURVIVAL.world in the browser, require() in node. */
(function (root) {
  "use strict";

  var clock = (typeof module !== "undefined" && module.exports) ? require("./clock.js") : root.SURVIVAL.clock;

  // ---- seeded randomness ----
  // roll(seed, key...) -> [0, 1). A hash, not a running generator: a roll depends
  // only on its keys, never on how many rolls came before it.
  function roll() {
    var s = Array.prototype.join.call(arguments, "|");
    var h = 1779033703 ^ s.length;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    var t = (h ^= h >>> 16) >>> 0;
    // mulberry32 finish
    t = (t + 0x6D2B79F5) >>> 0;
    var r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  function newSeed() { return Math.floor(Math.random() * 2147483647) + 1; }

  function newWorld(scenario, seed) { return { scenario: scenario, seed: seed != null ? seed : newSeed() }; }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---- weather on open ground ----
  function keyframes(sc, hour) {
    var k = sc.weather, i = 0;
    if (hour <= k[0][0]) return k[0].slice(1);
    if (hour >= k[k.length - 1][0]) return k[k.length - 1].slice(1);
    while (k[i + 1][0] < hour) i++;
    var a = k[i], b = k[i + 1], f = (hour - a[0]) / (b[0] - a[0]);
    return [1, 2, 3, 4].map(function (j) { return a[j] + (b[j] - a[j]) * f; });
  }

  // Small seeded wobble so two games don't feel identical (about +-0.6 C, +-3 km/h).
  function wobble(world, hour, what, size) {
    var h0 = Math.floor(hour), f = hour - h0;
    var a = roll(world.seed, what, h0) - 0.5, b = roll(world.seed, what, h0 + 1) - 0.5;
    return (a + (b - a) * f) * 2 * size;
  }

  function openWeather(world, gameMin) {
    var hour = gameMin / 60, k = keyframes(world.scenario, hour);
    return {
      airC: k[0] + wobble(world, hour, "air", 0.6),
      windKmh: Math.max(0, k[1] + wobble(world, hour, "wind", 3)),
      rain: k[2] < 0.02 ? 0 : k[2],
      cloud: clamp(k[3], 0, 1)
    };
  }

  // ---- creek level (no randomness: follows the rain) ----
  var creekCache = {};
  var CREEK_STEP_MIN = 15;
  function creekLevel(world, gameMin) {
    var sc = world.scenario, key = sc.id;
    var arr = creekCache[key];
    if (!arr) {
      arr = [0];
      var lvl = 0, dtH = CREEK_STEP_MIN / 60, decay = Math.exp(-dtH / sc.creek.drainHours);
      for (var i = 1; i <= 160 * 60 / CREEK_STEP_MIN; i++) {
        var r = keyframes(sc, (i - 0.5) * dtH)[2];
        lvl = lvl * decay + r * sc.creek.fill * dtH;
        arr.push(lvl);
      }
      creekCache[key] = arr;
    }
    var idx = clamp(gameMin / CREEK_STEP_MIN, 0, arr.length - 1), i0 = Math.floor(idx);
    var i1 = Math.min(arr.length - 1, i0 + 1);
    return arr[i0] + (arr[i1] - arr[i0]) * (idx - i0);
  }

  function skyWord(rain, cloud) {
    if (rain >= 0.4) return "RAIN";
    if (rain >= 0.05) return "LIGHT RAIN";
    if (cloud >= 0.85) return "OVERCAST";
    if (cloud >= 0.4) return "CLOUDY";
    if (cloud >= 0.15) return "PARTLY CLOUDY";
    return "CLEAR";
  }
  function windWord(kmh) { return kmh < 5 ? "CALM" : kmh < 15 ? "LIGHT" : kmh < 25 ? "MODERATE" : "STRONG"; }

  // ---- conditions where the player is ----
  // The answer carries body.js env fields (airC, windKmh, rain, groundC); step 3
  // adds shelter, fire and bed.
  function conditions(world, zoneId, gameMin) {
    var sc = world.scenario, z = sc.zones[zoneId];
    if (!z) throw new Error("unknown zone " + zoneId);
    var o = openWeather(world, gameMin), m = z.micro;
    var light = clock.light(sc, gameMin);
    // Clear, still nights let cold air pool in hollows; cloud or wind mixes it.
    var nightMix = (1 - light) * (1 - o.cloud) * (o.windKmh < 15 ? 1 : 0.5);
    var airC = o.airC + m.dayC * light + m.nightC * nightMix;
    var level = creekLevel(world, gameMin);
    var p = clock.parts(sc, gameMin);
    var evening = p.hour >= 12, twilight = light > 0 && light < 1;
    var flooded = !!z.floods && level >= sc.creek.floodAt;
    var w = {
      zone: zoneId, zoneName: z.name, gameMin: gameMin, hour: gameMin / 60,
      airC: airC,
      windKmh: o.windKmh * m.wind,
      rain: o.rain * m.rain,
      cloud: o.cloud,
      groundC: 3 + 0.35 * (o.airC - 3),
      light: light,
      dark: clock.isDark(sc, gameMin),
      dusk: twilight && evening,
      dawn: twilight && !evening,
      frost: airC <= 0 && o.rain === 0,
      creekLevel: level,
      creekHigh: level >= sc.creek.floodAt * 0.75,
      flooded: flooded,
      open: z.open
    };
    w.sky = skyWord(w.rain, w.cloud);
    w.windWord = windWord(w.windKmh);
    return w;
  }

  // "DAY 1 13:20 // CLEAR 11 C // WIND LIGHT // CLEARING"
  function topLine(world, zoneId, gameMin) {
    var w = conditions(world, zoneId, gameMin);
    return clock.label(world.scenario, gameMin) + " // " + w.sky + " " + Math.round(w.airC) + " C // WIND " + w.windWord + " // " + w.zoneName;
  }

  // ---- travel ----
  function neighbours(sc, id) {
    var out = [];
    sc.links.forEach(function (l) {
      if (l[0] === id) out.push([l[1], l[2]]);
      else if (l[1] === id) out.push([l[0], l[2]]);
    });
    return out;
  }

  // Shortest route by daylight walking time.
  function route(sc, from, to) {
    if (!sc.zones[from] || !sc.zones[to]) return null;
    var dist = {}, prev = {}, done = {};
    Object.keys(sc.zones).forEach(function (k) { dist[k] = Infinity; });
    dist[from] = 0;
    for (;;) {
      var u = null;
      Object.keys(dist).forEach(function (k) { if (!done[k] && dist[k] < Infinity && (u === null || dist[k] < dist[u])) u = k; });
      if (u === null || u === to) break;
      done[u] = true;
      neighbours(sc, u).forEach(function (n) {
        var d = dist[u] + n[1];
        if (d < dist[n[0]]) { dist[n[0]] = d; prev[n[0]] = u; }
      });
    }
    if (dist[to] === Infinity) return null;
    var path = [to];
    while (path[0] !== from) path.unshift(prev[path[0]]);
    return { path: path, baseMinutes: dist[to] };
  }

  function legMinutes(sc, a, b) {
    var n = neighbours(sc, a).filter(function (x) { return x[0] === b; })[0];
    return n ? n[1] : null;
  }

  // Plan a trip leaving at gameMin. opts.timeMult = the body's slowdown (body.effects).
  // Each leg is timed at its own start: darkness up to x2, wet ground after rain
  // x1.15, a flooded bottomland x1.5 and wading. injuryChance per leg; roll with
  // tripRoll so the outcome comes from the seed.
  function travel(world, from, to, gameMin, opts) {
    var sc = world.scenario, r = route(sc, from, to);
    if (!r) return null;
    var mult = (opts && opts.timeMult) || 1;
    var t = gameMin, legs = [], wade = false, darkLegs = 0;
    for (var i = 1; i < r.path.length; i++) {
      var a = r.path[i - 1], b = r.path[i];
      var here = conditions(world, a, t);
      var m = legMinutes(sc, a, b) * (1 + (1 - here.light)) * mult;
      if (here.creekLevel > 0.5 || here.rain > 0.1) m *= 1.15;
      var flooded = (sc.zones[b].floods || sc.zones[a].floods) && here.creekLevel >= sc.creek.floodAt;
      if (flooded) { m *= 1.5; wade = true; }
      m = Math.round(m);
      if (here.dark) darkLegs++;
      legs.push({ from: a, to: b, startMin: t, minutes: m, dark: here.dark, wade: flooded,
                  injuryChance: 0.005 + 0.05 * (1 - here.light) + (flooded ? 0.02 : 0) });
      t += m;
    }
    return { from: from, to: to, path: r.path, legs: legs, minutes: t - gameMin, arriveMin: t,
             baseMinutes: r.baseMinutes, wade: wade, darkLegs: darkLegs };
  }

  // The seeded roll for trip number n (count of trips made so far), leg i.
  function tripRoll(world, tripNo, legIndex) { return roll(world.seed, "trip", tripNo, legIndex || 0); }

  // ---- events ----
  // Weather notices: changes anyone would notice, found by looking every 5 minutes.
  function notices(world, zoneId, fromMin, toMin) {
    var sc = world.scenario, out = [];
    // Look on a fixed 5-minute grid, so cutting time into actions changes nothing.
    var t0 = Math.ceil(fromMin / 5) * 5;
    var prev = conditions(world, zoneId, Math.max(0, t0 - 5));
    for (var t = t0; t < toMin; t += 5) {
      var w = conditions(world, zoneId, t);
      var openNow = openWeather(world, t).rain, openPrev = openWeather(world, Math.max(0, t - 5)).rain;
      if (openNow > 0 && openPrev === 0) out.push({ atMin: t, id: "RAIN_STARTS", text: "It starts to rain." });
      if (openNow >= 0.4 && openPrev < 0.4) out.push({ atMin: t, id: "RAIN_STEADY", text: "The rain settles in, steady and cold." });
      if (openNow === 0 && openPrev > 0) out.push({ atMin: t, id: "RAIN_STOPS", text: "The rain stops. Water keeps dripping from the trees." });
      if (w.windKmh >= 20 && prev.windKmh < 20) out.push({ atMin: t, id: "WIND_UP", text: "The wind picks up." });
      if (w.dusk && !prev.dusk && !prev.dark) out.push({ atMin: t, id: "DUSK", text: "The light is going." });
      if (w.dark && !prev.dark && t > 0) out.push({ atMin: t, id: "DARK", text: "It is dark now." });
      if (!w.dark && prev.dark) out.push({ atMin: t, id: "DAWN", text: "Grey light in the east." });
      if (w.frost && !prev.frost) out.push({ atMin: t, id: "FROST", text: "Frost is forming on the grass." });
      if (w.creekLevel >= sc.creek.floodAt && prev.creekLevel < sc.creek.floodAt)
        out.push({ atMin: t, id: "FLOOD", text: zoneId === "bottomland" || zoneId === "creek"
          ? "The creek is over its banks. Water is spreading across the bottomland."
          : "Far off, the creek sounds louder than before." });
      if (w.creekLevel < sc.creek.floodAt && prev.creekLevel >= sc.creek.floodAt)
        out.push({ atMin: t, id: "FLOOD_ENDS", text: "The creek is back inside its banks." });
      prev = w;
    }
    return out;
  }

  // The minute event ev happens in slot s for this context, or null.
  function fires(world, ev, s, ctx) {
    if (roll(world.seed, ev.id, s) >= ev.chance) return null;
    var at = s * ev.slot + Math.floor(roll(world.seed, ev.id, "at", s) * ev.slot);
    return ev.when(conditions(world, ctx.zone, at), ctx) ? at : null;
  }

  // One-a-day events (the doe at dusk): only the first slot of that day counts.
  // Earlier slots are checked with the same context, so the answer does not
  // depend on how the time was cut into actions.
  function firedEarlierToday(world, ev, s, at, ctx) {
    var day = clock.parts(world.scenario, at).day;
    for (var e = s - 1; e >= 0; e--) {
      var t = e * ev.slot + ev.slot - 1;
      if (clock.parts(world.scenario, t).day !== day && clock.parts(world.scenario, e * ev.slot).day !== day) break;
      var a = fires(world, ev, e, ctx);
      if (a !== null && clock.parts(world.scenario, a).day === day) return true;
    }
    return false;
  }

  // World events between fromMin (inclusive) and toMin (exclusive), sorted.
  // ctx: { zone, inShelter } for the time span (one action = one context).
  function events(world, fromMin, toMin, ctx) {
    var out = [];
    world.scenario.events.forEach(function (ev) {
      var s0 = Math.floor(fromMin / ev.slot), s1 = Math.floor((toMin - 1) / ev.slot);
      for (var s = s0; s <= s1; s++) {
        var at = fires(world, ev, s, ctx);
        if (at === null || at < fromMin || at >= toMin) continue;
        if (ev.onePerDay && firedEarlierToday(world, ev, s, at, ctx)) continue;
        out.push({ atMin: at, id: ev.id, text: ev.text, data: ev.data || {} });
      }
    });
    return out.concat(notices(world, ctx.zone, fromMin, toMin)).sort(function (a, b) { return a.atMin - b.atMin || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  }

  // An env function for body.step: the weather moving through a long action.
  function envAt(world, zoneId, extra) {
    return function (gameMin) {
      var w = conditions(world, zoneId, gameMin), e = { airC: w.airC, windKmh: w.windKmh, rain: w.rain, groundC: w.groundC };
      if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
      return e;
    };
  }

  var api = { roll: roll, newSeed: newSeed, newWorld: newWorld, openWeather: openWeather, creekLevel: creekLevel,
              conditions: conditions, topLine: topLine, route: route, travel: travel, tripRoll: tripRoll,
              notices: notices, events: events, envAt: envAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.world = api; }
})(this);
