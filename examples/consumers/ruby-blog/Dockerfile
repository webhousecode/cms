FROM ruby:3.3-alpine
WORKDIR /app
RUN apk add --no-cache build-base
COPY Gemfile ./
RUN bundle install
COPY . ./
EXPOSE 4567
CMD ["bundle", "exec", "rackup", "-o", "0.0.0.0", "-p", "4567"]
