package it.resonance.adam.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.logica.Nomi
import it.resonance.adam.logica.Significati
import it.resonance.adam.logica.Tour

// Il tour del primo avvio (logica/Tour.kt): sei passi corti, ognuno saltabile; si rivede da Setup.
@Composable
fun TourUi(vm: Adam, sistema: Sistema) {
    val profilo by vm.profilo.collectAsState()
    val passo = vm.passoTour
    val avanti = { Tour.dopo(passo)?.let { vm.passoTour = it } ?: vm.fineTour("") }
    // Il tasto indietro del telefono torna al passo prima, non esce dall'app.
    androidx.activity.compose.BackHandler(enabled = Tour.prima(passo) != null) { Tour.prima(passo)?.let { vm.passoTour = it } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).imePadding().testTag("tour")) {
        Spazio(16)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${passo.ordinal + 1} di ${Tour.Passo.entries.size}", color = Colori.tenue, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Tour.prima(passo)?.let { p -> TextButton({ vm.passoTour = p }) { Text("Indietro", color = Colori.tenue) } }
            TextButton({ vm.chiudiTour() }, modifier = Modifier.testTag("salta-tour")) { Text("Salta il tour", color = Colori.tenue) }
        }
        Spazio(12)
        when (passo) {
            Tour.Passo.NOME -> {
                var nome by rememberSaveable { mutableStateOf(profilo?.nome.orEmpty()) }
                Titolo("Benvenuto in Resonance")
                Riga("Legge da sola alcuni dati del telefono, ti scrive la mattina, la sera e la domenica, e ha uno Shell con cui parlare.")
                Spazio(12)
                OutlinedTextField(nome, { nome = it }, label = { Text("Come ti chiami?") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("tour-nome"))
                Spazio(12)
                Button({ if (nome.isNotBlank()) vm.salvaNomi(tuo = nome); avanti() }) { Text("Avanti") }
            }
            Tour.Passo.CHIAVE -> {
                var chiave by rememberSaveable { mutableStateOf("") }
                val uri = LocalUriHandler.current
                Titolo("Il motore dello Shell")
                Riga("Lo Shell ragiona con un modello di intelligenza artificiale, attraverso OpenRouter: paghi solo quello che usi, con un credito prepagato.")
                Tenue("Le istruzioni che hai ricevuto con l'app spiegano come si crea la chiave. Se te l'ha preparata qualcuno, incollala e basta.")
                TextButton({ runCatching { uri.openUri("https://openrouter.ai/keys") } }) { Text("Apri openrouter.ai/keys") }
                if (vm.impostazioni.chiave.isNotBlank()) Riga("Chiave già presente.", Colori.ambraInchiostro)
                OutlinedTextField(chiave, { chiave = it.trim() }, label = { Text("Chiave OpenRouter (sk-or-…)") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth().testTag("tour-chiave"))
                Spazio(12)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button({ if (chiave.isNotBlank()) vm.impostazioni.chiave = chiave; avanti() }) { Text(if (chiave.isNotBlank()) "Salva e avanti" else "Avanti") }
                    if (chiave.isBlank() && vm.impostazioni.chiave.isBlank()) TextButton({ avanti() }) { Text("Più tardi", color = Colori.tenue) }
                }
            }
            Tour.Passo.PERMESSI -> {
                val libero = remember(vm.avviso) { vm.liberoDallaBatteria() }
                Titolo("Che cosa può fare da sola")
                Riga("Tre permessi, ognuno si può saltare. Senza, l'app funziona lo stesso, ma fa meno da sola.")
                Spazio(8)
                Permesso("Notifiche", "Per scriverti la mattina, la sera e la domenica, e per risponderle senza aprire l'app.") { sistema.chiediNotifiche() }
                Permesso("Sensori (Health Connect)", "Sonno, passi, peso, allenamenti: li legge da sola da orologio, bilancia o telefono.") { sistema.chiediSensori() }
                if (!libero) Permesso("Lavoro in secondo piano", "Cerca Resonance nell'elenco e scegli «Non ottimizzare»: senza, i messaggi arrivano in ritardo.") { sistema.lavoroInBackground() }
                else Tenue("Lavoro in secondo piano: già permesso.")
                Spazio(12)
                Button({ avanti() }) { Text("Avanti") }
            }
            Tour.Passo.SHELL -> {
                var nome by rememberSaveable { mutableStateOf(profilo?.nomeShell.orEmpty()) }
                val mostrato = nome.trim().takeIf { Nomi.valido(it) } ?: Nomi.SHELL
                Titolo("Il tuo Shell")
                // Che cos'è, detto una volta: il nome crea legame, e il legame vuole la misura giusta di fiducia.
                Scheda(Colori.ambra) { Riga(Tour.cheCosE(mostrato)) }
                Spazio(8)
                Riga("Puoi dargli il nome che preferisci, o lasciargli «Shell».")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton({ vm.proponiNomi() }, enabled = !vm.proponendo && vm.impostazioni.chiave.isNotBlank(),
                        modifier = Modifier.testTag("proponi-nomi")) { Text("Fagli proporre tre nomi") }
                    if (vm.impostazioni.chiave.isBlank()) Tenue("serve la chiave")
                }
                if (vm.proponendo) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Colori.ambra)
                if (vm.nomiProposti.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    vm.nomiProposti.forEach { n -> FilterChip(nome == n, { nome = n }, label = { Text(n) }) }
                }
                OutlinedTextField(nome, { if (it.length <= Nomi.NOME_MAX && '\n' !in it) nome = it }, label = { Text("Il suo nome") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("tour-nome-shell"))
                Spazio(12)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button({ vm.salvaNomi(shell = nome); avanti() }) { Text(if (Nomi.valido(nome)) "Si chiama $mostrato" else "Avanti") }
                    if (Nomi.valido(nome)) TextButton({ nome = ""; vm.salvaNomi(shell = ""); avanti() }) { Text("Tieni «Shell»", color = Colori.tenue) }
                }
            }
            Tour.Passo.NOMI -> {
                val shell = Nomi.shellNellaFrase(profilo)
                Titolo("Quattro nomi")
                Riga("L'app è divisa in quattro parti. I nomi non si traducono: ognuno vuol dire più di una parola sola.")
                Spazio(8)
                Pilastro.entries.forEach { p ->
                    Text(p.etichetta.uppercase(), color = Colori.di(p), fontSize = 18.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                    Text(Significati.riga(p, shell), color = Colori.inchiostro, fontSize = 14.sp, fontStyle = FontStyle.Italic)
                    Spazio(10)
                }
                Tenue("Se vuoi sapere di più su un nome, chiedilo ${if (Nomi.haNome(profilo)) "a " + Nomi.shell(profilo) else "allo Shell"}.")
                Spazio(12)
                Button({ avanti() }) { Text("Avanti") }
            }
            Tour.Passo.DOMANDA -> {
                var risposta by rememberSaveable { mutableStateOf("") }
                val haChiave = vm.impostazioni.chiave.isNotBlank()
                Titolo("Una domanda sola")
                Riga(Tour.DOMANDA)
                Tenue(if (haChiave) "La risposta va in chat, e ${Nomi.shellNellaFrase(profilo)} ti risponde da lì." else "Quando ci sarà la chiave, potrai rispondere in chat.")
                OutlinedTextField(risposta, { risposta = it }, minLines = 3, enabled = haChiave, modifier = Modifier.fillMaxWidth().testTag("tour-risposta"))
                Spazio(12)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button({ vm.fineTour(risposta) }, modifier = Modifier.testTag("fine-tour")) { Text(if (risposta.isNotBlank()) "Manda e comincia" else "Comincia") }
                }
            }
        }
        Spazio(80)
    }
}

@Composable
private fun Titolo(t: String) {
    Text(t, fontSize = 24.sp, fontWeight = FontWeight.Bold)
    Spazio(8)
}

@Composable
private fun Permesso(nome: String, perche: String, chiedi: () -> Unit) {
    Scheda {
        Riga(nome)
        Tenue(perche)
        OutlinedButton(chiedi) { Text("Permetti") }
    }
    Spazio(6)
}
