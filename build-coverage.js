// Builds coverage-data.js for the coverage page: how much of the county is within a short drive of a shelter.
// Run `node build-coverage.js` after adding or moving a place. It needs a connection.
//
// Drive-time areas come from Valhalla, an open-source router, on the public server run by FOSSGIS.
// Population comes from Strathcona County's 2024 municipal census, by enumeration area, from the county's open data.
// ponytail: each census area counts as inside if its centre point is inside a drive-time area. Rural areas are large,
// so this is a rough share, not a count of households. Use address points if the county wants it exact.
const fs = require("node:fs");
const F = require("./finder.js");
const { PLACES } = require("./places.js");

const MINUTES = 10;
const CENSUS = "https://utility.arcgis.com/usrsvcs/servers/d99b8e4e94144114bd8bad64930d27fe/rest/services/Hosted/2024_Municipal_Census___Enumeration_Areas/FeatureServer/0/query?where=1%3D1&outFields=ea,household_total&returnGeometry=false&returnCentroid=true&outSR=4326&f=json";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 1e4) / 1e4;

(async () => {
  const day = PLACES.filter((p) => p.kind === "day");
  const areas = {};
  for (const p of day) {
    const q = { locations: [{ lat: p.lat, lon: p.lng }], costing: "auto", contours: [{ time: MINUTES }], polygons: true, generalize: 60 };
    const res = await fetch("https://valhalla1.openstreetmap.de/isochrone?json=" + encodeURIComponent(JSON.stringify(q)), { headers: { "User-Agent": "climate-shelter-finder-coverage" } });
    const g = (await res.json()).features[0].geometry;
    areas[p.id] = { type: g.type, coordinates: g.type === "Polygon" ? g.coordinates.map((r) => r.map(([x, y]) => [round(x), round(y)])) : g.coordinates.map((poly) => poly.map((r) => r.map(([x, y]) => [round(x), round(y)]))) };
    console.log(p.id, g.type, JSON.stringify(areas[p.id]).length, "bytes");
    await wait(1200);
  }

  const census = (await (await fetch(CENSUS)).json()).features.map((f) => ({ ea: f.attributes.ea, people: f.attributes.household_total || 0, lat: f.centroid.y, lng: f.centroid.x }));
  // An area is "near a confirmed place" if it is inside the drive-time area of a place with published hours,
  // and "near any listed place" if it is inside any of them, including the ones that are call-first.
  const confirmed = day.filter((p) => p.hours).map((p) => areas[p.id]);
  const any = day.map((p) => areas[p.id]);
  const eas = census.map((c) => ({ ...c, near: confirmed.some((g) => F.inside(c, g)), nearAny: any.some((g) => F.inside(c, g)), rural: c.ea.startsWith("R") }));
  const sum = (list) => list.reduce((n, c) => n + c.people, 0);
  const tally = (list) => ({ people: sum(list), near: sum(list.filter((c) => c.near)), nearAny: sum(list.filter((c) => c.nearAny)) });
  const totals = { all: tally(eas), rural: tally(eas.filter((c) => c.rural)), urban: tally(eas.filter((c) => !c.rural)) };
  console.log(totals);

  const data = { minutes: MINUTES, built: new Date().toISOString().slice(0, 10), censusYear: 2024, totals, areas,
    eas: eas.map((c) => [round(c.lat), round(c.lng), c.people, c.near ? 1 : 0, c.nearAny ? 1 : 0, c.rural ? 1 : 0]) };
  fs.writeFileSync(__dirname + "/coverage-data.js",
    "// Made by build-coverage.js. Do not edit by hand.\n" +
    "// areas: the " + MINUTES + "-minute drive area around each place (OpenStreetMap data, Valhalla router).\n" +
    "// eas: census enumeration areas as [latitude, longitude, people, near a place with confirmed hours, near any listed place, rural].\n" +
    "const COVERAGE = " + JSON.stringify(data) + ";\n" +
    'if (typeof module !== "undefined") module.exports = { COVERAGE };\n');
  console.log("wrote coverage-data.js");
})();
