package it.resonance.adam.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.logica.Quaderni
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Il quaderno è ciò che lo Shell legge di te a ogni turno: deve potersi rivedere, correggere, svuotare.
// Ogni salvataggio lascia la versione precedente nello storico (Legge 14), da cui si può rimettere.
@Composable
fun QuadernoEditor(vm: Adam, p: Pilastro) {
    val quaderni by vm.quaderni.collectAsState()
    val salvato = quaderni.find { it.pilastro == p }?.testo.orEmpty()
    var testo by remember(p, salvato) { mutableStateOf(salvato) }
    var perRighe by remember(p) { mutableStateOf(true) }
    var svuota by remember(p) { mutableStateOf(false) }
    var storico by remember(p) { mutableStateOf(false) }
    val versioni by remember(p) { vm.versioni("quaderno", p.ordinal.toLong()) }.collectAsState(emptyList())
    val colore = Colori.di(p)
    val modificato = testo != salvato

    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(perRighe, { perRighe = true }, label = { Text("Per righe") })
            FilterChip(!perRighe, { perRighe = false }, label = { Text("Testo intero") })
        }
        if (perRighe) {
            val righe = Quaderni.righe(testo)
            if (righe.isEmpty()) Tenue("Quaderno vuoto.")
            righe.forEachIndexed { i, r ->
                Row(verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
                    Text(r, fontSize = 14.sp, lineHeight = 19.sp, modifier = Modifier.weight(1f).padding(top = 10.dp))
                    TextButton({ testo = Quaderni.senza(testo, i) }, modifier = Modifier.testTag("togli-$i")) { Text("✕", color = Colori.allarme) }
                }
                HorizontalDivider(color = Colori.linea)
            }
            Tenue("✕ toglie la riga. Per correggere una parola passa a «Testo intero».")
        } else {
            OutlinedTextField(testo, { testo = it }, modifier = Modifier.fillMaxWidth().heightIn(min = 200.dp))
        }
        if (modificato) Tenue("Modifiche non salvate: lo Shell legge ancora la versione salvata.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
            Button({ vm.salvaQuaderno(p, testo) }, enabled = modificato,
                colors = ButtonDefaults.buttonColors(containerColor = colore)) { Text("Salva") }
            OutlinedButton({ testo = salvato }, enabled = modificato) { Text("Annulla") }
            TextButton({ svuota = true }, enabled = salvato.isNotBlank()) { Text("Svuota", color = Colori.allarme) }
        }
        if (versioni.isNotEmpty()) {
            TextButton({ storico = !storico }) { Text("${versioni.size} versioni precedenti") }
            if (storico) versioni.forEach { v ->
                Scheda {
                    Tenue("sostituita il ${SimpleDateFormat("d MMM yyyy HH:mm", Locale.ITALIAN).format(Date(v.sostituitoIl))}")
                    Text(v.testo.ifBlank { "(vuoto)" }, fontSize = 13.sp)
                    TextButton({ testo = v.testo }) { Text("Riporta questa (poi Salva)") }
                }
            }
        }
    }
    if (svuota) AlertDialog(
        onDismissRequest = { svuota = false },
        title = { Text("Svuotare il quaderno ${p.etichetta}?") },
        text = { Text("Lo Shell non lo leggerà più. La versione attuale resta nelle versioni precedenti e si può rimettere.") },
        confirmButton = { TextButton({ vm.salvaQuaderno(p, ""); svuota = false }) { Text("Svuota", color = Colori.allarme) } },
        dismissButton = { TextButton({ svuota = false }) { Text("Lascia") } },
    )
}
