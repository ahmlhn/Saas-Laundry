<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\ServiceProcessTag;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceProcessTagController extends Controller
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
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
            'include_deleted' => ['nullable', 'boolean'],
        ]);

        $includeDeleted = (bool) ($validated['include_deleted'] ?? false);
        if ($includeDeleted) {
            $this->ensureRole($user, ['owner', 'admin']);
        }

        $query = ServiceProcessTag::query()
            ->where('tenant_id', $user->tenant_id)
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($includeDeleted) {
            $query->withTrashed();
        }

        $search = trim((string) ($validated['q'] ?? ''));
        if ($search !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        $limit = (int) ($validated['limit'] ?? 100);

        return response()->json([
            'data' => $query->limit($limit)->get()->map(fn (ServiceProcessTag $tag): array => $this->serializeTag($tag))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'color_hex' => ['nullable', 'string', 'regex:/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/'],
            'sort_order' => ['nullable', 'integer', 'min:-100000', 'max:100000'],
            'active' => ['nullable', 'boolean'],
        ]);

        $name = trim((string) $validated['name']);
        if ($name === '') {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nama tag proses wajib diisi.',
            ], 422);
        }

        $existing = ServiceProcessTag::withTrashed()
            ->where('tenant_id', $user->tenant_id)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->first();

        if ($existing && ! $existing->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nama tag proses sudah digunakan.',
            ], 422);
        }

        if ($existing && $existing->trashed()) {
            $existing->restore();
            $existing->fill([
                'color_hex' => $validated['color_hex'] ?? '#2A7CE2',
                'sort_order' => (int) ($validated['sort_order'] ?? 0),
                'active' => (bool) ($validated['active'] ?? true),
            ])->save();

            return response()->json([
                'data' => $this->serializeTag($existing->fresh()),
            ], 201);
        }

        $tag = ServiceProcessTag::query()->create([
            'tenant_id' => $user->tenant_id,
            'name' => $name,
            'color_hex' => $validated['color_hex'] ?? '#2A7CE2',
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'active' => (bool) ($validated['active'] ?? true),
        ]);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_PROCESS_TAG_CREATED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service_process_tag',
            entityId: (string) $tag->id,
            metadata: [
                'name' => $tag->name,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeTag($tag),
        ], 201);
    }

    public function update(Request $request, ServiceProcessTag $serviceProcessTag): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        if ($serviceProcessTag->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested process tag.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:100'],
            'color_hex' => ['nullable', 'string', 'regex:/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/'],
            'sort_order' => ['nullable', 'integer', 'min:-100000', 'max:100000'],
            'active' => ['nullable', 'boolean'],
        ]);

        if (array_key_exists('name', $validated)) {
            $nextName = trim((string) $validated['name']);
            if ($nextName === '') {
                return response()->json([
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => 'Nama tag proses wajib diisi.',
                ], 422);
            }

            $exists = ServiceProcessTag::withTrashed()
                ->where('tenant_id', $user->tenant_id)
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($nextName)])
                ->where('id', '!=', $serviceProcessTag->id)
                ->exists();

            if ($exists) {
                return response()->json([
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => 'Nama tag proses sudah digunakan.',
                ], 422);
            }

            $validated['name'] = $nextName;
        }

        $serviceProcessTag->fill($validated)->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_PROCESS_TAG_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service_process_tag',
            entityId: (string) $serviceProcessTag->id,
            metadata: [
                'name' => $serviceProcessTag->name,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeTag($serviceProcessTag->fresh()),
        ]);
    }

    public function destroy(Request $request, ServiceProcessTag $serviceProcessTag): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        if ($serviceProcessTag->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested process tag.',
            ], 403);
        }

        $serviceProcessTag->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_PROCESS_TAG_ARCHIVED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service_process_tag',
            entityId: (string) $serviceProcessTag->id,
            metadata: [
                'name' => $serviceProcessTag->name,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => (string) $serviceProcessTag->id,
                'deleted_at' => $serviceProcessTag->deleted_at?->toIso8601String(),
            ],
        ]);
    }

    private function serializeTag(ServiceProcessTag $tag): array
    {
        return [
            'id' => (string) $tag->id,
            'tenant_id' => (string) $tag->tenant_id,
            'name' => (string) $tag->name,
            'color_hex' => (string) $tag->color_hex,
            'sort_order' => (int) $tag->sort_order,
            'active' => (bool) $tag->active,
            'deleted_at' => $tag->deleted_at?->toIso8601String(),
        ];
    }
}
