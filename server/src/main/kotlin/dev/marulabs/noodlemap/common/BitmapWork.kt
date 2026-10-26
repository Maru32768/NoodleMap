package dev.marulabs.noodlemap.common

import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.header
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * The one bound on bitmap work (OGP renders, meal record image processing) for the 512 MB instance: one bitmap
 * job runs at a time, and at most [maxPending] callers hold a slot (running, waiting, or receiving the
 * upload they will process) before new ones are turned away.
 */
class BitmapWorkGate(private val maxPending: Int) {
    private val lock = Mutex()
    private val pending = AtomicInteger()

    /** Runs [block] holding a slot, or returns null without running it when every slot is taken. */
    suspend fun <T> withSlotOrNull(block: suspend () -> T): T? {
        try {
            if (pending.incrementAndGet() > maxPending) return null
            return block()
        } finally {
            pending.decrementAndGet()
        }
    }

    /** Runs CPU- and memory-heavy [work] off the request threads, one job at a time across the app. */
    suspend fun <T> exclusive(work: () -> T): T = lock.withLock { withContext(Dispatchers.Default) { work() } }
}

/** Tells a client turned away by a full [BitmapWorkGate] when to retry. */
fun ApplicationCall.retrySoon() = response.header(HttpHeaders.RetryAfter, "5")
