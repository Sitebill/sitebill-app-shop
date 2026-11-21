// Витрина магазина: главная страница сайта (shell.home). Каталог, карточка товара, корзина, оформление.
// Один компонент-«приложение» с экранами по хэшу адреса (#/, #/p/12, #/cart, #/checkout): сайту не нужны свои страницы.
// Vue общий с сайтом, bare-импортов нет; весь текст — через host.t, картинки и тексты товаров рендерятся как текст.
const { defineComponent, h, ref, reactive, computed, onMounted, onBeforeUnmount, watch } = globalThis.__SB_HOST__.vue

const CART_KEY = 'rumantic.shop.cart'

// ---- корзина: [{ id, qty }] в localStorage (если он недоступен — живёт до перезагрузки)
const cart = ref([])
let cartLoaded = false
function loadCart() {
  if (cartLoaded) return
  cartLoaded = true
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
    cart.value = Array.isArray(raw) ? raw.filter(l => Number.isInteger(l?.id) && Number.isInteger(l?.qty) && l.qty > 0).slice(0, 50) : []
  } catch { cart.value = [] }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart.value)) } catch { /* приватный режим */ }
}
const cartCount = computed(() => cart.value.reduce((n, l) => n + l.qty, 0))
function addToCart(id, max = 99) {
  const line = cart.value.find(l => l.id === id)
  if (line) line.qty = Math.min(max, line.qty + 1)
  else cart.value.push({ id, qty: 1 })
  saveCart()
}
function setQty(id, qty) {
  const line = cart.value.find(l => l.id === id)
  if (!line) return
  if (qty <= 0) cart.value = cart.value.filter(l => l.id !== id)
  else line.qty = qty
  saveCart()
}
function clearCart() { cart.value = []; saveCart() }

// ---- хэш-маршрут
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const [name, arg] = hash.split('/')
  if (name === 'p' && /^\d+$/.test(arg || '')) return { name: 'product', id: Number(arg) }
  if (name === 'cart') return { name: 'cart' }
  if (name === 'checkout') return { name: 'checkout' }
  return { name: 'catalog' }
}
const go = (hash) => { window.location.hash = hash }

const ShopHome = defineComponent({
  name: 'ShopHome',
  props: { host: { type: Object, required: true }, context: { type: Object, default: () => ({}) } },
  setup(props) {
    const { host } = props
    const { UButton, UInput, UBadge, UIcon } = host.components

    const route = ref(parseHash())
    const onHash = () => { route.value = parseHash(); window.scrollTo?.(0, 0) }
    const settings = ref({ shop_name: '', currency: '₽', delivery_price: 0, free_delivery_from: 0, pickup_address: '' })

    const money = (v) => {
      const num = new Intl.NumberFormat(host.locale?.value || undefined, { maximumFractionDigits: 2 }).format(Number(v) || 0)
      return `${num} ${settings.value.currency}`
    }

    onMounted(async () => {
      loadCart()
      window.addEventListener('hashchange', onHash)
      try { settings.value = await host.rest('settings') } catch { /* витрина работает с настройками по умолчанию */ }
    })
    onBeforeUnmount(() => window.removeEventListener('hashchange', onHash))

    // ---- каталог
    const catalog = reactive({ products: [], categories: [], total: 0, per_page: 24, page: 1, category: null, q: '', loading: true, failed: false })
    const search = ref('')
    async function loadCatalog() {
      catalog.loading = true
      catalog.failed = false
      try {
        const params = new URLSearchParams()
        if (catalog.category) params.set('category', String(catalog.category))
        if (catalog.q) params.set('q', catalog.q)
        if (catalog.page > 1) params.set('page', String(catalog.page))
        const data = await host.rest(`catalog?${params}`)
        Object.assign(catalog, { products: data.products, categories: data.categories, total: data.total, per_page: data.per_page })
      } catch { catalog.failed = true } finally { catalog.loading = false }
    }
    onMounted(loadCatalog)
    const pages = computed(() => Math.max(1, Math.ceil(catalog.total / catalog.per_page)))
    const pick = (patch) => { Object.assign(catalog, { page: 1 }, patch); loadCatalog() }

    // ---- карточка товара
    const product = reactive({ data: null, loading: false, missing: false, image: null })
    watch(route, async (r) => {
      if (r.name !== 'product') return
      Object.assign(product, { data: null, loading: true, missing: false })
      try {
        product.data = await host.rest(`product/${r.id}`)
        product.image = product.data.images?.[0] ?? null
      } catch { product.missing = true } finally { product.loading = false }
    }, { immediate: true })

    // ---- корзина с актуальными ценами с сервера
    const cartInfo = ref({}) // id → карточка
    const cartLoading = ref(false)
    async function refreshCart() {
      if (!cart.value.length) { cartInfo.value = {}; return }
      cartLoading.value = true
      try {
        const data = await host.rest('cart', { method: 'POST', body: { ids: cart.value.map(l => l.id) } })
        cartInfo.value = Object.fromEntries(data.products.map(p => [p.id, p]))
        // товар скрыли или он закончился — убираем/ограничиваем строку
        cart.value = cart.value.filter(l => cartInfo.value[l.id] && cartInfo.value[l.id].max_qty > 0)
          .map(l => ({ ...l, qty: Math.min(l.qty, cartInfo.value[l.id].max_qty) }))
        saveCart()
      } catch { /* остаёмся на том, что есть */ } finally { cartLoading.value = false }
    }
    watch(route, (r) => { if (r.name === 'cart' || r.name === 'checkout') refreshCart() }, { immediate: true })
    const lines = computed(() => cart.value.filter(l => cartInfo.value[l.id]).map(l => ({ ...l, p: cartInfo.value[l.id] })))
    const subtotal = computed(() => lines.value.reduce((s, l) => s + l.p.price * l.qty, 0))

    // ---- оформление
    const form = reactive({ name: host.user?.name ?? '', phone: '', email: '', delivery: 'pickup', address: '', comment: '', website: '' })
    const order = reactive({ state: 'idle', error: '', result: null })
    const deliveryCost = computed(() => {
      if (form.delivery !== 'courier') return 0
      const s = settings.value
      return s.free_delivery_from > 0 && subtotal.value >= s.free_delivery_from ? 0 : Number(s.delivery_price) || 0
    })
    async function submit() {
      if (order.state === 'sending') return
      order.error = ''
      if (!form.name.trim() || !form.phone.trim() || (form.delivery === 'courier' && !form.address.trim())) {
        order.error = host.t('error_required')
        return
      }
      order.state = 'sending'
      try {
        const body = { ...form, items: cart.value.map(l => ({ id: l.id, qty: l.qty })) }
        if (!body.email) delete body.email
        order.result = await host.rest('orders', { method: 'POST', body })
        clearCart()
        order.state = 'done'
      } catch (e) {
        order.state = 'idle'
        const status = e?.response?.status ?? e?.statusCode
        const code = e?.response?._data?.code ?? e?.data?.code
        order.error = status === 429 ? host.t('error_too_many')
          : status === 409 ? host.t(code === 'stock' ? 'error_stock' : 'error_unavailable')
            : status === 422 ? host.t('error_invalid') : host.t('error_failed')
        if (status === 409) refreshCart()
      }
    }

    // ---- разметка
    const priceBlock = (p, big = false) => h('div', { class: 'flex items-baseline gap-2' }, [
      h('span', { class: big ? 'text-2xl font-semibold text-highlighted' : 'font-semibold text-highlighted' }, money(p.price)),
      p.old_price ? h('span', { class: 'text-sm text-muted line-through' }, money(p.old_price)) : null,
    ])
    const picture = (url, cls) => url
      ? h('img', { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', class: `${cls} object-cover bg-(--ui-bg-elevated)` })
      : h('div', { class: `${cls} flex items-center justify-center bg-(--ui-bg-elevated) text-muted` }, [h(UIcon, { name: 'i-lucide-image', class: 'size-8' })])
    const field = (label, control) => h('label', { class: 'block space-y-1' }, [h('span', { class: 'text-sm font-medium' }, label), control])
    const input = (key, props = {}) => h(UInput, { modelValue: form[key], 'onUpdate:modelValue': (v) => { form[key] = v }, class: 'w-full', ...props })
    const back = (label, hash) => h(UButton, { variant: 'link', color: 'neutral', icon: 'i-lucide-arrow-left', label, onClick: () => go(hash), class: 'px-0' })

    const header = () => h('div', { class: 'flex flex-wrap items-center justify-between gap-3' }, [
      h('a', { href: '#/', class: 'text-2xl font-semibold text-highlighted' }, settings.value.shop_name || host.t('shop')),
      h(UButton, { icon: 'i-lucide-shopping-cart', variant: 'outline', label: cartCount.value > 0 ? `${host.t('cart')} (${cartCount.value})` : host.t('cart'), onClick: () => go('#/cart') }),
    ])

    const catalogView = () => h('div', { class: 'space-y-5' }, [
      h('form', { class: 'flex gap-2', onSubmit: (e) => { e.preventDefault(); pick({ q: search.value.trim() }) } }, [
        h(UInput, { modelValue: search.value, 'onUpdate:modelValue': (v) => { search.value = v }, placeholder: host.t('search'), icon: 'i-lucide-search', class: 'flex-1' }),
        h(UButton, { type: 'submit', label: host.t('find') }),
      ]),
      catalog.categories.length ? h('div', { class: 'flex flex-wrap gap-2' }, [
        h(UButton, { size: 'sm', variant: catalog.category ? 'ghost' : 'solid', color: catalog.category ? 'neutral' : 'primary', label: host.t('all'), onClick: () => pick({ category: null }) }),
        ...catalog.categories.map(c => h(UButton, {
          key: c.id, size: 'sm', variant: catalog.category === c.id ? 'solid' : 'ghost', color: catalog.category === c.id ? 'primary' : 'neutral',
          label: c.title, onClick: () => pick({ category: c.id }),
        })),
      ]) : null,
      catalog.loading ? h('p', { class: 'text-sm text-muted' }, '…')
        : catalog.failed ? h('p', { class: 'text-sm text-error' }, host.t('error_failed'))
          : catalog.products.length === 0 ? h('p', { class: 'text-muted' }, host.t('nothing_found'))
            : h('div', { class: 'grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4' }, catalog.products.map(p =>
                h('div', { key: p.id, class: 'flex flex-col overflow-hidden rounded-2xl border border-(--ui-border) bg-(--ui-bg)' }, [
                  h('a', { href: `#/p/${p.id}` }, [picture(p.image, 'aspect-square w-full')]),
                  h('div', { class: 'flex flex-1 flex-col gap-2 p-3' }, [
                    h('a', { href: `#/p/${p.id}`, class: 'line-clamp-2 text-sm font-medium text-highlighted hover:underline' }, p.title),
                    priceBlock(p),
                    h('div', { class: 'mt-auto' }, p.in_stock
                      ? h(UButton, { block: true, size: 'sm', icon: 'i-lucide-shopping-cart', label: host.t('to_cart'), onClick: () => { addToCart(p.id, p.max_qty); host.toast(host.t('added')) } })
                      : h(UBadge, { color: 'neutral', variant: 'subtle', label: host.t('out_of_stock') })),
                  ]),
                ]))),
      pages.value > 1 ? h('div', { class: 'flex items-center justify-center gap-3' }, [
        h(UButton, { size: 'sm', variant: 'outline', icon: 'i-lucide-chevron-left', disabled: catalog.page <= 1, 'aria-label': host.t('prev'), onClick: () => { catalog.page--; loadCatalog() } }),
        h('span', { class: 'text-sm text-muted' }, `${catalog.page} / ${pages.value}`),
        h(UButton, { size: 'sm', variant: 'outline', icon: 'i-lucide-chevron-right', disabled: catalog.page >= pages.value, 'aria-label': host.t('next'), onClick: () => { catalog.page++; loadCatalog() } }),
      ]) : null,
    ])

    const productView = () => {
      if (product.loading) return h('p', { class: 'text-sm text-muted' }, '…')
      if (product.missing || !product.data) return h('div', { class: 'space-y-3' }, [h('p', { class: 'text-muted' }, host.t('product_missing')), back(host.t('to_catalog'), '#/')])
      const p = product.data
      return h('div', { class: 'space-y-4' }, [
        back(host.t('to_catalog'), '#/'),
        h('div', { class: 'grid gap-6 md:grid-cols-2' }, [
          h('div', { class: 'space-y-2' }, [
            picture(product.image, 'aspect-square w-full rounded-2xl'),
            p.images.length > 1 ? h('div', { class: 'flex flex-wrap gap-2' }, p.images.map(url =>
              h('button', { key: url, type: 'button', class: 'overflow-hidden rounded-lg border border-(--ui-border)', onClick: () => { product.image = url } }, [picture(url, 'size-16')]))) : null,
          ]),
          h('div', { class: 'space-y-4' }, [
            h('h1', { class: 'text-2xl font-semibold text-highlighted' }, p.title),
            priceBlock(p, true),
            p.sku ? h('p', { class: 'text-xs text-muted' }, `${host.t('sku')}: ${p.sku}`) : null,
            p.in_stock
              ? h(UButton, { size: 'lg', icon: 'i-lucide-shopping-cart', label: host.t('to_cart'), onClick: () => { addToCart(p.id, p.max_qty); go('#/cart') } })
              : h(UBadge, { color: 'neutral', variant: 'subtle', label: host.t('out_of_stock') }),
            p.description ? h('p', { class: 'whitespace-pre-line text-sm' }, p.description) : null,
          ]),
        ]),
      ])
    }

    const cartView = () => h('div', { class: 'space-y-4' }, [
      back(host.t('to_catalog'), '#/'),
      h('h1', { class: 'text-xl font-semibold text-highlighted' }, host.t('cart')),
      lines.value.length === 0
        ? h('p', { class: 'text-muted' }, cartLoading.value || cart.value.length ? '…' : host.t('cart_empty'))
        : h('div', { class: 'space-y-4' }, [
            h('div', { class: 'divide-y divide-(--ui-border) rounded-2xl border border-(--ui-border)' }, lines.value.map(l =>
              h('div', { key: l.id, class: 'flex items-center gap-3 p-3' }, [
                picture(l.p.image, 'size-16 rounded-lg'),
                h('div', { class: 'min-w-0 flex-1' }, [
                  h('a', { href: `#/p/${l.id}`, class: 'block truncate text-sm font-medium text-highlighted hover:underline' }, l.p.title),
                  h('div', { class: 'text-sm text-muted' }, money(l.p.price)),
                ]),
                h('div', { class: 'flex items-center gap-1' }, [
                  h(UButton, { size: 'xs', variant: 'outline', icon: 'i-lucide-minus', 'aria-label': host.t('less'), onClick: () => setQty(l.id, l.qty - 1) }),
                  h('span', { class: 'w-8 text-center text-sm' }, String(l.qty)),
                  h(UButton, { size: 'xs', variant: 'outline', icon: 'i-lucide-plus', 'aria-label': host.t('more'), disabled: l.qty >= l.p.max_qty, onClick: () => setQty(l.id, l.qty + 1) }),
                ]),
                h('div', { class: 'w-24 text-right text-sm font-medium' }, money(l.p.price * l.qty)),
                h(UButton, { size: 'xs', variant: 'ghost', color: 'neutral', icon: 'i-lucide-trash-2', 'aria-label': host.t('remove'), onClick: () => setQty(l.id, 0) }),
              ]))),
            h('div', { class: 'flex flex-wrap items-center justify-between gap-3' }, [
              h('div', { class: 'text-lg font-semibold text-highlighted' }, `${host.t('subtotal')}: ${money(subtotal.value)}`),
              h(UButton, { size: 'lg', label: host.t('checkout'), onClick: () => go('#/checkout') }),
            ]),
          ]),
    ])

    const checkoutView = () => {
      if (order.state === 'done') {
        return h('div', { class: 'max-w-xl space-y-3' }, [
          h('h1', { class: 'text-xl font-semibold text-success' }, `${host.t('order_done')} №${order.result?.number ?? ''}`),
          h('p', { class: 'text-sm' }, host.t('order_done_text')),
          order.result?.payment_note ? h('p', { class: 'whitespace-pre-line rounded-xl bg-(--ui-bg-elevated) p-3 text-sm' }, order.result.payment_note) : null,
          h(UButton, { label: host.t('to_catalog'), onClick: () => { order.state = 'idle'; go('#/') } }),
        ])
      }
      if (lines.value.length === 0) return h('div', { class: 'space-y-3' }, [h('p', { class: 'text-muted' }, cartLoading.value || cart.value.length ? '…' : host.t('cart_empty')), back(host.t('to_catalog'), '#/')])
      return h('div', { class: 'grid gap-6 md:grid-cols-5' }, [
        h('form', { class: 'space-y-3 md:col-span-3', onSubmit: (e) => { e.preventDefault(); submit() } }, [
          back(host.t('cart'), '#/cart'),
          h('h1', { class: 'text-xl font-semibold text-highlighted' }, host.t('checkout')),
          field(host.t('name'), input('name', { autocomplete: 'name' })),
          field(host.t('phone'), input('phone', { type: 'tel', autocomplete: 'tel' })),
          field(host.t('email'), input('email', { type: 'email', autocomplete: 'email' })),
          h('div', { class: 'space-y-1' }, [
            h('span', { class: 'text-sm font-medium' }, host.t('delivery')),
            h('div', { class: 'flex flex-wrap gap-2' }, [
              h(UButton, { size: 'sm', variant: form.delivery === 'pickup' ? 'solid' : 'outline', label: host.t('pickup'), onClick: () => { form.delivery = 'pickup' } }),
              h(UButton, { size: 'sm', variant: form.delivery === 'courier' ? 'solid' : 'outline', label: host.t('courier'), onClick: () => { form.delivery = 'courier' } }),
            ]),
            form.delivery === 'pickup' && settings.value.pickup_address ? h('p', { class: 'text-xs text-muted' }, settings.value.pickup_address) : null,
          ]),
          form.delivery === 'courier' ? field(host.t('address'), input('address', { autocomplete: 'street-address' })) : null,
          field(host.t('comment'), input('comment')),
          // Приманка для ботов: человек не видит.
          h('input', { name: 'website', value: form.website, onInput: (e) => { form.website = e.target.value }, tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true', style: 'position:absolute;left:-10000px;width:1px;height:1px;opacity:0' }),
          order.error ? h('p', { class: 'text-sm text-error' }, order.error) : null,
          h(UButton, { type: 'submit', size: 'lg', block: true, loading: order.state === 'sending', label: host.t('place_order') }),
          h('p', { class: 'text-xs text-muted' }, host.t('privacy')),
        ]),
        h('div', { class: 'h-fit space-y-2 rounded-2xl border border-(--ui-border) p-4 md:col-span-2' }, [
          h('div', { class: 'font-medium text-highlighted' }, host.t('your_order')),
          ...lines.value.map(l => h('div', { key: l.id, class: 'flex justify-between gap-2 text-sm' }, [h('span', {}, `${l.p.title} × ${l.qty}`), h('span', { class: 'whitespace-nowrap' }, money(l.p.price * l.qty))])),
          h('div', { class: 'flex justify-between border-t border-(--ui-border) pt-2 text-sm' }, [h('span', {}, host.t('delivery_cost')), h('span', {}, deliveryCost.value ? money(deliveryCost.value) : host.t('free'))]),
          h('div', { class: 'flex justify-between text-lg font-semibold text-highlighted' }, [h('span', {}, host.t('total')), h('span', {}, money(subtotal.value + deliveryCost.value))]),
        ]),
      ])
    }

    return () => h('div', { class: 'mx-auto w-full max-w-6xl space-y-6 px-4 py-6' }, [
      header(),
      route.value.name === 'product' ? productView()
        : route.value.name === 'cart' ? cartView()
          : route.value.name === 'checkout' ? checkoutView()
            : catalogView(),
    ])
  },
})

export const widgets = { ShopHome }
