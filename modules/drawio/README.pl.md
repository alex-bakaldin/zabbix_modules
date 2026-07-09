# Widget „Diagram (draw.io / SVG)”

[English](README.md) | [Русский](README.ru.md) | [Srpski](README.sr.md) | **Polski** | [Latviešu](README.lv.md)

Widget pulpitu Zabbix, który renderuje **diagram draw.io / SVG** i steruje jego
elementami na podstawie danych monitoringu za pomocą jednego skryptu użytkownika.

Diagram pozostaje *czysty i gotowy do udostępniania* — nic nie jest w nim zaszywane.
Cała logika mieści się w konfiguracji widgetu: jeden skrypt otrzymuje rozwiązane
hosty (z elementami i wyzwalaczami) oraz API CRUD nad komórkami diagramu i robi, co
tylko zechcesz (przekoloruj rurę wg obciążenia, pokaż wartość, sklonuj szablon dla
każdej wykrytej encji…).

- **id modułu:** `drawio` · **namespace:** `Drawio` · **js class:** `WidgetDrawio`

---

## Demo — mapa sieci

[Mapa sieci](docs/netmap.drawio) sterowana w całości jednym skryptem na danych
syntetycznych ([docs/netmap.demo.js](docs/netmap.demo.js)): kolor węzła wg obciążenia,
na żywo `cpu/mem/disk` (wielolinijkowe etykiety), pulsowanie „gorącego” węzła, wyszarzony
**wyłączony** host, **płynące** łącza o grubości wg ruchu oraz throughput na żywo na
chmurach — wszystko na żywo na pulpicie. Wyeksportowany SVG z draw.io jest świadomy
motywu (`light-dark()`), więc renderuje się natywnie także w jasnym motywie Zabbix.

![Demo mapy sieci](docs/netmap.gif)

---

## Funkcje

- Renderowanie dowolnego SVG wyeksportowanego z draw.io (lub napisanego ręcznie), z
  adresowaniem komórek przez `data-cell-id` z draw.io.
- **Jeden skrypt** steruje całym diagramem; otrzymujesz dane i API CRUD i sam piszesz
  logikę (narzędzie dla zaawansowanych).
- Do skryptu wstrzykiwane są **elementy i wyzwalacze** dopasowanych hostów, każdy
  ze swoimi **tagami**; każdy host niesie też własne **tagi i rozwiązane makra
  użytkownika** (globalne + szablonowe, z zastosowanymi nadpisaniami) — dopasowanie
  po tagach/makrach zamiast parsowania kluczy i nazw.
- **Przyjazne dla LLD:** klonowanie komórki-szablonu dla każdego wykrytego elementu
  jednym wywołaniem (`cell.repeat(...)`), z automatycznym układem w siatce.
- **Świadome połączeń:** komórkę można sklonować lub usunąć **razem z liniami, które
  łączą ją z sąsiadami** — łączność jest odtwarzana z geometrii SVG, więc klon węzła
  sam prowadzi swój łącznik do rodzica.
- **Animacja:** wartości płynnie przechodzą przy każdym odświeżeniu, a komórki mogą
  nieść animację uruchamianą przez przeglądarkę (`pulse` / `blink` lub płynące
  kreski wzdłuż rury) — skrypt tylko ją przełącza, więc nic nie zapętla się w piaskownicy.
- **Przechowywanie fragmentowe (chunking):** SVG i skrypt są przezroczyście dzielone
  na kilka wierszy `widget_field`, więc żadne z nich nie jest ograniczone do 64 KB.
- **Piaskownica i odporność na DoS:** skrypt działa w izolowanym iframe + Worker — bez
  dostępu do ciasteczek/DOM/sieci z poświadczeniami, a zapętlony skrypt jest przerywany.

---

## Instalacja

Skopiuj moduł do `modules/drawio` frontendu Zabbix i zarejestruj go
(Administration → General → Modules → *Scan directory* → włącz) lub przez API:

```json
{"jsonrpc":"2.0","method":"module.create",
 "params":{"id":"drawio","relative_path":"modules/drawio","status":1},
 "id":1}
```

---

## Przygotowanie diagramu

Narysuj diagram w [draw.io / diagrams.net](https://app.diagrams.net) i
**wyeksportuj go jako SVG**. Ważne są dwie rzeczy:

1. **Wyłącz osadzanie czcionek.** Domyślnie draw.io osadza czcionki i SVG puchnie
   (nawet trywialny diagram może osiągnąć ~115 KB). Bez czcionek — kilka KB.
   W CLI wersji desktop:

   ```bash
   drawio-export -f svg --embed-svg-fonts false -e -o out diagram.drawio
   ```

   (`-e` dodatkowo osadza kopię źródła, dzięki czemu wyeksportowany SVG ponownie
   otwiera się w draw.io.)

2. **Identyfikatory komórek.** Nowoczesny draw.io zapisuje `data-cell-id="<mxCell id>"`
   na opakowaniu `<g>` każdej komórki — tak skrypt adresuje elementy. Te id to
   nieprzejrzyste auto-id (np. `1Y4-VilqHyjT-noTrS5i-97`); komórkę można też dopasować
   po widocznej **etykiecie** (`cells.byLabel('eth0')`), co zwykle jest wygodniejsze.

Wklej powstały SVG do pola widgetu **Diagram SVG**.

---

## Konfiguracja

| Pole | Przeznaczenie |
|------|---------------|
| **Diagram SVG** | wyeksportowany SVG (wymagane, fragmentowane) |
| **Script** | skrypt użytkownika sterujący diagramem (fragmentowany) |
| **Host groups / Hosts** | wybór hostów wzorcami (pulpity globalne) |
| **Item patterns** | które elementy rozwiązać i wstrzyknąć |
| **Item tags** | filtr po tagach (And/Or) |
| **Override host** | dynamiczny/nadpisujący host dla pulpitów szablonowych |

---

## Skrypt

Kontrakt — ciało skryptu wykonuje się jako `(hosts, cells, api)`:

### `hosts`
```js
[
  { host: 'Router A', hostid: '10105', tags: [ { tag, value }, … ],
    macros: { '{$SNMP_COMMUNITY}': 'public', '{$TEMP.CRIT}': '85', … },
    items:    [ { key, name, value, units, value_type, clock, tags: [ { tag, value }, … ] }, … ],
    triggers: [ { triggerid, description, priority, status, value, tags: [ { tag, value }, … ] }, … ] }
]
```

`macros` to **efektywne** makra użytkownika hosta, kluczowane po nazwie — z makrami
globalnymi i szablonowymi włącznie, z już zastosowanymi nadpisaniami hosta/szablonu
(te same wartości, które pokazuje formularz edycji hosta). Makra sekretne nie niosą
wartości.

```js
// np. weź próg z makra hosta zamiast zakodowanej liczby:
const crit = +hosts[0].macros['{$TEMP.CRIT}'] || 80;
```

### `cells` — CRUD nad elementami diagramu
```js
cells.get(id)        // handle | null
cells.byLabel(text)  // handle | null  (dopasowanie po widocznej etykiecie)
cells.find(fn)       // handle | null  (fn otrzymuje {id,label,bbox,neighbors})
cells.all            // [handle, …]
```
**handle**:
```js
handle.id           // data-cell-id
handle.label        // tekst etykiety
handle.bbox         // { x, y, width, height }
handle.neighbors    // [id, …]  komórki połączone z tą łącznikiem
handle.set(patch)   // patch: { fill, stroke, strokeWidth, opacity, text, animate, flow }
handle.clone({ id?, dx?, dy?, patch?, edges? })   // klon z przesunięciem; zwraca nowy handle
handle.repeat(list, { cols, gap, edges }, fn)     // klon dla każdego elementu, w siatce; fn(cell, item, i)
handle.remove({ edges? })
```

**`edges`** (na `clone` / `repeat` / `remove`) działa również na łączniki przylegające
do komórki — `true` dla wszystkich z nich lub `[neighborId, …]`, by ograniczyć się do
linii, których dalszy koniec trafia w tych sąsiadów. Przy klonowaniu każdy łącznik jest
przekierowywany jako linia prosta: jego dalszy koniec pozostaje na miejscu, a bliższy
podąża za klonem, więc wachlarz klonów zachowuje własną linię do wspólnego rodzica.
Łączność jest wnioskowana z geometrii SVG (bez potrzeby osadzonego modelu draw.io);
przekierowane punkty pośrednie stają się prostymi.

### `api` — funkcje pomocnicze
```js
api.scale(v, inMin, inMax, outMin, outMax)   // liniowe mapowanie z ograniczeniem
api.color(v, [[threshold, color], …], base)  // kolor najwyższego osiągniętego progu
api.grid(i, { cols, gap, w, h })             // → { dx, dy }
```

### Przykłady

**Kolor wg progu + tekst wartości:**
```js
const it = {};
hosts.forEach(h => h.items.forEach(i => it[i.key] = i));

const r = it['demo.reactor'];
if (r) cells.get('reactor').set({
  fill: api.color(+r.value, [[50, '#e0b000'], [80, '#e05050']], '#3fa34d'),
  text: (+r.value).toFixed(1) + ' °C'
});
```

**Grubość linii wg obciążenia kanału:**
```js
const net = it['net.if.in[eth0]'];
if (net) cells.byLabel('eth0').set({ strokeWidth: api.scale(+net.value, 0, 1e9, 2, 16) });
```

**LLD — klonowanie szablonu dla każdego wykrytego elementu:**
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

**Dopasowanie po tagu zamiast klucza:** każdy element, wyzwalacz i host niesie swoje `tags`.

```js
const tagged = (host, name) => host.items.find(i => i.tags.some(t => t.tag === 'port' && t.value === name));

hosts.forEach(h => {
  const up = tagged(h, 'wan');
  if (up) cells.byLabel('WAN').set({ strokeWidth: api.scale(+up.value, 0, 1e9, 2, 16) });
});
```

**Klonowanie szablonu razem z łącznikiem do rodzica (wachlarz LLD):**

```js
// 'node' to komórka-szablon połączona linią z 'core'. Każdy klon dostaje własną
// linię do 'core'; slot 0 to sam szablon w miejscu (jego linia już istnieje).
const nums = hosts.flatMap(h => h.items).filter(i => !isNaN(+i.value));

cells.get('node').repeat(nums, { cols: 4, gap: 20, edges: ['core'] }, (cell, item) => {
  cell.set({ text: item.name, fill: api.color(+item.value, [[70, '#e05050']], '#2b7a3d') });
});
```

### Animacja

Dwa pola `patch` dołączają animację uruchamianą przez przeglądarkę. Skrypt ustawia je
raz na odświeżenie; przeglądarka utrzymuje je między odświeżeniami, więc nic nie zapętla
się w piaskownicy (gwarancja przeciw DoS pozostaje nienaruszona). Ponadto każda zmiana
wartości już teraz przechodzi płynnie (fill/stroke/stroke-width/opacity, ~0,6 s) — rura
grubieje, a kolor przepływa sam z siebie.

- `animate: 'pulse' | 'blink' | 'none'` — pulsowanie (płynne) lub miganie (skokowe)
  całej komórki; `'none'` (lub pominięcie) zatrzymuje.
- `flow: <liczba ze znakiem>` — płynące kreski wzdłuż linii komórki; znak to kierunek,
  wartość to prędkość; `0`/`false` zatrzymuje.

```js
// Komórka-alarm pulsuje, gdy wyzwalacz jest w stanie PROBLEM.
const problem = hosts.some(h => h.triggers.some(t => t.value === '1'));
cells.byLabel('pump').set({ animate: problem ? 'pulse' : 'none' });

// Kreski płyną wzdłuż rury, szybciej przy obciążeniu kanału.
const net = it['net.if.in[eth0]'];
if (net) cells.byLabel('eth0').set({ flow: api.scale(+net.value, 0, 1e9, 0.3, 4) });
```

> Ponieważ rzeczywisty SVG utrzymuje się między odświeżeniami, animacja pozostaje
> włączona, dopóki skrypt jej nie wyłączy — zawsze ustawiaj gałąź „wyłącz”
> (`animate:'none'`, `flow:0`), gdy warunek przestaje obowiązywać.

### Debugowanie

Skrypt to zwykły JavaScript wykonywany przez przeglądarkę, więc mają zastosowanie
pełne narzędzia deweloperskie — z dwoma rzeczami, które warto wiedzieć:

- Wykonuje się wewnątrz Workera piaskownicy, więc w zakładce **Sources** pojawia się
  jako wpis `blob:`/VM. `console.log(...)` ze skryptu wypisuje do konsoli, a instrukcja
  `debugger;` wstrzymuje tam wykonanie.
- Ewaluator przechwytuje wyjątki skryptu, aby zachować izolację, więc nieprzechwycony
  błąd inaczej by zniknął. Widget przywraca go do konsoli jako
  `[drawio] user script error: <stack>` — a wszystkie operacje zarejestrowane
  przed rzuceniem wyjątku i tak zostają zastosowane.

---

## Jak to działa

1. Kontroler rozwiązuje wybrane elementy (ostatnia wartość z historii) i wyzwalacze
   ich hostów, grupuje je w `hosts` i zwraca razem z SVG i skryptem.
2. Frontend wstrzykuje SVG, buduje zserializowany model komórek (`{id, label, bbox}`
   na komórkę) i przekazuje go, z danymi i skryptem, do piaskownicy.
3. Piaskownica wykonuje skrypt; jego wywołania CRUD **zapisują operacje**
   (`set` / `clone` / `remove`).
4. Widget stosuje te operacje do rzeczywistego SVG.

Skrypt nigdy nie dotyka DOM bezpośrednio — pracuje na zserializowanym modelu i zwraca
operacje, co czyni go możliwym do izolacji.

---

## Fragmentacja (chunking)

`Diagram SVG` i `Script` są przechowywane przez `CWidgetFieldChunkedText`, który dzieli
wartość (po granicach znaków, poniżej bajtowego limitu kolumny) na `diagram.0`,
`diagram.1`, … i ponownie łączy przy wczytywaniu. Diagramy i skrypty mają tendencję do
rozrastania się, więc fragmentacja jest wbudowana od początku, a nie dodana po
osiągnięciu limitu.

---

## Model bezpieczeństwa

Skrypty użytkownika to dowolny JavaScript, pisany przez osobę mogącą edytować pulpit.
Działają w **izolowanym `<iframe sandbox="allow-scripts">`** (bez `allow-same-origin`
→ opaque origin), z ewaluatorem umieszczonym w **Workerze** wewnątrz tego iframe:

- **Poufność** — opaque origin blokuje dostęp do ciasteczek rodzica, DOM i żądań z
  poświadczeniami. Zweryfikowano: z piaskownicy `parent.location.href` i
  `parent.document.cookie` oba rzucają `SecurityError`.
- **Dostępność (DoS)** — skrypt działa w osobnym wątku Workera; strażnik przerywa go
  po ~1 s, więc nieskończona pętla nie może zamrozić pulpitu. Zweryfikowano: skrypt
  `while(true){}` pozostawia stronę w pełni responsywną, a diagram bez zastosowanych
  zmian.

Jeśli przeglądarka odmówi utworzenia Workera wewnątrz izolowanej ramki, widget wraca
do wykonywania inline (izolacja pozostaje, ale bez gwarancji przeciw DoS).

> Uwaga: to narzędzie dla zaawansowanych. Odpowiednio ogranicz, kto może edytować
> takie pulpity.

---

## Pulpity demo (projekt do nauki)

| Pulpit | Co pokazuje |
|--------|-------------|
| Reactor mnemonic | ręcznie narysowany SVG, skryptowanie per komórka |
| Real IntPage | prawdziwy wyeksportowany `.drawio`, adresowanie po auto-id |
| LLD clone | jedna komórka-szablon → kafelkowana dla każdego wykrytego elementu |
| Chunk test | SVG 115 KB, przechowywany/renderowany przez fragmenty |
