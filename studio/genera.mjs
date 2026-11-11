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
const pagine = s => { const o = new Set(); for (const p of s.split(',').map(x => x.trim()).filter(Boolean)) { const [a, b] = p.split('-').map(Number); for (let i = a; i <= (b || a); i++) o.add(i); } return o; };
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
      const [testa, titolo, pag, slide] = riga.split('|').map(x => x.trim());
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
writeFileSync(qui + 'pacchetti/piano.json', JSON.stringify(piano)); indice.push('piano.json');
writeFileSync(qui + 'pacchetti/indice.json', JSON.stringify(indice));
console.log(errori ? 'ERRORI: ' + errori : 'TUTTO OK · ' + indice.join(', '));
process.exit(errori ? 1 : 0);
