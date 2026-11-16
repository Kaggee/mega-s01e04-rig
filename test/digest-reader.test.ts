import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readNight } from '../src/digest/reader.js'

const night = '2026-10-28'
const directories: string[] = []

async function fixture(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'rig-reader-'))
  directories.push(directory)
  await writeFile(join(directory, `${night}.jsonl`), content)
  return directory
}

function event(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    at: '2026-10-28T23:00:00+01:00', job: 'job', owner: 'owner', status: 'ok', ...overrides,
  })
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('readNight', () => {
  it('reads the supplied night, preserving recovered errors and null owners', async () => {
    const digest = await readNight('runs', night)
    expect(digest.kind).toBe('found')
    if (digest.kind !== 'found') throw new Error('fixture missing')
    expect(digest.badLines).toBe(1)
    expect(digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 })
    expect(digest.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ])
    expect(digest.rows.reduce((total, row) => total + row.runs, 0)).toBe(15)
    expect(digest.rows[0].owner).toBeNull()
    expect(digest.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    })
    expect(digest.rows[2]).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' })
    expect(digest.rows[3]).toMatchObject({ failures: 1, lastStatus: 'fail', lastError: 'quota exceeded' })
  })

  it('orders by instants across offsets, uses line-order ties and retains the latest past error', async () => {
    const directory = await fixture([
      event({ at: '2026-10-29T00:00:00+01:00', status: 'retry', error: 'latest error' }),
      event({ at: '2026-10-28T22:30:00Z', status: 'fail', error: 'earlier failure' }),
      event({ at: '2026-10-28T23:00:00Z', owner: null }),
      event({ at: '2026-10-28T23:30:00+02:00', error: 'first error' }),
    ].join('\n'))
    expect(await readNight(directory, night)).toEqual({
      kind: 'found', night, badLines: 0, counts: { ok: 2, retry: 1, fail: 1 },
      rows: [{
        job: 'job', owner: null, runs: 4, retries: 1, failures: 1,
        lastStatus: 'ok', lastError: 'latest error',
        firstAt: '2026-10-28T23:30:00+02:00', lastAt: '2026-10-28T23:00:00Z',
      }],
    })
  })

  it('sorts job names by code units and retains jobs with missing owners', async () => {
    const directory = await fixture(['z', 'ä', 'a', 'Z', '__proto__'].map(job => event({ job, owner: null })).join('\n'))
    const digest = await readNight(directory, night)
    if (digest.kind !== 'found') throw new Error('fixture missing')
    expect(digest.rows.map(row => row.job)).toEqual(['Z', '__proto__', 'a', 'z', 'ä'])
    expect(digest.rows.every(row => row.owner === null && row.lastError === null)).toBe(true)
  })

  it('counts malformed nonblank lines and rejects invalid fields at the edge', async () => {
    const invalid = [
      '{broken', 'null', '[]', '42', '{}',
      event({ at: 4 }), event({ at: 'tomorrow' }), event({ at: '2026-02-30T12:00:00Z' }),
      event({ at: '2026-10-28T12:00:00' }), event({ at: '2026-10-28T24:00:00Z' }),
      event({ job: null }), event({ job: '  ' }), event({ status: 'done' }),
      event({ owner: 4 }), event({ owner: undefined }), event({ error: null }), event({ error: {} }),
    ]
    const directory = await fixture(['', ' \t ', ...invalid, event({ error: '' }), '', ''].join('\r\n'))
    const digest = await readNight(directory, night)
    if (digest.kind !== 'found') throw new Error('fixture missing')
    expect(digest.badLines).toBe(invalid.length)
    expect(digest.counts).toEqual({ ok: 1, retry: 0, fail: 0 })
    expect(digest.rows).toHaveLength(1)
    expect(digest.rows[0].lastError).toBe('')
  })

  it.each(['', '\n  \t\r\n'])('distinguishes empty or blank files from missing files (%j)', async content => {
    const directory = await fixture(content)
    expect(await readNight(directory, night)).toEqual({
      kind: 'found', night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    })
    expect(await readNight(directory, '2026-10-27')).toEqual({ kind: 'missing', night: '2026-10-27' })
  })

  it.each(['../2026-10-28', '..\\2026-10-28', '2026-1-1', '2026-02-29', '2026-13-01', ''])('rejects invalid night %j', async invalidNight => {
    const directory = await fixture(event())
    expect(await readNight(directory, invalidNight)).toEqual({ kind: 'missing', night: invalidNight })
  })

  it('accepts leap days and fractional seconds', async () => {
    const directory = await fixture('')
    await writeFile(join(directory, '2024-02-29.jsonl'), event({ at: '2024-02-29T23:59:59.123-05:00' }))
    const digest = await readNight(directory, '2024-02-29')
    expect(digest).toMatchObject({ kind: 'found', badLines: 0, counts: { ok: 1, retry: 0, fail: 0 } })
  })

  it('rejects other filesystem errors instead of reporting a missing night', async () => {
    const directory = await fixture('')
    await mkdir(join(directory, '2026-10-29.jsonl'))
    await expect(readNight(directory, '2026-10-29')).rejects.toMatchObject({ code: 'EISDIR' })
  })
})
