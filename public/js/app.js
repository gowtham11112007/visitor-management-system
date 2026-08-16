/**
 * VISITOR MANAGEMENT SYSTEM - RECEPTIONIST CONSOLE JS
 */

// Application State
const state = {
    currentTab: 'register',
    authToken: localStorage.getItem('vms_token') || 'demo_reception_token',
    currentUser: JSON.parse(localStorage.getItem('vms_user') || '{"username": "admin", "role": "Reception Administrator"}'),
    visitors: [],
    stats: {},
    photoBase64: '',
    webcamStream: null,
    activeVisitorForPass: null
};

// Flexible Base API URL resolution
const getApiBase = () => {
    // If running on local server where /api/ is routed explicitly, use /api; otherwise relative to root
    return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '/api' : '';
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Set default expected check-out time (2 hours from now)
    selectDuration(2);

    // Initialize Auth UI State
    updateAuthUI();

    // Fetch initial stats & visitor list
    fetchStats();
    fetchVisitors();
}

// --- CONSOLE TAB SWITCHER ---
function switchTab(tabName) {
    state.currentTab = tabName;
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    if (tabName === 'register') {
        document.getElementById('view-register').classList.add('active');
        document.getElementById('tab-register').classList.add('active');
    } else if (tabName === 'log') {
        document.getElementById('view-log').classList.add('active');
        document.getElementById('tab-log').classList.add('active');
        fetchVisitors();
        fetchStats();
    }
}

// --- DURATION SELECTOR LOGIC ---
function selectDuration(hours) {
    document.querySelectorAll('.duration-btn').forEach(btn => btn.classList.remove('active'));
    
    const matchedBtn = Array.from(document.querySelectorAll('.duration-btn')).find(
        btn => btn.textContent.includes(`${hours} Hour`) || (hours === 8 && btn.textContent.includes('Full Day'))
    );
    if (matchedBtn) matchedBtn.classList.add('active');

    const now = new Date();
    now.setHours(now.getHours() + hours);

    const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    document.getElementById('expected_check_out_time').value = localIso;
}

// --- WEBCAM & PHOTO CAPTURE ---
async function startWebcam() {
    const video = document.getElementById('webcam-video');
    const placeholder = document.getElementById('photo-placeholder');
    const img = document.getElementById('captured-photo-img');

    try {
        state.webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 300, height: 300 } });
        video.srcObject = state.webcamStream;
        video.classList.remove('hidden');
        placeholder.classList.add('hidden');
        img.classList.add('hidden');

        document.getElementById('btn-webcam').classList.add('hidden');
        document.getElementById('btn-snap').classList.remove('hidden');
        document.getElementById('btn-clear-photo').classList.remove('hidden');
    } catch (err) {
        console.error('Webcam access error:', err);
        showToast('Unable to access webcam. You can upload an image file instead.', 'error');
    }
}

function snapPhoto() {
    const video = document.getElementById('webcam-video');
    const img = document.getElementById('captured-photo-img');

    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    state.photoBase64 = canvas.toDataURL('image/jpeg', 0.85);

    img.src = state.photoBase64;
    img.classList.remove('hidden');
    video.classList.add('hidden');

    stopWebcamStream();
    document.getElementById('btn-snap').classList.add('hidden');
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        state.photoBase64 = e.target.result;
        const img = document.getElementById('captured-photo-img');
        const placeholder = document.getElementById('photo-placeholder');
        
        img.src = state.photoBase64;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
        
        stopWebcamStream();
        document.getElementById('webcam-video').classList.add('hidden');
        document.getElementById('btn-clear-photo').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function clearPhoto() {
    state.photoBase64 = '';
    stopWebcamStream();
    
    document.getElementById('captured-photo-img').src = '';
    document.getElementById('captured-photo-img').classList.add('hidden');
    document.getElementById('webcam-video').classList.add('hidden');
    document.getElementById('photo-placeholder').classList.remove('hidden');
    
    document.getElementById('btn-webcam').classList.remove('hidden');
    document.getElementById('btn-snap').classList.add('hidden');
    document.getElementById('btn-clear-photo').classList.add('hidden');
    document.getElementById('photo_file').value = '';
}

function stopWebcamStream() {
    if (state.webcamStream) {
        state.webcamStream.getTracks().forEach(track => track.stop());
        state.webcamStream = null;
    }
}

// --- RECEPTIONIST VISITOR CHECK-IN SUBMISSION ---
async function handleCheckin(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('btn-checkin-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registering Visitor...';

    const payload = {
        name: document.getElementById('visitor_name').value.trim(),
        phone: document.getElementById('phone_number').value.trim(),
        email: document.getElementById('email_address').value.trim(),
        department: document.getElementById('department').value,
        host_name: document.getElementById('host_name').value.trim(),
        purpose: document.getElementById('purpose').value,
        expected_check_out_time: document.getElementById('expected_check_out_time').value,
        photo_base64: state.photoBase64
    };

    try {
        const response = await fetch(`${getApiBase()}/visitors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            showToast(`Visitor ${data.visitor.name} registered! Pass #${data.visitor.pass_number}`, 'success');
            
            // Reset Form & Photo
            document.getElementById('checkin-form').reset();
            clearPhoto();
            selectDuration(2);

            // Open Printable Visitor Pass Badge Modal
            openPassModal(data.visitor);

            // Refresh Dashboard Data
            fetchStats();
            fetchVisitors();
        } else {
            showToast(data.message || 'Registration failed. Please try again.', 'error');
        }
    } catch (err) {
        console.error('Checkin error:', err);
        showToast('Network error while registering visitor.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-check-to-slot"></i> Complete Check-in & Generate Pass';
    }
}

// --- GET VISITORS & VISITOR TRACKING TABLE ---
async function fetchVisitors() {
    const tableBody = document.getElementById('visitors-table-body');
    
    const search = document.getElementById('filter-search').value.trim();
    const status = document.getElementById('filter-status').value;
    const department = document.getElementById('filter-department').value;
    const date = document.getElementById('filter-date').value;

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status !== 'all') params.append('status', status);
    if (department !== 'all') params.append('department', department);
    if (date) params.append('date', date);

    try {
        const response = await fetch(`${getApiBase()}/visitors?${params.toString()}`);
        const data = await response.json();

        if (response.ok) {
            state.visitors = data;
            renderVisitorsTable(data);
        } else {
            tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">Error loading visitors: ${data.message}</td></tr>`;
        }
    } catch (err) {
        console.error('Fetch visitors error:', err);
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">Failed to connect to backend server.</td></tr>`;
    }
}

function renderVisitorsTable(visitors) {
    const tableBody = document.getElementById('visitors-table-body');
    if (!visitors || visitors.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4 text-muted">
                    <i class="fa-solid fa-folder-open" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                    No visitor records found. Click "Add Sample Data" or register a visitor above.
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = visitors.map(v => {
        const isCheckedIn = v.status === 'checked_in';
        let statusBadge = isCheckedIn
            ? (v.is_overdue ? '<span class="badge-status badge-overdue">OVERDUE</span>' : '<span class="badge-status badge-checked-in">CHECKED-IN</span>')
            : '<span class="badge-status badge-checked-out">CHECKED-OUT</span>';

        const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
        const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

        return `
            <tr>
                <td><span class="pass-badge-code">${escapeHtml(v.pass_number)}</span></td>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(v.name)}</div>
                </td>
                <td>
                    <div>${escapeHtml(v.phone)}</div>
                    ${v.email ? `<div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(v.email)}</div>` : ''}
                </td>
                <td>
                    <div style="font-weight: 500;">${escapeHtml(v.host_name)}</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(v.department)}</div>
                </td>
                <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(v.purpose)}</span></td>
                <td>
                    <div>${formatTime(v.check_in_time_iso)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(v.check_in_time_iso)}</div>
                </td>
                <td>
                    <div>${formatTime(v.expected_check_out_time_iso)}</div>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div class="table-actions">
                        ${isCheckedIn ? `
                            <button class="btn btn-outline btn-sm btn-danger" onclick="checkoutVisitor(${v.id})" title="Mark Check-out">
                                <i class="fa-solid fa-right-from-bracket"></i> Check Out
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-sm" onclick="viewPassModal(${v.id})" title="View Pass">
                            <i class="fa-solid fa-id-card"></i> Pass
                        </button>
                        <button class="btn btn-outline btn-sm btn-danger" onclick="deleteVisitorRecord(${v.id})" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// --- CHECK-OUT VISITOR ACTION ---
async function checkoutVisitor(id) {
    try {
        const response = await fetch(`${getApiBase()}/visitors/${id}/checkout`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (response.ok) {
            showToast(`Visitor ${data.visitor.name} checked out successfully!`, 'success');
            fetchVisitors();
            fetchStats();
        } else {
            showToast(data.message || 'Checkout failed', 'error');
        }
    } catch (err) {
        console.error('Checkout error:', err);
        showToast('Network error during checkout action.', 'error');
    }
}

// --- DELETE VISITOR RECORD ---
async function deleteVisitorRecord(id) {
    if (!confirm('Are you sure you want to delete this visitor record permanently?')) return;

    try {
        const response = await fetch(`${getApiBase()}/visitors/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (response.ok) {
            showToast('Visitor record deleted.', 'success');
            fetchVisitors();
            fetchStats();
        } else {
            showToast(data.message || 'Delete failed', 'error');
        }
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Network error during delete action.', 'error');
    }
}

// --- FETCH METRICS SUMMARY STATS ---
async function fetchStats() {
    try {
        const response = await fetch(`${getApiBase()}/stats`);
        const data = await response.json();

        if (response.ok) {
            state.stats = data;
            document.getElementById('stat-total-today').textContent = data.total_today || 0;
            document.getElementById('stat-currently-in').textContent = data.currently_checked_in || 0;
            document.getElementById('stat-checked-out').textContent = data.checked_out_today || 0;
            document.getElementById('stat-overdue').textContent = data.overdue_count || 0;

            document.getElementById('nav-active-badge').textContent = data.currently_checked_in || 0;
        }
    } catch (err) {
        console.error('Fetch stats error:', err);
    }
}

// --- SEED SAMPLE DEMO DATA ---
async function seedDemoData() {
    try {
        const response = await fetch(`${getApiBase()}/seed`, { method: 'POST' });
        const data = await response.json();
        if (response.ok) {
            showToast(data.message, 'success');
            fetchVisitors();
            fetchStats();
        } else {
            showToast(data.message || 'Failed to seed data', 'error');
        }
    } catch (err) {
        showToast('Error seeding sample data', 'error');
    }
}

function resetFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-status').value = 'all';
    document.getElementById('filter-department').value = 'all';
    document.getElementById('filter-date').value = '';
    fetchVisitors();
}

// --- PASS MODAL & QR CODE GENERATOR ---
function openPassModal(visitor) {
    state.activeVisitorForPass = visitor;

    document.getElementById('pass-visitor-name').textContent = visitor.name;
    document.getElementById('pass-number-text').textContent = visitor.pass_number;
    document.getElementById('pass-host-text').textContent = visitor.host_name;
    document.getElementById('pass-dept-text').textContent = visitor.department;
    document.getElementById('pass-purpose-text').textContent = visitor.purpose;

    const checkInDate = visitor.check_in_time_iso ? new Date(visitor.check_in_time_iso) : new Date();
    document.getElementById('pass-checkin-text').textContent = checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const passPill = document.getElementById('pass-status-pill');
    if (visitor.status === 'checked_in') {
        passPill.className = 'badge-status badge-checked-in';
        passPill.textContent = 'CHECKED-IN';
    } else {
        passPill.className = 'badge-status badge-checked-out';
        passPill.textContent = 'CHECKED-OUT';
    }

    const photoImg = document.getElementById('pass-photo');
    const photoPlaceholder = document.getElementById('pass-photo-placeholder');
    if (visitor.photo_base64) {
        photoImg.src = visitor.photo_base64;
        photoImg.classList.remove('hidden');
        photoPlaceholder.classList.add('hidden');
    } else {
        photoImg.src = '';
        photoImg.classList.add('hidden');
        photoPlaceholder.classList.remove('hidden');
    }

    generateQRCodeSVG(visitor.pass_number, 'qr-code-svg');

    document.getElementById('modal-pass').classList.remove('hidden');
}

function viewPassModal(id) {
    const v = state.visitors.find(item => item.id === id);
    if (v) openPassModal(v);
}

function printPass() {
    window.print();
}

function generateQRCodeSVG(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }

    const size = 21;
    let rects = '';
    
    const isPositionFinder = (r, c) => {
        if (r < 7 && c < 7) return true;
        if (r < 7 && c >= size - 7) return true;
        if (r >= size - 7 && c < 7) return true;
        return false;
    };

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            let isBlack = false;
            if (isPositionFinder(r, c)) {
                const inOuter = (r === 0 || r === 6 || c === 0 || c === 6 || r === size - 1 || r === size - 7 || c === size - 1 || c === size - 7);
                const inInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
                                (r >= 2 && r <= 4 && c >= size - 5 && c <= size - 3) ||
                                (r >= size - 5 && r <= size - 3 && c >= 2 && c <= 4);
                isBlack = inOuter || inInner;
            } else {
                const bitVal = Math.abs((hash ^ (r * 31 + c * 17)) % 3);
                isBlack = bitVal === 0;
            }

            if (isBlack) {
                rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#000000"/>`;
            }
        }
    }

    container.innerHTML = `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="width: 64px; height: 64px;">${rects}</svg>`;
}

// --- AUTHENTICATION ---
function openLoginModal() {
    document.getElementById('modal-login').classList.remove('hidden');
    document.getElementById('login-error').classList.add('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    stopWebcamStream();
}

async function handleLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value.trim();
    const errorBox = document.getElementById('login-error');

    errorBox.classList.add('hidden');

    try {
        const response = await fetch(`${getApiBase()}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await response.json();

        if (response.ok) {
            state.authToken = data.token;
            state.currentUser = data.user;

            localStorage.setItem('vms_token', data.token);
            localStorage.setItem('vms_user', JSON.stringify(data.user));

            updateAuthUI();
            closeModal('modal-login');
            showToast('Welcome back, Receptionist!', 'success');
        } else {
            errorBox.textContent = data.message || 'Invalid credentials.';
            errorBox.classList.remove('hidden');
        }
    } catch (err) {
        errorBox.textContent = 'Server connection error.';
        errorBox.classList.remove('hidden');
    }
}

function handleLogout() {
    state.authToken = null;
    state.currentUser = null;
    localStorage.removeItem('vms_token');
    localStorage.removeItem('vms_user');

    updateAuthUI();
    showToast('Logged out.', 'success');
}

function updateAuthUI() {
    const authStatus = document.getElementById('auth-status');
    const displayName = document.getElementById('user-display-name');
    const loginBtn = document.getElementById('btn-login-modal');
    const logoutBtn = document.getElementById('btn-logout');

    if (state.authToken && state.currentUser) {
        authStatus.className = 'auth-pill admin';
        displayName.textContent = `${state.currentUser.username} (${state.currentUser.role || 'Reception Console'})`;
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        authStatus.className = 'auth-pill guest';
        displayName.textContent = 'Guest Mode';
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
    }
}

// --- TOAST NOTIFICATIONS & SANITIZATION ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
