package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.mealrecords.halves
import dev.marulabs.noodlemap.mealrecords.jpeg
import io.kotest.assertions.throwables.shouldThrowAny
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class OgImageTest {

    @Test
    fun `a cover decodes subsampled to just cover the card`() {
        // A stored 記録の画像 is not subsampled: halving it would leave it short of the card.
        decodeCover(jpeg(halves(2048, 1536))).let {
            it.width shouldBe 2048
            it.height shouldBe 1536
        }
        // Larger sources: the coarsest step that still covers 1200x630 without upscaling.
        decodeCover(jpeg(halves(4000, 3000))).let {
            it.width shouldBeInRange 1200..2399
            it.height shouldBeInRange 630..1259
        }
    }

    @Test
    fun `extreme aspect ratios and oversized bitmaps are refused`() {
        decodeCover(jpeg(halves(2400, 800))).width shouldBe 2400
        shouldThrowAny { decodeCover(jpeg(halves(3100, 1000))) }
        shouldThrowAny { decodeCover(jpeg(halves(1000, 3100))) }
        // 3:1, but even unsubsampled it would be over a stored image's 2048 x 2048 pixels.
        shouldThrowAny { decodeCover(jpeg(halves(3600, 1200))) }
        shouldThrowAny { decodeCover(byteArrayOf(1, 2, 3)) }
    }
}
