/**
 * WidgetExamplePattern — debug widget.
 *
 * Dumps the resolved items (host — name [key] = last value) as plain text,
 * so we can verify pattern + tag resolution and history reading before
 * building any real presentation.
 */
class WidgetExamplePattern extends CWidget {

    setContents(response) {
        const rows = response.rows || [];
        const lines = [];

        lines.push('context: ' + (response.is_template ? 'template' : 'global')
            + (response.override_hostid ? ', override_hostid=' + response.override_hostid : ''));
        lines.push('items found: ' + rows.length + ' (limit ' + response.limit + ')');
        lines.push('');

        for (const r of rows) {
            const value = r.value === null
                ? '(no data)'
                : r.value + (r.units ? ' ' + r.units : '');

            lines.push(`${r.host} — ${r.name} [${r.key}] = ${value}`);
        }

        this._body.innerHTML = '';

        const pre = document.createElement('pre');
        pre.classList.add('pattern-debug-dump');
        pre.textContent = lines.join('\n');

        this._body.appendChild(pre);
    }
}
