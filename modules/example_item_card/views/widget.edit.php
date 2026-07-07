<?php

/**
 * Item value card widget form view.
 *
 * @var CView $this
 * @var array $data
 */

(new CWidgetFormView($data))
    ->addField(
        (new CWidgetFieldMultiSelectItemView($data['fields']['itemid']))
            ->setPopupParameter('numeric', true)
    )
    ->addField(
        new CWidgetFieldCheckBoxView($data['fields']['show_trend'])
    )
    ->addField(
        new CWidgetFieldThresholdsView($data['fields']['thresholds'])
    )
    ->addField(
        new CWidgetFieldTextBoxView($data['fields']['description'])
    )
    ->show();
