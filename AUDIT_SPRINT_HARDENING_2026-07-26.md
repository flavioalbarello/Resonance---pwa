# Audit — TASK C, SPRINT HARDENING 26/07/2026

Documento di sola analisi, nessuna implementazione (come richiesto dal brief). Basato su
ispezione diretta di `app.js` in questa sessione — non su stime a memoria. Le dimensioni in
token sono stime approssimate (caratteri/4), non misure reali da un conteggio tokenizer o da
una chiamata live: dichiarato esplicitamente ovunque usate.

---

## 1. Cosa è costruito ma mai verificato in produzione con dati reali

Precedente noto e già citato nel brief: `APP_CAPABILITIES_CONTEXT` è stato rilasciato,
mergiato, e SOLO nel primo uso reale del Ghost si è scoperto che lo Shell non lo usava come
previsto (bug del 26/07 con "Semi"/Threvane). Questo è il pattern da assumere come probabile
altrove finché non smentito da un test reale, non l'eccezione.

Elenco onesto, per grado di rischio:

- **Balthasar-del-Seme / pipeline Seed intera (`runSeedResearch`, `proposeSeedExecutionStep`,
  `runSeedGateCheck`)** — mai eseguita con una chiave OpenRouter reale in nessuna sessione di
  sviluppo. Tutta la verifica finora è stata E2E con risposte mockate. Il bug del loop
  degenerato che ha originato questo sprint è la prova diretta che il comportamento reale del
  modello (Llama 3.3 70B) diverge da quanto i mock avevano fatto assumere per rounds — i mock
  restituiscono sempre testo "pulito", quindi non potevano mai far emergere un loop.
- **TASK A/B di QUESTO sprint (penalità anti-loop + guardia degenerata)** — verificati solo
  con test unitari su funzioni pure e con la logica di retry simulata (vedi sezione consegna
  del riepilogo). Nessuna chiamata reale a OpenRouter è stata eseguita in questa sessione
  (nessuna chiave disponibile nell'ambiente sandboxed). Se Flavio fornisce una chiave, il primo
  test reale (ripetendo la richiesta che ha originato il loop) è l'unica verifica che conta.
- **Sistema di costo/token (`logAiCost`/`extractUsageForLog`, TASK 1 sprint precedente)** — mai
  osservato con un `raw.usage` reale. Ipotesi non verificata: alcuni modelli/provider omettono
  `usage.cost` (il pannello Setup mostra "costo non disponibile" in quel caso) — non è chiaro se
  questo sia il caso comune o raro per Llama 3.3 70B su OpenRouter in produzione.
- **`detectPossibleHallucinatedSource`** — la regex CamelCase è stata validata su ESATTAMENTE i
  4 nomi fabbricati osservati nel test reale del 26/07 (ShopFoundry, RankHero, InsightAgent,
  MerchTitans). Non è validata su un campione più ampio di output reali: un'allucinazione a una
  parola sola senza maiuscola interna (es. "Threadify") continuerebbe a passare inosservata —
  limite noto, dichiarato, non ancora osservato se sia comune.
- **Redazione identità professionale (`redactProfessionalIdentity`) end-to-end** — la funzione
  pura è testata in isolamento; il flusso completo (messaggio Shell con menzione professionale →
  Seed → payload verso Balthasar/Melchior) è stato verificato SOLO via log/E2E mockato, mai con
  un Seed reale creato da una conversazione reale del Ghost che nomina la sua identità.
- **`runSeedGateCheck`** — le 4 condizioni chiuse non sono mai state osservate scattare contro
  un output reale del modello; è plausibile che un modello economico non rispetti rigidamente il
  formato "VIA LIBERA"/"BLOCCATO: ..." richiesto, nel qual caso `gated` risulterebbe sempre
  `false` (fail-open silenzioso) — rischio da tenere presente, non confermato.
- **Simbiosi proattiva (`computeResonance`)** — mai osservata con un digest reale sufficientemente
  ricco (più percorsi, più sessioni Magi) da poter giudicare se i 4 mandati producono un giudizio
  utile o generico.

## 2. Inventario di tutto ciò che viene iniettato in ogni system prompt

Stime di dimensione basate su misura diretta (chars, poi /4 per un token stimato) dei blocchi
di testo fisso in `app.js`, più la parte variabile (dipende dai dati del Ghost).

| Blocco | Dove | Dimensione stimata | Uso reale osservabile nel codice |
|---|---|---|---|
| `nowContext()` | quasi ogni chiamata | poche decine di token, fisso | Necessario: senza data/ora il modello non può distinguere "aggiornato a oggi" da dati storici — usato esplicitamente nei prompt di ricerca web. Peso trascurabile. |
| `PILLAR_CTX.bio/air/vidya` (`buildPillarCtx`) | Shell, Magi (indirettamente via memory), Agente AIR, Seed | variabile: ~100-400 char fissi per pilastro + `freeformNotes` (motivation/context/request/strength, illimitato in lunghezza, testo libero onboarding) | Uso reale per AIR (vincolo hard-stop) è centrale e verificato (è l'unico verdetto vero/falso del sistema). BIO/VIDYA (vincoli+freeform) non hanno mai un test che dimostri se il modello li applica attivamente o li ignora come rumore di sfondo — **candidato a peso morto non verificato**, non dead weight confermato. |
| `APP_CAPABILITIES_CONTEXT` | SOLO Shell (`runShellTurn`) | 1202 caratteri misurati ≈ **300 token stimati**, iniettato AD OGNI turno Shell, invariato tra un turno e l'altro nella stessa sessione | Motivato dal bug reale "Semi ignorato" — ma è iniettato per intero ad ogni turno anche quando la conversazione non nomina alcuna feature. Nessun meccanismo di iniezione condizionale (es. solo se il messaggio nomina una parola chiave). **Costo fisso ricorrente, non verificato se il modello lo consulti davvero o lo ignori nella maggior parte dei turni.** |
| Memoria procedurale (`lente` = memory.bio/air/vidya) | Shell (main reply) | illimitata in crescita: ogni riscrittura di memoria (`reflectMemoriaBatch`, `reflectPerturbationIntoMemoria`) sostituisce l'INTERA nota per pilastro, ma non c'è un tetto di lunghezza dichiarato nel codice | Centrale e verificato concettualmente (è il meccanismo di "accoppiamento strutturale" del Manifesto) — ma nessun limite di token esplicito: se un pilastro accumula una nota molto densa nel tempo, cresce silenziosamente ad ogni turno Shell senza segnalazione. |
| `styleNote` (stile di conversazione appreso) | Shell | breve (~70 parole max dichiarate in `reflectStyle`) | Piccolo, limite esplicito nel prompt che lo genera — rischio basso. |
| Manifesto/contesto Magi (`baseCtx` in `runTriadeMagi`) | Solo Magi (4 chiamate per round: Balthasar/Melchior/Caspar/synthesis) | ~450 caratteri fissi ≈ **110 token**, ripetuto identico in TUTTE E 4 le chiamate della stessa Agorà | Ridondanza strutturale: lo stesso `baseCtx` viene ricostruito e re-inviato 4 volte nello stesso round invece di essere condiviso — non è "dead weight" semanticamente (serve a ogni singola chiamata, che sono indipendenti), ma è **payload ripetuto 4x per round senza necessità di variarlo**, vedi sezione 4. |
| Kernel (`kernel.content.slice(0,400)`) | Solo dentro `buildResonanceDigest` → Simbiosi | fino a 400 caratteri ≈ **100 token**, solo quando Simbiosi viene invocata (proattiva 1x per mount, o manuale) | NON iniettato nello Shell — solo in Simbiosi. Uso mirato, non ridondante. |
| `casparIdentityLine`/`identityConstraintLine` (vincolo PhysioAlba) | Magi Caspar, `runAccettore`, Seed Caspar, `runSeedGateCheck`, Simbiosi | poche decine di token, condizionale (`hasProfessionalConstraint`) | Uso critico e verificato concettualmente ad ogni punto — MAI iniettato nel contesto AIR condiviso con Balthasar/Melchior (solo nella verifica), coerente col vincolo assoluto. |

**Sintesi sezione 2**: il singolo blocco a maggior costo fisso e minor verifica di utilizzo
reale è `APP_CAPABILITIES_CONTEXT` (≈300 token/turno Shell, sempre presente, mai condizionato al
contenuto del messaggio). Il secondo è la ripetizione di `baseCtx` 4 volte per round Magi
(≈440 token totali/round solo per quella parte fissa, quando ne basterebbe uno se le chiamate
fossero unificate — vedi proposta 3 in sezione 4). La memoria procedurale è il rischio di
crescita silenziosa più concreto a lungo termine (nessun tetto).

## 3. Chiamate AI che costano senza valore duraturo

- **Round Seed falliti per intero (0 strategie approvate su tutti i 5 round)** — se Caspar-del-
  Seme boccia sistematicamente (es. per un'idea che tocca sempre il dominio professionale), il
  Seed consuma **15 chiamate AI** (Balthasar+Melchior+Caspar-del-Seme × 5 round) prima di finire
  in stato `"proposing"` con zero risultato utilizzabile. Non c'è un meccanismo di uscita
  anticipata se i round consecutivi producono zero strategie approvate con lo stesso esito
  (es. 2 round di fila a 0 approvate → prova un segnale che i round successivi non cambieranno
  esito senza un input diverso dal Ghost).
- **`baseCtx` di Magi ricostruito 4 volte identico per round** (sezione 2) — non è propriamente
  "senza valore" (ogni chiamata lo richiede), ma è overhead evitabile: unificare non è banale
  (le 4 chiamate sono sequenziali per costruzione, ognuna dipende sull'output della precedente)
  ma il testo fisso duplicato è puro spreco di token, non di logica.
- **Simbiosi proattiva con `worthSurfacing:false` sistematico** — l'esecuzione è già deduplicata
  bene (firma di stato, non rivaluta se nulla è cambiato) — MA se la valutazione restituisce
  quasi sempre `worthSurfacing:false` (mai osservato con dati reali, sezione 1), l'app avrebbe
  comunque pagato una chiamata JSON non banale (il prompt a 4 mandati è lungo, sezione 2) per un
  risultato che non emerge mai al Ghost. Non è uno spreco CONFERMATO, ma un rischio plausibile
  se i 4 mandati sono tarati troppo in alto per emergere spesso.
- **`webSearchSnapshot` (Shell on-demand)** — chiamata dedicata di 700 token max SOLO per
  decidere se innescare la ricerca prima del turno principale; se la ricerca fallisce
  (`catch { return null; }`), il turno principale procede comunque MA il costo della chiamata
  fallita è già speso senza alcun beneficio — accettabile come design (fallimento onesto), ma
  vale la pena notare che non c'è retry né log dedicato per capire quanto spesso questo accade.
- **Cost-tracking incompleto**: `caspar` (Magi) e `synthesis` (Magi) NON passano `onRaw` a
  `askModel` — quindi quelle due chiamate (2 delle 4 per round Magi) non vengono loggate dal
  sistema di costo/token esistente. Non è un bug funzionale, ma rende il pannello "Costi/token
  IA" in Setup incompleto per Agorà Magi: sottostima il costo reale di ogni Agorà di circa metà
  delle chiamate coinvolte.

## 4. Proposte di ottimizzazione, ordinate per rapporto guadagno/rischio (nessuna implementata)

1. **Completare il cost-tracking mancante su Magi (caspar/synthesis)** — guadagno: visibilità
   accurata del costo reale (non un risparmio diretto, ma la precondizione per giudicare le altre
   proposte). Rischio: minimo, stesso pattern già esistente (`onRaw`), 2 righe da aggiungere.
2. **Uscita anticipata sui round Seed a 0 risultati** — es. se 2 round consecutivi producono 0
   strategie approvate, passa a `"proposing"` invece di continuare fino al tetto di 5. Guadagno:
   fino a 9 chiamate AI risparmiate per Seed "senza speranza" (da 15 a 6). Rischio: basso — una
   sola condizione aggiuntiva, nessun cambio di pipeline; il trade-off è che un Seed che avrebbe
   convertito al round 3-4 con esattamente la stessa idea non riproposta verrebbe troncato prima
   — accettabile se la soglia è "2 round consecutivi a zero", non 1.
3. **Iniezione condizionale di `APP_CAPABILITIES_CONTEXT`** — iniettarlo solo quando il messaggio
   del Ghost nomina (euristica leggera, stesso stile di `detectWebSearchIntent`) una delle
   feature elencate (Percorsi/Semi/Agorà/Calendar/Kernel/Simbiosi) o una parola vicina, invece di
   sempre. Guadagno: ~300 token risparmiati sulla maggioranza dei turni Shell che non parlano di
   feature. Rischio: medio — un'euristica troppo stretta ripropone esattamente il bug originale
   (Shell che non riconosce una feature nominata in modo meno diretto); serve una lista di
   trigger generosa, non solo i nomi esatti delle feature.
4. **Tetto esplicito di lunghezza sulla memoria procedurale per pilastro** — troncare/segnalare
   se una nota di memoria supera una soglia (es. 600 caratteri) invece di lasciarla crescere
   senza limite dichiarato. Guadagno: previene una crescita silenziosa di token per turno Shell
   nel tempo. Rischio: medio-alto — richiede decidere COME comprimere senza perdere segnale
   utile (troncare rischia di perdere la parte più vecchia e rilevante, non solo rumore); non è
   una scelta ovvia e andrebbe discussa, non solo implementata.
5. **Unificare `baseCtx` di Magi in un unico messaggio di sistema condiviso** (es. passare la
   storia della conversazione Magi come `messages[]` con `askModelWithHistory` invece di 4 prompt
   indipendenti che ripetono lo stesso preambolo) — guadagno: elimina la ripetizione di ~110
   token fissi × 3 chiamate ridondanti (330 token/round risparmiati). Rischio: alto — è un
   refactor strutturale della pipeline Magi (4 funzioni oggi indipendenti diventerebbero una
   sequenza di messaggi), tocca codice centrale e ben rodato; il guadagno per round è modesto
   rispetto al rischio di introdurre una regressione in una pipeline già stabile.

Ordine di priorità consigliato (a giudizio di chi scrive, decisione resta a Flavio): 1 → 2 → 3,
poi valutare 4 solo se la memoria mostra segni concreti di crescita eccessiva, 5 solo se il
volume di round Magi diventa un costo rilevante (oggi è un'azione a bassa frequenza, su
richiesta esplicita — non un costo ricorrente come lo Shell).

---

*Nessuna riga di codice è stata modificata per questo documento. Le sole modifiche di questo
sprint sono quelle di TASK A e TASK B, descritte a parte nel riepilogo di consegna.*
