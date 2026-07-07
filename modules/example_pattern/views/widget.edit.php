<?php

/**
 * Pattern items widget form view.
 *
 * Host group / host pattern fields exist only on a global dashboard,
 * so they are added conditionally.
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
    ->show();
