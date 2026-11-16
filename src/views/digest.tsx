import type { NightDigest } from '../digest/types.js';

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">
          warning: {digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'}; valid events are shown below
        </p>
      )}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>failures</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td>
                  {row.retries >= 3 ? (
                    <span class="warn">warning: {row.retries}</span>
                  ) : (
                    row.retries
                  )}
                </td>
                <td>
                  {row.failures > 0 ? (
                    <span class="warn">warning: {row.failures}</span>
                  ) : (
                    row.failures
                  )}
                </td>
                <td class={row.failures > 0 || row.lastStatus === 'fail' ? 'warn' : undefined}>
                  {row.lastStatus}
                  {row.failures > 0 && ' · warning'}
                </td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
