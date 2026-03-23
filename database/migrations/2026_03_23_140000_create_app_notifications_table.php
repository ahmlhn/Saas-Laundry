<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_notifications', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->nullable()->constrained('tenants')->nullOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('outlet_id')->nullable()->constrained('outlets')->nullOnDelete();
            $table->string('type', 64);
            $table->string('priority', 16)->default('normal');
            $table->string('title', 160);
            $table->text('body');
            $table->string('action_type', 64)->nullable();
            $table->json('action_payload')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'read_at', 'created_at']);
            $table->index(['tenant_id', 'type', 'created_at']);
            $table->index(['outlet_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_notifications');
    }
};
