/**
 * Power Rankings tab
 * Ranks teams on more than wins: record, all-play record (how you'd fare
 * against every team each week), scoring, and recent form. Before any games
 * are played it falls back to ESPN's preseason projections.
 */

class PowerRankings {
    constructor() {
        this.content = document.getElementById('pr-content');
        this.title = document.getElementById('pr-title');
        this.subtitle = document.getElementById('pr-subtitle');
        this.loading = false;
        if (!this.content) return;

        document.querySelectorAll('[data-section="powerrankings"]').forEach(link => {
            link.addEventListener('click', () => this.load());
        });
        this.content.addEventListener('click', (e) => {
            if (e.target.closest('#pr-refresh')) this.load(true);
        });
    }

    async load(force = false) {
        if (this.loading || !window.currentSeason) return;
        this.loading = true;
        if (!currentSeason.data || force) {
            this.content.innerHTML = '<p class="no-data">Crunching the numbers...</p>';
        }
        try {
            const raw = await currentSeason.getSeasonData(force);
            this.render(raw, currentSeason.year);
        } catch (err) {
            console.error('Power rankings load failed:', err);
            this.content.innerHTML = `
                <div class="cs-error">
                    <strong>Couldn't reach ESPN.</strong> ${currentSeason.esc(err.message || 'Unknown error')}
                    <div class="btn-group"><button id="pr-refresh" class="btn btn-secondary cs-refresh">Try again</button></div>
                </div>`;
        } finally {
            this.loading = false;
        }
    }

    /** Base team info keyed by id */
    baseTeams(raw) {
        const members = raw.members || [];
        const map = new Map();
        raw.teams.forEach(t => map.set(t.id, {
            id: t.id,
            teamName: t.name || `Team ${t.id}`,
            abbrev: t.abbrev || '',
            owner: espnAPI.getOwnerName(t, members),
            logo: t.logo || '',
            projectedRank: t.currentProjectedRank || t.draftDayProjectedRank || 0,
            seed: t.playoffSeed || 99
        }));
        return map;
    }

    /** Regular-season matchups that have a result, through the given week */
    completedGames(raw, throughWeek) {
        return (raw.schedule || []).filter(m =>
            m.home && m.away && m.home.teamId && m.away.teamId &&
            (m.playoffTierType || 'NONE') === 'NONE' &&
            m.winner && m.winner !== 'UNDECIDED' &&
            m.matchupPeriodId <= throughWeek
        );
    }

    /**
     * Compute rankings using games through `throughWeek`.
     * Returns null when no games have been played.
     */
    compute(raw, throughWeek) {
        const teams = this.baseTeams(raw);
        const games = this.completedGames(raw, throughWeek);
        if (!games.length) return null;

        const stats = new Map();
        teams.forEach((t, id) => stats.set(id, { ...t, games: [], wins: 0, losses: 0, ties: 0, pf: 0, allPlayW: 0, allPlayL: 0 }));
        const byWeek = new Map();

        games.forEach(m => {
            const hp = m.home.totalPoints || 0, ap = m.away.totalPoints || 0;
            const add = (id, pts, opp, oppPts) => {
                const s = stats.get(id); if (!s) return;
                s.games.push({ week: m.matchupPeriodId, pts, opp, oppPts });
                s.pf += pts;
                if (pts > oppPts) s.wins++; else if (pts < oppPts) s.losses++; else s.ties++;
            };
            add(m.home.teamId, hp, m.away.teamId, ap);
            add(m.away.teamId, ap, m.home.teamId, hp);
            if (!byWeek.has(m.matchupPeriodId)) byWeek.set(m.matchupPeriodId, []);
            byWeek.get(m.matchupPeriodId).push({ id: m.home.teamId, pts: hp }, { id: m.away.teamId, pts: ap });
        });

        // All-play: each week, how many teams would you have beaten?
        byWeek.forEach(entries => {
            entries.forEach(e => {
                const s = stats.get(e.id); if (!s) return;
                entries.forEach(o => {
                    if (o.id === e.id) return;
                    if (e.pts > o.pts) s.allPlayW++; else if (e.pts < o.pts) s.allPlayL++;
                });
            });
        });

        const rows = [...stats.values()].filter(s => s.games.length > 0).map(s => {
            const gp = s.games.length;
            const recent = s.games.slice().sort((a, b) => b.week - a.week).slice(0, 3);
            return {
                ...s,
                gp,
                winPct: (s.wins + 0.5 * s.ties) / gp,
                avg: s.pf / gp,
                last3: recent.reduce((n, g) => n + g.pts, 0) / recent.length,
                allPlayPct: (s.allPlayW + s.allPlayL) ? s.allPlayW / (s.allPlayW + s.allPlayL) : 0
            };
        });

        const maxAvg = Math.max(...rows.map(r => r.avg)) || 1;
        const maxLast3 = Math.max(...rows.map(r => r.last3)) || 1;
        rows.forEach(r => {
            r.power = 100 * (0.30 * r.winPct + 0.30 * r.allPlayPct + 0.25 * (r.avg / maxAvg) + 0.15 * (r.last3 / maxLast3));
        });
        rows.sort((a, b) => b.power - a.power || b.avg - a.avg);
        rows.forEach((r, i) => r.rank = i + 1);
        return rows;
    }

    render(raw, year) {
        const status = raw.status || {};
        const sched = (raw.settings || {}).scheduleSettings || {};
        const totalWeeks = sched.matchupPeriodCount || 14;
        const allDone = this.completedGames(raw, 99);
        const latestWeek = allDone.length ? Math.max(...allDone.map(m => m.matchupPeriodId)) : 0;
        const rows = this.compute(raw, latestWeek);
        const updated = new Date(currentSeason.fetchedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

        this.title.textContent = `${year} Power Rankings`;

        const toolbar = (label) => `
            <div class="cs-toolbar">
                <div class="cs-meta">
                    <span class="cs-live">● Live from ESPN</span>
                    <span>${label}</span>
                    <span>Updated ${updated}</span>
                </div>
                <button id="pr-refresh" class="btn btn-secondary cs-refresh">Refresh</button>
            </div>`;

        // ---- Preseason: nothing played yet, lean on ESPN's projections ----
        if (!rows) {
            const teams = [...this.baseTeams(raw).values()];
            const hasProj = teams.some(t => t.projectedRank > 0);
            teams.sort((a, b) => hasProj
                ? (a.projectedRank || 99) - (b.projectedRank || 99)
                : a.seed - b.seed);
            this.subtitle.textContent = hasProj
                ? 'Preseason projections from ESPN. Real rankings kick in after Week 1.'
                : 'No games yet. Real rankings kick in after Week 1.';
            this.content.innerHTML = toolbar('Preseason') + `
                <div class="cs-notice">No games have been played, so this is ESPN's preseason projection. Once Week 1 is in the books, these become Fadunkadunk's own power rankings.</div>
                <div class="pr-list">
                    ${teams.map((t, i) => `
                    <div class="pr-row ${i === 0 ? 'pr-top' : ''}">
                        <div class="pr-rank">${i + 1}</div>
                        <div class="pr-move">—</div>
                        ${currentSeason.teamCell(t)}
                        <div class="pr-stats-wrap"><div class="pr-stat">${hasProj ? `#${t.projectedRank}` : '—'}<small>ESPN projection</small></div></div>
                    </div>`).join('')}
                </div>`;
            return;
        }

        // ---- Regular rankings with movement vs the previous week ----
        const prev = latestWeek > 1 ? this.compute(raw, latestWeek - 1) : null;
        const prevRank = new Map((prev || []).map(r => [r.id, r.rank]));
        this.subtitle.textContent = `Through Week ${latestWeek} of ${totalWeeks} · blends record, all-play record, scoring, and recent form`;

        const move = (r) => {
            const p = prevRank.get(r.id);
            if (!p) return '<div class="pr-move">NEW</div>';
            const d = p - r.rank;
            if (d > 0) return `<div class="pr-move up">▲ ${d}</div>`;
            if (d < 0) return `<div class="pr-move down">▼ ${-d}</div>`;
            return '<div class="pr-move">—</div>';
        };

        this.content.innerHTML = toolbar(`Through Week ${latestWeek}`) + `
            <div class="pr-head"><span>Rank</span><span>Move</span><span>Team</span><div class="pr-head-stats"><span>Record</span><span>Avg PF</span><span>Last 3</span><span>All-Play</span></div><span>Power</span></div>
            <div class="pr-list">
                ${rows.map(r => `
                <div class="pr-row ${r.rank === 1 ? 'pr-top' : ''}">
                    <div class="pr-rank">${r.rank}</div>
                    ${move(r)}
                    ${currentSeason.teamCell(r)}
                    <div class="pr-stats-wrap">
                    <div class="pr-stat">${r.wins}-${r.losses}${r.ties ? '-' + r.ties : ''}<small>Record</small></div>
                    <div class="pr-stat">${r.avg.toFixed(1)}<small>Avg PF</small></div>
                    <div class="pr-stat">${r.last3.toFixed(1)}<small>Last 3</small></div>
                    <div class="pr-stat">${r.allPlayW}-${r.allPlayL}<small>All-Play</small></div>
                    </div>
                    <div class="pr-score"><div class="pr-bar"><span style="width:${Math.max(4, r.power).toFixed(1)}%"></span></div><div class="pr-score-num">${r.power.toFixed(1)}</div></div>
                </div>`).join('')}
            </div>
            <div class="pr-method">
                <strong>How the power score works.</strong> Each team gets a 0-100 score from four pieces:
                <strong>30%</strong> win percentage, <strong>30%</strong> all-play record (your weekly score against every other team, so schedule luck washes out),
                <strong>25%</strong> season scoring average relative to the league leader, and <strong>15%</strong> average of your last three weeks.
                Movement compares to the same calculation through the previous week.
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.powerRankings = new PowerRankings();
});
