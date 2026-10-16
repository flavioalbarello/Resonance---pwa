package it.resonance.adam.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

// Le icone dei tre luoghi (V3, il look): disegnate qui, a tratto, piene quando il luogo è aperto. Niente libreria di
// icone da aggiungere per tre segni; e i pallini ●/○ di prima non dicevano dove portavano.
@Composable
fun IconaLuogo(s: Schermata, attiva: Boolean, colore: Color) = Canvas(Modifier.size(24.dp)) {
    val tratto = Stroke(width = 1.8.dp.toPx(), cap = StrokeCap.Round)
    val w = size.width
    when (s) {
        // Oggi: un sole, il giorno.
        Schermata.OGGI -> {
            drawCircle(colore, radius = w * 0.2f, style = if (attiva) Fill else tratto)
            for (i in 0 until 8) {
                val a = Math.toRadians(i * 45.0)
                val c = Offset(w / 2, w / 2)
                drawLine(colore, c + Offset((Math.cos(a) * w * 0.32).toFloat(), (Math.sin(a) * w * 0.32).toFloat()),
                    c + Offset((Math.cos(a) * w * 0.44).toFloat(), (Math.sin(a) * w * 0.44).toFloat()), strokeWidth = tratto.width, cap = StrokeCap.Round)
            }
        }
        // Fronti: tre barre che avanzano.
        Schermata.FRONTI -> listOf(0.55f, 0.85f, 0.4f).forEachIndexed { i, l ->
            val y = w * (0.22f + i * 0.28f)
            drawRoundRect(colore.copy(alpha = if (attiva) 1f else 0.35f), Offset(w * 0.1f, y - w * 0.07f), Size(w * 0.8f * l, w * 0.14f), CornerRadius(w * 0.07f))
            if (!attiva) drawRoundRect(colore, Offset(w * 0.1f, y - w * 0.07f), Size(w * 0.8f * l, w * 0.14f), CornerRadius(w * 0.07f), style = Stroke(1.2.dp.toPx()))
        }
        // Shell: una nuvoletta di dialogo.
        else -> {
            val p = Path().apply {
                addRoundRect(androidx.compose.ui.geometry.RoundRect(w * 0.1f, w * 0.15f, w * 0.9f, w * 0.7f, CornerRadius(w * 0.18f)))
                moveTo(w * 0.3f, w * 0.68f); lineTo(w * 0.25f, w * 0.88f); lineTo(w * 0.48f, w * 0.69f)
            }
            drawPath(p, colore, style = if (attiva) Fill else tratto)
        }
    }
}
