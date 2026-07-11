<?php

/**
 * AnalogGauge widget view.
 *
 * @var CView $this
 * @var array $data
 */

(new CWidgetView($data))
    ->setVar('items', $data['items'])
    ->setVar('auto_min', $data['auto_min'])
    ->setVar('auto_max', $data['auto_max'])
    ->setVar('fields_values', $data['fields_values'])
    ->show();
