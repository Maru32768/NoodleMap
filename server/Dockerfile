FROM golang:1.23

WORKDIR /work

COPY . .

RUN go mod download
RUN go build -o app .

CMD ["./app"]
