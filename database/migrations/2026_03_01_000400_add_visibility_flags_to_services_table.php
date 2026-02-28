<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table): void {
            $table->boolean('show_in_cashier')->default(true)->after('active');
            $table->boolean('show_to_customer')->default(true)->after('show_in_cashier');
        });

        DB::table('services')
            ->whereNull('show_in_cashier')
            ->update([
                'show_in_cashier' => true,
            ]);

        DB::table('services')
            ->whereNull('show_to_customer')
            ->update([
                'show_to_customer' => true,
            ]);
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table): void {
            $table->dropColumn(['show_in_cashier', 'show_to_customer']);
        });
    }
};
