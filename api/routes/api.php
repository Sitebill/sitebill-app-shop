<?php

use Illuminate\Support\Facades\Route;
use SitebillApps\Rumantic\Shop\Http\ShopController;

// Под /api/v1/apps/rumantic.shop/ с сессией и текущим сайтом (добавляет платформа). Всё анонимное: витрина.
Route::get('settings', [ShopController::class, 'settings'])->name('settings');
Route::get('catalog', [ShopController::class, 'catalog'])->name('catalog');
Route::get('product/{id}', [ShopController::class, 'product'])->whereNumber('id')->name('product');
Route::post('cart', [ShopController::class, 'cart'])->name('cart');
Route::post('orders', [ShopController::class, 'order'])->name('orders');
