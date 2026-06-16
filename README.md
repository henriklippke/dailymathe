# 🧮 Mathe des Tages

Jeden Tag automatisch **2 frische Matheaufgaben pro Klasse** – generiert per
OpenAI, verpackt in ein **täglich zufällig wechselndes, witziges Design**.
Mobile-first, fühlt sich an wie eine App. Standardmäßig aktiv: **Klasse 6** –
weitere Klassen sind mit einer Zeile dazuschaltbar.

- 🤖 Eine GitHub-Action läuft **jede Nacht** und erstellt die Aufgaben.
- 🎓 **Mehrere Klassen** über eine Konfig-Liste – jede Klasse hat eigene Aufgaben, eigenes Design und eigenes Archiv.
- 🎨 **Die KI denkt sich jeden Tag ein eigenes Design-Thema aus** (Farben, Schriften, Emojis, Titel – z. B. „Weltraum-Picknick", „Dino-Dschungel"). Der Spec wird validiert und in ein robustes Layout gegossen; bei Problemen greift ein zufälliges Fallback-Design.
- 👀 Lösungen lassen sich per Knopf aufdecken. Wer geschaut hat, sieht oben dauerhaft den Hinweis **„Lösungen heute schon angeschaut"** – gespeichert im Cookie, bleibt auch nach dem Zurückgehen.
- 📅 Frühere Tage sind über ein kleines Archiv erreichbar.

## So funktioniert's

```
scripts/generate.mjs        → ruft OpenAI je Klasse auf, baut die HTML-Seiten
.github/workflows/daily.yml  → Cron jede Nacht: generieren, committen, auf GitHub Pages deployen
docs/
  index.html                 → Wurzel: leitet bei 1 Klasse weiter, zeigt bei mehreren eine Auswahl
  klasse-6/index.html        → heutige Aufgaben für Klasse 6
  klasse-6/archive/<datum>.html
  klasse-7/…                  → (sobald aktiviert)
```

Das Skript braucht **keine Abhängigkeiten** (nur Node ≥ 20, nutzt eingebautes `fetch`).

## Klassen verwalten

Alle Klassen stehen oben in `scripts/generate.mjs` in der Liste `GRADES`:

```js
const GRADES = [
  { slug: "klasse-6", label: "Klasse 6", entersGrade: 6, enabled: true,  topics: [...] },
  { slug: "klasse-7", label: "Klasse 7", entersGrade: 7, enabled: false, topics: DEFAULT_TOPICS },
];
```

- **Klasse aktivieren:** `enabled: true` setzen.
- **Neue Klasse hinzufügen:** einen Eintrag ergänzen (`slug`, `label`, `entersGrade`, `topics`).
  `entersGrade` steuert Niveau und Prompt (es wird Stoff der Klasse `entersGrade + 1` vermieden).
- **Themen anpassen:** `topics`-Liste der jeweiligen Klasse bearbeiten (oder `DEFAULT_TOPICS` nutzen).

Sobald **mehr als eine** Klasse aktiv ist, wird die Wurzelseite automatisch zur Klassen-Auswahl,
und jede Klassenseite bekommt oben einen Umschalter.

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

- **Aufgaben-Prompt:** `buildSystemPrompt()` in `scripts/generate.mjs`.
- **Design-Prompt (KI):** `buildDesignPrompt()` in `scripts/generate.mjs` – hier steuerst du Stil/Vorgaben des KI-Designs.
- **Erlaubte Schriften:** `DISPLAY_FONTS` / `BODY_FONTS` (die KI wählt nur daraus → laden garantiert).
- **Fallback-Designs erweitern:** Arrays `PALETTES`, `FONT_PAIRS`, `EMOJI_SETS`.
- **KI-Design abschalten:** Umgebungsvariable `MDT_AI_DESIGN=0` → es wird ein zufälliges Design statt des KI-Designs genutzt.
- **Uhrzeit:** `cron` in `.github/workflows/daily.yml` (Zeit ist in UTC).
- **Modell:** Repo-Variable `OPENAI_MODEL` (z. B. `gpt-4o` für höhere Qualität).

## Hinweise

- Fällt die OpenAI-Anfrage aus, erscheinen automatisch Fallback-Aufgaben – die Seite ist nie leer.
- Die Lösungen stehen im HTML (für die Aufdeck-Funktion), sind aber standardmäßig versteckt.
# dailymathe
