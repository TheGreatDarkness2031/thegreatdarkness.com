/* OER RADAR: contacts from the monitors that check on Supabase (2026-11-24).
   The real power grid check runs on Supabase (grid-check). Once the switch is
   on, Apps Script stops writing its Radar_v2 rows and the Radar pages take the
   contacts from here: one read through the OER DATA RELAY (?sb=grid, a 60 s
   copy), straight from Supabase if the relay fails. oerRadarMerge(data) adds
   them to a Radar answer, skipping any contact the answer already has (same
   source + ck), so while Apps Script still writes the rows nothing changes.
   Switch-over: ON = true here, then Config powergrid_real_radar_rows NO.
   Preview before that: add ?sbradar=1 to /radar/ or /floor/.
   Needs /assets/config.js (TGD_CACHE_URL) first. */
(function() {
  "use strict";

  var ON = false;
  var READS = [
    // sb read, Radar source id, event type, most contacts shown (Config *_Radar_max_contacts_per_run)
    { sb: "grid", rpc: "grid_radar", source: "EIA", eventType: "POWER_GRID", max: 3 }
  ];
  var SB_URL = "https://lshgovxyhbaznshylzhq.supabase.co/rest/v1/rpc/";
  var SB_KEY = "sb_publishable_gy85z3j_jLrWu1xPluTOrg_n8AJ_fb-"; // public by design (reads only)
  var EVERY_MS = 60000;
  var LIT_SECONDS = 20 * 60;   // grid_radar lists contacts seen in the last 20 minutes

  var on = ON || /[?&]sbradar=1(&|$)/.test(String(window.location && window.location.search || ""));
  var got = {};        // sb -> { at, contacts }
  var counter = 0;

  function severity(status) {
    return [1, 2, 4, 5][["NOMINAL", "WATCH", "ELEVATED", "CRITICAL"].indexOf(String(status || "").toUpperCase())] || 1;
  }

  function light(source) {
    var reg = window.OER_SOURCE_REGISTER;
    var lights = (reg && reg.lights) || [];
    for (var i = 0; i < lights.length; i++) {
      if (lights[i].id === source) return lights[i];
    }
    return { label: source, color: "#FFFFFF" };
  }

  // One Supabase contact -> the Radar answer's contact shape (RadarCore.js).
  function toRadar(read, c, now) {
    var seen = Date.parse(c.last_seen) || now;
    var first = Date.parse(c.first_seen) || seen;
    var age = Math.max(0, (now - seen) / 1000);
    var l = light(read.source);
    var data = {};
    var d = c.data || {};
    Object.keys(d).forEach(function(k) { data[k] = d[k]; });
    data.v = 1;
    data.ck = c.ck;
    data.stayLit = 1;
    data.label = String(c.label || "").substring(0, 120);
    data.rows = (c.rows || []).slice(0, 8);
    return {
      id: c.id, x: Number(c.point && c.point.x), y: Number(c.point && c.point.y),
      duration: LIT_SECONDS, createdAt: seen, source: read.source, birthAt: seen,
      anomalyProcessed: "processed", radarSeverity: severity(c.status), sourceEventAt: first,
      eventType: read.eventType, sourceStatus: String(c.status || "").toUpperCase(),
      eventData: JSON.stringify(data), sourceId: read.source, sourceLabel: l.label, sourceColor: l.color,
      isBackground: false, ageSeconds: age, remainingSeconds: Math.max(0, LIT_SECONDS - age),
      fromSupabase: true
    };
  }

  function steadyKey(c) {
    try {
      var ed = typeof c.eventData === "string" ? JSON.parse(c.eventData) : c.eventData;
      return (c.sourceId || c.source) + "|" + (ed && ed.ck ? ed.ck : c.id);
    } catch (e) {
      return (c.sourceId || c.source) + "|" + c.id;
    }
  }

  // Pure (tests/test_radar_merge.js): Radar answer + Supabase reads -> answer.
  function merge(data, reads, now) {
    if (!data || !Array.isArray(data.contacts)) return data;
    var have = {};
    data.contacts.forEach(function(c) { have[steadyKey(c)] = true; });
    var extra = [];
    READS.forEach(function(read) {
      var r = reads[read.sb];
      if (!r || !Array.isArray(r.contacts)) return;
      r.contacts
        .map(function(c) { return toRadar(read, c, now); })
        .filter(function(c) { return c.remainingSeconds > 0 && isFinite(c.x) && isFinite(c.y) && !have[steadyKey(c)]; })
        .sort(function(a, b) { return b.radarSeverity - a.radarSeverity; })
        .slice(0, read.max)
        .forEach(function(c) { extra.push(c); });
    });
    if (!extra.length) return data;
    var out = {};
    Object.keys(data).forEach(function(k) { out[k] = data[k]; });
    out.contacts = data.contacts.concat(extra);
    return out;
  }

  function loadDirect(read) {
    if (typeof fetch !== "function") return;
    fetch(SB_URL + read.rpc, { headers: { apikey: SB_KEY, accept: "application/json" } })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(v) { if (v && Array.isArray(v.contacts)) got[read.sb] = { at: Date.now(), contacts: v.contacts }; })
      .catch(function() { /* next round tries again */ });
  }

  function load(read) {
    var base = window.TGD_CACHE_URL;
    if (!base) { loadDirect(read); return; }
    var name = "oerSbRead" + (++counter);
    var script = document.createElement("script");
    var done = false;
    var finish = function(ok) {
      if (done) return;
      done = true;
      try { delete window[name]; } catch (e) { window[name] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      if (!ok) loadDirect(read);
    };
    window[name] = function(v) {
      if (v && Array.isArray(v.contacts)) got[read.sb] = { at: Date.now(), contacts: v.contacts };
      finish(true);
    };
    script.onerror = function() { finish(false); };
    setTimeout(function() { finish(false); }, 15000);
    script.src = base + "?sb=" + encodeURIComponent(read.sb) + "&callback=" + name;
    (document.head || document.documentElement).appendChild(script);
  }

  function round() {
    if (document.hidden) return;
    READS.forEach(load);
  }

  window.oerRadarMerge = function(data) {
    return on ? merge(data, got, Date.now()) : data;
  };
  window.oerRadarMergeTest = { merge: merge, toRadar: toRadar, READS: READS };

  if (on) {
    round();
    setInterval(round, EVERY_MS);
    document.addEventListener("visibilitychange", function() { if (!document.hidden) round(); });
  }
})();
