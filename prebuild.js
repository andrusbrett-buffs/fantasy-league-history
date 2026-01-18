#!/usr/bin/env node
/**
 * Pre-build script to fetch all ESPN Fantasy Football data
 * and save it as static JSON files for instant loading.
 *
 * This runs during deployment (or via cron) so users don't
 * have to wait for API calls when visiting the site.
 *
 * Usage: node prebuild.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// League configuration (same as in app.js)
const CONFIG = {
    leagueId: '533683',
    espnS2: 'AEAKFObDwOm3E7GRJ0QBZKS1wSGiucZZsHVko5wP6kXyjLGixBLzgYhDiG0FhA49%2BQ5NvC5q46LrnlaE9EJx2pGsA3u8NxvcGx06nYcpWZPZxIw2BlYwE4ouA9aODzkDhV7cAGkf6zA0fvcBWE1zRWAYNQ%2F4Nve%2F0pwYOF%2FZFzdSWoB7vyJlmSkUGKc0qsfUinwTLGojGQTh6bsEdtIztGhpdwErCho2845NF4i6sIAPnwamaISOjI3pgtPFXm4j52r0WKoH4Vf2yVf45V1C4b8Y3ry0QOXB7AA%2B3yJHMwVoag%3D%3D',
    swid: '{691768BD-FEF6-4631-96B6-657E9D470FD7}',
    startYear: 2011,
    currentYear: 2026
};

// ESPN API base URLs
const BASE_URL_NEW = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const BASE_URL_OLD = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory';
const LEGACY_CUTOFF_YEAR = 2018;

// Output directory for static data
const DATA_DIR = path.join(__dirname, 'data');

/**
 * Make an HTTPS request with cookies
 */
function fetchWithCookies(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);

        const options = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': `espn_s2=${CONFIG.espnS2}; SWID=${CONFIG.swid}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON: ${e.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Build the URL for a specific year
 */
function buildUrl(year) {
    if (year < LEGACY_CUTOFF_YEAR) {
        // Legacy API for pre-2018 seasons
        return `${BASE_URL_OLD}/${CONFIG.leagueId}?seasonId=${year}&view=mTeam&view=mMatchup`;
    } else {
        // New API for 2018+ seasons
        return `${BASE_URL_NEW}/${year}/segments/0/leagues/${CONFIG.leagueId}?view=mTeam&view=mMatchup&view=mMatchupScore&view=mStandings&view=mSettings&view=mRoster&view=kona_player_info`;
    }
}

/**
 * Fetch data for a single season
 */
async function fetchSeasonData(year) {
    const url = buildUrl(year);
    const isLegacy = year < LEGACY_CUTOFF_YEAR;

    console.log(`  Fetching ${year} (${isLegacy ? 'legacy' : 'new'} API)...`);

    let data = await fetchWithCookies(url);

    // Legacy API returns an array, extract first element
    if (isLegacy && Array.isArray(data)) {
        data = data[0] || {};
    }

    return data;
}

/**
 * Delay helper
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main build function
 */
async function build() {
    console.log('========================================');
    console.log('  Fantasy Football Data Pre-Builder');
    console.log('========================================');
    console.log(`League ID: ${CONFIG.leagueId}`);
    console.log(`Years: ${CONFIG.startYear} - ${CONFIG.currentYear}`);
    console.log('');

    // Create data directory if it doesn't exist
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`Created data directory: ${DATA_DIR}`);
    }

    const allData = {};
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    // Fetch each season
    for (let year = CONFIG.startYear; year <= CONFIG.currentYear; year++) {
        try {
            allData[year] = await fetchSeasonData(year);
            successCount++;

            const teams = allData[year].teams?.length || 0;
            const matchups = allData[year].schedule?.length || 0;
            console.log(`    ✓ ${year}: ${teams} teams, ${matchups} matchups`);

            // Rate limiting - be nice to ESPN's servers
            await delay(500);
        } catch (error) {
            console.error(`    ✗ ${year}: ${error.message}`);
            allData[year] = { error: error.message };
            errorCount++;
        }
    }

    // Save the combined data
    const outputPath = path.join(DATA_DIR, 'league-data.json');
    const outputData = {
        meta: {
            leagueId: CONFIG.leagueId,
            generatedAt: new Date().toISOString(),
            startYear: CONFIG.startYear,
            endYear: CONFIG.currentYear,
            successCount,
            errorCount
        },
        seasons: allData
    };

    fs.writeFileSync(outputPath, JSON.stringify(outputData));

    const fileSizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('========================================');
    console.log('  Build Complete!');
    console.log('========================================');
    console.log(`✓ Seasons fetched: ${successCount}`);
    if (errorCount > 0) {
        console.log(`✗ Seasons failed: ${errorCount}`);
    }
    console.log(`Output: ${outputPath}`);
    console.log(`File size: ${fileSizeKB} KB`);
    console.log(`Time elapsed: ${elapsed}s`);
    console.log('');
}

// Run the build
build().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
});
