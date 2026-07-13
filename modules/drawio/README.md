# Diagram (draw.io / SVG) widget

**English** | [Русский](README.ru.md) | [Srpski](README.sr.md) | [Polski](README.pl.md) | [Latviešu](README.lv.md)

A Zabbix dashboard widget that renders a **draw.io / SVG diagram** and drives its
elements from live monitoring data using a single user-provided script.

The diagram stays *clean and shareable* — no bindings are baked into it. All
logic lives in the widget config: one script receives the resolved hosts (items
and triggers) plus a CRUD API over the diagram cells, and does whatever you want
(recolor a pipe by load, show a value, clone a template per discovered entity…).

- **Module id:** `drawio` · **namespace:** `Drawio` · **js class:** `WidgetDrawio`

---

## Demo — network map

A [network map](docs/netmap.drawio) driven entirely by one synthetic-data script
([docs/netmap.demo.js](docs/netmap.demo.js)): node fill by load, live `cpu/mem/disk`
(multi-line labels), a pulsing hot node, a greyed-out **down** host, traffic-scaled
**flowing** links, and live throughput on the internet clouds — all live on the
dashboard. The exported draw.io SVG is theme-aware (`light-dark()`), so it renders
natively in the light Zabbix theme too.

![Network map demo](docs/netmap.gif)

---

## Features

- Renders any draw.io-exported (or hand-written) **SVG**, addressing cells by
  draw.io's `data-cell-id`.
- **One script** drives the whole diagram; you get the data and a CRUD API and
  write the logic yourself (a power-user tool).
- **Items and triggers** of the matched hosts are injected into the script, each
  with its **tags**; every host also carries its own **tags and resolved user
  macros** (global + template, with overrides applied) — match on tags/macros
  instead of parsing keys and names.
- **LLD-friendly:** clone a template cell per discovered item with one call
  (`cell.repeat(...)`), auto-tiled in a grid.
- **Connector-aware:** clone or remove a cell **together with the lines that
  link it to its neighbors** — the connectivity is recovered from the SVG
  geometry, so a cloned node fans out its own connector to the parent.
- **Animation:** values transition smoothly on each refresh, and cells can carry
  a browser-run animation (`pulse` / `blink`, or flowing dashes along a pipe) —
  the script only toggles it, so nothing loops in the sandbox.
- **Chunked storage:** the SVG and the script are split transparently across
  several `widget_field` rows, so neither is bounded by the 64 KB column.
- **Sandboxed & DoS-safe:** the script runs in an isolated iframe + Worker — no
  access to cookies/DOM/credentialed network, and a runaway loop is terminated.
- **Assisted editing:** the diagram is loaded by file with a live preview, and the
  script field is a CodeMirror editor with syntax highlighting, a linter and
  autocompletion of the diagram's cell ids — all vendored, works offline.

---

## Installation

Copy the module under `modules/drawio` in your Zabbix frontend and
register it (Administration → General → Modules → *Scan directory* → enable),
or via the API:

```json
{"jsonrpc":"2.0","method":"module.create",
 "params":{"id":"drawio","relative_path":"modules/drawio","status":1},
 "id":1}
```

---

## Preparing a diagram

Draw your diagram in [draw.io / diagrams.net](https://app.diagrams.net) and
**export it as SVG**. Two things matter:

1. **Turn font embedding OFF.** By default draw.io embeds fonts and the SVG
   balloons (a trivial diagram can hit ~115 KB). With fonts off it is a few KB.
   In the desktop CLI:

   ```bash
   drawio-export -f svg --embed-svg-fonts false -e -o out diagram.drawio
   ```

   (`-e` also embeds a copy of the source so the exported SVG re-opens in draw.io.)

2. **Cell ids.** Modern draw.io writes `data-cell-id="<mxCell id>"` on the `<g>`
   wrapper of every cell — this is how the script addresses elements. The ids are
   opaque auto-ids (e.g. `1Y4-VilqHyjT-noTrS5i-97`); you can also match a cell by
   its visible **label** (`cells.byLabel('eth0')`), which is usually friendlier.

3. **Light / dark theme.** draw.io exports theme-aware colours as the CSS
   `light-dark(dark, light)` function and pins `color-scheme: light dark` on the
   `<svg>`, which by itself would follow the viewer's **OS** preference — not the
   Zabbix theme. The widget corrects this: it reads the active UI scheme from
   Zabbix's `<html color-scheme>` attribute and forces it onto the SVG, so the
   diagram's automatic colours (text, labels, gradients) match the light or dark
   Zabbix theme like the rest of the interface. Practical guidance:

   - Keep **text and labels on draw.io's automatic colour** (do not override the
     font colour) so they stay readable in both themes.
   - Colours you set **explicitly** — a fixed fill/stroke in the diagram, or a hex
     value from `set({fill: '#e05050'})` in the script — are literal and identical
     in both themes. That is usually what you want for status colours (red = hot
     regardless of theme).
   - To preview both themes before deploying, use the toggle in
     [`tools/preview.mjs`](tools/README.md).

Load the resulting SVG into the widget's **Diagram SVG** field — pick the file
(a preview appears) or paste the source.

---

## Configuration

| Field | Purpose |
|-------|---------|
| **Diagram SVG** | the exported SVG (required, chunked) |
| **Script** | the user script that drives the diagram (chunked) |
| **Host groups / Hosts** | pattern selection of hosts (global dashboards) |
| **Item patterns** | which items to resolve and inject |
| **Item tags** | tag filter (And/Or) |
| **Override host** | dynamic/override host for template dashboards |

### The editing form

![Widget edit form](docs/form.png)

- **Diagram** — pick the exported `.svg` file instead of pasting it; the form shows
  a thumbnail preview and a `… KB, N cells` summary. The raw SVG stays available
  under *Show / paste SVG source* for manual edits.
- **Script editor** — a CodeMirror editor with JavaScript syntax highlighting, a
  linter (syntax errors are flagged in the gutter), bracket matching and auto-close.
- **Id autocompletion** — inside `cells.get('…')` / `cells.byLabel('…')` the editor
  suggests the **cell ids and labels parsed from the loaded SVG**; elsewhere it
  offers the `cells` / `api` surface. Press `Ctrl-Space` any time.

CodeMirror is vendored inside the module (`assets/*/vendor`) and loaded only while
the form is open, so it works fully offline and adds nothing to other pages.

---

## The script

Contract — the script body runs as `(hosts, cells, api)`:

### `hosts`
```js
[
  { host: 'Router A', hostid: '10105', tags: [ { tag, value }, … ],
    macros: { '{$SNMP_COMMUNITY}': 'public', '{$TEMP.CRIT}': '85', … },
    items:    [ { key, name, value, units, value_type, clock, tags: [ { tag, value }, … ] }, … ],
    triggers: [ { triggerid, description, priority, status, value, tags: [ { tag, value }, … ] }, … ] }
]
```

`macros` is the host's **effective** user macros keyed by name — global + template
macros included, with host/template overrides already applied (same values the host
edit form shows). Secret macros carry no value.

```js
// e.g. use a per-host threshold macro instead of a hard-coded number:
const crit = +hosts[0].macros['{$TEMP.CRIT}'] || 80;
```

### `cells` — find diagram elements

`cells` looks up the diagram's addressable elements (any `<g data-cell-id>`). Every
lookup returns a **handle** (or `null`) — the handle is how you read and change that
element.

#### `cells.get(id)` → `handle | null`
Find a cell by its `data-cell-id`.

- **`id`** `string` — the cell id (draw.io's `mxCell` id, or one you set in the diagram).
- Returns the handle, or `null` if no cell has that id.

#### `cells.byLabel(text)` → `handle | null`
Find the first cell whose visible label equals `text` (exact match, whitespace collapsed).

- **`text`** `string` — the label to match.

#### `cells.find(fn)` → `handle | null`
Find the first cell for which `fn` returns truthy.

- **`fn`** `(cell) => boolean` — predicate; `cell` is a plain descriptor `{ id, label, bbox, neighbors }` (not a handle).

#### `cells.all` → `handle[]`
A handle for every addressable cell in the diagram.

### The cell handle

A handle exposes the cell's identity/geometry (read-only) and the methods that change it.

**Properties**

- **`handle.id`** `string` — the cell's `data-cell-id`.
- **`handle.label`** `string` — visible label text (from the cell's `foreignObject`/`text`, whitespace collapsed; `''` if none).
- **`handle.bbox`** `{ x, y, width, height }` — bounding box in SVG user units.
- **`handle.neighbors`** `string[]` — ids of the cells this one is linked to by a connector (recovered from geometry).

#### `handle.set(patch)` → `handle`
Apply visual changes. Only the keys you pass are touched; the rest is left as-is.
Returns the same handle (chainable). **Sticky:** a property persists across refreshes
until you change it — clear it explicitly when a condition ends (`animate: 'none'`,
`flow: 0`).

- **`patch`** `object` — any subset of:

  | Field | Type | Effect |
  |-------|------|--------|
  | `fill` | color | Fill colour of the cell's shapes. |
  | `stroke` | color | Outline / line colour. |
  | `strokeWidth` | number | Outline / line width, px. |
  | `opacity` | number `0`–`1` | Opacity of the whole cell. |
  | `text` | string | Replace the label; `\n` splits lines. |
  | `textAngle` | number \| `'edge'` | Rotate the label N degrees, or `'edge'` = parallel to the connector line (auto-flipped upright). |
  | `animate` | `'pulse'` \| `'blink'` \| `'none'` | Browser-run animation of the cell. |
  | `flow` | number | Flowing dashes along the cell's lines: sign = direction, magnitude = speed, `0`/`false` = stop. |

  A **color** is a CSS colour string, or 6 hex digits with or without `#` (`'#e05050'` = `'e05050'`).

#### `handle.clone(opts)` → `handle`
Duplicate the cell at an offset; returns a handle to the new clone.

- **`opts.id`** `string` *(optional)* — id for the clone; auto-generated if omitted.
- **`opts.dx`, `opts.dy`** `number` *(optional, default `0`)* — offset in SVG units.
- **`opts.patch`** `object` *(optional)* — a `set()` patch applied to the clone.
- **`opts.edges`** `true | string[]` *(optional)* — also clone the connectors incident to the source (see **edges** below).

#### `handle.repeat(list, opts, fn)` → `undefined`
Clone this cell once per list item and tile the clones in a grid, running `fn` on each.
Slot 0 is the template in place; slots 1…n are clones.

- **`list`** `array` — one cell per element.
- **`opts.cols`** `number` *(default `4`)* — columns in the grid.
- **`opts.gap`** `number` *(default `12`)* — gap between tiles, SVG units.
- **`opts.edges`** `true | string[]` *(optional)* — clone each tile's connectors too (see **edges**).
- **`fn`** `(cell, item, i) => void` — called per tile: `cell` = the tile's handle, `item` = the list element, `i` = index.

#### `handle.remove(opts)` → `undefined`
Remove the cell from the diagram.

- **`opts.edges`** `true | string[]` *(optional)* — also remove the incident connectors (see **edges**).

**`edges`** (on `clone` / `repeat` / `remove`): `true` = every connector touching the
cell; `[neighborId, …]` = only the lines whose far end lands on those neighbours. On a
clone, each connector is re-routed as a straight line — its far end stays put, its near
end follows the clone — so a fan-out of clones each keeps its own line to the shared
parent. Connectivity is inferred from the SVG geometry (no embedded draw.io model
needed); routed waypoints become straight.

### `api` — helper functions

Pure functions available inside the script (no side effects).

#### `api.scale(v, inMin, inMax, outMin, outMax)` → `number`
Linear map from one range to another, **clamped** to the output range (never returns
outside it). E.g. `api.scale(75, 0, 100, 2, 12)` → `9.5`.

- **`v`** `number` — input value.
- **`inMin`, `inMax`** `number` — input range (if equal, the fraction is treated as `0`).
- **`outMin`, `outMax`** `number` — output range.

#### `api.color(v, thresholds, base)` → `color`
Pick a colour by threshold — the colour of the **highest threshold `≤ v`**. E.g.
`api.color(83, [[50,'#e0b000'],[80,'#e05050']], '#3fa34d')` → `'#e05050'`.

- **`v`** `number` — value to test.
- **`thresholds`** `[number, color][]` — `[threshold, color]` pairs, any order (sorted ascending internally).
- **`base`** `color` — returned when `v` is below every threshold.

#### `api.grid(i, opts)` → `{ dx, dy }`
Grid offset for the *i*-th tile — a manual alternative to `repeat`'s auto-layout.

- **`i`** `number` — tile index (0-based).
- **`opts.cols`** `number` *(default `4`)* — columns.
- **`opts.gap`** `number` *(default `12`)* — gap, SVG units.
- **`opts.w`, `opts.h`** `number` *(default `130` / `70`)* — tile width / height.
- Returns the offset `{ dx, dy }`, e.g. to pass to `clone`.

#### `api.units(v, unit, decimals)` → `string`
Format a number the way Zabbix does. **Bytes** (`B`, `Bps`) scale by **1024**,
everything else — including **bits** (`bps`, `b`) — by **1000**; trailing zeros are
trimmed. Special units are dispatched like Zabbix: `uptime`/`s` → durations,
`unixtime` → date-time, `%`/`ms`/`rpm`/`RPM` → left unscaled. So `item.units` can be
passed straight through.

- **`v`** `number` — the value.
- **`unit`** `string` — a Zabbix unit (`'B'`, `'Bps'`, `'bps'`, `'%'`, `'s'`, `'uptime'`, `'unixtime'`, …); `''` for a plain number.
- **`decimals`** `number` *(optional, default `2`)* — max decimal places.
- Examples: `api.units(1536,'B')` → `"1.5 KB"`, `api.units(2500000,'bps')` → `"2.5 Mbps"`, `api.units(174820,'uptime')` → `"2 days, 00:33:40"`, `api.units(3661,'s')` → `"1h 1m 1s"`.

### Examples

**Threshold color + value text:**
```js
const it = {};
hosts.forEach(h => h.items.forEach(i => it[i.key] = i));

const r = it['demo.reactor'];
if (r) cells.get('reactor').set({
  fill: api.color(+r.value, [[50, '#e0b000'], [80, '#e05050']], '#3fa34d'),
  text: (+r.value).toFixed(1) + ' °C'
});
```

**Line thickness by channel load:**
```js
const net = it['net.if.in[eth0]'];
if (net) cells.byLabel('eth0').set({ strokeWidth: api.scale(+net.value, 0, 1e9, 2, 16) });
```

**LLD — clone a template per discovered item:**
```js
const nums = hosts.flatMap(h => h.items).filter(i => i.value != null && !isNaN(+i.value));

cells.get('tmpl').repeat(nums, { cols: 4, gap: 12 }, (cell, item) => {
  const x = +item.value;
  cell.set({
    fill: api.color(x, [[40, '#e0b000'], [70, '#e05050']], '#2b7a3d'),
    text: item.name + ': ' + x.toFixed(1) + '°C'
  });
});
```

**Match by tag instead of key:** every item, trigger and host carries its `tags`.

```js
const tagged = (host, name) => host.items.find(i => i.tags.some(t => t.tag === 'port' && t.value === name));

hosts.forEach(h => {
  const up = tagged(h, 'wan');
  if (up) cells.byLabel('WAN').set({ strokeWidth: api.scale(+up.value, 0, 1e9, 2, 16) });
});
```

**Clone a template together with its connector to the parent (LLD fan-out):**

```js
// 'node' is a template box linked to a 'core' box by a line. Each clone gets its
// own line back to 'core'; slot 0 is the template in place (its line already exists).
const nums = hosts.flatMap(h => h.items).filter(i => !isNaN(+i.value));

cells.get('node').repeat(nums, { cols: 4, gap: 20, edges: ['core'] }, (cell, item) => {
  cell.set({ text: item.name, fill: api.color(+item.value, [[70, '#e05050']], '#2b7a3d') });
});
```

### Animation

Two `patch` fields attach a **browser-run** animation. The script sets them once
per refresh; the browser keeps them alive between refreshes, so nothing loops in
the sandbox (the DoS guarantee is untouched). On top of that, every value change
already **transitions smoothly** (fill/stroke/stroke-width/opacity, ~0.6 s) — a
pipe thickens and a colour flows on its own.

- `animate: 'pulse' | 'blink' | 'none'` — pulse (smooth) or blink (step) the
  whole cell; `'none'` (or omit) stops it.
- `flow: <signed number>` — flowing dashes along the cell's lines. Sign is the
  direction, magnitude is the speed; `0`/`false` stops it.
- `textAngle: <degrees> | 'edge'` — rotate the cell's label. `'edge'` lays it
  **parallel to the connector line** (angle taken from the line geometry, flipped
  so it never reads upside-down) — handy for edge labels like `Rx/Tx` on a link.

```js
// Alarm cell pulses while a trigger is in PROBLEM state.
const problem = hosts.some(h => h.triggers.some(t => t.value === '1'));
cells.byLabel('pump').set({ animate: problem ? 'pulse' : 'none' });

// Dashes flow along a pipe, faster with channel load, reversing on egress.
const net = it['net.if.in[eth0]'];
if (net) cells.byLabel('eth0').set({ flow: api.scale(+net.value, 0, 1e9, 0.3, 4) });
```

> Because the real SVG persists between refreshes, an animation stays on until
> the script turns it off — always set the "off" branch (`animate:'none'`,
> `flow:0`) when the condition clears.

### Debugging

The script is ordinary JavaScript run by the browser, so the full devtools apply —
with two things to know:

- It executes inside the sandbox's Worker, so in **Sources** it shows up as a
  `blob:`/VM entry. `console.log(...)` from the script prints to the console and a
  `debugger;` statement pauses execution there.
- The evaluator catches the script's exceptions to stay isolated, so an uncaught
  error would otherwise vanish. The widget re-surfaces it as
  `[drawio] user script error: <stack>` in the console — and any operations
  recorded before the throw are still applied.

---

## How it works

1. The controller resolves the selected items (last value from history) and the
   triggers of their hosts, grouped into `hosts`, and returns them with the SVG
   and the script.
2. The frontend injects the SVG, builds a serialized cell model
   (`{id, label, bbox}` per cell) and hands it, with the data and script, to the
   sandbox.
3. The sandbox runs the script; its CRUD calls **record operations**
   (`set` / `clone` / `remove`).
4. The widget applies those operations to the real SVG.

The script never touches the DOM directly — it works on the serialized model and
returns operations, which is what keeps it sandboxable.

---

## Chunking

`Diagram SVG` and `Script` are stored with `CWidgetFieldChunkedText`, which
splits the value (on character boundaries, under the column byte limit) across
`diagram.0`, `diagram.1`, … and re-joins it on load. Diagrams and scripts grow,
so this is built in from the start rather than added once a limit is hit.

---

## Security model

User scripts are arbitrary JavaScript, authored by whoever can edit the
dashboard. They run in a **sandboxed `<iframe sandbox="allow-scripts">`** (no
`allow-same-origin` → opaque origin), with the evaluator hosted in a **Worker**
inside that iframe:

- **Confidentiality** — the opaque origin blocks access to the parent's cookies,
  DOM and credentialed same-origin requests. Verified: from the sandbox
  `parent.location.href` and `parent.document.cookie` both throw `SecurityError`.
- **Availability (DoS)** — the script runs on the Worker's own thread; a watchdog
  terminates it after ~1 s, so an infinite loop cannot freeze the dashboard.
  Verified: a `while(true){}` script leaves the page fully responsive and the
  diagram simply un-driven.

If a browser refuses a Worker inside a sandboxed frame, the widget falls back to
inline evaluation (still isolated, but without the DoS guarantee).

> Note: this is a power-user tool. Restrict who may edit these dashboards
> accordingly.
