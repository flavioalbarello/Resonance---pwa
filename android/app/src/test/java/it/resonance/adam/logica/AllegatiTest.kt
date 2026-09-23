package it.resonance.adam.logica

import it.resonance.adam.cervello.Contenuto
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AllegatiTest {
    private val foto = Allegato("bolletta.jpg", Allegato.Tipo.IMMAGINE, immagini = listOf("/f/1.jpg"))
    private val pdf = Allegato("referto.pdf", Allegato.Tipo.PDF, immagini = listOf("/f/p1.jpg", "/f/p2.jpg"), pagineTotali = 12)
    private val doc = Allegato("note.docx", Allegato.Tipo.TESTO, testo = "Prove giovedì alle 21.")

    @Test fun siSalvanoESiRileggono() {
        val s = Allegati.codifica(listOf(foto, pdf, doc))
        assertEquals(listOf(foto, pdf, doc), Allegati.decodifica(s))
        assertEquals("", Allegati.codifica(emptyList()))
        assertTrue(Allegati.decodifica("").isEmpty() && Allegati.decodifica("{rotto").isEmpty())
    }

    @Test fun etichetteDiconoQuantoSiVede() {
        assertEquals("📄 referto.pdf (2 di 12 pagine)", pdf.etichetta())
        assertTrue(Allegati.notaPassata(listOf(foto)).contains("non più visibili: 🖼 bolletta.jpg"))
        assertTrue(Allegati.conImmagini(listOf(doc, pdf)) && !Allegati.conImmagini(listOf(doc)))
    }

    @Test fun ilMessaggioPortaTestoImmaginiEDocumenti() {
        val parti = Contenuto.parti("Leggi questi", listOf(foto, pdf, doc)) { byteArrayOf(1, 2, 3) }
        val tipi = parti.map { it.jsonObject["type"]!!.jsonPrimitive.content }
        assertEquals(listOf("text", "text", "image_url", "text", "image_url", "image_url", "text"), tipi)
        val url = parti[2].jsonObject["image_url"]!!.jsonObject["url"]!!.jsonPrimitive.content
        assertEquals("data:image/jpeg;base64,AQID", url)
        assertTrue(parti[3].jsonObject["text"]!!.jsonPrimitive.content.contains("2 pagine come immagini (su 12"))
        assertTrue(parti[6].jsonObject["text"]!!.jsonPrimitive.content.endsWith("Prove giovedì alle 21."))
    }

    @Test fun unFileSparitoNonFermaIlTurno() {
        val parti = Contenuto.parti("x", listOf(foto)) { error("non c'è") }
        assertEquals(2, parti.size)
    }

    @Test fun ilTestoDiUnDocxEsceAParagrafi() {
        val xml = """<w:document><w:body><w:p><w:r><w:t>Cover band</w:t></w:r><w:r><w:t xml:space="preserve"> di Rino &amp; amici</w:t></w:r></w:p><w:p><w:r><w:t>Prove:</w:t><w:tab/><w:t>giovedì</w:t></w:r></w:p></w:body></w:document>"""
        assertEquals("Cover band di Rino & amici\nProve:\tgiovedì", Documenti.testoDocx(xml))
    }
}
