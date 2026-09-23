package it.resonance.adam

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.content.IntentCompat
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import it.resonance.adam.battito.Battiti
import it.resonance.adam.battito.Primopiano
import it.resonance.adam.battito.TurnoWorker
import it.resonance.adam.ui.Adam
import it.resonance.adam.ui.App
import it.resonance.adam.ui.Schermata
import it.resonance.adam.ui.Sistema
import it.resonance.adam.ui.TemaResonance
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val vm: Adam by viewModels()
    private var dopoMicrofono: (() -> Unit)? = null

    private val permessoMicrofono = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) dopoMicrofono?.invoke() else vm.avviso = "Senza il permesso del microfono la voce non può funzionare."
        dopoMicrofono = null
    }
    private val permessoNotifiche = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        vm.avviso = if (ok) "Notifiche permesse: il battito può parlarti." else "Senza notifiche il battito resta muto."
    }
    private val permessiCalendario = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { esiti ->
        vm.avviso = when {
            esiti.values.all { it } -> "Calendario collegato."
            esiti[Manifest.permission.READ_CALENDAR] == true -> "Calendario in sola lettura."
            else -> "Senza il permesso lo Shell non vede gli impegni."
        }
        vm.leggiAgenda()
    }
    private val scegliAllegati = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uri ->
        uri.forEach { vm.aggiungiAllegato(it) }
    }
    private var foto: java.io.File? = null
    private val fotocamera = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = foto ?: return@registerForActivityResult
        if (ok && f.length() > 0) vm.aggiungiAllegato(FileProvider.getUriForFile(this, "$packageName.allegati", f), temporaneo = f) else f.delete()
        foto = null
    }
    private val permessiSensori = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { concessi ->
        vm.avviso = "Sensori: ${concessi.size} permessi concessi"
        vm.leggiSensi()
    }
    private val apri = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@registerForActivityResult
        lifecycleScope.launch {
            val testo = withContext(Dispatchers.IO) { contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } }
            if (testo == null) vm.avviso = "File illeggibile" else vm.apriFile(testo)
        }
    }
    private val salva = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri ?: return@registerForActivityResult
        lifecycleScope.launch {
            val testo = vm.copia()
            withContext(Dispatchers.IO) { contentResolver.openOutputStream(uri)?.use { it.write(testo.toByteArray()) } }
            vm.avviso = "Copia salvata"
        }
    }

    private val sistema = object : Sistema {
        override fun chiediSensori() {
            if (!vm.sensi.disponibile()) {
                vm.avviso = "Health Connect non è disponibile: installalo o aggiornalo dal Play Store."
                return
            }
            lifecycleScope.launch { permessiSensori.launch(vm.sensi.permessiDaChiedere()) }
        }
        override fun chiediNotifiche() {
            if (Build.VERSION.SDK_INT >= 33) permessoNotifiche.launch(Manifest.permission.POST_NOTIFICATIONS)
            else vm.avviso = "Su questa versione di Android le notifiche sono già permesse."
        }
        override fun chiediCalendario() = permessiCalendario.launch(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR))
        override fun allega() = scegliAllegati.launch(arrayOf("image/*", "application/pdf", "text/*", "application/json",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
        override fun scatta() {
            val f = vm.allegatore.fileFoto().also { foto = it }
            runCatching { fotocamera.launch(FileProvider.getUriForFile(this@MainActivity, "$packageName.allegati", f)) }
                .onFailure { vm.avviso = "Fotocamera non disponibile: ${it.message}"; f.delete(); foto = null }
        }
        override fun lavoroInBackground() {
            // Alcuni telefoni chiudono le app in secondo piano: senza questa eccezione il battito e le risposte possono non arrivare.
            // L'elenco delle app della batteria si apre senza permessi; se il telefono non lo ha, la scheda dell'app.
            runCatching { startActivity(Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
                .onFailure { startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:$packageName"))) }
            vm.avviso = "Cerca Resonance e scegli «Non ottimizzare» (o «Consenti attività in background»)."
        }
        override fun apriFile() = apri.launch(arrayOf("application/json", "text/plain", "*/*"))
        override fun salvaCopia() = salva.launch("resonance-copia-${LocalDate.now()}.json")
    }

    private fun conMicrofono(azione: () -> Unit) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) azione()
        else { dopoMicrofono = azione; permessoMicrofono.launch(Manifest.permission.RECORD_AUDIO) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Battiti.creaCanale(this)
        TurnoWorker.creaCanali(this)
        Battiti.programma(this)
        if (savedInstanceState == null) apriDa(intent)  // dopo una rotazione l'intent condiviso non va riletto
        setContent { TemaResonance { App(vm, sistema, ::conMicrofono) } }
        if (vm.sensi.disponibile()) lifecycleScope.launch { runCatching { if (vm.sensi.concessi().isNotEmpty()) vm.leggiSensi() } }
    }

    override fun onStart() {
        super.onStart()
        Primopiano.visibile = true
    }

    override fun onStop() {
        Primopiano.visibile = false
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        vm.leggiAgenda()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        apriDa(intent)
    }

    private fun apriDa(intent: Intent?) {
        intent?.getStringExtra(Battiti.EXTRA_SCHERMATA)?.let { s -> runCatching { vm.vai(Schermata.valueOf(s)) } }
        // Condiviso da un'altra app: file come allegati, testo nella casella. Si manda solo quando il Ghost preme Invia.
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, android.net.Uri::class.java)?.let { vm.aggiungiAllegato(it) }
                intent.getStringExtra(Intent.EXTRA_TEXT)?.let { t -> vm.input = listOf(vm.input.trim(), t).filter { it.isNotEmpty() }.joinToString("\n") }
                vm.vai(Schermata.SHELL)
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, android.net.Uri::class.java)?.forEach { vm.aggiungiAllegato(it) }
                vm.vai(Schermata.SHELL)
            }
        }
    }
}
