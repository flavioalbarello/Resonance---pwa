# Resonance — come cominciare

Resonance è un'app per Android. Legge da sola alcuni dati del telefono (sonno, passi, peso…), ti scrive la mattina, la
sera e la domenica, e ha uno Shell con cui parlare: un assistente che ti conosce un po' di più ogni giorno.
Lo Shell non fa niente da solo: ti propone le cose, e le fa solo se confermi.

Ci vogliono circa 15 minuti, una volta sola.

---

## 1. Il motore: un account OpenRouter (5 minuti)

Lo Shell ragiona con un modello di intelligenza artificiale. Ci arriva attraverso **OpenRouter**, un servizio a
pagamento a consumo: paghi solo quello che usi. Niente abbonamento.

1. Vai su **openrouter.ai** e crea un account (anche con Google).
2. Carica un credito su **openrouter.ai/settings/credits**.
    - È **prepagato**: quando finisce, lo Shell si ferma. Nessuna sorpresa in bolletta.
    - Pagando con carta, OpenRouter trattiene una commissione del 5,5% (minimo 0,80 $).
    - Per cominciare bastano **10 $**.
3. Crea una chiave su **openrouter.ai/keys**.
    - Dalle un nome, per esempio «Resonance».
    - Metti un **limite di spesa**, per esempio 5 $. Se la chiave finisse in mani sbagliate, non può spendere di più.
    - **Copia la chiave** (comincia con `sk-or-`). La vedi una volta sola: tienila a portata per il passo 3.

> Chi te l'ha passata potrebbe aver già fatto questo passo per te: in quel caso salta al 2.

## 2. Installare l'app (2 minuti)

1. Apri il file `resonance-….apk` che hai ricevuto.
2. Android chiede di permettere l'installazione da quella app (WhatsApp, Gmail, File…): **consenti**.
    Le parole cambiano un po' da telefono a telefono.
3. Se compare un avviso di app sconosciuta, scegli **Installa comunque**. L'app non viene dal Play Store, per questo
    Android avvisa.

**Gli aggiornamenti** sono un file nuovo, da aprire allo stesso modo: si installa sopra e i dati restano.
**Non disinstallare mai l'app**: disinstallarla cancella tutti i dati.

## 3. Le prime impostazioni (5 minuti)

Apri Resonance e tocca **Setup** in alto a destra. Dall'alto in basso:

| scheda | cosa fare |
|---|---|
| **Motore** | Incolla la chiave in «Chiave OpenRouter» e tocca **Salva chiave**. Il modello lascialo com'è. In «Tetto mensile $» scrivi quanto vuoi spendere al massimo in un mese (per esempio 5): oltre, lo Shell si ferma fino al mese dopo |
| **Battito** | Lascia **Attivo**. Se leggi «Notifiche: NO», tocca **Permetti le notifiche**. Tocca **Lascia lavorare in secondo piano**, cerca Resonance nell'elenco e scegli «Non ottimizzare» o «Consenti attività in background»: senza, il battito arriva in ritardo o non arriva |
| **Sensori** | Tocca **Collega** e permetti la lettura. Se dice che Health Connect non c'è, installalo dal Play Store e torna qui. L'app legge ciò che orologio, bilancia o telefono scrivono in Health Connect |
| **Calendario e posta** | Facoltativo. **Collega il calendario** se vuoi che lo Shell veda i tuoi impegni e te ne proponga |
| **Il Ghost** | «Il Ghost» sei tu: scrivi il tuo nome e come preferisci che lo Shell ti parli |

## 4. Come si usa

- **Specchio**: i tuoi numeri, calcolati dai dati, e i rituali (piccole abitudini che vuoi tenere).
- **Shell**: scrivigli o parlagli (il microfono è nel tasto rotondo a destra). Quando ti propone qualcosa, compare
  una scheda con **Conferma** e **Annulla**.
- **Notifiche**: la mattina, la sera e la domenica lo Shell ti scrive. Puoi **rispondere direttamente dalla notifica**
  e, la sera, **spuntare un rituale** senza aprire l'app.
- **Sono via** (sullo Specchio): se stai male o parti, toccalo. L'app smette di scriverti e i giorni di assenza non
  contano come mancati. Al ritorno tocca **Sono tornato**.

## 5. I tuoi dati

- Stanno **sul tuo telefono**. Nessun server di Resonance.
- Ciò che scrivi allo Shell, e il riassunto dei tuoi dati che lo Shell riceve a ogni messaggio, passano da OpenRouter
  al modello che risponde. Il resto non esce.
- Non c'è un backup automatico. Ogni tanto: **Setup → Dati → Salva una copia**, e tienila fuori dal telefono
  (Drive, computer). Se cambi telefono, si riapre da lì.

## Se qualcosa non va

| succede | cosa fare |
|---|---|
| «Manca la chiave OpenRouter» | Passo 3, scheda Motore |
| «Tetto di spesa del mese raggiunto» | Alza il tetto in Setup, o aspetta il mese dopo |
| Lo Shell non risponde e il credito c'è | Controlla la connessione; se usi un DNS privato o un blocco pubblicità, prova a spegnerlo |
| Le notifiche non arrivano | Setup → Battito: guarda cosa dice e tocca **Prova ora** |
