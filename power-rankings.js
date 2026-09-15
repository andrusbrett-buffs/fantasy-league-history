/**
 * Power Rankings tab
 *
 * Two modes:
 *  - Published: weekly files in data/power-rankings/<season>/week-NN.json built by
 *    scripts/build-power-rankings.js, with analytics + written commentary.
 *  - Live (unofficial): computed in the browser from ESPN data when nothing is
 *    published yet, or when the viewer picks "Live" from the week menu.
 */

class PowerRankings {
    constructor() {
        this.content = document.getElementById('pr-content');
        this.title = document.getElementById('pr-title');
        this.subtitle = document.getElementById('pr-subtitle');
        this.loading = false;
        this.index = null;      // data/power-rankings/index.json
        this.selected = null;   // week number or 'live'
        this.cache = {};
        if (!this.content) return;

        document.querySelectorAll('[data-section="powerrankings"]').forEach(link => {
            link.addEventListener('click', () => this.load());
        });
        this.content.addEventListener('click', (e) => {
            if (e.target.closest('#pr-refresh')) this.load(true);
        });
        this.content.addEventListener('change', (e) => {
            if (e.target.id !== 'pr-week') return;
            const v = e.target.value;
            this.selected = v === 'live' ? 'live' : parseInt(v, 10);
            this.load(false, true);
        });
    }

    esc(s) { return window.currentSeason ? currentSeason.esc(s) : String(s); }
    paras(text) { return String(text || '').split(/\n\s*\n/).map(p => `<p>${this.esc(p.trim())}</p>`).join(''); }

    async load(force = false, fromSelector = false) {
        if (this.loading) return;
        this.loading = true;
        try {
            if (!this.index || force) {
                try {
                    const r = await fetch(`data/power-rankings/index.json?t=${Date.now()}`);
                    this.index = r.ok ? await r.json() : null;
                } catch (e) { this.index = null; }
            }
            const latest = this.index && this.index.latest;
            if (!fromSelector && this.selected === null) this.selected = latest ? latest.week : 'live';
            if (this.selected !== 'live' && latest) {
                await this.showPublished(latest.season, this.selected, force);
            } else {
                await this.showLive(force);
            }
        } catch (err) {
            console.error('Power rankings load failed:', err);
            this.content.innerHTML = `
                <div class="cs-error">
                    <strong>Couldn't load the rankings.</strong> ${this.esc(err.message || 'Unknown error')}
                    <div class="btn-group"><button id="pr-refresh" class="btn btn-secondary cs-refresh">Try again</button></div>
                </div>`;
        } finally {
            this.loading = false;
        }
    }

    weekSelector(current) {
        const latest = this.index && this.index.latest;
        if (!latest) return '';
        const weeks = (this.index.seasons[latest.season] || {}).weeks || [];
        const opts = weeks.slice().reverse().map(w => `<option value="${w}" ${current === w ? 'selected' : ''}>Week ${w}${w === latest.week ? ' (latest)' : ''}</option>`).join('');
        return `<select id="pr-week" class="pr-week-select">${opts}<option value="live" ${current === 'live' ? 'selected' : ''}>Live (unofficial)</option></select>`;
    }

    // ------------------------------------------------------------------ published
    async showPublished(season, week, force) {
        const key = `${season}-${week}`;
        if (!this.cache[key] || force) {
            const file = `data/power-rankings/${season}/week-${String(week).padStart(2, '0')}.json?t=${Date.now()}`;
            const r = await fetch(file);
            if (!r.ok) throw new Error(`Week ${week} file not found`);
            this.cache[key] = await r.json();
        }
        this.renderPublished(this.cache[key]);
    }

    cellFor(t) { return currentSeason.teamCell({ teamName: t.name, owner: t.owner, logo: t.logo, abbrev: t.abbrev }); }

    move(t) {
        if (!t.previousRank) return '<div class="pr-move">—</div>';
        if (t.movement > 0) return `<div class="pr-move up">▲ ${t.movement}</div>`;
        if (t.movement < 0) return `<div class="pr-move down">▼ ${-t.movement}</div>`;
        return '<div class="pr-move">—</div>';
    }

    renderPublished(d) {
        const c = d.commentary || {};
        const byId = Object.fromEntries(d.teams.map(t => [t.id, t]));
        const rosRank = Object.fromEntries(d.teams.slice().sort((a, b) => b.rosStrength - a.rosStrength).map((t, i) => [t.id, i + 1]));
        const published = new Date(d.generatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

        this.title.textContent = `${d.season} Power Rankings`;
        this.subtitle.textContent = `Week ${d.week} of ${d.totalWeeks} · analytics-based rankings with commentary${c.author ? ' by ' + c.author : ''}`;

        const toolbar = `
            <div class="cs-toolbar">
                <div class="cs-meta">
                    <span class="cs-live">● Week ${d.week} ${d.finalized ? 'final' : 'preliminary'}</span>
                    <span>Results ${Math.round(d.method.resultsWeight)}% · Projection ${Math.round(d.method.projectionWeight)}%</span>
                    <span>Movement vs ${this.esc(d.method.movementBasis)}</span>
                    <span>Published ${published}</span>
                </div>
                ${this.weekSelector(d.week)}
            </div>`;

        const intro = c.intro ? `<div class="pr-prose pr-intro">${this.paras(c.intro)}</div>` : '';

        const A = d.awards || {};
        const name = id => byId[id] ? `${this.esc(byId[id].name)} <small>${this.esc(byId[id].owner)}</small>` : '';
        const awardDefs = [
            ['highScore', 'High Score', A.highScore && `${name(A.highScore.teamId)} · ${A.highScore.pts}`],
            ['lowScore', 'Low Score', A.lowScore && `${name(A.lowScore.teamId)} · ${A.lowScore.pts}`],
            ['benchBomb', 'Bench Bomb', A.benchBomb && `${name(A.benchBomb.teamId)} · ${this.esc(A.benchBomb.benched)} ${A.benchBomb.benchedPts} sat behind ${this.esc(A.benchBomb.started)} ${A.benchBomb.startedPts}`],
            ['questionableStart', 'Questionable Start', A.questionableStart && `${name(A.questionableStart.teamId)} · started ${this.esc(A.questionableStart.started)} (${A.questionableStart.startedPts}) over ${this.esc(A.questionableStart.benched)} (${A.questionableStart.benchedPts})`],
            ['worstDefense', 'Ill-Advised Defense', A.worstDefense && `${name(A.worstDefense.teamId)} · ${this.esc(A.worstDefense.defense)} ${A.worstDefense.pts}`],
            ['bestDefense', 'Defense of the Week', A.bestDefense && `${name(A.bestDefense.teamId)} · ${this.esc(A.bestDefense.defense)} ${A.bestDefense.pts}`],
            ['boom', 'Boom', A.boom && `${name(A.boom.teamId)} · ${this.esc(A.boom.player)} ${A.boom.pts} (proj ${A.boom.proj})`],
            ['bust', 'Bust', A.bust && `${name(A.bust.teamId)} · ${this.esc(A.bust.player)} ${A.bust.pts} (proj ${A.bust.proj})`],
            ['luckiestWin', 'Luckiest Win', A.luckiestWin && `${name(A.luckiestWin.teamId)} · won with the #${A.luckiestWin.weekRank} score`],
            ['toughestLoss', 'Toughest Loss', A.toughestLoss && `${name(A.toughestLoss.teamId)} · lost with the #${A.toughestLoss.weekRank} score`],
            ['blowout', 'Blowout', A.blowout && `${name(A.blowout.teamId)} · by ${A.blowout.margin}`],
            ['closest', 'Nail-Biter', A.closest && `${name(A.closest.teamId)} · by ${A.closest.margin}`]
        ].filter(x => x[2]);
        const featured = Array.isArray(c.featured) && c.featured.length ? c.featured : null;
        const shown = featured ? featured.map(k => awardDefs.find(a => a[0] === k)).filter(Boolean) : awardDefs;
        const awards = shown.length ? `
            <h3 class="pr-h3">Week ${d.week} Receipts</h3>
            <div class="pr-awards">
                ${shown.map(([key, label, line]) => `
                <div class="pr-award">
                    <div class="pr-award-label">${label}</div>
                    <div class="pr-award-line">${line}</div>
                    ${c.awards && c.awards[key] ? `<div class="pr-award-blurb">${this.esc(c.awards[key])}</div>` : ''}
                </div>`).join('')}
            </div>` : '';

        const chip = (label, val, cls = '') => `<span class="pr-chip ${cls}"><b>${val}</b> ${label}</span>`;
        const list = `
            <h3 class="pr-h3">The Rankings</h3>
            <div class="pr-list">
                ${d.teams.map(t => {
                    const luck = t.luck > 0 ? `+${t.luck}` : `${t.luck}`;
                    return `
                    <div class="pr-card ${t.rank === 1 ? 'pr-top' : ''}">
                        <div class="pr-row">
                            <div class="pr-rank">${t.rank}</div>
                            ${this.move(t)}
                            ${this.cellFor(t)}
                            <div class="pr-stats-wrap">
                                <div class="pr-stat">${t.record.wins}-${t.record.losses}${t.record.ties ? '-' + t.record.ties : ''}<small>Record</small></div>
                                <div class="pr-stat">${t.avg.toFixed(1)}<small>Avg PF</small></div>
                                <div class="pr-stat">${t.allPlay.w}-${t.allPlay.l}<small>All-Play</small></div>
                                <div class="pr-stat">#${rosRank[t.id]}<small>Roster ROS</small></div>
                            </div>
                            <div class="pr-score"><div class="pr-bar"><span style="width:${Math.max(4, t.power).toFixed(1)}%"></span></div><div class="pr-score-num">${t.power.toFixed(1)}</div></div>
                        </div>
                        <div class="pr-chips">
                            ${chip('ESPN proj', '#' + (t.espnProjectedRank || '—'))}
                            ${chip('luck', luck, t.luck > 0.4 ? 'good' : t.luck < -0.4 ? 'bad' : '')}
                            ${chip('lineup eff', t.lineupEfficiency + '%', t.lineupEfficiency < 80 ? 'bad' : '')}
                            ${chip('left on bench', t.benchLeftTotal)}
                            ${t.remaining && t.remaining.rank ? chip('remaining SOS', '#' + t.remaining.rank) : ''}
                            ${t.draftGrade ? chip('draft grade', this.esc(t.draftGrade.grade)) : ''}
                            ${t.division ? chip('', this.esc(t.division)) : ''}
                        </div>
                        ${t.commentary ? `<div class="pr-commentary">${this.paras(t.commentary)}</div>` : ''}
                    </div>`;
                }).join('')}
            </div>`;

        const outro = c.outro ? `<div class="pr-prose pr-outro">${this.paras(c.outro)}</div>` : '';

        const method = `
            <div class="pr-method">
                <strong>How the power score works.</strong> Two halves, blended by how much of the season has been played.
                <strong>Results (${Math.round(d.method.resultsWeight)}% this week)</strong>: win percentage, all-play record, and scoring average.
                <strong>Projection (${Math.round(d.method.projectionWeight)}%)</strong>: rest-of-season strength of the current roster from ESPN's player projections, plus ESPN's projected finish.
                Results take over as the weeks pile up, reaching 80% by Week 6. Luck is wins minus what the all-play record says you deserved. Lineup efficiency is points started divided by the best lineup available.
            </div>`;

        this.content.innerHTML = toolbar + intro + awards + list + outro + method;
    }

    // ------------------------------------------------------------------ live (unofficial)
    async showLive(force) {
        if (!window.currentSeason) return;
        if (!currentSeason.data || force) this.content.innerHTML = '<p class="no-data">Crunching the numbers...</p>';
        const raw = await currentSeason.getSeasonData(force);
        this.renderLive(raw, currentSeason.year);
    }

    baseTeams(raw) {
        const members = raw.members || [];
        const map = new Map();
        raw.teams.forEach(t => map.set(t.id, {
            id: t.id, teamName: t.name || `Team ${t.id}`, abbrev: t.abbrev || '', owner: espnAPI.getOwnerName(t, members), logo: t.logo || '',
            projectedRank: t.currentProjectedRank || t.draftDayProjectedRank || 0, seed: t.playoffSeed || 99
        }));
        return map;
    }

    completedGames(raw, throughWeek) {
        return (raw.schedule || []).filter(m =>
            m.home && m.away && m.home.teamId && m.away.teamId &&
            (m.playoffTierType || 'NONE') === 'NONE' &&
            m.winner && m.winner !== 'UNDECIDED' &&
            m.matchupPeriodId <= throughWeek
        );
    }

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
                s.games.push({ week: m.matchupPeriodId, pts, opp, oppPts }); s.pf += pts;
                if (pts > oppPts) s.wins++; else if (pts < oppPts) s.losses++; else s.ties++;
            };
            add(m.home.teamId, hp, m.away.teamId, ap); add(m.away.teamId, ap, m.home.teamId, hp);
            if (!byWeek.has(m.matchupPeriodId)) byWeek.set(m.matchupPeriodId, []);
            byWeek.get(m.matchupPeriodId).push({ id: m.home.teamId, pts: hp }, { id: m.away.teamId, pts: ap });
        });
        byWeek.forEach(entries => entries.forEach(e => {
            const s = stats.get(e.id); if (!s) return;
            entries.forEach(o => { if (o.id === e.id) return; if (e.pts > o.pts) s.allPlayW++; else if (e.pts < o.pts) s.allPlayL++; });
        }));
        const rows = [...stats.values()].filter(s => s.games.length > 0).map(s => {
            const gp = s.games.length;
            const recent = s.games.slice().sort((a, b) => b.week - a.week).slice(0, 3);
            return { ...s, gp, winPct: (s.wins + 0.5 * s.ties) / gp, avg: s.pf / gp, last3: recent.reduce((n, g) => n + g.pts, 0) / recent.length, allPlayPct: (s.allPlayW + s.allPlayL) ? s.allPlayW / (s.allPlayW + s.allPlayL) : 0 };
        });
        const maxAvg = Math.max(...rows.map(r => r.avg)) || 1;
        const maxLast3 = Math.max(...rows.map(r => r.last3)) || 1;
        rows.forEach(r => { r.power = 100 * (0.30 * r.winPct + 0.30 * r.allPlayPct + 0.25 * (r.avg / maxAvg) + 0.15 * (r.last3 / maxLast3)); });
        rows.sort((a, b) => b.power - a.power || b.avg - a.avg);
        rows.forEach((r, i) => r.rank = i + 1);
        return rows;
    }

    renderLive(raw, year) {
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
                <div class="cs-toolbar-right">${this.weekSelector('live')}<button id="pr-refresh" class="btn btn-secondary cs-refresh">Refresh</button></div>
            </div>`;

        if (!rows) {
            const teams = [...this.baseTeams(raw).values()];
            const hasProj = teams.some(t => t.projectedRank > 0);
            teams.sort((a, b) => hasProj ? (a.projectedRank || 99) - (b.projectedRank || 99) : a.seed - b.seed);
            const week = status.currentMatchupPeriod || 1;
            const inProgress = currentSeason.weekInProgress(raw, week);
            this.subtitle.textContent = inProgress
                ? `Week ${week} is underway. The first real rankings drop once ESPN finalizes the week.`
                : hasProj ? 'Preseason projections from ESPN. Real rankings kick in after Week 1.' : 'No games yet. Real rankings kick in after Week 1.';
            this.content.innerHTML = toolbar(inProgress ? `Week ${week} in progress` : 'Preseason') + `
                <div class="cs-notice">${inProgress
                    ? `Week ${week} is still being played, so these are ESPN's preseason projections for now.`
                    : `No games have been played, so this is ESPN's preseason projection.`}</div>
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

        const prev = latestWeek > 1 ? this.compute(raw, latestWeek - 1) : null;
        const prevRank = new Map((prev || []).map(r => [r.id, r.rank]));
        this.subtitle.textContent = `Unofficial live view through Week ${latestWeek} of ${totalWeeks}. The published Tuesday rankings add projections and commentary.`;
        const move = (r) => {
            const p = prevRank.get(r.id);
            if (!p) return '<div class="pr-move">NEW</div>';
            const dlt = p - r.rank;
            if (dlt > 0) return `<div class="pr-move up">▲ ${dlt}</div>`;
            if (dlt < 0) return `<div class="pr-move down">▼ ${-dlt}</div>`;
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
                <strong>Live formula.</strong> <strong>30%</strong> win percentage, <strong>30%</strong> all-play record, <strong>25%</strong> scoring average relative to the leader, <strong>15%</strong> last three weeks. Results only, no projections or commentary.
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.powerRankings = new PowerRankings();
});
