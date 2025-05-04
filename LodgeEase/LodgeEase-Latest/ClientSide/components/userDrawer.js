import { onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, collection, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Define Popup HTML separately
const changePasswordPopupHTML = `
<div id="changePasswordPopup" class="fixed inset-0 bg-black bg-opacity-50 hidden z-[80] flex items-center justify-center" style="z-index: 9999 !important;">
    <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">Change Password</h3>
            <button id="closeChangePasswordPopup" class="text-gray-500 hover:text-gray-700">
                <i class="ri-close-line text-2xl"></i>
            </button>
        </div>
        <form id="changePasswordForm" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input type="password" name="currentPassword" required class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input type="password" name="newPassword" required minlength="6" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input type="password" name="confirmPassword" required minlength="6" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
            </div>
            <p id="changePasswordError" class="text-red-500 text-sm hidden"></p>
            <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
                Update Password
            </button>
        </form>
    </div>
</div>
`;

// Define Settings Popup HTML
const settingsPopupHTML = `
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
                        <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input type="text" name="fullname" value="" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" name="email" value="" class="w-full p-2 border rounded-lg bg-gray-50" readonly>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                        <input type="tel" name="phone" value="" class="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>

                <!-- Preferences -->
                <div class="space-y-4">
                    <h4 class="font-medium">Preferences</h4>
                    <div>
                        <label class="flex items-center space-x-2">
                            <input type="checkbox" name="emailNotifications">
                            <span>Email Notifications</span>
                        </label>
                    </div>
                </div>

                <!-- Security -->
                <div class="space-y-4">
                    <h4 class="font-medium">Security</h4>
                    <button type="button" id="changePasswordBtn_insideSettings" class="w-full text-left text-blue-600 hover:text-blue-700">
                        Change Password
                    </button>
                </div>

                <!-- Save Button -->
                <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    Save Changes
                </button>
            </form>
        </div>
    </div>
</div>
`;

// Function to add popups to the body if they don't exist
function ensureSecurityPopupsExist() {
    if (!document.getElementById('changePasswordPopup')) {
        document.body.insertAdjacentHTML('beforeend', changePasswordPopupHTML);
    }
    // Add Settings Popup check
    if (!document.getElementById('settingsPopup')) {
        document.body.insertAdjacentHTML('beforeend', settingsPopupHTML);
    }
}

export function initializeUserDrawer(auth, db) {
    console.log('Starting user drawer initialization with auth:', !!auth, 'db:', !!db);

    // Add the popups to the DOM body once
    ensureSecurityPopupsExist();

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
    userIconBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    drawer.querySelector('.drawer-content').innerHTML = generateUserDrawerContent(userData, auth);
                    setupEventListeners(auth, db);
                    
                    // Add close drawer functionality
                    const closeDrawerBtn = document.getElementById('closeDrawer');
                    if (closeDrawerBtn) {
                        closeDrawerBtn.addEventListener('click', () => {
                            drawer.classList.add('translate-x-full');
                        });
                    }
                } else {
                    console.log('No such user document!');
                    drawer.querySelector('.drawer-content').innerHTML = generateLoginContent();
                    
                    // Add close drawer functionality for login content
                    const closeDrawerBtn = document.getElementById('closeDrawer');
                    if (closeDrawerBtn) {
                        closeDrawerBtn.addEventListener('click', () => {
                            drawer.classList.add('translate-x-full');
                        });
                    }
                }
            } catch (error) {
                console.error("Error getting user document:", error);
                drawer.querySelector('.drawer-content').innerHTML = generateErrorContent();
            }
        } else {
            drawer.querySelector('.drawer-content').innerHTML = generateLoginContent();
            
            // Add close drawer functionality for login content
            const closeDrawerBtn = document.getElementById('closeDrawer');
            if (closeDrawerBtn) {
                closeDrawerBtn.addEventListener('click', () => {
                    drawer.classList.add('translate-x-full');
                });
            }
        }
        drawer.classList.remove('translate-x-full');
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
                drawerContent.innerHTML = generateUserDrawerContent(userData, auth);

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

                if (showBookingsBtn) {
                    showBookingsBtn.addEventListener('click', () => {
                        if (window.showBookingsModal) {
                            console.log('Calling global showBookingsModal function');
                            window.showBookingsModal();
                        } else {
                            console.log('showBookingsModal function not available yet, showing popup directly');
                            // Fallback to direct DOM manipulation if showBookingsModal isn't available
                            const bookingsPopup = document.getElementById('bookingsPopup');
                            if (bookingsPopup) {
                                bookingsPopup.classList.remove('hidden');
                                drawer.classList.add('translate-x-full'); // Close the drawer
                            } else {
                                console.error('Bookings popup not found in DOM');
                            }
                        }
                    });
                }

                if (bookingsPopup && closeBookingsPopup) {
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
                            document.getElementById('bookingHistoryContainer').classList.toggle('hidden', tabName !== 'history');
                        });
                    });
                }

                // Call initializeSettingsPopup after generating drawer content
                setupEventListeners(auth, db);

                const myBookingsBtn = document.getElementById('myBookingsBtn');
                if (myBookingsBtn) {
                    myBookingsBtn.addEventListener('click', () => {
                        if (window.showBookingsModal) {
                            console.log('Calling global showBookingsModal function from myBookingsBtn');
                            window.showBookingsModal();
                        } else {
                            console.log('showBookingsModal function not available yet, showing popup directly');
                            const bookingsPopup = document.getElementById('bookingsPopup');
                            if (bookingsPopup) {
                                bookingsPopup.classList.remove('hidden');
                                drawer.classList.add('translate-x-full'); // Close the drawer
                            } else {
                                console.error('Bookings popup not found in DOM');
                            }
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
function generateUserDrawerContent(userData, auth) {
    return `
        <div class="p-6">
            <!-- User Info with Close Button -->
            <div class="flex justify-between items-start mb-6">
                <div class="flex items-center space-x-4">
                    <div class="bg-blue-100 rounded-full p-3">
                        <i class="ri-user-line text-2xl text-blue-600"></i>
                    </div>
                    <div>
                        <h3 class="font-medium">${userData.fullname || 'Guest'}</h3>
                        <p class="text-sm text-gray-500">${userData.email}</p>
                    </div>
                </div>
                <button id="closeDrawer" class="text-gray-500 hover:text-gray-700 mt-1">
                    <i class="ri-close-line text-xl"></i>
                </button>
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
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold">Welcome</h2>
                <button id="closeDrawer" class="text-gray-500 hover:text-gray-700">
                    <i class="ri-close-line text-xl"></i>
                </button>
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
function initializeSettingsPopup(auth, db) {
    const showSettingsBtn = document.getElementById('showSettingsBtn'); // Button in the drawer nav
    const settingsPopup = document.getElementById('settingsPopup'); // Popup is now in body
    const closeSettingsPopup = document.getElementById('closeSettingsPopup'); // Button inside popup
    const settingsForm = document.getElementById('settingsForm'); // Form inside popup

    // Change Password Popup Elements (referenced from within settings popup logic now)
    const changePasswordBtn = document.getElementById('changePasswordBtn_insideSettings'); // Button inside Settings popup
    const changePasswordPopup = document.getElementById('changePasswordPopup'); // Popup in body
    const closeChangePasswordPopup = document.getElementById('closeChangePasswordPopup');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const changePasswordError = document.getElementById('changePasswordError');

    // Profile Settings Popup Logic
    if (showSettingsBtn && settingsPopup && closeSettingsPopup) {
        showSettingsBtn.addEventListener('click', async () => {
            // Populate form with latest data when opening
            const user = auth.currentUser;
            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        settingsForm.querySelector('[name="fullname"]').value = userData.fullname || '';
                        settingsForm.querySelector('[name="email"]').value = userData.email || '';
                        settingsForm.querySelector('[name="phone"]').value = userData.phone || '';
                        settingsForm.querySelector('[name="emailNotifications"]').checked = userData.emailNotifications || false;
                    } else {
                        console.log("User data not found for settings form");
                    }
                } catch (error) {
                    console.error("Error fetching user data for settings:", error);
                }
            }
            settingsPopup.classList.remove('hidden');
        });

        closeSettingsPopup.addEventListener('click', () => {
            settingsPopup.classList.add('hidden');
        });

        settingsPopup.addEventListener('click', (e) => {
            // Close only if clicking the backdrop, not the content
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
                    emailNotifications: formData.get('emailNotifications') === 'on'
                };

                try {
                    const user = auth.currentUser;
                    if (!user) {
                        alert('You must be logged in to update settings.');
                        return;
                    }
                    const userRef = doc(db, 'users', user.uid);
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

    // Change Password Popup Logic (triggered from *within* Settings popup)
    if (changePasswordBtn && changePasswordPopup && closeChangePasswordPopup && changePasswordForm) {
        changePasswordBtn.addEventListener('click', () => {
            // Optionally hide settings popup when opening change password?
            // settingsPopup.classList.add('hidden'); 
            changePasswordPopup.classList.remove('hidden');
        });
        closeChangePasswordPopup.addEventListener('click', () => {
            changePasswordPopup.classList.add('hidden');
            if (changePasswordError) changePasswordError.classList.add('hidden'); 
            changePasswordForm.reset(); 
        });
        changePasswordPopup.addEventListener('click', (e) => { // Close on backdrop click
            if (e.target === changePasswordPopup) {
                closeChangePasswordPopup.click();
            }
        });

        // Change password form submission logic remains the same
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(changePasswordError) changePasswordError.classList.add('hidden');
            const formData = new FormData(changePasswordForm);
            const currentPassword = formData.get('currentPassword');
            const newPassword = formData.get('newPassword');
            const confirmPassword = formData.get('confirmPassword');

            if (newPassword !== confirmPassword) {
                if(changePasswordError) {
                    changePasswordError.textContent = 'New passwords do not match.';
                    changePasswordError.classList.remove('hidden');
                }
                return;
            }
            if (newPassword.length < 6) {
                 if(changePasswordError) {
                    changePasswordError.textContent = 'Password must be at least 6 characters long.';
                    changePasswordError.classList.remove('hidden');
                }
                return;
            }

            const user = auth.currentUser;
            if (!user || !user.email) {
                 if(changePasswordError) {
                    changePasswordError.textContent = 'User not found or email missing.';
                    changePasswordError.classList.remove('hidden');
                }
                return;
            }

            // Re-authenticate user
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            try {
                await reauthenticateWithCredential(user, credential);
                // User re-authenticated, now update password
                await updatePassword(user, newPassword);
                alert('Password updated successfully!');
                closeChangePasswordPopup.click(); // Close the popup
            } catch (error) {
                console.error('Error updating password:', error);
                let errorMsg = 'An error occurred. Please try again.';
                if (error.code === 'auth/wrong-password') {
                    errorMsg = 'Incorrect current password.';
                } else if (error.code === 'auth/too-many-requests') {
                    errorMsg = 'Too many attempts. Please try again later.';
                }
                if(changePasswordError) {
                    changePasswordError.textContent = errorMsg;
                    changePasswordError.classList.remove('hidden');
                }
            }
        });
    }
}

// Call initializeSettingsPopup after generating drawer content
function setupEventListeners(auth, db) {
    initializeSettingsPopup(auth, db);
    
    // Add booking button functionality from within setupEventListeners
    const myBookingsBtn = document.getElementById('myBookingsBtn');
    if (myBookingsBtn) {
        myBookingsBtn.addEventListener('click', () => {
            if (window.showBookingsModal) {
                console.log('Calling global showBookingsModal function from myBookingsBtn');
                window.showBookingsModal();
            } else {
                console.log('showBookingsModal function not available yet, showing popup directly');
                const bookingsPopup = document.getElementById('bookingsPopup');
                if (bookingsPopup) {
                    bookingsPopup.classList.remove('hidden');
                    drawer.classList.add('translate-x-full'); // Close the drawer
                } else {
                    console.error('Bookings popup not found in DOM');
                }
            }
        });
    }
}