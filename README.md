# 🧮 Mathe des Tages

Jeden Tag automatisch **2 frische Matheaufgaben** (Niveau Klasse 7) – generiert per
OpenAI, verpackt in ein **täglich zufällig wechselndes, witziges Design**.
Mobile-first, fühlt sich an wie eine App.

- 🤖 Eine GitHub-Action läuft **jede Nacht** und erstellt die Aufgaben.
- 🎨 Jeder Tag bekommt ein **anderes Design** (Farben, Schriften, Deko) – deterministisch aus dem Datum, also pro Tag stabil.
- 👀 Lösungen lassen sich per Knopf aufdecken. Wer geschaut hat, sieht oben dauerhaft den Hinweis **„Lösungen heute schon angeschaut"** – gespeichert im Cookie, bleibt auch nach dem Zurückgehen.
- 📅 Frühere Tage sind über ein kleines Archiv erreichbar.

## So funktioniert's

```
scripts/generate.mjs   → ruft OpenAI auf, baut docs/index.html + docs/archive/<datum>.html
.github/workflows/daily.yml → Cron jede Nacht: generieren, committen, auf GitHub Pages deployen
docs/                  → die fertige Website (GitHub Pages)
```

Das Skript braucht **keine Abhängigkeiten** (nur Node ≥ 20, nutzt eingebautes `fetch`).

## Einrichtung (einmalig)

1. **Repo auf GitHub anlegen** und diesen Ordner hochladen:
   ```bash
   git init
   git add .
   git commit -m "Mathe des Tages – initial"
   git branch -M main
   git remote add origin git@github.com:DEIN-NAME/DailyMathe.git
   git push -u origin main
   ```

2. **OpenAI-API-Key als Secret hinterlegen**
   GitHub → Repo → *Settings* → *Secrets and variables* → *Actions* → **New repository secret**
   - Name: `OPENAI_API_KEY`
   - Wert: dein OpenAI-Key (`sk-...`)
   - *(optional)* unter *Variables* `OPENAI_MODEL` setzen, Standard ist `gpt-4o-mini`.

3. **GitHub Pages aktivieren**
   GitHub → Repo → *Settings* → *Pages* → *Build and deployment* → **Source: GitHub Actions**.

4. **Erststart**
   GitHub → *Actions* → „Mathe des Tages" → **Run workflow**.
   Danach läuft es jede Nacht von allein. Die Seite liegt unter
   `https://DEIN-NAME.github.io/DailyMathe/`.

## Lokal testen

```bash
# Ohne Key -> einfache Fallback-Aufgaben, Design & Mechanik trotzdem sichtbar:
npm run generate

# Mit echten Aufgaben:
OPENAI_API_KEY=sk-xxx npm run generate

# Ein bestimmtes Datum / Design ausprobieren:
MDT_DATE=2026-12-24 npm run generate

# Danach docs/index.html im Browser öffnen.
```

## Anpassen

- **Aufgaben-Prompt:** `SYSTEM_PROMPT` in `scripts/generate.mjs`.
- **Designs erweitern:** Arrays `PALETTES`, `FONT_PAIRS`, `EMOJI_SETS` in `scripts/generate.mjs`.
- **Uhrzeit:** `cron` in `.github/workflows/daily.yml` (Zeit ist in UTC).
- **Modell:** Repo-Variable `OPENAI_MODEL` (z. B. `gpt-4o` für höhere Qualität).

## Hinweise

- Fällt die OpenAI-Anfrage aus, erscheinen automatisch Fallback-Aufgaben – die Seite ist nie leer.
- Die Lösungen stehen im HTML (für die Aufdeck-Funktion), sind aber standardmäßig versteckt.
# dailymathe
