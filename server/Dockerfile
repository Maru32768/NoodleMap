# syntax=docker/dockerfile:1

# --- Build stage ---
FROM gradle:8.11.1-jdk21 AS builder

WORKDIR /work
COPY . .

# Generated Kotlin (Fabrikt) is committed and ../api is outside the build context, so skip
# the codegen task the Fabrikt plugin wires into compileKotlin.
RUN --mount=type=cache,target=/home/gradle/.gradle \
    gradle --no-daemon buildFatJar -x fabriktGenerate

# --- Runtime stage ---
FROM eclipse-temurin:21-jre AS production

WORKDIR /app
COPY --from=builder /work/build/libs/*-all.jar /app/app.jar

# Respect the container memory limit (512 MB Render starter); JVM sizes heap as a
# percentage of the cgroup limit rather than the host.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
