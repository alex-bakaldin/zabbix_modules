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
 *            items:[{itemid,key,name,value,units,value_type,tags:[{tag,value}]}],
 *            triggers:[{triggerid,description,priority,status,value,tags:[{tag,value}],
 *                       event_hint?}]}]   // event_hint: ready preload for hint (open problem only)
 *   cells — { get(id), byLabel(text), find(fn), all }
 *           handle → { id, label, bbox, neighbors:[id], source, target, set(patch),
 *                      clone({id,dx,dy,patch,edges}), repeat(list,{cols,gap,edges},fn),
 *                      remove({edges}) }
 *                    source/target — for a connector, the node ids at the line's
 *                    START and END, as drawn (geometric direction); null when that
 *                    end isn't attached to a node. Non-connector cells: both null.
 *           patch  → { fill, stroke, strokeWidth, opacity, text,
 *                      textAngle:<deg>|'edge', animate:'pulse'|'blink'|'none',
 *                      flow:<signed speed>,
 *                      interact:{ hint:{html|text|preload|history:{label:[itemid,…]}},
 *                                 menu:{type,itemid|hostid|triggerid}, links:[{label,url,target}] } }
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

		this._time_period = null;
	}

	// The chart hints (hint.history) need the widget's time period on the client.
	// Tell the framework we consume it: when the field isn't a reference (custom
	// range), flag it so the controller resolves our own period.
	getUpdateRequestData() {
		return {
			...super.getUpdateRequestData(),
			has_custom_time_period: this.getFieldsReferredData().has('time_period') ? undefined : 1
		};
	}

	setContents(response) {
		this._bindInteraction();

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

		this._time_period = response.time_period || null;
		this._script = response.script || '';
		this._apply(response.hosts || []);
	}

	onDestroy() {
		super.onDestroy();

		if (this._interaction_bound) {
			this._body.removeEventListener('contextmenu', this._onContextMenu);
			this._body.removeEventListener('mouseover', this._onPointerOver);
			this._body.removeEventListener('mouseout', this._onPointerOut);
			this._interaction_bound = false;
		}

		this._destroyChart();

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

		// Directed endpoints per connector: na is the node at the line's start
		// (path point 0), nb the node at its end. Exposed as source/target so a
		// script can read the flow direction FROM THE DRAWING, not from any
		// external ordering.
		const dir = {};

		for (const c of conn.connectors) {
			dir[c.id] = {source: c.na, target: c.nb};
		}

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
			const d = dir[id];

			model.push({id, label: this._cellLabel(g), bbox, neighbors,
				source: d ? d.source : null, target: d ? d.target : null});
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

			const bbox = this._cellShapeBBox(g);

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

	// Root-space box of a cell's SHAPE, not the whole <g>. draw.io wraps each cell's
	// label in a <foreignObject> sized to the ENTIRE canvas, so g.getBBox() (hence
	// _rootBBox(g)) would span the whole diagram — making every node's box overlap
	// every point and _nodeAt resolve every line endpoint to the same (first) cell.
	// Measuring the shape element (rect/ellipse/…/path) gives the cell's true box.
	_cellShapeBBox(g) {
		const shape = g.querySelector('rect, ellipse, circle, polygon, image, path, line, polyline');

		return this._rootBBox(shape || g);
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

		if (patch.interact != null) {
			this._setInteract(cell, patch.interact);
		}
	}

	// --- interactivity (right-click menus, hover hints) -----------------------
	//
	// The script attaches a DECLARATIVE spec to a cell via set({interact:{…}}); the
	// widget translates it into the standard Zabbix data-attributes and lets Zabbix's
	// own global handlers do the work (AJAX, menu/hintbox rendering). No user code
	// runs in the page context, so the sandbox model is preserved.
	//
	//   interact = {
	//     hint: { html:'<b>…</b>' | text:'…'            // custom hover box (built from payload)
	//             | preload:{type:'eventlist'|'actionlist', data:{…}} },  // native (advanced)
	//     menu: { type:'item'|'host'|'trigger',         // native context menu (right click)
	//             itemid|hostid|triggerid:<id> },
	//     links: [ { label, url, target } ]             // custom menu (client-built, no server)
	//   }
	//
	// Like animate/flow, the attributes are STICKY across refreshes — set({interact:{}})
	// clears them.
	_setInteract(cell, spec) {
		// Clear anything a previous refresh left, so the spec is authoritative.
		cell.removeAttribute('data-menu-popup');
		cell.removeAttribute('data-hintbox');
		cell.removeAttribute('data-hintbox-html');
		cell.removeAttribute('data-hintbox-preload');
		cell.removeAttribute('data-hintbox-style');
		cell._drawio_links = null;
		cell._drawio_history = null;
		cell.style.cursor = '';

		if (window.jQuery) {
			jQuery(cell).removeData('menu-popup').removeData('hintbox-preload');
		}

		if (!spec || typeof spec !== 'object') {
			return;
		}

		let interactive = false;

		// Hover hint — reuses Zabbix's global [data-hintbox=1] handler.
		const hint = spec.hint;

		if (hint && typeof hint === 'object') {
			// Chart hint — a live, tabbed history graph we draw ourselves (our own
			// hover popup, not Zabbix's hintbox). Takes precedence over html/preload.
			if (hint.history && typeof hint.history === 'object') {
				cell._drawio_history = this._normalizeHistory(hint.history);

				if (cell._drawio_history !== null) {
					interactive = true;
				}
			}
			else {
				let html = null;

				if (typeof hint.html === 'string') {
					html = hint.html;
				}
				else if (typeof hint.text === 'string') {
					html = this._escapeHtml(hint.text).replace(/\n/g, '<br>');
				}

				if (html !== null) {
					cell.setAttribute('data-hintbox', '1');
					cell.setAttribute('data-hintbox-html', html);
					interactive = true;
				}
				else if (hint.preload && typeof hint.preload === 'object') {
					cell.setAttribute('data-hintbox', '1');
					this._loadPreloadHint(cell, hint.preload);
					interactive = true;
				}
			}
		}

		// Right-click menu — native (server-built) via data-menu-popup, opened by our
		// own contextmenu shim (Zabbix binds data-menu-popup to LEFT click).
		const menu = spec.menu;

		if (menu && typeof menu === 'object' && typeof menu.type === 'string') {
			const data = this._nativeMenuData(menu);

			if (data !== null) {
				const popup = {type: menu.type, data};

				// item/trigger menus build config urls that need a top-level `context`
				// (Zabbix reads data.context) — without it the target page rejects "".
				if (menu.type !== 'host') {
					popup.context = menu.context || 'host';
				}

				cell.setAttribute('data-menu-popup', JSON.stringify(popup));
				interactive = true;
			}
		}

		// Right-click menu — custom links (client-built, no server round-trip).
		if (Array.isArray(spec.links) && spec.links.length) {
			cell._drawio_links = spec.links.filter((l) => l && typeof l.url === 'string');

			if (cell._drawio_links.length) {
				interactive = true;
			}
		}

		if (interactive) {
			cell.style.cursor = 'pointer';
		}
	}

	// A native preload hint (event list / action list) is CLICK-only in vanilla Zabbix:
	// its hover path needs a non-empty data-hintbox-html, which the preload path forbids.
	// To honour it as a HOVER hint we fetch the server-rendered HTML ourselves (same
	// endpoint Zabbix uses) and feed it to the standard hintbox. Cached per spec so we
	// don't re-request on every refresh; a changed spec (e.g. a new problem's eventid)
	// re-fetches.
	_loadPreloadHint(cell, preload) {
		const key = JSON.stringify(preload);

		if (cell._drawio_hint_key === key && cell._drawio_hint_html != null) {
			cell.setAttribute('data-hintbox-html', cell._drawio_hint_html);

			return;
		}

		const action = preload.action
			|| (preload.type === 'eventlist' ? 'hintbox.eventlist'
				: preload.type === 'eventactions' ? 'hintbox.actionlist' : null);

		if (action === null || !window.jQuery) {
			return;
		}

		cell._drawio_hint_key = key;
		cell._drawio_hint_html = null;

		jQuery.ajax({
			url: 'zabbix.php?action=' + action,
			method: 'POST',
			data: preload.data || {},
			dataType: 'json'
		}).done((resp) => {
			// A later refresh may have re-pointed this cell — don't clobber it.
			if (cell._drawio_hint_key !== key) {
				return;
			}

			const html = (resp && resp.error)
				? this._escapeHtml((resp.error.messages || []).join(' ') || 'Error')
				: ((resp && resp.messages) || '') + ((resp && resp.data) || '') + ((resp && resp.value) || '');

			cell._drawio_hint_html = html;
			cell.setAttribute('data-hintbox-html', html);
		});
	}

	// Build the `data` payload the menu.popup controller expects per type.
	// backurl (item/trigger) returns the user here after a menu action; it must be
	// a LOCAL (relative) url — the controller rejects an absolute one as access-denied.
	_nativeMenuData(menu) {
		switch (menu.type) {
			case 'item':
			case 'item_prototype':
				return menu.itemid != null
					? {itemid: String(menu.itemid), backurl: this._backurl()}
					: null;

			case 'host':
				return menu.hostid != null ? {hostid: String(menu.hostid)} : null;

			case 'trigger':
				return menu.triggerid != null
					? {triggerid: String(menu.triggerid), backurl: this._backurl()}
					: null;

			default:
				return null;
		}
	}

	// Current page as a local url (filename + query), the form Zabbix's own menus use.
	_backurl() {
		return location.pathname.split('/').pop() + location.search;
	}

	// Delegated listeners for the whole diagram: contextmenu drives right-click menus;
	// mouseover/out drive the chart hint popup. Text/html/preload hover hints need no
	// listener — Zabbix's global [data-hintbox=1] handler covers those.
	_bindInteraction() {
		if (this._interaction_bound) {
			return;
		}

		this._onContextMenu = this._onContextMenu.bind(this);
		this._onPointerOver = this._onPointerOver.bind(this);
		this._onPointerOut = this._onPointerOut.bind(this);
		this._body.addEventListener('contextmenu', this._onContextMenu);
		this._body.addEventListener('mouseover', this._onPointerOver);
		this._body.addEventListener('mouseout', this._onPointerOut);
		this._interaction_bound = true;
	}

	_onContextMenu(e) {
		// In dashboard edit mode leave the browser/widget context menu alone.
		if (this.isEditMode && this.isEditMode()) {
			return;
		}

		const target = e.target;

		if (!target || !target.closest) {
			return;
		}

		const cell = target.closest('[data-cell-id]');

		if (cell === null) {
			return;
		}

		// Custom links take precedence over a native menu on the same cell.
		if (Array.isArray(cell._drawio_links) && cell._drawio_links.length) {
			e.preventDefault();
			this._showLinksMenu(cell, e);

			return;
		}

		if (cell.hasAttribute('data-menu-popup')) {
			e.preventDefault();

			// Re-fire Zabbix's own [data-menu-popup] handler (bound to left click) by
			// dispatching a REAL click at the cursor: detail:1 + client coords make
			// Zabbix position the menu at the pointer (its positioner uses the event
			// only when originalEvent.detail is truthy — a synthetic jQuery event isn't).
			e.target.dispatchEvent(new MouseEvent('click', {
				bubbles: true,
				cancelable: true,
				view: window,
				button: 0,
				detail: 1,
				clientX: e.clientX,
				clientY: e.clientY
			}));
		}
	}

	_showLinksMenu(cell, e) {
		if (!window.jQuery) {
			return;
		}

		const items = cell._drawio_links.map((l) => {
			const item = {label: String(l.label != null ? l.label : l.url), url: String(l.url)};

			if (typeof l.target === 'string') {
				item.target = l.target;
			}

			return item;
		});

		// Position the menu at the cursor: pass an explicit position anchored to the
		// contextmenu event (its pageX/pageY), overriding menuPopup's default which
		// would otherwise place it off the element.
		jQuery(cell).menuPopup([{items}], jQuery.Event(e), {
			position: {of: e, my: 'left top', at: 'left top', collision: 'fit'}
		});
	}

	// --- chart hints (live, tabbed history graph) -----------------------------
	//
	// hint.history = { '<Tab label>': [itemid, …], … }. On hover we open our own
	// popup with one tab per label and draw a Canvas line chart of each item's
	// history over the widget's time period. History is fetched on demand in time
	// chunks, newest first, and the chart is redrawn as each chunk lands — so a
	// heavy query paints progressively instead of blocking.

	HISTORY_LIMIT = 500;      // values per history request (page size)
	HISTORY_MAX_ROUNDS = 20;  // safety cap on backward pages
	CHART_W = 380;
	CHART_H = 190;
	CHART_PALETTE = ['#3a8fd6', '#e0743a', '#43a047', '#c0554f', '#8e6fc9', '#d6b13a', '#0f9b8e', '#b0679b'];

	// Normalize { label: [itemid,…] } into an ordered [{label, itemids:[str,…]}];
	// null if nothing plottable.
	_normalizeHistory(spec) {
		const tabs = [];

		for (const label of Object.keys(spec)) {
			const raw = spec[label];
			const ids = (Array.isArray(raw) ? raw : [raw])
				.map((x) => String(x))
				.filter((x) => x !== '' && x !== 'null' && x !== 'undefined');

			if (ids.length) {
				tabs.push({label: String(label), itemids: ids});
			}
		}

		return tabs.length ? tabs : null;
	}

	_onPointerOver(e) {
		if (this.isEditMode && this.isEditMode()) {
			return;
		}

		const cell = (e.target && e.target.closest) ? e.target.closest('[data-cell-id]') : null;

		if (cell === null || !Array.isArray(cell._drawio_history)) {
			return;
		}

		if (this._chart_cell === cell) {
			this._chartCancelHide();

			return;
		}

		if (this._chart_pending_cell === cell) {
			return;
		}

		this._chartCancelHide();
		clearTimeout(this._chart_show_timer);
		this._chart_pending_cell = cell;

		const ev = {clientX: e.clientX, clientY: e.clientY};

		this._chart_show_timer = setTimeout(() => {
			this._chart_pending_cell = null;
			this._showChart(cell, ev);
		}, 350);
	}

	_onPointerOut(e) {
		const to = e.relatedTarget;

		// Moving into the popup keeps it open (the popup has its own enter/leave).
		if (this._chart && to && this._chart.el.contains(to)) {
			return;
		}

		const cell = (e.target && e.target.closest) ? e.target.closest('[data-cell-id]') : null;

		// Still within the same cell — ignore the internal move.
		if (cell !== null && to && cell.contains(to)) {
			return;
		}

		clearTimeout(this._chart_show_timer);
		this._chart_pending_cell = null;
		this._scheduleChartHide();
	}

	_chartCancelHide() {
		clearTimeout(this._chart_hide_timer);
	}

	_scheduleChartHide() {
		clearTimeout(this._chart_hide_timer);
		this._chart_hide_timer = setTimeout(() => this._hideChart(), 250);
	}

	_ensureChartPopup() {
		if (this._chart) {
			return this._chart;
		}

		const el = document.createElement('div');

		el.className = 'drawio-charthint';
		el.style.display = 'none';

		const tabs = document.createElement('div');
		const body = document.createElement('div');
		const canvas = document.createElement('canvas');
		const legend = document.createElement('div');

		tabs.className = 'dch-tabs';
		body.className = 'dch-body';
		legend.className = 'dch-legend';
		body.appendChild(canvas);
		el.appendChild(tabs);
		el.appendChild(body);
		el.appendChild(legend);
		document.body.appendChild(el);

		el.addEventListener('mouseenter', () => this._chartCancelHide());
		el.addEventListener('mouseleave', () => this._scheduleChartHide());

		this._chart = {el, tabs, canvas, legend, cell: null, active: 0, loading: false};

		return this._chart;
	}

	_showChart(cell, ev) {
		const spec = cell._drawio_history;

		if (!Array.isArray(spec)) {
			return;
		}

		const chart = this._ensureChartPopup();

		this._chart_cell = cell;
		chart.cell = cell;

		// (Re)build the per-tab data cache, keyed by the tabs + time period.
		const sig = JSON.stringify({t: spec.map((t) => t.itemids), p: this._time_period});

		if (cell._chart_sig !== sig) {
			cell._chart_sig = sig;
			cell._chart_data = spec.map(() => ({}));
			cell._chart_loaded = spec.map(() => false);
			cell._chart_token = (cell._chart_token || 0) + 1;
		}

		// Tab bar (hidden when a single tab).
		chart.tabs.innerHTML = '';
		chart.tabs.style.display = spec.length > 1 ? '' : 'none';

		spec.forEach((t, i) => {
			const b = document.createElement('button');

			b.type = 'button';
			b.className = 'dch-tab';
			b.textContent = t.label;
			b.addEventListener('click', () => this._activateTab(cell, i));
			chart.tabs.appendChild(b);
		});

		chart.el.style.display = '';
		this._activateTab(cell, 0);
		this._positionChart(cell, ev);
	}

	_activateTab(cell, i) {
		const chart = this._chart;

		if (!chart || chart.cell !== cell) {
			return;
		}

		chart.active = i;
		Array.from(chart.tabs.children).forEach((b, j) => b.classList.toggle('dch-active', j === i));

		chart.loading = !cell._chart_loaded[i];
		this._drawChart(cell._chart_data[i], cell._chart_loaded[i]);

		if (!cell._chart_loaded[i]) {
			this._loadChart(cell, i);
		}
	}

	// Fetch one tab's history in time chunks, newest first, redrawing as each lands.
	_loadChart(cell, tab_index) {
		if (!window.jQuery) {
			return;
		}

		const tab = cell._drawio_history[tab_index];
		const now = Math.floor(Date.now() / 1000);
		const period = this._time_period || {from: now - 3600, to: now};
		const from = period.from;
		const token = cell._chart_token;

		const done = () => {
			cell._chart_loaded[tab_index] = true;

			if (this._chart && this._chart.cell === cell && this._chart.active === tab_index) {
				this._chart.loading = false;
				this._drawChart(cell._chart_data[tab_index], true);
			}
		};

		// Page backwards by VALUE COUNT, not by time: each request returns the newest
		// `HISTORY_LIMIT` values down to `time_till`, and the next continues from the
		// oldest one received. Robust to throttled/sparse items where equal time slices
		// would come back empty or lopsided.
		const fetchPage = (time_till, round) => {
			if (cell._chart_token !== token) {
				return;
			}

			if (round >= this.HISTORY_MAX_ROUNDS || time_till < from) {
				done();

				return;
			}

			jQuery.ajax({
				url: 'zabbix.php?action=widget.drawio.history',
				method: 'POST',
				dataType: 'json',
				data: {itemids: tab.itemids, time_from: from, time_till, limit: this.HISTORY_LIMIT}
			}).done((resp) => {
				if (cell._chart_token !== token) {
					return;
				}

				const store = cell._chart_data[tab_index];
				const items = (resp && resp.items) || {};

				for (const id of Object.keys(items)) {
					if (!store[id]) {
						store[id] = {name: items[id].name, units: items[id].units, points: []};
					}

					// Each page is older than what we have — prepend to stay oldest-first.
					store[id].points = items[id].points.concat(store[id].points);
				}

				if (this._chart && this._chart.cell === cell && this._chart.active === tab_index) {
					this._drawChart(store, false);
				}

				const oldest = (resp && resp.oldest != null) ? resp.oldest : null;

				if (resp && resp.truncated && oldest !== null && oldest > from) {
					fetchPage(oldest - 1, round + 1);
				}
				else {
					done();
				}
			}).fail(done);
		};

		fetchPage(period.to, 0);
	}

	_positionChart(cell, ev) {
		const chart = this._chart;
		const rect = cell.getBoundingClientRect();
		const w = chart.el.offsetWidth || this.CHART_W;
		const h = chart.el.offsetHeight || this.CHART_H;
		const vw = document.documentElement.clientWidth;
		const vh = document.documentElement.clientHeight;

		let left = ev ? ev.clientX + 14 : rect.left;
		let top = ev ? ev.clientY + 14 : rect.bottom + 8;

		if (left + w > vw - 8) {
			left = Math.max(8, (ev ? ev.clientX : rect.right) - w - 14);
		}

		if (top + h > vh - 8) {
			top = Math.max(8, (ev ? ev.clientY : rect.top) - h - 14);
		}

		chart.el.style.left = left + 'px';
		chart.el.style.top = top + 'px';
	}

	_drawChart(store, loaded) {
		const chart = this._chart;

		if (!chart) {
			return;
		}

		const w = this.CHART_W;
		const h = this.CHART_H;
		const dpr = window.devicePixelRatio || 1;
		const canvas = chart.canvas;

		canvas.width = w * dpr;
		canvas.height = h * dpr;
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';

		const ctx = canvas.getContext('2d');

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		const dark = this._isChartDark();

		chart.el.classList.toggle('dch-dark', dark);

		const fg = dark ? '#c8d6e5' : '#33404d';
		const grid = dark ? 'rgba(200,214,229,0.13)' : 'rgba(51,64,77,0.12)';
		const axis = dark ? 'rgba(200,214,229,0.4)' : 'rgba(51,64,77,0.4)';

		const series = Object.keys(store || {})
			.map((id) => store[id])
			.filter((s) => s.points && s.points.length);

		if (!series.length) {
			ctx.fillStyle = fg;
			ctx.font = '12px system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(loaded ? 'No data' : 'Loading…', w / 2, h / 2);
			chart.legend.innerHTML = '';

			return;
		}

		const period = this._time_period;
		let xmin = period ? period.from : Infinity;
		let xmax = period ? period.to : -Infinity;

		if (!period) {
			series.forEach((s) => s.points.forEach((p) => {
				if (p[0] < xmin) xmin = p[0];
				if (p[0] > xmax) xmax = p[0];
			}));
		}

		const units = (series[0] && series[0].units) || '';

		let ymin = Infinity;
		let ymax = -Infinity;

		series.forEach((s) => s.points.forEach((p) => {
			if (p[1] < ymin) ymin = p[1];
			if (p[1] > ymax) ymax = p[1];
		}));

		if (ymin === ymax) {
			ymin -= 1;
			ymax += 1;
		}

		// Zero baseline for non-negative data (rates, counters) so the axis never
		// dips below 0; keep the data-driven range only when values sit far above 0.
		if (ymin >= 0 && ymin <= ymax - ymin) {
			ymin = 0;
		}

		// Snap the range to "nice" numbers so ticks land on 1/2/5·10ⁿ instead of
		// raw data extremes (…, 8.06e6, 5.11e6, …).
		const target_rows = 4;
		const step = this._niceNum((ymax - ymin) / target_rows, true);

		ymin = Math.floor(ymin / step) * step;
		ymax = Math.ceil(ymax / step) * step;

		const padL = 46;
		const padR = 10;
		const padT = 8;
		const padB = 20;
		const plotW = w - padL - padR;
		const plotH = h - padT - padB;
		const X = (t) => padL + (xmax === xmin ? 0 : (t - xmin) / (xmax - xmin)) * plotW;
		const Y = (v) => padT + (1 - (v - ymin) / (ymax - ymin)) * plotH;

		// Horizontal grid + Y labels.
		ctx.font = '10px system-ui, sans-serif';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'right';
		ctx.lineWidth = 1;

		const rows = Math.max(1, Math.round((ymax - ymin) / step));

		for (let i = 0; i <= rows; i++) {
			const v = ymin + step * i;
			const y = Y(v);

			ctx.strokeStyle = grid;
			ctx.beginPath();
			ctx.moveTo(padL, y);
			ctx.lineTo(w - padR, y);
			ctx.stroke();

			ctx.fillStyle = fg;
			ctx.fillText(this._fmtUnits(v, units), padL - 5, y);
		}

		// X labels (start / end of the period).
		const show_date = (xmax - xmin) > 2 * 86400;

		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillStyle = fg;
		ctx.fillText(this._fmtTime(xmin, show_date), padL, h - padB + 5);
		ctx.textAlign = 'right';
		ctx.fillText(this._fmtTime(xmax, show_date), w - padR, h - padB + 5);

		// Axes.
		ctx.strokeStyle = axis;
		ctx.beginPath();
		ctx.moveTo(padL, padT);
		ctx.lineTo(padL, padT + plotH);
		ctx.lineTo(w - padR, padT + plotH);
		ctx.stroke();

		// Series.
		ctx.lineJoin = 'round';

		series.forEach((s, si) => {
			ctx.strokeStyle = this.CHART_PALETTE[si % this.CHART_PALETTE.length];
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			s.points.forEach((p, i) => {
				const x = X(p[0]);
				const y = Y(p[1]);

				if (i === 0) {
					ctx.moveTo(x, y);
				}
				else {
					ctx.lineTo(x, y);
				}
			});
			ctx.stroke();
		});

		// Legend (HTML, with the latest value per series).
		chart.legend.innerHTML = '';

		series.forEach((s, si) => {
			const last = s.points[s.points.length - 1];
			const val = last ? this._fmtUnits(last[1], s.units) : '';
			const item = document.createElement('span');

			item.className = 'dch-leg';
			item.innerHTML = '<i style="background:' + this.CHART_PALETTE[si % this.CHART_PALETTE.length] + '"></i>'
				+ '<b></b><em></em>';
			item.querySelector('b').textContent = s.name;
			item.querySelector('em').textContent = val;
			chart.legend.appendChild(item);
		});
	}

	_hideChart() {
		clearTimeout(this._chart_hide_timer);
		this._chart_cell = null;

		if (this._chart) {
			this._chart.el.style.display = 'none';
			this._chart.cell = null;
		}
	}

	_destroyChart() {
		clearTimeout(this._chart_show_timer);
		clearTimeout(this._chart_hide_timer);

		if (this._chart) {
			this._chart.el.remove();
			this._chart = null;
		}

		this._chart_cell = null;
		this._chart_pending_cell = null;
	}

	_isChartDark() {
		const html = document.documentElement;
		const cs = html.getAttribute('color-scheme');

		if (cs === 'dark') {
			return true;
		}

		if (cs === 'light') {
			return false;
		}

		return /dark/.test(html.getAttribute('theme') || '');
	}

	_fmtNum(v) {
		const a = Math.abs(v);

		if (a !== 0 && (a >= 100000 || a < 0.01)) {
			return v.toPrecision(3);
		}

		return String(Math.round(v * 100) / 100);
	}

	// Nearest "nice" number (1/2/5/10 · 10ⁿ). `round` snaps to the closest such
	// number; otherwise rounds up. Used to place Y-axis ticks on round values.
	_niceNum(x, round) {
		if (!(x > 0)) {
			return 1;
		}

		const exp = Math.floor(Math.log10(x));
		const f = x / Math.pow(10, exp);
		let nf;

		if (round) {
			nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
		}
		else {
			nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
		}

		return nf * Math.pow(10, exp);
	}

	// Humanize a value with its item units, à la Zabbix: 1000-based SI prefixes
	// (K/M/G/…) for most units, 1024-based for bytes. Empty units → bare number.
	_fmtUnits(v, units) {
		if (!units) {
			return this._fmtNum(v);
		}

		const base = (units === 'B' || units === 'Bps') ? 1024 : 1000;
		const prefix = ['', 'K', 'M', 'G', 'T', 'P', 'E'];
		let val = v;
		let i = 0;

		while (Math.abs(val) >= base && i < prefix.length - 1) {
			val /= base;
			i++;
		}

		return this._fmtNum(val) + ' ' + prefix[i] + units;
	}

	_fmtTime(ts, show_date) {
		const d = new Date(ts * 1000);
		const p = (n) => (n < 10 ? '0' : '') + n;
		const hm = p(d.getHours()) + ':' + p(d.getMinutes());

		return show_date ? (p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + hm) : hm;
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
			+ 'function clean(p){var o={};if(p&&typeof p==="object"){'
			+ '["fill","stroke","strokeWidth","opacity","text","textAngle","animate","flow"].forEach(function(k){var v=p[k];'
			+ 'if(typeof v==="number"||typeof v==="string"||typeof v==="boolean")o[k]=v;});'
			// interact is a declarative object (hint/menu/links) — carried across the
			// sandbox as pure JSON (no code); the parent interprets known fields only.
			+ 'if(p.interact&&typeof p.interact==="object"){try{o.interact=JSON.parse(JSON.stringify(p.interact));}catch(e){}}'
			+ '}return o;}'
			+ 'function edg(e){return e===true?true:(Array.isArray(e)?e.filter(function(x){return typeof x==="string";}):false);}'
			+ 'function build(model){var ops=[],seq=0,byId={};model.forEach(function(c){byId[c.id]=c;});'
			+ 'function handle(id,info){var h={id:id,label:info?info.label:"",'
			+ 'bbox:info?info.bbox:{x:0,y:0,width:130,height:70},neighbors:(info&&info.neighbors)||[],'
			+ 'source:(info&&info.source)||null,target:(info&&info.target)||null};'
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
