<?php

namespace SitebillApps\Rumantic\Shop\Models;

use Sitebill\AppSdk\AppModel;

/** Строка заказа: название и цена зафиксированы на момент оформления. */
class OrderItem extends AppModel
{
    protected $table = 'app_rumantic_shop_order_items';

    protected $fillable = ['order_id', 'product_id', 'title', 'price', 'qty'];

    protected $casts = ['price' => 'float', 'qty' => 'integer', 'product_id' => 'integer'];
}
