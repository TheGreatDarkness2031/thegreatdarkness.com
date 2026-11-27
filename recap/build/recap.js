// OER WEEKLY SUMMARY: turns one week's export (?logexport=recap) into
// the week's summary and its narration. Pure functions, no network.
// Only recorded data: counts, peaks and items come from the export as
// they are; a monitor without data says so.

"use strict";

const RANK = { NOMINAL: 0, WATCH: 1, ELEVATED: 2, CRITICAL: 3 };
const TZ = "America/Chicago";

// ---------- time ----------

function parts(ms) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
const dayName = (ms) => { const p = parts(ms); return p.weekday + " " + p.day + " " + p.month; };
const dayTime = (ms) => { const p = parts(ms); return p.weekday + " " + p.day + " " + p.month + " at " + p.hour + ":" + p.minute; };
const longDate = (ms) => { const p = parts(ms); return p.day + " " + p.month + " " + p.year; };

// ---------- summary ----------

const HISTORY_READ_LIMIT = 12000;   // RecapExport.js RECAP_HISTORY_MAX_ROWS_
const gapLimitMin = (interval) => Math.max(interval * 2.5, interval + 60);

function summarizeHistory(h, interval, from, to) {
  const rows = (h && h.rows) || [];
  const out = {
    startStatus: h && h.before ? h.before[1] : null,
    peak: null, peakAt: null, peakSummary: "",
    minutes: { NOMINAL: 0, WATCH: 0, ELEVATED: 0, CRITICAL: 0 },
    degradedMinutes: 0, missingMinutes: 0, gaps: [],
    historyStart: h && h.first !== null && h.first !== undefined ? h.first : null,
    covered: false, startedAt: null, checks: rows.length, timeline: []
  };
  out.covered = out.historyStart !== null && out.historyStart <= from && !!(h && h.before);
  // A history tab whose very first row falls inside the week (nothing
  // before it, read limit not reached): records begin that minute. The
  // week counts from there and the narration says so.
  if (!out.covered && h && !h.before && rows.length && rows.length < HISTORY_READ_LIMIT && out.historyStart >= from) {
    out.startedAt = out.historyStart;
  }

  // Peak: the status the week started with counts from the first minute.
  let summary = h && h.before ? h.before[4] : "";
  if (out.startStatus && RANK[out.startStatus] !== undefined) {
    out.peak = out.startStatus; out.peakAt = from; out.peakSummary = summary;
  }
  for (const r of rows) {
    if (r[4]) summary = r[4];
    const s = r[1];
    if (RANK[s] === undefined) continue;
    if (out.peak === null || RANK[s] > RANK[out.peak]) { out.peak = s; out.peakAt = r[0]; out.peakSummary = summary; }
  }

  // Time per status and missing stretches. A row stands until the next
  // one, but never longer than the gap limit; the rest is missing.
  const limit = gapLimitMin(interval) * 60000;
  const points = [];
  if (h && h.before) points.push([from, h.before[1], h.before[2]]);
  for (const r of rows) points.push([r[0], r[1], r[2]]);
  if (!points.length) {
    out.timeline.push([from, "MISSING"]);
    out.missingMinutes = Math.round((to - from) / 60000);
    out.gaps.push([from, to]);
    return out;
  }
  const start = out.startedAt || from;
  if (points[0][0] > start + limit) out.gaps.push([start, points[0][0]]);
  if (points[0][0] > start) out.missingMinutes += (points[0][0] - start) / 60000;
  // Timeline for the video's week strip: [startMs, state] where state is
  // a status, DEGRADED or MISSING; neighbours with the same state merged.
  const tl = out.timeline;
  const mark = (t, st) => { if (!tl.length || tl[tl.length - 1][1] !== st) tl.push([Math.round(t), st]); };
  if (points[0][0] > from) mark(from, "MISSING");
  for (let i = 0; i < points.length; i++) {
    const t = points[i][0];
    const end = i + 1 < points.length ? points[i + 1][0] : to;
    const span = Math.max(0, end - t);
    const held = Math.min(span, limit);
    mark(t, points[i][2] === "DEGRADED" ? "DEGRADED" : (out.minutes[points[i][1]] !== undefined ? points[i][1] : "MISSING"));
    if (span > limit) { out.gaps.push([t + limit, end]); out.missingMinutes += (span - limit) / 60000; mark(t + limit, "MISSING"); }
    if (points[i][2] === "DEGRADED") out.degradedMinutes += held / 60000;
    else if (out.minutes[points[i][1]] !== undefined) out.minutes[points[i][1]] += held / 60000;
  }
  out.missingMinutes = Math.round(out.missingMinutes);
  out.degradedMinutes = Math.round(out.degradedMinutes);
  for (const k of Object.keys(out.minutes)) out.minutes[k] = Math.round(out.minutes[k]);
  return out;
}

// Contacts: one entry per contact key (its highest status), worst first.
function summarizeContacts(events) {
  const byKey = new Map();
  for (const e of events || []) {
    if (e.kind !== "CONTACT") continue;
    const old = byKey.get(e.ck);
    if (!old || (RANK[e.status] || 0) > (RANK[old.status] || 0)) byKey.set(e.ck, e);
  }
  const list = [...byKey.values()];
  list.sort((a, b) => (RANK[b.status] || 0) - (RANK[a.status] || 0) || a.t - b.t);
  return list;
}

function summarizeQuakes(q, from) {
  const rows = (q && q.rows) || [];
  const out = { count: rows.length, m25: 0, m4: 0, largest: null, covered: !!(q && q.first !== null && q.first <= from) };
  for (const r of rows) {
    if (r[1] === null) continue;
    if (r[1] >= 2.5) out.m25++;
    if (r[1] >= 4) out.m4++;
    if (!out.largest || r[1] > out.largest.mag) out.largest = { t: r[0], mag: r[1], depthKm: r[2], place: r[3], status: r[4] };
  }
  return out;
}

// Metric that describes the week, per monitor (from history rows).
const MEASURES = {
  EIA: { pick: "min", what: "lowest weighted grid health", unit: "percent" },
  SWPC: { pick: "max", what: "highest planetary K index", unit: "" },
  NWS: { pick: "max", what: "most active land warnings at one time", unit: "" },
  NIFC: { pick: "max", what: "most large active fires at one time", unit: "" },
  VOLCANO: { pick: "max", what: "most volcanoes above normal at one time", unit: "" },
  IODA: { pick: "max", what: "most active outage alerts at one time", unit: "" },
  GPS: { pick: "min", what: "fewest healthy satellites", unit: "" },
  NEO: { pick: "min", what: "closest approach", unit: "lunar distances" }
};

function measure(id, h) {
  const m = MEASURES[id];
  if (!m || !h) return null;
  let best = null, summary = h.before ? h.before[4] : "", bestSummary = "";
  for (const r of h.rows || []) {
    if (r[4]) summary = r[4];
    if (r[2] === "DEGRADED" || r[3] === null) continue;
    if (best === null || (m.pick === "max" ? r[3] > best : r[3] < best)) { best = r[3]; bestSummary = summary; }
  }
  return best === null ? null : { value: best, what: m.what, unit: m.unit, summary: bestSummary };
}

function summarizeWeek(exp) {
  const from = Date.parse(exp.from), to = Date.parse(exp.to);
  const monitors = exp.monitors.map((m) => {
    const hist = summarizeHistory(m.history, m.intervalMinutes, from, to);
    const contacts = summarizeContacts(m.events);
    const out = {
      id: m.id, prefix: m.prefix, name: m.name, color: m.color, order: m.order,
      intervalMinutes: m.intervalMinutes,
      peak: hist.peak, peakAt: hist.peakAt, startStatus: hist.startStatus,
      statusMinutes: hist.minutes, degradedMinutes: hist.degradedMinutes,
      missingMinutes: hist.missingMinutes, historyStart: hist.historyStart, covered: hist.covered,
      startedAt: hist.startedAt, timeline: hist.timeline,
      checks: hist.checks,
      contacts: contacts.length,
      contactsRaised: contacts.filter((c) => (RANK[c.status] || 0) >= 1).length,
      top: contacts.filter((c) => (RANK[c.status] || 0) >= 1).slice(0, 3)
        .map((c) => ({ t: c.t, status: c.status, label: c.label, rows: c.rows })),
      statusChanges: (m.events || []).filter((e) => e.kind === "STATUS").length,
      measure: measure(m.id, m.history)
    };
    if (m.id === "USGS") out.quakes = summarizeQuakes(exp.quakes, from);
    const problems = [];
    const notes = [];
    if (hist.startedAt) notes.push("RECORDS BEGIN " + new Date(hist.startedAt).toISOString());
    else if (!hist.covered) problems.push("HISTORY BEGINS " + (hist.historyStart ? new Date(hist.historyStart).toISOString() : "NEVER"));
    if (hist.missingMinutes > 180) problems.push("MISSING " + hist.missingMinutes + " MIN");
    if (out.quakes && !out.quakes.covered) problems.push("QUAKE CATALOG BEGINS " + (exp.quakes.first ? new Date(exp.quakes.first).toISOString() : "NEVER"));
    out.complete = problems.length === 0;
    out.problems = problems;
    out.notes = notes;
    return out;
  });
  monitors.sort((a, b) => (RANK[b.peak] ?? -1) - (RANK[a.peak] ?? -1) || a.order - b.order);
  return {
    week: exp.week, from: exp.from, to: exp.to, timeZone: exp.timeZone, built: exp.built,
    partial: !!exp.partial,
    complete: !exp.partial && monitors.every((m) => m.complete),
    monitors
  };
}

// ---------- speakable text ----------

const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico", GU: "Guam", DC: "District of Columbia" };
const COMPASS = { N: "north", S: "south", E: "east", W: "west", NE: "northeast", NW: "northwest", SE: "southeast", SW: "southwest", NNE: "north-northeast", ENE: "east-northeast", ESE: "east-southeast", SSE: "south-southeast", SSW: "south-southwest", WSW: "west-southwest", WNW: "west-northwest", NNW: "north-northwest" };

// "54 km W of Beatty, Nevada" -> "54 kilometers west of Beatty, Nevada"
function speakPlace(text) {
  return String(text || "")
    .replace(/\b(\d+(?:\.\d+)?) ?km ([NSEW]{1,3}) of\b/g, (m, n, d) => n + " kilometers " + (COMPASS[d] || d) + " of")
    .replace(/,\s*([A-Z]{2})\b/g, (m, s) => ", " + (STATES[s] || s))
    .replace(/\s*\/\/\s*/g, ", ")
    .trim();
}

// Upper-case labels from the feeds -> plain words (place names keep
// their capitals: "SANTA CRUZ, CA" -> "Santa Cruz, California").
// Words with digits stay as written (201W, GLM 5.3); small joining
// words stay lower case inside a name ("District of Columbia").
const ACRONYMS = ["GPS", "AI", "NWS", "USGS", "EIA", "NASA", "JPL", "NOAA", "IODA", "UTC", "PRN"];
const SPECIAL_WORDS = { OPENAI: "OpenAI", XAI: "xAI", DEEPSEEK: "DeepSeek" };
const SMALL_WORDS = ["of", "the", "and"];   // not "in": state code IN
function plainCase(text) {
  return String(text || "").split(/(\s+)/).map((w, i) => {
    const up = w.toUpperCase();
    if (SPECIAL_WORDS[up]) return SPECIAL_WORDS[up];
    if (/\d/.test(w)) return up;
    const lo = w.toLowerCase();
    if (i > 0 && SMALL_WORDS.includes(lo)) return lo;
    return lo.replace(/(^|[,(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\b[A-Z][a-z]+\b/g, (x) => (ACRONYMS.includes(x.toUpperCase()) ? x.toUpperCase() : x));
  }).join("");
}
const sentenceCase = (t) => { const s = String(t || "").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
const row = (c, name) => { const r = (c.rows || []).find((x) => x[0] === name); return r ? r[1] : ""; };
const num = (n, d) => { const v = Number(n); return Number.isInteger(v) && !d ? String(v) : v.toFixed(d === undefined ? 1 : d).replace(/\.0$/, ""); };
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
const level = (s) => s;   // statuses are read as written: WATCH, ELEVATED, CRITICAL

// One contact as a short phrase, per monitor.
function speakContact(id, c) {
  if (id === "NWS") {
    const area = row(c, "AREA");
    return sentenceCase(row(c, "WARNING") || c.label) + (area ? ", " + speakPlace(plainCase(area).replace(/, ([A-Z][a-z])\b/g, (m, s) => ", " + s.toUpperCase())) : "");
  }
  if (id === "TEMP") {
    const dev = Number(String(row(c, "DEVIATION")).replace(/[^\d.+-]/g, ""));
    const where = speakPlace(row(c, "LOCATION") || c.label.split("//")[0]);
    return Number.isFinite(dev) ? where + ", " + num(Math.abs(dev)) + " degrees " + (dev < 0 ? "below" : "above") + " usual" : where;
  }
  if (id === "EIA") {
    const sector = plainCase(String(row(c, "SECTOR")).replace(/^\d+\s*\/\/\s*/, "") || c.label.split("//")[0]);
    const kind = /SHORTFALL/.test(c.label) ? "demand below forecast" : "demand above forecast";
    return sector + " sector, " + kind;
  }
  if (id === "USGS") {
    const m = /^M(\d+(?:\.\d+)?)\s*\/\/\s*(.*)$/.exec(c.label);
    return m ? "magnitude " + m[1] + ", " + speakPlace(m[2]) : speakPlace(c.label);
  }
  if (id === "AIINC") {
    const p = row(c, "PROVIDER");
    return (p ? plainCase(p) + ", " : "") + sentenceCase(row(c, "PROVIDER STATUS") || c.label);
  }
  if (id === "TRANSPORT") {
    // "RAIL // DERAILMENT // WABBASEKA, AR"; aviation names its airport.
    const what = row(c, "CONDITION") || row(c, "INCIDENT") || String(c.label).split("//")[1] || c.label;
    const type = String(row(c, "TYPE") || "").toUpperCase();
    const where = row(c, "AIRPORT") ? plainCase(String(row(c, "AIRPORT")).replace(/\s*\([A-Z0-9]{3,4}\)\s*$/, ""))
      : speakPlace(plainCase(row(c, "LOCATION") || String(c.label).split("//")[2] || "").replace(/, ([A-Z][a-z])\b/g, (m, x) => ", " + x.toUpperCase()));
    const kind = /^AVIA/.test(type) ? "" : (/^RAIL/.test(type) ? "Rail " : /^MARI/.test(type) ? "Maritime " : /^(SURF|ROAD|HIGH)/.test(type) ? "Road " : "");
    const head = kind ? kind + String(what).trim().toLowerCase() : sentenceCase(String(what).trim());
    return head + (where ? ", " + where : "");
  }
  if (id === "IODA" && row(c, "REGION")) return plainCase(row(c, "REGION")) + " outage";
  if (id === "GPS" && row(c, "SATELLITE")) return String(row(c, "SATELLITE")).toUpperCase() + " unhealthy";
  if (id === "NIFC" && row(c, "FIRE")) {
    const st = String(row(c, "STATE")).toUpperCase();
    return speakPlace(plainCase(row(c, "FIRE")) + " fire" + (st ? ", " + st : ""));
  }
  return speakPlace(sentenceCase(c.label));
}

// ---------- narration ----------
//
// The narration is a list of paragraphs, each a list of sentences. One
// paragraph = one video scene; one sentence = one spoken line, which
// also appears on the scene's card while it is spoken (video.mjs times
// the card to the voice).

// Stable pick: the same week always gets the same wording.
function pick(list, key) {
  let h = 2166136261;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return list[h % list.length];
}

const INTRO = [
  (w) => "Operational Event Register. Weekly summary for the period ending " + w + ".",
  (w) => "Operational Event Register. Summary of monitored activity, week ending " + w + ".",
  (w) => "Operational Event Register. Weekly monitor summary. Period ending " + w + "."
];
const QUIET = [
  (n) => "No significant activity recorded: " + n + ". NOMINAL throughout.",
  (n) => "Nothing significant to report: " + n + ". Status remained NOMINAL.",
  (n) => "Quiet for the full period: " + n + ". Status NOMINAL."
];
const OUTRO = [
  "End of summary. Monitoring continues. thegreatdarkness.com.",
  "End of weekly summary. Live status at thegreatdarkness.com.",
  "Summary ends. Monitoring continues at thegreatdarkness.com."
];
const COUNT = {
  TEMP: (n) => plural(n, "city logged outside its usual range", "city readings logged outside the usual range"),
  EIA: (n) => plural(n, "grid sector contact logged", "grid sector contacts logged"),
  NWS: (n) => plural(n, "warning logged", "warnings logged"),
  NIFC: (n) => plural(n, "fire logged", "fires logged"),
  VOLCANO: (n) => plural(n, "volcano logged", "volcanoes logged"),
  IODA: (n) => plural(n, "outage alert logged", "outage alerts logged"),
  GPS: (n) => plural(n, "satellite logged", "satellites logged"),
  AIINC: (n) => plural(n, "provider incident logged", "provider incidents logged"),
  TRANSPORT: (n) => plural(n, "incident logged", "incidents logged")
};
// The week's measure is read out for these always, for the rest only
// when no contact was logged (it is then the only figure there is).
const MEASURE_ALWAYS = ["EIA", "SWPC", "NEO", "GPS"];
const TOP_SPOKEN = { CRITICAL: 2, ELEVATED: 2, WATCH: 1, NOMINAL: 1 };   // contacts read out, by the monitor's peak
const DEGRADED_SPOKEN_MIN = 180;   // shorter degraded stretches are not read out
const MISSING_SPOKEN_MIN = 60;

function hoursText(min) {
  const h = Math.round(min / 60);
  return h >= 1 ? plural(h, "hour", "hours") : plural(Math.max(1, Math.round(min)), "minute", "minutes");
}
const joinNames = (list) => (list.length < 2 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1]);

function isQuiet(m) {
  return m.id !== "USGS" && m.peak === "NOMINAL" && !m.contactsRaised;
}

// Notes on the data itself. `who` = "" for a monitor's own scene, or the
// monitor name on the shared quiet line.
function dataNotes(m, who) {
  const out = [];
  const lead = (text) => (who ? who + ": " + text.charAt(0).toLowerCase() + text.slice(1) : text);
  if (m.startedAt) out.push(lead("Records for this period begin " + dayTime(m.startedAt) + "."));
  if (m.degradedMinutes >= DEGRADED_SPOKEN_MIN) out.push(lead("Source degraded for " + hoursText(m.degradedMinutes) + "."));
  if (m.missingMinutes >= MISSING_SPOKEN_MIN) out.push(lead("No data for " + hoursText(m.missingMinutes) + "."));
  return out;
}

// One monitor's sentences (quiet monitors share one line instead).
function monitorSentences(m, weekFrom) {
  const name = plainCase(m.name);
  if (m.peak === null) return [name + ". No data recorded for this period."];
  const s = [];
  if (m.id === "USGS" && m.quakes) {
    const q = m.quakes;
    s.push(name + ". " + plural(q.count, "earthquake", "earthquakes") + " recorded." + (q.m25 ? " " + q.m25 + " at magnitude 2.5 or above." : ""));
    if (q.largest) s.push("Largest: magnitude " + num(q.largest.mag) + ", " + speakPlace(q.largest.place) + ", " + dayName(q.largest.t) + ".");
  } else if (COUNT[m.id] && m.contacts) {
    s.push(name + ". " + COUNT[m.id](m.contacts) + ".");
  } else {
    s.push(name + ".");
  }
  if (m.measure && (MEASURE_ALWAYS.includes(m.id) || !m.contacts)) {
    const v = m.id === "NEO" ? num(m.measure.value, 2) : num(m.measure.value);
    const label = m.measure.what.charAt(0).toUpperCase() + m.measure.what.slice(1);
    let extra = "";
    if (m.id === "NEO") { const x = String(m.measure.summary).split("//")[2]; if (x) extra = ", object " + x.trim().split(" ").slice(0, 2).join(" "); }
    s.push(label + ": " + v + (m.measure.unit ? " " + m.measure.unit : "") + extra + ".");
  }
  if (m.id !== "USGS") {
    // The same words twice (two warnings for one county) are read once.
    const seen = new Set(), items = [];
    for (const c of m.top) {
      const phrase = speakContact(m.id, c);
      if (seen.has(phrase.toLowerCase())) continue;
      seen.add(phrase.toLowerCase());
      items.push(phrase + ", " + c.status + ".");
      if (items.length >= (TOP_SPOKEN[m.peak] || 1)) break;
    }
    if (items.length) items[0] = (items.length === 1 ? "Highest contact: " : "Highest contacts: ") + items[0];
    s.push(...items);
  }
  if (m.peak !== "NOMINAL") {
    const when = m.peakAt <= Date.parse(weekFrom) ? "carried over from the previous period" : dayTime(m.peakAt);
    s.push("Overall status reached: " + m.peak + ", " + when + ".");
  } else {
    s.push("Overall status remained NOMINAL.");
  }
  return s.concat(dataNotes(m, ""));
}

function narrateWeek(sum) {
  const end = Date.parse(sum.to) - 1;
  const paragraphs = [{ kind: "intro", sentences: [pick(INTRO, sum.week)(longDate(end))] }];
  const quiet = [];
  for (const m of sum.monitors) {
    if (m.peak !== null && isQuiet(m)) { quiet.push(m); continue; }
    paragraphs.push({ kind: "monitor", id: m.id, sentences: monitorSentences(m, sum.from) });
  }
  if (quiet.length) {
    const s = [pick(QUIET, sum.week)(joinNames(quiet.map((m) => plainCase(m.name))))];
    for (const m of quiet) s.push(...dataNotes(m, plainCase(m.name)));
    paragraphs.push({ kind: "quiet", ids: quiet.map((m) => m.id), sentences: s });
  }
  paragraphs.push({ kind: "outro", sentences: [pick(OUTRO, sum.week)] });
  return finishNarration(paragraphs);
}

function finishNarration(paragraphs) {
  const text = paragraphs.map((p) => p.sentences.join(" ")).join("\n\n");
  const words = text.split(/\s+/).filter(Boolean).length;
  // Measured pace of the LOG VOICE with its pauses: ~1.25 words a second.
  return { text, paragraphs, words, estSeconds: Math.round(words / 1.25) };
}

// The vertical cut (Shorts): the monitors with the highest status, one
// line each. `items` (default 3) lets the builder drop one if the spoken
// version runs past a minute.
function narrateShort(sum, items) {
  const end = Date.parse(sum.to) - 1;
  const p = parts(end);
  const top = sum.monitors.filter((m) => m.peak !== null && !isQuiet(m)).slice(0, items === undefined ? 3 : items);
  const paragraphs = [{ kind: "intro", sentences: ["Operational Event Register. Week ending " + p.day + " " + p.month + "."] }];
  for (const m of top) {
    let fig = "";
    if (m.id === "USGS" && m.quakes) fig = plural(m.quakes.count, "earthquake", "earthquakes") + " recorded.";
    else if (COUNT[m.id] && m.contacts) fig = COUNT[m.id](m.contacts) + ".";
    paragraphs.push({ kind: "monitor", id: m.id, sentences: [plainCase(m.name) + ". " + (fig ? fig + " " : "") + "Status reached " + m.peak + "."] });
  }
  paragraphs.push({ kind: "outro", sentences: ["Full summary at thegreatdarkness.com."] });
  return finishNarration(paragraphs);
}

// ---------- video title, description, tags ----------

// Same sources and wording as https://thegreatdarkness.com/sources/.
const SOURCES_CREDIT = "Data: USGS Earthquake Hazards Program; National Weather Service; NOAA Space Weather Prediction Center; " +
  "U.S. Energy Information Administration; National Interagency Fire Center; USGS Volcano Hazards Program; " +
  "IODA (Georgia Tech); NASA/JPL Center for Near Earth Object Studies; CelesTrak and U.S. Coast Guard NAVCEN; " +
  "NOAA NCEI climate normals; FAA NAS Status and U.S. DOT; provider status pages. Full list: https://thegreatdarkness.com/sources/";

function videoMeta(sum, narration) {
  const end = Date.parse(sum.to) - 1;
  const p = parts(end);
  const lines = narration.paragraphs.filter((x) => x.kind === "monitor" || x.kind === "quiet").map((x) => x.sentences.join(" "));
  const description = [
    "Operational Event Register weekly summary, " + dayName(Date.parse(sum.from)) + " to " + dayName(end) + " " + p.year + " (U.S. Central time). " +
      "Every figure is what the site's live monitors recorded that week.",
    "",
    ...lines,
    "",
    "Live monitors: https://thegreatdarkness.com/floor/",
    "Weekly summaries: https://thegreatdarkness.com/recap/",
    "",
    "Independent creative project. Not an official alert service. Narration is a synthetic voice.",
    "",
    SOURCES_CREDIT
  ].join("\n").replace(/[<>]/g, "");   // YouTube refuses angle brackets
  return {
    title: ("OER WEEKLY SUMMARY // Week ending " + longDate(end)).slice(0, 100),
    shortTitle: ("OER WEEKLY SUMMARY // " + p.day + " " + p.month.slice(0, 3).toUpperCase() + " " + p.year + " #Shorts").slice(0, 100),
    description: description.slice(0, 4900),
    tags: ["OER", "weekly summary", "monitoring", "earthquakes", "severe weather", "power grid", "space weather",
      "wildfire", "volcano", "internet outages", "GPS", "near-earth objects", "temperature", "transportation", "thegreatdarkness"]
  };
}

module.exports = {
  summarizeWeek, narrateWeek, narrateShort, videoMeta, summarizeHistory, summarizeContacts, summarizeQuakes,
  speakPlace, speakContact, plainCase, pick, longDate, dayName, isQuiet, RANK
};
