<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_invoices', function (Blueprint $table): void {
            $table->string('gateway_provider', 40)->nullable()->after('payment_method');
            $table->string('gateway_reference', 120)->nullable()->after('gateway_provider');
            $table->text('qris_payload')->nullable()->after('gateway_reference');
            $table->dateTime('qris_expired_at')->nullable()->after('qris_payload');
            $table->string('gateway_status', 40)->nullable()->after('qris_expired_at');
            $table->unsignedBigInteger('gateway_paid_amount')->nullable()->after('gateway_status');
            $table->dateTime('gateway_updated_at')->nullable()->after('gateway_paid_amount');

            $table->index(['gateway_provider', 'gateway_status'], 'subscription_invoices_gateway_status_idx');
        });

        Schema::create('subscription_payment_intents', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('invoice_id')->constrained('subscription_invoices')->cascadeOnDelete();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
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

            $table->index(['invoice_id', 'status']);
            $table->index(['tenant_id', 'status']);
            $table->index(['expires_at']);
        });

        Schema::create('subscription_payment_events', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('invoice_id')->nullable()->constrained('subscription_invoices')->nullOnDelete();
            $table->foreignUuid('tenant_id')->nullable()->constrained('tenants')->nullOnDelete();
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

            $table->index(['invoice_id', 'process_status']);
            $table->index(['tenant_id', 'process_status']);
            $table->index(['provider', 'event_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_payment_events');
        Schema::dropIfExists('subscription_payment_intents');

        Schema::table('subscription_invoices', function (Blueprint $table): void {
            $table->dropIndex('subscription_invoices_gateway_status_idx');
            $table->dropColumn([
                'gateway_provider',
                'gateway_reference',
                'qris_payload',
                'qris_expired_at',
                'gateway_status',
                'gateway_paid_amount',
                'gateway_updated_at',
            ]);
        });
    }
};
