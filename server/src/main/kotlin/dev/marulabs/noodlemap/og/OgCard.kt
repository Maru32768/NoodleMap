package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.Shop
import java.security.MessageDigest
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Bump whenever the image layout changes, so every OGP image URL changes with it. */
private const val TEMPLATE_VERSION = 2

/** A pill label with its background color (`#rrggbb`). */
data class Chip(val label: String, val color: String)

/**
 * Everything the share page and OGP image show for a shop. [hash] names the image, so any
 * visible change (including date-derived statuses) yields a new image URL.
 */
data class OgCard(
    val name: String,
    val category: String,
    val statuses: List<Chip>,
    val tags: List<Chip>,
    /** 0-5 like the web's favToHearts; 0 draws nothing. */
    val hearts: Double,
    val area: String,
) {
    fun hash(): String {
        // Length-prefixed fields, so no value can shift into its neighbour.
        val input = buildString {
            fun field(v: Any) = v.toString().let { append(it.length).append(':').append(it) }
            field(TEMPLATE_VERSION)
            field(name)
            field(category)
            for (chips in listOf(statuses, tags)) {
                field(chips.size)
                chips.forEach { field(it.label); field(it.color) }
            }
            field(hearts)
            field(area)
        }
        return MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
            .joinToString("") { "%02x".format(it) }
            .take(16)
    }

    fun description(): String =
        (listOf(category) + tags.map { it.label } + statuses.map { it.label } + area).filter { it.isNotEmpty() }.joinToString("・")

    companion object {
        fun of(shop: Shop, today: LocalDate) = OgCard(
            name = shop.name,
            category = if (shop.category == CategorySlug.UDON) "うどん" else "ラーメン",
            statuses = listOf(if (shop.eaten) Chip("食べた", "#b54a3c") else Chip("気になる", "#6b5e52")) +
                lifecycleChips(shop.openedAt, shop.closedAt, today),
            tags = shop.tags.take(3).map { Chip(it.label, it.color) },
            hearts = if (shop.rate > 0) minOf(5.0, shop.rate / 20) else 0.0,
            area = areaOf(shop.address),
        )
    }
}

private const val NEW_SHOP_WINDOW_DAYS = 365

/** The status chips the web shows on a shop; mirrors `web/src/features/shops/status.ts` (SYSTEM_TAGS). */
internal fun lifecycleChips(openedAt: String?, closedAt: String?, today: LocalDate): List<Chip> {
    val opened = openedAt?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    val closed = closedAt?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    val isClosed = closed != null && !closed.isAfter(today)
    val upcoming = !isClosed && opened != null && opened.isAfter(today)
    val closingSoon = !isClosed && !upcoming && closed != null
    val isNew = !isClosed && opened != null && !opened.isAfter(today) &&
        ChronoUnit.DAYS.between(opened, today) <= NEW_SHOP_WINDOW_DAYS
    return listOfNotNull(
        Chip("新店", "#8c2e21").takeIf { isNew },
        Chip("開店予定", "#8c7341").takeIf { upcoming },
        Chip("閉店予定", "#6e2117").takeIf { closingSoon },
        Chip("閉店", "#1a1614").takeIf { isClosed },
    )
}

// Place-name characters (no digits, spaces, separators or postal marks), optionally minus some suffixes.
private fun name(except: String = "") = """[^\s\d０-９、,，〒\-－‐−$except]"""

// Tried in order after the prefecture:
//  1. 郡 + 町村, with no 市 inside (so 大和郡山市 is not read as a 郡);
//  2. a city up to its first 市 (東村山市, 十日町市), never across a 区 (新宿区市谷), plus a designated city's ward;
//     cities whose name already contains 市 are listed;
//  3. a ward with no city before it (東京23区);
//  4. a town or village written without its 郡.
// shortcut: a town/village name containing 町 or 村 before its end (大町町) is cut short when the address omits its 郡.
private val AREA = Regex(
    "(東京都|北海道|(?:京都|大阪)府|${name()}{2,3}県)(" +
        "${name("市")}+?郡${name("市")}+?[町村]" +
        "|(?:四日市|廿日市|野々市|${name("区")}+?)市(?:${name("町村市")}{1,4}区)?" +
        "|${name()}+?区" +
        "|${name()}+?[町村])",
)

/** 都道府県 + 市区町村 (with the ward of a designated city) from a Japanese address, or "". */
fun areaOf(address: String): String = AREA.find(address)?.let { it.groupValues[1] + it.groupValues[2] }.orEmpty()
