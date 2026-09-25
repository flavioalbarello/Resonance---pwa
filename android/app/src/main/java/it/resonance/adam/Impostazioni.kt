package it.resonance.adam

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

open class Impostazioni(context: Context) {
    private val p = context.getSharedPreferences("impostazioni", Context.MODE_PRIVATE)

    var modello: String
        get() = p.getString("modello", MODELLO_PREDEFINITO)!!
        set(v) = p.edit().putString("modello", v.trim()).apply()
    // Il modello che guarda immagini e pagine, quando quello principale non vede.
    var modelloVista: String
        get() = p.getString("modelloVista", MODELLO_VISTA)!!
        set(v) = p.edit().putString("modelloVista", v.trim()).apply()
    // Scelta automatica del motore: una microchiamata decide fra il modello leggero e quello scelto sopra.
    var sceltaAutomatica: Boolean
        get() = p.getBoolean("sceltaAutomatica", false)
        set(v) = p.edit().putBoolean("sceltaAutomatica", v).apply()
    var modelloLeggero: String
        get() = p.getString("modelloLeggero", MODELLO_LEGGERO)!!
        set(v) = p.edit().putString("modelloLeggero", v.trim()).apply()
    // Ultima perturbazione proposta dal programma: non più di una ogni due settimane.
    var ultimaPerturbazione: String
        get() = p.getString("ultimaPerturbazione", "")!!
        set(v) = p.edit().putString("ultimaPerturbazione", v).apply()
    var tettoMensile: Double
        get() = p.getFloat("tetto", 5f).toDouble()
        set(v) = p.edit().putFloat("tetto", v.toFloat()).apply()
    var battitoAttivo: Boolean
        get() = p.getBoolean("battito", true)
        set(v) = p.edit().putBoolean("battito", v).apply()
    var orarioMattino: String
        get() = p.getString("mattino", "07:30")!!
        set(v) = p.edit().putString("mattino", v).apply()
    var orarioSera: String
        get() = p.getString("sera", "21:30")!!
        set(v) = p.edit().putString("sera", v).apply()
    var orarioSettimana: String
        get() = p.getString("settimana", "18:00")!!
        set(v) = p.edit().putString("settimana", v).apply()
    var registroBattito: String
        get() = p.getString("registroBattito", "")!!
        set(v) = p.edit().putString("registroBattito", v).apply()
    var mattinoDalModello: Boolean
        get() = p.getBoolean("mattinoModello", true)
        set(v) = p.edit().putBoolean("mattinoModello", v).apply()
    // I modelli che hanno rifiutato la temperatura: dal turno dopo non la ricevono più (si paga una volta sola).
    var senzaTemperatura: Set<String>
        get() = p.getStringSet("senzaTemperatura", emptySet())!!.toSet()
        set(v) = p.edit().putStringSet("senzaTemperatura", v).apply()
    // Quanti secondi di silenzio chiudono un messaggio a voce in modalità auto.
    var pausaInvio: Int
        get() = p.getInt("pausaInvio", 4)
        set(v) = p.edit().putInt("pausaInvio", v).apply()
    var leggiRisposteInAuto: Boolean
        get() = p.getBoolean("leggiAuto", true)
        set(v) = p.edit().putBoolean("leggiAuto", v).apply()

    open var chiave: String
        get() = p.getString("chiave", null)?.let { runCatching { Segreti.decifra(it) }.getOrNull() }.orEmpty()
        set(v) = p.edit().apply { if (v.isBlank()) remove("chiave") else putString("chiave", Segreti.cifra(v.trim())) }.apply()

    companion object {
        const val MODELLO_PREDEFINITO = "meta-llama/llama-3.3-70b-instruct"
        const val MODELLO_VISTA = "google/gemini-3.1-flash-lite"
        const val MODELLO_LEGGERO = "google/gemini-3.1-flash-lite"
        // Verificati sul listino di OpenRouter il 23/09/2026: strumenti; prezzi $ per milione di token, entrata/uscita.
        val MODELLI_LEGGERI = listOf(
            "google/gemini-3.1-flash-lite" to "Gemini 3.1 Flash Lite (0,25/1,5 $, vede)",
            "deepseek/deepseek-v4-flash" to "DeepSeek V4 Flash (0,08/0,16 $, non vede)",
            "qwen/qwen3.8-flash" to "Qwen 3.8 Flash (0,15/0,47 $, vede)",
        )
        // Verificati sul listino di OpenRouter il 23/09/2026: immagini in ingresso e strumenti.
        val MODELLI_VISTA = listOf(
            "google/gemini-3.1-flash-lite" to "Gemini 3.1 Flash Lite (0,25/1,5 $ per milione)",
            "qwen/qwen3-vl-32b-instruct" to "Qwen3 VL 32B (0,10/0,42 $, più economico)",
            "google/gemini-2.5-flash" to "Gemini 2.5 Flash (0,30/2,5 $)",
        )
        // Fra i modelli principali, quelli che vedono già da soli: con loro non si cambia modello.
        val VEDONO = setOf("moonshotai/kimi-k2.6", "google/gemini-3.1-pro-preview", "anthropic/claude-sonnet-4.5", "anthropic/claude-sonnet-5",
            "qwen/qwen3.8-flash", "google/gemini-3.5-flash") + MODELLI_VISTA.map { it.first }
        val MODELLI = listOf(
            "meta-llama/llama-3.3-70b-instruct" to "Llama 3.3 70B (economico)",
            "deepseek/deepseek-v4-pro" to "DeepSeek V4 Pro",
            "moonshotai/kimi-k2.6" to "Kimi K2.6",
            "google/gemini-3.1-pro-preview" to "Gemini 3.1 Pro",
            "google/gemini-3.5-flash" to "Gemini 3.5 Flash",
            "anthropic/claude-sonnet-4.5" to "Claude Sonnet 4.5",
            "anthropic/claude-sonnet-5" to "Claude Sonnet 5",
        )
    }
}

// La chiave API non sta in chiaro: è cifrata con una chiave che vive nel Keystore e non esce dal telefono.
object Segreti {
    private const val ALIAS = "resonance_chiave_api"

    private fun chiave(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build())
        return g.generateKey()
    }

    fun cifra(testo: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, chiave()) }
        return Base64.encodeToString(c.iv + c.doFinal(testo.toByteArray()), Base64.NO_WRAP)
    }

    fun decifra(s: String): String {
        val b = Base64.decode(s, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, chiave(), GCMParameterSpec(128, b, 0, 12)) }
        return String(c.doFinal(b, 12, b.size - 12))
    }
}
