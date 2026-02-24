<?php

namespace App\Http\Controllers\Web\Platform;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;

class AuthController extends Controller
{
    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function create(Request $request): View|RedirectResponse
    {
        /** @var User|null $user */
        $user = $request->user();

        if ($user && $user->tenant_id === null && $user->hasAnyRole(['platform_owner', 'platform_billing'])) {
            return redirect()->route('platform.subscriptions.index');
        }

        return view('web.platform.auth.login');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $email = strtolower(trim((string) $validated['email']));

        $user = User::query()
            ->whereNull('tenant_id')
            ->where('email', $email)
            ->where('status', 'active')
            ->whereHas('roles', fn ($query) => $query->whereIn('key', ['platform_owner', 'platform_billing']))
            ->first();

        if (! $user || ! Hash::check((string) $validated['password'], $user->password)) {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGIN_FAILED,
                actor: $user,
                tenantId: null,
                metadata: [
                    'email' => $email,
                    'reason' => 'invalid_credentials',
                    'workspace' => 'platform',
                ],
                channel: 'web',
                request: $request,
            );

            return back()->withErrors([
                'email' => 'Email atau password tidak valid.',
            ])->withInput($request->except('password'));
        }

        Auth::login($user, (bool) ($validated['remember'] ?? false));
        $request->session()->regenerate();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::AUTH_LOGIN_SUCCESS,
            actor: $user,
            tenantId: null,
            metadata: [
                'email' => $email,
                'workspace' => 'platform',
                'remember' => (bool) ($validated['remember'] ?? false),
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('platform.subscriptions.index')
            ->with('status', 'Login platform berhasil.');
    }

    public function destroy(Request $request): RedirectResponse
    {
        /** @var User|null $user */
        $user = $request->user();

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if ($user) {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGOUT,
                actor: $user,
                tenantId: null,
                metadata: [
                    'email' => strtolower((string) $user->email),
                    'workspace' => 'platform',
                ],
                channel: 'web',
                request: $request,
            );
        }

        return redirect()->route('platform.login');
    }
}
