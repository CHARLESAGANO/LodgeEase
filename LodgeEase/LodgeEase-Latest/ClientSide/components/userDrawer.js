import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, collection, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function initializeUserDrawer(auth, db) {
    console.log('Starting user drawer initialization with auth:', !!auth, 'db:', !!db);

    if (!auth || !db) {
        console.error('Auth or Firestore not initialized');
        return;
    }

    // Get elements
    const userIconBtn = document.getElementById('userIconBtn');
    const drawer = document.getElementById('userDrawer');
    
    if (!userIconBtn || !drawer) {
        console.error('Required elements not found:', { userIconBtn: !!userIconBtn, drawer: !!drawer });
        return;
    }

    console.log('Elements found:', { userIconBtn: !!userIconBtn, drawer: !!drawer });

    // Add click handler to user icon
    userIconBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('User icon clicked');
        drawer.classList.toggle('translate-x-full');
    });

    // Close drawer when clicking outside
    document.addEventListener('click', (e) => {
        if (!drawer.contains(e.target) && !userIconBtn.contains(e.target)) {
            drawer.classList.add('translate-x-full');
        }
    });

    // Handle authentication state changes
    onAuthStateChanged(auth, async (user) => {
        console.log('Auth state changed:', user ? 'User logged in' : 'No user');
        const drawerContent = drawer.querySelector('.drawer-content');
        if (!drawerContent) {
            console.error('Drawer content element not found');
            return;
        }

        try {
            if (user) {
                console.log('Fetching user data for:', user.uid);
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if (!userDoc.exists()) {
                    console.log('No user document found');
                    drawerContent.innerHTML = generateErrorContent();
                    return;
                }

                const userData = userDoc.data();
                drawerContent.innerHTML = generateUserDrawerContent(userData);

                // Add logout functionality
                const logoutBtn = document.getElementById('logoutBtn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', async () => {
                        try {
                            await signOut(auth);
                            window.location.href = '../Login/index.html';
                        } catch (error) {
                            console.error('Error signing out:', error);
                        }
                    });
                }

                // Add close drawer functionality
                const closeDrawerBtn = document.getElementById('closeDrawer');
                if (closeDrawerBtn) {
                    closeDrawerBtn.addEventListener('click', () => {
                        drawer.classList.add('translate-x-full');
                    });
                }

                // Add this after drawer content is generated
                const showBookingsBtn = document.getElementById('showBookingsBtn');
                const bookingsPopup = document.getElementById('bookingsPopup');
                const closeBookingsPopup = document.getElementById('closeBookingsPopup');

                if (showBookingsBtn && bookingsPopup && closeBookingsPopup) {
                    showBookingsBtn.addEventListener('click', () => {
                        bookingsPopup.classList.remove('hidden');
                        drawer.classList.add('translate-x-full'); // Close the drawer when opening bookings
                    });

                    closeBookingsPopup.addEventListener('click', () => {
                        bookingsPopup.classList.add('hidden');
                    });

                    // Close popup when clicking outside
                    bookingsPopup.addEventListener('click', (e) => {
                        if (e.target === bookingsPopup) {
                            bookingsPopup.classList.add('hidden');
                        }
                    });

                    // Handle booking tabs
                    const tabButtons = bookingsPopup.querySelectorAll('[data-tab]');
                    tabButtons.forEach(button => {
                        button.addEventListener('click', () => {
                            // Remove active state from all tabs
                            tabButtons.forEach(btn => {
                                btn.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
                                btn.classList.add('text-gray-500');
                            });

                            // Add active state to clicked tab
                            button.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
                            button.classList.remove('text-gray-500');

                            // Show corresponding content
                            const tabName = button.dataset.tab;
                            document.getElementById('currentBookings').classList.toggle('hidden', tabName !== 'current');
                            document.getElementById('previousBookings').classList.toggle('hidden', tabName !== 'previous');
                        });
                    });
                }

                // Call initializeSettingsPopup after generating drawer content
                setupEventListeners();

                const myBookingsBtn = document.getElementById('myBookingsBtn');
                if (myBookingsBtn) {
                    myBookingsBtn.addEventListener('click', () => {
                        const bookingsPopup = document.getElementById('bookingsPopup');
                        if (bookingsPopup) {
                            bookingsPopup.classList.remove('hidden');
                            drawer.classList.add('translate-x-full'); // Close the drawer
                        }
                    });
                }
            } else {
                drawerContent.innerHTML = generateLoginContent();
                
                // Add close drawer functionality
                const closeDrawerBtn = document.getElementById('closeDrawer');
                if (closeDrawerBtn) {
                    closeDrawerBtn.addEventListener('click', () => {
                        drawer.classList.add('translate-x-full');
                    });
                }
            }
        } catch (error) {
            console.error('Error updating drawer content:', error);
            drawerContent.innerHTML = generateErrorContent();
        }
    });
}

// Update the generateUserDrawerContent function
function generateUserDrawerContent(userData) {
    return `
        <div class="p-6">
            <!-- User Info -->
            <div class="flex items-center space-x-4 mb-6">
                <div class="bg-blue-100 rounded-full p-3">
                    <i class="ri-user-line text-2xl text-blue-600"></i>
                </div>
                <div>
                    <h3 class="font-medium">${userData.fullname || 'Guest'}</h3>
                    <p class="text-sm text-gray-500">${userData.email}</p>
                </div>
            </div>
            
            <!-- Navigation -->
            <nav class="space-y-2">
                <a href="../Dashboard/dashboard.html" class="flex items-center space-x-2 text-gray-600 hover:text-blue-600 transition-colors">
                    <i class="ri-dashboard-line"></i>
                    <span>Dashboard</span>
                </a>
                <button id="showSettingsBtn" class="w-full flex items-center space-x-2 text-gray-600 hover:text-blue-600 transition-colors">
                    <i class="ri-user-settings-line"></i>
                    <span>Profile Settings</span>
                </button>
                <button id="showBookingsBtn" class="w-full flex items-center space-x-2 text-gray-600 hover:text-blue-600 transition-colors">
                    <i class="ri-hotel-line"></i>
                    <span>My Bookings</span>
                </button>
            </nav>

            <!-- Profile Settings Popup -->
            <div id="settingsPopup" class="fixed inset-0 bg-black bg-opacity-50 hidden z-[70]">
                <div class="fixed right-0 top-0 w-96 h-full bg-white shadow-xl overflow-y-auto">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-6">
                            <h3 class="text-xl font-bold">Profile Settings</h3>
                            <button id="closeSettingsPopup" class="text-gray-500 hover:text-gray-700">
                                <i class="ri-close-line text-2xl"></i>
                            </button>
                        </div>

                        <form id="settingsForm" class="space-y-6">
                            <!-- Profile Picture -->
                            <div class="flex flex-col items-center mb-6">
                                <div class="w-24 h-24 bg-gray-200 rounded-full mb-2 flex items-center justify-center">
                                    <i class="ri-user-line text-4xl text-gray-400"></i>
                                </div>
                                <button type="button" class="text-blue-600 text-sm hover:text-blue-700">
                                    Change Photo
                                </button>
                            </div>

                            <!-- Personal Information -->
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Full Name
                                    </label>
                                    <input 
                                        type="text" 
                                        name="fullname" 
                                        value="${userData.fullname || ''}"
                                        class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Email
                                    </label>
                                    <input 
                                        type="email" 
                                        name="email" 
                                        value="${userData.email || ''}"
                                        class="w-full p-2 border rounded-lg bg-gray-50"
                                        readonly
                                    >
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Phone Number
                                    </label>
                                    <input 
                                        type="tel" 
                                        name="phone" 
                                        value="${userData.phone || ''}"
                                        class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                </div>
                            </div>

                            <!-- Preferences -->
                            <div class="space-y-4">
                                <h4 class="font-medium">Preferences</h4>
                                <div>
                                    <label class="flex items-center space-x-2">
                                        <input type="checkbox" name="emailNotifications" 
                                            ${userData.emailNotifications ? 'checked' : ''}>
                                        <span>Email Notifications</span>
                                    </label>
                                </div>
                                <div>
                                    <label class="flex items-center space-x-2">
                                        <input type="checkbox" name="smsNotifications"
                                            ${userData.smsNotifications ? 'checked' : ''}>
                                        <span>SMS Notifications</span>
                                    </label>
                                </div>
                                <div>
                                    <label class="flex items-center space-x-2">
                                        <input type="checkbox" name="darkMode"
                                            ${userData.darkMode ? 'checked' : ''}>
                                        <span>Dark Mode</span>
                                    </label>
                                </div>
                            </div>

                            <!-- Security -->
                            <div class="space-y-4">
                                <h4 class="font-medium">Security</h4>
                                <button type="button" 
                                        class="w-full text-left text-blue-600 hover:text-blue-700">
                                    Change Password
                                </button>
                                <button type="button"
                                        class="w-full text-left text-blue-600 hover:text-blue-700">
                                    Two-Factor Authentication
                                </button>
                            </div>

                            <!-- Save Button -->
                            <button type="submit" 
                                    class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
                                Save Changes
                            </button>
                        </form>
                    </div>
                </div>
            </div>
            
            <!-- Logout Button -->
            <button id="logoutBtn" class="w-full mt-6 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition-colors">
                Sign Out
            </button>
        </div>
    `;
}

// Add this helper function to generate bookings list
function generateBookingsList(bookings) {
    if (!bookings || bookings.length === 0) {
        return `<p class="text-gray-500 text-center">No bookings found</p>`;
    }

    return bookings.map(booking => `
        <div class="bg-gray-50 rounded-lg p-4">
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-semibold">${booking.lodgeName}</h4>
                    <p class="text-sm text-gray-600">${booking.location}</p>
                </div>
                <span class="text-sm font-medium ${booking.status === 'confirmed' ? 'text-green-600' : 'text-yellow-600'}">
                    ${booking.status}
                </span>
            </div>
            <div class="mt-2 text-sm text-gray-600">
                <p>Check-in: ${formatDate(booking.checkIn)}</p>
                <p>Check-out: ${formatDate(booking.checkOut)}</p>
            </div>
            <div class="mt-3 flex justify-between items-center">
                <span class="font-medium">₱${booking.price.toLocaleString()}</span>
                ${booking.status === 'confirmed' ? `
                    <button class="text-red-500 text-sm hover:text-red-700" onclick="cancelBooking('${booking.id}')">
                        Cancel
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Add this helper function to format dates
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function generateLoginContent() {
    return `
        <div class="p-6">
            <div class="mb-6">
                <h2 class="text-xl font-semibold">Welcome</h2>
            </div>
            <p class="text-gray-600 mb-6">Please log in to access your account.</p>
            <a href="../Login/index.html" class="block w-full bg-blue-500 text-white text-center py-2 rounded-lg hover:bg-blue-600 transition-colors">
                Log In
            </a>
        </div>
    `;
}

function generateErrorContent() {
    return `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold">Error</h2>
                <button id="closeDrawer" class="text-gray-500 hover:text-gray-700">
                    <i class="ri-close-line text-2xl"></i>
                </button>
            </div>
            <p class="text-red-500">There was an error loading your account information. Please try again later.</p>
            <button id="logoutBtn" class="w-full mt-6 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition-colors">
                Log Out
            </button>
        </div>
    `;
}

// Add function to handle booking cancellation
window.cancelBooking = async function(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }

    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        await updateDoc(bookingRef, {
            status: 'cancelled',
            cancelledAt: new Date()
        });

        // Refresh the bookings display
        const user = auth.currentUser;
        if (user) {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const bookingsPopup = document.getElementById('bookingsPopup');
                if (bookingsPopup) {
                    const currentBookings = document.getElementById('currentBookings');
                    const previousBookings = document.getElementById('previousBookings');
                    if (currentBookings && previousBookings) {
                        currentBookings.innerHTML = generateBookingsList(userData.currentBookings || []);
                        previousBookings.innerHTML = generateBookingsList(userData.previousBookings || []);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error cancelling booking:', error);
        alert('Failed to cancel booking. Please try again.');
    }
};

// Add this in the initializeUserDrawer function after drawer content is generated
function initializeSettingsPopup() {
    const showSettingsBtn = document.getElementById('showSettingsBtn');
    const settingsPopup = document.getElementById('settingsPopup');
    const closeSettingsPopup = document.getElementById('closeSettingsPopup');
    const settingsForm = document.getElementById('settingsForm');

    if (showSettingsBtn && settingsPopup && closeSettingsPopup) {
        showSettingsBtn.addEventListener('click', () => {
            settingsPopup.classList.remove('hidden');
        });

        closeSettingsPopup.addEventListener('click', () => {
            settingsPopup.classList.add('hidden');
        });

        settingsPopup.addEventListener('click', (e) => {
            if (e.target === settingsPopup) {
                settingsPopup.classList.add('hidden');
            }
        });

        if (settingsForm) {
            settingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(settingsForm);
                const updatedData = {
                    fullname: formData.get('fullname'),
                    phone: formData.get('phone'),
                    emailNotifications: formData.get('emailNotifications') === 'on',
                    smsNotifications: formData.get('smsNotifications') === 'on',
                    darkMode: formData.get('darkMode') === 'on'
                };

                try {
                    const userRef = doc(db, 'users', auth.currentUser.uid);
                    await updateDoc(userRef, updatedData);
                    alert('Settings updated successfully!');
                    settingsPopup.classList.add('hidden');
                } catch (error) {
                    console.error('Error updating settings:', error);
                    alert('Failed to update settings. Please try again.');
                }
            });
        }
    }
}

// Call initializeSettingsPopup after generating drawer content
function setupEventListeners() {
    initializeSettingsPopup();
}