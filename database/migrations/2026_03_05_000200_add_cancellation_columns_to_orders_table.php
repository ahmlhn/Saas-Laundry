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
        Schema::table('orders', function (Blueprint $table): void {
            $table->dateTime('cancelled_at')->nullable()->after('source_channel');
            $table->unsignedBigInteger('cancelled_by')->nullable()->after('cancelled_at');

            $table->foreign('cancelled_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['tenant_id', 'cancelled_at'], 'orders_tenant_cancelled_at_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndex('orders_tenant_cancelled_at_index');
            $table->dropForeign(['cancelled_by']);
            $table->dropColumn(['cancelled_at', 'cancelled_by']);
        });
    }
};
