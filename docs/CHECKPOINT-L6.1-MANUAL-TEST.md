# Checkpoint L.6.1 — test manuale

## A. Carte obbligatorie

1. Completa il turno precedente e apri il turno successivo in Regia.
2. Con `CARTE` attivo, non assegnare le carte.
3. Verifica `CARTE DA ASSEGNARE`, il conteggio squadre pronte e il messaggio `ASSEGNA LE CARTE PRIMA DI AVVIARE IL TURNO`.
4. Prova l’avvio centralizzato, l’apertura agli Arbitri e `AZIONI REGIA`: l’avvio deve restare bloccato.
5. Assegna una mano completa. Il conteggio deve diventare completo e l’avvio deve essere disponibile.
6. Avvia il turno e verifica che le mani non vengano ridisegnate.
7. Su un torneo di prova inattivo disattiva `CARTE`, non assegnare mani e avvia: l’operazione deve riuscire.
8. Completa il turno e verifica che il turno seguente richieda mani proprie, legate alle nuove partite.

## B. Evento carta live

Apri insieme Regia, Arbitro, Team A, Team B, Display Campo e Maxischermo.

1. Attiva `NOTIFICHE CARTE SUI DISPLAY`.
2. Da Team A usa una carta soggetta a convalida.
3. Senza aggiornare, verifica la notifica in Regia, Arbitro, Team B, Display Campo assegnato e Maxischermo.
4. Verifica che un altro Display Campo e una squadra estranea non ricevano né evento né mano privata.
5. Conferma la carta: lo stato in attesa deve sparire e l’effetto attivo esistente deve comparire sui destinatari previsti.
6. Usa un’altra carta e rifiutala: lo stato in attesa deve sparire ovunque e Team A deve vedere il rifiuto.
7. Disattiva la convalida Arbitro e usa una carta sicura: deve apparire `CARTA ATTIVA`, senza un falso stato di attesa.
8. Usa `IL PRESCELTO`: deve comunque richiedere Arbitro e scelta del giocatore.
9. Disattiva `NOTIFICHE CARTE SUI DISPLAY` e usa una carta: Regia, Arbitro e avversario devono riceverla; i due display non devono mostrarla.
10. Riconnetti e aggiorna i client: gli eventi già osservati non devono essere riprodotti, mentre gli effetti attivi devono ricostruirsi.
11. Durante una rivelazione dado, genera un evento carta di prova: la rivelazione deve terminare e la notifica carta deve apparire dopo.
