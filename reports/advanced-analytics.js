/**
 * Advanced Fantasy Football Analytics Module
 *
 * This module provides deep statistical analysis including:
 * 1. Luck Analysis - Monte Carlo simulation of alternative matchup outcomes
 * 2. Consistency Metrics - Scoring volatility and reliability rankings
 * 3. Close Game Performance - Clutch factor in tight matchups
 * 4. Strength of Schedule - Opponent quality analysis
 *
 * Designed to be portable to the main app once finalized.
 */

class AdvancedAnalytics {
    constructor(leagueData, options = {}) {
        this.rawData = leagueData;
        this.seasons = {};
        this.allMatchups = [];
        this.teamRegistry = new Map(); // teamId -> team info (per season)
        this.ownerRegistry = new Map(); // ownerId -> owner name
        this.teamToOwner = new Map(); // "year-teamId" -> ownerId
        this.ownerNames = new Map(); // ownerId -> display name
        this.weeklyScores = {}; // year -> week -> teamId -> score
        this.regularSeasonWeeks = {}; // year -> Set of regular season week numbers

        // Configuration
        this.minYear = options.minYear || 2011;

        // Co-owner mappings: combine these owner IDs into a single entity
        // Trevor Rawls & Sam Herting share a team
        this.coOwnerMappings = {
            '{961895BA-00CF-4DC9-8A38-61A2924B6643}': '{CE0D2B52-E1CA-40D4-8D2B-52E1CAD0D43A}' // Sam -> Trevor (combined)
        };
        this.coOwnerDisplayName = {
            '{CE0D2B52-E1CA-40D4-8D2B-52E1CAD0D43A}': 'Trevor Rawls & Sam Herting'
        };

        // Track current owners (from most recent season)
        this.currentOwnerIds = new Set();

        this.parseData();
        this.identifyCurrentOwners();
    }

    /**
     * Identify current owners from the most recent season
     */
    identifyCurrentOwners() {
        const years = Object.keys(this.seasons).map(Number).sort((a, b) => b - a);
        for (const year of years) {
            const season = this.seasons[year];
            if (season && season.teams && season.teams.length > 0) {
                season.teams.forEach(t => {
                    if (t.owners) {
                        t.owners.forEach(id => {
                            // Use canonical ID for co-owners
                            const canonicalId = this.getCanonicalOwnerId(id);
                            this.currentOwnerIds.add(canonicalId);
                        });
                    }
                });
                break; // Only process most recent valid season
            }
        }
    }

    /**
     * Check if an owner ID is a current owner
     */
    isCurrentOwner(ownerId) {
        const canonicalId = this.getCanonicalOwnerId(ownerId);
        return this.currentOwnerIds.has(canonicalId);
    }

    /**
     * Get the canonical owner ID (handles co-owner mappings)
     */
    getCanonicalOwnerId(ownerId) {
        return this.coOwnerMappings[ownerId] || ownerId;
    }

    /**
     * Parse the raw ESPN data into usable structures
     */
    parseData() {
        for (const [yearStr, seasonData] of Object.entries(this.rawData.seasons)) {
            if (seasonData.error) continue;

            const year = parseInt(yearStr);

            // Skip seasons before minYear
            if (year < this.minYear) continue;
            const teams = seasonData.teams || [];
            const schedule = seasonData.schedule || [];
            const members = seasonData.members || [];

            // Build member lookup for this season
            const memberLookup = new Map();
            members.forEach(m => {
                const name = this.formatOwnerName(m.firstName, m.lastName);
                memberLookup.set(m.id, name);
                // Store in global owner registry
                if (!this.ownerNames.has(m.id)) {
                    this.ownerNames.set(m.id, name);
                }
            });

            // Register teams and map to owners
            teams.forEach(team => {
                const teamId = team.id;
                const teamName = team.name || team.location + ' ' + team.nickname || `Team ${teamId}`;
                const abbrev = team.abbrev || teamName.substring(0, 4).toUpperCase();
                const ownerIds = team.owners || [];
                const primaryOwnerId = ownerIds[0] || null;

                // Store team info with year context
                const teamKey = `${year}-${teamId}`;
                this.teamRegistry.set(teamKey, {
                    id: teamId,
                    year: year,
                    name: teamName,
                    abbrev: abbrev,
                    ownerId: primaryOwnerId,
                    ownerName: primaryOwnerId ? (memberLookup.get(primaryOwnerId) || 'Unknown Owner') : 'Unknown Owner'
                });

                // Map team to owner for this year
                if (primaryOwnerId) {
                    this.teamToOwner.set(teamKey, primaryOwnerId);
                }
            });

            // Initialize weekly scores structure
            if (!this.weeklyScores[year]) {
                this.weeklyScores[year] = {};
            }
            if (!this.regularSeasonWeeks[year]) {
                this.regularSeasonWeeks[year] = new Set();
            }

            // Parse matchups
            const seasonMatchups = [];
            schedule.forEach(matchup => {
                if (matchup.away && matchup.home &&
                    matchup.away.totalPoints !== undefined &&
                    matchup.home.totalPoints !== undefined) {

                    const week = matchup.matchupPeriodId;
                    const isPlayoff = matchup.playoffTierType !== undefined &&
                                     matchup.playoffTierType !== 'NONE';

                    // Track regular season weeks
                    if (!isPlayoff) {
                        this.regularSeasonWeeks[year].add(week);
                    }

                    // Store weekly scores
                    if (!this.weeklyScores[year][week]) {
                        this.weeklyScores[year][week] = {};
                    }
                    this.weeklyScores[year][week][matchup.home.teamId] = matchup.home.totalPoints;
                    this.weeklyScores[year][week][matchup.away.teamId] = matchup.away.totalPoints;

                    const matchupData = {
                        year,
                        week,
                        isPlayoff,
                        homeTeamId: matchup.home.teamId,
                        awayTeamId: matchup.away.teamId,
                        homeScore: matchup.home.totalPoints,
                        awayScore: matchup.away.totalPoints,
                        margin: Math.abs(matchup.home.totalPoints - matchup.away.totalPoints),
                        winnerId: matchup.home.totalPoints > matchup.away.totalPoints ?
                                  matchup.home.teamId : matchup.away.teamId,
                        loserId: matchup.home.totalPoints > matchup.away.totalPoints ?
                                 matchup.away.teamId : matchup.home.teamId
                    };

                    seasonMatchups.push(matchupData);
                    this.allMatchups.push(matchupData);
                }
            });

            this.seasons[year] = {
                teams,
                members,
                matchups: seasonMatchups,
                standings: teams.map(t => ({
                    teamId: t.id,
                    wins: t.record?.overall?.wins || 0,
                    losses: t.record?.overall?.losses || 0,
                    pointsFor: t.record?.overall?.pointsFor || 0,
                    pointsAgainst: t.record?.overall?.pointsAgainst || 0
                })).sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
            };
        }
    }

    /**
     * Format owner name as "FirstName L." (first name + last initial)
     */
    formatOwnerName(firstName, lastName) {
        const capitalize = (str) => {
            if (!str) return '';
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        };
        const first = capitalize(firstName);
        const lastInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';
        return `${first} ${lastInitial}`.trim();
    }

    /**
     * Get team name by ID and year
     */
    getTeamName(teamId, year = null) {
        if (year) {
            const teamKey = `${year}-${teamId}`;
            const team = this.teamRegistry.get(teamKey);
            if (team) {
                return `${team.name} (${team.ownerName})`;
            }
        }
        // Fallback: find any team with this ID
        for (const [key, team] of this.teamRegistry) {
            if (team.id === teamId) {
                return team.name;
            }
        }
        return `Team ${teamId}`;
    }

    /**
     * Get owner name for a team in a specific year
     */
    getOwnerName(teamId, year) {
        const teamKey = `${year}-${teamId}`;
        const team = this.teamRegistry.get(teamKey);
        return team ? team.ownerName : 'Unknown Owner';
    }

    /**
     * Get owner name by owner ID
     */
    getOwnerNameById(ownerId) {
        // Check for co-owner display name first
        const canonicalId = this.getCanonicalOwnerId(ownerId);
        if (this.coOwnerDisplayName[canonicalId]) {
            return this.coOwnerDisplayName[canonicalId];
        }
        return this.ownerNames.get(canonicalId) || 'Unknown Owner';
    }

    /**
     * Get the primary owner ID for a team in a year (returns canonical ID for co-owners)
     */
    getOwnerId(teamId, year) {
        const teamKey = `${year}-${teamId}`;
        const ownerId = this.teamToOwner.get(teamKey) || null;
        // Return canonical owner ID (handles co-owner mappings)
        return ownerId ? this.getCanonicalOwnerId(ownerId) : null;
    }

    // ========================================
    // 1. LUCK ANALYSIS - Monte Carlo Simulation
    // ========================================

    /**
     * Calculate expected wins using all-play record
     * (How many wins would you have if you played everyone each week?)
     * Groups by OWNER for all-time stats
     *
     * IMPORTANT: Calculations include ALL teams/owners (including past owners)
     * to ensure expected wins properly balance with actual wins.
     * Filtering to current owners only happens when displaying results.
     */
    calculateAllPlayRecord(year = null) {
        // For single year, use teamId; for all-time, aggregate by ownerId
        const results = new Map(); // key -> { expectedWins, actualWins, totalGames, seasons }

        const yearsToProcess = year ? [year] : Object.keys(this.weeklyScores).map(Number);

        yearsToProcess.forEach(yr => {
            const weeks = this.weeklyScores[yr];
            if (!weeks) return;

            // Only process regular season weeks (not playoffs)
            const regularWeeks = this.regularSeasonWeeks[yr] || new Set();

            Object.entries(weeks).forEach(([week, scores]) => {
                const weekNum = parseInt(week);
                // Skip playoff weeks - only count regular season for luck calculation
                if (!regularWeeks.has(weekNum)) return;

                // Include ALL teams in calculations (not filtered to current owners)
                const teamIds = Object.keys(scores).map(Number);
                const numTeams = teamIds.length;
                if (numTeams < 2) return; // Need at least 2 teams

                teamIds.forEach(teamId => {
                    const myScore = scores[teamId];
                    let winsThisWeek = 0;

                    // Count wins against ALL teams
                    teamIds.forEach(oppId => {
                        if (oppId !== teamId && myScore > scores[oppId]) {
                            winsThisWeek++;
                        }
                    });

                    // Expected wins = wins / possible opponents
                    const expectedWinsThisWeek = winsThisWeek / (numTeams - 1);

                    // Use ownerId for all-time, teamId for single year
                    const key = year ? teamId : (this.getOwnerId(teamId, yr) || `team-${teamId}`);

                    if (!results.has(key)) {
                        results.set(key, {
                            expectedWins: 0,
                            actualWins: 0,
                            totalWeeks: 0,
                            allPlayWins: 0,
                            allPlayLosses: 0,
                            seasons: new Set(),
                            teamIds: new Set(),
                            years: new Set()
                        });
                    }

                    const record = results.get(key);
                    record.expectedWins += expectedWinsThisWeek;
                    record.allPlayWins += winsThisWeek;
                    record.allPlayLosses += (numTeams - 1 - winsThisWeek);
                    record.totalWeeks++;
                    record.seasons.add(yr);
                    record.teamIds.add(teamId);
                    record.years.add(yr);
                });
            });
        });

        // Add actual wins from matchups (include ALL matchups for correct balance)
        const matchupsToUse = year ?
            this.allMatchups.filter(m => m.year === year && !m.isPlayoff) :
            this.allMatchups.filter(m => !m.isPlayoff);

        matchupsToUse.forEach(m => {
            const key = year ? m.winnerId : (this.getOwnerId(m.winnerId, m.year) || `team-${m.winnerId}`);
            if (results.has(key)) {
                results.get(key).actualWins++;
            }
        });

        return results;
    }

    /**
     * Calculate luck scores for all teams/owners
     */
    calculateLuckScores(year = null) {
        const allPlayRecords = this.calculateAllPlayRecord(year);
        const luckScores = [];

        allPlayRecords.forEach((record, key) => {
            // For all-time stats, only include current owners
            if (!year && !this.isCurrentOwner(key)) {
                return;
            }

            const luck = record.actualWins - record.expectedWins;
            const luckPerSeason = luck / record.seasons.size;

            // Determine display name
            let displayName;
            if (year) {
                // For single year, show team name with owner
                displayName = this.getTeamName(key, year);
            } else {
                // For all-time, show owner name
                if (typeof key === 'string' && key.startsWith('team-')) {
                    // Fallback for teams without owner mapping
                    const teamId = parseInt(key.replace('team-', ''));
                    displayName = this.getTeamName(teamId);
                } else {
                    displayName = this.getOwnerNameById(key);
                }
            }

            luckScores.push({
                key,
                displayName,
                actualWins: record.actualWins,
                expectedWins: parseFloat(record.expectedWins.toFixed(2)),
                luckScore: parseFloat(luck.toFixed(2)),
                luckPerSeason: parseFloat(luckPerSeason.toFixed(2)),
                allPlayRecord: `${record.allPlayWins}-${record.allPlayLosses}`,
                allPlayWinPct: parseFloat((record.allPlayWins / (record.allPlayWins + record.allPlayLosses) * 100).toFixed(1)),
                seasonsPlayed: record.seasons.size
            });
        });

        // Sort by luck score (most unlucky first for drama)
        return luckScores.sort((a, b) => a.luckScore - b.luckScore);
    }

    /**
     * Get season-by-season luck breakdown
     */
    getSeasonLuckBreakdown() {
        const years = Object.keys(this.seasons).map(Number).sort();
        const breakdown = [];

        years.forEach(year => {
            const yearLuck = this.calculateLuckScores(year);
            breakdown.push({
                year,
                luckiest: yearLuck[yearLuck.length - 1],
                unluckiest: yearLuck[0],
                allTeams: yearLuck
            });
        });

        return breakdown;
    }

    // ========================================
    // 2. CONSISTENCY METRICS
    // ========================================

    /**
     * Calculate scoring consistency for each team/owner
     * Calculations include all teams; filtering to current owners happens at display time.
     */
    calculateConsistencyMetrics(year = null) {
        const teamScores = new Map(); // key -> [scores]

        const yearsToProcess = year ? [year] : Object.keys(this.weeklyScores).map(Number);

        yearsToProcess.forEach(yr => {
            const weeks = this.weeklyScores[yr];
            if (!weeks) return;

            Object.entries(weeks).forEach(([week, scores]) => {
                Object.entries(scores).forEach(([teamId, score]) => {
                    const id = parseInt(teamId);
                    // Use ownerId for all-time, teamId for single year
                    const key = year ? id : (this.getOwnerId(id, yr) || `team-${id}`);

                    if (!teamScores.has(key)) {
                        teamScores.set(key, { scores: [], years: new Set() });
                    }
                    teamScores.get(key).scores.push(score);
                    teamScores.get(key).years.add(yr);
                });
            });
        });

        const metrics = [];

        teamScores.forEach((data, key) => {
            // For all-time stats, only DISPLAY current owners (calculations included everyone)
            if (!year && !this.isCurrentOwner(key)) {
                return;
            }

            const scores = data.scores;
            if (scores.length < 3) return; // Need enough data

            const sorted = [...scores].sort((a, b) => a - b);
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
            const stdDev = Math.sqrt(variance);
            const coefficientOfVariation = (stdDev / avg) * 100;

            // Floor (10th percentile) and Ceiling (90th percentile)
            const floorIndex = Math.floor(scores.length * 0.1);
            const ceilingIndex = Math.floor(scores.length * 0.9);
            const floor = sorted[floorIndex];
            const ceiling = sorted[ceilingIndex];

            // Boom/Bust counts (>120% avg = boom, <80% avg = bust)
            const boomThreshold = avg * 1.2;
            const bustThreshold = avg * 0.8;
            const booms = scores.filter(s => s >= boomThreshold).length;
            const busts = scores.filter(s => s <= bustThreshold).length;

            // Determine display name
            let displayName;
            if (year) {
                displayName = this.getTeamName(key, year);
            } else {
                if (typeof key === 'string' && key.startsWith('team-')) {
                    const teamId = parseInt(key.replace('team-', ''));
                    displayName = this.getTeamName(teamId);
                } else {
                    displayName = this.getOwnerNameById(key);
                }
            }

            metrics.push({
                key,
                displayName,
                gamesPlayed: scores.length,
                avgScore: parseFloat(avg.toFixed(2)),
                stdDev: parseFloat(stdDev.toFixed(2)),
                coefficientOfVariation: parseFloat(coefficientOfVariation.toFixed(1)),
                floor: parseFloat(floor.toFixed(2)),
                ceiling: parseFloat(ceiling.toFixed(2)),
                range: parseFloat((ceiling - floor).toFixed(2)),
                boomGames: booms,
                bustGames: busts,
                boomRate: parseFloat((booms / scores.length * 100).toFixed(1)),
                bustRate: parseFloat((busts / scores.length * 100).toFixed(1)),
                highScore: Math.max(...scores),
                lowScore: Math.min(...scores),
                seasonsPlayed: data.years.size
            });
        });

        // Sort by consistency (lowest CV = most consistent)
        return metrics.sort((a, b) => a.coefficientOfVariation - b.coefficientOfVariation);
    }

    // ========================================
    // 3. CLOSE GAME PERFORMANCE
    // ========================================

    /**
     * Analyze performance in close games and blowouts
     * Calculations include all teams; filtering to current owners happens at display time.
     * @param closeThreshold - margin <= this is a "close game" (default 5)
     * @param blowoutThreshold - margin > this is a "blowout" (default 30)
     */
    calculateCloseGamePerformance(closeThreshold = 5, blowoutThreshold = 30, year = null) {
        const stats = new Map(); // key -> stats

        // Include ALL matchups in calculations
        const matchupsToUse = year ?
            this.allMatchups.filter(m => m.year === year && !m.isPlayoff) :
            this.allMatchups.filter(m => !m.isPlayoff);

        matchupsToUse.forEach(m => {
            const isCloseGame = m.margin <= closeThreshold;
            const isBlowout = m.margin > blowoutThreshold;

            [m.winnerId, m.loserId].forEach(teamId => {
                const key = year ? teamId : (this.getOwnerId(teamId, m.year) || `team-${teamId}`);

                if (!stats.has(key)) {
                    stats.set(key, {
                        closeWins: 0,
                        closeLosses: 0,
                        blowoutWins: 0,
                        blowoutLosses: 0,
                        totalCloseGames: 0,
                        avgMarginInWins: [],
                        avgMarginInLosses: [],
                        years: new Set()
                    });
                }
                stats.get(key).years.add(m.year);
            });

            const winnerKey = year ? m.winnerId : (this.getOwnerId(m.winnerId, m.year) || `team-${m.winnerId}`);
            const loserKey = year ? m.loserId : (this.getOwnerId(m.loserId, m.year) || `team-${m.loserId}`);

            const winnerStats = stats.get(winnerKey);
            const loserStats = stats.get(loserKey);

            if (isCloseGame) {
                winnerStats.closeWins++;
                winnerStats.totalCloseGames++;
                loserStats.closeLosses++;
                loserStats.totalCloseGames++;
            }
            if (isBlowout) {
                winnerStats.blowoutWins++;
                loserStats.blowoutLosses++;
            }

            winnerStats.avgMarginInWins.push(m.margin);
            loserStats.avgMarginInLosses.push(m.margin);
        });

        const results = [];

        stats.forEach((data, key) => {
            // For all-time stats, only DISPLAY current owners (calculations included everyone)
            if (!year && !this.isCurrentOwner(key)) {
                return;
            }

            const closeWinPct = data.totalCloseGames > 0 ?
                (data.closeWins / data.totalCloseGames * 100) : 0;

            const avgWinMargin = data.avgMarginInWins.length > 0 ?
                data.avgMarginInWins.reduce((a, b) => a + b, 0) / data.avgMarginInWins.length : 0;

            const avgLossMargin = data.avgMarginInLosses.length > 0 ?
                data.avgMarginInLosses.reduce((a, b) => a + b, 0) / data.avgMarginInLosses.length : 0;

            // Clutch factor: close game win % compared to overall win %
            const totalWins = data.closeWins + data.blowoutWins;
            const totalLosses = data.closeLosses + data.blowoutLosses;
            const overallWinPct = (totalWins / (totalWins + totalLosses)) * 100;
            const clutchFactor = closeWinPct - overallWinPct;

            // Determine display name
            let displayName;
            if (year) {
                displayName = this.getTeamName(key, year);
            } else {
                if (typeof key === 'string' && key.startsWith('team-')) {
                    const teamId = parseInt(key.replace('team-', ''));
                    displayName = this.getTeamName(teamId);
                } else {
                    displayName = this.getOwnerNameById(key);
                }
            }

            results.push({
                key,
                displayName,
                closeWins: data.closeWins,
                closeLosses: data.closeLosses,
                closeGameWinPct: parseFloat(closeWinPct.toFixed(1)),
                blowoutWins: data.blowoutWins,
                blowoutLosses: data.blowoutLosses,
                totalCloseGames: data.totalCloseGames,
                overallWinPct: parseFloat(overallWinPct.toFixed(1)),
                clutchFactor: parseFloat(clutchFactor.toFixed(1)),
                avgWinMargin: parseFloat(avgWinMargin.toFixed(2)),
                avgLossMargin: parseFloat(avgLossMargin.toFixed(2)),
                seasonsPlayed: data.years.size
            });
        });

        // Sort by clutch factor
        return results.sort((a, b) => b.clutchFactor - a.clutchFactor);
    }

    // ========================================
    // 4. STRENGTH OF SCHEDULE
    // ========================================

    /**
     * Calculate strength of schedule for each team/owner
     * Calculations include all teams; filtering to current owners happens at display time.
     */
    calculateStrengthOfSchedule(year = null) {
        const sosData = new Map(); // key -> { opponentScores, opponentIds }

        // First, calculate each team's scoring average
        const teamAvgScores = new Map();
        const teamRecords = new Map();

        // Include ALL matchups in calculations
        const matchupsToUse = year ?
            this.allMatchups.filter(m => m.year === year && !m.isPlayoff) :
            this.allMatchups.filter(m => !m.isPlayoff);

        // Build team averages and records
        matchupsToUse.forEach(m => {
            [
                { id: m.homeTeamId, score: m.homeScore, won: m.homeScore > m.awayScore, year: m.year },
                { id: m.awayTeamId, score: m.awayScore, won: m.awayScore > m.homeScore, year: m.year }
            ].forEach(({ id, score, won, year: matchYear }) => {
                const key = year ? id : (this.getOwnerId(id, matchYear) || `team-${id}`);

                if (!teamAvgScores.has(key)) {
                    teamAvgScores.set(key, { scores: [], years: new Set() });
                    teamRecords.set(key, { wins: 0, losses: 0 });
                }
                teamAvgScores.get(key).scores.push(score);
                teamAvgScores.get(key).years.add(matchYear);
                if (won) teamRecords.get(key).wins++;
                else teamRecords.get(key).losses++;
            });
        });

        // Calculate league average
        let allScores = [];
        teamAvgScores.forEach(data => allScores = allScores.concat(data.scores));
        const leagueAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length;

        // Now calculate SOS for each team
        matchupsToUse.forEach(m => {
            [
                { teamId: m.homeTeamId, oppId: m.awayTeamId, oppScore: m.awayScore, year: m.year },
                { teamId: m.awayTeamId, oppId: m.homeTeamId, oppScore: m.homeScore, year: m.year }
            ].forEach(({ teamId, oppId, oppScore, year: matchYear }) => {
                const key = year ? teamId : (this.getOwnerId(teamId, matchYear) || `team-${teamId}`);
                const oppKey = year ? oppId : (this.getOwnerId(oppId, matchYear) || `team-${oppId}`);

                if (!sosData.has(key)) {
                    sosData.set(key, {
                        opponentScores: [],
                        opponentKeys: [],
                        years: new Set()
                    });
                }
                sosData.get(key).opponentScores.push(oppScore);
                sosData.get(key).opponentKeys.push(oppKey);
                sosData.get(key).years.add(matchYear);
            });
        });

        const results = [];

        sosData.forEach((data, key) => {
            // For all-time stats, only DISPLAY current owners (calculations included everyone)
            if (!year && !this.isCurrentOwner(key)) {
                return;
            }

            const avgOppScore = data.opponentScores.reduce((a, b) => a + b, 0) / data.opponentScores.length;

            // Calculate average opponent win percentage
            const oppWinPcts = data.opponentKeys.map(oppKey => {
                const rec = teamRecords.get(oppKey);
                return rec ? rec.wins / (rec.wins + rec.losses) : 0.5;
            });
            const avgOppWinPct = oppWinPcts.reduce((a, b) => a + b, 0) / oppWinPcts.length;

            // SOS Index: opponent average vs league average (>100 = harder schedule)
            const sosIndex = (avgOppScore / leagueAvg) * 100;

            const myRecord = teamRecords.get(key);
            const myWinPct = myRecord ? myRecord.wins / (myRecord.wins + myRecord.losses) : 0;

            // Determine display name
            let displayName;
            if (year) {
                displayName = this.getTeamName(key, year);
            } else {
                if (typeof key === 'string' && key.startsWith('team-')) {
                    const teamId = parseInt(key.replace('team-', ''));
                    displayName = this.getTeamName(teamId);
                } else {
                    displayName = this.getOwnerNameById(key);
                }
            }

            results.push({
                key,
                displayName,
                avgOpponentScore: parseFloat(avgOppScore.toFixed(2)),
                avgOpponentWinPct: parseFloat((avgOppWinPct * 100).toFixed(1)),
                sosIndex: parseFloat(sosIndex.toFixed(1)),
                leagueAvgScore: parseFloat(leagueAvg.toFixed(2)),
                gamesPlayed: data.opponentScores.length,
                teamWinPct: parseFloat((myWinPct * 100).toFixed(1)),
                // Adjusted win pct = win pct + (SOS index - 100) bonus
                adjustedWinPct: parseFloat((myWinPct * 100 + (sosIndex - 100) * 0.5).toFixed(1)),
                seasonsPlayed: data.years.size
            });
        });

        // Sort by SOS index (hardest schedule first)
        return results.sort((a, b) => b.sosIndex - a.sosIndex);
    }

    // ========================================
    // HIGHEST SINGLE-GAME SCORE
    // ========================================

    /**
     * Find the highest single-game score with proper week filtering:
     * - 2011-2017: Only weeks 1-12 count
     * - 2018+: All regular season weeks count
     * Only includes current owners.
     */
    getHighestSingleGameScore() {
        let highest = { score: 0, displayName: '', year: null, week: null };

        Object.entries(this.weeklyScores).forEach(([yearStr, weeks]) => {
            const year = parseInt(yearStr);
            const regularWeeks = this.regularSeasonWeeks[year] || new Set();

            Object.entries(weeks).forEach(([weekStr, scores]) => {
                const week = parseInt(weekStr);

                // Skip non-regular season weeks
                if (!regularWeeks.has(week)) return;

                // For 2011-2017, only count weeks 1-12
                if (year <= 2017 && week > 12) return;

                Object.entries(scores).forEach(([teamIdStr, score]) => {
                    const teamId = parseInt(teamIdStr);
                    const ownerId = this.getOwnerId(teamId, year);

                    // Only include current owners
                    if (!ownerId || !this.isCurrentOwner(ownerId)) return;

                    if (score > highest.score) {
                        highest = {
                            score: score,
                            displayName: this.getOwnerNameById(ownerId),
                            year: year,
                            week: week
                        };
                    }
                });
            });
        });

        return highest;
    }

    // ========================================
    // GENERATE FULL REPORT
    // ========================================

    generateFullReport(closeThreshold = 5, blowoutThreshold = 30) {
        return {
            meta: {
                generatedAt: new Date().toISOString(),
                seasonsAnalyzed: Object.keys(this.seasons).length,
                totalMatchups: this.allMatchups.length,
                ownersTracked: this.ownerNames.size,
                closeThreshold: closeThreshold,
                blowoutThreshold: blowoutThreshold
            },
            luck: {
                allTime: this.calculateLuckScores(),
                bySeasonSummary: this.getSeasonLuckBreakdown()
            },
            consistency: this.calculateConsistencyMetrics(),
            highestSingleGame: this.getHighestSingleGameScore(),
            clutch: this.calculateCloseGamePerformance(closeThreshold, blowoutThreshold),
            strengthOfSchedule: this.calculateStrengthOfSchedule()
        };
    }
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedAnalytics;
}
