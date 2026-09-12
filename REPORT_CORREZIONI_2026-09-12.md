# Le correzioni del controllo di ingegneria — 12/09/2026

Sei reperti del rapporto dell'11/09. **Cinque chiusi, uno chiuso a metà con il resto dichiarato,
uno che non so ancora risolvere bene e che non fingo di aver risolto.**

679 prove verdi (+52). Verifica di rottura su undici punti: **undici mordono**.
L'app parte nel browser vero (prova di fumo con Chromium).

---

## Quadro

| | reperto | esito | misura |
|---|---|---|---|
| 1 | il tetto di spesa non poteva scattare | **chiuso** | da 0,14 $ massimi osservabili a un totale senza tetto |
| 2 | `saveKey` falliva muto (76 chiamate) | **chiuso** | bandiera + striscia rossa, e la Legge 14 non si rompe più |
| 3 | quota locale esaurita fra 6 e 12 mesi | **metà** | muro da ~9 mesi a ~16; il resto dichiarato sotto |
| 4 | scia su Drive col quadrato | **chiuso** | da 1.095 file/anno a 12, da 69,8 MB a ~0,9 |
| 5 | bundle di sync a ogni messaggio | **chiuso** | da 40 round-trip al giorno a 2-3 |
| 6 | il 79% del prompt fisso era un blocco solo | **chiuso** | −72% sul blocco, −44% sull'ingresso del turno |
| 7 | byte NUL: `app.js` binario per grep | **chiuso** | due caratteri |
| — | i corpi dei documenti in localStorage | **NON risolto** | e il perché è scritto per esteso |

---

## 1 · Il tetto di spesa adesso può scattare

**Com'era.** `spesaDelMeseCorrente()` sommava le voci `ai-cost` dentro `debug-log`, che ne tiene 50.
Finestra dichiarata: un mese. Finestra reale: sei turni. Massimo riportabile: **0,14 $** contro una
soglia di 5. Il pannello Setup leggeva lo stesso numero, quindi diceva 0,10 $ dove il conto era 10.

**Com'è.** Un totalizzatore suo, `spesa-mensile`: una riga per mese con dollari, chiamate, token in
e out, più uno storico di dodici mesi. Non ha tetto perché non cresce. Il rollover al cambio di mese
non cancella il mese chiuso, lo fa scivolare nello storico (Legge 14).

**Il pezzo difficile, e come l'ho risolto senza forzare una regola.**
Il commento sopra `extractUsageForLog` porta una richiesta esplicita del brief del 26/07: *il costo
non va MAI stimato da un prezzario cablato, perché un costo inventato che si spaccia per reale è
peggio di nessun dato*. La mia proposta di ieri diceva «si stima»: **era in contrasto con una
decisione già presa dal Ghost**, e l'ho trovata leggendo il codice invece di riscriverlo.

Quella regola vieta di inventare un **costo**, non di avere un **tetto**. I token non sono stimati:
arrivano misurati in ogni risposta. Quindi i tetti sono due e mordono su ciò che si sa davvero:

| | |
|---|---|
| tetto in dollari | 5 $/mese — vale **solo** se il fornitore dichiara il costo. Mai un dollaro inventato. |
| tetto in token | 40 Mtoken/mese — un **budget dichiarato**, non la conversione di un prezzo. |
| quale lavora | lo dice il pannello, sempre, con il totale e le chiamate. |

Sul modello di produzione di oggi OpenRouter il costo non lo manda quasi mai: **il tetto che lavora
davvero è quello in token**, e prima non esisteva. Se un giorno si passa a un modello caro il tetto
in dollari morde per primo, e il pannello lo dice.
Il registro del tetto raggiunto ora scrive **quale** tetto ha morso, con i numeri: un tetto che
scatta senza dire su quale scala ha scattato era il difetto di ieri in piccolo.

---

## 2 · Un fallimento di scrittura non è più muto

**Com'era.** `saveKey` restituiva `false` a quota esaurita. 76 chiamate, zero controlli. Il caso
peggiore: `compactShellChatIfNeeded` accorciava la chat da 41 a 25 messaggi, non guardava il
ritorno, e scriveva un segnaposto che dichiarava *«archiviati alla chiave X»* indicando una chiave
inesistente. 0 su 17 recuperabili, nessun errore, nessuna riga di registro.

**Com'è.** Non ho corretto 76 chiamanti: il 77° se ne dimenticherebbe. La firma non cambia, cambia
il fatto che il fallimento si vede.

- **Una bandiera in memoria di processo** — e non in localStorage, perché il posto dove la si
  scriverebbe è esattamente quello che ha appena detto no. Si perde ricaricando, ed è giusto: dice
  «in questa sessione una scrittura è andata perduta», non «il dispositivo è pieno per sempre».
- **Una striscia rossa in cima**, `position: sticky` — l'ho scoperta necessaria dalla prova di fumo:
  la prima versione scorreva via col contenuto, e spariva proprio scendendo in Setup, cioè dove il
  Ghost va a cercare il backup. Dice quante scritture sono andate perse e su quale chiave l'ultima.
- **Un solo chiamante controlla il ritorno**, ed è quello dove cambia la decisione:
  `if (!saveKey(archiveKey, overflow)) return null`. **Non compattare è meglio che compattare
  perdendo**: la chat resta lunga, il bundle resta pesante, niente sparisce.

Provato nel browser vero con `setItem` che lancia: l'app parte lo stesso, la striscia compare al
primo salvataggio fallito e resta in vista anche scorrendo.

---

## 3 · La quota: il muro si sposta di sette mesi, non sparisce

**Cosa ho fatto.** Gli archivi della chat non lasciavano mai il dispositivo — `removeItem` compariva
**zero volte** in tutta l'app. Adesso quelli oltre i tre più recenti salgono su Drive.

**Il pezzo che lo rende Legge 14 e non una perdita:** la copia locale si cancella **solo dopo che
Drive ha restituito un `id`**. Senza quella prova non si tocca niente; col sync spento non si sposta
niente; se anche solo l'indice locale non si scrive, l'archivio resta dov'è — un archivio in doppio
è un problema che non esiste.

| | prima | dopo |
|---|---|---|
| 6 mesi | 71% | **30%** |
| 12 mesi | **156% — muro** | 75% |
| 24 mesi | 342% | 179% — muro |

Il muro passa da circa nove mesi a circa sedici. **E il primo consumatore adesso è un altro**: i
documenti dei percorsi, dall'82% all'88% di quel che resta.

### Questo NON l'ho risolto, e non invento

I **corpi dei documenti** sono il 45% del consumo di ieri e, tolti gli archivi, sono praticamente
tutto il problema che resta.

La destinazione giusta la so: **IndexedDB**. È locale (quindi funziona senza rete, che è il senso di
una PWA), la sua quota è di ordini di grandezza più grande, non chiede nessuna dipendenza nuova.

Il blocco è preciso: **oggi il contenuto dei documenti si legge in modo sincrono** in almeno tre
punti del giro di un turno — `dossierPercorso`, `cercaNellaMemoria` e la riapertura di un documento.
IndexedDB è asincrono. Convertirli significa toccare la catena del turno, ed è un lavoro con un suo
banco, non una riga da aggiungere stanotte in coda ad altre sei.

Due strade che ho considerato e **scartato**, con il motivo:
- **Comprimere il testo** (dimezza, non risolve): renderebbe i documenti opachi in un backup e in
  un export, contro la regola che le forme dei dati devono sopravvivere a un cambio di substrato.
  Rimanda il muro di sei mesi e peggiora il dato. Non conviene.
- **Mandare i corpi su Drive come gli archivi**: gli archivi sono materiale morto che nessuno rilegge
  nel turno; i documenti no. Li si leggerebbe dalla rete dentro la conversazione, e offline
  sparirebbero. È una regressione mascherata da ottimizzazione.

Quindi: **muro a circa sedici mesi, e la soluzione vera è un round suo.** Preferisco dirlo che
consegnare una mezza versione che offline perde i documenti.

---

## 4 · La scia su Drive: un file al mese, non uno per scrittura

**Com'era.** `syncIfEnabled` chiamava `createDriveFile` a ogni scrittura, con la data **al secondo**
nel nome, e il contenuto era la lista **intera**. Ogni file conteneva il precedente più una riga:
1.095 file e 69,8 MB dopo un anno su un solo pilastro, da moltiplicare per i pilastri attivi.

**Com'è.** Un file per etichetta **per mese**, aggiornato sul posto con `PATCH`.

**Perché al mese e non uno solo per sempre.** Un file solo sarebbe ~60 kB in tutto, ma la storia più
vecchia di trenta giorni sparirebbe: è quanto Drive tiene le revisioni di un file non-Google.
Un'istantanea mensile resta per sempre e dentro il mese ci pensano le revisioni di Drive.

| | prima | dopo |
|---|---|---|
| file per etichetta, in un anno | 1.095 | **12** |
| byte su Drive, in un anno | 69,8 MB | ~0,9 MB |

C'è anche una coda per nome: senza, due scritture ravvicinate sulla stessa etichetta (una a mano e
una automatica da `aggiungiDaLettura`) troverebbero entrambe «nessun file» e ne creerebbero due.

---

## 5 · L'autosave non guarda più la chat

`shellChat` è uscito dalle dipendenze dell'autosave. È l'unica cosa cambiata lì, e vale:
prima ogni singolo messaggio faceva scaricare e ricaricare lo stato intero — 1,17 MB di rete per
messaggio con un anno di dati, ~5 secondi in 4G, ~47 MB di traffico al giorno.

La chat ha un passo suo: **ogni due minuti se è cambiata, e comunque appena l'app va in secondo
piano** — cioè quando il Ghost la chiude. L'impronta è lunghezza + id dell'ultimo messaggio, quindi
un battito a vuoto non costa niente.

Cosa si perde, detto chiaro: la chat arriva su Drive entro due minuti invece che entro due secondi.
I messaggi sono sul dispositivo appena scritti — il ritardo espone solo allo scenario «il telefono
muore in quei due minuti», non a «chiudo l'app».
L'effetto che timbra `sync-last-modified` continua a guardare anche la chat: quello deve restare
completo o il merge preferirebbe il remoto e la chat nuova perderebbe.

---

## 6 · Le capacità: l'indice sempre, la scheda quando serve

Il blocco pesava 9.842 token e partiva identico a ogni turno: il 79% dei 12.384 token fissi.

**Il testo delle schede non è stato riscritto di un carattere.** È lo stesso, spostato dal dentro di
un template literal al dentro di un array di 74 voci. Cambia il contenitore, non il contenuto.

Nel prompt del turno va: **l'indice dei 74 nomi** (~700 token, sempre) + **il nucleo** (15 schede che
lo Shell deve poter proporre senza essere interrogato, sempre) + **le schede che il turno nomina**
(tetto 8).

| | token | |
|---|---|---|
| blocco intero | 10.624 | com'era |
| turno che non nomina niente | 2.567 | **−76%** |
| media sui casi reali | 3.008 | **−72%** |
| peggiore possibile (8 schede) | 3.827 | −64% |
| **ingresso di un turno intero** | 17.334 → **9.718** | **−44%** |

In denaro: 2,50 → 1,40 $/mese sul modello di oggi; 62 → 35 $ su un modello a 3 $/Mtoken.
Lo ripeto perché ieri l'ho scritto e vale ancora: **sul modello di oggi non era un'emergenza di
cassa.** Quel che cambia davvero è la finestra di contesto — 12.384 token occupati prima che il
Ghost dicesse una parola, ora 5.550 — e il conto il giorno in cui il modello cambia.

### L'accettore, e cosa ha trovato prima di me

Le prove misurano **le due direzioni insieme**, perché una sola non basta: un richiamo che prende
tutto passerebbe la prima e fallirebbe la seconda.

- **RICHIAMO** — i tre difetti storici riprovati sulle frasi vere che li hanno prodotti («sto
  testando i Semi nel pilastro AIR» del 26/07, «i temi dell'Atto IV» del 09/09, il piano alimentare
  del 28/08), più dodici frasi che il Ghost dice davvero, ognuna con la scheda che deve portare.
- **PRECISIONE** — trenta frasi sulla **vita reale** (la schiena, i pazienti, la madre in ospedale,
  la spesa, il peso): **nessuna chiave** deve accendersi su nessuna.

Quando ho scritto quel banco se ne accendevano **quattro**, e le ha trovate lui:
`«serie»` su *«tre serie»* di esercizi, `«spesa»` su *«ho fatto la spesa»*, `«forma»` su
*«rimettermi in forma»* (due volte). Poi ne ha trovate altre: spezzare i nomi-frase dava chiavi come
`«lettura»`, `«conferma»`, `«davvero»`. Da lì due regole, ed entrambe hanno una prova che le difende:
le parole elise (`dell`, `nell`, `all`) non fanno chiave, e **sopra le quattro parole significative
la derivazione automatica si ferma** e servono chiavi scritte a mano.

Quest'ultima è la regola che vale per le schede **future**, non per queste: chi domani aggiunge una
scheda col nome lungo e senza chiavi vede il banco diventare rosso da solo.

### Dove il banco non arriva, e lo dico

«Il turno usa il richiamo e non il blocco intero» resta una lettura del **testo** di `app.js`, non
una prova di comportamento. È la **quarta** occorrenza della stessa forma di buco — il gate dei Semi
(09/09), il filtro sulle negazioni (10/09), `perLaVoce` dentro `speakText` (11/09) — e la ragione è
sempre quella: con i moduli ESM «X è chiamato da Y» non è provabile, i legami sono di sola lettura e
le chiamate si risolvono lessicalmente. Lo scrivo per la quarta volta perché smetta di sembrare un
caso e cominci a sembrare quello che è: un limite strutturale del banco, non una dimenticanza.

---

## 7 · I byte NUL

Due `"\x00"` letterali in `chiaveIdempotenza` rendevano `app.js` **binario per grep**: ogni ricerca
nel file principale rispondeva «binary file matches» senza mostrare una riga. `" "` è lo stesso
identico valore a runtime. Due caratteri, e la ricerca nel file torna a funzionare — anche la mia.

---

## La verifica di rottura

Undici punti rotti uno per volta, ognuno rimesso a posto dopo. **Undici mordono.**

| riga rotta | prova che è diventata rossa |
|---|---|
| il ritorno di `saveKey` nella compattazione | «la compattazione non perde più niente» (2 prove) |
| `registraSpesa` dentro `logAiCost` | «il totalizzatore vive anche se il registro scarta» |
| il tetto in token | «il tetto morde anche se il costo non arriva mai» |
| il nucleo escluso dalle richiamate | «il nucleo non finisce mai fra le richiamate» |
| le parole elise fuori dalle chiavi | «nessuna chiave si accende su una frase di vita» (2 prove) |
| il limite di parole per la derivazione | «nessuna chiave si accende su una frase di vita» |
| la prova di consegna da Drive | «senza id non si cancella niente» |
| il mese nel nome del file | «il nome porta il mese, non il secondo» |
| la bandiera della memoria piena | «le scritture perse si contano» |
| l'indice dei nomi (troncato a 10) | «i nomi di tutte le schede sono nell'indice» (3 prove) |
| il tetto sulle schede richiamate | «il caso peggiore resta sotto la metà» |

Più due prove di fumo nel browser: l'app parte (44 kB disegnati, zero errori di pagina), e con
`setItem` che lancia sempre parte lo stesso e mostra la striscia al primo salvataggio fallito.

---

## Cosa ho scritto anche fuori dal codice

- **`CLAUDE.md`, due bug ricorrenti nuovi**, perché hanno la stessa forma e torneranno:
  *«un tetto che legge una fonte con un tetto non è un tetto»* e *«un valore di ritorno che nessuno
  guarda è un fallimento muto»* — con la correzione giusta scritta accanto (rendere rumoroso il
  fallimento in un punto solo, non controllare 76 chiamanti).
- **La checklist di consegna aggiornata**: una feature nuova ora aggiunge una scheda all'array
  `CAPACITA`, con un nome che sia un nome, `nucleo` solo se lo Shell deve poterla proporre da solo,
  e chiavi a mano se il nome è lungo.
- **Tre schede nuove e una riscritta** nel blocco delle capacità (memoria piena, archivi su Drive,
  quando la chat arriva su Drive; e il tetto di spesa, che ora descrive i due tetti) — altrimenti lo
  Shell parlerebbe di funzionalità che non esistono più e non saprebbe quelle nuove.

---

## Cosa resta aperto

1. **I corpi dei documenti fuori da localStorage** (sopra, per esteso). Muro a ~16 mesi.
2. **La quarta proprietà d'ordine indifesa.** Quattro occorrenze in quattro giorni: forse la domanda
   giusta non è più «come la provo» ma «cosa cambierebbe nel modo di scrivere il codice perché
   questa classe di proprietà diventi provabile».
3. Dal giro prima: la regola d'inventario che insegna la negazione, `TETTO_DOCUMENTO_IN_RICERCA`,
   l'osservabile «stabilità mantenuta», i tre serbatoi.
