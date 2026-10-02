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
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.logica.Proposta
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
            val nome = it.resonance.adam.logica.Nomi.soggetto(Db.di(applicationContext).profilo().leggi())
            val c = Rapide.Contenuto(ID_RISPOSTA, "$nome ha risposto", esito.testo.ifBlank { "Ha una proposta per te." } + proposte, "", "SHELL", CANALE_RISPOSTE)
            // Si risponde dalla notifica, e la conversazione va avanti senza aprire l'app (logica/Gesti.kt).
            val imp = Impostazioni(applicationContext)
            Battiti.notifica(applicationContext, c.id, c.titolo, c.testo, c.dettaglio, c.schermata, c.canale,
                azioni = Rapide.azioni(applicationContext, c, it.resonance.adam.logica.Gesti.puoRispondere(imp.riunione), emptyList()))
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

// La ricerca a fondo autorizzata dal Ghost (02/10/2026, logica/AFondo.kt), come lavoro di sistema: il 02/10 girava dentro
// l'app aperta, e uscire dall'app poteva troncarla. Ora continua a schermo spento; a lavoro finito, se il Ghost non è
// nell'app, una notifica. Se il sistema la interrompe e la rilancia, non la si paga due volte: una scheda già scritta
// dopo la proposta basta.
class RicercaWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun getForegroundInfo(): ForegroundInfo {
        TurnoWorker.creaCanali(applicationContext)
        val n = NotificationCompat.Builder(applicationContext, TurnoWorker.CANALE_LAVORO)
            .setSmallIcon(R.drawable.ic_notifica).setContentTitle("Ricerca a fondo in corso…").setOngoing(true).build()
        return ForegroundInfo(ID_LAVORO, n)
    }

    override suspend fun doWork(): Result {
        val id = inputData.getLong(ID, -1)
        val archivio = Archivio(Db.di(applicationContext))
        val m = archivio.db.messaggi().per(id) ?: return Result.failure()
        val p = archivio.proposta(m) as? Proposta.RicercaAFondo ?: return Result.failure()
        if (archivio.db.messaggi().dopo(id).any { it.ruolo == Ruolo.RICERCA && it.testo.startsWith("Ricerca a fondo") }) return Result.success()
        val scheda = Shell(archivio, Impostazioni(applicationContext), mondo = MondoAndroid(applicationContext)).ricercaAFondo(p)
        if (!Primopiano.visibile) {
            TurnoWorker.creaCanali(applicationContext)
            Battiti.notifica(applicationContext, ID_FINE, "Ricerca a fondo pronta", scheda.lineSequence().drop(2).take(6).joinToString("\n"),
                "", "SHELL", TurnoWorker.CANALE_RISPOSTE)
        }
        return Result.success()
    }

    companion object {
        const val NOME = "ricerca-a-fondo"
        const val ID = "id"
        private const val ID_LAVORO = 303
        private const val ID_FINE = 304

        fun accoda(context: Context, idProposta: Long) {
            val r = OneTimeWorkRequestBuilder<RicercaWorker>()
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf(ID to idProposta))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(NOME, ExistingWorkPolicy.APPEND_OR_REPLACE, r)
        }
    }
}
