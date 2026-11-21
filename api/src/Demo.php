<?php

namespace SitebillApps\Rumantic\Shop;

use SitebillApps\Rumantic\Shop\Models\Category;
use SitebillApps\Rumantic\Shop\Models\Product;

/** Демо-каталог текущего сайта. Идемпотентен: если в магазине уже есть товары — ничего не делает. */
final class Demo
{
    /** @return int сколько товаров создано */
    public static function seed(): int
    {
        if (Product::query()->exists()) {
            return 0;
        }

        $img = fn (string $seed) => "https://picsum.photos/seed/{$seed}/600/600";
        $catalog = [
            'Одежда' => [
                ['Худи оверсайз', 3990, 4990, 25, 'Мягкий футер с начёсом, свободный крой.'],
                ['Футболка базовая', 1290, null, 80, 'Плотный хлопок 100%, не садится после стирки.'],
                ['Джинсы прямые', 4590, 5990, 12, 'Классическая посадка, плотный деним.'],
            ],
            'Аксессуары' => [
                ['Рюкзак городской', 5200, null, 9, 'Отделение для ноутбука 15", водоотталкивающая ткань.'],
                ['Кепка с вышивкой', 990, null, null, 'Регулируемый ремешок сзади.'],
                ['Кошелёк кожаный', 2490, 2990, 0, 'Натуральная кожа, шесть отделений для карт.'],
            ],
            'Дом' => [
                ['Кружка керамическая', 590, null, 60, 'Объём 350 мл, подходит для посудомойки.'],
                ['Плед флисовый', 1890, null, 30, 'Размер 150×200 см.'],
                ['Свеча ароматическая', 790, 990, 40, 'Соевый воск, время горения около 40 часов.'],
            ],
        ];

        $created = 0;
        $sort = 0;
        foreach ($catalog as $title => $products) {
            $category = Category::create(['title' => $title, 'sort' => $sort += 10]);
            foreach ($products as [$name, $price, $old, $stock, $description]) {
                Product::create([
                    'category_id' => $category->id,
                    'title' => $name,
                    'description' => $description,
                    'price' => $price,
                    'old_price' => $old,
                    'sku' => 'DEMO-'.str_pad((string) (++$created), 3, '0', STR_PAD_LEFT),
                    'stock' => $stock,
                    'images' => [$img('shop'.$created)],
                    'is_active' => true,
                    'sort' => $created,
                ]);
            }
        }

        return $created;
    }
}
