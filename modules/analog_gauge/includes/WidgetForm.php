<?php

namespace Modules\AnalogGauge\Includes;

use Zabbix\Widgets\{
    CWidgetField,
    CWidgetForm
};

use Zabbix\Widgets\Fields\{
    CWidgetFieldCheckBox,
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
 * AnalogGauge widget form (multi-item, grid).
 *
 * Items are selected by name pattern across pattern-matched hosts (hidden on a
 * template dashboard) and filtered by tags — like the SVG graph widget. Each
 * matching item is drawn as its own dial, tiled on a grid. Three visual styles
 * (retro / cyberpunk / industrial) share the same geometry.
 */
class WidgetForm extends CWidgetForm {

    public const RANGE_FIXED = 0;
    public const RANGE_AUTO = 1;

    public const STYLE_RETRO = 0;
    public const STYLE_CYBER = 1;
    public const STYLE_INDUSTRIAL = 2;

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
                (new CWidgetFieldSelect('style', _('Style'), [
                    self::STYLE_RETRO => _('Retro'),
                    self::STYLE_CYBER => _('Cyberpunk'),
                    self::STYLE_INDUSTRIAL => _('Industrial')
                ]))->setDefault(self::STYLE_RETRO)
            )
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
            // 0 = auto: pick a column count that keeps the dials as square as possible.
            ->addField(
                (new CWidgetFieldIntegerBox('columns', _('Grid columns (0 = auto)'), 0, 12))->setDefault(0)
            )
            // Minimum dial size for auto layout. When > 0 the dials never shrink below it —
            // anything that does not fit is reachable by dragging (scroll) both axes.
            ->addField(
                (new CWidgetFieldIntegerBox('cell_min', _('Min gauge size, px (0 = fit to widget)'), 0, 1000))
                    ->setDefault(0)
            )
            ->addField(
                (new CWidgetFieldCheckBox('show_value', _('Show digital value')))->setDefault(1)
            )
            // Needles gently tremble (only the needle/pointer, not the digital value) so
            // movement is easier to catch than a static position.
            ->addField(
                (new CWidgetFieldCheckBox('needle_jitter', _('Needle tremor (jitter)')))->setDefault(0)
            )
            // --- thresholds ---
            // Threshold values may be user macros ({$WARN}); coloured zones are painted
            // on the dial arc and the digital readout takes the highest reached colour.
            ->addField(
                new CWidgetFieldGaugeThresholds('thresholds', _('Thresholds'))
            )
            ->addField(
                (new CWidgetFieldCheckBox('threshold_arc',
                    _('Show threshold zones on the dial')
                ))->setDefault(1)
            );
    }
}
