// Builds shelters.json, the open data feed, from the same data the page uses. Run `node build-feed.js` after
// changing places.js. finder.test.js fails if the saved feed no longer matches, so it cannot go stale unnoticed.
const fs = require("node:fs");
const F = require("./finder.js");
const { PLACES, STAT_HOLIDAYS, CHECKED } = require("./places.js");

const SITE = "https://sarthak-sharma2003.github.io/climate-shelters/";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const base = (p) => ({ name: p.name, address: p.address, ...(p.area ? { area: p.area } : {}), ...(p.phone ? { phone: p.phone } : {}), latitude: p.lat, longitude: p.lng, ...(p.note ? { note: p.note } : {}) });

function feed() {
  return {
    title: "Climate shelters in Strathcona County, Alberta",
    about: "Public buildings people can go into to get out of cold, heat, wildfire smoke or a power outage, and overnight shelters. A student prototype, not an official Strathcona County source.",
    how_to_use: [
      "Alberta time is UTC-06:00 all year (no clock changes since 2026).",
      "A day shelter is open when the current Alberta time falls inside its hours for that day. Check dated_exceptions first.",
      "On a date in holidays_with_unknown_hours that has no dated exception, do not say a place is open. Say call first.",
      "A place with hours_published false has no confirmed hours. Say call first and give the phone number.",
      "confirmed_for lists what the county has confirmed a place as a shelter from. Do not claim more than that.",
      "Always tell the person to call before going. In an emergency the number is 911. For help finding services it is 211.",
    ],
    web_page: SITE,
    hours_last_checked: CHECKED,
    holidays_with_unknown_hours: STAT_HOLIDAYS,
    day_shelters: PLACES.filter((p) => p.kind === "day").map((p) => ({
      ...base(p),
      confirmed_for: p.good.map((g) => F.NEEDS[g].toLowerCase()),
      hours_published: !!p.hours,
      usual_hours: F.weekLines(p),
      ...(p.hours ? { hours_by_day: Object.fromEntries(DAYS.map((d, i) => [d, p.hours[i] ? { opens: p.hours[i][0], closes: p.hours[i][1] } : "closed"])) } : {}),
      ...(p.exceptions ? { dated_exceptions: Object.fromEntries(Object.entries(p.exceptions).map(([d, h]) => [d, h ? { opens: h[0], closes: h[1] } : "closed"])) } : {}),
      ...(p.ask ? { caution: p.ask } : {}),
      ...(p.source.url ? { source: p.source.url } : {}),
    })),
    overnight_shelters: PLACES.filter((p) => p.kind === "overnight").map((p) => ({
      ...base(p), ...(p.only ? { only_for: p.only } : {}), pets_allowed: !!p.pets,
    })),
    overnight_note: "The county's cold-weather card lists no overnight shelter in Strathcona County. These are in Edmonton, on county bus routes. Last county bus to Edmonton: 11:15 p.m. Monday to Saturday, 7:15 p.m. Sunday. Holiday service differs.",
    phone_lines: [
      { number: "911", for: "Emergency" },
      { number: "211", for: "Help finding services, 24 hours" },
      { number: "780-464-4044", for: "Strathcona County Family and Community Services, weekdays" },
      { number: "780-467-7741", for: "RCMP non-emergency, 24 hours" },
    ],
  };
}

if (require.main === module) {
  fs.writeFileSync(__dirname + "/shelters.json", JSON.stringify(feed(), null, 2) + "\n");
  console.log("wrote shelters.json");
}
module.exports = { feed };
