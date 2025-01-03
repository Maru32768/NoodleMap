FROM golang:1.23

WORKDIR /work

COPY ./server .
RUN go mod download

RUN go build -o app .

CMD ["./app"]
