# Passaggio di consegne — 08/10/2026

Per la prossima sessione di Claude Code: leggi questo file **prima di tutto**, poi `CLAUDE.md` e `android/PROGETTO.md`.
Il passaggio del 03/10 resta valido per ciò che qui non cambia (accessi, procedura di consegna, lezioni). Legge 14: il
prossimo passaggio sarà un file nuovo, con la sua data.

## 1. Da dove si riparte

| cosa | dove |
|---|---|
| **Branch con tutto** | `claude/new-session-0lkw9y`. Contiene anche i 9 commit dell'altra sessione su `claude/new-session-w6u5wo` (passaggio del 03/10: gli occhi di Adam, la microcamera), uniti il 07/10 |
| `claude/new-session-w6u5wo` | è **indietro**: non ha TROVA_DOVE. Non portarlo avanti senza l'ok del Ghost |
| `main`, `stable` | la PWA. `android/` non ci va senza richiesta |
| Ultima versione consegnata | `2.261007.1819` (commit `74f8df7`), firmata dalla CI di GitHub |
| Banco | 332 prove verdi in tutte e due le app, lint senza errori (08/10) |

## 2. Accessi (cambiato dal 03/10)

- **Firma**: non serve metterla nell'ambiente. La CI di GitHub (`.github/workflows/android.yml`) usa i segreti
  `RESONANCE_KEYSTORE_B64` e `RESONANCE_KEYSTORE_PASSWORD` e costruisce l'APK firmato **a ogni push** su `android/**`.
  Per consegnare: push → run verde → scaricare l'artefatto `resonance-apk` col tool GitHub (`download_workflow_run_artifact`)
  → `apksigner verify --print-certs` (impronta `efb77699…a444a36`) → mandare al Ghost il solo APK **dev** → cancellarlo.
- **Chiave OpenRouter di prova**: il Ghost l'ha scritta in chat il 05/10 (tetto basso). Va revocata quando i collaudi sono
  finiti. Non è nel repository. Una sessione nuova la riceve solo come variabile `OPENROUTER_PROVA`.
- Android SDK: non c'è nel contenitore, si installa in due minuti (cmdline-tools da dl.google.com, `platforms;android-36`,
  `build-tools;36.0.0`) e `local.properties` con `sdk.dir`.

## 3. Cosa è stato fatto (05–08/10)

| cosa | dove |
|---|---|
| **TROVA_DOVE**: il programma apre i siti dei posti (WebView sul telefono), segue carta/menu/listino e la sitemap, cerca il nome nelle pagine | `logica/TrovaDove.kt`, `cervello/Lettore.kt`, `mondo/LettoreAndroid.kt`, `mondo/PdfTesto.kt` (PDFBox, scelta del Ghost) |
| Collaudo dal vivo al banco | `strumenti/lettore-chromium.mjs` + `test/.../dalvivo/` (si salta senza `OPENROUTER_PROVA` e `LETTORE_URL`) |
| Correzioni dalle prove sul telefono del 07/10: produttore nella pagina, descrizioni parola per parola, domande da ricerca al modello principale | commit `74f8df7` |
| Rimando «cerca adesso» quando lo Shell risponde dalla chat | fatto (`ceb93da`) e **annullato** (`13bfd05`) su richiesta del Ghost |
| Consegne: il turno fallito si dice e si riprova | `Consegne.dopoIlLavoro` |
| Ripiego della mappa su Nominatim quando Overpass non risponde | `cervello/Osm.kt` |

Il dettaglio, coi tre giri di collaudo e le prove sul telefono, è in `PROGETTO.md`.

## 4. Fermo per decisione del Ghost (08/10)

**La ricerca è ferma per qualche giorno.** Il Ghost: *«è giusto in linea di massima che controlli prima in chat,
aspettiamo che passino i 20 o 30 messaggi della memoria della chat poi riproveremo»*. Non rimettere il rimando annullato.

Aperto, da riprendere dopo la nuova prova:
- la mappa non risponde nemmeno dal telefono (timeout): serve la riga «⚠ mappa: …» di una scheda vera;
- la risposta del filtro aria non diceva che quattro negozi online ce l'avevano;
- un ✓ era il filtro *abitacolo*, un pezzo diverso con le stesse parole;
- il controllo della risposta contro le prove (passo 2 dell'ordine del 03/10).

## 5. La prossima prova della ricerca (domande nuove, mai usate per progettare)

Da dare all'app una per volta, fra qualche giorno. Per ognuna: schermata della scheda e della risposta, il tempo, il
costo, un voto 0–2.

| # | messaggio | cosa si guarda |
|---|---|---|
| 1 | `Dove compro le pile ricaricabili Eneloop AAA vicino a Canale Monterano?` | un prodotto qualunque, non da ristorante |
| 2 | `Dove trovo la birra Tipopils del Birrificio Italiano vicino a Bracciano?` | col produttore: niente ✓ senza «Birrificio Italiano» nella pagina |
| 3 | `C'è una pizzeria a Manziana con l'impasto senza glutine?` | un posto con una caratteristica, verificata sul suo sito |
| 4 | `Dove posso comprare Il nome della rosa di Umberto Eco a Bracciano?` | una libreria; onestà se nessun sito lo dice |
| 5 | `Quanto costa oggi il gasolio a Bracciano?` | un dato di oggi, col numero nella fonte e la data |
| 6 | `Dove trovo il Pecorino Lunare del Caseificio Stelle Basse vicino a Bracciano?` | **non esiste**: nessun ✓, niente posti inventati |
| 7 | una domanda del Ghost di cui conosce la risposta | la parte trattenuta: l'architetto non la vede |

## 6. Altri punti aperti (con l'ok del Ghost)

- Il testo del Fondo dice «Nome professionale mai»: è la regola in blocco di prima del 02/09. **Tocca il vincolo
  PhysioAlba**: segnalarlo al Ghost, non cambiarlo da soli.
- Il linguaggio da architetto sullo schermo (`SONNO>=420`, `t 0,2`, il punto nei centesimi) e l'ancora che copre il
  contenuto: proposti l'08/10, non decisi.
- Togliere dal prompt le regole che il programma già controlla: proposto, va misurato con un banco prima.
- Le consegne: la proposta da confermare in poche ore, il titolo del documento che deve coincidere.
- Salvare un Adam se il telefono si rompe: la carenza più grave, ancora aperta.
