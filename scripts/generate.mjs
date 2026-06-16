#!/usr/bin/env node
// Mathe des Tages – Generator
// Holt pro Klasse 2 Aufgaben + Lösungen von OpenAI und rendert self-contained,
// mobile-first HTML-Seiten mit jeden Tag zufällig wechselndem Design.

import { writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs");

// Lokale .env automatisch laden (falls vorhanden). Im CI kommen die Werte
// aus den GitHub-Secrets; existiert keine .env, passiert hier einfach nichts.
try {
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
} catch {
  /* .env optional – Fehler ignorieren */
}

// ===========================================================================
// KLASSEN-KONFIGURATION
// ---------------------------------------------------------------------------
// Hier neue Klassen einfach ergänzen. `enabled: true` schaltet sie live.
// `entersGrade` = die Klasse, in die das Kind kommt (steuert Niveau + Prompt).
// ===========================================================================
const DEFAULT_TOPICS = [
  "Schriftliche Addition",
  "Schriftliche Subtraktion",
  "Schriftliche Multiplikation",
  "Schriftliche Division",
  "Negative Zahlen",
  "Brüche",
  "Dezimalzahlen",
  "Prozentrechnung",
  "Dreisatz",
  "Einfache Gleichungen",
  "Geometrie (Umfang, Fläche, Winkel)",
  "Maßeinheiten umrechnen",
  "Sachaufgaben/Textaufgaben",
  "Knobelaufgaben und Logik",
];

const GRADES = [
  {
    slug: "klasse-6",
    label: "Klasse 6",
    entersGrade: 6,
    enabled: true,
    // Für Klasse 6 etwas reduziert (Dreisatz/Prozent noch zurückhaltend).
    topics: [
      "Schriftliche Addition",
      "Schriftliche Subtraktion",
      "Schriftliche Multiplikation",
      "Schriftliche Division",
      "Negative Zahlen",
      "Brüche",
      "Dezimalzahlen",
      "Einfache Prozentrechnung (10 %, 25 %, 50 %)",
      "Einfache Gleichungen",
      "Geometrie (Umfang, Fläche, Winkel)",
      "Maßeinheiten umrechnen",
      "Sachaufgaben/Textaufgaben",
      "Knobelaufgaben und Logik",
    ],
  },
];

export function enabledGrades() {
  return GRADES.filter((g) => g.enabled);
}

// ---------------------------------------------------------------------------
// Datum (Europe/Berlin) – bestimmt Seed und Dateinamen
// ---------------------------------------------------------------------------
export function berlinToday() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

export function germanLongDate(iso) {
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
// Deterministischer PRNG, geseedet aus Datum (+Klasse) -> stabiles Tagesdesign
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

// Schriften, aus denen die KI wählen darf (Name -> Google-Fonts-Token).
// Garantiert ladbar – die KI erfindet nur die Kombination, nicht den Font selbst.
const DISPLAY_FONTS = {
  "Fredoka": "Fredoka:wght@500;700",
  "Baloo 2": "Baloo+2:wght@600;800",
  "Luckiest Guy": "Luckiest+Guy",
  "Bungee": "Bungee",
  "Chewy": "Chewy",
  "Righteous": "Righteous",
  "Titan One": "Titan+One",
  "Paytone One": "Paytone+One",
  "Bangers": "Bangers",
  "Boogaloo": "Boogaloo",
  "Lilita One": "Lilita+One",
  "Concert One": "Concert+One",
  "Shrikhand": "Shrikhand",
  "Gluten": "Gluten:wght@600;800",
  "Patrick Hand": "Patrick+Hand",
};
const BODY_FONTS = {
  "Nunito": "Nunito:wght@400;700;800",
  "Quicksand": "Quicksand:wght@400;600;700",
  "Mulish": "Mulish:wght@400;700;800",
  "Rubik": "Rubik:wght@400;600;800",
  "Varela Round": "Varela+Round",
};

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

// Layout-Stile (feste, polierte Skins). Die KI wählt täglich einen davon.
const STYLES = ["soft", "playful", "bold", "minimal", "editorial"];

const nonEmpty = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);

// Normalisiert #rgb oder #rrggbb -> #rrggbb (sonst null). Toleriert Kurzform,
// damit ein KI-Wert wie "#fff" nicht das ganze Design verwirft.
function normalizeHex(c) {
  if (typeof c !== "string") return null;
  const v = c.trim();
  let m = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (m) return "#" + m[1].toLowerCase();
  m = /^#([0-9a-fA-F]{3})$/.exec(v);
  if (m) return "#" + m[1].split("").map((h) => h + h).join("").toLowerCase();
  return null;
}

// Palette aus KI-Spec, falls alle Farben gültige HEX-Werte sind – sonst null.
function paletteFromAI(spec) {
  if (!spec) return null;
  const keys = ["bg1", "bg2", "card", "ink", "accent", "accent2", "good"];
  const c = {};
  for (const k of keys) {
    const hex = normalizeHex(spec[k]);
    if (!hex) return null;
    c[k] = hex;
  }
  return {
    name: nonEmpty(spec.themeName) || "KI-Design",
    bg: [c.bg1, c.bg2],
    card: c.card,
    ink: c.ink,
    accent: c.accent,
    accent2: c.accent2,
    good: c.good,
    dark: !!spec.dark,
  };
}

// Schrift-Paar aus KI-Spec, falls beide Fonts in der erlaubten Liste sind.
function fontsFromAI(spec) {
  if (!spec) return null;
  const disp = spec.displayFont;
  const body = spec.bodyFont;
  if (DISPLAY_FONTS[disp] && BODY_FONTS[body]) {
    return { display: disp, body, url: `${DISPLAY_FONTS[disp]}&family=${BODY_FONTS[body]}` };
  }
  return null;
}

// Prüft/sichert das von der KI gelieferte CSS. Gibt null zurück, wenn es fehlt
// oder unsicher/zu kurz ist (dann greift das eingebaute Design).
function sanitizeAiCss(css) {
  if (typeof css !== "string") return null;
  let s = css.trim();
  if (s.length < 200) return null; // zu wenig -> vermutlich unbrauchbar
  if (/<\s*script/i.test(s) || /javascript:/i.test(s) || /expression\s*\(/i.test(s)) return null;
  if (/<\/?\s*style/i.test(s)) return null; // kein Ausbruch aus <style>
  // @import nur von Google Fonts zulassen
  const imports = s.match(/@import[^;]+;/gi) || [];
  if (imports.some((imp) => !/fonts\.googleapis\.com/i.test(imp))) return null;
  if (s.includes("<")) return null; // generell keine spitzen Klammern im CSS
  return s;
}

// Prüft einen CSS-background-Wert von der KI (nur reine Farb-/Verlaufswerte).
function validateBgCss(s) {
  if (typeof s !== "string") return null;
  const v = s.trim();
  if (v.length < 6 || v.length > 2000) return null;
  if (/[<>]/.test(v)) return null;
  if (/url\s*\(/i.test(v) || /@import|expression\s*\(|javascript:/i.test(v)) return null;
  if (!/(gradient|#[0-9a-f]{3,6}|rgb|hsl)/i.test(v)) return null;
  return v;
}

// Prüft/sichert ein abstraktes Hintergrund-SVG von der KI.
function sanitizeBgSvg(s) {
  if (typeof s !== "string") return null;
  let v = s.trim();
  if (v.length < 30 || v.length > 9000) return null;
  if (!/^<svg[\s\S]*<\/svg>$/i.test(v)) return null;
  if (/<\s*script|<\s*style|<\s*image|<\s*foreignObject/i.test(v)) return null;
  if (/javascript:|\son[a-z]+\s*=/i.test(v)) return null;
  if (/(?:xlink:)?href\s*=\s*["']?\s*https?:/i.test(v)) return null;
  // Vollflächig skalieren lassen
  if (!/preserveAspectRatio/i.test(v)) v = v.replace(/<svg/i, '<svg preserveAspectRatio="xMidYMid slice"');
  return v;
}

// Hintergrund aus KI-Spec: CSS-Verlauf oder abstraktes SVG (sonst null -> prozedural).
function backgroundFromAI(spec, preferSvg) {
  if (!spec) return null;
  const svg = sanitizeBgSvg(spec.bgSvg);
  const css = validateBgCss(spec.bgCss);
  if (preferSvg) {
    if (svg) return { type: "svg", svg };
    if (css) return { type: "css", css };
  } else {
    if (css) return { type: "css", css };
    if (svg) return { type: "svg", svg };
  }
  return null;
}

// Baut das finale Theme. Wenn `spec` (von der KI) vorhanden und gültig ist,
// werden dessen Felder genutzt – jedes Feld einzeln, mit Zufalls-Fallback.
function buildTheme(rng, spec = null, opts = {}) {
  const pal = paletteFromAI(spec) || rng.pick(PALETTES);
  const fonts = fontsFromAI(spec) || rng.pick(FONT_PAIRS);
  const emojis =
    Array.isArray(spec?.emojis) && spec.emojis.filter((e) => typeof e === "string").length >= 5
      ? spec.emojis.filter((e) => typeof e === "string").slice(0, 6)
      : rng.pick(EMOJI_SETS);
  const title = nonEmpty(spec?.title)?.slice(0, 26) || rng.pick(TITLE_WORDS);
  const hype = nonEmpty(spec?.hype) || rng.pick(HYPE_LINES);
  const praise = nonEmpty(spec?.praise) || rng.pick(PRAISE);
  const layouts = ["blob", "dots", "grid", "rays", "confetti"];
  const bgPattern = layouts.includes(spec?.bgPattern) ? spec.bgPattern : rng.pick(layouts);
  const angle = rng.int(110, 250);
  const radius = rng.int(18, 34);
  const tilt = rng.bool(0.5);
  const stickerRotations = emojis.map(() => rng.int(-18, 18));
  // Standard: festes, poliertes Layout (nur Farben/Schriften von der KI).
  // Optional kann die KI das komplette CSS schreiben (MDT_AI_CSS=1).
  const css = process.env.MDT_AI_CSS === "1" ? sanitizeAiCss(spec?.css) : null;
  const themeName = nonEmpty(spec?.themeName) || pal.name;
  const themeColor = normalizeHex(spec?.themeColor) || pal.bg[0];
  const style = opts.style && STYLES.includes(opts.style)
    ? opts.style
    : STYLES.includes(spec?.style) ? spec.style : rng.pick(STYLES);
  const bg = backgroundFromAI(spec, !!opts.wantSvg);
  return {
    pal, fonts, emojis, title, hype, praise, angle, radius, bgPattern, tilt, stickerRotations, style, bg,
    dark: !!pal.dark, css, themeName, themeColor, aiDesign: !!(css || paletteFromAI(spec)),
  };
}

// ---------------------------------------------------------------------------
// OpenAI – holt die Aufgaben als JSON (mit Offline-Fallback), pro Klasse
// ---------------------------------------------------------------------------
function buildSystemPrompt(grade) {
  return `Du bist ein erfahrener Mathematiklehrer für deutsche Schülerinnen und Schüler bis einschließlich Klasse ${grade.entersGrade}.

Erstelle für HEUTE genau 2 Matheaufgaben für ein Kind, das in die ${grade.entersGrade}. Klasse kommt und Mathe grundsätzlich mag.

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
- Verwende DEUTLICH häufiger Dezimalzahlen (Kommazahlen): etwa die Hälfte der Aufgaben soll mit Kommazahlen rechnen (Geld in €, Längen in m/cm, Gewichte in kg/g, Messwerte). Nutze das deutsche Komma als Dezimaltrennzeichen (z. B. 12,5).
- Baue regelmäßig (etwa jede zweite bis dritte Aufgabe) eine Aufgabe ein, bei der ausdrücklich SCHRIFTLICH gerechnet werden soll (schriftliche Addition, Subtraktion, Multiplikation oder Division). Formuliere das klar in der Aufgabe, z. B. "Rechne schriftlich".
- Zeige bei einer SCHRIFTLICH-Aufgabe in "solution" den schriftlichen Rechenweg nachvollziehbar (Teilschritte bzw. Überträge, gern über mehrere Zeilen mit \\n), nicht nur das Endergebnis.

Mögliche Themen: ${grade.topics.join(", ")}.

Regeln:
- Gib genau 2 Aufgaben aus.
- Mindestens eine Aufgabe soll Rechnen trainieren.
- Es müssen NICHT beide Aufgaben Textaufgaben sein. Reine Rechenaufgaben (z. B. nur ein Term oder eine Rechnung zum Ausrechnen, ganz ohne eingekleidete Geschichte) sind ausdrücklich erwünscht und sollen regelmäßig vorkommen.
- Höchstens eine Aufgabe darf eine Textaufgabe sein.
- Wiederhole Grundrechenarten regelmäßig, auch wenn sie leicht sind.
- Vermeide zu schwierige Aufgaben, die Stoff der ${grade.entersGrade + 1}. Klasse voraussetzen.
- Schreibe die Aufgaben klar und ohne lange Erklärungen.
- LOGIK-PRÜFUNG (sehr wichtig): Aufgabentext, gefragte Größe und Lösung müssen exakt zusammenpassen und logisch widerspruchsfrei sein. Prüfe jede Aufgabe vor der Ausgabe gegen, indem du sie selbst löst – stimmt die Frage mit der Rechnung überein? Wenn nicht, formuliere um. Die Aufgabe muss eine echte Rechnung erfordern (nicht trivial, z. B. „wie viel ist drin" nach dem Einfüllen).
- Bei Behälter-/Mengenaufgaben unterscheide sauber: „Wie viel passt noch hinein / ist noch frei?" = Gesamtmenge − Inhalt (Restkapazität, freier Platz). „Wie viel ist enthalten / drin?" = die eingefüllte Menge selbst. Verwende GENAU die Formulierung, die zur Rechnung passt – verwechsle „freier Platz" nicht mit „übriges Wasser". Falsch: „Wasserkocher fasst 1,7 l, du füllst 0,75 l ein – wie viel Wasser bleibt übrig?". Richtig: „… wie viel Liter passen noch hinein, bis er voll ist?".
- Halte Szenarien realistisch und eindeutig (keine Doppeldeutigkeiten, sinnvolle Größen und Einheiten).
- Gib KEINE Lösungen innerhalb des Aufgabentexts aus.
- WICHTIG: Jede Aufgabe muss GENAU EIN eindeutiges Endergebnis haben, das ein Kind in ein Eingabefeld tippen kann (eine Zahl, ggf. mit Einheit, oder ein einfacher Bruch). Stelle die Frage so, dass nur EIN Wert gefragt ist – nicht "wie viel sparst du UND was kostet es", sondern frage nur nach einem davon.
- "answer" enthält NUR dieses Endergebnis (z. B. "351", "3/8", "12,5", "45 €").
- "accept" listet weitere gültige Schreibweisen desselben Ergebnisses (z. B. ["0.375"] für 3/8, ["45","45€"] für 45 €). Leeres Array, wenn keine nötig.
- "solution" ist der kurze Rechenweg (wird erst nach dem letzten Versuch angezeigt).
- "hint": ein super praktischer Tipp, wie ihn ein geduldiger Nachhilfelehrer einem 11-jährigen Kind geben würde. Er erscheint nur, wenn das Kind im ersten Versuch falsch liegt, und darf das Ergebnis NICHT verraten.
  WICHTIG für den Tipp:
  * Alltagssprache, KEINE abstrakten Fachbegriffe wie "Stellenwert", "gleichnamig machen", "Distributivgesetz", "Proportionalität".
  * Nenne einen KONKRETEN, anfassbaren Trick oder ersten Schritt – am besten mit den Zahlen aus der Aufgabe.
  * Schreibe in GANZ KURZEN, EINFACHEN Sätzen, wie man mit einem Kind spricht. Keine verschachtelten Nebensätze, keine umständlichen Formulierungen. Lieber zwei kurze Sätze als einen langen.
  * Beginne mit "Tipp:".
  Beispiele (schlecht -> gut):
  - "3,2 × 4": schlecht "Beachte die Stellenwerte." -> gut "Tipp: Lass das Komma erst weg und rechne 32 × 4. Das Komma kommt am Ende wieder rein."
  - "45,6 : 7": schlecht "Teile zuerst 456 durch 7 und kümmere dich danach um das Komma bei der restlichen Division." -> gut "Tipp: Rechne ganz normal. Sobald du beim Komma bist, setzt du im Ergebnis auch eins."
  - "1/2 + 1/4": schlecht "Mache die Brüche gleichnamig." -> gut "Tipp: Eine Hälfte sind zwei Viertel. Dann zählst du nur noch Viertel zusammen."
  - "25 % von 60 €": schlecht "Wende die Prozentformel an." -> gut "Tipp: 25 % ist ein Viertel. Teil den Preis einfach durch 4."

Antworte AUSSCHLIESSLICH als JSON in genau dieser Struktur:
{
  "tasks": [
    { "topic": "<Thema>", "difficulty": "leicht|mittel|schwer", "question": "<Aufgabentext>", "answer": "<einzelnes Endergebnis>", "accept": ["<weitere gültige Schreibweisen>"], "hint": "<kurzer Tipp ohne das Ergebnis>", "solution": "<kurzer Rechenweg>" },
    { "topic": "<Thema>", "difficulty": "leicht|mittel|schwer", "question": "<Aufgabentext>", "answer": "<einzelnes Endergebnis>", "accept": ["<weitere gültige Schreibweisen>"], "hint": "<kurzer Tipp ohne das Ergebnis>", "solution": "<kurzer Rechenweg>" }
  ]
}`;
}

function fallbackTasks(rng, grade) {
  const small = grade.entersGrade <= 6;
  const a = rng.int(small ? 1234 : 2345, small ? 6999 : 8999);
  const b = rng.int(1100, a - 100);
  const p = rng.pick([10, 25, 50]);
  const base = rng.pick([40, 60, 80, 120]);
  const newPrice = base - (base * p) / 100;
  return {
    tasks: [
      {
        topic: "Schriftliche Subtraktion",
        difficulty: "leicht",
        question: `Rechne schriftlich: ${a} − ${b} = ?`,
        answer: `${a - b}`,
        accept: [],
        hint: "Tipp: Schreibe die Zahlen genau untereinander (Einer unter Einer) und rechne von rechts nach links. Wenn oben zu wenig steht, borg dir 1 von der Nachbarzahl links.",
        solution: `${a} − ${b} = ${a - b}`,
      },
      {
        topic: "Einfache Prozentrechnung",
        difficulty: "mittel",
        question: `Ein Spiel kostet ${base} €. Es gibt ${p} % Rabatt. Was kostet es jetzt?`,
        answer: `${newPrice} €`,
        accept: [`${newPrice}`, `${newPrice}€`],
        hint: `Tipp: Rechne erst aus, wie viel ${p} % von ${base} € sind (der Rabatt), und ziehe diesen Betrag dann vom Preis ab.`,
        solution: `Rabatt: ${p} % von ${base} € = ${(base * p) / 100} €. Neuer Preis: ${base} € − ${(base * p) / 100} € = ${newPrice} €.`,
      },
    ],
    _fallback: true,
  };
}

async function fetchTasks(dateIso, rng, grade) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn(`⚠️  [${grade.label}] Kein OPENAI_API_KEY – nutze Fallback-Aufgaben.`);
    return fallbackTasks(rng, grade);
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const userMsg = `Erstelle die 2 Aufgaben für den Tag ${dateIso} (${grade.label}). Variationscode: ${rng.int(1000, 9999)}. Achte darauf, dass die Aufgaben sich klar von typischen Standardaufgaben unterscheiden.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 1.0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(grade) },
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
    console.error(`❌ [${grade.label}] OpenAI-Fehler:`, err.message);
    console.warn(`➡️  [${grade.label}] Nutze Fallback-Aufgaben, damit die Seite trotzdem erscheint.`);
    return fallbackTasks(rng, grade);
  }
}

// ---------------------------------------------------------------------------
// OpenAI – lässt die KI das Tages-Design erfinden (strukturiert, validiert)
// ---------------------------------------------------------------------------
function buildDesignPrompt(grade) {
  const displayList = Object.keys(DISPLAY_FONTS).join(", ");
  const bodyList = Object.keys(BODY_FONTS).join(", ");
  return `Du gestaltest die TAGES-OPTIK einer modernen, mobilen Mathe-App für Jugendliche
(ca. 11–13 Jahre, ${grade.label}). Das Layout und der Titel ("Daily Mathe") sind FEST – du wählst
Farbwelt, Schriften, Layout-Stil und vor allem einen KREATIVEN HINTERGRUND. Stecke deine
Kreativität in den Hintergrund: er soll täglich deutlich anders wirken.

Gib AUSSCHLIESSLICH JSON in genau dieser Struktur zurück:
{
  "themeName": "<kurzer Name der Optik, nur fürs Log>",
  "bg1": "#rrggbb", "bg2": "#rrggbb",         // einfacher Basis-Verlauf (Fallback, falls bgCss/bgSvg fehlt)
  "card": "#rrggbb",                          // Kartenfläche – meist sehr hell
  "ink": "#rrggbb",                           // Textfarbe auf der Karte – stark kontrastierend zu card
  "accent": "#rrggbb", "accent2": "#rrggbb",  // zwei kräftige Akzentfarben (Buttons)
  "good": "#rrggbb",                          // freundliches Grün für "richtig"/Lösung
  "dark": true/false,                         // true, wenn der Hintergrund dunkel ist
  "displayFont": "<eine Schrift aus der Display-Liste>",
  "bodyFont": "<eine Schrift aus der Body-Liste>",
  "style": "<einer von: soft, playful, bold, minimal, editorial>",
  "bgType": "css" | "svg",
  "bgCss": "<vollständiger CSS-background-Wert, wenn bgType=css>",
  "bgSvg": "<ganzflächiges, abstraktes SVG, wenn bgType=svg>",
  "themeColor": "#rrggbb"
}

HINTERGRUND (der kreative Teil – sei mutig!):
- "style" und "bgType" werden dir im Auftrag vorgegeben – halte dich exakt daran.
- bgType=css → "bgCss" ist EIN gültiger CSS-background-Wert. Sei kreativ: mehrlagige
  linear-/radial-/conic-Verläufe, Mesh-Gradients, weiche Farbflächen, dezente Muster.
  Beispiel: "radial-gradient(120% 80% at 10% 0%, #ff8a3d, transparent 60%), linear-gradient(160deg, #2b1055, #7597de)".
  KEIN url(), kein <, kein @import – nur reine CSS-Farb-/Verlaufswerte.
- bgType=svg → "bgSvg" ist ein eigenständiges, abstraktes, ganzflächiges SVG (Wellen, Blobs,
  geometrische Formen, weiche Farbverläufe). Regeln: <svg ...>…</svg> mit viewBox; nur Formen,
  <defs>/Gradients erlaubt; KEIN <script>, KEIN <style>, KEIN <image>, KEINE externen URLs,
  keine on...-Attribute. Eher ruhig/flächig, nicht zu kleinteilig.
- Halte den OBEREN Bereich des Hintergrunds ruhig/kräftig genug, dass weißer Text gut lesbar ist (oder dark:true).

Der vorgegebene "style" bestimmt das Layout-Gefühl:
- soft = freundlich, runde Karten, sanfte Schatten
- playful = verspielt, Emojis/Sticker, extra rund, lebhaft
- bold = kräftig, dicke Rahmen, harte Offset-Schatten (Neobrutalismus)
- minimal = clean, viel Weißraum, dezente Akzente
- editorial = magazinartig, elegante Typo, feine Linien

WICHTIG:
- Alle Farben als 6-stelliger HEX-Wert (#rrggbb).
- "card" und "ink" müssen STARK kontrastieren (heller Card + dunkle ink). Buttons (accent/accent2) mit weißem Text gut lesbar.
- "displayFont" NUR aus dieser Liste: ${displayList}.
- "bodyFont" NUR aus dieser Liste: ${bodyList}.
- Wähle Schriften passend zum Thema und bewusst abwechslungsreich.
Stecke die meiste Kreativität in den Hintergrund.`;
}

async function fetchDesign(dateIso, rng, grade, { style, wantSvg } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || process.env.MDT_AI_DESIGN === "0") return null; // ohne Key/abgeschaltet: Zufallsdesign
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const bgType = wantSvg ? "svg" : "css";
  const userMsg = `Entwirf das Design für den ${dateIso} (${grade.label}). Variationscode: ${rng.int(1000, 9999)}.
VORGABE für heute: "style"="${style}", "bgType"="${bgType}". Halte dich daran und liefere ${
    wantSvg ? "ein abstraktes, ganzflächiges bgSvg" : "einen kreativen, mehrlagigen bgCss-Verlauf"
  }. Wähle dazu eine frische, dazu passende Farbwelt und Schriften.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 1.05,
        max_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildDesignPrompt(grade) },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Leere Design-Antwort");
    return JSON.parse(content);
  } catch (err) {
    console.warn(`   🎨 [${grade.label}] KI-Design nicht verfügbar (${err.message}) – nutze Zufallsdesign.`);
    return null;
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
  const tags = [];
  if (task.topic) tags.push(`<span class="tag">${esc(task.topic)}</span>`);
  if (task.difficulty) {
    const diffClass = { leicht: "tag--easy", mittel: "tag--mid", schwer: "tag--hard" }[task.difficulty] || "";
    tags.push(`<span class="tag ${diffClass}">${esc(task.difficulty)}</span>`);
  }
  const sticker = theme.emojis[idx % theme.emojis.length];
  return `
    <article class="task">
      <div class="task__head">
        <span class="task__sticker">${sticker}</span>
        <span class="task__index">Aufgabe ${idx + 1}</span>
        <div class="task__tags">${tags.join("")}</div>
      </div>
      <p class="task__question">${esc(task.question)}</p>
      <form class="answer" data-idx="${idx}">
        <input class="answer__input" id="answer-${idx}" type="text" inputmode="text"
          autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Deine Antwort …">
        <button class="answer__check" type="submit" data-idx="${idx}">Prüfen</button>
      </form>
      <div class="task__actions">
        <button type="button" class="chip-btn hint-toggle" id="hinttoggle-${idx}" data-idx="${idx}">💡 Tipp anzeigen</button>
        <button type="button" class="chip-btn scratch-toggle" id="scratchtoggle-${idx}" data-idx="${idx}">✏️ Zettel</button>
      </div>
      <div class="scratch" id="scratch-${idx}" hidden>
        <div class="scratch__bar">
          <button type="button" class="scratch__tool is-active" data-idx="${idx}" data-tool="pen">✏️ Stift</button>
          <button type="button" class="scratch__tool" data-idx="${idx}" data-tool="eraser">🧽 Radierer</button>
          <button type="button" class="scratch__clear" data-idx="${idx}">🗑️ Leeren</button>
        </div>
        <canvas class="scratch__canvas" id="canvas-${idx}"></canvas>
      </div>
      <p class="attempt" id="attempt-${idx}" hidden></p>
      <div class="hint" id="hint-${idx}" hidden>
        <span class="hint__label">Tipp</span>
        <p class="hint__text">${esc(task.hint || "Überlege, welche Rechenart hier passt, und geh Schritt für Schritt vor.")}</p>
      </div>
      <div class="solution" id="solution-${idx}" hidden>
        <span class="solution__label">Lösung</span>
        <p class="solution__text">${esc(task.solution)}</p>
      </div>
    </article>`;
}

function gradeSwitcher(allGrades, current) {
  if (allGrades.length < 2) return "";
  const links = allGrades
    .map((g) => {
      const active = g.slug === current.slug;
      const href = active ? "#" : `../${g.slug}/`;
      return `<a class="grade-link${active ? " is-active" : ""}" href="${href}">${esc(g.label)}</a>`;
    })
    .join("");
  return `<nav class="grade-switch">${links}</nav>`;
}

// Eingebautes, poliertes Design – die KI liefert nur Farben/Schriften, das Layout ist fest & hochwertig.
function builtinCss(theme) {
  const bodyBg = theme.bg && theme.bg.type === "css" ? `background:${theme.bg.css};` : backgroundCss(theme);
  return `
  :root{
    --card:${theme.pal.card}; --ink:${theme.pal.ink}; --accent:${theme.pal.accent};
    --accent2:${theme.pal.accent2}; --good:${theme.pal.good}; --radius:${Math.max(20, theme.radius)}px;
    --display:"${theme.fonts.display}", system-ui, sans-serif;
    --body:"${theme.fonts.body}", system-ui, sans-serif;
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;padding:0}
  body{
    font-family:var(--body); color:#fff; min-height:100vh; min-height:100dvh; line-height:1.55;
    ${bodyBg} background-attachment:fixed; position:relative;
    padding:max(20px, env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom));
    display:flex; justify-content:center;
  }
  body::before{content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
    background:
      radial-gradient(60% 50% at 12% -5%, rgba(255,255,255,.16), transparent 70%),
      radial-gradient(55% 45% at 105% 105%, rgba(0,0,0,.14), transparent 70%);}
  .bg-art{position:fixed; inset:0; z-index:0; overflow:hidden; pointer-events:none}
  .bg-art svg{width:100%; height:100%; display:block}
  .app{width:100%; max-width:540px; position:relative; z-index:1}

  .grade-switch{display:flex; gap:8px; justify-content:center; margin-bottom:18px}
  .grade-link{background:rgba(255,255,255,.16); color:#fff; padding:8px 16px; border-radius:12px;
    text-decoration:none; font-weight:700; font-size:.85rem; border:1px solid rgba(255,255,255,.28);
    backdrop-filter:blur(6px)}
  .grade-link.is-active{background:#fff; color:var(--accent2)}

  .app-header{text-align:center; margin:4px 0 24px}
  .kicker{display:inline-flex; gap:8px; justify-content:center; align-items:center; flex-wrap:wrap; margin-bottom:16px}
  .kicker__date,.kicker__class{font-size:.76rem; font-weight:800; padding:7px 14px; border-radius:999px}
  .kicker__date{background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.3); color:#fff; backdrop-filter:blur(6px)}
  .kicker__class{background:#fff; color:var(--accent2); box-shadow:0 4px 14px rgba(0,0,0,.12)}
  .app-title{font-family:var(--display); font-weight:800; margin:0 0 8px;
    font-size:clamp(2.1rem,9vw,3rem); line-height:1.04; color:#fff; letter-spacing:-.5px;
    text-shadow:0 2px 0 rgba(0,0,0,.08), 0 14px 30px rgba(0,0,0,.22)}
  .app-tagline{margin:0; color:#fff; opacity:.94; font-weight:600; font-size:1.02rem}

  .streaks{display:flex; gap:12px; justify-content:center; margin-top:20px}
  .streaks.bump .streak{animation:streakPop .55s ease}
  .streak{flex:1; max-width:170px; display:flex; flex-direction:column; align-items:center; gap:3px;
    background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.3); color:#fff;
    padding:14px 12px; border-radius:18px; backdrop-filter:blur(8px); box-shadow:0 10px 26px rgba(0,0,0,.16)}
  .streak__num{font-family:var(--display); font-weight:800; font-size:2rem; line-height:1; display:flex; align-items:center; gap:6px}
  .streak__num::before{font-size:1.3rem}
  .streak--days .streak__num::before{content:"🔥"}
  .streak--perfect .streak__num::before{content:"✅"}
  .streak__label{font-size:.72rem; font-weight:700; opacity:.95; text-align:center}
  .streak__best{font-size:.64rem; opacity:.75; margin-top:1px}
  .freezes{margin:10px 0 0; font-size:.78rem; font-weight:700; color:#fff; opacity:.92; text-align:center}
  @keyframes streakPop{0%{transform:scale(1)}45%{transform:scale(1.16)}100%{transform:scale(1)}}

  .tasks{display:grid; gap:18px}
  .task{position:relative; overflow:hidden; background:var(--card); color:var(--ink);
    border-radius:var(--radius); padding:22px 20px 20px;
    box-shadow:0 18px 40px rgba(12,17,40,.22); border:1px solid rgba(255,255,255,.6)}
  .task::before{content:""; position:absolute; inset:0 0 auto 0; height:6px;
    background:linear-gradient(90deg, var(--accent), var(--accent2))}
  .task__head{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px}
  .task__index{font-family:var(--display); font-weight:800; font-size:.82rem; color:var(--accent2);
    letter-spacing:.6px; text-transform:uppercase}
  .task__tags{display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end}
  .tag{font-size:.7rem; font-weight:800; padding:5px 11px; border-radius:999px;
    background:color-mix(in srgb, var(--accent) 14%, white); color:var(--accent)}
  .tag--easy{background:color-mix(in srgb, var(--good) 18%, white); color:var(--good)}
  .tag--mid{background:#fff1d6; color:#b45309}
  .tag--hard{background:#ffe0e6; color:#be123c}
  .task__question{font-size:1.18rem; font-weight:600; margin:0 0 16px; white-space:pre-wrap; line-height:1.5}

  .answer{display:flex; gap:10px; margin-top:4px; flex-wrap:wrap}
  .answer__input{flex:1; min-width:140px; font-family:var(--body); font-weight:700; font-size:1.08rem;
    color:var(--ink); padding:13px 15px; border-radius:13px;
    border:2px solid color-mix(in srgb, var(--ink) 16%, white);
    background:color-mix(in srgb, var(--ink) 4%, white); transition:border-color .15s, box-shadow .15s}
  .answer__input::placeholder{color:color-mix(in srgb, var(--ink) 45%, white)}
  .answer__input:focus{outline:none; border-color:var(--accent);
    box-shadow:0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)}
  .answer__input.is-correct{border-color:var(--good); background:color-mix(in srgb, var(--good) 12%, white)}
  .answer__input.is-wrong{border-color:#e11d48; background:#fff0f3}
  .answer__check{flex:0 0 auto; min-height:50px; border:0; cursor:pointer; font-family:var(--display);
    font-weight:700; font-size:1rem; color:#fff; padding:13px 22px; border-radius:13px;
    background:linear-gradient(135deg, var(--accent), var(--accent2));
    box-shadow:0 10px 22px color-mix(in srgb, var(--accent) 38%, transparent);
    transition:transform .12s ease, filter .12s ease}
  .answer__check:active{transform:scale(.97)}
  .answer__check:disabled{filter:grayscale(.5) brightness(.95); cursor:default; box-shadow:none}

  .attempt{margin:14px 0 0; font-family:var(--display); font-weight:800; font-size:1.1rem;
    display:flex; align-items:center; gap:8px}
  .attempt--retry{color:#b45309}
  .attempt--correct{color:var(--good)}
  .attempt--revealed{color:#e11d48}

  .task__actions{display:flex; flex-wrap:wrap; gap:8px; margin-top:12px}
  .chip-btn{display:inline-flex; align-items:center; gap:6px; cursor:pointer;
    font-family:var(--body); font-weight:700; font-size:.85rem; color:var(--accent2);
    background:color-mix(in srgb, var(--accent2) 10%, white);
    border:1px solid color-mix(in srgb, var(--accent2) 22%, white);
    padding:8px 14px; border-radius:999px; transition:transform .12s ease, background .12s ease}
  .chip-btn:hover{background:color-mix(in srgb, var(--accent2) 16%, white)}
  .chip-btn:active{transform:scale(.97)}

  .scratch{margin-top:12px}
  .scratch__bar{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px}
  .scratch__tool,.scratch__clear{cursor:pointer; font-family:var(--body); font-weight:700; font-size:.8rem;
    color:var(--ink); background:color-mix(in srgb, var(--ink) 6%, white);
    border:1px solid color-mix(in srgb, var(--ink) 16%, white); padding:7px 12px; border-radius:10px}
  .scratch__tool.is-active{color:#fff; background:var(--accent2); border-color:var(--accent2)}
  .scratch__canvas{width:100%; height:280px; display:block; border-radius:12px; cursor:crosshair;
    touch-action:none; background-color:#fff; border:1px solid #d8dcea;
    background-image:linear-gradient(#e9ecf5 1px, transparent 1px), linear-gradient(90deg, #e9ecf5 1px, transparent 1px);
    background-size:26px 26px}
  .hint{margin-top:12px; padding:13px 15px; border-radius:13px;
    background:#fff7e6; border:1px solid #f4c97a}
  .hint__label{display:inline-block; font-weight:800; font-size:.66rem; text-transform:uppercase;
    letter-spacing:.6px; color:#fff; background:#f59e0b; padding:4px 11px; border-radius:999px}
  .hint__text{margin:8px 0 0; font-size:1rem; font-weight:600; white-space:pre-wrap; color:#7a4a06}

  .solution{margin-top:14px; padding:15px 16px; border-radius:14px;
    background:color-mix(in srgb, var(--good) 12%, white);
    border:1px solid color-mix(in srgb, var(--good) 30%, white)}
  .solution__label{display:inline-block; font-weight:800; font-size:.68rem; text-transform:uppercase;
    letter-spacing:.6px; color:#fff; background:var(--good); padding:4px 11px; border-radius:999px}
  .solution__text{margin:9px 0 0; font-size:1.04rem; font-weight:600; white-space:pre-wrap; color:#11331f}

  .app-footer{text-align:center; color:#fff; margin-top:26px; font-size:.82rem}
  .archive__summary{cursor:pointer; font-weight:700; opacity:.92}
  .archive__list{list-style:none; padding:0; margin:14px 0 0; display:flex; flex-wrap:wrap; gap:8px; justify-content:center}
  .archive__link{background:rgba(255,255,255,.16); color:#fff; padding:7px 13px; border-radius:999px;
    text-decoration:none; font-weight:700; font-size:.78rem; border:1px solid rgba(255,255,255,.26)}
  .app-credit{margin-top:16px; opacity:.84}
  .legal-links{margin:8px 0 0; opacity:.82}
  .legal-links a{color:#fff; text-decoration:underline; font-weight:700}

  .emoji-row{display:none; gap:6px; justify-content:center; margin-top:12px; font-size:1.5rem; letter-spacing:4px}
  .task__sticker{display:none}

  @media (prefers-reduced-motion: reduce){*{animation:none!important; transition:none!important}}
  ${variantCss(theme)}
  `;
}

// Stil-spezifische Overrides – eine Variante pro Tag (Layout-Skin).
function variantCss(theme) {
  switch (theme.style) {
    case "playful":
      return `
  .emoji-row{display:flex}
  .task__head{gap:8px}
  .task__sticker{display:inline-block; font-size:1.5rem; filter:drop-shadow(0 3px 3px rgba(0,0,0,.18))}
  .app-title{font-size:clamp(2.3rem,10vw,3.2rem)}
  .task{border-radius:30px; box-shadow:0 22px 46px rgba(12,17,40,.26)}
  .task:nth-of-type(odd){transform:rotate(-1deg)}
  .task:nth-of-type(even){transform:rotate(1deg)}
  .task::before{height:8px}
  .tag,.kicker__date,.kicker__class{border-radius:999px}
  .answer__input,.answer__check{border-radius:999px}
  .streak{border-radius:22px}`;

    case "bold":
      return `
  .app-title{text-transform:uppercase; text-shadow:3px 3px 0 rgba(0,0,0,.28)}
  .kicker__date{background:#fff; color:#111; border:2px solid #111; box-shadow:3px 3px 0 var(--accent2); backdrop-filter:none}
  .kicker__class{border:2px solid #111; box-shadow:3px 3px 0 var(--accent)}
  .streak{background:#fff; color:#111; border:2px solid #111; border-radius:14px; box-shadow:5px 5px 0 var(--accent2); backdrop-filter:none}
  .streak__best{opacity:.85}
  .task{border:2.5px solid #111; border-radius:14px; box-shadow:7px 7px 0 var(--accent2)}
  .task::before{display:none}
  .task__index{color:#111}
  .tag{border:2px solid #111; border-radius:6px; background:#fff; color:#111}
  .tag--easy,.tag--mid,.tag--hard{color:#111}
  .answer__input{border:2.5px solid #111; border-radius:8px; background:#fff}
  .answer__check{border:2.5px solid #111; border-radius:8px; box-shadow:4px 4px 0 #111}
  .answer__check:active{transform:translate(2px,2px); box-shadow:2px 2px 0 #111}
  .solution{border:2px solid #111; border-radius:8px}
  .grade-link,.archive__link{border:2px solid #ffffff66}`;

    case "minimal":
      return `
  .app-title{font-weight:700; font-size:clamp(1.8rem,6.5vw,2.4rem); letter-spacing:-.3px; text-shadow:none}
  .app-tagline{opacity:.85}
  .kicker__date,.kicker__class{box-shadow:none}
  .streak{background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.2); box-shadow:none; backdrop-filter:none}
  .streak__num{font-size:1.7rem}
  .tasks{gap:14px}
  .task{border-radius:16px; box-shadow:0 8px 24px rgba(12,17,40,.12);
    border:1px solid color-mix(in srgb, var(--ink) 8%, white); border-top:3px solid color-mix(in srgb, var(--accent) 75%, white)}
  .task::before{display:none}
  .tag{background:transparent; border:1px solid color-mix(in srgb, var(--ink) 18%, white); color:color-mix(in srgb, var(--ink) 70%, white)}
  .answer__check{border-radius:10px; box-shadow:none}`;

    case "editorial":
      return `
  .app-title{font-weight:800; letter-spacing:-1px}
  .task{border-radius:14px; box-shadow:0 14px 34px rgba(12,17,40,.18)}
  .task::before{display:none}
  .task__head{border-bottom:1px solid color-mix(in srgb, var(--ink) 12%, white); padding-bottom:10px; margin-bottom:14px}
  .task__index{letter-spacing:2px}
  .task__question{font-size:1.22rem}
  .tag{background:transparent; border:1px solid color-mix(in srgb, var(--ink) 22%, white);
    color:color-mix(in srgb, var(--ink) 75%, white); border-radius:4px; letter-spacing:.5px}
  .answer__input,.answer__check{border-radius:7px}
  .streak{border-radius:10px}
  .solution{border-left:4px solid var(--good)}`;

    default: // "soft"
      return "";
  }
}

function renderGradePage({ dateIso, dateLong, theme, data, archiveLinks, grade, allGrades }) {
  const cards = data.tasks.map((t, i) => taskCard(t, i, theme)).join("\n");
  const useAiCss = !!theme.css;
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${theme.fonts.url}&display=swap`;
  const styleBlock = useAiCss ? theme.css : builtinCss(theme);
  const bgArt = theme.bg && theme.bg.type === "svg" ? `<div class="bg-art" aria-hidden="true">${theme.bg.svg}</div>` : "";

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="${theme.themeColor}">
<title>Daily Mathe – ${esc(grade.label)} – ${esc(dateIso)}</title>
<meta name="description" content="Daily Mathe für ${esc(grade.label)} – zwei frische Aufgaben, jeden Tag neu.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${useAiCss ? "" : `<link rel="stylesheet" href="${fontsUrl}">`}
<style>
${styleBlock}
</style>
<style>[hidden]{display:none !important}</style>
</head>
<body>
  ${bgArt}
  <div class="app">
    <header class="app-header">
      ${gradeSwitcher(allGrades, grade)}
      <div class="kicker">
        <span class="kicker__date">${esc(dateLong)}</span>
        <span class="kicker__class">${esc(grade.label)}</span>
      </div>
      <h1 class="app-title">Daily Mathe</h1>
      <div class="emoji-row">${theme.emojis.slice(0, 5).join(" ")}</div>
      <div class="streaks">
        <div class="streak streak--days" id="streak-done">
          <span class="streak__num">0</span>
          <span class="streak__label">Tage am Stück</span>
          <span class="streak__best"></span>
        </div>
        <div class="streak streak--perfect" id="streak-perfect">
          <span class="streak__num">0</span>
          <span class="streak__label">Tage alles richtig</span>
          <span class="streak__best"></span>
        </div>
      </div>
      <p class="freezes" id="freezes" hidden></p>
    </header>

    <main class="tasks">
      ${cards}
    </main>

    <footer class="app-footer">
      <details class="archive">
        <summary class="archive__summary">Frühere Tage</summary>
        <ul class="archive__list">${archiveLinks}</ul>
      </details>
      <p class="app-credit">Jeden Tag neu · automatisch erstellt 🤖</p>
      <p class="legal-links"><a href="../impressum.html">Impressum</a> · <a href="../datenschutz.html">Datenschutz</a></p>
    </footer>
  </div>

<script>
(function(){
  var DAY = ${JSON.stringify(dateIso)};
  var SLUG = ${JSON.stringify(grade.slug)};
  var TASKS = ${JSON.stringify(
    data.tasks.map((t) => ({
      answer: String(t.answer ?? ""),
      accept: Array.isArray(t.accept) ? t.accept.map(String) : [],
    }))
  )};
  var PKEY = "mdt_progress_" + SLUG;
  var MAX_ATTEMPTS = 2;     // ein erster Versuch + ein zweiter nach dem Tipp
  var FREEZE_CAP = 3;       // max. gleichzeitig gehortete Gnadentage
  var FREEZE_START = 2;     // Gnadentage zu Beginn
  var FREEZE_EVERY = 7;     // alle 7 Tage am Stück gibt es einen Gnadentag dazu

  // ---- Speicher (localStorage) ----
  function load(){ try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch(e){ return {}; } }
  function save(){ try { localStorage.setItem(PKEY, JSON.stringify(store)); } catch(e){} }
  function prevDay(iso){ var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0,10); }
  function dayDiff(a, b){ return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5); }

  var store = load();
  store.days = store.days || {};
  if (store.freezes == null) store.freezes = FREEZE_START;
  // alte Tage (älter als ~120) ausdünnen, damit der Speicher klein bleibt
  var keep = {}; var minDay = prevDay(DAY);
  for (var k = 0; k < 120; k++) minDay = prevDay(minDay);
  Object.keys(store.days).forEach(function(d){ if (d >= minDay) keep[d] = store.days[d]; });
  store.days = keep;
  // Tages-Status: pro Aufgabe { status:"open|solved|revealed", attempts, input }
  var today = store.days[DAY];
  if (!today || !today.t) { today = { t: TASKS.map(function(){ return { status:"open", attempts:0, input:"" }; }), counted:false }; }
  store.days[DAY] = today;

  // ---- Antwort-Prüfung (tolerant) ----
  function normStr(s){ return ("" + s).toLowerCase().replace(/\\s+/g, "").replace(/,/g, "."); }
  function toNum(s){
    var raw = ("" + s).toLowerCase().replace(/,/g, ".").trim();
    var mix = raw.match(/^(-?\\d+)\\s+(\\d+)\\/(\\d+)$/); // gemischte Zahl "1 5/12"
    if (mix){ var w = parseFloat(mix[1]); var sg = w < 0 ? -1 : 1; return w + sg * parseFloat(mix[2]) / parseFloat(mix[3]); }
    var t = raw.replace(/\\s+/g, "");
    var fr = t.match(/-?\\d+(?:\\.\\d+)?\\/-?\\d+(?:\\.\\d+)?/);
    if (fr){ var p = fr[0].split("/"); return parseFloat(p[0]) / parseFloat(p[1]); }
    var n = t.match(/-?\\d+(?:\\.\\d+)?/);
    return n ? parseFloat(n[0]) : NaN;
  }
  function matches(input, task){
    var cands = [task.answer].concat(task.accept || []);
    for (var i = 0; i < cands.length; i++){
      var c = cands[i];
      if (normStr(input) === normStr(c)) return true;
      var a = toNum(input), b = toNum(c);
      if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) < 1e-6) return true;
    }
    return false;
  }

  // ---- Streaks + Gnadentage anzeigen ----
  // Lebt der Streak (gestern erledigt) ODER lässt er sich noch mit Gnadentagen retten?
  function savable(lastDate){
    if (!lastDate) return false;
    if (lastDate === DAY) return true;
    var missed = dayDiff(lastDate, DAY) - 1;
    if (missed <= 0) return true;
    return (store.freezes || 0) >= missed;
  }
  function setStreak(id, val, best){
    var el = document.getElementById(id); if (!el) return;
    el.querySelector(".streak__num").textContent = val;
    var b = el.querySelector(".streak__best");
    if (b) b.textContent = best ? ("Rekord: " + best) : "";
  }
  function renderStreaks(){
    setStreak("streak-done", savable(store.lastDoneDate) ? (store.doneStreak || 0) : 0, store.doneBest || 0);
    setStreak("streak-perfect", savable(store.lastPerfectDate) ? (store.perfectStreak || 0) : 0, store.perfectBest || 0);
    var fz = document.getElementById("freezes");
    if (fz){
      var n = store.freezes || 0;
      fz.hidden = false;
      fz.textContent = "❄️ " + n + " " + (n === 1 ? "Gnadentag" : "Gnadentage") + " übrig";
    }
  }

  // ---- Darstellung pro Aufgabe ----
  function setAttempt(i, kind, text){
    var el = document.getElementById("attempt-" + i); if (!el) return;
    el.hidden = false;
    el.className = "attempt attempt--" + kind;
    el.textContent = text;
  }
  function lockTask(i){
    var inp = document.getElementById("answer-" + i);
    var btn = document.querySelector('.answer__check[data-idx="' + i + '"]');
    if (inp) inp.disabled = true;
    if (btn) btn.disabled = true;
  }
  function showSolution(i){ var s = document.getElementById("solution-" + i); if (s) s.hidden = false; }
  function hideHintToggle(i){ var t = document.getElementById("hinttoggle-" + i); if (t) t.hidden = true; }
  function showHint(i){
    var h = document.getElementById("hint-" + i); if (h) h.hidden = false;
    hideHintToggle(i);
  }

  // Stellt den gespeicherten Zustand einer Aufgabe wieder her bzw. zeigt das Ergebnis.
  function renderTask(i){
    var st = today.t[i];
    var inp = document.getElementById("answer-" + i);
    var btn = document.querySelector('.answer__check[data-idx="' + i + '"]');
    if (inp) inp.value = st.input || "";
    if (st.hintShown) showHint(i);
    if (st.status === "solved"){
      if (inp) inp.classList.add("is-correct");
      setAttempt(i, "correct", st.attempts > 1 ? "Richtig – im zweiten Versuch! 💪" : "Richtig! 🎉");
      showSolution(i); lockTask(i); hideHintToggle(i);
    } else if (st.status === "revealed"){
      if (inp) inp.classList.add("is-wrong");
      setAttempt(i, "revealed", "Schau dir den Lösungsweg an – beim nächsten Mal klappt's! 🌱");
      showSolution(i); lockTask(i); hideHintToggle(i);
    } else if (st.attempts === 1){
      // erster Versuch war falsch, zweiter steht noch aus
      if (inp){ inp.classList.add("is-wrong"); }
      setAttempt(i, "retry", "Noch nicht ganz – schau dir den Tipp an und versuch's nochmal. 💪");
      showHint(i); st.hintShown = true;
      if (btn) btn.textContent = "Nochmal prüfen";
    }
  }

  // ---- Tag abschließen (Streaks + Gnadentage), wenn alle Aufgaben fertig sind ----
  function tasksAllResolved(){ return today.t.every(function(s){ return s.status === "solved" || s.status === "revealed"; }); }
  function tasksAllPerfect(){ return today.t.every(function(s){ return s.status === "solved"; }); }

  function completeDayIfReady(){
    if (today.counted || !tasksAllResolved()) return;
    today.counted = true;

    var prevDone = store.lastDoneDate;
    var prevPerfectDate = store.lastPerfectDate;
    // Lücke prüfen und ggf. mit Gnadentagen überbrücken
    var gapForgiven = true, used = 0;
    if (prevDone){
      var missed = dayDiff(prevDone, DAY) - 1;
      if (missed > 0){
        if ((store.freezes || 0) >= missed){ used = missed; gapForgiven = true; }
        else gapForgiven = false;
      }
    }
    store.freezes = Math.max(0, (store.freezes || 0) - used);

    // "Tage am Stück"
    store.doneStreak = gapForgiven ? (store.doneStreak || 0) + 1 : 1;
    store.lastDoneDate = DAY;
    store.doneBest = Math.max(store.doneBest || 0, store.doneStreak);

    // "Tage alles richtig" – 2. Versuch zählt; nur ein aufgedeckter Tag bricht ihn
    if (tasksAllPerfect()){
      var perfectChain = gapForgiven && prevPerfectDate === prevDone; // Vortag war auch perfekt
      store.perfectStreak = perfectChain ? (store.perfectStreak || 0) + 1 : 1;
      store.lastPerfectDate = DAY;
      store.perfectBest = Math.max(store.perfectBest || 0, store.perfectStreak);
    } else {
      store.perfectStreak = 0;
    }

    // Gnadentag verdienen (alle 7 Tage am Stück), gedeckelt
    if (store.doneStreak % FREEZE_EVERY === 0) store.freezes = Math.min(FREEZE_CAP, (store.freezes || 0) + 1);

    save();
    renderStreaks();
    var bar = document.querySelector(".streaks"); if (bar) bar.classList.add("bump");
  }

  // ---- Eine Antwort verarbeiten (Tipp + zweiter Versuch) ----
  function submitAnswer(i, value){
    var st = today.t[i];
    if (st.status !== "open") return;
    st.input = value;
    st.attempts += 1;
    var correct = matches(value, TASKS[i]);

    if (correct){
      st.status = "solved";
      var inp = document.getElementById("answer-" + i);
      if (inp) inp.classList.remove("is-wrong");
      renderTask(i);
    } else if (st.attempts < MAX_ATTEMPTS){
      // erster Fehlversuch -> Tipp + zweiter Versuch, noch KEIN Tagesabschluss
      var inp2 = document.getElementById("answer-" + i);
      if (inp2){ inp2.classList.add("is-wrong"); inp2.focus(); inp2.select && inp2.select(); }
      setAttempt(i, "retry", "Noch nicht ganz – schau dir den Tipp an und versuch's nochmal. 💪");
      showHint(i); st.hintShown = true;
      var btn = document.querySelector('.answer__check[data-idx="' + i + '"]');
      if (btn) btn.textContent = "Nochmal prüfen";
    } else {
      // zweiter Fehlversuch -> Lösung zeigen
      st.status = "revealed";
      renderTask(i);
    }
    save();
    completeDayIfReady();
  }

  // ---- Heutigen Stand wiederherstellen ----
  TASKS.forEach(function(t, i){ renderTask(i); });
  renderStreaks();

  // ---- Formulare verdrahten ----
  document.querySelectorAll(".answer").forEach(function(form){
    form.addEventListener("submit", function(e){
      e.preventDefault();
      var i = +form.getAttribute("data-idx");
      var inp = document.getElementById("answer-" + i);
      var val = (inp.value || "").trim();
      if (!val){ inp.focus(); return; }
      submitAnswer(i, val);
    });
  });

  // ---- "Tipp anzeigen" freiwillig (kostet den Streak nicht) ----
  document.querySelectorAll(".hint-toggle").forEach(function(btn){
    btn.addEventListener("click", function(){
      var i = +btn.getAttribute("data-idx");
      today.t[i].hintShown = true;
      showHint(i);
      save();
    });
  });

  // ---- Zettel zum Rechnen (Mal-Canvas, finger-/stylustauglich) ----
  var scratch = {}; // pro Aufgabe: { ctx, tool, sized, dpr }
  function setupCanvas(i){
    if (scratch[i]) return;
    var cv = document.getElementById("canvas-" + i);
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var st = { ctx: ctx, tool: "pen", drawing: false, lastX: 0, lastY: 0, sized: false, dpr: 1 };
    scratch[i] = st;

    // Backing-Store passend zur tatsächlichen CSS-Größe setzen (scharfe Linien, korrekte Koordinaten)
    function sizeNow(){
      var rect = cv.getBoundingClientRect();
      var w = rect.width || cv.clientWidth || (cv.parentElement && cv.parentElement.clientWidth) || 0;
      var h = rect.height || 280;
      if (!w || w < 10) return false;
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      st.dpr = dpr; st.sized = true;
      return true;
    }
    st.sizeNow = sizeNow;
    if (!sizeNow() && typeof ResizeObserver !== "undefined"){
      var ro = new ResizeObserver(function(){ if (sizeNow()) ro.disconnect(); });
      ro.observe(cv);
    }

    function pos(e){ var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function start(e){
      if (!st.sized && !sizeNow()) return;
      e.preventDefault(); st.drawing = true;
      var p = pos(e); st.lastX = p.x; st.lastY = p.y;
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    }
    function move(e){
      if (!st.drawing) return; e.preventDefault();
      var p = pos(e);
      ctx.globalCompositeOperation = st.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = "#1f2430";
      ctx.lineWidth = st.tool === "eraser" ? 22 : 2.6;
      ctx.beginPath(); ctx.moveTo(st.lastX, st.lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
      st.lastX = p.x; st.lastY = p.y;
    }
    function end(){ st.drawing = false; }
    cv.addEventListener("pointerdown", start);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", end);
  }
  function clearCanvas(i){
    var st = scratch[i]; var cv = document.getElementById("canvas-" + i);
    if (!st || !cv) return;
    st.ctx.save();
    st.ctx.setTransform(1, 0, 0, 1, 0, 0);
    st.ctx.clearRect(0, 0, cv.width, cv.height);
    st.ctx.restore();
  }
  document.querySelectorAll(".scratch-toggle").forEach(function(btn){
    btn.addEventListener("click", function(){
      var i = +btn.getAttribute("data-idx");
      var box = document.getElementById("scratch-" + i);
      var open = box.hidden;
      box.hidden = !open;
      btn.textContent = open ? "✏️ Zettel ausblenden" : "✏️ Zettel";
      if (open) setupCanvas(i); // erst beim Öffnen initialisieren (dann hat der Canvas eine Größe)
    });
  });
  document.querySelectorAll(".scratch__tool").forEach(function(b){
    b.addEventListener("click", function(){
      var i = +b.getAttribute("data-idx");
      if (scratch[i]) scratch[i].tool = b.getAttribute("data-tool");
      document.querySelectorAll('.scratch__tool[data-idx="' + i + '"]').forEach(function(x){ x.classList.remove("is-active"); });
      b.classList.add("is-active");
    });
  });
  document.querySelectorAll(".scratch__clear").forEach(function(b){
    b.addEventListener("click", function(){ clearCanvas(+b.getAttribute("data-idx")); });
  });
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Rechtliches: Impressum & Datenschutz (DSGVO)
// ---------------------------------------------------------------------------
// HINWEIS: Bitte vor Veröffentlichung die Betreiberangaben prüfen/ergänzen
// (USt-IdNr., ggf. abweichende Kontaktadresse) und idealerweise rechtlich prüfen lassen.
const OPERATOR = {
  name: "TechnologyCircle GmbH",
  street: "Karolinenstraße 24, Haus 4",
  city: "20357 Hamburg",
  country: "Deutschland",
  represented: "Henrik Lippke",
  email: "info@henriklippke.de",
  registerCourt: "Amtsgericht Hamburg",
  registerNo: "HRB 168840",
  vatId: "", // optional: USt-IdNr. eintragen
};

function legalShell(title, dateLong, bodyHtml) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} – Daily Mathe</title>
<style>
  *{box-sizing:border-box}
  body{margin:0; font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:#1f2430; background:#f5f6fa; line-height:1.6;
    padding:max(20px,env(safe-area-inset-top)) 18px calc(40px + env(safe-area-inset-bottom))}
  .doc{max-width:720px; margin:0 auto; background:#fff; border:1px solid #e6e8ef; border-radius:16px;
    padding:28px 24px; box-shadow:0 10px 30px rgba(20,25,45,.06)}
  a{color:#2f6df6}
  .back{display:inline-block; margin-bottom:14px; font-weight:700; text-decoration:none}
  h1{font-size:1.6rem; margin:.2em 0 .6em}
  h2{font-size:1.12rem; margin:1.4em 0 .4em}
  p{margin:.5em 0}
  .muted{color:#6b7180; font-size:.86rem}
  address{font-style:normal}
  .note{margin-top:20px; padding:12px 14px; background:#fff7e6; border:1px solid #f4c97a;
    border-radius:10px; font-size:.86rem; color:#7a4a06}
</style>
</head>
<body>
  <div class="doc">
    <a class="back" href="index.html">← Zurück zu Daily Mathe</a>
    ${bodyHtml}
    <p class="muted">Stand: ${esc(dateLong)}</p>
  </div>
</body>
</html>`;
}

function impressumHtml(dateLong) {
  const o = OPERATOR;
  const body = `
    <h1>Impressum</h1>
    <h2>Angaben gemäß § 5 DDG</h2>
    <address>
      ${esc(o.name)}<br>
      ${esc(o.street)}<br>
      ${esc(o.city)}<br>
      ${esc(o.country)}
    </address>
    <h2>Vertreten durch</h2>
    <p>${esc(o.represented)}</p>
    <h2>Kontakt</h2>
    <p>E-Mail: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>
    <h2>Registereintrag</h2>
    <p>Eintragung im Handelsregister.<br>
       Registergericht: ${esc(o.registerCourt)}<br>
       Registernummer: ${esc(o.registerNo)}</p>
    ${o.vatId ? `<h2>Umsatzsteuer-ID</h2><p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG: ${esc(o.vatId)}</p>` : `<h2>Umsatzsteuer-ID</h2><p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG: <em>(bitte ergänzen, falls vorhanden)</em></p>`}
    <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
    <p>${esc(o.represented)}, Anschrift wie oben.</p>
    <h2>Haftung für Inhalte</h2>
    <p>Die Inhalte dieser Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit
       und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. Die Aufgaben werden automatisiert
       erstellt; einzelne Lösungen können fehlerhaft sein.</p>
    <h2>Haftung für Links</h2>
    <p>Unser Angebot kann Links zu externen Websites Dritter enthalten, auf deren Inhalte wir keinen Einfluss
       haben. Für diese fremden Inhalte ist stets der jeweilige Anbieter verantwortlich.</p>
    <h2>Urheberrecht</h2>
    <p>Die durch die Seitenbetreiber erstellten Inhalte unterliegen dem deutschen Urheberrecht. Beiträge Dritter
       sind als solche gekennzeichnet.</p>`;
  return legalShell("Impressum", dateLong, body);
}

function datenschutzHtml(dateLong) {
  const o = OPERATOR;
  const body = `
    <h1>Datenschutzerklärung</h1>

    <h2>1. Verantwortlicher</h2>
    <address>
      ${esc(o.name)}<br>
      ${esc(o.street)}, ${esc(o.city)}, ${esc(o.country)}<br>
      E-Mail: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>
    </address>

    <h2>2. Überblick</h2>
    <p>„Daily Mathe“ ist eine reine Übungs-Webseite für Matheaufgaben. Es gibt <strong>keine Nutzerkonten</strong>,
       keine Anmeldung, <strong>keine Tracking-Cookies, keine Werbung und keine Analyse-/Statistik-Dienste</strong>.
       Wir erheben selbst keine personenbezogenen Daten und geben keine an Dritte zu Werbezwecken weiter.</p>

    <h2>3. Hosting (GitHub Pages)</h2>
    <p>Diese Website wird bei GitHub Pages gehostet (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco,
       CA 94107, USA). Beim Aufruf der Seiten verarbeitet GitHub aus technischen Gründen Server-Logdaten,
       darunter Ihre IP-Adresse, Datum/Uhrzeit des Zugriffs und die abgerufene Seite. Rechtsgrundlage ist
       Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer sicheren, stabilen Bereitstellung der Website).
       Eine Übermittlung in die USA kann erfolgen; GitHub stützt diese u. a. auf das EU-US Data Privacy Framework
       bzw. Standardvertragsklauseln. Details: <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">GitHub Privacy Statement</a>.</p>

    <h2>4. Schriftarten (Google Fonts)</h2>
    <p>Zur Darstellung nutzt die Seite Web-Schriftarten, die von Google-Servern geladen werden (Google Ireland
       Limited, Gordon House, Barrow Street, Dublin 4, Irland). Dabei wird Ihre IP-Adresse an Google übertragen.
       Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (ansprechende, einheitliche Darstellung). Weitere Infos:
       <a href="https://policies.google.com/privacy" rel="noopener">Google Datenschutzerklärung</a>.</p>

    <h2>5. Lokale Speicherung (localStorage)</h2>
    <p>Dein Lernfortschritt (z. B. Streaks, ob du eine Aufgabe schon beantwortet hast, deine Eingaben des Tages)
       wird ausschließlich <strong>lokal in deinem Browser</strong> gespeichert (Technik: „localStorage“). Diese
       Daten verlassen dein Gerät <strong>nicht</strong>, werden nicht an uns oder Dritte übertragen und dienen
       nur dazu, deinen Fortschritt anzuzeigen. Es handelt sich nicht um Tracking-Cookies. Du kannst diese Daten
       jederzeit löschen, indem du in den Browser-Einstellungen die Website-Daten dieser Seite entfernst.</p>

    <h2>6. Keine Cookies, kein Tracking</h2>
    <p>Wir setzen keine Cookies zu Analyse- oder Werbezwecken und binden keine Tracking- oder Social-Media-Dienste ein.</p>

    <h2>7. Hinweis zu Kindern</h2>
    <p>Das Angebot richtet sich an Schülerinnen und Schüler. Es werden keine personenbezogenen Daten erhoben;
       der Lernfortschritt bleibt lokal auf dem Gerät.</p>

    <h2>8. Deine Rechte</h2>
    <p>Du hast nach der DSGVO das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
       Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch (Art. 21).
       Außerdem besteht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO). Da wir
       selbst keine personenbezogenen Daten speichern, betreffen Anfragen ggf. die genannten Auftragnehmer/Dienste.</p>

    <h2>9. Kontakt</h2>
    <p>Bei Fragen zum Datenschutz: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>.</p>`;
  return legalShell("Datenschutzerklärung", dateLong, body);
}

// Wurzelseite: bei einer Klasse Weiterleitung, sonst Auswahl-Landingpage.
function renderRoot({ dateIso, dateLong, theme, grades }) {
  if (grades.length === 1) {
    const slug = grades[0].slug;
    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=./${slug}/">
<link rel="canonical" href="./${slug}/">
<title>Daily Mathe</title>
</head>
<body>
<p>Weiter zu <a href="./${slug}/">Daily Mathe – ${esc(grades[0].label)}</a> …</p>
</body>
</html>`;
  }

  const fontsUrl = `https://fonts.googleapis.com/css2?family=${theme.fonts.url}&display=swap`;
  const cards = grades
    .map((g, i) => {
      const emoji = theme.emojis[i % theme.emojis.length];
      return `<a class="pick" href="./${g.slug}/">
        <span class="pick-emoji">${emoji}</span>
        <span class="pick-label">${esc(g.label)}</span>
        <span class="pick-go">Heutige Aufgaben →</span>
      </a>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="${theme.pal.bg[0]}">
<title>Daily Mathe – Klasse wählen</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontsUrl}">
<style>
  :root{
    --display:"${theme.fonts.display}", system-ui, sans-serif;
    --body:"${theme.fonts.body}", system-ui, sans-serif;
    --accent2:${theme.pal.accent2};
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{
    margin:0; min-height:100vh; min-height:100dvh; font-family:var(--body); color:#fff;
    ${backgroundCss(theme)} background-attachment:fixed;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:32px 18px calc(32px + env(safe-area-inset-bottom));
  }
  .home{width:100%; max-width:480px; text-align:center}
  .date-pill{
    display:inline-block; background:rgba(255,255,255,.22); border:1px solid rgba(255,255,255,.35);
    padding:6px 14px; border-radius:999px; font-size:.82rem; font-weight:700;
  }
  h1{font-family:var(--display); font-size:clamp(2rem,9vw,3rem); margin:16px 0 4px; text-shadow:0 4px 0 rgba(0,0,0,.12)}
  .sub{opacity:.95; font-weight:700; margin:0 0 26px}
  .picks{display:grid; gap:14px}
  .pick{
    display:flex; align-items:center; gap:14px; text-decoration:none; color:#222;
    background:#fff; border-radius:20px; padding:18px 18px; font-weight:800;
    box-shadow:0 14px 30px rgba(0,0,0,.2); transition:transform .12s ease;
  }
  .pick:active{transform:scale(.98)}
  .pick-emoji{font-size:2rem}
  .pick-label{font-family:var(--display); font-size:1.35rem; color:var(--accent2)}
  .pick-go{margin-left:auto; font-size:.82rem; color:#666; font-weight:700}
  .foot{margin-top:24px; opacity:.9; font-size:.82rem}
  @media (prefers-reduced-motion: reduce){*{transition:none !important}}
</style>
</head>
<body>
  <div class="home">
    <span class="date-pill">${esc(dateLong)}</span>
    <h1>Daily Mathe</h1>
    <p class="sub">Wähle deine Klasse 👇</p>
    <div class="picks">
      ${cards}
    </div>
    <p class="foot">Jeden Tag neu · automatisch erstellt 🤖</p>
    <p class="foot"><a href="impressum.html" style="color:#fff">Impressum</a> · <a href="datenschutz.html" style="color:#fff">Datenschutz</a></p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Archiv-Links einsammeln (pro Klassen-Ordner)
// ---------------------------------------------------------------------------
async function collectArchiveLinks(archiveDir, currentIso) {
  if (!existsSync(archiveDir)) return "";
  const files = (await readdir(archiveDir))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace(".html", ""))
    .filter((d) => d !== currentIso)
    .sort()
    .reverse()
    .slice(0, 14);
  if (!files.length) return `<li style="color:#fff;opacity:.8;list-style:none">Noch kein Archiv 🐣</li>`;
  return files.map((d) => `<li><a href="archive/${d}.html">${d}</a></li>`).join("");
}

// ---------------------------------------------------------------------------
// Wiederverwendbar: eine Klassenseite für ein Datum bauen (für Generator + Vorschau)
// ---------------------------------------------------------------------------
export async function buildGradePage(dateIso, grade, { allGrades = enabledGrades(), archiveLinks = "", log = false } = {}) {
  const dateLong = germanLongDate(dateIso);
  const rng = makeRng(`${dateIso}-${grade.slug}-mathe-des-tages`);
  const style = rng.pick(STYLES);
  const wantSvg = rng.int(1, 3) === 1; // ~1/3 der Tage abstraktes SVG
  const designSpec = await fetchDesign(dateIso, rng, grade, { style, wantSvg });
  const theme = buildTheme(rng, designSpec, { style, wantSvg });
  const data = await fetchTasks(dateIso, rng, grade);
  if (log) {
    const mode = theme.css ? "KI-CSS" : theme.aiDesign ? "KI-Farben" : "Zufall";
    const bgKind = theme.bg ? `bg:${theme.bg.type}` : "bg:grad";
    console.log(`📅 ${dateIso} | 🎓 ${grade.label} | 🎨 ${theme.themeName} · ${theme.style} · ${bgKind} (${mode})${data._fallback ? " · Fallback-Aufgaben" : ""}`);
  }
  const html = renderGradePage({ dateIso, dateLong, theme, data, archiveLinks, grade, allGrades });
  return { html, theme, data };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dateIso = process.env.MDT_DATE || berlinToday();
  const dateLong = germanLongDate(dateIso);
  const grades = enabledGrades();

  if (!grades.length) {
    throw new Error("Keine Klasse aktiviert – setze mindestens eine auf `enabled: true`.");
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, ".nojekyll"), "", "utf8");

  for (const grade of grades) {
    const gradeDir = join(OUT_DIR, grade.slug);
    const archiveDir = join(gradeDir, "archive");
    await mkdir(archiveDir, { recursive: true });

    const archiveLinks = await collectArchiveLinks(archiveDir, dateIso);
    const { html } = await buildGradePage(dateIso, grade, { allGrades: grades, archiveLinks, log: true });

    await writeFile(join(archiveDir, `${dateIso}.html`), html, "utf8");
    await writeFile(join(gradeDir, "index.html"), html, "utf8");
    console.log(`   ✅ docs/${grade.slug}/index.html (+ archive/${dateIso}.html)`);
  }

  // Wurzelseite (Weiterleitung oder Klassen-Auswahl)
  const homeRng = makeRng(`${dateIso}-home-mathe-des-tages`);
  const homeTheme = buildTheme(homeRng);
  const rootHtml = renderRoot({ dateIso, dateLong, theme: homeTheme, grades });
  await writeFile(join(OUT_DIR, "index.html"), rootHtml, "utf8");
  console.log(`✅ docs/index.html (${grades.length === 1 ? "Weiterleitung" : "Klassen-Auswahl"})`);

  // Rechtsseiten (Impressum & Datenschutz)
  await writeFile(join(OUT_DIR, "impressum.html"), impressumHtml(dateLong), "utf8");
  await writeFile(join(OUT_DIR, "datenschutz.html"), datenschutzHtml(dateLong), "utf8");
  console.log("✅ docs/impressum.html + docs/datenschutz.html");
}

// Nur ausführen, wenn direkt gestartet (nicht beim Import durch die Vorschau).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Fataler Fehler:", err);
    process.exit(1);
  });
}
