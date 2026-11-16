# Digest JSON API

`GET /api/digest/:night` reads the night through the shared digest reader. The `night`
path parameter uses `YYYY-MM-DD`.

For a night whose file exists, the route returns `200 application/json` with the shared
`NightDigest` object:

```json
{
  "kind": "found",
  "night": "2026-10-28",
  "rows": [
    {
      "job": "example-job",
      "owner": null,
      "runs": 2,
      "retries": 1,
      "failures": 0,
      "lastStatus": "ok",
      "lastError": "temporary issue",
      "firstAt": "2026-10-28T08:00:00+02:00",
      "lastAt": "2026-10-28T08:05:00+02:00"
    }
  ],
  "badLines": 0,
  "counts": { "ok": 1, "retry": 1, "fail": 0 }
}
```

Each row summarizes one job. `owner` and `lastError` are strings or `null`; timestamps
retain the offsets present in the log. `runs`, `retries`, and `failures` count that job's
accepted events, while `counts` counts accepted events across the night by status. Rows
use the reader's shared ascending job order. `badLines` counts nonblank lines that are
invalid JSON or have invalid event fields. An existing empty file returns this same
shape with `rows: []`, zero `badLines`, and zero counts.

If the night name is invalid or its file is absent, the route returns `404
application/json`:

```json
{ "kind": "missing", "night": "2026-10-29" }
```
