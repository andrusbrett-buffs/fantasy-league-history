#!/usr/bin/env node
/**
 * Render a published power rankings week into an email (HTML + plain text).
 *   node scripts/build-email.js --week 1 [--season 2026] --out /path/email.json [--archive /path/entry.json]
 * Writes {subject, html, text} as JSON to --out (or stdout).
 * --archive adds a "From the Archive" photo block before the outro. The entry is
 * {kicker, caption, alt, src?}; src defaults to cid:att0, the first inline attachment of the email.
 * --archive-queue /path/queue.json uses the queue's next unused photo instead and adds an
 * `archive` object (path, sha256, contentRef) to the output for attaching it inline.
 * Add --mark-used (with --archive-queue and --week) after the email is sent to retire that photo.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEASON = parseInt(argVal('--season', String(new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1)), 10);
const WEEK = parseInt(argVal('--week', '0'), 10);
const OUT = argVal('--out', null);
const SITE = argVal('--site', 'https://fadunkadunk.up.railway.app/');
if (!WEEK) { console.error('Usage: --week N'); process.exit(1); }

const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'power-rankings', String(SEASON), `week-${String(WEEK).padStart(2, '0')}.json`), 'utf8'));
const c = d.commentary || {};
const byId = Object.fromEntries(d.teams.map(t => [t.id, t]));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const paras = (t, style) => String(t || '').split(/\n\s*\n/).map(p => `<p style="margin:0 0 12px;${style || ''}">${esc(p.trim())}</p>`).join('');
const mv = t => !t.previousRank ? '' : t.movement > 0 ? `<span style="color:#2e9e6b">▲${t.movement}</span>` : t.movement < 0 ? `<span style="color:#c9502a">▼${-t.movement}</span>` : '<span style="color:#999">—</span>';
const mvText = t => !t.previousRank ? '' : t.movement > 0 ? `(+${t.movement})` : t.movement < 0 ? `(${t.movement})` : '(—)';

const A = d.awards || {};
const nm = id => byId[id] ? `${byId[id].name} (${byId[id].owner})` : '';
const awardRows = [
    ['High Score', A.highScore && `${nm(A.highScore.teamId)}, ${A.highScore.pts}`, c.awards?.highScore],
    ['Low Score', A.lowScore && `${nm(A.lowScore.teamId)}, ${A.lowScore.pts}`, c.awards?.lowScore],
    ['Bench Bomb', A.benchBomb && `${nm(A.benchBomb.teamId)}: ${A.benchBomb.benched} ${A.benchBomb.benchedPts} sat behind ${A.benchBomb.started} ${A.benchBomb.startedPts}`, c.awards?.benchBomb],
    ['Questionable Start', A.questionableStart && `${nm(A.questionableStart.teamId)}: ${A.questionableStart.started} over ${A.questionableStart.benched}`, c.awards?.questionableStart],
    ['Ill-Advised Defense', A.worstDefense && `${nm(A.worstDefense.teamId)}: ${A.worstDefense.defense} ${A.worstDefense.pts}`, c.awards?.worstDefense],
    ['Defense of the Week', A.bestDefense && `${nm(A.bestDefense.teamId)}: ${A.bestDefense.defense} ${A.bestDefense.pts}`, c.awards?.bestDefense],
    ['Boom', A.boom && `${nm(A.boom.teamId)}: ${A.boom.player} ${A.boom.pts} (proj ${A.boom.proj})`, c.awards?.boom],
    ['Bust', A.bust && `${nm(A.bust.teamId)}: ${A.bust.player} ${A.bust.pts} (proj ${A.bust.proj})`, c.awards?.bust],
    ['Luckiest Win', A.luckiestWin && `${nm(A.luckiestWin.teamId)}, won with the #${A.luckiestWin.weekRank} score`, c.awards?.luckiestWin],
    ['Toughest Loss', A.toughestLoss && `${nm(A.toughestLoss.teamId)}, lost with the #${A.toughestLoss.weekRank} score`, c.awards?.toughestLoss],
    ['Blowout', A.blowout && `${nm(A.blowout.teamId)} by ${A.blowout.margin}`, c.awards?.blowout],
    ['Nail-Biter', A.closest && `${nm(A.closest.teamId)} by ${A.closest.margin}`, c.awards?.closest]
].filter(r => r[1]);
const AWARD_KEYS = ['highScore', 'lowScore', 'benchBomb', 'questionableStart', 'worstDefense', 'bestDefense', 'boom', 'bust', 'luckiestWin', 'toughestLoss', 'blowout', 'closest'];
const allRows = [
    ['High Score', A.highScore && `${nm(A.highScore.teamId)}, ${A.highScore.pts}`, c.awards?.highScore],
    ['Low Score', A.lowScore && `${nm(A.lowScore.teamId)}, ${A.lowScore.pts}`, c.awards?.lowScore],
    ['Bench Bomb', A.benchBomb && `${nm(A.benchBomb.teamId)}: ${A.benchBomb.benched} ${A.benchBomb.benchedPts} sat behind ${A.benchBomb.started} ${A.benchBomb.startedPts}`, c.awards?.benchBomb],
    ['Questionable Start', A.questionableStart && `${nm(A.questionableStart.teamId)}: ${A.questionableStart.started} over ${A.questionableStart.benched}`, c.awards?.questionableStart],
    ['Ill-Advised Defense', A.worstDefense && `${nm(A.worstDefense.teamId)}: ${A.worstDefense.defense} ${A.worstDefense.pts}`, c.awards?.worstDefense],
    ['Defense of the Week', A.bestDefense && `${nm(A.bestDefense.teamId)}: ${A.bestDefense.defense} ${A.bestDefense.pts}`, c.awards?.bestDefense],
    ['Boom', A.boom && `${nm(A.boom.teamId)}: ${A.boom.player} ${A.boom.pts} (proj ${A.boom.proj})`, c.awards?.boom],
    ['Bust', A.bust && `${nm(A.bust.teamId)}: ${A.bust.player} ${A.bust.pts} (proj ${A.bust.proj})`, c.awards?.bust],
    ['Luckiest Win', A.luckiestWin && `${nm(A.luckiestWin.teamId)}, won with the #${A.luckiestWin.weekRank} score`, c.awards?.luckiestWin],
    ['Toughest Loss', A.toughestLoss && `${nm(A.toughestLoss.teamId)}, lost with the #${A.toughestLoss.weekRank} score`, c.awards?.toughestLoss],
    ['Blowout', A.blowout && `${nm(A.blowout.teamId)} by ${A.blowout.margin}`, c.awards?.blowout],
    ['Nail-Biter', A.closest && `${nm(A.closest.teamId)} by ${A.closest.margin}`, c.awards?.closest]
];
const featuredRows = Array.isArray(c.featured) && c.featured.length ? c.featured.map(k => allRows[AWARD_KEYS.indexOf(k)]).filter(r => r && r[1]) : awardRows;

// "From the Archive" photo. Either a single entry (--archive entry.json) or a queue
// (--archive-queue queue.json: the first photo whose usedWeek is null is used).
// With --mark-used the queue's next photo is stamped with this week and nothing is built.
const ARCHIVE = argVal('--archive', null);
const QUEUE = argVal('--archive-queue', null);
let arch = ARCHIVE ? JSON.parse(fs.readFileSync(ARCHIVE, 'utf8')) : null;
let archiveOut = null;
if (QUEUE) {
    const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
    const next = (queue.photos || []).find(p => p.usedWeek == null) || null;
    if (args.includes('--mark-used')) {
        if (!next) { console.log('No unused archive photo to mark'); process.exit(0); }
        next.usedWeek = WEEK; next.usedOn = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 1));
        console.log(`Marked ${next.file} as used for week ${WEEK}`);
        process.exit(0);
    }
    if (next) {
        const file = path.join(path.dirname(path.resolve(QUEUE)), next.file);
        const sha = fs.existsSync(file) ? require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
        if (sha && sha === next.sha256) {
            arch = next;
            archiveOut = { path: file, filename: next.file, mimeType: 'image/jpeg', sha256: sha, contentRef: `sha256:${sha}:${file}`, kicker: next.kicker, caption: next.caption };
        } else console.error(`Archive photo skipped: ${next.file} is missing or does not match its sha256`);
    } else console.error('Archive photo skipped: the queue has no unused photos');
}
const archHtml = arch ? `<h2 style="font-size:18px;margin:28px 0 10px">From the Archive</h2>
  <div style="border:1px solid #eee;border-radius:6px;overflow:hidden;margin:0 0 24px">
    <img src="${esc(arch.src || 'cid:att0')}" alt="${esc(arch.alt || 'A photo from the league archive')}" width="640" style="display:block;width:100%;max-width:640px;height:auto">
    <div style="padding:12px 14px 14px">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#b08d1f">${esc(arch.kicker)}</div>
      <div style="font-size:14px;margin-top:4px">${esc(arch.caption)}</div>
    </div>
  </div>` : '';

const subject = `Fadunkadunk Power Rankings: Week ${WEEK}`;
const html = `
<div style="max-width:680px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c1c;line-height:1.55">
  <div style="border-bottom:3px solid #c9a227;padding-bottom:12px;margin-bottom:20px">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#777">Fadunkadunk · ${d.season} Season</div>
    <h1 style="margin:4px 0 0;font-size:26px">Power Rankings, Week ${WEEK}</h1>
    <div style="font-size:13px;color:#777;margin-top:4px">Results ${Math.round(d.method.resultsWeight)}% · Projection ${Math.round(d.method.projectionWeight)}% · Movement vs ${esc(d.method.movementBasis)} · <a href="${SITE}" style="color:#0d7a6f">Open the site</a></div>
  </div>
  ${c.intro ? `<div style="border-left:3px solid #c9a227;padding:2px 0 2px 14px;margin-bottom:24px">${paras(c.intro)}</div>` : ''}

  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px">
    <tr style="background:#f4f1ea"><th style="text-align:left;padding:8px">#</th><th style="text-align:left;padding:8px">Team</th><th style="text-align:right;padding:8px">Rec</th><th style="text-align:right;padding:8px">Avg PF</th><th style="text-align:right;padding:8px">All-Play</th><th style="text-align:right;padding:8px">Power</th></tr>
    ${d.teams.map(t => `<tr style="border-bottom:1px solid #eee">
      <td style="padding:8px;font-weight:700;color:#b08d1f">${t.rank} <span style="font-size:11px;font-weight:500">${mv(t)}</span></td>
      <td style="padding:8px"><b>${esc(t.name)}</b><br><span style="color:#777;font-size:12px">${esc(t.owner)}</span></td>
      <td style="padding:8px;text-align:right">${t.record.wins}-${t.record.losses}${t.record.ties ? '-' + t.record.ties : ''}</td>
      <td style="padding:8px;text-align:right">${t.avg.toFixed(1)}</td>
      <td style="padding:8px;text-align:right">${t.allPlay.w}-${t.allPlay.l}</td>
      <td style="padding:8px;text-align:right;font-weight:700">${t.power.toFixed(1)}</td></tr>`).join('')}
  </table>

  ${featuredRows.length ? `<h2 style="font-size:18px;margin:0 0 10px">Week ${WEEK} Receipts</h2>
  ${featuredRows.map(([label, line, blurb]) => `<div style="margin:0 0 12px"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#b08d1f">${label}</div><div style="font-weight:600">${esc(line)}</div>${blurb ? `<div style="color:#555;font-size:13px">${esc(blurb)}</div>` : ''}</div>`).join('')}` : ''}

  <h2 style="font-size:18px;margin:28px 0 10px">Team by Team</h2>
  ${d.teams.map(t => `<div style="margin:0 0 20px;padding:0 0 16px;border-bottom:1px solid #eee">
    <div style="font-size:16px"><b style="color:#b08d1f">${t.rank}.</b> <b>${esc(t.name)}</b> <span style="color:#777;font-size:13px">${esc(t.owner)} · ${t.record.wins}-${t.record.losses} · ${mv(t)}</span></div>
    ${t.commentary ? paras(t.commentary, 'margin:8px 0 0;font-size:14px') : ''}
  </div>`).join('')}

  ${archHtml}
  ${c.outro ? `<div style="border-left:3px solid #0d7a6f;padding:2px 0 2px 14px;margin:8px 0 24px">${paras(c.outro)}</div>` : ''}
  <div style="font-size:12px;color:#999">Rankings blend results and rest-of-season projections; commentary${c.author ? ' by ' + esc(c.author) : ''}. Full breakdown, chips, and past weeks at <a href="${SITE}" style="color:#0d7a6f">${SITE}</a></div>
</div>`;

const text = [
    `FADUNKADUNK POWER RANKINGS — WEEK ${WEEK}`, '',
    c.intro || '', '',
    ...d.teams.map(t => `${String(t.rank).padStart(2)}. ${t.name} (${t.owner}) ${mvText(t)}  ${t.record.wins}-${t.record.losses}  avg ${t.avg.toFixed(1)}  all-play ${t.allPlay.w}-${t.allPlay.l}  power ${t.power.toFixed(1)}`), '',
    `WEEK ${WEEK} RECEIPTS`, ...featuredRows.map(([l, line, b]) => `- ${l}: ${line}${b ? ' — ' + b : ''}`), '',
    'TEAM BY TEAM', ...d.teams.flatMap(t => [`${t.rank}. ${t.name} (${t.owner})`, t.commentary || '', '']),
    ...(arch ? ['FROM THE ARCHIVE', `${arch.kicker}: ${arch.caption}`, ''] : []),
    c.outro || '', '', `Full site: ${SITE}`
].join('\n');

const out = JSON.stringify(archiveOut ? { subject, html, text, archive: archiveOut } : { subject, html, text }, null, 1);
if (OUT) { fs.writeFileSync(OUT, out); console.log(`Wrote ${OUT} (${html.length} chars html)`); } else process.stdout.write(out);
