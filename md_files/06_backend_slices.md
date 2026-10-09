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
Zadnja posodobitev: 9. 10. 2026
Backend: M0 ✅ (F0-F4), M1 ✅ (P1 seznam problemov, P2 podrobnosti problema), M2 ✅ (R1, R2, R2b, R3, R4, R5, R6), M3 ✅ (O1, O2), M4 ✅ (U1, U2, U3), M5 ✅ (T1, T2), M6 🟨 (A1, A2, A10, A3, A4, A5, A6)
Frontend: 20 zaslonov (večina na API) - /login, /signup, /forgot-password, /onboarding, /dashboard,
          /problems, /problems/[slug] (+ rešen problem + razprava), /problems/[slug]/solve,
          /profile/[username], /settings, /contests, /contests/[id], /admin/problems/new,
          /admin (pregled), /admin/contests, /admin/contests/new, /admin/contests/[id]/edit,
          /admin/login, /admin/problems, /admin/problems/[id]/edit
Naslednja rezina: M6 A7 - rezultati tekmovanj + CSV (A1-A6, A10 ✅ 9. 10. 2026; A9.1 OpenAI dodana v načrt; za pravo analizo `ANTHROPIC_API_KEY` v `backend/.env`; odločitve M6 D20, D21, D22, D45, D46, D48, D50 rešene); testi 122/122; M8 (AI seja) čaka D51-D52
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
| D20 | ~~Pravilo validacije ob objavi~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M6): **vsa preverjanja morajo pasti na pokvarjeni kodi**, sicer objava ni mogoča. Brez nalaganja rešitve (drugi ZIP) - dry-run teče samo na izvirni kodi; `solution_files` (D11) admin ne polni (ostane za seed). Znana omejitev: ne dokaže rešljivosti in izloči negativna preverjanja ("potekel žeton → 401") | A10, A4, A5 |
| D21 | ~~Claude analiza~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M6, skupaj z D22): klic samo v backendu (`ANTHROPIC_API_KEY` v `backend/.env`, nikoli v frontendu ali odgovoru), model iz konfiguracije, ZIP največ 10 MB, izpusti `node_modules`, `.git` in binarne datoteke; strogo preverjanje JSON odgovora (oblika `ProblemAnalysis`), ob neveljavnem odgovoru 502 `ANALYSIS_INVALID` | A10 |
| D22 | ~~Kje živi razpakiran ZIP~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M6): analiza takoj ustvari osnutek problema (`is_published = false`) in shrani datoteke v `problem_codebase`; odgovor vrne `problemId`, "Save as Draft"/"Publish" sta `PATCH` istega osnutka. Zaprt zavihek ne izgubi dela. Brez začasnih map na disku | A10, A2 |
| D23 | ~~Zaznamki (bookmark) na kartici problema~~ → **rešeno 8. 10. 2026** (uporabnik): tabela `problem_bookmarks (user_id, problem_id, created_at, PK(user_id, problem_id))` + `PUT/DELETE /problems/:slug/bookmark` v P1; kartica dobi `saved` | U3, P1 |
| D24 | ~~Feed na dashboardu: filtri in rešeni problemi~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M4): rešeni problemi so **vedno skriti** (D19), stikalo "Hide solved" se odstrani. Filtri kategorija, težavnost in razvrščanje ostanejo | U3 |
| D25 | **ODPRTO** - ikona obvestil v zgornji vrstici | Dizajn ima zvonec, shema in dokumenti nimajo obvestil. Predlog: v v1 ikona brez funkcije ali skrita; obvestila kasneje kot svoja rezina | - |
| D26 | ~~Opisi preverjanj na strani podrobnosti~~ → **rešeno 8. 10. 2026** (uporabnik): `GET /problems/:slug` vrne `checks: string[]` = samo `problem_checks.description` po `check_order` (nikoli `check_command`/`expected_output`) | P2 |
| D27 | ~~Ime repozitorija in sklad na strani podrobnosti~~ → **rešeno 8. 10. 2026** (uporabnik): `problem_codebase.repository_name VARCHAR(100)`, sklad = `language` + `framework` + tagi; zavihek Repository pokaže poti iz `repository_structure` (brez vsebine) | P2, A2 |
| D28 | ~~"Give up" na zaslonu reševanja~~ → **rešeno 8. 10. 2026** (uporabnik): besedilni gumb "Give up" v zgornji vrstici + potrditveno okno v slogu Bugdr (`ConfirmDialog`, nativni `<dialog>`) namesto `window.confirm` | R2 |
| D29 | ~~Iskanje in razširitve v levi vrstici zaslona reševanja~~ → **rešeno 7. 10. 2026**: prenova zaslona reševanja (split pane) odstrani levo vrstico in drevo datotek; datoteke so zavihki nad urejevalnikom | R1 |
| D30 | ~~"Helpful" in odgovori na komentarje~~ → **rešeno 8. 10. 2026** (uporabnik, priprava M3): **vse, kot je v UI** (izvedba O2: števec iz `comment_helpful` ob branju namesto stolpca, razvrščanje na odjemalcu) - `problem_comments.parent_id UUID NULL REFERENCES problem_comments(id) ON DELETE CASCADE` (odgovori samo ena raven: odgovor na odgovor → 400), tabela `comment_helpful (comment_id, user_id, created_at, PK(comment_id, user_id))` + `problem_comments.helpful_count INTEGER NOT NULL DEFAULT 0` (posodobljen v isti transakciji), `PUT/DELETE /comments/:id/helpful` (lastnega komentarja ni mogoče označiti → 403), `GET /problems/:slug/comments?sort=helpful\|newest` | O2 |
| D31 | ~~Stran posameznega tekmovanja~~ → **rešeno 6. 10. 2026**: uporabnik je dal dizajn, pot `/contests/[id]` (id, ker `contests` nima sluga). En incident na tekmovanje kot v dizajnu, čeprav shema dovoli več problemov (`contest_problems`) | T1, T2 |
| D33 | ~~En ali več problemov na tekmovanje~~ → **rešeno 7. 10. 2026** (uporabnik, prenova admin tekmovanj): **vsaj 1 problem, lahko več** (`contest_problems`). Javni `ContestDetail.problem` (`/contests/[id]`) ostane en problem (D59, 9. 10. 2026) | T1, A6 |
| D34 | ~~Polja profila iz `/settings`~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M4): **vsa polja** - `user_profiles` + `display_name VARCHAR(50)`, `headline VARCHAR(80)`, `github_username VARCHAR(39)`, `is_public BOOLEAN NOT NULL DEFAULT TRUE` (`languages` že v F4); API `PUT /me/profile`. Zaseben profil drugim pokaže samo `username`. Jeziki ostanejo fiksen seznam (`LANGUAGES`) | U1 |
| D35 | **ODPRTO** - zavihka "Practice preferences" in "Account" na `/settings` | Dizajn ju ima, vsebine ne. **Uporabnik 9. 10. 2026: ostaneta, kot sta ("coming soon"), vrnemo se kmalu** - ni del U1. Zdaj prazno stanje "coming soon". Predlog: Account = e-pošta, sprememba gesla, odjava; Practice preferences = `platform_goal` (F4) | U1, F2 |
| D36 | ~~"Starting difficulty" na `/settings`~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M4): **ostane `experience_level`** - polje "Production experience" z opombo, da določa začetno težavnost (D19). Brez ločene nastavitve težavnosti | U1, U3 |
| D32 | ~~"N/M checks passed" v zgodovini tekmovanj~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M5): vrstica zgodovine kaže **rešene probleme + točke** (npr. "1/1 solved · 375 pts") iz `contest_entries` (`problems_solved`, `total_score`) in števila problemov tekmovanja. `ContestHistoryEntry.checksPassed`/`checksTotal` → `problemsSolved`/`problemCount`/`score`; enako `participation` na `/contests/[id]` | T2 |
| D37 | **ODPRTO** - "Continue with GitHub" na `/login` in `/signup` | Dizajn ima prijavo z GitHubom, stack ima samo JWT z geslom (F2). Zdaj gumb pokaže "not available yet". Predlog: v v1 skrit; OAuth kasneje kot svoja rezina (`users.github_id`) | F2 |
| D38 | ~~"Full name" namesto `username` na `/signup`~~ → **rešeno 7. 10. 2026** (uporabnik): obrazec ima polje **Username** (3-50 znakov: črke, številke, `-`, `_`; unikaten brez razlike v velikosti črk), polno ime odpade do `display_name` (D34) | F2, U1 |
| D39 | ~~Minimalna dolžina gesla~~ → **rešeno 7. 10. 2026** (uporabnik): **8 znakov** (zgornja meja 200 zaradi cene scrypta) | F2 |
| D40 | ~~"Remember me" na `/login`~~ → **rešeno 7. 10. 2026** (uporabnik): s kljukico piškotek za 30 dni, brez nje piškotek seje brskalnika; JWT velja največ 30 dni v obeh primerih. Registracija = piškotek seje | F2 |
| D41 | ~~"Exploring my path" na onboardingu~~ → **rešeno 7. 10. 2026** (uporabnik, F4): `goal_role = NULL` = raziskujem; UI vrednost `"exploring"` se ob oddaji pretvori v `null`. D19 feed brez filtra kategorije | F4, U3 |
| D43 | ~~Osnutki tekmovanj~~ → **rešeno 7. 10. 2026** (uporabnik): stanje se **nikoli ne shrani**, vedno se izpelje iz datumov (`getContestStatus`): `starts_at IS NULL` = osnutek, `starts_at > now()` = načrtovano, `starts_at <= now() <= ends_at` = aktivno, `ends_at < now()` = končano. Brez `is_published`. Preklic načrtovanega = `starts_at`/`ends_at` nazaj na NULL. Javni `GET /contests` vrne samo tekmovanja z `starts_at IS NOT NULL` | A6, T1 |
| D44 | ~~Pravila ob objavi tekmovanja~~ → **rešeno 7. 10. 2026** (uporabnik): čarovnik v 4 korakih (`04`). Načrtovanje zahteva naslov, opis, vrsto, ≥ 1 problem, veljavne datume (konec po začetku, začetek v prihodnosti); Hard/Get a job je samo priporočilo. Datumi se izračunajo iz vrste (`getContestDates`, UTC) ali ročno ("Custom dates"). Nagrada: `reward_type` (subscription/merch/points) ali brez, opis obvezen ob izbrani vrsti. Odprto ostaja samo: ali se tekmovanja iste vrste smejo prekrivati | A6 |
| D45 | ~~Add Problem v 3 korakih~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M6): korak Review dobi **polje Title** (AI ga predizpolni, slug iz naslova). Časovna omejitev ostane samodejna = spodnja meja `TIME_LIMIT_RANGE` za težavnost (brez polja). Brez sličice in brez koraka Validate - dry-run teče v backendu ob objavi (A4/A5, pravilo D20). Privzeto (brez vprašanja): preverjanje dvojnikov = zgoščena vrednost razpakiranih datotek (SHA-256), produkcijski test = zagon kode v Dockerju (R3) | A10, A2, A4, A5 |
| D46 | ~~Časovna okna statistike~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M6): po predlogu - "Active users" = odprl problem tisti dan (`user_daily_activity`, isto kot niz), "Solves" iz `user_problem_attempts.solved_at`, "Today" po UTC, trend glede na prejšnje enako dolgo obdobje; grafi so fiksna okna (30 / 14 dni) | A9 |
| D47 | ~~Gostje na `/contests`, `/contests/[id]` in `/profile/[username]`~~ → **rešeno 7. 10. 2026** (uporabnik, F3): **zahtevana prijava** - vse tri poti so v `src/proxy.ts`, gost gre na `/login?next=…`. Profili zato niso deljivi zunaj aplikacije | F3, T1, U1 |
| D42 | ~~Jeziki na onboardingu~~ → **rešeno 7. 10. 2026** (uporabnik, F4): shranijo se že v F4 - `user_profiles.languages TEXT[] NOT NULL DEFAULT '{}'`, samo vrednosti iz fiksnega seznama `LANGUAGES` (podvojeni odstranjeni). `/settings` jih uporabi v U1 (D34) | F4, U1 |
| D49 | ~~Tabele, ki jih M1 potrebuje iz kasnejših rezin~~ → **rešeno 8. 10. 2026** (uporabnik): **tabele zgodaj, logika kasneje**. M1 ustvari `user_problem_attempts`, `problem_codebase`, `problem_checks` (R1), `problem_ratings` (O1), `problem_comments` (O2) - samo `CREATE TABLE` po `01` + spremembe iz tabele spodaj; endpointi in pravila ostanejo v svojih rezinah. Seed jih napolni, da se stanja rešen / v delu preverijo na pravih podatkih | P1, P2, R1, O1, O2 |
| D48 | ~~Admin ni uporabnik~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M6): **ločena prijava `/admin/login`, samo e-pošta + geslo** (brez drugega faktorja). Poverilnice samo v `backend/.env`: `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (scrypt, ukaz `npm run hash-password`). Ločen httpOnly piškotek admin seje (8 h), neodvisen od uporabniške seje; `requireAdmin` in proxy preverita admin sejo, `users.is_admin` odpade. Admin ne rešuje in ne komentira. `/admin` dobi **svojo postavitev** (stranska vrstica samo z admin povezavami + "Log out", brez avatarja in nivoja). Nadomesti Z1 (`create-admin`). Omejitev poskusov prijave pride z Z2 | F3, Z1, A1-A10 |
| D50 | ~~Add Problem po razdelitvi opisa~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M6): Review ima **dve polji** "Codebase context" in "Incident report" (namesto "Full description"), oba predizpolni AI. Sistemski poziv A10 spremenim jaz: vrne `codebase_context` + `incident_report` po pravilih iz `02` (nikoli vzrok, pričakovano vedenje ali datoteka) | A10, A2 |
| D51 | **ODPRTO** - podrobnosti ocene učinkovitosti (`03`, 8. 10. 2026) | Odprto: (a) kaj je "iteracija" (par poziv-odgovor ali zagon testov med pozivi?); (b) delež urejanj zahteva razlikovanje AI vs. ročnih sprememb - mogoče samo za vgrajeni klepet (gumb "Apply"), zunanja orodja štejejo kot ročna (`02`); (c) kako uteži preslikati v 0,5-2,0 (linearno glede na benchmark težavnosti?); (d) omejitev pozivov/žetonov na poskus in kdo plača Claude API; (e) ali se izbrano orodje (GPT-4, Gemini) le zabeleži, ker vgrajeni klepet kliče samo Claude |
| D52 | **ODPRTO** - lestvica `/leaderboard` (`00`, 8. 10. 2026) | "Global ranking by efficiency score": povprečje `efficiency_score` vseh rešitev ali skupne točke (te že vsebujejo učinkovitost)? Najmanjše število rešitev za uvrstitev, časovno okno (vse / mesec), javna za goste? Zaslona še ni |
| D53 | ~~Izvedljivi problemi za M2~~ → **rešeno 8. 10. 2026** (uporabnik): najprej **en** pravi problem - `payment-retries-disappear` dobi skrite teste (`hidden_files`), rešitev (`solution_files`) in preverjanja, ki tečejo brez npm paketov. Ostalih 11 seed problemov ostane samo za prikaz: Test vrne jasno "checks not available yet", dokler jih ne doda admin (A2-A5) | R3, R4 |
| D54 | ~~Jeziki izvajalnika v v1~~ → **rešeno 8. 10. 2026** (uporabnik): **samo Node/TypeScript** (ena osnovna slika); drugi jeziki, ko jih zahteva prvi problem | R3 |
| D56 | ~~Zgodovina poskusov in čas po odstopu~~ → **rešeno 8. 10. 2026** (uporabnik): **vsak poskus (try) je svoj zapis** - začetek, konec, izid (opustil / rešil / odprt), trajanje; pozneje tudi AI poraba po poskusu. Za točke (časovni bonus) šteje **vsota časa vseh poskusov** - odstop + ponoven start ne resetira ure. Spremeni D8: vrstica `user_problem_attempts` ostane ena na problem, `started_at` se ob ponovnem startu še vedno nastavi (začetek trenutnega poskusa), čas za točke pa je vsota poskusov | R2b, R4, S1 |
| D55 | ~~Urejevalnik v R1~~ → **rešeno 8. 10. 2026** (uporabnik): R1 doda `@monaco-editor/react` namesto `CodeEditorMock`; spremembe v `localStorage` po poskusu (D14) | R1 |
| D57 | ~~Izmišljene ocene v seedu~~ → **rešeno 8. 10. 2026** (uporabnik, priprava M3): **samo prave ocene** - `average_rating` in `rating_count` se ob vsaki oceni izračunata znova iz `problem_ratings` (`avg`/`count`) v isti transakciji; seed vseh 12 problemov začne z 0 ocenami (brez izmišljenih 4,9 (41)) | O1 |
| D58 | ~~Urejanje in brisanje komentarjev~~ → **rešeno 8. 10. 2026** (uporabnik, priprava M3): **samo brisanje lastnega komentarja**, brez urejanja. Povezava "Delete" pri lastnem komentarju + `ConfirmDialog`; izbris komentarja izbriše tudi njegove odgovore (`ON DELETE CASCADE`) in oznake helpful. Prikazno ime avtorja = `username`, dokler U1 ne doda `display_name` (D34) | O2 |
| D59 | ~~Več problemov na strani tekmovanja~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M5): **zaenkrat en problem** - `/contests/[id]` pokaže samo prvi problem tekmovanja (`ContestDetail.problem` ostane en objekt, D33 v shemi velja). Prikaz več problemov počaka na dizajn | T1 |
| D60 | ~~Kdaj uporabnik sodeluje v tekmovanju~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M5): **ob "Enter contest"** - prvi start tekmovalnega problema, ko je tekmovanje aktivno, ustvari vrstico `contest_entries` (0 rešenih). Šteje v "N engineers participating"; brez vrstice = "You did not take part" / "Not started" | T2 |
| D61 | ~~Lestvica tekmovanja~~ → **rešeno 9. 10. 2026** (uporabnik, priprava M5): **v M5 je ni** - brez `GET /contests/:id/leaderboard` in brez `contest_entries.rank`. Razvrstitev (tudi zmagovalec za nagrado, `03`) pride z rezultati za admina (A7) | T2, A7 |

### Spremembe sheme glede na `01_database.md`

Posledica odločitev - narejene v migraciji rezine, ki tabelo ustvari:

| Tabela | Sprememba | Odločitev | Rezina |
| --- | --- | --- | --- |
| `contest_entries` | − `attempt_id`, − `rank` (D61) | D18 | T2 ✅ |
| `contests` / `contest_entries` | + oznaka "nagrada poslana" (`04`) - točna oblika ob rezini | - | A7 |
| `problems` | + `bug_summary TEXT NOT NULL DEFAULT ''` (interna opomba AI analize, samo admin, nikoli k uporabniku; migracija 0014) | - | A2 ✅ |
| `contests` | `starts_at`/`ends_at` dovolita NULL (osnutek); stanje se ne shrani | D43 | T1 ✅ |
| `contests` | + `archived_at TIMESTAMP` (NULL = ni arhivirano; arhiviranje končanih tekmovanj, `04`) | - | T1 ✅ (uporablja A6) |
| `users` | − `is_admin` (migracija 0013) - admin je v `.env` | D48 | A1 ✅ |
| `users` | `username` brez `UNIQUE` v stolpcu; namesto tega `UNIQUE INDEX ON lower(username)` (unikaten ne glede na velikost črk, gre v URL) | F2 | F2 |
| `user_profiles` | + `languages TEXT[] NOT NULL DEFAULT '{}'` (narejeno v F4); `goal_role` NULL = raziskujem | D42, D41 | F4 |
| `user_profiles` | + `display_name VARCHAR(50)`, `headline VARCHAR(80)`, `github_username VARCHAR(39)`, (`languages` že v F4), `is_public BOOLEAN NOT NULL DEFAULT TRUE` | D34 | U1 |

Ko rezina tabelo ustvari, se `01_database.md` posodobi, da se ujema z
migracijo (uporabnik 8. 10. 2026: "update all md files"). Ta tabela ostane
seznam sprememb za tabele, ki še niso zgrajene. Narejeno v `01`: `users`
(F2), `user_profiles` + `languages` (F4), `problem_categories`, `problems`, `problem_tags`,
`problem_bookmarks`, `user_problem_attempts` (P1), `attempt_tries` (R2b), `check_results`, `point_transactions` (R4), `problem_codebase` (+ `hidden_files`, `solution_files`,
`repository_name`), `problem_checks`, `problem_ratings`, `problem_comments`, `user_daily_activity` (P2); `problem_comments.parent_id`, `comment_helpful` (O2, migracija 0009 - brez `helpful_count`, šteje se ob branju);
`problems.description` → `codebase_context` + `incident_report` (migracija 0006, 8. 10. 2026); `contests` (NULL datumi, `archived_at`), `contest_problems` (T1, migracija 0011), `contest_entries` (T2, migracija 0012; `contest_attempt_links` ni zgrajena).

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
| M6 Admin | A1 → A2 → A10 → A3 → A4 → A5 → A6-A9 → A9.1 | Upravljanje problemov, tekmovanj, uporabnikov, statistika |
| M8 AI seja | S1 → S2 → S3 → S4, S5 | Vgrajeni AI klepet, zajem seje, ocena učinkovitosti v točkah, lestvica, AI analitika |
| M7 Produkcija | Z1 → Z2 | Seed zaklenjen v produkciji, varna namestitev |

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
- D17 (skriti problemi nekončanih tekmovanj): ~~filter doda rezina, ki ustvari `contest_problems`~~ → narejeno v T1 (`LISTED` / `VISIBLE` v `problems.routes.js`).
- Brez paginacije (konvencija v1): ~~strežnik filtrira in razvrsti~~ → narejeno drugače, glej Stanje (strežnik vrne cel seznam, odjemalec filtrira); odjemalec ohrani neskončno drsenje z rezanjem seznama (`limit` v `ProblemBrowser.tsx`).
- Frontend: `/problems` - `mockGetProblems` → `GET /problems`, filtri v query, zaznamki prek API-ja.
- Končano, ko: neobjavljen problem ni na seznamu; filtri se kombinirajo; `base_points` se ujema s težavnostjo (CHECK); gost nima `status`; zaznamek dvakrat = ena vrstica.
- **Stanje:** `migrations/0004_problems.sql` (kategorije s seedom, `problems` s CHECK `(difficulty, base_points)`, `problem_tags` z `UNIQUE (problem_id, tag)`, `problem_bookmarks`, `user_problem_attempts`). `seeds/0001_problems.sql` = 12 mock problemov (isti slugi, sličice `/mock/…`, opis je samo kratek odstavek - P2). `backend/src/modules/problems/problems.routes.js`: `GET /problems` → `{ problems: ProblemListItem[] }` (+ `saved`), `PUT`/`DELETE /problems/:slug/bookmark` → 204 (neznan ali neobjavljen slug → 404 `PROBLEM_NOT_FOUND`). `optionalAuth` v `auth.service.js`: neveljaven, potekel ali bannan piškotek = gost. **Odstopa od načrta:** `GET /problems` nima query filtrov - vrne cel objavljen seznam v vrstnem redu "recommended" (najprej kategorija iz `goal_role`, nato ocena, nato naslov; `abandoned` = `status: null`), filtri, iskanje, `rating`/`shortest` in neskončno drsenje ostanejo na odjemalcu (`ProblemBrowser.tsx`, oznaka `ponytail:`). Filtri v query + `limit/offset`, ko seznam preraste ~1000 problemov. Frontend: `/problems` bere API, zaznamek se preklopi takoj in vrne nazaj ob napaki, števec "Saved problems" iz `saved`; `ProblemListItem.saved` dodan (mock problemi `saved: false`). Odprto: ~~D17 filter~~ (T1 ✅); dashboard (U3) zaznamkov še ne bere.

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

**R4 · Test in rešitev** `L` · odvisno od: R3, F1 · ✅ 8. 10. 2026
- Naredi: `check_results`, `point_transactions`.
- API: `POST /attempts/:id/test` `{ files }` → rezultat po preverjanju (`passed`, `output` samo pri neuspehu).
- Če vsa `must_pass` uspejo - **ena transakcija:** `status = 'solved'`, `solved_at`, `time_taken_seconds` (strežnik), `time_bonus_multiplier`, `points_earned`, `final_code`, `lines_added/deleted` (diff proti izvirnim datotekam), vrstice v `point_transactions` (D15), `user_stats` (točke, nivo, `problems_solved`), `user_daily_activity` (`problems_solved`, `points_earned`), `problems.solve_count`.
- Prikaz poskusov (uporabnik 8. 10. 2026): **samo kartica "Problem solved"** na `/problems/[slug]` - "Solved on try N · <skupni čas>" + seznam poskusov (npr. gave up after 25m, gave up after 31m, solved after 16m). `GET /problems/:slug` `result` dobi `tries: { tryNumber, outcome, durationSeconds }[]` iz `attempt_tries` (`SolveResult` v `types/problem.ts`). Drugje (stran pred rešitvijo, profil, admin) zaenkrat ne.
- Čas za časovni bonus = **vsota vseh poskusov** (D56): zaprti `attempt_tries.duration_seconds` + trenutni; ob rešitvi se odprt try zapre z `outcome = 'solved'` v isti transakciji.
- Formula v `03` je zdaj `base × time × efficiency_score`: R4 pred S3 računa z `efficiency = 1`, S3 doda faktor v isto transakcijo.
- Čiste funkcije s testi: `timeMultiplier(seconds, limitMinutes)` (meje iz `03`: < 25 % → 2x, < 50 % → 1.5x, < 75 % → 1.25x, sicer 1x), `finalPoints` (zaokroženo).
- Končano, ko: primer iz `03` (30 min, Medium, 8 min → 375; 6 min → 500); dvojni klik Test ne podeli točk dvakrat (zaklep vrstice poskusa); neuspel Test ne spremeni statusa; `SUM(point_transactions) = user_stats.total_points`.
- **Stanje:** `migrations/0008_check_results_points.sql` (+ CHECK `reason`, indeksa). Čiste funkcije `backend/src/modules/scoring/scoring.js`: `timeMultiplier` (meje strogo "pod"), `finalPoints` (z `efficiency = 1` do S3), `lineChanges` (multimnožica vrstic po datoteki - premaknjena vrstica = nespremenjena, `ponytail:`). `POST /attempts/:id/test` `{ files }` (v `attempts.routes.js`): tuj → 404, rešen → 409 `ALREADY_SOLVED`, opuščen → 409 `ATTEMPT_NOT_ACTIVE`, brez skritih preverjanj → 409 `CHECKS_UNAVAILABLE` (D53), neveljavne datoteke → 400 `INVALID_FILES`; `runChecks` (R3), vsi rezultati v `check_results`; ko uspejo vsa `must_pass`, ena transakcija z `FOR UPDATE`: zapre odprt try (`solved`), čas = vsota poskusov (D56), `user_problem_attempts` (+ `final_code` = izvirne + oddane datoteke), dve vrstici v `point_transactions` (vsota = točke), `user_stats` (točke, `problems_solved`, `current_level` iz `level_thresholds`), `user_daily_activity`, `solve_count`. Odgovor `{ results, solved: { pointsEarned, timeTakenSeconds, timeMultiplier } | null }`; dvojni klik dobi isti `solved`. `express.json` limit 3 MB (+ 413 `PAYLOAD_TOO_LARGE`). `GET /problems/:slug` `result.tries`. Frontend: Submit pošlje datoteke na API (rezultati se odkrivajo po vrsti, R6 jih bo pretakal), ob rešitvi izbriše osnutek in odpre stran podrobnosti; kartica "Problem solved" ima razdelek poskusov ("Solved on try N", čas vsakega poskusa); Monaco brez semantičnih napak (ni Node tipov v brskalniku - lažni alarmi), sintaksne ostanejo. Testi `r4-scoring.test.js` (brez baze) in `r4.test.js` (Docker); `p2.test.js` + `tries`. **Odprto:** izhod neuspelega preverjanja vsebuje povzetek node:test (`ℹ tests 1` …); `src/lib/mock/attempts.ts` (`mockRunTests`) ni več v uporabi - čaka potrditev za izbris.

**R5 · Terminal** `M` · odvisno od: R3 · ✅ 8. 10. 2026
- API po D13 (v1: `POST /attempts/:id/terminal` `{ command }` → izhod; dolgotrajni procesi prek SSE).
- Kontejner terminala živi, dokler je poskus odprt (z neaktivnostnim časovnikom), ločen od kontejnerja preverjanj.
- Frontend: terminalska komponenta na zaslonu reševanja.
- Končano, ko: `npm run dev` pokaže izhod; ukaz ne doseže gostitelja ali omrežja; kontejner se ugasne po neaktivnosti.
- **Stanje:** `POST /attempts/:id/terminal` `{ command, files }` → pretok **NDJSON** v enem odgovoru (`{type:"output",text}` …, nato `{type:"exit",code}` ali `{type:"stopped",reason:"timeout"|"output"|"aborted"}`) namesto ločenega SSE - en klic, deluje prek Next proxyja. `runTerminal`/`stopTerminal` v `runner.service.js`: en kontejner na odprt poskus (ista izolacija kot R3, `bugdr-term-*`, oznaka `bugdr.runner=1`), **samo vidne datoteke** (problem + urejevalnik, sinhronizirane ob vsakem ukazu; nikoli skrite - D10); en ukaz naenkrat (nov ukaz počaka ≤ 3 s na ustavljenega, sicer 409 `TERMINAL_BUSY`), 30 s na ukaz, ≤ 256 KB izhoda, prekinitev odjemalca (Stop / Ctrl+C / zaprt zavihek) ustavi ukaz (`kill -9 -1`); kontejner se odstrani po 10 min neaktivnosti, ob odstopu in rešitvi, sam po 1 h. Neveljaven ukaz → 400 `INVALID_COMMAND`, neaktiven poskus → 409 `ATTEMPT_NOT_ACTIVE`. Napaka po začetku pretoka samo zaključi odgovor (`app.js`). Frontend: terminal pošilja ukaze z datotekami urejevalnika, izhod se izpisuje sproti, gumb Stop in Ctrl+C; `npm test` ne sproži več Submit. Test `backend/test/r5.test.js` (Docker). **Odstopa od načrta:** NDJSON namesto SSE; `cd` se ne ohrani med ukazi (vsak ukaz je nov `sh`); seznam terminalov živi v procesu (`ponytail:` - en backend). Ni pravega PTY (D13): interaktivni programi (vprašanja, barve) ne delujejo.

**R6 · Rezultati v živo** `S` · odvisno od: R4 · ✅ 8. 10. 2026
- `02`: "partial results shown in real time" - stanja `pending/running/passed/failed` po preverjanju prek SSE (`GET /attempts/:id/test-stream`) ali odgovora v kosih.
- Končano, ko: odjemalec vidi `running` → `passed` za vsako preverjanje posebej, preden se konča zadnje.
- **Stanje:** `POST /attempts/:id/test` vrača **NDJSON pretok** (kot terminal R5, namesto ločenega `GET …/test-stream`): `{type:"running",checkId}` in `{type:"result",checkId,passed,output?}` za vsako preverjanje sproti, nato `{type:"done",results,solved}`; napake pred prvo vrstico ostanejo JSON s statusom. `runChecks(…, { onProgress })`. Tek se konča (in lahko reši problem) tudi, če odjemalec odide. Frontend: skupni `apiStream` v `src/lib/api.ts` (bere NDJSON; uporabljata ga Submit in terminal), Submit posodablja stanje vsakega preverjanja ob dogodku - umetni zamik 250 ms odstranjen. Test `backend/test/r6.test.js` (vrstni red running/result, rezultati prihajajo narazen); `r4.test.js` bere pretok. Popravek `r5.test.js`: preverja samo svoje kontejnerje (dev backend ima lahko svoje terminale - vzrok "nestabilnega" testa).

### M3 - Skupnost

**O1 · Ocene** `S` · odvisno od: R4 · ✅ 8. 10. 2026
- Tabela `problem_ratings` že obstaja (P2 - D49).
- API: `PUT /problems/:slug/rating` `{ rating: 1-5 }` - samo po rešitvi (403 `NOT_SOLVED`), gost 401, neveljavna ocena 400; upsert (`ON CONFLICT (user_id, problem_id)`), nato `average_rating`/`rating_count` znova iz `problem_ratings` v isti transakciji (D57). Odgovor: `{ averageRating, ratingCount, myRating }`.
- Seed: vseh 12 problemov začne z `average_rating = 0`, `rating_count = 0` (D57).
- Frontend: `RateProblem.tsx` (stran `/problems/[slug]`, kartica rešenega problema) shrani oceno z `PUT`; ob napaki vrne prejšnjo oceno. Povprečje v glavi strani se osveži (`router.refresh()`).
- Končano, ko: nerešen → 403; ponovna ocena posodobi, ne podvoji; povprečje in število pravilna po več ocenah različnih uporabnikov.
- **Stanje:** `PUT /problems/:slug/rating` v `problems.routes.js` (transakcija: zaklene vrstico problema, upsert, povprečje znova iz `problem_ratings`; vrstni red napak 401 → 404 → 400 → 403). Seed 0001 nima več izmišljenih ocen, ob ponovnem zagonu izračuna `average_rating`/`rating_count` iz pravih ocen (popravi tudi obstoječo dev bazo). `RateProblem` shrani z `PUT` + `router.refresh()`, ob napaki vrne prejšnjo oceno. Test `backend/test/o1.test.js` (napake, povprečje več uporabnikov, ponovna ocena, vzporedni oceni). Opaženo, ni popravljeno: brez ocen se kaže `★ 0.0 (0 ratings)` in ednina je `(1 ratings)`.

**O2 · Komentarji** `M` · odvisno od: R4, D30 ✅, D58 ✅ · ✅ 8. 10. 2026
- Tabela `problem_comments` že obstaja (P2 - D49). Migracija doda `parent_id` in tabelo `comment_helpful` (D30).
- API:
  - `GET /problems/:slug/comments?sort=helpful|newest` - nerešen ali gost: samo `{ count, locked: true }`; rešen: `{ comments: ProblemComment[] }` (odgovori v `replies`, razvrščeni od najstarejšega; razvrščanje velja za komentarje prve ravni).
  - `POST /problems/:slug/comments` `{ content, parentId? }` - samo po rešitvi (403 `NOT_SOLVED`); prazna (po `trim`) ali > 2000 znakov → 400; `parentId` mora biti komentar prve ravni istega problema, sicer 400.
  - `DELETE /comments/:id` - samo avtor (403 sicer), izbriše tudi odgovore in oznake (D58).
  - `PUT/DELETE /comments/:id/helpful` - samo po rešitvi problema; lastni komentar → 403; idempotentno; števec se šteje iz `comment_helpful` ob branju.
- Vsebina se hrani surova, izpis je varen (React escapa). `author.displayName` = `username` do U1 (D34), `goalRole` iz `user_profiles`.
- Frontend: zavihek Discussion na `/problems/[slug]` - `Discussion.tsx` zamenja `mockGetComments` in stanje komponente s klici API; gumb "Delete" pri lastnem komentarju + `ConfirmDialog` (D58). `MOCK_ME` v `Discussion.tsx` zamenja prijavljeni uporabnik. Oblika: `ProblemComment` v `frontend/src/lib/types/problem.ts`.
- Končano, ko: nerešen uporabnik nikoli ne dobi vsebine; prazna/predolga vsebina → 400; odgovor na odgovor → 400; helpful ne gre na lasten komentar in se ne podvoji; izbris odstrani odgovore; `commentCount` na strani podrobnosti se ujema.
- **Stanje:** migracija 0009 (`parent_id` + indeks, tabela `comment_helpful`), modul `backend/src/modules/comments/comments.routes.js` (priklopljen na `/api/v1`). Odstopanja od zgornjega načrta (enostavneje): **brez stolpca `helpful_count`** - šteje se iz `comment_helpful` ob branju, zato se ne more razhajati; **brez `?sort=`** - odgovor vsebuje vse komentarje, razvršča odjemalec (kot `/problems`); komentar ima novo polje `own` (gledalec je avtor), zato frontend ne potrebuje trenutnega uporabnika. Vsebina se shrani obrezana (`trim`). Frontend: stran naloži komentarje s `serverFetch`, `Discussion.tsx` objavi/odgovori/označi/izbriše prek API (helpful takoj, ob napaki nazaj; obrazec odgovora obdrži besedilo ob napaki), "Delete" + `ConfirmDialog`, po spremembi `router.refresh()` (števec na zavihku). Test `backend/test/o2.test.js` (6 testov).

### M4 - Profil in dashboard

**U1 · Profil** `M` · odvisno od: R4 · ✅ 9. 10. 2026
- API: `GET /users/:username` → statistika iz `03` "Stats Shown on Profile" (točke, nivo + napredek do naslednjega, rešeni, streak, najdaljši streak, po težavnosti, po kategoriji, povprečni čas) + seznam rešenih problemov. Brez e-pošte.
- API: `PUT /me/profile` (polja iz D34, `goalRole`, `experienceLevel`, `languages`) za `/settings`; zaseben profil (`is_public = false`) drugim vrne samo `username`. Polje težavnosti = `experienceLevel` (D36). Zavihka Practice preferences in Account ostaneta "coming soon" (D35).
- Frontend: `/profile/[username]`, `/settings`. Oblika odgovora je `Profile` v `frontend/src/lib/types/profile.ts` (+ `contests` = zgodovina tekmovanj iz T2).
- Končano, ko: neznan username → 404; banned uporabnik → 404; števci se ujemajo z `user_problem_attempts`.
- **Stanje:** migracija 0010 (`display_name`, `headline`, `github_username`, `is_public` v `user_profiles`), nov modul `backend/src/modules/users/users.routes.js` (`GET /users/:username`, ime brez razlike v velikosti črk, `optionalAuth`), v `me.routes.js` `GET /me/profile` (`{ username, settings }`) in `PUT /me/profile` (cel obrazec; prazna neobvezna polja = NULL, ime obrezano, GitHub po pravilu GitHuba). Profil ima novo polje `own` (gledalec je lastnik) namesto primerjave z `MOCK_ME`; zaseben profil drugim vrne `PrivateProfile` = `{ username, displayName: username, isPublic: false, own: false }`. Avtor komentarja ima zdaj `display_name` (O2). **Odstopa od načrta (enostavneje):** brez statistike po težavnosti, kategoriji in povprečnega časa - zaslon jih ne kaže (dodati, ko jih dobi dizajn); `problemsSolved` se šteje iz poskusov; `activity: []` do U2, `contests: []` do T2; streak se bere, kot je shranjen (pravilo "starejši od včeraj = 0" je U2). **Dodatno (sicer bi bile povezave pokvarjene):** `(app)/layout.tsx` naloži prijavljenega uporabnika z `GET /me/profile`, `SessionProvider` nosi `Me` (`useMe()`), stranska vrstica, zgornja vrstica in pozdrav + povezava na profil na `/dashboard` ne uporabljajo več `MOCK_ME`; po shranjevanju nastavitev `router.refresh()`. `Me.goalRole` je lahko `null` (stranska vrstica: "Exploring my path"), obrazec ima to možnost pri vlogi. Test `backend/test/u1.test.js` (6 testov).

**U2 · Graf aktivnosti in streak** `S` · odvisno od: U1, P2 · ✅ 9. 10. 2026
- API: `GET /users/:username/activity` → zadnjih 52 tednov iz `user_daily_activity` (intenziteta = rešeni na dan, `03`). Mreža na profilu ima 53 stolpcev (52 polnih tednov + tekoči), zato naj API vrne od ponedeljka pred 52 tedni naprej.
- Streak na branje: če je `last_activity_date` starejši od včeraj, se prikaže `current_streak = 0` (brez cron opravila).
- Končano, ko: dan brez aktivnosti prekine streak; najdaljši streak se ne zmanjša.
- **Stanje:** **Odstopa od načrta (enostavneje):** brez ločenega `GET /users/:username/activity` - `activity` je del `GET /users/:username` (en klic, en odjemalec; dashboard dobi svojo v U3). Vrne samo dneve z vrstico (`date` = `YYYY-MM-DD` po UTC, `problemsOpened`, `problemsSolved`) od ponedeljka pred 52 tedni (`date_trunc('week', …) - 364`), mreža ostale dopolni z 0. Streak na branje: `last_activity_date` starejši od včeraj → `currentStreak = 0`; shranjena vrednost ostane (naslednji ogled problema jo začne znova pri 1, P2). Zapis streaka je bil narejen in testiran že v P2. Frontend brez sprememb. Test `backend/test/u2.test.js` (2 testa); U1 test nastavi `last_activity_date`.

**U3 · Dashboard** `M` · odvisno od: P1, F4 · ✅ 9. 10. 2026
- API: `GET /dashboard` → personaliziran feed (D19), aktivna tekmovanja (po T1), lastna statistika na kratko, nedokončani poskusi.
- Frontend: `/dashboard`. Oblika odgovora je `Dashboard` v `frontend/src/lib/types/dashboard.ts` (`contests`, `inProgress`, `feed`, `stats` z `level`/`nextLevel` iz `level_thresholds`, `activity` iz `user_daily_activity`, `recentWins`). Filtri feeda po D24: rešeni vedno skriti, stikalo "Hide solved" odstranjeno; kategorija/težavnost/razvrščanje (zdaj filtrira mock na odjemalcu).
- Kartica tekmovanja: težavnost = najvišja težavnost problemov tekmovanja, `participantCount` = število `contest_entries`.
- Kartica problema prikaže `time_limit_minutes` (dizajn ima razpon "25-40 min", ki ga shema nima).
- Končano, ko: feed ne vsebuje rešenih ali neobjavljenih problemov.
- **Stanje:** nov modul `backend/src/modules/dashboard/dashboard.routes.js` (`GET /dashboard`, `optionalAuth`). Ponovna uporaba: `listProblems(userId)` izvlečen iz `GET /problems` (feed = isti seznam brez rešenih, isti vrstni red "recommended"), `getStats` / `getActivity` / `getSolved` izvlečeni iz profila (`users.routes.js`), zato se dashboard in profil vedno ujemata. `inProgress` = zadnji poskus v teku objavljenega problema; "checks passed" = najnovejši rezultat vsakega preverjanja od začetka trenutnega poskusa (`check_results.executed_at >= started_at`); jezik iz `problem_codebase.language`. `recentWins` = zadnji 3 rešeni. Gost dobi samo feed (`stats: null`, `inProgress: null`, prazni seznami). **Odstopa od načrta (enostavneje):** filtri feeda (kategorija, težavnost, razvrščanje) ostanejo na odjemalcu kot na `/problems` (oznaka `ponytail:`); feed ima obliko `ProblemListItem` (tip `FeedProblem` odstranjen) in s tem `saved` - zaznamki na dashboardu so zdaj pravi (`PUT/DELETE /problems/:slug/bookmark`, ob napaki nazaj). D24: stikalo "Hide solved" in oznaka "Solved" odstranjena. Tekmovanja ostanejo mock do T1, vzorčna statistika pod zameglitvijo za goste ostane mock. Test `backend/test/u3.test.js` (4 testi).

### M5 - Tekmovanja

**T1 · Seznam tekmovanj** `S` · odvisno od: P1 · ✅ 9. 10. 2026
- Naredi: `contests`, `contest_problems`.
- API: `GET /contests` → dnevna/tedenska/mesečna, status izpeljan iz časa (`upcoming`/`active`/`ended`), nagrada; problemi samo za `active`/`ended`. Oblika odgovora je `ContestList` v `frontend/src/lib/types/contest.ts` (`live`/`upcoming`/`past`; težavnost = najvišja težavnost problemov, oznake in sličica iz problema).
- API: `GET /contests/:id` → `ContestDetail` (incident, ime repozitorija - D27, število preverjanj, nagrada); za `upcoming` `problem = null`. Shema dovoli več problemov (D33), stran pokaže prvega (D59).
- Seed: razvojna tekmovanja (aktivno, prihajajoče, končano; datumi relativni na čas seeda), ker jih admin (A6) še ne ustvarja.
- Frontend: `/contests`, `/contests/[id]`, del `/dashboard`.
- Končano, ko: problemi prihajajočega tekmovanja niso razkriti.
- **Stanje:** migracija 0011 (`contests` z NULL datumi za osnutek, `archived_at`, CHECK za datume; `contest_problems` z `UNIQUE (contest_id, problem_id)` in indeksom na `problem_id`), seed `0003_contests.sql` (5 tekmovanj s fiksnimi id-ji, datumi relativni na čas seeda; aktivno tedensko = `payment-retries-disappear`, edini izvedljiv problem). Nov modul `backend/src/modules/contests/contests.routes.js`: `GET /contests` (`optionalAuth` - zaradi značke v stranski vrstici tudi za goste; strani so še vedno za prijavo, D47) → `ContestList`, `history: []` do T2; `GET /contests/:id` (`requireAuth`) → `{ contest: ContestDetail }`, osnutek / neznan / neveljaven id → 404 `CONTEST_NOT_FOUND`. Težavnost = najtežji problem, oznake, sličica in problem strani iz prvega problema (D59); prihajajoče: brez težavnosti, oznak, sličice in problema. **D17:** `problems.routes.js` ima `LISTED` (problem tekmovanja, ki še ni končano, ni na `/problems` in v feedu) in `VISIBLE` (problem prihajajočega tekmovanja je 404 pri podrobnostih, startu, zaznamku, oceni in komentarjih); osnutki ne skrijejo ničesar. `GET /dashboard` vrne `contests` (aktivna, tudi gostom). `participantCount` = 0 in `participation: null` do T2. Frontend: `/contests`, `/contests/[id]` (`serverFetch`, 404 → `notFound()`), dashboard in značka "Contests" v stranski vrstici (`(app)/layout.tsx` prešteje aktivna tekmovanja, oznaka `ponytail:`) na API; tip `ActiveContest` odstranjen (dashboard uporablja `Contest`). **Odstopa od načrta:** javni seznam ne skrije arhiviranih (`archived_at` uporabi šele A6). Test `backend/test/t1.test.js` (4 testi).

**T2 · Udeležba in rezultati** `M` · odvisno od: T1, R4 · ✅ 9. 10. 2026
- Naredi: `contest_entries` (brez `attempt_id`, D18; brez `rank`, D61); vnos nastane ob prvem startu tekmovalnega problema med tekmovanjem (D60); rešitev tekmovalnega problema znotraj časa posodobi `problems_solved` + `total_score` (v transakciji R4). `contest_attempt_links` se ne naredi - točke problema so že v `user_problem_attempts`.
- API: `participation` v `GET /contests/:id` in `history` v `GET /contests` + profil (`ContestHistoryEntry`: rešeni + točke, D32) iz `contest_entries` prijavljenega uporabnika; `participantCount` = število vnosov. Brez lestvice (D61).
- Končano, ko: rešitev po `ends_at` ne šteje; en vnos na uporabnika na tekmovanje.
- **Stanje:** migracija 0012 (`contest_entries` z `NOT NULL` števci, `UNIQUE (contest_id, user_id)`, indeks na `user_id`; brez `attempt_id`, `rank`; `contest_attempt_links` ni narejena). `POST /problems/:slug/start` ustvari vnos za vsako aktivno tekmovanje problema (`ON CONFLICT DO NOTHING`, D60) - izven atomarnega zapisa poskusa, a idempotentno. Transakcija rešitve (R4) doda rešitev in točke vnosu, če je tekmovanje ob rešitvi aktivno (upsert: tudi poskus, začet pred tekmovanjem, šteje). `participantCount` = število vnosov; `GET /contests/:id` → `participation` `{ problemsSolved, problemCount, score }` ali `null`; `history` v `GET /contests` in `contests` v profilu = `getContestHistory` (samo končana tekmovanja, najnovejša prva, D32). Frontend: tip `ContestResult`, vrstica zgodovine "1/1 solved · 375 pts" (`resultText` v `ContestHistory.tsx`), "Your participation" in gumb (Enter / Resume / View problem, "Completed" = vsi problemi rešeni). Neuporabljen `mock/contests.ts` prilagojen novi obliki (da se prevede). Test `backend/test/t2.test.js` (2 testa, eden z Dockerjem). Opaženo, ni popravljeno: "1 engineers participating" (ednina manjka na `/contests` in `/contests/[id]`).

### M6 - Admin (`04_admin.md`)

**A1 · Admin prijava in ogrodje** `S` · odvisno od: F3 · ✅ 9. 10. 2026
- D48: `backend/.env` `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`; `npm run hash-password` (scrypt kot F2, vpraša za geslo, izpiše hash). API: `POST /admin/login`, `POST /admin/logout`, `GET /admin/me`. Ločen httpOnly piškotek admin seje (JWT z vlogo admin, 8 h).
- `requireAdmin` preveri admin piškotek (ne `users.is_admin`); vse `/api/v1/admin/*` za njim. Migracija odstrani `users.is_admin` (+ `isAdmin` iz `/me`).
- Frontend: nova stran `/admin/login`; admin strani se iz `(app)` preselijo v svojo postavitev (URL-ji ostanejo enaki) - stranska vrstica Overview / Problems / Contests / Users + "Log out". Proxy: `/admin/*` brez admin seje → `/admin/login?next=…`.
- Končano, ko: napačna e-pošta ali geslo → 401 z enakim sporočilom; uporabniški piškotek na `/admin/*` → 401; admin piškotek ne odpre uporabniških API-jev; brez `ADMIN_*` v `.env` je admin prijava izklopljena (503).
- Narejeno: modul `modules/admin/admin.routes.js` (nove admin rezine dodajo poti na ta router za `requireAdmin`); piškotek `bugdr_admin`, ključ JWT = `JWT_SECRET` + hash gesla (nov hash v `.env` odjavi vse admin seje); po 10 neuspelih prijavah v 15 min → 429 (en globalen števec - na IP pride z Z2); neveljaven `ADMIN_PASSWORD_HASH` ustavi zagon. Migracija 0013. Frontend: `app/admin/(panel)/` + `AdminShell` (admin del odstranjen iz `AppShell`), `app/admin/login`.

**A2 · Problemi: seznam in osnovni podatki** `M` · odvisno od: A1, P1 · ✅ 9. 10. 2026
- API: `GET /admin/problems?…` (tudi osnutki), `POST /admin/problems`, `PATCH /admin/problems/:id` (naslov, `codebase_context`, `incident_report`, težavnost, kategorija, tagi, časovna omejitev, vir).
- Telo shranjevanja z zaslona Create Problem je `AdminProblemDraft` (`frontend/src/lib/types/problem.ts`): `title`, `slug`, `shortDescription` (→ `summary`), `fullDescription` (→ ~~`description`~~ - po migraciji 0006 dve polji, D50), `difficulty`, `categorySlug`, `timeLimitMinutes`, `tags`, `checks`, `hiddenFiles`, `bugSummary`, `isPublished`. Po D22 postane `PATCH` osnutka, ki ga je ustvarila A10.
- Frontend: `mockSaveProblem` v `src/lib/mock/adminProblems.ts` → API.
- Končano, ko: slug unikaten (409); `base_points` sledi težavnosti.
- **Narejeno (uporabnik 9. 10. 2026: koda pride šele z A10; Publish onemogočen do A5; preprosta stran `/admin/problems`):** `GET /admin/problems` (vsi, tudi osnutki; rešitve štete iz `user_problem_attempts`, ker `problems.solve_count` nihče ne posodablja), `GET /admin/problems/:id`, `POST /admin/problems`, `PUT /admin/problems/:id` (namesto `PATCH`: obrazec vedno pošlje vsa polja). Slug iz naslova na strežniku; vedno `is_published = FALSE`; objavljen problem → 409 `PROBLEM_PUBLISHED`; tagi, preverjanja (vrstni red = položaj) in skrite datoteke se zamenjajo v isti transakciji; osnutek dobi `problem_codebase` s praznimi `files` in `language = 'typescript'` (A10 ga napolni). Migracija 0014 `problems.bug_summary`. `AdminProblemDraft` = `title`, `shortDescription`, `codebaseContext`, `incidentReport`, `difficulty`, `categorySlug`, `timeLimitMinutes` (D45: spodnja meja za težavnost), `tags`, `checks`, `hiddenFiles`, `bugSummary`.
- Frontend: Review ima Title (D45) ter Codebase context + Incident report (D50); "Save as Draft" → API, "Publish Problem" onemogočen z opombo; nova stran `/admin/problems` (iskanje, zavihki All / Published / Drafts, tabela) in `/admin/problems/[id]/edit` (isti obrazec Review, samo osnutki). Stranska vrstica: Problems namesto Add problem.

**A10 · Nalaganje ZIP + AI analiza** `M` · odvisno od: A2, D20-D22 · ✅ 9. 10. 2026
- API: `POST /admin/problems/analyze` (ZIP, `requireAdmin`) → razpakira na strežniku (brez poti izven korena, omejitve iz D21), prebere kodne datoteke, pošlje jih Claude API s sistemskim pozivom iz uporabnikove specifikacije zaslona (spodaj), preveri JSON in vrne `ProblemAnalysis` (camelCase; Claude vrača snake_case - preslikava na API meji).
- Sistemski poziv (dobesedno iz specifikacije, 6. 10. 2026): vrne `bug_summary`, `short_description`, `full_description` (D50 rešena: poziv vrne `codebase_context` + `incident_report`, spremenim ga jaz), `suggested_difficulty`, `difficulty_reasoning`, `checks[]` (`check_order`, `description`, `check_type`, `check_command`, `must_pass`), `hidden_files`, `tags`; pravila: 3-5 preverjanj, preverjanja morajo pasti na pokvarjeni kodi, skrite datoteke = testi, opis ne sme namigovati na napako, samo JSON.
- Naslov AI predlaga, admin ga uredi na Review (D45); časovna omejitev = spodnja meja `TIME_LIMIT_RANGE` za težavnost. Analiza takoj ustvari osnutek (D22), preverjanje dvojnikov (SHA-256 razpakiranih datotek → 409) in produkcijski test (zagon v Dockerju) tečeta pred analizo.
- Frontend: `mockAnalyzeProblem` → API.
- Končano, ko: ne-ZIP / prevelik ZIP → 400; ZIP s potjo `../` zavrnjen; neveljaven JSON od Claude → 502 `ANALYSIS_INVALID`; ne-admin → 403; ključ API ni nikoli v odgovoru ali frontendu.
- **Narejeno (uporabnik 9. 10. 2026: produkcijski test = koda se naloži brez npm paketov; model Claude Sonnet 5.5):** `POST /admin/problems/analyze?name=<ime.zip>` s surovim ZIP-om (`application/zip`, do 10 MB; večji → 413, ne-ZIP / nevarna pot → 400 `INVALID_ZIP` pred začetkom toka). Lasten bralnik ZIP (`modules/admin/zip.js`, `node:zlib`, brez odvisnosti; brez ZIP64 in šifriranja): izpusti `node_modules`, `.git`, `__MACOSX`, lock datoteke in binarne datoteke, odstrani eno skupno korensko mapo, meje runnerja (`validateFiles`). Odgovor je NDJSON tok po stopnjah `duplicate` → `production` → `analysis` (`running`/`passed`/`failed` + sporočilo), nato `{ type: "done", problemId, analysis }`. Dvojnik = SHA-256 poti + vsebine (`problem_codebase.content_hash UNIQUE`, migracija 0015). Produkcijski test: `package.json` brez `dependencies`/`devDependencies` (D53) + vsaka .js/.ts datoteka se razčleni z `module.stripTypeScriptTypes` v Docker kontejnerju (`checkCodeLoads` v runnerju; nič se ne izvede). Analiza: `@anthropic-ai/sdk` (nova odvisnost), `claude-sonnet-5-5` (`ANTHROPIC_MODEL`), effort high, structured outputs (JSON shema; `hidden_files` kot seznam `{path, content}`), `fallbacks: "default"`; odgovor gre skozi isto preverjanje kot `PUT` (`parseDraft`) - neuporaben → stopnja `analysis` pade, osnutek se ne ustvari. Osnutek (D22): brez vloge, `time_limit` po D45, koda + skrite datoteke + preverjanja; zaseden slug dobi naključno pripono. Sistemski poziv napisan po pravilih iz `02` (izvirnik "dobesedno iz specifikacije" ni shranjen nikjer).
- Frontend: `UploadStep` bere tok (`apiStream`), Review shrani s `PUT /admin/problems/:id` v osnutek iz analize. `POST /admin/problems` (A2) nima več klicatelja v UI.

**A3 · Zamenjava kode problema** `S` · odvisno od: A2, A10 · ✅ 9. 10. 2026
- ~~Urejevalnik kode (drevo datotek, Monaco, dodajanje/brisanje, jezik, ogrodje, ukazi, rešitev)~~ → **uporabnik 9. 10. 2026: kode se ne ureja, samo cel ZIP se naloži znova.** Zamenja samo kodo; naslov, opisi, preverjanja in skrite datoteke ostanejo (brez ponovne AI analize). Dvojnik se primerja z originalnim ZIP-om (hash zadnjega nalaganja).
- API: `PUT /admin/problems/:id/codebase?name=<ime.zip>` (surov ZIP, samo osnutki: objavljen → 409) - isti NDJSON tok kot A10, stopnji Duplicate Check (brez lastnega problema) → Production Test, nato zamenjava `files`, `repository_structure`, `language`, `repository_name`, `content_hash`; konec `{ type: "done", paths, repositoryName }`. Skupni pomočniki z A10 (`uploadedZip`, `stageStream`, `checkDuplicate`, `checkProduction`). `GET /admin/problems/:id` vrne še `repositoryName` in `paths`.
- Frontend: `UploadStep` je splošen (url, metoda, stopnje, napis gumba); `/admin/problems/[id]/edit` ima razdelek Code (ime repozitorija, število in seznam datotek, "Replace code").

**A4 · Preverjanja + poskusni zagon** `M` · odvisno od: A3, R3 · ✅ 9. 10. 2026
- ~~`PUT /admin/problems/:id/checks`~~ - preverjanja se shranijo s `PUT /admin/problems/:id` (A2, cel seznam, vrstni red = položaj).
- API: `POST /admin/problems/:id/dry-run` → preverjanja v Dockerju na izvirni kodi (datoteke + skrite datoteke, brez uporabnikovih) z `runChecks` (R3); **vsa morajo pasti** (D20). NDJSON: `{ type: "checks", checks: [{ id, description }] }`, nato `running` / `result` (izhod samo pri padlem, R3) za vsako, `{ type: "done", ok }`; brez kode / brez preverjanj → 409. Uspešen zagon se zapiše kot `problems.dry_run_passed_for = updated_at` (migracija 0016) - velja samo, dokler se različica ne spremeni: vsak `PUT` osnutka in zamenjava kode (A3) premakneta `updated_at`, sprememba med zagonom se ne zapiše. `GET /admin/problems/:id` vrne `checksVerified`.
- Frontend (uporabnik 9. 10. 2026: gumb + samodejno ob Publish v A5): `DryRunPanel` na koraku Publish in na strani urejanja - pred zagonom shrani obrazec (strežnik zažene shranjeno), rezultat po preverjanju ("Fails · catches the bug" / "Passes · misses the bug", izhod v `<details>`). Nespremenjen obrazec se ne shrani znova, zato uspešen zagon po "Save as Draft" ostane veljaven.
- Znana omejitev D20: preverjanje, ki pade zaradi napake v testu (npr. manjkajoča skrita datoteka), šteje kot "catches the bug" - izhod je viden, presodi admin.

**A5 · Objava** `S` · odvisno od: A4 · ✅ 9. 10. 2026
- API: `POST /admin/problems/:id/publish` / `unpublish`. Objava zavrnjena brez ≥ 3 preverjanj in uspešnega dry-runa (vsa padejo na izvirni kodi, D20) (`04` "Quality Guidelines"). Brisanje rešenega problema ni mogoče - samo unpublish (`04` "Admin Rules").
- Narejeno: `POST /admin/problems/:id/publish` **vedno znova zažene preverjanja** (uporabnik, A4) - isti NDJSON tok kot dry-run, objavi samo, če vsa padejo in se osnutek med zagonom ni spremenil; konec `{ type: "done", ok, published, slug? }`. Pred tokom 409: že objavljen, brez vloge (`NO_ROLE`), < 3 preverjanja (`TOO_FEW_CHECKS`), brez kode, brez skritih testnih datotek (`NO_HIDDEN_FILES`, D53). `POST /admin/problems/:id/unpublish` → spet osnutek (urejljiv, nova objava = nov zagon); 409, če je problem v tekmovanju, ki še ni končano (`IN_CONTEST`). Brisanja ni. Urejanje preverjanj prej objavljenega problema izbriše shranjene `check_results` uporabnikov za ta preverjanja (`ON DELETE CASCADE`).
- Frontend: gumb "Publish Problem" je v kartici Check run (korak Publish in urejanje), uspeh → "Problem published" + "View problem"; objavljen problem na strani urejanja: zaklenjen, "View problem" + "Unpublish" (`ConfirmDialog`). Seznam: "Manage" za objavljene.

**A6 · Tekmovanja** `M` · odvisno od: A1, T1 · ✅ 9. 10. 2026
- API: `GET /admin/contests`, `GET /admin/contests/:id`, `POST /admin/contests`, `PATCH /admin/contests/:id`, `DELETE /admin/contests/:id` (samo osnutki), arhiviranje (samo končana).
- Odgovor je `AdminContest` (`frontend/src/lib/types/contest.ts`): `type`, `title`, `description`, `startsAt`/`endsAt` (NULL = osnutek), `problems[]` (`ContestProblemOption`: slug, naslov, težavnost, kategorija), `rewardType`, `rewardDescription`. **Brez polja stanja** - odjemalec in strežnik ga izpeljeta z `getContestStatus` (D43).
- Telo shranjevanja je `AdminContestDraft`: kot zgoraj + `problemSlugs[]` (≥ 1, D33). "Save as Draft" pošlje `startsAt: null`; "Schedule Contest" samodejne (`getContestDates`) ali ročne datume. Strežnik preveri pravila iz D44.
- Načrtovanje osnutka s seznama = `PATCH` z datumi iz `getContestDates(type)`; preklic = `PATCH` z `startsAt`/`endsAt` = NULL. Urejanje samo za osnutke in načrtovana tekmovanja.
- Frontend: `mockGetAdminContests`, `mockGetAdminContest`, `mockSaveContest`, `mockSetContestDates`, `mockRemoveContest`, `mockGetContestProblemOptions` v `src/lib/mock/adminContests.ts` → API.
- Narejeno (`modules/admin/contests.routes.js`): `GET /admin/contests` (brez arhiviranih), `GET /admin/contests/problem-options` (objavljeni problemi), `GET /admin/contests/:id`, `POST /admin/contests`, `PUT /admin/contests/:id` (cel osnutek namesto `PATCH`; samo osnutki in načrtovana, sicer 409 `CONTEST_STARTED`), `PUT /admin/contests/:id/dates` (načrtuj osnutek / prekliči načrtovano), `DELETE /admin/contests/:id` (samo osnutki), `POST /admin/contests/:id/archive` (samo končana). Osnutek zahteva samo naslov in vrsto; načrtovanje D44 (opis, ≥ 1 objavljen problem, oba datuma, konec po začetku, začetek v prihodnosti; nagrada z opisom). Datumi v UTC (`::timestamptz AT TIME ZONE 'UTC'`), vrstni red problemov = vrstni red izbire (javna stran pokaže prvega, D59).
- Frontend: seznam, urejanje in čarovnik na API; napake strežnika se pokažejo nad seznamom / v čarovniku. "View results" odstranjen iz menija (javna stran tekmovanja zahteva uporabniški račun, D48; rezultati pridejo z A7), aktivna tekmovanja nimajo menija. `src/lib/mock/adminContests.ts` ni več v uporabi.

**A7 · Rezultati tekmovanj + CSV** `S` · odvisno od: A6, T2 · ⬜
- API: `GET /admin/contests/:id/results` (+ `?format=csv`), oznaka "nagrada poslana" (stolpec ni v shemi - dodaj ob rezini).

**A8 · Uporabniki** `S` · odvisno od: A1 · ⬜
- API: `GET /admin/users?q=`, `GET /admin/users/:id` (profil, statistika, poskusi), `POST /admin/users/:id/ban` / `unban`. Admin se ne more banati sam.

**A9 · Statistika platforme** `S` · odvisno od: A1, R4 · ⬜
- API: `GET /admin/stats?range=today|7d|30d|all` (`04` §4) → `AdminOverview` (`frontend/src/lib/types/adminStats.ts`): skupni uporabniki, aktivni uporabniki + trend, objavljeni problemi, rešitve + trend, aktivna tekmovanja, rast uporabnikov (30 dni, prijave in DAU), rešitve na dan (14 dni), rešitve po težavnosti in vlogi, porazdelitev trenutnih nizov, top 8 problemov, 8 problemov z največjim osipom (začeti / rešeni). Okna po D46.
- Frontend: `mockGetAdminOverview` v `src/lib/mock/adminStats.ts` → API.

**A9.1 · AI analiza z OpenAI ključem** `S` · odvisno od: A10 · ⬜ (dodano 9. 10. 2026, uporabnik: "we'll be making this work with openai api key")
- Analiza ob nalaganju (A10, `modules/admin/analysis.service.js`) naj deluje tudi z `OPENAI_API_KEY`. Zdaj je vezana na Anthropic SDK (`@anthropic-ai/sdk`, model `claude-sonnet-5-5`, `output_config` JSON shema, effort, `fallbacks`).
- Ostane enako: cevovod (Duplicate Check → Production Test → AI Analysis), preverjanje odgovora (`parseDraft`), ustvarjanje osnutka, sistemski poziv in JSON shema (`hidden_files` kot seznam).
- Odpre se ob rezini (vprašaj uporabnika): (a) OpenAI **namesto** Claude ali **izbira** po ključu / `AI_PROVIDER`; (b) model in cena; (c) odvisnost `openai` + njegov način vsiljene JSON oblike; (d) ali to velja tudi za AI klepet na zaslonu reševanja (M8, stack v CLAUDE.md zdaj pravi "Claude API").

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

**Z1 · Seed v produkciji** `S` · odvisno od: F2 · ⬜
- ~~`npm run create-admin`~~ → admin je v `.env` (D48, A1). Ostane: `npm run seed` se v produkciji zavrne.

**Z2 · Varnost namestitve** `S` · odvisno od: vse · ⬜
- Omejitev poskusov prijave, varnostne glave, `Secure` piškotek, omejitev hkratnih Docker kontejnerjev na uporabnika in globalno.

---

## Register mockov (frontend → rezina)

Vsak zgrajen zaslon doda vrstico. Ko rezina zamenja mock, se vrstica označi ✅.

| Zaslon | Mock (datoteka / konstanta) | Zamenja rezina | Stanje |
| --- | --- | --- | --- |
| `/dashboard` + stranska vrstica (`(app)/layout.tsx`) | U3 ✅ + T1 ✅ 9. 10. 2026: feed, statistika, aktivnost, nedokončan poskus, zadnje zmage in aktivna tekmovanja iz `GET /dashboard`; uporabnik iz `useMe()` (U1); značka "Contests" = število aktivnih iz `GET /contests`. Ostane `src/lib/mock/dashboard.ts`: `mockGetDashboard` = samo vzorčna statistika za goste (zameglitev); `MOCK_ACTIVE_CONTEST_COUNT` samo še za admin pregled (A9) | - | ✅ 9. 10. 2026 |
| `/problems` | ~~`mockGetProblems`~~ → `GET /problems` (P1), zaznamki → `PUT/DELETE /problems/:slug/bookmark` (D23); filtri/razvrščanje/drsenje ostanejo na odjemalcu. `mockGetProblems` še uporabljata mocka `profile.ts` in `adminContests.ts` | P1 | ✅ 8. 10. 2026 |
| `/problems/[slug]` | ~~`mockGetProblem`~~ → `GET /problems/:slug` (P2, `serverFetch`); besedilo = `codebaseContext` + `incidentReport` (migracija 0006, seed iz `mock/problemBriefs.ts`). Ocena → `PUT /problems/:slug/rating` (O1), razprava → `GET/POST /problems/:slug/comments`, `DELETE /comments/:id`, `PUT/DELETE /comments/:id/helpful` (O2). `mockGetComments` ni več v uporabi | P2 ✅, O1 ✅, O2 ✅ | ✅ 8. 10. 2026 |
| `/problems/[slug]/solve` | ~~`mockStartAttempt`, `CodeEditorMock`~~ → `POST /problems/:slug/start` + Monaco (R1 ✅); ~~`mockRunTests`~~ → `POST /attempts/:id/test` (R4 ✅); split pane: opis (`ProblemOverview`) levo, urejevalnik desno, spodaj Terminal + Test Results; vsaka datoteka je zavihek, izbirnik jezika je samo prikaz; "Submit" = zagon preverjanj. Desno AI klepet (`AiChatPanel`): `src/lib/mock/aiChat.ts` - `mockAskAi` (1,5 s, 4 vnaprej napisani odgovori za payment-retries, ciklično za vse probleme), `AI_TOOLS`, `BENCHMARKS` (povprečje pozivov/žetonov po težavnosti); seja v `src/hooks/useSessionTracker.ts` (samo React stanje: pozivi, žetoni ≈ znaki/4, zagoni testov, dogodki); ocena učinkovitosti je groba primerjava z benchmarkom | R1 ✅, R2 ✅ (Give up), R4 ✅, R5 ✅ (terminal), R6 ✅, S1, S2, S3 (AI seja) | 🟨 |
| `/contests` | ~~`mockGetContests`~~ → `GET /contests` (T1 ✅, T2 ✅ 9. 10. 2026: udeleženci in zgodovina). `src/lib/mock/contests.ts` ni več v uporabi na zaslonih (uvaža ga samo neuporabljen `mock/profile.ts`; ni izbrisan) | T1, T2 | ✅ 9. 10. 2026 |
| `/contests/[id]` | ~~`mockGetContest`~~ → `GET /contests/:id` (T1 ✅, T2 ✅ 9. 10. 2026); incident = `incident_report` prvega problema; udeležba in udeleženci iz `contest_entries` | T1, T2 | ✅ 9. 10. 2026 |
| `/profile/[username]` | ~~`mockGetProfile`~~ → U1 ✅ + U2 ✅ + T2 ✅ 9. 10. 2026 (API, aktivnost, streak, zgodovina tekmovanj). `src/lib/mock/profile.ts` ni več v uporabi (ni izbrisan) | - | ✅ 9. 10. 2026 |
| `/settings` | ~~`MOCK_SETTINGS`, `mockSaveSettings`~~ → U1 ✅ 9. 10. 2026 (`GET`/`PUT /me/profile`). Zavihka Practice preferences in Account ostaneta "coming soon" (D35) | D35 | 🟨 |
| `/login` | ~~`mockLogin`, `mockLogout`~~ → `POST /auth/login`, `POST /auth/logout` (F2). Ostane mock: "Continue with GitHub" pokaže napako (D37) | F2 | ✅ 7. 10. 2026 |
| `/signup` | ~~`mockSignup`~~ → `POST /auth/signup` (F2): Username (D38), geslo ≥ 8 (D39) | F2 | ✅ 7. 10. 2026 |
| `/forgot-password` | `src/lib/mock/auth.ts`: `mockRequestPasswordReset` (uspe za vsak e-mail - stran ne razkrije, ali račun obstaja); pošiljanje pošte je odloženo (X5) | X5 (rezina še ne obstaja) | ⏸ |
| `/onboarding` | ~~`mockSaveOnboarding`~~ → `PUT /me/onboarding` (F4); "exploring" → `null` (D41), jeziki se shranijo (D42); "Sign out" → `POST /auth/logout` (F2) | F4 | ✅ 7. 10. 2026 |
| `/admin` (Overview) | `src/lib/mock/adminStats.ts`: `mockGetAdminOverview(range)` (realne številke, rast deterministična, datumi relativni na danes; aktivna tekmovanja = `MOCK_ACTIVE_CONTEST_COUNT`) | A9 | ⬜ |
| `/admin/problems/new` (Add Problem) | vse na API (A2, A10, A4, A5 ✅); ostane samo neuporabljen `mockRunCheck` v `src/lib/mock/adminProblems.ts` (za neuporabljen `ValidateStep`) | - | ✅ |
| `/admin/problems`, `/admin/problems/[id]/edit` | na API od začetka (A2) | A2 | ✅ |
| `/admin/contests` | na API (A6): seznam, Schedule / Cancel / Delete / Archive; zavihki in iskanje na odjemalcu; rezultati končanih pridejo z A7 | A6 ✅, A7 | 🟨 |
| `/admin/contests/new`, `/admin/contests/[id]/edit` | na API (A6): čarovnik `ContestWizard`, izbira objavljenih problemov, datumi iz `src/lib/getContestDates.ts`; `src/lib/mock/adminContests.ts` ni več v uporabi | A6 | ✅ |

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
| `/problems/[slug]` | P2, R4 (rezultat + poskusi), O1, O2 |
| `/problems/[slug]/solve` | R1-R6 + R2b ✅, S1-S3 |
| `/leaderboard` (ni zgrajen) | S4 |
| `/profile/[username]` | U1, U2, T2 |
| `/settings` | U1 (D34-D36) |
| `/contests`, `/contests/[id]` | T1, T2 |
| `/admin` | A9 |
| `/admin/problems/new` | A10, A2, A4, A5 |
| `/admin/problems`, `/admin/problems/[id]/edit` | A2, A3 (A5 za objavo / umik) |
| `/admin/contests`, `/admin/contests/new`, `/admin/contests/[id]/edit` | A6 (A7 za rezultate) |
| `/admin/analytics` (ni zgrajen) | S5 |
| `/admin/*` | A1-A9 |
