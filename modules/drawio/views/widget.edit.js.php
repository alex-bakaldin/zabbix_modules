<?php
/**
 * Diagram (draw.io / SVG) widget — edit-form behaviour.
 *
 * Two enhancements over the plain textareas:
 *   1. The `diagram` field becomes a file picker (choose an exported .svg) with a
 *      thumbnail preview and a "N cells" status, instead of a wall of SVG text.
 *      The raw source stays available under a collapsible <details> as a fallback,
 *      and the hidden textarea keeps carrying the value (chunked storage + dirty
 *      tracking are untouched).
 *   2. The `script` field becomes a CodeMirror editor: JS syntax highlighting, a
 *      lightweight linter (new Function → gutter marker), and autocompletion of
 *      cell ids / labels (parsed live from the loaded SVG) plus the cells/api
 *      surface. CodeMirror is vendored in assets and loaded lazily — only when a
 *      drawio widget is actually being edited, so other pages stay lean.
 *
 * @var CView $this
 * @var array $data
 */

$t = [
	'choose'     => _('Choose SVG file…'),
	'replace'    => _('Replace SVG…'),
	'empty'      => _('No diagram — choose an exported .svg file'),
	'loaded'     => _('Diagram loaded'),
	'cells'      => _('cells'),
	'source'     => _('Show / paste SVG source'),
	'not_svg'    => _('Not an SVG file (export the diagram from draw.io as SVG).'),
	'lint_prefix'=> _('Syntax error:')
];
?>
window.widget_form = new class extends CWidgetForm {

	init() {
		this._diagram = document.getElementById('diagram');
		this._script = document.getElementById('script');
		this._cells = [];
		this._cm = null;

		if (this._diagram !== null) {
			this._initDiagramField();
		}
		if (this._script !== null) {
			this._initScriptEditor();
		}

		this.ready();
	}

	// ---- asset loading (lazy, from this module's own asset dir) -------------

	_assetBase() {
		// Derive from the already-loaded widget script so it works on any sub-path.
		const s = [...document.scripts]
			.map((el) => el.src)
			.find((src) => src.includes('/drawio/assets/js/class.widget.js'));

		return s ? s.replace(/js\/class\.widget\.js.*$/, '') : 'modules/drawio/assets/';
	}

	_loadCss(href) {
		if (document.querySelector('link[data-drawio-asset="' + href + '"]')) {
			return;
		}
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		link.dataset.drawioAsset = href;
		document.head.appendChild(link);
	}

	_loadScript(src) {
		return new Promise((resolve, reject) => {
			const existing = document.querySelector('script[data-drawio-asset="' + src + '"]');
			if (existing) {
				existing.dataset.loaded ? resolve() : existing.addEventListener('load', () => resolve());
				return;
			}
			const el = document.createElement('script');
			el.src = src;
			el.dataset.drawioAsset = src;
			el.addEventListener('load', () => { el.dataset.loaded = '1'; resolve(); });
			el.addEventListener('error', () => reject(new Error('failed to load ' + src)));
			document.head.appendChild(el);
		});
	}

	// ---- shared helpers ----------------------------------------------------

	_isDark() {
		let el = this._script;
		while (el && el !== document.documentElement) {
			const bg = getComputedStyle(el).backgroundColor;
			const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
			if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
				const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
				return lum < 0.5;
			}
			el = el.parentElement;
		}
		return false;
	}

	_parseCells(svg) {
		const out = [];
		if (!svg || svg.indexOf('<svg') === -1) {
			return out;
		}
		try {
			const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
			const seen = new Set();
			doc.querySelectorAll('[data-cell-id]').forEach((node) => {
				const id = node.getAttribute('data-cell-id');
				if (!id || seen.has(id)) {
					return;
				}
				seen.add(id);
				// Mirror the runtime's _cellLabel() exactly, so byLabel(<completion>)
				// resolves: prefer the HTML (foreignObject) label, else the <text>
				// fallback, whitespace-collapsed. Labels can be long, but they stay
				// searchable by substring in the hint filter.
				const el = node.querySelector('foreignObject') || node.querySelector('text');
				const label = el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
				out.push({id: id, label: label});
			});
		}
		catch (e) { /* malformed SVG — leave completions empty */ }

		return out;
	}

	// ---- 1. diagram file picker -------------------------------------------

	_initDiagramField() {
		const ta = this._diagram;
		ta.style.display = 'none';

		const wrap = document.createElement('div');
		wrap.className = 'drawio-diagram-field';

		const row = document.createElement('div');
		row.className = 'drawio-picker-row';

		const btn = document.createElement('label');
		btn.className = 'btn-alt';
		this._pickBtn = btn;

		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.svg,image/svg+xml';
		input.className = 'drawio-file-input';
		btn.appendChild(input);
		btn.appendChild(document.createTextNode(''));

		const status = document.createElement('span');
		status.className = 'drawio-status';
		this._status = status;

		row.appendChild(btn);
		row.appendChild(status);

		const preview = document.createElement('div');
		preview.className = 'drawio-preview';
		const img = document.createElement('img');
		preview.appendChild(img);
		this._previewImg = img;
		this._preview = preview;

		const details = document.createElement('details');
		details.className = 'drawio-source-toggle';
		const summary = document.createElement('summary');
		summary.textContent = <?= json_encode($t['source']) ?>;
		details.appendChild(summary);

		wrap.appendChild(row);
		wrap.appendChild(preview);
		wrap.appendChild(details);
		ta.parentNode.insertBefore(wrap, ta);
		details.appendChild(ta);
		ta.style.display = '';

		input.addEventListener('change', (e) => {
			const file = e.target.files[0];
			if (!file) {
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				const text = String(reader.result);
				if (text.indexOf('<svg') === -1) {
					this._setStatus(<?= json_encode($t['not_svg']) ?>, true);
					input.value = '';
					return;
				}
				ta.value = text;
				// 'input' drives both dirty-tracking (CWidgetFieldTextArea) and _refreshDiagram below.
				ta.dispatchEvent(new Event('input', {bubbles: true}));
			};
			reader.readAsText(file);
		});

		// Manual edits in the source textarea keep the preview / completions in sync.
		ta.addEventListener('input', () => this._refreshDiagram());

		this._refreshDiagram();
		if (this._isDark()) {
			preview.classList.add('cm-dark');
		}
	}

	_setStatus(text, is_error) {
		this._status.textContent = text;
		this._status.classList.toggle('drawio-empty', !!is_error);
	}

	_refreshDiagram() {
		const svg = this._diagram.value || '';
		this._cells = this._parseCells(svg);

		if (!svg.trim()) {
			this._pickBtn.lastChild.textContent = <?= json_encode($t['choose']) ?>;
			this._setStatus(<?= json_encode($t['empty']) ?>, true);
			this._preview.classList.remove('drawio-has-image');
			this._previewImg.removeAttribute('src');
			return;
		}

		this._pickBtn.lastChild.textContent = <?= json_encode($t['replace']) ?>;

		const kb = Math.max(1, Math.round(new Blob([svg]).size / 1024));
		this._setStatus(
			<?= json_encode($t['loaded']) ?> + ' — ' + kb + ' KB, ' + this._cells.length + ' ' + <?= json_encode($t['cells']) ?>,
			false
		);

		if (svg.indexOf('<svg') !== -1) {
			this._previewImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
			this._preview.classList.add('drawio-has-image');
		}
		else {
			this._preview.classList.remove('drawio-has-image');
		}
	}

	// ---- 2. script editor (CodeMirror, lazy) -------------------------------

	_initScriptEditor() {
		const base = this._assetBase();

		this._loadCss(base + 'css/vendor/codemirror.css');
		this._loadCss(base + 'css/vendor/show-hint.css');
		this._loadCss(base + 'css/vendor/lint.css');
		this._loadCss(base + 'css/form.css');

		this._loadScript(base + 'js/vendor/codemirror.js')
			.then(() => Promise.all([
				this._loadScript(base + 'js/vendor/mode-javascript.js'),
				this._loadScript(base + 'js/vendor/addon-show-hint.js'),
				this._loadScript(base + 'js/vendor/addon-lint.js'),
				this._loadScript(base + 'js/vendor/addon-matchbrackets.js'),
				this._loadScript(base + 'js/vendor/addon-closebrackets.js'),
				this._loadScript(base + 'js/vendor/addon-active-line.js')
			]))
			.then(() => this._mountCodeMirror())
			.catch(() => this._mountFallbackLint());
	}

	_mountCodeMirror() {
		const CM = window.CodeMirror;
		const ta = this._script;

		const box = document.createElement('div');
		box.className = 'drawio-editor';
		if (this._isDark()) {
			box.classList.add('cm-dark');
		}
		ta.parentNode.insertBefore(box, ta);

		const cm = CM.fromTextArea(ta, {
			mode: 'javascript',
			lineNumbers: true,
			matchBrackets: true,
			autoCloseBrackets: true,
			styleActiveLine: true,
			tabSize: 2,
			gutters: ['CodeMirror-lint-markers'],
			lint: {getAnnotations: (text) => this._lint(text)},
			extraKeys: {
				'Ctrl-Space': (editor) => editor.showHint({hint: (e) => this._hint(e), completeSingle: false})
			}
		});
		box.appendChild(cm.getWrapperElement());
		this._cm = cm;

		// Keep the underlying textarea (value + dirty tracking) in sync.
		cm.on('change', () => {
			cm.save();
			ta.dispatchEvent(new Event('input', {bubbles: true}));
		});

		// Auto-open id completion inside cells.get('…') / cells.byLabel('…').
		cm.on('inputRead', (editor) => {
			const upto = editor.getLine(editor.getCursor().line).slice(0, editor.getCursor().ch);
			if (/(get|byLabel)\s*\(\s*(['"`])[^'"`]*$/.test(upto)) {
				editor.showHint({hint: (e) => this._hint(e), completeSingle: false});
			}
		});

		setTimeout(() => cm.refresh(), 0);
	}

	_lint(text) {
		const found = [];
		if (!text.trim()) {
			return found;
		}
		try {
			new Function(text);
		}
		catch (e) {
			// A SyntaxError from `new Function` reports the call site in its stack,
			// not the offending position inside the body, so a reliable line/column
			// isn't recoverable cross-browser. Flag the whole first line — the
			// message ("Unexpected token …") is what actually guides the fix.
			const CM = window.CodeMirror;
			const first_len = (text.split('\n')[0] || ' ').length || 1;
			found.push({
				message: <?= json_encode($t['lint_prefix']) ?> + ' ' + e.message,
				severity: 'error',
				from: CM.Pos(0, 0),
				to: CM.Pos(0, first_len)
			});
		}
		return found;
	}

	_staticList() {
		return [
			{key: 'hosts', text: 'hosts', display: 'hosts'},
			{key: 'cells.get', text: "cells.get('", display: "cells.get('id')"},
			{key: 'cells.byLabel', text: "cells.byLabel('", display: "cells.byLabel('label')"},
			{key: 'cells.all', text: 'cells.all', display: 'cells.all'},
			{key: 'api.scale', text: 'api.scale(', display: 'api.scale(v, inMin, inMax, outMin, outMax)'},
			{key: 'api.color', text: 'api.color(', display: 'api.color(v, [[thr, color]], base)'},
			{key: 'api.grid', text: 'api.grid(', display: 'api.grid(i, {cols, gap, w, h})'},
			{key: 'set', text: 'set({', display: 'set({fill, stroke, strokeWidth, opacity, text, animate, flow})'},
			{key: 'fill', text: 'fill', display: 'fill'},
			{key: 'stroke', text: 'stroke', display: 'stroke'},
			{key: 'strokeWidth', text: 'strokeWidth', display: 'strokeWidth'},
			{key: 'opacity', text: 'opacity', display: 'opacity'},
			{key: 'text', text: 'text', display: 'text (\\n = multiline)'},
			{key: 'animate', text: 'animate', display: "animate ('pulse' | 'blink' | 'none')"},
			{key: 'flow', text: 'flow', display: 'flow (signed number)'},
			{key: 'clone', text: 'clone({', display: 'clone({dx, dy, patch, edges})'},
			{key: 'repeat', text: 'repeat(', display: 'repeat(list, {cols, gap}, fn)'},
			{key: 'remove', text: 'remove(', display: 'remove({edges})'},
			{key: 'neighbors', text: 'neighbors', display: 'neighbors'},
			{key: 'console.log', text: 'console.log(', display: 'console.log()'}
		];
	}

	_hint(cm) {
		const CM = window.CodeMirror;
		const cur = cm.getCursor();
		const upto = cm.getLine(cur.line).slice(0, cur.ch);

		// Inside cells.get('…') / cells.byLabel('…') → complete ids / labels.
		const m = upto.match(/(get|byLabel)\s*\(\s*(['"`])([^'"`]*)$/);
		if (m) {
			const partial = m[3].toLowerCase();
			const use_label = m[1] === 'byLabel';
			const pool = [...new Set(
				this._cells.map((c) => use_label ? c.label : c.id).filter(Boolean)
			)];
			const list = pool
				.filter((v) => v.toLowerCase().indexOf(partial) !== -1)
				.sort()
				.slice(0, 300)
				.map((v) => ({text: v, displayText: v}));

			return {
				list: list,
				from: CM.Pos(cur.line, cur.ch - m[3].length),
				to: cur
			};
		}

		// Otherwise → identifier / snippet completion.
		const word = (upto.match(/[\w$.]*$/) || [''])[0];
		const wl = word.toLowerCase();
		const list = this._staticList()
			.filter((o) => wl === '' || o.key.toLowerCase().indexOf(wl) !== -1)
			.map((o) => ({text: o.text, displayText: o.display}));

		return {
			list: list,
			from: CM.Pos(cur.line, cur.ch - word.length),
			to: cur
		};
	}

	// Graceful degradation: no CodeMirror → plain textarea + on-blur syntax check.
	_mountFallbackLint() {
		const ta = this._script;
		const msg = document.createElement('div');
		msg.className = 'drawio-lint-msg';
		ta.parentNode.insertBefore(msg, ta.nextSibling);

		const check = () => {
			msg.textContent = '';
			const text = ta.value.trim();
			if (!text) {
				return;
			}
			try {
				new Function(text);
			}
			catch (e) {
				msg.textContent = <?= json_encode($t['lint_prefix']) ?> + ' ' + e.message;
			}
		};
		ta.addEventListener('blur', check);
		check();
	}
}
