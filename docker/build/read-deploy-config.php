#!/usr/bin/env php
<?php
/**
 * Runs setup:static-content:deploy per area using app/etc/config.php.build.
 */
declare(strict_types=1);

$root = getenv('MAGENTO_ROOT') ?: getcwd();
$manifestPath = $root . '/app/etc/config.php.build';

if (!is_readable($manifestPath)) {
    fwrite(STDERR, "Missing or unreadable manifest: {$manifestPath}\n");
    exit(1);
}

/** @var array<string, mixed> $manifest */
$manifest = require $manifestPath;
$deploy = $manifest['static_content_deploy'] ?? null;

if (!is_array($deploy)) {
    fwrite(STDERR, "Invalid manifest: static_content_deploy must be an array\n");
    exit(1);
}

$jobs = (int) ($deploy['jobs'] ?? 4);
$memoryLimit = getenv('PHP_MEMORY_LIMIT') ?: '4G';
$binMagento = $root . '/bin/magento';

if (!is_executable($binMagento)) {
    fwrite(STDERR, "Magento CLI not found or not executable: {$binMagento}\n");
    exit(1);
}

$areas = ['frontend', 'adminhtml'];
$exitCode = 0;

foreach ($areas as $area) {
    if (!isset($deploy[$area]) || !is_array($deploy[$area])) {
        continue;
    }

    $areaConfig = $deploy[$area];
    $locales = $areaConfig['locales'] ?? [];
    $themes = $areaConfig['themes'] ?? [];

    if (!is_array($locales) || $locales === []) {
        fwrite(STDERR, "No locales configured for area: {$area}\n");
        $exitCode = 1;
        continue;
    }

    if (!is_array($themes) || $themes === []) {
        fwrite(STDERR, "No themes configured for area: {$area}\n");
        $exitCode = 1;
        continue;
    }

    $cmd = [
        PHP_BINARY,
        '-d',
        'memory_limit=' . $memoryLimit,
        $binMagento,
        'setup:static-content:deploy',
        '-f',
        '--area=' . $area,
        '--jobs=' . max(1, $jobs),
    ];

    foreach ($themes as $theme) {
        if (!is_string($theme) || $theme === '') {
            continue;
        }
        $cmd[] = '--theme';
        $cmd[] = $theme;
    }

    foreach ($locales as $locale) {
        if (!is_string($locale) || $locale === '') {
            continue;
        }
        $cmd[] = $locale;
    }

    $escaped = array_map('escapeshellarg', $cmd);
    $commandLine = implode(' ', $escaped);

    fwrite(STDOUT, "Running: {$commandLine}\n");
    passthru($commandLine, $status);

    if ($status !== 0) {
        fwrite(STDERR, "Static content deploy failed for area: {$area} (exit {$status})\n");
        $exitCode = (int) $status;
    }
}

exit($exitCode);
