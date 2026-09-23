package it.resonance.adam.cervello

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

data class ChiamataStrumento(val id: String, val nome: String, val argomenti: String)

data class Risposta(val testo: String, val chiamate: List<ChiamataStrumento>, val costo: Double?, val assistente: JsonObject, val troncata: Boolean)

class ErroreModello(messaggio: String) : Exception(messaggio)

open class OpenRouter(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .callTimeout(120, TimeUnit.SECONDS)
        .build(),
) {
    private val json = Json { ignoreUnknownKeys = true }

    open suspend fun completa(chiave: String, modello: String, messaggi: JsonArray, strumenti: JsonArray?, maxToken: Int = 1500): Risposta =
        withContext(Dispatchers.IO) {
            val corpo = buildJsonObject {
                put("model", modello)
                put("messages", messaggi)
                if (strumenti != null) { put("tools", strumenti); put("tool_choice", "auto") }
                put("max_tokens", maxToken)
                putJsonObject("usage") { put("include", true) }
            }
            val req = Request.Builder()
                .url("https://openrouter.ai/api/v1/chat/completions")
                .header("Authorization", "Bearer $chiave")
                .header("X-Title", "Resonance")
                .post(corpo.toString().toRequestBody("application/json".toMediaType()))
                .build()
            // Una connessione caduta (rete che cambia, schermo che si spegne) si ritenta una volta: il messaggio è lo stesso.
            val risposta = try { http.newCall(req).execute() } catch (e: java.io.IOException) {
                kotlinx.coroutines.delay(1500)
                try { http.newCall(req).execute() } catch (e2: java.io.IOException) {
                    throw ErroreModello("connessione caduta due volte (${e2.message ?: e2.javaClass.simpleName}). Il tuo messaggio è salvato: controlla la rete e scrivi «riprova»")
                }
            }
            risposta.use { r ->
                val testo = r.body.string()
                if (!r.isSuccessful) throw ErroreModello("HTTP ${r.code}: ${testo.take(300)}")
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
                Risposta(
                    testo = msg["content"]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }.orEmpty().trim(),
                    chiamate = chiamate,
                    costo = radice["usage"]?.jsonObject?.get("cost")?.jsonPrimitive?.doubleOrNull,
                    assistente = msg,
                    troncata = scelta["finish_reason"]?.jsonPrimitive?.contentOrNull == "length",
                )
            }
        }
}
