// Logic for the warm-place finder. No DOM in here, so `node finder.test.js` can check it.
// A "moment" is Edmonton wall time: { ymd: "YYYY-MM-DD", dow: 0-6 (0 = Sunday), minutes: 0-1439 }.
(function (root) {
  const ALBERTA_UTC_HOURS = -6;
  // What a place can be confirmed as a shelter from. A place lists these in its `good` array.
  const NEEDS = { cold: "Cold weather", heat: "Heat", smoke: "Wildfire smoke", power: "Power outage" };
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Last and first county bus from Bethel Transit Terminal into Edmonton, by day of the week (index 0 = Sunday).
  // Worked out from Strathcona County Transit's own schedule feed (the regional GTFS file the county's open data
  // page links to), version 261023, valid 23 Oct to 12 Dec 2026: the last trip of the day that leaves Bethel or
  // Ordze and then stops in Edmonton. The county's cold-weather card says 11:15 p.m. for every day; Sunday is 7:15 p.m.
  // ponytail: copied in by hand from one feed version. Redo it when the schedule changes (each season), or read the feed
  // automatically. Holiday service is not in here: the page tells people it differs.
  const LAST_BUS = [19 * 60 + 15, 23 * 60 + 15, 23 * 60 + 15, 23 * 60 + 15, 23 * 60 + 15, 23 * 60 + 15, 23 * 60 + 15];
  const FIRST_BUS = [8 * 60 + 15, 5 * 60 + 40, 5 * 60 + 40, 5 * 60 + 40, 5 * 60 + 40, 5 * 60 + 40, 7 * 60 + 15];

  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const utc = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dowOf = (ymd) => utc(ymd).getUTCDay();
  const addDays = (ymd, n) => { const d = utc(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // "YYYY-MM-DDTHH:MM" (what <input type="datetime-local"> gives), read as Edmonton wall time.
  function momentFromLocal(str) {
    const [ymd, hm] = str.split("T");
    return { ymd, dow: dowOf(ymd), minutes: toMin(hm.slice(0, 5)) };
  }

  // Current Alberta time, whatever the device's own time zone is.
  // Alberta stopped changing its clocks in 2026 and stays 6 hours behind UTC all year. We use that fixed offset
  // on purpose instead of asking the device for "America/Edmonton": a phone with out-of-date time zone data
  // still thinks Alberta falls back in November, and would show every place an hour off all winter.
  // ponytail: one number. If Alberta ever changes its clocks again, change ALBERTA_UTC_HOURS (or go back to Intl).
  function momentNow(date = new Date()) {
    const d = new Date(date.getTime() + ALBERTA_UTC_HOURS * 3600000);
    return { ymd: d.toISOString().slice(0, 10), dow: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }

  // [openMin, closeMin], null (closed that day), or undefined (we do not know).
  function hoursOn(place, ymd, holidays) {
    if (!place.hours) return undefined;
    if (place.exceptions && ymd in place.exceptions) { const e = place.exceptions[ymd]; return e && e.map(toMin); }
    if (holidays.includes(ymd)) return undefined; // never guess on a holiday
    const h = place.hours[dowOf(ymd)];
    return h && h.map(toMin);
  }

  function status(place, at, holidays = []) {
    const today = hoursOn(place, at.ymd, holidays);
    if (today === undefined) return { state: "unknown", reason: place.hours ? "holiday" : "unpublished" };
    if (today && at.minutes >= today[0] && at.minutes < today[1]) return { state: "open", closes: today[1], minutesLeft: today[1] - at.minutes };
    if (today && at.minutes < today[0]) return { state: "closed", opens: { dayOffset: 0, dow: at.dow, minutes: today[0] } };
    for (let n = 1; n <= 7; n++) {
      const h = hoursOn(place, addDays(at.ymd, n), holidays);
      if (h) return { state: "closed", opens: { dayOffset: n, dow: (at.dow + n) % 7, minutes: h[0] } };
    }
    return { state: "closed", opens: null };
  }

  // Straight-line distance in km between two { lat, lng } points (haversine).
  // ponytail: not travel distance. Swap for a routing service if the county wants walking or bus times.
  function distanceKm(a, b) {
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  // Is a { lat, lng } point inside a GeoJSON Polygon or MultiPolygon? Even-odd rule over every ring, so holes work.
  function inside(pt, geom) {
    const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
    let hit = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > pt.lat) !== (yj > pt.lat) && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  // Which way to go, in plain words: one of eight compass directions from point a to point b.
  function compass(a, b) {
    const rad = Math.PI / 180, dLng = (b.lng - a.lng) * rad;
    const y = Math.sin(dLng) * Math.cos(b.lat * rad);
    const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(dLng);
    const deg = (Math.atan2(y, x) / rad + 360) % 360;
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(deg / 45) % 8];
  }

  function fmtDistance(km) {
    if (km < 0.95) return `${Math.max(1, Math.round(km * 10)) * 100} m`;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  }

  // Which need the page should open on, given what is happening outside. An official alert wins, then smoke,
  // then how the temperature feels. now: { feels, aqhi, alerts: ["Extreme cold (warning)", ...] }, any part may be missing.
  // Returns a NEEDS key, or null when nothing stands out.
  // ponytail: plain thresholds (feels -15 or colder, feels 29 or hotter, air quality 7 or worse). Tune them with the county.
  function suggestNeed(now) {
    const alerts = (now.alerts || []).join(" ").toLowerCase();
    if (/cold|blizzard|winter storm/.test(alerts)) return "cold";
    if (/heat/.test(alerts)) return "heat";
    if (/air quality|smoke/.test(alerts)) return "smoke";
    if (Math.round(now.aqhi) >= 7) return "smoke";
    if (now.feels <= -15) return "cold";
    if (now.feels >= 29) return "heat";
    return null;
  }

  // The health-risk band Environment Canada gives each Air Quality Health Index value.
  function aqhiRisk(v) {
    const n = Math.round(v);
    return n >= 11 ? "very high risk" : n >= 7 ? "high risk" : n >= 4 ? "moderate risk" : "low risk";
  }

  // Day places confirmed as a shelter from `need`. If nobody has confirmed any, every day place comes back with
  // confirmed: false, so the page can list public buildings and say so, instead of showing an empty screen.
  function pool(places, need) {
    const day = places.filter((p) => p.kind === "day");
    const list = day.filter((p) => (p.good || []).includes(need));
    return list.length ? { list, confirmed: true } : { list: day, confirmed: false };
  }

  // Day places grouped for the page.
  // With a `from` point: every group is closest first, and each item carries `km`.
  // Without one: open is longest-open first, closed is soonest-opening first.
  function summarize(places, at, holidays = [], from = null) {
    const out = { open: [], closed: [], unknown: [] };
    for (const place of places) {
      if (place.kind !== "day") continue;
      const s = status(place, at, holidays);
      out[s.state].push({ place, ...s, km: from ? distanceKm(from, place) : null });
    }
    if (from) { for (const k in out) out[k].sort((a, b) => a.km - b.km); return out; }
    out.open.sort((a, b) => b.closes - a.closes);
    const wait = (x) => (x.opens ? x.opens.dayOffset * 1440 + x.opens.minutes : Infinity);
    out.closed.sort((a, b) => wait(a) - wait(b));
    return out;
  }

  // Has today's last bus to Edmonton gone? Before the first bus of the morning, the one that left was last night's.
  function lastBus(at) {
    const early = at.minutes < FIRST_BUS[at.dow], last = LAST_BUS[at.dow];
    const gone = early || at.minutes >= last;
    return { gone, minutesLeft: gone ? 0 : last - at.minutes, time: early ? LAST_BUS[(at.dow + 6) % 7] : last };
  }

  // filter: "all" | "men" | "women" | "youth" | "pets"
  function shelterMatches(shelter, filter) {
    if (filter === "men") return shelter.only !== "women";
    if (filter === "women") return shelter.only !== "men";
    if (filter === "youth") return shelter.only === "youth";
    if (filter === "pets") return shelter.pets === true;
    return true;
  }

  function fmtTime(min) {
    if (min % 1440 === 0) return "midnight";
    if (min === 720) return "noon";
    const h = Math.floor(min / 60), m = min % 60;
    return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "a.m." : "p.m."}`;
  }

  // A place's usual week in plain words, Monday first, with matching days joined:
  // ["Mon to Fri: 5 a.m. to 10:30 p.m.", "Sat and Sun: 6 a.m. to 9 p.m."]. Empty when no hours are published.
  function weekLines(place) {
    if (!place.hours) return [];
    const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], runs = [];
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      const h = place.hours[d], text = h ? `${fmtTime(toMin(h[0]))} to ${fmtTime(toMin(h[1]))}` : "closed";
      const last = runs[runs.length - 1];
      if (last && last.text === text) last.days.push(d); else runs.push({ days: [d], text });
    }
    return runs.map((r) => {
      const n = r.days.length, a = SHORT[r.days[0]], b = SHORT[r.days[n - 1]];
      return `${n === 1 ? a : n === 2 ? `${a} and ${b}` : `${a} to ${b}`}: ${r.text}`;
    });
  }

  // How many of the places with published hours are open at each quarter hour of an ordinary week.
  // Returns 7 rows, Monday first, of 96 counts. Dated exceptions and holidays are left out: this is the usual week.
  function weekGrid(places) {
    const pool = places.filter((p) => p.kind === "day" && p.hours);
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => Array.from({ length: 96 }, (_, q) =>
      pool.filter((p) => { const h = p.hours[dow]; return h && q * 15 >= toMin(h[0]) && q * 15 < toMin(h[1]); }).length));
  }

  function fmtOpens(opens) {
    if (!opens) return "No opening listed this week";
    const day = opens.dayOffset === 0 ? "today" : opens.dayOffset === 1 ? "tomorrow" : DAYS[opens.dow];
    return `Opens ${day} at ${fmtTime(opens.minutes)}`;
  }

  const api = { DAYS, NEEDS, LAST_BUS, momentFromLocal, momentNow, status, summarize, lastBus, shelterMatches, fmtTime, fmtOpens, distanceKm, fmtDistance, inside, pool, suggestNeed, aqhiRisk, weekLines, compass, weekGrid };
  root.Finder = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
