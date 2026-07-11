# Wskaźnik analogowy (canvas) — widżet pulpitu Zabbix

[English](README.md) | [Русский](README.ru.md) | [Srpski](README.sr.md) | **Polski** | [Latviešu](README.lv.md)

Widżet z **siatką wieloelementowych wskaźników analogowych**. Pokazuje wartości kilku
elementów (wybranych za pomocą wzorca nazwy i przefiltrowanych po tagach) jako okrągłe
wskaźniki tarczowe, ułożone w siatkę. Każda tarcza animuje swoją wskazówkę w kierunku
bieżącej wartości elementu; gdy element nie ma danych, wskazówka wykonuje powolny pokazowy
ruch omiatający. Wszystko jest rysowane proceduralnie na elemencie `<canvas>` (bez zasobów
graficznych).

Jest to siostrzany, siatkowy odpowiednik widżetu [Thermometer](../thermometer): ten sam
model danych (wzorzec + tagi + makra per host + progi), ale rozmieszczony na **siatce
zamiast poziomej karuzeli**, z czterema wybieralnymi stylami wizualnymi.

![Analog gauge styles](docs/styles.png)

- **id:** `analog_gauge` · **namespace:** `AnalogGauge` · **type:** `widget`
- Klasa renderująca: `WidgetAnalogGauge` (rozszerza wspólną bazę `CWidgetGaugeBase` →
  `CWidgetCanvasBase`).

## Funkcje

- **Wiele elementów z wielu hostów** — wybieranych **wzorcem nazwy** (symbole wieloznaczne `*`)
  i filtrowanych **tagami** (natywny model *SVG graph*; `inheritedTags` uwzględnia również
  tagi hostów). Wyświetlane są **tylko elementy numeryczne** (float / unsigned); elementy
  tekstowe, logi i znakowe są odfiltrowywane.
- **Układ siatki**: każdy pasujący element staje się osobną tarczą, ułożoną w siatce. Liczba
  kolumn jest dobierana automatycznie tak, aby tarcze były możliwie kwadratowe (i możliwie
  duże), albo można ją ustalić za pomocą pola **Grid columns**.
- **Minimalny rozmiar + przewijanie**: gdy ustawione jest **Min gauge size**, tarcze nigdy nie
  kurczą się poniżej tego rozmiaru — do wszystkiego, co się nie mieści, można dotrzeć,
  **przeciągając myszą**, na **obu osiach** (pojawiają się cienkie wskaźniki paska
  przewijania). Przy Min gauge size `0` siatka zawsze mieści się w widżecie (bez przewijania).
  Nie ma automatycznego przewijania — panoramowanie jest wyłącznie ręczne.
- **Cztery style**, dzielące tę samą geometrię tarczy 270°:
  - **Retro** — zabytkowa mosiężna obwódka, kremowa tarcza, szeryfowe cyfry, klasyczna czarna
    wskazówka.
  - **Cyberpunk** — ciemny dysk, neonowy łuk postępu i świecąca wskazówka, monospace'owy odczyt.
  - **Industrial** — masywna stalowa obwódka ze śrubami, matowa grafitowa tarcza, pogrubiona
    wskazówka, pas ostrzegawczy/progowy przy górze.
  - **Minimal** — bez obwódki; płaski łuk postępu i duża wyśrodkowana liczba, dopasowana do
    motywu (jasny / ciemny).
- **Progi**: wartości progów definiują **kolorowe strefy na łuku tarczy**, a cyfrowy odczyt
  (oraz łuk postępu w stylach Cyberpunk / Minimal) przyjmuje kolor **najwyższego osiągniętego
  progu**. Strefy progowe można wyłączyć.
- **Makra użytkownika**: **Min**, **Max** oraz wartości progów mogą być makrami użytkownika
  (np. `{$PRESSURE.MAX}`, `{$WARN}`). Są rozwiązywane **per element, względem własnego hosta
  danego elementu** — to samo makro może rozwiązać się do innej liczby na różnych hostach,
  więc każda tarcza renderowana jest z własną skalą i poziomami progów.
- **Zakres**: **Fixed** (z Min / Max) lub **Auto** — pojedyncza wspólna skala obliczona z
  połączonej ostatniej godziny historii **wszystkich** elementów (z marginesem ±5%).
- **Wartość cyfrowa** (opcjonalnie) wyświetlana na środku / we wcięciu każdej tarczy,
  sformatowana z wybraną liczbą miejsc dziesiętnych i jednostkami elementu (lub ich
  nadpisaniem).
- **Drżenie wskazówki** (opcjonalnie): wskazówka delikatnie drży, naśladując żywy przyrząd —
  ruch jest łatwiejszy do wychwycenia przez oko niż pozycja statyczna. **Drży tylko wskazówka;
  wartość cyfrowa nigdy.**
- **Nazwa elementu** wyświetlana pod każdą tarczą (skracana, aby się zmieściła); najedź na
  tarczę, aby uzyskać dymek z pełną nazwą i hostem.
- **Płynna animacja wskazówki** dla każdego elementu (wartości płynnie zmierzają do celu przy
  każdym odświeżeniu); pokazowy ruch omiatający uruchamia się, gdy element nie ma danych.
  **Dopasowanie do motywu** (tarcze Retro / Cyberpunk / Industrial mają własne tło; Minimal
  podąża za jasnym / ciemnym motywem pulpitu).

## Konfiguracja

| Pole | Opis |
|-------|-------------|
| **Host groups** | *(tylko pulpity globalne)* ogranicza wyszukiwanie hostów do tych grup. |
| **Hosts** | *(tylko pulpity globalne)* wzorzec(-ce) nazw hostów, symbole wieloznaczne `*`. |
| **Item patterns** \* | wzorzec(-ce) **nazw** elementów, symbole wieloznaczne `*`. Samo `*` = każdy element numeryczny na dopasowanych hostach. |
| **Item tags** | filtr tagów z ewaluacją **And/Or** lub **Or**. |
| **Override host** | przypina wszystkie elementy do jednego hosta (np. na pulpicie szablonu). |
| **Style** | Retro / Cyberpunk / Industrial / Minimal. |
| **Range** | **Fixed** (Min / Max) lub **Auto** (wspólny, historia ostatniej godziny ±5%). |
| **Min**, **Max** | granice skali. Zwykłe liczby **lub** makra użytkownika (`{$LOW}`, `{$PRESSURE.MAX}` …). |
| **Units (override)** | zastępuje własne jednostki elementu na tarczy. |
| **Decimals** | liczba cyfr po przecinku w wartości cyfrowej (0–10). |
| **Grid columns** | liczba kolumn; **0 = auto** (dopasowanie tarcz do widżetu). |
| **Min gauge size, px** | minimalny rozmiar tarczy dla układu automatycznego; **0 = dopasuj do widżetu** (bez przewijania). Gdy > 0, do nadmiaru można dotrzeć przeciąganiem. |
| **Show digital value** | pokazuje / ukrywa odczyt numeryczny na każdej tarczy. |
| **Needle tremor (jitter)** | sprawia, że wskazówka delikatnie drży (naśladuje pracujący przyrząd). |
| **Thresholds** | kolorowe poziomy; wartości mogą być makrami użytkownika. |
| **Show threshold zones on the dial** | rysuje kolorowe strefy na łuku tarczy. |

## Przepływ danych

1. Kontroler rozwiązuje **wzorce nazw** elementów na hostach dopasowanych wzorcem (lub na
   hoście szablonu / nadpisania), przefiltrowanych tagami — ten sam model co widżet SVG graph.
   Przetrwają tylko elementy numeryczne (`value_type` przefiltrowane do float / unsigned).
2. Dla każdego elementu zwraca **ostatnią wartość**, a dla trybu zakresu **Auto** wspólne
   min/max z połączonej historii ostatniej godziny wszystkich elementów (±5%).
3. **Min / Max oraz każdy ciąg progu są rozwiązywane per element, względem własnego hosta
   danego elementu** (makra użytkownika mogą różnić się per host), a następnie parsowane do
   liczb za pomocą `CNumberParser`. Każdy element niesie więc własne `min`, `max` oraz
   posortowane `thresholds`.
4. JS renderuje siatkę; każda tarcza animuje wskazówkę w kierunku własnej wartości, używając
   własnej skali i stref progowych.

## Uwagi / implementacja

- Wspólna baza canvas (`class.widget.base.js`) i baza wskaźnika (`class.gauge.base.js`) są
  **globalami przypisywanymi jednorazowo** (`window.X = window.X || class …`) — identyczne
  kopie znajdują się w każdym module canvas/gauge, a definicję klasy tworzy ta, która załaduje
  się pierwsza. Nie zmieniaj nazw składowych już istniejących na `CWidget` (`_body`, `_fields`, …).
- Wartości progów będące **makrami użytkownika** są przechowywane jako ciągi znaków przez
  niestandardowe pole `Modules\AnalogGauge\Includes\CWidgetFieldGaugeThresholds` (standardowe
  pole progów odrzuca wiersze nienumeryczne); kontroler rozwiązuje je i sortuje per host.
- Przewijanie odbywa się wyłącznie ręcznym przeciąganiem myszą, ograniczonym przez
  `isEditMode()`, aby nie kolidowało z własnym przeciąganiem widżetu przez pulpit w trybie
  edycji.
- Zawsze sprawdzaj JS linterem przed załadowaniem (`node --check assets/js/*.js`) — błąd
  składni w zasobie modułu psuje wspólną klasę bazową na **każdym** pulpicie, ponieważ zasoby
  modułów są ładowane na wszystkich stronach.

## Demo

Pulpit **„Analog gauge (grid) demo”** (id `709` na instancji lekcyjnej) — po jednej stronie na
styl, na hostach `Demo sensors` z makrami per host (`{$TEMP.MIN}`/`{$TEMP.MAX}`) oraz progami
`{$TEMP.WARN}`/`{$TEMP.CRIT}`, plus strona **„Grid + scroll”** (wąski widżet, Min gauge size
180 px) demonstrująca przewijanie przeciąganiem. Drżenie wskazówki jest włączone w demo.
