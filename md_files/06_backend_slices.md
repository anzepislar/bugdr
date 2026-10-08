# BUGDR — Backend po rezinah (slices)

Razrez backenda na majhne, samostojne kose. **Ena rezina = ena seja / en prompt.**

Ta dokument samo razdeli delo in beleži, kaj je narejeno. Shema ostaja v
`01_database.md`, pravila problemov v `02_problems.md`, točkovanje v
`03_scoring.md`, admin v `04_admin.md`. Če se rezina z njimi ne ujema, zmaga
dokument, razen kjer ga izrecno spremeni odločitev (glej "Spremembe sheme").
Novo razhajanje se zapiše v "Nedoslednosti" in odloči z uporabnikom.

Dokument se dopolnjuje **sproti, med gradnjo frontenda**: vsak zgrajen zaslon
doda vrstico v "Register mockov" in, če je treba, popravi rezino, ki ga bo
povezala na API.

---

## Stanje

```
Zadnja posodobitev: 8. 10. 2026
Backend: M0 ✅ (F0-F4), M1 ✅ (P1 seznam problemov, P2 podrobnosti problema), M2: R1 ✅, R2 ✅, R2b ✅, R3 ✅
Frontend: 17 zaslonov na mocku - /login, /signup, /forgot-password, /onboarding, /dashboard,
          /problems, /problems/[slug] (+ rešen problem + razprava), /problems/[slug]/solve,
          /profile/[username], /settings, /contests, /contests/[id], /admin/problems/new,
          /admin (pregled), /admin/contests, /admin/contests/new, /admin/contests/[id]/edit
Naslednja rezina: R4 (Test in rešitev); D48 (admin) pred M6; M8 (AI seja) čaka D50-D52
```

Oznake: ⬜ ni začeto · 🟨 v delu · ✅ narejeno (z datumom) · ⏸ odloženo

---

## Kako promptati

```text
Naredi rezino P1 iz md_files/06_backend_slices.md
Naredi rezino R4, samo backend (frontend pustiva na mocku)
Naredi rezino R1 - odločitev D7 je: <odgovor>
```

Pravila rezine:

- Rezina je **navpična**: migracija + endpoint + test + zamenjava mocka na
  zaslonu (`MOCK_X` → fetch). "Samo backend" je vedno dovoljen ukaz.
- Odvisnosti so navedene. Rezina z odprto odločitvijo (`D..`) se začne šele,
  ko je odločitev sprejeta.
- Velikost: `S` = ena tabela/endpoint, `M` = nekaj tabel ali pravil,
  `L` = razbij še naprej, če se zatakne.
- Rezina je končana, ko je zelen njen test ("Končano, ko") in
  `npm run lint && npm run typecheck && npm run build` (frontend) +
  `npm test` (backend) + preverjanje zamenjanega zaslona v brskalniku.
- Ob koncu rezine: oznaka ✅ + datum, kratek odstavek **Stanje** (kaj je
  dejansko narejeno, kaj odstopa od načrta, kaj je znano odprto) in vnos v
  `05_dnevnik_dela.md`.

---

## Odločitve

**Vse odločitve D1-D19 so bile sprejete 6. 10. 2026 po priporočilu** (uporabnik:
"all decisions locked in"). Rezine jih upoštevajo kot dejstvo. Nova odločitev,
ki se pojavi med gradnjo, dobi naslednjo številko (D20 …) in ostane odprta,
dokler je uporabnik ne potrdi.

| ID | Vprašanje | Odločitev | Velja za |
| --- | --- | --- | --- |
| D1 | Baza in ogrodje | PostgreSQL 17 + Express + `pg` + navaden SQL (`00`/`01`) | F0 |
| D2 | Migracije | Lasten runner (~30 vrstic): `.sql` datoteke v `migrations/` po vrstnem redu imena, tabela `schema_migrations`, vsaka v svoji transakciji. Brez nove odvisnosti | F0 |
| D3 | Kje živi JWT | **httpOnly cookie** (`SameSite=Lax`, `Secure` v produkciji), nikoli `localStorage`. Next `rewrites` proxy `/api/*` → backend (isti izvor, brez CORS) | F0, F2 |
| D4 | Hash gesel | `crypto.scrypt` (stdlib) | F2 |
| D5 | Ban / admin pri stateless JWT | JWT nosi samo `userId`; vsak zahtevek prebere uporabnika iz baze → ban in `is_admin` veljata takoj | F3 |
| D6 | Kdaj se šteje "odprl problem" za streak | Ob **ogledu podrobnosti problema** (`GET /problems/:slug` za prijavljenega) | P2, U2 |
| D7 | Časovni pas za "dan" | **UTC** za v1 (ena konstanta); `users.timezone` kasneje | P2, U2 |
| D8 | Ponoven poskus po odstopu | **Dovoljen:** ista vrstica `user_problem_attempts` se vrne v `in_progress` z novim `started_at`. Rešen problem se nikoli ne odpre znova | R1, R2 |
| D9 | Po izteku `time_limit_minutes` | Poskus **ostane odprt**, množitelj 1x; kontejner se ugasne in ob naslednjem zagonu ustvari znova | R3, R4 |
| D10 | Zaščita testov pred uporabnikom | Nov stolpec `problem_codebase.hidden_files JSONB` (testi, pomožne datoteke) - nikoli k odjemalcu, v kontejner se zapišejo **po** uporabnikovih datotekah | R1, R3, A3 |
| D11 | Preverjanje preverjanj pred objavo | Nov stolpec `problem_codebase.solution_files JSONB` (samo admin). Dry-run: preverjanja morajo **pasti** na izvirni kodi in **uspeti** na rešitvi | A3, A4, A5 |
| D12 | Docker iz Node | `child_process.spawn("docker", …)` (CLI, brez odvisnosti) | R3, R5 |
| D13 | Terminal | v1 **ukaz-po-ukaz** (`POST` z ukazom → izhod; SSE za dolgotrajne, npr. `npm run dev`). Pravi PTY šele, ko ga UI zahteva | R5 |
| D14 | Neshranjene spremembe med reševanjem | **`localStorage`** v brskalniku (po poskusu); strežnik dobi datoteke ob vsakem Test | R1, R4 |
| D15 | Zapis točk | **Dve vrstici** v `point_transactions`: `problem_solved` = osnova, `time_bonus` = razlika (samo če > 0) | R4 |
| D16 | Kartica problema | Nov stolpec `problems.thumbnail_url VARCHAR(500)`. ~~`summary VARCHAR(200)`~~ odpade (uporabnik 8. 10. 2026): kartica uporablja `short_description VARCHAR(300)` (D45, `ProblemListItem.shortDescription`) | P1, A2 |
| D17 | Tekmovalni problemi na `/problems` | **Skriti, dokler tekmovanje ne konča**, nato javni. `problems.is_contest_problem` se ne uporablja - izpelje se iz `contest_problems` | P1, T1 |
| D18 | Rezultat tekmovanja | `contest_entries.score` = vsota točk rešenih tekmovalnih problemov **znotraj časa tekmovanja**; vez = krajši skupni čas. `contest_entries.attempt_id` se ne uporablja | T2 |
| D19 | Personaliziran feed | Nerešeni objavljeni problemi kategorije iz `goal_role`, težavnost glede na `experience_level`, nato najbolje ocenjeni | U3 |
| D20 | **ODPRTO** - pravilo validacije ob objavi | Zaslon Create Problem (po navodilu uporabnika) zahteva, da **vsa** preverjanja padejo na pokvarjeni kodi, sicer objava ni mogoča. To je v napetosti z D11 (preverjanja morajo tudi **uspeti** na rešitvi, ki je wizard ne zbira) in izloči legitimna negativna preverjanja (npr. "potekel žeton → 401" uspe že na pokvarjeni kodi). Predlog: objava = vsaj eno preverjanje pade na pokvarjeni kodi + vsa uspejo na rešitvi; preverjanje, ki uspe na pokvarjeni kodi, je opozorilo, ne blokada. Zahteva korak za nalaganje rešitve (drugi ZIP) | A10, A4, A5 |
| D21 | **ODPRTO** - Claude analiza | Klic samo v backendu (ključ `ANTHROPIC_API_KEY` nikoli v frontendu), model iz konfiguracije, omejitev velikosti ZIP-a in števila/velikosti datotek, izpusti `node_modules`, `.git`, binarne datoteke; strogo preverjanje JSON odgovora (oblika `ProblemAnalysis`), ob neveljavnem odgovoru 502 `ANALYSIS_INVALID` | A10 |
| D22 | **ODPRTO** - kje živi razpakiran ZIP med analizo in shranjevanjem | Predlog: analiza takoj ustvari osnutek problema (`is_published = false`) in shrani datoteke v `problem_codebase`; odgovor vrne `problemId`, "Save as Draft"/"Publish" sta nato `PATCH` istega osnutka. Brez začasnih map na disku | A10, A2 |
| D23 | ~~Zaznamki (bookmark) na kartici problema~~ → **rešeno 8. 10. 2026** (uporabnik): tabela `problem_bookmarks (user_id, problem_id, created_at, PK(user_id, problem_id))` + `PUT/DELETE /problems/:slug/bookmark` v P1; kartica dobi `saved` | U3, P1 |
| D24 | **ODPRTO** - feed na dashboardu: filtri in rešeni problemi | Dizajn ima filtre (kategorija, težavnost, "Hide solved", razvrščanje). D19 pravi, da feed ne vsebuje rešenih. Predlog: `GET /dashboard/feed?category=&difficulty=&hideSolved=&sort=`, privzeto po D19 (`hideSolved=true`); ko je "Hide solved" izklopljen, so rešeni problemi v feedu z oznako `solved` | U3 |
| D25 | **ODPRTO** - ikona obvestil v zgornji vrstici | Dizajn ima zvonec, shema in dokumenti nimajo obvestil. Predlog: v v1 ikona brez funkcije ali skrita; obvestila kasneje kot svoja rezina | - |
| D26 | ~~Opisi preverjanj na strani podrobnosti~~ → **rešeno 8. 10. 2026** (uporabnik): `GET /problems/:slug` vrne `checks: string[]` = samo `problem_checks.description` po `check_order` (nikoli `check_command`/`expected_output`) | P2 |
| D27 | ~~Ime repozitorija in sklad na strani podrobnosti~~ → **rešeno 8. 10. 2026** (uporabnik): `problem_codebase.repository_name VARCHAR(100)`, sklad = `language` + `framework` + tagi; zavihek Repository pokaže poti iz `repository_structure` (brez vsebine) | P2, A2 |
| D28 | ~~"Give up" na zaslonu reševanja~~ → **rešeno 8. 10. 2026** (uporabnik): besedilni gumb "Give up" v zgornji vrstici + potrditveno okno v slogu Bugdr (`ConfirmDialog`, nativni `<dialog>`) namesto `window.confirm` | R2 |
| D29 | ~~Iskanje in razširitve v levi vrstici zaslona reševanja~~ → **rešeno 7. 10. 2026**: prenova zaslona reševanja (split pane) odstrani levo vrstico in drevo datotek; datoteke so zavihki nad urejevalnikom | R1 |
| D30 | **ODPRTO** - "helpful" in odgovori na komentarje | Dizajn razprave ima "N helpful", "Reply" in razvrščanje "Most helpful"; `problem_comments` nima ničesar od tega. Predlog: `problem_comments.parent_id UUID NULL REFERENCES problem_comments(id)` (odgovori samo ena raven), tabela `comment_helpful (comment_id, user_id, created_at, PK(comment_id, user_id))` + `problem_comments.helpful_count` (posodobljen v isti transakciji), `PUT/DELETE /comments/:id/helpful`, lastnega komentarja ni mogoče označiti, `GET /problems/:slug/comments?sort=helpful\|newest` | O2 |
| D31 | ~~Stran posameznega tekmovanja~~ → **rešeno 6. 10. 2026**: uporabnik je dal dizajn, pot `/contests/[id]` (id, ker `contests` nima sluga). En incident na tekmovanje kot v dizajnu, čeprav shema dovoli več problemov (`contest_problems`) | T1, T2 |
| D33 | ~~En ali več problemov na tekmovanje~~ → **rešeno 7. 10. 2026** (uporabnik, prenova admin tekmovanj): **vsaj 1 problem, lahko več** (`contest_problems`). Javni `ContestDetail.problem` (`/contests/[id]`) je še en problem - T1 ga razširi v seznam | T1, A6 |
| D34 | **ODPRTO** - polja profila iz `/settings` | Dizajn ima prikazno ime, naslov profila (headline), GitHub uporabniško ime, jezike in stikalo "Public profile"; shema nima nobenega (`users` ima samo `username`). Predlog: `user_profiles` + `display_name VARCHAR(50)`, `headline VARCHAR(80)`, `github_username VARCHAR(39)`, `languages TEXT[]`, `is_public BOOLEAN DEFAULT TRUE`; API `PUT /me/profile`. Zdaj fiksen seznam jezikov (`LANGUAGES`) | U1 |
| D35 | **ODPRTO** - zavihka "Practice preferences" in "Account" na `/settings` | Dizajn ju ima, vsebine ne. Zdaj prazno stanje "coming soon". Predlog: Account = e-pošta, sprememba gesla, odjava; Practice preferences = `platform_goal` (F4) | U1, F2 |
| D36 | **ODPRTO** - "Starting difficulty" na `/settings` | Dizajn ima polje Starting difficulty, shema hrani `experience_level`, iz katerega D19 izpelje začetno težavnost. Zdaj polje "Production experience" (isto kot v stranski vrstici) z opombo, da določa začetno težavnost | U1, U3 |
| D32 | **ODPRTO** - "N/M checks passed" v zgodovini tekmovanj | Dizajn kaže preverjanja, `contest_entries` ima `problems_solved` in `total_score`. Zdaj mock vrne `checksPassed`/`checksTotal` (vsota čez probleme tekmovanja), "Completed" = vsa preverjanja uspešna. Predlog: prikaži `problems_solved` / število problemov in točke | T2 |
| D37 | **ODPRTO** - "Continue with GitHub" na `/login` in `/signup` | Dizajn ima prijavo z GitHubom, stack ima samo JWT z geslom (F2). Zdaj gumb pokaže "not available yet". Predlog: v v1 skrit; OAuth kasneje kot svoja rezina (`users.github_id`) | F2 |
| D38 | ~~"Full name" namesto `username` na `/signup`~~ → **rešeno 7. 10. 2026** (uporabnik): obrazec ima polje **Username** (3-50 znakov: črke, številke, `-`, `_`; unikaten brez razlike v velikosti črk), polno ime odpade do `display_name` (D34) | F2, U1 |
| D39 | ~~Minimalna dolžina gesla~~ → **rešeno 7. 10. 2026** (uporabnik): **8 znakov** (zgornja meja 200 zaradi cene scrypta) | F2 |
| D40 | ~~"Remember me" na `/login`~~ → **rešeno 7. 10. 2026** (uporabnik): s kljukico piškotek za 30 dni, brez nje piškotek seje brskalnika; JWT velja največ 30 dni v obeh primerih. Registracija = piškotek seje | F2 |
| D41 | ~~"Exploring my path" na onboardingu~~ → **rešeno 7. 10. 2026** (uporabnik, F4): `goal_role = NULL` = raziskujem; UI vrednost `"exploring"` se ob oddaji pretvori v `null`. D19 feed brez filtra kategorije | F4, U3 |
| D43 | ~~Osnutki tekmovanj~~ → **rešeno 7. 10. 2026** (uporabnik): stanje se **nikoli ne shrani**, vedno se izpelje iz datumov (`getContestStatus`): `starts_at IS NULL` = osnutek, `starts_at > now()` = načrtovano, `starts_at <= now() <= ends_at` = aktivno, `ends_at < now()` = končano. Brez `is_published`. Preklic načrtovanega = `starts_at`/`ends_at` nazaj na NULL. Javni `GET /contests` vrne samo tekmovanja z `starts_at IS NOT NULL` | A6, T1 |
| D44 | ~~Pravila ob objavi tekmovanja~~ → **rešeno 7. 10. 2026** (uporabnik): čarovnik v 4 korakih (`04`). Načrtovanje zahteva naslov, opis, vrsto, ≥ 1 problem, veljavne datume (konec po začetku, začetek v prihodnosti); Hard/Get a job je samo priporočilo. Datumi se izračunajo iz vrste (`getContestDates`, UTC) ali ročno ("Custom dates"). Nagrada: `reward_type` (subscription/merch/points) ali brez, opis obvezen ob izbrani vrsti. Odprto ostaja samo: ali se tekmovanja iste vrste smejo prekrivati | A6 |
| D45 | **ODPRTO** - Add Problem v 3 korakih (Analysis / Review / Publish) | Po navodilu uporabnika (7. 10. 2026) poteka **nima** polja za naslov, časovno omejitev, sličico in koraka Validate (dry-run, D11/D20). Zdaj mock: naslov = kratek opis (slug iz njega je dolg), časovna omejitev = spodnja meja priporočila za težavnost (`TIME_LIMIT_RANGE`). Kratek opis do 300 znakov (`problems.short_description VARCHAR(300)`), D16 `summary VARCHAR(200)` ostaja v nasprotju. Predlog: vrni polje Title v Review; dry-run naj teče v backendu ob objavi (A4/A5 zavrne objavo brez uspešnega dry-runa). Nova koraka cevovoda: preverjanje dvojnikov (predlog: zgoščena vrednost razpakiranih datotek) in produkcijski test (zagon kode v Dockerju) | A10, A2, A4, A5 |
| D46 | **ODPRTO** - časovna okna statistike | `/admin` računa "Active users" in "Solves" za Today / 7 / 30 dni / ves čas s trendom glede na prejšnje enako obdobje. Predlog: aktivnost iz `user_daily_activity`, rešitve iz `user_problem_attempts.solved_at`, "Today" po UTC. Grafi so fiksna okna (30 / 14 dni), ne sledijo izbiri | A9 |
| D47 | ~~Gostje na `/contests`, `/contests/[id]` in `/profile/[username]`~~ → **rešeno 7. 10. 2026** (uporabnik, F3): **zahtevana prijava** - vse tri poti so v `src/proxy.ts`, gost gre na `/login?next=…`. Profili zato niso deljivi zunaj aplikacije | F3, T1, U1 |
| D42 | ~~Jeziki na onboardingu~~ → **rešeno 7. 10. 2026** (uporabnik, F4): shranijo se že v F4 - `user_profiles.languages TEXT[] NOT NULL DEFAULT '{}'`, samo vrednosti iz fiksnega seznama `LANGUAGES` (podvojeni odstranjeni). `/settings` jih uporabi v U1 (D34) | F4, U1 |
| D49 | ~~Tabele, ki jih M1 potrebuje iz kasnejših rezin~~ → **rešeno 8. 10. 2026** (uporabnik): **tabele zgodaj, logika kasneje**. M1 ustvari `user_problem_attempts`, `problem_codebase`, `problem_checks` (R1), `problem_ratings` (O1), `problem_comments` (O2) - samo `CREATE TABLE` po `01` + spremembe iz tabele spodaj; endpointi in pravila ostanejo v svojih rezinah. Seed jih napolni, da se stanja rešen / v delu preverijo na pravih podatkih | P1, P2, R1, O1, O2 |
| D48 | **ODPRTO** - admin ni uporabnik (uporabnik 7. 10. 2026) | Admin **ne bo navaden račun** z `users.is_admin`; poverilnice se nastavijo drugače - uporabnik bo dal e-pošto, geslo in morda še kaj za večjo varnost. Predlog: poverilnice v `backend/.env` (ne v klepetu, ne v repozitoriju): `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (scrypt, ustvari ga ukaz `npm run hash-password`), drugi faktor TOTP (`ADMIN_TOTP_SECRET`, stdlib HMAC), ločen piškotek admin seje s krajšim trajanjem; `requireAdmin` preveri admin sejo namesto `users.is_admin`, proxy enako. Nadomesti Z1 (`create-admin`). Do odločitve F3 `requireAdmin` / proxy uporabljata `users.is_admin` | F3, Z1, A1-A10 |
| D50 | **ODPRTO** - Add Problem po razdelitvi opisa (8. 10. 2026) | Problem nima več `description`, ampak `codebase_context` + `incident_report` (`02`, migracija 0006). Zaslon Add Problem ima še eno polje "Full description", sistemski poziv A10 pa vrača `full_description`. Predlog: dve polji na koraku Review; poziv vrne `codebase_context` in `incident_report` (pravila iz `02`: brez vzroka, brez pričakovanega vedenja). Ker je poziv "dobesedno iz specifikacije", ga spremeni uporabnik |
| D51 | **ODPRTO** - podrobnosti ocene učinkovitosti (`03`, 8. 10. 2026) | Odprto: (a) kaj je "iteracija" (par poziv-odgovor ali zagon testov med pozivi?); (b) delež urejanj zahteva razlikovanje AI vs. ročnih sprememb - mogoče samo za vgrajeni klepet (gumb "Apply"), zunanja orodja štejejo kot ročna (`02`); (c) kako uteži preslikati v 0,5-2,0 (linearno glede na benchmark težavnosti?); (d) omejitev pozivov/žetonov na poskus in kdo plača Claude API; (e) ali se izbrano orodje (GPT-4, Gemini) le zabeleži, ker vgrajeni klepet kliče samo Claude |
| D52 | **ODPRTO** - lestvica `/leaderboard` (`00`, 8. 10. 2026) | "Global ranking by efficiency score": povprečje `efficiency_score` vseh rešitev ali skupne točke (te že vsebujejo učinkovitost)? Najmanjše število rešitev za uvrstitev, časovno okno (vse / mesec), javna za goste? Zaslona še ni |
| D53 | ~~Izvedljivi problemi za M2~~ → **rešeno 8. 10. 2026** (uporabnik): najprej **en** pravi problem - `payment-retries-disappear` dobi skrite teste (`hidden_files`), rešitev (`solution_files`) in preverjanja, ki tečejo brez npm paketov. Ostalih 11 seed problemov ostane samo za prikaz: Test vrne jasno "checks not available yet", dokler jih ne doda admin (A2-A5) | R3, R4 |
| D54 | ~~Jeziki izvajalnika v v1~~ → **rešeno 8. 10. 2026** (uporabnik): **samo Node/TypeScript** (ena osnovna slika); drugi jeziki, ko jih zahteva prvi problem | R3 |
| D56 | ~~Zgodovina poskusov in čas po odstopu~~ → **rešeno 8. 10. 2026** (uporabnik): **vsak poskus (try) je svoj zapis** - začetek, konec, izid (opustil / rešil / odprt), trajanje; pozneje tudi AI poraba po poskusu. Za točke (časovni bonus) šteje **vsota časa vseh poskusov** - odstop + ponoven start ne resetira ure. Spremeni D8: vrstica `user_problem_attempts` ostane ena na problem, `started_at` se ob ponovnem startu še vedno nastavi (začetek trenutnega poskusa), čas za točke pa je vsota poskusov | R2b, R4, S1 |
| D55 | ~~Urejevalnik v R1~~ → **rešeno 8. 10. 2026** (uporabnik): R1 doda `@monaco-editor/react` namesto `CodeEditorMock`; spremembe v `localStorage` po poskusu (D14) | R1 |

### Spremembe sheme glede na `01_database.md`

Posledica odločitev - narejene v migraciji rezine, ki tabelo ustvari:

| Tabela | Sprememba | Odločitev | Rezina |
| --- | --- | --- | --- |
| `contest_entries` | − `attempt_id` | D18 | T2 |
| `contests` / `contest_entries` | + oznaka "nagrada poslana" (`04`) - točna oblika ob rezini | - | A7 |
| `problem_comments` | + `parent_id`, + `helpful_count`; nova tabela `comment_helpful` (predlog, čaka odločitev; tabelo ustvari P2 po D49, ti stolpci pridejo v O2) | D30 | O2 |
| `problems` | + `bug_summary TEXT` (interna opomba AI analize, samo admin, nikoli k uporabniku) - zahteva zaslona Create Problem | - | A2 |
| `contests` | `starts_at`/`ends_at` dovolita NULL (osnutek); stanje se ne shrani | D43 | A6 |
| `contests` | + `archived_at TIMESTAMP` (NULL = ni arhivirano; arhiviranje končanih tekmovanj, `04`) | - | A6 |
| `users` | `username` brez `UNIQUE` v stolpcu; namesto tega `UNIQUE INDEX ON lower(username)` (unikaten ne glede na velikost črk, gre v URL) | F2 | F2 |
| `user_profiles` | + `languages TEXT[] NOT NULL DEFAULT '{}'` (narejeno v F4); `goal_role` NULL = raziskujem | D42, D41 | F4 |
| `user_profiles` | + `display_name VARCHAR(50)`, `headline VARCHAR(80)`, `github_username VARCHAR(39)`, (`languages` že v F4), `is_public BOOLEAN DEFAULT TRUE` (predlog, čaka odločitev) | D34 | U1 |

Ko rezina tabelo ustvari, se `01_database.md` posodobi, da se ujema z
migracijo (uporabnik 8. 10. 2026: "update all md files"). Ta tabela ostane
seznam sprememb za tabele, ki še niso zgrajene. Narejeno v `01`: `users`
(F2), `user_profiles` + `languages` (F4), `problem_categories`, `problems`, `problem_tags`,
`problem_bookmarks`, `user_problem_attempts` (P1), `problem_codebase` (+ `hidden_files`, `solution_files`,
`repository_name`), `problem_checks`, `problem_ratings`, `problem_comments`, `user_daily_activity` (P2);
`problems.description` → `codebase_context` + `incident_report` (migracija 0006, 8. 10. 2026).

---

## Konvencije (veljajo za vse rezine)

- **Struktura:** `backend/src/` z moduli po domeni (`modules/auth`, `modules/problems`, …): `*.routes.js` (Express router) + po potrebi `*.service.js`. Repository plast šele, ko se SQL ponavlja.
- Vse pod `/api/v1`. JSON odgovori v camelCase (oblika tipov iz frontenda), baza snake_case.
- Enoten format napak: `{ error: { code, message, details? } }`, `code` v `UPPER_SNAKE_CASE`.
- Uporabnik in admin status **vedno iz seje** (D5), nikoli iz body/query.
- Vsak endpoint: `requireAuth` ali `requireAdmin` (izjeme: `signup`, `login`, `health`, javni seznam problemov). Skrivanje v UI ni varnost.
- Več zapisov naenkrat = **ena SQL transakcija** (npr. rešitev: poskus + rezultati + točke + statistika + aktivnost).
- **Točke nikoli neposredno:** vsaka sprememba je nova vrstica v `point_transactions`; `user_stats` se posodobi v isti transakciji (pravilo iz `CLAUDE.md`).
- **Kar odjemalec nikoli ne dobi:** `check_command`, `expected_output`, `hidden_files`, `solution_files`, `password_hash`, vsebina komentarjev pred rešitvijo.
- Čas reševanja se računa **na strežniku** iz `started_at` - odjemalčev čas je samo prikaz.
- Testi: `node:test` (stdlib), en test na pravilo iz "Končano, ko", proti pravi testni bazi. Brez dodatnih test knjižnic.
- Čiste funkcije (točke, množitelj, nivo, streak) imajo svoje teste brez baze.
- Odvisnosti: `express`, `pg`, JWT knjižnica (`jsonwebtoken` ali `jose`). Vse ostalo najprej stdlib.
- Brez paginacije v v1 (strop ~1000 problemov), doda se, ko meritev to zahteva.

---

## Vrstni red in mejniki

| Mejnik | Rezine | Kaj lahko pokažeš |
| --- | --- | --- |
| M0 Zagon | F0 → F1 → F2 → F3 → F4 | Prava registracija, prijava, onboarding, zaščitene poti |
| M1 Problemi | P1 → P2 | `/problems` in podrobnosti problema iz baze |
| M2 Reševanje | R1 → R2 → R3 → R4 → R5 → R6 | Start, urejanje, Test v Dockerju, rešitev, točke, nivo |
| M3 Skupnost | O1 → O2 | Ocene in komentarji, zaklenjeni do rešitve |
| M4 Profil in dashboard | U1 → U2 → U3 | Profil s statistiko in grafom, personaliziran dashboard |
| M5 Tekmovanja | T1 → T2 | Seznam tekmovanj, rezultati |
| M6 Admin | A1 → A2 → A10 → A3 → A4 → A5 → A6-A9 | Upravljanje problemov, tekmovanj, uporabnikov, statistika |
| M8 AI seja | S1 → S2 → S3 → S4, S5 | Vgrajeni AI klepet, zajem seje, ocena učinkovitosti v točkah, lestvica, AI analitika |
| M7 Produkcija | Z1 → Z2 | Prvi admin, varna namestitev |

M3-M6 so med seboj neodvisni (razen naštetih odvisnosti). Admin za probleme
(A2-A5) je praktično potreben pred resničnimi problemi - do takrat se problemi
polnijo s seed skripto.

---

## Rezine

### M0 - Zagon

**F0 · Ogrodje** `S` · odvisno od: - · ✅ 7. 10. 2026
- Naredi: `backend/` (Express 5 - async napake brez ovojev), konfiguracija iz env (`.env.example` brez skrivnosti), `pg` pool, migracijski runner (D2), enoten format napak, `node:test` zagon, `docker-compose.yml` s PostgreSQL 17 (lokalno).
- Skripte: `npm run dev`, `npm test`, `npm run migrate`, `npm run seed` (kot v `00` "Local Setup").
- API: `GET /api/v1/health` (preveri bazo).
- Frontend: Next `rewrites` `/api/*` → backend (D3), tanek `src/lib/api.ts` (`fetch` s `credentials`).
- Končano, ko: `npm test` zelen; health vrne 200; dvakratni `migrate` ne naredi nič.
- **Stanje:** narejeno po načrtu. Runner in seed v `backend/src/migrate.js`; `docker-compose.yml` je v `backend/` (projekt `bugdr`, ustvari tudi `bugdr_test`). Backend teče na `:4000`, frontend ga doseže prek `rewrites` (`BACKEND_URL`). `api.ts` še nima uporabnika - prvi bo F2. `migrations/` je še prazen (prva migracija pride z F1).

**F1 · Nivoji (referenčni podatki)** `S` · odvisno od: F0 · ✅ 7. 10. 2026
- Naredi: `level_thresholds` + seed 7 nivojev v migraciji (konfiguracija, ne testni podatki).
- Čista funkcija `levelFor(points, thresholds)`.
- Končano, ko: test meja (0 → Intern, 499 → Intern, 500 → Junior, 30000 → Distinguished).
- **Stanje:** migracija `migrations/0001_level_thresholds.sql` (tabela + 7 nivojev). `backend/src/modules/levels/levels.js`: `getLevels()` (SQL → `{ name, order, minPoints }`) in čista `levelFor(points, levels)` → `{ level, nextLevel }` (oblika `LevelInfo` iz `frontend/src/lib/types/dashboard.ts`, `nextLevel = null` na vrhu). Test bere nivoje iz baze. Testi tečejo zaporedno (`--test-concurrency=1`), ker si delijo testno bazo.

**F2 · Registracija in prijava** `M` · odvisno od: F0 · ✅ 7. 10. 2026
- Naredi: `users`, `user_stats` (vrstica ob registraciji), scrypt hash.
- API: `POST /auth/signup` `{ email, username, password }`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- Validacija: e-pošta, `username` (dovoljeni znaki, dolžina ≤ 50, unikaten brez razlike v velikosti črk - gre v URL `/profile/[username]`), geslo ≥ 8.
- Frontend: `/login`, `/signup`. Seja je piškotek `bugdr_session` (httpOnly JWT) - isto ime kot mock (`src/lib/session.ts`), da `src/proxy.ts` in `(app)/layout.tsx` ostaneta enaka; `mockLogin`/`mockSignup`/`mockLogout` v `src/lib/mock/auth.ts` → API. Prijava upošteva `?next=` (samo poti na isti strani, `safeNext`).
- Končano, ko: napačno geslo → 401 (isto sporočilo kot neznan e-mail); podvojen e-mail/username → 409; v bazi ni gesla v čistem besedilu; `/auth/me` brez piškotka → 401.
- **Stanje:** `migrations/0002_users.sql` (`users` + `user_stats` iz `01`; `username` unikaten prek indeksa `lower(username)`, e-pošta se shrani z malimi črkami). `backend/src/modules/auth/`: `auth.service.js` (scrypt `scrypt:<salt>:<hash>`, JWT HS256 s samo `sub` = id, piškotek `bugdr_session` httpOnly/Lax/Secure v produkciji, `requireAuth` naloži uporabnika iz baze v `req.user`) in `auth.routes.js`. Odgovor `{ user: { id, email, username, avatarUrl, isAdmin } }`. Napake: `VALIDATION_ERROR` (400, `details` po poljih), `EMAIL_TAKEN`/`USERNAME_TAKEN` (409), `INVALID_CREDENTIALS` (401), `UNAUTHENTICATED` (401). Neznan e-mail vseeno požene scrypt (enak čas odgovora). Nova odvisnost `jsonwebtoken`; `JWT_SECRET` obvezen v produkciji. Frontend: `/signup` (Username, geslo ≥ 8), `/login`, odjava v stranski vrstici in "Sign out" na onboardingu (`useLogout` v `Session.tsx`) kličejo API; `mockLogin`/`mockSignup`/`mockLogout` odstranjeni. Odprto za F3: ban, `last_active_at`, `requireAdmin`; star mock piškotek `bugdr_session=mock` v brskalniku stran še vedno šteje kot prijavo (proxy preveri samo obstoj) - API ga zavrne z 401.

**F3 · Zaščita poti** `S` · odvisno od: F2 · ✅ 7. 10. 2026
- Naredi: `requireAuth`, `requireAdmin`; banned uporabnik → 403 `BANNED` povsod; `last_active_at` osvežen (največ 1× na minuto).
- Frontend: zaščita strani je že v `src/proxy.ts` (brez piškotka → `/login?next=…`): `/problems/[slug]/solve`, `/settings`, `/onboarding`, `/admin/*`. **Javne** (odločitev uporabnika 7. 10. 2026): `/dashboard`, `/problems`, `/problems/[slug]` - gost vidi vsebino, osebni deli so zamegljeni z "Log in to unlock" (`Locked` v `src/components/app/Session.tsx`). F3 doda: `/admin/*` samo za admina; `GET /problems`, `GET /problems/:slug`, `GET /dashboard` brez seje vrnejo `status: null`, brez statistike in poskusov (zdaj to naredi frontend).
- Končano, ko: ne-admin dobi 403 na admin poti; ban velja takoj, brez ponovne prijave.
- **Stanje:** `auth.service.js`: `requireAuth` zavrne bannanega z 403 `BANNED` in osveži `last_active_at`, ko je starejši od minute (ena poizvedba sicer); `requireAdmin` = `[requireAuth, is_admin]` → 403 `FORBIDDEN`. Prijava bannanega z pravilnim geslom → 403 `BANNED` (z napačnim geslom ostane splošni 401). `app.js` izvozi `api` (router `/api/v1`). Frontend: `src/proxy.ts` preveri sejo z `GET /auth/me` (ne samo obstoja piškotka): neveljaven / tuj / bannan piškotek → `/login?next=…` in piškotek pobrisan; `/admin/*` za ne-admina → `/dashboard`; nedosegljiv backend → prijava (zapre se). D47: `/contests/*` in `/profile/*` zahtevata prijavo. `/login` pokaže "This account has been suspended.". **Ni narejeno (premaknjeno):** `status: null` za goste na `GET /problems`, `/problems/:slug`, `/dashboard` - endpointi še ne obstajajo; naredita ga P1/P2/U3 (neobvezna seja). Stranska vrstica gosta še vedno kaže povezavo Contests (vodi na prijavo).

**F4 · Onboarding** `S` · odvisno od: F3 · ✅ 7. 10. 2026
- Naredi: `user_profiles`.
- API: `PUT /me/onboarding` `{ goalRole, experienceLevel, platformGoal }` (dovoljene vrednosti iz `01`), `/auth/me` vrne `onboardingCompleted`.
- Frontend: `/onboarding`; po prijavi preusmeritev na onboarding, dokler ni zaključen.
- Končano, ko: neveljavna vrednost → 400; ponovna oddaja posodobi (ne podvoji).
- **Stanje:** `migrations/0003_user_profiles.sql` (+ `languages`, D42). `goal_role` hrani slug kategorije (`ai-engineer`, …) kot `problem_categories.slug` in frontend (`01` popravljen 8. 10. 2026). `backend/src/modules/me/me.routes.js`: `PUT /me/onboarding` `{ goalRole (slug ali null, D41), experienceLevel, platformGoal, languages }` → 204, upsert po `user_id`. `auth.service.js`: `findUser` (users + `onboarding_completed`) in `toUser`; `/auth/me` in odgovor prijave vrneta `onboardingCompleted`. Dovoljene vrednosti so podvojene v backendu (komentar kaže na frontend tipe). Frontend: `/onboarding` shrani prek API-ja; prijava gre na `/onboarding`, dokler ni zaključen (tudi z `?next=`); proxy zaščitene strani (razen `/onboarding`) preusmeri na `/onboarding`. Javni `/dashboard` tega ne vsiljuje. Odjava je zdaj polno nalaganje `/login` (izbriše predpomnilnik usmerjevalnika s prednaloženimi stranmi računa - prej 404 v konzoli).

### M1 - Problemi

**P1 · Seznam problemov** `M` · odvisno od: F3 · ✅ 8. 10. 2026
- Naredi (migracija): `problem_categories` (seed 5 kategorij v migraciji), `problems` (+ `thumbnail_url`, brez `summary` in `is_contest_problem` - D16, D17; `created_by` NULL dovoljen, admin ni uporabnik - D48), `problem_tags`, `problem_bookmarks` (D23), `user_problem_attempts` (D49 - samo tabela, za `status`).
- Seed (`seeds/`, ponovljiv z `ON CONFLICT DO NOTHING`): mock problemi iz `frontend/src/lib/mock/problems.ts` (isti slugi, sličice ostanejo v `public/mock/`).
- API: `GET /problems?category=&difficulty=&tag=&q=&status=&saved=&sort=` → kartice `ProblemListItem` (`02` "Card contains") + za prijavljenega `status` (`solved`/`in_progress`/`null`) in `saved`. Neobvezna seja: gost dobi `status: null`, `saved: false` (iz F3), `status`/`saved` filtra za gosta ne veljata. `sort`: `recommended` (najprej kategorija iz `goal_role`, nato ocena - zdaj `MOCK_ME` v `ProblemBrowser.tsx`), `rating`, `shortest`. Samo `is_published`.
- API: `PUT /problems/:slug/bookmark`, `DELETE /problems/:slug/bookmark` → 204 (`requireAuth`, idempotentno).
- D17 (skriti problemi nekončanih tekmovanj): `contest_problems` še ne obstaja, zato filter doda rezina, ki tabelo ustvari (A6/T1).
- Brez paginacije (konvencija v1): ~~strežnik filtrira in razvrsti~~ → narejeno drugače, glej Stanje (strežnik vrne cel seznam, odjemalec filtrira); odjemalec ohrani neskončno drsenje z rezanjem seznama (`limit` v `ProblemBrowser.tsx`).
- Frontend: `/problems` - `mockGetProblems` → `GET /problems`, filtri v query, zaznamki prek API-ja.
- Končano, ko: neobjavljen problem ni na seznamu; filtri se kombinirajo; `base_points` se ujema s težavnostjo (CHECK); gost nima `status`; zaznamek dvakrat = ena vrstica.
- **Stanje:** `migrations/0004_problems.sql` (kategorije s seedom, `problems` s CHECK `(difficulty, base_points)`, `problem_tags` z `UNIQUE (problem_id, tag)`, `problem_bookmarks`, `user_problem_attempts`). `seeds/0001_problems.sql` = 12 mock problemov (isti slugi, sličice `/mock/…`, opis je samo kratek odstavek - P2). `backend/src/modules/problems/problems.routes.js`: `GET /problems` → `{ problems: ProblemListItem[] }` (+ `saved`), `PUT`/`DELETE /problems/:slug/bookmark` → 204 (neznan ali neobjavljen slug → 404 `PROBLEM_NOT_FOUND`). `optionalAuth` v `auth.service.js`: neveljaven, potekel ali bannan piškotek = gost. **Odstopa od načrta:** `GET /problems` nima query filtrov - vrne cel objavljen seznam v vrstnem redu "recommended" (najprej kategorija iz `goal_role`, nato ocena, nato naslov; `abandoned` = `status: null`), filtri, iskanje, `rating`/`shortest` in neskončno drsenje ostanejo na odjemalcu (`ProblemBrowser.tsx`, oznaka `ponytail:`). Filtri v query + `limit/offset`, ko seznam preraste ~1000 problemov. Frontend: `/problems` bere API, zaznamek se preklopi takoj in vrne nazaj ob napaki, števec "Saved problems" iz `saved`; `ProblemListItem.saved` dodan (mock problemi `saved: false`). Odprto: D17 filter (A6/T1); dashboard (U3) zaznamkov še ne bere.

**P2 · Podrobnosti problema** `M` · odvisno od: P1 · ✅ 8. 10. 2026
- Naredi (migracija, D49 - samo tabele): `problem_codebase` (+ `hidden_files`, `solution_files`, `repository_name` - D10, D11, D27), `problem_checks`, `problem_ratings`, `problem_comments`; `user_daily_activity`. Seed: koda, preverjanja in nekaj poskusov/ocen/komentarjev za mock probleme.
- API: `GET /problems/:slug` → `ProblemDetail` v `frontend/src/lib/types/problem.ts`: `codebaseContext` + `incidentReport` (prej `description`, migracija 0006), težavnost, kategorija, tagi, povprečna ocena + število, `solveCount`, `commentCount`, `checks` (D26), `repository` (D27: ime, sklad = `language` + `framework` + tagi, poti iz `repository_structure`), status uporabnika, `result` (rešen poskus: `timeTakenSeconds`, `linesAdded/Deleted`, `pointsEarned`, `timeMultiplier`, `myRating`). **Brez** vsebine datotek, `check_command`, `expected_output`, `hidden_files`, `solution_files`.
- Ogled prijavljenega uporabnika poveča `problems_opened` za današnji UTC dan (D6, D7) in posodobi `user_stats.current_streak/longest_streak/last_activity_date` (čista funkcija streaka s testom).
- Frontend: `/problems/[slug]` - `mockGetProblem` → API (rešen problem stran pokaže kot "Problem solved"). Ocena in komentarji ostanejo na mocku do O1/O2.
- Končano, ko: neobjavljen ali neznan slug → 404; odgovor ne vsebuje `check_command` ali datotek; dva ogleda istega dne = en dan streaka, ogled naslednji dan ga podaljša, preskočen dan ga ponastavi; gost ne zapiše aktivnosti.
- **Stanje:** `migrations/0005_problem_detail.sql` (`problem_codebase` z `repository_name`, `hidden_files NOT NULL DEFAULT '{}'`, `solution_files`; `repository_structure` = JSON seznam poti; `problem_checks` s CHECK `check_type` in `UNIQUE (problem_id, check_order)`; `problem_ratings`, `problem_comments`, `user_daily_activity`). Seed `seeds/0001_problems.sql` je zdaj zgeneriran iz mocka v celoti: polni opis, koda (`files`), ime repozitorija in preverjanja (vsa z ukazom `npm test`, oznaka `ponytail:`) za vseh 12 problemov; ob ponovnem zagonu osveži opis in `solve_count`. Poskusov, ocen in komentarjev seed nima (potreboval bi uporabnike) - stanje "rešen" je preverjeno s testom in ročnim vnosom. `GET /problems/:slug` → `{ problem: ProblemDetail }` (+ `saved`), `result` za rešen poskus (`checksPassed = checksTotal = število preverjanj`, ker rešen poskus pomeni vsa uspešna; `myRating` iz `problem_ratings`), neznan ali neobjavljen slug → 404 `PROBLEM_NOT_FOUND`. Streak: ena SQL poizvedba (`recordOpen`) z zaklepom vrstice `user_stats` - vzporedni ogledi štejejo dan enkrat. **Odstopa od načrta:** streak je SQL namesto čiste JS funkcije (atomarno, test prek API-ja pokrije vse tri primere). Frontend: `/problems/[slug]` bere API na strežniku prek novega `src/lib/serverApi.ts` (`serverFetch` posreduje piškotek seje); komentarji in ocena ostanejo mock do O1/O2 (rešen problem brez mock komentarjev pokaže prazno razpravo). Zaslon reševanja še bere `mockGetProblem` (R1). **Popravek 8. 10. 2026 (Seja 13):** `migrations/0006_problem_brief.sql` razdeli `description` v `codebase_context` + `incident_report` (`02`: brez namigov, brez pričakovanega vedenja); API vrne `codebaseContext` in `incidentReport`; seed besedila iz `frontend/src/lib/mock/problemBriefs.ts`; test P2 preveri obe polji.

### M2 - Reševanje

**R1 · Začetek reševanja** `M` · odvisno od: P2 · ✅ 8. 10. 2026
- Naredi: tabele `problem_codebase`, `problem_checks`, `user_problem_attempts` že obstajajo (P1, P2 - D49); R1 doda samo logiko.
- API: `POST /problems/:slug/start` → ustvari poskus (ali vrne obstoječega `in_progress`, timer teče naprej od `started_at`), vrne datoteke, drevo, `startedAt`, `timeLimitMinutes`, opise preverjanj (samo `description` + `check_order`).
- `abandoned` poskus: ista vrstica nazaj v `in_progress`, nov `started_at` (D8).
- Frontend shranjuje neshranjene spremembe v `localStorage` po poskusu (D14).
- Frontend: `/problems/[slug]/solve` (Monaco - D55, zavihki datotek, timer). Oblika odgovora je `Attempt` v `frontend/src/lib/types/attempt.ts` (+ `repositoryName` po D27).
- Končano, ko: že rešen problem → 409 `ALREADY_SOLVED`; ponoven start ne resetira časa; skrite datoteke niso v odgovoru.
- **Stanje:** `POST /problems/:slug/start` v `problems.routes.js` (en `INSERT … ON CONFLICT DO UPDATE`: nov / obstoječ `in_progress` nespremenjen / `abandoned` → `in_progress` z novim `started_at` / `solved` → 409) → `{ attempt: Attempt }`. Test `backend/test/r1.test.js`. Frontend: zaslon reševanja bere opis iz `GET /problems/:slug`, poskus iz API-ja; Monaco (`@monaco-editor/react`, D55) namesto `CodeEditorMock`, naložen s CDN jsdelivr (`ponytail:`); osnutki v `localStorage` po ključu `bugdr:draft:<id>:<startedAt>` (samo spremenjene datoteke; restart po odstopu = izvirna koda); zavihki razvrščeni po poti (JSONB ne ohrani vrstnega reda). **Odstopa od načrta:** brez `repository_structure` v odgovoru (drevo = ključi `files`, drevesa na zaslonu ni - D29). Seed nima `README.md` v `files` (mock ga je dodal) - kontekst je v opisu. `CodeEditorMock.tsx` izbrisan (uporabnik); `mockCodebase` ostane kot vir seeda.

**R2 · Odstop** `S` · odvisno od: R1 · ✅ 8. 10. 2026
- API: `POST /attempts/:id/give-up` → `status = 'abandoned'`. Ponoven start je mogoč (D8, v R1).
- Končano, ko: tuj poskus → 404; rešen poskus se ne more opustiti.
- **Stanje:** nov modul `backend/src/modules/attempts/attempts.routes.js` (`requireAuth` na celem routerju): `POST /attempts/:id/give-up` → 204, idempotentno (dvakrat = 204); tuj, neznan ali neveljaven id → 404 `ATTEMPT_NOT_FOUND` (ne 403 - ne razkrije obstoja); rešen → 409 `ALREADY_SOLVED`. Test `backend/test/r2.test.js` (+ ponoven start po odstopu = ista vrstica). Frontend: gumb Give up odpre `src/components/ConfirmDialog.tsx` (nov skupni gradnik, nativni `<dialog>`: Esc, fokus, ozadje), potrditev pokliče API, izbriše osnutek iz `localStorage` in odpre stran podrobnosti; napaka ostane v oknu.

**R2b · Zgodovina poskusov** `S` · odvisno od: R2, D56 · ✅ 8. 10. 2026
- Naredi (migracija): `attempt_tries (id, attempt_id → user_problem_attempts ON DELETE CASCADE, try_number, started_at, ended_at NULL, outcome CHECK IN ('in_progress','abandoned','solved'), duration_seconds NULL, UNIQUE (attempt_id, try_number))` + delni unikatni indeks "največ en odprt poskus na attempt". Obstoječi poskusi dobijo try 1 (backfill).
- R1: nov attempt → try 1; `abandoned` → nov try n+1; `in_progress` → nič. Odgovor `Attempt` + `tryNumber`, `previousSeconds` (vsota zaprtih poskusov) - timer na zaslonu kaže `previousSeconds + (zdaj - startedAt)`.
- R2: give-up zapre odprt try (`ended_at`, `duration_seconds` na strežniku, `outcome = 'abandoned'`) v isti transakciji kot `status = 'abandoned'`.
- Frontend: besedilo okna Give up ("timer restarts" → čas teče naprej); timer z `previousSeconds`.
- Končano, ko: start → try 1; odstop + start → try 2, try 1 zaprt s trajanjem; ponoven start brez odstopa ne ustvari novega; `previousSeconds` = vsota zaprtih; tuj poskus ne vpliva.
- **Stanje:** `migrations/0007_attempt_tries.sql` (+ CHECK `outcome = 'in_progress'` ⇔ `ended_at IS NULL`, delni unikatni indeks `attempt_tries_one_open`, backfill: obstoječi = try 1, opuščen brez znanega trajanja = `NULL`). Start in give-up sta vsak **en SQL stavek** (CTE, atomarno) namesto transakcije; nov try se zazna z `started_at = now()`. Vzporedni starti po odstopu odprejo natanko en try (test). `Attempt` + `tryNumber`, `previousSeconds`; timer = `previousSeconds + (zdaj - startedAt)`, namig "Try N · Time limit"; besedilo okna Give up: čas teče naprej. Test `backend/test/r2b.test.js`; `r1.test.js` ob ročnem odstopu zapre tudi try. `01_database.md` posodobljen.

**R3 · Izvajalnik v Dockerju** `L` · odvisno od: R1 · ✅ 8. 10. 2026
- Naredi: `docker/` (ena osnovna slika Node - D54; izvedljiv je samo `payment-retries-disappear` - D53), servis `runChecks(problem, userFiles)`: ustvari kontejner → osnovne datoteke → uporabnikove datoteke → **skrite datoteke zadnje** (D10) → `setup_commands` → preverjanja po `check_order` → uniči kontejner.
- Izolacija (`02`): brez omrežja (`--network none`, razen če problem zahteva), omejitev CPU/RAM/procesov, časovna omejitev na preverjanje in na celoto, brez dostopa do gostitelja, uporabnik ni root.
- Validacija uporabnikovih datotek: samo poti znotraj projekta (brez `..`, absolutnih poti), omejitev velikosti in števila.
- Ni endpointa - čist servis s testi.
- Razdeli, če se zatakne: (a) kontejner + datoteke, (b) preverjanja + izhod, (c) omejitve in varnost.
- Končano, ko: znan pokvarjen problem pade, popravljen uspe; poskus pisanja izven projekta zavrnjen; neskončna zanka prekinjena po času; kontejner ne ostane po koncu.
- **Stanje:** `backend/src/modules/runner/runner.service.js`: `validateFiles` (relativne poti, brez `..`/`.`/praznih segmentov/`\`, ≤ 200 datotek, ≤ 200 KB na datoteko, ≤ 2 MB skupaj → 400 `INVALID_FILES`) in `runChecks(problem, userFiles)` → `[{ checkId, passed, output? }]` (`output` samo pri neuspehu, zadnjih 4000 znakov). Kontejner `docker run -d --rm` (`--network none`, 512 MB, 1 CPU, 128 procesov, `--read-only`, tmpfs `/workspace` 64 MB, uporabnik 1000, `--cap-drop ALL`, `no-new-privileges`, sam se odstrani po 300 s); datoteke po stdin kot JSON (brez priklopa map gostitelja), vrstni red problem → uporabnik → skrite (D10); vsak check `docker exec` z 20 s omejitvijo, ob izteku `kill -9 -1` v kontejnerju; `finally` → `docker rm -f`. Prehod = izhodna koda 0 (+ `expected_output`, če je nastavljen). Slika `config.runnerImage` = `node:24-alpine` (`RUNNER_IMAGE`). `seeds/0002_payment_retries_runnable.sql` (D53): `payment-retries-disappear` predelan za čisti Node 24 (TypeScript prek type stripping, `node:test`, lasten queue z vedenjem BullMQ namesto BullMQ/Redis) - hrošč: ponovni poskus uporabi `jobId = orderId`, medtem ko isti job še teče, zato ga queue zavrže; 6 skritih preverjanj v `.bugdr/checks/` + "Existing tests still pass"; pokvarjena koda pade 1, 5, 6, rešitev (`solution_files`) uspe vse. Test `backend/test/r3.test.js` (potrebuje Docker, sicer preskočen); `seed` izvožen iz `migrate.js`. **Odstopa od načrta:** brez mape `docker/` - uradna slika `node:24-alpine` zadošča (lastna slika, ko jo zahteva prvi problem z odvisnostmi); brez razdelitve (a)/(b)/(c). **Odprto:** incident log problema kaže `attempt=2`, `attempt=3`, nova koda pa po prvem neuspehu ne poskusi več (glej Nedoslednosti).

**R4 · Test in rešitev** `L` · odvisno od: R3, F1 · ⬜
- Naredi: `check_results`, `point_transactions`.
- API: `POST /attempts/:id/test` `{ files }` → rezultat po preverjanju (`passed`, `output` samo pri neuspehu).
- Če vsa `must_pass` uspejo - **ena transakcija:** `status = 'solved'`, `solved_at`, `time_taken_seconds` (strežnik), `time_bonus_multiplier`, `points_earned`, `final_code`, `lines_added/deleted` (diff proti izvirnim datotekam), vrstice v `point_transactions` (D15), `user_stats` (točke, nivo, `problems_solved`), `user_daily_activity` (`problems_solved`, `points_earned`), `problems.solve_count`.
- Prikaz poskusov (uporabnik 8. 10. 2026): **samo kartica "Problem solved"** na `/problems/[slug]` - "Solved on try N · <skupni čas>" + seznam poskusov (npr. gave up after 25m, gave up after 31m, solved after 16m). `GET /problems/:slug` `result` dobi `tries: { tryNumber, outcome, durationSeconds }[]` iz `attempt_tries` (`SolveResult` v `types/problem.ts`). Drugje (stran pred rešitvijo, profil, admin) zaenkrat ne.
- Čas za časovni bonus = **vsota vseh poskusov** (D56): zaprti `attempt_tries.duration_seconds` + trenutni; ob rešitvi se odprt try zapre z `outcome = 'solved'` v isti transakciji.
- Formula v `03` je zdaj `base × time × efficiency_score`: R4 pred S3 računa z `efficiency = 1`, S3 doda faktor v isto transakcijo.
- Čiste funkcije s testi: `timeMultiplier(seconds, limitMinutes)` (meje iz `03`: < 25 % → 2x, < 50 % → 1.5x, < 75 % → 1.25x, sicer 1x), `finalPoints` (zaokroženo).
- Končano, ko: primer iz `03` (30 min, Medium, 8 min → 375; 6 min → 500); dvojni klik Test ne podeli točk dvakrat (zaklep vrstice poskusa); neuspel Test ne spremeni statusa; `SUM(point_transactions) = user_stats.total_points`.

**R5 · Terminal** `M` · odvisno od: R3 · ⬜
- API po D13 (v1: `POST /attempts/:id/terminal` `{ command }` → izhod; dolgotrajni procesi prek SSE).
- Kontejner terminala živi, dokler je poskus odprt (z neaktivnostnim časovnikom), ločen od kontejnerja preverjanj.
- Frontend: terminalska komponenta na zaslonu reševanja.
- Končano, ko: `npm run dev` pokaže izhod; ukaz ne doseže gostitelja ali omrežja; kontejner se ugasne po neaktivnosti.

**R6 · Rezultati v živo** `S` · odvisno od: R4 · ⬜
- `02`: "partial results shown in real time" - stanja `pending/running/passed/failed` po preverjanju prek SSE (`GET /attempts/:id/test-stream`) ali odgovora v kosih.
- Končano, ko: odjemalec vidi `running` → `passed` za vsako preverjanje posebej, preden se konča zadnje.

### M3 - Skupnost

**O1 · Ocene** `S` · odvisno od: R4 · ⬜
- Tabela `problem_ratings` že obstaja (P2 - D49).
- API: `PUT /problems/:slug/rating` `{ rating: 1-5 }` - samo po rešitvi (403 `NOT_SOLVED`); posodobi `problems.average_rating` in `rating_count` v isti transakciji.
- Končano, ko: nerešen → 403; ponovna ocena posodobi, ne podvoji; povprečje pravilno.

**O2 · Komentarji** `S` · odvisno od: R4 · ⬜
- Tabela `problem_comments` že obstaja (P2 - D49); O2 doda stolpce iz D30.
- API: `GET /problems/:slug/comments` (nerešen: samo `{ count, locked: true }`), `POST /problems/:slug/comments` (samo po rešitvi).
- Vsebina se hrani surova, izpis je varen (React escapa).
- Frontend: zavihek Discussion na `/problems/[slug]` (rešen problem) - `Discussion.tsx`. Oblika komentarja je `ProblemComment` v `frontend/src/lib/types/problem.ts` (avtor z `goalRole`, `helpfulCount`, `markedHelpful`, `replies` po D30). Najdaljša vsebina 2000 znakov (predlog).
- Končano, ko: nerešen uporabnik nikoli ne dobi vsebine; prazna/predolga vsebina → 400.

### M4 - Profil in dashboard

**U1 · Profil** `M` · odvisno od: R4 · ⬜
- API: `GET /users/:username` → statistika iz `03` "Stats Shown on Profile" (točke, nivo + napredek do naslednjega, rešeni, streak, najdaljši streak, po težavnosti, po kategoriji, povprečni čas) + seznam rešenih problemov. Brez e-pošte.
- API: `PUT /me/profile` (polja iz D34, `goalRole`, `experienceLevel`) za `/settings`; zaseben profil (`is_public = false`) drugim vrne samo ime.
- Frontend: `/profile/[username]`, `/settings`. Oblika odgovora je `Profile` v `frontend/src/lib/types/profile.ts` (+ `contests` = zgodovina tekmovanj iz T2).
- Končano, ko: neznan username → 404; banned uporabnik → 404; števci se ujemajo z `user_problem_attempts`.

**U2 · Graf aktivnosti in streak** `S` · odvisno od: U1, P2 · ⬜
- API: `GET /users/:username/activity` → zadnjih 52 tednov iz `user_daily_activity` (intenziteta = rešeni na dan, `03`). Mreža na profilu ima 53 stolpcev (52 polnih tednov + tekoči), zato naj API vrne od ponedeljka pred 52 tedni naprej.
- Streak na branje: če je `last_activity_date` starejši od včeraj, se prikaže `current_streak = 0` (brez cron opravila).
- Končano, ko: dan brez aktivnosti prekine streak; najdaljši streak se ne zmanjša.

**U3 · Dashboard** `M` · odvisno od: P1, F4 · ⬜
- API: `GET /dashboard` → personaliziran feed (D19), aktivna tekmovanja (po T1), lastna statistika na kratko, nedokončani poskusi.
- Frontend: `/dashboard`. Oblika odgovora je `Dashboard` v `frontend/src/lib/types/dashboard.ts` (`contests`, `inProgress`, `feed`, `stats` z `level`/`nextLevel` iz `level_thresholds`, `activity` iz `user_daily_activity`, `recentWins`). Filtri feeda po D24 (zdaj filtrira mock na odjemalcu).
- Kartica tekmovanja: težavnost = najvišja težavnost problemov tekmovanja, `participantCount` = število `contest_entries`.
- Kartica problema prikaže `time_limit_minutes` (dizajn ima razpon "25-40 min", ki ga shema nima).
- Končano, ko: feed ne vsebuje rešenih ali neobjavljenih problemov.

### M5 - Tekmovanja

**T1 · Seznam tekmovanj** `S` · odvisno od: P1 · ⬜
- Naredi: `contests`, `contest_problems`.
- API: `GET /contests` → dnevna/tedenska/mesečna, status izpeljan iz časa (`upcoming`/`active`/`ended`), nagrada; problemi samo za `active`/`ended`. Oblika odgovora je `ContestList` v `frontend/src/lib/types/contest.ts` (`live`/`upcoming`/`past`; težavnost = najvišja težavnost problemov, oznake in sličica iz problema).
- API: `GET /contests/:id` → `ContestDetail` (incident, ime repozitorija - D27, število preverjanj, nagrada); za `upcoming` `problem = null`. En problem na tekmovanje (D33).
- Frontend: `/contests`, `/contests/[id]`, del `/dashboard`.
- Končano, ko: problemi prihajajočega tekmovanja niso razkriti.

**T2 · Udeležba in rezultati** `M` · odvisno od: T1, R4 · ⬜
- Naredi: `contest_entries` (brez `attempt_id`, D18); rešitev tekmovalnega problema znotraj časa posodobi vnos (v transakciji R4).
- API: `GET /contests/:id/leaderboard`; `participation` v `GET /contests/:id` in `history` v `GET /contests` (`ContestHistoryEntry` - glej D32) iz `contest_entries` prijavljenega uporabnika.
- Končano, ko: rešitev po `ends_at` ne šteje; en vnos na uporabnika na tekmovanje.

### M6 - Admin (`04_admin.md`)

**A1 · Admin ogrodje** `S` · odvisno od: F3 · ⬜
- Vse `/api/v1/admin/*` za `requireAdmin`. Frontend `/admin` postavitev.

**A2 · Problemi: seznam in osnovni podatki** `M` · odvisno od: A1, P1 · ⬜
- API: `GET /admin/problems?…` (tudi osnutki), `POST /admin/problems`, `PATCH /admin/problems/:id` (naslov, `codebase_context`, `incident_report`, težavnost, kategorija, tagi, časovna omejitev, vir).
- Telo shranjevanja z zaslona Create Problem je `AdminProblemDraft` (`frontend/src/lib/types/problem.ts`): `title`, `slug`, `shortDescription` (→ `summary`), `fullDescription` (→ ~~`description`~~ - po migraciji 0006 dve polji, D50), `difficulty`, `categorySlug`, `timeLimitMinutes`, `tags`, `checks`, `hiddenFiles`, `bugSummary`, `isPublished`. Po D22 postane `PATCH` osnutka, ki ga je ustvarila A10.
- Frontend: `mockSaveProblem` v `src/lib/mock/adminProblems.ts` → API.
- Končano, ko: slug unikaten (409); `base_points` sledi težavnosti.

**A10 · Nalaganje ZIP + AI analiza** `M` · odvisno od: A2, D20-D22 · ⬜
- API: `POST /admin/problems/analyze` (ZIP, `requireAdmin`) → razpakira na strežniku (brez poti izven korena, omejitve iz D21), prebere kodne datoteke, pošlje jih Claude API s sistemskim pozivom iz uporabnikove specifikacije zaslona (spodaj), preveri JSON in vrne `ProblemAnalysis` (camelCase; Claude vrača snake_case - preslikava na API meji).
- Sistemski poziv (dobesedno iz specifikacije, 6. 10. 2026): vrne `bug_summary`, `short_description`, `full_description` (D50: → `codebase_context` + `incident_report`), `suggested_difficulty`, `difficulty_reasoning`, `checks[]` (`check_order`, `description`, `check_type`, `check_command`, `must_pass`), `hidden_files`, `tags`; pravila: 3-5 preverjanj, preverjanja morajo pasti na pokvarjeni kodi, skrite datoteke = testi, opis ne sme namigovati na napako, samo JSON.
- Naslov in časovno omejitev vpiše admin (AI ju ne predlaga).
- Frontend: `mockAnalyzeProblem` → API.
- Končano, ko: ne-ZIP / prevelik ZIP → 400; ZIP s potjo `../` zavrnjen; neveljaven JSON od Claude → 502 `ANALYSIS_INVALID`; ne-admin → 403; ključ API ni nikoli v odgovoru ali frontendu.

**A3 · Urejevalnik kode problema** `M` · odvisno od: A2 · ⬜
- API: `PUT /admin/problems/:id/codebase` (datoteke, skrite datoteke, rešitev, jezik, ogrodje, ukazi).

**A4 · Urejevalnik preverjanj + poskusni zagon** `M` · odvisno od: A3, R3 · ⬜
- API: `PUT /admin/problems/:id/checks` (cel seznam naenkrat, vrstni red = položaj), `POST /admin/problems/:id/dry-run` → preverjanja na izvirni kodi (morajo pasti) in na rešitvi (morajo uspeti) - pravilo dokončno po D20. Rezultati po preverjanju sproti (zaslon kaže `Running` → rezultat za vsako posebej, kot R6).
- Frontend: `mockRunCheck` → API (korak "Validate" na `/admin/problems/new`). Vsaka sprememba preverjanj razveljavi zadnji zagon - strežnik mora to zrcaliti (objava samo z dry-runom zadnje različice preverjanj).

**A5 · Objava** `S` · odvisno od: A4 · ⬜
- API: `POST /admin/problems/:id/publish` / `unpublish`. Objava zavrnjena brez ≥ 3 preverjanj in uspešnega dry-runa (`04` "Quality Guidelines"). Brisanje rešenega problema ni mogoče - samo unpublish (`04` "Admin Rules").

**A6 · Tekmovanja** `M` · odvisno od: A1, T1 · ⬜
- API: `GET /admin/contests`, `GET /admin/contests/:id`, `POST /admin/contests`, `PATCH /admin/contests/:id`, `DELETE /admin/contests/:id` (samo osnutki), arhiviranje (samo končana).
- Odgovor je `AdminContest` (`frontend/src/lib/types/contest.ts`): `type`, `title`, `description`, `startsAt`/`endsAt` (NULL = osnutek), `problems[]` (`ContestProblemOption`: slug, naslov, težavnost, kategorija), `rewardType`, `rewardDescription`. **Brez polja stanja** - odjemalec in strežnik ga izpeljeta z `getContestStatus` (D43).
- Telo shranjevanja je `AdminContestDraft`: kot zgoraj + `problemSlugs[]` (≥ 1, D33). "Save as Draft" pošlje `startsAt: null`; "Schedule Contest" samodejne (`getContestDates`) ali ročne datume. Strežnik preveri pravila iz D44.
- Načrtovanje osnutka s seznama = `PATCH` z datumi iz `getContestDates(type)`; preklic = `PATCH` z `startsAt`/`endsAt` = NULL. Urejanje samo za osnutke in načrtovana tekmovanja.
- Frontend: `mockGetAdminContests`, `mockGetAdminContest`, `mockSaveContest`, `mockSetContestDates`, `mockRemoveContest`, `mockGetContestProblemOptions` v `src/lib/mock/adminContests.ts` → API.

**A7 · Rezultati tekmovanj + CSV** `S` · odvisno od: A6, T2 · ⬜
- API: `GET /admin/contests/:id/results` (+ `?format=csv`), oznaka "nagrada poslana" (stolpec ni v shemi - dodaj ob rezini).

**A8 · Uporabniki** `S` · odvisno od: A1 · ⬜
- API: `GET /admin/users?q=`, `GET /admin/users/:id` (profil, statistika, poskusi), `POST /admin/users/:id/ban` / `unban`. Admin se ne more banati sam.

**A9 · Statistika platforme** `S` · odvisno od: A1, R4 · ⬜
- API: `GET /admin/stats?range=today|7d|30d|all` (`04` §4) → `AdminOverview` (`frontend/src/lib/types/adminStats.ts`): skupni uporabniki, aktivni uporabniki + trend, objavljeni problemi, rešitve + trend, aktivna tekmovanja, rast uporabnikov (30 dni, prijave in DAU), rešitve na dan (14 dni), rešitve po težavnosti in vlogi, porazdelitev trenutnih nizov, top 8 problemov, 8 problemov z največjim osipom (začeti / rešeni). Okna po D46.
- Frontend: `mockGetAdminOverview` v `src/lib/mock/adminStats.ts` → API.

### M8 - AI seja (`02` "AI Session Capture", `03`, `04` "AI Session Analytics")

Čaka D51 (S1-S3) in D52 (S4). Frontend del S1/S2 je na mocku (Seja 12).

**S1 · AI klepet** `M` · odvisno od: R1, D51 · ⬜
- Naredi: `solve_sessions` (ena na poskus), `prompt_events`. Po D56 seja pripada **poskusu (try)**, ne samo attemptu: `solve_sessions.attempt_try_id` (ali agregat čez poskuse) - odloči ob rezini.
- API: `POST /attempts/:id/ai/messages` `{ text, tool }` → strežnik pokliče Claude API (ključ samo v `backend/.env`), zapiše `prompt_events` (žetoni iz `usage` odgovora, ne ocena), posodobi števce v `solve_sessions`, vrne odgovor (pozneje SSE).
- Frontend: `mockAskAi` (`src/lib/mock/aiChat.ts`) → API; števci v `useSessionTracker` iz odgovora.
- Končano, ko: tuj ali zaključen poskus → 404/409; ključ ni nikoli v odgovoru; omejitev pozivov na poskus (D51) vrne 429; `total_prompts` = število vrstic `prompt_events`.

**S2 · Zajem dogodkov urejevalnika** `S` · odvisno od: S1 · ⬜
- Naredi: `editor_events`.
- API: `POST /attempts/:id/events` `{ events[] }` (paketno; dovoljeni `event_type` iz `01`); `test_run` zapiše R4 na strežniku, ne odjemalec. `time_to_first_prompt`, `time_on_description`, `test_runs_count`, `tests_passed_on_first_run` se izračunajo na strežniku.
- Frontend: `useSessionTracker.track` → paketno pošiljanje.
- Končano, ko: neznan `event_type` → 400; dogodki po rešitvi zavrnjeni; dvojno poslan paket ne podvoji dogodkov.

**S3 · Ocena učinkovitosti v točkah** `M` · odvisno od: S2, R4, D51 · ⬜
- Čista funkcija s testi `efficiencyScore(session, benchmark)` → 0,5-2,0 (uteži iz `03`: pozivi 30 %, žetoni 25 %, iteracije 20 %, delež urejanj 15 %, prvi zagon 10 %); benchmark po težavnosti (do S5 konstante kot v `mock/aiChat.ts`).
- V transakciji R4: `solve_sessions.efficiency_score`, `points_earned = round(base × time × efficiency)`.
- Frontend: plošča "Session Efficiency" bere oceno s strežnika; statistike profila iz `03` (povprečni pozivi/žetoni, ocena, najljubše orodje, delež prvega zagona) v U2.
- Končano, ko: primer iz `03` (Medium, 1,5x, 1,8 → 675); ocena vedno v [0,5; 2,0].

**S4 · Lestvica** `S` · odvisno od: S3, D52 · ⬜
- API: `GET /leaderboard` (pravilo uvrstitve po D52). Frontend: nov zaslon `/leaderboard` (še ni zgrajen).

**S5 · AI analitika (admin)** `S` · odvisno od: A1, S3 · ⬜
- API: `GET /admin/analytics` (platforma) in `GET /admin/analytics/problems/:id` (`04`); povprečja po problemu postanejo benchmark za S3. Frontend: nov zaslon `/admin/analytics` (še ni zgrajen).

### M7 - Produkcija

**Z1 · Prvi admin** `S` · odvisno od: F2 · ⬜
- `npm run create-admin -- <email>`: naključno geslo, izpisano enkrat. `npm run seed` se v produkciji zavrne.

**Z2 · Varnost namestitve** `S` · odvisno od: vse · ⬜
- Omejitev poskusov prijave, varnostne glave, `Secure` piškotek, omejitev hkratnih Docker kontejnerjev na uporabnika in globalno.

---

## Register mockov (frontend → rezina)

Vsak zgrajen zaslon doda vrstico. Ko rezina zamenja mock, se vrstica označi ✅.

| Zaslon | Mock (datoteka / konstanta) | Zamenja rezina | Stanje |
| --- | --- | --- | --- |
| `/dashboard` + stranska vrstica (`(app)/layout.tsx`) | `src/lib/mock/dashboard.ts`: `mockGetDashboard` (datumi relativni na zdaj), `MOCK_ME` (uporabnik, cilj, izkušnje), `MOCK_ACTIVE_CONTEST_COUNT`; sličice v `public/mock/` | U3, T1, U2, F4 | ⬜ |
| `/problems` | ~~`mockGetProblems`~~ → `GET /problems` (P1), zaznamki → `PUT/DELETE /problems/:slug/bookmark` (D23); filtri/razvrščanje/drsenje ostanejo na odjemalcu. `mockGetProblems` še uporabljata mocka `profile.ts` in `adminContests.ts` | P1 | ✅ 8. 10. 2026 |
| `/problems/[slug]` | ~~`mockGetProblem`~~ → `GET /problems/:slug` (P2, `serverFetch`); besedilo = `codebaseContext` + `incidentReport` (migracija 0006, seed iz `mock/problemBriefs.ts`). Ostane mock: ocena v `RateProblem` samo v stanju (O1), `mockGetComments` (O2; rešen problem brez mock komentarjev = prazna razprava) | P2 ✅, O1, O2 | 🟨 |
| `/problems/[slug]/solve` | ~~`mockStartAttempt`, `CodeEditorMock`~~ → `POST /problems/:slug/start` + Monaco (R1 ✅). Ostane: `src/lib/mock/attempts.ts` `mockRunTests` (vnaprej določeni rezultati); split pane: opis (`ProblemOverview`) levo, urejevalnik desno, spodaj Terminal + Test Results; vsaka datoteka je zavihek, izbirnik jezika je samo prikaz; "Submit" = zagon preverjanj. Desno AI klepet (`AiChatPanel`): `src/lib/mock/aiChat.ts` - `mockAskAi` (1,5 s, 4 vnaprej napisani odgovori za payment-retries, ciklično za vse probleme), `AI_TOOLS`, `BENCHMARKS` (povprečje pozivov/žetonov po težavnosti); seja v `src/hooks/useSessionTracker.ts` (samo React stanje: pozivi, žetoni ≈ znaki/4, zagoni testov, dogodki); ocena učinkovitosti je groba primerjava z benchmarkom | R1 ✅, R2 ✅ (Give up), R4, R5 (terminal), R6, S1, S2, S3 (AI seja) | 🟨 |
| `/contests` | `src/lib/mock/contests.ts`: `mockGetContests` (live/upcoming/past + zgodovina uporabnika, datumi relativni na zdaj); prihajajoča tekmovanja brez težavnosti, oznak in sličice (T1); "View contest" vodi na `/contests/[id]` | T1, T2 | ⬜ |
| `/contests/[id]` | `src/lib/mock/contests.ts`: `mockGetContest` (seznam + `DETAILS`: incident, ime repozitorija (D27), število preverjanj, nagrada, udeležba); problemi tekmovanj so obstoječi mock problemi, da "Enter contest" odpre delujoč zaslon reševanja | T1, T2 | ⬜ |
| `/profile/[username]` | `src/lib/mock/profile.ts`: `mockGetProfile` (samo `max`, drugi → 404; 147 rešenih problemov, ciklično iz mock problemov; aktivnost 53 tednov = vsak tretji aktivni dan iz `mockActivity`; zgodovina tekmovanj iz `mockGetContests`); neskončno drsenje rešenih na odjemalcu | U1, U2, T2 | ⬜ |
| `/settings` | `src/lib/mock/profile.ts`: `MOCK_SETTINGS`, `mockSaveSettings` (shrani samo v stanje obrazca - profil in stranska vrstica se ne posodobita); zavihka Practice preferences in Account prazna (D35) | U1 (D34) | ⬜ |
| `/login` | ~~`mockLogin`, `mockLogout`~~ → `POST /auth/login`, `POST /auth/logout` (F2). Ostane mock: "Continue with GitHub" pokaže napako (D37) | F2 | ✅ 7. 10. 2026 |
| `/signup` | ~~`mockSignup`~~ → `POST /auth/signup` (F2): Username (D38), geslo ≥ 8 (D39) | F2 | ✅ 7. 10. 2026 |
| `/forgot-password` | `src/lib/mock/auth.ts`: `mockRequestPasswordReset` (uspe za vsak e-mail - stran ne razkrije, ali račun obstaja); pošiljanje pošte je odloženo (X5) | X5 (rezina še ne obstaja) | ⏸ |
| `/onboarding` | ~~`mockSaveOnboarding`~~ → `PUT /me/onboarding` (F4); "exploring" → `null` (D41), jeziki se shranijo (D42); "Sign out" → `POST /auth/logout` (F2) | F4 | ✅ 7. 10. 2026 |
| `/admin` (Overview) | `src/lib/mock/adminStats.ts`: `mockGetAdminOverview(range)` (realne številke, rast deterministična, datumi relativni na danes; aktivna tekmovanja = `MOCK_ACTIVE_CONTEST_COUNT`) | A9 | ⬜ |
| `/admin/problems/new` (Add Problem) | `src/lib/mock/adminProblems.ts`: `mockCheckDuplicate` (1,5 s; pade za ime ZIP-a, ki je bilo že shranjeno v tej seji), `mockProductionTest` (2 s; pade za prazen ZIP), `mockAnalyzeProblem` (3 s), `mockSaveProblem`; `mockRunCheck` ni več v uporabi (korak Validate odstranjen, D45) | A10, A2/A5 | ⬜ |
| `/admin/contests` | `src/lib/mock/adminContests.ts`: `mockGetAdminContests` (10 tekmovanj, datumi relativni na zdaj; aktivna/končana imajo id-je iz `mock/contests.ts`), `mockSetContestDates` (Schedule / Cancel), `mockRemoveContest` (Delete in Archive - arhiviranje vrstico samo odstrani); shramba v pomnilniku modula (velja do ponovnega nalaganja); zavihki Active/Scheduled/Drafts/Ended in iskanje na odjemalcu; "View results" odpre javno `/contests/[id]` (strani rezultatov še ni - A7) | A6, A7 | ⬜ |
| `/admin/contests/new`, `/admin/contests/[id]/edit` | `src/lib/mock/adminContests.ts`: `mockGetContestProblemOptions` (vsi mock problemi štejejo kot objavljeni), `mockGetAdminContest`, `mockSaveContest` (doda/zamenja v shrambi modula); čarovnik `ContestWizard`, datumi iz `src/lib/getContestDates.ts` | A6 | ⬜ |

---

## Nedoslednosti in vrzeli v dokumentih

Rešene z odločitvami 6. 10. 2026:

- ~~Zaščita testov~~ → D10 · ~~Referenčna rešitev~~ → D11 · ~~Kartica problema~~ → D16
- ~~Točke: en zapis ali dva~~ → D15 · ~~Tekmovalni problemi, `attempt_id`~~ → D17, D18
- ~~Ponoven poskus po odstopu~~ → D8 · ~~Časovna omejitev~~ → D9 · ~~Shranjevanje napredka~~ → D14

Odprto:

- **Točkovanje tekmovanj:** `03` "TBD" - za v1 velja D18 (enake točke kot redni problemi).
- **`repository_structure`** je izpeljiv iz ključev `files` - verjetno odveč (odloči v R1). Zdaj (P2): JSON seznam poti, ki ga pokaže stran podrobnosti; seed ga zapiše iz ključev `files`.
- **Nagrada poslana:** `04` "Admin marks reward as sent", stolpca ni (A7).
- **Incident `payment-retries-disappear` vs. koda (R3, 8. 10. 2026):** log kaže `attempt=1..3` z `delay=30000ms`, izvedljiva koda pa po prvem neuspehu ponovni poskus izgubi (log: `gateway timeout attempt=1`, `retry scheduled delay=30000ms`, nato nič). Besedilo incidenta (`problemBriefs.ts` + seed 0001) je treba uskladiti - odloči uporabnik.

---
- ~~`01_database.md` `user_profiles.goal_role` komentar je pisal `'ai_engineer'`~~ → popravljeno 8. 10. 2026 na `ai-engineer` (slug kategorije, F4).

## Odloženo

| ID | Kaj | Zakaj čaka |
| --- | --- | --- |
| X1 | VS Code razširitev | `02`: "Not in scope for v1" |
| X2 | Naročnine | `04`: nagrade po uvedbi naročnin |
| X3 | Bonusi tekmovanj | `03`: "TBD - not needed for v1" |
| X4 | Nalaganje avatarja | `users.avatar_url` obstaja, shramba datotek ni odločena |
| X5 | Pozabljeno geslo prek e-pošte | Pošiljanje pošte ni v stacku |

---

## Sledljivost: stran → rezine

| Stran | Rezine |
| --- | --- |
| `/login`, `/signup` | F2 |
| `/forgot-password` | X5 (odloženo) |
| `/onboarding` | F4 |
| `/dashboard` | U3, T1 |
| `/problems` | P1 |
| `/problems/[slug]` | P2, O1, O2 |
| `/problems/[slug]/solve` | R1-R6, S1-S3 |
| `/leaderboard` (ni zgrajen) | S4 |
| `/profile/[username]` | U1, U2, T2 |
| `/settings` | U1 (D34-D36) |
| `/contests`, `/contests/[id]` | T1, T2 |
| `/admin` | A9 |
| `/admin/problems/new` | A10, A2, A4, A5 |
| `/admin/contests`, `/admin/contests/new`, `/admin/contests/[id]/edit` | A6 (A7 za rezultate) |
| `/admin/analytics` (ni zgrajen) | S5 |
| `/admin/*` | A1-A9 |
