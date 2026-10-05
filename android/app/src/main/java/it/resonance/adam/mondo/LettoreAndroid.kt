package it.resonance.adam.mondo

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import it.resonance.adam.cervello.Lettore
import it.resonance.adam.logica.TrovaDove
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

// Il lettore sul telefono: una WebView che nessuno vede. Esegue gli script come Chrome, quindi supera le sfide anti-robot
// leggere; immagini spente, per fare presto. Un PDF (le carte dei vini, i listini) si scarica coi cookie che la WebView
// ha appena preso, così passa anche lui dalla sfida già superata, e se ne legge il testo con PDFBox.
// NON provato qui: la WebView vera gira solo su un telefono. Al banco gira la stessa attesa (Lettore.attendi) con Chromium.
class LettoreAndroid(context: Context) : Lettore {
    private val app = context.applicationContext
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).callTimeout(60, TimeUnit.SECONDS).build()

    override suspend fun leggi(url: String): Lettore.Pagina =
        if (TrovaDove.pdf(url)) withContext(Dispatchers.IO) { leggiPdf(url) } else withContext(Dispatchers.Main) { leggiPagina(url) }

    @SuppressLint("SetJavaScriptEnabled")
    private suspend fun leggiPagina(url: String): Lettore.Pagina {
        val w = WebView(app)
        var errore: String? = null
        try {
            w.settings.javaScriptEnabled = true
            w.settings.domStorageEnabled = true
            w.settings.loadsImagesAutomatically = false
            w.settings.blockNetworkImage = true
            w.settings.mediaPlaybackRequiresUserGesture = true
            w.webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) errore = error.description?.toString()
                }
                // La sfida risponde spesso 403 o 202 e poi si risolve da sola: l'errore si tiene solo per dirlo se la pagina resta vuota.
                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (request.isForMainFrame && response.statusCode >= 400) errore = "HTTP ${response.statusCode}"
                }
            }
            w.loadUrl(url)
            val p = Lettore.attendi(url, errore = { errore }) { estrai(w) }
            // Un PDF aperto come pagina: la WebView non lo mostra, lo si legge a parte.
            return if (p.riuscita && TrovaDove.pdf(p.url) && p.url != url) withContext(Dispatchers.IO) { leggiPdf(p.url) } else p
        } finally {
            w.stopLoading()
            w.destroy()
        }
    }

    private suspend fun estrai(w: WebView): Lettore.Pagina? = suspendCancellableCoroutine { c ->
        w.evaluateJavascript(Lettore.ESTRAI) { r -> if (c.isActive) c.resume(Lettore.interpreta(r)) }
    }

    private fun leggiPdf(url: String): Lettore.Pagina = runCatching {
        val req = Request.Builder().url(url).header("User-Agent", WebSettings.getDefaultUserAgent(app))
            .apply { CookieManager.getInstance().getCookie(url)?.let { header("Cookie", it) } }.build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) return Lettore.Pagina(url, errore = "PDF: HTTP ${r.code}")
            val corpo = r.body
            if (corpo.contentLength() > PdfTesto.BYTE_MAX) return Lettore.Pagina(url, errore = "PDF troppo grande")
            val byte = corpo.bytes()
            if (byte.size > PdfTesto.BYTE_MAX) return Lettore.Pagina(url, errore = "PDF troppo grande")
            Lettore.Pagina(url, url.substringAfterLast('/'), PdfTesto.testo(app, byte))
        }
    }.getOrElse { Lettore.Pagina(url, errore = "PDF non letto: ${it.message ?: it.javaClass.simpleName}") }
}
