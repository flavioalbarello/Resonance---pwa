package it.resonance.adam.logica

import it.resonance.adam.dati.Documento
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo
import it.resonance.adam.dati.Quaderno
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.TipoMisura
import it.resonance.adam.dati.Voce
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

data class NodoImportato(val idPwa: String, val nodo: Nodo)
data class DocumentoImportato(val idNodoPwa: String?, val documento: Documento)
data class PercorsoImportato(val percorso: Percorso, val nodi: List<NodoImportato>, val documenti: List<DocumentoImportato>)

data class Importato(
    val misure: List<Misura>,
    val voci: List<Voce>,
    val percorsi: List<PercorsoImportato>,
    val quaderni: List<Quaderno>,
    val profilo: Profilo?,
    val scartati: List<String>,
)

object ImportPwa {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    class NonEUnBackup(m: String) : Exception(m)

    fun leggi(testo: String, ora: Long = System.currentTimeMillis(), zona: ZoneId = ZoneId.systemDefault()): Importato {
        val radice = runCatching { json.parseToJsonElement(testo) as JsonObject }.getOrNull()
            ?: throw NonEUnBackup("Il file non è JSON leggibile.")
        if (radice.str("_formato") != "resonance-backup") throw NonEUnBackup("Il file non è un backup della PWA di Resonance.")
        val s = radice["syncState"] as? JsonObject ?: throw NonEUnBackup("Il backup non contiene syncState.")

        val misure = mutableListOf<Misura>()
        val voci = mutableListOf<Voce>()
        val scartati = mutableListOf<String>()
        val oggi = LocalDate.now(zona).toString()

        for (e in s.arr("bio")) {
            val o = e as? JsonObject ?: continue
            val id = o.str("id") ?: continue
            val giorno = giorno(o.str("date")) ?: run { scartati += "voce BIO $id senza data"; continue }
            val ist = istante(giorno, zona)
            o.str("weight")?.let { w ->
                val kg = numero(w)
                if (kg != null && kg in TipoMisura.PESO.minimo..TipoMisura.PESO.massimo)
                    misure += Misura(tipo = TipoMisura.PESO, valore = kg, giorno = giorno, istante = ist, fonte = "pwa", idEsterno = "pwa:bio:$id:peso")
                else if (w.isNotBlank()) scartati += "peso non leggibile «$w» del $giorno"
            }
            val sonnoTesto = o.str("sleep")?.trim().orEmpty()
            val minuti = minutiDiSonno(sonnoTesto)
            if (minuti != null) misure += Misura(tipo = TipoMisura.SONNO, valore = minuti.toDouble(), giorno = giorno, istante = ist, fonte = "pwa", idEsterno = "pwa:bio:$id:sonno")
            val testo = listOfNotNull(
                sonnoTesto.takeIf { it.isNotEmpty() && minuti == null }?.let { "Sonno: $it" },
                o.str("notes")?.trim()?.takeIf { it.isNotEmpty() },
            ).joinToString("\n")
            if (testo.isNotEmpty()) voci += Voce(pilastro = Pilastro.BIO, giorno = giorno, testo = testo, fonte = "pwa", creato = ist, aggiornato = ist, idEsterno = "pwa:bio:$id")
        }
        for ((chiave, pil) in listOf("air" to Pilastro.AIR, "vidya" to Pilastro.VIDYA)) {
            for (e in s.arr(chiave)) {
                val o = e as? JsonObject ?: continue
                val id = o.str("id") ?: continue
                val giorno = giorno(o.str("date")) ?: run { scartati += "voce ${pil.etichetta} $id senza data"; continue }
                val titolo = o.str("title")?.trim().orEmpty()
                val stato = o.str("status")?.trim()?.takeIf { it.isNotEmpty() }?.let { " — $it" } ?: ""
                val note = o.str("notes")?.trim()?.takeIf { it.isNotEmpty() }?.let { "\n$it" } ?: ""
                val testo = "$titolo$stato$note".trim()
                if (testo.isEmpty()) continue
                val ist = istante(giorno, zona)
                voci += Voce(pilastro = pil, giorno = giorno, testo = testo, fonte = "pwa", creato = ist, aggiornato = ist, idEsterno = "pwa:$chiave:$id")
            }
        }

        val percorsi = mutableListOf<PercorsoImportato>()
        for ((chiave, pil) in listOf("pBio" to Pilastro.BIO, "pAir" to Pilastro.AIR, "pVidya" to Pilastro.VIDYA)) {
            for (e in s.arr(chiave)) {
                val o = e as? JsonObject ?: continue
                val id = o.str("id") ?: continue
                val titolo = o.str("title")?.trim()?.takeIf { it.isNotEmpty() } ?: continue
                val scopo = listOfNotNull(o.str("identityGoal"), o.str("divenire"), o.str("description")).firstOrNull { it.isNotBlank() }.orEmpty()
                val nodi = o.arr("topics").mapIndexedNotNull { i, t ->
                    val n = t as? JsonObject ?: return@mapIndexedNotNull null
                    val nid = n.str("id") ?: return@mapIndexedNotNull null
                    val etichetta = (n.str("label") ?: n.str("title"))?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapIndexedNotNull null
                    NodoImportato(nid, Nodo(percorsoId = 0, etichetta = etichetta, stato = statoNodo(n.str("status")), ordine = i))
                }
                val documenti = o.arr("documents").mapNotNull { d ->
                    val doc = d as? JsonObject ?: return@mapNotNull null
                    val t = doc.str("title")?.trim()?.takeIf { it.isNotEmpty() } ?: "Senza titolo"
                    val testo = doc.str("text").orEmpty()
                    if (testo.isBlank()) scartati += "documento «$t» senza testo (nella PWA c'era solo il nome)"
                    val quando = istanteLibero(doc.str("date"), zona) ?: ora
                    DocumentoImportato(doc.str("nodoId") ?: doc.str("nodeId"), Documento(percorsoId = 0, titolo = t, testo = testo, creato = quando, aggiornato = quando))
                }
                percorsi += PercorsoImportato(
                    Percorso(pilastro = pil, titolo = titolo, scopo = scopo.trim(), creato = istanteLibero(o.str("createdAt"), zona) ?: ora, idEsterno = "pwa:percorso:$id"),
                    nodi, documenti,
                )
            }
        }

        val quaderni = mutableListOf<Quaderno>()
        (s["memory"] as? JsonObject)?.let { m ->
            for ((k, pil) in listOf("bio" to Pilastro.BIO, "air" to Pilastro.AIR, "vidya" to Pilastro.VIDYA)) {
                val v = m[k]
                val corrente = when (v) {
                    is JsonPrimitive -> v.contentOrNull
                    is JsonObject -> v.str("corrente")
                    else -> null
                }?.trim()
                if (!corrente.isNullOrEmpty()) quaderni += Quaderno(pil, corrente, ora)
            }
        }
        (s["styleMemory"] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }?.let {
            quaderni += Quaderno(Pilastro.ADAM, "Come parlarmi (memoria di stile dalla PWA):\n$it", ora)
        }
        (s["kernel"] as? JsonObject)?.str("content")?.trim()?.takeIf { it.isNotEmpty() }?.let {
            voci += Voce(pilastro = Pilastro.ADAM, giorno = oggi, testo = "Kernel importato dalla PWA:\n$it", fonte = "pwa", creato = ora, aggiornato = ora, idEsterno = "pwa:kernel")
        }

        val profilo = (s["ghostProfile"] as? JsonObject)?.let { p ->
            val stile = (p["cognitiveStyle"] as? JsonObject)?.let { c ->
                listOfNotNull(c.str("notes"), c.str("responseFormat"), c.str("channel")?.let { "Canale: $it" }, c.str("density")?.let { "Densità: $it" })
                    .filter { it.isNotBlank() }.joinToString("\n")
            }.orEmpty()
            val motivazione = (p["freeform"] as? JsonObject)?.let { f ->
                listOfNotNull(f.str("motivation"), f.str("context"), f.str("request")).filter { it.isNotBlank() }.joinToString("\n")
            }.orEmpty()
            val vincoli = (p["hardConstraints"] as? JsonArray).orEmpty().mapNotNull { v ->
                val o = v as? JsonObject ?: return@mapNotNull null
                val t = o.str("testo")?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                val pil = o.str("pilastro")?.uppercase()?.takeIf { it.isNotBlank() } ?: "TUTTI"
                "[$pil] $t"
            }.joinToString("\n")
            Profilo(nome = p.str("name").orEmpty(), stile = stile, motivazione = motivazione, vincoli = vincoli)
        }

        return Importato(misure, voci, percorsi, quaderni, profilo, scartati)
    }

    fun statoNodo(s: String?): StatoNodo {
        val t = s?.lowercase().orEmpty()
        return when {
            "consolid" in t -> StatoNodo.CONSOLIDATO
            "pratic" in t -> StatoNodo.PRATICATO
            "introd" in t -> StatoNodo.INTRODOTTO
            else -> StatoNodo.NON_INIZIATO
        }
    }

    fun numero(t: String): Double? = t.trim().replace(',', '.').replace(Regex("[^0-9.]"), "").toDoubleOrNull()

    private val SOLO_ORE = Regex("""^\s*(\d{1,2})(?:[.,](\d+))?\s*(?:h|ore)?\s*$""", RegexOption.IGNORE_CASE)
    private val ORE_MINUTI = Regex("""(\d{1,2})\s*(?:h|:|ore)\s*(?:e\s*)?(\d{1,2})\b""", RegexOption.IGNORE_CASE)
    private val ORE = Regex("""(\d{1,2}(?:[.,]\d+)?)\s*(?:h|ore)\b""", RegexOption.IGNORE_CASE)

    // Un numero isolato è un'ora di sonno solo se è tutto ciò che c'è scritto: «3 apnee» non sono 3 ore.
    fun minutiDiSonno(t: String): Int? {
        if (t.isBlank()) return null
        SOLO_ORE.find(t)?.let { m ->
            val ore = "${m.groupValues[1]}.${m.groupValues[2].ifEmpty { "0" }}".toDouble()
            return (ore * 60).roundToInt().takeIf { ore in 0.5..16.0 }
        }
        ORE_MINUTI.find(t)?.let { m ->
            val min = m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()
            return min.takeIf { m.groupValues[2].toInt() < 60 && min in 30..960 }
        }
        ORE.find(t)?.let { m ->
            val ore = m.groupValues[1].replace(',', '.').toDouble()
            return (ore * 60).roundToInt().takeIf { ore in 0.5..16.0 }
        }
        return null
    }

    private fun giorno(t: String?): String? = t?.trim()?.take(10)?.let { runCatching { LocalDate.parse(it).toString() }.getOrNull() }
    private fun istante(giorno: String, zona: ZoneId) = LocalDate.parse(giorno).atTime(12, 0).atZone(zona).toInstant().toEpochMilli()
    private fun istanteLibero(t: String?, zona: ZoneId): Long? {
        if (t.isNullOrBlank()) return null
        t.toLongOrNull()?.let { return it }
        return runCatching { Instant.parse(t).toEpochMilli() }.getOrNull()
            ?: giorno(t)?.let { istante(it, zona) }
    }

    private fun JsonObject.str(k: String): String? = when (val v = this[k]) {
        is JsonPrimitive -> v.contentOrNull
        else -> null
    }
    private fun JsonObject.arr(k: String): List<JsonElement> = (this[k] as? JsonArray).orEmpty()
}
