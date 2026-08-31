// Primitive condivise: data, identificativi, testo senza accenti.
// Estratte da app.js il 31/08/2026 (carenza "nota strutturale" del referto retrospettivo). Nessuna
// dipendenza, ne' da Preact ne' da localStorage: e' il fondo della pila, e va tenuto tale.

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const uid = () => Math.random().toString(36).slice(2, 10);
// FIX 21/07/2026: Legge 1 (Contesto Temporale Dinamico) richiede di controllare data/ora correnti prima
// di ogni risposta, ma nessun system prompt le comunicava mai al modello — ne è derivato un disallineamento
// temporale osservato (ricerca web che riportava "gennaio 2025" come se fosse attuale, con oggi 21/07/2026).
// Senza un ancoraggio esplicito il modello non ha modo di giudicare cosa sia "recente" o "vecchio".
const nowContext = () => {
  const d = new Date();
  const readable = d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Rome" });
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  return `Oggi è ${readable}, ore ${time} (Europe/Rome).`;
};

const daysSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
// Confronto senza accenti: il Ghost scrive indifferentemente "martedì" e "martedi", e una data
// persa per un accento sarebbe il piu' stupido dei modi di sbagliare un appuntamento.
function senzaAccenti(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

export {
  daysSince,
  fmtDate,
  nowContext,
  senzaAccenti,
  todayISO,
  uid,
};
