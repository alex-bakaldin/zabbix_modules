<?php

namespace Modules\ExampleItemCard\Actions;

use API,
    CControllerDashboardWidgetView,
    CControllerResponseData;

class WidgetView extends CControllerDashboardWidgetView {

    protected function doAction(): void {
        $db_items = API::Item()->get([
            'output' => ['itemid', 'value_type', 'name', 'units'],
            'itemids' => $this->fields_values['itemid'],
            'webitems' => true,
            'filter' => [
                'value_type' => [ITEM_VALUE_TYPE_UINT64, ITEM_VALUE_TYPE_FLOAT]
            ]
        ]);

        $history = null;
        $raw_value = null;
        $raw_prev = null;

        if ($db_items) {
            $item = $db_items[0];

            // Fetch the two latest values: [0] = latest, [1] = previous (used for the trend indicator).
            $db_history = API::History()->get([
                'output' => API_OUTPUT_EXTEND,
                'itemids' => $item['itemid'],
                'history' => $item['value_type'],
                'sortfield' => 'clock',
                'sortorder' => ZBX_SORT_DOWN,
                'limit' => 2
            ]);

            if ($db_history) {
                $raw_value = $db_history[0]['value'];

                // convertUnitsRaw() returns the human-friendly value and its scaled units (e.g. 1500 -> "1.5", "K").
                $history = convertUnitsRaw([
                    'value' => $db_history[0]['value'],
                    'units' => $item['units']
                ]);

                if (array_key_exists(1, $db_history)) {
                    $raw_prev = $db_history[1]['value'];
                }
            }
        }

        $this->setResponse(new CControllerResponseData([
            'name' => $this->getInput('name', $this->widget->getDefaultName()),
            'history' => $history,
            'raw_value' => $raw_value,
            'raw_prev' => $raw_prev,
            'fields_values' => $this->fields_values,
            'user' => [
                'debug_mode' => $this->getDebugMode()
            ]
        ]));
    }
}
