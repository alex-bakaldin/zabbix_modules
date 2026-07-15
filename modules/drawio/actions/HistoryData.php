<?php

namespace Modules\Drawio\Actions;

use API,
    CController,
    CControllerResponseData;

/**
 * On-demand history for the chart hints (see hint.history in the docs).
 *
 * The client requests one time-chunk at a time (newest first) for a set of item
 * ids; this returns the raw numeric history points grouped per item. Item and
 * history permissions are enforced by the API, so a user only ever sees their own
 * data. Non-numeric items are dropped (nothing to plot).
 */
class HistoryData extends CController {

    protected function init(): void {
        $this->disableCsrfValidation();
    }

    protected function checkPermissions(): bool {
        return $this->getUserType() >= USER_TYPE_ZABBIX_USER;
    }

    protected function checkInput(): bool {
        $fields = [
            'itemids' => 'array_db items.itemid|required',
            'time_from' => 'int32|required',
            'time_till' => 'int32|required',
            'limit' => 'int32|ge 1|le 5000'
        ];

        $ret = $this->validateInput($fields);

        if (!$ret) {
            $this->setResponse(
                (new CControllerResponseData(['main_block' => json_encode([
                    'error' => [
                        'messages' => array_column(get_and_clear_messages(), 'message')
                    ]
                ])]))->disableView()
            );
        }

        return $ret;
    }

    protected function doAction(): void {
        $items = API::Item()->get([
            'output' => ['itemid', 'value_type', 'name', 'units'],
            'itemids' => $this->getInput('itemids'),
            'webitems' => true,
            'preservekeys' => true
        ]);

        // Keep only numeric items; group ids by value_type for the history query.
        $by_type = [];
        $result = [];

        foreach ($items as $itemid => $item) {
            $value_type = (int) $item['value_type'];

            if ($value_type != ITEM_VALUE_TYPE_FLOAT && $value_type != ITEM_VALUE_TYPE_UINT64) {
                continue;
            }

            $by_type[$value_type][] = $itemid;
            $result[$itemid] = [
                'name' => $item['name'],
                'units' => $item['units'],
                'points' => []
            ];
        }

        $time_from = $this->getInput('time_from');
        $time_till = $this->getInput('time_till');
        $limit = (int) $this->getInput('limit', 500);

        // Cursor pagination by value count: the newest `limit` points within the window.
        // The client walks back by re-requesting with time_till = oldest - 1. `truncated`
        // tells it there may be older data (a full page came back); `oldest` is the cursor.
        $oldest = null;
        $truncated = false;

        foreach ($by_type as $value_type => $itemids) {
            $history = API::History()->get([
                'output' => ['itemid', 'clock', 'value'],
                'itemids' => $itemids,
                'history' => $value_type,
                'time_from' => $time_from,
                'time_till' => $time_till,
                'sortfield' => 'clock',
                'sortorder' => ZBX_SORT_DOWN,
                'limit' => $limit
            ]);

            if (count($history) >= $limit) {
                $truncated = true;
            }

            foreach ($history as $point) {
                $clock = (int) $point['clock'];
                $result[$point['itemid']]['points'][] = [$clock, (float) $point['value']];

                if ($oldest === null || $clock < $oldest) {
                    $oldest = $clock;
                }
            }
        }

        // Fetched newest-first; the chart wants each series oldest-first.
        foreach ($result as &$item) {
            usort($item['points'], static fn(array $a, array $b): int => $a[0] <=> $b[0]);
        }
        unset($item);

        $this->setResponse(
            (new CControllerResponseData(['main_block' => json_encode([
                'items' => $result,
                'oldest' => $oldest,
                'truncated' => $truncated
            ])]))->disableView()
        );
    }
}
