package it.resonance.adam.cervello

import it.resonance.adam.dati.Esecuzione
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Proposta
import it.resonance.adam.logica.Risoluzione
import java.time.LocalDate

// Ciò che sta fuori dall'archivio: il calendario del telefono e l'app di posta.
// Un'interfaccia perché lo Shell si provi sulla JVM senza un telefono.
interface Mondo {
    suspend fun agenda(da: LocalDate, giorni: Int): AgendaLetta
    // Per spostare o togliere: trova l'impegno nominato e decide se si può proporre o se va chiesto qualcosa al Ghost.
    suspend fun risolvi(p: Proposta): Risoluzione
    // Legge 14: prima di togliere o cambiare un impegno, il testo completo di ciò che c'era.
    suspend fun copia(p: Proposta): String?
    suspend fun esegui(p: Proposta): Esecuzione
}
