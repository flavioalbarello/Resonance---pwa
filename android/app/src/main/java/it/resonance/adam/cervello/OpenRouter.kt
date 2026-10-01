package it.resonance.adam.cervello

import it.resonance.adam.logica.Consulente
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSource
import java.util.concurrent.TimeUnit

data class ChiamataStrumento(val id: String, val nome: String, val argomenti: String)

data class Risposta(val testo: String, val chiamate: List<ChiamataStrumento>, val costo: Double?, val assistente: JsonObject, val troncata: Boolean)

data class RispostaWeb(val testo: String, val fonti: List<Consulente.Fonte>, val costo: Double?, val troncata: Boolean)

class ErroreModello(messaggio: String) : Exception(messaggio)

open class OpenRouter(
    // readTimeout è il silenzio massimo FRA due pezzi della risposta, non la durata della risposta: in streaming
    // OpenRouter manda un segnale di vita mentre il modello ragiona. callTimeout è il tetto dell'intera risposta:
    // era 2 minuti, e un piano alimentare di 7 giorni con Kimi non ci stava (visto il 24/09, «timeout»).
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .callTimeout(8, TimeUnit.MINUTES)
        .build(),
) {
    private val json = Json { ignoreUnknownKeys = true }

    // `rapida`: per la microchiamata che sceglie il motore; 6 secondi, nessuno streaming e nessun secondo tentativo.
    private val httpRapido by lazy { http.newBuilder().callTimeout(6, TimeUnit.SECONDS).build() }

    open suspend fun completa(chiave: String, modello: String, messaggi: JsonArray, strumenti: JsonArray?, maxToken: Int = 1500, rapida: Boolean = false,
                              temperatura: Double? = null): Risposta =
        withContext(Dispatchers.IO) {
            val corpo = buildJsonObject {
                put("model", modello)
                put("messages", messaggi)
                if (strumenti != null) { put("tools", strumenti); put("tool_choice", "auto") }
                put("max_tokens", maxToken)
                // Null = quella del modello: per chi la rifiuta, o dove il compito non la chiede (vedi Temperatura.kt).
                if (temperatura != null) put("temperature", temperatura)
                // Kimi, DeepSeek, Gemini ragionano prima di rispondere, e il ragionamento consuma lo stesso tetto:
                // non lo si scarica (lo si paga comunque), ma il tetto deve lasciargli spazio (vedi Shell.MAX_TOKEN).
                putJsonObject("reasoning") { put("exclude", true) }
                putJsonObject("usage") { put("include", true) }
                if (!rapida) put("stream", true)
            }
            val req = Request.Builder()
                .url("https://openrouter.ai/api/v1/chat/completions")
                .header("Authorization", "Bearer $chiave")
                .header("X-Title", "Resonance")
                .post(corpo.toString().toRequestBody("application/json".toMediaType()))
                .build()
            if (rapida) return@withContext leggi(httpRapido, req)
            // Una connessione caduta (rete che cambia, schermo che si spegne) si ritenta una volta: il messaggio è lo stesso.
            // Non si ritenta se è scaduto il tetto totale (altri 8 minuti di attesa) o se il turno è stato fermato.
            try { leggi(http, req) } catch (e: java.io.IOException) {
                ensureActive()
                if (e is java.io.InterruptedIOException && e !is java.net.SocketTimeoutException)
                    throw ErroreModello("la risposta ha superato gli 8 minuti. Il tuo messaggio è salvato: chiedi una parte per volta (es. tre giorni del piano) e scrivi «riprova»")
                kotlinx.coroutines.delay(1500)
                try { leggi(http, req) } catch (e2: java.io.IOException) {
                    throw ErroreModello("connessione caduta due volte (${e2.message ?: e2.javaClass.simpleName}). Il tuo messaggio è salvato: controlla la rete e scrivi «riprova»")
                }
            }
        }

    // Il consulente (27/09/2026): una chiamata con la ricerca web di OpenRouter, gli stessi parametri che la PWA usa dal
    // 27/07 — senza tetto il motore faceva 30 ricerche invece di una. Senza streaming, perché le fonti arrivano intere
    // nel messaggio (annotations): per questo il silenzio ammesso è lungo, la ricerca non manda segnali di vita.
    // `web` = false serve al secondo invito, quello che chiede solo i punti mancanti: non si paga un'altra ricerca.
    open suspend fun cerca(chiave: String, modello: String, messaggi: JsonArray, maxToken: Int, temperatura: Double?, web: Boolean = true): RispostaWeb =
        ricerca(chiave, modello, messaggi, maxToken, temperatura, if (web) LEGGERA else null)

    // La ricerca dello Shell (02/10/2026, il Ghost: «una funzione potente e accurata, per qualcosa che si definisce
    // un'estensione cognitiva»). Exa al posto del motore predefinito, più risultati, più testo per risultato, più
    // ricerche per risposta. Costo verificato sulla documentazione di OpenRouter il 02/10: 0,7 centesimi di dollaro
    // a ricerca, più i token del modello che legge.
    open suspend fun cercaAFondo(chiave: String, modello: String, messaggi: JsonArray, maxToken: Int, temperatura: Double?): RispostaWeb =
        ricerca(chiave, modello, messaggi, maxToken, temperatura, A_FONDO)

    private data class Profilo(val parametri: kotlinx.serialization.json.JsonObject, val chiamate: Int)
    private val LEGGERA = Profilo(buildJsonObject { put("max_results", 5); put("max_total_results", 10); put("search_context_size", "low") }, 3)
    private val A_FONDO = Profilo(buildJsonObject {
        put("engine", "exa"); put("max_results", 10); put("max_total_results", 25); put("search_context_size", "high")
    }, 4)

    private suspend fun ricerca(chiave: String, modello: String, messaggi: JsonArray, maxToken: Int, temperatura: Double?, profilo: Profilo?): RispostaWeb =
        withContext(Dispatchers.IO) {
            val corpo = buildJsonObject {
                put("model", modello)
                put("messages", messaggi)
                if (profilo != null) {
                    put("tools", buildJsonArray {
                        add(buildJsonObject {
                            put("type", "openrouter:web_search")
                            put("parameters", profilo.parametri)
                        })
                    })
                    put("tool_choice", "required")
                    put("max_tool_calls", profilo.chiamate)
                }
                put("max_tokens", maxToken)
                if (temperatura != null) put("temperature", temperatura)
                putJsonObject("reasoning") { put("exclude", true) }
                putJsonObject("usage") { put("include", true) }
            }
            val req = Request.Builder()
                .url("https://openrouter.ai/api/v1/chat/completions")
                .header("Authorization", "Bearer $chiave")
                .header("X-Title", "Resonance")
                .post(corpo.toString().toRequestBody("application/json".toMediaType()))
                .build()
            val lento = httpLento
            val chiamata = lento.newCall(req)
            val legame = currentCoroutineContext()[Job]?.invokeOnCompletion { if (it != null) chiamata.cancel() }
            try {
                chiamata.execute().use { r ->
                    val testo = r.body.string()
                    if (!r.isSuccessful) throw ErroreModello("HTTP ${r.code}: ${testo.take(300)}")
                    interpretaRicerca(testo)
                }
            } catch (e: java.io.IOException) {
                ensureActive()
                throw ErroreModello("connessione caduta (${e.message ?: e.javaClass.simpleName}). Riprova: ciò che avevi chiesto è salvato")
            } finally { legame?.dispose() }
        }

    private val httpLento by lazy { http.newBuilder().readTimeout(4, TimeUnit.MINUTES).build() }

    // Il testo, e le fonti che il motore ha restituito davvero: `annotations` di tipo url_citation (la forma di OpenRouter),
    // o `citations` in cima (quella di Perplexity). Il programma mostra queste, non i link che il modello scrive a memoria.
    internal fun interpretaRicerca(testo: String): RispostaWeb {
        val radice = runCatching { json.parseToJsonElement(testo).jsonObject }.getOrNull()
            ?: throw ErroreModello("risposta non leggibile: ${testo.take(200)}")
        radice["error"]?.let { throw ErroreModello(it.toString().take(300)) }
        val scelta = radice["choices"]?.jsonArray?.firstOrNull()?.jsonObject ?: throw ErroreModello("risposta senza scelte")
        val msg = scelta["message"]?.jsonObject ?: throw ErroreModello("risposta senza messaggio")
        val viste = mutableSetOf<String>()
        val fonti = mutableListOf<Consulente.Fonte>()
        fun aggiungi(url: String?, titolo: String?) {
            val u = url?.trim().orEmpty()
            if (u.isEmpty() || !viste.add(u)) return
            fonti += Consulente.Fonte(u, titolo?.trim().orEmpty(), Consulente.dominio(u))
        }
        msg["annotations"]?.let { runCatching { it.jsonArray }.getOrNull() }?.forEach { a ->
            val o = runCatching { a.jsonObject }.getOrNull() ?: return@forEach
            val c = o["url_citation"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: o
            aggiungi(c["url"]?.jsonPrimitive?.contentOrNull, c["title"]?.jsonPrimitive?.contentOrNull)
        }
        radice["citations"]?.let { runCatching { it.jsonArray }.getOrNull() }?.forEach { c ->
            aggiungi(runCatching { c.jsonPrimitive.contentOrNull }.getOrNull(), null)
        }
        return RispostaWeb(
            testo = msg["content"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }.orEmpty().trim(),
            fonti = fonti,
            costo = radice["usage"]?.jsonObject?.get("cost")?.jsonPrimitive?.doubleOrNull,
            troncata = scelta["finish_reason"]?.jsonPrimitive?.contentOrNull == "length",
        )
    }

    // La chiamata segue il turno: se il lavoro viene fermato, la connessione si chiude invece di restare appesa.
    private suspend fun leggi(client: OkHttpClient, req: Request): Risposta {
        val chiamata = client.newCall(req)
        val legame = currentCoroutineContext()[Job]?.invokeOnCompletion { if (it != null) chiamata.cancel() }
        try {
            return chiamata.execute().use { r ->
                if (!r.isSuccessful) throw ErroreModello("HTTP ${r.code}: ${r.body.string().take(300)}")
                interpreta(r.body.source())
            }
        } finally { legame?.dispose() }
    }

    // Due forme di risposta: un JSON solo (senza streaming, o un errore) o eventi SSE «data: {…}» fino a «data: [DONE]».
    // Le righe che iniziano con «:» sono i segnali di vita di OpenRouter mentre il modello ragiona.
    internal fun interpreta(sorgente: BufferedSource): Risposta {
        val testo = StringBuilder()
        val chiamate = sortedMapOf<Int, Array<String>>() // indice → [id, nome, argomenti]
        var costo: Double? = null
        var fine: String? = null
        var visto = false
        while (true) {
            val riga = sorgente.readUtf8Line() ?: break
            if (riga.isBlank() || riga.startsWith(":")) continue
            if (!visto && riga.trimStart().startsWith("{")) return intera(riga + "\n" + sorgente.readUtf8())
            if (!riga.startsWith("data:")) continue
            visto = true
            val dato = riga.removePrefix("data:").trim()
            if (dato == "[DONE]") break
            val pezzo = runCatching { json.parseToJsonElement(dato).jsonObject }.getOrNull() ?: continue
            pezzo["error"]?.let { throw ErroreModello(it.toString().take(300)) }
            pezzo["usage"]?.let { u -> runCatching { u.jsonObject["cost"]?.jsonPrimitive?.doubleOrNull }.getOrNull()?.let { costo = it } }
            val scelta = pezzo["choices"]?.let { runCatching { it.jsonArray.firstOrNull()?.jsonObject }.getOrNull() } ?: continue
            scelta["finish_reason"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }?.let { fine = it }
            if (fine == "error") throw ErroreModello("il modello si è interrotto con un errore a metà risposta")
            val delta = scelta["delta"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: continue
            delta["content"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }?.let { testo.append(it) }
            delta["tool_calls"]?.let { runCatching { it.jsonArray }.getOrNull() }?.forEach { c ->
                val o = c.jsonObject
                val i = o["index"]?.jsonPrimitive?.intOrNull ?: chiamate.size
                val acc = chiamate.getOrPut(i) { arrayOf("", "", "") }
                o["id"]?.jsonPrimitive?.contentOrNull?.let { if (acc[0].isEmpty()) acc[0] = it }
                o["function"]?.jsonObject?.let { f ->
                    f["name"]?.jsonPrimitive?.contentOrNull?.let { acc[1] += it }
                    f["arguments"]?.jsonPrimitive?.contentOrNull?.let { acc[2] += it }
                }
            }
        }
        if (!visto) throw ErroreModello("risposta vuota")
        val lista = chiamate.values.filter { it[1].isNotBlank() }
            .map { ChiamataStrumento(it[0].ifEmpty { "c${System.nanoTime()}" }, it[1], it[2].ifBlank { "{}" }) }
        val assistente = buildJsonObject {
            put("role", "assistant"); put("content", testo.toString())
            if (lista.isNotEmpty()) put("tool_calls", buildJsonArray {
                lista.forEach { c -> add(buildJsonObject {
                    put("id", c.id); put("type", "function")
                    put("function", buildJsonObject { put("name", c.nome); put("arguments", c.argomenti) })
                }) }
            })
        }
        return Risposta(testo.toString().trim(), lista, costo, assistente, fine == "length")
    }

    private fun intera(testo: String): Risposta {
        val radice = runCatching { json.parseToJsonElement(testo).jsonObject }.getOrNull()
            ?: throw ErroreModello("risposta non leggibile: ${testo.take(200)}")
        radice["error"]?.let { throw ErroreModello(it.toString().take(300)) }
        val scelta = radice["choices"]?.jsonArray?.firstOrNull()?.jsonObject ?: throw ErroreModello("risposta senza scelte")
        val msg = scelta["message"]?.jsonObject ?: throw ErroreModello("risposta senza messaggio")
        val chiamate = msg["tool_calls"]?.let { runCatching { it.jsonArray }.getOrNull() }.orEmpty().mapNotNull { c ->
            val o = c.jsonObject
            val f = o["function"]?.jsonObject ?: return@mapNotNull null
            ChiamataStrumento(
                o["id"]?.jsonPrimitive?.contentOrNull ?: "c${System.nanoTime()}",
                f["name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null,
                f["arguments"]?.jsonPrimitive?.contentOrNull ?: "{}",
            )
        }
        return Risposta(
            testo = msg["content"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }.orEmpty().trim(),
            chiamate = chiamate,
            costo = radice["usage"]?.jsonObject?.get("cost")?.jsonPrimitive?.doubleOrNull,
            assistente = msg,
            troncata = scelta["finish_reason"]?.jsonPrimitive?.contentOrNull == "length",
        )
    }
}
