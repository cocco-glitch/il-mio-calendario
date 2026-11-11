# Formato "pacchetto studio" — v1

Un pacchetto è un file JSON. L'app li prende da due posti:
1. dal sito (`studio/*.json`, generati da `node studio/genera.mjs` a partire da `studio/sorgenti/`);
2. dalla cartella Drive `Calendario personale/studio/` (pulsante "Aggiorna pacchetti da Drive").

Regole di importazione: un pacchetto sostituisce quello con lo stesso `id` solo se il suo `aggiornato` non è più vecchio.
I progressi dell'utente sono record separati (`prog-<id scheda>`), quindi **non si perdono mai**: basta non cambiare gli `id` delle schede.

## Pacchetto di tipo `step`
```json
{ "formato": "pacchetto-studio", "versione": 1, "tipo": "step", "id": "step-2", "step": 2,
  "titolo": "Step 2 (UD2)", "aggiornato": "2026-11-11",
  "risorse": {
    "libri": { "C": { "nome": "Bettelheim", "offset": 22, "blocco": 140, "cartella": "<id cartella Drive>", "file": { "1": "<id 001-140.pdf>", "141": "<id>" } } },
    "quiz":  { "C": "<id cartella 'chimica quiz'>", "B": "...", "F": "..." } },
  "materie": [ { "m": "C", "nome": "Chimica", "libro": "Bettelheim", "sottostep": [
    { "k": "C2.2", "n": "2.2", "titolo": "...", "posizione": "Mer 11/11 – giorno 1 di 23 · in coppia con F2.2",
      "ripasso": "Simulazione 3 ...", "svolto": false,
      "microstep": [ { "n": "2.2.4", "schede": [
        { "id": "C-2.2.4-2", "k": 2, "n": 3, "titolo": "Problemi: calcolo del calore nei cambiamenti di fase",
          "tipo": "P", "problemi": true, "pagine": "141-144,146-147", "slide": "testo libero, facoltativo",
          "quizFile": "2.2.4 Problemi: calcolo del calore nei cambiamenti di fase (scheda 2 di 3).html",
          "quizFileId": "facoltativo: id Drive del quiz" } ] } ] } ] } ] }
```
- `m`: `C` Chimica, `B` Biologia, `F` Fisica. `k` del sotto-step = lettera + numero (è la chiave usata dal piano).
- `id` scheda = `<m>-<microstep>-<k>`: **stabile per sempre**.
- `tipo`: `P` prioritaria, `R` raffinamento. `problemi`: scheda di "problemi da risolvere".
- `pagine`: pagine del libro cartaceo, intervalli separati da virgola. I totali (prioritarie / raffinamento / unione) li calcola l'app.
- PDF diviso e pagina si ricavano da `offset` e `blocco`: pagina assoluta = pagina libro + offset; il file è quello che inizia a `floor((ass-1)/blocco)*blocco+1`. Se l'id non è in `file`, l'app cerca nella `cartella` il PDF il cui nome inizia con quel numero a 3 cifre.
- Quiz: se manca `quizFileId`, l'app cerca nella cartella `quiz[m]` il file che inizia con `"<microstep> "` e finisce con `"(scheda k di n).html"`.

## Pacchetto di tipo `piano`
```json
{ "formato": "pacchetto-studio", "versione": 1, "tipo": "piano", "id": "piano", "titolo": "...", "aggiornato": "2026-11-11", "giorniTeoria": 23,
  "giorni": [ { "data": "2026-11-12", "n": 2, "nota": "facoltativa",
    "voci": [ { "k": "B2.2", "t": "Bioenergetica..." }, { "k": "SIM3", "t": "Simulazione 3", "d": "descrizione", "speciale": true } ] } ] }
```
- Una voce normale è uno step (`k` = chiave del sotto-step). È "fatta" quando tutte le sue schede prioritarie sono spuntate; se il pacchetto dello step non esiste ancora si spunta a mano.
- "In ritardo di N step" = voci non speciali con data passata e non fatte. Gli spostamenti dell'utente sono record `sp-<k>`.

## Come un futuro Claude crea un pacchetto
1. Scrivere `studio/sorgenti/step-N.txt` (formato spiegato in testa a `step-2.txt`), con la riga `=` dei numeri attesi per ogni sotto-step.
2. `node studio/genera.mjs`: deve stampare `ok` per ogni sotto-step. 3. `node build.mjs` e pubblicare; oppure caricare il JSON in `Calendario personale/studio/` (solo con l'ok dell'utente).
