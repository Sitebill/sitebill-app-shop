# Интернет-магазин для Sitebill (`rumantic.shop`)

Классический интернет-магазин как устанавливаемое приложение Sitebill Community: каталог с категориями и поиском,
карточка товара, корзина, оформление заказа, учёт остатков, заказы в админке. Каждый заказ создаёт лид в CRM сайта и
уведомляет менеджеров (колокольчик / e-mail / Telegram / Max — как настроил каждый администратор).

**Open-source интернет-магазин на своём сервере**: без комиссий и подписки, с CRM и уведомлениями менеджерам. Бесплатная self-hosted альтернатива Shopify, Tilda и InSales для небольшого магазина.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) ![Sitebill Community app](https://img.shields.io/badge/Sitebill-Community%20app-blue)

> **EN:** An open-source, self-hosted online store (e-commerce) app for [Sitebill Community](https://sitebillcms.com/):
> product catalog with categories and search, shopping cart, checkout, stock tracking, orders with statuses in the
> admin panel, every order creates a CRM lead. Laravel + GraphQL backend, Vue/Nuxt storefront, 4 languages
> (ru, en, sr, tg). A free Shopify alternative. MIT license.

Подходит, если нужны: интернет-магазин с каталогом и корзиной, приём заказов с учётом остатков, магазин на собственном
хостинге, витрина с заказами сразу в CRM.

## Установка

Магазин — это весь сайт (своя главная, меню и панель), поэтому ставится на чистый профиль `blank`:

```bash
curl -fsSL https://sitebillcms.com/install.sh | sh -s -- --profile blank --apps rumantic.shop --demo
```

`--demo` наполняет каталог примером (9 товаров в 3 категориях). Без него магазин пуст — добавьте товары в
«Админка → Товары». Вручную: `php artisan apps install rumantic.shop-<версия>.sbapp --shell` (или `php artisan apps install rumantic.shop` из каталога).

## Что умеет

**Витрина** (главная страница сайта, без перезагрузок): каталог, фильтр по категории, поиск по названию и артикулу,
пагинация, карточка товара с галереей, старая цена, «нет в наличии». Корзина хранится в браузере; цены и остатки
перепроверяются на сервере. Оформление: имя, телефон, e-mail, самовывоз или курьер (адрес), комментарий.

**Админка:** заказы со статусами `новый → оплачен → отправлен → выполнен` и отмена (остатки возвращаются на склад),
товары (цена, старая цена, артикул, остаток, порядок, скрыть, до 8 картинок), категории, настройки (название, валюта,
стоимость доставки, порог бесплатной доставки, адрес самовывоза, текст «как оплатить»), панель со счётчиками.

**Безопасность и устойчивость:** цены берутся только с сервера; остатки списываются в транзакции с блокировкой строк
(двое покупателей не купят последний товар); публичное оформление — валидация (422), приманка для ботов, лимит 10 заказов
в час с адреса; все админские запросы GraphQL закрыты `@guard` + `@can`; адреса картинок — только `http(s)`.

## Ограничения версии 0.1

- Онлайн-оплаты нет: после заказа показывается ваш текст «как оплатить» (реквизиты, ссылка), статус «оплачен» ставит менеджер.
- Картинки — по ссылкам (загрузка файлов в Host API пока нет).
- Один склад, одна валюта, без вариантов товара (размер/цвет) и промокодов.
- Переводы `sr` и `tg` — машинные, нужна вычитка.

## Разработка

Контракт SDK — [AGENT_GUIDE](https://github.com/Sitebill/sitebill-app-starter/blob/main/AGENT_GUIDE.md).

```bash
python tools/gen_locales.py        # locales/*.json из одной таблицы (ключи совпадают)
python tools/check_keys.py         # все host.t('…') есть в локалях
npx --package @sitebill/app-sdk sitebill-app check
npx --package @sitebill/app-sdk sitebill-app pack         # → rumantic.shop-<версия>.sbapp
sh tools/smoke_rest.sh http://localhost:8001 admin@example.com <пароль>   # витрина + админ + гость
```

GraphQL-имена приложения начинаются с `wshop`/`Wshop`: имена `shop*` заняты ядром платформы.

Лицензия: MIT.
