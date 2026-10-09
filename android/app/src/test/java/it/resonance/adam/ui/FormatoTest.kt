package it.resonance.adam.ui

import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class FormatoTest {
    // Il testo vero arrivato sul telefono il 23/09, con gli asterischi a vista.
    private val vero = """
        L'ho ripreso dal **quaderno BIO**, che dice:

        > "Lavoro manuale sporco sostituisce sedentarietà notturna"

        **Partenza minima:**
        1. **Passi** — Se hai **Google Fit**:
           - Aprila una volta, accetta i termini.
        Forse intendi *attività fisica non strutturata*: pulizie.
    """.trimIndent()

    @Test fun nessunSegnoDiMarkdownRestaAVista() {
        val a = Formato.annota(vero)
        assertTrue(a.text, !a.text.contains("**") && !a.text.contains("> ") && !a.text.contains(" *attività"))
        assertTrue(a.text.contains("│ \"Lavoro manuale"))
        assertTrue(a.text.contains("  • Aprila una volta"))
        assertTrue(a.text.contains("1. Passi — Se hai Google Fit:"))
    }

    @Test fun ilGrassettoEIlCorsivoDiventanoStili() {
        val a = Formato.annota("Il **quaderno BIO** e *non strutturata*.")
        assertEquals("Il quaderno BIO e non strutturata.", a.text)
        val grassetto = a.spanStyles.single { it.item.fontWeight == FontWeight.Bold }
        assertEquals("quaderno BIO", a.text.substring(grassetto.start, grassetto.end))
        val corsivo = a.spanStyles.single { it.item.fontStyle == FontStyle.Italic }
        assertEquals("non strutturata", a.text.substring(corsivo.start, corsivo.end))
    }

    @Test fun unAsteriscoDaSoloOUnaMoltiplicazioneRestano() {
        assertEquals("3 * 4 = 12", Formato.annota("3 * 4 = 12").text)
        assertEquals("nota*", Formato.annota("nota*").text)
    }
}
