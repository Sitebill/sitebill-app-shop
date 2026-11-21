// Админка магазина: заказы, товары, категории, настройки и главная панель (shell.adminDashboard).
const { defineComponent, h, ref, reactive, onMounted, computed } = globalThis.__SB_HOST__.vue

const STATUSES = ['new', 'paid', 'shipped', 'done', 'cancelled']
const STATUS_COLOR = { new: 'warning', paid: 'info', shipped: 'primary', done: 'success', cancelled: 'neutral' }

const ORDERS = `query ShopOrders($status: String) {
  wshopOrders(status: $status) { id number customer_name phone email delivery address comment subtotal delivery_price total status lead_id created_at items { title price qty } }
  wshopStats { new_orders total_orders revenue products out_of_stock }
  wshopSettings { currency }
}`
const SET_STATUS = 'mutation ShopSetOrderStatus($id: ID!, $status: String!) { wshopSetOrderStatus(id: $id, status: $status) { id status } }'
const PRODUCTS = `query ShopProducts($q: String) {
  wshopProducts(q: $q) { id category_id title description price old_price sku stock images is_active sort }
  wshopCategories { id title sort products_count }
  wshopSettings { currency }
}`
const SAVE_PRODUCT = 'mutation ShopSaveProduct($id: ID, $input: WshopProductInput!) { wshopSaveProduct(id: $id, input: $input) { id } }'
const DELETE_PRODUCT = 'mutation ShopDeleteProduct($id: ID!) { wshopDeleteProduct(id: $id) }'
const CATEGORIES = 'query ShopCategories { wshopCategories { id title sort products_count } }'
const SAVE_CATEGORY = 'mutation ShopSaveCategory($id: ID, $title: String!, $sort: Int) { wshopSaveCategory(id: $id, title: $title, sort: $sort) { id } }'
const DELETE_CATEGORY = 'mutation ShopDeleteCategory($id: ID!) { wshopDeleteCategory(id: $id) }'
const SETTINGS = 'query ShopSettingsQ { wshopSettings { shop_name currency delivery_price free_delivery_from pickup_address payment_note } }'
const SAVE_SETTINGS = `mutation ShopSaveSettings($input: WshopSettingsInput!) {
  wshopSaveSettings(input: $input) { shop_name currency delivery_price free_delivery_from pickup_address payment_note }
}`

const fmt = (host, v, currency) => `${new Intl.NumberFormat(host.locale?.value || undefined, { maximumFractionDigits: 2 }).format(Number(v) || 0)} ${currency || ''}`.trim()
const errText = (e) => String(e?.message ?? e)
const field = (label, control, hint) => h('label', { class: 'block space-y-1' }, [
  h('span', { class: 'block text-sm font-medium' }, label), h('div', {}, [control]), hint ? h('span', { class: 'block text-xs text-muted' }, hint) : null,
])

// ---------------------------------------------------------------- заказы
const Orders = defineComponent({
  name: 'ShopOrders',
  props: { host: { type: Object, required: true } },
  setup(props) {
    const { host } = props
    const { UButton, UBadge } = host.components
    const filter = ref('new')
    const rows = ref([])
    const stats = ref({ new_orders: 0, total_orders: 0, revenue: 0, products: 0, out_of_stock: 0 })
    const currency = ref('')
    const loading = ref(true)

    async function load() {
      loading.value = true
      try {
        const data = await host.gql(ORDERS, { status: filter.value === 'all' ? null : filter.value })
        rows.value = data.wshopOrders
        stats.value = data.wshopStats
        currency.value = data.wshopSettings.currency
      } finally { loading.value = false }
    }
    async function setStatus(row, status) {
      if (status === 'cancelled' && !window.confirm(host.t('confirm_cancel'))) return
      try {
        await host.gql(SET_STATUS, { id: row.id, status })
        await load()
      } catch (e) { host.toast(errText(e), 'error') }
    }
    onMounted(load)

    const tab = (key, label) => h(UButton, {
      size: 'sm', variant: filter.value === key ? 'solid' : 'ghost', color: filter.value === key ? 'primary' : 'neutral', label,
      onClick: () => { filter.value = key; load() },
    })

    return () => h('div', { class: 'space-y-4' }, [
      h('div', { class: 'flex flex-wrap gap-2' }, [
        tab('new', `${host.t('status_new')} (${stats.value.new_orders})`),
        ...['paid', 'shipped', 'done', 'cancelled'].map(s => tab(s, host.t(`status_${s}`))),
        tab('all', `${host.t('filter_all')} (${stats.value.total_orders})`),
      ]),
      loading.value ? h('p', { class: 'text-sm text-muted' }, '…')
        : rows.value.length === 0 ? h('p', { class: 'text-sm text-muted' }, host.t('orders_empty'))
          : h('div', { class: 'divide-y divide-(--ui-border) rounded-xl border border-(--ui-border)' }, rows.value.map(o =>
              h('div', { key: o.id, class: 'space-y-2 p-4' }, [
                h('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
                  h('div', { class: 'font-medium text-highlighted' }, [`№${o.number} · ${o.customer_name} · `, h('a', { href: `tel:${o.phone}`, class: 'text-primary' }, o.phone)]),
                  h(UBadge, { color: STATUS_COLOR[o.status] ?? 'neutral', variant: 'subtle', label: host.t(`status_${o.status}`) }),
                ]),
                h('div', { class: 'text-xs text-muted' }, `${host.formatDate(o.created_at)}${o.email ? ` · ${o.email}` : ''} · ${o.delivery === 'courier' ? `${host.t('courier')}: ${o.address ?? ''}` : host.t('pickup')}`),
                h('ul', { class: 'text-sm' }, o.items.map((i, n) => h('li', { key: n }, `${i.title} × ${i.qty} — ${fmt(host, i.price * i.qty, currency.value)}`))),
                o.comment ? h('p', { class: 'whitespace-pre-line text-sm italic' }, o.comment) : null,
                h('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
                  h('div', { class: 'text-sm font-semibold' }, `${host.t('total')}: ${fmt(host, o.total, currency.value)}`),
                  h('div', { class: 'flex flex-wrap gap-1' }, [
                    o.lead_id ? h(UButton, { size: 'xs', variant: 'ghost', icon: 'i-lucide-kanban', to: host.localePath('/admin/deals'), label: host.t('open_crm') }) : null,
                    ...(o.status === 'cancelled' ? [] : STATUSES.filter(s => s !== o.status).map(s => h(UButton, {
                      key: s, size: 'xs', variant: 'outline', color: s === 'cancelled' ? 'error' : 'neutral', label: host.t(`to_${s}`), onClick: () => setStatus(o, s),
                    }))),
                  ]),
                ]),
              ]))),
    ])
  },
})

// ---------------------------------------------------------------- товары
const EMPTY_PRODUCT = () => ({ id: null, category_id: null, title: '', description: '', price: '', old_price: '', sku: '', stock: '', images: '', is_active: true, sort: 0 })

const Products = defineComponent({
  name: 'ShopProducts',
  props: { host: { type: Object, required: true } },
  setup(props) {
    const { host } = props
    const { UButton, UInput, UTextarea, USwitch, UBadge } = host.components
    const rows = ref([])
    const categories = ref([])
    const currency = ref('')
    const q = ref('')
    const loading = ref(true)
    const edit = ref(null)
    const saving = ref(false)

    async function load() {
      loading.value = true
      try {
        const data = await host.gql(PRODUCTS, { q: q.value.trim() || null })
        rows.value = data.wshopProducts
        categories.value = data.wshopCategories
        currency.value = data.wshopSettings.currency
      } finally { loading.value = false }
    }
    onMounted(load)

    const open = (p) => {
      edit.value = p
        ? { ...p, old_price: p.old_price ?? '', sku: p.sku ?? '', stock: p.stock ?? '', description: p.description ?? '', images: (p.images || []).join('\n') }
        : EMPTY_PRODUCT()
    }
    async function save() {
      const f = edit.value
      if (!f.title.trim() || f.price === '' || Number(f.price) < 0) { host.toast(host.t('error_product'), 'error'); return }
      saving.value = true
      try {
        await host.gql(SAVE_PRODUCT, {
          id: f.id,
          input: {
            category_id: f.category_id ? Number(f.category_id) : null,
            title: f.title.trim(),
            description: f.description,
            price: Number(f.price),
            old_price: f.old_price === '' ? null : Number(f.old_price),
            sku: f.sku,
            stock: f.stock === '' ? null : Number(f.stock),
            images: f.images.split('\n').map(s => s.trim()).filter(Boolean),
            is_active: f.is_active,
            sort: Number(f.sort) || 0,
          },
        })
        host.toast(host.t('saved'))
        edit.value = null
        await load()
      } catch (e) { host.toast(errText(e), 'error') } finally { saving.value = false }
    }
    async function remove(p) {
      if (!window.confirm(host.t('confirm_delete_product'))) return
      try { await host.gql(DELETE_PRODUCT, { id: p.id }); await load() } catch (e) { host.toast(errText(e), 'error') }
    }
    const categoryTitle = (id) => categories.value.find(c => c.id === String(id))?.title ?? ''
    const bind = (key, props = {}) => ({ modelValue: edit.value[key], 'onUpdate:modelValue': (v) => { edit.value[key] = v }, class: 'w-full', ...props })

    const form = () => h('form', { class: 'max-w-2xl space-y-3 rounded-xl border border-(--ui-border) p-4', onSubmit: (e) => { e.preventDefault(); save() } }, [
      h('h2', { class: 'text-lg font-semibold' }, edit.value.id ? host.t('product_edit') : host.t('product_new')),
      field(host.t('f_title'), h(UInput, bind('title'))),
      h('div', { class: 'grid gap-3 sm:grid-cols-3' }, [
        field(`${host.t('f_price')}, ${currency.value}`, h(UInput, bind('price', { type: 'number', step: '0.01', min: 0 }))),
        field(host.t('f_old_price'), h(UInput, bind('old_price', { type: 'number', step: '0.01', min: 0 }))),
        field(host.t('f_stock'), h(UInput, bind('stock', { type: 'number', min: 0 })), host.t('f_stock_hint')),
      ]),
      h('div', { class: 'grid gap-3 sm:grid-cols-3' }, [
        field(host.t('f_sku'), h(UInput, bind('sku'))),
        field(host.t('f_sort'), h(UInput, bind('sort', { type: 'number' }))),
        field(host.t('f_category'), h('select', {
          class: 'w-full rounded-md border border-(--ui-border) bg-(--ui-bg) p-2 text-sm', value: edit.value.category_id ?? '',
          onChange: (e) => { edit.value.category_id = e.target.value ? Number(e.target.value) : null },
        }, [h('option', { value: '' }, host.t('no_category')), ...categories.value.map(c => h('option', { key: c.id, value: c.id, selected: Number(c.id) === edit.value.category_id }, c.title))])),
      ]),
      field(host.t('f_description'), h(UTextarea, bind('description', { rows: 4 }))),
      field(host.t('f_images'), h(UTextarea, bind('images', { rows: 3, placeholder: 'https://…' })), host.t('f_images_hint')),
      h(USwitch, { modelValue: edit.value.is_active, 'onUpdate:modelValue': (v) => { edit.value.is_active = v }, label: host.t('f_active') }),
      h('div', { class: 'flex gap-2' }, [
        h(UButton, { type: 'submit', loading: saving.value, label: host.t('save') }),
        h(UButton, { variant: 'ghost', color: 'neutral', label: host.t('cancel'), onClick: () => { edit.value = null } }),
      ]),
    ])

    return () => edit.value ? form() : h('div', { class: 'space-y-4' }, [
      h('div', { class: 'flex flex-wrap gap-2' }, [
        h('form', { class: 'flex flex-1 gap-2', onSubmit: (e) => { e.preventDefault(); load() } }, [
          h(UInput, { modelValue: q.value, 'onUpdate:modelValue': (v) => { q.value = v }, placeholder: host.t('search'), icon: 'i-lucide-search', class: 'max-w-xs flex-1' }),
          h(UButton, { type: 'submit', variant: 'outline', label: host.t('find') }),
        ]),
        h(UButton, { icon: 'i-lucide-plus', label: host.t('product_new'), onClick: () => open(null) }),
      ]),
      loading.value ? h('p', { class: 'text-sm text-muted' }, '…')
        : rows.value.length === 0 ? h('p', { class: 'text-sm text-muted' }, host.t('products_empty'))
          : h('div', { class: 'divide-y divide-(--ui-border) rounded-xl border border-(--ui-border)' }, rows.value.map(p =>
              h('div', { key: p.id, class: 'flex flex-wrap items-center gap-3 p-3' }, [
                p.images[0]
                  ? h('img', { src: p.images[0], alt: '', referrerpolicy: 'no-referrer', class: 'size-12 rounded-lg object-cover' })
                  : h('div', { class: 'size-12 rounded-lg bg-(--ui-bg-elevated)' }),
                h('div', { class: 'min-w-0 flex-1' }, [
                  h('div', { class: 'truncate font-medium text-highlighted' }, p.title),
                  h('div', { class: 'text-xs text-muted' }, [fmt(host, p.price, currency.value), p.sku ? ` · ${p.sku}` : '', categoryTitle(p.category_id) ? ` · ${categoryTitle(p.category_id)}` : ''].join('')),
                ]),
                h(UBadge, { color: p.stock === null ? 'neutral' : p.stock > 0 ? 'success' : 'error', variant: 'subtle', label: p.stock === null ? host.t('stock_unlimited') : `${host.t('stock')}: ${p.stock}` }),
                !p.is_active ? h(UBadge, { color: 'neutral', variant: 'outline', label: host.t('hidden') }) : null,
                h(UButton, { size: 'xs', variant: 'outline', icon: 'i-lucide-pencil', 'aria-label': host.t('edit'), onClick: () => open(p) }),
                h(UButton, { size: 'xs', variant: 'ghost', color: 'error', icon: 'i-lucide-trash-2', 'aria-label': host.t('delete'), onClick: () => remove(p) }),
              ]))),
    ])
  },
})

// ---------------------------------------------------------------- категории
const Categories = defineComponent({
  name: 'ShopCategories',
  props: { host: { type: Object, required: true } },
  setup(props) {
    const { host } = props
    const { UButton, UInput } = host.components
    const rows = ref([])
    const draft = reactive({ id: null, title: '', sort: 0 })

    async function load() { rows.value = (await host.gql(CATEGORIES)).wshopCategories }
    onMounted(load)
    async function save() {
      if (!draft.title.trim()) return
      try {
        await host.gql(SAVE_CATEGORY, { id: draft.id, title: draft.title.trim(), sort: Number(draft.sort) || 0 })
        Object.assign(draft, { id: null, title: '', sort: 0 })
        host.toast(host.t('saved'))
        await load()
      } catch (e) { host.toast(errText(e), 'error') }
    }
    async function remove(c) {
      if (!window.confirm(host.t('confirm_delete_category'))) return
      try { await host.gql(DELETE_CATEGORY, { id: c.id }); await load() } catch (e) { host.toast(errText(e), 'error') }
    }

    return () => h('div', { class: 'max-w-xl space-y-4' }, [
      h('form', { class: 'flex items-end gap-2', onSubmit: (e) => { e.preventDefault(); save() } }, [
        h('div', { class: 'flex-1' }, [field(host.t('f_category_title'), h(UInput, { modelValue: draft.title, 'onUpdate:modelValue': (v) => { draft.title = v }, class: 'w-full' }))]),
        h('div', { class: 'w-24' }, [field(host.t('f_sort'), h(UInput, { modelValue: String(draft.sort), 'onUpdate:modelValue': (v) => { draft.sort = v }, type: 'number', class: 'w-full' }))]),
        h(UButton, { type: 'submit', label: draft.id ? host.t('save') : host.t('add') }),
      ]),
      rows.value.length === 0 ? h('p', { class: 'text-sm text-muted' }, host.t('categories_empty'))
        : h('div', { class: 'divide-y divide-(--ui-border) rounded-xl border border-(--ui-border)' }, rows.value.map(c =>
            h('div', { key: c.id, class: 'flex items-center gap-2 p-3' }, [
              h('div', { class: 'flex-1' }, [h('span', { class: 'font-medium' }, c.title), h('span', { class: 'ml-2 text-xs text-muted' }, `${host.t('products')}: ${c.products_count}`)]),
              h(UButton, { size: 'xs', variant: 'outline', icon: 'i-lucide-pencil', 'aria-label': host.t('edit'), onClick: () => Object.assign(draft, { id: c.id, title: c.title, sort: c.sort }) }),
              h(UButton, { size: 'xs', variant: 'ghost', color: 'error', icon: 'i-lucide-trash-2', 'aria-label': host.t('delete'), onClick: () => remove(c) }),
            ]))),
    ])
  },
})

// ---------------------------------------------------------------- настройки
const Settings = defineComponent({
  name: 'ShopSettingsForm',
  props: { host: { type: Object, required: true } },
  setup(props) {
    const { host } = props
    const { UButton, UInput, UTextarea } = host.components
    const form = reactive({ shop_name: '', currency: '₽', delivery_price: 0, free_delivery_from: 0, pickup_address: '', payment_note: '' })
    const saving = ref(false)
    onMounted(async () => Object.assign(form, (await host.gql(SETTINGS)).wshopSettings))

    async function save() {
      saving.value = true
      try {
        // Поле в поле: форма наполнена ответом сервера с __typename, который в input недопустим.
        const input = {
          shop_name: form.shop_name, currency: form.currency, pickup_address: form.pickup_address, payment_note: form.payment_note,
          delivery_price: Number(form.delivery_price) || 0, free_delivery_from: Number(form.free_delivery_from) || 0,
        }
        Object.assign(form, (await host.gql(SAVE_SETTINGS, { input })).wshopSaveSettings)
        host.toast(host.t('saved'))
      } catch (e) { host.toast(errText(e), 'error') } finally { saving.value = false }
    }
    const bind = (key, props = {}) => ({ modelValue: String(form[key]), 'onUpdate:modelValue': (v) => { form[key] = v }, class: 'w-full', ...props })

    return () => h('form', { class: 'max-w-xl space-y-4', onSubmit: (e) => { e.preventDefault(); save() } }, [
      field(host.t('set_name'), h(UInput, bind('shop_name')), host.t('set_name_hint')),
      field(host.t('set_currency'), h(UInput, bind('currency', { class: 'w-32' }))),
      field(host.t('set_delivery_price'), h(UInput, bind('delivery_price', { type: 'number', min: 0, class: 'w-40' }))),
      field(host.t('set_free_from'), h(UInput, bind('free_delivery_from', { type: 'number', min: 0, class: 'w-40' })), host.t('set_free_from_hint')),
      field(host.t('set_pickup'), h(UInput, bind('pickup_address'))),
      field(host.t('set_payment'), h(UTextarea, bind('payment_note', { rows: 4 })), host.t('set_payment_hint')),
      h(UButton, { type: 'submit', loading: saving.value, label: host.t('save') }),
    ])
  },
})

// ---------------------------------------------------------------- страницы
const page = (name, titleKey, Body) => defineComponent({
  name,
  props: { host: { type: Object, required: true } },
  setup(props) {
    return () => h('div', { class: 'space-y-5' }, [
      h('h1', { class: 'text-2xl font-semibold text-highlighted' }, props.host.t(titleKey)),
      h(Body, { host: props.host }),
    ])
  },
})

// Слот admin.dashboard и shell.adminDashboard: счётчики и ссылки.
const ShopDashboard = defineComponent({
  name: 'ShopDashboard',
  props: { host: { type: Object, required: true }, context: { type: Object, default: () => ({}) } },
  setup(props) {
    const { host } = props
    const { UButton } = host.components
    const data = ref(null)
    onMounted(async () => { data.value = await host.gql(ORDERS, { status: 'new' }) })
    const tile = (label, value) => h('div', { class: 'rounded-2xl border border-(--ui-border) bg-(--ui-bg) p-5' }, [
      h('div', { class: 'text-sm text-muted' }, label), h('div', { class: 'mt-1 text-2xl font-semibold' }, value),
    ])
    const to = (p) => host.localePath(`/admin/x/rumantic.shop${p}`)

    return () => {
      const s = data.value?.wshopStats
      const cur = data.value?.wshopSettings.currency
      return h('div', { class: 'space-y-4' }, [
        h('div', { class: 'flex flex-wrap items-center justify-between gap-3' }, [
          h('h1', { class: 'text-2xl font-semibold text-highlighted' }, host.t('admin_title')),
          h('div', { class: 'flex gap-2' }, [
            h(UButton, { variant: 'outline', icon: 'i-lucide-store', to: host.localePath('/'), label: host.t('open_shop') }),
            h(UButton, { icon: 'i-lucide-package', to: to(''), label: host.t('menu_orders') }),
          ]),
        ]),
        h('div', { class: 'grid grid-cols-2 gap-4 lg:grid-cols-4' }, [
          tile(host.t('widget_new'), s ? String(s.new_orders) : '…'),
          tile(host.t('widget_orders'), s ? String(s.total_orders) : '…'),
          tile(host.t('widget_revenue'), s ? fmt(host, s.revenue, cur) : '…'),
          tile(host.t('widget_out'), s ? `${s.out_of_stock} / ${s.products}` : '…'),
        ]),
      ])
    }
  },
})

export const pages = {
  '': page('ShopOrdersPage', 'menu_orders', Orders),
  products: page('ShopProductsPage', 'menu_products', Products),
  categories: page('ShopCategoriesPage', 'menu_categories', Categories),
  settings: page('ShopSettingsPage', 'menu_settings', Settings),
}
export const widgets = { ShopDashboard }
