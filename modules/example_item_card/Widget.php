<?php

namespace Modules\ExampleItemCard;

use Zabbix\Core\CWidget;

class Widget extends CWidget {

    public function getTranslationStrings(): array {
        return [
            'class.widget.js' => [
                'No data' => _('No data')
            ]
        ];
    }
}
