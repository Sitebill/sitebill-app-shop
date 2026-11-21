<?php

namespace SitebillApps\Rumantic\Shop\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Sitebill\AppSdk\AppModel;

/** Заказ покупателя. Строки хранят название и цену на момент заказа. */
class Order extends AppModel
{
    public const STATUSES = ['new', 'paid', 'shipped', 'done', 'cancelled'];

    protected $table = 'app_rumantic_shop_orders';

    protected $fillable = [
        'number', 'customer_name', 'phone', 'email', 'delivery', 'address', 'comment',
        'subtotal', 'delivery_price', 'total', 'status', 'lead_id',
    ];

    protected $casts = [
        'number' => 'integer',
        'subtotal' => 'float',
        'delivery_price' => 'float',
        'total' => 'float',
        'lead_id' => 'integer',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }
}
