const https = require('https');

const LEAGUE_ID = '533683';
const ESPN_S2 = 'AEAKFObDwOm3E7GRJ0QBZKS1wSGiucZZsHVko5wP6kXyjLGixBLzgYhDiG0FhA49%2BQ5NvC5q46LrnlaE9EJx2pGsA3u8NxvcGx06nYcpWZPZxIw2BlYwE4ouA9aODzkDhV7cAGkf6zA0fvcBWE1zRWAYNQ%2F4Nve%2F0pwYOF%2FZFzdSWoB7vyJlmSkUGKc0qsfUinwTLGojGQTh6bsEdtIztGhpdwErCho2845NF4i6sIAPnwamaISOjI3pgtPFXm4j52r0WKoH4Vf2yVf45V1C4b8Y3ry0QOXB7AA%2B3yJHMwVoag%3D%3D';
const SWID = '{691768BD-FEF6-4631-96B6-657E9D470FD7}';

const YEARS_TO_TEST = [2017, 2015, 2012, 2010, 2008];

function fetchYear(year) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'fantasy.espn.com',
            path: `/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}?seasonId=${year}&view=mTeam&view=mMatchup`,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cookie': `espn_s2=${ESPN_S2}; SWID=${SWID}`
            }
        };

        console.log(`\nTesting ${year}...`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (Array.isArray(json) && json.length > 0) {
                        const league = json[0];
                        console.log(`  ✅ ${year}: ${league.teams?.length || 0} teams, ${league.schedule?.length || 0} matchups`);
                        resolve({ year, success: true });
                    } else if (json.messages) {
                        console.log(`  ❌ ${year}: ${JSON.stringify(json.messages)}`);
                        resolve({ year, success: false });
                    } else {
                        console.log(`  ❌ ${year}: Empty or unknown response`);
                        resolve({ year, success: false });
                    }
                } catch (e) {
                    console.log(`  ❌ ${year}: Parse error - ${e.message}`);
                    resolve({ year, success: false });
                }
            });
        });
        req.on('error', (e) => {
            console.log(`  ❌ ${year}: ${e.message}`);
            resolve({ year, success: false });
        });
        req.end();
    });
}

async function run() {
    console.log('ESPN Legacy API Test\n');
    for (const year of YEARS_TO_TEST) {
        await fetchYear(year);
        await new Promise(r => setTimeout(r, 1000));
    }
}

run();
