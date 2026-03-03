<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mobile_release_settings', function (Blueprint $table): void {
            $table->string('uploaded_file_disk', 40)->nullable()->after('download_url');
            $table->string('uploaded_file_path', 255)->nullable()->after('uploaded_file_disk');
            $table->string('uploaded_original_name', 255)->nullable()->after('uploaded_file_path');
        });
    }

    public function down(): void
    {
        Schema::table('mobile_release_settings', function (Blueprint $table): void {
            $table->dropColumn([
                'uploaded_file_disk',
                'uploaded_file_path',
                'uploaded_original_name',
            ]);
        });
    }
};
