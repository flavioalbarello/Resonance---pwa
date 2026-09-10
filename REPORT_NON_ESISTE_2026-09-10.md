# «Non esistono» — un difetto in quattro pezzi, e cosa insegna

**Data:** 10/09/2026 · **Build:** `2026-09-10 · non-esiste-non-e-piu-una-risposta`
**Prove:** 601 verdi (erano 582) · **Commit:** `df14a9f`

Documento da caricare come conoscenza in un Claude Project, insieme a
`RAPPORTO_STATO_2026-09-10.md` e `CLAUDE.md`.

---

## 1. Il fatto

Dallo schermo del Ghost, 09/09/2026.

> **Ghost:** Dimmi i temi del atto IV e dell'atto V
> **Shell:** Non esistono. La struttura che abbiamo costruito è 3 atti × 5 movimenti = 15 brani.
> Atto IV e V non sono nei documenti, né nelle note, né nelle bozze.

Insistendo (*«Non inventare, leggi bene tutto il percorso»*), lo Shell ha ribadito, dichiarando di
aver riletto «tutti e 9 i documenti».

Nel percorso VIDYA *Divenire — concept album* c'erano, salvati **otto giorni prima**:

| documento | dimensione | data |
|---|---|---|
| `ATTO IV: Proiezione.md` | 4269 caratteri | 02/09/2026 |
| `ATTO V: Trasformazione.md` | 4340 caratteri | 02/09/2026 |

---

## 2. La diagnosi, in una riga

**Il modello non aveva allucinato: aveva detto la verità su un contesto che il programma gli aveva
costruito sbagliato.**

È la distinzione che questo caso rende operativa. Quasi tutte le difese del sistema erano state
progettate contro il modello che inventa. Questo è il caso opposto — il modello riferisce
fedelmente, ed è il programma ad avergli nascosto il dato.

---

## 3. I quattro difetti, riprodotti prima di essere toccati

### 3.1 · I numeri romani non erano cercabili

```js
function paroleUtili(testo) {
  return normalizzaTesto(testo).split(" ").filter((p) => p.length > 2 && !PAROLE_VUOTE.has(p));
}
```

`IV` e `V` scartati **prima ancora di cercare**. Restavano `dimmi`, `temi`, `atto`.

I numeri corti sono spesso l'unica cosa che distingue due documenti fratelli. In un percorso fatto
di atti, sono la chiave — non rumore.

### 3.2 · A pari punteggio vinceva l'ordine di inserimento

Misurato sui dieci documenti veri, con la frase vera:

```
punti 4 · "Atto I — testi e note.md"
punti 4 · "Atto I — testi e note.md"
punti 4 · "Atto III Crisi Documento di sistema.docx"
punti 4 · "ATTO I: Origine.md"
punti 4 · "ATTO III: Crisi.md"
```

Tutti a **4**, perché l'unica parola superstite era `atto`. L'ordinamento in JavaScript è stabile:
a parità di punti vince l'ordine dell'array. `slice(0, 5)` consegnava i cinque più vecchi.

**ATTO IV e ATTO V non arrivavano affatto.** Erano gli ultimi due.

Sottodifetto: il titolo valeva **2 punti**, il corpo **3**. Un documento il cui titolo *è* quello
che chiedi valeva meno di uno che nomina le parole di sfuggita.

### 3.3 · Dieci esaminati, cinque consegnati, nessuno lo diceva

Fra «documenti esaminati» e «documenti mostrati» c'era una forbice che nessuno nominava. Né il
Ghost né il modello avevano modo di sapere che il taglio era avvenuto.

È la differenza fra **«non c'è»** e **«non me l'hanno dato»** — e senza dichiararla, il secondo
caso si presenta come il primo.

### 3.4 · Nessun filtro sulle negazioni — il più grave

Gli otto filtri di verità cercano tutti **la stessa cosa**: il modello che dichiara *compiuto* ciò
che non è avvenuto. `ripulisciAffermazioniDiEsito`, `ripulisciContenutiDiCalendario`,
`OFFERTA_INESISTENTE_RE`, `smentisciCapacitaSpenta`…

Nessuno guardava il verso opposto. **Il sistema era blindato sul falso positivo e spalancato sul
falso negativo.**

E il falso negativo è peggio:

| | come si scopre |
|---|---|
| «L'ho messo in calendario» (falso) | si apre il calendario |
| «Non esiste» (falso) | **non si scopre**: è la risposta che chiude la ricerca |

Un falso positivo fa fare un controllo. Un falso negativo fa credere di aver perso del lavoro, e non
dà a chi legge nessun motivo di andare a verificare.

Peggio ancora: il prompt dell'inventario **istruiva** il modello a dichiarare l'assenza —

> «Regola che ne discende, e **non ha eccezioni**: se un percorso è dichiarato con NESSUN documento
> salvato, allora NON contiene niente — **dillo**, invece di supporre che ci sia.»

Regola nata giusta (impedire che il modello inventi contenuti), ma che non distingue *«il percorso è
vuoto»* da *«non ho ricevuto quel documento»*, e nel dubbio insegna a negare.

---

## 4. Le correzioni

| # | correzione | dove |
|---|---|---|
| 1 | `NUMERO_CORTO_RE` — i numeri romani e le cifre passano il filtro delle parole | `paroleUtili` |
| 2 | `SEQUENZA_NEL_TITOLO_PUNTI = 10` — una coppia contigua della domanda ritrovata nel titolo batte qualunque parola sparsa | `cercaNellaMemoria` |
| 3 | Spareggio per **data** invece che per ordine d'array | `cercaNellaMemoria` |
| 4 | `TETTO_FRAMMENTI_RICERCA` — il `5` dentro `slice()` diventa una costante con un nome | `cercaNellaMemoria` |
| 5 | La ricerca **dichiara il taglio**: esaminati / pertinenti / consegnati / esclusi | `doveHoGuardato` |
| 6 | `smentisciAssenzaDiMateriale` — il filtro che mancava | catena del turno |

### Prima e dopo, sul caso vero

```
PRIMA                                    DOPO
punti 4 · "Atto I — testi e note.md"     punti 29 · "Divenire Concept Album Atto IV e Atto V.docx"
punti 4 · "Atto I — testi e note.md"     punti 19 · "ATTO IV: Proiezione.md"
punti 4 · "Atto III Crisi…docx"          punti 19 · "ATTO V: Trasformazione.md"
punti 4 · "ATTO I: Origine.md"           punti  9 · "Atto II.md"
punti 4 · "ATTO III: Crisi.md"           punti  9 · "Atto I — testi e note.md"

ATTO IV arriva? NO                       ATTO IV arriva? SÌ  (2º)
ATTO V  arriva? NO                       ATTO V  arriva? SÌ  (3º)
```

### Il filtro nuovo, e come è fatto

`smentisciAssenzaDiMateriale` è il **gemello esatto** di `smentisciCapacitaSpenta`, e non per
simmetria estetica: è lo stesso ragionamento. *Se il modello dice «non c'è» e il programma ha in mano
l'elenco che dice il contrario, non è un'opinione da rispettare: è una frase falsa su un dato
verificabile.*

Tre scelte di progetto, tutte difendibili:

- **Non cancella, aggiunge.** Cancellare lascerebbe una risposta monca su una domanda legittima, e
  il Ghost non saprebbe perché. La frase del modello resta, con accanto il fatto.
- **Senza dato tace.** Nessun percorso aperto → nessun titolo → nessuna smentita. Un filtro che
  smentisce senza dato è peggio della frase che corregge.
- **Due criteri, non uno.** La frase deve negare *e* parlare di materiale. Senza il secondo, «non ci
  sono controindicazioni» diventerebbe una smentita. Metà delle prove nuove sono su questo.

---

## 5. La verifica di rottura

La disciplina della casa: una prova che non ha mai visto il rosso è dichiarativa.

| rottura | prove rosse |
|---|---|
| Rimesso `p.length > 2` | **4** |
| Tolto il bonus della sequenza nel titolo | **3** |
| Svuotato `rilevaNegazioneDiMateriale` | **3** |
| **Staccato il filtro dalla catena del turno** | **0** |

### L'ultima riga è la più importante del report

Staccando il filtro dal punto in cui viene invocato, **il banco resta verde**. Il filtro è provato
come **funzione**, non nel suo **punto d'innesto**.

È la stessa identica classe di problema del gate dei Semi (report 09/09 §4): una **proprietà
d'ordine**, non di comportamento. Il banco non raggiunge l'interno di `runShellTurn`, perché i
binding di un modulo ES non sono sostituibili dall'esterno.

Quindi, dichiarato: **il difetto è corretto, la correzione non è interamente difesa.** Chi
disattivasse quella riga per errore non lo scoprirebbe dal banco.

---

## 6. Cosa questo caso insegna, oltre a sé stesso

**1 · Le difese avevano un verso solo.** Otto filtri, tutti contro il falso positivo. Nessuno aveva
notato l'asimmetria finché non è costata un documento dato per perso. Vale come domanda da porsi su
ogni controllo futuro: *e il verso opposto?*

**2 · Un numero dentro `slice()` è una decisione che nessuno può discutere.** Il `5` non era
sbagliato: era invisibile. Ora ha un nome e una prova.

**3 · «Ho guardato N documenti» non è un fatto utile se non dici quanti ne hai mostrati.** La
trasparenza sul processo senza la trasparenza sul taglio produce fiducia mal riposta.

**4 · Una regola scritta per impedire un'invenzione può insegnare una negazione.** L'istruzione
dell'inventario era corretta nel suo scopo e dannosa nel suo effetto collaterale.

---

## 7. Resta aperto

- **Il punto d'innesto del filtro non è difeso** (§5). Stessa causa e stesso rimedio del gate:
  iniezione delle dipendenze, cambiamento di struttura, decisione del Ghost.
- **La regola dell'inventario è invariata.** Il filtro nuovo la compensa a valle, ma la frase che
  insegna a negare è ancora nel prompt. Correggerla è un giro diverso.
- **`TETTO_DOCUMENTO_IN_RICERCA = 600`**: un documento di 4269 caratteri arriva al **14%**. Per
  «dimmi i temi» può bastare, per lavorarci no. Non toccato in questo giro.
- **`vi`** passa ora il filtro delle parole come numero romano, ed è anche un pronome italiano.
  Falso positivo dichiarato e accettato: costa un frammento in più, non uno in meno.
