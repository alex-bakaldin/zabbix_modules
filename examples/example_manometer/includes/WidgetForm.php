<?php

namespace Modules\ExampleManometer\Includes;

use Zabbix\Widgets\CWidgetForm;

use Zabbix\Widgets\Fields\{
    CWidgetFieldIntegerBox,
    CWidgetFieldMultiSelectItem,
    CWidgetFieldNumericBox,
    CWidgetFieldSelect,
    CWidgetFieldTextBox
};

/**
 * Manometer widget form.
 */
class WidgetForm extends CWidgetForm {

    public const RANGE_FIXED = 0;
    public const RANGE_AUTO = 1;

    public function addFields(): self {
        return $this
            ->addField(
                (new CWidgetFieldMultiSelectItem('itemid', _('Item')))
                    ->setMultiple(false)
            )
            ->addField(
                (new CWidgetFieldSelect('range_mode', _('Range'), [
                    self::RANGE_FIXED => _('Fixed'),
                    self::RANGE_AUTO => _('Auto (history ±5%)')
                ]))->setDefault(self::RANGE_FIXED)
            )
            ->addField(
                (new CWidgetFieldNumericBox('value_min', _('Min')))->setDefault(0)
            )
            ->addField(
                (new CWidgetFieldNumericBox('value_max', _('Max')))->setDefault(100)
            )
            ->addField(
                new CWidgetFieldTextBox('units', _('Units (override)'))
            )
            ->addField(
                (new CWidgetFieldIntegerBox('value_decimals', _('Decimals'), 0, 10))->setDefault(1)
            );
    }
}
