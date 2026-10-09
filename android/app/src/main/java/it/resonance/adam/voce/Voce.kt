package it.resonance.adam.voce

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

// Un ascolto = una frase. Il riconoscimento di Google chiude alla prima pausa di un secondo, e ignora la durata del
// silenzio che gli si chiede: le frasi si concatenano da fuori (ui/Adam.kt), e il messaggio lo chiude l'app, non il
// riconoscimento (Raccolta, qui sotto). Il modo "auto" lo riaccende dopo la risposta: così l'app non ascolta mai
// mentre parla, per costruzione e non per una finestra di tempo da azzeccare.
class Ascolto(
    private val context: Context,
    private val parziale: (String) -> Unit,
    private val finale: (String) -> Unit,
    private val fine: (errore: String?) -> Unit,
) {
    private var r: SpeechRecognizer? = null
    var attivo = false
        private set

    fun disponibile() = SpeechRecognizer.isRecognitionAvailable(context)

    fun avvia() {
        if (attivo) return
        val rec = r ?: SpeechRecognizer.createSpeechRecognizer(context).also { r = it }
        rec.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onPartialResults(b: Bundle?) {
                b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let(parziale)
            }
            override fun onResults(b: Bundle?) {
                attivo = false
                val t = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
                if (t.isNotEmpty()) finale(t)
                fine(null)
            }
            override fun onError(error: Int) {
                attivo = false
                fine(descrivi(error))
            }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "it-IT")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L)
        }
        attivo = true
        rec.startListening(intent)
    }

    fun ferma() {
        attivo = false
        r?.cancel()
    }

    fun chiudi() {
        attivo = false
        r?.destroy()
        r = null
    }

    private fun descrivi(e: Int) = when (e) {
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "silenzio"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "rete: il riconoscimento non ha raggiunto il servizio"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "manca il permesso del microfono"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "il riconoscimento è occupato"
        SpeechRecognizer.ERROR_CLIENT -> "annullato"
        else -> "errore del riconoscimento ($e)"
    }
}

class Parlato(context: Context) : TextToSpeech.OnInitListener {
    private var pronto = false
    private var dopo: (() -> Unit)? = null
    @Volatile private var ultimo = ""
    private val principale = android.os.Handler(android.os.Looper.getMainLooper())
    private val tts = TextToSpeech(context, this)

    override fun onInit(stato: Int) {
        pronto = stato == TextToSpeech.SUCCESS
        if (!pronto) return
        tts.language = Locale.ITALIAN
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { if (id == ultimo) finito() }
            @Deprecated("Deprecated in Java") override fun onError(id: String?) = finito()
        })
    }

    private fun finito() {
        val f = dopo ?: return
        dopo = null
        principale.post(f)
    }

    // Un testo lungo (un piano di sette giorni) supera il massimo che la sintesi accetta in una volta, e non si
    // sentiva niente: si divide in pezzi accodati, e la fine è quella dell'ultimo.
    fun parla(testo: String, allaFine: () -> Unit) {
        val max = runCatching { TextToSpeech.getMaxSpeechInputLength() }.getOrDefault(4000).coerceAtMost(3000)
        val pezzi = pezzi(perLaVoce(testo), max)
        if (!pronto || pezzi.isEmpty()) { allaFine(); return }
        dopo = allaFine
        val base = "r${System.nanoTime()}"
        ultimo = "$base-${pezzi.size - 1}"
        pezzi.forEachIndexed { i, p -> tts.speak(p, if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "$base-$i") }
    }

    fun zitto() { tts.stop(); dopo = null }
    fun chiudi() { tts.shutdown() }

    companion object {
        // Ciò che si vede ma non si dice (riunione del 26/09: «i segni delle tabelle, riprodotti in audio, sono un incubo»).
        // Le righe di sola cornice spariscono; le celle diventano una frase; trattini e frecce a inizio riga non si leggono.
        fun perLaVoce(t: String): String = t.lines().mapNotNull { riga ->
            val r = riga.trim()
            when {
                r.isEmpty() -> ""
                Regex("^[|:\\-\\s]+$").matches(r) && r.contains('-') -> null
                r.startsWith("|") || r.endsWith("|") -> r.trim('|').split('|').map { it.trim() }.filter { it.isNotEmpty() }.joinToString(", ") + "."
                else -> r.replace(Regex("^([-•→]|\\d+[.)])\\s+"), "")
            }
        }.joinToString("\n")
            .replace(Regex("[*_#`>]+"), "").replace(Regex("\\[(.*?)]\\(.*?\\)"), "$1")
            .replace(Regex("\\s*→\\s*"), ", ").replace(" · ", ", ").replace(Regex("\\n{3,}"), "\n\n").trim()

        /** Pezzi di al massimo `max` caratteri, tagliati dove la voce farebbe comunque una pausa. */
        fun pezzi(t: String, max: Int): List<String> {
            val unita = t.split(Regex("(?<=[.!?:;\\n])\\s+")).flatMap { u -> if (u.length <= max) listOf(u) else u.chunked(max) }
            val fuori = mutableListOf<String>()
            val b = StringBuilder()
            for (u in unita.map { it.trim() }.filter { it.isNotEmpty() }) {
                if (b.isNotEmpty() && b.length + 1 + u.length > max) { fuori += b.toString(); b.clear() }
                if (b.isNotEmpty()) b.append(' ')
                b.append(u)
            }
            if (b.isNotEmpty()) fuori += b.toString()
            return fuori
        }
    }
}

// Un messaggio a voce fatto di più frasi. Si chiude dopo una pausa lunga (la decide l'app, non il riconoscimento)
// o subito se finisce con «invia»; «annulla messaggio» lo cancella. Così si parla come si parla, con le pause,
// senza toccare il telefono — anche guidando.
object Raccolta {
    sealed class Esito {
        data class Continua(val testo: String) : Esito()
        data class Invia(val testo: String) : Esito()
        data object Azzera : Esito()
    }

    private val INVIO = Regex("""[\s,.;:]*\b(invia(\s+(il\s+)?messaggio)?|fine\s+messaggio)[\s.!]*$""", RegexOption.IGNORE_CASE)
    private val AZZERA = setOf("annulla messaggio", "cancella messaggio", "cancella tutto", "ricomincia")

    fun aggiungi(raccolto: String, segmento: String): Esito {
        val s = segmento.trim()
        if (s.lowercase().trimEnd('.', '!') in AZZERA) return Esito.Azzera
        val chiude = INVIO.containsMatchIn(s)
        val pulito = if (chiude) s.replace(INVIO, "").trim() else s
        val testo = listOf(raccolto.trim(), pulito).filter { it.isNotEmpty() }.joinToString(" ")
        return if (chiude && testo.isNotEmpty()) Esito.Invia(testo) else Esito.Continua(testo)
    }
}

// Un segnale breve quando il messaggio parte o si cancella: con gli occhi sulla strada, l'orecchio basta.
object Segnale {
    fun dai(ok: Boolean) {
        runCatching {
            val t = android.media.ToneGenerator(android.media.AudioManager.STREAM_MUSIC, 70)
            t.startTone(if (ok) android.media.ToneGenerator.TONE_PROP_ACK else android.media.ToneGenerator.TONE_PROP_NACK, 200)
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ t.release() }, 400)
        }
    }
}

object ComandiVocali {
    private val SI = setOf("si", "sì", "conferma", "confermo", "ok", "va bene", "certo", "procedi", "vai")
    private val NO = setOf("no", "annulla", "lascia stare", "non farlo", "rifiuta")
    private fun norm(t: String) = t.lowercase().trim().trimEnd('.', '!', ',').trim()
    fun eSi(t: String) = norm(t) in SI
    fun eNo(t: String) = norm(t) in NO
}
