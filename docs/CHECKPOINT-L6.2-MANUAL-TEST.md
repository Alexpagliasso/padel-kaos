# Checkpoint L.6.2 — test manuale

## Mano legata alla partita

Usa la stessa squadra in due partite consecutive e apri insieme Regia, Team, Arbitro, Display Campo e Maxischermo.

1. Nel Turno 1 assegna tre carte e avvia la partita.
2. Usa una carta e lascia le altre due disponibili.
3. Conferma il risultato finale della partita.
4. Verifica che la carta usata resti nello storico e che le altre due risultino scadute, senza pulsante `UTILIZZA` attivo.
5. Verifica che nessun effetto attivo o richiesta in attesa resti visibile nei cinque client.
6. Seleziona il Turno 2 senza assegnare carte.
7. Nel Team verifica `CARTE NON ANCORA ASSEGNATE` e nella Regia `CARTE DA ASSEGNARE` con `0 / N squadre pronte`.
8. Prova ad avviare il turno: deve restare bloccato.
9. Premi `ASSEGNA CARTE` e verifica, senza aggiornare, la nuova mano nel Team e la readiness completa in Regia.
10. Verifica a database che gli ID delle nuove righe `match_cards` siano diversi da quelli del Turno 1 e che ogni riga conservi il proprio `match_id`.

## Chiusura pending e active

1. In una partita live gioca una carta che richiede l'Arbitro e lasciala in attesa.
2. Completa canonicamente la partita: la carta deve diventare annullata, la usage risolta/rifiutata e `GESTISCI` deve sparire.
3. In un'altra partita attiva una carta a tempo o a game.
4. Completa la partita: la carta deve diventare scaduta e l'effetto deve sparire da Team, Arbitro, Regia, Display Campo e Maxischermo.
5. Passa al match successivo e verifica che nessuna notifica `CARTA GIOCATA` precedente venga riprodotta.

## Correzione Admin e Carte OFF

1. Completa e conferma una partita, quindi correggi il risultato da Admin in modo da riaprire lo stato operativo.
2. Verifica che le carte storiche restino annullate/scadute e non tornino disponibili.
3. Verifica che la readiness storica del turno completato resti valida perché le righe assegnate non sono state eliminate.
4. Disattiva `CARTE` in un torneo di prova e verifica che il flusso continui senza assegnazione obbligatoria.
