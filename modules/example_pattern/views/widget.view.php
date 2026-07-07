<?php

/**
 * Pattern items widget view.
 *
 * @var CView $this
 * @var array $data
 */

(new CWidgetView($data))
    ->setVar('rows', $data['rows'])
    ->setVar('is_template', $data['is_template'])
    ->setVar('override_hostid', $data['override_hostid'])
    ->setVar('limit', $data['limit'])
    ->show();
