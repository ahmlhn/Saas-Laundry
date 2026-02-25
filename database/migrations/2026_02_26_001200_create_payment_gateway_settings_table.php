<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_gateway_settings', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->string('provider', 40)->default('bri_qris');
            $table->text('client_id')->nullable();
            $table->text('client_secret')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'outlet_id', 'provider'], 'payment_gateway_settings_unique');
            $table->index(['tenant_id', 'provider'], 'payment_gateway_settings_tenant_provider_idx');
            $table->index(['outlet_id', 'provider'], 'payment_gateway_settings_outlet_provider_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_gateway_settings');
    }
};

