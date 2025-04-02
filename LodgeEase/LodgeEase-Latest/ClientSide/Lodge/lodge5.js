import { auth, db } from '../../AdminSide/firebase.js';
import { initializeUserDrawer } from '../components/userDrawer.js';
import { LodgeComponent } from '../components/LodgeComponent.js';
import { ReviewSystem } from '../components/reviewSystem.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize the lodge component with configuration
    const lodgeConfig = {
        lodgeId: 'lodge5',
        lodgeName: 'Super Apartment- Room 6',
        nightlyRate: 6000,
        serviceFeePercentage: 0.14,
        location: 'Bonifacio Street, Baguio City',
        maxGuests: 3,
        amenities: ['City View', 'WiFi', 'Near Eatery'],
        images: ['../components/SuperApartmentRoom6.jpg'],
        hostInfo: {
            name: 'Super Apartment Management',
            contactNumber: '123-456-7890'
        }
    };

    const lodge = new LodgeComponent(lodgeConfig);

    // Initialize review system
    const reviewSystem = new ReviewSystem(lodgeConfig.lodgeId);
    reviewSystem.initialize();

    // Initialize event listeners
    initializeEventListeners();

    // Auth state observer
    auth.onAuthStateChanged((user) => {
        if (!user) {
            window.location.href = '../Login/index.html';
        }
    });

    // Add auth state observer to handle login button visibility
    auth.onAuthStateChanged((user) => {
        const loginButton = document.getElementById('loginButton');
        if (loginButton) {
            if (user) {
                loginButton.classList.add('hidden');
            } else {
                loginButton.classList.remove('hidden');
            }
        }
    });
});

function initializeEventListeners() {
    const userIcon = document.getElementById('userIconBtn');
    const userDrawer = document.getElementById('userDrawer');
    const closeDrawer = document.getElementById('closeDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');

    if (userIcon && userDrawer && closeDrawer && drawerOverlay) {
        // Open drawer
        userIcon.addEventListener('click', function(e) {
            e.preventDefault();
            userDrawer.classList.remove('translate-x-full');
            drawerOverlay.classList.remove('hidden');
        });

        // Close drawer
        closeDrawer.addEventListener('click', closeUserDrawer);
        drawerOverlay.addEventListener('click', closeUserDrawer);
    }

    // Add favorite button functionality
    const favoriteButton = document.querySelector('.ri-heart-line')?.parentElement;
    if (favoriteButton) {
        favoriteButton.addEventListener('click', () => {
            favoriteButton.querySelector('i').classList.toggle('ri-heart-line');
            favoriteButton.querySelector('i').classList.toggle('ri-heart-fill');
            favoriteButton.querySelector('i').classList.toggle('text-red-500');
        });
    }
}

function closeUserDrawer() {
    const userDrawer = document.getElementById('userDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    userDrawer.classList.add('translate-x-full');
    drawerOverlay.classList.add('hidden');
}

// Initialize the user drawer with auth and db
initializeUserDrawer(auth, db);
