<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('wa_providers')) {
            return;
        }

        $exists = DB::table('wa_providers')
            ->where('key', 'mpwa')
            ->exists();

        if ($exists) {
            return;
        }

        DB::table('wa_providers')->insert([
            'key' => 'mpwa',
            'name' => 'MPWA Gateway',
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        if (! Schema::hasTable('wa_providers')) {
            return;
        }

        DB::table('wa_providers')
            ->where('key', 'mpwa')
            ->delete();
    }
};

