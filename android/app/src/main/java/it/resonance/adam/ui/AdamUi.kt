package it.resonance.adam.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import it.resonance.adam.dati.StatoConsegna
import it.resonance.adam.dati.StatoLettera
import it.resonance.adam.dati.TipoMovimento
import it.resonance.adam.logica.Consegne
import it.resonance.adam.logica.Fondo
import it.resonance.adam.logica.Giorni
import it.resonance.adam.logica.Taccuino
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.util.Date
import java.util.Locale

// Le tre stanze dello Shell dentro Adam (25/09/2026): il suo taccuino, il fondo, le lettere con l'architetto.
// Il Ghost vede tutto; niente è nascosto, ma niente intasa la chat.

private fun data(ms: Long) = SimpleDateFormat("d MMM HH:mm", Locale.ITALIAN).format(Date(ms))

@Composable
fun TaccuinoUi(vm: Adam) {
    val note by vm.note.collectAsState()
    val ora = System.currentTimeMillis()
    Tenue("Le note dello Shell: ipotesi sue, scritte senza chiederti conferma perché non toccano niente. Una nota non ripresa per ${Taccuino.GIORNI} giorni evapora: esce dalle sue istruzioni, ma resta qui.")
    val (vive, spente) = note.partition { Taccuino.viva(it, ora) }
    if (note.isEmpty()) Tenue("Vuoto.")
    vive.forEach { n ->
        Scheda(Colori.ambra) {
            Tenue("#${n.id} · evapora tra ${Taccuino.giorniRimasti(n, ora)} gg · scritta ${data(n.creata)}")
            Riga(n.testo)
            TextButton({ vm.togliNota(n) }) { Text("Togli", color = Colori.tenue) }
        }
    }
    if (spente.isNotEmpty()) {
        Etichetta("Evaporate o tolte")
        spente.forEach { n -> Tenue("#${n.id} ${if (n.tolta) "(tolta da te)" else "(evaporata)"} · ${n.testo}") }
    }
}

// Le consegne dello Shell: cosa ha promesso, in che forma, per quando. Le chiude il programma guardando il documento;
// il Ghost può lasciarne una, e anche questo resta nel diario di Adam.
@Composable
fun ConsegneUi(vm: Adam) {
    val consegne by vm.consegne.collectAsState()
    Tenue("Quando lo Shell dice «lo preparo nei prossimi giorni», prende una consegna: un documento con un titolo, per una data. Il giorno prima ci lavora da solo e ti lascia una proposta; alla scadenza il programma guarda se il documento c'è. Mantenuta o mancata, resta nel diario di Adam.")
    val (aperte, chiuse) = consegne.partition { it.stato == StatoConsegna.APERTA }
    if (consegne.isEmpty()) Tenue("Nessuna consegna ancora.")
    aperte.forEach { c ->
        Scheda(Colori.ambra) {
            Riga(c.cosa)
            Tenue("${Consegne.forma(c)} · entro ${Giorni.leggibile(c.scadenza)}" + if (c.lavorata) " · lo Shell ci ha già lavorato" else "")
            TextButton({ vm.lasciaConsegna(c) }) { Text("Lascia", color = Colori.tenue) }
        }
    }
    if (chiuse.isNotEmpty()) {
        Etichetta("Chiuse")
        chiuse.forEach { c -> Tenue("${when (c.stato) { StatoConsegna.MANTENUTA -> "✓ mantenuta"; StatoConsegna.MANCATA -> "✗ mancata"; else -> "lasciata" }} · ${c.cosa} — ${c.esito}") }
    }
}

@Composable
fun FondoUi(vm: Adam) {
    val movimenti by vm.movimenti.collectAsState()
    val stato = Fondo.stato(movimenti, LocalDate.now())
    var nuovo by remember { mutableStateOf(false) }
    Scheda(Colori.air) {
        Etichetta("Fondo di Adam", Colori.air)
        Tenue("Denaro tuo, a fondo perduto. Decide lo Shell; tu esegui, paghi e confermi ogni movimento. Nome professionale mai; contenuti generati con l'AI sempre dichiarati.")
        Fondo.righe(stato).forEach { Riga(it) }
    }
    OutlinedButton({ nuovo = true }) { Text("+ Movimento") }
    movimenti.forEach { m ->
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Riga("${if (m.tipo == TipoMovimento.USCITA) "−" else "+"} ${Fondo.euro(m.importo)} · ${m.tipo.etichetta}")
                Tenue("${Giorni.leggibile(m.giorno)} · ${m.motivo}")
            }
        }
    }
    if (nuovo) {
        var tipo by remember { mutableStateOf(if (stato.modo == Fondo.Modo.VUOTO) TipoMovimento.VERSAMENTO else TipoMovimento.ENTRATA) }
        var importo by remember { mutableStateOf("") }
        var motivo by remember { mutableStateOf(if (stato.modo == Fondo.Modo.VUOTO) "Primo versamento: il fondo di Adam" else "") }
        AlertDialog(
            onDismissRequest = { nuovo = false },
            title = { Text("Movimento del fondo") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TipoMovimento.entries.forEach { t -> FilterChip(tipo == t, { tipo = t }, label = { Text(t.name.lowercase()) }) }
                    }
                    OutlinedTextField(importo, { importo = it }, label = { Text("Euro") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(motivo, { motivo = it }, label = { Text("Motivo") }, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton({
                    importo.replace(',', '.').toDoubleOrNull()?.let { vm.aggiungiMovimento(tipo, it, motivo); nuovo = false }
                }) { Text("Registra") }
            },
            dismissButton = { TextButton({ nuovo = false }) { Text("Annulla") } },
        )
    }
}

@Composable
fun LettereUi(vm: Adam) {
    val lettere by vm.lettere.collectAsState()
    val risposte by vm.risposte.collectAsState()
    val pronta = remember(vm.avviso) { vm.cassettaPronta() }
    var aperta by remember { mutableStateOf<Long?>(null) }
    // La riunione a tre: si apre e si chiude da qui.
    var nuovaRiunione by remember { mutableStateOf(false) }
    var chiudere by remember { mutableStateOf(false) }
    Scheda(Colori.ambra) {
        Etichetta("Riunione a tre", Colori.ambraInchiostro)
        val r = vm.riunione
        if (r == null) {
            Tenue("Tu, lo Shell e l'architetto, per progettare le fasi future. Ogni scambio con lo Shell va da solo nel verbale; nella sessione di Claude Code scrivi una volta «riunione aperta» e l'architetto segue e interviene. Solo progettazione, niente dati sensibili.")
            OutlinedButton({ nuovaRiunione = true }, enabled = pronta) { Text("Apri riunione") }
        } else {
            Riga("In corso: «$r»")
            Tenue("Parla con lo Shell nella chat. Gli interventi dell'architetto arrivano come «Architetto», e si ascoltano.")
            if (vm.chiudendo) Tenue("Chiusura in corso: lo Shell scrive il verbale. Resta nell'app finché non finisce.")
            OutlinedButton({ chiudere = true }, enabled = !vm.chiudendo) { Text("Chiudi riunione") }
        }
    }
    if (nuovaRiunione) DialogoTesto("Tema della riunione", onOk = { vm.apriRiunione(it) }, onChiudi = { nuovaRiunione = false })
    if (chiudere) AlertDialog(
        onDismissRequest = { chiudere = false },
        title = { Text("Chiudere la riunione?") },
        text = { Text("Lo Shell scrive il verbale (decisioni, questioni aperte, chi fa cosa) e lo lascia nella cassetta.") },
        confirmButton = { TextButton({ vm.chiudiRiunione(); chiudere = false }) { Text("Chiudi") } },
        dismissButton = { TextButton({ chiudere = false }) { Text("Continua") } },
    )
    Tenue("Le lettere fra lo Shell e l'architetto dell'app (Claude Code). Ognuna parte da un tuo tocco, con lo stato dell'app allegato; la risposta arriva entro un giorno e lo Shell la legge al turno dopo.")
    if (!pronta) Riga("Cassetta non configurata: Setup → Cassetta delle lettere. Le lettere restano qui e partono appena c'è.", Colori.allarme)
    OutlinedButton({ vm.controllaLettere() }) { Text("Controlla ora") }
    if (lettere.isEmpty()) Tenue("Nessuna lettera ancora.")
    lettere.forEach { l ->
        Scheda(modifier = Modifier.clickable { aperta = if (aperta == l.id) null else l.id }) {
            Riga(l.oggetto)
            Tenue(data(l.creata) + " · " + when (l.stato) {
                StatoLettera.DA_INVIARE -> "da spedire"
                StatoLettera.INVIATA -> "spedita (n. ${l.numero}), in attesa"
                StatoLettera.RISPOSTA -> "risposta arrivata"
                StatoLettera.ERRORE -> "non partita: ${l.errore}"
            })
            if (aperta == l.id) {
                Text(l.testo, modifier = Modifier.fillMaxWidth())
                risposte.filter { it.letteraId == l.id }.forEach { r ->
                    Etichetta("Risposta · ${data(r.istante)}")
                    Text(Formato.annota(r.testo))
                }
            }
        }
    }
}
