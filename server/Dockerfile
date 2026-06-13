# syntax=docker/dockerfile:1

FROM golang:1.25 AS builder

WORKDIR /work

# Download modules first so dependency layers stay cached when only source changes.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
# modernc.org/sqlite is a pure-Go driver, so the build needs no CGO/gcc and
# produces a static binary.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -o app .

# Tooling stage for local development (docker-compose targets this).
# The goose CLI and sqlite3 are only needed by db/entrypoint.sh; the production
# image runs migrations through the goose Go library in main.go instead, so this
# stage is intentionally NOT in the production build graph.
FROM builder AS dev

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go install github.com/pressly/goose/v3/cmd/goose@v3.27.1
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 curl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM debian:bookworm-slim AS production

# ca-certificates is required for outbound TLS (S3 backups, Google token verification).
# AWS access uses the aws-sdk-go-v2 library, so the awscli package is not needed.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY --from=builder /work/app .
COPY --from=builder /work/data/sql/migrations ./data/sql/migrations

CMD ["./app"]
