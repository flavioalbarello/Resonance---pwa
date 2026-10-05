package it.resonance.adam.mondo

import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper

// Il testo di un PDF (05/10/2026, decisione del Ghost: la libreria, non un modello che guarda le pagine). Le carte dei
// vini e i listini sono spesso PDF; il testo si cerca come quello di una pagina. Un PDF fatto di sole immagini (una carta
// fotografata) non ha testo: torna vuoto, e il programma lo dice come «letto, non c'è» — è un limite, non un'assenza.
object PdfTesto {
    const val BYTE_MAX = 15L * 1024 * 1024
    const val PAGINE_MAX = 40

    @Volatile private var pronto = false

    fun testo(context: Context, byte: ByteArray): String {
        if (!pronto) synchronized(this) { if (!pronto) { PDFBoxResourceLoader.init(context.applicationContext); pronto = true } }
        return PDDocument.load(byte).use { doc ->
            PDFTextStripper().apply { sortByPosition = true; endPage = PAGINE_MAX }.getText(doc)
        }
    }
}
