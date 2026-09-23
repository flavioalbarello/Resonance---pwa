package it.resonance.adam.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.TipoMisura
import it.resonance.adam.logica.Agenda
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.dati.EsitoEsperimento
import it.resonance.adam.dati.Esperimento
import it.resonance.adam.dati.StatoEsperimento
import it.resonance.adam.logica.Contesto
import it.resonance.adam.logica.Esperimenti
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import androidx.compose.material3.LinearProgressIndicator
import it.resonance.adam.logica.Esiti
import it.resonance.adam.logica.StatoRituale
import java.time.format.DateTimeFormatter
import java.util.Locale

private val GIORNO = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN)

@Composable
fun Specchio(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    var numero by remember { mutableStateOf(false) }
    var rituale by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        Spazio(12)
        Text(i.oggi.format(GIORNO).replaceFirstChar { it.uppercase() }, fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Colori.inchiostro)
        Tenue("Quello che è cambiato davvero: numeri calcolati sui dati, non stime.")
        Spazio()
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton({ numero = true }) { Text("+ Un numero") }
            OutlinedButton({ vm.leggiSensi() }) { Text("Leggi i sensori") }
        }
        if (vm.statoSensi.isNotBlank()) Tenue(vm.statoSensi)

        (vm.agenda as? AgendaLetta.Letta)?.let { a ->
            Scheda(Colori.air) {
                Etichetta("Agenda", Colori.air)
                listOf(i.oggi to "Oggi", i.oggi.plusDays(1) to "Domani").forEach { (g, nome) ->
                    val eventi = Agenda.delGiorno(a.eventi, g)
                    Row {
                        Text(nome, color = Colori.tenue, fontSize = 13.sp, modifier = Modifier.width(64.dp).padding(top = 2.dp))
                        Column {
                            if (eventi.isEmpty()) Riga("niente in calendario", Colori.tenue)
                            eventi.forEach { Riga(Agenda.riga(it, i.oggi, conGiorno = false)) }
                        }
                    }
                }
            }
        }

        for (p in listOf(Pilastro.BIO, Pilastro.AIR, Pilastro.VIDYA)) {
            val colore = Colori.di(p)
            Scheda(colore, Modifier.clickable { vm.vai(Schermata.valueOf(p.name)) }) {
                Etichetta(p.etichetta, colore)
                Contesto.righeEsiti(i, p).forEach { r ->
                    Riga(r, if (r.endsWith("nessun dato")) Colori.tenue else Colori.inchiostro)
                }
                val linea = when (p) { Pilastro.BIO -> TipoMisura.PESO; Pilastro.VIDYA -> TipoMisura.PRATICA; else -> null }
                linea?.let { t -> Linea(Esiti.sintesi(i.misure, t, i.oggi).punti, colore) }
            }
        }

        val stati = Contesto.statoRituali(i)
        Scheda(Colori.ambra) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Etichetta("Stabilità mantenuta", Colori.ambraInchiostro)
                    Tenue("Ciò che regge conta quanto ciò che produci.")
                }
                TextButton({ rituale = true }) { Text("+ Rituale") }
            }
            if (stati.isEmpty()) Tenue("Nessun rituale. Uno piccolo che regge vale più di tre grandi che saltano.")
            stati.forEach { RigaRituale(vm, it) }
        }

        EsperimentiUi(vm, i)
        Spazio(120)
    }
    if (numero) DialogoMisura(null, { t, v, l -> vm.aggiungiMisura(t, v, legata = l) }) { numero = false }
    if (rituale) DialogoRituale(vm) { rituale = false }
}

@Composable
private fun RigaRituale(vm: Adam, s: StatoRituale) {
    val auto = s.rituale.criterio != null
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Checkbox(
            s.tenuta.oggi, { vm.alternaSpunta(s.rituale, s.tenuta.oggi) },
            enabled = !auto || !s.tenuta.oggi,
            colors = CheckboxDefaults.colors(checkedColor = Colori.di(s.rituale.pilastro)),
        )
        Column(Modifier.weight(1f)) {
            Riga(s.rituale.nome)
            Tenue("serie ${s.tenuta.serie} · ${s.tenuta.tenutiSu14}/14" + (s.rituale.criterio?.let { " · automatico: $it" } ?: ""))
        }
        TextButton({ vm.disattivaRituale(s.rituale) }) { Text("✕", color = Colori.tenue) }
    }
}

@Composable
private fun DialogoRituale(vm: Adam, onChiudi: () -> Unit) {
    var nome by remember { mutableStateOf("") }
    var pilastro by remember { mutableStateOf(Pilastro.BIO) }
    var criterio by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Nuovo rituale") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(nome, { nome = it }, label = { Text("Nome") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pilastro.entries.forEach { p -> FilterChip(pilastro == p, { pilastro = p }, label = { Text(p.etichetta) }) }
                }
                OutlinedTextField(criterio, { criterio = it }, label = { Text("Automatico (facoltativo), es. SONNO>=420") }, modifier = Modifier.fillMaxWidth())
                Tenue("Con un criterio si spunta da solo quando la misura lo soddisfa. Misure: ${TipoMisura.entries.joinToString(", ") { it.name }}")
            }
        },
        confirmButton = { TextButton({ if (nome.isNotBlank()) { vm.creaRituale(nome, pilastro, criterio); onChiudi() } }) { Text("Crea") } },
        dismissButton = { TextButton(onChiudi) { Text("Annulla") } },
    )
}

// L'anello di Anochin: bersaglio dichiarato prima, partenza congelata, confronto fatto dal programma.
@Composable
private fun EsperimentiUi(vm: Adam, i: it.resonance.adam.logica.Istantanea) {
    val tutti by vm.esperimenti.collectAsState()
    val aperti = Esperimenti.aperti(tutti)
    val chiusi = tutti.filter { it.stato != StatoEsperimento.APERTO }.take(3)
    var daLasciare by remember { mutableStateOf<Esperimento?>(null) }
    Scheda(Colori.vidya) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Etichetta("Esperimenti", Colori.vidya)
                Tenue("Una prova, un numero che dovrebbe muoversi. Confronta il programma: è un dato sulla proposta, non su di te.")
            }
            TextButton({ vm.perturbaAdesso() }) { Text("Cerca un ristagno") }
        }
        if (aperti.isEmpty() && chiusi.isEmpty()) Tenue("Nessun esperimento. Chiedi allo Shell: «proponimi un esperimento per …».")
        aperti.forEach { e ->
            val inizio = LocalDate.parse(e.inizio)
            val giorno = (ChronoUnit.DAYS.between(inizio, i.oggi) + 1).coerceIn(1, e.giorni.toLong()).toInt()
            Column(Modifier.padding(vertical = 6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(e.titolo, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    TextButton({ daLasciare = e }) { Text("Lascia", color = Colori.tenue) }
                }
                LinearProgressIndicator({ giorno / e.giorni.toFloat() }, Modifier.fillMaxWidth(), color = Colori.vidya, trackColor = Colori.linea)
                Tenue(Esperimenti.riga(e, i.misure, i.oggi).substringAfter("»: "))
            }
        }
        chiusi.forEach { e ->
            val colore = when (e.esito) { EsitoEsperimento.MOSSO -> Colori.bio; EsitoEsperimento.CONTRARIO -> Colori.allarme; else -> Colori.tenue }
            Text(Esperimenti.riga(e, i.misure, i.oggi), color = colore, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
        }
    }
    daLasciare?.let { e ->
        AlertDialog(
            onDismissRequest = { daLasciare = null },
            title = { Text("Lasciare «${e.titolo}»?") },
            text = { Text("Il confronto non si farà. Resta traccia che è stato lasciato.") },
            confirmButton = { TextButton({ vm.lasciaEsperimento(e); daLasciare = null }) { Text("Lascia") } },
            dismissButton = { TextButton({ daLasciare = null }) { Text("Continua") } },
        )
    }
}
