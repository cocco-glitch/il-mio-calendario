// ============================================================
// 07-tabelle.ts — Tabelle personalizzate (dentro Studio → Tabelle).
// Una tabella = un record type 'tabella' con colonne e righe.
// Tipi di colonna: testo, numero, data, spunta, selezione, link (Drive o web).
// Le righe con una colonna "data" compaiono nel giorno corrispondente (Oggi e calendario).
// CSV: importa/esporta. Google Sheet: collega (apri) e importa come righe.
// ============================================================

type TipoCol = 'testo' | 'numero' | 'data' | 'spunta' | 'selezione' | 'link';
interface Colonna { id: string; nome: string; tipo: TipoCol; opzioni?: string[]; }
interface Riga { id: string; c: Record<string, any>; }
interface Tabella extends Rec { type: 'tabella'; nome: string; colonne: Colonna[]; righe: Riga[]; sheet?: { id: string; nome: string; url: string }; }

const TIPI_COL: [TipoCol, string][] = [['testo', 'Testo'], ['numero', 'Numero'], ['data', 'Data'], ['spunta', 'Spunta'], ['selezione', 'Selezione'], ['link', 'Link / file Drive']];

function tabelle(): Tabella[] { return Stato.tutti<Tabella>('tabella').sort((a, b) => a.nome.localeCompare(b.nome)); }

/** Righe di tutte le tabelle che hanno una colonna data uguale al giorno. */
function righeDelGiorno(g: Date): { t: Tabella; r: Riga; col: Colonna }[] {
  const k = ymd(g), out: { t: Tabella; r: Riga; col: Colonna }[] = [];
  for (const t of tabelle()) for (const col of t.colonne.filter(c => c.tipo === 'data')) for (const r of t.righe) if (r.c[col.id] === k) out.push({ t, r, col });
  return out;
}
function rigaTabellaGiorno(x: { t: Tabella; r: Riga; col: Colonna }): HTMLElement {
  const prima = x.t.colonne.find(c => c.tipo === 'testo');
  return h('button.voce-lista', { onclick: () => { UI.studioVista = 'tabelle'; UI.tabella = x.t.id; vai('studio'); } },
    h('span.barra', { style: { background: 'var(--tenue)' } }),
    h('span.voce-corpo', null, h('span.voce-titolo', null, prima ? String(x.r.c[prima.id] || '(riga)') : '(riga)'), h('span.voce-sotto', null, x.t.nome + ' · ' + x.col.nome)));
}

// ---------- CSV ----------
function csvRighe(testo: string): string[][] {
  const sep = (testo.split('\n')[0].match(/;/g) || []).length > (testo.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const out: string[][] = []; let riga: string[] = [], cella = '', virg = false;
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (virg) { if (ch === '"') { if (testo[i + 1] === '"') { cella += '"'; i++; } else virg = false; } else cella += ch; continue; }
    if (ch === '"') virg = true;
    else if (ch === sep) { riga.push(cella); cella = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && testo[i + 1] === '\n') i++; riga.push(cella); cella = ''; if (riga.some(x => x !== '')) out.push(riga); riga = []; }
    else cella += ch;
  }
  riga.push(cella); if (riga.some(x => x !== '')) out.push(riga);
  return out;
}
function csvDa(t: Tabella): string {
  const q = (v: any) => { const s = v == null ? '' : typeof v === 'boolean' ? (v ? 'sì' : 'no') : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [t.colonne.map(c => q(c.nome)).join(','), ...t.righe.map(r => t.colonne.map(c => q(r.c[c.id])).join(','))].join('\n');
}
/** Aggiunge righe da una tabella di testo (CSV o Google Sheet). Prima riga = intestazioni: crea le colonne mancanti. */
function importaRighe(t: Tabella, dati: string[][]): number {
  if (!dati.length) return 0;
  const [testa, ...corpo] = dati;
  const mappa = testa.map(nome => {
    const n = nome.trim() || 'Colonna';
    let col = t.colonne.find(c => norm(c.nome) === norm(n));
    if (!col) { col = { id: uid(), nome: n, tipo: 'testo' }; t.colonne.push(col); }
    return col;
  });
  for (const r of corpo) {
    const c: Record<string, any> = {};
    r.forEach((v, i) => {
      const col = mappa[i]; if (!col) return;
      if (col.tipo === 'numero') c[col.id] = v === '' ? '' : parseFloat(v.replace(',', '.'));
      else if (col.tipo === 'spunta') c[col.id] = /^(s[iì]|x|true|1|vero)$/i.test(v.trim());
      else if (col.tipo === 'data') { const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); c[col.id] = m ? m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]) : v; }
      else c[col.id] = v;
    });
    t.righe.push({ id: uid(), c });
  }
  return corpo.length;
}

// ---------- Viste ----------
function vistaTabelle(): HTMLElement {
  if (UI.tabella) { const t = Stato.prendi<Tabella>(UI.tabella); if (t) return vistaTabella(t); UI.tabella = null; }
  const lista = tabelle();
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    lista.length ? h('section.card', null, h('h2.card-titolo', null, 'Le mie tabelle'),
      lista.map(t => h('button.voce-lista', { onclick: () => { UI.tabella = t.id; UI.tabQ = ''; UI.tabOrd = ''; disegna(); } },
        h('span.voce-corpo', null, h('span.voce-titolo', null, t.nome), h('span.voce-sotto', null, t.righe.length + ' righe · ' + t.colonne.length + ' colonne' + (t.sheet ? ' · collegata a Google Sheet' : ''))), icona('dx', 18))))
      : vuoto('Nessuna tabella. Creane una: colonne di testo, numeri, date, spunte, scelte, link Drive.'),
    h('button.btn', { onclick: () => apriNuovaTabella() }, '+ Nuova tabella'));
}

function apriNuovaTabella(): void {
  const nome = h('input.titolo-grande', { type: 'text', placeholder: 'Nome della tabella' }) as HTMLInputElement;
  const modello = selettore([['vuota', 'Vuota (Titolo, Data, Fatto)'], ['studio', 'Studio (Argomento, Materia, Data, Fatto, Punteggio, Note)'], ['sheet', 'Da un Google Sheet esistente']], 'vuota');
  foglio({ titolo: 'Nuova tabella', etichettaSalva: 'Crea', corpo: h('div.modulo', null, nome, h('div.gruppo', null, riga('Modello', modello))),
    salva: () => {
      const t: Tabella = { id: 'tab-' + uid(), type: 'tabella', updatedAt: 0, nome: nome.value.trim() || 'Nuova tabella', colonne: [], righe: [] };
      const col = (n: string, tipo: TipoCol, opzioni?: string[]) => ({ id: uid(), nome: n, tipo, ...(opzioni ? { opzioni } : {}) });
      if (modello.value === 'studio') t.colonne = [col('Argomento', 'testo'), col('Materia', 'selezione', ['Chimica', 'Biologia', 'Fisica']), col('Data', 'data'), col('Fatto', 'spunta'), col('Punteggio %', 'numero'), col('Note', 'testo')];
      else t.colonne = [col('Titolo', 'testo'), col('Data', 'data'), col('Fatto', 'spunta')];
      if (modello.value === 'sheet') { t.colonne = []; Stato.salva(t); UI.tabella = t.id; collegaSheet(t, true); return; }
      t.righe.push({ id: uid(), c: {} });
      Stato.salva(t); UI.tabella = t.id; disegna();
    } });
  setTimeout(() => nome.focus(), 50);
}

async function collegaSheet(t: Tabella, importa: boolean): Promise<void> {
  if (serveGoogle()) return;
  try {
    const [d] = await Drive.scegliConPicker({ mime: 'application/vnd.google-apps.spreadsheet' });
    if (!d) return;
    t.sheet = { id: d.id, nome: d.name, url: d.url || 'https://docs.google.com/spreadsheets/d/' + d.id };
    if (importa || (await chiedi('Importare le righe?', [{ testo: 'Sì, importa le righe', valore: 'si' }, { testo: 'No, solo collegamento', valore: 'no' }], d.name)) === 'si') {
      const n = importaRighe(t, csvRighe(await Drive.esportaCsv(d.id)));
      avviso('Importate ' + n + ' righe dal foglio (primo foglio).');
    }
    if (!t.nome || t.nome === 'Nuova tabella') t.nome = d.name;
    Stato.salva(t);
  } catch (e: any) { avviso(String(e.message || e), 6000); }
}

function editorColonna(t: Tabella, col?: Colonna): void {
  const nuova = !col;
  const c: Colonna = col ? JSON.parse(JSON.stringify(col)) : { id: uid(), nome: '', tipo: 'testo' };
  const nome = h('input.titolo-grande', { type: 'text', placeholder: 'Nome colonna', value: c.nome }) as HTMLInputElement;
  const tipo = selettore(TIPI_COL, c.tipo, () => { opz.style.display = tipo.value === 'selezione' ? '' : 'none'; });
  const opz = h('div', { style: { display: c.tipo === 'selezione' ? '' : 'none' } }, riga('Scelte', h('input', { type: 'text', placeholder: 'separate da virgola', value: (c.opzioni || []).join(', ') })));
  const f = foglio({ titolo: nuova ? 'Nuova colonna' : 'Colonna', corpo: h('div.modulo', null, nome, h('div.gruppo', null, riga('Tipo', tipo), opz)),
    salva: () => {
      c.nome = nome.value.trim() || 'Colonna'; c.tipo = tipo.value as TipoCol;
      c.opzioni = c.tipo === 'selezione' ? (opz.querySelector('input') as HTMLInputElement).value.split(',').map(x => x.trim()).filter(Boolean) : undefined;
      if (nuova) t.colonne.push(c); else t.colonne[t.colonne.findIndex(x => x.id === c.id)] = c;
      Stato.salva(t);
    },
    elimina: nuova ? undefined : () => chiedi('Eliminare la colonna?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], c.nome + ': i valori di questa colonna andranno persi.').then(s => {
      if (!s) return; t.colonne = t.colonne.filter(x => x.id !== c.id); t.righe.forEach(r => delete r.c[c.id]); Stato.salva(t); f.chiudi();
    }) });
}

function cella(t: Tabella, r: Riga, col: Colonna): HTMLElement {
  const v = r.c[col.id];
  const salva = (nv: any) => { if (r.c[col.id] === nv) return; r.c[col.id] = nv; Stato.salva(t, true); };
  switch (col.tipo) {
    case 'spunta': return h('input', { type: 'checkbox', checked: !!v, 'aria-label': col.nome, onchange: (e: Event) => { salva((e.target as HTMLInputElement).checked); } });
    case 'numero': return h('input.cella', { type: 'number', inputMode: 'decimal', value: v == null ? '' : String(v), 'aria-label': col.nome, onchange: (e: Event) => { const x = (e.target as HTMLInputElement).value; salva(x === '' ? '' : parseFloat(x)); } });
    case 'data': return h('input.cella', { type: 'date', value: v || '', 'aria-label': col.nome, onchange: (e: Event) => { salva((e.target as HTMLInputElement).value); Stato.notifica(); } });
    case 'selezione': return selettore([['', '—'] as [string, string]].concat((col.opzioni || []).map(o => [o, o] as [string, string])), v || '', function (this: HTMLSelectElement) { salva(this.value); });
    case 'link': {
      const box = h('span.cella-link');
      const url = v && typeof v === 'object' ? v.url : v;
      if (url) box.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener' }, v.nome || 'Apri'));
      box.appendChild(h('button.btn-testo', { onclick: async () => {
        const s = await chiedi(col.nome, [{ testo: 'Scegli file dal Drive', valore: 'drive' }, { testo: 'Incolla un link web', valore: 'web' }].concat(url ? [{ testo: 'Togli il link', valore: 'via' }] : []));
        if (s === 'via') { salva(''); Stato.notifica(); }
        else if (s === 'drive') { if (serveGoogle()) return; try { const [d] = await Drive.scegliConPicker({}); if (d) { salva({ nome: d.name, url: d.url, driveId: d.id }); Stato.notifica(); } } catch (e: any) { avviso(String(e.message || e)); } }
        else if (s === 'web') {
          const inp = h('input', { type: 'url', placeholder: 'https://…', value: typeof v === 'string' ? v : '' }) as HTMLInputElement;
          foglio({ titolo: 'Link', corpo: h('div.modulo', null, h('div.gruppo', null, riga('Indirizzo', inp))), salva: () => { const u = inp.value.trim(); salva(u ? (/^https?:\/\//.test(u) ? u : 'https://' + u) : ''); Stato.notifica(); } });
        }
      } }, url ? '✎' : '+ link'));
      return box;
    }
    default: return h('textarea.cella', { rows: 1, value: v == null ? '' : String(v), 'aria-label': col.nome, oninput: (e: Event) => { const a = e.target as HTMLTextAreaElement; a.style.height = 'auto'; a.style.height = a.scrollHeight + 'px'; }, onchange: (e: Event) => salva((e.target as HTMLTextAreaElement).value) });
  }
}

function vistaTabella(t: Tabella): HTMLElement {
  const q = norm(UI.tabQ);
  const testoCella = (v: any) => v == null ? '' : typeof v === 'object' ? (v.nome || v.url || '') : String(v);
  let righe = t.righe.filter(r => !q || t.colonne.some(c => norm(testoCella(r.c[c.id])).includes(q)));
  if (UI.tabOrd) {
    const [cid, dir] = UI.tabOrd.split(':'), col = t.colonne.find(c => c.id === cid);
    if (col) righe = righe.slice().sort((a, b) => {
      const x = a.c[cid], y = b.c[cid];
      const vx = col.tipo === 'numero' ? (x === '' || x == null ? -Infinity : +x) : col.tipo === 'spunta' ? (x ? 1 : 0) : norm(testoCella(x));
      const vy = col.tipo === 'numero' ? (y === '' || y == null ? -Infinity : +y) : col.tipo === 'spunta' ? (y ? 1 : 0) : norm(testoCella(y));
      return (vx < vy ? -1 : vx > vy ? 1 : 0) * (dir === 'd' ? -1 : 1);
    });
  }
  const ordina = (c: Colonna) => { UI.tabOrd = UI.tabOrd === c.id + ':a' ? c.id + ':d' : UI.tabOrd === c.id + ':d' ? '' : c.id + ':a'; disegna(); };
  const freccia = (c: Colonna) => UI.tabOrd === c.id + ':a' ? ' ▲' : UI.tabOrd === c.id + ':d' ? ' ▼' : '';
  const fileCsv = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', style: { display: 'none' }, onchange: () => {
    const f = fileCsv.files && fileCsv.files[0]; if (!f) return;
    f.text().then(txt => { const n = importaRighe(t, csvRighe(txt)); Stato.salva(t); avviso('Importate ' + n + ' righe.'); });
  } }) as HTMLInputElement;
  const esporta = () => {
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csvDa(t)], { type: 'text/csv' })), download: t.nome.replace(/[\\/:*?"<>|]/g, '_') + '.csv' }) as HTMLAnchorElement;
    document.body.appendChild(a); a.click(); a.remove();
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('button.btn-testo.indietro', { onclick: () => { UI.tabella = null; disegna(); } }, '‹ Tabelle'),
    h('div.riga-tra', null,
      h('input.titolo-tab', { type: 'text', value: t.nome, 'aria-label': 'Nome tabella', onchange: (e: Event) => { t.nome = (e.target as HTMLInputElement).value.trim() || t.nome; Stato.salva(t); } }),
      h('button.btn-ico', { 'aria-label': 'Altre azioni', onclick: async () => {
        const s = await chiedi(t.nome, [
          { testo: 'Importa CSV', valore: 'csv' }, { testo: 'Esporta CSV', valore: 'exp' },
          { testo: t.sheet ? 'Ricollega Google Sheet' : 'Collega un Google Sheet', valore: 'sheet' },
          ...(t.sheet ? [{ testo: 'Importa righe dal Google Sheet', valore: 'sheetimp' }] : []),
          { testo: 'Elimina tabella', valore: 'del', pericolo: true }]);
        if (s === 'csv') fileCsv.click();
        else if (s === 'exp') esporta();
        else if (s === 'sheet') collegaSheet(t, false);
        else if (s === 'sheetimp' && t.sheet) { if (serveGoogle()) return; try { const n = importaRighe(t, csvRighe(await Drive.esportaCsv(t.sheet.id))); Stato.salva(t); avviso('Importate ' + n + ' righe.'); } catch (e: any) { avviso(String(e.message || e), 6000); } }
        else if (s === 'del') { const ok = await chiedi('Eliminare la tabella?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], t.nome); if (ok) { Stato.elimina(t.id); UI.tabella = null; } }
      } }, '⋯'), fileCsv),
    t.sheet ? h('a.collegamento', { href: t.sheet.url, target: '_blank', rel: 'noopener' }, '📊 Apri il Google Sheet: ' + t.sheet.nome) : null,
    h('input.rapido', { type: 'search', placeholder: 'Filtra righe…', value: UI.tabQ, oninput: (e: Event) => { UI.tabQ = (e.target as HTMLInputElement).value; clearTimeout((window as any).__tq); (window as any).__tq = setTimeout(() => { disegna(); const i = document.querySelector('.rapido') as HTMLInputElement; if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); } }),
    h('div.tab-scroll', null, h('table.tab', null,
      h('thead', null, h('tr', null, t.colonne.map(c => h('th', null, h('button', { onclick: () => ordina(c), title: 'Ordina' }, c.nome + freccia(c)), h('button.th-mod', { 'aria-label': 'Modifica colonna ' + c.nome, onclick: () => editorColonna(t, c) }, '⚙'))),
        h('th.th-piu', null, h('button', { onclick: () => editorColonna(t), 'aria-label': 'Aggiungi colonna' }, '+')))),
      h('tbody', null, righe.map(r => h('tr', null, t.colonne.map(c => h('td.td-' + c.tipo, null, cella(t, r, c))),
        h('td', null, h('button.btn-ico', { 'aria-label': 'Elimina riga', onclick: () => { t.righe = t.righe.filter(x => x.id !== r.id); Stato.salva(t); } }, icona('x', 16)))))))),
    h('div.tenue.piccolo', null, righe.length + ' di ' + t.righe.length + ' righe' + (UI.tabOrd ? ' · ordinate' : '') + '. Le righe con una data compaiono anche nel calendario.'),
    h('button.btn.neutro', { onclick: () => { t.righe.push({ id: uid(), c: {} }); Stato.salva(t); } }, '+ Aggiungi riga'));
}
