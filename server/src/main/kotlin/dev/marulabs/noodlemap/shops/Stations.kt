package dev.marulabs.noodlemap.shops

import dev.marulabs.noodlemap.generated.models.NearestStation
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sqrt

private const val EARTH_RADIUS_METERS = 6_371_000.0
private const val MAX_DISTANCE_METERS = 5_000.0

private class Station(val name: String, val lat: Double, val lng: Double)

/** Stations from 国土数値情報 鉄道データ, built by `db/generate_stations.py`. */
object Stations {
    private val all: List<Station> by lazy {
        val stream = checkNotNull(Stations::class.java.getResourceAsStream("/stations.csv")) { "stations.csv missing" }
        stream.bufferedReader(Charsets.UTF_8).useLines { lines ->
            lines.drop(1).map { line ->
                val (name, lat, lng) = line.split(',')
                Station(name, lat.toDouble(), lng.toDouble())
            }.toList()
        }
    }

    /** The station closest in a straight line, or null when none is within 5 km. */
    // shortcut: scans all ~9,000 stations per shop; index them in a grid if shops grow to many thousands.
    fun nearest(lat: Double, lng: Double): NearestStation? {
        val cosLat = cos(Math.toRadians(lat))
        var best: Station? = null
        var bestSquared = Double.MAX_VALUE
        for (s in all) {
            val dLat = s.lat - lat
            val dLng = (s.lng - lng) * cosLat
            val squared = dLat * dLat + dLng * dLng
            if (squared < bestSquared) {
                best = s
                bestSquared = squared
            }
        }
        // Equirectangular distance: well under 1% off at the 5 km scale this is used for.
        val meters = Math.toRadians(sqrt(bestSquared)) * EARTH_RADIUS_METERS
        if (best == null || meters > MAX_DISTANCE_METERS) return null
        return NearestStation(name = best.name, distanceMeters = meters.roundToInt())
    }
}
