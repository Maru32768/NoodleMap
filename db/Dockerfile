FROM postgres:18.1

RUN apt-get update && apt-get install -y curl uuid-runtime && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/pressly/goose/releases/download/v3.27.1/goose_linux_x86_64 \
      -o /usr/local/bin/goose && chmod +x /usr/local/bin/goose
