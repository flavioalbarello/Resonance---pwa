package it.resonance.adam.battito

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import it.resonance.adam.Impostazioni
import it.resonance.adam.MainActivity
import it.resonance.adam.R
import it.resonance.adam.cervello.Shell
import it.resonance.adam.cervello.istantanea
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Battito
import it.resonance.adam.logica.Dado
import it.resonance.adam.logica.Esperimenti
import it.resonance.adam.logica.Perturbazione
import it.resonance.adam.logica.Ristagno
import it.resonance.adam.logica.Riassunti
import it.resonance.adam.logica.Ritmo
import it.resonance.adam.mondo.MondoAndroid
import it.resonance.adam.sensi.Sensi
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

// L'app prende l'iniziativa: tre battiti al giorno/settimana, senza server, anche ad app chiusa.
object Battiti {
    const val CANALE = "battito"
    const val EXTRA_SCHERMATA = "schermata"

    private const val AZIONE = "it.resonance.adam.BATTITO"

    // Una sveglia di sistema per battito, non un'attesa di WorkManager: a schermo spento Android rinvia i lavori
    // in attesa anche di ore, la sveglia esatta invece suona all'ora (visto il 25/09: «il battito non batte»).
    fun programma(context: Context) {
        val imp = Impostazioni(context)
        val wm = WorkManager.getInstance(context)
        wm.enqueueUniquePeriodicWork(
            "sensi", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SensiWorker>(6, TimeUnit.HOURS).build(),
        )
        // Segui (logica/Ricerca.kt): ogni 3 ore guarda se c'è una lettura da fare (dalle 17) o un resoconto da scrivere.
        // Indipendente dal battito: chi lo spegne non perde ciò che ha chiesto di seguire.
        wm.enqueueUniquePeriodicWork(
            "segui", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SeguiWorker>(3, TimeUnit.HOURS)
                .setConstraints(androidx.work.Constraints.Builder().setRequiredNetworkType(androidx.work.NetworkType.CONNECTED).build()).build(),
        )
        // La cassetta delle lettere con l'architetto: spedisce ciò che è rimasto indietro e ritira le risposte.
        // Solo nell'app di sviluppo (logica/Edizione.kt).
        if (it.resonance.adam.logica.Edizione.sviluppatore) wm.enqueueUniquePeriodicWork(
            "lettere", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<LettereWorker>(3, TimeUnit.HOURS)
                .setConstraints(androidx.work.Constraints.Builder().setRequiredNetworkType(androidx.work.NetworkType.CONNECTED).build()).build(),
        )
        // Le attese delle versioni precedenti suonerebbero una seconda volta.
        Battito.entries.forEach { wm.cancelUniqueWork(it.name) }
        if (!imp.battitoAttivo) {
            val am = context.getSystemService(AlarmManager::class.java)
            Battito.entries.forEach { am.cancel(sveglia(context, it)) }
            return
        }
        Battito.entries.forEach { prossimo(context, it) }
    }

    fun quando(imp: Impostazioni, b: Battito, ora: LocalDateTime = LocalDateTime.now()): LocalDateTime {
        val (orario, giorno) = when (b) {
            Battito.MATTINO -> Ritmo.leggiOrario(imp.orarioMattino, LocalTime.of(7, 30)) to null
            Battito.SERA -> Ritmo.leggiOrario(imp.orarioSera, LocalTime.of(21, 30)) to null
            Battito.SETTIMANA -> Ritmo.leggiOrario(imp.orarioSettimana, LocalTime.of(18, 0)) to DayOfWeek.SUNDAY
        }
        return Ritmo.prossimo(ora, orario, giorno)
    }

    fun esatte(context: Context) = Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    fun prossimo(context: Context, b: Battito) {
        if (!Impostazioni(context).battitoAttivo) return
        val ms = quando(Impostazioni(context), b).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val am = context.getSystemService(AlarmManager::class.java)
        val pi = sveglia(context, b)
        if (esatte(context)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi)
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi)
    }

    private fun sveglia(context: Context, b: Battito) = PendingIntent.getBroadcast(
        context, 200 + b.ordinal,
        Intent(context, SvegliaBattito::class.java).setAction(AZIONE).putExtra("battito", b.name),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    // Il lavoro vero (sensi, riassunto, modello) va in un lavoro accelerato: la sveglia ha pochi secondi.
    fun avvia(context: Context, b: Battito, prova: Boolean = false) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            "battito-${b.name}", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<BattitoWorker>()
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setInputData(workDataOf("battito" to b.name, "prova" to prova, "previsto" to System.currentTimeMillis()))
                .build(),
        )
    }

    fun annota(context: Context, riga: String) {
        val imp = Impostazioni(context)
        imp.registroBattito = Ritmo.annota(imp.registroBattito, riga)
    }

    /** Perché una notifica non si vedrebbe; null se si vede. */
    fun muto(context: Context, canale: String = CANALE): String? {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            return "notifiche non permesse a Resonance"
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return "notifiche spente per Resonance nelle impostazioni del telefono"
        val c = context.getSystemService(NotificationManager::class.java).getNotificationChannel(canale)
        if (c != null && c.importance == NotificationManager.IMPORTANCE_NONE) return "il canale «${c.name}» è spento nelle impostazioni del telefono"
        return null
    }

    fun creaCanale(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CANALE, "Battito", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Mattino, sera e settimana: l'app ti parla per prima"
        })
    }

    // Restituisce false se la notifica non si vede: chi la manda deve poterlo dire.
    @android.annotation.SuppressLint("MissingPermission")
    fun notifica(context: Context, id: Int, titolo: String, testo: String, dettaglio: String, schermata: String, canale: String = CANALE,
                 azioni: List<NotificationCompat.Action> = emptyList(), silenziosa: Boolean = false): Boolean {
        if (muto(context, canale) != null) return false
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_SCHERMATA, schermata)
        }
        val pi = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val completo = if (dettaglio.isNotBlank() && dettaglio != testo) "$testo\n\n$dettaglio" else testo
        val n = NotificationCompat.Builder(context, canale)
            .setSmallIcon(R.drawable.ic_notifica)
            .setContentTitle(titolo)
            .setContentText(testo.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(completo))
            .setContentIntent(pi)
            .setAutoCancel(true)
            // Ridisegnata dopo un gesto (logica/Gesti.kt): non suona una seconda volta.
            .setOnlyAlertOnce(silenziosa)
            .apply { azioni.forEach { addAction(it) } }
            .build()
        // Il permesso l'ha già guardato muto(); se il Ghost lo toglie proprio adesso, la notifica non si vede e lo si dice.
        return try { NotificationManagerCompat.from(context).notify(id, n); true } catch (e: SecurityException) { false }
    }
}

// Suona all'ora del battito; all'avvio del telefono e dopo un aggiornamento rimette le sveglie, che il sistema cancella.
class SvegliaBattito : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val b = intent.getStringExtra("battito")?.let { n -> Battito.entries.find { it.name == n } }
        if (b == null) { Battiti.programma(context); return }
        Battiti.prossimo(context, b)
        Battiti.avvia(context, b)
    }
}

class BattitoWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun getForegroundInfo(): ForegroundInfo {
        TurnoWorker.creaCanali(applicationContext)
        val n = NotificationCompat.Builder(applicationContext, TurnoWorker.CANALE_LAVORO)
            .setSmallIcon(R.drawable.ic_notifica).setContentTitle("Resonance prepara il battito…").setOngoing(true).build()
        return ForegroundInfo(303, n)
    }

    override suspend fun doWork(): Result {
        val b = runCatching { Battito.valueOf(inputData.getString("battito")!!) }.getOrNull() ?: return Result.failure()
        val prova = inputData.getBoolean("prova", false)
        val archivio = Archivio(Db.di(applicationContext))
        val imp = Impostazioni(applicationContext)
        Battiti.creaCanale(applicationContext)
        // Ogni passo può mancare (sensi, calendario, modello): il battito parte comunque, e il registro dice com'è andata.
        val esito = try {
            runCatching { Sensi(applicationContext).sincronizza(archivio, 14) }
            val mondo = MondoAndroid(applicationContext)
            val oggi = LocalDate.now()
            // «Sono via» (01/10/2026): il battito tace. Si leggono i sensi e si tiene pulita la lavagna, e basta: niente
            // notifiche, niente esperimenti chiusi, niente consegne verificate o lavorate, niente dado. Riprende al ritorno.
            // Le tracce svaniscono col tempo anche se il Ghost è via: il tempo passa per tutta la stanza.
            runCatching { archivio.svanisciTracce(oggi) }
            val via = runCatching { archivio.assenzaInCorso() }.getOrNull()
            if (via != null && !prova) {
                runCatching { archivio.pulisciLavagna(oggi) }
                Battiti.annota(applicationContext, Ritmo.riga(b, LocalDateTime.now(), "in pausa: il Ghost è via dal ${via.second.da}", prova))
                return Result.success()
            }
            // L'anello si chiude anche ad app chiusa: un esperimento scaduto si confronta e si dice.
            val chiusi = runCatching { archivio.chiudiScaduti(oggi) }.getOrDefault(emptyList())
            if (chiusi.isNotEmpty()) Battiti.notifica(applicationContext, 110, if (chiusi.size == 1) "Esperimento finito" else "Esperimenti finiti",
                chiusi.joinToString("\n") { "«${it.titolo}»: ${it.esito?.etichetta}" }, chiusi.joinToString("\n") { Esperimenti.traccia(it) }, "SPECCHIO")
            // Le consegne dello Shell: il programma guarda se il documento c'è, e il giorno prima della scadenza apre
            // il turno di lavoro (segnato PRIMA della chiamata; se il turno fallisce torna da lavorare, e lo si dice: 08/10).
            runCatching { archivio.verificaConsegne(oggi) }.getOrDefault(emptyList()).forEach { c ->
                val t = it.resonance.adam.logica.Consegne.traccia(c)
                archivio.db.messaggi().inserisci(it.resonance.adam.dati.Messaggio(ruolo = it.resonance.adam.dati.Ruolo.NOTA, testo = t, istante = System.currentTimeMillis()))
                Battiti.notifica(applicationContext, 114, "Consegna dello Shell", t, "", "ADAM")
            }
            if (!prova) it.resonance.adam.logica.Consegne.daLavorare(archivio.db.consegne().aperte(), oggi).forEach { c ->
                archivio.db.consegne().aggiorna(c.copy(lavorata = true))
                val e = runCatching { Shell(archivio, imp, mondo = mondo).lavoraConsegna(c) }
                val d = it.resonance.adam.logica.Consegne.dopoIlLavoro(c, errore = e.getOrNull()?.errore ?: true, proposte = e.getOrNull()?.proposte?.size ?: 0,
                    risposta = e.getOrNull()?.testo ?: (e.exceptionOrNull()?.message ?: "errore"), chi = it.resonance.adam.logica.Nomi.soggetto(archivio.db.profilo().leggi()))
                if (d.consegna != c.copy(lavorata = true)) archivio.db.consegne().aggiorna(d.consegna)
                Battiti.notifica(applicationContext, 115, d.titolo, d.testo, "", "SHELL")
            }
            // La lavagna: ciò che è finito da 30 giorni si cancella davvero; le notifiche fissate seguono le scadenze.
            runCatching { archivio.pulisciLavagna(oggi) }
            runCatching { Fissati.aggiorna(applicationContext) }
            val agenda = if (b == Battito.MATTINO) runCatching { mondo.agenda(oggi, 1) }.getOrDefault(AgendaLetta.NonLetta) else AgendaLetta.NonLetta
            val i = archivio.istantanea(oggi, agenda)
            val riassunto = when (b) {
                Battito.MATTINO -> Riassunti.mattino(i)
                Battito.SERA -> Riassunti.sera(i)
                Battito.SETTIMANA -> Riassunti.settimana(i)
            }
            val momento = when (b) {
                Battito.MATTINO -> "mattino, inizio della giornata"
                Battito.SERA -> "sera, chiusura della giornata"
                // La domanda della domenica (01/10/2026): le variabili della settimana non si modellano, si chiedono.
                Battito.SETTIMANA -> "fine settimana, lo specchio dei sette giorni. Dopo il fatto, chiudi con UNA domanda al Ghost sulla settimana che arriva " +
                    "(sere in cui finisce tardi, serate fuori, impegni che cambiano), perché i piani si adattino a quella vera"
            }
            val voce = if (imp.mattinoDalModello) runCatching { Shell(archivio, imp, mondo = mondo).parlaPerPrimo(momento, riassunto) }.getOrNull() else null
            // La domanda della domenica resta in chat: la risposta del Ghost ha il suo contesto.
            if (b == Battito.SETTIMANA && voce != null && !prova) runCatching {
                archivio.db.messaggi().inserisci(it.resonance.adam.dati.Messaggio(ruolo = it.resonance.adam.dati.Ruolo.SHELL, testo = voce,
                    istante = System.currentTimeMillis(), modello = it.resonance.adam.cervello.ModelloPerCompito.scegli(it.resonance.adam.cervello.Compito.BATTITO, it.resonance.adam.cervello.ModelloPerCompito.decodifica(imp.modelliPerCompito), imp.modello, imp.modelloLeggero, imp.modelloVista)))
            }
            val titolo = when (b) { Battito.MATTINO -> "Oggi"; Battito.SERA -> "Stasera"; Battito.SETTIMANA -> "La settimana" }
            // I gesti dalla notifica (logica/Gesti.kt): rispondere allo Shell e, la sera, spuntare i rituali di oggi.
            val contenuto = Rapide.Contenuto(100 + b.ordinal, titolo, voce ?: riassunto, if (voce != null) riassunto else "",
                if (b == Battito.SERA || (b == Battito.SETTIMANA && voce != null)) "SHELL" else "SPECCHIO", Battiti.CANALE)
            val rituali = if (b == Battito.SERA) it.resonance.adam.logica.Gesti.daSpuntare(it.resonance.adam.logica.Contesto.statoRituali(i), i.via != null) else emptyList()
            val arrivato = Battiti.notifica(applicationContext, contenuto.id, contenuto.titolo, contenuto.testo, contenuto.dettaglio, contenuto.schermata,
                azioni = Rapide.azioni(applicationContext, contenuto, it.resonance.adam.logica.Gesti.puoRispondere(imp.riunione), rituali))
            // La domenica il programma guarda se qualcosa si è fermato; al massimo una perturbazione ogni due settimane.
            if (!prova && b == Battito.SETTIMANA && Perturbazione.dovuta(imp.ultimaPerturbazione, oggi)) {
                val motivi = Ristagno.trova(i, archivio.db.esperimenti().elenco())
                if (motivi.isNotEmpty()) {
                    imp.ultimaPerturbazione = oggi.toString()
                    val e = Shell(archivio, imp, mondo = mondo).perturba(motivi)
                    if (e.proposte.isNotEmpty()) Battiti.notifica(applicationContext, 111, "Una prova da fare?",
                        e.testo.ifBlank { "Lo Shell propone un esperimento." }, motivi.joinToString("\n"), "SHELL")
                }
            }
            // Il dado della domenica, dopo lo specchio della settimana: il caso lo tira il programma, e lascia il seme.
            if (!prova && b == Battito.SETTIMANA) runCatching {
                val seme = System.nanoTime()
                Dado.scegli(i, archivio.db.voci().elenco(), seme)?.let { scelta ->
                    val e = Shell(archivio, imp, mondo = mondo).dado(scelta, seme)
                    if (e.testo.isNotBlank() || e.proposte.isNotEmpty()) Battiti.notifica(applicationContext, 112, "Il dado della domenica",
                        e.testo.ifBlank { "Lo Shell ha una proposta." }, Dado.descrizione(scelta), "SHELL")
                }
            }
            when {
                !arrivato -> "NON arrivato: ${Battiti.muto(applicationContext) ?: "notifica rifiutata"}"
                voce != null -> "arrivato, scritto dal modello"
                imp.mattinoDalModello -> "arrivato, solo i numeri (il modello non ha risposto)"
                else -> "arrivato, solo i numeri"
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            Battiti.annota(applicationContext, Ritmo.riga(b, LocalDateTime.now(), "interrotto dal sistema, riprova più tardi", prova))
            throw e
        } catch (e: Exception) {
            "errore: ${e.message ?: e.javaClass.simpleName}"
        }
        Battiti.annota(applicationContext, Ritmo.riga(b, LocalDateTime.now(), esito, prova))
        return Result.success()
    }
}

class SensiWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        runCatching { Sensi(applicationContext).sincronizza(Archivio(Db.di(applicationContext)), 7) }
        return Result.success()
    }
}

// Spedisce le lettere dello Shell rimaste indietro e ritira le risposte dell'architetto. Una risposta nuova entra in
// chat come nota del programma (così lo Shell la legge al turno dopo) e, se il Ghost non è nell'app, notifica.
class LettereWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val archivio = Archivio(Db.di(applicationContext))
        val posta = it.resonance.adam.cervello.Corrispondenza(archivio, Impostazioni(applicationContext))
        if (!posta.pronta()) return Result.success()
        runCatching { posta.spedisciInSospeso() }
        val nuove = runCatching { posta.ritira() }.getOrDefault(emptyList())
        // Un intervento rivolto allo Shell («→ Shell») fa partire il suo turno, in coda come quelli del Ghost.
        val ritiro = runCatching { it.resonance.adam.cervello.Tavolo(archivio, Impostazioni(applicationContext)).ritira() }.getOrNull()
        ritiro?.allaShell?.let { TurnoWorker.accoda(applicationContext, it) }
        // «→ Balthasar»: l'architetto lo interroga, e lui risponde nel verbale anche ad app chiusa, alla media.
        ritiro?.perBalthasar?.let { d -> runCatching { it.resonance.adam.cervello.Shell(archivio, Impostazioni(applicationContext)).balthasar(d, it.resonance.adam.logica.Balthasar.Intensita.MEDIA, daArchitetto = true) } }
        nuove.forEach { (l, r) ->
            archivio.db.messaggi().inserisci(it.resonance.adam.dati.Messaggio(ruolo = it.resonance.adam.dati.Ruolo.ARCHITETTO,
                testo = "Risposta dell'architetto alla lettera «${l.oggetto}»:\n${r.testo}", istante = System.currentTimeMillis()))
        }
        if (nuove.isNotEmpty() && !Primopiano.visibile) {
            TurnoWorker.creaCanali(applicationContext)
            Battiti.notifica(applicationContext, 113, "L'architetto ha risposto", nuove.joinToString("\n") { "«${it.first.oggetto}»" }, "", "ADAM", TurnoWorker.CANALE_RISPOSTE)
        }
        return Result.success()
    }
}

// Segui (02/10/2026, logica/Ricerca.kt): la lettura del giorno si fa dalla sera (dopo le 17, quando i mercati hanno chiuso e
// le notizie del giorno ci sono), una notifica per ciascuna; finito il periodo, il resoconto. Mentre il Ghost è via, fermo.
class SeguiWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val archivio = Archivio(Db.di(applicationContext))
        if (runCatching { archivio.assenzaInCorso() }.getOrNull() != null) return Result.success()
        val imp = Impostazioni(applicationContext)
        if (imp.chiave.isBlank()) return Result.success()
        val shell = Shell(archivio, imp, mondo = MondoAndroid(applicationContext))
        val oggi = LocalDate.now()
        // Il listino dei modelli (logica/Listino.kt): una volta al giorno; un modello in scadenza o sparito si dice una volta.
        runCatching { shell.aggiornaListino() }.getOrDefault(emptyList()).takeIf { it.isNotEmpty() }?.let { avvisi ->
            Battiti.notifica(applicationContext, 120, "Un modello sta per sparire", avvisi.joinToString("\n"), "Setup → Motore", "SETUP")
        }
        runCatching { shell.chiudiSeguite(oggi) }.getOrDefault(emptyList()).forEach { o ->
            Seguite.notifica(applicationContext, o.id, "Resoconto pronto: ${o.cosa}", o.resoconto, "SPECCHIO", imp)
        }
        if (LocalDateTime.now().hour < Seguite.ORA_LETTURA) return Result.success()
        runCatching { shell.seguiDovute(oggi) }.getOrDefault(emptyList()).forEach { (o, l) ->
            Seguite.notifica(applicationContext, o.id, "${o.cosa} · ${it.resonance.adam.logica.Ricerca.giorno(o, oggi)}",
                l.testo + if (l.problemi.isNotBlank()) "\n⚠ " + l.problemi.replace("\n", "\n⚠ ") else "", "SPECCHIO", imp)
        }
        return Result.success()
    }
}

object Seguite {
    const val ORA_LETTURA = 17
    // Un id di notifica per cosa seguita, fuori dai numeri del battito (100–115) e del turno (301–302).
    fun notifica(context: Context, idOsservazione: Long, titolo: String, testo: String, schermata: String, imp: Impostazioni) {
        val c = Rapide.Contenuto((500 + idOsservazione % 400).toInt(), titolo, testo, "", schermata, Battiti.CANALE)
        Battiti.notifica(context, c.id, c.titolo, c.testo, c.dettaglio, c.schermata,
            azioni = Rapide.azioni(context, c, it.resonance.adam.logica.Gesti.puoRispondere(imp.riunione), emptyList()))
    }
}

