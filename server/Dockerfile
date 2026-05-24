FROM golang:1.25 AS builder

RUN go install github.com/pressly/goose/v3/cmd/goose@v3.27.1
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 openssh-client && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY . .
RUN go mod download && go build -o app .

FROM debian:bookworm-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends awscli curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY --from=builder /work/app .
COPY --from=builder /work/data/sql/migrations ./data/sql/migrations

CMD ["./app"]
