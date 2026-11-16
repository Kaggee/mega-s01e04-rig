import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const configBase = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

const tempDirs: string[] = [];

async function makeRunsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(dir);
  return dir;
}

async function writeNight(runsDir: string, lines: string[]): Promise<void> {
  await mkdir(runsDir, { recursive: true });
  await writeFile(join(runsDir, `${night}.jsonl`), lines.join('\n'), 'utf8');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('digest routes', () => {
  it('renders the same ordered job summaries in HTML and JSON', async () => {
    const runsDir = await makeRunsDir();
    await writeNight(runsDir, [
      JSON.stringify({ at: '2026-10-28T08:00:00+02:00', job: 'zeta', status: 'retry', owner: 'Zoë', error: 'temporary' }),
      JSON.stringify({ at: '2026-10-28T08:01:00+02:00', job: 'alpha', status: 'fail', owner: null, error: 'first attempt failed' }),
      JSON.stringify({ at: '2026-10-28T08:02:00+02:00', job: 'zeta', status: 'retry', owner: 'Zoë' }),
      JSON.stringify({ at: '2026-10-28T08:03:00+02:00', job: 'zeta', status: 'retry', owner: 'Zoë' }),
      JSON.stringify({ at: '2026-10-28T08:04:00+02:00', job: 'zeta', status: 'ok', owner: 'Zoë' }),
      JSON.stringify({ at: '2026-10-28T06:05:00Z', job: 'alpha', status: 'ok', owner: null }),
    ]);
    const app = createApp({ ...configBase, runsDir });

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    expect(digest).toMatchObject({
      kind: 'found',
      night,
      badLines: 0,
      counts: { ok: 2, retry: 3, fail: 1 },
      rows: [
        {
          job: 'alpha', owner: null, runs: 2, retries: 0, failures: 1,
          lastStatus: 'ok', lastError: 'first attempt failed',
          firstAt: '2026-10-28T08:01:00+02:00', lastAt: '2026-10-28T06:05:00Z',
        },
        {
          job: 'zeta', owner: 'Zoë', runs: 4, retries: 3, failures: 0,
          lastStatus: 'ok', lastError: 'temporary',
          firstAt: '2026-10-28T08:00:00+02:00', lastAt: '2026-10-28T08:04:00+02:00',
        },
      ],
    });

    expect(html.indexOf('alpha')).toBeGreaterThan(-1);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('—');
    expect(html).toContain('Zoë');
    expect(html).toContain('2026-10-28T08:01:00+02:00');
    expect(html).toContain('2026-10-28T06:05:00Z');
    expect(html).toContain('warning: 3');
    expect(html).toContain('warning: 1');
    // The failure was recovered, so the latest status is ok while the failure stays visible.
    expect(html).toContain('first attempt failed');
    expect(html).toContain('ok');
  });

  it('returns a distinct 404 for a missing night', async () => {
    const app = createApp({ ...configBase, runsDir: await makeRunsDir() });

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    expect(await jsonResponse.json()).toEqual({ kind: 'missing', night });
  });

  it('renders an existing empty night as nothing ran with zero counts', async () => {
    const runsDir = await makeRunsDir();
    await writeNight(runsDir, []);
    const app = createApp({ ...configBase, runsDir });

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      kind: 'found', night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts malformed JSON lines while rendering valid jobs', async () => {
    const runsDir = await makeRunsDir();
    await writeNight(runsDir, [
      JSON.stringify({ at: '2026-10-28T09:00:00-04:00', job: 'build', status: 'ok', owner: 'Rae' }),
      '{not valid json',
    ]);
    const app = createApp({ ...configBase, runsDir });

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('build');
    expect(html).toContain('warning: 1 malformed line');
    expect(jsonResponse.status).toBe(200);
    expect(digest).toMatchObject({
      kind: 'found', night, badLines: 1,
      counts: { ok: 1, retry: 0, fail: 0 },
      rows: [{ job: 'build', runs: 1, lastStatus: 'ok', firstAt: '2026-10-28T09:00:00-04:00' }],
    });
  });
});
