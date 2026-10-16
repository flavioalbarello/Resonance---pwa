# Passaggio del 16/10/2026 — la V3 costruita

Si riparte da qui. Il piano è `PROGETTO_V3.md`; la sua tabella «Stato» dice fase per fase cosa c'è.

## Cosa è successo
- 14/10: fasi 1–2 (motore e Studio), aggiunte all'app di sempre. Il Ghost, il 16/10: «cosa hai fatto in concreto?».
  Risposta onesta: niente ricostruzione, una funzione appiccicata. «Fai tutto come ti avevo chiesto, stavolta per davvero».
- 16/10: nuova forma (Oggi / Fronti / Shell + menu), fasi 3, 5, 7, 8; la 6 in parte.

## Lo stato
| | |
|---|---|
| Branch | `claude/new-session-0lkw9y` = `claude/new-session-w6u5wo` |
| DB | 17 (16: fronti e sessioni; 17: misura del fronte) |
| Banco | 358 prove, dev e base; lint 0 errori |
| APK | la CI li costruisce entrambi; al Ghost solo la dev finché non promuove |

## Da provare sul telefono (nessuno l'ha ancora fatto)
1. Oggi: «Adesso» compare solo per i fronti di pratica (scadenza, ritmo, o già studiati).
2. Studio sopra Moises: notifica, vibrazione a fine blocco, tocco che apre la fonte.
3. La proposta nel buco del calendario (Setup → Battito, ora predefinita 18:30).
4. Motore acceso su un fronte: il turno dello Shell al battito, le proposte in Oggi.

## Non fatto, e perché
- **Streaming della risposta**: tocca il turno in background e le chiamate con strumenti; va provato dal vivo con una chiave.
  Senza, non si consegna (lezione del 03/10).
- Ricerca (TROVA_DOVE): in pausa per scelta del Ghost; nuove domande in `PASSAGGIO_2026-10-08.md`.
- Fix 3 della mappa (Overpass), testo del Fondo «Nome professionale mai» (tocca PhysioAlba: serve l'ok del Ghost).

## Errori di questa sessione da non ripetere
- Mettere in fila le fasi dal motore: ciò che il Ghost vede è finito in fondo. Prima la forma, poi il resto.
- I risultati di `cerca_nel_web` arrivavano al modello SENZA i link: nessuna fonte vera era proponibile. Trovato dalla
  prova del turno sul fronte, non dalla lettura del codice.
