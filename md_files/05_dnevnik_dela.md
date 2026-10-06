# BUGDR — Dnevnik dela

## 6. 10. 2026 — Seja 1: Postavitev projekta, načrt backenda, admin Create Problem

### Povzetek dneva

Postavljena je bila osnovna struktura repozitorija, kot jo določa
`00_bugdr_razvoj.md`, in pripravljen frontend projekt, na katerem bodo
zgrajeni vsi zasloni iz Figma dizajnov. Namen je bil pripraviti čisto izhodišče
za Fazo 1 (frontend z lažnimi podatki): mape za vse dele sistema, Next.js
aplikacija z vgrajenim dizajn sistemom Graphite Signal in skripte za
preverjanje kakovosti (lint, typecheck, build), ki se poženejo po vsakem
zaslonu. Noben zaslon še ni bil zgrajen.

---

### 1. Struktura repozitorija

Ustvarjene so bile mape iz poglavja "Repository Structure":

- `frontend/` - Next.js aplikacija,
- `backend/` - Node.js + Express API (še prazno),
- `docker/` - Docker konfiguracije za izvajanje problemov (še prazno),
- `migrations/` - SQL migracije (še prazno),
- `seeds/` - testni podatki za razvoj (še prazno).

Prazne mape vsebujejo datoteko `.gitkeep`, da jih Git sledi.

V korenski mapi je bila dodana `.gitignore`, ki izključuje `.env` datoteke
(razen `.env.example`), `node_modules/` in `.DS_Store` - skladno s pravilom,
da se gesla in `.env` nikoli ne commitajo.

### 2. Frontend projekt

`frontend/` je bil ustvarjen s `create-next-app`:

- Next.js 16 (App Router, mapa `src/`), React 19, TypeScript,
- Tailwind CSS v4, ESLint,
- alias za uvoze `@/*`.

V `package.json` je bila dodana skripta `npm run typecheck` (`tsc --noEmit`),
tako da so na voljo vse tri obvezne kontrole: `lint`, `typecheck`, `build`.

Next.js 16 sam ustvari `frontend/AGENTS.md` in `frontend/CLAUDE.md` z
opozorilom, da se API-ji razlikujejo od starejših različic - pri neznanih
API-jih je treba preveriti dokumentacijo v `node_modules/next/dist/docs/`.

### 3. Dizajn sistem Graphite Signal

V `src/app/globals.css` so bile vse barve iz dizajn sistema definirane kot
Tailwind teme, zato so na voljo kot običajni razredi:

- osnovne: `canvas`, `surface`, `border`, `action`, `text`, `muted`,
  `highlight` (npr. `bg-surface`, `text-muted`, `border-border`),
- stanja preverjanj: `passed`, `pending`, `failed`,
- težavnosti: `easy`, `medium`, `hard`, `get-a-job`.

Privzeti `rounded` je nastavljen na 6 px (`--radius`). Namen: barve s
posnetkov zaslona niso nujno točne, zato zasloni vedno uporabljajo te
vrednosti in ne barv, odčitanih s slike.

V `src/app/layout.tsx` je bila pisava Geist zamenjana z Inter
(`next/font/google`), naslov strani je "Bugdr", opis pa slogan
"Debug real code. Get real results.". Ozadje strani je `canvas`, besedilo
`text`.

### 4. Načrt backenda po rezinah

Ustvarjen je bil `md_files/06_backend_slices.md` - načrt backenda, razrezan na
majhne navpične rezine (ena rezina = ena seja), ki mu bomo sledili, ko se
začne backend. Namen: med gradnjo frontenda zaslon za zaslonom imeti ves čas
pregled, kaj je narejeno in kaj še manjka, da se pri backendu ne izgubimo.

Vsebuje odločitve, ki blokirajo rezine (D1-D19, s priporočili), skupne
konvencije, mejnike M0-M7 (zagon, problemi, reševanje, skupnost, profil,
tekmovanja, admin, produkcija), register mockov (vsak zgrajen zaslon doda
vrstico) in seznam vrzeli v dokumentih. Najpomembnejši najdeni vrzeli: shema
nima mesta za skrite testne datoteke (uporabnik bi lahko uredil teste, da
uspejo - D10) in nima referenčne rešitve, s katero bi admin preveril
preverjanja pred objavo (D11).

Uporabnik je isti dan potrdil vse odločitve D1-D19 po priporočilu. V
dokumentu so zdaj zapisane kot dokončne, odvisnosti rezin od odločitev so
odstranjene, dodana je tabela "Spremembe sheme glede na `01_database.md`"
(`problems.thumbnail_url`/`summary`, `problem_codebase.hidden_files`/
`solution_files`, brez `is_contest_problem` in `contest_entries.attempt_id`).
`01_database.md` ni bil spremenjen.

### 5. Admin: zaslon Create Problem (`/admin/problems/new`)

Prvi zaslon frontenda: tok za ustvarjanje problema v 6 korakih - Upload →
Analysis → Review → Define → Validate → Publish. Namen: admin naloži ZIP s
pokvarjeno kodo, AI predlaga opis, težavnost, preverjanja, skrite testne
datoteke in tage, admin jih pregleda in popravi, izbere nivo in oznako,
preveri, da preverjanja padejo na pokvarjeni kodi, in problem shrani kot
osnutek ali objavi.

**Vse je na mocku (odločitev uporabnika, pravilo Faze 1):** analiza, zagon
preverjanj in shranjevanje so v `src/lib/mock/adminProblems.ts`; ni API poti,
ni Claude klica, ni Dockerja, ni novih odvisnosti (`adm-zip` ni nameščen).
Pravi backend je zapisan kot rezina A10 (+ A2, A4, A5) v
`06_backend_slices.md`.

- `page.tsx` drži stanje in korake (stopnice na vrhu, Nazaj/Naprej, vsak
  korak mora biti zaključen: Review zahteva naslov, oba opisa in vsaj 3
  izpolnjena preverjanja; Define zahteva oznako in časovno omejitev;
  Validate zahteva končan zagon).
- Komponente v `src/components/admin/problems/`: `UploadStep` (povleci in
  spusti, samo `.zip`, ime + velikost), `ReviewStep` (interna opomba v
  črtkanem okvirju, urejanje opisov, tagi, kartice preverjanj z vrsto,
  ukazom v monospace, stikalom "Must pass", brisanjem in dodajanjem, skrite
  datoteke zložene v `<details>`), `DefineStep` (nivo v barvah težavnosti,
  oznaka = 5 kategorij, časovna omejitev s priporočenim razponom iz `04`,
  neobvezna sličica), `ValidateStep` (preverjanja tečejo eno za drugim,
  opozorilo "This check passes on the buggy code — it may not be testing the
  right thing"), `PublishStep` (povzetek, "Save as Draft", "Publish" samo po
  uspešni validaciji), `shared.tsx` (skupni razredi in mali gradniki).
- Tipi v `src/lib/types/problem.ts`: `ProblemAnalysis`, `Check`,
  `AdminProblemDraft`, `CheckValidationResult`, `ProblemForm`, konstante
  težavnosti, točk, časovnih omejitev in kategorij.
- **Dodano poleg specifikacije, ker baza to zahteva:** polje Title (z
  izpeljanim slugom) in časovna omejitev (oba `NOT NULL` v `problems`). Ob
  spremembi nivoja časovna omejitev sledi priporočenemu minimumu, dokler je
  admin ne spremeni ročno.
- Vsaka sprememba preverjanj razveljavi zadnjo validacijo, zato objava z
  nepreverjenimi preverjanji ni mogoča.
- Mock pravilo: preverjanje vrste `lint` uspe na pokvarjeni kodi, ostala
  padejo - tako je opozorilna pot vidna (izbriši lint preverjanje → validacija
  uspe → Publish se odklene). Prazen ZIP pokaže napako analize.

Odprta vprašanja so zapisana v `06_backend_slices.md` kot D20-D22:
pravilo validacije (D20 - specifikacija zahteva, da vsa preverjanja padejo,
D11 pa tudi uspeh na rešitvi; negativna preverjanja legitimno uspejo že na
pokvarjeni kodi), Claude analiza samo v backendu (D21), shranjevanje
razpakiranega ZIP-a (D22). Nov stolpec `problems.bug_summary`.

### 6. Logotipi

Uporabnik je dal dva logotipa (prozoren PNG, svetel na temnem). Shranjena sta v
`frontend/public/logo/`, obrezana na vsebino (izvirnika sta imela ~70 %
praznega roba in šum v alfa kanalu, vrednosti ≤ 1 so bile počiščene):
`bugdr-logo.png` (znak + napis "bug.dr", 447×126), `bugdr-wordmark.png`
(napis z očesom kot piko, 352×111) in iz prvega izrezan samo znak
`bugdr-mark.png` (90×126, za favicon in majhne prostore). V `CLAUDE.md` je
dodan razdelek "Logos" s pravilom, da se logotip nikoli ne rekreira s
posnetkov zaslona. Privzeti `src/app/favicon.ico` (create-next-app) je bil z
dovoljenjem uporabnika zamenjan z znakom na zaobljenem kvadratu barve canvas
(16/32/48/64 px) - na prozornem ozadju bi bil svetel znak na svetlih
zavihkih brskalnika neviden. Postavitev logotipov se odloči ob prvih dizajnih.

### Tehnične opombe

- `npm run lint`, `npm run typecheck` in `npm run build` v `frontend/` so bili
  uspešni.
- `src/app/page.tsx` in slike v `public/` so še privzete iz `create-next-app`.
- Monaco Editor še ni nameščen - doda se pri zaslonu
  `/problems/[slug]/solve`.
- Zaslon `/admin/problems/new` preverjen v brskalniku (Playwright, Chrome): celoten tok 1440 px (gumbi onemogočeni do zaključka koraka, opozorilo pri lint preverjanju, brisanje → razveljavljena validacija → ponovna validacija uspe → objava), 390 px brez vodoravnega drsenja, napaka praznega ZIP-a, brez napak v konzoli.
- Ni avtentikacije: `/admin/*` še ni zaščiten (rezina F3/A1).
- Nič še ni bilo commitano; na `main` še ni nobenega commita.

### Git zapis

Predlagani Summary:

`Set up the project and add the admin Create Problem flow (mock data)`

Predlagani Description:

`Creates the repository layout from the project overview (frontend, backend, docker, migrations, seeds) and scaffolds the Next.js 16 + TypeScript + Tailwind v4 frontend. The Graphite Signal palette, difficulty colors and 6px radius are defined as Tailwind theme tokens, Inter replaces the default font, and a typecheck script is added so lint, typecheck and build can run after every screen. A root .gitignore keeps .env files and node_modules out of the repository. Adds the first screen, /admin/problems/new: a six-step Create Problem flow (upload ZIP, AI analysis, review, define level and label, validate checks against the buggy code, save as draft or publish), fully on mock data until the backend slices exist. Also adds the session log and the backend slice plan in md_files.`
---

## 6. 10. 2026 — Seja 2: Dashboard

### Povzetek

Zgrajen je zaslon `/dashboard` po Figma dizajnu, na lažnih podatkih, skupaj
s stransko in zgornjo vrstico, ki ju bodo uporabljali vsi uporabniški zasloni.

### Kaj je narejeno

- **Ogrodje uporabniških strani:** skupina poti `src/app/(app)/` (URL-jev ne
  spremeni) z `layout.tsx` → `src/components/app/AppShell.tsx`: stranska
  vrstica (logotip, Dashboard / Problems / Contests s številom aktivnih / My
  profile, "Your path" s ciljem in izkušnjami iz onboardinga, Settings, Help,
  uporabnik) in zgornja vrstica (drobtinice, iskanje → `/problems?q=`,
  obvestila, avatar). Pod 1024 px se stranska vrstica skrči v vodoraven trak.
- **Dashboard** (`src/app/(app)/dashboard/page.tsx`): pozdrav glede na uro,
  datum, aktivna tekmovanja (tip, "Ends in", težavnost, udeleženci),
  "Pick up where you left off" (nedokončan poskus → `/problems/[slug]/solve`),
  "Recommended for you" (`src/components/dashboard/RecommendedFeed.tsx`:
  filtri kategorija/težavnost/"Hide solved"/razvrščanje, privzeto po D19,
  Reset, zaznamek) in "Your progress" (`ProgressPanel.tsx`: nivo in napredek
  do naslednjega, rešeni, točke, streak tega tedna, graf aktivnosti 17 tednov,
  "solved this month", zadnje rešitve). Dnevi so UTC (D7).
- Skupni gradniki: `src/components/Icon.tsx` (SVG ikone brez knjižnice),
  `src/components/DifficultyPill.tsx`.
- Tipi `src/lib/types/dashboard.ts` (oblika `GET /dashboard`), mock
  `src/lib/mock/dashboard.ts`, sličice problemov v `public/mock/*.svg`.

### Odstopanja od dizajna (zaradi dokumentov)

- Nivo: dizajn kaže "Level 12, 860 XP to level 13", sistem nivojev ima imena
  (`03`) → prikazano "5 · Staff, 2,160 points to Principal".
- "XP" → "points" (izraz iz `03`).
- Kartica problema kaže časovno omejitev ("40 min") namesto razpona
  ("25–40 min"), ki ga shema nima.
- Odbijanje časa ("Ends in", "elapsed") se izračuna ob nalaganju, ne teče
  sproti.

Nova odprta vprašanja v `06`: D23 (zaznamki - ni tabele, zdaj samo v
brskalniku), D24 (filtri feeda in "Hide solved" proti D19), D25 (obvestila -
ni v shemi, zvonec zdaj brez funkcije). Razpon let pri izkušnjah ("2–4 years"
za `mid`) je predpostavka do zaslona onboardinga.

### Tehnične opombe

- `npm run lint`, `npm run typecheck`, `npm run build` uspešni.
- Preverjeno v brskalniku (Playwright): 1440 px primerjano z dizajnom, 390 px
  brez vodoravnega drsenja, filtri / Reset / zaznamek delujejo. Edine napake
  v konzoli so 404 ob predhodnem nalaganju povezav na zaslone, ki še ne
  obstajajo (`/problems`, `/contests`, `/profile/max`).
- Podatki se naložijo šele na odjemalcu (kot bo pravi `fetch`), zato besedila
  odvisna od časa ne povzročajo napak hidracije.

### Git zapis

Predlagani Summary:

`Add the dashboard and the app shell (mock data)`

Predlagani Description:

`Adds the shared sidebar and top bar for signed-in pages via an (app) route group, and the /dashboard screen from the Figma design: live contests, resume banner for the in-progress attempt, recommended problems with filters, and a progress panel with level, streak, activity graph and recent wins. Runs on mock data until slices U3, T1 and U2 exist.`
