# Analogais mērinstruments (canvas) — Zabbix informācijas paneļa vidžets

[English](README.md) | [Русский](README.ru.md) | [Srpski](README.sr.md) | [Polski](README.pl.md) | **Latviešu**

Daudzelementu **analogo mērinstrumentu režģa** vidžets. Tas parāda vairāku elementu
vērtības (atlasītas pēc nosaukuma šablona un filtrētas pēc birkām) kā apaļus ciparnīcas
mērinstrumentus, izkārtotus režģī. Katra ciparnīca animē savu adatu virzienā uz elementa
pašreizējo vērtību; kad elementam nav datu, adata veic lēnu demonstrācijas slaucīšanu.
Viss tiek zīmēts procedurāli uz `<canvas>` (bez attēlu resursiem).

Tas ir [Thermometer](../thermometer) vidžeta režģa māsasvidžets: tāds pats datu modelis
(šablons + birkas + katram resursdatoram atbilstoši makro + sliekšņi), taču izkārtots
**režģī, nevis horizontālā karuselī**, ar četriem izvēlamiem vizuālajiem stiliem.

![Analog gauge styles](docs/styles.png)

- **id:** `analog_gauge` · **namespace:** `AnalogGauge` · **type:** `widget`
- Renderēšanas klase: `WidgetAnalogGauge` (paplašina koplietoto bāzi `CWidgetGaugeBase` →
  `CWidgetCanvasBase`).

## Iespējas

- **Vairāki elementi no vairākiem resursdatoriem** — atlasīti pēc **nosaukuma šablona**
  (aizstājējzīmes `*`) un filtrēti pēc **birkām** (vietējais *SVG graph* modelis;
  `inheritedTags` ņem vērā arī resursdatora birkas). Tiek parādīti **tikai skaitliski
  elementi** (float / unsigned); teksta, žurnāla un rakstzīmju elementi tiek atfiltrēti.
- **Režģa izkārtojums**: katrs atbilstošais elements kļūst par savu ciparnīcu, izkārtotu
  režģī. Kolonnu skaits tiek izvēlēts automātiski, lai ciparnīcas paliktu pēc iespējas
  kvadrātiskākas (un pēc iespējas lielākas), vai arī to var fiksēt ar **Grid columns**.
- **Minimālais izmērs + ritināšana**: ja iestatīts **Min gauge size**, ciparnīcas nekad
  nesamazinās zem šī izmēra — viss, kas neietilpst, ir sasniedzams, **velkot ar peli**, pa
  **abām asīm** (parādās plāni ritjoslu indikatori). Ar Min gauge size `0` režģis vienmēr
  ietilpst vidžetā (bez ritināšanas). Nav automātiskās ritināšanas — panoramēšana ir tikai
  manuāla.
- **Četri stili**, kuriem ir vienāda 270° ciparnīcas ģeometrija:
  - **Retro** — vintāžas misiņa apmale, krēmkrāsas priekšpuse, serifa cipari, klasiska melna
    adata.
  - **Cyberpunk** — tumšs disks, neona progresa loks un mirdzoša adata, monospace rādījums.
  - **Industrial** — smaga tērauda apmale ar skrūvēm, matēta grafīta priekšpuse, treknraksta
    adata, bīstamības/sliekšņa josla tuvu augšpusei.
  - **Minimal** — bez apmales; plakans progresa loks un liels centrēts skaitlis, pielāgojas
    tēmai (gaišs / tumšs).
- **Sliekšņi**: sliekšņu vērtības nosaka **krāsainas zonas uz ciparnīcas loka**, un ciparu
  rādījums (kā arī progresa loks Cyberpunk / Minimal stilos) iegūst **augstākā sasniegtā
  sliekšņa** krāsu. Sliekšņu zonas var izslēgt.
- **Lietotāja makro**: **Min**, **Max** un sliekšņu vērtības var būt lietotāja makro
  (piem., `{$PRESSURE.MAX}`, `{$WARN}`). Tie tiek atrisināti **katram elementam atsevišķi,
  attiecībā pret katra elementa paša resursdatoru** — viens un tas pats makro dažādos
  resursdatoros var atrisināties uz atšķirīgu skaitli, tāpēc katra ciparnīca tiek renderēta
  ar savu mērogu un sliekšņu līmeņiem.
- **Diapazons**: **Fixed** (no Min / Max) vai **Auto** — viens koplietots mērogs, aprēķināts
  no **visu** elementu apvienotās pēdējās stundas vēstures (papildināts ar ±5%).
- **Ciparu vērtība** (pēc izvēles) tiek rādīta katras ciparnīcas centrā / iestarpinājumā,
  formatēta ar izvēlēto zīmju skaitu aiz komata un elementa mērvienībām (vai aizstājējvērtību).
- **Adatas trīce** (pēc izvēles): adata / rādītājs viegli trīc, atdarinot dzīvu instrumentu —
  kustību acij ir vieglāk pamanīt nekā statisku pozīciju. **Trīc tikai adata; ciparu vērtība
  nekad netrīc.**
- **Elementa nosaukums** tiek rādīts zem katras ciparnīcas (saīsināts, lai ietilptu);
  virziet kursoru virs ciparnīcas, lai iegūtu rīka padomu ar pilnu nosaukumu un resursdatoru.
- **Vienmērīga adatas animācija** katram elementam (vērtības pakāpeniski virzās uz savu mērķi
  katrā atsvaidzināšanā); demonstrācijas slaucīšana tiek izpildīta, kad elementam nav datu.
  **Pielāgojas tēmai** (Retro / Cyberpunk / Industrial priekšpuses nes savu fonu; Minimal seko
  informācijas paneļa gaišajai / tumšajai tēmai).

## Konfigurācija

| Field | Description |
|-------|-------------|
| **Host groups** | *(tikai globālie informācijas paneļi)* ierobežo resursdatoru meklēšanu ar šīm grupām. |
| **Hosts** | *(tikai globālie informācijas paneļi)* resursdatora nosaukuma šablons(-i), aizstājējzīmes `*`. |
| **Item patterns** \* | elementa **nosaukuma** šablons(-i), aizstājējzīmes `*`. `*` viens pats = katrs skaitliskais elements atbilstošajos resursdatoros. |
| **Item tags** | birku filtrs ar **And/Or** vai **Or** aprēķinu. |
| **Override host** | piesaista visus elementus vienam resursdatoram (piem., veidnes informācijas panelī). |
| **Style** | Retro / Cyberpunk / Industrial / Minimal. |
| **Range** | **Fixed** (Min / Max) vai **Auto** (koplietots, pēdējās stundas vēsture ±5%). |
| **Min**, **Max** | mēroga robežas. Vienkārši skaitļi **vai** lietotāja makro (`{$LOW}`, `{$PRESSURE.MAX}` …). |
| **Units (override)** | aizstāj elementa paša mērvienības uz ciparnīcas. |
| **Decimals** | zīmju skaits aiz komata ciparu vērtībā (0–10). |
| **Grid columns** | kolonnu skaits; **0 = automātiski** (pielāgo ciparnīcas vidžetam). |
| **Min gauge size, px** | minimālais ciparnīcas izmērs automātiskajam izkārtojumam; **0 = pielāgot vidžetam** (bez ritināšanas). Kad > 0, pārplūde ir sasniedzama velkot. |
| **Show digital value** | rāda / paslēpj skaitlisko rādījumu katrā ciparnīcā. |
| **Needle tremor (jitter)** | liek adatai viegli trīcēt (atdarina strādājošu instrumentu). |
| **Thresholds** | krāsaini līmeņi; vērtības var būt lietotāja makro. |
| **Show threshold zones on the dial** | uzzīmē krāsainās zonas uz ciparnīcas loka. |

## Datu plūsma

1. Kontrolieris atrisina elementu **nosaukumu šablonus** pa šablonam atbilstošajiem
   resursdatoriem (vai veidnes / aizstājējresursdatoru), filtrētus pēc birkām — tāds pats
   modelis kā SVG graph vidžetam. Izdzīvo tikai skaitliskie elementi (`value_type` filtrēts
   uz float / unsigned).
2. Katram elementam tas atgriež **pēdējo vērtību**, un diapazona režīmā **Auto** — koplietotu
   min/max no visu elementu apvienotās pēdējās stundas vēstures (±5%).
3. **Min / Max un katra sliekšņa virkne tiek atrisināta katram elementam atsevišķi, attiecībā
   pret paša elementa resursdatoru** (lietotāja makro dažādos resursdatoros var atšķirties),
   pēc tam pārveidota skaitļos ar `CNumberParser`. Tāpēc katrs elements nes savu `min`, `max`
   un sakārtotus `thresholds`.
4. JS renderē režģi; katra ciparnīca animē savu adatu virzienā uz savu vērtību, izmantojot
   savu mērogu un sliekšņu zonas.

## Piezīmes / implementācija

- Koplietotā canvas bāze (`class.widget.base.js`) un gauge bāze (`class.gauge.base.js`) ir
  **vienreiz-piešķirami globālie objekti** (`window.X = window.X || class …`) — identiskas
  kopijas atrodas katrā canvas/gauge modulī, un tā, kura ielādējas pirmā, definē klasi.
  Nepārdēvējiet locekļus, kas jau eksistē uz `CWidget` (`_body`, `_fields`, …).
- Sliekšņu vērtības, kas ir **lietotāja makro**, tiek saglabātas kā virknes ar pielāgoto lauku
  `Modules\AnalogGauge\Includes\CWidgetFieldGaugeThresholds` (standarta sliekšņu lauks izmet
  neskaitliskās rindas); kontrolieris tos atrisina un sakārto katram resursdatoram.
- Ritināšana ir tikai manuāla peles vilkšana, ierobežota ar `isEditMode()`, lai tā
  nekonfliktētu ar informācijas paneļa paša vidžetu vilkšanu rediģēšanas režīmā.
- Vienmēr pārbaudiet JS ar linteru pirms ielādes (`node --check assets/js/*.js`) — sintakses
  kļūda moduļa resursā salauž koplietoto bāzes klasi **katrā** informācijas panelī, jo moduļu
  resursi tiek ielādēti visās lapās.

## Demonstrācija

Informācijas panelis **“Analog gauge (grid) demo”** (id `709` mācību instancē) — viena lapa
katram stilam pār `Demo sensors` resursdatoriem ar makro katram resursdatoram
(`{$TEMP.MIN}`/`{$TEMP.MAX}`) un `{$TEMP.WARN}`/`{$TEMP.CRIT}` sliekšņiem, plus **“Grid +
scroll”** lapa (šaurs vidžets, Min gauge size 180 px), kas demonstrē vilkšanas ritināšanu.
Demonstrācijā ir iespējota adatas trīce.
