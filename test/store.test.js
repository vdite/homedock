import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DashboardStore, normalizeDashboard } from '../store.js';

test('normalizes a valid dashboard', () => {
  const result = normalizeDashboard({
    groups: [{
      id: 'group-1',
      name: ' Arbeit ',
      color: '#FFAA00',
      links: [{ id: 'link-1', name: ' Git ', url: 'https://git.example.test', icon: ' G ' }],
    }],
  });

  assert.equal(result.groups[0].name, 'Arbeit');
  assert.equal(result.groups[0].color, '#ffaa00');
  assert.equal(result.groups[0].links[0].url, 'https://git.example.test/');
  assert.equal(result.groups[0].links[0].icon, 'G');
});

test('rejects unsafe URL schemes', () => {
  assert.throws(() => normalizeDashboard({
    groups: [{ name: 'X', links: [{ name: 'Bad', url: 'javascript:alert(1)' }] }],
  }), /http/);
});

test('writes and reads the dashboard atomically', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'homedock-'));
  const file = path.join(directory, 'dashboard.json');
  const store = new DashboardStore(file);
  await store.save({ groups: [{ name: 'Privat', color: '#123456', links: [] }] });

  const persisted = JSON.parse(await readFile(file, 'utf8'));
  const loaded = await store.read();
  assert.equal(persisted.groups[0].name, 'Privat');
  assert.equal(loaded.groups[0].name, 'Privat');
});
