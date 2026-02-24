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
        Schema::table('plans', function (Blueprint $table): void {
            $table->unsignedBigInteger('monthly_price_amount')->default(0)->after('orders_limit');
            $table->string('currency', 3)->default('IDR')->after('monthly_price_amount');
            $table->boolean('is_active')->default(true)->after('currency');
            $table->unsignedSmallInteger('display_order')->default(100)->after('is_active');
        });

        Schema::create('subscription_cycles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->cascadeOnDelete();
            $table->unsignedInteger('orders_limit_snapshot')->nullable();
            $table->string('status')->default('active');
            $table->dateTime('cycle_start_at');
            $table->dateTime('cycle_end_at');
            $table->dateTime('activated_at')->nullable();
            $table->boolean('auto_renew')->default(true);
            $table->string('source')->default('system');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['cycle_start_at', 'cycle_end_at']);
            $table->index(['tenant_id', 'cycle_start_at', 'cycle_end_at']);
        });

        Schema::create('subscription_change_requests', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('current_cycle_id')->nullable()->constrained('subscription_cycles')->nullOnDelete();
            $table->foreignId('target_plan_id')->constrained('plans')->cascadeOnDelete();
            $table->dateTime('effective_at');
            $table->string('status')->default('pending');
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('decision_note', 500)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['effective_at']);
        });

        Schema::create('subscription_invoices', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('cycle_id')->nullable()->constrained('subscription_cycles')->nullOnDelete();
            $table->string('invoice_no', 40)->unique();
            $table->unsignedBigInteger('amount_total');
            $table->string('currency', 3)->default('IDR');
            $table->boolean('tax_included')->default(true);
            $table->string('payment_method', 40)->default('bank_transfer');
            $table->dateTime('issued_at');
            $table->dateTime('due_at');
            $table->string('status')->default('issued');
            $table->dateTime('paid_verified_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'due_at']);
        });

        Schema::create('subscription_payment_proofs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('invoice_id')->constrained('subscription_invoices')->cascadeOnDelete();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('file_path', 255);
            $table->string('file_name', 255);
            $table->string('mime_type', 120);
            $table->unsignedInteger('file_size');
            $table->string('checksum_sha256', 64)->nullable();
            $table->string('status')->default('submitted');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->string('review_note', 500)->nullable();
            $table->timestamps();

            $table->index(['invoice_id', 'status']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('quota_usage_cycles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('cycle_id')->constrained('subscription_cycles')->cascadeOnDelete();
            $table->unsignedInteger('orders_limit_snapshot')->nullable();
            $table->unsignedInteger('orders_used')->default(0);
            $table->dateTime('last_reconciled_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'cycle_id']);
            $table->index(['tenant_id', 'orders_used']);
        });

        Schema::table('tenants', function (Blueprint $table): void {
            $table->foreignUuid('current_subscription_cycle_id')
                ->nullable()
                ->after('current_plan_id')
                ->constrained('subscription_cycles')
                ->nullOnDelete();
            $table->string('subscription_state')->default('active')->after('status');
            $table->string('write_access_mode')->default('full')->after('subscription_state');

            $table->index(['subscription_state', 'write_access_mode']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table): void {
            $table->dropForeign(['current_subscription_cycle_id']);
            $table->dropIndex(['subscription_state', 'write_access_mode']);
            $table->dropColumn([
                'current_subscription_cycle_id',
                'subscription_state',
                'write_access_mode',
            ]);
        });

        Schema::dropIfExists('quota_usage_cycles');
        Schema::dropIfExists('subscription_payment_proofs');
        Schema::dropIfExists('subscription_invoices');
        Schema::dropIfExists('subscription_change_requests');
        Schema::dropIfExists('subscription_cycles');

        Schema::table('plans', function (Blueprint $table): void {
            $table->dropColumn([
                'monthly_price_amount',
                'currency',
                'is_active',
                'display_order',
            ]);
        });
    }
};
