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
        Schema::create('devices', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->dateTime('last_seen_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'user_id']);
        });

        Schema::create('sync_mutations', function (Blueprint $table): void {
            $table->id();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->uuid('device_id');
            $table->string('mutation_id', 64);
            $table->unsignedBigInteger('seq')->nullable();
            $table->string('type', 60);
            $table->uuid('outlet_id')->nullable();
            $table->string('entity_type', 50)->nullable();
            $table->string('entity_id', 80)->nullable();
            $table->json('payload_json')->nullable();
            $table->dateTime('client_time')->nullable();
            $table->string('status', 20);
            $table->string('reason_code', 60)->nullable();
            $table->text('message')->nullable();
            $table->unsignedBigInteger('server_cursor')->nullable();
            $table->json('effects')->nullable();
            $table->dateTime('processed_at')->nullable();
            $table->timestamps();

            $table->foreign('device_id')->references('id')->on('devices')->cascadeOnDelete();
            $table->unique(['tenant_id', 'mutation_id']);
            $table->index(['tenant_id', 'device_id', 'seq']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('sync_changes', function (Blueprint $table): void {
            $table->bigIncrements('cursor');
            $table->uuid('change_id')->unique();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->uuid('outlet_id')->nullable();
            $table->string('entity_type', 50);
            $table->string('entity_id', 80);
            $table->string('op', 20);
            $table->json('data_json')->nullable();
            $table->timestamps();

            $table->foreign('outlet_id')->references('id')->on('outlets')->nullOnDelete();
            $table->index(['tenant_id', 'cursor']);
            $table->index(['tenant_id', 'outlet_id', 'cursor']);
        });

        Schema::create('invoice_leases', function (Blueprint $table): void {
            $table->uuid('lease_id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->uuid('device_id');
            $table->date('date');
            $table->string('prefix', 30);
            $table->unsignedInteger('from_counter');
            $table->unsignedInteger('to_counter');
            $table->unsignedInteger('next_counter')->nullable();
            $table->dateTime('expires_at');
            $table->timestamps();

            $table->foreign('device_id')->references('id')->on('devices')->cascadeOnDelete();
            $table->index(['tenant_id', 'outlet_id', 'date']);
            $table->index(['tenant_id', 'device_id', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoice_leases');
        Schema::dropIfExists('sync_changes');
        Schema::dropIfExists('sync_mutations');
        Schema::dropIfExists('devices');
    }
};
