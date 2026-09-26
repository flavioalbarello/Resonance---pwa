package it.resonance.adam.logica

import it.resonance.adam.dati.Direzione
import it.resonance.adam.dati.Esperimento
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.TipoMovimento
import it.resonance.adam.dati.TipoMisura
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

// INTERNO: scrive senza proposta, perché non tocca niente del Ghost né del mondo (il Taccuino dello Shell).
enum class Effetto { LETTURA, SCRITTURA, INTERNO }

// Il modello non esegue niente: propone. Una scrittura diventa una proposta che il Ghost
// conferma, e la ricevuta la scrive il programma dopo averla eseguita davvero.
@Serializable
sealed class Proposta {
    abstract fun descrizione(): String

    // Il testo intero, per «Vedi tutto» sulla scheda: la descrizione accorcia, e non si conferma ciò che non si legge.
    open fun dettaglio(): String? = null

    @Serializable @SerialName("registra_misura")
    data class RegistraMisura(
        val tipo: TipoMisura, val valore: Double, val giorno: String,
        val nota: String = "", val legataAlTempo: Boolean? = null,
    ) : Proposta() {
        override fun descrizione(): String {
            val legata = when (legataAlTempo) { true -> " (legata al tempo)"; false -> " (non legata al tempo)"; null -> "" }
            val n = if (nota.isNotBlank()) " — $nota" else ""
            return "Registrare ${tipo.etichetta}: ${Esiti.formatta(tipo, valore)}$legata, ${Giorni.leggibile(giorno)}$n"
        }
    }

    @Serializable @SerialName("scrivi_voce")
    data class ScriviVoce(val pilastro: Pilastro, val testo: String, val giorno: String) : Proposta() {
        override fun descrizione() = "Scrivere nel diario ${pilastro.etichetta}, ${Giorni.leggibile(giorno)}: «${Testi.corto(testo, 140)}»"
        override fun dettaglio() = testo
    }

    @Serializable @SerialName("crea_percorso")
    data class CreaPercorso(val pilastro: Pilastro, val titolo: String, val scopo: String, val nodi: List<String>) : Proposta() {
        override fun descrizione() = "Creare il percorso «$titolo» in ${pilastro.etichetta}" +
            (if (nodi.isNotEmpty()) " con ${nodi.size} nodi: ${nodi.joinToString(", ")}" else "")
    }

    @Serializable @SerialName("salva_documento")
    data class SalvaDocumento(val percorso: String, val titolo: String, val testo: String, val nodo: String? = null) : Proposta() {
        override fun descrizione() = "Salvare «$titolo» (${testo.length} caratteri) nel percorso «$percorso»" +
            (nodo?.let { " sotto il nodo «$it»" } ?: "") + ". Inizia: «${Testi.corto(testo, 100)}»"
        override fun dettaglio() = testo
    }

    @Serializable @SerialName("modifica_documento")
    data class ModificaDocumento(val documento: String, val ancora: String, val testo: String, val modo: String) : Proposta() {
        override fun descrizione() = when (modo) {
            "prima" -> "In «$documento», inserire prima di «${Testi.corto(ancora, 60)}»: «${Testi.corto(testo, 120)}»"
            "dopo" -> "In «$documento», inserire dopo «${Testi.corto(ancora, 60)}»: «${Testi.corto(testo, 120)}»"
            else -> "In «$documento», sostituire «${Testi.corto(ancora, 60)}» con «${Testi.corto(testo, 120)}»"
        }
        override fun dettaglio() = Testi.primaDopo(ancora, testo, modo)
    }

    @Serializable @SerialName("aggiorna_quaderno")
    data class AggiornaQuaderno(val pilastro: Pilastro, val testo: String) : Proposta() {
        override fun descrizione() = "Riscrivere il quaderno ${pilastro.etichetta} (${testo.length} caratteri; il testo precedente resta nello storico)"
        override fun dettaglio() = testo
    }

    // Cambiare una parte del quaderno senza riscriverlo: riscriverlo intero per togliere una riga supera il tetto di lunghezza.
    @Serializable @SerialName("modifica_quaderno")
    data class ModificaQuaderno(val pilastro: Pilastro, val ancora: String, val testo: String, val modo: String) : Proposta() {
        override fun descrizione() = when {
            modo == "aggiungi" -> "Nel quaderno ${pilastro.etichetta}, aggiungere in fondo: «${Testi.corto(testo, 160)}»"
            modo == "sostituisci" && testo.isEmpty() -> "Dal quaderno ${pilastro.etichetta}, togliere «${Testi.corto(ancora, 120)}»"
            modo == "prima" -> "Nel quaderno ${pilastro.etichetta}, prima di «${Testi.corto(ancora, 60)}» aggiungere «${Testi.corto(testo, 120)}»"
            modo == "dopo" -> "Nel quaderno ${pilastro.etichetta}, dopo «${Testi.corto(ancora, 60)}» aggiungere «${Testi.corto(testo, 120)}»"
            else -> "Nel quaderno ${pilastro.etichetta}, sostituire «${Testi.corto(ancora, 60)}» con «${Testi.corto(testo, 120)}»"
        } + " (il testo precedente resta nello storico)"
        override fun dettaglio() = if (modo == "aggiungi") "Da aggiungere in fondo:\n$testo" else Testi.primaDopo(ancora, testo, modo)
    }

    @Serializable @SerialName("crea_rituale")
    data class CreaRituale(val nome: String, val pilastro: Pilastro, val criterio: String? = null) : Proposta() {
        override fun descrizione() = "Creare il rituale «$nome» in ${pilastro.etichetta}" +
            (criterio?.let { " — si spunta da solo quando $it" } ?: "")
    }

    @Serializable @SerialName("spunta_rituale")
    data class SpuntaRituale(val nome: String, val giorno: String) : Proposta() {
        override fun descrizione() = "Segnare «$nome» come tenuto, ${Giorni.leggibile(giorno)}"
    }

    // Le tappe di un percorso che c'è già: prima si potevano dare solo creandolo, e lo Shell ripiegava sul testo libero
    // (visto il 24/09: 21 brani del tributo scritti in un documento con «[introdotto]» ricopiato a mano).
    // `sotto`: il nodo di primo livello che li raccoglie (i brani sotto «Scaletta»); `sottoNuovo` se va creato.
    // `saltati`: quelli che c'erano già, detti al Ghost e al modello invece di sparire in silenzio.
    @Serializable @SerialName("aggiungi_nodi")
    data class AggiungiNodi(
        val percorso: String, val nodi: List<String>, val sotto: String? = null,
        val sottoNuovo: Boolean = false, val saltati: List<String> = emptyList(), val pilastro: Pilastro? = null,
    ) : Proposta() {
        override fun descrizione() = "Nel percorso «$percorso», aggiungere ${nodi.size} " + (if (nodi.size == 1) "nodo" else "nodi") +
            Nodi.dove(sotto, sottoNuovo, "sotto") + (pilastro?.let { " in ${it.etichetta}" } ?: "") +
            " (non iniziati): ${Testi.corto(nodi.joinToString(", "), 160)}" +
            (if (saltati.isNotEmpty()) " — già presenti, non aggiunti: ${Testi.corto(saltati.joinToString(", "), 80)}" else "")
        override fun dettaglio() = nodi.joinToString("\n") { "• $it" }
    }

    @Serializable @SerialName("pilastro_nodo")
    data class PilastroNodo(val percorso: String, val nodo: String, val pilastro: Pilastro) : Proposta() {
        override fun descrizione() = "Nel percorso «$percorso», il nodo «$nodo» va in ${pilastro.etichetta}" +
            (if (pilastro == Pilastro.ADAM) " (riguarda tutto Adam)" else "")
    }

    @Serializable @SerialName("regola_temperatura")
    data class RegolaTemperatura(val compito: String, val valore: Double, val perche: String) : Proposta() {
        override fun descrizione() = "Temperatura per «${compito.lowercase()}»: ${String.format(Locale.ITALIAN, "%.1f", valore)} — $perche"
    }

    @Serializable @SerialName("movimento_fondo")
    data class MovimentoFondo(val tipo: TipoMovimento, val importo: Double, val motivo: String, val giorno: String) : Proposta() {
        override fun descrizione() = "Fondo di Adam, ${tipo.etichetta}: ${Fondo.euro(importo)}, ${Giorni.leggibile(giorno)} — $motivo"
    }

    @Serializable @SerialName("prendi_consegna")
    data class PrendiConsegna(val cosa: String, val documento: String, val percorso: String? = null, val scadenza: String) : Proposta() {
        override fun descrizione() = "Consegna dello Shell: «$cosa» — documento «$documento»" + (percorso?.let { " nel percorso «$it»" } ?: "") +
            ", entro ${Giorni.leggibile(scadenza)}. Il giorno prima ci lavora da solo; alla scadenza il programma guarda se il documento c'è"
    }

    @Serializable @SerialName("lettera_architetto")
    data class LetteraArchitetto(val oggetto: String, val testo: String) : Proposta() {
        override fun descrizione() = "Spedire all'architetto la lettera «$oggetto» (con lo stato dell'app allegato)"
        override fun dettaglio() = testo
    }

    @Serializable @SerialName("sposta_nodi")
    data class SpostaNodi(val percorso: String, val nodi: List<String>, val sotto: String? = null, val sottoNuovo: Boolean = false) : Proposta() {
        override fun descrizione() = "Nel percorso «$percorso», spostare ${nodi.size} " + (if (nodi.size == 1) "nodo" else "nodi") +
            (if (sotto == null) " al primo livello" else Nodi.dove(sotto, sottoNuovo, "sotto")) + ": ${Testi.corto(nodi.joinToString(", "), 160)}"
        override fun dettaglio() = nodi.joinToString("\n") { "• $it" }
    }

    @Serializable @SerialName("togli_nodo")
    data class TogliNodo(val percorso: String, val nodo: String) : Proposta() {
        override fun descrizione() = "Dal percorso «$percorso», togliere il nodo «$nodo» (resta una traccia nel diario)"
    }

    @Serializable @SerialName("stato_nodo")
    data class StatoDelNodo(val percorso: String, val nodo: String, val stato: StatoNodo) : Proposta() {
        override fun descrizione() = "Nel percorso «$percorso», portare il nodo «$nodo» a «${stato.etichetta}»"
    }

    // ── Verso il mondo: non passano dall'archivio ──

    @Serializable @SerialName("crea_evento")
    data class CreaEvento(
        val titolo: String, val inizio: String, val durataMinuti: Int = 60,
        val luogo: String = "", val note: String = "",
    ) : Proposta() {
        override fun descrizione(): String {
            val (da, a) = Agenda.inizioFine(this)
            val tutto = inizio.trim().length == 10
            return "Mettere in calendario «$titolo», ${Agenda.quando(da, a, tutto, LocalDate.now())}" +
                (if (luogo.isNotBlank()) " ($luogo)" else "") + (if (note.isNotBlank()) " — ${Testi.corto(note, 80)}" else "")
        }
    }

    @Serializable @SerialName("sposta_evento")
    data class SpostaEvento(
        val titolo: String, val giorno: String, val ora: String? = null,
        val nuovoInizio: String? = null, val nuovaDurataMinuti: Int? = null,
        val nuovoTitolo: String? = null, val nuovoLuogo: String? = null,
        val bersaglio: Bersaglio? = null,
    ) : Proposta() {
        override fun descrizione() = Impegni.descriviSposta(this)
    }

    @Serializable @SerialName("togli_evento")
    data class TogliEvento(
        val titolo: String, val giorno: String, val ora: String? = null,
        val portata: Portata? = null, val bersaglio: Bersaglio? = null,
    ) : Proposta() {
        override fun descrizione() = Impegni.descriviTogli(this)
    }

    // L'anello: il bersaglio si dichiara qui, prima. La partenza la congela il programma alla conferma.
    @Serializable @SerialName("proponi_esperimento")
    data class ApriEsperimento(
        val titolo: String, val tipo: TipoMisura, val direzione: Direzione, val giorni: Int,
        val soglia: Double, val perche: String = "", val origine: String = "shell",
    ) : Proposta() {
        override fun descrizione() = "Esperimento di $giorni giorni: «$titolo». Bersaglio: ${Esperimenti.nomeMisura(tipo)} " +
            "${direzione.freccia} di almeno ${Esiti.formatta(tipo, soglia)} rispetto ai $giorni giorni prima (partenza congelata alla conferma)." +
            (if (perche.isNotBlank()) " Perché: ${Testi.corto(perche, 200)}" else "")
    }

    @Serializable @SerialName("lascia_esperimento")
    data class LasciaEsperimento(val titolo: String, val motivo: String = "") : Proposta() {
        override fun descrizione() = "Lasciare prima della fine l'esperimento «$titolo»" + (if (motivo.isNotBlank()) " — $motivo" else "") + ". Resta traccia."
    }

    @Serializable @SerialName("scrivi_mail")
    data class ScriviMail(val a: String, val oggetto: String, val corpo: String) : Proposta() {
        override fun descrizione() = "Preparare una mail" + (if (a.isNotBlank()) " a $a" else " (destinatario lo scrivi tu)") +
            " — «${Testi.corto(oggetto, 60)}»: «${Testi.corto(corpo, 160)}». Si apre come bozza nell'app di posta: parte solo se premi Invia tu."
        override fun dettaglio() = "Oggetto: $oggetto\n\n$corpo"
    }
}

// Ciò che il programma sa del turno e che il modello non può cambiare.
data class Regole(
    val nomiProtetti: List<String> = emptyList(),
    // null = non controllare (per le prove); altrimenti gli indirizzi che il Ghost ha scritto davvero.
    val indirizziNoti: Set<String>? = null,
    val detteDalGhost: String = "",
    val esperimentiAperti: List<Esperimento> = emptyList(),
    val consegneAperte: List<it.resonance.adam.dati.Consegna> = emptyList(),
)

sealed class Validazione {
    data class Lettura(val nome: String, val argomenti: JsonObject) : Validazione()
    data class Interna(val nome: String, val argomenti: JsonObject) : Validazione()
    data class Scrittura(val proposta: Proposta) : Validazione()
    data class Rifiutata(val motivo: String) : Validazione()
}

data class Strumento(val nome: String, val effetto: Effetto, val descrizione: String, val parametri: JsonObject)

object Azioni {
    val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; classDiscriminator = "azione" }

    private val TIPI = TipoMisura.entries.map { it.name }
    private val PILASTRI = Pilastro.entries.map { it.name }
    private val STATI = StatoNodo.entries.map { it.name }

    private fun schema(obbligatori: List<String>, props: Map<String, JsonObject>) = buildJsonObject {
        put("type", "object")
        putJsonObject("properties") { props.forEach { (k, v) -> put(k, v) } }
        putJsonArray("required") { obbligatori.forEach { add(JsonPrimitive(it)) } }
    }
    private fun s(desc: String) = buildJsonObject { put("type", "string"); put("description", desc) }
    private fun n(desc: String) = buildJsonObject { put("type", "number"); put("description", desc) }
    private fun b(desc: String) = buildJsonObject { put("type", "boolean"); put("description", desc) }
    private fun e(valori: List<String>, desc: String) = buildJsonObject {
        put("type", "string"); put("description", desc)
        putJsonArray("enum") { valori.forEach { add(JsonPrimitive(it)) } }
    }
    private fun lista(desc: String) = buildJsonObject {
        put("type", "array"); put("description", desc)
        putJsonObject("items") { put("type", "string") }
    }

    // I compiti la cui temperatura si può proporre: la scelta del motore resta a 0, è una classificazione.
    val COMPITI_REGOLABILI = listOf("ALLEGATI", "TURNO", "BATTITO", "ESPERIMENTO", "DADO")

    val strumenti: List<Strumento> = listOf(
        Strumento("leggi_documento", Effetto.LETTURA, "Legge il testo completo di un documento salvato in un percorso.",
            schema(listOf("titolo"), mapOf("titolo" to s("Titolo o parte del titolo del documento")))),
        Strumento("cerca", Effetto.LETTURA, "Cerca un testo nel diario, nei documenti e nei quaderni. Usalo prima di dire che una cosa non esiste.",
            schema(listOf("testo"), mapOf("testo" to s("Parole da cercare")))),
        Strumento("leggi_misure", Effetto.LETTURA, "Serie giornaliera di una misura, per quando la sintesi non basta.",
            schema(listOf("tipo"), mapOf("tipo" to e(TIPI, "Misura"), "giorni" to n("Quanti giorni indietro, massimo 180")))),
        Strumento("registra_misura", Effetto.SCRITTURA,
            "Propone di registrare un numero. Unità: PESO kg, SONNO/ALLENAMENTO/PRATICA minuti, PASSI conteggio, FC_RIPOSO bpm, ENTRATA euro, OPERA 1 per opera conclusa.",
            schema(listOf("tipo", "valore"), mapOf(
                "tipo" to e(TIPI, "Misura"), "valore" to n("Valore nell'unità indicata"),
                "giorno" to s("yyyy-MM-dd, se assente oggi"), "nota" to s("Facoltativa"),
                "legata_al_tempo" to b("Solo ENTRATA: true se è pagamento di ore/prestazioni, false se entra senza vendere tempo"),
            ))),
        Strumento("scrivi_voce", Effetto.SCRITTURA, "Propone una voce di diario qualitativa in un pilastro.",
            schema(listOf("pilastro", "testo"), mapOf("pilastro" to e(PILASTRI, "Pilastro"), "testo" to s("Testo"), "giorno" to s("yyyy-MM-dd, se assente oggi")))),
        Strumento("crea_percorso", Effetto.SCRITTURA, "Propone un nuovo percorso con i suoi nodi. ADAM per un percorso che attraversa più pilastri: poi ogni nodo di primo livello riceve il suo pilastro.",
            schema(listOf("pilastro", "titolo", "nodi"), mapOf(
                "pilastro" to e(PILASTRI, "Pilastro; ADAM se attraversa più pilastri"), "titolo" to s("Nome breve del percorso, non una frase"),
                "scopo" to s("Chi diventa il Ghost percorrendolo"), "nodi" to lista("Tappe concrete, da 1 a 20: quelle che il Ghost ha nominato o riconoscerebbe come sue. Non inventare fasi generiche: se non le sai, chiedile"),
            ))),
        Strumento("salva_documento", Effetto.SCRITTURA, "Propone di salvare un testo come documento in un percorso esistente.",
            schema(listOf("percorso", "titolo", "testo"), mapOf(
                "percorso" to s("Titolo del percorso"), "titolo" to s("Titolo del documento"),
                "testo" to s("Testo completo"), "nodo" to s("Nodo a cui appartiene, facoltativo"),
            ))),
        Strumento("modifica_documento", Effetto.SCRITTURA,
            "Propone una modifica a un documento: indica un frammento ESATTO già presente (ancora) e il testo nuovo. Non riscrivere il documento intero.",
            schema(listOf("documento", "ancora", "testo", "modo"), mapOf(
                "documento" to s("Titolo del documento"), "ancora" to s("Frammento esatto, presente una sola volta"),
                "testo" to s("Testo nuovo"), "modo" to e(listOf("prima", "dopo", "sostituisci"), "Dove va il testo nuovo rispetto all'ancora"),
            ))),
        Strumento("aggiorna_quaderno", Effetto.SCRITTURA,
            "Propone di riscrivere TUTTO il quaderno di un pilastro (memoria procedurale). Il testo sostituisce il precedente: includi ciò che resta valido. Per un cambio piccolo usa modifica_quaderno.",
            schema(listOf("pilastro", "testo"), mapOf("pilastro" to e(PILASTRI, "Pilastro"), "testo" to s("Testo completo del quaderno")))),
        Strumento("modifica_quaderno", Effetto.SCRITTURA,
            "Propone di cambiare UNA PARTE del quaderno di un pilastro. Per aggiungere una cosa imparata: modo aggiungi (va in fondo, niente ancora). Per cambiare o togliere: un frammento ESATTO già presente (ancora) e il testo nuovo; per togliere, modo sostituisci e testo vuoto. Preferiscilo ad aggiorna_quaderno.",
            schema(listOf("pilastro", "testo", "modo"), mapOf(
                "pilastro" to e(PILASTRI, "Pilastro"), "ancora" to s("Frammento esatto del quaderno, presente una sola volta (non serve con aggiungi)"),
                "testo" to s("Testo nuovo; vuoto per togliere l'ancora"), "modo" to e(listOf("aggiungi", "prima", "dopo", "sostituisci"), "aggiungi in fondo, o dove va rispetto all'ancora"),
            ))),
        Strumento("crea_rituale", Effetto.SCRITTURA,
            "Propone un rituale da mantenere. Se misurabile, dai un criterio tipo SONNO>=420 o PASSI>=7000: si spunterà da solo.",
            schema(listOf("nome", "pilastro"), mapOf("nome" to s("Nome breve"), "pilastro" to e(PILASTRI, "Pilastro"), "criterio" to s("Facoltativo, forma TIPO>=numero")))),
        Strumento("spunta_rituale", Effetto.SCRITTURA, "Propone di segnare un rituale come tenuto in un giorno.",
            schema(listOf("nome"), mapOf("nome" to s("Nome del rituale"), "giorno" to s("yyyy-MM-dd, se assente oggi")))),
        Strumento("leggi_calendario", Effetto.LETTURA,
            "Legge gli impegni veri dal calendario del telefono. Usalo prima di dire cosa c'è o non c'è in agenda.",
            schema(emptyList(), mapOf("da" to s("yyyy-MM-dd, se assente oggi"), "giorni" to n("Quanti giorni, da 1 a 31; se assente 7")))),
        Strumento("crea_evento", Effetto.SCRITTURA,
            "Propone di mettere un impegno nel calendario del Ghost. Esiste solo dopo la sua conferma.",
            schema(listOf("titolo", "inizio"), mapOf(
                "titolo" to s("Nome breve dell'impegno"),
                "inizio" to s("yyyy-MM-ddTHH:mm; solo yyyy-MM-dd se dura tutto il giorno"),
                "durata_minuti" to n("Se assente 60"), "luogo" to s("Facoltativo"), "note" to s("Facoltative"),
            ))),
        Strumento("sposta_evento", Effetto.SCRITTURA,
            "Propone di spostare o modificare UN impegno del calendario. Indicalo con titolo e giorno in cui cade; se si ripete, cambia solo quella volta.",
            schema(listOf("titolo", "giorno"), mapOf(
                "titolo" to s("Titolo dell'impegno com'è in calendario"), "giorno" to s("yyyy-MM-dd in cui cade ora"),
                "ora" to s("HH:mm in cui inizia ora, se quel giorno ce n'è più d'uno"),
                "nuovo_inizio" to s("yyyy-MM-ddTHH:mm, oppure solo HH:mm per lo stesso giorno, oppure yyyy-MM-dd se dura tutto il giorno"),
                "nuova_durata_minuti" to n("Se cambia la durata"), "nuovo_titolo" to s("Se cambia il titolo"), "nuovo_luogo" to s("Se cambia il luogo"),
            ))),
        Strumento("togli_evento", Effetto.SCRITTURA,
            "Propone di togliere un impegno dal calendario. Se si ripete e il Ghost non ha detto quanto togliere, non indovinare: il programma te lo farà chiedere.",
            schema(listOf("titolo", "giorno"), mapOf(
                "titolo" to s("Titolo dell'impegno com'è in calendario"), "giorno" to s("yyyy-MM-dd di un'occorrenza"),
                "ora" to s("HH:mm, se quel giorno ce n'è più d'uno"),
                "quali" to e(Portata.entries.map { it.chiave }, "Solo se l'impegno si ripete e il Ghost l'ha detto: solo quello, da quello in poi, o tutta la serie"),
            ))),
        Strumento("proponi_esperimento", Effetto.SCRITTURA,
            "Propone un esperimento: UNA cosa da fare per un periodo e il numero che dovrebbe muoversi. Il programma congela la partenza e alla fine confronta. Massimo 3 aperti, uno per numero.",
            schema(listOf("titolo", "misura", "direzione"), mapOf(
                "titolo" to s("La cosa da fare, breve e concreta (es. «A letto entro le 23»)"),
                "misura" to e(TIPI, "Il numero che dovrebbe muoversi (ENTRATA = entrate che non vendono tempo)"),
                "direzione" to e(Direzione.entries.map { it.chiave }, "Se deve salire o scendere"),
                "giorni" to n("Durata, da 7 a 42; se assente 14"),
                "soglia" to n("Di quanto deve muoversi per contare, nell'unità della misura; se assente un valore predefinito"),
                "perche" to s("In una o due righe, perché proprio questa prova"),
            ))),
        Strumento("lascia_esperimento", Effetto.SCRITTURA, "Propone di chiudere prima della fine un esperimento aperto. Resta traccia.",
            schema(listOf("titolo"), mapOf("titolo" to s("Titolo dell'esperimento"), "motivo" to s("Facoltativo")))),
        Strumento("scrivi_mail", Effetto.SCRITTURA,
            "Propone una mail. Dopo la conferma si apre come bozza nell'app di posta e la invia il Ghost: non dire mai che è partita.",
            schema(listOf("oggetto", "corpo"), mapOf(
                "a" to s("Indirizzo esatto come l'ha scritto il Ghost; lascia vuoto se non te l'ha dato"),
                "oggetto" to s("Oggetto"), "corpo" to s("Testo completo"),
            ))),
        Strumento("aggiungi_nodi", Effetto.SCRITTURA,
            "Propone di aggiungere nodi (tappe, brani, capitoli…) in fondo a un percorso che esiste già; partono non iniziati. Poi lo stato di ciascuno si cambia con stato_nodo.",
            schema(listOf("percorso", "nodi"), mapOf("percorso" to s("Titolo del percorso"), "nodi" to lista("Etichette brevi, una per nodo, da 1 a 30"),
                "sotto" to s("Facoltativo: il nodo di primo livello che li raccoglie (es. «Scaletta»); se non c'è si crea. Due livelli al massimo"),
                "pilastro" to e(PILASTRI, "Solo nei percorsi di ADAM e solo per nodi di primo livello: il pilastro di queste parti. Se non è chiaro, chiedilo")))),
        Strumento("pilastro_nodo", Effetto.SCRITTURA, "Propone il pilastro di un nodo di primo livello in un percorso di ADAM (trasversale). I sotto-nodi lo ereditano.",
            schema(listOf("percorso", "nodo", "pilastro"), mapOf("percorso" to s("Titolo del percorso"), "nodo" to s("Etichetta del nodo"), "pilastro" to e(PILASTRI, "Pilastro")))),
        Strumento("sposta_nodi", Effetto.SCRITTURA,
            "Propone di spostare nodi che esistono già sotto un nodo di primo livello (che si crea se non c'è), o al primo livello se «sotto» manca. Per raccogliere elementi dello stesso tipo, come i brani di una scaletta.",
            schema(listOf("percorso", "nodi"), mapOf("percorso" to s("Titolo del percorso"), "nodi" to lista("Etichette dei nodi da spostare, da 1 a 40"),
                "sotto" to s("Il nodo di primo livello che li raccoglie; vuoto per portarli al primo livello")))),
        Strumento("togli_nodo", Effetto.SCRITTURA, "Propone di togliere un nodo da un percorso (doppione, tappa che non serve più). Resta una traccia nel diario.",
            schema(listOf("percorso", "nodo"), mapOf("percorso" to s("Titolo del percorso"), "nodo" to s("Etichetta del nodo")))),
        Strumento("scrivi_taccuino", Effetto.INTERNO,
            "Scrive una nota nel TUO taccuino: un'ipotesi, un'idea, una cosa da ripensare. Niente conferma, non tocca niente. Evapora dopo ${Taccuino.GIORNI} giorni se non la riprendi.",
            schema(listOf("testo"), mapOf("testo" to s("Al massimo ${Taccuino.LUNGHEZZA} caratteri")))),
        Strumento("riprendi_nota", Effetto.INTERNO, "Riprende una nota del taccuino: la tiene viva altri ${Taccuino.GIORNI} giorni.",
            schema(listOf("id"), mapOf("id" to n("Il numero della nota, quello dopo #")))),
        Strumento("regola_temperatura", Effetto.SCRITTURA,
            "Propone di cambiare la temperatura di un compito, con il perché. Vale dal turno dopo, se il Ghost conferma.",
            schema(listOf("compito", "valore", "perche"), mapOf("compito" to e(COMPITI_REGOLABILI, "Compito"),
                "valore" to n("Da 0 a 1, un decimale"), "perche" to s("Cosa hai visto che la chiede")))),
        Strumento("movimento_fondo", Effetto.SCRITTURA,
            "Propone un'entrata o un'uscita del fondo di Adam, col motivo. Il Ghost esegue e conferma. I versamenti li fa lui.",
            schema(listOf("tipo", "importo", "motivo"), mapOf("tipo" to e(listOf("entrata", "uscita"), "Verso"),
                "importo" to n("Euro, positivo"), "motivo" to s("Per cosa"), "giorno" to s("yyyy-MM-dd, se assente oggi")))),
        Strumento("prendi_consegna", Effetto.SCRITTURA,
            "Propone una tua consegna: quando dici «lo preparo nei prossimi giorni», prendila qui. Dichiari ORA la forma che il programma verificherà: " +
                "un documento con un titolo, in un percorso. Il giorno prima della scadenza parte da solo un tuo turno di lavoro; alla scadenza il programma " +
                "guarda se il documento c'è, scritto dopo la presa e non vuoto. Mantenuta o mancata, resta nel diario di Adam. Al massimo ${Consegne.MASSIMO} aperte.",
            schema(listOf("cosa", "documento", "giorni"), mapOf("cosa" to s("Cosa consegni, in una riga"),
                "documento" to s("Titolo esatto del documento che consegnerai"), "percorso" to s("Titolo del percorso dove starà (consigliato)"),
                "giorni" to n("Fra quanti giorni la scadenza, ${Consegne.GIORNI_MIN}–${Consegne.GIORNI_MAX}")))),
        Strumento("scrivi_all_architetto", Effetto.SCRITTURA,
            "Propone una lettera all'architetto dell'app (Claude Code). Parte dopo la conferma del Ghost, con lo stato dell'app allegato; la risposta arriva entro un giorno.",
            schema(listOf("oggetto", "testo"), mapOf("oggetto" to s("Una riga"),
                "testo" to s("Contesto con date; cosa vedi nell'app; UNA richiesta; cosa hai già provato; domande chiuse")))),
        Strumento("stato_nodo", Effetto.SCRITTURA, "Propone di cambiare lo stato di un nodo di un percorso. È il posto dello stato di una tappa: non scriverlo nel quaderno né in un documento. Non per un nodo con sotto-nodi: il suo stato lo calcola il programma dai figli.",
            schema(listOf("percorso", "nodo", "stato"), mapOf("percorso" to s("Titolo del percorso"), "nodo" to s("Etichetta del nodo"), "stato" to e(STATI, "Nuovo stato")))),
    )

    fun definizioni(): JsonArray = buildJsonArray {
        strumenti.forEach { st ->
            add(buildJsonObject {
                put("type", "function")
                putJsonObject("function") {
                    put("name", st.nome); put("description", st.descrizione); put("parameters", st.parametri)
                }
            })
        }
    }

    private fun JsonObject.testo(k: String) = this[k]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }?.trim()?.takeIf { it.isNotEmpty() }
    private fun JsonObject.numero(k: String) = this[k]?.let { el ->
        runCatching { el.jsonPrimitive.doubleOrNull ?: el.jsonPrimitive.content.replace(',', '.').toDoubleOrNull() }.getOrNull()
    }

    fun valida(nome: String, argomenti: JsonObject, oggi: LocalDate, regole: Regole = Regole()): Validazione {
        val st = strumenti.find { it.nome == nome } ?: return Validazione.Rifiutata("strumento sconosciuto: $nome")
        if (st.effetto == Effetto.LETTURA) return Validazione.Lettura(nome, argomenti)
        if (st.effetto == Effetto.INTERNO) return try { interna(nome, argomenti) } catch (e: Rifiuto) { Validazione.Rifiutata(e.message ?: "argomenti non validi") }
        return try { Validazione.Scrittura(scrittura(nome, argomenti, oggi, regole)) }
        catch (e: Rifiuto) { Validazione.Rifiutata(e.message ?: "argomenti non validi") }
    }

    private class Rifiuto(m: String) : Exception(m)
    private fun rifiuta(m: String): Nothing = throw Rifiuto(m)

    private fun pilastro(a: JsonObject) = a.testo("pilastro")?.uppercase()?.let { p -> Pilastro.entries.find { it.name == p } }
        ?: rifiuta("pilastro mancante o sconosciuto (usa ${PILASTRI.joinToString("/")})")

    private fun giorno(a: JsonObject, oggi: LocalDate): String {
        val g = Giorni.interpreta(a.testo("giorno"), oggi) ?: rifiuta("giorno non leggibile: usa yyyy-MM-dd")
        if (g.isAfter(oggi)) rifiuta("il giorno ${g} è nel futuro")
        return g.toString()
    }

    private fun interna(nome: String, a: JsonObject): Validazione = when (nome) {
        "scrivi_taccuino" -> {
            val t = a.testo("testo") ?: rifiuta("testo vuoto")
            if (t.length > Taccuino.LUNGHEZZA) rifiuta("al massimo ${Taccuino.LUNGHEZZA} caratteri: una nota è un'idea, non un documento (per quello salva_documento)")
            Validazione.Interna(nome, a)
        }
        "riprendi_nota" -> {
            a.numero("id")?.toLong() ?: rifiuta("id della nota mancante (è il numero dopo #)")
            Validazione.Interna(nome, a)
        }
        else -> rifiuta("strumento interno non previsto: $nome")
    }

    private fun scrittura(nome: String, a: JsonObject, oggi: LocalDate, regole: Regole): Proposta = when (nome) {
        "regola_temperatura" -> {
            val c = a.testo("compito")?.uppercase()?.takeIf { it in COMPITI_REGOLABILI } ?: rifiuta("compito sconosciuto (usa ${COMPITI_REGOLABILI.joinToString("/")})")
            val v = a.numero("valore") ?: rifiuta("valore mancante")
            if (v < 0.0 || v > 1.0) rifiuta("la temperatura va da 0 a 1")
            Proposta.RegolaTemperatura(c, Math.round(v * 10) / 10.0, a.testo("perche") ?: rifiuta("serve il perché: resta scritto"))
        }
        "movimento_fondo" -> {
            val tipo = when (a.testo("tipo")?.lowercase()) {
                "entrata" -> TipoMovimento.ENTRATA
                "uscita" -> TipoMovimento.USCITA
                else -> rifiuta("tipo: entrata o uscita (i versamenti li fa il Ghost)")
            }
            val imp = a.numero("importo") ?: rifiuta("importo mancante")
            if (imp <= 0.0 || imp > 10_000.0) rifiuta("importo in euro, positivo: il verso lo dice il tipo")
            Proposta.MovimentoFondo(tipo, Math.round(imp * 100) / 100.0, a.testo("motivo") ?: rifiuta("serve il motivo: resta scritto"), giorno(a, oggi))
        }
        "prendi_consegna" -> {
            val cosa = a.testo("cosa")?.takeIf { it.length <= 200 } ?: rifiuta("cosa mancante o più lungo di 200 caratteri: una riga")
            val documento = a.testo("documento")?.takeIf { it.length <= 120 } ?: rifiuta("serve il titolo del documento che consegnerai (al massimo 120 caratteri): è la forma che il programma verifica")
            val giorni = intero(a, "giorni", 0)
            if (giorni !in Consegne.GIORNI_MIN..Consegne.GIORNI_MAX)
                rifiuta("giorni fuori da ${Consegne.GIORNI_MIN}–${Consegne.GIORNI_MAX}: più in là si dimentica, e allora è una dichiarazione")
            if (regole.consegneAperte.size >= Consegne.MASSIMO)
                rifiuta("ci sono già ${Consegne.MASSIMO} consegne aperte: prima mantienine una, o chiedi al Ghost quale lasciare")
            regole.consegneAperte.find { Testi.normalizza(it.documento) == Testi.normalizza(documento) }?.let {
                rifiuta("c'è già una consegna aperta sul documento «${it.documento}» («${it.cosa}»)")
            }
            Proposta.PrendiConsegna(cosa, documento, a.testo("percorso"), oggi.plusDays(giorni.toLong()).toString())
        }
        "scrivi_all_architetto" -> {
            val oggetto = a.testo("oggetto")?.takeIf { it.length <= 120 } ?: rifiuta("oggetto mancante o più lungo di 120 caratteri")
            val testo = a.testo("testo") ?: rifiuta("testo vuoto")
            if (testo.length > 8000) rifiuta("la lettera supera 8000 caratteri: una richiesta per lettera")
            val v = Uscita.violazioni("$oggetto\n$testo", regole.nomiProtetti, regole.detteDalGhost)
            if (v.isNotEmpty()) rifiuta("la lettera contiene ${v.joinToString { "«$it»" }}, un nome che il Ghost non fa uscire: riscrivila senza")
            Proposta.LetteraArchitetto(oggetto, testo)
        }
        "registra_misura" -> {
            val tipo = a.testo("tipo")?.uppercase()?.let { t -> TipoMisura.entries.find { it.name == t } }
                ?: rifiuta("tipo di misura sconosciuto (usa ${TIPI.joinToString("/")})")
            val v = a.numero("valore") ?: rifiuta("valore mancante o non numerico")
            if (v < tipo.minimo || v > tipo.massimo)
                rifiuta("${tipo.etichetta} = $v fuori dall'intervallo plausibile ${tipo.minimo}–${tipo.massimo} ${tipo.unita}: controlla l'unità")
            val legata = a["legata_al_tempo"]?.let { runCatching { it.jsonPrimitive.booleanOrNull }.getOrNull() }
            if (tipo == TipoMisura.ENTRATA && legata == null)
                rifiuta("per un'entrata serve legata_al_tempo: se non lo sai, chiedilo al Ghost")
            Proposta.RegistraMisura(tipo, v, giorno(a, oggi), a.testo("nota") ?: "", if (tipo == TipoMisura.ENTRATA) legata else null)
        }
        "scrivi_voce" -> Proposta.ScriviVoce(pilastro(a), a.testo("testo") ?: rifiuta("testo vuoto"), giorno(a, oggi))
        "crea_percorso" -> {
            val p = pilastro(a)
            val titolo = a.testo("titolo") ?: rifiuta("titolo mancante")
            if (titolo.length > 50 || titolo.split(Regex("\\s+")).size > 6) rifiuta("il titolo è una frase, non un nome: accorcialo")
            val nodi = runCatching { a["nodi"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull?.trim()?.takeIf(String::isNotEmpty) } }.getOrNull().orEmpty()
            if (nodi.size !in 1..20) rifiuta("servono da 1 a 20 nodi")
            Proposta.CreaPercorso(p, titolo, a.testo("scopo") ?: "", nodi)
        }
        "salva_documento" -> Proposta.SalvaDocumento(
            a.testo("percorso") ?: rifiuta("percorso mancante"), a.testo("titolo") ?: rifiuta("titolo mancante"),
            a.testo("testo") ?: rifiuta("testo vuoto"), a.testo("nodo"),
        )
        "modifica_documento" -> {
            val modo = a.testo("modo")?.lowercase() ?: "sostituisci"
            if (modo !in listOf("prima", "dopo", "sostituisci")) rifiuta("modo deve essere prima, dopo o sostituisci")
            Proposta.ModificaDocumento(
                a.testo("documento") ?: rifiuta("documento mancante"),
                a["ancora"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() } ?: rifiuta("ancora mancante"),
                a["testo"]?.jsonPrimitive?.contentOrNull ?: rifiuta("testo mancante"), modo,
            )
        }
        "aggiorna_quaderno" -> Proposta.AggiornaQuaderno(pilastro(a), a.testo("testo") ?: rifiuta("testo vuoto"))
        "modifica_quaderno" -> {
            val modo = a.testo("modo")?.lowercase() ?: "sostituisci"
            if (modo !in listOf("aggiungi", "prima", "dopo", "sostituisci")) rifiuta("modo deve essere aggiungi, prima, dopo o sostituisci")
            val testo = a["testo"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }?.trim() ?: ""
            if (testo.isEmpty() && modo != "sostituisci") rifiuta("testo vuoto: per togliere una frase usa modo sostituisci")
            val ancora = a["ancora"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }?.takeIf { it.isNotBlank() }
            if (modo == "aggiungi") Proposta.ModificaQuaderno(pilastro(a), "", testo, modo)
            else Proposta.ModificaQuaderno(pilastro(a), ancora ?: rifiuta("ancora mancante: per aggiungere in fondo usa modo aggiungi"), testo, modo)
        }
        "crea_rituale" -> {
            val criterio = a.testo("criterio")
            if (criterio != null && Stabilita.leggiCriterio(criterio) == null)
                rifiuta("criterio non leggibile: forma TIPO>=numero, TIPO fra ${TIPI.joinToString("/")}")
            Proposta.CreaRituale(a.testo("nome") ?: rifiuta("nome mancante"), pilastro(a), criterio?.let { Stabilita.leggiCriterio(it).toString() })
        }
        "spunta_rituale" -> Proposta.SpuntaRituale(a.testo("nome") ?: rifiuta("nome mancante"), giorno(a, oggi))
        "aggiungi_nodi" -> {
            val nodi = runCatching { a["nodi"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull?.trim()?.takeIf(String::isNotEmpty) } }.getOrNull().orEmpty()
                .distinctBy { Testi.normalizza(it) }
            if (nodi.size !in 1..30) rifiuta("servono da 1 a 30 nodi, come elenco di etichette")
            nodi.find { it.length > 80 }?.let { rifiuta("«${Testi.corto(it, 40)}» è una frase, non un'etichetta: accorciala") }
            val pil = a.testo("pilastro")?.uppercase()?.let { t -> Pilastro.entries.find { it.name == t } ?: rifiuta("pilastro sconosciuto (usa ${PILASTRI.joinToString("/")})") }
            Proposta.AggiungiNodi(a.testo("percorso") ?: rifiuta("percorso mancante"), nodi, a.testo("sotto")?.trim()?.takeIf { it.isNotEmpty() }, pilastro = pil)
        }
        "sposta_nodi" -> {
            val nodi = runCatching { a["nodi"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull?.trim()?.takeIf(String::isNotEmpty) } }.getOrNull().orEmpty()
                .distinctBy { Testi.normalizza(it) }
            if (nodi.size !in 1..40) rifiuta("servono da 1 a 40 nodi, come elenco di etichette")
            Proposta.SpostaNodi(a.testo("percorso") ?: rifiuta("percorso mancante"), nodi, a.testo("sotto")?.trim()?.takeIf { it.isNotEmpty() })
        }
        "pilastro_nodo" -> Proposta.PilastroNodo(a.testo("percorso") ?: rifiuta("percorso mancante"), a.testo("nodo") ?: rifiuta("nodo mancante"), pilastro(a))
        "togli_nodo" -> Proposta.TogliNodo(a.testo("percorso") ?: rifiuta("percorso mancante"), a.testo("nodo") ?: rifiuta("nodo mancante"))
        "stato_nodo" -> {
            val stato = a.testo("stato")?.uppercase()?.let { s -> StatoNodo.entries.find { it.name == s } } ?: rifiuta("stato sconosciuto (usa ${STATI.joinToString("/")})")
            Proposta.StatoDelNodo(a.testo("percorso") ?: rifiuta("percorso mancante"), a.testo("nodo") ?: rifiuta("nodo mancante"), stato)
        }
        "crea_evento" -> {
            val titolo = a.testo("titolo") ?: rifiuta("titolo mancante")
            if (titolo.length > 100) rifiuta("il titolo è un testo, non un nome: accorcialo e metti il resto nelle note")
            val grezzo = a.testo("inizio") ?: rifiuta("inizio mancante")
            val (inizio, tutto) = Agenda.interpretaInizio(grezzo) ?: rifiuta("inizio non leggibile: usa yyyy-MM-ddTHH:mm, o yyyy-MM-dd per tutto il giorno")
            if (inizio.toLocalDate().isBefore(oggi)) rifiuta("il ${inizio.toLocalDate()} è passato: il calendario è per ciò che viene")
            if (inizio.toLocalDate().isAfter(oggi.plusYears(2))) rifiuta("il ${inizio.toLocalDate()} è oltre due anni: controlla l'anno")
            val durata = intero(a, "durata_minuti", 60)
            if (!tutto && durata !in 5..1440) rifiuta("durata di $durata minuti fuori dall'intervallo 5–1440")
            Proposta.CreaEvento(titolo, if (tutto) inizio.toLocalDate().toString() else inizio.toString(), if (tutto) 0 else durata,
                a.testo("luogo") ?: "", a.testo("note") ?: "")
        }
        "sposta_evento" -> {
            val (titolo, giorno, ora) = occorrenza(a, oggi)
            val nuovo = a.testo("nuovo_inizio")
            if (nuovo != null) {
                val soloOra = nuovo.length <= 5 && Impegni.ora(nuovo) != null
                val data = if (soloOra) null else Agenda.interpretaInizio(nuovo)?.first
                    ?: rifiuta("nuovo_inizio non leggibile: yyyy-MM-ddTHH:mm, HH:mm o yyyy-MM-dd")
                if (data != null && data.toLocalDate().isBefore(oggi)) rifiuta("il ${data.toLocalDate()} è passato: il calendario è per ciò che viene")
            }
            val durata = a["nuova_durata_minuti"]?.let { intero(a, "nuova_durata_minuti", 0) }
            if (durata != null && durata !in 5..1440) rifiuta("durata di $durata minuti fuori dall'intervallo 5–1440")
            val nuovoTitolo = a.testo("nuovo_titolo")
            val nuovoLuogo = a.testo("nuovo_luogo")
            if (nuovo == null && durata == null && nuovoTitolo == null && nuovoLuogo == null) rifiuta("non c'è niente da cambiare: indica nuovo_inizio, durata, titolo o luogo")
            Proposta.SpostaEvento(titolo, giorno, ora, nuovo, durata, nuovoTitolo, nuovoLuogo)
        }
        "togli_evento" -> {
            val (titolo, giorno, ora) = occorrenza(a, oggi)
            val quali = a.testo("quali")
            val portata = quali?.let { Portata.da(it) ?: rifiuta("quali deve essere ${Portata.entries.joinToString("/") { p -> p.chiave }}") }
            Proposta.TogliEvento(titolo, giorno, ora, portata)
        }
        "proponi_esperimento" -> {
            val titolo = a.testo("titolo") ?: rifiuta("titolo mancante")
            if (titolo.length > 100) rifiuta("il titolo è un testo: dillo in una riga, il resto va in perche")
            val tipo = a.testo("misura")?.uppercase()?.let { t -> TipoMisura.entries.find { it.name == t } }
                ?: rifiuta("misura sconosciuta (usa ${TIPI.joinToString("/")})")
            val direzione = a.testo("direzione")?.lowercase()?.let { d -> Direzione.entries.find { it.chiave == d || it.name.lowercase() == d } }
                ?: rifiuta("direzione deve essere su o giu")
            val giorni = intero(a, "giorni", Esperimenti.GIORNI_PREDEFINITI)
            if (giorni !in Esperimenti.GIORNI_MINIMI..Esperimenti.GIORNI_MASSIMI)
                rifiuta("durata di $giorni giorni fuori da ${Esperimenti.GIORNI_MINIMI}–${Esperimenti.GIORNI_MASSIMI}: più corto non si distingue dal caso, più lungo si dimentica")
            val soglia = a.numero("soglia") ?: Esperimenti.sogliaPredefinita(tipo)
            if (soglia <= 0) rifiuta("la soglia deve essere maggiore di zero")
            if (regole.esperimentiAperti.size >= Esperimenti.APERTI_MASSIMI)
                rifiuta("ci sono già ${Esperimenti.APERTI_MASSIMI} esperimenti aperti: di più diventa rumore. Chiedi al Ghost quale lasciare, o aspetta che uno finisca")
            regole.esperimentiAperti.find { it.tipo == tipo }?.let {
                rifiuta("c'è già un esperimento aperto su ${Esperimenti.nomeMisura(tipo)} («${it.titolo}»): due insieme sullo stesso numero non si distinguono")
            }
            Proposta.ApriEsperimento(titolo, tipo, direzione, giorni, soglia, a.testo("perche") ?: "")
        }
        "lascia_esperimento" -> Proposta.LasciaEsperimento(a.testo("titolo") ?: rifiuta("titolo mancante"), a.testo("motivo") ?: "")
        "scrivi_mail" -> {
            val dest = a.testo("a") ?: ""
            if (dest.isNotEmpty() && !Uscita.indirizzoValido(dest)) rifiuta("«$dest» non è un indirizzo: lascia vuoto e lo scrive il Ghost")
            if (dest.isNotEmpty() && regole.indirizziNoti != null && dest.lowercase() !in regole.indirizziNoti)
                rifiuta("il Ghost non ha mai scritto l'indirizzo $dest: non indovinarlo, chiediglielo o lascia vuoto")
            val oggetto = a.testo("oggetto") ?: rifiuta("oggetto mancante")
            val corpo = a.testo("corpo") ?: rifiuta("corpo vuoto")
            val v = Uscita.violazioni("$dest\n$oggetto\n$corpo", regole.nomiProtetti, regole.detteDalGhost)
            if (v.isNotEmpty()) rifiuta("la mail contiene ${v.joinToString { "«$it»" }}, un nome che il Ghost non fa uscire: riscrivila senza")
            Proposta.ScriviMail(dest, oggetto, corpo)
        }
        else -> rifiuta("scrittura non prevista: $nome")
    }

    private fun occorrenza(a: JsonObject, oggi: LocalDate): Triple<String, String, String?> {
        val titolo = a.testo("titolo") ?: rifiuta("titolo mancante")
        val g = Giorni.interpreta(a.testo("giorno"), oggi) ?: rifiuta("giorno non leggibile: usa yyyy-MM-dd")
        if (g.isBefore(oggi)) rifiuta("il $g è passato: si cambia ciò che viene")
        val ora = a.testo("ora")?.let { Impegni.ora(it)?.toString() ?: rifiuta("ora non leggibile: usa HH:mm") }
        return Triple(titolo, g.toString(), ora)
    }

    fun codifica(p: Proposta): String = json.encodeToString(Proposta.serializer(), p)
    fun decodifica(s: String): Proposta = json.decodeFromString(Proposta.serializer(), s)

    fun intero(a: JsonObject, k: String, predefinito: Int) = a[k]?.let { runCatching { it.jsonPrimitive.intOrNull ?: it.jsonPrimitive.doubleOrNull?.toInt() }.getOrNull() } ?: predefinito
    fun stringa(a: JsonObject, k: String) = a.testo(k)
}

object Giorni {
    private val LEGGIBILE = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN)

    fun interpreta(t: String?, oggi: LocalDate): LocalDate? = when (t?.trim()?.lowercase()) {
        null, "", "oggi" -> oggi
        "ieri" -> oggi.minusDays(1)
        "domani" -> oggi.plusDays(1)
        "dopodomani" -> oggi.plusDays(2)
        "l'altro ieri", "altro ieri", "avantieri" -> oggi.minusDays(2)
        else -> runCatching { LocalDate.parse(t.trim().take(10)) }.getOrNull()
    }

    fun leggibile(giorno: String, oggi: LocalDate = LocalDate.now()): String {
        val g = runCatching { LocalDate.parse(giorno) }.getOrNull() ?: return giorno
        return when (g) {
            oggi -> "oggi"
            oggi.minusDays(1) -> "ieri"
            else -> g.format(LEGGIBILE)
        }
    }
}

object Testi {
    fun corto(t: String, n: Int) = t.replace(Regex("\\s+"), " ").trim().let { if (it.length <= n) it else it.take(n - 1).trimEnd() + "…" }

    fun normalizza(t: String) = java.text.Normalizer.normalize(t.lowercase(), java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "").replace(Regex("[^\\p{L}\\p{N} ]"), " ").replace(Regex("\\s+"), " ").trim()

    sealed class Modifica {
        data class Fatta(val testo: String) : Modifica()
        data class Impossibile(val motivo: String) : Modifica()
    }

    // Cosa esce e cosa entra, per intero e con gli a capo: ciò che il Ghost legge prima di confermare.
    fun primaDopo(ancora: String, testo: String, modo: String) = when (modo) {
        "prima" -> "Da inserire PRIMA di:\n$ancora\n\nTesto:\n$testo"
        "dopo" -> "Da inserire DOPO:\n$ancora\n\nTesto:\n$testo"
        else -> "Esce:\n$ancora\n\nEntra:\n" + testo.ifEmpty { "(niente: il pezzo si toglie)" }
    }

    // Il taglia-e-cuci lo fa il programma, mai il modello: un'ancora assente o doppia non indovina.
    fun applicaModifica(testo: String, ancora: String, nuovo: String, modo: String): Modifica {
        if (testo.isBlank()) return Modifica.Impossibile("il testo è vuoto: non c'è niente da cambiare, per scrivere usa modo aggiungi")
        val trovata = when (val a = ancora(testo, ancora)) {
            is Ancora.Assente -> return Modifica.Impossibile("il frammento «${corto(ancora, 60)}» non c'è nel documento")
            is Ancora.Doppia -> return Modifica.Impossibile("il frammento «${corto(ancora, 60)}» compare più di una volta")
            is Ancora.Trovata -> a.dove
        }
        val prima = trovata.first
        val fine = trovata.last + 1
        val risultato = when (modo) {
            "prima" -> testo.substring(0, prima) + unisci(nuovo, testo.substring(prima))
            "dopo" -> unisci(testo.substring(0, fine), nuovo) + testo.substring(fine)
            else -> testo.substring(0, prima) + nuovo + testo.substring(fine)
        }
        return Modifica.Fatta(risultato)
    }

    sealed class Ancora {
        data class Trovata(val dove: IntRange) : Ancora()
        data object Assente : Ancora()
        data object Doppia : Ancora()
    }

    // Prima esatta; poi senza badare agli spazi e agli a capo, perché il modello copia da un testo che ha visto
    // su una riga sola. Unica o niente: due posti possibili non si scelgono a caso.
    fun ancora(testo: String, ancora: String): Ancora {
        if (ancora.isBlank()) return Ancora.Assente
        val esatta = testo.indexOf(ancora)
        if (esatta >= 0) return if (testo.indexOf(ancora, esatta + 1) >= 0) Ancora.Doppia else Ancora.Trovata(esatta until esatta + ancora.length)
        val parole = ancora.trim().split(Regex("\\s+"))
        val simili = Regex(parole.joinToString("\\s+") { Regex.escape(it) }).findAll(testo).take(2).toList()
        return when (simili.size) {
            0 -> Ancora.Assente
            1 -> Ancora.Trovata(simili[0].range)
            else -> Ancora.Doppia
        }
    }

    private fun unisci(a: String, b: String): String {
        if (a.isEmpty() || b.isEmpty()) return a + b
        return if (a.last().isWhitespace() || b.first().isWhitespace()) a + b else "$a $b"
    }

    // Quando il modello dice «fatto» senza aver proposto niente, lo si dice: la ricevuta vale, la frase no.
    private val AFFERMA = Regex(
        """\b(ho|abbiamo)\s+(appena\s+)?(registrat|salvat|creat|aggiornat|annotat|segnat|aggiunt|modificat|cancellat|eliminat|spuntat|inserit|scritt)[oaie]\b""",
        RegexOption.IGNORE_CASE,
    )
    fun affermaAzione(t: String) = AFFERMA.containsMatchIn(t)

    // Quando il modello promette di tornare da solo («ti ricorderò», «domani riprendiamo»): non ha un modo di farlo.
    // Visto il 24/09 con Gemini. Tornare lo fa solo un evento in calendario, o il Ghost.
    private val PROMETTE = Regex(
        """\b(ti|te\s+l[oa]|ve\s+l[oa])\s+ricorder[òo](?!\w)|\bti\s+(avviser|riscriver|richiamer|ricontatter|aggiorner)[òo](?!\w)|""" +
            """\b(domani|stasera|più\s+tardi|la\s+prossima\s+volta)[,]?\s+(riprendiamo|continuiamo|ne\s+riparliamo|ci\s+torniamo)\b|""" +
            """\b(riprendiamo|continuiamo|ne\s+riparliamo|ci\s+torniamo)\s+(domani|stasera|più\s+tardi)\b|\btorner[òo]\s+(io\s+)?(a\s+chiedert|a\s+scrivert|su\s+quest)""",
        RegexOption.IGNORE_CASE,
    )
    fun promette(t: String) = PROMETTE.containsMatchIn(t)

    // Lo Shell che imita la voce del programma (visto in riunione il 26/09: «[Nota del programma: la riunione è chiusa…]»).
    // Quella riga distingue ciò che è successo da ciò che è stato detto: se la scrive il modello, non distingue più.
    private val FINTA_NOTA = Regex("""\[\s*nota del programma[^\]]*]""", RegexOption.IGNORE_CASE)
    fun fintaNota(t: String) = FINTA_NOTA.containsMatchIn(t)
    fun senzaFinteNote(t: String) = t.replace(FINTA_NOTA, "").replace(Regex("\n{3,}"), "\n\n").trim()

    // Le chiamate scritte come testo invece che fatte (visto il 26/09 con un modello leggero): «crea_evento(titolo=…)».
    // Il Ghost le legge come proposte, e non esiste niente da confermare.
    fun chiamateScritte(t: String, nomi: Collection<String>): List<String> =
        nomi.filter { n -> Regex("""(?<![\w])""" + Regex.escape(n) + """\s*\(""").containsMatchIn(t) }
}
