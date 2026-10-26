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

    // Perplexity (02/10/2026): la ricerca è nel prezzo per richiesta, e non accetta strumenti.
    @Test fun perplexityHaIlPrezzoPerRichiesta() {
        val v = Listino.leggi("""{"data":[{"id":"perplexity/sonar-pro","pricing":{"prompt":"0.000003","completion":"0.000015","web_search":"0.005"},
            "supported_parameters":["max_tokens","temperature","web_search_options"]}]}""").single()
        assertEquals(0.005, v.perRichiesta, 1e-9)
        assertFalse(v.strumenti)
        assertTrue(Listino.cercaDaSe(v.id) && !Listino.cercaDaSe("moonshotai/kimi-k3"))
        // Un listino salvato prima, senza il campo, si legge ancora.
        assertEquals(0.0, Listino.decodifica("""[{"id":"x/y","ingresso":1.0}]""").single().perRichiesta, 1e-9)
        assertEquals(5.0, Listino.voce(emptyList(), "x/y").uscita, 1e-9)
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

    // 26/10/2026: le etichette scritte a mano erano invecchiate (DeepSeek V4.1 Flash ×10). Il prezzo si legge dal listino.
    @Test fun lEtichettaPortaIlPrezzoDelListinoLetto() {
        val listino = listOf(Listino.Voce("deepseek/deepseek-v4.1-flash", ingresso = 0.3, uscita = 1.2),
            Listino.Voce("moonshotai/kimi-k3", ingresso = 0.19, uscita = 20.0))
        assertEquals("DeepSeek V4.1 Flash (0,3/1,2 $, vede)", Listino.etichetta("DeepSeek V4.1 Flash (0,03/0,5 $, vede)", "deepseek/deepseek-v4.1-flash", listino))
        assertEquals("Kimi K3 (0,19/20 $, scrive caro)", Listino.etichetta("Kimi K3 (0,68/10 $, scrive caro)", "moonshotai/kimi-k3", listino))
        // Listino mai letto: l'etichetta di ripiego. Modello sparito: lo dice.
        assertEquals("X (1/2 $)", Listino.etichetta("X (1/2 $)", "a/x", emptyList()))
        assertEquals("X (1/2 $) · non più nel listino", Listino.etichetta("X (1/2 $)", "a/x", listino))
    }

    // Ogni modello offerto c'era nel listino del 26/10/2026 con gli strumenti (quelli di ricerca esclusi: cercano da sé).
    @Test fun iModelliOffertiEsistonoEUsanoGliStrumenti() {
        val conStrumenti = setOf("meta-llama/llama-3.3-70b-instruct", "z-ai/glm-5.3", "xiaomi/mimo-v2.6-pro", "deepseek/deepseek-v4-pro",
            "moonshotai/kimi-k2.6", "moonshotai/kimi-k3", "google/gemini-3.8-flash", "openai/gpt-6.1-terra", "mistralai/mistral-large-4-0",
            "x-ai/grok-4.7", "google/gemini-4-argon", "moonshotai/kimi-k3.1-pro", "anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol",
            "xiaomi/mimo-v2.6-flash", "deepseek/deepseek-v4.1-flash-1017", "qwen/qwen3.8-flash", "google/gemini-3.1-flash-lite",
            "openai/gpt-6-luna", "anthropic/claude-haiku-5.5")
        val offerti = (Impostazioni.MODELLI + Impostazioni.MODELLI_LEGGERI + Impostazioni.MODELLI_VISTA).map { it.first }.toSet()
        assertEquals(emptySet<String>(), offerti - conStrumenti)
        // Chi vede: tutti i leggeri e quelli per le immagini.
        assertTrue((Impostazioni.MODELLI_LEGGERI + Impostazioni.MODELLI_VISTA).all { it.first in Impostazioni.VEDONO })
    }
}
