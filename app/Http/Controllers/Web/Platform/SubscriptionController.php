<?php

namespace App\Http\Controllers\Web\Platform;

use App\Domain\Platform\PlatformSubscriptionOpsService;
use App\Filament\Platform\Pages\PlatformTenantSubscription;
use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    public function __construct(
        private readonly PlatformSubscriptionOpsService $subscriptionOps,
    ) {
    }

    public function verifyInvoice(Request $request, string $invoiceId): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'decision' => ['required', 'string', 'in:approve,reject'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $invoice = $this->subscriptionOps->verifyInvoice(
            user: $user,
            invoiceId: $invoiceId,
            decision: (string) $validated['decision'],
            note: $validated['note'] ?? null,
            request: $request,
        );

        return redirect()
            ->to(PlatformTenantSubscription::getUrl(parameters: ['tenant' => $invoice->tenant_id], panel: 'platform'))
            ->with('status', 'Verifikasi invoice berhasil diproses.');
    }

    public function suspendTenant(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $this->subscriptionOps->suspendTenant($user, $tenant, $request);

        return redirect()
            ->to(PlatformTenantSubscription::getUrl(parameters: ['tenant' => $tenant], panel: 'platform'))
            ->with('status', 'Tenant berhasil disuspend (read-only).');
    }

    public function activateTenant(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $this->subscriptionOps->activateTenant($user, $tenant, $request);

        return redirect()
            ->to(PlatformTenantSubscription::getUrl(parameters: ['tenant' => $tenant], panel: 'platform'))
            ->with('status', 'Tenant berhasil diaktifkan kembali.');
    }
}
