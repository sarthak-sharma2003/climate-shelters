// Logic for the warm-place finder. No DOM in here, so `node finder.test.js` can check it.
// A "moment" is Edmonton wall time: { ymd: "YYYY-MM-DD", dow: 0-6 (0 = Sunday), minutes: 0-1439 }.
(function (root) {
  const TZ = "America/Edmonton";
  // What a place can be confirmed as a shelter from. A place lists these in its `good` array.
  const NEEDS = { cold: "Cold weather", heat: "Heat", smoke: "Wildfire smoke", power: "Power outage" };
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // ponytail: one fixed time taken from the county's card, not a transit schedule.
  // Sunday and holiday service may end earlier. Replace with the transit feed if the county shares one.
  const LAST_BUS = 23 * 60 + 15;
  const BUSES_RESUME = 5 * 60; // before this we still say the last bus has gone

  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const utc = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dowOf = (ymd) => utc(ymd).getUTCDay();
  const addDays = (ymd, n) => { const d = utc(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // "YYYY-MM-DDTHH:MM" (what <input type="datetime-local"> gives), read as Edmonton wall time.
  function momentFromLocal(str) {
    const [ymd, hm] = str.split("T");
    return { ymd, dow: dowOf(ymd), minutes: toMin(hm.slice(0, 5)) };
  }

  // Current Edmonton time, whatever the device's own time zone is.
  function momentNow(date = new Date()) {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return momentFromLocal(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`);
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

  function lastBus(at) {
    const gone = at.minutes >= LAST_BUS || at.minutes < BUSES_RESUME;
    return { gone, minutesLeft: gone ? 0 : LAST_BUS - at.minutes, time: LAST_BUS };
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

  function fmtOpens(opens) {
    if (!opens) return "No opening listed this week";
    const day = opens.dayOffset === 0 ? "today" : opens.dayOffset === 1 ? "tomorrow" : DAYS[opens.dow];
    return `Opens ${day} at ${fmtTime(opens.minutes)}`;
  }

  const api = { DAYS, NEEDS, momentFromLocal, momentNow, status, summarize, lastBus, shelterMatches, fmtTime, fmtOpens, distanceKm, fmtDistance, inside, pool, suggestNeed, aqhiRisk, weekLines };
  root.Finder = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
