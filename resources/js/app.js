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

const enhanceResponsiveTables = () => {
    document.querySelectorAll('.table-wrap table').forEach((table) => {
        const headers = [...table.querySelectorAll('thead th')].map((header) =>
            header.textContent
                ?.replace(/\s+/g, ' ')
                .trim() ?? '',
        );

        table.querySelectorAll('tbody tr').forEach((row) => {
            const cells = [...row.children].filter((cell) => ['TD', 'TH'].includes(cell.tagName));
            const inlineRowHeader = cells.length === 2 && cells[0]?.tagName === 'TH'
                ? cells[0].textContent?.replace(/\s+/g, ' ').trim() ?? ''
                : '';

            if (inlineRowHeader && cells[0]?.tagName === 'TH') {
                cells[0].setAttribute('data-mobile-hidden', '1');
            }

            cells.forEach((cell, index) => {
                if (cell.hasAttribute('data-cell-label')) {
                    return;
                }

                const onlySpanningCell = cells.length === 1 && Number(cell.getAttribute('colspan') ?? '1') > 1;
                const label = onlySpanningCell
                    ? ''
                    : headers[index] || (cell.tagName === 'TD' ? inlineRowHeader : '');

                cell.setAttribute('data-cell-label', label);
            });
        });
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
        requestAnimationFrame(enhanceResponsiveTables);

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
            requestAnimationFrame(enhanceResponsiveTables);
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

Alpine.start();

window.addEventListener('load', () => {
    requestAnimationFrame(renderTrendCharts);
    requestAnimationFrame(enhanceResponsiveTables);
});
