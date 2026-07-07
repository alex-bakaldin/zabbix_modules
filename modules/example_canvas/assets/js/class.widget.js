/**
 * WidgetExampleCanvas — конкретный виджет поверх CWidgetCanvasBase.
 *
 * Демонстрирует ровно то, что нужно: фон + слои картинок с альфой +
 * поворот/сдвиг изображения + рисование поверх средствами JS.
 *
 * Чтобы сделать ДРУГОЙ виджет — обычно достаточно переписать только draw().
 */
class WidgetExampleCanvas extends CWidgetCanvasBase {

    isAnimated() {
        return true;   // непрерывная перерисовка (крутим стрелку)
    }

    hasPadding() {
        return false;  // холст на всю площадь виджета
    }

    draw(ctx, {data, images, width, height, time}) {
        const cx = width / 2;
        const cy = height / 2;

        // Слой 1 — непрозрачный фон (растягиваем на весь холст).
        if (images.bg) {
            ctx.drawImage(images.bg, 0, 0, width, height);
        }
        else {
            ctx.fillStyle = '#0e1a24';
            ctx.fillRect(0, 0, width, height);
        }

        // Слой 2 — полупрозрачное кольцо (альфа PNG учитывается сама,
        // globalAlpha добавляет ещё прозрачности всему слою).
        if (images.ring) {
            const r = Math.min(width, height) * 0.42;
            ctx.globalAlpha = 0.9;
            ctx.drawImage(images.ring, cx - r, cy - r, r * 2, r * 2);
            ctx.globalAlpha = 1;
        }

        // Слой 3 — вращающаяся стрелка: translate в центр, поворот по времени,
        // рисуем картинку вокруг её собственного центра.
        if (images.arrow) {
            const r = Math.min(width, height) * 0.4;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(time * 0.9);            // радианы; ~0.9 рад/с
            ctx.drawImage(images.arrow, -r / 2, -r / 2, r, r);
            ctx.restore();
        }

        // Слой 4 — текст поверх, рисуем сами (не картинка).
        const label = (data && data.label) ? data.label : 'Canvas widget';
        const font_px = Math.max(10, Math.round(Math.min(width, height) * 0.08));
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 ${font_px}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText(label, cx, height - font_px * 0.6);
        ctx.shadowBlur = 0;
    }
}
