FROM node:22-alpine AS frontend

WORKDIR /app

ARG VITE_RECAPTCHA_SITE_KEY=""
ARG VITE_SENTRY_DSN=""
ARG VITE_MAINTENANCE_MODE="false"

ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_MAINTENANCE_MODE=$VITE_MAINTENANCE_MODE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:frontend

FROM composer:2 AS vendor

WORKDIR /app

COPY backend/ ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

FROM php:8.4-fpm-alpine AS api

RUN apk add --no-cache curl libpq libzip oniguruma postgresql-client \
    && apk add --no-cache --virtual .build-dependencies $PHPIZE_DEPS curl-dev libzip-dev oniguruma-dev postgresql-dev \
    && docker-php-ext-install curl mbstring opcache pcntl pdo_pgsql zip \
    && apk del .build-dependencies

WORKDIR /var/www/html

COPY --from=vendor /app/ ./

RUN mkdir -p storage/framework/cache/data storage/framework/sessions \
        storage/framework/views storage/logs storage/app/backups bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R ug+rwX storage bootstrap/cache \
    && printf '\nclear_env = no\n' >> /usr/local/etc/php-fpm.d/www.conf

EXPOSE 9000

CMD ["php-fpm", "-F"]

FROM nginx:stable-alpine AS web

RUN apk add --no-cache curl

COPY --from=frontend /app/dist/ /usr/share/nginx/html/

# EasyPanel Dockerfile deployment: Nginx and PHP-FPM share one container.
# The Compose deployment continues to use the separate "web" and "api" targets.
FROM api AS app

RUN apk add --no-cache nginx supervisor

ENV APP_ENV=production \
    APP_DEBUG=false \
    DB_CONNECTION=pgsql \
    DB_SSLMODE=require \
    CACHE_STORE=database \
    SESSION_DRIVER=array \
    SESSION_SECURE_COOKIE=true \
    QUEUE_CONNECTION=database \
    DB_QUEUE_RETRY_AFTER=3600 \
    LOG_CHANNEL=stderr

COPY --from=frontend /app/dist/ /usr/share/nginx/html/
COPY nginx/standalone-nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/neva-entrypoint

RUN chmod +x /usr/local/bin/neva-entrypoint \
    && mkdir -p /run/nginx /var/log/supervisor \
    && chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/neva-entrypoint"]
CMD ["supervisord", "-n", "-c", "/etc/supervisord.conf"]
