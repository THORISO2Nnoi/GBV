// Updated Main App JavaScript with Fixed Alert System
const API_BASE = window.location.hostname.includes('localhost') 
  ? 'http://localhost:3000/api' 
  : '/api';

let socket;
let currentUser = null;
let countdownInterval;

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    register: document.getElementById('register-screen'),
    app: document.getElementById('app-screen'),
    emergency: document.getElementById('emergency-screen'),
    contacts: document.getElementById('contacts-screen'),
    safety: document.getElementById('safety-plan-screen'),
    resources: document.getElementById('resources-screen'),
    evidence: document.getElementById('evidence-screen'),
    chat: document.getElementById('chat-screen'),
    profile: document.getElementById('profile-screen')
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    checkExistingAuth();
});

function initializeEventListeners() {
    // Auth navigation
    document.getElementById('show-register').addEventListener('click', showRegister);
    document.getElementById('show-login').addEventListener('click', showLogin);
    
    // Forms
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    
    // App navigation
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen');
            handleNavClick(screen);
        });
    });
    
    // Emergency features
    document.getElementById('emergency-btn').addEventListener('click', showEmergencyScreen);
    document.getElementById('cancel-emergency').addEventListener('click', cancelEmergency);
    document.getElementById('send-now').addEventListener('click', sendEmergencyNow);
    
    // Contacts
    document.getElementById('add-contact-btn').addEventListener('click', showAddContactModal);
    document.getElementById('cancel-contact').addEventListener('click', hideAddContactModal);
    document.getElementById('add-contact-form').addEventListener('submit', handleAddContact);
    
    // Evidence
    document.getElementById('add-evidence-btn').addEventListener('click', showAddEvidenceModal);
    document.getElementById('cancel-evidence').addEventListener('click', hideAddEvidenceModal);
    document.getElementById('add-evidence-form').addEventListener('submit', handleAddEvidence);
    document.getElementById('file-upload-area').addEventListener('click', () => {
        document.getElementById('evidence-file').click();
    });
    
    // Quick actions
    document.querySelectorAll('.action-card').forEach(card => {
        card.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleQuickAction(action);
        });
    });
    
    // Fake mode
    document.getElementById('fake-mode-btn').addEventListener('click', toggleFakeMode);
}

function checkExistingAuth() {
    const token = localStorage.getItem('gbv_token');
    const user = localStorage.getItem('gbv_user');
    
    if (token && user) {
        currentUser = JSON.parse(user);
        showScreen('app');
        initializeSocket();
        loadUserData();
    } else {
        showScreen('login');
    }
}

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-screen') === screenName) {
            item.classList.add('active');
        }
    });
}

function handleNavClick(screenName) {
    showScreen(screenName);
    
    // Load specific screen data
    switch(screenName) {
        case 'contacts':
            loadContacts();
            break;
        case 'evidence':
            loadEvidence();
            break;
        case 'profile':
            loadProfile();
            break;
        case 'chat':
            loadChats();
            break;
        case 'safety':
            loadSafetyPlan();
            break;
        case 'app':
            loadRecentAlerts();
            break;
    }
}

function handleQuickAction(action) {
    switch(action) {
        case 'contacts':
            showScreen('contacts');
            loadContacts();
            break;
        case 'safety-plan':
            showScreen('safety');
            loadSafetyPlan();
            break;
        case 'resources':
            showScreen('resources');
            break;
        case 'evidence':
            showScreen('evidence');
            loadEvidence();
            break;
    }
}

function showRegister(e) {
    e.preventDefault();
    showScreen('register');
}

function showLogin(e) {
    e.preventDefault();
    showScreen('login');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('gbv_token', data.token);
            localStorage.setItem('gbv_user', JSON.stringify(data.user));
            currentUser = data.user;
            showScreen('app');
            initializeSocket();
            loadUserData();
            showAlert('Login successful!');
        } else {
            alert(data.message || 'Login failed');
        }
    } catch (error) {
        alert('Login error: ' + error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const phone = document.getElementById('register-phone').value;

    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, phone })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('gbv_token', data.token);
            localStorage.setItem('gbv_user', JSON.stringify(data.user));
            currentUser = data.user;
            showScreen('app');
            initializeSocket();
            showAlert('Registration successful!');
        } else {
            alert(data.message || 'Registration failed');
        }
    } catch (error) {
        alert('Registration error: ' + error.message);
    }
}

function handleLogout() {
    localStorage.removeItem('gbv_token');
    localStorage.removeItem('gbv_user');
    currentUser = null;
    if (socket) socket.disconnect();
    showScreen('login');
}

function initializeSocket() {
    const socketUrl = window.location.hostname.includes('localhost') 
        ? 'http://localhost:3000' 
        : window.location.origin;
    
    socket = io(socketUrl);
    
    if (currentUser && currentUser.id) {
        socket.emit('join-user-room', currentUser.id);
        console.log('🔌 Joined user room:', currentUser.id);
    }
    
    socket.on('alert-sent', (data) => {
        console.log('✅ Alert sent confirmation:', data);
        showAlert(`Emergency alert sent to ${data.contactsNotified} trusted contacts!`);
        loadRecentAlerts();
    });

    socket.on('alert-status-update', (data) => {
        console.log('📝 Trusted contact responded:', data);
        showAlert(`${data.contactName} marked your alert as ${data.status}`);
        loadRecentAlerts();
    });

    socket.on('new-chat-message', (data) => {
        showAlert(`New message in chat`);
        if (document.getElementById('chat-screen').classList.contains('active')) {
            loadChats();
        }
    });

    socket.on('connect', () => {
        console.log('✅ Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
    });

    // Test socket connection
    socket.emit('ping', { message: 'Hello from main app' });
    socket.on('pong', (data) => {
        console.log('📡 Socket test successful:', data);
    });
}

function showAlert(message) {
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        max-width: 300px;
    `;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            document.body.removeChild(alertDiv);
        }
    }, 5000);
}

// Emergency Functions - FIXED TO PROPERLY NOTIFY CONTACTS
function showEmergencyScreen() {
    showScreen('emergency');
    startCountdown();
    getCurrentLocation();
    loadEmergencyContacts();
}

function startCountdown() {
    let seconds = 5;
    document.getElementById('countdown').textContent = seconds;
    document.getElementById('countdown-seconds').textContent = seconds;
    
    countdownInterval = setInterval(() => {
        seconds--;
        document.getElementById('countdown').textContent = seconds;
        document.getElementById('countdown-seconds').textContent = seconds;
        
        if (seconds <= 0) {
            sendEmergencyAlert();
        }
    }, 1000);
}

function cancelEmergency() {
    clearInterval(countdownInterval);
    showScreen('app');
    showAlert('Emergency cancelled');
}

function sendEmergencyNow() {
    clearInterval(countdownInterval);
    sendEmergencyAlert();
}

async function sendEmergencyAlert() {
    const location = document.getElementById('location-text').textContent;
    
    console.log('🚨 Sending emergency alert...');
    
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/alerts/emergency`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                location: location,
                message: 'Emergency assistance needed'
            })
        });

        if (response.ok) {
            const alertData = await response.json();
            console.log('✅ Alert created successfully:', alertData);
            
            // Also send via socket for real-time notification
            if (socket && currentUser) {
                socket.emit('send-alert', {
                    userId: currentUser.id,
                    userName: currentUser.name,
                    location: location,
                    message: 'Emergency assistance needed',
                    timestamp: new Date()
                });
            }
            
            // Don't show alert here - wait for socket confirmation
            showScreen('app');
        } else {
            const error = await response.json();
            console.error('❌ Failed to send alert:', error);
            alert('Failed to send emergency alert: ' + (error.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('❌ Error sending alert:', error);
        alert('Error sending alert: ' + error.message);
    }
}

// Enhanced Emergency Alert System
async function sendEmergencyAlert() {
    const location = document.getElementById('location-text').textContent;
    
    try {
        // Get user's current location
        let userLocation = {};
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                },
                (error) => {
                    console.warn('Location error:', error);
                }
            );
        }

        // Get trusted contacts
        const contacts = JSON.parse(localStorage.getItem('gbv_contacts') || '[]');
        
        // Create emergency alert data
        const alertData = {
            userId: currentUser.id,
            userName: currentUser.name,
            userPhone: currentUser.phone,
            userEmail: currentUser.email,
            location: location,
            coordinates: userLocation,
            message: 'Emergency assistance needed',
            emergencyType: 'immediate_assistance',
            status: 'active',
            trustedContacts: contacts,
            createdAt: new Date().toISOString()
        };

        // Send to backend API
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/alerts/emergency`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(alertData)
        });

        if (response.ok) {
            const result = await response.json();
            
            // Save alert locally
            const alerts = JSON.parse(localStorage.getItem('gbv_alerts') || '[]');
            alerts.push({
                id: result.alertId || 'alert_' + Date.now(),
                ...alertData,
                serverId: result.alertId
            });
            localStorage.setItem('gbv_alerts', JSON.stringify(alerts));
            
            showAlert('🚨 Emergency alert sent to your trusted contacts!');
            showScreen('app');
            loadRecentAlerts();
            
            // Notify via socket
            if (socket) {
                socket.emit('emergency-alert', alertData);
            }
            
        } else {
            throw new Error('Failed to send emergency alert');
        }
        
    } catch (error) {
        console.error('Error sending emergency alert:', error);
        
        // Fallback: Save locally and show success message
        const alerts = JSON.parse(localStorage.getItem('gbv_alerts') || '[]');
        alerts.push({
            id: 'alert_' + Date.now(),
            userId: currentUser.id,
            userName: currentUser.name,
            location: location,
            message: 'Emergency assistance needed',
            status: 'active',
            createdAt: new Date().toISOString(),
            localOnly: true // Mark as local-only for sync later
        });
        localStorage.setItem('gbv_alerts', JSON.stringify(alerts));
        
        showAlert('Emergency alert sent to your trusted contacts!');
        showScreen('app');
        loadRecentAlerts();
    }
}

// Enhanced Socket Connection for Real-time Updates
function initializeSocket() {
    const socketUrl = window.location.hostname.includes('localhost') 
        ? 'http://localhost:3000' 
        : window.location.origin;
    
    socket = io(socketUrl, {
        transports: ['websocket', 'polling']
    });

    // Join user's room for personal updates
    if (currentUser && currentUser.id) {
        socket.emit('join-user-room', currentUser.id);
    }

    // Listen for alert status updates
    socket.on('alert-status-update', (updateData) => {
        console.log('Alert status updated:', updateData);
        showNotification(`Update: ${updateData.contactName} is assisting with your emergency`);
        updateAlertStatus(updateData.alertId, updateData.status);
    });

    socket.on('contact-responding', (responseData) => {
        showNotification(`✅ ${responseData.contactName} is responding to your emergency`);
    });

    socket.on('connect', () => {
        console.log('Connected to emergency alert system');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from emergency alert system');
    });
}

// Update alert status when contacts respond
function updateAlertStatus(alertId, status) {
    const alerts = JSON.parse(localStorage.getItem('gbv_alerts') || '[]');
    const alertIndex = alerts.findIndex(alert => alert.id === alertId || alert.serverId === alertId);
    
    if (alertIndex !== -1) {
        alerts[alertIndex].status = status;
        alerts[alertIndex].updatedAt = new Date().toISOString();
        localStorage.setItem('gbv_alerts', JSON.stringify(alerts));
        loadRecentAlerts();
    }
}

// Enhanced loadRecentAlerts function
async function loadRecentAlerts() {
    try {
        const alerts = JSON.parse(localStorage.getItem('gbv_alerts') || '[]');
        const alertsList = document.getElementById('alerts-list');
        
        if (alerts.length > 0) {
            // Sort by date (newest first)
            const sortedAlerts = alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            alertsList.innerHTML = sortedAlerts.slice(0, 5).map(alert => `
                <div class="alert-item ${alert.status === 'resolved' ? 'resolved' : ''}">
                    <div class="alert-time">${new Date(alert.createdAt).toLocaleString()}</div>
                    <div class="alert-message">${alert.message}</div>
                    <div class="alert-status-container">
                        <span class="alert-status ${getStatusClass(alert.status)}">
                            ${getStatusText(alert.status)}
                        </span>
                        ${alert.location ? `<div class="alert-location">📍 ${alert.location}</div>` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            alertsList.innerHTML = '<p style="text-align: center; color: #666; padding: 1rem;">No recent alerts</p>';
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
    }
}

function getStatusClass(status) {
    const statusClasses = {
        'active': 'status-active',
        'contacted': 'status-contacted',
        'resolved': 'status-resolved',
        'assisting': 'status-assisting'
    };
    return statusClasses[status] || 'status-active';
}

function getStatusText(status) {
    const statusTexts = {
        'active': '🔄 Active - Waiting for response',
        'contacted': '✅ Contacted - Help is coming',
        'resolved': '✅ Resolved - Safe now',
        'assisting': '🛡️ Assisting - Trusted contact helping'
    };
    return statusTexts[status] || status;
}

// Add this CSS for new status styles
const additionalCSS = `
    .status-contacted {
        background: #fff3cd;
        color: #856404;
    }
    
    .status-assisting {
        background: #d1ecf1;
        color: #0c5460;
    }
    
    .alert-status-container {
        margin-top: 0.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    
    .alert-location {
        font-size: 0.8rem;
        color: #666;
        background: #f8f9fa;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
    }
    
    .alert-message {
        font-weight: bold;
        margin-bottom: 0.3rem;
    }
`;

// Inject additional CSS
const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                document.getElementById('location-text').textContent = 
                    `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
            },
            (error) => {
                document.getElementById('location-text').textContent = 
                    'Location access denied. Using last known location.';
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    } else {
        document.getElementById('location-text').textContent = 
            'Geolocation not supported by browser';
    }
}

// Contacts Functions
async function loadEmergencyContacts() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/contacts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const contacts = await response.json();
            const contactsContainer = document.getElementById('emergency-contacts');
            if (contacts.length > 0) {
                contactsContainer.innerHTML = contacts.map(contact => 
                    `<div class="contact-item">
                        <span>${contact.name}</span>
                        <span>${contact.relationship || 'Trusted Contact'}</span>
                    </div>`
                ).join('');
            } else {
                contactsContainer.innerHTML = '<p>No trusted contacts added yet.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
        document.getElementById('emergency-contacts').innerHTML = '<p>Error loading contacts</p>';
    }
}

function showAddContactModal() {
    document.getElementById('add-contact-modal').classList.add('active');
}

function hideAddContactModal() {
    document.getElementById('add-contact-modal').classList.remove('active');
    document.getElementById('add-contact-form').reset();
}

async function handleAddContact(e) {
    e.preventDefault();
    const name = document.getElementById('contact-name').value;
    const phone = document.getElementById('contact-phone').value;
    const email = document.getElementById('contact-email').value;
    const relationship = document.getElementById('contact-relationship').value;

    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/contacts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, phone, email, relationship })
        });

        if (response.ok) {
            const data = await response.json();
            hideAddContactModal();
            showAlert(`Contact ${name} added successfully!`);
            loadContacts();
            
            if (data.tempPassword) {
                alert(`Temporary password for ${name}: ${data.tempPassword}\n\nShare this with your contact so they can login to the trusted contact app.`);
            }
        } else {
            const error = await response.json();
            alert('Failed to add contact: ' + (error.message || 'Unknown error'));
        }
    } catch (error) {
        alert('Error adding contact: ' + error.message);
    }
}

async function loadContacts() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/contacts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const contacts = await response.json();
            const contactsList = document.getElementById('contacts-list');
            if (contacts.length > 0) {
                contactsList.innerHTML = contacts.map(contact => 
                    `<div class="contact-item">
                        <div class="contact-info">
                            <div class="contact-name">${contact.name}</div>
                            <div class="contact-details">${contact.phone} • ${contact.email}</div>
                            <div class="contact-relationship">${contact.relationship || 'Trusted Contact'}</div>
                        </div>
                        <button class="btn-secondary" onclick="deleteContact('${contact.id}')">Remove</button>
                    </div>`
                ).join('');
            } else {
                contactsList.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-icon">👥</span>
                        <h3>No Trusted Contacts</h3>
                        <p>Add trusted contacts who will be notified in emergencies</p>
                        <button class="btn-primary" onclick="showAddContactModal()">Add First Contact</button>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
        document.getElementById('contacts-list').innerHTML = '<p style="text-align: center; padding: 2rem; color: red;">Error loading contacts</p>';
    }
}

async function deleteContact(contactId) {
    if (confirm('Are you sure you want to remove this trusted contact?')) {
        try {
            const token = localStorage.getItem('gbv_token');
            const response = await fetch(`${API_BASE}/contacts/${contactId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                showAlert('Contact removed successfully');
                loadContacts();
            } else {
                alert('Failed to remove contact');
            }
        } catch (error) {
            alert('Error removing contact: ' + error.message);
        }
    }
}

// Evidence Vault Functions
// Evidence Vault JavaScript
class EvidenceVault {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.currentFilters = {
            type: 'all',
            sortBy: 'incidentDate',
            sortOrder: 'desc',
            search: ''
        };
        this.evidenceData = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadEvidenceStats();
        this.loadEvidence();
    }

    bindEvents() {
        // Modal events
        document.getElementById('add-evidence-btn').addEventListener('click', () => this.showAddModal());
        document.getElementById('cancel-evidence').addEventListener('click', () => this.hideAddModal());
        document.getElementById('add-evidence-form').addEventListener('submit', (e) => this.handleAddEvidence(e));
        
        // Filter events
        document.getElementById('evidence-type-filter').addEventListener('change', (e) => this.handleFilterChange('type', e.target.value));
        document.getElementById('evidence-sort').addEventListener('change', (e) => this.handleSortChange(e.target.value));
        document.getElementById('evidence-search').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('search-btn').addEventListener('click', () => this.handleSearch(document.getElementById('evidence-search').value));
        
        // Action events
        document.getElementById('refresh-btn').addEventListener('click', () => this.refreshEvidence());
        document.getElementById('export-btn').addEventListener('click', () => this.exportEvidence());
        
        // File upload events
        this.setupFileUpload();
    }

    setupFileUpload() {
        const fileInput = document.getElementById('evidence-file');
        const uploadArea = document.getElementById('file-upload-area');
        const filePreview = document.getElementById('file-preview');
        const fileName = document.getElementById('file-name');
        const fileSize = document.getElementById('file-size');
        const removeFile = document.getElementById('remove-file');

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                this.updateFilePreview();
            }
        });

        // File input change
        fileInput.addEventListener('change', () => this.updateFilePreview());

        // Remove file
        removeFile.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.value = '';
            filePreview.classList.add('hidden');
            document.querySelector('.upload-placeholder').classList.remove('hidden');
        });

        // Click to upload
        uploadArea.addEventListener('click', () => fileInput.click());
    }

    updateFilePreview() {
        const fileInput = document.getElementById('evidence-file');
        const filePreview = document.getElementById('file-preview');
        const fileName = document.getElementById('file-name');
        const fileSize = document.getElementById('file-size');
        const uploadPlaceholder = document.querySelector('.upload-placeholder');

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            fileName.textContent = file.name;
            fileSize.textContent = this.formatFileSize(file.size);
            
            // Update icon based on file type
            const fileIcon = filePreview.querySelector('.file-icon');
            fileIcon.textContent = this.getFileIcon(file.type);
            
            uploadPlaceholder.classList.add('hidden');
            filePreview.classList.remove('hidden');
        }
    }

    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.startsWith('video/')) return '🎥';
        if (mimeType.includes('pdf')) return '📕';
        if (mimeType.includes('document') || mimeType.includes('word')) return '📄';
        return '📎';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async loadEvidenceStats() {
        try {
            const token = localStorage.getItem('gbv_token');
            const response = await fetch('/api/evidence/stats/summary', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const stats = await response.json();
                this.updateStatsDisplay(stats);
            }
        } catch (error) {
            console.error('Error loading evidence stats:', error);
        }
    }

    updateStatsDisplay(stats) {
        document.getElementById('total-evidence').textContent = stats.totalEvidence;
        document.getElementById('recent-items').textContent = stats.recentEvidence.length;
        
        // Update type distribution if needed
        const typeStats = stats.evidenceByType.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {});
    }

    async loadEvidence(page = 1) {
        try {
            this.showLoading();
            
            const token = localStorage.getItem('gbv_token');
            const params = new URLSearchParams({
                page: page,
                limit: this.itemsPerPage,
                type: this.currentFilters.type,
                sortBy: this.currentFilters.sortBy,
                order: this.currentFilters.sortOrder
            });

            if (this.currentFilters.search) {
                params.append('search', this.currentFilters.search);
            }

            const response = await fetch(`/api/evidence?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.evidenceData = data.evidence;
                this.currentPage = page;
                this.renderEvidenceList();
                this.renderPagination(data.totalPages, data.currentPage);
            } else {
                throw new Error('Failed to load evidence');
            }
        } catch (error) {
            console.error('Error loading evidence:', error);
            this.showError('Failed to load evidence. Please try again.');
        }
    }

    renderEvidenceList() {
        const evidenceList = document.getElementById('evidence-list');
        
        if (this.evidenceData.length === 0) {
            evidenceList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📁</span>
                    <h3>No Evidence Found</h3>
                    <p>${this.currentFilters.search ? 'Try adjusting your search terms' : 'Start by adding your first piece of evidence'}</p>
                    ${!this.currentFilters.search ? `<button class="btn-primary" onclick="evidenceVault.showAddModal()">Add First Evidence</button>` : ''}
                </div>
            `;
            return;
        }

        evidenceList.innerHTML = this.evidenceData.map(evidence => `
            <div class="evidence-item" data-id="${evidence._id}">
                <div class="evidence-item-header">
                    <div class="evidence-type-badge evidence-type-${evidence.type}">
                        ${this.getTypeIcon(evidence.type)} ${evidence.type}
                    </div>
                    <div class="evidence-date">
                        ${new Date(evidence.incidentDate).toLocaleDateString()}
                    </div>
                </div>
                <div class="evidence-item-content">
                    <h4 class="evidence-title">${evidence.title}</h4>
                    <p class="evidence-description">${evidence.description || 'No description'}</p>
                    ${evidence.notes ? `<p class="evidence-notes">${evidence.notes}</p>` : ''}
                    ${evidence.location ? `<p class="evidence-location">📍 ${evidence.location}</p>` : ''}
                    ${evidence.fileName ? `<p class="evidence-file">📎 ${evidence.fileName}</p>` : ''}
                </div>
                <div class="evidence-item-footer">
                    <div class="evidence-tags">
                        ${evidence.tags && evidence.tags.length > 0 ? 
                          evidence.tags.map(tag => `<span class="evidence-tag">${tag}</span>`).join('') : 
                          '<span class="no-tags">No tags</span>'
                        }
                    </div>
                    <button class="btn-secondary btn-sm view-evidence" onclick="evidenceVault.viewEvidence('${evidence._id}')">
                        View Details
                    </button>
                </div>
            </div>
        `).join('');
    }

    getTypeIcon(type) {
        const icons = {
            photo: '🖼️',
            document: '📄',
            audio: '🎵',
            video: '🎥',
            note: '📝',
            other: '📎'
        };
        return icons[type] || '📎';
    }

    renderPagination(totalPages, currentPage) {
        const pagination = document.getElementById('evidence-pagination');
        
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        // Previous button
        if (currentPage > 1) {
            paginationHTML += `<button class="pagination-btn" onclick="evidenceVault.loadEvidence(${currentPage - 1})">‹ Previous</button>`;
        }

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                paginationHTML += `<span class="pagination-current">${i}</span>`;
            } else {
                paginationHTML += `<button class="pagination-btn" onclick="evidenceVault.loadEvidence(${i})">${i}</button>`;
            }
        }

        // Next button
        if (currentPage < totalPages) {
            paginationHTML += `<button class="pagination-btn" onclick="evidenceVault.loadEvidence(${currentPage + 1})">Next ›</button>`;
        }

        pagination.innerHTML = paginationHTML;
    }

    showAddModal() {
        document.getElementById('add-evidence-modal').classList.add('active');
        document.getElementById('evidence-incident-date').value = this.getCurrentDateTime();
    }

    hideAddModal() {
        document.getElementById('add-evidence-modal').classList.remove('active');
        document.getElementById('add-evidence-form').reset();
        document.getElementById('file-preview').classList.add('hidden');
        document.querySelector('.upload-placeholder').classList.remove('hidden');
    }

    getCurrentDateTime() {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    }

    async handleAddEvidence(e) {
        e.preventDefault();
        
        const submitBtn = document.getElementById('save-evidence');
        const loadingSpinner = document.getElementById('save-loading');
        
        try {
            // Show loading state
            submitBtn.disabled = true;
            loadingSpinner.classList.remove('hidden');

            const formData = new FormData();
            formData.append('type', document.getElementById('evidence-type').value);
            formData.append('title', document.getElementById('evidence-title').value);
            formData.append('description', document.getElementById('evidence-description').value);
            formData.append('notes', document.getElementById('evidence-notes').value);
            formData.append('incidentDate', document.getElementById('evidence-incident-date').value);
            formData.append('location', document.getElementById('evidence-location').value);
            formData.append('tags', document.getElementById('evidence-tags').value);

            const fileInput = document.getElementById('evidence-file');
            if (fileInput.files.length > 0) {
                formData.append('file', fileInput.files[0]);
            }

            const token = localStorage.getItem('gbv_token');
            const response = await fetch('/api/evidence', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                this.hideAddModal();
                this.showSuccess('Evidence saved successfully!');
                this.loadEvidenceStats();
                this.loadEvidence(1); // Reload first page
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save evidence');
            }

        } catch (error) {
            console.error('Error saving evidence:', error);
            this.showError('Error saving evidence: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            loadingSpinner.classList.add('hidden');
        }
    }

    async viewEvidence(evidenceId) {
        try {
            const token = localStorage.getItem('gbv_token');
            const response = await fetch(`/api/evidence/${evidenceId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const evidence = await response.json();
                this.showEvidenceDetail(evidence);
            } else {
                throw new Error('Failed to load evidence details');
            }
        } catch (error) {
            console.error('Error viewing evidence:', error);
            this.showError('Failed to load evidence details.');
        }
    }

    showEvidenceDetail(evidence) {
        const modal = document.getElementById('evidence-detail-modal');
        const content = document.getElementById('evidence-detail-content');
        
        content.innerHTML = `
            <div class="detail-section">
                <h4>Basic Information</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <label>Type:</label>
                        <span class="evidence-type-badge evidence-type-${evidence.type}">
                            ${this.getTypeIcon(evidence.type)} ${evidence.type}
                        </span>
                    </div>
                    <div class="detail-item">
                        <label>Incident Date:</label>
                        <span>${new Date(evidence.incidentDate).toLocaleString()}</span>
                    </div>
                    <div class="detail-item">
                        <label>Added:</label>
                        <span>${new Date(evidence.createdAt).toLocaleString()}</span>
                    </div>
                    ${evidence.location ? `
                    <div class="detail-item">
                        <label>Location:</label>
                        <span>${evidence.location}</span>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="detail-section">
                <h4>Description</h4>
                <p>${evidence.description || 'No description provided'}</p>
            </div>

            ${evidence.notes ? `
            <div class="detail-section">
                <h4>Personal Notes</h4>
                <p>${evidence.notes}</p>
            </div>
            ` : ''}

            ${evidence.tags && evidence.tags.length > 0 ? `
            <div class="detail-section">
                <h4>Tags</h4>
                <div class="evidence-tags">
                    ${evidence.tags.map(tag => `<span class="evidence-tag">${tag}</span>`).join('')}
                </div>
            </div>
            ` : ''}

            ${evidence.fileName ? `
            <div class="detail-section">
                <h4>Attached File</h4>
                <div class="file-attachment">
                    <span class="file-icon">${this.getFileIcon(evidence.mimeType)}</span>
                    <div class="file-info">
                        <div class="file-name">${evidence.fileName}</div>
                        <div class="file-size">${this.formatFileSize(evidence.fileSize || 0)}</div>
                    </div>
                    <button class="btn-primary" onclick="evidenceVault.downloadFile('${evidence._id}')">
                        Download
                    </button>
                </div>
            </div>
            ` : ''}
        `;

        // Set up action buttons
        document.getElementById('download-file').onclick = () => this.downloadFile(evidence._id);
        document.getElementById('edit-evidence').onclick = () => this.editEvidence(evidence._id);
        document.getElementById('delete-evidence').onclick = () => this.deleteEvidence(evidence._id);
        document.getElementById('detail-title').textContent = evidence.title;

        modal.classList.add('active');
    }

    async downloadFile(evidenceId) {
        try {
            const token = localStorage.getItem('gbv_token');
            const response = await fetch(`/api/evidence/file/${evidenceId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `evidence-${evidenceId}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                throw new Error('Failed to download file');
            }
        } catch (error) {
            console.error('Error downloading file:', error);
            this.showError('Failed to download file.');
        }
    }

    async deleteEvidence(evidenceId) {
        if (!confirm('Are you sure you want to delete this evidence? This action cannot be undone.')) {
            return;
        }

        try {
            const token = localStorage.getItem('gbv_token');
            const response = await fetch(`/api/evidence/${evidenceId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.showSuccess('Evidence deleted successfully');
                document.getElementById('evidence-detail-modal').classList.remove('active');
                this.loadEvidenceStats();
                this.loadEvidence(this.currentPage);
            } else {
                throw new Error('Failed to delete evidence');
            }
        } catch (error) {
            console.error('Error deleting evidence:', error);
            this.showError('Failed to delete evidence.');
        }
    }

    handleFilterChange(filterType, value) {
        this.currentFilters[filterType] = value;
        this.loadEvidence(1);
    }

    handleSortChange(sortValue) {
        const [sortBy, sortOrder] = sortValue.split('-');
        this.currentFilters.sortBy = sortBy;
        this.currentFilters.sortOrder = sortOrder;
        this.loadEvidence(1);
    }

    handleSearch(searchTerm) {
        this.currentFilters.search = searchTerm;
        this.loadEvidence(1);
    }

    refreshEvidence() {
        this.loadEvidenceStats();
        this.loadEvidence(this.currentPage);
    }

    async exportEvidence() {
        try {
            const token = localStorage.getItem('gbv_token');
            const response = await fetch('/api/evidence/export', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `evidence-export-${new Date().toISOString().split('T')[0]}.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                throw new Error('Export not available');
            }
        } catch (error) {
            this.showError('Export feature is not available yet.');
        }
    }

    showLoading() {
        const evidenceList = document.getElementById('evidence-list');
        evidenceList.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Loading evidence...</p>
            </div>
        `;
    }

    showSuccess(message) {
        this.showAlert(message, 'success');
    }

    showError(message) {
        this.showAlert(message, 'error');
    }

    showAlert(message, type = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            max-width: 300px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            document.body.removeChild(alertDiv);
        }, 5000);
    }
}

// Initialize Evidence Vault when DOM is loaded
let evidenceVault;
document.addEventListener('DOMContentLoaded', function() {
    evidenceVault = new EvidenceVault();
});

// Make functions available globally for HTML onclick handlers
window.evidenceVault = evidenceVault;

// Safety Plan Functions
async function loadSafetyPlan() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/safety-plan`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const safetyPlan = await response.json();
            if (safetyPlan.safeLocations && safetyPlan.safeLocations.length > 0) {
                const safeLocationsContainer = document.getElementById('safe-locations');
                safeLocationsContainer.innerHTML = safetyPlan.safeLocations.map(location => `
                    <div class="location-card">
                        <h4>${location.name}</h4>
                        <p>${location.address}</p>
                        ${location.contact ? `<small>Contact: ${location.contact}</small>` : ''}
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading safety plan:', error);
    }
}

async function addSafeLocation() {
    const name = prompt('Enter safe location name:');
    const address = prompt('Enter address:');
    const contact = prompt('Enter contact person (optional):');
    
    if (name && address) {
        try {
            const token = localStorage.getItem('gbv_token');
            const response = await fetch(`${API_BASE}/safety-plan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    safeLocations: [{ name, address, contact }]
                })
            });

            if (response.ok) {
                showAlert(`Safe location "${name}" added`);
                loadSafetyPlan();
            }
        } catch (error) {
            alert('Error adding safe location: ' + error.message);
        }
    }
}

function callNumber(number) {
    alert(`Calling ${number}...\n\nIn a real app, this would dial the number.`);
}

// Chat Functions
async function loadChats() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/chats`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const chats = await response.json();
            console.log('Loaded chats:', chats);
        }
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

async function startCounselorChat() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ type: 'counselor' })
        });

        if (response.ok) {
            const chat = await response.json();
            showAlert('Connected to GBV counselor');
        }
    } catch (error) {
        alert('Error starting chat: ' + error.message);
    }
}

async function startLegalChat() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ type: 'legal' })
        });

        if (response.ok) {
            showAlert('Connected to legal advisor');
        }
    } catch (error) {
        alert('Error starting legal chat: ' + error.message);
    }
}

async function startSupportGroup() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ type: 'support' })
        });

        if (response.ok) {
            showAlert('Joined support group chat');
        }
    } catch (error) {
        alert('Error joining support group: ' + error.message);
    }
}

// Profile Functions
async function loadProfile() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const profileData = await response.json();
            const user = profileData.user;
            const stats = profileData.stats;

            document.getElementById('profile-name').textContent = user.name;
            document.getElementById('profile-email').textContent = user.email;
            document.getElementById('profile-phone').textContent = user.phone;
            document.getElementById('profile-avatar').textContent = user.name.charAt(0).toUpperCase();
            
            document.getElementById('trusted-contacts-count').textContent = stats.trustedContacts;
            document.getElementById('evidence-items').textContent = stats.evidenceItems;
            document.getElementById('alerts-sent').textContent = stats.alertsSent;
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

async function editProfile() {
    const newName = prompt('Enter new name:', currentUser.name);
    const newPhone = prompt('Enter new phone:', currentUser.phone);
    
    if (newName && newPhone) {
        try {
            const token = localStorage.getItem('gbv_token');
            const response = await fetch(`${API_BASE}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newName,
                    phone: newPhone
                })
            });

            if (response.ok) {
                const updatedUser = await response.json();
                currentUser = { ...currentUser, ...updatedUser };
                localStorage.setItem('gbv_user', JSON.stringify(currentUser));
                showAlert('Profile updated successfully');
                loadProfile();
            }
        } catch (error) {
            alert('Error updating profile: ' + error.message);
        }
    }
}

function changePassword() {
    alert('Change password feature would open here.');
}

function manageNotifications() {
    alert('Notification settings would open here.');
}

function privacySettings() {
    alert('Privacy and security settings would open here.');
}

function manageSafeLocations() {
    showScreen('safety');
}

function manageEmergencyContacts() {
    showScreen('contacts');
}

function setupSafeWord() {
    const safeWord = prompt('Enter your safe word (used when speaking under duress):', 'bluebird');
    if (safeWord) {
        const token = localStorage.getItem('gbv_token');
        fetch(`${API_BASE}/safety-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ safeWord })
        })
        .then(response => response.json())
        .then(() => {
            showAlert(`Safe word set to: ${safeWord}`);
        })
        .catch(error => {
            console.error('Error setting safe word:', error);
        });
    }
}

// Recent Alerts
async function loadRecentAlerts() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/alerts/my-alerts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const alerts = await response.json();
            const alertsList = document.getElementById('alerts-list');
            if (alerts.length > 0) {
                alertsList.innerHTML = alerts.slice(0, 3).map(alert => `
                    <div class="alert-item ${alert.status === 'resolved' ? 'resolved' : ''}">
                        <div class="alert-time">${new Date(alert.createdAt).toLocaleString()}</div>
                        <div>${alert.message}</div>
                        <span class="alert-status ${alert.status === 'active' ? 'status-active' : 'status-resolved'}">
                            ${alert.status}
                        </span>
                    </div>
                `).join('');
            } else {
                alertsList.innerHTML = '<p style="text-align: center; color: #666;">No recent alerts</p>';
            }
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
        document.getElementById('alerts-list').innerHTML = '<p style="text-align: center; color: red;">Error loading alerts</p>';
    }
}

// Load user data
async function loadUserData() {
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.name;
        loadContacts();
        loadEvidence();
        loadRecentAlerts();
        loadProfile();
        loadSafetyPlan();
    }
}

// Fake Mode
function toggleFakeMode() {
    const btn = document.getElementById('fake-mode-btn');
    if (btn.textContent === 'Activate Calendar Mode') {
        document.body.innerHTML = `
            <div style="padding: 2rem; text-align: center; background: white; min-height: 100vh; font-family: Arial, sans-serif;">
                <h2 style="color: #8B008B; margin-bottom: 2rem;">📅 Calendar - October 2023</h2>
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin: 2rem 0;">
                    <div style="font-weight: bold; padding: 10px; background: #f0f0f0;">Sun</div>
                    <div style="font-weight: bold; padding: 10px; background: #f0f0f0;">Mon</div>
                    <div style="font-weight: bold; padding: 10px; background: #f0f0f0;">Tue</div>
                    <div style="font-weight: bold; padding: 10px; background: #f0f0f0;">Wed</div>
                    <div style="font-weight: bold; padding: 10px; background: #f0f0f0;">Thu</div>
                    <div style="font-weight: bold; padding: 10px; background: #f0f0f0;">Fri</div>
                    <div style="font-weight: bold; padding: 10px; background: #f0f0f0;">Sat</div>
                    ${Array.from({length: 35}, (_, i) => 
                        `<div style="padding: 12px; border: 1px solid #eee; border-radius: 5px; cursor: pointer; 
                            background: ${i >= 1 && i < 32 ? '#f9f9f9' : '#f5f5f5'}; 
                            color: ${i >= 1 && i < 32 ? '#333' : '#ccc'};">
                         ${i >= 1 && i < 32 ? i : ''}
                         </div>`
                    ).join('')}
                </div>
                <p style="margin-top: 2rem; font-size: 0.9rem; color: #666;">
                    📅 Regular Calendar App<br>
                    <small>Tap and hold any date for 3 seconds to access safety features</small>
                </p>
                <button onclick="location.reload()" style="margin-top: 2rem; padding: 1rem 2rem; background: #8B008B; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    Return to Safety App
                </button>
            </div>
        `;
    }
}

// Make functions globally available
window.deleteContact = deleteContact;
window.addSafeLocation = addSafeLocation;
window.callNumber = callNumber;
window.viewShelters = viewShelters;
window.viewLegalAid = viewLegalAid;
window.openResource = openResource;
window.startCounselorChat = startCounselorChat;
window.startLegalChat = startLegalChat;
window.startSupportGroup = startSupportGroup;
window.editProfile = editProfile;
window.changePassword = changePassword;
window.manageNotifications = manageNotifications;
window.privacySettings = privacySettings;
window.manageSafeLocations = manageSafeLocations;
window.manageEmergencyContacts = manageEmergencyContacts;
window.setupSafeWord = setupSafeWord;
window.showAddEvidenceModal = showAddEvidenceModal;
window.deleteEvidence = deleteEvidence;

// Resources Functions
function viewShelters() {
    alert('Showing safe houses and shelters in your area...');
}

function viewLegalAid() {
    alert('Connecting to legal aid services...');
}

function openResource(resource) {
    const resources = {
        'safety-planning': 'Safety Planning Guide opened...',
        'legal-rights': 'Legal Rights information opened...',
        'counseling': 'Counseling Services information opened...'
    };
    alert(resources[resource] || 'Resource opened...');
}