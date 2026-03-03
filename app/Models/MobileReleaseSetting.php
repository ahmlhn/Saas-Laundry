<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MobileReleaseSetting extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'platform',
        'version',
        'build',
        'download_url',
        'uploaded_file_disk',
        'uploaded_file_path',
        'uploaded_original_name',
        'minimum_supported_version',
        'published_at',
        'checksum_sha256',
        'file_size_bytes',
        'release_notes',
    ];

    protected function casts(): array
    {
        return [
            'build' => 'integer',
            'published_at' => 'datetime',
            'file_size_bytes' => 'integer',
            'release_notes' => 'array',
        ];
    }
}
