// Genera i pacchetti studio JSON (formato v1, vedi docs/formato-studio.md) dai sorgenti.
// Uso: node studio/genera.mjs   → scrive studio/pacchetti/*.json e controlla i numeri attesi.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const qui = new URL('.', import.meta.url).pathname;
const OGGI = new Date().toISOString().slice(0, 10);
const NOMI = { C: ['Chimica', 'Bettelheim'], B: ['Biologia', 'Fasano'], F: ['Fisica', 'Scannicchio'] };
// Risorse su Drive (dal file "00 - DIRETTIVE CLAUDE quiz"): libri divisi in PDF e cartelle quiz.
// pagina PDF assoluta = pagina libro + offset; ogni file contiene `blocco` pagine; `file` = prima pagina → id Drive.
export const RISORSE = {
  libri: {
    C: { nome: 'Bettelheim', offset: 22, blocco: 140, cartella: '1-PiVvRltpi0zFuVAc4DucXuNFifkacPd', file: { 1: '11KJ-ttZXvqSIwEJleFh25gHGzvCO-Vdd', 141: '1QNGos0ubcr25nmtbRiaPy3D9szh3mvJQ' } },
    B: { nome: 'Fasano', offset: 14, blocco: 50, cartella: '133xoF0sUSN4B7CieZardKffHs02QVp6N', file: { 1: '1HFA7NO-rOtUcY-iwv1r4HVmht7oEk4CC', 51: '14dwl70SoAR5Zxn-GYRIMlBpBa8y60YRW', 101: '1Ak3jJN8nIcWrI-q3dveuKXvhB_AZweNs', 151: '1ivnj30NjCBgTWd5Uadmy1H3w5wX5mNnr', 201: '1A5C3CtpCBVjogMqz6ti52zI1FoFrIBbc', 251: '1CHXWePW2bx32GSpvXdPP-XlyYyh0pyGA', 301: '1zMSpgJokvLZDH1P5sCDglM50PLPvJ9a2', 351: '1EnkdHHSGEfWozw6wkWGhwm91CMd5IAeb', 401: '1Vj-BACOfmR0Ele9HuQMKlCh8obiv1c-s', 451: '1qES3_AHxEqRAeq81pwqxb7VtlveUr9QE', 501: '1S7Ju9TKej27dnTI1KbMj4sEg95fGE5mg' } },
    F: { nome: 'Scannicchio', offset: 24, blocco: 140, cartella: '1qdrWXSEUeP9DEBiIP6Twq96oxqoEWUtW', file: { 1: '1UXQb7ZZR8-PwNbtwNkq0AWi3yeYHynq_', 141: '1ko1rLEjGT1zIn8VFgXWCDd3_cTKiZkC1', 281: '18PFSCUPAQf6zkj7OHWCJNuuMJmQW_Y46' } },
  },
  quiz: { C: '1U8XHeco0XMOGdOs78YVDnTn4J6r12F2P', B: '1NaM3YqGALmzWoOQQGUR46UjRHmeOFwGu', F: '1Wax1I9nXPCMfWdHvCvZOjKOiCwbs5sqa' },
};
// Pagine: '141-144,146' oppure appendice 'A1-A4'. Insieme di stringhe.
const pagine = s => { const o = new Set(); for (const p of (s || '').split(',').map(x => x.trim()).filter(Boolean)) { const m = p.match(/^([A-Z]?)(\d+)(?:-[A-Z]?(\d+))?$/); if (!m) throw new Error('pagine non valide: ' + p); for (let i = +m[2]; i <= +(m[3] || m[2]); i++) o.add(m[1] + i); } return o; };
let errori = 0;
function step(file) {
  const num = +file.match(/step-(\d+)/)[1];
  const mat = {}; let sub = null; const attesi = [];
  for (const riga of readFileSync(qui + 'sorgenti/' + file, 'utf8').split('\n')) {
    if (!riga.trim() || riga.startsWith('#')) continue;
    if (riga.startsWith('@')) {
      const [testa, titolo, posizione, ripasso] = riga.slice(1).split('|').map(x => x.trim());
      const [m, n] = testa.split(' ');
      mat[m] ??= { m, nome: NOMI[m][0], libro: NOMI[m][1], sottostep: [] };
      sub = { k: m + n, n, titolo, posizione, ripasso, svolto: /^Svolto/.test(posizione), microstep: [] };
      mat[m].sottostep.push(sub);
    } else if (riga.startsWith('=')) attesi.push([sub, riga.slice(1).trim().split(/\s+/).map(Number)]);
    else {
      const [testa, titolo, pag = '', slide = ''] = riga.split('|').map(x => x.trim());
      const [tipo, ms, kn] = testa.split(/\s+/); const [k, n] = kn.split('/').map(Number);
      let micro = sub.microstep.find(x => x.n === ms); if (!micro) sub.microstep.push(micro = { n: ms, schede: [] });
      const m = sub.k[0];
      micro.schede.push({ id: `${m}-${ms}-${k}`, k, n, titolo, tipo, problemi: /^Problemi/.test(titolo), pagine: pag, ...(slide ? { slide } : {}),
        quizFile: `${ms} ${titolo} (scheda ${k} di ${n}).html` });
    }
  }
  // Controllo con i numeri della scheda PDF
  for (const [s, [sp, sr, pp, pr, pt]] of attesi) {
    const sch = s.microstep.flatMap(x => x.schede), P = sch.filter(x => x.tipo === 'P'), R = sch.filter(x => x.tipo === 'R');
    const u = l => new Set(l.flatMap(x => [...pagine(x.pagine)])).size;
    const ho = [P.length, R.length, u(P), u(R), u(sch)];
    const okk = ho.join() === [sp, sr, pp, pr, pt].join();
    if (!okk) errori++;
    console.log((okk ? '  ok  ' : ' DIVERSO ') + s.k + ': ' + ho.join(' ') + (okk ? '' : '  (atteso ' + [sp, sr, pp, pr, pt].join(' ') + ')'));
    for (const mi of s.microstep) { const ks = mi.schede.map(x => x.k).sort((a, b) => a - b).join(); const n = mi.schede[0].n; if (ks !== Array.from({ length: n }, (_, i) => i + 1).join()) { errori++; console.log(' DIVERSO microstep ' + s.k + ' ' + mi.n + ': schede ' + ks + ' di ' + n); } }
  }
  return { formato: 'pacchetto-studio', versione: 1, tipo: 'step', id: 'step-' + num, step: num, titolo: `Step ${num} (UD${num})`, aggiornato: OGGI, risorse: RISORSE, materie: ['C', 'B', 'F'].filter(m => mat[m]).map(m => mat[m]) };
}
mkdirSync(qui + 'pacchetti', { recursive: true });
const indice = [];
for (const f of readdirSync(qui + 'sorgenti').filter(f => /^step-\d+\.txt$/.test(f)).sort()) {
  console.log(f); const p = step(f);
  writeFileSync(qui + 'pacchetti/' + p.id + '.json', JSON.stringify(p)); indice.push(p.id + '.json');
}
// ---------- Piano di studio (dal PDF "Piano di studio Claude (11-11 → 03-12)") ----------
const g = (data, n, voci, nota) => ({ data: '2026-' + data, ...(n ? { n } : {}), voci, ...(nota ? { nota } : {}) });
const v = (k, t) => ({ k, t }); const s = (k, t, d) => ({ k, t, d, speciale: true });
const piano = { formato: 'pacchetto-studio', versione: 1, tipo: 'piano', id: 'piano', titolo: 'Piano di studio 11/11 → 03/12', aggiornato: OGGI, giorniTeoria: 23, giorni: [
  g('11-11', 1, [v('C2.2', 'Liquidi, solidi, cambiamenti di fase e diagrammi di fase'), v('F2.2', 'Dinamica: principi, forze, attrito, piano inclinato')], 'Recupero: schede già pronte.'),
  g('11-12', 2, [v('B2.2', 'Bioenergetica: glicolisi, Krebs, catena respiratoria'), v('C2.3', 'Soluzioni, concentrazioni, proprietà colligative, osmosi (+ molalità, equivalenti, coefficiente di attività)')], 'Schede già pronte. C2.3 con integrazione molalità/equivalenti.'),
  g('11-13', 3, [v('B2.3', 'Ciclo cellulare, mitosi, meiosi, apoptosi (+ cellule staminali)'), v('F2.3', 'Lavoro, energia, quantità di moto, urti')], 'Schede già pronte. B2.3 con cellule staminali. Chiude UD2.'),
  g('11-14', 4, [v('C3.1', 'Reazioni, bilanciamento, moli, stechiometria, reagente limitante'), v('B3.1', 'Replicazione del DNA (+ cromosomi, telomeri, genoma umano, trasferimento genico nei batteri)')], 'B3.1 comprende cromosomi/telomeri, genoma umano e trasferimento genico.'),
  g('11-15', 5, [v('F2.4', 'Corpo rigido: centro di massa, momento torcente, equilibrio, leve'), v('F3.1', 'Statica dei fluidi: pressione, Stevino, Pascal, Archimede')], 'F2.4 chiude la meccanica (corpo rigido e leve).'),
  g('11-16', 6, [v('C3.2', 'Termodinamica (entalpia, entropia, Gibbs) e cinetica (Arrhenius, catalisi)'), v('B3.2', "Il gene, trascrizione, maturazione dell'RNA, miRNA")]),
  g('11-17', 7, [v('C3.3', 'Equilibrio chimico, Le Chatelier, prodotto di solubilità'), v('F3.2', 'Fluidi in moto: continuità, Bernoulli, viscosità, Poiseuille, resistenze')]),
  g('11-18', 8, [v('B3.3', "Traduzione, codice genetico, controllo dell'espressione genica"), v('B3.4', 'Folding, chaperon, ubiquitina-proteasoma')], "Giornata di Biologia (flusso dell'informazione)."),
  g('11-19', 9, [v('F3.3', 'Tensione superficiale e capillarità; temperatura, calore, calorimetria, trasmissione del calore')], 'Giorno leggero: lo spazio libero serve per recuperare ritardi su UD2/UD3.'),
  g('11-20', 10, [v('F3.4', 'Termodinamica: primo e secondo principio, macchine termiche, entropia'), v('C4.1', 'Acidi e basi, Kw, pH, Ka/Kb, poliprotici')]),
  g('11-21', 11, [v('B4.1', 'Genetica mendeliana e sue estensioni, linkage, penetranza, imprinting'), v('F3.5', 'Onde meccaniche e suono, decibel, Doppler')]),
  g('11-22', 12, [s('SIM3', 'Simulazione 3', 'Simulazione a tempo su UD1–UD3 e revisione degli errori.')]),
  g('11-23', 13, [v('C4.2', 'Sali, idrolisi, tamponi, equilibrio acido-base del sangue'), v('B4.2', 'Cariotipo, alberi genealogici, ereditarietà legata al sesso e mitocondriale')]),
  g('11-24', 14, [v('F4.1', 'Elettrostatica: Coulomb, campo, potenziale, conduttori e dielettrici'), v('B4.3', 'Mutazioni geniche e cromosomiche, riparazione del DNA')]),
  g('11-25', 15, [v('C4.3', 'Redox, pile, potenziali, Nernst, redox biologiche'), v('F4.2', 'Corrente, Ohm, circuiti, effetto Joule, condensatori')]),
  g('11-26', 16, [v('B5.1', 'Traffico intracellulare: trasporto nucleare, import mitocondriale, via secretoria, vescicole, autofagia, citoscheletro (approfondimenti)'), v('F4.3', 'Magnetismo, forza di Lorentz, induzione di Faraday-Neumann-Lenz')]),
  g('11-27', 17, [v('C5.1', 'Carbonio, idrocarburi, stereochimica, meccanismi di reazione, aromatici'), v('B6.1', 'Segnalazione cellulare: recettori, proteine G, RTK, Ras-MAPK, insulina, EGF')]),
  g('11-28', 18, [v('C5.2', 'Gruppi funzionali: alcoli, ammine, aldeidi/chetoni, acidi carbossilici e derivati'), v('F4.4', 'Onde elettromagnetiche, radioattività, Lambert-Beer, ottica')]),
  g('11-29', 19, [v('C5.3', 'Biomolecole (amminoacidi, carboidrati, lipidi, nucleotidi) e modificazioni non enzimatiche'), v('B6.2', 'Matrice extracellulare, integrine, caderine e giunzioni (richiamo)')], 'Ultimo giorno di teoria nuova.'),
  g('11-30', 20, [s('VERIFICA', 'Verifica globale', 'Verifica a tempo su UD4–UD7 + schede integrative dei temi mancanti.')]),
  g('12-01', 21, [s('RISERVA1', 'Riserva 1', 'Cuscinetto: recupera lo step più indietro; altrimenti punti deboli della verifica.')]),
  g('12-02', 22, [s('RISERVA2', 'Riserva 2', 'Cuscinetto: recupero e richiami (cenni del syllabus).')]),
  g('12-03', 23, [s('CHIUSURA', 'Chiusura teoria', 'Check-up finale degli argomenti deboli. Teoria chiusa.')]),
  g('12-04', 0, [s('SPRINT-B', 'Sprint Biologia', 'Full immersion di ripasso (schede di raffinamento di Biologia).')]),
  g('12-05', 0, [s('SPRINT-C', 'Sprint Chimica', 'Full immersion di ripasso (schede di raffinamento di Chimica).')]),
  g('12-06', 0, [s('SPRINT-F', 'Sprint Fisica', 'Full immersion di ripasso (schede di raffinamento di Fisica).')]),
  g('12-07', 0, [s('SIM4', 'Simulazione 4', 'Maxi simulazione globale a tempo.')]),
  g('12-08', 0, [s('SIM5', 'Simulazione 5', 'Maxi simulazione globale a tempo.')]),
  g('12-09', 0, [s('RIPOSO', 'Riposo', 'Defaticamento pre-esame.')]),
] };
// Esami: l'app crea i record 'esame' (conto alla rovescia) se non esistono già.
piano.esami = [{ id: 'esame-appello-1', nome: 'Primo appello semestre filtro', data: '2026-12-10' }, { id: 'esame-appello-2', nome: 'Secondo appello semestre filtro', data: '2027-01-10' }];
// Copertura del syllabus ufficiale (dal piano): m, ud, argomento, stato (E = schede esistenti, I = integrazione, N = da creare), step, quando.
const COP = `
C|UD1|Atomo, numero atomico/massa, isotopi, cenni NMR|E|1.1|Dom 25/10
C|UD1|Numeri quantici, orbitali, Pauli, Hund, configurazione elettronica|E|1.1|Dom 25/10
C|UD1|Sistema periodico e proprietà periodiche; regola dell'ottetto|E|1.2|Mer 28/10
C|UD1|Molecole, ioni, massa molecolare, mole, numero di Avogadro, uma|E|2.1|Lun 02/11
C|UD1|Legame covalente (omo/eteropolare, coordinazione), ionico, cenni metallico|E|1.3|Sab 31/10
C|UD1|Ibridazione sp/sp2/sp3, sigma e pi, geometria, angoli, polarità|E|1.3|Sab 31/10
C|UD1|Legame a idrogeno, van der Waals, interazioni idrofobiche|E|1.3|Sab 31/10
C|UD1|Numero di ossidazione e nomenclatura (ossidi, idrossidi, perossidi, acidi, basi, sali)|E|1.2|Mer 28/10
C|UD1|Stato solido: solidi ionici, molecolari, covalenti, metallici|E|2.2|Mer 11/11
C|UD1|Gas: temperatura assoluta, Boyle/Charles/Gay-Lussac, gas perfetti, respirazione|E|2.1|Lun 02/11
C|UD1|Teoria cinetica dei gas, Maxwell-Boltzmann|E|2.1|Lun 02/11
C|UD1|Liquidi: ebollizione, calore di evaporazione, tensione superficiale, pressione di vapore|E|2.2|Mer 11/11
C|UD1|Diagramma di fase acqua vs CO2; evaporazione del sudore e termoregolazione|E|2.2|Mer 11/11
C|UD1|Termodinamica: funzioni di stato, entalpia, entropia, energia libera di Gibbs, spontaneità|N|3.2|Lun 16/11
C|UD2|Miscele omogenee/eterogenee, soluzioni, sospensioni, colloidi, aerosol|E|2.3|Gio 12/11
C|UD2|Acqua solvente, solubilità, elettroliti nei fluidi biologici, legge di Henry|E|2.3|Gio 12/11
C|UD2|Concentrazioni (% p/p, p/v, v/v, molarità, molalità, frazione molare), equivalente, soluzioni non ideali|I|2.3|Gio 12/11
C|UD2|Legge di Dalton, aria inspirata ed espirata|E|2.1|Lun 02/11
C|UD2|Proprietà colligative: Raoult, ebullioscopia, crioscopia, pressione osmotica|E|2.3|Gio 12/11
C|UD2|Van't Hoff, osmolarità/osmolalità, tonicità, soluzione fisiologica e glucosata, emolisi, edema|E|2.3|Gio 12/11
C|UD3|Reazioni chimiche: conservazione di massa/energia/carica, bilanciamento, stechiometria|N|3.1|Sab 14/11
C|UD3|Cinetica: ordine, molecolarità, Arrhenius, urti efficaci, energia di attivazione, catalisi/enzimi|N|3.2|Lun 16/11
C|UD3|Equilibrio chimico: K, azione di massa, ΔG, Le Chatelier, Q, effetto di T, equilibri multipli|N|3.3|Mar 17/11
C|UD3|Equilibrio eterogeneo: prodotto di solubilità, ione in comune, calcoli renali|N|3.3|Mar 17/11
C|UD4|Teorie acido-base (Arrhenius, Brønsted-Lowry, Lewis), Kw, pH/pOH, Ka/Kb, pKa|N|4.1|Ven 20/11
C|UD4|pH di acidi/basi forti e deboli, poliprotici, indicatori, reazioni acido-base|N|4.1|Ven 20/11
C|UD4|Sali e idrolisi; solubilità e pH (ossalato e fosfato di calcio, urato)|N|4.2|Lun 23/11
C|UD4|Tamponi, Henderson-Hasselbalch, efficienza|N|4.2|Lun 23/11
C|UD4|Equilibrio acido-base biologico: pH del sangue, tamponi, acidosi e alcalosi|N|4.2|Lun 23/11
C|UD4|Redox: pila, anodo/catodo, potenziali standard, Nernst, ΔG/E, redox biologiche, Fenton/Haber-Weiss|N|4.3|Mer 25/11
C|UD5|Carbonio, ibridazione, idrocarburi saturi/insaturi/ciclici, nomenclatura IUPAC|N|5.1|Ven 27/11
C|UD5|Stereochimica: enantiomeri, diastereoisomeri, epimeri, racemi, R/S, Fischer, potere rotatorio|N|5.1|Ven 27/11
C|UD5|Rottura omolitica/eterolitica, radicali, carbocationi, effetto induttivo, SN1/SN2, eliminazione|N|5.1|Ven 27/11
C|UD5|Alcani, cicloalcani, alcheni, dieni coniugati, addizione elettrofila|N|5.1|Ven 27/11
C|UD5|Aromatici: benzene, Hückel, eterociclici (purine/pirimidine), sostituzione elettrofila, tossicità|N|5.1|Ven 27/11
C|UD6|Alcoli, tioli, fenoli, eteri, tioeteri, epossidi|N|5.2|Sab 28/11
C|UD6|Ammine: basicità, alchilazione, nitrosammine, colina|N|5.2|Sab 28/11
C|UD6|Aldeidi e chetoni: addizione nucleofila, aldolica, emiacetali, immine, tautomeria, chinoni|N|5.2|Sab 28/11
C|UD6|Acidi carbossilici e derivati (anidridi, esteri, tioesteri, ammidi, acilfosfati) e reazioni|N|5.2|Sab 28/11
C|UD7|Amminoacidi, pI, legame peptidico, livelli strutturali, ponti disolfuro|N|5.3|Dom 29/11
C|UD7|Carboidrati: monosaccaridi, anomeri, mutarotazione, Maillard, legame glicosidico, polisaccaridi|N|5.3|Dom 29/11
C|UD7|Lipidi: acidi grassi, trigliceridi, fosfolipidi, sfingolipidi, colesterolo e derivati|N|5.3|Dom 29/11
C|UD7|Nucleotidi, ATP, NAD+/FAD, legame fosfodiestere, DNA e RNA|N|5.3|Dom 29/11
C|UD7|Modificazioni non enzimatiche: deaminazione della citosina, radicale ossidrilico, glutatione, tocoferolo, carotenoidi|N|5.3|Dom 29/11
B|UD1|Albero della vita, teoria cellulare, proprietà della materia vivente|E|2.1|Mar 03/11
B|UD1|Virus: struttura, classi, ciclo litico/lisogenico, ciclo animale, retrovirus|E|1.3|Sab 31/10
B|UD1|Procarioti: parete, capsula, fimbrie, flagelli, Gram+/Gram−, eubatteri e archeobatteri|E|2.1|Mar 03/11
B|UD1|Trasferimento genico orizzontale: trasformazione, coniugazione, trasduzione|I|3.1|Sab 14/11
B|UD1|Eucariote: endomembrane, endosimbiosi, pluricellularità|E|2.1|Mar 03/11
B|UD1|Zuccheri, lipidi, amminoacidi, proteine (domini, siti attivi)|E|1.1|Lun 26/10
B|UD1|Enzimi (classi) e modificazioni post-traduzionali|E|1.2|Gio 29/10
B|UD1|Nucleotidi, acidi nucleici, Watson-Crick, RNA codificanti/non codificanti; anabolismo/catabolismo|E|1.3|Sab 31/10
B|UD2|Cromosomi eucariotici lineari, DNA centromerico e telomerico|I|3.1|Sab 14/11
B|UD2|Cromatina: nucleosomi, istoni, eucromatina/eterocromatina, metilazione, epigenetica, condensine|E|1.3|Sab 31/10
B|UD2|Genoma umano: famiglie geniche, ripetute in tandem, LINE/SINE, retrovirus endogeni, elementi mobili|I|3.1|Sab 14/11
B|UD3|Replicazione procarioti/eucarioti, forcella, polimerasi, Okazaki, telomerasi, senescenza|N|3.1|Sab 14/11
B|UD3|Il gene: policistronico/monocistronico, promotori, elementi in cis|N|3.2|Lun 16/11
B|UD3|Trascrizione nei procarioti, operone Lac|N|3.2|Lun 16/11
B|UD3|Trascrizione negli eucarioti: Pol I/II/III, fattori generali, TATA, enhancer/silencer, recettori steroidei|N|3.2|Lun 16/11
B|UD3|Maturazione RNA (capping, poliadenilazione, splicing anche alternativo), ribozimi, editing; rRNA e tRNA|N|3.2|Lun 16/11
B|UD3|Stabilità dell'mRNA, miRNA, RNA interference|N|3.2|Lun 16/11
B|UD3|Traduzione: codice genetico, aminoacil-tRNA, ribosomi, fattori, UTR regolative|N|3.3|Mer 18/11
B|UD3|Controllo dell'espressione negli eucarioti (trascrizionale … post-traduzionale)|N|3.3|Mer 18/11
B|UD3|Folding, chaperon, errori di ripiegamento; degradazione ubiquitina-proteasoma|N|3.4|Mer 18/11
B|UD4|Mutazioni geniche e cromosomiche, espansione di ripetute, riparazione del DNA|N|4.3|Mar 24/11
B|UD4|Alleli, Mendel, dominanza incompleta, codominanza, AB0, pleiotropia, epistasi, associazione, mappe|N|4.1|Sab 21/11
B|UD4|Penetranza, espressività, caratteri poligenici, imprinting genomico|N|4.1|Sab 21/11
B|UD4|Cariotipo, bandeggio, aneuploidia/poliploidia, traslocazioni, trisomia 21|N|4.2|Lun 23/11
B|UD4|Alberi genealogici: autosomica, legata a X, a Y, mitocondriale|N|4.2|Lun 23/11
B|UD5|Membrane: mosaico fluido, glicocalice, asimmetria|E|2.1|Mar 03/11
B|UD5|Trasporto di membrana: osmosi, diffusione, canali, trasportatori, ATPasi, ABC|E|2.1|Mar 03/11
B|UD5|Potenziale di membrana e potenziale d'azione|I|5.1|Gio 26/11
B|UD5|Smistamento delle proteine e segnali di indirizzamento|I|5.1|Gio 26/11
B|UD5|Nucleo: pori, nucleoporine, trasporto nucleare (NLS/NES, importine, Ran), trasporto degli RNA|I|5.1|Gio 26/11
B|UD5|Mitocondri: struttura, genoma, respirazione, network, import TOM/TIM/SAM/OXA|I|5.1|Gio 26/11
B|UD5|Perossisomi: funzioni, biogenesi, Zellweger|E|2.1|Mar 03/11
B|UD5|Via secretoria: RE, Golgi, SRP, traslocone, glicosilazione, calnexina, UPR/ERAD, fibrosi cistica|I|5.1|Gio 26/11
B|UD5|Traffico vescicolare: rivestimenti, NSF/SNARE/RAB, fosfoinositidi|I|5.1|Gio 26/11
B|UD5|Endocitosi (transferrina, LDL, EGF), endosomi, lisosomi, M6P, transcitosi, fagocitosi|I|5.1|Gio 26/11
B|UD5|Autofagia (macro, micro, mediata da chaperon), mitofagia|I|5.1|Gio 26/11
B|UD5|Citoscheletro: microtubuli, dineine/chinesine, actina, miosina, sarcomero, Rho, filamenti intermedi|I|5.1|Gio 26/11
B|UD6|Matrice extracellulare, integrine, meccanotrasduzione, fibronectina|I|6.1|Ven 27/11
B|UD6|Caderine, CAM, giunzioni cellulari|I|6.1|Ven 27/11
B|UD6|Tipi di segnalazione, recettori di membrana/intracellulari, NO e ormoni lipidici|N|6.1|Ven 27/11
B|UD6|Recettori-canale, GPCR, proteine G, GEF/GAP, secondi messaggeri, desensitizzazione|N|6.1|Ven 27/11
B|UD6|Recettori tirosin-chinasici, Ras-MAPK, oncogeni, insulina, EGF, fosfoinositidi|N|6.1|Ven 27/11
B|UD7|Ciclo cellulare, checkpoint, cicline e CDK|E|2.3|Ven 13/11
B|UD7|Punto di restrizione, Rb/E2F, p53, proto-oncogeni, oncosoppressori, virus oncogeni|E|2.3|Ven 13/11
B|UD7|Mitosi: fasi, fuso, cinetocore, APC/C, securina, citodieresi, mitosi asimmetrica|E|2.3|Ven 13/11
B|UD7|Meiosi, crossing-over, aneuploidia, gametogenesi|E|2.3|Ven 13/11
B|UD7|Cellule staminali (concetto)|I|2.3|Ven 13/11
B|UD7|Morte cellulare: necrosi, apoptosi, caspasi, MOMP, BCL2, recettori di morte|E|2.3|Ven 13/11
F|UD1|Notazione scientifica, grandezze, SI, conversioni, ordine di grandezza, estensive/intensive|E|1.1|Mar 27/10
F|UD1|Funzioni trigonometriche, vettori, componenti, somma, prodotto scalare e vettoriale|E|1.2|Ven 30/10
F|UD2|Cinematica: MRU, MRUA, caduta libera, parabolico, circolare uniforme, accelerazione centripeta|E|2.1|Mer 04/11
F|UD2|Dinamica: tre principi, peso, attrito, tensione, forze elastiche/Hooke, equilibrio traslazionale|E|2.2|Mer 11/11
F|UD2|Lavoro, potenza, energia cinetica/potenziale, forze conservative, conservazione dell'energia|E|2.3|Ven 13/11
F|UD2|Quantità di moto, impulso, conservazione|E|2.3|Ven 13/11
F|UD2|Centro di massa e suo moto|I|2.4|Dom 15/11
F|UD2|Corpo rigido, momento torcente, equilibrio rotazionale, leve nel corpo umano|I|2.4|Dom 15/11
F|UD3|Pressione e densità; fluidi vs solidi|N|3.1|Dom 15/11
F|UD3|Stevino, Pascal, Archimede, galleggiamento, Torricelli, manometro|N|3.1|Dom 15/11
F|UD3|Portata, continuità, Bernoulli, stenosi e aneurisma, moto laminare/turbolento|N|3.2|Mar 17/11
F|UD3|Viscosità, profilo parabolico, Poiseuille, resistenze idrauliche in serie e parallelo|N|3.2|Mar 17/11
F|UD3|Tensione superficiale, capillarità, legge di Laplace|N|3.3|Gio 19/11
F|UD4|Onde meccaniche: oscillatore armonico, f, T, ω, λ, v, onda armonica, trasversali/longitudinali|N|3.5|Sab 21/11
F|UD4|Sovrapposizione e interferenza; energia, potenza, intensità, inverso del quadrato|N|3.5|Sab 21/11
F|UD4|Onde acustiche, velocità del suono, livello in decibel, effetto Doppler|N|3.5|Sab 21/11
F|UD5|Sistema/ambiente, variabili e funzioni di stato, temperatura, gas perfetti|N|3.3|Gio 19/11
F|UD5|Calore, capacità termica, calore specifico, cambiamenti di stato, calore latente, calorimetria|N|3.3|Gio 19/11
F|UD5|Trasmissione del calore: conduzione, convezione, irraggiamento|N|3.3|Gio 19/11
F|UD5|Primo principio, energia interna, trasformazioni, reversibilità|N|3.4|Ven 20/11
F|UD5|Secondo principio, cicli, macchine termiche, rendimento, Carnot, entropia|N|3.4|Ven 20/11
F|UD6|Carica, Coulomb, campo elettrico, linee di forza, moto in campo uniforme|N|4.1|Mar 24/11
F|UD6|Energia potenziale e potenziale elettrico, differenza di potenziale|N|4.1|Mar 24/11
F|UD6|Conduttori e dielettrici: induzione elettrostatica, polarizzazione|N|4.1|Mar 24/11
F|UD6|Corrente continua, generatore, leggi di Ohm, resistività, effetto Joule, serie/parallelo|N|4.2|Mer 25/11
F|UD6|Capacità, condensatore piano, dielettrico, energia, serie/parallelo|N|4.2|Mer 25/11
F|UD6|Campo magnetico (Oersted), forza di Lorentz su carica e filo, moto circolare|N|4.3|Gio 26/11
F|UD6|Induzione: flusso, fem, legge di Faraday-Neumann-Lenz, correnti indotte|N|4.3|Gio 26/11
F|UD7|Onde elettromagnetiche e spettro|N|4.4|Sab 28/11
F|UD7|Fotone (E = hf), assorbimento e legge di Lambert-Beer|N|4.4|Sab 28/11
F|UD7|Radioattività: decadimenti α/β/γ, attività, emivita; radiazioni ionizzanti e non|N|4.4|Sab 28/11
F|UD7|Ottica: riflessione, rifrazione, indice di rifrazione, lenti sottili e punti coniugati|N|4.4|Sab 28/11`;
piano.copertura = COP.trim().split('\n').map(r => { const [m, ud, a, st, step, q] = r.split('|'); return { m, ud, a, stato: st, k: m + step, quando: q }; });
writeFileSync(qui + 'pacchetti/piano.json', JSON.stringify(piano)); indice.push('piano.json');
console.log('  copertura syllabus: ' + piano.copertura.length + ' argomenti');

// ---------- Piano di raffinamento 10/12 → 10/01 (dal PDF "Piano di raffinamento Claude") ----------
const T = {}; for (const g of piano.giorni) for (const x of g.voci) if (!x.speciale) T[x.k] = x.t;
Object.assign(T, { C1_1: 0 });
const TS = { 'C1.1': 'Atomo, isotopi, orbitali e configurazione elettronica', 'B1.1': 'Acqua, gruppi funzionali, carboidrati e lipidi', 'F1.1': 'Grandezze, SI, conversioni, analisi dimensionale, errori',
  'C1.2': 'Tavola periodica, proprietà periodiche, numero di ossidazione e nomenclatura', 'B1.2': 'Amminoacidi, proteine ed enzimi', 'F1.2': 'Vettori, trigonometria, prodotto scalare e vettoriale',
  'C1.3': 'Legame chimico, ibridazione, geometria e interazioni deboli', 'B1.3': 'Acidi nucleici, cromatina e virus', 'F2.1': 'Cinematica', 'C2.1': 'Stati della materia e gas', 'B2.1': 'La cellula: procarioti, eucarioti, membrane, organelli' };
const tt = k => TS[k] || T[k];
// Appelli: 10/12/2026 e 10/01/2027 (date date dall'utente l'11/11). Il raffinamento parte il giorno dopo il primo appello.
const RAF = [['12-11', 'C1.1 B1.1 F1.1'], ['12-12', 'C1.2 B1.2 F1.2'], ['12-13', 'C1.3 B1.3 F2.1'], ['12-14', 'C2.1 B2.1 F2.2'], ['12-15', 'C2.2 B2.2 F2.3'], ['12-16', 'C2.3 B2.3 F2.4'],
  ['12-17', 'C3.1 B3.1 F3.1'], ['12-18', 'C3.2 B3.2 F3.2'], ['12-19', 'C3.3 B3.3 F3.3'], ['12-20', 'C4.1 B3.4 F3.4'], ['12-21', 'C4.2 B4.1 F3.5'], ['12-22', 'C4.3 B4.2 F4.1'],
  ['12-23', 'C5.1 B4.3 F4.2'], ['12-24', 'C5.2 B5.1 F4.3'], ['12-25', 'C5.3 B6.1 F4.4'], ['12-26', 'B6.2']];
const SPEC = [['12-27', 'Secondo giro Chimica', 'Errori ricorrenti e calcoli (moli, gas, pH, tamponi, Nernst) + organica e biomolecole.'],
  ['12-28', 'Secondo giro Biologia', 'Genetica molecolare (replicazione, trascrizione, traduzione, controllo).'], ['12-29', 'Secondo giro Biologia', 'Cellula, traffico, segnalazione, ciclo cellulare, genetica mendeliana.'],
  ['12-30', 'Secondo giro Fisica', 'Meccanica, fluidi e termodinamica (problemi).'], ['12-31', 'Secondo giro Fisica', 'Elettromagnetismo, onde, radiazioni (problemi). Giorno più leggero.'],
  ['01-01', 'Simulazione globale 1', 'A tempo.'], ['01-02', 'Revisione simulazione 1', 'Rifai le schede sbagliate.'], ['01-03', 'Simulazione globale 2', 'A tempo.'], ['01-04', 'Revisione simulazione 2', 'Rifai le schede sbagliate.'],
  ['01-05', 'Sprint punti deboli', 'Le tre materie, solo ciò che è ancora sbagliato.'], ['01-06', 'Simulazione globale 3', 'A tempo.'], ['01-07', 'Revisione simulazione 3', 'Rifai le schede sbagliate.'],
  ['01-08', 'Ripasso formule e schemi', 'Tabelle di Chimica, Biologia, Fisica. Ripasso leggero.'], ['01-09', 'Riposo pre-appello', 'Defaticamento: niente teoria nuova.']];
let ng = 0;
const raff = { formato: 'pacchetto-studio', versione: 1, tipo: 'piano', id: 'piano-raffinamento', modo: 'raffinamento', titolo: 'Piano di raffinamento 11/12 → 09/01', aggiornato: OGGI, giorniTeoria: 30,
  nota: 'Tra il primo appello (10/12) e il secondo (10/01). Fase 1 · PRIORITÀ: rifai le schede da rifare e rileggi le pagine. Fase 2 · RAFFINA: schede di raffinamento.',
  giorni: [
    ...RAF.map(([d, ks]) => ({ data: '2026-' + d, n: ++ng, voci: ks.split(' ').map(k => ({ k, t: tt(k) })) })),
    ...SPEC.map(([d, t, desc], i) => ({ data: (d.startsWith('01') ? '2027-' : '2026-') + d, n: ++ng, voci: [{ k: 'R' + i, t, d: desc, speciale: true }] })),
  ] };
for (const g of raff.giorni) for (const v of g.voci) if (!v.t) throw new Error('titolo mancante ' + v.k);
writeFileSync(qui + 'pacchetti/piano-raffinamento.json', JSON.stringify(raff)); indice.push('piano-raffinamento.json');
writeFileSync(qui + 'pacchetti/indice.json', JSON.stringify(indice));
console.log(errori ? 'ERRORI: ' + errori : 'TUTTO OK · ' + indice.join(', '));
process.exit(errori ? 1 : 0);
