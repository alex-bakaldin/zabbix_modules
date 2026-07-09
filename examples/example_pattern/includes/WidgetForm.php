<?php

namespace Modules\ExamplePattern\Includes;

use Zabbix\Widgets\{
    CWidgetField,
    CWidgetForm
};

use Zabbix\Widgets\Fields\{
    CWidgetFieldMultiSelectGroup,
    CWidgetFieldMultiSelectOverrideHost,
    CWidgetFieldPatternSelectHost,
    CWidgetFieldPatternSelectItem,
    CWidgetFieldRadioButtonList,
    CWidgetFieldTags
};

/**
 * Pattern items widget form.
 *
 * Global dashboard: hosts + host groups + item patterns + item tags.
 * Template dashboard: host groups / host patterns are hidden — items resolve
 * against the template (or the override / dynamic host) automatically.
 * Item tags apply in both contexts (inheritedTags covers host tags too).
 */
class WidgetForm extends CWidgetForm {

    public function addFields(): self {
        return $this
            ->addField($this->isTemplateDashboard()
                ? null
                : new CWidgetFieldMultiSelectGroup('groupids', _('Host groups'))
            )
            ->addField($this->isTemplateDashboard()
                ? null
                : new CWidgetFieldPatternSelectHost('hosts', _('Hosts'))
            )
            ->addField(
                (new CWidgetFieldPatternSelectItem('items', _('Item patterns')))
                    ->setFlags(CWidgetField::FLAG_NOT_EMPTY | CWidgetField::FLAG_LABEL_ASTERISK)
            )
            ->addField(
                (new CWidgetFieldRadioButtonList('evaltype', _('Item tags'), [
                    TAG_EVAL_TYPE_AND_OR => _('And/Or'),
                    TAG_EVAL_TYPE_OR => _('Or')
                ]))->setDefault(TAG_EVAL_TYPE_AND_OR)
            )
            ->addField(
                new CWidgetFieldTags('item_tags')
            )
            ->addField(
                new CWidgetFieldMultiSelectOverrideHost()
            );
    }
}
