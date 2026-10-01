package it.resonance.adam.battito

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import it.resonance.adam.Impostazioni
import it.resonance.adam.cervello.Shell
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.Rituale
import it.resonance.adam.logica.Contesto
import it.resonance.adam.logica.Gesti
import it.resonance.adam.mondo.MondoAndroid
import it.resonance.adam.cervello.istantanea
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate

// Rispondere e spuntare dalla notifica, senza aprire l'app (logica/Gesti.kt). La risposta entra in chat come un
// messaggio del Ghost e parte il turno di sempre (TurnoWorker): stessa strada, stesse conferme. La spunta è il gesto
// del Ghost, come il tocco sullo Specchio.
object Rapide {
    private const val RISPONDI = "it.resonance.adam.RISPONDI"
    private const val SPUNTA = "it.resonance.adam.SPUNTA"
    const val CHIAVE = "risposta"

    /** La notifica e i suoi gesti: si ridisegna uguale dopo una spunta, con i rituali che restano. */
    data class Contenuto(val id: Int, val titolo: String, val testo: String, val dettaglio: String, val schermata: String, val canale: String)

    private fun Intent.con(c: Contenuto) = apply {
        putExtra("id", c.id); putExtra("titolo", c.titolo); putExtra("testo", c.testo); putExtra("dettaglio", c.dettaglio)
        putExtra("schermata", c.schermata); putExtra("canale", c.canale)
    }

    private fun Intent.contenuto() = Contenuto(getIntExtra("id", 0), getStringExtra("titolo").orEmpty(), getStringExtra("testo").orEmpty(),
        getStringExtra("dettaglio").orEmpty(), getStringExtra("schermata") ?: "SHELL", getStringExtra("canale") ?: Battiti.CANALE)

    fun azioni(context: Context, c: Contenuto, rispondi: Boolean, rituali: List<Rituale>): List<NotificationCompat.Action> = buildList {
        if (rispondi) {
            // RemoteInput vuole un PendingIntent modificabile: il sistema ci scrive dentro il testo.
            val pi = PendingIntent.getBroadcast(context, c.id * 10, Intent(context, GestoRapido::class.java).setAction(RISPONDI).con(c),
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            add(NotificationCompat.Action.Builder(0, "Rispondi", pi)
                .addRemoteInput(RemoteInput.Builder(CHIAVE).setLabel("Allo Shell").build())
                .setAllowGeneratedReplies(false).build())
        }
        rituali.forEachIndexed { n, r ->
            val pi = PendingIntent.getBroadcast(context, c.id * 10 + 1 + n,
                Intent(context, GestoRapido::class.java).setAction(SPUNTA).putExtra("rituale", r.id).con(c),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            add(NotificationCompat.Action.Builder(0, "✓ ${r.nome.take(24)}", pi).build())
        }
    }

    internal suspend fun gesto(context: Context, intent: Intent) {
        val c = intent.contenuto()
        val archivio = Archivio(Db.di(context))
        val imp = Impostazioni(context)
        when (intent.action) {
            RISPONDI -> {
                val testo = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(CHIAVE)?.toString()?.trim().orEmpty()
                if (testo.isEmpty()) return
                val id = Shell(archivio, imp, mondo = MondoAndroid(context)).registra(testo)
                TurnoWorker.accoda(context, id)
                // La notifica va ridisegnata, o Android lascia la rotella: ora dice che la risposta è partita.
                Battiti.notifica(context, c.id, c.titolo, Gesti.mandato(testo), c.testo, c.schermata, c.canale, silenziosa = true)
            }
            SPUNTA -> {
                val rid = intent.getLongExtra("rituale", -1)
                val oggi = LocalDate.now()
                val r = archivio.db.rituali().elenco().find { it.id == rid } ?: return
                val gia = archivio.db.rituali().elencoSpunte().any { it.ritualeId == rid && it.giorno == oggi.toString() }
                if (!gia) archivio.alternaSpunta(r, oggi.toString(), tenuto = false)
                val i = archivio.istantanea(oggi)
                val restano = Gesti.daSpuntare(Contesto.statoRituali(i), i.via != null)
                Battiti.notifica(context, c.id, c.titolo, c.testo, c.dettaglio, c.schermata, c.canale, silenziosa = true,
                    azioni = azioni(context, c, Gesti.puoRispondere(imp.riunione), restano))
            }
        }
    }
}

class GestoRapido : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val attesa = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try { Rapide.gesto(context.applicationContext, intent) } finally { attesa.finish() }
        }
    }
}
