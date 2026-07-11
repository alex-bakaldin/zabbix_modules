# Logrīks „Diagramma (draw.io / SVG)”

[English](README.md) | [Русский](README.ru.md) | [Srpski](README.sr.md) | [Polski](README.pl.md) | **Latviešu**

Zabbix informācijas paneļa logrīks, kas attēlo **draw.io / SVG diagrammu** un vada tās
elementus pēc monitoringa datiem, izmantojot vienu lietotāja skriptu.

Diagramma paliek *tīra un koplietojama* — tajā nekas netiek iestrādāts. Visa loģika
atrodas logrīka konfigurācijā: viens skripts saņem atrisinātos resursdatorus (ar
vienumiem un trigeriem) un CRUD API pār diagrammas šūnām un dara visu, ko vēlaties
(pārkrāso cauruli pēc slodzes, parāda vērtību, klonē veidni katrai atklātai vienībai…).

- **moduļa id:** `drawio` · **namespace:** `Drawio` · **js class:** `WidgetDrawio`

---

## Demo — tīkla karte

[Tīkla karte](docs/netmap.drawio), ko pilnībā vada viens sintētisku datu skripts
([docs/netmap.demo.js](docs/netmap.demo.js)): mezgla aizpildījums pēc slodzes, dzīvi
`cpu/mem/disk` (daudzrindu uzraksti), „karsta” mezgla pulsēšana, pelēks **izslēgts**
resursdators, **plūstošas** līnijas ar biezumu pēc datplūsmas un dzīvs throughput uz
mākoņiem — viss dzīvi informācijas panelī. Eksportētais draw.io SVG ir tēmas apzinīgs
(`light-dark()`), tāpēc nativi izskatās arī gaišajā Zabbix tēmā.

![Tīkla kartes demo](docs/netmap.gif)

---

## Iespējas

- Attēlo jebkuru no draw.io eksportētu (vai ar roku rakstītu) SVG, adresējot šūnas pēc
  draw.io `data-cell-id`.
- **Viens skripts** vada visu diagrammu; jūs saņemat datus un CRUD API un pats rakstāt
  loģiku (rīks pieredzējušiem lietotājiem).
- Skriptā tiek iesūtīti atbilstošo resursdatoru **vienumi un trigeri**, katrs ar
  saviem **tagiem**; katrs resursdators nes arī savus **tagus un atrisinātos
  lietotāja makro** (globālie + veidnes, ar piemērotām aizstāšanām) — sakritība pēc
  tagiem/makro, nevis atslēgu un nosaukumu parsēšana.
- **Draudzīgs LLD:** veidnes šūnas klonēšana katram atklātajam vienumam ar vienu
  izsaukumu (`cell.repeat(...)`), automātiski izkārtojot režģī.
- **Zina par saitēm:** šūnu var klonēt vai noņemt **kopā ar līnijām, kas to savieno
  ar kaimiņiem** — savienojamība tiek atgūta no SVG ģeometrijas, tāpēc mezgla klons
  pats izvelk savu savienotāju uz vecāku.
- **Animācija:** vērtības katrā atsvaidzināšanā vienmērīgi pāriet, un šūnas var
  nest pārlūka darbinātu animāciju (`pulse` / `blink` vai plūstošas svītras gar
  cauruli) — skripts to tikai pārslēdz, tāpēc smilškastē nekas necikls.
- **Fragmentēta glabāšana (chunking):** SVG un skripts tiek caurspīdīgi sadalīti vairākās
  `widget_field` rindās, tāpēc neviens no tiem nav ierobežots ar 64 KB.
- **Smilškaste un noturība pret DoS:** skripts darbojas izolētā iframe + Worker — bez
  piekļuves sīkfailiem/DOM/tīklam ar akreditācijas datiem, un ciklā iestrēgušu skriptu
  pārtrauc.
- **Rediģēšanas atbalsts:** diagramma tiek ielādēta pa failu ar tiešu priekšskatījumu,
  un skripta lauks ir CodeMirror redaktors ar sintakses izcelšanu, linteri un diagrammas
  šūnu id automātisko pabeigšanu — viss iekļauts modulī, darbojas bezsaistē.

---

## Instalēšana

Kopējiet moduli uz `modules/drawio` Zabbix frontendā un reģistrējiet to
(Administration → General → Modules → *Scan directory* → iespējot) vai izmantojot API:

```json
{"jsonrpc":"2.0","method":"module.create",
 "params":{"id":"drawio","relative_path":"modules/drawio","status":1},
 "id":1}
```

---

## Diagrammas sagatavošana

Uzzīmējiet diagrammu [draw.io / diagrams.net](https://app.diagrams.net) un
**eksportējiet to kā SVG**. Svarīgas ir divas lietas:

1. **Izslēdziet fontu iegulšanu.** Pēc noklusējuma draw.io iegulst fontus, un SVG
   uzpūšas (pat vienkārša diagramma var sasniegt ~115 KB). Bez fontiem — daži KB.
   Darbvirsmas CLI:

   ```bash
   drawio-export -f svg --embed-svg-fonts false -e -o out diagram.drawio
   ```

   (`-e` papildus iegulst avota kopiju, lai eksportētais SVG atkal atveras draw.io.)

2. **Šūnu id.** Mūsdienu draw.io ieraksta `data-cell-id="<mxCell id>"` uz katras šūnas
   `<g>` ietvara — tā skripts adresē elementus. Šie id ir necaurspīdīgi auto-id
   (piemēram, `1Y4-VilqHyjT-noTrS5i-97`); šūnu var atrast arī pēc redzamā **uzraksta**
   (`cells.byLabel('eth0')`), kas parasti ir ērtāk.

Ielādējiet iegūto SVG logrīka laukā **Diagram SVG** — izvēlieties failu (parādās
priekšskatījums) vai ielīmējiet avotu.

---

## Konfigurācija

| Lauks | Nozīme |
|-------|--------|
| **Diagram SVG** | eksportētais SVG (obligāts, fragmentēts) |
| **Script** | lietotāja skripts, kas vada diagrammu (fragmentēts) |
| **Host groups / Hosts** | resursdatoru izvēle ar šabloniem (globālie paneļi) |
| **Item patterns** | kurus vienumus atrisināt un iesūtīt |
| **Item tags** | filtrs pēc tagiem (And/Or) |
| **Override host** | dinamiskais/aizstājošais resursdators šablonu paneļiem |

### Rediģēšanas forma

![Widget edit form](docs/form.png)

- **Diagram** — izvēlieties eksportēto `.svg` failu, nevis to ielīmējiet; forma parāda
  sīktēla priekšskatījumu un `… KB, N cells` kopsavilkumu. Neapstrādātais SVG paliek
  pieejams sadaļā *Show / paste SVG source* manuālai rediģēšanai.
- **Script editor** — CodeMirror redaktors ar JavaScript sintakses izcelšanu, linteri
  (sintakses kļūdas tiek atzīmētas malā), iekavu saskaņošanu un automātisku aizvēršanu.
- **Id automātiskā pabeigšana** — iekšpus `cells.get('…')` / `cells.byLabel('…')`
  redaktors iesaka **šūnu id un uzrakstus, kas nolasīti no ielādētā SVG**; citviet tas
  piedāvā `cells` / `api` virsmu. Nospiediet `Ctrl-Space` jebkurā brīdī.

CodeMirror ir iekļauts modulī (`assets/*/vendor`) un tiek ielādēts tikai tad, kad forma
ir atvērta, tāpēc tas pilnībā darbojas bezsaistē un neko nepievieno citām lapām.

---

## Skripts

Līgums — skripta ķermenis izpildās kā `(hosts, cells, api)`:

### `hosts`
```js
[
  { host: 'Router A', hostid: '10105', tags: [ { tag, value }, … ],
    macros: { '{$SNMP_COMMUNITY}': 'public', '{$TEMP.CRIT}': '85', … },
    items:    [ { key, name, value, units, value_type, clock, tags: [ { tag, value }, … ] }, … ],
    triggers: [ { triggerid, description, priority, status, value, tags: [ { tag, value }, … ] }, … ] }
]
```

`macros` ir resursdatora **efektīvie** lietotāja makro, indeksēti pēc nosaukuma —
iekļauti globālie + veidnes makro, ar jau piemērotām resursdatora/veidnes
aizstāšanām (tās pašas vērtības, ko rāda resursdatora rediģēšanas forma). Slepenie
makro nenes vērtību.

```js
// piem. ņem slieksni no resursdatora makro, nevis cieti kodētu skaitli:
const crit = +hosts[0].macros['{$TEMP.CRIT}'] || 80;
```

### `cells` — CRUD pār diagrammas elementiem
```js
cells.get(id)        // handle | null
cells.byLabel(text)  // handle | null  (meklēšana pēc redzamā uzraksta)
cells.find(fn)       // handle | null  (fn saņem {id,label,bbox,neighbors})
cells.all            // [handle, …]
```
**handle**:
```js
handle.id           // data-cell-id
handle.label        // uzraksta teksts
handle.bbox         // { x, y, width, height }
handle.neighbors    // [id, …]  šūnas, kas ar šo savienotas ar savienotāju
handle.set(patch)   // patch: { fill, stroke, strokeWidth, opacity, text, animate, flow }
handle.clone({ id?, dx?, dy?, patch?, edges? })   // klons ar nobīdi; atgriež jaunu handle
handle.repeat(list, { cols, gap, edges }, fn)     // klons katram vienumam, režģī; fn(cell, item, i)
handle.remove({ edges? })
```

**`edges`** (izmantojot `clone` / `repeat` / `remove`) iedarbojas arī uz savienotājiem,
kas pieskaras šūnai — `true` visiem no tiem vai `[neighborId, …]`, lai aprobežotos ar
līnijām, kuru tālais gals nonāk pie šiem kaimiņiem. Klonējot katrs savienotājs tiek
pārmaršrutēts kā taisna līnija: tā tālais gals paliek vietā, bet tuvais gals seko
klonam, tāpēc klonu vēdeklis katrs saglabā savu līniju uz koplietoto vecāku.
Savienojamība tiek izsecināta no SVG ģeometrijas (nav vajadzīgs iegults draw.io
modelis); maršrutētie ceļa punkti kļūst taisni.

### `api` — palīgfunkcijas
```js
api.scale(v, inMin, inMax, outMin, outMax)   // lineāra kartēšana ar ierobežojumu
api.color(v, [[threshold, color], …], base)  // augstākā sasniegtā sliekšņa krāsa
api.grid(i, { cols, gap, w, h })             // → { dx, dy }
```

### Piemēri

**Krāsa pēc sliekšņa + vērtības teksts:**
```js
const it = {};
hosts.forEach(h => h.items.forEach(i => it[i.key] = i));

const r = it['demo.reactor'];
if (r) cells.get('reactor').set({
  fill: api.color(+r.value, [[50, '#e0b000'], [80, '#e05050']], '#3fa34d'),
  text: (+r.value).toFixed(1) + ' °C'
});
```

**Līnijas biezums pēc kanāla slodzes:**
```js
const net = it['net.if.in[eth0]'];
if (net) cells.byLabel('eth0').set({ strokeWidth: api.scale(+net.value, 0, 1e9, 2, 16) });
```

**LLD — veidnes klonēšana katram atklātajam vienumam:**
```js
const nums = hosts.flatMap(h => h.items).filter(i => i.value != null && !isNaN(+i.value));

cells.get('tmpl').repeat(nums, { cols: 4, gap: 12 }, (cell, item) => {
  const x = +item.value;
  cell.set({
    fill: api.color(x, [[40, '#e0b000'], [70, '#e05050']], '#2b7a3d'),
    text: item.name + ': ' + x.toFixed(1) + '°C'
  });
});
```

**Sakritība pēc taga, nevis atslēgas:** katram vienumam, trigerim un resursdatoram ir savi `tags`.

```js
const tagged = (host, name) => host.items.find(i => i.tags.some(t => t.tag === 'port' && t.value === name));

hosts.forEach(h => {
  const up = tagged(h, 'wan');
  if (up) cells.byLabel('WAN').set({ strokeWidth: api.scale(+up.value, 0, 1e9, 2, 16) });
});
```

**Klonēt veidni kopā ar savienotāju uz vecāku (LLD vēdeklis):**

```js
// 'node' ir veidnes šūna, savienota ar līniju uz 'core'. Katrs klons iegūst savu
// līniju uz 'core'; slots 0 ir pati veidne uz vietas (tās līnija jau ir).
const nums = hosts.flatMap(h => h.items).filter(i => !isNaN(+i.value));

cells.get('node').repeat(nums, { cols: 4, gap: 20, edges: ['core'] }, (cell, item) => {
  cell.set({ text: item.name, fill: api.color(+item.value, [[70, '#e05050']], '#2b7a3d') });
});
```

### Animācija

Divi `patch` lauki pievieno pārlūka darbinātu animāciju. Skripts tos iestata vienreiz
katrā atsvaidzināšanā; pārlūks tos uztur dzīvus starp atsvaidzināšanām, tāpēc smilškastē
nekas necikls (garantija pret DoS paliek neskarta). Turklāt katra vērtības maiņa jau
notiek vienmērīgi (fill/stroke/stroke-width/opacity, ~0,6 s) — caurule kļūst biezāka un
krāsa plūst pati no sevis.

- `animate: 'pulse' | 'blink' | 'none'` — pulsē (vienmērīgi) vai mirgo (soļiem) visu
  šūnu; `'none'` (vai izlaišana) aptur.
- `flow: <skaitlis ar zīmi>` — plūstošas svītras gar šūnas līnijām; zīme ir virziens,
  lielums ir ātrums; `0`/`false` aptur.

```js
// Trauksmes šūna pulsē, kamēr trigeris ir stāvoklī PROBLEM.
const problem = hosts.some(h => h.triggers.some(t => t.value === '1'));
cells.byLabel('pump').set({ animate: problem ? 'pulse' : 'none' });

// Svītras plūst gar cauruli, ātrāk pie kanāla slodzes.
const net = it['net.if.in[eth0]'];
if (net) cells.byLabel('eth0').set({ flow: api.scale(+net.value, 0, 1e9, 0.3, 4) });
```

> Tā kā īstais SVG saglabājas starp atsvaidzināšanām, animācija paliek ieslēgta, līdz
> skripts to izslēdz — vienmēr iestatiet „izslēgts” zaru (`animate:'none'`, `flow:0`),
> kad nosacījums vairs neizpildās.

### Atkļūdošana

Skripts ir parasts JavaScript, ko darbina pārlūks, tāpēc ir pieejami visi izstrādātāja
rīki (devtools) — ar divām lietām, kas jāzina:

- Tas izpildās smilškastes Worker iekšienē, tāpēc **Sources** cilnē tas parādās kā
  `blob:`/VM ieraksts. `console.log(...)` no skripta izdrukā konsolē, un `debugger;`
  paziņojums aptur izpildi tur.
- Evaluators pārtver skripta izņēmumus, lai paliktu izolēts, tāpēc citādi nepārtverta
  kļūda vienkārši pazustu. Logrīks to atkal parāda kā
  `[drawio] user script error: <stack>` konsolē — un jebkuras operācijas, kas
  pierakstītas pirms izmešanas, joprojām tiek piemērotas.

---

## Kā tas darbojas

1. Kontrolieris atrisina izvēlētos vienumus (pēdējā vērtība no vēstures) un to
   resursdatoru trigerus, sagrupē tos `hosts` un atgriež kopā ar SVG un skriptu.
2. Frontends iesūta SVG, izveido serializētu šūnu modeli (`{id, label, bbox}` katrai
   šūnai) un nodod to kopā ar datiem un skriptu smilškastei.
3. Smilškaste izpilda skriptu; tā CRUD izsaukumi **pieraksta operācijas**
   (`set` / `clone` / `remove`).
4. Logrīks piemēro šīs operācijas reālajam SVG.

Skripts nekad tieši neskar DOM — tas strādā ar serializēto modeli un atgriež operācijas,
kas arī padara to izolējamu.

---

## Fragmentēšana (chunking)

`Diagram SVG` un `Script` tiek glabāti caur `CWidgetFieldChunkedText`, kas sadala vērtību
(pa rakstzīmju robežām, zem kolonnas baitu ierobežojuma) `diagram.0`, `diagram.1`, … un
atkal savieno ielādes laikā. Diagrammas un skripti mēdz augt, tāpēc fragmentēšana ir
iebūvēta jau no sākuma, nevis pievienota, kad ierobežojums ir sasniegts.

---

## Drošības modelis

Lietotāja skripti ir patvaļīgs JavaScript, ko raksta tas, kurš var rediģēt paneli. Tie
darbojas **izolētā `<iframe sandbox="allow-scripts">`** (bez `allow-same-origin` →
opaque origin), ar evaluatoru, kas izvietots **Worker** iekšā šajā iframe:

- **Konfidencialitāte** — opaque origin bloķē piekļuvi vecāka sīkfailiem, DOM un
  pieprasījumiem ar akreditācijas datiem. Pārbaudīts: no smilškastes `parent.location.href`
  un `parent.document.cookie` abi izmet `SecurityError`.
- **Pieejamība (DoS)** — skripts darbojas savā Worker pavedienā; sargs to pārtrauc pēc
  ~1 s, tāpēc bezgalīgs cikls nevar iesaldēt paneli. Pārbaudīts: skripts `while(true){}`
  atstāj lapu pilnībā atsaucīgu, bet diagrammu bez piemērotām izmaiņām.

Ja pārlūks atsaka Worker izveidi izolētā ietvarā, logrīks atgriežas pie inline izpildes
(izolācija saglabājas, bet bez garantijas pret DoS).

> Piezīme: šis ir rīks pieredzējušiem lietotājiem. Attiecīgi ierobežojiet, kurš drīkst
> rediģēt šādus paneļus.
