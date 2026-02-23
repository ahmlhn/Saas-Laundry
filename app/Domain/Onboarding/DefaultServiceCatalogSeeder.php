<?php

namespace App\Domain\Onboarding;

use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Promotion;
use App\Models\Service;
use App\Models\ServiceProcessTag;
use App\Models\ServiceProcessTagLink;
use App\Models\Tenant;

class DefaultServiceCatalogSeeder
{
    public function seed(Tenant $tenant, Outlet $outlet): void
    {
        $tagIds = $this->seedProcessTags($tenant);

        $regularVariants = $this->seedRegularServices($tenant, $tagIds);
        $packageVariants = $this->seedPackageServices($tenant, $tagIds);
        $perfumeAndItem = $this->seedPerfumeAndItem($tenant);

        $activeServiceIds = collect([...$regularVariants, ...$packageVariants, ...$perfumeAndItem])
            ->map(fn (Service $service): string => (string) $service->id)
            ->values();

        foreach ($activeServiceIds as $serviceId) {
            OutletService::query()->firstOrCreate(
                [
                    'outlet_id' => $outlet->id,
                    'service_id' => $serviceId,
                ],
                [
                    'active' => true,
                ]
            );
        }

        $this->seedPromotions($tenant);
    }

    /**
     * @return array{
     *     cuci: string,
     *     kering: string,
     *     setrika: string
     * }
     */
    private function seedProcessTags(Tenant $tenant): array
    {
        $tagRows = [
            ['name' => 'Cuci', 'color_hex' => '#2A7CE2', 'sort_order' => 0],
            ['name' => 'Kering', 'color_hex' => '#1FA89A', 'sort_order' => 1],
            ['name' => 'Setrika', 'color_hex' => '#DD8C10', 'sort_order' => 2],
        ];

        $tagByName = [];

        foreach ($tagRows as $row) {
            $tag = ServiceProcessTag::query()->create([
                'tenant_id' => $tenant->id,
                'name' => $row['name'],
                'color_hex' => $row['color_hex'],
                'sort_order' => $row['sort_order'],
                'active' => true,
            ]);

            $tagByName[strtolower($row['name'])] = (string) $tag->id;
        }

        return [
            'cuci' => $tagByName['cuci'],
            'kering' => $tagByName['kering'],
            'setrika' => $tagByName['setrika'],
        ];
    }

    /**
     * @param array{cuci: string, kering: string, setrika: string} $tagIds
     * @return array<int, Service>
     */
    private function seedRegularServices(Tenant $tenant, array $tagIds): array
    {
        $bedCoverGroup = $this->createService($tenant, [
            'name' => 'Bed Cover',
            'service_type' => 'regular',
            'parent_service_id' => null,
            'is_group' => true,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 0,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 10,
            'image_icon' => null,
        ]);
        $this->attachProcessTags($bedCoverGroup, [$tagIds['cuci'], $tagIds['kering']]);

        $bedCoverKing = $this->createService($tenant, [
            'name' => 'King',
            'service_type' => 'regular',
            'parent_service_id' => $bedCoverGroup->id,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 25000,
            'duration_days' => 3,
            'active' => true,
            'sort_order' => 11,
            'image_icon' => 'bed-outline',
        ]);
        $this->attachProcessTags($bedCoverKing, [$tagIds['cuci'], $tagIds['kering']]);

        $bedCoverQueen = $this->createService($tenant, [
            'name' => 'Queen',
            'service_type' => 'regular',
            'parent_service_id' => $bedCoverGroup->id,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 18000,
            'duration_days' => 3,
            'active' => true,
            'sort_order' => 12,
            'image_icon' => 'bed-outline',
        ]);
        $this->attachProcessTags($bedCoverQueen, [$tagIds['cuci'], $tagIds['kering']]);

        $bedCoverSingle = $this->createService($tenant, [
            'name' => 'Single',
            'service_type' => 'regular',
            'parent_service_id' => $bedCoverGroup->id,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 15000,
            'duration_days' => 3,
            'active' => true,
            'sort_order' => 13,
            'image_icon' => 'bed-outline',
        ]);
        $this->attachProcessTags($bedCoverSingle, [$tagIds['cuci'], $tagIds['kering']]);

        $bonekaGroup = $this->createService($tenant, [
            'name' => 'Boneka',
            'service_type' => 'regular',
            'parent_service_id' => null,
            'is_group' => true,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 0,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 20,
            'image_icon' => null,
        ]);
        $this->attachProcessTags($bonekaGroup, [$tagIds['cuci'], $tagIds['kering']]);

        $bonekaBesar = $this->createService($tenant, [
            'name' => 'Besar',
            'service_type' => 'regular',
            'parent_service_id' => $bonekaGroup->id,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 25000,
            'duration_days' => 5,
            'active' => true,
            'sort_order' => 21,
            'image_icon' => 'happy-outline',
        ]);
        $this->attachProcessTags($bonekaBesar, [$tagIds['cuci'], $tagIds['kering']]);

        $bonekaKecil = $this->createService($tenant, [
            'name' => 'Kecil',
            'service_type' => 'regular',
            'parent_service_id' => $bonekaGroup->id,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 20000,
            'duration_days' => 5,
            'active' => true,
            'sort_order' => 22,
            'image_icon' => 'happy-outline',
        ]);
        $this->attachProcessTags($bonekaKecil, [$tagIds['cuci'], $tagIds['kering']]);

        $jasGroup = $this->createService($tenant, [
            'name' => 'Jas',
            'service_type' => 'regular',
            'parent_service_id' => null,
            'is_group' => true,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 0,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 30,
            'image_icon' => null,
        ]);
        $this->attachProcessTags($jasGroup, [$tagIds['cuci'], $tagIds['kering'], $tagIds['setrika']]);

        $jasGantung = $this->createService($tenant, [
            'name' => 'Jas Gantung',
            'service_type' => 'regular',
            'parent_service_id' => $jasGroup->id,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 18000,
            'duration_days' => 3,
            'active' => true,
            'sort_order' => 31,
            'image_icon' => 'shirt-outline',
        ]);
        $this->attachProcessTags($jasGantung, [$tagIds['cuci'], $tagIds['kering'], $tagIds['setrika']]);

        return [
            $bedCoverKing,
            $bedCoverQueen,
            $bedCoverSingle,
            $bonekaBesar,
            $bonekaKecil,
            $jasGantung,
        ];
    }

    /**
     * @param array{cuci: string, kering: string, setrika: string} $tagIds
     * @return array<int, Service>
     */
    private function seedPackageServices(Tenant $tenant, array $tagIds): array
    {
        $packageGroup = $this->createService($tenant, [
            'name' => 'Paket Kilat',
            'service_type' => 'package',
            'parent_service_id' => null,
            'is_group' => true,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 0,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 40,
            'image_icon' => null,
        ]);
        $this->attachProcessTags($packageGroup, [$tagIds['cuci'], $tagIds['kering'], $tagIds['setrika']]);

        $package10Kg = $this->createService($tenant, [
            'name' => 'Paket 10 Kg',
            'service_type' => 'package',
            'parent_service_id' => $packageGroup->id,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 20000,
            'duration_days' => 30,
            'package_quota_value' => 10,
            'package_quota_unit' => 'kg',
            'package_valid_days' => 30,
            'package_accumulation_mode' => 'accumulative',
            'active' => true,
            'sort_order' => 41,
            'image_icon' => 'shirt-outline',
        ]);
        $this->attachProcessTags($package10Kg, [$tagIds['cuci'], $tagIds['kering'], $tagIds['setrika']]);

        return [$package10Kg];
    }

    /**
     * @return array<int, Service>
     */
    private function seedPerfumeAndItem(Tenant $tenant): array
    {
        $perfumeFresh = $this->createService($tenant, [
            'name' => 'Parfum Fresh',
            'service_type' => 'perfume',
            'parent_service_id' => null,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 5000,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 50,
            'image_icon' => 'flask-outline',
        ]);

        $perfumeLavender = $this->createService($tenant, [
            'name' => 'Parfum Lavender',
            'service_type' => 'perfume',
            'parent_service_id' => null,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 5000,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 51,
            'image_icon' => 'flask-outline',
        ]);

        $itemKemejaPanjang = $this->createService($tenant, [
            'name' => 'Kemeja Panjang',
            'service_type' => 'item',
            'parent_service_id' => null,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 8000,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 60,
            'image_icon' => 'shirt-outline',
        ]);

        $itemCelanaPanjang = $this->createService($tenant, [
            'name' => 'Celana Panjang',
            'service_type' => 'item',
            'parent_service_id' => null,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 9000,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 61,
            'image_icon' => 'shirt-outline',
        ]);

        $itemHanduk = $this->createService($tenant, [
            'name' => 'Handuk',
            'service_type' => 'item',
            'parent_service_id' => null,
            'is_group' => false,
            'unit_type' => 'pcs',
            'display_unit' => 'satuan',
            'base_price_amount' => 7000,
            'duration_days' => null,
            'active' => true,
            'sort_order' => 62,
            'image_icon' => 'shirt-outline',
        ]);

        return [
            $perfumeFresh,
            $perfumeLavender,
            $itemKemejaPanjang,
            $itemCelanaPanjang,
            $itemHanduk,
        ];
    }

    private function seedPromotions(Tenant $tenant): void
    {
        $selectionPromo = Promotion::query()->create([
            'tenant_id' => $tenant->id,
            'promo_type' => 'selection',
            'name' => 'Promo Member 10%',
            'status' => 'active',
            'priority' => 10,
            'stack_mode' => 'exclusive',
            'rule_json' => [
                'discount_type' => 'percentage',
                'discount_value' => 10,
                'minimum_amount' => 50000,
                'max_discount' => 15000,
                'applies_to' => 'regular',
            ],
            'notes' => 'Contoh promo default untuk layanan reguler.',
        ]);
        $selectionPromo->targets()->create([
            'target_type' => 'service_type',
            'target_id' => 'regular',
        ]);

        $automaticPromo = Promotion::query()->create([
            'tenant_id' => $tenant->id,
            'promo_type' => 'automatic',
            'name' => 'Promo Paket Hemat',
            'status' => 'draft',
            'priority' => 5,
            'stack_mode' => 'exclusive',
            'rule_json' => [
                'discount_type' => 'fixed',
                'discount_value' => 5000,
                'minimum_amount' => 50000,
                'applies_to' => 'package',
            ],
            'notes' => 'Contoh promo otomatis untuk layanan paket.',
        ]);
        $automaticPromo->targets()->create([
            'target_type' => 'service_type',
            'target_id' => 'package',
        ]);

        $voucherPromo = Promotion::query()->create([
            'tenant_id' => $tenant->id,
            'promo_type' => 'voucher',
            'name' => 'Voucher Selamat Datang',
            'status' => 'draft',
            'priority' => 1,
            'stack_mode' => 'exclusive',
            'rule_json' => [
                'discount_type' => 'fixed',
                'discount_value' => 7000,
                'minimum_amount' => 30000,
                'applies_to' => 'all',
            ],
            'notes' => 'Contoh voucher untuk pelanggan baru.',
        ]);
        $voucherPromo->targets()->create([
            'target_type' => 'all',
            'target_id' => null,
        ]);
        $voucherPromo->vouchers()->create([
            'code' => 'WELCOME7K',
            'quota_total' => 100,
            'quota_used' => 0,
            'per_customer_limit' => 1,
            'active' => true,
            'expires_at' => null,
        ]);
    }

    /**
     * @param array<string, mixed> $attributes
     */
    private function createService(Tenant $tenant, array $attributes): Service
    {
        return Service::query()->create([
            'tenant_id' => $tenant->id,
            'name' => $attributes['name'],
            'service_type' => $attributes['service_type'],
            'parent_service_id' => $attributes['parent_service_id'] ?? null,
            'is_group' => (bool) ($attributes['is_group'] ?? false),
            'unit_type' => $attributes['unit_type'] ?? 'pcs',
            'display_unit' => $attributes['display_unit'] ?? 'satuan',
            'base_price_amount' => (int) ($attributes['base_price_amount'] ?? 0),
            'duration_days' => $attributes['duration_days'] ?? null,
            'package_quota_value' => $attributes['package_quota_value'] ?? null,
            'package_quota_unit' => $attributes['package_quota_unit'] ?? null,
            'package_valid_days' => $attributes['package_valid_days'] ?? null,
            'package_accumulation_mode' => $attributes['package_accumulation_mode'] ?? null,
            'active' => (bool) ($attributes['active'] ?? true),
            'sort_order' => (int) ($attributes['sort_order'] ?? 0),
            'image_icon' => $attributes['image_icon'] ?? null,
        ]);
    }

    /**
     * @param array<int, string> $tagIds
     */
    private function attachProcessTags(Service $service, array $tagIds): void
    {
        ServiceProcessTagLink::query()->where('service_id', $service->id)->delete();

        foreach (array_values($tagIds) as $index => $tagId) {
            ServiceProcessTagLink::query()->create([
                'service_id' => $service->id,
                'tag_id' => $tagId,
                'sort_order' => $index,
            ]);
        }
    }
}
