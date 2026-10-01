# Fluidità, seconda lettura: con la lente dell'esoscheletro — 01/10/2026

V2 di `ANALISI_FLUIDITA_2026-10-01.md`, che resta com'era (Legge 14). La prima lettura misurava la velocità: secondi
di attesa, scorrimento, pagine lunghe. Il Ghost ha chiesto di rileggerla con il discorso del 23/09, quello da cui è
nato l'APK: **un esoscheletro sente da solo, prende l'iniziativa, toglie peso**. Quindi la domanda giusta non è
«quanto è veloce», ma **quanto lavoro fa Marta per l'app**.

## Cosa cambia nella diagnosi

La prima lettura aveva in cima la risposta che arriva tutta insieme. È un fastidio vero, ma riguarda il momento in cui
Marta è già dentro l'app. Un esoscheletro si giudica prima: quante volte deve entrarci, e quante cose deve dirgli a
mano.

## I sette organi, oggi, per un secondo Adam

| organo | stato | prova | lavoro che resta a Marta |
|---|---|---|---|
| 1. Sensi passivi | **solo BIO** | `sensi/Sensi.kt` legge peso, sonno, passi, FC, allenamenti. `ENTRATA`, `PRATICA` e `OPERA` (AIR e VIDYA) non hanno un sensore | AIR e VIDYA si dicono a mano, o non esistono |
| 2. Anello sugli esiti | c'è | esperimenti, ristagno, Specchio sugli esiti | — |
| 3. Iniziativa | **a metà** | Il battito scrive per primo, ma nessuna notifica ha un'azione: nel codice non c'è `addAction` né `RemoteInput` | Per rispondere alla domanda della sera o spuntare un rituale deve aprire l'app, trovare la chat e scrivere |
| 4. Cervello affidabile | non misurato | Il prompt porta ogni regola a ogni turno (`Contesto.sistema`, 96 righe di regole più le forme delle azioni) | Rileggere e correggere |
| 5. Poca interfaccia | **cresciuta** | Setup ha 289 righe in una colonna. `Capacita.SOLO_GHOST` ha 16 voci. Riunione, consulente, Balthasar, lettere e fondo sono visibili a tutti | Orientarsi fra cose che non sono per lei |
| 6. Memoria leggibile | c'è | quaderni, taccuino con il tipo, diario | — |
| 7. Supporto solido | a metà | Room più copia manuale; nessun backup automatico | Ricordarsi di salvare la copia |

## Il segnale d'allarme del 23/09, misurato di nuovo

Allora: «lo sforzo va dove porta la curiosità, non dove sta lo scopo».

| | righe |
|---|---|
| Macchina delle riunioni: `Tavolo`, `Consulente`, `Balthasar`, `Cassetta` | 631 |
| Sensi ed esiti: `Sensi`, `Esiti`, `Stabilita`, `Fondo` | 346 |

La riunione è uno strumento di costruzione, ed è servita: le decisioni di oggi sono nate lì. Ma Marta non la userà
mai, e dal 23/09 è cresciuta quasi il doppio degli organi.

## L'ordine, rifatto con la lente

| # | mossa | organo | perché prima |
|---|---|---|---|
| 1 | **Notifiche che si rispondono senza aprire l'app**: «Fatto» su un rituale; risposta scritta o dettata direttamente alla domanda della sera e della domenica (`RemoteInput`), che entra in chat e lo Shell la legge | 3, 5 | È il punto in cui oggi l'esoscheletro chiede di essere indossato a mano. Per Marta vale più di qualunque schermata |
| 2 | **Primo avvio che sente prima di chiedere**: un gesto per collegare Health Connect e notifiche; poi la prima settimana lo Specchio si riempie da solo. Niente moduli da compilare | 1, 5 | Il primo giorno decide se l'app è un peso o un aiuto |
| 3 | **Ciò che non è suo resta chiuso**: «Avanzate» in Setup; riunione, lettere, consulente e fondo nascosti finché non si accendono | 5 | Meno superficie, a parità di funzioni |
| 4 | **Risposta a pezzi** | 4, 5 | Resta, ma dopo: riguarda chi è già dentro |
| 5 | **AIR e VIDYA senza sensore**: non si costruiscono sensori finti. Si chiede la cosa giusta al momento giusto (la regola del 01/10): la domanda della domenica può chiedere anche le ore di pratica, e la risposta diventa un numero solo se Marta conferma | 1 | Nessun sensore esiste. La domanda è il sensore meno pesante |
| 6 | **Misurare il prompt** prima di toccarlo | 4 | Solo con i numeri in mano |
| 7 | **Copia automatica** in una cartella scelta da lei | 7 | Un dato che dipende da un gesto sparisce il giorno in cui il gesto costa fatica |

Le quattro correzioni già consegnate restano giuste anche con questa lente: chat a finestra, apertura in fondo,
giorno riletto, «Sono via» ritirato. Tolgono peso senza aggiungere superficie.

## Limiti

Nessuna misura su un telefono vero. I conteggi di righe dicono dove è andato lo sforzo, non quanto vale.
