/**
 * Parliament Talk Time Management System - Web Version
 * Main JavaScript Application
 */

// Socket.IO connection
let socket = null;

// Timer state
const timerState = {
    hours: 0,
    minutes: 0,
    seconds: 0,
    isRunning: false,
    interval: null,
    mode: 'countup' // 'countup' or 'countdown'
};

// Current member data
let currentMember = null;

// Current chairperson
let currentChairperson = null;

/**
 * Initialize the application
 */
function initApp() {
    console.log('Parliament Web App initializing...');

    // Connect to WebSocket
    connectSocket();

    // Load initial data
    loadChairpersons();

    // Setup event listeners
    setupEventListeners();

    // Update status indicator
    updateConnectionStatus(false);
}

/**
 * Connect to WebSocket server
 */
function connectSocket() {
    try {
        socket = io();

        socket.on('connect', () => {
            console.log('Connected to server');
            updateConnectionStatus(true);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            updateConnectionStatus(false);
        });

        socket.on('connected', (data) => {
            console.log('Server message:', data.status);
        });

        // Handle seat selection from UDP
        socket.on('seat_selected', (data) => {
            console.log('Seat selected:', data.seat_no);
            loadMemberData(data.seat_no);
        });

        // Handle member data response
        socket.on('member_data', (data) => {
            if (data.success) {
                updateMemberDisplay(data.data);
            } else {
                showError('Member not found');
            }
        });

        // Handle timer sync
        socket.on('timer_sync', (data) => {
            if (data.sync) {
                timerState.hours = data.hours || 0;
                timerState.minutes = data.minutes || 0;
                timerState.seconds = data.seconds || 0;
                updateTimerDisplay();
            }
        });

        // Handle chairperson update
        socket.on('chairperson_update', (data) => {
            if (data.chairperson) {
                updateChairDisplay(data.chairperson);
            }
        });

    } catch (error) {
        console.error('Socket connection error:', error);
        updateConnectionStatus(false);
    }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        if (connected) {
            statusEl.className = 'status-indicator status-connected';
            statusEl.innerHTML = '<span class="status-dot"></span> Connected';
        } else {
            statusEl.className = 'status-indicator status-disconnected';
            statusEl.innerHTML = '<span class="status-dot"></span> Disconnected';
        }
    }
}

/**
 * Load chairpersons from API
 */
async function loadChairpersons() {
    try {
        const response = await fetch('/api/chairpersons');
        const result = await response.json();

        if (result.success) {
            populateChairpersonDropdown(result.data);
        }
    } catch (error) {
        console.error('Error loading chairpersons:', error);
    }
}

/**
 * Populate chairperson dropdown
 */
function populateChairpersonDropdown(chairpersons) {
    const dropdown = document.getElementById('chairperson-select');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">Select a Chairperson</option>';

    chairpersons.forEach(chair => {
        const option = document.createElement('option');
        option.value = `${chair.position} - ${chair.name}`;
        option.textContent = `${chair.position} - ${chair.name}`;
        dropdown.appendChild(option);
    });

    // Restore previous selection from localStorage
    const saved = localStorage.getItem('selectedChairperson');
    if (saved) {
        dropdown.value = saved;
        updateChairDisplay(saved);
    }
}

/**
 * Handle chairperson selection
 */
function onChairpersonSelect(event) {
    const value = event.target.value;
    localStorage.setItem('selectedChairperson', value);
    updateChairDisplay(value);

    // Broadcast to other clients
    if (socket && socket.connected) {
        socket.emit('select_chairperson', { chairperson: value });
    }
}

/**
 * Update chair display
 */
function updateChairDisplay(chairperson) {
    const displayEl = document.getElementById('chair-display-value');
    if (displayEl) {
        displayEl.textContent = chairperson || 'No selection made';
    }
    currentChairperson = chairperson;
}

/**
 * Load member data by seat number
 */
async function loadMemberData(seatNo) {
    try {
        const response = await fetch(`/api/member/${seatNo}`);
        const result = await response.json();

        if (result.success) {
            updateMemberDisplay(result.data);
        } else {
            clearMemberDisplay();
            showNotification('Member not found for seat ' + seatNo, 'warning');
        }
    } catch (error) {
        console.error('Error loading member:', error);
        showError('Failed to load member data');
    }
}

/**
 * Update member display with data
 */
function updateMemberDisplay(member) {
    currentMember = member;

    // Update seat number
    const seatEl = document.getElementById('member-seat');
    if (seatEl) seatEl.textContent = member.seat_no || '-';

    // Update name
    const nameEl = document.getElementById('member-name');
    if (nameEl) nameEl.textContent = member.name || '-';

    // Update party
    const partyEl = document.getElementById('member-party');
    if (partyEl) partyEl.textContent = member.party || '-';

    // Update state
    const stateEl = document.getElementById('member-state');
    if (stateEl) stateEl.textContent = member.state || '-';

    // Update tenure
    const tenureEl = document.getElementById('member-tenure');
    if (tenureEl) {
        if (member.tenure_start) {
            const date = new Date(member.tenure_start);
            tenureEl.textContent = date.toLocaleDateString('en-IN');
        } else {
            tenureEl.textContent = '-';
        }
    }

    // Update photo
    const photoEl = document.getElementById('member-photo');
    const placeholderEl = document.getElementById('member-photo-placeholder');

    if (member.picture) {
        if (photoEl) {
            photoEl.src = `data:image/jpeg;base64,${member.picture}`;
            photoEl.style.display = 'block';
        }
        if (placeholderEl) placeholderEl.style.display = 'none';
    } else {
        if (photoEl) photoEl.style.display = 'none';
        if (placeholderEl) placeholderEl.style.display = 'flex';
    }

    // Add animation
    const panel = document.querySelector('.member-panel');
    if (panel) {
        panel.classList.remove('fade-in');
        void panel.offsetWidth; // Trigger reflow
        panel.classList.add('fade-in');
    }
}

/**
 * Clear member display
 */
function clearMemberDisplay() {
    currentMember = null;

    const fields = ['member-seat', 'member-name', 'member-party', 'member-state', 'member-tenure'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '-';
    });

    const photoEl = document.getElementById('member-photo');
    const placeholderEl = document.getElementById('member-photo-placeholder');

    if (photoEl) photoEl.style.display = 'none';
    if (placeholderEl) placeholderEl.style.display = 'flex';
}

/**
 * Timer Functions
 */
function startTimer() {
    if (timerState.isRunning) return;

    timerState.isRunning = true;
    timerState.interval = setInterval(() => {
        if (timerState.mode === 'countup') {
            incrementTimer();
        } else {
            decrementTimer();
        }
        updateTimerDisplay();

        // Sync with other clients
        if (socket && socket.connected) {
            socket.emit('timer_update', {
                hours: timerState.hours,
                minutes: timerState.minutes,
                seconds: timerState.seconds,
                sync: true
            });
        }
    }, 1000);

    updateTimerButtons(true);
}

function stopTimer() {
    timerState.isRunning = false;
    if (timerState.interval) {
        clearInterval(timerState.interval);
        timerState.interval = null;
    }
    updateTimerButtons(false);
}

function resetTimer() {
    stopTimer();
    timerState.hours = 0;
    timerState.minutes = timerState.mode === 'countdown' ? 3 : 0;
    timerState.seconds = 0;
    updateTimerDisplay();
}

function incrementTimer() {
    timerState.seconds++;
    if (timerState.seconds >= 60) {
        timerState.seconds = 0;
        timerState.minutes++;
        if (timerState.minutes >= 60) {
            timerState.minutes = 0;
            timerState.hours++;
        }
    }
}

function decrementTimer() {
    if (timerState.seconds > 0) {
        timerState.seconds--;
    } else if (timerState.minutes > 0) {
        timerState.minutes--;
        timerState.seconds = 59;
    } else if (timerState.hours > 0) {
        timerState.hours--;
        timerState.minutes = 59;
        timerState.seconds = 59;
    } else {
        // Timer reached zero
        stopTimer();
        showNotification('Time is up!', 'warning');
    }
}

function updateTimerDisplay() {
    const display = document.getElementById('timer-display');
    if (display) {
        const h = String(timerState.hours).padStart(2, '0');
        const m = String(timerState.minutes).padStart(2, '0');
        const s = String(timerState.seconds).padStart(2, '0');
        display.textContent = `${h}:${m}:${s}`;
    }
}

function updateTimerButtons(isRunning) {
    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');

    if (startBtn) startBtn.disabled = isRunning;
    if (stopBtn) stopBtn.disabled = !isRunning;
}

function setTimerMode(mode) {
    timerState.mode = mode;
    resetTimer();

    // Update mode buttons
    document.querySelectorAll('.timer-mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

/**
 * Manual seat input
 */
function onSeatInput(event) {
    if (event.key === 'Enter') {
        const seatNo = event.target.value.trim();
        if (seatNo && !isNaN(seatNo) && seatNo >= 1 && seatNo <= 245) {
            loadMemberData(seatNo);
        } else {
            showNotification('Please enter a valid seat number (1-245)', 'error');
        }
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Chairperson dropdown
    const chairSelect = document.getElementById('chairperson-select');
    if (chairSelect) {
        chairSelect.addEventListener('change', onChairpersonSelect);
    }

    // Timer buttons
    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');
    const resetBtn = document.getElementById('btn-reset');

    if (startBtn) startBtn.addEventListener('click', startTimer);
    if (stopBtn) stopBtn.addEventListener('click', stopTimer);
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);

    // Seat input
    const seatInput = document.getElementById('seat-input');
    if (seatInput) {
        seatInput.addEventListener('keypress', onSeatInput);
    }

    // Timer mode buttons
    document.querySelectorAll('.timer-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimerMode(btn.dataset.mode);
        });
    });
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;

    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'error' ? '#DC3545' : type === 'warning' ? '#FFC107' : '#28A745'};
        color: ${type === 'warning' ? '#333' : '#fff'};
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 1rem;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

/**
 * Show error message
 */
function showError(message) {
    showNotification(message, 'error');
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

// Export functions for global access
window.startTimer = startTimer;
window.stopTimer = stopTimer;
window.resetTimer = resetTimer;
window.loadMemberData = loadMemberData;
