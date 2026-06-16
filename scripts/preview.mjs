#!/usr/bin/env node
// Lokale Vorschau: rendert N Tage (Standard 20) in einen temporären Ordner und
// startet einen kleinen Server mit einer Übersicht (Handy-Rahmen je Tag).
// Nutzung:  npm run preview            (20 Tage)
//           npm run preview -- 30      (30 Tage)
//           MDT_PREVIEW_DAYS=10 npm run preview

import { writeFile, mkdir, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

import { enabledGrades, berlinToday, buildGradePage } from "./generate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PREVIEW_DIR = join(ROOT, ".preview");
const PORT = Number(process.env.MDT_PREVIEW_PORT || 4321);

const DAYS = Math.max(1, Math.min(120, Number(process.argv[2] || process.env.MDT_PREVIEW_DAYS || 20)));
const CONCURRENCY = Number(process.env.MDT_PREVIEW_CONCURRENCY || 4);

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Einfacher Worker-Pool mit begrenzter Parallelität.
async function pool(items, limit, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

function overviewPage(entries, days) {
  const cards = entries
    .map((e) => {
      const src = `${e.slug}/${e.date}.html`;
      const topics = e.topics.length ? e.topics.join(" · ") : "—";
      return `
      <figure class="card">
        <figcaption>
          <span class="d">${esc(e.date)}</span>
          <span class="g">${esc(e.label)}</span>
          <span class="t">🎨 ${esc(e.themeName)} <em>${esc(e.mode)}</em></span>
          <span class="q">📝 ${esc(topics)}</span>
          <a class="open" href="${src}" target="_blank" rel="noopener">in groß öffnen ↗</a>
        </figcaption>
        <div class="phone"><iframe loading="lazy" src="${src}"></iframe></div>
      </figure>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mathe des Tages – Vorschau (${days} Tage)</title>
<style>
  :root{ --fw:390px; --scale:.62; }
  *{box-sizing:border-box}
  body{margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:#0f1222; color:#e8ebf5}
  header{padding:18px 20px; position:sticky; top:0; background:#0f1222ee; backdrop-filter:blur(6px);
    border-bottom:1px solid #ffffff1a; z-index:5}
  header h1{margin:0; font-size:1.1rem}
  header p{margin:4px 0 0; opacity:.7; font-size:.85rem}
  .grid{display:grid; gap:22px; padding:22px;
    grid-template-columns:repeat(auto-fill, minmax(calc(var(--fw) * var(--scale) + 8px), 1fr))}
  .card{margin:0; background:#171a30; border:1px solid #ffffff14; border-radius:14px; padding:12px; overflow:hidden}
  figcaption{display:flex; flex-direction:column; gap:2px; margin-bottom:10px; font-size:.8rem}
  figcaption .d{font-weight:800}
  figcaption .g{opacity:.7}
  figcaption .t{opacity:.9}
  figcaption .t em{opacity:.6; font-style:normal}
  figcaption .q{opacity:.7; font-size:.74rem; line-height:1.3}
  figcaption .open{margin-top:4px; color:#7aa2ff; text-decoration:none; font-weight:700; font-size:.76rem}
  .phone{width:calc(var(--fw) * var(--scale)); height:calc(760px * var(--scale)); overflow:hidden;
    border-radius:18px; border:1px solid #ffffff1f; margin:0 auto; background:#fff}
  .phone iframe{width:var(--fw); height:760px; border:0; transform:scale(var(--scale)); transform-origin:top left}
</style>
</head>
<body>
  <header>
    <h1>🧮 Mathe des Tages — Vorschau</h1>
    <p>${days} Tage ab ${esc(entries[0]?.date || "")} · ${entries.length} Seiten · scrollbar, „in groß öffnen" für die echte Ansicht</p>
  </header>
  <div class="grid">
    ${cards}
  </div>
</body>
</html>`;
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent((req.url || "/").split("?")[0]);
      if (path === "/") path = "/index.html";
      const file = join(PREVIEW_DIR, path);
      if (!file.startsWith(PREVIEW_DIR) || !existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Nicht gefunden");
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end("Fehler: " + err.message);
    }
  });
  server.listen(PORT, () => {
    console.log("");
    console.log(`🌐 Vorschau läuft:  http://localhost:${PORT}/`);
    console.log("   (Strg+C zum Beenden)");
  });
}

async function main() {
  const grades = enabledGrades();
  if (!grades.length) throw new Error("Keine Klasse aktiviert.");

  const start = process.env.MDT_DATE || berlinToday();
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(start, i));

  console.log(`🔭 Rendere ${DAYS} Tage (${dates[0]} … ${dates[dates.length - 1]}) für ${grades.length} Klasse(n) …`);
  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  Kein OPENAI_API_KEY – Vorschau nutzt Fallback-Aufgaben & Zufallsdesign.");
  }

  await rm(PREVIEW_DIR, { recursive: true, force: true });
  for (const g of grades) await mkdir(join(PREVIEW_DIR, g.slug), { recursive: true });

  // Render-Jobs: jede Klasse × jeder Tag
  const jobs = [];
  for (const grade of grades) for (const date of dates) jobs.push({ grade, date });

  let done = 0;
  const results = await pool(jobs, CONCURRENCY, async ({ grade, date }) => {
    const { html, theme, data } = await buildGradePage(date, grade, { allGrades: grades, archiveLinks: "", log: false });
    await writeFile(join(PREVIEW_DIR, grade.slug, `${date}.html`), html, "utf8");
    done++;
    process.stdout.write(`\r   ${done}/${jobs.length} Seiten gerendert …`);
    return {
      date,
      slug: grade.slug,
      label: grade.label,
      themeName: theme.themeName,
      mode: `${theme.style} · ${theme.css ? "KI-CSS" : theme.aiDesign ? "KI-Farben" : "Zufall"}`,
      topics: (data.tasks || []).map((t) => t.topic).filter(Boolean),
    };
  });
  process.stdout.write("\n");

  // Übersicht (nach Datum, dann Klasse sortiert)
  results.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : a.date.localeCompare(b.date)));
  await writeFile(join(PREVIEW_DIR, "index.html"), overviewPage(results, DAYS), "utf8");

  console.log(`✅ Vorschau erstellt in .preview/ (${results.length} Seiten)`);
  startServer();
}

main().catch((err) => {
  console.error("Fehler:", err);
  process.exit(1);
});
