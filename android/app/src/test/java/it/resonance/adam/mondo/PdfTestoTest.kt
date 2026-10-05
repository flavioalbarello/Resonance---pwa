package it.resonance.adam.mondo

import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import it.resonance.adam.logica.TrovaDove
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream

// Una carta dei vini in PDF (decisione del Ghost, 05/10/2026: la libreria). Si scrive un PDF con due righe e se ne
// cerca il nome come in una pagina.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PdfTestoTest {
    private val app = RuntimeEnvironment.getApplication()

    private fun carta(vararg righe: String): ByteArray {
        PDFBoxResourceLoader.init(app)
        return PDDocument().use { doc ->
            val pagina = PDPage(); doc.addPage(pagina)
            PDPageContentStream(doc, pagina).use { s ->
                s.beginText(); s.setFont(PDType1Font.HELVETICA, 12f); s.newLineAtOffset(50f, 700f)
                righe.forEach { s.showText(it); s.newLineAtOffset(0f, -16f) }
                s.endText()
            }
            ByteArrayOutputStream().also { doc.save(it) }.toByteArray()
        }
    }

    @Test fun ilNomeSiTrovaAncheInUnPdf() {
        val testo = PdfTesto.testo(app, carta("ROSSI", "Mannaja Cane 2023 - Regina del Quartuccio 28", "Cesanese 2022 24"))
        assertNotNull(testo, TrovaDove.trova(testo, listOf("Mannaja Cane")))
        assertNull(TrovaDove.trova(testo, listOf("Barolo")))
    }
}
