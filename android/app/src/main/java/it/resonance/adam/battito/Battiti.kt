package it.resonance.adam.battito

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import it.resonance.adam.Impostazioni
import it.resonance.adam.MainActivity
import it.resonance.adam.R
import it.resonance.adam.cervello.Shell
import it.resonance.adam.cervello.istantanea
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.logica.Battito
import it.resonance.adam.logica.Riassunti
import it.resonance.adam.logica.Ritmo
import it.resonance.adam.sensi.Sensi
import java.time.DayOfWeek
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.concurrent.TimeUnit

// L'app prende l'iniziativa: tre battiti al giorno/settimana, senza server, anche ad app chiusa.
object Battiti {
    const val CANALE = "battito"
    const val EXTRA_SCHERMATA = "schermata"

    fun programma(context: Context) {
        val imp = Impostazioni(context)
        val wm = WorkManager.getInstance(context)
        wm.enqueueUniquePeriodicWork(
            "sensi", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SensiWorker>(6, TimeUnit.HOURS).build(),
        )
        if (!imp.battitoAttivo) {
            Battito.entries.forEach { wm.cancelUniqueWork(it.name) }
            return
        }
        Battito.entries.forEach { prossimo(context, it) }
    }

    fun prossimo(context: Context, b: Battito) {
        val imp = Impostazioni(context)
        val (orario, giorno) = when (b) {
            Battito.MATTINO -> Ritmo.leggiOrario(imp.orarioMattino, LocalTime.of(7, 30)) to null
            Battito.SERA -> Ritmo.leggiOrario(imp.orarioSera, LocalTime.of(21, 30)) to null
            Battito.SETTIMANA -> Ritmo.leggiOrario(imp.orarioSettimana, LocalTime.of(18, 0)) to DayOfWeek.SUNDAY
        }
        val attesa = Ritmo.attesa(LocalDateTime.now(), orario, giorno)
        WorkManager.getInstance(context).enqueueUniqueWork(
            b.name, ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<BattitoWorker>()
                .setInitialDelay(attesa.toMillis(), TimeUnit.MILLISECONDS)
                .setInputData(workDataOf("battito" to b.name))
                .build(),
        )
    }

    fun creaCanale(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CANALE, "Battito", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Mattino, sera e settimana: l'app ti parla per prima"
        })
    }

    fun notifica(context: Context, id: Int, titolo: String, testo: String, dettaglio: String, schermata: String) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            android.os.Build.VERSION.SDK_INT >= 33) return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_SCHERMATA, schermata)
        }
        val pi = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val completo = if (dettaglio.isNotBlank() && dettaglio != testo) "$testo\n\n$dettaglio" else testo
        val n = NotificationCompat.Builder(context, CANALE)
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentTitle(titolo)
            .setContentText(testo.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(completo))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(id, n)
    }
}

class BattitoWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val b = runCatching { Battito.valueOf(inputData.getString("battito")!!) }.getOrNull() ?: return Result.failure()
        val archivio = Archivio(Db.di(applicationContext))
        val imp = Impostazioni(applicationContext)
        try {
            runCatching { Sensi(applicationContext).sincronizza(archivio, 14) }
            val i = archivio.istantanea()
            val riassunto = when (b) {
                Battito.MATTINO -> Riassunti.mattino(i)
                Battito.SERA -> Riassunti.sera(i)
                Battito.SETTIMANA -> Riassunti.settimana(i)
            }
            val momento = when (b) {
                Battito.MATTINO -> "mattino, inizio della giornata"
                Battito.SERA -> "sera, chiusura della giornata"
                Battito.SETTIMANA -> "fine settimana, lo specchio dei sette giorni"
            }
            val voce = if (imp.mattinoDalModello) Shell(archivio, imp).parlaPerPrimo(momento, riassunto) else null
            val titolo = when (b) { Battito.MATTINO -> "Oggi"; Battito.SERA -> "Stasera"; Battito.SETTIMANA -> "La settimana" }
            Battiti.notifica(applicationContext, 100 + b.ordinal, titolo, voce ?: riassunto, if (voce != null) riassunto else "",
                if (b == Battito.SERA) "SHELL" else "SPECCHIO")
        } finally {
            Battiti.prossimo(applicationContext, b)
        }
        return Result.success()
    }
}

class SensiWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        runCatching { Sensi(applicationContext).sincronizza(Archivio(Db.di(applicationContext)), 7) }
        return Result.success()
    }
}
