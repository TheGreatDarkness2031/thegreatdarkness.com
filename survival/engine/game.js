/* SURVIVAL engine: the game state and how time passes (design: C:\TGD\docs\survival\design.md,
   sections 4 and 5). A game is a plain object (saved as JSON in step 4); perform()
   runs one action from actions.js: checks it, lets its time pass for the body, the
   fire and the world, then applies the outcome. Every chance is a seeded roll keyed
   by the action number, so seed + action list replays the same game.
   window.SURVIVAL.game in the browser, require() in node. */
(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var S = node ? null : root.SURVIVAL;
  var Body = node ? require("./body.js") : S.body;
  var World = node ? require("./world.js") : S.world;
  var Clock = node ? require("./clock.js") : S.clock;

  // ---- items ----
  // weight: carrying units (the limit is CARRY_MAX); bulky: gathered onto the
  // place's pile, not into your arms (take it to carry it somewhere else).
  var ITEMS = {
    blanket:        { name: "wool blanket", weight: 2 },
    drawstring:     { name: "hoodie drawstring", weight: 0 },
    shoelaces:      { name: "shoelaces", weight: 0 },
    fuel:           { name: "armload of firewood", weight: 4, bulky: true },
    leaves:         { name: "armful of leaves", weight: 2, bulky: true },
    boughs:         { name: "armful of green pine boughs", weight: 2, bulky: true },
    kindling:       { name: "bundle of kindling", weight: 1 },
    "dry grass":    { name: "handful of dry grass", weight: 0.2, tinder: 1.0 },
    "dry needles":  { name: "handful of dry pine needles", weight: 0.2, tinder: 0.8 },
    "cattail fluff":{ name: "handful of cattail fluff", weight: 0.1, tinder: 1.2 },
    "inner bark":   { name: "wad of shredded inner bark", weight: 0.2, tinder: 0.9 },
    pitch:          { name: "lump of pine pitch", weight: 0.1 },
    stones:         { name: "flat stone", weight: 1 },
    chert:          { name: "piece of chert", weight: 0.3 },
    flake:          { name: "sharp stone flake", weight: 0.1 },
    cord:           { name: "length of bark cord", weight: 0.05 },
    drill:          { name: "hand drill (spindle and hearth board)", weight: 0.5 },
    bow:            { name: "bow for the drill", weight: 0.3 },
    bowl:           { name: "burned wooden bowl", weight: 1 },
    acorns:         { name: "handful of acorns", weight: 0.2, kcal: 150 },
    "leached acorns": { name: "handful of leached acorns", weight: 0.2, kcal: 300 },
    crayfish:       { name: "crayfish", weight: 0.05, kcal: 20 },
    "cooked crayfish": { name: "cooked crayfish", weight: 0.05, kcal: 20 },
    cattail:        { name: "bundle of cattail roots", weight: 0.5, kcal: 200 }
  };
  var CARRY_MAX = 12;
  var TINDER = ["cattail fluff", "dry grass", "inner bark", "dry needles"];

  // ---- fire ----
  var FIRE = {
    ARMLOAD_MIN: 45,      // one armload keeps a small fire going this long
    KINDLING_MIN: 15,
    EMBER_MIN: 60,        // after the last wood, coals can be fed back to life
    HEAT_W: 200,          // reaching you beside an open fire
    REFLECT_MULT: 1.3,    // a lean-to behind you throws heat back (260 W)
    HUT_MULT: 0.3,        // in a debris hut little of an outside fire reaches you
    BANKED_MULT: 0.5,     // banked: burns half as fast, gives half the heat
    EMBER_W: 40
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  function newGame(scenario, seed, level) {
    var st = scenario.start;
    level = level && scenario.levels[level] ? level : "standard";
    var g = {
      v: 1, scenario: scenario.id, level: level, seed: seed != null ? seed : World.newSeed(),
      order: "REST", actions: [],
      stats: { coldestC: 37, hypoMin: 0, severeAt: null, maxWaterShort: 0, thirstyAt: null, drinks: 0, kcalEaten: 0,
               wettest: 0, nightsWarm: 0, nightsCold: 0, rawCrayfish: false, untreatedDrinks: 0 },
      min: 0, n: 0, trips: 0, zone: st.zone,
      known: st.known.slice(), visited: [st.zone],
      body: Body.newBody(st.body),
      inv: copy(st.inv), bundles: [],             // bundles: prepared tinder, by quality
      damp: { tinder: 0, kindling: 0, fuel: 0 },  // 0 dry .. 1 soaked
      wrapped: false, inShelter: false,
      piles: {}, taken: {}, fires: {}, shelters: {}, beds: {},
      practice: { hand: 0, bow: 0 }, blisters: 0,
      bowl: null,                                 // { litres, safe }
      pending: [],                                // illnesses not started yet
      signals: { marker: false, pile: null, smoke: [] },
      flags: {}, over: null, journal: []
    };
    log(g, "You wake in leaf litter at the edge of a clearing. Your head aches and you are thirsty. You don't know where you are.");
    return g;
  }

  function levelOf(g, scenario) { return scenario.levels[g.level] || scenario.levels.standard; }

  // ---- rescue ----
  // Checked on every whole game hour. Spotted by a search plane: a team reaches
  // you about 2 h later (never before the search is 3 h old). Ground search:
  // from halfway between the search start and the rescue hour, a chance each hour
  // that grows with how findable you are. At the rescue hour they reach you.
  function findability(g, scenario) {
    var z = scenario.zones[g.zone], f = 0.04, why = [];
    if (z.open) { f += 0.06; why.push("in the open"); }
    if (g.zone === scenario.start.zone) { f += 0.08; why.push("near where you went missing"); }
    if (g.signals.marker) { f += 0.06; why.push("a ground marker"); }
    if (fireAt(g, g.zone) === "burning") { f += 0.04; why.push("a fire going"); }
    return { chance: f, why: why };
  }

  function checkRescue(g, scenario, hour) {
    var L = levelOf(g, scenario), t = hour * 60;
    if (g.over || hour < L.searchH) return;
    var rescueAt = null, how = null;
    if (g.flags.spottedAt != null) {
      var due = Math.max(g.flags.spottedAt + 120, (L.searchH + 3) * 60);
      if (t >= due) { rescueAt = t; how = "SPOTTED"; }
    }
    var mid = L.searchH + (L.rescueH - L.searchH) / 2;
    if (rescueAt === null && hour >= mid && World.roll(g.seed, "found", hour) < findability(g, scenario).chance) { rescueAt = t; how = "GROUND SEARCH"; }
    if (rescueAt === null && hour >= L.rescueH) { rescueAt = t; how = "GROUND SEARCH"; }
    if (rescueAt === null) return;
    g.min = rescueAt;
    g.over = { result: "RESCUED", how: how, atMin: rescueAt };
    log(g, how === "SPOTTED"
      ? "The thud of rotor blades, then orange jackets coming through the trees, calling your name. They saw your smoke."
      : "A voice, then another, calling your name. Two people in orange vests push through the brush and stop when they see you. \"We've got you.\"", rescueAt);
  }

  function spot(g, scenario, atMin, text) {
    if (g.flags.spottedAt != null) return;
    g.flags.spottedAt = atMin;
    log(g, text || "The plane banks hard, comes back low and rocks its wings over you. They've seen you.", atMin);
  }

  // A search plane passing: smoke in the air, a ground marker, a fire in the open.
  function planePass(g, scenario, atMin) {
    g.flags.planes = (g.flags.planes || []).concat([atMin]);
    var smoke = g.signals.smoke.some(function (s) { return s <= atMin && atMin - s <= 40; });
    var z = scenario.zones[g.zone];
    var r = World.roll(g.seed, "pass", atMin);
    if (smoke) return spot(g, scenario, atMin);
    if (g.signals.marker && r < 0.3) return spot(g, scenario, atMin, "The plane circles twice over the clearing, low, and rocks its wings. They've seen your marker.");
    if (z.open && fireAt(g, g.zone) === "burning" && r < 0.15) return spot(g, scenario, atMin);
  }

  function worldOf(g, scenario) { return World.newWorld(scenario, g.seed); }
  function log(g, text, atMin) { g.journal.push({ min: atMin != null ? atMin : g.min, text: text }); }
  function has(g, item, n) { return (g.inv[item] || 0) >= (n || 1); }
  function add(g, item, n) { g.inv[item] = (g.inv[item] || 0) + (n == null ? 1 : n); if (g.inv[item] <= 0) delete g.inv[item]; }
  function pile(g, zone) { return g.piles[zone] || (g.piles[zone] = { fuel: 0, leaves: 0, boughs: 0 }); }
  // Bulky things near you: on this place's pile plus in your arms.
  function near(g, item) { return (pile(g, g.zone)[item] || 0) + (g.inv[item] || 0); }
  function useNear(g, item, n) {
    var p = pile(g, g.zone), fromPile = Math.min(p[item] || 0, n);
    p[item] -= fromPile; add(g, item, -(n - fromPile));
  }
  function carried(g) {
    var w = 0;
    Object.keys(g.inv).forEach(function (k) { if (ITEMS[k]) w += ITEMS[k].weight * g.inv[k]; });
    if (g.wrapped && g.inv.blanket) w -= ITEMS.blanket.weight;   // worn, not carried
    return w + g.bundles.length * 0.2;
  }
  function room(g) { return CARRY_MAX - carried(g); }

  function gear(g, scenario) {
    var layers = [scenario.clothing];
    if (g.wrapped && g.inv.blanket) layers.push(scenario.blanket);
    return { layers: layers };
  }

  function fireAt(g, zone) {
    var f = g.fires[zone];
    if (!f) return "none";
    if (f.fuelMin > 0) return "burning";
    if (f.emberMin > 0) return "embers";
    return "none";
  }
  function fireBurning(g) { return fireAt(g, g.zone) === "burning"; }

  function shelterHere(g, scenario) {
    var s = g.shelters[g.zone];
    if (s) return s;
    var z = scenario.zones[g.zone];
    if (z.overhang) return { type: "overhang", clo: z.overhang.clo, wind: z.overhang.wind, rain: z.overhang.rain, bed: 0 };
    return null;
  }

  // Heat from the fire here reaching you, in watts.
  function fireHeat(g, scenario, inShelter) {
    var f = g.fires[g.zone], state = fireAt(g, g.zone);
    if (state === "none") return 0;
    var w = state === "embers" ? FIRE.EMBER_W : FIRE.HEAT_W * (f.banked ? FIRE.BANKED_MULT : 1);
    var sh = shelterHere(g, scenario);
    if (inShelter && sh && sh.type === "debris") w *= FIRE.HUT_MULT;
    else if (sh && (sh.type === "leanto" || sh.type === "overhang")) w *= FIRE.REFLECT_MULT;
    return w;
  }

  // Slowdown and clumsiness from body + injuries (blisters, sprain, cut).
  function effects(g) {
    var e = Body.effects(g.body);
    var walk = e.timeMult;
    g.body.injuries.forEach(function (i) {
      if (i.healed) return;
      if (i.kind === "SPRAINED ANKLE") walk *= 1.6;
      if (i.kind === "BLISTERED FEET") walk *= 1.2;
      if (i.kind === "CUT HAND" || i.kind === "INFECTED CUT") e.fumble = clamp(e.fumble + (i.kind === "INFECTED CUT" ? 0.2 : 0.1), 0, 0.8);
    });
    if (carried(g) > 8) walk *= 1.2;
    e.walkMult = walk;
    return e;
  }

  // ---- time passing ----
  // Runs `minutes` of one activity in the current place, in pieces of up to 30
  // minutes so the fire, damp gear and illness keep up. opts: { inShelter, byFire }.
  // Returns the world events of that time.
  function advance(g, scenario, minutes, activity, opts) {
    opts = opts || {};
    var world = worldOf(g, scenario), start = g.min, end = g.min + minutes;
    var inShelter = !!opts.inShelter && !!shelterHere(g, scenario);
    g.inShelter = inShelter;
    while (g.min < end && g.body.alive) {
      var dt = Math.min(30, end - g.min), t = g.min;
      startIllnesses(g, t);
      var sh = inShelter ? shelterHere(g, scenario) : null;
      var bed = (activity === "sleep" || activity === "rest") ? Math.max(g.beds[g.zone] || 0, sh ? sh.bed || 0 : 0) : 0;
      var extra = { fireW: fireHeat(g, scenario, inShelter), bed: bed };
      if (sh) extra.shelter = { clo: sh.clo, wind: sh.wind, rain: sh.rain };
      g.body = Body.step(g.body, World.envAt(world, g.zone, extra), gear(g, scenario), activity, dt, t);
      var w = World.conditions(world, g.zone, t);
      burnFires(g, scenario, world, t, dt);
      dampGear(g, w, sh, dt, extra.fireW > 0);
      heal(g, t + dt);
      track(g, t, dt);
      g.min += dt;
      if (!g.body.alive) break;
      for (var h = Math.floor(t / 60) + 1; h <= Math.floor(g.min / 60); h++) { checkRescue(g, scenario, h); if (g.over) break; }
      if (g.over) break;
    }
    if (!g.body.alive && !g.over) {
      g.min = g.body.diedAtMin != null ? g.body.diedAtMin : g.min;
      g.over = { result: "DEAD", cause: g.body.cause, atMin: g.min };
    }
    var evs = World.events(world, start, g.min, { zone: g.zone, inShelter: inShelter, searchH: levelOf(g, scenario).searchH });
    var outEvs = [];
    evs.forEach(function (e) {
      if (g.over && e.atMin > g.over.atMin) return;
      if (e.data && e.data.adds) Object.keys(e.data.adds).forEach(function () { pile(g, g.zone).fuel += 1; });
      if (e.data && e.data.hint && g.known.indexOf(e.data.hint) < 0) { g.known.push(e.data.hint); }
      log(g, e.text, e.atMin);
      if (e.data && e.data.signal) planePass(g, scenario, e.atMin);
      outEvs.push(e);
    });
    g.journal.sort(function (a, b) { return a.min - b.min; });
    return outEvs;
  }

  // Injuries heal; an uncleaned cut can turn bad (infection, then blood poisoning).
  function heal(g, t) {
    g.body.injuries.forEach(function (i) {
      if (i.healed) return;
      if (i.kind === "CUT HAND" && !i.cleaned && i.infectAt == null && t - i.atMin >= 6 * 60) {
        i.infectAt = World.roll(g.seed, "infect", i.atMin) < 0.35 ? i.atMin + 48 * 60 : -1;
      }
      if (i.kind === "CUT HAND" && i.infectAt > 0 && !i.cleaned && t >= i.infectAt) {
        i.kind = "INFECTED CUT"; i.infectedAt = t; i.healMin = null;
        g.body.illnesses.push({ kind: "FEVER", active: true, waterLH: 0.04, kcalLH: 40, endMin: Infinity, from: "cut" });
        log(g, "Your hand is hot, swollen and throbbing, red streaking up from the cut. You feel feverish.", t);
      }
      if (i.kind === "INFECTED CUT" && t - i.infectedAt >= 5 * 24 * 60 && !i.spread) {
        i.spread = true; i.deathAt = t + 48 * 60;
        log(g, "Red lines have spread up past your wrist. Shaking chills come and go. This is getting serious.", t);
      }
      if (i.kind === "INFECTED CUT" && i.deathAt && t >= i.deathAt && g.body.alive) {
        g.body.alive = false; g.body.cause = "INFECTION"; g.body.diedAtMin = t;
      }
      if (i.healMin != null && t >= i.healMin) { i.healed = true; log(g, i.kind === "SPRAINED ANKLE" ? "Your ankle takes your weight again." : i.kind === "BLISTERED FEET" ? "The blisters on your feet have dried and toughened." : "The cut on your hand has closed.", i.healMin); }
    });
  }

  function track(g, t, dt) {
    var st = g.stats, b = g.body, sc = null;
    if (b.coreC < st.coldestC) st.coldestC = b.coreC;
    if (b.coreC < 35) st.hypoMin += dt;
    if (b.coreC < 32 && st.severeAt == null) st.severeAt = { min: t + dt, zone: g.zone, wet: b.wetPct, shelter: !!g.inShelter, fire: fireAt(g, g.zone) };
    if (b.waterShortL > st.maxWaterShort) st.maxWaterShort = b.waterShortL;
    if (b.waterShortL >= 5 && st.thirstyAt == null) st.thirstyAt = t + dt;
    if (b.wetPct > st.wettest) st.wettest = b.wetPct;
  }

  function burnFires(g, scenario, world, t, dt) {
    Object.keys(g.fires).forEach(function (zone) {
      var f = g.fires[zone];
      if (f.fuelMin > 0) {
        var w = World.conditions(world, zone, t), sh = g.shelters[zone] || (scenario.zones[zone].overhang ? { type: "overhang" } : null);
        var covered = sh && (sh.type === "leanto" || sh.type === "overhang");
        var rate = f.banked ? FIRE.BANKED_MULT : 1;
        if (w.rain > 0.3 && !covered) {
          rate *= 1.5;
          if (World.roll(g.seed, "rainout", zone, Math.floor(t / 30)) < 0.25 * (dt / 30)) {
            f.fuelMin = 0; f.emberMin = 15;
            if (zone === g.zone) log(g, "The rain beats the fire down to hissing coals.", t + dt);
            return;
          }
        }
        f.fuelMin -= dt * rate;
        if (f.fuelMin <= 0) {
          f.fuelMin = 0; f.emberMin = FIRE.EMBER_MIN; f.banked = false;
          if (zone === g.zone) log(g, "The fire has burned down to coals.", t + dt);
        }
      } else if (f.emberMin > 0) {
        f.emberMin -= dt;
        if (f.emberMin <= 0) { delete g.fires[zone]; if (zone === g.zone) log(g, "The coals have gone cold.", t + dt); }
      }
    });
  }

  function dampGear(g, w, sh, dt, byFire) {
    var h = dt / 60, rainIn = w.rain * (1 - (sh ? sh.rain : 0));
    ["tinder", "kindling", "fuel"].forEach(function (k) {
      var d = g.damp[k];
      if (rainIn > 0.05) d += rainIn * 0.6 * h;
      else if (byFire) d -= 0.4 * h;
      else d -= 0.03 * h;
      g.damp[k] = clamp(d, 0, 1);
    });
  }

  function startIllnesses(g, t) {
    g.pending = g.pending.filter(function (p) {
      if (p.onsetMin > t) return true;
      g.body.illnesses.push({ kind: p.kind, active: true, waterLH: p.waterLH, kcalLH: p.kcalLH || 0, endMin: p.onsetMin + p.hours * 60 });
      log(g, p.text, p.onsetMin);
      return false;
    });
    g.body.illnesses.forEach(function (i) {
      if (i.active && i.endMin <= t) { i.active = false; if (i.kind !== "FEVER") log(g, "Your stomach has settled.", i.endMin); }
    });
  }

  // How wet a material is when gathered here and now (0 dry .. 1).
  function gatherDamp(w, kind, zone) {
    var d = w.rain > 0.05 ? 0.8 : (w.creekLevel > 0.4 ? 0.4 : 0) + (w.frost || (w.dawn && w.airC < 3) ? 0.3 : 0);
    if (zone.canopy) d *= 0.5;                  // under the pines the needles stay drier
    if (kind === "fuel" && zone.res && zone.res.softwood) d *= 0.6;   // standing dead wood
    return clamp(d, 0, 1);
  }
  function mixDamp(g, key, count, newDamp, newCount) {
    g.damp[key] = count + newCount > 0 ? (g.damp[key] * count + newDamp * newCount) / (count + newCount) : 0;
  }

  // ---- doing one action ----
  function perform(g, scenario, id, arg) {
    var A = node ? require("./actions.js") : S.actions;
    if (g.over) return { ok: false, text: "The game is over." };
    var def = A.byId[id];
    if (!def) return { ok: false, text: "There is no action " + id + "." };
    var world = worldOf(g, scenario);
    var c = ctx(g, scenario, world);
    var why = def.need ? def.need(g, c, arg) : null;
    if (!why && def.fine && c.w.dark && fireAt(g, g.zone) === "none") why = "It is too dark to do that without a fire.";
    if (!why && def.fine && !c.e.canFineWork) why = "Your hands are too clumsy and your head too foggy for fine work.";
    if (why) return { ok: false, text: why, minutes: 0 };
    var before = g.min, logFrom = g.journal.length;
    var r = function (key) { return World.roll(g.seed, "act", g.n, id, key || ""); };
    var text;
    g.actions.push(arg != null ? [id, arg] : [id]);
    // A confused or exhausted mind slips now and then.
    var slip = (c.e.confused || g.body.sleepOwedH >= Body.C.SLEEP_SPENT) && !def.fixedTime && r("slip") < 0.15;
    if (slip) {
      advance(g, scenario, 15, "rest");
      text = g.over ? null : "You meant to " + def.name.toLowerCase() + ", but you lose the thread and find yourself sitting, staring at nothing.";
    } else if (def.travel) {
      text = def.travel(g, c, arg, r);
    } else {
      var mins = typeof def.minutes === "function" ? def.minutes(g, c, arg) : def.minutes;
      if (def.gather && c.w.dark && !fireBurning(g)) mins *= 1.5;
      if (!def.fixedTime) mins *= c.e.timeMult;
      mins = Math.max(1, Math.round(mins));
      advance(g, scenario, mins, def.act || "work", { inShelter: !!def.inShelter });
      if (g.over) text = null;
      else text = def.run(g, ctx(g, scenario, world), arg, r);
    }
    g.n++;
    if (text) log(g, text);
    if (g.over && g.over.result === "DEAD" && !g.over.logged) { g.over.logged = true; log(g, deathText(g.over.cause)); }
    return { ok: true, text: text, minutes: g.min - before, journal: g.journal.slice(logFrom), over: g.over };
  }

  function deathText(cause) {
    return cause === "HYPOTHERMIA" ? "The cold has taken you. You stopped shivering a while ago, and you stopped caring soon after."
      : cause === "DEHYDRATION" ? "Without water your body has given out."
      : cause === "INFECTION" ? "The infection from the cut has gone into your blood. Your body could not fight it alone."
      : "You did not survive.";
  }

  function ctx(g, scenario, world) {
    return {
      sc: scenario, world: world, zone: scenario.zones[g.zone],
      w: World.conditions(world, g.zone, g.min), e: effects(g),
      G: api
    };
  }

  // Actions that can be done now (for the suggested list).
  function available(g, scenario) {
    var A = node ? require("./actions.js") : S.actions;
    var world = worldOf(g, scenario), c = ctx(g, scenario, world);
    return A.list.filter(function (d) {
      if (d.hidden || d.travel) return false;
      if (d.need && d.need(g, c)) return false;
      if (d.fine && c.w.dark && fireAt(g, g.zone) === "none") return false;
      return true;
    }).map(function (d) { return { id: d.id, name: d.name }; });
  }

  // Status words + numbers for the screen; temperatures in F.
  function status(g, scenario) {
    var d = Body.describe(g.body), f = fireAt(g, g.zone), fire = g.fires[g.zone];
    return {
      water: d.water, food: d.food, temp: d.temp, wet: d.wet, sleep: d.sleep,
      bodyF: World.tempF(g.body.coreC, 1),
      fire: f === "none" ? "NONE" : f === "embers" ? "EMBERS" : (fire.banked ? "BANKED" : "BURNING") + " (" + Math.ceil(fire.fuelMin / 15) * 15 + " MIN OF WOOD IN IT, " + near(g, "fuel") + " ARMLOADS NEAR)",
      injuries: g.body.injuries.filter(function (i) { return !i.healed; }).map(function (i) { return i.kind; })
        .concat(g.body.illnesses.filter(function (i) { return i.active; }).map(function (i) { return i.kind; })),
      carrying: Math.round(carried(g) * 10) / 10 + " / " + CARRY_MAX
    };
  }

  var api = {
    ITEMS: ITEMS, CARRY_MAX: CARRY_MAX, TINDER: TINDER, FIRE: FIRE,
    newGame: newGame, perform: perform, advance: advance, levelOf: levelOf, findability: findability, spot: spot, deathText: deathText, available: available, status: status,
    effects: effects, fireAt: fireAt, fireBurning: fireBurning, shelterHere: shelterHere, fireHeat: fireHeat,
    has: has, add: add, pile: pile, near: near, useNear: useNear, carried: carried, room: room,
    gatherDamp: gatherDamp, mixDamp: mixDamp, log: log, worldOf: worldOf,
    label: function (g, sc) { return Clock.label(sc, g.min); }
  };
  if (node) module.exports = api;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.game = api; }
})(this);
