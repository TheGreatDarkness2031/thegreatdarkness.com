/* SURVIVAL scenario 1 "Treeline": the world data (design: C:\TGD\docs\survival\design.md,
   sections 1, 2 and 6). Data only; world.js reads it. Times are game hours/minutes
   since the start (12:00 on day 1). window.SURVIVAL.scenarios.treeline / require(). */
(function (root) {
  "use strict";

  var scenario = {
    id: "treeline",
    name: "TREELINE",
    // Clock (clock.js reads these).
    startHour: 12, startMinute: 0, year: 2026, month: 9, day: 24,
    sunrise: "07:30", sunset: "18:15",
    rescueHour: 72,
    searchStartsHour: 48,

    // Zones. micro = how the place changes the open-ground weather:
    //   wind / rain: share that reaches you; dayC: air difference by day;
    //   nightC: difference on a clear, still night (cold air drains into hollows,
    //   ridges stay milder, a canopy holds heat). open: sky visible from the ground.
    zones: {
      clearing:   { name: "CLEARING",   open: true,  micro: { wind: 1.0,  rain: 1.0,  dayC: 0.5,  nightC: -1.0 },
                    has: ["dry grass", "deadfall", "open sky"] },
      hardwoods:  { name: "HARDWOODS",  open: false, micro: { wind: 0.6,  rain: 0.85, dayC: 0,    nightC: 0 },
                    has: ["dead branches", "leaf litter", "acorns", "deer sign"] },
      creek:      { name: "CREEK",      open: false, micro: { wind: 0.7,  rain: 0.9,  dayC: -1.0, nightC: -1.5 },
                    has: ["water", "cobbles", "chert", "mud", "crayfish"] },
      ridge:      { name: "RIDGE",      open: true,  micro: { wind: 1.7,  rain: 1.0,  dayC: -1.0, nightC: 1.0 },
                    has: ["view", "rock overhang", "wind"] },
      pine:       { name: "PINE STAND", open: false, micro: { wind: 0.35, rain: 0.55, dayC: -0.5, nightC: 0.5 },
                    has: ["dry needles", "pine pitch", "standing dead wood"] },
      bottomland: { name: "BOTTOMLAND", open: true,  micro: { wind: 0.8,  rain: 1.0,  dayC: 0,    nightC: -2.5 },
                    has: ["cattails", "wet ground"], floods: true }
    },

    // Paths and walking minutes in daylight. From the clearing the shortest
    // routes match the design table: hardwoods 5, pine 15, creek 25,
    // bottomland 35, ridge 40.
    links: [
      ["clearing", "hardwoods", 5],
      ["clearing", "pine", 15],
      ["clearing", "creek", 25],
      ["clearing", "bottomland", 35],
      ["clearing", "ridge", 40],
      ["hardwoods", "pine", 10],
      ["hardwoods", "creek", 20],
      ["pine", "ridge", 25],
      ["creek", "bottomland", 15],
      ["creek", "ridge", 30]
    ],

    // Controlled weather: open-ground values at these hours, straight lines between.
    // [hour, airC, windKmh, rain 0-1, cloud 0-1]
    // Night 1 clear with frost; the rain front at hour 30 (light, then 8 h steady,
    // wind 25); it clears before dawn on day 3 and that night turns colder; a
    // last frosty night before the rescue.
    weather: [
      [0,    11,  8,  0,    0.1],
      [3,    12, 10,  0,    0.1],
      [6,     8,  6,  0,    0.1],
      [9,     4,  4,  0,    0],
      [14,    1,  3,  0,    0],
      [18,   -1,  3,  0,    0],
      [20,    1,  4,  0,    0.1],
      [23,    7,  8,  0,    0.3],
      [26,   10, 12,  0,    0.6],
      [29,    9, 15,  0,    0.9],
      [30,    8, 18,  0.15, 1],
      [32,    7, 25,  0.6,  1],
      [36,    6, 25,  0.7,  1],
      [40,    4, 22,  0.5,  1],
      [40.5,  3.5, 20, 0,   0.7],
      [42,    0, 15,  0,    0.3],
      [43,   -3, 12,  0,    0.1],
      [45,    0, 12,  0,    0.1],
      [48,    5, 14,  0,    0.2],
      [51,    7, 12,  0,    0.2],
      [54,    3,  8,  0,    0.1],
      [60,   -1,  5,  0,    0],
      [66,   -2,  4,  0,    0],
      [69,    2,  6,  0,    0.1],
      [72,    6,  8,  0,    0.2],
      [120,   8,  8,  0,    0.2]
    ],

    // Creek: rain fills it, it drains slowly; the bottomland floods above floodAt.
    creek: { fill: 0.5, drainHours: 16, floodAt: 1.2 },

    // Events that come from the world. Each slot (minutes) is rolled once from
    // the seed, so the same seed always gives the same world. when() sees the
    // conditions at that moment and the player's context.
    events: [
      { id: "DOE", slot: 30, chance: 0.35, onePerDay: true,
        when: function (w, ctx) { return w.dusk && ["clearing", "hardwoods", "creek", "bottomland"].indexOf(ctx.zone) >= 0; },
        text: "A doe steps out at the edge of the trees, stops, and moves off downhill. Her tracks lead toward the creek.",
        data: { hint: "creek" } },
      { id: "BRANCH", slot: 60, chance: 0.15,
        when: function (w, ctx) { return w.windKmh >= 18 && (ctx.zone === "hardwoods" || ctx.zone === "pine"); },
        text: "A gust brings a dead limb down with a crack, close enough to hear it hit.",
        data: { adds: { "large branch": 1 } } },
      { id: "AIRCRAFT", slot: 120, chance: 0.4,
        when: function (w) { return !w.dark && w.cloud < 0.8 && w.hour < 48; },
        text: "A jet drones high overhead, far too high to see you.",
        data: { signal: false } },
      { id: "SEARCH_AIRCRAFT", slot: 90, chance: 0.5,
        when: function (w) { return !w.dark && w.cloud < 0.9 && w.hour >= 48; },
        text: "A small plane passes low over the trees, slow, turning in a wide circle.",
        data: { signal: true } },
      { id: "COYOTES", slot: 180, chance: 0.2,
        when: function (w) { return w.dark; },
        text: "Coyotes yip somewhere downhill, then stop.", data: {} },
      { id: "MICE", slot: 120, chance: 0.06,
        when: function (w, ctx) { return w.dark && ctx.inShelter; },
        text: "Something small rustles in the leaves of the shelter, then goes still.", data: {} }
    ]
  };

  if (typeof module !== "undefined" && module.exports) module.exports = scenario;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.scenarios = root.SURVIVAL.scenarios || {}; root.SURVIVAL.scenarios.treeline = scenario; }
})(this);
