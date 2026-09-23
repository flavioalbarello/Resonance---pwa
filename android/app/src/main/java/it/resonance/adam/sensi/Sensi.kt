package it.resonance.adam.sensi

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.TipoMisura
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import kotlin.reflect.KClass

// Qualunque cosa scriva in Health Connect — bilancia, orologio, anello, il telefono stesso — entra da qui.
// Il Ghost non scrive più i numeri che un sensore conosce già.
class Sensi(private val context: Context) {
    val permessi: Set<String> = setOf(
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    )

    fun disponibile() = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    private fun client() = HealthConnectClient.getOrCreate(context)

    suspend fun permessiDaChiedere(): Set<String> {
        val c = client()
        val tutti = permessi.toMutableSet()
        if (c.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE)
            tutti += HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
        return tutti
    }

    suspend fun concessi(): Set<String> = if (disponibile()) client().permissionController.getGrantedPermissions() else emptySet()

    data class Letto(val nuoveOAggiornate: Int, val tipi: Set<TipoMisura>, val fonti: Set<String>, val mancanti: List<String>)

    suspend fun sincronizza(archivio: Archivio, giorni: Long = 30, zona: ZoneId = ZoneId.systemDefault()): Letto {
        if (!disponibile()) return Letto(0, emptySet(), emptySet(), listOf("Health Connect non è disponibile su questo telefono"))
        val c = client()
        val concessi = c.permissionController.getGrantedPermissions()
        val fine = Instant.now()
        val inizio = LocalDate.now(zona).minusDays(giorni - 1).atStartOfDay(zona).toInstant()
        val intervallo = TimeRangeFilter.between(inizio, fine)
        val scritte = mutableListOf<Misura>()
        val fonti = mutableSetOf<String>()
        val mancanti = mutableListOf<String>()
        val ora = System.currentTimeMillis()
        fun giornoDi(i: Instant) = i.atZone(zona).toLocalDate().toString()
        fun ha(k: KClass<out Record>) = HealthPermission.getReadPermission(k) in concessi

        if (ha(WeightRecord::class)) {
            leggiTutti(c, WeightRecord::class, intervallo).forEach { r ->
                fonti += r.metadata.dataOrigin.packageName
                scritte += Misura(tipo = TipoMisura.PESO, valore = r.weight.inKilograms, giorno = giornoDi(r.time), istante = r.time.toEpochMilli(),
                    fonte = "hc:${r.metadata.dataOrigin.packageName}", idEsterno = "hc:peso:${r.metadata.id}")
            }
        } else mancanti += "peso"

        if (ha(SleepSessionRecord::class)) {
            leggiTutti(c, SleepSessionRecord::class, intervallo)
                .groupBy { giornoDi(it.endTime) }
                .forEach { (g, sessioni) ->
                    sessioni.forEach { fonti += it.metadata.dataOrigin.packageName }
                    val minuti = sessioni.sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }.toDouble()
                    scritte += Misura(tipo = TipoMisura.SONNO, valore = minuti, giorno = g, istante = ora, fonte = "hc", idEsterno = "hc:sonno:$g")
                }
        } else mancanti += "sonno"

        if (ha(StepsRecord::class)) {
            c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(inizio.atZone(zona).toLocalDateTime(), fine.atZone(zona).toLocalDateTime()),
                timeRangeSlicer = Period.ofDays(1),
            )).forEach { gruppo ->
                val passi = gruppo.result[StepsRecord.COUNT_TOTAL] ?: return@forEach
                val g = gruppo.startTime.toLocalDate().toString()
                scritte += Misura(tipo = TipoMisura.PASSI, valore = passi.toDouble(), giorno = g, istante = ora, fonte = "hc", idEsterno = "hc:passi:$g")
            }
        } else mancanti += "passi"

        if (ha(RestingHeartRateRecord::class)) {
            leggiTutti(c, RestingHeartRateRecord::class, intervallo).groupBy { giornoDi(it.time) }.forEach { (g, l) ->
                l.forEach { fonti += it.metadata.dataOrigin.packageName }
                scritte += Misura(tipo = TipoMisura.FC_RIPOSO, valore = l.map { it.beatsPerMinute.toDouble() }.average(), giorno = g, istante = ora, fonte = "hc", idEsterno = "hc:fcr:$g")
            }
        } else mancanti += "frequenza a riposo"

        if (ha(ExerciseSessionRecord::class)) {
            leggiTutti(c, ExerciseSessionRecord::class, intervallo).groupBy { giornoDi(it.startTime) }.forEach { (g, l) ->
                l.forEach { fonti += it.metadata.dataOrigin.packageName }
                val minuti = l.sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }.toDouble()
                scritte += Misura(tipo = TipoMisura.ALLENAMENTO, valore = minuti, giorno = g, istante = ora, fonte = "hc", idEsterno = "hc:allen:$g")
            }
        } else mancanti += "allenamenti"

        scritte.filter { it.valore >= it.tipo.minimo && it.valore <= it.tipo.massimo }.forEach { archivio.db.misure().sostituisci(it) }
        return Letto(scritte.size, scritte.map { it.tipo }.toSet(), fonti, mancanti)
    }

    private suspend fun <T : Record> leggiTutti(c: HealthConnectClient, tipo: KClass<T>, filtro: TimeRangeFilter): List<T> {
        val tutti = mutableListOf<T>()
        var pagina: String? = null
        do {
            val r = c.readRecords(ReadRecordsRequest(tipo, filtro, pageToken = pagina))
            tutti += r.records
            pagina = r.pageToken
        } while (!pagina.isNullOrEmpty())
        return tutti
    }
}
