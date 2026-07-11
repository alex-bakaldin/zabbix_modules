<?php

/**
 * Diagram (draw.io / SVG) widget form view.
 *
 * Host group / host pattern fields exist only on a global dashboard,
 * so they are added conditionally (same as example_pattern).
 *
 * @var CView $this
 * @var array $data
 */

use Modules\Drawio\Includes\CWidgetFieldChunkedTextView;

$script_placeholder =
    "// (hosts, cells, api)\n".
    "// hosts:[{host,hostid,items:[{key,name,value,units}],triggers:[{description,priority,value}]}]\n".
    "// cells.get(id) / cells.byLabel(text) / cells.all → handle{ id,label,bbox,\n".
    "//   set({fill,stroke,strokeWidth,opacity,text}), clone({dx,dy,patch}), repeat(list,{cols,gap},fn), remove() }\n".
    "// api.scale(v,inMin,inMax,outMin,outMax) · api.color(v,[[thr,color],...],base) · api.grid(i,{cols,gap,w,h})\n".
    "//\n".
    "// const it = {}; hosts.forEach(h => h.items.forEach(i => it[i.key] = i));\n".
    "// const r = it['net.if.in']; if (r) cells.byLabel('eth0').set({strokeWidth: api.scale(+r.value, 0, 1e9, 2, 16)});";

$form = new CWidgetFormView($data);

$form
    ->addField(
        (new CWidgetFieldChunkedTextView($data['fields']['diagram']))->setRows(4)
    )
    ->addField(
        (new CWidgetFieldChunkedTextView($data['fields']['script']))
            ->setRows(10)
            ->setPlaceholder($script_placeholder)
    );

if (array_key_exists('groupids', $data['fields'])) {
    $form->addField(new CWidgetFieldMultiSelectGroupView($data['fields']['groupids']));
}

if (array_key_exists('hosts', $data['fields'])) {
    $form->addField(new CWidgetFieldPatternSelectHostView($data['fields']['hosts']));
}

$form
    ->addField(new CWidgetFieldPatternSelectItemView($data['fields']['items']))
    ->addField(new CWidgetFieldRadioButtonListView($data['fields']['evaltype']))
    ->addField(new CWidgetFieldTagsView($data['fields']['item_tags']))
    ->addField(new CWidgetFieldMultiSelectOverrideHostView($data['fields']['override_hostid']))
    ->includeJsFile('widget.edit.js.php')
    ->initFormJs('widget_form.init();')
    ->show();
