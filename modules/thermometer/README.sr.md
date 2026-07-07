# Thermometer (canvas) — Zabbix dashboard widget

[English](README.md) | [Русский](README.ru.md) | **Srpski** | [Polski](README.pl.md) | [Latviešu](README.lv.md)

Widget „vrteška termometara" za više stavki (items). Prikazuje vrednosti nekoliko stavki
(izabranih po obrascu imena i filtriranih po tagovima) kao red staklenih termometara:
centralni je veći i u fokusu, bočni su manji i „izlaze iz kadra". Sve se crta proceduralno
na `<canvas>` elementu (bez slika-resursa).

![Vrteška termometara](docs/carousel.png)

- **id:** `thermometer` · **namespace:** `Thermometer` · **type:** `widget`
- Klasa za crtanje: `WidgetThermometer` (nasleđuje zajedničku bazu `CWidgetGaugeBase` →
  `CWidgetCanvasBase`).

## Mogućnosti

- Više stavki na više hostova — izbor po **obrascu** imena (džokeri `*`) i filtriranje po
  **tagovima** (model izvornog *SVG graph* widgeta; `inheritedTags` uzima u obzir i tagove
  hosta). Prikazuju se **samo numeričke** stavke (float / unsigned); tekstualne, log i
  znakovne se izostavljaju.
- **Vrteška**: beskonačna (u petlji); centralni termometri su pune veličine (više njih ako
  širina dozvoljava), fokusirani je malo veći; bočni se smanjuju i glatko nestaju ka ivicama.
- **Vrednost** na svakom termometru prema `value_pos` (gore / dole / levo / desno / isključeno);
  režim **Track** je prikazuje kao marker-„pero pisača" na vrhu žive (za levo/desno red se
  razmiče da marker stane).
- **Ime** fokusirane stavke — pločica sa strelicom koja pokazuje na njen termometar; ispod je
  red tačkica koje označavaju poziciju.
- **Skrolovanje**: prevlačenjem mišem (nalepi se na najbliži) ili **automatskim skrolom**
  (glatko, sa pauzom dok je kursor iznad widgeta).
- **Zajednički opseg** za sve stavke: fiksni ili automatski (iz objedinjene istorije svih
  izabranih stavki, sa rezervom od ±5%).
- Prirodno crtanje: skala u celim brojevima (pametan korak), uvek označava **0** kada je u
  opsegu (sa osnovnom linijom), min/max su vezani za ravni deo cevi (kupola i dno su „van
  opsega"); bez balona živa se crta od nule (nadole za negativne vrednosti). Boje skale i
  vrednosti prilagođavaju se temi (svetla / tamna).

## Parametri

![Konfiguraciona forma](docs/form.png)

| Parametar | Tip | Podraz. | Opis |
|-----------|-----|---------|------|
| **Host groups** ¹ | multiselect grupa | — | Ograniči hostove na izabrane grupe. Samo na globalnom dashboardu. |
| **Hosts** ¹ | obrasci hostova | — | Obrasci imena hostova (džokeri `*`). Samo na globalnom dashboardu. |
| **Item patterns** | obrasci stavki | — (obavezno) | Obrasci imena stavki (džokeri `*`), razrešavaju se u skup stavki. |
| **Item tags** | evaltype + redovi tagova | And/Or | Filtriranje stavki po tagovima (uzimaju se u obzir i nasleđeni tagovi hosta). |
| **Override host** | multiselect | — | Zamena hosta (za dinamički / template kontekst). |
| **Range** | select | Fixed | `Fixed` — iz polja Min/Max; `Auto (shared, history ±5%)` — zajednički opseg iz objedinjene istorije svih stavki. |
| **Min** / **Max** | broj | 0 / 100 | Granice skale za režim Fixed. |
| **Units (override)** | tekst | — | Merne jedinice. Prazno → uzimaju se iz stavke. |
| **Decimals** | ceo broj 0–10 | 1 | Broj decimala vrednosti. |
| **Value position** | select | Top | Gde prikazati vrednost: `Off` / `Top` / `Bottom` / `Left` / `Right`. |
| **Track mercury top (marker)** | polje za potvrdu | isključeno | Vrednost kao marker-„pero" na vrhu žive (za `Left`/`Right`). |
| **Auto-scroll cycle, s (0 = off)** | ceo broj 0–3600 | 0 | Sekundi za pun ciklus vrteške. `0` isključuje automatski skrol. Pauza pri prelasku mišem. |
| **Show bulb** | polje za potvrdu | uključeno | Crta balon na dnu. Bez balona živa se crta od nule. |
| **Mercury color** | boja | `D81B18` | Boja žive (gradijent se gradi iz izabrane boje). |

¹ Na **template** dashboardu polja *Host groups* i *Hosts* su skrivena — stavke se razrešavaju
prema trenutnom / zamenjenom hostu.

## Interakcija

- **Prevlačenje mišem** levo/desno skroluje vrtešku; po otpuštanju se nalepi na najbliži
  termometar. U režimu izmene dashboarda prevlačenje preuzima dashboard.
- **Automatski skrol** (`Auto-scroll cycle`) glatko kruži kroz stavke; **pauziran dok je
  kursor iznad widgeta**.

## Struktura modula

```text
thermometer/
  manifest.json                 id/namespace/js_class, akcija, resursi
  includes/WidgetForm.php       polja forme (obrasci, tagovi, prikaz)
  actions/WidgetView.php        razrešavanje stavki po obrascu+tagovima, vrednosti iz istorije,
                                zajednički auto_min/auto_max iz objedinjene istorije
  views/widget.view.php         setVar(items, auto_min, auto_max, fields_values)
  views/widget.edit.php         konfiguraciona forma
  assets/js/class.widget.base.js  CWidgetCanvasBase (zajednička canvas osnova, assign-once global)
  assets/js/class.gauge.base.js   CWidgetGaugeBase (vrednost/opseg/animacija/tema)
  assets/js/class.widget.js       WidgetThermometer (vrteška, crtanje, drag/autoscroll)
  assets/css/widget.css           canvas stilovi
  docs/                           snimci ekrana za ovaj README
```

## Instalacija

Kopirajte direktorijum `thermometer` u `zabbix/ui/modules/`, zatim ga registrujte preko
*Administration → General → Modules → Scan directory* i uključite modul. Widget se pojavljuje
u listi tipova pri dodavanju widgeta na dashboard.
