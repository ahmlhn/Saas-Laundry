<?php

return [
    'billing_gateway_provider' => env('BILLING_GATEWAY_PROVIDER', 'bri_qris'),
    'suspend_policy' => env('SUBSCRIPTION_SUSPEND_POLICY', 'H_PLUS_1'),
    'renewal_invoice_days' => (int) env('SUBSCRIPTION_RENEWAL_INVOICE_DAYS', 7),
    'gateway_intent_ttl_minutes' => (int) env('SUBSCRIPTION_QRIS_INTENT_TTL_MINUTES', 1440),
    'bri' => [
        'api_base_url' => env('BRI_API_BASE_URL'),
        'client_id' => env('BRI_CLIENT_ID'),
        'client_secret' => env('BRI_CLIENT_SECRET'),
        'merchant_id' => env('BRI_MERCHANT_ID'),
        'webhook_secret' => env('BRI_WEBHOOK_SECRET'),
    ],
];
