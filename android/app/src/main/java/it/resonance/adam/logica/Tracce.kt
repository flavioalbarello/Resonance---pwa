package it.resonance.adam.logica

import it.resonance.adam.dati.Stanza
import it.resonance.adam.dati.Traccia
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// Il terreno di Adam City (riunione del 01/10/2026). Il motore è la stigmergia: chi agisce lascia una traccia, chi arriva
// dopo si adatta da solo, il programma rinforza le tracce seguite davvero e fa svanire le altre. Nessun coordinatore.
// Il programma fa quattro gesti, uguali per ogni ambito: deposita, fa leggere, rinforza, fa svanire. Per un argomento
// nuovo cambia solo l'ambito, non il codice. Qui c'è solo ciò che va controllato (regola di costruzione del 01/10):
// la forma, la finestra in cui un fatto vale, la forza che cala col tempo. Che cosa la traccia voglia dire lo legge lo
// Shell come testo. Conflitti fra tracce: non si risolvono, si mostrano.
object Tracce {
    const val COSA_MAX = 120
    const val DURATA_MAX = 60
    const val FORZA_INIZIALE = 1.0
    const val FORZA_MAX = 5.0
    const val RINFORZO = 1.0

    private val AMBITO = Regex("^[a-zàèéìòù]{2,20}$")

    // I fatti che possono rinforzare: righe vere dell'archivio, mai una frase. Il programma controlla che esistano.
    val FONTI = setOf("voce", "spunta", "misura", "documento")

    data class Prova(val fonte: String, val id: Long, val giorno: LocalDate) {
        val chiave get() = "$fonte:$id"
    }

    fun aperta(s: Stanza, oggi: LocalDate) =
        s.uscita == null && (s.scade == null || !oggi.isAfter(LocalDate.parse(s.scade)))

    /** Ciò che rende una traccia non una traccia. Vuoto = si può depositare. Lo stesso elenco si può dire al modello. */
    fun difetti(stanza: Stanza?, ambito: String, cosa: String, durata: Int, oggi: LocalDate): List<String> = buildList {
        if (stanza == null) add("la stanza non esiste: una stanza nasce dal gesto di chi ci entra")
        else if (!aperta(stanza, oggi)) add("sei uscito dalla stanza «${stanza.nome}»")
        if (!AMBITO.matches(ambito)) add("l'ambito è una parola sola, minuscola (cena, spesa, casa, musica)")
        if (cosa.isBlank()) add("manca che cosa dice")
        if (cosa.length > COSA_MAX) add("che cosa dice sta in una riga: al massimo $COSA_MAX caratteri")
        if ('\n' in cosa) add("che cosa dice sta in una riga")
        // Una traccia non chiede niente a nessuno: se aspetta una risposta è un impegno a due, e va in calendario.
        if (cosa.trim().endsWith("?")) add("una traccia non fa domande: se aspetta una risposta è un impegno a due")
        if (durata !in 1..DURATA_MAX) add("quanto vive: da 1 a $DURATA_MAX giorni")
    }

    fun deposita(stanza: Stanza, chi: String, ambito: String, cosa: String, quando: LocalDate, durata: Int, ora: Long) =
        Traccia(stanzaId = stanza.id, chi = chi, ambito = ambito, cosa = cosa.trim(), quando = quando.toString(), durata = durata, forza = FORZA_INIZIALE, deposta = ora)

    private fun base(t: Traccia) = LocalDate.parse(t.rinforzata ?: t.quando)

    /** La forza di oggi: cala in linea retta dall'ultimo rinforzo (o dal giorno in cui vale) fino a zero in `durata` giorni. */
    fun forza(t: Traccia, oggi: LocalDate): Double {
        if (t.svanita != null) return 0.0
        val passati = ChronoUnit.DAYS.between(base(t), oggi)
        if (passati <= 0) return t.forza
        return (t.forza * (1.0 - passati.toDouble() / t.durata)).coerceAtLeast(0.0)
    }

    fun viva(t: Traccia, oggi: LocalDate) = forza(t, oggi) > 0.0

    /** Le tracce che il programma fa leggere: vive, nelle stanze aperte, le più forti prima. */
    fun daLeggere(tracce: List<Traccia>, stanze: List<Stanza>, oggi: LocalDate): List<Traccia> {
        val aperte = stanze.filter { aperta(it, oggi) }.map { it.id }.toSet()
        return tracce.filter { it.stanzaId in aperte && viva(it, oggi) }.sortedByDescending { forza(it, oggi) }
    }

    /**
     * Rinforzo da un fatto. Il fatto vale se è di una fonte ammessa, non è già stato usato per questa traccia, e cade
     * nella finestra in cui la traccia è viva (dal giorno in cui vale fino a quando svanirebbe). Il chiamante ha già
     * controllato che il fatto esista nell'archivio. Restituisce la traccia rinforzata, o il motivo del rifiuto.
     */
    fun rinforza(t: Traccia, p: Prova, oggi: LocalDate): Result<Traccia> {
        if (t.svanita != null) return Result.failure(IllegalStateException("la traccia è svanita il ${t.svanita}"))
        if (p.fonte !in FONTI) return Result.failure(IllegalArgumentException("un rinforzo viene da un fatto dell'archivio (${FONTI.joinToString()}), non da «${p.fonte}»"))
        if (p.chiave in t.prove.lines()) return Result.failure(IllegalArgumentException("questo fatto ha già rinforzato la traccia"))
        if (p.giorno.isAfter(oggi)) return Result.failure(IllegalArgumentException("il fatto è nel futuro"))
        val da = LocalDate.parse(t.quando)
        val fino = base(t).plusDays(t.durata.toLong())
        if (p.giorno.isBefore(da) || !p.giorno.isBefore(fino)) return Result.failure(IllegalArgumentException("il fatto del ${p.giorno} cade fuori dalla vita della traccia ($da – ${fino.minusDays(1)})"))
        // Prima di aggiungere, la forza si porta a quella di oggi: un rinforzo tardivo non resuscita la forza intera.
        val nuova = (forza(t, p.giorno) + RINFORZO).coerceAtMost(FORZA_MAX)
        val giorno = maxOf(p.giorno, LocalDate.parse(t.rinforzata ?: t.quando))
        return Result.success(t.copy(forza = nuova, rinforzata = giorno.toString(), prove = (t.prove.lines().filter { it.isNotBlank() } + p.chiave).joinToString("\n")))
    }

    /** Le tracce da segnare svanite oggi. Restano nell'archivio (Legge 14): escono solo da ciò che si legge. */
    fun daSvanire(tracce: List<Traccia>, oggi: LocalDate): List<Traccia> =
        tracce.filter { it.svanita == null && !viva(it, oggi) }.map { it.copy(svanita = oggi.toString()) }

    /** Come lo Shell le legge: testo, una riga per traccia. Il senso lo dà lui; i conflitti non si risolvono, si mostrano. */
    fun perLoShell(tracce: List<Traccia>, stanze: List<Stanza>, oggi: LocalDate): String {
        val nomi = stanze.associate { it.id to it.nome }
        return daLeggere(tracce, stanze, oggi).joinToString("\n") { t ->
            "- [${nomi[t.stanzaId]} · ${t.ambito}] ${t.chi}: ${t.cosa} (dal ${t.quando}, forza ${"%.1f".format(java.util.Locale.ROOT, forza(t, oggi))})"
        }
    }
}
