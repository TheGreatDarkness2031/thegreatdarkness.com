/* SURVIVAL page (design section 7-8): screens, saving, away time.
   The engine decides everything; this file only shows it and passes choices in.
   Save: localStorage "survival.save.v1" = { game, savedAt } after every action. */
(function () {
  "use strict";
  var S = window.SURVIVAL, G = S.game, SS = S.session, P = S.parser, W = S.world, K = S.clock;
  var SAVE_KEY = "survival.save.v1", BEST_KEY = "survival.best.v1";
  var $ = function (id) { return document.getElementById(id); };
  var game = null, sc = null, suggestions = [], abandonArmed = false, playStartedAt = Date.now();
  var SCEN_KEY = "survival.scenario.v1", ORDER = ["treeline", "highbasin", "wrackline"];
  var picked = (function () { try { var v = localStorage.getItem(SCEN_KEY); return ORDER.indexOf(v) >= 0 ? v : "treeline"; } catch (e) { return "treeline"; } })();
  var TREELINE_INTRO = "You wake in leaf litter at the edge of a clearing in a hardwood forest, late October. A T-shirt, a hoodie, jeans, sneakers, a wool blanket. Nothing in your pockets. Someone will report you missing. Stay alive until they find you.";

  // The world outside: /data/signals.json (built by the Publish site workflow).
  // Read now and then; folded into the game without a word about where it came from.
  var signals = null;
  function fetchSignals(then) {
    if (!window.fetch || !S.frictions) { if (then) then(); return; }
    fetch("/data/signals.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { signals = j; if (then) then(); }, function () { if (then) then(); });
  }
  function useSignals() {
    if (!game || game.over || !signals || !S.frictions) return;
    if (S.frictions.apply(game, sc, signals, Date.now()).length) save();
  }

  function scenarioOf(id) { return S.scenarios[id] || S.scenarios.treeline; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---- saving ----
  function save() {
    if (!game) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ game: game, savedAt: Date.now() })); } catch (e) { /* storage full or blocked: play on */ }
  }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); return s && s.game && s.game.v === 1 ? s : null; } catch (e) { return null; }
  }
  function bestRuns() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || "[]"); } catch (e) { return []; } }
  function recordRun(ep) {
    var runs = bestRuns();
    runs.push({ at: Date.now(), scenario: game.scenario, level: game.level, result: ep.title, hours: ep.hours, score: ep.score });
    runs.sort(function (a, b) { return b.score - a.score; });
    try { localStorage.setItem(BEST_KEY, JSON.stringify(runs.slice(0, 20))); } catch (e) { /* ignore */ }
  }

  // ---- screens ----
  function show(id) { ["titleScreen", "playScreen", "endScreen"].forEach(function (s) { $(s).hidden = s !== id; }); }

  function titleScreen() {
    show("titleScreen");
    var saved = load();
    var live = saved && !saved.game.over;
    $("continueBox").hidden = !live;
    $("abandonNote").hidden = !live;
    if (live) {
      var s2 = scenarioOf(saved.game.scenario);
      $("continueInfo").textContent = "  " + s2.name + " // " + s2.levels[saved.game.level].name + " // " + K.label(s2, saved.game.min);
    }
    var sbox = $("scenarios");
    sbox.innerHTML = "";
    ORDER.forEach(function (id) {
      var s1 = S.scenarios[id]; if (!s1) return;
      var b = document.createElement("button");
      b.textContent = (s1.number || 1) + " // " + s1.name;
      b.setAttribute("aria-pressed", id === picked ? "true" : "false");
      b.addEventListener("click", function () { picked = id; try { localStorage.setItem(SCEN_KEY, id); } catch (e) { /* ignore */ } abandonArmed = false; titleScreen(); });
      sbox.appendChild(b);
    });
    var sc1 = scenarioOf(picked), box = $("levels");
    $("scenTitle").textContent = "SCENARIO " + (sc1.number || 1) + " // " + sc1.name;
    $("scenIntro").textContent = (sc1.intro || TREELINE_INTRO) + (sc1.intro ? " Someone will report you missing. Stay alive until they find you." : "");
    box.innerHTML = "";
    Object.keys(sc1.levels).forEach(function (k) {
      var L = sc1.levels[k], b = document.createElement("button");
      b.innerHTML = "<b>" + esc(L.name) + "</b><span class='time'>" + (L.hidden ? "RESCUE: UNKNOWN" : "RESCUE BY HOUR " + L.rescueH) + "</span><br>" + esc(L.blurb);
      b.addEventListener("click", function () { newGame(picked, k, b); });
      box.appendChild(b);
    });
    var runs = bestRuns();
    $("bestPanel").hidden = !runs.length;
    $("bestTable").innerHTML = "<tr><th>SCORE</th><th>RESULT</th><th>SCENARIO</th><th>LEVEL</th><th>HOURS</th></tr>" + runs.slice(0, 8).map(function (r) {
      var s3 = scenarioOf(r.scenario);
      return "<tr><td>" + r.score + "</td><td>" + esc(r.result) + "</td><td>" + esc(s3.name) + "</td><td>" + esc(s3.levels[r.level] ? s3.levels[r.level].name : r.level) + "</td><td>" + r.hours + "</td></tr>";
    }).join("");
  }

  function newGame(scenarioId, level, btn) {
    var saved = load();
    if (saved && !saved.game.over && !abandonArmed) {
      abandonArmed = true;
      btn.querySelector(".time").textContent = "TAP AGAIN TO ABANDON YOUR CURRENT GAME";
      return;
    }
    abandonArmed = false;
    sc = scenarioOf(scenarioId);
    game = G.newGame(sc, W.newSeed(), level);
    game.flags.signalsAt = Date.now() - S.frictions.MIN_REAL_GAP_MS + 30 * 60 * 1000;   // first look half an hour in
    game.flags.signalsMin = 0;
    save();
    play();
  }

  function play(awayResult) {
    show("playScreen");
    $("awayBox").hidden = true;
    if (awayResult && awayResult.minutes > 0) showAway(awayResult);
    render();
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) $("cmd").focus();
  }

  function showAway(r) {
    $("awayBox").hidden = false;
    $("awayTitle").textContent = "WHILE YOU WERE AWAY: " + Math.round(r.minutes / 6) / 10 + " HOURS PASSED OUT THERE";
    $("awayLines").innerHTML = (r.journal || []).map(function (j) {
      return "<div><span class='t'>" + esc(K.label(sc, j.min)) + "</span>" + esc(j.text) + "</div>";
    }).join("") || "<div>Nothing happened.</div>";
  }

  // ---- drawing ----
  function wordClass(w) { return /^(OK|DRY|RESTED|NONE)$/.test(w) ? "ok" : /SEVERE|HYPOTHERMIC|SOAKED|STARVING|WASTING|SPENT|DEHYDRATED/.test(w) ? "bad" : "warn"; }

  function render() {
    if (game.over) return endScreen();
    var world = W.newWorld(sc, game.seed);
    $("topLine").textContent = W.topLine(world, game.zone, game.min);
    $("searchLine").textContent = sc.name + " // " + G.levelOf(game, sc).name + " // " + SS.searchLine(game, sc);
    var st = G.status(game, sc);
    var rows = [["WATER", st.water], ["FOOD", st.food], ["BODY TEMP", st.temp + " (" + st.bodyF + ")"], ["WET", st.wet], ["FATIGUE", st.sleep],
      ["INJURIES", st.injuries.length ? st.injuries.join(", ") : "NONE"], ["FIRE", st.fire], ["CARRYING", st.carrying]];
    $("status").innerHTML = rows.map(function (r) {
      var cls = r[0] === "CARRYING" || r[0] === "FIRE" ? "" : wordClass(r[1].split(" (")[0]);
      return "<span class='k'>" + r[0] + "</span><span class='" + cls + "'>" + esc(r[1]) + "</span>";
    }).join("");
    $("situation").textContent = SS.situation(game, sc);
    suggestions = SS.suggestions(game, sc);
    $("acts").innerHTML = suggestions.map(function (s, i) {
      return "<li><button data-i='" + i + "'><span class='n'>" + (i + 1) + ".</span>" + esc(s.label) + (s.minutes ? "<span class='m'>" + fmtMin(s.minutes) + "</span>" : "") + "</button></li>";
    }).join("");
    renderOrder();
    renderJournal($("tab-journal"), 60);
    $("tab-inventory").innerHTML = "<ul class='plain'>" + SS.inventory(game).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    $("tab-map").innerHTML = "<ul class='plain'>" + SS.map(game, sc).map(function (m) {
      return "<li>" + (m.here ? "<span class='ok'>YOU ARE HERE: </span>" : "") + esc(m.name) + (m.here ? "" : " (" + fmtMin(m.minutes) + ")") + (m.notes ? " // " + esc(m.notes) : "") + "</li>";
    }).join("") + "</ul><p class='tag'>You only know the places you have seen or found. Look around and explore to find more.</p>";
    $("tab-help").innerHTML = "<ul class='plain'>" + P.HELP.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "</ul>";
  }

  function renderJournal(el, n) {
    var j = game.journal.slice(-n);
    el.innerHTML = j.map(function (e) {
      return "<div class='" + (e.away ? "away" : "") + "'><span class='t'>" + esc(K.label(sc, e.min)) + "</span>" + esc(e.text) + "</div>";
    }).join("");
    el.scrollTop = el.scrollHeight;
  }

  function renderOrder() {
    var sel = $("order");
    if (!sel.options.length) Object.keys(SS.ORDERS).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = SS.ORDERS[k].name; sel.appendChild(o); });
    sel.value = game.order || "REST";
    $("orderBlurb").textContent = SS.ORDERS[sel.value].blurb;
  }

  function fmtMin(m) { return m >= 60 ? Math.floor(m / 60) + " H" + (m % 60 ? " " + (m % 60) + " MIN" : "") : m + " MIN"; }

  function endScreen() {
    show("endScreen");
    var ep = SS.epilogue(game, sc);
    if (!game.recorded) { game.recorded = true; recordRun(ep); save(); }
    $("endTitle").textContent = ep.title + " // " + sc.name + " // " + ep.level;
    $("endTitle").className = ep.title === "RESCUED" ? "ok" : "bad";
    $("endLines").innerHTML = ep.lines.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("");
    $("endScore").textContent = "SCORE " + ep.score;
    var list = function (title, items) { return items.length ? "<h2>" + title + "</h2><ul class='plain'>" + items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" : ""; };
    $("endRight").innerHTML = list("WHAT WENT RIGHT", ep.right);
    $("endWrong").innerHTML = list("WHAT WENT WRONG", ep.wrong);
    $("endAfter").innerHTML = list("AFTERWARDS", ep.after);
    $("endJournal").hidden = true;
  }

  // ---- acting ----
  function say(text, err) { var r = $("reply"); r.textContent = text || ""; r.className = "reply" + (err ? " err" : ""); }

  function doAction(id, arg) {
    useSignals();
    var res = G.perform(game, sc, id, arg);
    save();
    if (!res.ok) { say(res.text, true); return; }
    say("");
    render();
  }

  function onCommand(text) {
    var p = P.parse(text, game, sc);
    if (p.pick) { var s = suggestions[p.pick - 1]; if (s) doAction(s.id, s.arg); else say("There's no action " + p.pick + ".", true); return; }
    if (p.cmd) { openTab(p.cmd === "status" ? "journal" : p.cmd); if (p.cmd === "status") say(SS.situation(game, sc)); return; }
    if (p.error) { say(p.error + (p.hint ? " " + p.hint : ""), true); return; }
    doAction(p.id, p.arg);
  }

  function openTab(name) {
    document.querySelectorAll(".tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"); });
    ["journal", "inventory", "map", "help"].forEach(function (t) { $("tab-" + t).hidden = t !== name; });
  }

  // ---- away time ----
  function catchUp() {
    var saved = load();
    if (!saved || saved.game.over) return null;
    game = saved.game; sc = scenarioOf(game.scenario);
    var r = SS.applyAway(game, sc, saved.savedAt, Date.now());
    useSignals();
    save();
    return r;
  }

  // ---- wiring ----
  $("acts").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-i]"); if (!b) return;
    var s = suggestions[+b.dataset.i]; if (s) doAction(s.id, s.arg);
  });
  $("prompt").addEventListener("submit", function (e) { e.preventDefault(); var v = $("cmd").value; $("cmd").value = ""; if (v.trim()) onCommand(v); });
  $("order").addEventListener("change", function () { SS.setOrder(game, $("order").value); save(); renderOrder(); });
  document.querySelectorAll(".tabs button").forEach(function (b) { b.addEventListener("click", function () { openTab(b.dataset.tab); }); });
  $("awayClose").addEventListener("click", function () { $("awayBox").hidden = true; });
  $("newGameBtn").addEventListener("click", function () { save(); titleScreen(); });
  $("againBtn").addEventListener("click", function () { titleScreen(); });
  $("continueBtn").addEventListener("click", function () { var r = catchUp(); play(r); });
  $("endJournalBtn").addEventListener("click", function () { var el = $("endJournal"); el.hidden = !el.hidden; if (!el.hidden) renderJournal(el, 100000); });
  $("helpLink").addEventListener("click", function (e) { e.preventDefault(); if (!$("playScreen").hidden) openTab("help"); else $("titleScreen").scrollIntoView(); });

  // Coming back to the tab after a while counts as away time.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { save(); return; }
    if (!game || game.over || $("playScreen").hidden) return;
    var r = catchUp();
    play(r);
  });

  // Start: straight back into a game in progress, else the title screen.
  fetchSignals(useSignals);
  setInterval(function () { fetchSignals(useSignals); }, S.frictions ? S.frictions.MIN_REAL_GAP_MS / 3 : 3600000);
  var saved = load();
  if (saved && !saved.game.over) { var r = catchUp(); play(r); }
  else if (saved && saved.game.over) { game = saved.game; sc = scenarioOf(game.scenario); titleScreen(); }
  else titleScreen();
})();
