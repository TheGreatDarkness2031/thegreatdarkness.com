/* SURVIVAL scenario 3 "Wrack Line": a wild coast in November after a kayak capsize.
   You start soaked and already cold in wind and rain, with a dry lighter of a few
   lights and a whistle. Tides open and close the way to the point (mussels, and a
   small chance of paralytic shellfish poisoning); the creek mouth is salty at high
   tide; driftwood is everywhere but wet; dark comes at 16:40.
   Data only; window.SURVIVAL.scenarios.wrackline / require(). */
(function (root) {
  "use strict";
  var levels = {
    short:    { name: "SHORT",    rescueH: 48,  searchH: 24,  scoreMult: 0.5, blurb: "Two days. Get warm, get dry, get seen." },
    standard: { name: "STANDARD", rescueH: 72,  searchH: 48,  scoreMult: 1,   blurb: "Three days. Rain, a storm, and the tide twice a day." },
    long:     { name: "LONG",     rescueH: 168, searchH: 96,  scoreMult: 2,   blurb: "A week. The sea feeds you, if it doesn't poison you." },
    lost:     { name: "LOST",     rescueH: 336, searchH: 192, scoreMult: 3,   hidden: true, blurb: "Two weeks, maybe. Nobody tells you when they are coming." }
  };
  var scenario = {
    id: "wrackline", name: "WRACK LINE", number: 3,
    intro: "Mid-November on a wild stretch of coast. A squall rolled your sea kayak off a rocky point at half past three. You swam to a gravel cove and dragged yourself out, soaked, in a life jacket, a fleece and a paddling jacket. The kayak is gone. A small dry bag clipped to the life jacket held a lighter, a whistle and a granola bar. The light is already going.",
    startHour: 15, startMinute: 30, year: 2026, month: 10, day: 14,
    sunrise: "07:25", sunset: "16:40",
    startPhrase: "after you dragged yourself out of the surf", searchCraft: "Coast Guard helicopter", groundTeam: "search team walking the shore",
    levels: levels,
    zoneWords: {
      beach: ["beach", "cove", "gravel", "start", "shore"], logs: ["logs", "log jam", "driftwood pile", "hollow"],
      fringe: ["fringe", "trees", "woods", "forest", "spruce"], creek: ["creek", "stream", "creek mouth", "fresh water"],
      point: ["point", "rocks", "tide pools", "mussel beds"], bluff: ["bluff", "cliff", "headland", "lookout"]
    },
    itemWords: { mussels: ["mussels", "mussel", "shellfish"], "cooked mussels": ["cooked"], kelp: ["kelp", "seaweed"], "granola bar": ["granola", "bar"], "dry lichen": ["lichen"] },
    tide: { periodH: 12.42, highAtH: -3.2 },
    start: {
      zone: "beach", known: ["beach", "logs"],
      body: { coreC: 35.8, waterShortL: 0.3, kcalDeficit: 600 },
      wetPct: 100,
      inv: { whistle: 1, "granola bar": 1, shoelaces: 1 },
      lighter: { uses: 8, wet: false, dry: true },
      text: "You crawl up the gravel above the surf and lie there, shaking. Everything you have on is soaked through. Rain is blowing in off the water. Behind the beach is a tangle of bleached logs, and behind that, dark spruce."
    },
    // Soaked fleece keeps half its warmth; the life jacket's foam (torso only) keeps all of it; the paddling jacket cuts some wind and rain.
    clothing: [{ clo: 0.6, wetKeep: 0.5 }, { clo: 0.2, wetKeep: 1 }, { clo: 0.1, wetKeep: 1, windBlock: 0.6, rainBlock: 0.5 }],
    blanket: { clo: 0, wetKeep: 1 },
    items: {
      whistle: { name: "plastic whistle on your life jacket", weight: 0 },
      "granola bar": { name: "granola bar", weight: 0.1, kcal: 250 },
      "dry lichen": { name: "handful of dry hanging lichen", weight: 0.1, tinder: 1.1 },
      mussels: { name: "mussel", weight: 0.03, kcal: 20, eatAll: true, cooks: "cooked mussels",
                 cookText: "You set the mussels on hot stones at the edge of the fire until they steam open.",
                 eatText: "You crack the mussels and eat them raw, salty and cold.",
                 risk: [{ kind: "PSP", chance: 0.04 }, { kind: "STOMACH ILLNESS", chance: 0.12, from: 6, to: 24 }] },
      "cooked mussels": { name: "cooked mussel", weight: 0.03, kcal: 20, eatAll: true, eatText: "You eat the steamed mussels. They taste like the sea.",
                 risk: [{ kind: "PSP", chance: 0.04 }] },
      kelp: { name: "frond of bull kelp", weight: 0.2, kcal: 25 }
    },
    shelters: {
      debris:   { name: "DEBRIS HUT", clo: 2.0, wind: 0.95, rain: 0.9, bed: 0.8 },
      leanto:   { name: "LEAN-TO",    clo: 0.3, wind: 0.6,  rain: 0.7, bed: 0.5, reflector: true },
      overhang: { name: "LOG JAM HOLLOW", clo: 0.3, wind: 0.7, rain: 0.6, bed: 0 }
    },
    zones: {
      beach:  { name: "COVE BEACH", open: true, micro: { wind: 1.0, rain: 1.0, dayC: 0, nightC: 0 },
                has: ["gravel", "driftwood", "kelp in the wrack line", "open sky"], res: { fuel: 60, kindling: true, stones: true, kelp: true, ridgepole: true }, see: ["logs", "point", "creek", "fringe"] },
      logs:   { name: "LOG JAM", open: false, micro: { wind: 0.6, rain: 0.8, dayC: 0, nightC: 0.5 },
                has: ["huge bleached logs piled by storms", "a dry hollow under them"], res: { fuel: 40, kindling: true, ridgepole: true }, overhang: { clo: 0.3, wind: 0.7, rain: 0.6 }, overhangName: "LOG JAM HOLLOW" },
      fringe: { name: "SPRUCE FRINGE", open: false, canopy: true, micro: { wind: 0.35, rain: 0.55, dayC: 0, nightC: 0.5 },
                has: ["huge Sitka spruce", "hanging lichen", "moss", "deadfall"], res: { tinder: "dry lichen", kindling: true, fuel: 25, boughs: true, pitch: true, softwood: true, leaves: true, ridgepole: true, bark: true }, see: ["bluff"] },
      creek:  { name: "CREEK MOUTH", open: true, micro: { wind: 0.8, rain: 1.0, dayC: 0, nightC: -0.5 },
                has: ["a creek running out across the gravel", "flat stones"], res: { water: true, salty: true, stones: true } },
      point:  { name: "ROCKY POINT", open: true, tidal: true, micro: { wind: 1.3, rain: 1.0, dayC: 0, nightC: 0 },
                has: ["black rocks", "mussel beds", "surge channels"], res: { mussels: true, stones: true } },
      bluff:  { name: "BLUFF", open: true, micro: { wind: 1.6, rain: 1.0, dayC: -0.5, nightC: 0 },
                has: ["salal and dry grass", "a long view up and down the coast"], res: { tinder: "dry grass", stalks: true } }
    },
    links: [
      ["beach", "creek", 10], ["beach", "fringe", 5], ["beach", "logs", 5], ["beach", "point", 15, { tidal: true }],
      ["fringe", "bluff", 30], ["creek", "fringe", 10], ["logs", "fringe", 5], ["creek", "bluff", 35]
    ],
    // [hour since 15:30 day 1, airC, windKmh, rain, cloud]: mild but wet and windy;
    // one clear, colder night; a storm on day 3 (gusts near 50 km/h). No frost.
    weather: [
      [0, 9, 30, 0.5, 1], [2, 8, 32, 0.6, 1], [5, 7, 28, 0.5, 1], [9, 7, 25, 0.4, 1], [13, 6, 22, 0.3, 1],
      [16, 6, 20, 0.2, 1], [18, 7, 18, 0, 0.8], [21, 9, 15, 0, 0.6], [24, 8, 12, 0, 0.3], [27, 4, 8, 0, 0.1],
      [33, 2, 6, 0, 0], [38, 1, 6, 0, 0.1], [41, 4, 12, 0, 0.6], [44, 7, 25, 0.3, 1], [46, 7, 40, 0.7, 1],
      [50, 8, 50, 0.8, 1], [54, 8, 45, 0.7, 1], [58, 7, 35, 0.5, 1], [62, 6, 28, 0.3, 1], [64, 6, 22, 0, 0.8],
      [68, 7, 18, 0.2, 1], [72, 8, 20, 0.3, 1]
    ],
    generated: { untilHours: 400, highC: 9, coolPerDay: 0.1, swingC: 3, frontChance: 0.55, nightDrop: 3, nightDropVar: 2, frontDrop: 2 },
    creek: { fill: 0.5, drainHours: 16, floodAt: 999 },
    forage: [
      { id: "gather_mussels", name: "Pry mussels off the rocks", verbs: ["gather mussels", "mussels", "collect mussels", "pick mussels", "shellfish", "forage"], res: "mussels", item: "mussels", minutes: 30, n: [10, 30], wet: 10, needLow: true,
        text: "You pry {n} mussels off the rocks, working fast between the waves.", none: "The waves keep washing over the beds. You get nothing.", notHere: "There are no mussels here.", tideHigh: "The tide is over the mussel beds. Wait for low water." },
      { id: "gather_kelp", name: "Collect kelp", verbs: ["gather kelp", "kelp", "seaweed", "collect seaweed"], res: "kelp", item: "kelp", minutes: 15, n: [1, 2],
        text: "You pull {n} fronds of fresh bull kelp from the wrack and rinse off the sand.", none: "The kelp here is old and rotten.", notHere: "There's no kelp here." }
    ],
    say: {
      spotted: "The helicopter swings toward you, drops low and hangs there, rotor wash flattening everything around you. They've seen you.",
      spotted_marker: "The helicopter slows over your marker, turns and comes back low. They've seen it.",
      mirror_spotted: "You catch the sun in the glass and sweep it across the helicopter. It turns toward you at once and comes in low. They've seen you.",
      mirror_after: "You keep flashing until the helicopter is overhead.",
      mirror_missed: "You sweep the flash across the sky where the helicopter went. Nothing.",
      wet_clothes: "wet fleece keeps some warmth, but the wind and rain pull it out of you fast.",
      gather_stones: "You pick two flat stones from the gravel.",
      drink: "You drink from the creek above the tide line. It tastes faintly of cedar.",
      salty: "The tide is pushing up the creek mouth; the water here is brackish now. Wait for the tide to drop.",
      tide_blocked: "The tide is in. The way around the rocks to the point is under water.",
      gather_leaves: "You peel up two armfuls of moss and needle duff from under the spruce.",
      leaves_word: "moss and duff", boughs_word: "spruce boughs",
      gather_boughs: "You snap off two armfuls of spruce boughs, heavy with rain.", no_boughs: "There are no spruce here.", need_boughs: "You need spruce boughs: four armfuls here.",
      need_leaves: "You need moss and needle duff: there's none here.",
      gather_pitch: "You pry a lump of hardened resin from a spruce trunk. It will burn hot even damp.",
      build_hut: "You drag a driftwood pole against a stump, lean silvered planks and branches along it and heap moss and duff over it, arm-deep.",
      build_leanto: "You lash a crosspole between two spruce and lean a roof of boughs against it. With a fire in front, it will throw the heat back at you.",
      dry_by_fire: "You turn slowly in front of the fire. Steam pours off your fleece.",
      make_marker: "You drag driftwood into a huge X above the tide line. From the air it would be hard to miss."
    },
    frictionText: { WIND: "The wind is rising off the water. Spray is coming over the rocks.", TREMOR: "The ground shivers under you. Up on the bluff, a slab of earth slumps onto the beach." },
    events: [
      { id: "DEER", slot: 30, chance: 0.35, onePerDay: true,
        when: function (w, ctx) { return w.dusk && ["beach", "fringe", "logs"].indexOf(ctx.zone) >= 0; },
        text: "A black-tailed deer picks along the edge of the trees and down to the creek to drink.", data: { hint: "creek" } },
      { id: "SEALIONS", slot: 120, chance: 0.3,
        when: function (w, ctx) { return !w.dark && ctx.zone !== "fringe"; }, text: "Sea lions are barking out on the rocks beyond the point.", data: {} },
      { id: "LOG_BOOM", slot: 60, chance: 0.25,
        when: function (w, ctx) { return w.windKmh >= 30 && (ctx.zone === "beach" || ctx.zone === "logs"); }, text: "A log the size of a car shifts in the surf with a deep boom.", data: {} },
      { id: "BOAT", slot: 180, chance: 0.25,
        when: function (w) { return w.dark && w.rain < 0.3; }, text: "Far out, the lights of a boat crawl along the horizon.", data: {} },
      { id: "AIRCRAFT", slot: 120, chance: 0.3,
        when: function (w, ctx) { return !w.dark && w.cloud < 0.9 && w.hour < (ctx.searchH || 48); }, text: "A floatplane drones past high over the water, heading somewhere else.", data: { signal: false } },
      { id: "SEARCH_AIRCRAFT", slot: 90, chance: 0.55,
        when: function (w, ctx) { return !w.dark && w.windKmh < 55 && w.hour >= (ctx.searchH || 48); },
        text: "An orange-and-white helicopter comes low along the shoreline, slowly, searching.", data: { signal: true } }
    ]
  };
  if (typeof module !== "undefined" && module.exports) module.exports = scenario;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.scenarios = root.SURVIVAL.scenarios || {}; root.SURVIVAL.scenarios.wrackline = scenario; }
})(this);
