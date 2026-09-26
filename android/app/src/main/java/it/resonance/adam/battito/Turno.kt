package it.resonance.adam.battito

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import it.resonance.adam.Impostazioni
import it.resonance.adam.R
import it.resonance.adam.cervello.Shell
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.mondo.MondoAndroid

// Se l'app è davanti agli occhi del Ghost: lo tiene aggiornato MainActivity. Serve a decidere se avvisare.
object Primopiano { @Volatile var visibile = false }

// Il turno dello Shell come lavoro di sistema: continua a schermo spento o ad app chiusa, con la rete garantita,
// e parte appena la rete c'è. A lavoro finito, se il Ghost non è nell'app, una notifica.
class TurnoWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun getForegroundInfo(): ForegroundInfo {
        creaCanali(applicationContext)
        val n = NotificationCompat.Builder(applicationContext, CANALE_LAVORO)
            .setSmallIcon(R.drawable.ic_notifica).setContentTitle("Lo Shell sta pensando…").setOngoing(true).build()
        // Usata solo prima di Android 12 (poi il lavoro accelerato non passa da un servizio): lì il tipo non serve.
        return ForegroundInfo(ID_LAVORO, n)
    }

    override suspend fun doWork(): Result {
        val id = inputData.getLong(ID, -1)
        if (id < 0) return Result.failure()
        val forza = inputData.getString(FORZA)?.let { f -> it.resonance.adam.cervello.Forzatura.entries.find { it.name == f } }
        val esito = Shell(Archivio(Db.di(applicationContext)), Impostazioni(applicationContext), mondo = MondoAndroid(applicationContext)).rispondi(id, forza)
        // Lo Shell può aver spuntato la lista mentre l'app era chiusa: la notifica fissata segue.
        runCatching { Fissati.aggiorna(applicationContext) }
        if (!Primopiano.visibile && (esito.testo.isNotBlank() || esito.proposte.isNotEmpty())) {
            creaCanali(applicationContext)
            val proposte = if (esito.proposte.isEmpty()) "" else "\n${esito.proposte.size} proposta da confermare"
            Battiti.notifica(applicationContext, ID_RISPOSTA, "Lo Shell ha risposto", esito.testo.ifBlank { "Ha una proposta per te." } + proposte, "", "SHELL", CANALE_RISPOSTE)
        }
        return Result.success(workDataOf(TESTO to esito.testo.take(8000), PROPOSTE to esito.proposte.toLongArray()))
    }

    companion object {
        const val NOME = "turno"
        const val ID = "id"
        const val FORZA = "forza"
        const val TESTO = "testo"
        const val PROPOSTE = "proposte"
        private const val ID_LAVORO = 301
        private const val ID_RISPOSTA = 302
        const val CANALE_LAVORO = "lavoro"
        const val CANALE_RISPOSTE = "risposte"

        fun accoda(context: Context, idGhost: Long, forza: it.resonance.adam.cervello.Forzatura? = null): OneTimeWorkRequest {
            val r = OneTimeWorkRequestBuilder<TurnoWorker>()
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf(ID to idGhost, FORZA to forza?.name))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(NOME, ExistingWorkPolicy.APPEND_OR_REPLACE, r)
            return r
        }

        fun creaCanali(context: Context) {
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CANALE_RISPOSTE, "Risposte dello Shell", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Quando lo Shell risponde e non sei nell'app"
            })
            nm.createNotificationChannel(NotificationChannel(CANALE_LAVORO, "Shell al lavoro", NotificationManager.IMPORTANCE_MIN))
        }
    }
}
