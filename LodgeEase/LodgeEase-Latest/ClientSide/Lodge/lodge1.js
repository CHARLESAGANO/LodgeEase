import { db, auth } from '../../AdminSide/firebase.js';
import { LodgeComponent } from '../components/LodgeComponent.js';
import { initializeUserDrawer } from '../components/userDrawer.js';

// Lodge configuration
const pineHavenConfig = {
    lodgeId: 'pine-haven-lodge',
    lodgeName: 'Pine Haven Lodge',
    nightlyRate: 6500,
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
        { icon: 'hot-tub', label: 'Hot tub' },
        { icon: 'utensils', label: 'Kitchen' },
        { icon: 'snowflake', label: 'Air conditioning' },
        { icon: 'washer', label: 'Washer' },
        { icon: 'fire', label: 'Indoor fireplace' }
    ],
    images: [
        '../components/1.jpg',
        '../components/2.jpg',
        '../components/3.jpg',
        '../components/4.jpg',
        '../components/5.jpg'
    ],
    hostInfo: {
        name: 'Chezka',
        image: '../components/model.jpg',
        location: 'Tagaytay, Philippines',
        yearsHosting: 6,
        responseRate: 100,
        isSuperhost: true
    }
};

// Initialize the lodge
const lodge = new LodgeComponent(pineHavenConfig); // Fix: changed from mountainBreezeConfig to pineHavenConfig

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