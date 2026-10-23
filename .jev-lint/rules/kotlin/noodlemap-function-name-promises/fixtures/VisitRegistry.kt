package example.visits

import java.time.Clock
import java.util.Locale
import java.util.UUID

class VisitRegistry(private val cooldownMillis: Long, private val clock: Clock) {
    private val lastVisit = mutableMapOf<UUID, Long>()
    private val shopIdsByName = mutableMapOf<String, UUID>()

    fun cooldownMillis(): Long {
        return cooldownMillis
    }

    fun get(shopId: UUID): Long? = lastVisit[shopId]

    fun isOnCooldown(shopId: UUID): Boolean {
        val now = clock.millis()
        val last = lastVisit[shopId]
        lastVisit[shopId] = now
        return last != null && now - last < cooldownMillis
    }

    fun remaining(shopId: UUID): Long {
        val last = lastVisit[shopId] ?: return 0
        return maxOf(0, cooldownMillis - (clock.millis() - last))
    }

    fun countActive(): Int {
        return lastVisit.size
    }

    fun clearExpired() {
        lastVisit.clear()
    }

    fun findShop(name: String): UUID {
        return shopIdsByName.getOrPut(normalize(name)) { UUID.randomUUID() }
    }

    fun ensureEntry(shopId: UUID) {
        lastVisit.putIfAbsent(shopId, 0L)
    }

    fun retryRegister(name: String, shopId: UUID, attempts: Int): Boolean {
        val key = normalize(name)
        if (key in shopIdsByName) {
            return false
        }
        shopIdsByName[key] = shopId
        return true
    }

    fun activeShops(): List<UUID> {
        val now = clock.millis()
        return lastVisit.filterValues { now - it < cooldownMillis }.keys.toList()
    }

    fun record(shopId: UUID) {
        lastVisit[shopId] = clock.millis()
    }

    private fun normalize(name: String): String = name.trim().lowercase(Locale.ROOT)

    override fun toString(): String = "VisitRegistry(${lastVisit.size} shops, ${cooldownMillis}ms)"
}
