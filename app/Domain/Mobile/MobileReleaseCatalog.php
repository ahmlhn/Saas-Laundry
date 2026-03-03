<?php

namespace App\Domain\Mobile;

class MobileReleaseCatalog
{
    /**
     * @return array{
     *     platform: string,
     *     version: string,
     *     build: int,
     *     download_url: ?string,
     *     minimum_supported_version: ?string,
     *     published_at: ?string,
     *     checksum_sha256: ?string,
     *     file_size_bytes: ?int,
     *     notes: array<int, string>
     * }
     */
    public function android(): array
    {
        /** @var array<string, mixed> $config */
        $config = (array) config('mobile_release.android', []);

        $build = (int) ($config['build'] ?? 1);
        $fileSizeBytes = (int) ($config['file_size_bytes'] ?? 0);

        return [
            'platform' => 'android',
            'version' => $this->normalizeRequiredString($config['version'] ?? null, '1.0.0'),
            'build' => $build > 0 ? $build : 1,
            'download_url' => $this->normalizeOptionalString($config['download_url'] ?? null),
            'minimum_supported_version' => $this->normalizeOptionalString($config['minimum_supported_version'] ?? null),
            'published_at' => $this->normalizeOptionalString($config['published_at'] ?? null),
            'checksum_sha256' => $this->normalizeOptionalString($config['checksum_sha256'] ?? null),
            'file_size_bytes' => $fileSizeBytes > 0 ? $fileSizeBytes : null,
            'notes' => $this->normalizeNotes($config['release_notes'] ?? []),
        ];
    }

    private function normalizeRequiredString(mixed $value, string $fallback): string
    {
        $normalized = $this->normalizeOptionalString($value);

        return $normalized ?? $fallback;
    }

    private function normalizeOptionalString(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $normalized = trim((string) $value);

        return $normalized !== '' ? $normalized : null;
    }

    /**
     * @param  mixed  $value
     * @return array<int, string>
     */
    private function normalizeNotes(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $notes = [];

        foreach ($value as $item) {
            $normalized = $this->normalizeOptionalString($item);

            if ($normalized !== null) {
                $notes[] = $normalized;
            }
        }

        return array_values(array_unique($notes));
    }
}
