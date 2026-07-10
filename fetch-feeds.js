// Runs server-side (in GitHub Actions). Fetches every feed directly —
// no CORS proxy needed here since this isn't running in a browser —
// and writes the combined, sorted results to feeds-data.json.

const fs = require("fs");
const Parser = require("rss-parser");
const parser = new Parser({
  timeout: 15000, // give up on a feed after 15s
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

const FEEDS = JSON.parse(fs.readFileSync("./feeds-config.json", "utf-8"));

// Change this to your city / coordinates.
const WEATHER_LOCATION = {
  name: "Madison, WI",
  lat: 43.0731,
  lon: -89.4012,
};

// Tries a few common places feeds hide a thumbnail image, in order of
// reliability. Returns null if nothing usable is found — the page just
// won't show an image for that item, rather than breaking.
function extractThumbnail(item) {
  // 1. A standard <enclosure> pointing at an image
  if (item.enclosure?.url && (!item.enclosure.type || item.enclosure.type.startsWith("image"))) {
    return item.enclosure.url;
  }

  // 2. Media RSS <media:thumbnail url="...">
  const thumbUrl = item.mediaThumbnail?.$?.url || item.mediaThumbnail?.url;
  if (thumbUrl) return thumbUrl;

  // 3. Media RSS <media:content ... medium="image">
  if (item.mediaContent) {
    const list = Array.isArray(item.mediaContent) ? item.mediaContent : [item.mediaContent];
    for (const entry of list) {
      const url = entry?.$?.url || entry?.url;
      const medium = entry?.$?.medium;
      const type = entry?.$?.type;
      if (url && (medium === "image" || type?.startsWith("image") || !medium)) return url;
    }
  }

  // 4. Last resort: pull a real <img src="..."> out of the HTML body.
  // Skip tracking pixels and placeholder/invalid URLs some feeds embed
  // (NPR, for example, appends a 1x1 tracking pixel to every article and
  // sometimes leaves a literal "undefined" as the src).
  const html = item["content:encoded"] || item.content || "";
  const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"'>]+)["']/gi)];
  for (const m of imgMatches) {
    const url = m[1];
    if (!url || url === "undefined") continue;
    if (/pixel|tracking|1x1|spacer/i.test(url)) continue;
    return url;
  }

  return null;
}

async function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return parsed.items.slice(0, 8).map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate || item.isoDate,
      source: feed.name,
      category: feed.category,
      thumbnail: extractThumbnail(item),
    }));
  } catch (err) {
    console.error(`Failed to fetch ${feed.name}: ${err.message}`);
    return []; // one broken feed shouldn't fail the whole build
  }
}

async function fetchWeather() {
  try {
    const pointRes = await fetchWithTimeout(`https://api.weather.gov/points/${WEATHER_LOCATION.lat},${WEATHER_LOCATION.lon}`);
    if (!pointRes.ok) throw new Error(`points lookup failed: ${pointRes.status}`);
    const pointData = await pointRes.json();

    const forecastRes = await fetchWithTimeout(pointData.properties.forecast);
    if (!forecastRes.ok) throw new Error(`forecast fetch failed: ${forecastRes.status}`);
    const forecastData = await forecastRes.json();

    return {
      location: WEATHER_LOCATION.name,
      periods: forecastData.properties.periods.slice(0, 4).map(p => ({
        name: p.name,
        temperature: p.temperature,
        temperatureUnit: p.temperatureUnit,
        shortForecast: p.shortForecast,
      })),
    };
  } catch (err) {
    console.error(`Failed to fetch weather: ${err.message}`);
    return null; // page will just skip rendering weather if this is null
  }
}

async function main() {
  const [feedResults, weather] = await Promise.all([
    Promise.all(FEEDS.map(fetchFeed)),
    fetchWeather(),
  ]);
  const items = feedResults.flat();

  const output = {
    generatedAt: new Date().toISOString(),
    items,
    weather,
  };

  fs.writeFileSync("./feeds-data.json", JSON.stringify(output, null, 2));
  console.log(`Wrote ${items.length} items from ${FEEDS.length} feeds, weather: ${weather ? "ok" : "failed"}.`);
}

main();
