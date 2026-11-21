<?php

namespace SitebillApps\Rumantic\Shop;

use Sitebill\AppSdk\Host;

/** Настройки магазина текущего сайта (Host::settings()). */
final class ShopSettings
{
    public const APP_ID = 'rumantic.shop';

    private const DEFAULTS = [
        'shop_name' => '',
        'currency' => '₽',
        'delivery_price' => 0.0,
        'free_delivery_from' => 0.0,
        'pickup_address' => '',
        'payment_note' => '',
    ];

    /** @return array{shop_name: string, currency: string, delivery_price: float, free_delivery_from: float, pickup_address: string, payment_note: string} */
    public static function all(): array
    {
        $s = Host::settings()->all(self::APP_ID);

        return [
            'shop_name' => (string) ($s['shop_name'] ?? self::DEFAULTS['shop_name']),
            'currency' => (string) ($s['currency'] ?? self::DEFAULTS['currency']),
            'delivery_price' => max(0.0, (float) ($s['delivery_price'] ?? self::DEFAULTS['delivery_price'])),
            'free_delivery_from' => max(0.0, (float) ($s['free_delivery_from'] ?? self::DEFAULTS['free_delivery_from'])),
            'pickup_address' => (string) ($s['pickup_address'] ?? self::DEFAULTS['pickup_address']),
            'payment_note' => (string) ($s['payment_note'] ?? self::DEFAULTS['payment_note']),
        ];
    }

    /** @param array<string, mixed> $input */
    public static function save(array $input): array
    {
        foreach (array_keys(self::DEFAULTS) as $key) {
            if (! array_key_exists($key, $input)) {
                continue;
            }
            $value = match ($key) {
                'shop_name' => mb_substr(trim((string) $input[$key]), 0, 80),
                'currency' => mb_substr(trim((string) $input[$key]), 0, 8),
                'delivery_price', 'free_delivery_from' => max(0.0, min(10000000.0, (float) $input[$key])),
                'pickup_address' => mb_substr(trim((string) $input[$key]), 0, 300),
                'payment_note' => mb_substr(trim((string) $input[$key]), 0, 1000),
            };
            Host::settings()->set(self::APP_ID, $key, $value);
        }

        return self::all();
    }

    /** Стоимость доставки для суммы товаров: самовывоз бесплатен, курьер — по тарифу с порогом бесплатной доставки. */
    public static function deliveryCost(float $subtotal, string $delivery): float
    {
        if ($delivery !== 'courier') {
            return 0.0;
        }
        $s = self::all();
        if ($s['free_delivery_from'] > 0 && $subtotal >= $s['free_delivery_from']) {
            return 0.0;
        }

        return $s['delivery_price'];
    }
}
