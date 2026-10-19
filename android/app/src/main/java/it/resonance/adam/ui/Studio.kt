package it.resonance.adam.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
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
import it.resonance.adam.dati.MisuraFronte
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
            s != null && s.nota == it.resonance.adam.logica.Prova.NOTA -> Row(verticalAlignment = Alignment.CenterVertically) {
                Tenue("Prova generale in corso.")
                TextButton({ vm.provaAperta = true }) { Text("Riprendi") }
            }
            s != null && s.percorsoId == per.id -> InCorso(vm, Pratica.decodifica(s.piano), esiti.size, per.misura)
            s != null -> Tenue("C'è uno studio in corso su un altro fronte: chiudilo da lì o dalla notifica.")
            else -> {
                Avvio(vm, per)
                // La prova generale (logica/Prova.kt): la scaletta intera, a schermo intero, come sul palco.
                if (pezzi.size >= 2) TextButton({ vm.iniziaProva(per) }, modifier = Modifier.testTag("prova-generale")) { Text("▶ Prova generale: tutta la scaletta") }
            }
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
                Text(when { b.ripasso -> "ripasso"; per.misura == MisuraFronte.VELOCITA -> "${b.velocita}%"; else -> "" }, fontSize = 13.sp, color = Colori.tenue)
            }
        }
        if (piano.isNotEmpty()) Button({ vm.iniziaStudio(per, minuti!!) }, Modifier.padding(top = 6.dp).testTag("inizia-studio")) { Text("Inizia") }
    }
}

@Composable
internal fun InCorso(vm: Adam, piano: List<Pratica.Blocco>, fatti: Int, misura: MisuraFronte = MisuraFronte.VELOCITA) {
    val b = piano.getOrNull(fatti) ?: return
    var velocita by remember(fatti) { mutableStateOf(b.velocita) }
    Text("${fatti + 1}/${piano.size} · ${b.etichetta}", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
    Tenue("${b.minuti} minuti" + if (b.ripasso) " · ripasso" else "")
    // La velocità suonata davvero: quella del piano, o quella che il Ghost ha messo su Moises. Solo per ciò che si suona.
    if (misura == MisuraFronte.VELOCITA) Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton({ velocita = (velocita - Pratica.PASSO).coerceAtLeast(10) }) { Text("−", fontSize = 20.sp) }
        Text("$velocita%", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        TextButton({ velocita = (velocita + Pratica.PASSO).coerceAtMost(200) }) { Text("+", fontSize = 20.sp) }
        if (it.resonance.adam.battito.Studio.link(b.fonte) != null) TextButton({ vm.apriFonte(b.fonte) }) { Text("Apri la fonte") }
    } else if (it.resonance.adam.battito.Studio.link(b.fonte) != null) TextButton({ vm.apriFonte(b.fonte) }) { Text("Apri la fonte") }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Button({ vm.segnaStudio(EsitoPratica.PULITO, velocita) }, Modifier.testTag("pulito")) { Text(misura.esiti[0]) }
        OutlinedButton({ vm.segnaStudio(EsitoPratica.ERRORI, velocita) }) { Text(misura.esiti[1]) }
        TextButton({ vm.segnaStudio(EsitoPratica.SALTATO, velocita) }) { Text(misura.esiti[2].removePrefix("→ ")) }
    }
    // L'Orecchio solo per ciò che si suona: la velocità e il tempo sono la stessa misura.
    if (misura == MisuraFronte.VELOCITA) OrecchioUi(vm, velocita)
    TextButton({ vm.chiudiStudio() }) { Text("Chiudi qui", color = Colori.tenue) }
}

// Il motore del fronte (V3 fase 3, logica/Fronte.kt): ogni quanti giorni lo Shell ci lavora da solo, e il prossimo passo.
// Lo regola il Ghost qui, o lo Shell propone (regola_fronte) e il Ghost dice Sì da Oggi.
private val RITMI = listOf(0, 1, 3, 7)

@Composable
fun MotoreUi(vm: Adam, per: Percorso, colore: Color) {
    var passo by remember { mutableStateOf(false) }
    Scheda(colore, Modifier.testTag("motore")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Etichetta("Motore", colore)
            Text("  " + if (per.ritmoGiorni == 0) "spento: lo Shell ci lavora quando glielo chiedi" else "lo Shell ci lavora da solo ogni ${per.ritmoGiorni} " +
                (if (per.ritmoGiorni == 1) "giorno" else "giorni") + (per.ultimoLavoro?.let { ", l'ultima volta il ${java.time.LocalDate.parse(it).format(java.time.format.DateTimeFormatter.ofPattern("d/M"))}" } ?: ""),
                fontSize = 12.sp, color = Colori.tenue, modifier = Modifier.weight(1f))
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(RITMI) { r -> FilterChip(per.ritmoGiorni == r, { vm.ritmoFronte(per, r) }, label = { Text(if (r == 0) "spento" else "ogni $r g") }) }
        }
        // Come si misura (fase 8): velocità % per ciò che si suona; fatto / in parte / saltato per il resto.
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            MisuraFronte.entries.forEach { m -> FilterChip(per.misura == m, { vm.misuraFronte(per, m) },
                label = { Text(if (m == MisuraFronte.VELOCITA) "da suonare (%)" else "da fare", fontSize = 12.sp) }, modifier = Modifier.testTag("misura-${m.name}")) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (per.prossimoPasso.isBlank()) "Nessun prossimo passo" else "→ ${per.prossimoPasso}", fontSize = 14.sp,
                color = if (per.prossimoPasso.isBlank()) Colori.tenue else Colori.inchiostro, modifier = Modifier.weight(1f))
            TextButton({ passo = true }) { Text(if (per.prossimoPasso.isBlank()) "Scrivi" else "Cambia", fontSize = 12.sp) }
        }
    }
    if (passo) DialogoTesto("Prossimo passo", per.prossimoPasso, "una riga concreta · vuoto lo toglie", vuotoOk = true,
        onOk = { vm.passoFronte(per, it) }, onChiudi = { passo = false })
}

// L'Orecchio dentro lo studio (logica/Orecchio.kt): un anello che pulsa a ogni nota sentita, verde a tempo, ambra se
// corri, blu se trascini; sotto, il giudizio del blocco finora, e un tocco per segnare l'esito che l'Orecchio propone.
@Composable
fun OrecchioUi(vm: Adam, velocita: Int) {
    TextButton({ vm.ascoltami() }, modifier = Modifier.testTag("ascoltami")) {
        Text(if (vm.orecchio) "👂 Smetti di ascoltarmi" else "👂 Ascoltami mentre suono")
    }
    if (!vm.orecchio) return
    val attacchi by vm.attacchi.collectAsState()
    vm.erroreOrecchio()?.let { Tenue("L'Orecchio non sente: $it"); return }
    val battute = it.resonance.adam.logica.Orecchio.battute(attacchi.takeLast(9))
    val senso = battute.lastOrNull()?.let { b -> it.resonance.adam.logica.Orecchio.senso(b.scartoMs) }
    val colore = when (senso) {
        it.resonance.adam.logica.Orecchio.Senso.A_TEMPO -> Colori.bio
        it.resonance.adam.logica.Orecchio.Senso.CORRI -> Colori.ambra
        it.resonance.adam.logica.Orecchio.Senso.TRASCINI -> Colori.air
        null -> Colori.tenue
    }
    // Il battito dell'anello: ogni nota nuova lo fa gonfiare, poi torna.
    val gonfio = remember { androidx.compose.animation.core.Animatable(1f) }
    androidx.compose.runtime.LaunchedEffect(attacchi.size) { gonfio.snapTo(1.25f); gonfio.animateTo(1f, androidx.compose.animation.core.tween(220)) }
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
        androidx.compose.foundation.Canvas(Modifier.padding(end = 12.dp).size(64.dp)) {
            val r = size.minDimension / 2 * 0.7f * gonfio.value
            drawCircle(colore.copy(alpha = 0.18f), r * 1.3f)
            drawCircle(colore, r, style = androidx.compose.ui.graphics.drawscope.Stroke(size.minDimension * 0.08f))
        }
        Column {
            Text(when (senso) {
                it.resonance.adam.logica.Orecchio.Senso.A_TEMPO -> "a tempo"
                it.resonance.adam.logica.Orecchio.Senso.CORRI -> "corri"
                it.resonance.adam.logica.Orecchio.Senso.TRASCINI -> "trascini"
                null -> "suona: ti ascolto"
            } + (battute.lastOrNull()?.let { b -> " · ${if (b.scartoMs >= 0) "+" else ""}${b.scartoMs.toInt()} ms" } ?: ""),
                fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = colore)
            val g = it.resonance.adam.logica.Orecchio.giudica(attacchi)
            Tenue(g.riga())
            g.esito?.let { e -> TextButton({ vm.segnaStudio(e, velocita) }, modifier = Modifier.testTag("segna-orecchio")) {
                Text("Segna «${if (e == EsitoPratica.PULITO) "pulito" else "errori"}», come dice l'Orecchio")
            } }
        }
    }
}
