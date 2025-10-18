const API_BASE = window.location.hostname.includes('localhost') 
  ? 'http://localhost:10000/api' 
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
    contacts: document.getElementById('contacts-screen')
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
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', handleNavClick);
    });
    
    // Emergency features
    document.getElementById('emergency-btn').addEventListener('click', showEmergencyScreen);
    document.getElementById('cancel-emergency').addEventListener('click', cancelEmergency);
    document.getElementById('send-now').addEventListener('click', sendEmergencyNow);
    
    // Contacts
    document.getElementById('add-contact-btn').addEventListener('click', showAddContactModal);
    document.getElementById('cancel-contact').addEventListener('click', hideAddContactModal);
    document.getElementById('add-contact-form').addEventListener('submit', handleAddContact);
    
    // Quick actions
    document.querySelectorAll('.action-card').forEach(card => {
        card.addEventListener('click', handleQuickAction);
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
    screens[screenName].classList.add('active');
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
    // Use relative path for socket connection in production
    const socketUrl = window.location.hostname.includes('localhost') 
        ? 'http://localhost:10000' 
        : window.location.origin;
    
    socket = io(socketUrl);
    
    socket.emit('join-room', currentUser.id);
    
    socket.on('alert-status-update', (data) => {
        console.log('Alert update:', data);
        showAlert(`Trusted contact responded: ${data.status}`);
    });

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

function showAlert(message) {
    // Create a temporary alert notification
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
    `;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        document.body.removeChild(alertDiv);
    }, 5000);
}

function handleNavClick(e) {
    const screen = this.getAttribute('data-screen');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    this.classList.add('active');
    
    // Handle navigation to different screens
    switch(screen) {
        case 'home':
            showScreen('app');
            break;
        case 'chat':
            showChatScreen();
            break;
        case 'contacts':
            showContactsScreen();
            break;
        case 'profile':
            showProfileScreen();
            break;
    }
}

function handleQuickAction() {
    const screen = this.getAttribute('data-screen');
    switch(screen) {
        case 'contacts-screen':
            showContactsScreen();
            break;
        case 'safety-screen':
            showSafetyScreen();
            break;
        case 'resources-screen':
            showResourcesScreen();
            break;
        case 'evidence-screen':
            showEvidenceScreen();
            break;
    }
}

function showContactsScreen() {
    showScreen('contacts-screen');
    loadContacts();
}

function showChatScreen() {
    alert('Safe Chat feature would open here. In production, this would connect to trained counselors.');
}

function showProfileScreen() {
    alert('Profile settings would appear here.');
}

function showSafetyScreen() {
    alert('Safety planning tools would appear here.');
}

function showResourcesScreen() {
    alert('Local resources and helplines would appear here.');
}

function showEvidenceScreen() {
    alert('Secure evidence vault would open here.');
}

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
        const response = await fetch(`${API_BASE}/alerts/emergency`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('gbv_token')}`
            },
            body: JSON.stringify({
                location: location,
                message: 'Emergency assistance needed'
            })
        });

        if (response.ok) {
            const alertData = await response.json();
            showAlert('Emergency alert sent to your trusted contacts!');
            showScreen('app');
            
            // Notify via socket
            if (socket) {
                socket.emit('send-alert', {
                    userId: currentUser.id,
                    userName: currentUser.name,
                    location: location,
                    trustedContacts: alertData.trustedContactsNotified || []
                });
            }
        } else {
            const error = await response.json();
            alert('Failed to send emergency alert: ' + (error.message || 'Unknown error'));
        }
    } catch (error) {
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
                
                // Reverse geocoding would be implemented here in production
                getAddressFromCoordinates(lat, lng);
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

function getAddressFromCoordinates(lat, lng) {
    // This would be implemented with a geocoding service in production
    // For now, we'll just use the coordinates
    console.log('Coordinates:', lat, lng);
}

async function loadEmergencyContacts() {
    try {
        const response = await fetch(`${API_BASE}/contacts`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('gbv_token')}`
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
        const response = await fetch(`${API_BASE}/contacts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('gbv_token')}`
            },
            body: JSON.stringify({ name, phone, email, relationship })
        });

        if (response.ok) {
            const data = await response.json();
            hideAddContactModal();
            showAlert(`Contact ${name} added successfully!`);
            loadContacts();
            
            // Show temporary credentials (in production, this would be emailed)
            if (data.tempPassword) {
                alert(`Temporary password for ${name}: ${data.tempPassword}\n\nShare this with your contact so they can login.`);
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
        const response = await fetch(`${API_BASE}/contacts`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('gbv_token')}`
            }
        });

        if (response.ok) {
            const contacts = await response.json();
            const contactsList = document.getElementById('contacts-list');
            if (contacts.length > 0) {
                contactsList.innerHTML = contacts.map(contact => 
                    `<div class="contact-item">
                        <div>
                            <strong>${contact.name}</strong>
                            <div>${contact.relationship || 'Trusted Contact'}</div>
                            <div>${contact.phone}</div>
                            <div>${contact.email}</div>
                            <div style="font-size: 0.8rem; color: ${contact.isVerified ? 'green' : 'orange'};">
                                ${contact.isVerified ? '✅ Verified' : '⏳ Pending verification'}
                            </div>
                        </div>
                        <button class="btn-secondary" onclick="deleteContact('${contact._id}')">Remove</button>
                    </div>`
                ).join('');
            } else {
                contactsList.innerHTML = '<p style="text-align: center; padding: 2rem;">No trusted contacts added yet.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
        document.getElementById('contacts-list').innerHTML = '<p>Error loading contacts</p>';
    }
}

async function deleteContact(contactId) {
    if (confirm('Are you sure you want to remove this trusted contact?')) {
        try {
            const response = await fetch(`${API_BASE}/contacts/${contactId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('gbv_token')}`
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

function toggleFakeMode() {
    const btn = document.getElementById('fake-mode-btn');
    if (btn.textContent === 'Activate Calendar Mode') {
        // Create fake calendar interface
        document.body.innerHTML = `
            <div style="padding: 2rem; text-align: center; background: white; min-height: 100vh;">
                <h2 style="color: #8B008B; margin-bottom: 2rem;">October 2023</h2>
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin: 2rem 0;">
                    <div style="font-weight: bold; padding: 10px;">S</div>
                    <div style="font-weight: bold; padding: 10px;">M</div>
                    <div style="font-weight: bold; padding: 10px;">T</div>
                    <div style="font-weight: bold; padding: 10px;">W</div>
                    <div style="font-weight: bold; padding: 10px;">T</div>
                    <div style="font-weight: bold; padding: 10px;">F</div>
                    <div style="font-weight: bold; padding: 10px;">S</div>
                    ${Array.from({length: 35}, (_, i) => 
                        `<div style="padding: 15px; border: 1px solid #eee; border-radius: 5px; cursor: pointer; 
                            ${i >= 3 && i < 34 ? 'background: #f9f9f9;' : 'color: #ccc;'}">
                         ${i >= 3 && i < 34 ? i - 2 : ''}
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

async function loadUserData() {
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.name;
        loadContacts();
    }
}

// Make functions globally available for HTML onclick events
window.deleteContact = deleteContact;