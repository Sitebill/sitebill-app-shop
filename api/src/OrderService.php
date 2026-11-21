<?php

namespace SitebillApps\Rumantic\Shop;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Sitebill\AppSdk\Host;
use SitebillApps\Rumantic\Shop\Models\Order;
use SitebillApps\Rumantic\Shop\Models\OrderItem;
use SitebillApps\Rumantic\Shop\Models\Product;

/**
 * Оформление и смена статуса заказа. Цены берутся только из базы (клиенту не верим),
 * остатки списываются в той же транзакции, что и создание заказа.
 */
final class OrderService
{
    public const MAX_LINES = 50;

    public const MAX_QTY = 99;

    /**
     * @param  array<string, mixed>  $data  name, phone, email?, delivery, address?, comment?
     * @param  list<array{id: int, qty: int}>  $lines
     *
     * @throws RuntimeException код причины в getMessage(): empty | unavailable | stock
     */
    public function place(array $data, array $lines): Order
    {
        // Одинаковые товары в корзине сливаем, чтобы остаток проверялся по сумме.
        $qtyById = [];
        foreach ($lines as $line) {
            $id = (int) $line['id'];
            $qtyById[$id] = min(self::MAX_QTY, ($qtyById[$id] ?? 0) + max(1, (int) $line['qty']));
        }
        if ($qtyById === [] || count($qtyById) > self::MAX_LINES) {
            throw new RuntimeException('empty');
        }

        // Номер заказа — max+1 в пределах сайта; при гонке уникальный индекс заставит повторить.
        $attempts = 0;
        while (true) {
            try {
                $order = DB::transaction(fn () => $this->create($data, $qtyById));
                break;
            } catch (QueryException $e) {
                if (++$attempts >= 3 || ! str_contains($e->getMessage(), 'app_rumantic_shop_orders_num')) {
                    throw $e;
                }
            }
        }

        $this->notify($order);

        return $order;
    }

    /** @param array<int, int> $qtyById */
    private function create(array $data, array $qtyById): Order
    {
        $products = Product::query()->whereIn('id', array_keys($qtyById))->where('is_active', true)
            ->lockForUpdate()->get()->keyBy('id');

        $subtotal = 0.0;
        foreach ($qtyById as $id => $qty) {
            $product = $products->get($id);
            if (! $product) {
                throw new RuntimeException('unavailable');
            }
            if ($product->stock !== null && $product->stock < $qty) {
                throw new RuntimeException('stock');
            }
            $subtotal += $product->price * $qty;
        }

        $delivery = ($data['delivery'] ?? 'pickup') === 'courier' ? 'courier' : 'pickup';
        $deliveryPrice = ShopSettings::deliveryCost($subtotal, $delivery);

        $order = Order::create([
            'number' => ((int) Order::query()->max('number')) + 1,
            'customer_name' => $data['name'],
            'phone' => $data['phone'],
            'email' => $data['email'] ?? null,
            'delivery' => $delivery,
            'address' => $delivery === 'courier' ? ($data['address'] ?? null) : null,
            'comment' => $data['comment'] ?? null,
            'subtotal' => round($subtotal, 2),
            'delivery_price' => $deliveryPrice,
            'total' => round($subtotal + $deliveryPrice, 2),
            'status' => 'new',
        ]);

        foreach ($qtyById as $id => $qty) {
            $product = $products->get($id);
            OrderItem::create([
                'order_id' => $order->id,
                'product_id' => $product->id,
                'title' => $product->title,
                'price' => $product->price,
                'qty' => $qty,
            ]);
            if ($product->stock !== null) {
                $product->decrement('stock', $qty);
            }
        }

        return $order->load('items');
    }

    /** Заказ — лид в CRM: менеджер видит его в воронке и получает уведомление. */
    private function notify(Order $order): void
    {
        $currency = ShopSettings::all()['currency'];
        $lines = $order->items->map(fn (OrderItem $i) => "{$i->title} × {$i->qty} = ".$this->money($i->price * $i->qty, $currency));
        $message = implode("\n", array_filter([
            "Заказ №{$order->number}",
            ...$lines->all(),
            'Итого: '.$this->money($order->total, $currency),
            $order->delivery === 'courier' ? "Доставка: {$order->address}" : 'Самовывоз',
            $order->comment,
        ]));

        try {
            $lead = Host::crm()->createLead([
                'name' => $order->customer_name,
                'phone' => $order->phone,
                'email' => $order->email,
                'message' => $message,
                'source' => ShopSettings::APP_ID,
            ]);
            $order->forceFill(['lead_id' => $lead->id])->save();
        } catch (\Throwable $e) {
            // Заказ уже принят: сбой CRM не должен терять его и пугать покупателя.
            report($e);
        }
    }

    /**
     * Смена статуса. Отмена возвращает остатки; из «отменён» заказ не воскрешается
     * (товар мог быть продан другому — оформляется новый заказ).
     */
    public function setStatus(Order $order, string $status): Order
    {
        if (! in_array($status, Order::STATUSES, true)) {
            throw new RuntimeException('bad_status');
        }
        if ($order->status === $status) {
            return $order;
        }
        if ($order->status === 'cancelled') {
            throw new RuntimeException('cancelled_final');
        }

        DB::transaction(function () use ($order, $status) {
            if ($status === 'cancelled') {
                foreach ($order->items as $item) {
                    if ($item->product_id) {
                        Product::query()->where('id', $item->product_id)->whereNotNull('stock')->increment('stock', $item->qty);
                    }
                }
            }
            $order->update(['status' => $status]);
        });

        return $order->refresh();
    }

    private function money(float $value, string $currency): string
    {
        return rtrim(rtrim(number_format($value, 2, '.', ' '), '0'), '.').' '.$currency;
    }
}
