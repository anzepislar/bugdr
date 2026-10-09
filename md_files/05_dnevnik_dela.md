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

## 6. 10. 2026 — Seja 3: Problemi - seznam, podrobnosti, reševanje, rešen problem, razprava

### Povzetek

Zgrajen je celoten tok problema po Figma dizajnih, na lažnih podatkih:
seznam `/problems`, podrobnosti `/problems/[slug]` (z različico za rešen
problem in razpravo) ter zaslon reševanja `/problems/[slug]/solve`. Vmes je
bilo več krogov popravkov postavitve; iz njih je v `CLAUDE.md` nastal
razdelek **UI Rules**.

### Kaj je narejeno

**Seznam `/problems`** (`src/app/(app)/problems/page.tsx`,
`src/components/problems/ProblemBrowser.tsx`)
- Iskanje (naslov, opis, tagi; `?q=` iz zgornje vrstice ga napolni), filtri
  Role / Difficulty / Topic / Status (privzeto Unsolved) in "Saved problems"
  v isti vrstici, razvrščanje (Recommended = najprej kategorija iz cilja
  uporabnika, nato ocena; Highest rated; Shortest).
- Mreža kartic 1 → 2 (`md`) → 3 (`lg`) → 4 (`2xl`) stolpci, zadnja vrstica
  poravnana levo. **Neskončno drsenje:** prvo nalaganje zapolni višino
  zaslona + eno vrstico, nato po en zaslon, ko se konec seznama pokaže
  (IntersectionObserver); sprememba filtra začne znova.

**Podrobnosti `/problems/[slug]`** (`src/app/(app)/problems/[slug]/page.tsx`,
strežniška komponenta; zavihki so povezave `?tab=`)
- Težavnost, kategorija, tagi, naslov, ocena / čas / število rešitev,
  zavihki Overview / Repository / Discussion.
- Overview: `description` (majhna podmnožica markdowna: `## ` naslovi,
  odstavki, ``` bloki z naslovom, npr. `worker.log`), "Acceptance checks"
  (vsa, v dveh stolpcih), pasica "Discussion is locked" z ikono ključavnice.
- Repository: ime, sklad, poti datotek (brez vsebine).
- Desno lepljiva kartica Start / Resume z repozitorijem (od `lg`; pod
  `lg` je kartica vodoravna in pod vsebino). Zaklenjen zavihek Discussion
  je prazno stanje čez celo višino stolpca.
- **Rešen problem** (po odločitvi uporabnika brez nove poti): zgoraj
  `SolvedSummary` - "Solved", "All checks passed.", **Next problem →
  `/problems`**, "Your result has been recorded.", statistika (čas,
  preverjanja, spremenjene vrstice, težavnost, **točke s časovnim bonusom**),
  "Validation results", "What is next?" (Join the discussion, ocena 1-5 v
  `RateProblem.tsx`); spodaj "About this problem" z istimi zavihki (`#about`
  ohrani položaj).
- **Razprava** (`src/components/problems/Discussion.tsx`, samo za rešen
  problem): razvrščanje Most helpful / Newest, obrazec "Share your approach
  or ask a question..." + Post comment (prazno onemogočeno, največ 2000
  znakov po O2), komentarji (začetnica, ime, vloga iz `goal_role`, relativni
  čas, besedilo kot navadno besedilo - ne HTML), "N helpful" (preklop; ne
  za lastne komentarje), Reply (odgovori eno raven globoko). Zavihek kaže
  število komentarjev ("Discussion 4"). Komentarji se naložijo samo, ko je
  zavihek odprt in je problem rešen.
- Vsebnik: polna širina s `px-6` pod 1400 px, nad tem `max-w-[1200px]`
  na sredini (nova prelomna točka `wide` v `globals.css`). Neznan slug → 404.

**Reševanje `/problems/[slug]/solve`** (`src/app/problems/[slug]/solve/`,
izven skupine `(app)`: lastna celozaslonska glava, brez stranske vrstice)
- `src/components/solve/Workspace.tsx`: glava (logotip, naslov, "Running",
  timer od `startedAt` / meja, rdeč pri 80 % po `02`, Give up, Run tests,
  zapri → podrobnosti), leva vrstica (prikaz/skritje drevesa), drevo
  datotek (`FileTree.tsx`), zavihki odprtih datotek, pot, urejevalnik,
  spodnji panel Terminal / Output / Problems, desno "Scenario checks"
  (`ChecksPanel.tsx`), statusna vrstica.
- `CodeEditorMock.tsx`: samo za branje, videz Monaca (številke vrstic,
  barvanje sintakse, drsenje); Monaco se namesti z R1.
- Run tests: preverjanja se razkrivajo eno za drugim (pending → running →
  passed/failed), izpis v terminal, "3 of 7 passed", "Failure details" za
  izbrano neuspelo preverjanje; `npm run test:scenario` v terminalu naredi
  isto. Ko vsa uspejo → preusmeritev na podrobnosti (rešen problem).
- Rešen problem → nazaj na podrobnosti (R1: 409 `ALREADY_SOLVED`). Od
  1024 px je zaslon točno višine okna, pod tem se zloži in drsi; na telefonu
  je namesto drevesa in zavihkov izbirnik datotek.

**Podatki (tipi in mocki)**
- `src/lib/types/problem.ts`: `ProblemListItem`, `ProblemDetail` (+ `result`),
  `SolveResult`, `ProblemComment`; `src/lib/types/attempt.ts`: `Attempt`,
  `CheckRunResult`, `CheckStatus`.
- `src/lib/mock/problems.ts`: 12 problemov, podrobnosti, koda
  (`mockCodebase`, `README.md` = opis problema), rezultat rešenega problema
  (32:18 od 40 min → 1x, Medium → 250 točk po `03`), komentarji
  (`mockGetComments`). `src/lib/mock/attempts.ts`: `mockStartAttempt`,
  `mockRunTests`. Seznam datotek, imena preverjanj in število komentarjev
  izhajajo iz istega vira na vseh zaslonih.
- Ikone `arrowLeft`, `chevronDown`, `x`, `lock`; drobtinice na
  `/problems/*` kažejo "Problem details".

### Odstopanja od dizajna

- Čas na kartici je časovna omejitev ("40 min"), ne razpon - shema ga nima.
- Barve težavnosti po `CLAUDE.md` (Medium rumena), ne modra iz dizajna.
- "Acceptance checks" v glavnem stolpcu namesto v desnem (odpravi prazen
  prostor ob kratki vsebini).
- Imena preverjanj in naslovi iz enega mocka (dizajni se med seboj
  razlikujejo); kategorija s polnim imenom ("Backend Engineer").
- Zaslon reševanja: dodan "Give up" (`02` ga zahteva - D28), iskanje in
  razširitve v levi vrstici neaktivni (D29).
- Rešen problem: brez "View solution" in brez zavihka "Your solution" (po
  navodilu), dodane točke, 5 zvezdic namesto 4 (O1: 1-5), drobtinice
  "Problem details" namesto "Problem solved".
- Razprava: dodano razvrščanje Newest; "helpful" in odgovori nimata stolpcev
  (D30).

Odprta vprašanja v `06`: D26 (opisi preverjanj na podrobnostih), D27 (ime
repozitorija), D28 (Give up), D29 (leva vrstica reševanja), D30 (helpful in
odgovori na komentarje).

### Tehnične opombe

- `npm run lint`, `npm run typecheck`, `npm run build` uspešni. Projekt še
  nima avtomatskih testov.
- Preverjeno v brskalniku (Playwright, skripte niso v repozitoriju): vse
  strani 320-2560 px brez vodoravnega drsenja, brez napak v konzoli;
  neskončno drsenje (390 px: 2 → 4 → … → 11), filtri, Run tests → "3 of 7
  passed", terminal, 404 in preusmeritve, rešen problem (statistika, ocena,
  Next problem → `/problems`), razprava (razvrščanje, objava, odgovor,
  helpful, HTML se izpiše kot besedilo, nerešen problem ostane zaklenjen).
- Tailwind v4 nima `tailwind.config.ts`: prelomne točke so v `@theme` v
  `globals.css` (`--breakpoint-wide: 1400px`).
- Projekt nima `.prettierrc`; ročno oblikovanje sledi širini 120 znakov.
- Uporabniške spremembe (zaznamki, objave, odgovori, helpful, ocena) živijo
  samo v stanju komponente, dokler jih ne shranijo rezine (D23, O1, O2, D30).

### Git zapis

Predlagani Summary:

`Add the problem flow: list, detail, solve workspace, solved state, discussion (mock data)`

Predlagani Description:

`Adds /problems (search, filters, infinite scroll), /problems/[slug] (description, repository, sticky start card; for solved problems a result summary with points, rating and a discussion with sorting, posting, replies and helpful votes) and the full-screen /problems/[slug]/solve workspace (file tree, read-only Monaco stand-in, terminal, scenario checks). Adds UI Rules to CLAUDE.md. Runs on mock data until slices P1, P2, R1-R6, O1 and O2 exist.`

## 6. 10. 2026 — Seja 4: Tekmovanja (seznam in podrobnosti)

### Povzetek

Zaslona `/contests` in `/contests/[id]` po dizajnih iz Figme, na mock podatkih. Uporablja pravila
"UI Rules" iz `CLAUDE.md`.

### Kaj je narejeno

- `/contests` (`src/app/(app)/contests/page.tsx`, strežniška komponenta):
  naslov, zavihki Live / Upcoming / Past contests kot povezave (`?tab=`, kot
  na podrobnostih problema), kartice tekmovanj in "Your contest history".
- Kartica: sličica, vrsta tekmovanja, težavnost + oznake, naslov, opis,
  število udeležencev, desno "Ends in" / "Starts in" / "Ended" in gumb
  "View contest". Pod `md` se zloži navpično, pod `xl` sta odštevanje in
  gumb pod vsebino.
- Prihajajoča tekmovanja ne razkrijejo problemov (T1): brez težavnosti,
  oznak in sličice (ikona ključavnice).
- Prazno stanje za vsak zavihek, prazna zgodovina.
- Tipi v `src/lib/types/contest.ts`, mock v `src/lib/mock/contests.ts`.
- Odštevanje premaknjeno v skupni `src/lib/format.ts` (`countdown`), ki ga
  zdaj uporablja tudi dashboard.

Dodano po pregledu - podrobnosti tekmovanja:

- `/contests/[id]` (`src/app/(app)/contests/[id]/page.tsx`): oznaki vrste in
  težavnosti, naslov, repozitorij + oznake, "The incident" z diagramom,
  "Contest rules", lepljiva stranska kartica ("Closes in", udeleženci,
  gumb, čas zaprtja v UTC, težavnost, število preverjanj) ter "Your
  participation" z nagrado. Neznan id → 404.
- Stanja: živo (Enter contest / Resume contest / View problem, ko je
  rešeno), prihajajoče (incident skrit za pasico z ključavnico, brez gumba),
  končano ("Ended", View problem - problem je po koncu javen, D17).
- Pod `lg` gre stranska kartica pod vsebino in se postavi vodoravno (kot
  StartCard na podrobnostih problema).
- Gumbi "View contest" na `/contests` zdaj vodijo na `/contests/[id]` (tudi
  za prihajajoča tekmovanja); drobtinice v `AppShell` kažejo "Contest
  details".

### Odstopanja od dizajna

- Podrobnosti: en incident na tekmovanje kot v dizajnu (D33); diagram omejen
  na `max-w-md`, da se SVG ne raztegne; težavnost kot `DifficultyPill`.
- Zgodovina: dodan status "Incomplete" za nepopolne vnose; "checks passed"
  shema nima (D32).
- Sličica ohrani razmerje 15:7 namesto raztezanja na višino kartice.

Odprta vprašanja v `06`: D32, D33 (D31 rešen z dizajnom podrobnosti).

### Tehnične opombe

- `npm run lint`, `npm run typecheck`, `npm run build` uspešni.
- Preverjeno s Playwright (skripta ni v repozitoriju): vsi trije zavihki
  `/contests`, vseh 5 tekmovanj na `/contests/[id]` in neznan id (404) pri
  320, 390, 768, 1024, 1440 in 2560 px - brez vodoravnega drsenja in brez
  elementov, ki bi presegali svoj okvir; seznam → podrobnosti in
  drobtinice delujejo.
- Obe strani sta strežniški komponenti. `Date.now()` je v pomožni funkciji
  `load()`, ker ga ESLint pravilo `react-hooks/purity` v komponenti ne
  dovoli; odštevanje velja ob nalaganju strani (ne teče v živo).

### Git zapis

Predlagani Summary:

`Add the contests list and contest detail pages (mock data)`

Predlagani Description:

`Adds /contests with Live, Upcoming and Past tabs, contest cards with countdowns and the user's contest history, and /contests/[id] with the incident, rules, a sticky entry card and the user's participation. Upcoming contests keep their problems hidden. Moves the countdown formatter into src/lib/format.ts, shared with the dashboard. Runs on mock data until slices T1 and T2 exist.`

## 7. 10. 2026 — Seja 5: Profil in nastavitve

### Povzetek

Zaslona `/profile/[username]` in `/settings` po dizajnih iz Figme, na mock
podatkih. Uporablja pravila "UI Rules" iz `CLAUDE.md`.

### Kaj je narejeno

- `/profile/[username]` (`src/app/(app)/profile/[username]/page.tsx`,
  strežniška komponenta): avatar z začetnico, ime, naslov + jeziki, gumba
  "Edit profile" (samo lasten profil → `/settings`) in "Share profile"
  (kopira povezavo, `ShareProfileButton`). Zavihki kot povezave (`?tab=`):
  - Overview: rešeni, točke, nivo, streak; aktivnost zadnjih 12 mesecev
    (53 tednov, oznake dni, legenda Less/More), streak z razlago; zadnji
    3 rešeni problemi + "View all N".
  - Solved problems: tabela z neskončnim drsenjem in "Showing X of Y"
    (`components/profile/SolvedProblems.tsx`).
  - Contest history: isti seznam kot na `/contests`.
  - Zaseben profil (tuj) → pasica z ključavnico; neznan username → 404.
- `/settings` (`src/app/(app)/settings/page.tsx` +
  `components/settings/ProfileForm.tsx`): zavihki Profile / Practice
  preferences / Account; Profile ima prikazno ime (obvezno), naslov, GitHub
  (vzorec GitHub uporabniških imen), vlogo, izkušnje, jezike (preklopni
  gumbi) in stikalo javnega profila (`role="switch"`), "Save changes" s
  stanjem shranjevanja.
- Stranska vrstica: "Settings" vodi na `/settings` in je označen kot
  aktiven; drobtinice kažejo "Settings".
- Skupni deli (ponovna uporaba namesto podvajanja):
  - `components/ActivityGrid.tsx` - mreža aktivnosti, izvlečena iz
    `ProgressPanel` (dashboard jo zdaj uporablja); pri ozkem zaslonu drsi
    vodoravno in se odpre na najnovejših tednih.
  - `components/contests/ContestHistory.tsx` - iz `/contests`, naslovi zdaj
    vodijo na `/contests/[id]`.
  - `lib/format.ts`: `duration` (iz podrobnosti problema) in `formatDate`.
  - `mockActivity` v `mock/dashboard.ts` sprejme število dni.
  - Polja obrazca uporabljajo `inputClass`, `FieldLabel`, gumbe iz
    `components/admin/problems/shared.tsx`.

### Odstopanja od dizajna

- "Total XP" → "Total points" (dokumenti govorijo o točkah); "Current
  level" kaže ime nivoja ("Staff") namesto številke.
- "Starting difficulty" → "Production experience" (D36).
- Težavnost v tabeli kot `DifficultyPill`; jeziki imajo tudi neizbrane
  možnosti (preklop).
- Statistike iz `03` (po težavnosti, po kategoriji, povprečni čas) niso v
  dizajnu in niso prikazane.
- Zavihka Practice preferences in Account sta prazna (D35).

Odprta vprašanja v `06`: D34 (polja profila v shemi), D35, D36.

### Tehnične opombe

- `npm run lint`, `npm run typecheck`, `npm run build` uspešni.
- Preverjeno s Playwright (skripta ni v repozitoriju): profil (3 zavihki),
  nastavitve, dashboard in `/contests` pri 320, 390, 768, 1024, 1440 in
  2560 px brez vodoravnega drsenja strani in brez napak v konzoli;
  neznan username → 404; neskončno drsenje (1440 px: 12 → 28 od 147);
  neveljaven GitHub prepreči shranjevanje; jeziki, stikalo, shranjevanje,
  povezava na javni profil in drobtinice delujejo.
- Oznake mesecev v mreži aktivnosti segajo v sosednji prazen stolpec
  (namenoma); zadnja dva stolpca oznake nimata, da se ne odreže.

### Git zapis

Predlagani Summary:

`Add the profile and settings pages (mock data)`

Predlagani Description:

`Adds /profile/[username] (stats, 12-month activity grid, streak, solved problems with infinite scroll, contest history, share and edit buttons, private state) and /settings (profile details, engineering path, languages, public profile switch). Extracts the activity grid and the contest history list into shared components, moves duration and date formatting into src/lib/format.ts, and links Settings in the sidebar. Runs on mock data until slices U1, U2 and T2 exist; profile fields need a schema decision (D34).`


## 7. 10. 2026 — Seja 6: Prijava, registracija, pozabljeno geslo, prenova reševanja

### Narejeno

- `/login`: glava z logotipom in "New to Bugdr? [Sign up]", "Continue
  with GitHub", ločilo "or", e-pošta, geslo, "Remember me", "Forgot
  password?" (→ `/forgot-password`), "Sign in" (→ `/dashboard`), opomba o
  pogojih, noga "© 2026 Bugdr" na dnu zaslona.
- `/signup`: glava "Already a member? [Sign in]", GitHub, polno ime,
  e-pošta, geslo (≥ 12 znakov, namig pod poljem), obvezna kljukica za
  pogoje, "Create account" (→ `/onboarding`, ki še ne obstaja).
- `/forgot-password`: naslov, e-pošta, "Send reset link", "Back to sign
  in". Po oddaji sporočilo "If an account exists for …" - enako za vsak
  e-mail, da stran ne razkrije, ali račun obstaja.
- Skupno: `components/auth/AuthShell.tsx` (`AuthHeader`, `GitHubSignIn`);
  polja in gumbi iz `components/admin/problems/shared.tsx`. Strani so
  zunaj `(app)` postavitve.
- Mock: `src/lib/mock/auth.ts` → `mockLogin`, `mockSignup`,
  `mockRequestPasswordReset`.

### Odstopanja od dizajna

- "ProofSignal" → "Bugdr" (v glavi in nogi).
- Ozadje je `canvas` (kot ostale strani), besedilo gumbov je na sredini.
- "Continue with GitHub" pokaže "not available yet" (D37).
- Na telefonu se besedilo pred gumbom v glavi skrije.
- Stanje po oddaji pozabljenega gesla ni v dizajnu.

Odprta vprašanja v `06`: D37 (GitHub), D38 (polno ime vs. `username`),
D39 (dolžina gesla), D40 (Remember me). Pošiljanje e-pošte za pozabljeno
geslo je odloženo (X5).

### Tehnične opombe

- `npm run lint`, `npm run typecheck`, `npm run build` uspešni.
- Preverjeno s Playwright (skripta ni v repozitoriju): vse tri strani pri
  320, 390, 768, 1024, 1440 in 2560 px brez vodoravnega drsenja; prijava
  → `/dashboard`; registracija s kratkim geslom ali brez kljukice ostane
  na strani, sicer → `/onboarding`; pozabljeno geslo pokaže potrditev.
  Edine napake v konzoli so 404 za prefetch strani, ki še ne obstajajo.

### Git zapis

Predlagani Summary:

`Add the login, signup and forgot password pages (mock data)`

Predlagani Description:

`Adds /login (GitHub button, email and password, remember me, forgot password link), /signup (full name, email, password with a 12 character minimum, terms checkbox) and /forgot-password (confirmation that does not reveal whether an account exists). Shares the auth header and GitHub block in src/components/auth/AuthShell.tsx. Runs on mocks until slice F2; GitHub sign-in, username on signup, password length and remember me are open (D37-D40), password reset email is deferred (X5).`

### Prenova reševanja (split pane)

- `/problems/[slug]`: odstranjen zavihek Repository (seznam datotek);
  ostaneta Overview in Discussion. "Start problem" že vodi na `/solve`.
- Opis in "Acceptance checks" premaknjena v
  `components/problems/ProblemOverview.tsx` (`Description`,
  `AcceptanceChecks`) - ista vsebina na podrobnostih in v levem panelu.
- `/problems/[slug]/solve` (`components/solve/Workspace.tsx`), celozaslonsko
  (100vw × 100vh, brez `(app)` postavitve):
  - zgornja vrstica 48 px: logotip + naslov, timer na sredini, "Give up",
    "Submit" (zažene preverjanja; namesto "Run tests");
  - levo opis (privzeto 40 %, najmanj 300 px, svoj drsnik), ročaj 4 px
    za spreminjanje širine z miško (urejevalnik ostane ≥ 300 px), gumb
    za skrivanje (chevron) → širina 0 z animacijo, gumb za ponovno
    odprtje na levem robu urejevalnika vrne prejšnjo širino;
  - desno urejevalnik (#1e1e1e): vrstica 36 px z zavihkom za vsako
    datoteko in izbirnikom jezika (samo prikaz), številke vrstic #858585;
  - spodaj panel 200 px: Terminal in Test Results (pike: čaka / teče
    (rumena) / uspe (zelena) / pade (rdeča) + izpis napake). Ročaj nad
    panelom je zaenkrat samo videz.
- Pod `md` je odprt opis čez celo širino; chevron preklopi na urejevalnik.
- Odstranjeno: leva vrstica z ikonami, drevo datotek, desni panel s
  preverjanji, statusna vrstica, zavihka Output in Problems (D29 rešeno).
  `components/solve/FileTree.tsx` se ne uporablja več (ni izbrisan).
- `Icon`: dodan `chevronLeft`.

Odstopanja od navodil: timer za nadaljevan poskus (`in_progress`) teče od
začetka poskusa, ne od 00:00 (R1). Namesto enega zavihka so zavihki za vse
datoteke, ker ni več drevesa datotek.

Preverjeno: lint, typecheck, build; Playwright pri 320-2560 px brez
vodoravnega drsenja, `/solve` brez navpičnega drsenja strani; privzeta
širina 40 %, vlečenje omejeno na 300 px / širina − 300 px, skrij → 0,
odpri → prejšnja širina, Submit pokaže rezultate; brez napak v konzoli.

Git zapis (Summary): `Redesign the solve page as a fullscreen split pane`

Animacija ob začetku: na `/solve` se opis najprej izriše čez celo širino
(kot na podrobnostih), nato se v 500 ms (ease-out) skrči na 40 %, levi rob
urejevalnika se premakne z njim - urejevalnik "pripelje" z desne. Ista
animacija velja za skrivanje/odpiranje opisa (prej 300 ms); z
`prefers-reduced-motion` brez animacije. Preverjeno s Playwright
(širina 883 → 737 → 646 → 595 → 576 px).

### Onboarding

- `/onboarding` (`src/app/onboarding/page.tsx`): glava z logotipom in
  "Sign out", oznaka "Your engineering path", 4 črte napredka, "Step N of
  4", 4 koraki na isti poti (stanje v komponenti):
  1. vloga (6 kartic v 2 stolpcih), 2. izkušnje (4 kartice),
  3. cilj (Get hired / Improve my skills / Both),
  4. jeziki (več izbir, `LANGUAGES` iz nastavitev) + "Your starting path"
     (vloga · začetna težavnost iz izkušenj (D19) · prvi izbrani jezik).
- "Continue" je onemogočen, dokler korak ni odgovorjen; "Back" ohrani
  odgovore; "Go to dashboard" shrani (mock) in odpre `/dashboard`.
  Fokus se ob menjavi koraka premakne na naslov.
- Kartice so pravi `radio` / `checkbox` (tipkovnica, bralniki zaslona).
- `STARTING_DIFFICULTY` (prej `DEFAULT_DIFFICULTY` v `RecommendedFeed`)
  in `PLATFORM_GOALS`, `OnboardingAnswers` so v `lib/types/dashboard.ts`.
- `EXPERIENCE_LABEL` ima zdaj besedila iz onboardinga ("Just getting
  started", "Less than 2 years", "2–4 years", "5+ years") - spremeni tudi
  stransko vrstico in `/settings`.
- `AuthHeader` sprejme `children` (desna stran glave).
- Mock: `mockSaveOnboarding` v `src/lib/mock/auth.ts`.

Odstopanja: "ProofSignal" → "Bugdr"; jeziki v vrstnem redu iz
nastavitev; besedilo gumbov na sredini; opomba "You can change your path
later in Settings." samo na 1. koraku (kot v dizajnu).

Odprto v `06`: D41 ("Exploring my path" ni v `goal_role`), D42 (jeziki
niso v F4).

Preverjeno: lint, typecheck, build; Playwright pri 320-2560 px brez
vodoravnega drsenja, celoten potek do `/dashboard`, brez napak v konzoli.

Git zapis (Summary): `Add the onboarding flow (mock data)`

## 7. 10. 2026 — Seja 7: Admin - tekmovanja

### Seznam tekmovanj

- `/admin/contests` (`src/app/(app)/admin/contests/page.tsx`): naslov,
  oznaka ADMIN, iskanje po naslovu, "+ Create contest", zavihki All
  contests (N) / Drafts / Scheduled, tabela Contest (naslov + težavnost ·
  kategorija problema) / Period / Status / Closes (UTC) / Entries / meni
  "⋯" ("View contest page" za objavljena, "Delete draft" s potrditvijo za
  osnutke).
- Pod `md` se stolpci Period, Closes in Entries preselijo pod naslov.
- Neskončno drsenje (po 10) namesto "Next page" iz dizajna - pravilo iz
  CLAUDE.md; "Showing X of Y contests" pod seznamom.

### Ustvarjanje tekmovanja

- `/admin/contests/new` (`.../admin/contests/new/page.tsx`): povezava nazaj,
  "Save draft" (zahteva naslov) in "Schedule" (zahteva cel kontrolni
  seznam), polja naslov, obdobje (Daily/Weekly/Monthly), izbirnik problema
  (iskanje → izbran problem s "Change"), začetek in konec v UTC
  (`datetime-local`), opis, nagrada (neobvezno).
- Konec se samodejno nastavi na zadnjo minuto obdobja (dnevno 00:00 →
  23:59), dokler ga admin ne spremeni ročno.
- "Publishing checklist" desno (na telefonu pod obrazcem), se sproti
  posodablja; po shranjevanju kartica z "Back to contest management" /
  "Create another contest".

### Skupno

- Strani sta v skupini `(app)` (stranska vrstica); `AppShell` za
  `/admin/...` označi stran, ki jo upravlja (Contests), drobtine
  "Admin / Contests" in "Admin / New contest".
- Tipi `AdminContestRow`, `AdminContestDraft`, `ContestProblemOption` v
  `lib/types/contest.ts`; `formatUtcDateTime` v `lib/format.ts`; ikona
  `more`.
- Mock: `src/lib/mock/adminContests.ts`.

Odstopanja: "ProofSignal" → "Bugdr"; kontrolni seznam ima še "Title added",
težavnost je "Hard or Get a job" (`04`); stanje "Ended" za končana
tekmovanja; obrazec začne prazen (dizajn kaže izpolnjenega); podnaslov
vrstice je kategorija problema namesto "Production incident".

Odprto v `06`: D43 (osnutki - `contests` nima stolpca), D44 (pravila
objave, `reward_type`).

Preverjeno: lint, typecheck, build; Playwright pri 320-2560 px brez
vodoravnega drsenja, izbira problema in izpolnjen obrazec, brez napak v
konzoli.

### Prenova upravljanja tekmovanj (po navodilu uporabnika)

- Stanje tekmovanja se nikoli ne shrani: `src/lib/getContestStatus.ts`
  (`draft` = brez `starts_at`, `scheduled`, `active`, `ended`).
  `src/lib/getContestDates.ts` izračuna naslednji termin po vrsti (UTC):
  dnevno od naslednje polnoči 24 ur, tedensko pon 00:00 - ned 23:59:59,
  mesečno od 1. naslednjega meseca do zadnjega dne 23:59:59 (preverjeno s
  skripto, tudi ponedeljek in prehod v novo leto).
- `/admin/contests/new` je zdaj čarovnik v 4 korakih
  (`src/components/admin/contests/ContestWizard.tsx`): osnovni podatki
  (naslov, opis, 3 kartice vrste, pasica "This contest will run from … to
  …", stikalo "Custom dates"), problemi (iskanje, dodani kot oznake z
  odstranitvijo, vsaj 1), nagrada (brez / Subscription / Merch / Points +
  opis), pregled ("Save as Draft" brez datumov, "Schedule Contest").
- Nova pot `/admin/contests/[id]/edit` (isti čarovnik, samo za osnutke in
  načrtovana tekmovanja; drugače zaklenjena pasica).
- `/admin/contests`: zavihki Active / Scheduled / Drafts / Ended s števili
  (najprej skupine na eni strani, nato na željo uporabnika nazaj v
  zavihke), stolpci Contest / Type / Status / Dates / Problems / Reward,
  oznake stanja (Active zelena s pulzirajočo piko), dejanja po stanju:
  Draft - Edit, Schedule, Delete; Scheduled - Edit, Cancel; Active - View
  results; Ended - View results, Archive.
- Tipi: `AdminContest`, `AdminContestDraft`, `RewardType`; mock ima
  shrambo v pomnilniku modula, da se shranjeno vidi na seznamu.
- `StepIndicator` premaknjen iz `/admin/problems/new` v
  `components/admin/problems/shared.tsx` (uporabljata ga oba čarovnika).
- `04_admin.md` posodobljen (stanja, življenjski cikel, samodejni datumi,
  ročni datumi, vsaj 1 problem, arhiviranje).

### Odjava

- Gumb "Log out" (rdeč, ikona `logout`) v stranski vrstici pod Settings;
  zdaj povezava na `/login` (F2 bo pobrisal piškotek).

Rešeno v `06`: D33 (več problemov), D43 (stanje iz datumov), D44 (pravila
načrtovanja). Nova sprememba sheme: `contests.archived_at`.

Preverjeno: lint, typecheck, build; Playwright pri 320-2560 px - celoten
potek (ustvari → načrtuj → prekliči → uredi), vsi zavihki, odjava, brez
vodoravnega drsenja in napak v konzoli.

Git zapis (Summary): `Redesign contest management (status from dates, 4-step wizard) and add log out`


## 7. 10. 2026 — Seja 8: Admin - pregled in nov potek Add Problem

### Pregled (`/admin`)

- `src/app/(app)/admin/page.tsx` (v skupini `(app)` kot ostale admin strani,
  s stransko vrstico; drobtine "Admin / Overview"): naslov "Overview",
  izbira obdobja Today / 7 days / 30 days / All time (gumbi-tablete).
- 5 kartic (`src/components/admin/StatCard.tsx`): Total Users, Active
  Users (+ trend ▲/▼), Problems Published, Solves (+ trend), Active
  Contests (povezava na `/admin/contests`). Obdobje vpliva samo na kartici
  z trendom.
- Grafi (`src/components/admin/Chart.tsx`, knjižnica **recharts** - nova
  odvisnost po navodilu): User Growth (črta, 30 dni, preklop Signups /
  DAU), Solves Per Day (stolpci, 14 dni), Solve Distribution (kolobar po
  težavnosti, skupno v sredini, legenda z %), Solves by Role (vodoravni
  stolpci s števili), User Streaks (stolpci po razponih nizov).
- Tabeli Top Problems (8, oznaka težavnosti) in Needs Attention (8,
  razvrščeno po osipu, nad 70 % rdeče; na telefonu samo naslov in osip).
- Barve težavnosti ne prestanejo preverjanja za barvno slepoto, zato ima
  kolobar 2 px razmike med deli in legendo z imeni in %.
- Mock: `src/lib/mock/adminStats.ts`, tip `AdminOverview` v
  `src/lib/types/adminStats.ts`.

### Add Problem (`/admin/problems/new`) - 3 koraki namesto 6

- Koraki Analysis / Review / Publish; `StepIndicator` dobil različico
  `variant="line"` (pike, povezane s črto; čarovnik tekmovanj ostane
  nespremenjen).
- Analysis (`UploadStep.tsx`): polje za ZIP (po izbiri ime, velikost,
  zelena kljukica), cevovod Duplicate Check (1,5 s) → Production Test
  (2 s) → AI Analysis (3 s) s stanji pending / running / passed / failed /
  skipped; ob napaki kartica z razlogom in "Try again", ostali koraki
  "Skipped"; po uspehu samodejno na Review.
- Review (`ReviewStep.tsx`, 60/40): interna opomba AI, kratek opis (do 300
  znakov, števec), cel opis, tagi; desno (sticky) težavnost 2×2 z "(AI
  suggested)", vloga, preverjanja (urejanje, vrsta, must pass, brisanje,
  dodajanje), "Continue to Publish" (zahteva opisa, vlogo, ≥ 3
  preverjanja).
- Publish (`PublishStep.tsx`): povzetek, "Save as Draft" / "Publish
  Problem", nato potrditev z "View problem" in "Add another problem".
- `DefineStep.tsx` in `ValidateStep.tsx` nista več v uporabi (nista
  izbrisana - čakam na potrditev uporabnika).
- Ikona `upload`.

Odprto v `06`: D45 (naslov, časovna omejitev in dry-run manjkajo v novem
poteku), D46 (časovna okna statistike).

Preverjeno: lint, typecheck, build; Playwright pri 320-2560 px brez
vodoravnega drsenja, celoten potek (naloži → analiza → pregled → objava),
neuspel Duplicate Check za že dodan ZIP, brez napak v konzoli.

### Admin stranska vrstica (po navodilu uporabnika)

- `AppShell` na `/admin/*` pokaže svojo navigacijo: oznaka ADMIN,
  Overview (samo `/admin`), Add problem, Contests, nato "Back to app"
  (namesto "Your path"); drobtine "Admin / …", logotip vodi na `/admin`;
  pas za telefon ima iste povezave + "Back to app".
- Admin strani ne označujejo več uporabniških (prej `/admin/contests` →
  Contests v uporabniški navigaciji).
- `/admin/problems/new` premaknjen v skupino `(app)` (URL enak), da dobi
  stransko vrstico.

Preverjeno: lint, typecheck, build; Playwright 320-2560 px, pravilna
aktivna povezava na vseh admin straneh in na `/dashboard`.


### Dostop brez prijave (po navodilu uporabnika)

- `/dashboard`, `/problems` in `/problems/[slug]` so javni. Urejevalnik
  (`/problems/[slug]/solve`), `/settings`, `/onboarding` in `/admin/*`
  preusmerijo na `/login?next=…` (`src/proxy.ts` - v Next 16 se
  middleware imenuje proxy).
- Mock seja: piškotek `bugdr_session` (`src/lib/session.ts`), nastavita
  ga `mockLogin` (s "Remember me" 30 dni) in `mockSignup`, pobriše ga
  "Log out" (`mockLogout`). F2 ga zamenja s pravim JWT piškotkom pod
  istim imenom.
- `(app)/layout.tsx` prebere piškotek in ga poda v `SessionProvider`
  (`src/components/app/Session.tsx`: `useSignedIn`, `useLoginHref`,
  `Locked`).
- Gost v stranski vrstici: Dashboard, Problems, Contests (brez My
  profile), namesto "Your path" kratko besedilo, spodaj Log in / Sign up;
  v glavi gumb "Log in" namesto avatarja in zvonca.
- Dashboard za gosta: naslov "Debug real code. Get real results.",
  brez pasice "Pick up where you left off", seznam "Start with these
  problems" brez filtra vloge in težavnosti, "Your progress" zamegljen z
  "Log in to unlock" (pod zameglitvijo so vzorčni podatki).
- `/problems` za gosta: brez stanj Solved / In progress; zaznamek in
  "Saved problems" vodita na prijavo.
- `/problems/[slug]` za gosta: brez rešenega stanja, gumb "Log in to
  start" (po prijavi naravnost v urejevalnik) + "Sign up free", besedilo
  zaklenjene razprave omeni prijavo.
- Prijava upošteva `?next=` (samo poti na isti strani - `safeNext`).

Preverjeno: lint, typecheck, build; Playwright - gost na dashboardu,
problemih in podrobnostih, vse štiri zaščitene poti → `/login?next=…`,
prijava iz "Log in to start" pristane v urejevalniku, odjava znova zaklene
urejevalnik; 320-2560 px brez vodoravnega drsenja, brez napak v konzoli.

### Git zapis

Predlagani Summary:

`Add the admin overview, the 3-step Add Problem flow, an admin sidebar and guest access (mock data)`

Predlagani Description:

`Adds /admin: date range pills, five stat cards (total and active users, published problems, solves, active contests) with trends, recharts charts for user growth (signups / DAU), solves per day, solves by difficulty, by role and user streaks, and the Top Problems and Needs Attention tables. Reduces /admin/problems/new from six steps to three: Analysis (ZIP upload and a duplicate check, production test and AI analysis pipeline with per-step states, error card and retry), Review (internal AI note, descriptions, tags, difficulty, role and acceptance checks) and Publish (summary, save as draft or publish, success state). Admin pages get their own sidebar (Overview, Add problem, Contests, Back to app), and Add Problem moves into the (app) group so it has one; the URL is unchanged. Opens /dashboard, /problems and /problems/[slug] to guests: a mock session cookie (set by login and signup, cleared by log out) drives a guest sidebar and top bar, a blurred "Log in to unlock" progress panel, problems without personal status, bookmarks that ask to log in and a "Log in to start" button; a Next 16 proxy redirects the editor, settings, onboarding and admin to /login?next=, and login returns to that page. Adds recharts. Runs on mock data until slices A9, A10, A2, A5, F2 and F3 exist; the missing title, time limit and dry run are open (D45), as are the stats windows (D46).`

## 7. 10. 2026 — Seja 9: Začetek backenda - rezine F0 (ogrodje), F1 (nivoji), F2 (registracija in prijava), F3 (zaščita poti) in F4 (onboarding)

Prva backend rezina iz `06_backend_slices.md`. Frontend ostane na mocku.

- `backend/`: Express 5 + `pg` (edini odvisnosti), ES moduli, Node 24.
  `src/app.js` (aplikacija, `GET /api/v1/health` preveri bazo, 404 in
  enoten format napak `{ error: { code, message, details? } }`),
  `src/errors.js` (`HttpError`), `src/config.js` (env s privzetimi
  vrednostmi za lokalni razvoj), `src/db.js` (pool), `src/server.js`.
- Migracijski runner (D2) v `src/migrate.js`: `.sql` iz `migrations/` po
  imenu, tabela `schema_migrations`, vsaka datoteka v svoji transakciji.
  `npm run seed` požene vse `seeds/*.sql` v eni transakciji (seedi morajo
  biti ponovljivi).
- Skripte: `npm run dev` (`node --watch`), `start`, `migrate`, `seed`,
  `test` (`node:test`, `NODE_ENV=test` → testna baza `bugdr_test`).
- `backend/docker-compose.yml`: PostgreSQL 17, projekt `bugdr` (volumen
  `bugdr_pgdata`), `db-init.sql` ustvari `bugdr_test`. Ime projekta je
  izrecno, ker na računalniku že obstaja tuj volumen `backend_pgdata`
  (19. 9. 2026) - ni bil spremenjen.
- `.env.example` (PORT, DATABASE_URL, TEST_DATABASE_URL), brez skrivnosti.
- Frontend: `next.config.ts` `rewrites` `/api/*` → `BACKEND_URL`
  (privzeto `http://localhost:4000`), `src/lib/api.ts` (`api<T>()` +
  `ApiError` iz enotnega formata napak). Še nič ga ne uporablja.

Preverjeno: `npm test` (3 testi: health 200, 404 v formatu napak,
dvakratni migrate ne naredi nič), `npm run migrate` 2× → "Nothing to
apply"; frontend lint, typecheck, build; `next start` + backend →
`/api/v1/health` prek proxyja vrne 200.

Nadaljevanje - rezina F1 (nivoji):

- `migrations/0001_level_thresholds.sql`: tabela `level_thresholds` iz
  `01` + 7 nivojev (Intern 0 … Distinguished 30 000) kot konfiguracija.
- `backend/src/modules/levels/levels.js`: `getLevels()` in čista
  `levelFor(points, levels)` → `{ level, nextLevel }` v obliki
  frontendovega `LevelInfo`.
- `npm test` teče zaporedno (`--test-concurrency=1`), ker si testne
  datoteke delijo bazo `bugdr_test`.

Preverjeno: 4 testi zeleni (meje 0/499/500/29 999/30 000, `nextLevel`
na dnu in vrhu), `npm run migrate` 2× → enkrat "Applied", nato "Nothing
to apply".

Nadaljevanje - rezina F2 (registracija in prijava). Uporabnik je odločil
D38 (polje Username), D39 (geslo ≥ 8) in D40 (Remember me = 30 dni, sicer
piškotek seje) in naročil: vsako rezino v celoti preizkusi, naprej šele,
ko je vse zeleno.

- `migrations/0002_users.sql`: `users`, `user_stats`; `username` unikaten
  brez razlike v velikosti črk (indeks na `lower(username)`).
- `backend/src/modules/auth/`: scrypt (stdlib), JWT HS256 z id-jem
  uporabnika v httpOnly piškotku `bugdr_session`, `requireAuth` bere
  uporabnika iz baze (D5). `POST /auth/signup` (uporabnik + `user_stats`
  v eni transakciji), `POST /auth/login`, `POST /auth/logout`,
  `GET /auth/me`. Nova odvisnost `jsonwebtoken`, `JWT_SECRET` v
  `.env.example` (obvezen v produkciji).
- Frontend: `/signup` ima polje Username (z namigom
  `bugdr.app/profile/…`) in geslo ≥ 8; `/login` in `/signup` kličeta API
  in pokažeta sporočilo strežnika (napačno geslo, zaseden e-mail /
  uporabniško ime); odjava v stranski vrstici in "Sign out" na
  onboardingu prek `useLogout()` (`Session.tsx`). Mock prijava, registracija
  in odjava odstranjene iz `src/lib/mock/auth.ts`.

Preverjeno: backend `npm test` - 12 testov zelenih (vsa pravila "Končano,
ko" + piškotek seje / 30 dni, validacija 400, odjava, JWT `alg: none`
zavrnjen); `npm run migrate` 2×; frontend lint, typecheck, build;
Playwright proti `next start` + backend: gost na `/settings` →
`/login?next=`, registracija → `/onboarding` s httpOnly piškotkom, Sign
out, napačno geslo, prijava z Remember me nazaj na `/settings` (piškotek
30 dni), zasedeno uporabniško ime (druga velikost črk), odjava iz
stranske vrstice; `/signup` in `/login` brez vodoravnega drsenja pri
320-2560 px; brez napak v konzoli.

Nadaljevanje - rezina F3 (zaščita poti). Uporabnik je odločil D47:
`/contests`, `/contests/[id]` in `/profile/[username]` zahtevajo prijavo.

- Backend: `requireAuth` zavrne bannanega (403 `BANNED`) in osveži
  `last_active_at` največ enkrat na minuto; nov `requireAdmin` (403
  `FORBIDDEN`). Bannan uporabnik se ne more prijaviti (403 `BANNED`, samo
  s pravilnim geslom).
- Frontend: `src/proxy.ts` sejo preveri pri backendu (`/auth/me`):
  neveljaven, star (mock) ali bannan piškotek → prijava + piškotek
  pobrisan; `/admin/*` samo za admina (sicer `/dashboard`); dodane poti
  tekmovanj in profilov. `/login` pokaže sporočilo za suspendiran račun.
- `status: null` za goste na seznamu problemov / podrobnostih / dashboardu
  se premakne v P1/P2/U3 (endpointi še ne obstajajo).

Preverjeno: backend `npm test` - 15 testov zelenih (admin pot: gost 401,
ne-admin 403, admin 200 brez ponovne prijave; ban takoj na obstoječi
seji in ob prijavi; `last_active_at` največ 1× na minuto); frontend lint,
typecheck, build; Playwright: gost na tekmovanjih in profilu → prijava,
`/dashboard` ostane javen, star mock piškotek → prijava in pobrisan,
ne-admin na `/admin` → `/dashboard`, povišan v admina v bazi → `/admin`
se odpre brez ponovne prijave, ban v bazi → naslednja stran prijava in
"suspended" ob prijavi; brez napak v konzoli.

Nadaljevanje - rezina F4 (onboarding). Uporabnik: admin ne bo navaden
uporabnik, poverilnice bo nastavil drugače (zapisano kot odprta D48);
odločil D41 (`goal_role = NULL` = raziskujem) in D42 (jeziki se shranijo).

- `migrations/0003_user_profiles.sql`: `user_profiles` + `languages`.
- `PUT /me/onboarding` (`backend/src/modules/me/me.routes.js`):
  validacija vrednosti (400), upsert (ponovna oddaja posodobi isto
  vrstico). `/auth/me` in prijava vrneta `onboardingCompleted`
  (`findUser` / `toUser` v `auth.service.js`).
- Frontend: onboarding shrani prek API-ja ("exploring" → `null`); dokler
  onboarding ni zaključen, prijava in zaščitene strani vodijo na
  `/onboarding`. Odjava je zdaj polno nalaganje strani (prej je
  predpomnilnik usmerjevalnika po odjavi sprožil 404 za prednaložene
  strani).

Preverjeno: backend `npm test` - 20 testov zelenih (brez seje 401,
neveljavne vrednosti 400 brez zapisa, shranitev + `onboardingCompleted`,
ponovna oddaja = ena vrstica, exploring = NULL, podvojeni jeziki
odstranjeni); `npm run migrate` 2×; frontend lint, typecheck, build;
Playwright F2, F3 in F4 (vsi zeleni, brez napak v konzoli): pred
onboardingom `/settings` → `/onboarding`, shranjeni odgovori v bazi,
ponovna oddaja posodobi, zaključen uporabnik se vrne na `?next=`,
nezaključen gre na `/onboarding`, `/onboarding` brez vodoravnega
drsenja 320-2560 px.

### Git zapis

Predlagani Summary:

`Add the backend skeleton, levels, auth, route protection and onboarding (slices F0-F4)`

Predlagani Description:

`Starts the backend (slice F0 from 06_backend_slices.md). backend/ is an Express 5 app with pg as the only other dependency: config from env with local defaults, a pg pool, a shared error format ({ error: { code, message, details? } }) with a 404 and JSON parse handler, and GET /api/v1/health that checks the database. A small migration runner applies migrations/*.sql in name order, each in its own transaction, tracked in schema_migrations; npm run seed runs seeds/*.sql in one transaction. Tests use node:test against a bugdr_test database. backend/docker-compose.yml runs PostgreSQL 17 locally and creates the test database. The frontend proxies /api/* to the backend through next.config.ts rewrites (same origin for the session cookie) and gets a thin api() helper with an ApiError type. Slice F1 adds the first migration, level_thresholds with the seven levels, and levelFor(points, levels), which returns the current and next level in the frontend's LevelInfo shape. Slice F2 adds users and user_stats, scrypt password hashes and a JWT in the httpOnly bugdr_session cookie (30 days with Remember me, otherwise a browser-session cookie), with POST /auth/signup, /auth/login, /auth/logout and GET /auth/me. The signup page now asks for a username (unique in any case) and an 8-character password; login, signup and both log out buttons call the API instead of the mock. Adds jsonwebtoken. Slice F3 adds requireAdmin, blocks banned users on every request and at login (403 BANNED), and refreshes last_active_at at most once a minute. The Next proxy now checks the session with the backend: an invalid or banned session goes to /login and loses its cookie, /admin is admin-only, and /contests and /profile now require login (D47). Slice F4 adds user_profiles (with languages) and PUT /me/onboarding; "Exploring my path" is stored as a NULL goal role. Until onboarding is done, login and account pages lead to /onboarding. Log out is now a full page load, so no prefetched account page survives it.`

## 8. 10. 2026 — Seja 10: Posodobitev dokumentacije po M0

Uporabnik: "are all md files up to date? If not update them". Koda se ni
spreminjala.

- `00_bugdr_razvoj.md`: Local Setup (Docker compose v `backend/`,
  `.env.example`, `npm test`, proxy `/api`), Current Status (M0 narejen),
  faze (Faza 1 narejena, Faza 2 trenutna), tabela dokumentov + `05`, `06`.
- `01_database.md`: zgrajene tabele zapisane točno po migracijah -
  `users` (`username` unikaten prek `lower(username)`, scrypt),
  `user_profiles` (`goal_role` = slug kategorije `ai-engineer` … ali NULL
  = raziskujem, + `languages`); pravilo: zgrajene tabele v `01` se ujemajo
  z migracijo, načrtovane spremembe ostanejo v `06`.
- `04_admin.md`: dostop z `is_admin` velja od F3, napovedana sprememba D48.
- `06_backend_slices.md`: pravilo usklajevanja z `01`, nedoslednost
  `ai_engineer` zaprta.
- `CLAUDE.md`: odprto vprašanje "schema changes to 01" odstranjeno, stanje.

## 8. 10. 2026 — Seja 11: M1 - priprava, rezini P1 (seznam problemov) in P2 (podrobnosti problema)

Uporabnik: "prepare for the M1 phase", nato "you can start" (P1) in "move on to P2".
Priprava sama ni spreminjala kode.

Navodilo uporabnika: vprašanja (AskUserQuestion) pisati zanj - najprej
situacija v navadnem jeziku, možnosti kot vidni učinki, brez naštevanja tabel.

- Preverjeno okolje: baza v Dockerju teče, `npm test` 20/20 zelen,
  migracije 0001-0003 uveljavljene.
- Odločitve (uporabnik, po priporočilu): **D49** tabele, ki jih P1/P2
  potrebujeta iz R1/O1/O2 (`user_problem_attempts`, `problem_codebase`,
  `problem_checks`, `problem_ratings`, `problem_comments`), se ustvarijo že
  v M1, logika ostane v svojih rezinah; **D23** `problem_bookmarks` +
  `PUT/DELETE /problems/:slug/bookmark` v P1; **D26** in **D27** sprejeta;
  **D16** `problems.summary` odpade (kartica = `short_description`).
- `06_backend_slices.md`: P1 in P2 prepisana (migracije, seed iz mock
  problemov, query parametri `status`/`saved`/`sort`, neobvezna seja za
  goste, streak), P2 postane `M`; D17 filter počaka na `contest_problems`
  (A6/T1); R1/O1/O2 ne ustvarjajo več tabel; tabela sprememb sheme
  posodobljena.

### Rezina P1 - seznam problemov

- `migrations/0004_problems.sql`: `problem_categories` (5 kategorij),
  `problems` (CHECK težavnost ↔ `base_points`, brez `summary` in
  `is_contest_problem`), `problem_tags`, `problem_bookmarks` (D23),
  `user_problem_attempts` (D49). `seeds/0001_problems.sql`: 12 mock problemov.
- `GET /problems` (neobvezna seja - `optionalAuth`), `PUT`/`DELETE
  /problems/:slug/bookmark`. Test `backend/test/p1.test.js` (26/26 zelenih).
- Odstopanje: API vrne cel seznam (razvrščen "recommended"), filtri in
  drsenje ostanejo na odjemalcu - brez paginacije v v1.
- `/problems` bere API, zaznamki prek API-ja. lint, typecheck, build zeleni;
  API preverjen prek Next proxyja (gost, prijavljen, zaznamek). Vizualni
  pregled strani v brskalniku ni bil narejen (orodje za brskalnik ni na voljo).

### Rezina P2 - podrobnosti problema (M1 končan)

- `migrations/0005_problem_detail.sql`: `problem_codebase` (+ `repository_name`,
  `hidden_files`, `solution_files`), `problem_checks`, `problem_ratings`,
  `problem_comments`, `user_daily_activity` (D49 - samo tabele).
- Seed zgeneriran iz mocka: polni opis, koda, repozitorij in preverjanja
  za vseh 12 problemov.
- `GET /problems/:slug` (brez kode, ukazov, skritih datotek; `result` za
  rešen poskus). Ogled prijavljenega zapiše aktivnost dneva (UTC) in streak
  v eni poizvedbi. Test `backend/test/p2.test.js` (32/32 zelenih).
- `/problems/[slug]` bere API na strežniku (`src/lib/serverApi.ts`);
  komentarji in ocena ostanejo mock do O1/O2. lint, typecheck, build
  zeleni; stran preverjena prek dev strežnika (gost, 404, rešen problem,
  streak). Vizualni pregled v brskalniku ni bil narejen.

## 8. 10. 2026 — Seja 12: AI seja - dokumentacija in AI klepet v urejevalniku

Koncept Bugdr se je razširil: inženirji rešujejo hrošče z AI, Bugdr meri,
kako učinkovito (pozivi, žetoni, iteracije, delež urejanj, prvi zagon).

### Dokumentacija

- `CLAUDE.md` in `00_bugdr_razvoj.md`: nov razdelek "What is Bugdr?" in
  slogan; v `00` nova stran `/leaderboard`. Formula točk v `CLAUDE.md`
  dobi `× efficiency_score`.
- `01_database.md`: tabele `solve_sessions`, `prompt_events`,
  `editor_events` (razdelek "AI Session Tracking").
- `02_problems.md`: razdelek "AI Session Capture".
- `03_scoring.md`: "Final Points Formula" = osnova × čas × učinkovitost
  (0,5-2,0), uteži metrik, razponi, primer, nove statistike profila.
- `04_admin.md`: stran `/admin/analytics` (AI Session Analytics).

### Zaslon `/problems/[slug]/solve` - tri plošče

- Desno nova plošča AI klepeta (`components/solve/AiChatPanel.tsx`):
  izbirnik orodja (Claude/GPT-4/Gemini/Other), vrstica statistike seje
  (Prompts/Tokens/Runs), zložljiva "Session Efficiency" (primerjava z
  benchmarkom težavnosti), sporočila s kodo, indikator tipkanja, polje
  1-4 vrstice (Enter pošlje, Shift+Enter nova vrstica), ocena žetonov.
- Plošča: privzeto 320 px, najmanj 280 px, vlečenje levega roba (od
  `lg`), zložljiva (puščica na levem robu; zaprta = puščica na desnem
  robu urejevalnika). Pod `lg` je prekrivna plošča nad urejevalnikom in
  privzeto zaprta.
- `hooks/useSessionTracker.ts`: dogodki seje v React stanju (poziv,
  odgovor, zagon testov, odpiranje datotek, opis odprt/zaprt); iz njih
  izpeljani števci. Mock odgovori v `lib/mock/aiChat.ts`.
- `Workspace` dobi `difficulty` (iz strani) za benchmark.

Preverjeno: lint, typecheck, build zeleni; Playwright proti dev strežniku
(nov uporabnik + onboarding prek API-ja): 320-2560 px brez vodoravnega
drsenja, pošiljanje poziva, indikator tipkanja, odgovor, števci in
Submit (Runs), brez napak v konzoli.

## 8. 10. 2026 — Seja 13: opis problema = kontekst kode + poročilo o incidentu

Opis problema ne sme več namigovati na hrošč: uporabnik vidi samo, kaj sistem
dela, in simptome iz produkcije. Brez "Expected behavior".

### Dokumentacija

- `02_problems.md`: razdelek "Description" zamenjan s "Codebase Context",
  "Incident Report" in "No Expected Behavior section"; datoteke `files`
  brez komentarjev, ki kažejo na hrošč.
- `01_database.md`: `problems.description` → `codebase_context` +
  `incident_report`. `00`: vrstica Problem detail. `CLAUDE.md`: novo
  poslovno pravilo.

### Backend

- `migrations/0006_problem_brief.sql`: novi stolpci (obstoječe besedilo
  gre v `codebase_context`, poročilo prazno), `description` odstranjen.
- `GET /problems/:slug` vrne `codebaseContext` in `incidentReport`
  namesto `description`. Testa P1/P2 posodobljena.
- Seed: besedila za vseh 12 problemov iz `frontend/src/lib/mock/problemBriefs.ts`
  (realni logi, opozorila, podporne prijave).

### Frontend

- `Description` (`ProblemOverview.tsx`) prikaže "Your assignment" (proza)
  in "What the team is seeing" (terminalski blok `#0d1117`, oznaka
  "incident log"); razčlenjevalnik markdowna odstranjen. Velja za
  `/problems/[slug]` in levo ploščo `/problems/[slug]/solve`.
- Mock: `ProblemDetail.description` → `codebaseContext` + `incidentReport`;
  README.md v kodi = kontekst; generična koda brez komentarja "the bug
  lives somewhere in here".

Preverjeno: backend testi 32/32 zeleni, `npm run migrate` + `npm run seed`;
frontend lint, typecheck, build; Playwright (podrobnosti in reševanje,
320-2560 px): brez vodoravnega drsenja, brez "Expected behavior", brez
napak v konzoli.


### Načrt rezin (`06_backend_slices.md`)

- P2, R4, A2, A10 posodobljeni za razdeljen opis in novo formulo točk.
- Nov mejnik M8 - AI seja: S1 AI klepet, S2 zajem dogodkov, S3 ocena
  učinkovitosti v točkah, S4 lestvica, S5 AI analitika (admin).
- Odprte odločitve D50 (Add Problem po razdelitvi opisa), D51 (podrobnosti
  ocene učinkovitosti), D52 (pravilo lestvice).

### Usklajevanje dokumentov

- `00`: Current Status (migracije 0001-0006, AI klepet na mocku, M8), stack
  (Claude API), arhitektura, faze, strani (urejevalnik + AI klepet,
  `/admin/analytics`).
- `01`: AI tabele v pregledu; označene kot načrtovane (S1, S2).
- `02`: "What a Problem Is", vir GitHub, primer preverjanj, stran
  podrobnosti in zaslon reševanja (tri plošče).
- `03`: pregled + nove statistike v tabeli profila. `04`: obrazec problema
  in smernice kakovosti (kontekst + incident, brez pričakovanega vedenja).
- `CLAUDE.md`: stack (AI), poti (`/leaderboard`, `/admin/analytics` -
  načrtovani), zaslon reševanja, izjema `text-lg` za naslova opisa.

## 8. 10. 2026 — Seja 14: M2 priprava + rezina R1 (začetek reševanja)

### Priprava M2

- Seja 13 commitana (`a87b02b`).
- Nove odločitve (uporabnik): D53 - izvedljiv je najprej samo
  `payment-retries-disappear`, ostalih 11 seed problemov je samo za prikaz;
  D54 - izvajalnik samo Node/TypeScript; D55 - R1 doda Monaco.

### Backend (R1)

- `POST /api/v1/problems/:slug/start` (`requireAuth`) v
  `problems.routes.js`: en `INSERT … ON CONFLICT DO UPDATE` - nov poskus,
  obstoječ `in_progress` nespremenjen (timer teče naprej), `abandoned` →
  `in_progress` z novim `started_at` (D8), `solved` → 409 `ALREADY_SOLVED`.
  Vrne `Attempt`: vidne datoteke, ime repozitorija, `startedAt`,
  `timeLimitMinutes`, preverjanja (`id`, `checkOrder`, `description`).
  Nikoli `hidden_files`, `solution_files`, ukazov.
- `backend/test/r1.test.js`: gost 401, neznan/neobjavljen 404, brez
  skrivnosti, ponoven start = isti čas, odstop → nov čas v isti vrstici,
  rešen → 409.

### Frontend (R1)

- `/problems/[slug]/solve`: opis iz `GET /problems/:slug` (`serverFetch`)
  namesto `mockGetProblem`; `Workspace` kliče `POST …/start` (409 → stran
  podrobnosti).
- `@monaco-editor/react` namesto `CodeEditorMock` (tema `vs-dark`, en model
  na poskus in datoteko). Monaco se naloži s CDN jsdelivr (oznaka
  `ponytail:`).
- Osnutki v `localStorage` (D14): ključ `bugdr:draft:<id>:<startedAt>`,
  shranjene samo spremenjene datoteke; ponoven start po odstopu začne z
  izvirno kodo. Zavihki datotek razvrščeni po poti (JSONB ne ohrani vrstnega
  reda).
- `mockStartAttempt` odstranjen; `mockRunTests` ostane do R4.

Preverjeno: backend testi 37/37; frontend lint, typecheck, build;
Playwright (Chrome): urejanje + ponovno nalaganje ohrani osnutek in čas,
rešen problem preusmeri na podrobnosti, 320-2560 px brez vodoravnega
drsenja, brez napak v konzoli.

### Popravek: tri plošče na zaslonu reševanja

- Pod 1024 px je AI plošča prekrila urejevalnik (brez ročaja), odprtje AI
  plošče ali širjenje opisa je urejevalnik stisnilo na 0 px. Zdaj so od
  768 px vse tri plošče v vrsti z ročaji; opis (min 200 px) in AI plošča
  (min 240 px) se skrčita, preden gre urejevalnik pod 300 px. Prekrivanje
  AI plošče samo še na telefonu.
- Ročaj AI plošče je bil pod `aside` (polovica ciljne površine mrtva) -
  `z-10`. Števci v AI plošči ostanejo v eni vrstici.
- `CodeEditorMock.tsx` izbrisan (uporabnik).

Preverjeno: Playwright 800/900/1024/1280 px - vse tri plošče vidne,
urejevalnik ≥ 300 px, oba ročaja delujeta, brez vodoravnega drsenja.
- Ročaja zdaj "potiskata" (uporabnik: vse tri plošče prosto nastavljive):
  ročaj najprej vzame prostor urejevalniku, ko je ta na 300 px, skrči
  ploščo na drugi strani do njenega minimuma. Preverjeno 800-1280 px.
- Uporabnik: ob odprtju zaslona reševanja vsaka plošča 1/3 širine, nato
  prosto nastavljive. Opis in AI plošča začneta pri 33,333 % (AI plošča je
  odprta od 768 px, prej od 1024 px); minimumi 160 / 240 / 200 px; plošča,
  povlečena pod pol svojega minimuma, se zapre (zavihek s puščico jo odpre).
  Preverjeno 800-2560 px: začetek v tretjinah, vsak poteg premakne ročaj
  natanko za razdaljo poteka.
- Vzrok, da je uporabnik videl samo AI ploščo ali urejevalnik: okno ožje od
  768 px = "telefonski" način (ena plošča naenkrat, AI plošča čez
  urejevalnik, brez ročajev). Telefonski način odstranjen: vse tri plošče so
  vedno ena ob drugi in nastavljive, AI plošča odprta ob nalaganju,
  minimumi 80 / 120 / 80 px (ustreza 320 px). Preverjeno 320-1440 px.
- Ročaja pri uporabniku nista delovala (v Playwrightu sta). Poskus s
  celozaslonsko plastjo in preverjanjem `e.buttons` je uporabniku vlečenje
  pokvaril - odstranjen. Zdaj: `setPointerCapture` na ročaju + poslušalci na
  `window` (faza zajema) za `pointermove`/`pointerup`/`pointercancel` v
  `useEffect` med vlečenjem; oba ročaja imata 16 px ciljno površino.
  Preverjeno 600 in 1280 px.
- Uporabnik uporablja **Safari z miško**; ročaja še vedno nista delovala.
  Vlečenje zdaj z mišjimi dogodki namesto pointer dogodkov: `onMouseDown`
  na ročaju (samo levi gumb, `preventDefault` - brez izbire besedila in
  izvornega drag-and-drop), `mousemove`/`mouseup` na `window` (faza
  zajema); med vlečenjem `select-none` na celem zaslonu. Preverjeno v
  Playwright WebKit in Chrome (600, 1280 px).

### Rezina R2 (odstop)

- D28 rešena (uporabnik): gumb "Give up" ostane, potrditev je okno v slogu
  Bugdr namesto `window.confirm`.
- Backend: modul `attempts` - `POST /api/v1/attempts/:id/give-up` → 204
  (idempotentno), tuj/neznan/neveljaven id → 404 `ATTEMPT_NOT_FOUND`, rešen
  → 409 `ALREADY_SOLVED`. Test `backend/test/r2.test.js`.
- Frontend: nov skupni `src/components/ConfirmDialog.tsx` (nativni
  `<dialog>`); potrditev pokliče API, izbriše osnutek in odpre stran
  podrobnosti.

Preverjeno: backend testi 41/41; frontend lint, typecheck, build;
Playwright WebKit: Esc in Cancel zapreta okno (poskus ostane v delu),
Give up → `abandoned` + stran podrobnosti, ponoven start = čas 00:00 in
izvirna koda, brez napak v konzoli.

### Zgodovina poskusov (načrt)

- Uporabnik: ob odstopu naj se beleži število poskusov in porabljen čas.
  Nobena rezina tega ni pokrivala (D8 je prepisal `started_at`). Odločitev
  D56: vsak poskus svoj zapis (`attempt_tries`), za časovni bonus šteje
  vsota vseh poskusov. Nova rezina R2b pred R3; R4 in S1 dopolnjeni.

### Rezina R2b (zgodovina poskusov, D56)

- Migracija `0007_attempt_tries.sql`: vsak poskus svoja vrstica (začetek,
  konec, izid, trajanje); največ en odprt poskus na attempt; obstoječi
  poskusi = try 1.
- Start odpre nov try (prvi start ali po odstopu), give-up ga zapre s
  trajanjem s strežnika - vsak kot en SQL stavek (atomarno).
- `Attempt` dobi `tryNumber` in `previousSeconds`; timer teče naprej čez
  poskuse (namig "Try N"), okno Give up pove, da čas teče naprej.
- `01_database.md`: tabela `attempt_tries`.

Preverjeno: backend testi 46/46 (+5 R2b, tudi vzporedni starti);
frontend lint, typecheck, build; Playwright WebKit: 5 min poskus → odstop →
ponoven start kaže 05:02, "Try 2", try 1 zaprt s 302 s, brez napak.
- Prikaz poskusov (uporabnik): samo na kartici "Problem solved" ("Solved on
  try N · skupni čas" + seznam poskusov); dodano v načrt R4, ker podatki
  nastanejo šele ob rešitvi.

### Rezina R3 (izvajalnik v Dockerju)

- `backend/src/modules/runner/runner.service.js`: `validateFiles` +
  `runChecks` - izoliran kontejner `node:24-alpine` (brez omrežja, omejitve
  CPU/RAM/procesov, samo za branje, ne-root, brez capabilities), datoteke
  prek stdin (skrite zadnje), 20 s na preverjanje (`kill -9 -1` ob izteku),
  kontejner se vedno odstrani. Brez endpointa (R4).
- `payment-retries-disappear` je prvi izvedljiv problem (D53, seed
  `0002_payment_retries_runnable.sql`): čisti Node 24 brez paketov, lasten
  queue z vedenjem BullMQ; hrošč = ponovni poskus z istim `jobId`, ki ga
  queue zavrže. Pokvarjena koda pade preverjanja 1, 5, 6; rešitev uspe vse.
- Odprto: incident log (`attempt=2`, `attempt=3`) se ne ujema z izvedljivo
  kodo - zapisano v Nedoslednosti, odloči uporabnik.

Preverjeno: backend testi 53/53 (+7 R3, s pravim Dockerjem), po testih ni
ostalih kontejnerjev `bugdr-run-*`.

### Rezina R4 (Test in rešitev)

- Migracija `0008_check_results_points.sql`; čiste funkcije
  `scoring.js` (`timeMultiplier`, `finalPoints`, `lineChanges`).
- `POST /api/v1/attempts/:id/test`: zažene preverjanja v Dockerju (R3),
  zapiše rezultate; ko uspejo vsa obvezna, ena transakcija z zaklepom
  vrstice: try zaprt kot `solved`, čas = vsota poskusov (D56), točke
  (dve vrstici v knjigi, D15), statistika, nivo, dnevna aktivnost,
  `solve_count`. Problemi brez skritih preverjanj → `CHECKS_UNAVAILABLE`.
- Frontend: Submit kliče API; ob rešitvi stran podrobnosti s seznamom
  poskusov ("Solved on try N"); Monaco brez lažnih tipnih napak.

Preverjeno: backend testi 64/64 (+11: primer iz `03` 375/500, D56 5 + 6 min
→ 375, dvojni klik = ena nagrada, 500 točk → Junior, knjiga = statistika);
frontend lint, typecheck, build; Playwright WebKit: neizvedljiv problem →
sporočilo, nespremenjena koda → 4/7, popravek → rešeno, "Solved on try 2",
+500 (2x).

### Rezina R5 (terminal)

- `POST /api/v1/attempts/:id/terminal`: ukaz se izvede v kontejnerju
  terminala (en na poskus, ista izolacija kot preverjanja, samo vidne
  datoteke - nikoli skrite), izhod se pretaka kot NDJSON. En ukaz naenkrat,
  30 s, Stop/Ctrl+C ga ustavi; kontejner se odstrani po 10 min
  neaktivnosti, ob odstopu ali rešitvi.
- Frontend: terminal z datotekami urejevalnika, sproten izpis, Stop in
  Ctrl+C. `npm test` je zdaj pravi ukaz (prej je sprožil Submit).
- Popravek med preverjanjem: ukaz takoj po Ctrl+C je dobil 409 - nov ukaz
  zdaj počaka do 3 s na ustavljenega.

Preverjeno: backend testi 71/71 (+7 R5); frontend lint, typecheck, build;
Playwright WebKit (prek Next proxyja): izhod prihaja sproti, `npm test`
"pass 3", Ctrl+C, skrite datoteke niso dosegljive, brez napak v konzoli.

### Rezina R6 (rezultati v živo) - M2 zaključen

- `POST /attempts/:id/test` pretaka NDJSON: `running` in `result` za vsako
  preverjanje sproti, na koncu `done` (rezultati + `solved`).
- Frontend: skupni `apiStream` (Submit + terminal); stanje preverjanj se
  posodablja ob dogodkih, umetni zamik odstranjen.
- `r5.test.js` je bil "nestabilen", ker je štel tudi kontejnerje terminala
  dev backenda (iz mojih Playwright preverjanj) - zdaj šteje samo svoje.

Preverjeno: backend testi 72/72; frontend lint, typecheck, build;
Playwright WebKit: 0 → 1 → … → 7 končanih preverjanj, vedno eno "Running",
brez napak v konzoli.

### Usklajevanje dokumentov po M2

- `00`: Current Status (M2, migracije 0001-0008), Docker v arhitekturi, brez
  mape `docker/`, testi izvajalnika potrebujejo Docker.
- `02`: izvajanje (Submit, pretok rezultatov, izolacija, D9), terminal,
  izvedljivi problemi (D53), zaslon reševanja (tri plošče, Give up z oknom,
  timer čez poskuse), pravila reševanja (D56).
- `03`: čas = vsi poskusi (D56), meje strogo "pod", dve vrstici v knjigi
  točk (D15), učinkovitost 1 do S3.
- `04`: poskusi pri uporabniku v adminu. `06`: sledljivost. `CLAUDE.md`:
  vrstica Frontend, odprti vprašanji (incident log, `mock/attempts.ts`).

## 8. 10. 2026 — Seja 15: M3 priprava

- Osnovno stanje: backend testi 72/72 zeleni (M2 nespremenjen).
- Pregled M3 proti kodi: tabeli `problem_ratings` in `problem_comments` že
  obstajata (0005), `Discussion.tsx` že ima odgovore, "helpful" in
  razvrščanje (samo stanje komponente), `RateProblem.tsx` samo stanje.
- Odločitve (uporabnik): **D30** - shranijo se odgovori (ena raven),
  "helpful" in obe razvrstitvi; **D57** - povprečje ocen samo iz pravih
  ocen, seed začne z 0 ocenami; **D58** - avtor lahko izbriše svoj
  komentar (z odgovori), urejanja ni. Prikazno ime = `username` do U1 (D34).
- `06`: rezini O1 in O2 dopolnjeni (API, napake, frontend, "končano, ko");
  O2 je zdaj `M`.

### Rezina O1 (ocene)

- `PUT /problems/:slug/rating` `{ rating: 1-5 }`: gost 401, neznan/neobjavljen
  404, neveljavna ocena 400, nerešen 403 `NOT_SOLVED`. Transakcija zaklene
  problem, shrani oceno (upsert) in izračuna povprečje znova iz
  `problem_ratings` (D57).
- Seed 0001 brez izmišljenih ocen; ponoven `npm run seed` ocene preračuna.
- `RateProblem` shrani oceno, osveži povprečje v glavi; ob napaki vrne
  prejšnjo oceno in pokaže sporočilo.

Preverjeno: backend testi 75/75 (+3 O1); frontend lint, typecheck, build;
Playwright Chromium 1440 px: `0.0 (0 ratings)` → klik 4 zvezdice →
`4.0 (1 ratings)`, ostane po osvežitvi, brez napak v konzoli (testni
uporabnik nato izbrisan). Opaženo, ni popravljeno: prikaz brez ocen
(`0.0 (0 ratings)`) in ednina `(1 ratings)`.

### Rezina O2 (komentarji) - M3 zaključen

- Migracija 0009: `problem_comments.parent_id` (odgovori ena raven, izbris
  s kaskado), tabela `comment_helpful`.
- Nov modul `comments.routes.js`: `GET/POST /problems/:slug/comments`
  (nerešen ali gost dobi samo `{ count, locked }`), `DELETE /comments/:id`
  (samo avtor), `PUT/DELETE /comments/:id/helpful` (samo po rešitvi, nikoli
  na lasten komentar).
- Enostavneje od načrta: števec helpful se šteje ob branju (brez stolpca),
  razvrščanje ostane na odjemalcu, komentar dobi polje `own`.
- `Discussion.tsx` na API: objava, odgovor, helpful, brisanje z
  `ConfirmDialog`; po spremembi se osveži števec na zavihku.

Preverjeno: backend testi 81/81 (+6 O2); frontend lint, typecheck, build;
Playwright Chromium z dvema uporabnikoma (1440 px): objava, števec na
zavihku, helpful (lasten onemogočen), odgovor, osvežitev, brisanje z
odgovorom; 390 px brez vodoravnega drsenja; brez napak v konzoli; testni
uporabniki izbrisani. `mockGetComments` ni več v uporabi (ni izbrisan).

### Usklajevanje dokumentov po M3

- `00`: Current Status (M3, migracije 0001-0009, seed brez izmišljenih ocen).
- `01`: `problem_comments.parent_id` + indeks, nova tabela `comment_helpful`,
  ocene se izračunajo znova iz `problem_ratings` (O1, D57).
- `02`: pravila komentarjev (odgovori, helpful, 2000 znakov, brisanje) in
  ocen. `06`: tabela sprememb sheme, besedilo O2 brez `helpful_count`.

## 9. 10. 2026 — Seja 16: M4 priprava

Odločitve uporabnika pred M4 (U1 profil, U2 graf aktivnosti, U3 dashboard):

- **D34** rešena: `/settings` shrani vsa polja - prikazno ime, headline,
  GitHub uporabniško ime, jeziki, stikalo "Public profile" (nova stolpca v
  `user_profiles` v U1). Zaseben profil drugim pokaže samo `username`.
- **D35** ostane odprta: zavihka Practice preferences in Account ostaneta
  "coming soon", uporabnik se vrne k njima kmalu.
- **D36** rešena: brez ločene "Starting difficulty" - ostane
  `experience_level` ("Production experience").
- **D24** rešena: feed na dashboardu rešenih problemov nikoli ne kaže,
  stikalo "Hide solved" se v U3 odstrani.

`06` posodobljen (tabela odločitev, sprememba sheme, besedilo U1 in U3).

### Rezina U1 (profil in nastavitve)

- Migracija 0010: `user_profiles` + `display_name`, `headline`,
  `github_username`, `is_public` (D34).
- Nov modul `users.routes.js`: `GET /users/:username` - statistika
  (točke, nivo, rešeni iz poskusov, streak) in seznam rešenih; neznan ali
  bannan → 404; zaseben profil drugim pokaže samo `username`; polje `own`.
- `me.routes.js`: `GET /me/profile` in `PUT /me/profile` (cel obrazec s
  preverjanjem; "Exploring my path" = `goalRole: null`).
- Avtor komentarja kaže prikazno ime.
- Frontend: `/profile/[username]` in `/settings` na API. Ker bi povezava
  "My profile" sicer vodila na 404 (`max`), layout zdaj naloži pravega
  uporabnika (`useMe()`): stranska vrstica, avatar, pozdrav in povezava na
  profil na dashboardu. Po shranjevanju se stranska vrstica osveži.
- Enostavneje od načrta: brez statistike po težavnosti/kategoriji in
  povprečnega časa (zaslon je ne kaže); aktivnost do U2, tekmovanja do T2.

Preverjeno: backend testi 87/87 (+6 U1); frontend lint, typecheck, build;
Playwright Chromium z dvema uporabnikoma: shranjevanje nastavitev (tudi po
osvežitvi), profil lastnika / drugega, zaseben profil (pasica), neznan
uporabnik 404, stranska vrstica in dashboard s pravim imenom, gost brez
"My profile"; brez vodoravnega drsenja pri 320-2560 px; testni uporabniki
izbrisani. `src/lib/mock/profile.ts` ni več v uporabi (ni izbrisan).

### Rezina U2 (graf aktivnosti in streak)

- `GET /users/:username` vrne `activity`: dneve iz `user_daily_activity` od
  ponedeljka pred 52 tedni (53 stolpcev mreže), datumi po UTC. Ločenega
  `/activity` ni (enostavneje - en klic).
- Streak na branje: če zadnja aktivnost ni bila danes ali včeraj, profil
  pokaže 0; najdaljši streak ostane. Brez nočnega opravila.
- Frontend brez sprememb - mreža na profilu zdaj kaže prave podatke.

Preverjeno: backend testi 89/89 (+2 U2); Playwright Chromium: 21 dni
aktivnosti → 15 obarvanih celic, "30 problems solved in the last year",
streak 21 / najboljši 30; po zgrešenem dnevu streak 0, najboljši 30.
Testni uporabnik izbrisan.

### Rezina U3 (dashboard) - M4 zaključen

- Nov `GET /dashboard`: feed = objavljeni nerešeni problemi (D19, D24) v
  vrstnem redu `/problems`, statistika, aktivnost, nedokončan poskus (z
  zadnjim zagonom preverjanj trenutnega poskusa) in zadnje 3 zmage. Gost
  dobi samo feed.
- Brez podvajanja poizvedb: seznam problemov (`listProblems`) in statistika
  profila (`getStats`, `getActivity`, `getSolved`) sta izvlečena in
  uporabljena na obeh mestih.
- Frontend: dashboard bere API; stikalo "Hide solved" odstranjeno (D24);
  zaznamki v feedu so zdaj pravi. Tekmovanja in vzorčna statistika za
  goste ostanejo mock (T1).

Preverjeno: backend testi 93/93 (+4 U3); frontend lint, typecheck, build;
Playwright Chromium: rešen problem ni v feedu, privzeti filtri iz cilja in
izkušenj, pasica "Pick up where you left off" s pravim problemom, zaznamek
ostane po osvežitvi (in v bazi), gost vidi 12 problemov in zameglitev;
brez vodoravnega drsenja pri 320-2560 px; brez napak v konzoli. Testni
uporabnik izbrisan.

### Usklajevanje dokumentov po M4

- `00`: Current Status (M4, migracije 0001-0010, zasloni na API).
- `01`: nova stolpca profila v `user_profiles` (0010).
- `03`: streak na branje (U2), mreža 53 stolpcev, kaj profil zdaj kaže.
- `06`: rezine U1-U3 ✅, register mockov, odločitve D24, D34, D36.

## 9. 10. 2026 — Seja 17: M5 priprava

Odločitve uporabnika pred M5 (T1 seznam tekmovanj, T2 udeležba in rezultati):

- **D32** rešena: zgodovina tekmovanj (na `/contests` in v profilu) kaže
  rešene probleme + točke (npr. "1/1 solved · 375 pts"), ne preverjanj.
- **D59** (nova) rešena: `/contests/[id]` zaenkrat pokaže samo en (prvi)
  problem tekmovanja; več problemov počaka na dizajn.
- **D60** (nova) rešena: uporabnik sodeluje od "Enter contest" (prvi start
  tekmovalnega problema med tekmovanjem ustvari `contest_entries`).
- **D61** (nova) rešena: v M5 ni lestvice tekmovanja; razvrstitev in
  zmagovalec pridejo z A7.

Privzeto (brez vprašanja): razvojna tekmovanja v seedu, ker admin (A6) še
ne obstaja; `contest_attempt_links` se ne naredi.

`06` posodobljen (odločitve, besedilo T1 in T2, Stanje).

### Rezina T1 (seznam tekmovanj)

- Migracija 0011: `contests` (datumi NULL = osnutek, D43; `archived_at` za
  A6) in `contest_problems` (en problem enkrat na tekmovanje).
- Seed `0003_contests.sql`: 2 aktivni, 1 prihajajoče, 2 končani tekmovanji
  (fiksni id-ji, datumi glede na čas seeda). Aktivno tedensko ima
  `payment-retries-disappear`, da "Enter contest" odpre delujoče reševanje.
- Nov modul `contests.routes.js`: `GET /contests` (tudi za goste, zaradi
  značke) in `GET /contests/:id` (prijava). Prihajajoče tekmovanje ne
  razkrije problema, težavnosti, oznak ali sličice; osnutek je 404.
- D17 končno narejen: problem tekmovanja, ki še ni končano, ni na
  `/problems` in v feedu; problem prihajajočega tekmovanja je 404 povsod
  (podrobnosti, start, zaznamek, ocena, komentarji).
- Frontend: `/contests`, `/contests/[id]`, aktivna tekmovanja na dashboardu
  in značka v stranski vrstici so na API. Udeleženci, udeležba in
  zgodovina pridejo s T2.

Preverjeno: backend testi 97/97 (+4 T1, U3 test dopolnjen s `contests`);
frontend lint, typecheck, build; Playwright Chromium: seznam (Live /
Upcoming / Past), stran aktivnega tekmovanja z incidentom in "Enter
contest" → zaslon reševanja, prihajajoče zaklenjeno brez slug-a v HTML,
neznan id → 404, značka 2 (tudi gost), gost na `/contests` → prijava,
`/problems` brez problemov aktivnih/prihajajočih tekmovanj (9 od 12);
brez vodoravnega drsenja pri 320-2560 px. Testni uporabnik izbrisan.

### Rezina T2 (udeležba in rezultati) - M5 zaključen

- Migracija 0012: `contest_entries` (en vnos na uporabnika na tekmovanje,
  brez `rank` - D61; `contest_attempt_links` ni potrebna).
- "Enter contest" (start problema aktivnega tekmovanja) ustvari vnos (D60).
- Rešitev med tekmovanjem v isti transakciji kot točke (R4) doda rešen
  problem in točke vnosu; rešitev po koncu tekmovanja ne šteje.
- `GET /contests`: pravo število udeležencev in zgodovina (končana
  tekmovanja); `GET /contests/:id`: udeležba; profil: zgodovina tekmovanj.
- Frontend: zgodovina kaže "1/1 solved · 375 pts" (D32), "Your
  participation" "In progress / Completed / Not completed · …", gumb
  Enter / Resume / View problem po udeležbi.

Preverjeno: backend testi 99/99 (+2 T2, eden s pravimi preverjanji v
Dockerju); frontend lint, typecheck, build; Playwright Chromium: "Not
started" → klik "Enter contest" → "In progress · 0/1 solved · 0 pts" in
1 udeleženec → rešitev (500 točk) → "Completed · 1/1 solved · 500 pts" in
"View problem"; zgodovina na `/contests` in v profilu; brez vodoravnega
drsenja pri 320-2560 px; brez napak v konzoli. Testni uporabnik izbrisan.
Opaženo: "1 engineers participating" (ednina) - ni popravljeno.
