FROM golang:1.25 AS builder

RUN go install github.com/pressly/goose/v3/cmd/goose@v3.27.1
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 openssh-client && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY . .
RUN go mod download && go build -o app .

WORKDIR /work/cmd/migrate-to-sqlite
RUN go mod download && GOOS=linux GOARCH=amd64 go build -o migrate-to-sqlite .

FROM debian:bookworm-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends awscli curl && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY --from=builder /work/app .
COPY --from=builder /work/data/sql/migrations ./data/sql/migrations
COPY --from=builder /work/cmd/migrate-to-sqlite/migrate-to-sqlite ./cmd/migrate-to-sqlite/migrate-to-sqlite

CMD ["./app"]
