/**
 * CWidgetCanvasBase — универсальная заготовка виджета-«холста» (Canvas 2D).
 *
 * ВАЖНО: ассеты модуля грузятся на ВСЕХ страницах. Если несколько модулей
 * положат этот файл к себе, обычное `class CWidgetCanvasBase {}` объявится
 * дважды → SyntaxError "already declared". Поэтому база определяется
 * ОДИН РАЗ как общий глобал (assign-once): какой модуль загрузится первым —
 * тот и определит класс, остальные переиспользуют (файлы идентичны).
 *
 * Наследник переопределяет только:
 *   draw(ctx, frame) — как рисовать (единственный обязательный метод);
 *   isAnimated()     — нужен ли непрерывный кадровый цикл (по умолчанию нет);
 *   getImageUrls()   — какие картинки грузить (по умолчанию из data.image_urls);
 *   hasPadding()     — нужен ли отступ вокруг холста.
 *
 * frame = { data, images, width, height, time, dt }.
 */
window.CWidgetCanvasBase = window.CWidgetCanvasBase || class extends CWidget {

    // --- точки расширения для наследника -------------------------------------

    isAnimated() {
        return false;
    }

    getImageUrls() {
        return (this._data && this._data.image_urls) ? this._data.image_urls : {};
    }

    draw(ctx, frame) {
        throw new Error('CWidgetCanvasBase: override draw(ctx, frame) in a subclass.');
    }

    // --- жизненный цикл виджета ----------------------------------------------

    onInitialize() {
        super.onInitialize();

        this._canvas = null;
        this._ctx = null;
        this._images = {};
        this._data = null;

        this._raf = null;
        this._start_time = null;
        this._prev_time = null;

        this._css_width = 0;
        this._css_height = 0;
    }

    processUpdateResponse(response) {
        this._data = response;

        super.processUpdateResponse(response);
    }

    setContents(response) {
        if (this._canvas === null) {
            this._body.innerHTML = '';
            this._canvas = document.createElement('canvas');
            this._canvas.classList.add('canvas-widget-surface');
            this._body.appendChild(this._canvas);
            this._ctx = this._canvas.getContext('2d');
            this._resizeCanvas();
        }

        this._preloadImages().then(() => {
            if (this.isAnimated()) {
                this._startLoop();
            }
            else {
                this._renderFrame(this._now());
            }
        });
    }

    onResize() {
        super.onResize();

        if (this._canvas !== null && this.getState() === WIDGET_STATE_ACTIVE) {
            this._resizeCanvas();

            if (!this.isAnimated()) {
                this._renderFrame(this._now());
            }
        }
    }

    onDeactivate() {
        super.onDeactivate();

        this._stopLoop();
    }

    onDestroy() {
        super.onDestroy();

        this._stopLoop();
    }

    // --- внутренняя механика --------------------------------------------------

    _resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const {width, height} = this._getContentsSize();

        this._css_width = Math.max(1, Math.floor(width));
        this._css_height = Math.max(1, Math.floor(height));

        this._canvas.width = Math.round(this._css_width * dpr);
        this._canvas.height = Math.round(this._css_height * dpr);
        this._canvas.style.width = `${this._css_width}px`;
        this._canvas.style.height = `${this._css_height}px`;

        this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _preloadImages() {
        const urls = this.getImageUrls();
        const names = Object.keys(urls).filter((name) => !(name in this._images));

        return Promise.all(names.map((name) => new Promise((resolve) => {
            const img = new Image();

            img.onload = () => { this._images[name] = img; resolve(); };
            img.onerror = () => { resolve(); };
            img.src = urls[name];
        })));
    }

    _startLoop() {
        this._stopLoop();

        const tick = () => {
            this._renderFrame(this._now());
            this._raf = requestAnimationFrame(tick);
        };

        this._raf = requestAnimationFrame(tick);
    }

    _stopLoop() {
        if (this._raf !== null) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    }

    _now() {
        return performance.now();
    }

    _renderFrame(now) {
        if (this._css_width === 0 || this._css_height === 0) {
            this._resizeCanvas();
        }

        if (this._start_time === null) {
            this._start_time = now;
            this._prev_time = now;
        }

        const frame = {
            data: this._data,
            images: this._images,
            width: this._css_width,
            height: this._css_height,
            time: (now - this._start_time) / 1000,
            dt: (now - this._prev_time) / 1000
        };

        this._prev_time = now;

        this._ctx.clearRect(0, 0, this._css_width, this._css_height);
        this.draw(this._ctx, frame);
    }
};
