# Come tornare indietro

Questo file serve a una cosa sola: se qualcosa nell'app si rompe, riportarla allo stato
del **14 agosto 2026**, che era funzionante.

Non serve ricordarsi niente. Basta questo file.

---

## Cosa c'era il 14 agosto 2026

La versione dell'app di quel giorno si chiama `2026-08-12 · blocco1-hardconstraints-costituzionali`
e la trovi scritta in fondo alla schermata Setup.

Conteneva: memoria a due strati, vincoli rieditabili in Setup, dichiarazione delle capacità
che l'app non ha, registro effettori con Printify. Non conteneva: Etsy, esecuzioni automatiche
programmate, app Android.

---

## Il comando per tornare indietro

Uno solo. Da incollare nel terminale, dentro la cartella del progetto:

```
git fetch origin && git reset --hard origin/backup/pre-buildout-2026-08-14 && git push --force-with-lease origin HEAD:main
```

Da quel momento Vercel ricostruisce l'app dal codice di quel giorno. Ci mette uno o due minuti.

**Se preferisci non toccare `main` finché non hai controllato**, usa prima questa versione
più prudente, che ti fa vedere il codice vecchio in locale senza pubblicarlo:

```
git fetch origin && git checkout backup/pre-buildout-2026-08-14
```

Questo comando è stato provato davvero il 14/08/2026, non solo scritto: l'app è stata rotta
di proposito su un ramo usa-e-getta e poi riportata indietro con questo comando, tornando
identica al punto di partenza.

---

## Come fai a sapere che è andata

Apri l'app, vai in **Setup** e guarda la scritta della versione in fondo alla schermata.

- Se leggi `2026-08-12 · blocco1-hardconstraints-costituzionali` → **sei tornato indietro**.
- Se leggi una data più recente → il browser ti sta ancora mostrando la versione vecchia
  tenuta in memoria. Chiudi del tutto la scheda, riaprila, e ricontrolla. Se ancora non
  cambia, aspetta due minuti: Vercel non ha ancora finito di ricostruire.

---

## Cosa questo comando NON riporta indietro — leggi questa parte

Il comando qui sopra riporta indietro **solo il programma**, non i tuoi dati.

**I tuoi dati NON tornano indietro.** Le voci dei tre pilastri, i percorsi, la memoria,
i semi, il kernel, la chat: tutta quella roba vive in due posti — dentro il browser del tuo
telefono e su Google Drive — e nessuno dei due viene toccato da un comando git.

Questo di solito è quello che vuoi: se si rompe il programma, vuoi il programma di ieri
con i dati di oggi, non i dati di ieri.

Ma vale anche al contrario, ed è la parte che sorprende: **se cancelli per sbaglio dei dati,
tornare indietro col codice non te li ridà.** Per quello serve il backup dei dati, che è una
cosa separata, qui sotto.

---

## Il backup dei dati (separato, e altrettanto importante)

In **Setup → Backup e ripristino dei dati** ci sono due pulsanti.

**Scarica backup completo** salva un file `resonance-backup-AAAA-MM-GG.json` con dentro tutto
quello che l'app sa di te: le voci dei tre pilastri, i percorsi, la memoria procedurale, i semi,
il kernel, il profilo, le impostazioni, il log di debug, e anche i pezzi di chat archiviati.
Fallo prima di ogni lavoro grosso, e tienilo dove tieni le cose che non vuoi perdere.

**Ripristina da backup** rilegge quel file e rimette tutto com'era. Ti chiede conferma prima,
perché sostituisce i dati che ci sono adesso su quel dispositivo. Poi l'app si ricarica da sola.

Due cose da sapere su questo file:

- **La chiave API non è dentro.** È voluto: così puoi mandarti il backup via mail o metterlo
  su Drive senza che la chiave giri in giro. Dopo un ripristino la rimetti a mano in Setup,
  sono dieci secondi. Il file stesso dichiara che la chiave è stata omessa, così non c'è dubbio.
- **Il ripristino sostituisce, non unisce.** Rimette esattamente lo stato del file. Se sul
  dispositivo c'era qualcosa di più recente, quel qualcosa viene perso — quindi se hai un
  dubbio, scarica prima un backup di adesso e poi ripristina quello vecchio.

---

## Se qualcosa non torna

Il punto di ritorno esiste in due copie, apposta, così se una sparisce l'altra regge:

- il ramo `backup/pre-buildout-2026-08-14` su GitHub (è quello che usa il comando qui sopra);
- l'etichetta `restore-point-2026-08-14`.

**Nota onesta sull'etichetta:** l'ambiente da cui è stata creata non riesce a spedire etichette
a GitHub — il ramo sì, l'etichetta no, e vale per qualunque etichetta, non solo per questa
(provato anche con un'etichetta finta: stesso rifiuto). Quindi al momento su GitHub c'è
**solo il ramo**, che da solo basta e a cui il comando qui sopra punta già. Se vuoi anche
l'etichetta, si crea dal tuo computer con:

```
git fetch origin && git tag -a restore-point-2026-08-14 origin/backup/pre-buildout-2026-08-14 -m "Punto di ripristino 14/08/2026" && git push origin restore-point-2026-08-14
```

Non è necessario. È solo una seconda rete sotto la prima.

---

## Una nota su cosa git protegge davvero

Git protegge solo i file che ha già preso in custodia (quelli già "committati" almeno una volta).
Un file appena creato e mai salvato in git non è protetto da nessun comando di ripristino:
sparisce e basta.

Non è teoria: è successo durante la prova di ripristino del 14/08/2026 a questo stesso file,
che era appena stato scritto e non ancora consegnato a git. È stato riscritto, e da adesso è
in custodia — ma vale la pena saperlo per i file nuovi.
