# Banca domande (Quiz Studio, v0.22)

File: `studio/banca/banca-step-N.json` (pubblicati in `dist/studio/banca/`).

```
{ formato:"banca-domande", versione:1, step:N, aggiornato:"YYYY-MM-DD",
  schede:   { "<sk>": { titolo, materia, microstep, k, n, fonti, focus, file } },
  immagini: { "i-<hash>": "<svg…>" },
  domande:  [ { id:"q-<hash sk+testo>", sk, t:"mcq"|"fill", lv, q,
                o:[corretta, d1..d4]  (solo mcq: la corretta è SEMPRE la prima),
                a:[risposte accettate], show  (solo fill),
                e: passi della correzione (stringa o array), ew:[perché d1..d4 sono sbagliati],
                r: riferimento da ripassare, cit:[{t,f,l}], cl: spiegazione di Claude,
                img:[{i,cap,f}] } ] }
```

`sk` = id della scheda nel pacchetto studio (`C-3.1.1-1`). Gli `id` delle domande non vanno cambiati:
statistiche (`statq`) e spiegazioni AI sono legate a quelli (le spiegazioni anche al testo).

Rigenerare (dopo nuove schede): in `quiz/build` → `node banca.js <repo>/studio/banca` (copia dello
script in `studio/strumenti/banca.js`; va eseguito nella cartella dei sorgenti delle schede).
Le schede non presenti nella banca si estraggono al volo dagli HTML su Drive (vedi 07-quizapp).

Prossime fasi: Q2 editor delle domande, Q3 generatori a regole, Q4 regole che si aggiornano con
l'esperienza (da `statq`), Q5 ponte con Claude/Groq per creare domande nuove.
