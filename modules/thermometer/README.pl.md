# Thermometer (canvas) — widget pulpitu Zabbix

[English](README.md) | [Русский](README.ru.md) | [Srpski](README.sr.md) | **Polski** | [Latviešu](README.lv.md)

Widget „karuzela termometrów" dla wielu elementów (items). Pokazuje wartości kilku elementów
(wybranych wzorcem nazwy i przefiltrowanych po tagach) jako rząd szklanych termometrów:
środkowy jest większy i w centrum uwagi, boczne są mniejsze i „schodzą poza kadr". Wszystko
jest rysowane proceduralnie na elemencie `<canvas>` (bez zasobów graficznych).

![Karuzela termometrów](docs/carousel.png)

- **id:** `thermometer` · **namespace:** `Thermometer` · **type:** `widget`
- Klasa rysująca: `WidgetThermometer` (dziedziczy po wspólnej bazie `CWidgetGaugeBase` →
  `CWidgetCanvasBase`).

## Możliwości

- Wiele elementów na wielu hostach — wybór **wzorcem** nazwy (znaki wieloznaczne `*`) i
  filtrowanie po **tagach** (model natywnego widgetu *SVG graph*; `inheritedTags` uwzględnia
  także tagi hosta). Wyświetlane są **tylko elementy numeryczne** (float / unsigned); tekstowe,
  log i znakowe są pomijane.
- **Karuzela**: nieskończona (zapętlona); środkowe termometry mają pełny rozmiar (kilka, jeśli
  pozwala szerokość), skupiony jest nieco większy; boczne kurczą się i płynnie zanikają ku
  krawędziom.
- **Wartość** na każdym termometrze zgodnie z `value_pos` (góra / dół / lewo / prawo / wyłączona);
  tryb **Track** pokazuje ją jako znacznik-„pióro rejestratora" na szczycie rtęci (dla lewo/prawo
  rząd jest rozsuwany, aby znacznik się zmieścił).
- **Nazwa** skupionego elementu — plakietka ze strzałką wskazującą jego termometr; poniżej rząd
  kropek pozycji.
- **Przewijanie**: przeciąganiem myszą (przyciąga do najbliższego) lub **autoprzewijaniem**
  (płynnie, wstrzymane gdy kursor jest nad widgetem).
- **Wspólny zakres** dla wszystkich elementów: stały lub automatyczny (z połączonej historii
  wszystkich wybranych elementów, z zapasem ±5%).
- Naturalne rysowanie: skala w liczbach całkowitych (inteligentny krok), zawsze oznacza **0**
  gdy jest w zakresie (z linią bazową), min/max są przypięte do prostej części rurki (kopuła i
  dno są „poza zakresem"); przy ukrytej bańce rtęć jest rysowana od zera (w dół dla wartości
  ujemnych). Kolory skali i wartości dostosowują się do motywu (jasny / ciemny).

## Parametry

![Formularz konfiguracji](docs/form.png)

| Parametr | Typ | Domyśl. | Opis |
|----------|-----|---------|------|
| **Host groups** ¹ | multiselect grup | — | Ogranicz hosty do wybranych grup. Tylko na pulpicie globalnym. |
| **Hosts** ¹ | wzorce hostów | — | Wzorce nazw hostów (znaki `*`). Tylko na pulpicie globalnym. |
| **Item patterns** | wzorce elementów | — (wymagane) | Wzorce nazw elementów (znaki `*`), rozwiązywane do zbioru elementów. |
| **Item tags** | evaltype + wiersze tagów | And/Or | Filtrowanie elementów po tagach (uwzględniane są też dziedziczone tagi hosta). |
| **Override host** | multiselect | — | Nadpisanie hosta (dla kontekstu dynamicznego / szablonowego). |
| **Range** | select | Fixed | `Fixed` — z pól Min/Max; `Auto (shared, history ±5%)` — wspólny zakres z połączonej historii wszystkich elementów. |
| **Min** / **Max** | liczba | 0 / 100 | Granice skali dla trybu Fixed. |
| **Units (override)** | tekst | — | Jednostki miary. Puste → pobierane z elementu. |
| **Decimals** | liczba całk. 0–10 | 1 | Liczba miejsc po przecinku dla wartości. |
| **Value position** | select | Top | Gdzie pokazać wartość: `Off` / `Top` / `Bottom` / `Left` / `Right`. |
| **Track mercury top (marker)** | pole wyboru | wył. | Wartość jako znacznik-„pióro" na szczycie rtęci (dla `Left`/`Right`). |
| **Auto-scroll cycle, s (0 = off)** | liczba całk. 0–3600 | 0 | Sekundy na pełny cykl karuzeli. `0` wyłącza autoprzewijanie. Wstrzymane po najechaniu. |
| **Show bulb** | pole wyboru | wł. | Rysuj bańkę na dole. Bez bańki rtęć jest rysowana od zera. |
| **Mercury color** | kolor | `D81B18` | Kolor rtęci (gradient budowany z wybranego koloru). |

¹ Na pulpicie **szablonowym** pola *Host groups* i *Hosts* są ukryte — elementy są rozwiązywane
względem bieżącego / nadpisanego hosta.

## Interakcja

- **Przeciąganie myszą** w lewo/prawo przewija karuzelę; po zwolnieniu przyciąga do najbliższego
  termometru. W trybie edycji pulpitu przeciąganie przejmuje pulpit.
- **Autoprzewijanie** (`Auto-scroll cycle`) płynnie przechodzi przez elementy; **wstrzymane gdy
  kursor jest nad widgetem**.

## Struktura modułu

```text
thermometer/
  manifest.json                 id/namespace/js_class, akcja, zasoby
  includes/WidgetForm.php       pola formularza (wzorce, tagi, wyświetlanie)
  actions/WidgetView.php        rozwiązywanie elementów po wzorcu+tagach, wartości z historii,
                                wspólny auto_min/auto_max z połączonej historii
  views/widget.view.php         setVar(items, auto_min, auto_max, fields_values)
  views/widget.edit.php         formularz konfiguracji
  assets/js/class.widget.base.js  CWidgetCanvasBase (wspólna obsługa canvas, assign-once global)
  assets/js/class.gauge.base.js   CWidgetGaugeBase (wartość/zakres/animacja/motyw)
  assets/js/class.widget.js       WidgetThermometer (karuzela, rysowanie, drag/autoscroll)
  assets/css/widget.css           style canvas
  docs/                           zrzuty ekranu do tego README
```

## Instalacja

Skopiuj katalog `thermometer` do `zabbix/ui/modules/`, następnie zarejestruj go przez
*Administration → General → Modules → Scan directory* i włącz moduł. Widget pojawia się na
liście typów przy dodawaniu widgetu do pulpitu.
