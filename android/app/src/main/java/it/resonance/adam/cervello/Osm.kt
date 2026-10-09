package it.resonance.adam.cervello

import it.resonance.adam.logica.Mappa
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

// OpenStreetMap (logica/Mappa.kt): Nominatim trova il centro, Overpass i luoghi. Il 02/10 il server principale di
// Overpass rispondeva «troppo occupato» e un altro funzionava: si provano tre server in fila. Un errore si dice, non si
// nasconde: torna come testo nella scheda della ricerca.
open class Osm(private val http: OkHttpClient = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS).callTimeout(90, TimeUnit.SECONDS).build()) {

    data class Risposta(val luoghi: List<Mappa.Luogo>, val errore: String? = null)

    private val agente = "Resonance/2 (app personale Android)"
    private val server = listOf("https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter")

    open suspend fun cerca(vicinoA: String, km: Int, filtri: List<Mappa.Filtro>): Risposta = withContext(Dispatchers.IO) {
        val url = "https://nominatim.openstreetmap.org/search".toHttpUrl().newBuilder()
            .addQueryParameter("q", vicinoA).addQueryParameter("format", "jsonv2").addQueryParameter("limit", "1").build()
        val centro = runCatching {
            http.newCall(Request.Builder().url(url).header("User-Agent", agente).build()).execute().use { r -> Mappa.centro(r.body.string()) }
        }.getOrNull() ?: return@withContext Risposta(emptyList(), "non ho trovato «$vicinoA» sulla mappa")
        val q = Mappa.query(filtri, centro.first, centro.second, km)
        var ultimo = "nessun server ha risposto"
        for (s in server) {
            val testo = runCatching {
                http.newCall(Request.Builder().url(s).header("User-Agent", agente).post(FormBody.Builder().add("data", q).build()).build())
                    .execute().use { r -> if (r.isSuccessful) r.body.string() else { ultimo = "HTTP ${r.code}"; null } }
            }.onFailure { ultimo = it.message ?: it.javaClass.simpleName }.getOrNull() ?: continue
            if (!testo.trimStart().startsWith("{")) { ultimo = "server occupato"; continue }
            return@withContext Risposta(Mappa.luoghi(testo, centro.first, centro.second))
        }
        // Overpass non risponde: si ripiega su Nominatim, una categoria per volta (al massimo una domanda al secondo, è la sua regola).
        val luoghi = mutableListOf<Mappa.Luogo>()
        for ((i, c) in Mappa.categorie(filtri).withIndex()) {
            if (i > 0) kotlinx.coroutines.delay(1100)
            val u = "https://nominatim.openstreetmap.org/search".toHttpUrl().newBuilder().addQueryParameter("q", c).addQueryParameter("format", "jsonv2")
                .addQueryParameter("limit", "50").addQueryParameter("extratags", "1").addQueryParameter("bounded", "1")
                .addQueryParameter("viewbox", Mappa.riquadro(centro.first, centro.second, km)).build()
            runCatching {
                http.newCall(Request.Builder().url(u).header("User-Agent", agente).build()).execute().use { r ->
                    if (r.isSuccessful) luoghi += Mappa.luoghiNominatim(r.body.string(), centro.first, centro.second, km, filtri)
                }
            }
        }
        if (luoghi.isNotEmpty()) return@withContext Risposta(luoghi.distinctBy { it.nome.lowercase() + "@" + Math.round(it.km) }.sortedBy { it.km },
            "Overpass non ha risposto ($ultimo): luoghi da Nominatim, meno completi")
        Risposta(emptyList(), "la mappa non ha risposto ($ultimo)")
    }
}
