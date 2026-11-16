// Self-check for the MCP server: run `node mcp/test.mjs`. It talks to the server the way an assistant would.
import assert from "node:assert/strict";
import server from "./worker.mjs";
import places from "../places.js";
import F from "../finder.js";

let n = 0;
const call = async (method, params) => {
  const res = await server.fetch(new Request("https://example.test/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }) }));
  return (await res.json()).result;
};
const text = async (name, args) => (await call("tools/call", { name, arguments: args })).content[0].text;

// Handshake and tool list.
const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
assert.equal(init.protocolVersion, "2025-06-18");
assert.ok(init.capabilities.tools);
assert.deepEqual((await call("tools/list")).tools.map((t) => t.name), ["find_shelter", "overnight_shelters", "current_conditions"]);
// A notification gets no body.
assert.equal((await server.fetch(new Request("https://example.test/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }))).status, 202);

// "I'm cold in Ardrossan" on a weekday afternoon: the same first answer as the page gives.
const when = "2026-11-18T14:00";
const ardrossan = places.AREAS.find((a) => a.name === "Ardrossan");
const page = F.summarize(F.pool(places.PLACES, "cold").list, F.momentFromLocal(when), places.STAT_HOLIDAYS, ardrossan);
const cold = await text("find_shelter", { place: "Ardrossan", need: "cold", when });
assert.ok(cold.includes(`1. ${page.open[0].place.name}.`), cold);
assert.ok(cold.includes("Open until 10 p.m.") && cold.includes("780-400-2084") && cold.includes("call before going"));

// Thursday 11:30 p.m.: nothing open, and it says so instead of inventing a place.
const late = await text("find_shelter", { place: "Sherwood Park", when: "2026-11-19T23:30" });
assert.ok(late.includes("Nothing on the list is open") && late.includes("Soonest to open"), late);

// Heat: nothing is confirmed, and the answer must say that.
assert.ok((await text("find_shelter", { place: "Ardrossan", need: "heat", when })).includes("No building is confirmed as a shelter from heat yet"));

// Overnight: the pet filter leaves one shelter.
const pets = await text("overnight_shelters", { who: "pets" });
assert.ok(pets.includes("CarePoint Wellness Centre") && !pets.includes("Herb Jamison"));

console.log("mcp: all checks passed");
