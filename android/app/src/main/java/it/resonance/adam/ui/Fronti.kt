package it.resonance.adam.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.logica.Fronti
import it.resonance.adam.logica.Nodi
import it.resonance.adam.logica.Pratica
import java.time.LocalDate

// Fronti (V3, 16/10/2026): tutti i percorsi di tutti i pilastri in un elenco solo, i più urgenti in cima. Prima erano
// sparsi in quattro schede (Adam, Bio, Air, Vidya → Percorsi). Toccandone uno si apre la sua scheda: lo Studio, i nodi,
// i documenti — la stessa di sempre, che ora vive qui.
@Composable
fun FrontiUi(vm: Adam) {
    val percorsi by vm.percorsi.collectAsState()
    vm.documentoAperto?.let { d -> return DocumentoUi(vm, d, percorsi.find { it.id == vm.percorsoAperto }?.let { Colori.di(it.pilastro) } ?: Colori.ambraInchiostro) }
    vm.percorsoAperto?.let { id -> return PercorsoUi(vm, id, percorsi.find { it.id == id }?.let { Colori.di(it.pilastro) } ?: Colori.ambraInchiostro) }
    val nodi by vm.nodi.collectAsState()
    val sessioni by vm.sessioni.collectAsState()
    val oggi = LocalDate.now()
    var nuovo by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        Spazio(12)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Fronti", fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            OutlinedButton({ nuovo = true }, modifier = Modifier.testTag("nuovo-fronte")) { Text("+ Fronte") }
        }
        Tenue("Ciò che stai portando avanti. In cima ciò che chiede di essere lavorato adesso.")
        val elenco = Fronti.ordina(percorsi, nodi, oggi)
        if (elenco.isEmpty()) Tenue("Nessun fronte. Aprine uno qui, o chiedilo allo Shell.")
        elenco.forEach { p ->
            val propri = nodi.filter { it.percorsoId == p.id }
            val pezzi = Pratica.pezzi(propri)
            val colore = Colori.di(p.pilastro)
            Scheda(colore, Modifier.testTag("fronte-${p.titolo}").clickable { vm.percorsoAperto = p.id }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.titolo, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text(p.pilastro.etichetta, fontSize = 11.sp, color = colore)
                }
                if (pezzi.isNotEmpty()) LinearProgressIndicator({ Nodi.avanzamento(Nodi.foglie(propri)) }, Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    color = colore, trackColor = Colori.fondo2)
                Tenue(listOfNotNull(
                    if (pezzi.isEmpty()) "nessun nodo ancora" else Pratica.riga(pezzi, oggi, p.scadenza?.let { runCatching { LocalDate.parse(it) }.getOrNull() }),
                    Fronti.rigaUltima(Fronti.ultima(sessioni, p.id), oggi),
                ).joinToString(" · "))
                if (p.prossimoPasso.isNotBlank()) Riga("→ ${p.prossimoPasso}")
            }
        }
        Spazio(120)
    }
    if (nuovo) DialogoFronte(onOk = { pil, titolo, nodi -> vm.creaPercorso(pil, titolo, nodi) }, onChiudi = { nuovo = false })
}

@Composable
private fun DialogoFronte(onOk: (Pilastro, String, List<String>) -> Unit, onChiudi: () -> Unit) {
    var titolo by remember { mutableStateOf("") }
    var pilastro by remember { mutableStateOf(Pilastro.VIDYA) }
    var nodi by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Nuovo fronte") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(titolo, { titolo = it }, label = { Text("Cosa porti avanti") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Pilastro.entries.forEach { p -> FilterChip(pilastro == p, { pilastro = p }, label = { Text(p.etichetta, fontSize = 12.sp) }) }
                }
                OutlinedTextField(nodi, { nodi = it }, label = { Text("I pezzi, uno per riga (facoltativo)") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                Tenue("I brani, i capitoli, gli esercizi: lo Studio li pianifica sul tempo che hai.")
            }
        },
        confirmButton = { TextButton({ if (titolo.isNotBlank()) { onOk(pilastro, titolo, nodi.lines().map { it.trim() }.filter { it.isNotEmpty() }); onChiudi() } }) { Text("Apri") } },
        dismissButton = { TextButton(onChiudi) { Text("Annulla") } },
    )
}
