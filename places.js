// Data for the warm-place finder. Edit this file to update hours.
//
// TO ADD A PLACE: copy one { ... } block inside PLACES, change the details, and add lat and lng to it
// (in Google Maps, right-click the building and click the two numbers to copy them).
// Save, and it shows up on the map, in the list and in "Find closest". Nothing else needs changing.
// kind: "warm" = somewhere to warm up, listed with its hours. "overnight" = an overnight shelter.
// Run `node finder.test.js` afterwards: it fails if a pin lands outside the county or the hours are mistyped.
//
// hours: 7 entries, index 0 = Sunday ... 6 = Saturday.
//        Each is ["HH:MM", "HH:MM"] in 24-hour time, or null for closed that day.
//        hours: null for the whole field means the source page publishes no building hours.
// exceptions: "YYYY-MM-DD" -> ["HH:MM", "HH:MM"], or null for closed that day.
//
// ponytail: hand-edited file. Move to a spreadsheet the county owns once it has an owner there.

const CHECKED = "2026-11-15"; // date every entry below was last checked against its source

// On these dates a place with no listed exception is shown as "call first", never as open.
// ponytail: hand-listed for winter 2026-27 only. Extend each season, or switch to a holiday feed.
// Dec 24 and Dec 31 are not statutory, but every county page that lists holiday hours changes them.
const STAT_HOLIDAYS = ["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31", "2027-01-01", "2027-02-15", "2027-03-26"];

// [Sunday, Mon-Fri x5, Saturday]
const wk = (weekday, sat, sun) => [sun, weekday, weekday, weekday, weekday, weekday, sat];

const REC = "https://www.strathcona.ca/recreation-events/recreation-centres/";
const CARD = { label: "Strathcona County cold-weather card, updated Oct. 2026" };

const PLACES = [
  // ---- Daytime warm places named on the county's cold-weather card ----
  {
    id: "community-centre", kind: "warm", name: "Community Centre", area: "Sherwood Park",
    address: "401 Festival Lane, Sherwood Park", phone: "780-410-8505",
    note: "Use the main north doors.",
    hours: wk(["07:30", "21:00"], ["08:00", "18:00"], ["10:00", "18:00"]),
    source: { label: "County page", url: "https://www.strathcona.ca/community-families/community-facilities/community-centre-county-hall/" },
  },
  {
    id: "library", kind: "warm", name: "Strathcona County Library", area: "Sherwood Park",
    address: "401 Festival Lane, Sherwood Park", phone: "780-410-8600",
    hours: [["11:00", "17:00"], ["09:30", "21:00"], ["09:30", "21:00"], ["09:30", "21:00"], ["09:30", "21:00"], ["09:30", "20:00"], ["09:30", "17:00"]],
    exceptions: { "2026-12-24": null, "2026-12-25": null, "2026-12-26": null, "2026-12-27": null, "2026-12-31": ["09:30", "17:00"], "2027-01-01": null },
    source: { label: "Library page", url: "https://sclibrary.ca/locations/central/" },
  },
  {
    id: "bethel", kind: "warm", name: "Bethel Transit Terminal", area: "Sherwood Park",
    address: "650 Bethel Drive, Sherwood Park",
    note: "Heated, staffed building.",
    hours: wk(["05:30", "22:45"], ["07:00", "22:45"], ["08:00", "18:45"]),
    source: { label: "County page", url: "https://www.strathcona.ca/transportation-roads/transportation/bus-terminals/" },
  },
  {
    id: "ordze", kind: "warm", name: "Ordze Transit Centre", area: "Sherwood Park",
    address: "970 Ordze Road, Sherwood Park",
    note: "Heated indoor waiting area. No staff on site.",
    hours: wk(["05:30", "19:45"], null, null),
    source: { label: "County page", url: "https://www.strathcona.ca/transportation-roads/transportation/bus-terminals/" },
  },

  // ---- Recreation centre lobbies and common areas (also named on the card) ----
  {
    id: "millennium", kind: "warm", name: "Millennium Place", area: "Sherwood Park",
    address: "2000 Premier Way, Sherwood Park", phone: "780-416-3300",
    note: "Lobby and common areas.",
    hours: wk(["05:00", "22:30"], ["06:00", "21:00"], ["06:00", "21:00"]),
    exceptions: { "2026-12-24": ["10:00", "17:00"], "2026-12-25": null, "2026-12-26": ["10:00", "17:00"], "2026-12-31": ["10:00", "17:00"], "2027-01-01": ["10:00", "17:00"] },
    source: { label: "County page", url: REC + "millennium-place/" },
  },
  {
    id: "glen-allan", kind: "warm", name: "Glen Allan Recreation Complex", area: "Sherwood Park",
    address: "199 Georgian Way, Sherwood Park", phone: "780-467-4404",
    note: "Lobby and common areas.",
    hours: wk(["05:30", "22:00"], ["06:00", "21:00"], ["06:00", "21:00"]),
    exceptions: { "2026-12-24": null, "2026-12-25": null, "2026-12-26": null, "2026-12-31": ["05:30", "17:00"], "2027-01-01": null },
    source: { label: "County page", url: REC + "glen-allan-recreation-complex/" },
  },
  {
    id: "ardrossan", kind: "warm", name: "Ardrossan Recreation Complex", area: "Ardrossan",
    address: "80 1 Avenue, Ardrossan", phone: "780-400-2084",
    note: "Lobby and common areas.",
    hours: wk(["05:30", "22:00"], ["06:00", "21:00"], ["06:00", "21:00"]),
    exceptions: { "2026-12-24": null, "2026-12-25": null, "2026-12-26": ["09:00", "21:00"], "2026-12-31": ["10:00", "17:00"], "2027-01-01": null },
    source: { label: "County page", url: REC + "ardrossan-recreation-complex/" },
  },
  {
    id: "emerald-hills", kind: "warm", name: "Emerald Hills Leisure Centre", area: "Sherwood Park",
    address: "3555 Emerald Drive, Sherwood Park", phone: "780-464-2112",
    note: "Hours can change with bookings. Call first.",
    hours: wk(["05:30", "21:00"], ["07:00", "19:00"], ["07:00", "16:30"]),
    exceptions: { "2026-12-24": null, "2026-12-25": null, "2026-12-26": null, "2027-01-01": null },
    source: { label: "County page", url: REC + "emerald-hills-leisure-centre/" },
  },
  {
    id: "kinsmen", kind: "warm", name: "Kinsmen Leisure Centre", area: "Sherwood Park",
    address: "2001 Oak Street, Sherwood Park", phone: "780-400-3866",
    note: "Hours can change with bookings. Call first.",
    hours: [["07:00", "18:00"], ["06:30", "21:00"], ["06:30", "21:00"], ["06:30", "21:00"], ["06:30", "21:00"], ["06:30", "19:00"], ["07:00", "19:00"]],
    source: { label: "County page", url: REC + "kinsmen-leisure-centre/" },
  },
  {
    id: "sp-arena", kind: "warm", name: "Sherwood Park Arena and Sports Centre", area: "Sherwood Park",
    address: "2015 Oak Street, Sherwood Park", phone: "780-893-6680",
    // The county page lists 6 a.m. to midnight (September to mid-May), but ties the hours to bookings.
    // Kept out of "open now" until the county confirms the lobby is open to the public at those times.
    ask: "Public lobby access is not confirmed",
    note: "The county lists 6 a.m. to midnight for bookings, September to mid-May.",
    hours: null,
    source: { label: "County page", url: REC + "sherwood-park-arena-and-sports-centre/" },
  },
  {
    id: "moyer", kind: "warm", name: "Moyer Recreation Centre", area: "Josephburg",
    address: "4 - 54569 Range Road 215", phone: "780-998-7022",
    hours: null,
    source: { label: "County page", url: REC + "moyer-recreation-centre/" },
  },
  {
    id: "olympiette", kind: "warm", name: "Strathcona Olympiette Centre", area: "Fultonvale",
    address: "25 - 52029 Range Road 224", phone: "780-400-3805",
    hours: null,
    source: { label: "County page", url: REC + "strathcona-olympiette-centre/" },
  },

  // ---- Overnight shelters, all in Edmonton, exactly as listed on the county's card ----
  // only: "men" | "women" | "youth" when the card says so. pets: true when the card says so.
  { id: "herb-jamison", kind: "overnight", name: "Hope Mission, Herb Jamison Centre", only: "men", address: "10014 105A Avenue NW, Edmonton", phone: "780-422-2018", source: CARD },
  { id: "karis", kind: "overnight", name: "Hope Mission, Karis Centre", only: "women", address: "10302 107 Street NW, Edmonton", phone: "780-422-2018", source: CARD },
  { id: "bruce-reith", kind: "overnight", name: "Hope Mission, Bruce Reith Centre", address: "9908 106 Avenue NW, Edmonton", phone: "780-422-2018", source: CARD },
  { id: "carepoint", kind: "overnight", name: "CarePoint Wellness Centre", pets: true, address: "14830 124 Avenue NW, Edmonton", phone: "825-394-3537", source: CARD },
  { id: "weac", kind: "overnight", name: "Women's Emergency Accommodation Centre", only: "women", note: "Screening and booking required.", address: "9611 101A Avenue, Edmonton", phone: "780-423-5302", source: CARD },
  { id: "yess", kind: "overnight", name: "YESS, Nexus 24/7 shelter", only: "youth", note: "Phone extension 231.", address: "9310 82 Avenue, Edmonton", phone: "780-468-7070", source: CARD },
  { id: "mustard-seed", kind: "overnight", name: "Mustard Seed Strathcona Shelter", address: "10050 81 Avenue NW, Edmonton", phone: "780-619-9885", source: CARD },
  { id: "central-seed", kind: "overnight", name: "Central Seed", address: "9526 106 Avenue NW, Edmonton", phone: "780-938-6878", source: CARD },
  { id: "central-seed-women", kind: "overnight", name: "Central Seed, women-only space", only: "women", address: "9526 106 Avenue NW, Edmonton", phone: "780-720-7925", source: CARD },
  { id: "maskokamik", kind: "overnight", name: "Maskokamik Lodge", address: "11845 Wayne Gretzky Drive NW, Edmonton", phone: "587-525-8222", source: CARD },
];

// Map position of each place: [latitude, longitude].
// Looked up on OpenStreetMap on 2026-11-15: county buildings by name, Edmonton shelters by street address.
// Six were checked by eye at building zoom (Community Centre, Library, arena, Ardrossan, CarePoint, Maskokamik).
// ponytail: the library is inside the Community Centre and the two Central Seed entries share a building,
// so one pin of each pair is nudged about 30 m to keep both visible. carepoint is placed by its block, not its door.
const COORDS = {
  "community-centre": [53.52658, -113.29772],
  "library": [53.52635, -113.29809],
  "bethel": [53.54285, -113.30646],
  "ordze": [53.51334, -113.33092],
  "millennium": [53.55908, -113.31364],
  "glen-allan": [53.53055, -113.28238],
  "ardrossan": [53.55321, -113.14572],
  "emerald-hills": [53.56645, -113.28892],
  "kinsmen": [53.52583, -113.30818],
  "sp-arena": [53.52695, -113.30642],
  "moyer": [53.71300, -113.07014],
  "olympiette": [53.45993, -113.19226],
  "herb-jamison": [53.54879, -113.49245],
  "karis": [53.54479, -113.50527],
  "bruce-reith": [53.55001, -113.49129],
  "carepoint": [53.57860, -113.57700],
  "weac": [53.54355, -113.48245],
  "yess": [53.51838, -113.47057],
  "mustard-seed": [53.51712, -113.49073],
  "central-seed": [53.55115, -113.48355],
  "central-seed-women": [53.55138, -113.48318],
  "maskokamik": [53.57156, -113.45328],
};
for (const p of PLACES) if (COORDS[p.id]) [p.lat, p.lng] = COORDS[p.id]; // a new place can carry its own lat and lng instead

// Starting points for people who do not share their location: Sherwood Park and the county's hamlets.
const AREAS = [
  { name: "Sherwood Park", lat: 53.5257, lng: -113.2966 },
  { name: "Antler Lake", lat: 53.4887, lng: -112.9747 },
  { name: "Ardrossan", lat: 53.5517, lng: -113.1433 },
  { name: "Collingwood Cove", lat: 53.4465, lng: -113.0096 },
  { name: "Fultonvale", lat: 53.4591, lng: -113.1893 },
  { name: "Half Moon Lake", lat: 53.4595, lng: -113.0916 },
  { name: "Hastings Lake", lat: 53.4187, lng: -112.9155 },
  { name: "Josephburg", lat: 53.7133, lng: -113.0722 },
  { name: "North Cooking Lake", lat: 53.4621, lng: -112.9490 },
  { name: "South Cooking Lake", lat: 53.4115, lng: -113.1210 },
];

if (typeof module !== "undefined") module.exports = { PLACES, STAT_HOLIDAYS, CHECKED, AREAS };
