<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mobile_release_settings', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('platform', 24)->unique();
            $table->string('version', 32);
            $table->unsignedInteger('build')->default(1);
            $table->text('download_url')->nullable();
            $table->string('minimum_supported_version', 32)->nullable();
            $table->timestamp('published_at')->nullable();
            $table->string('checksum_sha256', 64)->nullable();
            $table->unsignedBigInteger('file_size_bytes')->nullable();
            $table->json('release_notes')->nullable();
            $table->timestamps();

            $table->index(['platform', 'updated_at'], 'mobile_release_settings_platform_updated_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mobile_release_settings');
    }
};
