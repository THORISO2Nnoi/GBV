const API_BASE = 'http://localhost:5000/api';
let socket;
let currentContact = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeContactEventListeners();
    checkContactAuth();
});

function initializeContactEventListeners() {
    document.getElementById('contact-login-form').addEventListener('submit', handleContactLogin);
}

function checkContactAuth() {
    const token = localStorage.getItem('gbv_contact_token');
    const contact = localStorage.getItem('gbv_contact');
    
    if (token && contact) {
        currentContact = JSON.parse(contact);
        initializeContactSocket();
        loadContactAlerts();
        showContactInterface();
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
            showContactInterface();
        } else {
            alert(data.message || 'Login failed. Please check your credentials.');
        }
    } catch (error) {
        alert('Login error: ' + error.message);
    }
}

function showContactInterface() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('alert-container').style.display = 'block';
    
    // Show user info in header
    const header = document.querySelector('header');
    header.innerHTML += `
        <div style="margin-top: 1rem; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 8px;">
            <div>Logged in as: <strong>${currentContact.name}</strong></div>
            <div>Trusted contact for: <strong>${currentContact.userName}</strong></div>
            <button onclick="contactLogout()" style="margin-top: 0.5rem; padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 5px; cursor: pointer;">
                Logout
            </button>
        </div>
    `;
}

function contactLogout() {
    localStorage.removeItem('gbv_contact_token');
    localStorage.removeItem('gbv_contact');
    currentContact = null;
    if (socket) socket.disconnect();
    location.reload();
}

async function loadContactAlerts() {
    try {
        const token = localStorage.getItem('gbv_contact_token');
        const response = await fetch(`${API_BASE}/contact-auth/alerts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const alerts = await response.json();
            displayAlerts(alerts);
        } else {
            document.getElementById('no-alerts').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
        document.getElementById('no-alerts').style.display = 'block';
    }
}

function displayAlerts(alerts) {
    const alertContainer = document.getElementById('alert-container');
    const noAlerts = document.getElementById('no-alerts');
    
    if (alerts.length === 0) {
        noAlerts.style.display = 'block';
        alertContainer.innerHTML = '';
        return;
    }
    
    noAlerts.style.display = 'none';
    alertContainer.innerHTML = alerts.map(alert => createAlertHTML(alert)).join('');
}

function createAlertHTML(alert) {
    const user = alert.userId;
    const alertTime = new Date(alert.createdAt).toLocaleString();
    
    return `
        <div class="alert-item" style="margin-bottom: 2rem; border: 2px solid var(--danger); border-radius: 15px; overflow: hidden;">
            <div class="alert-header">
                <h2><span class="alert-icon">🚨</span> EMERGENCY ALERT</h2>
                <p>${user.name} needs your help</p>
            </div>
            
            <div class="alert-content">
                <div class="user-info">
                    <div class="user-avatar">${user.name.charAt(0)}</div>
                    <div class="user-details">
                        <h3>${user.name}</h3>
                        <p>Your ${currentContact.relationship}</p>
                        <div class="alert-time">Alert received: ${alertTime}</div>
                    </div>
                </div>
                
                ${alert.location ? `
                <div class="info-card">
                    <h3><span class="info-icon">📍</span> Location</h3>
                    <p><strong>${alert.location.address || alert.location}</strong></p>
                    <div class="location-map">
                        <div class="map-marker" style="top: 45%; left: 60%;"></div>
                        <div style="text-align: center;">
                            <div>Approximate Location</div>
                            <div style="font-size: 0.8rem; margin-top: 10px; opacity: 0.8;">Emergency alert active</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                ${alert.message ? `
                <div class="info-card">
                    <h3><span class="info-icon">💬</span> Message</h3>
                    <p>${alert.message}</p>
                </div>
                ` : ''}
                
                <div class="action-buttons">
                    <button class="action-btn primary" onclick="callUser('${user.phone}', '${user.name}')">
                        <span class="btn-icon">📞</span>
                        Call ${user.name}
                    </button>
                    <button class="action-btn secondary" onclick="contactAuthorities('${user.name}', '${alert.location}')">
                        <span class="btn-icon">🚓</span>
                        Contact Authorities
                    </button>
                    <button class="action-btn tertiary" onclick="sendCheckIn('${user.name}')">
                        <span class="btn-icon">💬</span>
                        Send Check-in
                    </button>
                </div>
                
                <div class="instructions">
                    <h3>Safety Response Guide</h3>
                    <ul>
                        <li><strong>Call ${user.name} first</strong> - Check if they can talk safely</li>
                        <li><strong>Listen for safe word</strong> - Their safe word is: <em>bluebird</em></li>
                        <li><strong>If no answer</strong> - Contact local authorities immediately</li>
                        <li><strong>Do not approach directly</strong> if the situation might be dangerous</li>
                        <li><strong>Coordinate with other trusted contacts</strong></li>
                    </ul>
                </div>
                
                <div class="status-updates">
                    <div class="status-header">
                        <h3>Response Status</h3>
                        <div style="color: var(--danger); font-weight: bold;">ACTIVE EMERGENCY</div>
                    </div>
                    
                    <div class="status-item">
                        <div class="status-icon pending">⏱️</div>
                        <div>
                            <strong>Emergency Alert Received</strong>
                            <div>You have been notified as a trusted contact</div>
                            <div style="font-size: 0.8rem; color: #666;">${alertTime}</div>
                        </div>
                    </div>
                </div>
                
                <div class="action-buttons">
                    <button class="action-btn tertiary" onclick="updateAlertStatus('${alert._id}', 'investigating')">
                        <span class="btn-icon">🔍</span>
                        Investigating
                    </button>
                    <button class="action-btn secondary" onclick="updateAlertStatus('${alert._id}', 'contacted')">
                        <span class="btn-icon">✅</span>
                        Contact Made
                    </button>
                    <button class="action-btn primary" onclick="resolveAlert('${alert._id}')">
                        <span class="btn-icon">🛡️</span>
                        Mark Resolved
                    </button>
                </div>
            </div>
        </div>
    `;
}

function callUser(phoneNumber, userName) {
    alert(`Calling ${userName} at ${phoneNumber}...\n\nIn a real implementation, this would connect you directly.`);
    
    // Simulate calling (in real app, this would use tel: link)
    window.open(`tel:${phoneNumber}`, '_self');
}

function contactAuthorities(userName, location) {
    const locationInfo = location ? `\nLocation: ${location}` : '';
    alert(`Contacting local authorities...\n\nEmergency information for ${userName} would be shared automatically.${locationInfo}`);
    
    // In real implementation, this would call emergency services
    window.open('tel:911', '_self');
}

function sendCheckIn(userName) {
    alert(`Sending check-in message to ${userName}...\n\nA discreet message would be sent through the safety app asking if they're safe.`);
}

async function updateAlertStatus(alertId, status) {
    try {
        const token = localStorage.getItem('gbv_contact_token');
        const response = await fetch(`${API_BASE}/alerts/${alertId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                status: status,
                notes: `Status updated by trusted contact: ${currentContact.name}`
            })
        });

        if (response.ok) {
            alert(`Status updated to: ${status}\n\nOther trusted contacts have been notified.`);
            
            if (socket) {
                socket.emit('alert-update', {
                    alertId: alertId,
                    status: status,
                    contactId: currentContact.id,
                    contactName: currentContact.name,
                    timestamp: new Date()
                });
            }
        } else {
            alert('Failed to update status');
        }
    } catch (error) {
        alert('Error updating status: ' + error.message);
    }
}

async function resolveAlert(alertId) {
    if (confirm('Mark this emergency as resolved? This will notify all trusted contacts.')) {
        await updateAlertStatus(alertId, 'resolved');
        
        // Reload alerts to update UI
        setTimeout(() => {
            loadContactAlerts();
        }, 1000);
    }
}

function initializeContactSocket() {
    socket = io('http://localhost:5000');
    
    socket.emit('join-room', currentContact.id);
    
    socket.on('new-alert', (alertData) => {
        alert(`NEW EMERGENCY ALERT!\n\n${currentContact.userName} needs your help immediately!`);
        loadContactAlerts(); // Reload to show new alert
    });
    
    socket.on('alert-status-update', (updateData) => {
        console.log('Alert status updated:', updateData);
        // Update UI to show other contacts' actions
        loadContactAlerts(); // Reload to get updated status
    });
}