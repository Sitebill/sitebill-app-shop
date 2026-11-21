<?php

namespace SitebillApps\Rumantic\Shop\Models;

use Sitebill\AppSdk\AppModel;

/** Категория товаров (в пределах сайта). */
class Category extends AppModel
{
    protected $table = 'app_rumantic_shop_categories';

    protected $fillable = ['title', 'sort'];

    protected $casts = ['sort' => 'integer'];
}
