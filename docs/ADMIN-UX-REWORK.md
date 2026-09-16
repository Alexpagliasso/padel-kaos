# Admin UX / Tournament Setup rework

## Navigazione e anteprime

- Solo admin autenticati vedono sidebar e link Player, Referee, Court Display e Main Display.
- Player/Referee rimangono sotto `ProtectedRoute`, con un'eccezione esplicita per l'anteprima degli admin autenticati. Nessun altro ruolo acquisisce permessi.
- `DevelopmentBackToAdmin` è marcato come rimovibile: compare sulle schermate dei ruoli solo con `import.meta.env.DEV` e profilo admin autenticato.
- Le anteprime usano il torneo selezionato nel workspace. L'anteprima referee su provider Supabase disabilita i comandi operativi; non avvia RPC di scoring. La demo mantiene il proprio motore esistente.

## Selezione, setup e lifecycle

Il selettore elenca il torneo del provider corrente e i tornei locali creati nella sessione. Non interroga un nuovo endpoint multi-torneo.

Le sezioni principali sono GENERAL, TEAMS, CARDS, SPECIAL EVENTS, SUMMARY. General contiene nome, numero squadre, qualificati Gold/Silver, campi e tema. Summary usa la configurazione salvata, mostra il roster registrato rispetto a quello pianificato e ospita le azioni del lifecycle.

Stati UI: draft → ready → live → completed. Start richiede conferma; i campi strutturali e il roster restano bloccati anche dopo il completamento. Delete è disponibile solo dopo Complete e richiede `DELETE <nome torneo>`. Elimina il torneo e le sue distinte dal workspace, conservando le librerie globali.

Il consiglio sui campi è informativo: usa i gironi disponibili o, se ancora assenti, una stima esplicita di quattro squadre per girone. La configurazione non genera automaticamente gironi, incontri o calendario.

Il roster esistente è riusato: per il torneo collegato resta il flusso attuale; per i tornei locali un adapter in memoria implementa lo stesso contratto e conserva gli ID giocatore durante la modifica. Non vengono creati account per i tornei locali. La sezione Access evita di mostrare le credenziali del torneo collegato quando è selezionato un torneo locale.

## Librerie

Cards: titolo, descrizione, immagine PNG/JPEG/WebP fino a 5 MB. Special events: nome, descrizione, immagine opzionale e premio opzionale. Le immagini sono lette localmente, senza upload.

Le definizioni appartengono alla libreria; `activeCards` e `activeEvents` appartengono al singolo torneo. Disattivare una voce non la elimina. Le nuove carte contengono metadati visuali: non assegnano nuovi effetti al motore di regole.

## Regia e distinte

Control Room mostra round, campi, stato incontri, stato invio referee, alert e distinte finali. Non renderizza punti o game progressivi e non contiene i comandi dello scoring.

MatchReportCard separa RESULT, LINEUPS, SETS, CARDS USED, SPECIAL EVENT / PRIZE e REFEREE. I risultati dei set vengono confermati dall'arbitro dopo il completamento del match: l'engine esistente non conserva sempre lo storico completo dei set. Lineup, uso carte e premi provengono dai record disponibili, senza inventare quelli assenti.

La distinta è uno snapshot, inviabile alla regia nello stesso workspace. Può essere approvata o segnalata con nota. Una distinta segnalata può essere reinviata; una approvata non può essere sovrascritta.

ROLL GLOBAL DICE: azione da 80px, conferma, animazione Framer Motion e risultato locale per round. Il risultato già presente nel round viene mostrato prima di eventuali lanci locali. SPECIAL EVENT mostra soltanto definizioni attive per il torneo, consente Launch e End e mette in evidenza l'evento corrente. Un evento attivo deve terminare prima di lanciarne un altro.

## Confini di questo step

Nuovi setup, lifecycle, librerie, operazioni e distinte sono in memoria: ricaricare la pagina li azzera e finestre/account separati non si sincronizzano. Dado/eventi della nuova regia non scrivono nel motore o nei repository; sono un prototipo operativo UI. I flussi preesistenti del provider non sono sostituiti.

Nessuna modifica a schema, RLS, migration, Edge Functions o realtime. `.env.local` e `.env.example` non sono stati modificati da questo intervento.

File principali: `src/features/admin/workspace/`, `setup/{TournamentSetupPage,GeneralSetup,LibraryPanel,TournamentLifecycle}.tsx`, `reports/`, `preview/`, `control-room/{ControlRoom,OperationsControls}.tsx`; integrazioni in `App`, `AdminLayout`, dashboard, setup roster, access/recovery e route dei ruoli.

Test: lifecycle e lock, selettore e creazione/modifica, consiglio campi, upload/creazione librerie, attivazioni isolate, preview/guard, invio/revisione/approvazione distinta, regia senza scoring e controlli dado/eventi. Verifiche richieste: `npm run test`, `npm run lint`, `npm run build`. La build segnala il bundle principale oltre 500 kB.
