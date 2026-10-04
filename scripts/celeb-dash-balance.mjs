#!/usr/bin/env node
/**
 * Celeb Dash balance check: a bot plays every night many times and prints
 * how it did against each night's Goal and Expert, plus suggested values.
 *
 *   node scripts/celeb-dash-balance.mjs            # all nights, 12 runs each
 *   node scripts/celeb-dash-balance.mjs 2-3 40     # one night, 40 runs
 *
 * Two bots play: "sharp" decides every 0.15 s, "casual" every 0.9 s. Both
 * own the upgrades a player usually has by that venue. Suggested Goal is a
 * share of the casual bot's average (45% on the first night, up to 70% at
 * the last venue); suggested Expert is 82% of the sharp bot's.
 *
 * The engine is plain TypeScript, so this transpiles it to a temp folder and
 * runs it directly. No app, no simulator.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const SRC = new URL('../src/features/celeb-dash/engine/', import.meta.url);
const OUT = join(tmpdir(), `celeb-dash-engine-${process.pid}`);
mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(SRC)) {
  if (!file.endsWith('.ts')) continue;
  const code = readFileSync(new URL(file, SRC), 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  writeFileSync(join(OUT, file.replace(/\.ts$/, '.js')), js.replace(/from '(\.\/[^']+)'/g, "from '$1.js'"));
}
const load = (name) => import(pathToFileURL(join(OUT, `${name}.js`)).href);
const { LEVELS, LEVELS_BY_ID } = await load('levels');
const { createGame, step, starsFor } = await load('game');
const { botThink } = await load('bot');
const { NO_UPGRADES } = await load('upgrades');

/** What a player usually owns when they reach each venue. */
const EXPECTED_UPGRADES = [
  {},
  { sneakers: 1 },
  { sneakers: 1, tote: 1, chef: 1 },
  { sneakers: 2, tote: 1, chef: 1, dj: 1, bodyguard: 1 },
  { sneakers: 2, tote: 1, chef: 1, dj: 1, bodyguard: 1, glamsquad: 1, powerbank: 1, mesh: 1 },
];
const GOAL_SHARE = { '1-1': 0.45, '1-2': 0.5, '1-3': 0.54, '1-4': 0.57 };
const VENUE_GOAL_SHARE = [0.57, 0.6, 0.64, 0.68, 0.7];

const [only, runsArg] = process.argv.slice(2);
const runs = Number(runsArg ?? 12);
const levels = only ? [LEVELS_BY_ID[only]] : LEVELS;
if (levels.some((l) => !l)) {
  console.error(`No night called ${only}`);
  process.exit(1);
}

/** Plays one night. `reaction` is seconds between decisions; seating takes as long as a person would. */
function play(level, seed, reaction) {
  const s = createGame(level, { ...NO_UPGRADES, ...EXPECTED_UPGRADES[level.chapter - 1] }, seed);
  s.seatingLeft -= Math.min(level.seatingTime - 5, level.guests * (reaction > 0.5 ? 3.5 : 2));
  let wait = 0;
  const dt = 1 / 30;
  while (s.phase !== 'done') {
    wait -= dt;
    if (wait <= 0) {
      botThink(s);
      wait = reaction;
    }
    step(s, dt);
  }
  return s;
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pad = (v, n) => String(v).padStart(n);
const round50 = (v) => Math.round(v / 50) * 50;
console.log('night  name                   goal expert |  sharp unf stars | casual unf stars | suggest goal expert');
for (const level of levels) {
  const sharp = [];
  const casual = [];
  for (let i = 0; i < runs; i++) {
    sharp.push(play(level, 7000 + i, 0.15));
    casual.push(play(level, 8000 + i, 0.9));
  }
  const row = (games) => {
    const score = avg(games.map((s) => s.score));
    return {
      score,
      text: `${pad(Math.round(score), 6)} ${pad(avg(games.map((s) => s.stats.unfollows)).toFixed(1), 3)} ${pad(avg(games.map((s) => starsFor(level, s.score))).toFixed(1), 5)}`,
    };
  };
  const a = row(sharp);
  const b = row(casual);
  const share = GOAL_SHARE[level.id] ?? VENUE_GOAL_SHARE[level.chapter - 1];
  console.log(
    `${level.id.padEnd(6)} ${level.name.padEnd(22)} ${pad(level.goal, 5)} ${pad(level.expert, 6)} | ${a.text} | ${b.text} | ${pad(round50(b.score * share), 12)} ${pad(round50(a.score * 0.82), 6)}`,
  );
}
