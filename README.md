# Fantasy Football League History

A comprehensive historical stats website for your ESPN Fantasy Football league.

## Features

- **Dashboard**: League champions, quick stats, current standings
- **All-Time Records**: Career wins, championships, highest/lowest scores, streaks
- **Head-to-Head**: Compare any two teams' historical matchups, full H2H matrix
- **Season History**: Browse detailed stats for any past season

## Quick Start

### 1. Start the server

```bash
cd Website
node server.js
```

### 2. Open in browser

Go to: **http://localhost:3000**

### 3. Configure your league

1. Click **Settings** in the navigation
2. Enter your credentials:
   - **League ID**: `533683` (from your ESPN league URL)
   - **ESPN S2**: Your `espn_s2` cookie value
   - **SWID**: Your `SWID` cookie value (include the braces)
   - **Start Year**: First year of your league on ESPN
   - **Current Year**: 2024 (or current season)

3. Click **Save & Load Data**

## Your League Credentials

Based on your information:
- League ID: `533683`
- ESPN S2: `AEAKFObDwOm3E7GRJ0QBZKS1wSGiucZZsHVko5wP6kXyjLGixBLzgYhDiG0FhA49%2BQ5NvC5q46LrnlaE9EJx2pGsA3u8NxvcGx06nYcpWZPZxIw2BlYwE4ouA9aODzkDhV7cAGkf6zA0fvcBWE1zRWAYNQ%2F4Nve%2F0pwYOF%2FZFzdSWoB7vyJlmSkUGKc0qsfUinwTLGojGQTh6bsEdtIztGhpdwErCho2845NF4i6sIAPnwamaISOjI3pgtPFXm4j52r0WKoH4Vf2yVf45V1C4b8Y3ry0QOXB7AA%2B3yJHMwVoag%3D%3D`
- SWID: `{691768BD-FEF6-4631-96B6-657E9D470FD7}`

## How to Find Your Credentials

### League ID
1. Go to your ESPN Fantasy Football league page
2. Look at the URL: `fantasy.espn.com/football/league?leagueId=XXXXXX`
3. Copy the number after `leagueId=`

### ESPN S2 and SWID (Required for Private Leagues)
1. Log into ESPN Fantasy Football in your browser
2. Open Developer Tools (F12 or right-click → Inspect)
3. Go to **Application** tab → **Cookies** → `espn.com`
4. Find and copy the values for:
   - `espn_s2`
   - `SWID`

## Files

- `index.html` - Main webpage
- `styles.css` - Styling
- `espn-api.js` - ESPN Fantasy API integration
- `stats-engine.js` - Statistics aggregation engine
- `app.js` - UI rendering and interactions
- `server.js` - Proxy server for API requests

## Why is a server needed?

ESPN's API doesn't allow direct browser requests from other domains (CORS restriction). The included Node.js server acts as a proxy to handle the API calls and pass along your authentication cookies.

## Troubleshooting

### "Error loading data"
- Make sure the server is running (`node server.js`)
- Check that your credentials are correct
- Verify your league ID exists

### "CORS error"
- You must use the proxy server - open `http://localhost:3000`, not the HTML file directly

### Cookies expired
- ESPN cookies expire periodically
- Log back into ESPN and get fresh cookie values

## Data Caching

The site caches your league data in the browser's localStorage to avoid repeated API calls. Use the "Clear Cached Data" button in Settings to refresh from ESPN.
