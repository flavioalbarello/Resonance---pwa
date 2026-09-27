package it.resonance.adam.ui

import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import it.resonance.adam.cervello.Compito
import it.resonance.adam.cervello.Instradatore
import it.resonance.adam.cervello.Regolazione
import java.util.Locale

// Come si regola lo Shell: cosa decide il programma, cosa è successo nei turni, cosa hai forzato tu. Oggi la
// temperatura per compito è fissa; questi numeri sono il materiale con cui potrà spostarsi da sola.
@Composable
fun RegolazioneUi(vm: Adam) {
    val turni by vm.turni.collectAsState()
    val messaggi by vm.messaggi.collectAsState()
    val rinunce = remember(vm.avviso) { vm.senzaTemperatura() }
    val confermate = remember(vm.avviso) { vm.temperatureConfermate() }

    Scheda(Colori.ambra) {
        Etichetta("Temperatura per compito", Colori.ambraInchiostro)
        Tenue("La decide il programma, non il modello. Lo Shell può proporre di cambiarla, con un perché, e tu confermi. Per forzarla su un messaggio: ＋ nella chat → «Più preciso» o «Più libero».")
        Compito.entries.forEach { c ->
            val v = confermate[c.name]
            Riga("${c.etichetta.replaceFirstChar { it.uppercase() }}: ${String.format(Locale.ITALIAN, "%.1f", v ?: c.temperatura)}" +
                if (v != null) " (confermata da te; in tabella ${String.format(Locale.ITALIAN, "%.1f", c.temperatura)})" else "")
            Tenue(c.perche)
            if (v != null) TextButton({ vm.ripristinaTemperatura(c) }) { Text("Riporta alla tabella") }
        }
    }

    Scheda {
        Etichetta("Modelli che rifiutano la temperatura")
        if (rinunce.isEmpty()) Tenue("Nessuno: tutti ricevono quella del compito.")
        else {
            rinunce.forEach { Riga(Instradatore.etichetta(it)) }
            Tenue("Per loro vale la temperatura del modello. Se nel frattempo è cambiato, si può riprovare.")
            OutlinedButton({ vm.dimenticaRinunce() }) { Text("Riprova con tutti") }
        }
    }

    Scheda {
        Etichetta("Com'è andata (ultimi ${turni.size} turni)")
        if (turni.isEmpty()) Tenue("Nessun turno registrato ancora: si contano da questa versione.")
        val stati = remember(messaggi) { messaggi.associate { it.id to it.stato } }
        Regolazione.sintesi(turni) { stati[it] }.forEach { s ->
            Riga("${Instradatore.etichetta(s.modello)} · ${s.compito?.etichetta ?: "?"}")
            Tenue(Regolazione.riga(s))
        }
        Tenue("Fermate dal programma = proposte con argomenti sbagliati o ancore che non c'erano. Annullate da te = proposte che hai rifiutato. " +
            "Con qualche settimana di questi numeri, la temperatura di un compito potrà spostarsi da sola per ciascun modello.")
    }

    // Uno per uno, gli ultimi turni: quali strumenti ha chiamato lo Shell e cosa ne è stato. Se un pulsante manca,
    // qui si vede se il modello ha solo scritto («nessuno strumento») o se il programma ha fermato la proposta, e perché.
    Scheda {
        Etichetta("Ultimi turni, uno per uno")
        val recenti = turni.sortedByDescending { it.istante }.take(12)
        if (recenti.none { it.strumenti.isNotBlank() }) Tenue("Si registrano da questa versione.")
        recenti.filter { it.strumenti.isNotBlank() }.forEach { t ->
            Riga(java.text.SimpleDateFormat("d MMM HH:mm", Locale.ITALIAN).format(java.util.Date(t.istante)) + " · " + Instradatore.etichetta(t.modello) +
                (if (t.errore) " · errore" else ""))
            Tenue(t.strumenti + (if (t.proposte.isNotBlank()) " · proposte ${t.proposte.split(',').size}" else "") + (if (t.rifiutate > 0) " · fermate ${t.rifiutate}" else ""))
        }
    }

    Scheda {
        Etichetta("Spesa del mese")
        Riga(String.format(Locale.ITALIAN, "%.2f $", vm.speso()))
    }
}
