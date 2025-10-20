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
    }
    
    socket.on('alert-sent', (data) => {
        showAlert(`Emergency alert sent to ${data.contactsNotified} trusted contacts!`);
        loadRecentAlerts();
    });

    socket.on('alert-status-update', (data) => {
        showAlert(`${data.contactName} marked your alert as ${data.status}`);
        loadRecentAlerts();
    });

    socket.on('connect', () => {
        console.log('Connected to server');
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
        document.body.removeChild(alertDiv);
    }, 5000);
}

// Emergency Functions
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
            showAlert('Emergency alert sent to your trusted contacts!');
            showScreen('app');
            loadRecentAlerts();
        } else {
            throw new Error('Failed to send emergency alert');
        }
    } catch (error) {
        console.error('Error sending alert:', error);
        alert('Error sending alert: ' + error.message);
    }
}

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
                    'Location access denied';
            }
        );
    } else {
        document.getElementById('location-text').textContent = 
            'Geolocation not supported';
    }
}

// Contacts Functions
async function loadEmergencyContacts() {
    try {
        const contacts = JSON.parse(localStorage.getItem('gbv_contacts') || '[]');
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
        } else {
            alert('Failed to add contact');
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
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
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
function showAddEvidenceModal() {
    document.getElementById('add-evidence-modal').classList.add('active');
}

function hideAddEvidenceModal() {
    document.getElementById('add-evidence-modal').classList.remove('active');
    document.getElementById('add-evidence-form').reset();
}

async function handleAddEvidence(e) {
    e.preventDefault();
    const type = document.getElementById('evidence-type').value;
    const title = document.getElementById('evidence-title').value;
    const notes = document.getElementById('evidence-notes').value;
    const incidentDate = document.getElementById('evidence-date').value;

    try {
        const token = localStorage.getItem('gbv_token');
        const formData = new FormData();
        formData.append('type', type);
        formData.append('title', title);
        formData.append('notes', notes);
        formData.append('incidentDate', incidentDate);

        const fileInput = document.getElementById('evidence-file');
        if (fileInput.files.length > 0) {
            formData.append('file', fileInput.files[0]);
        }

        const response = await fetch(`${API_BASE}/evidence`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            hideAddEvidenceModal();
            showAlert('Evidence saved securely!');
            loadEvidence();
        } else {
            alert('Failed to save evidence');
        }
    } catch (error) {
        alert('Error saving evidence: ' + error.message);
    }
}

async function loadEvidence() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/evidence`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayEvidenceList(data.evidence);
            updateEvidenceStats(data);
        }
    } catch (error) {
        console.error('Error loading evidence:', error);
    }
}

function displayEvidenceList(evidence) {
    const evidenceList = document.getElementById('evidence-list');
    const totalEvidence = document.getElementById('total-evidence');

    if (evidence.length === 0) {
        evidenceList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📁</span>
                <h3>No Evidence Stored</h3>
                <p>Add photos, documents, or notes as evidence</p>
            </div>
        `;
        return;
    }

    if (totalEvidence) {
        totalEvidence.textContent = evidence.length;
    }

    evidenceList.innerHTML = evidence.map(item => `
        <div class="evidence-item">
            <div class="evidence-item-header">
                <div class="evidence-type-badge evidence-type-${item.type}">
                    ${getEvidenceTypeIcon(item.type)} ${item.type}
                </div>
                <div class="evidence-date">
                    ${new Date(item.incidentDate).toLocaleDateString()}
                </div>
            </div>
            <div class="evidence-item-content">
                <h4 class="evidence-title">${item.title}</h4>
                <p class="evidence-description">${item.description || 'No description'}</p>
                ${item.notes ? `<p class="evidence-notes">${item.notes}</p>` : ''}
                ${item.fileName ? `<p class="evidence-file">📎 ${item.fileName}</p>` : ''}
            </div>
        </div>
    `).join('');
}

function getEvidenceTypeIcon(type) {
    const icons = {
        'photo': '🖼️',
        'document': '📄',
        'audio': '🎵',
        'note': '📝'
    };
    return icons[type] || '📎';
}

function updateEvidenceStats(data) {
    console.log('Evidence stats updated:', data);
}

// Safety Plan Functions
function addSafeLocation() {
    const name = prompt('Enter safe location name:');
    const address = prompt('Enter address:');
    if (name && address) {
        showAlert(`Safe location "${name}" added`);
    }
}

function callNumber(number) {
    alert(`Calling ${number}...\n\nIn a real app, this would dial the number.`);
}

// Chat Functions
function startCounselorChat() {
    alert('Connecting to GBV counselor...\n\nThis would open a secure chat interface.');
}

function startLegalChat() {
    alert('Connecting to legal advisor...\n\nThis would open a secure chat interface.');
}

function startSupportGroup() {
    alert('Joining support group chat...\n\nThis would connect you with other survivors safely.');
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

function editProfile() {
    alert('Edit profile feature would open here.');
}

function changePassword() {
    alert('Change password feature would open here.');
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
        showAlert(`Safe word set to: ${safeWord}`);
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

// Resources Functions
function viewShelters() {
    alert('Showing safe houses and shelters in your area...');
}

function viewLegalAid() {
    alert('Connecting to legal aid services...');
}

// Make functions globally available
window.deleteContact = deleteContact;
window.addSafeLocation = addSafeLocation;
window.callNumber = callNumber;
window.viewShelters = viewShelters;
window.viewLegalAid = viewLegalAid;
window.startCounselorChat = startCounselorChat;
window.startLegalChat = startLegalChat;
window.startSupportGroup = startSupportGroup;
window.editProfile = editProfile;
window.changePassword = changePassword;
window.privacySettings = privacySettings;
window.manageSafeLocations = manageSafeLocations;
window.manageEmergencyContacts = manageEmergencyContacts;
window.setupSafeWord = setupSafeWord;
window.showAddEvidenceModal = showAddEvidenceModal;
window.hideAddEvidenceModal = hideAddEvidenceModal;