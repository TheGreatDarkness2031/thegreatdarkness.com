/* SURVIVAL engine: everything around the actions (design sections 6, 7 and 9).
   Away time and standing orders, the situation report, suggested actions with
   their time, the epilogue and the score. Temperatures for the screen in F.
   window.SURVIVAL.session / require(). */
(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var S = node ? null : root.SURVIVAL;
  var G = node ? require("./game.js") : S.game;
  var A = node ? require("./actions.js") : S.actions;
  var W = node ? require("./world.js") : S.world;
  var K = node ? require("./clock.js") : S.clock;
  var B = node ? require("./body.js") : S.body;

  var ORDERS = {
    REST:   { name: "REST IN SHELTER", blurb: "Sleep at night, rest by day. Stay put." },
    TEND:   { name: "TEND FIRE AND REST", blurb: "Keep the fire fed from the wood pile. It dies when the wood runs out." },
    AWAKE:  { name: "STAY AWAKE BY THE FIRE", blurb: "Keep watch and keep the fire going all night. Costs sleep." },
    SIGNAL: { name: "SIGNAL", blurb: "Keep the fire going and light the signal fire if a plane comes over." }
  };

  // ---- away time ----
  // The world moves on at quarter speed while the player is away (clock.AWAY_RATE);
  // the character follows the standing order. Writes an hour-by-hour line into the
  // journal (marked away) and returns the lines.
  function runAway(g, sc, minutes, order) {
    order = ORDERS[order] ? order : (g.order || "REST");
    var lines = [], left = Math.floor(minutes), startJ = g.journal.length;
    if (left <= 0 || g.over) return { minutes: 0, lines: lines };
    g.actions.push(["~away", left, order]);
    var logAt = g.actions.length;
    var start = g.min;
    while (left > 0 && !g.over) {
      var dt = Math.min(60 - (g.min % 60) || 60, left);
      var w = W.conditions(G.worldOf(g, sc), g.zone, g.min);
      var fireOrder = order !== "REST";
      if (fireOrder && G.fireAt(g, g.zone) !== "none") {
        var f = g.fires[g.zone];
        if (f.fuelMin < 30 && G.near(g, "fuel") > 0) G.perform(g, sc, "feed_fire");
        else if (G.fireAt(g, g.zone) === "embers" && G.has(g, "kindling")) G.perform(g, sc, "light_fire");
      }
      if (g.over) break;
      var act = order === "AWAKE" ? "rest" : (w.dark ? "sleep" : "rest");
      var before = g.min;
      var evs = G.advance(g, sc, dt, act, { inShelter: true });
      left -= g.min - before || dt;
      if (order === "SIGNAL" && !g.over && g.signals.pile === g.zone && G.fireAt(g, g.zone) !== "none" &&
          evs.some(function (e) { return e.id === "SEARCH_AIRCRAFT"; })) G.perform(g, sc, "light_signal");
      if (!g.over) {
        var d = B.describe(g.body), fire = G.fireAt(g, g.zone), sh = G.shelterHere(g, sc);
        var line = (act === "sleep" ? "SLEEPING" : order === "AWAKE" ? "AWAKE" : "RESTING") + (sh ? " IN THE " + sh.name : " IN THE OPEN") +
          ". " + d.temp + (d.wet !== "DRY" ? ", " + d.wet : "") + (d.water !== "OK" ? ", " + d.water : "") +
          (fire === "burning" ? ". FIRE BURNING." : fire === "embers" ? ". FIRE DOWN TO COALS." : ".");
        G.log(g, line, g.min); g.journal[g.journal.length - 1].away = true;
        lines.push({ min: g.min, text: line });
      }
    }
    if (g.over && g.over.result === "DEAD" && !g.over.logged) { g.over.logged = true; G.log(g, G.deathText(g.over.cause)); }
    g.actions.length = logAt;   // the order's own feeding/signals replay from the ~away entry
    return { minutes: g.min - start, lines: lines, journal: g.journal.slice(startJ) };
  }

  // From the saved real time to now.
  function applyAway(g, sc, lastSaveRealMs, nowRealMs) {
    var m = K.awayGameMinutes(lastSaveRealMs, nowRealMs);
    return runAway(g, sc, m, g.order);
  }

  // ---- what the screen shows ----
  function searchLine(g, sc) {
    var L = G.levelOf(g, sc), h = g.min / 60;
    if (g.over && g.over.result === "RESCUED") return "SEARCH: FOUND";
    if (L.hidden) return "SEARCH: UNKNOWN";
    if (h < L.searchH) return "SEARCH: NOT STARTED (DUE " + K.label(sc, L.searchH * 60) + ")";
    return "SEARCH: UNDERWAY // RESCUE BY " + K.label(sc, L.rescueH * 60);
  }

  // 2-4 plain sentences: where and when, the most urgent body need, the camp.
  function situation(g, sc) {
    if (g.over) return g.over.result === "RESCUED" ? "You have been found." : G.deathText(g.over.cause);
    var world = G.worldOf(g, sc), w = W.conditions(world, g.zone, g.min), d = B.describe(g.body), out = [];
    var sunset = K.minutesUntil(sc, g.min, sc.sunset), sunrise = K.minutesUntil(sc, g.min, sc.sunrise);
    var lightLeft = !w.dark && sunset < 180 ? " About " + (sunset < 60 ? sunset + " minutes" : Math.round(sunset / 30) / 2 + " hours") + " of daylight left." : "";
    var dawn = w.dark ? " Dawn is about " + Math.round(sunrise / 60) + " hours off." : "";
    out.push("You are in the " + sc.zones[g.zone].name.toLowerCase() + ". " + skyText(w) + lightLeft + dawn);
    var urgent = [];
    if (d.temp === "SEVERE HYPOTHERMIA") urgent.push("You have stopped shivering. Your thoughts are slow and thick. You are dying of cold.");
    else if (d.temp === "HYPOTHERMIC") urgent.push("You are shaking hard and your fingers won't work properly. You need to get warm now.");
    else if (d.temp === "SHIVERING") urgent.push("You are shivering.");
    if (d.wet === "SOAKED" || d.wet === "WET") urgent.push("Your clothes are " + d.wet.toLowerCase() + "; cotton holds almost no warmth like this.");
    if (d.water === "SEVERELY DEHYDRATED") urgent.push("Your head pounds and your thinking is muddled. You need water badly.");
    else if (d.water === "DEHYDRATED") urgent.push("Your mouth is dry and your head aches. You need water.");
    else if (d.water === "THIRSTY") urgent.push("You are thirsty.");
    if (d.sleep === "EXHAUSTED" || d.sleep === "SPENT") urgent.push("You are exhausted.");
    if (d.food === "STARVING" || d.food === "WASTING") urgent.push("Hunger has become weakness; everything takes longer.");
    if (urgent.length) out.push(urgent.slice(0, 2).join(" "));
    var camp = [], sh = g.shelters[g.zone], fire = G.fireAt(g, g.zone);
    if (sh) camp.push("Your " + sh.name.toLowerCase() + " is here");
    if (fire === "burning") camp.push("the fire is burning (" + Math.round(g.fires[g.zone].fuelMin) + " min of wood in it, " + G.near(g, "fuel") + " armloads stacked)");
    else if (fire === "embers") camp.push("the fire is down to coals");
    if (camp.length) out.push(camp.join("; ").replace(/^./, function (x) { return x.toUpperCase(); }) + ".");
    else if (g.min > 6 * 60 && !Object.keys(g.shelters).length) out.push("You have no shelter.");
    return out.join(" ");
  }

  function skyText(w) {
    var t = W.tempF(w.airC);
    var sky = { "CLEAR": "The sky is clear", "PARTLY CLOUDY": "Some cloud", "CLOUDY": "Cloudy", "OVERCAST": "Overcast", "LIGHT RAIN": "A light rain is falling", "RAIN": "Steady rain", "LIGHT SNOW": "Light snow", "SNOW": "Snow is falling" }[w.sky] || w.sky;
    var wind = w.windWord === "CALM" ? "no wind" : w.windWord === "LIGHT" ? "a light wind" : w.windWord === "MODERATE" ? "a steady wind" : "a strong wind";
    return sky + ", " + t + ", " + wind + (w.dark ? ", and it is dark." : ".");
  }

  // Minutes an action would take now (for "(30 MIN)" next to it), without doing it.
  function estimate(g, sc, id, arg) {
    var def = A.byId[id]; if (!def) return null;
    var world = G.worldOf(g, sc), e = G.effects(g), w = W.conditions(world, g.zone, g.min);
    if (def.travel) { var t = W.travel(world, g.zone, arg, g.min, { timeMult: e.walkMult }); return t ? t.minutes : null; }
    var c = { sc: sc, world: world, zone: sc.zones[g.zone], w: w, e: e, G: G };
    var m = typeof def.minutes === "function" ? def.minutes(g, c, arg) : def.minutes;
    if (def.gather && w.dark && !G.fireBurning(g)) m *= 1.5;
    if (!def.fixedTime) m *= e.timeMult;
    return Math.max(1, Math.round(m));
  }

  // The numbered list: what can be done now, most useful first, plus travel.
  var PRIORITY = ["drink", "light_fire", "feed_fire", "dry_by_fire", "light_signal", "treat_cut", "build_hut", "build_leanto", "make_bed",
    "gather_wood", "gather_kindling", "gather_tinder", "prepare_tinder", "make_drill", "make_bow", "gather_chert", "make_flake",
    "bank_fire", "eat", "cook", "sleep", "rest", "wrap", "look", "explore"];
  function suggestions(g, sc) {
    if (g.over) return [];
    var avail = G.available(g, sc), list = [];
    avail.sort(function (a, b) {
      var ia = PRIORITY.indexOf(a.id), ib = PRIORITY.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    avail.forEach(function (a) { list.push({ id: a.id, arg: null, label: a.name.toUpperCase(), minutes: estimate(g, sc, a.id) }); });
    g.known.forEach(function (z) {
      if (z === g.zone) return;
      list.push({ id: "go", arg: z, label: "GO TO THE " + sc.zones[z].name, minutes: estimate(g, sc, "go", z) });
    });
    return list;
  }

  function inventory(g) {
    var out = [];
    Object.keys(g.inv).forEach(function (k) {
      if (!g.inv[k] || !G.ITEMS[k]) return;
      var n = g.inv[k];
      out.push((n > 1 ? n + " x " : "") + G.ITEMS[k].name + (k === "blanket" && g.wrapped ? " (wrapped around you)" : ""));
    });
    if (g.bundles.length) out.push(g.bundles.length + " x prepared tinder bundle");
    if (g.bowl) out.push("bowl: " + (g.bowl.litres ? g.bowl.litres.toFixed(1) + " L of " + (g.bowl.safe ? "boiled" : "creek") + " water" : "empty"));
    return out;
  }

  function map(g, sc) {
    var world = G.worldOf(g, sc);
    return g.known.map(function (z) {
      var t = z === g.zone ? 0 : W.travel(world, g.zone, z, g.min).minutes;
      var bits = [];
      if (g.shelters[z]) bits.push(g.shelters[z].name);
      if (G.fireAt(g, z) !== "none") bits.push("FIRE");
      var p = g.piles[z]; if (p && p.fuel) bits.push(p.fuel + " WOOD");
      return { zone: z, name: sc.zones[z].name, here: z === g.zone, minutes: t, notes: bits.join(", ") };
    });
  }

  // ---- ending ----
  function score(g, sc) {
    var L = G.levelOf(g, sc), h = Math.min(g.min, L.rescueH * 60) / 60, d = B.describe(g.body);
    if (!g.over || g.over.result !== "RESCUED") return Math.round(h * 5 * L.scoreMult);
    var s = h * 10 + 300;
    s += d.temp === "OK" ? 200 : d.temp === "COLD" ? 120 : d.temp === "SHIVERING" ? 60 : 0;
    s += d.water === "OK" ? 100 : d.water === "THIRSTY" ? 60 : 0;
    s += d.food === "OK" || d.food === "HUNGRY" ? 60 : d.food === "WEAK FROM HUNGER" ? 30 : 0;
    if (g.over.how === "SPOTTED") s += 150;
    if (g.signals.marker) s += 50;
    s -= 50 * g.body.injuries.filter(function (i) { return !i.healed; }).length;
    s -= g.stats.hypoMin / 60 * 5;
    return Math.max(0, Math.round(s * L.scoreMult));
  }

  function epilogue(g, sc) {
    if (!g.over) return null;
    var L = G.levelOf(g, sc), st = g.stats, d = B.describe(g.body), lines = [], right = [], wrong = [];
    var hours = Math.round(g.over.atMin / 60);
    var when = K.label(sc, g.over.atMin) + " (" + K.dateLabel(sc, g.over.atMin) + ")";
    if (g.over.result === "RESCUED") {
      lines.push("Found " + when + ", " + hours + " hours after you woke in the clearing, " + (g.over.how === "SPOTTED" ? "after a search plane saw your signal." : "by a ground search team."));
      lines.push("Condition when found: body " + W.tempF(g.body.coreC, 1) + " (" + d.temp + "), water " + d.water + ", food " + d.food + ", " + d.wet + ", " + d.sleep + ".");
    } else {
      lines.push("You died of " + (g.over.cause || "").toLowerCase() + " on " + when + ", " + hours + " hours in.");
      if (g.over.cause === "HYPOTHERMIA" && st.severeAt) {
        var s = st.severeAt;
        lines.push("It was decided around " + K.label(sc, s.min) + ", when your body temperature fell below " + W.tempF(32, 1) + " " +
          (s.shelter ? "in your shelter" : "in the open") + " at the " + sc.zones[s.zone].name.toLowerCase() + (s.wet > 50 ? ", soaked through" : "") + (s.fire === "none" ? ", with no fire" : "") + ". After that, shivering stops and the body cannot warm itself.");
      }
      if (g.over.cause === "DEHYDRATION" && st.thirstyAt) lines.push("It was decided around " + K.label(sc, st.thirstyAt) + ", when you were 5 litres short and your thinking began to fail.");
      if (g.over.cause === "INFECTION") lines.push("The cut was never cleaned. Washing it out the day it happened, or hot soaks once it turned, would very likely have saved you.");
    }
    if (g.flags.shelterAt != null) right.push("You had a shelter up by " + K.label(sc, g.flags.shelterAt) + ".");
    else wrong.push("You never built a shelter.");
    if (g.flags.firstFire != null) right.push("You got a fire going by " + K.label(sc, g.flags.firstFire) + ".");
    else wrong.push("You never got a fire going.");
    if (st.drinks) right.push("You drank " + st.drinks + (st.drinks === 1 ? " time." : " times."));
    if (st.maxWaterShort >= 3) wrong.push("At worst you were " + st.maxWaterShort.toFixed(1) + " litres short of water.");
    if (st.hypoMin >= 60) wrong.push("You spent " + Math.round(st.hypoMin / 60) + " hours hypothermic; your coldest was " + W.tempF(st.coldestC, 1) + ".");
    if (g.signals.marker) right.push("You marked the open ground for searchers.");
    if (g.signals.smoke.length) right.push("You put up signal smoke " + g.signals.smoke.length + (g.signals.smoke.length === 1 ? " time." : " times."));
    g.body.injuries.forEach(function (i) { wrong.push("Injury: " + i.kind.toLowerCase() + (i.healed ? " (healed)." : ".")); });
    // What came after (true to life: some things show up only later).
    var after = [];
    if (g.over.result === "RESCUED") {
      g.pending.forEach(function (p) {
        var days = Math.max(1, Math.round((p.onsetMin - g.over.atMin) / 1440));
        if (p.kind === "GIARDIA") after.push(days + " days after you were found, you came down with giardiasis from untreated water: weeks of cramps until a doctor treated it.");
        else after.push("The next day, a stomach bug from the " + (p.why || "water") + " caught up with you in hospital.");
      });
      if (g.body.illnesses.some(function (i) { return i.kind === "GIARDIA"; })) after.push("The doctors treated the giardiasis you picked up from the creek.");
      if (st.rawCrayfish) after.push("You ate crayfish raw. In parts of North America they carry a lung fluke (Paragonimus) whose symptoms take weeks to appear; cooking kills it.");
    }
    return {
      title: g.over.result === "RESCUED" ? "RESCUED" : "DEAD",
      level: L.name, lines: lines, right: right, wrong: wrong, after: after,
      score: score(g, sc), hours: hours
    };
  }

  // Rebuild a game from seed + level + action log (bug reports, tests).
  function replay(sc, seed, level, actions) {
    var g = G.newGame(sc, seed, level);
    actions.forEach(function (a) {
      if (a[0] === "~away") runAway(g, sc, a[1], a[2]);
      else if (a[0] === "~order") setOrder(g, a[1]);
      else G.perform(g, sc, a[0], a[1]);
    });
    return g;
  }

  function setOrder(g, order) { if (ORDERS[order] && g.order !== order) { g.order = order; g.actions.push(["~order", order]); } }

  var api = { ORDERS: ORDERS, replay: replay, setOrder: setOrder, runAway: runAway, applyAway: applyAway, searchLine: searchLine, situation: situation, estimate: estimate,
              suggestions: suggestions, inventory: inventory, map: map, epilogue: epilogue, score: score };
  if (node) module.exports = api;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.session = api; }
})(this);
