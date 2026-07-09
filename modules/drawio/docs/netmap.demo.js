// ---- Netmap demo: synthetic data brings the map to life (self-contained) ----
// Paste into the widget's Script field. Values are smooth sine waves over Date.now()
// (period ~6s) so the map "breathes" on each refresh; flow/pulse animate between them.
var t = Date.now() / 1000, P = 6;
function wv(s) { var p = (t / P) * 2 * Math.PI; return Math.max(0, Math.min(1, 0.5 + 0.34 * Math.sin(p + s) + 0.16 * Math.sin(3 * p + s * 1.7))); }
function pct(x) { return Math.round(x * 100); }
function nfill(load) { return api.color(load, [[0.65, '#e6b41f'], [0.85, '#e04b25']], '#37c13a'); }

// NODES: fill by load, live cpu/mem/disk text (multi-line), pulse when hot
var META = {
  n65: ['192.168.0.65', 'Novi Sad', '1d 08:25:38'], n66: ['192.168.0.66', 'Level1', '1d 08:28:18'],
  n1: ['192.168.0.1', 'Hetzner', '1d 08:41:33'], n129: ['192.168.0.129', 'N-Kamsk', '1d 08:35:11'],
  n193: ['192.168.0.193', 'Suharevo', '1d 08:33:41']
};
Object.keys(META).forEach(function (id, i) {
  var c = cells.get(id); if (!c) return;
  var cpu = pct(wv(i + 1)), mem = pct(wv(i + 9)), disk = pct(wv(i + 4)), load = Math.max(cpu, disk) / 100, m = META[id];
  c.set({
    fill: nfill(load), opacity: 1, animate: load >= 0.85 ? 'pulse' : 'none',
    text: m[0] + '\ncpu: ' + cpu + '% mem: ' + mem + '% disk: ' + disk + '%\n' + m[1] + '\n' + m[2]
  });
});
var lvl2 = cells.get('n67'); if (lvl2) lvl2.set({ fill: nfill(wv(30)), animate: 'none' });
var down = cells.get('n194'); if (down) down.set({ fill: '#c9c9c9', opacity: 0.5, animate: 'none', text: '192.168.0.194\nLevel2 · DOWN' });

// EDGES: colour + thickness + flowing dashes by traffic (some reversed); down link idle
['e_67_65','e_66_65','e_65_ctr','e_65_cc','e_65_129','e_65_1','e_65_193','e_129_1','e_1_193','e_129_193','e_129_cbl','e_193_cbr'].forEach(function (id, i) {
  var e = cells.get(id); if (!e) return;
  var load = wv(i * 1.3 + 20), dir = (i % 3 === 0) ? -1 : 1;
  e.set({ stroke: api.color(load, [[0.6, '#e0a020'], [0.85, '#e04020']], '#4a90d0'), strokeWidth: api.scale(load, 0, 1, 2, 11), flow: dir * api.scale(load, 0, 1, 0.4, 5) });
});
var e194 = cells.get('e_194_193'); if (e194) e194.set({ stroke: '#b0b0b0', strokeWidth: 2, flow: 0 });

// CLOUDS: live throughput text (multi-line)
function mbps(x) { return (x * 40).toFixed(1); }
[['cloud_tr', wv(50)], ['cloud_c', wv(51)], ['cloud_bl', wv(52)], ['cloud_br', wv(53)]].forEach(function (p) {
  var c = cells.get(p[0]); if (c) c.set({ text: '↓ ' + mbps(p[1]) + ' Mbps\n↑ ' + mbps(p[1] * 0.6) + ' Mbps' });
});
