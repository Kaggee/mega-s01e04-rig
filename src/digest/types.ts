export type DigestStatus = 'ok' | 'retry' | 'fail'

/** One job's accepted events, ordered by timestamp instant, then file line. */
export interface DigestRow {
  job: string
  /** Owner on the latest event; null is retained as missing data. */
  owner: string | null
  /** All accepted events for this job, including retries and failures. */
  runs: number
  retries: number
  /** All fail events, so an earlier failure remains visible after recovery. */
  failures: number
  lastStatus: DigestStatus
  /** Latest supplied error in chronological order; null if none was supplied. */
  lastError: string | null
  /** Original earliest timestamp string, including its original offset. */
  firstAt: string
  /** Original latest timestamp string, including its original offset. */
  lastAt: string
}

/** Counts of accepted events across the night, not counts of jobs. */
export interface DigestCounts {
  ok: number
  retry: number
  fail: number
}

export interface NightDigest {
  kind: 'found'
  night: string
  /** Ascending JavaScript string/code-unit order by job, independent of locale. */
  rows: DigestRow[]
  /** Nonblank lines with invalid JSON or invalid event fields. */
  badLines: number
  counts: DigestCounts
}

/** A missing file is distinct from a found but empty night. */
export interface MissingNight {
  kind: 'missing'
  night: string
}

/**
 * Implemented and exported as readNight in src/digest/reader.ts.
 * Reads runsDir/<night>.jsonl without modifying it. Blank lines are ignored.
 * A found empty file has no rows, no bad lines and zero event counts.
 * Invalid night names and absent files return MissingNight; other I/O errors
 * reject. Night names use YYYY-MM-DD with no path components.
 * Equal timestamp instants use file order: the later line is the latest event.
 * A later event without an error does not clear lastError.
 */
export type ReadNight = (
  runsDir: string,
  night: string,
) => Promise<NightDigest | MissingNight>
