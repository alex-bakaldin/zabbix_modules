<?php

namespace Modules\Drawio\Includes;

use CWidgetFieldView,
    CTextArea;

/**
 * View for a chunked text field: a plain (large) textarea with no maxlength,
 * since the value is stored chunked and may exceed 64 KB.
 *
 * Registration reuses the native CWidgetFieldTextArea JS class (dirty-tracking
 * only) — the chunking is entirely server-side.
 */
class CWidgetFieldChunkedTextView extends CWidgetFieldView {

    private int $rows = 4;
    private ?string $placeholder = null;

    public function __construct(CWidgetFieldChunkedText $field) {
        $this->field = $field;
    }

    public function setRows(int $rows): self {
        $this->rows = $rows;

        return $this;
    }

    public function setPlaceholder(string $placeholder): self {
        $this->placeholder = $placeholder;

        return $this;
    }

    public function getView(): CTextArea {
        $view = (new CTextArea($this->field->getName(), $this->field->getValue()))
            ->setWidth(ZBX_TEXTAREA_BIG_WIDTH)
            ->setAttribute('rows', $this->rows)
            ->setAttribute('spellcheck', 'false')
            ->setAriaRequired($this->isRequired());

        if ($this->placeholder !== null) {
            $view->setAttribute('placeholder', $this->placeholder);
        }

        return $view;
    }

    public function getJavaScript(): string {
        return '
            CWidgetForm.addField(
                new CWidgetFieldTextArea('.json_encode([
                    'name' => $this->field->getName(),
                    'form_name' => $this->form_name
                ]).')
            );
        ';
    }
}
