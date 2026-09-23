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

    private fun cliente(cadute: Int): Pair<OpenRouter, () -> Int> {
        var chiamate = 0
        val http = OkHttpClient.Builder().addInterceptor { catena ->
            chiamate++
            corpo = okio.Buffer().also { catena.request().body!!.writeTo(it) }.readUtf8()
            if (chiamate <= cadute) throw IOException("Software caused connection abort")
            Response.Builder().request(catena.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .body("""{"choices":[{"message":{"content":"eccomi"},"finish_reason":"stop"}]}""".toResponseBody("application/json".toMediaType()))
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
}
