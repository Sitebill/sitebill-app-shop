#!/bin/sh
# Дымовой тест витрины и админки на запущенной платформе:
#   sh smoke_rest.sh http://localhost:8001 admin@example.com пароль
# Нужны демо-товары (php artisan rumantic-shop:seed-demo). Товар 6 в демо — с нулевым остатком.
BASE=${1:-http://localhost:8001}; EMAIL=${2:-admin@example.com}; PASS=${3:-TestPass123}
A="$BASE/api/v1/apps/rumantic.shop"
JAR=$(mktemp); AJAR=$(mktemp)
H1='Accept: application/json'; H2='Content-Type: application/json'
xsrf() { awk '$6=="XSRF-TOKEN"{print $7}' "$1" | sed 's/%3D/=/g'; }
# POST/GET с сессией из банки $1
call() { jar=$1; shift; curl -s -b "$jar" -c "$jar" -H "X-XSRF-TOKEN: $(xsrf "$jar")" -H "$H1" -H "$H2" -H "Origin: $BASE" -H "Referer: $BASE/" "$@"; }

curl -s -c "$JAR" "$BASE/sanctum/csrf-cookie" -o /dev/null
echo "== публичное (гость)"
call "$JAR" "$A/settings"; echo
echo "-- catalog (поиск «худи»)"; call "$JAR" "$A/catalog?q=%D1%85%D1%83%D0%B4%D0%B8" | head -c 200; echo
echo "-- product 999999 -> 404"; call "$JAR" -o /dev/null -w "%{http_code}\n" "$A/product/999999"
echo "-- cart"; call "$JAR" -d '{"ids":[1,2]}' "$A/cart" | head -c 160; echo
echo "-- order {} -> 422"; call "$JAR" -o /dev/null -w "%{http_code}\n" -d '{}' "$A/orders"
echo "-- order товар 6 (остаток 0) -> 409 unavailable/stock"; call "$JAR" -w " %{http_code}\n" -d '{"name":"Ivan","phone":"+79990000000","delivery":"pickup","items":[{"id":6,"qty":1}]}' "$A/orders"
echo "-- order курьер без адреса -> 422"; call "$JAR" -o /dev/null -w "%{http_code}\n" -d '{"name":"Ivan","phone":"+79990000000","delivery":"courier","items":[{"id":1,"qty":1}]}' "$A/orders"
echo "-- order товар 1 x2, курьер -> 201"; call "$JAR" -w " %{http_code}\n" -d '{"name":"Ivan","phone":"+79990000000","delivery":"courier","address":"Moscow","items":[{"id":1,"qty":2}]}' "$A/orders"
echo "-- order 99 шт (больше остатка) -> 409 stock"; call "$JAR" -w " %{http_code}\n" -d '{"name":"Ivan","phone":"+79990000000","delivery":"pickup","items":[{"id":1,"qty":99}]}' "$A/orders"
echo "-- honeypot -> 201 number 0"; call "$JAR" -w " %{http_code}\n" -d '{"website":"x","name":"b","phone":"12345","delivery":"pickup","items":[{"id":1,"qty":1}]}' "$A/orders"

echo "== GraphQL гость: все админские поля должны отвечать отказом"
for q in '{ wshopOrders { id } }' '{ wshopStats { revenue } }' '{ wshopSettings { currency } }' '{ wshopProducts { id } }' '{ wshopCategories { id } }' 'mutation { wshopDeleteProduct(id: 1) }' 'mutation { wshopSaveSettings(input: {currency: "X"}) { currency } }' 'mutation { wshopSetOrderStatus(id: 1, status: "done") { id } }' 'mutation { wshopSaveCategory(title: "x") { id } }' 'mutation { wshopSaveProduct(input: {title: "x", price: 1}) { id } }'; do
  printf '%s => ' "$q"; curl -s -H "$H1" -H "$H2" -d "{\"query\":\"$(echo "$q" | sed 's/"/\\"/g')\"}" "$BASE/graphql" | head -c 90; echo
done

echo "== GraphQL админ"
curl -s -c "$AJAR" "$BASE/sanctum/csrf-cookie" -o /dev/null
call "$AJAR" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$BASE/api/v1/login"; echo
gql() { call "$AJAR" -d "{\"query\":\"$(echo "$1" | sed 's/"/\\"/g')\"}" "$BASE/graphql"; echo; }
gql '{ wshopStats { new_orders total_orders revenue products out_of_stock } }'
gql '{ wshopOrders { id number total status delivery_price items { title qty price } } }'
gql '{ wshopProducts(limit: 2) { id title stock } }'
gql 'mutation { wshopSaveCategory(title: "Test") { id title } }'
gql 'mutation { wshopSaveProduct(input: {title: "Testovyi", price: 10.5, stock: 3, images: ["javascript:alert(1)"]}) { id } }'
gql 'mutation { wshopSaveProduct(input: {title: "Testovyi", price: 10.5, stock: 3, images: ["https://example.com/a.jpg"]}) { id title stock images } }'
gql 'mutation { wshopSaveSettings(input: {shop_name: "My shop", currency: "₽", delivery_price: 300, free_delivery_from: 5000}) { shop_name delivery_price } }'
echo "-- отмена заказа 1 возвращает остаток (товар 1: было 25-2=23 -> 25)"
gql '{ wshopProducts(limit: 1) { id stock } }'
gql 'mutation { wshopSetOrderStatus(id: 1, status: "cancelled") { id status } }'
gql '{ wshopProducts(limit: 1) { id stock } }'
echo "-- из cancelled вернуть нельзя"
gql 'mutation { wshopSetOrderStatus(id: 1, status: "new") { id status } }'
rm -f "$JAR" "$AJAR"
