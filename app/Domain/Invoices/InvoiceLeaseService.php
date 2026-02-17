<?php

namespace App\Domain\Invoices;

use App\Domain\Sync\SyncRejectException;
use App\Models\Device;
use App\Models\InvoiceLease;
use App\Models\Order;
use App\Models\Outlet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InvoiceLeaseService
{
    /**
     * @param array<int, array{date: string, count: int}> $days
     * @return array<int, InvoiceLease>
     */
    public function claimRanges(
        Device $device,
        Outlet $outlet,
        array $days,
    ): array {
        return DB::transaction(function () use ($device, $outlet, $days): array {
            $leases = [];

            foreach ($days as $day) {
                $date = Carbon::createFromFormat('Y-m-d', $day['date'])->toDateString();
                $count = max(1, (int) $day['count']);

                $maxCounter = (int) InvoiceLease::query()
                    ->where('tenant_id', $outlet->tenant_id)
                    ->where('outlet_id', $outlet->id)
                    ->whereDate('date', $date)
                    ->lockForUpdate()
                    ->max('to_counter');

                $from = $maxCounter + 1;

                if ($from > 9999) {
                    throw new SyncRejectException(
                        'INVOICE_COUNTER_OVERFLOW',
                        'Invoice counter exceeded 9999 for this outlet and date.',
                    );
                }

                $to = min($from + $count - 1, 9999);
                $prefix = $this->buildPrefix($outlet->code, Carbon::parse($date));
                $expiresAt = Carbon::parse($date, $outlet->timezone)->addDays(2)->endOfDay();

                $leases[] = InvoiceLease::query()->create([
                    'lease_id' => (string) Str::uuid(),
                    'tenant_id' => $outlet->tenant_id,
                    'outlet_id' => $outlet->id,
                    'device_id' => $device->id,
                    'date' => $date,
                    'prefix' => $prefix,
                    'from_counter' => $from,
                    'to_counter' => $to,
                    'next_counter' => $from,
                    'expires_at' => $expiresAt,
                ]);
            }

            return $leases;
        });
    }

    /**
     * @return array{invoice_no: ?string, invoice_no_assigned: ?string}
     */
    public function validateOrAssignInvoice(
        string $tenantId,
        Device $device,
        Outlet $outlet,
        Carbon $orderTime,
        ?string $clientInvoiceNo,
    ): array {
        if ($clientInvoiceNo) {
            $this->validateClientInvoiceNo(
                tenantId: $tenantId,
                deviceId: $device->id,
                outlet: $outlet,
                orderTime: $orderTime,
                invoiceNo: $clientInvoiceNo
            );

            return [
                'invoice_no' => $clientInvoiceNo,
                'invoice_no_assigned' => null,
            ];
        }

        $assigned = $this->assignInvoiceFromLease($tenantId, $device->id, $outlet, $orderTime);

        return [
            'invoice_no' => $assigned,
            'invoice_no_assigned' => $assigned,
        ];
    }

    private function validateClientInvoiceNo(
        string $tenantId,
        string $deviceId,
        Outlet $outlet,
        Carbon $orderTime,
        string $invoiceNo,
    ): void {
        $parsed = $this->parseInvoice($invoiceNo);

        if (! $parsed) {
            throw new SyncRejectException(
                'INVOICE_RANGE_INVALID',
                'Invalid invoice format.',
            );
        }

        if ($parsed['outlet_code'] !== strtoupper($outlet->code)) {
            throw new SyncRejectException(
                'INVOICE_RANGE_INVALID',
                'Invoice outlet code does not match outlet.',
            );
        }

        $expectedDate = $orderTime->clone()->timezone($outlet->timezone)->format('ymd');

        if ($parsed['date'] !== $expectedDate) {
            throw new SyncRejectException(
                'INVOICE_RANGE_INVALID',
                'Invoice date does not match order date.',
            );
        }

        $lease = InvoiceLease::query()
            ->where('tenant_id', $tenantId)
            ->where('outlet_id', $outlet->id)
            ->where('device_id', $deviceId)
            ->whereDate('date', $orderTime->clone()->timezone($outlet->timezone)->toDateString())
            ->where('from_counter', '<=', $parsed['counter'])
            ->where('to_counter', '>=', $parsed['counter'])
            ->exists();

        if (! $lease) {
            throw new SyncRejectException(
                'INVOICE_RANGE_INVALID',
                'Invoice number is outside the claimed lease range.',
            );
        }

        $used = Order::query()
            ->where('outlet_id', $outlet->id)
            ->where('invoice_no', $invoiceNo)
            ->exists();

        if ($used) {
            throw new SyncRejectException(
                'INVOICE_RANGE_INVALID',
                'Invoice number has been used.',
            );
        }
    }

    private function assignInvoiceFromLease(string $tenantId, string $deviceId, Outlet $outlet, Carbon $orderTime): ?string
    {
        return DB::transaction(function () use ($tenantId, $deviceId, $outlet, $orderTime): ?string {
            $date = $orderTime->clone()->timezone($outlet->timezone)->toDateString();

            /** @var InvoiceLease|null $lease */
            $lease = InvoiceLease::query()
                ->where('tenant_id', $tenantId)
                ->where('outlet_id', $outlet->id)
                ->where('device_id', $deviceId)
                ->whereDate('date', $date)
                ->whereColumn('next_counter', '<=', 'to_counter')
                ->orderBy('created_at')
                ->lockForUpdate()
                ->first();

            if (! $lease) {
                return null;
            }

            $counter = (int) ($lease->next_counter ?? $lease->from_counter);

            while ($counter <= $lease->to_counter) {
                $candidate = $lease->prefix.str_pad((string) $counter, 4, '0', STR_PAD_LEFT);

                $exists = Order::query()
                    ->where('outlet_id', $outlet->id)
                    ->where('invoice_no', $candidate)
                    ->exists();

                if (! $exists) {
                    $lease->forceFill([
                        'next_counter' => $counter + 1,
                    ])->save();

                    return $candidate;
                }

                $counter++;
            }

            $lease->forceFill([
                'next_counter' => $lease->to_counter + 1,
            ])->save();

            return null;
        });
    }

    /**
     * @return array{outlet_code: string, date: string, counter: int}|null
     */
    private function parseInvoice(string $invoiceNo): ?array
    {
        if (! preg_match('/^([A-Z0-9]{2,8})-(\d{6})-(\d{4})$/', strtoupper($invoiceNo), $matches)) {
            return null;
        }

        return [
            'outlet_code' => $matches[1],
            'date' => $matches[2],
            'counter' => (int) $matches[3],
        ];
    }

    private function buildPrefix(string $outletCode, Carbon $date): string
    {
        return strtoupper($outletCode).'-'.$date->format('ymd').'-';
    }
}
