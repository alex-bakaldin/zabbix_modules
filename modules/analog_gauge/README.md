# Analog gauge (canvas) — Zabbix dashboard widget

**English** | [Русский](README.ru.md) | [Srpski](README.sr.md) | [Polski](README.pl.md) | [Latviešu](README.lv.md)

A multi-item **analog-gauge grid** widget. It shows the values of several items
(selected by a name pattern and filtered by tags) as round dial gauges, tiled on a
grid. Each dial animates its needle toward the item's current value; when an item has
no data the needle runs a slow demo sweep. Everything is drawn procedurally on a
`<canvas>` (no image assets).

It is the grid sibling of the [Thermometer](../thermometer) widget: same data model
(pattern + tags + per-host macros + thresholds), but laid out on a **grid instead of a
horizontal carousel**, with four selectable visual styles.

![Analog gauge styles](docs/styles.png)

- **id:** `analog_gauge` · **namespace:** `AnalogGauge` · **type:** `widget`
- Rendering class: `WidgetAnalogGauge` (extends the shared base `CWidgetGaugeBase` →
  `CWidgetCanvasBase`).

## Features

- **Several items across several hosts** — selected by a **name pattern** (wildcards `*`)
  and filtered by **tags** (the native *SVG graph* model; `inheritedTags` also takes host
  tags into account). **Only numeric items** (float / unsigned) are shown; text, log and
  character items are filtered out.
- **Grid layout**: every matching item becomes its own dial, tiled on a grid. The number
  of columns is chosen automatically to keep the dials as square (and as large) as
  possible, or you can pin it with **Grid columns**.
- **Minimum size + scrolling**: with **Min gauge size** set, the dials never shrink below
  that size — anything that does not fit is reached by **dragging with the mouse**, on
  **both axes** (thin scrollbar indicators appear). With Min gauge size `0` the grid always
  fits the widget (no scrolling). There is no auto-scroll — panning is manual only.
- **Three styles**, sharing the same 270° dial geometry:
  - **Retro** — vintage brass bezel, cream face, serif numerals, classic black needle.
  - **Cyberpunk** — dark disc, neon progress arc and glowing needle, monospace readout.
  - **Industrial** — heavy steel bezel with bolts, matte graphite face, bold needle,
    hazard/threshold band near the top.
- **Thresholds**: threshold values define **coloured zones on the dial arc** only — the
  digital readout and the progress arc keep their fixed style colour regardless of the
  value. Threshold zones can be turned off.
- **User macros**: **Min**, **Max** and threshold values may be user macros
  (e.g. `{$PRESSURE.MAX}`, `{$WARN}`). They are resolved **per item, against each item's
  own host** — the same macro may resolve to a different number on different hosts, so each
  dial renders with its own scale and threshold levels.
- **Range**: **Fixed** (from Min / Max) or **Auto** — a single shared scale computed from
  the combined last hour of history of **all** items (padded by ±5%).
- **Digital value** (optional) shown in the centre / inset of each dial, formatted to the
  chosen number of decimals with the item's units (or an override).
- **Needle tremor** (optional): the needle / pointer gently trembles, imitating a live
  instrument — movement is easier for the eye to catch than a static position. **Only the
  needle jitters; the digital value never does.**
- **Item name** shown under each dial (truncated to fit); hover a dial to get a tooltip
  with the full name and host.
- **Smooth needle animation** per item (values ease toward their target on every refresh);
  a demo sweep runs when an item has no data. **Theme-aware** (the Retro / Cyberpunk /
  Industrial faces carry their own backdrop; captions follow the dashboard light / dark
  theme).

## Configuration

| Field | Description |
|-------|-------------|
| **Host groups** | *(global dashboards only)* limit the host search to these groups. |
| **Hosts** | *(global dashboards only)* host name pattern(s), wildcards `*`. |
| **Item patterns** \* | item **name** pattern(s), wildcards `*`. `*` alone = every numeric item on the matched hosts. |
| **Item tags** | tag filter with **And/Or** or **Or** evaluation. |
| **Override host** | pin all items to a single host (e.g. on a template dashboard). |
| **Style** | Retro / Cyberpunk / Industrial. |
| **Range** | **Fixed** (Min / Max) or **Auto** (shared, last-hour history ±5%). |
| **Min**, **Max** | scale bounds. Plain numbers **or** user macros (`{$LOW}`, `{$PRESSURE.MAX}` …). |
| **Units (override)** | replace the item's own units on the dial. |
| **Decimals** | digits after the decimal point in the digital value (0–10). |
| **Grid columns** | number of columns; **0 = auto** (fit the dials to the widget). |
| **Min gauge size, px** | minimum dial size for auto layout; **0 = fit to widget** (no scrolling). When > 0, overflow is reachable by dragging. |
| **Show digital value** | show / hide the numeric readout on each dial. |
| **Needle tremor (jitter)** | make the needle gently tremble (imitates a working instrument). |
| **Thresholds** | coloured levels; values may be user macros. |
| **Show threshold zones on the dial** | paint the coloured zones on the dial arc. |

## Data flow

1. The controller resolves the item **name patterns** across the pattern-matched hosts
   (or the template / override host), filtered by tags — the same model as the SVG graph
   widget. Only numeric items survive (`value_type` filtered to float / unsigned).
2. For each item it returns the **last value**, and for range mode **Auto** a shared
   min/max from the combined last-hour history of all items (±5%).
3. **Min / Max and every threshold string are resolved per item, against that item's own
   host** (user macros may differ per host), then parsed into numbers with `CNumberParser`.
   Each item therefore carries its own `min`, `max` and sorted `thresholds`.
4. The JS renders the grid; each dial animates its needle toward its own value using its
   own scale and threshold zones.

## Notes / implementation

- The shared canvas base (`class.widget.base.js`) and gauge base (`class.gauge.base.js`)
  are **assign-once globals** (`window.X = window.X || class …`) — identical copies live in
  every canvas/gauge module, and whichever loads first defines the class. Do not rename
  members that already exist on `CWidget` (`_body`, `_fields`, …).
- Threshold values that are **user macros** are kept as strings by the custom field
  `Modules\AnalogGauge\Includes\CWidgetFieldGaugeThresholds` (the stock thresholds field
  drops non-numeric rows); the controller resolves and sorts them per host.
- Scrolling is manual mouse-drag only, gated by `isEditMode()` so it does not fight the
  dashboard's own widget drag in edit mode.
- Always lint the JS before loading (`node --check assets/js/*.js`) — a syntax error in a
  module asset breaks the shared base class on **every** dashboard, since module assets are
  loaded on all pages.

## Demo

Dashboard **“Analog gauge (grid) demo”** (id `709` on the lesson instance) — one page per
style over the `Demo sensors` hosts with per-host macros (`{$TEMP.MIN}`/`{$TEMP.MAX}`) and
`{$TEMP.WARN}`/`{$TEMP.CRIT}` thresholds, plus a **“Grid + scroll”** page (narrow widget,
Min gauge size 180 px) demonstrating drag-scroll. Needle tremor is enabled on the demo.
