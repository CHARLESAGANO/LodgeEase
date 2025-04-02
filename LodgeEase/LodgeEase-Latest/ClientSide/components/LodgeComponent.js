import { db, auth, addBooking } from '../../AdminSide/firebase.js';
import { doc, getDoc, collection, addDoc, Timestamp, query, where, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ReviewSystem } from './reviewSystem.js';

export class LodgeComponent {
    constructor(config) {
        this.config = {
            lodgeId: config.lodgeId,
            lodgeName: config.lodgeName,
            nightlyRate: config.nightlyRate,
            serviceFeePercentage: config.serviceFeePercentage || 0.14,
            location: config.location,
            maxGuests: config.maxGuests || 2,
            amenities: config.amenities || [],
            images: config.images || [],
            hostInfo: config.hostInfo || {}
        };

        this.selectedCheckIn = null;
        this.selectedCheckOut = null;
        this.currentDate = new Date();
        this.initializeElements();
        this.attachEventListeners();
        this.renderCalendar(this.currentDate);
        this.initializeReviewSystem();
    }

    initializeElements() {
        this.elements = {
            calendarModal: document.getElementById('calendar-modal'),
            calendarGrid: document.getElementById('calendar-grid'),
            calendarMonth: document.getElementById('calendar-month'),
            prevMonthBtn: document.getElementById('prev-month'),
            nextMonthBtn: document.getElementById('next-month'),
            clearDatesBtn: document.getElementById('clear-dates'),
            closeCalendarBtn: document.getElementById('close-calendar'),
            checkInInput: document.getElementById('check-in-date'),
            checkOutInput: document.getElementById('check-out-date'),
            nightsSelected: document.getElementById('nights-selected'),
            pricingDetails: document.getElementById('pricing-details'),
            nightsCalculation: document.getElementById('nights-calculation'),
            totalNightsPrice: document.getElementById('total-nights-price'),
            totalPrice: document.getElementById('total-price'),
            serviceFee: document.getElementById('service-fee')
        };

        // Update static content with lodge details
        document.querySelector('h1').textContent = this.config.lodgeName;
        document.querySelector('.text-lg.font-semibold').textContent = 
            `₱${this.config.nightlyRate.toLocaleString()} / night`;
    }

    attachEventListeners() {
        this.elements.checkInInput?.addEventListener('click', () => this.openCalendar());
        this.elements.checkOutInput?.addEventListener('click', () => {
            if (this.selectedCheckIn) this.openCalendar();
        });
        this.elements.closeCalendarBtn?.addEventListener('click', () => this.closeCalendar());
        this.elements.clearDatesBtn?.addEventListener('click', () => this.clearDates());
        this.elements.prevMonthBtn?.addEventListener('click', () => this.prevMonth());
        this.elements.nextMonthBtn?.addEventListener('click', () => this.nextMonth());
    }

    async initializeReviewSystem() {
        try {
            if (!document.getElementById('reviews-section')) {
                console.warn('Reviews section not found, skipping review system initialization');
                return;
            }
            
            const reviewSystem = new ReviewSystem(this.config.lodgeId);
            await reviewSystem.initialize();
            return reviewSystem;
        } catch (error) {
            console.error('Error initializing review system:', error);
            // Don't throw the error, just log it
            return null;
        }
    }

    renderCalendar(date) {
        // Copy existing renderCalendar logic but use this.elements and this.config
        // ...existing calendar rendering code with 'this' context...
    }

    async handleReserveClick(event) {
        try {
            event.preventDefault();

            const user = auth.currentUser;
            const contactNumber = document.getElementById('guest-contact').value.trim();
            const guests = document.getElementById('guests').value;

            // Validation checks
            if (!contactNumber || !/^[0-9]{11}$/.test(contactNumber)) {
                alert('Please enter a valid 11-digit contact number');
                return;
            }

            if (!guests || !['1', '2'].includes(guests)) {
                alert('Please select a valid number of guests');
                return;
            }

            if (!this.selectedCheckIn || !this.selectedCheckOut) {
                alert('Please select both check-in and check-out dates');
                return;
            }

            // Handle non-logged in users
            if (!user) {
                this.saveBookingToLocalStorage();
                const returnUrl = encodeURIComponent(window.location.href);
                window.location.href = `../Login/index.html?redirect=${returnUrl}`;
                return;
            }

            // Calculate booking details
            const nights = Math.round((this.selectedCheckOut - this.selectedCheckIn) / (1000 * 60 * 60 * 24));
            const subtotal = this.config.nightlyRate * nights;
            const serviceFeeAmount = Math.round(subtotal * this.config.serviceFeePercentage);
            const totalPrice = subtotal + serviceFeeAmount;

            // Create booking data
            const bookingData = {
                checkIn: this.selectedCheckIn.toISOString(),
                checkOut: this.selectedCheckOut.toISOString(),
                guests: Number(guests),
                contactNumber,
                numberOfNights: nights,
                nightlyRate: this.config.nightlyRate,
                subtotal,
                serviceFee: serviceFeeAmount,
                totalPrice,
                propertyDetails: {
                    name: this.config.lodgeName,
                    location: this.config.location,
                    roomType: 'Deluxe Suite',
                    roomNumber: "304"
                }
            };

            localStorage.setItem('bookingData', JSON.stringify(bookingData));
            window.location.href = '../paymentProcess/pay.html';

        } catch (error) {
            console.error('Error in handleReserveClick:', error);
            alert('An error occurred while processing your reservation. Please try again.');
        }
    }

    // Add other necessary methods...
}
