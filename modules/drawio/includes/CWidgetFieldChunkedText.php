<?php

namespace Modules\Drawio\Includes;

use Zabbix\Widgets\CWidgetField;

/**
 * A large text field that transparently chunks across several widget_field
 * rows, so it is not bounded by the 64 KB value_str TEXT column.
 *
 * The logical value is a single string. On save it is split (on character
 * boundaries, keeping each chunk under the column byte limit) into
 * <name>.0, <name>.1, ... On load the framework hands those back as an indexed
 * array, which setValue() re-joins in order.
 *
 * Diagrams and user scripts grow avalanche-like, so chunking is built in from
 * the start rather than bolted on once a limit is hit.
 */
class CWidgetFieldChunkedText extends CWidgetField {

    public const DEFAULT_VIEW = CWidgetFieldChunkedTextView::class;
    public const DEFAULT_VALUE = '';

    // Safe payload per row: value_str is TEXT(65535 bytes); leave head-room.
    private const CHUNK_BYTES = 60000;

    // Generous logical cap (validation only) — grows with more chunks.
    private const MAX_LENGTH = 4194304;

    public function __construct(string $name, ?string $label = null) {
        parent::__construct($name, $label);

        $this
            ->setDefault(self::DEFAULT_VALUE)
            ->setValidationRules(['type' => API_STRING_UTF8, 'length' => self::MAX_LENGTH]);
    }

    public function setValue($value): self {
        if (is_array($value)) {
            ksort($value, SORT_NUMERIC);
            $value = implode('', $value);
        }

        return parent::setValue((string) $value);
    }

    protected function getValidationRules(bool $strict = false): array {
        $validation_rules = parent::getValidationRules($strict);

        if (($this->getFlags() & self::FLAG_NOT_EMPTY) !== 0) {
            self::setValidationRuleFlag($validation_rules, API_NOT_EMPTY);
        }

        return $validation_rules;
    }

    public function toApi(array &$widget_fields = []): void {
        $value = (string) $this->getValue();

        if ($value === (string) $this->getDefault()) {
            return;
        }

        foreach ($this->chunk($value) as $index => $chunk) {
            $widget_fields[] = [
                'type' => $this->save_type,
                'name' => $this->name.'.'.$index,
                'value' => $chunk
            ];
        }
    }

    /**
     * Split on character boundaries so no chunk exceeds CHUNK_BYTES bytes.
     *
     * @return string[]
     */
    private function chunk(string $value): array {
        $chunks = [];
        $current = '';
        $current_bytes = 0;

        foreach (mb_str_split($value) as $char) {
            $char_bytes = strlen($char);

            if ($current_bytes + $char_bytes > self::CHUNK_BYTES && $current !== '') {
                $chunks[] = $current;
                $current = '';
                $current_bytes = 0;
            }

            $current .= $char;
            $current_bytes += $char_bytes;
        }

        $chunks[] = $current;

        return $chunks;
    }
}
