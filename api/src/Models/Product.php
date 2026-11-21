<?php

namespace SitebillApps\Rumantic\Shop\Models;

use Sitebill\AppSdk\AppModel;

/** Товар. stock = null — остатки не учитываются. */
class Product extends AppModel
{
    protected $table = 'app_rumantic_shop_products';

    protected $fillable = ['category_id', 'title', 'description', 'price', 'old_price', 'sku', 'stock', 'images', 'is_active', 'sort'];

    protected $casts = [
        'category_id' => 'integer',
        'price' => 'float',
        'old_price' => 'float',
        'stock' => 'integer',
        'images' => 'array',
        'is_active' => 'boolean',
        'sort' => 'integer',
    ];
}
