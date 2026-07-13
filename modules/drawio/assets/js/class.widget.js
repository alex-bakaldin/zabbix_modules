/**
 * WidgetDrawio — draw.io / SVG diagram viewer driven by ONE user script.
 *
 * The diagram is a clean exported SVG. A single user script (widget config)
 * receives the resolved data and a CRUD API over the diagram cells and does all
 * the logic itself. It runs in a SANDBOXED iframe (sandbox="allow-scripts", no
 * allow-same-origin → opaque origin): no access to the parent's cookies, DOM or
 * credentialed network. Because the parent DOM is unreachable, the script does
 * not touch cells directly — it works on a serialized cell model and its CRUD
 * calls RECORD operations, which the widget then applies to the real SVG.
 *
 * Script contract — (hosts, cells, api):
 *   hosts — [{host, hostid, tags:[{tag,value}], macros:{'{$NAME}':value,…},
 *            items:[{key,name,value,units,value_type,tags:[{tag,value}]}],
 *            triggers:[{triggerid,description,priority,status,value,tags:[{tag,value}]}]}]
 *   cells — { get(id), byLabel(text), find(fn), all }
 *           handle → { id, label, bbox, neighbors:[id], set(patch),
 *                      clone({id,dx,dy,patch,edges}), repeat(list,{cols,gap,edges},fn),
 *                      remove({edges}) }
 *           patch  → { fill, stroke, strokeWidth, opacity, text,
 *                      textAngle:<deg>|'edge', animate:'pulse'|'blink'|'none',
 *                      flow:<signed speed> }
 *           edges  → true (all incident connectors) | [neighborId,…] (only those);
 *                    clone/remove also act on the lines linking the cell to its
 *                    neighbors — connectivity is recovered from SVG geometry.
 *   api   — { scale(v,inMin,inMax,outMin,outMax), color(v,[[t,c],...],base),
 *            grid(i,{cols,gap,w,h}), units(v,unit,decimals) }
 */
class WidgetDrawio extends CWidget {

	onInitialize() {
		super.onInitialize();

		this._diagram_src = null;
		this._svg = null;
		this._script = '';

		this._sandbox = null;
		this._sandbox_ready = null;
		this._pending = new Map();
		this._req_seq = 0;
		this._onMessage = this._onMessage.bind(this);
	}

	setContents(response) {
		const diagram = response.diagram || '';

		if (diagram !== this._diagram_src) {
			this._diagram_src = diagram;
			this._body.innerHTML = '';
			this._svg = null;

			if (diagram === '') {
				const hint = document.createElement('div');

				hint.className = 'drawio-empty';
				hint.textContent = 'No diagram';
				this._body.appendChild(hint);
			}
			else {
				const wrap = document.createElement('div');

				wrap.className = 'drawio-surface';
				wrap.innerHTML = diagram;
				this._body.appendChild(wrap);
				this._svg = wrap.querySelector('svg');
			}
		}

		this._script = response.script || '';
		this._apply(response.hosts || []);
	}

	onDestroy() {
		super.onDestroy();

		if (this._sandbox !== null) {
			window.removeEventListener('message', this._onMessage);
			this._sandbox.remove();
			this._sandbox = null;
		}
	}

	// --- run the user script, apply the operations it records -----------------

	_apply(hosts) {
		if (this._svg === null) {
			return;
		}

		this._syncColorScheme();

		// Drop clones from the previous run before re-evaluating.
		this._svg.querySelectorAll('[data-drawio-clone]').forEach((el) => el.remove());

		if (this._script === '') {
			return;
		}

		const conn = this._collectConnectors();
		const cells = this._buildCellModel(conn);

		this._evalScript(this._script, hosts, cells).then((ops) => {
			if (ops !== null) {
				this._applyOps(ops, conn);
			}
		});
	}

	// draw.io exports pin `color-scheme: light dark` inline on the <svg>, so their
	// light-dark(dark, light) colours (text, gradients) resolve against the OS
	// preference rather than the Zabbix theme. Zabbix records the active UI scheme
	// on the <html color-scheme> attribute (and the theme name on <html theme>);
	// mirror it onto the SVG so the diagram matches the rest of the interface.
	_syncColorScheme() {
		const html = document.documentElement;
		let scheme = html.getAttribute('color-scheme');

		if (scheme !== 'light' && scheme !== 'dark') {
			const theme = html.getAttribute('theme') || '';

			scheme = /dark/.test(theme) ? 'dark' : (theme !== '' ? 'light' : '');
		}

		if (scheme !== '') {
			this._svg.style.colorScheme = scheme;
		}
	}

	_buildCellModel(conn) {
		const model = [];

		for (const g of this._svg.querySelectorAll('[data-cell-id]')) {
			const id = g.getAttribute('data-cell-id');

			if (id === '' || id === '0' || id === '1' || g.hasAttribute('data-drawio-clone')) {
				continue;
			}

			let bbox;

			try {
				const b = g.getBBox();

				bbox = {x: b.x, y: b.y, width: b.width, height: b.height};
			}
			catch (e) {
				bbox = {x: 0, y: 0, width: 130, height: 70};
			}

			const neighbors = conn.neighbors[id] ? [...conn.neighbors[id]] : [];

			model.push({id, label: this._cellLabel(g), bbox, neighbors});
		}

		return model;
	}

	_cellLabel(g) {
		const fo = g.querySelector('foreignObject');
		const node = fo !== null ? fo : g.querySelector('text');

		return node !== null ? (node.textContent || '').replace(/\s+/g, ' ').trim() : '';
	}

	// --- geometric adjacency --------------------------------------------------
	//
	// The connectivity of a draw.io diagram (which line joins which boxes) is NOT
	// in the exported SVG — edges are just <path>s. We recover it geometrically:
	// a cell whose primary shape is a path/line/polyline is a candidate connector;
	// its two endpoints, mapped to root SVG coordinates, are matched against the
	// other cells' bounding boxes to find the nodes it links. No embedded model is
	// needed, so this works on hand-authored SVGs and draw.io exports alike.

	_collectConnectors() {
		const nodes = [];

		for (const g of this._svg.querySelectorAll('[data-cell-id]')) {
			const id = g.getAttribute('data-cell-id');

			if (id === '' || id === '0' || id === '1' || g.hasAttribute('data-drawio-clone')) {
				continue;
			}

			const bbox = this._rootBBox(g);

			if (bbox !== null) {
				nodes.push({id, el: g, bbox, area: g.querySelector('rect, ellipse, circle, polygon') !== null});
			}
		}

		const connectors = [];
		const neighbors = {};

		for (const n of nodes) {
			const geom = n.el.querySelector('path, line, polyline');
			const ends = geom !== null ? this._endpoints(geom) : null;

			if (ends === null) {
				continue;
			}

			const na = this._nodeAt(ends[0], nodes, n.el);
			const nb = this._nodeAt(ends[1], nodes, n.el);

			if (na === null && nb === null) {
				continue;
			}

			connectors.push({id: n.id, el: n.el, a: ends[0], b: ends[1], na, nb});

			if (na !== null && nb !== null && na !== nb) {
				(neighbors[na] = neighbors[na] || new Set()).add(nb);
				(neighbors[nb] = neighbors[nb] || new Set()).add(na);
			}
		}

		return {nodes, connectors, neighbors};
	}

	// The node whose bbox contains a point, preferring real node shapes over thin
	// connector bboxes and, among equals, the smallest (most specific) one.
	_nodeAt(pt, nodes, exclude_el) {
		let best = null;
		let best_area = Infinity;
		let best_is_node = false;
		const tol = 4;

		for (const n of nodes) {
			if (n.el === exclude_el) {
				continue;
			}

			const b = n.bbox;

			if (pt.x < b.x - tol || pt.x > b.x + b.width + tol
					|| pt.y < b.y - tol || pt.y > b.y + b.height + tol) {
				continue;
			}

			const area = b.width * b.height;

			if (n.area && !best_is_node) {
				best = n.id;
				best_area = area;
				best_is_node = true;
			}
			else if (!!n.area === best_is_node && area < best_area) {
				best = n.id;
				best_area = area;
			}
		}

		return best;
	}

	// First/last point of a geometry element, in root SVG coordinates.
	_endpoints(geom) {
		const tag = geom.tagName.toLowerCase();

		try {
			if (tag === 'path') {
				const total = geom.getTotalLength();

				if (!total) {
					return null;
				}

				const p0 = geom.getPointAtLength(0);
				const p1 = geom.getPointAtLength(total);

				return [this._rootPoint(geom, p0.x, p0.y), this._rootPoint(geom, p1.x, p1.y)];
			}

			if (tag === 'line') {
				return [
					this._rootPoint(geom, +geom.getAttribute('x1'), +geom.getAttribute('y1')),
					this._rootPoint(geom, +geom.getAttribute('x2'), +geom.getAttribute('y2'))
				];
			}

			const pts = geom.points;

			if (!pts || pts.numberOfItems < 2) {
				return null;
			}

			const f = pts.getItem(0);
			const l = pts.getItem(pts.numberOfItems - 1);

			return [this._rootPoint(geom, f.x, f.y), this._rootPoint(geom, l.x, l.y)];
		}
		catch (e) {
			return null;
		}
	}

	_rootPoint(el, x, y) {
		const m = el.getCTM();
		const p = this._svg.createSVGPoint();

		p.x = x;
		p.y = y;

		return m === null ? {x, y} : p.matrixTransform(m);
	}

	_rootBBox(el) {
		try {
			const b = el.getBBox();
			const corners = [
				this._rootPoint(el, b.x, b.y),
				this._rootPoint(el, b.x + b.width, b.y),
				this._rootPoint(el, b.x, b.y + b.height),
				this._rootPoint(el, b.x + b.width, b.y + b.height)
			];
			const xs = corners.map((p) => p.x);
			const ys = corners.map((p) => p.y);
			const minx = Math.min(...xs);
			const miny = Math.min(...ys);

			return {x: minx, y: miny, width: Math.max(...xs) - minx, height: Math.max(...ys) - miny};
		}
		catch (e) {
			return null;
		}
	}

	_applyOps(ops, conn) {
		for (const op of ops) {
			if (op.op === 'clone') {
				const from = this._findCell(op.from);

				if (from === null) {
					continue;
				}

				const clone = from.cloneNode(true);
				const base = from.getAttribute('transform');

				clone.setAttribute('data-drawio-clone', '1');
				clone.setAttribute('data-cell-id', op.id);
				clone.setAttribute('transform', `translate(${op.dx},${op.dy})` + (base ? ' ' + base : ''));
				from.parentNode.appendChild(clone);

				if (op.edges) {
					this._cloneEdges(op.from, op.id, op.dx, op.dy, op.edges, conn);
				}
			}
			else if (op.op === 'set') {
				const cell = this._findCell(op.id);

				if (cell !== null) {
					this._applyPatch(cell, op.patch);
				}
			}
			else if (op.op === 'remove') {
				const cell = this._findCell(op.id);

				if (cell !== null) {
					if (op.edges) {
						this._removeIncident(op.id, op.edges, conn);
					}

					cell.remove();
				}
			}
		}
	}

	// Clone the connectors incident to a cloned node, re-routed so each keeps its
	// far (fixed) end and follows the clone by (dx,dy). `filter` is true (all
	// incident connectors) or a list of far-neighbor ids to restrict to. The
	// cloned connector is a straight line — routed waypoints are not preserved.
	_cloneEdges(from_id, new_id, dx, dy, filter, conn) {
		if (!conn) {
			return;
		}

		const list = Array.isArray(filter) ? filter : null;

		for (const c of conn.connectors) {
			let moving, fixed, far;

			if (c.na === from_id) {
				moving = c.a; fixed = c.b; far = c.nb;
			}
			else if (c.nb === from_id) {
				moving = c.b; fixed = c.a; far = c.na;
			}
			else {
				continue;
			}

			if (list !== null && (far === null || list.indexOf(far) === -1)) {
				continue;
			}

			const clone = c.el.cloneNode(true);

			clone.setAttribute('data-drawio-clone', '1');
			clone.setAttribute('data-cell-id', new_id + '~' + c.id);
			clone.removeAttribute('transform');

			const geom = clone.querySelector('path, line, polyline');

			if (geom !== null) {
				geom.removeAttribute('transform');
				this._setStraight(geom, fixed, {x: moving.x + dx, y: moving.y + dy});
			}

			// Root-space geometry → append at the SVG root, free of ancestor transforms.
			this._svg.appendChild(clone);
		}
	}

	// Remove the connectors incident to a cell (optionally only those whose far
	// end lands on one of `filter`'s ids).
	_removeIncident(id, filter, conn) {
		if (!conn) {
			return;
		}

		const list = Array.isArray(filter) ? filter : null;

		for (const c of conn.connectors) {
			let far;

			if (c.na === id) {
				far = c.nb;
			}
			else if (c.nb === id) {
				far = c.na;
			}
			else {
				continue;
			}

			if (list !== null && (far === null || list.indexOf(far) === -1)) {
				continue;
			}

			c.el.remove();
		}
	}

	_setStraight(geom, p, q) {
		const tag = geom.tagName.toLowerCase();

		if (tag === 'line') {
			geom.setAttribute('x1', p.x);
			geom.setAttribute('y1', p.y);
			geom.setAttribute('x2', q.x);
			geom.setAttribute('y2', q.y);
		}
		else if (tag === 'polyline') {
			geom.setAttribute('points', `${p.x},${p.y} ${q.x},${q.y}`);
		}
		else {
			geom.setAttribute('d', `M ${p.x} ${p.y} L ${q.x} ${q.y}`);
		}
	}

	_applyPatch(cell, patch) {
		const shapes = cell.querySelectorAll('rect, ellipse, circle, path, polygon, line, polyline');

		if (patch.fill != null) {
			const c = this._cssColor(patch.fill);

			shapes.forEach((s) => { s.style.fill = c; });
		}

		if (patch.stroke != null) {
			const c = this._cssColor(patch.stroke);

			shapes.forEach((s) => { s.style.stroke = c; });
		}

		if (patch.strokeWidth != null) {
			shapes.forEach((s) => { s.style.strokeWidth = patch.strokeWidth; });
		}

		if (patch.opacity != null) {
			cell.style.opacity = patch.opacity;
		}

		if (patch.text != null) {
			this._setText(cell, String(patch.text));
		}

		if (patch.textAngle != null) {
			this._setTextAngle(cell, patch.textAngle);
		}

		if (patch.animate != null) {
			this._setAnim(cell, patch.animate);
		}

		if (patch.flow != null) {
			this._setFlow(cell, patch.flow);
		}
	}

	// A named CSS animation on the whole cell. Kept alive by the browser between
	// refreshes; 'none'/false just clears it. See widget.css @keyframes.
	_setAnim(cell, name) {
		cell.classList.remove('drawio-pulse', 'drawio-blink');

		if (name === 'pulse' || name === 'blink') {
			cell.classList.add('drawio-' + name);
		}
	}

	// Flowing dashes along the cell's lines. `flow` is a signed speed:
	// >0 forward, <0 reverse, 0/false stops. Magnitude scales the speed.
	_setFlow(cell, flow) {
		const n = (flow === true) ? 1 : Number(flow);
		const lines = cell.querySelectorAll('path, line, polyline');

		lines.forEach((s) => {
			if (!n || isNaN(n)) {
				s.style.animation = '';

				return;
			}

			if (s.style.strokeDasharray === '') {
				s.style.strokeDasharray = '8 4';
			}

			const dur = Math.max(0.2, Math.min(10, 2 / Math.abs(n)));

			s.style.animation = `drawio-flow ${dur}s linear infinite`;
			s.style.animationDirection = n < 0 ? 'reverse' : 'normal';
		});
	}

	_findCell(cell_id) {
		const sel = (window.CSS && CSS.escape) ? CSS.escape(cell_id) : cell_id;

		return this._svg.querySelector(`g[data-cell-id="${sel}"]`);
	}

	// Replace a cell's label, honoring newlines. draw.io html labels keep the text
	// in one inner <div> with <br> between lines; plain SVG labels use <text>, where
	// extra lines become <tspan>s stacked by line height. draw.io often wraps both in
	// a <switch> (foreignObject + a <text> fallback) — update whichever are present so
	// the two never disagree, even though the browser only renders the foreignObject.
	_setText(cell, text) {
		const lines = String(text).split('\n');
		const fo = cell.querySelector('foreignObject');

		if (fo !== null) {
			const divs = fo.querySelectorAll('div');
			const target = divs.length ? divs[divs.length - 1] : fo;

			target.innerHTML = lines.map((l) => this._escapeHtml(l)).join('<br>');
		}

		const text_el = cell.querySelector('text');

		if (text_el !== null) {
			this._setSvgText(text_el, lines);
		}
	}

	_setSvgText(text_el, lines) {
		while (text_el.firstChild !== null) {
			text_el.removeChild(text_el.firstChild);
		}

		if (lines.length === 1) {
			text_el.textContent = lines[0];

			return;
		}

		const x = text_el.getAttribute('x');
		const lh = (parseFloat(text_el.getAttribute('font-size')) || 14) * 1.2;
		const NS = 'http://www.w3.org/2000/svg';

		lines.forEach((line, i) => {
			const tspan = document.createElementNS(NS, 'tspan');

			if (x !== null) {
				tspan.setAttribute('x', x);
			}

			tspan.setAttribute('dy', i === 0 ? 0 : lh);
			tspan.textContent = line;
			text_el.appendChild(tspan);
		});
	}

	_escapeHtml(s) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	// Rotate a cell's label. `angle` is a number of degrees, or 'edge'/'auto' to lay
	// the label parallel to the cell's connector line (flipped when needed so the
	// text never ends up upside-down). The label lives in its own <g> inside the
	// cell, sibling to the line's <g>; we rotate that group and cache its original
	// transform so re-applying every refresh stays idempotent.
	_setTextAngle(cell, angle) {
		const label = cell.querySelector('foreignObject') || cell.querySelector('text');

		if (label === null) {
			return;
		}

		let wrap = label;

		while (wrap.parentNode !== null && wrap.parentNode !== cell) {
			wrap = wrap.parentNode;
		}

		if (wrap === cell) {
			return;
		}

		let deg;
		let cx;
		let cy;

		if (angle === 'edge' || angle === 'auto') {
			const geom = cell.querySelector('path, line, polyline');
			const ends = geom !== null ? this._geomEndsLocal(geom) : null;

			if (ends === null) {
				return;
			}

			deg = Math.atan2(ends[1].y - ends[0].y, ends[1].x - ends[0].x) * 180 / Math.PI;

			if (deg > 90) {
				deg -= 180;
			}
			else if (deg < -90) {
				deg += 180;
			}

			cx = (ends[0].x + ends[1].x) / 2;
			cy = (ends[0].y + ends[1].y) / 2;
		}
		else {
			deg = Number(angle) || 0;

			try {
				const b = wrap.getBBox();

				cx = b.x + b.width / 2;
				cy = b.y + b.height / 2;
			}
			catch (e) {
				cx = 0;
				cy = 0;
			}
		}

		let base = wrap.getAttribute('data-drawio-base-transform');

		if (base === null) {
			base = wrap.getAttribute('transform') || '';
			wrap.setAttribute('data-drawio-base-transform', base);
		}

		wrap.setAttribute('transform', (`rotate(${deg} ${cx} ${cy}) ` + base).trim());
	}

	// First/last point of a geometry element, in its own (local) coordinates.
	_geomEndsLocal(geom) {
		const tag = geom.tagName.toLowerCase();

		try {
			if (tag === 'path') {
				const total = geom.getTotalLength();

				if (!total) {
					return null;
				}

				const a = geom.getPointAtLength(0);
				const b = geom.getPointAtLength(total);

				return [{x: a.x, y: a.y}, {x: b.x, y: b.y}];
			}

			if (tag === 'line') {
				return [
					{x: +geom.getAttribute('x1'), y: +geom.getAttribute('y1')},
					{x: +geom.getAttribute('x2'), y: +geom.getAttribute('y2')}
				];
			}

			const pts = geom.points;

			if (!pts || pts.numberOfItems < 2) {
				return null;
			}

			const f = pts.getItem(0);
			const l = pts.getItem(pts.numberOfItems - 1);

			return [{x: f.x, y: f.y}, {x: l.x, y: l.y}];
		}
		catch (e) {
			return null;
		}
	}

	_cssColor(c) {
		return /^[0-9a-fA-F]{6}$/.test(c) ? '#' + c : c;
	}

	// --- sandbox (isolated script evaluator) ---------------------------------

	_ensureSandbox() {
		if (this._sandbox !== null) {
			return this._sandbox_ready;
		}

		const iframe = document.createElement('iframe');

		iframe.setAttribute('sandbox', 'allow-scripts');
		iframe.style.display = 'none';
		iframe.srcdoc = this._sandboxHtml();

		this._sandbox_ready = new Promise((resolve) => { iframe.onload = () => resolve(); });

		window.addEventListener('message', this._onMessage);
		document.body.appendChild(iframe);
		this._sandbox = iframe;

		return this._sandbox_ready;
	}

	/**
	 * The evaluator, hosted in the opaque-origin iframe. The iframe gives
	 * CONFIDENTIALITY (no parent cookies/DOM/credentialed network); the nested
	 * Worker gives DoS SAFETY — a runaway script runs on its own thread and is
	 * terminated by a watchdog. The evaluator functions are defined once and
	 * serialized (Function.prototype.toString) into the Worker source, so there
	 * is no duplicated logic. If the browser refuses a Worker in a sandboxed
	 * frame, we fall back to inline evaluation (isolated, but not DoS-safe).
	 *
	 * The evaluator builds a CRUD API over the serialized cell model, runs the
	 * user script, and returns the recorded operations.
	 */
	_sandboxHtml() {
		return '<!doctype html><meta charset="utf-8"><script>'
			+ '"use strict";'
			+ 'function scale(v,a,b,c,d){var f=(b===a)?0:(v-a)/(b-a);var k=Math.max(0,Math.min(1,f));return c+k*(d-c);}'
			+ 'function color(v,s,base){var col=base;(s||[]).slice().sort(function(x,y){return x[0]-y[0];})'
			+ '.forEach(function(t){if(v>=t[0])col=t[1];});return col;}'
			+ 'function grid(i,o){o=o||{};var cols=o.cols||4,gap=o.gap||12,w=o.w||130,h=o.h||70;'
			+ 'return{dx:(i%cols)*(w+gap),dy:Math.floor(i/cols)*(h+gap)};}'
			// Humanize a number the way Zabbix convertUnits does. Special units are
			// dispatched first: "unixtime" → date-time, "uptime"/"s" → duration,
			// %/ms/rpm/RPM (and |value|<1) → no scaling. Otherwise an SI/binary prefix:
			// bytes (B, Bps) scale by 1024, everything else (bits bps, …) by 1000.
			// e.g. units(1536,"B")="1.5 KB", units(174820,"uptime")="2 days, 00:33:40".
			+ 'function units(v,u,dec){v=Number(v);if(!isFinite(v))return "";'
			+ 'u=(u==null)?"":String(u);dec=(dec==null)?2:dec;'
			+ 'function z(n){return(n<10?"0":"")+n;}'
			+ 'if(u==="unixtime"){var D=new Date(v*1000);return D.getFullYear()+"-"+z(D.getMonth()+1)+"-"+z(D.getDate())'
			+ '+" "+z(D.getHours())+":"+z(D.getMinutes())+":"+z(D.getSeconds());}'
			+ 'if(u==="uptime"){var t=Math.round(Math.abs(v)),sg=v<0?"-":"",dd=Math.floor(t/86400);t-=dd*86400;'
			+ 'var hh=Math.floor(t/3600);t-=hh*3600;var mm=Math.floor(t/60);t-=mm*60;'
			+ 'return sg+(dd?dd+(dd===1?" day, ":" days, "):"")+z(hh)+":"+z(mm)+":"+z(t);}'
			+ 'if(u==="s"){var g=v<0?"-":"",q=Math.abs(v);'
			+ 'if(q<1)return g+parseFloat((q*1000).toFixed(dec))+"ms";'
			+ 'var d2=Math.floor(q/86400);q-=d2*86400;var h2=Math.floor(q/3600);q-=h2*3600;'
			+ 'var m2=Math.floor(q/60);var s2=Math.floor(q-m2*60);var P=[];'
			+ 'if(d2)P.push(d2+"d");if(h2)P.push(h2+"h");if(m2)P.push(m2+"m");if(s2)P.push(s2+"s");'
			+ 'return g+(P.slice(0,3).join(" ")||"0s");}'
			+ 'if(u==="%"||u==="ms"||u==="rpm"||u==="RPM"||Math.abs(v)<1)'
			+ 'return String(parseFloat(v.toFixed(dec)))+(u?" "+u:"");'
			+ 'var base=(u==="B"||u==="Bps")?1024:1000,pre="KMGTPEZY",p=0;'
			+ 'while(Math.abs(v)>=base&&p<8){v/=base;p++;}'
			+ 'var sf=(p===0?"":pre.charAt(p-1))+u;'
			+ 'return String(parseFloat(v.toFixed(dec)))+(sf?" "+sf:"");}'
			+ 'function clean(p){var o={};if(p&&typeof p==="object")'
			+ '["fill","stroke","strokeWidth","opacity","text","textAngle","animate","flow"].forEach(function(k){var v=p[k];'
			+ 'if(typeof v==="number"||typeof v==="string"||typeof v==="boolean")o[k]=v;});return o;}'
			+ 'function edg(e){return e===true?true:(Array.isArray(e)?e.filter(function(x){return typeof x==="string";}):false);}'
			+ 'function build(model){var ops=[],seq=0,byId={};model.forEach(function(c){byId[c.id]=c;});'
			+ 'function handle(id,info){var h={id:id,label:info?info.label:"",'
			+ 'bbox:info?info.bbox:{x:0,y:0,width:130,height:70},neighbors:(info&&info.neighbors)||[]};'
			+ 'h.set=function(p){ops.push({op:"set",id:id,patch:clean(p)});return h;};'
			+ 'h.remove=function(o){ops.push({op:"remove",id:id,edges:edg(o&&o.edges)});};'
			+ 'h.clone=function(o){o=o||{};var nid=o.id||("__c"+(++seq));'
			+ 'ops.push({op:"clone",from:id,id:nid,dx:o.dx||0,dy:o.dy||0,edges:edg(o.edges)});'
			+ 'var nh=handle(nid,{label:h.label,bbox:h.bbox});if(o.patch)nh.set(o.patch);return nh;};'
			+ 'h.repeat=function(list,o,fn){o=o||{};var cols=o.cols||4,gap=o.gap||12,bb=h.bbox||{width:130,height:70};'
			+ '(list||[]).forEach(function(item,i){var cell=(i===0)?h:'
			+ 'h.clone({dx:(i%cols)*(bb.width+gap),dy:Math.floor(i/cols)*(bb.height+gap),edges:o.edges});fn(cell,item,i);});};'
			+ 'return h;}'
			+ 'var cells={all:model.map(function(c){return handle(c.id,c);}),'
			+ 'get:function(id){return byId[id]?handle(id,byId[id]):null;},'
			+ 'byLabel:function(l){var c=model.find(function(x){return x.label===l;});return c?handle(c.id,c):null;},'
			+ 'find:function(fn){var c=model.find(fn);return c?handle(c.id,c):null;}};'
			+ 'return{cells:cells,ops:ops};}'
			+ 'function runJob(d){var b=build(d.cells||[]);var api={scale:scale,color:color,grid:grid,units:units};var error=null;'
			+ 'try{(new Function("hosts","cells","api",d.script))(d.hosts||[],b.cells,api);}'
			+ 'catch(err){error=String((err&&err.stack)||err);}return{ops:b.ops,error:error};}'
			// Serialize the evaluator into a Worker (own thread → terminable).
			+ 'var WSRC=[scale,color,grid,units,clean,edg,build,runJob].map(function(f){return f.toString();}).join("\\n")'
			+ '+"\\nself.onmessage=function(e){var r=runJob(e.data);self.postMessage({id:e.data.id,ops:r.ops,error:r.error});};";'
			+ 'var worker=null,jobs={};'
			+ 'function mk(){try{worker=new Worker(URL.createObjectURL(new Blob([WSRC],{type:"application/javascript"})));'
			+ 'worker.onmessage=function(e){var d=e.data||{},j=jobs[d.id];if(!j)return;'
			+ 'clearTimeout(j.t);delete jobs[d.id];parent.postMessage({id:d.id,ops:d.ops||[],error:d.error},"*");};'
			+ 'return true;}catch(err){worker=null;return false;}}'
			+ 'self.addEventListener("message",function(e){var d=e.data||{};'
			+ 'if(worker===null&&!mk()){var r=runJob(d);parent.postMessage({id:d.id,ops:r.ops,error:r.error},"*");return;}'
			+ 'jobs[d.id]={t:setTimeout(function(){try{worker.terminate();}catch(_){}worker=null;delete jobs[d.id];'
			+ 'parent.postMessage({id:d.id,ops:[]},"*");},1000)};'
			+ 'worker.postMessage({id:d.id,script:d.script,hosts:d.hosts,cells:d.cells});});'
			+ '<\/script>';
	}

	_onMessage(e) {
		if (this._sandbox === null || e.source !== this._sandbox.contentWindow) {
			return;
		}

		const data = e.data || {};

		// Surface script errors to the console — otherwise a buggy user script fails
		// silently (the evaluator catches its own exception to stay isolated).
		if (data.error) {
			console.error('[drawio] user script error:\n' + data.error);
		}

		const resolve = this._pending.get(data.id);

		if (resolve !== undefined) {
			this._pending.delete(data.id);
			resolve(Array.isArray(data.ops) ? data.ops : null);
		}
	}

	_evalScript(script, hosts, cells) {
		return this._ensureSandbox().then(() => new Promise((resolve) => {
			const id = ++this._req_seq;

			this._pending.set(id, resolve);
			this._sandbox.contentWindow.postMessage({id, script, hosts, cells}, '*');

			// A looping/lost script must not leak the resolver forever.
			setTimeout(() => {
				if (this._pending.has(id)) {
					this._pending.delete(id);
					resolve(null);
				}
			}, 2000);
		}));
	}
}
