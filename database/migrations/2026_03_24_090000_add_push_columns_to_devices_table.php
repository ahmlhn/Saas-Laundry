<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $table): void {
            $table->string('push_provider', 20)->nullable()->after('last_seen_at');
            $table->string('push_platform', 20)->nullable()->after('push_provider');
            $table->string('push_token', 191)->nullable()->after('push_platform');
            $table->string('push_permission_status', 30)->nullable()->after('push_token');
            $table->boolean('push_enabled')->default(false)->after('push_permission_status');
            $table->dateTime('push_token_updated_at')->nullable()->after('push_enabled');

            $table->unique('push_token');
            $table->index(['tenant_id', 'user_id', 'push_enabled'], 'devices_tenant_user_push_enabled_idx');
            $table->index(['push_provider', 'push_enabled'], 'devices_push_provider_enabled_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table): void {
            $table->dropIndex('devices_push_provider_enabled_idx');
            $table->dropIndex('devices_tenant_user_push_enabled_idx');
            $table->dropUnique(['push_token']);
            $table->dropColumn([
                'push_provider',
                'push_platform',
                'push_token',
                'push_permission_status',
                'push_enabled',
                'push_token_updated_at',
            ]);
        });
    }
};
