// 07-genesercizi.ts — Quiz Studio Q3 (v0.24): esercizi numerici generati a regole, offline.
//
// Ogni modello ha: dati casuali entro intervalli realistici, la formula del risultato e 4+ distrattori
// calcolati con formule che riproducono un errore preciso (unità non convertite, rapporto invertito,
// fattore dimenticato…), ciascuno con il suo «perché è sbagliato». Idee da Moodle «calculated multichoice».
// Le domande generate hanno id fisso per modello ('g-<modello>'): le statistiche (record statq) si
// accumulano per modello e, per i distrattori, per TIPO di errore (chiave dk) — è la base di Q4.
// Per aggiungere un modello: un oggetto in MODELLI (m = C/B/F, micro = microstep dove compare).

type V = Record<string, any>;
interface ModelloEs {
  id: string; m: 'C' | 'B' | 'F'; micro: string[]; lv: string; titolo: string;
  dati: () => V; r: (v: V) => number; u: string | ((v: V) => string);
  q: (v: V) => string;
  d: [string, (v: V, r: number) => number, string][];
  passi: (v: V, r: number) => string[];
}

const Generatori = (() => {
  const rnd = (a: number, b: number, p = 1) => { const n = Math.round((b - a) / p); return +(a + p * Math.floor(Math.random() * (n + 1))).toFixed(6); };
  const scegli = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
  /** Numero all'italiana con 3 cifre significative; notazione scientifica per valori molto grandi o piccoli. */
  function fN(x: number, cifre = 3): string {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) {
      let e = Math.floor(Math.log10(a)), m = +(x / Math.pow(10, e)).toPrecision(cifre);
      if (Math.abs(m) >= 10) { m = +(m / 10).toPrecision(cifre); e++; }
      return String(m).replace('.', ',') + ' × 10^{' + e + '}';
    }
    return String(+x.toPrecision(cifre)).replace('.', ',');
  }
  const G = 9.81, NA = 6.02e23;
  const rad = (g: number) => g * Math.PI / 180;

  const MODELLI: ModelloEs[] = [
    // ---------------- CHIMICA ----------------
    { id: 'c-moli', m: 'C', micro: ['3.1.5', '3.1.6'], lv: 'Problema', titolo: 'Moli da massa',
      dati: () => { const [f, M] = scegli([['H₂O', 18.0], ['NaCl', 58.5], ['CO₂', 44.0], ['glucosio (C₆H₁₂O₆)', 180], ['NaOH', 40.0], ['CaCO₃', 100]] as [string, number][]); return { f, M, m: rnd(5, 250, 5) }; },
      r: v => v.m / v.M, u: 'mol',
      q: v => 'Quante moli ci sono in ' + fN(v.m) + ' g di ' + v.f + ' (M = ' + fN(v.M) + ' g/mol)?',
      d: [['molt', v => v.m * v.M, 'Hai moltiplicato massa e massa molare: n = m / M.'],
        ['inv', v => v.M / v.m, 'Hai invertito il rapporto: è la massa divisa per la massa molare.'],
        ['milli', (v, r) => r * 1000, 'Hai moltiplicato per 1000 come per convertire in millimoli.'],
        ['ordine', (v, r) => r / 10, 'Errore di un ordine di grandezza nei conti.']],
      passi: (v, r) => ['Formula: n = m / M', 'Sostituisco: n = ' + fN(v.m) + ' g ÷ ' + fN(v.M) + ' g/mol', 'Risultato: n = ' + fN(r) + ' mol'] },
    { id: 'c-particelle', m: 'C', micro: ['3.1.5'], lv: 'Problema', titolo: 'Molecole e atomi da moli',
      dati: () => ({ f: scegli(['O₂', 'N₂', 'H₂', 'Cl₂']), n: rnd(0.1, 5, 0.1) }),
      r: v => v.n * NA, u: 'molecole',
      q: v => 'Quante molecole ci sono in ' + fN(v.n) + ' mol di ' + v.f + '?',
      d: [['atomi', (v, r) => 2 * r, 'Hai contato gli atomi: ogni molecola di ' + 'gas biatomico ha 2 atomi, ma la domanda chiede le molecole.'],
        ['div', v => v.n / NA, 'Hai diviso per il numero di Avogadro invece di moltiplicare.'],
        ['esp', (v, r) => r / 10, 'Hai usato 6,02 × 10^{22}: l\'esponente di Avogadro è 23.'],
        ['inv', v => NA / v.n, 'Hai diviso Avogadro per le moli: N = n · N_{A}.']],
      passi: (v, r) => ['Formula: N = n · N_{A}', 'N = ' + fN(v.n) + ' mol × 6,02 × 10^{23} mol^{-1}', 'Risultato: ' + fN(r) + ' molecole'] },
    { id: 'c-stechio', m: 'C', micro: ['3.1.6', '3.1.7'], lv: 'Problema', titolo: 'Rapporti stechiometrici',
      dati: () => { const [eq, A, ca, B, cb] = scegli([['N₂ + 3 H₂ → 2 NH₃', 'H₂', 3, 'NH₃', 2], ['2 H₂ + O₂ → 2 H₂O', 'O₂', 1, 'H₂O', 2], ['CH₄ + 2 O₂ → CO₂ + 2 H₂O', 'O₂', 2, 'CO₂', 1], ['2 KClO₃ → 2 KCl + 3 O₂', 'KClO₃', 2, 'O₂', 3], ['C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O', 'C₃H₈', 1, 'H₂O', 4]] as [string, string, number, string, number][]); return { eq, A, ca, B, cb, n: rnd(0.5, 12, 0.5) }; },
      r: v => v.n * v.cb / v.ca, u: 'mol',
      q: v => 'Per la reazione ' + v.eq + ', quante moli di ' + v.B + ' si ottengono da ' + fN(v.n) + ' mol di ' + v.A + ' (l\'altro reagente in eccesso)?',
      d: [['uguale', v => v.n, 'Hai ignorato i coefficienti: il rapporto in moli è quello dei coefficienti.'],
        ['inv', v => v.n * v.ca / v.cb, 'Hai invertito il rapporto dei coefficienti.'],
        ['solo', v => v.n * v.cb, 'Hai moltiplicato per il coefficiente del prodotto senza dividere per quello del reagente.'],
        ['div', v => v.n / v.ca, 'Hai diviso per il coefficiente del reagente senza moltiplicare per quello del prodotto.']],
      passi: (v, r) => ['Rapporto molare: ' + v.cb + ' mol ' + v.B + ' / ' + v.ca + ' mol ' + v.A, 'n(' + v.B + ') = ' + fN(v.n) + ' × ' + v.cb + ' / ' + v.ca, 'Risultato: ' + fN(r) + ' mol'] },
    { id: 'c-molarita', m: 'C', micro: ['2.3.3'], lv: 'Problema', titolo: 'Molarità',
      dati: () => ({ n: rnd(0.05, 2, 0.05), V: scegli([100, 200, 250, 500, 750, 1500, 2000]) }),
      r: v => v.n / (v.V / 1000), u: 'M',
      q: v => 'Si sciolgono ' + fN(v.n) + ' mol di soluto fino a ' + v.V + ' mL di soluzione. Molarità?',
      d: [['ml', v => v.n / v.V, 'Non hai convertito i mL in L.'],
        ['molt', v => v.n * v.V / 1000, 'Hai moltiplicato moli e volume: M = n / V.'],
        ['inv', v => (v.V / 1000) / v.n, 'Hai invertito il rapporto: è moli diviso litri.'],
        ['cento', v => v.n / v.V * 100, 'Conversione sbagliata: 1 L = 1000 mL, non 100.']],
      passi: (v, r) => ['Volume in litri: ' + v.V + ' mL = ' + fN(v.V / 1000) + ' L', 'Formula: M = n / V', 'M = ' + fN(v.n) + ' / ' + fN(v.V / 1000) + ' = ' + fN(r) + ' M'] },
    { id: 'c-molarita-m', m: 'C', micro: ['2.3.3'], lv: 'Problema', titolo: 'Molarità da massa',
      dati: () => { const [f, M] = scegli([['NaCl', 58.5], ['NaOH', 40.0], ['KCl', 74.6], ['glucosio', 180]] as [string, number][]); return { f, M, m: rnd(2, 90, 1), V: scegli([0.25, 0.5, 1, 2]) }; },
      r: v => v.m / v.M / v.V, u: 'M',
      q: v => fN(v.m) + ' g di ' + v.f + ' (M = ' + fN(v.M) + ' g/mol) in ' + fN(v.V) + ' L di soluzione. Molarità?',
      d: [['massa', v => v.m / v.V, 'Hai usato la massa al posto delle moli (manca ÷ M).'],
        ['molt', v => v.m / v.M * v.V, 'Hai moltiplicato per il volume invece di dividere.'],
        ['mm', v => v.m * v.M / v.V, 'Hai moltiplicato la massa per la massa molare: n = m / M.'],
        ['ml', v => v.m / v.M / (v.V * 1000), 'Hai trasformato i litri in mL al denominatore.']],
      passi: (v, r) => ['Moli: n = ' + fN(v.m) + ' / ' + fN(v.M) + ' = ' + fN(v.m / v.M) + ' mol', 'M = n / V = ' + fN(v.m / v.M) + ' / ' + fN(v.V), 'Risultato: ' + fN(r) + ' M'] },
    { id: 'c-diluizione', m: 'C', micro: ['2.3.4'], lv: 'Problema', titolo: 'Diluizione',
      dati: () => { const V1 = scegli([10, 20, 25, 50, 100]); return { C1: rnd(0.5, 6, 0.5), V1, V2: V1 * scegli([2, 4, 5, 8, 10]) }; },
      r: v => v.C1 * v.V1 / v.V2, u: 'M',
      q: v => fN(v.V1) + ' mL di una soluzione ' + fN(v.C1) + ' M vengono diluiti con acqua fino a un volume finale di ' + fN(v.V2) + ' mL. Concentrazione finale?',
      d: [['inv', v => v.C1 * v.V2 / v.V1, 'Hai invertito i volumi: diluendo la concentrazione deve diminuire.'],
        ['somma', v => v.C1 * v.V1 / (v.V1 + v.V2), 'Hai sommato i volumi: ' + 'il volume finale è già quello indicato.'],
        ['uguale', v => v.C1, 'La concentrazione cambia: le moli restano, il volume aumenta.'],
        ['diff', v => v.C1 * v.V1 / (v.V2 - v.V1), 'Hai usato solo l\'acqua aggiunta come volume finale.']],
      passi: (v, r) => ['Le moli di soluto non cambiano: C₁V₁ = C₂V₂', 'C₂ = ' + fN(v.C1) + ' × ' + fN(v.V1) + ' / ' + fN(v.V2), 'Risultato: ' + fN(r) + ' M'] },
    { id: 'c-crioscopia', m: 'C', micro: ['2.3.5', '2.3.6'], lv: 'Problema', titolo: 'Abbassamento crioscopico',
      dati: () => { const [f, i] = scegli([['glucosio', 1], ['NaCl', 2], ['CaCl₂', 3], ['KNO₃', 2], ['urea', 1]] as [string, number][]); return { f, i, mo: rnd(0.1, 2, 0.1) }; },
      r: v => v.i * 1.86 * v.mo, u: '°C',
      q: v => 'Di quanto si abbassa il punto di congelamento dell\'acqua per una soluzione ' + fN(v.mo) + ' m di ' + v.f + ' (K_{cr} = 1,86 °C·kg/mol, dissociazione completa)?',
      d: [['noi', v => 1.86 * v.mo, 'Hai dimenticato il fattore di van \'t Hoff i.'],
        ['keb', v => v.i * 0.512 * v.mo, 'Hai usato la costante ebullioscopica (0,512) invece della crioscopica.'],
        ['nok', v => v.i * v.mo, 'Hai dimenticato la costante crioscopica.'],
        ['divi', v => 1.86 * v.mo / v.i, 'Hai diviso per i invece di moltiplicare.']],
      passi: (v, r) => ['ΔT = i · K_{cr} · m', 'i = ' + v.i + ' (' + v.f + ')', 'ΔT = ' + v.i + ' × 1,86 × ' + fN(v.mo) + ' = ' + fN(r) + ' °C'] },
    { id: 'c-vanthoff', m: 'C', micro: ['2.3.6'], lv: 'Applicativo', titolo: 'Fattore di van \'t Hoff',
      dati: () => { const [f, i, at] = scegli([['NaCl', 2, 2], ['CaCl₂', 3, 3], ['Na₂SO₄', 3, 7], ['K₃PO₄', 4, 8], ['AlCl₃', 4, 4], ['MgSO₄', 2, 6], ['glucosio', 1, 24]] as [string, number, number][]); return { f, i, at }; },
      r: v => v.i, u: '',
      q: v => 'Qual è il fattore di van \'t Hoff ideale di ' + v.f + ' in acqua?',
      d: [['atomi', v => v.at, 'Hai contato gli atomi: contano gli ioni (o le molecole) liberati in soluzione.'],
        ['uno', () => 1, 'i = 1 vale per i soluti che non si dissociano.'],
        ['piu1', v => v.i + 1, 'Hai contato uno ione in più di quelli che si formano.'],
        ['meno1', v => Math.max(1, v.i - 1), 'Hai contato uno ione in meno: conta anche i ioni poliatomici come uno ciascuno.']],
      passi: v => ['Conta le particelle in soluzione per formula unitaria', v.f + ' → ' + v.i + (v.i === 1 ? ' particella (non si dissocia)' : ' ioni'), 'i = ' + v.i] },
    { id: 'c-osmotica', m: 'C', micro: ['2.3.7'], lv: 'Problema', titolo: 'Pressione osmotica',
      dati: () => { const [f, i] = scegli([['glucosio', 1], ['NaCl', 2], ['CaCl₂', 3]] as [string, number][]); return { f, i, M: rnd(0.05, 0.5, 0.05), t: scegli([25, 27, 37]) }; },
      r: v => v.i * v.M * 0.0821 * (v.t + 273), u: 'atm',
      q: v => 'Pressione osmotica di una soluzione ' + fN(v.M) + ' M di ' + v.f + ' a ' + v.t + ' °C (R = 0,0821 L·atm/(mol·K))?',
      d: [['celsius', v => v.i * v.M * 0.0821 * v.t, 'Hai usato i gradi Celsius: T va in kelvin.'],
        ['noi', v => v.M * 0.0821 * (v.t + 273), 'Hai dimenticato il fattore di van \'t Hoff.'],
        ['r', v => v.i * v.M * 8.314 * (v.t + 273), 'Hai usato R = 8,314, che dà il risultato in Pa con M in mol/m³, non in atm.'],
        ['div', v => v.i * v.M / (0.0821 * (v.t + 273)), 'Hai diviso per RT invece di moltiplicare.']],
      passi: (v, r) => ['π = i · M · R · T, con T in kelvin', 'T = ' + v.t + ' + 273 = ' + (v.t + 273) + ' K', 'π = ' + v.i + ' × ' + fN(v.M) + ' × 0,0821 × ' + (v.t + 273) + ' = ' + fN(r) + ' atm'] },
    { id: 'c-gibbs', m: 'C', micro: ['3.2.4'], lv: 'Problema', titolo: 'ΔG = ΔH − TΔS',
      dati: () => ({ H: scegli([-1, 1]) * rnd(20, 180, 5), S: scegli([-1, 1]) * rnd(40, 300, 10), t: scegli([0, 25, 100, 227, 527]) }),
      r: v => v.H - (v.t + 273) * v.S / 1000, u: 'kJ/mol',
      q: v => 'ΔH = ' + fN(v.H) + ' kJ/mol, ΔS = ' + fN(v.S) + ' J/(mol·K), t = ' + v.t + ' °C. Quanto vale ΔG?',
      d: [['joule', v => v.H - (v.t + 273) * v.S, 'Non hai convertito ΔS da J in kJ.'],
        ['celsius', v => v.H - v.t * v.S / 1000, 'Hai usato la temperatura in °C: va in kelvin.'],
        ['segno', v => v.H + (v.t + 273) * v.S / 1000, 'Segno sbagliato: ΔG = ΔH − TΔS.'],
        ['soloh', v => -(v.t + 273) * v.S / 1000, 'Hai dimenticato ΔH.']],
      passi: (v, r) => ['T = ' + v.t + ' + 273 = ' + (v.t + 273) + ' K; ΔS = ' + fN(v.S / 1000) + ' kJ/(mol·K)', 'ΔG = ' + fN(v.H) + ' − ' + (v.t + 273) + ' × (' + fN(v.S / 1000) + ')', 'Risultato: ΔG = ' + fN(r) + ' kJ/mol (' + (r < 0 ? 'spontanea' : 'non spontanea') + ')'] },
    { id: 'c-tinversione', m: 'C', micro: ['3.2.4'], lv: 'Problema', titolo: 'Temperatura di inversione',
      dati: () => { const s = scegli([-1, 1]); return { H: s * rnd(20, 180, 5), S: s * rnd(50, 300, 10) }; },
      r: v => v.H * 1000 / v.S, u: 'K',
      q: v => 'ΔH = ' + fN(v.H) + ' kJ/mol e ΔS = ' + fN(v.S) + ' J/(mol·K). A quale temperatura ΔG = 0?',
      d: [['joule', v => v.H / v.S, 'Non hai portato ΔH in J (o ΔS in kJ).'],
        ['inv', v => v.S / (v.H * 1000), 'Hai invertito il rapporto: T = ΔH / ΔS.'],
        ['celsius', (v, r) => r - 273, 'È il valore in °C, ma la domanda chiede kelvin.'],
        ['mille', v => v.H * 1e6 / v.S, 'Hai moltiplicato per 1000 due volte.']],
      passi: (v, r) => ['ΔG = 0 ⇒ T = ΔH / ΔS', 'ΔH = ' + fN(v.H * 1000) + ' J/mol', 'T = ' + fN(v.H * 1000) + ' / ' + fN(v.S) + ' = ' + fN(r) + ' K'] },
    { id: 'c-emivita', m: 'C', micro: ['3.2.7'], lv: 'Problema', titolo: 'Quanto ne resta dopo n emivite',
      dati: () => { const th = scegli([2, 5, 8, 10, 12, 20, 30]); return { m0: scegli([80, 100, 160, 200, 320, 400, 640]), th, n: rnd(1, 5, 1), un: scegli(['min', 'h', 'giorni']) }; },
      r: v => v.m0 / Math.pow(2, v.n), u: 'mg',
      q: v => 'Una sostanza con cinetica del primo ordine ha t½ = ' + v.th + ' ' + v.un + '. Partendo da ' + v.m0 + ' mg, quanti mg restano dopo ' + v.th * v.n + ' ' + v.un + '?',
      d: [['lineare', v => v.n >= 2 ? v.m0 / (2 * v.n) : v.m0 / 4, 'Hai diviso per 2·n: ogni emivita dimezza quello che resta.'],
        ['meno1', v => v.m0 / Math.pow(2, v.n - 1), 'Hai contato un\'emivita in meno.'],
        ['piu1', v => v.m0 / Math.pow(2, v.n + 1), 'Hai contato un\'emivita in più.'],
        ['decaduta', v => v.m0 - v.m0 / Math.pow(2, v.n), 'È la quantità decaduta, non quella rimasta.']],
      passi: (v, r) => ['Numero di emivite: ' + v.th * v.n + ' / ' + v.th + ' = ' + v.n, 'Resta m₀ / 2^{n} = ' + v.m0 + ' / ' + Math.pow(2, v.n), 'Risultato: ' + fN(r) + ' mg'] },
    { id: 'c-thalf', m: 'C', micro: ['3.2.7'], lv: 'Problema', titolo: 't½ dalla costante k',
      dati: () => ({ k: scegli([0.0010, 0.0025, 0.0050, 0.010, 0.020, 0.035, 0.050, 0.070]) }),
      r: v => 0.693 / v.k, u: 's',
      q: v => 'Una reazione del primo ordine ha k = ' + fN(v.k) + ' s^{-1}. Quanto vale il tempo di dimezzamento?',
      d: [['inv', v => v.k / 0.693, 'Hai invertito: t½ = 0,693 / k.'],
        ['molt', v => 0.693 * v.k, 'Hai moltiplicato per k invece di dividere.'],
        ['unok', v => 1 / v.k, 'Quello è 1/k (vita media), manca il fattore ln 2 = 0,693.'],
        ['doppio', v => 2 / v.k, 'Hai usato 2 al posto di ln 2.']],
      passi: (v, r) => ['Primo ordine: t½ = ln 2 / k = 0,693 / k', 't½ = 0,693 / ' + fN(v.k), 'Risultato: ' + fN(r) + ' s'] },
    { id: 'c-eainversa', m: 'C', micro: ['3.2.8', '3.2.9'], lv: 'Problema', titolo: 'Energia di attivazione inversa',
      dati: () => ({ Ea: rnd(40, 200, 5), H: scegli([-1, 1]) * rnd(10, 90, 5) }),
      r: v => v.Ea - v.H, u: 'kJ/mol',
      q: v => 'Reazione con Ea (diretta) = ' + fN(v.Ea) + ' kJ/mol e ΔH = ' + fN(v.H) + ' kJ/mol. Quanto vale l\'energia di attivazione della reazione inversa?',
      d: [['segno', v => v.Ea + v.H, 'Segno sbagliato: Ea(inversa) = Ea(diretta) − ΔH.'],
        ['uguale', v => v.Ea, 'Le due barriere sono uguali solo se ΔH = 0.'],
        ['soloh', v => Math.abs(v.H), 'Quello è solo |ΔH|, non la barriera.'],
        ['somma', v => v.Ea + Math.abs(v.H) * 2, 'Hai contato ΔH due volte.']],
      passi: (v, r) => ['Ea(inversa) = Ea(diretta) − ΔH', '= ' + fN(v.Ea) + ' − (' + fN(v.H) + ')', 'Risultato: ' + fN(r) + ' kJ/mol'] },
    // ---------------- FISICA ----------------
    { id: 'f-mru', m: 'F', micro: ['2.1.1', '2.1.2'], lv: 'Problema', titolo: 'Moto rettilineo uniforme',
      dati: () => ({ v: scegli([18, 36, 54, 72, 90, 108, 126]), t: rnd(2, 30, 1) }),
      r: v => v.v / 3.6 * v.t * 60, u: 'm',
      q: v => 'Un\'auto viaggia a velocità costante di ' + v.v + ' km/h per ' + v.t + ' minuti. Quanti metri percorre?',
      d: [['noconv', v => v.v * v.t, 'Non hai convertito né la velocità né il tempo.'],
        ['per36', v => v.v * 3.6 * v.t * 60, 'Per passare da km/h a m/s si divide per 3,6, non si moltiplica.'],
        ['min', v => v.v / 3.6 * v.t, 'Hai lasciato il tempo in minuti.'],
        ['km', v => v.v * v.t / 60, 'È il risultato in km, non in metri.']],
      passi: (v, r) => ['v = ' + v.v + ' / 3,6 = ' + fN(v.v / 3.6) + ' m/s; t = ' + v.t + ' × 60 = ' + v.t * 60 + ' s', 's = v · t', 's = ' + fN(r) + ' m'] },
    { id: 'f-frenata', m: 'F', micro: ['2.1.3'], lv: 'Problema', titolo: 'Spazio di frenata',
      dati: () => ({ v: scegli([36, 54, 72, 90, 108]), a: scegli([2, 4, 5, 6, 8]) }),
      r: v => Math.pow(v.v / 3.6, 2) / (2 * v.a), u: 'm',
      q: v => 'Un\'auto a ' + v.v + ' km/h frena con decelerazione costante di ' + v.a + ' m/s². In quanti metri si ferma?',
      d: [['kmh', v => v.v * v.v / (2 * v.a), 'Non hai convertito la velocità in m/s.'],
        ['no2', v => Math.pow(v.v / 3.6, 2) / v.a, 'Hai dimenticato il 2: s = v² / (2a).'],
        ['noquad', v => v.v / 3.6 / (2 * v.a), 'La velocità va al quadrato.'],
        ['tempo', v => v.v / 3.6 / v.a, 'Quello è il tempo di frenata (in s), non lo spazio.']],
      passi: (v, r) => ['v₀ = ' + v.v + ' / 3,6 = ' + fN(v.v / 3.6) + ' m/s', 's = v₀² / (2a)', 's = ' + fN(Math.pow(v.v / 3.6, 2)) + ' / ' + 2 * v.a + ' = ' + fN(r) + ' m'] },
    { id: 'f-mcu', m: 'F', micro: ['2.1.4'], lv: 'Problema', titolo: 'Velocità nel moto circolare uniforme',
      dati: () => ({ r: rnd(0.2, 5, 0.1), T: rnd(0.5, 10, 0.5) }),
      r: v => 2 * Math.PI * v.r / v.T, u: 'm/s',
      q: v => 'Un corpo percorre una circonferenza di raggio ' + fN(v.r) + ' m con periodo ' + fN(v.T) + ' s. Velocità tangenziale?',
      d: [['pi', v => Math.PI * v.r / v.T, 'La circonferenza è 2πr, non πr.'],
        ['omega', v => 2 * Math.PI / v.T, 'Quella è la velocità angolare ω (rad/s): manca il raggio.'],
        ['molt', v => 2 * Math.PI * v.r * v.T, 'Hai moltiplicato per il periodo invece di dividere.'],
        ['nopi', v => v.r / v.T, 'Manca il fattore 2π.']],
      passi: (v, r) => ['v = 2πr / T', 'v = 2π × ' + fN(v.r) + ' / ' + fN(v.T), 'v = ' + fN(r) + ' m/s'] },
    { id: 'f-newton', m: 'F', micro: ['2.2.1'], lv: 'Problema', titolo: 'Secondo principio della dinamica',
      dati: () => ({ m: scegli([rnd(2, 80, 1), rnd(500, 1500, 50)]), v: rnd(2, 30, 1), t: rnd(2, 12, 1) }),
      r: v => v.m * v.v / v.t, u: 'N',
      q: v => 'Un corpo di ' + fN(v.m) + ' kg parte da fermo e raggiunge ' + v.v + ' m/s in ' + v.t + ' s con accelerazione costante. Forza risultante?',
      d: [['molt', v => v.m * v.v * v.t, 'a = v / t: hai moltiplicato per il tempo.'],
        ['nodiv', v => v.m * v.v, 'Hai usato la velocità al posto dell\'accelerazione.'],
        ['soloa', v => v.v / v.t, 'Quella è l\'accelerazione (m/s²), manca la massa.'],
        ['peso', v => v.m * G, 'Quello è il peso, non la forza che accelera.']],
      passi: (v, r) => ['a = Δv / Δt = ' + v.v + ' / ' + v.t + ' = ' + fN(v.v / v.t) + ' m/s²', 'F = m · a', 'F = ' + fN(v.m) + ' × ' + fN(v.v / v.t) + ' = ' + fN(r) + ' N'] },
    { id: 'f-hooke', m: 'F', micro: ['2.2.4'], lv: 'Problema', titolo: 'Legge di Hooke',
      dati: () => ({ k: scegli([50, 80, 100, 150, 200, 250, 400, 500]), x: rnd(1, 25, 1) }),
      r: v => v.k * v.x / 100, u: 'N',
      q: v => 'Una molla con k = ' + v.k + ' N/m è allungata di ' + v.x + ' cm. Modulo della forza elastica?',
      d: [['cm', v => v.k * v.x, 'Non hai convertito i centimetri in metri.'],
        ['div', v => v.k / (v.x / 100), 'F = k · x: hai diviso.'],
        ['mm', v => v.k * v.x / 1000, 'Conversione sbagliata: 1 cm = 0,01 m.'],
        ['inv', v => (v.x / 100) / v.k, 'Hai calcolato x / k: è l\'inverso.']],
      passi: (v, r) => ['x = ' + v.x + ' cm = ' + fN(v.x / 100) + ' m', 'F = k · x', 'F = ' + v.k + ' × ' + fN(v.x / 100) + ' = ' + fN(r) + ' N'] },
    { id: 'f-inclinato', m: 'F', micro: ['2.2.6'], lv: 'Problema', titolo: 'Piano inclinato',
      dati: () => ({ m: rnd(2, 50, 1), th: scegli([30, 45, 60]) }),
      r: v => v.m * G * Math.sin(rad(v.th)), u: 'N',
      q: v => 'Un corpo di ' + v.m + ' kg è su un piano inclinato di ' + v.th + '° senza attrito. Componente del peso parallela al piano (g = 9,81 m/s²)?',
      d: [['cos', v => v.m * G * Math.cos(rad(v.th)), 'Con il coseno trovi la componente perpendicolare al piano.'],
        ['peso', v => v.m * G, 'Quello è il peso intero, non la sua componente.'],
        ['tan', v => v.m * G * Math.tan(rad(v.th)), 'La componente si trova con seno o coseno, non con la tangente.'],
        ['nog', v => v.m * Math.sin(rad(v.th)), 'Hai dimenticato g: serve il peso, non la massa.']],
      passi: (v, r) => ['P = m · g = ' + fN(v.m * G) + ' N', 'Componente parallela: P∥ = P · sen θ', 'P∥ = ' + fN(v.m * G) + ' × sen ' + v.th + '° = ' + fN(r) + ' N'] },
    { id: 'f-lavoro', m: 'F', micro: ['2.3.1'], lv: 'Problema', titolo: 'Lavoro di una forza',
      dati: () => ({ F: rnd(10, 400, 10), s: rnd(2, 50, 1), th: scegli([0, 30, 60, 45]) }),
      r: v => v.F * v.s * Math.cos(rad(v.th)), u: 'J',
      q: v => 'Una forza di ' + v.F + ' N sposta un corpo di ' + v.s + ' m formando un angolo di ' + v.th + '° con lo spostamento. Lavoro compiuto?',
      d: [['nocos', v => v.th === 0 ? v.F * v.s * 0.5 : v.F * v.s, 'Il lavoro dipende dall\'angolo: L = F · s · cos θ.'],
        ['sin', v => v.F * v.s * Math.sin(rad(v.th === 0 ? 30 : v.th)), 'Si usa il coseno dell\'angolo tra forza e spostamento, non il seno.'],
        ['div', v => v.F / v.s, 'Il lavoro è un prodotto, non un rapporto.'],
        ['meta', v => v.F * v.s * Math.cos(rad(v.th)) / 2, 'Non c\'è il fattore ½ nel lavoro.']],
      passi: (v, r) => ['L = F · s · cos θ', 'L = ' + v.F + ' × ' + v.s + ' × cos ' + v.th + '°', 'L = ' + fN(r) + ' J'] },
    { id: 'f-potenza', m: 'F', micro: ['2.3.2'], lv: 'Problema', titolo: 'Potenza',
      dati: () => ({ m: rnd(5, 120, 5), h: rnd(2, 30, 1), t: rnd(2, 60, 1) }),
      r: v => v.m * G * v.h / v.t, u: 'W',
      q: v => 'Un motore solleva ' + v.m + ' kg di ' + v.h + ' m in ' + v.t + ' s a velocità costante. Potenza (g = 9,81 m/s²)?',
      d: [['lavoro', v => v.m * G * v.h, 'Quello è il lavoro (J): la potenza è lavoro diviso tempo.'],
        ['nog', v => v.m * v.h / v.t, 'Hai dimenticato g: la forza da vincere è il peso.'],
        ['molt', v => v.m * G * v.h * v.t, 'Hai moltiplicato per il tempo invece di dividere.'],
        ['noh', v => v.m * G / v.t, 'Hai dimenticato l\'altezza.']],
      passi: (v, r) => ['L = m g h = ' + fN(v.m * G * v.h) + ' J', 'P = L / t', 'P = ' + fN(v.m * G * v.h) + ' / ' + v.t + ' = ' + fN(r) + ' W'] },
    { id: 'f-cinetica', m: 'F', micro: ['2.3.3'], lv: 'Problema', titolo: 'Energia cinetica',
      dati: () => ({ m: scegli([0.5, 2, 5, 10, 70, 80, 1000, 1200]), v: scegli([18, 36, 54, 72, 90]) }),
      r: v => 0.5 * v.m * Math.pow(v.v / 3.6, 2), u: 'J',
      q: v => 'Energia cinetica di un corpo di ' + fN(v.m) + ' kg che viaggia a ' + v.v + ' km/h?',
      d: [['kmh', v => 0.5 * v.m * v.v * v.v, 'Non hai convertito km/h in m/s.'],
        ['nomezzo', v => v.m * Math.pow(v.v / 3.6, 2), 'Manca il fattore ½.'],
        ['noquad', v => 0.5 * v.m * v.v / 3.6, 'La velocità va al quadrato.'],
        ['p', v => v.m * v.v / 3.6, 'Quella è la quantità di moto (kg·m/s).']],
      passi: (v, r) => ['v = ' + v.v + ' / 3,6 = ' + fN(v.v / 3.6) + ' m/s', 'E_{c} = ½ m v²', 'E_{c} = 0,5 × ' + fN(v.m) + ' × ' + fN(Math.pow(v.v / 3.6, 2)) + ' = ' + fN(r) + ' J'] },
    { id: 'f-potenziale', m: 'F', micro: ['2.3.5', '2.3.4'], lv: 'Problema', titolo: 'Caduta libera: velocità d\'arrivo',
      dati: () => ({ h: scegli([1.25, 5, 10, 20, 45, 80]) }),
      r: v => Math.sqrt(2 * G * v.h), u: 'm/s',
      q: v => 'Un sasso cade da fermo da ' + fN(v.h) + ' m (attrito trascurabile, g = 9,81 m/s²). Con che velocità arriva a terra?',
      d: [['no2', v => Math.sqrt(G * v.h), 'Da m g h = ½ m v² viene v = √(2gh): manca il 2.'],
        ['noradice', v => 2 * G * v.h, 'Hai dimenticato la radice quadrata.'],
        ['gh', v => G * v.h, 'Quella è g·h, non una velocità.'],
        ['kmh', v => Math.sqrt(2 * G * v.h) * 3.6, 'È il risultato in km/h, non in m/s.']],
      passi: (v, r) => ['Conservazione: m g h = ½ m v²', 'v = √(2 g h) = √(2 × 9,81 × ' + fN(v.h) + ')', 'v = ' + fN(r) + ' m/s'] },
    { id: 'f-qdm', m: 'F', micro: ['2.3.6', '2.3.7'], lv: 'Problema', titolo: 'Urto anelastico',
      dati: () => ({ m1: rnd(1, 10, 1), v1: rnd(2, 12, 1), m2: rnd(1, 10, 1) }),
      r: v => v.m1 * v.v1 / (v.m1 + v.m2), u: 'm/s',
      q: v => 'Un carrello di ' + v.m1 + ' kg a ' + v.v1 + ' m/s urta un carrello fermo di ' + v.m2 + ' kg e i due restano attaccati. Velocità dopo l\'urto?',
      d: [['solo2', v => v.m1 * v.v1 / v.m2, 'Dopo l\'urto si muovono insieme: la massa è m₁ + m₂.'],
        ['uguale', v => v.v1, 'La quantità di moto si conserva, non la velocità.'],
        ['meta', v => v.v1 / 2, 'v/2 vale solo se le masse sono uguali.'],
        ['energia', v => v.v1 * Math.sqrt(v.m1 / (v.m1 + v.m2)), 'Hai conservato l\'energia cinetica: in un urto anelastico non si conserva.']],
      passi: (v, r) => ['Si conserva la quantità di moto: m₁v₁ = (m₁ + m₂) v', 'v = ' + v.m1 + ' × ' + v.v1 + ' / ' + (v.m1 + v.m2), 'v = ' + fN(r) + ' m/s'] },
    { id: 'f-pressione', m: 'F', micro: ['3.1.1'], lv: 'Problema', titolo: 'Pressione = F / S',
      dati: () => ({ F: rnd(10, 600, 10), S: scegli([2, 4, 5, 10, 20, 25, 50]) }),
      r: v => v.F / (v.S * 1e-4), u: 'Pa',
      q: v => 'Una forza di ' + v.F + ' N agisce perpendicolarmente su una superficie di ' + v.S + ' cm². Pressione?',
      d: [['cm2', v => v.F / v.S, 'Non hai convertito i cm² in m² (1 cm² = 10^{-4} m²).'],
        ['cm', v => v.F / (v.S * 1e-2), 'Hai convertito come se fossero cm: per le aree il fattore è 10^{-4}.'],
        ['molt', v => v.F * v.S * 1e-4, 'La pressione è forza diviso superficie.'],
        ['inv', v => v.S * 1e-4 / v.F, 'Hai invertito il rapporto.']],
      passi: (v, r) => ['S = ' + v.S + ' cm² = ' + fN(v.S * 1e-4) + ' m²', 'p = F / S', 'p = ' + v.F + ' / ' + fN(v.S * 1e-4) + ' = ' + fN(r) + ' Pa'] },
    { id: 'f-stevino', m: 'F', micro: ['3.1.3', '3.1.5'], lv: 'Problema', titolo: 'Legge di Stevino',
      dati: () => { const [l, rho] = scegli([['acqua dolce', 1000], ['acqua di mare', 1030]] as [string, number][]); return { l, rho, h: rnd(1, 40, 1) }; },
      r: v => v.rho * G * v.h / 1000, u: 'kPa',
      q: v => 'Di quanto supera la pressione atmosferica la pressione a ' + v.h + ' m di profondità in ' + v.l + ' (ρ = ' + v.rho + ' kg/m³, g = 9,81 m/s²)?',
      d: [['pa', v => v.rho * G * v.h, 'È il valore in Pa: la domanda chiede kPa.'],
        ['assoluta', v => v.rho * G * v.h / 1000 + 101.3, 'Hai aggiunto la pressione atmosferica: la domanda chiede solo la parte idrostatica.'],
        ['nog', v => v.rho * v.h / 1000, 'Hai dimenticato g.'],
        ['norho', v => G * v.h, 'Hai dimenticato la densità.']],
      passi: (v, r) => ['Δp = ρ g h', 'Δp = ' + v.rho + ' × 9,81 × ' + v.h + ' = ' + fN(v.rho * G * v.h) + ' Pa', 'In kPa: ' + fN(r) + ' kPa'] },
    { id: 'f-pascal', m: 'F', micro: ['3.1.6'], lv: 'Problema', titolo: 'Torchio idraulico',
      dati: () => { const S1 = scegli([2, 5, 10, 20]); return { F1: rnd(10, 200, 10), S1, S2: S1 * scegli([5, 10, 20, 40, 50]) }; },
      r: v => v.F1 * v.S2 / v.S1, u: 'N',
      q: v => 'In un torchio idraulico si applica ' + v.F1 + ' N sul pistone di ' + v.S1 + ' cm². Che forza si ottiene sul pistone di ' + v.S2 + ' cm²?',
      d: [['inv', v => v.F1 * v.S1 / v.S2, 'Hai invertito le superfici: sul pistone più grande la forza è maggiore.'],
        ['uguale', v => v.F1, 'È la pressione a trasmettersi uguale, non la forza.'],
        ['diff', v => v.F1 * (v.S2 - v.S1) / v.S1, 'Hai usato la differenza delle superfici.'],
        ['molt', v => v.F1 * v.S2, 'Manca la divisione per S₁.']],
      passi: (v, r) => ['Pascal: F₁ / S₁ = F₂ / S₂', 'F₂ = ' + v.F1 + ' × ' + v.S2 + ' / ' + v.S1, 'F₂ = ' + fN(r) + ' N'] },
    { id: 'f-archimede', m: 'F', micro: ['3.1.7'], lv: 'Problema', titolo: 'Spinta di Archimede',
      dati: () => ({ V: scegli([0.5, 1, 2, 2.5, 4, 5, 8, 10, 20]) }),
      r: v => 1000 * G * v.V / 1000, u: 'N',
      q: v => 'Un oggetto di volume ' + fN(v.V) + ' dm³ è completamente immerso in acqua (ρ = 1000 kg/m³, g = 9,81 m/s²). Spinta di Archimede?',
      d: [['dm3', v => 1000 * G * v.V, 'Non hai convertito i dm³ in m³ (1 dm³ = 10^{-3} m³).'],
        ['nog', v => v.V, 'Hai calcolato la massa d\'acqua spostata (kg), non la forza.'],
        ['cm3', v => 1000 * G * v.V / 1e6, 'Conversione sbagliata: 1 dm³ = 10^{-3} m³, non 10^{-6}.'],
        ['meta', v => 1000 * G * v.V / 2000, 'L\'oggetto è tutto immerso: conta tutto il volume.']],
      passi: (v, r) => ['V = ' + fN(v.V) + ' dm³ = ' + fN(v.V / 1000) + ' m³', 'S = ρ · g · V', 'S = 1000 × 9,81 × ' + fN(v.V / 1000) + ' = ' + fN(r) + ' N'] },
    // ---------------- BIOLOGIA ----------------
    { id: 'b-cromosomi', m: 'B', micro: ['2.3.3', '2.3.4', '2.3.5', '2.3.6'], lv: 'Applicativo', titolo: 'Cromosomi e cromatidi',
      dati: () => {
        const [sp, dn] = scegli([['l\'uomo', 46], ['il cane', 78], ['il gatto', 38], ['il moscerino della frutta', 8], ['il mais', 20], ['lo scimpanzé', 48]] as [string, number][]);
        const [chi, f, spieg] = scegli([['quanti cromosomi ha ciascun gamete', 1, 'I gameti sono aploidi: n cromosomi.'],
          ['quanti cromatidi ci sono in una cellula in metafase della mitosi', 4, 'In metafase i 2n cromosomi sono duplicati: 2 cromatidi ciascuno, quindi 4n.'],
          ['quanti cromosomi ci sono in una cellula in anafase della mitosi', 4, 'In anafase i cromatidi fratelli si separano e diventano cromosomi: 4n.'],
          ['quanti cromatidi ci sono in una cellula in metafase II', 2, 'Dopo la meiosi I la cellula è aploide con n cromosomi duplicati: 2n cromatidi.'],
          ['quanti cromosomi ha ciascuna cellula alla fine della meiosi I', 1, 'La meiosi I separa gli omologhi: n cromosomi (ancora con 2 cromatidi).']] as [string, number, string][]);
        return { sp, dn, chi, f, spieg };
      },
      r: v => v.dn / 2 * v.f, u: '',
      q: v => 'Il corredo diploide ' + v.sp.replace(/^l'/, 'dell\'').replace(/^lo /, 'dello ').replace(/^il /, 'del ') + ' è 2n = ' + v.dn + '. ' + v.chi.charAt(0).toUpperCase() + v.chi.slice(1) + '?',
      d: [['n', v => v.dn / 2, 'Questo è n, il corredo aploide.'],
        ['2n', v => v.dn, 'Questo è 2n, il corredo diploide senza duplicazione.'],
        ['4n', v => v.dn * 2, 'Questo è 4n: vale con DNA duplicato in una cellula diploide.'],
        ['n2', v => v.dn / 4, 'Hai dimezzato due volte: la meiosi riduce il corredo una sola volta.']],
      passi: v => ['2n = ' + v.dn + ', quindi n = ' + v.dn / 2, v.spieg, 'Risultato: ' + (v.dn / 2 * v.f)] },
    { id: 'b-glicolisi', m: 'B', micro: ['2.2.2', '2.2.7'], lv: 'Applicativo', titolo: 'Bilancio della glicolisi',
      dati: () => { const [chi, f, sp] = scegli([['Quanti ATP netti', 2, '2 ATP consumati e 4 prodotti: netto +2 per glucosio.'], ['Quante molecole di NADH', 2, '2 NADH per glucosio (gliceraldeide-3-fosfato deidrogenasi).'], ['Quante molecole di piruvato', 2, 'Ogni glucosio (6 C) dà 2 piruvati (3 C).'], ['Quanti ATP lordi (prodotti in totale)', 4, '4 ATP prodotti per fosforilazione a livello del substrato, prima di togliere i 2 consumati.']] as [string, number, string][]); return { n: rnd(2, 12, 1), chi, f, sp }; },
      r: v => v.n * v.f, u: '',
      q: v => v.chi + ' si ottengono dalla glicolisi di ' + v.n + ' molecole di glucosio?',
      d: [['uno', v => v.n, 'Hai contato 1 per glucosio.'],
        ['lordi', v => v.n * (v.f === 4 ? 2 : 4), 'Hai confuso ATP lordi e netti (4 prodotti, 2 consumati).'],
        ['resp', v => v.n * 30, 'Quello è (circa) il bilancio della respirazione completa, non della sola glicolisi.'],
        ['tre', v => v.n * 3, 'Per glucosio il valore non è 3.']],
      passi: (v, r) => ['Per una molecola di glucosio: ' + v.f, v.sp, v.n + ' × ' + v.f + ' = ' + r] },
  ];

  const SINGOLO = (u: string, x: number) => u === 'molecole' && x === 1 ? 'molecola' : u;
  const conUnita = (x: number, u: string) => fN(x) + (u ? ' ' + SINGOLO(u, x) : '');

  /** Una domanda dal modello; null se non riesce a costruire 4 distrattori distinti. */
  function genera(M: ModelloEs, tentativi = 8): DomB | null {
    for (let t = 0; t < tentativi; t++) {
      const v = M.dati(), r = M.r(v), u = typeof M.u === 'function' ? M.u(v) : M.u;
      if (!isFinite(r)) continue;
      const giusta = conUnita(r, u), viste = new Set([giusta]), valori = [r];
      // scarta i valori troppo vicini (entro il 3%) a uno già presente: sembrerebbero arrotondamenti
      const vicino = (x: number) => valori.some(y => Math.abs(x - y) <= 0.03 * Math.max(Math.abs(x), Math.abs(y)));
      const o: string[] = [giusta], ew: string[] = [], dk: string[] = [];
      for (const [k, f, p] of M.d) {
        let x: number; try { x = f(v, r); } catch (_) { continue; }
        if (!isFinite(x) || (r > 0 && x <= 0) || (r < 0 && x === 0)) continue;
        if (Number.isInteger(r) && u === '' && !Number.isInteger(x)) continue;   // conteggi: solo interi
        const s = conUnita(x, u); if (viste.has(s) || vicino(x)) continue;
        viste.add(s); valori.push(x); o.push(s); ew.push(p); dk.push(k);
        if (o.length === 5) break;
      }
      const intero = Number.isInteger(r) && Math.abs(r) < 1000;
      const riserva: [number, string, string][] = intero
        ? [[r + 1, 'p1', 'Hai contato uno in più.'], [r - 1, 'm1', 'Hai contato uno in meno.'], [r + 2, 'p2', 'Conteggio sbagliato.'], [r * 2, 'x2', 'Hai raddoppiato.'], [r - 2, 'm2', 'Conteggio sbagliato.']]
        : [[r * 10, 'x10', ''], [r / 10, 'd10', ''], [r * 2, 'x2', ''], [r / 2, 'd2', ''], [r * 3, 'x3', ''], [r * 100, 'x100', '']];
      for (const [x, k, p] of riserva) {
        if (o.length === 5) break;
        if (!isFinite(x) || (r > 0 && x <= 0)) continue;
        const s = conUnita(x, u); if (viste.has(s) || vicino(x)) continue;
        viste.add(s); valori.push(x); o.push(s); ew.push(p || 'Valore sbagliato di un fattore ' + fN(x / r) + ': ricontrolla unità e passaggi.'); dk.push(k);
      }
      if (o.length < 5) continue;
      return { id: 'g-' + M.id, sk: 'gen-' + M.m + '-' + M.micro[0], t: 'mcq', lv: M.lv, q: M.q(v), o, ew, dk, e: M.passi(v, r), gen: true };
    }
    return null;
  }
  const per = (m: string, micro: string) => MODELLI.filter(x => x.m === m && x.micro.includes(micro));
  /** Serie di esercizi per un microstep: ogni modello almeno una volta, fino a n domande. */
  function serie(m: string, micro: string, n = 8): DomB[] {
    const ms = per(m, micro); if (!ms.length) return [];
    const out: DomB[] = [];
    for (let i = 0; out.length < n && i < n * 4; i++) { const d = genera(ms[i % ms.length]); if (d) out.push(d); }
    return out.sort(() => Math.random() - 0.5);
  }
  function titoloMicro(pk: PkStep, m: string, micro: string): string {
    for (const ss of mat0(pk, m).sottostep) for (const mi of ss.microstep) if (mi.n === micro && mi.schede[0]) return mi.schede[0].titolo;
    return '';
  }
  return { MODELLI, genera, per, serie, fN, titoloMicro };
})();
