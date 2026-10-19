# Resonance V3 — il potenziatore (piano, 14/10/2026)

Nuova istanza del progetto dell'APK (Legge 14: `PROGETTO.md` resta, questo non lo sostituisce, lo continua).
Nato dalla conversazione del 14/10 col Ghost: *«ad oggi non avverto la motivazione e la necessità di utilizzare l'app
quotidianamente, se non per lavorarci su»*; *«più che un morso o un freno cerco un potenziatore»*; *«vorrei la
ricostruissi da zero o quasi, senza perdere le funzionalità sviluppate»*.

## Perché si ricostruisce

L'app chiede più di quanto dà: spunte, conferme, numeri da dettare, schermate da attraversare. Il valore è rimandato
(Adam City), il costo è di oggi. Un esoscheletro fa il contrario: **segue l'intenzione e la moltiplica**, si indossa
invece di guidarlo, ti restituisce la sensazione del movimento, ha limiti articolari che non sono freni.

## La regola di progetto (da qui in avanti, per ogni pezzo)

**Ogni cosa che l'app chiede al Ghost deve restituirgli qualcosa durante l'attività o subito dopo. Se non lo fa, si toglie.**

## I quattro concetti nuovi

| concetto | cos'è | da dove viene |
|---|---|---|
| **Fronte** | un percorso col motore acceso: obiettivo, scadenza, ritmo, prossimo passo. Lo Shell ci lavora fra un gesto del Ghost e l'altro, con forma dichiarata prima e verificata dopo | percorsi + consegne (che già lavorano da sole il giorno prima) |
| **Sessione** | l'unità d'uso: «ho X minuti» → un piano su misura → l'app accompagna *durante* (anche sopra Moises o YouTube) → 10 secondi di esito → la volta dopo è migliore | la richiesta del Ghost sullo studio del basso |
| **Mappa del tempo** | il calendario come forma del tempo libero: sessioni proposte nei buchi, silenzio nelle ore di lavoro, memoria prima di un impegno, «com'è andata» dopo | JITAI (momenti di decisione, ricettività) |
| **Riunione dei fronti** | una riga per fronte su cosa è cambiato e cosa serve dal Ghost; Sì / No / dimmi; con moderazione, un fronte nuovo proposto dallo Shell con le prove | il ruolo del Ghost: direttore, non operaio |

## Cosa resta e cosa si rifà

| strato | sorte | perché |
|---|---|---|
| `dati/` (Room, forme dei dati, copia) | **resta**, si estende con migrazioni | i dati del Ghost non si toccano; le forme devono sopravvivere al substrato |
| `logica/` (verifiche, esperimenti, consegne, ricerca, capitolato) | **resta**, si estende | sono le discipline: 332 prove le tengono ferme |
| `cervello/` (Shell, OpenRouter, lettore, cassetta) | **resta**, cambia il modo di chiamarlo | streaming, turni di lavoro per fronte |
| `battito/` | **resta**, diventa il motore dei fronti e la mappa del tempo | |
| `ui/` | **si rifà** in `ui3/`, accanto alla vecchia finché la nuova non copre tutto; poi la vecchia si toglie | ciò che il Ghost vede e tocca è ciò che non funziona |

## La nuova forma (tre luoghi invece di sei schede)

| luogo | cosa ci sta |
|---|---|
| **Oggi** | la riunione dei fronti; la prossima sessione proposta nel prossimo buco; i numeri che sono cambiati (non tutti); rituali che si spuntano da soli |
| **Fronti** | l'elenco dei fronti col loro stato; la scheda di un fronte: obiettivo, brani o passi, sessioni, documenti, proposte in attesa |
| **Shell** | la conversazione, con la risposta che si scrive mentre arriva e le schede delle ricerche |

Tutto il resto (memoria, diario, taccuino, lavagna, fondo, lettere, riunione, Setup) si raggiunge da un menu, non
occupa la barra. L'ancora a un terzo dal basso resta (decisione del Ghost).

## Nessuna funzione persa: dove va ogni cosa

| oggi | in V3 |
|---|---|
| Specchio (numeri, Segui, agenda, stabilità, esperimenti) | **Oggi**: solo ciò che è cambiato; il resto in Fronti o nel menu |
| Shell (chat, proposte, ricerca, trova_dove, allegati, voce, Ascolta, Balthasar, riunione) | **Shell**, uguale nelle funzioni |
| Adam → Percorsi | **Fronti** (un percorso senza motore è un fronte spento) |
| Adam → Lavagna | menu; e in notifica come oggi |
| Adam → Memoria (quaderni), Storia (diario), Fondo, Lettere | menu |
| Bio / Air / Vidya (numeri, percorsi, memoria) | i numeri in **Oggi** quando cambiano; i percorsi in **Fronti** col loro pilastro; la memoria nel menu |
| Setup, Regolazione, copia, tour | menu |
| Notifiche: battiti, gesti, lavagna fissata, consegne | restano; si aggiungono la sessione in corso e la riunione dei fronti |

## Le fasi (ognuna è un APK installabile, banco verde, niente dati persi)

| fase | cosa | il Ghost ci guadagna |
|---|---|---|
| **1. Motore** | dati del fronte e della sessione (DB 16); la logica pura che pianifica una sessione sul tempo dato e aggiorna gli stati; prove | niente di visibile: è il telaio |
| **2. Sessione guidata** | «ho X minuti» → piano; la notifica che accompagna sopra Moises o YouTube con *pulito / errori / avanti*; velocità pulita in %; rituale che si spunta da solo | lo studio del basso guidato e misurato |
| **3. Fronte motorizzato** | turno di lavoro dello Shell per fronte, con forma verificata; il fronte del tributo aperto dallo Shell (scaletta proposta, fonti trovate) | il tributo che avanza anche quando non c'è |
| **4. Oggi e la riunione dei fronti** | la nuova schermata principale; la riga serale con Sì / No / dimmi | un posto solo da aprire, e un motivo per aprirlo |
| **5. Mappa del tempo** | buchi del calendario, silenzio nelle ore di lavoro, prima e dopo gli impegni | sessioni nel tempo che oggi passa |
| **6. Fluidità** | risposta che si scrive mentre arriva; conferma col gesto e annulla; vibrazioni sui momenti veri; Fronti e menu al posto delle sei schede | l'app che si sente leggera |
| **7. Proposte di fronti** | una a settimana al massimo, con le prove, un no che resta scritto | lo Shell che anticipa il passo |
| **8. Obliquo** | lo stesso schema sul piano alimentare e su un progetto di un altro campo | il motore su tutto |

## Vincoli che restano (non sono freni, sono limiti articolari)

- Ogni azione verso il mondo vuole un gesto del Ghost. «PhysioAlba» non esce mai. I dati dei pazienti mai: le ore di
  lavoro sono blocchi senza nomi.
- Il programma verifica, il modello dice: ogni lavoro autonomo dichiara la forma prima, il programma la controlla dopo.
- Il rituale non punisce: niente serie in rosso, niente frasi di perdita.
- Nessuna funzione si consegna senza averla provata dal vivo dove si può (lezione del 03/10).

## Come si misura se si indossa

Dal registro, non dalle impressioni: quante volte al giorno il Ghost apre l'app di sua iniziativa; quante interazioni
avvengono senza aprirla (notifiche); tocchi di conferma al giorno; passi avanti per fronte a settimana.

## Stato (aggiornato a ogni fase)

| fase | stato | note |
|---|---|---|
| 1. Motore | fatta (14/10) | DB 16; `logica/Pratica.kt`; un pezzo mai suonato non è «trascurato» |
| 2. Sessione guidata | fatta (14/10), da provare sul telefono | scheda Studio in cima a ogni percorso con nodi; notifica fissa `battito/Studio.kt` (blocco, conto alla rovescia, vibrazione a fine blocco, ✓/✗/→, tocco = apre la fonte); minuti → misura PRATICA (rituale `PRATICA>=N` si spunta da solo); resoconto nel diario. Senza velocità misurata conta lo stato del nodo |

| Nuova forma (16/10) | fatta | barra con tre luoghi: **Oggi** (adesso a un tocco, da decidere Sì/No/Dimmi, fronti mossi, rituali con Annulla, numeri mossi, Segui, agenda, esperimenti), **Fronti** (tutti i percorsi, urgenti in cima, + Fronte, scheda del fronte con Studio), **Shell**. Menu ☰: Numeri e rituali (lo Specchio intero), Bio, Air, Vidya, Adam, Setup. Ancora: Oggi, Fronti, Shell, 🎤, Auto. Le notifiche dello Specchio portano a Oggi |

| 3. Fronte motorizzato (16/10) | fatta | strumenti `regola_fronte` (scadenza, ritmo, prossimo passo) e `fonte_nodo` (il link deve venire da una ricerca del turno o da un messaggio del Ghost: uno inventato torna indietro); scheda **Motore** nel fronte (spento / ogni 1, 3, 7 giorni; prossimo passo); col motore acceso il battito apre un turno di lavoro dello Shell per fronte (al massimo 2 per battito), forma dichiarata prima (`logica/Fronte.kt`), conto delle proposte fatto dal programma, notifica che porta a Oggi. Trovato dalla prova: i risultati delle ricerche arrivavano al modello senza i link; ora ci sono |

| 5. Mappa del tempo (16/10) | fatta | `logica/Tempo.kt`: buchi fra gli impegni (8–22; gli eventi di tutto il giorno non occupano; i nomi non si guardano). Al battito del mattino una sveglia nel primo buco dopo l'ora scelta (Setup, predefinita 18:30); quando suona il programma ricontrolla (impegno in corso, via, studio già aperto) e propone fronte e pezzo con «Studia 20′ / Studia N′ / Non ora»: un tocco apre la sessione. In Oggi il tempo libero di adesso diventa la prima scelta; durante un impegno lo dice |

| 7. Proposte di fronti (16/10) | fatta | `proponi_fronte`: un fronte nuovo di iniziativa dello Shell, con perché, prove e pezzi (in Oggi «Dimmi di più» le mostra). Moderazione del programma (`Fronte.moderazione`): uno ogni 7 giorni, un no vale 60 giorni per un titolo simile. La domenica il battito apre il turno; se la settimana è già usata il modello non si chiama |
| 8. Obliquo (16/10) | fatta | DB 17, `Percorso.misura`: VELOCITA (da suonare, % pulita) o AVANZAMENTO (da fare: ✓ Fatto / ~ In parte / → Salta, il nodo sale di un gradino). Stesso motore per il piano alimentare, un progetto, un album. Si sceglie in «+ Fronte», nel Motore, o lo propone lo Shell (crea_percorso, regola_fronte, proponi_fronte con «misura») |
| 6. Fluidità | in parte | fatto: tre luoghi al posto di sei schede, Sì/No da Oggi, spunta con Annulla e vibrazione, tempo libero come prima scelta. **Non fatto: la risposta dello Shell che si scrive mentre arriva** (streaming): tocca il turno di lavoro in background e le chiamate con strumenti, e va provato dal vivo con una chiave — senza, non lo consegno |

| Look (16/10) | fatto | palette coerente (niente lilla di Material: selezioni ambra tenue, testi-pulsante ambra scura leggibili); schede col bordo neutro e una tacca di colore a sinistra al posto delle cornici colorate; la scheda «Adesso» piena (`SchedaForte`) con UN pulsante principale «Studia N′» e le altre durate accanto; riga di colpo d'occhio sotto la data («1 da decidere · 1 rituale da fare»); icone dei tre luoghi disegnate (sole, barre, nuvoletta) al posto dei pallini; nei tre luoghi niente titolo doppio in alto |

| Scoperte (19/10) | fatta | «qualcosa di strabiliante e inaspettato»: `logica/Scoperte.kt` cerca da solo relazioni nei dati (rituali, studio, allenamento, giorni con più passi o più sonno → sonno, passi, battito a riposo, studio; lo stesso giorno o il dopo). Prova per permutazione (3000), Benjamini–Hochberg al 5%, p ≤ 1/1000, effetto minimo che conti nella vita, e deve reggere in entrambe le metà del periodo. Il banco: 50 mondi di puro rumore, zero scoperte false. In Oggi «Una cosa che non sapevi» con «Mettila alla prova» (esperimento di 14 giorni) e «Interessante»; notifica al mattino, una a settimana; lo Shell le conosce come correlazioni, non cause |

| Ritratto di Adam (19/10) | fatto | `logica/Ritratto.kt` (modello deterministico) + `ui/RitrattoUi.kt` (disegno animato: respira, gira piano, scintille del giorno). In cima a Oggi; a schermo intero con legenda; widget sulla schermata principale (`battito/Widget.kt`, si ridisegna al battito e all'apertura); sfondo col gesto del Ghost |

| Prova generale (19/10) | fatta | `logica/Prova.kt` + `ui/ProvaUi.kt`: la scaletta a schermo intero, schermo sempre acceso; tocco avanti, pressione lunga «perso il filo»; sessione con nota PROVA che non tocca i pezzi; resoconto con le durate vere nel diario |

Scostamento dal piano: niente `ui3/` accanto alla vecchia. La cornice nuova sostituisce la vecchia subito, perché le schermate
vecchie restano raggiungibili dal menu: nessuna funzione persa, nessuna doppia interfaccia da tenere allineata.

Da guardare dal vivo: la vibrazione a fine blocco sopra Moises; il link di Moises si apre nell'app Moises o nel browser.
