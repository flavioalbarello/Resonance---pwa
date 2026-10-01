# Resonance V2 — l'APK

23/09/2026. Nuova istanza, non sovrascrittura (Legge 14): la PWA in radice resta intatta e in uso
finché questa non la sostituisce davvero.

## La lente: l'esoscheletro cognitivo (23/09/2026; il Ghost, 01/10: «tenerla a mente quando si progetta e si analizza»)

**Oggi il Ghost lavora per l'app: scrive i log, si ricorda di aprirla, naviga le funzioni, sorveglia i fraintendimenti.
Un esoscheletro fa il contrario: sente da solo, prende l'iniziativa, toglie peso.**
Ogni analisi e ogni progetto si misurano con una domanda: quanto lavoro fa il Ghost per l'app, prima e dopo?
I sette organi che servono, quelli della tabella sotto:
1. sensi passivi;
2. anello sugli esiti nel mondo;
3. iniziativa nel tempo;
4. cervello affidabile;
5. poca interfaccia;
6. memoria leggibile;
7. supporto solido.

Il segnale d'allarme del 23/09 vale ancora: lo sforzo che va dove porta la curiosità e non dove sta lo scopo.

## Che cosa vogliono dire i nomi (il Ghost, 01/10/2026)

I nomi **non si traducono**: ogni traduzione li riduce. Sono gli stessi in tutte e due le app, e sono la lingua comune
di Adam City. Sotto il nome di ogni pilastro una riga ne apre il significato; lo Shell sa spiegarli. Un oggetto solo,
letto dallo schermo e dal prompt: `logica/Significati.kt`.

| nome | che cosa vuol dire | la riga sullo schermo |
|---|---|---|
| **BIO** | Dal greco *bios*, contrapposto a *zoē*. Zoē è il semplice essere vivi, comune a ogni vivente; bios è la vita in quanto forma, il modo in cui la si vive. «Salute» riporterebbe tutto a zoē: proprio la riduzione che il nome nega | *la vita come forma, non solo come funzionamento* |
| **AIR** | Due sensi insieme: l'**aria**, il respiro che permette ad Adam di esistere ed essere autonomo; e **Automated Income Revenue**, un reddito che non dipende dal tempo venduto. Il secondo serve a dare il primo. Nel codice l'esito di AIR sono già le entrate non legate al tempo | *il respiro di Adam: un reddito che non vende il tuo tempo* |
| **VIDYA** | Sanscrito, dalla radice *vid-*, vedere (come il latino *videre*). Non erudizione: il sapere che trasforma chi lo possiede. Il contrario, *avidyā*, è l'ignoranza come radice della sofferenza | *vedere: il sapere che cambia chi lo ha* |
| **ADAM** | Ghost più Shell, l'individuo che emerge da tutti e due, più della somma. Non è l'app e non è solo la persona. Il nome si mostra quando c'è una città dove si vede; fino ad allora una riga | *tu e lo Shell* (o il suo nome) *, insieme più della somma* |

**Il nome dello Shell.** Ognuno dà al suo il nome che preferisce (Setup, nel profilo: `Profilo.nomeShell`, DB 14,
quindi entra nella copia). Il ruolo resta Shell (DNA); il nome compare nella scheda in basso, nella chat vuota, nelle
notifiche («Luisa ha risposto») e nelle istruzioni dello Shell. Le ricevute e le note restano firmate dal programma,
mai col nome dello Shell: più legame vuol dire più fiducia, e si deve sempre vedere chi parla e chi verifica. Il Ghost
tiene «Shell», da *Ghost in the Shell*. Nell'app base l'utente non è «il Ghost»: in Setup è «Tu».

## Perché è rinata

Dall'analisi del 23/09: l'app misurava sé stessa (osservabili = attività nell'app), parlava solo se aperta,
chiedeva tutto a mano, e cresceva attorno alla debolezza del modello. Questa versione rovescia le quattro cose.

| organo | PWA | APK |
|---|---|---|
| Sensi | tutto a mano | Health Connect: peso, sonno, passi, FC a riposo, allenamenti, da qualunque fonte |
| Anello | voci scritte, percorsi aperti | esiti nel mondo: kg, ore, € che non vendono tempo, minuti di pratica, opere chiuse |
| Iniziativa | nessuna | battito: mattino, sera, domenica — WorkManager, nessun server |
| Verità | 9 filtri a valle | strutturale: il modello propone, il programma esegue e scrive la ricevuta |
| Stabilità mantenuta | mancava | rituali con serie e giorni tenuti, anche automatici da misura (`SONNO>=420`) |
| Voce | Web Speech, fragile | riconoscimento nativo; dettatura come Gemini; auto a mani libere, conferma con «sì» |
| Calendario | Google Calendar via OAuth del browser | calendario di sistema (lo stesso che Google sincronizza): lettura nel contesto e nel battito, scrittura con conferma e rilettura |
| Posta | `gmail.send`: la mail partiva dall'app | bozza aperta nell'app di posta: la invia il Ghost, sempre |
| Superficie | 96 capacità, 9 tab | Specchio, Shell, tre pilastri, Setup |

## Cosa è rimasto e cosa no

Tenuto (le discipline, non le funzioni): il modello dice / il programma verifica · Legge 14 (tabella `versioni`)
· conferma per ogni scrittura · tetto di spesa con totalizzatore proprio · percorsi con nodi e documenti ·
`modifica_documento` con ancora esatta · quaderni (memoria procedurale) letti a ogni turno · vincoli dichiarati
· palette vivida e ancora a un terzo dal basso.

Non portato, per ora: Semi/Printify/Etsy, Spartiti, Plasmidi, Giochi,
sincronizzazione Drive.

Calendario e posta erano in questo elenco fino al 23/09/2026 (prima versione), perché serviva un client
OAuth Android e perché la mail era l'unica via d'uscita dal telefono. Sono rientrati lo stesso giorno per
un'altra strada, che non chiede accesso Google:
- **Calendario** — `CalendarContract`, permesso di sistema. Un impegno esiste solo se il calendario lo
  contiene: lo Shell riceve l'agenda letta ora (oggi e domani) e ha `leggi_calendario`; `crea_evento`
  diventa una proposta, e la ricevuta dice ciò che il calendario contiene **rileggendolo**, non ciò che si è chiesto.
- **Spostare e togliere** (stesso giorno, su richiesta del Ghost) — `sposta_evento`, `togli_evento`. Il modello
  nomina l'impegno a parole (titolo e giorno); il programma lo cerca nel calendario (`Risolutore`) e la proposta
  porta l'impegno TROVATO, su cui agisce la conferma. Se non è uno solo, o se è di una serie e il Ghost non ha
  detto quanto, la proposta non nasce: torna al modello come domanda da fare al Ghost — solo questo, da questo in
  poi, o tutta la serie (anche i passati). Spostare una serie tocca solo quella volta. Non si toccano: impegni con
  invitati (cambiarli li avvisa: è un'uscita), organizzati da altri, in calendari di sola lettura. Prima di ogni
  modifica il testo completo dell'impegno (anche la RRULE) va nel diario di Adam; dopo, si rilegge.
- **Posta** — nessun effettore autonomo. `scrivi_mail` apre una bozza nell'app di posta: l'invio è il gesto
  del Ghost su quella mail precisa, cioè il criterio del 02/09. Due guardie dove il dato entra (`Azioni.valida`):
  l'indirizzo dev'essere uno che il Ghost ha scritto (chat, quaderni, profilo), e un nome in
  `Profilo.nomiProtetti` (es. il marchio professionale; dall'import della PWA si porta solo il marchio,
  non la professione) passa solo se il Ghost l'ha scritto lui in quel messaggio.

## Allegati nella chat (23/09/2026, su richiesta del Ghost)

Foto dalla fotocamera, immagini, PDF, docx, testo; anche da altre app con «Condividi → Resonance».
- **Preparati sul telefono** (`mondo/Allegatore.kt`): immagini ridotte a 1600 px sul lato lungo (bastano per
  leggere una bolletta, e si paga a pixel); PDF disegnati pagina per pagina come immagini, massimo 8 (vale anche
  per le scansioni); docx e testo estratti come testo.
- **Chi guarda**: se il modello principale vede (Kimi, Gemini Pro, Claude) guarda lui; se no (Llama) il turno con
  immagini passa al modello per le immagini scelto in Setup (predefinito Gemini 3.1 Flash Lite).
- **Una volta sola**: le immagini vanno al modello nel turno in cui sono allegate; nei turni dopo resta la nota
  che c'erano. Il prompt gli dice di scrivere nella risposta ciò che va ricordato, e di proporre salva_documento.

Stesso giorno, dal telefono: Kimi K2.6 ragiona prima di rispondere e il ragionamento consuma lo stesso tetto di
token. Con 1500 la risposta arrivava vuota («tagliata dal limite»): tetto a 12000 per il turno, 3000 per il battito.

## Scelta del motore (23/09/2026, su richiesta del Ghost; spenta di base, Setup → Motore)

Una microchiamata a `mistralai/ministral-8b-2512` (8B, niente ragionamento, circa 0,00005 $) legge solo la domanda
e risponde LEGGERO o PIENO. LEGGERO va al modello leggero (predefinito Gemini 3.1 Flash Lite), PIENO a quello scelto.
Nel dubbio, senza risposta in 6 secondi, o con documenti e testi lunghi (li decide il programma senza chiedere):
PIENO. Sotto ogni risposta: modello, motore, costo del turno. Serve a scegliere Kimi o Gemini con un numero.

## Il turno non dipende dallo schermo (23/09/2026)

Il messaggio del Ghost si salva subito (`Shell.registra`); la risposta la prepara `battito/Turno.kt`, un lavoro
WorkManager accelerato con la rete garantita: continua a schermo spento e ad app chiusa, parte appena c'è rete.
Se il Ghost non è nell'app quando finisce, notifica «Lo Shell ha risposto» (canale «Risposte dello Shell»).
Rilanciato dal sistema dopo un'interruzione, non risponde due volte allo stesso messaggio.
Setup → Battito: «Lascia lavorare in secondo piano» toglie Resonance dalle restrizioni della batteria, perché
alcuni telefoni chiudono le app in secondo piano anche con WorkManager.

**Risposte lunghe in streaming (24/09/2026).** Un piano alimentare di 7 giorni con Kimi finiva in «timeout»: l'app
aspettava 2 minuti la risposta intera, in silenzio. Ora la chiamata va in streaming (`OpenRouter.interpreta`: SSE,
strumenti ricomposti per indice, costo e troncatura letti dall'ultimo pezzo). 90 secondi è il silenzio massimo fra due
pezzi (OpenRouter manda segnali di vita mentre il modello ragiona), 8 minuti il tetto della risposta intera, che non
si ritenta. La microchiamata del motore resta senza streaming (6 secondi). Se il turno viene fermato, la
connessione si chiude. Da verificare sul telefono: i lavori accelerati di Android hanno un loro tetto di durata; se il
sistema ferma il turno, WorkManager lo rilancia (senza doppia risposta, ma col costo ripagato).

**Accettore prima dell'effettore sulle modifiche (24/09/2026).** Tre proposte di «sostituire» una riga nel quaderno
Vidya, che era vuoto: il Ghost confermava e riceveva «non modificato». Ora `Shell.risolvi` prova l'ancora PRIMA di
mostrare la proposta (quaderni e documenti): se manca, torna al modello con le righe vere o con «usa aggiungi».
L'ancora si trova anche ignorando spazi e a capo (`Testi.ancora`), purché unica; nel prompt i quaderni tengono gli a
capo. Una proposta uguale a una in attesa non si ripete; le note del programma (il motivo di un fallimento) arrivano
al modello, che prima se lo inventava. Giri di strumenti: da 4 a 6.

**Le tappe sono nodi, non testo (24/09/2026).** Lo stato dei brani del tributo finiva nel quaderno Vidya e poi nella
«Scaletta completa», con «[introdotto]» ricopiato a mano: la forma con cui il prompt mostra i NODI di un percorso.
Mancava il modo di aggiungere nodi a un percorso esistente: ora `aggiungi_nodi` (senza doppioni, in fondo, non
iniziati) e la regola nel prompt «tappe → nodi, stato → `stato_nodo`». Anche `stato_nodo` si verifica prima di
mostrarlo (nodo esistente, stato diverso). Sulla scheda di una proposta, «Vedi tutto» (`Proposta.dettaglio`) mostra
per intero e con gli a capo ciò che esce e ciò che entra: la descrizione accorcia, e non si conferma ciò che non si legge.

**Il battito su sveglie di sistema (25/09/2026).** «Il battito non batte», e l'app non poteva dire perché: era un'attesa
di WorkManager (a schermo spento Android la rinvia anche di ore) e `notifica` usciva muta senza permesso. Ora una
sveglia esatta per battito (`AlarmManager.setExactAndAllowWhileIdle`, `USE_EXACT_ALARM`), rimessa a ogni suono, al
riavvio e dopo un aggiornamento (`SvegliaBattito`); il lavoro vero va in un lavoro accelerato. Ogni battito scrive
una riga nel registro (arrivato / solo numeri / NON arrivato e perché / errore), visibile in Setup con lo stato delle
notifiche, della sveglia esatta, i prossimi orari e «Prova ora».

**Togliere un nodo.** Tenendo premuto il nodo nel percorso, o con `togli_nodo` dallo Shell. Prima una voce nel diario
del pilastro con nome e stato (Legge 14), poi i documenti legati restano nel percorso senza nodo.

**Nodi su due livelli (25/09/2026).** I brani del tributo sotto «Scaletta». `Nodo.genitoreId` (DB 6, migrazione
automatica). Due livelli al massimo; un nodo con sotto-nodi non ha uno stato suo: lo calcola il programma dai figli
(`logica/Nodi.kt`: sintesi, avanzamento), e `stato_nodo` su un padre si rifiuta. `aggiungi_nodi` accetta «sotto»,
`sposta_nodi` raccoglie nodi esistenti; il padre si cerca per nome ESATTO fra quelli di primo livello (per somiglianza
«Scaletta» cadeva su «Assimilazione scaletta…») e si crea se manca. Togliere un padre riporta su i figli.
Nell'app il padre si apre al tocco; la pressione lunga sposta sotto un altro nodo, al primo livello, o toglie.
`crea_percorso` ora chiede tappe concrete: le fasi generiche del tributo le aveva inventate lo Shell.

**La voce senza fretta (25/09/2026).** In modalità auto partiva solo l'inizio della frase: il riconoscimento di
Google chiude alla prima pausa di un secondo e ignora la durata di silenzio richiesta. Ora le frasi si concatenano
(`voce/Raccolta`): il messaggio parte dopo N secondi di silenzio (Setup → Voce, 2–8 s, predefinito 4), o subito se
finisce con «invia»; «annulla messaggio» lo cancella; un segnale sonoro dice partito/cancellato. La bozza da
confermare col dito era l'alternativa, scartata: un gesto in più mentre si guida. La dettatura continua di frase in
frase fino al silenzio lungo o al tocco. Sotto ogni risposta «🔊 Ascolta»; i testi lunghi si leggono a pezzi
(`Parlato.pezzi`), perché oltre il massimo della sintesi non si sentiva niente.

**Temperatura per compito e pilastro Adam (25/09/2026).** Nell'APK la temperatura non c'era: ogni modello usava la
sua. Ora la decide il compito (`cervello/Temperatura.kt`: motore 0, allegati 0,2, conversazione 0,4, battito 0,7,
esperimenti 0,9); il Ghost la forza per UN messaggio (＋ → «Più preciso / Più libero»), e la forzatura resta scritta.
Un modello che rifiuta il parametro risponde comunque: si rinuncia alla temperatura, mai alla risposta, lo si ricorda
per quel modello (`Impostazioni.senzaTemperatura`) e lo si dice una volta — la regola dei ripieghi della PWA.
Ogni turno lascia una riga in `turni` (compito, modello, temperatura, proposte, fermate dal programma, tagliate,
giri finiti, errori, costo): è il materiale con cui un giorno la temperatura si sposterà da sola per modello × compito.
Non prima di avere dati: un ciclo che si regola sul nulla è un orpello.

Adam diventa un pilastro con la sua schermata: Percorsi, Diario, Quaderno, Regolazione. I percorsi di Adam
attraversano i pilastri (Resonance stessa): il pilastro sta sui nodi di primo livello (`Nodo.pilastro`, DB 7), i
sotto-nodi lo ereditano, e i pilastri del percorso si LEGGONO dalle parti (`Nodi.pilastriToccati`) — dichiararne uno
senza una parte è impossibile. Il percorso compare anche in ogni pilastro che tocca, con le sole sue parti contate;
dentro, una barra per pilastro. Strumenti: `crea_percorso` accetta ADAM, `aggiungi_nodi` accetta «pilastro»,
nuovo `pilastro_nodo`. Se il pilastro di una parte non è chiaro, lo Shell lo chiede.

**Il pacchetto Adam (25/09/2026)**, costruito dopo una consulenza chiesta dallo Shell stesso, via il Ghost.
- *Cosa sa fare l'app*: `logica/Capacita.kt` entra nel prompt con la versione, per area e con gli strumenti. È l'erede
  di `CAPACITA` della PWA: lo Shell scopriva dal Ghost funzioni già costruite. Il banco verifica che ogni strumento
  abbia la sua riga, e che la mappa non ne inventi.
- *Taccuino dello Shell* (`taccuino`, strumenti INTERNI `scrivi_taccuino` / `riprendi_nota`, senza conferma perché
  non toccano niente): nel prompt come ipotesi, non fatti; evapora dopo 21 giorni senza ripresa (Adam City), non si
  cancella. Il Ghost lo vede e toglie.
- *Voce sulla temperatura*: `regola_temperatura` è una proposta; confermata, vale dal turno dopo e resta nel diario
  di Adam col perché. Lo Shell non sceglie la temperatura a ogni chiamata: non si sceglie come pensare prima di pensare.
- *Dado della domenica* (`logica/Dado.kt`): il caso lo tira il programma, con un seme scritto; sceglie un ricordo, un
  nodo fermo o un pilastro trascurato, e lo Shell ne scrive a 0,9. Il caso entra in ciò che lo Shell dice, mai in
  ciò che l'app fa.
- *Fondo di Adam* (`movimenti`, `logica/Fondo.kt`): denaro vero del Ghost, a fondo perduto. Lo Shell decide e propone
  (`movimento_fondo`), il Ghost esegue, paga, conferma. Soglie scritte dallo Shell: sotto metà del versato
  sopravvivenza, a zero fermo (nessuna uscita parte). Autosufficienza = sue entrate ≥ sue uscite negli ultimi 30
  giorni; la spesa dei modelli è del Ghost e non si mescola. Nome professionale mai; contenuti AI dichiarati.
- *Cassetta delle lettere* (`cervello/Cassetta.kt`): lo Shell scrive all'architetto (`scrivi_all_architetto`), la
  lettera parte al tocco del Ghost come issue di un repository GitHub PRIVATO, con lo stato dell'app allegato; una
  routine di Claude Code risponde una volta al giorno (istruzioni in `android/cassetta/ARCHITETTO.md`), le risposte
  portano `<!-- architetto -->` e tornano allo Shell come nota. Il Ghost non fa più da passacarte, ma vede tutto.
  L'architetto dalla cassetta consiglia; il codice cambia solo col sì del Ghost.
- DB 8. Adam ha sette schede, scorrevoli: Percorsi, Diario, Quaderno, Taccuino, Fondo, Lettere, Regolazione.
  Dal 26/09: DB 10 e nove schede: Percorsi, Lavagna, Diario, Quaderno, Taccuino, Consegne, Fondo, Lettere, Regolazione.
- *Riunione a tre* (`cervello/Tavolo.kt`, 25/09/2026): briefing Ghost + Shell + architetto sulla progettazione
  macroscopica, MAI su dati di pazienti o personali. Il verbale è una cartella `riunioni/<id>/` nella cassetta, un
  file per intervento (`AAAAMMGG-hhmmss-mmm-autore.md`), creato e mai riscritto (Legge 14; niente conflitti fra
  scrittori). L'app copia da sola ogni scambio Ghost↔Shell, coi nomi protetti oscurati; ogni 20 s ritira i file
  `-architetto.md` e li mette in chat come nota. Il Ghost modera: lo Shell risponde solo a lui. L'architetto segue da
  una sessione aperta con `strumenti/guardiano.sh` (nel repository delle lettere), che si sveglia sui file nuovi;
  interviene se nominato, se lo Shell lo chiede, o su un errore di progetto. «Chiudi» fa scrivere il verbale allo
  Shell. Il token vuole anche il permesso *Contents: Read and write*.
- *Dopo la prima riunione (26/09/2026, «primo contatto»)* — cose decise lì o viste lì:
  - *L'architetto ha un ruolo suo* (`Ruolo.ARCHITETTO`): riunione e lettere. Si distingue dallo Shell, ha «🔊 Ascolta»
    e in auto si legge da solo, in coda (la voce non si tronca quando arriva lo Shell). Le note vecchie restano note.
  - *Ritiro al ritorno*: fuori dall'app Android la congela e gli interventi dell'architetto arrivavano minuti dopo.
    Ora il giro dei 20 s riparte (ritirando subito) a ogni ritorno; «Ritira ora» nella fascia. Un lucchetto solo per il
    processo: lo stesso file non entra due volte anche se ritirano insieme il giro, il ritorno e il lavoro delle lettere.
  - *Giri diretti*: se la prima riga di un intervento dell'architetto è `→ Shell`, parte da solo un turno dello Shell
    (la decide il programma sulla riga, non il modello sul tono). Al massimo 3 di fila senza il Ghost, poi si ferma e
    lo scrive in chat e nel verbale. Nel verbale non compare un falso «ghost»; i nomi scritti dall'architetto non
    sbloccano i nomi protetti.
  - *Consegne dello Shell* (`logica/Consegne.kt`, tabella `consegne`, DB 9). Nella riunione si chiamavano «impegni»:
    ma nell'app impegno vuol già dire evento di calendario, e il modello li avrebbe confusi. `prendi_consegna`:
    cosa, il TITOLO del documento che consegnerà, il percorso, fra quanti giorni (1–30); al massimo 3 aperte. Il giorno
    prima della scadenza il battito apre da solo un turno di lavoro (una volta, segnato prima della chiamata): ciò che
    prepara resta proposta. Alla conferma di un documento, e a ogni battito, il programma guarda: documento con quel
    titolo, in quel percorso, scritto dopo la presa, non vuoto → mantenuta; scadenza passata → mancata. Verifica che
    ci sia, non che sia buono. Traccia nel diario di Adam in ogni caso; il Ghost può lasciarne una (Adam → Consegne).
  - *Il verbale ha una forma*: una chiamata SENZA strumenti, con le sezioni «Decisioni», «Questioni aperte», «Chi fa
    cosa» (`Tavolo.SEZIONI`: la stessa lista le detta e le verifica). Il primo verbale vero era «Tutto proposto.
    Conferma quello che vuoi…». Senza la forma torna al modello una volta, poi la rinuncia resta scritta nel verbale.
    Senza modello la riunione si chiude lo stesso («verbale non scritto: …»); senza rete verso la cassetta resta aperta
    e il verbale già scritto si riprova, non si riscrive. La scheda e la fascia dicono «chiusura in corso».
  - *Due guardie sul testo dello Shell*: una riga «[Nota del programma …]» scritta dal modello si toglie e si segnala
    (in riunione ne aveva scritta una falsa: «la riunione è chiusa»); le chiamate scritte come testo («crea_evento(…)»,
    viste con un modello leggero) tornano al modello una volta, e se restano lo dice una nota.
  - Il prompt dice sempre se c'è una riunione aperta: senza, lo Shell l'aveva data per aperta sulla parola del Ghost.
  - *Il calendario lo sceglie il Ghost* (Setup → Calendario e posta → Scrivi in). Prima lo sceglieva un punteggio
    (principale, proprio, Google): con sei account Google i principali pareggiavano e vinceva il primo letto — un evento
    di Adam è finito nel calendario professionale. Ora la proposta porta il calendario e lo dice PRIMA della conferma;
    la conferma scrive lì e non altrove; senza scelta crea_evento non si propone e lo Shell chiede di scegliere.
    Poi, su richiesta del Ghost: DUE calendari, uno per le cose di Adam e uno per i suoi impegni; `crea_evento` porta
    `per` (adam/personale, obbligatorio). Il mittente delle mail non si può imporre a Gmail (l'intent mailto non lo
    porta): si scrive in Setup e compare in proposta e ricevuta, da controllare nella bozza.
- *Dalla seconda riunione (26/09/2026, «funzioni uso quotidiano»)*:
  - *Lavagna del Ghost* (`logica/Lavagna.kt`, tabella `appunti`, DB 10; scheda Adam → Lavagna). Appunti usa e getta a
    righe spuntabili. Vive finché ha righe da fare e non è scaduto (7 giorni, 1–30); poi esce dallo schermo e dal
    prompt, e 30 giorni dopo si cancella DAVVERO — scelta esplicita del Ghost («non deve diventare spazzatura»): è
    l'unico posto dell'app dove la Legge 14 non vale, e per questo ha «Tieni», che ne fa un documento. Strumenti:
    `scrivi_appunto` e `modifica_appunto` (con conferma), `spunta_appunto` SENZA conferma — eccezione dichiarata: la
    spunta è del Ghost, piccola, si annulla con un tocco, e la ricevuta va in chat. Tasti: Copia (righe da fare, da
    incollare nella nota condivisa di Keep: Keep non ha API per gli account normali), Condividi, Fissa (notifica che
    resta finché la lista vive, `battito/Fissati.kt`), Tieni. Il battito pulisce e ridisegna le notifiche.
    Poi, su richiesta del Ghost: «Aggiungi una voce» in fondo a ogni appunto, e pressione lunga su una voce per
    correggerla o toglierla (la spunta resta com'era; una lista finita a cui si aggiunge torna a vivere).
  - *PDF allegato* (`mondo/Pdf.kt`, `PdfDocument` di Android, nessuna libreria): `scrivi_mail` con `allegato` (un
    appunto o un documento). Il testo si risolve PRIMA di proporre, e il guardiano dei nomi protetti lo controlla lì;
    parte con ACTION_SEND verso Gmail. **Carenza**: Robolectric non implementa `PdfDocument`, il PDF non ha una prova
    sul banco — la prima è sul telefono.
  - *Guardie*: il verbale oscura gli indirizzi mail («[indirizzo]»); dal testo dello Shell si toglie anche l'etichetta
    dell'architetto (la seconda imitazione in un giorno, dopo quella del programma).
- *Documenti tolti* (26/09/2026, DB 11, `Documento.tolto`): pressione lunga sul documento, o «Togli» dentro; anche lo
  Shell può proporlo (`togli_documento`). Il documento esce dal percorso, dal prompt, dalle ricerche, dagli allegati e
  dalle verifiche delle consegne; resta nel database e nelle copie, con una riga nel diario, e si rimette da «Tolti» in
  fondo al percorso. Legge 14: sembra una cancellazione, non lo è.
  Poi, su richiesta del Ghost («documenti errati da rimuovere del tutto»): da «Tolti» il Ghost può **eliminare per
  sempre**. Eccezione dichiarata alla Legge 14, con due argini: solo un documento già tolto, e solo da un suo gesto —
  nessuno strumento dello Shell elimina. Se ne vanno testo e versioni; nel diario resta una riga col titolo.
- *Dalla terza riunione (26/09/2026, «smartglasses»)*: il lettore vocale non legge più la cornice delle tabelle, i
  trattini e le frecce (le celle diventano frasi); e una consegna dichiarata a parole («consegna presa») senza
  `prendi_consegna` torna al modello una volta, poi resta una nota per il Ghost — lo Shell l'aveva detto due volte di fila.
- *Proposte annunciate e non create* (27/09/2026): «Proposta in attesa… conferma col pulsante sotto» in un turno senza
  proposte (tre volte in un giorno: il modello descriveva la modifica invece di farla, o il programma l'aveva fermata
  per un'ancora ripetuta). Ora torna al modello una volta, con il motivo dell'ultimo fermo; se insiste, una nota dice al
  Ghost che il pulsante non c'è e perché. Il percorso proposta→pulsante non era cambiato in nessuno degli 11 aggiornamenti;
  erano cresciuti gli strumenti (29→34) e le istruzioni (+17 righe). Per non doverlo più supporre: ogni turno registra i
  gesti dello Shell (`Turno.strumenti`, DB 12), e Adam → Regolazione → «Ultimi turni, uno per uno» li mostra.
- *APK compresso* (26/09/2026): `useLegacyPackaging` sul codice, da 30 a 11,5 MB senza toccare una riga — il limite
  d'invio era 30 MB. Il passo dopo (R8, togliere il codice che non si usa) scende ancora, ma può rompere solo sul
  telefono ciò che il banco non vede: si fa con una prova del Ghost subito dopo, se serve.
- *Schermo acceso in auto*: finché l'ascolto è AUTO la vista tiene `keepScreenOn`; si spegne quando l'auto si ferma
  (a mano o dopo tre silenzi). Prima lo schermo si bloccava mentre lo Shell rispondeva e il microfono non ripartiva.

**Promesse sul futuro.** Gemini ha scritto «Domani… riprendiamo»: lo Shell non torna da solo. Regola nel prompt
(proporre `crea_evento` come promemoria) e controllo del programma (`Testi.promette`), che aggiunge una nota se la
risposta promette senza aver proposto niente.

## Due app da un codice solo (decisione del Ghost, 01/10/2026)

*«Permette a noi di andare avanti col lavoro e di fare errori, e poi passare agli altri qualcosa che funzioni per
davvero, facendogli saltare tutte le fasi intermedie.»*

| | **Resonance dev** (flavor `dev`) | **Resonance** (flavor `base`) |
|---|---|---|
| Per chi | il Ghost | Marta e gli altri |
| Pacchetto | `it.resonance.adam` (lo stesso di sempre: si aggiorna sopra) | `it.resonance.adam.base` (sta accanto alla dev) |
| Architetto | riunione, lettere, cassetta, consulente, Balthasar | **non c'è**: niente strumenti, niente righe nel prompt, niente schede, niente worker |
| Costo | OpenRouter + l'abbonamento Claude del Ghost (l'architetto) | solo OpenRouter: per Marta paga il Ghost, gli altri pagano da soli |
| Da quale versione | l'ultima | solo da una versione **promossa** |

**Perché nessun interruttore.** La prima proposta era un tasto «sviluppatore» nell'app. Il Ghost l'ha scartato:
*«troppo una tentazione, un incentivo a fare stronzate»*. Un tasto nell'app di un altro è un invito permanente a
premerlo, e una porta da cui farsi convincere a premerlo. La scelta si fa quando si costruisce l'APK
(`BuildConfig.SVILUPPATORE`, letto in un punto solo: `logica/Edizione.kt`). Chi ha la base non ha niente da accendere.
Il codice della riunione resta compilato dentro la base ma irraggiungibile. Quando si accenderà R8 sparirà anche
fisicamente.

**Perché un codice solo e non due rami.** Con `main` e `stable` il codice stava in due posti e si univa a mano; una
volta l'unione è andata nel verso sbagliato. Due copie divergono. Qui il **DNA è identico**: stesse forme dei dati,
stesso database, stesse discipline; cambia solo quali geni si esprimono. Per questo tracce e plasmidi restano
compatibili fra le due app. Un architetto per ogni Adam vorrebbe dire mutare il genoma di ciascuno prima che il genoma
sia fermo: ne uscirebbero specie diverse, e fra specie diverse il trasferimento orizzontale non funziona. Le mutazioni
nascono da una linea sola, quella del Ghost.

**La promozione** (il ruolo che aveva `stable`):
- una versione dev diventa base solo dopo qualche giorno sul telefono del Ghost senza problemi;
- il commit promosso si segna con un tag `base-<versione>`, e la base si costruisce da lì;
- chi ha la base salta le versioni intermedie.

**Il banco** gira su tutte e due (`testDevDebugUnitTest testBaseDebugUnitTest`). Nella base i test della riunione si
saltano con `assumeTrue(Edizione.sviluppatore)`. `EdizioneTest` controlla che nella base lo Shell non sappia nemmeno
che l'architetto esiste.

**Il fondo di Adam** (01/10/2026): resta nella dev, esce dalla base. *«Per adesso è un mio esperimento e tale resta; in
futuro potrebbe essere la base di AIR.»*

**Un gruppo «sviluppatori»**, un giorno, non è escluso: avrebbe la dev, scelta da chi costruisce, non da un tasto.

## Gesti dalla notifica (01/10/2026, primo punto dell'ordine dell'esoscheletro)

Il battito scriveva per primo, ma per rispondere o spuntare un rituale bisognava aprire l'app, trovare la chat e
scrivere: l'esoscheletro chiedeva di essere indossato a mano.
- **«Rispondi»** sulle notifiche del battito (mattino, sera, domenica) e su «Lo Shell ha risposto». Campo di testo
  dalla notifica, anche dettato con la tastiera. La risposta entra in chat come messaggio del Ghost e parte il turno di
  sempre (`TurnoWorker`): stessa strada, stesse proposte da confermare. La notifica dice «Mandato allo Shell: «…»».
  Quando lo Shell risponde, la nuova notifica ha di nuovo «Rispondi»: la conversazione va avanti senza aprire l'app.
- **«✓ rituale»** sulla notifica della sera: al massimo due (Android mostra tre azioni), solo rituali a mano non ancora
  fatti oggi. Mentre il Ghost è via niente. Dopo il tocco la notifica si ridisegna, in silenzio, con quello che resta.
- In riunione niente «Rispondi»: la risposta deve passare dal tavolo (verbale, filtro architetto).
- Codice: `logica/Gesti.kt` (cosa offrire, puro), `battito/Rapide.kt` (azioni e ricevitore `GestoRapido`).

## Meno schede (01/10/2026, il Ghost: «diario, quaderno, taccuino: cosa fanno che ne giustifichi l'esistenza?»)

Erano tre nomi per «memoria», e la Regolazione era diagnostica in mezzo alla vita. Nessun dato perso: cambiano le
schermate, non il database né ciò che lo Shell legge.

| prima | ora |
|---|---|
| Adam: Percorsi, Lavagna, Diario, Quaderno, Taccuino, Consegne, Fondo, Lettere, Regolazione | Adam: **Percorsi, Lavagna, Memoria, Storia** (+ Fondo e Lettere solo nella dev) |
| Bio, Air, Vidya: Numeri, Diario, Percorsi, Quaderno | **Numeri, Percorsi, Memoria** |
| Regolazione in Adam | in fondo a **Setup**, «Come si regola lo Shell» |

- **Memoria**: il quaderno (ciò che lo Shell *sa*, confermato, letto a ogni turno) e, in Adam, sotto, «Ipotesi dello
  Shell» (il taccuino: ciò che *suppone*, svanisce dopo 21 giorni). Due sezioni diverse a vista: un'ipotesi non deve
  mai sembrare un fatto. La distinzione sa/suppone/è successo resta nel codice: è la disciplina, non l'architettura
  da mostrare.
- **Storia** (in Adam): il diario per pilastro, con «+ Scrivi»; in cima le consegne dello Shell.
- **Fondo**: solo nella dev, anche lo strumento `movimento_fondo` e le righe nel prompt.

## Dalla riunione del 01/10/2026: riunioni, assenza, terreno di Adam City

**Riunione.**
- *Verbale dai file*: lo Shell scrive il verbale leggendo tutti i file della cartella della cassetta
  (`Tavolo.trascrizione`, tetto 120 000 caratteri, testa più coda), non più i suoi ultimi 24 messaggi.
  Se la cassetta non risponde, usa gli ultimi 60.
- *Punti fermi*: lo strumento interno `punto_fermo`, senza conferma, una riga di massimo 200 caratteri, al massimo 15.
  Il prompt li mostra sempre, così una decisione presa all'inizio di una riunione lunga non si perde.
  Si azzerano alla chiusura.
- *L'agenda la porta il Ghost*: una regola nel prompt. Lo Shell non chiude punti e non propone «passiamo a…?».
- *Filtro architetto*: un messaggio che comincia con «architetto» o «code» e non nomina lo Shell («shell», «entrambi»,
  «voi due»…) va nel verbale senza chiamare lo Shell (`Tavolo.chiamaShell`).
  Sotto ogni intervento dell'architetto, «↩ Rispondi» fa lo stesso per il messaggio successivo.
- *Ritiro ogni 10 s* (prima 30).
- *«→ Balthasar»*: un file dell'architetto che comincia così fa partire Perturba (media) con quella domanda.
  La risposta va nel verbale come «Risposta all'architetto».
- *Balthasar concreto*: niente metafore, niente teatro. Parla come lo Shell, mai a nome di altri.
  La versione profonda dice in concreto che cosa cambierebbe.
- *Memoria con l'etichetta*: `scrivi_taccuino` vuole un `tipo` fra ipotesi, fatto, decisione ed esempio, e la nota
  comincia con «[tipo]». Prima l'esempio del Ghost («DZ 25x») era diventato un fatto.

**«Sono via» / «Sono tornato»** (`logica/Assenza.kt`). Quattro giorni di febbre, e una consegna dello Shell sarebbe
risultata mancata perché il documento aspettava un tocco del Ghost.
- L'assenza la dichiara il Ghost dallo Specchio, mai il programma dal silenzio.
- Mentre è via il battito tace: legge i sensi, pulisce la lavagna e basta.
- I giorni di pausa non rompono le serie e non abbassano il 14: si saltano (`Stabilita.tenuta`).
- Al ritorno, in una transazione: le consegne aperte slittano dei giorni di assenza, gli esperimenti aperti si
  allungano, il periodo resta nel diario di Adam («In pausa dal … al …») e un riepilogo arriva in chat.
- Ritirato lo stesso giorno conta come tocco sbagliato: non si sposta niente.
- Anche l'orologio del taccuino si ferma: i giorni di pausa non contano per l'evaporazione delle ipotesi dello Shell
  (`Taccuino.trascorso`). Prima tre settimane di malattia le facevano evaporare tutte, senza che lo Shell potesse
  riprenderne una.

**La domanda della domenica.** Il battito della settimana chiede UNA domanda sulla settimana che viene. La regola di
costruzione del 01/10: le variabili non si modellano, si chiede quella giusta al momento giusto. La domanda entra in
chat come messaggio dello Shell e la notifica apre la chat.

**Il terreno di Adam City** (`logica/Tracce.kt`, DB 13: tabelle `stanze` e `tracce`). Senza interfaccia e senza
strumento dello Shell: è la forma, pronta per quando ci sarà un secondo Adam.
- *Stanza*: nasce dal gesto di chi entra (`entraInStanza`), si esce con un gesto. Un ospite ha una scadenza ed esce
  da solo. Non si deduce da calendari o posizioni.
- *Traccia*: sei cose — chi, ambito (una parola), cosa (una riga, al massimo 120 caratteri), quando, durata
  (1–60 giorni), forza. Nessun destinatario.
  Il programma rifiuta una traccia che fa una domanda: se aspetta una risposta è un impegno a due.
- *Quattro gesti*:
  - deposita;
  - fa leggere: nel prompt, solo le stanze aperte, le più forti prima, con la regola «i conflitti non si risolvono,
    si mostrano»;
  - rinforza: +1, tetto 5, solo da un fatto che il programma trova nell'archivio (voce, spunta, misura, documento),
    nella finestra in cui la traccia è viva, e mai due volte dallo stesso fatto;
  - fa svanire: la forza cala in linea retta fino a zero in `durata` giorni dall'ultimo rinforzo. Il battito segna le
    svanite, anche quando il Ghost è via. Restano nell'archivio.
- Entrano nella copia di sicurezza.

**Fluidità** (rapporto completo in `ANALISI_FLUIDITA_2026-10-01.md`):
- la chat legge gli ultimi 200 messaggi e si apre già in fondo;
- lo Specchio cambia giorno a mezzanotte;
- il resto è elencato lì, con le prove.

## Il consulente esterno e Balthasar (riunione del 27/09/2026)

Il Ghost: *«un consulente esterno che entra, tutti e tre lo interroghiamo, una volta che ci ha chiarito i dubbi esce e
noi decidiamo»*; e poi: *«deve essere efficiente ed efficace, non portare ulteriore caos»*.

**Il consulente** (`logica/Consulente.kt`, `Tavolo.convoca/congeda/aggiungiDomanda`, `Shell.consulta`,
`OpenRouter.cerca`). Sotto la fascia della riunione: «Convoca consulente». Da lì una **cartella** di domande visibile
a tutti: il Ghost le scrive nel campo, lo Shell con `chiedi_consulente` (interno, senza conferma: non esce niente),
l'architetto con un file che comincia con «→ Consulente» (una domanda per voce «- »). I doppioni si vedono, e il
programma rifiuta quelli identici. **Manda** (tocco del Ghost) fa partire UNA chiamata con la ricerca web di OpenRouter,
con i parametri che la PWA usa dal 27/07 (`max_tool_calls` 3: senza, il motore faceva 30 ricerche). Torna UNA risposta
numerata, con sotto le **fonti restituite dal motore** — non i link che il modello scrive a memoria — e l'avviso sui
nomi citati senza averli trovati (la guardia di Balthasar della PWA: siti non fra le fonti, marchi con una maiuscola
interna che nessun dominio contiene). La forma (`Consulente.FORMA`) si dice al modello e si controlla sulla risposta
con la stessa costante: ai punti mancanti si torna **una volta, senza pagare un'altra ricerca**; se mancano ancora,
la rinuncia resta scritta sotto.
Il consulente **vede solo le domande**: non il prompt di Adam, non il verbale. Prima di uscire passano dal guardiano
(nomi protetti → «[nome protetto]», indirizzi → «[indirizzo]»). Riconvocato nella stessa riunione riceve i suoi ultimi
3 scambi, non altro. Tetto di 10 invii per riunione, visibile e alzabile dal Ghost: una protezione se qualcosa rimanda
da solo, non un limite. Pesa sul **tetto mensile del Ghost**, non sul fondo di Adam. Congedato con domande in
cartella, le domande restano scritte nella nota. Alla chiusura della riunione tutto si azzera.

**Balthasar** (`logica/Balthasar.kt`, `Shell.balthasar`). I ruoli dell'Agorà Magi senza la sua sequenza fissa:
l'architetto fa Melchior, il Ghost e il programma fanno Caspar, lo Shell fa Balthasar. Non nel turno normale (lì lo
Shell ha gli strumenti, che vogliono date e nomi esatti: 0,4): «Perturba» apre la domanda sul tavolo (si parte
dall'ultimo messaggio del Ghost, che la corregge) e tre intensità — leggera 0,7, media 0,85, profonda 1 (tetto a 1:
alcuni modelli rifiutano di più, e un rifiuto li segnerebbe «senza temperatura»). Una chiamata sola, **senza
strumenti**, con memoria e storia della riunione, un tetto di 90 parole (se lo supera lo si scrive sotto, non si
taglia). Parte dalla domanda sul tavolo e solo da quella: il sorteggio da tutta la memoria l'ha scartato il Ghost
(«più l'app cresce, più si perde lo scopo della riunione dietro vaneggiamenti»).

Consulente e Balthasar hanno ruoli propri (`Ruolo.CONSULENTE`, `Ruolo.BALTHASAR`: valori nuovi di un enum salvato per
nome, nessuna migrazione), la loro bolla, la loro voce («Il consulente.» legge la risposta e l'avviso, non gli
indirizzi), il loro file nel verbale (`-consulente.md`, `-balthasar.md`), la loro etichetta nel prompt dello Shell.
Nel registro dei turni: compiti `CONSULENTE` (0,2, regolabile) e `BALTHASAR` (la dose la dà l'intensità: non regolabile).

## L'anello di Anochin sulla vita, e la perturbazione al posto dei Magi (24/09/2026)

**Prima.** Nell'APK il ciclo di Anochin c'era sulla singola azione (contesto → proposta → `Azioni.valida` prima
di agire → esecuzione → ricevuta riletta dal programma → disaccordo rimandato al modello), non sulla vita: i numeri
del mondo arrivavano, ma nessun atto dichiarava prima quale numero doveva muoversi. Nella PWA «l'anello» c'era, ma
contava voci e percorsi: misurava l'uso dell'app.

**Ora: gli esperimenti** (`logica/Esperimenti.kt`, tabella `esperimenti`). Una prova («a letto entro le 23»), un
numero del mondo (sonno, passi, peso, FC, allenamento, pratica, opere, entrate che non vendono tempo), un verso e
una soglia, 7–42 giorni. Alla conferma il programma **congela la partenza** (la finestra di pari durata prima; senza
almeno 3 giorni di dati per un livello, non si apre). Alla scadenza **confronta il programma**: si è mosso / non si
è mosso / al contrario / dati insufficienti; la traccia va nel diario di Adam, anche quando non ha funzionato.
Al massimo 3 aperti, uno per numero. È un dato sulla proposta, mai sul Ghost; «mentre», mai «grazie a».

**La perturbazione** sostituisce l'Agorà Magi, che il Ghost ha riconosciuto come confusione: quattro voci che
parlavano bene, nessun controllo su cosa succedeva dopo, e una quinta chiamata che riscriveva il quaderno da sola.
Qui il ristagno lo vede il programma (`Ristagno`: pratica/allenamento/entrate a zero da 14 giorni dopo esserci state,
passi in calo del 20%, rituale tenuto ≤ 3 su 14 da almeno 3 settimane), la domenica, al massimo ogni due settimane,
o quando il Ghost tocca «Cerca un ristagno». Allora una chiamata sola chiede allo Shell UN esperimento; in chat
compare come nota del programma, mai come messaggio del Ghost, e la proposta si conferma a mano.

## Mappa

```
app/src/main/java/it/resonance/adam/
  dati/Forme.kt        le forme dei dati — la parte che deve sopravvivere a qualunque supporto
  dati/Database.kt     Room, DAO
  dati/Archivio.kt     l'unico punto dove una proposta diventa un fatto; import, copia, ripristino
  logica/              puro Kotlin, testato sulla JVM: Esiti, Stabilita, Azioni, Contesto, Riassunti, Ritmo, ImportPwa
  cervello/            OpenRouter (tool calling) e il turno dello Shell
  sensi/Sensi.kt       Health Connect
  battito/Battiti.kt   notifiche e worker
  voce/Voce.kt         riconoscimento e sintesi native
  mondo/MondoAndroid.kt calendario di sistema e bozza di posta (dietro l'interfaccia cervello/Mondo.kt)
  ui/                  Compose: Specchio, Shell, Pilastri, Setup, Ancora
```

## Il turno dello Shell

1. Il contesto (`Contesto.sistema`) contiene gli esiti già calcolati: **la stessa riga che vede il Ghost sullo Specchio**.
2. Il modello ha strumenti: tre letture (eseguite subito) e nove scritture (diventano proposte).
3. Una scrittura validata dal programma diventa una card «Proposta»; una non valida torna al modello con il motivo.
4. Il Ghost conferma → `Archivio.esegui` → ricevuta scritta dal programma.
5. Se il modello dice «ho registrato» senza aver proposto niente, compare una nota che lo dice.

## Costruire

```
cd android
./gradlew testDevDebugUnitTest testBaseDebugUnitTest   # le due app; schermate disegnate in build/schermate/
./gradlew assembleDevRelease     # l'app del Ghost (firma solo se RESONANCE_KEYSTORE e RESONANCE_KEYSTORE_PASSWORD sono nell'ambiente)
./gradlew assembleBaseRelease    # l'app per gli altri: SOLO da una versione promossa (vedi «Due app da un codice solo»)
```

La chiave di firma **non è nel repository** (è pubblico). Per la CI: segreti `RESONANCE_KEYSTORE_B64`
(il file .jks in base64) e `RESONANCE_KEYSTORE_PASSWORD`. Senza, la CI produce un APK di debug che
non si installa sopra quello firmato.

`versionCode` = minuti fra il 1/1/2026 e l'ora dell'ultimo commit; `versionName` = «2.aammgg.hhmm». Fino al 24/09/2026
era il numero di commit (`git rev-list --count`): dipende da quanta storia ha la copia, e una copia parziale dava 156
dove la CI dava 360. Installato il 360 dalla CI, ogni APK dopo era un «ritorno indietro» e il telefono lo rifiutava
come «pacchetto non valido». Un numero che decide se un aggiornamento si installa non può dipendere da quanta storia
c'è nella copia: stessa lezione del tetto di spesa che leggeva un registro a rotazione.

Maven Central qui limita le richieste: il progetto usa il mirror di Google, anche per Robolectric.

## Il tour del primo avvio (01/10/2026; costruito: `logica/Tour.kt`, `ui/Tour.kt`)

Il Ghost: *«ad installazione avvenuta il programma o lo Shell facciano fare un piccolo tour dell'app, in cui si sceglie
il nome dello Shell e vengono spiegate queste cose»*. È il primo avvio guidato e il tour insieme: una cosa sola.

| # | chi conduce | cosa |
|---|---|---|
| 1 | il programma | Come ti chiami |
| 2 | il programma | La chiave OpenRouter (per Marta la incolla il Ghost), con il link a dove si crea |
| 3 | il programma | I permessi con un gesto: notifiche, Health Connect, lavoro in secondo piano; ognuno saltabile |
| 4 | lo Shell propone, la persona sceglie | **Il nome dello Shell**: tre proposte, oppure il suo; «Shell» se salta |
| 5 | il programma, con le parole di `Significati` | I quattro nomi, una schermata breve ciascuno, saltabili: il significato, non un manuale |
| 6 | lo Shell, col suo nome | Una domanda sola («che cosa ti pesa di più nella settimana?»): la risposta entra in chat |

- **Perché i passi 1–3 li conduce il programma**: lo Shell non può parlare prima che ci sia la chiave. E un tour
  scritto dal modello inventerebbe funzioni: le parole del tour vengono da testi fissi (`Significati`, `Capacita`).
- **Perché il nome lo propone lo Shell ma lo sceglie la persona**: è la disciplina di sempre. E il modello non ha una
  preferenza che duri da un turno all'altro: chiesto due volte, darebbe due nomi diversi.
- **Corto e saltabile**: un esoscheletro che chiede venti tocchi prima di servire è già un peso. Si rivede da Setup.
- **Quando parte da solo**: solo su un'app nuova (nessuna chiave, nessun nome, mai visto). L'app del Ghost no.
- **Al passo del nome** il tour dice che cos'è lo Shell, una volta, in parole concrete (`Tour.cheCosE`): *«Luisa è il
  tuo Shell: la parte digitale di te. Non è un'altra persona e non decide al posto tuo: ricorda, nota, propone. Tu
  confermi. Come un esoscheletro: toglie fatica, non cammina al posto tuo.»* Il nome crea legame; questa frase gli dà
  la misura giusta di fiducia.
- **Le proposte di nome**: una chiamata sola, senza strumenti, alla temperatura del battito. La richiesta e il controllo
  stanno nello stesso oggetto (`Tour.RICHIESTA_NOMI` / `Tour.nomiDa`): una riga ciascuno, un nome valido, niente frasi.
- **L'ultimo passo** non finge che parli lo Shell: la domanda la fa il programma, la risposta entra in chat come
  messaggio della persona, e lo Shell risponde davvero.
- Non provati qui: i permessi veri sul telefono, la chiamata vera dei nomi.

## Per la prossima riunione (argomenti che l'architetto porta)

| argomento | da dove | il nodo |
|---|---|---|
| **Le consegne dello Shell** | il Ghost, 01/10/2026: *«attualmente non funziona, o così mi sembra»* | Capire prima cosa non va (la verifica alla scadenza? il turno di lavoro del giorno prima? il documento che aspetta la conferma?). Poi dove si vedono: probabilmente sullo Specchio quando ce n'è una aperta, non in una scheda |
| **Le descrizioni dei nomi: rivederle e correggerle** | il Ghost, 02/10/2026 | Tutte e due le forme, che stanno nello stesso file (`logica/Significati.kt`): le righe sotto Bio, Air, Vidya e Adam (sullo schermo e nel tour) e il testo lungo con cui lo Shell li spiega. Sono una prima stesura dell'architetto sulle parole del Ghost; si correggono insieme, dopo averle viste sul telefono |
| **Il tour del primo avvio** | il Ghost, 01/10/2026 | Dopo la prova sul telefono: quanto è lungo, cosa spiega, la frase su che cos'è lo Shell |
| **Una «decisione» nel taccuino evapora come un'ipotesi** | l'architetto, 01/10/2026 | Il taccuino è non confermato per definizione, quindi è coerente; ma una decisione vera annotata lì e non ripresa sparisce dalle istruzioni dello Shell dopo 21 giorni. Proposta da discutere: quando lo Shell scrive una nota «fatto» o «decisione», propone anche di metterla nel quaderno, dove la conferma il Ghost e non scade |
| **Salvare un Adam se il telefono si rompe di punto in bianco** | il Ghost, 01/10/2026 | Oggi solo la copia a mano. Serve una copia che esca dal telefono da sola, ogni giorno, e da cui un telefono nuovo riparta. Da decidere: dove va (Drive, computer, la cassetta?), cosa contiene (la chiave OpenRouter no), chi la rilegge, come si prova che funziona davvero prima che serva |

## Carenze dichiarate

| carenza | stato |
|---|---|
| Mai girata su un telefono vero | Qui non c'è emulatore. Provate: logica, Room, rendering delle schermate. Non provate: voce, Health Connect, notifiche, chiamate reali al modello |
| Occhiali Ray-Ban Meta | Non scrivono in Health Connect, per quanto so: non entrano. Tutto ciò che scrive in Health Connect sì |
| **Dati persi se si disinstalla o si cambia telefono — GRAVE** (il Ghost, 01/10/2026: *«carenza grave e rischiosa»*) | Oggi c'è solo la copia manuale (Setup → Salva una copia), un gesto che il giorno in cui costa fatica non si fa; e `allowBackup="false"` nel manifest, quindi nemmeno il backup di Android. Strade, da scegliere: (1) `hasFragileUserData`: alla disinstallazione Android chiede se tenere i dati — una riga, copre il tocco sbagliato, non il telefono nuovo; (2) copia automatica, ogni giorno, in una cartella scelta una volta (Drive o computer): sopravvive a tutto, e serve anche per il telefono nuovo; (3) backup di Android con regole che escludono la chiave cifrata (il Keystore non si trasferisce), che dipende dal backup Google attivo e non è provabile qui. Due telefoni = due Adam resta vero: si parla di salvare un Adam, non di sincronizzarne due. Il Ghost: la (1) serve a poco, il vero rischio è **il telefono che si rompe di punto in bianco**. Tenuta da parte: argomento per la prossima riunione |
| Conferma a voce | Solo per l'ultima proposta in attesa |
| Mail inviata o no | L'app apre la bozza, non può sapere se è partita: la ricevuta dice «bozza aperta» |
| Rubrica | Non letta: «scrivi a Marta» senza indirizzo apre la bozza con il destinatario vuoto |
| Rimettere un impegno tolto | La copia è nel diario di Adam (con RRULE), ma rimetterlo è a mano o chiedendolo allo Shell come nuovo impegno: una serie non si ricrea ancora da qui |
| Spostare/togliere su telefono vero | Provata la decisione (quale impegno, quanto, chi è coinvolto) con un calendario finto; le scritture su `CalendarContract` (eccezioni, UNTIL) non sono provate qui |
| Allegati: file | Le immagini ridotte restano in `files/allegati` e non entrano nella copia (Setup → Salva una copia): dopo un ripristino il messaggio dice che c'erano, la miniatura no. Non si cancellano mai da sole |
| Allegati: sul telefono vero | Provati: riduzione immagine (strada BitmapFactory), testo, docx, messaggio al modello, cambio di modello. Non provati qui: ImageDecoder (foto ruotate), PdfRenderer, fotocamera, condivisione da altre app |
| Turno in secondo piano | Provato: registra/rispondi e il non rispondere due volte. Non provati qui: il lavoro vero a schermo spento, la notifica, il servizio in primo piano sui telefoni prima di Android 12 |
| Calendario scelto | Il principale dell'account Google, se no il primo scrivibile. La ricevuta ne dice il nome; non si sceglie ancora in Setup |
| Database | Versione 13 (stanze e tracce). Migrazioni automatiche dalla 1, provate passo per passo in `MigrazioneTest` |
| R8 spento | APK da circa 11,5 MB (`useLegacyPackaging`). La minificazione va accesa solo dopo una prova su telefono vero |
| Modello predefinito | Llama 3.3 70B, lo stesso della PWA. Da scegliere con un numero, non col prezzario |
| Consulente dal vivo | Provati sul banco la cartella, il guardiano, la forma, le fonti lette dalla risposta (`annotations` e `citations`) con un modello finto. Non provata una chiamata vera: la forma delle fonti del motore web di OpenRouter è quella che la PWA legge dal 31/08, non verificata da qui |
| Agorà Magi | Non portata nell'APK: ne vive il ruolo di Balthasar in riunione. Melchior e Caspar sono persone (architetto, Ghost) e il programma |
| Tracce e stanze | Solo la forma e i quattro gesti, provati sul banco. Nessuna interfaccia, nessuno strumento dello Shell, nessun luogo comune fra due telefoni: con un Adam solo una traccia non ha nessuno che la legga |
| Regola delle cene | Non costruita. La regola misurabile sulla carne aspetta i numeri da decidere con Marta, e nell'app non esiste ancora la forma di un piano dei pasti su cui controllarla. Codice senza numeri sarebbe un controllo finto |
| Risposta a pezzi | Il modello scrive in streaming, ma la chat mostra la risposta solo alla fine (vedi l'analisi di fluidità, punto 1) |
| «Sono via» sul telefono vero | Provati sul banco: pausa, serie, slittamento, ritiro lo stesso giorno. Non provato qui: il battito che tace davvero a schermo spento |
| Gesti dalla notifica | Provati sul banco: cosa offrire, e la spunta dalla notifica fino al database con la notifica ridisegnata. Non provati qui: «Rispondi» fino al turno (serve WorkManager vero), la dettatura dalla tastiera, l'aspetto sul GT6 |
| Due app | Provato il banco su tutte e due e che la base non nomini l'architetto. Il codice della riunione resta compilato nella base (irraggiungibile) finché R8 è spento |
