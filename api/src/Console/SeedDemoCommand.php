<?php

namespace SitebillApps\Rumantic\Shop\Console;

use Illuminate\Console\Command;
use Sitebill\AppSdk\Host;
use SitebillApps\Rumantic\Shop\Demo;

/** Наполняет магазин примером каталога. Вызывается кнопкой/установщиком (--demo); повторный запуск безопасен. */
final class SeedDemoCommand extends Command
{
    protected $signature = 'rumantic-shop:seed-demo';

    protected $description = 'Create a demo catalog (categories and products) if the shop is empty';

    public function handle(): int
    {
        // В консоли сайт не привязан: Community — один сайт, берём его.
        $site = Host::site()->current();
        $tenantId = $site?->tenantId ?? \Illuminate\Support\Facades\DB::table('tenants')->orderBy('id')->value('id');
        if (! $tenantId) {
            $this->error('No site found');

            return self::FAILURE;
        }

        $created = Host::site()->runAs((int) $tenantId, fn () => Demo::seed());
        $this->info("Demo products created: {$created}");

        return self::SUCCESS;
    }
}
