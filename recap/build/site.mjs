// OER WEEKLY SUMMARY, stage 4: the /recap/ page's data, built by the
// Publish site workflow (pages.yml) from the GitHub Releases the weekly
// job made. Each release `recap-<week>` holds the videos and <week>.json
// (summary, narration, YouTube ids). Writes, for the published site only
// (git-ignored):
//   recap/index.json        every week, newest first
//   recap/data/<week>.json  each week's summary + narration
//   recap/feed.xml          RSS, one item per week
// If GitHub can't be read, the published copies are kept. Never fails
// the publish: exit 0 always, warnings on stdout.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RECAP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.GITHUB_REPOSITORY || "TheGreatDarkness2031/thegreatdarkness.com";
const LIVE = "https://thegreatdarkness.com/recap";
const SITE = "https://thegreatdarkness.com";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function getJson(url, headers) {
  const r = await fetch(url, { headers: headers || {}, redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url.replace(/\?.*$/, ""));
  return r.json();
}

// One week's list entry from its release and data file.
export function entryFor(release, data) {
  const week = data.summary.week;
  const asset = (n) => { const a = (release.assets || []).find((x) => x.name === n); return a ? a.browser_download_url : ""; };
  const base = "OER-WEEKLY-SUMMARY-" + week;
  return {
    week,
    from: data.summary.from,
    to: data.summary.to,
    title: data.meta.title,
    published: release.published_at || release.created_at || "",
    release: release.html_url || "",
    video: asset(base + ".mp4"),
    short: asset(base + "-SHORT.mp4"),
    youtube: data.youtube || "",
    youtubeShort: data.youtubeShort || "",
    peaks: data.summary.monitors.map((m) => [m.name, m.color, m.peak])
  };
}

export function validWeek(data) {
  return !!(data && data.summary && /^\d{4}-W\d{2}$/.test(data.summary.week) && Array.isArray(data.summary.monitors) &&
    data.narration && Array.isArray(data.narration.paragraphs) && data.meta && data.meta.title);
}

export function rss(weeks, datas, built) {
  const items = weeks.slice(0, 30).map((w) => {
    const d = datas[w.week];
    const link = SITE + "/recap/?week=" + w.week;
    const text = d ? d.narration.paragraphs.map((p) => p.sentences.join(" ")).join("\n\n") : "";
    return "  <item>\n    <title>" + esc(w.title) + "</title>\n    <link>" + link + "</link>\n    <guid isPermaLink=\"false\">oer-weekly-summary-" + w.week + "</guid>\n" +
      "    <pubDate>" + new Date(w.published || w.to).toUTCString() + "</pubDate>\n    <description>" + esc(text) + "</description>\n  </item>";
  });
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\">\n<channel>\n  <title>OER // Weekly Summary</title>\n  <link>" + SITE + "/recap/</link>\n" +
    "  <description>Operational Event Register weekly summary of what the monitors recorded. Independent creative project. Not an official alert service.</description>\n" +
    "  <language>en</language>\n  <lastBuildDate>" + new Date(built).toUTCString() + "</lastBuildDate>\n" + items.join("\n") + (items.length ? "\n" : "") + "</channel>\n</rss>\n";
}

function write(weeks, datas) {
  fs.mkdirSync(path.join(RECAP, "data"), { recursive: true });
  for (const [w, d] of Object.entries(datas)) fs.writeFileSync(path.join(RECAP, "data", w + ".json"), JSON.stringify(d) + "\n");
  const built = new Date().toISOString();
  fs.writeFileSync(path.join(RECAP, "index.json"), JSON.stringify({ ok: true, built, weeks }) + "\n");
  fs.writeFileSync(path.join(RECAP, "feed.xml"), rss(weeks, datas, built));
  console.log("weekly summaries: " + weeks.length + " week(s)" + (weeks.length ? ", newest " + weeks[0].week : ""));
}

async function fromReleases() {
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = "Bearer " + process.env.GITHUB_TOKEN;
  const releases = await getJson("https://api.github.com/repos/" + REPO + "/releases?per_page=100", headers);
  const weeks = [], datas = {};
  for (const r of releases) {
    const m = /^recap-(\d{4}-W\d{2})$/.exec(r.tag_name || "");
    if (!m || r.draft || r.prerelease) continue;
    const a = (r.assets || []).find((x) => x.name === m[1] + ".json");
    if (!a) { console.log("::warning::release " + r.tag_name + " has no " + m[1] + ".json"); continue; }
    const d = await getJson(a.browser_download_url);
    if (!validWeek(d) || d.summary.week !== m[1]) { console.log("::warning::" + a.name + " not usable"); continue; }
    datas[m[1]] = d;
    weeks.push(entryFor(r, d));
  }
  weeks.sort((x, y) => (x.week < y.week ? 1 : -1));
  return { weeks, datas };
}

async function fromLiveSite() {
  const idx = await getJson(LIVE + "/index.json");
  const datas = {};
  for (const w of idx.weeks || []) datas[w.week] = await getJson(LIVE + "/data/" + w.week + ".json");
  return { weeks: idx.weeks || [], datas };
}

async function main() {
  try {
    const r = await fromReleases();
    write(r.weeks, r.datas);
  } catch (e) {
    console.log("::warning::weekly summary releases not readable (" + e.message + "); keeping the published copy");
    try { const r = await fromLiveSite(); write(r.weeks, r.datas); } catch (e2) { console.log("::warning::no published weekly summary list either (" + e2.message + ")"); }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => console.log("::warning::" + e.message));
