#!/usr/bin/env node
// Mathe des Tages – Generator
// Holt 2 Aufgaben + Lösungen von OpenAI und rendert eine self-contained,
// mobile-first HTML-Seite mit jeden Tag zufällig wechselndem Design.

import { writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs");
const ARCHIVE_DIR = join(OUT_DIR, "archive");

// ---------------------------------------------------------------------------
// Datum (Europe/Berlin) – bestimmt Seed und Dateinamen
// ---------------------------------------------------------------------------
function berlinToday() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function germanLongDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Deterministischer PRNG, geseedet aus dem Datum -> gleiches Design je Tag
// ---------------------------------------------------------------------------
function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seedStr) {
  const rng = mulberry32(xfnv1a(seedStr));
  return {
    next: rng,
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    int: (min, max) => Math.floor(rng() * (max - min + 1)) + min,
    bool: (p = 0.5) => rng() < p,
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

// ---------------------------------------------------------------------------
// Design-System: zufällige Paletten, Fonts, Layouts, Deko -> riesige Vielfalt
// ---------------------------------------------------------------------------
const PALETTES = [
  { name: "Bonbon", bg: ["#ff9a9e", "#fecfef"], card: "#fffdfa", ink: "#3a2a4d", accent: "#ff4d8d", accent2: "#7b2ff7", good: "#16a34a" },
  { name: "Ozean", bg: ["#2af598", "#009efd"], card: "#f5fbff", ink: "#06283d", accent: "#0077ff", accent2: "#00c2a8", good: "#0d9488" },
  { name: "Sonnenuntergang", bg: ["#ff512f", "#f09819"], card: "#fffaf3", ink: "#3d1f00", accent: "#ff6b00", accent2: "#d62828", good: "#15803d" },
  { name: "Galaxie", bg: ["#43cea2", "#185a9d"], card: "#f3f8ff", ink: "#0b1f33", accent: "#5b6cff", accent2: "#9b5bff", good: "#10b981" },
  { name: "Neon-Nacht", bg: ["#0f0c29", "#302b63"], card: "#1b1840", ink: "#eafff5", accent: "#00ffd5", accent2: "#ff2bd6", good: "#5eff9b", dark: true },
  { name: "Limette", bg: ["#a8ff78", "#78ffd6"], card: "#fbfffb", ink: "#123018", accent: "#22a358", accent2: "#0ea5e9", good: "#16a34a" },
  { name: "Beerenmix", bg: ["#cc2b5e", "#753a88"], card: "#fff7fb", ink: "#2a0a26", accent: "#c026d3", accent2: "#7c3aed", good: "#15803d" },
  { name: "Mango", bg: ["#f7971e", "#ffd200"], card: "#fffef5", ink: "#3a2600", accent: "#f97316", accent2: "#e11d48", good: "#15803d" },
  { name: "Eismeer", bg: ["#74ebd5", "#9face6"], card: "#fbffff", ink: "#15293a", accent: "#2563eb", accent2: "#06b6d4", good: "#0d9488" },
  { name: "Vulkan", bg: ["#231557", "#ff1361"], card: "#fff5f8", ink: "#1b0a2e", accent: "#ff1361", accent2: "#fbb034", good: "#16a34a" },
  { name: "Minze", bg: ["#00b09b", "#96c93d"], card: "#f6fffb", ink: "#06281f", accent: "#059669", accent2: "#65a30d", good: "#15803d" },
  { name: "Bubblegum-Dark", bg: ["#16002b", "#3a0066"], card: "#250042", ink: "#ffe3f7", accent: "#ff5fd2", accent2: "#5fd0ff", good: "#7bff9b", dark: true },
];

const FONT_PAIRS = [
  { display: "Fredoka", body: "Nunito", url: "Fredoka:wght@500;700&family=Nunito:wght@400;700;800" },
  { display: "Baloo 2", body: "Quicksand", url: "Baloo+2:wght@600;800&family=Quicksand:wght@400;600;700" },
  { display: "Luckiest Guy", body: "Nunito", url: "Luckiest+Guy&family=Nunito:wght@400;700;800" },
  { display: "Bungee", body: "Quicksand", url: "Bungee&family=Quicksand:wght@400;600;700" },
  { display: "Chewy", body: "Nunito", url: "Chewy&family=Nunito:wght@400;700;800" },
  { display: "Righteous", body: "Mulish", url: "Righteous&family=Mulish:wght@400;700;800" },
  { display: "Titan One", body: "Quicksand", url: "Titan+One&family=Quicksand:wght@400;600;700" },
  { display: "Paytone One", body: "Nunito", url: "Paytone+One&family=Nunito:wght@400;700;800" },
];

const EMOJI_SETS = [
  ["🧮", "✏️", "🚀", "⭐", "🎯", "🔢"],
  ["🦊", "🍕", "🌈", "🎲", "🧠", "💡"],
  ["🐙", "🍩", "⚡", "🪐", "🎈", "🧊"],
  ["🐲", "🍉", "🏆", "🎮", "🔥", "✨"],
  ["🐼", "🍪", "🛸", "🎪", "🧩", "💫"],
  ["🦖", "🥝", "🎸", "🌟", "🪄", "📐"],
];

const TITLE_WORDS = [
  "Mathe des Tages", "Zahlen-Zeit", "Mathe-Mission", "Rechen-Rakete",
  "Tages-Rätsel", "Mathe-Magie", "Zahlen-Quest", "Brain-Boost",
];

const HYPE_LINES = [
  "Zwei frische Aufgaben warten auf dich! 💪",
  "5 Minuten Mathe – du schaffst das locker! 🚀",
  "Bereit, dein Hirn aufzuwärmen? 🧠",
  "Heute schon gerechnet? Los geht's! ⭐",
  "Knack die Aufgaben des Tages! 🎯",
  "Mathe-Snack für zwischendurch. 🍪",
  "Dein tägliches Zahlen-Abenteuer. 🪐",
  "Warm-up fürs Mathe-Hirn! 🔥",
];

const PRAISE = [
  "Stark gemacht! 🎉", "Mathe-Champion! 🏆", "Du rockst das! ⚡",
  "Gehirn-Power aktiviert! 🧠", "Weiter so! 🌟", "Klasse Arbeit! 👏",
];

function buildTheme(rng, dateIso) {
  const pal = rng.pick(PALETTES);
  const fonts = rng.pick(FONT_PAIRS);
  const emojis = rng.pick(EMOJI_SETS);
  const title = rng.pick(TITLE_WORDS);
  const hype = rng.pick(HYPE_LINES);
  const praise = rng.pick(PRAISE);
  const angle = rng.int(110, 250);
  const radius = rng.int(18, 34);
  const layouts = ["blob", "dots", "grid", "rays", "confetti"];
  const bgPattern = rng.pick(layouts);
  const tilt = rng.bool(0.5);
  const stickerRotations = emojis.map(() => rng.int(-18, 18));
  return {
    pal, fonts, emojis, title, hype, praise, angle, radius,
    bgPattern, tilt, stickerRotations, dark: !!pal.dark,
  };
}

// ---------------------------------------------------------------------------
// OpenAI – holt die Aufgaben als JSON (mit Offline-Fallback)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Du bist ein erfahrener Mathematiklehrer für deutsche Schülerinnen und Schüler bis einschließlich Klasse 7.

Erstelle für HEUTE genau 2 Matheaufgaben für ein Kind, das in die 7. Klasse kommt und Mathe grundsätzlich mag.

Ziel:
- tägliches Üben von 5–10 Minuten
- Spaß an Mathe erhalten
- Grundlagen festigen
- Themen regelmäßig wiederholen

WICHTIG:
- Erzeuge jedes Mal andere Aufgaben.
- Wähle die Aufgaben zufällig aus verschiedenen Themen.
- Die Aufgaben sollen NICHT kapitelweise aufgebaut sein.
- Bereits gelernte Themen sollen regelmäßig wiederholt werden.
- Die Schwierigkeit soll abwechslungsreich sein: mal leicht, mal mittel, gelegentlich etwas schwerer.
- Verwende altersgerechte Zahlen und realistische Situationen.

Mögliche Themen: Schriftliche Addition, Schriftliche Subtraktion, Schriftliche Multiplikation, Schriftliche Division, Negative Zahlen, Brüche, Dezimalzahlen, Prozentrechnung, Dreisatz, Einfache Gleichungen, Geometrie (Umfang, Fläche, Winkel), Maßeinheiten umrechnen, Sachaufgaben/Textaufgaben, Knobelaufgaben und Logik.

Regeln:
- Gib genau 2 Aufgaben aus.
- Mindestens eine Aufgabe soll Rechnen trainieren.
- Höchstens eine Aufgabe darf eine Textaufgabe sein.
- Wiederhole Grundrechenarten regelmäßig, auch wenn sie leicht sind.
- Vermeide zu schwierige Aufgaben, die Stoff der 8. Klasse voraussetzen.
- Schreibe die Aufgaben klar und ohne lange Erklärungen.
- Gib KEINE Lösungen innerhalb des Aufgabentexts aus.

Antworte AUSSCHLIESSLICH als JSON in genau dieser Struktur:
{
  "tasks": [
    { "topic": "<Thema>", "difficulty": "leicht|mittel|schwer", "question": "<Aufgabentext>", "solution": "<Lösung mit kurzem Rechenweg>" },
    { "topic": "<Thema>", "difficulty": "leicht|mittel|schwer", "question": "<Aufgabentext>", "solution": "<Lösung mit kurzem Rechenweg>" }
  ]
}`;

function fallbackTasks(rng) {
  const a = rng.int(2345, 8999);
  const b = rng.int(1234, a - 100);
  const p = rng.pick([10, 20, 25, 50]);
  const base = rng.int(40, 160);
  return {
    tasks: [
      {
        topic: "Schriftliche Subtraktion",
        difficulty: "leicht",
        question: `Rechne schriftlich: ${a} − ${b} = ?`,
        solution: `${a} − ${b} = ${a - b}`,
      },
      {
        topic: "Prozentrechnung",
        difficulty: "mittel",
        question: `Ein Fahrrad kostet ${base} €. Im Angebot gibt es ${p} % Rabatt. Wie viel sparst du und was kostet das Fahrrad jetzt?`,
        solution: `Rabatt: ${p} % von ${base} € = ${(base * p) / 100} €. Neuer Preis: ${base} € − ${(base * p) / 100} € = ${base - (base * p) / 100} €.`,
      },
    ],
    _fallback: true,
  };
}

async function fetchTasks(dateIso, rng) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn("⚠️  Kein OPENAI_API_KEY gesetzt – nutze Fallback-Aufgaben.");
    return fallbackTasks(rng);
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const userMsg = `Erstelle die 2 Aufgaben für den Tag ${dateIso}. Variationscode: ${rng.int(1000, 9999)}. Achte darauf, dass die Aufgaben sich klar von typischen Standardaufgaben unterscheiden.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 1.0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Leere Antwort von OpenAI");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length < 2) {
      throw new Error("Antwort enthält keine 2 Aufgaben");
    }
    parsed.tasks = parsed.tasks.slice(0, 2);
    return parsed;
  } catch (err) {
    console.error("❌ OpenAI-Fehler:", err.message);
    console.warn("➡️  Nutze Fallback-Aufgaben, damit die Seite trotzdem erscheint.");
    return fallbackTasks(rng);
  }
}

// ---------------------------------------------------------------------------
// HTML-Rendering
// ---------------------------------------------------------------------------
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function backgroundCss(theme) {
  const { pal, angle, bgPattern } = theme;
  const [c1, c2] = pal.bg;
  const base = `linear-gradient(${angle}deg, ${c1}, ${c2})`;
  const overlays = {
    dots: `radial-gradient(rgba(255,255,255,.18) 2px, transparent 2px)`,
    grid: `linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)`,
    rays: `repeating-conic-gradient(from 0deg at 50% 0%, rgba(255,255,255,.08) 0deg 6deg, transparent 6deg 12deg)`,
    confetti: `radial-gradient(circle at 20% 30%, rgba(255,255,255,.25) 0 6px, transparent 7px), radial-gradient(circle at 80% 20%, rgba(255,255,255,.2) 0 5px, transparent 6px), radial-gradient(circle at 65% 70%, rgba(255,255,255,.22) 0 7px, transparent 8px)`,
    blob: "",
  };
  const overlay = overlays[bgPattern];
  if (!overlay) return `background: ${base};`;
  const sizes = {
    dots: "background-size: 22px 22px;",
    grid: "background-size: 28px 28px, 28px 28px;",
    rays: "",
    confetti: "background-size: 180px 180px;",
  };
  return `background: ${overlay}, ${base}; ${sizes[bgPattern] || ""}`;
}

function taskCard(task, idx, theme) {
  const emoji = theme.emojis[idx % theme.emojis.length];
  const rot = theme.stickerRotations[idx % theme.stickerRotations.length];
  const badges = [];
  if (task.topic) badges.push(`<span class="badge">${esc(task.topic)}</span>`);
  if (task.difficulty) {
    const diffClass = { leicht: "diff-easy", mittel: "diff-mid", schwer: "diff-hard" }[task.difficulty] || "";
    badges.push(`<span class="badge ${diffClass}">${esc(task.difficulty)}</span>`);
  }
  return `
    <article class="card" style="--tilt:${theme.tilt && idx % 2 ? "1.2deg" : "-1deg"}">
      <div class="card-num"><span class="sticker" style="transform:rotate(${rot}deg)">${emoji}</span><span class="num">Aufgabe ${idx + 1}</span></div>
      <div class="badges">${badges.join("")}</div>
      <p class="question">${esc(task.question)}</p>
      <button class="reveal" data-idx="${idx}" aria-expanded="false">
        <span class="reveal-label">Lösung anzeigen</span>
      </button>
      <div class="solution" id="sol-${idx}" hidden>
        <span class="sol-tag">Lösung</span>
        <p>${esc(task.solution)}</p>
      </div>
    </article>`;
}

function renderPage({ dateIso, dateLong, theme, data, archiveLinks }) {
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${theme.fonts.url}&display=swap`;
  const cards = data.tasks.map((t, i) => taskCard(t, i, theme)).join("\n");
  const textColor = theme.dark ? "#ffffff" : theme.pal.ink;
  const cardText = theme.dark ? theme.pal.ink : theme.pal.ink;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${theme.pal.bg[0]}">
<title>${esc(theme.title)} – ${esc(dateIso)}</title>
<meta name="description" content="Mathe des Tages – zwei frische Aufgaben für Klasse 7, jeden Tag neu.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontsUrl}">
<style>
  :root{
    --bg1:${theme.pal.bg[0]}; --bg2:${theme.pal.bg[1]};
    --card:${theme.pal.card}; --ink:${cardText}; --accent:${theme.pal.accent};
    --accent2:${theme.pal.accent2}; --good:${theme.pal.good}; --radius:${theme.radius}px;
    --display:"${theme.fonts.display}", system-ui, sans-serif;
    --body:"${theme.fonts.body}", system-ui, sans-serif;
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;padding:0}
  body{
    font-family:var(--body); color:${textColor}; min-height:100vh; min-height:100dvh;
    ${backgroundCss(theme)}
    background-attachment:fixed;
    padding:max(16px, env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom));
    display:flex; flex-direction:column; align-items:center;
  }
  .wrap{width:100%; max-width:520px; margin:0 auto}

  .seen-banner{
    display:none; align-items:center; gap:8px; width:100%;
    background:rgba(255,255,255,.92); color:#1a1a1a;
    border-radius:999px; padding:10px 16px; margin-bottom:14px;
    font-weight:800; font-size:.9rem; box-shadow:0 6px 18px rgba(0,0,0,.18);
    animation:pop .4s ease;
  }
  .seen-banner.show{display:flex}
  .seen-banner .dot{width:10px;height:10px;border-radius:50%;background:var(--good);box-shadow:0 0 0 4px rgba(0,0,0,.06)}

  header{text-align:center; color:#fff; margin:6px 0 22px}
  .date-pill{
    display:inline-block; background:rgba(255,255,255,.22); backdrop-filter:blur(6px);
    border:1px solid rgba(255,255,255,.35); color:#fff; font-weight:700;
    padding:6px 14px; border-radius:999px; font-size:.82rem; letter-spacing:.3px;
  }
  h1{
    font-family:var(--display); font-weight:800; margin:14px 0 6px;
    font-size:clamp(2rem, 9vw, 3rem); line-height:1.02; color:#fff;
    text-shadow:0 4px 0 rgba(0,0,0,.12), 0 10px 26px rgba(0,0,0,.22);
  }
  .hype{color:#fff; opacity:.96; font-weight:700; font-size:1rem; margin:0}
  .emoji-row{font-size:1.5rem; margin-top:12px; letter-spacing:6px}

  .card{
    background:var(--card); color:var(--ink); border-radius:var(--radius);
    padding:20px 18px 18px; margin:0 0 18px;
    box-shadow:0 18px 36px rgba(0,0,0,.20), 0 2px 0 rgba(0,0,0,.05);
    transform:rotate(var(--tilt)); position:relative; overflow:hidden;
  }
  .card::before{
    content:""; position:absolute; inset:0 0 auto 0; height:6px;
    background:linear-gradient(90deg, var(--accent), var(--accent2));
  }
  .card-num{display:flex; align-items:center; gap:10px; margin-bottom:8px}
  .sticker{font-size:2rem; display:inline-block; filter:drop-shadow(0 3px 4px rgba(0,0,0,.2))}
  .num{font-family:var(--display); font-weight:700; font-size:1.15rem; color:var(--accent2)}
  .badges{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px}
  .badge{
    font-size:.72rem; font-weight:800; padding:4px 10px; border-radius:999px;
    background:color-mix(in srgb, var(--accent) 14%, white); color:var(--accent);
    text-transform:uppercase; letter-spacing:.4px;
  }
  .diff-easy{background:color-mix(in srgb, var(--good) 16%, white); color:var(--good)}
  .diff-mid{background:#fff2d6; color:#b45309}
  .diff-hard{background:#ffe0e0; color:#c0264a}
  .question{font-size:1.18rem; line-height:1.5; font-weight:600; margin:4px 0 16px; white-space:pre-wrap}

  .reveal{
    width:100%; border:none; cursor:pointer; font-family:var(--display);
    font-weight:700; font-size:1rem; color:#fff; padding:13px 16px; border-radius:14px;
    background:linear-gradient(135deg, var(--accent), var(--accent2));
    box-shadow:0 8px 18px color-mix(in srgb, var(--accent) 40%, transparent);
    transition:transform .12s ease, filter .12s ease;
  }
  .reveal:active{transform:scale(.97)}
  .reveal.open{filter:saturate(.7) brightness(.95)}

  .solution{
    margin-top:14px; padding:14px 16px; border-radius:14px;
    background:color-mix(in srgb, var(--good) 10%, white);
    border:2px dashed color-mix(in srgb, var(--good) 45%, white);
    animation:pop .35s ease;
  }
  .solution p{margin:6px 0 0; font-size:1.05rem; line-height:1.5; font-weight:600; white-space:pre-wrap}
  .sol-tag{
    display:inline-block; font-family:var(--display); font-weight:700; font-size:.8rem;
    color:#fff; background:var(--good); padding:3px 10px; border-radius:999px;
  }

  .footer{text-align:center; color:#fff; margin-top:8px; font-size:.82rem; opacity:.9}
  .footer a{color:#fff; font-weight:800}
  .archive{margin-top:10px}
  .archive summary{cursor:pointer; color:#fff; font-weight:800; opacity:.95}
  .archive ul{list-style:none; padding:0; margin:10px 0 0; display:flex; flex-wrap:wrap; gap:8px; justify-content:center}
  .archive a{
    background:rgba(255,255,255,.2); color:#fff; padding:6px 12px; border-radius:999px;
    text-decoration:none; font-weight:700; font-size:.8rem; border:1px solid rgba(255,255,255,.3)
  }

  @keyframes pop{from{opacity:0; transform:translateY(8px) scale(.98)} to{opacity:1; transform:none}}
  @media (prefers-reduced-motion: reduce){*{animation:none !important; transition:none !important}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="seen-banner" id="seenBanner">
      <span class="dot"></span>
      <span id="seenText">Lösungen heute schon angeschaut 👀</span>
    </div>

    <header>
      <span class="date-pill">${esc(dateLong)}</span>
      <h1>${esc(theme.title)}</h1>
      <p class="hype">${esc(theme.hype)}</p>
      <div class="emoji-row">${theme.emojis.slice(0, 5).join(" ")}</div>
    </header>

    <main>
      ${cards}
    </main>

    <div class="footer">
      <details class="archive">
        <summary>Frühere Tage 📅</summary>
        <ul>${archiveLinks}</ul>
      </details>
      <p style="margin-top:14px">Jeden Tag neu · automatisch erstellt 🤖</p>
    </div>
  </div>

<script>
(function(){
  var DAY = ${JSON.stringify(dateIso)};
  var KEY = "mdt_solutions_seen_" + DAY;
  var PRAISE = ${JSON.stringify(theme.praise)};

  function setCookie(name, val, days){
    var d = new Date();
    d.setTime(d.getTime() + days*24*60*60*1000);
    document.cookie = name + "=" + val + ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax";
  }
  function getCookie(name){
    return document.cookie.split("; ").reduce(function(acc, c){
      var p = c.split("=");
      return p[0] === name ? decodeURIComponent(p.slice(1).join("=")) : acc;
    }, "");
  }

  var banner = document.getElementById("seenBanner");
  var seenText = document.getElementById("seenText");

  function markSeen(){
    setCookie(KEY, "1", 7);
    banner.classList.add("show");
    seenText.textContent = "Lösungen heute schon angeschaut " + PRAISE;
  }

  // Beim Laden prüfen: hat man heute die Lösungen schon gesehen?
  if (getCookie(KEY) === "1") {
    banner.classList.add("show");
    seenText.textContent = "Lösungen heute schon angeschaut " + PRAISE;
  }

  document.querySelectorAll(".reveal").forEach(function(btn){
    btn.addEventListener("click", function(){
      var idx = btn.getAttribute("data-idx");
      var sol = document.getElementById("sol-" + idx);
      var open = !sol.hidden;
      if (open){
        sol.hidden = true;
        btn.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        btn.querySelector(".reveal-label").textContent = "Lösung anzeigen";
      } else {
        sol.hidden = false;
        btn.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
        btn.querySelector(".reveal-label").textContent = "Lösung verstecken";
        markSeen();
      }
    });
  });
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Archiv-Links einsammeln
// ---------------------------------------------------------------------------
async function collectArchiveLinks(currentIso) {
  if (!existsSync(ARCHIVE_DIR)) return "";
  const files = (await readdir(ARCHIVE_DIR))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace(".html", ""))
    .filter((d) => d !== currentIso)
    .sort()
    .reverse()
    .slice(0, 14);
  if (!files.length) return `<li style="color:#fff;opacity:.8;list-style:none">Noch kein Archiv 🐣</li>`;
  return files
    .map((d) => `<li><a href="archive/${d}.html">${d}</a></li>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dateIso = process.env.MDT_DATE || berlinToday();
  const dateLong = germanLongDate(dateIso);
  const rng = makeRng(dateIso + "-mathe-des-tages");
  const theme = buildTheme(rng, dateIso);

  console.log(`📅 ${dateIso} | 🎨 ${theme.pal.name} + ${theme.fonts.display}`);

  const data = await fetchTasks(dateIso, rng);

  await mkdir(ARCHIVE_DIR, { recursive: true });

  // Archiv-Datei des Tages zuerst schreiben, dann Links sammeln, dann index
  const archivePath = join(ARCHIVE_DIR, `${dateIso}.html`);
  const archiveLinks = await collectArchiveLinks(dateIso);
  const html = renderPage({ dateIso, dateLong, theme, data, archiveLinks });

  await writeFile(archivePath, html, "utf8");
  await writeFile(join(OUT_DIR, "index.html"), html, "utf8");
  await writeFile(join(OUT_DIR, ".nojekyll"), "", "utf8");

  if (data._fallback) {
    console.log("ℹ️  (Fallback-Aufgaben verwendet)");
  }
  console.log(`✅ Geschrieben: docs/index.html + docs/archive/${dateIso}.html`);
}

main().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
