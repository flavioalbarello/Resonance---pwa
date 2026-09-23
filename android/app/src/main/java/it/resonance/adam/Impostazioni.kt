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

class Impostazioni(context: Context) {
    private val p = context.getSharedPreferences("impostazioni", Context.MODE_PRIVATE)

    var modello: String
        get() = p.getString("modello", MODELLO_PREDEFINITO)!!
        set(v) = p.edit().putString("modello", v.trim()).apply()
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
    var mattinoDalModello: Boolean
        get() = p.getBoolean("mattinoModello", true)
        set(v) = p.edit().putBoolean("mattinoModello", v).apply()
    var leggiRisposteInAuto: Boolean
        get() = p.getBoolean("leggiAuto", true)
        set(v) = p.edit().putBoolean("leggiAuto", v).apply()

    var chiave: String
        get() = p.getString("chiave", null)?.let { runCatching { Segreti.decifra(it) }.getOrNull() }.orEmpty()
        set(v) = p.edit().apply { if (v.isBlank()) remove("chiave") else putString("chiave", Segreti.cifra(v.trim())) }.apply()

    companion object {
        const val MODELLO_PREDEFINITO = "meta-llama/llama-3.3-70b-instruct"
        val MODELLI = listOf(
            "meta-llama/llama-3.3-70b-instruct" to "Llama 3.3 70B (economico)",
            "deepseek/deepseek-v4-pro" to "DeepSeek V4 Pro",
            "moonshotai/kimi-k2.6" to "Kimi K2.6",
            "google/gemini-3.1-pro-preview" to "Gemini 3.1 Pro",
            "anthropic/claude-sonnet-4.5" to "Claude Sonnet",
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
