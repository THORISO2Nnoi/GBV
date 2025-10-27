const API_BASE = window.location.hostname.includes('localhost') 
  ? 'http://localhost:3000/api' 
  : '/api';

let socket;
let currentUser = null;
let countdownInterval;
let emergencyPressCount = 0;
let lastEmergencyPress = 0;

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
    initializeModals();
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
    
    // Emergency features - UPDATED WITH PRESS COUNT
    document.getElementById('emergency-btn').addEventListener('click', handleEmergencyButtonPress);
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

function initializeModals() {
    // Profile modals
    document.getElementById('edit-profile-form').addEventListener('submit', handleEditProfile);
    document.getElementById('change-password-form').addEventListener('submit', handleChangePassword);
    
    // Close modal buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
    });
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

function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `notification ${type}`;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (document.body.contains(alertDiv)) {
            document.body.removeChild(alertDiv);
        }
    }, 5000);
}

// EMERGENCY FUNCTIONS - UPDATED WITH PRESS COUNT AND DUPLICATION PREVENTION
function handleEmergencyButtonPress() {
    const now = Date.now();
    const timeSinceLastPress = now - lastEmergencyPress;
    
    // If it's been more than 2 seconds since last press, reset count
    if (timeSinceLastPress > 2000) {
        emergencyPressCount = 0;
    }
    
    emergencyPressCount++;
    lastEmergencyPress = now;
    
    // Update button appearance based on press count
    updateEmergencyButtonAppearance();
    
    // Show emergency screen on first press
    if (emergencyPressCount === 1) {
        showEmergencyScreen();
    } else {
        // For subsequent presses, update the existing alert
        updateExistingEmergencyAlert();
    }
}

function updateEmergencyButtonAppearance() {
    const emergencyBtn = document.getElementById('emergency-btn');
    const btnIcon = emergencyBtn.querySelector('.btn-icon');
    
    switch(emergencyPressCount) {
        case 1:
            emergencyBtn.style.background = 'linear-gradient(135deg, var(--danger), var(--warning))';
            btnIcon.textContent = '🚨';
            break;
        case 2:
            emergencyBtn.style.background = 'linear-gradient(135deg, #ff4500, #ff8c00)';
            btnIcon.textContent = '🚨🚨';
            break;
        case 3:
            emergencyBtn.style.background = 'linear-gradient(135deg, #dc143c, #ff0000)';
            btnIcon.textContent = '🚨🚨🚨';
            break;
        default:
            emergencyBtn.style.background = 'linear-gradient(135deg, #8b0000, #dc143c)';
            btnIcon.textContent = '🚨🚨🚨🚨';
    }
}

function showEmergencyScreen() {
    showScreen('emergency');
    startCountdown();
    getCurrentLocation();
    loadEmergencyContacts();
    
    // Update emergency screen with press count info
    updateEmergencyScreenInfo();
}

function updateEmergencyScreenInfo() {
    const helpMessage = document.getElementById('help-message');
    const countdownElement = document.getElementById('countdown');
    
    if (emergencyPressCount === 1) {
        helpMessage.textContent = 'Preparing to send help...';
        countdownElement.style.color = 'white';
    } else {
        helpMessage.textContent = `URGENT! Emergency reinforced (${emergencyPressCount} presses)`;
        countdownElement.style.color = '#ffeb3b';
        countdownElement.style.textShadow = '0 0 10px yellow';
    }
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
    emergencyPressCount = 0;
    resetEmergencyButton();
    showScreen('app');
    showAlert('Emergency cancelled');
}

function resetEmergencyButton() {
    const emergencyBtn = document.getElementById('emergency-btn');
    const btnIcon = emergencyBtn.querySelector('.btn-icon');
    
    emergencyBtn.style.background = 'linear-gradient(135deg, var(--danger), var(--warning))';
    btnIcon.textContent = '🚨';
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
                message: 'Emergency assistance needed',
                pressCount: emergencyPressCount
            })
        });

        if (response.ok) {
            const data = await response.json();
            const urgencyMessage = emergencyPressCount > 1 ? 
                ` (${emergencyPressCount} presses - ${data.alert.alertLevel} urgency)` : '';
            
            showAlert(`Emergency alert sent to your trusted contacts!${urgencyMessage}`);
            showScreen('app');
            loadRecentAlerts();
            
            // Reset press count after successful send
            emergencyPressCount = 0;
            resetEmergencyButton();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to send emergency alert');
        }
    } catch (error) {
        console.error('Error sending alert:', error);
        alert('Error sending alert: ' + error.message);
    }
}

async function updateExistingEmergencyAlert() {
    try {
        const token = localStorage.getItem('gbv_token');
        const location = document.getElementById('location-text').textContent;
        
        const response = await fetch(`${API_BASE}/alerts/quick-emergency`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                location: location,
                pressCount: emergencyPressCount
            })
        });

        if (response.ok) {
            const data = await response.json();
            updateEmergencyScreenInfo();
            showAlert(`Emergency reinforced! (Press ${data.alert.pressCount})`, 'warning');
        }
    } catch (error) {
        console.error('Error updating emergency:', error);
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

// CONTACTS FUNCTIONS - UPDATED WITH LOGIN CREDENTIALS POPUP
async function loadEmergencyContacts() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/contacts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const contacts = data.contacts;
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
            
            // SHOW LOGIN DETAILS POPUP
            showContactLoginDetails(data.contact, data.loginCredentials);
            
            showAlert(`Contact ${name} added successfully!`);
            loadContacts();
        } else {
            const errorData = await response.json();
            alert(errorData.message || 'Failed to add contact');
        }
    } catch (error) {
        alert('Error adding contact: ' + error.message);
    }
}

// NEW FUNCTION: Show contact login details popup
function showContactLoginDetails(contact, credentials) {
    const popupHTML = `
        <div class="modal active" id="contact-credentials-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>✅ Contact Added Successfully!</h3>
                    <button class="close-btn" onclick="hideModal('contact-credentials-modal')">×</button>
                </div>
                <div class="modal-body" style="padding: 1.5rem;">
                    <div class="success-message" style="text-align: center; margin-bottom: 1.5rem;">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">🔐</div>
                        <h4 style="color: var(--success); margin-bottom: 0.5rem;">Login Credentials Generated</h4>
                        <p>Share these details securely with <strong>${contact.name}</strong></p>
                    </div>
                    
                    <div class="credentials-card">
                        <div class="credential-item">
                            <div>
                                <strong>📧 Email</strong>
                                <div class="credential-value">${credentials.email}</div>
                            </div>
                            <button class="btn-secondary" onclick="copyToClipboard('${credentials.email}')">Copy</button>
                        </div>
                        
                        <div class="credential-item">
                            <div>
                                <strong>🔑 Password</strong>
                                <div class="credential-value password">${credentials.password}</div>
                            </div>
                            <button class="btn-secondary" onclick="copyToClipboard('${credentials.password}')">Copy</button>
                        </div>
                        
                        <div class="credential-item">
                            <div>
                                <strong>🌐 Login URL</strong>
                                <div class="credential-value url">${window.location.origin}${credentials.loginUrl}</div>
                            </div>
                            <button class="btn-secondary" onclick="copyToClipboard('${window.location.origin}${credentials.loginUrl}')">Copy</button>
                        </div>
                    </div>
                    
                    <div class="security-notice">
                        <h4>🔒 Security Instructions</h4>
                        <p>
                            ${credentials.instructions} 
                            <strong>Do not share these credentials over insecure channels.</strong>
                        </p>
                    </div>
                    
                    <div class="action-buttons">
                        <button class="btn-primary" onclick="printCredentials()">
                            🖨️ Print Credentials
                        </button>
                        <button class="btn-secondary" onclick="hideModal('contact-credentials-modal')">
                            ✅ I've Saved These
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('contact-credentials-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add new modal to body
    document.body.insertAdjacentHTML('beforeend', popupHTML);
    
    // Add click outside to close
    const modal = document.getElementById('contact-credentials-modal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            hideModal('contact-credentials-modal');
        }
    });
}

// Helper function to copy text to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('Copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showAlert('Copied to clipboard!');
    });
}

// Print credentials function
function printCredentials() {
    const modalContent = document.querySelector('#contact-credentials-modal .modal-content').cloneNode(true);
    
    // Remove buttons for print
    const actionButtons = modalContent.querySelector('.action-buttons');
    if (actionButtons) actionButtons.remove();
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Trusted Contact Login Credentials</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
                    .credentials-card { border: 2px solid #333; padding: 20px; margin: 20px 0; border-radius: 8px; }
                    .credential-item { margin: 15px 0; padding: 15px; border: 1px solid #ccc; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
                    .credential-value { font-weight: bold; margin-top: 5px; }
                    .credential-value.password { font-family: monospace; color: #dc143c; }
                    .credential-value.url { color: #8B008B; word-break: break-all; }
                    .security-notice { background: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 6px; border: 1px solid #ffeaa7; }
                    h1 { color: #8B008B; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <h1>Trusted Contact Login Credentials</h1>
                <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
                ${modalContent.innerHTML}
                <p style="margin-top: 30px; font-size: 12px; color: #666;">
                    Keep this document secure. Destroy after sharing credentials.
                </p>
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
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
            const data = await response.json();
            const contacts = data.contacts;
            const contactsList = document.getElementById('contacts-list');
            
            if (contacts.length > 0) {
                contactsList.innerHTML = contacts.map(contact => `
                    <div class="contact-item">
                        <div class="contact-info">
                            <div class="contact-name">${contact.name}</div>
                            <div class="contact-details">${contact.phone} • ${contact.email}</div>
                            <div class="contact-relationship">${contact.relationship || 'Trusted Contact'}</div>
                            <div class="contact-status">
                                ${contact.isActive ? '✅ Active' : '❌ Inactive'}
                            </div>
                        </div>
                        <div class="contact-actions">
                            <button class="btn-secondary" onclick="resendCredentials('${contact.id}')" title="Resend Login Credentials">
                                🔑 Resend
                            </button>
                            <button class="btn-secondary" onclick="deleteContact('${contact.id}')">
                                Remove
                            </button>
                        </div>
                    </div>
                `).join('');
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

// Resend credentials function
async function resendCredentials(contactId) {
    if (!confirm('Generate new login credentials for this contact? The old password will be replaced.')) {
        return;
    }

    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/contacts/${contactId}/resend-credentials`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            
            // Find the contact name for the popup
            const contactsResponse = await fetch(`${API_BASE}/contacts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const contactsData = await contactsResponse.json();
            const contact = contactsData.contacts.find(c => c.id === contactId);
            
            if (contact) {
                showContactLoginDetails(contact, data.loginCredentials);
                showAlert('New credentials generated successfully!');
            }
        } else {
            const errorData = await response.json();
            alert(errorData.message || 'Failed to generate new credentials');
        }
    } catch (error) {
        alert('Error generating new credentials: ' + error.message);
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

// EVIDENCE VAULT FUNCTIONS
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
                ${item.fileUrl ? `<p class="evidence-file"><a href="${item.fileUrl}" target="_blank">📎 ${item.fileName || 'View File'}</a></p>` : ''}
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

// SAFETY PLAN FUNCTIONS
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

// CHAT FUNCTIONS
function startCounselorChat() {
    alert('Connecting to GBV counselor...\n\nThis would open a secure chat interface.');
}

function startLegalChat() {
    alert('Connecting to legal advisor...\n\nThis would open a secure chat interface.');
}

function startSupportGroup() {
    alert('Joining support group chat...\n\nThis would connect you with other survivors safely.');
}

// PROFILE FUNCTIONS
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
            document.getElementById('profile-phone').textContent = user.phone || 'Not provided';
            document.getElementById('profile-avatar').textContent = user.name.charAt(0).toUpperCase();
            
            document.getElementById('trusted-contacts-count').textContent = stats.trustedContacts;
            document.getElementById('evidence-items').textContent = stats.evidenceItems;
            document.getElementById('alerts-sent').textContent = stats.alertsSent;

            // Update current user data
            currentUser = user;
            localStorage.setItem('gbv_user', JSON.stringify(user));
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('Error loading profile data', 'error');
    }
}

function editProfile() {
    if (!currentUser) {
        showAlert('Please log in to edit profile', 'error');
        return;
    }
    
    // Populate form with current data
    document.getElementById('edit-name').value = currentUser.name;
    document.getElementById('edit-email').value = currentUser.email;
    document.getElementById('edit-phone').value = currentUser.phone || '';
    
    // Show modal
    document.getElementById('edit-profile-modal').classList.add('active');
}

function changePassword() {
    // Clear password form
    document.getElementById('change-password-form').reset();
    
    // Show modal
    document.getElementById('change-password-modal').classList.add('active');
}

async function handleEditProfile(event) {
    event.preventDefault();
    
    if (!currentUser) {
        showAlert('Please log in to edit profile', 'error');
        return;
    }
    
    const formData = {
        name: document.getElementById('edit-name').value.trim(),
        email: document.getElementById('edit-email').value.trim(),
        phone: document.getElementById('edit-phone').value.trim()
    };
    
    // Basic validation
    if (!formData.name || !formData.email) {
        showAlert('Name and email are required', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Update current user data
            currentUser = data.user;
            localStorage.setItem('gbv_user', JSON.stringify(currentUser));
            
            // Update UI with new data and stats
            document.getElementById('profile-name').textContent = data.user.name;
            document.getElementById('profile-email').textContent = data.user.email;
            document.getElementById('profile-phone').textContent = data.user.phone || 'Not provided';
            document.getElementById('profile-avatar').textContent = data.user.name.charAt(0).toUpperCase();
            
            // Update stats
            document.getElementById('trusted-contacts-count').textContent = data.stats.trustedContacts;
            document.getElementById('evidence-items').textContent = data.stats.evidenceItems;
            document.getElementById('alerts-sent').textContent = data.stats.alertsSent;
            
            showAlert('Profile updated successfully', 'success');
            document.getElementById('edit-profile-modal').classList.remove('active');
        } else {
            showAlert(data.message || 'Failed to update profile', 'error');
        }
        
    } catch (error) {
        console.error('Error updating profile:', error);
        showAlert('Network error while updating profile', 'error');
    }
}

async function handleChangePassword(event) {
    event.preventDefault();
    
    if (!currentUser) {
        showAlert('Please log in to change password', 'error');
        return;
    }
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showAlert('All password fields are required', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showAlert('New passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showAlert('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/profile/password`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showAlert('Password changed successfully', 'success');
            document.getElementById('change-password-modal').classList.remove('active');
            
            // Clear form
            document.getElementById('change-password-form').reset();
        } else {
            showAlert(data.message || 'Failed to change password', 'error');
        }
        
    } catch (error) {
        console.error('Error changing password:', error);
        showAlert('Network error while changing password', 'error');
    }
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

// RECENT ALERTS
async function loadRecentAlerts() {
    try {
        const token = localStorage.getItem('gbv_token');
        const response = await fetch(`${API_BASE}/alerts/my-alerts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const alerts = data.alerts;
            const alertsList = document.getElementById('alerts-list');
            
            if (alerts.length > 0) {
                alertsList.innerHTML = alerts.slice(0, 3).map(alert => `
                    <div class="alert-item ${alert.status === 'resolved' ? 'resolved' : ''}">
                        <div class="alert-time">${new Date(alert.createdAt).toLocaleString()}</div>
                        <div>${alert.message}</div>
                        ${alert.pressCount > 1 ? `<div class="alert-press-count">🚨 Pressed ${alert.pressCount} times</div>` : ''}
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

// LOAD USER DATA
async function loadUserData() {
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.name;
        loadContacts();
        loadEvidence();
        loadRecentAlerts();
        loadProfile();
    }
}

// FAKE MODE
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

// RESOURCES FUNCTIONS
function viewShelters() {
    alert('Showing safe houses and shelters in your area...');
}

function viewLegalAid() {
    alert('Connecting to legal aid services...');
}

// MODAL FUNCTIONS
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// MAKE FUNCTIONS GLOBALLY AVAILABLE
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
window.hideModal = hideModal;
window.copyToClipboard = copyToClipboard;
window.printCredentials = printCredentials;
window.resendCredentials = resendCredentials;