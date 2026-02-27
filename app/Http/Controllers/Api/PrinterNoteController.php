<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\PrinterNoteSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
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
            'logo' => ['required', 'file', 'max:4096', 'mimetypes:image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif'],
        ]);

        $this->ensureOutletAccess($user, $validated['outlet_id']);
        $sourceChannel = $this->resolveSourceChannel($request, 'mobile');

        $logo = $validated['logo'];
        $extension = $this->resolveLogoExtension($logo);
        $directory = sprintf('printer-logos/%s/%s', $user->tenant_id, $validated['outlet_id']);
        $filename = (string) Str::uuid().'.'.strtolower($extension);
        $path = $logo->storeAs($directory, $filename, 'public');
        $settings = PrinterNoteSetting::query()->firstOrNew([
            'tenant_id' => $user->tenant_id,
            'outlet_id' => $validated['outlet_id'],
        ]);
        $oldLogoPath = $settings->logo_path;
        $settings->logo_path = $path;
        $settings->save();

        if ($oldLogoPath && $oldLogoPath !== $path) {
            Storage::disk('public')->delete($oldLogoPath);
        }

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

    public function showSettings(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);
        $settings = PrinterNoteSetting::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('outlet_id', $outlet->id)
            ->first();

        return response()->json([
            'data' => $this->serializeSettings($settings),
        ]);
    }

    public function upsertSettings(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'profile_name' => ['required', 'string', 'max:32'],
            'description_line' => ['nullable', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:20', 'regex:/^\+?[0-9]{8,15}$/'],
            'numbering_mode' => ['required', 'string', 'in:default,custom'],
            'custom_prefix' => ['nullable', 'string', 'max:24', 'regex:/^[A-Za-z0-9\\/_\\.-]+$/'],
            'footer_note' => ['nullable', 'string', 'max:200'],
            'share_enota' => ['required', 'boolean'],
            'show_customer_receipt' => ['required', 'boolean'],
            'paper_width' => ['nullable', 'string', 'in:58mm,80mm'],
            'auto_cut' => ['nullable', 'boolean'],
            'auto_open_cash_drawer' => ['nullable', 'boolean'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);
        $sourceChannel = $this->resolveSourceChannel($request, 'mobile');

        if ($validated['numbering_mode'] === 'custom' && blank($validated['custom_prefix'] ?? null)) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Custom prefix is required when numbering mode is custom.',
                'errors' => [
                    'custom_prefix' => ['The custom prefix field is required when numbering mode is custom.'],
                ],
            ], 422);
        }

        $settings = PrinterNoteSetting::query()->firstOrNew([
            'tenant_id' => $user->tenant_id,
            'outlet_id' => $outlet->id,
        ]);

        $settings->fill([
            'profile_name' => trim((string) $validated['profile_name']),
            'description_line' => trim((string) ($validated['description_line'] ?? '')) ?: null,
            'phone' => trim((string) ($validated['phone'] ?? '')) ?: null,
            'numbering_mode' => $validated['numbering_mode'],
            'custom_prefix' => trim((string) ($validated['custom_prefix'] ?? '')) ?: null,
            'footer_note' => trim((string) ($validated['footer_note'] ?? '')) ?: null,
            'share_enota' => (bool) $validated['share_enota'],
            'show_customer_receipt' => (bool) $validated['show_customer_receipt'],
        ]);

        if (array_key_exists('paper_width', $validated)) {
            $settings->paper_width = $validated['paper_width'] ?: '58mm';
        } elseif (! $settings->exists || blank($settings->paper_width)) {
            $settings->paper_width = '58mm';
        }

        if (array_key_exists('auto_cut', $validated)) {
            $settings->auto_cut = (bool) $validated['auto_cut'];
        } elseif (! $settings->exists) {
            $settings->auto_cut = false;
        }

        if (array_key_exists('auto_open_cash_drawer', $validated)) {
            $settings->auto_open_cash_drawer = (bool) $validated['auto_open_cash_drawer'];
        } elseif (! $settings->exists) {
            $settings->auto_open_cash_drawer = false;
        }

        $settings->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PRINTER_NOTE_SETTINGS_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $outlet->id,
            entityType: 'printer_note_settings',
            entityId: $settings->id,
            metadata: [
                'source_channel' => $sourceChannel,
                'numbering_mode' => $settings->numbering_mode,
                'has_logo' => filled($settings->logo_path),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeSettings($settings),
        ]);
    }

    public function showPrinterSettings(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);
        $settings = PrinterNoteSetting::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('outlet_id', $outlet->id)
            ->first();

        return response()->json([
            'data' => $this->serializePrinterSettings($settings),
        ]);
    }

    public function upsertPrinterSettings(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'paper_width' => ['required', 'string', 'in:58mm,80mm'],
            'auto_cut' => ['required', 'boolean'],
            'auto_open_cash_drawer' => ['required', 'boolean'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);
        $sourceChannel = $this->resolveSourceChannel($request, 'mobile');

        $settings = PrinterNoteSetting::query()->firstOrNew([
            'tenant_id' => $user->tenant_id,
            'outlet_id' => $outlet->id,
        ]);

        $settings->paper_width = $validated['paper_width'];
        $settings->auto_cut = (bool) $validated['auto_cut'];
        $settings->auto_open_cash_drawer = (bool) $validated['auto_open_cash_drawer'];
        $settings->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PRINTER_NOTE_SETTINGS_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $outlet->id,
            entityType: 'printer_settings',
            entityId: $settings->id,
            metadata: [
                'source_channel' => $sourceChannel,
                'paper_width' => $settings->paper_width,
                'auto_cut' => (bool) $settings->auto_cut,
                'auto_open_cash_drawer' => (bool) $settings->auto_open_cash_drawer,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializePrinterSettings($settings),
        ]);
    }

    public function deleteLogo(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);
        $sourceChannel = $this->resolveSourceChannel($request, 'mobile');

        $settings = PrinterNoteSetting::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('outlet_id', $outlet->id)
            ->first();

        if (! $settings || ! $settings->logo_path) {
            return response()->json([
                'data' => [
                    'logo_url' => '',
                    'logo_path' => null,
                ],
            ]);
        }

        Storage::disk('public')->delete($settings->logo_path);
        $settings->logo_path = null;
        $settings->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PRINTER_NOTE_LOGO_REMOVED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $outlet->id,
            entityType: 'printer_logo',
            entityId: $settings->id,
            metadata: [
                'source_channel' => $sourceChannel,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'logo_url' => '',
                'logo_path' => null,
            ],
        ]);
    }

    private function resolveSourceChannel(Request $request, string $fallback = 'web'): string
    {
        $raw = strtolower((string) $request->header('X-Source-Channel', $fallback));

        return in_array($raw, ['mobile', 'web', 'system'], true) ? $raw : $fallback;
    }

    private function resolveLogoExtension(UploadedFile $file): string
    {
        $candidate = strtolower((string) $file->getClientOriginalExtension());
        if ($candidate !== '') {
            return $candidate === 'jpeg' ? 'jpg' : $candidate;
        }

        $mime = strtolower((string) $file->getClientMimeType());
        return match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/heif' => 'heif',
            'image/heic' => 'heic',
            default => 'jpg',
        };
    }

    /**
     * @return array{
     *     profile_name: string,
     *     description_line: string,
     *     phone: string,
     *     numbering_mode: string,
     *     custom_prefix: string,
     *     footer_note: string,
     *     share_enota: bool,
     *     show_customer_receipt: bool,
     *     paper_width: string,
     *     auto_cut: bool,
     *     auto_open_cash_drawer: bool,
     *     logo_url: string,
     *     logo_path: string|null
     * }
     */
    private function serializeSettings(?PrinterNoteSetting $settings): array
    {
        if (! $settings) {
            return [
                'profile_name' => '',
                'description_line' => '',
                'phone' => '',
                'numbering_mode' => 'default',
                'custom_prefix' => '',
                'footer_note' => '',
                'share_enota' => true,
                'show_customer_receipt' => true,
                'paper_width' => '58mm',
                'auto_cut' => false,
                'auto_open_cash_drawer' => false,
                'logo_url' => '',
                'logo_path' => null,
            ];
        }

        return [
            'profile_name' => (string) ($settings->profile_name ?? ''),
            'description_line' => (string) ($settings->description_line ?? ''),
            'phone' => (string) ($settings->phone ?? ''),
            'numbering_mode' => $settings->numbering_mode === 'custom' ? 'custom' : 'default',
            'custom_prefix' => (string) ($settings->custom_prefix ?? ''),
            'footer_note' => (string) ($settings->footer_note ?? ''),
            'share_enota' => (bool) $settings->share_enota,
            'show_customer_receipt' => (bool) $settings->show_customer_receipt,
            'paper_width' => $settings->paper_width === '80mm' ? '80mm' : '58mm',
            'auto_cut' => (bool) $settings->auto_cut,
            'auto_open_cash_drawer' => (bool) $settings->auto_open_cash_drawer,
            'logo_url' => $settings->logo_path ? Storage::disk('public')->url($settings->logo_path) : '',
            'logo_path' => $settings->logo_path,
        ];
    }

    /**
     * @return array{
     *     paper_width: string,
     *     auto_cut: bool,
     *     auto_open_cash_drawer: bool
     * }
     */
    private function serializePrinterSettings(?PrinterNoteSetting $settings): array
    {
        if (! $settings) {
            return [
                'paper_width' => '58mm',
                'auto_cut' => false,
                'auto_open_cash_drawer' => false,
            ];
        }

        return [
            'paper_width' => $settings->paper_width === '80mm' ? '80mm' : '58mm',
            'auto_cut' => (bool) $settings->auto_cut,
            'auto_open_cash_drawer' => (bool) $settings->auto_open_cash_drawer,
        ];
    }
}
