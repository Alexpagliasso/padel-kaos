# Checkpoint L.7 — test multi-dispositivo

Apri una Regia, due arbitri, due Team, un Display Campo e il Maxischermo. Usa finestre o dispositivi separati e non aggiornare manualmente durante la sequenza.

1. Assegna le carte e avvia il turno: tutti ricostruiscono il nuovo contesto; i display presentano brevemente il turno.
2. Avvia il Set 1: score e timer cambiano ovunque, con una sola presentazione per client. In modalità centralizzata il Maxischermo non deve accodare un banner per ogni campo.
3. Modifica il punteggio: tutti aggiornano il valore senza banner.
4. Gioca e conferma una carta: conserva il flusso L.6.1; la richiesta resta persistente per l’arbitro finché non viene risolta.
5. Lascia scadere il Set 1 e invia il risultato: arbitro e Regia mostrano l’azione richiesta, Team e display mostrano lo stato di attesa, poi il risultato ricevuto.
6. Lancia il dado: tutti, Regia inclusa, vedono una sola reveal sincronizzata; gli eventi inferiori attendono la fine della reveal.
7. Avvia il Set 2 e attiva Por Tres: ogni client riceve nome, descrizione e premio. Il candidato segnalato appare solo in Regia.
8. Conferma il vincitore: solo ora Team, arbitri e display mostrano `VINCITORE EVENTO`.
9. Crea un 1–1: verifica `SUPER TIE-BREAK NECESSARIO` e la relativa azione persistente.
10. Conferma tutte le partite: verifica `PARTITA TERMINATA`, poi `TURNO COMPLETATO` e `ASSEGNA CARTE` per il turno successivo senza assegnazione automatica.

Durante il test disconnetti un Team e un display. Esegui punteggio, carta e transizione set, quindi riconnetti: lo stato corrente deve essere corretto senza replay delle vecchie animazioni. Ripeti con refresh a metà partita e verifica score, timer, set, dado, carte attive, evento speciale e stato match.
