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

FROM php:8.3-fpm-alpine AS api

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
