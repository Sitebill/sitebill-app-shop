<?php

namespace SitebillApps\Rumantic\Shop;

use Sitebill\AppSdk\AppServiceProvider;
use SitebillApps\Rumantic\Shop\Console\SeedDemoCommand;

/**
 * Приложение «Интернет-магазин». Миграции, GraphQL, REST и переводы платформа подключает по соглашению;
 * здесь — только консольная команда демо-данных (её зовёт установщик с --demo).
 */
final class ShopServiceProvider extends AppServiceProvider
{
    protected function bootApp(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([SeedDemoCommand::class]);
        }
    }
}
