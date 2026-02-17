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
            $table->string('collection_status', 24)->nullable()->after('source_channel');
            $table->dateTime('collection_last_contacted_at')->nullable()->after('collection_status');
            $table->dateTime('collection_next_follow_up_at')->nullable()->after('collection_last_contacted_at');
            $table->text('collection_note')->nullable()->after('collection_next_follow_up_at');

            $table->index(['tenant_id', 'collection_status'], 'orders_tenant_collection_status_index');
            $table->index('collection_next_follow_up_at', 'orders_collection_follow_up_at_index');
        });

        DB::table('orders')
            ->whereNull('collection_status')
            ->where('due_amount', '>', 0)
            ->update([
                'collection_status' => 'pending',
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndex('orders_tenant_collection_status_index');
            $table->dropIndex('orders_collection_follow_up_at_index');
            $table->dropColumn([
                'collection_status',
                'collection_last_contacted_at',
                'collection_next_follow_up_at',
                'collection_note',
            ]);
        });
    }
};
