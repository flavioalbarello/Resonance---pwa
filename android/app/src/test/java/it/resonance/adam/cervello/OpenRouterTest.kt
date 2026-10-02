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

    // Il consulente (27/09/2026): le fonti sono quelle del motore, in annotations o in citations, senza doppioni.
    @Test fun laRicercaPortaLeFontiVereEIlTettoDelleRicerche() = runBlocking {
        val risposta = """{"choices":[{"message":{"content":"1. · sì","annotations":[
            {"type":"url_citation","url_citation":{"url":"https://www.meta.com/ai-glasses/","title":"Meta AI glasses"}},
            {"type":"url_citation","url_citation":{"url":"https://www.meta.com/ai-glasses/","title":"doppione"}}]},"finish_reason":"stop"}],
            "citations":["https://developers.meta.com/wearables/faq/"],"usage":{"cost":0.012}}"""
        val (c, n) = cliente(cadute = 0, risposta = risposta)
        val r = c.cerca("k", "m", JsonArray(emptyList()), 800, 0.2)
        assertEquals("1. · sì", r.testo)
        assertEquals(listOf("meta.com", "developers.meta.com"), r.fonti.map { it.dominio })
        assertEquals("Meta AI glasses", r.fonti.first().titolo)
        assertEquals(0.012, r.costo!!, 1e-9)
        assertEquals(1, n())
        assertTrue(corpo, corpo.contains("\"openrouter:web_search\"") && corpo.contains("\"max_tool_calls\":3") && !corpo.contains("\"stream\""))
        // Il secondo invito non paga un'altra ricerca.
        c.cerca("k", "m", JsonArray(emptyList()), 800, 0.2, web = false)
        assertTrue(corpo, !corpo.contains("web_search"))
    }

    // Perplexity cerca da sé e rifiuta gli strumenti (02/10/2026): gli si chiede solo quanto contesto leggere.
    @Test fun perplexitySenzaStrumentiConIlContesto() = runBlocking {
        val (c, _) = cliente(cadute = 0, risposta = """{"choices":[{"message":{"content":"Dati al: 1 ottobre 2026"},"finish_reason":"stop"}],"citations":["https://a.it/x"]}""")
        assertEquals(listOf("a.it"), c.cercaAFondo("k", "perplexity/sonar-pro", JsonArray(emptyList()), 800, 0.2).fonti.map { it.dominio })
        assertTrue(corpo, corpo.contains("\"web_search_options\":{\"search_context_size\":\"high\"}") && !corpo.contains("tools") &&
            !corpo.contains("tool_choice") && !corpo.contains("reasoning"))
        // Con un altro modello resta la ricerca di OpenRouter.
        c.cercaAFondo("k", "moonshotai/kimi-k3", JsonArray(emptyList()), 800, 0.2)
        assertTrue(corpo, corpo.contains("\"openrouter:web_search\"") && corpo.contains("\"engine\":\"exa\"") && !corpo.contains("web_search_options"))
    }

    // Il 02/10 la ricerca a fondo è caduta tutta senza dire perché: una connessione caduta ora si ritenta, come per il turno.
    @Test fun laRicercaSiRitentaUnaVoltaSeCadeLaConnessione() = runBlocking {
        val (c, n) = cliente(cadute = 1, risposta = """{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}""")
        assertEquals("ok", c.cercaAFondo("k", "perplexity/sonar", JsonArray(emptyList()), 800, null).testo)
        assertEquals(2, n())
        val (d, _) = cliente(cadute = 2)
        val e = runCatching { d.cercaAFondo("k", "perplexity/sonar", JsonArray(emptyList()), 800, null) }.exceptionOrNull()
        assertTrue(e?.message.orEmpty(), e is ErroreModello && e.message!!.contains("connessione caduta due volte"))
    }
}
