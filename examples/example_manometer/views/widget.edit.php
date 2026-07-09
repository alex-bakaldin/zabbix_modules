<?php

/**
 * Manometer widget form view.
 *
 * @var CView $this
 * @var array $data
 */

(new CWidgetFormView($data))
    ->addField(
        new CWidgetFieldMultiSelectItemView($data['fields']['itemid'])
    )
    ->addField(
        new CWidgetFieldSelectView($data['fields']['range_mode'])
    )
    ->addField(
        new CWidgetFieldNumericBoxView($data['fields']['value_min'])
    )
    ->addField(
        new CWidgetFieldNumericBoxView($data['fields']['value_max'])
    )
    ->addField(
        new CWidgetFieldTextBoxView($data['fields']['units'])
    )
    ->addField(
        new CWidgetFieldIntegerBoxView($data['fields']['value_decimals'])
    )
    ->show();
