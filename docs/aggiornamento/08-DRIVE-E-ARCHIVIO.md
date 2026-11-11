# 08 — Proposte: Drive più efficiente, Drive dedicato, archivio locale
⚠ Sono **proposte**. Nulla va spostato, rinominato, caricato o cestinato senza l'ok esplicito dell'utente. I vecchi file Gemini non si toccano mai.

## 1. Situazione attuale (cartella "materiale studio")
Cartelle allo stesso livello: `00 - MEMORIA CLAUDE`, `biologia`, `chimica`, `fisica`, `biologia quiz`, `chimica quiz`, `fisica quiz`, `biologia preparazione`, `chimica preparazione`, `fisica preparazione`, `indici libri`, `Formulari`, `Piano di studio`, `Scheda di studio`, `Schede esame/consolidamento`, più file sciolti (direttive, indici di lettura…). Più l'app usa `Calendario personale/` nella radice.
**Problemi**: ordine alfabetico casuale; la stessa materia è divisa in 3 cartelle; file di sistema (direttive, memoria) mescolati ai materiali; nessun numero stabile per citare una cartella; i quiz crescono a centinaia per cartella.

## 2. Proposta A — PARA + numerazione Johnny Decimal (consigliata)
**PARA** divide per *stato* (Progetti in corso, Aree continue, Risorse, Archivio); **Johnny Decimal** dà a ogni cartella un **numero stabile** (al massimo 10 aree × 10 categorie, mai più di due livelli), così "apri 22.03" è inequivocabile anche per un Claude futuro. Si possono combinare: PARA per decidere, numeri per trovare.
```
00-09 Sistema
   00 Indice (un solo file: mappa dei numeri)        ← sostituisce i file sparsi
   01 Memoria Claude (esistente, rinominata)
   02 Direttive (file 00 - DIRETTIVE…)
10-19 Semestre filtro (PROGETTO in corso)
   11 Piano e schede di studio (Piano di studio + Scheda di studio)
   12 Chimica — 12.1 libro (PDF divisi) · 12.2 lezioni/preparazione · 12.3 quiz · 12.4 formulari
   13 Biologia — idem
   14 Fisica — idem
   15 Simulazioni e consolidamento
   16 Indici libri
20-29 Altri corsi futuri (uno per numero)
30-39 Risorse generali (cybersecurity "CS", metodi di studio, modelli)
90-99 Archivio (corsi conclusi, vecchi file Gemini spostati SOLO se l'utente lo vuole)
```
- **Regola anti-caos**: mai un terzo livello; dentro le cartelle quiz i file restano col nome attuale (che inizia già con il microstep: si ordinano da soli).
- **Migrazione sicura**: Claude prepara un file "piano di migrazione" (vecchio percorso → nuovo percorso), l'utente approva, poi si sposta (spostare su Drive **non cambia gli ID dei file**, quindi link, app e quiz continuano a funzionare). Gli ID nei pacchetti dell'app restano validi.
- **Vantaggio per l'app**: l'app può mostrare il numero (es. "12.3") accanto alle schede e aprire la cartella giusta.

## 3. Proposta B — Ritocchi minimi (se non si vuole riorganizzare)
- Rinominare solo con prefissi numerici le cartelle principali (`10 Piano`, `12 Chimica quiz`…) per l'ordine.
- Un unico file `00 INDICE.txt` con l'elenco cartelle → contenuto → ID.
- Una cartella `99 Vecchi` per ciò che non serve più (spostamento solo su ok).

## 4. Proposta C — Un Drive dedicato allo studio
Creare un **secondo account Google** solo per lo studio (gratuito, 15 GB) o una cartella condivisa con regole strette.
- **Pro**: separazione netta dalla vita personale; l'app può usare permessi più ampi senza toccare il resto.
- **Contro**: 15 GB (ma i 400 GB attuali sono già disponibili), due account da gestire, l'app dovrebbe cambiare account ammesso.
- **Giudizio**: **non necessario** oggi; utile solo se il Drive principale diventa ingestibile.

## 5. Proposta D — Archivio locale / ibrido
- **Nell'app (già così)**: dati sul telefono (IndexedDB) + copia su Drive. Si può aggiungere la **cache dei PDF e dei quiz** più usati per lo studio completamente offline (già c'è per i PDF).
- **Su PC**: l'API "File System Access" (Chrome/Edge su PC, non su iPhone) permetterebbe all'app di salvare una copia in una cartella del computer (backup locale automatico). Utile come terza copia.
- **GitHub privato come archivio dei pacchetti**: i pacchetti JSON (step, carte, piani) potrebbero vivere anche in un repo privato con storico delle versioni. Pro: storico e confronto delle modifiche; contro: un sistema in più. Per ora i pacchetti stanno già nel repo dell'app (`studio/pacchetti`).
- **Regola 3-2-1 dei backup**: 3 copie, 2 supporti diversi, 1 fuori casa → telefono + Drive + (PC o esportazione ZIP mensile).

## 6. Proposta E — Convenzioni dei nomi
- Date ISO nei nomi (`2026-11-11`) per l'ordine; niente spazi doppi o finali (oggi esistono "materiale studio " e "indici libri " con spazio finale: da correggere solo con ok).
- Nomi quiz invariati (l'app li usa per collegare le schede).
- File di sistema con prefisso `00`.

## 7. Cosa decide l'utente
1. A, B o niente? 2. Drive dedicato sì/no? 3. Backup locale su PC sì/no?
Dopo la decisione, F8 implementa solo ciò che serve all'app (numeri nelle schede, apertura cartelle) e Claude prepara il piano di migrazione da approvare.
