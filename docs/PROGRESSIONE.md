# Piano di progressione — rendere l'app versatile per ogni scenario di studio

Obiettivo dell'utente (11/11/2026): usare "Il mio calendario" **sempre**, per qualsiasi studio
(altri esami universitari, lingue, certificazioni, concorsi, ripassi personali), non solo per il
semestre filtro di Medicina con Chimica, Biologia e Fisica.

## Principio guida
Il semestre filtro è **un corso tra tanti**. Ogni novità va pensata per un "corso" generico:
materie con codice qualsiasi, argomenti con data, schede/attività con file, piani, esami.
Niente di specifico per Chimica/Biologia/Fisica nel codice: quelle informazioni stanno **nei dati**
(pacchetti JSON, record `materia`).

## Cosa c'è già (versione 0.6.0)
| Livello | Funzione |
|---|---|
| Materie generiche | codice di lettere (C, B, F, GR, ANA…), nome, sigla, colore (record `materia`) |
| Corsi propri | creati dall'app: materie → argomenti (con data) → schede (tipo, pagine, file Drive qualsiasi) |
| Pacchetti da Claude | formato v1 (`docs/formato-studio.md`) generato da `studio/genera.mjs`, verificato coi numeri dei PDF |
| Piani | piano principale, piano di raffinamento, argomenti datati dei corsi, esami: tutti nel calendario |
| Avanzamento | spunte, punteggi, note, "in pari / in ritardo", spostamenti |
| Errori | registro automatico (punteggio < soglia o "da rifare") |
| Tempo | timer Pomodoro con sessioni registrate; statistiche per materia |
| Esami | data, ora, materie, conto alla rovescia |
| Strumenti | quiz HTML in iframe, PDF con cache, tabelle personalizzate, specchio Google Calendar, .ics |

## Prossimi passi (in ordine di priorità)
### 1. Ogni nuovo step del semestre filtro (continuo, obbligatorio)
Quando si crea la "Scheda di studio - Step N": scrivere `studio/sorgenti/step-N.txt`, eseguire
`node studio/genera.mjs` (tutti `ok`), pubblicare. Aggiornare il piano in `genera.mjs` se cambia.

### 2. Generatore di piani (prossima evoluzione importante)
Oggi i piani sono scritti a mano in `genera.mjs` o datati argomento per argomento.
Serve un **pianificatore nell'app**: data dell'esame + argomenti + giorni disponibili (es. lun–sab,
2 argomenti/giorno, giorni di riserva, ripasso finale) → genera il piano e lo mette nel calendario.
Deve poter **ripianificare** da oggi in avanti quando l'utente resta indietro, senza toccare i progressi.
Dati: nuovo pacchetto `tipo: "piano"` con `origine: "generato"` e i parametri usati.

### 3. Ripetizione spaziata
Per le schede fatte, proporre i ripassi a 1, 3, 7, 14, 30 giorni (più spesso se il punteggio è basso).
Riquadro "Ripassi di oggi" in Oggi. Dati: campo `ripassi` nel record `progresso`.

### 4. Importazione assistita di un corso
Da un indice/sillabo (PDF o testo) → bozza di corso (materie, argomenti, pagine) che l'utente rivede.
Da fare con Claude in chat (che produce il pacchetto JSON v1) finché non c'è un'alternativa nell'app.
Regola: il JSON va mostrato all'utente prima di caricarlo su Drive.

### 5. Schede di tipo diverso
Oltre a quiz/PDF: flashcard semplici dentro l'app (fronte/retro, punteggio), checklist di esercizi,
link a video/lezioni. Campo `tipoAttivita` nella scheda, con default "quiz".

### 6. Archivio dei corsi finiti
Corso "concluso": nascosto dalle viste quotidiane ma con statistiche e storico consultabili.

### 7. Notifiche push (facoltativo)
Solo se lo specchio Google Calendar non basta: Web Push con Cloudflare Worker gratuito (iOS 16.4+,
app installata). Spiegare pro/contro all'utente prima.

## Regole per chi sviluppa
- Mai cambiare gli `id` di schede, materie o corsi esistenti: i progressi sono legati a quelli.
- Ogni formato nuovo è **aggiuntivo** (campi facoltativi): i pacchetti v1 devono continuare a funzionare.
- Test automatici per ogni funzione (`test/*.py`), e `docs/MANUTENZIONE.md` aggiornato.
- Niente caricato o cestinato sul Drive dell'utente senza il suo ok esplicito.
