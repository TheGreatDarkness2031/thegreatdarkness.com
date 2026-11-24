/* SURVIVAL scenario 2 "High Basin": a mountain basin at treeline, early October.
   Altitude (more water lost, slower walking), a sprained ankle from the start, a
   lighter with a few lights, a dead phone whose glass still flashes, and very
   little wood up high: stay visible above the trees or go down to the wood.
   Data only; window.SURVIVAL.scenarios.highbasin / require(). */
(function (root) {
  "use strict";
  var levels = {
    short:    { name: "SHORT",    rescueH: 48,  searchH: 24,  scoreMult: 0.5, blurb: "Two days. One hard night, one storm." },
    standard: { name: "STANDARD", rescueH: 72,  searchH: 48,  scoreMult: 1,   blurb: "Three days. Water, warmth and being seen all matter." },
    long:     { name: "LONG",     rescueH: 168, searchH: 96,  scoreMult: 2,   blurb: "A week. Snow comes and goes. Food is almost nothing up here." },
    lost:     { name: "LOST",     rescueH: 336, searchH: 192, scoreMult: 3,   hidden: true, blurb: "Two weeks, maybe. Nobody tells you when they are coming." }
  };
  var scenario = {
    id: "highbasin", name: "HIGH BASIN", number: 2,
    intro: "Early October, high in the mountains. You came down off a pass too fast and your ankle went over on the talus. Your phone took the fall too. You have a day pack: half a litre of water, a lighter with a few lights left, a fleece, a rain shell, a foil emergency blanket and a granola bar. You were due back at the trailhead tonight.",
    startHour: 13, startMinute: 0, year: 2026, month: 9, day: 3,
    sunrise: "07:05", sunset: "18:40",
    waterMult: 1.3,                         // dry, thin air: more water lost breathing
    hearWord: " through the trees",
    startPhrase: "after you fell on the talus", searchCraft: "helicopter", groundTeam: "search and rescue team",
    levels: levels,
    zoneWords: {
      talus: ["talus", "scree", "slope", "start", "rocks"], lake: ["lake", "tarn", "pond", "water"],
      krummholz: ["krummholz", "stunted trees", "treeline", "bushes"], forest: ["forest", "woods", "trees", "spruce", "timber"],
      meadow: ["meadow", "willows", "stream", "creek"], boulders: ["boulders", "boulder field", "cave", "hollow"]
    },
    itemWords: { "rose hips": ["rose hips", "hips", "berries"], mirror: ["phone", "mirror"], "granola bar": ["granola", "bar"], "dry lichen": ["lichen"], boughs: ["boughs", "spruce boughs"] },
    start: {
      zone: "talus", known: ["talus", "lake"], walkMult: 1.15,
      body: { waterShortL: 1.0, kcalDeficit: 800 },
      inv: { blanket: 1, "granola bar": 1, mirror: 1, shoelaces: 1 },
      bottle: { litres: 0.5, cap: 1, safe: true },
      lighter: { uses: 6, wet: false },
      injuries: [{ kind: "SPRAINED ANKLE", hours: 72 }],
      text: "A rock rolled under your boot and your ankle went over with a pop. You sit on the talus, breathing through it. The sun is warm on the rocks. Your phone's screen is black and cracked. Below you is a small lake, and below that, a long way down, the trees."
    },
    // Synthetic layers keep most of their warmth wet; the shell stops the wind.
    clothing: [{ clo: 0.9, wetKeep: 0.75 }, { clo: 0.15, wetKeep: 1, windBlock: 0.7, rainBlock: 0.75 }],
    blanket: { clo: 0.5, wetKeep: 1, windBlock: 0.5 },
    items: {
      blanket: { name: "foil emergency blanket", weight: 0.2 },
      "granola bar": { name: "granola bar", weight: 0.1, kcal: 250 },
      mirror: { name: "dead phone (the glass still catches the sun)", weight: 0.2 },
      "dry lichen": { name: "handful of dry hanging lichen", weight: 0.1, tinder: 1.1 },
      "rose hips": { name: "handful of rose hips", weight: 0.1, kcal: 50 }
    },
    shelters: {
      debris:   { name: "DEBRIS HUT", clo: 2.0, wind: 0.95, rain: 0.9, bed: 0.8 },
      leanto:   { name: "LEAN-TO",    clo: 0.3, wind: 0.6,  rain: 0.7, bed: 0.5, reflector: true },
      overhang: { name: "BOULDER CAVE", clo: 0.2, wind: 0.6, rain: 0.9, bed: 0 }
    },
    zones: {
      talus:     { name: "TALUS SLOPE", open: true, micro: { wind: 1.3, rain: 1.0, dayC: 0.5, nightC: 0 },
                   has: ["broken rock", "open sky", "a view down the valley"], res: { stones: true, chert: true }, see: ["lake", "boulders", "krummholz"] },
      lake:      { name: "TARN", open: true, micro: { wind: 1.2, rain: 1.0, dayC: 0, nightC: -1.5 },
                   has: ["cold clear water", "flat stones", "open sky"], res: { water: true, stones: true }, see: ["meadow"] },
      krummholz: { name: "KRUMMHOLZ", open: false, micro: { wind: 0.4, rain: 0.8, dayC: 0, nightC: 0.5 },
                   has: ["wind-stunted spruce mats", "dead twigs", "hanging lichen"], res: { tinder: "dry lichen", kindling: true, fuel: 10, boughs: true, pitch: true, softwood: true }, see: ["forest"] },
      forest:    { name: "SPRUCE FOREST", open: false, canopy: true, micro: { wind: 0.4, rain: 0.6, dayC: 2, nightC: 2 },
                   has: ["tall spruce and fir", "deadfall", "needle duff"], res: { tinder: "dry lichen", kindling: true, fuel: 40, boughs: true, pitch: true, softwood: true, leaves: true, ridgepole: true, bark: true }, hear: "meadow" },
      meadow:    { name: "WILLOW MEADOW", open: true, micro: { wind: 0.8, rain: 1.0, dayC: 1.5, nightC: -1 },
                   has: ["a small stream", "willow thickets", "dry grass", "rose bushes"], res: { water: true, tinder: "dry grass", stalks: true, rosehips: true, kindling: true, fuel: 6 }, see: ["forest"] },
      boulders:  { name: "BOULDER FIELD", open: true, micro: { wind: 0.9, rain: 1.0, dayC: 0, nightC: 0 },
                   has: ["house-sized boulders", "a hollow under two of them"], res: { stones: true }, overhang: { clo: 0.2, wind: 0.6, rain: 0.9 }, overhangName: "BOULDER CAVE" }
    },
    links: [
      ["talus", "lake", 15], ["talus", "krummholz", 20], ["talus", "boulders", 25],
      ["lake", "krummholz", 15], ["lake", "meadow", 30], ["boulders", "krummholz", 15],
      ["krummholz", "forest", 30], ["meadow", "forest", 20]
    ],
    // [hour since 13:00 day 1, airC, windKmh, rain, cloud]: a cold clear night (-6 C),
    // a snow squall the next afternoon, a bitter night after it (-9 C), wind on day 3.
    weather: [
      [0, 12, 15, 0, 0.2], [2, 13, 18, 0, 0.2], [5, 7, 15, 0, 0.1], [8, 0, 10, 0, 0], [12, -3, 8, 0, 0],
      [17, -6, 6, 0, 0], [19, -2, 8, 0, 0.1], [22, 6, 15, 0, 0.4], [24, 4, 22, 0, 0.8], [25, 0, 38, 0.4, 1],
      [27, -1, 40, 0.6, 1], [28.5, -1, 35, 0.4, 1], [29, -2, 25, 0, 0.6], [32, -5, 15, 0, 0.1], [41, -9, 8, 0, 0],
      [43, -4, 12, 0, 0], [46, 4, 25, 0, 0.1], [48, 6, 30, 0, 0.2], [52, 3, 25, 0, 0.3], [56, -3, 15, 0, 0.2],
      [65, -6, 8, 0, 0], [68, 0, 10, 0, 0.1], [72, 8, 12, 0, 0.2]
    ],
    generated: { untilHours: 400, highC: 9, coolPerDay: 0.3, swingC: 6, frontChance: 0.3, nightDrop: 11, nightDropVar: 4 },
    creek: { fill: 0.5, drainHours: 16, floodAt: 999 },
    forage: [
      { id: "pick_rosehips", name: "Pick rose hips", verbs: ["pick rose hips", "rose hips", "hips", "berries", "forage"], res: "rosehips", item: "rose hips", minutes: 30, n: [1, 2],
        text: "You pick {n} handfuls of wrinkled red rose hips. Mostly seeds and skin, but it's food.", none: "The bushes have been stripped by birds.", notHere: "There are no rose bushes here." }
    ],
    say: {
      spotted: "The helicopter swings toward you, drops low and hangs there, rotor wash flattening everything around you. They've seen you.",
      spotted_marker: "The helicopter slows over your marker, turns and comes back low. They've seen it.",
      mirror_spotted: "You catch the sun in the glass and sweep it across the helicopter. It turns toward you at once and comes in low. They've seen you.",
      mirror_after: "You keep flashing until the helicopter is overhead.",
      mirror_missed: "You sweep the flash across the sky where the helicopter went. Nothing.",
      wet_clothes: "the fleece still holds some warmth, but the wind goes straight through wet layers.",
      gather_stones: "You pry two flat slabs of rock loose.",
      drink: "You kneel at the edge of the water and drink. It's so cold it makes your teeth ache.",
      gather_leaves: "You scrape up two armfuls of needle duff from under the spruce.",
      leaves_word: "spruce duff", boughs_word: "spruce boughs",
      gather_boughs: "You snap off two armfuls of springy spruce boughs.", no_boughs: "There are no spruce here.", need_boughs: "You need spruce boughs: four armfuls here.",
      need_leaves: "You need a lot of needle duff: there's none here.",
      gather_pitch: "You pry a lump of hardened resin from a spruce trunk. It will burn hot.",
      build_hut: "You prop a dead spruce pole on a stump, lean dead branches along it and heap needle duff over it, arm-deep. It's barely bigger than you, which is the point.",
      build_leanto: "You lash a crosspole between two spruce and lean a roof of boughs against it. With a fire in front, it will throw the heat back at you.",
      dry_by_fire: "You turn slowly in front of the fire. Steam lifts off your fleece.",
      make_marker: "You drag rocks into a huge X on the open ground. From the air it would be hard to miss."
    },
    frictionText: { TREMOR: "The ground shivers under you. High above, a slab breaks loose and roars down a gully in a cloud of dust." },
    events: [
      { id: "ELK", slot: 30, chance: 0.4, onePerDay: true,
        when: function (w, ctx) { return w.dusk && ["lake", "meadow", "krummholz", "talus"].indexOf(ctx.zone) >= 0; },
        text: "A bull elk bugles somewhere below, a high, eerie whistle. The sound comes up from the trees.", data: { hint: "forest" } },
      { id: "ROCKFALL", slot: 60, chance: 0.12,
        when: function (w, ctx) { return !w.dark && w.airC > 0 && (ctx.zone === "talus" || ctx.zone === "boulders"); },
        text: "A rock lets go somewhere above you and clatters down the slope, bounding past.", data: {} },
      { id: "PIKA", slot: 120, chance: 0.3,
        when: function (w, ctx) { return !w.dark && ctx.zone === "talus"; }, text: "A pika squeaks from somewhere in the rocks and goes quiet.", data: {} },
      { id: "AIRCRAFT", slot: 120, chance: 0.4,
        when: function (w, ctx) { return !w.dark && w.cloud < 0.8 && w.hour < (ctx.searchH || 48); }, text: "A jet crawls across the sky, its contrail turning pink. Far too high to see you.", data: { signal: false } },
      { id: "SEARCH_AIRCRAFT", slot: 90, chance: 0.5,
        when: function (w, ctx) { return !w.dark && w.cloud < 0.9 && w.windKmh < 45 && w.hour >= (ctx.searchH || 48); },
        text: "The thud of a helicopter comes up the valley. It works slowly along the slopes, low.", data: { signal: true } },
      { id: "WIND_ROAR", slot: 180, chance: 0.3,
        when: function (w) { return w.dark && w.windKmh > 20; }, text: "The wind roars over the pass like a train that never arrives.", data: {} }
    ]
  };
  if (typeof module !== "undefined" && module.exports) module.exports = scenario;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.scenarios = root.SURVIVAL.scenarios || {}; root.SURVIVAL.scenarios.highbasin = scenario; }
})(this);
