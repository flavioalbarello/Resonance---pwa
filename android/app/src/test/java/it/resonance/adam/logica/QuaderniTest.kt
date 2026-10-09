package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Test

class QuaderniTest {
    private val q = "Dorme poco il giovedì.\n\nLavoro manuale sporco sostituisce sedentarietà notturna.\n- Camminata al mattino\n\n\nSchiena rigida."

    @Test fun leRigheSonoQuelleNonVuote() {
        assertEquals(listOf("Dorme poco il giovedì.", "Lavoro manuale sporco sostituisce sedentarietà notturna.", "- Camminata al mattino", "Schiena rigida."), Quaderni.righe(q))
    }

    @Test fun toglieSoloLaRigaSceltaESenzaBuchi() {
        assertEquals("Dorme poco il giovedì.\n\n- Camminata al mattino\n\nSchiena rigida.", Quaderni.senza(q, 1))
        assertEquals("Dorme poco il giovedì.\n\nLavoro manuale sporco sostituisce sedentarietà notturna.\n- Camminata al mattino", Quaderni.senza(q, 3))
        assertEquals("", Quaderni.senza("una sola", 0))
    }
}
