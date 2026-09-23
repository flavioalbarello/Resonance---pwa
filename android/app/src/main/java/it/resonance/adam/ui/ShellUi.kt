package it.resonance.adam.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.dati.StatoProposta

@Composable
fun ShellUi(vm: Adam) {
    val messaggi by vm.messaggi.collectAsState()
    val lista = rememberLazyListState()
    LaunchedEffect(messaggi.size) { if (messaggi.isNotEmpty()) lista.animateScrollToItem(messaggi.size - 1) }
    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(
            state = lista,
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (messaggi.isEmpty()) item {
                Scheda {
                    Etichetta("Shell")
                    Riga("Parlagli come parleresti a te stesso. Quando dici un numero o chiedi di salvare qualcosa, ti propone l'azione e la esegue solo quando confermi.")
                    Tenue("Il microfono è nell'ancora a destra: 🎤 detta nella casella, Auto è a mani libere e conferma a voce con «sì».")
                }
            }
            items(messaggi, key = { it.id }) { m -> Messaggio(vm, m) }
            item { Spazio(8) }
        }
        if (vm.pensa) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Colori.ambra)
        if (vm.parziale.isNotBlank()) Text("${vm.parziale}…", color = Colori.tenue, fontStyle = FontStyle.Italic, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        if (vm.ascolta == Ascolta.AUTO) Text("Modalità auto: ascolto e rispondo a voce. Tocca l'ancora rossa per fermare.", color = Colori.allarme, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp))
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 8.dp, top = 4.dp), verticalAlignment = Alignment.Bottom) {
            OutlinedTextField(vm.input, { vm.input = it }, placeholder = { Text("Scrivi allo Shell…") }, modifier = Modifier.weight(1f), maxLines = 6)
            Button({ vm.invia() }, enabled = !vm.pensa && vm.input.isNotBlank(), modifier = Modifier.padding(start = 8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Colori.ambra, contentColor = Colori.ambraInchiostro)) { Text("Invia") }
        }
    }
}

@Composable
private fun Messaggio(vm: Adam, m: Messaggio) {
    when (m.ruolo) {
        Ruolo.GHOST -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Text(m.testo, color = Colori.ambraInchiostro, fontSize = 15.sp, modifier = Modifier
                .widthIn(max = 300.dp)
                .background(Colori.ambra.copy(alpha = 0.25f), RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp))
                .padding(12.dp))
        }
        Ruolo.SHELL -> SelectionContainer {
            Text(Formato.annota(m.testo), color = Colori.inchiostro, fontSize = 15.sp, lineHeight = 21.sp, modifier = Modifier
                .widthIn(max = 330.dp)
                .background(Colori.superficie, RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp))
                .border(1.dp, Colori.linea, RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp))
                .padding(12.dp))
        }
        Ruolo.PROPOSTA -> Column(Modifier
            .fillMaxWidth()
            .background(Colori.fondo2, RoundedCornerShape(14.dp))
            .border(1.dp, Colori.ambra.copy(alpha = 0.6f), RoundedCornerShape(14.dp))
            .padding(12.dp)) {
            Etichetta("Proposta", Colori.ambraInchiostro)
            Riga(m.testo)
            when (m.stato) {
                StatoProposta.IN_ATTESA -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                    Button({ vm.conferma(m) }, colors = ButtonDefaults.buttonColors(containerColor = Colori.ambra, contentColor = Colori.ambraInchiostro)) { Text("Conferma") }
                    OutlinedButton({ vm.rifiuta(m) }) { Text("Annulla") }
                }
                StatoProposta.ESEGUITA -> Tenue("Confermata")
                StatoProposta.RIFIUTATA -> Tenue("Annullata")
                StatoProposta.FALLITA -> Tenue("Non eseguita")
                null -> {}
            }
        }
        Ruolo.RICEVUTA -> Text("✓ ${m.testo}", color = Colori.bio, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 4.dp))
        Ruolo.NOTA -> Text(m.testo, color = Colori.tenue, fontSize = 13.sp, fontStyle = FontStyle.Italic, modifier = Modifier.padding(horizontal = 4.dp))
    }
}
