package it.resonance.adam.cervello

import it.resonance.adam.dati.Esecuzione
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Proposta
import java.time.LocalDate

// Ciò che sta fuori dall'archivio: il calendario del telefono e l'app di posta.
// Un'interfaccia perché lo Shell si provi sulla JVM senza un telefono.
interface Mondo {
    suspend fun agenda(da: LocalDate, giorni: Int): AgendaLetta
    suspend fun esegui(p: Proposta): Esecuzione
}
