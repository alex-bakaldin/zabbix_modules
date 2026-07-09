<?php

namespace Modules\ExampleCanvas\Actions;

use CControllerDashboardWidgetView,
    CControllerResponseData;

/**
 * Canvas playground widget controller.
 *
 * Only supplies plain data. The asset image URLs are resolved in the view
 * (views/widget.view.php), because building a module asset URL needs the
 * view's getAssetsPath() helper.
 */
class WidgetView extends CControllerDashboardWidgetView {

    protected function doAction(): void {
        $this->setResponse(new CControllerResponseData([
            'name' => $this->getInput('name', $this->widget->getDefaultName()),
            'label' => $this->fields_values['label'],
            'user' => [
                'debug_mode' => $this->getDebugMode()
            ]
        ]));
    }
}
