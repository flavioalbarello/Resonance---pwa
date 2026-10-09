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
| **Chiave di firma dell'APK** | file `resonance.jks` e la sua password: **li ha il Ghost**. Glieli ha dati la sessione precedente, e lui li ha caricati in questa il 23/09 (nello scratchpad, `firma/`). La copia nello scratchpad sparisce con la sessione; quella del Ghost resta. Forse sono anche nei segreti GitHub `RESONANCE_KEYSTORE_B64` e `RESONANCE_KEYSTORE_PASSWORD` (da qui non si è potuto verificare) | il Ghost li conserva **fuori dal repository**, che è pubblico. Per una sessione nuova: o li carica di nuovo come il 23/09, o li mette nelle variabili d'ambiente. In quel caso servono le variabili d'ambiente `RESONANCE_KEYSTORE_B64` (il .jks in base64) e `RESONANCE_KEYSTORE_PASSWORD`. **Senza questa chiave gli aggiornamenti non si installano sopra l'app, e disinstallarla cancella i dati.** Impronta SHA-256 attesa del certificato: `efb77699c44ad99f1c95131c33eda3e15a9a7716d48c9f19e31fd6e27a444a36` |
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

**Gli occhi di Adam**. Decisione della riunione del 01/10 (verbale nella cassetta, `riunioni/20261001-0836-…`):
- occhiali **in pausa**: anche spenti, una telecamera sul viso può mettere a disagio i pazienti;
- in studio occhi e orecchie spenti, in modo visibile.

Il 05/10 il Ghost ha proposto auricolari aperti con telecamera, di marca generica.
- Audio: funzionerebbero come cuffie Bluetooth normali.
- Telecamera: quasi certamente passa solo dalla loro app, senza accesso per Resonance.
- Vantaggio: si tolgono in studio senza perdere la vista.
- Va verificato col venditore prima di comprarli: nome dell'app, foto nella galleria, uso senza cloud.

Dalla stessa riunione, da non ridiscutere da capo:
- **una telecamera non facciale** (spilla, collana, orecchio) in studio non spaventa meno, spaventa di più, perché non si riconosce;
- **criteri** per qualunque oggetto: copertura fisica della telecamera, che si chiude con un dito e si vede; microfono spento con un tasto; lenti progressive montabili, se è un occhiale;
- **due livelli**: al lavoro niente sensi, o spenti in modo visibile; a casa e fuori, gli occhiali oppure il **corpo di Adam**, cioè un vecchio telefono Android fisso su un supporto, dove si suona o si cucina, a costo quasi zero;
- la **modalità studio** nell'app serve con qualunque scelta.

Ultima scelta dichiarata prima della pausa: Meta Fury, poi rimessa in revisione dal Ghost.

Il 05/10 il Ghost: il vecchio telefono va bene in casa, ma fuori è ingombrante e occupa una mano. Strade per fuori,
con mani libere, da togliere in studio:
- il **telefono principale a tracolla** (custodia da collo con la fotocamera libera), più un comando a voce «guarda» in Resonance che scatta e manda allo Shell. Costo zero: è la prova per capire se le sbirciate servono, prima di comprare;
- una **telecamera a clip con API ufficiale** (GoPro con Open GoPro). Correzione del 05/10: l'SDK Android di Insta360 copre le 360 (X5, X4…), **non** le GO;
- i **Meta col kit sviluppatori**;
- le **cuffie generiche**: voce sì, occhi quasi certamente no.

Il 05/10 il Ghost: niente telefono al collo («un'ostrica, quando basta la perla»). La perla candidata:
- **OpenGlass / omiGlass**, progetto aperto di Based Hardware: una schedina Seeed XIAO ESP32S3 Sense (fotocamera e microfono, grande come un'unghia, circa 20 $) con batteria e guscio, da agganciare alla montatura, al colletto o al cappello;
- parla col telefono via **Bluetooth Low Energy con un protocollo aperto**, quindi Resonance la può leggere direttamente, senza l'app di nessuno;
- limiti: è un progetto da assemblare, la fotocamera è modesta (2–5 MP, basta per etichette e oggetti), la batteria dura poche ore;
- condizioni: una luce visibile quando scatta, scatti solo a comando («guarda»), mai registrazione continua. La discrezione non deve diventare una telecamera nascosta per chi sta intorno;
- in studio si sgancia: le lenti restano, la perla va in tasca;
- nulla di provato da qui.

Il Ghost conferma il concetto (05/10): **una microcamera da indossare che parla con l'APK**. Il contratto, che resta
anche se cambia l'oggetto:
- l'APK chiede «scatta» via Bluetooth;
- la camera risponde con la foto (JPEG) e il livello della batteria;
- luce accesa mentre scatta;
- un tasto sulla camera per scattare a mano;
- niente resta salvato sulla camera, e una foto va allo Shell solo a comando.

Primo pezzo: XIAO ESP32S3 Sense, batteria LiPo piccola, guscio con clip (circa 25–35 €).
Risposte del Ghost (05/10): ha un computer con Chrome; la saldatura la prova lui o un amico.
- Domanda sua: si usa insieme agli auricolari (JBL Wave Flex)? Sì. Gli auricolari usano il Bluetooth classico (audio),
  la camera il Bluetooth Low Energy, e il telefono li tiene insieme come fa con un orologio.
- Da provare: mentre passa una foto (pochi secondi) l'audio può avere un piccolo scatto su alcuni telefoni.
- Ripiego, se serve: foto via Wi-Fi, al prezzo di più batteria.

**Attivazione silenziosa** (il Ghost, 05/10: *«corro per le campagne, incontro animali, se mi metto a chiacchierare scappano»*).
La voce non può essere l'unico comando. Tre modi, tutti nel contratto:
1. un **tasto sulla camera**: si tocca la clip e scatta, in silenzio. È il modo principale;
2. un **tocco sugli auricolari**: un gesto dei JBL che l'app intercetta come comando multimediale. Da provare: litiga con la musica;
3. la **voce** («guarda»).
Aspettative: la fotocamera di serie (2 MP) riconosce un animale vicino; non fa foto naturalistiche da lontano. Esiste un
modulo da 5 MP per la stessa scheda, da verificare.

**La luce**: anche questa si comanda in silenzio (il Ghost, 05/10, per gli animali).
- Accesa di serie quando scatta.
- Si spegne con un gesto del Ghost: pressione lunga sul tasto della camera, o un interruttore nell'app. Il diario registra quando è stata spenta.
- Si riaccende da sola dopo un tempo scelto, o alla fine dell'uscita.
- In studio la camera è spenta del tutto: la luce lì non c'entra.
- Le persone intorno restano il criterio: luce spenta solo quando ci sono gli animali, non quando ci sono le persone. La regola è del Ghost; il programma tiene la traccia.
- Pezzo in più: un LED esterno da 3 mm (o SMD) con resistenza da 220 Ω, perché quello della scheda resta chiuso nel guscio.

**La lista dei pezzi** mandata al Ghost il 05/10, circa 35–50 € senza attrezzi:
- XIAO ESP32S3 Sense;
- facoltativo, modulo camera OV5640;
- LiPo 3,7 V da 250–400 mAh con protezione;
- microinterruttori a pulsante;
- interruttore a slitta;
- guscio stampato in 3D con clip;
- cavo USB-C per dati.
Attrezzi, se mancano: saldatore a punta fine, stagno, flux, guaina termorestringente, tester., collegato al telefono del Ghost (05/10, solo proposta, nulla di costruito):
- non fa girare Resonance intera, perché due telefoni sarebbero due Adam: fa da **sensore** (sentinella);
- collegamento consigliato: **Nearby Connections** di Google, telefono a telefono in casa, senza internet né server, cifrato, abbinati una volta;
- la sentinella giudica sul posto e manda **righe di testo** («prova di basso, 25 minuti, 21:10»), non video; le foto solo su richiesta;
- se il telefono del Ghost non c'è, le righe aspettano e partono quando torna;
- alternative scartate: la cassetta su GitHub (lenta, e le foto finirebbero in un repository); una cartella su Drive (serve lo stesso account Google su tutti e due);
- da decidere: è una terza app (flavor «sentinella») o una modalità? La regola delle due app dice niente interruttori dentro l'app;
- da provare: quanto il telefono del Ghost riesce a ricevere in secondo piano, coi limiti di Android.

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
