package it.resonance.adam.logica

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

// La mappa come fonte (02/10/2026, notte): OpenStreetMap dice che un posto ESISTE e DOVE, con la categoria (la cucina, il
// tipo di negozio, lo studio medico). Non dice se è buono: per quello ci sono le recensioni e i forum, e l'incrocio
// (logica/Incrocio.kt) li mette insieme. Gratis, senza chiave; esce solo il nome di un paese, mai la posizione del telefono.
// Forme verificate dal vivo il 02/10 su Nominatim (jsonv2) e Overpass (out center tags).
object Mappa {
    const val KM_MAX = 80
    const val MASSIMO = 120

    data class Luogo(val nome: String, val dove: String, val km: Double, val categoria: String, val url: String)

    data class Filtro(val chiave: String, val valori: String)

    // Il modello scrive i filtri come li scrive OpenStreetMap («amenity=restaurant», «cuisine=ethiopian|eritrean»). Il
    // programma li accetta solo in questa forma: niente virgolette né parentesi, così nessun testo diventa una query.
    private val FILTRO = Regex("^([a-z_:]{2,30})=([A-Za-z0-9_|; .:-]{1,200})$")

    fun filtri(righe: List<String>): List<Filtro>? = righe.map { it.trim() }.filter { it.isNotEmpty() }.map { r ->
        FILTRO.matchEntire(r)?.let { Filtro(it.groupValues[1], it.groupValues[2].trim()) } ?: return null
    }.takeIf { it.isNotEmpty() }

    /** La domanda a Overpass: tutto ciò che ha un nome e tutti i filtri, entro km dal centro. */
    fun query(filtri: List<Filtro>, lat: Double, lon: Double, km: Int): String {
        val condizioni = filtri.joinToString("") { f ->
            if ('|' in f.valori) "[\"${f.chiave}\"~\"${f.valori}\",i]" else "[\"${f.chiave}\"=\"${f.valori}\"]"
        }
        return "[out:json][timeout:25];nwr$condizioni[\"name\"](around:${km.coerceIn(1, KM_MAX) * 1000},$lat,$lon);out center tags $MASSIMO;"
    }

    private val json = Json { ignoreUnknownKeys = true }

    /** Il centro, dalla risposta di Nominatim (format=jsonv2): il primo risultato. */
    fun centro(testo: String): Pair<Double, Double>? = runCatching {
        val primo = json.parseToJsonElement(testo).jsonArray.firstOrNull()?.jsonObject ?: return null
        primo["lat"]!!.jsonPrimitive.content.toDouble() to primo["lon"]!!.jsonPrimitive.content.toDouble()
    }.getOrNull()

    /** I luoghi dalla risposta di Overpass, con la distanza in linea d'aria dal centro, i più vicini prima. */
    fun luoghi(testo: String, lat: Double, lon: Double): List<Luogo> = runCatching {
        json.parseToJsonElement(testo).jsonObject["elements"]!!.jsonArray.mapNotNull { e ->
            val o = e.jsonObject
            val t = o["tags"]?.jsonObject ?: return@mapNotNull null
            fun tag(k: String) = t[k]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val nome = tag("name").ifEmpty { return@mapNotNull null }
            val c = o["center"]?.jsonObject
            val la = (o["lat"] ?: c?.get("lat"))?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val lo = (o["lon"] ?: c?.get("lon"))?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val tipo = o["type"]?.jsonPrimitive?.contentOrNull ?: "node"
            Luogo(nome, tag("addr:city").ifEmpty { tag("addr:place") }, distanza(lat, lon, la, lo),
                listOf("cuisine", "shop", "healthcare", "amenity", "tourism", "craft").map { tag(it) }.firstOrNull { it.isNotEmpty() }.orEmpty().replace(';', ','),
                tag("website").ifEmpty { "https://www.openstreetmap.org/$tipo/${o["id"]?.jsonPrimitive?.contentOrNull}" })
        }.distinctBy { Incrocio.chiave(it.nome) + "@" + it.dove.lowercase() + "@" + Math.round(it.km) }.sortedBy { it.km }
    }.getOrDefault(emptyList())

    // ── Il ripiego: Nominatim (05/10/2026) ──
    // Overpass è spesso occupato o irraggiungibile (il 02/10 il server principale, il 05/10 tutti e tre da qui). Nominatim
    // cerca per categoria in un riquadro: meno completo (al massimo 50 per categoria) ma risponde. Una categoria per
    // domanda, dalla prima regola; le altre regole si controllano sui tag che Nominatim restituisce.

    /** Le categorie per Nominatim: «[amenity=restaurant]», una per valore della prima regola, al massimo tre. */
    fun categorie(filtri: List<Filtro>): List<String> = filtri.firstOrNull()?.let { f ->
        f.valori.split('|').map { it.trim() }.filter { it.isNotEmpty() }.take(3).map { "[${f.chiave}=$it]" }
    }.orEmpty()

    /** Il riquadro attorno al centro, in gradi: «ovest,nord,est,sud», come lo vuole Nominatim. */
    fun riquadro(lat: Double, lon: Double, km: Int): String {
        val dLat = km / 111.0
        val dLon = km / (111.0 * cos(Math.toRadians(lat)))
        return "%.5f,%.5f,%.5f,%.5f".format(java.util.Locale.ROOT, lon - dLon, lat + dLat, lon + dLon, lat - dLat)
    }

    /** I luoghi dalla risposta di Nominatim (jsonv2 con extratags), entro km, che rispettano anche le altre regole. */
    fun luoghiNominatim(testo: String, lat: Double, lon: Double, km: Int, filtri: List<Filtro>): List<Luogo> = runCatching {
        json.parseToJsonElement(testo).jsonArray.mapNotNull { e ->
            val o = e.jsonObject
            val nome = o["name"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty().ifEmpty { return@mapNotNull null }
            val la = o["lat"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: return@mapNotNull null
            val lo = o["lon"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: return@mapNotNull null
            val extra = o["extratags"]?.let { runCatching { it.jsonObject }.getOrNull() }
            fun tag(k: String) = extra?.get(k)?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val tipo = o["type"]?.jsonPrimitive?.contentOrNull.orEmpty()
            val altre = filtri.drop(1).all { f -> f.valori.split('|').any { v -> tag(f.chiave).split(';').any { it.trim().equals(v.trim(), true) } } }
            if (!altre) return@mapNotNull null
            val km0 = distanza(lat, lon, la, lo)
            if (km0 > km) return@mapNotNull null
            val dove = o["display_name"]?.jsonPrimitive?.contentOrNull.orEmpty().split(',').map { it.trim() }
                .firstOrNull { p -> p.isNotEmpty() && p != nome && !p.any { it.isDigit() } && !p.startsWith("Via ") && !p.startsWith("Piazza ") }.orEmpty()
            Luogo(nome, dove, km0, tag("cuisine").ifEmpty { tipo }.replace(';', ','),
                tag("website").ifEmpty { tag("contact:website") }.ifEmpty { "https://www.openstreetmap.org/${o["osm_type"]?.jsonPrimitive?.contentOrNull}/${o["osm_id"]?.jsonPrimitive?.contentOrNull}" })
        }
    }.getOrDefault(emptyList())

    fun distanza(la1: Double, lo1: Double, la2: Double, lo2: Double): Double {
        val r = 6371.0
        val dLa = Math.toRadians(la2 - la1)
        val dLo = Math.toRadians(lo2 - lo1)
        val a = sin(dLa / 2).pow(2) + cos(Math.toRadians(la1)) * cos(Math.toRadians(la2)) * sin(dLo / 2).pow(2)
        return 2 * r * asin(sqrt(a))
    }
}
