<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('wa_providers', function (Blueprint $table): void {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('wa_provider_configs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('provider_id')->constrained('wa_providers')->cascadeOnDelete();
            $table->json('credentials_json')->nullable();
            $table->boolean('is_active')->default(false);
            $table->timestamps();

            $table->unique(['tenant_id', 'provider_id']);
            $table->index(['tenant_id', 'is_active']);
        });

        Schema::create('wa_templates', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('outlet_id')->nullable()->constrained('outlets')->nullOnDelete();
            $table->string('template_id', 80);
            $table->unsignedInteger('version')->default(1);
            $table->json('definition_json');
            $table->timestamps();

            $table->unique(['tenant_id', 'outlet_id', 'template_id', 'version'], 'wa_templates_uniq');
            $table->index(['tenant_id', 'template_id']);
        });

        Schema::create('wa_messages', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('outlet_id')->nullable()->constrained('outlets')->nullOnDelete();
            $table->foreignUuid('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('provider_id')->nullable()->constrained('wa_providers')->nullOnDelete();
            $table->string('template_id', 80);
            $table->string('idempotency_key', 255);
            $table->string('to_phone', 20);
            $table->text('body_text');
            $table->string('status', 20)->default('queued');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->string('last_error_code', 80)->nullable();
            $table->text('last_error_message')->nullable();
            $table->string('provider_message_id')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'idempotency_key']);
            $table->index(['tenant_id', 'status', 'created_at']);
            $table->index(['tenant_id', 'template_id']);
        });

        DB::table('wa_providers')->insert([
            'key' => 'mock',
            'name' => 'Mock Provider',
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('wa_messages');
        Schema::dropIfExists('wa_templates');
        Schema::dropIfExists('wa_provider_configs');
        Schema::dropIfExists('wa_providers');
    }
};
