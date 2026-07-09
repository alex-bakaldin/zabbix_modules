<?php

namespace Modules\ExampleCanvas\Includes;

use Zabbix\Widgets\CWidgetForm;

use Zabbix\Widgets\Fields\CWidgetFieldTextBox;

/**
 * Canvas playground widget form.
 *
 * Kept intentionally minimal — the point of this widget is the drawing skeleton,
 * not the configuration. Only a text label is drawn on top of the canvas.
 */
class WidgetForm extends CWidgetForm {

    public function addFields(): self {
        return $this
            ->addField(
                (new CWidgetFieldTextBox('label', _('Label')))
                    ->setDefault(_('Canvas widget'))
            );
    }
}
