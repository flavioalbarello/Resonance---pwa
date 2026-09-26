package it.resonance.adam.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.width
import it.resonance.adam.logica.Nodi
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Documento
import androidx.compose.material3.AlertDialog
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.Voce
import it.resonance.adam.logica.Contesto
import it.resonance.adam.logica.Esiti
import it.resonance.adam.logica.Giorni
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun PilastroUi(vm: Adam, p: Pilastro) {
    val colore = Colori.di(p)
    vm.documentoAperto?.let { return DocumentoUi(vm, it, colore) }
    vm.percorsoAperto?.let { return PercorsoUi(vm, it, colore) }
    var scheda by rememberSaveable(p) { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        Text(p.etichetta.uppercase(), color = colore, fontSize = 24.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp,
            modifier = Modifier.padding(start = 16.dp, top = 12.dp))
        // Adam non ha numeri suoi: ha i percorsi che attraversano i pilastri e il modo in cui lo Shell si regola.
        val schede = if (p == Pilastro.ADAM) listOf("Percorsi", "Lavagna", "Diario", "Quaderno", "Taccuino", "Consegne", "Fondo", "Lettere", "Regolazione")
            else listOf("Numeri", "Diario", "Percorsi", "Quaderno")
        if (p == Pilastro.ADAM) androidx.compose.material3.PrimaryScrollableTabRow(scheda, containerColor = Colori.fondo, contentColor = colore, edgePadding = 8.dp) {
            schede.forEachIndexed { i, t -> Tab(scheda == i, { scheda = i }, text = { Text(t, maxLines = 1, softWrap = false, fontSize = 13.sp) }) }
        } else PrimaryTabRow(scheda, containerColor = Colori.fondo, contentColor = colore) {
            schede.forEachIndexed { i, t -> Tab(scheda == i, { scheda = i }, text = { Text(t, maxLines = 1, softWrap = false, fontSize = 13.sp) }) }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).imePadding()) {
            when (schede.getOrNull(scheda)) {
                "Numeri" -> Numeri(vm, p)
                "Diario" -> Diario(vm, p)
                "Percorsi" -> Percorsi(vm, p)
                "Regolazione" -> RegolazioneUi(vm)
                "Taccuino" -> TaccuinoUi(vm)
                "Consegne" -> ConsegneUi(vm)
                "Lavagna" -> LavagnaUi(vm)
                "Fondo" -> FondoUi(vm)
                "Lettere" -> LettereUi(vm)
                else -> QuadernoUi(vm, p)
            }
            Spazio(120)
        }
    }
}

@Composable
private fun Numeri(vm: Adam, p: Pilastro) {
    val i by vm.istantanea.collectAsState()
    val misure by vm.misure.collectAsState()
    var nuovo by remember { mutableStateOf(false) }
    Scheda(Colori.di(p)) {
        Contesto.righeEsiti(i, p).forEach { Riga(it) }
    }
    OutlinedButton({ nuovo = true }) { Text("+ Un numero") }
    misure.filter { it.tipo.pilastro == p }.take(60).forEach { m ->
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Column(Modifier.weight(1f)) {
                Riga("${m.tipo.etichetta}: ${Esiti.formatta(m.tipo, m.valore)}" + (m.legataAlTempo?.let { if (it) " · tempo" else " · libera" } ?: ""))
                Tenue("${Giorni.leggibile(m.giorno)} · ${if (m.fonte.startsWith("hc")) "sensore" else m.fonte}" + (if (m.nota.isNotBlank()) " · ${m.nota}" else ""))
            }
            if (!m.fonte.startsWith("hc")) TextButton({ vm.eliminaMisura(m.id) }) { Text("✕", color = Colori.tenue) }
        }
    }
    if (nuovo) DialogoMisura(p, { t, v, l -> vm.aggiungiMisura(t, v, legata = l) }) { nuovo = false }
}

@Composable
private fun Diario(vm: Adam, p: Pilastro) {
    val voci by vm.voci.collectAsState()
    var nuova by remember { mutableStateOf(false) }
    var inModifica by remember { mutableStateOf<Voce?>(null) }
    OutlinedButton({ nuova = true }, modifier = Modifier.padding(top = 12.dp)) { Text("+ Scrivi") }
    voci.filter { it.pilastro == p }.forEach { v ->
        Scheda(modifier = Modifier.clickable { inModifica = v }) {
            Tenue(Giorni.leggibile(v.giorno) + if (v.aggiornato != v.creato) " · modificata" else "")
            Riga(v.testo)
        }
    }
    if (nuova) DialogoTesto("Diario ${p.etichetta}", righe = 4, onOk = { vm.scriviVoce(p, it) }, onChiudi = { nuova = false })
    inModifica?.let { v -> DialogoTesto("Modifica (la versione precedente resta)", v.testo, righe = 4, onOk = { vm.modificaVoce(v, it) }, onChiudi = { inModifica = null }) }
}

@Composable
private fun Percorsi(vm: Adam, p: Pilastro) {
    val percorsi by vm.percorsi.collectAsState()
    val nodi by vm.nodi.collectAsState()
    val documenti by vm.documenti.collectAsState()
    var nuovo by remember { mutableStateOf(false) }
    OutlinedButton({ nuovo = true }, modifier = Modifier.padding(top = 12.dp)) { Text("+ Percorso") }
    // Un percorso di Adam compare anche in ogni pilastro che tocca davvero, con le sole parti di quel pilastro contate.
    val propri = percorsi.filter { it.pilastro == p }
    val trasversali = if (p == Pilastro.ADAM) emptyList() else percorsi.filter { per ->
        per.pilastro == Pilastro.ADAM && p in Nodi.pilastriToccati(nodi.filter { it.percorsoId == per.id })
    }
    if (p == Pilastro.ADAM) Tenue("Qui i percorsi che attraversano più pilastri (Resonance stessa, per esempio). Ogni parte di primo livello porta il suo pilastro; i pilastri del percorso si leggono dalle parti, non si dichiarano.")
    (propri + trasversali).forEach { per ->
        val tutti = nodi.filter { it.percorsoId == per.id }
        // Contano i nodi con uno stato loro: un padre è la somma dei figli, non un nodo in più.
        val n = if (per.pilastro == Pilastro.ADAM && p != Pilastro.ADAM) Nodi.perPilastro(tutti)[p].orEmpty() else Nodi.foglie(tutti)
        val fatti = n.count { it.stato == StatoNodo.CONSOLIDATO }
        Scheda(Colori.di(p), Modifier.clickable { vm.percorsoAperto = per.id }) {
            Riga(per.titolo)
            if (per.pilastro == Pilastro.ADAM) {
                val tocca = Nodi.pilastriToccati(tutti)
                Tenue((if (tocca.size >= 2) "↔ " else "") + if (tocca.isEmpty()) "Adam · nessun pilastro ancora sulle parti" else "Adam · " + tocca.joinToString(", ") { it.etichetta })
            }
            Tenue((if (per.pilastro == Pilastro.ADAM && p != Pilastro.ADAM) "in ${p.etichetta}: " else "") +
                "${n.size} nodi, $fatti consolidati · ${documenti.count { it.percorsoId == per.id }} documenti")
        }
    }
    if (nuovo) {
        var titolo by remember { mutableStateOf("") }
        var tappe by remember { mutableStateOf("") }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { nuovo = false },
            title = { Text("Nuovo percorso") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(titolo, { titolo = it }, label = { Text("Nome") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(tappe, { tappe = it }, label = { Text("Nodi, uno per riga") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton({
                    val l = tappe.lines().map { it.trim() }.filter { it.isNotEmpty() }
                    if (titolo.isNotBlank()) { vm.creaPercorso(p, titolo, l); nuovo = false }
                }) { Text("Crea") }
            },
            dismissButton = { TextButton({ nuovo = false }) { Text("Annulla") } },
        )
    }
}

@Composable
private fun PercorsoUi(vm: Adam, id: Long, colore: androidx.compose.ui.graphics.Color) {
    val percorsi by vm.percorsi.collectAsState()
    val nodi by vm.nodi.collectAsState()
    val documenti by vm.documenti.collectAsState()
    val tolti by vm.documentiTolti.collectAsState()
    val per = percorsi.find { it.id == id } ?: return
    var nuovoDoc by remember { mutableStateOf(false) }
    var docDaTogliere by remember { mutableStateOf<Documento?>(null) }
    var vediTolti by remember(id) { mutableStateOf(false) }
    var daTogliere by remember { mutableStateOf<Nodo?>(null) }
    var menuNodo by remember { mutableStateOf<Nodo?>(null) }
    var nuovoNodo by remember { mutableStateOf(false) }
    var aperti by remember(id) { mutableStateOf(setOf<Long>()) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        TextButton({ vm.percorsoAperto = null }) { Text("‹ Percorsi") }
        Text(per.titolo, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = colore)
        if (per.scopo.isNotBlank()) Tenue(per.scopo)
        val tutti = nodi.filter { it.percorsoId == per.id }
        // Un percorso di Adam: una barra per pilastro, perché si veda dove avanza e dove è fermo.
        if (per.pilastro == Pilastro.ADAM) Scheda {
            Etichetta("Per pilastro")
            val gruppi = Nodi.perPilastro(tutti)
            if (gruppi.isEmpty()) Tenue("Nessuna parte ancora.")
            gruppi.forEach { (pil, foglie) ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Text(pil?.etichetta ?: "senza pilastro", fontSize = 13.sp, color = pil?.let { Colori.di(it) } ?: Colori.tenue, modifier = Modifier.width(96.dp))
                    androidx.compose.material3.LinearProgressIndicator(progress = { Nodi.avanzamento(foglie) },
                        modifier = Modifier.weight(1f), color = pil?.let { Colori.di(it) } ?: Colori.tenue, trackColor = Colori.fondo2)
                    Text("  ${foglie.count { it.stato == StatoNodo.CONSOLIDATO }}/${foglie.size}", fontSize = 12.sp, color = Colori.tenue)
                }
            }
        }
        Scheda(colore) {
            Etichetta("Nodi · tocca per avanzare, tieni premuto per spostare o togliere", colore)
            Nodi.radici(tutti).forEach { r ->
                val figli = Nodi.figli(tutti, r.id)
                val etichettaPil = r.pilastro?.takeIf { per.pilastro == Pilastro.ADAM }
                if (figli.isEmpty()) RigaNodo(r, colore, 0, { vm.cambiaStatoNodo(r) }, { menuNodo = r }, etichettaPil)
                else {
                    // Il padre non ha uno stato suo: si apre e si chiude, e mostra ciò che dicono i figli.
                    val aperto = r.id in aperti
                    Column(Modifier.fillMaxWidth().testTag("nodo-${r.etichetta}")
                        .pointerInput(r.id, aperto) { detectTapGestures(onTap = { aperti = if (aperto) aperti - r.id else aperti + r.id }, onLongPress = { menuNodo = r }) }
                        .padding(vertical = 6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text((if (aperto) "▾ " else "▸ ") + r.etichetta, modifier = Modifier.weight(1f), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            etichettaPil?.let { Text(it.etichetta + "  ", fontSize = 11.sp, color = Colori.di(it)) }
                            Text("${figli.count { it.stato == StatoNodo.CONSOLIDATO }}/${figli.size}", fontSize = 13.sp, color = Colori.tenue)
                        }
                        androidx.compose.material3.LinearProgressIndicator(progress = { Nodi.avanzamento(figli) },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), color = colore, trackColor = Colori.fondo2)
                        Tenue(Nodi.sintesi(figli))
                    }
                    if (aperto) figli.forEach { f -> RigaNodo(f, colore, 1, { vm.cambiaStatoNodo(f) }, { menuNodo = f }) }
                }
            }
            TextButton({ nuovoNodo = true }) { Text("+ Nodo") }
        }
        menuNodo?.let { n ->
            val haFigli = Nodi.haFigli(tutti, n.id)
            // Sotto un nodo di primo livello va solo un nodo senza figli: due livelli al massimo.
            val mete = if (haFigli) emptyList() else Nodi.radici(tutti).filter { it.id != n.id && it.id != n.genitoreId }
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { menuNodo = null },
                title = { Text(n.etichetta) },
                text = {
                    Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
                        if (haFigli) Tenue("Raccoglie ${Nodi.sintesi(Nodi.figli(tutti, n.id))}. Se lo togli, tornano al primo livello.")
                        // Solo nei percorsi di Adam, solo al primo livello: i sotto-nodi prendono il pilastro del padre.
                        if (per.pilastro == Pilastro.ADAM && n.genitoreId == null) {
                            Tenue("Pilastro di questa parte:")
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Pilastro.entries.forEach { pil ->
                                    androidx.compose.material3.FilterChip(n.pilastro == pil, { vm.pilastroNodo(n, pil); menuNodo = null },
                                        label = { Text(pil.etichetta, fontSize = 12.sp) })
                                }
                            }
                        }
                        if (n.genitoreId != null) TextButton({ vm.spostaNodo(n, null); menuNodo = null }) { Text("Al primo livello") }
                        if (mete.isNotEmpty()) Tenue("Mettilo sotto:")
                        mete.forEach { m -> TextButton({ vm.spostaNodo(n, m.id); menuNodo = null }) { Text("«${m.etichetta}»") } }
                    }
                },
                confirmButton = { TextButton({ daTogliere = n; menuNodo = null }) { Text("Togli", color = Colori.allarme) } },
                dismissButton = { TextButton({ menuNodo = null }) { Text("Chiudi") } },
            )
        }
        if (nuovoNodo) DialogoTesto("Nuovo nodo (primo livello)", onOk = { vm.aggiungiNodo(per, it) }, onChiudi = { nuovoNodo = false })
        daTogliere?.let { n ->
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { daTogliere = null },
                title = { Text("Togliere «${n.etichetta}»?") },
                text = { Text((if (Nodi.haFigli(nodi, n.id)) "I suoi sotto-nodi tornano al primo livello." else "Era ${n.stato.etichetta}.") +
                    " Nel diario ${per.pilastro.etichetta} resta una riga con nome e stato; i documenti legati restano nel percorso.") },
                confirmButton = { TextButton({ vm.togliNodo(n); daTogliere = null }) { Text("Togli", color = Colori.allarme) } },
                dismissButton = { TextButton({ daTogliere = null }) { Text("Lascia") } },
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Etichetta("Documenti")
            TextButton({ nuovoDoc = true }) { Text("+ Nuovo") }
        }
        // Tocco: apri. Pressione lunga: togli (26/09: documenti vecchi o sbagliati). I tolti restano in fondo, e si rimettono.
        documenti.filter { it.percorsoId == per.id }.forEach { d ->
            Scheda(modifier = Modifier.testTag("documento-${d.titolo}")
                .pointerInput(d.id) { detectTapGestures(onTap = { vm.documentoAperto = d.id }, onLongPress = { docDaTogliere = d }) }) {
                Riga(d.titolo)
                Tenue("${d.testo.length} caratteri" + (nodi.find { it.id == d.nodoId }?.let { " · ${it.etichetta}" } ?: ""))
            }
        }
        Tenue("Tieni premuto un documento per toglierlo.")
        val tolti = tolti.filter { it.percorsoId == per.id }
        if (tolti.isNotEmpty()) {
            TextButton({ vediTolti = !vediTolti }) { Text((if (vediTolti) "▾" else "▸") + " Tolti (${tolti.size})", color = Colori.tenue) }
            if (vediTolti) tolti.forEach { d ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(d.titolo, color = Colori.tenue, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    TextButton({ vm.rimettiDocumento(d) }) { Text("Rimetti") }
                }
            }
        }
        Spazio(16)
        TextButton({ vm.archiviaPercorso(per) }) { Text("Archivia il percorso", color = Colori.tenue) }
        Spazio(120)
    }
    if (nuovoDoc) DialogoTesto("Titolo del documento", onOk = { vm.nuovoDocumento(per, it) }, onChiudi = { nuovoDoc = false })
    docDaTogliere?.let { d -> DialogoTogliDocumento(d, { vm.togliDocumento(d) }) { docDaTogliere = null } }
}

@Composable
private fun DialogoTogliDocumento(d: Documento, togli: () -> Unit, chiudi: () -> Unit) = AlertDialog(
    onDismissRequest = chiudi,
    title = { Text("Togliere «${d.titolo}»?") },
    text = { Text("Non si vedrà più nel percorso e lo Shell non lo leggerà. Resta recuperabile in fondo al percorso, in «Tolti»; nel diario resta una riga.") },
    confirmButton = { TextButton({ togli(); chiudi() }) { Text("Togli", color = Colori.allarme) } },
    dismissButton = { TextButton(chiudi) { Text("Lascia") } },
)

@Composable
private fun DocumentoUi(vm: Adam, id: Long, colore: androidx.compose.ui.graphics.Color) {
    val documenti by vm.documenti.collectAsState()
    val d = documenti.find { it.id == id } ?: return
    var testo by remember(d.id) { mutableStateOf(d.testo) }
    val versioni by remember(d.id) { vm.versioni("documento", d.id) }.collectAsState(emptyList())
    var storico by remember { mutableStateOf(false) }
    var togliere by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).imePadding()) {
        TextButton({ vm.documentoAperto = null }) { Text("‹ Percorso") }
        Text(d.titolo, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = colore)
        OutlinedTextField(testo, { testo = it }, modifier = Modifier.fillMaxWidth().heightIn(min = 240.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            Button({ vm.salvaDocumento(d, testo) }, enabled = testo != d.testo,
                colors = ButtonDefaults.buttonColors(containerColor = colore)) { Text("Salva") }
            OutlinedButton({ testo = d.testo }, enabled = testo != d.testo) { Text("Annulla") }
            TextButton({ togliere = true }) { Text("Togli", color = Colori.tenue) }
        }
        if (togliere) DialogoTogliDocumento(d, { vm.togliDocumento(d) }) { togliere = false }
        if (versioni.isNotEmpty()) {
            TextButton({ storico = !storico }) { Text("${versioni.size} versioni precedenti") }
            if (storico) versioni.forEach { v ->
                Scheda {
                    Tenue("sostituita il ${SimpleDateFormat("d MMM yyyy HH:mm", Locale.ITALIAN).format(Date(v.sostituitoIl))}")
                    Text(v.testo, fontSize = 13.sp)
                    TextButton({ testo = v.testo }) { Text("Riporta nel testo (poi Salva)") }
                }
            }
        }
        Spazio(120)
    }
}

@Composable
private fun QuadernoUi(vm: Adam, p: Pilastro) {
    Spazio(12)
    Tenue("Ciò che lo Shell sa di te su questo pilastro. Lo legge a ogni turno; qui lo rivedi, correggi o svuoti.")
    Spazio(4)
    QuadernoEditor(vm, p)
}

// Un nodo con uno stato suo: il tocco lo fa avanzare, la pressione lunga apre spostare/togliere.
@Composable
private fun RigaNodo(n: Nodo, colore: androidx.compose.ui.graphics.Color, livello: Int, onTap: () -> Unit, onLungo: () -> Unit, pilastro: Pilastro? = null) {
    Row(Modifier.fillMaxWidth().testTag("nodo-${n.etichetta}")
        .pointerInput(n.id, n.stato) { detectTapGestures(onTap = { onTap() }, onLongPress = { onLungo() }) }
        .padding(start = (18 * livello).dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(n.etichetta, modifier = Modifier.weight(1f), fontSize = if (livello > 0) 14.sp else 15.sp)
        pilastro?.let { Text(it.etichetta + "  ", fontSize = 11.sp, color = Colori.di(it)) }
        Text(n.stato.etichetta, fontSize = 12.sp, color = if (n.stato == StatoNodo.NON_INIZIATO) Colori.tenue else Colori.ambraInchiostro,
            modifier = Modifier.background(if (n.stato == StatoNodo.NON_INIZIATO) Colori.fondo2 else colore.copy(alpha = 0.18f + 0.18f * n.stato.ordinal), RoundedCornerShape(10.dp)).padding(horizontal = 8.dp, vertical = 3.dp))
    }
}
