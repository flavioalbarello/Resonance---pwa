package it.resonance.adam.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import it.resonance.adam.dati.Lettura
import it.resonance.adam.logica.Giorni
import it.resonance.adam.logica.Ricerca
import java.time.LocalDate

// Segui sullo Specchio (02/10/2026): ciò che lo Shell segue si vede senza cercarlo — il giorno, l'ultima lettura con le
// sue fonti, gli avvisi del programma. Finito il periodo, il resoconto resta qui in cima finché il Ghost non tocca Visto.
@Composable
fun SeguiUi(vm: Adam) {
    val osservazioni by vm.osservazioni.collectAsState()
    val letture by vm.letture.collectAsState()
    val oggi = LocalDate.now()
    osservazioni.filter { it.chiusa != null && !it.visto }.forEach { o ->
        Scheda(Colori.ambra, Modifier.testTag("resoconto-${o.id}")) {
            Etichetta("Resoconto · ${o.cosa}", Colori.ambraInchiostro)
            Tenue("Seguito dal ${Giorni.leggibile(o.inizio)} al ${Giorni.leggibile(o.fine)}")
            Riga(o.resoconto)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Letture(letture.filter { it.osservazioneId == o.id })
                TextButton({ vm.resocontoVisto(o.id) }) { Text("Visto") }
            }
        }
    }
    osservazioni.filter { it.chiusa == null }.forEach { o ->
        val sue = letture.filter { it.osservazioneId == o.id }
        val ultima = sue.maxByOrNull { it.istante }
        Scheda(Colori.air, Modifier.testTag("segui-${o.id}")) {
            Etichetta("Segui · ${o.cosa}", Colori.air)
            Tenue(Ricerca.giorno(o, oggi) + " · " + (ultima?.let { "ultima lettura ${Giorni.leggibile(it.giorno)}" }
                ?: "la prima lettura arriva appena possibile, poi ogni sera dalle ${it.resonance.adam.battito.Seguite.ORA_LETTURA}"))
            ultima?.let { l ->
                Riga(l.testo.lines().filter { it.isNotBlank() }.take(8).joinToString("\n"))
                val fonti = Ricerca.decodificaFonti(l.fonti)
                Tenue(if (fonti.isEmpty()) "nessuna fonte dal motore" else "fonti: " + fonti.take(4).joinToString(", ") { it.dominio })
                l.problemi.lines().filter { it.isNotBlank() }.forEach { Riga("⚠ $it", Colori.allarme) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (sue.size > 1) Letture(sue)
                TextButton({ vm.smettiDiSeguire(o.id) }) { Text("Smetti", color = Colori.tenue) }
            }
        }
    }
}

// Tutte le letture, dalla più recente: ogni giorno con il suo testo e le sue fonti.
@Composable
private fun Letture(sue: List<Lettura>) {
    var aperte by rememberSaveable(sue.firstOrNull()?.osservazioneId) { mutableStateOf(false) }
    TextButton({ aperte = !aperte }) { Text(if (aperte) "Chiudi le letture" else "Tutte le letture (${sue.size})") }
    if (aperte) sue.sortedByDescending { it.istante }.forEach { l ->
        Etichetta(Giorni.leggibile(l.giorno))
        Riga(Ricerca.scheda(l.testo, Ricerca.decodificaFonti(l.fonti), l.problemi.lines().filter { it.isNotBlank() }))
        Spazio(8)
    }
}

