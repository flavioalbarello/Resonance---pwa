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
| Calendario | Google Calendar via OAuth del browser | calendario di sistema (lo stesso che Google sincronizza): lettura nel contesto e nel battito, scrittura con conferma e rilettura |
| Posta | `gmail.send`: la mail partiva dall'app | bozza aperta nell'app di posta: la invia il Ghost, sempre |
| Superficie | 96 capacità, 9 tab | Specchio, Shell, tre pilastri, Setup |

## Cosa è rimasto e cosa no

Tenuto (le discipline, non le funzioni): il modello dice / il programma verifica · Legge 14 (tabella `versioni`)
· conferma per ogni scrittura · tetto di spesa con totalizzatore proprio · percorsi con nodi e documenti ·
`modifica_documento` con ancora esatta · quaderni (memoria procedurale) letti a ogni turno · vincoli dichiarati
· palette vivida e ancora a un terzo dal basso.

Non portato, per ora: Agorà Magi, Semi/Printify/Etsy, Spartiti, Plasmidi, Giochi,
sincronizzazione Drive.

Calendario e posta erano in questo elenco fino al 23/09/2026 (prima versione), perché serviva un client
OAuth Android e perché la mail era l'unica via d'uscita dal telefono. Sono rientrati lo stesso giorno per
un'altra strada, che non chiede accesso Google:
- **Calendario** — `CalendarContract`, permesso di sistema. Un impegno esiste solo se il calendario lo
  contiene: lo Shell riceve l'agenda letta ora (oggi e domani) e ha `leggi_calendario`; `crea_evento`
  diventa una proposta, e la ricevuta dice ciò che il calendario contiene **rileggendolo**, non ciò che si è chiesto.
- **Posta** — nessun effettore autonomo. `scrivi_mail` apre una bozza nell'app di posta: l'invio è il gesto
  del Ghost su quella mail precisa, cioè il criterio del 02/09. Due guardie dove il dato entra (`Azioni.valida`):
  l'indirizzo dev'essere uno che il Ghost ha scritto (chat, quaderni, profilo), e un nome in
  `Profilo.nomiProtetti` (es. il marchio professionale; dall'import della PWA si porta solo il marchio,
  non la professione) passa solo se il Ghost l'ha scritto lui in quel messaggio.

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
  mondo/MondoAndroid.kt calendario di sistema e bozza di posta (dietro l'interfaccia cervello/Mondo.kt)
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
| Mail inviata o no | L'app apre la bozza, non può sapere se è partita: la ricevuta dice «bozza aperta» |
| Rubrica | Non letta: «scrivi a Marta» senza indirizzo apre la bozza con il destinatario vuoto |
| Calendario scelto | Il principale dell'account Google, se no il primo scrivibile. La ricevuta ne dice il nome; non si sceglie ancora in Setup |
| Database | Versione 2 (`nomiProtetti`), migrazione automatica provata in `MigrazioneTest` sopra la 1 della 2.0.144 |
| R8 spento | APK da 30 MB. La minificazione va accesa solo dopo una prova su telefono vero |
| Modello predefinito | Llama 3.3 70B, lo stesso della PWA. Da scegliere con un numero, non col prezzario |
