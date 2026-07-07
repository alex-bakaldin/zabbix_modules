# Thermometer (canvas) — Zabbix dashboard widget

**English** | [Русский](README.ru.md) | [Srpski](README.sr.md) | [Polski](README.pl.md) | [Latviešu](README.lv.md)

A multi-item "thermometer carousel" widget. It shows the values of several items
(selected by a name pattern and filtered by tags) as a row of glass thermometers:
the central one is larger and in focus, the side ones are smaller and fade off-frame.
Everything is drawn procedurally on a `<canvas>` (no image assets).

![Thermometer carousel](docs/carousel.png)

- **id:** `thermometer` · **namespace:** `Thermometer` · **type:** `widget`
- Rendering class: `WidgetThermometer` (extends the shared base `CWidgetGaugeBase` →
  `CWidgetCanvasBase`).

## Features

- Several items across several hosts — selected by a **name pattern** (wildcards `*`)
  and filtered by **tags** (the native *SVG graph* model; `inheritedTags` also takes
  host tags into account). **Only numeric items** (float / unsigned) are shown; text,
  log and character items are filtered out.
- **Carousel**: infinite (looped); the central thermometers are full-size (several of
  them if the width allows), the focused one is a bit larger; side ones shrink and
  fade smoothly toward the edges.
- **Value** shown on every thermometer according to `value_pos` (top / bottom / left /
  right / off); the **Track** mode renders it as a "chart-recorder pen" marker at the
  top of the mercury (for left/right the row is spread apart so the marker fits).
- **Name** of the focused item — a plaque with an arrow pointing at its thermometer;
  below it a row of position dots.
- **Scrolling**: by dragging with the mouse (snaps to the nearest item) or by
  **auto-scroll** (smooth, paused while the cursor is over the widget).
- **Shared range** for all items: fixed, or auto (computed from the combined history of
  all selected items, padded by ±5%).
- Natural rendering: integer scale (smart step), always marks **0** when it is within
  the range (with a baseline), min/max are aligned to the straight part of the tube
  (the dome and the rounded bottom are "outside the range"); with the bulb hidden the
  mercury is drawn from zero (downwards for negative values). Scale and value colors are
  theme-aware (light / dark).

## Parameters

![Configuration form](docs/form.png)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **Host groups** ¹ | group multiselect | — | Restrict hosts to the selected groups. Global dashboard only. |
| **Hosts** ¹ | host patterns | — | Host name patterns (wildcards `*`). Global dashboard only. |
| **Item patterns** | item patterns | — (required) | Item name patterns (wildcards `*`), resolved into a set of items. |
| **Item tags** | evaltype + tag rows | And/Or | Filter items by tags (inherited host tags are taken into account). |
| **Override host** | multiselect | — | Host override (for the dynamic / template context). |
| **Range** | select | Fixed | `Fixed` — from Min/Max; `Auto (shared, history ±5%)` — a shared range from the combined history of all items. |
| **Min** / **Max** | number | 0 / 100 | Scale bounds for the Fixed range. |
| **Units (override)** | string | — | Measurement units. Empty → taken from the item. |
| **Decimals** | integer 0–10 | 1 | Number of decimal places for the value. |
| **Value position** | select | Top | Where to show the value: `Off` / `Top` / `Bottom` / `Left` / `Right`. |
| **Track mercury top (marker)** | checkbox | off | Show the value as a "pen" marker at the top of the mercury (for `Left`/`Right`). |
| **Auto-scroll cycle, s (0 = off)** | integer 0–3600 | 0 | Seconds for a full carousel cycle. `0` disables auto-scroll. Paused on hover. |
| **Show bulb** | checkbox | on | Draw the bulb at the bottom. Without the bulb the mercury is drawn from zero. |
| **Mercury color** | color | `D81B18` | Mercury color (the gradient is built from the chosen color). |

¹ On a **template** dashboard the *Host groups* and *Hosts* fields are hidden — items are
resolved against the current / overridden host.

## Interaction

- **Mouse drag** left/right scrolls the carousel; on release it snaps to the nearest
  thermometer. In dashboard edit mode the drag is handed over to the dashboard.
- **Auto-scroll** (`Auto-scroll cycle`) smoothly loops through the items; **paused while
  the cursor is over the widget**.

## Module structure

```text
thermometer/
  manifest.json                 id/namespace/js_class, action, assets
  includes/WidgetForm.php       form fields (patterns, tags, display)
  actions/WidgetView.php        resolve items by pattern+tags, values from history,
                                shared auto_min/auto_max from combined history
  views/widget.view.php         setVar(items, auto_min, auto_max, fields_values)
  views/widget.edit.php         configuration form
  assets/js/class.widget.base.js  CWidgetCanvasBase (shared canvas plumbing, assign-once global)
  assets/js/class.gauge.base.js   CWidgetGaugeBase (value/range/animation/theme)
  assets/js/class.widget.js       WidgetThermometer (carousel, rendering, drag/autoscroll)
  assets/css/widget.css           canvas styles
  docs/                           screenshots for this README
```

## Installation

Copy the `thermometer` directory into `zabbix/ui/modules/`, then register it via
*Administration → General → Modules → Scan directory* and enable the module. The widget
appears in the type list when adding a widget to a dashboard.
