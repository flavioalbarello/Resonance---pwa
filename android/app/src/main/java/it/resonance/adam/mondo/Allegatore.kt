package it.resonance.adam.mondo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import it.resonance.adam.logica.Allegati
import it.resonance.adam.logica.Allegato
import it.resonance.adam.logica.Documenti
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import java.util.zip.ZipInputStream

// Prepara sul telefono ciò che il Ghost allega: le immagini ridotte (bastano per leggere il testo, costano meno),
// le pagine di un PDF disegnate come immagini (vale anche per le scansioni), il testo dei documenti estratto.
class Allegatore(private val context: Context) {
    private val cartella get() = File(context.filesDir, "allegati").apply { mkdirs() }

    suspend fun prepara(uri: Uri): Result<Allegato> = withContext(Dispatchers.IO) {
        runCatching {
            val cr = context.contentResolver
            val nome = cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            } ?: uri.lastPathSegment ?: "allegato"
            val tipo = cr.getType(uri) ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(nome.substringAfterLast('.', "").lowercase()).orEmpty()
            when {
                tipo.startsWith("image/") -> immagine(uri, nome)
                tipo == "application/pdf" || nome.endsWith(".pdf", true) -> pdf(uri, nome)
                nome.endsWith(".docx", true) -> Allegato(nome, Allegato.Tipo.TESTO, testo = docx(uri))
                tipo.startsWith("text/") || tipo == "application/json" || Regex("""\.(txt|md|csv|json)$""", RegexOption.IGNORE_CASE).containsMatchIn(nome) ->
                    Allegato(nome, Allegato.Tipo.TESTO, testo = cr.openInputStream(uri)!!.bufferedReader().use { it.readText() })
                else -> error("«$nome»: formato non letto (${tipo.ifBlank { "sconosciuto" }}). Si leggono immagini, PDF, docx e testo")
            }
        }
    }

    // ImageDecoder raddrizza da solo le foto ruotate (EXIF) e riduce già in lettura.
    private fun immagine(uri: Uri, nome: String): Allegato {
        val bmp = runCatching {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { d, info, _ ->
                val lato = maxOf(info.size.width, info.size.height)
                if (lato > LATO) {
                    val f = LATO.toFloat() / lato
                    d.setTargetSize((info.size.width * f).toInt().coerceAtLeast(1), (info.size.height * f).toInt().coerceAtLeast(1))
                }
                d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        }.getOrElse { conBitmapFactory(uri) ?: error("«$nome»: immagine non leggibile") }
        return Allegato(nome, Allegato.Tipo.IMMAGINE, immagini = listOf(salva(bmp)))
    }

    // Seconda strada, se ImageDecoder rifiuta il formato: legge ridotto, poi porta il lato lungo a LATO.
    private fun conBitmapFactory(uri: Uri): Bitmap? {
        val cr = context.contentResolver
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, o) }
        if (o.outWidth <= 0) return null
        val campione = generateSequence(1) { it * 2 }.first { maxOf(o.outWidth, o.outHeight) / (it * 2) < LATO }
        val b = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = campione }) } ?: return null
        val lato = maxOf(b.width, b.height)
        if (lato <= LATO) return b
        val f = LATO.toFloat() / lato
        return Bitmap.createScaledBitmap(b, (b.width * f).toInt().coerceAtLeast(1), (b.height * f).toInt().coerceAtLeast(1), true).also { if (it != b) b.recycle() }
    }

    private fun pdf(uri: Uri, nome: String): Allegato {
        val fd = context.contentResolver.openFileDescriptor(uri, "r") ?: error("«$nome»: il PDF non si apre")
        return fd.use {
            PdfRenderer(it).use { r ->
                val quante = minOf(r.pageCount, Allegati.PAGINE_MASSIME)
                val pagine = (0 until quante).map { i ->
                    r.openPage(i).use { p ->
                        val f = LATO.toFloat() / maxOf(p.width, p.height)
                        val bmp = Bitmap.createBitmap((p.width * f).toInt().coerceAtLeast(1), (p.height * f).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                        bmp.eraseColor(Color.WHITE)
                        p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        salva(bmp)
                    }
                }
                Allegato(nome, Allegato.Tipo.PDF, immagini = pagine, pagineTotali = r.pageCount)
            }
        }
    }

    private fun docx(uri: Uri): String {
        ZipInputStream(context.contentResolver.openInputStream(uri)!!).use { z ->
            while (true) {
                val voce = z.nextEntry ?: break
                if (voce.name == "word/document.xml") return Documenti.testoDocx(z.bufferedReader().readText())
            }
        }
        error("il docx non contiene testo leggibile")
    }

    private fun salva(bmp: Bitmap): String {
        val f = File(cartella, "${UUID.randomUUID()}.jpg")
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        bmp.recycle()
        return f.absolutePath
    }

    // Per la fotocamera: un file vuoto da far riempire all'app della fotocamera.
    fun fileFoto(): File = File(cartella, "foto-${UUID.randomUUID()}.jpg")

    companion object {
        // Abbastanza per leggere una bolletta o una pagina scritta fitta; non di più, perché si paga a pixel.
        const val LATO = 1600
    }
}
