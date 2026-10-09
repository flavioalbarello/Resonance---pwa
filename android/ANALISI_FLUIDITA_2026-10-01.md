# Fluidità dell'app, in vista di Marta — 01/10/2026

Chiesta nella riunione del 01/10, con un vincolo del Ghost: a Marta non si propone l'app finché non vale la pena.
Ogni riga ha la prova nel codice. Si dice cosa è corretto in questa consegna e cosa no.

## Corretto in questa consegna

| problema | prova | correzione |
|---|---|---|
| La chat rilegge **tutti** i messaggi a ogni messaggio nuovo, da quando l'app esiste | `MessaggiDao.tutti()` raccolto `Eagerly` in `Adam.messaggi`, usato dalla chat | La chat legge una finestra: gli ultimi 200 (`osservaUltimi`). «Mostra i messaggi precedenti» ne aggiunge altri 200. L'elenco completo si legge solo mentre la Regolazione è aperta (`WhileSubscribed`) |
| Aprendo la chat, scorre animata dal primo messaggio all'ultimo | `animateScrollToItem(size-1)` legato a `messaggi.size` | Si apre già in fondo. L'animazione resta solo per un messaggio nuovo quando sei già in fondo. La chiave è l'ultimo id: caricare i precedenti non ti riporta giù |
| Lasciata aperta oltre mezzanotte, lo Specchio resta a ieri: serie, «oggi sì/no» | `Istantanea(LocalDate.now(), …)` calcolato solo quando cambiano i dati | Il giorno si rilegge a ogni ritorno nell'app (`alRitorno`) |
| «Sono via» toccato per sbaglio e ritirato subito: consegne ed esperimenti slittavano di un giorno, e il giorno risultava in pausa | `torna`: `fine = max(da, oggi-1)`, quindi almeno un giorno | Ritirato lo stesso giorno = un tocco sbagliato. Non si sposta niente e nessun giorno va in pausa. La voce resta nel diario con «ritirato» (Legge 14) |

## Da decidere: non corretto, perché non è piccolo o è una scelta

| # | problema | prova | proposta | peso |
|---|---|---|---|---|
| 1 | **La risposta arriva tutta insieme.** Il modello scrive a pezzi, ma lo schermo mostra solo la barra finché non ha finito: 10–30 s di vuoto | `OpenRouter` usa `stream: true` e accumula in `testo`. Il turno gira in `TurnoWorker` e scrive il messaggio solo alla fine | Un flusso in memoria (processo unico) dal worker alla chat; il testo parziale si mostra in una bolla provvisoria. Il messaggio definitivo resta quello scritto alla fine | **alto**: è la prima cosa che Marta sentirebbe come lenta |
| 2 | **Il primo avvio è vuoto.** Niente spiega cosa fare; senza chiave lo Shell risponde «Manca la chiave OpenRouter: si mette in Setup» | `Shell.kt:83`; nessuna schermata di benvenuto | Per Marta la chiave la mette il Ghost. Serve un primo avvio in tre passi: nome, permessi (notifiche, Health Connect), una domanda dello Shell | alto |
| 3 | **Setup è una pagina sola, lunga e tecnica.** Slug OpenRouter, modello leggero, modello per la vista, cassetta GitHub con token, nomi protetti | `Setup.kt`, 289 righe in una colonna | Una sezione chiusa «Avanzate», con motore, cassetta e regolazione. In vista restano nome, battito, sensori, calendario e copia | medio |
| 4 | **Funzioni del Ghost visibili a tutti.** Riunione a tre, consulente, Balthasar, lettere all'architetto, fondo di Adam | `AdamUi.kt`: «Riunione a tre», «Fondo di Adam», «Controlla ora» | Non toglierle: nasconderle finché non si accendono. Per Marta l'architetto non esiste | medio |
| 5 | **Il prompt cresce a ogni funzione.** Ogni turno porta tutte le regole e circa 27 forme di azione | `Contesto.sistema`, 96 `appendLine`; `Azioni` | Misurare prima: lunghezza del prompt e secondi per turno, dal registro dei turni. Poi, come per `CAPACITA` della PWA, un indice più le schede del turno | da misurare |
| 6 | **Ogni turno rilegge tutto il diario** (`voci`) per sapere se il Ghost è via | `istantanea`: `db.voci().elenco()` | Basta una query sulle voci con fonte «assenza». Oggi non pesa: diventa visibile con anni di diario | basso |
| 7 | Sei schede in basso più Setup: Specchio, Shell, Adam, Bio, Air, Vidya | `App.kt` | Vanno bene per chi conosce i pilastri, e Marta li conosce dalla PWA. Non toccare | — |

## Che cosa non è stato misurato

- Nessuna prova su un telefono vero da qui: niente tempi reali di apertura, scorrimento o turno.
- I numeri utili sono già nel registro dei turni (Adam → Regolazione).
- Prima del punto 1, il Ghost può guardare quanto dura un turno tipico sul suo GT6.

## Ordine consigliato, se si procede

1. Risposta a pezzi (1): cambia la sensazione di tutta l'app.
2. Primo avvio (2) e Setup con le Avanzate (3): cambiano l'ingresso di Marta.
3. Funzioni del Ghost nascoste (4).
4. Misura del prompt (5): solo con i numeri in mano.
