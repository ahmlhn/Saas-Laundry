<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PrinterNoteController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'logo' => ['required', 'file', 'image', 'max:2048', 'mimes:jpg,jpeg,png,webp'],
        ]);

        $this->ensureOutletAccess($user, $validated['outlet_id']);
        $sourceChannel = $this->resolveSourceChannel($request, 'mobile');

        $logo = $validated['logo'];
        $extension = $logo->getClientOriginalExtension() ?: 'jpg';
        $directory = sprintf('printer-logos/%s/%s', $user->tenant_id, $validated['outlet_id']);
        $filename = (string) Str::uuid().'.'.strtolower($extension);
        $path = $logo->storeAs($directory, $filename, 'public');

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PRINTER_NOTE_LOGO_UPLOADED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $validated['outlet_id'],
            entityType: 'printer_logo',
            entityId: $filename,
            metadata: [
                'path' => $path,
                'source_channel' => $sourceChannel,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'path' => $path,
                'filename' => $filename,
                'url' => Storage::disk('public')->url($path),
            ],
        ], 201);
    }

    private function resolveSourceChannel(Request $request, string $fallback = 'web'): string
    {
        $raw = strtolower((string) $request->header('X-Source-Channel', $fallback));

        return in_array($raw, ['mobile', 'web', 'system'], true) ? $raw : $fallback;
    }
}
