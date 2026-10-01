package it.resonance.adam.ui

import it.resonance.adam.logica.Azioni
import it.resonance.adam.logica.Balthasar
import it.resonance.adam.logica.Consulente

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.InputChip
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import it.resonance.adam.cervello.Instradatore
import it.resonance.adam.logica.Allegati
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
fun ShellUi(vm: Adam, sistema: Sistema) {
    val messaggi by vm.chat.collectAsState()
    // Si apre già in fondo, senza scorrere tutta la storia; si scorre animato solo per un messaggio nuovo vicino.
    // La chiave è l'ultimo messaggio, non il numero: caricare i precedenti non deve riportare in fondo.
    val lista = rememberLazyListState(initialFirstVisibleItemIndex = (messaggi.size).coerceAtLeast(0))
    LaunchedEffect(messaggi.lastOrNull()?.id) {
        if (messaggi.isEmpty()) return@LaunchedEffect
        val fondo = messaggi.size
        val vicino = fondo - (lista.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) <= 3
        if (vicino) lista.animateScrollToItem(fondo) else lista.scrollToItem(fondo)
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(
            state = lista,
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (messaggi.isEmpty()) item {
                Scheda {
                    Etichetta(it.resonance.adam.logica.Nomi.shell(vm.profilo.collectAsState().value))
                    Riga("Parlagli come parleresti a te stesso. Quando dici un numero o chiedi di salvare qualcosa, ti propone l'azione e la esegue solo quando confermi.")
                    Tenue("Il microfono è nell'ancora a destra: 🎤 detta nella casella, Auto è a mani libere e conferma a voce con «sì».")
                    Tenue("＋ allega foto, immagini, PDF e documenti: lo Shell li guarda e ne legge il testo. Anche da altre app: Condividi → Resonance.")
                }
            }
            if (messaggi.size >= vm.finestra) item {
                TextButton({ vm.mostraPrecedenti() }, Modifier.fillMaxWidth().testTag("precedenti")) { Text("Mostra i messaggi precedenti", color = Colori.tenue) }
            }
            items(messaggi, key = { it.id }) { m -> Messaggio(vm, m) }
            item { Spazio(8) }
        }
        if (vm.pensa) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Colori.ambra)
        if (vm.parziale.isNotBlank()) Text("${vm.parziale}…", color = Colori.tenue, fontStyle = FontStyle.Italic, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        vm.riunione?.let { r ->
            Row(Modifier.fillMaxWidth().background(Colori.ambra.copy(alpha = 0.15f)).padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (vm.chiudendo) "Chiusura di «$r»: lo Shell scrive il verbale…" else "Riunione in corso: «$r» · va nel verbale, l'architetto legge. Solo progettazione.",
                    color = Colori.ambraInchiostro, fontSize = 12.sp, modifier = Modifier.weight(1f))
                TextButton({ vm.ritiraRiunione() }, enabled = !vm.chiudendo, modifier = Modifier.testTag("ritira-ora")) { Text("Ritira ora", fontSize = 12.sp) }
            }
            if (!vm.chiudendo) Tavolo(vm)
        }
        if (vm.chiudendo) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Colori.ambra)
        if (vm.ascolta == Ascolta.AUTO) {
            if (vm.raccolto.isNotBlank()) Text("«${vm.raccolto}»", color = Colori.inchiostro, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))
            Text("Modalità auto: parla anche con pause. Parte dopo ${vm.pausaInvio()} secondi di silenzio, o subito se dici «invia»; «annulla messaggio» lo cancella. Tocca l'ancora rossa per fermare.",
                color = Colori.allarme, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp))
        }
        if (vm.rispondiArchitetto) InputChip(true, { vm.rispondiArchitetto = false }, label = { Text("↩ All'architetto · lo Shell non risponde, a meno che lo nomini") },
            trailingIcon = { Text("✕") }, modifier = Modifier.padding(horizontal = 12.dp).testTag("rispondi-architetto"))
        vm.forza?.let { f ->
            InputChip(true, { vm.forza = null }, label = { Text("🌡 ${f.etichetta} · solo il prossimo messaggio") }, trailingIcon = { Text("✕") },
                modifier = Modifier.padding(horizontal = 12.dp).testTag("forza"))
        }
        if (vm.inAllegato.isNotEmpty() || vm.preparo > 0) Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            vm.inAllegato.forEach { a ->
                InputChip(true, { vm.togliAllegato(a) }, label = { Text(a.etichetta(), maxLines = 1) },
                    trailingIcon = { Text("✕") }, modifier = Modifier.testTag("allegato"))
            }
            if (vm.preparo > 0) Tenue("Preparo l'allegato…")
        }
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, bottom = 8.dp, top = 4.dp), verticalAlignment = Alignment.Bottom) {
            var menu by remember { mutableStateOf(false) }
            Box {
                TextButton({ menu = true }, modifier = Modifier.testTag("allega")) { Text("＋", fontSize = 22.sp, color = Colori.ambraInchiostro) }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem({ Text("📷 Scatta una foto") }, { menu = false; sistema.scatta() })
                    DropdownMenuItem({ Text("🖼 Immagine o documento") }, { menu = false; sistema.allega() })
                    // La temperatura la decide il compito; qui la si forza per il prossimo messaggio soltanto.
                    it.resonance.adam.cervello.Forzatura.entries.forEach { f ->
                        DropdownMenuItem({ Text("🌡 ${f.etichetta.replaceFirstChar { it.uppercase() }} (solo il prossimo)") }, { menu = false; vm.forza = f })
                    }
                }
            }
            OutlinedTextField(vm.input, { vm.input = it }, placeholder = { Text("Scrivi allo Shell…") }, modifier = Modifier.weight(1f), maxLines = 6)
            Button({ vm.invia() }, enabled = !vm.pensa && vm.preparo == 0 && (vm.input.isNotBlank() || vm.inAllegato.isNotEmpty()), modifier = Modifier.padding(start = 8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Colori.ambra, contentColor = Colori.ambraInchiostro)) { Text("Invia") }
        }
    }
}

@Composable
private fun Messaggio(vm: Adam, m: Messaggio) {
    when (m.ruolo) {
        Ruolo.GHOST -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Column(Modifier
                .widthIn(max = 300.dp)
                .background(Colori.ambra.copy(alpha = 0.25f), RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp))
                .padding(12.dp)) {
                val allegati = remember(m.allegati) { Allegati.decodifica(m.allegati) }
                allegati.forEach { a ->
                    a.immagini.firstOrNull()?.let { Miniatura(it) }
                    Text(a.etichetta(), color = Colori.ambraInchiostro, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp))
                }
                Text(m.testo, color = Colori.ambraInchiostro, fontSize = 15.sp)
            }
        }
        Ruolo.SHELL -> Column {
            SelectionContainer {
                Text(Formato.annota(m.testo), color = Colori.inchiostro, fontSize = 15.sp, lineHeight = 21.sp, modifier = Modifier
                    .widthIn(max = 330.dp)
                    .background(Colori.superficie, RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp))
                    .border(1.dp, Colori.linea, RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp))
                    .padding(12.dp))
            }
            // Chi ha risposto e quanto è costato (per scegliere il modello con un numero), e la lettura ad alta voce.
            Row(verticalAlignment = Alignment.CenterVertically) {
                m.modello?.let { mod ->
                    Text(listOfNotNull(Instradatore.etichetta(mod), m.motore, it.resonance.adam.cervello.Temperatura.etichetta(m.temperatura, m.forzata),
                        m.costo?.let { "%.2f ¢".format(it * 100) }).joinToString(" · "),
                        color = Colori.tenue, fontSize = 11.sp, modifier = Modifier.padding(start = 8.dp))
                }
                TextButton({ vm.leggi(m) }, modifier = Modifier.testTag("leggi-${m.id}")) {
                    Text(if (vm.inLettura == m.id) "⏹ Ferma" else "🔊 Ascolta", fontSize = 12.sp, color = Colori.ambraInchiostro)
                }
            }
        }
        Ruolo.PROPOSTA -> Column(Modifier
            .fillMaxWidth()
            .background(Colori.fondo2, RoundedCornerShape(14.dp))
            .border(1.dp, Colori.ambra.copy(alpha = 0.6f), RoundedCornerShape(14.dp))
            .padding(12.dp)) {
            Etichetta("Proposta", Colori.ambraInchiostro)
            Riga(m.testo)
            // La descrizione accorcia: prima di confermare si deve poter leggere tutto ciò che entra e che esce.
            val dettaglio = remember(m.proposta) { m.proposta?.let { runCatching { Azioni.decodifica(it).dettaglio() }.getOrNull() } }
            if (dettaglio != null) {
                var aperto by remember(m.id) { mutableStateOf(false) }
                TextButton({ aperto = !aperto }, modifier = Modifier.testTag("vedi-tutto-${m.id}")) { Text(if (aperto) "Chiudi" else "Vedi tutto") }
                if (aperto) Text(dettaglio, fontSize = 14.sp, lineHeight = 19.sp, color = Colori.inchiostro,
                    modifier = Modifier.fillMaxWidth().background(Colori.fondo, RoundedCornerShape(8.dp)).padding(10.dp))
            }
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
        // L'architetto (Claude Code): dalla riunione o dalle lettere. Si distingue dallo Shell, e si ascolta come lui.
        Ruolo.ARCHITETTO -> Column {
            Column(Modifier
                .widthIn(max = 330.dp)
                .background(Colori.fondo2, RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp))
                .border(1.dp, Colori.ambra.copy(alpha = 0.6f), RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp))
                .padding(12.dp)) {
                Etichetta("Architetto", Colori.ambraInchiostro)
                SelectionContainer {
                    Text(Formato.annota(it.resonance.adam.cervello.Tavolo.leggibile(m.testo)), color = Colori.inchiostro, fontSize = 15.sp, lineHeight = 21.sp)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton({ vm.leggi(m) }, modifier = Modifier.testTag("leggi-${m.id}")) {
                    Text(if (vm.inLettura == m.id) "⏹ Ferma" else "🔊 Ascolta", fontSize = 12.sp, color = Colori.ambraInchiostro)
                }
                // In riunione: il prossimo messaggio va all'architetto, e lo Shell non viene chiamato (a meno che lo nomini).
                if (vm.riunione != null) TextButton({ vm.rispondiArchitetto = true }, modifier = Modifier.testTag("rispondi-${m.id}")) {
                    Text("↩ Rispondi", fontSize = 12.sp, color = Colori.ambraInchiostro)
                }
            }
        }
        Ruolo.NOTA -> Text(m.testo, color = Colori.tenue, fontSize = 13.sp, fontStyle = FontStyle.Italic, modifier = Modifier.padding(horizontal = 4.dp))
        // Le due voci nuove della riunione: ognuna col suo nome, perché non si confondano con lo Shell.
        Ruolo.CONSULENTE -> Voce(vm, m, "Consulente esterno · ricerca web", Colori.linea)
        // La ricerca dello Shell e le letture di Segui: fatte dal programma, con le fonti del motore (logica/Ricerca.kt).
        Ruolo.RICERCA -> Voce(vm, m, "Ricerca web · fonti dal motore", Colori.linea)
        Ruolo.BALTHASAR -> Voce(vm, m, "Balthasar · ${m.motore ?: "perturbazione"}", Colori.allarme.copy(alpha = 0.5f))
    }
}

@Composable
private fun Voce(vm: Adam, m: Messaggio, nome: String, bordo: androidx.compose.ui.graphics.Color) = Column {
    Column(Modifier
        .widthIn(max = 330.dp)
        .background(Colori.fondo2, RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp))
        .border(1.dp, bordo, RoundedCornerShape(18.dp, 18.dp, 18.dp, 4.dp))
        .padding(12.dp)) {
        Etichetta(nome, Colori.ambraInchiostro)
        SelectionContainer { Text(Formato.annota(m.testo), color = Colori.inchiostro, fontSize = 15.sp, lineHeight = 21.sp) }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        m.modello?.let { mod ->
            Text(listOfNotNull(Instradatore.etichetta(mod), it.resonance.adam.cervello.Temperatura.etichetta(m.temperatura, false),
                m.costo?.let { c -> "%.2f ¢".format(c * 100) }).joinToString(" · "), color = Colori.tenue, fontSize = 11.sp, modifier = Modifier.padding(start = 8.dp))
        }
        TextButton({ vm.leggi(m) }, modifier = Modifier.testTag("leggi-${m.id}")) {
            Text(if (vm.inLettura == m.id) "⏹ Ferma" else "🔊 Ascolta", fontSize = 12.sp, color = Colori.ambraInchiostro)
        }
    }
}

// Sotto la fascia della riunione: il consulente esterno (convoca, cartella, manda, congeda) e Perturba (Balthasar).
// Chiuso sta in una riga: la chat resta la parte grande dello schermo. Il margine a destra lascia posto all'ancora.
@Composable
private fun Tavolo(vm: Adam) {
    var aperto by remember { mutableStateOf(false) }
    var perturba by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().background(Colori.ambra.copy(alpha = 0.08f)).padding(start = 8.dp, end = 72.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (vm.consulentePresente) {
                val (invii, tetto) = vm.inviiConsulente
                TextButton({ aperto = !aperto }, modifier = Modifier.testTag("cartella")) {
                    Text((if (aperto) "▾" else "▸") + " Consulente · ${vm.cartella.size} in cartella · $invii/$tetto", fontSize = 12.sp)
                }
            } else TextButton({ vm.convocaConsulente(); aperto = true }, modifier = Modifier.testTag("convoca")) { Text("Convoca consulente", fontSize = 12.sp) }
            TextButton({ perturba = !perturba }, enabled = !vm.perturbando, modifier = Modifier.testTag("perturba")) {
                Text(if (vm.perturbando) "Balthasar scrive…" else "Perturba", fontSize = 12.sp)
            }
        }
        if (vm.consultando || vm.perturbando) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Colori.ambra)
        if (vm.consulentePresente && aperto) {
            val (invii, tetto) = vm.inviiConsulente
            Tenue("Vede solo le domande, non Adam. Partono tutte insieme con Manda.")
            vm.cartella.forEachIndexed { i, d ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${i + 1}. [${d.autore}] ${d.testo}", fontSize = 13.sp, color = Colori.inchiostro, modifier = Modifier.weight(1f))
                    TextButton({ vm.togliDomanda(i) }, enabled = !vm.consultando) { Text("✕", fontSize = 12.sp) }
                }
            }
            var domanda by remember { mutableStateOf("") }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(domanda, { domanda = it }, placeholder = { Text("Domanda al consulente", fontSize = 13.sp) },
                    modifier = Modifier.weight(1f).testTag("domanda-consulente"), maxLines = 3)
                TextButton({ vm.domandaAlConsulente(domanda); domanda = "" }, enabled = domanda.isNotBlank()) { Text("＋") }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (invii >= tetto) TextButton({ vm.alzaTettoConsulente() }) { Text("Tetto raggiunto: alza di ${Consulente.ALZA_DI}", fontSize = 12.sp) }
                else Button({ vm.mandaAlConsulente() }, enabled = vm.cartella.isNotEmpty() && !vm.consultando, modifier = Modifier.testTag("manda-consulente"),
                    colors = ButtonDefaults.buttonColors(containerColor = Colori.ambra, contentColor = Colori.ambraInchiostro)) {
                    Text(if (vm.consultando) "Il consulente cerca…" else "Manda (${vm.cartella.size})", fontSize = 13.sp)
                }
                TextButton({ vm.congedaConsulente(); aperto = false }, enabled = !vm.consultando, modifier = Modifier.testTag("congeda")) { Text("Congeda", fontSize = 12.sp) }
            }
        }
        // Balthasar: la domanda sul tavolo (si parte dall'ultimo messaggio del Ghost) e la dose.
        if (perturba) {
            var domanda by remember { mutableStateOf(vm.domandaSulTavolo()) }
            var intensita by remember { mutableStateOf(Balthasar.Intensita.MEDIA) }
            Tenue("Balthasar: lo Shell senza strumenti, a temperatura alta. Devia sul come, non sul di cosa.")
            OutlinedTextField(domanda, { domanda = it }, label = { Text("La domanda sul tavolo") }, maxLines = 4, modifier = Modifier.fillMaxWidth().testTag("domanda-balthasar"))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Balthasar.Intensita.entries.forEach { i ->
                    androidx.compose.material3.FilterChip(intensita == i, { intensita = i }, label = { Text(i.etichetta, fontSize = 12.sp) }, modifier = Modifier.testTag("intensita-${i.name}"))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button({ vm.perturba(domanda, intensita); perturba = false }, enabled = domanda.isNotBlank() && !vm.perturbando, modifier = Modifier.testTag("perturba-conferma"),
                    colors = ButtonDefaults.buttonColors(containerColor = Colori.ambra, contentColor = Colori.ambraInchiostro)) { Text("Perturba (${intensita.etichetta})", fontSize = 13.sp) }
                TextButton({ perturba = false }) { Text("Annulla", fontSize = 12.sp) }
            }
        }
    }
}

// Una miniatura letta dal file in un thread a parte, ridotta: una foto intera in memoria per ogni messaggio è troppo.
@Composable
private fun Miniatura(percorso: String) {
    val bmp by produceState<ImageBitmap?>(null, percorso) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(percorso, o)
                val campione = generateSequence(1) { it * 2 }.first { maxOf(o.outWidth, o.outHeight) / it <= 480 }
                BitmapFactory.decodeFile(percorso, BitmapFactory.Options().apply { inSampleSize = campione })?.asImageBitmap()
            }.getOrNull()
        }
    }
    bmp?.let { Image(it, null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp).padding(bottom = 4.dp)) }
        ?: Tenue("(immagine non più sul telefono)")
}
