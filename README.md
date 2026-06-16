# 🧮 Mathe des Tages

Jeden Tag automatisch **2 frische Matheaufgaben pro Klasse** – generiert per
OpenAI, verpackt in ein **täglich neu von der KI gestaltetes, modernes Design**.
Mobile-first, fühlt sich an wie eine echte App. Standardmäßig aktiv: **Klasse 6** –
weitere Klassen sind mit einer Zeile dazuschaltbar.

- 🤖 Eine GitHub-Action läuft **jede Nacht** und erstellt die Aufgaben.
- 🎓 **Mehrere Klassen** über eine Konfig-Liste – jede Klasse hat eigene Aufgaben, eigenes Design und eigenes Archiv.
- 🎨 **Jeden Tag eine neue Optik:** Fester Titel „Daily Mathe" (keine wechselnden Sprüche). Die Kreativität steckt im **Hintergrund** – die KI baut täglich einen anderen (mehrlagige CSS-Verläufe/Mesh, ~⅓ der Tage ein **abstraktes SVG**) – plus wechselnde Farbwelt, Schriften und einen von mehreren polierten Layout-Stilen (`soft`, `playful`, `bold`/Neobrutalismus, `minimal`, `editorial`). Stil & Hintergrundtyp werden pro Tag fest gewürfelt; Layout & Stile sind fest gestaltet (sehen zuverlässig gut aus). Optional komplettes KI-CSS via `MDT_AI_CSS=1`.
- 🧮 Die Aufgaben sind gemischt: reine Rechenaufgaben & Textaufgaben (höchstens eine Textaufgabe pro Tag), regelmäßig eine **„Rechne schriftlich"-Aufgabe** (mit schriftlichem Rechenweg in der Lösung) und **häufig Kommazahlen**. Jede Aufgabe hat genau ein prüfbares Endergebnis.
- ✍️ **Antwort eintippen + aus Fehlern lernen:** Das Kind tippt sein Ergebnis ein. Bei einem Fehler kommt **erst ein Tipp und ein zweiter Versuch** – klappt es dann, zählt es weiterhin als „richtig". Erst nach dem zweiten Fehlversuch erscheint die **Lösung mit Rechenweg**. Prüfung tolerant (Komma/Punkt, Einheit egal, Brüche).
- 🔥 **Zwei Streaks + Gnadentage (im localStorage):** „Tage am Stück" und „Tage alles richtig" (je mit Rekord). **Gnadentage** (Streak-Freeze) verhindern, dass ein einzelner verpasster Tag den Streak sofort zurücksetzt; man verdient alle 7 Tage einen dazu. Alles bleibt lokal und wird nach Reload wiederhergestellt.
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

## Mehrere Tage auf einmal ansehen (Vorschau)

Rendert die nächsten Tage in einen temporären Ordner `.preview/` und startet einen
lokalen Server mit einer Übersicht (ein Handy-Vorschaurahmen pro Tag) – ideal, um Design
**und** Inhalt vieler Tage schnell zu prüfen:

```bash
npm run preview          # 20 Tage ab heute
npm run preview -- 30    # 30 Tage
MDT_PREVIEW_DAYS=10 npm run preview

# Mit echten KI-Aufgaben/-Designs zusätzlich den Key setzen:
OPENAI_API_KEY=sk-xxx npm run preview
```

Danach die angezeigte URL (Standard `http://localhost:4321/`) öffnen. `.preview/` ist
temporär und wird nicht eingecheckt. Ohne API-Key werden Fallback-Aufgaben/Zufallsdesign genutzt.

## Anpassen

- **Aufgaben-Prompt:** `buildSystemPrompt()` in `scripts/generate.mjs`.
- **Layout/Optik:** `builtinCss()` ist das Basis-Layout, `variantCss()` enthält die Stil-Varianten (`STYLES`). `buildDesignPrompt()` steuert, welche Farbwelt/Schriften/Stile die KI täglich wählt. Neue Variante = Eintrag in `STYLES` + Block in `variantCss()`.
- **Schrift-Auswahl:** `DISPLAY_FONTS` / `BODY_FONTS` (die KI wählt nur daraus → laden garantiert).
- **Fallback-Optik ohne KI:** `PALETTES`, `FONT_PAIRS`, `EMOJI_SETS`.
- **KI-Optik abschalten:** `MDT_AI_DESIGN=0` → zufällige Farben/Schriften statt KI (auch automatisch ohne API-Key).
- **Komplettes KI-CSS aktivieren (experimentell):** `MDT_AI_CSS=1` → die KI gestaltet das ganze Stylesheet selbst (variabler, aber weniger verlässlich schön).
- **Uhrzeit:** `cron` in `.github/workflows/daily.yml` (Zeit ist in UTC).
- **Modell:** Repo-Variable `OPENAI_MODEL` (z. B. `gpt-4o` für höhere Qualität).

## Rechtliches (Impressum & Datenschutz)

- `docs/impressum.html` und `docs/datenschutz.html` werden bei jedem Build automatisch erzeugt und sind im Footer verlinkt.
- Die Betreiberangaben stehen zentral in der Konstante `OPERATOR` in `scripts/generate.mjs` – **bitte vor dem Live-Gang prüfen/ergänzen** (v. a. USt-IdNr., ggf. Kontaktadresse).
- Die Datenschutzerklärung deckt ab: Hosting (GitHub Pages, Server-Logs/IP, USA-Transfer), **Google Fonts** (IP an Google), **localStorage** (Lernfortschritt nur lokal, keine Tracking-Cookies, keine Analyse).
- Hinweis: Google Fonts werden aktuell von Google-Servern geladen (datenschutzrechtlich offengelegt). Für eine strengere DSGVO-Konformität ließen sich die Schriften **selbst hosten** – sag Bescheid, dann baue ich das ein.
- Die Texte sind sorgfältig erstellt, aber **keine Rechtsberatung**; im Zweifel anwaltlich prüfen lassen.

## Hinweise

- Fällt die OpenAI-Anfrage aus, erscheinen automatisch Fallback-Aufgaben – die Seite ist nie leer.
- Die Lösungen stehen im HTML (für die Aufdeck-Funktion), sind aber standardmäßig versteckt.
# dailymathe
