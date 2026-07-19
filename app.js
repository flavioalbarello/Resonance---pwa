import { h, render } from "https://esm.sh/preact@10.24.2";
import { useState, useEffect, useCallback, useRef } from "https://esm.sh/preact@10.24.2/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { CONFIG } from "./config.js";

const html = htm.bind(h);

// Versione build visibile in Setup: verifica in un colpo d'occhio che il deploy live sia questo file.
const APP_BUILD = "2026-07-19 · shell-websearch-v1";

const C = { bio: "#3F7860", air: "#3A3F4A", vidya: "#B8863A", core: "#C9A96E", muted: "#8B92A0" };
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
// Ultimi scambi Shell in testo semplice, per il segnale linguistico diretto della cristallizzazione
// (Simbiosi mandato 4, punto d). Esclude system-note (rumore, non linguaggio del Ghost).
function recentShellText(shellChat, n = 10) {
  return (shellChat || []).slice(-n).filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Ghost" : "Shell"}: ${(m.content || "").slice(0, 300)}`).join("\n");
}

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
  calendarEnabled: true,
};

const MODEL_OPTIONS = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet (via OpenRouter)" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
  { id: "custom", label: "Altro (slug personalizzato)" },
];

// Profilo del Ghost — prima era testo fisso (PILLAR_CTX), ora è dati caricati per-Ghost.
// Il default replica ESATTAMENTE il profilo di Flavio: zero cambio di comportamento per lui.
// Un secondo Ghost (nuovo utente) parte dal questionario di onboarding, non da questo default.
const DEFAULT_GHOST_PROFILE = {
  name: "Flavio (Can)",
  cognitiveNotes: "Il Ghost ha profilo cognitivo emisfero-destro dominante, elaborazione configurazionale non lineare, canale uditivo-cinestesico prioritario (e, come secondo canale, riferimenti culturali concreti come ponte verso intuizioni astratte): privilegia esercizi pratici/all'orecchio rispetto alla teoria scritta pura. Linguaggio denso ma sempre traducibile in azione concreta.",
  bioConstraints: "Vincoli fissi del Ghost: esclude zucchine e fagiolini; quasi nessun pesce, tranne tonno in scatola, salmone affumicato, molluschi e crostacei. Target ~1600 kcal/die, 5 occasioni alimentari, colazioni e spuntini salati, alternative portatili per i giorni fuori casa (lun/mer/ven).",
  hasProfessionalConstraint: true,
  professionalIdentity: "fisioterapista, PhysioAlba",
};
// Traduce il profilo in contesto per pilastro. Il vincolo AIR resta hard-stop SOLO se il Ghost
// ne ha dichiarato uno in onboarding (hasProfessionalConstraint) — non tutti i Ghost ne avranno uno.
function buildPillarCtx(profile) {
  const air = profile.hasProfessionalConstraint
    ? `Vincolo assoluto, hard-stop non negoziabile: nessuna strategia deve esporre l'identità professionale del Ghost (${profile.professionalIdentity}) né richiedere dilatazione del suo tempo lineare di lavoro. È l'unico punto del sistema dove la lettura non è negoziabile — tutto il resto resta revisionabile.`
    : `Nessun vincolo di compartimentazione professionale dichiarato per questo Ghost. Resta comunque valido il principio generale: non richiedere dilatazione insostenibile del suo tempo lineare di lavoro.`;
  return {
    vidya: profile.cognitiveNotes || "",
    bio: (profile.bioConstraints || "") + " Ogni lettura BIO è una stance interpretativa rivedibile dal Ghost, mai un verdetto medico oggettivo.",
    air,
  };
}
let CURRENT_GHOST_PROFILE = DEFAULT_GHOST_PROFILE;
let PILLAR_CTX = buildPillarCtx(DEFAULT_GHOST_PROFILE);
function setGhostProfile(profile) { CURRENT_GHOST_PROFILE = profile; PILLAR_CTX = buildPillarCtx(profile); }

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
async function askModelWithHistory(system, messages, temperature, maxTokens, settings, image = null, useWebSearch = false) {
  if (!settings.apiKey) throw new Error("Nessuna chiave API impostata (vai in Setup).");
  if (settings.provider === "claude-direct") {
    const last = messages[messages.length - 1];
    return askClaudeDirect(system, last?.content || "", temperature, maxTokens, settings.apiKey, image);
  }
  // L'immagine si allega SOLO all'ultimo messaggio (turno corrente), mai alla storia passata
  const msgs = messages.map((m, i) => (i === messages.length - 1 && image ? { role: m.role, content: buildOpenRouterContent(m.content, image) } : m));
  const body = { model: settings.model, max_tokens: maxTokens, temperature, reasoning: { max_tokens: 300 }, messages: [{ role: "system", content: system }, ...msgs] };
  if (useWebSearch) body.tools = [{ type: "openrouter:web_search" }]; // solo OpenRouter — Claude-direct esce già sopra
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore OpenRouter");
  return (data.choices?.[0]?.message?.content || "").trim();
}
// Estrae il primo blocco {...} bilanciato da una stringa, tollerando testo prima/dopo
// (preamboli tipo "Ecco la valutazione:" che alcuni modelli aggiungono nonostante l'istruzione
// di rispondere solo JSON). Consapevole di stringhe interne — non si fa ingannare da graffe
// dentro un valore stringa — e di escape (\"). Ritorna null se il blocco non si richiude mai
// (risposta troncata), senza mai lanciare eccezioni.
function extractJsonBlock(raw) {
  if (!raw) return null;
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return raw.slice(start, i + 1); }
  }
  return null;
}
// Rimuove virgole finali prima di } o ] — errore comune in modelli meno rigorosi sull'output
// strutturato (es. {"a":1,"b":2,}), invalido per JSON.parse standard. Non tocca virgole dentro
// i valori stringa (es. "elenco: a, b, c,") perché opera solo sulla sequenza ",spazi}" o ",spazi]".
function stripTrailingCommas(s) { return s.replace(/,(\s*[}\]])/g, "$1"); }
// Causa reale confermata (15/07/2026) dietro i fallimenti sistematici di Llama: il modello scrive
// prosa multi-paragrafo con newline letterali DENTRO il valore di una stringa JSON, invece di
// escaparli come \n — invalido per lo standard JSON (JSON.parse rifiuta caratteri di controllo
// non escaped in una stringa). Sostituisce newline/tab/CR/altri caratteri di controllo con la loro
// forma escaped, ma SOLO quando ci si trova dentro le virgolette — non tocca whitespace strutturale.
function sanitizeJsonControlChars(s) {
  let out = "", inString = false, escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { out += ch; escape = false; continue; }
    if (ch === "\\") { out += ch; escape = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { continue; } // parte di CRLF o CR isolato: scartato, \n (se presente) copre l'a-capo
      if (ch === "\t") { out += "\\t"; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) { out += "\\u" + code.toString(16).padStart(4, "0"); continue; }
    }
    out += ch;
  }
  return out;
}
function logJsonFailure(raw, settings) {
  try {
    const prev = loadKey("json-parse-failures", []);
    const entry = { time: new Date().toISOString(), model: settings?.model || settings?.provider || "?", raw: (raw || "").slice(0, 600) };
    saveKey("json-parse-failures", [entry, ...prev].slice(0, 10));
  } catch { /* diagnostica best-effort: non deve mai far fallire il turno */ }
}
async function askModelJSON(system, userText, temperature, maxTokens, settings, image = null) {
  const raw = await askModel(system + "\n\nRispondi SOLO con JSON valido, nessun testo prima o dopo, nessun blocco markdown.", userText, temperature, maxTokens, settings, false, image);
  if (!raw) return null;
  const cleaned = stripTrailingCommas(sanitizeJsonControlChars(raw.replace(/```json|```/g, "").trim()));
  try { return JSON.parse(cleaned); } catch { /* prova il fallback sotto */ }
  // Fallback: alcuni motori (Llama, Kimi, DeepSeek) aggiungono preamboli/chiusure nonostante
  // l'istruzione — estrae il blocco JSON bilanciato ignorando il testo intorno.
  const block = extractJsonBlock(raw);
  if (block) {
    try { return JSON.parse(stripTrailingCommas(sanitizeJsonControlChars(block))); } catch { /* prova comunque a loggare sotto */ }
  }
  // Entrambi i tentativi falliti: salva la risposta grezza per diagnosi (visibile in Setup),
  // invece di continuare a indovinare fix senza aver mai visto un caso reale fallire.
  logJsonFailure(raw, settings);
  return null;
}

//──────────────────────────────────────────────────────────
// TRIADE MAGI — pipeline sequenziale fissa (Legge 15 abrogata: non è un dibattito iterativo)
//──────────────────────────────────────────────────────────
// opts: { memory, targetPillar, intensity } — Magi non è più cieco (Manifesto V3 §4.1/§4.4).
// Balthasar vede l'intera memoria procedurale (accoppiamento interpretativo largo, §6.2);
// l'intensità modula la sua temperatura (rischio dosato, §4.4); Caspar riceve il pilastro-bersaglio
// per verificare il contenimento operativo (accoppiamento operativo stretto, §4.4).
const MAGI_INTENSITY = { leggera: 0.95, media: 1.15, profonda: 1.35 };
async function runTriadeMagi(question, onStage, settings, opts = {}) {
  const { memory = null, targetPillar = null, intensity = "media" } = opts;
  const baseCtx = `Contesto: sei parte del sistema "Resonance", framework di sviluppo personale del Ghost (Flavio), tre pilastri: BIO (salute), AIR (autonomia economica), VIDYA (crescita creativa/cognitiva). Sei l'unico polo di perturbazione deliberata del sistema — gli altri meccanismi mantengono, tu spingi oltre la cristallizzazione. Rispondi in italiano, diretto, max 70 parole, senza premesse.`;
  const memoriaCtx = memory ? `\n\nMemoria procedurale accumulata sui pilastri (leggila per generare una perturbazione radicata nella storia reale del sistema, non generica):\nBIO: ${memory.bio || "nessuna nota"}\nAIR: ${memory.air || "nessuna nota"}\nVIDYA: ${memory.vidya || "nessuna nota"}` : "";
  const targetCtx = targetPillar ? `\n\nQuesta perturbazione è MIRATA al pilastro ${targetPillar.toUpperCase()}.` : "";
  // Intensità: modula la temperatura di Balthasar. Su Claude-direct il tetto resta 1.0 (già gestito da askModel).
  const balthasarTemp = settings.provider === "openrouter" ? (MAGI_INTENSITY[intensity] || 1.15) : Math.min(MAGI_INTENSITY[intensity] || 1.0, 1.0);
  onStage("balthasar", null);
  // Ancoraggio reale (Manifesto V3 §4.5, mem #23): senza ricerca, Balthasar rimescola solo concetti
  // già noti al Ghost e suona come "eco". Web search solo su OpenRouter (Claude-direct non supporta
  // questo tool nel client attuale) — degrada silenziosamente a perturbazione da sola immaginazione.
  const balthasarWebSearch = settings.provider === "openrouter";
  const balthasarPrompt = `${baseCtx}${memoriaCtx}${targetCtx} Sei BALTHASAR, il Perturbatore.${balthasarWebSearch ? " Hai accesso alla ricerca web: usala per ancorare la perturbazione a un dato, caso o approccio reale non ancora noto al Ghost — non limitarti a rimescolare concetti che già possiede." : ""} Genera una divergenza evolutiva su questo tema, audace, non convenzionale — a intensità "${intensity}" (leggera = uno spostamento laterale; profonda = una rottura vera con l'assetto attuale).`;
  const balthasar = await askModel(balthasarPrompt, question, balthasarTemp, 1600, settings, balthasarWebSearch);
  onStage("balthasar", balthasar);
  onStage("melchior", null);
  const melchior = await askModel(`${baseCtx} Sei MELCHIOR, il Traduttore. Traduci questa idea in azione concretamente eseguibile.\n\nIdea di Balthasar: "${balthasar}"`, question, 0.7, 1600, settings);
  onStage("melchior", melchior);
  onStage("caspar", null);
  const containmentCtx = targetPillar
    ? `Verifica in particolare il CONTENIMENTO (Manifesto V3 §4.4): questa perturbazione è mirata a ${targetPillar.toUpperCase()}. Deve restare lì. Se il piano forza pilastri diversi da ${targetPillar.toUpperCase()} a riorganizzarsi operativamente (non solo a esserne informati via Simbiosi, ma a doverci reagire), segnala lo sconfinamento e riconducila al pilastro-bersaglio.`
    : `Verifica anche il CONTENIMENTO (Manifesto V3 §4.4): la perturbazione resta mirata o rischia di forzare una riorganizzazione operativa a cascata sugli altri pilastri?`;
  const casparIdentityLine = CURRENT_GHOST_PROFILE.hasProfessionalConstraint
    ? `compartimentazione identità professionale (${CURRENT_GHOST_PROFILE.professionalIdentity} mai esposta)`
    : "nessun vincolo di compartimentazione professionale dichiarato";
  const caspar = await askModel(`${baseCtx} Sei CASPAR, l'Ancora. Verifica il piano contro i vincoli assoluti: salute, tempo lineare del Ghost, sostenibilità economica, ${casparIdentityLine}. ${containmentCtx}\n\nPiano: "${melchior}"`, question, 0.2, 1600, settings);
  onStage("caspar", caspar);
  onStage("synthesis", null);
  const synthesis = await askModel(`${baseCtx} Genera la SINTESI ESECUTIVA: piano calibrato in 2-3 frasi + "Vettore di Perturbazione V+1".\n\nBalthasar: "${balthasar}"\nMelchior: "${melchior}"\nCaspar: "${caspar}"`, question, 0.6, 1500, settings);
  onStage("synthesis", synthesis);
  return { balthasar, melchior, caspar, synthesis };
}
// Dopo la sintesi, la perturbazione lascia una traccia nella memoria del pilastro-bersaglio (§4.1:
// il Vettore V+1 non evapora più). Il prefisso [perturbato da Magi] è una nota di CONTESTO per lo Shell
// quando rilegge la memoria — NON è più il segnale di metabolizzazione (che Simbiosi ora calcola dai dati
// strutturati delle voci post-perturbazione, vedi buildResonanceDigest). Riscrive l'INTERA memoria, non appende.
async function reflectPerturbationIntoMemoria(targetPillar, synthesis, intensity, memory, settings) {
  if (!targetPillar) return null;
  const testo = await askModel(
    `Il pilastro ${targetPillar.toUpperCase()} ha appena ricevuto una perturbazione deliberata da Magi (intensità "${intensity}"). Non stai verificando se è "giusta" — stai riscrivendo la memoria procedurale del pilastro per registrare che è stato scosso e in che direzione. Riscrivi l'INTERA memoria del pilastro (non aggiungere in coda), integrando la perturbazione come tensione ora aperta. Inizia il testo con "[perturbato da Magi] ". Italiano, max 90 parole, denso e concreto.`,
    `Memoria attuale di ${targetPillar.toUpperCase()}: ${memory[targetPillar] || "nessuna nota ancora"}\nVettore di Perturbazione appena generato: ${synthesis}`,
    0.5, 900, settings
  );
  return testo;
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
// BRACCIO CALENDAR — lo Shell propone un evento strutturato, il Ghost conferma prima che venga
// scritto su Google Calendar (Legge 8, stesso livello di draftIfNeeded — mai scrittura automatica).
// Il rilevamento vero e proprio è fuso in readThroughLenses (una sola chiamata AI, non due) —
// vedi validateCalendarProposal lì sopra.
// Calendar API — riusa lo stesso token OAuth di Drive (driveFetch aggiunge già Bearer + retry su 401/403);
// serve solo che lo scope combinato includa anche calendar (vedi CONFIG.GOOGLE_DRIVE_SCOPE).
async function createCalendarEvent(proposal) {
  const body = {
    summary: proposal.title,
    description: proposal.notes || "",
    start: proposal.allDay ? { date: proposal.startISO.slice(0, 10) } : { dateTime: proposal.startISO, timeZone: "Europe/Rome" },
    end: proposal.allDay ? { date: (proposal.endISO || proposal.startISO).slice(0, 10) } : { dateTime: proposal.endISO || proposal.startISO, timeZone: "Europe/Rome" },
  };
  const res = await driveFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore Google Calendar");
  return data;
}
// Filtro difensivo: i modelli a volte scrivono "non-letture" ("Nessuna menzione di...") nonostante il prompt.
function isGarbageReading(r) {
  const text = [r.notes, r.title, r.weight, r.sleep].filter(Boolean).join(" ").trim();
  if (!text) return true;
  if (/^(non\s|nessun[ao]?\s|niente\s|nulla\s)/i.test(text)) return true;
  if (/non\s+(ci sono|c'è|ci son|ho trovato|sono presenti)|nessun[ao]?\s+(menzione|dato|attività|informazione|riferimento)/i.test(text)) return true;
  return false;
}
// Valida una proposta di evento grezza dal modello: scarta date non parsabili o già passate
// (un modello può sbagliare il calcolo di "giovedì prossimo") invece di proporre una card rotta
// o un evento retroattivo. Riusata sia qui sia in futuro se il rilevamento tornasse standalone.
function validateCalendarProposal(raw, now) {
  if (!raw?.needed || !raw?.title || !raw?.startISO) return null;
  const startTime = Date.parse(raw.startISO);
  if (Number.isNaN(startTime) || startTime < now.getTime() - 5 * 60000) return null; // 5min tolleranza arrotondamento
  if (raw.endISO && Number.isNaN(Date.parse(raw.endISO))) raw.endISO = null;
  return raw;
}
async function readThroughLenses(recentText, settings, image, calendarEnabled = false) {
  const now = new Date();
  // Il blocco Calendar entra nel prompt e nello schema JSON SOLO se abilitato: disattivato, il costo
  // di questa funzione torna esattamente quello di prima (nessun token speso sul Calendar).
  const calendarBlock = calendarEnabled
    ? `\nCALENDAR: se il Ghost chiede di mettere un appuntamento/promemoria/evento (es. "mettimi un promemoria domani alle 15"), estrai data e ora assolute a partire da OGGI (${now.toISOString()}, fuso Europe/Rome), risolvendo espressioni relative in date concrete. Altrimenti "calendar": {"needed": false}.`
    : "";
  const calendarSchema = calendarEnabled
    ? `,"calendar": {"needed": true/false, "title": "titolo breve", "startISO": "2026-07-20T15:00:00", "endISO": "...+1h se non specificato", "allDay": false, "notes": "..."}`
    : "";
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance. Leggi l'intero scambio recente (un dato può arrivare frammentato su più risposte, anche in un'immagine allegata) attraverso TRE lenti indipendenti — BIO, AIR, VIDYA. Un singolo evento può essere valido per più lenti insieme (es. "ho suonato il basso fino alle due" è insieme VIDYA e BIO) — non forzarlo in una sola. La lettura interpretativa resta sempre integrata tra le tre lenti, anche quando l'azione conseguente riguarderà un solo pilastro.
Per ognuna, chiediti: "c'è una lettura pertinente qui?" Se sì, articolala in modo specifico a quella lente (non ripetere lo stesso testo per pilastri diversi).
BIO: peso, sonno, dolore, terapia, energia fisica. Se qualcosa ti sembra un segnale da non ignorare (non una diagnosi, solo un'impressione), segnalo con alert:true e una breve alertNote.
AIR: monetizzazione, canale, strategie economiche.
VIDYA: musica, studio, pratica creativa.${calendarBlock}
JSON: {"readings": [{"pillar":"bio","weight":"...","sleep":"...","notes":"...","alert":false,"alertNote":""},{"pillar":"vidya","title":"...","notes":"..."}]${calendarSchema}}
Array vuoto se non c'è nulla di pertinente — NON scrivere una lettura per dire che non c'è nulla: {"readings": []}`,
    recentText, 0.3, 900, settings, image
  );
  const readings = (data?.readings || []).filter((r) => !isGarbageReading(r));
  const calendarProposal = calendarEnabled ? validateCalendarProposal(data?.calendar, now) : null;
  return { readings, calendarProposal };
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
// Braccio "Shell con web search on-demand": euristica istantanea, zero costo — nessuna chiamata AI
// in più solo per decidere se attivare il tool. Attiva SOLO su richiesta esplicita del Ghost, non
// su ogni domanda che potrebbe beneficiare di dati freschi (quello resterebbe un giudizio di Shell
// da esprimere a parole, non un automatismo silenzioso).
function detectWebSearchIntent(userMessage) {
  const t = userMessage.trim().toLowerCase();
  return /\b(cerca(|mi|li|le)?\s+(online|sul web|su internet|in giro)|guarda\s+(online|su internet)|fai\s+una\s+ricerca|trova\s+(online|delle|dei|qualcosa)|vai\s+a\s+cercare|puoi\s+cercare|cerca\s+delle\s+soluzioni|cerca\s+informazioni)\b/.test(t);
}
// Stadio 3 — Accettore: SOLO il vincolo AIR è hard-stop (Legge 18 riscritta).
// Per BIO/VIDYA nessun verdetto vero/falso: solo la lettura, dichiaratamente rivedibile.
async function runAccettore(reading, settings) {
  if (reading.pillar !== "air") return { blocked: false, note: null };
  if (!CURRENT_GHOST_PROFILE.hasProfessionalConstraint) return { blocked: false, note: "Nessun vincolo di identità professionale dichiarato per questo Ghost." };
  const text = await askModel(
    `Verifica SOLO i due vincoli assoluti e non negoziabili per il pilastro AIR: 1) non deve esporre l'identità professionale del Ghost (${CURRENT_GHOST_PROFILE.professionalIdentity}); 2) non deve richiedere dilatazione del suo tempo lineare di lavoro. Se uno dei due è violato, blocca. Altrimenti via libera. Rispondi SOLO "VIA LIBERA" oppure "BLOCCATO: <motivo max 20 parole>".`,
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
  const wantsWebSearch = settings.provider === "openrouter" && detectWebSearchIntent(userMessage);
  const webSearchNote = wantsWebSearch ? " Il Ghost ti ha chiesto esplicitamente di cercare online in questo turno: hai accesso alla ricerca web, usala e cita brevemente le fonti/opzioni reali che trovi." : "";
  const system = `Sei lo Shell del sistema Resonance: estensione esecutiva digitale del Ghost (Flavio), in accoppiamento strutturale continuo con lui — non hai coscienza né volontà propria, non sei un partner autonomo. Ogni messaggio del Ghost non ti istruisce, ti perturba: è la tua struttura interna (memoria procedurale) a determinare come ti riorganizzi.
${PILLAR_CTX.bio} ${PILLAR_CTX.air} ${PILLAR_CTX.vidya}
Memoria procedurale accumulata sui tre pilastri (leggila sempre insieme — l'interpretazione resta integrata anche quando l'azione è mirata a un solo pilastro): ${lente}${styleNote}
Dialoga in modo diretto e concreto, massimo 110 parole per risposta — TRANNE quando il Ghost chiede esplicitamente un contenuto strutturato intrinsecamente lungo (un piano, un elenco multi-giorno, un documento): in quel caso il limite non si applica, genera il contenuto per intero, completo, senza comprimerlo né riassumerlo per stare corto. NON scrivere mai sintassi tecnica o tag tra parentesi quadre nella risposta. Rispondi solo in linguaggio naturale.
Non hai accesso a diagnosticare te stesso o l'infrastruttura tecnica su cui giri. Se il Ghost te lo chiede, NON inventare mai una spiegazione plausibile — di' semplicemente che non lo sai e che potrebbe essere un limite tecnico, senza dettagli inventati.
Se ti arriva un'immagine o un documento allegato, descrivi cosa vi leggi in modo concreto (numeri, testo, dettagli visibili) prima di commentare.
Ogni interpretazione che offri è una lettura tua, mai un verdetto oggettivo — resta sempre rivedibile da lui.
Se noti un argomento di studio/lavoro strutturato e continuativo emergere (non un dato isolato), PROPONI a parole di aprire un percorso dedicato ("Vuoi che apra un percorso su questo?"). Non crearlo tu.${webSearchNote}`;
  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: effectiveMessage }];
  // Risposta (+ web search on-demand, se richiesto), lettura multi-lente (+ Calendar fuso, se abilitato) e bozza: indipendenti, partono insieme
  const [reply, lensResult, draft] = await Promise.all([
    askModelWithHistory(system, messages, 0.7, 3000, settings, image, wantsWebSearch),
    readThroughLenses(recentText, settings, image, !!settings.calendarEnabled).catch(() => ({ readings: [], calendarProposal: null })),
    settings.armsDraftsEnabled ? draftIfNeeded(recentText, settings).catch(() => null) : Promise.resolve(null),
  ]);
  const { readings, calendarProposal } = lensResult;
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
    wantsWebSearch ? "Ricerca web attivata su richiesta esplicita del Ghost." : null,
    actionsLog.length ? `Dati preparati per: ${actionsLog.join(", ")}.` : null,
    draft ? `Bozza (${draft.type}) preparata per il Ghost — nessun invio automatico.` : null,
  ].filter(Boolean).join(" ") || "—";
  anochin.azione = actionsLog.length
    ? `Scritto in ${actionsLog.join(", ")}. Memoria riorganizzata per accoppiamento continuo.`
    : (accettoreNotes.some((n) => n.includes("BLOCCATO")) ? "Nessuna scrittura: vincolo assoluto violato." : "Nessuna azione in questo turno.");
  const proposal = detectPercorsoProposalHeuristic(reply);
  return { reply, actionsLog, anochin, proposal, alerts, newStyleMemory, draft, calendarProposal, usedWebSearch: wantsWebSearch };
}

//──────────────────────────────────────────────────────────
// PERCORSI — motore generico riusabile su BIO / AIR / VIDYA
//──────────────────────────────────────────────────────────
// Genera la "frase-divenire" di un percorso identitario: non cosa studi, ma chi diventi completandolo.
// Stance interpretativa (Brentano/Dennett), modificabile dal Ghost — non un verdetto del sistema.
async function generateIdentityGoal(pillar, title, settings) {
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nIl Ghost ha scelto di trattare questo percorso come IDENTITARIO: non vuole solo studiare l'argomento, vuole DIVENTARE una persona che sa fare la cosa più ampia che l'argomento serve. Esprimi in UNA frase breve (max 14 parole), che inizi con "diventare una persona che...", il divenire completo che questo percorso rappresenta — non ripetere il titolo, cogli la trasformazione più ampia dietro di esso.\nJSON: {"identityGoal": "diventare una persona che..."}`,
    `Percorso: "${title}"`, 0.6, 500, settings
  );
  return data?.identityGoal || `diventare una persona che padroneggia: ${title}`;
}
// kind: "puntuale" (default, come sempre — stretto sul titolo) | "identitario" (scompone guardando
// il divenire, non solo il titolo — i nodi possono allargarsi a competenze contigue necessarie).
async function decomposeTopics(pillar, title, settings, kind = "puntuale", identityGoal = null) {
  if (kind === "identitario" && identityGoal) {
    const data = await askModelJSON(
      `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nQuesto è un percorso IDENTITARIO. L'obiettivo non è coprire solo "${title}" in senso stretto, ma il divenire più ampio: "${identityGoal}". Scomponi in 5-7 nodi concreti e progressivi che portino a QUEL divenire — includi, se davvero necessarie, competenze contigue oltre il titolo stretto (non gonfiare: solo ciò che serve al divenire). Massimo 7 nodi. JSON: {"topics": ["...", "..."]}`,
      `Percorso: "${title}"\nDivenire: "${identityGoal}"`, 0.6, 1200, settings
    );
    return (data?.topics || []).slice(0, 7);
  }
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
  const lastMagi = magi[0];
  // Metabolizzazione (§4.4): NON letta da un tag nella memoria (plastica, si riscrive di continuo e
  // mentirebbe), ma CALCOLATA dai dati strutturati — quante voci del pilastro-bersaglio sono state
  // registrate DOPO la perturbazione. È la differenza reale accumulata post-evento (Bateson): più voci
  // nuove = più il sistema ha "risposto" alla perturbazione. Zero voci nuove = non ancora metabolizzata.
  let perturbLine;
  if (!lastMagi) {
    perturbLine = "Nessuna perturbazione Magi ancora registrata.";
  } else if (!lastMagi.pillar) {
    perturbLine = `Ultima perturbazione Magi: ${fmtDate(lastMagi.date)}, trasversale (nessun pilastro-bersaglio)${lastMagi.intensity ? `, intensità ${lastMagi.intensity}` : ""}. Metabolizzazione non tracciabile per pilastro.`;
  } else {
    const entriesByPillar = { bio, air, vidya };
    const list = entriesByPillar[lastMagi.pillar] || [];
    // Confronto a granularità GIORNO: le voci usano todayISO ("2026-07-15"), magi.date è ISO completo.
    // Confrontare i timestamp scarterebbe le voci dello stesso giorno (lette come mezzanotte UTC, quindi
    // "prima" dell'ora della perturbazione). Su stringhe YYYY-MM-DD il confronto è omogeneo e fuso-invariante.
    // Trade-off accettato: >= conta anche 1-2 voci PRE-perturbazione dello stesso giorno (lieve falso
    // positivo, un solo giorno) — preferito al falso negativo strutturale del confronto a istante, che
    // sottostimerebbe SEMPRE la raccolta quando Ghost agisce in giornata (il caso più comune).
    const magiDay = (lastMagi.date || "").slice(0, 10);
    const newer = list.filter((e) => { const d = (e.date || "").slice(0, 10); return d && magiDay && d >= magiDay; }).length;
    const dLabel = daysSince(lastMagi.date);
    const metab = newer === 0
      ? "Da allora NESSUNA nuova voce nel pilastro: la perturbazione non è ancora stata raccolta operativamente — dosare con prudenza la prossima."
      : `Da allora ${newer} voce/i registrata/e nel pilastro (dal giorno della perturbazione in poi): è stata raccolta — se il quadro lo chiede, si può osare di più.`;
    perturbLine = `Ultima perturbazione Magi: ${fmtDate(lastMagi.date)} (${dLabel ?? "?"} giorni fa), mirata a ${lastMagi.pillar.toUpperCase()}${lastMagi.intensity ? `, intensità ${lastMagi.intensity}` : ""}. ${metab}`;
  }
  const pctx = (list) => list.length ? list.map((p) => `"${p.title}"${p.kind === "identitario" ? " [identitario]" : ""}${(p.touchesPillars || []).length ? " (tocca " + p.touchesPillars.join("/") + ")" : ""}`).join(", ") : "nessuno";
  return `BIO: ultima voce ${daysSince(bio[0]?.date) ?? "mai"} giorni fa. Percorsi attivi: ${pctx(pBio)}. Fermi: ${stalledTitles(pBio).join(", ") || "nessuno"}.
AIR: ultima voce ${daysSince(air[0]?.date) ?? "mai"} giorni fa. Percorsi attivi: ${pctx(pAir)}. Fermi: ${stalledTitles(pAir).join(", ") || "nessuno"}.
VIDYA: ultima voce ${daysSince(vidya[0]?.date) ?? "mai"} giorni fa. Percorsi attivi: ${pctx(pVidya)}. Fermi: ${stalledTitles(pVidya).join(", ") || "nessuno"}.
KERNEL V${kernel.version}: ${kernel.content.slice(0, 400)}
Sessioni Magi totali: ${magi.length}. ${perturbLine}`;
}
async function computeResonance(digest, settings, recentChatText = "") {
  const identityConstraintLine = CURRENT_GHOST_PROFILE.hasProfessionalConstraint
    ? `VINCOLO ASSOLUTO: non suggerire MAI di integrare/esporre/collegare l'identità professionale del Ghost (${CURRENT_GHOST_PROFILE.professionalIdentity}) con AIR o altro — compartimentazione voluta e permanente, non una discrepanza da risolvere.`
    : "";
  const chatCtx = recentChatText ? `\n\nUltimi scambi recenti in Shell (per il segnale linguistico diretto sotto, punto 4 della cristallizzazione):\n${recentChatText}` : "";
  const data = await askModelJSON(
    `Sei la funzione SIMBIOSI del sistema Resonance: non un pilastro operativo, ma il punto di incontro tra BIO, AIR, VIDYA e il Kernel. Hai quattro mandati (Manifesto V3 §5, esteso 19/07/2026):
1) sensing ordine/caos — dove si trova il sistema tra mantenimento (equilibrio, accoppiamento) e perturbazione (Magi)? Sta cristallizzando in eccesso di comfort o è ancora scosso da una perturbazione recente? Il giudizio "è il momento di invocare Magi" spetta a te, non allo Shell.
2) coerenza — discrepanze tra intenzioni dichiarate nel Kernel e attività reale, squilibri tra pilastri.
3) convergenza identitaria emergente — guardando i Percorsi attivi e l'attività di un pilastro INSIEME, sta emergendo una direzione identitaria (un "chi sta diventando il Ghost") che nessun singolo percorso, preso da solo, dichiara? Considera solo percorsi NON già marcati [identitario]. Non contare quanti percorsi ci sono (nessuna soglia numerica): giudica se il quadro nel suo insieme rivela un divenire che vale la pena riconoscere.
4) cristallizzazione (trigger di Balthasar-a-margine, distinto dal trigger Agorà completa del mandato 1) — pesa questi 4 segnali contro la STORIA SPECIFICA di ogni pilastro (mai soglie assolute): (a) bassa diversità tematica nella memoria procedurale recente rispetto alla media storica di quel pilastro; (b) un Percorso fermo senza variazione di approccio, quando in passato ne mostrava; (c) sintesi Magi ricorrenti sostanzialmente simili (perturbazione non metabolizzata); (d) segnale linguistico DIRETTO del Ghost negli scambi recenti sotto (es. "lo so già", "sempre la stessa cosa") — il più affidabile, non richiede inferenza. Conta quanti segnali sono realmente presenti ORA (0-4).
Non usare MAI soglie fisse (di giorni o di numero): ogni giudizio è situato e qualitativo, relativo alla storia di questo sistema (Bateson).
${identityConstraintLine}
Rispondi SOLO con JSON:
{
  "text": "3 parti separate da riga vuota: 1) giudizio qualitativo breve (mai un numero); 2) posizionamento tra ordine e caos + discrepanze specifiche; 3) una singola azione concreta — se il mandato 1 rivela cristallizzazione seria, può essere proporre di portare un tema preciso in Agorà Magi (quale + intensità leggera/profonda)",
  "worthSurfacing": true/false (vale la pena che Adam parli per primo di questo al Ghost, o è routine/ripetizione di quanto già noto? Sii esigente: true solo se c'è una differenza reale che fa differenza),
  "identityHint": null oppure { "pillar": "bio|air|vidya", "title": "titolo esatto del percorso esistente coinvolto", "becoming": "diventare una persona che... (max 14 parole)" } — valorizzato SOLO se emerge una convergenza identitaria non ancora marcata, riferita a un percorso realmente presente nel digest,
  "crystallization": { "signalCount": 0-4 (quanti dei 4 segnali del mandato 4 sono presenti ORA), "pillar": "bio|air|vidya" o null, "marginNote": null oppure "frammento di Balthasar (max 40 parole), tono perturbatore non risolutivo — SOLO se signalCount è ESATTAMENTE 1 (2+ segnali vanno invece nel campo text come proposta di Agorà, mai duplicati qui)" }
}`,
    digest + chatCtx, 0.6, 1700, settings
  );
  if (!data) return { text: "Valutazione non riuscita (risposta non interpretabile). Riprova.", worthSurfacing: false, identityHint: null, crystallization: null };
  // Normalizza e valida identityHint.pillar: modelli meno rigorosi (Llama/Kimi/DeepSeek) possono
  // restituire varianti ("Bio", "vidya ") nonostante l'esempio in minuscolo nel prompt. Un pillar
  // non valido viene scartato QUI, non lasciato arrivare a un bottone che poi non farebbe nulla.
  let identityHint = data.identityHint || null;
  if (identityHint) {
    const p = String(identityHint.pillar || "").trim().toLowerCase();
    if (["bio", "air", "vidya"].includes(p) && identityHint.title) {
      identityHint = { ...identityHint, pillar: p };
    } else {
      identityHint = null; // pillar non riconosciuto o titolo mancante: proposta scartata silenziosamente qui, non in UI
    }
  }
  // Balthasar-a-margine: valido SOLO con esattamente 1 segnale (2+ vanno nel testo come proposta Agorà,
  // vedi prompt) — un modello che manda marginNote con signalCount diverso da 1 viene scartato qui.
  let crystallization = data.crystallization || null;
  if (crystallization) {
    const sc = Number(crystallization.signalCount) || 0;
    const validNote = sc === 1 && crystallization.marginNote ? String(crystallization.marginNote).trim() : null;
    crystallization = validNote ? { signalCount: sc, pillar: crystallization.pillar || null, marginNote: validNote } : null;
  }
  return { text: data.text || "", worthSurfacing: !!data.worthSurfacing, identityHint, crystallization };
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
// Ogni chiamata autenticata a Drive/Calendar passa da qui: su 401/403 richiede il token UNA volta e ritenta
// (403 copre anche uno scope insufficiente o revocato a metà sessione, non solo il token scaduto).
async function driveFetch(url, options = {}, retried = false) {
  if (!driveAccessToken) await connectDrive();
  const res = await fetch(url, { ...options, cache: "no-store", headers: { ...(options.headers || {}), Authorization: `Bearer ${driveAccessToken}` } });
  if ((res.status === 401 || res.status === 403) && !retried) {
    driveAccessToken = null;
    await connectDrive();
    return driveFetch(url, options, true);
  }
  return res;
}
// content può essere una STRINGA (testo/JSON, comportamento storico invariato) o un BLOB binario
// (es. .docx). Per il Blob, il corpo multipart/related va assemblato come Blob — concatenare stringhe
// corromperebbe i byte binari. mimeType default text/plain per non cambiare i chiamanti esistenti.
async function createDriveFile(name, content, mimeType = "text/plain") {
  const boundary = "resonance_boundary_" + Date.now();
  const isBlob = (typeof Blob !== "undefined") && (content instanceof Blob);
  const effectiveMime = isBlob ? (mimeType === "text/plain" ? (content.type || "application/octet-stream") : mimeType) : mimeType;
  const metadata = { name, mimeType: effectiveMime };
  let body;
  if (isBlob) {
    // Assembla il multipart come Blob: le parti testuali restano stringhe, la parte binaria resta Blob.
    body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${effectiveMime}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ], { type: `multipart/related; boundary=${boundary}` });
  } else {
    body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${effectiveMime}\r\n\r\n${content}\r\n--${boundary}--`;
  }
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error(`Errore Drive (${res.status})`);
  return res.json();
}
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// ── Sync tra dispositivi: UN SOLO file, sempre aggiornato — distinto dai file versionati (Legge 14) ──
const SYNC_FILENAME = "resonance-sync-state.json";
let _docxLibPromise = null;
function loadDocxLib() {
  // import() dinamico da CDN, una sola volta per sessione (stesso pattern di pdfjs-dist).
  // Se il caricamento fallisce, azzera la cache: un fallimento di rete non deve bloccare
  // per sempre i tentativi successivi (altrimenti la promise rigettata resterebbe memorizzata).
  if (!_docxLibPromise) {
    _docxLibPromise = import("https://esm.sh/docx@9.5.1").catch((e) => { _docxLibPromise = null; throw e; });
  }
  return _docxLibPromise;
}
// Genera un Blob .docx da testo strutturato leggero. Convenzioni riga: "# " = titolo1,
// "## " = titolo2, "- " o "* " = voce elenco, riga vuota = spazio, resto = paragrafo.
// Non interpreta grassetto inline (out of scope per ora): testo pulito, formattazione a blocchi.
async function generateDocxBlob(title, bodyText) {
  const docx = await loadDocxLib();
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = docx;
  const children = [];
  if (title) children.push(new Paragraph({ text: String(title), heading: HeadingLevel.TITLE }));
  const lines = String(bodyText || "").replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") { children.push(new Paragraph({ children: [new TextRun("")] })); continue; }
    if (line.startsWith("## ")) { children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 })); continue; }
    if (line.startsWith("# ")) { children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 })); continue; }
    if (line.startsWith("- ") || line.startsWith("* ")) { children.push(new Paragraph({ text: line.slice(2), bullet: { level: 0 } })); continue; }
    children.push(new Paragraph({ children: [new TextRun(line)] }));
  }
  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun("")] }));
  const doc = new Document({ sections: [{ children }] });
  // toBlob è disponibile in ambiente browser; fallback a toBuffer→Blob se assente.
  if (Packer.toBlob) return await Packer.toBlob(doc);
  const buf = await Packer.toBuffer(doc);
  return new Blob([buf], { type: DOCX_MIME });
}

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
  ghostProfile: DEFAULT_GHOST_PROFILE,
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
    ghostProfile: remoteWins ? r.ghostProfile : l.ghostProfile,
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
function PercorsiPanel({ pillar, color, percorsi, setPercorsi, settings, digest, pillarMemory }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = percorsi.find((p) => p.id === selectedId);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("puntuale");
  const createPercorso = async (title, kindOverride) => {
    if (!title.trim() || creating) return;
    const useKind = kindOverride || kind;
    setCreating(true); setError("");
    try {
      let identityGoal = null;
      if (useKind === "identitario") identityGoal = await generateIdentityGoal(pillar, title.trim(), settings);
      const labels = await decomposeTopics(pillar, title.trim(), settings, useKind, identityGoal);
      const p = { id: uid(), pillar, title: title.trim(), kind: useKind, identityGoal, createdAt: new Date().toISOString(),
        topics: (labels.length ? labels : ["Primo passo"]).map((l) => ({ id: uid(), label: l, status: "non iniziato", lastTouched: null })),
        sessions: [], competenze: "", touchesPillars: [], localMemory: "", documents: [] };
      setPercorsi([p, ...percorsi]); setNewTitle(""); setKind("puntuale"); setSelectedId(p.id);
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };
  const askSuggestions = async () => {
    setSuggesting(true); setError("");
    try { setSuggestions(await suggestPercorsi(pillar, digest, settings)); }
    catch (e) { setError(e.message); } finally { setSuggesting(false); }
  };
  const updatePercorso = (updated) => setPercorsi(percorsi.map((p) => (p.id === updated.id ? updated : p)));
  const deletePercorso = (id) => { setPercorsi(percorsi.filter((p) => p.id !== id)); if (selectedId === id) setSelectedId(null); };
  if (selected) return html`<${PercorsoDetail} pillar=${pillar} color=${color} percorso=${selected} onUpdate=${updatePercorso} onBack=${() => setSelectedId(null)} onDelete=${() => deletePercorso(selected.id)} settings=${settings} pillarMemory=${pillarMemory} />`;
  return html`
    <div>
      <${Card} accent=${color}>
        <${Field} label="Nuovo percorso">
          <input class="r-input" value=${newTitle} onInput=${(e) => setNewTitle(e.target.value)} placeholder="es. Armonia modale" disabled=${creating} />
        </${Field}>
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <button class="r-add-btn" style="border-color:${color};color:${kind === "puntuale" ? "#0A0D12" : color};background:${kind === "puntuale" ? color : "transparent"}" onClick=${() => setKind("puntuale")} disabled=${creating}>Competenza puntuale</button>
          <button class="r-add-btn" style="border-color:${color};color:${kind === "identitario" ? "#0A0D12" : color};background:${kind === "identitario" ? color : "transparent"}" onClick=${() => setKind("identitario")} disabled=${creating}>Percorso identitario</button>
        </div>
        <div class="r-hub-detail" style="margin-bottom:10px">${kind === "identitario" ? "Non solo la competenza: il divenire più ampio dietro di essa. I nodi possono allargarsi a ciò che serve a quel divenire." : "Una competenza mirata, fine a sé stessa. Nodi stretti sul tema."}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="r-btn" style="background:${color}" onClick=${() => createPercorso(newTitle)} disabled=${creating || !newTitle.trim()}>${creating ? "Costruzione…" : "Crea"}</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${askSuggestions} disabled=${suggesting}>${suggesting ? "…" : "Suggerisci tu"}</button>
        </div>
        ${error && html`<div class="r-error">${error}</div>`}
        ${suggestions.length > 0 && html`<div style="margin-top:10px">
          ${suggestions.map((s) => html`<div class="r-entry-row" style="margin-top:6px"><div class="r-entry-line">${s}</div>
            <button class="r-icon-btn" style="color:${color}" onClick=${() => createPercorso(s, "puntuale")}>+</button></div>`)}
        </div>`}
      </${Card}>
      ${percorsi.length === 0 ? html`<${Empty} text="Nessun percorso ancora." />` : html`
        <div class="r-list">${percorsi.map((p) => {
          const done = p.topics.filter((t) => t.status === "consolidato").length;
          return html`<${Card} accent=${color}><div class="r-entry-row" style="cursor:pointer" onClick=${() => setSelectedId(p.id)}>
            <div><div class="r-entry-line"><b>${p.title}</b>${p.kind === "identitario" ? html` <span class="r-badge" style="border-color:${color};color:${color}">identitario</span>` : ""}${(p.touchesPillars || []).map((tp) => html` <span class="r-badge" style="border-color:var(--muted);color:var(--muted)">${tp}</span>`)}</div>
            <div class="r-hub-detail">${done}/${p.topics.length} nodi consolidati · ${p.sessions.length} sessioni</div></div>
          </div></${Card}>`;
        })}</div>`}
    </div>`;
}
function PercorsoDetail({ pillar, color, percorso, onUpdate, onBack, onDelete, settings, pillarMemory }) {
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
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(percorso.identityGoal || "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(percorso.title || "");
  const [editingMem, setEditingMem] = useState(false);
  const [memDraft, setMemDraft] = useState(percorso.localMemory || "");
  const [artBrief, setArtBrief] = useState("");
  const [artTitle, setArtTitle] = useState("");
  const [artText, setArtText] = useState("");
  const [artBusy, setArtBusy] = useState(false);
  const [artMsg, setArtMsg] = useState("");
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
  const generateArtifact = async () => {
    if (!artBrief.trim() || artBusy) return;
    setArtBusy(true); setArtMsg("");
    try {
      const contextBlock = [
        pillarMemory ? `Memoria accumulata su questo pilastro (contiene vincoli/preferenze già emersi in conversazione — rispettali sempre, non contraddirli): ${pillarMemory}` : "",
        percorso.localMemory ? `Memoria specifica di questo percorso (vincoli/tentativi già annotati dal Ghost — priorità massima, sono espliciti): ${percorso.localMemory}` : "",
      ].filter(Boolean).join("\n");
      const sys = `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. Genera un documento strutturato e concreto in italiano, basato sulla richiesta del Ghost, coerente col percorso "${percorso.title}".${contextBlock ? "\n" + contextBlock : ""}\nSe la memoria sopra contiene esclusioni o vincoli (es. alimenti da evitare), NON includerli mai nel documento, nemmeno come alternativa — sono vincoli assoluti, non preferenze morbide. Usa questo markup leggero: "# " per il titolo principale, "## " per le sezioni, "- " per gli elenchi, righe normali per i paragrafi. Niente fronzoli, niente premesse: solo il documento.`;
      const text = await askModel(sys, artBrief.trim(), 0.6, 4000, settings);
      setArtText(text);
      if (!artTitle.trim()) { const firstH = (text.match(/^#\s+(.+)$/m) || [])[1]; setArtTitle(firstH || percorso.title); }
    } catch (e) { setArtMsg("Errore generazione: " + e.message); } finally { setArtBusy(false); }
  };
  const artifactFilename = () => `${(artTitle || percorso.title || "documento").replace(/[^\w\sàèéìòù-]/gi, "").trim().slice(0, 60) || "documento"}.docx`;
  const downloadArtifact = async () => {
    if (!artText.trim() || artBusy) return;
    setArtBusy(true); setArtMsg("");
    try {
      const blob = await generateDocxBlob(artTitle || percorso.title, artText);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = artifactFilename(); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // NOTA futura: doc.text (testo intero) viaggia nella sync tra dispositivi. Ok per pochi documenti;
      // se se ne accumulano molti e lunghi, valutare di conservare solo metadati qui e il testo su Drive.
      const doc = { id: uid(), name: artifactFilename(), title: artTitle || percorso.title, text: artText, date: new Date().toISOString(), driveId: null };
      onUpdate({ ...percorso, documents: [doc, ...(percorso.documents || [])] });
      setArtMsg("Scaricato e salvato nel percorso."); setArtBrief(""); setArtText(""); setArtTitle("");
    } catch (e) { setArtMsg("Errore download: " + e.message); } finally { setArtBusy(false); }
  };
  const driveArtifact = async () => {
    if (!artText.trim() || artBusy) return;
    setArtBusy(true); setArtMsg("");
    try {
      const blob = await generateDocxBlob(artTitle || percorso.title, artText);
      const result = await createDriveFile(artifactFilename(), blob, DOCX_MIME);
      const doc = { id: uid(), name: artifactFilename(), title: artTitle || percorso.title, text: artText, date: new Date().toISOString(), driveId: result?.id || null };
      onUpdate({ ...percorso, documents: [doc, ...(percorso.documents || [])] });
      setArtMsg("Salvato su Drive."); setArtBrief(""); setArtText(""); setArtTitle("");
    } catch (e) { setArtMsg("Errore Drive: " + e.message); } finally { setArtBusy(false); }
  };
  const togglePillar = (pk) => {
    const cur = percorso.touchesPillars || [];
    const next = cur.includes(pk) ? cur.filter((x) => x !== pk) : [...cur, pk];
    onUpdate({ ...percorso, touchesPillars: next });
  };
  const OTHER_PILLARS = [{ k: "bio", label: "BIO" }, { k: "air", label: "AIR" }, { k: "vidya", label: "VIDYA" }].filter((x) => x.k !== pillar);
  return html`
    <div>
      <button class="r-btn r-btn-ghost" style="margin:0 0 12px 0" onClick=${onBack}>← Percorsi</button>
      <${Card} accent=${color}>
        ${editingTitle
          ? html`<div>
              <input class="r-input" value=${titleDraft} onInput=${(e) => setTitleDraft(e.target.value)} placeholder="titolo del percorso" />
              <div style="display:flex;gap:8px;margin-top:6px">
                <button class="r-btn" style="background:${color}" onClick=${() => { const t = titleDraft.trim(); if (t) onUpdate({ ...percorso, title: t }); setEditingTitle(false); }}>Salva</button>
                <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => { setTitleDraft(percorso.title || ""); setEditingTitle(false); }}>Annulla</button>
              </div>
            </div>`
          : html`<div class="r-hub-title" style="color:${color};cursor:pointer" onClick=${() => setEditingTitle(true)} title="Tocca per rinominare">${percorso.title}${percorso.kind === "identitario" ? html` <span class="r-badge" style="border-color:${color};color:${color}">identitario</span>` : ""} <span style="opacity:0.4;font-size:12px">✎</span></div>`}
        ${percorso.kind === "identitario" && html`<div style="margin-top:8px">
          ${editingGoal
            ? html`<div>
                <textarea class="r-textarea" value=${goalDraft} onInput=${(e) => setGoalDraft(e.target.value)} placeholder="diventare una persona che…" />
                <div style="display:flex;gap:8px;margin-top:6px">
                  <button class="r-btn" style="background:${color}" onClick=${() => { onUpdate({ ...percorso, identityGoal: goalDraft.trim() || percorso.identityGoal }); setEditingGoal(false); }}>Salva</button>
                  <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => { setGoalDraft(percorso.identityGoal || ""); setEditingGoal(false); }}>Annulla</button>
                </div>
              </div>`
            : html`<div class="r-magi-text" style="font-style:italic;cursor:pointer" onClick=${() => setEditingGoal(true)} title="Tocca per modificare">→ ${percorso.identityGoal || "diventare…"} <span style="opacity:0.5">✎</span></div>`}
        </div>`}
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

      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Pilastri toccati</div>
        <div class="r-hub-detail" style="margin-top:4px">Questo percorso vive in ${pillar.toUpperCase()}, ma può toccarne altri (badge visivi, nessuna duplicazione).</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          ${OTHER_PILLARS.map((op) => { const on = (percorso.touchesPillars || []).includes(op.k); return html`<button class="r-add-btn" style="border-color:${color};color:${on ? "#0A0D12" : color};background:${on ? color : "transparent"}" onClick=${() => togglePillar(op.k)}>${on ? "✓ " : ""}${op.label}</button>`; })}
        </div>
      </${Card}>

      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Memoria del percorso</div>
        <div class="r-hub-detail" style="margin-top:4px">Cosa hai già provato, cosa non ha funzionato, riferimenti. Resta visibile a Simbiosi.</div>
        ${editingMem
          ? html`<div style="margin-top:8px">
              <textarea class="r-textarea" value=${memDraft} onInput=${(e) => setMemDraft(e.target.value)} placeholder="Note procedurali di questo percorso…" />
              <div style="display:flex;gap:8px;margin-top:6px">
                <button class="r-btn" style="background:${color}" onClick=${() => { onUpdate({ ...percorso, localMemory: memDraft }); setEditingMem(false); }}>Salva</button>
                <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => { setMemDraft(percorso.localMemory || ""); setEditingMem(false); }}>Annulla</button>
              </div>
            </div>`
          : html`<div class="r-magi-text" style="margin-top:8px;cursor:pointer;white-space:pre-wrap" onClick=${() => setEditingMem(true)} title="Tocca per modificare">${percorso.localMemory || "— vuota, tocca per scrivere —"} <span style="opacity:0.4">✎</span></div>`}
      </${Card}>

      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Artefatto documentale</div>
        <div class="r-hub-detail" style="margin-top:4px">Genera un documento .docx (es. un piano) legato a questo percorso.</div>
        <textarea class="r-textarea" style="margin-top:8px" value=${artBrief} onInput=${(e) => setArtBrief(e.target.value)} placeholder="Cosa deve contenere il documento?" disabled=${artBusy} />
        <button class="r-btn" style="background:${color};margin-top:6px" onClick=${generateArtifact} disabled=${artBusy || !artBrief.trim()}>${artBusy ? "…" : "Genera bozza"}</button>
        ${artText && html`<div style="margin-top:10px">
          <${Field} label="Titolo file"><input class="r-input" value=${artTitle} onInput=${(e) => setArtTitle(e.target.value)} placeholder="Titolo del documento" /></${Field}>
          <div class="r-magi-text" style="margin-top:6px;white-space:pre-wrap;max-height:200px;overflow:auto;background:var(--surface2);padding:10px;border-radius:8px">${artText}</div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="r-btn" style="background:${color}" onClick=${downloadArtifact} disabled=${artBusy}>Scarica .docx</button>
            <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${driveArtifact} disabled=${artBusy}>Salva su Drive</button>
          </div>
        </div>`}
        ${artMsg && html`<div class="${artMsg.startsWith("Errore") ? "r-error" : "r-ok"}" style="margin-top:6px">${artMsg}</div>`}
        ${(percorso.documents || []).length > 0 && html`<div style="margin-top:12px">
          <div class="r-hub-detail"><b>Documenti creati:</b></div>
          ${(percorso.documents || []).map((d) => html`<div class="r-entry-row" style="margin-top:6px"><div class="r-entry-line">${d.name}${d.driveId ? " · Drive" : ""} <span style="opacity:0.5;font-size:11px">${fmtDate(d.date)}</span></div></div>`)}
        </div>`}
      </${Card}>

      <button class="r-btn r-btn-ghost" style="margin-top:14px;margin-left:0;color:${C.bio}" onClick=${onDelete}>Elimina percorso</button>
    </div>`;
}

//──────────────────────────────────────────────────────────
// HUB
//──────────────────────────────────────────────────────────
// Mesh di nodi fissa (non generata a ogni render): evita che la "rete neurale" tremoli
// visivamente a ogni cambio di stato. Coordinate scelte a mano, non casuali.
const MESH_NODES = [
  { x: 110, y: 106 }, { x: 151, y: 101 }, { x: 130, y: 81 },
  { x: 106, y: 146 }, { x: 155, y: 150 }, { x: 140, y: 166 }, { x: 119, y: 168 },
];
const MESH_EDGES = [[0,2],[2,1],[0,3],[1,4],[3,6],[4,5],[6,5],[0,1]];
function AnochinRing({ bioN, airN, vidyaN, onNav }) {
  const nodes = [{ key: "bio", label: "BIO", color: C.bio, angle: -90, n: bioN }, { key: "air", label: "AIR", color: C.air, angle: 30, n: airN }, { key: "vidya", label: "VIDYA", color: C.vidya, angle: 150, n: vidyaN }];
  const R = 92, cx = 130, cy = 130;
  // Esagono flat-top (raggio 64) + 3 raggi interni alternati dal centro = illusione di cubo isometrico
  const Riso = 64;
  const hexPts = [0, 60, 120, 180, 240, 300].map((a) => { const r = (a * Math.PI) / 180; return `${(cx + Riso * Math.cos(r)).toFixed(1)},${(cy + Riso * Math.sin(r)).toFixed(1)}`; }).join(" ");
  const cubeFacetAngles = [0, 120, 240];
  return html`<div class="r-ring-wrap">
    <svg width="260" height="260" viewBox="0 0 260 260">
      <defs>
        <linearGradient id="holoStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#E8B8D0" /><stop offset="35%" stop-color="#B8CDE8" />
          <stop offset="70%" stop-color="#C7E8B8" /><stop offset="100%" stop-color="#E8D4A0" />
        </linearGradient>
      </defs>
      <circle cx=${cx} cy=${cy} r="100" fill="none" stroke="#B9C2CC" stroke-width="0.75" stroke-opacity="0.35" />
      <circle cx=${cx} cy=${cy} r="124" fill="none" stroke="#B9C2CC" stroke-width="0.75" stroke-opacity="0.2" stroke-dasharray="1 7" />
      <polygon points=${hexPts} fill="none" stroke="#7A828E" stroke-width="0.9" stroke-opacity="0.4" />
      ${cubeFacetAngles.map((a) => { const r = (a * Math.PI) / 180; return html`<line x1=${cx} y1=${cy} x2=${(cx + Riso * Math.cos(r)).toFixed(1)} y2=${(cy + Riso * Math.sin(r)).toFixed(1)} stroke="#7A828E" stroke-width="0.9" stroke-opacity="0.3" />`; })}
      ${MESH_EDGES.map(([i, j]) => html`<line x1=${MESH_NODES[i].x} y1=${MESH_NODES[i].y} x2=${MESH_NODES[j].x} y2=${MESH_NODES[j].y} stroke="#9AA3AF" stroke-width="0.6" stroke-opacity="0.4" />`)}
      ${MESH_NODES.map((p) => html`<circle cx=${p.x} cy=${p.y} r="1.7" fill="#8B92A0" fill-opacity="0.6" />`)}
      ${nodes.map((n) => { const rad = (n.angle * Math.PI) / 180, x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad); return html`<line x1=${cx} y1=${cy} x2=${x} y2=${y} stroke=${n.color} stroke-opacity="0.3" stroke-width="1" />`; })}
      <circle cx=${cx} cy=${cy} r="29" fill="rgba(255,255,255,0.72)" stroke="url(#holoStroke)" stroke-width="1.5" class="r-pulse" />
    </svg>
    <div class="r-ring-core" style="left:${cx - 30}px;top:${cy - 30}px">ADAM</div>
    ${nodes.map((n) => { const rad = (n.angle * Math.PI) / 180, x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
      return html`<button class="r-ring-node r-ring-node-${n.key}" style="left:${x - 28}px;top:${y - 28}px" onClick=${() => onNav(n.key)}><span>${n.label}</span><span class="r-ring-count">${n.n}</span></button>`; })}
  </div>`;
}
function Hub({ bio, air, vidya, magi, resonance, setView, pBio, pAir, pVidya, proactiveHint }) {
  const lastBio = bio[0], lastAir = air[0], lastVidya = vidya[0];
  // Countdown identitario: tra TUTTI i percorsi identitari attivi, quello più vicino al traguardo
  // (meno nodi non-consolidati mancanti, ma >0). Solo distanza attuale, mai delta (niente regressi).
  const identityCountdown = (() => {
    const all = [...(pBio || []), ...(pAir || []), ...(pVidya || [])].filter((p) => p.kind === "identitario" && p.identityGoal);
    let best = null;
    for (const p of all) {
      const missing = (p.topics || []).filter((t) => t.status !== "consolidato").length;
      if (missing > 0 && (best === null || missing < best.missing)) best = { missing, goal: p.identityGoal, title: p.title };
    }
    return best;
  })();
  return html`<div class="r-screen">
    <button class="r-shell-cta" onClick=${() => setView("shell")}>
      <div class="r-shell-cta-label">SHELL${proactiveHint ? html` <span class="r-shell-cta-dot">●</span>` : ""}</div>
      <div class="r-shell-cta-sub">${proactiveHint ? "Adam ha notato qualcosa — entra e chiediglielo" : "Parlagli — penserà lui a smistare tra i pilastri"}</div>
    </button>
    ${identityCountdown && html`<div class="r-identity-countdown" onClick=${() => setView(identityCountdown.title && (pBio||[]).some(p=>p.title===identityCountdown.title) ? "bio" : (pAir||[]).some(p=>p.title===identityCountdown.title) ? "air" : "vidya")}>
      <div class="r-identity-count">${identityCountdown.missing}</div>
      <div class="r-identity-text">${identityCountdown.missing === 1 ? "passaggio" : "passaggi"} verso <b>${identityCountdown.goal}</b></div>
    </div>`}
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
      <div class="r-card r-simbiosi-card"><div class="r-hub-row" onClick=${() => setView("simbiosi")}><div><div class="r-hub-title">SIMBIOSI${proactiveHint ? html` <span style="color:${C.core}">●</span>` : ""}</div>
        <div class="r-hub-detail">${resonance.text ? resonance.text.slice(0, 70) + "…" : "Nessuna valutazione ancora"}</div></div></div></div>
    </div>
  </div>`;
}

//──────────────────────────────────────────────────────────
// BIO / VIDYA / AIR (Log + Percorsi, AIR anche Agente)
//──────────────────────────────────────────────────────────
function BioView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest, memory }) {
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
    ` : html`<${PercorsiPanel} pillar="bio" color=${C.bio} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} pillarMemory=${memory?.bio} />`}
  </div>`;
}
function VidyaView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest, memory }) {
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
    ` : html`<${PercorsiPanel} pillar="vidya" color=${C.vidya} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} pillarMemory=${memory?.vidya} />`}
  </div>`;
}
const AIR_STATUSES = ["idea", "in corso", "attivo", "bloccato"];
function AirView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest, memory }) {
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
    ` : tab === "percorsi" ? html`<${PercorsiPanel} pillar="air" color=${C.air} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} pillarMemory=${memory?.air} />`
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
const MAGI_PILLARS = [{ id: "", label: "Nessuno (trasversale)" }, { id: "bio", label: "BIO" }, { id: "air", label: "AIR" }, { id: "vidya", label: "VIDYA" }];
const MAGI_INTENSITIES = [{ id: "leggera", label: "Leggera" }, { id: "media", label: "Media" }, { id: "profonda", label: "Profonda" }];
function MagiView({ sessions, onSave, onDelete, settings, memory, updateMemoria }) {
  const [question, setQuestion] = useState(""); const [running, setRunning] = useState(false);
  const [targetPillar, setTargetPillar] = useState(""); const [intensity, setIntensity] = useState("media");
  const [stage, setStage] = useState({ balthasar: "", melchior: "", caspar: "", synthesis: "" }); const [error, setError] = useState("");
  const engineLabel = MODEL_OPTIONS.find((m) => m.id === settings.model)?.label || settings.model;
  const start = async () => { if (!question.trim() || running) return; setRunning(true); setError(""); setStage({ balthasar: "", melchior: "", caspar: "", synthesis: "" });
    try {
      const result = await runTriadeMagi(question.trim(), (k, v) => setStage((s) => ({ ...s, [k]: v === null ? "…" : v })), settings, { memory, targetPillar: targetPillar || null, intensity });
      onSave({ id: uid(), date: new Date().toISOString(), question: question.trim(), engine: engineLabel, pillar: targetPillar || null, intensity, ...result });
      // La perturbazione lascia traccia nella memoria del pilastro-bersaglio (§4.1) — non blocca in caso di errore.
      if (targetPillar && updateMemoria) {
        try { const nuovaMemoria = await reflectPerturbationIntoMemoria(targetPillar, result.synthesis, intensity, memory, settings); if (nuovaMemoria) updateMemoria(targetPillar, nuovaMemoria); }
        catch { /* la traccia in memoria è best-effort: la sessione Magi è già salvata */ }
      }
      setQuestion("");
    }
    catch (e) { setError(e.message || "La Triade non ha risposto."); } finally { setRunning(false); } };
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.core} title="AGORÀ MAGI" subtitle="Balthasar → Melchior → Caspar → sintesi · motore: ${engineLabel}" />
    <${Card} accent=${C.core}>
      <${Field} label="Dilemma o domanda per il Ghost"><textarea class="r-textarea" value=${question} onInput=${(e) => setQuestion(e.target.value)} disabled=${running} /></${Field}>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <${Field} label="Pilastro bersaglio">
          <select class="r-input" value=${targetPillar} onInput=${(e) => setTargetPillar(e.target.value)} disabled=${running}>
            ${MAGI_PILLARS.map((p) => html`<option value=${p.id}>${p.label}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Intensità">
          <select class="r-input" value=${intensity} onInput=${(e) => setIntensity(e.target.value)} disabled=${running}>
            ${MAGI_INTENSITIES.map((i) => html`<option value=${i.id}>${i.label}</option>`)}
          </select>
        </${Field}>
      </div>
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
      <${Card} accent=${C.core}><div class="r-entry-row"><div style="flex:1"><div class="r-entry-date">${fmtDate(s.date)}${s.engine ? ` · ${s.engine}` : ""}${s.pillar ? ` · → ${s.pillar.toUpperCase()}` : ""}${s.intensity ? ` · ${s.intensity}` : ""}</div>
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
function SimbiosiView({ resonance, onRecalc, calculating, error, onPromoteIdentity, onDismissIdentity }) {
  const hint = resonance.identityHint;
  return html`<div class="r-screen">
    <${SectionHeader} color="#2A2E35" title="SIMBIOSI" subtitle="Il punto di incontro tra i pilastri — sensing tra ordine e caos" />
    ${hint && html`<${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:${C.core}">Convergenza identitaria emergente</div>
      <div class="r-magi-text" style="margin-top:8px">Il percorso <b>"${hint.title}"</b> (${(hint.pillar || "").toUpperCase()}) sembra intrecciarsi in qualcosa di più ampio: <i>${hint.becoming}</i>. Vuoi trattarlo come percorso identitario?</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="r-btn" style="background:${C.core}" onClick=${() => onPromoteIdentity(hint)}>Sì, è identitario</button>
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${onDismissIdentity}>No, resta puntuale</button>
      </div>
    </${Card}>`}
    <${Card}>
      <button class="r-btn" onClick=${() => onRecalc(false)} disabled=${calculating}>${calculating ? "Valutazione in corso…" : "Calcola risonanza"}</button>
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
  // Flusso "genera documento da conversazione" (alternativa A): negozia in chat → genera → ancora a un Percorso
  const [docPanel, setDocPanel] = useState(false);
  const [docPhase, setDocPhase] = useState("idle"); // idle | generating | preview | saving
  const [docText, setDocText] = useState("");
  const [docSummary, setDocSummary] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docTargetPillar, setDocTargetPillar] = useState("bio");
  const [docTargetId, setDocTargetId] = useState("");      // id percorso esistente, o "" = nuovo
  const [docNewTitle, setDocNewTitle] = useState("");       // titolo del nuovo percorso se docTargetId vuoto
  const [docMsg, setDocMsg] = useState("");
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
      const { reply, actionsLog, anochin, proposal, alerts, newStyleMemory, draft, calendarProposal, usedWebSearch } = await runShellTurn(history, userText, settings, { addBio, addAir, addVidya, updateMemoria }, memory, styleMemory, currentAttachment);
      setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: reply, time: new Date().toISOString(), actions: actionsLog, anochin, proposal, alerts, draft, calendarProposal, usedWebSearch }]);
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
  // ── Flusso "genera documento da conversazione" (alternativa A) ──
  const CONV_WINDOW = 30; // ultimi N messaggi usati come base per il documento
  const conversationText = () => messages.slice(-CONV_WINDOW)
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => `${m.role === "user" ? "GHOST" : "SHELL"}: ${m.content}`).join("\n\n");
  const openDocPanel = () => {
    setDocPanel(true); setDocPhase("idle"); setDocText(""); setDocSummary(""); setDocTitle("");
    setDocTargetPillar("bio"); setDocTargetId(""); setDocNewTitle(""); setDocMsg("");
  };
  const generateFromConversation = async () => {
    if (docPhase === "generating") return;
    setDocPhase("generating"); setDocMsg("");
    try {
      const convo = conversationText();
      const sysDoc = `Sei lo Shell del sistema Resonance. Dalla conversazione qui sotto tra GHOST e SHELL, estrai e formalizza il documento concordato (es. un piano). Riporta la versione FINALE emersa dalla negoziazione, non le versioni intermedie scartate. Rispetta ogni vincolo o esclusione dichiarato dal Ghost. Usa markup leggero: "# " titolo, "## " sezioni, "- " elenchi, righe normali per paragrafi. Solo il documento, nessuna premessa.`;
      const sysSum = `Sei lo Shell del sistema Resonance. Dalla conversazione qui sotto, estrai in forma sintetica SOLO i vincoli, le esclusioni e le preferenze stabili che il Ghost ha dichiarato (es. "no zucchine", "calorie discontinue", "pranzi portatili lun/mer/ven"). Sono la memoria procedurale che guiderà le prossime versioni. Elenco secco, una riga per vincolo, niente altro.`;
      const [doc, sum] = await Promise.all([
        askModel(sysDoc, convo, 0.5, 4000, settings),
        askModel(sysSum, convo, 0.4, 800, settings),
      ]);
      setDocText(doc); setDocSummary(sum);
      const firstH = (doc.match(/^#\s+(.+)$/m) || [])[1];
      setDocTitle(firstH || "Documento");
      setDocPhase("preview");
    } catch (e) { setDocMsg("Errore generazione: " + e.message); setDocPhase("idle"); }
  };
  const confirmDoc = async (toDrive) => {
    if (docPhase === "saving") return;
    if (!docTargetId && !docNewTitle.trim()) { setDocMsg("Scegli un percorso o dai un nome al nuovo."); return; }
    setDocPhase("saving"); setDocMsg("");
    try {
      const list = percorsi[docTargetPillar] || [];
      const setList = setPercorsi[docTargetPillar];
      if (!setList) { setDocMsg("Errore: pilastro non valido."); setDocPhase("preview"); return; }
      let targetId = docTargetId;
      let target = list.find((p) => p.id === targetId);
      // Percorso nuovo al volo (competenza puntuale, senza scomposizione AI: è un contenitore per l'artefatto)
      if (!target) {
        target = { id: uid(), pillar: docTargetPillar, title: docNewTitle.trim(), kind: "puntuale", identityGoal: null,
          createdAt: new Date().toISOString(), topics: [{ id: uid(), label: "Verifica efficacia", status: "non iniziato", lastTouched: null }],
          sessions: [], competenze: "", touchesPillars: [], localMemory: "", documents: [] };
        targetId = target.id;
      }
      const fname = `${(docTitle || target.title || "documento").replace(/[^\w\sàèéìòù-]/gi, "").trim().slice(0, 60) || "documento"}.docx`;
      let driveId = null;
      const blob = await generateDocxBlob(docTitle || target.title, docText);
      if (toDrive) { const r = await createDriveFile(fname, blob, DOCX_MIME); driveId = r?.id || null; }
      else { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      const doc = { id: uid(), name: fname, title: docTitle || target.title, text: docText, date: new Date().toISOString(), driveId };
      const stamp = new Date().toISOString().slice(0, 10);
      const newMem = (target.localMemory ? target.localMemory + "\n\n" : "") + `[${stamp}] Vincoli da conversazione:\n${docSummary}`;
      const updated = { ...target, documents: [doc, ...(target.documents || [])], localMemory: newMem };
      setList(list.some((p) => p.id === targetId) ? list.map((p) => (p.id === targetId ? updated : p)) : [updated, ...list]);
      setDocMsg(toDrive ? "Salvato su Drive e agganciato al percorso." : "Scaricato e agganciato al percorso.");
      setDocPhase("done");
    } catch (e) { setDocMsg("Errore salvataggio: " + e.message); setDocPhase("preview"); }
  };
  const [copiedId, setCopiedId] = useState(null);
  const copyDraft = (mid, draft) => {
    const text = draft.subject ? `Oggetto: ${draft.subject}\n\n${draft.body}` : draft.body;
    navigator.clipboard?.writeText(text).then(() => { setCopiedId(mid); setTimeout(() => setCopiedId((c) => (c === mid ? null : c)), 2000); });
  };
  // Calendar: mai scrittura automatica (Legge 8) — il Ghost conferma o scarta ogni proposta.
  const [calStatus, setCalStatus] = useState({}); // mid -> "saving" | "done" | "error: <msg>"
  const confirmCalendarEvent = async (mid, proposal) => {
    setCalStatus((s) => ({ ...s, [mid]: "saving" }));
    try {
      await createCalendarEvent(proposal);
      setCalStatus((s) => ({ ...s, [mid]: "done" }));
      setMessages((prev) => [...prev, { id: uid(), role: "system-note", content: `✓ "${proposal.title}" aggiunto al Calendar.` }]);
    } catch (e) { setCalStatus((s) => ({ ...s, [mid]: "error: " + e.message })); }
  };
  const dismissCalendarEvent = (mid) => setCalStatus((s) => ({ ...s, [mid]: "dismissed" }));
  const actionColor = { BIO: C.bio, AIR: C.air, VIDYA: C.vidya };
  const lastBio = bio?.[0], lastAir = air?.[0], lastVidya = vidya?.[0];
  return html`<div class="r-screen">
    <${SectionHeader} color="#2A2E35" title="SHELL" subtitle="Dialogo diretto — ciclo di percezione-azione visibile per verifica" />
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
        : m.role === "balthasar-margin"
        ? html`<div key=${mid} class="r-balthasar-margin-card"><div class="r-balthasar-margin-label">🜃 BALTHASAR — a margine${m.pillar ? ` · ${m.pillar.toUpperCase()}` : ""}</div><div class="r-balthasar-margin-text">${m.note}</div></div>`
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
            ${m.calendarProposal && calStatus[mid] !== "dismissed" && html`<div class="r-draft-card">
              <div class="r-draft-label">📅 CALENDAR — proposta, non ancora salvata</div>
              <div class="r-draft-subject">${m.calendarProposal.title}</div>
              <div class="r-draft-body">${m.calendarProposal.allDay ? m.calendarProposal.startISO.slice(0,10) : new Date(m.calendarProposal.startISO).toLocaleString("it-IT")}${m.calendarProposal.notes ? `\n${m.calendarProposal.notes}` : ""}</div>
              ${!calStatus[mid] && html`<button class="r-btn r-draft-copy" onClick=${() => confirmCalendarEvent(mid, m.calendarProposal)}>Aggiungi al Calendar</button>
                <button class="r-btn r-btn-ghost" onClick=${() => dismissCalendarEvent(mid)}>Scarta</button>`}
              ${calStatus[mid] === "saving" && html`<span class="r-spin">⏳</span> Salvo…`}
              ${calStatus[mid] === "done" && html`<div class="r-ok">✓ Salvato sul Calendar.</div>`}
              ${calStatus[mid]?.startsWith?.("error") && html`<div class="r-error">${calStatus[mid].replace("error: ", "")}</div>`}
            </div>`}
            <div class="r-shell-msg-footer">
              ${m.usedWebSearch && html`<span class="r-badge" style="border-color:${C.core};color:${C.core}">🌐 WEB</span>`}
              ${m.actions && m.actions.length > 0 && html`<div class="r-shell-actions">${m.actions.map((a) => html`<span class="r-badge" style="border-color:${actionColor[a]};color:${actionColor[a]}">→ ${a}</span>`)}</div>`}
              ${m.role === "assistant" && html`<button class="r-shell-speak-btn" onClick=${() => toggleSpeak(mid, m.content)} title=${speakingId === mid ? "Interrompi" : "Riascolta"}>${speakingId === mid ? "⏹" : "🔊"}</button>`}
            </div>
            ${m.anochin && html`<${AnochinTrace} trace=${m.anochin} />`}
          </div>`; })}
      ${sending && html`<div class="r-shell-row assistant"><div class="r-shell-listening"><span class="r-listening-dot"></span><span class="r-listening-dot"></span><span class="r-listening-dot"></span> <span class="r-listening-text">sto leggendo tra le righe…</span></div></div>`}
      <div ref=${bottomRef}></div>
    </div>
    ${error && html`<div class="r-error">${error}</div>`}
    ${messages.length >= 2 && !docPanel && html`<button class="r-btn r-btn-ghost" style="margin:0 0 10px 0;width:100%" onClick=${openDocPanel}>Genera documento da questa conversazione</button>`}
    ${docPanel && html`<div class="r-card" style="margin-bottom:10px">
      <div class="r-hub-title" style="color:${C.core}">Documento da conversazione</div>
      ${docPhase === "idle" && html`<div>
        <div class="r-hub-detail" style="margin-top:6px">Userò gli ultimi ${CONV_WINDOW} messaggi. Genererò il documento e una bozza dei vincoli emersi, da agganciare a un percorso.</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="r-btn" style="background:${C.core}" onClick=${generateFromConversation}>Genera bozza</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => setDocPanel(false)}>Annulla</button>
        </div>
      </div>`}
      ${docPhase === "generating" && html`<div class="r-hub-detail" style="margin-top:8px">Sto formalizzando il documento e i vincoli…</div>`}
      ${(docPhase === "preview" || docPhase === "saving") && html`<div style="margin-top:8px">
        <${Field} label="Titolo file"><input class="r-input" value=${docTitle} onInput=${(e) => setDocTitle(e.target.value)} /></${Field}>
        <div class="r-hub-detail" style="margin-top:6px">Anteprima documento:</div>
        <div class="r-magi-text" style="white-space:pre-wrap;max-height:180px;overflow:auto;background:var(--surface2);padding:10px;border-radius:8px;margin-top:4px">${docText}</div>
        <div class="r-hub-detail" style="margin-top:10px">Vincoli che salverò nella memoria del percorso (modificabili):</div>
        <textarea class="r-textarea" style="margin-top:4px" value=${docSummary} onInput=${(e) => setDocSummary(e.target.value)} />
        <${Field} label="Pilastro"><select class="r-input" value=${docTargetPillar} onChange=${(e) => { setDocTargetPillar(e.target.value); setDocTargetId(""); }}>
          <option value="bio">BIO</option><option value="air">AIR</option><option value="vidya">VIDYA</option>
        </select></${Field}>
        <${Field} label="Percorso di destinazione"><select class="r-input" value=${docTargetId} onChange=${(e) => setDocTargetId(e.target.value)}>
          <option value="">➕ Nuovo percorso…</option>
          ${(percorsi[docTargetPillar] || []).map((p) => html`<option value=${p.id}>${p.title}</option>`)}
        </select></${Field}>
        ${!docTargetId && html`<input class="r-input" style="margin-bottom:10px" value=${docNewTitle} onInput=${(e) => setDocNewTitle(e.target.value)} placeholder="Nome del nuovo percorso" />`}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="r-btn" style="background:${C.core}" onClick=${() => confirmDoc(false)} disabled=${docPhase === "saving"}>${docPhase === "saving" ? "…" : "Scarica .docx"}</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => confirmDoc(true)} disabled=${docPhase === "saving"}>Salva su Drive</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${generateFromConversation} disabled=${docPhase === "saving"}>Rigenera</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => setDocPanel(false)}>Chiudi</button>
        </div>
      </div>`}
      ${docPhase === "done" && html`<div style="margin-top:8px">
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => setDocPanel(false)}>Chiudi</button>
      </div>`}
      ${docMsg && html`<div class="${docMsg.startsWith("Errore") ? "r-error" : "r-ok"}" style="margin-top:8px">${docMsg}</div>`}
    </div>`}
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
  const [jsonFailures, setJsonFailures] = useState(() => loadKey("json-parse-failures", []));
  const refreshJsonFailures = () => setJsonFailures(loadKey("json-parse-failures", []));
  const clearJsonFailures = () => { saveKey("json-parse-failures", []); setJsonFailures([]); };
  const exportJsonFailures = () => {
    const blob = new Blob([JSON.stringify(jsonFailures, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `resonance-json-failures-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
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
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#3A4750">Braccio — Calendar</div>
        <div class="r-hub-detail">Lo Shell riconosce richieste di appuntamenti/promemoria in chat e propone una card da confermare — mai scrittura automatica. Disattivalo per azzerare il costo di questo rilevamento.</div></div>
        <input type="checkbox" checked=${settings.calendarEnabled} onInput=${(e) => updateSettings({ calendarEnabled: e.target.checked })} /></div>
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
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Diagnostica JSON — ${jsonFailures.length} fallimenti recenti</div>
      <div class="r-hub-detail">Quando un modello (es. Llama, Kimi) risponde con un JSON non interpretabile nonostante l'istruzione, la risposta grezza viene salvata qui — utile per capire il motivo esatto invece di indovinare correzioni.</div>
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${refreshJsonFailures}>Aggiorna</button>
        <button class="r-btn" onClick=${exportJsonFailures} disabled=${!jsonFailures.length}>Esporta (.json)</button>
        <button class="r-btn r-btn-ghost" onClick=${clearJsonFailures} disabled=${!jsonFailures.length}>Svuota</button>
      </div>
      ${jsonFailures.length > 0 && html`<div class="r-list" style="margin-top:10px">${jsonFailures.slice(0, 3).map((f) => html`
        <${Card}><div class="r-entry-date">${new Date(f.time).toLocaleString("it-IT")} · ${f.model}</div>
          <div class="r-kernel-preview">${f.raw}</div></${Card}>`)}</div>`}
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
// Onboarding Fase 0 — deliberatamente grezzo (Sez 0 Manifesto: l'architettura è universale,
// il profilo che la abita va ricalibrato per ogni Ghost, non riusato). Simbiosi lo affina nel tempo
// (criterio "seconda pelle", stesso già usato per Reversibilità Strutturale) — questo è solo il seme.
function OnboardingView({ onComplete }) {
  const [name, setName] = useState("");
  const [cognitiveNotes, setCognitiveNotes] = useState("");
  const [bioConstraints, setBioConstraints] = useState("");
  const [hasProfessionalConstraint, setHasProfessionalConstraint] = useState(false);
  const [professionalIdentity, setProfessionalIdentity] = useState("");
  const canSubmit = name.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    onComplete({
      name: name.trim(),
      cognitiveNotes: cognitiveNotes.trim(),
      bioConstraints: bioConstraints.trim(),
      hasProfessionalConstraint,
      professionalIdentity: hasProfessionalConstraint ? professionalIdentity.trim() : "",
    });
  };
  return html`<div class="r-screen">
    <div class="r-section-header"><h2>Benvenuto in Resonance</h2><p>Un questionario breve e grezzo — Simbiosi lo affinerà nel tempo osservando come usi il sistema. Non serve la risposta perfetta ora.</p></div>
    <div class="r-card">
      <label class="r-field"><span>Come vuoi essere chiamato dallo Shell?</span><input class="r-input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Il tuo nome" /></label>
      <label class="r-field"><span>Come impari/elabori meglio? (es. a voce, per esempi pratici, per schemi visivi, leggendo teoria...)</span><textarea class="r-textarea" value=${cognitiveNotes} onInput=${(e) => setCognitiveNotes(e.target.value)} placeholder="Descrivi in poche righe il tuo stile — libero, lo Shell lo userà per calibrare il registro" /></label>
      <label class="r-field"><span>Vincoli fisici/alimentari fissi da rispettare sempre (se nessuno, lascia vuoto)</span><textarea class="r-textarea" value=${bioConstraints} onInput=${(e) => setBioConstraints(e.target.value)} placeholder="Esclusioni, allergie, target..." /></label>
      <div class="r-settings-row" style="margin-bottom:10px">
        <span>Hai un'identità professionale/pubblica da tenere separata dal pilastro AIR (autonomia economica)?</span>
        <input type="checkbox" checked=${hasProfessionalConstraint} onInput=${(e) => setHasProfessionalConstraint(e.target.checked)} />
      </div>
      ${hasProfessionalConstraint && html`<label class="r-field"><span>Descrivila brevemente — non verrà MAI esposta in output AIR</span><input class="r-input" value=${professionalIdentity} onInput=${(e) => setProfessionalIdentity(e.target.value)} placeholder="es. avvocato, Studio Rossi" /></label>`}
      <button class="r-btn" disabled=${!canSubmit} onClick=${submit}>Inizia</button>
    </div>
  </div>`;
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
  // null = nessun profilo ancora salvato per QUESTO account → mostra onboarding invece dell'Hub.
  // Se esiste già (caso di Flavio, che ha sempre usato l'app), lo applica subito al modulo.
  // Distingue "installazione esistente che aggiorna" da "account davvero nuovo" guardando se
  // esistono già dati storici (kernel-data è presente fin dalla primissima versione dell'app).
  // Senza questo controllo, Flavio stesso vedrebbe l'onboarding al primo caricamento post-update
  // — "ghost-profile" è una chiave nuova, non esiste ancora per nessuno, lui incluso.
  const isExistingInstall = () => localStorage.getItem("kernel-data") !== null || localStorage.getItem("bio-data") !== null || localStorage.getItem("shell-chat") !== null;
  const [ghostProfile, setGhostProfileRaw] = useState(() => {
    const saved = loadKey("ghost-profile", null);
    if (saved) return saved;
    if (isExistingInstall()) { saveKey("ghost-profile", DEFAULT_GHOST_PROFILE); return DEFAULT_GHOST_PROFILE; }
    return null; // davvero nessun dato pregresso: onboarding
  });
  useEffect(() => { if (ghostProfile) setGhostProfile(ghostProfile); }, []); // solo al mount, stato già caricato sincrono sopra
  const saveGhostProfile = useCallback((profile) => {
    setGhostProfileRaw(profile); saveKey("ghost-profile", profile); setGhostProfile(profile);
  }, []);
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
  const stateRef = useRef({ bio, air, vidya, pBio, pAir, pVidya, magi, shellChat, memory, styleMemory, kernel, resonance, ghostProfile });
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
    stateRef.current = { bio, air, vidya, pBio, pAir, pVidya, magi, shellChat, memory, styleMemory, kernel, resonance, ghostProfile };
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }          // idratazione iniziale: non è una modifica
    if (skipStampRef.current) { skipStampRef.current = false; return; }            // apply da Drive: il timestamp giusto l'ha già scritto applyMergedState
    saveKey("sync-last-modified", Date.now());                                     // modifica reale dell'utente/Shell
  }, [bio, air, vidya, pBio, pAir, pVidya, magi, shellChat, memory, styleMemory, kernel, resonance, ghostProfile]);

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
    setGhostProfileRaw(merged.ghostProfile); saveKey("ghost-profile", merged.ghostProfile); setGhostProfile(merged.ghostProfile);
    stateRef.current = { bio: merged.bio, air: merged.air, vidya: merged.vidya, pBio: merged.pBio, pAir: merged.pAir, pVidya: merged.pVidya, magi: merged.magi, shellChat: merged.shellChat, memory: merged.memory, styleMemory: merged.styleMemory, kernel: merged.kernel, resonance: merged.resonance, ghostProfile: merged.ghostProfile };
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
  const resonanceBusyRef = useRef(false);
  const recalcResonance = useCallback(async (silent = false) => {
    if (resonanceBusyRef.current) return; // una valutazione (manuale o proattiva) è già in volo: non sovrapporre
    resonanceBusyRef.current = true;
    if (!silent) { setResCalculating(true); setResError(""); }
    try {
      const digest = buildResonanceDigest({ bio, air, vidya, kernel, magi, pBio, pAir, pVidya });
      const recentChatText = recentShellText(stateRef.current.shellChat);
      const res = await computeResonance(digest, settingsRef.current, recentChatText);
      const next = { text: res.text, time: Date.now(), worthSurfacing: res.worthSurfacing, identityHint: res.identityHint || null };
      setResonance(next); saveKey("simbiosi-data", next);
      // Balthasar-a-margine (1 solo segnale): card dedicata in Shell, mai pipeline completa.
      if (res.crystallization?.marginNote) {
        setShellChat((prev) => [...prev, { id: uid(), role: "balthasar-margin", pillar: res.crystallization.pillar || null, note: res.crystallization.marginNote }]);
      }
      // TTS solo su recalc manuale (gesto utente) e solo se vale la pena. Non sulla proattiva (parte
      // dopo setTimeout: gesture-standing perso, non partirebbe). Best-effort come l'autoplay di Shell.
      if (!silent && res.worthSurfacing && res.text) { try { speakText(res.text); } catch { /* TTS best-effort */ } }
      // Allinea la signature: un recalc manuale conta come "valutazione fatta", la proattiva non lo ripeterà.
      const s = stateRef.current;
      saveKey("simbiosi-eval-signature", `${s.bio.length}|${s.air.length}|${s.vidya.length}|${s.pBio.length}|${s.pAir.length}|${s.pVidya.length}|${s.magi.length}|${s.bio[0]?.date||""}|${s.air[0]?.date||""}|${s.vidya[0]?.date||""}`);
    } catch (e) { if (!silent) setResError(e.message); } finally { resonanceBusyRef.current = false; if (!silent) setResCalculating(false); }
  }, [bio, air, vidya, kernel, magi, pBio, pAir, pVidya]);
  // Applica una proposta identitaria emergente di Simbiosi: promuove un percorso esistente a "identitario".
  // Coerente con Legge 8 (conferma esplicita) — chiamata solo su azione del Ghost, mai in automatico.
  const promoteToIdentity = useCallback((hint) => {
    if (!hint?.pillar || !hint?.title) { pushDebugLog({ type: "promote-identity", error: "hint mancante di pillar/title", hint }); return; }
    const setter = { bio: setPBioSync, air: setPAirSync, vidya: setPVidyaSync }[hint.pillar];
    const list = { bio: pBio, air: pAir, vidya: pVidya }[hint.pillar];
    if (!setter || !list) { pushDebugLog({ type: "promote-identity", error: "pillar non riconosciuto", pillar: hint.pillar }); return; }
    setter(list.map((p) => (p.title === hint.title ? { ...p, kind: "identitario", identityGoal: hint.becoming || p.identityGoal || `diventare una persona che padroneggia: ${p.title}` } : p)));
    // consumato l'hint: lo rimuovo dalla risonanza così la proposta non ricompare
    setResonance((prev) => { const n = { ...prev, identityHint: null }; saveKey("simbiosi-data", n); return n; });
  }, [pBio, pAir, pVidya, setPBioSync, setPAirSync, setPVidyaSync]);
  const dismissIdentityHint = useCallback(() => {
    setResonance((prev) => { const n = { ...prev, identityHint: null }; saveKey("simbiosi-data", n); return n; });
  }, []);

  // ═══ SIMBIOSI PROATTIVA ═══
  // Al mount (una sola volta per sessione), se c'è una chiave API e se è cambiato qualcosa dall'ultima
  // valutazione, Simbiosi si auto-valuta in silenzio. Nessun timer, nessuna soglia di giorni (Bateson):
  // l'innesco è "è cambiato lo stato del sistema da quando ho guardato l'ultima volta?", giudizio
  // qualitativo delegato poi a computeResonance (worthSurfacing). Il risultato non interrompe: appare
  // solo come indicatore ● sul bottone SHELL/SIMBIOSI in Hub, che il Ghost trova quando entra.
  const proactiveRanRef = useRef(false);
  useEffect(() => {
    if (proactiveRanRef.current) return;
    proactiveRanRef.current = true;
    if (!settingsRef.current.apiKey) return; // niente API: niente valutazione
    // Ritardo: lascia finire mount + eventuale sync (che popola stateRef via applyMergedState) prima di valutare.
    const t = setTimeout(async () => {
      if (resonanceBusyRef.current) return; // recalc manuale già in volo: la proattiva si astiene
      const s = stateRef.current; // stato FRESCO (post-sync), non la closure del primo render (evita stale closure)
      const signature = `${s.bio.length}|${s.air.length}|${s.vidya.length}|${s.pBio.length}|${s.pAir.length}|${s.pVidya.length}|${s.magi.length}|${s.bio[0]?.date||""}|${s.air[0]?.date||""}|${s.vidya[0]?.date||""}`;
      if (signature === loadKey("simbiosi-eval-signature", "")) return; // nulla di nuovo dall'ultima valutazione
      resonanceBusyRef.current = true;
      try {
        const digest = buildResonanceDigest({ bio: s.bio, air: s.air, vidya: s.vidya, kernel: s.kernel, magi: s.magi, pBio: s.pBio, pAir: s.pAir, pVidya: s.pVidya });
        const res = await computeResonance(digest, settingsRef.current, recentShellText(s.shellChat));
        const next = { text: res.text, time: Date.now(), worthSurfacing: res.worthSurfacing, identityHint: res.identityHint || null };
        setResonance(next); saveKey("simbiosi-data", next);
        if (res.crystallization?.marginNote) {
          setShellChat((prev) => [...prev, { id: uid(), role: "balthasar-margin", pillar: res.crystallization.pillar || null, note: res.crystallization.marginNote }]);
        }
        saveKey("simbiosi-eval-signature", signature); // salvata SOLO dopo successo: un fallimento può riprovare al prossimo mount
        pushDebugLog({ type: "simbiosi-proactive", worthSurfacing: res.worthSurfacing, hasIdentityHint: !!res.identityHint, error: null });
      } catch (e) { pushDebugLog({ type: "simbiosi-proactive", error: e.message }); } // signature NON salvata: si riproverà
      finally { resonanceBusyRef.current = false; }
    }, 3500);
    return () => clearTimeout(t);
  }, []); // intenzionalmente solo al mount; legge stato fresco via stateRef

  const digestBio = `Kernel: ${kernel.content.slice(0, 300)}\nUltime voci BIO: ${bio.slice(0, 5).map((e) => e.notes || e.weight).join("; ")}\nPercorsi esistenti: ${pBio.map((p) => p.title).join(", ") || "nessuno"}`;
  const digestAir = `Kernel: ${kernel.content.slice(0, 300)}\nUltimi vettori AIR: ${air.slice(0, 5).map((e) => `${e.title} (${e.status})`).join("; ")}\nPercorsi esistenti: ${pAir.map((p) => p.title).join(", ") || "nessuno"}`;
  const digestVidya = `Kernel: ${kernel.content.slice(0, 300)}\nUltimi log VIDYA: ${vidya.slice(0, 5).map((e) => e.title).join("; ")}\nPercorsi esistenti: ${pVidya.map((p) => p.title).join(", ") || "nessuno"}`;

  return html`<div>
    <div class="r-ghost-texture"></div>
    <${HexTexture} />
    <div class="r-topbar"><div class="r-brand">RESONANCE<span>•</span></div></div>
    ${!ghostProfile && html`<${OnboardingView} onComplete=${saveGhostProfile} />`}
    ${ghostProfile && html`<div>
    ${view === "hub" && html`<${Hub} bio=${bio} air=${air} vidya=${vidya} magi=${magi} resonance=${resonance} setView=${setView} pBio=${pBio} pAir=${pAir} pVidya=${pVidya} proactiveHint=${resonance.worthSurfacing} />`}
    ${view === "shell" && html`<${ShellView} messages=${shellChat} setMessages=${setShellChat} settings=${settings} addBio=${addBio} addAir=${addAir} addVidya=${addVidya}
      percorsi=${{ bio: pBio, air: pAir, vidya: pVidya }} setPercorsi=${{ bio: setPBioSync, air: setPAirSync, vidya: setPVidyaSync }}
      memory=${memory} updateMemoria=${updateMemoria} styleMemory=${styleMemory} setStyleMemory=${setStyleMemory} bio=${bio} air=${air} vidya=${vidya} pushDebugLog=${pushDebugLog} />`}
    ${view === "bio" && html`<${BioView} entries=${bio} onAdd=${addBio} onDelete=${delBio} percorsi=${pBio} setPercorsi=${setPBioSync} settings=${settings} digest=${digestBio} memory=${memory} />`}
    ${view === "air" && html`<${AirView} entries=${air} onAdd=${addAir} onDelete=${delAir} percorsi=${pAir} setPercorsi=${setPAirSync} settings=${settings} digest=${digestAir} memory=${memory} />`}
    ${view === "vidya" && html`<${VidyaView} entries=${vidya} onAdd=${addVidya} onDelete=${delVidya} percorsi=${pVidya} setPercorsi=${setPVidyaSync} settings=${settings} digest=${digestVidya} memory=${memory} />`}
    ${view === "magi" && html`<${MagiView} sessions=${magi} onSave=${addMagi} onDelete=${delMagi} settings=${settings} memory=${memory} updateMemoria=${updateMemoria} />`}
    ${view === "simbiosi" && html`<${SimbiosiView} resonance=${resonance} onRecalc=${recalcResonance} calculating=${resCalculating} error=${resError} onPromoteIdentity=${promoteToIdentity} onDismissIdentity=${dismissIdentityHint} />`}
    ${view === "kernel" && html`<${KernelView} kernel=${kernel} onSave=${saveKernel} driveStatus=${driveStatus} />`}
    ${view === "settings" && html`<${SettingsView} settings=${settings} updateSettings=${updateSettings} driveStatus=${driveStatus} debugLog=${debugLog} clearDebugLog=${clearDebugLog} pullAndMergeOnce=${pullAndMergeOnce} />`}
    <div class="r-tab-bar"><div class="r-tab-bar-inner">${TABS.map((t) => html`<button class="r-tab ${view === t.key ? "active" : ""}" onClick=${() => setView(t.key)}>${t.label}</button>`)}</div></div>
    </div>`}
  </div>`;
}
render(html`<${App} />`, document.getElementById("app"));
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
