package dev.marulabs.noodlemap.visits

import io.kotest.matchers.shouldBe
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import org.junit.jupiter.api.Test

class VisitImageProcessingTest {

    @Test
    fun `every EXIF orientation ends upright`() {
        // 40 x 20, red only in the top-left quadrant.
        val source = BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB).apply {
            createGraphics().run {
                color = Color.BLUE
                fillRect(0, 0, 40, 20)
                color = Color.RED
                fillRect(0, 0, 20, 10)
                dispose()
            }
        }
        // Where the source's top-left quadrant ends up, as (right?, bottom?), and whether the sides swap.
        val expected = mapOf(
            1 to Triple(false, false, false), 2 to Triple(true, false, false), 3 to Triple(true, true, false),
            4 to Triple(false, true, false), 5 to Triple(false, false, true), 6 to Triple(true, false, true),
            7 to Triple(true, true, true), 8 to Triple(false, true, true),
        )

        for ((orientation, where) in expected) {
            val (right, bottom, swapped) = where
            val result = processVisitImage(withExifOrientation(jpeg(source), orientation))
            val image = ImageIO.read(ByteArrayInputStream(result.jpeg))
            val (w, h) = if (swapped) 20 to 40 else 40 to 20
            (result.width to result.height) shouldBe (w to h)
            (image.width to image.height) shouldBe (w to h)
            val x = if (right) w * 3 / 4 else w / 4
            val y = if (bottom) h * 3 / 4 else h / 4
            Color(image.getRGB(x, y)).red.let { (it > 200) shouldBe true }
            Color(image.getRGB(w - 1 - x, h - 1 - y)).red.let { (it < 60) shouldBe true }
        }
    }

    @Test
    fun `a source up to the size limit keeps its size, and a larger one is subsampled below it`() {
        val result = processVisitImage(jpeg(halves(2048, 100)))
        (result.width to result.height) shouldBe (2048 to 100)
        // ceil(4100 / 2048) = 3: every third pixel, rounded up.
        val tall = processVisitImage(jpeg(halves(100, 4100)))
        (tall.width to tall.height) shouldBe (34 to 1367)
    }
}
