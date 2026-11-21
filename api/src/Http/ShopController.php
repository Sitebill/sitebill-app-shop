<?php

namespace SitebillApps\Rumantic\Shop\Http;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use RuntimeException;
use Sitebill\AppSdk\Host;
use SitebillApps\Rumantic\Shop\Models\Category;
use SitebillApps\Rumantic\Shop\Models\Product;
use SitebillApps\Rumantic\Shop\OrderService;
use SitebillApps\Rumantic\Shop\ShopSettings;

/** Публичные (анонимные) эндпоинты витрины: каталог, товар, оформление заказа. */
final class ShopController
{
    private const ORDERS_PER_HOUR = 10;

    private const PER_PAGE = 24;

    /** GET settings — что нужно витрине. */
    public function settings(): JsonResponse
    {
        $s = ShopSettings::all();
        $site = Host::site()->current();

        return response()->json([
            'shop_name' => $s['shop_name'] !== '' ? $s['shop_name'] : ($site?->name ?? ''),
            'currency' => $s['currency'],
            'delivery_price' => $s['delivery_price'],
            'free_delivery_from' => $s['free_delivery_from'],
            'pickup_address' => $s['pickup_address'],
        ]);
    }

    /** GET catalog?category=&q=&page= */
    public function catalog(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category' => ['nullable', 'integer'],
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1', 'max:1000'],
        ]);

        $query = Product::query()->where('is_active', true);
        if (! empty($data['category'])) {
            $query->where('category_id', (int) $data['category']);
        }
        if (! empty($data['q'])) {
            // Спецсимволы LIKE экранируем: поиск по подстроке, а не по шаблону.
            $like = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where(fn ($q) => $q->where('title', 'like', $like)->orWhere('sku', 'like', $like));
        }

        $page = (int) ($data['page'] ?? 1);
        $total = (clone $query)->count();
        $products = $query->orderBy('sort')->orderByDesc('id')->forPage($page, self::PER_PAGE)->get();

        return response()->json([
            'products' => $products->map(fn (Product $p) => $this->card($p))->all(),
            'categories' => Category::query()->orderBy('sort')->orderBy('title')->get()
                ->map(fn (Category $c) => ['id' => $c->id, 'title' => $c->title])->all(),
            'total' => $total,
            'per_page' => self::PER_PAGE,
            'page' => $page,
        ]);
    }

    /** GET product/{id} */
    public function product(int $id): JsonResponse
    {
        $product = Product::query()->where('is_active', true)->findOrFail($id);

        return response()->json($this->card($product, true));
    }

    /** POST cart — актуальные цены и остатки для корзины из localStorage (id => данные). */
    public function cart(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:'.OrderService::MAX_LINES],
            'ids.*' => ['integer'],
        ]);
        $products = Product::query()->where('is_active', true)->whereIn('id', $data['ids'])->get();

        return response()->json(['products' => $products->map(fn (Product $p) => $this->card($p))->all()]);
    }

    /** POST orders */
    public function order(Request $request, OrderService $service): JsonResponse
    {
        $site = Host::site()->current();
        abort_unless($site, 404);

        // Боты заполняют все поля; человек это поле не видит. Отвечаем «ок», чтобы бот ничего не понял.
        if (filled($request->input('website'))) {
            Log::notice('rumantic.shop: honeypot', ['tenant_id' => $site->tenantId, 'ip' => $request->ip()]);

            return response()->json(['ok' => true, 'number' => 0], 201);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'min:5', 'max:30', 'regex:/^[0-9+()\-\s]+$/'],
            'email' => ['nullable', 'email', 'max:150'],
            'delivery' => ['required', 'in:pickup,courier'],
            'address' => ['required_if:delivery,courier', 'nullable', 'string', 'max:300'],
            'comment' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1', 'max:'.OrderService::MAX_LINES],
            'items.*.id' => ['required', 'integer'],
            'items.*.qty' => ['required', 'integer', 'min:1', 'max:'.OrderService::MAX_QTY],
        ]);

        $key = 'rumantic-shop:'.$site->tenantId.':'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, self::ORDERS_PER_HOUR)) {
            return response()->json(['message' => __('Too many requests. Please try again later.')], 429);
        }
        RateLimiter::hit($key, 3600);

        try {
            $order = $service->place($data, $data['items']);
        } catch (RuntimeException $e) {
            // Не 500: корзина устарела (товар скрыт или раскуплен) — витрина перечитает её.
            return response()->json(['code' => $e->getMessage()], 409);
        }

        return response()->json([
            'ok' => true,
            'number' => $order->number,
            'total' => $order->total,
            'payment_note' => ShopSettings::all()['payment_note'],
        ], 201);
    }

    private function card(Product $p, bool $full = false): array
    {
        $images = array_values(array_filter((array) $p->images, fn ($u) => is_string($u) && preg_match('#^https?://#i', $u)));
        $card = [
            'id' => $p->id,
            'title' => $p->title,
            'price' => $p->price,
            'old_price' => $p->old_price,
            'image' => $images[0] ?? null,
            'in_stock' => $p->stock === null || $p->stock > 0,
            // Точный остаток покупателю не показываем — только предел для «+» в корзине.
            'max_qty' => $p->stock === null ? OrderService::MAX_QTY : max(0, min(OrderService::MAX_QTY, $p->stock)),
            'category_id' => $p->category_id,
        ];
        if ($full) {
            $card += ['description' => (string) $p->description, 'images' => $images, 'sku' => $p->sku];
        }

        return $card;
    }
}
