# Resonance V2 — l'APK

23/09/2026. Nuova istanza, non sovrascrittura (Legge 14): la PWA in radice resta intatta e in uso
finché questa non la sostituisce davvero.

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

**Promesse sul futuro.** Gemini ha scritto «Domani… riprendiamo»: lo Shell non torna da solo. Regola nel prompt
(proporre `crea_evento` come promemoria) e controllo del programma (`Testi.promette`), che aggiunge una nota se la
risposta promette senza aver proposto niente.

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
./gradlew testDebugUnitTest      # logica, archivio su Room vero, schermate disegnate in build/schermate/
./gradlew assembleRelease        # firma solo se RESONANCE_KEYSTORE e RESONANCE_KEYSTORE_PASSWORD sono nell'ambiente
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

## Carenze dichiarate

| carenza | stato |
|---|---|
| Mai girata su un telefono vero | Qui non c'è emulatore. Provate: logica, Room, rendering delle schermate. Non provate: voce, Health Connect, notifiche, chiamate reali al modello |
| Occhiali Ray-Ban Meta | Non scrivono in Health Connect, per quanto so: non entrano. Tutto ciò che scrive in Health Connect sì |
| Nessuna sincronizzazione fra dispositivi | Solo copia manuale (Setup → Salva una copia). Due telefoni = due Adam, come deve essere, ma senza backup automatico |
| Conferma a voce | Solo per l'ultima proposta in attesa |
| Mail inviata o no | L'app apre la bozza, non può sapere se è partita: la ricevuta dice «bozza aperta» |
| Rubrica | Non letta: «scrivi a Marta» senza indirizzo apre la bozza con il destinatario vuoto |
| Rimettere un impegno tolto | La copia è nel diario di Adam (con RRULE), ma rimetterlo è a mano o chiedendolo allo Shell come nuovo impegno: una serie non si ricrea ancora da qui |
| Spostare/togliere su telefono vero | Provata la decisione (quale impegno, quanto, chi è coinvolto) con un calendario finto; le scritture su `CalendarContract` (eccezioni, UNTIL) non sono provate qui |
| Allegati: file | Le immagini ridotte restano in `files/allegati` e non entrano nella copia (Setup → Salva una copia): dopo un ripristino il messaggio dice che c'erano, la miniatura no. Non si cancellano mai da sole |
| Allegati: sul telefono vero | Provati: riduzione immagine (strada BitmapFactory), testo, docx, messaggio al modello, cambio di modello. Non provati qui: ImageDecoder (foto ruotate), PdfRenderer, fotocamera, condivisione da altre app |
| Turno in secondo piano | Provato: registra/rispondi e il non rispondere due volte. Non provati qui: il lavoro vero a schermo spento, la notifica, il servizio in primo piano sui telefoni prima di Android 12 |
| Calendario scelto | Il principale dell'account Google, se no il primo scrivibile. La ricevuta ne dice il nome; non si sceglie ancora in Setup |
| Database | Versione 2 (`nomiProtetti`), migrazione automatica provata in `MigrazioneTest` sopra la 1 della 2.0.144 |
| R8 spento | APK da 30 MB. La minificazione va accesa solo dopo una prova su telefono vero |
| Modello predefinito | Llama 3.3 70B, lo stesso della PWA. Da scegliere con un numero, non col prezzario |
