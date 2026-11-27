// OER WEEKLY SUMMARY: one-time sign-in that lets the weekly job upload
// to the OER YouTube channel. Run on the PC, once:
//
//   node recap/build/youtube_auth.mjs "C:\path\to\client_secret_....json"
//
// (the Desktop OAuth client file from the oer-recap Cloud project). It
// prints a Google address: open it in Chrome signed in to the TGD
// account, pick the OER channel, allow upload. The answer comes back to
// this script, which saves client id, client secret and refresh token
// in recap/.secrets/youtube.json (git-ignored, never published). Copy
// the three values into GitHub: website repo > Settings > Secrets and
// variables > Actions > New repository secret: YT_CLIENT_ID,
// YT_CLIENT_SECRET, YT_REFRESH_TOKEN. Then delete the file.
// Nothing secret is printed here.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const RECAP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error("usage: youtube_auth.mjs <client_secret json file>"); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const c = j.installed || j.web;
  if (!c || !c.client_id || !c.client_secret) throw new Error("not an OAuth client file");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");

  const srv = http.createServer();
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const redirect = "http://127.0.0.1:" + srv.address().port;
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: c.client_id, redirect_uri: redirect, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256"
  });
  console.log("Open this address in Chrome (signed in to the TGD account):\n\n" + url + "\n\nWaiting for Google's answer...");

  const code = await new Promise((ok, fail) => {
    srv.on("request", (req, res) => {
      const q = new URL(req.url, redirect).searchParams;
      if (!q.get("code") && !q.get("error")) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(q.get("code") && q.get("state") === state ? "Done. You can close this tab." : "Sign-in failed: " + (q.get("error") || "state mismatch"));
      srv.close();
      if (q.get("code") && q.get("state") === state) ok(q.get("code")); else fail(new Error(q.get("error") || "state mismatch"));
    });
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: redirect, code_verifier: verifier })
  });
  const d = await r.json();
  if (!d.refresh_token) throw new Error("no refresh token in Google's answer (" + (d.error || "HTTP " + r.status) + ")");
  const dir = path.join(RECAP, ".secrets");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "youtube.json");
  fs.writeFileSync(out, JSON.stringify({ YT_CLIENT_ID: c.client_id, YT_CLIENT_SECRET: c.client_secret, YT_REFRESH_TOKEN: d.refresh_token }, null, 1) + "\n");
  console.log("Saved to " + out + ".\nCopy its three values into the website repo's Actions secrets (same names), then delete the file.");
}

main().catch((e) => { console.error("STOP: " + e.message); process.exit(2); });
