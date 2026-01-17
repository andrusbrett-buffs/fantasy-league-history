/**
 * Fantasy Football League History - Main Application
 * Handles UI rendering and user interactions
 */

class FantasyApp {
    constructor() {
        this.currentSection = 'dashboard';
        this.isLoading = false;
        this.dataLoaded = false;

        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.setupNavigation();
        this.setupSettingsForm();
        this.setupH2HControls();
        this.setupSeasonSelector();

        // Auto-load data on page load
        this.autoLoadData();
    }

    /**
     * Automatically load data - checks cache freshness and loads if needed
     */
    async autoLoadData() {
        const lastFetch = localStorage.getItem('espn_last_fetch');
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const cacheValid = lastFetch && parseInt(lastFetch) > oneDayAgo;

        // Try to load from cache first
        if (cacheValid && statsEngine.loadFromStorage()) {
            this.dataLoaded = true;
            this.renderAllSections();
            this.showSection('dashboard');
            document.querySelector('[data-section="dashboard"]').classList.add('active');
            this.updateDataStatus('Data loaded from cache (refreshes daily)');
        } else {
            // Fetch fresh data
            await this.loadLeagueData();
        }
    }

    /**
     * Setup navigation click handlers
     */
    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.showSection(section);

                // Update active state
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    /**
     * Show a specific section
     */
    showSection(sectionId) {
        const sections = document.querySelectorAll('.section');
        sections.forEach(s => s.classList.remove('active'));

        const target = document.getElementById(sectionId);
        if (target) {
            target.classList.add('active');
            this.currentSection = sectionId;
        }
    }

    /**
     * Setup the settings form
     */
    setupSettingsForm() {
        const form = document.getElementById('league-config-form');
        const clearBtn = document.getElementById('clear-cache');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.loadLeagueData();
        });

        clearBtn.addEventListener('click', () => {
            statsEngine.clearStorage();
            espnAPI.clearCache();
            localStorage.removeItem('espn_league_config');
            this.dataLoaded = false;
            this.updateDataStatus('Cache cleared. Configure your league to reload data.');
            location.reload();
        });

        // Hardcoded league configuration
        const defaultConfig = {
            leagueId: '533683',
            espnS2: 'AEAKFObDwOm3E7GRJ0QBZKS1wSGiucZZsHVko5wP6kXyjLGixBLzgYhDiG0FhA49%2BQ5NvC5q46LrnlaE9EJx2pGsA3u8NxvcGx06nYcpWZPZxIw2BlYwE4ouA9aODzkDhV7cAGkf6zA0fvcBWE1zRWAYNQ%2F4Nve%2F0pwYOF%2FZFzdSWoB7vyJlmSkUGKc0qsfUinwTLGojGQTh6bsEdtIztGhpdwErCho2845NF4i6sIAPnwamaISOjI3pgtPFXm4j52r0WKoH4Vf2yVf45V1C4b8Y3ry0QOXB7AA%2B3yJHMwVoag%3D%3D',
            swid: '{691768BD-FEF6-4631-96B6-657E9D470FD7}',
            startYear: 2011,
            currentYear: 2024
        };

        // Pre-fill with hardcoded values (or saved values if they exist)
        const saved = localStorage.getItem('espn_league_config');
        if (saved) {
            const config = JSON.parse(saved);
            document.getElementById('league-id').value = config.leagueId || defaultConfig.leagueId;
            document.getElementById('espn-s2').value = config.espnS2 || defaultConfig.espnS2;
            document.getElementById('swid').value = config.swid || defaultConfig.swid;
        } else {
            document.getElementById('league-id').value = defaultConfig.leagueId;
            document.getElementById('espn-s2').value = defaultConfig.espnS2;
            document.getElementById('swid').value = defaultConfig.swid;
        }

        const savedYears = localStorage.getItem('espn_league_years');
        if (savedYears) {
            const years = JSON.parse(savedYears);
            document.getElementById('start-year').value = years.startYear || defaultConfig.startYear;
            document.getElementById('current-year').value = years.currentYear || defaultConfig.currentYear;
        } else {
            document.getElementById('start-year').value = defaultConfig.startYear;
            document.getElementById('current-year').value = defaultConfig.currentYear;
        }
    }

    /**
     * Load league data from ESPN API
     */
    async loadLeagueData() {
        // Hardcoded league configuration
        const config = {
            leagueId: '533683',
            espnS2: 'AEAKFObDwOm3E7GRJ0QBZKS1wSGiucZZsHVko5wP6kXyjLGixBLzgYhDiG0FhA49%2BQ5NvC5q46LrnlaE9EJx2pGsA3u8NxvcGx06nYcpWZPZxIw2BlYwE4ouA9aODzkDhV7cAGkf6zA0fvcBWE1zRWAYNQ%2F4Nve%2F0pwYOF%2FZFzdSWoB7vyJlmSkUGKc0qsfUinwTLGojGQTh6bsEdtIztGhpdwErCho2845NF4i6sIAPnwamaISOjI3pgtPFXm4j52r0WKoH4Vf2yVf45V1C4b8Y3ry0QOXB7AA%2B3yJHMwVoag%3D%3D',
            swid: '{691768BD-FEF6-4631-96B6-657E9D470FD7}',
            startYear: 2011,
            currentYear: 2024
        };

        const leagueId = config.leagueId;
        const espnS2 = config.espnS2;
        const swid = config.swid;
        const startYear = config.startYear;
        const currentYear = config.currentYear;

        // Configure API
        espnAPI.configure(leagueId, espnS2, swid);

        // Show loading UI
        this.showLoadingProgress(true);
        this.isLoading = true;

        try {
            const rawData = await espnAPI.getMultiSeasonData(
                startYear,
                currentYear,
                (progress) => this.updateLoadingProgress(progress)
            );

            // Log raw data for debugging
            console.log('Raw data loaded:', rawData);

            // Check for errors in individual seasons
            const successfulYears = [];
            const failedYears = [];
            for (const [year, data] of Object.entries(rawData)) {
                if (data.error) {
                    failedYears.push({ year, error: data.error });
                    console.warn(`Year ${year} failed:`, data.error);
                } else {
                    successfulYears.push(year);
                    console.log(`Year ${year} loaded: ${data.teams?.length || 0} teams, ${data.schedule?.length || 0} matchups`);
                }
            }

            // Process the data
            await statsEngine.loadAllSeasons(rawData);
            statsEngine.saveToStorage();

            // Save fetch timestamp for daily refresh check
            localStorage.setItem('espn_last_fetch', Date.now().toString());

            this.dataLoaded = true;
            this.renderAllSections();

            // Show detailed status
            let statusMsg = `Successfully loaded ${successfulYears.length} seasons of data`;
            if (failedYears.length > 0) {
                statusMsg += `. Failed years: ${failedYears.map(f => f.year).join(', ')}`;
            }
            this.updateDataStatus(statusMsg);

            // Show dashboard
            this.showSection('dashboard');
            document.querySelector('[data-section="dashboard"]').classList.add('active');

        } catch (error) {
            console.error('Error loading league data:', error);
            this.updateDataStatus(`Error: ${error.message}. Check your credentials and try again.`);
        } finally {
            this.isLoading = false;
            this.showLoadingProgress(false);
        }
    }

    /**
     * Show/hide loading progress
     */
    showLoadingProgress(show) {
        const progress = document.getElementById('loading-progress');
        if (show) {
            progress.classList.remove('hidden');
        } else {
            progress.classList.add('hidden');
        }
    }

    /**
     * Update loading progress display
     */
    updateLoadingProgress(progress) {
        const fill = document.getElementById('progress-fill');
        const text = document.getElementById('progress-text');

        fill.style.width = `${progress.percentage}%`;
        text.textContent = `Loading ${progress.year}... (${progress.completed}/${progress.total})`;
    }

    /**
     * Update data status display
     */
    updateDataStatus(message) {
        const status = document.getElementById('data-status');
        status.innerHTML = `<p>${message}</p>`;

        if (this.dataLoaded) {
            const seasons = statsEngine.getAllSeasons();
            const teams = statsEngine.getAllTeams();
            status.innerHTML += `
                <p><strong>Seasons loaded:</strong> ${seasons.length} (${Math.min(...seasons)} - ${Math.max(...seasons)})</p>
                <p><strong>Teams tracked:</strong> ${teams.length}</p>
            `;
        }
    }

    /**
     * Render all sections with data
     */
    renderAllSections() {
        if (!this.dataLoaded) return;

        this.renderDashboard();
        this.renderRecords();
        this.populateTeamSelects();
        this.renderH2HMatrix();
        this.populateSeasonSelect();
    }

    /**
     * Render dashboard section
     */
    renderDashboard() {
        const stats = statsEngine.aggregatedStats;
        if (!stats) return;

        // Champions list
        const championsEl = document.getElementById('champions-list');
        championsEl.innerHTML = stats.champions
            .slice().reverse()
            .map(c => `
                <div class="champion-item">
                    <span class="year">${c.year}</span>
                    <span class="team-name">🏆 ${c.teamName}</span>
                </div>
            `).join('');

        // Quick stats
        const quickStats = document.getElementById('quick-stats');
        const totalGames = stats.allMatchups.length;
        const totalSeasons = stats.seasonSummaries.length;
        const avgScore = stats.highScores.reduce((sum, s) => sum + s.score, 0) / stats.highScores.length;

        quickStats.innerHTML = `
            <div class="stat-item">
                <span class="stat-value">${totalSeasons}</span>
                <span class="stat-label">Seasons</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${totalGames}</span>
                <span class="stat-label">Total Matchups</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${avgScore.toFixed(1)}</span>
                <span class="stat-label">Avg Score</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${statsEngine.getAllTeams().length}</span>
                <span class="stat-label">Teams</span>
            </div>
        `;

        // Current standings (most recent season)
        const currentSeason = stats.seasonSummaries[stats.seasonSummaries.length - 1];
        if (currentSeason) {
            const standingsEl = document.getElementById('current-standings');
            standingsEl.innerHTML = `
                <table class="standings-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Team</th>
                            <th>W</th>
                            <th>L</th>
                            <th>PF</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${currentSeason.standings.slice(0, 10).map((team, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${team.name}</td>
                                <td>${team.record.wins}</td>
                                <td>${team.record.losses}</td>
                                <td>${team.record.pointsFor.toFixed(1)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        // Recent matchups
        const recentMatchups = stats.allMatchups.slice(-6).reverse();
        const matchupsEl = document.getElementById('current-matchups');
        matchupsEl.innerHTML = recentMatchups.map(m => `
            <div class="matchup-item">
                <span class="team ${m.homeScore > m.awayScore ? 'winner' : ''}">${m.homeTeamName}</span>
                <span class="score">${m.homeScore.toFixed(1)} - ${m.awayScore.toFixed(1)}</span>
                <span class="team ${m.awayScore > m.homeScore ? 'winner' : ''}">${m.awayTeamName}</span>
            </div>
        `).join('');
    }

    /**
     * Render records section
     */
    renderRecords() {
        const stats = statsEngine.aggregatedStats;
        if (!stats) return;

        const { careerLeaders, recordBook } = stats;

        // Career wins
        this.renderLeaderboard('career-wins', careerLeaders.mostWins, (t) => ({
            name: t.teamName,
            value: `${t.wins}-${t.losses}`,
            subtitle: `${t.seasonsPlayed} seasons`
        }));

        // Win percentage
        this.renderLeaderboard('career-win-pct', careerLeaders.bestWinPct, (t) => ({
            name: t.teamName,
            value: `${(t.winPct * 100).toFixed(1)}%`,
            subtitle: `${t.wins}-${t.losses}`
        }));

        // Championships
        this.renderLeaderboard('championship-counts', careerLeaders.mostChampionships, (t) => ({
            name: t.teamName,
            value: `🏆 ${t.championships}`,
            subtitle: ''
        }));

        // Playoff appearances
        this.renderLeaderboard('playoff-appearances', careerLeaders.mostPlayoffs, (t) => ({
            name: t.teamName,
            value: t.playoffAppearances,
            subtitle: `${t.seasonsPlayed} seasons`
        }));

        // Highest score
        this.renderLeaderboard('highest-score', recordBook.highestScore.slice(0, 5), (s) => ({
            name: s.teamName,
            value: s.score.toFixed(2),
            subtitle: `Week ${s.week}, ${s.year}${s.isPlayoff ? ' (Playoffs)' : ''}`
        }));

        // Lowest score
        this.renderLeaderboard('lowest-score', recordBook.lowestScore.slice(0, 5), (s) => ({
            name: s.teamName,
            value: s.score.toFixed(2),
            subtitle: `Week ${s.week}, ${s.year}`
        }));

        // Most PF season
        const seasonPF = stats.seasonSummaries.flatMap(season =>
            season.standings.map(team => ({
                teamName: team.name,
                pointsFor: team.record.pointsFor,
                year: season.year
            }))
        ).sort((a, b) => b.pointsFor - a.pointsFor);

        this.renderLeaderboard('most-pf-season', seasonPF.slice(0, 5), (s) => ({
            name: s.teamName,
            value: s.pointsFor.toFixed(1),
            subtitle: s.year
        }));

        // Biggest blowout
        this.renderLeaderboard('biggest-blowout', recordBook.biggestBlowout.slice(0, 5), (m) => ({
            name: `${m.winnerName} def. ${m.loserName}`,
            value: `${m.winnerScore.toFixed(1)} - ${m.loserScore.toFixed(1)}`,
            subtitle: `Margin: ${m.margin.toFixed(1)} | Week ${m.matchupPeriodId}, ${m.year}`
        }));

        // Closest game
        this.renderLeaderboard('closest-game', recordBook.closestGame.slice(0, 5), (m) => ({
            name: `${m.winnerName} vs ${m.loserName}`,
            value: `${m.winnerScore.toFixed(1)} - ${m.loserScore.toFixed(1)}`,
            subtitle: `Margin: ${m.margin.toFixed(2)} | Week ${m.matchupPeriodId}, ${m.year}`
        }));

        // Longest streak
        this.renderLeaderboard('longest-streak', recordBook.longestWinStreak.slice(0, 5), (s) => ({
            name: s.teamName,
            value: `${s.length} wins`,
            subtitle: `${s.start.year} Week ${s.start.week} - ${s.end.year} Week ${s.end.week}`
        }));
    }

    /**
     * Render a leaderboard list
     */
    renderLeaderboard(elementId, data, formatter) {
        const el = document.getElementById(elementId);
        if (!el || !data || data.length === 0) {
            if (el) el.innerHTML = '<p class="no-data">No data available</p>';
            return;
        }

        el.innerHTML = `
            <ol class="leaderboard">
                ${data.map((item, i) => {
                    const formatted = formatter(item);
                    return `
                        <li class="leaderboard-item">
                            <span class="rank">${i + 1}</span>
                            <div class="leader-info">
                                <span class="leader-name">${formatted.name}</span>
                                ${formatted.subtitle ? `<span class="leader-subtitle">${formatted.subtitle}</span>` : ''}
                            </div>
                            <span class="leader-value">${formatted.value}</span>
                        </li>
                    `;
                }).join('')}
            </ol>
        `;
    }

    /**
     * Setup H2H controls
     */
    setupH2HControls() {
        const team1Select = document.getElementById('team1-select');
        const team2Select = document.getElementById('team2-select');

        const updateH2H = () => {
            const team1 = parseInt(team1Select.value);
            const team2 = parseInt(team2Select.value);

            if (team1 && team2 && team1 !== team2) {
                this.renderH2HDetails(team1, team2);
            }
        };

        team1Select.addEventListener('change', updateH2H);
        team2Select.addEventListener('change', updateH2H);
    }

    /**
     * Populate team select dropdowns
     */
    populateTeamSelects() {
        const teams = statsEngine.getAllTeams();
        const team1Select = document.getElementById('team1-select');
        const team2Select = document.getElementById('team2-select');

        const options = teams.map(t =>
            `<option value="${t.id}">${t.name}</option>`
        ).join('');

        team1Select.innerHTML = '<option value="">Select a team...</option>' + options;
        team2Select.innerHTML = '<option value="">Select a team...</option>' + options;
    }

    /**
     * Render H2H details for two teams
     */
    renderH2HDetails(team1Id, team2Id) {
        const details = statsEngine.getH2HDetails(team1Id, team2Id);
        const el = document.getElementById('h2h-results');

        if (!details || details.matchups.length === 0) {
            el.innerHTML = '<p class="no-data">These teams have never played each other</p>';
            return;
        }

        const totalGames = details.team1.wins + details.team2.wins + details.ties;

        el.innerHTML = `
            <div class="h2h-summary">
                <div class="h2h-team ${details.team1.wins > details.team2.wins ? 'leading' : ''}">
                    <h3>${details.team1.name}</h3>
                    <div class="h2h-wins">${details.team1.wins}</div>
                    <div class="h2h-label">Wins</div>
                </div>
                <div class="h2h-vs">
                    <span class="vs-big">VS</span>
                    <span class="total-games">${totalGames} games</span>
                    ${details.ties > 0 ? `<span class="ties">${details.ties} ties</span>` : ''}
                </div>
                <div class="h2h-team ${details.team2.wins > details.team1.wins ? 'leading' : ''}">
                    <h3>${details.team2.name}</h3>
                    <div class="h2h-wins">${details.team2.wins}</div>
                    <div class="h2h-label">Wins</div>
                </div>
            </div>

            <div class="h2h-history">
                <h4>Matchup History</h4>
                <table class="h2h-table">
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Week</th>
                            <th>${details.team1.name}</th>
                            <th>${details.team2.name}</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${details.matchups.map(m => `
                            <tr>
                                <td>${m.year}</td>
                                <td>${m.week}</td>
                                <td class="${m.team1Score > m.team2Score ? 'winner' : ''}">${m.team1Score.toFixed(1)}</td>
                                <td class="${m.team2Score > m.team1Score ? 'winner' : ''}">${m.team2Score.toFixed(1)}</td>
                                <td>${m.isPlayoff ? '🏆 Playoff' : 'Regular'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Render H2H matrix
     */
    renderH2HMatrix() {
        const stats = statsEngine.aggregatedStats;
        if (!stats || !stats.h2hMatrix) return;

        const teams = statsEngine.getAllTeams();
        const matrix = stats.h2hMatrix;
        const el = document.getElementById('h2h-matrix');

        if (teams.length > 14) {
            el.innerHTML = '<p class="note">Matrix display limited for large leagues. Use the team selectors above for detailed matchups.</p>';
            return;
        }

        let html = '<table class="matrix-table"><thead><tr><th></th>';
        teams.forEach(t => {
            html += `<th title="${t.name}">${t.abbrev || t.name.substring(0, 3)}</th>`;
        });
        html += '</tr></thead><tbody>';

        teams.forEach(t1 => {
            html += `<tr><th title="${t1.name}">${t1.abbrev || t1.name.substring(0, 3)}</th>`;
            teams.forEach(t2 => {
                if (t1.id === t2.id) {
                    html += '<td class="self">-</td>';
                } else {
                    const record = matrix[t1.id]?.[t2.id];
                    if (record && (record.wins + record.losses + record.ties) > 0) {
                        const winClass = record.wins > record.losses ? 'positive' :
                                        record.wins < record.losses ? 'negative' : 'neutral';
                        html += `<td class="${winClass}" title="${t1.name} vs ${t2.name}: ${record.wins}-${record.losses}">${record.wins}-${record.losses}</td>`;
                    } else {
                        html += '<td class="no-games">0-0</td>';
                    }
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        el.innerHTML = html;
    }

    /**
     * Setup season selector
     */
    setupSeasonSelector() {
        const select = document.getElementById('season-select');
        select.addEventListener('change', () => {
            const year = parseInt(select.value);
            if (year) {
                this.renderSeasonDetails(year);
            }
        });
    }

    /**
     * Populate season select dropdown
     */
    populateSeasonSelect() {
        const seasons = statsEngine.getAllSeasons();
        const select = document.getElementById('season-select');

        select.innerHTML = '<option value="">Select a season...</option>' +
            seasons.map(y => `<option value="${y}">${y}</option>`).join('');
    }

    /**
     * Render season details
     */
    renderSeasonDetails(year) {
        const details = statsEngine.getSeasonDetails(year);
        if (!details) return;

        // Standings
        const standingsEl = document.getElementById('season-standings');
        standingsEl.innerHTML = `
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>W-L</th>
                        <th>PF</th>
                        <th>PA</th>
                    </tr>
                </thead>
                <tbody>
                    ${details.standings.map((team, i) => `
                        <tr class="${team.id === details.champion ? 'champion-row' : ''}">
                            <td>${i + 1}</td>
                            <td>${team.name} ${team.id === details.champion ? '🏆' : ''}</td>
                            <td>${team.record.wins}-${team.record.losses}</td>
                            <td>${team.record.pointsFor.toFixed(1)}</td>
                            <td>${team.record.pointsAgainst.toFixed(1)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // Season leaders
        const leadersEl = document.getElementById('season-leaders');
        const mostWins = [...details.standings].sort((a, b) => b.record.wins - a.record.wins)[0];
        const mostPF = [...details.standings].sort((a, b) => b.record.pointsFor - a.record.pointsFor)[0];

        leadersEl.innerHTML = `
            <div class="leader-item">
                <span class="leader-title">🏆 Champion</span>
                <span class="leader-value">${details.championName}</span>
            </div>
            <div class="leader-item">
                <span class="leader-title">Best Record</span>
                <span class="leader-value">${mostWins.name} (${mostWins.record.wins}-${mostWins.record.losses})</span>
            </div>
            <div class="leader-item">
                <span class="leader-title">Most Points</span>
                <span class="leader-value">${mostPF.name} (${mostPF.record.pointsFor.toFixed(1)})</span>
            </div>
            <div class="leader-item">
                <span class="leader-title">High Score</span>
                <span class="leader-value">${details.seasonHighScore.teamName} - ${details.seasonHighScore.score.toFixed(1)} (Week ${details.seasonHighScore.week})</span>
            </div>
        `;

        // Weekly results
        const weeklyEl = document.getElementById('season-weekly');
        const weeks = Object.keys(details.matchupsByWeek).sort((a, b) => a - b);

        weeklyEl.innerHTML = `
            <div class="week-selector">
                <select id="week-select">
                    ${weeks.map(w => `<option value="${w}">Week ${w}</option>`).join('')}
                </select>
            </div>
            <div id="week-matchups"></div>
        `;

        const weekSelect = document.getElementById('week-select');
        const renderWeek = () => {
            const week = weekSelect.value;
            const matchups = details.matchupsByWeek[week] || [];
            document.getElementById('week-matchups').innerHTML = matchups.map(m => `
                <div class="matchup-row">
                    <span class="team ${m.homeScore > m.awayScore ? 'winner' : ''}">${m.homeTeamName}</span>
                    <span class="score">${m.homeScore.toFixed(1)} - ${m.awayScore.toFixed(1)}</span>
                    <span class="team ${m.awayScore > m.homeScore ? 'winner' : ''}">${m.awayTeamName}</span>
                </div>
            `).join('');
        };

        weekSelect.addEventListener('change', renderWeek);
        renderWeek();

        // Playoffs (placeholder)
        document.getElementById('season-playoffs').innerHTML = `
            <p>Playoff data for ${year}</p>
            <p class="note">Champion: ${details.championName} 🏆</p>
        `;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FantasyApp();
});

// Mobile Menu Toggle
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

// Close mobile menu when clicking nav links
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar.classList.contains('open')) {
                toggleMobileMenu();
            }
        }
    });
});
