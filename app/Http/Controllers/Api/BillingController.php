<?php

namespace App\Http\Controllers\Api;

use App\Domain\Billing\QuotaService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\TenantSubscription;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly QuotaService $quotaService,
    ) {
    }

    public function quota(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'period' => ['nullable', 'date_format:Y-m'],
        ]);

        $period = $validated['period'] ?? now()->format('Y-m');
        $quota = $this->quotaService->snapshot($user->tenant_id, $period);

        $subscription = TenantSubscription::query()
            ->with('plan:id,key,name,orders_limit')
            ->where('tenant_id', $user->tenant_id)
            ->where('period', $period)
            ->first();

        return response()->json([
            'data' => [
                'quota' => $quota,
                'subscription' => $subscription ? [
                    'id' => $subscription->id,
                    'period' => $subscription->period,
                    'status' => $subscription->status,
                    'starts_at' => $subscription->starts_at?->toIso8601String(),
                    'ends_at' => $subscription->ends_at?->toIso8601String(),
                    'plan' => $subscription->plan ? [
                        'key' => $subscription->plan->key,
                        'name' => $subscription->plan->name,
                        'orders_limit' => $subscription->plan->orders_limit,
                    ] : null,
                ] : null,
            ],
        ]);
    }
}
