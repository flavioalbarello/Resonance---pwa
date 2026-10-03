# Passaggio di consegne — 03/10/2026

Per la prossima sessione di Claude Code: leggi questo file **prima di tutto**. Contiene da dove si riparte, come,
e cosa non va rifatto.

Dopo questo leggi `CLAUDE.md` (le regole) e `android/PROGETTO.md` (il diario dell'APK, aggiornato fino al 03/10).
Questo file non li sostituisce: li riassume e dice cosa è aperto. Legge 14: non si sovrascrive. Il prossimo
passaggio sarà un file nuovo, con la sua data.

---

## 1. Ripartire in tre passi

1. **Il Ghost** apre una nuova sessione di Claude Code:
   - repository `flavioalbarello/Resonance---pwa`;
   - branch **`claude/new-session-w6u5wo`**: lì vive l'APK. `main` e `stable` sono la PWA e non si toccano.
2. **Il Ghost** mette nell'ambiente cloud della sessione le variabili del paragrafo 2: firma ed eventualmente la chiave
   di prova. Si fa dal menu dell'ambiente nella barra del titolo → Edit. Valgono dalla sessione dopo.
3. **La nuova sessione** legge questo file, `CLAUDE.md` e `android/PROGETTO.md`, poi ricostruisce il file di firma
   dalla variabile:
   `echo "$RESONANCE_KEYSTORE_B64" | base64 -d > /tmp/resonance.jks && export RESONANCE_KEYSTORE=/tmp/resonance.jks`

## 2. Accessi — nessun segreto in questo file

| cosa | dove sta | cosa fare |
|---|---|---|
| **GitHub** | l'app GitHub di Claude è già collegata all'account del Ghost | niente: una sessione nuova sul repo ha lo stesso accesso. Push solo sul branch dell'APK |
| Cassetta delle lettere | repo **privato** `flavioalbarello/Adam-lettere` (lettere = issue) | si aggiunge alla sessione con `add_repo` quando serve. Mai confonderlo col repo pubblico dell'app |
| **Chiave di firma dell'APK** | file `resonance.jks` e la sua password: il 03/10 stavano **solo nello scratchpad della sessione del 23/09–03/10** (`firma/`), che sparisce con la sessione. Il passaggio al Ghost come file è stato fermato dal controllo di sicurezza: decide lui come recuperarli. Forse sono anche nei segreti GitHub `RESONANCE_KEYSTORE_B64` e `RESONANCE_KEYSTORE_PASSWORD` (da qui non si è potuto verificare) | il Ghost li conserva **fuori dal repository**, che è pubblico. Per una sessione nuova servono le variabili d'ambiente `RESONANCE_KEYSTORE_B64` (il .jks in base64) e `RESONANCE_KEYSTORE_PASSWORD`. **Senza questa chiave gli aggiornamenti non si installano sopra l'app, e disinstallarla cancella i dati.** Impronta SHA-256 attesa del certificato: `efb77699c44ad99f1c95131c33eda3e15a9a7716d48c9f19e31fd6e27a444a36` |
| Chiave OpenRouter **di prova** | **non ancora creata**: richiesta dall'architetto il 03/10 | variabile d'ambiente `OPENROUTER_PROVA`, con un limite di spesa di 2–3 $ su openrouter.ai. Serve per provare le ricerche dal vivo prima di consegnare (paragrafo 5) |
| Chiave OpenRouter del Ghost, token GitHub dell'app | sul telefono, cifrati | non servono a Code e non escono mai |

## 3. Dove siamo

- **Ultima versione consegnata**: `2.261003.0119` (dev e base), commit `bb049f7`.
- **Banco**: 312 prove verdi in tutte e due le app. Lint senza errori.
- **Database**: versione 15.
- **Le due app**:
  - `dev`: l'app del Ghost, icona ambra, pacchetto `it.resonance.adam`;
  - `base`: per gli altri, icona blu, pacchetto `it.resonance.adam.base`, si costruisce solo da una versione promossa («promuovi»).
- **Modello principale del Ghost**: Kimi K2.6. Modello leggero: Gemini 3.1 Flash Lite. Ricerca: Perplexity Sonar; ricerca a fondo: Sonar Pro.
- **Routine «Cassetta di Adam»** (`trig_01TnsNTGYSP56GJ8hFNnDmBt`, risposte dell'architetto alle lettere): **spenta dal 01/10**.

### Consegna di un APK (procedura in uso)

```
cd android
./gradlew testDevDebugUnitTest testBaseDebugUnitTest lintDevDebug lintBaseDebug --continue --no-configuration-cache -q
RESONANCE_KEYSTORE=… RESONANCE_KEYSTORE_PASSWORD=… ./gradlew assembleDevRelease assembleBaseRelease --no-configuration-cache -q
/opt/android-sdk/build-tools/36.0.0/apksigner verify --print-certs app/build/outputs/apk/dev/release/app-dev-release.apk   # impronta come sopra
```

- Copia gli APK nella radice come `resonance-{dev,base}-<versione>.apk`, mandali al Ghost come allegato, poi cancellali.
- Il numero di versione lo calcola il build dall'ora dell'ultimo commit: **commit prima di costruire**.
- Mai la password stampata in chat, mai la chiave nel repository.

## 4. Cosa è stato fatto in questa chat (23/09 → 03/10)

Il dettaglio è in `PROGETTO.md`, con le sezioni datate. Qui l'ordine.

| quando | cosa | commit |
|---|---|---|
| 23–30/09 | Nascita dell'APK: Room, Shell e OpenRouter, sensi da Health Connect, battito, riunione a tre, cassetta, consulente, Balthasar, lavagna, consegne, temperatura per compito, registro dei turni | (vedi `git log`) |
| 01/10 | Riunione del 01/10: Sono via, domanda della domenica, terreno di Adam City; lente dell'esoscheletro; due app da un codice solo; risposte dalla notifica; istruzioni per gli altri utenti; meno schede; significato dei pilastri; nome dello Shell; tour del primo avvio; icona blu per la base | `077e2cb` → `5d91f93` |
| 01–02/10 | Ricerca web dello Shell e **Segui**; listino dei modelli vivo, con avvisi di scadenza; modello per compito; ricerca a fondo a strati, proposta e autorizzata | `a1da5f0` → `a17d733` |
| 02/10 | Lo Shell non dice più «non ho internet»; ricerca a fondo che dice perché fallisce, in parallelo, con Perplexity e in un lavoro di sistema | `e247a14`, `f922980` |
| 02/10 | Una ricerca per paese; la scheda della ricerca chiusa in chat | `5254ba9` |
| 02/10 | **Reparti**: prompt più leggero del 59–69% (nucleo e reparti scelti dal programma) | `97046bb` |
| 02–03/10 | **Incrocio**: un motore sotto ogni ricerca (caselle, elementi a righe, stesse cose riconosciute in fonti diverse, fonti indipendenti contate, contrasti detti); OpenStreetMap come fonte | `bb049f7` |

## 5. Cosa è successo il 02–03/10, e cosa ne viene (la parte da non perdere)

**Il fatto.** Il Ghost ha chiesto dove trovare il vino *Mannaja Cane 2023* (Regina del Quartuccio) entro 50 km da
Canale Monterano.
- La ricerca rapida ha risposto «solo online».
- Ha inventato che la cantina fosse a Campagnano di Roma; è nella Tuscia viterbese.
- La ricerca a fondo ha speso 5 strati su tipi di fonte senza senso per un vino («dati ufficiali», «notizie»). Lo Shell ha anche scritto «è pronta, premi Conferma» quando era solo una proposta.

**Il vino era nella carta del ristorante dove il Ghost cenava quella sera**: `https://salottobelvedere.it/carta-vini/`,
«Mannaja Cane 2023 (Sangiovese, Violone, Aleatico) Regina del Quartuccio 28€». Il Salotto Belvedere era
nell'elenco della ricerca della sera prima, e le fonti dicevano «carta di vini biologici e naturali».

**Perché nessuna ricerca l'ha trovato** (verificato dall'architetto il 03/10):
- il sito protegge le pagine con una pagina anti-robot (SiteGround), quindi una richiesta semplice riceve solo quella;
- i motori di ricerca non hanno indicizzato la carta.

**Un browser vero (Chromium, Playwright) supera la pagina anti-robot in pochi secondi e trova il vino.**
Lo script di prova era nello scratchpad della sessione; si rifà in dieci righe:
1. `goto`;
2. attendere che l'URL non contenga più `sgcaptcha`;
3. leggere `document.body.innerText`;
4. cercare il nome.

### Lezioni (errori da non ripetere)

| errore | regola |
|---|---|
| Ogni versione della ricerca è stata consegnata **senza una sola ricerca vera**: il collaudo l'ha fatto il Ghost, a sue spese | **Nessuna consegna di funzioni di ricerca o del modello senza averle provate dal vivo** con `OPENROUTER_PROVA`, su un gruppo di domande vere (il vino, i ristoranti etnici, le Mustang, i trichechi) |
| Soluzioni modellate su un caso solo: la forma della borsa con Gazprom, i tipi di fonte coi trichechi | provare sempre su ambiti diversi, e tenerne da parte qualcuno che non si usa per progettare |
| Il programma chiede solo ai motori di ricerca | per «dove trovo X», **andare a vedere**: aprire i siti dei candidati con un browser vero |
| Il modello leggero inventa azioni («ho registrato nel diario») | rifare il turno col modello principale quando dichiara un'azione che non ha fatto |
| Lo Shell inventa luoghi e distanze | ciò che nella risposta non sta nelle fonti va segnalato dal programma |
| Errori nascosti, esempi copiati dal modello, tutte le città in una domanda | già corretti: vedi `PROGETTO.md`, sezioni del 02/10 |

### Prossimi passi, in ordine

**Prima di ogni passo**: l'ok del Ghost. Ha chiesto di fermarsi e discutere quando c'è qualcosa di importante.

1. **«Andare a vedere sul posto»**, proposto il 03/10, in attesa di conferma.
   - Per «dove trovo X» il programma raccoglie i candidati nel raggio, dalla mappa e dall'incrocio.
   - Apre i loro siti con il browser interno di Android (WebView), che supera pagine anti-robot come quella del Salotto.
   - Legge menu, carte e PDF, cerca il nome esatto, risponde col link.
   - Prima prova del banco: la carta del Salotto Belvedere.
2. Il **gruppo di prove dal vivo** con `OPENROUTER_PROVA`, appena il Ghost la mette.
3. Ricerca a fondo **senza tipi di fonte obbligati**: gli strati li decide la domanda (posti, siti, produttore).
4. **Luoghi e distanze nella risposta controllati** contro le fonti.
5. **L'azione, non il consiglio**: «chiedi alla cantina» diventa la bozza della mail.
6. **Turno rifatto col modello principale** quando il leggero inventa un'azione.
7. **Memoria delle caselle per 24 ore**, per non pagare due volte la stessa ricerca. Il Ghost accetta 4–6 centesimi a ricerca se basta farla una volta.
8. **L'esito che torna indietro**: «siamo venuti al Salotto Belvedere, ottimo, 200 € in 4».
   - Lo Shell lo collega all'ultima ricerca.
   - Il programma registra la posizione in lista, le fonti, il giudizio e il costo.
   - Col tempo, quali fonti ci prendono col Ghost.
9. **Il piano della ricerca a un modello più forte**, con un controllo del programma (zona senza mappa né caselle per paese → rifare).
10. **I minuti d'auto** con OSRM, al posto della linea d'aria.

## 6. Promemoria per la prossima riunione

La tabella completa, con il nodo di ciascun argomento, è in `PROGETTO.md` → «Per la prossima riunione». I titoli:

1. **Le consegne dello Shell** non funzionano, o così sembra.
2. **Le descrizioni dei nomi dei pilastri**: rivederle e correggerle (`logica/Significati.kt`).
3. **Il tour del primo avvio**, dopo la prova sul telefono.
4. **Una «decisione» nel taccuino evapora** come un'ipotesi.
5. **I colori dell'icona**: dev ambra, base blu.
6. **Salvare un Adam se il telefono si rompe**. È la carenza più grave: oggi c'è solo la copia a mano.

Da aggiungere alla riunione, nato il 03/10: **l'architettura della ricerca**.
- Il piano al programma (ricette), il modello solo dove serve.
- Andare a vedere sul posto.
- Il collaudo dal vivo prima di ogni consegna.

## 7. Come lavorare col Ghost

- Italiano, denso: righe corte, tabelle, niente premesse, niente riassunti di ciò che ha detto. Le regole sono in `CLAUDE.md`.
- La rabbia del Ghost segnala un fallimento vero, quasi sempre di sostanza. Si risponde coi fatti verificati, non con
  scuse né con altre proposte non provate.
- Verificare prima di affermare. Se un fatto non è stato provato, va detto.
- Vincoli che restano:
  - «PhysioAlba» non esce mai; «fisioterapista» sì;
  - i dati dei pazienti mai;
  - i dati di Marta solo il minimo che il Ghost dice di scrivere, niente sulle figlie;
  - ogni azione verso il mondo vuole un gesto del Ghost;
  - la ricerca a fondo è sempre autorizzata da lui;
  - il merge è sempre base `stable` ← compare `main`, mai il contrario, e `android/` non va in `main`/`stable` senza richiesta.
