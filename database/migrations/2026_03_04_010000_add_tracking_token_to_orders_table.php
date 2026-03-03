<?php

use App\Models\Order;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->string('tracking_token', 64)->nullable()->after('order_code');
        });

        Order::query()
            ->whereNull('tracking_token')
            ->select(['id'])
            ->chunkById(200, function ($orders): void {
                foreach ($orders as $order) {
                    Order::query()
                        ->where('id', $order->id)
                        ->update([
                            'tracking_token' => Order::generateTrackingToken(),
                        ]);
                }
            }, 'id');

        Schema::table('orders', function (Blueprint $table): void {
            $table->unique('tracking_token');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropUnique(['tracking_token']);
            $table->dropColumn('tracking_token');
        });
    }
};
