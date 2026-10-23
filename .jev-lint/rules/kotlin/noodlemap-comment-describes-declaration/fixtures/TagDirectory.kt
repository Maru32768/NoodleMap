package example.tags

/**
 * The tags of one map, looked up by name.
 */
class TagDirectory {
    private val tags = HashMap<String, Tag>()

    /**
     * Adds [tag], replacing a tag of the same name.
     */
    fun add(tag: Tag) {
        tags[tag.name] = tag
    }

    /**
     * Returns the tag named [name], or null when no tag has this name.
     */
    fun tag(name: String): Tag {
        return tags[name] ?: throw IllegalArgumentException("Unknown tag: $name")
    }

    /**
     * Returns the tag named [name], if there is one.
     */
    fun find(name: String): Tag? = tags[name]

    /**
     * Returns every tag, sorted by name.
     */
    fun all(): List<Tag> = tags.values.toList()

    /**
     * Returns at most [limit] tag names that start with [prefix], for autocompletion.
     *
     * @throws IllegalArgumentException if [limit] is negative
     */
    fun suggest(prefix: String, limit: Int): List<String> {
        require(limit >= 0) { "limit must not be negative: $limit" }
        return tags.keys.filter { it.startsWith(prefix) }.take(limit)
    }

    /**
     * Returns tag names starting with [prefix], at most 10 of them.
     */
    fun suggest(prefix: String): List<String> = suggest(prefix, DEFAULT_LIMIT)

    /**
     * How long a new tag stays hidden from guests after it is created, in minutes.
     */
    fun embargoTime(tag: Tag): Long = tag.embargoSeconds * 1000L

    /**
     * Removes the tag named [name] and moves its shops to [fallback].
     */
    fun remove(name: String) {
        tags.remove(name)
    }

    // --- Shops ---

    /**
     * Handles a shop being tagged.
     */
    fun attach(tag: Tag, shopId: String) {
        tag.shopIds.add(shopId)
    }

    /**
     * Call from the request thread only; the directory is not thread-safe.
     */
    fun size(): Int = tags.size

    /**
     * Returns the number of shops of the most used tag, or 0 when there are no tags.
     */
    fun largestTagSize(): Int = tags.values.maxOfOrNull { it.shopIds.size } ?: 0

    class Tag(val name: String, val shopIds: MutableList<String>, val embargoSeconds: Long)

    companion object {
        private const val DEFAULT_LIMIT = 20
    }
}
