# 10 — Prompt di avvio (da incollare a un Claude per far partire una fase)
Sostituisci `FN` con la fase (es. F2). Il prompt è corto apposta: il resto sta nei file.

---
Lavoriamo sull'app "Il mio calendario" (repo GitHub `cocco-glitch/il-mio-calendario`, sito su GitHub Pages). Fase da fare: **FN**.

1. Clona il repo e leggi solo: `README.md`, `docs/MANUTENZIONE.md`, e dal piano di aggiornamento (cartella `docs/aggiornamento/` del repo oppure i file che ti allego) il file `00-INDICE.md`, il paragrafo **FN** di `05-PIANO-FASI.md` e le tattiche citate lì da `04-TATTICHE-NEURO.md`. Apri `06`/`07`/`08` solo se la fase li cita.
2. Rispetta le regole del file 00 (niente upload/cestino sul Drive senza il mio ok, mai toccare i quiz HTML né i file Gemini, mai cambiare gli id, zero dipendenze npm, campi nuovi facoltativi).
3. Prima dimmi in **5 righe** cosa farai (Must/Should che rientrano nell'appetito) e l'eventuale spike; poi procedi senza fermarti per dettagli minori: decidi e segnala.
4. Lavora per taglio verticale: dati → logica → schermata → test. Usa `grep -n` invece di leggere file interi. Codice nuovo in file nuovi `src/07-*.ts`.
5. Chiudi con la Definizione di "fatto" (file 05 §1): build, test, versione, documentazione breve, riga in `docs/DECISIONI.md`, pubblicazione su `gh-pages`, stato aggiornato nel file 00, e mandami il link da provare sull'iPhone.
Risposte in italiano, aggiornamenti brevi.
---

## Suggerimenti per spendere pochi token
- Una fase per conversazione. Se la fase è L, dividerla in due conversazioni (Must / Should).
- Allegare i file del piano solo la prima volta; poi tenerli nel repo (`docs/aggiornamento/`) così il Claude li legge da lì.
- Chiedere "mostrami solo il diff" invece del codice completo.
- Per i pacchetti di studio/carte usare la chat dei quiz (con le sue direttive) e importare il JSON nell'app.
