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
        Schema::create('customers', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name');
            $table->string('phone_normalized', 20);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'phone_normalized']);
            $table->index(['tenant_id', 'updated_at']);
        });

        Schema::create('services', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name');
            $table->string('unit_type', 10);
            $table->unsignedInteger('base_price_amount');
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['tenant_id', 'active']);
        });

        Schema::create('outlet_services', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->foreignUuid('service_id')->constrained('services')->cascadeOnDelete();
            $table->boolean('active')->default(true);
            $table->unsignedInteger('price_override_amount')->nullable();
            $table->string('sla_override')->nullable();
            $table->timestamps();

            $table->unique(['outlet_id', 'service_id']);
        });

        Schema::create('orders', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->foreignUuid('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('invoice_no')->nullable();
            $table->string('order_code', 32);
            $table->boolean('is_pickup_delivery')->default(false);
            $table->string('laundry_status', 32)->default('received');
            $table->string('courier_status', 32)->nullable();
            $table->foreignId('courier_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('shipping_fee_amount')->default(0);
            $table->unsignedInteger('discount_amount')->default(0);
            $table->unsignedInteger('total_amount')->default(0);
            $table->unsignedInteger('paid_amount')->default(0);
            $table->unsignedInteger('due_amount')->default(0);
            $table->json('pickup')->nullable();
            $table->json('delivery')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'order_code']);
            $table->unique(['outlet_id', 'invoice_no']);
            $table->index(['tenant_id', 'outlet_id', 'created_at']);
        });

        Schema::create('order_items', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignUuid('service_id')->nullable()->constrained('services')->nullOnDelete();
            $table->string('service_name_snapshot');
            $table->string('unit_type_snapshot', 10);
            $table->decimal('qty', 10, 2)->nullable();
            $table->decimal('weight_kg', 10, 2)->nullable();
            $table->unsignedInteger('unit_price_amount');
            $table->unsignedInteger('subtotal_amount');
            $table->timestamps();

            $table->index('order_id');
        });

        Schema::create('payments', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('order_id')->constrained('orders')->cascadeOnDelete();
            $table->unsignedInteger('amount');
            $table->string('method', 30);
            $table->dateTime('paid_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'paid_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('outlet_services');
        Schema::dropIfExists('services');
        Schema::dropIfExists('customers');
    }
};
