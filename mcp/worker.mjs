// MCP server for the climate shelter finder. It lets an AI assistant answer "I'm cold in Ardrossan" from the real list.
//
// It imports the page's own data and logic (../places.js, ../finder.js), so an assistant and the page can never disagree.
// Runs on Cloudflare Workers (free plan). To publish, from this folder:  npx wrangler login   then   npx wrangler deploy
// Redeploy after changing places.js. Check it with:  node mcp/test.mjs
//
// ponytail: a small hand-written JSON-RPC handler, no session state, no SDK. It covers what a tools-only server needs
// (initialize, ping, tools/list, tools/call). Move to the official MCP SDK if it ever needs prompts, resources or streaming.
import places from "../places.js";
import F from "../finder.js";

const { PLACES, STAT_HOLIDAYS, AREAS } = places;
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]; // protocol versions this server speaks, newest first
const PAGE = "https://sarthak-sharma2003.github.io/climate-shelters/";
const CARE = "This is a student prototype, not an official Strathcona County source. Hours can change, so call before going. Emergency: 911. Help finding services: 211.";
const NEED_WORDS = { cold: "cold weather", heat: "heat", smoke: "wildfire smoke", power: "a power outage" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const TOOLS = [
  {
    name: "find_shelter",
    description: "Find climate shelters in Strathcona County, Alberta (Sherwood Park, Ardrossan, Josephburg and the rural hamlets): public buildings a person can go into to get out of cold, heat, wildfire smoke or a power outage. Returns the nearest ones that are open, with hours, distance, address and phone. Use it when someone in the county is cold, hot, in smoke or without power and needs somewhere to go now.",
    inputSchema: {
      type: "object",
      properties: {
        place: { type: "string", description: "Where the person is: a hamlet, neighbourhood or street address in Strathcona County, for example 'Ardrossan' or 'Clover Bar Road, Sherwood Park'. Leave out if unknown." },
        need: { type: "string", enum: ["cold", "heat", "smoke", "power"], description: "What they need shelter from. 'power' is a power outage. Default: cold." },
        when: { type: "string", description: "Alberta local date and time to check, as YYYY-MM-DDTHH:MM. Leave out for right now." },
      },
    },
  },
  {
    name: "overnight_shelters",
    description: "List overnight shelters for someone in Strathcona County, Alberta. There is none in the county: these are in Edmonton, reached by county bus. Includes who each one is for, phone numbers and the last bus.",
    inputSchema: { type: "object", properties: { who: { type: "string", enum: ["all", "men", "women", "youth", "pets"], description: "Only show shelters that take this group. 'pets' means the person has a pet. Default: all." } } },
  },
  {
    name: "current_conditions",
    description: "Current temperature, the official Air Quality Health Index and any Environment Canada weather alert for Strathcona County, Alberta, and which kind of shelter the conditions call for.",
    inputSchema: { type: "object", properties: {} },
  },
];

const say = (text) => ({ content: [{ type: "text", text }] });
const dateWords = (at) => { const [, m, d] = at.ymd.split("-").map(Number); return `${F.DAYS[at.dow]} ${d} ${MONTHS[m - 1]}, ${F.fmtTime(at.minutes)}`; };
const where = (p) => (p.area && !p.address.includes(p.area) ? `${p.address}, ${p.area}` : p.address);
const end = (t) => t.replace(/\.$/, "") + "."; // times end in "p.m.", so never add a second period
const far = (x) => (x.km == null ? "" : ` ${F.fmtDistance(x.km)} ${x.dir}.`);
const tail = (p) => ` ${where(p)}.${p.phone ? " " + p.phone + "." : ""}${p.note ? " " + p.note : ""}`;

// A hamlet name is answered from our own list. Anything else goes to OpenStreetMap's search, limited to the county.
async function locate(place) {
  const q = place.trim().toLowerCase();
  const area = AREAS.find((a) => q === a.name.toLowerCase() || q.startsWith(a.name.toLowerCase() + ",")) || AREAS.find((a) => q.includes(a.name.toLowerCase()) && q.length < a.name.length + 12);
  if (area) return { lat: area.lat, lng: area.lng, label: area.name };
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&bounded=1&viewbox=-113.4016,53.8939,-112.8405,53.3512&q=" + encodeURIComponent(place);
  const hit = await fetch(url, { headers: { "User-Agent": "climate-shelter-finder-mcp" }, signal: AbortSignal.timeout(8000) }).then((r) => r.json()).then((d) => d[0]).catch(() => null);
  return hit ? { lat: +hit.lat, lng: +hit.lon, label: hit.display_name.split(",").slice(0, 2).join(",").trim() } : null;
}

async function findShelter({ place, need = "cold", when } = {}) {
  if (!(need in F.NEEDS)) need = "cold";
  const at = when && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(when) ? F.momentFromLocal(when) : F.momentNow();
  const from = place ? await locate(place) : null;
  const pool = F.pool(PLACES, need);
  const s = F.summarize(pool.list, at, STAT_HOLIDAYS, from);
  for (const g of [s.open, s.closed, s.unknown]) for (const x of g) if (from) x.dir = F.compass(from, x.place);

  const out = [`Climate shelters in Strathcona County for ${NEED_WORDS[need]}, ${dateWords(at)} Alberta time${from ? ", closest to " + from.label : ""}.`];
  if (place && !from) out.push(`"${place}" could not be found in Strathcona County, so these are not sorted by distance.`);
  if (!pool.confirmed) out.push(`No building is confirmed as a shelter from ${NEED_WORDS[need]} yet. These are public buildings that are open to the public. Say so, and tell the person to call first.`);

  if (s.open.length) {
    out.push("Open now:");
    s.open.slice(0, 4).forEach((x, i) => out.push(`${i + 1}. ${x.place.name}.${far(x)} ${end(x.minutesLeft <= 45 ? `Closes in ${x.minutesLeft} minutes, at ${F.fmtTime(x.closes)}` : `Open until ${F.fmtTime(x.closes)}`)}${tail(x.place)}`));
    if (s.open.length > 4) out.push(`${s.open.length - 4} more are open. See ${PAGE}`);
  } else {
    out.push("Nothing on the list is open at that time.");
    const soon = F.summarize(pool.list, at, STAT_HOLIDAYS).closed[0];
    if (soon) out.push(`Soonest to open: ${soon.place.name}. ${end(F.fmtOpens(soon.opens))}${tail(soon.place)}`);
    out.push("For overnight, use the overnight_shelters tool. Anyone at risk outside should call 911, or 211 for help finding a place.");
  }
  const maybe = s.unknown.filter((x) => !from || !s.open.length || x.km < s.open[0].km).slice(0, 2);
  if (maybe.length) {
    out.push("Hours not confirmed, call first:");
    for (const x of maybe) out.push(`- ${x.place.name}.${far(x)} ${x.reason === "holiday" ? "Holiday hours are not published" : x.place.ask || "Building hours are not published"}.${tail(x.place)}`);
  }
  if (from) out.push("Distances are straight-line.");
  out.push(`Map, directions and live status: ${PAGE}`, CARE);
  return say(out.join("\n"));
}

function overnightShelters({ who = "all" } = {}) {
  const list = PLACES.filter((p) => p.kind === "overnight" && F.shelterMatches(p, who));
  const bus = F.lastBus(F.momentNow());
  const out = ["There is no overnight shelter in Strathcona County on the county's list. These are in Edmonton, on county bus routes.",
    bus.gone ? end(`The last county bus to Edmonton left at ${F.fmtTime(bus.time)}`) : `Last county bus to Edmonton today: ${F.fmtTime(bus.time)} (11:15 p.m. Monday to Saturday, 7:15 p.m. Sunday; holiday service differs).`];
  for (const p of list) out.push(`- ${p.name}.${p.only ? " " + { men: "Men only", women: "Women only", youth: "Youth" }[p.only] + "." : ""}${p.pets ? " Pets allowed." : ""}${tail(p)}`);
  out.push("Call the shelter first to confirm there is space.", CARE);
  return say(out.join("\n"));
}

async function currentConditions() {
  const json = (url) => fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
  const here = { lat: 53.5257, lng: -113.2966 }; // Sherwood Park
  const [w, q, al] = await Promise.all([
    json(`https://api.open-meteo.com/v1/forecast?latitude=${here.lat}&longitude=${here.lng}&current=temperature_2m,apparent_temperature`),
    json("https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&location_id=IACIQ&latest=true&limit=1"),
    json("https://api.weather.gc.ca/collections/weather-alerts/items?f=json&bbox=-113.40,53.35,-112.84,53.90&limit=50"),
  ]);
  const live = (f) => f.properties.status_en !== "ended" && new Date(f.properties.expiration_datetime) > new Date() && f.geometry && F.inside(here, f.geometry);
  const now = { temp: w?.current?.temperature_2m, feels: w?.current?.apparent_temperature, aqhi: q?.features?.[0]?.properties?.aqhi,
    alerts: [...new Set((al?.features || []).filter(live).map((f) => f.properties.alert_short_name_en))] };
  const out = ["Conditions for Sherwood Park, Strathcona County, right now:"];
  out.push(now.temp == null ? "Temperature: not available." : `Temperature: ${Math.round(now.temp)} C, feels like ${Math.round(now.feels)} C.`);
  out.push(now.aqhi == null ? "Air quality: not available." : `Air Quality Health Index: ${Math.round(now.aqhi)}, ${F.aqhiRisk(now.aqhi)}.`);
  out.push(now.alerts.length ? `Environment Canada alerts in effect: ${now.alerts.join(", ")}.` : "No Environment Canada alert in effect for the area.");
  const want = F.suggestNeed(now);
  out.push(want ? `These conditions call for shelter from ${NEED_WORDS[want]}. Use find_shelter with need "${want}".` : "Nothing severe right now.");
  out.push("Sources: Environment Canada (alerts, air quality) and Open-Meteo (temperature).");
  return say(out.join("\n"));
}

const CALLS = { find_shelter: findShelter, overnight_shelters: overnightShelters, current_conditions: currentConditions };

async function rpc(msg) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  if (id === undefined) return null; // a notification: nothing to answer
  if (method === "initialize") {
    return ok({
      protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: "strathcona-climate-shelters", title: "Strathcona County climate shelters (student prototype)", version: "0.1.0" },
      instructions: "Use these tools when someone in Strathcona County, Alberta needs somewhere to get out of cold, heat, wildfire smoke or a power outage. Never invent hours or shelters: give only what the tools return, keep the 'call first' cautions, and mention 911 for emergencies.",
    });
  }
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "tools/call") {
    const call = CALLS[params?.name];
    if (!call) return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } };
    try { return ok(await call(params.arguments || {})); }
    catch (e) { return ok({ content: [{ type: "text", text: "The shelter finder could not answer just now. Tell the person to call 211, or 911 in an emergency." }], isError: true }); }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version" };

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method === "GET") {
      // No server-to-client stream is offered. A browser visiting the address gets a plain explanation.
      const wantsStream = (request.headers.get("Accept") || "").includes("text/event-stream");
      return wantsStream ? new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } })
        : new Response(`This is the MCP address for the Strathcona County climate shelter finder (student prototype).\nAdd it to an AI assistant as a connector, then ask: "I'm cold in Ardrossan."\nThe page for people: ${PAGE}\n`, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
    let body;
    try { body = await request.json(); }
    catch (e) { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS }); }
    const answers = (await Promise.all((Array.isArray(body) ? body : [body]).map(rpc))).filter(Boolean);
    if (!answers.length) return new Response(null, { status: 202, headers: CORS });
    return Response.json(Array.isArray(body) ? answers : answers[0], { headers: CORS });
  },
};
