/**
 * WidgetThermometer — мульти-термометр «карусель» на CWidgetGaugeBase.
 *
 * Несколько айтемов (паттерн + теги) рисуются бесконечной горизонтальной каруселью:
 * центральный градусник крупнее и «в фокусе» (шире — влезает маркер значения),
 * боковые меньше и гаснут у краёв. Имя сфокусированного айтема — плашка со стрелкой,
 * указывающей на его градусник. Прокрутка — перетаскиванием мыши или автоскроллом.
 * Диапазон общий для всех (fixed или auto по объединённой истории).
 */
const VALUE_POS_OFF = 0;
const VALUE_POS_TOP = 1;
const VALUE_POS_BOTTOM = 2;
const VALUE_POS_LEFT = 3;
const VALUE_POS_RIGHT = 4;

class WidgetThermometer extends CWidgetGaugeBase {

    onInitialize() {
        super.onInitialize();
        this._scroll = 0;
        this._scroll_target = 0;
        this._dragging = false;
        this._drag_x0 = 0;
        this._drag_scroll0 = 0;
        this._slot_w = 1;
        this._drag_bound = false;
        this._hovering = false;
    }

    setContents(response) {
        super.setContents(response);
        if (!this._drag_bound && this._canvas !== null) {
            this._bindDrag();
            this._drag_bound = true;
        }
    }

    onDestroy() {
        super.onDestroy();
        this._unbindDrag();
    }

    _items() {
        return (this._data && Array.isArray(this._data.items)) ? this._data.items : [];
    }

    _sharedRange() {
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
        return {min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 100};
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

        const n = items.length;
        const f = this._cfg();
        const autoscroll = Math.max(0, Number(f.autoscroll) || 0);   // секунд на полный цикл

        // Движение карусели.
        if (!this._dragging) {
            if (autoscroll > 0 && n > 1 && !this._hovering) {
                this._scroll += (n / autoscroll) * dt;          // плавный автоскролл (пауза при наведении)
                this._scroll_target = this._scroll;
            }
            else {
                this._scroll += (this._scroll_target - this._scroll) * Math.min(1, dt * 8);
            }
        }
        if (n > 1) {
            this._scroll = ((this._scroll % n) + n) % n;         // зацикливание
        }
        else {
            this._scroll = 0;
        }

        const {min, max} = this._sharedRange();
        const decimals = Number(f.value_decimals);
        const show_bulb = Number(f.show_bulb) !== 0;
        const merc_hex = '#' + (f.mercury_color || 'D81B18');
        const units_override = f.units || '';
        const value_pos = Number(f.value_pos);
        const value_track = Number(f.value_track) !== 0;

        // Вертикальная раскладка.
        const nameH = height * 0.16;
        const baseY = height - nameH;
        const valueH = height * 0.1;
        const fullTubeTop = height * 0.02 + valueH;
        const fullH = baseY - fullTubeTop;

        const cx = width / 2;
        let slot_w = Math.min(width, Math.max(90, height * 0.3));
        // В режиме бокового значения раздвигаем градусники, чтобы «перо» помещалось.
        if (value_pos === VALUE_POS_LEFT || value_pos === VALUE_POS_RIGHT) {
            slot_w = Math.min(width, slot_w * 1.7);
        }
        this._slot_w = slot_w;
        const full_tube_w = Math.min(slot_w * 0.34, fullH * 0.13);
        const thr = slot_w * 0.6;

        // Раскладка (бесконечный цикл вокруг центра).
        const focused_k = Math.round(this._scroll);
        const half = (n > 1) ? Math.ceil(width / (2 * slot_w)) + 1 : 0;
        const layout = [];
        for (let k = focused_k - half; k <= focused_k + half; k++) {
            const idx = ((k % n) + n) % n;
            const p = k - this._scroll;
            const x = cx + p * slot_w;
            if (x < -slot_w * 0.6 || x > width + slot_w * 0.6) {
                continue;
            }
            const edge = Math.min(x, width - x);
            let scale;
            let alpha;
            if (edge >= thr) {
                scale = 1;
                alpha = 1;
            }
            else {
                const tt = (thr - edge) / thr;
                scale = Math.max(0.4, 1 - 0.5 * tt);
                alpha = Math.max(0, 1 - tt);
            }
            if (alpha <= 0.03) {
                continue;
            }
            const focus = Math.max(0, 1 - Math.abs(p));       // 1 в центре → «шире»
            scale *= 1 + 0.1 * focus;
            layout.push({idx, x, scale, alpha, d: Math.abs(p)});
        }
        layout.sort((a, b) => b.d - a.d);

        const focused = layout.length
            ? layout.reduce((a, b) => (b.d < a.d ? b : a))
            : null;

        for (const L of layout) {
            const item = items[L.idx];
            const tubeTop = baseY - fullH * L.scale;
            ctx.save();
            ctx.globalAlpha = L.alpha;
            this._drawOne(ctx, {
                cx: L.x,
                tubeTop,
                baseY,
                tubeW: full_tube_w * L.scale,
                item,
                min,
                max,
                decimals,
                units: units_override || item.units || '',
                show_bulb,
                merc_hex,
                dark,
                withScale: L.scale > 0.98,
                value_pos,       // «перо»/значение — на КАЖДОМ градуснике
                value_track
            });
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Имя сфокусированного айтема — плашка со стрелкой на его градусник.
        if (focused) {
            const fitem = items[focused.idx];
            const label = fitem.name + (fitem.host ? '  ·  ' + fitem.host : '');
            this._drawNamePlaque(ctx, focused.x, baseY + nameH * 0.36, label, dark, width);
        }

        if (n > 1) {
            this._drawDots(ctx, width, baseY + nameH * 0.82, n, ((focused_k % n) + n) % n, dark);
        }
    }

    _drawOne(ctx, o) {
        const {cx, tubeTop, baseY, tubeW, item, min, max, decimals, units, show_bulb, merc_hex, dark,
            withScale, value_pos, value_track} = o;

        const rad = tubeW / 2;
        const mw = rad * 0.55;
        const bulbR = show_bulb ? tubeW * 0.62 : 0;
        const bulbCy = baseY - bulbR;
        const tubeBottom = show_bulb ? bulbCy : baseY;

        if (tubeBottom - tubeTop < 12) {
            return;
        }

        const yMax = tubeTop + rad;
        const yMin = show_bulb ? bulbCy : (tubeBottom - rad);
        const span = yMin - yMax;

        const ink = dark ? '#c7d2da' : '#33404a';
        const value_color = dark ? '#ff6b63' : '#c0141b';

        const has_val = item.value !== null && item.value !== undefined && Number.isFinite(Number(item.value));
        const v = has_val ? Number(item.value) : min;
        const frac = (max === min) ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
        const fillY = yMin - frac * span;
        const yAt = (vv) => yMin - ((vv - min) / (max - min)) * span;

        const tubePath = () => {
            ctx.beginPath();
            ctx.moveTo(cx - rad, tubeTop + rad);
            ctx.arc(cx, tubeTop + rad, rad, Math.PI, 0, false);
            if (show_bulb) {
                ctx.lineTo(cx + rad, tubeBottom);
                ctx.lineTo(cx - rad, tubeBottom);
            }
            else {
                ctx.lineTo(cx + rad, tubeBottom - rad);
                ctx.arc(cx, tubeBottom - rad, rad, 0, Math.PI, false);
            }
            ctx.closePath();
        };

        // Стекло
        const glass = ctx.createLinearGradient(cx - rad, 0, cx + rad, 0);
        glass.addColorStop(0, '#ffffff');
        glass.addColorStop(0.5, '#d3dde4');
        glass.addColorStop(1, '#aebac4');
        ctx.fillStyle = glass;
        tubePath();
        ctx.fill();
        if (show_bulb) {
            ctx.beginPath();
            ctx.arc(cx, bulbCy, bulbR, 0, Math.PI * 2);
            ctx.fill();
        }

        // Базовая линия нуля
        const zero_in_range = (min < 0 && max > 0);
        const yZero = zero_in_range ? yAt(0) : null;
        if (zero_in_range) {
            ctx.save();
            ctx.strokeStyle = dark ? 'rgba(199,210,218,0.45)' : 'rgba(51,64,74,0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(cx - rad, yZero);
            ctx.lineTo(cx + rad, yZero);
            ctx.stroke();
            ctx.restore();
        }

        // Ртуть (клип по трубке)
        const merc = ctx.createLinearGradient(cx - rad, 0, cx + rad, 0);
        merc.addColorStop(0, this._shade(merc_hex, 70));
        merc.addColorStop(0.5, merc_hex);
        merc.addColorStop(1, this._shade(merc_hex, -70));
        ctx.save();
        tubePath();
        if (show_bulb) {
            ctx.moveTo(cx + bulbR, bulbCy);
            ctx.arc(cx, bulbCy, bulbR, 0, Math.PI * 2);
        }
        ctx.clip();
        ctx.fillStyle = merc;
        if (has_val) {
            if (show_bulb) {
                ctx.beginPath();
                ctx.arc(cx, bulbCy, bulbR * 0.72, 0, Math.PI * 2);
                ctx.fill();
                this._column(ctx, cx, mw, fillY, bulbCy, true, false);
            }
            else {
                const base = (yZero !== null) ? yZero : yAt(Math.min(max, Math.max(min, 0)));
                this._column(ctx, cx, mw, Math.min(fillY, base), Math.max(fillY, base), true, true);
            }
        }
        else if (show_bulb) {
            ctx.beginPath();
            ctx.arc(cx, bulbCy, bulbR * 0.72, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Блик
        ctx.save();
        tubePath();
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(cx - rad * 0.7, tubeTop, rad * 0.35, span);
        ctx.restore();

        // Шкала (лейблы только для полноразмерных)
        const ticks = 10;
        const step = (max - min) / ticks;
        const scale_dec = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
        const sx = cx + rad + 4;
        const scale_font = Math.max(8, Math.round((baseY - tubeTop) * 0.055));
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.font = `${scale_font}px Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= ticks; i++) {
            const y = yMin - (i / ticks) * span;
            const major = (i % 5 === 0);
            ctx.lineWidth = major ? 1.5 : 1;
            ctx.beginPath();
            ctx.moveTo(sx, y);
            ctx.lineTo(sx + (major ? 9 : 5), y);
            ctx.stroke();
            if (major && withScale) {
                ctx.fillText(this._fmt(min + (i / ticks) * (max - min), scale_dec), sx + 13, y);
            }
        }
        if (zero_in_range) {
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx, yZero);
            ctx.lineTo(sx + 11, yZero);
            ctx.stroke();
            if (withScale) {
                ctx.font = `700 ${scale_font}px Arial, sans-serif`;
                ctx.fillText('0', sx + 14, yZero);
            }
        }

        // Значение (по value_pos)
        const vf = Math.max(9, (baseY - tubeTop) * 0.1);
        const text = (has_val ? this._fmt(v, decimals) : '—') + (units ? ' ' + units : '');
        ctx.fillStyle = value_color;
        ctx.textBaseline = 'middle';

        if (value_pos === VALUE_POS_TOP) {
            ctx.font = `700 ${Math.round(vf)}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(text, cx, tubeTop - vf * 0.6);
        }
        else if (value_pos === VALUE_POS_BOTTOM) {
            ctx.font = `700 ${Math.round(vf)}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(text, cx, baseY + vf * 0.7);
        }
        else if (value_pos === VALUE_POS_LEFT || value_pos === VALUE_POS_RIGHT) {
            const dir = value_pos === VALUE_POS_RIGHT ? 1 : -1;
            if (value_track) {
                this._drawMarker(ctx, cx + dir * rad, fillY, dir, text, merc_hex, Math.round(vf));
            }
            else {
                ctx.font = `700 ${Math.round(vf)}px Arial, sans-serif`;
                ctx.textAlign = dir > 0 ? 'left' : 'right';
                ctx.fillText(text, cx + dir * (rad + 6), (yMax + yMin) / 2);
            }
        }
    }

    _column(ctx, cx, mw, y1, y2, roundTop, roundBottom) {
        ctx.beginPath();
        ctx.moveTo(cx - mw, y1);
        ctx.lineTo(cx + mw, y1);
        ctx.lineTo(cx + mw, y2);
        ctx.lineTo(cx - mw, y2);
        ctx.closePath();
        ctx.fill();
        if (roundTop) {
            ctx.beginPath();
            ctx.arc(cx, y1, mw, Math.PI, 0, false);
            ctx.fill();
        }
        if (roundBottom) {
            ctx.beginPath();
            ctx.arc(cx, y2, mw, 0, Math.PI, false);
            ctx.fill();
        }
    }

    // Маркер-«перо самописца»: указатель + плашка со значением.
    _drawMarker(ctx, xEdge, y, dir, text, color, fs) {
        ctx.font = `700 ${fs}px Arial, sans-serif`;
        const padX = 6;
        const ptr = 8;
        const tw = ctx.measureText(text).width;
        const bw = tw + padX * 2;
        const bh = fs + 8;
        const tipX = xEdge + dir * 2;
        const nearX = tipX + dir * ptr;
        const farX = nearX + dir * bw;
        const x0 = Math.min(nearX, farX);
        const x1 = Math.max(nearX, farX);

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(tipX, y);
        ctx.lineTo(nearX, y - bh / 2);
        ctx.lineTo(nearX, y + bh / 2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x0, y - bh / 2, x1 - x0, bh, 3);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, (x0 + x1) / 2, y);
    }

    // Плашка с именем айтема и министрелкой вверх на его градусник.
    _drawNamePlaque(ctx, thermoX, cy, text, dark, width) {
        const fs = 13;
        ctx.font = `${fs}px Arial, sans-serif`;
        const maxW = width * 0.9;
        let tw = ctx.measureText(text).width;
        if (tw > maxW) {
            this._fitText(ctx, text, maxW, fs);
            tw = ctx.measureText(text).width;
        }
        const padX = 10;
        const bw = tw + padX * 2;
        const bh = fs + 10;
        const bx = Math.max(4, Math.min(width - bw - 4, thermoX - bw / 2));
        const arrowX = Math.max(bx + 10, Math.min(bx + bw - 10, thermoX));
        const arrowH = 6;

        ctx.save();
        ctx.fillStyle = dark ? 'rgba(58,70,80,0.92)' : 'rgba(255,255,255,0.94)';
        ctx.strokeStyle = dark ? 'rgba(199,210,218,0.4)' : 'rgba(51,64,74,0.25)';
        ctx.lineWidth = 1;
        // стрелка вверх + плашка одним контуром
        ctx.beginPath();
        ctx.moveTo(arrowX, cy - bh / 2 - arrowH);
        ctx.lineTo(arrowX + 6, cy - bh / 2);
        ctx.lineTo(bx + bw - 4, cy - bh / 2);
        ctx.arcTo(bx + bw, cy - bh / 2, bx + bw, cy - bh / 2 + 4, 4);
        ctx.lineTo(bx + bw, cy + bh / 2 - 4);
        ctx.arcTo(bx + bw, cy + bh / 2, bx + bw - 4, cy + bh / 2, 4);
        ctx.lineTo(bx + 4, cy + bh / 2);
        ctx.arcTo(bx, cy + bh / 2, bx, cy + bh / 2 - 4, 4);
        ctx.lineTo(bx, cy - bh / 2 + 4);
        ctx.arcTo(bx, cy - bh / 2, bx + 4, cy - bh / 2, 4);
        ctx.lineTo(arrowX - 6, cy - bh / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = dark ? '#eef3f7' : '#2b3640';
        ctx.font = `${fs}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + bw / 2, cy);
    }

    _drawDots(ctx, width, y, n, focused, dark) {
        const r = 3;
        const gap = 12;
        const max_dots = Math.min(n, Math.floor((width * 0.9) / gap));
        const shown = max_dots;
        const total = (shown - 1) * gap;
        const x0 = width / 2 - total / 2;
        for (let i = 0; i < shown; i++) {
            const active = (i === focused % shown);
            ctx.beginPath();
            ctx.arc(x0 + i * gap, y, active ? r + 1 : r, 0, Math.PI * 2);
            ctx.fillStyle = active
                ? (dark ? '#dfe6ec' : '#2b3640')
                : (dark ? 'rgba(223,230,236,0.35)' : 'rgba(43,54,64,0.3)');
            ctx.fill();
        }
    }

    _fitText(ctx, text, max_w, start_px) {
        let fs = start_px;
        do {
            ctx.font = `${fs}px Arial, sans-serif`;
            fs -= 1;
        } while (fs > 8 && ctx.measureText(text).width > max_w);
    }

    // --- перетаскивание мышью ---

    _bindDrag() {
        this._onDown = (e) => {
            if ((this.isEditMode && this.isEditMode()) || this._items().length <= 1) {
                return;
            }
            this._dragging = true;
            this._drag_x0 = e.clientX;
            this._drag_scroll0 = this._scroll;
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
            this._scroll = this._drag_scroll0 - (e.clientX - this._drag_x0) / this._slot_w;
        };
        this._onUp = () => {
            if (!this._dragging) {
                return;
            }
            this._dragging = false;
            this._scroll_target = Math.round(this._scroll);   // снап к ближайшему (зацикленно)
            this._canvas.style.cursor = 'grab';
        };

        this._onEnter = () => { this._hovering = true; };   // пауза автоскролла
        this._onLeave = () => { this._hovering = false; };

        this._canvas.addEventListener('pointerdown', this._onDown);
        this._canvas.addEventListener('pointerenter', this._onEnter);
        this._canvas.addEventListener('pointerleave', this._onLeave);
        window.addEventListener('pointermove', this._onMove);
        window.addEventListener('pointerup', this._onUp);
        this._canvas.style.cursor = 'grab';
        this._canvas.style.touchAction = 'pan-y';
    }

    _unbindDrag() {
        if (!this._drag_bound) {
            return;
        }
        this._canvas.removeEventListener('pointerdown', this._onDown);
        this._canvas.removeEventListener('pointerenter', this._onEnter);
        this._canvas.removeEventListener('pointerleave', this._onLeave);
        window.removeEventListener('pointermove', this._onMove);
        window.removeEventListener('pointerup', this._onUp);
        this._drag_bound = false;
    }
}
