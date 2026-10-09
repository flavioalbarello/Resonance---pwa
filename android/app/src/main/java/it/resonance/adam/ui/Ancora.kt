package it.resonance.adam.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.sin

private data class Spicchio(val etichetta: String, val colore: Color, val testoScuro: Boolean, val azione: () -> Unit)

// Ancora sul bordo destro a un terzo dell'altezza dal basso: il punto dove il pollice riposa
// in presa a una mano. Mentre si ascolta l'ancora stessa è il tasto per fermare, come in Gemini.
@Composable
fun Ancora(vm: Adam, conMicrofono: (() -> Unit) -> Unit) {
    var aperto by remember { mutableStateOf(false) }
    val ascolta = vm.ascolta != Ascolta.SPENTO
    val spicchi = listOf(
        Spicchio("Specchio", Colori.ambra, true) { vm.vai(Schermata.SPECCHIO) },
        Spicchio("Shell", Colori.ambra, true) { vm.vai(Schermata.SHELL) },
        Spicchio("Bio", Colori.bio, false) { vm.vai(Schermata.BIO) },
        Spicchio("Air", Colori.air, false) { vm.vai(Schermata.AIR) },
        Spicchio("Vidya", Colori.vidya, false) { vm.vai(Schermata.VIDYA) },
        Spicchio("🎤", Colori.allarmeFondo, true) { conMicrofono { vm.avviaDettatura() } },
        Spicchio("Auto", Colori.allarme, false) { conMicrofono { vm.avviaAuto() } },
    )

    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (aperto) Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) { aperto = false })
        val centroY = maxHeight * 2 / 3
        val raggio = 190f
        spicchi.forEachIndexed { i, s ->
            val gradi = 195f - i * (105f / (spicchi.size - 1))
            val rad = Math.toRadians(gradi.toDouble())
            val t by animateFloatAsState(if (aperto) 1f else 0f, tween(220, delayMillis = if (aperto) i * 20 else 0), label = "spicchio$i")
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(
                        x = (-16 + (cos(rad) * raggio * t)).dp,
                        y = centroY - 24.dp + (-sin(rad) * raggio * t).dp,
                    )
                    .size(48.dp)
                    .scale(0.3f + 0.7f * t)
                    .alpha(t)
                    .shadow(6.dp, CircleShape)
                    .background(s.colore, CircleShape)
                    .clickable(enabled = aperto) { aperto = false; s.azione() },
                contentAlignment = Alignment.Center,
            ) {
                Text(s.etichetta, color = if (s.testoScuro) Colori.ambraInchiostro else Color.White, fontSize = if (s.etichetta.length > 2) 10.sp else 20.sp, maxLines = 1, fontWeight = FontWeight.Bold)
            }
        }
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .offset(x = (-14).dp, y = centroY - 26.dp)
                .testTag("ancora")
                .size(52.dp)
                .scale(if (ascolta) pulsazione() else 1f)
                .shadow(8.dp, CircleShape)
                .background(if (ascolta) Colori.allarme else Colori.ambra, CircleShape)
                .clickable { if (ascolta) { vm.ferma(); aperto = false } else aperto = !aperto },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                when { ascolta -> "■"; aperto -> "✕"; else -> "◎" },
                color = if (ascolta) Color.White else Colori.ambraInchiostro, fontSize = 20.sp,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
    }
}

@Composable
private fun pulsazione(): Float = rememberInfiniteTransition(label = "pulsa").animateFloat(
    1f, 1.08f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "scala",
).value
