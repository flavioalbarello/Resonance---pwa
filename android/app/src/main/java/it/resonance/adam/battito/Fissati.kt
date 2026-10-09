package it.resonance.adam.battito

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import it.resonance.adam.MainActivity
import it.resonance.adam.R
import it.resonance.adam.dati.Appunto
import it.resonance.adam.dati.Db
import it.resonance.adam.logica.Lavagna
import java.time.LocalDate

// Gli appunti fissati nelle notifiche (riunione del 26/09/2026): al supermercato la lista si vede senza aprire l'app.
// Una notifica per appunto, che non si scorre via; sparisce da sola quando l'appunto finisce, scade o si sfissa.
// Si ridisegna da chi cambia la lavagna: l'app aperta, il turno dello Shell, il battito.
object Fissati {
    private const val CANALE = "lavagna"
    private const val BASE = 4000

    @android.annotation.SuppressLint("MissingPermission")
    fun aggiorna(context: Context, appunti: List<Appunto>, oggi: LocalDate = LocalDate.now()) {
        val nm = NotificationManagerCompat.from(context)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CANALE, "Lavagna", NotificationManager.IMPORTANCE_LOW).apply { description = "Gli appunti che fissi: la lista sempre a portata" })
        for (a in appunti) {
            val id = BASE + a.id.toInt()
            if (!a.fissato || !Lavagna.vivo(a, oggi)) { nm.cancel(id); continue }
            val righe = Lavagna.daFare(a).map { "☐ ${it.testo}" }
            val stile = NotificationCompat.InboxStyle().also { s -> righe.take(20).forEach { s.addLine(it) } }
            val apri = PendingIntent.getActivity(context, id, Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(Battiti.EXTRA_SCHERMATA, "ADAM")
            }, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = NotificationCompat.Builder(context, CANALE)
                .setSmallIcon(R.drawable.ic_notifica)
                .setContentTitle("${a.titolo} · ${righe.size} da fare")
                .setContentText(righe.joinToString("  "))
                .setStyle(stile)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(apri)
                .build()
            try { nm.notify(id, n) } catch (e: SecurityException) { return }
        }
    }

    suspend fun aggiorna(context: Context) = aggiorna(context, Db.di(context).lavagna().elenco())
}
