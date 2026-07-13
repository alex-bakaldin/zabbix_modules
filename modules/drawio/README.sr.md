# Vidžet „Dijagram (draw.io / SVG)“

[English](README.md) | [Русский](README.ru.md) | **Srpski** | [Polski](README.pl.md) | [Latviešu](README.lv.md)

Vidžet Zabbix kontrolne table koji prikazuje **draw.io / SVG dijagram** i upravlja
njegovim elementima na osnovu podataka monitoringa pomoću jedne korisničke skripte.

Dijagram ostaje *čist i pogodan za deljenje* — u njega se ništa ne ugrađuje. Sva
logika živi u podešavanjima vidžeta: jedna skripta dobija razrešene hostove (sa
stavkama i okidačima) i CRUD API nad ćelijama dijagrama i radi šta god poželite
(preboji cev prema opterećenju, prikaži vrednost, kloniraj šablon po svakom
otkrivenom entitetu…).

- **id modula:** `drawio` · **namespace:** `Drawio` · **js class:** `WidgetDrawio`

---

## Demo — mrežna mapa

[Mrežna mapa](docs/netmap.drawio) kojom u potpunosti upravlja jedna skripta sa
sintetičkim podacima ([docs/netmap.demo.js](docs/netmap.demo.js)): boja čvora prema
opterećenju, uživo `cpu/mem/disk` (višelinijske oznake), pulsiranje „vrućeg” čvora,
zasivljeni **ugašeni** host, **tekuće** linije sa debljinom prema saobraćaju i uživo
throughput na oblacima — sve uživo na kontrolnoj tabli. Izvezeni draw.io SVG je svestan teme (`light-dark()`),
pa se nativno prikazuje i u svetloj Zabbix temi.

![Demo mrežne mape](docs/netmap.gif)

---

## Mogućnosti

- Prikaz bilo kog SVG-a izvezenog iz draw.io (ili ručno napisanog), sa adresiranjem
  ćelija preko `data-cell-id` iz draw.io.
- **Jedna skripta** upravlja celim dijagramom; dobijate podatke i CRUD API i sami
  pišete logiku (alat za napredne korisnike).
- U skriptu se ubacuju **stavke i okidači** pronađenih hostova, svaki sa svojim
  **tagovima**; svaki host nosi i sopstvene **tagove i razrešene korisničke makroe**
  (globalne + template, sa primenjenim preklapanjima) — poklapanje po tagovima/makroima
  umesto parsiranja ključeva i imena.
- **Prijateljski prema LLD:** kloniranje ćelije-šablona po svakoj otkrivenoj stavki
  jednim pozivom (`cell.repeat(...)`), sa automatskim rasporedom u mreži.
- **Svesno veza:** ćeliju možete klonirati ili ukloniti **zajedno sa linijama koje
  je povezuju sa susedima** — povezanost se rekonstruiše iz geometrije SVG-a, pa
  klon čvora sam povlači svoj konektor ka roditelju.
- **Animacija:** vrednosti se glatko prelivaju pri svakom osvežavanju, a ćelije
  mogu nositi animaciju koju pokreće pregledač (`pulse` / `blink` ili tekuće crtice
  duž cevi) — skripta je samo uključuje/isključuje, pa se u izolaciji ništa ne vrti.
- **Skladištenje u delovima (chunking):** SVG i skripta se transparentno dele na više
  `widget_field` redova, pa nijedno nije ograničeno na 64 KB.
- **Izolovano i otporno na DoS:** skripta se izvršava u izolovanom iframe + Worker —
  bez pristupa kolačićima/DOM-u/mreži sa akreditivima, a skripta u petlji se prekida.
- **Potpomognuto uređivanje:** dijagram se učitava iz fajla uz živi pregled, a polje
  skripte je CodeMirror editor sa isticanjem sintakse, linterom i automatskim
  dovršavanjem id-ova ćelija dijagrama — sve je ugrađeno (vendored), radi van mreže.

---

## Instalacija

Kopirajte modul u `modules/drawio` Zabbix frontenda i registrujte ga
(Administration → General → Modules → *Scan directory* → omogući) ili preko API-ja:

```json
{"jsonrpc":"2.0","method":"module.create",
 "params":{"id":"drawio","relative_path":"modules/drawio","status":1},
 "id":1}
```

---

## Priprema dijagrama

Nacrtajte dijagram u [draw.io / diagrams.net](https://app.diagrams.net) i
**izvezite ga kao SVG**. Dve stvari su bitne:

1. **Isključite ugrađivanje fontova.** Podrazumevano draw.io ugrađuje fontove i SVG
   naraste (i trivijalan dijagram može dostići ~115 KB). Bez fontova — nekoliko KB.
   U desktop CLI-ju:

   ```bash
   drawio-export -f svg --embed-svg-fonts false -e -o out diagram.drawio
   ```

   (`-e` dodatno ugrađuje kopiju izvora tako da se izvezeni SVG ponovo otvara u draw.io.)

2. **Id-ovi ćelija.** Savremeni draw.io upisuje `data-cell-id="<mxCell id>"` na `<g>`
   omotač svake ćelije — tako skripta adresira elemente. Ti id-ovi su neprozirni
   auto-id-ovi (npr. `1Y4-VilqHyjT-noTrS5i-97`); ćeliju možete naći i po vidljivoj
   **oznaci** (`cells.byLabel('eth0')`), što je obično zgodnije.

3. **Svetla / tamna tema.** draw.io izvozi boje zavisne od teme kao CSS funkciju
   `light-dark(tamna, svetla)` i postavlja `color-scheme: light dark` na `<svg>` —
   zbog čega bi sam SVG pratio temu **operativnog sistema**, a ne Zabbix-a. Vidžet to
   ispravlja: čita aktivnu šemu iz atributa `<html color-scheme>` koji Zabbix postavlja
   i nameće je SVG-u, pa se automatske boje dijagrama (tekst, oznake, gradijenti)
   poklapaju sa svetlom ili tamnom Zabbix temom. U praksi:

   - Držite **tekst i oznake na automatskoj boji** draw.io-a (ne menjajte boju fonta)
     da ostanu čitljivi u obe teme.
   - Boje zadate **eksplicitno** — fiksni fill/stroke u dijagramu ili hex iz
     `set({fill: '#e05050'})` u skripti — doslovne su i iste u obe teme. To je obično
     ono što želite za statusne boje (crvena = vruće bez obzira na temu).
   - Obe teme možete pregledati pre postavljanja pomoću prekidača u
     [`tools/preview.mjs`](tools/README.md).

Učitajte dobijeni SVG u polje vidžeta **Diagram SVG** — izaberite fajl (pojavljuje se
pregled) ili nalepite izvor.

---

## Podešavanje

| Polje | Namena |
|-------|--------|
| **Diagram SVG** | izvezeni SVG (obavezno, deli se na delove) |
| **Script** | korisnička skripta koja upravlja dijagramom (deli se na delove) |
| **Host groups / Hosts** | izbor hostova preko šablona (globalne table) |
| **Item patterns** | koje stavke razrešiti i ubaciti |
| **Item tags** | filter po tagovima (And/Or) |
| **Override host** | dinamički/override host za šablonske table |

### Forma za uređivanje

![Widget edit form](docs/form.png)

- **Diagram** — izaberite izvezeni `.svg` fajl umesto da ga lepite; forma prikazuje
  umanjeni pregled i sažetak `… KB, N cells`. Sirovi SVG ostaje dostupan pod
  *Show / paste SVG source* za ručne izmene.
- **Script editor** — CodeMirror editor sa isticanjem JavaScript sintakse, linterom
  (sintaksne greške se označavaju na margini), uparivanjem i automatskim zatvaranjem
  zagrada.
- **Dovršavanje id-ova** — unutar `cells.get('…')` / `cells.byLabel('…')` editor
  predlaže **id-ove i oznake ćelija parsirane iz učitanog SVG-a**; drugde nudi
  `cells` / `api` površinu. Pritisnite `Ctrl-Space` u bilo kom trenutku.

CodeMirror je ugrađen unutar modula (`assets/*/vendor`) i učitava se samo dok je forma
otvorena, pa u potpunosti radi van mreže i ništa ne dodaje ostalim stranicama.

---

## Skripta

Ugovor — telo skripte se izvršava kao `(hosts, cells, api)`:

### `hosts`
```js
[
  { host: 'Router A', hostid: '10105', tags: [ { tag, value }, … ],
    macros: { '{$SNMP_COMMUNITY}': 'public', '{$TEMP.CRIT}': '85', … },
    items:    [ { key, name, value, units, value_type, clock, tags: [ { tag, value }, … ] }, … ],
    triggers: [ { triggerid, description, priority, status, value, tags: [ { tag, value }, … ] }, … ] }
]
```

`macros` su **efektivni** korisnički makroi hosta indeksirani po imenu — uključujući
globalne + template makroe, sa već primenjenim preklapanjima hosta/template-a (iste
vrednosti koje prikazuje forma za uređivanje hosta). Tajni makroi ne nose vrednost.

```js
// npr. uzmi prag iz makroa hosta umesto tvrdo kodiranog broja:
const crit = +hosts[0].macros['{$TEMP.CRIT}'] || 80;
```

### `cells` — CRUD nad elementima dijagrama
```js
cells.get(id)        // handle | null
cells.byLabel(text)  // handle | null  (pretraga po vidljivoj oznaci)
cells.find(fn)       // handle | null  (fn dobija {id,label,bbox,neighbors})
cells.all            // [handle, …]
```
**handle**:
```js
handle.id           // data-cell-id
handle.label        // tekst oznake
handle.bbox         // { x, y, width, height }
handle.neighbors    // [id, …]  ćelije povezane sa ovom konektorom
handle.set(patch)   // patch: { fill, stroke, strokeWidth, opacity, text, textAngle, animate, flow }
handle.clone({ id?, dx?, dy?, patch?, edges? })   // klon sa pomerajem; vraća novi handle
handle.repeat(list, { cols, gap, edges }, fn)     // klon po svakoj stavci, u mreži; fn(cell, item, i)
handle.remove({ edges? })
```

**`edges`** (na `clone` / `repeat` / `remove`) deluje i na konektore koji dodiruju
ćeliju — `true` za sve njih, ili `[neighborId, …]` da se ograniči na linije čiji
udaljeni kraj završava na tim susedima. Pri kloniranju, svaki konektor se
preusmerava kao prava linija: njegov udaljeni kraj ostaje na mestu, a bliži kraj
prati klon, pa lepeza klonova zadržava svaku svoju liniju ka zajedničkom roditelju.
Povezanost se izvodi iz geometrije SVG-a (nije potreban ugrađeni draw.io model);
usmerene prelomne tačke postaju prave.

### `api` — pomoćne funkcije
```js
api.scale(v, inMin, inMax, outMin, outMax)   // linearno mapiranje sa ograničenjem
api.color(v, [[threshold, color], …], base)  // boja najvišeg dostignutog praga
api.grid(i, { cols, gap, w, h })             // → { dx, dy }
api.units(v, unit, decimals = 2)             // humanizovano, sa SI/binarnim prefiksom
```

`api.units` prati formatiranje samog Zabbix-a: **bajtovi** (`B`, `Bps`) skaliraju se
po **1024**, sve ostalo — uključujući **bitove** (`bps`, `b`) — po **1000**. Prateće
nule se uklanjaju. Primeri: `api.units(1536, 'B')` → `"1.5 KB"`,
`api.units(2500000, 'bps')` → `"2.5 Mbps"`, `api.units(512, 'B')` → `"512 B"`.
Podržane su i specijalne Zabbix jedinice, pa `item.units` možete proslediti direktno:
`uptime` i `s` postaju trajanje (`api.units(174820, 'uptime')` → `"2 days, 00:33:40"`,
`api.units(3661, 's')` → `"1h 1m 1s"`), `unixtime` datum, a `%`/`ms`/`rpm`/`RPM` se ne
skaliraju — `api.units(+item.value, item.units)`.

### Primeri

**Boja po pragu + tekst vrednosti:**
```js
const it = {};
hosts.forEach(h => h.items.forEach(i => it[i.key] = i));

const r = it['demo.reactor'];
if (r) cells.get('reactor').set({
  fill: api.color(+r.value, [[50, '#e0b000'], [80, '#e05050']], '#3fa34d'),
  text: (+r.value).toFixed(1) + ' °C'
});
```

**Debljina linije prema opterećenju kanala:**
```js
const net = it['net.if.in[eth0]'];
if (net) cells.byLabel('eth0').set({ strokeWidth: api.scale(+net.value, 0, 1e9, 2, 16) });
```

**LLD — kloniranje šablona po svakoj otkrivenoj stavki:**
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

**Poklapanje po tagu umesto ključa:** svaka stavka, okidač i host nose svoje `tags`.

```js
const tagged = (host, name) => host.items.find(i => i.tags.some(t => t.tag === 'port' && t.value === name));

hosts.forEach(h => {
  const up = tagged(h, 'wan');
  if (up) cells.byLabel('WAN').set({ strokeWidth: api.scale(+up.value, 0, 1e9, 2, 16) });
});
```

**Kloniranje šablona zajedno sa konektorom ka roditelju (LLD lepeza):**

```js
// 'node' je ćelija-šablon povezana linijom sa 'core'. Svaki klon dobija svoju
// liniju ka 'core'; slot 0 je sam šablon na mestu (njegova linija već postoji).
const nums = hosts.flatMap(h => h.items).filter(i => !isNaN(+i.value));

cells.get('node').repeat(nums, { cols: 4, gap: 20, edges: ['core'] }, (cell, item) => {
  cell.set({ text: item.name, fill: api.color(+item.value, [[70, '#e05050']], '#2b7a3d') });
});
```

### Animacija

Dva `patch` polja pridružuju animaciju koju pokreće pregledač. Skripta ih postavi
jednom po osvežavanju; pregledač ih održava u životu između osvežavanja, pa se u
izolaciji ništa ne vrti u petlji (garancija protiv DoS-a ostaje netaknuta). Uz to,
svaka promena vrednosti već prelazi glatko (fill/stroke/stroke-width/opacity, ~0.6 s)
— cev se sama zadeblja, a boja se preliva.

- `animate: 'pulse' | 'blink' | 'none'` — pulsiranje (glatko) ili treptanje (u
  koracima) cele ćelije; `'none'` (ili izostavljanje) ga zaustavlja.
- `flow: <broj sa znakom>` — tekuće crtice duž linija ćelije; znak je smer, veličina
  je brzina; `0`/`false` ih zaustavlja.
- `textAngle: <stepeni> | 'edge'` — rotira oznaku ćelije. `'edge'` je postavlja
  **paralelno sa linijom konektora** (ugao iz geometrije linije, sa okretanjem da
  tekst nikad ne bude naopako) — zgodno za oznake na vezi, npr. `Rx/Tx`.

```js
// Ćelija-alarm pulsira dok je okidač u stanju PROBLEM.
const problem = hosts.some(h => h.triggers.some(t => t.value === '1'));
cells.byLabel('pump').set({ animate: problem ? 'pulse' : 'none' });

// Crtice teku duž cevi, brže sa opterećenjem kanala.
const net = it['net.if.in[eth0]'];
if (net) cells.byLabel('eth0').set({ flow: api.scale(+net.value, 0, 1e9, 0.3, 4) });
```

> Pošto stvarni SVG opstaje između osvežavanja, animacija ostaje uključena dok je
> skripta ne isključi — uvek postavite „isključenu“ granu (`animate:'none'`, `flow:0`)
> kada uslov prestane da važi.

### Otklanjanje grešaka

Skripta je običan JavaScript koji izvršava pregledač, pa važe svi alati za
programere (devtools) — uz dve stvari koje treba znati:

- Izvršava se unutar Worker-a izolacije, pa se u **Sources** pojavljuje kao
  `blob:`/VM stavka. `console.log(...)` iz skripte ispisuje u konzolu, a naredba
  `debugger;` tu pauzira izvršavanje.
- Evaluator hvata izuzetke skripte kako bi ostao izolovan, pa bi neuhvaćena greška
  inače nestala. Vidžet je ponovo iznosi na površinu kao
  `[drawio] user script error: <stack>` u konzoli — a sve operacije
  zabeležene pre izuzetka i dalje se primenjuju.

---

## Kako radi

1. Kontroler razrešava izabrane stavke (poslednja vrednost iz istorije) i okidače
   njihovih hostova, grupiše ih u `hosts` i vraća zajedno sa SVG-om i skriptom.
2. Frontend ubacuje SVG, gradi serijalizovani model ćelija (`{id, label, bbox}` po
   ćeliji) i predaje ga, sa podacima i skriptom, izolovanom okruženju.
3. Izolovano okruženje izvršava skriptu; njeni CRUD pozivi **beleže operacije**
   (`set` / `clone` / `remove`).
4. Vidžet primenjuje te operacije na stvarni SVG.

Skripta nikada ne dira DOM direktno — radi sa serijalizovanim modelom i vraća
operacije, što je i čini pogodnom za izolaciju.

---

## Deljenje na delove (chunking)

`Diagram SVG` i `Script` se čuvaju preko `CWidgetFieldChunkedText`, koji deli vrednost
(po granicama znakova, ispod bajtovskog ograničenja kolone) na `diagram.0`,
`diagram.1`, … i ponovo spaja pri učitavanju. Dijagrami i skripte imaju običaj da
rastu, pa je deljenje ugrađeno od početka, a ne dodato kada se dostigne ograničenje.

---

## Model bezbednosti

Korisničke skripte su proizvoljan JavaScript, koji piše onaj ko može da uređuje tablu.
Izvršavaju se u **izolovanom `<iframe sandbox="allow-scripts">`** (bez `allow-same-origin`
→ opaque origin), sa evaluatorom smeštenim u **Worker** unutar tog iframe-a:

- **Poverljivost** — opaque origin blokira pristup kolačićima roditelja, DOM-u i
  zahtevima sa akreditivima. Provereno: iz izolacije `parent.location.href` i
  `parent.document.cookie` oboje bacaju `SecurityError`.
- **Dostupnost (DoS)** — skripta se izvršava u sopstvenoj niti Worker-a; nadzornik je
  prekida nakon ~1 s, pa beskonačna petlja ne može da zamrzne tablu. Provereno:
  skripta `while(true){}` ostavlja stranicu potpuno responzivnom, a dijagram bez
  primenjenih izmena.

Ako pregledač odbije Worker unutar izolovanog okvira, vidžet se vraća na inline
izvršavanje (izolacija ostaje, ali bez garancije protiv DoS-a).

> Napomena: ovo je alat za napredne korisnike. U skladu s tim ograničite ko sme da
> uređuje ovakve table.
