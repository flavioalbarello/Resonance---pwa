package it.resonance.adam.voce

import org.junit.Assert.assertEquals
import org.junit.Test

// Ciò che il lettore vocale dice: le tabelle diventano frasi, la cornice sparisce (riunione del 26/09).
class LetturaTest {
    @Test fun leTabelleSiLeggonoComeFrasi() {
        val t = """
            **Batteria**
            | Uso | Durata |
            |---|---|
            | audio continuo | fino a 5 ore |
            - custodia → 48 ore
            1. Primo passo
        """.trimIndent()
        assertEquals("Batteria\nUso, Durata.\naudio continuo, fino a 5 ore.\ncustodia, 48 ore\nPrimo passo", Parlato.perLaVoce(t))
    }

    @Test fun ilTestoNormaleNonCambia() {
        assertEquals("Ciao, tutto bene. Il 3-4 va bene.", Parlato.perLaVoce("Ciao, tutto bene. Il 3-4 va bene."))
    }
}
