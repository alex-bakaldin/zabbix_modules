<?php

namespace Modules\Drawio\Actions;

use API,
    CControllerDashboardWidgetView,
    CControllerResponseData,
    CHintBoxHelper;

use Modules\Drawio\Includes\CItemsHelper;

/**
 * Diagram (draw.io / SVG) widget controller.
 *
 * Resolves the selected items (and the triggers of their hosts) and returns
 * them grouped by host, together with the raw diagram SVG and the user script.
 * The frontend runs the script (sandboxed) with this data + a CRUD API over the
 * diagram cells.
 */
class WidgetView extends CControllerDashboardWidgetView {

    private const ITEM_LIMIT = 500;
    private const TRIGGER_LIMIT = 500;

    protected function init(): void {
        parent::init();

        // Sent by the JS when the widget uses its own (not the dashboard's) time period.
        $this->addValidationRules([
            'has_custom_time_period' => 'in 1'
        ]);
    }

    protected function doAction(): void {
        $templateid = $this->getInput('templateid', '');
        $override_hostid = $this->fields_values['override_hostid']
            ? $this->fields_values['override_hostid'][0]
            : '';

        $items = CItemsHelper::resolveItems($this->fields_values, $templateid, $override_hostid, self::ITEM_LIMIT);

        // Group items by host, reading each item's last value from HISTORY.
        $hosts = [];

        foreach ($items as $item) {
            $hostid = $item['hostid'];

            if (!array_key_exists($hostid, $hosts)) {
                $hosts[$hostid] = [
                    'host' => $item['hosts'] ? $item['hosts'][0]['name'] : '',
                    'hostid' => $hostid,
                    'tags' => [],
                    'macros' => [],
                    'items' => [],
                    'triggers' => []
                ];
            }

            $history = API::History()->get([
                'output' => API_OUTPUT_EXTEND,
                'itemids' => $item['itemid'],
                'history' => $item['value_type'],
                'sortfield' => 'clock',
                'sortorder' => ZBX_SORT_DOWN,
                'limit' => 1
            ]);

            $hosts[$hostid]['items'][] = [
                'itemid' => $item['itemid'],
                'key' => $item['key_'],
                'name' => $item['name'],
                'value_type' => (int) $item['value_type'],
                'units' => $item['units'],
                'value' => $history ? $history[0]['value'] : null,
                'clock' => $history ? (int) $history[0]['clock'] : null,
                'tags' => self::tags($item['tags'] ?? [])
            ];
        }

        $this->addTriggers($hosts);
        $this->addHostTags($hosts);
        $this->addHostMacros($hosts);

        $this->setResponse(new CControllerResponseData([
            'name' => $this->getInput('name', $this->widget->getDefaultName()),
            'diagram' => $this->fields_values['diagram'],
            'script' => $this->fields_values['script'],
            'hosts' => array_values($hosts),
            // Resolved absolute range for the chart hints (hint.history).
            'time_period' => [
                'from' => (int) $this->fields_values['time_period']['from_ts'],
                'to' => (int) $this->fields_values['time_period']['to_ts']
            ],
            'user' => [
                'debug_mode' => $this->getDebugMode()
            ]
        ]));
    }

    /**
     * Attach each host's triggers (current state) to the grouped host model.
     */
    private function addTriggers(array &$hosts): void {
        if (!$hosts) {
            return;
        }

        $triggers = API::Trigger()->get([
            'output' => ['triggerid', 'description', 'priority', 'status', 'value'],
            'selectHosts' => ['hostid'],
            'selectTags' => ['tag', 'value'],
            'hostids' => array_keys($hosts),
            'expandDescription' => true,
            'monitored' => true,
            'sortfield' => 'priority',
            'sortorder' => ZBX_SORT_DOWN,
            'limit' => self::TRIGGER_LIMIT
        ]);

        $problem_events = $this->problemEvents($triggers);

        foreach ($triggers as $trigger) {
            $model = [
                'triggerid' => $trigger['triggerid'],
                'description' => $trigger['description'],
                'priority' => (int) $trigger['priority'],
                'status' => (int) $trigger['status'],
                'value' => (int) $trigger['value'],
                'tags' => self::tags($trigger['tags'] ?? [])
            ];

            // A ready-to-use native "event list" hintbox spec for the trigger's current
            // problem (see hint.preload in the docs) — the script can drop it straight
            // into set({interact:{hint:{preload: trigger.event_hint}}}). Only present
            // while the trigger has an open problem (eventid_till is required).
            if (array_key_exists($trigger['triggerid'], $problem_events)) {
                $model['event_hint'] = CHintBoxHelper::getEventList(
                    $trigger['triggerid'], $problem_events[$trigger['triggerid']]
                );
            }

            foreach ($trigger['hosts'] as $host) {
                if (array_key_exists($host['hostid'], $hosts)) {
                    $hosts[$host['hostid']]['triggers'][] = $model;
                }
            }
        }
    }

    /**
     * Map triggerid => latest open-problem eventid, for the given triggers. Used as
     * `eventid_till` when building the native event-list hintbox.
     */
    private function problemEvents(array $triggers): array {
        $triggerids = array_column($triggers, 'triggerid');

        if (!$triggerids) {
            return [];
        }

        $problems = API::Problem()->get([
            'output' => ['eventid', 'objectid'],
            'source' => EVENT_SOURCE_TRIGGERS,
            'object' => EVENT_OBJECT_TRIGGER,
            'objectids' => $triggerids,
            'sortfield' => ['eventid'],
            'sortorder' => ZBX_SORT_DOWN
        ]);

        $map = [];

        // Sorted newest-first, so the first eventid seen per trigger is the latest.
        foreach ($problems as $problem) {
            if (!array_key_exists($problem['objectid'], $map)) {
                $map[$problem['objectid']] = $problem['eventid'];
            }
        }

        return $map;
    }

    /**
     * Attach each host's own tags to the grouped host model.
     */
    private function addHostTags(array &$hosts): void {
        if (!$hosts) {
            return;
        }

        $data = API::Host()->get([
            'output' => [],
            'selectTags' => ['tag', 'value'],
            'hostids' => array_keys($hosts),
            'preservekeys' => true
        ]);

        foreach ($data as $hostid => $host) {
            if (array_key_exists($hostid, $hosts)) {
                $hosts[$hostid]['tags'] = self::tags($host['tags'] ?? []);
            }
        }
    }

    /**
     * Attach each host's effective user macros as a { name: value } object.
     *
     * Uses Zabbix's own inheritance logic (getInheritedMacros + mergeInheritedMacros,
     * from include/hosts.inc.php, bootstrap-loaded) so global + template macros are
     * included with correct override precedence (host > template chain > global).
     * Secret macros carry no value (masked); vault macros carry the configured path —
     * exactly as the host edit form shows them.
     */
    private function addHostMacros(array &$hosts): void {
        if (!$hosts) {
            return;
        }

        $db = API::Host()->get([
            'output' => [],
            'selectMacros' => ['macro', 'value', 'type'],
            'selectParentTemplates' => ['templateid'],
            'hostids' => array_keys($hosts),
            'preservekeys' => true
        ]);

        foreach ($db as $hostid => $host) {
            if (!array_key_exists($hostid, $hosts)) {
                continue;
            }

            $templateids = array_column($host['parentTemplates'], 'templateid');
            $merged = mergeInheritedMacros($host['macros'], getInheritedMacros($templateids));

            $macros = [];

            foreach ($merged as $macro) {
                // Secret macros have no exposed value (unset by mergeInheritedMacros).
                $macros[$macro['macro']] = array_key_exists('value', $macro) ? $macro['value'] : '';
            }

            $hosts[$hostid]['macros'] = $macros;
        }
    }

    /**
     * Normalize a Zabbix tags array to a plain [{tag, value}] list for the script.
     */
    private static function tags(array $tags): array {
        $out = [];

        foreach ($tags as $t) {
            $out[] = ['tag' => $t['tag'], 'value' => $t['value'] ?? ''];
        }

        return $out;
    }
}
