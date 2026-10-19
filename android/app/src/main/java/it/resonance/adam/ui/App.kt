package it.resonance.adam.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Pilastro

@Composable
fun App(vm: Adam, sistema: Sistema, conMicrofono: (() -> Unit) -> Unit) {
    val avvisi = remember { SnackbarHostState() }
    val profilo by vm.profilo.collectAsState()
    LaunchedEffect(vm.avviso) {
        vm.avviso?.let { avvisi.showSnackbar(it); vm.avviso = null }
    }
    // In modalità auto lo schermo resta acceso: a schermo bloccato il riconoscimento vocale si ferma, e il Ghost
    // doveva sbloccare il telefono a ogni frase (25/09/2026). Si spegne da solo quando l'auto si ferma o va in pausa.
    val vista = androidx.compose.ui.platform.LocalView.current
    androidx.compose.runtime.DisposableEffect(vm.ascolta) {
        vista.keepScreenOn = vm.ascolta == Ascolta.AUTO
        onDispose { vista.keepScreenOn = false }
    }
    // Al ritorno nell'app la riunione si ritira subito: fuori, Android la congela e gli interventi aspettavano (26/09).
    androidx.lifecycle.compose.LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) { vm.alRitorno() }
    BackHandler(enabled = vm.schermata != Schermata.OGGI || vm.percorsoAperto != null || vm.documentoAperto != null || vm.ritrattoAperto || vm.provaAperta) {
        if (vm.provaAperta) vm.provaAperta = false else if (vm.ritrattoAperto) vm.ritrattoAperto = false else vm.indietro()
    }
    // Un gesto disfacibile (V3): la striscia con «Annulla» per qualche secondo.
    LaunchedEffect(vm.annullabile) {
        vm.annullabile?.let { a ->
            if (avvisi.showSnackbar(a.testo, actionLabel = "Annulla", duration = androidx.compose.material3.SnackbarDuration.Short) ==
                androidx.compose.material3.SnackbarResult.ActionPerformed) a.annulla()
            vm.annullabile = null
        }
    }
    var menu by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = Colori.fondo,
            modifier = Modifier.systemBarsPadding(),
            snackbarHost = { SnackbarHost(avvisi) },
            topBar = {
                // Durante il tour (ui/Tour.kt) niente barre: una cosa per volta.
                if (!vm.tour) Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    // Nei tre luoghi il titolo è nella pagina (la data, «Fronti», la chat): qui niente, per non dirlo due volte.
                    Text(if (vm.schermata.luogo) "" else vm.schermata.etichetta, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.weight(1f))
                    // Il menu (V3, 16/10/2026): tutto ciò che non è Oggi, Fronti o Shell. Nessuna funzione persa, solo spostata.
                    Box {
                        TextButton({ menu = true }, modifier = Modifier.testTag("menu")) { Text("☰", fontSize = 20.sp, color = Colori.tenue) }
                        androidx.compose.material3.DropdownMenu(menu, { menu = false }) {
                            Menu.voci(it.resonance.adam.logica.Edizione.sviluppatore).forEach { v ->
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Column { Text(v.nome); Text(v.cosa, fontSize = 12.sp, color = Colori.tenue) } },
                                    onClick = { menu = false; vm.vai(v.schermata) })
                            }
                        }
                    }
                }
            },
            bottomBar = {
                if (!vm.tour) NavigationBar(containerColor = Colori.fondo, tonalElevation = 0.dp) {
                    listOf(Schermata.OGGI, Schermata.FRONTI, Schermata.SHELL).forEach { s ->
                        NavigationBarItem(
                            selected = vm.schermata == s,
                            onClick = { vm.vai(s) },
                            icon = { IconaLuogo(s, vm.schermata == s, if (vm.schermata == s) Colori.ambraInchiostro else Colori.tenue) },
                            // La scheda dello Shell porta il suo nome, se il Ghost gliene ha dato uno (logica/Nomi.kt).
                            label = { Text(if (s == Schermata.SHELL) it.resonance.adam.logica.Nomi.shell(profilo) else s.etichetta,
                                fontSize = 12.sp, maxLines = 1, softWrap = false, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) },
                            colors = NavigationBarItemDefaults.colors(indicatorColor = Colori.ambraTenue, selectedTextColor = Colori.ambraInchiostro, unselectedTextColor = Colori.tenue),
                        )
                    }
                }
            },
        ) { interno ->
            Column(Modifier.padding(interno).fillMaxSize()) {
                if (vm.tour) TourUi(vm, sistema) else when (vm.schermata) {
                    Schermata.OGGI -> OggiUi(vm)
                    Schermata.FRONTI -> FrontiUi(vm)
                    Schermata.SHELL -> ShellUi(vm, sistema)
                    Schermata.SPECCHIO -> Specchio(vm)
                    Schermata.ADAM -> PilastroUi(vm, Pilastro.ADAM)
                    Schermata.BIO -> PilastroUi(vm, Pilastro.BIO)
                    Schermata.AIR -> PilastroUi(vm, Pilastro.AIR)
                    Schermata.VIDYA -> PilastroUi(vm, Pilastro.VIDYA)
                    Schermata.SETUP -> Setup(vm, sistema)
                }
            }
        }
        if (!vm.tour) Box(Modifier.fillMaxSize().systemBarsPadding().padding(bottom = 80.dp)) { Ancora(vm, conMicrofono) }
        // Il Ritratto di Adam a schermo intero, sopra tutto (ui/Oggi.kt).
        if (vm.ritrattoAperto) Box(Modifier.fillMaxSize().systemBarsPadding()) { RitrattoAperto(vm) }
        // La prova generale, sopra tutto (ui/ProvaUi.kt).
        if (vm.provaAperta) Box(Modifier.fillMaxSize()) { ProvaUi(vm) }
    }
}
