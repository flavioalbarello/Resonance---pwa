package it.resonance.adam.battito

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import it.resonance.adam.MainActivity
import it.resonance.adam.R
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.MisuraFronte
import it.resonance.adam.logica.Pratica
import it.resonance.adam.cervello.istantanea
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate

// La sessione in corso nelle notifiche (V3 fase 2, PROGETTO_V3.md). Il Ghost suona sopra Moises o YouTube: l'app non
// deve stare davanti, deve stare SOPRA. Una notifica fissa col blocco corrente, il conto alla rovescia, e tre gesti
// (pulito / errori / avanti) che registrano l'esito e passano al blocco dopo. A fine blocco una vibrazione: i tempi li
// tiene l'app, non lui. Toccarla apre la fonte del pezzo (il link di Moises o di YouTube), se c'è.
object Studio {
    private const val CANALE = "studio"
    private const val CANALE_TEMPO = "studio-tempo"
    const val ID = 4900
    private const val ESITO = "it.resonance.adam.STUDIO_ESITO"
    private const val TEMPO = "it.resonance.adam.STUDIO_TEMPO"
    private const val PROPONI = "it.resonance.adam.STUDIO_PROPONI"
    private const val AVVIA = "it.resonance.adam.STUDIO_AVVIA"
    private const val NON_ORA = "it.resonance.adam.STUDIO_NON_ORA"
    const val ID_PROPOSTA = 4910
    const val EXTRA_PERCORSO = "percorso"

    private fun canali(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CANALE, "Studio in corso", NotificationManager.IMPORTANCE_LOW)
            .apply { description = "Il blocco che stai suonando, coi gesti per dire com'è andata" })
        nm.createNotificationChannel(NotificationChannel(CANALE_TEMPO, "Fine del blocco", NotificationManager.IMPORTANCE_HIGH)
            .apply { description = "Una vibrazione quando il tempo del blocco è finito"; setSound(null, null); enableVibration(true) })
    }

    private fun apriApp(context: Context, percorsoId: Long, schermata: String) = PendingIntent.getActivity(context, ID,
        Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(Battiti.EXTRA_SCHERMATA, schermata); putExtra(EXTRA_PERCORSO, percorsoId)
        }, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Solo un link vero si apre: un testo («il quaderno rosso») resta un testo. */
    fun link(fonte: String?): Uri? = fonte?.trim()?.takeIf { it.startsWith("http://") || it.startsWith("https://") }?.let(Uri::parse)

    private fun gesto(context: Context, sessione: Long, indice: Int, esito: EsitoPratica) = PendingIntent.getBroadcast(context, ID + 1 + esito.ordinal,
        Intent(context, GestoStudio::class.java).setAction(ESITO).putExtra("sessione", sessione).putExtra("indice", indice).putExtra("esito", esito.name),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun sveglia(context: Context, sessione: Long, indice: Int) = PendingIntent.getBroadcast(context, ID + 9,
        Intent(context, GestoStudio::class.java).setAction(TEMPO).putExtra("sessione", sessione).putExtra("indice", indice),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /**
     * Il blocco corrente. `fine` è quando scade il suo tempo: il conto alla rovescia si vede nella notifica, e la sveglia
     * a quell'ora fa vibrare. `allarme` = è la sveglia che la ridisegna, e allora vibra.
     */
    @android.annotation.SuppressLint("MissingPermission")
    fun mostra(context: Context, sessione: Long, percorsoId: Long, schermata: String, b: Pratica.Blocco, indice: Int, totale: Int,
               fine: Long, allarme: Boolean = false, misura: MisuraFronte = MisuraFronte.VELOCITA) {
        canali(context)
        val scaduto = System.currentTimeMillis() >= fine
        val apri = link(b.fonte)?.let { u ->
            PendingIntent.getActivity(context, ID + 8, Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        } ?: apriApp(context, percorsoId, schermata)
        val veloce = misura == MisuraFronte.VELOCITA
        val testo = b.etichetta + when { b.ripasso -> " · ripasso"; veloce -> " · a ${b.velocita}%"; else -> "" }
        val n = NotificationCompat.Builder(context, if (allarme) CANALE_TEMPO else CANALE)
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentTitle("Studio ${indice + 1}/$totale · ${b.minuti} min" + if (scaduto) " · tempo" else "")
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo + (if (b.fonte != null) "\nTocca per aprire la fonte" else "") +
                if (veloce) "\nCom'è andata? Pulito alza la velocità la prossima volta; errori la tiene." else "\nCom'è andata? Fatto fa salire il pezzo di un gradino."))
            .setOngoing(true)
            .setOnlyAlertOnce(!allarme)
            .setSilent(!allarme)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setWhen(fine).setUsesChronometer(!scaduto).setChronometerCountDown(true).setShowWhen(true)
            .setContentIntent(apri)
            .addAction(0, misura.esiti[0], gesto(context, sessione, indice, EsitoPratica.PULITO))
            .addAction(0, misura.esiti[1], gesto(context, sessione, indice, EsitoPratica.ERRORI))
            .addAction(0, misura.esiti[2], gesto(context, sessione, indice, EsitoPratica.SALTATO))
            .build()
        try { NotificationManagerCompat.from(context).notify(ID, n) } catch (_: SecurityException) { return }
        if (!scaduto) {
            val am = context.getSystemService(AlarmManager::class.java)
            val pi = sveglia(context, sessione, indice)
            if (Battiti.esatte(context)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fine, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fine, pi)
        }
    }

    /** Finita: la notifica fissa se ne va, al suo posto il resoconto, che si scorre via. */
    @android.annotation.SuppressLint("MissingPermission")
    fun finita(context: Context, percorsoId: Long, schermata: String, titolo: String, righe: List<String>) {
        togli(context)
        if (righe.isEmpty()) return
        canali(context)
        val n = NotificationCompat.Builder(context, CANALE)
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentTitle(titolo)
            .setContentText(righe.first())
            .setStyle(NotificationCompat.InboxStyle().also { s -> righe.take(8).forEach { s.addLine(it) } })
            .setAutoCancel(true)
            .setContentIntent(apriApp(context, percorsoId, schermata))
            .build()
        try { NotificationManagerCompat.from(context).notify(ID, n) } catch (_: SecurityException) {}
    }

    fun togli(context: Context) {
        NotificationManagerCompat.from(context).cancel(ID)
        context.getSystemService(AlarmManager::class.java).cancel(sveglia(context, 0, 0))
    }

    /** Lo schermo del fronte: il pilastro del percorso. */
    fun schermata(pilastro: it.resonance.adam.dati.Pilastro) = pilastro.name

    /** Dopo un esito, dall'app o dalla notifica: la notifica segue la stessa strada. */
    suspend fun dopo(context: Context, archivio: Archivio, passo: Archivio.Passo) {
        val per = archivio.db.percorsi().elenco().find { it.id == passo.sessione.percorsoId } ?: return togli(context)
        val b = passo.prossimo
        if (b != null) mostra(context, passo.sessione.id, per.id, schermata(per.pilastro), b, passo.indice, passo.totale,
            System.currentTimeMillis() + b.minuti * 60_000L, misura = per.misura)
        else finita(context, per.id, schermata(per.pilastro), "Studio finito · ${Pratica.minutiFatti(passo.sessione.inizio, passo.sessione.fine ?: System.currentTimeMillis())} min",
            passo.resoconto)
    }

    // ── La mappa del tempo (V3 fase 5, logica/Tempo.kt): la proposta nel buco, e lo studio che parte dalla notifica ──

    private fun intentProposta(context: Context) = PendingIntent.getBroadcast(context, ID_PROPOSTA,
        Intent(context, GestoStudio::class.java).setAction(PROPONI), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** La sveglia della proposta, all'inizio del buco. Una al giorno: la nuova sostituisce la vecchia. */
    fun programmaProposta(context: Context, quando: java.time.LocalDateTime) {
        val ms = quando.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        if (ms <= System.currentTimeMillis()) return
        val am = context.getSystemService(AlarmManager::class.java)
        if (Battiti.esatte(context)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, intentProposta(context))
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, intentProposta(context))
    }

    private fun avvia(context: Context, percorso: Long, minuti: Int) = PendingIntent.getBroadcast(context, ID_PROPOSTA + minuti,
        Intent(context, GestoStudio::class.java).setAction(AVVIA).putExtra("percorso", percorso).putExtra("minuti", minuti),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /**
     * All'ora del buco il programma ricontrolla (il calendario può essere cambiato, il Ghost può essere via o già a
     * studiare) e, se il tempo c'è davvero, propone il fronte e il pezzo più urgenti con due durate. Un tocco e parte.
     */
    @android.annotation.SuppressLint("MissingPermission")
    suspend fun proponi(context: Context, archivio: Archivio, adesso: java.time.LocalDateTime = java.time.LocalDateTime.now()) {
        if (archivio.assenzaInCorso() != null || archivio.db.pratica().inCorso() != null) return
        val eventi = (it.resonance.adam.mondo.MondoAndroid(context).agenda(adesso.toLocalDate(), 1) as? it.resonance.adam.logica.AgendaLetta.Letta)?.eventi.orEmpty()
        val libero = it.resonance.adam.logica.Tempo.adesso(eventi, adesso) as? it.resonance.adam.logica.Tempo.Adesso.Libero ?: return
        val tutto = it.resonance.adam.logica.Tempo.daStudiare(libero.minuti)
        if (tutto < it.resonance.adam.logica.Tempo.MINIMO) return
        val i = archivio.istantanea(adesso.toLocalDate())
        val p = it.resonance.adam.logica.Fronti.prossimo(i.percorsi, i.nodi, i.oggi) ?: return
        val corto = minOf(tutto, 20)
        canali(context)
        val testo = "${p.pezzo.etichetta} · ${it.resonance.adam.logica.Pratica.fase(p.pezzo).etichetta}" +
            (p.pezzo.velocita?.takeIf { p.percorso.misura == MisuraFronte.VELOCITA }?.let { " a $it%" } ?: "") + "\n" + it.resonance.adam.logica.Tempo.riga(libero) + ". Il piano lo fa il programma."
        val n = NotificationCompat.Builder(context, Battiti.CANALE)
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentTitle("Hai ${libero.minuti.coerceAtMost(600)}′: «${p.percorso.titolo}»?")
            .setContentText(testo.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setAutoCancel(true)
            .setContentIntent(apriApp(context, p.percorso.id, schermata(p.percorso.pilastro)))
            .addAction(0, "Studia $corto′", avvia(context, p.percorso.id, corto))
            .apply { if (tutto > corto) addAction(0, "Studia $tutto′", avvia(context, p.percorso.id, tutto)) }
            .addAction(0, "Non ora", PendingIntent.getBroadcast(context, ID_PROPOSTA + 1, Intent(context, GestoStudio::class.java).setAction(NON_ORA), PendingIntent.FLAG_IMMUTABLE))
            .build()
        try { NotificationManagerCompat.from(context).notify(ID_PROPOSTA, n) } catch (_: SecurityException) {}
    }

    internal suspend fun gesto(context: Context, intent: Intent) {
        val archivio = Archivio(Db.di(context))
        when (intent.action) {
            PROPONI -> return proponi(context, archivio)
            NON_ORA -> return NotificationManagerCompat.from(context).cancel(ID_PROPOSTA)
            AVVIA -> {
                NotificationManagerCompat.from(context).cancel(ID_PROPOSTA)
                val per = archivio.db.percorsi().elenco().find { it.id == intent.getLongExtra("percorso", -1) } ?: return
                val s = archivio.apriSessione(per.id, intent.getIntExtra("minuti", 20), LocalDate.now()) ?: return
                val piano = Pratica.decodifica(s.piano)
                return mostra(context, s.id, per.id, schermata(per.pilastro), piano.first(), 0, piano.size, System.currentTimeMillis() + piano.first().minuti * 60_000L, misura = per.misura)
            }
        }
        val id = intent.getLongExtra("sessione", -1)
        val indice = intent.getIntExtra("indice", -1)
        val s = archivio.db.pratica().sessione(id)?.takeIf { it.fine == null } ?: return togli(context)
        // Un gesto vecchio (la notifica ridisegnata nel frattempo, un doppio tocco) non segna il blocco dopo.
        val piano = Pratica.decodifica(s.piano)
        val fatti = archivio.db.pratica().esitiDi(s.id).size
        if (fatti != indice) return
        when (intent.action) {
            ESITO -> {
                val esito = runCatching { EsitoPratica.valueOf(intent.getStringExtra("esito").orEmpty()) }.getOrNull() ?: return
                archivio.segnaBlocco(s.id, esito, null, LocalDate.now())?.let { dopo(context, archivio, it) }
            }
            TEMPO -> {
                val per = archivio.db.percorsi().elenco().find { it.id == s.percorsoId } ?: return
                val b = piano.getOrNull(indice) ?: return
                mostra(context, s.id, per.id, schermata(per.pilastro), b, indice, piano.size, System.currentTimeMillis(), allarme = true, misura = per.misura)
            }
        }
    }
}

class GestoStudio : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val attesa = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try { Studio.gesto(context.applicationContext, intent) } finally { attesa.finish() }
        }
    }
}
