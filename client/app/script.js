const API_BASE = 'http://localhost:5000/api';
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
    socket = io('http://localhost:5000');
    
    socket.emit('join-room', currentUser.id);
    
    socket.on('alert-status-update', (data) => {
        console.log('Alert update:', data);
        // Handle alert status updates
    });
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
            alert('Emergency alert sent to your trusted contacts!');
            showScreen('app');
            
            // Notify via socket
            if (socket) {
                socket.emit('send-alert', {
                    userId: currentUser.id,
                    userName: currentUser.name,
                    location: location,
                    trustedContacts: [] // Would be populated from user data
                });
            }
        } else {
            alert('Failed to send emergency alert');
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
            },
            (error) => {
                document.getElementById('location-text').textContent = 
                    'Location access denied. Using last known location.';
            }
        );
    } else {
        document.getElementById('location-text').textContent = 
            'Geolocation not supported by browser';
    }
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
            contactsContainer.innerHTML = contacts.map(contact => 
                `<div class="contact-item">
                    <span>${contact.name}</span>
                    <span>${contact.relationship}</span>
                </div>`
            ).join('');
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

function showAddContactModal() {
    document.getElementById('add-contact-modal').classList.add('active');
}

function hideAddContactModal() {
    document.getElementById('add-contact-modal').classList.remove('active');
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
            hideAddContactModal();
            document.getElementById('add-contact-form').reset();
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
        const response = await fetch(`${API_BASE}/contacts`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('gbv_token')}`
            }
        });

        if (response.ok) {
            const contacts = await response.json();
            const contactsList = document.getElementById('contacts-list');
            contactsList.innerHTML = contacts.map(contact => 
                `<div class="contact-item">
                    <div>
                        <strong>${contact.name}</strong>
                        <div>${contact.relationship}</div>
                        <div>${contact.phone}</div>
                    </div>
                    <button class="btn-secondary" onclick="deleteContact('${contact._id}')">Remove</button>
                </div>`
            ).join('');
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

function handleNavClick(e) {
    const screen = this.getAttribute('data-screen');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    this.classList.add('active');
    // Handle navigation to different screens
}

function handleQuickAction() {
    const screen = this.getAttribute('data-screen');
    // Handle quick action navigation
}

function toggleFakeMode() {
    const btn = document.getElementById('fake-mode-btn');
    if (btn.textContent === 'Activate Calendar Mode') {
        document.body.innerHTML = `
            <div style="padding: 2rem; text-align: center;">
                <h2>October 2023</h2>
                <div style="margin: 2rem 0;">
                    <p>Tap and hold any date to access safety features</p>
                </div>
                <button onclick="location.reload()" style="padding: 1rem 2rem; background: #8B008B; color: white; border: none; border-radius: 8px;">
                    Return to Safety App
                </button>
            </div>
        `;
    }
}

async function loadUserData() {
    document.getElementById('user-name').textContent = currentUser.name;
    loadContacts();
}