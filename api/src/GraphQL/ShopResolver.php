<?php

namespace SitebillApps\Rumantic\Shop\GraphQL;

use GraphQL\Error\Error;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use SitebillApps\Rumantic\Shop\Models\Category;
use SitebillApps\Rumantic\Shop\Models\Order;
use SitebillApps\Rumantic\Shop\Models\Product;
use SitebillApps\Rumantic\Shop\OrderService;
use SitebillApps\Rumantic\Shop\ShopSettings;

/** Админский GraphQL приложения. Права проверяются @guard + @can в схеме, не здесь. */
final class ShopResolver
{
    public function products(mixed $root, array $args): array
    {
        $query = Product::query()->orderBy('sort')->orderByDesc('id')->limit(max(1, min(500, (int) ($args['limit'] ?? 200))));
        if (! empty($args['q'])) {
            $like = '%'.addcslashes($args['q'], '%_\\').'%';
            $query->where(fn ($q) => $q->where('title', 'like', $like)->orWhere('sku', 'like', $like));
        }

        return $query->get()->map(fn (Product $p) => $this->product($p))->all();
    }

    public function categories(): array
    {
        $counts = Product::query()->select('category_id', DB::raw('count(*) as c'))->groupBy('category_id')->pluck('c', 'category_id');

        return Category::query()->orderBy('sort')->orderBy('title')->get()->map(fn (Category $c) => [
            'id' => (string) $c->id, 'title' => $c->title, 'sort' => $c->sort, 'products_count' => (int) ($counts[$c->id] ?? 0),
        ])->all();
    }

    public function orders(mixed $root, array $args): array
    {
        $query = Order::query()->with('items')->orderByDesc('id')->limit(max(1, min(500, (int) ($args['limit'] ?? 100))));
        if (! empty($args['status'])) {
            $query->where('status', $args['status']);
        }

        return $query->get()->map(fn (Order $o) => $this->order($o))->all();
    }

    public function stats(): array
    {
        $byStatus = Order::query()->select('status', DB::raw('count(*) as c'))->groupBy('status')->pluck('c', 'status');

        return [
            'new_orders' => (int) ($byStatus['new'] ?? 0),
            'total_orders' => (int) $byStatus->sum(),
            // Выручка — по неотменённым заказам.
            'revenue' => (float) Order::query()->where('status', '!=', 'cancelled')->sum('total'),
            'products' => Product::query()->count(),
            'out_of_stock' => Product::query()->whereNotNull('stock')->where('stock', '<=', 0)->count(),
        ];
    }

    public function settings(): array
    {
        return ShopSettings::all();
    }

    public function saveProduct(mixed $root, array $args): array
    {
        $in = $args['input'];
        $images = collect($in['images'] ?? [])->map(fn ($u) => trim((string) $u))->filter()->unique()->values();
        foreach ($images as $url) {
            // Адреса картинок попадают на публичный сайт: только http(s), без javascript: и data:.
            if (! preg_match('#^https?://[^\s"\'<>]+$#i', $url) || mb_strlen($url) > 500) {
                throw new Error('Invalid image URL: '.$url);
            }
        }
        $categoryId = ! empty($in['category_id']) ? (int) $in['category_id'] : null;
        if ($categoryId && ! Category::query()->whereKey($categoryId)->exists()) {
            throw new Error('Unknown category');
        }

        $values = [
            'category_id' => $categoryId,
            'title' => trim($in['title']),
            'description' => $in['description'] ?? null,
            'price' => $in['price'],
            'old_price' => ($in['old_price'] ?? 0) > 0 ? $in['old_price'] : null,
            'sku' => ($in['sku'] ?? '') !== '' ? $in['sku'] : null,
            'stock' => $in['stock'] ?? null,
            'images' => $images->take(8)->all(),
            'is_active' => (bool) ($in['is_active'] ?? true),
            'sort' => (int) ($in['sort'] ?? 0),
        ];

        $product = ! empty($args['id']) ? Product::query()->findOrFail($args['id']) : new Product;
        $product->fill($values)->save();

        return $this->product($product);
    }

    public function deleteProduct(mixed $root, array $args): bool
    {
        // Строки заказов хранят название и цену сами, история не ломается.
        return (bool) Product::query()->findOrFail($args['id'])->delete();
    }

    public function saveCategory(mixed $root, array $args): array
    {
        $category = ! empty($args['id']) ? Category::query()->findOrFail($args['id']) : new Category;
        $category->fill(['title' => trim($args['title']), 'sort' => (int) ($args['sort'] ?? 0)])->save();

        return ['id' => (string) $category->id, 'title' => $category->title, 'sort' => $category->sort, 'products_count' => Product::query()->where('category_id', $category->id)->count()];
    }

    public function deleteCategory(mixed $root, array $args): bool
    {
        $category = Category::query()->findOrFail($args['id']);
        DB::transaction(function () use ($category) {
            // Товары остаются, просто без категории.
            Product::query()->where('category_id', $category->id)->update(['category_id' => null]);
            $category->delete();
        });

        return true;
    }

    public function setOrderStatus(mixed $root, array $args): array
    {
        $order = Order::query()->with('items')->findOrFail($args['id']);
        try {
            $order = app(OrderService::class)->setStatus($order, $args['status']);
        } catch (RuntimeException $e) {
            throw new Error($e->getMessage());
        }

        return $this->order($order->load('items'));
    }

    public function saveSettings(mixed $root, array $args): array
    {
        return ShopSettings::save($args['input'] ?? []);
    }

    private function product(Product $p): array
    {
        return [
            'id' => (string) $p->id,
            'category_id' => $p->category_id,
            'title' => $p->title,
            'description' => $p->description,
            'price' => $p->price,
            'old_price' => $p->old_price,
            'sku' => $p->sku,
            'stock' => $p->stock,
            'images' => array_values((array) $p->images),
            'is_active' => $p->is_active,
            'sort' => $p->sort,
        ];
    }

    private function order(Order $o): array
    {
        return [
            'id' => (string) $o->id,
            'number' => $o->number,
            'customer_name' => $o->customer_name,
            'phone' => $o->phone,
            'email' => $o->email,
            'delivery' => $o->delivery,
            'address' => $o->address,
            'comment' => $o->comment,
            'subtotal' => $o->subtotal,
            'delivery_price' => $o->delivery_price,
            'total' => $o->total,
            'status' => $o->status,
            'lead_id' => $o->lead_id,
            'created_at' => $o->created_at?->toIso8601String() ?? '',
            'items' => $o->items->map(fn ($i) => ['title' => $i->title, 'price' => $i->price, 'qty' => $i->qty])->all(),
        ];
    }
}
