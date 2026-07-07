/**
 * WidgetExampleManometer — стимпанк-манометр на CWidgetGaugeBase.
 * Реализует только _drawGauge(): круглый циферблат, бронзовый безель, стрелка.
 */
class WidgetExampleManometer extends CWidgetGaugeBase {

    _drawGauge(ctx, {width, height, frac, value, units, min, max}) {
        const cx = width / 2;
        const cy = height / 2;
        const R = Math.min(width, height) / 2 - 4;

        if (R < 20) {
            return;
        }

        const A0 = Math.PI * 0.75;          // начало дуги (низ-слева)
        const SWEEP = Math.PI * 1.5;        // 270°
        const angle = A0 + frac * SWEEP;

        // Тень корпуса
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy + R * 0.06, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.filter = 'blur(6px)';
        ctx.fill();
        ctx.restore();

        // Бронзовый безель
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
            const sx = cx + Math.cos(a) * R * 0.93;
            const sy = cy + Math.sin(a) * R * 0.93;
            const sg = ctx.createRadialGradient(sx - screwR * 0.4, sy - screwR * 0.4, 0, sx, sy, screwR);
            sg.addColorStop(0, '#efe0a8');
            sg.addColorStop(1, '#6b4f22');
            ctx.beginPath();
            ctx.arc(sx, sy, screwR, 0, Math.PI * 2);
            ctx.fillStyle = sg;
            ctx.fill();
            ctx.strokeStyle = 'rgba(40,28,10,0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - screwR * 0.6, sy);
            ctx.lineTo(sx + screwR * 0.6, sy);
            ctx.stroke();
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

        // Тики и цифры
        const ink = '#3a2c14';
        const majors = 10;
        const tickOuter = faceR * 0.94;
        for (let i = 0; i <= majors * 2; i++) {
            const t = i / (majors * 2);
            const a = A0 + t * SWEEP;
            const isMajor = (i % 2 === 0);
            const inner = tickOuter - faceR * (isMajor ? 0.14 : 0.08);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * tickOuter, cy + Math.sin(a) * tickOuter);
            ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
            ctx.strokeStyle = ink;
            ctx.lineWidth = isMajor ? Math.max(1.5, faceR * 0.02) : 1;
            ctx.stroke();

            if (isMajor) {
                const num = min + (i / (majors * 2)) * (max - min);
                const lr = faceR * 0.72;
                ctx.fillStyle = ink;
                ctx.font = `${Math.round(faceR * 0.12)}px Georgia, "Times New Roman", serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this._fmt(num), cx + Math.cos(a) * lr, cy + Math.sin(a) * lr);
            }
        }

        // Единицы + штамп
        if (units) {
            ctx.fillStyle = '#5a4622';
            ctx.font = `${Math.round(faceR * 0.14)}px Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(units, cx, cy + faceR * 0.42);
        }
        ctx.fillStyle = 'rgba(90,70,34,0.7)';
        ctx.font = `${Math.round(faceR * 0.075)}px Georgia, serif`;
        ctx.fillText('PRESSURE', cx, cy - faceR * 0.44);

        // Красная опасная зона
        ctx.beginPath();
        ctx.arc(cx, cy, faceR * 0.88, A0 + SWEEP * 0.8, A0 + SWEEP, false);
        ctx.strokeStyle = 'rgba(170,30,20,0.85)';
        ctx.lineWidth = Math.max(2, faceR * 0.04);
        ctx.stroke();

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
        ctx.strokeStyle = 'rgba(40,28,10,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();

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
}
