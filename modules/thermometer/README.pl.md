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
- **Karuzela**: każdy wybrany element jest pokazywany **dokładnie raz** — elementy nigdy nie są
  powielane, aby wypełnić szeroki widget. Jeśli wszystkie się mieszczą, zestaw jest wyśrodkowany;
  w przeciwnym razie karuzela przewija się (w granicach, bez zawijania). Środkowe termometry mają
  pełny rozmiar (kilka, jeśli pozwala szerokość), skupiony jest nieco większy; boczne kurczą się i
  płynnie zanikają ku krawędziom.
- **Progi (thresholds)**: **cała kolumna rtęci** jest przemalowywana kolorem najwyższego
  osiągniętego progu (nie tylko część powyżej niego). Przy włączonej **interpolacji** kolor płynnie
  przechodzi między progami — oraz od bazowego koloru rtęci poniżej pierwszego progu — wraz ze
  zmianą wartości. Małe kolorowe znaczniki pokazują poziomy progów na skali.
- **Makra użytkownika**: **Min**, **Max** oraz wartości progów mogą być makrami użytkownika
  (np. `{$TEMP.MAX}`, `{$WARN}`). Są rozwiązywane **osobno dla każdego elementu, względem jego
  własnego hosta** — to samo makro może dać inną liczbę na różnych hostach, więc każdy termometr
  rysowany jest z własną skalą i własnymi poziomami progów.
- **Wartość** na każdym termometrze zgodnie z `value_pos` (góra / dół / lewo / prawo / wyłączona);
  tryb **Track** pokazuje ją jako znacznik-„pióro rejestratora" na szczycie rtęci (dla lewo/prawo
  rząd jest rozsuwany, aby znacznik się zmieścił).
- **Nazwa** skupionego elementu — plakietka ze strzałką wskazującą jego termometr; poniżej rząd
  kropek pozycji.
- **Przewijanie**: przeciąganiem myszą (przyciąga do najbliższego) lub **autoprzewijaniem**
  (płynny ruch tam i z powrotem, wstrzymany gdy kursor jest nad widgetem).
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
| **Min** / **Max** | liczba lub makro ² | 0 / 100 | Granice skali dla trybu Fixed. Może być makrem użytkownika (np. `{$TEMP.MIN}`). |
| **Units (override)** | tekst | — | Jednostki miary. Puste → pobierane z elementu. |
| **Decimals** | liczba całk. 0–10 | 1 | Liczba miejsc po przecinku dla wartości. |
| **Value position** | select | Top | Gdzie pokazać wartość: `Off` / `Top` / `Bottom` / `Left` / `Right`. |
| **Track mercury top (marker)** | pole wyboru | wył. | Wartość jako znacznik-„pióro" na szczycie rtęci (dla `Left`/`Right`). |
| **Auto-scroll cycle, s (0 = off)** | liczba całk. 0–3600 | 0 | Sekundy na pełny przebieg tam i z powrotem. `0` wyłącza autoprzewijanie. Wstrzymane po najechaniu. |
| **Show bulb** | pole wyboru | wł. | Rysuj bańkę na dole. Bez bańki rtęć jest rysowana od zera. |
| **Mercury color** | kolor | `D81B18` | Bazowy kolor rtęci (poniżej pierwszego progu). Gradient budowany jest z niego. |
| **Thresholds** | wiersze kolor + wartość ² | — | Przemaluj całą kolumnę rtęci, gdy wartość osiągnie próg. Każda wartość może być makrem użytkownika. |
| **Interpolate color between thresholds** | pole wyboru | wył. | Płynne przejście koloru rtęci między progami zamiast przełączania skokowego. |

¹ Na pulpicie **szablonowym** pola *Host groups* i *Hosts* są ukryte — elementy są rozwiązywane
względem bieżącego / nadpisanego hosta.

² **Makra użytkownika** w polach *Min*, *Max* i *Thresholds* są jedną wspólną konfiguracją, ale
rozwiązywane są **osobno dla każdego elementu — względem jego własnego hosta**, więc to samo makro
może dać inną liczbę na różnych hostach i każdy termometr zachowuje własną skalę/progi. (Na pulpicie
*szablonowym* wybór ogranicza się do jednego hosta, więc rozróżnienie to nie ma znaczenia.)

## Interakcja

- **Przeciąganie myszą** w lewo/prawo przewija karuzelę; po zwolnieniu przyciąga do najbliższego
  termometru. W trybie edycji pulpitu przeciąganie przejmuje pulpit.
- **Autoprzewijanie** (`Auto-scroll cycle`) przesuwa się przez elementy tam i z powrotem
  (ping-pong, bez zawijania); **wstrzymane gdy kursor jest nad widgetem**. Gdy wszystkie elementy
  mieszczą się w widgecie, nie ma czego przewijać.
- **Fokus** — **najechanie** na dowolny termometr ustawia na nim fokus: nieco się powiększa,
  rozjaśnia i pojawia się jego plakietka z nazwą. Działa to zarówno gdy wszystko się mieści, jak i
  podczas przewijania karuzeli, więc fokus i nazwę można nadać nawet skrajnym elementom. Bez
  najechania skupiony jest środkowy. (Gdy wartość pokazywana jest na dole, plakietka z nazwą
  przenosi się na górę, aby nie zasłaniać wartości.)

## Struktura modułu

```text
thermometer/
  manifest.json                 id/namespace/js_class, akcja, zasoby
  includes/WidgetForm.php       pola formularza (wzorce, tagi, wyświetlanie, progi)
  includes/CWidgetFieldThermoThresholds.php  pole progów, które akceptuje też makra użytkownika
  actions/WidgetView.php        rozwiązywanie elementów po wzorcu+tagach, wartości z historii,
                                wspólny auto_min/auto_max, rozwiązywanie makr w min/max/progach
  views/widget.view.php         setVar(items, auto/range min/max, progi, fields_values)
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
