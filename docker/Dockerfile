# syntax=docker/dockerfile:1.6

ARG PHP_IMAGE=php:8.3-cli-bookworm
FROM ${PHP_IMAGE}

ENV MAGENTO_ROOT=/var/www/html \
    MAGE_MODE=production \
    PHP_MEMORY_LIMIT=4G \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_HOME=/root/.composer

WORKDIR ${MAGENTO_ROOT}

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    unzip \
    libicu-dev \
    libzip-dev \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    libxml2-dev \
    libxslt1-dev \
    libsodium-dev \
    libonig-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
    bcmath \
    ftp \
    gd \
    intl \
    mbstring \
    opcache \
    pdo_mysql \
    soap \
    sockets \
    sodium \
    xsl \
    zip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY . .

RUN --mount=type=secret,id=composer_auth,target=/root/.composer/auth.json,required \
    composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

COPY --from=m2buildkit build ./docker/build

RUN chmod +x docker/build/magento-build.sh \
    && docker/build/magento-build.sh

CMD ["sleep", "infinity"]
