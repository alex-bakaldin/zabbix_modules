# Analogni merač (canvas) — Zabbix widget za kontrolnu tablu

[English](README.md) | [Русский](README.ru.md) | **Srpski** | [Polski](README.pl.md) | [Latviešu](README.lv.md)

Widget sa **mrežom analognih merača** za više stavki. Prikazuje vrednosti nekoliko stavki
(izabranih po obrascu naziva i filtriranih po tagovima) kao okrugle brojčanike, poređane u
mreži. Svaki brojčanik animira svoju kazaljku ka trenutnoj vrednosti stavke; kada stavka nema
podataka, kazaljka izvodi spori demo prelaz. Sve se iscrtava proceduralno na
`<canvas>`-u (bez slikovnih resursa).

To je srodni widget u obliku mreže za widget [Thermometer](../thermometer): isti model
podataka (obrazac + tagovi + makroi po hostu + pragovi), ali raspoređen u **mrežu umesto
horizontalnog karusela**, sa četiri vizuelna stila koja se mogu birati.

![Analog gauge styles](docs/styles.png)

- **id:** `analog_gauge` · **namespace:** `AnalogGauge` · **type:** `widget`
- Klasa za renderovanje: `WidgetAnalogGauge` (nasleđuje zajedničku osnovu `CWidgetGaugeBase` →
  `CWidgetCanvasBase`).

## Features

- **Više stavki sa više hostova** — izabranih po **obrascu naziva** (zamenski znaci `*`)
  i filtriranih po **tagovima** (izvorni model *SVG graph*-a; `inheritedTags` uzima u obzir i
  tagove hosta). Prikazuju se **samo numeričke stavke** (float / unsigned); tekstualne, log i
  karakter stavke se filtriraju.
- **Raspored u mreži**: svaka odgovarajuća stavka postaje sopstveni brojčanik, poređan u
  mreži. Broj kolona se bira automatski tako da brojčanici budu što kvadratniji (i što veći)
  moguće, ili ga možete fiksirati pomoću opcije **Grid columns**.
- **Minimalna veličina + skrolovanje**: kada je podešena opcija **Min gauge size**, brojčanici
  se nikada ne smanjuju ispod te veličine — ono što ne stane dostiže se **prevlačenjem mišem**, po
  **obe ose** (pojavljuju se tanki indikatori klizača). Sa Min gauge size `0` mreža uvek staje u
  widget (bez skrolovanja). Nema automatskog skrolovanja — pomeranje je samo ručno.
- **Četiri stila**, koji dele istu geometriju brojčanika od 270°:
  - **Retro** — starinski mesingani okvir, krem lice, serifni brojevi, klasična crna kazaljka.
  - **Cyberpunk** — tamni disk, neonski luk napretka i užarena kazaljka, monospace očitavanje.
  - **Industrial** — masivni čelični okvir sa zavrtnjima, mat grafitno lice, podebljana kazaljka,
    traka opasnosti/praga blizu vrha.
  - **Minimal** — bez okvira; ravan luk napretka i veliki centrirani broj, prilagođen temi
    (svetla / tamna).
- **Pragovi**: vrednosti pragova definišu **obojene zone na luku brojčanika**, a
  digitalno očitavanje (i luk napretka u stilovima Cyberpunk / Minimal) preuzima
  boju **najvišeg dostignutog praga**. Zone pragova mogu se isključiti.
- **Korisnički makroi**: **Min**, **Max** i vrednosti pragova mogu biti korisnički makroi
  (npr. `{$PRESSURE.MAX}`, `{$WARN}`). Oni se razrešavaju **po stavci, u odnosu na sopstveni
  host svake stavke** — isti makro može da se razreši u različit broj na različitim hostovima, pa
  se svaki brojčanik renderuje sa sopstvenom skalom i nivoima pragova.
- **Opseg**: **Fixed** (iz Min / Max) ili **Auto** — jedinstvena zajednička skala izračunata
  iz kombinovane istorije poslednjeg sata **svih** stavki (uz dopunu od ±5%).
- **Digitalna vrednost** (opciono) prikazana u centru / umetku svakog brojčanika, formatirana na
  izabrani broj decimala sa jedinicama stavke (ili sa zamenskom vrednošću).
- **Podrhtavanje kazaljke** (opciono): kazaljka / pokazivač lagano podrhtava, imitirajući živ
  instrument — pokret oko lakše uočava nego statičnu poziciju. **Samo kazaljka
  podrhtava; digitalna vrednost nikada ne.**
- **Naziv stavke** prikazan ispod svakog brojčanika (skraćen da bi stao); prelaskom mišem preko
  brojčanika dobijate opis sa punim nazivom i hostom.
- **Glatka animacija kazaljke** po stavci (vrednosti se pri svakom osvežavanju blago približavaju
  svom cilju); demo prelaz se pokreće kada stavka nema podataka. **Prilagođeno temi** (lica Retro /
  Cyberpunk / Industrial nose sopstvenu pozadinu; Minimal prati svetlu / tamnu temu kontrolne
  table).

## Configuration

| Field | Description |
|-------|-------------|
| **Host groups** | *(samo globalne kontrolne table)* ograniči pretragu hostova na ove grupe. |
| **Hosts** | *(samo globalne kontrolne table)* obrazac(obrasci) naziva hosta, zamenski znaci `*`. |
| **Item patterns** \* | obrazac(obrasci) **naziva** stavke, zamenski znaci `*`. Samo `*` = svaka numerička stavka na pronađenim hostovima. |
| **Item tags** | filter tagova sa **And/Or** ili **Or** evaluacijom. |
| **Override host** | fiksiraj sve stavke na jedan host (npr. na kontrolnoj tabli šablona). |
| **Style** | Retro / Cyberpunk / Industrial / Minimal. |
| **Range** | **Fixed** (Min / Max) ili **Auto** (deljeno, istorija poslednjeg sata ±5%). |
| **Min**, **Max** | granice skale. Obični brojevi **ili** korisnički makroi (`{$LOW}`, `{$PRESSURE.MAX}` …). |
| **Units (override)** | zameni sopstvene jedinice stavke na brojčaniku. |
| **Decimals** | cifre iza decimalne tačke u digitalnoj vrednosti (0–10). |
| **Grid columns** | broj kolona; **0 = auto** (prilagodi brojčanike widgetu). |
| **Min gauge size, px** | minimalna veličina brojčanika za automatski raspored; **0 = prilagodi widgetu** (bez skrolovanja). Kada je > 0, prekoračenje se dostiže prevlačenjem. |
| **Show digital value** | prikaži / sakrij numeričko očitavanje na svakom brojčaniku. |
| **Needle tremor (jitter)** | učini da kazaljka lagano podrhtava (imitira instrument u radu). |
| **Thresholds** | obojeni nivoi; vrednosti mogu biti korisnički makroi. |
| **Show threshold zones on the dial** | oboji obojene zone na luku brojčanika. |

## Data flow

1. Kontroler razrešava **obrasce naziva** stavki preko hostova pronađenih po obrascu
   (ili preko hosta šablona / zamene), filtrirano po tagovima — isti model kao SVG graph
   widget. Preživljavaju samo numeričke stavke (`value_type` filtriran na float / unsigned).
2. Za svaku stavku vraća **poslednju vrednost**, a za režim opsega **Auto** deljeni
   min/max iz kombinovane istorije poslednjeg sata svih stavki (±5%).
3. **Min / Max i svaki string praga razrešavaju se po stavci, u odnosu na sopstveni
   host te stavke** (korisnički makroi mogu da se razlikuju po hostu), zatim se parsiraju u
   brojeve pomoću `CNumberParser`-a. Svaka stavka stoga nosi sopstveni `min`, `max` i sortirane
   `thresholds`.
4. JS renderuje mrežu; svaki brojčanik animira svoju kazaljku ka sopstvenoj vrednosti koristeći
   sopstvenu skalu i zone pragova.

## Notes / implementation

- Deljena canvas osnova (`class.widget.base.js`) i gauge osnova (`class.gauge.base.js`)
  su **globalne promenljive koje se dodeljuju samo jednom** (`window.X = window.X || class …`)
  — identične kopije žive u svakom canvas/gauge modulu, a klasu definiše ona koja se prva
  učita. Ne preimenujte članove koji već postoje na `CWidget`-u (`_body`, `_fields`, …).
- Vrednosti pragova koje su **korisnički makroi** čuvaju se kao stringovi u prilagođenom polju
  `Modules\AnalogGauge\Includes\CWidgetFieldGaugeThresholds` (standardno polje pragova
  odbacuje ne-numeričke redove); kontroler ih razrešava i sortira po hostu.
- Skrolovanje je isključivo ručno prevlačenje mišem, uslovljeno funkcijom `isEditMode()` tako da
  se ne sukobljava sa sopstvenim prevlačenjem widgeta kontrolne table u režimu izmene.
- Uvek lintujte JS pre učitavanja (`node --check assets/js/*.js`) — sintaksna greška u
  resursu modula lomi deljenu baznu klasu na **svakoj** kontrolnoj tabli, jer se resursi modula
  učitavaju na svim stranicama.

## Demo

Kontrolna tabla **„Analog gauge (grid) demo”** (id `709` na instanci za lekciju) — jedna stranica po
stilu preko hostova `Demo sensors` sa makroima po hostu (`{$TEMP.MIN}`/`{$TEMP.MAX}`) i
pragovima `{$TEMP.WARN}`/`{$TEMP.CRIT}`, uz stranicu **„Grid + scroll”** (uzak widget,
Min gauge size 180 px) koja demonstrira skrolovanje prevlačenjem. Podrhtavanje kazaljke je omogućeno u demou.
