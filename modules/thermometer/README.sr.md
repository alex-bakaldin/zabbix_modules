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
- **Vrteška**: svaka izabrana stavka prikazuje se **tačno jednom** — stavke se nikada ne
  dupliraju da bi popunile široki widget. Ako sve stanu, skup je centriran; u suprotnom se
  vrteška skroluje (ograničeno, bez uvijanja). Centralni termometri su pune veličine (više
  njih ako širina dozvoljava), fokusirani je malo veći; bočni se smanjuju i glatko nestaju
  ka ivicama.
- **Pragovi (thresholds)**: **cela kolona žive** se preboji bojom najvišeg dostignutog praga
  (ne samo deo iznad njega). Uz uključen **Interpolate**, boja se glatko preliva između
  pragova — i od osnovne boje žive ispod prvog praga — kako se vrednost menja. Male obojene
  oznake pokazuju nivoe pragova na skali.
- **Korisnički makroi**: **Min**, **Max** i vrednosti pragova mogu biti korisnički makroi
  (npr. `{$TEMP.MAX}`, `{$WARN}`). Razrešavaju se **po stavci, prema hostu same stavke** —
  isti makro može dati različit broj na različitim hostovima, pa svaki termometar crta sa
  sopstvenom skalom i nivoima pragova.
- **Vrednost** na svakom termometru prema `value_pos` (gore / dole / levo / desno / isključeno);
  režim **Track** je prikazuje kao marker-„pero pisača" na vrhu žive (za levo/desno red se
  razmiče da marker stane).
- **Ime** fokusirane stavke — pločica sa strelicom koja pokazuje na njen termometar; ispod je
  red tačkica koje označavaju poziciju.
- **Skrolovanje**: prevlačenjem mišem (nalepi se na najbliži) ili **automatskim skrolom**
  (glatko klaćenje napred-nazad, bez uvijanja, sa pauzom dok je kursor iznad widgeta).
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
| **Min** / **Max** | broj ili makro ² | 0 / 100 | Granice skale za režim Fixed. Može biti korisnički makro (npr. `{$TEMP.MIN}`). |
| **Units (override)** | tekst | — | Merne jedinice. Prazno → uzimaju se iz stavke. |
| **Decimals** | ceo broj 0–10 | 1 | Broj decimala vrednosti. |
| **Value position** | select | Top | Gde prikazati vrednost: `Off` / `Top` / `Bottom` / `Left` / `Right`. |
| **Track mercury top (marker)** | polje za potvrdu | isključeno | Vrednost kao marker-„pero" na vrhu žive (za `Left`/`Right`). |
| **Auto-scroll cycle, s (0 = off)** | ceo broj 0–3600 | 0 | Sekundi za puno klaćenje napred-nazad. `0` isključuje automatski skrol. Pauza pri prelasku mišem. |
| **Show bulb** | polje za potvrdu | uključeno | Crta balon na dnu. Bez balona živa se crta od nule. |
| **Mercury color** | boja | `D81B18` | Osnovna boja žive (ispod prvog praga). Gradijent se gradi iz nje. |
| **Thresholds** | boja + redovi vrednosti ² | — | Preboji celu kolonu žive kada vrednost dostigne prag. Svaka vrednost može biti korisnički makro. |
| **Interpolate color between thresholds** | polje za potvrdu | isključeno | Glatko prelivanje boje žive između pragova umesto skokovite promene. |

¹ Na **template** dashboardu polja *Host groups* i *Hosts* su skrivena — stavke se razrešavaju
prema trenutnom / zamenjenom hostu.

² **Korisnički makroi** u poljima *Min*, *Max* i *Thresholds* jesu jedna zajednička
konfiguracija, ali se razrešavaju **po stavci — prema hostu same stavke**, pa isti makro
može dati različit broj na različitim hostovima i svaki termometar zadržava sopstvenu
skalu/pragove. (Na **template** dashboardu izbor je ograničen na jedan host, pa ovo nema efekta.)

## Interakcija

- **Prevlačenje mišem** levo/desno skroluje vrtešku; po otpuštanju se nalepi na najbliži
  termometar. U režimu izmene dashboarda prevlačenje preuzima dashboard.
- **Automatski skrol** (`Auto-scroll cycle`) klati stavke napred-nazad (ping-pong, bez
  uvijanja); **pauziran dok je kursor iznad widgeta**. Kada sve stavke stanu u widget,
  nema šta da se skroluje.
- **Fokus** — **pređite mišem** preko bilo kog termometra da ga fokusirate: malo se uveća,
  posvetli i pojavi se pločica sa njegovim imenom. Ovo radi i kada sve stane i dok se vrteška
  skroluje, pa možete fokusirati i imenovati čak i ivične stavke. Bez prelaska mišem fokusiran
  je srednji. (Kada je vrednost prikazana na dnu, pločica sa imenom prelazi na vrh da ne
  prekriva vrednosti.)

## Struktura modula

```text
thermometer/
  manifest.json                 id/namespace/js_class, akcija, resursi
  includes/WidgetForm.php       polja forme (obrasci, tagovi, prikaz, pragovi)
  includes/CWidgetFieldThermoThresholds.php  polje pragova koje prihvata i korisničke makroe
  actions/WidgetView.php        razrešavanje stavki po obrascu+tagovima, vrednosti iz istorije,
                                zajednički auto_min/auto_max, razrešavanje makroa u min/max/pragovima
  views/widget.view.php         setVar(items, auto/range min/max, pragovi, fields_values)
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
