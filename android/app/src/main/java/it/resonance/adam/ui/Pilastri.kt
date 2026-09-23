package it.resonance.adam.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
        PrimaryTabRow(scheda, containerColor = Colori.fondo, contentColor = colore) {
            listOf("Numeri", "Diario", "Percorsi", "Quaderno").forEachIndexed { i, t -> Tab(scheda == i, { scheda = i }, text = { Text(t) }) }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).imePadding()) {
            when (scheda) {
                0 -> Numeri(vm, p)
                1 -> Diario(vm, p)
                2 -> Percorsi(vm, p)
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
    percorsi.filter { it.pilastro == p }.forEach { per ->
        val n = nodi.filter { it.percorsoId == per.id }
        val fatti = n.count { it.stato == StatoNodo.CONSOLIDATO }
        Scheda(Colori.di(p), Modifier.clickable { vm.percorsoAperto = per.id }) {
            Riga(per.titolo)
            Tenue("${n.size} nodi, $fatti consolidati · ${documenti.count { it.percorsoId == per.id }} documenti")
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
    val per = percorsi.find { it.id == id } ?: return
    var nuovoDoc by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        TextButton({ vm.percorsoAperto = null }) { Text("‹ Percorsi") }
        Text(per.titolo, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = colore)
        if (per.scopo.isNotBlank()) Tenue(per.scopo)
        Scheda(colore) {
            Etichetta("Nodi · tocca per avanzare lo stato", colore)
            nodi.filter { it.percorsoId == per.id }.sortedBy { it.ordine }.forEach { n ->
                Row(Modifier.fillMaxWidth().clickable { vm.cambiaStatoNodo(n) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(n.etichetta, modifier = Modifier.weight(1f), fontSize = 15.sp)
                    Text(n.stato.etichetta, fontSize = 12.sp, color = if (n.stato == StatoNodo.NON_INIZIATO) Colori.tenue else Colori.ambraInchiostro,
                        modifier = Modifier.background(if (n.stato == StatoNodo.NON_INIZIATO) Colori.fondo2 else colore.copy(alpha = 0.18f + 0.18f * n.stato.ordinal), RoundedCornerShape(10.dp)).padding(horizontal = 8.dp, vertical = 3.dp))
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Etichetta("Documenti")
            TextButton({ nuovoDoc = true }) { Text("+ Nuovo") }
        }
        documenti.filter { it.percorsoId == per.id }.forEach { d ->
            Scheda(modifier = Modifier.clickable { vm.documentoAperto = d.id }) {
                Riga(d.titolo)
                Tenue("${d.testo.length} caratteri" + (nodi.find { it.id == d.nodoId }?.let { " · ${it.etichetta}" } ?: ""))
            }
        }
        Spazio(16)
        TextButton({ vm.archiviaPercorso(per) }) { Text("Archivia il percorso", color = Colori.tenue) }
        Spazio(120)
    }
    if (nuovoDoc) DialogoTesto("Titolo del documento", onOk = { vm.nuovoDocumento(per, it) }, onChiudi = { nuovoDoc = false })
}

@Composable
private fun DocumentoUi(vm: Adam, id: Long, colore: androidx.compose.ui.graphics.Color) {
    val documenti by vm.documenti.collectAsState()
    val d = documenti.find { it.id == id } ?: return
    var testo by remember(d.id) { mutableStateOf(d.testo) }
    val versioni by remember(d.id) { vm.versioni("documento", d.id) }.collectAsState(emptyList())
    var storico by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).imePadding()) {
        TextButton({ vm.documentoAperto = null }) { Text("‹ Percorso") }
        Text(d.titolo, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = colore)
        OutlinedTextField(testo, { testo = it }, modifier = Modifier.fillMaxWidth().heightIn(min = 240.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            Button({ vm.salvaDocumento(d, testo) }, enabled = testo != d.testo,
                colors = ButtonDefaults.buttonColors(containerColor = colore)) { Text("Salva") }
            OutlinedButton({ testo = d.testo }, enabled = testo != d.testo) { Text("Annulla") }
        }
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
