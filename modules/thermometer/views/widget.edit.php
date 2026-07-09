<?php

/**
 * Thermometer widget form view.
 *
 * Host group / host pattern fields exist only on a global dashboard.
 *
 * @var CView $this
 * @var array $data
 */

$form = new CWidgetFormView($data);

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
    ->addField(new CWidgetFieldSelectView($data['fields']['range_mode']))
    ->addField(new CWidgetFieldTextBoxView($data['fields']['value_min']))
    ->addField(new CWidgetFieldTextBoxView($data['fields']['value_max']))
    ->addField(new CWidgetFieldTextBoxView($data['fields']['units']))
    ->addField(new CWidgetFieldIntegerBoxView($data['fields']['value_decimals']))
    ->addField(new CWidgetFieldSelectView($data['fields']['value_pos']))
    ->addField(new CWidgetFieldCheckBoxView($data['fields']['value_track']))
    ->addField(new CWidgetFieldIntegerBoxView($data['fields']['autoscroll']))
    ->addField(new CWidgetFieldCheckBoxView($data['fields']['show_bulb']))
    ->addField(new CWidgetFieldColorView($data['fields']['mercury_color']))
    ->addField(new CWidgetFieldThresholdsView($data['fields']['thresholds']))
    ->addField(new CWidgetFieldCheckBoxView($data['fields']['threshold_interpolate']))
    ->show();
