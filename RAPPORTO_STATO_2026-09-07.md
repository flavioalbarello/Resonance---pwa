# Resonance — rapporto di stato del codice

**Data**: 07/09/2026 · **Build**: `2026-09-04 · accettore-ed-effettore-insieme` · **Service worker**: `resonance-v15`
**Rami**: `main` (Flavio/Ghost) e `stable` (Marta), allineati — `git diff origin/main origin/stable` vuoto.
**Prove**: 529 verdi, 104 suite, 23 file.

Documento pensato per essere caricato come conoscenza in un Claude Project. Descrive **cosa c'è
adesso**, non cosa dovrebbe esserci. Ogni numero qui dentro è letto dal codice o misurato, mai stimato.
Il quadro concettuale (Adam, Adam City, la direzione) sta in `CLAUDE.md` e **non si ripete qui**:
questo documento è la macchina, quello è il perché.

---

## 1 · Vincoli non negoziabili

Chi lavora su questo codice li rompe per distrazione, non per scelta. Sono tutti già costati un guasto.

| vincolo | conseguenza pratica |
|---|---|
| **Nessun build step** | Preact + htm da file vendored. Niente JSX, niente bundler, niente dipendenza che compili. Si modifica `app.js` e si ricarica. |
| **Mai `<>...</>`** | Fragment non è importato: rompe il render **in silenzio**. Sempre `<div>`. |
| **Legge 14** | Nessuna sovrascrittura distruttiva. Le evoluzioni sono V+1, il precedente resta. Vale per documenti, kernel, voci di log, plasmidi, e per i rami git. |
| **Merge** | Sempre **base `stable` ← compare `main`**. Mai il contrario. Errore già commesso. |
| **Identità professionale** | "PhysioAlba" (un NOME) non esce mai; "fisioterapista" (una PROFESSIONE) può uscire. Dentro l'app tutto permesso; **verso il mondo** (invio, esportazione, pubblicazione, prodotto) serve un gesto esplicito del Ghost su quella cosa precisa. Dettaglio in `CLAUDE.md`. |
| **`APP_CAPABILITIES_CONTEXT`** | Ogni feature nuova va descritta lì, o lo Shell non distingue «parlo di una funzione dell'app» da «parlo della mia vita». Bug già osservato con i Semi. |

---

## 2 · La disciplina centrale

> **«Il modello dice a parole, il programma va a cercarlo davvero.»**

Non è uno stile: è l'architettura. Ovunque ci sia una scelta, il modello **sceglie da un registro
chiuso** e il programma **esegue e verifica**. Il modello non inventa mai azioni a runtime.

Tre applicazioni concrete, in ordine di importanza:

1. **Azioni conversazionali** — il modello emette un tag con dei parametri; il programma cerca il
   percorso, il documento, l'evento. Se non lo trova, lo dichiara invece di rispondere a memoria.
2. **Effettori AIR** — il modello sceglie un `id` dal `EFFECTOR_REGISTRY`; l'esecutore chiama
   l'endpoint vero. `nessuno_disponibile` è un esito legittimo: mai una descrizione testuale
   spacciata per azione.
3. **Filtri di verità sull'output** — il testo del modello viene ripulito da ciò che non poteva
   sapere, **prima** di arrivare allo schermo (§7).

Corollario, aggiunto il 04/09: **quando il programma genera qualcosa, il criterio di accettazione si
forma prima e non a valle** (§10).

---

## 3 · Mappa dei file

```
app.js                 10.796 righe · 908 KB · monolite, tutto il resto è supporto
lib/base.js               31  primitive: date, uid, senza-accenti          (puro)
lib/misure.js            161  serie BIO, derivate, freschezza              (puro)
lib/griglia.js           119  montaggio di griglie senza ripetizioni       (puro)
lib/plasmide.js          163  forma, validazione, guardiano, impronta      (puro)
lib/capitolato.js        258  l'accettore d'azione                         (puro)
lib/alimentare.js        527  vincoli, repertorio, piano, controllo        (puro)
sw.js                     57  cache, precarica app.js + tutti i lib/*.js
index.html · styles.css · config.js · manifest.json
vendor/{preact,preact-hooks,htm}.mjs     — nessuna CDN a runtime
api/                                     — 5 funzioni serverless Vercel
tests/                          23 file di prova + 3 di supporto
```

**I moduli `lib/*.js` sono puri**: nessun `localStorage`, nessun `document`, nessuna rete. Non è
ordine, è portabilità — sono la parte che sopravvive a un cambio di substrato (PWA → APK → altro).

`sw.js` **deve** precaricare ogni `lib/*.js`: senza, la prima apertura offline dopo un aggiornamento
trova `app.js` in cache e i suoi import no, e l'app non si disegna affatto.

---

## 4 · Struttura di `app.js` (regioni, in ordine)

| righe | regione |
|---|---|
| 1–130 | import, `APP_BUILD`, costanti globali |
| 132–570 | **Piano di controllo**: fuoco conversazionale, inventario, dossier, ricerca nei percorsi, voci gemelle |
| 573–970 | **Registro azioni** (`AZIONI_CONVERSAZIONALI`) — la sola fonte di verità su cosa il modello può chiedere |
| 1065–1910 | **I filtri di verità** — cinque famiglie, tutte nate da un guasto vero (§7) |
| 1913–2050 | Aptica, postura (locale, zero rete) |
| 2047–2170 | Profilo del Ghost, `PILLAR_CTX`, `redactProfessionalIdentity` |
| 2172–2340 | Storage, migrazioni, backup/ripristino |
| 2338–2750 | **Motori AI**: timeout, rinunce di parametro, `inviaAOpenRouter`, `askModel*`, estrazione JSON |
| 2749–2950 | Costi/token, freni anti-loop, **rilevamento degenerazione** |
| 2955–3010 | **Trappole** |
| 3014–3190 | **Recinto** (Worker sandbox), magazzino plasmidi, attacco 1 |
| 3192–3390 | **Effettore** — l'app si scrive uno strumento |
| 3391–3640 | **Triade Magi** |
| 3639–4010 | **Semi** AIR: ricerca, proposta, gate, esecuzione |
| 3654–3830 | **Effettori AIR** e il loro contratto |
| 4019–4120 | `APP_CAPABILITIES_CONTEXT` — il blocco iniettato nel prompt |
| 4121–5450 | **Shell**: turno, calendario, posta, lenti, accettore |
| 5444–5760 | Vincolo AIR: il codice vede, il Ghost decide |
| 5768–5880 | Percorsi (motore generico BIO/AIR/VIDYA) |
| 5867–6100 | Simbiosi e **l'anello** |
| 6110–6420 | Drive: OAuth, sincronizzazione, `.docx` |
| 6420–10796 | **Componenti** (29) |

I 29 componenti, in ordine: `PercorsiPanel` `PercorsoDetail` `AnochinRing` `PosturaIndicator` `Hub`
`StoricoVoce` `BioView` `VidyaView` `SemiPanel` `AirView` `MagiView` `DiagnosticaFonti` `AnelloPanel`
`SimbiosiView` `AnochinTrace` `CorpoMessaggio` `MessaggioProtetto` `ShellView` `KernelView`
`CostSummaryPanel` `TrappolePanel` `PlasmidiPanel` `NoteDiRetePanel` `SettingsView` `HexTexture`
`SkippableField` `OnboardingView` `FeedbackWidget` `App`

---

## 5 · Modello dei dati

Tutto in `localStorage`. Nessun database, nessun server di stato.

### Sincronizzate su Drive (file unico `resonance-sync-state.json`, scope `drive.file`)

`bio-data` · `air-data` · `vidya-data` — i log per pilastro
`percorsi-bio` · `percorsi-air` · `percorsi-vidya` — i percorsi
`magi-data` · `semi-data` · `shell-chat` · `shell-memory` · `shell-style-memory`
`kernel-data` · `simbiosi-data` · `ghost-profile`

**Politica di merge**: i log sono **additivi** (nessuna voce si perde mai). Gli altri bundle sono
**vince-il-più-recente in blocco**, con `lastModified` lato client — limite dichiarato: un orologio
sballato può far vincere il dispositivo sbagliato, ma mai sui log.

### Solo sul dispositivo — NON vanno su Drive

`plasmidi` · `generazioni` · `trappole` · `registro-atti` · `note-di-rete`
`modelli-rinunce` · `modelli-ragionamento-obbligatorio` · `registro-azioni` · `azioni-esecuzioni`
`azioni-interruttori` · `fuoco-conversazionale` · `debug-log` · `app-settings`
`richiesta-in-sospeso` · `json-parse-failures` · `effettori-prova-a-vuoto`
`selezione-modello-capace` · `ultime-chiamate-google`

> **Questa è la cosa più importante di tutto il paragrafo, ed è un rischio aperto.**
> `registro-atti` (l'anello), `trappole` e `generazioni` sono **le tracce che il progetto accumula
> nel tempo** — la materia prima del generatore e la sola misura di cosa muove il sistema. Oggi
> vivono solo nel browser di un telefono: un ripristino, un cambio dispositivo o uno svuotamento
> della cache le cancella, e non c'è copia. Il resto (impostazioni, chiavi API, registri di rete)
> è giusto che resti locale. Quelle tre no.

### Forma delle strutture principali

```
percorso   { id, title, pillar, divenire, topics[], sessions[], documents[], competenze, memoria }
topic      { id, label, status: "non iniziato" | ... }
documento  { id, title, text, date, nodeId? }
voce log   { id, date, text, versioni[]?, peso?, sonno? }
seme       { id, content, status, strategie[], round, tetto, researchLog, executionLog }
           status memorizzato (identificatori inglesi, ≠ etichette a schermo):
             "seed" → nuovo · "researching" → in ricerca · "awaiting_approval" → in attesa
             "executing" → in sviluppo · "gated" → bloccato dal gate · "cancelled" → scartato
atto       { id, quando, tipo, pilastro, cosa, osservabileId, partenza, finestraGiorni, soglia }
plasmide   { id, nome, problema, attacco, codice, prove[], versione, formato, impronta,
             derivaDa?, attivo, generato?, natoIl?, arrivatoIl?, ultimaProva, chiamate, trovati }
prova      { ingresso, atteso, perche }
trappola   { id, quando, cosaNonHaFunzionato, suCosa, lunghezzaRifatta, percorso, turniSpesi }
generazione{ id, quando, attacco, esito, motivo, giri[{n, nome, disaccordi[{id, mancato}]}] }
```

---

## 6 · Capacità, per superficie

### Hub · BIO · AIR · VIDYA
Log per pilastro, percorsi identitari, nodi con verifica (quiz), sessioni. Il motore dei percorsi è
**generico**: gli stessi componenti servono i tre pilastri.

**Voci gemelle** (31/08): una voce scritta dallo Shell che dice sostanzialmente la stessa cosa di
un'altra dello **stesso giorno** non viene duplicata — aggiorna quella esistente e il testo
precedente scende nello storico (Legge 14). Le voci con una misura (peso, sonno) non si fondono mai:
due pesate sono due dati. Le voci scritte a mano non passano di qui.

**Andamento misurato (BIO)**: il programma calcola serie di peso e sonno dalle voci — ultima misura,
età, variazione totale e settimanale, numero di misure — e le passa allo Shell **già calcolate**.
Regola: se una tendenza non è nel riquadro, il modello non l'ha ricevuta e non deve parlarne. Una
misura sola non fa tendenza; oltre 7 giorni è "stantia", oltre 30 "vecchia".

### Shell (la chat)
Ciclo percezione-azione. A ogni turno riceve: contesto temporale, profilo, `PILLAR_CTX`,
`APP_CAPABILITIES_CONTEXT`, inventario, dossier del percorso aperto, impegni veri del calendario,
serie BIO calcolate, ed eventualmente un documento intero.

**Le dieci azioni conversazionali** — elenco chiuso, il modello sceglie, il programma esegue:

`apri_percorso` · `crea_percorso` · `salva_nel_percorso` · `apri_documento` · `scrivi_su_pilastro`
`crea_seme` · `interroga_memoria` · `avanza_percorso` · `chiudi_percorso` · `crea_evento_calendario`

Ogni azione dichiara `richiedeGate` e `reversibile`, **e quelle etichette vengono lette davvero**
(corretto il 22/08: prima erano decorative).

**Fuoco conversazionale**: il percorso o Seme su cui si lavora adesso. Barra sopra la chat,
sopravvive a ricarica, **scade da solo dopo 8 ore**.

**Tetto di spazio**: 3.000 token in conversazione, **8.000** quando il programma riconosce dalla
richiesta un contenuto lungo (piano, menu, programma, elenco di giorni). Se il tetto viene raggiunto
compare «questa risposta è tagliata a metà» con «Continua da dove ti sei fermato».

**Richiesta che sopravvive all'uscita** (29/08): si può chiudere l'app e tornare dopo.

### Piano alimentare — montato dal programma, non scritto dal modello
Il modello inventa **solo un repertorio** di piatti con grammature e calorie (una chiamata corta). È
il **programma** a montare la griglia: ruota i piatti perché nessuno ricompaia prima di aver esaurito
la categoria, mette gli asporto nei giorni chiesti, sceglie la cena che avvicina il totale al
bersaglio, fa le somme e dichiara la **media vera** con lo scarto.

Perché: una griglia 14 giorni × 5 pasti è un problema combinatorio, non un testo. Chiesta come testo
continuo collassava a metà (osservato 28–29/08) e non poteva garantire né la media né l'assenza di
ripetizioni.

**Controllo del piano**: dopo, il programma rilegge e confronta con i vincoli — alimenti esclusi che
compaiono lo stesso (sa che il salmone è un pesce), giorni mancanti, giorni identici, stessa fonte
proteica a pranzo e cena, dosi assenti, colazioni dolci quando erano state chieste salate. **Elenca
fatti col giorno preciso, non giudica.**

**Vincoli alimentari detti parlando**: quando il Ghost enuncia una regola in chat compare «Questo lo
tengo come regola fissa?». Tenuto, entra nei vincoli dichiarati e nel prompt di ogni turno, per
sempre. Serve perché la conversazione rivista è tagliata agli ultimi venti messaggi.

### Agorà Magi
Pipeline sequenziale fissa: **Balthasar → Melchior → Caspar → Sintesi**. Non è un dibattito iterativo.
Intensità: `leggera 0.95` · `media 1.15` · `profonda 1.35` (temperatura).

Tetti di parole per ruolo: Balthasar 60, Melchior 60, Caspar 50, Sintesi 70. Risposte in righe
brevissime che cominciano con `· `, una idea per riga.

Serve a due cose insieme: densità, **e tenere fuori dallo schermo il ragionamento interno del
modello**, che il 01/09 finiva stampato per intero al posto della risposta.

Balthasar ha la ricerca web su OpenRouter. Sotto la sua risposta una riga dice se la ricerca è stata
eseguita **davvero** — letta dalle citazioni, non dichiarata dal modello — e da quali domini. Se
nomina un servizio senza riscontro in nessun dominio citato, avviso di possibile fonte inventata.
Vede la nota corrente dei tre pilastri **più gli ultimi 4 frammenti di sedimento per pilastro**.

Voce (🔊) su ogni stadio, anche sulle sessioni registrate.

### Semi (solo AIR)
Un'idea grezza buttata in chat, o dal pulsante. Macchina a stati:
`seed` → `researching` → `awaiting_approval` → `executing` → (`gated` se un gate ferma un passo).
Le etichette italiane che il Ghost vede a schermo sono una traduzione: **nel dato c'è l'inglese**. Un passo di sviluppo sceglie un effettore reale dal registro e **lo
esegue davvero**, producendo dati veri (id di prodotto, file su Drive). Contatore round/tetto,
pulsante «Avanza ora», avanza una sola volta per gesto.

### Effettori AIR — il registro

| id | gate | reversibile | costo |
|---|---|---|---|
| `immagine_vettoriale` (SVG→PNG lato server) | no | sì | 0 |
| `immagine_raster` (provider esterno) | no | sì | 0,02 |
| `printify_cerca_prodotto_base` | no | sì | 0 |
| `printify_crea_prodotto` | **sì** | **no** | 0 |
| `printify_pubblica_su_etsy` | **sì** | **no** | 0 |
| `nessuno_disponibile` | no | sì | 0 |

`runSeedGateCheck` gira **subito prima** che `executeSeedContract` chiami un effettore reale: è
l'unico punto in cui un Seme tocca il mondo esterno, ed è lì che sta la verifica del vincolo AIR.

Endpoint serverless: `api/generate-image.js` · `api/svg-to-png.js` · `api/printify-catalog.js` ·
`api/printify-create-product.js` · `api/printify-publish.js`.

### Calendario e posta (Google)
Creare, trovare, cancellare, spostare un evento; inviare una mail. Ogni scrittura è **verificata
rileggendo dalla fonte** (`rileggiEventoDallaFonte`, `rileggiMailDallaFonte`), mai creduta sulla
risposta dell'API. Due percorsi indipendenti devono concordare sull'ora prima che un evento sia
dichiarato scritto (22/08: un appuntamento chiesto per le 16:30 era finito alle 16:00).

Il modello **non traduce le date**: copia le parole del Ghost («domani alle 15») e la conversione la
fa il programma.

Una mail è output generato dal sistema: il vincolo sull'identità professionale vale per intero.

### Simbiosi e l'anello
Simbiosi valuta periodicamente l'allineamento fra app e Ghost, e può **proporre — mai creare da sola**
— un percorso nuovo collegato a uno attivo. Una proposta alla volta.

**L'anello** (accettore d'azione): quando il sistema compie un atto deliberato dichiara **subito** un
bersaglio osservabile e **congela la misura di partenza**. Dopo, è il programma a contare nei dati se
il movimento c'è stato — due conteggi e una sottrazione, nessun modello.

| osservabile | attesa | finestra |
|---|---|---|
| `voci_nuove` | almeno una voce nuova nel pilastro | 14 g |
| `percorso_aperto` | il percorso proposto viene davvero aperto | 14 g |
| `materiale_prodotto` | almeno un documento nuovo nei percorsi | 21 g |
| `approccio_diverso` | un nodo si muove dallo stato in cui è nato | 21 g |

Non è un punteggio sulle previsioni del sistema, e **non è un dato sul Ghost**: un atto che non muove
niente vuol dire che la proposta era prudente o ovvia.

### Drive
OAuth, scope dichiarati in `config.js`: `drive.file` (solo i file creati dall'app, non tutto il Drive), `calendar`, `gmail.send`. Errori espliciti, scritture verificate sulla
risposta reale di Google (`id` e `modifiedTime` obbligatori, altrimenti la scrittura è considerata
fallita). Esportazione `.docx` con **tabelle vere**, non i segni che le simulano.

---

## 7 · I filtri di verità

Non è una feature: è ciò che impedisce all'app di mentire. Ogni filtro è nato da un guasto vero e
datato, e il commento nel codice porta la data e la schermata.

| filtro | cosa toglie | nato il |
|---|---|---|
| `ripulisciAffermazioniDiEsito` | «l'ho messo in calendario» quando non è successo — distingue affermazione da ipotesi, negazione, subordinata | 17/08 |
| domande di conferma senza bersaglio | «vuoi che lo faccia?» quando non c'è niente da fare | 17/08 |
| stato degli interruttori | il modello che dichiara quali capacità sono accese | 20/08 |
| `ripulisciContenutiDiCalendario` | qualunque contenuto di calendario senza una lettura verificata | 22/08 |
| `OFFERTA_INESISTENTE_RE` | «posso solo aiutarti a…» per cose che il sistema sa fare | 22/08 |
| `DIDASCALIA_RE` / `META_NARRAZIONE_RE` | il modello che recita il narratore di se stesso | 28/08 |
| `senzaDeliberazione` | il ragionamento interno stampato al posto della risposta | 01/09 |
| lo storico non fa da calendario | impegni pescati da conversazioni vecchie | 22/08 |

**E il contrario di un filtro** (22/08): `formatImpegniBlock` — l'elenco degli impegni veri lo
compone il codice e **entra nel prompt prima che il modello scriva**. Non inventava impegni (0 su 16),
ma lasciava il Ghost senza risposta: togliere non bastava, serviva dare.

---

## 8 · Il livello delle chiamate al modello

**Provider**: OpenRouter (predefinito) o Claude API diretta.
**Modello predefinito**: `meta-llama/llama-3.3-70b-instruct`. In uso reale: Flavio su Kimi K2.6,
Marta su `google/gemini-3.1-pro-preview`. Chi ha già toccato le impostazioni tiene il proprio.

Punto d'ingresso unico: **`inviaAOpenRouter`**. Sopra ci sono `askModel`, `askModelWithHistory`,
`askModelJSON`.

**Timeout** (23/08): fino a quella data in tutta l'app non esisteva un solo timeout. Ora ogni chiamata
passa da `fetchConTetto`.

**Rinunce di parametro** (02/09, dall'app di Marta ferma tutta la notte): se il fornitore rifiuta un
parametro facoltativo, il programma toglie **quello**, rimanda, e da lì in poi a quel modello non lo
manda più. Tetto **3 ripieghi**. Non ripiega su errori che non parlano di parametri (credito esaurito,
modello inesistente): quelli si dichiarano. Visibile nel riquadro «A cosa ho rinunciato per farti
arrivare una risposta».

**Estrazione JSON**: `extractJsonBlock` + `sanitizeJsonControlChars` + `stripTrailingCommas`. I
modelli economici mettono newline letterali e preamboli. I fallimenti finiscono in
`json-parse-failures` per diagnosi, invece di indovinare correzioni.

**Rilevamento degenerazione** — tre criteri, il terzo per primo:

1. **scritture miste** — lettere non latine ≥ 8 e quota > 2% del totale. È l'unico che vede la zuppa
   di token, che passerebbe indenne dagli altri due (vocabolario ricchissimo, nessuna ripetizione).
2. ripetizione in finestra di 40 token, soglia 16 (era 8: tagliava i piani alimentari con le dosi).
3. vocabolario minimo 8 parole diverse.

**Risposta vuota**: è una non-risposta, e la guardia la lasciava passare come ottima. Ora si ritenta
una volta; se anche la seconda è vuota, si dichiara — non si inventa un testo che non c'è.

---

## 9 · Trappole

Quando il Ghost chiede di rifare qualcosa che lo Shell aveva appena prodotto, il programma se lo segna:
la frase, l'inizio del testo rifatto, il percorso, e **dopo quanti scambi**. Costo zero: nessuna
chiamata, solo confronto di parole.

Tre famiglie chiuse: verbi di rifacimento espliciti · giudizi che valgono **solo** su un testo
(«troppo prolisso») · giudizi generici **solo se** la frase nomina ciò che è stato prodotto.

Quest'ultima condizione esiste perché senza, «non mi piace il pesce» diventerebbe una trappola. Il
rilevatore è **deliberatamente stretto**: una trappola mancata non costa niente, una falsa sporca
l'unica materia prima che c'è. Soglia sotto cui non si guarda: 200 caratteri di testo prodotto.

`turniSpesi` è il campo che vale di più: un rifacimento al secondo scambio è un aggiustamento, al
quindicesimo è una direzione sbagliata presa presto e pagata a lungo.

---

## 10 · Il livello autopoietico (02–04/09) — la parte nuova

### 10.1 Il recinto
Blob Worker. **Misurato prima di scrivere una riga di progetto**, non supposto:

- un Worker creato da Blob parte (nessuna CSP lo blocca, non c'è `vercel.json`)
- dentro un Worker **`localStorage` non esiste** — non perché l'ho difeso io: la piattaforma non lo
  espone affatto
- **`document` non esiste**
- **`fetch` invece c'è**, ed è l'unico buco: va chiuso a mano
- un ciclo infinito viene ucciso dal tetto (misurato: 801 ms su un tetto di 800)

`INVOLUCRO_SANDBOX` chiude 11 nomi (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
`importScripts`, `indexedDB`, `caches`, `Notification`, `BroadcastChannel`, `SharedWorker`, `Worker`)
con **due passaggi ciascuno**: `delete` non basta quando la proprietà vive sul prototipo, e
un'assegnazione a `undefined` si può riassegnare. Tetto: **1500 ms**.

**Costo misurato** (Chromium, testo da 3.200 caratteri): mediana **5,9 ms** per plasmide acceso, per
risposta. Su telefono, 2–3×. Con il magazzino vuoto: **zero**, garantito da una riga che sta prima
della creazione di qualunque Worker.

### 10.2 Il plasmide
Una **funzione pura**: dato in ingresso, dato in uscita. Niente rete, niente `localStorage`, niente
interfaccia. Cinque proprietà biologiche tradotte in cinque vincoli:

1. **fuori dal cromosoma** — non sta in `app.js`, non passa da un deploy. Il merge `main`/`stable` è
   ereditarietà **verticale**; il plasmide è **orizzontale**, ed è il punto.
2. **porta funzione, non identità** — zero dati personali.
3. **trasferimento orizzontale** — un file `.json`, si esporta e si importa.
4. **l'ospite non si fida** — le prove **rigirano sul dispositivo che riceve** prima dell'uso.
5. **origine di replicazione propria** — porta con sé le proprie prove.

`plasmidiPerAttacco` richiede **due condizioni**: `attivo !== false` **e** `ultimaProva.passato === true`.
Non una. La seconda è nata perché in un banco di prova avevo scritto un plasmide dritto in memoria
saltando l'ammissione, e ha girato lo stesso in un'Agorà vera. In memoria ci si finisce in tanti modi.

**Attacchi esistenti: uno.** `criterio-degenerazione`, contratto `(testo) => null | { criterio, … }`.
L'elenco è fisso e scritto a mano: il modello genera l'organo, **l'attacco dove innestarlo lo decide
chi scrive `app.js`**. È la vera misura di quanto l'app può crescere.

### 10.3 Il capitolato — l'accettore d'azione
`lib/capitolato.js`. Dal Ghost, 04/09: *«devono avere una relazione biunivoca, un po' come accettore
d'azione ed effettore d'azione in Anochin, altrimenti ognuno dei due diventa solo un orpello»*.

In Anokhin l'accettore **non giudica dopo**: si forma **prima** dell'azione e **specifica** che forma
dovrà avere il risultato.

**Un oggetto solo, letto due volte.** Ogni requisito porta `detta` (come si dice al modello) e
`verifica` (come si controlla) **nella stessa riga dello stesso array**. `briefDelCapitolato()` e
`confrontaColCapitolato()` leggono lo stesso array; una prova fallisce se una sola frase del giudizio
non arriva al modello alla lettera.

Nove requisiti: `forma-funzione` · `campi-dichiarati` · `prove-proprie` · `prove-passano` ·
`banco-guasti` · `banco-sani` · `contratto` · `niente-dati-personali` · `prove-non-copiate`.

**Il banco trattenuto**: il modello vede i testi **guasti** (non si scrive un criterio per un testo
che non si legge); non vede **mai** i **sani**. Di quelli il capitolato **dice il requisito e
trattiene le prove**. È la sola parte del giudizio che l'effettore non può assecondare scrivendoci
sopra.

**`descriviForma`**: il disaccordo sui sani dice la **forma** («una tabella, 220 caratteri») e mai il
testo. Prima citava 80 caratteri, e in tre giri consegnava il banco a rate.

### 10.4 L'effettore
Materia prima: le **trappole**, ma solo quelle in cui il Ghost ha detto che il testo era **rotto**
(«non si capisce», «illeggibile», «caratteri strani») — non brutto o lungo: su un giudizio di merito
un criterio automatico non ha niente da dire. Senza un caso vero non parte, e lo dichiara.

Il ciclo: brief → modello → recinto → confronto. Se coincide, il plasmide entra **spento**. Se no, il
**disaccordo torna al modello** come materia del giro seguente (afferentazione inversa), tetto **3**.
Dopo il tetto, la **rinuncia si registra** con il motivo: «non so ancora fare X» è una traccia
legittima, e non si cancella da sola.

Il **guardiano dei dati personali** sta su `salvaPlasmide` — **dove il dato entra**, non dove esce.
Fino al 04/09 girava solo all'esportazione: difendibile finché i plasmidi li scriveva un umano che li
guardava.

**Verificato nel browser vero, Worker vero, in tutte e due le direzioni**: uno strumento buono entra
spento dopo 1 giro; uno che si accende su tutto viene rifiutato per 3 giri, non entra nel magazzino,
e nessun testo sano compare in nessuno dei prompt.

**Costo in token per pressione**: ~1.020 in ingresso + ~750 in uscita per un giro. Il ritentativo
costa **107 token**, perché rimanda solo cosa è mancato, non il capitolato. Tre giri: ~1.230 in
ingresso. Termine di paragone: un turno normale di Marta è ~8.000 token in ingresso.

---

## 11 · Il banco di prova

```bash
node --input-type=module --check < app.js        # sintassi
node --test "tests/*.test.mjs"                   # le virgolette SERVONO: `node --test tests/` fallisce
```

**529 prove, 104 suite, 23 file.** Nessuna dipendenza esterna: solo `node:test`.

```
anello · balthasar · calendario · capitolato · degenerazione · documenti-nel-contesto
finestra-conversazione · generatore · griglia · magi-forma · meta-narrazione
percorsi-da-chat · piano-montato · plasmide · quickwin-motoko · richiesta-in-sospeso
rinunce-parametri · serie-derivate · tabelle-docx · tetto-token · trappole
trigger-robustness · voci-gemelle
```

**`tests/lib/build-testable.mjs`** rigenera **sempre** il modulo testabile dal vero `app.js` corrente,
mai da una copia congelata — quindi non può disallinearsi. Riconosce le importazioni browser-only da
**cosa importano** (non da numeri di riga: la prima versione tagliava «le prime 12 righe» e ha smesso
di essere vera quando il codice è uscito in `lib/`). I moduli estratti vengono importati **davvero**,
non ritagliati. Un nome in `EXPORT_NAMES` che non esiste più fa fallire la generazione **subito**, con
un errore leggibile.

**`tests/lib/finto-recinto.mjs`** simula solo `Worker`, `Blob` e `URL.createObjectURL` — quello che
Node non ha — e dentro esegue la stringa `INVOLUCRO_SANDBOX` **vera**, parola per parola, chiusura dei
nomi di rete compresa. Non prova il tetto di tempo su un ciclo infinito: senza un thread da terminare
bloccherebbe il processo, e quella proprietà è già misurata nel browser.

---

## 12 · Cosa è misurato e cosa no

**Misurato** (numeri veri, riproducibili): il recinto e i suoi cinque fatti · il tetto di tempo
(801 ms su 800) · il costo del recinto (5,9 ms mediana) · i token del capitolato · le soglie di
degenerazione sul testo guasto vero · il taglio a 40 caratteri dei titoli · la variabilità delle
risposte (stesso turno ripetuto 5 volte: 3470, 541, 3316, 3401, 1099 caratteri).

**Non misurato, dichiarato tale**: il costo in euro per chiamata — il campo `usage.cost` di OpenRouter
arriva solo se l'account ha l'usage accounting attivo. **Non va mai stimato da un prezzario scritto a
mano**: un costo inventato che si spaccia per reale è peggio di nessun dato.

---

## 13 · Carenze aperte, dichiarate

| carenza | stato |
|---|---|
| **Origine periferica = 0** | Il tubo dei plasmidi ha motore e valvola, ma nessuno strumento è mai nato su un telefono vero. |
| **Un attacco solo** | L'app cresce solo dove esiste già un innesto, e gli innesti si scrivono a mano. Finché nessun plasmide circola fra i due telefoni, quel contratto è **ancora gratis da cambiare**. |
| **Osservabile "stabilità mantenuta"** | Manca. Gli osservabili sanno vedere solo chi **produce**: una routine che regge, una crisi che non è successa, il lavoro di cura sono invisibili per costruzione. |
| **Tracce non sincronizzate** | `registro-atti`, `trappole`, `generazioni` vivono solo nel browser. Un ripristino le cancella. (§5) |
| **N = 2** | Due utenti non sono una popolazione. |
| **Costo d'uscita non misurato** | Quanto costa davvero portare i dati altrove. |
| **Causa a monte del collasso di Balthasar** | La ricerca web che parte su una query storpiata è **intercettata**, non **impedita**. |
| **Stati del Seme sparsi** | I sei valori di `status` sono stringhe confrontate in una decina di punti, senza una costante o un elenco dichiarato come per `AZIONI_CONVERSAZIONALI` e `OSSERVABILI`. Rinominarne uno oggi significa cercarlo a mano. |
| **Analisi posturale** | Ferma in attesa degli occhiali Meta. Il problema nuovo non è tecnico: è il **consenso di terzi** — finora tutti i dati riguardavano il Ghost. |

---

## 14 · Come lavorarci — istruzioni operative

1. **Leggi il codice esistente prima di proporre.** Non assumere, verificare. Quasi ogni riga strana
   ha un commento con la data e il guasto da cui viene.
2. **Ogni feature nuova aggiorna `APP_CAPABILITIES_CONTEXT`.** Senza, lo Shell non sa che esiste.
3. **Ogni feature nuova bump di `APP_BUILD` e, se tocca `lib/`, di `CACHE` in `sw.js`.**
4. **Ogni coppia genera/controlla si scrive insieme**, con un capitolato letto due volte. Un controllo
   a valle è un orpello.
5. **Non scrivere caratteri di controllo alla lettera** dentro una classe di regex: mettono un byte
   NUL nel sorgente e git tratta il file come binario — niente diff, per sempre. Usa gli escape.
   (`app.js` è già binario per git da prima, per due NUL usati come separatore in un hash.)
6. **Prima di dire che qualcosa funziona, provalo.** Il banco è pronto e costa 4 secondi. Per il
   browser: server locale con `.mjs` nella mappa MIME (dimenticarlo fa una pagina bianca senza
   errori) e Chromium in `/opt/pw-browsers/chromium`.
7. **Se il task tocca l'identità professionale verso l'esterno: segnala, non procedere.**

---

## 15 · Le discipline che non cambiano

Il nucleo fermo non sono le funzionalità, sono queste. Se un giorno il substrato cambia, sopravvivono
le forme dei dati, i contratti degli attacchi, e:

- Il modello dice a parole, **il programma va a cercarlo davvero**.
- **Mai sovrascrittura distruttiva** (Legge 14): si sedimenta, non si cancella.
- **Il programma controlla, la persona decide.** Nessun effetto irreversibile senza un gesto.
- **L'accettore si forma prima dell'azione** e specifica il risultato atteso.
- **Il disaccordo è materia, non spazzatura**; la rinuncia è una traccia legittima.
- **Il guardiano sta dove il dato entra**, non dove esce.
- **Ciò che si dichiara si misura**, e ciò che non si è misurato si dice.
