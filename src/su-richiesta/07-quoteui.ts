// P0.65: vista diagnostica del router. I dati restano in IA; qui solo presentazione/eventi, senza polling.
const QuoteUI = (() => {
  const nomi: Record<string, string> = { groq: 'Groq', gemini: 'Gemini', xkiro: 'xkiro', cohere: 'Cohere', requesty: 'Requesty' };
  const ora = (n: number | null) => n ? new Date(n).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  function aggiorna(el: HTMLElement): void {
    const s = IA.snapshotQuote(), ps = Object.values(s.provider) as any[]; el.textContent = '';
    const disponibili = ps.filter(x => x.stato === 'pronto' || x.stato === 'guardia_85');
    el.append(h('p.piccolo', null, h('b', null, 'Provider in uso: '), s.attivo ? nomi[s.attivo] || s.attivo : 'nessuno'));
    if (!disponibili.length) {
      const prossimi = ps.map(x => x.ripristinoIl).filter(Boolean), quando = prossimi.length ? Math.min(...prossimi) : null;
      el.append(h('p.piccolo', { role: 'status' }, '⛔ Nessun provider disponibile' + (quando ? ' · prossimo tentativo utile ' + ora(quando) : ' · configura almeno una chiave valida.')));
    }
    el.append(h('ul.piccolo', null, ...ps.map(x => {
      const q = x.origineQuota === 'misurata' ? x.quotaDisponibile + ' richieste (misurata)' : x.origineQuota === 'stimata' ? (x.quotaStimata == null ? 'stima insufficiente' : 'circa ' + x.quotaStimata + ' richieste, stima locale') : 'quota sconosciuta';
      const motivo = x.stato === 'pronto' ? '' : x.stato === 'senza_chiave' ? ' · chiave assente' : x.stato === 'guardia_85' ? ' · soglia prudenziale 85%' : ' · ' + x.stato;
      return h('li', null, (s.attivo === x.id ? '▶ ' : '') + nomi[x.id] + ': ' + x.stato + motivo + ' · ' + q + (x.microBatchResidui == null ? '' : ' · ≤' + x.microBatchResidui + ' micro-batch') + (x.ripristinoIl ? ' · riprova ' + ora(x.ripristinoIl) : '') + (x.ultimoErroreHttp ? ' · HTTP ' + x.ultimoErroreHttp : '') + (x.ultimoErroreRete ? ' · ' + x.ultimoErroreRete : ''));
    })));
    if (s.failover.length) el.append(h('details', null, h('summary.piccolo', null, 'Failover recenti · ' + s.failover.length), h('ul.piccolo', null, ...s.failover.slice(-5).reverse().map(x => h('li', null, ora(x.quando) + ' · ' + x.da + ' → ' + x.a + ' · ' + x.motivo)))));
  }
  function pannello(): HTMLElement {
    const corpo = h('div', { 'data-quote-ai': '1' }), box = h('details.card', { open: true }, h('summary', null, 'Quote Free LLM API'), corpo);
    const ascolta = () => { if (box.isConnected) aggiorna(corpo); else window.removeEventListener('imc-ai-diagnostica', ascolta); };
    window.addEventListener('imc-ai-diagnostica', ascolta); aggiorna(corpo); return box;
  }
  return { pannello, aggiorna };
})();
