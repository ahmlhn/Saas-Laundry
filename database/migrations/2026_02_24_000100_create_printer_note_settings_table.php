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
        Schema::create('printer_note_settings', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignUuid('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->string('profile_name', 32)->default('');
            $table->string('description_line', 80)->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('numbering_mode', 10)->default('default');
            $table->string('custom_prefix', 24)->nullable();
            $table->text('footer_note')->nullable();
            $table->boolean('share_enota')->default(true);
            $table->boolean('show_customer_receipt')->default(true);
            $table->string('logo_path', 255)->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'outlet_id'], 'printer_note_settings_tenant_outlet_unique');
            $table->index(['tenant_id', 'updated_at'], 'printer_note_settings_tenant_updated_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('printer_note_settings');
    }
};
