package it.resonance.adam.ui

import android.graphics.Bitmap
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.logica.Ritratto
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

// Il disegno del Ritratto di Adam (logica/Ritratto.kt): legge il modello e basta, così lo stesso disegno vale per lo
// schermo (animato: respira e gira piano), per il widget e per lo sfondo (fermi, renderizzati in una bitmap).
private val ANGOLI = mapOf(Pilastro.BIO to -90f, Pilastro.AIR to 30f, Pilastro.VIDYA to 150f)

private fun colore(p: Pilastro) = Colori.di(p)

@Composable
fun RitrattoUi(m: Ritratto.Modello, modifier: Modifier = Modifier) {
    val tempo = rememberInfiniteTransition(label = "ritratto")
    val t by tempo.animateFloat(0f, 1f, infiniteRepeatable(tween(12_000, easing = LinearEasing), RepeatMode.Restart), label = "t")
    Canvas(modifier.fillMaxWidth().aspectRatio(1f)) { disegnaRitratto(m, t) }
}

fun DrawScope.disegnaRitratto(m: Ritratto.Modello, t: Float) {
    val c = center
    val r = min(size.width, size.height) / 2f
    val fase = (t * 2 * PI).toFloat()
    // Il cielo: un alone caldo al centro, che respira.
    drawCircle(Brush.radialGradient(listOf(Colori.ambra.copy(alpha = 0.22f), Colori.vidya.copy(alpha = 0.06f), Color.Transparent), c, r), r, c)
    // Le scintille: fisse per il giorno (il seme), brillano a turno.
    val caso = Random(m.seme)
    repeat(28) { k ->
        val a = caso.nextFloat() * 2 * PI.toFloat(); val d = r * (0.55f + caso.nextFloat() * 0.43f)
        val luce = ((sin(fase * 2 + k) + 1) / 2).coerceIn(0f, 1f)
        drawCircle(Colori.ambra.copy(alpha = 0.15f + 0.45f * luce), r * 0.008f * (1 + luce), c + Offset(cos(a) * d, sin(a) * d))
    }
    rotate(t * 360f / 6f + m.seme % 30, c) {
        // I petali: i pilastri. Lunghi quanto sono vivi; un vuoto tratteggiato se fermi da due settimane.
        m.petali.forEachIndexed { i, p ->
            val ang = Math.toRadians((ANGOLI[p.pilastro] ?: 0f).toDouble()).toFloat()
            val respiro = 1f + 0.035f * sin(fase * 3 + i * 2.1f)
            val lung = r * (if (p.carenza) 0.42f else 0.28f + 0.5f * p.vita) * respiro
            val larg = lung * 0.42f
            val dir = Offset(cos(ang), sin(ang)); val perp = Offset(-dir.y, dir.x)
            val base = c + dir * (r * 0.06f)
            val punta = c + dir * lung
            val petalo = Path().apply {
                moveTo(base.x, base.y)
                cubicTo((base + dir * (lung * 0.3f) + perp * larg).x, (base + dir * (lung * 0.3f) + perp * larg).y,
                    (punta - dir * (lung * 0.15f) + perp * (larg * 0.5f)).x, (punta - dir * (lung * 0.15f) + perp * (larg * 0.5f)).y, punta.x, punta.y)
                cubicTo((punta - dir * (lung * 0.15f) - perp * (larg * 0.5f)).x, (punta - dir * (lung * 0.15f) - perp * (larg * 0.5f)).y,
                    (base + dir * (lung * 0.3f) - perp * larg).x, (base + dir * (lung * 0.3f) - perp * larg).y, base.x, base.y)
                close()
            }
            if (p.carenza) drawPath(petalo, Colori.tenue.copy(alpha = 0.55f),
                style = Stroke(r * 0.012f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(r * 0.03f, r * 0.025f))))
            else {
                drawPath(petalo, Brush.linearGradient(listOf(colore(p.pilastro).copy(alpha = 0.9f), colore(p.pilastro).copy(alpha = 0.18f)), base, punta))
                drawPath(petalo, colore(p.pilastro).copy(alpha = 0.9f), style = Stroke(r * 0.006f))
            }
        }
        // I rami: i fronti, dal petalo del loro pilastro (quelli di Adam dal centro, fra i petali).
        val perPilastro = m.rami.groupBy { it.pilastro }
        perPilastro.forEach { (pil, rami) ->
            rami.forEachIndexed { k, ramo ->
                val angBase = ANGOLI[pil] ?: (90f + 120f * k)
                val ang = Math.toRadians((angBase + (k - (rami.size - 1) / 2f) * 22f + 10f * sin(fase + k)).toDouble()).toFloat()
                val dir = Offset(cos(ang), sin(ang)); val perp = Offset(-dir.y, dir.x)
                // Il ramo nasce dalla punta del suo petalo e cresce verso fuori: dentro il petalo non si vedrebbe.
                val petalo = m.petali.find { it.pilastro == pil }
                val radice = if (petalo == null) 0.2f else if (petalo.carenza) 0.4f else (0.28f + 0.5f * petalo.vita) * 0.92f
                val da = c + dir * (r * radice)
                val lung = r * maxOf(0.18f, 0.98f - radice) * (0.45f + 0.55f * ramo.avanzamento.coerceAtLeast(0.08f))
                val a = da + dir * lung
                val ctrl = da + dir * (lung * 0.5f) + perp * (lung * 0.22f * (if (k % 2 == 0) 1 else -1))
                val ramoPath = Path().apply { moveTo(da.x, da.y); quadraticTo(ctrl.x, ctrl.y, a.x, a.y) }
                val col = if (pil == Pilastro.ADAM) Colori.ambra else colore(pil)
                drawPath(ramoPath, col.copy(alpha = 0.35f + 0.6f * ramo.vigore), style = Stroke(r * (0.008f + 0.02f * ramo.vigore), cap = StrokeCap.Round))
                // Le foglie: piene i pezzi pronti, vuote quelli da fare. Al massimo dodici, in fila lungo il ramo.
                val foglie = List(ramo.pronti.coerceAtMost(12)) { true } + List((ramo.daFare).coerceAtMost(12 - ramo.pronti.coerceAtMost(12))) { false }
                foglie.forEachIndexed { j, piena ->
                    val u = (j + 1f) / (foglie.size + 1f)
                    val pnt = Offset((1 - u) * (1 - u) * da.x + 2 * (1 - u) * u * ctrl.x + u * u * a.x, (1 - u) * (1 - u) * da.y + 2 * (1 - u) * u * ctrl.y + u * u * a.y) +
                        perp * (r * 0.035f * (if (j % 2 == 0) 1 else -1))
                    if (piena) drawCircle(col, r * 0.022f, pnt) else drawCircle(col.copy(alpha = 0.7f), r * 0.018f, pnt, style = Stroke(r * 0.006f))
                }
            }
        }
    }
    // Gli anelli: i rituali intorno al cuore, chiusi quanto reggono negli ultimi 14 giorni. Un punto acceso se oggi c'è.
    m.anelli.take(6).forEachIndexed { k, a ->
        val raggio = r * (0.1f + 0.035f * k)
        val col = colore(a.pilastro)
        drawCircle(col.copy(alpha = 0.12f), raggio, c, style = Stroke(r * 0.012f))
        drawArc(col, -90f, 360f * a.tenuta, false, Offset(c.x - raggio, c.y - raggio), Size(raggio * 2, raggio * 2), style = Stroke(r * 0.014f, cap = StrokeCap.Round))
        if (a.oggi) {
            val ang = Math.toRadians((-90f + 360f * a.tenuta).toDouble()).toFloat()
            drawCircle(Color.White, r * 0.012f, c + Offset(cos(ang), sin(ang)) * raggio)
        }
    }
    // Il cuore: Adam.
    val battito = 1f + 0.08f * ((sin(fase * 6) + 1) / 2)
    drawCircle(Brush.radialGradient(listOf(Color.White, Colori.ambra, Colori.vidya.copy(alpha = 0.6f)), c, r * 0.07f * battito), r * 0.07f * battito, c)
}

/** Il ritratto fermo, in una bitmap: per il widget e per lo sfondo. Lo stesso disegno, all'istante `t`. */
fun ritrattoBitmap(m: Ritratto.Modello, larghezza: Int, altezza: Int, fondo: Color? = Colori.fondo, t: Float = 0.25f, densita: Float = 2.5f): Bitmap {
    val img = ImageBitmap(larghezza, altezza)
    val canvas = androidx.compose.ui.graphics.Canvas(img)
    CanvasDrawScope().draw(Density(densita), LayoutDirection.Ltr, canvas, Size(larghezza.toFloat(), altezza.toFloat())) {
        fondo?.let { drawRect(it) }
        val lato = min(larghezza, altezza).toFloat()
        // Lo sfondo è alto: il ritratto sta nel terzo centrale, dove lo si vede fra le icone.
        val dx = (larghezza - lato) / 2f; val dy = (altezza - lato) / 2f
        drawContext.transform.translate(dx, dy)
        drawContext.size = Size(lato, lato)
        disegnaRitratto(m, t)
    }
    return img.asAndroidBitmap()
}
