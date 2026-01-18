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
     * Automatically load data - checks for pre-built data first, then cache
     */
    async autoLoadData() {
        // First, try to load pre-built static data (fastest option)
        const prebuiltLoaded = await this.loadPrebuiltData();
        if (prebuiltLoaded) {
            return;
        }

        // Try to load from browser cache (localStorage)
        if (statsEngine.loadFromStorage()) {
            // Check if cache is fresh enough (less than 24 hours old)
            const lastFetch = localStorage.getItem('espn_last_fetch');
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
            const cacheValid = lastFetch && parseInt(lastFetch) > oneDayAgo;

            if (cacheValid) {
                this.dataLoaded = true;
                this.renderAllSections();
                this.renderLandingPage();
                this.showSection('home');
                document.querySelector('[data-section="home"]').classList.add('active');
                this.updateDataStatus('Data loaded from cache (refreshes daily)');
                return;
            }
        }

        // Fetch fresh data if cache is invalid, outdated, or missing
        await this.loadLeagueData();
    }

    /**
     * Load pre-built static data from server
     * This is generated during deployment by prebuild.js
     */
    async loadPrebuiltData() {
        try {
            console.log('Attempting to load pre-built data...');
            const response = await fetch('/data/league-data.json');

            if (!response.ok) {
                console.log('No pre-built data available, will fetch from ESPN API');
                return false;
            }

            const prebuiltData = await response.json();
            console.log('Pre-built data found:', prebuiltData.meta);

            // Check if pre-built data is recent enough (less than 24 hours old)
            const generatedAt = new Date(prebuiltData.meta.generatedAt).getTime();
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

            if (generatedAt < oneDayAgo) {
                console.log('Pre-built data is stale, will refresh from ESPN API');
                return false;
            }

            // Process the pre-built data
            await statsEngine.loadAllSeasons(prebuiltData.seasons);
            statsEngine.saveToStorage();

            // Save fetch timestamp
            localStorage.setItem('espn_last_fetch', Date.now().toString());

            this.dataLoaded = true;
            this.renderAllSections();
            this.renderLandingPage();
            this.showSection('home');
            document.querySelector('[data-section="home"]').classList.add('active');

            const generatedDate = new Date(prebuiltData.meta.generatedAt).toLocaleString();
            this.updateDataStatus(`Data loaded instantly (pre-built ${generatedDate})`);

            return true;
        } catch (error) {
            console.log('Error loading pre-built data:', error.message);
            return false;
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
            currentYear: 2026
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
            currentYear: 2026
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
            this.renderLandingPage();

            // Show detailed status
            let statusMsg = `Successfully loaded ${successfulYears.length} seasons of data`;
            if (failedYears.length > 0) {
                statusMsg += `. Failed years: ${failedYears.map(f => f.year).join(', ')}`;
            }
            this.updateDataStatus(statusMsg);

            // Show home/landing page
            this.showSection('home');
            document.querySelector('[data-section="home"]').classList.add('active');

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
     * Render landing page with current champion
     */
    renderLandingPage() {
        const stats = statsEngine.aggregatedStats;
        if (!stats) return;

        // Get the 2025 champion specifically (most recent completed season)
        const champion2025 = stats.champions.find(c => c.year === 2025);

        // Update champion name - use actual team name, not owner name
        const championNameEl = document.getElementById('current-champion-name');
        if (championNameEl && champion2025) {
            // Get the actual team name for the champion
            const teamName = statsEngine.getActualTeamName(champion2025.teamId);
            championNameEl.textContent = teamName;
        }

        // Update landing stats
        const seasons = statsEngine.getAllSeasons();
        document.getElementById('landing-seasons').textContent = seasons.length;
        document.getElementById('landing-games').textContent = stats.allMatchups.length.toLocaleString();

        // Count unique champions
        const uniqueChampions = new Set(stats.champions.map(c => c.teamName));
        document.getElementById('landing-champions').textContent = uniqueChampions.size;
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

        // Career wins with win % included
        this.renderLeaderboard('career-wins', careerLeaders.mostWins, (t) => ({
            name: t.teamName,
            value: `${t.wins}-${t.losses}`,
            subtitle: `${(t.winPct * 100).toFixed(1)}% · ${t.seasonsPlayed} seasons`
        }));

        // Championships
        this.renderLeaderboard('championship-counts', careerLeaders.mostChampionships, (t) => ({
            name: t.teamName,
            value: `🏆 ${t.championships}`,
            subtitle: ''
        }));

        // Championship appearances
        this.renderLeaderboard('championship-appearances', careerLeaders.mostChampionshipAppearances, (t) => ({
            name: t.teamName,
            value: t.championshipAppearances,
            subtitle: `${t.championships} wins`
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
                                <td>${m.isPlayoff ? '<span class="playoff-badge">🏆 Playoff</span>' : '<span class="regular-badge">Regular</span>'}</td>
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

// ============================================
// 2026 Destination Bracket Functionality
// ============================================

const destinations = {
    aspen: {
        name: "Aspen",
        region: "Colorado, USA",
        vibe: "Luxury Mountain Town",
        bestFor: "Winter Sports & Fine Dining",
        attractions: ["Aspen Mountain Skiing", "Maroon Bells", "Independence Pass", "Aspen Art Museum", "Rio Grande Trail"],
        restaurants: ["Matsuhisa", "Element 47", "The Wild Fig", "Ajax Tavern", "Meatball Shack"],
        nightlife: ["Belly Up Aspen", "Escobar", "The Living Room", "Silver City Saloon"],
        sports: ["Ajax Mountain", "Buttermilk Ski Area", "Aspen Ice Garden", "Rio Grande Park"]
    },
    traverse: {
        name: "Traverse City",
        region: "Michigan, USA",
        vibe: "Wine Country Beach Town",
        bestFor: "Wineries & Lake Life",
        attractions: ["Sleeping Bear Dunes", "Old Mission Peninsula", "Downtown TC", "Clinch Park Beach", "Leelanau Peninsula"],
        restaurants: ["The Cooks' House", "Trattoria Stella", "Red Ginger", "Amical", "The Franklin"],
        nightlife: ["Low Bar", "Workshop Brewing", "The Little Fleet", "Mackinaw Brewing"],
        sports: ["TART Trails", "Hickory Hills", "Grand Traverse Bay", "Crystal Mountain"]
    },
    houston: {
        name: "Houston",
        region: "Texas, USA",
        vibe: "Diverse Mega-City",
        bestFor: "Food Scene & Space Center",
        attractions: ["Space Center Houston", "Museum District", "Buffalo Bayou Park", "Galleria", "San Jacinto Monument"],
        restaurants: ["Underbelly Hospitality", "Pappas Bros Steakhouse", "Uchi", "The Breakfast Klub", "Killen's BBQ"],
        nightlife: ["White Oak Music Hall", "Barbarella", "Present Company", "The Rustic"],
        sports: ["NRG Stadium (Texans)", "Minute Maid Park (Astros)", "Toyota Center (Rockets)", "Shell Energy Stadium"]
    },
    tahoe: {
        name: "Lake Tahoe",
        region: "California/Nevada, USA",
        vibe: "Alpine Paradise",
        bestFor: "Skiing & Lake Activities",
        attractions: ["Emerald Bay", "Heavenly Gondola", "Sand Harbor", "Vikingsholm Castle", "Donner Pass"],
        restaurants: ["Evan's American Gourmet Cafe", "Sunnyside Restaurant", "The Lone Eagle Grille", "Artemis Lakefront Cafe"],
        nightlife: ["Stateline Casinos", "The Loft", "Crystal Bay Club", "Moe's BBQ"],
        sports: ["Palisades Tahoe", "Heavenly Mountain", "Northstar California", "Edgewood Golf Course"]
    },
    chattanooga: {
        name: "Chattanooga",
        region: "Tennessee, USA",
        vibe: "Outdoor Adventure Hub",
        bestFor: "Rock Climbing & River Sports",
        attractions: ["Lookout Mountain", "Tennessee Aquarium", "Ruby Falls", "Walnut Street Bridge", "Rock City"],
        restaurants: ["St. John's Meeting Place", "Public House", "Easy Bistro", "STIR", "Taqueria Jalisco"],
        nightlife: ["The Signal", "Songbirds Guitar Museum", "JJ's Bohemia", "Flying Squirrel"],
        sports: ["AT&T Field (Lookouts)", "Finley Stadium", "Tennessee River Paddle", "Stringers Ridge"]
    },
    richmond: {
        name: "Richmond",
        region: "Virginia, USA",
        vibe: "Historic River City",
        bestFor: "Craft Beer & History",
        attractions: ["Belle Isle", "Virginia Museum of Fine Arts", "Hollywood Cemetery", "Carytown", "Canal Walk"],
        restaurants: ["The Roosevelt", "L'Opossum", "Brenner Pass", "ZZQ", "Mama J's Kitchen"],
        nightlife: ["The Broadberry", "The Camel", "Garden Grove Brewing", "Hardywood Park"],
        sports: ["The Diamond (Flying Squirrels)", "City Stadium", "James River Park", "Pocahontas State Park"]
    },
    columbus: {
        name: "Columbus",
        region: "Ohio, USA",
        vibe: "College Town Energy",
        bestFor: "OSU Football & Food Scene",
        attractions: ["Ohio Stadium", "Short North Arts District", "German Village", "COSI", "Franklin Park Conservatory"],
        restaurants: ["The Refectory", "Wolf's Ridge Brewing", "Lindey's", "Schmidt's Sausage Haus", "Hot Chicken Takeover"],
        nightlife: ["Newport Music Hall", "Skully's", "Ace of Cups", "Brothers Drake Meadery"],
        sports: ["Ohio Stadium (Buckeyes)", "Nationwide Arena (Blue Jackets)", "Huntington Park (Clippers)", "Crew Stadium"]
    },
    omaha: {
        name: "Omaha",
        region: "Nebraska, USA",
        vibe: "Underrated Midwest Gem",
        bestFor: "Steakhouses & Zoo",
        attractions: ["Henry Doorly Zoo", "Old Market District", "Bob Kerrey Pedestrian Bridge", "Joslyn Art Museum", "Durham Museum"],
        restaurants: ["Gorat's Steakhouse", "Dante Pizzeria", "Block 16", "V. Mertz", "The Drover"],
        nightlife: ["Waiting Room Lounge", "The Slowdown", "Benson District Bars", "Krug Park"],
        sports: ["Charles Schwab Field (CWS)", "CHI Health Center", "Werner Park", "Baxter Arena"]
    },
    bozeman: {
        name: "Bozeman",
        region: "Montana, USA",
        vibe: "Mountain Adventure Base",
        bestFor: "Yellowstone Gateway & Skiing",
        attractions: ["Yellowstone National Park", "Big Sky Resort", "Museum of the Rockies", "Main Street Downtown", "Hyalite Canyon"],
        restaurants: ["Blackbird Kitchen", "Plonk Wine", "The Mint Cafe", "Roost Fried Chicken", "Open Range"],
        nightlife: ["Rocking R Bar", "The Crystal Bar", "MAP Brewing", "Mountains Walking Brewery"],
        sports: ["Big Sky Resort", "Bridger Bowl", "Bobcat Stadium (MSU)", "Story Mill Park"]
    },
    santafe: {
        name: "Santa Fe",
        region: "New Mexico, USA",
        vibe: "Artistic Desert Oasis",
        bestFor: "Art Galleries & Southwest Culture",
        attractions: ["Canyon Road", "Georgia O'Keeffe Museum", "Santa Fe Plaza", "Meow Wolf", "Loretto Chapel"],
        restaurants: ["The Shed", "Geronimo", "Cafe Pasqual's", "Tia Sophia's", "La Choza"],
        nightlife: ["Secreto Lounge", "Cowgirl BBQ", "El Farol", "Santa Fe Brewing"],
        sports: ["Santa Fe Ski Basin", "Dale Ball Trails", "Santa Fe Fuego", "Hyde Memorial Park"]
    },
    greenville: {
        name: "Greenville",
        region: "South Carolina, USA",
        vibe: "Charming Downtown Revival",
        bestFor: "Falls Park & Food Scene",
        attractions: ["Falls Park on the Reedy", "Liberty Bridge", "Downtown Main Street", "Peace Center", "Fluor Field"],
        restaurants: ["The Lazy Goat", "Soby's", "Jianna", "Nose Dive", "The Anchorage"],
        nightlife: ["The Radio Room", "Smiley's Acoustic Cafe", "Jack n Diane's", "Ink n Ivy"],
        sports: ["Fluor Field (Drive)", "Bon Secours Wellness Arena", "Swamp Rabbit Trail", "Paris Mountain"]
    },
    la: {
        name: "Los Angeles",
        region: "California, USA",
        vibe: "Entertainment Capital",
        bestFor: "Beaches & Nightlife",
        attractions: ["Santa Monica Pier", "Hollywood Walk of Fame", "Getty Center", "Griffith Observatory", "Venice Beach"],
        restaurants: ["Bestia", "n/naka", "Gjusta", "Providence", "Guerrilla Tacos"],
        nightlife: ["The Viper Room", "Catch One", "The Dresden", "Good Times at Davey Wayne's"],
        sports: ["SoFi Stadium (Rams/Chargers)", "Crypto.com Arena (Lakers)", "Dodger Stadium", "Rose Bowl"]
    },
    birmingham: {
        name: "Birmingham",
        region: "Alabama, USA",
        vibe: "Southern Renaissance City",
        bestFor: "BBQ & Civil Rights History",
        attractions: ["Birmingham Civil Rights Institute", "Vulcan Park", "Regions Field", "Railroad Park", "Barber Motorsports"],
        restaurants: ["Highlands Bar and Grill", "Saw's BBQ", "Hot and Hot Fish Club", "Bottega", "Automatic Seafood"],
        nightlife: ["Saturn Birmingham", "The Nick", "Good People Brewing", "Avondale Brewing"],
        sports: ["Protective Stadium (UAB)", "Regions Field (Barons)", "Barber Motorsports Park", "Oak Mountain"]
    },
    mexicocity: {
        name: "Mexico City",
        region: "Mexico",
        vibe: "Historic Mega-Metropolis",
        bestFor: "Tacos & Museums",
        attractions: ["Zócalo", "Museo Frida Kahlo", "Chapultepec Castle", "Teotihuacán", "Coyoacán"],
        restaurants: ["Pujol", "Contramar", "El Huequito", "El Califa de León", "Quintonil"],
        nightlife: ["Mama Rumba", "Patrick Miller", "Hanky Panky", "La Clandestina"],
        sports: ["Estadio Azteca", "Foro Sol", "Arena México", "Hipódromo de las Américas"]
    },
    durham: {
        name: "Durham",
        region: "North Carolina, USA",
        vibe: "Research Triangle Creative Hub",
        bestFor: "BBQ & Bull City Culture",
        attractions: ["Duke University", "American Tobacco Campus", "Durham Bulls Athletic Park", "Sarah P. Duke Gardens", "Brightleaf Square"],
        restaurants: ["Mateo Bar de Tapas", "The Pit", "M Kokko", "Dame's Chicken & Waffles", "Pizzeria Toro"],
        nightlife: ["Motorco Music Hall", "The Pinhook", "Fullsteam Brewery", "Arcana"],
        sports: ["Durham Bulls Athletic Park", "Cameron Indoor (Duke)", "Wallace Wade Stadium", "Eno River Trails"]
    },
    madison: {
        name: "Madison",
        region: "Wisconsin, USA",
        vibe: "Progressive College Town",
        bestFor: "Badgers Football & Lakes",
        attractions: ["State Street", "Wisconsin State Capitol", "Olbrich Gardens", "Henry Vilas Zoo", "Chazen Museum"],
        restaurants: ["Heritage Tavern", "Merchant", "Graze", "The Old Fashioned", "Ian's Pizza"],
        nightlife: ["High Noon Saloon", "The Majestic", "State Street Brats", "Great Dane Pub"],
        sports: ["Camp Randall Stadium (Badgers)", "Kohl Center", "Breese Stevens Field", "Devil's Lake"]
    },
    boise: {
        name: "Boise",
        region: "Idaho, USA",
        vibe: "Hidden Gem Mountain City",
        bestFor: "Outdoor Access & Blue Turf",
        attractions: ["Boise River Greenbelt", "Idaho State Capitol", "Basque Block", "Old Idaho Penitentiary", "Table Rock"],
        restaurants: ["Richard's", "Fork", "Bittercreek Alehouse", "Goldy's Breakfast Bistro", "Chandlers"],
        nightlife: ["Neurolux", "Pengilly's Saloon", "Reef", "Modern Hotel Bar"],
        sports: ["Albertsons Stadium (Blue Turf)", "Idaho Central Arena", "Bogus Basin", "Boise River Rafting"]
    },
    vegas: {
        name: "Las Vegas",
        region: "Nevada, USA",
        vibe: "Entertainment Epicenter",
        bestFor: "Nightlife & Sports",
        attractions: ["The Strip", "Fremont Street", "Red Rock Canyon", "High Roller", "Bellagio Fountains"],
        restaurants: ["Joel Robuchon", "Momofuku", "Bacchanal Buffet", "é by José Andrés", "Carson Kitchen"],
        nightlife: ["XS", "Omnia", "Marquee", "Hakkasan", "On The Record"],
        sports: ["Allegiant Stadium (Raiders)", "T-Mobile Arena (Knights)", "Las Vegas Motor Speedway", "Wynn Golf Club"]
    },
    cabo: {
        name: "Cabo San Lucas",
        region: "Baja California Sur, Mexico",
        vibe: "Beach Party Paradise",
        bestFor: "Beaches & Margaritas",
        attractions: ["El Arco", "Lover's Beach", "Medano Beach", "San José del Cabo", "Land's End"],
        restaurants: ["Edith's", "Nick-San", "Flora's Field Kitchen", "The Office on the Beach", "Manta"],
        nightlife: ["Squid Roe", "Cabo Wabo Cantina", "El Squid Roe", "Mandala", "Pink Kitty"],
        sports: ["Deep Sea Fishing", "Quivira Golf Club", "Surf Breaks", "Whale Watching Tours"]
    },
    coeurdalene: {
        name: "Coeur d'Alene",
        region: "Idaho, USA",
        vibe: "Lake Resort Town",
        bestFor: "Lake Activities & Golf",
        attractions: ["Lake Coeur d'Alene", "Floating Green Golf Course", "Tubbs Hill", "Downtown Sherman Ave", "Silver Mountain"],
        restaurants: ["Beverly's", "Tony's on the Lake", "Syringa Japanese Cafe", "Dockside Restaurant"],
        nightlife: ["Iron Horse Bar", "Tito Macaroni's", "The Beacon", "Capone's Sports Pub"],
        sports: ["The Coeur d'Alene Golf Course", "Schweitzer Mountain", "Lake Paddleboarding", "Hiawatha Trail"]
    },
    nyc: {
        name: "New York City",
        region: "New York, USA",
        vibe: "The City That Never Sleeps",
        bestFor: "Everything, Really",
        attractions: ["Central Park", "Times Square", "Statue of Liberty", "Brooklyn Bridge", "High Line"],
        restaurants: ["Eleven Madison Park", "Le Bernardin", "Katz's Deli", "Di Fara Pizza", "Peter Luger"],
        nightlife: ["Brooklyn Mirage", "Le Bain", "Death & Co", "House of Yes", "Comedy Cellar"],
        sports: ["Madison Square Garden", "Yankee Stadium", "MetLife Stadium", "Citi Field", "Barclays Center"]
    },
    tulsa: {
        name: "Tulsa",
        region: "Oklahoma, USA",
        vibe: "Art Deco Renaissance",
        bestFor: "Route 66 & Gathering Place",
        attractions: ["Gathering Place", "Philbrook Museum", "Blue Whale of Catoosa", "BOK Center", "Cherry Street"],
        restaurants: ["Burn Co BBQ", "Juniper", "Bodean Seafood", "The Tavern", "Kilkenny's Irish Pub"],
        nightlife: ["Cain's Ballroom", "The Vanguard", "Arnie's Bar", "Soundpony Lounge"],
        sports: ["ONEOK Field (Drillers)", "BOK Center", "Gathering Place Sports Courts", "Mohawk Park Golf"]
    },
    puertovallarta: {
        name: "Puerto Vallarta",
        region: "Jalisco, Mexico",
        vibe: "Romantic Beach Town",
        bestFor: "Sunsets & Malecón",
        attractions: ["Malecón Boardwalk", "Los Muertos Beach", "Zona Romántica", "El Centro", "Marietas Islands"],
        restaurants: ["Café des Artistes", "La Palapa", "Tintoque", "Mariscos 8 Tostadas", "Barcelona Tapas"],
        nightlife: ["La Vaquita", "Zoo Bar", "Roxy Rock House", "Mandala", "La Santa"],
        sports: ["Surfing at Sayulita", "Deep Sea Fishing", "Vista Vallarta Golf", "Sierra Madre Hiking"]
    },
    saugatuck: {
        name: "Saugatuck",
        region: "Michigan, USA",
        vibe: "Artsy Beach Village",
        bestFor: "Galleries & Dunes",
        attractions: ["Oval Beach", "Saugatuck Dunes State Park", "Downtown Galleries", "Chain Ferry", "Mount Baldhead"],
        restaurants: ["Everyday People Cafe", "Bowdie's Chophouse", "Phil's Bar & Grille", "Marro's Italian"],
        nightlife: ["The Butler", "Saugatuck Brewing Company", "Wally's Bar", "The Dunes Resort"],
        sports: ["Oval Beach Swimming", "Kal-Haven Trail", "Kayaking Kalamazoo River", "Dune Climbing"]
    }
};

const destProTips = {
    aspen: "Book restaurants early - Aspen spots fill up fast during ski season!",
    traverse: "Visit during Cherry Festival in July or catch the wine harvest in September.",
    houston: "Don't skip the BBQ trail - Killen's and Truth are worth the drive.",
    tahoe: "Stay on the South Shore for nightlife, North Shore for quieter luxury.",
    chattanooga: "The Incline Railway up Lookout Mountain is a must-do for views.",
    richmond: "The Scott's Addition neighborhood has the best craft brewery concentration.",
    columbus: "Game day at the Horseshoe is an unforgettable experience - plan ahead!",
    omaha: "The Old Market comes alive at night - great for bar hopping on foot.",
    bozeman: "Yellowstone is an hour away - build in a full day for the park.",
    santafe: "Canyon Road has 100+ galleries - pace yourself and wear comfy shoes.",
    greenville: "Walk the Swamp Rabbit Trail for the best views of the falls.",
    la: "Rent a car. Seriously. You'll need it to experience the full city.",
    birmingham: "Saw's Soul Kitchen for breakfast is worth any wait.",
    mexicocity: "Uber is cheap and safe - skip renting a car in the chaotic traffic.",
    durham: "Catch a Bulls game at the park featured in Bull Durham!",
    madison: "Tailgate at Camp Randall starts 5 hours before kickoff - come early!",
    boise: "The blue turf at Albertsons Stadium is a bucket list experience.",
    vegas: "Most club reservations open 2 weeks out - book early for weekends.",
    cabo: "The Office on the Beach: toes in sand, drink in hand, life figured out.",
    coeurdalene: "The floating golf green is the only one in the world - try it!",
    nyc: "Get a MetroCard, walk everywhere, and embrace the chaos.",
    tulsa: "Gathering Place is free and one of the best parks in America.",
    puertovallarta: "Zona Romántica is the heart of the city - stay there if you can.",
    saugatuck: "Climb Mount Baldhead at sunset for incredible Lake Michigan views."
};

function openDestModal(locationKey) {
    const data = destinations[locationKey];
    if (!data) return;

    document.getElementById('dest-modal-title').textContent = data.name;
    document.getElementById('dest-modal-subtitle').textContent = data.region;

    const content = `
        <div class="dest-quick-stats">
            <div class="dest-stat-box">
                <div class="dest-stat-icon">🎯</div>
                <div class="dest-stat-label">Vibe</div>
                <div class="dest-stat-value">${data.vibe}</div>
            </div>
            <div class="dest-stat-box">
                <div class="dest-stat-icon">⭐</div>
                <div class="dest-stat-label">Best For</div>
                <div class="dest-stat-value">${data.bestFor}</div>
            </div>
            <div class="dest-stat-box">
                <div class="dest-stat-icon">📍</div>
                <div class="dest-stat-label">Attractions</div>
                <div class="dest-stat-value">${data.attractions.length} spots</div>
            </div>
        </div>

        <div class="dest-info-section">
            <h3>Top Attractions</h3>
            <ul class="dest-info-list">
                ${data.attractions.map(item => `<li>${item}</li>`).join('')}
            </ul>
        </div>

        <div class="dest-info-section">
            <h3>Must-Try Restaurants</h3>
            <ul class="dest-info-list">
                ${data.restaurants.map(item => `<li>${item}</li>`).join('')}
            </ul>
        </div>

        <div class="dest-info-section">
            <h3>Nightlife & Entertainment</h3>
            <ul class="dest-info-list">
                ${data.nightlife.map(item => `<li>${item}</li>`).join('')}
            </ul>
        </div>

        <div class="dest-info-section">
            <h3>Sports & Recreation</h3>
            <ul class="dest-info-list">
                ${data.sports.map(item => `<li>${item}</li>`).join('')}
            </ul>
        </div>

        <div class="dest-highlight-box">
            <p><strong>Pro Tip:</strong> ${destProTips[locationKey] || "Get ready for an amazing trip!"}</p>
        </div>
    `;

    document.getElementById('dest-modal-content').innerHTML = content;
    document.getElementById('dest-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDestModal() {
    document.getElementById('dest-modal').classList.remove('active');
    document.body.style.overflow = '';
}

// Initialize destination bracket event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Click handlers for destination teams
    document.querySelectorAll('.dest-team[data-location]').forEach(team => {
        team.addEventListener('click', () => {
            const location = team.getAttribute('data-location');
            if (location) openDestModal(location);
        });
    });

    // Close modal on overlay click
    const destModal = document.getElementById('dest-modal');
    if (destModal) {
        destModal.addEventListener('click', (e) => {
            if (e.target === destModal) {
                closeDestModal();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const destModal = document.getElementById('dest-modal');
            if (destModal && destModal.classList.contains('active')) {
                closeDestModal();
            }
        }
    });

    // Trip History Filter Controls
    const tripFilterBtns = document.querySelectorAll('.trip-filter-btn');
    const tripCards = document.querySelectorAll('.trip-card');

    tripFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            tripFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;
            const currentYear = new Date().getFullYear();

            tripCards.forEach(card => {
                const rating = parseInt(card.dataset.rating) || 0;
                const year = parseInt(card.dataset.year) || 0;
                let show = true;

                switch(filter) {
                    case 'all':
                        show = true;
                        break;
                    case '5':
                        show = rating === 5;
                        break;
                    case '4':
                        show = rating >= 4;
                        break;
                    case 'recent':
                        show = year >= currentYear - 4;
                        break;
                }

                if (show) {
                    card.classList.remove('filtered-out');
                    card.style.animation = 'fadeSlideIn 0.3s ease forwards';
                } else {
                    card.classList.add('filtered-out');
                }
            });
        });
    });

    // Trip card hover animation enhancement
    tripCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transition = 'all 0.3s ease';
        });
    });

    // Theme Selector
    const themeOptions = document.querySelectorAll('.theme-option');
    const savedTheme = localStorage.getItem('fadunkadunk-theme') || 'classic';

    // Apply saved theme on load
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeOptions.forEach(opt => {
        if (opt.dataset.theme === savedTheme) {
            opt.classList.add('active');
        }
    });

    // Theme selection handler
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;

            // Update active state
            themeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            // Apply theme
            document.documentElement.setAttribute('data-theme', theme);

            // Save preference
            localStorage.setItem('fadunkadunk-theme', theme);

            // Visual feedback
            option.style.transform = 'scale(0.98)';
            setTimeout(() => {
                option.style.transform = '';
            }, 150);
        });
    });

    // Update cache status display
    const cacheStatusDisplay = document.getElementById('cache-status-display');
    if (cacheStatusDisplay) {
        const lastFetch = localStorage.getItem('espn_last_fetch');
        if (lastFetch) {
            const fetchDate = new Date(parseInt(lastFetch));
            const now = new Date();
            const diffHours = Math.floor((now - fetchDate) / (1000 * 60 * 60));
            if (diffHours < 1) {
                cacheStatusDisplay.textContent = 'Updated just now';
            } else if (diffHours < 24) {
                cacheStatusDisplay.textContent = `Updated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            } else {
                const diffDays = Math.floor(diffHours / 24);
                cacheStatusDisplay.textContent = `Updated ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            }
        } else {
            cacheStatusDisplay.textContent = 'No cached data';
        }
    }

    // Refresh data button
    const refreshBtn = document.getElementById('refresh-data-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            localStorage.removeItem('espn_last_fetch');
            location.reload();
        });
    }
});
