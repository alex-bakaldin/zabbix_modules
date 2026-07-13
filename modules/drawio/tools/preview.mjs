#!/usr/bin/env node
/**
 * drawio widget — local preview helper.
 *
 * Renders a diagram + user script + data exactly the way the widget does, so you
 * can iterate in VS Code / your terminal instead of clicking "Execute now" on a
 * live Zabbix instance. It does NOT reimplement anything: it bundles the real
 * runtime (assets/js/class.widget.js) into a tiny self-contained HTML page and
 * opens it in your browser. The script therefore runs in the same sandboxed
 * iframe + Worker, and getBBox/getCTM-based features (edges, repeat layout,
 * clones, animation, flow) behave 1:1 with production.
 *
 * Usage:
 *   node tools/preview.mjs <diagram.svg> <script.js> [data.json] [options]
 *
 * Arguments:
 *   diagram.svg   Exported SVG (the same file you paste into the widget form).
 *   script.js     The user script (the same text that goes into the Script field).
 *   data.json     Optional. The `hosts` array the controller would send. If
 *                 omitted, an empty [] is used (fine for self-contained scripts
 *                 like docs/netmap.demo.js that synthesize their own values).
 *
 * Options:
 *   --watch          Serve the preview and LIVE-RELOAD the browser whenever the
 *                    diagram, script or data file changes — edit, save, watch.
 *                    Stays running until Ctrl-C.
 *   --port <n>       Port for --watch (default: 8770; auto-increments if busy).
 *   --refresh <ms>   Re-run the script every <ms> to animate time-based scripts
 *                    (default: 1000; 0 = render once, no loop).
 *   --out <file>     One-shot mode only: where to write the HTML (default: temp).
 *   --no-open        Don't launch a browser.
 *   -h, --help       Show this help.
 *
 * Data file format (`hosts`) — what actions/WidgetView.php sends to the script:
 *   [
 *     {
 *       "host": "Demo sensors", "hostid": "10805",
 *       "tags":   [{"tag": "env", "value": "prod"}],
 *       "macros": {"{$TEMP.CRIT}": "85"},
 *       "items": [
 *         {"key": "demo.reactor", "name": "Reactor temp",
 *          "value": 92.5, "units": "°C", "value_type": 0, "tags": []}
 *       ],
 *       "triggers": [
 *         {"triggerid": "1", "description": "Reactor too hot",
 *          "priority": 4, "status": 0, "value": 1, "tags": []}
 *       ]
 *     }
 *   ]
 */

import {readFileSync, writeFileSync, watchFile} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = resolve(__dirname, '..');
const RUNTIME_PATH = join(MODULE_ROOT, 'assets/js/class.widget.js');
const CSS_PATH = join(MODULE_ROOT, 'assets/css/widget.css');

function die(msg) {
	process.stderr.write(msg + '\n');
	process.exit(1);
}

function usage() {
	// Print the top-of-file doc comment as help.
	const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
	const m = src.match(/\/\*\*([\s\S]*?)\*\//);
	process.stdout.write((m ? m[1].replace(/^\s*\* ?/gm, '') : '').trim() + '\n');
	process.exit(0);
}

// --- args -----------------------------------------------------------------

const positional = [];
const opts = {refresh: 1000, open: true, out: null, watch: false, port: 8770};

for (let i = 2; i < process.argv.length; i++) {
	const a = process.argv[i];

	if (a === '-h' || a === '--help') usage();
	else if (a === '--no-open') opts.open = false;
	else if (a === '--watch') opts.watch = true;
	else if (a === '--port') opts.port = parseInt(process.argv[++i], 10) || opts.port;
	else if (a === '--out') opts.out = process.argv[++i];
	else if (a === '--refresh') opts.refresh = parseInt(process.argv[++i], 10) || 0;
	else if (a.startsWith('-')) die(`Unknown option: ${a}\nRun with --help for usage.`);
	else positional.push(a);
}

if (positional.length < 2) {
	die('Usage: node tools/preview.mjs <diagram.svg> <script.js> [data.json] [options]\n' +
		'Run with --help for details.');
}

const [svg_path, script_path, data_path] = positional;

// --- read + validate the inputs (throws so --watch can survive a bad save) ---

function loadInputs() {
	const diagram = readFileSync(svg_path, 'utf8');

	if (!/<svg[\s>]/i.test(diagram)) {
		throw new Error(`"${svg_path}" does not look like an SVG (no <svg> tag). Export the diagram as SVG.`);
	}

	const script = readFileSync(script_path, 'utf8');
	let hosts = [];

	if (data_path) {
		let parsed;

		try {
			parsed = JSON.parse(readFileSync(data_path, 'utf8'));
		}
		catch (e) {
			throw new Error(`Data file "${data_path}" is not valid JSON: ${e.message}`);
		}

		// Accept either a bare hosts array or {hosts:[...]}.
		hosts = (!Array.isArray(parsed) && parsed && Array.isArray(parsed.hosts)) ? parsed.hosts : parsed;

		if (!Array.isArray(hosts)) {
			throw new Error('Data file must be a JSON array of hosts (or {"hosts": [...]}).');
		}
	}

	const runtime = patchRuntimeForLogs(readFileSync(RUNTIME_PATH, 'utf8'));
	let css = '';

	try {
		css = readFileSync(CSS_PATH, 'utf8');
	}
	catch (e) { /* animations just won't play; not fatal */ }

	return {diagram, script, hosts, runtime, css};
}

/**
 * The user script runs in a Worker inside a sandboxed opaque-origin iframe, so
 * its console.log never reaches the terminal and is not reliably shown in the
 * page's devtools console. For local debugging that is exactly what we want to
 * see, so — in this inlined COPY of the runtime only (the module file on disk is
 * untouched) — we capture console.* inside the Worker and relay it to the parent
 * alongside the ops. The preview page then prints it to the real console and an
 * on-page panel. If the runtime source ever changes shape and a hook no longer
 * matches, we warn and carry on (logging just won't be relayed).
 */
function patchRuntimeForLogs(src) {
	const patches = [
		// Worker onmessage: wrap runJob so console.* is captured per job. NOTE: the
		// worker source lives inside a SINGLE-quoted JS string in class.widget.js, so
		// the injected code must contain neither ' nor " — hence bare identifier keys
		// and x.substring / String.fromCharCode(32) instead of string literals.
		[
			'self.onmessage=function(e){var r=runJob(e.data);self.postMessage({id:e.data.id,ops:r.ops,error:r.error});};',
			'var __ol=self.console;self.onmessage=function(e){var __L=[];'
				+ 'var __p=function(){try{__L.push([].slice.call(arguments).map(function(x){'
				+ 'return (x&&x.substring)?x:JSON.stringify(x);}).join(String.fromCharCode(32)));}catch(_){}};'
				+ 'self.console={log:__p,warn:__p,error:__p,info:__p,debug:__p};'
				+ 'var r=runJob(e.data);self.console=__ol;'
				+ 'self.postMessage({id:e.data.id,ops:r.ops,error:r.error,logs:__L});};'
		],
		// iframe → parent relay of a worker result: forward the captured logs too.
		[
			'parent.postMessage({id:d.id,ops:d.ops||[],error:d.error},"*")',
			'parent.postMessage({id:d.id,ops:d.ops||[],error:d.error,logs:d.logs},"*")'
		]
	];

	for (const [from, to] of patches) {
		if (src.indexOf(from) === -1) {
			process.stderr.write('preview: note — console relay hook not found; ' +
				'script console.log will not be surfaced (runtime changed?).\n');
			continue;
		}
		src = src.replace(from, to);
	}

	return src;
}

// --- build the page -------------------------------------------------------

// Encode a value as a JS literal that is safe to inline inside <script>:
// escaping every "<" as < prevents a "</script>" inside the SVG or the
// user script from closing the tag early. JSON.parse restores it verbatim.
function jsLiteral(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

function esc(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The live-reload poller injected only in --watch mode: reload when the server's
// version tag changes (i.e. a watched file was saved and the page rebuilt).
function reloadSnippet(version) {
	return `<script>
(function () {
	let v = ${jsLiteral(version)};
	setInterval(function () {
		fetch('version').then(function (r) { return r.text(); }).then(function (t) {
			if (t !== v) location.reload();
		}).catch(function () {});
	}, 400);
})();
</script>`;
}

function buildHtml({diagram, script, hosts, runtime, css, live = false, version = ''}) {
	return `<!doctype html>
<meta charset="utf-8">
<title>drawio preview — ${esc(svg_path)}</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; height: 100%; }
  body { display: flex; flex-direction: column; font: 13px system-ui, sans-serif; }
  #bar { display: flex; gap: 12px; align-items: center; padding: 6px 12px;
         background: #2b2b2b; color: #ddd; flex: 0 0 auto; }
  #bar b { color: #fff; }
  #bar button { font: inherit; cursor: pointer; }
  #stage { flex: 1 1 auto; overflow: auto; padding: 16px; }
  #stage.light { background: #ffffff; }
  #stage.dark  { background: #1e1e1e; }
  /* draw.io colours are light-dark(dark, light) and the exported <svg> pins its
     own "color-scheme: light dark" inline, so it otherwise follows the OS theme
     and ignores the toggle. Force the scheme on the svg (!important beats the
     inline style) so switching here actually re-resolves every light-dark(). */
  #stage.light svg { color-scheme: light !important; }
  #stage.dark  svg { color-scheme: dark  !important; }
  .drawio-surface svg { max-width: 100%; height: auto; }
  #err { flex: 0 0 auto; max-height: 30%; overflow: auto; margin: 0; padding: 0;
         background: #3a1414; color: #ffb4b4; font-family: monospace; font-size: 12px;
         white-space: pre-wrap; }
  #err:empty { display: none; }
  #err div { padding: 4px 12px; border-top: 1px solid #5a2020; }
  #log { flex: 0 0 auto; max-height: 30%; overflow: auto; margin: 0; padding: 0;
         background: #14212b; color: #a9d5ff; font-family: monospace; font-size: 12px;
         white-space: pre-wrap; }
  #log:empty { display: none; }
  #log div { padding: 3px 12px; border-top: 1px solid #22384a; }
${css}
</style>

<div id="bar">
  <b>drawio preview</b>
  <span>${esc(svg_path)} · ${esc(script_path)}${data_path ? ' · ' + esc(data_path) : ' · (no data)'}</span>
  <span id="tick"></span>
  ${live ? '<span style="color:#7fd67f">● watching</span>' : ''}
  <span style="margin-left:auto"></span>
  <button id="theme">Toggle theme (light/dark)</button>
  <button id="rerun">Re-run</button>
</div>
<div id="stage" class="light"><div id="body"></div></div>
<pre id="log"></pre>
<pre id="err"></pre>

<script>
// Minimal CWidget stand-in — MUST be defined before the runtime, because
// "class WidgetDrawio extends CWidget" is evaluated as the runtime loads. The
// runtime only needs a _body element plus no-op onInitialize/onDestroy hooks.
window.CWidget = class CWidget {
	constructor(body) { this._body = body; }
	onInitialize() {}
	onDestroy() {}
};

// Surface script/runtime errors on the page too (not just devtools).
const errBox = document.getElementById('err');
const origError = console.error.bind(console);
console.error = function(...a) {
	origError(...a);
	const d = document.createElement('div');
	d.textContent = a.join(' ');
	errBox.appendChild(d);
	// Keep only the last handful so a looping error doesn't grow forever.
	while (errBox.children.length > 12) errBox.removeChild(errBox.firstChild);
};
</script>
<script>${runtime}</script>
<script>
"use strict";
const DIAGRAM = ${jsLiteral(diagram)};
const SCRIPT  = ${jsLiteral(script)};
const HOSTS   = ${jsLiteral(hosts)};
const REFRESH = ${opts.refresh};

// errBox / console.error hook are already set up in the first script above.
const widget = new WidgetDrawio(document.getElementById('body'));
widget.onInitialize();

// console.log/warn/... from the user script run in the sandbox Worker; the
// runtime copy relays them here via postMessage. Show them in the console and
// the blue on-page panel so debugging works without touching devtools.
const logBox = document.getElementById('log');
window.addEventListener('message', (e) => {
	const logs = (e.data && e.data.logs) || null;

	if (!Array.isArray(logs)) return;

	for (const line of logs) {
		console.log('[script]', line);
		const d = document.createElement('div');
		d.textContent = line.length > 4000 ? line.slice(0, 4000) + ' …(truncated)' : line;
		logBox.appendChild(d);
	}
	while (logBox.children.length > 40) logBox.removeChild(logBox.firstChild);
});

let n = 0;
const tick = document.getElementById('tick');
function run() {
	errBox.textContent = '';
	logBox.textContent = '';
	widget.setContents({diagram: DIAGRAM, script: SCRIPT, hosts: HOSTS});
	tick.textContent = REFRESH ? '↻ ' + (++n) : '';
}
run();
if (REFRESH > 0) setInterval(run, REFRESH);

document.getElementById('rerun').onclick = run;
const stage = document.getElementById('stage');
document.getElementById('theme').onclick = () => {
	stage.classList.toggle('light');
	stage.classList.toggle('dark');
};
</script>
${live ? reloadSnippet(version) : ''}
`;
}

function errorHtml(message, version) {
	return `<!doctype html>
<meta charset="utf-8">
<title>drawio preview — error</title>
<body style="margin:0;font:14px system-ui,sans-serif;background:#3a1414;color:#ffd0d0">
<div style="padding:16px 20px;background:#2b2b2b;color:#ddd">drawio preview — <b>build failed</b>, fix and save to retry</div>
<pre style="padding:20px;white-space:pre-wrap">${esc(message)}</pre>
${reloadSnippet(version)}
`;
}

function summary({diagram, script, hosts}) {
	const cells = (diagram.match(/data-cell-id="/g) || []).length;

	return `diagram: ${(diagram.length / 1024).toFixed(1)} KB, ${cells} cells` +
		`   script: ${(script.length / 1024).toFixed(1)} KB   hosts: ${hosts.length}`;
}

function openBrowser(target) {
	const cmd = process.platform === 'darwin' ? 'open'
		: process.platform === 'win32' ? 'cmd' : 'xdg-open';
	const args = process.platform === 'win32' ? ['/c', 'start', '', target] : [target];

	try {
		spawn(cmd, args, {detached: true, stdio: 'ignore'}).unref();
	}
	catch (e) {
		process.stdout.write('(could not auto-open; open it manually)\n');
	}
}

// --- one-shot mode --------------------------------------------------------

if (!opts.watch) {
	let inputs;

	try {
		inputs = loadInputs();
	}
	catch (e) {
		die(e.message);
	}

	const out = opts.out
		? resolve(opts.out)
		: join(tmpdir(), 'drawio-preview-' + process.pid + '.html');

	try {
		writeFileSync(out, buildHtml(inputs));
	}
	catch (e) {
		die(`Cannot write preview to "${out}": ${e.message}`);
	}

	process.stdout.write(`Preview written: ${out}\n  ${summary(inputs)}\n`);

	if (opts.open) {
		openBrowser(out);
	}
}

// --- watch mode (serve + live-reload) -------------------------------------

else {
	let version = 1;
	let page = '';

	function rebuild(first) {
		version++;

		try {
			const inputs = loadInputs();

			page = buildHtml({...inputs, live: true, version: String(version)});
			process.stdout.write(`${first ? '' : '↻ '}rebuilt (v${version})  ${summary(inputs)}\n`);
		}
		catch (e) {
			page = errorHtml(e.message, String(version));
			process.stderr.write(`preview: build failed — ${e.message}\n`);
		}
	}

	rebuild(true);

	// fs.watchFile polls mtime, so it survives editors' atomic saves (write+rename)
	// that break fs.watch on the file itself. Coalesce bursts with a short debounce.
	let pending = null;
	const onChange = () => {
		clearTimeout(pending);
		pending = setTimeout(() => rebuild(false), 80);
	};

	const watched = [svg_path, script_path, RUNTIME_PATH, CSS_PATH];

	if (data_path) {
		watched.push(data_path);
	}

	for (const p of watched) {
		watchFile(p, {interval: 250}, onChange);
	}

	const server = createServer((req, res) => {
		const url = (req.url || '/').split('?')[0];

		if (url === '/version') {
			res.writeHead(200, {'content-type': 'text/plain', 'cache-control': 'no-store'});
			res.end(String(version));
		}
		else {
			res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
			res.end(page);
		}
	});

	function listen(port, attempt) {
		server.once('error', (e) => {
			if (e.code === 'EADDRINUSE' && attempt < 20) {
				listen(port + 1, attempt + 1);
			}
			else {
				die(`Cannot start server: ${e.message}`);
			}
		});
		server.listen(port, '127.0.0.1', () => {
			const url = `http://127.0.0.1:${server.address().port}/`;

			process.stdout.write(`Watching ${watched.length} files — edit & save to live-reload.\n` +
				`Preview: ${url}   (Ctrl-C to stop)\n`);

			if (opts.open) {
				openBrowser(url);
			}
		});
	}

	listen(opts.port, 0);
}
