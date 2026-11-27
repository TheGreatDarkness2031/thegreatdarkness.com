// OER WEEKLY SUMMARY, stage 2: speak a week's narration with Kokoro
// (Kokoro-82M, Apache-2.0, run on the CPU through kokoro-js).
//
//   node recap/build/voice.mjs 2026-W46                 voice from voice/voice.json
//   node recap/build/voice.mjs 2026-W46 --voice am_michael --out out/x.wav
//   node recap/build/voice.mjs 2026-W47 --short        the vertical cut's narration
//
// Reads the narration's paragraphs and sentences from recap/data/<week>.json
// (the .txt for weeks built before 2026-11-27), applies
// voice/pronunciation.json, speaks one sentence at a time and joins them
// with fixed pauses into one 24 kHz mono WAV (default
// recap/out/<week>.wav, or <week>-short.wav) plus <same name>.timing.json:
// when each sentence starts and ends, which video.mjs times the cards to.
// Same text + voice = same audio.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
const week = String(args[0] || "").toUpperCase();
const settingsFile = path.join(ROOT, "voice", "voice.json");
const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, "utf8")) : {};
const voice = opt("voice", settings.voice || "am_michael");
const speed = Number(opt("speed", settings.speed || 1));
const short = args.includes("--short");
const out = opt("out", path.join(ROOT, "out", week + (short ? "-short" : "") + ".wav"));
const PAUSE_SENTENCE = 0.35, PAUSE_SECTION = 0.9, PAUSE_EDGE = 0.6;   // seconds

const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];
const twoDigits = (n) => (n < 20 ? NUM[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + NUM[n % 10] : ""));
export function speakClock(hh, mm) {
  const h = Number(hh), m = Number(mm);
  const hs = h === 0 ? "zero" : (h < 10 ? "oh " + NUM[h] : twoDigits(h));
  if (m === 0) return hs + " hundred";
  return hs + " " + (m < 10 ? "oh " + NUM[m] : twoDigits(m));
}

export function forSpeech(text, rules) {
  let s = String(text).replace(/\b(\d{2}):(\d{2})\b/g, (x, h, m) => speakClock(h, m));
  for (const [pattern, spoken] of rules) s = s.replace(new RegExp(pattern, "g"), spoken);
  return s.replace(/ {2,}/g, " ");
}

function silence(sec, rate) { return new Float32Array(Math.round(sec * rate)); }

function wav(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

// Paragraphs as lists of sentences, exactly as the narration made them.
export function readParagraphs(data, text, useShort) {
  const n = useShort ? data && data.short : data && data.narration;
  if (n && Array.isArray(n.paragraphs)) return n.paragraphs.map((p) => p.sentences.map((x) => x.replace(/\s+/g, " ").trim()));
  if (useShort) throw new Error("no short narration for this week");
  return String(text || "").trim().split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean));
}

async function main() {
  if (!/^\d{4}-W\d{2}$/.test(week)) { console.error("usage: voice.mjs 2026-W46 [--short] [--voice id] [--speed 1] [--out file.wav]"); process.exit(1); }
  const jsonFile = path.join(ROOT, "data", week + ".json");
  const txtFile = path.join(ROOT, "data", week + ".txt");
  const paragraphs = readParagraphs(
    fs.existsSync(jsonFile) ? JSON.parse(fs.readFileSync(jsonFile, "utf8")) : null,
    fs.existsSync(txtFile) ? fs.readFileSync(txtFile, "utf8") : "", short);
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "voice", "pronunciation.json"), "utf8")).rules;
  const { KokoroTTS } = await import("kokoro-js");
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
  if (!tts.voices[voice]) throw new Error("unknown voice " + voice);

  const rate = 24000, pieces = [silence(PAUSE_EDGE, rate)];
  const timing = { voice, speed, rate, paragraphs: [] };
  let at = pieces[0].length;
  const t0 = Date.now();
  for (let p = 0; p < paragraphs.length; p++) {
    // One sentence at a time keeps Kokoro's per-call length limit far away
    // and gives every sentence the same flat delivery.
    const tp = { start: at / rate, sentences: [] };
    const sentences = paragraphs[p];
    for (let i = 0; i < sentences.length; i++) {
      const a = await tts.generate(forSpeech(sentences[i], rules), { voice, speed });
      tp.sentences.push({ start: at / rate, end: (at + a.audio.length) / rate });
      const gap = silence(i === sentences.length - 1 ? PAUSE_SECTION : PAUSE_SENTENCE, rate);
      pieces.push(a.audio, gap);
      at += a.audio.length + gap.length;
    }
    timing.paragraphs.push(tp);
    process.stdout.write("\r" + (p + 1) + "/" + paragraphs.length + " paragraphs");
  }
  pieces.push(silence(PAUSE_EDGE, rate));
  const total = pieces.reduce((n, a) => n + a.length, 0);
  const all = new Float32Array(total);
  let o = 0; for (const a of pieces) { all.set(a, o); o += a.length; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, wav(all, rate));
  timing.duration = total / rate;
  fs.writeFileSync(out.replace(/\.wav$/, "") + ".timing.json", JSON.stringify(timing, null, 1) + "\n");
  console.log("\n" + out + ": " + timing.duration.toFixed(1) + " s, voice " + voice + ", built in " + Math.round((Date.now() - t0) / 1000) + " s");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error("STOP: " + e.message); process.exit(2); });
