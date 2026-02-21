<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'include_deleted' => ['nullable', 'boolean'],
        ]);

        $includeDeleted = (bool) ($validated['include_deleted'] ?? false);

        if ($includeDeleted) {
            $this->ensureRole($user, ['owner', 'admin']);
        }

        $query = Customer::query()
            ->where('tenant_id', $user->tenant_id)
            ->latest('updated_at');

        if ($includeDeleted) {
            $query->withTrashed();
        }

        if (! empty($validated['q'])) {
            $search = $validated['q'];
            $query->where(function ($q) use ($search): void {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('phone_normalized', 'like', "%{$search}%");
            });
        }

        $limit = (int) ($validated['limit'] ?? 30);

        return response()->json([
            'data' => $query->limit($limit)->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'phone' => ['required', 'string', 'max:30'],
            'notes' => ['nullable', 'string'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);

        if (! $phone) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Invalid phone number format.',
            ], 422);
        }

        $customer = Customer::withTrashed()->updateOrCreate(
            [
                'tenant_id' => $user->tenant_id,
                'phone_normalized' => $phone,
            ],
            [
                'name' => $validated['name'],
                'notes' => $validated['notes'] ?? null,
                'deleted_at' => null,
            ]
        );

        return response()->json([
            'data' => $customer,
        ], 201);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        if ($customer->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested customer.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string'],
        ]);

        if (array_key_exists('phone', $validated)) {
            $phone = $this->normalizePhone((string) $validated['phone']);

            if (! $phone) {
                return response()->json([
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => 'Invalid phone number format.',
                ], 422);
            }

            $exists = Customer::withTrashed()
                ->where('tenant_id', $user->tenant_id)
                ->where('phone_normalized', $phone)
                ->where('id', '!=', $customer->id)
                ->exists();

            if ($exists) {
                return response()->json([
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => 'Phone is already used by another customer.',
                ], 422);
            }

            $validated['phone_normalized'] = $phone;
            unset($validated['phone']);
        }

        $customer->fill($validated)->save();

        return response()->json([
            'data' => $customer->fresh(),
        ]);
    }

    public function destroy(Request $request, Customer $customer): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        if ($customer->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested customer.',
            ], 403);
        }

        $customer->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::CUSTOMER_ARCHIVED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'customer',
            entityId: $customer->id,
            metadata: [
                'customer_name' => $customer->name,
                'phone_normalized' => $customer->phone_normalized,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => $customer->id,
                'deleted_at' => $customer->deleted_at?->toIso8601String(),
            ],
        ]);
    }

    public function restore(Request $request, string $customerId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $customer = Customer::withTrashed()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $customerId)
            ->first();

        if (! $customer) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Customer not found in tenant scope.',
            ], 404);
        }

        if (! $customer->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Customer is already active.',
            ], 422);
        }

        $customer->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::CUSTOMER_RESTORED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'customer',
            entityId: $customer->id,
            metadata: [
                'customer_name' => $customer->name,
                'phone_normalized' => $customer->phone_normalized,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $customer->fresh(),
        ]);
    }

    private function normalizePhone(string $phone): ?string
    {
        $trimmed = trim($phone);
        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

        if ($digits === '') {
            return null;
        }

        if (str_starts_with($trimmed, '+')) {
            return $this->isValidInternationalPhone($digits) ? $digits : null;
        }

        if (str_starts_with($digits, '00')) {
            $international = substr($digits, 2);

            return $this->isValidInternationalPhone($international) ? $international : null;
        }

        if (str_starts_with($digits, '0')) {
            $digits = '62'.ltrim(substr($digits, 1), '0');
        } elseif (str_starts_with($digits, '8')) {
            $digits = '62'.$digits;
        }

        return $this->isValidInternationalPhone($digits) ? $digits : null;
    }

    private function isValidInternationalPhone(string $digits): bool
    {
        if (! preg_match('/^\d+$/', $digits)) {
            return false;
        }

        if (str_starts_with($digits, '0')) {
            return false;
        }

        $length = strlen($digits);

        return $length >= 8 && $length <= 16;
    }
}
