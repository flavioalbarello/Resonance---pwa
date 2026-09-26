package it.resonance.adam.mondo

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract.Attendees
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import android.provider.CalendarContract.Instances
import androidx.core.content.ContextCompat
import it.resonance.adam.cervello.Mondo
import it.resonance.adam.dati.Esecuzione
import it.resonance.adam.logica.Agenda
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Bersaglio
import it.resonance.adam.logica.Evento
import it.resonance.adam.logica.Giorni
import it.resonance.adam.logica.Impegni
import it.resonance.adam.logica.Portata
import it.resonance.adam.logica.Proposta
import it.resonance.adam.logica.Ripetizione
import it.resonance.adam.logica.Risoluzione
import it.resonance.adam.logica.Risolutore
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

    override suspend fun risolvi(p: Proposta) = when (p) {
        // Il mittente non si può imporre a Gmail: si dice nella proposta, perché il Ghost lo controlli nella bozza.
        is Proposta.ScriviMail -> it.resonance.adam.logica.Risoluzione.Pronta(p.copy(da = calendario.mittente()))
        else -> calendario.risolvi(p)
    }
    override suspend fun copia(p: Proposta) = calendario.copia(p)

    override suspend fun esegui(p: Proposta): Esecuzione = when (p) {
        is Proposta.CreaEvento -> calendario.crea(p)
        is Proposta.SpostaEvento -> calendario.sposta(p)
        is Proposta.TogliEvento -> calendario.togli(p)
        is Proposta.ScriviMail -> posta.apri(p)
        else -> Esecuzione(false, "Non eseguito: non è un'azione verso il mondo")
    }
}

// Il calendario di sistema: è lo stesso che Google Calendar sincronizza. Nessun accesso Google da configurare.
class Calendario(private val context: Context) {
    private val zona get() = ZoneId.systemDefault()
    private val impostazioni by lazy { it.resonance.adam.Impostazioni(context) }

    fun puoLeggere() = concesso(Manifest.permission.READ_CALENDAR)
    fun puoScrivere() = concesso(Manifest.permission.WRITE_CALENDAR) && puoLeggere()
    private fun concesso(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED

    suspend fun leggi(da: LocalDate, giorni: Int): AgendaLetta = withContext(Dispatchers.IO) {
        if (!puoLeggere()) return@withContext AgendaLetta.Negata("il Ghost non ha dato il permesso al calendario (Setup → Calendario e posta)")
        val n = giorni.coerceIn(1, 31)
        val inizio = da.atStartOfDay()
        val fine = da.plusDays(n.toLong()).atStartOfDay()
        try {
            val eventi = occorrenze(inizio, fine) ?: return@withContext AgendaLetta.Negata("il calendario del telefono non ha risposto")
            AgendaLetta.Letta(da, n, eventi.filter { it.inizio < fine && it.fine > inizio })
        } catch (e: SecurityException) {
            AgendaLetta.Negata("permesso al calendario revocato")
        }
    }

    private val COLONNE = arrayOf(Instances.TITLE, Instances.BEGIN, Instances.END, Instances.ALL_DAY, Instances.EVENT_LOCATION,
        Instances.CALENDAR_DISPLAY_NAME, Instances.STATUS, Instances.EVENT_ID, Instances.RRULE, Instances.ORIGINAL_ID,
        Instances.ORIGINAL_INSTANCE_TIME, Instances.DTSTART, Instances.ORGANIZER, Instances.OWNER_ACCOUNT, Instances.CALENDAR_ACCESS_LEVEL)

    // Le occorrenze vere fra due istanti, serie espanse dal calendario stesso.
    private fun occorrenze(da: LocalDateTime, a: LocalDateTime, soloEvento: Long? = null): List<Evento>? {
        val uri = Instances.CONTENT_URI.buildUpon().also {
            ContentUris.appendId(it, da.atZone(zona).toInstant().toEpochMilli())
            ContentUris.appendId(it, a.atZone(zona).toInstant().toEpochMilli())
        }.build()
        val filtro = "${Instances.VISIBLE} = 1" + (soloEvento?.let { " AND (${Instances.EVENT_ID} = $it OR ${Instances.ORIGINAL_ID} = $it)" } ?: "")
        val regole = mutableMapOf<Long, String>()
        return context.contentResolver.query(uri, COLONNE, filtro, null, "${Instances.BEGIN} ASC")?.use { c ->
            buildList {
                while (c.moveToNext()) {
                    if (!c.isNull(6) && c.getInt(6) == Events.STATUS_CANCELED) continue
                    val tutto = c.getInt(3) == 1
                    val id = c.getLong(7)
                    val propria = c.getString(8).orEmpty()
                    val madre = if (c.isNull(9)) null else c.getLong(9)
                    val regola = if (madre != null) regole.getOrPut(madre) { regolaDi(madre) } else propria
                    val organizzatore = c.getString(12)
                    val proprietario = c.getString(13)
                    add(Evento(
                        titolo = c.getString(0).orEmpty().ifBlank { "(senza titolo)" },
                        inizio = ora(c.getLong(1), tutto), fine = ora(c.getLong(2), tutto), tuttoIlGiorno = tutto,
                        luogo = c.getString(4).orEmpty(), calendario = c.getString(5).orEmpty(),
                        id = id,
                        idSerie = madre ?: id.takeIf { propria.isNotBlank() },
                        eccezione = madre != null,
                        regola = regola,
                        inizioMs = c.getLong(1), fineMs = c.getLong(2),
                        origineMs = if (madre != null && !c.isNull(10)) c.getLong(10) else c.getLong(1),
                        primaDellaSerie = madre == null && propria.isNotBlank() && c.getLong(11) == c.getLong(1),
                        scrivibile = c.getInt(14) >= Calendars.CAL_ACCESS_CONTRIBUTOR,
                        organizzatoDaAltri = organizzatore != null && proprietario != null && !organizzatore.equals(proprietario, ignoreCase = true),
                    ))
                }
            }
        }
    }

    private fun regolaDi(idEvento: Long): String =
        context.contentResolver.query(ContentUris.withAppendedId(Events.CONTENT_URI, idEvento), arrayOf(Events.RRULE), null, null, null)
            ?.use { c -> if (c.moveToFirst()) c.getString(0).orEmpty() else "" }.orEmpty()

    // Chi altro è invitato, oltre al proprietario del calendario: toccarlo lo avviserebbe.
    private fun invitati(e: Evento, proprietario: String?): Int {
        val colonne = arrayOf(Attendees.ATTENDEE_EMAIL)
        return Attendees.query(context.contentResolver, e.id, colonne)?.use { c ->
            var n = 0
            while (c.moveToNext()) {
                val m = c.getString(0)
                if (!m.isNullOrBlank() && !m.equals(proprietario, ignoreCase = true)) n++
            }
            n
        } ?: 0
    }

    private fun proprietario(idEvento: Long): String? =
        context.contentResolver.query(ContentUris.withAppendedId(Events.CONTENT_URI, idEvento), arrayOf(Events.OWNER_ACCOUNT), null, null, null)
            ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }

    suspend fun risolvi(p: Proposta): Risoluzione = withContext(Dispatchers.IO) {
        if (p is Proposta.CreaEvento) {
            if (!puoScrivere()) return@withContext Risoluzione.Domanda("il Ghost non ha dato il permesso di scrivere nel calendario (Setup → Calendario e posta)")
            val cal = runCatching { scelto(null, p.per) }.getOrNull()
                ?: return@withContext Risoluzione.Domanda("il Ghost non ha scelto il calendario per " + (if (p.per == "personale") "i suoi impegni" else "le cose di Adam") +
                    ": chiedigli di sceglierlo in Setup → Calendario e posta")
            return@withContext Risoluzione.Pronta(p.copy(calendarioId = cal.id, calendario = cal.nome))
        }
        val giorno = when (p) { is Proposta.TogliEvento -> p.giorno; is Proposta.SpostaEvento -> p.giorno; else -> return@withContext Risoluzione.Pronta(p) }
        if (!puoScrivere()) return@withContext Risoluzione.Domanda("il Ghost non ha dato il permesso di scrivere nel calendario (Setup → Calendario e posta)")
        try {
            val g = LocalDate.parse(giorno)
            val eventi = occorrenze(g.atStartOfDay(), g.plusDays(1).atStartOfDay())
                ?.map { it.copy(invitati = invitati(it, proprietario(it.id))) }
                ?: return@withContext Risoluzione.Domanda("il calendario del telefono non ha risposto")
            when (val r = Risolutore.risolvi(p, eventi, LocalDate.now())) {
                is Risoluzione.Pronta -> {
                    val t = r.proposta
                    // Per togliere una serie si dice quanti appuntamenti spariscono: un numero, non «tutti».
                    if (t is Proposta.TogliEvento && t.portata != Portata.UNO && t.bersaglio != null) {
                        val b = t.bersaglio
                        val da = if (t.portata == Portata.DA_QUI) b.daIni else LocalDate.now().atStartOfDay()
                        val futuri = occorrenze(da, da.plusYears(1), b.idSerie)?.size
                        Risoluzione.Pronta(t.copy(bersaglio = b.copy(futuri = futuri)))
                    } else r
                }
                is Risoluzione.Domanda -> r
            }
        } catch (e: SecurityException) {
            Risoluzione.Domanda("permesso al calendario revocato")
        }
    }

    private fun bersaglio(p: Proposta) = when (p) { is Proposta.TogliEvento -> p.bersaglio; is Proposta.SpostaEvento -> p.bersaglio; else -> null }

    // Il testo completo di ciò che si sta per togliere o cambiare: finisce nel diario di Adam prima dell'azione.
    suspend fun copia(p: Proposta): String? = withContext(Dispatchers.IO) {
        val b = bersaglio(p) ?: return@withContext null
        val serie = p is Proposta.TogliEvento && p.portata != Portata.UNO
        val id = if (serie) b.idSerie ?: b.idEvento else b.idEvento
        val colonne = arrayOf(Events.TITLE, Events.DTSTART, Events.DTEND, Events.DURATION, Events.RRULE, Events.EVENT_LOCATION,
            Events.DESCRIPTION, Events.ALL_DAY, Events.EVENT_TIMEZONE)
        val cosa = when {
            p is Proposta.SpostaEvento -> "Prima di cambiarlo"
            serie -> "Prima di togliere ${(p as Proposta.TogliEvento).portata!!.etichetta}"
            else -> "Prima di toglierlo"
        }
        runCatching {
            context.contentResolver.query(ContentUris.withAppendedId(Events.CONTENT_URI, id), colonne, null, null, null)?.use { c ->
                if (!c.moveToFirst()) return@use null
                val tutto = c.getInt(7) == 1
                buildString {
                    append("$cosa, dal calendario «${b.calendario}»: «${c.getString(0).orEmpty()}»")
                    if (serie) append(", ${Ripetizione.leggibile(c.getString(4).orEmpty())}, dal ${ora(c.getLong(1), tutto)}")
                    else append(", ${Impegni.quando(b)}")
                    c.getString(5)?.takeIf { it.isNotBlank() }?.let { append(". Luogo: $it") }
                    c.getString(6)?.takeIf { it.isNotBlank() }?.let { append(". Note: $it") }
                    append(". [dati: DTSTART=${c.getLong(1)}")
                    if (!c.isNull(2)) append(" DTEND=${c.getLong(2)}")
                    c.getString(3)?.let { append(" DURATION=$it") }
                    c.getString(4)?.takeIf { it.isNotBlank() }?.let { append(" RRULE=$it") }
                    append(" TZ=${c.getString(8)} ALL_DAY=${if (tutto) 1 else 0}]")
                }
            }
        }.getOrNull()
    }

    // La proposta è stata fatta su un impegno preciso: se nel frattempo è cambiato o sparito, non si tocca niente.
    private fun ancoraLi(b: Bersaglio): Boolean =
        context.contentResolver.query(ContentUris.withAppendedId(Events.CONTENT_URI, b.idEvento), arrayOf(Events.TITLE, Events.DELETED), null, null, null)
            ?.use { c -> c.moveToFirst() && c.getInt(1) == 0 && c.getString(0).orEmpty() == b.titolo } ?: false

    suspend fun togli(p: Proposta.TogliEvento): Esecuzione = withContext(Dispatchers.IO) {
        val b = p.bersaglio ?: return@withContext Esecuzione(false, "Non tolto: la proposta non indica un impegno trovato nel calendario")
        if (!puoScrivere()) return@withContext Esecuzione(false, "Non tolto: manca il permesso di scrivere nel calendario")
        try {
            if (!ancoraLi(b)) return@withContext Esecuzione(false, "Non tolto: «${b.titolo}» è cambiato o sparito dopo la proposta. Richiedilo")
            val cr = context.contentResolver
            val madre = b.idSerie
            when (val portata = p.portata ?: Portata.UNO) {
                Portata.UNO -> when {
                    b.eccezione -> cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, b.idEvento),
                        ContentValues().apply { put(Events.STATUS, Events.STATUS_CANCELED) }, null, null)
                    madre != null -> cr.insert(ContentUris.withAppendedId(Events.CONTENT_EXCEPTION_URI, madre), ContentValues().apply {
                        put(Events.ORIGINAL_INSTANCE_TIME, b.origineMs)
                        put(Events.STATUS, Events.STATUS_CANCELED)
                    })
                    else -> cr.delete(ContentUris.withAppendedId(Events.CONTENT_URI, b.idEvento), null, null)
                }
                Portata.DA_QUI, Portata.SERIE -> {
                    madre ?: return@withContext Esecuzione(false, "Non tolto: «${b.titolo}» non è una serie")
                    if (portata == Portata.SERIE || b.primaDellaSerie) cr.delete(ContentUris.withAppendedId(Events.CONTENT_URI, madre), null, null)
                    else {
                        val nuova = Ripetizione.finoA(regolaDi(madre), ora(b.origineMs, b.tuttoIlGiorno), b.tuttoIlGiorno, zona)
                        cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, madre), ContentValues().apply { put(Events.RRULE, nuova) }, null, null)
                        // Le occorrenze già spostate dopo quel giorno sono eventi a sé: vanno tolte anche loro.
                        cr.delete(Events.CONTENT_URI, "${Events.ORIGINAL_ID} = ? AND ${Events.ORIGINAL_INSTANCE_TIME} >= ?",
                            arrayOf(madre.toString(), b.origineMs.toString()))
                    }
                }
            }
            // Rilettura: nel periodo toccato non deve restare nessuna occorrenza di quell'impegno.
            val da = b.daIni.toLocalDate().atStartOfDay()
            val restano = when (p.portata ?: Portata.UNO) {
                Portata.UNO -> occorrenze(da, da.plusDays(1), madre ?: b.idEvento)?.count { it.inizioMs == b.inizioMs && it.titolo == b.titolo }
                Portata.DA_QUI -> occorrenze(da, da.plusYears(1), madre)?.size
                Portata.SERIE -> occorrenze(LocalDate.now().minusYears(1).atStartOfDay(), LocalDate.now().plusYears(1).atStartOfDay(), madre)?.size
            }
            val cosa = when (p.portata ?: Portata.UNO) {
                Portata.UNO -> "«${b.titolo}», ${Impegni.quando(b)}"
                Portata.DA_QUI -> "«${b.titolo}» da ${Giorni.leggibile(b.daIni.toLocalDate().toString())} in poi"
                Portata.SERIE -> "tutta la serie «${b.titolo}»"
            }
            when (restano) {
                0 -> Esecuzione(true, "Tolto dal calendario «${b.calendario}» $cosa. Riletto: non c'è più. Copia nel diario di Adam")
                null -> Esecuzione(true, "Tolto $cosa, ma il calendario non ha risposto alla rilettura: controlla")
                else -> Esecuzione(false, "Chiesto di togliere $cosa, ma rileggendo ce ne sono ancora $restano: controlla nel calendario")
            }
        } catch (e: SecurityException) {
            Esecuzione(false, "Non tolto: permesso revocato")
        }
    }

    suspend fun sposta(p: Proposta.SpostaEvento): Esecuzione = withContext(Dispatchers.IO) {
        val b = p.bersaglio ?: return@withContext Esecuzione(false, "Non cambiato: la proposta non indica un impegno trovato nel calendario")
        if (!puoScrivere()) return@withContext Esecuzione(false, "Non cambiato: manca il permesso di scrivere nel calendario")
        try {
            if (!ancoraLi(b)) return@withContext Esecuzione(false, "Non cambiato: «${b.titolo}» è cambiato o sparito dopo la proposta. Richiedilo")
            val (da, a) = Impegni.nuovoIntervallo(p, b)
            val titolo = p.nuovoTitolo ?: b.titolo
            val valori = ContentValues().apply {
                put(Events.DTSTART, ms(da, b.tuttoIlGiorno))
                put(Events.DTEND, ms(a, b.tuttoIlGiorno))
                p.nuovoTitolo?.let { put(Events.TITLE, it) }
                p.nuovoLuogo?.let { put(Events.EVENT_LOCATION, it) }
            }
            val cr = context.contentResolver
            val madre = b.idSerie
            // Una serie non si sposta tutta: si crea l'eccezione per quella sola occorrenza.
            if (madre != null && !b.eccezione) cr.insert(ContentUris.withAppendedId(Events.CONTENT_EXCEPTION_URI, madre),
                valori.apply { put(Events.ORIGINAL_INSTANCE_TIME, b.origineMs) })
            else cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, b.idEvento), valori, null, null)
            val giorno = da.toLocalDate().atStartOfDay()
            val trovato = occorrenze(giorno, giorno.plusDays(1))?.any { it.titolo == titolo && it.inizio == da }
            when (trovato) {
                true -> Esecuzione(true, "Cambiato in «${b.calendario}». Riletto: «$titolo», ${Agenda.quando(da, a, b.tuttoIlGiorno, LocalDate.now())}. Com'era prima: nel diario di Adam")
                null -> Esecuzione(true, "Cambiato, ma il calendario non ha risposto alla rilettura: controlla")
                false -> Esecuzione(false, "Chiesto di cambiare «${b.titolo}», ma rileggendo non si trova «$titolo» al nuovo orario: controlla nel calendario")
            }
        } catch (e: SecurityException) {
            Esecuzione(false, "Non cambiato: permesso revocato")
        }
    }

    // Gli eventi di tutto il giorno il calendario li tiene a mezzanotte UTC: letti in ora locale cambierebbero giorno.
    private fun ora(ms: Long, tuttoIlGiorno: Boolean): LocalDateTime =
        Instant.ofEpochMilli(ms).atZone(if (tuttoIlGiorno) ZoneOffset.UTC else zona).toLocalDateTime()

    private fun ms(t: LocalDateTime, tuttoIlGiorno: Boolean) = t.atZone(if (tuttoIlGiorno) ZoneOffset.UTC else zona).toInstant().toEpochMilli()

    data class Scelto(val id: Long, val nome: String)

    // Fino al 26/09 il calendario lo sceglieva un punteggio (principale, proprio, Google). Con più account Google i
    // principali pareggiavano, e vinceva il primo letto: un evento di Adam è finito nel calendario professionale.
    // Ora lo sceglie il Ghost, una volta, in Setup; senza scelta non si scrive e lo Shell glielo dice.
    fun scrivibili(): List<Scelto> {
        if (!puoScrivere()) return emptyList()
        val colonne = arrayOf(Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME)
        return context.contentResolver.query(Calendars.CONTENT_URI, colonne,
            "${Calendars.CALENDAR_ACCESS_LEVEL} >= ${Calendars.CAL_ACCESS_CONTRIBUTOR} AND ${Calendars.VISIBLE} = 1", null, null)?.use { c ->
            buildList {
                while (c.moveToNext()) {
                    val nome = c.getString(1).orEmpty()
                    val account = c.getString(2).orEmpty()
                    add(Scelto(c.getLong(0), if (account.isBlank() || account == nome) nome else "$nome · $account"))
                }
            }
        }.orEmpty()
    }

    fun mittente() = impostazioni.mittente

    // Il calendario per chi: le cose di Adam in uno, gli impegni del Ghost in un altro (li sceglie lui in Setup).
    private fun idPer(per: String?) = (if (per == "personale") impostazioni.calendarioPersonaleId else impostazioni.calendarioId).takeIf { it >= 0 }

    private fun scelto(id: Long?, per: String? = null): Scelto? {
        val cercato = id ?: idPer(per) ?: return null
        return scrivibili().find { it.id == cercato }
    }

    suspend fun crea(p: Proposta.CreaEvento): Esecuzione = withContext(Dispatchers.IO) {
        if (!puoScrivere()) return@withContext Esecuzione(false, "Non messo in calendario: manca il permesso (Setup → Calendario e posta)")
        try {
            // Si scrive dove la proposta diceva: ciò che il Ghost ha visto prima di confermare.
            val cal = scelto(p.calendarioId, p.per) ?: return@withContext Esecuzione(false,
                "Non messo in calendario: " + (if (p.calendarioId != null) "il calendario della proposta non c'è più" else "non hai scelto in quale calendario scrivere") +
                    " (Setup → Calendario e posta → Scrivi in)")
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
    suspend fun apri(p: Proposta.ScriviMail): Esecuzione {
        // Con un allegato: il PDF si scrive dal testo CONFERMATO (quello nella proposta) e parte con ACTION_SEND, che a
        // differenza di mailto porta un file. Si prova Gmail; se non c'è, il Ghost sceglie l'app.
        val allegato = p.allegatoTesto?.let { testo ->
            withContext(Dispatchers.IO) {
                val nome = (p.allegato ?: "allegato").replace(Regex("[^\\p{L}\\p{N} _-]+"), "").trim().ifEmpty { "allegato" }.take(60)
                val file = java.io.File(context.filesDir, "allegati/$nome.pdf")
                Pdf.scrivi(file, testo)
                androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.allegati", file)
            }
        }
        return withContext(Dispatchers.Main.immediate) {
            val intent = if (allegato == null) Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")) else Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, allegato)
                clipData = android.content.ClipData.newRawUri(p.allegato, allegato)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            intent.apply {
                if (p.a.isNotBlank()) putExtra(Intent.EXTRA_EMAIL, arrayOf(p.a))
                putExtra(Intent.EXTRA_SUBJECT, p.oggetto)
                putExtra(Intent.EXTRA_TEXT, p.corpo)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val app = if (allegato == null) context.packageManager.queryIntentActivities(intent, 0).singleOrNull()?.loadLabel(context.packageManager)?.toString() else null
            try {
                if (allegato != null) try {
                    context.startActivity(Intent(intent).setPackage("com.google.android.gm"))
                } catch (e: ActivityNotFoundException) {
                    context.startActivity(Intent.createChooser(intent, "Manda con").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } else context.startActivity(intent)
                Esecuzione(true, "Bozza aperta${app?.let { " in $it" } ?: ""}" + (if (p.a.isNotBlank()) " per ${p.a}" else "") +
                    " — «${p.oggetto}»" + (p.allegato?.let { ", con «$it».pdf allegato" } ?: "") + ". Parte solo se premi Invia: l'app non può sapere se l'hai fatto." +
                    (if (p.da.isNotBlank()) " Prima di inviare controlla il mittente: ${p.da}." else ""))
            } catch (e: ActivityNotFoundException) {
                Esecuzione(false, "Mail non preparata: sul telefono non c'è un'app di posta")
            }
        }
    }
}
