<?php

namespace Modules\Drawio\Includes;

use Zabbix\Widgets\{
    CWidgetField,
    CWidgetForm
};

use Zabbix\Widgets\Fields\{
    CWidgetFieldMultiSelectGroup,
    CWidgetFieldMultiSelectOverrideHost,
    CWidgetFieldPatternSelectHost,
    CWidgetFieldPatternSelectItem,
    CWidgetFieldRadioButtonList,
    CWidgetFieldTags
};

/**
 * Diagram (draw.io / SVG) widget form.
 *
 * Two big chunked text fields:
 *   - `diagram` — the exported SVG (clean, no bindings baked in);
 *   - `script`  — one user script that drives the whole diagram. It receives
 *     the resolved hosts (items + triggers) and a CRUD API over diagram cells,
 *     and implements any logic itself (power-user tool).
 *
 * Both are stored chunked (CWidgetFieldChunkedText), so neither the SVG nor the
 * script is bounded by the 64 KB value_str column.
 *
 * Host / item selection (patterns + tags + override) mirrors example_pattern.
 */
class WidgetForm extends CWidgetForm {

    private const SCRIPT_PLACEHOLDER =
        "// (hosts, cells, api) — hosts:[{host,hostid,items:[{key,name,value,units}],triggers:[{description,priority,value}]}]\n".
        "// cells.get(id) / cells.byLabel(text) / cells.all → handle{ id,label,bbox, set({fill,stroke,strokeWidth,opacity,text}), clone({dx,dy,patch}), repeat(list,{cols,gap},fn), remove() }\n".
        "// api.scale(v,inMin,inMax,outMin,outMax) · api.color(v,[[thr,color],...],base) · api.grid(i,{cols,gap,w,h})\n".
        "//\n".
        "// const it = {}; hosts.forEach(h => h.items.forEach(i => it[i.key] = i));\n".
        "// const r = it['net.if.in']; if (r) cells.byLabel('eth0').set({strokeWidth: api.scale(+r.value, 0, 1e9, 2, 16)});";

    public function addFields(): self {
        return $this
            ->addField(
                (new CWidgetFieldChunkedText('diagram', _('Diagram SVG')))
                    ->setFlags(CWidgetField::FLAG_NOT_EMPTY | CWidgetField::FLAG_LABEL_ASTERISK)
            )
            ->addField(
                new CWidgetFieldChunkedText('script', _('Script'))
            )
            ->addField($this->isTemplateDashboard()
                ? null
                : new CWidgetFieldMultiSelectGroup('groupids', _('Host groups'))
            )
            ->addField($this->isTemplateDashboard()
                ? null
                : new CWidgetFieldPatternSelectHost('hosts', _('Hosts'))
            )
            ->addField(
                new CWidgetFieldPatternSelectItem('items', _('Item patterns'))
            )
            ->addField(
                (new CWidgetFieldRadioButtonList('evaltype', _('Item tags'), [
                    TAG_EVAL_TYPE_AND_OR => _('And/Or'),
                    TAG_EVAL_TYPE_OR => _('Or')
                ]))->setDefault(TAG_EVAL_TYPE_AND_OR)
            )
            ->addField(
                new CWidgetFieldTags('item_tags')
            )
            ->addField(
                new CWidgetFieldMultiSelectOverrideHost()
            );
    }

    public function getScriptPlaceholder(): string {
        return self::SCRIPT_PLACEHOLDER;
    }
}
