# Report — rendere difendibili i punti dove il sistema tocca il mondo

**Data:** 09/09/2026 · **Brief:** `BRIEF_COPERTURA_VINCOLI_20260909`
**Build:** `2026-09-09 · il-recinto-si-prova-chiudendolo`

---

## 1. Quante prove ora

**582 verdi, 111 suite, 25 file** — erano 551 / 107 / 24. **+31.**
`node --input-type=module --check < app.js`: verde. Nessuna prova esistente è diventata rossa.

| file | cosa |
|---|---|
| `tests/identita-e-recinto.test.mjs` | **nuovo** — 31 prove: A.1, A.2, B.1, B.3 |
| `tests/lib/finto-recinto.mjs` | **riscritto su `node:vm`** (motivo in §2) |
| `tests/lib/build-testable.mjs` | +5 nomi in `EXPORT_NAMES` |
| `CLAUDE.md` | C.1 |
| `app.js` | **solo `APP_BUILD`** — una riga, nessun cambiamento di comportamento |

`CACHE` in `sw.js` non toccato: nessun file `lib/` è cambiato.

---

## 2. La verifica di rottura (A.1) — il punto che dice se il lavoro è servito

### Perché la prova comportamentale prima non era scrivibile

Il recinto finto dava all'involucro un `self` che era **un oggetto normale**. In un Worker vero
`self` **È** il globale. Lo strumento viene eseguito con `(0, eval)`, cioè eval indiretto, che
risolve nel globale — quindi:

```js
const self = { fetch(){} }; delete self.fetch;
(0, eval)("(() => typeof fetch)")()   →   "function"     // il fetch DI NODE
```

Una prova scritta contro quel finto avrebbe misurato il `fetch` di Node, **non** la chiusura
dell'involucro: verde per la ragione sbagliata. Riscritto su `node:vm` (modulo incorporato, nessuna
dipendenza nuova), con `self` che punta al globale di quel contesto.

### Cosa ho rotto, e cosa è diventato rosso

| rottura | prove nuove rosse | vecchia prova dichiarativa |
|---|---|---|
| tolto il **secondo passaggio** (`defineProperty`), resta solo `delete` | **1** — «IL DOPPIO PASSAGGIO REGGE» | verde |
| tolto **l'intero ciclo di chiusura** | **13** — tutti e 11 i nomi + i due riassuntivi | **31/31 verde** |

La vecchia prova resta verde mentre il recinto è completamente aperto. È la misura esatta di cosa
era la copertura precedente.

### Un difetto nella mia prova, trovato dalla stessa verifica

Alla prima rottura totale solo **4 nomi su 11** diventavano rossi. Causa: la mia sonda **chiamava**
il valore trovato, e i sette nomi che sono **classi** (`XMLHttpRequest`, `WebSocket`, `Worker`…)
lanciano `TypeError` se chiamate senza `new`. La sonda leggeva quel `TypeError` come «chiuso» anche
quando il nome era lì, vivo e istanziabile.

Era lo stesso identico difetto che questo file esiste per correggere — una prova verde per la ragione
sbagliata — e l'avevo appena riscritto io. Corretto: la proprietà è la **raggiungibilità**, e
`typeof` è l'unico modo di chiederla senza confondere l'assenza con un errore di chiamata. Dopo la
correzione, la rottura totale fa rosse **tutte e 13**.

C'è anche una prova di controllo: con un involucro privato del ciclo di chiusura, `fetch` **deve**
risultare raggiungibile. Se non lo fosse, le altre undici sarebbero verdi per costruzione.

---

## 3. Cosa è emerso rosso — e non è stato corretto

**Nessun difetto del codice.** Tre prove sono nate rosse, e tutte e tre **erano sbagliate io**:

| prova rossa | la verità |
|---|---|
| «forme attaccate del nome passano la redazione» | **Non passano.** `\b` riconosce come confine anche `-`, `.`, `#`, l'apostrofo. `scheda-PhysioAlba-2026.pdf`, `www.physioalba.it`, `#PhysioAlba` sono tutti redatti. Il codice è migliore di come l'avevo supposto |
| «tutte le azioni sono nominate in `APP_CAPABILITIES_CONTEXT`» | Rossa su 14 id su 15. Le azioni sono dichiarate al modello da **un altro blocco**, `formatAzioniBlock`, costruito dal registro. Il brief la proponeva come prova possibile; il codice dice che l'invariante vive altrove. Riscritta sul posto giusto |
| «gli attacchi sono nominati» | L'etichetta c'è, in **minuscolo**. Il mio confronto era sensibile alle maiuscole |

Due osservazioni emerse lavorando, riportate e non corrette:

- **Uno store vuoto non vuol dire «tutte le azioni spente»**: nove su quindici sono accese per
  impostazione predefinita. Una prova che assume il contrario prova il caso sbagliato credendo di
  provare quello giusto.
- **`build-testable.mjs` non toglie i doppioni** da `EXPORT_NAMES`: un nome aggiunto due volte
  produce `SyntaxError: Duplicate export` al caricamento, con un messaggio che non dice quale nome.
  Mi ci sono infilato aggiungendo `azioniAttive` che c'era già.

---

## 4. B.2 — il gate: **indifendibile con la struttura attuale**

La proprietà da difendere non è «il gate risponde»: è **l'ordine**. In `executeSeedContract` il gate
gira davvero prima:

```js
const gate = await runSeedGateCheck(contract, profile, settings, pushDebugLog);
if (gate.gated) return { esito: "gate", gated: true, ... };
const risultato = await invokeEffector(contract.effettore, contract.parametri, pushDebugLog);
```

Per provare l'ordine servirebbe sostituire `runSeedGateCheck` con uno finto che dice «bloccato» e
verificare che `invokeEffector` **non venga raggiunto**. Non è possibile, e l'ho misurato invece di
dedurlo:

```
a.runSeedGateCheck = async () => ({ gated: true })
→ TypeError: Cannot add property runSeedGateCheck, object is not extensible
```

I binding di un modulo ES sono in sola lettura, e il punto di chiamata dentro `executeSeedContract`
si risolve lessicalmente: non passa dal namespace nemmeno se fosse scrivibile.

**Non ho scritto una prova più debole.** Una che verificasse solo le etichette `richiedeGate` del
registro sarebbe di nuovo dichiarativa — esattamente il difetto A.1.

Cosa lo renderebbe difendibile: iniettare il gate e l'effettore come parametri, **schema già in uso
due volte in questo codice** (`askWithDegenerateGuard(call, …)`, `generaPlasmide({ chiediJSON })`).
È un cambiamento di struttura: decisione del Ghost, non di questo giro.

---

## 5. B.4 — la quarta area: **il conteggio giusto è tre**

Il report del mattino elenca **tre** nomi non esportati:
`redactProfessionalIdentity` · `runSeedGateCheck` · `APP_CAPABILITIES_CONTEXT`.

Il mio riassunto di fine sessione diceva *«quattro delle quali non testabili senza toccare
`EXPORT_NAMES`»*: **sbagliato**, e nel modo che il brief ha riconosciuto. Contavo `sw.js` insieme
agli altri tre, ma è **un'altra categoria**: non è scoperto per un export mancante, è scoperto
perché nessuna prova lo apre. Due categorie trattate come una sola — la stessa forma della deriva
10-contro-15.

Il conteggio corretto: **tre non esportati** (ora esportati, due dei tre con prove; il terzo è §4),
**più `sw.js`, che resta fuori da questo brief per §D**.

---

## 6. `CLAUDE.md` — la riga prima e dopo

**Prima** (righe 8–10, sotto *«Stack tecnico — vincoli non negoziabili»*):

> - Preact + htm, **NESSUN build step**. Non introdurre bundler, non usare JSX che richiede
>   transpilazione, non aggiungere dipendenze che richiedono compilazione.

**Dopo** — la voce è **uscita** dall'elenco dei vincoli non negoziabili ed è diventata una sezione
propria:

> ## Build step — una scelta, non un divieto (G.8, emendato il 12/08/2026)
> **Nessun bundler in uso oggi**: Preact + htm da file vendored, si modifica `app.js` e si ricarica.
>
> Da G.8 la scelta è **caso per caso e motivata, non una regola cablata**: introdurre un build step
> richiede una proposta motivata, non un'eccezione a un divieto. Il conto di cosa si romperebbe —
> il banco di prova per primo — è in `RAPPORTO_STATO` §13.
>
> Questa voce stava fra i vincoli non negoziabili come *«NESSUN build step, non introdurre bundler»*
> fino al 09/09/2026, quasi un mese dopo l'emendamento. Nessun test, lint o controllo CI l'ha mai
> imposta: era cablata **solo qui**, ed è il file che istruisce ogni sessione. Finché è rimasta, la
> libertà aperta da G.8 è stata chiusa in pratica.

Nessun'altra riga di `CLAUDE.md` toccata.

---

## 7. Le pull request — inventario

**Aperte oggi: zero.** Interrogato `state: open` sul repository: elenco vuoto.

L'ultima è la **#96 del 01/09/2026** («Allineamento stable ← main»). Tutte quelle esaminate (57→96)
risultano **unite**, nessuna chiusa senza unione, nessuna in attesa.

**L'ultima colonna — lavoro che il `RAPPORTO_STATO` dà per presente e che non è su `main`/`stable`:
nessuno.** Il divario di §0 del report del mattino (quattro commit non uniti) è stato chiuso oggi
per push diretto sui due rami, non tramite PR — ed è il motivo per cui non compare una #97.

Nulla unito, chiuso o riaperto da me.

---

## 8. Cosa non sono riuscito a difendere, e perché

| proprietà | perché resta indifesa |
|---|---|
| **L'ordine del gate** (B.2, C.10) | I binding ESM non sono sostituibili; la chiamata si risolve lessicalmente. Serve iniezione delle dipendenze — cambiamento di struttura, §4 |
| **`sw.js` precarica ogni `lib/*.js`** | Fuori dal brief per §D |
| **Mai `<>...</>`** | Fuori per §D — nessuna prova disegna un componente: `htm` è uno stub |
| **Build step, procedura di merge** | Fuori per §D — non difendibili da questo banco |
| **`redactProfessionalIdentity` è chiamata davvero su ogni uscita** | La funzione ora è difesa **in sé**: rimuove il nome, non censura il dominio. Che sia **invocata** su ogni percorso verso il mondo è la stessa classe di problema del gate — è una proprietà d'ordine, e ha lo stesso ostacolo |

Quest'ultima riga è la più importante delle quattro: **B.1 difende ciò che la funzione fa, non che
venga usata.** Un percorso di uscita che si dimenticasse di chiamarla passerebbe il banco.

---

## 9. Resta aperto, per non perderlo

- **`RAPPORTO_STATO` dice dieci azioni conversazionali, sono quindici** — correzione rinviata per
  C.2 (una sola revisione a lavoro finito). Il numero è pintato da una prova in
  `identita-e-recinto.test.mjs`, quindi non può più driftare in silenzio.
- **`build-testable.mjs` non toglie i doppioni** da `EXPORT_NAMES` (§3).
- Le quattro proprietà di §8.

---

*Nessun difetto del codice corretto: le tre prove rosse erano mie. L'unica correzione autorizzata
fuori dal banco — C.1 — è stata fatta.*
