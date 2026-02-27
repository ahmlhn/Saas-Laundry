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
        Schema::table('printer_note_settings', function (Blueprint $table): void {
            $table->string('paper_width', 4)->default('58mm')->after('show_customer_receipt');
            $table->boolean('auto_cut')->default(false)->after('paper_width');
            $table->boolean('auto_open_cash_drawer')->default(false)->after('auto_cut');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('printer_note_settings', function (Blueprint $table): void {
            $table->dropColumn([
                'paper_width',
                'auto_cut',
                'auto_open_cash_drawer',
            ]);
        });
    }
};
