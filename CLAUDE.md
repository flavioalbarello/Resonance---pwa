# CLAUDE.md — Contesto di progetto Resonance

## Cos'è questo progetto
Resonance è un framework di auto-trascendenza personale (non gestione, non produttività)
organizzato in tre pilastri: BIO (salute), AIR (autonomia economica), VIDYA (crescita
cognitiva/creativa). Implementato come PWA in uso reale da due utenti (Flavio/Ghost e Marta).

## Stack tecnico — vincoli non negoziabili
- Storage: localStorage + Google Drive OAuth sync (drive.file, calendar, gmail.send scope).
- AI routing: OpenRouter multi-modello (produzione: Llama 3.3 70B).
- Deploy: Vercel via GitHub. Due branch: `main` (utente primario) e `stable` (secondo utente),
  progetti Vercel separati, merge sempre manuale **base: stable ← compare: main** (mai il
  contrario — errore già commesso in passato).

## Build step — una scelta, non un divieto (G.8, emendato il 12/08/2026)
**Nessun bundler in uso oggi**: Preact + htm da file vendored, si modifica `app.js` e si ricarica.

Da G.8 la scelta è **caso per caso e motivata, non una regola cablata**: introdurre un build step
richiede una proposta motivata, non un'eccezione a un divieto. Il conto di cosa si romperebbe —
il banco di prova per primo — è in `RAPPORTO_STATO` §13.

Questa voce stava fra i vincoli non negoziabili come *«NESSUN build step, non introdurre bundler»*
fino al 09/09/2026, quasi un mese dopo l'emendamento. Nessun test, lint o controllo CI l'ha mai
imposta: era cablata **solo qui**, ed è il file che istruisce ogni sessione. Finché è rimasta, la
libertà aperta da G.8 è stata chiusa in pratica.

## Identità professionale del Ghost — vincolo ALLENTATO il 02/09/2026

**Cosa diceva prima** (Legge 14: non si cancella, si registra): *«Nessuna integrazione o esposizione
dell'identità professionale del Ghost (fisioterapista, "PhysioAlba") con il pilastro AIR, in nessuna
forma di output.»* Divieto in blocco, senza eccezioni. Serviva a impedire che **un bug di questa
fase di sviluppo** producesse un danno reputazionale reale — non era una posizione, era un airbag.

**Cosa il Ghost ha dichiarato il 02/09/2026**, allentandolo ed enunciando il criterio che stava
sotto: *«finché non rischia di creare un danno reputazionale non ci sono problemi»*.

Quindi il divieto in blocco è sostituito dal criterio. In pratica:

**DENTRO — permesso.** Lo Shell può usare e nominare la competenza professionale. Si possono
costruire strumenti clinici (analisi posturale, valutazione del movimento) dentro BIO. La memoria
procedurale può tenerne traccia. Un plasmide può portare conoscenza di dominio fisioterapica.

**FUORI — resta chiuso**, e non per prudenza mia: è esattamente il criterio del Ghost, perché **il
danno reputazionale accade fuori**. Niente che leghi la sua identità professionale RICONOSCIBILE a
un'uscita verso il mondo — pubblicazione, invio, esportazione, prodotto, contenuto firmato — senza
un suo gesto esplicito su quella cosa precisa. Vale in particolare per gli **effettori AIR autonomi**
(Semi in esecuzione, Printify/Etsy, invio mail): sono la via per cui un bug diventa un danno, ed è
il motivo per cui il vincolo era nato. Quel motivo non è scaduto: l'app ha ancora difetti, e oggi
ne abbiamo trovati diversi.

**La distinzione operativa**, che il codice implementava già prima di questo documento (vedi
`redactProfessionalIdentity`, e la riga di Caspar in `runSeedGateCheck`):
- **"PhysioAlba"** — un NOME che identifica. Non esce.
- **"fisioterapista"** — una PROFESSIONE, non identifica nessuno. Può uscire, altrimenti nessuno
  strumento clinico sarebbe trasferibile e il pilastro AIR non potrebbe nemmeno nominare il dominio.

Se un task porta l'identità professionale **verso l'esterno**: segnala, non procedere.

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
- **Un banco trattenuto non si cita nella retroazione.** Se un controllo tiene da parte dei casi che
  il modello non deve vedere, il messaggio di errore non può riportarne il testo: in tre giri glieli
  consegna tutti. Si descrive la FORMA (`descriviForma`), mai il contenuto. Trovato dalla prova il
  04/09/2026, un'ora dopo aver scritto il banco stesso.
- **Un tetto che legge una fonte con un tetto non è un tetto.** Il tetto di spesa sommava le voci
  `ai-cost` dentro `debug-log`, che ne tiene 50: finestra dichiarata un mese, finestra reale sei
  turni, massimo riportabile 0,14 $ contro una soglia di 5. Non poteva scattare, e nessuno se ne
  sarebbe accorto perché il numero mostrato era plausibile. Un valore che GOVERNA una decisione non
  può venire da un registro a rotazione: vuole un totalizzatore suo (`spesa-mensile`, 12/09/2026).
  Vale per ogni soglia futura — prima di fidarsi del numero, guardare quanto vive la sua fonte.
- **Un valore di ritorno che nessuno guarda è un fallimento muto.** `saveKey` restituiva `false` a
  quota esaurita: 76 chiamate, zero controlli. Il caso peggiore era la compattazione della chat, che
  accorciava comunque la chat e scriveva un segnaposto con una chiave inesistente — la Legge 14 rotta
  in silenzio. La correzione NON è controllare 76 chiamanti (il 77° se ne dimentica): è rendere
  rumoroso il fallimento in un punto solo (bandiera + striscia rossa), e controllare il ritorno SOLO
  dove cambia la decisione. Se un fallimento non ha un modo di farsi vedere, non esiste.

## Accettore ed effettore — la regola, non solo il codice (dal Ghost, 04/09/2026)
*«devono avere una relazione biunivoca, un po' come accettore d'azione ed effettore d'azione in
Anochin, altrimenti ognuno dei due diventa solo un orpello»*

Vale per ogni futura coppia genera/controlla, non solo per i plasmidi:
- Il controllo **non sta a valle**. Si forma PRIMA, insieme alla decisione di agire, e **specifica**
  che forma dovrà avere il risultato. Un filtro a valle scarta e non insegna niente.
- **Un oggetto solo, letto due volte** (`lib/capitolato.js`): `detta` (come si dice al modello) e
  `verifica` (come si controlla) stanno nella stessa riga dello stesso array. Due scritture separate
  divergono entro un mese — è già successo col piano alimentare.
- **Held-out**: il requisito si dichiara, le prove si trattengono. Se il modello vede il banco, ci
  scrive sopra invece di risolvere.
- **Il disaccordo non si butta**: torna al modello come materia del giro seguente, e la rinuncia
  dopo il tetto **resta registrata**. «Non so ancora fare X» è una traccia legittima.
- Il guardiano dei dati personali sta **dove il dato entra** (`salvaPlasmide`), non dove esce.

## Checklist di consegna per ogni nuova feature
- **Aggiungi una scheda all'array `CAPACITA` in app.js** con poche righe sulla nuova feature: cos'è,
  come si crea/attiva, cosa significano i suoi stati.
  Dal 12/09/2026 non è più un blocco di testo unico: è un array, e nel prompt del turno ci va
  l'INDICE dei nomi più il nucleo più le schede che il turno nomina (−72% sul blocco). Quindi una
  scheda nuova vuole anche: un nome che sia un NOME (la prima parola fino ai due punti), `nucleo:
  true` solo se lo Shell deve poterla proporre senza essere interrogato, e un `k` scritto a mano se
  il nome è più lungo di quattro parole significative. Il banco (`tests/capacita.test.mjs`) dice da
  solo quando manca: verifica che ogni scheda si faccia trovare e che nessuna chiave si accenda su
  una frase di vita reale. Senza questo lo Shell non distingue "il Ghost parla di
  una funzionalità dell'app" da "il Ghost parla della sua vita/lavoro reale" — bug già osservato
  (26/07/2026) col rilascio della feature Semi: il Ghost ha scritto "sto testando i Semi nel
  pilastro AIR" e lo Shell ha risposto come se si riferisse alla vecchia strategia contenuti,
  ignaro che "Semi" fosse una feature appena costruita.

## Prima di ogni task
1. Leggi il codice esistente prima di proporre modifiche — non assumere, verificare.
2. Se il task è ambiguo o tocca il vincolo AIR/PhysioAlba, segnala invece di procedere.
3. Spiega sempre, alla fine, cosa hai cambiato e perché — in italiano.

## La direzione — perché il progetto è fatto così (dal Ghost, 02/09/2026)
Serve a decidere, non a essere citato. Senza questo si sbaglia inquadramento, ed è già successo due
volte nella conversazione in cui è stato spiegato.

- **L'unità è Adam**, non l'app e non la persona: Ghost (biologico) + Shell (digitale) come individuo
  emergente, più della somma. Non esistono "l'app di Flavio" e "l'app di Marta": sono **due Adam**.
- **Dove va**: *Adam City*, un ambiente **stigmergico**. Un Adam che accende il proprio faro si
  manifesta con ciò che sta diventando — **competenze E carenze** — depositato dallo Shell in
  funzione dell'attività reale, non dichiarato dal Ghost. Millantare è strutturalmente impossibile
  perché non c'è un campo da riempire. Le tracce non praticate **evaporano**.
- **Conseguenza operativa numero uno**: *«il modello dice a parole, il programma va a cercarlo
  davvero»* non è un'abitudine di ingegneria — è il substrato dell'intera idea. Tutto ciò che si
  costruisce dentro è la palestra di ciò che dovrà reggere fuori.
- **Le carenze sono portanti, non decorative.** «Sono fermo e mi serve X» è una traccia legittima
  quanto «so fare Y». Assistere un malato è una **traiettoria**, non un deficit di margine.
  Oggi gli osservabili sanno vedere solo chi produce cose: **manca la famiglia "stabilità
  mantenuta"** (una routine che regge, una crisi che non è successa). Il lavoro di cura e di
  manutenzione è definito da assenze, e un sistema che conta produzioni è cieco per costruzione.
- **I plasmidi non servono a rendere tutti uguali**, ma a dare a ciascuno ciò che gli serve. Chi
  riceve arricchisce nella propria condizione e ripassa: è l'ambiente che seleziona. Quindi il
  magazzino tiene **le varianti, non la migliore** — altrimenti è monocoltura.
- **Cosa deve sopravvivere a un cambio di substrato** (PWA → APK → altro): le forme dei dati, i
  contratti degli attacchi, le discipline. Preact/htm/localStorage/Worker sono sacrificabili.
- **Il nucleo che non cambia va scelto bene**: un sistema autopoietico accumula solo se qualcosa
  resta fermo. Ferme sono le **discipline**, non le funzionalità.

## Come rispondere al Ghost (richiesta esplicita, 02/09/2026)
Denso, non lungo. Righe corte, una idea per riga, titoli e tabelle al posto dei paragrafi.
Niente premesse, niente riassunti di quello che ha appena detto, niente chiusure riepilogative.
**Sintetico senza perdere contenuto**: si tolgono le parole, mai i fatti. Se una riga si può togliere
senza perdere un fatto, si toglie; se toglierla perde un numero, una misura o un rischio, resta.
Vale anche per l'output dell'app (vedi MAGI_FORMA in app.js): stessa regola, stessa ragione.
