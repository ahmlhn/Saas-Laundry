<?php

namespace App\Domain\Orders;

class OrderStatusTransitionValidator
{
    /**
     * @var array<string, string[]>
     */
    private const LAUNDRY_TRANSITIONS = [
        'received' => ['washing'],
        'washing' => ['drying'],
        'drying' => ['ironing'],
        'ironing' => ['ready'],
        'ready' => ['completed'],
        'completed' => [],
    ];

    /**
     * @var array<string, string[]>
     */
    private const COURIER_TRANSITIONS = [
        'pickup_pending' => ['pickup_on_the_way'],
        'pickup_on_the_way' => ['picked_up'],
        'picked_up' => ['at_outlet'],
        'at_outlet' => ['delivery_pending'],
        'delivery_pending' => ['delivery_on_the_way'],
        'delivery_on_the_way' => ['delivered'],
        'delivered' => [],
    ];

    /**
     * @return array{ok: bool, reason_code?: string, message?: string}
     */
    public function validateLaundry(string $current, string $next): array
    {
        return $this->validate(self::LAUNDRY_TRANSITIONS, $current, $next, 'laundry_status');
    }

    /**
     * @return array{ok: bool, reason_code?: string, message?: string}
     */
    public function validateCourier(string $current, string $next): array
    {
        return $this->validate(self::COURIER_TRANSITIONS, $current, $next, 'courier_status');
    }

    /**
     * @param array<string, string[]> $map
     *
     * @return array{ok: bool, reason_code?: string, message?: string}
     */
    private function validate(array $map, string $current, string $next, string $field): array
    {
        if (! array_key_exists($current, $map) || ! array_key_exists($next, $map)) {
            return [
                'ok' => false,
                'reason_code' => 'INVALID_TRANSITION',
                'message' => "Unknown {$field} transition.",
            ];
        }

        if ($current === $next) {
            return ['ok' => true];
        }

        if (in_array($next, $map[$current], true)) {
            return ['ok' => true];
        }

        $order = array_keys($map);
        $currentIndex = array_search($current, $order, true);
        $nextIndex = array_search($next, $order, true);

        if ($currentIndex !== false && $nextIndex !== false && $nextIndex <= $currentIndex) {
            return [
                'ok' => false,
                'reason_code' => 'STATUS_NOT_FORWARD',
                'message' => "Cannot move {$field} backward from {$current} to {$next}.",
            ];
        }

        return [
            'ok' => false,
            'reason_code' => 'INVALID_TRANSITION',
            'message' => "Cannot move {$field} from {$current} to {$next}.",
        ];
    }
}
