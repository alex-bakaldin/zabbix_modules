<?php

namespace Modules\Drawio\Includes;

use API;

/**
 * Shared item resolution for the diagram widget.
 *
 * Used both by the view controller (to read values) and by the edit form
 * (to build the Item key autocomplete). Resolution mirrors example_pattern /
 * CSvgGraphHelper: pattern-matched hosts (or the template / override host on
 * template dashboards), filtered by item tags.
 *
 * $fields_values keys used: items, hosts, groupids, evaltype, item_tags.
 */
class CItemsHelper {

    public static function resolveItems(array $fields_values, string $templateid, string $override_hostid,
            int $limit): array {
        $item_patterns = $fields_values['items'] ?? [];

        if (!$item_patterns) {
            return [];
        }

        $options = [
            'output' => ['itemid', 'hostid', 'name', 'key_', 'value_type', 'units'],
            'selectHosts' => ['name'],
            'selectTags' => ['tag', 'value'],
            'webitems' => true,
            'evaltype' => $fields_values['evaltype'] ?? TAG_EVAL_TYPE_AND_OR,
            'tags' => ($fields_values['item_tags'] ?? []) ?: null,
            'inheritedTags' => true,
            'searchWildcardsEnabled' => true,
            'searchByAny' => true,
            'sortfield' => 'name',
            'sortorder' => ZBX_SORT_UP,
            'limit' => $limit
        ];

        // "*" among the patterns means "all" — then no name search is applied.
        if (!in_array('*', $item_patterns, true)) {
            $options['search'] = ['name' => $item_patterns];
        }

        if ($templateid === '') {
            $hostids = self::resolveHostids($fields_values, $override_hostid);

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

    /**
     * Distinct item keys for the current selection — feeds the Item key autocomplete.
     *
     * @return string[]
     */
    public static function resolveItemKeys(array $fields_values, string $templateid, string $override_hostid,
            int $limit): array {
        $items = self::resolveItems($fields_values, $templateid, $override_hostid, $limit);

        return array_values(array_unique(array_column($items, 'key_')));
    }

    private static function resolveHostids(array $fields_values, string $override_hostid): array {
        if ($override_hostid !== '') {
            return [$override_hostid];
        }

        $host_patterns = $fields_values['hosts'] ?? [];
        $groupids = $fields_values['groupids'] ?? [];

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
