<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\InvoiceRangeController;
use App\Http\Controllers\Api\OutletManagementController;
use App\Http\Controllers\Api\OutletContextController;
use App\Http\Controllers\Api\OutletServiceController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PrinterNoteController;
use App\Http\Controllers\Api\PromotionController;
use App\Http\Controllers\Api\ServiceCatalogController;
use App\Http\Controllers\Api\ServiceProcessTagController;
use App\Http\Controllers\Api\ShippingZoneController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\TenantManagementController;
use App\Http\Controllers\Api\UserManagementController;
use App\Http\Controllers\Api\WaController;
use Illuminate\Support\Facades\Route;

Route::get('/health', static fn () => response()->json([
    'ok' => true,
    'time' => now()->toIso8601String(),
]));

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:auth-register');
    Route::post('/google', [AuthController::class, 'google'])->middleware('throttle:auth-google');
    Route::post('/password/forgot', [AuthController::class, 'forgotPassword'])->middleware('throttle:auth-password-forgot');
    Route::post('/password/reset', [AuthController::class, 'resetPassword'])->middleware('throttle:auth-password-reset');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
});

Route::middleware(['auth:sanctum', 'outlet.access'])->group(function (): void {
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/outlets/allowed', [OutletContextController::class, 'allowed']);
    Route::get('/tenant-management', [TenantManagementController::class, 'show']);
    Route::patch('/tenant-management', [TenantManagementController::class, 'update']);

    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{order}', [OrderController::class, 'show']);
    Route::post('/orders/{order}/payments', [OrderController::class, 'addPayment']);
    Route::post('/orders/{order}/status/laundry', [OrderController::class, 'updateLaundryStatus']);
    Route::post('/orders/{order}/status/courier', [OrderController::class, 'updateCourierStatus']);
    Route::post('/orders/{order}/assign-courier', [OrderController::class, 'assignCourier']);
    Route::patch('/orders/{order}/schedule', [OrderController::class, 'updateSchedule']);

    Route::get('/customers', [CustomerController::class, 'index']);
    Route::post('/customers', [CustomerController::class, 'store']);
    Route::patch('/customers/{customer}', [CustomerController::class, 'update']);
    Route::delete('/customers/{customer}', [CustomerController::class, 'destroy']);
    Route::post('/customers/{customer}/restore', [CustomerController::class, 'restore']);

    Route::get('/services', [ServiceCatalogController::class, 'services']);
    Route::post('/services', [ServiceCatalogController::class, 'store']);
    Route::patch('/services/{service}', [ServiceCatalogController::class, 'update']);
    Route::delete('/services/{service}', [ServiceCatalogController::class, 'destroy']);
    Route::post('/services/{service}/restore', [ServiceCatalogController::class, 'restore']);

    Route::get('/service-process-tags', [ServiceProcessTagController::class, 'index']);
    Route::post('/service-process-tags', [ServiceProcessTagController::class, 'store']);
    Route::patch('/service-process-tags/{serviceProcessTag}', [ServiceProcessTagController::class, 'update']);
    Route::delete('/service-process-tags/{serviceProcessTag}', [ServiceProcessTagController::class, 'destroy']);

    Route::get('/promotions/sections', [PromotionController::class, 'sections']);
    Route::get('/promotions', [PromotionController::class, 'index']);
    Route::post('/promotions', [PromotionController::class, 'store']);
    Route::patch('/promotions/{promotion}', [PromotionController::class, 'update']);
    Route::delete('/promotions/{promotion}', [PromotionController::class, 'destroy']);

    Route::get('/outlets', [OutletManagementController::class, 'index']);
    Route::delete('/outlets/{outlet}', [OutletManagementController::class, 'destroy']);
    Route::post('/outlets/{outlet}/restore', [OutletManagementController::class, 'restore']);

    Route::get('/users', [UserManagementController::class, 'index']);
    Route::delete('/users/{user}', [UserManagementController::class, 'destroy']);
    Route::post('/users/{user}/restore', [UserManagementController::class, 'restore']);

    Route::get('/outlet-services', [OutletServiceController::class, 'index']);
    Route::patch('/outlet-services/{outletService}', [OutletServiceController::class, 'update']);

    Route::get('/shipping-zones', [ShippingZoneController::class, 'index']);
    Route::post('/shipping-zones', [ShippingZoneController::class, 'store']);
});

Route::middleware(['auth:sanctum'])->group(function (): void {
    Route::post('/sync/push', [SyncController::class, 'push'])->middleware('throttle:sync-push');
    Route::post('/sync/pull', [SyncController::class, 'pull']);
    Route::post('/invoices/range/claim', [InvoiceRangeController::class, 'claim']);

    Route::get('/wa/providers', [WaController::class, 'providers']);
    Route::post('/wa/provider-config', [WaController::class, 'upsertProviderConfig']);
    Route::get('/wa/templates', [WaController::class, 'templates']);
    Route::put('/wa/templates/{templateId}', [WaController::class, 'upsertTemplate']);
    Route::get('/wa/messages', [WaController::class, 'messages']);

    Route::get('/billing/quota', [BillingController::class, 'quota']);
    Route::get('/billing/entries', [BillingController::class, 'entries']);
    Route::post('/billing/entries', [BillingController::class, 'storeEntry']);
    Route::post('/printer-note/logo', [PrinterNoteController::class, 'uploadLogo']);
});
