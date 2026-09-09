# Report — esecuzione del banco e copertura reale

**Data:** 09/09/2026 · **Brief:** `BRIEF_ESECUZIONE_BANCO_E_COPERTURA_20260909`
Eseguito da checkout puliti (worktree separati su commit staccati), non dallo stato di lavoro.

---

## 0. Il fatto che va in cima

**Il rapporto descrive uno stato che non è in produzione.**

`main` e `stable` sono allineati **fra loro** — `git diff origin/main origin/stable` è vuoto, come
dichiarato — ma sono **quattro commit indietro** rispetto al ramo di lavoro. I due utenti stanno
usando la build del **04/09**, non quella del 07/09 che il rapporto descrive.

I quattro commit non uniti:

```
ec0dc9b  Rapporto allineato al codice: due carenze chiuse, gli stati del Seme corretti
af0ec5d  Rapporto: G.8 e' emendato dal 12/08, la tabella diceva il contrario
cdd1b95  Le tracce viaggiano, e gli stati del Seme si dichiarano
d6afe84  Rapporto di stato del codice, per un Claude Project
```

Conseguenza pratica: su `main` e `stable` **le tracce non vanno ancora su Drive** e `STATI_SEME` non
esiste. Le due carenze che il rapporto dà per chiuse sono chiuse solo sul ramo.

---

## 1. Esito dell'esecuzione

Comandi, per ciascun ramo:

```bash
node --input-type=module --check < app.js
node --test "tests/*.test.mjs"
```

| ramo | commit | sintassi | prove | passate | fallite | saltate | suite | file | tempo |
|---|---|---|---|---|---|---|---|---|---|
| `main` | `0c2b22e` | OK | 529 | 529 | **0** | 0 | 104 | 23 | 4.393 ms |
| `stable` | `2afc80c` | OK | 529 | 529 | **0** | 0 | 104 | 23 | 4.214 ms |
| `claude/new-session-ru1gir` | `ec0dc9b` | OK | 551 | 551 | **0** | 0 | 107 | 24 | 4.079 ms |

`cancelled` e `todo`: 0 ovunque.

**I due rami di produzione coincidono**, come il brief chiedeva di verificare: stessi 529/104/23,
stesso esito. `git diff origin/main origin/stable` vuoto. Coerente.

Nulla è rosso. Non c'è niente da fermare.

---

## 2. Deriva fra dichiarato e reale

| voce | dichiarato nel rapporto | reale | esito |
|---|---|---|---|
| prove / suite / file | 551 / 107 / 24 | **551 / 107 / 24 sul ramo**; 529 / 104 / 23 su `main` e `stable` | **deriva**: il numero è vero, il soggetto no (§0) |
| righe `app.js` | 10.909 | 10.909 sul ramo; 10.796 su `main`/`stable` | stessa deriva |
| `lib/alimentare.js` | 527 | 527 | ✓ |
| `lib/base.js` | 31 | 31 | ✓ |
| `lib/capitolato.js` | 258 | 258 | ✓ |
| `lib/griglia.js` | 119 | 119 | ✓ |
| `lib/misure.js` | 161 | 161 | ✓ |
| `lib/plasmide.js` | 163 | 163 | ✓ |
| componenti | 29 | 29 | ✓ |
| **azioni conversazionali** | **10** | **15** | **DERIVA** |
| effettori AIR | 6, di cui 2 con gate | 6, di cui 2 con gate | ✓ |
| attacchi plasmidi | 1 | 1 | ✓ |

### La deriva vera: cinque azioni non elencate

Il rapporto ne elenca dieci. Ce ne sono **quindici**. Le cinque mancanti sono tutte del ramo
calendario/posta:

`sposta_evento_calendario` · `invia_mail` · `leggi_calendario` · `trova_evento_calendario` ·
`cancella_evento_calendario`

Causa: quando ho scritto il rapporto ho contato su una finestra di testo di lunghezza fissa, che
tagliava l'array a metà. È lo stesso difetto — un numero fisso al posto di un confine reale — che
`build-testable.mjs` aveva già avuto («le prime 12 righe») e che il suo commento dichiara risolto.

Peso: `invia_mail` e `cancella_evento_calendario` sono azioni con effetto esterno. Un rapporto che
dichiara dieci azioni ne nasconde due che toccano il mondo.

Il resto dei numeri regge: l'affermazione *«ogni numero è letto dal codice»* è vera per undici voci
su dodici.

---

## 3. Copertura — cosa il banco sa far fallire

Premessa che decide metà della tabella: una funzione **assente da `EXPORT_NAMES`** in
`tests/lib/build-testable.mjs` è irraggiungibile dal banco. Non "non testata": **non testabile**
senza toccare quel file.

| area | proprietà | difesa da | esito |
|---|---|---|---|
| plasmidi | `plasmidiPerAttacco` esige **entrambe** le condizioni | `plasmide` (tre casi separati: acceso senza prove, prove fallite, prove passate) | **coperta, comportamentale** |
| guardiano dati personali | scatta su `salvaPlasmide`, non solo all'esportazione | `generatore` (4 prove, incluso nome-vs-dominio) | **coperta, comportamentale** |
| sincronizzazione | `mergeTracce` riapplica il tetto | `tracce-e-stati` (40+40 → 40) | **coperta** |
| stati del Seme | sette stati, `archived` unico non vivo | `tracce-e-stati` (9 prove) | **coperta** |
| capitolato | brief e giudizio dallo stesso array; banco trattenuto | `capitolato` (20 prove) | **coperta** |
| generatore | giro intero col recinto vero | `generatore` (18 prove) | **coperta** |
| degenerazione | i tre criteri | `degenerazione`, `piano-montato` | **coperta** |
| **sincronizzazione** | **log additivi, «nessuna voce si perde mai»** | — | **SCOPERTA** |
| **recinto** | **`INVOLUCRO_SANDBOX` chiude tutti e 11 i nomi** | solo dichiarativa | **SCOPERTA nei fatti** |
| **identità professionale** | **`redactProfessionalIdentity`: il nome non esce** | — | **SCOPERTA — non esportata** |
| **gate** | **`runSeedGateCheck` gira prima di ogni effettore** | — | **SCOPERTA — non esportata** |
| **`APP_CAPABILITIES_CONTEXT`** | **riflette le feature presenti** | — | **SCOPERTA — non esportato** |
| **`sw.js`** | **precarica ogni `lib/*.js`** | — | **SCOPERTA — nessuna prova lo apre** |

### I filtri di verità: tre su otto

| filtro (§7 del rapporto) | esportato | prove |
|---|---|---|
| `ripulisciAffermazioniDiEsito` | sì | `percorsi-da-chat` |
| `DIDASCALIA_RE` / `META_NARRAZIONE_RE` | `trovaMetaNarrazione` sì | `meta-narrazione`, `piano-montato` |
| `senzaDeliberazione` | sì | `magi-forma` |
| lo storico non fa da calendario | sì | `calendario` |
| **`ripulisciContenutiDiCalendario`** | **sì** | **NESSUNA** |
| **`OFFERTA_INESISTENTE_RE`** | no | **NESSUNA** |
| **`CAPACITA_SPENTA_RE`** (stato interruttori) | no | **NESSUNA** |
| **`DOMANDA_CONFERMA_RE`** (conferme senza bersaglio) | no | **NESSUNA** |

Anche `ESITO_COMPIUTO_RE` è esportato e non ha nessun assert proprio.

`ripulisciContenutiDiCalendario` è il caso più netto: **è raggiungibile e nessuno lo tocca.** È il
filtro nato il 22/08 per impedire che comparisse un contenuto di calendario senza una lettura
verificata — cioè il difetto che il Ghost ha scoperto da uno screenshot del proprio calendario.

### Due coperture che sembrano tali e non lo sono

**Il recinto.** La prova controlla `NOMI_DA_CHIUDERE.includes(n)` per sei nomi su undici: verifica
che l'**elenco** li nomini, non che l'involucro li **chiuda**. `finto-recinto.mjs` esegue davvero
`INVOLUCRO_SANDBOX`, ma nessun assert prova che uno strumento che chiama `fetch` dentro il recinto
fallisca. Se il ciclo di chiusura venisse rotto, il banco resterebbe verde.

**I log additivi.** `mergeById` compare in un solo assert, e lì per **contrasto** (per mostrare che
ordina su `date`, che le tracce non hanno). Nessuna prova afferma che unendo due dispositivi le voci
di `bio`/`air`/`vidya` non si perdano. È la proprietà che il rapporto dichiara come «nessuna voce si
perde mai», ed è indifesa.

---

## 4. La riga finale

**No — per quasi tutti.** Il banco difende la **logica pura**, non i vincoli di §1.

| vincolo di §1 | il banco se ne accorgerebbe? |
|---|---|
| Nessun build step | **no** (lo prenderebbe il controllo CI, non il banco) |
| Mai `<>...</>` | **no** — nessuna prova disegna un componente: `htm` è uno stub |
| Legge 14 | **in parte** — sedimento delle voci, `nuovaVersioneDi`, tracce; nessuna garanzia generale |
| Merge `stable ← main` | **no** — è una procedura git, fuori dal banco |
| Identità professionale | **no** — `redactProfessionalIdentity` non è esportata. Coperto solo il caso stretto dei plasmidi |
| `APP_CAPABILITIES_CONTEXT` | **no** — non esportato |

Il solo vincolo di §1 che una modifica sbagliata farebbe scattare è **Legge 14**, e solo sui tre
punti dove qualcuno ha scritto la prova apposta.

---

*Nessuna modifica al codice, nessuna prova nuova, nessun file toccato oltre a questo report.
I difetti trovati sono riportati e non corretti, come da §5 del brief.*
