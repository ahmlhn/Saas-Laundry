<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

class DummyCustomersSeeder extends Seeder
{
    /**
     * @var array<int, string>
     */
    private array $maleFirstNames = [
        'Ahmad', 'Muhammad', 'Abdul', 'Rizky', 'Andi', 'Budi', 'Joko', 'Dedi', 'Eko', 'Fajar',
        'Hendra', 'Indra', 'Junaidi', 'Kurniawan', 'Lukman', 'Mulyadi', 'Naufal', 'Prasetyo', 'Rachmat', 'Sutrisno',
        'Taufik', 'Wahyu', 'Yusuf', 'Zulkifli', 'Bagus', 'Dimas', 'Farhan', 'Galih', 'Hilman', 'Iqbal',
        'Luthfi', 'Maulana', 'Nanda', 'Putra', 'Rafi', 'Syahrul', 'Ujang', 'Wawan', 'Yudi', 'Zainal',
        'Agus', 'Bayu', 'Cahyo', 'Erwin', 'Guntur', 'Arif', 'Ilham', 'Reza', 'Teguh', 'Darmawan',
    ];

    /**
     * @var array<int, string>
     */
    private array $femaleFirstNames = [
        'Aisyah', 'Siti', 'Nur', 'Dewi', 'Fitri', 'Intan', 'Kartika', 'Lestari', 'Maya', 'Nabila',
        'Putri', 'Ratna', 'Sari', 'Utami', 'Wulan', 'Yuliana', 'Zahra', 'Anisa', 'Citra', 'Dinda',
        'Evi', 'Febri', 'Gita', 'Hani', 'Indah', 'Jessica', 'Kirana', 'Linda', 'Mega', 'Novi',
        'Oktavia', 'Puspita', 'Rina', 'Selvi', 'Tiara', 'Vina', 'Widy', 'Yuni', 'Rani', 'Rahma',
        'Safitri', 'Aulia', 'Amelia', 'Salsabila', 'Nadya', 'Ayu', 'Nisa', 'Fitria', 'Melati', 'Yasmin',
    ];

    /**
     * @var array<int, string>
     */
    private array $maleMiddleNames = [
        'Saputra', 'Pratama', 'Nugroho', 'Hidayat', 'Setiawan', 'Permana', 'Firmansyah', 'Ramadhan', 'Wijaya', 'Maulana',
        'Purnama', 'Santoso', 'Hakim', 'Syahputra', 'Gunawan', 'Kurnia', 'Surya', 'Ananda', 'Rizki', 'Hasibuan',
        'Siregar', 'Nasution', 'Pane', 'Harahap', 'Lubis', 'Simanjuntak', 'Situmorang', 'Silalahi', 'Hutapea', 'Wibowo',
        'Hermawan', 'Susanto', 'Kusnadi', 'Darmawan', 'Prakoso', 'Ramdani', 'Fadli', 'Sutanto', 'Ardian', 'Pramudya',
    ];

    /**
     * @var array<int, string>
     */
    private array $femaleMiddleNames = [
        'Maharani', 'Anggraini', 'Permatasari', 'Handayani', 'Puspitasari', 'Rahmawati', 'Salsabila', 'Novianti', 'Aulia', 'Safitri',
        'Kusuma', 'Lestari', 'Ningsih', 'Wulandari', 'Oktaviani', 'Aprilia', 'Kartikasari', 'Nuraini', 'Utari', 'Fitriani',
        'Suryani', 'Kurniasari', 'Pertiwi', 'Azzahra', 'Ramadhani', 'Pratiwi', 'Melati', 'Andini', 'Kirana', 'Syafitri',
        'Hasna', 'Mulyani', 'Kholifah', 'Nabila', 'Anjani', 'Rahmadani', 'Puspita', 'Ariyanti', 'Maulida', 'Salma',
    ];

    /**
     * @var array<int, string>
     */
    private array $maleLastNames = [
        'Putra', 'Utama', 'Jaya', 'Abadi', 'Pranata', 'Herlambang', 'Pamungkas', 'Wicaksono', 'Kusnandar', 'Winata',
        'Darmawan', 'Ramdani', 'Fadillah', 'Ardiansyah', 'Pradana', 'Ramadhan', 'Firmansyah', 'Kurniawan', 'Wibisono', 'Suryanto',
    ];

    /**
     * @var array<int, string>
     */
    private array $femaleLastNames = [
        'Putri', 'Saputri', 'Fauziah', 'Rahmawati', 'Salsabila', 'Novianti', 'Aulia', 'Sukma', 'Amelia', 'Safitri',
        'Fitria', 'Kholifah', 'Utari', 'Kurniasih', 'Pratiwi', 'Wulandari', 'Puspitasari', 'Aprilia', 'Maharani', 'Ningsih',
    ];

    public function run(): void
    {
        $targetTenant = $this->resolveTargetTenant();

        if (! $targetTenant) {
            $this->command?->error('Seeder dibatalkan: tenant tidak ditemukan.');
            return;
        }

        for ($i = 1; $i <= 200; $i++) {
            $index = str_pad((string) $i, 3, '0', STR_PAD_LEFT);
            $phone = '62877'.str_pad((string) $i, 8, '0', STR_PAD_LEFT);
            $gender = $i % 2 === 0 ? 'female' : 'male';
            $name = $this->buildIndonesianName($i, $gender);
            $address = $this->buildAddress($i);

            $meta = [
                'note' => "Pelanggan dummy #{$index}",
                'email' => "dummy{$index}@example.com",
                'birthDate' => '',
                'gender' => $gender,
                'address' => $address,
            ];

            $notes = "[CUSTOMER_META]\n".json_encode($meta, JSON_UNESCAPED_UNICODE)."\n[/CUSTOMER_META]";

            Customer::query()->updateOrCreate(
                [
                    'tenant_id' => $targetTenant->id,
                    'phone_normalized' => $phone,
                ],
                [
                    'name' => $name,
                    'notes' => $notes,
                ]
            );
        }

        $total = Customer::query()->where('tenant_id', $targetTenant->id)->count();

        $this->command?->info("Dummy customer selesai. Tenant: {$targetTenant->name} ({$targetTenant->id}) | total pelanggan tenant: {$total}");
    }

    private function buildIndonesianName(int $index, string $gender): string
    {
        $firstNames = $gender === 'female' ? $this->femaleFirstNames : $this->maleFirstNames;
        $middleNames = $gender === 'female' ? $this->femaleMiddleNames : $this->maleMiddleNames;
        $lastNames = $gender === 'female' ? $this->femaleLastNames : $this->maleLastNames;
        $first = $firstNames[($index - 1) % count($firstNames)];
        $middle = $middleNames[(($index * 7) + 3) % count($middleNames)];
        $last = $lastNames[(($index * 11) + 5) % count($lastNames)];

        if ($index % 5 === 0) {
            return trim("{$first} {$last}");
        }

        return trim("{$first} {$middle} {$last}");
    }

    private function buildAddress(int $index): string
    {
        $streets = ['Melati', 'Kenanga', 'Mawar', 'Anggrek', 'Cempaka', 'Flamboyan', 'Bougenville', 'Pahlawan', 'Merdeka', 'Sudirman'];
        $districts = ['Sukamaju', 'Cempaka Putih', 'Tanjung Duren', 'Cicendo', 'Lowokwaru', 'Setiabudi', 'Banyumanik', 'Panakkukang', 'Ilir Timur', 'Sukarame'];
        $cities = ['Jakarta', 'Bandung', 'Surabaya', 'Semarang', 'Yogyakarta', 'Medan', 'Makassar', 'Palembang', 'Pekanbaru', 'Balikpapan'];

        $street = $streets[($index - 1) % count($streets)];
        $district = $districts[(int) floor(($index - 1) / 3) % count($districts)];
        $city = $cities[(int) floor(($index - 1) / 5) % count($cities)];
        $number = 10 + $index;

        return "Jl. {$street} No. {$number}, Kec. {$district}, {$city}";
    }

    private function resolveTargetTenant(): ?Tenant
    {
        $tenantId = trim((string) env('DUMMY_CUSTOMER_TENANT_ID', ''));
        if ($tenantId !== '') {
            return Tenant::query()->where('id', $tenantId)->first();
        }

        $namedTenant = Tenant::query()
            ->whereRaw('LOWER(name) = ?', ['indah laundry express'])
            ->latest('created_at')
            ->first();

        if ($namedTenant) {
            return $namedTenant;
        }

        return Tenant::query()->latest('created_at')->first();
    }
}
