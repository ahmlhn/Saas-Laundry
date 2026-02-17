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
        Schema::table('users', function (Blueprint $table): void {
            $table->softDeletes();
        });

        Schema::table('outlets', function (Blueprint $table): void {
            $table->softDeletes();
        });

        Schema::table('customers', function (Blueprint $table): void {
            $table->softDeletes();
        });

        Schema::table('services', function (Blueprint $table): void {
            $table->softDeletes();
        });

        Schema::table('orders', function (Blueprint $table): void {
            $table->unsignedBigInteger('created_by')->nullable()->after('notes');
            $table->unsignedBigInteger('updated_by')->nullable()->after('created_by');
            $table->string('source_channel', 20)->default('system')->after('updated_by');

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();

            $table->index('outlet_id', 'orders_outlet_id_index');
            $table->dropUnique('orders_outlet_id_invoice_no_unique');
            $table->unique(['tenant_id', 'invoice_no'], 'orders_tenant_id_invoice_no_unique');
        });

        Schema::table('payments', function (Blueprint $table): void {
            $table->unsignedBigInteger('created_by')->nullable()->after('notes');
            $table->unsignedBigInteger('updated_by')->nullable()->after('created_by');
            $table->string('source_channel', 20)->default('system')->after('updated_by');

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('sync_mutations', function (Blueprint $table): void {
            $table->unsignedBigInteger('created_by')->nullable()->after('processed_at');
            $table->unsignedBigInteger('updated_by')->nullable()->after('created_by');
            $table->string('source_channel', 20)->default('system')->after('updated_by');

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('wa_messages', function (Blueprint $table): void {
            $table->unsignedBigInteger('created_by')->nullable()->after('metadata_json');
            $table->unsignedBigInteger('updated_by')->nullable()->after('created_by');
            $table->string('source_channel', 20)->default('system')->after('updated_by');

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('wa_messages', function (Blueprint $table): void {
            $table->dropForeign(['created_by']);
            $table->dropForeign(['updated_by']);
            $table->dropColumn(['created_by', 'updated_by', 'source_channel']);
        });

        Schema::table('sync_mutations', function (Blueprint $table): void {
            $table->dropForeign(['created_by']);
            $table->dropForeign(['updated_by']);
            $table->dropColumn(['created_by', 'updated_by', 'source_channel']);
        });

        Schema::table('payments', function (Blueprint $table): void {
            $table->dropForeign(['created_by']);
            $table->dropForeign(['updated_by']);
            $table->dropColumn(['created_by', 'updated_by', 'source_channel']);
        });

        Schema::table('orders', function (Blueprint $table): void {
            $table->dropUnique('orders_tenant_id_invoice_no_unique');
            $table->dropIndex('orders_outlet_id_index');
            $table->unique(['outlet_id', 'invoice_no']);

            $table->dropForeign(['created_by']);
            $table->dropForeign(['updated_by']);
            $table->dropColumn(['created_by', 'updated_by', 'source_channel']);
        });

        Schema::table('services', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });

        Schema::table('customers', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });

        Schema::table('outlets', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
