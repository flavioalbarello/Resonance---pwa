package it.resonance.adam.logica

import it.resonance.adam.dati.EsitoBlocco
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.StatoNodo
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// La pratica guidata (V3, 14/10/2026, PROGETTO_V3.md). Il Ghost: «a volte non ho quei 15 minuti, o non mi va, a volte
// ne ho 30 o due ore; il rituale non dice nulla sulla qualità, e quel tempo non è guidato né ottimizzato». Qui il
// programma decide COSA studiare col tempo che c'è (scadenza, stato dei brani, ultima volta), e misura COME è andata:
// la velocità suonata pulita, in % dell'originale, che è il numero che il Ghost vede già su Moises o YouTube.
// Il modello aggiunge il come (un consiglio di tecnica); il piano e la misura sono del programma.
object Pratica {
    const val INIZIO = 70          // la prima velocità di un passaggio nuovo
    const val PASSO = 5            // quanto sale dopo una sessione pulita
    const val A_TEMPO = 100
    const val PRONTO_DI_FILA = 2   // pulito al 100% due volte di fila: pronto
    const val BLOCCO = 8           // minuti di un blocco, di solito
    const val BLOCCO_MIN = 5
    const val RIPASSO_DOPO = 7     // giorni dopo i quali un pezzo pronto torna per non perderlo

    enum class Fase(val etichetta: String, val stato: StatoNodo) {
        DA_IMPARARE("da imparare", StatoNodo.NON_INIZIATO), LENTO("pulito lento", StatoNodo.INTRODOTTO),
        A_TEMPO("quasi a tempo", StatoNodo.PRATICATO), PRONTO("pronto", StatoNodo.CONSOLIDATO)
    }

    // Senza velocità misurata conta lo stato del nodo: un percorso che c'era già (o che non è musica) non riparte da zero.
    fun fase(n: Nodo): Fase = when {
        n.velocita == null -> when (n.stato) {
            StatoNodo.NON_INIZIATO -> Fase.DA_IMPARARE
            StatoNodo.INTRODOTTO -> Fase.LENTO
            StatoNodo.PRATICATO -> Fase.A_TEMPO
            StatoNodo.CONSOLIDATO -> Fase.PRONTO
        }
        n.velocita >= A_TEMPO && n.puliteDiFila >= PRONTO_DI_FILA -> Fase.PRONTO
        n.velocita >= 85 -> Fase.A_TEMPO
        else -> Fase.LENTO
    }

    /** La velocità a cui provare la prossima volta: l'ultima pulita più un passo, al massimo l'originale. */
    fun obiettivo(n: Nodo): Int = n.velocita?.let { minOf(A_TEMPO, it + if (it >= A_TEMPO) 0 else PASSO) } ?: when (fase(n)) {
        Fase.A_TEMPO -> 85
        Fase.PRONTO -> A_TEMPO
        else -> INIZIO
    }

    /**
     * Quanto un pezzo chiede di essere studiato adesso. Prima ciò che non è pronto, e fra questi ciò che è più indietro
     * e più trascurato; la scadenza vicina alza tutto. Un pezzo pronto torna solo dopo RIPASSO_DOPO giorni, per non perderlo.
     */
    fun urgenza(n: Nodo, oggi: LocalDate, scadenza: LocalDate?): Double {
        // Un pezzo mai suonato non si sta perdendo: niente trascuratezza. Così con 10 minuti si porta avanti ciò che è
        // già in mano, e i pezzi nuovi entrano quando il tempo basta per più blocchi.
        val trascurato = n.ultimaPratica?.let { ChronoUnit.DAYS.between(LocalDate.parse(it), oggi).toDouble() } ?: 0.0
        val fretta = scadenza?.let { s -> val g = ChronoUnit.DAYS.between(oggi, s).coerceAtLeast(1); 1.0 + 30.0 / g } ?: 1.0
        return when (fase(n)) {
            Fase.PRONTO -> if (trascurato >= RIPASSO_DOPO) 1.0 + trascurato / 30.0 else 0.0
            Fase.DA_IMPARARE -> (3.0 + trascurato / 10.0) * fretta
            Fase.LENTO -> (4.0 + trascurato / 7.0) * fretta
            Fase.A_TEMPO -> (2.5 + trascurato / 7.0) * fretta
        }
    }

    @Serializable
    data class Blocco(val nodoId: Long, val etichetta: String, val minuti: Int, val velocita: Int, val ripasso: Boolean, val fonte: String?,
                      // La velocità pulita all'inizio, per dire dopo «75 → 80%»: il piano la fotografa.
                      val prima: Int? = null)

    /**
     * Il piano per il tempo che c'è. Con poco tempo, un blocco solo sul pezzo più urgente; con più tempo, blocchi da
     * BLOCCO minuti sui pezzi più urgenti, e se c'è un pezzo pronto da ripassare l'ultimo blocco è per lui. Il tempo
     * avanzato va ai blocchi di lavoro, non al ripasso.
     */
    fun piano(pezzi: List<Nodo>, minuti: Int, oggi: LocalDate, scadenza: LocalDate?): List<Blocco> {
        if (minuti < BLOCCO_MIN || pezzi.isEmpty()) return emptyList()
        val ordinati = pezzi.map { it to urgenza(it, oggi, scadenza) }.filter { it.second > 0.0 }.sortedByDescending { it.second }.map { it.first }
        if (ordinati.isEmpty()) return emptyList()
        val lavoro = ordinati.filter { fase(it) != Fase.PRONTO }
        val ripasso = ordinati.firstOrNull { fase(it) == Fase.PRONTO }
        val quanti = (minuti / BLOCCO).coerceAtLeast(1)
        val conRipasso = ripasso != null && quanti >= 3 && lavoro.isNotEmpty()
        val scelti = (lavoro.take(quanti - if (conRipasso) 1 else 0).ifEmpty { listOfNotNull(ripasso) })
        val minRipasso = if (conRipasso) BLOCCO_MIN else 0
        val perLavoro = (minuti - minRipasso) / scelti.size
        val resto = (minuti - minRipasso) - perLavoro * scelti.size
        val blocchi = scelti.mapIndexed { i, n ->
            Blocco(n.id, n.etichetta, perLavoro + if (i == 0) resto else 0, obiettivo(n), fase(n) == Fase.PRONTO, n.fonte, n.velocita)
        }
        return if (conRipasso) blocchi + Blocco(ripasso!!.id, ripasso.etichetta, minRipasso, A_TEMPO, true, ripasso.fonte, ripasso.velocita) else blocchi
    }

    /**
     * Dopo un blocco: pulito a una velocità alza il record e, al 100%, conta le pulite di fila; errori azzerano la fila
     * ma non tolgono il record (si riprova la stessa velocità); saltato non cambia niente tranne il giorno. Lo stato del
     * nodo segue la fase, così percorsi e Specchio lo vedono senza saperne niente.
     */
    fun dopo(n: Nodo, esito: EsitoPratica, velocita: Int, oggi: LocalDate): Nodo {
        val nuovo = when (esito) {
            EsitoPratica.PULITO -> n.copy(velocita = maxOf(n.velocita ?: 0, velocita),
                puliteDiFila = if (velocita >= A_TEMPO) n.puliteDiFila + 1 else n.puliteDiFila)
            EsitoPratica.ERRORI -> n.copy(puliteDiFila = 0)
            EsitoPratica.SALTATO -> n
        }.copy(ultimaPratica = if (esito == EsitoPratica.SALTATO) n.ultimaPratica else oggi.toString())
        return nuovo.copy(stato = fase(nuovo).stato)
    }

    /** I pezzi che si studiano in un fronte: le foglie (i passaggi, o i brani che non ne hanno). */
    fun pezzi(nodi: List<Nodo>): List<Nodo> = nodi.filter { n -> nodi.none { it.genitoreId == n.id } }

    /** Una riga per il fronte: quanti pronti, e a che punto è la scadenza. */
    fun riga(pezzi: List<Nodo>, oggi: LocalDate, scadenza: LocalDate?): String {
        val pronti = pezzi.count { fase(it) == Fase.PRONTO }
        val base = "$pronti pronti su ${pezzi.size}"
        val giorni = scadenza?.let { ChronoUnit.DAYS.between(oggi, it) } ?: return base
        return "$base · " + when {
            giorni < 0 -> "scadenza passata"
            giorni == 0L -> "è oggi"
            else -> "mancano $giorni giorni"
        }
    }

    // ── La sessione in corso (fase 2): il piano si tiene com'era stato dato, l'esito di ogni blocco lo fa avanzare ──

    private val json = Json { ignoreUnknownKeys = true }
    fun codifica(piano: List<Blocco>): String = json.encodeToString(piano)
    fun decodifica(testo: String): List<Blocco> = runCatching { json.decodeFromString<List<Blocco>>(testo) }.getOrDefault(emptyList())

    /** Il blocco a cui si è: uno per esito già dato. Null quando il piano è finito. */
    fun corrente(piano: List<Blocco>, esiti: List<EsitoBlocco>): Blocco? = piano.getOrNull(esiti.size)

    /** I minuti davvero passati, che diventano una misura PRATICA: è quella che spunta il rituale da solo. */
    fun minutiFatti(inizio: Long, fine: Long): Int = ((fine - inizio) / 60_000).toInt().coerceIn(0, 960)

    /** Cosa è cambiato, blocco per blocco: ciò che la sessione restituisce subito dopo. Saltato si dice, non si nasconde. */
    fun resoconto(piano: List<Blocco>, esiti: List<EsitoBlocco>): List<String> = esiti.mapIndexed { i, e ->
        val b = piano.getOrNull(i)
        val nome = b?.etichetta ?: "?"
        val era = b?.prima
        when (e.esito) {
            EsitoPratica.SALTATO -> "$nome: saltato"
            EsitoPratica.ERRORI -> "$nome: errori a ${e.velocita}%" + (era?.let { " (resta $it%)" } ?: "")
            EsitoPratica.PULITO -> "$nome: pulito a ${e.velocita}%" + when {
                era == null -> " (prima volta)"
                e.velocita > era -> " (era $era%)"
                else -> ""
            }
        }
    }

    /** La scadenza come la scrive il Ghost: 2026-12-20, 20/12/2026, 20/12/26, 20.12, 20/12 (la prossima). */
    fun leggiData(testo: String, oggi: LocalDate): LocalDate? {
        val t = testo.trim()
        runCatching { return LocalDate.parse(t) }
        val m = Regex("""^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$""").find(t) ?: return null
        val (g, me, a) = m.destructured
        return runCatching {
            if (a.isNotEmpty()) LocalDate.of(if (a.length == 2) 2000 + a.toInt() else a.toInt(), me.toInt(), g.toInt())
            else LocalDate.of(oggi.year, me.toInt(), g.toInt()).let { if (it.isBefore(oggi)) it.plusYears(1) else it }
        }.getOrNull()
    }
}
