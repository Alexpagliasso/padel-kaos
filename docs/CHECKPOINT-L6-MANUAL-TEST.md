# Checkpoint L.6 — test torneo reale

## Turno 1

1. In Regia aprire il Turno 1.
2. Avviare il Set 1.
3. Verificare che il timer mostri la durata effettiva configurata.
4. Impostare prima dell'avvio una durata breve e attendere la scadenza.
5. Verificare `TEMPO SCADUTO` e la conclusione automatica autorevole del set.
6. Nell'area Arbitro verificare `RISULTATO SET 1`.
7. Usare `MODIFICA RISULTATO`, correggere il punteggio e confermare.
8. Usare `INVIA RISULTATO ALLA REGIA`.
9. Lanciare il dado, se abilitato, e avviare il Set 2.
10. Attendere la scadenza del Set 2.
11. Correggere anche il risultato del Set 2.
12. Inviarlo alla Regia.

Configurare la Partita A con due set vinti dalla stessa squadra e confermare il risultato finale. Configurare la Partita B sull'1–1: deve apparire `SUPER TIE-BREAK NECESSARIO`.

13. Tentare di avviare il turno successivo prima del Super Tie-Break. Atteso: `TURNO SUCCESSIVO BLOCCATO`, campo e motivo esatto.
14. Inserire e salvare il Super Tie-Break.
15. Confermare tutte le partite. Atteso: Turno 1 completato.
16. Usare `AVVIA TURNO SUCCESSIVO`. Atteso: il Turno 2 diventa quello corrente per Regia, Arbitri, Squadre e display senza nuovo accesso.

## Recupero errore Admin

17. Aprire `RISULTATI`.
18. Selezionare il girone.
19. Espandere una partita terminata.
20. Correggere il Set 2 trasformando un 2–0 in 1–1. Atteso: conferma finale revocata, Super Tie-Break richiesto, classifica aggiornata e turno nuovamente bloccato.
21. Inserire o correggere il Super Tie-Break come Admin.
22. Confermare di nuovo la partita.
23. Verificare che classifica e prontezza del turno tornino coerenti.

Ripetere almeno una scadenza con due client aperti: una sola transizione `SET_ENDED` deve risultare canonica e nessun timer deve diventare negativo.
