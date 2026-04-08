FROM php:8.3-cli-alpine
WORKDIR /app
RUN apk add --no-cache git unzip && \
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
COPY composer.json ./
RUN composer install --no-interaction --no-dev --optimize-autoloader
COPY . ./
EXPOSE 8000
CMD ["php", "-S", "0.0.0.0:8000", "-t", "public", "public/index.php"]
