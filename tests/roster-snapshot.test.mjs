import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { currentInjuryStatuses } from '../src/lib/team-updates-core.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value) + '\n'); };

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sfz-roster-import-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const project = path.join(directory, 'site'), snapshot = path.join(directory, 'roster/snapshots/test'), current = path.join(directory, 'roster/current');
  const updatedAt = new Date().toISOString();
  const source = { team: 'seahawks', asOf: updatedAt, sourceUrl: 'https://www.seahawks.com/team/players-roster/', sourcePublisher: 'Seattle Seahawks' };
  const payloads = {
    'roster.json': { ...source, schemaVersion: 1, season: 2026, players: [{ id: 'club-player', name: 'Club Player', status: 'Active', position: 'QB', balldontlieId: 123 }] },
    'injuries.json': { ...source, schemaVersion: 2, asOf: null, availability: 'unavailable', availabilityReason: 'No dated report available.', sourceCheckedAt: updatedAt, currentReportKeys: [], records: [] },
    'transactions.json': { ...source, schemaVersion: 1, records: [] },
  };
  const manifest = { schema_version: 1, team: 'seahawks', updatedAt, runId: 'test-run', files: {} };
  for (const [name, data] of Object.entries(payloads)) {
    write(path.join(snapshot, name), data);
    manifest.files[name] = createHash('sha256').update(fs.readFileSync(path.join(snapshot, name))).digest('hex');
  }
  write(path.join(snapshot, 'manifest.json'), manifest);
  fs.symlinkSync('snapshots/test', current);
  for (const relative of ['scripts/import-roster-snapshot.mjs', 'src/lib/roster.mjs']) {
    const target = path.join(project, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  }
  const stats = [{ player: { id: 123, full_name: 'Club Player' }, passing_yards: 240, completions: 20, passing_attempts: 30 }];
  const nfl = { team: { id: 31, abbreviation: 'SEA' }, season: 2026, playerStatsSeason: 2025, updatedAt: '2026-09-10T12:00:00Z', playerSeasonStats: stats, currentRoster: [{ id: 'stale' }] };
  for (const name of ['seahawks.json', 'players.json']) write(path.join(project, 'src/data/nfl', name), nfl);
  for (const name of Object.keys(payloads)) write(path.join(project, 'src/data/team', name), { legacy: name });
  const env = { ...process.env, ROSTER_SNAPSHOT_DIR: current };
  delete env.TEAM; delete env.TEAM_ABBREVIATION; delete env.ROSTER_SNAPSHOT_MAX_AGE_HOURS;
  const run = (...args) => spawnSync(process.execPath, [path.join(project, 'scripts/import-roster-snapshot.mjs'), ...args], { encoding: 'utf8', env });
  return { project, snapshot, current, run, nfl, payloads };
}

test('production CLI defaults to Seattle and changes membership without changing NFL statistics', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const roster = read(path.join(f.project, 'src/data/team/roster.json'));
  assert.equal(roster.identityPolicy, 'verified-provider-id');
  assert.equal(roster.players[0].id, 'club-player');
  for (const name of ['seahawks.json', 'players.json']) {
    const data = read(path.join(f.project, 'src/data/nfl', name));
    assert.deepEqual(data.playerSeasonStats, f.nfl.playerSeasonStats);
    assert.equal(data.playerStatsSeason, 2025);
    assert.equal(data.updatedAt, f.nfl.updatedAt);
    assert.equal(data.currentRoster[0].id, 'club-player');
  }
  assert.deepEqual(read(path.join(f.project, 'src/data/team/injuries.json')), f.payloads['injuries.json']);
});

test('missing first snapshot retains Seattle files, while broken or corrupted snapshots stop the build', t => {
  const f = fixture(t), target = path.join(f.project, 'src/data/team/roster.json'), before = fs.readFileSync(target, 'utf8');
  fs.unlinkSync(f.current);
  assert.equal(f.run('--if-available').status, 0);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  fs.symlinkSync('snapshots/missing', f.current);
  assert.notEqual(f.run('--if-available').status, 0);
  fs.unlinkSync(f.current); fs.symlinkSync('snapshots/test', f.current);
  fs.appendFileSync(path.join(f.snapshot, 'transactions.json'), ' ');
  const corrupted = f.run('--if-available');
  assert.notEqual(corrupted.status, 0);
  assert.match(corrupted.stderr, /checksum mismatch/);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
});

test('production build imports roster after NFL and before profiles without scraping', () => {
  const { scripts } = read(path.join(root, 'package.json'));
  const prebuild = scripts.prebuild.split(' && ');
  const nfl = prebuild.indexOf('node scripts/import-nfl-snapshot.mjs --if-available');
  const roster = prebuild.indexOf('node scripts/import-roster-snapshot.mjs --if-available');
  const profiles = prebuild.indexOf('node scripts/generate-player-profiles.mjs');
  assert.ok(nfl >= 0 && roster > nfl && profiles > roster);
  assert.doesNotMatch(scripts.prebuild, /refresh-team-roster|fetch-nfl/);
  assert.equal(scripts['prebuild:offline'], 'node scripts/import-roster-snapshot.mjs --if-available');
  assert.equal(scripts['refresh-team-roster'], 'node scripts/refresh-team-roster.mjs');
});

test('current reserves remain visible when no dated practice report names them', () => {
  const roster = { asOf: '2026-09-12T12:00:00Z', sourceUrl: 'https://www.seahawks.com/team/players-roster/', sourcePublisher: 'Seattle Seahawks', players: [
    { id: 'reserved', name: 'Reserved Player', status: 'Reserve/Injured' },
    { id: 'suspended', name: 'Suspended Player', status: 'Suspended' },
  ] };
  const rows = currentInjuryStatuses([], [], roster, { currentReportKeys: [] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].playerId, 'reserved');
  assert.equal(rows[0].date, roster.asOf);
  assert.equal(rows[0].sourceUrl, roster.sourceUrl);
  assert.equal(rows[0].reportType, 'Roster Status');
  assert.match(rows[0].description, /as of 2026-09-12/);
});
