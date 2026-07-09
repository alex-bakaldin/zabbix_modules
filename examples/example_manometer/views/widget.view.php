<?php

/**
 * Manometer widget view.
 *
 * @var CView $this
 * @var array $data
 */

(new CWidgetView($data))
    ->setVar('value', $data['value'])
    ->setVar('units', $data['units'])
    ->setVar('auto_min', $data['auto_min'])
    ->setVar('auto_max', $data['auto_max'])
    ->setVar('fields_values', $data['fields_values'])
    ->show();
