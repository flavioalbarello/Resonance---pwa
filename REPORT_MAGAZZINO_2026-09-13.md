# Il magazzino dei testi — 13/09/2026

L'ultimo punto aperto del controllo di ingegneria: i corpi dei documenti uscivano dal tetto di
localStorage e non ci stavano più. **Chiuso.**

700 prove verdi (+21). Verifica di rottura su sette punti: **sette mordono**.
Provato in Chromium con l'IndexedDB **vero**, non solo col mio finto.

---

## Il conto

| | capienza in localStorage |
|---|---|
| prima | **~1.075 documenti** da 4.000 caratteri |
| dopo | **~21.000** — e non sono i testi a occuparla, è il loro indice |

Dei documenti in localStorage resta solo la scheda (id, nome, titolo, data, lunghezza): **190 byte**
invece di 4.000. Al ritmo peggiore che avevamo ipotizzato — 67 documenti al mese — quell'indice
riempirebbe lo spazio in **tre secoli**. I testi stanno nel magazzino, che di MB ne tiene centinaia.

**È una soluzione, non un rinvio**: il tetto smette di essere raggiungibile da qualcuno che scrive
testo. Tornerebbe vero il giorno in cui ci si volessero tenere immagini o audio — decisione diversa,
da prendere quando si presenta.

---

## Come, e perché è un blocco piccolo

La scelta che ha evitato la riscrittura: **la forma dei dati in memoria non cambia**.

| | |
|---|---|
| stato React | documenti **completi**, col loro `text`, come sempre |
| gli 8 punti che leggono `d.text` | **non toccati** |
| il file di sync verso Drive | **porta ancora i testi** |
| cambia solo | il confine con localStorage: 3 letture e 6 scritture |

All'avvio si apre il magazzino e i testi vanno in RAM **prima** che l'app si disegni. Da lì in poi
ogni lettura resta sincrona com'era: `useState(() => leggiPercorsi(...))` trova la mappa già piena.
È l'unico momento asincrono di tutta la faccenda.

### Una cosa che ti avevo promesso e che NON ho fatto

Ieri ho scritto che togliendo i testi dal bundle di sync il push si sarebbe dimezzato «gratis».
**Non l'ho fatto, e il gratis non c'era.** Se i testi escono dal file di sync, i documenti smettono
di arrivare sull'altro telefono. Quella è una capacità, non un costo: il risparmio di rete si
sarebbe pagato con «i documenti di Marta non arrivano più». Il bundle resta com'era.

---

## I tre punti difesi, in ordine di quanto farebbero male

### 1 · Il backup, che è il pezzo che non si poteva sbagliare

Se i testi escono da localStorage e il backup continua a leggere solo lì, il file scaricato
**sembra** completo — stesso nome, stesse chiavi, stesso numero di voci — e non contiene più il tuo
lavoro. Silenzioso, come i difetti dell'11/09.

Per questo il backup ha imparato a leggere il posto nuovo **prima** che qualcosa si spostasse, e non
dopo. Verificato nel browser vero, scaricando il file davvero:

| | |
|---|---|
| localStorage contiene i testi | **no** |
| il file di backup li contiene | **sì** — 4.270 caratteri su 4.270 |
| lo specchio `syncState` | 4.270 caratteri |
| campi di servizio del magazzino nel file | nessuno — forma identica a ieri |
| la chiave API | ancora esclusa |

Il **formato del file non cambia**: un backup fatto oggi si ripristina su una versione vecchia
dell'app, e uno fatto ieri si ripristina su questa.

### 2 · Niente si toglie senza una prova di consegna

Stessa regola degli archivi della chat. L'ordine è: in RAM → **su disco col testo dentro, come
prima** → il magazzino scrive → si **rilegge e si confronta il testo** (non la lunghezza) → solo
allora si riscrive la copia leggera.

**In nessun istante il testo esiste solo in memoria.** Se il magazzino rifiuta, se la rilettura non
combacia, se la migrazione si interrompe a metà: il testo resta dov'è sempre stato, e il giro dopo
si riprova. La migrazione è idempotente.

### 3 · Se il magazzino non c'è, tutto come prima

Finestra privata di Safari, browser vecchio, permessi negati: `_idbAttivo` resta falso e il testo
continua a stare in localStorage. **Nessuna funzione sparisce**, torna solo il tetto di ieri.
Un magazzino che non si apre non deve impedire all'app di partire — provato anche questo.

E un documento il cui testo non si trova più **lo dichiara** (`testoIntrovabile`) invece di aprirsi
vuoto: il nome resta, così si sa cosa manca.

---

## Verifica di rottura

Sette righe rotte una per volta, ognuna rimessa a posto. **Sette mordono.**

| riga rotta | prova diventata rossa |
|---|---|
| il backup che rimette dentro i testi | «il backup contiene i testi…» (3 prove) |
| la verifica di rilettura prima di alleggerire | «se il magazzino rifiuta la scrittura…» |
| la verifica nella migrazione | «la migrazione non toglie niente se non conferma» |
| il ripiego quando il magazzino non c'è | «senza magazzino non si tocca niente» |
| i campi di servizio tolti al rientro | «lo stato in memoria ha i documenti completi» |
| il documento introvabile che si dichiara | «un testo sparito si dichiara» |
| la scrittura su disco prima della conferma | «se il magazzino rifiuta, il testo resta» |

Una delle sette era la mia: la prova «la forma che viaggia non cambia» è **nata rossa** perché
lasciavo i due campi di servizio attaccati al documento anche dopo il rientro del testo. Aveva
ragione lei.

### E una cosa che il banco da solo non avrebbe visto

Il banco gira su un IndexedDB che ho scritto io. Se il mio finto fosse più indulgente di quello vero
— sui tempi delle transazioni lo è facilmente — sarebbe restato verde mentre l'app si rompeva sul
tuo telefono. Per questo c'è anche la prova in Chromium, con l'IndexedDB del browser:

- migrazione: `percorsi-vidya` da 4.500 a **527 byte**, chiavi `d1`/`d2` nel magazzino
- riavvio: il percorso si vede, il documento dichiara i suoi 4.270 caratteri, il testo si riapre intero
- confronto con il codice di ieri: **comportamento identico a schermo**, che è il punto

---

## Dove il banco non arriva, e lo dico

«Il magazzino si apre prima che l'app si disegni» è una proprietà d'**ordine fra due righe**, e resta
una lettura del testo del sorgente, non una prova di comportamento.

È la **quinta** occorrenza in cinque giorni: il gate dei Semi (09/09), il filtro sulle negazioni
(10/09), `perLaVoce` dentro `speakText` (11/09), il blocco delle capacità del turno (12/09), e
adesso questa. Cinque volte in cinque giorni non è una serie di dimenticanze: è un limite
strutturale del banco. La domanda da portarsi avanti non è più «come la provo», è **«cosa dovrebbe
cambiare nel modo di scrivere il codice perché questa classe di proprietà diventi provabile»**.

---

## Cosa vedrai cambiare

Niente. Ed è il risultato: i documenti si aprono, si cercano e si rileggono come prima, anche senza
rete, e arrivano sull'altro telefono come prima.

L'unica cosa osservabile è alla **prima apertura dopo l'aggiornamento**: i documenti che hai già si
spostano da soli nel magazzino, in un secondo, mentre guardi l'Hub. Non c'è niente da toccare.

In Setup, se cercassi, vedresti che lo spazio occupato dal browser è crollato.

---

## Cosa resta aperto

1. **La quinta proprietà d'ordine indifesa** (sopra). È l'unico punto che si ripete.
2. Dal giro prima: la regola d'inventario che insegna la negazione, `TETTO_DOCUMENTO_IN_RICERCA`,
   l'osservabile «stabilità mantenuta», i tre serbatoi.
