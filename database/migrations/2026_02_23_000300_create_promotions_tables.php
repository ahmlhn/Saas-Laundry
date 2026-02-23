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
        Schema::create('promotions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->enum('promo_type', ['selection', 'automatic', 'voucher']);
            $table->string('name', 150);
            $table->enum('status', ['draft', 'active', 'inactive', 'expired'])->default('draft');
            $table->dateTime('start_at')->nullable();
            $table->dateTime('end_at')->nullable();
            $table->integer('priority')->default(0);
            $table->enum('stack_mode', ['exclusive', 'stackable'])->default('exclusive');
            $table->json('rule_json')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'promo_type', 'status']);
            $table->index(['tenant_id', 'start_at', 'end_at']);
        });

        Schema::create('promotion_targets', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->enum('target_type', ['service', 'service_type', 'outlet', 'all']);
            $table->string('target_id', 80)->nullable();
            $table->timestamps();

            $table->index(['promotion_id', 'target_type']);
        });

        Schema::create('promotion_vouchers', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->string('code', 60);
            $table->unsignedInteger('quota_total')->nullable();
            $table->unsignedInteger('quota_used')->default(0);
            $table->unsignedInteger('per_customer_limit')->nullable();
            $table->boolean('active')->default(true);
            $table->dateTime('expires_at')->nullable();
            $table->timestamps();

            $table->unique(['promotion_id', 'code']);
            $table->index(['promotion_id', 'active']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('promotion_vouchers');
        Schema::dropIfExists('promotion_targets');
        Schema::dropIfExists('promotions');
    }
};
