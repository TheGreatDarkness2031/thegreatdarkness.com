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

const gapLimitMin = (interval) => Math.max(interval * 2.5, interval + 60);

function summarizeHistory(h, interval, from, to) {
  const rows = (h && h.rows) || [];
  const out = {
    startStatus: h && h.before ? h.before[1] : null,
    peak: null, peakAt: null, peakSummary: "",
    minutes: { NOMINAL: 0, WATCH: 0, ELEVATED: 0, CRITICAL: 0 },
    degradedMinutes: 0, missingMinutes: 0, gaps: [],
    historyStart: h && h.first !== null && h.first !== undefined ? h.first : null,
    covered: false, checks: rows.length
  };
  out.covered = out.historyStart !== null && out.historyStart <= from && !!(h && h.before);

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
    out.missingMinutes = Math.round((to - from) / 60000);
    out.gaps.push([from, to]);
    return out;
  }
  if (points[0][0] > from + limit) out.gaps.push([from, points[0][0]]);
  if (points[0][0] > from) out.missingMinutes += (points[0][0] - from) / 60000;
  for (let i = 0; i < points.length; i++) {
    const t = points[i][0];
    const end = i + 1 < points.length ? points[i + 1][0] : to;
    const span = Math.max(0, end - t);
    const held = Math.min(span, limit);
    if (span > limit) { out.gaps.push([t + limit, end]); out.missingMinutes += (span - limit) / 60000; }
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
    if (!hist.covered) problems.push("HISTORY BEGINS " + (hist.historyStart ? new Date(hist.historyStart).toISOString() : "NEVER"));
    if (hist.missingMinutes > 180) problems.push("MISSING " + hist.missingMinutes + " MIN");
    if (out.quakes && !out.quakes.covered) problems.push("QUAKE CATALOG BEGINS " + (exp.quakes.first ? new Date(exp.quakes.first).toISOString() : "NEVER"));
    out.complete = problems.length === 0;
    out.problems = problems;
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
  if (id === "IODA" && row(c, "REGION")) return plainCase(row(c, "REGION")) + " outage";
  if (id === "GPS" && row(c, "SATELLITE")) return String(row(c, "SATELLITE")).toUpperCase() + " unhealthy";
  if (id === "NIFC" && row(c, "FIRE")) {
    const st = String(row(c, "STATE")).toUpperCase();
    return speakPlace(plainCase(row(c, "FIRE")) + " fire" + (st ? ", " + st : ""));
  }
  return speakPlace(sentenceCase(c.label));
}

// ---------- narration ----------

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
  (n) => n + ". Nothing significant to report. Status remained NOMINAL.",
  (n) => n + ". No significant activity recorded. NOMINAL throughout.",
  (n) => n + ". Quiet. Status NOMINAL for the full period."
];
const OUTRO = [
  "End of summary. Monitoring continues. thegreatdarkness.com.",
  "End of weekly summary. Live status at thegreatdarkness.com.",
  "Summary ends. Monitoring continues at thegreatdarkness.com."
];
const COUNT = {
  USGS: null,
  TEMP: (n) => plural(n, "city logged outside its usual range", "city readings logged outside the usual range"),
  EIA: (n) => plural(n, "grid sector contact logged", "grid sector contacts logged"),
  NWS: (n) => plural(n, "warning logged", "warnings logged"),
  NIFC: (n) => plural(n, "fire logged", "fires logged"),
  VOLCANO: (n) => plural(n, "volcano logged", "volcanoes logged"),
  IODA: (n) => plural(n, "outage alert logged", "outage alerts logged"),
  GPS: (n) => plural(n, "satellite logged", "satellites logged"),
  AIINC: (n) => plural(n, "provider incident logged", "provider incidents logged")
};

function hoursText(min) {
  const h = Math.round(min / 60);
  return h >= 1 ? plural(h, "hour", "hours") : plural(Math.max(1, Math.round(min)), "minute", "minutes");
}

function narrateMonitor(m, week) {
  const name = plainCase(m.name);
  const parts = [];
  if (m.peak === null) {
    parts.push(name + ". No data recorded for this period.");
    return parts.join(" ");
  }
  const quiet = m.peak === "NOMINAL" && !m.contactsRaised && !(m.quakes && m.quakes.m4);
  if (quiet && m.id !== "USGS") {
    parts.push(m.missingMinutes >= 60 ? name + ". Nothing significant to report. Status NOMINAL while reporting." : pick(QUIET, week + m.id)(name));
  } else {
    parts.push(name + ".");
    if (m.id === "USGS" && m.quakes) {
      const q = m.quakes;
      parts.push(plural(q.count, "earthquake", "earthquakes") + " recorded." + (q.m25 ? " " + q.m25 + " at magnitude 2.5 or above." : ""));
      if (q.largest) parts.push("Largest: magnitude " + num(q.largest.mag) + ", " + speakPlace(q.largest.place) + ", " + dayName(q.largest.t) + ".");
    } else if (COUNT[m.id] && m.contacts) {
      parts.push(COUNT[m.id](m.contacts) + ".");
    }
    if (m.measure) {
      const v = m.id === "NEO" ? num(m.measure.value, 2) : num(m.measure.value);
      const label = m.measure.what.charAt(0).toUpperCase() + m.measure.what.slice(1);
      let extra = "";
      if (m.id === "NEO") { const s = String(m.measure.summary).split("//")[2]; if (s) extra = ", object " + s.trim().split(" ").slice(0, 2).join(" "); }
      parts.push(label + ": " + v + (m.measure.unit ? " " + m.measure.unit : "") + extra + ".");
    }
    if (m.top.length && m.id !== "USGS") {
      const items = m.top.map((c) => speakContact(m.id, c) + ", " + level(c.status));
      parts.push((m.top.length === 1 ? "Highest contact: " : "Highest contacts: ") + items.join(". ") + ".");
    }
    if (m.peak !== "NOMINAL") {
      const when = m.peakAt <= Date.parse(m.weekFrom) ? "carried over from the previous period" : dayTime(m.peakAt);
      parts.push("Overall status reached: " + m.peak + ", " + when + ".");
    } else {
      parts.push("Overall status remained NOMINAL.");
    }
  }
  if (m.degradedMinutes >= 30) parts.push("Source degraded for " + hoursText(m.degradedMinutes) + ".");
  if (m.missingMinutes >= 60) parts.push("No data for " + hoursText(m.missingMinutes) + ".");
  return parts.join(" ");
}

function narrateWeek(sum) {
  const end = Date.parse(sum.to) - 1;
  const lines = [pick(INTRO, sum.week)(longDate(end))];
  for (const m of sum.monitors) lines.push(narrateMonitor(Object.assign({ weekFrom: sum.from }, m), sum.week));
  lines.push(pick(OUTRO, sum.week));
  const text = lines.join("\n\n");
  const words = text.split(/\s+/).filter(Boolean).length;
  return { text, words, estSeconds: Math.round(words / 2.4) };
}

module.exports = { summarizeWeek, narrateWeek, summarizeHistory, summarizeContacts, summarizeQuakes, speakPlace, speakContact, plainCase, pick, RANK };
