/**
 * ESPN Fantasy Football API Integration Module
 * Handles all communication with ESPN's fantasy API for private leagues
 */

class ESPNFantasyAPI {
    constructor() {
        // ESPN changed their API in 2018 - different endpoints for old vs new
        this.baseUrlNew = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
        this.baseUrlOld = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory';
        this.proxyUrl = '/api/espn'; // Local proxy endpoint
        this.useProxy = true; // Enable proxy by default for private leagues
        this.leagueId = null;
        this.espnS2 = null;
        this.swid = null;
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        this.legacyCutoffYear = 2018; // Years before this use the old API
        this.requestTimeout = 30000; // 30 second timeout for API requests
    }

    /**
     * Configure the API with league credentials
     */
    configure(leagueId, espnS2 = null, swid = null) {
        this.leagueId = leagueId;
        this.espnS2 = espnS2;
        this.swid = swid;
    }

    /**
     * Check if credentials are configured
     */
    isConfigured() {
        return this.leagueId !== null;
    }

    /**
     * Build the API URL for a specific season
     * Uses different endpoints for pre-2018 (legacy) vs 2018+ seasons
     */
    buildUrl(year, endpoint = '') {
        if (year < this.legacyCutoffYear) {
            // Legacy API for pre-2018 seasons
            // Format: /leagueHistory/{leagueId}?seasonId={year}
            return `${this.baseUrlOld}/${this.leagueId}?seasonId=${year}`;
        } else {
            // New API for 2018+ seasons
            let url = `${this.baseUrlNew}/${year}/segments/0/leagues/${this.leagueId}`;
            if (endpoint) {
                url += `/${endpoint}`;
            }
            return url;
        }
    }

    /**
     * Check if a year uses the legacy API
     */
    isLegacyYear(year) {
        return year < this.legacyCutoffYear;
    }

    /**
     * Build headers for private league access
     * Note: Due to CORS restrictions, this may need a proxy server for private leagues
     */
    buildHeaders() {
        const headers = {
            'Accept': 'application/json',
        };

        // Note: Cookies can't be set via fetch headers due to browser security
        // For private leagues, we'll need to use a proxy or the cookies in URL params
        return headers;
    }

    /**
     * Fetch data from ESPN API with caching
     * For private leagues, credentials need to be passed as cookies
     */
    async fetchData(year, views = [], scoringPeriodId = null) {
        const cacheKey = `${year}-${views.join(',')}-${scoringPeriodId || 'all'}`;

        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        const isLegacy = this.isLegacyYear(year);
        let url = this.buildUrl(year);

        // Build query parameters
        if (isLegacy) {
            // Legacy API already has seasonId in URL, just add views
            const params = new URLSearchParams();
            if (views.length > 0) {
                views.forEach(view => params.append('view', view));
            }
            if (params.toString()) {
                url += '&' + params.toString();
            }
        } else {
            // New API
            const params = new URLSearchParams();
            if (views.length > 0) {
                views.forEach(view => params.append('view', view));
            }
            if (scoringPeriodId !== null) {
                params.append('scoringPeriodId', scoringPeriodId);
            }
            if (params.toString()) {
                url += '?' + params.toString();
            }
        }

        console.log(`Fetching ${year} (${isLegacy ? 'legacy' : 'new'} API): ${url}`);

        try {
            // For private leagues, we need to use a CORS proxy or backend
            // This is a limitation of browser-based API calls
            const response = await this.fetchWithCredentials(url);

            if (!response.ok) {
                throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
            }

            let data = await response.json();

            // Legacy API returns an array, extract first element
            if (isLegacy && Array.isArray(data)) {
                data = data[0] || {};
                console.log(`Legacy data for ${year}:`, data ? 'found' : 'empty');
            }

            // Cache the result
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error(`Error fetching data for ${year}:`, error);
            throw error;
        }
    }

    /**
     * Fetch with credentials handling and timeout
     * Uses a local proxy server for browser-based requests to private leagues
     */
    async fetchWithCredentials(url) {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

        try {
            // For public leagues without proxy, try direct fetch
            if (!this.espnS2 && !this.swid && !this.useProxy) {
                const response = await fetch(url, {
                    headers: this.buildHeaders(),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response;
            }

            // Use proxy server to handle CORS and cookies
            if (this.useProxy) {
                const proxyParams = new URLSearchParams();
                proxyParams.append('url', url);

                if (this.espnS2) {
                    proxyParams.append('espn_s2', this.espnS2);
                }
                if (this.swid) {
                    proxyParams.append('swid', this.swid);
                }

                const proxyRequestUrl = `${this.proxyUrl}?${proxyParams.toString()}`;
                console.log('Using proxy for ESPN API request');

                const response = await fetch(proxyRequestUrl, {
                    headers: this.buildHeaders(),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response;
            }

            // Fallback: Try direct fetch with credentials
            const response = await fetch(url, {
                headers: this.buildHeaders(),
                credentials: 'include',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                throw new Error('Request timed out - network may be slow');
            }
            console.error('Fetch failed:', e);
            throw new Error('Network error - please check your connection');
        }
    }

    /**
     * Get league info and settings
     */
    async getLeagueInfo(year) {
        return this.fetchData(year, ['mSettings', 'mTeam']);
    }

    /**
     * Get current standings
     */
    async getStandings(year) {
        return this.fetchData(year, ['mTeam', 'mStandings']);
    }

    /**
     * Get matchup data for a specific week
     */
    async getMatchups(year, week) {
        return this.fetchData(year, ['mMatchup', 'mMatchupScore'], week);
    }

    /**
     * Get all matchups for a season
     */
    async getAllMatchups(year) {
        return this.fetchData(year, ['mMatchup', 'mMatchupScore']);
    }

    /**
     * Get team roster data
     */
    async getRosters(year, week = null) {
        const views = ['mRoster', 'mTeam'];
        return this.fetchData(year, views, week);
    }

    /**
     * Get draft data
     */
    async getDraft(year) {
        return this.fetchData(year, ['mDraftDetail']);
    }

    /**
     * Get playoff bracket data
     */
    async getPlayoffs(year) {
        return this.fetchData(year, ['mMatchup', 'mMatchupScore', 'mTeam']);
    }

    /**
     * Get comprehensive season data (all views)
     * For legacy years (pre-2018), we use fewer views as the old API has different support
     */
    async getFullSeasonData(year) {
        if (this.isLegacyYear(year)) {
            // Legacy API - use only core views that are supported
            // The leagueHistory endpoint has limited view support
            return this.fetchData(year, [
                'mTeam',
                'mMatchup'
            ]);
        } else {
            // New API - full view support
            return this.fetchData(year, [
                'mTeam',
                'mMatchup',
                'mMatchupScore',
                'mStandings',
                'mSettings',
                'mRoster',
                'kona_player_info'  // This view includes member/owner info
            ]);
        }
    }

    /**
     * Fetch data for multiple seasons
     */
    async getMultiSeasonData(startYear, endYear, progressCallback = null) {
        const allData = {};
        const totalYears = endYear - startYear + 1;
        let completed = 0;

        for (let year = startYear; year <= endYear; year++) {
            try {
                allData[year] = await this.getFullSeasonData(year);
                completed++;

                if (progressCallback) {
                    progressCallback({
                        year: year,
                        completed: completed,
                        total: totalYears,
                        percentage: Math.round((completed / totalYears) * 100)
                    });
                }

                // Small delay to avoid rate limiting
                await this.delay(500);
            } catch (error) {
                console.error(`Failed to fetch data for ${year}:`, error);
                allData[year] = { error: error.message };
            }
        }

        return allData;
    }

    /**
     * Parse team data from API response
     * Handles both new API format and legacy format (pre-2018)
     */
    parseTeams(data) {
        if (!data.teams) return [];

        const members = data.members || [];

        return data.teams.map(team => {
            // Handle different record formats between legacy and new API
            let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;

            if (team.record?.overall) {
                // New API format
                wins = team.record.overall.wins || 0;
                losses = team.record.overall.losses || 0;
                ties = team.record.overall.ties || 0;
                pointsFor = team.record.overall.pointsFor || 0;
                pointsAgainst = team.record.overall.pointsAgainst || 0;
            } else if (team.record) {
                // Legacy format - record might be flat
                wins = team.record.wins || 0;
                losses = team.record.losses || 0;
                ties = team.record.ties || 0;
                pointsFor = team.record.pointsFor || team.points || 0;
                pointsAgainst = team.record.pointsAgainst || 0;
            } else {
                // Fallback - look at team level
                wins = team.wins || 0;
                losses = team.losses || 0;
                pointsFor = team.points || team.pointsFor || 0;
                pointsAgainst = team.pointsAgainst || 0;
            }

            return {
                id: team.id,
                teamName: team.name || team.teamName || `Team ${team.id}`,
                name: this.getOwnerName(team, members), // Display name = owner name
                ownerName: this.getOwnerName(team, members),
                abbreviation: team.abbrev || team.name?.substring(0, 4) || `T${team.id}`,
                ownerId: team.primaryOwner,
                logo: team.logo,
                record: {
                    wins,
                    losses,
                    ties,
                    pointsFor,
                    pointsAgainst
                },
                playoffSeed: team.playoffSeed,
                rankCalculatedFinal: team.rankCalculatedFinal || team.finalStandingsPosition,
                divisionId: team.divisionId
            };
        });
    }

    /**
     * Get owner name from team data (prioritizes owner name over team name)
     * Returns format: "FirstName L." (first name + last initial)
     */
    getOwnerName(team, members = []) {
        // Helper to format name as "FirstName L."
        const formatName = (firstName, lastName) => {
            const first = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : '';
            const lastInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';
            return `${first} ${lastInitial}`.trim();
        };

        // First try to get from members list (most reliable)
        if (team.primaryOwner && members.length > 0) {
            const member = members.find(m => m.id === team.primaryOwner);
            if (member && (member.firstName || member.lastName)) {
                return formatName(member.firstName, member.lastName);
            }
        }

        // Then try from team.owners array
        if (team.owners && team.owners.length > 0) {
            const owner = team.owners[0];
            if (owner.firstName || owner.lastName) {
                return formatName(owner.firstName, owner.lastName);
            }
        }

        // Then try team.members
        if (team.members && team.members.length > 0) {
            const member = team.members[0];
            if (member.firstName || member.lastName) {
                return formatName(member.firstName, member.lastName);
            }
        }

        // Finally fallback to team name
        return team.name || `Team ${team.id}`;
    }

    /**
     * Parse matchup data from API response
     * Handles both new API format and legacy format (pre-2018)
     */
    parseMatchups(data) {
        if (!data.schedule) return [];

        return data.schedule.map(matchup => {
            // Handle different score formats
            let homeTeamId, homeScore, awayTeamId, awayScore;

            if (matchup.home && matchup.away) {
                // Standard format
                homeTeamId = matchup.home.teamId;
                homeScore = matchup.home.totalPoints || matchup.home.rosterForCurrentScoringPeriod?.appliedStatTotal || 0;
                awayTeamId = matchup.away.teamId;
                awayScore = matchup.away.totalPoints || matchup.away.rosterForCurrentScoringPeriod?.appliedStatTotal || 0;
            } else {
                // Legacy format might have different structure
                homeTeamId = matchup.homeTeamId || matchup.home?.teamId;
                homeScore = matchup.homeTeamScores?.[0] || matchup.homeScore || 0;
                awayTeamId = matchup.awayTeamId || matchup.away?.teamId;
                awayScore = matchup.awayTeamScores?.[0] || matchup.awayScore || 0;
            }

            return {
                id: matchup.id,
                matchupPeriodId: matchup.matchupPeriodId,
                homeTeamId,
                homeScore,
                awayTeamId,
                awayScore,
                winner: matchup.winner,
                playoffTierType: matchup.playoffTierType
            };
        }).filter(m => m.homeTeamId && m.awayTeamId);
    }

    /**
     * Parse league settings
     */
    parseSettings(data) {
        if (!data.settings) return {};

        const settings = data.settings;
        return {
            name: settings.name,
            size: settings.size,
            isPublic: settings.isPublic,
            scoringType: settings.scoringSettings?.scoringType,
            playoffTeamCount: settings.scheduleSettings?.playoffTeamCount,
            playoffMatchupPeriodLength: settings.scheduleSettings?.playoffMatchupPeriodLength,
            regularSeasonMatchupPeriods: settings.scheduleSettings?.matchupPeriodCount,
            divisions: settings.scheduleSettings?.divisions || []
        };
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Save credentials to localStorage
     */
    saveCredentials() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('espn_league_config', JSON.stringify({
                leagueId: this.leagueId,
                espnS2: this.espnS2,
                swid: this.swid
            }));
        }
    }

    /**
     * Load credentials from localStorage
     */
    loadCredentials() {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('espn_league_config');
            if (saved) {
                const config = JSON.parse(saved);
                this.leagueId = config.leagueId;
                this.espnS2 = config.espnS2;
                this.swid = config.swid;
                return true;
            }
        }
        return false;
    }
}

// Create and export singleton instance
const espnAPI = new ESPNFantasyAPI();

// Also expose as global for non-module usage
if (typeof window !== 'undefined') {
    window.espnAPI = espnAPI;
}
