package it.resonance.adam.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.logica.Pratica
import java.time.LocalDate

// Lo studio dentro il fronte (V3 fase 2). Due tocchi per partire: quanto tempo c'è, Inizia. Il piano lo fa il programma
// (logica/Pratica.kt); durante si segue dalla notifica, ma qui c'è lo stesso pannello per chi ha l'app davanti.
private val TEMPI = listOf(5, 10, 15, 20, 30, 45, 60, 90, 120)

@Composable
fun StudioUi(vm: Adam, per: Percorso, nodi: List<Nodo>, colore: Color) {
    val pezzi = Pratica.pezzi(nodi)
    if (pezzi.isEmpty()) return
    val sessione by vm.sessione.collectAsState()
    val esiti by vm.esitiSessione.collectAsState()
    val oggi = LocalDate.now()
    val scadenza = per.scadenza?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    var scadenzaAperta by remember { mutableStateOf(false) }
    Scheda(colore, Modifier.testTag("studio")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Etichetta("Studio", colore)
            Text("  " + Pratica.riga(pezzi, oggi, scadenza), fontSize = 13.sp, color = Colori.tenue, modifier = Modifier.weight(1f))
            TextButton({ scadenzaAperta = true }) { Text(if (scadenza == null) "Scadenza" else "Cambia", fontSize = 12.sp) }
        }
        val s = sessione
        when {
            s != null && s.percorsoId == per.id -> InCorso(vm, Pratica.decodifica(s.piano), esiti.size)
            s != null -> Tenue("C'è uno studio in corso su un altro fronte: chiudilo da lì o dalla notifica.")
            else -> Avvio(vm, per)
        }
        if (vm.resocontoStudio.isNotEmpty() && s == null) {
            Spazio(6)
            Etichetta("Com'è andata")
            vm.resocontoStudio.forEach { Riga("· $it") }
        }
    }
    if (scadenzaAperta) DialogoTesto("Scadenza del fronte", per.scadenza.orEmpty(), "es. 20/12/2026 · vuoto la toglie", vuotoOk = true,
        onOk = { vm.scadenzaFronte(per, it) }, onChiudi = { scadenzaAperta = false })
}

@Composable
private fun Avvio(vm: Adam, per: Percorso) {
    var minuti by remember(per.id) { mutableStateOf<Int?>(null) }
    var piano by remember(per.id) { mutableStateOf<List<Pratica.Blocco>>(emptyList()) }
    LaunchedEffect(minuti, per.scadenza) { piano = minuti?.let { vm.pianoStudio(per, it) }.orEmpty() }
    Tenue("Quanto tempo hai?")
    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        items(TEMPI) { m -> FilterChip(minuti == m, { minuti = if (minuti == m) null else m }, label = { Text(if (m < 60) "$m′" else "${m / 60}h" + if (m % 60 > 0) "${m % 60}" else "") }) }
    }
    if (minuti != null) {
        if (piano.isEmpty()) Tenue("Niente da studiare adesso: tutto pronto e ripassato di recente.")
        piano.forEach { b ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                Text("${b.minuti}′", fontSize = 13.sp, color = Colori.tenue, modifier = Modifier.padding(end = 8.dp))
                Text(b.etichetta, fontSize = 14.sp, modifier = Modifier.weight(1f))
                Text(if (b.ripasso) "ripasso" else "${b.velocita}%", fontSize = 13.sp, color = Colori.tenue)
            }
        }
        if (piano.isNotEmpty()) Button({ vm.iniziaStudio(per, minuti!!) }, Modifier.padding(top = 6.dp).testTag("inizia-studio")) { Text("Inizia") }
    }
}

@Composable
internal fun InCorso(vm: Adam, piano: List<Pratica.Blocco>, fatti: Int) {
    val b = piano.getOrNull(fatti) ?: return
    var velocita by remember(fatti) { mutableStateOf(b.velocita) }
    Text("${fatti + 1}/${piano.size} · ${b.etichetta}", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
    Tenue("${b.minuti} minuti" + if (b.ripasso) " · ripasso a tempo" else "")
    // La velocità suonata davvero: quella del piano, o quella che il Ghost ha messo su Moises.
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton({ velocita = (velocita - Pratica.PASSO).coerceAtLeast(10) }) { Text("−", fontSize = 20.sp) }
        Text("$velocita%", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        TextButton({ velocita = (velocita + Pratica.PASSO).coerceAtMost(200) }) { Text("+", fontSize = 20.sp) }
        if (it.resonance.adam.battito.Studio.link(b.fonte) != null) TextButton({ vm.apriFonte(b.fonte) }) { Text("Apri la fonte") }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Button({ vm.segnaStudio(EsitoPratica.PULITO, velocita) }, Modifier.testTag("pulito")) { Text("✓ Pulito") }
        OutlinedButton({ vm.segnaStudio(EsitoPratica.ERRORI, velocita) }) { Text("✗ Errori") }
        TextButton({ vm.segnaStudio(EsitoPratica.SALTATO, velocita) }) { Text("Avanti") }
    }
    TextButton({ vm.chiudiStudio() }) { Text("Chiudi qui", color = Colori.tenue) }
}
