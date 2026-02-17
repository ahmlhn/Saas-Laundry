<?php

namespace App\Domain\Messaging;

use App\Models\WaTemplate;

class WaTemplateResolver
{
    /**
     * @return array<int, string>
     */
    public function templateIds(): array
    {
        return WaTemplateCatalog::templateIds();
    }

    /**
     * @return array{template_id: string, source: string, version: int, definition: array<string, mixed>}
     */
    public function resolveForTenant(string $tenantId, ?string $outletId, string $templateId): array
    {
        if ($outletId) {
            $outletTemplate = WaTemplate::query()
                ->where('tenant_id', $tenantId)
                ->where('outlet_id', $outletId)
                ->where('template_id', $templateId)
                ->orderByDesc('version')
                ->first();

            if ($outletTemplate) {
                return [
                    'template_id' => $templateId,
                    'source' => 'outlet',
                    'version' => (int) $outletTemplate->version,
                    'definition' => $outletTemplate->definition_json,
                ];
            }
        }

        $tenantTemplate = WaTemplate::query()
            ->where('tenant_id', $tenantId)
            ->whereNull('outlet_id')
            ->where('template_id', $templateId)
            ->orderByDesc('version')
            ->first();

        if ($tenantTemplate) {
            return [
                'template_id' => $templateId,
                'source' => 'tenant',
                'version' => (int) $tenantTemplate->version,
                'definition' => $tenantTemplate->definition_json,
            ];
        }

        $defaults = WaTemplateCatalog::defaults();

        if (! array_key_exists($templateId, $defaults)) {
            throw new \InvalidArgumentException("Template '{$templateId}' is not recognized.");
        }

        return [
            'template_id' => $templateId,
            'source' => 'default',
            'version' => 1,
            'definition' => $defaults[$templateId],
        ];
    }

    /**
     * @return array<int, array{template_id: string, source: string, version: int, definition: array<string, mixed>}>
     */
    public function listResolved(string $tenantId, ?string $outletId): array
    {
        $rows = [];

        foreach ($this->templateIds() as $templateId) {
            $rows[] = $this->resolveForTenant($tenantId, $outletId, $templateId);
        }

        return $rows;
    }

    public function upsertTemplate(string $tenantId, ?string $outletId, string $templateId, array $definition): WaTemplate
    {
        $nextVersion = (int) WaTemplate::query()
            ->where('tenant_id', $tenantId)
            ->where('template_id', $templateId)
            ->where('outlet_id', $outletId)
            ->max('version') + 1;

        return WaTemplate::query()->create([
            'tenant_id' => $tenantId,
            'outlet_id' => $outletId,
            'template_id' => $templateId,
            'version' => $nextVersion,
            'definition_json' => $definition,
        ]);
    }
}
