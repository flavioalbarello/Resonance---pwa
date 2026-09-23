package it.resonance.adam.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.TipoMisura
import it.resonance.adam.logica.Punto

@Composable
fun Scheda(colore: Color? = null, modifier: Modifier = Modifier, contenuto: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .background(Colori.superficie, RoundedCornerShape(18.dp))
            .border(1.dp, colore?.copy(alpha = 0.35f) ?: Colori.linea, RoundedCornerShape(18.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = contenuto,
    )
}

@Composable
fun Etichetta(testo: String, colore: Color = Colori.tenue) =
    Text(testo.uppercase(), color = colore, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)

@Composable
fun Riga(testo: String, colore: Color = Colori.inchiostro) = Text(testo, color = colore, fontSize = 15.sp, lineHeight = 21.sp)

@Composable
fun Tenue(testo: String) = Text(testo, color = Colori.tenue, fontSize = 13.sp, lineHeight = 18.sp)

@Composable
fun Linea(punti: List<Punto>, colore: Color, modifier: Modifier = Modifier) {
    if (punti.size < 2) return
    Canvas(modifier.fillMaxWidth().height(44.dp)) {
        val min = punti.minOf { it.valore }
        val max = punti.maxOf { it.valore }
        val span = (max - min).takeIf { it > 0 } ?: 1.0
        val primo = punti.first().giorno.toEpochDay().toFloat()
        val ultimo = punti.last().giorno.toEpochDay().toFloat()
        val larghezza = (ultimo - primo).takeIf { it > 0 } ?: 1f
        fun p(pt: Punto) = Offset(
            (pt.giorno.toEpochDay() - primo) / larghezza * size.width,
            size.height - ((pt.valore - min) / span).toFloat() * (size.height - 6f) - 3f,
        )
        val path = Path().apply { punti.forEachIndexed { i, pt -> val o = p(pt); if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y) } }
        drawPath(path, colore, style = Stroke(width = 5f, cap = StrokeCap.Round))
        drawCircle(colore, 7f, p(punti.last()))
    }
}

@Composable
fun DialogoTesto(titolo: String, iniziale: String = "", etichetta: String = "", righe: Int = 1, onOk: (String) -> Unit, onChiudi: () -> Unit) {
    var t by remember { mutableStateOf(iniziale) }
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text(titolo) },
        text = { OutlinedTextField(t, { t = it }, label = { Text(etichetta) }, minLines = righe, modifier = Modifier.fillMaxWidth()) },
        confirmButton = { TextButton({ if (t.isNotBlank()) { onOk(t); onChiudi() } }) { Text("Salva") } },
        dismissButton = { TextButton(onChiudi) { Text("Annulla") } },
    )
}

@Composable
fun DialogoMisura(pilastro: Pilastro?, onOk: (TipoMisura, Double, Boolean?) -> Unit, onChiudi: () -> Unit) {
    val tipi = TipoMisura.entries.filter { pilastro == null || it.pilastro == pilastro }
    var tipo by remember { mutableStateOf(tipi.first()) }
    var valore by remember { mutableStateOf("") }
    var legata by remember { mutableStateOf(false) }
    val unita = when (tipo) {
        TipoMisura.SONNO, TipoMisura.ALLENAMENTO, TipoMisura.PRATICA -> "minuti"
        TipoMisura.OPERA -> "quante"
        else -> tipo.unita
    }
    AlertDialog(
        onDismissRequest = onChiudi,
        title = { Text("Un numero") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    Column {
                        tipi.chunked(3).forEach { gruppo ->
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                gruppo.forEach { t -> FilterChip(tipo == t, { tipo = t }, label = { Text(t.etichetta) }) }
                            }
                        }
                    }
                }
                OutlinedTextField(
                    valore, { valore = it }, label = { Text(unita) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                )
                if (tipo == TipoMisura.ENTRATA) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(legata, { legata = it })
                        Spacer(Modifier.width(8.dp))
                        Text(if (legata) "Pagamento del mio tempo" else "Entra senza vendere tempo")
                    }
                }
            }
        },
        confirmButton = {
            TextButton({
                valore.replace(',', '.').toDoubleOrNull()?.let { onOk(tipo, it, if (tipo == TipoMisura.ENTRATA) legata else null); onChiudi() }
            }) { Text("Registra") }
        },
        dismissButton = { TextButton(onChiudi) { Text("Annulla") } },
    )
}

@Composable
fun Spazio(h: Int = 8) = Spacer(Modifier.height(h.dp))
