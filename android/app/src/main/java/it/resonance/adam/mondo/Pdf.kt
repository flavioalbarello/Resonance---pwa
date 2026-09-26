package it.resonance.adam.mondo

import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import java.io.File

// Un PDF semplice, fatto da Android senza librerie (riunione del 26/09/2026): la prima riga è il titolo, il resto va a
// capo da solo e continua sulle pagine seguenti. Serve a mandare una lista o un documento come allegato, non a impaginare.
object Pdf {
    private const val LARGHEZZA = 595   // A4 in punti
    private const val ALTEZZA = 842
    private const val MARGINE = 48

    fun scrivi(file: File, testo: String) {
        file.parentFile?.mkdirs()
        val titolo = testo.substringBefore('\n').trim()
        val corpo = SpannableStringBuilder(testo.trim())
        if (titolo.isNotEmpty()) {
            corpo.setSpan(StyleSpan(Typeface.BOLD), 0, titolo.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            corpo.setSpan(RelativeSizeSpan(1.4f), 0, titolo.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        val penna = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply { textSize = 12f }
        val larghezza = LARGHEZZA - 2 * MARGINE
        val altezzaUtile = ALTEZZA - 2 * MARGINE
        val impaginato = StaticLayout.Builder.obtain(corpo, 0, corpo.length, penna, larghezza)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL).setLineSpacing(0f, 1.2f).build()
        val doc = PdfDocument()
        try {
            var prima = 0
            var numero = 1
            do {
                val cima = impaginato.getLineTop(prima)
                var ultima = prima
                while (ultima < impaginato.lineCount && impaginato.getLineBottom(ultima) - cima <= altezzaUtile) ultima++
                if (ultima == prima) ultima = prima + 1
                val pagina = doc.startPage(PdfDocument.PageInfo.Builder(LARGHEZZA, ALTEZZA, numero++).create())
                pagina.canvas.apply {
                    save()
                    translate(MARGINE.toFloat(), (MARGINE - cima).toFloat())
                    clipRect(0, cima, larghezza, impaginato.getLineBottom(ultima - 1))
                    impaginato.draw(this)
                    restore()
                }
                doc.finishPage(pagina)
                prima = ultima
            } while (prima < impaginato.lineCount)
            file.outputStream().use { doc.writeTo(it) }
        } finally {
            doc.close()
        }
    }
}
