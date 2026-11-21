<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_rumantic_shop_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->string('title', 150);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('app_rumantic_shop_products', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('category_id')->nullable();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->decimal('price', 12, 2)->default(0);
            $table->decimal('old_price', 12, 2)->nullable();
            $table->string('sku', 60)->nullable();
            // null = остатки не учитываются (всегда в наличии)
            $table->integer('stock')->nullable();
            // список https-адресов картинок, первая — главная
            $table->json('images')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->index(['tenant_id', 'is_active', 'category_id'], 'app_rumantic_shop_products_list');
        });

        Schema::create('app_rumantic_shop_orders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            // публичный номер заказа, уникален в пределах сайта
            $table->unsignedInteger('number');
            $table->string('customer_name', 100);
            $table->string('phone', 30);
            $table->string('email', 150)->nullable();
            // pickup | courier
            $table->string('delivery', 10)->default('pickup');
            $table->string('address', 300)->nullable();
            $table->string('comment', 500)->nullable();
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('delivery_price', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            // new | paid | shipped | done | cancelled
            $table->string('status', 12)->default('new');
            $table->unsignedBigInteger('lead_id')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'number'], 'app_rumantic_shop_orders_num');
            $table->index(['tenant_id', 'status', 'created_at'], 'app_rumantic_shop_orders_st');
        });

        Schema::create('app_rumantic_shop_order_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('order_id')->index();
            $table->unsignedBigInteger('product_id')->nullable();
            // название и цена фиксируются на момент заказа
            $table->string('title', 200);
            $table->decimal('price', 12, 2);
            $table->unsignedInteger('qty');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_rumantic_shop_order_items');
        Schema::dropIfExists('app_rumantic_shop_orders');
        Schema::dropIfExists('app_rumantic_shop_products');
        Schema::dropIfExists('app_rumantic_shop_categories');
    }
};
