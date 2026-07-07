/**
 * CWidgetGaugeBase — общая логика гауджей поверх CWidgetCanvasBase:
 * значение из данных/демо, диапазон (fixed/auto), плавная анимация,
 * форматирование, тема. Конкретный виджет реализует только _drawGauge(ctx, scene).
 *
 * Определяется как общий глобал (assign-once): файл идентичен в модулях-гауджах,
 * первый загрузившийся определяет класс, остальные переиспользуют.
 *
 * scene = { width, height, frac, value, units, min, max, demo, time }.
 */
window.CWidgetGaugeBase = window.CWidgetGaugeBase || class extends CWidgetCanvasBase {

    onInitialize() {
        super.onInitialize();
        this._display = null;   // анимированная доля 0..1
    }

    isAnimated() {
        return true;
    }

    hasPadding() {
        return false;
    }

    getImageUrls() {
        return {};
    }

    _cfg() {
        return (this._data && this._data.fields_values) ? this._data.fields_values : {};
    }

    // Диапазон min..max: фиксированный (поля) или авто (посчитан контроллером).
    _range() {
        const f = this._cfg();

        if (Number(f.range_mode) === 1 && this._data
                && this._data.auto_min !== null && this._data.auto_min !== undefined
                && this._data.auto_max !== null && this._data.auto_max !== undefined) {
            const lo = Number(this._data.auto_min);
            const hi = Number(this._data.auto_max);

            if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
                return {min: lo, max: hi};
            }
        }

        const min = Number(f.value_min);
        const max = Number(f.value_max);

        return {
            min: Number.isFinite(min) ? min : 0,
            max: Number.isFinite(max) ? max : 100
        };
    }

    _targetFraction() {
        if (!this._data || this._data.value === null || this._data.value === undefined) {
            return null;
        }

        const v = Number(this._data.value);
        const {min, max} = this._range();

        if (!Number.isFinite(v) || max === min) {
            return null;
        }

        return Math.min(1, Math.max(0, (v - min) / (max - min)));
    }

    // decimals задан — toFixed; иначе «умно» (целое или 1 знак).
    _fmt(n, decimals) {
        if (!Number.isFinite(n)) {
            return '--';
        }

        if (decimals === undefined || decimals === null || Number.isNaN(decimals)) {
            return (Math.round(n * 10) / 10).toString();
        }

        return n.toFixed(Math.max(0, Math.min(10, decimals)));
    }

    // Осветлить/затемнить hex-цвет на amt (-255..255) → 'rgb(...)'.
    _shade(hex, amt) {
        const h = String(hex).replace('#', '');
        const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
        const r = parseInt(h.substr(0, 2), 16);
        const g = parseInt(h.substr(2, 2), 16);
        const b = parseInt(h.substr(4, 2), 16);

        return `rgb(${clamp(r + amt)}, ${clamp(g + amt)}, ${clamp(b + amt)})`;
    }

    // Тёмная ли тема — по фактическому фону виджета (кэш ~1с).
    _isDark(time) {
        if (this._dark !== undefined && (time - this._dark_t) < 1) {
            return this._dark;
        }

        let dark = false;

        for (let el = this._body; el; el = el.parentElement) {
            const bg = getComputedStyle(el).backgroundColor;
            const m = bg && bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);

            if (m) {
                const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);

                if (alpha > 0.1) {
                    const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
                    dark = lum < 0.5;
                    break;
                }
            }
        }

        this._dark = dark;
        this._dark_t = time;

        return dark;
    }

    draw(ctx, {width, height, time, dt}) {
        const {min, max} = this._range();
        const units = this._cfg().units || (this._data ? this._data.units : '') || '';

        let target = this._targetFraction();
        const demo = target === null;

        if (demo) {
            target = 0.5 + 0.46 * Math.sin(time * 0.7);
        }

        if (this._display === null) {
            this._display = target;
        }
        this._display += (target - this._display) * Math.min(1, dt * 6);

        const frac = this._display;
        const value = demo ? min + frac * (max - min) : Number(this._data.value);

        this._drawGauge(ctx, {width, height, frac, value, units, min, max, demo, time});
    }

    // Единственный метод, который реализует конкретный виджет-гаудж.
    _drawGauge(ctx, scene) {
        throw new Error('CWidgetGaugeBase: override _drawGauge(ctx, scene) in a subclass.');
    }
};
