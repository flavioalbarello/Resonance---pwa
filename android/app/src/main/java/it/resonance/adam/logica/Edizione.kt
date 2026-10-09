package it.resonance.adam.logica

import it.resonance.adam.BuildConfig

// Due app da un codice solo (decisione del Ghost, 01/10/2026). «Resonance dev» è quella del Ghost: ci si lavora, si
// sbaglia, c'è la riunione con l'architetto. «Resonance» è per gli altri, a partire da Marta: niente architetto, niente
// cassetta, niente riunione, consulente o Balthasar — sia per il costo (l'architetto è un abbonamento Claude), sia
// perché un architetto per ogni Adam vorrebbe dire mutare il genoma di ciascuno prima che il genoma sia fermo.
// Il DNA resta identico in tutte e due: stesse forme dei dati, stesso database, stesse discipline; cambia solo quali
// geni si esprimono. NESSUN interruttore nell'app: la scelta si fa quando si costruisce l'APK (flavor in
// app/build.gradle.kts), e chi ha la base non ha niente da accendere.
object Edizione {
    val sviluppatore: Boolean = BuildConfig.SVILUPPATORE

    // Gli strumenti dello Shell che esistono solo nell'app di sviluppo: quelli dell'architetto, e il fondo, che è un
    // esperimento del Ghost («per adesso è un mio esperimento e tale resta; in futuro potrebbe essere la base di AIR»).
    val SOLO_SVILUPPATORE = setOf("scrivi_all_architetto", "chiedi_consulente", "punto_fermo", "movimento_fondo")

    fun offerto(nome: String, sviluppatore: Boolean = this.sviluppatore) = sviluppatore || nome !in SOLO_SVILUPPATORE
}
