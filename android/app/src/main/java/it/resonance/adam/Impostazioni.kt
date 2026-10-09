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
        get() = vivo(p.getString("modello", MODELLO_PREDEFINITO)!!)
        set(v) = p.edit().putString("modello", v.trim()).apply()
    // Il modello che guarda immagini e pagine, quando quello principale non vede.
    var modelloVista: String
        get() = vivo(p.getString("modelloVista", MODELLO_VISTA)!!)
        set(v) = p.edit().putString("modelloVista", v.trim()).apply()
    // Scelta automatica del motore: una microchiamata decide fra il modello leggero e quello scelto sopra.
    var sceltaAutomatica: Boolean
        get() = p.getBoolean("sceltaAutomatica", false)
        set(v) = p.edit().putBoolean("sceltaAutomatica", v).apply()
    var modelloLeggero: String
        get() = vivo(p.getString("modelloLeggero", MODELLO_LEGGERO)!!)
        set(v) = p.edit().putString("modelloLeggero", v.trim()).apply()
    // Il modello per compito scelto dal Ghost (cervello/ModelloPerCompito.kt): «COMPITO=modello», uno per riga.
    var modelliPerCompito: String
        get() = p.getString("modelliPerCompito", "")!!
        set(v) = p.edit().putString("modelliPerCompito", v).apply()
    // Ultima perturbazione proposta dal programma: non più di una ogni due settimane.
    var ultimaPerturbazione: String
        get() = p.getString("ultimaPerturbazione", "")!!
        set(v) = p.edit().putString("ultimaPerturbazione", v).apply()
    var tettoMensile: Double
        get() = p.getFloat("tetto", 5f).toDouble()
        set(v) = p.edit().putFloat("tetto", v.toFloat()).apply()
    // Il tour del primo avvio (logica/Tour.kt): visto o saltato, non riparte da solo.
    var tourVisto: Boolean
        get() = p.getBoolean("tourVisto", false)
        set(v) = p.edit().putBoolean("tourVisto", v).apply()

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
    // Le temperature per compito confermate dal Ghost su proposta dello Shell (nome compito → valore). Vuoto = la tabella.
    var temperature: Map<String, Double>
        get() = p.getString("temperature", "")!!.split(";").mapNotNull { r ->
            r.split("=").takeIf { it.size == 2 }?.let { (k, v) -> v.toDoubleOrNull()?.let { k to it } }
        }.toMap()
        set(v) = p.edit().putString("temperature", v.entries.joinToString(";") { "${it.key}=${it.value}" }).apply()
    // La cassetta delle lettere con l'architetto: un repository GitHub PRIVATO («proprietario/nome») e un token che può
    // solo leggere e scrivere le issue di quel repository. Il token si cifra come la chiave OpenRouter.
    var cassetta: String
        get() = p.getString("cassetta", "")!!
        set(v) = p.edit().putString("cassetta", v.trim()).apply()
    open var tokenCassetta: String
        get() = p.getString("tokenCassetta", null)?.let { runCatching { Segreti.decifra(it) }.getOrNull() }.orEmpty()
        set(v) = p.edit().putString("tokenCassetta", if (v.isBlank()) null else Segreti.cifra(v.trim())).apply()
    // La riunione a tre in corso: la cartella del verbale nella cassetta (vuota = nessuna), il tema, gli interventi
    // dell'architetto già portati in chat.
    var riunione: String
        get() = p.getString("riunione", "")!!
        set(v) = p.edit().putString("riunione", v).apply()
    var riunioneTema: String
        get() = p.getString("riunioneTema", "")!!
        set(v) = p.edit().putString("riunioneTema", v).apply()
    var riunioneViste: Set<String>
        get() = p.getStringSet("riunioneViste", emptySet())!!.toSet()
        set(v) = p.edit().putStringSet("riunioneViste", v).apply()
    // In quali calendari entrano gli eventi nuovi: li sceglie il Ghost (Setup), uno per le cose di Adam e uno per i suoi
    // impegni (26/09). -1 = non scelto, e allora in quel calendario non si scrive.
    var calendarioId: Long
        get() = p.getLong("calendarioId", -1)
        set(v) = p.edit().putLong("calendarioId", v).apply()
    var calendarioPersonaleId: Long
        get() = p.getLong("calendarioPersonale", -1)
        set(v) = p.edit().putLong("calendarioPersonale", v).apply()
    // Il mittente che il Ghost vuole per le mail: l'app non può imporlo (la bozza la apre Gmail), ma lo dice prima e dopo.
    var mittente: String
        get() = p.getString("mittente", "")!!
        set(v) = p.edit().putString("mittente", v.trim()).apply()
    // Il verbale già scritto dallo Shell e non ancora consegnato alla cassetta (rete caduta): si riprova, non si riscrive.
    var riunioneVerbale: String
        get() = p.getString("riunioneVerbale", "")!!
        set(v) = p.edit().putString("riunioneVerbale", v).apply()
    // I punti fermi della riunione in corso, uno per riga (cervello/Tavolo.kt): il prompt li ha sempre davanti.
    var riunionePunti: String
        get() = p.getString("riunionePunti", "")!!
        set(v) = p.edit().putString("riunionePunti", v).apply()
    // Il consulente esterno della riunione (logica/Consulente.kt): se è nella stanza, la cartella delle domande (JSON),
    // quanti invii ha fatto e il tetto (lo alza il Ghost), e i suoi scambi di questa riunione per quando lo si riconvoca.
    // Tutto si azzera alla chiusura della riunione.
    var consulente: Boolean
        get() = p.getBoolean("consulente", false)
        set(v) = p.edit().putBoolean("consulente", v).apply()
    var consulenteDomande: String
        get() = p.getString("consulenteDomande", "")!!
        set(v) = p.edit().putString("consulenteDomande", v).apply()
    var consulenteInvii: Int
        get() = p.getInt("consulenteInvii", 0)
        set(v) = p.edit().putInt("consulenteInvii", v).apply()
    var consulenteTetto: Int
        get() = p.getInt("consulenteTetto", it.resonance.adam.logica.Consulente.TETTO_INVII)
        set(v) = p.edit().putInt("consulenteTetto", v).apply()
    var consulenteStoria: String
        get() = p.getString("consulenteStoria", "")!!
        set(v) = p.edit().putString("consulenteStoria", v).apply()
    // Quanti secondi di silenzio chiudono un messaggio a voce in modalità auto.
    var pausaInvio: Int
        get() = p.getInt("pausaInvio", 4)
        set(v) = p.edit().putInt("pausaInvio", v).apply()
    var leggiRisposteInAuto: Boolean
        get() = p.getBoolean("leggiAuto", true)
        set(v) = p.edit().putBoolean("leggiAuto", v).apply()

    // Il listino di OpenRouter, letto una volta al giorno (logica/Listino.kt), in un file di impostazioni suo: è grande.
    private val l = context.getSharedPreferences("listino", Context.MODE_PRIVATE)
    var listino: String
        get() = l.getString("voci", "")!!
        set(v) = l.edit().putString("voci", v).apply()
    var listinoLetto: Long
        get() = l.getLong("letto", 0)
        set(v) = l.edit().putLong("letto", v).apply()
    // Gli avvisi già notificati: uno stesso avviso non suona due volte.
    var avvisiNotificati: Set<String>
        get() = l.getStringSet("notificati", emptySet())!!
        set(v) = l.edit().putStringSet("notificati", v).apply()

    open var chiave: String
        get() = p.getString("chiave", null)?.let { runCatching { Segreti.decifra(it) }.getOrNull() }.orEmpty()
        set(v) = p.edit().apply { if (v.isBlank()) remove("chiave") else putString("chiave", Segreti.cifra(v.trim())) }.apply()

    companion object {
        const val MODELLO_PREDEFINITO = "meta-llama/llama-3.3-70b-instruct"
        const val MODELLO_VISTA = "google/gemini-3.1-flash-lite"
        const val MODELLO_LEGGERO = "google/gemini-3.1-flash-lite"
        // La ricerca (02/10/2026): Perplexity cerca da sé, sul suo indice, più volte per risposta; la ricerca di OpenRouter
        // (Exa) data a un modello qualunque trovava una fonte sola, a volte una pagina sbagliata. Il veloce per la ricerca
        // dello Shell e per Segui; il Pro per gli strati della ricerca a fondo, che il Ghost autorizza con la stima davanti.
        const val MODELLO_RICERCA = "perplexity/sonar"
        const val MODELLO_A_FONDO = "perplexity/sonar-pro"
        val MODELLI_RICERCA = listOf(
            "perplexity/sonar" to "Perplexity Sonar (1/1 $ + 0,5 cent a ricerca, cerca da sé)",
            "perplexity/sonar-pro" to "Perplexity Sonar Pro (3/15 $ + 0,5 cent a ricerca, più fonti)",
            "perplexity/sonar-reasoning-pro" to "Perplexity Sonar Reasoning Pro (2/8 $ + 0,5 cent, ragiona sulle fonti)",
        )
        // Verificati sul listino vivo di OpenRouter il 02/10/2026 (/api/v1/models): strumenti, immagini, temperatura,
        // scadenze. Prezzi in dollari per milione di token, ingresso/uscita. La lista non si aggiorna da sola: per questo
        // il programma legge il listino ogni giorno e avvisa (logica/Listino.kt).
        val MODELLI_LEGGERI = listOf(
            "deepseek/deepseek-v4.1-flash" to "DeepSeek V4.1 Flash (0,03/0,5 $, vede)",
            "qwen/qwen3.8-flash" to "Qwen 3.8 Flash (0,15/0,47 $, vede)",
            "google/gemini-3.1-flash-lite" to "Gemini 3.1 Flash Lite (0,25/1,5 $, vede)",
            "openai/gpt-6-luna" to "GPT-6 Luna (0,1/0,5 $, vede, temperatura sua)",
        )
        val MODELLI_VISTA = listOf(
            "deepseek/deepseek-v4.1-flash" to "DeepSeek V4.1 Flash (0,03/0,5 $, il più economico)",
            "qwen/qwen3.8-flash" to "Qwen 3.8 Flash (0,15/0,47 $)",
            "google/gemini-3.1-flash-lite" to "Gemini 3.1 Flash Lite (0,25/1,5 $)",
        )
        // Fra i modelli principali, quelli che vedono già da soli: con loro non si cambia modello. Se il listino è
        // stato letto, decide il listino (Shell.vede).
        val VEDONO = setOf("moonshotai/kimi-k2.6", "moonshotai/kimi-k3", "google/gemini-3.1-pro-preview", "google/gemini-3.8-flash",
            "anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5", "anthropic/claude-sonnet-4.5", "openai/gpt-6-sol", "x-ai/grok-4.7",
            "google/gemini-3.5-flash") + MODELLI_VISTA.map { it.first } + MODELLI_LEGGERI.map { it.first }
        val MODELLI = listOf(
            "meta-llama/llama-3.3-70b-instruct" to "Llama 3.3 70B (0,1/0,32 $, economico, non vede)",
            "deepseek/deepseek-v4-pro" to "DeepSeek V4 Pro (0,21/0,42 $, non vede)",
            "z-ai/glm-5.3" to "GLM-5.3 (0,22/3,39 $, non vede)",
            "moonshotai/kimi-k2.6" to "Kimi K2.6 (0,43/1,83 $)",
            "moonshotai/kimi-k3" to "Kimi K3 (0,68/10 $)",
            "google/gemini-3.8-flash" to "Gemini 3.8 Flash (0,75/3,75 $)",
            "google/gemini-3.1-pro-preview" to "Gemini 3.1 Pro (2/12 $)",
            "anthropic/claude-sonnet-5.5" to "Claude Sonnet 5.5 (2/10 $)",
            "openai/gpt-6-sol" to "GPT-6 Sol (2/10 $, temperatura sua)",
            "x-ai/grok-4.7" to "Grok 4.7 (2/6 $)",
        )
        // Modelli che OpenRouter ritira: chi li aveva scelti passa da solo al sostituto (verificato il 02/10/2026).
        val RITIRATI = mapOf(
            "qwen/qwen3-vl-32b-instruct" to "deepseek/deepseek-v4.1-flash",   // sparisce il 09/10/2026
            "google/gemini-2.5-flash" to "deepseek/deepseek-v4.1-flash",       // sparisce il 20/10/2026
        )
        fun vivo(id: String) = RITIRATI[id] ?: id
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
