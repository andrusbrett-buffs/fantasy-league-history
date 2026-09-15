#!/usr/bin/env node
/**
 * Render a published power rankings week into an email (HTML + plain text).
 *   node scripts/build-email.js --week 1 [--season 2026] --out /path/email.json
 * Writes {subject, html, text} as JSON to --out (or stdout).
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

  ${awardRows.length ? `<h2 style="font-size:18px;margin:0 0 10px">Week ${WEEK} Receipts</h2>
  ${awardRows.map(([label, line, blurb]) => `<div style="margin:0 0 12px"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#b08d1f">${label}</div><div style="font-weight:600">${esc(line)}</div>${blurb ? `<div style="color:#555;font-size:13px">${esc(blurb)}</div>` : ''}</div>`).join('')}` : ''}

  <h2 style="font-size:18px;margin:28px 0 10px">Team by Team</h2>
  ${d.teams.map(t => `<div style="margin:0 0 20px;padding:0 0 16px;border-bottom:1px solid #eee">
    <div style="font-size:16px"><b style="color:#b08d1f">${t.rank}.</b> <b>${esc(t.name)}</b> <span style="color:#777;font-size:13px">${esc(t.owner)} · ${t.record.wins}-${t.record.losses} · ${mv(t)}</span></div>
    ${t.commentary ? paras(t.commentary, 'margin:8px 0 0;font-size:14px') : ''}
  </div>`).join('')}

  ${c.outro ? `<div style="border-left:3px solid #0d7a6f;padding:2px 0 2px 14px;margin:8px 0 24px">${paras(c.outro)}</div>` : ''}
  <div style="font-size:12px;color:#999">Rankings blend results and rest-of-season projections; commentary${c.author ? ' by ' + esc(c.author) : ''}. Full breakdown, chips, and past weeks at <a href="${SITE}" style="color:#0d7a6f">${SITE}</a></div>
</div>`;

const text = [
    `FADUNKADUNK POWER RANKINGS — WEEK ${WEEK}`, '',
    c.intro || '', '',
    ...d.teams.map(t => `${String(t.rank).padStart(2)}. ${t.name} (${t.owner}) ${mvText(t)}  ${t.record.wins}-${t.record.losses}  avg ${t.avg.toFixed(1)}  all-play ${t.allPlay.w}-${t.allPlay.l}  power ${t.power.toFixed(1)}`), '',
    `WEEK ${WEEK} RECEIPTS`, ...awardRows.map(([l, line, b]) => `- ${l}: ${line}${b ? ' — ' + b : ''}`), '',
    'TEAM BY TEAM', ...d.teams.flatMap(t => [`${t.rank}. ${t.name} (${t.owner})`, t.commentary || '', '']),
    c.outro || '', '', `Full site: ${SITE}`
].join('\n');

const out = JSON.stringify({ subject, html, text }, null, 1);
if (OUT) { fs.writeFileSync(OUT, out); console.log(`Wrote ${OUT} (${html.length} chars html)`); } else process.stdout.write(out);
