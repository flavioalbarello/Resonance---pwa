package it.resonance.adam.logica

import it.resonance.adam.dati.EsitoBlocco
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.MisuraFronte
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Sessione
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.TipoMisura
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs

// Il film della settimana (19/10/2026): ogni domenica, trenta secondi a schermo intero, come le storie. Ogni scena è un
// fatto della settimana calcolato dal programma — minuti suonati, un pezzo diventato pronto, una velocità salita, un
// rituale che ha retto, il sonno, una scoperta — e una scena c'è solo se il fatto c'è: niente riempitivi, niente frasi
// motivazionali. La «stabilità mantenuta» qui si vede: un rituale che regge sta in scena quanto un brano finito.
// L'ultima scena è il Ritratto di Adam (ui/RitrattoUi.kt). La voce dello Shell legge `voce`, scritta dal programma.
object Film {
    enum class Tipo { APERTURA, NUMERO, ELENCO, RITRATTO }

    data class Scena(val tipo: Tipo, val etichetta: String, val grande: String, val sotto: String, val pilastro: Pilastro?, val voce: String)

    private val GIORNO = DateTimeFormatter.ofPattern("d MMMM", Locale.ITALIAN)

    /** La settimana del film: i sette giorni fino a oggi compreso. */
    fun settimana(oggi: LocalDate): ClosedRange<LocalDate> = oggi.minusDays(6)..oggi

    private fun dentro(g: LocalDate, r: ClosedRange<LocalDate>) = !g.isBefore(r.start) && !g.isAfter(r.endInclusive)

    fun scene(i: Istantanea, sessioni: List<Sessione>, esiti: List<EsitoBlocco>, scoperte: List<Scoperte.Scoperta>,
              zona: ZoneId = ZoneId.systemDefault()): List<Scena> = buildList {
        val oggi = i.oggi
        val sett = settimana(oggi)
        val prima = oggi.minusDays(13)..oggi.minusDays(7)
        val giorno = { ms: Long -> Instant.ofEpochMilli(ms).atZone(zona).toLocalDate() }
        add(Scena(Tipo.APERTURA, "La tua settimana", "${sett.start.format(GIORNO)} – ${sett.endInclusive.format(GIORNO)}",
            "Solo ciò che è successo davvero.", null, "La tua settimana, dal ${sett.start.format(GIORNO)} al ${sett.endInclusive.format(GIORNO)}."))

        // Lo studio: i minuti della settimana, e la settimana prima per confronto.
        val pratica = Esiti.serieGiornaliera(i.misure, TipoMisura.PRATICA)
        val minuti = pratica.filter { dentro(it.giorno, sett) }.sumOf { it.valore }
        val minutiPrima = pratica.filter { dentro(it.giorno, prima) }.sumOf { it.valore }
        val nSessioni = sessioni.count { it.fine != null && dentro(giorno(it.inizio), sett) }
        if (minuti > 0) {
            val delta = minuti - minutiPrima
            val confronto = when {
                minutiPrima == 0.0 -> "la settimana prima: niente"
                abs(delta) < 5 -> "come la settimana prima"
                delta > 0 -> "${Esiti.formatta(TipoMisura.PRATICA, delta)} più della settimana prima"
                else -> "${Esiti.formatta(TipoMisura.PRATICA, -delta)} meno della settimana prima"
            }
            add(Scena(Tipo.NUMERO, "Studio", Esiti.formatta(TipoMisura.PRATICA, minuti),
                (if (nSessioni > 0) "$nSessioni " + (if (nSessioni == 1) "sessione" else "sessioni") + " · " else "") + confronto, Pilastro.VIDYA,
                "Hai studiato ${Esiti.formatta(TipoMisura.PRATICA, minuti).replace("h", " ore e ").removeSuffix(" ore e ")}: $confronto."))
        }

        // I pezzi diventati pronti: toccati questa settimana e pronti adesso.
        val pronti = i.nodi.filter { n -> n.ultimaPratica?.let { dentro(LocalDate.parse(it), sett) } == true &&
            (if (i.percorsi.find { it.id == n.percorsoId }?.misura == MisuraFronte.VELOCITA) Pratica.fase(n) == Pratica.Fase.PRONTO else n.stato == StatoNodo.CONSOLIDATO) }
        if (pronti.isNotEmpty()) add(Scena(Tipo.ELENCO, if (pronti.size == 1) "Un pezzo è pronto" else "${pronti.size} pezzi pronti",
            pronti.take(4).joinToString("\n") { it.etichetta }, "da questa settimana", Pilastro.VIDYA,
            (if (pronti.size == 1) "Un pezzo è diventato pronto: " else "${pronti.size} pezzi sono diventati pronti: ") + pronti.take(4).joinToString(", ") { it.etichetta } + "."))

        // La velocità salita di più: il miglior pulito della settimana contro il miglior pulito di prima.
        val inSett = esiti.filter { it.esito == EsitoPratica.PULITO && it.velocita in 1..200 && dentro(giorno(it.istante), sett) }
        val salita = inSett.groupBy { it.nodoId }.mapNotNull { (id, e) ->
            val ora = e.maxOf { it.velocita }
            val era = esiti.filter { it.nodoId == id && it.esito == EsitoPratica.PULITO && it.velocita in 1..200 && giorno(it.istante).isBefore(sett.start) }.maxOfOrNull { it.velocita }
            era?.takeIf { ora > it }?.let { Triple(id, it, ora) }
        }.maxByOrNull { it.third - it.second }
        salita?.let { (id, era, ora) ->
            val nome = i.nodi.find { it.id == id }?.etichetta ?: return@let
            add(Scena(Tipo.NUMERO, nome, "$era% → $ora%", "pulito, alla velocità dell'originale" + if (ora >= 100) ": ci sei" else "", Pilastro.VIDYA,
                "$nome: da $era a $ora per cento, pulito."))
        }

        // Il rituale che ha retto di più: la stabilità mantenuta, in scena quanto un brano finito.
        Contesto.statoRituali(i).map { s -> s to s.giorni.count { dentro(it, sett) } }.filter { it.second >= 4 }.maxByOrNull { it.second }?.let { (s, n) ->
            add(Scena(Tipo.NUMERO, "Ha retto", "$n su 7", "«${s.rituale.nome}»", s.rituale.pilastro,
                "«${s.rituale.nome}» ha retto $n giorni su 7. Anche questo è costruire."))
        }

        // Il sonno: la media della settimana, se c'è e se si è mossa.
        val sonno = Esiti.serieGiornaliera(i.misure, TipoMisura.SONNO)
        val sOra = sonno.filter { dentro(it.giorno, sett) }.map { it.valore }
        val sPrima = sonno.filter { dentro(it.giorno, prima) }.map { it.valore }
        if (sOra.size >= 4) {
            val m = sOra.average()
            val d = if (sPrima.size >= 4) m - sPrima.average() else null
            add(Scena(Tipo.NUMERO, "Sonno", Esiti.formatta(TipoMisura.SONNO, m), "di media" + (d?.takeIf { abs(it) >= 10 }?.let { " · " + (if (it > 0) "+" else "−") + Esiti.formatta(TipoMisura.SONNO, abs(it)) } ?: ""),
                Pilastro.BIO, "Hai dormito in media ${Esiti.formatta(TipoMisura.SONNO, m).replace("h", " ore e ").removeSuffix(" ore e ")}."))
        }

        // I passi, come il sonno.
        val passi = Esiti.serieGiornaliera(i.misure, TipoMisura.PASSI).filter { dentro(it.giorno, sett) }.map { it.valore }
        if (passi.size >= 4) add(Scena(Tipo.NUMERO, "Passi", Esiti.formatta(TipoMisura.PASSI, passi.average()), "al giorno, di media", Pilastro.BIO,
            "${Esiti.formatta(TipoMisura.PASSI, passi.average())} passi al giorno."))

        // Una scoperta, se il programma ne ha una.
        scoperte.firstOrNull()?.let { add(Scena(Tipo.ELENCO, "Una cosa che non sapevi", it.testo().substringBefore(" ("), "trovata dal programma nei tuoi dati", Pilastro.VIDYA, it.testo().substringBefore(" (") + ".")) }

        // Il ritratto, e il prossimo passo del fronte più urgente.
        val passo = Fronti.ordina(i.percorsi, i.nodi, oggi).firstOrNull { it.prossimoPasso.isNotBlank() }
        add(Scena(Tipo.RITRATTO, "Adam, oggi", "", passo?.let { "Prossimo passo: ${it.prossimoPasso}" } ?: "La settimana prossima si comincia da qui.", null,
            passo?.let { "Il prossimo passo: ${it.prossimoPasso}." } ?: "La settimana prossima si comincia da qui."))
    }

}
