# مواقيت الصلاة — INSAT Prayer Times Dashboard

A full-screen kiosk display of prayer times for the INSAT mosque (Centre Urbain Nord, Tunis). Computes prayer times astronomically (client-side, no network calls) and shows a live countdown, adhan/iqama phases, the Gregorian/Hijri date, and a settings panel.

## Project structure

```
.
├── index.html            entry point / markup
├── css/
│   └── style.css         styles + @font-face declarations
├── js/
│   └── app.js            solar-time calculations, clock, rendering, settings panel
└── assets/
    ├── fonts/             Noto Kufi Arabic (Arabic + Latin subsets, .woff2)
    └── images/             INSAT logo
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

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `S` | Open/close settings |
| `F` | Toggle full-screen |
| `D` | Speed up the clock (demo mode) |
| `R` | Return to real time |
| `←` / `→` | Shift time ±10 minutes |
| `M` | Toggle adhan chime |
