// Updated Trusted Contact App JavaScript with Fixed Alert Reception
const API_BASE = window.location.hostname.includes('localhost') 
    ? 'http://localhost:3000/api' 
    : '/api';

let socket;
let currentContact = null;
let alertsHistory = [];

const updatingAlerts = new Set();

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    dashboard: document.getElementById('dashboard-screen')
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeContactEventListeners();
    checkContactAuth();
});

function initializeContactEventListeners() {
    document.getElementById('contact-login-form').addEventListener('submit', handleContactLogin);
    document.getElementById('contact-logout-btn').addEventListener('click', contactLogout);
}

function checkContactAuth() {
    const token = localStorage.getItem('gbv_contact_token');
    const contact = localStorage.getItem('gbv_contact');
    
    if (token && contact) {
        currentContact = JSON.parse(contact);
        initializeContactSocket();
        loadContactAlerts();
        showDashboard();
    }
}

async function handleContactLogin(e) {
    e.preventDefault();
    const email = document.getElementById('contact-email').value;
    const password = document.getElementById('contact-password').value;

    try {
        const response = await fetch(`${API_BASE}/contact-auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('gbv_contact_token', data.token);
            localStorage.setItem('gbv_contact', JSON.stringify(data.contact));
            currentContact = data.contact;
            
            initializeContactSocket();
            loadContactAlerts();
            showDashboard();
            showAlert('Login successful!');
        } else {
            alert(data.message || 'Login failed. Please check your credentials.');
        }
    } catch (error) {
        alert('Login error: ' + error.message);
    }
}

function showDashboard() {
    showScreen('dashboard');
    
    document.getElementById('contact-name-display').textContent = currentContact.name;
    document.getElementById('user-role').textContent = `Trusted contact for ${currentContact.userName}`;
}

function contactLogout() {
    localStorage.removeItem('gbv_contact_token');
    localStorage.removeItem('gbv_contact');
    currentContact = null;
    if (socket) socket.disconnect();
    showScreen('login');
}

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
}

async function loadContactAlerts() {
    showLoadingState();
    
    try {
        const token = localStorage.getItem('gbv_contact_token');
        const response = await fetch(`${API_BASE}/contact-auth/alerts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const alerts = await response.json();
            alertsHistory = alerts;
            displayAlerts(alerts);
            updateStats(alerts);
            hideLoadingState();
            console.log(`📋 Loaded ${alerts.length} alerts for contact`);
        } else {
            showErrorState('Failed to load alerts');
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
        showErrorState('Error loading alerts: ' + error.message);
    }
}

// Enhanced displayAlerts function to show contact-specific alerts
function displayAlerts(alerts) {
    const alertContainer = document.getElementById('alerts-container');
    const noAlerts = document.getElementById('no-alerts');
    const alertCount = document.getElementById('alert-count');
    
    // Also get locally stored alerts
    const localAlerts = JSON.parse(localStorage.getItem('gbv_contact_alerts') || '[]');
    
    // Combine and deduplicate alerts
    const allAlerts = [...alerts, ...localAlerts].reduce((unique, alert) => {
        const alertId = alert._id || alert.alertId;
        if (!unique.some(a => (a._id || a.alertId) === alertId)) {
            unique.push(alert);
        }
        return unique;
    }, []);
    
    const activeAlerts = allAlerts.filter(alert => 
        alert.status === 'active' || 
        (alert.status !== 'resolved' && alert.status !== 'closed')
    );
    
    if (activeAlerts.length === 0) {
        showNoAlerts();
        return;
    }
    
    noAlerts.classList.add('hidden');
    alertCount.textContent = activeAlerts.length;
    
    // Sort alerts by creation date (newest first)
    const sortedAlerts = activeAlerts.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.receivedAt);
        const dateB = new Date(b.createdAt || b.receivedAt);
        return dateB - dateA;
    });
    
    alertContainer.innerHTML = sortedAlerts.map(alert => createAlertHTML(alert)).join('');
    
    console.log(`📋 Displayed ${activeAlerts.length} active alerts`);
}

function createAlertHTML(alert) {
    const user = alert.userId || {};
    const userName = user.name || alert.userName || 'User';
    const userPhone = user.phone || alert.userPhone || 'Phone not available';
    const relationship = currentContact.relationship || 'Trusted Contact';
    const alertTime = new Date(alert.createdAt).toLocaleString();
    const location = alert.location || 'Location not available';
    const isUpdating = updatingAlerts.has(alert._id);
    
    return `
        <div class="alert-item">
            <div class="alert-header">
                <span class="alert-icon">🚨</span>
                <h4>EMERGENCY ALERT</h4>
                <span class="alert-time">${alertTime}</span>
            </div>
            
            <div class="user-info">
                <div class="user-avatar">${userName.charAt(0)}</div>
                <div class="user-details">
                    <h4>${userName}</h4>
                    <p>${relationship}</p>
                </div>
            </div>
            
            <div class="alert-details">
                <p><strong>Location:</strong> ${location}</p>
                ${alert.message ? `<p><strong>Message:</strong> ${alert.message}</p>` : ''}
                ${alert.emergencyType ? `<p><strong>Emergency Type:</strong> ${alert.emergencyType}</p>` : ''}
            </div>
            
            <div class="alert-actions">
                <button class="alert-btn primary" onclick="callUser('${userPhone}', '${userName}')">
                    📞 Call ${userName}
                </button>
                <button class="alert-btn secondary" onclick="contactAuthorities('${userName}', '${location}')">
                    🚓 Contact Authorities
                </button>
            </div>
            
            <div class="status-updates">
                <button class="alert-btn status-btn" 
                        onclick="updateAlertStatus('${alert._id}', 'contacted')" 
                        ${isUpdating ? 'disabled' : ''}
                        style="background: ${isUpdating ? '#ccc' : 'var(--success)'}; color: white; margin-top: 0.5rem;">
                    ${isUpdating ? '⏳ Updating...' : '✅ Mark as Contacted'}
                </button>
            </div>
        </div>
    `;
}

function updateStats(alerts) {
    const activeAlerts = alerts.filter(alert => alert.status === 'active').length;
    const totalAlerts = alerts.length;
    const respondedAlerts = alerts.filter(alert => 
        alert.responseUpdates && alert.responseUpdates.some(update => 
            update.contactId && update.contactId.toString() === currentContact.id
        )
    ).length;
    const responseRate = totalAlerts > 0 ? Math.round((respondedAlerts / totalAlerts) * 100) : 0;

    document.getElementById('active-alerts').textContent = activeAlerts;
    document.getElementById('total-alerts').textContent = totalAlerts;
    document.getElementById('response-rate').textContent = responseRate + '%';
}

function showNoAlerts() {
    document.getElementById('no-alerts').classList.remove('hidden');
    document.getElementById('alerts-container').innerHTML = '';
    document.getElementById('alert-count').textContent = '0';
    updateStats([]);
}

function showLoadingState() {
    document.getElementById('alerts-loading').classList.remove('hidden');
    document.getElementById('alerts-error').classList.add('hidden');
    document.getElementById('no-alerts').classList.add('hidden');
}

function hideLoadingState() {
    document.getElementById('alerts-loading').classList.add('hidden');
}

function showErrorState(message) {
    document.getElementById('alerts-loading').classList.add('hidden');
    document.getElementById('alerts-error').classList.remove('hidden');
    document.getElementById('alerts-error').querySelector('p').textContent = message;
}

function callUser(phoneNumber, userName) {
    alert(`Calling ${userName} at ${phoneNumber}...\n\nIn a real implementation, this would connect you directly.`);
}

function contactAuthorities(userName, location) {
    const locationInfo = location ? `\nLocation: ${location}` : '';
    alert(`Contacting local authorities...\n\nEmergency information for ${userName} would be shared automatically.${locationInfo}`);
}

// Enhanced updateAlertStatus function for contacts
async function updateAlertStatus(alertId, status) {
    if (updatingAlerts.has(alertId)) {
        console.log('⚠️ Alert update already in progress for:', alertId);
        return;
    }
    
    updatingAlerts.add(alertId);
    
    // Update local storage first for immediate feedback
    updateLocalAlertStatus(alertId, status);
    
    try {
        const token = localStorage.getItem('gbv_contact_token');
        console.log(`📝 Updating alert ${alertId} to status: ${status}`);
        
        const response = await fetch(`${API_BASE}/alerts/${alertId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                status: status,
                contactId: currentContact.id,
                contactName: currentContact.name,
                notes: `Status updated by trusted contact: ${currentContact.name}`,
                timestamp: new Date().toISOString()
            })
        });

        if (response.ok) {
            const updatedAlert = await response.json();
            console.log(`✅ Alert status updated to: ${status}`);
            showNotification(`Status updated to: ${status}`);
            
            // Update local storage with server response
            updateLocalAlertStatus(alertId, status, updatedAlert);
            
            // Notify via socket
            if (socket) {
                socket.emit('alert-status-update', {
                    alertId: alertId,
                    status: status,
                    contactName: currentContact.name,
                    userId: updatedAlert.userId,
                    timestamp: new Date()
                });
            }
            
        } else {
            throw new Error('Failed to update status on server');
        }
        
    } catch (error) {
        console.error('❌ Error updating status:', error);
        showNotification('Error updating status. Please try again.');
        
        // Revert local status on error
        updateLocalAlertStatus(alertId, 'active');
    } finally {
        // Remove from updating set and reload
        setTimeout(() => {
            updatingAlerts.delete(alertId);
            loadContactAlerts();
        }, 1000);
    }
}

function updateLocalAlertStatus(alertId, status, serverData = null) {
    const contactAlerts = JSON.parse(localStorage.getItem('gbv_contact_alerts') || '[]');
    const alertIndex = contactAlerts.findIndex(alert => alert.alertId === alertId);
    
    if (alertIndex !== -1) {
        contactAlerts[alertIndex].status = status;
        contactAlerts[alertIndex].lastUpdated = new Date().toISOString();
        contactAlerts[alertIndex].responded = status !== 'active';
        
        if (serverData) {
            contactAlerts[alertIndex].serverResponse = serverData;
        }
        
        localStorage.setItem('gbv_contact_alerts', JSON.stringify(contactAlerts));
    }
}

function initializeContactSocket() {
    const socketUrl = window.location.hostname.includes('localhost') 
        ? 'http://localhost:3000' 
        : window.location.origin;
    
    console.log('🔌 Connecting to socket server:', socketUrl);
    
    socket = io(socketUrl, {
        transports: ['websocket', 'polling']
    });
    
    if (currentContact && currentContact.id) {
        socket.emit('join-contact-room', currentContact.id);
        console.log('✅ Joined contact room:', currentContact.id);
    }
    
    // FIXED: Listen for new alerts with proper event handling
    socket.on('new-alert', (alertData) => {
        console.log('🚨 NEW ALERT RECEIVED VIA SOCKET:', alertData);
        handleNewAlert(alertData);
    });

    // Also listen for broadcast alerts
    socket.on('new-alert-broadcast', (alertData) => {
        console.log('📢 BROADCAST ALERT RECEIVED:', alertData);
        handleNewAlert(alertData);
    });
    
    socket.on('alert-status-update', (updateData) => {
        console.log('📝 Alert status updated:', updateData);
        showNotification(`Update: ${updateData.contactName} marked alert as ${updateData.status}`);
        loadContactAlerts();
    });

    socket.on('connect', () => {
        console.log('✅ Connected to server as trusted contact');
        showNotification('Connected to emergency alert system');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        showNotification('Disconnected from server - alerts may be delayed');
    });

    socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
    });

    // Test socket connection
    socket.emit('ping', { message: 'Hello from trusted contact app' });
    socket.on('pong', (data) => {
        console.log('📡 Socket test successful:', data);
    });
}

// Enhanced alert handling for trusted contacts
function handleNewAlert(alertData) {
    console.log('🔄 Processing new alert:', alertData);
    
    // Check if this alert is for this specific contact
    const isForThisContact = alertData.trustedContacts && 
        alertData.trustedContacts.some(contact => 
            contact.email === currentContact.email || 
            contact.phone === currentContact.phone
        );
    
    if (!isForThisContact) {
        console.log('⚠️ Alert not for this contact, ignoring');
        return;
    }
    
    // Play emergency sound
    playEmergencySound();
    
    // Show emergency notification
    showEmergencyNotification(alertData);
    
    // Store alert locally
    storeContactAlert(alertData);
    
    // Reload alerts to show the new one
    loadContactAlerts();
    
    // Send acknowledgment back to server
    sendAlertAcknowledgment(alertData);
    
    // Vibrate if supported
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
}

function storeContactAlert(alertData) {
    const contactAlerts = JSON.parse(localStorage.getItem('gbv_contact_alerts') || '[]');
    
    // Check if alert already exists
    const existingIndex = contactAlerts.findIndex(alert => 
        alert.alertId === alertData._id || alert.alertId === alertData.alertId
    );
    
    if (existingIndex === -1) {
        contactAlerts.push({
            alertId: alertData._id || alertData.alertId,
            userId: alertData.userId,
            userName: alertData.userName,
            userPhone: alertData.userPhone,
            location: alertData.location,
            coordinates: alertData.coordinates,
            message: alertData.message,
            emergencyType: alertData.emergencyType,
            status: 'active',
            receivedAt: new Date().toISOString(),
            responded: false
        });
        
        localStorage.setItem('gbv_contact_alerts', JSON.stringify(contactAlerts));
        console.log('✅ Alert stored locally for contact');
    }
}

async function sendAlertAcknowledgment(alertData) {
    try {
        const token = localStorage.getItem('gbv_contact_token');
        const alertId = alertData._id || alertData.alertId;
        
        const response = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                contactId: currentContact.id,
                contactName: currentContact.name,
                timestamp: new Date().toISOString()
            })
        });
        
        if (response.ok) {
            console.log('✅ Alert acknowledgment sent to server');
            
            // Notify via socket that this contact is responding
            if (socket) {
                socket.emit('contact-responding', {
                    alertId: alertId,
                    contactId: currentContact.id,
                    contactName: currentContact.name,
                    userId: alertData.userId
                });
            }
        }
    } catch (error) {
        console.error('Error sending acknowledgment:', error);
    }
}

function playEmergencySound() {
    try {
        const emergencySound = document.getElementById('emergency-sound');
        if (emergencySound) {
            emergencySound.volume = 0.7;
            emergencySound.play().catch(e => {
                console.log('🔇 Sound play prevented:', e);
            });
        }
    } catch (error) {
        console.log('🔇 Sound play error:', error);
    }
}

function showEmergencyNotification(alertData) {
    const userName = alertData.userName || 'User';
    const location = alertData.location || 'Location unknown';
    
    console.log('🔄 Showing emergency notification for:', userName);
    
    // Create browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚨 EMERGENCY ALERT - Safety Shield', {
            body: `${userName} needs your help!\nLocation: ${location}\nClick to view details.`,
            icon: '/icon.png',
            requireInteraction: true,
            tag: 'emergency-alert',
            vibrate: [200, 100, 200]
        });
    } else if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification('🚨 EMERGENCY ALERT - Safety Shield', {
                    body: `${userName} needs your help!`,
                    icon: '/icon.png',
                    requireInteraction: true
                });
            }
        });
    }
    
    // Show on-screen notification
    showNotification(`🚨 EMERGENCY ALERT!\n\n${userName} needs your help immediately!\nLocation: ${location}\n\nPlease respond quickly!`);
}

function showNotification(message) {
    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--danger);
        color: white;
        padding: 20px;
        border-radius: 12px;
        z-index: 10000;
        box-shadow: 0 8px 25px rgba(220, 20, 60, 0.6);
        max-width: 350px;
        animation: slideIn 0.5s ease-out;
        font-weight: bold;
        font-size: 1.1rem;
        border: 3px solid #fff;
        text-align: center;
    `;
    notificationDiv.innerHTML = message.replace(/\n/g, '<br>');
    document.body.appendChild(notificationDiv);
    
    // Make notification clickable to focus the app
    notificationDiv.addEventListener('click', () => {
        window.focus();
        if (notificationDiv.parentNode) {
            document.body.removeChild(notificationDiv);
        }
    });
    
    setTimeout(() => {
        if (notificationDiv.parentNode) {
            document.body.removeChild(notificationDiv);
        }
    }, 10000); // Show for 10 seconds for emergencies
}

function showEmergencyNotification(alertData) {
    const userName = alertData.userName || 'User';
    
    console.log('🔄 Showing emergency notification for:', userName);
    
    // Create browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚨 EMERGENCY ALERT', {
            body: `${userName} needs your help! Location: ${alertData.location}`,
            icon: '/icon.png',
            requireInteraction: true,
            tag: 'emergency-alert'
        });
    } else if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification('🚨 EMERGENCY ALERT', {
                    body: `${userName} needs your help!`,
                    icon: '/icon.png',
                    requireInteraction: true
                });
            }
        });
    }
    
    // Show on-screen notification
    showNotification(`🚨 EMERGENCY ALERT!\n\n${userName} needs your help immediately!\nLocation: ${alertData.location}`);
}

function showNotification(message) {
    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--danger);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
        font-weight: bold;
    `;
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    
    setTimeout(() => {
        if (notificationDiv.parentNode) {
            document.body.removeChild(notificationDiv);
        }
    }, 10000); // Show for 10 seconds for emergencies
}

// Quick Actions Functions
function testCall() {
    if (currentContact && currentContact.userPhone) {
        alert(`Test Call Initiated:\n\nCalling ${currentContact.userName} at ${currentContact.userPhone}\n\nThis would connect to the user in a real implementation.`);
    } else {
        alert('Test Call: This would simulate calling the person who added you as a trusted contact.\n\nIn a real implementation, it would dial their number directly.');
    }
}

function openSafetyGuide() {
    const safetyGuideHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Safety Guide & Response Protocols</h3>
                <button class="close-btn" onclick="hideModal('safety-guide-modal')">×</button>
            </div>
            <div class="modal-body" style="padding: 1.5rem; max-height: 60vh; overflow-y: auto;">
                <div class="safety-section">
                    <h4>🚨 Immediate Response Protocol</h4>
                    <ol>
                        <li><strong>Call the Person First</strong> - Try to reach them directly</li>
                        <li><strong>Assess the Situation</strong> - Ask if they're safe and need help</li>
                        <li><strong>Contact Authorities</strong> - If no response or immediate danger</li>
                        <li><strong>Coordinate with Other Contacts</strong> - Work as a team</li>
                    </ol>
                </div>
                
                <div class="safety-section">
                    <h4>📞 Communication Guidelines</h4>
                    <ul>
                        <li>Use the safe word: <strong>BLUEBIRD</strong> to confirm safety</li>
                        <li>Ask yes/no questions if they can't speak freely</li>
                        <li>Listen for background noises and context clues</li>
                        <li>Don't hang up until you know they're safe</li>
                    </ul>
                </div>
            </div>
        </div>
    `;
    
    showCustomModal('safety-guide-modal', safetyGuideHTML);
}

function viewResponseProtocol() {
    const protocolHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Emergency Response Protocol</h3>
                <button class="close-btn" onclick="hideModal('protocol-modal')">×</button>
            </div>
            <div class="modal-body" style="padding: 1.5rem;">
                <div class="protocol-steps">
                    <div class="step">
                        <span class="step-number">1</span>
                        <div class="step-content">
                            <h4>Immediate Action</h4>
                            <p>Call the person within 2 minutes of receiving alert</p>
                        </div>
                    </div>
                    <div class="step">
                        <span class="step-number">2</span>
                        <div class="step-content">
                            <h4>Assessment</h4>
                            <p>Determine safety level and immediate needs</p>
                        </div>
                    </div>
                    <div class="step">
                        <span class="step-number">3</span>
                        <div class="step-content">
                            <h4>Escalation</h4>
                            <p>Contact authorities if danger is confirmed</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    showCustomModal('protocol-modal', protocolHTML);
}

function showCustomModal(modalId, contentHTML) {
    const existingModal = document.getElementById(modalId);
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal active';
    modal.innerHTML = contentHTML;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            hideModal(modalId);
        }
    });
}

function callNumber(number) {
    const confirmed = confirm(`Call ${number}?\n\nIn a real app, this would automatically dial the number.`);
    
    if (confirmed) {
        showNotification(`Connecting to ${number}...`);
        console.log(`Call attempted to: ${number}`);
    }
}

function viewEmergencyContacts() {
    showModal('contacts-modal');
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showNoAlerts() {
    document.getElementById('no-alerts').classList.remove('hidden');
    document.getElementById('alerts-container').innerHTML = '';
    document.getElementById('alert-count').textContent = '0';
    updateStats([]);
}

// Request notification permission on page load
document.addEventListener('DOMContentLoaded', function() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});

// Make functions globally available
window.callUser = callUser;
window.contactAuthorities = contactAuthorities;
window.updateAlertStatus = updateAlertStatus;
window.contactLogout = contactLogout;
window.testCall = testCall;
window.viewEmergencyContacts = viewEmergencyContacts;
window.openSafetyGuide = openSafetyGuide;
window.viewResponseProtocol = viewResponseProtocol;
window.callNumber = callNumber;
window.hideModal = hideModal;