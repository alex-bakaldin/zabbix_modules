<?php

namespace Modules\ExamplePattern\Actions;

use API,
    CControllerDashboardWidgetView,
    CControllerResponseData;

/**
 * Pattern items widget controller.
 *
 * Resolves item name patterns across pattern-matched hosts (or the template /
 * override host on template dashboards), filtered by item tags, then reads the
 * last value of each item from HISTORY.
 *
 * Resolution mirrors the native SVG graph widget (CSvgGraphHelper):
 *   - patterns use searchWildcardsEnabled + searchByAny;
 *   - a pattern list containing "*" means "match all" (no search filter);
 *   - item tags with inheritedTags=true also match inherited host tags.
 */
class WidgetView extends CControllerDashboardWidgetView {

    /**
     * Safety cap for the debug dump — keeps history reads bounded.
     */
    private const ITEM_LIMIT = 50;

    protected function doAction(): void {
        $templateid = $this->getInput('templateid', '');
        $override_hostid = $this->fields_values['override_hostid']
            ? $this->fields_values['override_hostid'][0]
            : '';

        $items = $this->resolveItems($templateid, $override_hostid);

        $rows = [];

        foreach ($items as $item) {
            // Read the last value from HISTORY (per item, so we hit the right value_type table).
            $history = API::History()->get([
                'output' => API_OUTPUT_EXTEND,
                'itemids' => $item['itemid'],
                'history' => $item['value_type'],
                'sortfield' => 'clock',
                'sortorder' => ZBX_SORT_DOWN,
                'limit' => 1
            ]);

            $rows[] = [
                'host' => $item['hosts'] ? $item['hosts'][0]['name'] : '',
                'name' => $item['name'],
                'key' => $item['key_'],
                'value_type' => (int) $item['value_type'],
                'units' => $item['units'],
                'value' => $history ? $history[0]['value'] : null,
                'clock' => $history ? (int) $history[0]['clock'] : null
            ];
        }

        $this->setResponse(new CControllerResponseData([
            'name' => $this->getInput('name', $this->widget->getDefaultName()),
            'is_template' => $templateid !== '',
            'override_hostid' => $override_hostid,
            'limit' => self::ITEM_LIMIT,
            'rows' => $rows,
            'user' => [
                'debug_mode' => $this->getDebugMode()
            ]
        ]));
    }

    /**
     * @return array  Items with selectHosts=['name'], capped at ITEM_LIMIT.
     */
    private function resolveItems(string $templateid, string $override_hostid): array {
        $item_patterns = $this->fields_values['items'];

        if (!$item_patterns) {
            return [];
        }

        $options = [
            'output' => ['itemid', 'hostid', 'name', 'key_', 'value_type', 'units'],
            'selectHosts' => ['name'],
            'webitems' => true,
            'evaltype' => $this->fields_values['evaltype'],
            'tags' => $this->fields_values['item_tags'] ?: null,
            'inheritedTags' => true,
            'searchWildcardsEnabled' => true,
            'searchByAny' => true,
            'sortfield' => 'name',
            'sortorder' => ZBX_SORT_UP,
            'limit' => self::ITEM_LIMIT
        ];

        // "*" among the patterns means "all" — then no name search is applied.
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
            // Template dashboard: items belong to the template, or to the override/dynamic host at view time.
            $options['hostids'] = [$override_hostid !== '' ? $override_hostid : $templateid];
        }

        return API::Item()->get($options);
    }

    /**
     * Resolve host name patterns (+ host groups) to host IDs on a global dashboard.
     *
     * @return array  Host IDs, or [] when nothing matches / nothing is specified.
     */
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
}
