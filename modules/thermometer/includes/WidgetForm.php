<?php

namespace Modules\Thermometer\Includes;

use Zabbix\Widgets\{
    CWidgetField,
    CWidgetForm
};

use Zabbix\Widgets\Fields\{
    CWidgetFieldCheckBox,
    CWidgetFieldColor,
    CWidgetFieldIntegerBox,
    CWidgetFieldMultiSelectGroup,
    CWidgetFieldMultiSelectOverrideHost,
    CWidgetFieldPatternSelectHost,
    CWidgetFieldPatternSelectItem,
    CWidgetFieldRadioButtonList,
    CWidgetFieldSelect,
    CWidgetFieldTags,
    CWidgetFieldTextBox
};

/**
 * Thermometer widget form (multi-item, carousel).
 *
 * Items are selected by name pattern across pattern-matched hosts (hidden on a
 * template dashboard) and filtered by tags — like the SVG graph widget.
 */
class WidgetForm extends CWidgetForm {

    public const RANGE_FIXED = 0;
    public const RANGE_AUTO = 1;

    public const VALUE_POS_OFF = 0;
    public const VALUE_POS_TOP = 1;
    public const VALUE_POS_BOTTOM = 2;
    public const VALUE_POS_LEFT = 3;
    public const VALUE_POS_RIGHT = 4;

    public function addFields(): self {
        return $this
            // --- item selection ---
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
            )
            // --- display ---
            ->addField(
                (new CWidgetFieldSelect('range_mode', _('Range'), [
                    self::RANGE_FIXED => _('Fixed'),
                    self::RANGE_AUTO => _('Auto (shared, history ±5%)')
                ]))->setDefault(self::RANGE_FIXED)
            )
            // Min/Max are text boxes (not numeric) so a user macro like {$LOW}
            // can be used; the controller resolves it and parses the number.
            ->addField(
                (new CWidgetFieldTextBox('value_min', _('Min')))->setDefault('0')
            )
            ->addField(
                (new CWidgetFieldTextBox('value_max', _('Max')))->setDefault('100')
            )
            ->addField(
                new CWidgetFieldTextBox('units', _('Units (override)'))
            )
            ->addField(
                (new CWidgetFieldIntegerBox('value_decimals', _('Decimals'), 0, 10))->setDefault(1)
            )
            ->addField(
                (new CWidgetFieldSelect('value_pos', _('Value position'), [
                    self::VALUE_POS_OFF => _('Off'),
                    self::VALUE_POS_TOP => _('Top'),
                    self::VALUE_POS_BOTTOM => _('Bottom'),
                    self::VALUE_POS_LEFT => _('Left'),
                    self::VALUE_POS_RIGHT => _('Right')
                ]))->setDefault(self::VALUE_POS_TOP)
            )
            ->addField(
                (new CWidgetFieldCheckBox('value_track', _('Track mercury top (marker)')))->setDefault(0)
            )
            ->addField(
                (new CWidgetFieldIntegerBox('autoscroll', _('Auto-scroll cycle, s (0 = off)'), 0, 3600))
                    ->setDefault(0)
            )
            ->addField(
                (new CWidgetFieldCheckBox('show_bulb', _('Show bulb')))->setDefault(1)
            )
            ->addField(
                (new CWidgetFieldColor('mercury_color', _('Mercury color')))->setDefault('D81B18')
            )
            // --- thresholds ---
            // The whole mercury column is repainted with the color of the highest
            // reached threshold. Threshold values may be user macros ({$WARN}).
            ->addField(
                new CWidgetFieldThermoThresholds('thresholds', _('Thresholds'))
            )
            ->addField(
                (new CWidgetFieldCheckBox('threshold_interpolate',
                    _('Interpolate color between thresholds')
                ))->setDefault(0)
            );
    }
}
