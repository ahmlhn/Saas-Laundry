<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('auth-login', function (Request $request): Limit {
            $login = trim((string) $request->input('login', (string) $request->input('email', 'unknown')));
            $identifier = strtolower($login !== '' ? $login : 'unknown');
            $ip = (string) $request->ip();

            return Limit::perMinute(10)
                ->by($identifier.'|'.$ip)
                ->response(function (): \Illuminate\Http\JsonResponse {
                    return response()->json([
                        'reason_code' => 'TOO_MANY_REQUESTS',
                        'message' => 'Too many login attempts. Please try again later.',
                    ], 429);
                });
        });

        RateLimiter::for('auth-register', function (Request $request): Limit {
            $email = strtolower(trim((string) $request->input('email', 'unknown')));
            $ip = (string) $request->ip();

            return Limit::perMinute(5)
                ->by($email.'|'.$ip)
                ->response(function (): \Illuminate\Http\JsonResponse {
                    return response()->json([
                        'reason_code' => 'TOO_MANY_REQUESTS',
                        'message' => 'Too many registration attempts. Please try again later.',
                    ], 429);
                });
        });

        RateLimiter::for('sync-push', function (Request $request): Limit {
            $userId = (string) ($request->user()?->id ?? 'guest');
            $deviceId = (string) $request->input('device_id', 'unknown');
            $ip = (string) $request->ip();

            return Limit::perMinute(180)
                ->by($userId.'|'.$deviceId.'|'.$ip)
                ->response(function (): \Illuminate\Http\JsonResponse {
                    return response()->json([
                        'reason_code' => 'TOO_MANY_REQUESTS',
                        'message' => 'Too many sync requests. Please retry shortly.',
                    ], 429);
                });
        });
    }
}
