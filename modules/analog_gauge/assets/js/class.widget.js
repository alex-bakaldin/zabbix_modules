/**
 * WidgetAnalogGauge — мульти-виджет «сетка аналоговых манометров» на CWidgetGaugeBase.
 *
 * Несколько айтемов (паттерн + теги) рисуются круглыми циферблатами, разложенными
 * по СЕТКЕ (в отличие от горизонтальной карусели термометра). Автоскролла нет; если
 * при заданном мин. размере (cell_min) сетка не влезает — её тянут МЫШЬЮ по обеим осям.
 * Каждый айтем анимирует стрелку к своему значению (опционально — мелко дрожит,
 * имитируя работающий прибор); при отсутствии данных крутит демо-развёртку.
 * Диапазон/пороги — свои у каждого айтема (макросы раскрыты по его хосту). Четыре
 * оформления (Retro / Cyberpunk / Industrial) делят общую геометрию
 * циферблата (дуга 270°), отличаясь только «хромом».
 */
const STYLE_RETRO = 0;
const STYLE_CYBER = 1;
const STYLE_INDUSTRIAL = 2;

const GAUGE_A0 = Math.PI * 0.75;      // начало дуги (низ-слева)
const GAUGE_SWEEP = Math.PI * 1.5;    // 270°

class WidgetAnalogGauge extends CWidgetGaugeBase {

    onInitialize() {
        super.onInitialize();
        this._frac = new Map();     // itemid -> анимированная доля 0..1
        this._cells = [];           // раскладка последнего кадра (для hit-теста наведения)
        this._hover_xy = null;      // {x, y} курсора в canvas
        this._bound = false;

        // Прокрутка (когда сетка не влезает): смещение содержимого, тянется мышью по обеим осям.
        this._scroll = {x: 0, y: 0};
        this._overflow_x = false;
        this._overflow_y = false;
        this._content = {w: 0, h: 0};
        this._dragging = false;
        this._drag = {x0: 0, y0: 0, sx0: 0, sy0: 0};
    }

    setContents(response) {
        super.setContents(response);
        if (!this._bound && this._canvas !== null) {
            this._bindPointer();
            this._bound = true;
        }
    }

    onDestroy() {
        super.onDestroy();
        this._unbindPointer();
    }

    _items() {
        return (this._data && Array.isArray(this._data.items)) ? this._data.items : [];
    }

    // Диапазон КОНКРЕТНОГО айтема: общий auto (посчитан контроллером) в auto-режиме,
    // иначе fixed min/max этого айтема (макросы раскрыты по его хосту).
    _itemRange(item) {
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
        const min = Number(item.min);
        const max = Number(item.max);
        return {min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 100};
    }

    // Пороговые зоны на дуге: от каждого порога до следующего — его цветом (участок ниже
    // первого порога остаётся «дорожкой»). Возвращает сегменты в единицах значения.
    _bands(min, max, thresholds) {
        const th = (Array.isArray(thresholds) ? thresholds : [])
            .filter((t) => Number.isFinite(Number(t.value)))
            .slice()
            .sort((a, b) => Number(a.value) - Number(b.value));
        const segs = [];
        for (let i = 0; i < th.length; i++) {
            const v0 = Math.max(min, Math.min(max, Number(th[i].value)));
            const v1 = (i + 1 < th.length)
                ? Math.max(min, Math.min(max, Number(th[i + 1].value)))
                : max;
            if (v1 > v0) {
                segs.push({v0, v1, color: th[i].color});
            }
        }
        return segs;
    }

    _angleAt(v, min, max) {
        const frac = (max === min) ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
        return GAUGE_A0 + frac * GAUGE_SWEEP;
    }

    _polar(cx, cy, r, a) {
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }

    _arc(ctx, cx, cy, r, a0, a1, color, w, cap) {
        ctx.beginPath();
        ctx.lineCap = cap || 'butt';
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.arc(cx, cy, r, a0, a1);
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    // Выбор числа колонок: максимизируем «эффективный» размер ячейки (min стороны с
    // поправкой на квадратность) — так плитки получаются крупными и близкими к квадрату.
    _autoCols(n, width, height) {
        let best = 1;
        let best_score = -Infinity;
        for (let c = 1; c <= n; c++) {
            const r = Math.ceil(n / c);
            const cw = width / c;
            const ch = height / r;
            const sq = Math.min(cw, ch) / Math.max(cw, ch);
            const score = Math.min(cw, ch) * Math.sqrt(sq);
            if (score > best_score) {
                best_score = score;
                best = c;
            }
        }
        return best;
    }

    draw(ctx, {width, height, dt, time}) {
        const items = this._items();
        const dark = this._isDark(time);

        if (items.length === 0) {
            ctx.fillStyle = '#768d99';
            ctx.font = `${Math.round(Math.min(width, height) * 0.06)}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No data', width / 2, height / 2);
            return;
        }

        const f = this._cfg();
        const style = Number(f.style) || 0;
        const decimals = Number(f.value_decimals);
        const show_value = Number(f.show_value) !== 0;
        const show_arc = Number(f.threshold_arc) !== 0;
        const units_override = f.units || '';
        const jitter_on = Number(f.needle_jitter) !== 0;

        const n = items.length;
        const cell_min = Math.max(0, Math.floor(Number(f.cell_min)) || 0);
        let cols = Math.max(0, Math.floor(Number(f.columns)) || 0);

        // Раскладка. Два режима:
        //  • cell_min = 0 — «подгон под виджет»: неквадратные ячейки заполняют весь виджет, без прокрутки;
        //  • cell_min > 0 — квадратные ячейки не меньше cell_min; что не влезло — тянется мышью (обе оси).
        let cw;
        let ch;
        let contentW;
        let contentH;
        if (cell_min > 0) {
            if (cols < 1) {
                cols = Math.max(1, Math.floor(width / cell_min));
            }
            cols = Math.min(cols, n);
            const rows = Math.ceil(n / cols);
            cw = ch = Math.max(cell_min, width / cols);   // заполняем ширину, но не мельче минимума
            contentW = cols * cw;
            contentH = rows * ch;
        }
        else {
            if (cols < 1) {
                cols = this._autoCols(n, width, height);
            }
            cols = Math.min(cols, n);
            const rows = Math.ceil(n / cols);
            cw = width / cols;
            ch = height / rows;
            contentW = width;
            contentH = height;
        }

        // Смещение содержимого: центрируем по осям, где влезает; иначе — прокрутка (клампится).
        this._content = {w: contentW, h: contentH};
        this._overflow_x = contentW > width + 0.5;
        this._overflow_y = contentH > height + 0.5;
        const offX = this._overflow_x
            ? (this._scroll.x = Math.max(width - contentW, Math.min(0, this._scroll.x)))
            : (this._scroll.x = 0, (width - contentW) / 2);
        const offY = this._overflow_y
            ? (this._scroll.y = Math.max(height - contentH, Math.min(0, this._scroll.y)))
            : (this._scroll.y = 0, (height - contentH) / 2);

        this._cells = [];

        for (let k = 0; k < n; k++) {
            const item = items[k];
            const col = k % cols;
            const row = Math.floor(k / cols);
            const x = offX + col * cw;
            const y = offY + row * ch;

            // Куллинг: ячейки за пределами вьюпорта не рисуем (и не двигаем их анимацию).
            if (x + cw < 0 || x > width || y + ch < 0 || y > height) {
                continue;
            }
            this._cells.push({idx: k, x, y, w: cw, h: ch});

            const {min, max} = this._itemRange(item);
            const has_val = item.value !== null && item.value !== undefined
                && Number.isFinite(Number(item.value));

            // Цель стрелки: значение → доля; без данных — демо-развёртка (сдвиг по индексу,
            // чтобы плитки не качались синхронно).
            let target;
            if (has_val) {
                const v = Number(item.value);
                target = (max === min) ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
            }
            else {
                target = 0.5 + 0.46 * Math.sin(time * 0.7 + k * 1.3);
            }

            const key = item.itemid;
            let cur = this._frac.has(key) ? this._frac.get(key) : target;
            cur += (target - cur) * Math.min(1, dt * 6);
            this._frac.set(key, cur);

            const value = has_val ? Number(item.value) : (min + cur * (max - min));
            const thresholds = Array.isArray(item.thresholds) ? item.thresholds : [];

            const pad = Math.min(cw, ch) * 0.08;
            const capH = Math.min(ch * 0.17, 24);
            const gh = ch - 2 * pad - capH;
            const gw = cw - 2 * pad;
            const R = Math.min(gw, gh) / 2;
            const cx = x + cw / 2;
            const cy = y + pad + gh / 2;

            if (R < 12) {
                // Слишком тесно для циферблата — показываем только число.
                if (show_value) {
                    ctx.fillStyle = dark ? '#c7d2da' : '#33404a';
                    ctx.font = `700 ${Math.max(9, Math.round(Math.min(cw, ch) * 0.24))}px Arial, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const t = has_val ? this._fmt(value, decimals) : '—';
                    ctx.fillText(t, cx, y + ch / 2);
                }
                continue;
            }

            const g = {
                cx, cy, R,
                frac: cur, value, min, max, has_val,
                units: units_override || item.units || '',
                decimals, show_value, show_arc,
                thresholds,
                bands: show_arc ? this._bands(min, max, thresholds) : [],
                // Дрожание — только для стрелки/указателя (не для цифрового значения):
                // мелкая органическая тряска, глазу легче поймать движение.
                jitter: jitter_on ? this._needleJitter(k, time) : 0,
                dark, time
            };

            ctx.save();
            if (style === STYLE_CYBER) {
                this._drawCyber(ctx, g);
            }
            else if (style === STYLE_INDUSTRIAL) {
                this._drawIndustrial(ctx, g);
            }
            else {
                this._drawRetro(ctx, g);
            }
            ctx.restore();

            // Подпись айтема под циферблатом.
            const label = item.name + (item.host && cols <= 2 ? '  ·  ' + item.host : '');
            this._drawCaption(ctx, style, cx, y + ch - capH / 2 - 2, gw, label, dark);
        }

        // Индикаторы прокрутки (когда содержимое не влезает).
        this._drawScrollbars(ctx, width, height, contentW, contentH, offX, offY, dark);

        // Полноимённая подсказка при наведении.
        const hover = this._hoverCell();
        if (hover) {
            const it = items[hover.idx];
            const text = it.name + (it.host ? '  ·  ' + it.host : '');
            this._tooltip(ctx, this._hover_xy.x, hover.y + 4, text, dark, width, height);
        }
    }

    // Мелкое «приборное» дрожание стрелки (радианы): сумма несоизмеримых синусов + фаза по индексу.
    _needleJitter(k, time) {
        const ph = k * 1.7;
        const d = 0.5 * Math.sin(time * 11.0 + ph)
            + 0.3 * Math.sin(time * 17.3 + ph * 2.0)
            + 0.2 * Math.sin(time * 29.0 + ph * 0.5);
        return d * 0.02;   // ≈ ±1.1° на пике
    }

    _drawScrollbars(ctx, width, height, contentW, contentH, offX, offY, dark) {
        const col = dark ? 'rgba(223,230,236,0.45)' : 'rgba(43,54,64,0.4)';
        const t = 4;
        if (contentW > width + 0.5) {
            const frac = width / contentW;
            const bw = Math.max(20, width * frac);
            const bx = (-offX / (contentW - width)) * (width - bw);
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.roundRect(bx, height - t - 1, bw, t, t / 2);
            ctx.fill();
        }
        if (contentH > height + 0.5) {
            const frac = height / contentH;
            const bh = Math.max(20, height * frac);
            const by = (-offY / (contentH - height)) * (height - bh);
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.roundRect(width - t - 1, by, t, bh, t / 2);
            ctx.fill();
        }
    }

    // --- общие детали циферблата ---------------------------------------------

    _drawBands(ctx, g, r, w, cap) {
        for (const seg of g.bands) {
            this._arc(ctx, g.cx, g.cy, r,
                this._angleAt(seg.v0, g.min, g.max),
                this._angleAt(seg.v1, g.min, g.max),
                seg.color, w, cap);
        }
    }

    _drawTicks(ctx, g, rOuter, majorColor, minorColor, drawNums, numColor, numFont) {
        const majors = 10;
        for (let i = 0; i <= majors * 2; i++) {
            const t = i / (majors * 2);
            const a = GAUGE_A0 + t * GAUGE_SWEEP;
            const isMajor = (i % 2 === 0);
            const inner = rOuter - g.R * (isMajor ? 0.14 : 0.08);
            const [ox, oy] = this._polar(g.cx, g.cy, rOuter, a);
            const [ix, iy] = this._polar(g.cx, g.cy, inner, a);
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(ix, iy);
            ctx.strokeStyle = isMajor ? majorColor : minorColor;
            ctx.lineWidth = isMajor ? Math.max(1.5, g.R * 0.02) : 1;
            ctx.stroke();

            if (isMajor && drawNums) {
                const num = g.min + t * (g.max - g.min);
                const [lx, ly] = this._polar(g.cx, g.cy, rOuter - g.R * 0.22, a);
                ctx.fillStyle = numColor;
                ctx.font = numFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this._fmt(num, num >= 100 || Number.isInteger(num) ? 0 : 1), lx, ly);
            }
        }
    }

    _valueText(g) {
        const t = g.has_val ? this._fmt(g.value, g.decimals) : '—';
        return t + (g.units ? ' ' + g.units : '');
    }

    // --- RETRO: винтажный латунный манометр ----------------------------------

    _drawRetro(ctx, g) {
        const {cx, cy, R} = g;
        const angle = GAUGE_A0 + g.frac * GAUGE_SWEEP + (g.jitter || 0);

        // Тень корпуса
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy + R * 0.06, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.filter = 'blur(5px)';
        ctx.fill();
        ctx.restore();

        // Латунный безель
        const bezel = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.2, cx, cy, R);
        bezel.addColorStop(0, '#f4dd94');
        bezel.addColorStop(0.45, '#c69a4c');
        bezel.addColorStop(0.75, '#8a642a');
        bezel.addColorStop(1, '#5a3f18');
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = bezel;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(60,40,15,0.6)';
        ctx.lineWidth = Math.max(1, R * 0.02);
        ctx.stroke();

        // Винты
        const screwR = R * 0.045;
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4 + Math.PI / 8;
            const [sx, sy] = this._polar(cx, cy, R * 0.93, a);
            const sg = ctx.createRadialGradient(sx - screwR * 0.4, sy - screwR * 0.4, 0, sx, sy, screwR);
            sg.addColorStop(0, '#efe0a8');
            sg.addColorStop(1, '#6b4f22');
            ctx.beginPath();
            ctx.arc(sx, sy, screwR, 0, Math.PI * 2);
            ctx.fillStyle = sg;
            ctx.fill();
        }

        // Циферблат
        const faceR = R * 0.82;
        const face = ctx.createRadialGradient(cx, cy - faceR * 0.2, faceR * 0.1, cx, cy, faceR);
        face.addColorStop(0, '#fbf3dc');
        face.addColorStop(0.7, '#eaddb8');
        face.addColorStop(1, '#cdb98a');
        ctx.beginPath();
        ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
        ctx.fillStyle = face;
        ctx.fill();

        // Пороговые зоны
        this._drawBands(ctx, g, faceR * 0.9, Math.max(2, faceR * 0.05));

        // Тики + цифры
        this._drawTicks(ctx, g, faceR * 0.94, '#3a2c14', 'rgba(58,44,20,0.7)',
            true, '#3a2c14', `${Math.round(faceR * 0.12)}px Georgia, "Times New Roman", serif`);

        // Единицы
        if (g.units) {
            ctx.fillStyle = '#5a4622';
            ctx.font = `${Math.round(faceR * 0.13)}px Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(g.units, cx, cy + faceR * 0.4);
        }

        // Цифровое значение (цвет не зависит от порогов — пороги только на циферблате)
        if (g.show_value) {
            ctx.fillStyle = '#7a1f16';
            ctx.font = `700 ${Math.round(faceR * 0.2)}px Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(g.has_val ? this._fmt(g.value, g.decimals) : '—', cx, cy - faceR * 0.42);
        }

        // Стрелка
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = R * 0.05;
        ctx.shadowOffsetY = R * 0.02;
        const nLen = faceR * 0.82;
        const nW = faceR * 0.045;
        const needle = ctx.createLinearGradient(0, -nW, 0, nW);
        needle.addColorStop(0, '#4a5160');
        needle.addColorStop(0.5, '#1d222c');
        needle.addColorStop(1, '#4a5160');
        ctx.fillStyle = needle;
        ctx.beginPath();
        ctx.moveTo(-faceR * 0.18, -nW * 0.7);
        ctx.lineTo(-faceR * 0.18, nW * 0.7);
        ctx.lineTo(0, nW);
        ctx.lineTo(nLen, 0);
        ctx.lineTo(0, -nW);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(nLen * 0.72, 0);
        ctx.lineTo(nLen, 0);
        ctx.lineTo(nLen * 0.72, nW * 0.4);
        ctx.closePath();
        ctx.fillStyle = '#b3251a';
        ctx.fill();
        ctx.restore();

        // Втулка
        const hubR = faceR * 0.1;
        const hub = ctx.createRadialGradient(cx - hubR * 0.4, cy - hubR * 0.4, 0, cx, cy, hubR);
        hub.addColorStop(0, '#f4dd94');
        hub.addColorStop(1, '#6b4f22');
        ctx.beginPath();
        ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
        ctx.fillStyle = hub;
        ctx.fill();

        // Стеклянный блик
        const glass = ctx.createLinearGradient(cx - faceR, cy - faceR, cx + faceR, cy + faceR);
        glass.addColorStop(0, 'rgba(255,255,255,0.28)');
        glass.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        glass.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, faceR, Math.PI * 1.05, Math.PI * 1.75, false);
        ctx.arc(cx, cy, faceR * 0.5, Math.PI * 1.75, Math.PI * 1.05, true);
        ctx.closePath();
        ctx.fillStyle = glass;
        ctx.fill();
    }

    // --- CYBERPUNK: неоновый глянец на тёмном фоне ---------------------------

    _drawCyber(ctx, g) {
        const {cx, cy, R} = g;
        const angle = GAUGE_A0 + g.frac * GAUGE_SWEEP + (g.jitter || 0);
        const neon = '#00e5ff';
        const accent = '#ff2bd6';
        const faceR = R * 0.92;

        // Тёмная «шайба»
        const disc = ctx.createRadialGradient(cx, cy - faceR * 0.3, faceR * 0.1, cx, cy, faceR);
        disc.addColorStop(0, '#141b2b');
        disc.addColorStop(1, '#080b14');
        ctx.beginPath();
        ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
        ctx.fillStyle = disc;
        ctx.fill();

        // Внешнее неоновое кольцо
        ctx.save();
        ctx.shadowColor = neon;
        ctx.shadowBlur = R * 0.18;
        this._arc(ctx, cx, cy, faceR * 0.98, 0, Math.PI * 2, 'rgba(0,229,255,0.55)', Math.max(1.5, R * 0.02));
        ctx.restore();

        // Фоновая дорожка + прогресс
        const trackR = faceR * 0.8;
        const trackW = Math.max(3, R * 0.08);
        this._arc(ctx, cx, cy, trackR, GAUGE_A0, GAUGE_A0 + GAUGE_SWEEP, 'rgba(0,229,255,0.12)', trackW, 'round');

        // Пороговые зоны (неоновые) — отдельным внешним кольцом БОЛЬШЕГО радиуса,
        // чтобы не сливаться с дугой-прогрессом.
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = R * 0.12;
        this._drawBands(ctx, g, faceR * 0.92, Math.max(2, R * 0.045), 'round');
        ctx.restore();

        // Прогресс до значения — цвет фиксированный (не зависит от порогов).
        ctx.save();
        ctx.shadowColor = neon;
        ctx.shadowBlur = R * 0.14;
        this._arc(ctx, cx, cy, trackR, GAUGE_A0, angle, neon, trackW, 'round');
        ctx.restore();

        // Тики
        this._drawTicks(ctx, g, faceR * 0.66, 'rgba(0,229,255,0.9)', 'rgba(0,229,255,0.3)',
            false, neon, '');

        // Стрелка — тонкая, светящаяся
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.shadowColor = accent;
        ctx.shadowBlur = R * 0.16;
        ctx.strokeStyle = accent;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, R * 0.025);
        ctx.beginPath();
        ctx.moveTo(-faceR * 0.12, 0);
        ctx.lineTo(faceR * 0.7, 0);
        ctx.stroke();
        ctx.restore();

        // Втулка
        ctx.save();
        ctx.shadowColor = neon;
        ctx.shadowBlur = R * 0.12;
        ctx.beginPath();
        ctx.arc(cx, cy, faceR * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = neon;
        ctx.fill();
        ctx.restore();

        // Цифровой readout
        if (g.show_value) {
            ctx.save();
            ctx.shadowColor = neon;
            ctx.shadowBlur = R * 0.12;
            ctx.fillStyle = g.has_val ? '#d8feff' : '#5f7a86';
            ctx.font = `700 ${Math.round(faceR * 0.24)}px "Consolas", "Menlo", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(g.has_val ? this._fmt(g.value, g.decimals) : '—', cx, cy + faceR * 0.42);
            ctx.restore();
            if (g.units) {
                ctx.fillStyle = 'rgba(0,229,255,0.7)';
                ctx.font = `${Math.round(faceR * 0.12)}px "Consolas", monospace`;
                ctx.textAlign = 'center';
                ctx.fillText(g.units, cx, cy + faceR * 0.62);
            }
        }
    }

    // --- INDUSTRIAL: тяжёлый стальной корпус ---------------------------------

    _drawIndustrial(ctx, g) {
        const {cx, cy, R} = g;
        const angle = GAUGE_A0 + g.frac * GAUGE_SWEEP + (g.jitter || 0);

        // Стальной безель
        const steel = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        steel.addColorStop(0, '#6b7178');
        steel.addColorStop(0.5, '#3d4247');
        steel.addColorStop(1, '#23262a');
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = steel;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
        ctx.strokeStyle = '#15171a';
        ctx.lineWidth = Math.max(2, R * 0.05);
        ctx.stroke();

        // Болты
        const boltR = R * 0.05;
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2;
            const [bx, by] = this._polar(cx, cy, R * 0.95, a);
            ctx.beginPath();
            ctx.arc(bx, by, boltR, 0, Math.PI * 2);
            ctx.fillStyle = '#8a9096';
            ctx.fill();
            ctx.strokeStyle = '#15171a';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Циферблат (матовый графит)
        const faceR = R * 0.82;
        const face = ctx.createRadialGradient(cx, cy - faceR * 0.3, faceR * 0.1, cx, cy, faceR);
        face.addColorStop(0, '#2b2f34');
        face.addColorStop(1, '#191c20');
        ctx.beginPath();
        ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
        ctx.fillStyle = face;
        ctx.fill();

        // Жёлто-чёрная штриховка опасной зоны у макс (если нет пользовательских порогов)
        if (g.bands.length === 0) {
            this._arc(ctx, cx, cy, faceR * 0.9, GAUGE_A0 + GAUGE_SWEEP * 0.8,
                GAUGE_A0 + GAUGE_SWEEP, '#f5c518', Math.max(3, faceR * 0.08));
        }
        else {
            this._drawBands(ctx, g, faceR * 0.9, Math.max(3, faceR * 0.08));
        }

        // Тики + цифры (жирный сан-сериф)
        this._drawTicks(ctx, g, faceR * 0.92, '#e7e9eb', 'rgba(231,233,235,0.5)',
            true, '#cfd3d7', `700 ${Math.round(faceR * 0.12)}px "Arial Narrow", Arial, sans-serif`);

        // Единицы + значение
        if (g.units) {
            ctx.fillStyle = '#9aa0a6';
            ctx.font = `700 ${Math.round(faceR * 0.13)}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(g.units, cx, cy + faceR * 0.42);
        }
        if (g.show_value) {
            ctx.fillStyle = '#f5c518';
            ctx.font = `700 ${Math.round(faceR * 0.2)}px "Arial Narrow", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(g.has_val ? this._fmt(g.value, g.decimals) : '—', cx, cy - faceR * 0.42);
        }

        // Чугунная стрелка
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = R * 0.04;
        const nLen = faceR * 0.8;
        const nW = faceR * 0.06;
        ctx.fillStyle = '#e7e9eb';
        ctx.beginPath();
        ctx.moveTo(-faceR * 0.2, -nW * 0.8);
        ctx.lineTo(-faceR * 0.2, nW * 0.8);
        ctx.lineTo(0, nW);
        ctx.lineTo(nLen, 0);
        ctx.lineTo(0, -nW);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e8443a';
        ctx.beginPath();
        ctx.moveTo(nLen * 0.7, 0);
        ctx.lineTo(nLen, 0);
        ctx.lineTo(nLen * 0.7, nW * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Втулка
        const hubR = faceR * 0.12;
        const hub = ctx.createRadialGradient(cx - hubR * 0.4, cy - hubR * 0.4, 0, cx, cy, hubR);
        hub.addColorStop(0, '#9aa0a6');
        hub.addColorStop(1, '#3d4247');
        ctx.beginPath();
        ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
        ctx.fillStyle = hub;
        ctx.fill();
        ctx.strokeStyle = '#15171a';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // --- подписи / подсказки --------------------------------------------------

    _drawCaption(ctx, style, cx, cy, maxW, text, dark) {
        let ink;
        if (style === STYLE_CYBER) {
            ink = 'rgba(0,229,255,0.85)';
        }
        else if (style === STYLE_INDUSTRIAL) {
            ink = '#c9ced3';
        }
        else {
            ink = dark ? '#d8c69a' : '#6b5324';
        }
        const fs = Math.max(9, Math.min(14, Math.round(maxW * 0.09)));
        ctx.font = `${fs}px Arial, sans-serif`;
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._ellipsize(ctx, text, maxW), cx, cy);
    }

    _ellipsize(ctx, text, maxW) {
        if (ctx.measureText(text).width <= maxW) {
            return text;
        }
        let t = text;
        while (t.length > 1 && ctx.measureText(t + '…').width > maxW) {
            t = t.slice(0, -1);
        }
        return t + '…';
    }

    _hoverCell() {
        if (!this._hover_xy) {
            return null;
        }
        const {x, y} = this._hover_xy;
        for (const c of this._cells) {
            if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
                return c;
            }
        }
        return null;
    }

    _tooltip(ctx, x, y, text, dark, width, height) {
        const fs = 12;
        ctx.font = `${fs}px Arial, sans-serif`;
        const padX = 8;
        const tw = ctx.measureText(text).width;
        const bw = tw + padX * 2;
        const bh = fs + 10;
        const bx = Math.max(4, Math.min(width - bw - 4, x - bw / 2));
        const by = Math.max(4, Math.min(height - bh - 4, y));

        ctx.save();
        ctx.fillStyle = dark ? 'rgba(20,24,30,0.95)' : 'rgba(40,48,56,0.95)';
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#eef3f7';
        ctx.font = `${fs}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + bw / 2, by + bh / 2);
    }

    // --- мышь: наведение (подсказка) + ручная 2D-прокрутка --------------------

    _canScroll() {
        return (this._overflow_x || this._overflow_y)
            && !(this.isEditMode && this.isEditMode());
    }

    _bindPointer() {
        this._onHover = (e) => {
            const rect = this._canvas.getBoundingClientRect();
            this._hover_xy = {x: e.clientX - rect.left, y: e.clientY - rect.top};
            this._canvas.style.cursor = this._dragging
                ? 'grabbing'
                : (this._canScroll() ? 'grab' : 'default');
        };
        this._onLeave = () => { if (!this._dragging) { this._hover_xy = null; } };

        // Перетаскивание — только вручную мышью, только когда есть что прокручивать.
        this._onDown = (e) => {
            if (!this._canScroll()) {
                return;
            }
            this._dragging = true;
            this._drag = {x0: e.clientX, y0: e.clientY, sx0: this._scroll.x, sy0: this._scroll.y};
            if (this._canvas.setPointerCapture) {
                try { this._canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            this._canvas.style.cursor = 'grabbing';
            e.preventDefault();
        };
        this._onMove = (e) => {
            if (!this._dragging) {
                return;
            }
            // Двигаем только по осям, где есть переполнение (клампится в draw()).
            if (this._overflow_x) {
                this._scroll.x = this._drag.sx0 + (e.clientX - this._drag.x0);
            }
            if (this._overflow_y) {
                this._scroll.y = this._drag.sy0 + (e.clientY - this._drag.y0);
            }
        };
        this._onUp = () => {
            if (this._dragging) {
                this._dragging = false;
                this._canvas.style.cursor = this._canScroll() ? 'grab' : 'default';
            }
        };

        this._canvas.addEventListener('pointermove', this._onHover);
        this._canvas.addEventListener('pointerleave', this._onLeave);
        this._canvas.addEventListener('pointerdown', this._onDown);
        window.addEventListener('pointermove', this._onMove);
        window.addEventListener('pointerup', this._onUp);
    }

    _unbindPointer() {
        if (!this._bound) {
            return;
        }
        this._canvas.removeEventListener('pointermove', this._onHover);
        this._canvas.removeEventListener('pointerleave', this._onLeave);
        this._canvas.removeEventListener('pointerdown', this._onDown);
        window.removeEventListener('pointermove', this._onMove);
        window.removeEventListener('pointerup', this._onUp);
        this._bound = false;
    }
}
