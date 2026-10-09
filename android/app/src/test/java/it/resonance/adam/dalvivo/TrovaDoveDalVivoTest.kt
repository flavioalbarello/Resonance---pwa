package it.resonance.adam.dalvivo

import androidx.room.Room
import it.resonance.adam.Impostazioni
import it.resonance.adam.cervello.Osm
import it.resonance.adam.cervello.Shell
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.Ruolo
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

// Il collaudo dal vivo (lezione del 03/10: nessuna funzione di ricerca si consegna senza averla provata davvero).
// Gira solo con la chiave di prova e il lettore Chromium acceso; altrimenti si salta:
//   OPENROUTER_PROVA=… LETTORE_URL=http://127.0.0.1:8787 ./gradlew testDevDebugUnitTest --tests '*DalVivo*'
// Modello vero (quello del Ghost), mappa vera, siti veri. Scrive le schede e le risposte in build/dalvivo/.
// Le domande vere sono diverse fra loro; ciò che conta lo legge l'architetto nel rapporto, non un assert.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TrovaDoveDalVivoTest {
    private val app = RuntimeEnvironment.getApplication()
    private val chiave = System.getenv("OPENROUTER_PROVA").orEmpty()
    private val lettore = System.getenv("LETTORE_URL").orEmpty()
    private val domande = (System.getenv("DOMANDE_DAL_VIVO") ?: "").split("||").map { it.trim() }.filter { it.isNotEmpty() }

    @Test fun domandeVere() = runBlocking {
        assumeTrue("senza OPENROUTER_PROVA e LETTORE_URL il collaudo dal vivo si salta", chiave.isNotBlank() && lettore.isNotBlank() && domande.isNotEmpty())
        val imp = object : Impostazioni(app) {
            override var chiave: String
                get() = this@TrovaDoveDalVivoTest.chiave
                set(_) {}
        }
        imp.modello = System.getenv("MODELLO_DAL_VIVO") ?: "moonshotai/kimi-k2.6"
        imp.tettoMensile = 1.0
        val uscita = File(System.getProperty("user.dir"), "build/dalvivo").apply { mkdirs() }
        for ((n, d) in domande.withIndex()) {
            val db = Room.inMemoryDatabaseBuilder(app, Db::class.java).allowMainThreadQueries().build()
            val inizio = System.currentTimeMillis()
            val esito = runCatching { Shell(Archivio(db), imp, osm = Osm(), lettore = LettoreHttp(lettore, app)).turno(d) }
            val messaggi = db.messaggi().elenco()
            val costo = messaggi.sumOf { it.costo ?: 0.0 } + db.turni().ultimi(50).sumOf { it.costo ?: 0.0 }
            File(uscita, "domanda-${n + 1}.md").writeText(buildString {
                appendLine("# $d"); appendLine()
                appendLine("secondi: ${(System.currentTimeMillis() - inizio) / 1000} · costo registrato (messaggi + turni, può contare due volte): ${"%.4f".format(costo)} $")
                appendLine(); appendLine("## Turni"); db.turni().ultimi(50).reversed().forEach { appendLine("- ${it.compito} ${it.modello} · ${it.strumenti} · ${it.costo}") }
                appendLine(); appendLine("## Messaggi")
                messaggi.forEach { appendLine("### ${it.ruolo}${it.modello?.let { m -> " · $m" } ?: ""}"); appendLine(it.testo); appendLine() }
                esito.exceptionOrNull()?.let { appendLine("## ERRORE\n${it.stackTraceToString().take(3000)}") }
            })
            db.close()
            if (messaggi.none { it.ruolo == Ruolo.SHELL }) println("domanda ${n + 1}: nessuna risposta dello Shell")
        }
    }
}
