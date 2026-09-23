package it.resonance.adam.mondo

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import it.resonance.adam.logica.Allegato
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class AllegatoreTest {
    private val app = RuntimeEnvironment.getApplication()
    private val a = Allegatore(app)
    private fun file(nome: String) = File(app.cacheDir, nome)

    @Test fun unaFotoGrandeSiRiduceESiSalva() = runBlocking {
        val f = file("foto.jpg")
        Bitmap.createBitmap(4000, 3000, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.JPEG, 90, f.outputStream())
        val r = a.prepara(Uri.fromFile(f)).getOrThrow()
        assertEquals(Allegato.Tipo.IMMAGINE, r.tipo)
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(r.immagini.single(), o)
        assertEquals(Allegatore.LATO, maxOf(o.outWidth, o.outHeight))
    }

    @Test fun testoEDocxDiventanoTesto() = runBlocking {
        val t = file("note.md").apply { writeText("# Scaletta\nRino Gaetano") }
        assertEquals("# Scaletta\nRino Gaetano", a.prepara(Uri.fromFile(t)).getOrThrow().testo)
        val d = file("prove.docx")
        ZipOutputStream(d.outputStream()).use { z ->
            z.putNextEntry(ZipEntry("word/document.xml")); z.write("<w:p><w:t>Prove giovedì</w:t></w:p>".toByteArray()); z.closeEntry()
        }
        assertEquals("Prove giovedì", a.prepara(Uri.fromFile(d)).getOrThrow().testo)
    }

    @Test fun unFormatoIgnotoLoDice() = runBlocking {
        val z = file("archivio.zip").apply { writeBytes(byteArrayOf(1, 2)) }
        val e = a.prepara(Uri.fromFile(z)).exceptionOrNull()
        assertTrue(e?.message, e!!.message!!.contains("formato non letto"))
    }
}
