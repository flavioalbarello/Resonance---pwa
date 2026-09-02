# CLAUDE.md — Contesto di progetto Resonance

## Cos'è questo progetto
Resonance è un framework di auto-trascendenza personale (non gestione, non produttività)
organizzato in tre pilastri: BIO (salute), AIR (autonomia economica), VIDYA (crescita
cognitiva/creativa). Implementato come PWA in uso reale da due utenti (Flavio/Ghost e Marta).

## Stack tecnico — vincoli non negoziabili
- Preact + htm, **NESSUN build step**. Non introdurre bundler, non usare JSX che richiede
  transpilazione, non aggiungere dipendenze che richiedono compilazione.
- Storage: localStorage + Google Drive OAuth sync (drive.file, calendar, gmail.send scope).
- AI routing: OpenRouter multi-modello (produzione: Llama 3.3 70B).
- Deploy: Vercel via GitHub. Due branch: `main` (utente primario) e `stable` (secondo utente),
  progetti Vercel separati, merge sempre manuale **base: stable ← compare: main** (mai il
  contrario — errore già commesso in passato).

## Vincolo assoluto, hard-stop, mai negoziabile
**Nessuna integrazione o esposizione dell'identità professionale del Ghost (fisioterapista,
"PhysioAlba") con il pilastro AIR, in nessuna forma di output.** Vale per codice, contenuti
generati, commit message, nomi di variabili — qualunque cosa. Se un task tocca AIR e non sei
sicuro se rispetta questo vincolo, fermati e segnala invece di procedere.

## Regole di versioning
**Legge 14 — mai sovrascrittura distruttiva.** Ogni evoluzione documentale/strutturale importante
va come nuova istanza (V+1), non sovrascrivendo la precedente. Per il codice: commit chiari,
non forzare mai push distruttivi su `main` o `stable` senza che sia esplicitamente richiesto.

## Bug ricorrenti da non reintrodurre
- Non usare `<>...</>` (Fragment React) — mai importato in questo progetto Preact+htm senza
  build step, rompe il render silenziosamente. Usa sempre `<div>`.
- JSON da modelli economici (Llama/Kimi/DeepSeek) può contenere newline letterali che invalidano
  il parsing — verificare che extractJsonBlock/sanitizeJsonControlChars siano ancora in uso dove serve.
- Qualsiasi funzione di generazione contenuti deve ricevere esplicitamente la memoria procedurale
  rilevante nel prompt (bug già capitato: piano alimentare generato senza accesso a memory.bio).

## Checklist di consegna per ogni nuova feature
- **Aggiorna `APP_CAPABILITIES_CONTEXT` in app.js** (blocco iniettato nel system prompt dello
  Shell, stesso punto di `PILLAR_CTX`) con poche righe sulla nuova feature: cos'è, come si crea/
  attiva, cosa significano i suoi stati. Senza questo lo Shell non distingue "il Ghost parla di
  una funzionalità dell'app" da "il Ghost parla della sua vita/lavoro reale" — bug già osservato
  (26/07/2026) col rilascio della feature Semi: il Ghost ha scritto "sto testando i Semi nel
  pilastro AIR" e lo Shell ha risposto come se si riferisse alla vecchia strategia contenuti,
  ignaro che "Semi" fosse una feature appena costruita.

## Prima di ogni task
1. Leggi il codice esistente prima di proporre modifiche — non assumere, verificare.
2. Se il task è ambiguo o tocca il vincolo AIR/PhysioAlba, segnala invece di procedere.
3. Spiega sempre, alla fine, cosa hai cambiato e perché — in italiano.

## Come rispondere al Ghost (richiesta esplicita, 02/09/2026)
Denso, non lungo. Righe corte, una idea per riga, titoli e tabelle al posto dei paragrafi.
Niente premesse, niente riassunti di quello che ha appena detto, niente chiusure riepilogative.
**Sintetico senza perdere contenuto**: si tolgono le parole, mai i fatti. Se una riga si può togliere
senza perdere un fatto, si toglie; se toglierla perde un numero, una misura o un rischio, resta.
Vale anche per l'output dell'app (vedi MAGI_FORMA in app.js): stessa regola, stessa ragione.
