// Runs server-side (in GitHub Actions). Fetches every feed directly —
// no CORS proxy needed here since this isn't running in a browser —
// and writes the combined, sorted results to feeds-data.json.

const fs = require("fs");
const Parser = require("rss-parser");
const parser = new Parser({ timeout: 15000 }); // give up on a feed after 15s

const FEEDS = JSON.parse(fs.readFileSync("./feeds-config.json", "utf-8"));

// Change this to your city / coordinates.
const WEATHER_LOCATION = {
  name: "Madison, WI",
  lat: 43.0731,
  lon: -89.4012,
};

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
