<?php

namespace Modules\ExampleItemCard\Includes;

use Zabbix\Widgets\{
    CWidgetField,
    CWidgetForm
};

use Zabbix\Widgets\Fields\{
    CWidgetFieldCheckBox,
    CWidgetFieldMultiSelectItem,
    CWidgetFieldTextBox,
    CWidgetFieldThresholds
};

/**
 * Item value card widget form.
 */
class WidgetForm extends CWidgetForm {

    public function addFields(): self {
        return $this
            ->addField(
                (new CWidgetFieldMultiSelectItem('itemid', _('Item')))
                    ->setFlags(CWidgetField::FLAG_NOT_EMPTY | CWidgetField::FLAG_LABEL_ASTERISK)
                    ->setMultiple(false)
            )
            ->addField(
                (new CWidgetFieldCheckBox('show_trend', _('Show trend indicator')))
                    ->setDefault(1)
            )
            ->addField(
                new CWidgetFieldThresholds('thresholds', _('Thresholds'))
            )
            ->addField(
                new CWidgetFieldTextBox('description', _('Description'))
            );
    }
}
