# Neocities RSS + Weather Hub

A personal news hub hosted on Neocities that shows a curated set of RSS
headlines plus a local weather forecast — automatically refreshed on a
schedule, with no manual uploading required after initial setup.

## How it works

Neocities' free tier blocks pages from making live requests to outside
APIs (a Content-Security-Policy restriction), so this project fetches
everything **ahead of time** instead of in the visitor's browser:

1. **GitHub Actions runs on a timer** (every 3 hours by default) and
   executes `fetch-feeds.js`.
2. That script fetches every RSS feed listed in `feeds-config.json`, plus
   a short-term forecast from the National Weather Service API, and
   writes it all into one file: `feeds-data.json`.
3. The workflow commits that file back to this repo, then uploads
   `index.html`, `app.js`, `style.css`, and `feeds-data.json` straight to
   Neocities using the Neocities API.
4. When someone visits the Neocities page, `app.js` just reads
   `feeds-data.json` from the same domain — which Neocities always
   allows, since it's not an external request.

So the whole pipeline is: **GitHub Actions fetches → commits → uploads to
Neocities**, and the page itself stays a simple static reader.

## File map

| File | Purpose |
|---|---|
| `feeds-config.json` | The list of RSS feeds to follow. Edit this to add/remove sources. |
| `fetch-feeds.js` | Runs in GitHub Actions. Fetches all feeds + weather, writes `feeds-data.json`. Also where the weather location is set. |
| `feeds-data.json` | Generated automatically — don't edit by hand, it gets overwritten every run. |
| `index.html` / `app.js` / `style.css` | The actual page that gets uploaded to Neocities. |
| `.github/workflows/update-feeds.yml` | The GitHub Actions workflow: schedule, build steps, Neocities deploy. |
| `package.json` | Node dependency list (just `rss-parser`). |

## Making changes

### Add or remove an RSS feed
Edit `feeds-config.json`. Each entry needs `category`, `name`, and `url`,
**all in quotes** — this file is strict JSON, unlike JavaScript, so every
key needs quotes too:

```json
{ "category": "Tech", "name": "The Verge", "url": "https://www.theverge.com/rss/index.xml" }
```

Commit the change, then either wait for the next scheduled run or trigger
one manually (see below).

### Change the weather location
Open `fetch-feeds.js` and edit the `WEATHER_LOCATION` block near the top:

```js
const WEATHER_LOCATION = {
  name: "Madison, WI",
  lat: 43.0731,
  lon: -89.4012,
};
```

### Change how often it updates
Edit the `cron` line in `.github/workflows/update-feeds.yml`:
- `0 * * * *` — every hour
- `0 */6 * * *` — every 6 hours
- `0 8 * * *` — once a day at 8am UTC

### Trigger a run manually
Repo → **Actions** tab → **"Update RSS feeds"** → **Run workflow**.

## Setup reference (already done, kept here for future reference)

1. Generated a Neocities API key: dashboard → **Settings → API Key**.
2. Added it as a GitHub secret in this repo: **Settings → Secrets and
   variables → Actions** → secret named `NEOCITIES_API_KEY`.
3. Pushed all project files to this repo, including the
   `.github/workflows/update-feeds.yml` file at that exact path (GitHub
   only detects workflows there).
4. Ran the workflow manually once via the Actions tab to confirm it
   worked, then let the schedule take over.

## Known issues / lessons learned

- **Reuters' RSS feed (`reutersagency.com/feed`) hangs instead of
  failing cleanly** — it was removed from `feeds-config.json`. If
  re-adding wire-style world news is wanted later, NPR
  (`https://feeds.npr.org/1001/rss.xml`) has been reliable, or an AP News
  feed can be generated via [rss.app](https://rss.app) since AP doesn't
  publish an official RSS feed of its own.
- Every feed fetch has a 15-second timeout (`Parser({ timeout: 15000 })`
  in `fetch-feeds.js`), and the whole job has a 5-minute limit
  (`timeout-minutes: 5` in the workflow), so one slow feed can't hang the
  entire pipeline — it'll just fail that one feed and move on.
- `feeds-config.json` must be valid JSON — object keys need double quotes
  (unlike plain JavaScript). A stray unquoted key will break the whole
  build with a `SyntaxError`. [jsonlint.com](https://jsonlint.com) is a
  quick way to check before committing.

## Troubleshooting

- **Workflow fails on "Deploy to Neocities"** — check the
  `NEOCITIES_API_KEY` secret is spelled exactly right and still valid.
- **Workflow fails on "Commit updated feeds-data.json"** — check
  **Settings → Actions → General → Workflow permissions** is set to
  "Read and write permissions."
- **Site shows "Couldn't load feeds-data.json"** — the workflow hasn't
  successfully completed yet, or the upload step failed. Check the
  Actions tab.
- **A specific feed won't load / times out** — check the run's log for
  which feed failed, and consider removing or replacing it in
  `feeds-config.json`.
