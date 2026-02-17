import './bootstrap';
import Alpine from 'alpinejs';

const renderTrendCharts = () => {
    document.querySelectorAll('.trend-chart').forEach((node) => {
        const valuesRaw = node.getAttribute('data-values');
        if (!valuesRaw) {
            return;
        }

        let values;
        try {
            values = JSON.parse(valuesRaw);
        } catch {
            values = [];
        }

        if (!Array.isArray(values) || values.length === 0) {
            node.innerHTML = '<div class="muted-line">Belum ada data tren</div>';
            return;
        }

        const color = node.getAttribute('data-color') || '#465fff';
        const withFill = node.getAttribute('data-fill') === '1';

        const width = Math.max(node.clientWidth, 260);
        const height = 130;
        const padding = 12;
        const innerWidth = width - padding * 2;
        const innerHeight = height - padding * 2;

        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const range = max - min || 1;

        const points = values
            .map((value, index) => {
                const x = values.length > 1
                    ? padding + (index * innerWidth) / (values.length - 1)
                    : padding + innerWidth / 2;
                const y = padding + ((max - value) * innerHeight) / range;

                return `${x},${y}`;
            })
            .join(' ');

        const areaPoints = `${padding},${height - padding} ${points} ${padding + innerWidth},${height - padding}`;
        const pointList = points.split(' ');
        const lastPoint = pointList[pointList.length - 1]?.split(',') ?? ['0', '0'];
        const lastX = Number(lastPoint[0]);
        const lastY = Number(lastPoint[1]);

        node.innerHTML = `
            <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Grafik tren">
                ${withFill ? `<polygon points="${areaPoints}" fill="${color}" fill-opacity="0.1"></polygon>` : ''}
                <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
                <circle cx="${lastX}" cy="${lastY}" r="4" fill="${color}" fill-opacity="0.18"></circle>
                <circle cx="${lastX}" cy="${lastY}" r="2.4" fill="${color}"></circle>
            </svg>
        `;
    });
};

window.Alpine = Alpine;

Alpine.data('panelApp', () => ({
    sidebarOpen: false,
    isDark: false,
    sidebarCollapsed: false,
    isDesktop: false,

    init() {
        const savedTheme = localStorage.getItem('panel_theme');
        this.isDark = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', this.isDark);

        this.isDesktop = window.innerWidth >= 1280;
        this.sidebarCollapsed = this.isDesktop && localStorage.getItem('panel_sidebar_collapsed') === '1';
        this.sidebarOpen = this.isDesktop;

        requestAnimationFrame(renderTrendCharts);

        window.addEventListener('resize', () => {
            const desktopNow = window.innerWidth >= 1280;
            this.isDesktop = desktopNow;
            this.sidebarOpen = desktopNow;
            if (!desktopNow) {
                this.sidebarCollapsed = false;
            } else {
                this.sidebarCollapsed = localStorage.getItem('panel_sidebar_collapsed') === '1';
            }

            requestAnimationFrame(renderTrendCharts);
        });
    },

    toggleTheme() {
        this.isDark = !this.isDark;
        document.documentElement.classList.toggle('dark', this.isDark);
        localStorage.setItem('panel_theme', this.isDark ? 'dark' : 'light');
    },

    toggleSidebarCollapse() {
        if (!this.isDesktop) {
            return;
        }

        this.sidebarCollapsed = !this.sidebarCollapsed;
        localStorage.setItem('panel_sidebar_collapsed', this.sidebarCollapsed ? '1' : '0');
    },
}));

Alpine.data('orderBulkTable', (ids = []) => ({
    orderIds: Array.isArray(ids) ? ids : [],
    selected: [],
    bulkAction: '',
    courierUserId: '',
    bulkNotice: '',

    get selectedCount() {
        return this.selected.length;
    },

    get allSelected() {
        return this.orderIds.length > 0 && this.selected.length === this.orderIds.length;
    },

    isSelected(id) {
        return this.selected.includes(id);
    },

    toggle(id, checked) {
        if (checked) {
            if (!this.selected.includes(id)) {
                this.selected.push(id);
            }
            return;
        }

        this.selected = this.selected.filter((current) => current !== id);
    },

    toggleAll(checked) {
        this.selected = checked ? [...this.orderIds] : [];
    },

    submitBulk(event) {
        if (!this.bulkAction || this.selectedCount === 0) {
            this.bulkNotice = 'Pilih minimal 1 order dan 1 action terlebih dahulu.';
            return;
        }

        if (this.bulkAction === 'assign-courier' && !this.courierUserId) {
            this.bulkNotice = 'Pilih courier terlebih dahulu untuk assignment.';
            return;
        }

        this.bulkNotice = '';
        event.target.submit();
    },

    copyRef(value) {
        if (!value) {
            return;
        }

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(String(value));
            this.bulkNotice = `Referensi ${value} berhasil disalin.`;
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = String(value);
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.bulkNotice = `Referensi ${value} berhasil disalin.`;
    },
}));

Alpine.data('bulkReportTable', (rows = []) => ({
    rows: Array.isArray(rows) ? rows : [],
    search: '',
    reasonCode: '',

    get reasonOptions() {
        const map = new Map();

        this.rows.forEach((row) => {
            const code = String(row?.reason_code ?? '').trim();
            if (!code || map.has(code)) {
                return;
            }

            map.set(code, String(row?.reason ?? code));
        });

        return [...map.entries()].map(([code, label]) => ({ code, label }));
    },

    get filteredRows() {
        const query = this.search.trim().toLowerCase();

        return this.rows.filter((row) => {
            const currentReasonCode = String(row?.reason_code ?? '');
            if (this.reasonCode && currentReasonCode !== this.reasonCode) {
                return false;
            }

            if (!query) {
                return true;
            }

            const haystack = [
                row?.order_ref,
                row?.order_id,
                row?.result,
                row?.reason,
                row?.reason_code,
                row?.from_status,
                row?.to_status,
            ]
                .map((value) => String(value ?? '').toLowerCase())
                .join(' ');

            return haystack.includes(query);
        });
    },

    token(value) {
        if (value === null || value === undefined || value === '') {
            return '-';
        }

        return String(value).replaceAll('_', ' ');
    },
}));

Alpine.data('customerQuickLookup', (seed = []) => ({
    customers: Array.isArray(seed) ? seed : [],
    query: '',
    open: false,

    get filteredCustomers() {
        const search = this.query.trim().toLowerCase();

        if (!search) {
            return this.customers.slice(0, 10);
        }

        return this.customers
            .filter((item) => {
                const name = String(item?.name ?? '').toLowerCase();
                const phone = String(item?.phone ?? '').toLowerCase();

                return name.includes(search) || phone.includes(search);
            })
            .slice(0, 12);
    },

    choose(item) {
        if (!item) {
            return;
        }

        const selectedName = String(item?.name ?? '');
        const selectedPhone = String(item?.phone ?? '');
        const selectedNotes = String(item?.notes ?? '');

        if (this.$refs.name) {
            this.$refs.name.value = selectedName;
        }

        if (this.$refs.phone) {
            this.$refs.phone.value = selectedPhone;
        }

        if (this.$refs.notes) {
            this.$refs.notes.value = selectedNotes;
        }

        this.query = `${selectedName} (${selectedPhone})`;
        this.open = false;
    },
}));

Alpine.data('webOrderFormBuilder', (payload = {}) => ({
    services: Array.isArray(payload?.services) ? payload.services : [],
    priceMap: payload?.priceMap && typeof payload.priceMap === 'object' ? payload.priceMap : {},
    initial: payload?.initial && typeof payload.initial === 'object' ? payload.initial : {},
    serviceLookup: {},
    outletId: '',
    shippingFee: '0',
    discount: '0',
    rows: [],

    init() {
        this.services.forEach((service) => {
            const key = String(service?.id ?? '');
            if (!key) {
                return;
            }

            this.serviceLookup[key] = {
                id: key,
                unit_type: String(service?.unit_type ?? ''),
                base_price_amount: Number(service?.base_price_amount ?? 0),
            };
        });

        this.outletId = String(this.initial?.outlet_id ?? '');
        this.shippingFee = String(this.initial?.shipping_fee_amount ?? '0');
        this.discount = String(this.initial?.discount_amount ?? '0');

        const initialRows = Array.isArray(this.initial?.items) ? this.initial.items : [];
        this.rows = initialRows.length > 0
            ? initialRows.map((row) => ({
                service_id: String(row?.service_id ?? ''),
                qty: this.inputToken(row?.qty),
                weight_kg: this.inputToken(row?.weight_kg),
            }))
            : [this.emptyRow()];

        if (this.rows.length === 0) {
            this.rows = [this.emptyRow()];
        }
    },

    inputToken(value) {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value);
    },

    emptyRow() {
        return {
            service_id: '',
            qty: '',
            weight_kg: '',
        };
    },

    addRow() {
        this.rows.push(this.emptyRow());
    },

    removeRow(index) {
        if (this.rows.length <= 1) {
            this.rows = [this.emptyRow()];
            return;
        }

        this.rows.splice(index, 1);
    },

    unitOf(serviceId) {
        const service = this.serviceLookup[String(serviceId)] ?? null;
        return String(service?.unit_type ?? '');
    },

    basePrice(serviceId) {
        const service = this.serviceLookup[String(serviceId)] ?? null;
        return Number(service?.base_price_amount ?? 0);
    },

    priceFor(serviceId) {
        const outletMap = this.priceMap?.[String(this.outletId)] ?? null;
        const key = String(serviceId ?? '');

        if (outletMap && Object.prototype.hasOwnProperty.call(outletMap, key)) {
            return Number(outletMap[key] ?? 0);
        }

        return this.basePrice(key);
    },

    hasOverride(serviceId) {
        const outletMap = this.priceMap?.[String(this.outletId)] ?? null;
        const key = String(serviceId ?? '');

        return Boolean(outletMap && Object.prototype.hasOwnProperty.call(outletMap, key));
    },

    numberValue(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 0;
        }

        return numeric < 0 ? 0 : numeric;
    },

    metricFor(row) {
        const unit = this.unitOf(row?.service_id);

        if (unit === 'kg') {
            return this.numberValue(row?.weight_kg);
        }

        if (unit === 'pcs') {
            return this.numberValue(row?.qty);
        }

        return 0;
    },

    lineSubtotal(row) {
        const amount = this.metricFor(row) * this.priceFor(row?.service_id);
        return Math.round(amount);
    },

    get estimatedSubtotal() {
        return this.rows.reduce((sum, row) => sum + this.lineSubtotal(row), 0);
    },

    get estimatedTotal() {
        const fee = Math.round(this.numberValue(this.shippingFee));
        const discount = Math.round(this.numberValue(this.discount));

        return Math.max(this.estimatedSubtotal + fee - discount, 0);
    },

    rowHint(row) {
        const unit = this.unitOf(row?.service_id);

        if (!unit) {
            return 'Pilih layanan terlebih dahulu.';
        }

        return unit === 'kg' ? 'Isi berat pada kolom kg.' : 'Isi jumlah pada kolom pcs.';
    },

    onServiceChanged(row) {
        const unit = this.unitOf(row?.service_id);

        if (unit === 'kg') {
            row.qty = '';
            return;
        }

        if (unit === 'pcs') {
            row.weight_kg = '';
            return;
        }

        row.qty = '';
        row.weight_kg = '';
    },

    formatCurrency(value) {
        const amount = Math.round(this.numberValue(value));
        return new Intl.NumberFormat('id-ID').format(amount);
    },
}));

Alpine.start();

window.addEventListener('load', () => {
    requestAnimationFrame(renderTrendCharts);
});
