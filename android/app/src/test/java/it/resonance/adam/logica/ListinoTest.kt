package it.resonance.adam.logica

import it.resonance.adam.Impostazioni
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// Il listino di OpenRouter (02/10/2026): una lista scritta a mano invecchia in silenzio, il listino no.
class ListinoTest {
    // Il formato vero di /api/v1/models, ridotto a due voci (la prima copiata dal listino del 02/10/2026).
    private val risposta = """{"data":[
        {"id":"qwen/qwen3-vl-32b-instruct","name":"Qwen: Qwen3 VL 32B Instruct","pricing":{"prompt":"0.000000104","completion":"0.000000416"},
         "architecture":{"input_modalities":["text","image"]},"supported_parameters":["temperature","tool_choice","tools"],"expiration_date":"2026-10-09"},
        {"id":"openai/gpt-6-sol","name":"GPT-6 Sol","pricing":{"prompt":"0.000002","completion":"0.00001"},
         "architecture":{"input_modalities":["text","image"]},"supported_parameters":["tools","max_tokens"]}
    ]}"""
    private val oggi = LocalDate.of(2026, 10, 2)

    @Test fun ilListinoSiLeggeComeOpenRouterLoScrive() {
        val v = Listino.leggi(risposta)
        assertEquals(2, v.size)
        val qwen = v.first()
        assertEquals(0.104, qwen.ingresso, 1e-9)
        assertEquals(0.416, qwen.uscita, 1e-9)
        assertTrue(qwen.vede && qwen.temperatura && qwen.strumenti)
        assertEquals("2026-10-09", qwen.scade)
        assertFalse(v[1].temperatura)
        assertEquals(v, Listino.decodifica(Listino.codifica(v)))
        assertTrue(Listino.leggi("non json").isEmpty())
    }

    @Test fun avvisaDiCioCheScadeODiCioCheESparito() {
        val v = Listino.leggi(risposta)
        val avvisi = Listino.avvisi(mapOf("immagini" to "qwen/qwen3-vl-32b-instruct", "principale" to "openai/gpt-6-sol", "leggero" to "nessuno/sparito"), v, oggi)
        assertEquals(2, avvisi.size)
        assertTrue(avvisi[0].contains("2026-10-09") && avvisi[0].contains("immagini"))
        assertTrue(avvisi[1].contains("non è più nel listino"))
        // Senza listino (mai letto, o senza rete) non si inventa niente.
        assertTrue(Listino.avvisi(mapOf("principale" to "x"), emptyList(), oggi).isEmpty())
    }

    @Test fun chiAvevaScelteUnModelloRitiratoPassaAlSostituto() {
        assertEquals("deepseek/deepseek-v4.1-flash", Impostazioni.vivo("qwen/qwen3-vl-32b-instruct"))
        assertEquals("deepseek/deepseek-v4.1-flash", Impostazioni.vivo("google/gemini-2.5-flash"))
        assertEquals("moonshotai/kimi-k2.6", Impostazioni.vivo("moonshotai/kimi-k2.6"))
        // Nessun modello in lista è fra i ritirati.
        val inLista = (Impostazioni.MODELLI + Impostazioni.MODELLI_LEGGERI + Impostazioni.MODELLI_VISTA).map { it.first }
        assertTrue(inLista.none { it in Impostazioni.RITIRATI })
    }
}
