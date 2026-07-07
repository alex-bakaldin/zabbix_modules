<?php

/**
 * Canvas playground widget view.
 *
 * Resolves same-origin URLs of the module's image assets and hands them,
 * together with the label, to JavaScript via setVar().
 *
 * $this->getAssetsPath() -> "modules/example_canvas/assets"
 * CUrl(...)->getUrl()    -> URL correctly prefixed with the Zabbix base path.
 *
 * @var CView $this
 * @var array $data
 */

$assets = $this->getAssetsPath();

$image_urls = [
    'bg'    => (new CUrl($assets.'/img/bg.png'))->getUrl(),
    'ring'  => (new CUrl($assets.'/img/ring.png'))->getUrl(),
    'arrow' => (new CUrl($assets.'/img/arrow.png'))->getUrl()
];

(new CWidgetView($data))
    ->setVar('image_urls', $image_urls)
    ->setVar('label', $data['label'])
    ->show();
