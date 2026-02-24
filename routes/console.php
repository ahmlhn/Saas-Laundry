<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Maintenance schedule baseline for operations hardening.
Schedule::command('ops:wa:redrive-failed --limit=100')->everyTenMinutes();
Schedule::command('ops:wa:send-aging-reminders --limit=100')->dailyAt('09:00');
Schedule::command('ops:observe:health --lookback-minutes=15')->everyFifteenMinutes();
Schedule::command('ops:quota:reconcile')->dailyAt('00:10');
Schedule::command('ops:subscription:generate-renewal-invoices --days=7')->dailyAt('00:20');
Schedule::command('ops:subscription:rollover')->dailyAt('00:30');
Schedule::command('ops:subscription:enforce-status')->hourly();
Schedule::command('ops:subscription:reconcile-quota')->dailyAt('01:00');
Schedule::command('ops:audit:archive --days=90')->dailyAt('02:00');
