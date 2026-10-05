package it.resonance.adam.dalvivo

import android.content.Context
import it.resonance.adam.cervello.Lettore
import it.resonance.adam.logica.TrovaDove
import it.resonance.adam.mondo.PdfTesto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.Proxy
import java.util.concurrent.TimeUnit

// Il lettore del banco dal vivo: comanda il Chromium di strumenti/lettore-chromium.mjs con le stesse mosse della WebView
// (apri, lo stesso ESTRAI ogni 800 ms con la stessa Lettore.attendi, chiudi). Il PDF lo scarica il browser e lo legge
// PdfTesto, come sul telefono. Cambia solo il browser.
class LettoreHttp(private val base: String, private val context: Context) : Lettore {
    private val http = OkHttpClient.Builder().proxy(Proxy.NO_PROXY).readTimeout(60, TimeUnit.SECONDS).build()
    private val json = Json { ignoreUnknownKeys = true }

    private fun manda(percorso: String, corpo: kotlinx.serialization.json.JsonObject) =
        http.newCall(Request.Builder().url("$base$percorso").post(corpo.toString().toRequestBody("application/json".toMediaType())).build()).execute()
            .use { json.parseToJsonElement(it.body.string()).jsonObject }

    override suspend fun leggi(url: String): Lettore.Pagina = withContext(Dispatchers.IO) {
        if (TrovaDove.pdf(url)) {
            val r = manda("/scarica", buildJsonObject { put("url", url) })
            val stato = r["stato"]?.jsonPrimitive?.intOrNull ?: 0
            if (stato !in 200..299) return@withContext Lettore.Pagina(url, errore = "PDF: HTTP $stato")
            val byte = java.util.Base64.getDecoder().decode(r["byte"]!!.jsonPrimitive.content)
            return@withContext runCatching { Lettore.Pagina(url, url.substringAfterLast('/'), PdfTesto.testo(context, byte)) }
                .getOrElse { Lettore.Pagina(url, errore = "PDF non letto: ${it.message}") }
        }
        val id = manda("/apri", buildJsonObject { put("url", url) })["id"]!!.jsonPrimitive.content
        try {
            Lettore.attendi(url) {
                Lettore.interpreta(manda("/estrai", buildJsonObject { put("id", id); put("js", Lettore.ESTRAI) })["r"]?.jsonPrimitive?.contentOrNull)
            }
        } finally { runCatching { manda("/chiudi", buildJsonObject { put("id", id) }) } }
    }
}
