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
        Schema::table('services', function (Blueprint $table): void {
            $table->enum('service_type', ['regular', 'package', 'perfume', 'item'])->default('regular')->after('name');
            $table->foreignUuid('parent_service_id')->nullable()->after('service_type')->constrained('services')->nullOnDelete();
            $table->boolean('is_group')->default(false)->after('parent_service_id');
            $table->unsignedSmallInteger('duration_days')->nullable()->after('base_price_amount');
            $table->enum('display_unit', ['kg', 'pcs', 'satuan'])->default('pcs')->after('unit_type');
            $table->decimal('package_quota_value', 10, 2)->nullable()->after('display_unit');
            $table->enum('package_quota_unit', ['kg', 'pcs'])->nullable()->after('package_quota_value');
            $table->unsignedSmallInteger('package_valid_days')->nullable()->after('package_quota_unit');
            $table->enum('package_accumulation_mode', ['accumulative', 'fixed_window'])->nullable()->after('package_valid_days');
            $table->integer('sort_order')->default(0)->after('active');
            $table->string('image_icon', 80)->nullable()->after('sort_order');

            $table->index(['tenant_id', 'service_type', 'parent_service_id'], 'services_tenant_type_parent_idx');
            $table->index(['tenant_id', 'service_type', 'is_group'], 'services_tenant_type_group_idx');
        });

        DB::statement("
            UPDATE services
            SET display_unit = CASE
                WHEN unit_type = 'kg' THEN 'kg'
                WHEN unit_type = 'pcs' THEN 'pcs'
                ELSE 'satuan'
            END
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('services', function (Blueprint $table): void {
            $table->dropIndex('services_tenant_type_parent_idx');
            $table->dropIndex('services_tenant_type_group_idx');
            $table->dropConstrainedForeignId('parent_service_id');

            $table->dropColumn([
                'service_type',
                'is_group',
                'duration_days',
                'display_unit',
                'package_quota_value',
                'package_quota_unit',
                'package_valid_days',
                'package_accumulation_mode',
                'sort_order',
                'image_icon',
            ]);
        });
    }
};
