package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.StatoNodo
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

enum class Effetto { LETTURA, SCRITTURA }

// Il modello non esegue niente: propone. Una scrittura diventa una proposta che il Ghost
// conferma, e la ricevuta la scrive il programma dopo averla eseguita davvero.
@Serializable
sealed class Proposta {
    abstract fun descrizione(): String

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
    }

    @Serializable @SerialName("modifica_documento")
    data class ModificaDocumento(val documento: String, val ancora: String, val testo: String, val modo: String) : Proposta() {
        override fun descrizione() = when (modo) {
            "prima" -> "In «$documento», inserire prima di «${Testi.corto(ancora, 60)}»: «${Testi.corto(testo, 120)}»"
            "dopo" -> "In «$documento», inserire dopo «${Testi.corto(ancora, 60)}»: «${Testi.corto(testo, 120)}»"
            else -> "In «$documento», sostituire «${Testi.corto(ancora, 60)}» con «${Testi.corto(testo, 120)}»"
        }
    }

    @Serializable @SerialName("aggiorna_quaderno")
    data class AggiornaQuaderno(val pilastro: Pilastro, val testo: String) : Proposta() {
        override fun descrizione() = "Riscrivere il quaderno ${pilastro.etichetta} (${testo.length} caratteri; il testo precedente resta nello storico)"
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

    @Serializable @SerialName("scrivi_mail")
    data class ScriviMail(val a: String, val oggetto: String, val corpo: String) : Proposta() {
        override fun descrizione() = "Preparare una mail" + (if (a.isNotBlank()) " a $a" else " (destinatario lo scrivi tu)") +
            " — «${Testi.corto(oggetto, 60)}»: «${Testi.corto(corpo, 160)}». Si apre come bozza nell'app di posta: parte solo se premi Invia tu."
    }
}

// Ciò che il programma sa del turno e che il modello non può cambiare.
data class Regole(
    val nomiProtetti: List<String> = emptyList(),
    // null = non controllare (per le prove); altrimenti gli indirizzi che il Ghost ha scritto davvero.
    val indirizziNoti: Set<String>? = null,
    val detteDalGhost: String = "",
)

sealed class Validazione {
    data class Lettura(val nome: String, val argomenti: JsonObject) : Validazione()
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
        Strumento("crea_percorso", Effetto.SCRITTURA, "Propone un nuovo percorso con i suoi nodi.",
            schema(listOf("pilastro", "titolo", "nodi"), mapOf(
                "pilastro" to e(PILASTRI.filter { it != "ADAM" }, "Pilastro"), "titolo" to s("Nome breve del percorso, non una frase"),
                "scopo" to s("Chi diventa il Ghost percorrendolo"), "nodi" to lista("Tappe, da 3 a 12"),
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
            "Propone di riscrivere il quaderno di un pilastro (memoria procedurale). Il testo sostituisce il precedente: includi ciò che resta valido.",
            schema(listOf("pilastro", "testo"), mapOf("pilastro" to e(PILASTRI, "Pilastro"), "testo" to s("Testo completo del quaderno")))),
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
        Strumento("scrivi_mail", Effetto.SCRITTURA,
            "Propone una mail. Dopo la conferma si apre come bozza nell'app di posta e la invia il Ghost: non dire mai che è partita.",
            schema(listOf("oggetto", "corpo"), mapOf(
                "a" to s("Indirizzo esatto come l'ha scritto il Ghost; lascia vuoto se non te l'ha dato"),
                "oggetto" to s("Oggetto"), "corpo" to s("Testo completo"),
            ))),
        Strumento("stato_nodo", Effetto.SCRITTURA, "Propone di cambiare lo stato di un nodo di un percorso.",
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

    private fun scrittura(nome: String, a: JsonObject, oggi: LocalDate, regole: Regole): Proposta = when (nome) {
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
            if (p == Pilastro.ADAM) rifiuta("un percorso appartiene a BIO, AIR o VIDYA")
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
        "crea_rituale" -> {
            val criterio = a.testo("criterio")
            if (criterio != null && Stabilita.leggiCriterio(criterio) == null)
                rifiuta("criterio non leggibile: forma TIPO>=numero, TIPO fra ${TIPI.joinToString("/")}")
            Proposta.CreaRituale(a.testo("nome") ?: rifiuta("nome mancante"), pilastro(a), criterio?.let { Stabilita.leggiCriterio(it).toString() })
        }
        "spunta_rituale" -> Proposta.SpuntaRituale(a.testo("nome") ?: rifiuta("nome mancante"), giorno(a, oggi))
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

    // Il taglia-e-cuci lo fa il programma, mai il modello: un'ancora assente o doppia non indovina.
    fun applicaModifica(testo: String, ancora: String, nuovo: String, modo: String): Modifica {
        val prima = testo.indexOf(ancora)
        if (prima < 0) return Modifica.Impossibile("il frammento «${corto(ancora, 60)}» non c'è nel documento")
        if (testo.indexOf(ancora, prima + 1) >= 0) return Modifica.Impossibile("il frammento «${corto(ancora, 60)}» compare più di una volta")
        val fine = prima + ancora.length
        val risultato = when (modo) {
            "prima" -> testo.substring(0, prima) + unisci(nuovo, testo.substring(prima))
            "dopo" -> unisci(testo.substring(0, fine), nuovo) + testo.substring(fine)
            else -> testo.substring(0, prima) + nuovo + testo.substring(fine)
        }
        return Modifica.Fatta(risultato)
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
}
