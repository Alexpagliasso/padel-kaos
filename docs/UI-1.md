# UI-1 — Design system e layout per ruolo

## Foundation

- Prima del refactor: Tailwind CSS 4, Lucide, Framer Motion; nessuna dipendenza MUI.
- Aggiunti `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`.
- Test DOM: `@testing-library/react`, `jsdom` (solo sviluppo).
- `src/theme`: tokens, typography, tournamentPresets, createTournamentTheme, themeContext, ThemeProvider.
- Preset White, Blue, Orange, Green e Custom, senza associazioni geografiche.
- Il Custom conserva la scelta originale nel picker; il colore di accento viene schiarito se necessario per raggiungere 4.5:1 sulla superficie. Anche il testo dei pulsanti raggiunge 4.5:1.
- Stato React condiviso fra route, temporaneo: il refresh ripristina Orange. Nessuna persistenza o sincronizzazione fra browser/display separati.

## Ruoli e componenti

- Admin: sidebar persistente da `lg`, drawer sotto `lg`, stato torneo, account/logout. Dashboard, Setup, Teams, Groups / Matches, Control Room, Access, Appearance, Recovery. I nuovi percorsi Teams e Groups riusano le tab esistenti.
- Player: header con team/stato, score, lineup, carte, classifica del gruppo e live; navigazione mobile esclusivamente tramite ancore interne.
- Referee: header operativo, score, pulsanti punto da 88px, fine set/match, carte e Por Tres. L'azione resta **+ Point**, coerente con l'engine tennis esistente. Timer derivato dagli eventi MATCH_STARTED/MATCH_COMPLETED, oppure “—” se non disponibili.
- Court display: nessun menu, logout, selettore o controllo operativo; score affiancato fino a 12rem, lineup corrente e stato eventi.
- Main display: branding, round, schede match e overlay evento/vincitore con Framer Motion. Nessuna navigazione.
- Condivisi: PageShell, MobileRoleShell, DisplayShell, TournamentLogo, StatusChip, SectionHeader, PrimaryAction, DangerAction, EmptyState, EventOverlay, Scoreboard e MatchTimer. AdminLayout funge da shell admin; MatchTile riusa il nuovo scoreboard.
- Guard e autorizzazioni esistenti conservati. L'isolamento visivo vale anche quando il profilo demo è admin ma la pagina visitata è player/referee/display.

## Responsive: revisione concettuale del layout

Questa verifica riguarda breakpoint e dimensioni nel codice; non è una validazione con screenshot/browser.

| Viewport | Comportamento previsto |
| --- | --- |
| 375×812, 390×844 | Una colonna mobile, score con nome flessibile, target 48px+, bottom nav team con spazio riservato e safe area; login a una colonna. |
| 768×1024 | Admin con drawer; pannelli e lineup possono distribuire il contenuto su due colonne. |
| 1366×768 | Sidebar admin persistente da 272px; contenuto con larghezza flessibile e scorrimento verticale. |
| 1920×1080 | Court score fino a 192px; team affiancati e lineup scalata. Main display con tre colonne di schede. |
| 2560×1440 | Display senza limite di larghezza; score delle schede dimensionato rispetto al loro contenitore, titoli con clamp. |

Contenuti lunghi o un numero elevato di match possono richiedere scorrimento: non è stato introdotto un carosello automatico. Le animazioni rispettano `prefers-reduced-motion`.

## Migrazione e limiti

Prima passata applicata a login, admin/dashboard/setup/control-room/access, player, referee, court-display e main-display, più Appearance.

I form complessi di setup/access, recovery, pannelli carte/dadi e alcuni controlli secondari mantengono Tailwind/Lucide. Un livello CSS di compatibilità e variabili semantiche applicano tema, superfici, angoli e target touch senza riscrivere la logica dei workflow.

La route login continua a reindirizzare ad admin in modalità demo, come prima. Nessuna modifica a database, migration, Edge Functions, repository, auth, scoring/rules engine o realtime.

Verifiche: test dei preset/custom e del contrasto, rendering dei layout reali senza link incrociati, display senza controlli, sidebar admin, suite di regressione. Eseguiti `npm run test`, `npm run lint`, `npm run build`; Vite segnala un bundle superiore a 500 kB.
