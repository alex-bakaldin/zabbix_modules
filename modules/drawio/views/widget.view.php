<?php

/**
 * Diagram (draw.io / SVG) widget view.
 *
 * Only values pushed through setVar() reach the JS payload (this._data).
 *
 * @var CView $this
 * @var array $data
 */

(new CWidgetView($data))
    ->setVar('diagram', $data['diagram'])
    ->setVar('script', $data['script'])
    ->setVar('hosts', $data['hosts'])
    ->show();
