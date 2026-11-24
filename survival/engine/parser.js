/* SURVIVAL engine: the word parser (design section 5, build step 5).
   Turns typed text into one action (+ argument) or a screen command. It never
   invents a result: no match = a plain "don't know" with what is possible.
   parse(text, g, sc) -> { id, arg } | { cmd } | { error, hint }
   window.SURVIVAL.parser / require(). */
(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var A = node ? require("./actions.js") : root.SURVIVAL.actions;
  var G = node ? require("./game.js") : root.SURVIVAL.game;

  var FILLER = ["the", "a", "an", "some", "my", "to", "up", "for", "please", "i", "want", "will", "try", "and", "then", "of", "more", "out", "over", "into", "in", "at", "on", "with", "go", "back"];
  var CMDS = {
    help: ["help", "?", "commands", "what can i do"], inventory: ["inventory", "inv", "i", "items", "pack", "pockets"],
    map: ["map", "places"], journal: ["journal", "log", "history"], status: ["status", "health", "how am i", "condition"]
  };
  // Zone words (the scenario's names plus everyday words for them).
  var ZONE_WORDS = {
    clearing: ["clearing", "meadow", "field", "start", "open"],
    hardwoods: ["hardwoods", "hardwood", "woods", "trees", "forest", "oaks"],
    creek: ["creek", "stream", "brook", "river"],
    ridge: ["ridge", "hill", "hilltop", "overhang", "rocks", "cliff"],
    pine: ["pine", "pines", "pine stand", "conifers"],
    bottomland: ["bottomland", "bottom", "marsh", "swamp", "cattails", "wetland"]
  };
  var ITEM_WORDS = {
    fuel: ["wood", "firewood", "logs", "branches", "armload"], leaves: ["leaves"], boughs: ["boughs"],
    blanket: ["blanket"], kindling: ["kindling", "sticks"], acorns: ["acorns", "nuts"], "leached acorns": ["leached"],
    crayfish: ["crayfish", "crawdads", "crawfish"], "cooked crayfish": ["cooked"], cattail: ["cattail", "roots"],
    stones: ["stones", "stone", "rocks"], chert: ["chert", "flint"]
  };
  var MOVE = ["go", "walk", "head", "travel", "move", "return", "hike", "run"];

  function words(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9?.\s-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function zoneIn(t, g, sc) {
    var best = null;
    Object.keys(ZONE_WORDS).forEach(function (z) {
      if (!sc.zones[z]) return;
      ZONE_WORDS[z].concat([sc.zones[z].name.toLowerCase()]).forEach(function (w) {
        if (new RegExp("\\b" + w + "\\b").test(t) && (!best || w.length > best.len)) best = { zone: z, len: w.length };
      });
    });
    return best && best.zone;
  }

  function itemIn(t) {
    var best = null;
    Object.keys(ITEM_WORDS).forEach(function (k) {
      ITEM_WORDS[k].forEach(function (w) { if (new RegExp("\\b" + w + "\\b").test(t) && (!best || w.length > best.len)) best = { item: k, len: w.length }; });
    });
    return best && best.item;
  }

  // "2 hours", "90 min", "an hour", "half an hour" -> minutes
  function duration(t) {
    var m = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?\b/.exec(t);
    if (m) { var n = +m[1]; return /^h/.test(m[2] || "") ? n * 60 : m[2] ? n : null; }
    if (/half an hour/.test(t)) return 30;
    if (/\ban hour\b|\bone hour\b/.test(t)) return 60;
    return null;
  }

  // Score each action by its verb phrases: every word of a phrase found in order.
  function matchAction(t) {
    var tw = t.split(" "), best = null;
    A.list.forEach(function (d) {
      (d.verbs || []).forEach(function (v) {
        var vw = v.split(" "), i = 0, j = 0;
        while (i < tw.length && j < vw.length) { if (tw[i] === vw[j]) j++; i++; }
        if (j < vw.length) return;
        var score = vw.length * 10 + (t === v ? 5 : 0) + (vw[0] === tw[0] ? 3 : 0);
        if (!best || score > best.score) best = { id: d.id, score: score };
      });
    });
    return best;
  }

  function parse(text, g, sc) {
    var t = words(text);
    if (!t) return { error: "Type what you want to do, or pick a number." };
    if (/^\d+$/.test(t)) return { pick: +t };
    for (var c in CMDS) if (CMDS[c].indexOf(t) >= 0) return { cmd: c };

    var zone = zoneIn(t, g, sc), item = itemIn(t), mins = duration(t);
    var first = t.split(" ")[0];
    // Movement: a move verb, or a bare place name.
    var core = t.split(" ").filter(function (w) { return FILLER.indexOf(w) < 0 && MOVE.indexOf(w) < 0; }).join(" ");
    if (zone && (MOVE.indexOf(first) >= 0 || ZONE_WORDS[zone].indexOf(core) >= 0 || core === sc.zones[zone].name.toLowerCase()))
      return { id: "go", arg: zone };

    var m = matchAction(t);
    // Single-word helpers with context.
    if (!m || m.score < 10) {
      if (/\bfire\b/.test(t)) m = { id: G.fireAt(g, g.zone) === "none" ? "light_fire" : "feed_fire" };
      else if (/\bwater\b|\bthirsty\b/.test(t)) m = { id: "drink" };
      else if (/\bshelter\b|\bhut\b/.test(t)) m = { id: g.shelters[g.zone] ? "improve_hut" : "build_hut" };
      else if (/\bwood\b/.test(t)) m = { id: "gather_wood" };
      else if (/\bbed\b/.test(t)) m = { id: "make_bed" };
      else if (/\bwarm\b|\bdry\b/.test(t)) m = { id: G.fireAt(g, g.zone) === "burning" ? "dry_by_fire" : "wrap" };
      else if (/\bhungry\b|\bfood\b/.test(t)) m = { id: "eat" };
    }
    if (!m) return { error: "You don't know how to do that.", hint: "Type HELP to see the kinds of things you can do, or pick a numbered action." };
    var id = m.id;
    // A fire already burning: "make fire" means feed it.
    if (id === "light_fire" && G.fireBurning(g)) id = "feed_fire";
    if (id === "rest") return { id: id, arg: mins || null };
    if (id === "sleep") return { id: id, arg: mins ? mins / 60 : null };
    if (id === "go") return zone ? { id: "go", arg: zone } : { error: "Go where?", hint: "Name a place you know." };
    if (id === "eat" || id === "take" || id === "drop") return { id: id, arg: item || null };
    return { id: id, arg: null };
  }

  // Grouped lists for HELP.
  var HELP = [
    "MOVING: look around, explore, go to <place> (or just the place's name)",
    "GATHERING: gather wood / kindling / tinder / leaves, cut boughs, collect pitch / stones / acorns, look for chert, catch crayfish, dig cattail roots, take / drop <thing>",
    "FIRE: knap a flake, make cord, make a fire drill, make a bow, prepare tinder, start a fire, feed / bank the fire, burn a bowl",
    "WATER AND FOOD: drink, fill the bowl, boil water, eat, cook",
    "SHELTER: make a bed of leaves, build a debris hut, build a lean-to, thicken the shelter",
    "BODY: wrap up in the blanket, rest <time>, sleep <hours>, dry off by the fire, clean the cut",
    "SIGNALS: build a signal fire, light the signal fire, mark the clearing",
    "SCREENS: inventory, map, journal, status, help"
  ];

  var api = { parse: parse, HELP: HELP, words: words };
  if (node) module.exports = api;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.parser = api; }
})(this);
