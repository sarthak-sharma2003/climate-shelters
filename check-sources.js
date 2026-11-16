// Weekly check: does every page the hours came from still exist? Run with `node check-sources.js`.
// It fails only on "gone" answers (404 or 410), the way the county's extreme-cold link died in November 2026.
// A blocked or slow answer is reported but does not fail, because some sites turn away automated visitors.
const { PLACES } = require("./places.js");

const urls = [...new Set(PLACES.map((p) => p.source && p.source.url).filter(Boolean))];

(async () => {
  const gone = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "climate-shelter-finder-source-check" } });
      console.log(res.status, url);
      if (res.status === 404 || res.status === 410) gone.push(url);
    } catch (err) {
      console.log("no answer", url);
    }
  }
  if (gone.length) {
    console.error(`\n${gone.length} source page(s) are gone. Find the new page and update places.js:\n` + gone.join("\n"));
    process.exit(1);
  }
  console.log(`\nAll ${urls.length} source pages still exist.`);
})();
