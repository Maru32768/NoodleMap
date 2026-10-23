package dev.marulabs.noodlemap.generated.controllers

import dev.marulabs.noodlemap.generated.models.VisitLog
import dev.marulabs.noodlemap.generated.models.VisitLogInput
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

public interface ApiV1AuthVisitsController {
  /**
   * Replaces every field of a visit log.
   *
   * Route is expected to respond with [dev.marulabs.noodlemap.generated.models.VisitLog].
   * Use [dev.marulabs.noodlemap.generated.controllers.TypedApplicationCall.respondTyped] to send
   * the response.
   *
   * @param visitLogInput 
   * @param visitId 
   * @param call Decorated ApplicationCall with additional typed respond methods
   */
  public suspend fun updateVisitLog(
    visitId: String,
    visitLogInput: VisitLogInput,
    call: TypedApplicationCall<VisitLog>,
  )

  /**
   * Route is expected to respond with status 204.
   * Use [io.ktor.server.response.respond] to send the response.
   *
   * @param visitId 
   * @param call The Ktor application call
   */
  public suspend fun deleteVisitLog(visitId: String, call: ApplicationCall)

  public companion object {
    /**
     * Mounts all routes for the ApiV1AuthVisits resource
     *
     * - PUT /api/v1/auth/visits/{visitId} Replaces every field of a visit log.
     * - DELETE /api/v1/auth/visits/{visitId} 
     */
    public fun Route.apiV1AuthVisitsRoutes(controller: ApiV1AuthVisitsController) {
      put("/api/v1/auth/visits/{visitId}") {
        val visitId = call.parameters.getTypedOrFail<kotlin.String>("visitId")
        val visitLogInput = call.receive<VisitLogInput>()
        controller.updateVisitLog(visitId, visitLogInput, TypedApplicationCall(call))
      }
      delete("/api/v1/auth/visits/{visitId}") {
        val visitId = call.parameters.getTypedOrFail<kotlin.String>("visitId")
        controller.deleteVisitLog(visitId, call)
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
