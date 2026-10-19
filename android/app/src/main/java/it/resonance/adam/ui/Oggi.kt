package it.resonance.adam.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.TipoMisura
import it.resonance.adam.logica.Agenda
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Contesto
import it.resonance.adam.logica.Esiti
import it.resonance.adam.logica.Esperimenti
import it.resonance.adam.logica.Fronti
import it.resonance.adam.logica.Pratica
import java.time.format.DateTimeFormatter
import java.util.Locale

private val GIORNO = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN)
private val SUBITO = listOf(10, 20, 30, 60)

// Oggi (V3, 16/10/2026): il posto solo da aprire. Prima ciò che si può FARE adesso (una sessione a un tocco, o quella in
// corso), poi ciò che aspetta una decisione del Ghost (le proposte dello Shell), poi i fronti che si sono mossi, i rituali
// ancora da fare, e solo i numeri che sono cambiati. Tutto il resto è nel menu (Numeri e rituali, i pilastri).
// La regola: ogni riga qui restituisce qualcosa, o non c'è.
@Composable
fun OggiUi(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    var numero by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        Spazio(12)
        Text(i.oggi.format(GIORNO).replaceFirstChar { it.uppercase() }, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Colori.inchiostro)
        // In una riga, ciò che aspetta il Ghost: il colpo d'occhio prima di scorrere.
        val inAttesa by vm.inAttesa.collectAsState()
        val daFare = Contesto.statoRituali(i).count { !it.tenuta.oggi && it.rituale.criterio == null }
        Tenue(listOfNotNull(inAttesa.size.takeIf { it > 0 }?.let { "$it da decidere" }, daFare.takeIf { it > 0 && i.via == null }?.let { "$it " + if (it == 1) "rituale da fare" else "rituali da fare" })
            .joinToString(" · ").ifEmpty { "Niente che aspetti te." })
        i.via?.let { da ->
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Sei via dal ${da.format(GIORNO)}: battito zitto, rituali in pausa.", color = Colori.ambraInchiostro, fontSize = 13.sp, modifier = Modifier.weight(1f))
                Button({ vm.torna() }, modifier = Modifier.testTag("torna")) { Text("Sono tornato") }
            }
        }
        RitrattoBreve(vm)
        Adesso(vm)
        Scoperta(vm)
        DaDecidere(vm)
        FrontiMossi(vm)
        RitualiDaFare(vm)
        SeguiUi(vm)
        Numeri(vm, onNumero = { numero = true })
        AgendaBreve(vm)
        EsperimentiBreve(vm)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
            if (i.via == null) TextButton({ vm.vaVia() }, modifier = Modifier.testTag("via")) { Text("Sono via", color = Colori.tenue) }
            TextButton({ vm.vai(Schermata.SPECCHIO) }) { Text("Tutti i numeri e i rituali ›", color = Colori.tenue) }
        }
        Spazio(120)
    }
    if (numero) DialogoMisura(null, { t, v, l -> vm.aggiungiMisura(t, v, legata = l) }) { numero = false }
}

/** La sessione in corso, o quella proposta: il fronte e il pezzo più urgenti, e il tempo a un tocco. */
@Composable
private fun Adesso(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    val sessione by vm.sessione.collectAsState()
    val esiti by vm.esitiSessione.collectAsState()
    val s = sessione
    if (s != null) {
        val per = i.percorsi.find { it.id == s.percorsoId }
        SchedaForte(Colori.ambra, Modifier.testTag("adesso")) {
            Etichetta("Stai studiando · ${per?.titolo ?: ""}", Colori.ambraInchiostro)
            InCorso(vm, Pratica.decodifica(s.piano), esiti.size, per?.misura ?: it.resonance.adam.dati.MisuraFronte.VELOCITA)
        }
        return
    }
    val proposta = Fronti.prossimo(i.percorsi, i.nodi, i.oggi) ?: return
    val per = proposta.percorso
    SchedaForte(Colori.di(per.pilastro), Modifier.testTag("adesso")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Etichetta("Adesso", Colori.di(per.pilastro))
            Text("  ${per.titolo}", fontSize = 13.sp, color = Colori.tenue, modifier = Modifier.weight(1f).clickable { vm.apriFronte(per.id) })
        }
        Text(proposta.pezzo.etichetta, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
        Tenue(Pratica.fase(proposta.pezzo).etichetta + (proposta.pezzo.velocita?.takeIf { _ -> per.misura == it.resonance.adam.dati.MisuraFronte.VELOCITA }?.let { v -> " · ultima pulita $v%" } ?: "") + " · " +
            Pratica.riga(Pratica.pezzi(i.nodi.filter { it.percorsoId == per.id }), i.oggi, per.scadenza?.let { runCatching { java.time.LocalDate.parse(it) }.getOrNull() }))
        // La mappa del tempo (logica/Tempo.kt): se il calendario è letto, il tempo libero di adesso diventa la prima scelta.
        val eventi = (vm.agenda as? AgendaLetta.Letta)?.eventi
        val ora = java.time.LocalDateTime.now()
        val momento = eventi?.let { ev -> it.resonance.adam.logica.Tempo.adesso(ev, ora) }
        val libero = (momento as? it.resonance.adam.logica.Tempo.Adesso.Libero)?.let { l -> l to it.resonance.adam.logica.Tempo.daStudiare(l.minuti) }
        when {
            momento is it.resonance.adam.logica.Tempo.Adesso.Impegnato -> Tenue("Ora sei in un impegno fino alle ${momento.evento.fine.toLocalTime().toString().take(5)}. Quando hai tempo:")
            libero != null && libero.second >= 5 -> Tenue(it.resonance.adam.logica.Tempo.riga(libero.first) + ". Il piano lo fa il programma.")
            else -> {}
        }
        // Un'azione principale, grande (il tempo libero di adesso, o 20′), e le altre durate accanto, piccole.
        val principale = libero?.second?.takeIf { it >= 5 }?.coerceAtMost(120) ?: 20
        val tempi = SUBITO.filter { it != principale }
        val etichetta = { m: Int -> if (m < 60) "$m′" else if (m % 60 == 0) "${m / 60}h" else "${m / 60}h${m % 60}" }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            Button({ vm.iniziaStudio(per, principale) }, modifier = Modifier.testTag("subito-$principale"),
                colors = ButtonDefaults.buttonColors(containerColor = Colori.inchiostro, contentColor = Colori.fondo)) { Text("Studia ${etichetta(principale)}", fontWeight = FontWeight.SemiBold) }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                items(tempi) { m -> TextButton({ vm.iniziaStudio(per, m) }, modifier = Modifier.testTag("subito-$m")) { Text(etichetta(m), color = Colori.inchiostro) } }
            }
        }
    }
}

/** Il Ritratto di Adam in piccolo, in cima: com'è oggi Adam, in un'immagine. Un tocco lo apre. */
@Composable
private fun RitrattoBreve(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    val sessioni by vm.sessioni.collectAsState()
    val m = androidx.compose.runtime.remember(i, sessioni) { it.resonance.adam.logica.Ritratto.da(i, sessioni) }
    Row(Modifier.fillMaxWidth().clickable { vm.ritrattoAperto = true }.padding(vertical = 4.dp).testTag("ritratto"), verticalAlignment = Alignment.CenterVertically) {
        RitrattoUi(m, Modifier.width(120.dp))
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Etichetta("Adam oggi", Colori.ambraScura)
            m.legenda().take(4).forEach { Text(it, fontSize = 13.sp, color = Colori.tenue, lineHeight = 17.sp) }
        }
    }
}

/** Il Ritratto a schermo intero: grande, con la legenda intera, e i due gesti per portarlo fuori dall'app. */
@Composable
fun RitrattoAperto(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    val sessioni by vm.sessioni.collectAsState()
    val m = androidx.compose.runtime.remember(i, sessioni) { it.resonance.adam.logica.Ritratto.da(i, sessioni) }
    Column(Modifier.fillMaxSize().background(Colori.fondo).verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Adam oggi", fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            TextButton({ vm.ritrattoAperto = false }) { Text("Chiudi", color = Colori.tenue) }
        }
        RitrattoUi(m)
        Tenue("Disegnato dai tuoi dati, non da ciò che dichiari. I petali sono i pilastri: lunghi quanto sono vivi, vuoti se fermi da due settimane. " +
            "Gli anelli sono i rituali, chiusi quanto reggono. I rami sono i fronti: le foglie piene sono i pezzi pronti. Ciò che non pratichi sbiadisce.")
        Spazio(6)
        m.legenda().forEach { Riga("· $it") }
        Spazio(10)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button({ vm.sfondo(m) }, colors = ButtonDefaults.buttonColors(containerColor = Colori.inchiostro, contentColor = Colori.fondo)) { Text("Mettilo come sfondo") }
            OutlinedButton({ vm.chiediWidget() }) { Text("Widget") }
        }
        Spazio(80)
    }
}

/**
 * Una scoperta (logica/Scoperte.kt): una relazione nei suoi dati che nessuno ha chiesto e che il programma ha provato.
 * Si dice per quello che è, una correlazione; il gesto che la segue è metterla alla prova con un esperimento.
 */
@Composable
private fun Scoperta(vm: Adam) {
    androidx.compose.runtime.LaunchedEffect(Unit) { if (vm.scoperte.isEmpty()) vm.cercaScoperte() }
    val s = it.resonance.adam.logica.Scoperte.daMostrare(vm.scoperte, vm.scoperteChiuse) ?: return
    val tocco = LocalHapticFeedback.current
    SchedaForte(Colori.vidya, Modifier.testTag("scoperta")) {
        Etichetta("Una cosa che non sapevi", Colori.vidya)
        Text(s.testo(), fontSize = 17.sp, lineHeight = 24.sp, color = Colori.inchiostro)
        Tenue("L'ha trovata il programma nei tuoi dati, da solo. È una relazione, non ancora una causa: per saperlo si prova.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button({ tocco.performHapticFeedback(HapticFeedbackType.LongPress); vm.provaScoperta(s) }, modifier = Modifier.testTag("prova-scoperta"),
                colors = ButtonDefaults.buttonColors(containerColor = Colori.inchiostro, contentColor = Colori.fondo)) { Text("Mettila alla prova") }
            TextButton({ vm.chiudiScoperta(s) }) { Text("Interessante", color = Colori.tenue) }
        }
    }
}

/** Le proposte dello Shell che aspettano il Ghost: si decidono qui, con la stessa conferma della chat. */
@Composable
private fun DaDecidere(vm: Adam) {
    val inAttesa by vm.inAttesa.collectAsState()
    if (inAttesa.isEmpty()) return
    val tocco = LocalHapticFeedback.current
    Scheda(Colori.ambra, Modifier.testTag("da-decidere")) {
        Etichetta("Da decidere · ${inAttesa.size}", Colori.ambraInchiostro)
        inAttesa.take(5).forEach { m ->
            Riga(m.testo)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 6.dp)) {
                Button({ tocco.performHapticFeedback(HapticFeedbackType.LongPress); vm.conferma(m) },
                    colors = ButtonDefaults.buttonColors(containerColor = Colori.ambra, contentColor = Colori.ambraInchiostro)) { Text("Sì") }
                OutlinedButton({ vm.rifiuta(m) }) { Text("No") }
                TextButton({ vm.vai(Schermata.SHELL) }) { Text("Dimmi di più", color = Colori.tenue) }
            }
        }
        if (inAttesa.size > 5) TextButton({ vm.vai(Schermata.SHELL) }) { Text("Le altre ${inAttesa.size - 5} in chat ›") }
    }
}

/** Una riga per fronte che ha qualcosa da dire: a che punto è e quando ci si è lavorato l'ultima volta. */
@Composable
private fun FrontiMossi(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    val sessioni by vm.sessioni.collectAsState()
    val fronti = Fronti.ordina(i.percorsi, i.nodi, i.oggi).filter { Pratica.pezzi(i.nodi.filter { n -> n.percorsoId == it.id }).isNotEmpty() }.take(4)
    if (fronti.isEmpty()) {
        Scheda { Etichetta("Fronti"); Tenue("Nessun fronte ancora. Aprine uno in Fronti, o chiedilo allo Shell: «apri il fronte del tributo».") }
        return
    }
    Scheda {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { Etichetta("Fronti", Colori.tenue) }
            TextButton({ vm.vai(Schermata.FRONTI) }) { Text("Tutti ›", fontSize = 12.sp, color = Colori.tenue) }
        }
        fronti.forEach { p ->
            val pezzi = Pratica.pezzi(i.nodi.filter { it.percorsoId == p.id })
            Column(Modifier.fillMaxWidth().clickable { vm.apriFronte(p.id) }.padding(vertical = 5.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("● ", color = Colori.di(p.pilastro), fontSize = 12.sp)
                    Text(p.titolo, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                }
                Tenue(listOfNotNull(Pratica.riga(pezzi, i.oggi, p.scadenza?.let { runCatching { java.time.LocalDate.parse(it) }.getOrNull() }),
                    Fronti.rigaUltima(Fronti.ultima(sessioni, p.id), i.oggi), p.prossimoPasso.ifBlank { null }).joinToString(" · "))
            }
        }
    }
}

/** I rituali a mano non ancora fatti oggi: un tocco, e per qualche secondo si può annullare. */
@Composable
private fun RitualiDaFare(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    if (i.via != null) return
    val stati = Contesto.statoRituali(i)
    if (stati.isEmpty()) return
    val tocco = LocalHapticFeedback.current
    val daFare = stati.filter { !it.tenuta.oggi && it.rituale.criterio == null }
    val fatti = stati.filter { it.tenuta.oggi }
    Scheda(Colori.ambra) {
        Etichetta("Rituali", Colori.ambraInchiostro)
        daFare.forEach { s ->
            Row(Modifier.fillMaxWidth().testTag("rituale-${s.rituale.nome}").clickable {
                tocco.performHapticFeedback(HapticFeedbackType.LongPress); vm.spuntaConAnnulla(s.rituale)
            }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("○  ", color = Colori.di(s.rituale.pilastro), fontSize = 16.sp)
                Text(s.rituale.nome, fontSize = 15.sp, modifier = Modifier.weight(1f))
                if (s.tenuta.serie > 0) Text("${s.tenuta.serie} di fila", fontSize = 12.sp, color = Colori.tenue)
            }
        }
        // I rituali automatici non si toccano: si spuntano dalla misura (una sessione di studio, il sonno, i passi).
        stati.filter { !it.tenuta.oggi && it.rituale.criterio != null }.forEach { s ->
            Tenue("◌  ${s.rituale.nome}: si spunta da solo quando ${it.resonance.adam.logica.Stabilita.leggiCriterio(s.rituale.criterio)?.leggibile() ?: s.rituale.criterio}")
        }
        if (fatti.isNotEmpty()) Tenue("✓ " + fatti.joinToString(" · ") { it.rituale.nome })
    }
}

/** Solo i numeri che si sono mossi negli ultimi due giorni. */
@Composable
private fun Numeri(vm: Adam, onNumero: () -> Unit) {
    val i by vm.istantanea.collectAsState()
    val tipi = Fronti.cambiati(i.misure, i.oggi).filter { it != TipoMisura.ENTRATA }
    Scheda {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { Etichetta("Numeri che si sono mossi", Colori.tenue) }
            TextButton(onNumero) { Text("+ Numero", fontSize = 12.sp, color = Colori.tenue) }
            TextButton({ vm.leggiSensi() }) { Text("Sensori", fontSize = 12.sp, color = Colori.tenue) }
        }
        if (vm.statoSensi.isNotBlank()) Tenue(vm.statoSensi)
        if (tipi.isEmpty()) Tenue("Niente di nuovo da ieri.")
        tipi.forEach { t ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("● ", color = Colori.di(t.pilastro), fontSize = 10.sp)
                Riga(Esiti.riga(Esiti.sintesi(i.misure, t, i.oggi), i.oggi))
            }
        }
    }
}

@Composable
private fun AgendaBreve(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    val a = vm.agenda as? AgendaLetta.Letta ?: return
    val oggi = Agenda.delGiorno(a.eventi, i.oggi)
    val domani = Agenda.delGiorno(a.eventi, i.oggi.plusDays(1))
    if (oggi.isEmpty() && domani.isEmpty()) return
    Scheda(Colori.air) {
        Etichetta("Agenda", Colori.air)
        listOf("Oggi" to oggi, "Domani" to domani).filter { it.second.isNotEmpty() }.forEach { (nome, eventi) ->
            Row {
                Text(nome, color = Colori.tenue, fontSize = 13.sp, modifier = Modifier.width(64.dp).padding(top = 2.dp))
                Column { eventi.forEach { Riga(Agenda.riga(it, i.oggi, conGiorno = false)) } }
            }
        }
    }
}

@Composable
private fun EsperimentiBreve(vm: Adam) {
    val i by vm.istantanea.collectAsState()
    val tutti by vm.esperimenti.collectAsState()
    val aperti = Esperimenti.aperti(tutti)
    if (aperti.isEmpty()) return
    Scheda(Colori.vidya, Modifier.clickable { vm.vai(Schermata.SPECCHIO) }) {
        Etichetta("Esperimenti in corso", Colori.vidya)
        aperti.forEach { Tenue(Esperimenti.riga(it, i.misure, i.oggi)) }
    }
}

