<?php

namespace Modules\AnalogGauge\Actions;

use API,
    CControllerDashboardWidgetView,
    CControllerResponseData,
    CMacrosResolverHelper,
    CNumberParser,
    CParser;

/**
 * AnalogGauge widget controller (multi-item).
 *
 * Resolves item name patterns across pattern-matched hosts (or the template /
 * override host), filtered by item tags — same model as the SVG graph widget.
 * Returns the last value of each item plus, for range_mode "Auto", a SHARED
 * min/max computed from the combined last-hour history of ALL items (±5%).
 */
class WidgetView extends CControllerDashboardWidgetView {

    private const ITEM_LIMIT = 30;
    private const AUTO_RANGE_PERIOD = 3600;
    private const AUTO_RANGE_LIMIT = 5000;

    protected function doAction(): void {
        $templateid = $this->getInput('templateid', '');
        $override_hostid = $this->fields_values['override_hostid']
            ? $this->fields_values['override_hostid'][0]
            : '';

        $db_items = $this->resolveItems($templateid, $override_hostid);

        $items = [];
        foreach ($db_items as $item) {
            $items[] = [
                'itemid' => $item['itemid'],
                'name' => $item['name'],
                'host' => $item['hosts'] ? $item['hosts'][0]['name'] : '',
                'value' => ($item['lastvalue'] !== '' && $item['lastclock'] > 0) ? $item['lastvalue'] : null,
                'units' => $item['units'],
                'value_type' => (int) $item['value_type']
            ];
        }

        $auto_min = null;
        $auto_max = null;
        if ($db_items && $this->fields_values['range_mode'] == 1) {
            [$auto_min, $auto_max] = $this->sharedAutoRange($db_items);
        }

        // Fixed Min/Max and thresholds are one shared config, but a user macro in them
        // ({$PRESSURE.MAX} etc.) may resolve to a DIFFERENT number on each item's host — so
        // every item carries its own resolved min/max/thresholds.
        $items = $this->attachResolvedConfig($items, $db_items);

        $this->setResponse(new CControllerResponseData([
            'name' => $this->getInput('name', $this->widget->getDefaultName()),
            'items' => $items,
            'auto_min' => $auto_min,
            'auto_max' => $auto_max,
            'fields_values' => $this->fields_values,
            'user' => [
                'debug_mode' => $this->getDebugMode()
            ]
        ]));
    }

    /**
     * Resolve the fixed Min/Max and threshold values PER ITEM: the same config strings
     * are expanded against each item's own host (user macros may differ per host), then
     * parsed into numbers. Each item gets 'min', 'max' and a sorted 'thresholds' list.
     */
    private function attachResolvedConfig(array $items, array $db_items): array {
        $thresholds_raw = $this->fields_values['thresholds'];

        $strings = [
            'value_min' => (string) $this->fields_values['value_min'],
            'value_max' => (string) $this->fields_values['value_max']
        ];
        foreach ($thresholds_raw as $i => $threshold) {
            $strings['th_'.$i] = (string) $threshold['threshold'];
        }

        // Resolve the same strings against every item's host in one batched call
        // (resolveItemBasedWidgetMacros keys the result by itemid and uses each hostid).
        $to_resolve = [];
        foreach ($db_items as $db_item) {
            $to_resolve[$db_item['itemid']] = ['hostid' => $db_item['hostid']] + $strings;
        }
        $resolved = $to_resolve
            ? CMacrosResolverHelper::resolveItemBasedWidgetMacros(
                $to_resolve,
                array_combine(array_keys($strings), array_keys($strings))
            )
            : [];

        $number_parser = new CNumberParser(['with_size_suffix' => true, 'with_time_suffix' => true]);
        $parse = static function (string $str) use ($number_parser): ?float {
            if (trim($str) === '') {
                return null;
            }

            return $number_parser->parse($str) == CParser::PARSE_SUCCESS
                ? (float) $number_parser->calcValue()
                : null;
        };

        foreach ($items as &$item) {
            $r = $resolved[$item['itemid']] ?? $strings;

            $item['min'] = $parse($r['value_min']);
            $item['max'] = $parse($r['value_max']);

            $thresholds = [];
            foreach ($thresholds_raw as $i => $threshold) {
                $value = $parse($r['th_'.$i]);

                if ($value !== null) {
                    $thresholds[] = [
                        'value' => $value,
                        'color' => '#'.ltrim((string) $threshold['color'], '#')
                    ];
                }
            }
            usort($thresholds, static fn(array $a, array $b) => $a['value'] <=> $b['value']);

            $item['thresholds'] = $thresholds;
        }
        unset($item);

        return $items;
    }

    private function resolveItems(string $templateid, string $override_hostid): array {
        $item_patterns = $this->fields_values['items'];

        if (!$item_patterns) {
            return [];
        }

        $options = [
            'output' => ['itemid', 'hostid', 'name', 'value_type', 'units', 'lastvalue', 'lastclock'],
            'selectHosts' => ['name'],
            'webitems' => true,
            // AnalogGauge shows only numeric items — non-numeric (text/log/char) from the
            // pattern are dropped.
            'filter' => [
                'value_type' => [ITEM_VALUE_TYPE_UINT64, ITEM_VALUE_TYPE_FLOAT]
            ],
            'evaltype' => $this->fields_values['evaltype'],
            'tags' => $this->fields_values['item_tags'] ?: null,
            'inheritedTags' => true,
            'searchWildcardsEnabled' => true,
            'searchByAny' => true,
            'sortfield' => 'name',
            'sortorder' => ZBX_SORT_UP,
            'limit' => self::ITEM_LIMIT
        ];

        if (!in_array('*', $item_patterns, true)) {
            $options['search'] = ['name' => $item_patterns];
        }

        if ($templateid === '') {
            $hostids = $this->resolveHostids($override_hostid);

            if (!$hostids) {
                return [];
            }

            $options['hostids'] = $hostids;
        }
        else {
            $options['hostids'] = [$override_hostid !== '' ? $override_hostid : $templateid];
        }

        return API::Item()->get($options);
    }

    private function resolveHostids(string $override_hostid): array {
        if ($override_hostid !== '') {
            return [$override_hostid];
        }

        $host_patterns = $this->fields_values['hosts'];
        $groupids = $this->fields_values['groupids'];

        if (!$host_patterns && !$groupids) {
            return [];
        }

        $options = [
            'output' => [],
            'searchWildcardsEnabled' => true,
            'searchByAny' => true,
            'preservekeys' => true
        ];

        if ($host_patterns && !in_array('*', $host_patterns, true)) {
            $options['search'] = ['name' => $host_patterns];
        }

        if ($groupids) {
            $options['groupids'] = $groupids;
        }

        return array_keys(API::Host()->get($options));
    }

    /**
     * Shared min/max across all items: gather the last hour of history for every
     * item (grouped by value_type), take the global min/max, pad by 5%.
     *
     * @return array  [min, max] as floats, or [null, null] when no data.
     */
    private function sharedAutoRange(array $db_items): array {
        $by_type = [];
        foreach ($db_items as $item) {
            $by_type[$item['value_type']][] = $item['itemid'];
        }

        $values = [];
        foreach ($by_type as $value_type => $itemids) {
            $history = API::History()->get([
                'output' => ['value'],
                'itemids' => $itemids,
                'history' => $value_type,
                'time_from' => time() - self::AUTO_RANGE_PERIOD,
                'limit' => self::AUTO_RANGE_LIMIT
            ]);

            foreach ($history as $point) {
                $values[] = (float) $point['value'];
            }
        }

        if (!$values) {
            return [null, null];
        }

        $lo = min($values);
        $hi = max($values);

        $span = $hi - $lo;
        if ($span == 0) {
            $span = ($lo != 0) ? abs($lo) * 0.1 : 1;
        }

        return [$lo - $span * 0.05, $hi + $span * 0.05];
    }
}
