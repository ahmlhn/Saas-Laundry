<?php

namespace App\Domain\Messaging;

class WaTemplateCatalog
{
    /**
     * @return array<string, array<string, mixed>>
     */
    public static function defaults(): array
    {
        return [
            'WA_PICKUP_CONFIRM' => [
                'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
                'required_vars_any' => [['invoice_no', 'order_code']],
                'fallbacks' => [
                    'customer_name' => ['customer_display_name'],
                ],
                'max_length' => 700,
                'body_lines' => [
                    [
                        'text' => 'Halo {{customer_name}}, pesanan Anda sudah kami terima di {{brand_name}}.',
                    ],
                    [
                        'text' => 'No invoice: {{invoice_no}}.',
                        'condition' => ['exists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Kode order: {{order_code}}.',
                        'condition' => ['notExists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Status awal: menunggu pickup kurir.',
                        'condition' => ['isTrue' => 'is_pickup_delivery'],
                        'optional' => true,
                    ],
                    [
                        'text' => 'Total saat ini: Rp{{total_amount}}.',
                        'condition' => ['exists' => 'total_amount'],
                        'optional' => true,
                    ],
                    [
                        'text' => 'Terima kasih.',
                    ],
                ],
            ],
            'WA_PICKUP_OTW' => [
                'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
                'required_vars_any' => [['invoice_no', 'order_code']],
                'max_length' => 700,
                'body_lines' => [
                    [
                        'text' => 'Halo {{customer_name}}, kurir {{courier_name}} sedang menuju lokasi pickup Anda.',
                    ],
                    [
                        'text' => 'No invoice: {{invoice_no}}.',
                        'condition' => ['exists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Kode order: {{order_code}}.',
                        'condition' => ['notExists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Kontak kurir: {{courier_phone}}.',
                        'condition' => ['exists' => 'courier_phone'],
                        'optional' => true,
                    ],
                    [
                        'text' => 'Terima kasih, {{brand_name}}.',
                    ],
                ],
            ],
            'WA_LAUNDRY_READY' => [
                'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
                'required_vars_any' => [['invoice_no', 'order_code']],
                'max_length' => 700,
                'body_lines' => [
                    [
                        'text' => 'Halo {{customer_name}}, laundry Anda sudah siap di {{brand_name}}.',
                    ],
                    [
                        'text' => 'No invoice: {{invoice_no}}.',
                        'condition' => ['exists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Kode order: {{order_code}}.',
                        'condition' => ['notExists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Sisa tagihan: Rp{{due_amount}}.',
                        'condition' => ['gt' => ['due_amount_numeric', 0]],
                        'optional' => true,
                    ],
                    [
                        'text' => 'Silakan ambil atau tunggu jadwal antar.',
                    ],
                ],
            ],
            'WA_DELIVERY_OTW' => [
                'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
                'required_vars_any' => [['invoice_no', 'order_code']],
                'max_length' => 700,
                'body_lines' => [
                    [
                        'text' => 'Halo {{customer_name}}, pesanan Anda sedang diantar kurir {{courier_name}}.',
                    ],
                    [
                        'text' => 'No invoice: {{invoice_no}}.',
                        'condition' => ['exists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Kode order: {{order_code}}.',
                        'condition' => ['notExists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Kontak kurir: {{courier_phone}}.',
                        'condition' => ['exists' => 'courier_phone'],
                        'optional' => true,
                    ],
                    [
                        'text' => 'Mohon siapkan penerimaan.',
                    ],
                ],
            ],
            'WA_ORDER_DONE' => [
                'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
                'required_vars_any' => [['invoice_no', 'order_code']],
                'max_length' => 700,
                'body_lines' => [
                    [
                        'text' => 'Halo {{customer_name}}, pesanan laundry Anda sudah selesai.',
                    ],
                    [
                        'text' => 'No invoice: {{invoice_no}}.',
                        'condition' => ['exists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Kode order: {{order_code}}.',
                        'condition' => ['notExists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Terima kasih telah menggunakan {{brand_name}}.',
                    ],
                ],
            ],
            'WA_BILLING_REMINDER' => [
                'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
                'required_vars_any' => [['invoice_no', 'order_code']],
                'max_length' => 700,
                'body_lines' => [
                    [
                        'text' => 'Halo {{customer_name}}, kami mengingatkan sisa tagihan laundry Anda.',
                    ],
                    [
                        'text' => 'No invoice: {{invoice_no}}.',
                        'condition' => ['exists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Kode order: {{order_code}}.',
                        'condition' => ['notExists' => 'invoice_no'],
                    ],
                    [
                        'text' => 'Sisa tagihan: Rp{{due_amount}}.',
                    ],
                    [
                        'text' => 'Umur tagihan: {{aging_days}} hari ({{aging_bucket_label}}).',
                        'condition' => ['exists' => 'aging_days'],
                    ],
                    [
                        'text' => 'Mohon konfirmasi jadwal pembayaran. Terima kasih, {{brand_name}}.',
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function templateIds(): array
    {
        return array_keys(self::defaults());
    }
}
