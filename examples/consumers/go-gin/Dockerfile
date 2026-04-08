# Multi-stage Go build
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . ./
RUN CGO_ENABLED=0 go build -o /app/blog .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/blog ./blog
COPY templates ./templates
COPY content ./content
COPY public ./public
EXPOSE 8080
ENTRYPOINT ["/app/blog"]
