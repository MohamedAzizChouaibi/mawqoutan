# مواقيت الصلاة — INSAT Prayer Times Dashboard

A full-screen kiosk display of prayer times for the INSAT mosque (Centre Urbain Nord, Tunis). Computes prayer times astronomically (client-side, no network calls) and shows a live countdown, adhan/iqama phases, the Gregorian/Hijri date, and a settings panel.

## Project structure

```
.
├── index.html            entry point / markup
├── css/
│   └── style.css         styles + @font-face declarations
├── js/
│   ├── app.js            solar-time calculations, clock, rendering, settings panel
│   └── prayerTimes2026.js exact Mawaqit time table for 2026
└── assets/
    ├── fonts/             Noto Kufi Arabic (Arabic + Latin subsets, .woff2)
    ├── images/             INSAT logo
    └── data/
        ├── mawaqit_prayer_times_2026.csv  source for prayerTimes2026.js
        └── hadiths.csv                    hadith text bank for the between-prayers break
```

## Running locally

No build step is required — it's plain HTML/CSS/JS. Serve the folder with any static file server, e.g.:

```
npm start
```

or

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Configuration

Edit the `CONFIG` object at the top of `js/app.js` to set the mosque's coordinates, timezone, calculation method, per-prayer offsets, and iqama delays. Values can also be tweaked temporarily from the on-screen settings panel (key **S**).

## Hadith break

Between prayers — and only until 20 minutes before the next one — the board
takes over the full screen every 5–15 minutes (random each time) to show one
authentic (صحيح) hadith for one minute, then returns to the normal countdown.
It never interrupts the adhan, the prayer itself, or the last-5-minutes
countdown. Tunable in `js/app.js`: `HADITH_GAP_MIN` (how close to the next
prayer to stay quiet), `HADITH_SHOW_MS` (display duration), and
`randHadithGapMs` (the 5–15 minute interval).

The hadiths themselves live in `assets/data/hadiths.csv` — four columns:
`text`, `narrator`, `source`, `grade` (a short authenticity/attribution
note; `narrator` may be left as `-` for hadiths with no specific narrator
named). To add or edit hadiths, just edit that CSV and reload the page —
it's fetched and parsed client-side at startup, no build step. This only
works when the page is served over http(s) (`npm start` or any static
server); opening `index.html` directly as a `file://` URL blocks the fetch,
and the board simply runs with no hadith break.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `S` | Open/close settings |
| `F` | Toggle full-screen |
| `D` | Speed up the clock (demo mode) |
| `R` | Return to real time |
| `←` / `→` | Shift time ±10 minutes |
| `M` | Toggle adhan chime |
