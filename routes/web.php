<?php

use App\Http\Controllers\Web\AuthController as WebAuthController;
use App\Http\Controllers\Web\BillingController;
use App\Http\Controllers\Web\DashboardController;
use App\Http\Controllers\Web\ManagementController;
use App\Http\Controllers\Web\OrderBoardController;
use App\Http\Controllers\Web\SubscriptionController;
use App\Http\Controllers\Web\Platform\AuthController as PlatformAuthController;
use App\Http\Controllers\Web\Platform\SubscriptionController as PlatformSubscriptionController;
use App\Http\Controllers\Web\WaSettingsController;
use App\Models\Tenant;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    try {
        $tenant = Tenant::query()->orderBy('created_at')->first();
    } catch (\Throwable $e) {
        report($e);

        return view('welcome');
    }

    if ($tenant) {
        return redirect()->route('tenant.login', ['tenant' => $tenant->id]);
    }

    return view('welcome');
});

Route::get('/login', function () {
    try {
        $tenant = Tenant::query()->orderBy('created_at')->first();
    } catch (\Throwable $e) {
        report($e);

        abort(503, 'Database is not ready yet. Please try again in a moment.');
    }

    if (! $tenant) {
        abort(404, 'No tenant available.');
    }

    return redirect()->route('tenant.login', ['tenant' => $tenant->id]);
})->name('login');

Route::prefix('t/{tenant}')->group(function (): void {
    Route::middleware('guest')->group(function (): void {
        Route::get('/login', [WebAuthController::class, 'create'])->name('tenant.login');
        Route::post('/login', [WebAuthController::class, 'store'])->name('tenant.login.store');
    });

    Route::middleware(['auth', 'tenant.path'])->group(function (): void {
        Route::post('/logout', [WebAuthController::class, 'destroy'])->name('tenant.logout');

        Route::get('/dashboard', [DashboardController::class, 'index'])->name('tenant.dashboard');
        Route::get('/billing', [BillingController::class, 'index'])->name('tenant.billing.index');
        Route::get('/billing/export', [BillingController::class, 'export'])->name('tenant.billing.export');
        Route::post('/billing/collections/{order}', [BillingController::class, 'updateCollection'])->name('tenant.billing.collection.update');
        Route::get('/subscription', [SubscriptionController::class, 'index'])->name('tenant.subscription.index');
        Route::post('/subscription/change-request', [SubscriptionController::class, 'storeChangeRequest'])->name('tenant.subscription.change-request.store');
        Route::delete('/subscription/change-request/{changeRequestId}', [SubscriptionController::class, 'cancelChangeRequest'])->name('tenant.subscription.change-request.cancel');
        Route::post('/subscription/invoices/{invoiceId}/qris-intent', [SubscriptionController::class, 'createQrisIntent'])->name('tenant.subscription.invoices.qris-intent');
        Route::post('/subscription/invoices/{invoiceId}/proof', [SubscriptionController::class, 'uploadProof'])->name('tenant.subscription.invoices.proof.upload');
        Route::get('/orders', [OrderBoardController::class, 'index'])->name('tenant.orders.index');
        Route::get('/orders/export', [OrderBoardController::class, 'export'])->name('tenant.orders.export');
        Route::get('/orders/create', [OrderBoardController::class, 'create'])->name('tenant.orders.create');
        Route::post('/orders', [OrderBoardController::class, 'store'])->name('tenant.orders.store');
        Route::post('/orders/bulk-update', [OrderBoardController::class, 'bulkUpdate'])->name('tenant.orders.bulk-update');
        Route::post('/orders/{order}/payments', [OrderBoardController::class, 'addPayment'])->name('tenant.orders.payments.store');
        Route::post('/orders/{order}/status/laundry', [OrderBoardController::class, 'updateLaundryStatus'])->name('tenant.orders.status.laundry');
        Route::post('/orders/{order}/status/courier', [OrderBoardController::class, 'updateCourierStatus'])->name('tenant.orders.status.courier');
        Route::post('/orders/{order}/assign-courier', [OrderBoardController::class, 'assignCourier'])->name('tenant.orders.assign-courier');
        Route::get('/orders/{order}/receipt', [OrderBoardController::class, 'receipt'])->name('tenant.orders.receipt');
        Route::get('/orders/{order}', [OrderBoardController::class, 'show'])->name('tenant.orders.show');
        Route::get('/users', [ManagementController::class, 'users'])->name('tenant.users.index');
        Route::post('/users/invite', [ManagementController::class, 'storeUser'])->name('tenant.users.store');
        Route::post('/users/{managedUser}/assignment', [ManagementController::class, 'updateUserAssignment'])->name('tenant.users.assignment');
        Route::post('/users/{managedUser}/archive', [ManagementController::class, 'archiveUser'])->name('tenant.users.archive');
        Route::post('/users/{managedUser}/restore', [ManagementController::class, 'restoreUser'])->name('tenant.users.restore');
        Route::get('/customers', [ManagementController::class, 'customers'])->name('tenant.customers.index');
        Route::post('/customers/{customer}/archive', [ManagementController::class, 'archiveCustomer'])->name('tenant.customers.archive');
        Route::post('/customers/{customer}/restore', [ManagementController::class, 'restoreCustomer'])->name('tenant.customers.restore');
        Route::get('/services', [ManagementController::class, 'services'])->name('tenant.services.index');
        Route::post('/services/{service}/archive', [ManagementController::class, 'archiveService'])->name('tenant.services.archive');
        Route::post('/services/{service}/restore', [ManagementController::class, 'restoreService'])->name('tenant.services.restore');
        Route::get('/outlet-services', [ManagementController::class, 'outletServices'])->name('tenant.outlet-services.index');
        Route::post('/outlet-services/upsert', [ManagementController::class, 'upsertOutletService'])->name('tenant.outlet-services.upsert');
        Route::post('/outlet-services/{outletService}/update', [ManagementController::class, 'updateOutletService'])->name('tenant.outlet-services.update');
        Route::get('/outlets', [ManagementController::class, 'outlets'])->name('tenant.outlets.index');
        Route::post('/outlets/{outlet}/archive', [ManagementController::class, 'archiveOutlet'])->name('tenant.outlets.archive');
        Route::post('/outlets/{outlet}/restore', [ManagementController::class, 'restoreOutlet'])->name('tenant.outlets.restore');
        Route::get('/shipping-zones', [ManagementController::class, 'shippingZones'])->name('tenant.shipping-zones.index');
        Route::post('/shipping-zones', [ManagementController::class, 'storeShippingZone'])->name('tenant.shipping-zones.store');
        Route::post('/shipping-zones/{zone}/update', [ManagementController::class, 'updateShippingZone'])->name('tenant.shipping-zones.update');
        Route::post('/shipping-zones/{zone}/deactivate', [ManagementController::class, 'deactivateShippingZone'])->name('tenant.shipping-zones.deactivate');
        Route::post('/shipping-zones/{zone}/activate', [ManagementController::class, 'activateShippingZone'])->name('tenant.shipping-zones.activate');

        Route::get('/wa', [WaSettingsController::class, 'index'])->name('tenant.wa.index');
        Route::post('/wa/provider-config', [WaSettingsController::class, 'upsertProviderConfig'])->name('tenant.wa.provider-config');
    });
});

Route::prefix('platform')->group(function (): void {
    Route::middleware('guest')->group(function (): void {
        Route::get('/login', [PlatformAuthController::class, 'create'])->name('platform.login');
        Route::post('/login', [PlatformAuthController::class, 'store'])->name('platform.login.store');
    });

    Route::middleware(['auth', 'platform.web'])->group(function (): void {
        Route::post('/logout', [PlatformAuthController::class, 'destroy'])->name('platform.logout');

        Route::get('/subscriptions', [PlatformSubscriptionController::class, 'index'])->name('platform.subscriptions.index');
        Route::get('/subscriptions/tenants/{tenant}', [PlatformSubscriptionController::class, 'show'])->name('platform.subscriptions.show');
        Route::post('/subscriptions/invoices/{invoiceId}/verify', [PlatformSubscriptionController::class, 'verifyInvoice'])->name('platform.subscriptions.invoices.verify');
        Route::post('/subscriptions/tenants/{tenant}/suspend', [PlatformSubscriptionController::class, 'suspendTenant'])->name('platform.subscriptions.tenants.suspend');
        Route::post('/subscriptions/tenants/{tenant}/activate', [PlatformSubscriptionController::class, 'activateTenant'])->name('platform.subscriptions.tenants.activate');
    });
});
