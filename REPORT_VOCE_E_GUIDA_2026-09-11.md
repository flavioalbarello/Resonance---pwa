# Report — voce pulita, meno struttura, e la domanda sull'APK

**Data:** 11/09/2026 · **Build:** `2026-09-11 · la-voce-non-legge-gli-asterischi`
**Brief:** `BRIEF_VOCE_E_MODALITA_GUIDA_20260910` · **Commit:** `3d38d60`

Ordine eseguito: **B → A → C → E → D**, come da §I.

---

## 1. Le prove

**627 verdi, 133 suite, 27 file** — erano 601. **+26.**
`node --input-type=module --check < app.js`: verde. Nessuna delle 601 è diventata rossa.

| file | cosa |
|---|---|
| `tests/voce.test.mjs` | **nuovo** — 26 prove: B (22) e C (4) |
| `app.js` | `perLaVoce`, `tabellaParlata`, dentro `speakText`; una riga di `responseFormat`; `APP_CAPABILITIES_CONTEXT` |
| `prova-voce.html` | **nuovo** — il banco di A |
| `tests/lib/build-testable.mjs` | +5 nomi |

`CACHE` in `sw.js` **non toccato**: nessun file `lib/` è cambiato. `prova-voce.html` **non** è nel precarico di proposito — è un banco, non parte dell'app.

---

## 2. B — il testo che va alla voce

### Dov'è, e perché lì

Il 🔊 partiva da **tre** posti: i Magi, la chat, la lettura proattiva della Simbiosi. **Solo uno dei tre spogliava**, in linea, con una regex scritta sul posto. Gli altri due mandavano markdown grezzo — lo schermo disegnava il grassetto, la voce leggeva gli asterischi.

`perLaVoce` sta **dentro `speakText`**, che è l'imbuto di tutti e tre. Un quarto chiamante non può dimenticarsene. La spogliatura in linea dei Magi è stata tolta: era duplicazione.

### Le tabelle — la scelta, e perché

Le tre opzioni, con il conto:

| opzione | esito |
|---|---|
| Togliere le barre | *«Atto Temi I Mitosi Prima del nome Pulsazione II Differenziazione…»* — illeggibile ad alta voce quanto la tabella grezza |
| Dichiararle non leggibili | **il piano alimentare È una tabella**: la voce tacerebbe proprio dove serve di più, cioè il menu della settimana mentre si guida |
| **Parlarle** ← scelta | *«Pasto: Colazione, Piatto: uova e pane, kcal: 420.»* |

La ragione della terza: **ad alta voce l'intestazione è l'unica cosa che rende un valore comprensibile.** Senza, «124,5» non si sa se sono chili o calorie. Senza riga d'intestazione si ripiega sui soli valori separati da virgole — il confine di riga resta, segnato dal punto finale.

### Gli elenchi — il trattino via, la pausa resta

La sintesi del browser fa pausa sulla **punteggiatura di fine frase, non sull'a capo**. Un elenco senza punti diventa una frase unica lunghissima. Quindi ogni voce che non finisce già con un segno ne riceve uno; una riga normale **non** lo riceve (sarebbe un'invenzione).

> **Nota onesta, richiesta dal brief.** Il brief chiedeva di *«verificare cosa fa il motore di sintesi con la punteggiatura prima di decidere»*. **Non l'ho potuto misurare: in questo ambiente non c'è audio.** La regola sopra è il comportamento documentato di SpeechSynthesis, non una misura mia. Il secondo pulsante di `prova-voce.html` legge proprio un elenco e una tabella: **la durata della pausa la senti tu, in trenta secondi.**

---

## 3. La verifica di rottura

| rottura | prove rosse |
|---|---|
| Le tabelle tornano a spianarsi | **7** |
| Via il punto che separa le voci di elenco | **3** |
| Via la regola sulla struttura dal prompt (C) | **1** |
| Una tabella dentro `APP_CAPABILITIES_CONTEXT` (C) | **1** |
| **`speakText` non spoglia più** | **0** |

### La quinta riga, e perché stavolta è diversa

Staccando `perLaVoce` da `speakText` — cioè **rimettendo esattamente il difetto di oggi** — il banco resta verde. `perLaVoce` è provata come **funzione**, non nel suo **punto d'innesto**.

**È la terza volta che questa stessa forma di buco si presenta:**

| | proprietà d'ordine non difesa |
|---|---|
| 09/09 | `runSeedGateCheck` gira prima dell'effettore |
| 10/09 | `smentisciAssenzaDiMateriale` è invocata nella catena del turno |
| 11/09 | `perLaVoce` è invocata da `speakText` |

Tre occorrenze non sono tre incidenti: sono **un limite strutturale del banco**. Il banco prova funzioni pure; non raggiunge l'interno di `runShellTurn` né di `speakText` perché i binding di un modulo ES non sono sostituibili dall'esterno. Ogni «X viene chiamato da Y» resta indifeso.

Lo segnalo come tale, non lo correggo: la soluzione è l'iniezione delle dipendenze, ed è un cambiamento di struttura.

---

## 4. C — la riga prima e dopo

**Prima:**

> La prima riga va dritta al punto. **Grassetto solo sulle parole che portano informazione.**

**Dopo:**

> La prima riga va dritta al punto. **FORMA PREDEFINITA: PROSA BREVE, una idea per frase.** In una risposta di conversazione NON servono intestazioni, non servono tabelle, e il grassetto si usa solo dove una parola porta un dato che si perderebbe (un numero, un nome, un rischio) — mai per dare ritmo. La struttura si usa SOLO quando il contenuto È davvero un elenco, o quando il Ghost ha chiesto una tabella: allora sì, ed è giusta. Il motivo non è estetico: il Ghost ascolta le risposte a voce mentre guida, e i marcatori letti ad alta voce sono rumore. Un titolo in mezzo a tre righe di risposta è rumore anche sullo schermo. **Non ti riguarda invece la struttura che compone il PROGRAMMA** (la griglia del piano alimentare, i riquadri, le tabelle dei documenti): quella è una capacità dichiarata, non decorazione tua.

Il precedente dei Magi è stato guardato prima di inventare (§C.3 del brief): `MAGI_FORMA` risolve lo stesso problema con un **tetto di parole per ruolo**. Per lo Shell un tetto sarebbe sbagliato — alcune risposte hanno legittimamente bisogno di lunghezza. L'analogo giusto è dichiarare la **forma predefinita** e l'**eccezione**, che è quello che è stato fatto.

### Quello che il brief chiedeva di riportare

**Nessun pezzo di prompt richiede il markdown.** Cercato in tutto `app.js`: l'unica menzione era proprio la riga sostituita, e tutti gli altri riscontri sono commenti di codice o il costruttore delle tabelle `.docx`.

**`APP_CAPABILITIES_CONTEXT` non insegna il formato pesante.** Misurato: **0 intestazioni, 0 righe di tabella, 0 grassetti** in 72 righe. Non andava toccato, e non l'ho toccato — ma ora una prova lo pinta: se qualcuno ci mette una tabella, diventa rossa.

---

## 5. A — il banco microfono

**Dove:** `prova-voce.html`, nella radice del progetto. **Come si apre:** stesso dominio della PWA, quindi `…/prova-voce.html` — l'indirizzo dell'app con `/prova-voce.html` in fondo. Sullo stesso dominio **di proposito**: i permessi del microfono sono per origine, e una prova fatta altrove non direbbe niente su cosa succede dentro Resonance.

Le istruzioni sono **scritte dentro la pagina**: da fermo, motore acceso, telefono collegato come sempre; tre condizioni (in mano / in tasca / in tasca con finestrino aperto); frase di prova sempre la stessa, *«Apri il percorso del concept album e leggimi l'atto quarto»* — contiene un ordinale e un titolo lungo, i due casi che contano.

Misura tre fatti:

1. **Quale microfono usa davvero** — letto dalla *traccia vera* di `getUserMedia`, non dall'elenco dei dispositivi: l'elenco non dice quale sia il predefinito quando l'auto è collegata.
2. **Quanto capisce** — trascrizione a schermo, testo grande, con registro copiabile.
3. **Da dove esce la voce** — due pulsanti; il secondo legge un testo con tabella ed elenco, così senti anche la spogliatura di §B.

**Limite scritto nella pagina, non nascosto:** il riconoscimento vocale del browser sceglie da sé l'ingresso predefinito e **non si può puntare su un dispositivo preciso**. Qui si misura *quale sia* il predefinito — che è il fatto che serve.

Verificata nel browser: carica, nessun errore, nessuna risorsa esterna (solo la favicon), e la spogliatura dentro la pagina dà lo stesso risultato di quella di `app.js`.

---

## 6. E — il parere sull'APK

Ogni punto marcato: **[FATTO]** misurato o letto nel codice · **[SUPPOSIZIONE]** ragionamento non verificato qui.

### 1 · Cosa regge nella PWA e cosa no

| capacità | PWA |
|---|---|
| Riconoscimento vocale in italiano | **[FATTO]** c'è: `webkitSpeechRecognition` su Chrome Android |
| Sintesi vocale | **[FATTO]** c'è, già in uso |
| Schermo acceso senza tocco | **[FATTO]** Wake Lock API, disponibile su Chrome Android |
| Un gesto all'avvio | **[FATTO]** funziona |
| **Scelta del microfono** | **[SUPPOSIZIONE]** funziona *peggio*: il riconoscitore prende il predefinito. **È esattamente ciò che A misura** |
| **Schermo spento** | **[SUPPOSIZIONE]** non funziona: a schermo spento la pagina viene sospesa |
| **Pulsante del volante** | **[SUPPOSIZIONE]** non funziona: il browser non riceve i comandi media hardware in modo affidabile |

Le prime quattro righe dicono una cosa sola: **la modalità guida come descritta in §D regge nella PWA.** Le tre incerte sono ottimizzazioni, non il nucleo.

### 2 · Il microfono Bluetooth, e se un APK aiuta

**[SUPPOSIZIONE, ma motivata].** Android espone la scelta dell'ingresso audio a un'app nativa (`AudioManager`, `setCommunicationDevice`) in un modo che il browser non espone. Quindi **sì, in linea di principio un wrapper nativo può scegliere il dispositivo.**

Ma c'è un però che conta più della risposta: **un wrapper tipo WebView non eredita quella capacità gratis.** Servirebbe un ponte nativo fra la WebView e l'API audio, e il riconoscimento vocale dovrebbe passare da quello invece che dal Web Speech API — cioè **riscrivere il riconoscimento, non incapsularlo.**

**E potrebbe non servire affatto.** Se A dice che il browser prende già il microfono dell'auto, questo punto sparisce. **Non si progetta niente qui prima di A.**

### 3 · Schermo spento

**[SUPPOSIZIONE].** Un APK con servizio in primo piano può tenere l'app viva a schermo spento. Il costo visibile: **una notifica persistente** che l'utente non può togliere. Su Android è il prezzo fisso di quel permesso.

Il brief ha già escluso il wake word per questo identico motivo. **Lo stesso ragionamento vale qui** — e con una differenza a sfavore: a schermo spento non puoi nemmeno *mostrare*, quindi il vincolo di §D (nessuna azione con gate a voce) diventerebbe permanente.

### 4 · Pulsante del volante

**[SUPPOSIZIONE].** Un APK può riceverlo: i comandi media Bluetooth arrivano come eventi media, e un'app che registra una `MediaSession` con un servizio li intercetta. Nessun permesso speciale.

**Nella PWA, la `MediaSession` API esiste** ma è pensata per il controllo di un audio in riproduzione, e usarla come pulsante generico è un dirottamento fragile. **[FATTO]** non l'ho provata.

Questo è il punto dove l'APK ha il vantaggio più netto e meno ambiguo.

### 5 · Il costo sul ciclo di lavoro — il punto che conta

**[FATTO], misurato adesso:**

| | oggi |
|---|---|
| Controllo sintassi | **58 ms** |
| Banco completo, 627 prove | **5,3 secondi** |
| Modifica → ricarica → guarda | nessun passaggio intermedio |

`RAPPORTO_STATO` §13 indica questo come il motivo per cui i difetti si trovano in minuti. **Questa sessione ne è la prova:** i quattro difetti di ieri sono stati riprodotti, corretti e verificati nello stesso giro perché fra la modifica e la misura non c'è niente.

**Con un APK si aggiungono: un passaggio di compilazione, un'installazione sul telefono, e il telefono nel ciclo.** Da secondi a minuti, e da «guardo» a «installo e guardo».

**[FATTO] `tests/lib/build-testable.mjs` legge `app.js` come testo** (`readFileSync`, riga 137) e lo filtra per riga. Con un bundler o con JSX quel meccanismo **non esiste più**: 179 righe da riscrivere prima che una sola delle 627 prove torni verde.

**Serve un build step?** Per un APK che sia un wrapper WebView: **[SUPPOSIZIONE] no**, si può incapsulare la PWA com'è. Per un APK che risolva il punto 2 (microfono) o il punto 4 (volante): **sì**, perché serve codice nativo. G.8 permette di valutarlo; il conto è quello qui sopra.

### 6 · Cosa si romperebbe — conto, non impressione

| | cosa succede |
|---|---|
| **Banco di prova** | **[FATTO]** dipende da `app.js` leggibile come testo. Wrapper WebView: intatto. Con build step: 179 righe da rifare, 627 prove ferme nel frattempo |
| **`sw.js`** | **[FATTO]** 17 voci di precarico scritte a mano. In una WebView il service worker funziona ma diventa ridondante; con nomi di file con impronta, si rompe |
| **Sincronizzazione Drive** | **[SUPPOSIZIONE]** regge: è `fetch` verso `googleapis.com`, indipendente dal contenitore |
| **OAuth** | **[FATTO, e il rischio più concreto]** il client è di tipo **web**, autorizzato per **origine**. **[SUPPOSIZIONE]** un APK non ha un'origine `https://`: servirebbe un client Android separato, con impronta di firma. **Non è un dettaglio: è rifare l'autenticazione.** Va verificato in Console, non dedotto |
| **`localStorage`** | **[FATTO]** 25 usi. In una WebView persiste, ma **è legato al contenitore**: i dati della PWA non migrano da soli. Servirebbe un'esportazione e un ripristino — che per fortuna esistono già (`buildFullBackup` / `restoreFullBackup`) |

### 7 · La raccomandazione di sequenza

**Cosa farei, in ordine:**

1. **Eseguire A.** Costa dieci minuti da fermo e decide tutto il resto. Finché non è fatta, ogni discorso sull'APK è speculazione — inclusa la mia.
2. **Se A va bene** (il browser prende il microfono dell'auto): **costruire la modalità guida nella PWA** come da §D. Regge, e costa zero sul ciclo di lavoro.
3. **Se A va male**: prima di pensare all'APK, provare le vie a costo basso — un microfono Bluetooth dedicato, o il telefono su supporto invece che in tasca. **Un cambio di substrato per un problema di posizione del telefono sarebbe sproporzionato.**

**Cosa non farei affatto, oggi:**

- **L'APK come wrapper WebView.** Costa l'OAuth da rifare e la migrazione dei dati, e **non risolve nessuno dei tre punti incerti** — perché una WebView ha gli stessi limiti del browser. Sarebbe il costo senza il guadagno.
- **Lo schermo spento.** Il brief ha già escluso il wake word con l'argomento giusto; questo ha lo stesso profilo, più il problema che a schermo spento il gate non è soddisfacibile.
- **Il build step, in questo giro.** Non perché sia vietato — G.8 lo permette — ma perché il suo unico beneficio qui sarebbe abilitare codice nativo, e non sappiamo ancora se serve.

**In una riga:** l'APK è la risposta a **una** domanda (il pulsante del volante) e forse a una seconda (il microfono). Nessuna delle due è ancora una domanda aperta, perché A non è stata eseguita.

---

## 7. D — il disegno della modalità guida

**Non costruito, come da §D e §F.** Serve solo a rendere A significativa.

### Il principio

`AZIONI_CONVERSAZIONALI` è un registro chiuso di **quindici** voci. «Apri percorsi» **non è una capacità nuova**: è un altro modo di emettere un'azione che esiste già. La disciplina resta: la voce propone, **il programma cerca ed esegue**, e se non trova lo dichiara.

Il lavoro vero non è il riconoscimento: è la **tolleranza della mappatura**. «apri il percorso del concept album» deve arrivare dove arriva «apri Divenire». Il pezzo che serve esiste già ed è stato **appena riparato**: `cercaNellaMemoria` con la sequenza nel titolo e i numeri cercabili (10/09). Un titolo detto a metà ora pesca il documento giusto.

### La forma

```
un gesto prima di partire
   └─ impronta → app → "modalità guida"
         ├─ Wake Lock             (schermo vivo, nessuno sguardo richiesto)
         ├─ riconoscimento continuo
         ├─ ogni frase → selettore di azione ESISTENTE
         │     ├─ azione trovata e senza gate  → esegue, e lo DICE a voce
         │     ├─ azione trovata CON gate      → SOSPESA E IN CODA
         │     └─ nessuna azione               → risposta parlata normale
         └─ all'uscita: la coda si presenta sullo schermo, una per una
```

### Il vincolo non negoziabile

**A voce, nessuna azione con `richiedeGate` o irreversibile può partire.**

C.10 dice che il sistema *si ferma e mostra*. Se il Ghost non guarda lo schermo, **non si può mostrare**: la condizione del gate non è soddisfacibile, quindi l'azione non è autorizzabile. Va **sospesa e messa in coda**, e presentata quando il Ghost torna a guardare.

Le etichette `richiedeGate` e `reversibile` **sono già lette davvero** dal codice (corretto il 22/08): il meccanismo c'è, serve solo agganciarlo alla modalità.

### Le tre cose da misurare prima di costruire

1. **Il microfono** — è A.
2. **Il Wake Lock in batteria.** Da verificare se convenga tenere lo schermo *acceso* o solo *impedirne la sospensione* (sono due cose diverse, e la seconda costa meno).
3. **Il riconoscimento continuo che si spegne da solo.** **[SUPPOSIZIONE]** su Android il riconoscimento si ferma dopo un silenzio; servirebbe riavviarlo, e ogni riavvio è una finestra in cui non si ascolta.

### Cosa resta fuori, e non per dimenticanza

**Nessun wake word, in nessuna forma** — deciso nel brief, con l'argomento giusto: richiederebbe un servizio in primo piano con notifica persistente e microfono sempre acceso, e a schermo bloccato Android non lascia comunque a un'app di terzi mostrare i dati.

---

## 8. Cosa resta aperto

- **A non è stata eseguita.** È la misura che sblocca tutto il resto. La pagina è pronta.
- **La pausa della sintesi non è misurata** — qui non c'è audio. `prova-voce.html` la fa sentire.
- **Il limite strutturale del banco** (§3): tre proprietà d'ordine indifese. Non è più un caso isolato.
- Dal giro precedente, invariati: la regola dell'inventario che insegna a negare; `TETTO_DOCUMENTO_IN_RICERCA = 600`.
