package it.resonance.adam.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.logica.Pratica
import it.resonance.adam.logica.Prova
import kotlinx.coroutines.delay

// La prova generale a schermo intero (logica/Prova.kt): nero, il brano enorme, il prossimo sotto. Si suona, non si
// legge: un tocco ovunque porta avanti, la pressione lunga segna «perso il filo». Lo schermo resta acceso.
@Composable
fun ProvaUi(vm: Adam) {
    val vista = LocalView.current
    DisposableEffect(Unit) { vista.keepScreenOn = true; onDispose { vista.keepScreenOn = false } }
    val sessione by vm.sessione.collectAsState()
    val esiti by vm.esitiSessione.collectAsState()
    val tocco = LocalHapticFeedback.current
    var ora by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { ora = System.currentTimeMillis(); delay(500) } }
    val s = sessione?.takeIf { it.nota == Prova.NOTA }
    Box(Modifier.fillMaxSize().background(Color.Black).testTag("prova")) {
        if (s == null) {
            // Finita: il resoconto, che resta anche nel diario.
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp)) {
                Text("Prova generale", color = Colori.ambra, fontSize = 14.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                vm.resocontoProva.forEachIndexed { i, r ->
                    Text(r, color = if (i == 0) Color.White else Color(0xFFBDB8A8), fontSize = if (i == 0) 22.sp else 16.sp,
                        fontWeight = if (i == 0) FontWeight.SemiBold else FontWeight.Normal, modifier = Modifier.padding(top = if (i == 0) 12.dp else 4.dp))
                }
                TextButton({ vm.provaAperta = false }, modifier = Modifier.padding(top = 24.dp)) { Text("Chiudi", color = Colori.ambra, fontSize = 18.sp) }
            }
            return@Box
        }
        val piano = remember(s.piano) { Pratica.decodifica(s.piano) }
        val i = esiti.size
        val brano = piano.getOrNull(i)
        val inizioBrano = esiti.lastOrNull()?.istante ?: s.inizio
        Column(Modifier.fillMaxSize().pointerInput(i) {
            detectTapGestures(
                onTap = { tocco.performHapticFeedback(HapticFeedbackType.TextHandleMove); vm.segnaProva(EsitoPratica.PULITO) },
                onLongPress = { tocco.performHapticFeedback(HapticFeedbackType.LongPress); vm.segnaProva(EsitoPratica.ERRORI) },
            )
        }.padding(24.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("${i + 1} / ${piano.size}", color = Color(0xFF8C8778), fontSize = 18.sp, modifier = Modifier.weight(1f))
                Text("set ${Prova.mmss(ora - s.inizio)}", color = Color(0xFF8C8778), fontSize = 18.sp)
            }
            Column {
                Text(brano?.etichetta ?: "", color = Color.White, fontSize = 46.sp, lineHeight = 52.sp, fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Start, modifier = Modifier.testTag("brano"))
                Text(Prova.mmss(ora - inizioBrano), color = Colori.ambra, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                piano.getOrNull(i + 1)?.let { Text("poi: ${it.etichetta}", color = Color(0xFFBDB8A8), fontSize = 22.sp, modifier = Modifier.padding(top = 28.dp)) }
                    ?: Text("ultimo brano", color = Color(0xFFBDB8A8), fontSize = 22.sp, modifier = Modifier.padding(top = 28.dp))
            }
            Column {
                Text("Tocca: brano dopo · Tieni premuto: perso il filo", color = Color(0xFF6E6A5C), fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (it.resonance.adam.battito.Studio.link(brano?.fonte) != null) TextButton({ vm.apriFonte(brano?.fonte) }) { Text("Fonte", color = Color(0xFFBDB8A8)) }
                    TextButton({ vm.segnaProva(EsitoPratica.SALTATO) }) { Text("Salta", color = Color(0xFFBDB8A8)) }
                    TextButton({ vm.chiudiProva() }, modifier = Modifier.testTag("fine-prova")) { Text("Fine", color = Colori.ambra) }
                }
            }
        }
    }
}
