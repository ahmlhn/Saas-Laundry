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
        Schema::table('orders', function (Blueprint $table): void {
            $table->boolean('requires_pickup')->default(false)->after('is_pickup_delivery');
            $table->boolean('requires_delivery')->default(false)->after('requires_pickup');
        });

        DB::table('orders')
            ->where('is_pickup_delivery', true)
            ->update([
                'requires_pickup' => true,
                'requires_delivery' => true,
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn(['requires_pickup', 'requires_delivery']);
        });
    }
};
