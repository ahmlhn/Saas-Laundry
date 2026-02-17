<?php

namespace Tests\Unit;

use App\Domain\Messaging\WaTemplateRenderer;
use Tests\TestCase;

class WaTemplateRendererTest extends TestCase
{
    public function test_renderer_applies_condition_dsl_and_required_any_rule(): void
    {
        $renderer = new WaTemplateRenderer();

        $definition = [
            'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
            'required_vars_any' => [['invoice_no', 'order_code']],
            'body_lines' => [
                ['text' => 'Halo {{customer_name}} dari {{brand_name}}.'],
                ['text' => 'Invoice: {{invoice_no}}', 'condition' => ['exists' => 'invoice_no']],
                ['text' => 'Order: {{order_code}}', 'condition' => ['notExists' => 'invoice_no']],
                ['text' => 'Link: {{tracking_url}}', 'condition' => ['isValidUrl' => 'tracking_url']],
                [
                    'text' => 'Pembayaran COD: Rp{{due_amount_numeric}}',
                    'condition' => [
                        'and' => [
                            ['isTrue' => 'is_cod'],
                            ['gt' => ['due_amount_numeric', 0]],
                        ],
                    ],
                ],
            ],
            'max_length' => 500,
        ];

        $result = $renderer->render($definition, [
            'brand_name' => 'Laundry A',
            'customer_name' => 'Budi',
            'to_phone' => '6281234567890',
            'order_code' => 'ORD-0001',
            'tracking_url' => 'not-a-url',
            'is_cod' => true,
            'due_amount_numeric' => 12000,
        ]);

        $this->assertStringContainsString('Halo Budi dari Laundry A.', $result['body_text']);
        $this->assertStringContainsString('Order: ORD-0001', $result['body_text']);
        $this->assertStringContainsString('Pembayaran COD: Rp12000', $result['body_text']);
        $this->assertStringNotContainsString('Invoice:', $result['body_text']);
        $this->assertStringNotContainsString('Link:', $result['body_text']);
    }

    public function test_renderer_drops_optional_lines_when_body_exceeds_max_length(): void
    {
        $renderer = new WaTemplateRenderer();

        $definition = [
            'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
            'required_vars_any' => [['order_code']],
            'body_lines' => [
                ['text' => 'Halo {{customer_name}}, order {{order_code}} telah diproses.'],
                ['text' => 'Catatan opsional pertama yang cukup panjang.', 'optional' => true],
                ['text' => 'Catatan opsional kedua yang cukup panjang.', 'optional' => true],
            ],
            'max_length' => 80,
        ];

        $result = $renderer->render($definition, [
            'brand_name' => 'Laundry B',
            'customer_name' => 'Sinta',
            'to_phone' => '6281234567890',
            'order_code' => 'ORD-0002',
        ]);

        $this->assertLessThanOrEqual(80, strlen($result['body_text']));
        $this->assertStringContainsString('Halo Sinta, order ORD-0002 telah diproses.', $result['body_text']);
        $this->assertStringNotContainsString('Catatan opsional kedua', $result['body_text']);
    }
}
