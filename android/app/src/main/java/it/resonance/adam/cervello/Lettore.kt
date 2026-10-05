package it.resonance.adam.cervello

import it.resonance.adam.logica.TrovaDove
import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// Il lettore di pagine (05/10/2026, «andare a vedere»). Apre un sito come lo aprirebbe il Ghost, con un browser vero che
// esegue gli script: supera le pagine anti-robot leggere (quella del Salotto Belvedere, che a una richiesta semplice
// risponde solo con la sfida) e legge ciò che si vede, non il sorgente. Un'interfaccia perché lo Shell si provi sulla
// JVM; sul telefono è mondo/LettoreAndroid (WebView), al banco dal vivo un Chromium comandato da fuori.
// Chi legge e chi attende condividono le stesse regole (qui sotto): la stessa estrazione, la stessa idea di «pagina pronta».
interface Lettore {
    suspend fun leggi(url: String): Pagina

    data class Pagina(val url: String, val titolo: String = "", val testo: String = "", val link: List<TrovaDove.Link> = emptyList(), val errore: String? = null) {
        val riuscita get() = errore == null
    }

    companion object {
        const val TEMPO_MS = 25_000L
        const val PASSO_MS = 800L
        const val TESTO_MAX = 200_000

        // Ciò che il browser restituisce: l'indirizzo finale (dopo i reindirizzamenti e la sfida), il titolo, il testo
        // visibile e i link col loro testo. Una stringa JSON, perché evaluateJavascript e Playwright la passano uguale.
        val ESTRAI = """
            (function(){var b=document.body;var l=[];var as=document.querySelectorAll('a[href]');
            for(var i=0;i<as.length&&l.length<400;i++){var a=as[i];l.push([a.href,((a.innerText||a.getAttribute('aria-label')||a.title||'')+'').trim().slice(0,100)]);}
            return JSON.stringify({u:location.href,t:document.title||'',x:b?(b.innerText||'').slice(0,$TESTO_MAX):'',l:l});})()
        """.trimIndent().replace("\n", "")

        private val json = Json { ignoreUnknownKeys = true }

        /** Il risultato di ESTRAI. evaluateJavascript lo dà come stringa JSON di una stringa JSON: si accettano le due forme. */
        fun interpreta(risultato: String?): Pagina? = runCatching {
            var el = json.parseToJsonElement(risultato ?: return null)
            if (el is kotlinx.serialization.json.JsonPrimitive) el = json.parseToJsonElement(el.contentOrNull ?: return null)
            val o = el.jsonObject
            Pagina(o["u"]!!.jsonPrimitive.content, o["t"]?.jsonPrimitive?.contentOrNull.orEmpty(), o["x"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                o["l"]?.jsonArray?.mapNotNull { e -> runCatching { val a = e.jsonArray; TrovaDove.Link(a[0].jsonPrimitive.content, a[1].jsonPrimitive.content) }.getOrNull() }.orEmpty())
        }.getOrNull()

        // La pagina di sfida, non la pagina vera: SiteGround, Cloudflare, DDoS-Guard e simili. Si riconosce dall'indirizzo,
        // dal titolo, o da un testo cortissimo che parla di robot.
        private val SFIDA_URL = Regex("captcha|/challenge|cdn-cgi/challenge|sgcaptcha|ddos-guard", RegexOption.IGNORE_CASE)
        private val SFIDA_TITOLO = Regex("robot challenge|just a moment|attention required|un momento|checking your browser|ddos-guard|verifica (che|di essere)", RegexOption.IGNORE_CASE)
        private val SFIDA_TESTO = Regex("not a robot|are human|sei un robot|non sei un robot|captcha|robot", RegexOption.IGNORE_CASE)

        fun sfida(p: Pagina) = SFIDA_URL.containsMatchIn(p.url) || SFIDA_TITOLO.containsMatchIn(p.titolo) ||
            (p.testo.length < 800 && SFIDA_TESTO.containsMatchIn(p.testo))

        /** Pronta: non è una sfida, ha del testo, e il testo non cresce più fra due sguardi (gli script hanno finito). */
        fun pronta(prima: Pagina?, ora: Pagina) = !sfida(ora) && ora.testo.isNotBlank() && prima != null &&
            prima.url == ora.url && prima.testo.length == ora.testo.length

        /**
         * L'attesa, uguale per ogni lettore: si guarda la pagina ogni PASSO_MS finché è pronta, fino a TEMPO_MS. Se scade,
         * si dice perché (la sfida non superata, la pagina vuota) invece di restituire la sfida come se fosse il sito.
         */
        suspend fun attendi(url: String, tempoMs: Long = TEMPO_MS, errore: () -> String? = { null }, estrai: suspend () -> Pagina?): Pagina {
            val fine = System.currentTimeMillis() + tempoMs
            var prima: Pagina? = null
            while (System.currentTimeMillis() < fine) {
                delay(PASSO_MS)
                val ora = estrai() ?: continue
                if (pronta(prima, ora)) return ora.copy(testo = ora.testo.take(TESTO_MAX))
                prima = ora
            }
            val ultima = prima
            return when {
                ultima != null && sfida(ultima) -> Pagina(url, errore = "pagina anti-robot non superata in ${tempoMs / 1000} secondi")
                ultima != null && ultima.testo.isNotBlank() -> ultima
                else -> Pagina(url, errore = errore() ?: "la pagina non si è caricata in ${tempoMs / 1000} secondi")
            }
        }
    }
}
