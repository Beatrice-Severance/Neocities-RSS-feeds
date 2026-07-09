// Reads the locally-built feeds-data.json (same-origin, so no CORS issues
// and no third-party proxy needed) and renders it grouped by category.

function renderCategory(category, items) {
  const section = document.createElement("section");
  section.className = "category";

  const heading = document.createElement("h2");
  heading.textContent = category;
  section.appendChild(heading);

  const list = document.createElement("ul");
  items
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = `
        <a href="${item.link}" target="_blank" rel="noopener">${item.title}</a>
        <span class="meta">${item.source} · ${new Date(item.pubDate).toLocaleDateString()}</span>
      `;
      list.appendChild(li);
    });

  section.appendChild(list);
  return section;
}

function renderWeather(weather) {
  const root = document.getElementById("weather-root");
  if (!weather) {
    root.innerHTML = "";
    return;
  }

  root.innerHTML = "";
  const heading = document.createElement("h2");
  heading.textContent = `Weather · ${weather.location}`;
  root.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "weather-grid";
  weather.periods.forEach(period => {
    const card = document.createElement("div");
    card.className = "weather-card";
    card.innerHTML = `
      <p class="weather-period">${period.name}</p>
      <p class="weather-temp">${period.temperature}°${period.temperatureUnit}</p>
      <p class="weather-desc">${period.shortForecast}</p>
    `;
    grid.appendChild(card);
  });
  root.appendChild(grid);
}

async function init() {
  const root = document.getElementById("feed-root");
  const updatedEl = document.getElementById("updated-at");

  try {
    const res = await fetch("feeds-data.json");
    const data = await res.json();

    renderWeather(data.weather);

    const byCategory = {};
    data.items.forEach(item => {
      byCategory[item.category] = (byCategory[item.category] || []).concat(item);
    });

    root.innerHTML = "";
    Object.keys(byCategory).forEach(cat => {
      root.appendChild(renderCategory(cat, byCategory[cat]));
    });

    updatedEl.textContent = `Last updated: ${new Date(data.generatedAt).toLocaleString()}`;
  } catch (err) {
    root.innerHTML = "<p class='status'>Couldn't load feeds-data.json — has the build run yet?</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", init);
