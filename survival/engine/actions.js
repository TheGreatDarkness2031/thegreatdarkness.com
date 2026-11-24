/* SURVIVAL engine: the action catalog (design: C:\TGD\docs\survival\design.md, sections 4-5).
   Each action: id, name, verbs (for the parser, step 5), need(g, c, arg) -> reason
   or null, minutes (base, before the body's slowdown), act (body activity),
   fine (needs light and steady hands), gather (slower in the dark), run(g, c, arg, r)
   -> text, applied after the time has passed. r(key) is this action's seeded roll.
   c: { sc, world, zone, w (conditions now), e (effects), G (game.js) }.
   window.SURVIVAL.actions / require(). */
(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var World = node ? require("./world.js") : root.SURVIVAL.world;
  var Body = node ? require("./body.js") : root.SURVIVAL.body;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function res(c, k) { return c.zone.res && c.zone.res[k]; }
  function full(c, g, weight) { return c.G.room(g) < weight ? "Your arms are full. Drop something first." : null; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function F(c) { return World.tempF(c); }

  // ---- fire-making chance (pinned by tests) ----
  // Hand drill: hard, more so damp, cold or tired. Bow drill: much better.
  function fireChance(g, c, method) {
    var bundle = g.bundles.length ? Math.max.apply(null, g.bundles) : 0;
    var p = method === "bow" ? 0.35 + Math.min(0.3, g.practice.bow * 0.1) : 0.12 + Math.min(0.2, g.practice.hand * 0.04);
    p *= bundle;                                       // tinder quality (0.8-1.2)
    if (c.G.has(g, "pitch")) p *= 1.15;
    p *= 1 - 0.8 * Math.max(g.damp.tinder, g.damp.kindling * 0.7);
    if (g.body.coreC < 36.0) p *= 0.6;                 // cold hands
    if (method === "hand" && g.blisters >= 3) p *= 0.6;
    p *= 1 - c.e.fumble;
    var sh = c.G.shelterHere(g, c.sc);
    if (c.w.rain > 0.1 && !(sh && (sh.type === "leanto" || sh.type === "overhang"))) p *= 0.3;
    if (c.w.windKmh > 20) p *= 0.8;
    if (c.w.dark) p *= 0.8;
    p *= g.flags.drillQ || 1;
    return clamp(p, 0.02, 0.85);
  }

  function gatherTo(g, c, item, n, dampKey) {
    var G = c.G;
    if (dampKey) {
      var count = dampKey === "fuel" ? G.near(g, "fuel") : dampKey === "kindling" ? (g.inv.kindling || 0) : tinderCount(g);
      G.mixDamp(g, dampKey, count, G.gatherDamp(c.w, dampKey, c.zone), n);
    }
    if (G.ITEMS[item].bulky) G.pile(g, g.zone)[item] += n; else G.add(g, item, n);
  }
  function tinderCount(g) { var n = g.bundles.length; ["dry grass", "dry needles", "cattail fluff", "inner bark"].forEach(function (k) { n += g.inv[k] || 0; }); return n; }

  function fuelLeft(g, c) {
    var cap = res(c, "fuel"); if (!cap) return 0;
    return cap - (g.taken[g.zone] || 0);
  }

  function lookText(g, c) {
    var z = c.zone, w = c.w, parts = [];
    parts.push(z.name + ". " + w.sky.charAt(0) + w.sky.slice(1).toLowerCase() + ", " + F(w.airC) + ", wind " + w.windWord.toLowerCase() + ".");
    parts.push("Here: " + z.has.join(", ") + ".");
    var p = c.G.pile(g, g.zone), piled = [];
    if (p.fuel) piled.push(plural(p.fuel, "armload of firewood", "armloads of firewood"));
    if (p.leaves) piled.push(plural(p.leaves, "armful of leaves", "armfuls of leaves"));
    if (p.boughs) piled.push(plural(p.boughs, "armful of boughs", "armfuls of boughs"));
    if (piled.length) parts.push("Piled here: " + piled.join(", ") + ".");
    var sh = g.shelters[g.zone]; if (sh) parts.push("Your " + sh.name.toLowerCase() + " is here.");
    var f = c.G.fireAt(g, g.zone); if (f !== "none") parts.push(f === "burning" ? "Your fire is burning." : "Your fire is down to coals.");
    if (w.flooded) parts.push("Brown water covers most of the ground.");
    if (res(c, "fuel") && fuelLeft(g, c) <= 0) parts.push("You have picked up all the dead wood near here.");
    // What you can see or hear from here.
    var found = [];
    (z.see || []).forEach(function (id) { if (g.known.indexOf(id) < 0) { g.known.push(id); found.push(c.sc.zones[id].name); } });
    if (z.hear && g.known.indexOf(z.hear) < 0 && w.windKmh < 15) { g.known.push(z.hear); found.push(c.sc.zones[z.hear].name + " (you can hear running water downhill)"); }
    if (found.length) parts.push("You can make out: " + found.join(", ") + ".");
    var others = g.known.filter(function (id) { return id !== g.zone; }).map(function (id) { return c.sc.zones[id].name; });
    if (others.length) parts.push("Places you know: " + others.join(", ") + ".");
    return parts.join(" ");
  }

  function scheduleIllness(g, r, chance, onsetFrom, onsetTo, why) {
    if (g.pending.length || g.body.illnesses.some(function (i) { return i.active; })) return;
    if (r("ill") >= chance) return;
    var onset = g.min + Math.round((onsetFrom + r("onset") * (onsetTo - onsetFrom)) * 60);
    g.pending.push({ kind: "STOMACH ILLNESS", onsetMin: onset, hours: 24, waterLH: 0.15, why: why,
                     text: "Cramps fold you over. Your stomach is turning itself out; you are losing water fast." });
  }

  function injure(g, kind, text) {
    if (g.body.injuries.some(function (i) { return i.kind === kind && !i.healed; })) return "";
    g.body.injuries.push({ kind: kind, atMin: g.min, cleaned: false, healMin: g.min + (kind === "SPRAINED ANKLE" ? 48 : 72) * 60 });
    return " " + text;
  }

  var list = [
    // ---- looking and moving ----
    { id: "look", name: "Look around", verbs: ["look", "look around", "survey", "where am i"], minutes: 5, act: "rest", fixedTime: true,
      run: function (g, c) { return lookText(g, c); } },
    { id: "explore", name: "Explore nearby", verbs: ["explore", "scout", "search the area", "wander"], minutes: 30, act: "walk", gather: true,
      need: function (g, c) {
        var unknown = c.sc.links.filter(function (l) { return (l[0] === g.zone && g.known.indexOf(l[1]) < 0) || (l[1] === g.zone && g.known.indexOf(l[0]) < 0); });
        return unknown.length ? null : "You have found every place you can reach from here.";
      },
      run: function (g, c, arg, r) {
        var unknown = c.sc.links.filter(function (l) { return (l[0] === g.zone && g.known.indexOf(l[1]) < 0) || (l[1] === g.zone && g.known.indexOf(l[0]) < 0); })
          .map(function (l) { return l[0] === g.zone ? l[1] : l[0]; });
        if (r("find") > (c.w.dark ? 0.3 : 0.75)) return "You circle out and back but find nothing new" + (c.w.dark ? " in the dark." : ".");
        var id = unknown[Math.floor(r("pick") * unknown.length)];
        g.known.push(id);
        return "Working outward, you find the " + c.sc.zones[id].name.toLowerCase() + ". You could find your way back to it.";
      } },
    { id: "go", name: "Go to", verbs: ["go", "walk", "head", "travel", "move", "go to"], args: "zone",
      need: function (g, c, to) {
        if (!to) return "Go where?";
        if (!c.sc.zones[to]) return "You don't know a place called that.";
        if (to === g.zone) return "You are already here.";
        if (g.known.indexOf(to) < 0) return "You don't know the way there. Look around or explore first.";
        return null;
      },
      travel: function (g, c, to, r) {
        var G = c.G, trip = World.travel(c.world, g.zone, to, g.min, { timeMult: c.e.walkMult });
        var notes = [], tripNo = g.trips++, startMin = g.min;
        for (var i = 0; i < trip.path.length - 1 && !g.over; i++) {
          var leg = World.travel(c.world, trip.path[i], trip.path[i + 1], g.min, { timeMult: G.effects(g).walkMult });
          G.advance(g, c.sc, leg.minutes, "walk");
          if (g.over) break;
          g.zone = trip.path[i + 1];
          if (g.visited.indexOf(g.zone) < 0) g.visited.push(g.zone);
          if (g.known.indexOf(g.zone) < 0) g.known.push(g.zone);
          if (leg.legs[0].wade) { g.body.wetPct = Math.max(g.body.wetPct, 60); notes.push("You wade thigh-deep through cold floodwater."); }
          var L = leg.legs[0];
          if (World.tripRoll(c.world, tripNo, i) < L.injuryChance) {
            notes.push(L.dark ? injure(g, "SPRAINED ANKLE", "Your foot drops into a hole you never saw. Your ankle rolls hard.").trim()
              : injure(g, "CUT HAND", "You catch yourself on a broken branch and it opens your palm.").trim());
          }
          if (g.body.wetPct > 50 && leg.minutes > 20 && !g.body.injuries.some(function (x) { return x.kind === "BLISTERED FEET"; }) && r("blister" + i) < 0.3)
            notes.push(injure(g, "BLISTERED FEET", "Wet socks are rubbing your heels raw.").trim());
        }
        if (g.over) return null;
        return "You reach the " + c.sc.zones[g.zone].name.toLowerCase() + " (" + (g.min - startMin) + " min" + (trip.darkLegs ? ", in the dark" : "") + ")." + (notes.length ? " " + notes.filter(Boolean).join(" ") : "");
      } },

    // ---- gathering ----
    { id: "gather_wood", name: "Gather firewood", verbs: ["gather wood", "collect wood", "get firewood", "gather firewood", "find wood"], minutes: 30, gather: true,
      need: function (g, c) { if (!res(c, "fuel")) return "There's no dead wood worth carrying here."; return fuelLeft(g, c) > 0 ? null : "You have already picked up all the dead wood near here."; },
      run: function (g, c) { g.taken[g.zone] = (g.taken[g.zone] || 0) + 1; gatherTo(g, c, "fuel", 1, "fuel");
        return "You drag in an armload of dead branches and stack it here." + (g.damp.fuel > 0.4 ? " It's wet." : ""); } },
    { id: "gather_kindling", name: "Gather kindling", verbs: ["gather kindling", "collect kindling", "get sticks", "small sticks"], minutes: 15, gather: true,
      need: function (g, c) { return res(c, "kindling") ? full(c, g, 1) : "Nothing here makes good kindling."; },
      run: function (g, c) { gatherTo(g, c, "kindling", 1, "kindling"); return "You snap a bundle of pencil-thin dead twigs from low branches." + (g.damp.kindling > 0.4 ? " They're damp." : ""); } },
    { id: "gather_tinder", name: "Gather tinder", verbs: ["gather tinder", "collect tinder", "get tinder", "find tinder"], minutes: 15, gather: true,
      need: function (g, c) { if (!res(c, "tinder")) return "Nothing here would catch a spark."; if (c.w.flooded) return "The cattails stand in floodwater."; return full(c, g, 0.2); },
      run: function (g, c) { var k = res(c, "tinder"); gatherTo(g, c, k, 1, "tinder"); return "You gather a " + c.G.ITEMS[k].name + "." + (g.damp.tinder > 0.4 ? " It's damp." : ""); } },
    { id: "gather_leaves", name: "Gather leaves", verbs: ["gather leaves", "collect leaves", "rake leaves", "get leaves"], minutes: 15, gather: true,
      need: function (g, c) { return res(c, "leaves") ? null : "There's no leaf litter here."; },
      run: function (g, c) { c.G.pile(g, g.zone).leaves += 2; return "You scoop two armfuls of leaves onto a pile."; } },
    { id: "gather_boughs", name: "Cut pine boughs", verbs: ["gather boughs", "cut boughs", "get branches", "pine boughs"], minutes: 20, gather: true,
      need: function (g, c) { return res(c, "boughs") ? null : "There are no pines here."; },
      run: function (g, c) { c.G.pile(g, g.zone).boughs += 2; return "You twist off two armfuls of green pine boughs. Your hands are sticky with sap."; } },
    { id: "gather_pitch", name: "Collect pine pitch", verbs: ["collect pitch", "get pitch", "pine pitch", "resin", "sap"], minutes: 20, gather: true,
      need: function (g, c) { return res(c, "pitch") ? null : "There are no pines here."; },
      run: function (g, c) { c.G.add(g, "pitch"); return "You pry a lump of hardened pitch from a wound in a pine trunk. It will burn hot."; } },
    { id: "gather_stones", name: "Collect flat stones", verbs: ["collect stones", "get stones", "gather rocks", "rocks", "stones"], minutes: 10,
      need: function (g, c) { return res(c, "stones") ? full(c, g, 2) : "There are no loose stones here."; },
      run: function (g, c) { c.G.add(g, "stones", 2); return "You pick two flat stones from the creek bed."; } },
    { id: "gather_chert", name: "Look for chert", verbs: ["find chert", "look for chert", "flint", "chert"], minutes: 15,
      need: function (g, c) { return res(c, "chert") ? null : "There's no chert here."; },
      run: function (g, c, a, r) { if (r() < 0.25) return "You turn over cobbles but find only soft, crumbly rock."; c.G.add(g, "chert"); return "You find a fist-sized piece of grey chert with a glassy break."; } },
    { id: "gather_acorns", name: "Collect acorns", verbs: ["collect acorns", "gather acorns", "acorns", "nuts"], minutes: 30, gather: true,
      need: function (g, c) { return res(c, "acorns") ? null : "There are no oaks here."; },
      run: function (g, c, a, r) { var n = r() < 0.3 ? 1 : 2; c.G.add(g, "acorns", n); return "You pick " + plural(n, "handful", "handfuls") + " of acorns from the leaf litter, throwing out the ones with holes."; } },
    { id: "catch_crayfish", name: "Catch crayfish", verbs: ["catch crayfish", "crayfish", "crawdads", "fish"], minutes: 45, gather: true,
      need: function (g, c) { if (!res(c, "crayfish")) return "There's no water with crayfish here."; if (c.w.creekHigh) return "The creek is high and brown. You can't see the bottom."; return null; },
      run: function (g, c, a, r) {
        g.body.wetPct = Math.min(100, g.body.wetPct + 20);
        var n = Math.floor(r() * (c.w.dark ? 2 : 5));
        if (n) c.G.add(g, "crayfish", n);
        return (n ? "You turn stones and pin " + plural(n, "crayfish", "crayfish") + "." : "The crayfish shoot backward under the stones every time.") + " Your hands and sleeves are soaked and aching.";
      } },
    { id: "dig_cattail", name: "Dig cattail roots", verbs: ["dig cattail", "cattail roots", "dig roots", "cattails"], minutes: 45,
      need: function (g, c) { if (!res(c, "cattail")) return "There are no cattails here."; if (c.w.flooded) return "The cattails stand in floodwater."; return null; },
      run: function (g, c) { g.body.wetPct = Math.min(100, g.body.wetPct + 30); c.G.add(g, "cattail"); return "Up to your elbows in cold mud, you pull a bundle of starchy cattail roots."; } },
    { id: "take", name: "Pick up", verbs: ["take", "pick up", "carry", "grab"], args: "item", minutes: 2, fixedTime: true,
      need: function (g, c, item) { item = item || "fuel"; var p = c.G.pile(g, g.zone); if (!p[item]) return "There's nothing like that piled here."; return full(c, g, c.G.ITEMS[item].weight); },
      run: function (g, c, item) { item = item || "fuel"; c.G.pile(g, g.zone)[item] -= 1; c.G.add(g, item); return "You pick up an " + c.G.ITEMS[item].name + "."; } },
    { id: "drop", name: "Put down", verbs: ["drop", "put down", "set down", "stack"], args: "item", minutes: 1, fixedTime: true,
      need: function (g, c, item) { item = item || "fuel"; return c.G.has(g, item) ? null : "You aren't carrying that."; },
      run: function (g, c, item) { item = item || "fuel"; c.G.add(g, item, -1); if (c.G.ITEMS[item].bulky) c.G.pile(g, g.zone)[item] += 1; else { var p = c.G.pile(g, g.zone); p[item] = (p[item] || 0) + 1; }
        if (item === "blanket") g.wrapped = false; return "You put down the " + c.G.ITEMS[item].name + "."; } },

    // ---- water and food ----
    { id: "drink", name: "Drink from the creek", verbs: ["drink", "drink water", "drink from creek", "water"], minutes: 10, act: "rest",
      need: function (g, c) { if (res(c, "water")) return null; return g.bowl && g.bowl.litres > 0 ? null : "There's no water here."; },
      run: function (g, c, a, r) {
        if (!res(c, "water")) {
          var l = Math.min(g.bowl.litres, g.body.waterShortL); g.body = Body.drink(g.body, l); g.bowl.litres -= l;
          if (!g.bowl.safe) scheduleIllness(g, r, 0.06, 12, 48, "water");
          return "You drink " + l.toFixed(1) + " L from the bowl" + (g.bowl.safe ? "." : ". It tastes of the creek.");
        }
        var drunk = Math.min(1.5, g.body.waterShortL);
        g.body = Body.drink(g.body, drunk);
        scheduleIllness(g, r, 0.06, 12, 48, "creek water");
        return drunk > 0.2 ? "You lie on the bank and drink until your stomach is tight. The water is so cold it hurts your teeth." : "You aren't thirsty, but you drink a little anyway.";
      } },
    { id: "eat", name: "Eat", verbs: ["eat", "eat food", "have food"], args: "item", minutes: 10, act: "rest",
      need: function (g, c, item) {
        var food = item || ["cooked crayfish", "leached acorns", "cattail", "crayfish", "acorns"].filter(function (k) { return c.G.has(g, k); })[0];
        return food && c.G.ITEMS[food] && c.G.ITEMS[food].kcal && c.G.has(g, food) ? null : "You have nothing to eat.";
      },
      run: function (g, c, item, r) {
        var food = item || ["cooked crayfish", "leached acorns", "cattail", "crayfish", "acorns"].filter(function (k) { return c.G.has(g, k); })[0];
        var n = food.indexOf("crayfish") >= 0 ? g.inv[food] : 1;
        c.G.add(g, food, -n);
        g.body = Body.eat(g.body, c.G.ITEMS[food].kcal * n);
        if (food === "crayfish") { scheduleIllness(g, r, 0.2, 6, 24, "raw crayfish"); return "You crack the raw crayfish and eat the tails. There isn't much to them."; }
        if (food === "acorns") { g.body.waterShortL += 0.1; return "Raw acorns: so bitter your mouth puckers dry. You get them down."; }
        return "You eat the " + c.G.ITEMS[food].name.replace(/^(handful|bundle) of /, "") + ".";
      } },

    // ---- crafting ----
    { id: "make_flake", name: "Knap a stone flake", verbs: ["knap", "make flake", "make knife", "sharp stone", "knap chert", "make a blade"], minutes: 20, fine: true,
      need: function (g, c) { if (!c.G.has(g, "chert")) return "You need a piece of chert to knap."; return c.G.has(g, "stones") || res(c, "stones") ? null : "You need a hammer stone."; },
      run: function (g, c, a, r) {
        var extra = r("cut") < 0.15 ? injure(g, "CUT HAND", "A sliver of chert opens the side of your thumb.") : "";
        if (r() < 0.3 + c.e.fumble) { c.G.add(g, "chert", -1); return "The chert shatters into useless chips." + extra; }
        c.G.add(g, "flake"); return "A long, sharp flake comes off clean. It will cut wood." + extra;
      } },
    { id: "make_cord", name: "Make bark cord", verbs: ["make cord", "make rope", "twist cord", "bark cord", "cordage"], minutes: 40, fine: true,
      need: function (g, c) { return res(c, "bark") ? null : "There's no dead bark here that would strip into fibre."; },
      run: function (g, c, a, r) { if (r() < 0.2 + c.e.fumble) return "The fibres keep breaking. You end up with a tangle."; c.G.add(g, "cord"); return "You strip and twist inner bark into an arm's length of cord."; } },
    { id: "make_drill", name: "Make a fire drill", verbs: ["make drill", "make fire drill", "fire drill", "hand drill", "carve drill"], minutes: 45, fine: true,
      need: function (g, c) {
        if (c.G.has(g, "drill")) return "You already have a fire drill.";
        if (!c.G.has(g, "flake")) return "You need something sharp to shape the wood and cut the notch.";
        return res(c, "softwood") || res(c, "stalks") || res(c, "fuel") ? null : "There's no dry, soft dead wood here.";
      },
      run: function (g, c) {
        g.flags.drillQ = res(c, "softwood") ? 1.0 : res(c, "stalks") ? 0.9 : 0.75;
        c.G.add(g, "drill");
        return "You shape a straight spindle and a flat hearth board, cut a socket and a notch with the flake." + (g.flags.drillQ < 0.8 ? " The wood is harder than you'd like." : "");
      } },
    { id: "make_bow", name: "Make a bow for the drill", verbs: ["make bow", "bow drill", "make a bow"], minutes: 20, fine: true,
      need: function (g, c) {
        if (c.G.has(g, "bow")) return "You already have a bow.";
        if (!c.G.has(g, "drill")) return "You need a fire drill first.";
        return ["cord", "drawstring", "shoelaces"].some(function (k) { return c.G.has(g, k); }) ? null : "You need cord for the bow.";
      },
      run: function (g, c) {
        var used = ["cord", "drawstring", "shoelaces"].filter(function (k) { return c.G.has(g, k); })[0];
        c.G.add(g, used, -1); c.G.add(g, "bow");
        return "You string a curved stick with your " + c.G.ITEMS[used].name + ". The spindle spins much faster with a bow.";
      } },
    { id: "prepare_tinder", name: "Prepare a tinder bundle", verbs: ["prepare tinder", "make tinder", "tinder bundle", "make a nest"], minutes: 15, fine: true,
      need: function (g) { return ["cattail fluff", "dry grass", "inner bark", "dry needles"].some(function (k) { return (g.inv[k] || 0) > 0; }) ? null : "You have no tinder to work."; },
      run: function (g, c) {
        var k = ["cattail fluff", "dry grass", "inner bark", "dry needles"].filter(function (t) { return (g.inv[t] || 0) > 0; })[0];
        c.G.add(g, k, -1); g.bundles.push(c.G.ITEMS[k].tinder);
        return "You rub and fluff the " + k + " into a loose bird's nest, finest fibres in the middle.";
      } },
    { id: "burn_bowl", name: "Burn out a bowl", verbs: ["burn bowl", "make bowl", "make container", "burn a bowl"], minutes: 240, fine: true,
      need: function (g, c) { if (c.G.has(g, "bowl")) return "You already have a bowl."; if (!c.G.fireBurning(g)) return "You need a burning fire for coals."; return c.G.near(g, "fuel") ? null : "You need a chunk of wood to burn out."; },
      run: function (g, c) { c.G.useNear(g, "fuel", 1); c.G.add(g, "bowl"); g.bowl = { litres: 0, safe: false };
        return "Hours of laying coals on a chunk of wood and scraping out the char leave you with a crude bowl. It holds about a litre."; } },

    // ---- fire ----
    { id: "light_fire", name: "Try to start a fire", verbs: ["start fire", "make fire", "light fire", "light a fire", "build fire", "start a fire", "make a fire", "use drill"], fine: true,
      minutes: function (g, c) { return c.G.has(g, "bow") ? 15 : 20; },
      need: function (g, c) {
        if (c.G.fireBurning(g)) return "There's already a fire here.";
        if (c.G.fireAt(g, g.zone) === "embers") return null;
        if (!c.G.has(g, "drill")) return "You have no way to make fire yet. A fire drill needs a sharp stone edge and dry soft wood.";
        if (!g.bundles.length) return "You need a prepared tinder bundle.";
        if (!c.G.has(g, "kindling")) return "You need kindling to feed the first flame.";
        return null;
      },
      run: function (g, c, a, r) {
        var G = c.G;
        if (G.fireAt(g, g.zone) === "embers") return feed(g, c, "You blow the coals back to life with kindling.");
        var method = G.has(g, "bow") ? "bow" : "hand", p = fireChance(g, c, method);
        g.body.kcalDeficit += 80;
        if (method === "hand") { g.blisters++; }
        g.practice[method]++;
        var extra = method === "hand" && g.blisters === 3 ? " Your palms are blistered from the spindle." : "";
        if (r() >= p) {
          var why = g.damp.tinder > 0.4 ? "The tinder is too damp; the coal dies in it." : c.w.windKmh > 20 ? "The wind scatters the coal before it catches." : method === "hand" ? "Smoke, a black powder, but no coal. Your arms are burning." : "Smoke and a small coal, but it goes out in the tinder.";
          return why + extra;
        }
        var q = g.bundles.indexOf(Math.max.apply(null, g.bundles)); g.bundles.splice(q, 1);
        G.add(g, "kindling", -1);
        g.fires[g.zone] = { fuelMin: 15, emberMin: 0, banked: false, lit: g.min };
        g.flags.firstFire = g.flags.firstFire != null ? g.flags.firstFire : g.min;
        return feed(g, c, "A coal glows in the notch. You fold it into the tinder and blow until it bursts into flame, then build it up with kindling." + extra);
      } },
    { id: "feed_fire", name: "Feed the fire", verbs: ["feed fire", "add wood", "stoke fire", "tend fire", "put wood on"], minutes: 5, act: "rest",
      need: function (g, c) { if (c.G.fireAt(g, g.zone) === "none") return "There's no fire here."; return c.G.near(g, "fuel") ? null : "You have no firewood here."; },
      run: function (g, c) { return feed(g, c, ""); } },
    { id: "bank_fire", name: "Bank the fire for the night", verbs: ["bank fire", "bank the fire", "keep fire overnight"], minutes: 10, act: "rest",
      need: function (g, c) { if (!c.G.fireBurning(g)) return "There's no fire burning here."; return c.G.near(g, "fuel") >= 2 ? null : "You need two armloads of wood to bank it."; },
      run: function (g, c) { var f = g.fires[g.zone]; c.G.useNear(g, "fuel", 2); f.fuelMin += 2 * c.G.FIRE.ARMLOAD_MIN; f.banked = true;
        return "You lay big wood on the coals and cover the fire with ash. It will burn slow and low for hours."; } },
    { id: "boil_water", name: "Boil water with hot stones", verbs: ["boil water", "purify water", "heat water", "boil"], minutes: 45, act: "work",
      need: function (g, c) { if (!g.bowl) return "You have nothing to boil water in."; if (!g.bowl.litres) return "The bowl is empty."; if (!c.G.fireBurning(g)) return "You need a burning fire to heat stones."; return c.G.has(g, "stones", 2) ? null : "You need two stones to heat."; },
      run: function (g) { g.bowl.safe = true; return "You drop fire-hot stones into the bowl, one after another, until the water rolls. It's safe to drink."; } },
    { id: "fill_bowl", name: "Fill the bowl", verbs: ["fill bowl", "get water", "collect water", "carry water"], minutes: 5,
      need: function (g, c) { if (!g.bowl) return "You have nothing to carry water in."; return res(c, "water") ? null : "There's no water here."; },
      run: function (g) { g.bowl.litres = 1; g.bowl.safe = false; return "You fill the bowl at the creek."; } },
    { id: "cook", name: "Cook food", verbs: ["cook", "cook food", "roast", "cook crayfish"], minutes: 20, act: "rest",
      need: function (g, c) { if (!c.G.fireBurning(g)) return "You need a fire to cook on."; return c.G.has(g, "crayfish") || (c.G.has(g, "acorns") && g.bowl && g.bowl.litres) ? null : "You have nothing to cook."; },
      run: function (g, c) {
        if (c.G.has(g, "crayfish")) { var n = g.inv.crayfish; c.G.add(g, "crayfish", -n); c.G.add(g, "cooked crayfish", n); return "You roast the crayfish on a flat stone at the edge of the coals until they turn red."; }
        var a = g.inv.acorns; c.G.add(g, "acorns", -a); c.G.add(g, "leached acorns", a); g.bowl.litres = 0;
        return "You crack the acorns and boil the meats with hot stones, pouring off the brown water. The bitterness fades.";
      } },

    // ---- shelter ----
    { id: "make_bed", name: "Make a bed of leaves", verbs: ["make bed", "leaf bed", "bed of leaves", "insulate ground", "make a bed"], minutes: 30,
      need: function (g, c) { if ((g.beds[g.zone] || 0) >= 0.8) return "Your bed here is as thick as it will get."; return res(c, "leaves") || c.G.near(g, "leaves") >= 3 || c.G.near(g, "boughs") >= 2 ? null : "There's nothing here to make a bed from."; },
      run: function (g, c) {
        var boughs = c.G.near(g, "boughs") >= 2;
        if (boughs) c.G.useNear(g, "boughs", 2); else if (!res(c, "leaves")) c.G.useNear(g, "leaves", 3);
        g.beds[g.zone] = Math.min(0.8, (g.beds[g.zone] || 0) + (boughs ? 0.5 : 0.4));
        return "You heap " + (boughs ? "pine boughs" : "leaves") + " into a bed a hand's width thick. It will keep the cold ground off you.";
      } },
    { id: "build_hut", name: "Build a debris hut", verbs: ["build hut", "debris hut", "build shelter", "make shelter", "leaf hut", "build a shelter"], minutes: 150,
      need: function (g, c) {
        if (g.shelters[g.zone]) return "You already have a shelter here.";
        if (!res(c, "ridgepole") && !(g.zone === "clearing")) return "There's nothing here long enough for a ridgepole.";
        if (c.w.flooded) return "The ground here is under water.";
        return res(c, "leaves") || c.G.near(g, "leaves") >= 10 ? null : "You need a lot of leaves: there are none here.";
      },
      run: function (g, c) {
        var s = c.sc.shelters.debris;
        g.shelters[g.zone] = { type: "debris", name: s.name, clo: s.clo, wind: s.wind, rain: s.rain, bed: s.bed };
        if (!res(c, "leaves")) c.G.useNear(g, "leaves", 10);
        return "You prop a ridgepole on a stump, lean ribs of dead branches along both sides and heap leaves over it all, arm-deep. It's barely bigger than you, which is the point.";
      } },
    { id: "build_leanto", name: "Build a lean-to", verbs: ["build lean-to", "lean-to", "leanto", "lean to", "build a lean-to"], minutes: 90,
      need: function (g, c) {
        if (g.shelters[g.zone]) return "You already have a shelter here.";
        if (c.w.flooded) return "The ground here is under water.";
        return res(c, "boughs") || c.G.near(g, "boughs") >= 4 ? null : "You need pine boughs: four armfuls here.";
      },
      run: function (g, c) {
        var s = c.sc.shelters.leanto;
        g.shelters[g.zone] = { type: "leanto", name: s.name, clo: s.clo, wind: s.wind, rain: s.rain, bed: s.bed };
        if (!res(c, "boughs")) c.G.useNear(g, "boughs", 4);
        return "You lash a crosspole between two trees and lean a roof of pine boughs against it. With a fire in front, it will throw the heat back at you.";
      } },
    { id: "improve_hut", name: "Thicken the shelter", verbs: ["improve shelter", "add leaves", "thicken shelter", "improve hut"], minutes: 45,
      need: function (g, c) { var s = g.shelters[g.zone]; if (!s) return "You have no shelter here."; if (s.clo >= (s.type === "debris" ? 3.0 : 0.6)) return "Another layer won't make much difference."; return res(c, "leaves") || res(c, "boughs") ? null : "There's nothing here to add to it."; },
      run: function (g) { var s = g.shelters[g.zone]; s.clo = Math.round((s.clo + (s.type === "debris" ? 0.5 : 0.15)) * 100) / 100; s.rain = Math.min(0.95, s.rain + 0.02);
        return "You pile on another thick layer and weigh it down with branches."; } },

    // ---- body ----
    { id: "wrap", name: "Wrap up in the blanket", verbs: ["wrap blanket", "wear blanket", "use blanket", "wrap up", "put on blanket"], minutes: 1, fixedTime: true,
      need: function (g, c) { if (!c.G.has(g, "blanket")) return "You don't have the blanket."; return g.wrapped ? "You are already wrapped in it." : null; },
      run: function (g) { g.wrapped = true; return "You wrap the wool blanket around your shoulders."; } },
    { id: "unwrap", name: "Take off the blanket", verbs: ["unwrap", "take off blanket", "remove blanket"], minutes: 1, fixedTime: true, hidden: true,
      need: function (g) { return g.wrapped ? null : "You aren't wrapped in it."; },
      run: function (g) { g.wrapped = false; return "You fold the blanket over your arm."; } },
    { id: "rest", name: "Rest", verbs: ["rest", "sit", "wait", "sit down", "take a break"], args: "minutes", act: "rest", inShelter: true, fixedTime: true,
      minutes: function (g, c, m) { return clamp(+m || 30, 5, 240); },
      run: function (g, c) { return c.G.shelterHere(g, c.sc) ? "You rest in the shelter." : "You sit and rest."; } },
    { id: "sleep", name: "Sleep", verbs: ["sleep", "go to sleep", "lie down", "nap", "get some sleep"], args: "hours", act: "sleep", inShelter: true, fixedTime: true,
      minutes: function (g, c, h) {
        if (+h) return clamp(+h * 60, 30, 720);
        var toDawn = c.w.dark ? require_clock().minutesUntil(c.sc, g.min, c.sc.sunrise) + 30 : 120;
        return clamp(toDawn, 30, 840);
      },
      run: function (g, c) {
        var d = Body.describe(g.body);
        return d.temp === "OK" ? "You sleep, and wake stiff but rested." : d.temp === "COLD" ? "You sleep in fits, waking cold." : "You barely sleep. The cold wakes you again and again.";
      } },
    { id: "dry_by_fire", name: "Dry off by the fire", verbs: ["dry clothes", "dry off", "warm up", "warm by fire", "dry by fire"], minutes: 60, act: "rest", fixedTime: true,
      need: function (g, c) { return c.G.fireBurning(g) ? null : "You need a fire."; },
      run: function (g) { return g.body.wetPct > 20 ? "You turn slowly in front of the fire. Steam lifts off your jeans." : "You sit close to the fire, warm through for the first time in a while."; } },
    { id: "treat_cut", name: "Clean the cut", verbs: ["treat cut", "clean cut", "wash wound", "clean wound", "bandage"], minutes: 10,
      need: function (g, c) {
        var cut = g.body.injuries.filter(function (i) { return i.kind === "CUT HAND" && !i.cleaned && !i.healed; })[0];
        if (!cut) return "You have no cut that needs cleaning.";
        return res(c, "water") || (g.bowl && g.bowl.litres) ? null : "You need water to wash it.";
      },
      run: function (g) { g.body.injuries.forEach(function (i) { if (i.kind === "CUT HAND") i.cleaned = true; }); return "You wash the cut until it runs clean and press it closed."; } },

    // ---- signals ----
    { id: "build_signal", name: "Build a signal fire", verbs: ["signal fire", "build signal fire", "build a signal fire", "smoke signal"], minutes: 60,
      need: function (g, c) { if (!c.zone.open) return "Nobody would see smoke through the trees here. You need open sky."; if (g.signals.pile === g.zone) return "Your signal fire is already built here.";
        if (c.G.near(g, "fuel") < 2) return "You need two armloads of firewood here."; return c.G.near(g, "boughs") >= 2 ? null : "You need green boughs for smoke: two armfuls here."; },
      run: function (g, c) { c.G.useNear(g, "fuel", 2); c.G.useNear(g, "boughs", 2); g.signals.pile = g.zone;
        return "You build a tall cone of dry wood with green boughs stacked ready beside it. Lit, it will throw thick white smoke."; } },
    { id: "light_signal", name: "Light the signal fire", verbs: ["light signal", "light signal fire", "signal", "make smoke"], minutes: 5, fixedTime: true,
      need: function (g, c) { if (g.signals.pile !== g.zone) return "There's no signal fire built here."; return c.G.fireAt(g, g.zone) !== "none" ? null : "You need flame or coals here to light it."; },
      run: function (g) { g.signals.pile = null; g.signals.smoke.push(g.min); return "You push burning sticks into the signal fire. It roars up, and you smother it with green boughs. A thick white column climbs above the trees."; } },
    { id: "make_marker", name: "Mark the clearing", verbs: ["make marker", "mark clearing", "sos", "make sos", "ground signal", "make an x"], minutes: 90,
      need: function (g, c) { if (!c.zone.open) return "A marker needs open ground where it can be seen from the air."; return g.signals.marker ? "Your marker is already laid out." : null; },
      run: function (g) { g.signals.marker = g.zone; return "You drag deadfall and stones into a huge X in the open. From the air it would be hard to miss."; } }
  ];

  function require_clock() { return node ? require("./clock.js") : root.SURVIVAL.clock; }

  function feed(g, c, lead) {
    var f = g.fires[g.zone], G = c.G;
    var n = Math.min(G.near(g, "fuel"), 2);
    if (!n && G.has(g, "kindling")) { G.add(g, "kindling", -1); f.fuelMin += G.FIRE.KINDLING_MIN; f.emberMin = 0; return (lead + " You feed it the last kindling. It needs real wood soon.").trim(); }
    if (!n) return (lead + " You have no firewood here to keep it going.").trim();
    G.useNear(g, "fuel", n);
    f.fuelMin += n * G.FIRE.ARMLOAD_MIN * (1 - 0.3 * g.damp.fuel); f.emberMin = 0;
    return (lead + " You feed it " + plural(n, "armload", "armloads") + " of wood" + (g.damp.fuel > 0.4 ? "; it hisses and smokes" : "") + ".").trim();
  }

  var byId = {};
  list.forEach(function (d) { byId[d.id] = d; });

  var api = { list: list, byId: byId, fireChance: fireChance, lookText: lookText };
  if (node) module.exports = api;
  else { root.SURVIVAL = root.SURVIVAL || {}; root.SURVIVAL.actions = api; }
})(this);
