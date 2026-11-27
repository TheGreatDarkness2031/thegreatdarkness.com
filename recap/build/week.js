// OER WEEKLY SUMMARY, stage 1: fetch one week's recorded monitor data
// and write recap/data/<week>.json (summary + narration) and <week>.txt.
//
//   node recap/build/week.js 2026-W46            a finished week
//   node recap/build/week.js 2026-W47 --partial  the week so far (dry run)
//   node recap/build/week.js 2026-W46 --from-file export.json
//   node recap/build/week.js 2026-W47 --renarrate   wording again from the saved summary
//   add --dry to write the files even when the week is incomplete (exit 0)
//
// Exit code 2 when the week is incomplete or the data couldn't be read:
// the publishing workflow stops there and nothing is published.

"use strict";
const fs = require("fs");
const path = require("path");
const { summarizeWeek, narrateWeek, narrateShort, videoMeta } = require("./recap");

const ROOT = path.join(__dirname, "..", "..");
const args = process.argv.slice(2);
const week = String(args[0] || "").toUpperCase();
const partial = args.includes("--partial");
const fileArg = args.indexOf("--from-file");
const renarrate = args.includes("--renarrate");
const dry = args.includes("--dry");

function apiUrl() {
  const m = /TGD_API_URL\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "assets", "config.js"), "utf8"));
  if (!m) throw new Error("TGD_API_URL not found in assets/config.js");
  return m[1];
}

async function readExport() {
  if (fileArg >= 0) return JSON.parse(fs.readFileSync(args[fileArg + 1], "utf8"));
  const url = apiUrl() + "?logexport=recap&week=" + encodeURIComponent(week) + (partial ? "&partial=1" : "");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      const text = await res.text();
      if (res.ok && text.trim().charAt(0) === "{") return JSON.parse(text);
      console.error("attempt " + attempt + ": HTTP " + res.status);
    } catch (e) {
      console.error("attempt " + attempt + ": " + e.message);
    }
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  throw new Error("export not readable");
}

(async () => {
  if (!/^\d{4}-W\d{2}$/.test(week)) { console.error("usage: week.js 2026-W46 [--partial]"); process.exit(1); }
  const outDir = path.join(ROOT, "recap", "data");
  let summary, saved = {};
  try { saved = JSON.parse(fs.readFileSync(path.join(outDir, week + ".json"), "utf8")); } catch (e) { saved = {}; }
  if (renarrate) {
    // Past weeks: the export only reaches back so far, so a re-render
    // keeps the saved summary and only rebuilds the wording.
    summary = saved.summary;
    if (!summary) { console.error("STOP: no saved summary for " + week); process.exit(2); }
  } else {
    let exp;
    try { exp = await readExport(); } catch (e) { console.error("STOP: " + e.message); process.exit(2); }
    if (!exp.ok) { console.error("STOP: export says " + exp.error); process.exit(2); }
    summary = summarizeWeek(exp);
  }
  const narration = narrateWeek(summary);
  const short = narrateShort(summary);
  const meta = videoMeta(summary, narration);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, week + ".json"), JSON.stringify(Object.assign({ summary, narration, short, meta },
    // YouTube ids stay with the week through a re-render.
    saved.youtube ? { youtube: saved.youtube } : {}, saved.youtubeShort ? { youtubeShort: saved.youtubeShort } : {}), null, 1) + "\n");
  fs.writeFileSync(path.join(outDir, week + ".txt"), narration.text + "\n");

  console.log(week + ": " + narration.words + " words, about " + Math.round(narration.estSeconds / 6) / 10 + " min");
  for (const m of summary.monitors) {
    console.log(" " + (m.complete ? "ok  " : "GAP ") + m.id.padEnd(8) + String(m.peak).padEnd(9) + " contacts " + String(m.contacts).padStart(3) + (m.problems.concat(m.notes || []).length ? "  " + m.problems.concat(m.notes || []).join("; ") : ""));
  }
  if (!summary.complete && !dry) {
    console.error("STOP: week " + (summary.partial ? "not over" : "incomplete") + "; nothing to publish.");
    process.exit(2);
  }
})();
