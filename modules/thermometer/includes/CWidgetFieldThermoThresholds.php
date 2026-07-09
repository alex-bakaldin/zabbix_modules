<?php

namespace Modules\Thermometer\Includes;

use Zabbix\Widgets\CWidgetField;
use Zabbix\Widgets\Fields\CWidgetFieldThresholds;

/**
 * Thresholds field that additionally accepts user macros ({$MACRO}) as the
 * threshold value.
 *
 * The stock CWidgetFieldThresholds validates each threshold as a strict number
 * (API_NUMERIC) and its validate() runs filterAndSortThresholds(), which
 * silently DROPS any row that is not a plain number — so a macro like {$WARN}
 * never survives. Here we relax the value to a string and keep every row as
 * entered; the controller resolves the macros per host and parses the numbers.
 */
class CWidgetFieldThermoThresholds extends CWidgetFieldThresholds {

    public function __construct(string $name, ?string $label = null) {
        parent::__construct($name, $label);

        $this->setValidationRules(['type' => API_OBJECTS, 'uniq' => [['threshold']], 'fields' => [
            'color'     => ['type' => API_COLOR, 'flags' => API_REQUIRED | API_NOT_EMPTY],
            'threshold' => ['type' => API_STRING_UTF8, 'flags' => API_REQUIRED | API_NOT_EMPTY, 'length' => 255]
        ]]);
    }

    /**
     * Keep rows exactly as entered (numbers OR macros). We skip the parent's
     * numeric filter/sort — ordering by value is done in the controller once the
     * macros have been resolved to actual numbers.
     */
    public function validate($strict = false): array {
        return CWidgetField::validate($strict);
    }
}
