# V2.1 — prova manuale del dado globale

Aprire contemporaneamente Regia desktop, Team e Arbitro su telefono, Court Display e Main Display. Con Set 1 completato e i risultati inviati, premere **LANCIA DADO GLOBALE** dalla Regia.

Verificare su tutti e cinque i dispositivi:

1. Il reveal copre l'intera viewport e mostra la stessa fase a pochi istanti di distanza.
2. La faccia finale del cubo corrisponde al risultato persistito in `rounds.dice_result` e alla regola in `rounds.dice_rule_id`.
3. Il titolo e l'artwork corrispondono alla stessa faccia. La Regia ritorna ai controlli dopo il reveal.
4. Aggiornare un dispositivo a circa 3 secondi: deve riprendere dalla rotazione in corso. Aprirne uno dopo 8 secondi: non deve riprodurre il reveal.
5. Set 2 non si avvia alla fine del reveal e il timer dei 5 minuti non parte dal lancio.
6. Avviare Set 2 col normale controllo: il timer dell'effetto parte da `matches.set_2_started_at` e le carte restano bloccate durante l'effetto.
7. Ripetere con `prefers-reduced-motion: reduce`: risultato e regola devono essere leggibili senza rotazione caotica.

Verificare almeno un telefono da 375 px, uno da 390 px, un tablet, Regia a 1366 px e i display a 1920×1080. Provare anche un display largo 2560 px.

## Sostituzione delle sei immagini

Sostituire i file SVG in `public/dice/` mantenendo i nomi (oppure aggiornare il campo `artwork` in `src/domain/live/diceShow.ts`):

- `1vs1-placeholder.svg`
- `3vs3-placeholder.svg`
- `palline-sgonfie-placeholder.svg`
- `palline-tennis-placeholder.svg`
- `un-servizio-placeholder.svg`
- `no-vetri-placeholder.svg`

Le immagini sono presentazione frontend: non modificare ID, `product_code` o valori nel database.
