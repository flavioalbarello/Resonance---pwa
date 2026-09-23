package it.resonance.adam.logica

import it.resonance.adam.dati.Documento
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo
import it.resonance.adam.dati.Quaderno
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.Spunta
import it.resonance.adam.dati.TipoMisura
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

data class Istantanea(
    val oggi: LocalDate,
    val profilo: Profilo?,
    val misure: List<Misura>,
    val rituali: List<Rituale>,
    val spunte: List<Spunta>,
    val percorsi: List<Percorso>,
    val nodi: List<Nodo>,
    val documenti: List<Documento>,
    val quaderni: List<Quaderno>,
    val agenda: AgendaLetta = AgendaLetta.NonLetta,
)

data class StatoRituale(val rituale: Rituale, val tenuta: Tenuta, val giorni: Set<LocalDate>)

object Contesto {
    private val DATA = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", Locale.ITALIAN)

    val STILE_PREDEFINITO = "Denso, non lungo. Righe corte, una idea per riga. Niente premesse, niente riassunti di quello che il Ghost ha appena detto, niente chiusure riepilogative."

    fun statoRituali(i: Istantanea): List<StatoRituale> = i.rituali.map { r ->
        val manuali = i.spunte.filter { it.ritualeId == r.id }.map { LocalDate.parse(it.giorno) }.toSet()
        val automatici = Stabilita.leggiCriterio(r.criterio)?.let { Stabilita.giorniSoddisfatti(it, i.misure) }.orEmpty()
        val giorni = manuali + automatici
        StatoRituale(r, Stabilita.tenuta(giorni, i.oggi), giorni)
    }

    fun righeEsiti(i: Istantanea, pilastro: Pilastro): List<String> {
        val tipi = TipoMisura.entries.filter { it.pilastro == pilastro && it != TipoMisura.ENTRATA }
        val righe = tipi.map { Esiti.riga(Esiti.sintesi(i.misure, it, i.oggi), i.oggi) }.toMutableList()
        if (pilastro == Pilastro.AIR) {
            val mese = YearMonth.from(i.oggi)
            val libere = Esiti.entrateMese(i.misure, mese, true)
            val libereMesePrima = Esiti.entrateMese(i.misure, mese.minusMonths(1), true)
            val tutte = Esiti.entrateMese(i.misure, mese, false)
            righe += if (i.misure.none { it.tipo == TipoMisura.ENTRATA }) "Entrate: nessun dato"
            else "Entrate che non vendono tempo: ${Esiti.formatta(TipoMisura.ENTRATA, libere)} questo mese, ${Esiti.formatta(TipoMisura.ENTRATA, libereMesePrima)} il mese scorso (totale entrate del mese ${Esiti.formatta(TipoMisura.ENTRATA, tutte)})"
        }
        return righe
    }

    fun rigaRituale(s: StatoRituale) =
        "${s.rituale.nome} (${s.rituale.pilastro.etichetta}): serie ${s.tenuta.serie} giorni, tenuto ${s.tenuta.tenutiSu14}/14, oggi ${if (s.tenuta.oggi) "sì" else "non ancora"}" +
            (s.rituale.criterio?.let { " — automatico quando $it" } ?: "")

    fun sistema(i: Istantanea): String = buildString {
        val nome = i.profilo?.nome?.takeIf { it.isNotBlank() } ?: "il Ghost"
        appendLine("Sei lo Shell di Resonance: la parte digitale di Adam, l'individuo fatto dal Ghost ($nome) e da te.")
        appendLine("Oggi è ${i.oggi.format(DATA)} (${i.oggi}).")
        appendLine()
        appendLine("COME AGISCI")
        appendLine("- Tu non esegui niente: proponi con gli strumenti. Ogni scrittura diventa una proposta che il Ghost conferma; la ricevuta la scrive il programma.")
        appendLine("- Non scrivere mai «fatto», «registrato», «salvato»: di' cosa hai proposto.")
        appendLine("- Quando il Ghost dice un numero (peso, ore di sonno, soldi entrati, minuti di pratica, un'opera finita), proponi registra_misura.")
        appendLine("- I numeri qui sotto li ha calcolati il programma. Se un numero non c'è, non l'hai ricevuto: non inventarlo; usa leggi_misure o chiedi.")
        appendLine("- Prima di dire che una cosa non esiste, usa cerca o leggi_documento.")
        appendLine("- Quando impari qualcosa di stabile sul Ghost, o il Ghost dice che una riga del quaderno è sbagliata, proponi modifica_quaderno (cambia o toglie un pezzo). aggiorna_quaderno riscrive tutto: solo se va rifatto da capo.")
        appendLine("- Formattazione: al massimo **grassetto** ed elenchi con «- ». Niente tabelle, niente titoli.")
        appendLine("- Un impegno esiste solo se è nel calendario: per sapere cosa c'è usa leggi_calendario, per aggiungerne uno proponi crea_evento. Una proposta annullata non è un impegno.")
        appendLine("- Per spostare o togliere un impegno proponi sposta_evento o togli_evento con titolo e giorno. Se si ripete e il Ghost non ha detto se solo quello, da quello in poi o tutta la serie, il programma te lo fa chiedere: chiedilo con quelle tre scelte.")
        appendLine("- Per una mail proponi scrivi_mail: si apre una bozza e la invia il Ghost. Non dire mai che una mail è partita. L'indirizzo lo usi solo se il Ghost l'ha scritto.")
        appendLine("- I vincoli dichiarati valgono sempre.")
        appendLine()
        appendLine("STILE")
        appendLine(i.profilo?.stile?.takeIf { it.isNotBlank() } ?: STILE_PREDEFINITO)
        i.profilo?.vincoli?.takeIf { it.isNotBlank() }?.let { appendLine(); appendLine("VINCOLI DICHIARATI"); appendLine(it) }
        i.profilo?.motivazione?.takeIf { it.isNotBlank() }?.let { appendLine(); appendLine("DIREZIONE"); appendLine(it) }
        appendLine()
        appendLine("ESITI (calcolati dal programma sui dati veri)")
        for (p in listOf(Pilastro.BIO, Pilastro.AIR, Pilastro.VIDYA)) {
            appendLine("${p.name}:")
            righeEsiti(i, p).forEach { appendLine("- $it") }
        }
        if (i.agenda != AgendaLetta.NonLetta) {
            appendLine()
            appendLine("AGENDA (letta ora dal calendario del telefono)")
            appendLine(Agenda.testo(i.agenda, i.oggi))
        }
        val rituali = statoRituali(i)
        appendLine()
        appendLine("STABILITÀ MANTENUTA")
        if (rituali.isEmpty()) appendLine("- nessun rituale ancora") else rituali.forEach { appendLine("- ${rigaRituale(it)}") }
        appendLine()
        appendLine("PERCORSI")
        val attivi = i.percorsi.filter { !it.archiviato }
        if (attivi.isEmpty()) appendLine("- nessuno")
        attivi.forEach { p ->
            val nodi = i.nodi.filter { it.percorsoId == p.id }.sortedBy { it.ordine }.joinToString("; ") { "${it.etichetta} [${it.stato.etichetta}]" }
            val docs = i.documenti.filter { it.percorsoId == p.id }.joinToString("; ") { "«${it.titolo}» (${it.testo.length} car.)" }
            append("- «${p.titolo}» (${p.pilastro.name})")
            if (p.scopo.isNotBlank()) append(" — ${Testi.corto(p.scopo, 160)}")
            appendLine()
            if (nodi.isNotEmpty()) appendLine("  nodi: $nodi")
            appendLine("  documenti: ${docs.ifEmpty { "nessuno" }}")
        }
        val quaderni = i.quaderni.filter { it.testo.isNotBlank() }.sortedBy { it.pilastro.ordinal }
        if (quaderni.isNotEmpty()) {
            appendLine()
            appendLine("QUADERNI (memoria procedurale)")
            quaderni.forEach { appendLine("[${it.pilastro.name}] ${Testi.corto(it.testo, 2500)}") }
        }
    }.trimEnd()
}
