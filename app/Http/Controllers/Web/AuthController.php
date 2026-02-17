<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Controller;
use App\Models\Tenant;
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

    public function create(Request $request, Tenant $tenant): View|RedirectResponse
    {
        /** @var User|null $user */
        $user = $request->user();

        if ($user && $user->tenant_id === $tenant->id && $user->hasAnyRole(['owner', 'admin'])) {
            return redirect()->route('tenant.dashboard', ['tenant' => $tenant->id]);
        }

        return view('web.auth.login', [
            'tenant' => $tenant,
        ]);
    }

    public function store(Request $request, Tenant $tenant): RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $user = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('email', $validated['email'])
            ->where('status', 'active')
            ->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGIN_FAILED,
                actor: $user,
                tenantId: $tenant->id,
                metadata: [
                    'email' => strtolower($validated['email']),
                    'reason' => 'invalid_credentials',
                ],
                channel: 'web',
                request: $request,
            );

            return back()->withErrors([
                'email' => 'Email or password is invalid.',
            ])->withInput($request->except('password'));
        }

        if (! $user->hasAnyRole(['owner', 'admin'])) {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGIN_FAILED,
                actor: $user,
                tenantId: $tenant->id,
                metadata: [
                    'email' => strtolower($validated['email']),
                    'reason' => 'unauthorized_role',
                ],
                channel: 'web',
                request: $request,
            );

            abort(403, 'Only owner/admin can login to web panel.');
        }

        Auth::login($user, (bool) ($validated['remember'] ?? false));

        $request->session()->regenerate();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::AUTH_LOGIN_SUCCESS,
            actor: $user,
            tenantId: $tenant->id,
            metadata: [
                'email' => strtolower($validated['email']),
                'remember' => (bool) ($validated['remember'] ?? false),
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.dashboard', ['tenant' => $tenant->id])
            ->with('status', 'Login success.');
    }

    public function destroy(Request $request, Tenant $tenant): RedirectResponse
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
                tenantId: $tenant->id,
                metadata: [
                    'email' => strtolower((string) $user->email),
                ],
                channel: 'web',
                request: $request,
            );
        }

        return redirect()->route('tenant.login', ['tenant' => $tenant->id]);
    }
}
