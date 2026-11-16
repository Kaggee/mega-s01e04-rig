import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DigestRow, DigestStatus, ReadNight } from './types.js'

interface Event {
  at: string
  instant: number
  job: string
  status: DigestStatus
  owner: string | null
  error?: string
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEvent(line: string): Event | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const { at, job, status, owner, error } = value
  if (
    typeof at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(at) ||
    !isDate(at.slice(0, 10)) ||
    typeof job !== 'string' || job.trim() === '' ||
    (status !== 'ok' && status !== 'retry' && status !== 'fail') ||
    (typeof owner !== 'string' && owner !== null) ||
    (error !== undefined && typeof error !== 'string')
  ) return null
  const instant = Date.parse(at)
  if (!Number.isFinite(instant)) return null
  return { at, instant, job, status, owner, error }
}

export const readNight: ReadNight = async (runsDir, night) => {
  if (!isDate(night)) return { kind: 'missing', night }
  let content: string
  try {
    content = await readFile(join(runsDir, `${night}.jsonl`), 'utf8')
  } catch (error: unknown) {
    if (isRecord(error) && error.code === 'ENOENT') return { kind: 'missing', night }
    throw error
  }

  const events: Event[] = []
  let badLines = 0
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const event = parseEvent(line)
    if (event) events.push(event)
    else badLines++
  }
  // Stable sorting preserves file order for events at the same instant.
  events.sort((a, b) => a.instant - b.instant)
  const rows = new Map<string, DigestRow>()
  const counts = { ok: 0, retry: 0, fail: 0 }
  for (const event of events) {
    counts[event.status]++
    const row = rows.get(event.job) ?? {
      job: event.job,
      owner: event.owner,
      runs: 0,
      retries: 0,
      failures: 0,
      lastStatus: event.status,
      lastError: null,
      firstAt: event.at,
      lastAt: event.at,
    }
    row.runs++
    if (event.status === 'retry') row.retries++
    if (event.status === 'fail') row.failures++
    row.owner = event.owner
    row.lastStatus = event.status
    if (event.error !== undefined) row.lastError = event.error
    row.lastAt = event.at
    rows.set(event.job, row)
  }
  return {
    kind: 'found',
    night,
    rows: [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
    counts,
  }
}
