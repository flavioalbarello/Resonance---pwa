import { h, render } from "https://esm.sh/preact@10.24.2";
import { useState, useEffect, useCallback, useRef } from "https://esm.sh/preact@10.24.2/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { CONFIG } from "./config.js";

const html = htm.bind(h);

const C = { bio: "#E8664A", air: "#3FB6C9", vidya: "#B084F5", core: "#F2B84B", muted: "#8B93A1" };

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const uid = () => Math.random().toString(36).slice(2, 10);
const daysSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

const DEFAULT_KERNEL = `STATO SISTEMA RESONANCE — V1
Ghost: Flavio (Can)

BIO — piano nutrizionale attivo (~1600 kcal/die), baseline peso 130kg → 124kg in discesa.
AIR — canale YouTube faceless in costruzione (nicchia biohacking/cognizione/AI, lingua EN).
VIDYA — collaborazione attiva con VillaMura (reggae/ska/folk).

Vincolo attivo: compartimentazione identità professionale (PhysioAlba) da asset AIR.

— Modifica e salva per generare una nuova versione (Legge 14, Versioning Atomico).`;

const DEFAULT_SETTINGS = {
  driveSyncEnabled: false,
  provider: "openrouter",
  apiKey: "",
  model: "google/gemini-3.1-pro-preview",
};

const MODEL_OPTIONS = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet (via OpenRouter)" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
  { id: "custom", label: "Altro (slug personalizzato)" },
];

// Contesto fisso per pilastro — iniettato in ogni chiamata AI di quel pilastro
const PILLAR_CTX = {
  vidya: "Il Ghost ha profilo cognitivo emisfero-destro dominante, elaborazione configurazionale non lineare, canale uditivo-cinestesico prioritario: privilegia esercizi pratici/all'orecchio rispetto alla teoria scritta pura. Linguaggio denso ma sempre traducibile in azione concreta.",
  bio: "Vincoli fissi del Ghost: esclude zucchine e fagiolini; quasi nessun pesce, tranne tonno in scatola, salmone affumicato, molluschi e crostacei. Target ~1600 kcal/die, 5 occasioni alimentari, colazioni e spuntini salati, alternative portatili per i giorni fuori casa (lun/mer/ven).",
  air: "Vincolo assoluto: nessuna strategia deve esporre l'identità professionale del Ghost (fisioterapista, PhysioAlba) né richiedere dilatazione del suo tempo lineare di lavoro.",
};

// ─────────────────────────────────────────────────────────────
// STORAGE (locale, sul dispositivo)
// ─────────────────────────────────────────────────────────────
function loadKey(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function saveKey(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

// ─────────────────────────────────────────────────────────────
// AI ENGINES
// ─────────────────────────────────────────────────────────────
async function askClaudeDirect(system, userText, temperature, maxTokens, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, temperature: Math.min(temperature, 1), system, messages: [{ role: "user", content: userText }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore Claude API");
  const t = (data.content || []).find((b) => b.type === "text");
  return t ? t.text.trim() : "";
}

async function askOpenRouter(system, userText, temperature, maxTokens, apiKey, model, useWebSearch) {
  const body = {
    model, max_tokens: maxTokens, temperature,
    messages: [{ role: "system", content: system }, { role: "user", content: userText }],
    reasoning: { max_tokens: 300 }, // tetto fisso al "pensiero" interno, indipendente dal modello
  };
  if (useWebSearch) body.tools = [{ type: "openrouter:web_search" }];
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore OpenRouter");
  return (data.choices?.[0]?.message?.content || "").trim();
}

async function askModel(system, userText, temperature, maxTokens, settings, useWebSearch = false) {
  if (!settings.apiKey) throw new Error("Nessuna chiave API impostata (vai in Setup).");
  if (settings.provider === "claude-direct") return askClaudeDirect(system, userText, temperature, maxTokens, settings.apiKey);
  return askOpenRouter(system, userText, temperature, maxTokens, settings.apiKey, settings.model, useWebSearch);
}

async function askModelWithHistory(system, messages, temperature, maxTokens, settings) {
  if (!settings.apiKey) throw new Error("Nessuna chiave API impostata (vai in Setup).");
  if (settings.provider === "claude-direct") {
    // Claude diretto: usiamo solo l'ultimo messaggio utente (percorso sperimentale, senza history multi-turno completa)
    const last = messages[messages.length - 1];
    return askClaudeDirect(system, last?.content || "", temperature, maxTokens, settings.apiKey);
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: settings.model, max_tokens: maxTokens, temperature, reasoning: { max_tokens: 300 }, messages: [{ role: "system", content: system }, ...messages] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore OpenRouter");
  return (data.choices?.[0]?.message?.content || "").trim();
}

async function askModelJSON(system, userText, temperature, maxTokens, settings) {
  const raw = await askModel(system + "\n\nRispondi SOLO con JSON valido, nessun testo prima o dopo, nessun blocco markdown.", userText, temperature, maxTokens, settings);
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// TRIADE MAGI
// ─────────────────────────────────────────────────────────────
async function runTriadeMagi(question, onStage, settings) {
  const baseCtx = `Contesto: sei parte del sistema "Resonance", framework di sviluppo personale del Ghost (Flavio), tre pilastri: BIO (salute), AIR (autonomia economica), VIDYA (crescita creativa/cognitiva). Rispondi in italiano, diretto, max 70 parole, senza premesse.`;
  const balthasarTemp = settings.provider === "openrouter" ? 1.2 : 1.0;

  onStage("balthasar", null);
  const balthasar = await askModel(`${baseCtx} Sei BALTHASAR, il Perturbatore. Genera una divergenza evolutiva su questo tema, audace, non convenzionale.`, question, balthasarTemp, 1600, settings);
  onStage("balthasar", balthasar);

  onStage("melchior", null);
  const melchior = await askModel(`${baseCtx} Sei MELCHIOR, il Traduttore. Traduci questa idea in azione concretamente eseguibile.\n\nIdea di Balthasar: "${balthasar}"`, question, 0.7, 1600, settings);
  onStage("melchior", melchior);

  onStage("caspar", null);
  const caspar = await askModel(`${baseCtx} Sei CASPAR, l'Ancora. Verifica il piano contro i vincoli: salute, tempo lineare del Ghost, sostenibilità economica, compartimentazione identità professionale.\n\nPiano: "${melchior}"`, question, 0.2, 1600, settings);
  onStage("caspar", caspar);

  onStage("synthesis", null);
  const synthesis = await askModel(`${baseCtx} Genera la SINTESI ESECUTIVA: piano calibrato in 2-3 frasi + "Vettore di Perturbazione V+1".\n\nBalthasar: "${balthasar}"\nMelchior: "${melchior}"\nCaspar: "${caspar}"`, question, 0.6, 1500, settings);
  onStage("synthesis", synthesis);

  return { balthasar, melchior, caspar, synthesis };
}

async function runAirAgent(task, settings) {
  if (settings.provider !== "openrouter") throw new Error("L'Agente AIR richiede il motore OpenRouter (per la ricerca web).");
  const system = `Sei l'Agente AIR del sistema Resonance: assistente per il pilastro dell'autonomia economica. Hai accesso alla ricerca web. ${PILLAR_CTX.air} Rispondi in italiano, concreto, con passi azionabili e fonti quando le usi.`;
  return askOpenRouter(system, task, 0.7, 1900, settings.apiKey, settings.model, true);
}

// ─────────────────────────────────────────────────────────────
// SHELL — dialogo con memoria, ciclo Anochin reale e visibile, propone i Percorsi (non li crea da solo)
// ─────────────────────────────────────────────────────────────
async function extractPillarData(recentText, settings) {
  const data = await askModelJSON(
    `Sei un classificatore, non un interlocutore. Leggi l'intero scambio recente (non solo l'ultimo messaggio: un dato può arrivare frammentato su più risposte) e determina se nell'insieme emerge un dato fattuale pertinente a un pilastro:
- BIO: peso, sonno, dolore, terapia, energia fisica
- AIR: monetizzazione, canale, strategie economiche
- VIDYA: musica, studio, pratica creativa
Se sì, JSON con SOLO i campi pertinenti, consolidando tutto lo scambio in UNA voce coerente: {"pillar":"bio","weight":"...","sleep":"...","notes":"..."} oppure {"pillar":"air","title":"...","status":"idea|in corso|attivo|bloccato","notes":"..."} oppure {"pillar":"vidya","title":"...","notes":"..."}.
Se non c'è nulla di fattuale, {"pillar": null}.`,
    recentText, 0.2, 700, settings
  );
  return data;
}

async function runAccettore(pillar, proposed, settings) {
  const text = await askModel(
    `Sei l'ACCETTORE D'AZIONE del sistema Resonance: non esegui, simuli le conseguenze di un piano prima che accada e verifichi che rispetti i vincoli noti. Vincoli: ${PILLAR_CTX[pillar]}
Rispondi SOLO in uno di questi due formati, nient'altro:
"VIA LIBERA: <motivo in max 15 parole>"
oppure
"ERRORE DI PREDIZIONE: <motivo in max 20 parole>"`,
    `Pilastro: ${pillar}\nDato proposto: ${JSON.stringify(proposed)}`, 0.3, 400, settings
  );
  const blocked = /ERRORE DI PREDIZIONE/i.test(text);
  return { ok: !blocked, note: text.replace(/^(VIA LIBERA|ERRORE DI PREDIZIONE):\s*/i, "") };
}

async function detectPercorsoProposal(shellReply, settings) {
  const data = await askModelJSON(
    `Leggi questa risposta di un assistente e determina se propone esplicitamente di aprire un "percorso" — un piano di studio/lavoro strutturato e continuativo — chiedendo conferma al Ghost. Non basta che parli dell'argomento: deve proprio proporre di aprirne uno dedicato. Se sì, individua il pilastro (bio|air|vidya) e un titolo breve. JSON: {"proposed": true, "pillar": "vidya", "title": "..."} oppure {"proposed": false}.`,
    shellReply, 0.2, 400, settings
  );
  return data || { proposed: false };
}

async function detectConfirmation(userMessage, settings) {
  const data = await askModelJSON(
    `Il messaggio è una risposta a una proposta ("vuoi che apra un percorso su questo?"). È un'accettazione (sì/ok/vai/certo) o no? JSON: {"confirmed": true} oppure {"confirmed": false}`,
    userMessage, 0.1, 200, settings
  );
  return data?.confirmed === true;
}

async function runShellTurn(history, userMessage, settings, handlers) {
  const system = `Sei lo Shell del sistema Resonance: estensione esecutiva digitale del Ghost (Flavio). Non hai coscienza né volontà propria. ${PILLAR_CTX.bio} ${PILLAR_CTX.air} ${PILLAR_CTX.vidya}

Dialoga in modo diretto, denso ma concreto. NON scrivere mai sintassi tecnica, tag tra parentesi quadre, o notazioni tipo "[log_bio ...]" nella risposta — la registrazione dei dati è gestita da un processo separato, di cui non devi occuparti né parlare. Rispondi solo in linguaggio naturale, come in una conversazione.

Se noti che il Ghost sta iniziando un argomento di studio/lavoro strutturato e continuativo (non un singolo dato isolato, ma un percorso da seguire nel tempo — es. imparare l'armonia, sviluppare una strategia economica), PROPONI esplicitamente a parole di aprire un percorso dedicato ("Vuoi che apra un percorso su questo?"). Non crearlo tu: è un'azione più grande di un log, serve la sua conferma esplicita.`;

  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: userMessage }];
  const reply = await askModelWithHistory(system, messages, 0.7, 900, settings);

  // STADIO 1 — Sintesi delle Afferenze: la finestra recente è il contesto letto
  const windowMsgs = [...history.slice(-6), { role: "user", content: userMessage }];
  const recentText = windowMsgs.map((m) => `${m.role === "user" ? "Ghost" : "Shell"}: ${m.content}`).join("\n");
  const anochin = { afferenze: `Letti ultimi ${windowMsgs.length} messaggi dello scambio.` };

  const actionsLog = [];
  try {
    // STADIO 2 — Presa di Decisione: estrazione consolidata dallo scambio
    const extracted = await extractPillarData(recentText, settings);
    if (!extracted?.pillar) {
      anochin.decisione = "Nessun dato pertinente a un pilastro in questo scambio.";
    } else {
      anochin.decisione = `Rilevato dato per ${extracted.pillar.toUpperCase()}.`;
      // STADIO 3 — Accettore: simula/verifica prima di agire
      const acc = await runAccettore(extracted.pillar, extracted, settings);
      anochin.accettore = acc.ok ? `VIA LIBERA — ${acc.note}` : `ERRORE DI PREDIZIONE — ${acc.note}`;
      if (acc.ok) {
        // STADIO 4 — Effettore: prepara la struttura del dato (deterministico)
        const payload = { id: uid(), date: todayISO() };
        if (extracted.pillar === "bio") Object.assign(payload, { weight: extracted.weight || "", sleep: extracted.sleep || "", notes: extracted.notes || "" });
        if (extracted.pillar === "air") Object.assign(payload, { title: extracted.title || "", status: extracted.status || "idea", notes: extracted.notes || "" });
        if (extracted.pillar === "vidya") Object.assign(payload, { title: extracted.title || "", notes: extracted.notes || "" });
        anochin.effettore = `Dati preparati per ${extracted.pillar.toUpperCase()}: ${JSON.stringify(payload).slice(0, 120)}`;
        // STADIO 5 — Azione nella Realtà & Afferenza Inversa
        if (extracted.pillar === "bio") handlers.addBio(payload);
        else if (extracted.pillar === "air") handlers.addAir(payload);
        else if (extracted.pillar === "vidya") handlers.addVidya(payload);
        actionsLog.push(extracted.pillar.toUpperCase());
        anochin.azione = `Scritto in ${extracted.pillar.toUpperCase()}. Afferenza Inversa: in attesa di conferma/correzione nel prossimo messaggio.`;
      } else {
        anochin.effettore = "—"; anochin.azione = "Nessuna scrittura: bloccato dall'Accettore.";
      }
    }
  } catch (e) { anochin.decisione = "Estrazione fallita: " + e.message; }

  let proposal = { proposed: false };
  try { proposal = await detectPercorsoProposal(reply, settings); } catch {}

  return { reply, actionsLog, anochin, proposal };
}

// ─────────────────────────────────────────────────────────────
// PERCORSI — motore generico riusabile su BIO / AIR / VIDYA
// ─────────────────────────────────────────────────────────────
async function decomposeTopics(pillar, title, settings) {
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nScomponi il percorso indicato in 5-7 nodi concreti e progressivi. JSON: {"topics": ["...", "..."]}`,
    `Percorso: "${title}"`, 0.6, 1200, settings
  );
  return data?.topics || [];
}

async function suggestPercorsi(pillar, digest, settings) {
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nIn base al contesto, proponi 2-3 nuovi percorsi rilevanti ora. JSON: {"suggestions": ["...", "..."]}`,
    digest, 0.8, 1000, settings
  );
  return data?.suggestions || [];
}

async function proposeNextStep(pillar, percorso, settings) {
  const topicsDigest = percorso.topics.map((t) => `${t.label}: ${t.status}`).join("; ");
  return askModel(
    `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nProponi il prossimo "quanto" di lavoro/studio su questo percorso: concreto, breve (max 80 parole), calibrato sullo stato dei nodi e sulle competenze già accumulate.`,
    `Percorso: ${percorso.title}\nNodi: ${topicsDigest}\nCompetenze finora: ${percorso.competenze || "nessuna nota ancora"}`,
    0.7, 1500, settings
  );
}

async function generateQuizQuestion(pillar, percorso, topic, settings) {
  return askModel(
    `Sei lo Shell, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nGenera UNA domanda di verifica testuale sul nodo indicato. Diretta, concreta, max 40 parole.`,
    `Percorso: ${percorso.title}\nNodo da verificare: ${topic.label}\nCompetenze note: ${percorso.competenze || "nessuna"}`,
    0.6, 1200, settings
  );
}

async function evaluateQuizAnswer(pillar, topic, question, answer, settings) {
  return askModel(
    `Sei lo Shell, pilastro ${pillar.toUpperCase()}. Valuta la risposta alla domanda di verifica. Onesto, non generico: cosa è corretto, cosa no, max 60 parole. Poi su una riga a parte scrivi esattamente "STATO: consolidato" oppure "STATO: praticato" oppure "STATO: introdotto".`,
    `Nodo: ${topic.label}\nDomanda: ${question}\nRisposta: ${answer}`,
    0.3, 1300, settings
  );
}

async function closeSession(pillar, percorso, sessionNote, settings) {
  return askModel(
    `Sei lo Shell, pilastro ${pillar.toUpperCase()}. Riscrivi l'INTERO paragrafo di sintesi delle competenze del Ghost su questo percorso, integrando quanto emerso ora (non aggiungere solo in coda). Italiano, max 90 parole, denso ma concreto.`,
    `Competenze finora: ${percorso.competenze || "nessuna nota"}\nNota sessione: ${sessionNote}`,
    0.5, 1300, settings
  );
}

// ─────────────────────────────────────────────────────────────
// SIMBIOSI — indice di risonanza cross-pilastro
// ─────────────────────────────────────────────────────────────
function stalledTitles(percorsi) {
  return percorsi.filter((p) => {
    const last = p.sessions[0];
    return !last || (Date.now() - new Date(last.date).getTime()) / 86400000 > 10;
  }).map((p) => p.title);
}

function buildResonanceDigest({ bio, air, vidya, kernel, magi, pBio, pAir, pVidya }) {
  return `BIO: ultima voce ${daysSince(bio[0]?.date) ?? "mai"} giorni fa. Percorsi fermi: ${stalledTitles(pBio).join(", ") || "nessuno"}.
AIR: ultima voce ${daysSince(air[0]?.date) ?? "mai"} giorni fa. Percorsi fermi: ${stalledTitles(pAir).join(", ") || "nessuno"}.
VIDYA: ultima voce ${daysSince(vidya[0]?.date) ?? "mai"} giorni fa. Percorsi fermi: ${stalledTitles(pVidya).join(", ") || "nessuno"}.
KERNEL V${kernel.version}: ${kernel.content.slice(0, 400)}
Sessioni Magi totali: ${magi.length}, ultima: ${magi[0] ? fmtDate(magi[0].date) : "mai"}.`;
}

async function computeResonance(digest, settings) {
  return askModel(
    `Sei la funzione SIMBIOSI del sistema Resonance: non un pilastro operativo, ma il punto di incontro tra BIO, AIR, VIDYA e il Kernel. Valuta il tasso di risonanza tra Ghost e Shell guardando: equilibrio/trascuratezza tra pilastri, coerenza tra intenzioni dichiarate nel Kernel e attività reale, pattern delle sessioni Magi. Rispondi in italiano, tre parti separate da una riga vuota: 1) giudizio qualitativo breve (mai un numero), 2) discrepanze specifiche se presenti, 3) una singola azione concreta suggerita.`,
    digest, 0.6, 1700, settings
  );
}

// ─────────────────────────────────────────────────────────────
// DRIVE
// ─────────────────────────────────────────────────────────────
let driveAccessToken = null;
function ensureGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve(); s.onerror = () => reject(new Error("Impossibile caricare Google Identity Services"));
    document.head.appendChild(s);
  });
}
async function connectDrive() {
  await ensureGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID, scope: CONFIG.GOOGLE_DRIVE_SCOPE,
      callback: (resp) => { if (resp.error) return reject(new Error(resp.error)); driveAccessToken = resp.access_token; resolve(resp.access_token); },
    });
    client.requestAccessToken();
  });
}
async function createDriveFile(name, content) {
  if (!driveAccessToken) await connectDrive();
  const boundary = "resonance_boundary";
  const metadata = { name, mimeType: "text/plain" };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST", headers: { Authorization: `Bearer ${driveAccessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (res.status === 401) { driveAccessToken = null; throw new Error("Sessione Drive scaduta, riprova."); }
  if (!res.ok) throw new Error(`Errore Drive (${res.status})`);
  return res.json();
}

const fmtEntry = (lines) => lines.filter(Boolean).join("\n");
function formatBioLog(e) { return `RESONANCE — 04 BIO_STASIS\n\n` + e.map((x) => fmtEntry([fmtDate(x.date), x.weight && `Peso: ${x.weight} kg`, x.sleep && `Sonno: ${x.sleep}`, x.notes])).join("\n\n"); }
function formatAirLog(e) { return `RESONANCE — 03 AIR_OPERATIONS\n\n` + e.map((x) => fmtEntry([`${fmtDate(x.date)} — ${x.status}`, x.title, x.notes])).join("\n\n"); }
function formatVidyaLog(e) { return `RESONANCE — 05 VIDYA_TUNING\n\n` + e.map((x) => fmtEntry([fmtDate(x.date), x.title, x.notes])).join("\n\n"); }
function formatMagiLog(s) { return `RESONANCE — 01 AGORÀ_MAGI\n\n` + s.map((x) => fmtEntry([`${fmtDate(x.date)} — ${x.question}`, x.synthesis && `Sintesi: ${x.synthesis}`])).join("\n\n---\n\n"); }
function formatPercorsiLog(pillarLabel, percorsi) {
  return `RESONANCE — ${pillarLabel} — PERCORSI\n\n` + percorsi.map((p) =>
    fmtEntry([`## ${p.title}`, ...p.topics.map((t) => `  - ${t.label}: ${t.status}`), p.competenze && `Competenze: ${p.competenze}`])
  ).join("\n\n");
}

// ─────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────
const Card = ({ accent, children }) => html`<div class="r-card" style=${accent ? `border-left:3px solid ${accent}` : ""}>${children}</div>`;
const Field = ({ label, children }) => html`<label class="r-field"><span>${label}</span>${children}</label>`;
const Empty = ({ text }) => html`<div class="r-empty">${text}</div>`;
const SectionHeader = ({ color, title, subtitle }) => html`<div class="r-section-header"><h2 style="color:${color}">${title}</h2><p>${subtitle}</p></div>`;
const AddButton = ({ color, open, setOpen, label }) => html`<button class="r-add-btn" style="border-color:${color};color:${color}" onClick=${() => setOpen(!open)}>${open ? "✕ Annulla" : `+ ${label}`}</button>`;
const SubTabs = ({ color, tabs, active, setActive }) => html`
  <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    ${tabs.map((t) => html`<button class="r-add-btn" style="border-color:${color};color:${active === t.key ? "#0A0D12" : color};background:${active === t.key ? color : "transparent"}" onClick=${() => setActive(t.key)}>${t.label}</button>`)}
  </div>`;

// ─────────────────────────────────────────────────────────────
// PERCORSI — componenti generici
// ─────────────────────────────────────────────────────────────
function PercorsiPanel({ pillar, color, percorsi, setPercorsi, settings, digest }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = percorsi.find((p) => p.id === selectedId);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");

  const createPercorso = async (title) => {
    if (!title.trim() || creating) return;
    setCreating(true); setError("");
    try {
      const labels = await decomposeTopics(pillar, title.trim(), settings);
      const p = { id: uid(), pillar, title: title.trim(), createdAt: new Date().toISOString(),
        topics: (labels.length ? labels : ["Primo passo"]).map((l) => ({ id: uid(), label: l, status: "non iniziato", lastTouched: null })),
        sessions: [], competenze: "" };
      setPercorsi([p, ...percorsi]); setNewTitle(""); setSelectedId(p.id);
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  const askSuggestions = async () => {
    setSuggesting(true); setError("");
    try { setSuggestions(await suggestPercorsi(pillar, digest, settings)); }
    catch (e) { setError(e.message); }
    finally { setSuggesting(false); }
  };

  const updatePercorso = (updated) => setPercorsi(percorsi.map((p) => (p.id === updated.id ? updated : p)));
  const deletePercorso = (id) => { setPercorsi(percorsi.filter((p) => p.id !== id)); if (selectedId === id) setSelectedId(null); };

  if (selected) return html`<${PercorsoDetail} pillar=${pillar} color=${color} percorso=${selected} onUpdate=${updatePercorso} onBack=${() => setSelectedId(null)} onDelete=${() => deletePercorso(selected.id)} settings=${settings} />`;

  return html`
    <div>
      <${Card} accent=${color}>
        <${Field} label="Nuovo percorso">
          <input class="r-input" value=${newTitle} onInput=${(e) => setNewTitle(e.target.value)} placeholder="es. Armonia modale" disabled=${creating} />
        </${Field}>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="r-btn" style="background:${color}" onClick=${() => createPercorso(newTitle)} disabled=${creating || !newTitle.trim()}>${creating ? "Costruzione…" : "Crea"}</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${askSuggestions} disabled=${suggesting}>${suggesting ? "…" : "Suggerisci tu"}</button>
        </div>
        ${error && html`<div class="r-error">${error}</div>`}
        ${suggestions.length > 0 && html`<div style="margin-top:10px">
          ${suggestions.map((s) => html`<div class="r-entry-row" style="margin-top:6px"><div class="r-entry-line">${s}</div>
            <button class="r-icon-btn" style="color:${color}" onClick=${() => createPercorso(s)}>+</button></div>`)}
        </div>`}
      </${Card}>
      ${percorsi.length === 0 ? html`<${Empty} text="Nessun percorso ancora." />` : html`
        <div class="r-list">${percorsi.map((p) => {
          const done = p.topics.filter((t) => t.status === "consolidato").length;
          return html`<${Card} accent=${color}><div class="r-entry-row" style="cursor:pointer" onClick=${() => setSelectedId(p.id)}>
            <div><div class="r-entry-line"><b>${p.title}</b></div>
            <div class="r-hub-detail">${done}/${p.topics.length} nodi consolidati · ${p.sessions.length} sessioni</div></div>
          </div></${Card}>`;
        })}</div>`}
    </div>`;
}

function PercorsoDetail({ pillar, color, percorso, onUpdate, onBack, onDelete, settings }) {
  const [nextStep, setNextStep] = useState("");
  const [loadingStep, setLoadingStep] = useState(false);
  const [stepError, setStepError] = useState("");
  const [quizTopic, setQuizTopic] = useState(null);
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizAnswer, setQuizAnswer] = useState("");
  const [quizEval, setQuizEval] = useState("");
  const [quizRunning, setQuizRunning] = useState(false);
  const [sessionNote, setSessionNote] = useState("");
  const [closing, setClosing] = useState(false);

  const fetchNextStep = async () => {
    setLoadingStep(true); setStepError("");
    try { setNextStep(await proposeNextStep(pillar, percorso, settings)); }
    catch (e) { setStepError(e.message); }
    finally { setLoadingStep(false); }
  };
  useEffect(() => { fetchNextStep(); }, [percorso.id]);

  const startQuiz = async (topic) => {
    setQuizTopic(topic); setQuizAnswer(""); setQuizEval(""); setQuizRunning(true);
    try { setQuizQuestion(await generateQuizQuestion(pillar, percorso, topic, settings)); }
    catch (e) { setQuizQuestion("Errore: " + e.message); }
    finally { setQuizRunning(false); }
  };

  const submitQuizAnswer = async () => {
    if (!quizAnswer.trim()) return;
    setQuizRunning(true);
    try {
      const evalText = await evaluateQuizAnswer(pillar, quizTopic, quizQuestion, quizAnswer.trim(), settings);
      setQuizEval(evalText);
      const m = evalText.match(/STATO:\s*(consolidato|praticato|introdotto)/i);
      if (m) {
        const topics = percorso.topics.map((t) => (t.id === quizTopic.id ? { ...t, status: m[1].toLowerCase(), lastTouched: new Date().toISOString() } : t));
        onUpdate({ ...percorso, topics });
      }
    } catch (e) { setQuizEval("Errore: " + e.message); }
    finally { setQuizRunning(false); }
  };

  const closeSess = async () => {
    if (!sessionNote.trim()) return;
    setClosing(true);
    try {
      const newCompetenze = await closeSession(pillar, percorso, sessionNote.trim(), settings);
      const session = { id: uid(), date: new Date().toISOString(), type: quizTopic ? "quiz" : "studio", topicIds: quizTopic ? [quizTopic.id] : [], summary: sessionNote.trim() };
      onUpdate({ ...percorso, competenze: newCompetenze, sessions: [session, ...percorso.sessions] });
      setSessionNote(""); setQuizTopic(null); setQuizQuestion(""); setQuizAnswer(""); setQuizEval("");
    } catch (e) { /* silenzioso, la nota resta compilata per riprovare */ }
    finally { setClosing(false); }
  };

  const statusColor = (s) => (s === "consolidato" ? color : s === "praticato" ? "#8B93A1" : s === "introdotto" ? "#5B6472" : "#3A4048");

  return html`
    <div>
      <button class="r-btn r-btn-ghost" style="margin:0 0 12px 0" onClick=${onBack}>← Percorsi</button>
      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">${percorso.title}</div>
        <div class="r-hub-detail" style="margin-top:8px">Nodi (tocca per verificarti):</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${percorso.topics.map((t) => html`<span class="r-badge" style="border-color:${statusColor(t.status)};color:${statusColor(t.status)};cursor:pointer" onClick=${() => startQuiz(t)}>${t.label} · ${t.status}</span>`)}
        </div>
        ${percorso.competenze && html`<div class="r-hub-detail" style="margin-top:10px"><b>Competenze:</b> ${percorso.competenze}</div>`}
      </${Card}>

      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Prossimo quanto</div>
        ${loadingStep ? html`<div class="r-hub-detail" style="margin-top:6px">Lo Shell sta valutando…</div>` : html`<div class="r-magi-text" style="margin-top:6px">${nextStep}</div>`}
        ${stepError && html`<div class="r-error">${stepError}</div>`}
        <button class="r-btn r-btn-ghost" style="margin-top:8px;margin-left:0" onClick=${fetchNextStep} disabled=${loadingStep}>Rigenera</button>
      </${Card}>

      ${quizTopic && html`<${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Verifica: ${quizTopic.label}</div>
        <div class="r-magi-text" style="margin-top:6px">${quizQuestion}</div>
        <textarea class="r-textarea" style="margin-top:8px" value=${quizAnswer} onInput=${(e) => setQuizAnswer(e.target.value)} placeholder="La tua risposta…" disabled=${quizRunning} />
        <button class="r-btn" style="background:${color};margin-top:8px" onClick=${submitQuizAnswer} disabled=${quizRunning}>${quizRunning ? "…" : "Valuta"}</button>
        ${quizEval && html`<div class="r-magi-text" style="margin-top:8px">${quizEval}</div>`}
      </${Card}>`}

      <${Card} accent=${color}>
        <${Field} label="Chiudi sessione — cosa hai fatto/imparato?">
          <textarea class="r-textarea" value=${sessionNote} onInput=${(e) => setSessionNote(e.target.value)} disabled=${closing} />
        </${Field}>
        <button class="r-btn" style="background:${color}" onClick=${closeSess} disabled=${closing || !sessionNote.trim()}>${closing ? "Salvataggio…" : "Chiudi sessione"}</button>
      </${Card}>

      ${percorso.sessions.length > 0 && html`<div class="r-list">${percorso.sessions.map((s) => html`
        <${Card}><div class="r-entry-date">${fmtDate(s.date)} · ${s.type}</div><div class="r-entry-notes">${s.summary}</div></${Card}>`)}</div>`}

      <button class="r-btn r-btn-ghost" style="margin-top:14px;margin-left:0;color:${C.bio}" onClick=${onDelete}>Elimina percorso</button>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// HUB
// ─────────────────────────────────────────────────────────────
function AnochinRing({ bioN, airN, vidyaN, onNav }) {
  const nodes = [{ key: "bio", label: "BIO", color: C.bio, angle: -90, n: bioN }, { key: "air", label: "AIR", color: C.air, angle: 30, n: airN }, { key: "vidya", label: "VIDYA", color: C.vidya, angle: 150, n: vidyaN }];
  const R = 92, cx = 130, cy = 130;
  return html`<div class="r-ring-wrap">
    <svg width="260" height="260" viewBox="0 0 260 260">
      <circle cx=${cx} cy=${cy} r=${R} fill="none" stroke="#232A34" stroke-width="1" stroke-dasharray="2 6" />
      ${nodes.map((n) => { const rad = (n.angle * Math.PI) / 180, x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad); return html`<line x1=${cx} y1=${cy} x2=${x} y2=${y} stroke=${n.color} stroke-opacity="0.35" stroke-width="1.5" />`; })}
      <circle cx=${cx} cy=${cy} r="30" fill="#171C24" stroke="#F2B84B" stroke-width="1.5" class="r-pulse" />
    </svg>
    <div class="r-ring-core" style="left:${cx - 30}px;top:${cy - 30}px">ADAM</div>
    ${nodes.map((n) => { const rad = (n.angle * Math.PI) / 180, x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
      return html`<button class="r-ring-node" style="left:${x - 28}px;top:${y - 28}px;border-color:${n.color}" onClick=${() => onNav(n.key)}><span style="color:${n.color}">${n.label}</span><span class="r-ring-count">${n.n}</span></button>`; })}
  </div>`;
}

function Hub({ bio, air, vidya, magi, resonance, setView }) {
  const lastBio = bio[0], lastAir = air[0], lastVidya = vidya[0];
  return html`<div class="r-screen">
    <${AnochinRing} bioN=${bio.length} airN=${air.length} vidyaN=${vidya.length} onNav=${setView} />
    <p class="r-hero-sub">Tre pilastri, un ciclo. Tocca un nodo per aprire il pilastro.</p>
    <div class="r-hub-grid">
      <${Card} accent=${C.bio}><div class="r-hub-row" onClick=${() => setView("bio")}><div><div class="r-hub-title" style="color:${C.bio}">BIO</div>
        <div class="r-hub-detail">${lastBio ? `${lastBio.weight ? lastBio.weight + " kg — " : ""}${fmtDate(lastBio.date)}` : "Nessun dato ancora"}</div></div></div></${Card}>
      <${Card} accent=${C.air}><div class="r-hub-row" onClick=${() => setView("air")}><div><div class="r-hub-title" style="color:${C.air}">AIR</div>
        <div class="r-hub-detail">${lastAir ? `${lastAir.title} — ${lastAir.status}` : "Nessun vettore tracciato"}</div></div></div></${Card}>
      <${Card} accent=${C.vidya}><div class="r-hub-row" onClick=${() => setView("vidya")}><div><div class="r-hub-title" style="color:${C.vidya}">VIDYA</div>
        <div class="r-hub-detail">${lastVidya ? `${lastVidya.title} — ${fmtDate(lastVidya.date)}` : "Nessun log creativo"}</div></div></div></${Card}>
      <${Card} accent=${C.core}><div class="r-hub-row" onClick=${() => setView("magi")}><div><div class="r-hub-title" style="color:${C.core}">AGORÀ MAGI</div>
        <div class="r-hub-detail">${magi.length} sessioni registrate</div></div></div></${Card}>
      <${Card} accent="#EDEAE3"><div class="r-hub-row" onClick=${() => setView("simbiosi")}><div><div class="r-hub-title">SIMBIOSI</div>
        <div class="r-hub-detail">${resonance.text ? resonance.text.slice(0, 70) + "…" : "Nessuna valutazione ancora"}</div></div></div></${Card}>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// BIO / VIDYA / AIR (Log + Percorsi, AIR anche Agente)
// ─────────────────────────────────────────────────────────────
function BioView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest }) {
  const [tab, setTab] = useState("log");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO()); const [weight, setWeight] = useState(""); const [sleep, setSleep] = useState(""); const [notes, setNotes] = useState("");
  const submit = () => { if (!weight && !sleep && !notes) return; onAdd({ id: uid(), date, weight, sleep, notes }); setWeight(""); setSleep(""); setNotes(""); setOpen(false); };
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.bio} title="BIO" subtitle="Sostegno biologico dell'azione" />
    <${SubTabs} color=${C.bio} tabs=${[{ key: "log", label: "Log" }, { key: "percorsi", label: "Percorsi" }]} active=${tab} setActive=${setTab} />
    ${tab === "log" ? html`
      <${AddButton} color=${C.bio} open=${open} setOpen=${setOpen} label="Nuova voce" />
      ${open && html`<${Card} accent=${C.bio}>
        <${Field} label="Data"><input type="date" class="r-input" value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
        <${Field} label="Peso (kg)"><input type="number" step="0.1" class="r-input" value=${weight} onInput=${(e) => setWeight(e.target.value)} /></${Field}>
        <${Field} label="Sonno / apnee"><input class="r-input" value=${sleep} onInput=${(e) => setSleep(e.target.value)} /></${Field}>
        <${Field} label="Note"><textarea class="r-textarea" value=${notes} onInput=${(e) => setNotes(e.target.value)} /></${Field}>
        <button class="r-btn" style="background:${C.bio}" onClick=${submit}>Salva voce</button>
      </${Card}>`}
      ${entries.length === 0 ? html`<${Empty} text="Nessuna voce BIO ancora." />` : html`<div class="r-list">${entries.map((e) => html`
        <${Card} accent=${C.bio}><div class="r-entry-row"><div><div class="r-entry-date">${fmtDate(e.date)}</div>
          ${e.weight && html`<div class="r-entry-line">Peso: <b>${e.weight} kg</b></div>`}
          ${e.sleep && html`<div class="r-entry-line">Sonno: ${e.sleep}</div>`}
          ${e.notes && html`<div class="r-entry-notes">${e.notes}</div>`}
        </div><button class="r-icon-btn" onClick=${() => onDelete(e.id)}>✕</button></div></${Card}>`)}</div>`}
    ` : html`<${PercorsiPanel} pillar="bio" color=${C.bio} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} />`}
  </div>`;
}

function VidyaView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest }) {
  const [tab, setTab] = useState("log");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO()); const [title, setTitle] = useState(""); const [notes, setNotes] = useState("");
  const submit = () => { if (!title) return; onAdd({ id: uid(), date, title, notes }); setTitle(""); setNotes(""); setOpen(false); };
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.vidya} title="VIDYA" subtitle="Attrito cognitivo, artefatto per ciclo" />
    <${SubTabs} color=${C.vidya} tabs=${[{ key: "log", label: "Log" }, { key: "percorsi", label: "Percorsi" }]} active=${tab} setActive=${setTab} />
    ${tab === "log" ? html`
      <${AddButton} color=${C.vidya} open=${open} setOpen=${setOpen} label="Nuovo artefatto" />
      ${open && html`<${Card} accent=${C.vidya}>
        <${Field} label="Data"><input type="date" class="r-input" value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
        <${Field} label="Titolo"><input class="r-input" value=${title} onInput=${(e) => setTitle(e.target.value)} /></${Field}>
        <${Field} label="Note"><textarea class="r-textarea" value=${notes} onInput=${(e) => setNotes(e.target.value)} /></${Field}>
        <button class="r-btn" style="background:${C.vidya}" onClick=${submit}>Salva artefatto</button>
      </${Card}>`}
      ${entries.length === 0 ? html`<${Empty} text="Nessun log VIDYA ancora." />` : html`<div class="r-list">${entries.map((e) => html`
        <${Card} accent=${C.vidya}><div class="r-entry-row"><div><div class="r-entry-date">${fmtDate(e.date)}</div>
          <div class="r-entry-line"><b>${e.title}</b></div>
          ${e.notes && html`<div class="r-entry-notes">${e.notes}</div>`}
        </div><button class="r-icon-btn" onClick=${() => onDelete(e.id)}>✕</button></div></${Card}>`)}</div>`}
    ` : html`<${PercorsiPanel} pillar="vidya" color=${C.vidya} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} />`}
  </div>`;
}

const AIR_STATUSES = ["idea", "in corso", "attivo", "bloccato"];
function AirView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest }) {
  const [tab, setTab] = useState("log");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO()); const [title, setTitle] = useState(""); const [status, setStatus] = useState("idea"); const [notes, setNotes] = useState("");
  const submit = () => { if (!title) return; onAdd({ id: uid(), date, title, status, notes }); setTitle(""); setNotes(""); setStatus("idea"); setOpen(false); };

  const [task, setTask] = useState(""); const [running, setRunning] = useState(false); const [result, setResult] = useState(""); const [error, setError] = useState("");
  const runAgent = async () => { if (!task.trim() || running) return; setRunning(true); setError(""); setResult("");
    try { setResult(await runAirAgent(task.trim(), settings)); } catch (e) { setError(e.message); } finally { setRunning(false); } };

  return html`<div class="r-screen">
    <${SectionHeader} color=${C.air} title="AIR" subtitle="Autonomia economica, sganciata dal tempo del Ghost" />
    <${SubTabs} color=${C.air} tabs=${[{ key: "log", label: "Log" }, { key: "percorsi", label: "Percorsi" }, { key: "agent", label: "Agente" }]} active=${tab} setActive=${setTab} />
    ${tab === "log" ? html`
      <${AddButton} color=${C.air} open=${open} setOpen=${setOpen} label="Nuovo vettore" />
      ${open && html`<${Card} accent=${C.air}>
        <${Field} label="Data"><input type="date" class="r-input" value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
        <${Field} label="Titolo / vettore"><input class="r-input" value=${title} onInput=${(e) => setTitle(e.target.value)} /></${Field}>
        <${Field} label="Stato"><select class="r-input" value=${status} onInput=${(e) => setStatus(e.target.value)}>${AIR_STATUSES.map((s) => html`<option value=${s}>${s}</option>`)}</select></${Field}>
        <${Field} label="Note"><textarea class="r-textarea" value=${notes} onInput=${(e) => setNotes(e.target.value)} /></${Field}>
        <button class="r-btn" style="background:${C.air}" onClick=${submit}>Salva vettore</button>
      </${Card}>`}
      ${entries.length === 0 ? html`<${Empty} text="Nessun vettore AIR ancora." />` : html`<div class="r-list">${entries.map((e) => html`
        <${Card} accent=${C.air}><div class="r-entry-row"><div><div class="r-entry-date">${fmtDate(e.date)} · <span class="r-badge" style="border-color:${C.air};color:${C.air}">${e.status}</span></div>
          <div class="r-entry-line"><b>${e.title}</b></div>
          ${e.notes && html`<div class="r-entry-notes">${e.notes}</div>`}
        </div><button class="r-icon-btn" onClick=${() => onDelete(e.id)}>✕</button></div></${Card}>`)}</div>`}
    ` : tab === "percorsi" ? html`<${PercorsiPanel} pillar="air" color=${C.air} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} />`
    : html`<${Card} accent=${C.air}>
        <${Field} label="Cosa deve fare l'agente? (ricerca web reale)">
          <textarea class="r-textarea" value=${task} onInput=${(e) => setTask(e.target.value)} placeholder="es. Cerca 5 canali simili e riassumi cosa funziona" disabled=${running} />
        </${Field}>
        <button class="r-btn" style="background:${C.air}" onClick=${runAgent} disabled=${running}>${running ? "Ricerca in corso…" : "Avvia agente"}</button>
        ${error && html`<div class="r-error">${error}</div>`}
      </${Card}>
      ${result && html`<${Card} accent=${C.air}><div class="r-magi-text">${result}</div></${Card}>`}`}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// AGORÀ MAGI
// ─────────────────────────────────────────────────────────────
const MagiStage = ({ label, color, text, compact }) => !text ? null : html`<div class=${compact ? "r-magi-stage-compact" : "r-magi-stage"}>
  <div class="r-magi-label" style="color:${color}">${label}</div><div class="r-magi-text">${text}</div></div>`;

function MagiView({ sessions, onSave, onDelete, settings }) {
  const [question, setQuestion] = useState(""); const [running, setRunning] = useState(false);
  const [stage, setStage] = useState({ balthasar: "", melchior: "", caspar: "", synthesis: "" }); const [error, setError] = useState("");
  const engineLabel = MODEL_OPTIONS.find((m) => m.id === settings.model)?.label || settings.model;

  const start = async () => { if (!question.trim() || running) return; setRunning(true); setError(""); setStage({ balthasar: "", melchior: "", caspar: "", synthesis: "" });
    try { const result = await runTriadeMagi(question.trim(), (k, v) => setStage((s) => ({ ...s, [k]: v === null ? "…" : v })), settings);
      onSave({ id: uid(), date: new Date().toISOString(), question: question.trim(), engine: engineLabel, ...result }); setQuestion(""); }
    catch (e) { setError(e.message || "La Triade non ha risposto."); } finally { setRunning(false); } };

  return html`<div class="r-screen">
    <${SectionHeader} color=${C.core} title="AGORÀ MAGI" subtitle="Balthasar → Melchior → Caspar → sintesi · motore: ${engineLabel}" />
    <${Card} accent=${C.core}>
      <${Field} label="Dilemma o domanda per il Ghost"><textarea class="r-textarea" value=${question} onInput=${(e) => setQuestion(e.target.value)} disabled=${running} /></${Field}>
      <button class="r-btn" onClick=${start} disabled=${running}>${running ? "Sintesi in corso…" : "Avvia la Triade"}</button>
      ${error && html`<div class="r-error">${error}</div>`}
    </${Card}>
    ${running && html`<${Card} accent=${C.core}>
      <${MagiStage} label="Balthasar · il Perturbatore" color="#FF8A5C" text=${stage.balthasar} />
      <${MagiStage} label="Melchior · il Traduttore" color="#7CC6D9" text=${stage.melchior} />
      <${MagiStage} label="Caspar · l'Ancora" color="#9FB8A0" text=${stage.caspar} />
      <${MagiStage} label="Sintesi Esecutiva" color=${C.core} text=${stage.synthesis} />
    </${Card}>`}
    ${sessions.length === 0 ? html`<${Empty} text="Nessuna sessione ancora registrata." />` : html`<div class="r-list">${sessions.map((s) => html`
      <${Card} accent=${C.core}><div class="r-entry-row"><div style="flex:1"><div class="r-entry-date">${fmtDate(s.date)}${s.engine ? ` · ${s.engine}` : ""}</div>
        <div class="r-entry-line"><b>${s.question}</b></div>
        <${MagiStage} label="Balthasar · il Perturbatore" color="#FF8A5C" text=${s.balthasar} compact />
        <${MagiStage} label="Melchior · il Traduttore" color="#7CC6D9" text=${s.melchior} compact />
        <${MagiStage} label="Caspar · l'Ancora" color="#9FB8A0" text=${s.caspar} compact />
        <${MagiStage} label="Sintesi Esecutiva" color=${C.core} text=${s.synthesis} compact />
      </div><button class="r-icon-btn" onClick=${() => onDelete(s.id)}>✕</button></div></${Card}>`)}</div>`}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// SIMBIOSI
// ─────────────────────────────────────────────────────────────
function SimbiosiView({ resonance, onRecalc, calculating, error }) {
  return html`<div class="r-screen">
    <${SectionHeader} color="#EDEAE3" title="SIMBIOSI" subtitle="Il punto di incontro tra i pilastri — non un pilastro, la legge che li unisce" />
    <${Card}>
      <button class="r-btn" onClick=${onRecalc} disabled=${calculating}>${calculating ? "Valutazione in corso…" : "Calcola risonanza"}</button>
      ${error && html`<div class="r-error">${error}</div>`}
      ${resonance.text && html`<div class="r-magi-text" style="margin-top:12px;white-space:pre-wrap">${resonance.text}</div>
        <div class="r-hub-detail" style="margin-top:8px">Calcolato: ${new Date(resonance.time).toLocaleString("it-IT")}</div>`}
    </${Card}>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// SHELL — chat con memoria, smista da solo nei pilastri
// ─────────────────────────────────────────────────────────────
function AnochinTrace({ trace }) {
  const [open, setOpen] = useState(false);
  const stages = [
    ["1 · Afferenze", trace.afferenze], ["2 · Decisione", trace.decisione],
    ["3 · Accettore", trace.accettore], ["4 · Effettore", trace.effettore], ["5 · Azione", trace.azione],
  ].filter(([, v]) => v);
  if (!stages.length) return null;
  return html`<div class="r-anochin-wrap">
    <button class="r-anochin-toggle" onClick=${() => setOpen(!open)}>${open ? "▾ Ciclo Anochin" : "▸ Ciclo Anochin"}</button>
    ${open && html`<div class="r-anochin-body">
      ${stages.map(([label, val]) => html`<div class="r-anochin-stage"><div class="r-anochin-label">${label}</div><div class="r-anochin-val">${val}</div></div>`)}
    </div>`}
  </div>`;
}

function ShellView({ messages, setMessages, settings, addBio, addAir, addVidya, percorsi, setPercorsi }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const userText = input.trim();
    const history = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    const lastMsg = messages[messages.length - 1];
    setMessages((prev) => [...prev, { role: "user", content: userText, time: new Date().toISOString() }]);
    setInput(""); setSending(true); setError("");
    try {
      // Se il turno precedente aveva una proposta di percorso non risolta, controlla se questo messaggio la conferma
      if (lastMsg?.proposal?.proposed && !lastMsg.proposalResolved) {
        const confirmed = await detectConfirmation(userText, settings);
        setMessages((prev) => prev.map((m) => (m === lastMsg ? { ...m, proposalResolved: true } : m)));
        if (confirmed) {
          const { pillar, title } = lastMsg.proposal;
          const labels = await decomposeTopics(pillar, title, settings);
          const p = { id: uid(), pillar, title, createdAt: new Date().toISOString(), topics: (labels.length ? labels : ["Primo passo"]).map((l) => ({ id: uid(), label: l, status: "non iniziato", lastTouched: null })), sessions: [], competenze: "" };
          setPercorsi[pillar]([p, ...percorsi[pillar]]);
          setMessages((prev) => [...prev, { role: "system-note", content: `✓ Percorso "${title}" creato in ${pillar.toUpperCase()}.` }]);
        }
      }
      const { reply, actionsLog, anochin, proposal } = await runShellTurn(history, userText, settings, { addBio, addAir, addVidya });
      setMessages((prev) => [...prev, { role: "assistant", content: reply, time: new Date().toISOString(), actions: actionsLog, anochin, proposal }]);
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  };

  const actionColor = { BIO: C.bio, AIR: C.air, VIDYA: C.vidya };

  return html`<div class="r-screen">
    <${SectionHeader} color="#EDEAE3" title="SHELL" subtitle="Dialogo diretto — ciclo Anochin visibile per verifica" />
    <div class="r-shell-log">
      ${messages.length === 0 && html`<div class="r-empty">Scrivi qualcosa. Lo Shell ricorda lo scambio e registra da solo ciò che riguarda BIO/AIR/VIDYA.</div>`}
      ${messages.map((m, i) => m.role === "system-note"
        ? html`<div key=${i} class="r-shell-system-note">${m.content}</div>`
        : html`<div key=${i} class="r-shell-row ${m.role}">
            <div class="r-shell-bubble ${m.role}">${m.content}</div>
            ${m.actions && m.actions.length > 0 && html`<div class="r-shell-actions">${m.actions.map((a) => html`<span class="r-badge" style="border-color:${actionColor[a]};color:${actionColor[a]}">→ ${a}</span>`)}</div>`}
            ${m.anochin && html`<${AnochinTrace} trace=${m.anochin} />`}
          </div>`)}
      <div ref=${bottomRef}></div>
    </div>
    ${error && html`<div class="r-error">${error}</div>`}
    <div class="r-shell-inputbar">
      <textarea class="r-textarea" value=${input} onInput=${(e) => setInput(e.target.value)} placeholder="Scrivi al tuo Shell…" disabled=${sending} />
      <button class="r-btn" onClick=${send} disabled=${sending || !input.trim()}>${sending ? "…" : "Invia"}</button>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// KERNEL
// ─────────────────────────────────────────────────────────────
function KernelView({ kernel, onSave, driveStatus }) {
  const [draft, setDraft] = useState(kernel.content); const [showHistory, setShowHistory] = useState(false);
  useEffect(() => setDraft(kernel.content), [kernel.content]);
  const dirty = draft !== kernel.content;
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.core} title="KERNEL" subtitle="Versione V${kernel.version} — versioning atomico" />
    <${Card} accent=${C.core}>
      <textarea class="r-textarea r-kernel-textarea" value=${draft} onInput=${(e) => setDraft(e.target.value)} rows="14" />
      <div class="r-kernel-actions">
        <button class="r-btn" style=${!dirty ? "background:#232A34;color:#8B93A1" : ""} onClick=${() => dirty && onSave(draft)} disabled=${!dirty}>Salva come V${kernel.version + 1}</button>
        <button class="r-btn r-btn-ghost" onClick=${() => setShowHistory(!showHistory)}>Storico (${kernel.history.length})</button>
      </div>
      ${driveStatus.time && html`<div class="r-hub-detail" style="margin-top:8px">Drive: ${driveStatus.state === "syncing" ? "sincronizzazione…" : driveStatus.state === "ok" ? "sincronizzato" : `errore — ${driveStatus.error}`}</div>`}
    </${Card}>
    ${showHistory && (kernel.history.length === 0 ? html`<${Empty} text="Nessuna versione precedente." />` : html`<div class="r-list">${[...kernel.history].reverse().map((h) => html`
      <${Card}><div class="r-entry-date">V${h.version} — ${fmtDate(h.date)}</div><div class="r-kernel-preview">${h.content.slice(0, 220)}${h.content.length > 220 ? "…" : ""}</div></${Card}>`)}</div>`)}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────
function SettingsView({ settings, updateSettings, driveStatus }) {
  const presetIds = MODEL_OPTIONS.filter((m) => m.id !== "custom").map((m) => m.id);
  const isCustom = !presetIds.includes(settings.model);
  const [driveMsg, setDriveMsg] = useState(""); const [connecting, setConnecting] = useState(false);
  const clientIdReady = CONFIG.GOOGLE_CLIENT_ID && !CONFIG.GOOGLE_CLIENT_ID.startsWith("INCOLLA");
  const testConnect = async () => { setConnecting(true); setDriveMsg("");
    try { await connectDrive(); setDriveMsg("Connesso — puoi attivare la sincronizzazione."); } catch (e) { setDriveMsg("Errore: " + e.message); } finally { setConnecting(false); } };

  return html`<div class="r-screen">
    <${SectionHeader} color=${C.core} title="SETUP" subtitle="Motore AI e sincronizzazione Drive" />
    <${Card} accent=${C.core}>
      <${Field} label="Motore AI">
        <select class="r-input" value=${settings.provider} onInput=${(e) => updateSettings({ provider: e.target.value })}>
          <option value="openrouter">OpenRouter (Gemini / Kimi / DeepSeek / Llama / Claude / altro)</option>
          <option value="claude-direct">Claude — API diretta (sperimentale)</option>
        </select>
      </${Field}>
      <${Field} label="Chiave API"><input type="password" class="r-input" value=${settings.apiKey} onInput=${(e) => updateSettings({ apiKey: e.target.value })} placeholder=${settings.provider === "openrouter" ? "sk-or-..." : "sk-ant-..."} /></${Field}>
      ${settings.provider === "openrouter" && html`
        <${Field} label="Modello">
          <select class="r-input" value=${isCustom ? "custom" : settings.model} onInput=${(e) => updateSettings({ model: e.target.value === "custom" ? "" : e.target.value })}>
            ${MODEL_OPTIONS.map((m) => html`<option value=${m.id}>${m.label}</option>`)}
          </select>
        </${Field}>
        ${isCustom && html`<${Field} label="Slug personalizzato"><input class="r-input" value=${settings.model} onInput=${(e) => updateSettings({ model: e.target.value })} placeholder="es. z-ai/glm-5.2" /></${Field}>`}
      `}
      <div class="r-hub-detail">La chiave resta solo su questo dispositivo (localStorage).</div>
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#EDEAE3">Sincronizzazione Drive</div>
        <div class="r-hub-detail">Crea un nuovo file versionato su Drive ad ogni salvataggio</div></div>
        <input type="checkbox" checked=${settings.driveSyncEnabled} disabled=${!clientIdReady} onInput=${(e) => updateSettings({ driveSyncEnabled: e.target.checked })} /></div>
      ${!clientIdReady && html`<div class="r-hub-detail" style="margin-top:8px">Manca il Client ID Google in config.js — vedi README.md.</div>`}
      ${clientIdReady && html`<div style="margin-top:10px"><button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${testConnect} disabled=${connecting}>${connecting ? "Connessione…" : "Testa connessione Drive"}</button></div>
        ${driveMsg && html`<div class="r-hub-detail" style="margin-top:6px">${driveMsg}</div>`}`}
      ${driveStatus.time && html`<div class="r-hub-detail" style="margin-top:8px">Ultima sincronizzazione: ${new Date(driveStatus.time).toLocaleTimeString("it-IT")} — ${driveStatus.state === "ok" ? "riuscita" : `errore: ${driveStatus.error}`}</div>`}
    </${Card}>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────
const TABS = [
  { key: "hub", label: "Hub" }, { key: "shell", label: "Shell" }, { key: "bio", label: "Bio" }, { key: "air", label: "Air" },
  { key: "vidya", label: "Vidya" }, { key: "magi", label: "Magi" }, { key: "simbiosi", label: "Adam" },
  { key: "kernel", label: "Kernel" }, { key: "settings", label: "Setup" },
];

function App() {
  const [view, setView] = useState("hub");
  const [bio, setBio] = useState(() => loadKey("bio-data", []));
  const [air, setAir] = useState(() => loadKey("air-data", []));
  const [vidya, setVidya] = useState(() => loadKey("vidya-data", []));
  const [magi, setMagi] = useState(() => loadKey("magi-data", []));
  const [shellChat, setShellChatRaw] = useState(() => loadKey("shell-chat", []));
  const setShellChat = useCallback((updater) => setShellChatRaw((prev) => {
    const next = typeof updater === "function" ? updater(prev) : updater;
    saveKey("shell-chat", next);
    return next;
  }), []);
  const [pBio, setPBio] = useState(() => loadKey("percorsi-bio", []));
  const [pAir, setPAir] = useState(() => loadKey("percorsi-air", []));
  const [pVidya, setPVidya] = useState(() => loadKey("percorsi-vidya", []));
  const [kernel, setKernel] = useState(() => loadKey("kernel-data", { content: DEFAULT_KERNEL, version: 1, history: [] }));
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...loadKey("app-settings", {}) }));
  const [driveStatus, setDriveStatus] = useState({ state: "idle", time: null, error: null });
  const [resonance, setResonance] = useState(() => loadKey("simbiosi-data", { text: "", time: null }));
  const [resCalculating, setResCalculating] = useState(false);
  const [resError, setResError] = useState("");

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const syncIfEnabled = useCallback((label, content) => {
    if (!settingsRef.current.driveSyncEnabled) return;
    setDriveStatus({ state: "syncing", time: null, error: null });
    createDriveFile(`Resonance – ${label} – ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, content)
      .then(() => setDriveStatus({ state: "ok", time: Date.now(), error: null }))
      .catch((e) => setDriveStatus({ state: "error", time: Date.now(), error: e.message }));
  }, []);

  const updateSettings = useCallback((patch) => setSettings((prev) => { const next = { ...prev, ...patch }; saveKey("app-settings", next); return next; }), []);

  const addBio = useCallback((e) => setBio((prev) => { const n = [e, ...prev].sort((a, b) => b.date.localeCompare(a.date)); saveKey("bio-data", n); syncIfEnabled("04 BIO_STASIS", formatBioLog(n)); return n; }), [syncIfEnabled]);
  const delBio = useCallback((id) => setBio((prev) => { const n = prev.filter((e) => e.id !== id); saveKey("bio-data", n); syncIfEnabled("04 BIO_STASIS", formatBioLog(n)); return n; }), [syncIfEnabled]);
  const addAir = useCallback((e) => setAir((prev) => { const n = [e, ...prev].sort((a, b) => b.date.localeCompare(a.date)); saveKey("air-data", n); syncIfEnabled("03 AIR_OPERATIONS", formatAirLog(n)); return n; }), [syncIfEnabled]);
  const delAir = useCallback((id) => setAir((prev) => { const n = prev.filter((e) => e.id !== id); saveKey("air-data", n); syncIfEnabled("03 AIR_OPERATIONS", formatAirLog(n)); return n; }), [syncIfEnabled]);
  const addVidya = useCallback((e) => setVidya((prev) => { const n = [e, ...prev].sort((a, b) => b.date.localeCompare(a.date)); saveKey("vidya-data", n); syncIfEnabled("05 VIDYA_TUNING", formatVidyaLog(n)); return n; }), [syncIfEnabled]);
  const delVidya = useCallback((id) => setVidya((prev) => { const n = prev.filter((e) => e.id !== id); saveKey("vidya-data", n); syncIfEnabled("05 VIDYA_TUNING", formatVidyaLog(n)); return n; }), [syncIfEnabled]);
  const addMagi = useCallback((s) => setMagi((prev) => { const n = [s, ...prev]; saveKey("magi-data", n); syncIfEnabled("01 AGORÀ_MAGI", formatMagiLog(n)); return n; }), [syncIfEnabled]);
  const delMagi = useCallback((id) => setMagi((prev) => { const n = prev.filter((s) => s.id !== id); saveKey("magi-data", n); syncIfEnabled("01 AGORÀ_MAGI", formatMagiLog(n)); return n; }), [syncIfEnabled]);

  const setPBioSync = useCallback((n) => { setPBio(n); saveKey("percorsi-bio", n); syncIfEnabled("04 BIO_STASIS — Percorsi", formatPercorsiLog("BIO", n)); }, [syncIfEnabled]);
  const setPAirSync = useCallback((n) => { setPAir(n); saveKey("percorsi-air", n); syncIfEnabled("03 AIR_OPERATIONS — Percorsi", formatPercorsiLog("AIR", n)); }, [syncIfEnabled]);
  const setPVidyaSync = useCallback((n) => { setPVidya(n); saveKey("percorsi-vidya", n); syncIfEnabled("05 VIDYA_TUNING — Percorsi", formatPercorsiLog("VIDYA", n)); }, [syncIfEnabled]);

  const saveKernel = useCallback((content) => setKernel((prev) => {
    const n = { content, version: prev.version + 1, history: [...prev.history, { version: prev.version, content: prev.content, date: new Date().toISOString() }] };
    saveKey("kernel-data", n); syncIfEnabled("00 KERNEL_LOG", content); return n;
  }), [syncIfEnabled]);

  const recalcResonance = useCallback(async () => {
    setResCalculating(true); setResError("");
    try {
      const digest = buildResonanceDigest({ bio, air, vidya, kernel, magi, pBio, pAir, pVidya });
      const text = await computeResonance(digest, settingsRef.current);
      const next = { text, time: Date.now() };
      setResonance(next); saveKey("simbiosi-data", next);
    } catch (e) { setResError(e.message); }
    finally { setResCalculating(false); }
  }, [bio, air, vidya, kernel, magi, pBio, pAir, pVidya]);

  const digestBio = `Kernel: ${kernel.content.slice(0, 300)}\nUltime voci BIO: ${bio.slice(0, 5).map((e) => e.notes || e.weight).join("; ")}\nPercorsi esistenti: ${pBio.map((p) => p.title).join(", ") || "nessuno"}`;
  const digestAir = `Kernel: ${kernel.content.slice(0, 300)}\nUltimi vettori AIR: ${air.slice(0, 5).map((e) => `${e.title} (${e.status})`).join("; ")}\nPercorsi esistenti: ${pAir.map((p) => p.title).join(", ") || "nessuno"}`;
  const digestVidya = `Kernel: ${kernel.content.slice(0, 300)}\nUltimi log VIDYA: ${vidya.slice(0, 5).map((e) => e.title).join("; ")}\nPercorsi esistenti: ${pVidya.map((p) => p.title).join(", ") || "nessuno"}`;

  return html`<div>
    <div class="r-topbar"><div class="r-brand">RESONANCE<span>•</span></div></div>
    ${view === "hub" && html`<${Hub} bio=${bio} air=${air} vidya=${vidya} magi=${magi} resonance=${resonance} setView=${setView} />`}
    ${view === "shell" && html`<${ShellView} messages=${shellChat} setMessages=${setShellChat} settings=${settings} addBio=${addBio} addAir=${addAir} addVidya=${addVidya} percorsi=${{ bio: pBio, air: pAir, vidya: pVidya }} setPercorsi=${{ bio: setPBioSync, air: setPAirSync, vidya: setPVidyaSync }} />`}
    ${view === "bio" && html`<${BioView} entries=${bio} onAdd=${addBio} onDelete=${delBio} percorsi=${pBio} setPercorsi=${setPBioSync} settings=${settings} digest=${digestBio} />`}
    ${view === "air" && html`<${AirView} entries=${air} onAdd=${addAir} onDelete=${delAir} percorsi=${pAir} setPercorsi=${setPAirSync} settings=${settings} digest=${digestAir} />`}
    ${view === "vidya" && html`<${VidyaView} entries=${vidya} onAdd=${addVidya} onDelete=${delVidya} percorsi=${pVidya} setPercorsi=${setPVidyaSync} settings=${settings} digest=${digestVidya} />`}
    ${view === "magi" && html`<${MagiView} sessions=${magi} onSave=${addMagi} onDelete=${delMagi} settings=${settings} />`}
    ${view === "simbiosi" && html`<${SimbiosiView} resonance=${resonance} onRecalc=${recalcResonance} calculating=${resCalculating} error=${resError} />`}
    ${view === "kernel" && html`<${KernelView} kernel=${kernel} onSave=${saveKernel} driveStatus=${driveStatus} />`}
    ${view === "settings" && html`<${SettingsView} settings=${settings} updateSettings=${updateSettings} driveStatus=${driveStatus} />`}
    <div class="r-tab-bar"><div class="r-tab-bar-inner">${TABS.map((t) => html`<button class="r-tab ${view === t.key ? "active" : ""}" onClick=${() => setView(t.key)}>${t.label}</button>`)}</div></div>
  </div>`;
}

render(html`<${App} />`, document.getElementById("app"));
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
