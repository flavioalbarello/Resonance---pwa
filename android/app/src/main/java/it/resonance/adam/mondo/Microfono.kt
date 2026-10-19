package it.resonance.adam.mondo

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import it.resonance.adam.logica.Orecchio
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// Il microfono dell'Orecchio (logica/Orecchio.kt): legge il suono a 22 kHz e lo passa al rilevatore, che restituisce gli
// attacchi delle note. Niente si registra né si salva: i campioni si leggono e si buttano, restano solo i tempi.
// La sorgente «non elaborata» (senza controllo automatico del volume, che schiaccia gli attacchi) dove il telefono la ha.
class Microfono(private val context: Context) {
    private var lavoro: Job? = null
    private val _attacchi = MutableStateFlow<List<Double>>(emptyList())
    val attacchi: StateFlow<List<Double>> = _attacchi
    var errore: String? = null
        private set

    private fun sorgente(): Int {
        val am = context.getSystemService(AudioManager::class.java)
        return if (am?.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true") MediaRecorder.AudioSource.UNPROCESSED
        else MediaRecorder.AudioSource.VOICE_RECOGNITION
    }

    @SuppressLint("MissingPermission")
    fun avvia(scope: CoroutineScope) {
        if (lavoro?.isActive == true) return
        _attacchi.value = emptyList(); errore = null
        lavoro = scope.launch(Dispatchers.IO) {
            val f = Orecchio.FREQUENZA
            val minimo = AudioRecord.getMinBufferSize(f, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val rec = runCatching { AudioRecord(sorgente(), f, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimo, 8192)) }
                .getOrElse { errore = "microfono non disponibile: ${it.message}"; return@launch }
            if (rec.state != AudioRecord.STATE_INITIALIZED) { errore = "microfono occupato o senza permesso"; rec.release(); return@launch }
            val rilevatore = Orecchio.Rilevatore(f)
            val buf = ShortArray(1024)
            try {
                rec.startRecording()
                while (isActive) {
                    val n = rec.read(buf, 0, buf.size)
                    if (n > 0) rilevatore.nutri(buf, n).takeIf { it.isNotEmpty() }?.let { nuovi -> _attacchi.value = (_attacchi.value + nuovi).takeLast(400) }
                }
            } finally { runCatching { rec.stop() }; rec.release() }
        }
    }

    /** Un blocco nuovo: si ricomincia a contare (il giudizio è per blocco). */
    fun azzera() { _attacchi.value = emptyList() }

    fun ferma() { lavoro?.cancel(); lavoro = null }
    val attivo get() = lavoro?.isActive == true
}
