import { h, render } from "https://esm.sh/preact@10.24.2";
import { useState, useEffect, useCallback, useRef } from "https://esm.sh/preact@10.24.2/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { CONFIG } from "./config.js";

const html = htm.bind(h);

// Versione build visibile in Setup: verifica in un colpo d'occhio che il deploy live sia questo file.
const APP_BUILD = "2026-07-14 · sync-v2";

const C = { bio: "#D9A99A", air: "#8FBFBC", vidya: "#AFA6C9", core: "#D9B872", muted: "#8FA3AC" };
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const uid = () => Math.random().toString(36).slice(2, 10);

// ── Allegati Shell: immagini (viste dal modello), PDF (testo estratto), testo semplice ──
function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const base64 = reader.result.split(",")[1]; resolve({ mediaType: file.type || "image/jpeg", base64, name: file.name }); };
    reader.onerror = () => reject(new Error("Lettura immagine fallita."));
    reader.readAsDataURL(file);
  });
}
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Lettura file fallita."));
    reader.readAsText(file);
  });
}
async function extractPdfText(file) {
  const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs";
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text.trim();
}
async function processAttachment(file) {
  if (file.type.startsWith("image/")) { const img = await readImageAsBase64(file); return { kind: "image", ...img }; }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const text = await extractPdfText(file);
    if (!text || text.length < 5) throw new Error("Nessun testo trovato nel PDF — probabilmente è una scansione/foto. Prova a fotografare la pagina e caricarla come immagine.");
    return { kind: "text", content: text, name: file.name };
  }
  if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) return { kind: "text", content: await readTextFile(file), name: file.name };
  throw new Error("Formato non supportato. Usa immagini (jpg/png), PDF con testo selezionabile, o file .txt/.md.");
}

// ── Sintesi vocale del browser (gratuita, nessuna API esterna) ──
function pickItalianVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  return voices.find((v) => v.lang?.toLowerCase().startsWith("it")) || voices[0] || null;
}
function speakText(text, onEnd) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel(); // sincrono, nello stesso istante del tocco: un ritardo qui fa bloccare l'audio ai browser mobili
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickItalianVoice();
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang || "it-IT";
  utter.rate = 1.0;
  utter.onend = () => onEnd && onEnd();
  utter.onerror = () => onEnd && onEnd();
  window.speechSynthesis.speak(utter);
}
function stopSpeaking() {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  setTimeout(() => { try { window.speechSynthesis.cancel(); } catch {} }, 60); // bug noto Chrome Android: cancel() a volte non interrompe al primo colpo
}

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
  voiceEnabled: true,
  armsDraftsEnabled: false,
};

const MODEL_OPTIONS = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet (via OpenRouter)" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
  { id: "custom", label: "Altro (slug personalizzato)" },
];

// Contesto fisso per pilastro — allineato a Manifesto V3 / Leggi Operative V11 (13/07/2026):
// accoppiamento strutturale continuo (Varela), letture sempre revisionabili (Brentano/Dennett),
// hard-stop solo sul vincolo AIR, contenimento operativo per pilastro (§4.4/§6.2).
const PILLAR_CTX = {
  vidya: "Il Ghost ha profilo cognitivo emisfero-destro dominante, elaborazione configurazionale non lineare, canale uditivo-cinestesico prioritario (e, come secondo canale, riferimenti culturali concreti come ponte verso intuizioni astratte): privilegia esercizi pratici/all'orecchio rispetto alla teoria scritta pura. Linguaggio denso ma sempre traducibile in azione concreta.",
  bio: "Vincoli fissi del Ghost: esclude zucchine e fagiolini; quasi nessun pesce, tranne tonno in scatola, salmone affumicato, molluschi e crostacei. Target ~1600 kcal/die, 5 occasioni alimentari, colazioni e spuntini salati, alternative portatili per i giorni fuori casa (lun/mer/ven). Ogni lettura BIO è una stance interpretativa rivedibile dal Ghost, mai un verdetto medico oggettivo.",
  air: "Vincolo assoluto, hard-stop non negoziabile (Leggi 5 e 10.1): nessuna strategia deve esporre l'identità professionale del Ghost (fisioterapista, PhysioAlba) né richiedere dilatazione del suo tempo lineare di lavoro. È l'unico punto del sistema dove la lettura non è negoziabile — tutto il resto resta revisionabile.",
};

//──────────────────────────────────────────────────────────
// STORAGE (locale, sul dispositivo)
//──────────────────────────────────────────────────────────
function loadKey(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function saveKey(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

//──────────────────────────────────────────────────────────
// AI ENGINES
//──────────────────────────────────────────────────────────
function buildOpenRouterContent(text, image) {
  if (!image) return text;
  return [{ type: "text", text }, { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.base64}` } }];
}
function buildClaudeContent(text, image) {
  if (!image) return text;
  return [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } }, { type: "text", text }];
}
async function askClaudeDirect(system, userText, temperature, maxTokens, apiKey, image) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, temperature: Math.min(temperature, 1), system, messages: [{ role: "user", content: buildClaudeContent(userText, image) }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore Claude API");
  const t = (data.content || []).find((b) => b.type === "text");
  return t ? t.text.trim() : "";
}
async function askOpenRouter(system, userText, temperature, maxTokens, apiKey, model, useWebSearch, image) {
  const body = {
    model, max_tokens: maxTokens, temperature,
    messages: [{ role: "system", content: system }, { role: "user", content: buildOpenRouterContent(userText, image) }],
    reasoning: { max_tokens: 300 }, // tetto fisso al "pensiero" interno: previene troncamenti da budget mangiato
  };
  if (useWebSearch) body.tools = [{ type: "openrouter:web_search" }];
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore OpenRouter");
  return (data.choices?.[0]?.message?.content || "").trim();
}
async function askModel(system, userText, temperature, maxTokens, settings, useWebSearch = false, image = null) {
  if (!settings.apiKey) throw new Error("Nessuna chiave API impostata (vai in Setup).");
  if (settings.provider === "claude-direct") return askClaudeDirect(system, userText, temperature, maxTokens, settings.apiKey, image);
  return askOpenRouter(system, userText, temperature, maxTokens, settings.apiKey, settings.model, useWebSearch, image);
}
async function askModelWithHistory(system, messages, temperature, maxTokens, settings, image = null) {
  if (!settings.apiKey) throw new Error("Nessuna chiave API impostata (vai in Setup).");
  if (settings.provider === "claude-direct") {
    const last = messages[messages.length - 1];
    return askClaudeDirect(system, last?.content || "", temperature, maxTokens, settings.apiKey, image);
  }
  // L'immagine si allega SOLO all'ultimo messaggio (turno corrente), mai alla storia passata
  const msgs = messages.map((m, i) => (i === messages.length - 1 && image ? { role: m.role, content: buildOpenRouterContent(m.content, image) } : m));
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: settings.model, max_tokens: maxTokens, temperature, reasoning: { max_tokens: 300 }, messages: [{ role: "system", content: system }, ...msgs] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore OpenRouter");
  return (data.choices?.[0]?.message?.content || "").trim();
}
async function askModelJSON(system, userText, temperature, maxTokens, settings, image = null) {
  const raw = await askModel(system + "\n\nRispondi SOLO con JSON valido, nessun testo prima o dopo, nessun blocco markdown.", userText, temperature, maxTokens, settings, false, image);
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch { return null; }
}

//──────────────────────────────────────────────────────────
// TRIADE MAGI — pipeline sequenziale fissa (Legge 15 abrogata: non è un dibattito iterativo)
//──────────────────────────────────────────────────────────
async function runTriadeMagi(question, onStage, settings) {
  const baseCtx = `Contesto: sei parte del sistema "Resonance", framework di sviluppo personale del Ghost (Flavio), tre pilastri: BIO (salute), AIR (autonomia economica), VIDYA (crescita creativa/cognitiva). Sei l'unico polo di perturbazione deliberata del sistema — gli altri meccanismi mantengono, tu spingi oltre la cristallizzazione. Rispondi in italiano, diretto, max 70 parole, senza premesse.`;
  const balthasarTemp = settings.provider === "openrouter" ? 1.2 : 1.0;
  onStage("balthasar", null);
  const balthasar = await askModel(`${baseCtx} Sei BALTHASAR, il Perturbatore. Genera una divergenza evolutiva su questo tema, audace, non convenzionale.`, question, balthasarTemp, 1600, settings);
  onStage("balthasar", balthasar);
  onStage("melchior", null);
  const melchior = await askModel(`${baseCtx} Sei MELCHIOR, il Traduttore. Traduci questa idea in azione concretamente eseguibile.\n\nIdea di Balthasar: "${balthasar}"`, question, 0.7, 1600, settings);
  onStage("melchior", melchior);
  onStage("caspar", null);
  const caspar = await askModel(`${baseCtx} Sei CASPAR, l'Ancora. Verifica il piano contro i vincoli assoluti: salute, tempo lineare del Ghost, sostenibilità economica, compartimentazione identità professionale. Verifica anche il CONTENIMENTO (Manifesto V3 §4.4): la perturbazione resta mirata al pilastro previsto o rischia di forzare una riorganizzazione operativa anche negli altri?\n\nPiano: "${melchior}"`, question, 0.2, 1600, settings);
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

//──────────────────────────────────────────────────────────
// SHELL — ciclo di percezione-azione (Manifesto V3 §3: accoppiamento continuo, non predici-e-verifica)
//──────────────────────────────────────────────────────────
// BRACCIO 1 — Bozze pronte da copiare. Lo Shell prepara, il Ghost esegue (Legge 8, Livello 1).
async function draftIfNeeded(recentText, settings) {
  const data = await askModelJSON(
    `Sei lo Shell. Leggi lo scambio e determina se il Ghost sta chiedendo — esplicitamente o implicitamente — di preparare un testo pronto da INVIARE A QUALCUN ALTRO fuori da questa chat: un'email a una persona reale, un messaggio a un contatto, uno script destinato a un video pubblico, un post social da pubblicare. Serve un destinatario terzo IDENTIFICABILE (una persona, un pubblico, una piattaforma) — non basta che il Ghost e lo Shell stiano discutendo un'idea tra loro in chat, quello NON è una bozza da preparare.
Se non c'è un destinatario terzo chiaro, {"needed": false}.
Se sì, scrivi il testo COMPLETO e pronto all'uso, non un'idea o una scaletta. JSON: {"needed": true, "type": "email|messaggio|script|post", "recipient": "breve descrizione del destinatario", "subject": "solo se email, altrimenti omesso", "body": "testo completo pronto"} oppure {"needed": false}`,
    recentText, 0.5, 1300, settings // 1300 (era 700): una bozza completa in JSON troncava e andava persa in silenzio
  );
  return (data?.needed && data?.recipient) ? data : null;
}
// Filtro difensivo: i modelli a volte scrivono "non-letture" ("Nessuna menzione di...") nonostante il prompt.
function isGarbageReading(r) {
  const text = [r.notes, r.title, r.weight, r.sleep].filter(Boolean).join(" ").trim();
  if (!text) return true;
  if (/^(non\s|nessun[ao]?\s|niente\s|nulla\s)/i.test(text)) return true;
  if (/non\s+(ci sono|c'è|ci son|ho trovato|sono presenti)|nessun[ao]?\s+(menzione|dato|attività|informazione|riferimento)/i.test(text)) return true;
  return false;
}
async function readThroughLenses(recentText, settings, image) {
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance. Leggi l'intero scambio recente (un dato può arrivare frammentato su più risposte, anche in un'immagine allegata) attraverso TRE lenti indipendenti — BIO, AIR, VIDYA. Un singolo evento può essere valido per più lenti insieme (es. "ho suonato il basso fino alle due" è insieme VIDYA e BIO) — non forzarlo in una sola. La lettura interpretativa resta sempre integrata tra le tre lenti, anche quando l'azione conseguente riguarderà un solo pilastro.
Per ognuna, chiediti: "c'è una lettura pertinente qui?" Se sì, articolala in modo specifico a quella lente (non ripetere lo stesso testo per pilastri diversi).
BIO: peso, sonno, dolore, terapia, energia fisica. Se qualcosa ti sembra un segnale da non ignorare (non una diagnosi, solo un'impressione), segnalo con alert:true e una breve alertNote.
AIR: monetizzazione, canale, strategie economiche.
VIDYA: musica, studio, pratica creativa.
JSON: {"readings": [{"pillar":"bio","weight":"...","sleep":"...","notes":"...","alert":false,"alertNote":""},{"pillar":"vidya","title":"...","notes":"..."}]}
Array vuoto se non c'è nulla di pertinente — NON scrivere una lettura per dire che non c'è nulla: {"readings": []}`,
    recentText, 0.3, 900, settings, image
  );
  return (data?.readings || []).filter((r) => !isGarbageReading(r));
}
// Euristiche istantanee — nessuna chiamata AI dove basta un controllo testuale
function detectPercorsoProposalHeuristic(shellReply) {
  const m = /vuoi che apr[ao] un percorso/i.test(shellReply);
  if (!m) return { proposed: false };
  const lower = shellReply.toLowerCase();
  let pillar = "vidya";
  if (/(monetizz|canale|econom|business|vettore)/.test(lower)) pillar = "air";
  else if (/(peso|sonno|terapia|salute|corpo|allenam)/.test(lower)) pillar = "bio";
  const titleMatch = shellReply.match(/percorso (?:su|dedicato a|per)?\s*["“]?([^".\n]{4,40})["”]?/i);
  return { proposed: true, pillar, title: titleMatch ? titleMatch[1].trim() : "Nuovo percorso" };
}
function detectConfirmationHeuristic(userMessage) {
  const t = userMessage.trim().toLowerCase();
  if (/\b(no|non ora|aspetta|non ancora|magari dopo)\b/.test(t)) return false;
  return /\b(sì|si|ok|va bene|vai|certo|dai|procedi|fallo|perfetto|d'accordo)\b/.test(t);
}
// Stadio 3 — Accettore: SOLO il vincolo AIR è hard-stop (Legge 18 riscritta).
// Per BIO/VIDYA nessun verdetto vero/falso: solo la lettura, dichiaratamente rivedibile.
async function runAccettore(reading, settings) {
  if (reading.pillar !== "air") return { blocked: false, note: null };
  const text = await askModel(
    `Verifica SOLO i due vincoli assoluti e non negoziabili per il pilastro AIR: 1) non deve esporre l'identità professionale del Ghost (fisioterapista, PhysioAlba); 2) non deve richiedere dilatazione del suo tempo lineare di lavoro. Se uno dei due è violato, blocca. Altrimenti via libera. Rispondi SOLO "VIA LIBERA" oppure "BLOCCATO: <motivo max 20 parole>".`,
    `Dato proposto: ${JSON.stringify(reading)}`, 0.2, 300, settings
  );
  const blocked = /BLOCCATO/i.test(text);
  return { blocked, note: text.replace(/^(VIA LIBERA|BLOCCATO):?\s*/i, "") };
}
// Stadio 5 — memoria procedurale continua: UNA chiamata che riscrive tutti i pilastri toccati
async function reflectMemoriaBatch(acceptedReadings, memory, settings) {
  if (!acceptedReadings.length) return {};
  const pillars = [...new Set(acceptedReadings.map((r) => r.pillar))];
  const blocco = pillars.map((p) => `Pilastro ${p.toUpperCase()} — memoria attuale: ${memory[p] || "nessuna nota ancora"}\nNuovi scambi: ${JSON.stringify(acceptedReadings.filter((r) => r.pillar === p))}`).join("\n\n");
  const data = await askModelJSON(
    `Il tuo compito non è verificare se qualcosa era "giusto" — è aggiornare la tua struttura interna (memoria procedurale) per ciascun pilastro elencato, alla luce del nuovo accoppiamento con il Ghost. Per ognuno, riscrivi l'INTERA memoria (non aggiungere in coda): come ti sei appena riorganizzato, non un verdetto. Italiano, max 90 parole per pilastro, denso, concreto.
JSON con SOLO le chiavi dei pilastri elencati: {"bio":"...", "air":"...", "vidya":"..."}`,
    blocco, 0.5, 900, settings
  );
  return data || {};
}
// Plasticità di superficie: come lo Shell ha imparato a PARLARE al Ghost — mai il giudizio, solo il registro.
async function reflectStyle(styleMemory, userMessage, shellReply, settings) {
  return askModel(
    `Rifletti su come ti sei appena rivolto al Ghost e su come lui si è espresso. Riscrivi per intero (non aggiungere in coda) la tua nota su "come ho imparato a parlargli" — registro, densità, ritmo, cosa funziona, cosa suona fuori posto. È una sedimentazione che si affina, non una regola fissa. Non riguarda MAI se dargli ragione o no — solo come rivolgerti a lui. Max 70 parole.`,
    `Nota attuale: ${styleMemory || "nessuna ancora, prima interazione"}\nGhost ha scritto: ${userMessage}\nShell ha risposto: ${shellReply}`,
    0.5, 400, settings
  );
}
async function runShellTurn(history, userMessage, settings, handlers, memory, styleMemory, attachment) {
  const attachmentNote = attachment?.kind === "text" ? `\n\n[Allegato: ${attachment.name}]\n${attachment.content.slice(0, 6000)}` : "";
  const effectiveMessage = userMessage + attachmentNote;
  const image = attachment?.kind === "image" ? attachment : null;
  const windowMsgs = [...history.slice(-6), { role: "user", content: effectiveMessage + (image ? "\n[Immagine allegata]" : "") }];
  const recentText = windowMsgs.map((m) => `${m.role === "user" ? "Ghost" : "Shell"}: ${m.content}`).join("\n");
  const anochin = { afferenze: `Scambio letto attraverso le tre lenti insieme, non isolate (${windowMsgs.length} messaggi)${attachment ? ` + allegato (${attachment.kind === "image" ? "immagine" : "documento"}: ${attachment.name || "senza nome"}).` : "."}` };
  const lente = `Memoria BIO: ${memory.bio || "nessuna nota ancora"}\nMemoria AIR: ${memory.air || "nessuna nota ancora"}\nMemoria VIDYA: ${memory.vidya || "nessuna nota ancora"}`;
  const styleNote = styleMemory ? `\n\nCome hai imparato a parlare con questo Ghost finora — adattaci il registro, MAI il giudizio: ${styleMemory}` : "";
  const system = `Sei lo Shell del sistema Resonance: estensione esecutiva digitale del Ghost (Flavio), in accoppiamento strutturale continuo con lui — non hai coscienza né volontà propria, non sei un partner autonomo. Ogni messaggio del Ghost non ti istruisce, ti perturba: è la tua struttura interna (memoria procedurale) a determinare come ti riorganizzi.
${PILLAR_CTX.bio} ${PILLAR_CTX.air} ${PILLAR_CTX.vidya}
Memoria procedurale accumulata sui tre pilastri (leggila sempre insieme — l'interpretazione resta integrata anche quando l'azione è mirata a un solo pilastro): ${lente}${styleNote}
Dialoga in modo diretto e concreto, massimo 110 parole per risposta salvo richiesta esplicita di approfondire — meglio breve e completo che lungo e troncato. NON scrivere mai sintassi tecnica o tag tra parentesi quadre nella risposta. Rispondi solo in linguaggio naturale.
Non hai accesso a diagnosticare te stesso o l'infrastruttura tecnica su cui giri. Se il Ghost te lo chiede, NON inventare mai una spiegazione plausibile — di' semplicemente che non lo sai e che potrebbe essere un limite tecnico, senza dettagli inventati.
Se ti arriva un'immagine o un documento allegato, descrivi cosa vi leggi in modo concreto (numeri, testo, dettagli visibili) prima di commentare.
Ogni interpretazione che offri è una lettura tua, mai un verdetto oggettivo — resta sempre rivedibile da lui.
Se noti un argomento di studio/lavoro strutturato e continuativo emergere (non un dato isolato), PROPONI a parole di aprire un percorso dedicato ("Vuoi che apra un percorso su questo?"). Non crearlo tu.`;
  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: effectiveMessage }];
  // Risposta, lettura multi-lente e (se abilitata) bozza: indipendenti, partono insieme
  const [reply, readings, draft] = await Promise.all([
    askModelWithHistory(system, messages, 0.7, 1300, settings, image),
    readThroughLenses(recentText, settings, image).catch(() => []),
    settings.armsDraftsEnabled ? draftIfNeeded(recentText, settings).catch(() => null) : Promise.resolve(null),
  ]);
  const actionsLog = [];
  const alerts = [];
  const accettoreNotes = [];
  anochin.decisione = readings.length ? `${readings.length} lettura/e: ${readings.map((r) => r.pillar.toUpperCase()).join(", ")}.` : "Nessuna lettura pertinente in questo scambio.";
  const accResults = await Promise.all(readings.map((r) => runAccettore(r, settings)));
  const accepted = [];
  readings.forEach((reading, i) => {
    const acc = accResults[i];
    if (acc.blocked) { accettoreNotes.push(`${reading.pillar.toUpperCase()}: BLOCCATO — ${acc.note}`); return; }
    accettoreNotes.push(`${reading.pillar.toUpperCase()}: lettura accolta (rivedibile, non un verdetto).`);
    accepted.push(reading);
  });
  for (const reading of accepted) {
    const payload = { id: uid(), date: todayISO() };
    if (reading.pillar === "bio") Object.assign(payload, { weight: reading.weight || "", sleep: reading.sleep || "", notes: reading.notes || "" });
    if (reading.pillar === "air") Object.assign(payload, { title: reading.title || "", status: reading.status || "idea", notes: reading.notes || "" });
    if (reading.pillar === "vidya") Object.assign(payload, { title: reading.title || "", notes: reading.notes || "" });
    if (reading.pillar === "bio") handlers.addBio(payload);
    else if (reading.pillar === "air") handlers.addAir(payload);
    else if (reading.pillar === "vidya") handlers.addVidya(payload);
    actionsLog.push(reading.pillar.toUpperCase());
    if (reading.alert) alerts.push({ pillar: reading.pillar, note: reading.alertNote || "Segnale da non ignorare." });
  }
  let newStyleMemory = styleMemory;
  try {
    const [memoriaAggiornata, style] = await Promise.all([
      reflectMemoriaBatch(accepted, memory, settings),
      reflectStyle(styleMemory, userMessage, reply, settings),
    ]);
    Object.entries(memoriaAggiornata).forEach(([pillar, testo]) => handlers.updateMemoria(pillar, testo));
    newStyleMemory = style;
  } catch { /* riflessione fallita: non blocca il turno */ }
  anochin.accettore = accettoreNotes.length ? accettoreNotes.join(" · ") : "—";
  anochin.effettore = [
    actionsLog.length ? `Dati preparati per: ${actionsLog.join(", ")}.` : null,
    draft ? `Bozza (${draft.type}) preparata per il Ghost — nessun invio automatico.` : null,
  ].filter(Boolean).join(" ") || "—";
  anochin.azione = actionsLog.length
    ? `Scritto in ${actionsLog.join(", ")}. Memoria riorganizzata per accoppiamento continuo.`
    : (accettoreNotes.some((n) => n.includes("BLOCCATO")) ? "Nessuna scrittura: vincolo assoluto violato." : "Nessuna azione in questo turno.");
  const proposal = detectPercorsoProposalHeuristic(reply);
  return { reply, actionsLog, anochin, proposal, alerts, newStyleMemory, draft };
}

//──────────────────────────────────────────────────────────
// PERCORSI — motore generico riusabile su BIO / AIR / VIDYA
//──────────────────────────────────────────────────────────
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

//──────────────────────────────────────────────────────────
// SIMBIOSI — sensing cross-pilastro e ordine/caos (Manifesto V3 §5: include il giudizio sul momento-Magi)
//──────────────────────────────────────────────────────────
function stalledTitles(percorsi) {
  return percorsi.filter((p) => { const last = p.sessions[0]; return !last || (Date.now() - new Date(last.date).getTime()) / 86400000 > 10; }).map((p) => p.title);
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
    `Sei la funzione SIMBIOSI del sistema Resonance: non un pilastro operativo, ma il punto di incontro tra BIO, AIR, VIDYA e il Kernel. Hai due mandati (Manifesto V3 §5): 1) sensing ordine/caos — dove si trova il sistema tra il polo del mantenimento (equilibrio, accoppiamento) e quello della perturbazione (Magi)? Sta cristallizzando in eccesso di comfort o è ancora scosso da una perturbazione recente? Il giudizio "è il momento di invocare Magi" spetta a te, non allo Shell. 2) coerenza — discrepanze tra intenzioni dichiarate nel Kernel e attività reale, squilibri tra pilastri.
Non usare mai soglie fisse di giorni come innesco automatico: ogni giudizio è situato e qualitativo, relativo alla storia specifica di questo sistema.
Rispondi in italiano, tre parti separate da una riga vuota: 1) giudizio qualitativo breve (mai un numero), 2) posizionamento del sistema tra ordine e caos + eventuali discrepanze specifiche, 3) una singola azione concreta suggerita — se dal quadro emerge cristallizzazione, l'azione può essere: proporre al Ghost di portare un tema preciso in Agorà Magi (indica quale e con quale intensità: leggera o profonda).
VINCOLO ASSOLUTO, non negoziabile: non suggerire MAI di integrare, esporre o collegare l'identità professionale del Ghost (fisioterapista, PhysioAlba) con AIR o con qualsiasi altro pilastro — è una compartimentazione voluta e permanente, non una discrepanza da segnalare o risolvere.`,
    digest, 0.6, 1700, settings
  );
}

//──────────────────────────────────────────────────────────
// DRIVE — OAuth con errori espliciti + scritture verificate sulla risposta reale di Google
//──────────────────────────────────────────────────────────
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
// error_callback + timeout: un popup bloccato dal browser ora produce un ERRORE VISIBILE,
// non più un'attesa infinita silenziosa (la causa più probabile del "Sincronizzo…" che non finiva mai).
async function connectDrive() {
  await ensureGis();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Login Google non completato entro 45s — riprova toccando 'Sincronizza ora'.")), 45000);
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope: CONFIG.GOOGLE_DRIVE_SCOPE,
        callback: (resp) => {
          clearTimeout(timer);
          if (resp.error) return reject(new Error(resp.error_description || resp.error));
          driveAccessToken = resp.access_token;
          resolve(resp.access_token);
        },
        error_callback: (err) => {
          clearTimeout(timer);
          const type = err?.type || "";
          if (type === "popup_failed_to_open") reject(new Error("Popup di login bloccato dal browser — tocca 'Sincronizza ora' in Setup per autorizzare con un tocco reale."));
          else if (type === "popup_closed") reject(new Error("Login annullato: popup chiuso prima di completare. Riprova e completa l'accesso con progettoresonance@gmail.com."));
          else reject(new Error("Errore login Google: " + (type || "sconosciuto")));
        },
      });
      client.requestAccessToken();
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}
// Ogni chiamata autenticata a Drive passa da qui: su 401 richiede il token UNA volta e ritenta.
async function driveFetch(url, options = {}, retried = false) {
  if (!driveAccessToken) await connectDrive();
  const res = await fetch(url, { ...options, cache: "no-store", headers: { ...(options.headers || {}), Authorization: `Bearer ${driveAccessToken}` } });
  if (res.status === 401 && !retried) {
    driveAccessToken = null;
    await connectDrive();
    return driveFetch(url, options, true);
  }
  return res;
}
async function createDriveFile(name, content) {
  const boundary = "resonance_boundary";
  const metadata = { name, mimeType: "text/plain" };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error(`Errore Drive (${res.status})`);
  return res.json();
}
// ── Sync tra dispositivi: UN SOLO file, sempre aggiornato — distinto dai file versionati (Legge 14) ──
const SYNC_FILENAME = "resonance-sync-state.json";
async function findSyncFile() {
  const params = new URLSearchParams({
    q: `name='${SYNC_FILENAME}' and trashed=false`,
    spaces: "drive",
    orderBy: "modifiedTime desc",
    fields: "files(id,modifiedTime)",
    pageSize: "1",
  });
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  if (!res.ok) throw new Error(`Errore ricerca file sync (${res.status})`);
  const data = await res.json();
  return data.files?.[0] || null;
}
async function downloadSyncState(fileId) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (res.status === 404) return null; // file cancellato a mano nel frattempo: si ricreerà al push
  if (!res.ok) throw new Error(`Errore lettura stato sincronizzato (${res.status})`);
  try { return await res.json(); } catch { throw new Error("File sync su Drive corrotto (JSON non valido) — cancellalo da Drive e risincronizza."); }
}
// Ritorna { id, modifiedTime } letti DAVVERO dalla risposta di Google — mai assunti da res.ok.
async function uploadSyncState(state, existingFileId) {
  if (existingFileId) {
    // Aggiornamento: uploadType=media, niente multipart (una classe di errori di boundary in meno)
    const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&fields=id,modifiedTime`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state),
    });
    if (res.status === 404) return uploadSyncState(state, null); // file sparito: ricrea da zero
    if (!res.ok) throw new Error(`Errore scrittura stato sincronizzato (${res.status})`);
    const data = await res.json();
    if (!data.id || !data.modifiedTime) throw new Error("Drive ha risposto senza id/modifiedTime — scrittura non verificabile, considerata fallita.");
    return data;
  }
  const boundary = "resonance_sync_boundary";
  const metadata = { name: SYNC_FILENAME, mimeType: "application/json" };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(state)}\r\n--${boundary}--`;
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error(`Errore creazione file sync (${res.status})`);
  const data = await res.json();
  if (!data.id || !data.modifiedTime) throw new Error("Drive ha risposto senza id/modifiedTime — scrittura non verificabile, considerata fallita.");
  return data;
}
// Unione additiva per array con id univoco: nessuna voce va mai persa, nemmeno con push concorrenti
// da due dispositivi (l'ultimo push vince temporaneamente, il pull successivo riporta e ripubblica tutto).
function mergeById(localArr, remoteArr) {
  const map = new Map();
  (remoteArr || []).forEach((item) => item?.id && map.set(item.id, item));
  (localArr || []).forEach((item) => item?.id && map.set(item.id, item)); // a parità di id, vince la versione locale
  return Array.from(map.values()).sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));
}
const SYNC_DEFAULTS = () => ({
  bio: [], air: [], vidya: [], pBio: [], pAir: [], pVidya: [], magi: [],
  shellChat: [], memory: { bio: "", air: "", vidya: "" }, styleMemory: "",
  kernel: { content: DEFAULT_KERNEL, version: 1, history: [] }, resonance: { text: "", time: null },
  lastModified: 0,
});
// Per i dati non unibili (chat, memoria, kernel, simbiosi): vince in blocco chi ha lastModified più recente.
// Limite accettato: i timestamp sono client-side — un orologio molto sballato può far vincere il device
// sbagliato sui bundle (mai sui log, che sono additivi e non perdono voci).
function mergeSyncState(local, remote) {
  const l = { ...SYNC_DEFAULTS(), ...local };
  if (!remote) return { ...l, lastModified: l.lastModified || Date.now() };
  const r = { ...SYNC_DEFAULTS(), ...remote }; // difesa: bundle mancanti nel file remoto non diventano undefined
  const remoteWins = (r.lastModified || 0) > (l.lastModified || 0);
  return {
    bio: mergeById(l.bio, r.bio), air: mergeById(l.air, r.air), vidya: mergeById(l.vidya, r.vidya),
    pBio: mergeById(l.pBio, r.pBio), pAir: mergeById(l.pAir, r.pAir), pVidya: mergeById(l.pVidya, r.pVidya),
    magi: mergeById(l.magi, r.magi),
    shellChat: remoteWins ? r.shellChat : l.shellChat,
    memory: remoteWins ? r.memory : l.memory,
    styleMemory: remoteWins ? r.styleMemory : l.styleMemory,
    kernel: remoteWins ? r.kernel : l.kernel,
    resonance: remoteWins ? r.resonance : l.resonance,
    lastModified: Math.max(l.lastModified || 0, r.lastModified || 0),
  };
}
const fmtEntry = (lines) => lines.filter(Boolean).join("\n");
function formatBioLog(e) { return `RESONANCE — 04 BIO_STASIS\n\n` + e.map((x) => fmtEntry([fmtDate(x.date), x.weight && `Peso: ${x.weight} kg`, x.sleep && `Sonno: ${x.sleep}`, x.notes])).join("\n\n"); }
function formatAirLog(e) { return `RESONANCE — 03 AIR_OPERATIONS\n\n` + e.map((x) => fmtEntry([`${fmtDate(x.date)} — ${x.status}`, x.title, x.notes])).join("\n\n"); }
function formatVidyaLog(e) { return `RESONANCE — 05 VIDYA_TUNING\n\n` + e.map((x) => fmtEntry([fmtDate(x.date), x.title, x.notes])).join("\n\n"); }
function formatMagiLog(s) { return `RESONANCE — 01 AGORÀ_MAGI\n\n` + s.map((x) => fmtEntry([`${fmtDate(x.date)} — ${x.question}`, x.synthesis && `Sintesi: ${x.synthesis}`])).join("\n\n---\n\n"); }
function formatPercorsiLog(pillarLabel, percorsi) {
  return `RESONANCE — ${pillarLabel} — PERCORSI\n\n` + percorsi.map((p) => fmtEntry([`## ${p.title}`, ...p.topics.map((t) => `  - ${t.label}: ${t.status}`), p.competenze && `Competenze: ${p.competenze}`])).join("\n\n");
}

//──────────────────────────────────────────────────────────
// UI PRIMITIVES
//──────────────────────────────────────────────────────────
const Card = ({ accent, children }) => html`<div class="r-card" style=${accent ? `border-left:3px solid ${accent}` : ""}>${children}</div>`;
const Field = ({ label, children }) => html`<label class="r-field"><span>${label}</span>${children}</label>`;
const Empty = ({ text }) => html`<div class="r-empty">${text}</div>`;
const SectionHeader = ({ color, title, subtitle }) => html`<div class="r-section-header"><h2 style="color:${color}">${title}</h2><p>${subtitle}</p></div>`;
const AddButton = ({ color, open, setOpen, label }) => html`<button class="r-add-btn" style="border-color:${color};color:${color}" onClick=${() => setOpen(!open)}>${open ? "✕ Annulla" : `+ ${label}`}</button>`;
const SubTabs = ({ color, tabs, active, setActive }) => html`
  <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    ${tabs.map((t) => html`<button class="r-add-btn" style="border-color:${color};color:${active === t.key ? "#0A0D12" : color};background:${active === t.key ? color : "transparent"}" onClick=${() => setActive(t.key)}>${t.label}</button>`)}
  </div>`;

//──────────────────────────────────────────────────────────
// PERCORSI — componenti generici
//──────────────────────────────────────────────────────────
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
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };
  const askSuggestions = async () => {
    setSuggesting(true); setError("");
    try { setSuggestions(await suggestPercorsi(pillar, digest, settings)); }
    catch (e) { setError(e.message); } finally { setSuggesting(false); }
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
    catch (e) { setStepError(e.message); } finally { setLoadingStep(false); }
  };
  useEffect(() => { fetchNextStep(); }, [percorso.id]);
  const startQuiz = async (topic) => {
    setQuizTopic(topic); setQuizAnswer(""); setQuizEval(""); setQuizRunning(true);
    try { setQuizQuestion(await generateQuizQuestion(pillar, percorso, topic, settings)); }
    catch (e) { setQuizQuestion("Errore: " + e.message); } finally { setQuizRunning(false); }
  };
  const submitQuizAnswer = async () => {
    if (!quizAnswer.trim()) return;
    setQuizRunning(true);
    try {
      const evalText = await evaluateQuizAnswer(pillar, quizTopic, quizQuestion, quizAnswer.trim(), settings);
      setQuizEval(evalText);
      const m = evalText.match(/STATO:\s*(consolidato|praticato|introdotto)/i);
      if (m) { const topics = percorso.topics.map((t) => (t.id === quizTopic.id ? { ...t, status: m[1].toLowerCase(), lastTouched: new Date().toISOString() } : t)); onUpdate({ ...percorso, topics }); }
    } catch (e) { setQuizEval("Errore: " + e.message); } finally { setQuizRunning(false); }
  };
  const closeSess = async () => {
    if (!sessionNote.trim()) return;
    setClosing(true);
    try {
      const newCompetenze = await closeSession(pillar, percorso, sessionNote.trim(), settings);
      const session = { id: uid(), date: new Date().toISOString(), type: quizTopic ? "quiz" : "studio", topicIds: quizTopic ? [quizTopic.id] : [], summary: sessionNote.trim() };
      onUpdate({ ...percorso, competenze: newCompetenze, sessions: [session, ...percorso.sessions] });
      setSessionNote(""); setQuizTopic(null); setQuizQuestion(""); setQuizAnswer(""); setQuizEval("");
    } catch (e) { /* silenzioso, la nota resta compilata per riprovare */ } finally { setClosing(false); }
  };
  const statusColor = (s) => (s === "consolidato" ? color : s === "praticato" ? "#8FA3AC" : s === "introdotto" ? "#B7C4C8" : "#D3DCDE");
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

//──────────────────────────────────────────────────────────
// HUB
//──────────────────────────────────────────────────────────
function AnochinRing({ bioN, airN, vidyaN, onNav }) {
  const nodes = [{ key: "bio", label: "BIO", color: C.bio, angle: -90, n: bioN }, { key: "air", label: "AIR", color: C.air, angle: 30, n: airN }, { key: "vidya", label: "VIDYA", color: C.vidya, angle: 150, n: vidyaN }];
  const R = 92, cx = 130, cy = 130;
  return html`<div class="r-ring-wrap">
    <svg width="260" height="260" viewBox="0 0 260 260">
      <circle cx=${cx} cy=${cy} r=${R} fill="none" stroke="#C9D9DC" stroke-width="1" stroke-dasharray="2 6" />
      ${nodes.map((n) => { const rad = (n.angle * Math.PI) / 180, x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad); return html`<line x1=${cx} y1=${cy} x2=${x} y2=${y} stroke=${n.color} stroke-opacity="0.45" stroke-width="1.5" />`; })}
      <circle cx=${cx} cy=${cy} r="30" fill="rgba(255,255,255,0.85)" stroke="#D9B872" stroke-width="1.5" class="r-pulse" />
    </svg>
    <div class="r-ring-core" style="left:${cx - 30}px;top:${cy - 30}px">ADAM</div>
    ${nodes.map((n) => { const rad = (n.angle * Math.PI) / 180, x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
      return html`<button class="r-ring-node" style="left:${x - 28}px;top:${y - 28}px;border-color:${n.color}" onClick=${() => onNav(n.key)}><span style="color:${n.color}">${n.label}</span><span class="r-ring-count">${n.n}</span></button>`; })}
  </div>`;
}
function Hub({ bio, air, vidya, magi, resonance, setView }) {
  const lastBio = bio[0], lastAir = air[0], lastVidya = vidya[0];
  return html`<div class="r-screen">
    <button class="r-shell-cta" onClick=${() => setView("shell")}>
      <div class="r-shell-cta-label">SHELL</div>
      <div class="r-shell-cta-sub">Parlagli — penserà lui a smistare tra i pilastri</div>
    </button>
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
      <${Card} accent="#D9B872"><div class="r-hub-row" onClick=${() => setView("simbiosi")}><div><div class="r-hub-title">SIMBIOSI</div>
        <div class="r-hub-detail">${resonance.text ? resonance.text.slice(0, 70) + "…" : "Nessuna valutazione ancora"}</div></div></div></${Card}>
    </div>
  </div>`;
}

//──────────────────────────────────────────────────────────
// BIO / VIDYA / AIR (Log + Percorsi, AIR anche Agente)
//──────────────────────────────────────────────────────────
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

//──────────────────────────────────────────────────────────
// AGORÀ MAGI
//──────────────────────────────────────────────────────────
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
      <${MagiStage} label="Balthasar · il Perturbatore" color="#C97A5C" text=${stage.balthasar} />
      <${MagiStage} label="Melchior · il Traduttore" color="#6FA3AD" text=${stage.melchior} />
      <${MagiStage} label="Caspar · l'Ancora" color="#8FAF95" text=${stage.caspar} />
      <${MagiStage} label="Sintesi Esecutiva" color=${C.core} text=${stage.synthesis} />
    </${Card}>`}
    ${sessions.length === 0 ? html`<${Empty} text="Nessuna sessione ancora registrata." />` : html`<div class="r-list">${sessions.map((s) => html`
      <${Card} accent=${C.core}><div class="r-entry-row"><div style="flex:1"><div class="r-entry-date">${fmtDate(s.date)}${s.engine ? ` · ${s.engine}` : ""}</div>
        <div class="r-entry-line"><b>${s.question}</b></div>
        <${MagiStage} label="Balthasar · il Perturbatore" color="#C97A5C" text=${s.balthasar} compact />
        <${MagiStage} label="Melchior · il Traduttore" color="#6FA3AD" text=${s.melchior} compact />
        <${MagiStage} label="Caspar · l'Ancora" color="#8FAF95" text=${s.caspar} compact />
        <${MagiStage} label="Sintesi Esecutiva" color=${C.core} text=${s.synthesis} compact />
      </div><button class="r-icon-btn" onClick=${() => onDelete(s.id)}>✕</button></div></${Card}>`)}</div>`}
  </div>`;
}

//──────────────────────────────────────────────────────────
// SIMBIOSI
//──────────────────────────────────────────────────────────
function SimbiosiView({ resonance, onRecalc, calculating, error }) {
  return html`<div class="r-screen">
    <${SectionHeader} color="#3A4750" title="SIMBIOSI" subtitle="Il punto di incontro tra i pilastri — sensing tra ordine e caos" />
    <${Card}>
      <button class="r-btn" onClick=${onRecalc} disabled=${calculating}>${calculating ? "Valutazione in corso…" : "Calcola risonanza"}</button>
      ${error && html`<div class="r-error">${error}</div>`}
      ${resonance.text && html`<div class="r-magi-text" style="margin-top:12px;white-space:pre-wrap">${resonance.text}</div>
        <div class="r-hub-detail" style="margin-top:8px">Calcolato: ${new Date(resonance.time).toLocaleString("it-IT")}</div>`}
    </${Card}>
  </div>`;
}

//──────────────────────────────────────────────────────────
// SHELL — chat con memoria, smista da solo nei pilastri
//──────────────────────────────────────────────────────────
function AnochinTrace({ trace }) {
  const [open, setOpen] = useState(false);
  const stages = [
    ["1 · Afferenze", trace.afferenze], ["2 · Decisione", trace.decisione],
    ["3 · Accettore", trace.accettore], ["4 · Effettore", trace.effettore], ["5 · Azione", trace.azione],
  ].filter(([, v]) => v);
  if (!stages.length) return null;
  return html`<div class="r-anochin-wrap">
    <button class="r-anochin-toggle" onClick=${() => setOpen(!open)}>${open ? "▾ Ciclo percezione-azione" : "▸ Ciclo percezione-azione"}</button>
    ${open && html`<div class="r-anochin-body">
      ${stages.map(([label, val]) => html`<div class="r-anochin-stage"><div class="r-anochin-label">${label}</div><div class="r-anochin-val">${val}</div></div>`)}
    </div>`}
  </div>`;
}
function ShellView({ messages, setMessages, settings, addBio, addAir, addVidya, percorsi, setPercorsi, memory, updateMemoria, styleMemory, setStyleMemory, bio, air, vidya, pushDebugLog }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [speakingId, setSpeakingId] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [attaching, setAttaching] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const toggleSpeak = (id, text) => {
    if (speakingId === id) { stopSpeaking(); setSpeakingId(null); return; }
    setSpeakingId(id);
    speakText(text, () => setSpeakingId((cur) => (cur === id ? null : cur)));
  };
  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riselezionare lo stesso file più avanti
    if (!file) return;
    setAttaching(true); setError("");
    try { setAttachment(await processAttachment(file)); }
    catch (err) { setError(err.message); } finally { setAttaching(false); }
  };
  const send = async () => {
    if ((!input.trim() && !attachment) || sending || attaching) return;
    const userText = input.trim() || (attachment?.kind === "image" ? "Guarda questa immagine." : "Guarda questo documento.");
    const currentAttachment = attachment;
    const history = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    const lastMsg = messages[messages.length - 1];
    stopSpeaking(); setSpeakingId(null);
    // Id univoci per messaggio: voce/copia non dipendono più dall'indice (che sbagliava
    // quando una nota di sistema si inseriva in mezzo alla sequenza).
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: userText, time: new Date().toISOString(), attachmentName: currentAttachment ? (currentAttachment.name || "immagine") : null, attachmentKind: currentAttachment?.kind }]);
    const assistantMsgId = uid();
    setInput(""); setAttachment(null); setSending(true); setError("");
    try {
      if (lastMsg?.proposal?.proposed && !lastMsg.proposalResolved) {
        const confirmed = detectConfirmationHeuristic(userText);
        setMessages((prev) => prev.map((m) => (m === lastMsg ? { ...m, proposalResolved: true } : m)));
        if (confirmed) {
          const { pillar, title } = lastMsg.proposal;
          const labels = await decomposeTopics(pillar, title, settings);
          const p = { id: uid(), pillar, title, createdAt: new Date().toISOString(), topics: (labels.length ? labels : ["Primo passo"]).map((l) => ({ id: uid(), label: l, status: "non iniziato", lastTouched: null })), sessions: [], competenze: "" };
          setPercorsi[pillar]([p, ...percorsi[pillar]]);
          setMessages((prev) => [...prev, { id: uid(), role: "system-note", content: `✓ Percorso "${title}" creato in ${pillar.toUpperCase()}.` }]);
        }
      }
      const { reply, actionsLog, anochin, proposal, alerts, newStyleMemory, draft } = await runShellTurn(history, userText, settings, { addBio, addAir, addVidya, updateMemoria }, memory, styleMemory, currentAttachment);
      setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: reply, time: new Date().toISOString(), actions: actionsLog, anochin, proposal, alerts, draft }]);
      if (newStyleMemory !== styleMemory) setStyleMemory(newStyleMemory);
      // L'auto-play parte dopo un await e può perdere lo status di "gesto utente" su Chrome mobile;
      // in quel caso il 🔊 manuale funziona sempre (chiamata sincrona dentro il tap).
      if (settings.voiceEnabled) toggleSpeak(assistantMsgId, reply);
      pushDebugLog?.({ type: "shell-turn", userText: userText.slice(0, 100), model: settings.model, provider: settings.provider, attachment: currentAttachment ? currentAttachment.kind : null, replyLength: reply.length, actionsLog, alertsCount: alerts?.length || 0, hasDraft: !!draft, anochinDecisione: anochin?.decisione, anochinAccettore: anochin?.accettore, error: null });
    } catch (e) {
      setError(e.message);
      pushDebugLog?.({ type: "shell-turn", userText: userText.slice(0, 100), model: settings.model, provider: settings.provider, attachment: currentAttachment ? currentAttachment.kind : null, error: e.message });
    } finally { setSending(false); }
  };
  useEffect(() => () => stopSpeaking(), []); // interrompe la lettura lasciando la scheda Shell
  const [copiedId, setCopiedId] = useState(null);
  const copyDraft = (mid, draft) => {
    const text = draft.subject ? `Oggetto: ${draft.subject}\n\n${draft.body}` : draft.body;
    navigator.clipboard?.writeText(text).then(() => { setCopiedId(mid); setTimeout(() => setCopiedId((c) => (c === mid ? null : c)), 2000); });
  };
  const actionColor = { BIO: C.bio, AIR: C.air, VIDYA: C.vidya };
  const lastBio = bio?.[0], lastAir = air?.[0], lastVidya = vidya?.[0];
  return html`<div class="r-screen">
    <${SectionHeader} color="#3A4750" title="SHELL" subtitle="Dialogo diretto — ciclo di percezione-azione visibile per verifica" />
    <div class="r-shell-digest">
      <div class="r-shell-digest-card" style="border-left-color:${C.bio}">
        <div class="r-shell-digest-label" style="color:${C.bio}">BIO</div>
        <div class="r-shell-digest-detail">${lastBio ? `${lastBio.weight ? lastBio.weight + " kg — " : ""}${fmtDate(lastBio.date)}` : "Nessun dato ancora"}</div>
      </div>
      <div class="r-shell-digest-card" style="border-left-color:${C.air}">
        <div class="r-shell-digest-label" style="color:${C.air}">AIR</div>
        <div class="r-shell-digest-detail">${lastAir ? `${lastAir.title || "Vettore"} — ${lastAir.status || "idea"}` : "Nessun vettore ancora"}</div>
      </div>
      <div class="r-shell-digest-card" style="border-left-color:${C.vidya}">
        <div class="r-shell-digest-label" style="color:${C.vidya}">VIDYA</div>
        <div class="r-shell-digest-detail">${lastVidya ? (lastVidya.title || "Log creativo") : "Nessun log ancora"}</div>
      </div>
    </div>
    <div class="r-shell-log">
      ${messages.length === 0 && html`<div class="r-empty">Scrivi qualcosa. Lo Shell ricorda lo scambio e registra da solo ciò che riguarda BIO/AIR/VIDYA.</div>`}
      ${messages.map((m, i) => { const mid = m.id || i; return m.role === "system-note"
        ? html`<div key=${mid} class="r-shell-system-note">${m.content}</div>`
        : html`<div key=${mid} class="r-shell-row ${m.role}">
            <div class="r-shell-bubble ${m.role}">${m.content}</div>
            ${m.attachmentName && html`<div class="r-shell-attach-badge">${m.attachmentKind === "image" ? "🖼" : "📄"} ${m.attachmentName}</div>`}
            ${m.alerts && m.alerts.length > 0 && m.alerts.map((a) => html`<div class="r-shell-alert"><div class="r-shell-alert-label">⚠ ALLERTA — ${a.pillar.toUpperCase()}</div><div>${a.note}</div></div>`)}
            ${m.draft && html`<div class="r-draft-card">
              <div class="r-draft-label">📝 BOZZA — ${m.draft.type.toUpperCase()}${m.draft.recipient ? ` · per: ${m.draft.recipient}` : ""}</div>
              ${m.draft.subject && html`<div class="r-draft-subject">Oggetto: ${m.draft.subject}</div>`}
              <div class="r-draft-body">${m.draft.body}</div>
              <button class="r-btn r-draft-copy" onClick=${() => copyDraft(mid, m.draft)}>${copiedId === mid ? "✓ Copiato" : "Copia"}</button>
            </div>`}
            <div class="r-shell-msg-footer">
              ${m.actions && m.actions.length > 0 && html`<div class="r-shell-actions">${m.actions.map((a) => html`<span class="r-badge" style="border-color:${actionColor[a]};color:${actionColor[a]}">→ ${a}</span>`)}</div>`}
              ${m.role === "assistant" && html`<button class="r-shell-speak-btn" onClick=${() => toggleSpeak(mid, m.content)} title=${speakingId === mid ? "Interrompi" : "Riascolta"}>${speakingId === mid ? "⏹" : "🔊"}</button>`}
            </div>
            ${m.anochin && html`<${AnochinTrace} trace=${m.anochin} />`}
          </div>`; })}
      <div ref=${bottomRef}></div>
    </div>
    ${error && html`<div class="r-error">${error}</div>`}
    ${attachment && html`<div class="r-shell-attach-preview">
      <span>${attachment.kind === "image" ? "🖼" : "📄"} ${attachment.name || "immagine"}</span>
      <button class="r-icon-btn" onClick=${() => setAttachment(null)}>✕</button>
    </div>`}
    <div class="r-shell-inputbar">
      <input ref=${fileInputRef} type="file" accept="image/*,.pdf,.txt,.md" style="display:none" onChange=${onFileChosen} />
      <button class="r-shell-attach-btn" onClick=${() => fileInputRef.current?.click()} disabled=${sending || attaching} title="Allega immagine o documento">${attaching ? "…" : "📎"}</button>
      <textarea class="r-textarea" value=${input} onInput=${(e) => setInput(e.target.value)} placeholder=${attachment ? "Aggiungi una nota (opzionale)…" : "Scrivi al tuo Shell…"} disabled=${sending} />
      <button class="r-btn" onClick=${send} disabled=${sending || attaching || (!input.trim() && !attachment)}>${sending ? "…" : "Invia"}</button>
    </div>
  </div>`;
}

//──────────────────────────────────────────────────────────
// KERNEL
//──────────────────────────────────────────────────────────
function KernelView({ kernel, onSave, driveStatus }) {
  const [draft, setDraft] = useState(kernel.content); const [showHistory, setShowHistory] = useState(false);
  useEffect(() => setDraft(kernel.content), [kernel.content]);
  const dirty = draft !== kernel.content;
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.core} title="KERNEL" subtitle="Versione V${kernel.version} — versioning atomico" />
    <${Card} accent=${C.core}>
      <textarea class="r-textarea r-kernel-textarea" value=${draft} onInput=${(e) => setDraft(e.target.value)} rows="14" />
      <div class="r-kernel-actions">
        <button class="r-btn" style=${!dirty ? "background:#E4E9EA;color:#8FA3AC" : ""} onClick=${() => dirty && onSave(draft)} disabled=${!dirty}>Salva come V${kernel.version + 1}</button>
        <button class="r-btn r-btn-ghost" onClick=${() => setShowHistory(!showHistory)}>Storico (${kernel.history.length})</button>
      </div>
      ${driveStatus.time && html`<div class="r-hub-detail" style="margin-top:8px">Drive: ${driveStatus.state === "syncing" ? "sincronizzazione…" : driveStatus.state === "ok" ? `sincronizzato — conferma Drive ${driveStatus.remoteTime ? new Date(driveStatus.remoteTime).toLocaleTimeString("it-IT") : "—"}` : `errore — ${driveStatus.error}`}</div>`}
    </${Card}>
    ${showHistory && (kernel.history.length === 0 ? html`<${Empty} text="Nessuna versione precedente." />` : html`<div class="r-list">${[...kernel.history].reverse().map((h) => html`
      <${Card}><div class="r-entry-date">V${h.version} — ${fmtDate(h.date)}</div><div class="r-kernel-preview">${h.content.slice(0, 220)}${h.content.length > 220 ? "…" : ""}</div></${Card}>`)}</div>`)}
  </div>`;
}

//──────────────────────────────────────────────────────────
// SETTINGS
//──────────────────────────────────────────────────────────
function SettingsView({ settings, updateSettings, driveStatus, debugLog, clearDebugLog, pullAndMergeOnce }) {
  const presetIds = MODEL_OPTIONS.filter((m) => m.id !== "custom").map((m) => m.id);
  const isCustom = !presetIds.includes(settings.model);
  const [driveMsg, setDriveMsg] = useState(""); const [connecting, setConnecting] = useState(false);
  const clientIdReady = CONFIG.GOOGLE_CLIENT_ID && !CONFIG.GOOGLE_CLIENT_ID.startsWith("INCOLLA");
  const testConnect = async () => { setConnecting(true); setDriveMsg("");
    try { await connectDrive(); setDriveMsg("Connesso — puoi attivare la sincronizzazione."); } catch (e) { setDriveMsg("Errore: " + e.message); } finally { setConnecting(false); } };
  const [logSyncMsg, setLogSyncMsg] = useState(""); const [logSyncing, setLogSyncing] = useState(false);
  const exportDebugLog = () => {
    const blob = new Blob([JSON.stringify(debugLog, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `resonance-debug-log-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const syncDebugLogToDrive = async () => {
    setLogSyncing(true); setLogSyncMsg("");
    try { await createDriveFile(`00_DEBUG_LOG_${todayISO()}.json`, JSON.stringify(debugLog, null, 2)); setLogSyncMsg("Sincronizzato su Drive."); }
    catch (e) { setLogSyncMsg("Errore: " + e.message); } finally { setLogSyncing(false); }
  };
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
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#3A4750">Braccia — Bozze pronte</div>
        <div class="r-hub-detail">Lo Shell prepara email/messaggi/script pronti da copiare — non li invia mai da solo</div></div>
        <input type="checkbox" checked=${settings.armsDraftsEnabled} onInput=${(e) => updateSettings({ armsDraftsEnabled: e.target.checked })} /></div>
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#3A4750">Lettura vocale dello Shell</div>
        <div class="r-hub-detail">Legge automaticamente ogni risposta (voce del browser, gratuita)</div></div>
        <input type="checkbox" checked=${settings.voiceEnabled} onInput=${(e) => updateSettings({ voiceEnabled: e.target.checked })} /></div>
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#3A4750">Sincronizzazione tra dispositivi</div>
        <div class="r-hub-detail">Unisce i log tra i tuoi dispositivi (nessuna voce va persa); l'ultima modifica vince solo su chat/memoria/kernel/simbiosi. Lo stato qui sotto è letto dalla risposta reale di Drive, non presunto.</div></div>
        <input type="checkbox" checked=${settings.driveSyncEnabled} disabled=${!clientIdReady} onInput=${(e) => updateSettings({ driveSyncEnabled: e.target.checked })} /></div>
      ${!clientIdReady && html`<div class="r-hub-detail" style="margin-top:8px">Manca il Client ID Google in config.js — vedi README.md.</div>`}
      ${clientIdReady && html`<div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${testConnect} disabled=${connecting}>${connecting ? "Connessione…" : "Testa connessione Drive"}</button>
        ${settings.driveSyncEnabled && html`<button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${pullAndMergeOnce} disabled=${driveStatus.state === "syncing"}>${driveStatus.state === "syncing" ? "Sincronizzo…" : "Sincronizza ora"}</button>`}
      </div>
        ${driveMsg && html`<div class="r-hub-detail" style="margin-top:6px">${driveMsg}</div>`}`}
      ${driveStatus.time && html`<div class="r-hub-detail" style="margin-top:8px">
        Ultima sincronizzazione: ${new Date(driveStatus.time).toLocaleTimeString("it-IT")} — ${driveStatus.state === "ok" ? "riuscita" : driveStatus.state === "syncing" ? "in corso…" : `errore: ${driveStatus.error}`}
        ${driveStatus.state === "ok" && driveStatus.remoteTime && html`<br/>Conferma da Drive — file modificato: ${new Date(driveStatus.remoteTime).toLocaleString("it-IT")}`}
      </div>`}
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Log di debug — ${debugLog?.length || 0} eventi registrati</div>
      <div class="r-hub-detail">Turni dello Shell ed eventi di sincronizzazione (modello, esito, errori) — per capire cosa è successo senza screenshot</div>
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="r-btn" onClick=${exportDebugLog} disabled=${!debugLog?.length}>Esporta (.json)</button>
        ${clientIdReady && html`<button class="r-btn r-btn-ghost" onClick=${syncDebugLogToDrive} disabled=${logSyncing || !debugLog?.length}>${logSyncing ? "Sincronizzo…" : "Sincronizza su Drive"}</button>`}
        <button class="r-btn r-btn-ghost" onClick=${clearDebugLog} disabled=${!debugLog?.length}>Svuota</button>
      </div>
      ${logSyncMsg && html`<div class="r-hub-detail" style="margin-top:6px">${logSyncMsg}</div>`}
      <div class="r-hub-detail" style="margin-top:10px">Build: ${APP_BUILD}</div>
    </${Card}>
  </div>`;
}

//──────────────────────────────────────────────────────────
// ROOT
//──────────────────────────────────────────────────────────
const TABS = [
  { key: "hub", label: "Hub" }, { key: "shell", label: "Shell" }, { key: "bio", label: "Bio" }, { key: "air", label: "Air" },
  { key: "vidya", label: "Vidya" }, { key: "magi", label: "Magi" }, { key: "simbiosi", label: "Adam" },
  { key: "kernel", label: "Kernel" }, { key: "settings", label: "Setup" },
];
function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" ");
}
function HexTexture() {
  const r = 15, rows = 14, cols = 10;
  const hexes = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) hexes.push({ x: col * r * 1.73 + (row % 2 ? r * 0.87 : 0), y: row * r * 1.5, k: (row * cols + col) % 5 });
  const palette = [C.core, C.air, C.vidya, C.bio, "#C9D9DC"];
  return html`<svg class="r-hex-texture" viewBox="0 0 480 ${rows * r * 1.5}" preserveAspectRatio="xMidYMin slice">
    ${hexes.map((h, i) => html`<polygon points=${hexPoints(h.x, h.y, r * 0.98)} fill="none" stroke=${palette[h.k]} stroke-width="0.6" style="animation-delay:${(i % 7) * 0.3}s" />`)}
  </svg>`;
}
function App() {
  const [view, setView] = useState("hub");
  const [bio, setBio] = useState(() => loadKey("bio-data", []));
  const [air, setAir] = useState(() => loadKey("air-data", []));
  const [vidya, setVidya] = useState(() => loadKey("vidya-data", []));
  const [magi, setMagi] = useState(() => loadKey("magi-data", []));
  const [shellChat, setShellChatRaw] = useState(() => loadKey("shell-chat", []));
  const setShellChat = useCallback((updater) => setShellChatRaw((prev) => { const next = typeof updater === "function" ? updater(prev) : updater; saveKey("shell-chat", next); return next; }), []);
  const [pBio, setPBio] = useState(() => loadKey("percorsi-bio", []));
  const [pAir, setPAir] = useState(() => loadKey("percorsi-air", []));
  const [pVidya, setPVidya] = useState(() => loadKey("percorsi-vidya", []));
  const [kernel, setKernel] = useState(() => loadKey("kernel-data", { content: DEFAULT_KERNEL, version: 1, history: [] }));
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...loadKey("app-settings", {}) }));
  const [driveStatus, setDriveStatus] = useState({ state: "idle", time: null, error: null, remoteTime: null, fileId: null });
  const [resonance, setResonance] = useState(() => loadKey("simbiosi-data", { text: "", time: null }));
  const [resCalculating, setResCalculating] = useState(false);
  const [resError, setResError] = useState("");
  const [memory, setMemory] = useState(() => loadKey("shell-memory", { bio: "", air: "", vidya: "" }));
  const [styleMemory, setStyleMemoryRaw] = useState(() => loadKey("shell-style-memory", ""));
  const updateMemoria = useCallback((pillar, text) => setMemory((prev) => { const n = { ...prev, [pillar]: text }; saveKey("shell-memory", n); return n; }), []);
  const setStyleMemory = useCallback((text) => setStyleMemoryRaw(() => { saveKey("shell-style-memory", text); return text; }), []);
  const [debugLog, setDebugLog] = useState(() => loadKey("debug-log", []));
  const pushDebugLog = useCallback((entry) => setDebugLog((prev) => { const n = [{ ...entry, time: new Date().toISOString() }, ...prev].slice(0, 50); saveKey("debug-log", n); return n; }), []);
  const clearDebugLog = useCallback(() => { setDebugLog([]); saveKey("debug-log", []); }, []);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  // File versionati per compartimento (Legge 14): silenziosi in UI, ma tracciati nel log di debug.
  const syncIfEnabled = useCallback((label, content) => {
    if (!settingsRef.current.driveSyncEnabled) return;
    createDriveFile(`Resonance – ${label} – ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, content)
      .catch((e) => pushDebugLog({ type: "versioned-file", label, error: e.message }));
  }, [pushDebugLog]);
  const updateSettings = useCallback((patch) => setSettings((prev) => { const next = { ...prev, ...patch }; saveKey("app-settings", next); return next; }), []);

  // ═══ SYNC TRA DISPOSITIVI ═══
  // Due percorsi distinti, mai in conflitto:
  //  • pullAndMergeOnce = pull → merge → APPLICA localmente → push   (solo al mount e sul bottone manuale)
  //  • pushMergedOnce   = pull → merge → push, SENZA applicare       (autosave: evita il loop apply→autosave→apply)
  // Flag dedicati distinguono i cambi di stato "veri" da quelli causati dall'apply:
  //  1) l'apply non falsifica il timestamp locale (skipStampRef)
  //  2) l'apply non fa ripartire l'autosave (skipAutosaveRef)
  // Un lucchetto (syncBusyRef) con coda-di-uno (pendingPushRef) impedisce sync concorrenti
  // senza mai perdere l'ultimo push.
  const syncFileIdRef = useRef(null);
  // Inizializzazione SINCRONA alla prima render: così il primo pull al mount trova già lo stato
  // reale in stateRef, senza dipendere dall'ordine di esecuzione degli effetti (Bug A).
  const stateRef = useRef({ bio, air, vidya, pBio, pAir, pVidya, magi, shellChat, memory, styleMemory, kernel, resonance });
  const hasMountedRef = useRef(false);
  const skipStampRef = useRef(false);
  const skipAutosaveRef = useRef(false);
  const hasMountedAutosaveRef = useRef(false);
  const syncBusyRef = useRef(false);
  const pendingPushRef = useRef(false);
  const pushMergedOnceRef = useRef(null);

  // (1) Mirroring dello stato + timbro temporale sulle modifiche REALI.
  // NOTA: quest'effetto deve restare dichiarato PRIMA degli effetti di sync — l'ordine di
  // dichiarazione è l'ordine di esecuzione, e al mount stateRef va popolato prima del primo pull.
  useEffect(() => {
    stateRef.current = { bio, air, vidya, pBio, pAir, pVidya, magi, shellChat, memory, styleMemory, kernel, resonance };
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }          // idratazione iniziale: non è una modifica
    if (skipStampRef.current) { skipStampRef.current = false; return; }            // apply da Drive: il timestamp giusto l'ha già scritto applyMergedState
    saveKey("sync-last-modified", Date.now());                                     // modifica reale dell'utente/Shell
  }, [bio, air, vidya, pBio, pAir, pVidya, magi, shellChat, memory, styleMemory, kernel, resonance]);

  const applyMergedState = (merged) => {
    // Tutti i setState qui sotto sono sincroni e vengono raggruppati in un solo re-render:
    // NON inserire await in mezzo, o i flag skip coprirebbero solo una parte degli aggiornamenti.
    skipStampRef.current = true;
    skipAutosaveRef.current = true;
    setBio(merged.bio); saveKey("bio-data", merged.bio);
    setAir(merged.air); saveKey("air-data", merged.air);
    setVidya(merged.vidya); saveKey("vidya-data", merged.vidya);
    setPBio(merged.pBio); saveKey("percorsi-bio", merged.pBio);
    setPAir(merged.pAir); saveKey("percorsi-air", merged.pAir);
    setPVidya(merged.pVidya); saveKey("percorsi-vidya", merged.pVidya);
    setMagi(merged.magi); saveKey("magi-data", merged.magi);
    setShellChatRaw(merged.shellChat); saveKey("shell-chat", merged.shellChat);
    setMemory(merged.memory); saveKey("shell-memory", merged.memory);
    setStyleMemoryRaw(merged.styleMemory); saveKey("shell-style-memory", merged.styleMemory);
    setKernel(merged.kernel); saveKey("kernel-data", merged.kernel);
    setResonance(merged.resonance); saveKey("simbiosi-data", merged.resonance);
    stateRef.current = { bio: merged.bio, air: merged.air, vidya: merged.vidya, pBio: merged.pBio, pAir: merged.pAir, pVidya: merged.pVidya, magi: merged.magi, shellChat: merged.shellChat, memory: merged.memory, styleMemory: merged.styleMemory, kernel: merged.kernel, resonance: merged.resonance };
    saveKey("sync-last-modified", merged.lastModified);
  };

  const syncCore = useCallback(async (applyLocally) => {
    const found = syncFileIdRef.current ? { id: syncFileIdRef.current } : await findSyncFile();
    let fileId = found?.id || null;
    syncFileIdRef.current = fileId;
    const remote = fileId ? await downloadSyncState(fileId) : null;
    if (fileId && remote === null) { fileId = null; syncFileIdRef.current = null; } // file cancellato a mano: si ricrea
    const local = { ...stateRef.current, lastModified: loadKey("sync-last-modified", 0) };
    const merged = mergeSyncState(local, remote);
    if (applyLocally) applyMergedState(merged);
    const written = await uploadSyncState(merged, fileId); // { id, modifiedTime } REALI dalla risposta di Google
    syncFileIdRef.current = written.id;
    return written;
  }, []);

  const drainPendingPush = () => {
    if (pendingPushRef.current) {
      pendingPushRef.current = false;
      setTimeout(() => { pushMergedOnceRef.current && pushMergedOnceRef.current(); }, 300);
    }
  };

  // Pull completo con applicazione locale: al mount (o attivazione del toggle) e sul bottone manuale.
  const pullAndMergeOnce = useCallback(async () => {
    if (!settingsRef.current.driveSyncEnabled || syncBusyRef.current) return;
    syncBusyRef.current = true;
    setDriveStatus((s) => ({ ...s, state: "syncing", error: null }));
    try {
      const written = await syncCore(true);
      setDriveStatus({ state: "ok", time: Date.now(), error: null, remoteTime: written.modifiedTime, fileId: written.id });
      pushDebugLog({ type: "sync-pull", remoteTime: written.modifiedTime, error: null });
    } catch (e) {
      setDriveStatus({ state: "error", time: Date.now(), error: e.message, remoteTime: null, fileId: syncFileIdRef.current });
      pushDebugLog({ type: "sync-pull", error: e.message });
    } finally {
      syncBusyRef.current = false;
      drainPendingPush();
    }
  }, [syncCore, pushDebugLog]);

  // Push con merge, senza applicazione locale: usato dall'autosave. Nessun setState sui dati → nessun loop.
  const pushMergedOnce = useCallback(async () => {
    if (!settingsRef.current.driveSyncEnabled) return;
    if (syncBusyRef.current) { pendingPushRef.current = true; return; } // sync già in volo: accoda un solo retry
    syncBusyRef.current = true;
    setDriveStatus((s) => ({ ...s, state: "syncing", error: null }));
    try {
      const written = await syncCore(false);
      setDriveStatus({ state: "ok", time: Date.now(), error: null, remoteTime: written.modifiedTime, fileId: written.id });
      pushDebugLog({ type: "sync-push", remoteTime: written.modifiedTime, error: null });
    } catch (e) {
      setDriveStatus({ state: "error", time: Date.now(), error: e.message, remoteTime: null, fileId: syncFileIdRef.current });
      pushDebugLog({ type: "sync-push", error: e.message });
    } finally {
      syncBusyRef.current = false;
      drainPendingPush();
    }
  }, [syncCore, pushDebugLog]);
  useEffect(() => { pushMergedOnceRef.current = pushMergedOnce; }, [pushMergedOnce]);

  // (2) Al mount o all'attivazione del toggle: pull completo.
  // Al mount senza gesture il popup di login può essere bloccato dal browser — in quel caso
  // l'error_callback produce un errore visibile che invita a usare "Sincronizza ora" (tap reale).
  useEffect(() => { if (settings.driveSyncEnabled) pullAndMergeOnce(); }, [settings.driveSyncEnabled]);

  // (3) Autosave con ritardo di 2s: push-merge (senza apply) a ogni modifica reale.
  useEffect(() => {
    if (!settings.driveSyncEnabled) { skipAutosaveRef.current = false; return; } // sync off: non lasciare il flag armato (Bug B)
    if (!hasMountedAutosaveRef.current) { hasMountedAutosaveRef.current = true; return; } // il mount ha già il suo pull
    if (skipAutosaveRef.current) { skipAutosaveRef.current = false; return; }             // cambio causato da un apply: già sincronizzato
    const t = setTimeout(() => { pushMergedOnce(); }, 2000);
    return () => clearTimeout(t);
  }, [bio, air, vidya, pBio, pAir, pVidya, magi, shellChat, memory, styleMemory, kernel, resonance, settings.driveSyncEnabled]);

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
    } catch (e) { setResError(e.message); } finally { setResCalculating(false); }
  }, [bio, air, vidya, kernel, magi, pBio, pAir, pVidya]);

  const digestBio = `Kernel: ${kernel.content.slice(0, 300)}\nUltime voci BIO: ${bio.slice(0, 5).map((e) => e.notes || e.weight).join("; ")}\nPercorsi esistenti: ${pBio.map((p) => p.title).join(", ") || "nessuno"}`;
  const digestAir = `Kernel: ${kernel.content.slice(0, 300)}\nUltimi vettori AIR: ${air.slice(0, 5).map((e) => `${e.title} (${e.status})`).join("; ")}\nPercorsi esistenti: ${pAir.map((p) => p.title).join(", ") || "nessuno"}`;
  const digestVidya = `Kernel: ${kernel.content.slice(0, 300)}\nUltimi log VIDYA: ${vidya.slice(0, 5).map((e) => e.title).join("; ")}\nPercorsi esistenti: ${pVidya.map((p) => p.title).join(", ") || "nessuno"}`;

  return html`<div>
    <${HexTexture} />
    <div class="r-topbar"><div class="r-brand">RESONANCE<span>•</span></div></div>
    ${view === "hub" && html`<${Hub} bio=${bio} air=${air} vidya=${vidya} magi=${magi} resonance=${resonance} setView=${setView} />`}
    ${view === "shell" && html`<${ShellView} messages=${shellChat} setMessages=${setShellChat} settings=${settings} addBio=${addBio} addAir=${addAir} addVidya=${addVidya}
      percorsi=${{ bio: pBio, air: pAir, vidya: pVidya }} setPercorsi=${{ bio: setPBioSync, air: setPAirSync, vidya: setPVidyaSync }}
      memory=${memory} updateMemoria=${updateMemoria} styleMemory=${styleMemory} setStyleMemory=${setStyleMemory} bio=${bio} air=${air} vidya=${vidya} pushDebugLog=${pushDebugLog} />`}
    ${view === "bio" && html`<${BioView} entries=${bio} onAdd=${addBio} onDelete=${delBio} percorsi=${pBio} setPercorsi=${setPBioSync} settings=${settings} digest=${digestBio} />`}
    ${view === "air" && html`<${AirView} entries=${air} onAdd=${addAir} onDelete=${delAir} percorsi=${pAir} setPercorsi=${setPAirSync} settings=${settings} digest=${digestAir} />`}
    ${view === "vidya" && html`<${VidyaView} entries=${vidya} onAdd=${addVidya} onDelete=${delVidya} percorsi=${pVidya} setPercorsi=${setPVidyaSync} settings=${settings} digest=${digestVidya} />`}
    ${view === "magi" && html`<${MagiView} sessions=${magi} onSave=${addMagi} onDelete=${delMagi} settings=${settings} />`}
    ${view === "simbiosi" && html`<${SimbiosiView} resonance=${resonance} onRecalc=${recalcResonance} calculating=${resCalculating} error=${resError} />`}
    ${view === "kernel" && html`<${KernelView} kernel=${kernel} onSave=${saveKernel} driveStatus=${driveStatus} />`}
    ${view === "settings" && html`<${SettingsView} settings=${settings} updateSettings=${updateSettings} driveStatus=${driveStatus} debugLog=${debugLog} clearDebugLog=${clearDebugLog} pullAndMergeOnce=${pullAndMergeOnce} />`}
    <div class="r-tab-bar"><div class="r-tab-bar-inner">${TABS.map((t) => html`<button class="r-tab ${view === t.key ? "active" : ""}" onClick=${() => setView(t.key)}>${t.label}</button>`)}</div></div>
  </div>`;
}
render(html`<${App} />`, document.getElementById("app"));
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
