/* ════════════════════════════════════════════════════════════════════
   مصلى ال INSAT — لوحة مواقيت الصلاة
   INSAT prayer-times display board.
   No network, no external dependencies. Open index.html on a kiosk
   and go full-screen (F11 / key "F").

   Edit CONFIG below to make settings permanent.
   ════════════════════════════════════════════════════════════════════ */
const CONFIG = {
  mosqueName : 'مصلى ال INSAT',
  cityLabel  : 'تونس (UTC+1)',

  /* INSAT — Centre Urbain Nord, Tunis */
  lat : 36.8437,
  lng : 10.1897,
  elevation : 30,          // metres above sea level

  /* Tunisia keeps UTC+1 all year — no daylight saving since 2009.
     The board therefore runs on its own fixed offset and stays right
     even if the kiosk's own clock is set to the wrong time zone.
     Set useDeviceClock:true to follow the machine's local time. */
  timezone : 1,
  useDeviceClock : false,

  /* Tunisian Ministry of Religious Affairs: Fajr 18°, Isha 18°,
     Asr by the standard (Maliki) opinion — shadow factor 1. */
  method : { fajr:18, isha:18, asrFactor:1 },

  /* Minutes added to each computed time, to match the mosque's
     printed table exactly. */
  offsets : { fajr:0, sunrise:0, dhuhr:0, asr:0, maghrib:0, isha:0 },

  adhanMinutes : 3,        // how long the "الأذان" screen stays up
  prayerMinutes: { fajr:12, dhuhr:9, asr:9, maghrib:9, isha:11 },

  /* Friday — Jumu'ah replaces Dhuhr. khutba: sermon start, prayer: when
     the Jumu'ah prayer itself begins. There is no iqama on this board —
     only the adhan call. */
  jumuah : { khutba:'12:30', prayer:'12:50' },

  hijriOffset : 0,         // ±days, to match the local moon sighting
  chime : false,           // short tone at each adhan (key "M")
  burnInGuard : true       // 3px drift every few minutes, protects the panel
};

/* ── prayer names ─────────────────────────────────────────────────── */
const NAME = { fajr:'الفجر', sunrise:'الشروق', dhuhr:'الظهر', asr:'العصر',
               maghrib:'المغرب', isha:'العشاء', jumuah:'الجمعة' };
/* الفجر → للفجر */
const toL = n => n.startsWith('ال') ? 'لل' + n.slice(2) : 'ل' + n;
const ORDER  = ['fajr','sunrise','dhuhr','asr','maghrib','isha'];
const PRAYERS = ['fajr','dhuhr','asr','maghrib','isha'];

const AR_MONTHS = ['جانفي','فيفري','مارس','أفريل','ماي','جوان',
                   'جويلية','أوت','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const AR_DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const HIJRI_MONTHS = ['محرّم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى',
                      'جمادى الآخرة','رجب','شعبان','رمضان','شوّال',
                      'ذو القعدة','ذو الحجة'];

/* ════════════════════════════════════════════════════════════════════
   1. Solar geometry — everything below is plain spherical astronomy.
   ════════════════════════════════════════════════════════════════════ */
const D2R = Math.PI/180, R2D = 180/Math.PI;
const sin = d => Math.sin(d*D2R), cos = d => Math.cos(d*D2R), tan = d => Math.tan(d*D2R);
const asin = x => Math.asin(x)*R2D, acos = x => Math.acos(x)*R2D;
const atan2 = (y,x) => Math.atan2(y,x)*R2D;
const fix = (a,b) => { a -= b*Math.floor(a/b); return a<0 ? a+b : a; };

function julianDay(y,m,d){
  if(m<=2){ y-=1; m+=12; }
  const A = Math.floor(y/100), B = 2 - A + Math.floor(A/4);
  return Math.floor(365.25*(y+4716)) + Math.floor(30.6001*(m+1)) + d + B - 1524.5;
}

/* Sun declination and equation of time for a given Julian day. */
function sunPosition(jd){
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028*D, 360);          // mean anomaly
  const q = fix(280.459 + 0.98564736*D, 360);          // mean longitude
  const L = fix(q + 1.915*sin(g) + 0.020*sin(2*g), 360); // ecliptic longitude
  const e = 23.439 - 0.00000036*D;                     // obliquity
  const RA = fix(atan2(cos(e)*sin(L), cos(L))/15, 24);
  let eqt = q/15 - RA;
  if(eqt >  12) eqt -= 24;
  if(eqt < -12) eqt += 24;
  return { decl: asin(sin(e)*sin(L)), eqt };
}

/* Look up an exact time table for the day, e.g. a Mawaqit CSV export
   (see js/prayerTimes2026.js). Returns hours-after-midnight per prayer,
   or null when the day isn't covered and the astronomical model below
   should be used instead. */
function tableTimes(y, m, d){
  const key = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const row = (typeof PRAYER_DATA_2026 !== 'undefined') && PRAYER_DATA_2026[key];
  if(!row) return null;
  const out = {};
  ORDER.forEach((k, i) => {
    const [hh, mm] = row[i].split(':').map(Number);
    out[k] = hh + mm/60;
  });
  return out;
}

/* Prayer times, in hours after local midnight, for one calendar day. */
function computeTimes(y, m, d, cfg){
  const table = tableTimes(y, m, d);
  if(table){
    const out = {};
    for(const k of ORDER) out[k] = table[k] + (cfg.offsets[k]||0)/60;
    return out;
  }

  const lat = cfg.lat, lng = cfg.lng, tz = cfg.timezone;
  const jd0 = julianDay(y,m,d) - lng/(15*24);
  const at = h => sunPosition(jd0 + h/24);

  const noonFor = eqt => fix(12 - eqt - lng/15 + tz, 24);

  // hour angle for the sun at a given depression angle below the horizon
  const ha = (angle, decl) => {
    let x = (-sin(angle) - sin(decl)*sin(lat)) / (cos(decl)*cos(lat));
    x = Math.max(-1, Math.min(1, x));
    return acos(x)/15;
  };
  // hour angle for Asr: shadow = factor × object height + noon shadow
  const asrHA = decl => {
    const z = Math.atan(1/(cfg.method.asrFactor + tan(Math.abs(lat-decl))))*R2D;
    let x = (sin(z) - sin(decl)*sin(lat)) / (cos(decl)*cos(lat));
    x = Math.max(-1, Math.min(1, x));
    return acos(x)/15;
  };

  // horizon dip: refraction + solar radius + height of the observer
  const horizon = 0.833 + 0.0347*Math.sqrt(Math.max(cfg.elevation||0, 0));

  // iterate: each event is evaluated with the sun's position at that event
  let noon = noonFor(at(12).eqt);
  for(let i=0;i<3;i++) noon = noonFor(at(noon).eqt);

  const solve = (guess, fn) => {
    let t = guess;
    for(let i=0;i<4;i++){
      const s = at(t);
      t = fn(noonFor(s.eqt), s.decl);
    }
    return t;
  };

  const raw = {
    fajr    : solve(noon-5, (n,dc) => n - ha(cfg.method.fajr, dc)),
    sunrise : solve(noon-6, (n,dc) => n - ha(horizon, dc)),
    dhuhr   : noon,
    asr     : solve(noon+4, (n,dc) => n + asrHA(dc)),
    maghrib : solve(noon+6, (n,dc) => n + ha(horizon, dc)),
    isha    : solve(noon+7, (n,dc) => n + ha(cfg.method.isha, dc))
  };

  // apply the mosque's own corrections, in minutes
  const out = {};
  for(const k of ORDER) out[k] = raw[k] + (cfg.offsets[k]||0)/60;
  return out;   // hours, may be used as floats
}

/* ════════════════════════════════════════════════════════════════════
   2. Clock — one source of truth for "now", so the demo mode and the
      real board run through exactly the same code path.
   ════════════════════════════════════════════════════════════════════ */
const clock = {
  offsetMs : 0,     // manual shift (arrow keys)
  speed : 1,        // 1 = real time
  anchorReal : Date.now(),
  anchorSim : Date.now(),

  nowMs(){
    if(this.speed === 1) return Date.now() + this.offsetMs;
    return this.anchorSim + (Date.now() - this.anchorReal)*this.speed + this.offsetMs;
  },
  setSpeed(s){
    this.anchorSim = this.nowMs() - this.offsetMs;
    this.anchorReal = Date.now();
    this.speed = s;
  },
  reset(){ this.offsetMs = 0; this.speed = 1; this.anchorReal = this.anchorSim = Date.now(); }
};

/* Civil date/time at the mosque, independent of the machine's time zone. */
function localNow(){
  const ms = clock.nowMs();
  if(CONFIG.useDeviceClock){
    const d = new Date(ms);
    return { y:d.getFullYear(), m:d.getMonth()+1, d:d.getDate(),
             h:d.getHours(), mi:d.getMinutes(), s:d.getSeconds(),
             dow:d.getDay(), ms:d.getMilliseconds() };
  }
  const d = new Date(ms + CONFIG.timezone*3600000);
  return { y:d.getUTCFullYear(), m:d.getUTCMonth()+1, d:d.getUTCDate(),
           h:d.getUTCHours(), mi:d.getUTCMinutes(), s:d.getUTCSeconds(),
           dow:d.getUTCDay(), ms:d.getUTCMilliseconds() };
}
const shiftDay = (n, delta) => {
  const d = new Date(Date.UTC(n.y, n.m-1, n.d));
  d.setUTCDate(d.getUTCDate()+delta);
  return { y:d.getUTCFullYear(), m:d.getUTCMonth()+1, d:d.getUTCDate(), dow:d.getUTCDay() };
};

/* ════════════════════════════════════════════════════════════════════
   3. Hijri date — Umm al-Qura through Intl, with an arithmetic fallback
      so the board still works on an old offline browser.
   ════════════════════════════════════════════════════════════════════ */
function hijriParts(y, m, d){
  const base = new Date(Date.UTC(y, m-1, d, 12));
  base.setUTCDate(base.getUTCDate() + (CONFIG.hijriOffset|0));
  try{
    const f = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura-nu-latn',
      { day:'numeric', month:'numeric', year:'numeric', timeZone:'UTC' });
    const p = {};
    for(const part of f.formatToParts(base)) if(part.type!=='literal') p[part.type] = parseInt(part.value,10);
    if(p.day && p.month && p.year) return { d:p.day, m:p.month, y:p.year };
  }catch(e){ /* fall through */ }
  // Kuwaiti arithmetic algorithm
  const jd = Math.floor(julianDay(base.getUTCFullYear(), base.getUTCMonth()+1, base.getUTCDate()) + 0.5);
  const l0 = jd - 1948440 + 10632;
  const n  = Math.floor((l0 - 1)/10631);
  let l = l0 - 10631*n + 354;
  const j = Math.floor((10985 - l)/5316)*Math.floor(50*l/17719) + Math.floor(l/5670)*Math.floor(43*l/15238);
  l = l - Math.floor((30-j)/15)*Math.floor(17719*j/50) - Math.floor(j/16)*Math.floor(15238*j/43) + 29;
  const hm = Math.floor(24*l/709);
  return { d: l - Math.floor(709*hm/24), m: hm, y: 30*n + j - 30 };
}

/* ════════════════════════════════════════════════════════════════════
   4. Formatting helpers
   ════════════════════════════════════════════════════════════════════ */
const pad = n => String(n).padStart(2,'0');
const hhmm = hours => { const t = Math.round(fix(hours,24)*60); return pad(Math.floor(t/60)%24)+':'+pad(t%60); };
const minOf = hours => Math.round(fix(hours,24)*60);   // whole minutes after midnight

const URGENT_SEC = 5*60;   // switch to the full-screen countdown this close to a prayer

function countdown(sec){
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec/3600);
  if(h > 0) return pad(h)+':'+pad(Math.floor(sec/60)%60);   // HH:MM
  return pad(Math.floor(sec/60))+':'+pad(sec%60);           // MM:SS
}

/* ════════════════════════════════════════════════════════════════════
   5. Day schedule + state machine
   ════════════════════════════════════════════════════════════════════ */
let day = null;   // cached schedule for the current civil day

function buildDay(n){
  const t   = computeTimes(n.y, n.m, n.d, CONFIG);
  const tm  = shiftDay(n, 1);
  const ty  = shiftDay(n, -1);
  const tom = computeTimes(tm.y, tm.m, tm.d, CONFIG);
  const yst = computeTimes(ty.y, ty.m, ty.d, CONFIG);
  const isFriday = n.dow === 5;

  // adhan time in seconds after midnight
  const at = {};
  for(const k of ORDER) at[k] = minOf(t[k])*60;
  if(isFriday){
    const [hh,mm] = CONFIG.jumuah.prayer.split(':').map(Number);
    at.jumuahPrayer = (hh*60+mm)*60;
  }
  return { key:`${n.y}-${n.m}-${n.d}`, t, at, tom, yst, isFriday,
           hijri: hijriParts(n.y, n.m, n.d), dow:n.dow, y:n.y, m:n.m, d:n.d };
}

/* Which prayer is running, and what is the board supposed to show. */
function currentState(nowSec){
  const at = day.at;

  // last prayer whose adhan has passed (wrapping back to yesterday's Isha)
  let current = 'isha', currentSec = minOf(day.yst.isha)*60 - 86400;
  for(const k of PRAYERS){ if(nowSec >= at[k]){ current = k; currentSec = at[k]; } }

  // next event in the countdown chain, including sunrise
  let next = null, nextSec = null;
  for(const k of ORDER){ if(at[k] > nowSec){ next = k; nextSec = at[k]; break; } }
  if(!next){ next = 'fajr'; nextSec = minOf(day.tom.fajr)*60 + 86400; }

  // phase of the current prayer: adhan → praying → idle (no iqama on this board)
  const since = nowSec - currentSec;
  const adhanSec = CONFIG.adhanMinutes*60;
  // Friday: the Jumu'ah prayer starts once the khutba ends, not right after the adhan.
  const prayStartSec = (day.isFriday && current === 'dhuhr')
        ? Math.max(adhanSec, at.jumuahPrayer - at.dhuhr)
        : adhanSec;
  const prayEndSec = prayStartSec + (CONFIG.prayerMinutes[current] || 9)*60;

  let phase = 'idle';
  if(since >= 0 && since < adhanSec)             phase = 'adhan';
  else if(since >= adhanSec && since < prayEndSec) phase = 'praying';
  else if(nextSec - nowSec <= URGENT_SEC)        phase = 'soon';

  return { current, currentSec, next, nextSec, phase, label: labelOf(current) };
}
const labelOf = k => (day.isFriday && k === 'dhuhr') ? NAME.jumuah : NAME[k];
// caption for the imminent-prayer countdown — sunrise has no adhan of its own
const untilLabel = k => k === 'sunrise' ? `متبقى على ${NAME.sunrise}` : `متبقى على أذان ${labelOf(k)}`;

/* ════════════════════════════════════════════════════════════════════
   6. Rendering
   ════════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const el = {
  bigTime:$('bigTime'), bigSec:$('bigSec'), bigLabel:$('bigLabel'), bigNote:$('bigNote'),
  mainBox:$('mainBox'), sunrise:$('sunriseTime'), weekday:$('dWeekday'),
  greg:$('dGreg'), hijri:$('dHijri'), mosque:$('mosqueName'), stage:$('stage'),
  dash:$('dash'), urgentClock:$('urgentClock'),
  hadithText:$('hadithText'), hadithCite:$('hadithCite'),
  hadithClock:$('hadithClock'), hadithNextLabel:$('hadithNextLabel'), hadithNextTime:$('hadithNextTime')
};
const cells = {};
document.querySelectorAll('#strip .cell').forEach(c => cells[c.dataset.p] = {
  box:c, name:c.querySelector('.cname'), time:c.querySelector('.ctime')
});

let lastPhase = '', lastCurrent = '', lastDayKey = '';

function paintDay(){
  for(const k of PRAYERS) cells[k].time.textContent = hhmm(day.t[k]);
  cells.dhuhr.name.textContent = day.isFriday ? NAME.jumuah : NAME.dhuhr;
  el.sunrise.textContent = hhmm(day.t.sunrise);

  el.weekday.textContent = AR_DAYS[day.dow];
  el.greg.textContent = `${pad(day.d)} ${AR_MONTHS[day.m-1]} ${day.y}`;
  el.hijri.textContent = `${pad(day.hijri.d)} ${HIJRI_MONTHS[day.hijri.m-1]} ${day.hijri.y}`;
}

function paintStrip(current){
  for(const k of PRAYERS){
    const on = (k === current);
    const c = cells[k];
    c.box.style.background = on ? '#8B1E23' : '#FFFFFF';
    c.box.style.boxShadow  = on ? 'inset 0 0 0 6px #000000' : 'none';
    c.name.style.color     = on ? '#FFFFFF' : '#2E415B';
    c.time.style.color     = on ? '#FFFFFF' : '#000000';
  }
}

function render(){
  const n = localNow();
  const key = `${n.y}-${n.m}-${n.d}`;
  if(!day || day.key !== key){ day = buildDay(n); paintDay(); lastCurrent = ''; }

  const nowSec = n.h*3600 + n.mi*60 + n.s;
  const st = currentState(nowSec);

  updateHadith(clock.nowMs(), nowSec, st);

  if(st.current !== lastCurrent){ paintStrip(st.current); lastCurrent = st.current; }

  // cross-fade only when the panel actually changes meaning
  if(st.phase !== lastPhase){
    if(lastPhase !== ''){
      el.mainBox.classList.add('out');
      setTimeout(() => el.mainBox.classList.remove('out'), 350);
    }
    if(st.phase === 'adhan' && CONFIG.chime) chime();
    el.dash.classList.toggle('urgent', st.phase === 'soon');
    lastPhase = st.phase;
  }

  const clockTxt = pad(n.h)+':'+pad(n.mi);
  el.urgentClock.textContent = clockTxt;
  el.hadithClock.textContent = clockTxt;
  el.hadithNextLabel.textContent = untilLabel(st.next);
  el.hadithNextTime.textContent = countdown(st.nextSec - nowSec);

  if(st.phase === 'adhan'){
    el.bigLabel.style.display = '';
    el.bigTime.textContent = clockTxt;
    el.bigSec.textContent  = ':'+pad(n.s);
    el.bigLabel.textContent = 'الأذان';
    el.bigNote.textContent  = `أذان ${st.label} — ${hhmm(st.currentSec/3600)}`;
  }
  else if(st.phase === 'praying'){
    el.bigLabel.style.display = '';
    el.bigTime.textContent = clockTxt;
    el.bigSec.textContent  = ':'+pad(n.s);
    el.bigLabel.textContent = 'الصلاة قائمة';
    el.bigNote.textContent  = 'يُرجى إسكات الهواتف الجوّالة';
  }
  else if(st.phase === 'soon'){
    // prayer imminent: the whole screen becomes the countdown, with the
    // prayer name announced in a caption above it
    el.bigTime.textContent = countdown(st.nextSec - nowSec);
    el.bigSec.textContent  = '';
    el.bigNote.textContent  = untilLabel(st.next);
  }
  else{
    // idle: no bare prayer name under the clock — just the countdown to the next prayer
    el.bigLabel.style.display = 'none';
    el.bigTime.textContent = clockTxt;
    el.bigSec.textContent  = ':'+pad(n.s);
    el.bigNote.textContent  = `متبقي ${countdown(st.nextSec - nowSec)} ${toL(NAME[st.next])}`;
  }
}

/* ════════════════════════════════════════════════════════════════════
   6b. Hadith break — between prayers, until 20 minutes before the next
       one, a random hadith takes over the screen every 5–15 minutes and
       stays up for one minute. Timed off clock.nowMs() (epoch ms, honours
       the demo-mode speed-up and manual offset) rather than the day's
       seconds-of-day clock, so it survives midnight cleanly.

       The hadith text lives in assets/data/hadiths.csv (columns: text,
       narrator, source, grade) and is loaded at startup with a plain
       fetch — add a row there to add a hadith, no build step needed.
       Requires the page to be served over http(s) (e.g. `npm start`);
       under file:// the fetch is blocked by the browser and the board
       simply runs with no hadith break.
   ════════════════════════════════════════════════════════════════════ */
const HADITH_GAP_MIN = 20;                 // stay quiet this close to the next prayer
const HADITH_SHOW_MS = 60*1000;            // how long each hadith stays on screen
const randHadithGapMs = () => (5 + Math.random()*10)*60*1000;   // 5–15 minutes

const hadith = { active:false, until:0, nextAt:0, lastIdx:-1 };
let HADITHS = [];

/* Minimal RFC4180 CSV parser — quoted fields, "" escapes, no external deps. */
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if(c === '"') inQuotes = true;
    else if(c === ',') { row.push(field); field = ''; }
    else if(c === '\r') { /* ignore — \n ends the row */ }
    else if(c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  return rows;
}

async function loadHadiths(){
  try{
    const res = await fetch('assets/data/hadiths.csv');
    if(!res.ok) throw new Error('HTTP '+res.status);
    const rows = parseCSV(await res.text()).filter(r => r.some(v => v !== ''));
    const header = rows.shift() || [];
    const col = { text:header.indexOf('text'), narrator:header.indexOf('narrator'),
                  source:header.indexOf('source'), grade:header.indexOf('grade') };
    HADITHS = rows
      .filter(r => r[col.text])
      .map(r => ({ text:r[col.text], narrator:r[col.narrator]||'', source:r[col.source]||'', grade:r[col.grade]||'' }));
  }catch(e){
    console.warn('hadith break: could not load assets/data/hadiths.csv — serve the folder over http(s) (e.g. npm start), not file://', e);
    HADITHS = [];
  }
}

function hadithFontSize(len){
  if(len <= 100) return '104px';
  if(len <= 200) return '84px';
  if(len <= 350) return '68px';
  if(len <= 500) return '56px';
  return '46px';
}

function pickHadith(){
  if(!HADITHS.length) return false;
  let i = Math.floor(Math.random()*HADITHS.length);
  if(HADITHS.length > 1 && i === hadith.lastIdx) i = (i+1) % HADITHS.length;
  hadith.lastIdx = i;
  const h = HADITHS[i];
  el.hadithText.textContent = h.text;
  el.hadithText.style.fontSize = hadithFontSize(h.text.length);
  el.hadithCite.textContent = h.source;
  return true;
}

function updateHadith(nowMs, nowSec, st){
  const canShow = st.phase === 'idle' && (st.nextSec - nowSec) > HADITH_GAP_MIN*60;

  if(hadith.active){
    if(!canShow || nowMs >= hadith.until){
      hadith.active = false;
      el.dash.classList.remove('hadith-on');
      hadith.nextAt = nowMs + randHadithGapMs();
    }
    return;
  }

  if(!hadith.nextAt){ hadith.nextAt = nowMs + randHadithGapMs(); return; }

  if(canShow && nowMs >= hadith.nextAt && pickHadith()){
    hadith.active = true;
    hadith.until = nowMs + HADITH_SHOW_MS;
    el.dash.classList.add('hadith-on');
  }
}

/* ── short adhan tone, synthesised so there is no audio file ──────── */
let audioCtx = null;
function chime(){
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    [0, .55, 1.1].forEach((t,i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = [523.25, 659.25, 783.99][i];
      g.gain.setValueAtTime(0, audioCtx.currentTime+t);
      g.gain.linearRampToValueAtTime(.18, audioCtx.currentTime+t+.05);
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime+t+.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime+t); o.stop(audioCtx.currentTime+t+.55);
    });
  }catch(e){ /* audio unavailable — the board keeps running */ }
}

/* ════════════════════════════════════════════════════════════════════
   7. Fit to screen, burn-in guard, keyboard
   ════════════════════════════════════════════════════════════════════ */
let drift = 0;
function fit(){
  const s = Math.min(innerWidth/1920, innerHeight/1080);
  const dx = CONFIG.burnInGuard ? [0,3,0,-3][drift%4] : 0;
  const dy = CONFIG.burnInGuard ? [0,-3,3,0][drift%4] : 0;
  el.stage.style.transform = `translate(${dx}px,${dy}px) scale(${s})`;
}
addEventListener('resize', fit);
setInterval(() => { drift++; fit(); }, 4*60*1000);

/* settings panel */
const panel = $('panel');
const F = {
  f_lat:['lat'], f_lng:['lng'], f_elev:['elevation'], f_tz:['timezone'],
  f_hijri:['hijriOffset'],
  f_fajr:['method','fajr'], f_isha:['method','isha'], f_asr:['method','asrFactor'],
  o_fajr:['offsets','fajr'], o_sunrise:['offsets','sunrise'], o_dhuhr:['offsets','dhuhr'],
  o_asr:['offsets','asr'], o_maghrib:['offsets','maghrib'], o_isha:['offsets','isha'],
  q_adhan:['adhanMinutes']
};
const dig = path => path.reduce((o,k) => o[k], CONFIG);
function loadPanel(){ for(const id in F) $(id).value = dig(F[id]); }
function applyPanel(){
  for(const id in F){
    const p = F[id], v = parseFloat($(id).value);
    if(!isFinite(v)) continue;
    if(p.length === 1) CONFIG[p[0]] = v; else CONFIG[p[0]][p[1]] = v;
  }
  day = null; lastPhase = ''; render();
}
function togglePanel(on){
  panel.classList.toggle('on', on);
  document.body.classList.toggle('pointer', on);
  if(on) loadPanel();
}
$('btnApply').onclick = () => { applyPanel(); togglePanel(false); };
$('btnClose').onclick = () => togglePanel(false);

const demoBadge = $('demo'), demoSpeed = $('demoSpeed');
function showDemo(){
  const on = clock.speed !== 1 || clock.offsetMs !== 0;
  demoBadge.classList.toggle('on', on);
  demoSpeed.textContent = clock.speed === 1 ? 'إزاحة يدوية' : '×'+clock.speed;
}

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if(k === 'escape'){ togglePanel(false); return; }
  if(panel.classList.contains('on') && e.target.tagName === 'INPUT') return;
  if(k === 's'){ togglePanel(!panel.classList.contains('on')); }
  else if(k === 'f'){ document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
  else if(k === 'd'){ clock.setSpeed(clock.speed === 1 ? 60 : clock.speed === 60 ? 600 : 1); showDemo(); }
  else if(k === 'r'){ clock.reset(); showDemo(); }
  else if(k === 'm'){ CONFIG.chime = !CONFIG.chime; if(CONFIG.chime) chime(); }
  else if(e.key === 'ArrowRight'){ clock.offsetMs += 600000; showDemo(); }
  else if(e.key === 'ArrowLeft'){  clock.offsetMs -= 600000; showDemo(); }
  render();
});
addEventListener('mousemove', () => {
  document.body.classList.add('pointer');
  clearTimeout(window.__c);
  window.__c = setTimeout(() => { if(!panel.classList.contains('on')) document.body.classList.remove('pointer'); }, 3000);
});

/* ── go ──────────────────────────────────────────────────────────── */
el.mosque.textContent = CONFIG.mosqueName;
loadHadiths();
fit();
render();
requestAnimationFrame(() => el.stage.classList.add('ready'));
/* tick on the second boundary so the seconds never stutter */
(function tick(){
  render();
  const intoSecond = CONFIG.useDeviceClock ? new Date().getMilliseconds() : localNow().ms;
  setTimeout(tick, Math.max(40, (1000 - intoSecond)/Math.max(1, clock.speed)));
})();
