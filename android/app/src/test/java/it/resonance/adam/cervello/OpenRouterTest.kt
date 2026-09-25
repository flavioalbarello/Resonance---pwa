package it.resonance.adam.cervello

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

// Visto sul telefono il 23/09: «Software caused connection abort» e il turno perso al primo tentativo.
class OpenRouterTest {
    private var corpo = ""

    private fun cliente(cadute: Int, caduta: () -> IOException = { IOException("Software caused connection abort") },
                        risposta: String = """{"choices":[{"message":{"content":"eccomi"},"finish_reason":"stop"}]}"""): Pair<OpenRouter, () -> Int> {
        var chiamate = 0
        val http = OkHttpClient.Builder().addInterceptor { catena ->
            chiamate++
            corpo = okio.Buffer().also { catena.request().body!!.writeTo(it) }.readUtf8()
            if (chiamate <= cadute) throw caduta()
            Response.Builder().request(catena.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body(risposta.toResponseBody("text/event-stream".toMediaType()))
                .build()
        }.build()
        return OpenRouter(http) to { chiamate }
    }

    @Test fun unaConnessioneCadutaSiRitentaUnaVolta() = runBlocking {
        val (c, n) = cliente(cadute = 1)
        assertEquals("eccomi", c.completa("k", "m", JsonArray(emptyList()), null).testo)
        assertEquals(2, n())
    }

    @Test fun ilRagionamentoNonSiScaricaEIlTettoArrivaAlModello() = runBlocking {
        val (c, _) = cliente(cadute = 0)
        c.completa("k", "moonshotai/kimi-k2.6", JsonArray(emptyList()), null, Shell.MAX_TOKEN)
        assertTrue(corpo, corpo.contains("\"max_tokens\":12000") && corpo.contains("\"reasoning\":{\"exclude\":true}"))
    }

    @Test fun dueCaduteSiDiconoConCosaFare() = runBlocking {
        val (c, n) = cliente(cadute = 2)
        val e = runCatching { c.completa("k", "m", JsonArray(emptyList()), null) }.exceptionOrNull()
        assertTrue(e?.message, e is ErroreModello && e.message!!.contains("scrivi «riprova»"))
        assertEquals(2, n())
    }

    // Visto il 24/09: un piano alimentare di 7 giorni con Kimi → «timeout» dopo 2 minuti di silenzio.
    // In streaming la risposta arriva a pezzi, con i segnali di vita («: OPENROUTER PROCESSING») mentre il modello ragiona.
    @Test fun laRispostaInStreamingSiRicomponeConLoStrumentoSpezzato() = runBlocking {
        val sse = """
            : OPENROUTER PROCESSING

            : OPENROUTER PROCESSING

            data: {"choices":[{"delta":{"role":"assistant","content":"Lune"}}]}

            data: {"choices":[{"delta":{"content":"dì: avena"}}]}

            data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"t1","type":"function","function":{"name":"crea_evento","arguments":"{\"titolo\":"}}]}}]}

            data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Spesa\"}"}}]}}]}

            data: {"choices":[{"delta":{},"finish_reason":"length"}]}

            data: {"choices":[],"usage":{"cost":0.0123}}

            data: [DONE]
        """.trimIndent()
        val (c, _) = cliente(cadute = 0, risposta = sse)
        val r = c.completa("k", "m", JsonArray(emptyList()), null, Shell.MAX_TOKEN)
        assertTrue(corpo, corpo.contains("\"stream\":true"))
        assertEquals("Lunedì: avena", r.testo)
        assertEquals(listOf(ChiamataStrumento("t1", "crea_evento", """{"titolo":"Spesa"}""")), r.chiamate)
        assertEquals(0.0123, r.costo!!, 1e-9)
        assertTrue(r.troncata)
        assertEquals("crea_evento", r.assistente["tool_calls"].toString().let { Regex("\"name\":\"(\\w+)\"").find(it)!!.groupValues[1] })
    }

    @Test fun unErroreAMetaStreamSiDice() = runBlocking {
        val sse = "data: {\"choices\":[{\"delta\":{\"content\":\"Ciao\"}}]}\n\ndata: {\"error\":{\"message\":\"Provider disconnected\"},\"choices\":[{\"delta\":{},\"finish_reason\":\"error\"}]}\n\n"
        val (c, _) = cliente(cadute = 0, risposta = sse)
        val e = runCatching { c.completa("k", "m", JsonArray(emptyList()), null) }.exceptionOrNull()
        assertTrue(e?.message, e is ErroreModello && e.message!!.contains("Provider disconnected"))
    }

    // Il tetto totale scaduto non si ritenta: sarebbero altri 8 minuti. Si dice come chiedere meno.
    @Test fun ilTettoTotaleNonSiRitenta() = runBlocking {
        val (c, n) = cliente(cadute = 1, caduta = { java.io.InterruptedIOException("timeout") })
        val e = runCatching { c.completa("k", "m", JsonArray(emptyList()), null) }.exceptionOrNull()
        assertTrue(e?.message, e is ErroreModello && e.message!!.contains("8 minuti"))
        assertEquals(1, n())
    }

    @Test fun laTemperaturaParteSoloSeCe() = runBlocking {
        val (c, _) = cliente(cadute = 0)
        c.completa("k", "m", JsonArray(emptyList()), null, temperatura = 0.4)
        assertTrue(corpo, corpo.contains("\"temperature\":0.4"))
        c.completa("k", "m", JsonArray(emptyList()), null)
        assertTrue(corpo, !corpo.contains("temperature"))
    }

    @Test fun ilRifiutoDellaTemperaturaSiRiconosceSoloSeNeParla() {
        assertTrue(Temperatura.rifiutata("HTTP 400: temperature is not supported with this model"))
        assertTrue(Temperatura.rifiutata("Unsupported value: 'temperature' does not support 0.4 with this model. Only the default (1) value is supported."))
        assertTrue(!Temperatura.rifiutata("HTTP 402: insufficient credits"))
        assertTrue(!Temperatura.rifiutata(null))
        assertEquals("t 0,4 forzata", Temperatura.etichetta(0.4, true))
    }

    @Test fun laMicrochiamataNonVaInStreaming() = runBlocking {
        val (c, _) = cliente(cadute = 0)
        assertEquals("eccomi", c.completa("k", "m", JsonArray(emptyList()), null, 5, rapida = true).testo)
        assertTrue(corpo, !corpo.contains("stream"))
    }
}
