package it.resonance.adam.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.clickable
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.BuildConfig
import it.resonance.adam.Impostazioni
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo

interface Sistema {
    fun chiediSensori()
    fun chiediNotifiche()
    fun chiediCalendario()
    fun allega()
    fun lavoroInBackground()
    fun scatta()
    fun apriFile()
    fun salvaCopia()
}

@Composable
fun Setup(vm: Adam, sistema: Sistema) {
    val imp = vm.impostazioni
    val profilo by vm.profilo.collectAsState()
    var chiave by remember { mutableStateOf("") }
    var modello by remember { mutableStateOf(imp.modello) }
    var tetto by remember { mutableStateOf(imp.tettoMensile.toString()) }
    var battito by remember { mutableStateOf(imp.battitoAttivo) }
    var mattino by remember { mutableStateOf(imp.orarioMattino) }
    var sera by remember { mutableStateOf(imp.orarioSera) }
    var settimana by remember { mutableStateOf(imp.orarioSettimana) }
    var dalModello by remember { mutableStateOf(imp.mattinoDalModello) }
    var leggiAuto by remember { mutableStateOf(imp.leggiRisposteInAuto) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).imePadding()) {
        Spazio(12)
        Text("Setup", fontSize = 24.sp, fontWeight = FontWeight.Bold)

        Scheda {
            Etichetta("Motore")
            Tenue(if (imp.chiave.isBlank()) "Nessuna chiave OpenRouter." else "Chiave presente, cifrata nel Keystore del telefono.")
            OutlinedTextField(chiave, { chiave = it }, label = { Text("Chiave OpenRouter") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
            Button({ imp.chiave = chiave; chiave = ""; vm.avviso = "Chiave salvata" }, enabled = chiave.isNotBlank()) { Text("Salva chiave") }
            Spazio(4)
            Impostazioni.MODELLI.forEach { (id, nome) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(modello == id, { modello = id; imp.modello = id })
                    Text(nome)
                }
            }
            OutlinedTextField(modello, { modello = it; if (it.contains('/')) imp.modello = it }, label = { Text("Oppure uno slug OpenRouter") }, modifier = Modifier.fillMaxWidth())
            Spazio(4)
            var automatica by remember { mutableStateOf(imp.sceltaAutomatica) }
            var leggero by remember { mutableStateOf(imp.modelloLeggero) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(automatica, { automatica = it; imp.sceltaAutomatica = it })
                Text("  Scelta automatica del motore")
            }
            Tenue("Prima di ogni risposta, una microchiamata (meno di un centesimo di centesimo) decide: le cose semplici al modello leggero, il resto a quello scelto sopra. Nel dubbio, quello sopra. Sotto ogni risposta vedi chi ha risposto e quanto è costato.")
            if (automatica) {
                Etichetta("Modello leggero")
                Impostazioni.MODELLI_LEGGERI.forEach { (id, nome) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(leggero == id, { leggero = id; imp.modelloLeggero = id })
                        Text(nome)
                    }
                }
            }
            Spazio(4)
            var vista by remember { mutableStateOf(imp.modelloVista) }
            Etichetta("Per immagini e PDF")
            Tenue(if (imp.modello in Impostazioni.VEDONO) "Il modello scelto sopra vede già da solo: guarda lui gli allegati."
                else "Il modello scelto sopra non vede: per i turni con immagini o PDF si passa a questo.")
            Impostazioni.MODELLI_VISTA.forEach { (id, nome) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(vista == id, { vista = id; imp.modelloVista = id })
                    Text(nome)
                }
            }
            Tenue("Il modello si sceglie con un numero, non con il prezzario: prova lo stesso turno su due modelli e guarda quante proposte vengono rifiutate e quante volte chiede chiarimenti.")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(tetto, { tetto = it; it.replace(',', '.').toDoubleOrNull()?.let { v -> imp.tettoMensile = v } }, label = { Text("Tetto mensile $") }, modifier = Modifier.weight(1f))
                Text("Speso: ${"%.2f".format(vm.speso())} $", color = Colori.tenue)
            }
        }

        Scheda(Colori.ambra) {
            Etichetta("Battito", Colori.ambraInchiostro)
            Riga("L'app ti scrive per prima: mattino, sera, e la domenica lo specchio della settimana.")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(battito, { battito = it; imp.battitoAttivo = it; vm.riprogrammaBattito() })
                Text("  Attivo")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(mattino, { mattino = it }, label = { Text("Mattino") }, modifier = Modifier.weight(1f))
                OutlinedTextField(sera, { sera = it }, label = { Text("Sera") }, modifier = Modifier.weight(1f))
                OutlinedTextField(settimana, { settimana = it }, label = { Text("Domenica") }, modifier = Modifier.weight(1f))
            }
            OutlinedButton({
                imp.orarioMattino = mattino; imp.orarioSera = sera; imp.orarioSettimana = settimana
                vm.riprogrammaBattito(); vm.avviso = "Orari salvati"
            }) { Text("Salva orari") }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(dalModello, { dalModello = it; imp.mattinoDalModello = it })
                Text("  Il messaggio lo scrive il modello (se no, solo i numeri)")
            }
            // Il battito deve poter dire perché non batte: prima non lo diceva (25/09/2026).
            val muto = remember(vm.avviso) { vm.muto() }
            val esatte = remember(vm.avviso) { vm.sveglieEsatte() }
            val prossimi = remember(vm.avviso, battito) { vm.prossimiBattiti() }
            val registro = remember(vm.avviso) { vm.registroBattito() }
            if (muto != null) {
                Riga("Notifiche: NO — $muto. Il battito parte ma non lo vedi.", Colori.allarme)
                OutlinedButton({ sistema.chiediNotifiche() }) { Text("Permetti le notifiche") }
            } else Tenue("Notifiche: sì.")
            Tenue(if (esatte) "Sveglia esatta: sì, il battito suona all'ora." else "Sveglia esatta: no, il battito può arrivare con qualche minuto di ritardo.")
            Tenue("Prossimi: $prossimi")
            Tenue(if (registro.isBlank()) "Ultimi battiti: nessuno ancora registrato." else "Ultimi battiti:\n$registro")
            OutlinedButton({ vm.provaBattito() }) { Text("Prova ora") }
            val libero = remember(vm.avviso) { vm.liberoDallaBatteria() }
            Tenue(if (libero) "Resonance può lavorare in secondo piano: risposte e battito arrivano anche a schermo spento."
                else "Il telefono può fermare Resonance in secondo piano: le risposte a schermo spento e il battito possono non arrivare.")
            if (!libero) {
                OutlinedButton({ sistema.lavoroInBackground() }) { Text("Lascia lavorare in secondo piano") }
                Tenue("Si apre l'elenco della batteria: cerca Resonance e scegli «Non ottimizzare» o «Consenti attività in background».")
            }
        }

        Scheda(Colori.bio) {
            Etichetta("Sensori", Colori.bio)
            Riga("Health Connect: peso, sonno, passi, frequenza a riposo, allenamenti — da qualunque app o dispositivo che ci scriva (bilancia, orologio, anello, telefono).")
            Tenue(if (vm.sensi.disponibile()) "Health Connect è disponibile." else "Health Connect non è installato o non è aggiornato su questo telefono.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button({ sistema.chiediSensori() }, colors = ButtonDefaults.buttonColors(containerColor = Colori.bio)) { Text("Collega") }
                OutlinedButton({ vm.leggiSensi() }) { Text("Leggi ora") }
            }
            if (vm.statoSensi.isNotBlank()) Tenue(vm.statoSensi)
        }

        Scheda(Colori.air) {
            Etichetta("Calendario e posta", Colori.air)
            Riga("Il calendario del telefono, lo stesso che si sincronizza con Google Calendar: lo Shell legge gli impegni veri e ne propone di nuovi, che entrano solo se confermi.")
            Riga("La posta non parte da qui: lo Shell prepara la mail, si apre come bozza nella tua app di posta e la invii tu.")
            val cal = vm.mondo.calendario
            vm.agenda // si rilegge dopo ogni permesso: leggerla qui ridisegna la riga sotto
            Tenue(when {
                cal.puoScrivere() -> "Calendario collegato: lettura e scrittura."
                cal.puoLeggere() -> "Calendario in sola lettura: gli impegni proposti non potranno entrare."
                else -> "Calendario non collegato."
            })
            Button({ sistema.chiediCalendario() }, colors = ButtonDefaults.buttonColors(containerColor = Colori.air)) { Text("Collega il calendario") }
            if (cal.puoScrivere()) {
                // Dove entrano gli eventi nuovi: lo sceglie il Ghost. Prima lo sceglieva un punteggio, e con più account
                // Google vinceva il primo letto (26/09: un evento di Adam nel calendario professionale).
                val calendari by androidx.compose.runtime.produceState(emptyList<it.resonance.adam.mondo.Calendario.Scelto>(), vm.agenda) {
                    value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { runCatching { cal.scrivibili() }.getOrDefault(emptyList()) }
                }
                var scelto by remember { mutableStateOf(vm.impostazioni.calendarioId) }
                Etichetta("Scrivi in", Colori.air)
                if (calendari.none { it.id == scelto }) Riga("Nessun calendario scelto: lo Shell non può mettere eventi finché non ne scegli uno.", Colori.allarme)
                calendari.forEach { c ->
                    Row(Modifier.fillMaxWidth().clickable { scelto = c.id; vm.impostazioni.calendarioId = c.id }.testTag("calendario-${c.id}"),
                        verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.RadioButton(scelto == c.id, { scelto = c.id; vm.impostazioni.calendarioId = c.id })
                        Text(c.nome)
                    }
                }
                Tenue("Spostare o togliere un evento agisce sul calendario dove quell'evento sta già; la proposta lo dice.")
            }
        }

        // La cassetta delle lettere fra lo Shell e l'architetto: un repository GitHub privato e un token solo per le sue issue.
        Scheda {
            Etichetta("Cassetta delle lettere")
            Tenue("Lo Shell scrive all'architetto dell'app senza che tu faccia da passacarte: ogni lettera parte da un tuo tocco. Serve un repository GitHub PRIVATO (non quello dell'app, che è pubblico) e un token «fine-grained» con Issues in lettura e scrittura solo su quel repository. Il token si cifra e non va nelle copie.")
            var repo by remember { mutableStateOf(vm.cassetta()) }
            var token by remember { mutableStateOf("") }
            OutlinedTextField(repo, { repo = it }, label = { Text("proprietario/nome") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(token, { token = it }, label = { Text(if (vm.cassettaPronta()) "Token (salvato; scrivi per sostituirlo)" else "Token") },
                visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedButton({ vm.salvaCassetta(repo, token); token = "" }) { Text("Salva") }
        }

        Scheda {
            Etichetta("Voce")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(leggiAuto, { leggiAuto = it; imp.leggiRisposteInAuto = it })
                Text("  In modalità auto leggi le risposte ad alta voce")
            }
            // Il riconoscimento chiude alla prima pausa; il messaggio lo chiude l'app, dopo questo silenzio.
            Tenue("Modalità auto: il messaggio parte dopo questi secondi di silenzio, o subito se finisci con «invia». «Annulla messaggio» lo cancella.")
            var pausa by remember { mutableStateOf(imp.pausaInvio) }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(2, 3, 4, 6, 8).forEach { sec ->
                    androidx.compose.material3.FilterChip(pausa == sec, { pausa = sec; imp.pausaInvio = sec }, label = { Text("$sec s") })
                }
            }
        }

        ProfiloUi(vm, profilo ?: Profilo())
        QuaderniUi(vm)

        Scheda {
            Etichetta("Dati")
            Riga("Dalla PWA: in Setup della PWA scarica il backup completo, poi aprilo qui. Si può rifare: ciò che c'è già non si duplica.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton({ sistema.apriFile() }) { Text("Apri un file") }
                OutlinedButton({ sistema.salvaCopia() }) { Text("Salva una copia") }
            }
            Tenue("Aprire una copia salvata da questa app la ripristina e SOSTITUISCE i dati attuali. Aprire un backup della PWA invece aggiunge.")
        }
        Tenue("Resonance ${BuildConfig.VERSION_NAME}")
        Spazio(120)
    }
}

@Composable
private fun ProfiloUi(vm: Adam, p: Profilo) {
    var nome by remember(p) { mutableStateOf(p.nome) }
    var stile by remember(p) { mutableStateOf(p.stile) }
    var motivazione by remember(p) { mutableStateOf(p.motivazione) }
    var vincoli by remember(p) { mutableStateOf(p.vincoli) }
    var protetti by remember(p) { mutableStateOf(p.nomiProtetti) }
    Scheda(Colori.air) {
        Etichetta("Il Ghost", Colori.air)
        OutlinedTextField(nome, { nome = it }, label = { Text("Nome") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(stile, { stile = it }, label = { Text("Come vuoi che ti parli") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(motivazione, { motivazione = it }, label = { Text("Chi stai diventando") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(vincoli, { vincoli = it }, label = { Text("Vincoli, uno per riga: [BIO] …") }, minLines = 3, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(protetti, { protetti = it }, label = { Text("Nomi che non escono, separati da virgola") }, modifier = Modifier.fillMaxWidth())
        Tenue("Un nome che ti identifica (un marchio, uno studio) non entra in una mail preparata dallo Shell, se non l'hai scritto tu in quel messaggio. La professione sì.")
        Button({ vm.salvaProfilo(p.copy(nome = nome, stile = stile, motivazione = motivazione, vincoli = vincoli, nomiProtetti = protetti)) },
            colors = ButtonDefaults.buttonColors(containerColor = Colori.air)) { Text("Salva profilo") }
    }
}

// Tutti i quaderni in un posto: dopo l'import dalla PWA vanno riletti, possono portarsi dietro errori.
@Composable
private fun QuaderniUi(vm: Adam) {
    var scelto by remember { mutableStateOf(Pilastro.ADAM) }
    Scheda(Colori.ambra) {
        Etichetta("Quaderni", Colori.ambraInchiostro)
        Tenue("La memoria dello Shell: la legge a ogni turno. Adam vale per tutti i pilastri. Rileggili: ciò che viene dalla PWA può contenere errori.")
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(Pilastro.ADAM, Pilastro.BIO, Pilastro.AIR, Pilastro.VIDYA).forEach { p ->
                androidx.compose.material3.FilterChip(scelto == p, { scelto = p }, label = { Text(p.etichetta) })
            }
        }
        QuadernoEditor(vm, scelto)
    }
}
