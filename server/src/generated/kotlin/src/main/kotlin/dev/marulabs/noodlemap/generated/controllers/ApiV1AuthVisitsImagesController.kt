package dev.marulabs.noodlemap.generated.controllers

import dev.marulabs.noodlemap.generated.models.UploadVisitImageRequest
import dev.marulabs.noodlemap.generated.models.VisitImage
import io.ktor.http.Headers
import io.ktor.http.Parameters
import io.ktor.server.application.call
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.MissingRequestParameterException
import io.ktor.server.plugins.ParameterConversionException
import io.ktor.server.request.receive
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.util.converters.ConversionService
import io.ktor.util.converters.DefaultConversionService
import io.ktor.util.reflect.typeInfo
import kotlin.Any
import kotlin.String

public interface ApiV1AuthVisitsImagesController {
  /**
   * Adds an image at the end of a visit log's images (at most 10). The server applies the EXIF
   * orientation,
   * scales the long edge down to 2048 px and stores a JPEG without metadata.
   * The request's Origin must be the site's own origin, or a localhost one on an http (local
   * development) site;
   * 403 otherwise.
   *
   * Route is expected to respond with [dev.marulabs.noodlemap.generated.models.VisitImage].
   * Use [dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall.respondTyped] to send
   * the response.
   *
   * @param uploadVisitImageRequest 
   * @param visitId 
   * @param call Decorated ApplicationCall with additional typed respond methods
   */
  public suspend fun uploadVisitImage(
    visitId: String,
    uploadVisitImageRequest: UploadVisitImageRequest,
    call: TypedApplicationCall<VisitImage>,
  )

  public companion object {
    /**
     * Mounts all routes for the ApiV1AuthVisitsImages resource
     *
     * - POST /api/v1/auth/visits/{visitId}/images Adds an image at the end of a visit log's images
     * (at most 10). The server applies the EXIF orientation,
     * scales the long edge down to 2048 px and stores a JPEG without metadata.
     * The request's Origin must be the site's own origin, or a localhost one on an http (local
     * development) site;
     * 403 otherwise.
     */
    public fun Route.apiV1AuthVisitsImagesRoutes(controller: ApiV1AuthVisitsImagesController) {
      post("/api/v1/auth/visits/{visitId}/images") {
        val visitId = call.parameters.getTypedOrFail<kotlin.String>("visitId")
        val uploadVisitImageRequest = call.receive<UploadVisitImageRequest>()
        controller.uploadVisitImage(visitId, uploadVisitImageRequest, TypedApplicationCall(call))
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
