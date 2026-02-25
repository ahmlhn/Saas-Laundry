<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_payment_intents', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->string('provider', 40)->default('bri_qris');
            $table->string('intent_reference', 120)->unique();
            $table->unsignedBigInteger('amount_total');
            $table->string('currency', 3)->default('IDR');
            $table->string('status', 40)->default('created');
            $table->text('qris_payload')->nullable();
            $table->dateTime('expires_at')->nullable();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('gateway_response_json')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
            $table->index(['tenant_id', 'status']);
            $table->index(['expires_at']);
        });

        Schema::create('order_payment_events', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignUuid('tenant_id')->nullable()->constrained('tenants')->nullOnDelete();
            $table->foreignUuid('outlet_id')->nullable()->constrained('outlets')->nullOnDelete();
            $table->foreignUuid('intent_id')->nullable()->constrained('order_payment_intents')->nullOnDelete();
            $table->string('provider', 40)->default('bri_qris');
            $table->string('gateway_event_id', 120)->unique();
            $table->string('event_type', 80);
            $table->string('event_status', 80)->nullable();
            $table->unsignedBigInteger('amount_total')->nullable();
            $table->string('currency', 3)->nullable();
            $table->string('gateway_reference', 120)->nullable();
            $table->boolean('signature_valid')->default(false);
            $table->string('process_status', 40)->default('received');
            $table->string('rejection_reason', 120)->nullable();
            $table->json('payload_json')->nullable();
            $table->dateTime('received_at');
            $table->dateTime('processed_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'process_status']);
            $table->index(['tenant_id', 'process_status']);
            $table->index(['provider', 'event_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_payment_events');
        Schema::dropIfExists('order_payment_intents');
    }
};

