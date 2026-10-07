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
Zadnja posodobitev: 7. 10. 2026
Backend: ni začet (nobena rezina ni narejena)
Frontend: 15 zaslonov na mocku - /login, /signup, /forgot-password, /onboarding, /dashboard,
          /problems, /problems/[slug] (+ rešen problem + razprava), /problems/[slug]/solve,
          /profile/[username], /settings, /contests, /contests/[id], /admin/problems/new,
          /admin/contests, /admin/contests/new
Naslednja rezina: F0 (ko se začne backend - Faza 2/3 iz 00_bugdr_razvoj.md)
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
| D16 | Kartica problema | Nova stolpca `problems.thumbnail_url VARCHAR(500)` in `problems.summary VARCHAR(200)` | P1, A2 |
| D17 | Tekmovalni problemi na `/problems` | **Skriti, dokler tekmovanje ne konča**, nato javni. `problems.is_contest_problem` se ne uporablja - izpelje se iz `contest_problems` | P1, T1 |
| D18 | Rezultat tekmovanja | `contest_entries.score` = vsota točk rešenih tekmovalnih problemov **znotraj časa tekmovanja**; vez = krajši skupni čas. `contest_entries.attempt_id` se ne uporablja | T2 |
| D19 | Personaliziran feed | Nerešeni objavljeni problemi kategorije iz `goal_role`, težavnost glede na `experience_level`, nato najbolje ocenjeni | U3 |
| D20 | **ODPRTO** - pravilo validacije ob objavi | Zaslon Create Problem (po navodilu uporabnika) zahteva, da **vsa** preverjanja padejo na pokvarjeni kodi, sicer objava ni mogoča. To je v napetosti z D11 (preverjanja morajo tudi **uspeti** na rešitvi, ki je wizard ne zbira) in izloči legitimna negativna preverjanja (npr. "potekel žeton → 401" uspe že na pokvarjeni kodi). Predlog: objava = vsaj eno preverjanje pade na pokvarjeni kodi + vsa uspejo na rešitvi; preverjanje, ki uspe na pokvarjeni kodi, je opozorilo, ne blokada. Zahteva korak za nalaganje rešitve (drugi ZIP) | A10, A4, A5 |
| D21 | **ODPRTO** - Claude analiza | Klic samo v backendu (ključ `ANTHROPIC_API_KEY` nikoli v frontendu), model iz konfiguracije, omejitev velikosti ZIP-a in števila/velikosti datotek, izpusti `node_modules`, `.git`, binarne datoteke; strogo preverjanje JSON odgovora (oblika `ProblemAnalysis`), ob neveljavnem odgovoru 502 `ANALYSIS_INVALID` | A10 |
| D22 | **ODPRTO** - kje živi razpakiran ZIP med analizo in shranjevanjem | Predlog: analiza takoj ustvari osnutek problema (`is_published = false`) in shrani datoteke v `problem_codebase`; odgovor vrne `problemId`, "Save as Draft"/"Publish" sta nato `PATCH` istega osnutka. Brez začasnih map na disku | A10, A2 |
| D23 | **ODPRTO** - zaznamki (bookmark) na kartici problema | Dizajn dashboarda in `/problems` (gumb "Saved problems") ima ikono zaznamka, shema nima tabele. Predlog: `problem_bookmarks (user_id, problem_id, created_at, PK(user_id, problem_id))` + `PUT/DELETE /problems/:slug/bookmark`. Do odločitve je zaznamek samo stanje v brskalniku | U3, P1 |
| D24 | **ODPRTO** - feed na dashboardu: filtri in rešeni problemi | Dizajn ima filtre (kategorija, težavnost, "Hide solved", razvrščanje). D19 pravi, da feed ne vsebuje rešenih. Predlog: `GET /dashboard/feed?category=&difficulty=&hideSolved=&sort=`, privzeto po D19 (`hideSolved=true`); ko je "Hide solved" izklopljen, so rešeni problemi v feedu z oznako `solved` | U3 |
| D25 | **ODPRTO** - ikona obvestil v zgornji vrstici | Dizajn ima zvonec, shema in dokumenti nimajo obvestil. Predlog: v v1 ikona brez funkcije ali skrita; obvestila kasneje kot svoja rezina | - |
| D26 | **ODPRTO** - opisi preverjanj na strani podrobnosti | Dizajn `/problems/[slug]` ima "Acceptance checks" (opisi) in "N checks total", P2 pravi "brez preverjanj". Predlog: `GET /problems/:slug` vrne `checks: string[]` = samo `problem_checks.description` po `check_order` (nikoli `check_command`/`expected_output`) | P2 |
| D27 | **ODPRTO** - ime repozitorija in sklad na strani podrobnosti | Dizajn kaže "northstar / checkout-worker" in "TypeScript · Node 20 · Redis", shema nima imena. Predlog: `problem_codebase.repository_name VARCHAR(100)`, sklad = `language` + `framework` + tagi; zavihek Repository pokaže poti iz `repository_structure` (brez vsebine) | P2, A2 |
| D28 | **ODPRTO** - "Give up" na zaslonu reševanja | `02` zahteva gumb Give up, dizajn ga nima. Zdaj: besedilni gumb "Give up" v zgornji vrstici (tudi na telefonu) s potrditvijo → R2 | R2 |
| D29 | ~~Iskanje in razširitve v levi vrstici zaslona reševanja~~ → **rešeno 7. 10. 2026**: prenova zaslona reševanja (split pane) odstrani levo vrstico in drevo datotek; datoteke so zavihki nad urejevalnikom | R1 |
| D30 | **ODPRTO** - "helpful" in odgovori na komentarje | Dizajn razprave ima "N helpful", "Reply" in razvrščanje "Most helpful"; `problem_comments` nima ničesar od tega. Predlog: `problem_comments.parent_id UUID NULL REFERENCES problem_comments(id)` (odgovori samo ena raven), tabela `comment_helpful (comment_id, user_id, created_at, PK(comment_id, user_id))` + `problem_comments.helpful_count` (posodobljen v isti transakciji), `PUT/DELETE /comments/:id/helpful`, lastnega komentarja ni mogoče označiti, `GET /problems/:slug/comments?sort=helpful\|newest` | O2 |
| D31 | ~~Stran posameznega tekmovanja~~ → **rešeno 6. 10. 2026**: uporabnik je dal dizajn, pot `/contests/[id]` (id, ker `contests` nima sluga). En incident na tekmovanje kot v dizajnu, čeprav shema dovoli več problemov (`contest_problems`) | T1, T2 |
| D33 | **ODPRTO** - en ali več problemov na tekmovanje | Dizajn `/contests/[id]` kaže en incident ("The incident", "Enter contest" → reševanje), `contest_problems` dovoli več. Zdaj tip `ContestDetail.problem` = en problem. Predlog: v1 en problem na tekmovanje (omejitev v A-rezini) | T1, A7 |
| D34 | **ODPRTO** - polja profila iz `/settings` | Dizajn ima prikazno ime, naslov profila (headline), GitHub uporabniško ime, jezike in stikalo "Public profile"; shema nima nobenega (`users` ima samo `username`). Predlog: `user_profiles` + `display_name VARCHAR(50)`, `headline VARCHAR(80)`, `github_username VARCHAR(39)`, `languages TEXT[]`, `is_public BOOLEAN DEFAULT TRUE`; API `PUT /me/profile`. Zdaj fiksen seznam jezikov (`LANGUAGES`) | U1 |
| D35 | **ODPRTO** - zavihka "Practice preferences" in "Account" na `/settings` | Dizajn ju ima, vsebine ne. Zdaj prazno stanje "coming soon". Predlog: Account = e-pošta, sprememba gesla, odjava; Practice preferences = `platform_goal` (F4) | U1, F2 |
| D36 | **ODPRTO** - "Starting difficulty" na `/settings` | Dizajn ima polje Starting difficulty, shema hrani `experience_level`, iz katerega D19 izpelje začetno težavnost. Zdaj polje "Production experience" (isto kot v stranski vrstici) z opombo, da določa začetno težavnost | U1, U3 |
| D32 | **ODPRTO** - "N/M checks passed" v zgodovini tekmovanj | Dizajn kaže preverjanja, `contest_entries` ima `problems_solved` in `total_score`. Zdaj mock vrne `checksPassed`/`checksTotal` (vsota čez probleme tekmovanja), "Completed" = vsa preverjanja uspešna. Predlog: prikaži `problems_solved` / število problemov in točke | T2 |
| D37 | **ODPRTO** - "Continue with GitHub" na `/login` in `/signup` | Dizajn ima prijavo z GitHubom, stack ima samo JWT z geslom (F2). Zdaj gumb pokaže "not available yet". Predlog: v v1 skrit; OAuth kasneje kot svoja rezina (`users.github_id`) | F2 |
| D38 | **ODPRTO** - "Full name" namesto `username` na `/signup` | Dizajn ima polno ime, F2 zahteva `username` (gre v `/profile/[username]`), shema nima imena (prim. D34 `display_name`). Predlog: dodati polje Username ali ga izpeljati iz imena/e-pošte in dovoliti spremembo v nastavitvah | F2, U1 |
| D39 | **ODPRTO** - minimalna dolžina gesla | Dizajn: "At least 12 characters", F2: ≥ 8. Zdaj obrazec zahteva 12. Predlog: 12 tudi v F2 | F2 |
| D40 | **ODPRTO** - "Remember me" na `/login` | Dokumenti ne določajo trajanja seje. Predlog: brez kljukice piškotek seje, s kljukico JWT za 30 dni | F2 |
| D41 | **ODPRTO** - "Exploring my path" na onboardingu | Dizajn ima 6. vlogo, `goal_role` dovoli samo 5 kategorij. Zdaj mock pošlje `"exploring"`. Predlog: `goal_role = NULL` = raziskujem; D19 feed brez filtra kategorije | F4, U3 |
| D43 | **ODPRTO** - osnutki tekmovanj | Dizajn `/admin/contests` ima stanje "Draft" in gumb "Save draft", `contests` nima stolpca za objavo, `starts_at`/`ends_at` sta `NOT NULL`. Zdaj mock: osnutek = `isPublished: false`, lahko brez problema in datumov; "Scheduled"/"Live"/"Ended" izpeljano iz datumov. Predlog: `contests.is_published BOOLEAN NOT NULL DEFAULT FALSE`, `starts_at`/`ends_at` NULL dovoljen samo za osnutek (`CHECK (is_published = FALSE OR (starts_at IS NOT NULL AND ends_at IS NOT NULL))`); javni `GET /contests` vrne samo objavljena | A6, T1 |
| D44 | **ODPRTO** - pravila ob objavi tekmovanja | "Publishing checklist" na `/admin/contests/new`: naslov, problem, težavnost Hard/Get a job (`04` to samo priporoča), ≥ 3 preverjanja problema, začetek v prihodnosti in konec po začetku, opis. Zdaj "Schedule" zahteva vse. Odprto: ali je težavnost blokada ali opozorilo; ali se tekmovanja iste vrste smejo prekrivati; `reward_type` (`04`) ni v dizajnu - zdaj samo `reward_description` | A6 |
| D42 | **ODPRTO** - jeziki na onboardingu (korak 4) | Dizajn sprašuje po jezikih, F4 in shema jih nimata (prim. D34 `languages TEXT[]`). Zdaj mock pošlje `languages`; povzetek "Your starting path" vzame prvi izbrani jezik. Predlog: `user_profiles.languages` iz D34, F4 sprejme `languages` | F4, U1 |

### Spremembe sheme glede na `01_database.md`

Posledica odločitev - narejene v migraciji rezine, ki tabelo ustvari:

| Tabela | Sprememba | Odločitev | Rezina |
| --- | --- | --- | --- |
| `problems` | + `thumbnail_url VARCHAR(500)`, + `summary VARCHAR(200)` | D16 | P1 |
| `problems` | − `is_contest_problem` (izpeljano iz `contest_problems`) | D17 | P1 |
| `problem_codebase` | + `hidden_files JSONB NOT NULL DEFAULT '{}'` | D10 | R1 |
| `problem_codebase` | + `solution_files JSONB` | D11 | R1 |
| `contest_entries` | − `attempt_id` | D18 | T2 |
| `contests` / `contest_entries` | + oznaka "nagrada poslana" (`04`) - točna oblika ob rezini | - | A7 |
| `problem_comments` | + `parent_id`, + `helpful_count`; nova tabela `comment_helpful` (predlog, čaka odločitev) | D30 | O2 |
| `problems` | + `bug_summary TEXT` (interna opomba AI analize, samo admin, nikoli k uporabniku) - zahteva zaslona Create Problem | - | A2 |
| `contests` | + `is_published BOOLEAN NOT NULL DEFAULT FALSE`, `starts_at`/`ends_at` NULL za osnutke (predlog, čaka odločitev) | D43 | A6 |
| `user_profiles` | + `display_name VARCHAR(50)`, `headline VARCHAR(80)`, `github_username VARCHAR(39)`, `languages TEXT[]`, `is_public BOOLEAN DEFAULT TRUE` (predlog, čaka odločitev) | D34 | U1 |

`01_database.md` se ob tem **ne spreminja samodejno** - posodobi se le, če
uporabnik to zahteva. Do takrat velja: `01` + ta tabela.

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
| M7 Produkcija | Z1 → Z2 | Prvi admin, varna namestitev |

M3-M6 so med seboj neodvisni (razen naštetih odvisnosti). Admin za probleme
(A2-A5) je praktično potreben pred resničnimi problemi - do takrat se problemi
polnijo s seed skripto.

---

## Rezine

### M0 - Zagon

**F0 · Ogrodje** `S` · odvisno od: - · ⬜
- Naredi: `backend/` (Express 5 - async napake brez ovojev), konfiguracija iz env (`.env.example` brez skrivnosti), `pg` pool, migracijski runner (D2), enoten format napak, `node:test` zagon, `docker-compose.yml` s PostgreSQL 17 (lokalno).
- Skripte: `npm run dev`, `npm test`, `npm run migrate`, `npm run seed` (kot v `00` "Local Setup").
- API: `GET /api/v1/health` (preveri bazo).
- Frontend: Next `rewrites` `/api/*` → backend (D3), tanek `src/lib/api.ts` (`fetch` s `credentials`).
- Končano, ko: `npm test` zelen; health vrne 200; dvakratni `migrate` ne naredi nič.

**F1 · Nivoji (referenčni podatki)** `S` · odvisno od: F0 · ⬜
- Naredi: `level_thresholds` + seed 7 nivojev v migraciji (konfiguracija, ne testni podatki).
- Čista funkcija `levelFor(points, thresholds)`.
- Končano, ko: test meja (0 → Intern, 499 → Intern, 500 → Junior, 30000 → Distinguished).

**F2 · Registracija in prijava** `M` · odvisno od: F0 · ⬜
- Naredi: `users`, `user_stats` (vrstica ob registraciji), scrypt hash.
- API: `POST /auth/signup` `{ email, username, password }`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- Validacija: e-pošta, `username` (dovoljeni znaki, dolžina ≤ 50, unikaten brez razlike v velikosti črk - gre v URL `/profile/[username]`), geslo ≥ 8.
- Frontend: `/login`, `/signup`.
- Končano, ko: napačno geslo → 401 (isto sporočilo kot neznan e-mail); podvojen e-mail/username → 409; v bazi ni gesla v čistem besedilu; `/auth/me` brez piškotka → 401.

**F3 · Zaščita poti** `S` · odvisno od: F2 · ⬜
- Naredi: `requireAuth`, `requireAdmin`; banned uporabnik → 403 `BANNED` povsod; `last_active_at` osvežen (največ 1× na minuto).
- Frontend: zaščita strani (preusmeritev na `/login`), `/admin/*` samo za admina.
- Končano, ko: ne-admin dobi 403 na admin poti; ban velja takoj, brez ponovne prijave.

**F4 · Onboarding** `S` · odvisno od: F3 · ⬜
- Naredi: `user_profiles`.
- API: `PUT /me/onboarding` `{ goalRole, experienceLevel, platformGoal }` (dovoljene vrednosti iz `01`), `/auth/me` vrne `onboardingCompleted`.
- Frontend: `/onboarding`; po prijavi preusmeritev na onboarding, dokler ni zaključen.
- Končano, ko: neveljavna vrednost → 400; ponovna oddaja posodobi (ne podvoji).

### M1 - Problemi

**P1 · Seznam problemov** `M` · odvisno od: F3 · ⬜
- Naredi: `problem_categories` (seed 5 kategorij v migraciji), `problems` (+ `thumbnail_url`, `summary`, brez `is_contest_problem`), `problem_tags`. Seed skripta z nekaj razvojnimi problemi.
- API: `GET /problems?category=&difficulty=&tag=&q=&sort=` → kartice (`02` "Card contains": naslov, kratek opis, težavnost, kategorija, ocena, število rešitev, časovna omejitev) + za prijavljenega `status` (`solved`/`in_progress`/`null`). Samo `is_published` in ne problemi tekmovanja, ki še ni končano (D17).
- Frontend: `/problems`. Oblika kartice je `ProblemListItem` v `frontend/src/lib/types/problem.ts`. Zaslon ima še filter `status` (`any`/`unsolved`/`in_progress`/`solved`, privzeto `unsolved`), neskončno drsenje (prvo nalaganje zapolni zaslon, nato po en zaslon) in "Saved problems" (po D23) → dodati `&status=&saved=&limit=&offset=` (zdaj filtrira mock na odjemalcu).
- Končano, ko: neobjavljen problem ni na seznamu; filtri se kombinirajo; `base_points` se ujema s težavnostjo (CHECK ali seed pravilo).

**P2 · Podrobnosti problema** `S` · odvisno od: P1 · ⬜
- API: `GET /problems/:slug` → opis, težavnost, kategorija, tagi, povprečna ocena + število, **število** komentarjev, status uporabnika. **Brez** kode in preverjanj (pridejo ob `start`).
- Naredi: `user_daily_activity`. Ogled prijavljenega uporabnika poveča `problems_opened` za današnji UTC dan (D6, D7) in posodobi `user_stats.current_streak/longest_streak/last_activity_date`.
- Frontend: `/problems/[slug]`. Oblika odgovora je `ProblemDetail` v `frontend/src/lib/types/problem.ts` (+ `solveCount`, `commentCount`, `checks` po D26, `repository` po D27, `result` = rešen poskus uporabnika: `timeTakenSeconds`, `linesAdded/Deleted`, `pointsEarned`, `timeMultiplier`, `myRating`; rešen problem stran pokaže kot "Problem solved").
- Končano, ko: neobjavljen ali neznan slug → 404; odgovor ne vsebuje `check_command` ali datotek; dva ogleda istega dne = en dan streaka, ogled naslednji dan ga podaljša.

### M2 - Reševanje

**R1 · Začetek reševanja** `M` · odvisno od: P2 · ⬜
- Naredi: `problem_codebase` (+ `hidden_files`, `solution_files` - D10, D11), `problem_checks`, `user_problem_attempts`.
- API: `POST /problems/:slug/start` → ustvari poskus (ali vrne obstoječega `in_progress`, timer teče naprej od `started_at`), vrne datoteke, drevo, `startedAt`, `timeLimitMinutes`, opise preverjanj (samo `description` + `check_order`).
- `abandoned` poskus: ista vrstica nazaj v `in_progress`, nov `started_at` (D8).
- Frontend shranjuje neshranjene spremembe v `localStorage` po poskusu (D14).
- Frontend: `/problems/[slug]/solve` (Monaco, zavihki datotek, timer). Oblika odgovora je `Attempt` v `frontend/src/lib/types/attempt.ts` (+ `repositoryName` po D27); zdaj `CodeEditorMock` namesto Monaca.
- Končano, ko: že rešen problem → 409 `ALREADY_SOLVED`; ponoven start ne resetira časa; skrite datoteke niso v odgovoru.

**R2 · Odstop** `S` · odvisno od: R1 · ⬜
- API: `POST /attempts/:id/give-up` → `status = 'abandoned'`. Ponoven start je mogoč (D8, v R1).
- Končano, ko: tuj poskus → 404; rešen poskus se ne more opustiti.

**R3 · Izvajalnik v Dockerju** `L` · odvisno od: R1 · ⬜
- Naredi: `docker/` (osnovne slike po jeziku), servis `runChecks(problem, userFiles)`: ustvari kontejner → osnovne datoteke → uporabnikove datoteke → **skrite datoteke zadnje** (D10) → `setup_commands` → preverjanja po `check_order` → uniči kontejner.
- Izolacija (`02`): brez omrežja (`--network none`, razen če problem zahteva), omejitev CPU/RAM/procesov, časovna omejitev na preverjanje in na celoto, brez dostopa do gostitelja, uporabnik ni root.
- Validacija uporabnikovih datotek: samo poti znotraj projekta (brez `..`, absolutnih poti), omejitev velikosti in števila.
- Ni endpointa - čist servis s testi.
- Razdeli, če se zatakne: (a) kontejner + datoteke, (b) preverjanja + izhod, (c) omejitve in varnost.
- Končano, ko: znan pokvarjen problem pade, popravljen uspe; poskus pisanja izven projekta zavrnjen; neskončna zanka prekinjena po času; kontejner ne ostane po koncu.

**R4 · Test in rešitev** `L` · odvisno od: R3, F1 · ⬜
- Naredi: `check_results`, `point_transactions`.
- API: `POST /attempts/:id/test` `{ files }` → rezultat po preverjanju (`passed`, `output` samo pri neuspehu).
- Če vsa `must_pass` uspejo - **ena transakcija:** `status = 'solved'`, `solved_at`, `time_taken_seconds` (strežnik), `time_bonus_multiplier`, `points_earned`, `final_code`, `lines_added/deleted` (diff proti izvirnim datotekam), vrstice v `point_transactions` (D15), `user_stats` (točke, nivo, `problems_solved`), `user_daily_activity` (`problems_solved`, `points_earned`), `problems.solve_count`.
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
- Naredi: `problem_ratings`.
- API: `PUT /problems/:slug/rating` `{ rating: 1-5 }` - samo po rešitvi (403 `NOT_SOLVED`); posodobi `problems.average_rating` in `rating_count` v isti transakciji.
- Končano, ko: nerešen → 403; ponovna ocena posodobi, ne podvoji; povprečje pravilno.

**O2 · Komentarji** `S` · odvisno od: R4 · ⬜
- Naredi: `problem_comments`.
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
- API: `GET /admin/problems?…` (tudi osnutki), `POST /admin/problems`, `PATCH /admin/problems/:id` (naslov, opis, težavnost, kategorija, tagi, časovna omejitev, vir).
- Telo shranjevanja z zaslona Create Problem je `AdminProblemDraft` (`frontend/src/lib/types/problem.ts`): `title`, `slug`, `shortDescription` (→ `summary`), `fullDescription` (→ `description`), `difficulty`, `categorySlug`, `timeLimitMinutes`, `tags`, `checks`, `hiddenFiles`, `bugSummary`, `isPublished`. Po D22 postane `PATCH` osnutka, ki ga je ustvarila A10.
- Frontend: `mockSaveProblem` v `src/lib/mock/adminProblems.ts` → API.
- Končano, ko: slug unikaten (409); `base_points` sledi težavnosti.

**A10 · Nalaganje ZIP + AI analiza** `M` · odvisno od: A2, D20-D22 · ⬜
- API: `POST /admin/problems/analyze` (ZIP, `requireAdmin`) → razpakira na strežniku (brez poti izven korena, omejitve iz D21), prebere kodne datoteke, pošlje jih Claude API s sistemskim pozivom iz uporabnikove specifikacije zaslona (spodaj), preveri JSON in vrne `ProblemAnalysis` (camelCase; Claude vrača snake_case - preslikava na API meji).
- Sistemski poziv (dobesedno iz specifikacije, 6. 10. 2026): vrne `bug_summary`, `short_description`, `full_description`, `suggested_difficulty`, `difficulty_reasoning`, `checks[]` (`check_order`, `description`, `check_type`, `check_command`, `must_pass`), `hidden_files`, `tags`; pravila: 3-5 preverjanj, preverjanja morajo pasti na pokvarjeni kodi, skrite datoteke = testi, opis ne sme namigovati na napako, samo JSON.
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
- API: `GET/POST/PATCH /admin/contests`, dodeljevanje objavljenih problemov.
- Seznam (`/admin/contests`): `AdminContestRow` (`frontend/src/lib/types/contest.ts`) - stanje `draft`/`scheduled`/`live`/`ended` (D43), problem (težavnost, kategorija), `entryCount` = število `contest_entries`; iskanje po naslovu in filter stanja kot query parametra. Brisanje samo osnutkov.
- Shranjevanje (`/admin/contests/new`): telo je `AdminContestDraft` - `title`, `type`, `problemSlug` (en problem, D33), `startsAt`/`endsAt` (UTC), `description`, `rewardDescription`, `isPublished`. Objava preveri pravila iz D44 tudi na strežniku.
- Izbirnik problemov: objavljeni problemi s številom preverjanj (`ContestProblemOption`).
- Frontend: `mockGetAdminContests`, `mockDeleteContest`, `mockSaveContest`, `mockGetContestProblemOptions` v `src/lib/mock/adminContests.ts` → API.

**A7 · Rezultati tekmovanj + CSV** `S` · odvisno od: A6, T2 · ⬜
- API: `GET /admin/contests/:id/results` (+ `?format=csv`), oznaka "nagrada poslana" (stolpec ni v shemi - dodaj ob rezini).

**A8 · Uporabniki** `S` · odvisno od: A1 · ⬜
- API: `GET /admin/users?q=`, `GET /admin/users/:id` (profil, statistika, poskusi), `POST /admin/users/:id/ban` / `unban`. Admin se ne more banati sam.

**A9 · Statistika platforme** `S` · odvisno od: A1, R4 · ⬜
- API: `GET /admin/stats` (`04` §4).

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
| `/problems` | `src/lib/mock/problems.ts`: `mockGetProblems` (vsi problemi, filtri/razvrščanje/straničenje na odjemalcu v `ProblemBrowser.tsx`); zaznamki samo v brskalniku (D23) | P1 | ⬜ |
| `/problems/[slug]` | `src/lib/mock/problems.ts`: `mockGetProblem` (+ `RESULTS` za rešen problem; ocena v `RateProblem` samo v stanju), `mockGetComments` (komentarji samo za rešen problem; objave, odgovori in helpful samo v stanju `Discussion.tsx`) (polni opis samo za `payment-retries-disappear`) | P2 (O1, O2 za oceno in komentarje) | ⬜ |
| `/problems/[slug]/solve` | `src/lib/mock/attempts.ts`: `mockStartAttempt` (timer teče od zdaj, za `in_progress` od 18:42), `mockRunTests` (vnaprej določeni rezultati); koda v `mockCodebase` (`mock/problems.ts`); urejevalnik je `CodeEditorMock` (samo branje); split pane: opis (`ProblemOverview`) levo, urejevalnik desno, spodaj Terminal + Test Results; vsaka datoteka je zavihek, izbirnik jezika je samo prikaz; "Submit" = zagon preverjanj | R1, R2 (Give up), R4, R5 (terminal), R6 | ⬜ |
| `/contests` | `src/lib/mock/contests.ts`: `mockGetContests` (live/upcoming/past + zgodovina uporabnika, datumi relativni na zdaj); prihajajoča tekmovanja brez težavnosti, oznak in sličice (T1); "View contest" vodi na `/contests/[id]` | T1, T2 | ⬜ |
| `/contests/[id]` | `src/lib/mock/contests.ts`: `mockGetContest` (seznam + `DETAILS`: incident, ime repozitorija (D27), število preverjanj, nagrada, udeležba); problemi tekmovanj so obstoječi mock problemi, da "Enter contest" odpre delujoč zaslon reševanja | T1, T2 | ⬜ |
| `/profile/[username]` | `src/lib/mock/profile.ts`: `mockGetProfile` (samo `max`, drugi → 404; 147 rešenih problemov, ciklično iz mock problemov; aktivnost 53 tednov = vsak tretji aktivni dan iz `mockActivity`; zgodovina tekmovanj iz `mockGetContests`); neskončno drsenje rešenih na odjemalcu | U1, U2, T2 | ⬜ |
| `/settings` | `src/lib/mock/profile.ts`: `MOCK_SETTINGS`, `mockSaveSettings` (shrani samo v stanje obrazca - profil in stranska vrstica se ne posodobita); zavihka Practice preferences in Account prazna (D35) | U1 (D34) | ⬜ |
| `/login` | `src/lib/mock/auth.ts`: `mockLogin` (vedno uspe → `/dashboard`); "Continue with GitHub" pokaže napako (D37); "Remember me" se ne uporabi (D40) | F2 | ⬜ |
| `/signup` | `src/lib/mock/auth.ts`: `mockSignup` (vedno uspe → `/onboarding`); polno ime namesto `username` (D38), geslo ≥ 12 (D39) | F2 | ⬜ |
| `/forgot-password` | `src/lib/mock/auth.ts`: `mockRequestPasswordReset` (uspe za vsak e-mail - stran ne razkrije, ali račun obstaja); pošiljanje pošte je odloženo (X5) | X5 (rezina še ne obstaja) | ⏸ |
| `/onboarding` | `src/lib/mock/auth.ts`: `mockSaveOnboarding` (vedno uspe → `/dashboard`); vloga "exploring" (D41), jeziki (D42); "Sign out" je povezava na `/login` | F4 (F2 za odjavo) | ⬜ |
| `/admin/problems/new` (Create Problem) | `src/lib/mock/adminProblems.ts`: `mockAnalyzeProblem`, `mockRunCheck` (lint uspe, ostalo pade), `mockSaveProblem` | A10, A4, A2/A5 | ⬜ |
| `/admin/contests` | `src/lib/mock/adminContests.ts`: `mockGetAdminContests` (12 tekmovanj, datumi relativni na zdaj; objavljena imajo id-je iz `mock/contests.ts`, da "View contest page" deluje), `mockDeleteContest` (samo osnutki, samo v stanju strani); iskanje in zavihki na odjemalcu; neskončno drsenje po 10 | A6 | ⬜ |
| `/admin/contests/new` | `src/lib/mock/adminContests.ts`: `mockGetContestProblemOptions` (mock problemi, izmišljeno število preverjanj), `mockSaveContest` (vedno uspe, seznam se ne posodobi); časi v UTC (`datetime-local`), konec sledi obdobju, dokler ga admin ne spremeni | A6 (D43, D44) | ⬜ |

---

## Nedoslednosti in vrzeli v dokumentih

Rešene z odločitvami 6. 10. 2026:

- ~~Zaščita testov~~ → D10 · ~~Referenčna rešitev~~ → D11 · ~~Kartica problema~~ → D16
- ~~Točke: en zapis ali dva~~ → D15 · ~~Tekmovalni problemi, `attempt_id`~~ → D17, D18
- ~~Ponoven poskus po odstopu~~ → D8 · ~~Časovna omejitev~~ → D9 · ~~Shranjevanje napredka~~ → D14

Odprto:

- **Točkovanje tekmovanj:** `03` "TBD" - za v1 velja D18 (enake točke kot redni problemi).
- **`repository_structure`** je izpeljiv iz ključev `files` - verjetno odveč (odloči v R1).
- **Nagrada poslana:** `04` "Admin marks reward as sent", stolpca ni (A7).

---

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
| `/problems/[slug]/solve` | R1-R6 |
| `/profile/[username]` | U1, U2, T2 |
| `/settings` | U1 (D34-D36) |
| `/contests`, `/contests/[id]` | T1, T2 |
| `/admin/problems/new` | A10, A2, A4, A5 |
| `/admin/contests`, `/admin/contests/new` | A6 |
| `/admin/*` | A1-A9 |
