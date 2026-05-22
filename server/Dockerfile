FROM golang:1.25

WORKDIR /work

COPY . .

RUN go mod download
RUN go build -o app .

CMD ["./app"]
