<?php

/**
 * Item value card widget view.
 *
 * The heavy lifting (color by thresholds, trend arrow) happens in assets/js/class.widget.js.
 * Here we only pass the controller data to JavaScript via setVar().
 *
 * @var CView $this
 * @var array $data
 */

(new CWidgetView($data))
    ->setVar('history', $data['history'])
    ->setVar('raw_value', $data['raw_value'])
    ->setVar('raw_prev', $data['raw_prev'])
    ->setVar('fields_values', $data['fields_values'])
    ->show();
