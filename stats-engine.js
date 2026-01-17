/**
 * Fantasy Football Statistics Engine
 * Aggregates and analyzes historical league data across multiple seasons
 */

class StatsEngine {
    constructor() {
        this.allSeasonData = {};
        this.aggregatedStats = null;
        this.teamNameMap = new Map(); // Maps team IDs to owner names (display name)
        this.ownerNameMap = new Map(); // Maps owner IDs to their names
        this.ownerHistory = new Map(); // Maps owner IDs to their teams across seasons
        this.useOwnerNames = true; // Display owner names instead of team names
    }

    /**
     * Load and process data for all seasons
     */
    async loadAllSeasons(rawData) {
        this.allSeasonData = rawData;
        this.buildTeamNameMap();
        this.aggregatedStats = this.aggregateAllStats();
        return this.aggregatedStats;
    }

    /**
     * Build a map of team/owner names across all seasons
     * Uses the most recent name for each team/owner
     */
    buildTeamNameMap() {
        const years = Object.keys(this.allSeasonData).sort((a, b) => b - a);

        for (const year of years) {
            const data = this.allSeasonData[year];
            if (data.error || !data.teams) continue;

            const members = data.members || [];

            for (const team of data.teams) {
                const teamId = team.id;
                const ownerId = team.primaryOwner || team.owners?.[0]?.id;

                // Get owner name from various sources
                let ownerName = null;

                // Try members array first
                if (ownerId && members.length > 0) {
                    const member = members.find(m => m.id === ownerId);
                    if (member) {
                        ownerName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
                    }
                }

                // Try team.owners array
                if (!ownerName && team.owners && team.owners.length > 0) {
                    const owner = team.owners[0];
                    ownerName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim();
                }

                // Try team.members array
                if (!ownerName && team.members && team.members.length > 0) {
                    const member = team.members[0];
                    ownerName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
                }

                // Fallback to team name
                if (!ownerName) {
                    ownerName = team.name || `Team ${teamId}`;
                }

                // Store owner name by owner ID (most reliable across seasons)
                if (ownerId && !this.ownerNameMap.has(ownerId)) {
                    this.ownerNameMap.set(ownerId, ownerName);
                }

                // Store in team map (uses owner name as display name)
                if (!this.teamNameMap.has(teamId)) {
                    this.teamNameMap.set(teamId, {
                        name: ownerName,
                        teamName: team.name || `Team ${teamId}`,
                        abbrev: team.abbrev || `T${teamId}`,
                        ownerId: ownerId
                    });
                }

                // Track owner history
                if (ownerId && !this.ownerHistory.has(ownerId)) {
                    this.ownerHistory.set(ownerId, []);
                }
                if (ownerId) {
                    this.ownerHistory.get(ownerId).push({
                        year: parseInt(year),
                        teamId: teamId,
                        teamName: team.name,
                        ownerName: ownerName
                    });
                }
            }
        }
    }

    /**
     * Get display name for a team (returns owner name by default)
     */
    getTeamName(teamId) {
        const info = this.teamNameMap.get(teamId);
        if (!info) return `Team ${teamId}`;

        // Return owner name if we're using owner names
        if (this.useOwnerNames && info.ownerId) {
            return this.ownerNameMap.get(info.ownerId) || info.name;
        }
        return info.name;
    }

    /**
     * Get the actual team name (not owner name)
     */
    getActualTeamName(teamId) {
        return this.teamNameMap.get(teamId)?.teamName || `Team ${teamId}`;
    }

    /**
     * Aggregate all statistics across seasons
     */
    aggregateAllStats() {
        const stats = {
            careerRecords: new Map(), // Career wins/losses per team
            allMatchups: [], // Every matchup ever played
            seasonSummaries: [], // Summary for each season
            champions: [], // Championship winners
            highScores: [], // All individual game scores
            h2hRecords: new Map(), // Head-to-head records between teams
            streaks: new Map(), // Win/loss streaks
            playoffAppearances: new Map(),
            regularSeasonRecords: new Map(),
            championshipAppearances: new Map() // Teams that made championship game
        };

        const years = Object.keys(this.allSeasonData).sort();

        for (const year of years) {
            const data = this.allSeasonData[year];
            if (data.error || !data.teams) continue;

            const seasonStats = this.processSeasonData(parseInt(year), data);

            // Merge season stats into aggregate
            this.mergeSeasonStats(stats, seasonStats, parseInt(year));
        }

        // Calculate derived statistics
        stats.careerLeaders = this.calculateCareerLeaders(stats);
        stats.recordBook = this.calculateRecordBook(stats);
        stats.h2hMatrix = this.calculateH2HMatrix(stats);

        return stats;
    }

    /**
     * Process a single season's data
     */
    processSeasonData(year, data) {
        const teams = espnAPI.parseTeams(data);
        const matchups = espnAPI.parseMatchups(data);
        const settings = espnAPI.parseSettings(data);

        // Determine regular season vs playoff matchups
        // Use settings if available, otherwise default based on year
        // ESPN changed regular season length over time: typically 13-14 weeks
        let regularSeasonWeeks = settings.regularSeasonMatchupPeriods;
        if (!regularSeasonWeeks) {
            // Default regular season lengths by era
            if (year <= 2020) {
                regularSeasonWeeks = 13; // Most leagues had 13-week regular seasons
            } else {
                regularSeasonWeeks = 14; // NFL expanded to 17 games in 2021
            }
        }

        const regularMatchups = matchups.filter(m => {
            // If playoffTierType exists and is set, trust it
            if (m.playoffTierType) return false;
            // Otherwise use week number
            return m.matchupPeriodId <= regularSeasonWeeks;
        }).map(m => ({ ...m, isPlayoffGame: false }));

        const playoffMatchups = matchups.filter(m => {
            // If playoffTierType exists, it's definitely a playoff game
            if (m.playoffTierType) return true;
            // Otherwise check week number
            return m.matchupPeriodId > regularSeasonWeeks;
        }).map(m => ({ ...m, isPlayoffGame: true }));

        // Find champion and championship game participants
        let champion = null;
        let championshipParticipants = []; // Both teams in championship game

        // Method 1: Look for team with rankCalculatedFinal === 1 (the champion)
        const championTeam = teams.find(t => t.rankCalculatedFinal === 1);
        if (championTeam) {
            champion = championTeam.id;
            console.log(`${year} Champion (by rank): ${championTeam.name} (Team ${championTeam.id})`);
        }

        // Method 2: Find the championship game winner (WINNERS_BRACKET final)
        if (playoffMatchups.length > 0) {
            // Look for the final championship matchup
            const championshipGames = playoffMatchups.filter(m =>
                m.playoffTierType === 'WINNERS_BRACKET'
            );

            if (championshipGames.length > 0) {
                // Get the last championship bracket game (the final)
                const lastWeek = Math.max(...championshipGames.map(m => m.matchupPeriodId));
                const championship = championshipGames.find(m => m.matchupPeriodId === lastWeek);

                if (championship) {
                    // Track both participants in the championship game
                    championshipParticipants = [championship.homeTeamId, championship.awayTeamId];

                    if (!champion && championship.homeScore !== championship.awayScore) {
                        champion = championship.homeScore > championship.awayScore
                            ? championship.homeTeamId
                            : championship.awayTeamId;
                        console.log(`${year} Champion (by game): Team ${champion}`);
                    }
                }
            }
        }

        // If we found a champion but no championship participants, add the champion and runner-up by rank
        if (champion && championshipParticipants.length === 0) {
            const runnerUp = teams.find(t => t.rankCalculatedFinal === 2);
            if (runnerUp) {
                championshipParticipants = [champion, runnerUp.id];
            } else {
                championshipParticipants = [champion];
            }
        }

        // Method 3: Fallback to best playoff seed
        if (!champion) {
            const sortedTeams = [...teams].sort((a, b) => {
                if (a.playoffSeed && b.playoffSeed) {
                    return a.playoffSeed - b.playoffSeed;
                }
                return (b.record.wins - b.record.losses) - (a.record.wins - a.record.losses);
            });
            champion = sortedTeams[0]?.id;
            console.log(`${year} Champion (fallback): Team ${champion}`);
        }

        return {
            year,
            teams,
            matchups: regularMatchups,
            playoffMatchups,
            settings,
            champion,
            championshipParticipants,
            standings: teams.sort((a, b) => {
                const aWinPct = a.record.wins / (a.record.wins + a.record.losses) || 0;
                const bWinPct = b.record.wins / (b.record.wins + b.record.losses) || 0;
                if (bWinPct !== aWinPct) return bWinPct - aWinPct;
                return b.record.pointsFor - a.record.pointsFor;
            })
        };
    }

    /**
     * Merge season stats into aggregate stats
     */
    mergeSeasonStats(aggregate, seasonStats, year) {
        // Add season summary
        aggregate.seasonSummaries.push({
            year,
            champion: seasonStats.champion,
            championName: this.getTeamName(seasonStats.champion),
            standings: seasonStats.standings,
            settings: seasonStats.settings
        });

        // Add champion
        if (seasonStats.champion) {
            aggregate.champions.push({
                year,
                teamId: seasonStats.champion,
                teamName: this.getTeamName(seasonStats.champion)
            });
        }

        // Process each team's season
        for (const team of seasonStats.teams) {
            const teamId = team.id;

            // Career records
            if (!aggregate.careerRecords.has(teamId)) {
                aggregate.careerRecords.set(teamId, {
                    teamId,
                    teamName: this.getTeamName(teamId),
                    wins: 0,
                    losses: 0,
                    ties: 0,
                    pointsFor: 0,
                    pointsAgainst: 0,
                    championships: 0,
                    championshipAppearances: 0,
                    playoffAppearances: 0,
                    seasonsPlayed: 0
                });
            }

            const career = aggregate.careerRecords.get(teamId);
            career.wins += team.record.wins;
            career.losses += team.record.losses;
            career.ties += team.record.ties || 0;
            career.pointsFor += team.record.pointsFor;
            career.pointsAgainst += team.record.pointsAgainst;
            career.seasonsPlayed++;

            if (seasonStats.champion === teamId) {
                career.championships++;
            }

            // Track championship game appearances
            if (seasonStats.championshipParticipants && seasonStats.championshipParticipants.includes(teamId)) {
                career.championshipAppearances++;
            }

            if (team.playoffSeed && team.playoffSeed <= (seasonStats.settings.playoffTeamCount || 6)) {
                career.playoffAppearances++;
            }
        }

        // Process matchups
        for (const matchup of [...seasonStats.matchups, ...seasonStats.playoffMatchups]) {
            // Add to all matchups
            aggregate.allMatchups.push({
                ...matchup,
                year,
                homeTeamName: this.getTeamName(matchup.homeTeamId),
                awayTeamName: this.getTeamName(matchup.awayTeamId)
            });

            // Track high scores - use isPlayoffGame flag we set, or fall back to playoffTierType
            const isPlayoff = matchup.isPlayoffGame !== undefined ? matchup.isPlayoffGame : !!matchup.playoffTierType;

            aggregate.highScores.push({
                teamId: matchup.homeTeamId,
                teamName: this.getTeamName(matchup.homeTeamId),
                score: matchup.homeScore,
                opponent: this.getTeamName(matchup.awayTeamId),
                opponentScore: matchup.awayScore,
                year,
                week: matchup.matchupPeriodId,
                isPlayoff
            });

            aggregate.highScores.push({
                teamId: matchup.awayTeamId,
                teamName: this.getTeamName(matchup.awayTeamId),
                score: matchup.awayScore,
                opponent: this.getTeamName(matchup.homeTeamId),
                opponentScore: matchup.homeScore,
                year,
                week: matchup.matchupPeriodId,
                isPlayoff
            });

            // Update H2H records
            const winner = matchup.homeScore > matchup.awayScore ? matchup.homeTeamId : matchup.awayTeamId;
            const loser = matchup.homeScore > matchup.awayScore ? matchup.awayTeamId : matchup.homeTeamId;

            const h2hKey = [matchup.homeTeamId, matchup.awayTeamId].sort().join('-');
            if (!aggregate.h2hRecords.has(h2hKey)) {
                aggregate.h2hRecords.set(h2hKey, {
                    team1: Math.min(matchup.homeTeamId, matchup.awayTeamId),
                    team2: Math.max(matchup.homeTeamId, matchup.awayTeamId),
                    team1Wins: 0,
                    team2Wins: 0,
                    ties: 0,
                    matchups: []
                });
            }

            const h2h = aggregate.h2hRecords.get(h2hKey);
            if (matchup.homeScore === matchup.awayScore) {
                h2h.ties++;
            } else if (winner === h2h.team1) {
                h2h.team1Wins++;
            } else {
                h2h.team2Wins++;
            }
            h2h.matchups.push({
                year,
                week: matchup.matchupPeriodId,
                team1Score: matchup.homeTeamId === h2h.team1 ? matchup.homeScore : matchup.awayScore,
                team2Score: matchup.homeTeamId === h2h.team2 ? matchup.homeScore : matchup.awayScore,
                isPlayoff
            });
        }
    }

    /**
     * Calculate career leaders
     */
    calculateCareerLeaders(stats) {
        const records = Array.from(stats.careerRecords.values());

        return {
            // Career wins with win % included - show all 12 teams
            mostWins: [...records]
                .map(r => ({
                    ...r,
                    winPct: r.wins / (r.wins + r.losses + r.ties) || 0
                }))
                .sort((a, b) => b.wins - a.wins)
                .slice(0, 12),
            // Championships - show all teams that have won
            mostChampionships: [...records]
                .sort((a, b) => b.championships - a.championships)
                .slice(0, 12),
            // Championship appearances - show all 12 teams
            mostChampionshipAppearances: [...records]
                .sort((a, b) => b.championshipAppearances - a.championshipAppearances)
                .slice(0, 12),
            // Playoff appearances - show all 12 teams
            mostPlayoffs: [...records]
                .sort((a, b) => b.playoffAppearances - a.playoffAppearances)
                .slice(0, 12),
            mostPointsFor: [...records].sort((a, b) => b.pointsFor - a.pointsFor).slice(0, 10),
            avgPointsPerGame: [...records]
                .filter(r => r.wins + r.losses >= 10)
                .map(r => ({
                    ...r,
                    avgPPG: r.pointsFor / (r.wins + r.losses + r.ties)
                }))
                .sort((a, b) => b.avgPPG - a.avgPPG)
                .slice(0, 10)
        };
    }

    /**
     * Calculate record book entries
     */
    calculateRecordBook(stats) {
        // Filter high scores: 2015 and earlier = weeks 1-12 only, 2016+ = all weeks
        const filteredHighScores = stats.highScores.filter(s => {
            if (s.year <= 2015) {
                return s.week <= 12;
            }
            return true; // Include all games from 2016 onwards
        });

        const sortedScores = [...filteredHighScores].sort((a, b) => b.score - a.score);
        const sortedLowScores = [...filteredHighScores].sort((a, b) => a.score - b.score);

        // Calculate margins
        const margins = stats.allMatchups.map(m => ({
            ...m,
            margin: Math.abs(m.homeScore - m.awayScore),
            winner: m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId,
            winnerName: m.homeScore > m.awayScore ? m.homeTeamName : m.awayTeamName,
            loser: m.homeScore > m.awayScore ? m.awayTeamId : m.homeTeamId,
            loserName: m.homeScore > m.awayScore ? m.awayTeamName : m.homeTeamName,
            winnerScore: Math.max(m.homeScore, m.awayScore),
            loserScore: Math.min(m.homeScore, m.awayScore)
        }));

        const blowouts = [...margins].sort((a, b) => b.margin - a.margin);
        const closeGames = [...margins].sort((a, b) => a.margin - b.margin);

        // Calculate streaks
        const streaks = this.calculateStreaks(stats);

        return {
            highestScore: sortedScores.slice(0, 10),
            lowestScore: sortedLowScores.slice(0, 10),
            biggestBlowout: blowouts.slice(0, 10),
            closestGame: closeGames.slice(0, 10),
            longestWinStreak: streaks.win.slice(0, 10),
            longestLosingStreak: streaks.loss.slice(0, 10),
            highestScoringGame: margins
                .map(m => ({
                    ...m,
                    totalPoints: m.homeScore + m.awayScore
                }))
                .sort((a, b) => b.totalPoints - a.totalPoints)
                .slice(0, 10)
        };
    }

    /**
     * Calculate win/loss streaks
     */
    calculateStreaks(stats) {
        const teamMatchups = new Map();

        // Group matchups by team and sort chronologically
        for (const matchup of stats.allMatchups) {
            for (const teamId of [matchup.homeTeamId, matchup.awayTeamId]) {
                if (!teamMatchups.has(teamId)) {
                    teamMatchups.set(teamId, []);
                }
                const isHome = teamId === matchup.homeTeamId;
                const myScore = isHome ? matchup.homeScore : matchup.awayScore;
                const theirScore = isHome ? matchup.awayScore : matchup.homeScore;

                teamMatchups.get(teamId).push({
                    year: matchup.year,
                    week: matchup.matchupPeriodId,
                    won: myScore > theirScore,
                    score: myScore,
                    opponentScore: theirScore
                });
            }
        }

        const winStreaks = [];
        const lossStreaks = [];

        for (const [teamId, matches] of teamMatchups) {
            // Sort by year then week
            matches.sort((a, b) => a.year - b.year || a.week - b.week);

            let currentWinStreak = 0;
            let currentLossStreak = 0;
            let maxWinStreak = { length: 0, start: null, end: null };
            let maxLossStreak = { length: 0, start: null, end: null };
            let streakStart = null;

            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];

                if (match.won) {
                    if (currentWinStreak === 0) {
                        streakStart = { year: match.year, week: match.week };
                    }
                    currentWinStreak++;
                    currentLossStreak = 0;

                    if (currentWinStreak > maxWinStreak.length) {
                        maxWinStreak = {
                            length: currentWinStreak,
                            start: { ...streakStart },
                            end: { year: match.year, week: match.week }
                        };
                    }
                } else {
                    if (currentLossStreak === 0) {
                        streakStart = { year: match.year, week: match.week };
                    }
                    currentLossStreak++;
                    currentWinStreak = 0;

                    if (currentLossStreak > maxLossStreak.length) {
                        maxLossStreak = {
                            length: currentLossStreak,
                            start: { ...streakStart },
                            end: { year: match.year, week: match.week }
                        };
                    }
                }
            }

            if (maxWinStreak.length > 0) {
                winStreaks.push({
                    teamId,
                    teamName: this.getTeamName(teamId),
                    ...maxWinStreak
                });
            }

            if (maxLossStreak.length > 0) {
                lossStreaks.push({
                    teamId,
                    teamName: this.getTeamName(teamId),
                    ...maxLossStreak
                });
            }
        }

        return {
            win: winStreaks.sort((a, b) => b.length - a.length),
            loss: lossStreaks.sort((a, b) => b.length - a.length)
        };
    }

    /**
     * Calculate head-to-head matrix
     */
    calculateH2HMatrix(stats) {
        const teams = Array.from(stats.careerRecords.keys());
        const matrix = {};

        for (const team1 of teams) {
            matrix[team1] = {};
            for (const team2 of teams) {
                if (team1 === team2) {
                    matrix[team1][team2] = null;
                    continue;
                }

                const key = [team1, team2].sort().join('-');
                const record = stats.h2hRecords.get(key);

                if (record) {
                    const wins = team1 === record.team1 ? record.team1Wins : record.team2Wins;
                    const losses = team1 === record.team1 ? record.team2Wins : record.team1Wins;
                    matrix[team1][team2] = {
                        wins,
                        losses,
                        ties: record.ties,
                        matchups: record.matchups
                    };
                } else {
                    matrix[team1][team2] = { wins: 0, losses: 0, ties: 0, matchups: [] };
                }
            }
        }

        return matrix;
    }

    /**
     * Get head-to-head details between two teams
     */
    getH2HDetails(team1Id, team2Id) {
        if (!this.aggregatedStats) return null;

        const key = [team1Id, team2Id].sort().join('-');
        const record = this.aggregatedStats.h2hRecords.get(key);

        if (!record) {
            return {
                team1: { id: team1Id, name: this.getTeamName(team1Id), wins: 0 },
                team2: { id: team2Id, name: this.getTeamName(team2Id), wins: 0 },
                ties: 0,
                matchups: []
            };
        }

        const isTeam1First = team1Id === record.team1;

        return {
            team1: {
                id: team1Id,
                name: this.getTeamName(team1Id),
                wins: isTeam1First ? record.team1Wins : record.team2Wins
            },
            team2: {
                id: team2Id,
                name: this.getTeamName(team2Id),
                wins: isTeam1First ? record.team2Wins : record.team1Wins
            },
            ties: record.ties,
            matchups: record.matchups.map(m => ({
                year: m.year,
                week: m.week,
                team1Score: isTeam1First ? m.team1Score : m.team2Score,
                team2Score: isTeam1First ? m.team2Score : m.team1Score,
                isPlayoff: m.isPlayoff
            }))
        };
    }

    /**
     * Get season details
     */
    getSeasonDetails(year) {
        const summary = this.aggregatedStats?.seasonSummaries.find(s => s.year === year);
        if (!summary) return null;

        const seasonMatchups = this.aggregatedStats.allMatchups.filter(m => m.year === year);

        return {
            ...summary,
            matchupsByWeek: this.groupMatchupsByWeek(seasonMatchups),
            seasonHighScore: seasonMatchups.reduce((max, m) => {
                const high = Math.max(m.homeScore, m.awayScore);
                return high > max.score ? {
                    score: high,
                    teamId: m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId,
                    teamName: m.homeScore > m.awayScore ? m.homeTeamName : m.awayTeamName,
                    week: m.matchupPeriodId
                } : max;
            }, { score: 0 })
        };
    }

    /**
     * Group matchups by week
     */
    groupMatchupsByWeek(matchups) {
        const weeks = {};
        for (const m of matchups) {
            if (!weeks[m.matchupPeriodId]) {
                weeks[m.matchupPeriodId] = [];
            }
            weeks[m.matchupPeriodId].push(m);
        }
        return weeks;
    }

    /**
     * Get list of all teams
     */
    getAllTeams() {
        return Array.from(this.teamNameMap.entries()).map(([id, info]) => ({
            id,
            name: info.name,
            abbrev: info.abbrev
        }));
    }

    /**
     * Get list of all seasons
     */
    getAllSeasons() {
        return Object.keys(this.allSeasonData)
            .filter(y => !this.allSeasonData[y].error)
            .map(y => parseInt(y))
            .sort((a, b) => b - a);
    }

    // Cache version - increment this when data structure changes to invalidate old cache
    static CACHE_VERSION = 3;

    /**
     * Save aggregated stats to localStorage
     */
    saveToStorage() {
        if (typeof localStorage !== 'undefined') {
            try {
                // Convert Maps to objects for JSON serialization
                const serializable = {
                    allSeasonData: this.allSeasonData,
                    teamNameMap: Object.fromEntries(this.teamNameMap),
                    timestamp: Date.now(),
                    cacheVersion: StatsEngine.CACHE_VERSION
                };
                localStorage.setItem('fantasy_league_data', JSON.stringify(serializable));
                return true;
            } catch (e) {
                console.error('Failed to save to localStorage:', e);
                return false;
            }
        }
        return false;
    }

    /**
     * Load from localStorage
     */
    loadFromStorage() {
        if (typeof localStorage !== 'undefined') {
            try {
                const saved = localStorage.getItem('fantasy_league_data');
                if (saved) {
                    const data = JSON.parse(saved);
                    // Check cache version - if outdated, return false to trigger fresh fetch
                    if (data.cacheVersion !== StatsEngine.CACHE_VERSION) {
                        console.log('Cache version mismatch, fetching fresh data...');
                        this.clearStorage();
                        return false;
                    }
                    this.allSeasonData = data.allSeasonData;
                    this.teamNameMap = new Map(Object.entries(data.teamNameMap));
                    this.aggregatedStats = this.aggregateAllStats();
                    return true;
                }
            } catch (e) {
                console.error('Failed to load from localStorage:', e);
            }
        }
        return false;
    }

    /**
     * Clear stored data
     */
    clearStorage() {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('fantasy_league_data');
            localStorage.removeItem('espn_last_fetch');
        }
        this.allSeasonData = {};
        this.aggregatedStats = null;
        this.teamNameMap.clear();
        this.ownerHistory.clear();
    }
}

// Create singleton instance
const statsEngine = new StatsEngine();

if (typeof window !== 'undefined') {
    window.statsEngine = statsEngine;
}
