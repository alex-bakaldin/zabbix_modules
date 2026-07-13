# drawio widget — dev tools

## `preview.mjs` — local diagram preview

Iterate on a diagram + script + data in your editor instead of clicking
**Execute now** on a live Zabbix instance. It bundles the real widget runtime
(`assets/js/class.widget.js`) into a self-contained HTML page and opens it in
your browser, so the script runs in the same sandboxed iframe + Worker and every
feature — patches, multi-line text, clones, `repeat`, edges, animation, `flow` —
behaves exactly as in production.

```sh
# self-contained script (synthesizes its own values, no data needed):
node modules/drawio/tools/preview.mjs docs/netmap.svg docs/netmap.demo.js

# script that reads resolved items/hosts:
node modules/drawio/tools/preview.mjs docs/demo.svg my-script.js docs/preview.data.example.json

# watch mode — edit & save any of the files, the browser reloads itself:
node modules/drawio/tools/preview.mjs docs/demo.svg my-script.js data.json --watch
```

With `--watch` the helper serves the preview and live-reloads the browser tab
whenever the diagram, script or data file (or the widget runtime itself) changes
— no need to re-run node. It survives a broken save (shows the error, recovers on
the next good save) and runs until Ctrl-C.

- `diagram.svg` — the SVG you paste into the widget form.
- `script.js` — the text that goes into the **Script** field.
- `data.json` — optional; the `hosts` array the controller sends. Omit it for
  self-contained scripts. See [`docs/preview.data.example.json`](../docs/preview.data.example.json)
  for the shape (matches `actions/WidgetView.php`).

Options: `--refresh <ms>` (re-run to animate time-based scripts, default 1000;
`0` = once), `--out <file>`, `--no-open`, `--help`.

Keep your own diagrams/scripts/data in a `samples/` folder — it's gitignored, so
it stays local scratch and never gets committed.

The page has a **Re-run** button, a **light/dark theme toggle** that forces the
SVG's `color-scheme` so draw.io's `light-dark()` colours (text, gradients) really
re-resolve — letting you preview both Zabbix themes — a red banner for script errors,
and a blue panel that shows your script's `console.log` output. The script runs
in a sandboxed Worker, so its logs never reach the terminal and aren't reliably
shown in devtools by default — the preview relays them for you (also printed to
the real console as `[script] …`). `debugger;` still works too. Requires only
Node — no npm install.
