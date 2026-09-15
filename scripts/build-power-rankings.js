#!/usr/bin/env node
/**
 * Build the weekly Power Rankings data file.
 *
 *   node scripts/build-power-rankings.js --week 3            # weeks 1-3 must be final in ESPN
 *   node scripts/build-power-rankings.js --week 1 --live     # accept live totals for an unfinalized week
 *
 * Writes data/power-rankings/<season>/week-NN.json with rankings, per-team analytics,
 * weekly "receipts" (bench bombs, questionable starts, etc.), and empty commentary
 * slots that get filled in by hand afterwards. Also refreshes data/power-rankings/index.json.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEASON = parseInt(argVal('--season', String(new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1)), 10);
const WEEK = parseInt(argVal('--week', '0'), 10);
const LIVE = args.includes('--live');
const LEAGUE = '533683';
if (!WEEK) { console.error('Usage: --week N [--live] [--season YYYY]'); process.exit(1); }

// ---- credentials: env first, then the values already in prebuild.js ----
const prebuild = fs.readFileSync(path.join(ROOT, 'prebuild.js'), 'utf8');
const ESPN_S2 = process.env.ESPN_S2 || prebuild.match(/espnS2: '([^']+)'/)[1];
const SWID = process.env.SWID || prebuild.match(/swid: '([^']+)'/)[1];

const SLOT = { QB: 0, RB: 2, WR: 4, TE: 6, DST: 16, K: 17, BENCH: 20, IR: 21, FLEX: 23 };
const POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' };
const SLOT_NAME = { 0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K', 23: 'FLEX', 20: 'BN', 21: 'IR' };

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { Cookie: `espn_s2=${ESPN_S2}; SWID=${SWID}`, Accept: 'application/json' } }, res => {
            let b = ''; res.on('data', c => b += c);
            res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(`Bad JSON from ESPN (${res.statusCode}): ${b.slice(0, 200)}`)); } });
        }).on('error', reject);
    });
}
const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE}`;

const ownerName = (team, members) => {
    const m = members.find(x => x.id === team.primaryOwner);
    if (!m) return team.name;
    const first = m.firstName ? m.firstName[0].toUpperCase() + m.firstName.slice(1).toLowerCase() : '';
    return `${first} ${m.lastName ? m.lastName[0].toUpperCase() + '.' : ''}`.trim();
};
const stat = (player, sp, src) => { const s = (player.stats || []).find(x => (x.seasonId === undefined || x.seasonId === SEASON) && x.scoringPeriodId === sp && x.statSourceId === src && (sp !== 0 || x.statSplitTypeId === 0)); return s ? (s.appliedTotal || 0) : 0; };
const r1 = n => Math.round(n * 10) / 10;

/** Best possible lineup from a list of {pts, eligible} using league slot counts */
function optimalLineup(players, counts) {
    const used = new Set();
    let total = 0;
    const take = (slot, n, filter) => {
        const pool = players.filter(p => !used.has(p.id) && filter(p)).sort((a, b) => b.pts - a.pts).slice(0, n);
        pool.forEach(p => { used.add(p.id); total += p.pts; });
    };
    take(SLOT.QB, counts[SLOT.QB] || 0, p => p.eligible.includes(SLOT.QB));
    take(SLOT.RB, counts[SLOT.RB] || 0, p => p.eligible.includes(SLOT.RB));
    take(SLOT.WR, counts[SLOT.WR] || 0, p => p.eligible.includes(SLOT.WR));
    take(SLOT.TE, counts[SLOT.TE] || 0, p => p.eligible.includes(SLOT.TE));
    take(SLOT.FLEX, counts[SLOT.FLEX] || 0, p => p.eligible.includes(SLOT.FLEX));
    take(SLOT.DST, counts[SLOT.DST] || 0, p => p.eligible.includes(SLOT.DST));
    take(SLOT.K, counts[SLOT.K] || 0, p => p.eligible.includes(SLOT.K));
    return total;
}

(async () => {
    console.log(`Building ${SEASON} power rankings through week ${WEEK}${LIVE ? ' (live totals allowed)' : ''}`);
    const league = await get(`${base}?view=mTeam&view=mStandings&view=mSettings&view=mStatus&view=mMatchupScore&view=mDraftDetail`);
    const members = league.members || [];
    const settings = league.settings || {};
    const slotCounts = settings.rosterSettings?.lineupSlotCounts || {};
    const divisions = settings.scheduleSettings?.divisions || [];
    const totalWeeks = settings.scheduleSettings?.matchupPeriodCount || 14;
    const playoffSpots = settings.scheduleSettings?.playoffTeamCount || 0;

    // ---- weekly rosters + matchups ----
    const weekly = {};
    for (let w = 1; w <= WEEK; w++) {
        weekly[w] = await get(`${base}?view=mRoster&view=mMatchupScore&scoringPeriodId=${w}`);
        console.log(`  fetched week ${w}`);
    }

    // ---- teams ----
    const teams = {};
    league.teams.forEach(t => {
        teams[t.id] = {
            id: t.id, name: t.name, abbrev: t.abbrev, owner: ownerName(t, members), ownerId: t.primaryOwner,
            logo: t.logo || '', divisionId: t.divisionId, division: (divisions.find(d => d.id === t.divisionId) || {}).name || '',
            espnProjectedRank: t.currentProjectedRank || t.draftDayProjectedRank || 0,
            draftDayProjectedRank: t.draftDayProjectedRank || 0,
            transactions: { acquisitions: t.transactionCounter?.acquisitions || 0, drops: t.transactionCounter?.drops || 0, trades: t.transactionCounter?.trades || 0, lineupMoves: t.transactionCounter?.moveToActive || 0, faabSpent: t.transactionCounter?.acquisitionBudgetSpent || 0 },
            games: [], weeks: {}
        };
    });
    const n = Object.keys(teams).length;

    // ---- games, lineups, receipts ----
    const receipts = { benchBombs: [], questionableStarts: [], injuredStarters: [], defenses: [], busts: [], booms: [], luck: [] };
    for (let w = 1; w <= WEEK; w++) {
        const wk = weekly[w];
        const matchups = (wk.schedule || []).filter(m => m.matchupPeriodId === w && m.home && m.away && (m.playoffTierType || 'NONE') === 'NONE');
        const decided = matchups.every(m => m.winner && m.winner !== 'UNDECIDED');
        if (!decided && !LIVE) { console.error(`Week ${w} is not final in ESPN yet. Re-run with --live to use live totals.`); process.exit(2); }
        const score = (side) => (decided || typeof side.totalPointsLive !== 'number') ? (side.totalPoints || 0) : side.totalPointsLive;
        const proj = (side) => side.totalProjectedPoints || side.totalProjectedPointsLive || 0;

        matchups.forEach(m => {
            const hp = score(m.home), ap = score(m.away);
            const add = (side, pts, oppSide, oppPts) => {
                const t = teams[side.teamId]; if (!t) return;
                t.games.push({ week: w, pts: r1(pts), proj: r1(proj(side)), opp: oppSide.teamId, oppPts: r1(oppPts), won: pts > oppPts, tied: pts === oppPts, final: decided });
            };
            add(m.home, hp, m.away, ap); add(m.away, ap, m.home, hp);
        });

        // all-play + luck for the week
        const weekScores = Object.values(teams).map(t => ({ id: t.id, pts: (t.games.find(g => g.week === w) || {}).pts || 0 }));
        weekScores.forEach(e => {
            const t = teams[e.id]; const g = t.games.find(x => x.week === w); if (!g) return;
            g.allPlayW = weekScores.filter(o => o.id !== e.id && e.pts > o.pts).length;
            g.allPlayL = weekScores.filter(o => o.id !== e.id && e.pts < o.pts).length;
            g.weekRank = weekScores.filter(o => o.pts > e.pts).length + 1;
        });

        // lineups
        (wk.teams || []).forEach(rt => {
            const t = teams[rt.id]; if (!t || !rt.roster) return;
            const players = rt.roster.entries.map(e => {
                const p = e.playerPoolEntry?.player || {};
                return {
                    id: e.playerId, name: p.fullName || `Player ${e.playerId}`, pos: POS[p.defaultPositionId] || '?',
                    slot: e.lineupSlotId, slotName: SLOT_NAME[e.lineupSlotId] || String(e.lineupSlotId),
                    eligible: p.eligibleSlots || [], injury: p.injuryStatus || e.injuryStatus || 'ACTIVE',
                    pts: r1(stat(p, w, 0)), proj: r1(stat(p, w, 1)),
                    seasonPts: r1(stat(p, 0, 0)), seasonProj: r1(stat(p, 0, 1)),
                    proTeamId: p.proTeamId
                };
            });
            const starters = players.filter(p => p.slot !== SLOT.BENCH && p.slot !== SLOT.IR);
            const bench = players.filter(p => p.slot === SLOT.BENCH);
            const actual = r1(starters.reduce((s, p) => s + p.pts, 0));
            const optimal = r1(optimalLineup(players.filter(p => p.slot !== SLOT.IR), slotCounts));
            const g = t.games.find(x => x.week === w) || {};
            const wkInfo = { actualLineup: actual, optimalLineup: optimal, benchLeft: r1(optimal - actual), starters, bench };
            t.weeks[w] = wkInfo;

            // bench bomb: single benched player who out-scored a starter he could have replaced
            bench.forEach(b => {
                const victims = starters.filter(s => b.eligible.includes(s.slot) && s.pts < b.pts);
                if (!victims.length) return;
                const v = victims.sort((a, c) => a.pts - c.pts)[0];
                const swing = r1(b.pts - v.pts);
                receipts.benchBombs.push({ week: w, teamId: t.id, benched: b.name, benchedPos: b.pos, benchedPts: b.pts, started: v.name, startedPos: v.pos, startedPts: v.pts, swing, flippedMatchup: !!(g.oppPts !== undefined && !g.won && g.pts + swing > g.oppPts) });
            });
            // questionable starts: started someone projected below a bench option for the same slot
            starters.forEach(s => {
                const better = bench.filter(b => b.eligible.includes(s.slot) && b.proj > s.proj + 2).sort((a, c) => c.proj - a.proj)[0];
                if (better) receipts.questionableStarts.push({ week: w, teamId: t.id, started: s.name, startedPos: s.pos, startedProj: s.proj, startedPts: s.pts, benched: better.name, benchedProj: better.proj, benchedPts: better.pts, projGap: r1(better.proj - s.proj), ptsGap: r1(better.pts - s.pts) });
            });
            // injured / inactive starters that scored zero
            starters.filter(s => s.pts === 0 && ['OUT', 'INJURY_RESERVE', 'SUSPENSION', 'DOUBTFUL'].includes(s.injury)).forEach(s =>
                receipts.injuredStarters.push({ week: w, teamId: t.id, player: s.name, pos: s.pos, status: s.injury }));
            // defense
            const d = starters.find(s => s.slot === SLOT.DST);
            if (d) receipts.defenses.push({ week: w, teamId: t.id, defense: d.name, proj: d.proj, pts: d.pts });
            // busts & booms among starters
            starters.forEach(s => {
                const delta = r1(s.pts - s.proj);
                if (s.proj >= 8 && delta <= -8) receipts.busts.push({ week: w, teamId: t.id, player: s.name, pos: s.pos, proj: s.proj, pts: s.pts, delta });
                if (delta >= 10) receipts.booms.push({ week: w, teamId: t.id, player: s.name, pos: s.pos, proj: s.proj, pts: s.pts, delta });
            });
        });

        // defense ranks for the week
        const wd = receipts.defenses.filter(x => x.week === w).sort((a, b) => b.proj - a.proj);
        wd.forEach((x, i) => { x.projRank = i + 1; x.of = wd.length; });
        const wdp = [...wd].sort((a, b) => b.pts - a.pts); wdp.forEach((x, i) => { x.ptsRank = i + 1; });
    }

    // ---- keepers ----
    const rosterIndex = {};
    Object.values(weekly[WEEK].teams || []).forEach(rt => (rt.roster?.entries || []).forEach(e => { rosterIndex[e.playerId] = { teamId: rt.id, player: e.playerPoolEntry?.player }; }));
    const keepers = (league.draftDetail?.picks || []).filter(p => p.keeper).map(p => {
        const ri = rosterIndex[p.playerId];
        const pl = ri?.player;
        return { teamId: p.teamId, playerId: p.playerId, player: pl?.fullName || `Player ${p.playerId}`, pos: pl ? (POS[pl.defaultPositionId] || '?') : '?', cost: p.bidAmount, seasonPts: pl ? r1(stat(pl, 0, 0)) : null, stillOnTeam: !!ri && ri.teamId === p.teamId, onSomeoneElse: !!ri && ri.teamId !== p.teamId, ptsPerDollar: pl && p.bidAmount ? Math.round(stat(pl, 0, 0) / p.bidAmount * 100) / 100 : null };
    });
    // league-wide comparison: points per dollar for all drafted starters-ish
    const allPicks = (league.draftDetail?.picks || []).map(p => { const pl = rosterIndex[p.playerId]?.player; return pl && p.bidAmount ? stat(pl, 0, 0) / p.bidAmount : null; }).filter(x => x !== null);
    const leaguePtsPerDollar = allPicks.length ? Math.round(allPicks.reduce((a, b) => a + b, 0) / allPicks.length * 100) / 100 : null;

    // ---- season totals per team ----
    Object.values(teams).forEach(t => {
        const gp = t.games.length;
        t.record = { wins: t.games.filter(g => g.won).length, losses: t.games.filter(g => !g.won && !g.tied).length, ties: t.games.filter(g => g.tied).length };
        t.pf = r1(t.games.reduce((s, g) => s + g.pts, 0));
        t.pa = r1(t.games.reduce((s, g) => s + g.oppPts, 0));
        t.avg = gp ? r1(t.pf / gp) : 0;
        t.last3 = gp ? r1(t.games.slice(-3).reduce((s, g) => s + g.pts, 0) / Math.min(3, gp)) : 0;
        t.allPlay = { w: t.games.reduce((s, g) => s + (g.allPlayW || 0), 0), l: t.games.reduce((s, g) => s + (g.allPlayL || 0), 0) };
        t.allPlayPct = (t.allPlay.w + t.allPlay.l) ? t.allPlay.w / (t.allPlay.w + t.allPlay.l) : 0;
        t.winPct = gp ? (t.record.wins + 0.5 * t.record.ties) / gp : 0;
        t.expectedWins = r1(t.allPlayPct * gp);
        t.luck = r1(t.record.wins - t.expectedWins); // + = lucky
        const mean = t.avg; const sd = gp > 1 ? Math.sqrt(t.games.reduce((s, g) => s + (g.pts - mean) ** 2, 0) / (gp - 1)) : 0;
        t.stdDev = r1(sd);
        t.benchLeftTotal = r1(Object.values(t.weeks).reduce((s, w) => s + w.benchLeft, 0));
        t.lineupEfficiency = Object.values(t.weeks).length ? r1(100 * Object.values(t.weeks).reduce((s, w) => s + w.actualLineup, 0) / Math.max(1, Object.values(t.weeks).reduce((s, w) => s + w.optimalLineup, 0))) : 100;
        // rest-of-season roster strength: best lineup by (season projection - season actual)
        const cur = t.weeks[WEEK];
        const rosPlayers = cur ? [...cur.starters, ...cur.bench].map(p => ({ id: p.id, eligible: p.eligible, pts: Math.max(0, p.seasonProj - p.seasonPts) })) : [];
        t.rosStrength = r1(optimalLineup(rosPlayers, slotCounts));
        t.projTotal = cur ? r1(t.pf + t.rosStrength) : 0;
    });

    // ---- remaining schedule ----
    const allSched = (league.schedule || []).filter(m => m.home && m.away && (m.playoffTierType || 'NONE') === 'NONE' && m.matchupPeriodId > WEEK && m.matchupPeriodId <= totalWeeks);
    const maxRos = Math.max(...Object.values(teams).map(t => t.rosStrength)) || 1;
    const strength = (t) => 0.5 * t.allPlayPct + 0.5 * (t.rosStrength / maxRos);
    Object.values(teams).forEach(t => {
        const opps = allSched.filter(m => m.home.teamId === t.id || m.away.teamId === t.id).map(m => teams[m.home.teamId === t.id ? m.away.teamId : m.home.teamId]).filter(Boolean);
        t.remaining = { games: opps.length, avgOppStrength: opps.length ? r1(100 * opps.reduce((s, o) => s + strength(o), 0) / opps.length) : null, opponents: opps.map(o => o.abbrev) };
        const divOpps = opps.filter(o => o.divisionId === t.divisionId);
        t.divisionFoes = { games: divOpps.length, avgStrength: divOpps.length ? r1(100 * divOpps.reduce((s, o) => s + strength(o), 0) / divOpps.length) : null };
    });
    const sosVals = Object.values(teams).map(t => t.remaining.avgOppStrength).filter(x => x !== null);
    const sosRank = [...Object.values(teams)].sort((a, b) => (b.remaining.avgOppStrength || 0) - (a.remaining.avgOppStrength || 0));
    sosRank.forEach((t, i) => { t.remaining.rank = i + 1; }); // 1 = hardest

    // ---- power score ----
    const maxAvg = Math.max(...Object.values(teams).map(t => t.avg)) || 1;
    const R = 0.45 + 0.35 * Math.min(WEEK, 6) / 6; // results weight ramps from ~0.5 (wk1) to 0.8 (wk6+)
    const P = 1 - R;
    Object.values(teams).forEach(t => {
        const results = 0.35 * t.winPct + 0.35 * t.allPlayPct + 0.30 * (t.avg / maxAvg);
        const espnRankScore = t.espnProjectedRank ? 1 - (t.espnProjectedRank - 1) / (n - 1) : 0.5;
        const projection = 0.6 * (t.rosStrength / maxRos) + 0.4 * espnRankScore;
        t.components = { results: r1(100 * results), projection: r1(100 * projection), resultsWeight: r1(R * 100) / 100, projectionWeight: r1(P * 100) / 100 };
        t.power = r1(100 * (R * results + P * projection));
    });
    const ranked = Object.values(teams).sort((a, b) => b.power - a.power || b.avg - a.avg);
    ranked.forEach((t, i) => { t.rank = i + 1; });

    // movement: vs last week's file if it exists, else vs ESPN preseason projection
    const outDir = path.join(ROOT, 'data', 'power-rankings', String(SEASON));
    fs.mkdirSync(outDir, { recursive: true });
    const prevFile = path.join(outDir, `week-${String(WEEK - 1).padStart(2, '0')}.json`);
    let prevRanks = null, movementBasis = 'preseason';
    if (WEEK > 1 && fs.existsSync(prevFile)) { prevRanks = Object.fromEntries(JSON.parse(fs.readFileSync(prevFile, 'utf8')).teams.map(t => [t.id, t.rank])); movementBasis = `week ${WEEK - 1}`; }
    ranked.forEach(t => {
        const prev = prevRanks ? prevRanks[t.id] : (t.draftDayProjectedRank || t.espnProjectedRank || null);
        t.previousRank = prev || null;
        t.movement = prev ? prev - t.rank : 0;
    });

    // ---- name history + draft grades ----
    let nameHistory = {};
    try {
        const ld = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'league-data.json'), 'utf8')).seasons;
        Object.keys(ld).sort().forEach(y => (ld[y].teams || []).forEach(tm => { (nameHistory[tm.primaryOwner] = nameHistory[tm.primaryOwner] || []).push({ year: +y, name: tm.name }); }));
    } catch (e) { console.warn('name history unavailable:', e.message); }
    let grades = [];
    try { grades = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `draft-grades-${SEASON}.json`), 'utf8')); } catch (e) { }
    const gradeFor = (t) => grades.find(g => g.ownerKey && g.ownerKey === t.owner) || grades.find(g => g.team && g.team.toLowerCase() === t.name.toLowerCase()) || null;

    // ---- awards ----
    const wkNow = WEEK;
    const byTeam = id => teams[id];
    const pick = (arr, key, desc = true) => arr.filter(x => x.week === wkNow).sort((a, b) => desc ? b[key] - a[key] : a[key] - b[key])[0] || null;
    const weekGames = Object.values(teams).map(t => ({ t, g: t.games.find(g => g.week === wkNow) })).filter(x => x.g);
    const awards = {
        highScore: weekGames.sort((a, b) => b.g.pts - a.g.pts)[0] ? { teamId: weekGames[0].t.id, pts: weekGames[0].g.pts } : null,
        lowScore: weekGames.length ? { teamId: weekGames[weekGames.length - 1].t.id, pts: weekGames[weekGames.length - 1].g.pts } : null,
        benchBomb: pick(receipts.benchBombs, 'swing'),
        questionableStart: pick(receipts.questionableStarts, 'ptsGap'),
        worstDefense: receipts.defenses.filter(x => x.week === wkNow).sort((a, b) => a.pts - b.pts)[0] || null,
        bestDefense: receipts.defenses.filter(x => x.week === wkNow).sort((a, b) => b.pts - a.pts)[0] || null,
        boom: pick(receipts.booms, 'delta'),
        bust: pick(receipts.busts, 'delta', false),
        luckiestWin: weekGames.filter(x => x.g.won).sort((a, b) => a.g.pts - b.g.pts)[0] ? (x => ({ teamId: x.t.id, pts: x.g.pts, oppPts: x.g.oppPts, weekRank: x.g.weekRank }))(weekGames.filter(x => x.g.won).sort((a, b) => a.g.pts - b.g.pts)[0]) : null,
        toughestLoss: weekGames.filter(x => !x.g.won).sort((a, b) => b.g.pts - a.g.pts)[0] ? (x => ({ teamId: x.t.id, pts: x.g.pts, oppPts: x.g.oppPts, weekRank: x.g.weekRank }))(weekGames.filter(x => !x.g.won).sort((a, b) => b.g.pts - a.g.pts)[0]) : null,
        blowout: weekGames.map(x => ({ teamId: x.t.id, margin: r1(x.g.pts - x.g.oppPts), opp: x.g.opp })).sort((a, b) => b.margin - a.margin)[0] || null,
        closest: weekGames.map(x => ({ teamId: x.t.id, margin: r1(x.g.pts - x.g.oppPts), opp: x.g.opp })).filter(x => x.margin > 0).sort((a, b) => a.margin - b.margin)[0] || null
    };

    // ---- output ----
    const out = {
        season: SEASON, week: WEEK, totalWeeks, playoffSpots, generatedAt: new Date().toISOString(), finalized: !LIVE || Object.values(teams).every(t => t.games.every(g => g.final)),
        method: { resultsWeight: r1(R * 100), projectionWeight: r1(P * 100), movementBasis, leaguePtsPerDollar },
        teams: ranked.map(t => ({
            id: t.id, rank: t.rank, previousRank: t.previousRank, movement: t.movement, power: t.power, components: t.components,
            name: t.name, abbrev: t.abbrev, owner: t.owner, ownerId: t.ownerId, logo: t.logo, division: t.division,
            record: t.record, pf: t.pf, pa: t.pa, avg: t.avg, last3: t.last3, stdDev: t.stdDev,
            allPlay: t.allPlay, allPlayPct: r1(100 * t.allPlayPct), expectedWins: t.expectedWins, luck: t.luck,
            espnProjectedRank: t.espnProjectedRank, draftDayProjectedRank: t.draftDayProjectedRank, rosStrength: t.rosStrength, projTotal: t.projTotal,
            benchLeftTotal: t.benchLeftTotal, lineupEfficiency: t.lineupEfficiency, transactions: t.transactions,
            remaining: t.remaining, divisionFoes: t.divisionFoes,
            games: t.games,
            thisWeek: t.weeks[WEEK] ? { actualLineup: t.weeks[WEEK].actualLineup, optimalLineup: t.weeks[WEEK].optimalLineup, benchLeft: t.weeks[WEEK].benchLeft,
                starters: t.weeks[WEEK].starters.map(p => ({ name: p.name, pos: p.pos, slot: p.slotName, pts: p.pts, proj: p.proj, injury: p.injury })),
                bench: t.weeks[WEEK].bench.map(p => ({ name: p.name, pos: p.pos, pts: p.pts, proj: p.proj, injury: p.injury })) } : null,
            keepers: keepers.filter(k => k.teamId === t.id),
            draftGrade: gradeFor(t),
            nameHistory: (nameHistory[t.ownerId] || []).filter(h => h.year < SEASON),
            commentary: null
        })),
        receipts, awards,
        commentary: { intro: null, awards: {}, outro: null, author: null }
    };
    const outFile = path.join(outDir, `week-${String(WEEK).padStart(2, '0')}.json`);
    // Never clobber commentary that was already written for this week
    if (fs.existsSync(outFile)) {
        try {
            const prev = JSON.parse(fs.readFileSync(outFile, 'utf8'));
            if (prev.commentary && (prev.commentary.intro || prev.commentary.outro)) out.commentary = prev.commentary;
            const prevTeams = Object.fromEntries((prev.teams || []).map(t => [t.id, t]));
            out.teams.forEach(t => { if (prevTeams[t.id] && prevTeams[t.id].commentary) t.commentary = prevTeams[t.id].commentary; });
            out.previousBuild = { generatedAt: prev.generatedAt, finalized: prev.finalized, order: (prev.teams || []).map(t => t.id) };
            console.log('Kept existing commentary from', prev.generatedAt);
        } catch (e) { console.warn('Could not read previous file:', e.message); }
    }
    fs.writeFileSync(outFile, JSON.stringify(out, null, 1));

    // index of published weeks (commentary-complete files only get flagged by the publisher)
    const idxFile = path.join(ROOT, 'data', 'power-rankings', 'index.json');
    let idx = { seasons: {} };
    try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch (e) { }
    idx.seasons[SEASON] = idx.seasons[SEASON] || { weeks: [] };
    if (!idx.seasons[SEASON].weeks.includes(WEEK)) idx.seasons[SEASON].weeks.push(WEEK);
    idx.seasons[SEASON].weeks.sort((a, b) => a - b);
    idx.latest = { season: SEASON, week: Math.max(...idx.seasons[SEASON].weeks) };
    fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1));

    console.log(`\nWrote ${path.relative(ROOT, outFile)}  (results ${Math.round(R * 100)}% / projection ${Math.round(P * 100)}%)\n`);
    ranked.forEach(t => console.log(String(t.rank).padStart(2), (t.movement > 0 ? '+' : '') + t.movement, t.owner.padEnd(11), t.name.padEnd(34), `${t.record.wins}-${t.record.losses}`, 'pf', String(t.pf).padStart(6), 'allplay', `${t.allPlay.w}-${t.allPlay.l}`.padEnd(5), 'ros', String(t.rosStrength).padStart(6), 'espn#' + String(t.espnProjectedRank).padEnd(2), 'eff', t.lineupEfficiency + '%', 'power', t.power));
    console.log('\nawards:', JSON.stringify(awards, null, 0).slice(0, 1200));
})().catch(e => { console.error(e); process.exit(1); });
