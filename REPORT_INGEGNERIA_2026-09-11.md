# Controllo di ingegneria — 11/09/2026

Tre passaggi, in quest'ordine: lettura completa → prova di sforzo severa → seconda lettura alla luce
di quello che la prova ha mostrato. Nessuna modifica al codice: qui ci sono reperti e proposte.
Base: `claude/new-session-ru1gir`, allineato a `main` `913e7f9` e `stable` `1e44ee6`. 627 prove verdi.

Ogni riga di questo rapporto ha un numero misurato dietro. Dove non l'ho misurato, lo scrivo.

---

## Il reperto più grave: il tetto di spesa non può scattare

`operazioniAutomaticheConsentite()` ferma le cose che partono da sole quando la spesa del mese
supera 5 $. Chiama `spesaDelMeseCorrente()`, che somma le voci `ai-cost` dentro `debug-log`.

`debug-log` tiene **50 voci**. `pushDebugLog` fa `.slice(0, 50)` a ogni scrittura.

Un turno di chat produce fino a 6 voci `ai-cost` (risposta, lenti, due accettori, memoria, stile)
più 2 non-costo (sync). La finestra vera del tetto:

| | |
|---|---|
| finestra dichiarata | un mese |
| finestra reale | 50 voci ≈ **6 turni** |
| massimo che `spesaDelMeseCorrente` possa mai riportare | **0,14 $** |
| soglia da superare | 5 $ |

Simulazione su 30 giorni, 20 turni/giorno:

| giorno | spesa reale | spesa che il programma vede | tetto scattato |
|---|---|---|---|
| 1 | 0,34 $ | 0,10 $ | no |
| 7 | 2,35 $ | 0,10 $ | no |
| 15 | **5,04 $** | 0,10 $ | **no** |
| 30 | 10,08 $ | 0,00 $ | no |

Il giorno 15 la spesa reale supera il tetto e non succede niente. Il giorno 30 il valore visto è
zero: le 50 voci sono tutte del mese nuovo.

C'è una **seconda cecità indipendente**: `costUsd` viene valorizzato solo se OpenRouter restituisce
davvero il campo `cost` (riga 3026, «mai stimato»). Se il fornitore non lo manda, ogni voce vale
null e la somma è zero comunque. Il commento alla riga 3008 lo sospettava già; nessuno è tornato a
verificarlo.

Stesso difetto nel pannello Setup: `spesaMese` alla riga 9674 legge lo stesso log da 50 voci. Il
cruscotto dei costi dice 0,10 $ dove il conto vero è 10 $.

**È il caso puro della regola di casa**: il programma *dice* di avere un tetto, ma va a cercare la
prova in un posto dove è già stata buttata via.

### Proposta — un contatore che non dipende dal log

Una chiave sola, `spesa-mensile`, `{ mese: "2026-09", usd: n, chiamate: n, tokenIn: n }`.
`logAiCost` la incrementa; cambia mese, si azzera e la precedente scivola in uno storico di 12 voci.
Non è un log, è un totalizzatore: non ha tetto perché non cresce.

E quando `costUsd` è null — cioè spesso — **si stima**: token × listino del modello, con la voce
marcata `stimato: true`. Un tetto che si ferma solo davanti a un numero certificato dal fornitore è
un tetto che non si ferma mai. Meglio un numero dichiaratamente stimato che nessun numero.

Costo: ~25 righe. Il pannello Setup legge la stessa chiave e smette di mentire.

---

## Il secondo: la Legge 14 si rompe in silenzio quando la quota è piena

`compactShellChatIfNeeded` archivia i messaggi vecchi e li toglie dalla vista attiva. Due righe:

```js
saveKey(archiveKey, overflow);   // il ritorno non viene guardato
const marker = { content: `— ${overflow.length} messaggi ... archiviati localmente (chiave: ${archiveKey}) ... nulla è andato perso ...` };
```

`saveKey` è `try { setItem } catch { return false }`. Riproduzione fedele delle stesse righe, con
un `localStorage` che rifiuta:

| | quota libera | QUOTA PIENA |
|---|---|---|
| chat attiva | 41 → 25 messaggi | 41 → 25 messaggi |
| il segnaposto dice | «archiviati, chiave: X» | «archiviati, chiave: X» |
| quella chiave contiene | 17 messaggi | **niente, la chiave non esiste** |
| recuperabili | 17 su 17 | **0 su 17** |
| errore mostrato | nessuno | nessuno |

I due casi sono indistinguibili dall'esterno. Il segnaposto non solo non avvisa: **afferma il falso**
e indica una chiave che non c'è. Questo è esattamente il difetto che la Legge 14 esiste per
impedire, e succede proprio quando la memoria è piena — cioè quando la compattazione scatta di più.

Non è un caso isolato: **76 chiamate a `saveKey` in tutta l'app, zero controllano il ritorno.**
Dimostrato a quota simulata: `registraTrappola` restituisce l'oggetto come se fosse salvato, in
memoria non c'è niente, nessun errore, nessuna riga di registro.

### Proposta — il fallimento diventa visibile in un punto solo

`saveKey` non cambia firma (76 chiamanti). Aggiunge un effetto: al `catch`, scrive una bandiera in
memoria di processo (non in localStorage — è pieno) e la App mostra una striscia rossa persistente
*«la memoria del dispositivo è piena: da adesso le cose nuove non si salvano»*, con il pulsante che
porta al backup. Una riga, un punto solo, copre tutti e 76.

E `compactShellChatIfNeeded` diventa l'unico chiamante che controlla davvero: `if (!saveKey(...))
return null` — **non compattare è meglio che compattare perdendo**. La chat resta lunga, il bundle
resta pesante, ma niente sparisce. È l'ordine giusto fra i due mali.

---

## Il terzo: la quota finisce, e la data si può scrivere

Proiezione lineare dai dati veri (10 documenti da ~4000 caratteri in un percorso dopo tre settimane):

| | percorsi | messaggi | occupato | quota 5 MB |
|---|---|---|---|---|
| 1 mese | 5 | 600 | 673 kB | 13% |
| 6 mesi | 20 | 3.600 | 3.649 kB | **71%** |
| 12 mesi | 40 | 7.200 | 8.002 kB | **156% — muro** |
| 24 mesi | 80 | 14.400 | 17.488 kB | 342% |

Chi consuma, a 24 mesi: documenti dei percorsi 45%, **chat e archivi 48%**, log dei pilastri 4%,
Magi 3%, debug 0%.

Gli archivi sono metà del problema e **non vengono mai cancellati**: `removeItem` compare **zero
volte** nell'intera app. La compattazione scatta ogni 40 messaggi e ne archivia ~16; le chiavi
`shell-chat-archive-*` si accumulano per sempre. Sono nel backup (raccolte per prefisso), quindi
sono recuperabili — ma restano anche sul dispositivo, per sempre, nello stesso spazio da 5 MB.

### Proposta — gli archivi vanno dove c'è posto, non dove non ce n'è

Non cancellarli: **spostarli**. Il sync su Drive esiste già e ha spazio. Gli archivi più vecchi di
N (diciamo 3) salgono nel file di sync e lasciano il dispositivo; quelli recenti restano locali.
È Legge 14 rispettata meglio di adesso, non peggio: oggi sono in un posto che sta per riempirsi.

Secondo intervento, indipendente: i **documenti dei percorsi** (45%) non hanno bisogno di stare
tutti in localStorage. Sono testo, si leggono raramente, e sono già su Drive quando il sync è
acceso. Locale il titolo e le prime righe, il corpo si rilegge alla bisogna.

Senza nessuno dei due: il muro cade fra il sesto e il dodicesimo mese di uso, e cade nel modo
descritto sopra — in silenzio.

---

## Il quarto: la scia su Drive cresce col quadrato

`syncIfEnabled` chiama `createDriveFile` — **un file nuovo** ogni volta, con un nome datato. E il
contenuto è `formatBioLog(n)`, cioè **la lista intera**, non la voce aggiunta. 14 punti di chiamata:
tre pilastri, Magi, tre Percorsi, Semi, Kernel.

A 3 scritture al giorno su **un solo** pilastro:

| | file creati | occupato su Drive |
|---|---|---|
| 30 giorni | 90 | 0,5 MB |
| 90 giorni | 270 | 4,3 MB |
| 180 giorni | 540 | 17,0 MB |
| 365 giorni | 1.095 | **69,8 MB** |
| 730 giorni | 2.190 | **279,2 MB** |

Moltiplicare per il numero di pilastri attivi. Il Drive del Ghost si riempie di migliaia di file
ognuno dei quali contiene il precedente più una riga.

Nota: `aggiungiDaLettura` passa di qui, e quella è automatica — un file nuovo a ogni lettura che lo
Shell scrive da solo, senza che nessuno lo chieda.

### Proposta — versionare il file, non moltiplicarlo

Drive tiene le revisioni di un file da solo. Un file per etichetta, aggiornato con `PATCH`, e le
versioni precedenti restano nella cronologia di Drive senza occupare un nome nuovo. Legge 14 è
soddisfatta dal versionamento di Drive, che è più robusto di 1.095 file con la data nel titolo.

Se si vuole tenere la forma attuale: un file nuovo **solo al cambio di giorno**, non a ogni
scrittura. Da 1.095 file/anno a 365, e ognuno con il contenuto di fine giornata.

---

## Il quinto: il bundle di sync sale intero a ogni messaggio

L'autosave dipende da `shellChat`. Ogni messaggio — del Ghost e dello Shell — fa partire, dopo 2
secondi, un `syncCore` che **scarica e ricarica tutto lo stato**.

| stato | per push | rete a ogni modifica | su 4G a 2 Mbit/s |
|---|---|---|---|
| 40 messaggi, 50×3 voci | 64 kB | 129 kB | 0,5 s |
| 200 messaggi, 200×3 voci | 223 kB | 446 kB | 1,8 s |
| 600 messaggi, 500×3 voci | 585 kB | 1.171 kB | 4,8 s |
| 1.200 messaggi, 800×3 voci | 1.060 kB | 2.120 kB | 8,7 s |

A 40 messaggi al giorno e un anno di dati: ~47 MB di traffico dati al giorno, per tenere sincronizzati
pochi kB di novità. In macchina, in 4G, è la cosa che fa sembrare l'app lenta senza che niente sia lento.

### Proposta — l'autosave non guarda la chat

Due mosse, entrambe piccole:

1. **Togliere `shellChat` dalle dipendenze dell'autosave** e sincronizzare la chat a intervallo
   (ogni 2 minuti) o alla chiusura della schermata. Un messaggio di chat non è un dato che si perde
   se arriva su Drive trenta secondi dopo: è già in localStorage.
2. **Il debounce di 2 s diventa una finestra di 20 s**, con push immediato solo quando il Ghost
   tocca "Sincronizza ora". Durante una conversazione fitta si passa da 40 round-trip a 2-3.

Costo: quattro righe. Nessun dato in meno, nessun conflitto in più (il merge è già fatto per questo).

---

## Il sesto: il 79% del prompt fisso è un blocco che non cambia mai

| blocco | caratteri | ≈ token |
|---|---|---|
| `PILLAR_CTX.bio` | 511 | 146 |
| `PILLAR_CTX.air` | 481 | 137 |
| `PILLAR_CTX.vidya` | 667 | 191 |
| `PILLAR_CTX.formato` | 1.692 | 483 |
| **`APP_CAPABILITIES_CONTEXT`** | **34.446** | **9.842** |
| regole cablate nel template | 5.549 | 1.585 |
| **totale fisso per turno** | | **12.384** |

Il variabile (20 messaggi di storico + inventario) è ~4.168 token. Ingresso per turno ≈ 16.552,
**fisso il 75%**, e dentro il fisso `APP_CAPABILITIES_CONTEXT` è il **79%**.

Il conto in denaro, 20 turni/giorno × 2 utenti × 30 giorni:

| | token in/mese | Llama 3.3 70B | modello a 3 $/Mtok |
|---|---|---|---|
| turno magro (sola risposta) | 19,9 M | 2,38 $ | 60 $ |
| turno pieno (lenti, accettori, memoria, stile) | 28,1 M | 3,37 $ | 84 $ |
| **il solo blocco capacità** | **11,8 M** | **1,42 $** | **35 $** |

**Sul modello di oggi non è un problema di soldi.** 3,37 $/mese. Lo scrivo perché sarebbe disonesto
presentarlo come un'emergenza di cassa. È un problema di altre due cose: la finestra di contesto
(12.384 token occupati prima che il Ghost abbia detto una parola) e il giorno in cui il modello
cambia — quel giorno il conto si moltiplica per 25 senza che nessuno tocchi una riga.

### Proposta — l'indice sempre, la scheda quando serve

Il blocco esiste per un motivo solo: distinguere «il Ghost nomina una feature» da «il Ghost parla
della sua vita». Per riconoscere, basta il **nome**. La scheda serve solo quando il nome è stato
davvero nominato.

- **Indice**: i 71 nomi, in una riga sola → **712 token**, sempre presente.
- **Nucleo**: le ~12 schede che lo Shell deve poter *proporre* senza essere interrogato (Percorsi,
  Semi, documenti, calendario…) → sempre presenti.
- **Richiamate**: le schede il cui nome compare nel messaggio del turno o nella finestra recente.

| | token | vs oggi |
|---|---|---|
| oggi | 9.842 | — |
| indice + nucleo + 0 richiamate | 2.272 | **−77%** |
| indice + nucleo + 4 richiamate | 2.792 | **−72%** |
| indice + nucleo + 8 richiamate | 3.312 | −66% |

Ingresso per turno da 16.552 a ~9.500. E il meccanismo è quello di casa: il nome dice, il programma
va a prendere la scheda davvero.

Il pezzo che rende la cosa difendibile con una prova: il banco può verificare che **ogni nome
dell'indice ha una scheda** e che **ogni scheda è raggiungibile dal proprio nome** — cioè che il
richiamo non perde niente. Senza quella prova è un'ottimizzazione che si porta via pezzi di sapere
in silenzio, che è il difetto che l'ottimizzazione dovrebbe evitare.

---

## Minori, ma veri

**I byte NUL alla riga 5028 rendono `app.js` binario per grep.** Due `"\x00"` letterali usati come
separatore in `chiaveStabile`. Git li digerisce (il suo fiuto guarda i primi 8.000 byte, il NUL è
al 425.408°) e i diff si vedono. Ma `grep` e `rg` rispondono *«binary file matches»* e non mostrano
una riga: ogni ricerca nel file principale del progetto, mia o di chiunque, torna cieca finché non
si aggiunge `-a`. Correzione: `" "` al posto di `"\x00"` — stesso identico valore a runtime,
file di nuovo testo. Due caratteri.

**`diagnosiDegenerazione` è la funzione più lenta misurata (105 ms su 500 kB) e non è un problema.**
Viene chiamata una volta per risposta, e una risposta dello Shell non arriva a 8 kB. Lo scrivo per
non lasciare un numero grosso senza il suo contesto: alla dimensione che vede davvero costa meno di
2 ms.

---

## Cosa la prova di sforzo ha trovato SANO

Un controllo che elenca solo guasti non è un controllo. Otto sezioni, nessun crollo:

| | misura |
|---|---|
| `cercaNellaMemoria` | 9,5 ms a 10 documenti → 40,4 ms a 500 |
| `fondiOAggiungiVoce` | ≤ 0,2 ms anche con 500 voci dello stesso giorno |
| `costruisciInventario` | **tetto a 739 token** qualunque sia il numero di percorsi |
| `dossierPercorso` | tetto a ~1.050 token |
| `perLaVoce` | 1,1 ms su 500.000 caratteri |
| `mergeSyncState` | 70,2 ms su 20.000 voci per pilastro |
| riga singola da 1 MB | 112 ms |
| elenco da 50.000 voci | 156 ms |

**Nessuna espressione regolare è esplosa.** Su testi patologici costruiti apposta per farle
esplodere (backtracking catastrofico), nessuna ha superato il tempo lineare. Non era scontato: il
file ne contiene decine scritte a mano.

Altre cose trovate in ordine, cercandole:
- **Nessuna lettura di localStorage nei corpi di render.** Le 45 `loadKey` stanno negli
  inizializzatori di `useState` o dentro funzioni chiamate su evento.
- **Zero `useMemo` e non servono**: non c'è calcolo pesante in un corpo di componente. `useMemo` qui
  sarebbe cerimonia.
- **Le porte funzionano davvero.** `meritaLetturaMultiLente` e `meritaBozza` sono a costo zero e
  tagliano le chiamate prima che partano: il turno magro costa il 71% del turno pieno.
- **I tetti ci sono dove servono**: registro azioni 60, debug 50, trappole, plasmidi, generazioni,
  note di rete 20, json-failures 10, ultime chiamate. I log dei pilastri non ne hanno, ed è giusto:
  sono dati del Ghost, tagliarli sarebbe la sovrascrittura distruttiva.
- **Un solo `catch {}` vuoto** su 97 `catch`, ed è quello documentato nella coda degli sfondi.
- **La storia della chat verso il modello è limitata a 20 messaggi**, quindi il costo per turno non
  cresce con la lunghezza della conversazione.

---

## Ordine di intervento, se si procede

| | reperto | perché prima | costo |
|---|---|---|---|
| 1 | tetto di spesa cieco | è un presidio di sicurezza che non esiste | ~25 righe |
| 2 | `saveKey` che fallisce muto | perdita di dati silenziosa, già oggi possibile | ~10 righe |
| 3 | autosave che guarda la chat | il più grosso guadagno per riga toccata | ~4 righe |
| 4 | scia su Drive | cresce col quadrato: ogni mese di attesa costa di più | ~15 righe |
| 5 | indice delle capacità | −43% sull'ingresso, ma vuole il suo banco | ~60 righe + prove |
| 6 | archivi e documenti fuori dalla quota | il muro è a 6-12 mesi, c'è tempo | più grosso |
| 7 | ` ` al posto di `\x00` | due caratteri | 2 caratteri |

I primi quattro sono piccoli e indipendenti fra loro. Il quinto è quello che cambia di più la forma
del sistema e va fatto con l'accettore accanto, non a valle — altrimenti è la stessa storia del
filtro che scarta e non insegna.

Nessuna riga di codice è stata toccata per scrivere questo rapporto.
