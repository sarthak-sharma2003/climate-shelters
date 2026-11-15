// Self-check: run `node finder.test.js`. Fails loudly if the open/closed logic or the data breaks.
const assert = require("node:assert/strict");
const F = require("./finder.js");
const { PLACES, STAT_HOLIDAYS, AREAS } = require("./places.js");
const { COUNTY } = require("./boundary.js");

const at = (s) => F.momentFromLocal(s);
const ids = (list) => list.map((x) => x.place.id).sort();
const byId = (id) => PLACES.find((p) => p.id === id);
const st = (id, when) => F.status(byId(id), at(when), STAT_HOLIDAYS);
const CARD_PLACES = ["community-centre", "library", "bethel", "ordze"];

// Wednesday 2 p.m.: every place with published hours is open; the two without are "call first".
let s = F.summarize(PLACES, at("2026-11-18T14:00"), STAT_HOLIDAYS);
assert.equal(s.open.length, 9);
assert.equal(s.closed.length, 0);
assert.deepEqual(ids(s.unknown), ["moyer", "olympiette", "sp-arena"]);
assert.equal(s.open[0].place.id, "bethel"); // longest-open first (10:45 p.m.)

// Sunday 8 p.m.: none of the four places the county's card names is open.
s = F.summarize(PLACES, at("2026-11-15T20:00"), STAT_HOLIDAYS);
assert.deepEqual(ids(s.open), ["ardrossan", "glen-allan", "millennium"]);
assert.ok(CARD_PLACES.every((id) => !ids(s.open).includes(id)));
assert.equal(F.fmtOpens(st("community-centre", "2026-11-15T20:00").opens), "Opens tomorrow at 7:30 a.m.");

// Thursday 11:30 p.m.: the last bus has gone and nothing confirmed is open.
s = F.summarize(PLACES, at("2026-11-19T23:30"), STAT_HOLIDAYS);
assert.deepEqual(ids(s.open), []);
assert.equal(F.lastBus(at("2026-11-19T23:30")).gone, true);
assert.equal(F.lastBus(at("2026-11-19T22:15")).minutesLeft, 60);
assert.equal(F.lastBus(at("2026-11-20T02:00")).gone, true);

// Edges: closing time itself is closed; opening time itself is open; one minute left counts as open.
assert.equal(st("community-centre", "2026-11-18T21:00").state, "closed");
assert.equal(st("community-centre", "2026-11-18T07:30").state, "open");
assert.equal(st("bethel", "2026-11-18T22:44").minutesLeft, 1);
assert.equal(st("bethel", "2026-11-18T22:45").state, "closed");
assert.equal(st("sp-arena", "2026-11-18T14:00").state, "unknown"); // not confirmed, so never shown as open

// Friday evening at Ordze: closed for the weekend, next opening is Monday.
assert.equal(F.fmtOpens(st("ordze", "2026-11-20T19:50").opens), "Opens Monday at 5:30 a.m.");

// Christmas Day: listed closures apply, and places with no holiday hours are "call first", never open.
s = F.summarize(PLACES, at("2026-12-25T12:00"), STAT_HOLIDAYS);
assert.equal(s.open.length, 0);
assert.equal(st("library", "2026-12-25T12:00").state, "closed");
assert.deepEqual(st("community-centre", "2026-12-25T12:00"), { state: "unknown", reason: "holiday" });
// Dec 31: a listed short day is used.
assert.equal(st("millennium", "2026-12-31T16:00").closes, 17 * 60);
assert.equal(st("millennium", "2026-12-31T18:00").state, "closed");
// Dec 31 with no listed hours: call first, never a normal weekday.
assert.equal(st("community-centre", "2026-12-31T12:00").state, "unknown");
assert.equal(st("bethel", "2026-12-24T12:00").state, "unknown");

// Shelter filters follow the card's labels.
const shelters = PLACES.filter((p) => p.kind === "overnight");
assert.equal(shelters.length, 10);
const match = (f) => shelters.filter((x) => F.shelterMatches(x, f)).map((x) => x.id);
assert.ok(!match("men").includes("karis") && match("men").includes("herb-jamison"));
assert.ok(!match("women").includes("herb-jamison") && match("women").includes("weac"));
assert.deepEqual(match("youth"), ["yess"]);
assert.deepEqual(match("pets"), ["carepoint"]);

// Time formatting, and the device's own time zone must not matter.
assert.equal(F.fmtTime(21 * 60), "9 p.m.");
assert.equal(F.fmtTime(22 * 60 + 45), "10:45 p.m.");
assert.equal(F.fmtTime(1440), "midnight");
assert.equal(F.fmtTime(720), "noon");
assert.deepEqual(F.momentNow(new Date("2026-11-16T03:00:00Z")), { ymd: "2026-11-15", dow: 0, minutes: 20 * 60 });

// Distance: straight-line, Community Centre to Ardrossan Recreation Complex is about 10.5 km.
const d = F.distanceKm(byId("community-centre"), byId("ardrossan"));
assert.ok(d > 10 && d < 11, String(d));
assert.equal(F.fmtDistance(0.34), "300 m");
assert.equal(F.fmtDistance(2.44), "2.4 km");
assert.equal(F.fmtDistance(23.6), "24 km");

// With a starting point, every group is closest first. From Ardrossan on a weekday afternoon
// the closest open place is the Ardrossan complex; from Josephburg the closest of all is Moyer (call first).
const from = (name) => AREAS.find((a) => a.name === name);
s = F.summarize(PLACES, at("2026-11-18T14:00"), STAT_HOLIDAYS, from("Ardrossan"));
assert.equal(s.open[0].place.id, "ardrossan");
assert.ok(s.open.every((x, i) => i === 0 || x.km >= s.open[i - 1].km));
s = F.summarize(PLACES, at("2026-11-18T14:00"), STAT_HOLIDAYS, from("Josephburg"));
assert.equal(s.unknown[0].place.id, "moyer");
assert.ok(s.open[0].km > 15); // nothing confirmed open within 15 km of Josephburg

// Every pin is where it should be: warm places inside the county, shelters inside Edmonton.
const inBox = (p, [s0, n0, w0, e0]) => p.lat > s0 && p.lat < n0 && p.lng > w0 && p.lng < e0;
for (const p of PLACES) assert.ok(inBox(p, p.kind === "warm" ? [53.35, 53.9, -113.4, -112.8] : [53.45, 53.65, -113.7, -113.4]), p.id);
for (const a of AREAS) assert.ok(inBox(a, [53.35, 53.9, -113.4, -112.8]), a.name);

// The county outline: every warm place and every area in the picker is inside it, no Edmonton shelter is,
// and neither is Camrose (where this may well be demoed from).
for (const p of PLACES) assert.equal(F.inside(p, COUNTY), p.kind === "warm", p.id);
for (const a of AREAS) assert.ok(F.inside(a, COUNTY), a.name);
assert.equal(F.inside({ lat: 53.0167, lng: -112.8236 }, COUNTY), false);

// Data sanity: every warm place has a source, and every hours row is well formed.
for (const p of PLACES) {
  assert.ok(p.source && p.source.label, p.id);
  for (const h of [...(p.hours || []), ...Object.values(p.exceptions || {})]) {
    if (h) assert.ok(/^\d\d:\d\d$/.test(h[0]) && /^\d\d:\d\d$/.test(h[1]) && h[0] < h[1], p.id);
  }
}

console.log("finder: all checks passed");
