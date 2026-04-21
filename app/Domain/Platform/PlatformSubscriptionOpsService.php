<?php

namespace App\Domain\Platform;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Models\SubscriptionInvoice;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class PlatformSubscriptionOpsService
{
    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function verifyInvoice(
        User $user,
        string $invoiceId,
        string $decision,
        ?string $note = null,
        ?Request $request = null,
    ): SubscriptionInvoice {
        $this->ensurePlatformUser($user);

        $invoice = SubscriptionInvoice::query()
            ->with(['proofs' => fn ($query) => $query->latest('created_at')])
            ->whereKey($invoiceId)
            ->first();

        if (! $invoice) {
            throw ValidationException::withMessages([
                'platform' => ['Invoice langganan tidak ditemukan.'],
            ]);
        }

        if (! in_array($decision, ['approve', 'reject'], true)) {
            throw ValidationException::withMessages([
                'decision' => ['Keputusan verifikasi tidak valid.'],
            ]);
        }

        if ($invoice->payment_method === 'bri_qris') {
            throw ValidationException::withMessages([
                'platform' => ['Invoice bri_qris diverifikasi otomatis oleh webhook gateway.'],
            ]);
        }

        $proof = $invoice->proofs->first();
        $reviewNote = trim((string) ($note ?? ''));

        if ($decision === 'approve') {
            $invoice->forceFill([
                'status' => 'paid',
                'paid_verified_at' => now(),
                'verified_by' => $user->id,
                'updated_by' => $user->id,
            ])->save();

            if ($proof) {
                $proof->forceFill([
                    'status' => 'approved',
                    'reviewed_by' => $user->id,
                    'reviewed_at' => now(),
                    'review_note' => $reviewNote !== '' ? $reviewNote : 'Approved by platform operator.',
                ])->save();
            }

            Tenant::query()->whereKey($invoice->tenant_id)->update([
                'subscription_state' => 'active',
                'write_access_mode' => 'full',
            ]);
        } else {
            $invoice->forceFill([
                'status' => 'rejected',
                'updated_by' => $user->id,
            ])->save();

            if ($proof) {
                $proof->forceFill([
                    'status' => 'rejected',
                    'reviewed_by' => $user->id,
                    'reviewed_at' => now(),
                    'review_note' => $reviewNote !== '' ? $reviewNote : 'Rejected by platform operator.',
                ])->save();
            }
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PLATFORM_SUBSCRIPTION_INVOICE_VERIFIED,
            actor: $user,
            tenantId: $invoice->tenant_id,
            entityType: 'subscription_invoice',
            entityId: $invoice->id,
            metadata: [
                'decision' => $decision,
                'status_after' => $invoice->status,
            ],
            channel: 'web',
            request: $request,
        );

        return $invoice->fresh() ?? $invoice;
    }

    public function suspendTenant(User $user, Tenant $tenant, ?Request $request = null): Tenant
    {
        $this->ensurePlatformOwner($user);

        $tenant->forceFill([
            'subscription_state' => 'suspended',
            'write_access_mode' => 'read_only',
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PLATFORM_TENANT_SUSPENDED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'tenant',
            entityId: $tenant->id,
            metadata: [
                'source' => 'platform_web',
            ],
            channel: 'web',
            request: $request,
        );

        return $tenant->fresh() ?? $tenant;
    }

    public function activateTenant(User $user, Tenant $tenant, ?Request $request = null): Tenant
    {
        $this->ensurePlatformOwner($user);

        $tenant->forceFill([
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PLATFORM_TENANT_ACTIVATED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'tenant',
            entityId: $tenant->id,
            metadata: [
                'source' => 'platform_web',
            ],
            channel: 'web',
            request: $request,
        );

        return $tenant->fresh() ?? $tenant;
    }

    private function ensurePlatformUser(User $user): void
    {
        if ($user->tenant_id !== null || ! $user->hasAnyRole(['platform_owner', 'platform_billing'])) {
            abort(403, 'Platform role is required.');
        }
    }

    private function ensurePlatformOwner(User $user): void
    {
        $this->ensurePlatformUser($user);

        if (! $user->hasRole('platform_owner')) {
            abort(403, 'Only platform_owner can perform this action.');
        }
    }
}
