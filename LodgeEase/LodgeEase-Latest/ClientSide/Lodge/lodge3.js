import { db, auth } from '../../AdminSide/firebase.js';
import { LodgeComponent } from '../components/LodgeComponent.js';
import { initializeUserDrawer } from '../components/userDrawer.js';

// Lodge configuration
const baguioHillsideConfig = {
    lodgeId: 'baguio-hillside-retreat',
    lodgeName: 'Baguio Hillside Retreat',
    nightlyRate: 3200,
    serviceFeePercentage: 0.14,
    location: 'Baguio City, Philippines',
    maxGuests: 2,
    roomDetails: {
        type: 'Mountain View Suite',
        number: '203',
        floor: '2nd'
    },
    amenities: [
        { icon: 'wifi', label: 'Free WiFi' },
        { icon: 'parking', label: 'Free parking' },
        { icon: 'tv', label: 'Smart TV' },
        { icon: 'mountain', label: 'Mountain view' },
        { icon: 'utensils', label: 'Kitchen' },
        { icon: 'snowflake', label: 'Air conditioning' },
        { icon: 'bath', label: 'Private bathroom' },
        { icon: 'couch', label: 'Seating area' }
    ],
    images: [
        '../components/3.jpg',
        '../components/4.jpg',
        '../components/5.jpg',
        '../components/6.jpg',
        '../components/7.jpg'
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
const lodge = new LodgeComponent(baguioHillsideConfig);

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