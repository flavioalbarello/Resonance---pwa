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
| Superficie | 96 capacità, 9 tab | Specchio, Shell, tre pilastri, Setup |

## Cosa è rimasto e cosa no

Tenuto (le discipline, non le funzioni): il modello dice / il programma verifica · Legge 14 (tabella `versioni`)
· conferma per ogni scrittura · tetto di spesa con totalizzatore proprio · percorsi con nodi e documenti ·
`modifica_documento` con ancora esatta · quaderni (memoria procedurale) letti a ogni turno · vincoli dichiarati
· palette vivida e ancora a un terzo dal basso.

Non portato, per ora: Agorà Magi, Semi/Printify/Etsy, Spartiti, Plasmidi, Giochi, Calendario e posta,
sincronizzazione Drive. Nessun effettore verso l'esterno esiste in V2: il vincolo sull'identità professionale
regge per costruzione (niente esce dal telefono se non la copia che il Ghost salva a mano).

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
non si installa sopra quello firmato. `versionCode` = numero di commit: ogni build è un aggiornamento valido.

Maven Central qui limita le richieste: il progetto usa il mirror di Google, anche per Robolectric.

## Carenze dichiarate

| carenza | stato |
|---|---|
| Mai girata su un telefono vero | Qui non c'è emulatore. Provate: logica, Room, rendering delle schermate. Non provate: voce, Health Connect, notifiche, chiamate reali al modello |
| Occhiali Ray-Ban Meta | Non scrivono in Health Connect, per quanto so: non entrano. Tutto ciò che scrive in Health Connect sì |
| Nessuna sincronizzazione fra dispositivi | Solo copia manuale (Setup → Salva una copia). Due telefoni = due Adam, come deve essere, ma senza backup automatico |
| Conferma a voce | Solo per l'ultima proposta in attesa |
| R8 spento | APK da 30 MB. La minificazione va accesa solo dopo una prova su telefono vero |
| Modello predefinito | Llama 3.3 70B, lo stesso della PWA. Da scegliere con un numero, non col prezzario |
