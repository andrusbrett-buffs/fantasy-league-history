/**
 * Current Season tab
 * Pulls live standings for the in-progress season from ESPN (via the local proxy)
 * and renders them by division plus an overall playoff picture.
 */

class CurrentSeason {
    constructor() {
        this.content = document.getElementById('cs-content');
        this.title = document.getElementById('cs-title');
        this.subtitle = document.getElementById('cs-subtitle');
        this.data = null;
        this.loading = false;
        this.fetchedAt = null;
        this.freshFor = 5 * 60 * 1000; // re-fetch after 5 minutes

        if (!this.content) return;

        document.querySelectorAll('[data-section="currentseason"]').forEach(link => {
            link.addEventListener('click', () => this.load());
        });

        this.content.addEventListener('click', (e) => {
            if (e.target.closest('#cs-refresh')) this.load(true);
        });
    }

    /** League config comes from the (pre-filled) settings form so the cookie isn't duplicated here */
    getConfig() {
        const val = (id) => (document.getElementById(id) || {}).value || '';
        const yearInput = parseInt(val('current-year'), 10);
        const now = new Date();
        // NFL seasons run Sep-Jan; before August we are still in last year's season
        const seasonYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
        return {
            leagueId: val('league-id') || '533683',
            espnS2: val('espn-s2') || null,
            swid: val('swid') || null,
            year: Number.isFinite(yearInput) && yearInput >= seasonYear ? yearInput : seasonYear
        };
    }

    async load(force = false) {
        if (this.loading) return;
        const fresh = this.data && this.fetchedAt && (Date.now() - this.fetchedAt) < this.freshFor;
        if (fresh && !force) return;

        const cfg = this.getConfig();
        this.loading = true;
        this.title.textContent = `${cfg.year} Season`;
        this.content.innerHTML = '<p class="no-data">Loading standings from ESPN...</p>';

        try {
            if (!espnAPI.isConfigured()) {
                espnAPI.configure(cfg.leagueId, cfg.espnS2, cfg.swid);
            }
            if (force) espnAPI.clearCache();

            const raw = await espnAPI.fetchData(cfg.year, ['mTeam', 'mStandings', 'mSettings', 'mStatus']);
            if (!raw || !raw.teams) throw new Error('ESPN returned no team data for this season');

            this.data = raw;
            this.fetchedAt = Date.now();
            this.render(raw, cfg.year);
        } catch (err) {
            console.error('Current season load failed:', err);
            this.content.innerHTML = `
                <div class="cs-error">
                    <strong>Couldn't reach ESPN.</strong> ${this.esc(err.message || 'Unknown error')}
                    <div class="btn-group"><button id="cs-refresh" class="btn btn-secondary cs-refresh">Try again</button></div>
                </div>`;
        } finally {
            this.loading = false;
        }
    }

    /** Turn ESPN's raw payload into sorted, display-ready rows */
    buildTeams(raw) {
        const members = raw.members || [];
        return raw.teams.map(t => {
            const o = (t.record && t.record.overall) || {};
            const d = (t.record && t.record.division) || {};
            return {
                id: t.id,
                teamName: t.name || `Team ${t.id}`,
                abbrev: t.abbrev || '',
                owner: espnAPI.getOwnerName(t, members),
                logo: t.logo || '',
                divisionId: t.divisionId,
                seed: t.playoffSeed || 99,
                wins: o.wins || 0,
                losses: o.losses || 0,
                ties: o.ties || 0,
                pct: o.percentage || 0,
                pf: o.pointsFor || 0,
                pa: o.pointsAgainst || 0,
                gb: o.gamesBack || 0,
                divRecord: `${d.wins || 0}-${d.losses || 0}${d.ties ? '-' + d.ties : ''}`,
                streakType: o.streakType || 'NONE',
                streakLength: o.streakLength || 0
            };
        }).sort((a, b) =>
            a.seed - b.seed || b.pct - a.pct || b.pf - a.pf
        );
    }

    render(raw, year) {
        const teams = this.buildTeams(raw);
        const settings = raw.settings || {};
        const sched = settings.scheduleSettings || {};
        const status = raw.status || {};
        const divisions = sched.divisions || [];
        const week = status.currentMatchupPeriod || 1;
        const totalWeeks = sched.matchupPeriodCount || 14;
        const playoffSpots = sched.playoffTeamCount || 0;
        const gamesPlayed = teams.reduce((n, t) => n + t.wins + t.losses + t.ties, 0);
        const preseason = gamesPlayed === 0;

        this.title.textContent = `${year} Season`;
        this.subtitle.textContent = settings.name
            ? `${settings.name} · ${teams.length} teams · ${playoffSpots} playoff spots`
            : 'Live standings pulled straight from ESPN';

        const updated = new Date(this.fetchedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

        const toolbar = `
            <div class="cs-toolbar">
                <div class="cs-meta">
                    <span class="cs-live">● Live from ESPN</span>
                    <span>Week ${week} of ${totalWeeks}</span>
                    <span>Updated ${updated}</span>
                </div>
                <button id="cs-refresh" class="btn btn-secondary cs-refresh">Refresh</button>
            </div>`;

        const notice = preseason
            ? `<div class="cs-notice">The season hasn't kicked off yet. Records and points will start filling in after Week 1 wraps up.</div>`
            : '';

        const divisionCards = divisions.length ? `
            <div class="cs-divisions">
                ${divisions.map(div => {
                    const rows = teams.filter(t => t.divisionId === div.id);
                    return `
                    <div class="card">
                        <div class="card-header"><h3><span class="card-icon"><svg class="icon icon-gold"><use href="#icon-medal"/></svg></span> ${this.esc(div.name)} Division</h3></div>
                        <table class="standings-table cs-division-table">
                            <thead><tr><th>#</th><th>Team</th><th>W-L</th><th>Div</th><th>PF</th></tr></thead>
                            <tbody>
                                ${rows.map((t, i) => `
                                <tr>
                                    <td class="rank">${i + 1}</td>
                                    <td>${this.teamCell(t)}</td>
                                    <td class="record">${this.recordText(t)}</td>
                                    <td>${t.divRecord}</td>
                                    <td>${t.pf.toFixed(1)}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`;
                }).join('')}
            </div>` : '';

        const overall = `
            <div class="card cs-overall">
                <div class="card-header"><h3><span class="card-icon"><svg class="icon icon-teal"><use href="#icon-trending"/></svg></span> Overall Standings${playoffSpots ? ` <span class="cs-hint">top ${playoffSpots} make the playoffs</span>` : ''}</h3></div>
                <div class="cs-table-wrap">
                <table class="standings-table">
                    <thead><tr><th>Seed</th><th>Team</th><th>Div</th><th>W-L</th><th>PF</th><th>PA</th><th>GB</th><th>Streak</th></tr></thead>
                    <tbody>
                        ${teams.map((t, i) => {
                            const div = divisions.find(d => d.id === t.divisionId);
                            const cls = playoffSpots && i === playoffSpots - 1 ? 'cs-playoff-line' : '';
                            return `
                            <tr class="${cls}">
                                <td class="rank">${i + 1}</td>
                                <td>${this.teamCell(t)}</td>
                                <td>${div ? this.esc(div.name) : '—'}</td>
                                <td class="record">${this.recordText(t)}</td>
                                <td>${t.pf.toFixed(1)}</td>
                                <td>${t.pa.toFixed(1)}</td>
                                <td>${t.gb ? t.gb.toFixed(1) : '—'}</td>
                                <td>${this.streakText(t)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                </div>
            </div>`;

        this.content.innerHTML = toolbar + notice + divisionCards + overall;
    }

    teamCell(t) {
        const initials = this.esc(t.abbrev || t.teamName.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase());
        const img = t.logo
            ? `<img src="${this.esc(t.logo)}" alt="" loading="lazy" onerror="this.remove()">`
            : '';
        return `<div class="cs-team"><span class="cs-logo" data-initials="${initials}">${img}</span><div><span class="cs-team-name">${this.esc(t.teamName)}</span><span class="cs-owner">${this.esc(t.owner)}</span></div></div>`;
    }

    recordText(t) {
        return `${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''}`;
    }

    streakText(t) {
        if (!t.streakLength || t.streakType === 'NONE') return '—';
        const letter = t.streakType === 'WIN' ? 'W' : t.streakType === 'LOSS' ? 'L' : 'T';
        const cls = letter === 'W' ? 'cs-streak-w' : letter === 'L' ? 'cs-streak-l' : '';
        return `<span class="${cls}">${letter}${t.streakLength}</span>`;
    }

    esc(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.currentSeason = new CurrentSeason();
});
