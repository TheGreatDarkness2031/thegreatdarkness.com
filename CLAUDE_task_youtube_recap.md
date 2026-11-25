### Automated weekly YouTube recap ("OER WEEKLY SUMMARY")

**Goal:** every week, automatically produce a short video recapping what the 11 monitors recorded, narrated in the OER voice, at zero running cost. Publish it to YouTube, and post it on the site.

**Start by showing me a plan and confirming the choices marked CONFIRM. Don't build until I approve. Build in the stages listed at the end.**

#### 1. Weekly data summary
- A weekly job gathers the past 7 days (Monday 00:00 to Sunday 23:59, U.S. Central) from the existing event feed, Reporting_Events, and each monitor's history tab. Add a read-only Apps Script endpoint for this if one doesn't exist (cached; no secrets in the public site).
- Produce one JSON file per week, saved in the repo (`recap/data/2026-W47.json`): per monitor, the event count, highest status reached and when, the top 1–3 events, and whether the monitor was degraded or missing data at any point.
- **Only real recorded data.** No invented, estimated, or padded events. If a monitor was quiet, say it was quiet. If it was degraded, say so.

#### 2. Narration (templates, no AI writing)
- Build the script from templates in the OER voice, flat and factual, for example: "Operational Event Register. Weekly summary for the period ending 15 November 2026. Earthquake activity: 214 events recorded. Largest: magnitude 5.8, 40 kilometers south of Sand Point, Alaska. Status reached: ELEVATED."
- Several template variants per monitor so weeks don't sound identical, plus a "nothing significant to report" form.
- Order monitors by highest status that week, then by the Source Register order.
- Target length 2–4 minutes. Never editorialize or explain the story.
- Text-to-speech: open-source and free, run inside GitHub Actions (Kokoro; CONFIRM licenses allow published, monetizable use, or propose Piper). Use the same fixed LOG VOICE the podcast will use, with a pronunciation file for place names, units, and abbreviations.

#### 3. Visuals
- Build a hidden recap page on the site (for example `/recap/render/?week=2026-W47`) in the terminal style that plays the week as timed scenes: title card with the period, one card per monitor (count, peak status in its Source Register color, top events), a Radar replay of the week's real contacts if the Radar history supports it, and a closing card with thegreatdarkness.com.
- Record it in headless Chromium with Playwright in GitHub Actions, timed to the narration, then combine with ffmpeg.
- Outputs: a 1920x1080 video, a vertical 1080x1920 cut under 60 seconds covering the top three items (for Shorts, Reels, TikTok), a thumbnail, and a text file with title, description, and tags.
- Music and sound: generated with ffmpeg or CC0 only, credited in `recap/assets/CREDITS.md`.

#### 4. Publishing
- Save each week's video files where I can download them (workflow artifact or a GitHub Release), and add the recap to the site: a `/recap/` page listing each week with the embedded video and the written summary, plus an RSS item.
- **YouTube upload, in two phases:**
  - Phase 1: I upload manually each week from the saved files. Give me a 2-minute checklist.
  - Phase 2: automatic upload with the YouTube Data API using an OAuth refresh token stored as a GitHub Actions secret. Videos uploaded by an API project that hasn't passed Google's audit are locked to private, so include the steps to request the audit, and keep Phase 1 working until it passes.
- Channel belongs to the TGD Google account only. No personal names or personal email in video metadata, files, or commits.
- Description template: what the video is, a link to the site, "Independent creative project. Not an official alert service. Narration is a synthetic voice," and data source credits matching the `/sources/` page. Set YouTube's altered or synthetic content setting if it applies.
- Schedule: GitHub Actions cron, early Monday. Add a manual trigger, a dry-run mode, and a way to re-render a past week.

#### Rules
- If the data fetch fails or the week's data is incomplete, don't publish. Notify me (email to the TGD address) and stop.
- A failed recap must never affect the live site or the monitors.
- Keep everything under `recap/`, out of the clasp project.

#### Stages
1. Weekly data JSON for last week, plus the narration text. I review the wording.
2. Voice sample of that narration.
3. The recap page and a recorded video for last week. I review it.
4. Site page, RSS item, and the manual upload checklist.
5. Scheduled workflow with dry-run, then live.
6. YouTube API upload and the audit request.
