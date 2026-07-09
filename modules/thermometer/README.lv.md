# Thermometer (canvas) — Zabbix informācijas paneļa logrīks

[English](README.md) | [Русский](README.ru.md) | [Srpski](README.sr.md) | [Polski](README.pl.md) | **Latviešu**

Vairāku vienumu (items) „termometru karuseļa" logrīks. Tas rāda vairāku vienumu vērtības
(izvēlētas pēc nosaukuma parauga un filtrētas pēc birkām) kā stikla termometru rindu:
centrālais ir lielāks un fokusā, sānu termometri ir mazāki un „aiziet ārpus kadra". Viss tiek
zīmēts procedurāli uz `<canvas>` elementa (bez attēlu resursiem).

![Termometru karuselis](docs/carousel.png)

- **id:** `thermometer` · **namespace:** `Thermometer` · **type:** `widget`
- Zīmēšanas klase: `WidgetThermometer` (manto no kopīgās bāzes `CWidgetGaugeBase` →
  `CWidgetCanvasBase`).

## Iespējas

- Vairāki vienumi uz vairākiem resursdatoriem — izvēle pēc nosaukuma **parauga** (aizstājējzīmes
  `*`) un filtrēšana pēc **birkām** (vietējā *SVG graph* logrīka modelis; `inheritedTags` ņem vērā
  arī resursdatora birkas). Tiek rādīti **tikai skaitliskie** vienumi (float / unsigned); teksta,
  žurnāla un rakstzīmju vienumi tiek izlaisti.
- **Karuselis**: katrs izvēlētais vienums tiek rādīts **tieši vienu reizi** — vienumi nekad netiek
  dublēti, lai aizpildītu platu logrīku. Ja tie visi ietilpst, kopa tiek centrēta; pretējā gadījumā
  karuselis ritinās (ierobežoti, bez cilpas). Centrālie termometri ir pilnā izmērā (vairāki, ja
  platums atļauj), fokusētais ir nedaudz lielāks; sānu termometri sarūk un vienmērīgi izgaist pret
  malām.
- **Sliekšņi (thresholds)**: **viss dzīvsudraba stabs** tiek pārkrāsots ar augstākā sasniegtā
  sliekšņa krāsu (nevis tikai daļa virs tā). Ar ieslēgtu **Interpolate** krāsa vienmērīgi pāriet
  starp sliekšņiem — un no dzīvsudraba bāzes krāsas zem pirmā sliekšņa — vērtībai mainoties. Mazas
  krāsainas atzīmes rāda sliekšņu līmeņus uz skalas.
- **Lietotāja makro**: **Min**, **Max** un sliekšņu vērtības var būt lietotāja makro
  (piem., `{$TEMP.MAX}`, `{$WARN}`). Tie tiek atrisināti **katram vienumam atsevišķi — pret paša
  vienuma resursdatoru** — viens un tas pats makro dažādos resursdatoros var atrisināties atšķirīgā
  skaitlī, tāpēc katrs termometrs tiek zīmēts ar savu skalu un saviem sliekšņu līmeņiem.
- **Vērtība** uz katra termometra atbilstoši `value_pos` (augšā / apakšā / pa kreisi / pa labi /
  izslēgts); režīms **Track** to rāda kā marķieri-„reģistratora spalvu" dzīvsudraba augšpusē
  (pa kreisi/pa labi rinda tiek izpletta, lai marķieris ietilptu).
- **Fokusētā vienuma nosaukums** — plāksnīte ar bultiņu, kas norāda uz tā termometru; zem tās
  pozīcijas punktu rinda.
- **Ritināšana**: velkot ar peli (pieķeras tuvākajam) vai ar **automātisko ritināšanu**
  (vienmērīga kustība turp un atpakaļ, apturēta, kamēr kursors ir virs logrīka).
- **Kopīgs diapazons** visiem vienumiem: fiksēts vai automātisks (no visu izvēlēto vienumu
  apvienotās vēstures, ar ±5% rezervi).
- Dabiska zīmēšana: skala veselos skaitļos (gudrs solis), vienmēr atzīmē **0**, ja tas ir
  diapazonā (ar bāzes līniju), min/max ir piesaistīti caurules taisnajai daļai (kupols un
  apakša ir „ārpus diapazona"); bez kolbas dzīvsudrabs tiek zīmēts no nulles (uz leju negatīvām
  vērtībām). Skalas un vērtības krāsas pielāgojas tēmai (gaišā / tumšā).

## Parametri

![Konfigurācijas forma](docs/form.png)

| Parametrs | Tips | Noklus. | Apraksts |
|-----------|------|---------|----------|
| **Host groups** ¹ | grupu vairākizvēle | — | Ierobežot resursdatorus ar izvēlētajām grupām. Tikai globālajā panelī. |
| **Hosts** ¹ | resursdatoru paraugi | — | Resursdatoru nosaukumu paraugi (aizstājējzīmes `*`). Tikai globālajā panelī. |
| **Item patterns** | vienumu paraugi | — (obligāti) | Vienumu nosaukumu paraugi (aizstājējzīmes `*`), tiek atrisināti vienumu kopā. |
| **Item tags** | evaltype + birku rindas | And/Or | Vienumu filtrēšana pēc birkām (tiek ņemtas vērā arī mantotās resursdatora birkas). |
| **Override host** | vairākizvēle | — | Resursdatora aizstāšana (dinamiskajam / veidnes kontekstam). |
| **Range** | izvēle | Fixed | `Fixed` — no Min/Max laukiem; `Auto (shared, history ±5%)` — kopīgs diapazons no visu vienumu apvienotās vēstures. |
| **Min** / **Max** | skaitlis vai makro ² | 0 / 100 | Skalas robežas Fixed režīmam. Var būt lietotāja makro (piem., `{$TEMP.MIN}`). |
| **Units (override)** | teksts | — | Mērvienības. Tukšs → tiek ņemtas no vienuma. |
| **Decimals** | vesels 0–10 | 1 | Ciparu skaits aiz komata vērtībai. |
| **Value position** | izvēle | Top | Kur rādīt vērtību: `Off` / `Top` / `Bottom` / `Left` / `Right`. |
| **Track mercury top (marker)** | izvēles rūtiņa | izslēgts | Vērtība kā marķieris-„spalva" dzīvsudraba augšpusē (`Left`/`Right`). |
| **Auto-scroll cycle, s (0 = off)** | vesels 0–3600 | 0 | Sekundes pilnam turp-atpakaļ gājienam. `0` atspējo automātisko ritināšanu. Apturēta, novietojot kursoru virs. |
| **Show bulb** | izvēles rūtiņa | ieslēgts | Zīmēt kolbu apakšā. Bez kolbas dzīvsudrabs tiek zīmēts no nulles. |
| **Mercury color** | krāsa | `D81B18` | Dzīvsudraba bāzes krāsa (zem pirmā sliekšņa). Gradients tiek veidots no tās. |
| **Thresholds** | krāsu + vērtību rindas ² | — | Pārkrāso visu dzīvsudraba stabu, kad vērtība sasniedz slieksni. Katra vērtība var būt lietotāja makro. |
| **Interpolate color between thresholds** | izvēles rūtiņa | izslēgts | Vienmērīgi pāriet dzīvsudraba krāsu starp sliekšņiem, nevis pārslēdz pa soļiem. |

¹ **Veidnes** panelī lauki *Host groups* un *Hosts* ir paslēpti — vienumi tiek atrisināti pret
pašreizējo / aizstāto resursdatoru.

² **Lietotāja makro** laukos *Min*, *Max* un *Thresholds* ir viena kopīga konfigurācija, taču tie tiek
atrisināti **katram vienumam atsevišķi — pret paša vienuma resursdatoru**, tāpēc viens un tas pats makro
dažādos resursdatoros var dot atšķirīgu skaitli un katrs termometrs saglabā savu skalu/sliekšņus.
(*Veidnes* panelī izvēle ir ierobežota ar vienu resursdatoru, tāpēc tas šeit nav būtiski.)

## Mijiedarbība

- **Vilkšana ar peli** pa kreisi/pa labi ritina karuseli; atlaižot tā pieķeras tuvākajam
  termometram. Paneļa rediģēšanas režīmā vilkšanu pārņem panelis.
- **Automātiskā ritināšana** (`Auto-scroll cycle`) iet cauri vienumiem turp un atpakaļ
  (ping-pong, bez cilpas); **apturēta, kamēr kursors ir virs logrīka**. Kad visi vienumi ietilpst
  logrīkā, nav ko ritināt.
- **Fokuss** — **novietojiet kursoru** virs jebkura termometra, lai to fokusētu: tas nedaudz
  palielinās, kļūst spilgtāks un parādās tā nosaukuma plāksnīte. Tas darbojas gan tad, kad viss
  ietilpst, gan kamēr karuselis ritinās, tāpēc var fokusēt un nosaukt pat malējos vienumus. Bez
  kursora fokusā ir vidējais. (Kad vērtība tiek rādīta apakšā, nosaukuma plāksnīte pārvietojas uz
  augšu, lai neaizsegtu vērtības.)

## Moduļa struktūra

```text
thermometer/
  manifest.json                 id/namespace/js_class, darbība, resursi
  includes/WidgetForm.php       formas lauki (paraugi, birkas, attēlojums, sliekšņi)
  includes/CWidgetFieldThermoThresholds.php  sliekšņu lauks, kas pieņem arī lietotāja makro
  actions/WidgetView.php        vienumu atrisināšana pēc parauga+birkām, vērtības no vēstures,
                                kopīgs auto_min/auto_max, makro atrisināšana min/max/sliekšņos
  views/widget.view.php         setVar(items, auto/range min/max, sliekšņi, fields_values)
  views/widget.edit.php         konfigurācijas forma
  assets/js/class.widget.base.js  CWidgetCanvasBase (kopīga canvas bāze, assign-once global)
  assets/js/class.gauge.base.js   CWidgetGaugeBase (vērtība/diapazons/animācija/tēma)
  assets/js/class.widget.js       WidgetThermometer (karuselis, zīmēšana, drag/autoscroll)
  assets/css/widget.css           canvas stili
  docs/                           ekrānuzņēmumi šim README
```

## Instalēšana

Kopējiet direktoriju `thermometer` uz `zabbix/ui/modules/`, pēc tam reģistrējiet to caur
*Administration → General → Modules → Scan directory* un iespējojiet moduli. Logrīks parādās
tipu sarakstā, pievienojot logrīku panelim.
