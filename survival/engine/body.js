/* SURVIVAL engine: the body (design: C:\TGD\docs\survival\design.md, section 3).
   Pure functions, no page code: runs in the browser (window.SURVIVAL.body) and
   in node (require). Real units inside (litres, kcal, degrees C, watts); words
   for the screen come from describe().

   One step = some game minutes of one activity in one set of conditions:
     step(body, env, gear, activity, minutes) -> new body (the old one is not changed)
   Long stretches are cut into 5-minute steps so the heat balance stays smooth. */
(function (root) {
  "use strict";

  // ---- constants (tune here; tests pin the behaviour) ----
  var C = {
    MASS_KG: 75,
    // Effective heat capacity: skin and limbs cool before the core, so the
    // core falls more slowly than whole-body mass alone would say.
    HEAT_CAP_J_PER_C: 75 * 3500 * 2.0,
    AREA_M2: 1.8,
    // Metabolic heat (W) by activity.
    MET_W: { sleep: 80, rest: 105, walk: 330, work: 420 },
    SHIVER_MAX_W: 380,               // full shivering (about 4x resting)
    // Water lost (L/h) by activity, before sweat and illness.
    WATER_L_H: { sleep: 0.07, rest: 0.10, walk: 0.22, work: 0.25 },
    SWEAT_J_PER_L: 2.4e6,
    VASO_W: 180,                     // extra heat shed by warmer skin before sweating
    // Food burned (kcal/h) by activity, before shivering.
    KCAL_H: { sleep: 65, rest: 85, walk: 300, work: 360 },
    J_PER_KCAL: 4184,
    // Thresholds.
    WATER_THIRSTY: 1.5, WATER_WEAK: 3, WATER_CONFUSED: 5, WATER_DEAD: 7,
    KCAL_LOW: 2500, KCAL_VERY_LOW: 5000, KCAL_STARVING: 10000, KCAL_WASTING: 20000,
    CORE_COLD: 36.0, CORE_MILD: 35.0, CORE_SEVERE: 32.0, CORE_DEAD: 28.0,
    SLEEP_TIRED: 4, SLEEP_EXHAUSTED: 8, SLEEP_SPENT: 14,
    STEP_MIN: 5
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function newBody(opts) {
    opts = opts || {};
    return {
      coreC: opts.coreC != null ? opts.coreC : 37.0,
      waterShortL: opts.waterShortL != null ? opts.waterShortL : 0,
      kcalDeficit: opts.kcalDeficit != null ? opts.kcalDeficit : 0,
      sleepOwedH: opts.sleepOwedH != null ? opts.sleepOwedH : 0,
      wetPct: opts.wetPct != null ? opts.wetPct : 0,
      shiverW: 0,
      injuries: (opts.injuries || []).slice(),
      illnesses: (opts.illnesses || []).slice(),
      alive: true,
      cause: null,          // DEHYDRATION | HYPOTHERMIA | INFECTION
      diedAtMin: null
    };
  }

  // Clothing insulation (clo) once wetness is taken into account.
  // gear.layers: [{ clo, wetKeep }] where wetKeep = share of insulation kept
  // when soaked (cotton ~0.2, wool ~0.6). The blanket is a layer when wrapped.
  function clothingClo(gear, wetPct) {
    var w = clamp(wetPct, 0, 100) / 100;
    var clo = 0;
    (gear.layers || []).forEach(function (l) {
      clo += l.clo * (1 - w * (1 - l.wetKeep));
    });
    return clo;
  }

  // Heat flow (W, positive = into the body) for one moment.
  // env: { airC, windKmh, rain (0-1), shelter: { clo, wind (0-1 blocked), rain (0-1 blocked) },
  //        fireW (heat reaching the body from a fire), groundC, bed (0-1, insulation under you) }
  function heatFlow(body, env, gear, activity) {
    var sh = env.shelter || { clo: 0, wind: 0, rain: 0 };
    var wind = (env.windKmh || 0) * (1 - (sh.wind || 0));
    var clo = clothingClo(gear, body.wetPct) + (sh.clo || 0);
    // Wind pushes through clothing: up to -45% insulation in a strong wind.
    clo *= 1 - Math.min(0.45, wind / 90);
    // Still air layer shrinks with wind.
    var rAir = 0.14 / (1 + wind / 10);
    var r = 0.155 * clo + rAir;
    // The body shuts down skin blood flow as it cools (lower skin temperature).
    // It also does this before the core drops, in cold air.
    var skin = clamp(33 - (37 - body.coreC) * 4 - clamp((15 - env.airC) * 0.15, 0, 4), 20, 33);
    var loss = C.AREA_M2 * (skin - env.airC) / r;
    // Wet skin and clothing lose extra heat by evaporation.
    loss += (body.wetPct / 100) * Math.max(0, skin - env.airC) * 1.6;
    // Lying down: conduction into the ground, cut by a bed of leaves/boughs.
    if (activity === "sleep" || activity === "rest") {
      var groundC = env.groundC != null ? env.groundC : env.airC;
      loss += 0.35 * C.AREA_M2 * Math.max(0, skin - groundC) * 3.5 * (1 - clamp(env.bed || 0, 0, 0.9));
    }
    // Breathing loses ~10% of the heat made.
    var met = C.MET_W[activity] || C.MET_W.rest;
    var gain = met * 0.9 + (env.fireW || 0) + body.shiverW;
    return { gain: gain, loss: loss, net: gain - loss, met: met };
  }

  function shiverFor(body, activity) {
    if (body.coreC >= 36.8 || body.coreC <= C.CORE_SEVERE) return 0;
    var s = C.SHIVER_MAX_W * clamp((36.8 - body.coreC) / 1.0, 0, 1);
    if (body.kcalDeficit > C.KCAL_STARVING) s *= 0.3;
    else if (body.kcalDeficit > C.KCAL_VERY_LOW) s *= 0.4;
    else if (body.kcalDeficit > C.KCAL_LOW) s *= 0.7;
    if (body.waterShortL > C.WATER_WEAK) s *= 0.8;
    if (activity === "sleep") s *= 0.6;   // a sleeper shivers less, and wakes cold
    return s;
  }

  function stepOnce(b, env, gear, activity, minutes, atMin) {
    var dtS = minutes * 60, hrs = minutes / 60;
    b.shiverW = shiverFor(b, activity);
    var f = heatFlow(b, env, gear, activity);
    var sweatL = 0;
    if (f.net > 0 && b.coreC >= 37.0) {
      // Warm and regulating: up to VASO_W of extra heat leaves through warmer
      // skin; only the rest goes out as sweat.
      sweatL = Math.max(0, f.net - C.VASO_W) * dtS / C.SWEAT_J_PER_L;
      b.coreC = 37.0;
    } else {
      b.coreC += f.net * dtS / C.HEAT_CAP_J_PER_C;
      if (b.coreC > 37.0 && f.net > 0) b.coreC = 37.0;
    }

    // Water.
    var water = (C.WATER_L_H[activity] || C.WATER_L_H.rest) * hrs + sweatL;
    b.illnesses.forEach(function (ill) { if (ill.active) water += (ill.waterLH || 0) * hrs; });
    b.waterShortL += water;

    // Food.
    b.kcalDeficit += ((C.KCAL_H[activity] || C.KCAL_H.rest) + b.shiverW * 3600 / C.J_PER_KCAL) * hrs;
    b.illnesses.forEach(function (ill) { if (ill.active) b.kcalDeficit += (ill.kcalLH || 0) * hrs; });

    // Sleep: owed rises 0.5 h per hour awake; good sleep pays 1 h per hour,
    // cold sleep half, very cold a quarter.
    if (activity === "sleep") {
      var q = b.coreC < C.CORE_MILD ? 0.25 : (b.coreC < C.CORE_COLD || b.shiverW > 60) ? 0.5 : 1;
      b.sleepOwedH = Math.max(0, b.sleepOwedH - q * hrs);
    } else {
      b.sleepOwedH += 0.5 * hrs;
    }

    // Wetness: rain the shelter lets through, then drying.
    var sh = env.shelter || {};
    var rainIn = (env.rain || 0) * (1 - (sh.rain || 0));
    b.wetPct += rainIn * 45 * hrs;
    if (rainIn < 0.05) {
      var dry = 3 + (env.windKmh || 0) * (1 - (sh.wind || 0)) * 0.25 + (env.fireW || 0) / 10;
      if (env.airC < 0) dry *= 0.5;
      b.wetPct -= dry * hrs;
    }
    b.wetPct = clamp(b.wetPct, 0, 100);

    // Death.
    if (b.waterShortL >= C.WATER_DEAD) { b.alive = false; b.cause = "DEHYDRATION"; }
    else if (b.coreC <= C.CORE_DEAD) { b.alive = false; b.cause = "HYPOTHERMIA"; }
    if (!b.alive) b.diedAtMin = atMin + minutes;
    return f;
  }

  function copy(body) {
    var b = JSON.parse(JSON.stringify(body));
    return b;
  }

  // Advance the body. env may be a function of the game minute (weather moving).
  function step(body, env, gear, activity, minutes, startMin) {
    var b = copy(body);
    var t = startMin || 0, left = minutes;
    while (left > 0 && b.alive) {
      var m = Math.min(C.STEP_MIN, left);
      var e = typeof env === "function" ? env(t) : env;
      stepOnce(b, e, gear, activity, m, t);
      t += m; left -= m;
    }
    return b;
  }

  function drink(body, litres) {
    var b = copy(body);
    b.waterShortL = Math.max(0, b.waterShortL - litres);
    return b;
  }

  function eat(body, kcal) {
    var b = copy(body);
    b.kcalDeficit = Math.max(-500, b.kcalDeficit - kcal);
    return b;
  }

  // How much the body's state slows work and spoils fine actions.
  function effects(body) {
    var slow = 1, fumble = 0;
    if (body.waterShortL >= C.WATER_WEAK) slow *= 1.25;
    if (body.waterShortL >= C.WATER_CONFUSED) { fumble += 0.25; }
    if (body.kcalDeficit >= C.KCAL_LOW) slow *= 1.15;
    if (body.kcalDeficit >= C.KCAL_STARVING) { slow *= 1.2; fumble += 0.05; }
    if (body.kcalDeficit >= C.KCAL_WASTING) slow *= 1.15;
    if (body.coreC < C.CORE_MILD) { slow *= 1.3; fumble += 0.3; }
    else if (body.coreC < C.CORE_COLD) { fumble += 0.1; }
    if (body.sleepOwedH >= C.SLEEP_SPENT) { slow *= 1.3; fumble += 0.25; }
    else if (body.sleepOwedH >= C.SLEEP_EXHAUSTED) { slow *= 1.15; fumble += 0.1; }
    return {
      timeMult: slow,
      fumble: clamp(fumble, 0, 0.8),
      canFineWork: body.coreC > C.CORE_SEVERE && body.waterShortL < C.WATER_CONFUSED + 1,
      confused: body.coreC < C.CORE_SEVERE + 1 || body.waterShortL >= C.WATER_CONFUSED
    };
  }

  // Words for the status block.
  function describe(body) {
    var w = body.waterShortL, k = body.kcalDeficit, c = body.coreC, s = body.sleepOwedH, wet = body.wetPct;
    return {
      water: w >= C.WATER_CONFUSED ? "SEVERELY DEHYDRATED" : w >= C.WATER_WEAK ? "DEHYDRATED" : w >= C.WATER_THIRSTY ? "THIRSTY" : "OK",
      food: k >= C.KCAL_WASTING ? "WASTING" : k >= C.KCAL_STARVING ? "STARVING" : k >= C.KCAL_VERY_LOW ? "VERY WEAK FROM HUNGER" : k >= C.KCAL_LOW ? "WEAK FROM HUNGER" : k >= 1200 ? "HUNGRY" : "OK",
      temp: c < C.CORE_SEVERE ? "SEVERE HYPOTHERMIA" : c < C.CORE_MILD ? "HYPOTHERMIC" : c < C.CORE_COLD ? "SHIVERING" : c < 36.6 ? "COLD" : "OK",
      wet: wet >= 70 ? "SOAKED" : wet >= 35 ? "WET" : wet >= 10 ? "DAMP" : "DRY",
      sleep: s >= C.SLEEP_SPENT ? "SPENT" : s >= C.SLEEP_EXHAUSTED ? "EXHAUSTED" : s >= C.SLEEP_TIRED ? "TIRED" : "RESTED"
    };
  }

  var api = { C: C, newBody: newBody, step: step, drink: drink, eat: eat, effects: effects, describe: describe, heatFlow: heatFlow, clothingClo: clothingClo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.body = api; }
})(this);
