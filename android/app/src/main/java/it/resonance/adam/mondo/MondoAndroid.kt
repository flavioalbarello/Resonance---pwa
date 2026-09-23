package it.resonance.adam.mondo

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import android.provider.CalendarContract.Instances
import androidx.core.content.ContextCompat
import it.resonance.adam.cervello.Mondo
import it.resonance.adam.dati.Esecuzione
import it.resonance.adam.logica.Agenda
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Evento
import it.resonance.adam.logica.Proposta
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

class MondoAndroid(context: Context) : Mondo {
    val calendario = Calendario(context.applicationContext)
    val posta = Posta(context.applicationContext)

    override suspend fun agenda(da: LocalDate, giorni: Int) = calendario.leggi(da, giorni)

    override suspend fun esegui(p: Proposta): Esecuzione = when (p) {
        is Proposta.CreaEvento -> calendario.crea(p)
        is Proposta.ScriviMail -> posta.apri(p)
        else -> Esecuzione(false, "Non eseguito: non è un'azione verso il mondo")
    }
}

// Il calendario di sistema: è lo stesso che Google Calendar sincronizza. Nessun accesso Google da configurare.
class Calendario(private val context: Context) {
    private val zona get() = ZoneId.systemDefault()

    fun puoLeggere() = concesso(Manifest.permission.READ_CALENDAR)
    fun puoScrivere() = concesso(Manifest.permission.WRITE_CALENDAR) && puoLeggere()
    private fun concesso(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED

    suspend fun leggi(da: LocalDate, giorni: Int): AgendaLetta = withContext(Dispatchers.IO) {
        if (!puoLeggere()) return@withContext AgendaLetta.Negata("il Ghost non ha dato il permesso al calendario (Setup → Calendario e posta)")
        val n = giorni.coerceIn(1, 31)
        val inizio = da.atStartOfDay()
        val fine = da.plusDays(n.toLong()).atStartOfDay()
        val uri = Instances.CONTENT_URI.buildUpon().also {
            ContentUris.appendId(it, inizio.atZone(zona).toInstant().toEpochMilli())
            ContentUris.appendId(it, fine.atZone(zona).toInstant().toEpochMilli())
        }.build()
        val colonne = arrayOf(Instances.TITLE, Instances.BEGIN, Instances.END, Instances.ALL_DAY, Instances.EVENT_LOCATION,
            Instances.CALENDAR_DISPLAY_NAME, Instances.STATUS)
        try {
            val eventi = mutableListOf<Evento>()
            context.contentResolver.query(uri, colonne, "${Instances.VISIBLE} = 1", null, "${Instances.BEGIN} ASC")?.use { c ->
                while (c.moveToNext()) {
                    if (!c.isNull(6) && c.getInt(6) == Events.STATUS_CANCELED) continue
                    val tutto = c.getInt(3) == 1
                    eventi += Evento(
                        titolo = c.getString(0).orEmpty().ifBlank { "(senza titolo)" },
                        inizio = ora(c.getLong(1), tutto), fine = ora(c.getLong(2), tutto), tuttoIlGiorno = tutto,
                        luogo = c.getString(4).orEmpty(), calendario = c.getString(5).orEmpty(),
                    )
                }
            } ?: return@withContext AgendaLetta.Negata("il calendario del telefono non ha risposto")
            AgendaLetta.Letta(da, n, eventi.filter { it.inizio < fine && it.fine > inizio })
        } catch (e: SecurityException) {
            AgendaLetta.Negata("permesso al calendario revocato")
        }
    }

    // Gli eventi di tutto il giorno il calendario li tiene a mezzanotte UTC: letti in ora locale cambierebbero giorno.
    private fun ora(ms: Long, tuttoIlGiorno: Boolean): LocalDateTime =
        Instant.ofEpochMilli(ms).atZone(if (tuttoIlGiorno) ZoneOffset.UTC else zona).toLocalDateTime()

    private fun ms(t: LocalDateTime, tuttoIlGiorno: Boolean) = t.atZone(if (tuttoIlGiorno) ZoneOffset.UTC else zona).toInstant().toEpochMilli()

    data class Scelto(val id: Long, val nome: String)

    // Il principale dell'account Google se c'è; altrimenti il primo in cui si può scrivere.
    private fun principale(): Scelto? {
        val colonne = arrayOf(Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME, Calendars.ACCOUNT_TYPE,
            Calendars.OWNER_ACCOUNT, Calendars.IS_PRIMARY)
        data class Riga(val id: Long, val nome: String, val punti: Int)
        val righe = mutableListOf<Riga>()
        context.contentResolver.query(Calendars.CONTENT_URI, colonne,
            "${Calendars.CALENDAR_ACCESS_LEVEL} >= ${Calendars.CAL_ACCESS_CONTRIBUTOR} AND ${Calendars.VISIBLE} = 1", null, null)?.use { c ->
            while (c.moveToNext()) {
                val google = c.getString(3) == "com.google"
                val proprio = c.getString(2) != null && c.getString(2) == c.getString(4)
                val primario = !c.isNull(5) && c.getInt(5) == 1
                righe += Riga(c.getLong(0), c.getString(1).orEmpty(), (if (primario) 4 else 0) + (if (google && proprio) 2 else 0) + (if (google) 1 else 0))
            }
        }
        return righe.maxByOrNull { it.punti }?.let { Scelto(it.id, it.nome) }
    }

    suspend fun crea(p: Proposta.CreaEvento): Esecuzione = withContext(Dispatchers.IO) {
        if (!puoScrivere()) return@withContext Esecuzione(false, "Non messo in calendario: manca il permesso (Setup → Calendario e posta)")
        try {
            val cal = principale() ?: return@withContext Esecuzione(false, "Non messo in calendario: sul telefono non c'è un calendario in cui si possa scrivere")
            val (inizio, fine) = Agenda.inizioFine(p)
            val tutto = p.inizio.trim().length == 10
            val valori = ContentValues().apply {
                put(Events.CALENDAR_ID, cal.id)
                put(Events.TITLE, p.titolo)
                put(Events.DTSTART, ms(inizio, tutto))
                put(Events.DTEND, ms(fine, tutto))
                put(Events.ALL_DAY, if (tutto) 1 else 0)
                put(Events.EVENT_TIMEZONE, if (tutto) "UTC" else zona.id)
                if (p.luogo.isNotBlank()) put(Events.EVENT_LOCATION, p.luogo)
                if (p.note.isNotBlank()) put(Events.DESCRIPTION, p.note)
            }
            val uri = context.contentResolver.insert(Events.CONTENT_URI, valori)
                ?: return@withContext Esecuzione(false, "Non messo in calendario: il calendario ha rifiutato l'inserimento")
            val quando = Agenda.quando(inizio, fine, tutto, LocalDate.now())
            // Si rilegge dalla fonte: la ricevuta dice ciò che il calendario contiene, non ciò che si è chiesto.
            val letto = context.contentResolver.query(uri, arrayOf(Events.TITLE, Events.DTSTART), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0).orEmpty() to c.getLong(1) else null
            }
            when {
                letto == null -> Esecuzione(true, "Inserito in «${cal.nome}», ma rileggendolo non si trova: guarda nel calendario — «${p.titolo}», $quando")
                letto.first != p.titolo || letto.second != ms(inizio, tutto) ->
                    Esecuzione(true, "Inserito in «${cal.nome}», ma riletto diverso da ciò che hai confermato: «${letto.first}» dal ${ora(letto.second, tutto)}. Controlla nel calendario")
                else -> Esecuzione(true, "In calendario «${cal.nome}», riletto: «${p.titolo}», $quando")
            }
        } catch (e: SecurityException) {
            Esecuzione(false, "Non messo in calendario: permesso revocato")
        }
    }
}

// La mail non parte da qui: si apre una bozza e l'invio è un gesto del Ghost su quella mail precisa.
class Posta(private val context: Context) {
    suspend fun apri(p: Proposta.ScriviMail): Esecuzione = withContext(Dispatchers.Main.immediate) {
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")).apply {
            if (p.a.isNotBlank()) putExtra(Intent.EXTRA_EMAIL, arrayOf(p.a))
            putExtra(Intent.EXTRA_SUBJECT, p.oggetto)
            putExtra(Intent.EXTRA_TEXT, p.corpo)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val app = context.packageManager.queryIntentActivities(intent, 0).singleOrNull()?.loadLabel(context.packageManager)?.toString()
        try {
            context.startActivity(intent)
            Esecuzione(true, "Bozza aperta${app?.let { " in $it" } ?: ""}" + (if (p.a.isNotBlank()) " per ${p.a}" else "") +
                " — «${p.oggetto}». Parte solo se premi Invia: l'app non può sapere se l'hai fatto.")
        } catch (e: ActivityNotFoundException) {
            Esecuzione(false, "Mail non preparata: sul telefono non c'è un'app di posta")
        }
    }
}
