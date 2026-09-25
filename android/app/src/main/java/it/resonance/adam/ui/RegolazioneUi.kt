package it.resonance.adam.ui

import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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

    Scheda(Colori.ambra) {
        Etichetta("Temperatura per compito", Colori.ambraInchiostro)
        Tenue("La decide il programma, non il modello. Per forzarla su un messaggio: ＋ nella chat → «Più preciso» o «Più libero».")
        Compito.entries.forEach { c ->
            Riga("${c.etichetta.replaceFirstChar { it.uppercase() }}: ${String.format(Locale.ITALIAN, "%.1f", c.temperatura)}")
            Tenue(c.perche)
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

    Scheda {
        Etichetta("Spesa del mese")
        Riga(String.format(Locale.ITALIAN, "%.2f $", vm.speso()))
    }
}
