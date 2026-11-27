// OER WEEKLY SUMMARY, stage 6: upload a week's two videos to the OER
// YouTube channel with the YouTube Data API (videos.insert, resumable).
//
//   node recap/build/youtube.mjs 2026-W47
//
// Needs the GitHub secrets YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
// (made once by youtube_auth.mjs). YT_PRIVACY: public (default),
// unlisted or private. Until Google's API audit passes, YouTube locks
// every video uploaded this way as private, so the weekly job only runs
// this when the repository variable YT_UPLOAD is "yes".
// Synthetic content: status.containsSyntheticMedia = true (the voice).
// Writes the video ids into recap/data/<week>.json (youtube,
// youtubeShort); a video that already has an id is not uploaded again.
// Never prints a token. Exit code 2 = upload failed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RECAP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(RECAP, "out");
const week = String(process.argv[2] || "").toUpperCase();

export function videoBody(meta, short, privacy) {
  const description = short
    ? "Operational Event Register weekly summary, short cut. Full summary: https://thegreatdarkness.com/recap/\n\n" +
      "Independent creative project. Not an official alert service. Narration is a synthetic voice.\n\n#Shorts"
    : meta.description;
  return {
    snippet: {
      title: short ? meta.shortTitle : meta.title,
      description,
      tags: meta.tags,
      categoryId: "28",                // Science & Technology
      defaultLanguage: "en",
      defaultAudioLanguage: "en"
    },
    status: {
      privacyStatus: privacy || "public",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
      embeddable: true,
      license: "youtube"
    }
  };
}

async function accessToken() {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) throw new Error("YouTube secrets not set");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET, refresh_token: YT_REFRESH_TOKEN })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("token refused: HTTP " + r.status + " " + (d.error || ""));
  return d.access_token;
}

async function upload(token, file, body) {
  const size = fs.statSync(file).size;
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": "video/mp4", "x-upload-content-length": String(size) },
    body: JSON.stringify(body)
  });
  if (!start.ok) throw new Error("upload refused: HTTP " + start.status + " " + (await start.text()).slice(0, 300));
  const where = start.headers.get("location");
  const put = await fetch(where, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(size) }, body: fs.readFileSync(file) });
  const d = await put.json().catch(() => ({}));
  if (!put.ok || !d.id) throw new Error("upload failed: HTTP " + put.status + " " + JSON.stringify(d).slice(0, 300));
  return d;
}

async function thumbnail(token, id, file) {
  // Needs a verified channel; a refusal leaves YouTube's own frame.
  const r = await fetch("https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=" + encodeURIComponent(id), {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "image/png" }, body: fs.readFileSync(file)
  });
  console.log(r.ok ? "thumbnail set" : "::warning::thumbnail not set (HTTP " + r.status + ")");
}

async function main() {
  if (!/^\d{4}-W\d{2}$/.test(week)) { console.error("usage: youtube.mjs 2026-W47"); process.exit(1); }
  const dataFile = path.join(RECAP, "data", week + ".json");
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const base = "OER-WEEKLY-SUMMARY-" + week;
  const privacy = process.env.YT_PRIVACY || "public";
  const token = await accessToken();
  if (!data.youtube) {
    const v = await upload(token, path.join(OUT, base + ".mp4"), videoBody(data.meta, false, privacy));
    data.youtube = v.id;
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 1) + "\n");
    console.log("video uploaded: https://youtu.be/" + v.id + " (" + (v.status && v.status.privacyStatus) + ")");
    await thumbnail(token, v.id, path.join(OUT, base + "-THUMB.png"));
  }
  if (!data.youtubeShort && fs.existsSync(path.join(OUT, base + "-SHORT.mp4"))) {
    const v = await upload(token, path.join(OUT, base + "-SHORT.mp4"), videoBody(data.meta, true, privacy));
    data.youtubeShort = v.id;
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 1) + "\n");
    console.log("short uploaded: https://youtu.be/" + v.id);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error("STOP: " + e.message); process.exit(2); });
