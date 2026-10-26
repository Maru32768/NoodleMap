package dev.marulabs.noodlemap.generated.controllers

import dev.marulabs.noodlemap.generated.models.MealRecordImage
import dev.marulabs.noodlemap.generated.models.UpdateMealRecordImageRequest
import io.ktor.http.Headers
import io.ktor.http.Parameters
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.MissingRequestParameterException
import io.ktor.server.plugins.ParameterConversionException
import io.ktor.server.request.receive
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.put
import io.ktor.util.converters.ConversionService
import io.ktor.util.converters.DefaultConversionService
import io.ktor.util.reflect.typeInfo
import kotlin.Any
import kotlin.String

public interface ApiV1AuthMealRecordImagesController {
  /**
   * Updates an image's caption.
   *
   * Route is expected to respond with [dev.marulabs.noodlemap.generated.models.MealRecordImage].
   * Use [dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall.respondTyped] to send
   * the response.
   *
   * @param updateMealRecordImageRequest 
   * @param imageId 
   * @param call Decorated ApplicationCall with additional typed respond methods
   */
  public suspend fun updateMealRecordImage(
    imageId: String,
    updateMealRecordImageRequest: UpdateMealRecordImageRequest,
    call: TypedApplicationCall<MealRecordImage>,
  )

  /**
   * Route is expected to respond with status 204.
   * Use [io.ktor.server.response.respond] to send the response.
   *
   * @param imageId 
   * @param call The Ktor application call
   */
  public suspend fun deleteMealRecordImage(imageId: String, call: ApplicationCall)

  public companion object {
    /**
     * Mounts all routes for the ApiV1AuthMealRecordImages resource
     *
     * - PUT /api/v1/auth/meal-record-images/{imageId} Updates an image's caption.
     * - DELETE /api/v1/auth/meal-record-images/{imageId} 
     */
    public
        fun Route.apiV1AuthMealRecordImagesRoutes(controller: ApiV1AuthMealRecordImagesController) {
      put("/api/v1/auth/meal-record-images/{imageId}") {
        val imageId = call.parameters.getTypedOrFail<kotlin.String>("imageId")
        val updateMealRecordImageRequest = call.receive<UpdateMealRecordImageRequest>()
        controller.updateMealRecordImage(imageId, updateMealRecordImageRequest,
            TypedApplicationCall(call))
      }
      delete("/api/v1/auth/meal-record-images/{imageId}") {
        val imageId = call.parameters.getTypedOrFail<kotlin.String>("imageId")
        controller.deleteMealRecordImage(imageId, call)
      }
    }

    /**
     * Gets parameter value associated with this name or null if the name is not present.
     * Converting to type R using ConversionService.
     *
     * Throws:
     *   ParameterConversionException - when conversion from String to R fails
     */
    private inline fun <reified R : Any> Parameters.getTyped(name: String,
        conversionService: ConversionService = DefaultConversionService): R? {
      val values = getAll(name) ?: return null
      val typeInfo = typeInfo<R>()
      return try {
          @Suppress("UNCHECKED_CAST")
          conversionService.fromValues(values, typeInfo) as R
      } catch (cause: Exception) {
          throw ParameterConversionException(name, typeInfo.type.simpleName ?:
          typeInfo.type.toString(), cause)
      }
    }

    /**
     * Gets parameter value associated with this name or throws if the name is not present.
     * Converting to type R using ConversionService.
     *
     * Throws:
     *   MissingRequestParameterException - when parameter is missing
     *   ParameterConversionException - when conversion from String to R fails
     */
    private inline fun <reified R : Any> Parameters.getTypedOrFail(name: String,
        conversionService: ConversionService = DefaultConversionService): R {
      val values = getAll(name) ?: throw MissingRequestParameterException(name)
      val typeInfo = typeInfo<R>()
      return try {
          @Suppress("UNCHECKED_CAST")
          conversionService.fromValues(values, typeInfo) as R
      } catch (cause: Exception) {
          throw ParameterConversionException(name, typeInfo.type.simpleName ?:
          typeInfo.type.toString(), cause)
      }
    }

    /**
     * Gets first value from the list of values associated with a name.
     *
     * Throws:
     *   BadRequestException - when the name is not present
     */
    private fun Headers.getOrFail(name: String): String = this[name] ?: throw
        BadRequestException("Header " + name + " is required")
  }
}
