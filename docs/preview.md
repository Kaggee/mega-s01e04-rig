# Digest preview

Preparation for [issue #7](https://github.com/Kaggee/mega-s01e04-rig/issues/7).
The workflow is manual only; committing it does not publish a preview.
Expected public URL: <https://kaggee.github.io/mega-s01e04-rig/>.

Before first publication, integrate and verify issues #2–#6 and obtain explicit human
approval to publish the sample digest and course-provided lane marker on this account's
GitHub Pages site. After approval, put the reviewed workflow on the default branch,
enable **Settings → Pages → Source → GitHub Actions**, and allow that branch in the
`github-pages` environment. Add a required reviewer to that environment where supported.
Do not configure a custom domain or an alternate destination: cleanup must overwrite the
same URL.

Manually run **Digest preview** from the reviewed branch with `lane_marker` set to the
approved marker. Inputs are strings, not secrets: the marker is intended for this public
preview, and workflow metadata may retain it. Never commit the value or paste HTML into
issues or chat attachments. The workflow masks the marker in subsequent logs, installs
Node 24 and pnpm 11.25.0 with the frozen lockfile, runs tests and typechecking, starts the
real rig, waits for `/health`, and captures the digest with `curl`. It stops the server
before uploading `_site/index.html` as the sole site file. The artifact expires after
one day; the deployed page does not expire with it.

After deployment, fetch the public URL and verify the sample rows and lane banner. Send
the URL and <https://github.com/Kaggee/mega-s01e04-rig/issues> to the reviewer through
`claim-challenge`. Issue #7 meets its done condition only after the reviewer has looked at
the preview and the course confirms that review; sending the link alone is not enough.

## Local capture without publication

With dependencies installed and the approved marker in ignored `.env`, run `pnpm start`
in one terminal. In PowerShell in another terminal, wait for health and capture the page:

```powershell
curl.exe --fail --silent --show-error http://127.0.0.1:8787/health --output NUL
if ($LASTEXITCODE -ne 0) { throw 'rig is not healthy' }
New-Item -ItemType Directory -Force _site | Out-Null
curl.exe --fail --silent --show-error http://127.0.0.1:8787/digest/2026-10-28 --output _site/index.html
if ($LASTEXITCODE -ne 0) { throw 'digest capture failed' }
```

Stop rig with Ctrl+C after capture. `_site/` is ignored; keep the HTML local until
publication is approved.

## Later cleanup approval

Issue #8 requires a separate human approval after review. Once approved, run this same
workflow with `lane_marker` empty, producing the same page with `no marker set`, and
overwrite the exact same URL. Verify the public response no longer contains the marker.
Artifact expiry alone does not remove the marker from the deployed page. Archiving the
plan belongs to #8.

Workflow reference: [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
