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

// Un ascolto = una frase. Il modo "auto" lo riaccende da fuori, dopo la risposta: così l'app
// non ascolta mai mentre parla, per costruzione e non per una finestra di tempo da azzeccare.
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
    private val principale = android.os.Handler(android.os.Looper.getMainLooper())
    private val tts = TextToSpeech(context, this)

    override fun onInit(stato: Int) {
        pronto = stato == TextToSpeech.SUCCESS
        if (!pronto) return
        tts.language = Locale.ITALIAN
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) = finito()
            @Deprecated("Deprecated in Java") override fun onError(id: String?) = finito()
        })
    }

    private fun finito() {
        val f = dopo ?: return
        dopo = null
        principale.post(f)
    }

    fun parla(testo: String, allaFine: () -> Unit) {
        val pulito = perLaVoce(testo)
        if (!pronto || pulito.isBlank()) { allaFine(); return }
        dopo = allaFine
        tts.speak(pulito, TextToSpeech.QUEUE_FLUSH, null, "r${System.nanoTime()}")
    }

    fun zitto() { tts.stop(); dopo = null }
    fun chiudi() { tts.shutdown() }

    companion object {
        fun perLaVoce(t: String) = t.replace(Regex("[*_#`>]+"), "").replace(Regex("\\[(.*?)]\\(.*?\\)"), "$1").trim()
    }
}

object ComandiVocali {
    private val SI = setOf("si", "sì", "conferma", "confermo", "ok", "va bene", "certo", "procedi", "vai")
    private val NO = setOf("no", "annulla", "lascia stare", "non farlo", "rifiuta")
    private fun norm(t: String) = t.lowercase().trim().trimEnd('.', '!', ',').trim()
    fun eSi(t: String) = norm(t) in SI
    fun eNo(t: String) = norm(t) in NO
}
