// OER // EVENT CORRELATION MAP (/map/, owner 2026-11-28): every contact the
// Event Log logged, on a US outline (Alaska and Hawaii as insets), by day or
// by week. Colours are the Radar's (Source Register), sizes by level,
// same-source contacts close together stack with a count. Space weather,
// near-earth objects and GPS have no place on the map: their worst level
// colours the frame and shows in the ORBITAL band.
// Data: Supabase rpc event_map(from, to) with the publishable key (reads only).
(function () {
  "use strict";

  var SB = "https://lshgovxyhbaznshylzhq.supabase.co/rest/v1/rpc/event_map";
  var SB_KEY = "sb_publishable_gy85z3j_jLrWu1xPluTOrg_n8AJ_fb-"; // public by design (reads only)
  var W = 975, H = 610, K = 1300;
  var LEVELS = ["NOMINAL", "WATCH", "ELEVATED", "CRITICAL"];
  var LEVEL_COLOR = ["#00c000", "#ffd000", "#ff8c00", "#ff3030"];
  var RADIUS = [2.6, 4.6, 6.8, 9.5];
  var D2R = Math.PI / 180;

  // ---------- projection: d3-geo's geoAlbersUsa, scale 1300, 975 x 610 ----------
  function conic(rotateLon, centerLon, centerLat, p0, p1, k, tx, ty) {
    var s0 = Math.sin(p0 * D2R), n = (s0 + Math.sin(p1 * D2R)) / 2;
    var c = 1 + s0 * (2 * n - s0), r0 = Math.sqrt(c) / n;
    function raw(l, p) {
      var r = Math.sqrt(c - 2 * n * Math.sin(p)) / n;
      return [r * Math.sin(l * n), r0 - r * Math.cos(l * n)];
    }
    var cc = raw(centerLon * D2R, centerLat * D2R);
    return function (lon, lat) {
      var l = lon + rotateLon;
      while (l > 180) l -= 360;
      while (l < -180) l += 360;
      var p = raw(l * D2R, lat * D2R);
      return [tx + k * (p[0] - cc[0]), ty - k * (p[1] - cc[1])];
    };
  }
  var LOWER48 = conic(96, -0.6, 38.7, 29.5, 45.5, K, W / 2, H / 2);
  var ALASKA = conic(154, -2, 58.5, 55, 65, K * 0.35, W / 2 - 0.307 * K, H / 2 + 0.201 * K);
  var HAWAII = conic(157, -3, 19.9, 8, 18, K, W / 2 - 0.205 * K, H / 2 + 0.212 * K);

  // [x, y] on the map, or null (outside the US layout: territories, abroad).
  function project(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (lat >= 51 && (lon < -129 || lon > 170)) return ALASKA(lon, lat);        // Alaska (Aleutians past 180 too)
    if (lat >= 50 && lat < 51 && lon < -160) return ALASKA(lon, lat);
    if (lat > 18 && lat < 23 && lon < -154 && lon > -161) return HAWAII(lon, lat);
    if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) return LOWER48(lon, lat);
    return null;
  }

  // Older rows (before contacts saved lat / lon, 2026-11-28): the Radar point
  // back to a rough location (inverse of getTgdRadarPointFromLatLon_). The
  // Radar's rim spots for Alaska / Hawaii / territories have no real place.
  function fromRadar(pt) {
    if (!pt || !isFinite(pt.x) || !isFinite(pt.y)) return null;
    // The fixed rim spots (Alaska 25,13 // Hawaii 30,87 // Guam 12,62 // Puerto Rico 84,73,
    // each nudged by up to 1.2) are not places: no position.
    var RIM = [[25, 13], [30, 87], [12, 62], [84, 73]];
    for (var i = 0; i < RIM.length; i++) if (Math.abs(pt.x - RIM[i][0]) <= 1.5 && Math.abs(pt.y - RIM[i][1]) <= 1.5) return null;
    var lat = 47.6 - (pt.y - 18) / 3.2, lon = (pt.x - 18) / 1.29 - 122;
    if (lat > 50 || lat < 24 || lon < -125 || lon > -66) return null;
    return { lat: lat, lon: lon };
  }

  function rank(s) { var i = LEVELS.indexOf(String(s || "").toUpperCase()); return i < 0 ? 0 : i; }

  // Contacts -> marks (one per contact key, its worst level) -> stacks.
  function buildMarks(contacts, dayOf) {
    var marks = {}, placed = 0, unplaced = 0;
    (contacts || []).forEach(function (c) {
      var ll = c.lat !== null && c.lat !== undefined ? { lat: c.lat, lon: c.lon } : fromRadar(c.pt);
      var xy = ll && project(ll.lat, ll.lon);
      if (!xy) { unplaced++; return; }
      var key = c.src + "|" + c.ck, r = rank(c.st), day = dayOf ? dayOf(c.at) : 0;
      var m = marks[key];
      if (!m) { marks[key] = m = { src: c.src, ck: c.ck, r: r, x: xy[0], y: xy[1], label: c.label, at: c.at, day: day, items: 0 }; placed++; }
      if (r > m.r) { m.r = r; m.label = c.label || m.label; }
      if (day > m.day) m.day = day;
      m.items++;
    });
    return { marks: Object.keys(marks).map(function (k) { return marks[k]; }), placed: placed, unplaced: unplaced };
  }

  function stackMarks(marks, near) {
    near = near || 6;
    var stacks = [];
    marks.slice().sort(function (a, b) { return b.r - a.r || b.day - a.day; }).forEach(function (m) {
      for (var i = 0; i < stacks.length; i++) {
        var s = stacks[i];
        if (s.src === m.src && Math.abs(s.x - m.x) < near && Math.abs(s.y - m.y) < near) { s.list.push(m); if (m.day > s.day) s.day = m.day; return; }
      }
      stacks.push({ src: m.src, x: m.x, y: m.y, r: m.r, day: m.day, list: [m] });
    });
    return stacks;
  }

  // ---------- facility day (America/Chicago) without time zone tables ----------
  function nthSunday(year, month, n) {          // month 0-based; UTC date of the nth Sunday
    var d = new Date(Date.UTC(year, month, 1));
    var first = (7 - d.getUTCDay()) % 7;
    return 1 + first + (n - 1) * 7;
  }
  // UTC instant of 00:00 facility time on y-m-d (US rule since 2007: CDT from
  // the 2nd Sunday of March 02:00 to the 1st Sunday of November 02:00).
  function facilityMidnight(y, m, d) {
    var dstStart = Date.UTC(y, 2, nthSunday(y, 2, 2)), dstEnd = Date.UTC(y, 10, nthSunday(y, 10, 1));
    var day = Date.UTC(y, m, d);
    // Midnight on the change day is still the old time (the clocks move at 02:00).
    var off = day > dstStart && day <= dstEnd ? 5 : 6;   // hours behind UTC at midnight
    return day + off * 3600000;
  }
  function facilityToday(now) {
    var t = now || Date.now();
    for (var back = 0; back < 3; back++) {
      var u = new Date(t - back * 86400000);
      var start = facilityMidnight(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
      if (start <= t) return isoDay(u);
    }
    return isoDay(new Date(t));
  }
  function isoDay(d) { return d.toISOString().slice(0, 10); }
  function parseDay(s) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(s || "")); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
  function addDays(s, n) { var d = parseDay(s); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); }
  function dayStart(s) { var d = parseDay(s); return facilityMidnight(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function dayLabel(s) { var d = parseDay(s); return String(d.getUTCDate()).padStart(2, "0") + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }

  var api = { project: project, fromRadar: fromRadar, buildMarks: buildMarks, stackMarks: stackMarks, facilityMidnight: facilityMidnight, facilityToday: facilityToday, addDays: addDays, dayStart: dayStart, rank: rank };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ---------- page ----------
  var $ = function (id) { return document.getElementById(id); };
  var SRC = {};
  ((window.OER_SOURCE_REGISTER && window.OER_SOURCE_REGISTER.lights) || []).forEach(function (s, i) { SRC[s.id] = { label: s.label, color: s.color, order: i }; });
  var NS = "http://www.w3.org/2000/svg";
  var state = { range: "day", day: null, data: null, playing: null, upto: null, hidden: {}, view: { x: 0, y: 0, w: W, h: H } };

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function readParams() {
    var q = new URLSearchParams(location.search);
    var today = facilityToday();
    var d = q.get("day");
    state.day = d && parseDay(d) && d <= today ? d : today;
    state.range = q.get("range") === "week" ? "week" : "day";
  }
  function writeParams() {
    var q = new URLSearchParams();
    if (state.day !== facilityToday()) q.set("day", state.day);
    if (state.range === "week") q.set("range", "week");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
  }
  function days() {
    var n = state.range === "week" ? 7 : 1, out = [];
    for (var i = n - 1; i >= 0; i--) out.push(addDays(state.day, -i));
    return out;
  }

  function load() {
    var list = days();
    var from = dayStart(list[0]), to = Math.min(dayStart(addDays(list[list.length - 1], 1)), Date.now() + 60000);
    $("mapStatus").textContent = "RETRIEVING EVENT LOG...";
    $("mapWrap").classList.add("loading");
    var ask = { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() };
    var key = state.range + "|" + state.day;
    fetch(SB, { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(ask) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        if (key !== state.range + "|" + state.day) return;
        state.data = data; state.upto = null; draw();
      })
      .catch(function () {
        $("mapStatus").textContent = "EVENT LOG UNREACHABLE. TRY AGAIN SHORTLY.";
        $("mapWrap").classList.remove("loading");
      });
  }

  function dayIndexOf(list) {
    var starts = list.map(dayStart);
    return function (at) {
      var t = Date.parse(at), i = 0;
      while (i + 1 < starts.length && t >= starts[i + 1]) i++;
      return i;
    };
  }

  function draw() {
    var list = days(), data = state.data || { contacts: [], space: [] };
    var upto = state.upto === null ? list.length - 1 : state.upto;
    var dayOf = dayIndexOf(list);
    var contacts = (data.contacts || []).filter(function (c) { return dayOf(c.at) <= upto && !state.hidden[c.src]; });
    var built = buildMarks(contacts, dayOf);
    var z = W / state.view.w;                       // zoom: dots, text and stacking keep their screen size
    var stacks = stackMarks(built.marks, 6 / z);
    var all = buildMarks((data.contacts || []).filter(function (c) { return dayOf(c.at) <= upto; }), dayOf).marks;

    // space band + frame
    var shown = list.slice(0, upto + 1);
    var worst = { spacewx: 0, neo: 0, gps: 0 };
    (data.space || []).forEach(function (s) { if (shown.indexOf(s.day) >= 0 && s.worst > worst[s.p]) worst[s.p] = s.worst; });
    var frame = LEVEL_COLOR[Math.max(worst.spacewx, worst.neo)];
    $("mapFrame").style.borderColor = frame;
    $("mapFrame").style.boxShadow = "0 0 16px " + frame + "55, inset 0 0 26px " + frame + "1f";
    [["skySpace", "spacewx"], ["skyNeo", "neo"], ["skyGps", "gps"]].forEach(function (x) {
      var e = $(x[0]); e.textContent = LEVELS[worst[x[1]]]; e.className = "lv lv" + worst[x[1]];
    });

    // blips
    var g = $("blips");
    while (g.firstChild) g.removeChild(g.firstChild);
    stacks.sort(function (a, b) { return a.r - b.r; }).forEach(function (s) {
      var col = (SRC[s.src] || {}).color || "#cccccc";
      var age = upto - s.day, fade = state.range === "week" ? Math.max(0.28, 1 - age * 0.12) : 1;
      var rad = (RADIUS[s.r] + (s.list.length > 1 ? Math.min(4, Math.log(s.list.length) / Math.LN2 * 1.4) : 0)) / z;
      var b = el("g", { "class": "blip", tabindex: "0", role: "img", "aria-label": (SRC[s.src] || {}).label + ": " + s.list.length + " contact" + (s.list.length > 1 ? "s" : "") + ", " + LEVELS[s.r] }, g);
      b.style.opacity = fade;
      el("circle", { cx: s.x.toFixed(1), cy: s.y.toFixed(1), r: (rad * 2.3).toFixed(2), fill: col, opacity: "0.11" }, b);
      el("circle", { cx: s.x.toFixed(1), cy: s.y.toFixed(1), r: rad.toFixed(2), fill: col, opacity: "0.88" }, b);
      if (s.r >= 3) el("circle", { cx: s.x.toFixed(1), cy: s.y.toFixed(1), r: (rad + 5 / z).toFixed(2), fill: "none", stroke: col, "stroke-width": (1.2 / z).toFixed(3), "class": "crit" }, b);
      if (s.list.length > 1) { var t = el("text", { x: (s.x + rad + 2 / z).toFixed(2), y: (s.y - rad).toFixed(2), "class": "n", "font-size": (10 / z).toFixed(2) }, b); t.textContent = s.list.length; }
      var show = function () { showStack(s); };
      b.addEventListener("mouseenter", function () { if (!drag) show(); }); b.addEventListener("focus", show);
      b.addEventListener("click", function () { if (!moved) show(); });
    });

    // legend (click a source to hide / show it)
    var counts = {};
    all.forEach(function (m) { counts[m.src] = (counts[m.src] || 0) + 1; });
    var lg = $("legend");
    lg.innerHTML = "";
    Object.keys(counts).sort(function (a, b) { return ((SRC[a] || {}).order || 99) - ((SRC[b] || {}).order || 99); }).forEach(function (k) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "lg" + (state.hidden[k] ? " off" : "");
      btn.setAttribute("aria-pressed", state.hidden[k] ? "false" : "true");
      btn.innerHTML = '<i style="background:' + ((SRC[k] || {}).color || "#ccc") + '"></i>' + ((SRC[k] || {}).label || k) + " <b>" + counts[k] + "</b>";
      btn.onclick = function () { state.hidden[k] = !state.hidden[k]; draw(); };
      lg.appendChild(btn);
    });
    var byLevel = [0, 0, 0, 0];
    all.forEach(function (m) { byLevel[m.r]++; });
    $("levels").innerHTML = LEVELS.map(function (n, i) { return '<span class="lv' + i + '">' + n + " " + byLevel[i] + "</span>"; }).join("");

    var span = list.length > 1 ? dayLabel(list[0]) + " - " + dayLabel(list[list.length - 1]) : dayLabel(list[0]);
    $("mapRange").textContent = span + (state.upto !== null && state.upto < list.length - 1 ? " // PLAYBACK " + dayLabel(list[upto]) : "");
    $("mapStatus").textContent = all.length + " CONTACTS" + (built.unplaced ? " // " + built.unplaced + " WITHOUT A MAP POSITION" : "") +
      (state.day === facilityToday() ? " // DAY IN PROGRESS" : "");
    $("mapWrap").classList.remove("loading");
    $("playBtn").hidden = state.range !== "week";
    $("dayInput").value = state.day;
    $("nextBtn").disabled = state.day >= facilityToday();
    [].forEach.call(document.querySelectorAll("[data-range]"), function (b) { b.classList.toggle("on", b.getAttribute("data-range") === state.range); });
  }

  // ---------- zoom (wheel, drag, double-click, pinch, buttons, + - 0 keys) ----------
  var MAX_ZOOM = 12, drag = null, moved = false, pointers = {}, pinch = null, redraw = 0;
  function setView(v) {
    var w = Math.min(W, Math.max(W / MAX_ZOOM, v.w)), h = w * H / W;
    var x = Math.min(W - w, Math.max(0, v.x)), y = Math.min(H - h, Math.max(0, v.y));
    state.view = { x: x, y: y, w: w, h: h };
    var svg = $("mapSvg");
    svg.setAttribute("viewBox", x.toFixed(2) + " " + y.toFixed(2) + " " + w.toFixed(2) + " " + h.toFixed(2));
    var z = W / w;
    svg.classList.toggle("zoomed", z > 1.01);
    $("zoomLevel").textContent = z > 1.01 ? "x" + (z < 10 ? z.toFixed(1) : Math.round(z)) : "";
    $("zoomOut").disabled = $("zoomReset").disabled = z <= 1.01;
    $("zoomIn").disabled = z >= MAX_ZOOM - 0.01;
    if (!redraw) redraw = requestAnimationFrame(function () { redraw = 0; draw(); });
  }
  function zoomAt(px, py, factor) {           // px, py in map units; factor > 1 = closer
    var v = state.view, w = Math.min(W, Math.max(W / MAX_ZOOM, v.w / factor)), k = w / v.w;
    setView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w: w });
  }
  function toMap(e) {
    var svg = $("mapSvg"), pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function centre() { var v = state.view; return { x: v.x + v.w / 2, y: v.y + v.h / 2 }; }
  function zoomSetup() {
    var svg = $("mapSvg");
    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      var p = toMap(e);
      zoomAt(p.x, p.y, Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1)));
    }, { passive: false });
    svg.addEventListener("dblclick", function (e) { e.preventDefault(); var p = toMap(e); zoomAt(p.x, p.y, 2); });
    svg.addEventListener("pointerdown", function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: state.view.w };
        drag = null;
      } else if (ids.length === 1 && (e.pointerType !== "touch" || W / state.view.w > 1.01)) {
        drag = { x: e.clientX, y: e.clientY, v: state.view, scale: 1 / svg.getScreenCTM().a };
        moved = false;
      }
    });
    svg.addEventListener("pointermove", function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (pinch && ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var mid = toMap({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        var want = pinch.w * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        zoomAt(mid.x, mid.y, state.view.w / want);
        return;
      }
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) { moved = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} svg.classList.add("dragging"); }
      setView({ x: drag.v.x - dx * drag.scale, y: drag.v.y - dy * drag.scale, w: drag.v.w });
    });
    var end = function (e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (!Object.keys(pointers).length) { drag = null; svg.classList.remove("dragging"); setTimeout(function () { moved = false; }, 0); }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") end(e); });
    $("zoomIn").onclick = function () { var c = centre(); zoomAt(c.x, c.y, 2); };
    $("zoomOut").onclick = function () { var c = centre(); zoomAt(c.x, c.y, 0.5); };
    $("zoomReset").onclick = function () { setView({ x: 0, y: 0, w: W }); };
    setView(state.view);
  }

  function showStack(s) {
    var box = $("detail"), name = (SRC[s.src] || {}).label || s.src;
    var rows = s.list.slice(0, 12).map(function (m) {
      return '<div class="row"><span class="lv' + m.r + '">' + LEVELS[m.r] + "</span> " + escapeHtml(m.label || m.ck) + "</div>";
    }).join("");
    box.innerHTML = '<div class="dh"><i style="background:' + ((SRC[s.src] || {}).color || "#ccc") + '"></i>' + name + " // " + s.list.length + " CONTACT" + (s.list.length > 1 ? "S" : "") + "</div>" + rows +
      (s.list.length > 12 ? '<div class="row dim">+' + (s.list.length - 12) + " MORE</div>" : "");
    box.hidden = false;
  }
  function escapeHtml(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function stopPlay() { if (state.playing) { clearInterval(state.playing); state.playing = null; } $("playBtn").textContent = "[ PLAY WEEK ]"; }
  function play() {
    if (state.playing) { stopPlay(); state.upto = null; draw(); return; }
    state.upto = 0; draw();
    $("playBtn").textContent = "[ STOP ]";
    state.playing = setInterval(function () {
      if (state.upto >= 6) { stopPlay(); state.upto = null; draw(); return; }
      state.upto++; draw();
    }, 1300);
  }

  function go(day, range) {
    stopPlay();
    if (day) state.day = day > facilityToday() ? facilityToday() : day;
    if (range) state.range = range;
    $("detail").hidden = true;
    writeParams(); load();
  }

  function start() {
    readParams();
    fetch("/map/us.json").then(function (r) { return r.json(); }).then(function (us) {
      $("nation").setAttribute("d", us.nation);
      $("states").setAttribute("d", us.states);
    });
    [].forEach.call(document.querySelectorAll("[data-range]"), function (b) { b.onclick = function () { go(null, b.getAttribute("data-range")); }; });
    $("prevBtn").onclick = function () { go(addDays(state.day, state.range === "week" ? -7 : -1)); };
    $("nextBtn").onclick = function () { go(addDays(state.day, state.range === "week" ? 7 : 1)); };
    $("dayInput").max = facilityToday();
    $("dayInput").onchange = function () { if (parseDay(this.value)) go(this.value); };
    $("playBtn").onclick = play;
    zoomSetup();
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") $("detail").hidden = true;
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "+" || e.key === "=") $("zoomIn").click();
      if (e.key === "-" || e.key === "_") $("zoomOut").click();
      if (e.key === "0") $("zoomReset").click();
    });
    load();
    // Today: refresh every 5 minutes (the monitors check every 5).
    setInterval(function () { if (state.day === facilityToday() && !state.playing && !document.hidden) load(); }, 300000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
