#!/usr/bin/env node
/**
 * Report Generator for Advanced Fantasy Football Analytics
 *
 * Loads league data, runs the AdvancedAnalytics module, and generates
 * a styled HTML report with visualizations.
 *
 * Usage: node reports/generate-report.js
 * Output: reports/advanced-analytics-report.html
 */

const fs = require('fs');
const path = require('path');
const AdvancedAnalytics = require('./advanced-analytics.js');

// Load league data
const dataPath = path.join(__dirname, '..', 'data', 'league-data.json');
console.log('Loading league data from:', dataPath);

const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
console.log(`Loaded data: ${rawData.meta.successCount} seasons, generated ${rawData.meta.generatedAt}`);

// Run analytics
const analytics = new AdvancedAnalytics(rawData);
const report = analytics.generateFullReport(5, 30); // close game ≤5 pts, blowout >30 pts

console.log(`\nAnalysis complete:`);
console.log(`  - Owners tracked: ${report.meta.ownersTracked}`);
console.log(`  - Matchups analyzed: ${report.meta.totalMatchups}`);
console.log(`  - Seasons: ${report.meta.seasonsAnalyzed}`);

// Generate HTML Report
const html = generateHTML(report, rawData.meta);

// Write output
const outputPath = path.join(__dirname, 'advanced-analytics-report.html');
fs.writeFileSync(outputPath, html);
console.log(`\n✓ Report generated: ${outputPath}`);

/**
 * Generate the HTML report
 */
function generateHTML(report, dataMeta) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fadunkadunk Fantasy League - Advanced Analytics Report</title>
    <style>
        :root {
            --primary: #002244;
            --secondary: #69BE28;
            --accent: #A5ACAF;
            --bg-dark: #0a1628;
            --bg-card: #1a2a44;
            --text-primary: #ffffff;
            --text-secondary: #a0aec0;
            --positive: #48bb78;
            --negative: #fc8181;
            --warning: #f6e05e;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: var(--bg-dark);
            color: var(--text-primary);
            line-height: 1.6;
            min-height: 100vh;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        header {
            background: linear-gradient(135deg, var(--primary), var(--bg-card));
            padding: 40px 20px;
            text-align: center;
            border-bottom: 4px solid var(--secondary);
            margin-bottom: 30px;
        }

        header h1 {
            font-size: 2.5rem;
            color: var(--secondary);
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 3px;
        }

        header .subtitle {
            color: var(--text-secondary);
            font-size: 1.1rem;
        }

        .meta-info {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            flex-wrap: wrap;
        }

        .meta-stat {
            background: rgba(105, 190, 40, 0.1);
            border: 1px solid var(--secondary);
            padding: 10px 20px;
            border-radius: 8px;
        }

        .meta-stat .value {
            font-size: 1.5rem;
            font-weight: bold;
            color: var(--secondary);
        }

        .meta-stat .label {
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        section {
            background: var(--bg-card);
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        section h2 {
            color: var(--secondary);
            font-size: 1.8rem;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        section h2 .icon {
            font-size: 1.5rem;
        }

        section .description {
            color: var(--text-secondary);
            margin-bottom: 20px;
            font-size: 0.95rem;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }

        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        th {
            background: rgba(0, 34, 68, 0.5);
            color: var(--secondary);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.8rem;
            letter-spacing: 1px;
        }

        th.sortable {
            cursor: pointer;
            user-select: none;
            position: relative;
            padding-right: 20px;
        }

        th.sortable:hover {
            background: rgba(105, 190, 40, 0.2);
        }

        th.sortable::after {
            content: '⇅';
            position: absolute;
            right: 5px;
            opacity: 0.4;
            font-size: 0.7rem;
        }

        th.sortable.asc::after {
            content: '↑';
            opacity: 1;
        }

        th.sortable.desc::after {
            content: '↓';
            opacity: 1;
        }

        tr:hover {
            background: rgba(105, 190, 40, 0.05);
        }

        .rank {
            font-weight: bold;
            color: var(--accent);
            width: 40px;
        }

        .team-name {
            font-weight: 600;
            color: var(--text-primary);
        }

        .positive {
            color: var(--positive);
        }

        .negative {
            color: var(--negative);
        }

        .neutral {
            color: var(--warning);
        }

        .highlight-row {
            background: rgba(105, 190, 40, 0.1);
        }

        .bar-container {
            width: 100%;
            height: 20px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            overflow: hidden;
        }

        .bar {
            height: 100%;
            border-radius: 10px;
            transition: width 0.3s ease;
        }

        .bar-positive {
            background: linear-gradient(90deg, var(--positive), #68d391);
        }

        .bar-negative {
            background: linear-gradient(90deg, var(--negative), #feb2b2);
        }

        .highlight-box {
            background: linear-gradient(135deg, var(--primary), var(--bg-card));
            border: 2px solid var(--secondary);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .highlight-box h3 {
            color: var(--secondary);
            margin-bottom: 15px;
            font-size: 1.2rem;
        }

        .highlight-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }

        .highlight-card {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }

        .highlight-card .label {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-bottom: 5px;
        }

        .highlight-card .value {
            font-size: 1.4rem;
            font-weight: bold;
        }

        .highlight-card .team {
            font-size: 1.1rem;
            color: var(--secondary);
            margin-top: 5px;
        }

        .season-carousel {
            display: flex;
            gap: 15px;
            overflow-x: auto;
            padding: 10px 0;
            scrollbar-width: thin;
            scrollbar-color: var(--secondary) var(--bg-dark);
        }

        .season-card {
            flex-shrink: 0;
            width: 280px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            padding: 15px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .season-card h4 {
            color: var(--secondary);
            font-size: 1.3rem;
            margin-bottom: 10px;
        }

        .season-card .luck-pair {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }

        .luck-pair .label {
            font-size: 0.8rem;
            color: var(--text-secondary);
        }

        .luck-pair .team {
            font-size: 0.9rem;
        }

        .luck-pair .score {
            font-weight: bold;
            font-size: 0.9rem;
        }

        footer {
            text-align: center;
            padding: 30px;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        .methodology {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            padding: 15px;
            margin-top: 20px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .methodology h4 {
            color: var(--accent);
            margin-bottom: 10px;
        }

        @media (max-width: 768px) {
            header h1 {
                font-size: 1.8rem;
            }

            .meta-info {
                flex-direction: column;
                align-items: center;
            }

            th, td {
                padding: 8px 10px;
                font-size: 0.85rem;
            }

            .highlight-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <header>
        <h1>⚡ Fadunkadunk League Analytics</h1>
        <p class="subtitle">Advanced Performance Metrics & Luck Analysis</p>
        <div class="meta-info">
            <div class="meta-stat">
                <div class="value">${report.meta.seasonsAnalyzed}</div>
                <div class="label">Seasons Analyzed</div>
            </div>
            <div class="meta-stat">
                <div class="value">${report.meta.totalMatchups}</div>
                <div class="label">Total Matchups</div>
            </div>
            <div class="meta-stat">
                <div class="value">${report.meta.ownersTracked}</div>
                <div class="label">Owners Tracked</div>
            </div>
            <div class="meta-stat">
                <div class="value">${dataMeta.startYear}-${dataMeta.endYear}</div>
                <div class="label">Years Covered</div>
            </div>
        </div>
    </header>

    <div class="container">
        <!-- LUCK ANALYSIS SECTION -->
        <section id="luck">
            <h2><span class="icon">🎲</span> Luck Analysis</h2>
            <p class="description">
                Luck is measured using the "All-Play" method: how many wins would you have each week if you played ALL teams?
                Expected wins are calculated from this, and compared against actual wins. Positive = lucky, Negative = unlucky.
            </p>

            <div class="highlight-box">
                <h3>🏆 All-Time Luck Extremes</h3>
                <div class="highlight-grid">
                    <div class="highlight-card">
                        <div class="label">Most Unlucky (All-Time)</div>
                        <div class="value negative">${report.luck.allTime[0].luckScore.toFixed(1)} wins</div>
                        <div class="team">${report.luck.allTime[0].displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Most Lucky (All-Time)</div>
                        <div class="value positive">+${report.luck.allTime[report.luck.allTime.length - 1].luckScore.toFixed(1)} wins</div>
                        <div class="team">${report.luck.allTime[report.luck.allTime.length - 1].displayName}</div>
                    </div>
                </div>
            </div>

            <h3 style="color: var(--text-primary); margin: 20px 0 10px;">Season-by-Season Luck</h3>
            <div class="season-carousel">
                ${report.luck.bySeasonSummary.map(season => `
                    <div class="season-card">
                        <h4>${season.year}</h4>
                        <div class="luck-pair">
                            <div>
                                <div class="label">Luckiest</div>
                                <div class="team positive">${season.luckiest.displayName}</div>
                            </div>
                            <div class="score positive">+${season.luckiest.luckScore.toFixed(1)}</div>
                        </div>
                        <div class="luck-pair">
                            <div>
                                <div class="label">Unluckiest</div>
                                <div class="team negative">${season.unluckiest.displayName}</div>
                            </div>
                            <div class="score negative">${season.unluckiest.luckScore.toFixed(1)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <h3 style="color: var(--text-primary); margin: 25px 0 15px;">All-Time Luck Rankings</h3>
            <table>
                <thead>
                    <tr>
                        <th class="rank">#</th>
                        <th>Team</th>
                        <th>Actual Wins</th>
                        <th>Expected Wins</th>
                        <th>Luck Score</th>
                        <th>All-Play Record</th>
                        <th>Seasons</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.luck.allTime.map((team, i) => `
                        <tr class="${i === 0 || i === report.luck.allTime.length - 1 ? 'highlight-row' : ''}">
                            <td class="rank">${i + 1}</td>
                            <td class="team-name">${team.displayName}</td>
                            <td>${team.actualWins}</td>
                            <td>${team.expectedWins.toFixed(1)}</td>
                            <td class="${team.luckScore >= 0 ? 'positive' : 'negative'}">
                                ${team.luckScore >= 0 ? '+' : ''}${team.luckScore.toFixed(1)}
                            </td>
                            <td>${team.allPlayRecord} (${team.allPlayWinPct}%)</td>
                            <td>${team.seasonsPlayed}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="methodology">
                <h4>📊 Methodology</h4>
                <p>Each week, your "expected wins" are calculated by comparing your score against all other teams.
                If you scored higher than 8 of 11 opponents, your expected wins for that week = 8/11 = 0.73.
                Sum these across all weeks and seasons, then compare to your actual win total.
                The difference is your "luck score" — positive means you won more games than your scoring deserved.</p>
            </div>
        </section>

        <!-- CONSISTENCY SECTION -->
        <section id="consistency">
            <h2><span class="icon">📊</span> Consistency Metrics</h2>
            <p class="description">
                Who's the most predictable scorer? Lower Coefficient of Variation (CV) means more consistent week-to-week performance.
                "Boom" games are 20%+ above your average; "Bust" games are 20%+ below.
            </p>

            <div class="highlight-box">
                <h3>🎯 Consistency Extremes</h3>
                <div class="highlight-grid">
                    <div class="highlight-card">
                        <div class="label">Most Consistent (Lowest CV)</div>
                        <div class="value positive">${report.consistency[0].coefficientOfVariation}%</div>
                        <div class="team">${report.consistency[0].displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Most Volatile (Highest CV)</div>
                        <div class="value negative">${report.consistency[report.consistency.length - 1].coefficientOfVariation}%</div>
                        <div class="team">${report.consistency[report.consistency.length - 1].displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Highest Single-Game Score</div>
                        <div class="value neutral">${report.highestSingleGame.score.toFixed(1)}</div>
                        <div class="team">${report.highestSingleGame.displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Highest Boom Rate</div>
                        <div class="value positive">${[...report.consistency].sort((a, b) => b.boomRate - a.boomRate)[0].boomRate}%</div>
                        <div class="team">${[...report.consistency].sort((a, b) => b.boomRate - a.boomRate)[0].displayName}</div>
                    </div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th class="rank">#</th>
                        <th>Team</th>
                        <th>Avg Score</th>
                        <th>Std Dev</th>
                        <th>CV %</th>
                        <th>Floor</th>
                        <th>Ceiling</th>
                        <th>Boom %</th>
                        <th>Bust %</th>
                        <th>Games</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.consistency.map((team, i) => `
                        <tr>
                            <td class="rank">${i + 1}</td>
                            <td class="team-name">${team.displayName}</td>
                            <td>${team.avgScore.toFixed(1)}</td>
                            <td>${team.stdDev.toFixed(1)}</td>
                            <td class="${team.coefficientOfVariation < 15 ? 'positive' : team.coefficientOfVariation > 20 ? 'negative' : ''}">${team.coefficientOfVariation}%</td>
                            <td>${team.floor.toFixed(1)}</td>
                            <td>${team.ceiling.toFixed(1)}</td>
                            <td class="positive">${team.boomRate}%</td>
                            <td class="negative">${team.bustRate}%</td>
                            <td>${team.gamesPlayed}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="methodology">
                <h4>📊 Methodology</h4>
                <p><strong>Coefficient of Variation (CV)</strong> = Standard Deviation ÷ Average × 100.
                A lower CV means your scores cluster tightly around your average — you're predictable.
                <strong>Floor</strong> = 10th percentile score, <strong>Ceiling</strong> = 90th percentile.
                <strong>Boom</strong> = scoring 120%+ of your average; <strong>Bust</strong> = scoring below 80%.</p>
            </div>
        </section>

        <!-- CLUTCH PERFORMANCE SECTION -->
        <section id="clutch">
            <h2><span class="icon">🎯</span> Close Game Performance</h2>
            <p class="description">
                How do teams perform when it matters most? "Close games" are decided by ${report.meta.closeThreshold} points or fewer.
                Clutch Factor = Close game win % minus overall win %. Positive = better in close games.
            </p>

            <div class="highlight-box">
                <h3>💪 Clutch Leaders</h3>
                <div class="highlight-grid">
                    <div class="highlight-card">
                        <div class="label">Most Clutch</div>
                        <div class="value positive">+${report.clutch[0].clutchFactor}%</div>
                        <div class="team">${report.clutch[0].displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Least Clutch</div>
                        <div class="value negative">${report.clutch[report.clutch.length - 1].clutchFactor}%</div>
                        <div class="team">${report.clutch[report.clutch.length - 1].displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Most Close Games</div>
                        <div class="value neutral">${[...report.clutch].sort((a, b) => b.totalCloseGames - a.totalCloseGames)[0].totalCloseGames}</div>
                        <div class="team">${[...report.clutch].sort((a, b) => b.totalCloseGames - a.totalCloseGames)[0].displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Best Close Win %</div>
                        <div class="value positive">${[...report.clutch].sort((a, b) => b.closeGameWinPct - a.closeGameWinPct)[0].closeGameWinPct}%</div>
                        <div class="team">${[...report.clutch].sort((a, b) => b.closeGameWinPct - a.closeGameWinPct)[0].displayName}</div>
                    </div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th class="rank">#</th>
                        <th>Team</th>
                        <th>Close Wins</th>
                        <th>Close Losses</th>
                        <th>Close Win %</th>
                        <th>Overall Win %</th>
                        <th>Clutch Factor</th>
                        <th>Blowout W-L</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.clutch.map((team, i) => `
                        <tr class="${i === 0 ? 'highlight-row' : ''}">
                            <td class="rank">${i + 1}</td>
                            <td class="team-name">${team.displayName}</td>
                            <td>${team.closeWins}</td>
                            <td>${team.closeLosses}</td>
                            <td>${team.closeGameWinPct}%</td>
                            <td>${team.overallWinPct}%</td>
                            <td class="${team.clutchFactor >= 0 ? 'positive' : 'negative'}">
                                ${team.clutchFactor >= 0 ? '+' : ''}${team.clutchFactor}%
                            </td>
                            <td>${team.blowoutWins}-${team.blowoutLosses}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="methodology">
                <h4>📊 Methodology</h4>
                <p><strong>Close Game</strong> = margin of ${report.meta.closeThreshold} points or less.
                <strong>Clutch Factor</strong> = Your win % in close games minus your overall win %.
                A positive clutch factor means you perform better under pressure than your overall record suggests.
                <strong>Blowouts</strong> are games decided by more than ${report.meta.blowoutThreshold} points.</p>
            </div>
        </section>

        <!-- STRENGTH OF SCHEDULE SECTION -->
        <section id="sos">
            <h2><span class="icon">📅</span> Strength of Schedule</h2>
            <p class="description">
                Who faced the toughest competition? SOS Index compares average opponent score to league average.
                100 = average schedule, higher = tougher opponents, lower = easier path.
            </p>

            <div class="highlight-box">
                <h3>⚔️ Schedule Difficulty</h3>
                <div class="highlight-grid">
                    <div class="highlight-card">
                        <div class="label">Hardest Schedule</div>
                        <div class="value negative">${report.strengthOfSchedule[0].sosIndex}</div>
                        <div class="team">${report.strengthOfSchedule[0].displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Easiest Schedule</div>
                        <div class="value positive">${report.strengthOfSchedule[report.strengthOfSchedule.length - 1].sosIndex}</div>
                        <div class="team">${report.strengthOfSchedule[report.strengthOfSchedule.length - 1].displayName}</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">League Avg Score</div>
                        <div class="value neutral">${report.strengthOfSchedule[0].leagueAvgScore.toFixed(1)}</div>
                        <div class="team">Per Game</div>
                    </div>
                    <div class="highlight-card">
                        <div class="label">Best Adjusted Win %</div>
                        <div class="value positive">${[...report.strengthOfSchedule].sort((a, b) => b.adjustedWinPct - a.adjustedWinPct)[0].adjustedWinPct}%</div>
                        <div class="team">${[...report.strengthOfSchedule].sort((a, b) => b.adjustedWinPct - a.adjustedWinPct)[0].displayName}</div>
                    </div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th class="rank">#</th>
                        <th>Team</th>
                        <th>SOS Index</th>
                        <th>Avg Opp Score</th>
                        <th>Avg Opp Win %</th>
                        <th>Team Win %</th>
                        <th>Adjusted Win %</th>
                        <th>Games</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.strengthOfSchedule.map((team, i) => `
                        <tr class="${i === 0 || i === report.strengthOfSchedule.length - 1 ? 'highlight-row' : ''}">
                            <td class="rank">${i + 1}</td>
                            <td class="team-name">${team.displayName}</td>
                            <td class="${team.sosIndex > 100 ? 'negative' : 'positive'}">${team.sosIndex}</td>
                            <td>${team.avgOpponentScore.toFixed(1)}</td>
                            <td>${team.avgOpponentWinPct}%</td>
                            <td>${team.teamWinPct}%</td>
                            <td class="${team.adjustedWinPct > team.teamWinPct ? 'positive' : ''}">${team.adjustedWinPct}%</td>
                            <td>${team.gamesPlayed}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="methodology">
                <h4>📊 Methodology</h4>
                <p><strong>SOS Index</strong> = (Average Opponent Score ÷ League Average Score) × 100.
                Values above 100 mean you faced tougher-than-average opponents.
                <strong>Adjusted Win %</strong> adds a bonus/penalty based on schedule difficulty:
                Adjusted = Actual Win % + (SOS Index - 100) × 0.5. This rewards teams who succeeded against tough competition.</p>
            </div>
        </section>
    </div>

    <footer>
        <p>Generated ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        <p>Data source: ESPN Fantasy Football API | League: Fadunkadunk (ID: ${dataMeta.leagueId})</p>
        <p style="margin-top: 10px; color: var(--secondary);">⚡ Powered by Advanced Analytics Engine</p>
    </footer>

    <script>
        // Sortable tables functionality
        document.addEventListener('DOMContentLoaded', function() {
            const tables = document.querySelectorAll('table');

            tables.forEach(table => {
                const headers = table.querySelectorAll('th');
                const tbody = table.querySelector('tbody');
                if (!tbody) return;

                headers.forEach((header, columnIndex) => {
                    // Make all columns except rank sortable
                    if (!header.classList.contains('rank')) {
                        header.classList.add('sortable');
                        header.addEventListener('click', () => sortTable(table, columnIndex, header));
                    }
                });
            });
        });

        function sortTable(table, columnIndex, clickedHeader) {
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const headers = table.querySelectorAll('th');

            // Determine sort direction
            const isAsc = clickedHeader.classList.contains('asc');
            const isDesc = clickedHeader.classList.contains('desc');

            // Remove sort classes from all headers
            headers.forEach(h => {
                h.classList.remove('asc', 'desc');
            });

            // Set new sort direction
            let direction;
            if (!isAsc && !isDesc) {
                direction = 'desc'; // Default to descending first
            } else if (isDesc) {
                direction = 'asc';
            } else {
                direction = 'desc';
            }
            clickedHeader.classList.add(direction);

            // Sort rows
            rows.sort((a, b) => {
                const aCell = a.cells[columnIndex];
                const bCell = b.cells[columnIndex];

                let aValue = aCell.textContent.trim();
                let bValue = bCell.textContent.trim();

                // Parse numeric values (handle percentages, +/- signs, records like "100-50")
                const aNum = parseValue(aValue);
                const bNum = parseValue(bValue);

                let comparison;
                if (aNum !== null && bNum !== null) {
                    comparison = aNum - bNum;
                } else {
                    comparison = aValue.localeCompare(bValue);
                }

                return direction === 'asc' ? comparison : -comparison;
            });

            // Re-append sorted rows and update rank numbers
            rows.forEach((row, index) => {
                tbody.appendChild(row);
                // Update rank column if it exists
                const rankCell = row.querySelector('.rank');
                if (rankCell) {
                    rankCell.textContent = index + 1;
                }
                // Remove highlight class (re-highlight based on new order if needed)
                row.classList.remove('highlight-row');
            });
        }

        function parseValue(value) {
            // Remove common non-numeric characters
            let cleaned = value.replace(/[+%$,]/g, '').trim();

            // Handle records like "100-50 (50.5%)" - take the percentage
            const pctMatch = value.match(/\\(([\\d.]+)%\\)/);
            if (pctMatch) {
                return parseFloat(pctMatch[1]);
            }

            // Handle W-L records like "10-5" - calculate win percentage
            const recordMatch = cleaned.match(/^(\\d+)-(\\d+)$/);
            if (recordMatch) {
                const wins = parseInt(recordMatch[1]);
                const losses = parseInt(recordMatch[2]);
                return wins / (wins + losses) || 0;
            }

            // Try parsing as float
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        }
    </script>
</body>
</html>`;
}
