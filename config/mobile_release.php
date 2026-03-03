<?php

$androidReleaseNotes = preg_split('/\r\n|\r|\n|\|/', (string) env('MOBILE_ANDROID_RELEASE_NOTES', '')) ?: [];

return [
    'android' => [
        'version' => (string) env('MOBILE_ANDROID_VERSION', '1.0.0'),
        'build' => (int) env('MOBILE_ANDROID_BUILD', 1),
        'download_url' => env('MOBILE_ANDROID_DOWNLOAD_URL'),
        'minimum_supported_version' => env('MOBILE_ANDROID_MINIMUM_SUPPORTED_VERSION'),
        'published_at' => env('MOBILE_ANDROID_PUBLISHED_AT'),
        'checksum_sha256' => env('MOBILE_ANDROID_CHECKSUM_SHA256'),
        'file_size_bytes' => env('MOBILE_ANDROID_FILE_SIZE_BYTES'),
        'release_notes' => array_values(array_filter(array_map(
            static fn (string $value): string => trim($value),
            $androidReleaseNotes
        ), static fn (string $value): bool => $value !== '')),
    ],
];
