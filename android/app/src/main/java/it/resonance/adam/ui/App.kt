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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import it.resonance.adam.dati.Pilastro

@Composable
fun App(vm: Adam, sistema: Sistema, conMicrofono: (() -> Unit) -> Unit) {
    val avvisi = remember { SnackbarHostState() }
    LaunchedEffect(vm.avviso) {
        vm.avviso?.let { avvisi.showSnackbar(it); vm.avviso = null }
    }
    BackHandler(enabled = vm.schermata != Schermata.SPECCHIO || vm.percorsoAperto != null || vm.documentoAperto != null) { vm.indietro() }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = Colori.fondo,
            modifier = Modifier.systemBarsPadding(),
            snackbarHost = { SnackbarHost(avvisi) },
            topBar = {
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("RESONANCE", fontWeight = FontWeight.Bold, letterSpacing = 3.sp, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    TextButton({ vm.vai(Schermata.SETUP) }) { Text("Setup", color = Colori.tenue) }
                }
            },
            bottomBar = {
                NavigationBar(containerColor = Colori.superficie) {
                    listOf(Schermata.SPECCHIO, Schermata.SHELL, Schermata.ADAM, Schermata.BIO, Schermata.AIR, Schermata.VIDYA).forEach { s ->
                        val colore = when (s) { Schermata.BIO -> Colori.bio; Schermata.AIR -> Colori.air; Schermata.VIDYA -> Colori.vidya; else -> Colori.ambraInchiostro }
                        NavigationBarItem(
                            selected = vm.schermata == s,
                            onClick = { vm.vai(s) },
                            icon = { Text(if (vm.schermata == s) "●" else "○", color = colore) },
                            label = { Text(s.etichetta, fontSize = 11.sp, maxLines = 1, softWrap = false) },
                            colors = NavigationBarItemDefaults.colors(indicatorColor = colore.copy(alpha = 0.12f), selectedTextColor = colore),
                        )
                    }
                }
            },
        ) { interno ->
            Column(Modifier.padding(interno).fillMaxSize()) {
                when (vm.schermata) {
                    Schermata.SPECCHIO -> Specchio(vm)
                    Schermata.SHELL -> ShellUi(vm, sistema)
                    Schermata.ADAM -> PilastroUi(vm, Pilastro.ADAM)
                    Schermata.BIO -> PilastroUi(vm, Pilastro.BIO)
                    Schermata.AIR -> PilastroUi(vm, Pilastro.AIR)
                    Schermata.VIDYA -> PilastroUi(vm, Pilastro.VIDYA)
                    Schermata.SETUP -> Setup(vm, sistema)
                }
            }
        }
        Box(Modifier.fillMaxSize().systemBarsPadding().padding(bottom = 80.dp)) { Ancora(vm, conMicrofono) }
    }
}
