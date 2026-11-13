<?php
/**
 * Merges build-time config (scopes, themes) from app/etc/config.php.build into app/etc/config.php.
 */
declare(strict_types=1);

$root = getenv('MAGENTO_ROOT') ?: getcwd();
$configPath = $root . '/app/etc/config.php';
$buildPath = $root . '/app/etc/config.php.build';

if (!is_readable($configPath)) {
    fwrite(STDERR, "Missing app/etc/config.php in build context\n");
    exit(1);
}
if (!is_readable($buildPath)) {
    fwrite(STDERR, "Missing app/etc/config.php.build in build context\n");
    exit(1);
}

/** @var array<string, mixed> $config */
$config = require $configPath;
/** @var array<string, mixed> $build */
$build = require $buildPath;

foreach (['scopes', 'themes'] as $section) {
    if (isset($build[$section]) && is_array($build[$section])) {
        $config[$section] = $build[$section];
    }
}

$websites = $config['scopes']['websites'] ?? null;
if (!is_array($websites)) {
    fwrite(STDERR, "Build config must define scopes.websites in config.php.build\n");
    exit(1);
}

$hasDefaultWebsite = false;
foreach ($websites as $website) {
    if (is_array($website) && isset($website['is_default']) && (int) $website['is_default'] === 1) {
        $hasDefaultWebsite = true;
        break;
    }
}

if (!$hasDefaultWebsite) {
    fwrite(STDERR, "Build config must mark exactly one website with is_default => 1\n");
    exit(1);
}

if (!isset($config['themes']) || !is_array($config['themes']) || $config['themes'] === []) {
    fwrite(STDERR, "Build config must define themes in config.php.build for DB-less static deploy\n");
    exit(1);
}

$export = var_export($config, true);
$content = "<?php\nreturn " . $export . ";\n";

if (file_put_contents($configPath, $content) === false) {
    fwrite(STDERR, "Failed to write {$configPath}\n");
    exit(1);
}

fwrite(STDOUT, "Merged build scopes and themes into app/etc/config.php\n");
