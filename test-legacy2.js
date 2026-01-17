const https = require('https');

const LEAGUE_ID = '533683';
const ESPN_S2 = 'AEAKFObDwOm3E7GRJ0QBZKS1wSGiucZZsHVko5wP6kXyjLGixBLzgYhDiG0FhA49%2BQ5NvC5q46LrnlaE9EJx2pGsA3u8NxvcGx06nYcpWZPZxIw2BlYwE4ouA9aODzkDhV7cAGkf6zA0fvcBWE1zRWAYNQ%2F4Nve%2F0pwYOF%2FZFzdSWoB7vyJlmSkUGKc0qsfUinwTLGojGQTh6bsEdtIztGhpdwErCho2845NF4i6sIAPnwamaISOjI3pgtPFXm4j52r0WKoH4Vf2yVf45V1C4b8Y3ry0QOXB7AA%2B3yJHMwVoag%3D%3D';
const SWID = '{691768BD-FEF6-4631-96B6-657E9D470FD7}';

const YEARS_TO_TEST = [2017, 2015, 2012];

// Try different URL patterns
const URL_PATTERNS = [
    (year) => `/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}?seasonId=${year}`,
    (year) => `/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${LEAGUE_ID}?view=mTeam&view=mMatchup`,
];

function fetchUrl(year, pattern, patternName) {
    return new Promise((resolve) => {
        const path = pattern(year);
        const options = {
            hostname: 'lm-api-reads.fantasy.espn.com',
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cookie': `espn_s2=${ESPN_S2}; SWID=${SWID}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.teams) {
                        console.log(`  ✅ Pattern ${patternName}: ${json.teams.length} teams`);
                        resolve({ success: true, teams: json.teams.length });
                    } else if (Array.isArray(json) && json[0]?.teams) {
                        console.log(`  ✅ Pattern ${patternName}: ${json[0].teams.length} teams`);
                        resolve({ success: true, teams: json[0].teams.length });
                    } else if (json.messages) {
                        console.log(`  ❌ Pattern ${patternName}: ${JSON.stringify(json.messages)}`);
                        resolve({ success: false });
                    } else {
                        console.log(`  ❌ Pattern ${patternName}: No teams found. Keys: ${Object.keys(json).slice(0,5)}`);
                        resolve({ success: false });
                    }
                } catch (e) {
                    console.log(`  ❌ Pattern ${patternName}: ${data.substring(0,50)}...`);
                    resolve({ success: false });
                }
            });
        });
        req.on('error', (e) => {
            console.log(`  ❌ Pattern ${patternName}: ${e.message}`);
            resolve({ success: false });
        });
        req.end();
    });
}

async function run() {
    console.log('Testing different ESPN API URL patterns\n');
    
    for (const year of YEARS_TO_TEST) {
        console.log(`\n${year}:`);
        for (let i = 0; i < URL_PATTERNS.length; i++) {
            await fetchUrl(year, URL_PATTERNS[i], i + 1);
        }
        await new Promise(r => setTimeout(r, 500));
    }
}

run();
