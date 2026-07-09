<?php

namespace Modules\ExampleManometer\Actions;

use API,
    CControllerDashboardWidgetView,
    CControllerResponseData;

/**
 * Manometer widget controller.
 *
 * Reads the last numeric value of the selected item from history; for range_mode
 * "Auto" also computes min/max from the last hour of history (±5%). Without an
 * item / data the value is null and the widget shows a demo sweep.
 */
class WidgetView extends CControllerDashboardWidgetView {

    private const AUTO_RANGE_PERIOD = 3600;
    private const AUTO_RANGE_LIMIT = 1000;

    protected function doAction(): void {
        $value = null;
        $item_units = '';
        $auto_min = null;
        $auto_max = null;

        if ($this->fields_values['itemid']) {
            $db_items = API::Item()->get([
                'output' => ['itemid', 'value_type', 'units'],
                'itemids' => $this->fields_values['itemid'],
                'webitems' => true,
                'filter' => [
                    'value_type' => [ITEM_VALUE_TYPE_UINT64, ITEM_VALUE_TYPE_FLOAT]
                ]
            ]);

            if ($db_items) {
                $item = $db_items[0];
                $item_units = $item['units'];

                $history = API::History()->get([
                    'output' => API_OUTPUT_EXTEND,
                    'itemids' => $item['itemid'],
                    'history' => $item['value_type'],
                    'sortfield' => 'clock',
                    'sortorder' => ZBX_SORT_DOWN,
                    'limit' => 1
                ]);

                if ($history) {
                    $value = $history[0]['value'];
                }

                if ($this->fields_values['range_mode'] == 1) {
                    [$auto_min, $auto_max] = $this->autoRange($item);
                }
            }
        }

        $this->setResponse(new CControllerResponseData([
            'name' => $this->getInput('name', $this->widget->getDefaultName()),
            'value' => $value,
            'units' => $item_units,
            'auto_min' => $auto_min,
            'auto_max' => $auto_max,
            'fields_values' => $this->fields_values,
            'user' => [
                'debug_mode' => $this->getDebugMode()
            ]
        ]));
    }

    private function autoRange(array $item): array {
        $history = API::History()->get([
            'output' => ['value'],
            'itemids' => $item['itemid'],
            'history' => $item['value_type'],
            'time_from' => time() - self::AUTO_RANGE_PERIOD,
            'sortfield' => 'clock',
            'sortorder' => ZBX_SORT_DOWN,
            'limit' => self::AUTO_RANGE_LIMIT
        ]);

        if (!$history) {
            return [null, null];
        }

        $values = array_map('floatval', array_column($history, 'value'));
        $lo = min($values);
        $hi = max($values);

        $span = $hi - $lo;
        if ($span == 0) {
            $span = ($lo != 0) ? abs($lo) * 0.1 : 1;
        }

        return [$lo - $span * 0.05, $hi + $span * 0.05];
    }
}
