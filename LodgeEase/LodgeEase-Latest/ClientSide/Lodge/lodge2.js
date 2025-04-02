import { db, auth } from '../../AdminSide/firebase.js';
import { LodgeComponent } from '../components/LodgeComponent.js';
import { initializeUserDrawer } from '../components/userDrawer.js';

// Lodge configuration
const mountainBreezeConfig = {
    lodgeId: 'mountain-breeze-lodge',
    lodgeName: 'Mountain Breeze Lodge',
    nightlyRate: 3200,
    serviceFeePercentage: 0.14,
    location: 'Baguio City, Philippines',
    maxGuests: 2,
    roomDetails: {
        type: 'Deluxe Suite',
        number: '304',
        floor: '3rd'
    },
    amenities: [
        { icon: 'wifi', label: 'Free WiFi' },
        { icon: 'parking', label: 'Free parking' },
        { icon: 'tv', label: 'Smart TV' },
        { icon: 'mountain', label: 'Mountain view' },
        { icon: 'utensils', label: 'Kitchen' },
        { icon: 'snowflake', label: 'Air conditioning' },
        { icon: 'coffee', label: 'Coffee maker' },
        { icon: 'couch', label: 'Living area' }
    ],
    images: [
        '../components/6.jpg',
        '../components/7.jpg',
        '../components/8.jpg',
        '../components/9.jpg',
        '../components/10.jpg'
    ],
    hostInfo: {
        name: 'Juan',
        image: '../components/model2.jpg',
        location: 'Tagaytay, Philippines',
        yearsHosting: 6,
        responseRate: 100,
        isSuperhost: true
    }
};

// Initialize the lodge
const lodge = new LodgeComponent(mountainBreezeConfig);

// Export for use in HTML
export const handleReserveClick = (event) => lodge.handleReserveClick(event);

// Initialize review system and user drawer
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize user drawer
        initializeUserDrawer(auth, db);
        
        // Initialize review system
        const reviewSystem = await lodge.initializeReviewSystem();
        
        // Add reserve button click handler
        const reserveBtn = document.getElementById('reserve-btn');
        if (reserveBtn) {
            reserveBtn.addEventListener('click', handleReserveClick);
        } else {
            console.error('Reserve button not found');
        }
    } catch (error) {
        console.error('Error initializing components:', error);
    }
});
