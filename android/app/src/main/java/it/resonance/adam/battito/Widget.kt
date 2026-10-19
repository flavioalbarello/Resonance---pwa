package it.resonance.adam.battito

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import it.resonance.adam.MainActivity
import it.resonance.adam.R
import it.resonance.adam.cervello.istantanea
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.logica.Ritratto
import it.resonance.adam.ui.ritrattoBitmap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate

// Il Ritratto di Adam sulla schermata principale (19/10/2026). Si ridisegna al battito e quando si apre l'app: il
// ritratto cambia coi dati, non con l'orologio. Toccarlo apre Oggi.
class WidgetRitratto : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val attesa = goAsync()
        CoroutineScope(Dispatchers.Default).launch { try { Widget.aggiorna(context.applicationContext) } finally { attesa.finish() } }
    }
}

object Widget {
    suspend fun modello(context: Context): Ritratto.Modello {
        val archivio = Archivio(Db.di(context))
        return Ritratto.da(archivio.istantanea(LocalDate.now()), archivio.db.pratica().sessioni())
    }

    suspend fun aggiorna(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, WidgetRitratto::class.java))
        if (ids.isEmpty()) return
        val m = modello(context)
        val viste = RemoteViews(context.packageName, R.layout.widget_ritratto).apply {
            setImageViewBitmap(R.id.widget_immagine, ritrattoBitmap(m, 480, 480, fondo = null))
            setTextViewText(R.id.widget_riga, m.legenda().firstOrNull { "cresce" in it } ?: m.legenda().joinToString(" · ") { it.substringBefore(":") + it.substringAfter(":").take(8) }.take(60))
            setOnClickPendingIntent(R.id.widget_radice, PendingIntent.getActivity(context, 4950,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra(Battiti.EXTRA_SCHERMATA, "OGGI"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        }
        manager.updateAppWidget(ids, viste)
    }

    /** Chiede al launcher di mettere il widget (Android 8+, se il launcher lo permette). */
    fun chiedi(context: Context): Boolean {
        val manager = AppWidgetManager.getInstance(context)
        if (!manager.isRequestPinAppWidgetSupported) return false
        return manager.requestPinAppWidget(ComponentName(context, WidgetRitratto::class.java), null, null)
    }
}
