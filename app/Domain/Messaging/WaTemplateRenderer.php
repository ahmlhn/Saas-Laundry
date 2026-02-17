<?php

namespace App\Domain\Messaging;

class WaTemplateRenderer
{
    /**
     * @param array<string, mixed> $definition
     */
    public function validateDefinition(array $definition): void
    {
        if (! isset($definition['body_lines']) || ! is_array($definition['body_lines']) || count($definition['body_lines']) === 0) {
            throw new \InvalidArgumentException('Template definition requires non-empty body_lines.');
        }
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $variables
     * @return array{body_text: string, variables: array<string, mixed>}
     */
    public function render(array $definition, array $variables): array
    {
        $this->validateDefinition($definition);

        $normalized = $this->normalizeVariables($variables);
        $normalized = $this->applyFallbacks($definition, $normalized);

        $this->assertRequiredVariables($definition, $normalized);

        $lines = $this->renderBodyLines($definition, $normalized);
        $maxLength = (int) ($definition['max_length'] ?? 1200);
        $bodyText = $this->enforceMaxLength($lines, $maxLength);

        return [
            'body_text' => $bodyText,
            'variables' => $normalized,
        ];
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $variables
     */
    private function assertRequiredVariables(array $definition, array $variables): void
    {
        $requiredAll = $definition['required_vars_all'] ?? [];

        if (is_array($requiredAll)) {
            foreach ($requiredAll as $key) {
                if (! is_string($key)) {
                    continue;
                }

                if (! $this->hasValue($variables[$key] ?? null)) {
                    throw new \InvalidArgumentException("Missing required variable: {$key}.");
                }
            }
        }

        $requiredAny = $definition['required_vars_any'] ?? [];

        if (! is_array($requiredAny) || count($requiredAny) === 0) {
            return;
        }

        $groups = $this->normalizeRequiredAnyGroups($requiredAny);

        foreach ($groups as $group) {
            $groupSatisfied = false;

            foreach ($group as $key) {
                if (! is_string($key)) {
                    continue;
                }

                if ($this->hasValue($variables[$key] ?? null)) {
                    $groupSatisfied = true;
                    break;
                }
            }

            if (! $groupSatisfied) {
                throw new \InvalidArgumentException('Missing one of required alternative variables.');
            }
        }
    }

    /**
     * @param array<int, mixed> $requiredAny
     * @return array<int, array<int, string>>
     */
    private function normalizeRequiredAnyGroups(array $requiredAny): array
    {
        $first = $requiredAny[0] ?? null;

        if (is_array($first)) {
            /** @var array<int, array<int, string>> $requiredAny */
            return $requiredAny;
        }

        /** @var array<int, string> $requiredAny */
        return [$requiredAny];
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $variables
     * @return array<int, array{text: string, optional: bool}>
     */
    private function renderBodyLines(array $definition, array $variables): array
    {
        $bodyLines = $definition['body_lines'] ?? [];
        $outputLines = [];

        if (! is_array($bodyLines)) {
            return [];
        }

        foreach ($bodyLines as $lineDefinition) {
            $line = $this->normalizeLineDefinition($lineDefinition);

            if (! $line) {
                continue;
            }

            if (! $this->evaluateCondition($line['condition'] ?? null, $variables)) {
                continue;
            }

            $text = trim($this->interpolate($line['text'], $variables));

            if ($text === '') {
                continue;
            }

            $outputLines[] = [
                'text' => $text,
                'optional' => (bool) ($line['optional'] ?? false),
            ];
        }

        if (count($outputLines) === 0) {
            throw new \InvalidArgumentException('Template rendering resulted in empty body.');
        }

        return $outputLines;
    }

    /**
     * @param mixed $lineDefinition
     * @return array{text: string, condition: mixed, optional: bool}|null
     */
    private function normalizeLineDefinition(mixed $lineDefinition): ?array
    {
        if (is_string($lineDefinition)) {
            return [
                'text' => $lineDefinition,
                'condition' => null,
                'optional' => false,
            ];
        }

        if (! is_array($lineDefinition) || ! isset($lineDefinition['text'])) {
            return null;
        }

        return [
            'text' => (string) $lineDefinition['text'],
            'condition' => $lineDefinition['condition'] ?? null,
            'optional' => (bool) ($lineDefinition['optional'] ?? false),
        ];
    }

    /**
     * @param array<int, array{text: string, optional: bool}> $lines
     */
    private function enforceMaxLength(array $lines, int $maxLength): string
    {
        $maxLength = max($maxLength, 1);
        $body = $this->joinLines($lines);

        if (strlen($body) <= $maxLength) {
            return $body;
        }

        for ($i = count($lines) - 1; $i >= 0; $i--) {
            if (strlen($body) <= $maxLength) {
                break;
            }

            if (! $lines[$i]['optional']) {
                continue;
            }

            unset($lines[$i]);
            $lines = array_values($lines);
            $body = $this->joinLines($lines);
        }

        if (strlen($body) <= $maxLength) {
            return $body;
        }

        return rtrim(substr($body, 0, $maxLength));
    }

    /**
     * @param array<int, array{text: string, optional: bool}> $lines
     */
    private function joinLines(array $lines): string
    {
        $texts = [];

        foreach ($lines as $line) {
            $text = trim((string) ($line['text'] ?? ''));

            if ($text !== '') {
                $texts[] = $text;
            }
        }

        return implode("\n", $texts);
    }

    /**
     * @param array<string, mixed> $variables
     */
    private function interpolate(string $text, array $variables): string
    {
        return (string) preg_replace_callback('/\{\{\s*([A-Za-z0-9_\.]+)\s*\}\}/', function (array $matches) use ($variables): string {
            $key = $matches[1] ?? '';
            $value = $variables[$key] ?? '';

            if (is_bool($value)) {
                return $value ? 'true' : 'false';
            }

            if (is_scalar($value)) {
                return trim((string) $value);
            }

            return '';
        }, $text);
    }

    /**
     * @param mixed $condition
     * @param array<string, mixed> $variables
     */
    private function evaluateCondition(mixed $condition, array $variables): bool
    {
        if (is_null($condition)) {
            return true;
        }

        if (is_bool($condition)) {
            return $condition;
        }

        if (! is_array($condition)) {
            return (bool) $condition;
        }

        if (array_is_list($condition)) {
            foreach ($condition as $node) {
                if (! $this->evaluateCondition($node, $variables)) {
                    return false;
                }
            }

            return true;
        }

        foreach ($condition as $operator => $operand) {
            if (! $this->evaluateOperator((string) $operator, $operand, $variables)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param mixed $operand
     * @param array<string, mixed> $variables
     */
    private function evaluateOperator(string $operator, mixed $operand, array $variables): bool
    {
        return match ($operator) {
            'exists' => is_string($operand)
                ? $this->hasValue($variables[$operand] ?? null)
                : $this->hasValue($this->resolveOperand($operand, $variables)),
            'notExists' => is_string($operand)
                ? ! $this->hasValue($variables[$operand] ?? null)
                : ! $this->hasValue($this->resolveOperand($operand, $variables)),
            'eq' => $this->comparePair($operand, $variables, '='),
            'ne' => $this->comparePair($operand, $variables, '!='),
            'gt' => $this->comparePair($operand, $variables, '>'),
            'gte' => $this->comparePair($operand, $variables, '>='),
            'lt' => $this->comparePair($operand, $variables, '<'),
            'lte' => $this->comparePair($operand, $variables, '<='),
            'and' => $this->evaluateLogicalAnd($operand, $variables),
            'or' => $this->evaluateLogicalOr($operand, $variables),
            'not' => ! $this->evaluateCondition($operand, $variables),
            'isValidUrl' => $this->isValidUrlOperand($operand, $variables),
            'isTrue' => $this->isTrueOperand($operand, $variables),
            default => false,
        };
    }

    /**
     * @param mixed $operand
     * @param array<string, mixed> $variables
     */
    private function evaluateLogicalAnd(mixed $operand, array $variables): bool
    {
        if (! is_array($operand)) {
            return false;
        }

        foreach ($operand as $condition) {
            if (! $this->evaluateCondition($condition, $variables)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param mixed $operand
     * @param array<string, mixed> $variables
     */
    private function evaluateLogicalOr(mixed $operand, array $variables): bool
    {
        if (! is_array($operand)) {
            return false;
        }

        foreach ($operand as $condition) {
            if ($this->evaluateCondition($condition, $variables)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param mixed $operand
     * @param array<string, mixed> $variables
     */
    private function comparePair(mixed $operand, array $variables, string $operator): bool
    {
        [$left, $right] = $this->extractPair($operand, $variables);

        return match ($operator) {
            '=' => $left == $right,
            '!=' => $left != $right,
            '>' => (float) $left > (float) $right,
            '>=' => (float) $left >= (float) $right,
            '<' => (float) $left < (float) $right,
            '<=' => (float) $left <= (float) $right,
            default => false,
        };
    }

    /**
     * @param mixed $operand
     * @param array<string, mixed> $variables
     * @return array{0: mixed, 1: mixed}
     */
    private function extractPair(mixed $operand, array $variables): array
    {
        if (is_array($operand) && array_key_exists('left', $operand) && array_key_exists('right', $operand)) {
            return [
                $this->resolveOperand($operand['left'], $variables),
                $this->resolveOperand($operand['right'], $variables),
            ];
        }

        if (is_array($operand) && array_is_list($operand) && count($operand) >= 2) {
            return [
                $this->resolveOperand($operand[0], $variables),
                $this->resolveOperand($operand[1], $variables),
            ];
        }

        return [null, null];
    }

    /**
     * @param mixed $operand
     * @param array<string, mixed> $variables
     */
    private function isValidUrlOperand(mixed $operand, array $variables): bool
    {
        $value = $this->resolveOperand($operand, $variables);

        if (! is_string($value) || trim($value) === '') {
            return false;
        }

        return filter_var($value, FILTER_VALIDATE_URL) !== false;
    }

    /**
     * @param mixed $operand
     * @param array<string, mixed> $variables
     */
    private function isTrueOperand(mixed $operand, array $variables): bool
    {
        $value = $this->resolveOperand($operand, $variables);

        if (is_bool($value)) {
            return $value;
        }

        if (is_numeric($value)) {
            return (float) $value > 0;
        }

        if (is_string($value)) {
            $normalized = strtolower(trim($value));

            return in_array($normalized, ['1', 'true', 'yes', 'on', 'y'], true);
        }

        return (bool) $value;
    }

    /**
     * @param mixed $operand
     * @param array<string, mixed> $variables
     */
    private function resolveOperand(mixed $operand, array $variables): mixed
    {
        if (is_array($operand) && isset($operand['var']) && is_string($operand['var'])) {
            return $variables[$operand['var']] ?? null;
        }

        if (is_string($operand) && array_key_exists($operand, $variables)) {
            return $variables[$operand];
        }

        return $operand;
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $variables
     * @return array<string, mixed>
     */
    private function applyFallbacks(array $definition, array $variables): array
    {
        $fallbacks = $definition['fallbacks'] ?? [];

        if (! is_array($fallbacks)) {
            return $variables;
        }

        foreach ($fallbacks as $target => $sources) {
            if (! is_string($target)) {
                continue;
            }

            if ($this->hasValue($variables[$target] ?? null)) {
                continue;
            }

            if (! is_array($sources)) {
                $sources = [$sources];
            }

            foreach ($sources as $sourceKey) {
                if (! is_string($sourceKey)) {
                    continue;
                }

                if ($this->hasValue($variables[$sourceKey] ?? null)) {
                    $variables[$target] = $variables[$sourceKey];
                    break;
                }
            }
        }

        return $variables;
    }

    /**
     * @param array<string, mixed> $variables
     * @return array<string, mixed>
     */
    private function normalizeVariables(array $variables): array
    {
        foreach ($variables as $key => $value) {
            if (is_string($value)) {
                $variables[$key] = trim($value);
            }
        }

        return $variables;
    }

    private function hasValue(mixed $value): bool
    {
        if (is_null($value)) {
            return false;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        return true;
    }
}
