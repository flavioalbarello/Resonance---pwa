package it.resonance.adam.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.logica.Film
import it.resonance.adam.logica.Ritratto

// Il film della settimana a schermo intero (logica/Film.kt): una scena ogni cinque secondi e mezzo, le barre in alto
// come nelle storie, uno sfondo che si muove col colore del pilastro. Tocco a destra: avanti; a sinistra: indietro;
// pressione lunga: pausa. 🔊 fa leggere tutto allo Shell.
private const val DURATA = 5500

private fun tinta(s: Film.Scena) = s.pilastro?.let { Colori.di(it) } ?: Colori.ambra

@Composable
fun FilmUi(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    val sessioni by vm.sessioni.collectAsState()
    val scene = vm.scenaFilm
    if (scene.isEmpty()) { LaunchedEffect(Unit) { vm.preparaFilm() }; Box(Modifier.fillMaxSize().background(Color.Black)); return }
    val ritratto = remember(i, sessioni) { Ritratto.da(i, sessioni) }
    var n by remember { mutableIntStateOf(0) }
    var pausa by remember { mutableStateOf(false) }
    val avanzamento = remember { Animatable(0f) }
    var mostrata by remember { mutableIntStateOf(0) }
    LaunchedEffect(n, pausa) {
        if (n != mostrata) { avanzamento.snapTo(0f); mostrata = n }
        if (pausa) { avanzamento.stop(); return@LaunchedEffect }
        avanzamento.animateTo(1f, tween(((1f - avanzamento.value) * DURATA).toInt().coerceAtLeast(1), easing = LinearEasing))
        if (n < scene.lastIndex) n++
    }
    DisposableEffect(Unit) { onDispose { vm.zittisciFilm() } }
    val scena = scene[n.coerceIn(0, scene.lastIndex)]
    // Lo sfondo: due macchie del colore della scena che si muovono piano.
    val moto = rememberInfiniteTransition(label = "film")
    val x by moto.animateFloat(0.2f, 0.8f, infiniteRepeatable(tween(7000), RepeatMode.Reverse), label = "x")
    Box(Modifier.fillMaxSize().background(Color(0xFF0E0D0A)).background(Brush.radialGradient(
        listOf(tinta(scena).copy(alpha = 0.55f), Color.Transparent), center = androidx.compose.ui.geometry.Offset(x * 1000f, 500f), radius = 1300f))
        .pointerInput(scene.size) {
            detectTapGestures(
                onTap = { o -> if (o.x > size.width / 3) { if (n < scene.lastIndex) n++ else vm.filmAperto = false } else if (n > 0) n-- },
                onLongPress = { pausa = !pausa },
            )
        }.testTag("film")) {
        Column(Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 16.dp)) {
            // Le barre delle scene.
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                scene.indices.forEach { k ->
                    val pieno = when { k < n -> 1f; k == n -> avanzamento.value; else -> 0f }
                    Box(Modifier.weight(1f).height(3.dp).clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = 0.25f))) {
                        Box(Modifier.fillMaxWidth(pieno).height(3.dp).background(Color.White))
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                Text(if (pausa) "in pausa" else "", color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp, modifier = Modifier.weight(1f))
                TextButton({ vm.leggiFilm(scene.drop(n).map { it.voce }) }) { Text("🔊", fontSize = 18.sp) }
                TextButton({ vm.filmAperto = false }) { Text("✕", color = Color.White, fontSize = 18.sp) }
            }
            AnimatedContent(scena, transitionSpec = { (fadeIn(tween(500)) + scaleIn(tween(500), initialScale = 0.85f)) togetherWith fadeOut(tween(250)) },
                label = "scena", modifier = Modifier.weight(1f)) { s ->
                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
                    Text(s.etichetta.uppercase(), color = tinta(s), fontSize = 14.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                    if (s.tipo == Film.Tipo.RITRATTO) RitrattoUi(ritratto, Modifier.padding(vertical = 12.dp))
                    else Text(s.grande, color = Color.White, fontWeight = FontWeight.Bold, lineHeight = if (s.tipo == Film.Tipo.ELENCO) 40.sp else 64.sp,
                        fontSize = when { s.tipo == Film.Tipo.ELENCO -> 32.sp; s.grande.length > 12 -> 44.sp; else -> 64.sp }, modifier = Modifier.padding(vertical = 10.dp))
                    Text(s.sotto, color = Color.White.copy(alpha = 0.75f), fontSize = 18.sp, lineHeight = 24.sp)
                }
            }
            Box(Modifier.width(1.dp).height(24.dp))
        }
    }
}
