<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table): void {
            $table->string('slug', 80)->nullable()->after('name');
        });

        $usedSlugs = DB::table('tenants')
            ->whereNotNull('slug')
            ->pluck('slug')
            ->filter(fn ($slug): bool => is_string($slug) && $slug !== '')
            ->values()
            ->all();

        $tenants = DB::table('tenants')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'name', 'slug']);

        foreach ($tenants as $tenant) {
            $currentSlug = is_string($tenant->slug) ? trim($tenant->slug) : '';

            if ($currentSlug !== '') {
                continue;
            }

            $base = Str::slug((string) $tenant->name);
            $base = $base !== '' ? $base : 'tenant';
            $base = substr($base, 0, 72);
            $candidate = $base;
            $counter = 1;

            while (in_array($candidate, $usedSlugs, true)) {
                $suffix = '-'.$counter;
                $candidate = substr($base, 0, max(72 - strlen($suffix), 1)).$suffix;
                $counter++;
            }

            DB::table('tenants')
                ->where('id', $tenant->id)
                ->update(['slug' => $candidate]);

            $usedSlugs[] = $candidate;
        }

        Schema::table('tenants', function (Blueprint $table): void {
            $table->unique('slug');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table): void {
            $table->dropUnique(['slug']);
            $table->dropColumn('slug');
        });
    }
};
