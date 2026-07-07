class WidgetExampleItemCard extends CWidget {

    onInitialize() {
        super.onInitialize();

        this._card_data = null;
    }

    processUpdateResponse(response) {
        // Stash the payload sent from the view via setVar() so setContents() can render from it.
        this._card_data = {
            history: response.history,
            raw_value: response.raw_value,
            raw_prev: response.raw_prev,
            fields_values: response.fields_values
        };

        super.processUpdateResponse(response);
    }

    setContents(response) {
        const data = this._card_data;

        this._body.innerHTML = '';

        const card = document.createElement('div');
        card.classList.add('item-card');

        if (data.fields_values.description !== '') {
            const description = document.createElement('div');
            description.classList.add('item-card-description');
            description.textContent = data.fields_values.description;
            card.appendChild(description);
        }

        const value_box = document.createElement('div');
        value_box.classList.add('item-card-value');

        if (data.history === null) {
            value_box.classList.add('item-card-nodata');
            value_box.textContent = t('No data');
        }
        else {
            const color = this._resolveColor(Number(data.raw_value), data.fields_values.thresholds);

            if (color !== null) {
                value_box.style.color = `#${color}`;
            }

            const number = document.createElement('span');
            number.classList.add('item-card-number');
            number.textContent = data.history.value;
            value_box.appendChild(number);

            if (data.history.units !== '') {
                const units = document.createElement('span');
                units.classList.add('item-card-units');
                units.textContent = data.history.units;
                value_box.appendChild(units);
            }

            const trend = this._renderTrend(data);

            if (trend !== null) {
                value_box.appendChild(trend);
            }
        }

        card.appendChild(value_box);
        this._body.appendChild(card);
    }

    /**
     * Pick the color of the highest threshold that the current value reaches (thresholds sorted ascending).
     * Returns null when there are no thresholds or none apply.
     */
    _resolveColor(value, thresholds) {
        if (!Array.isArray(thresholds) || thresholds.length === 0 || Number.isNaN(value)) {
            return null;
        }

        const sorted = thresholds
            .map((threshold) => ({color: threshold.color, value: Number(threshold.threshold)}))
            .filter((threshold) => !Number.isNaN(threshold.value))
            .sort((a, b) => a.value - b.value);

        let color = null;

        for (const threshold of sorted) {
            if (value >= threshold.value) {
                color = threshold.color;
            }
        }

        return color;
    }

    /**
     * Build a ▲/▼/= indicator comparing the latest value to the previous one.
     * Returns null when disabled or when there is no previous value to compare against.
     */
    _renderTrend(data) {
        if (data.fields_values.show_trend != 1 || data.raw_prev === null) {
            return null;
        }

        const diff = Number(data.raw_value) - Number(data.raw_prev);
        const trend = document.createElement('span');
        trend.classList.add('item-card-trend');

        if (diff > 0) {
            trend.classList.add('trend-up');
            trend.textContent = '▲';
        }
        else if (diff < 0) {
            trend.classList.add('trend-down');
            trend.textContent = '▼';
        }
        else {
            trend.classList.add('trend-flat');
            trend.textContent = '=';
        }

        return trend;
    }
}
