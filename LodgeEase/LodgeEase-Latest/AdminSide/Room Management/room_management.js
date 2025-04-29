import { db, auth, app } from '../firebase.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    doc, 
    updateDoc, 
    deleteDoc, 
    Timestamp,
    where,
    getDoc,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { PageLogger } from '../js/pageLogger.js';
import { ActivityLogger } from '../ActivityLog/activityLogger.js';
// Import rate calculation module with updated rates
import { 
    calculateNights, 
    calculateHours,
    isNightPromoEligible, 
    getHourlyRate,
    calculateBookingCosts 
} from '../js/rateCalculation.js';

const activityLogger = new ActivityLogger();

// Add activity logging function
async function logRoomActivity(actionType, details) {
    try {
        const user = auth.currentUser;
        if (!user) return;

        await addDoc(collection(db, 'activityLogs'), {
            userId: user.uid,
            userName: user.email,
            actionType,
            details,
            timestamp: Timestamp.now(),
            userRole: 'admin',
            module: 'Room Management'
        });
    } catch (error) {
        console.error('Error logging room activity:', error);
    }
}

// Update the deleteRoom function
async function deleteRoom(roomId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            alert('Please log in to delete rooms');
            return;
        }

        // Get room details before deletion
        const roomDoc = await getDoc(doc(db, 'rooms', roomId));
        if (!roomDoc.exists()) {
            throw new Error('Room not found');
        }

        const roomData = roomDoc.data();
        const roomDetails = `${roomData.propertyDetails.name} - Room ${roomData.propertyDetails.roomNumber} (${roomData.propertyDetails.roomType})`;

        // Confirm deletion
        if (!confirm(`Are you sure you want to delete ${roomDetails}?`)) {
            return;
        }

        // Delete the room
        await deleteDoc(doc(db, 'rooms', roomId));

        // Log the deletion activity
        await activityLogger.logActivity(
            'room_deletion',
            `Room deleted: ${roomDetails}`,
            'Room Management'
        );

        // Show success message
        alert('Room deleted successfully');

    } catch (error) {
        console.error('Error deleting room:', error);
        alert('Error deleting room: ' + error.message);
    }
}

new Vue({
    el: '#app',
    data: {
        bookings: [],
        rooms: [],
        searchQuery: '',
        loading: true,
        selectedBooking: null,
        isAuthenticated: false,
        showManualBookingModal: false,
        currentDate: new Date(), // Added for date navigation
        establishments: {
            lodge1: {
                name: 'Pine Haven Lodge',
                location: 'Baguio City'
            },
            lodge2: {
                name: 'Mountain View Lodge',
                location: 'La Trinidad'
            }
        },
        availableRooms: [],
        manualBooking: {
            guestName: '',
            roomNumber: '',
            status: 'Confirmed',
            checkInDate: '',
            checkInTime: '12:00',
            checkOutDate: '',
            checkOutTime: '11:00',
            guests: 1,
            hasTvRemote: false,
            bookingType: 'standard',
            duration: 3,
        },
        startDate: '',
        endDate: '',
        editMode: false,
        // Add these missing properties to fix Vue warnings
        showAddRoomModal: false,
        showAddRoomToLodgeModal: false,
        showClientRoomsModal: false,
        originalCheckIn: null,
        originalCheckOut: null,
    },
    computed: {
        filteredBookings() {
            // Start with a copy of the bookings array
            let filtered = [...this.bookings];

            // Apply search query filter
            const query = this.searchQuery.toLowerCase();
            if (query) {
                filtered = filtered.filter(booking => {
                    const roomNumber = (booking.propertyDetails?.roomNumber || '').toString().toLowerCase();
                    const roomType = (booking.propertyDetails?.roomType || '').toString().toLowerCase();
                    const guestName = (booking.guestName || '').toLowerCase();
                    const status = (booking.status || '').toLowerCase();
                    
                    return roomNumber.includes(query) || 
                           roomType.includes(query) ||
                           guestName.includes(query) ||
                           status.includes(query);
                });
            }

            // If explicit date range is set, use that filter
            if (this.startDate && this.endDate) {
                const start = new Date(this.startDate);
                const end = new Date(this.endDate);
                end.setHours(23, 59, 59); // Include the entire end date

                filtered = filtered.filter(booking => {
                    const checkIn = booking.checkIn instanceof Date ? booking.checkIn : new Date(booking.checkIn);
                    const checkOut = booking.checkOut instanceof Date ? booking.checkOut : new Date(booking.checkOut);
                    
                    // Check if the booking period overlaps with the selected date range
                    return checkIn <= end && checkOut >= start;
                });
            } else {
                // Otherwise, filter by the current date in the date navigation
                // Set start and end of the selected date
                const selectedDate = new Date(this.currentDate);
                selectedDate.setHours(0, 0, 0, 0); // Start of the selected date
                
                const endOfSelectedDate = new Date(this.currentDate);
                endOfSelectedDate.setHours(23, 59, 59, 999); // End of the selected date
                
                filtered = filtered.filter(booking => {
                    // Skip non-date bookings
                    if (!booking.checkIn || !booking.checkOut) return false;
                    
                    const checkIn = booking.checkIn instanceof Date ? booking.checkIn : new Date(booking.checkIn);
                    const checkOut = booking.checkOut instanceof Date ? booking.checkOut : new Date(booking.checkOut);
                    
                    // Show bookings where:
                    // 1. Check-in is on the selected date, or
                    // 2. Check-out is on the selected date, or
                    // 3. The booking spans the selected date (check-in before and check-out after)
                    return (
                        (checkIn >= selectedDate && checkIn <= endOfSelectedDate) || // Checks in on the selected date
                        (checkOut >= selectedDate && checkOut <= endOfSelectedDate) || // Checks out on the selected date
                        (checkIn < selectedDate && checkOut > endOfSelectedDate) // Spans over the selected date
                    );
                });
            }

            return filtered;
        },

        minCheckInDate() {
            const now = new Date();
            return now.toISOString().slice(0, 16); // Format: YYYY-MM-DDThh:mm
        },

        calculateNights() {
            if (!this.manualBooking.checkInDate) return 0;
            if (!this.manualBooking.checkOutDate) return 0; // Short stay (no nights)
            return calculateNights(this.manualBooking.checkInDate, this.manualBooking.checkOutDate);
        },

        calculateHours() {
            if (!this.manualBooking.checkInDate) return 0;
            
            // For short stays (no check-out date), use standard duration
            if (!this.manualBooking.checkOutDate || !this.manualBooking.checkOutTime) {
                return this.manualBooking.duration;
            }
            
            if (this.manualBooking.checkOutDate) {
                // Calculate hours between check-in and check-out if both are provided
                const checkIn = new Date(`${this.manualBooking.checkInDate}T${this.manualBooking.checkInTime}`);
                const checkOut = new Date(`${this.manualBooking.checkOutDate}T${this.manualBooking.checkOutTime}`);
                return calculateHours(checkIn, checkOut);
            }
            
            return 0;
        },

        isNightPromoEligible() {
            // Always false since night-promo option is removed
            return false;
        },

        hasCheckOut() {
            // Check-out is considered provided if both date and time are filled
            return this.manualBooking.checkOutDate && this.manualBooking.checkOutDate.trim() !== '' &&
                   this.manualBooking.checkOutTime && this.manualBooking.checkOutTime.trim() !== '';
        },

        calculateRoomRate() {
            if (!this.manualBooking.checkInDate) return 0;
            
            // Use the imported rate calculation with updated parameters
            const { nightlyRate } = calculateBookingCosts(
                this.calculateNights, 
                this.manualBooking.bookingType,
                this.hasCheckOut,
                this.manualBooking.hasTvRemote,
                this.calculateHours // Add calculated hours
            );
            return nightlyRate;
        },

        stayTypeLabel() {
            if (!this.hasCheckOut) {
                return '3-Hour Short Stay';
            } else if (this.calculateNights === 1) {
                return '1 Night Stay';
            } else {
                return `${this.calculateNights} Nights Stay`;
            }
        },

        calculateSubtotal() {
            if (!this.manualBooking.checkInDate) return 0;
            
            const { subtotal } = calculateBookingCosts(
                this.calculateNights, 
                this.manualBooking.bookingType,
                this.hasCheckOut,
                this.manualBooking.hasTvRemote,
                this.calculateHours // Add calculated hours
            );
            return subtotal;
        },

        calculateServiceFee() {
            if (!this.manualBooking.checkInDate) return 0;
            
            const { serviceFeeAmount } = calculateBookingCosts(
                this.calculateNights, 
                this.manualBooking.bookingType,
                this.hasCheckOut,
                this.manualBooking.hasTvRemote,
                this.calculateHours // Add calculated hours
            );
            return serviceFeeAmount;
        },

        calculateTotal() {
            if (!this.manualBooking.checkInDate) return 0;
            
            const { totalAmount } = calculateBookingCosts(
                this.calculateNights, 
                this.manualBooking.bookingType,
                this.hasCheckOut,
                this.manualBooking.hasTvRemote,
                this.calculateHours // Add calculated hours
            );
            return totalAmount;
        },

        tvRemoteFee() {
            if (!this.manualBooking.checkInDate) return 0;
            
            const { tvRemoteFee } = calculateBookingCosts(
                this.calculateNights, 
                this.manualBooking.bookingType,
                this.hasCheckOut,
                this.manualBooking.hasTvRemote,
                this.calculateHours // Add calculated hours
            );
            return tvRemoteFee;
        },

        previewImage() {
            if (this.selectedImages.length > 0) {
                return this.selectedImages[0].url;
            }
            return this.defaultImage; // Use the instance property
        },
        
        isPreviewBestValue() {
            // Logic to determine if this lodge should be marked as "best value"
            // For example, if it has a promo price and the discount is substantial
            if (!this.newLodge.price || !this.newLodge.promoPrice) return false;
            
            const regularPrice = parseFloat(this.newLodge.price);
            const promoPrice = parseFloat(this.newLodge.promoPrice);
            
            // If discount is more than 50%
            return promoPrice < (regularPrice * 0.5);
        },
        
        isFormValid() {
            return this.newLodge.name && 
                   this.newLodge.location && 
                   this.newLodge.barangay && 
                   this.newLodge.price && 
                   this.newLodge.propertyType && 
                   this.newLodge.description &&
                   this.newLodge.amenities.length >= 2 &&
                   this.selectedImages.length > 0;
        },
        isRoomFormValid() {
            return this.newRoom.lodgeId && 
                   this.newRoom.roomNumber && 
                   this.newRoom.roomType && 
                   this.newRoom.floorLevel && 
                   this.newRoom.price && 
                   this.newRoom.description &&
                   this.roomImages.length > 0;
        },
        
        isManualBookingFormValid() {
            return this.manualBooking.guestName.trim() !== '' &&
                this.manualBooking.guestName.trim().length >= 6 &&
                this.manualBooking.guestName.trim().length <= 11 &&
                this.manualBooking.checkInDate !== '' &&
                this.manualBooking.roomNumber !== '';
            // Note: checkOutDate is not required
        },
    },
    methods: {
        async fetchBookings() {
            try {
                console.log('Starting to fetch bookings...');
                this.loading = true;

                // Fetch all bookings from everlodgebookings collection
                const bookingsRef = collection(db, 'everlodgebookings');
                const bookingsQuery = query(bookingsRef, orderBy('createdAt', 'desc')); // Sort by creation date
                const bookingsSnapshot = await getDocs(bookingsQuery);

                // Map the bookings data
                this.bookings = bookingsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    console.log('Raw booking data:', data);

                    return {
                        id: doc.id,
                        ...data,
                        propertyDetails: {
                            roomNumber: data.roomNumber || data.propertyDetails?.roomNumber || 'N/A',
                            roomType: data.roomType || data.propertyDetails?.roomType || 'N/A',
                            floorLevel: data.floorLevel || data.propertyDetails?.floorLevel || 'N/A',
                            name: data.propertyName || data.propertyDetails?.name || 'N/A',
                            location: data.location || data.propertyDetails?.location || 'N/A'
                        },
                        guestName: data.guestName || data.guest?.name || 'N/A',
                        email: data.email || data.guest?.email || 'N/A',
                        contactNumber: data.contactNumber || data.guest?.contact || 'N/A',
                        checkIn: data.checkIn?.toDate?.() || new Date(data.checkIn) || null,
                        checkOut: data.checkOut?.toDate?.() || new Date(data.checkOut) || null,
                        status: this.determineStatus(data),
                        totalPrice: data.totalPrice || 0,
                        serviceFee: data.serviceFee || 0,
                    };
                });

                console.log('Fetched bookings:', this.bookings);
                this.loading = false;
            } catch (error) {
                console.error('Error fetching bookings:', error);
                this.loading = false;
                alert('Failed to fetch bookings: ' + error.message);
            }
        },

        determineStatus(booking) {
            if (!booking.checkIn || !booking.checkOut) return 'Available';
            
            const now = new Date();
            const checkIn = booking.checkIn?.toDate?.() || new Date(booking.checkIn);
            const checkOut = booking.checkOut?.toDate?.() || new Date(booking.checkOut);

            if (now < checkIn) return 'Confirmed';
            if (now >= checkIn && now <= checkOut) return 'Checked In';
            if (now > checkOut) return 'Checked Out';
            
            return booking.status || 'Pending';
        },

        formatDate(date) {
            if (!date) return '-';
            try {
                if (typeof date === 'string') date = new Date(date);
                if (date.toDate) date = date.toDate();
                return date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (error) {
                console.error('Date formatting error:', error);
                return '-';
            }
        },

        async checkAdminStatus(user) {
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    return userDoc.data().role === 'admin';
                }
                return false;
            } catch (error) {
                console.error('Error checking admin status:', error);
                return false;
            }
        },

        async updateBookingStatus(booking) {
            try {
                this.loading = true;
                console.log('Updating booking status...');

                // Update booking in everlodgebookings collection
                const bookingRef = doc(db, 'everlodgebookings', booking.id);
                await updateDoc(bookingRef, {
                    status: booking.status,
                    updatedAt: Timestamp.now()
                });

                // Log the activity
                await activityLogger.logActivity(
                    'booking_status_update',
                    `Booking status updated to ${booking.status} for guest/plate: ${booking.guestName}`,
                    'Room Management'
                );

                // Refresh bookings list
                await this.fetchBookings();

                alert('Booking status updated successfully!');
            } catch (error) {
                console.error('Error updating booking status:', error);
                alert('Failed to update booking status: ' + error.message);
            } finally {
                this.loading = false;
            }
        },

        async editBooking(booking) {
            // Make a deep copy of the booking object
            this.selectedBooking = { ...booking };
            
            // Store original date/time values to track if they've been changed
            this.originalCheckIn = booking.checkIn;
            this.originalCheckOut = booking.checkOut;
            
            console.log('Original check-in stored:', this.originalCheckIn);
            console.log('Original check-out stored:', this.originalCheckOut);
            
            // Format the dates for the custom date picker format (DD/MM/YYYY HH:MM am/pm)
            if (this.selectedBooking.checkIn) {
                const checkIn = this.selectedBooking.checkIn instanceof Date 
                    ? this.selectedBooking.checkIn 
                    : new Date(this.selectedBooking.checkIn);
                
                // Format as DD/MM/YYYY HH:MM am/pm
                const day = String(checkIn.getDate()).padStart(2, '0');
                const month = String(checkIn.getMonth() + 1).padStart(2, '0');
                const year = checkIn.getFullYear();
                const hours = checkIn.getHours();
                const minutes = String(checkIn.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'pm' : 'am';
                const hour12 = hours % 12 || 12; // Convert 0 to 12 for 12-hour format
                
                this.selectedBooking.formattedCheckIn = `${day}/${month}/${year} ${String(hour12).padStart(2, '0')}:${minutes} ${ampm}`;
                console.log('Formatted check-in for input:', this.selectedBooking.formattedCheckIn);
            }
            
            if (this.selectedBooking.checkOut) {
                const checkOut = this.selectedBooking.checkOut instanceof Date 
                    ? this.selectedBooking.checkOut 
                    : new Date(this.selectedBooking.checkOut);
                
                // Format as DD/MM/YYYY HH:MM am/pm
                const day = String(checkOut.getDate()).padStart(2, '0');
                const month = String(checkOut.getMonth() + 1).padStart(2, '0');
                const year = checkOut.getFullYear();
                const hours = checkOut.getHours();
                const minutes = String(checkOut.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'pm' : 'am';
                const hour12 = hours % 12 || 12; // Convert 0 to 12 for 12-hour format
                
                this.selectedBooking.formattedCheckOut = `${day}/${month}/${year} ${String(hour12).padStart(2, '0')}:${minutes} ${ampm}`;
                console.log('Formatted check-out for input:', this.selectedBooking.formattedCheckOut);
            }
            
            this.editMode = true;
        },
        
        async saveBookingChanges() {
            try {
                this.loading = true;
                console.log('Saving booking changes...');
                console.log('Original check-in:', this.originalCheckIn);
                console.log('Original check-out:', this.originalCheckOut);
                console.log('New formatted check-in:', this.selectedBooking.formattedCheckIn);
                console.log('New formatted check-out:', this.selectedBooking.formattedCheckOut);

                if (!this.selectedBooking || !this.selectedBooking.id) {
                    throw new Error('No booking selected for editing');
                }

                // Update booking in everlodgebookings collection
                const bookingRef = doc(db, 'everlodgebookings', this.selectedBooking.id);
                
                // Parse the formatted dates back to Date objects
                let parsedCheckIn = null;
                let parsedCheckOut = null;
                
                if (this.selectedBooking.formattedCheckIn) {
                    // Parse DD/MM/YYYY HH:MM am/pm format
                    const [datePart, timePart] = this.selectedBooking.formattedCheckIn.split(' ');
                    const [day, month, year] = datePart.split('/').map(Number);
                    
                    // Parse time including am/pm
                    let [timePortion, ampm] = timePart.split(' ');
                    let [hours, minutes] = timePortion.split(':').map(Number);
                    
                    // Convert to 24-hour format
                    if (ampm.toLowerCase() === 'pm' && hours < 12) {
                        hours += 12;
                    } else if (ampm.toLowerCase() === 'am' && hours === 12) {
                        hours = 0;
                    }
                    
                    parsedCheckIn = new Date(year, month - 1, day, hours, minutes);
                    console.log('Parsed check-in date:', parsedCheckIn);
                }
                
                if (this.selectedBooking.formattedCheckOut) {
                    // Parse DD/MM/YYYY HH:MM am/pm format
                    const [datePart, timePart] = this.selectedBooking.formattedCheckOut.split(' ');
                    const [day, month, year] = datePart.split('/').map(Number);
                    
                    // Parse time including am/pm
                    let [timePortion, ampm] = timePart.split(' ');
                    let [hours, minutes] = timePortion.split(':').map(Number);
                    
                    // Convert to 24-hour format
                    if (ampm.toLowerCase() === 'pm' && hours < 12) {
                        hours += 12;
                    } else if (ampm.toLowerCase() === 'am' && hours === 12) {
                        hours = 0;
                    }
                    
                    parsedCheckOut = new Date(year, month - 1, day, hours, minutes);
                    console.log('Parsed check-out date:', parsedCheckOut);
                }
                
                // Check if check-in and check-out have been modified
                // Compare timestamps rather than string representations for reliable detection
                let checkInChanged = false;
                let checkOutChanged = false;
                
                if (this.originalCheckIn && parsedCheckIn) {
                    const originalTime = this.originalCheckIn instanceof Date 
                        ? this.originalCheckIn.getTime() 
                        : this.originalCheckIn.toDate?.() ? this.originalCheckIn.toDate().getTime() : new Date(this.originalCheckIn).getTime();
                    
                    const newTime = parsedCheckIn.getTime();
                    checkInChanged = Math.abs(originalTime - newTime) > 60000; // Allow 1 minute difference to handle minor parsing issues
                    
                    console.log('Check-in comparison:', {
                        originalTime,
                        newTime,
                        difference: Math.abs(originalTime - newTime),
                        changed: checkInChanged
                    });
                }
                
                if (this.originalCheckOut && parsedCheckOut) {
                    const originalTime = this.originalCheckOut instanceof Date 
                        ? this.originalCheckOut.getTime() 
                        : this.originalCheckOut.toDate?.() ? this.originalCheckOut.toDate().getTime() : new Date(this.originalCheckOut).getTime();
                    
                    const newTime = parsedCheckOut.getTime();
                    checkOutChanged = Math.abs(originalTime - newTime) > 60000; // Allow 1 minute difference to handle minor parsing issues
                    
                    console.log('Check-out comparison:', {
                        originalTime,
                        newTime,
                        difference: Math.abs(originalTime - newTime),
                        changed: checkOutChanged
                    });
                }
                
                // Parse date values if they've been changed
                let checkIn, checkOut;
                
                if (checkInChanged) {
                    // User has modified the check-in date/time
                    checkIn = Timestamp.fromDate(parsedCheckIn);
                    console.log('Using modified check-in date:', parsedCheckIn);
                } else {
                    // Use the original value exactly as stored
                    checkIn = this.originalCheckIn;
                    console.log('Using original check-in date (unchanged)');
                }
                
                if (checkOutChanged) {
                    // User has modified the check-out date/time
                    checkOut = Timestamp.fromDate(parsedCheckOut);
                    console.log('Using modified check-out date:', parsedCheckOut);
                } else {
                    // Use the original value exactly as stored
                    checkOut = this.originalCheckOut;
                    console.log('Using original check-out date (unchanged)');
                }
                
                // Prepare update data
                const updateData = {
                    guestName: this.selectedBooking.guestName,
                    email: this.selectedBooking.email,
                    contactNumber: this.selectedBooking.contactNumber,
                    guests: this.selectedBooking.guests,
                    status: this.selectedBooking.status,
                    propertyDetails: {
                        roomNumber: this.selectedBooking.propertyDetails.roomNumber,
                        roomType: this.selectedBooking.propertyDetails.roomType,
                        floorLevel: this.selectedBooking.propertyDetails.floorLevel,
                        name: this.selectedBooking.propertyDetails.name,
                        location: this.selectedBooking.propertyDetails.location
                    },
                    checkIn: checkIn,
                    checkOut: checkOut,
                    updatedAt: Timestamp.now()
                };

                await updateDoc(bookingRef, updateData);
                console.log('Final check-in value saved to Firestore:', updateData.checkIn);
                console.log('Final check-out value saved to Firestore:', updateData.checkOut);

                // Log the activity
                await activityLogger.logActivity(
                    'booking_update',
                    `Booking updated for guest/plate: ${this.selectedBooking.guestName}`,
                    'Room Management'
                );

                // Close the modal and refresh bookings list
                this.closeModal();
                await this.fetchBookings();

                alert('Booking updated successfully!');
            } catch (error) {
                console.error('Error updating booking:', error);
                alert('Failed to update booking: ' + error.message);
            } finally {
                this.loading = false;
                this.editMode = false;
            }
        },

        // Update the deleteBooking function
        async deleteBooking(booking) {
            try {
                if (!booking.id) {
                    alert('Cannot delete a booking without an ID');
                    return;
                }

                const user = auth.currentUser;
                if (!user) {
                    alert('Please log in to delete bookings');
                    return;
                }

                // Check admin status
                const isAdmin = await this.checkAdminStatus(user);
                if (!isAdmin) {
                    alert('You need administrator privileges to delete bookings');
                    return;
                }

                if (!confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
                    return;
                }

                // Create detailed room information for logging
                const roomDetails = {
                    roomNumber: booking.propertyDetails?.roomNumber || 'Unknown',
                    propertyName: booking.propertyDetails?.name || 'Unknown Property',
                    roomType: booking.propertyDetails?.roomType || 'Unknown Type'
                };

                // Delete the booking from everlodgebookings collection
                const bookingRef = doc(db, 'everlodgebookings', booking.id); // Changed from 'bookings' to 'everlodgebookings'
                await deleteDoc(bookingRef);

                // Log the deletion with detailed information
                await activityLogger.logActivity(
                    'booking_deletion', // Changed from 'room_deletion' to 'booking_deletion'
                    `Deleted booking for ${roomDetails.propertyName} - Room ${roomDetails.roomNumber} (${roomDetails.roomType})`,
                    'Room Management'
                );

                // Remove from local state
                this.bookings = this.bookings.filter(b => b.id !== booking.id);
                
                alert('Booking deleted successfully!');
                
            } catch (error) {
                console.error('Error deleting booking:', error);
                alert('Failed to delete booking: ' + error.message);
            }
        },

        viewBookingDetails(booking) {
            this.selectedBooking = booking;
            this.editMode = false;
        },

        closeModal() {
            this.selectedBooking = null;
            this.editMode = false;
            this.originalCheckIn = null;
            this.originalCheckOut = null;
        },

        openManualBookingModal() {
            this.showManualBookingModal = true;
            this.resetManualBookingForm();
        },

        closeManualBookingModal() {
            this.showManualBookingModal = false;
            this.resetManualBookingForm();
        },

        resetManualBookingForm() {
            this.manualBooking = {
                guestName: '',
                roomNumber: '',
                status: 'Confirmed',
                checkInDate: '',
                checkInTime: '12:00',
                checkOutDate: '',
                checkOutTime: '11:00',
                guests: 1,
                hasTvRemote: false,
                bookingType: 'standard',
                duration: 3,
            };
        },

        async fetchAvailableRooms() {
            if (!this.manualBooking.establishment) return;

            try {
                this.loading = true;
                console.log('Fetching available rooms for establishment:', this.manualBooking.establishment);

                // Fetch all rooms for the establishment
                const roomsRef = collection(db, 'rooms');
                const roomsQuery = query(
                    roomsRef,
                    where('propertyDetails.name', '==', this.manualBooking.establishment)
                );
                const roomsSnapshot = await getDocs(roomsQuery);
                this.availableRooms = roomsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Fetch bookings from everlodgebookings collection
                const bookingsRef = collection(db, 'everlodgebookings');
                const bookingsSnapshot = await getDocs(
                    query(
                        bookingsRef,
                        where('propertyDetails.name', '==', this.manualBooking.establishment),
                        where('status', 'in', ['Confirmed', 'Checked In'])
                    )
                );

                const bookedRoomIds = bookingsSnapshot.docs.map(doc => doc.data().roomId);
                this.availableRooms = this.availableRooms.filter(room => !bookedRoomIds.includes(room.id));

            } catch (error) {
                console.error('Error fetching available rooms:', error);
                alert('Failed to fetch available rooms');
            } finally {
                this.loading = false;
            }
        },

        async checkRoomAvailability(roomNumber, checkInDate, checkOutDate) {
            try {
                console.log(`Checking availability for room ${roomNumber} from ${checkInDate} to ${checkOutDate}`);
                
                // Get bookings from Firebase that might overlap with the selected dates
                const bookingsRef = collection(db, 'everlodgebookings');
                const bookingsQuery = query(
                    bookingsRef,
                    where('propertyDetails.roomNumber', '==', roomNumber),
                    where('status', 'in', ['Confirmed', 'Checked In', 'pending'])
                );
                
                const bookingsSnapshot = await getDocs(bookingsQuery);
                
                // Check if any existing booking overlaps with the selected dates
                for (const doc of bookingsSnapshot.docs) {
                    const booking = doc.data();
                    
                    // Convert Firebase timestamps to JavaScript dates, handling different formats
                    let existingCheckIn, existingCheckOut;
                    
                    // Handle different date formats that might be stored in Firestore
                    try {
                        if (booking.checkIn) {
                            if (typeof booking.checkIn.toDate === 'function') {
                                existingCheckIn = booking.checkIn.toDate();
                            } else if (booking.checkIn instanceof Date) {
                                existingCheckIn = booking.checkIn;
                            } else if (typeof booking.checkIn === 'string') {
                                existingCheckIn = new Date(booking.checkIn);
                            } else {
                                console.warn('Unknown checkIn date format:', booking.checkIn);
                                continue; // Skip this booking record
                            }
                        } else {
                            console.warn('Missing checkIn date in booking record');
                            continue; // Skip this booking record
                        }
                        
                        if (booking.checkOut) {
                            if (typeof booking.checkOut.toDate === 'function') {
                                existingCheckOut = booking.checkOut.toDate();
                            } else if (booking.checkOut instanceof Date) {
                                existingCheckOut = booking.checkOut;
                            } else if (typeof booking.checkOut === 'string') {
                                existingCheckOut = new Date(booking.checkOut);
                            } else {
                                console.warn('Unknown checkOut date format:', booking.checkOut);
                                continue; // Skip this booking record
                            }
                        } else {
                            console.warn('Missing checkOut date in booking record');
                            continue; // Skip this booking record
                        }
                        
                        // Verify dates are valid
                        if (isNaN(existingCheckIn.getTime()) || isNaN(existingCheckOut.getTime())) {
                            console.warn('Invalid date values in booking record:', { existingCheckIn, existingCheckOut });
                            continue; // Skip this booking record
                        }
                    } catch (dateError) {
                        console.error('Error processing dates in booking record:', dateError);
                        continue; // Skip problematic booking records
                    }
                    
                    // Check for overlap
                    // New booking starts during an existing booking
                    // or new booking ends during an existing booking
                    // or new booking completely spans an existing booking
                    if ((checkInDate < existingCheckOut && checkInDate >= existingCheckIn) ||
                        (checkOutDate > existingCheckIn && checkOutDate <= existingCheckOut) ||
                        (checkInDate <= existingCheckIn && checkOutDate >= existingCheckOut)) {
                        
                        console.log('Room not available - Found conflicting booking:', booking);
                        return {
                            available: false,
                            conflictWith: {
                                id: doc.id,
                                checkIn: existingCheckIn,
                                checkOut: existingCheckOut,
                                guestName: booking.guestName || 'Another guest'
                            }
                        };
                    }
                }
                
                // No overlapping bookings found
                return { available: true };
                
            } catch (error) {
                console.error('Error checking room availability:', error);
                // Return a generic availability error instead of throwing
                return { 
                    available: false, 
                    error: error.message || 'Unknown error checking availability',
                    isSystemError: true
                };
            }
        },

        async submitManualBooking() {
            try {
                if (!this.isManualBookingFormValid) {
                    alert('Please fill in all required fields');
                    return;
                }

                this.loading = true;

                // Format date and time strings to proper date objects
                const checkInDateTime = new Date(`${this.manualBooking.checkInDate}T${this.manualBooking.checkInTime}`);
                
                let checkOutDateTime;
                
                if (!this.manualBooking.checkOutDate || !this.manualBooking.checkOutTime) {
                    // Default to 3 hours later for short stays
                    checkOutDateTime = new Date(checkInDateTime);
                    checkOutDateTime.setHours(checkOutDateTime.getHours() + (parseInt(this.manualBooking.duration) || 3));
                } else {
                    // Use provided checkout if available
                    checkOutDateTime = new Date(`${this.manualBooking.checkOutDate}T${this.manualBooking.checkOutTime}`);
                }

                // Verify check-out is after check-in
                if (checkOutDateTime <= checkInDateTime) {
                    alert('Check-out date/time must be after check-in date/time');
                    this.loading = false;
                    return;
                }

                // Check for duplicate bookings (same guest, room, and check-in date)
                try {
                    const bookingsRef = collection(db, 'everlodgebookings');
                    const formattedCheckInDate = checkInDateTime.toISOString().split('T')[0]; // YYYY-MM-DD format
                    
                    // Query for bookings with same guest name and room number
                    const duplicateQuery = query(
                        bookingsRef,
                        where('guestName', '==', this.manualBooking.guestName),
                        where('propertyDetails.roomNumber', '==', this.manualBooking.roomNumber)
                    );
                    
                    const potentialDuplicates = await getDocs(duplicateQuery);
                    
                    // Check if any results have the same check-in date (ignoring time)
                    for (const doc of potentialDuplicates.docs) {
                        const booking = doc.data();
                        let existingCheckIn;
                        
                        if (typeof booking.checkIn.toDate === 'function') {
                            existingCheckIn = booking.checkIn.toDate();
                        } else if (booking.checkIn instanceof Date) {
                            existingCheckIn = booking.checkIn;
                        } else if (typeof booking.checkIn === 'string') {
                            existingCheckIn = new Date(booking.checkIn);
                        } else {
                            continue; // Skip invalid dates
                        }
                        
                        // Compare dates (ignoring time)
                        const existingDateStr = existingCheckIn.toISOString().split('T')[0];
                        if (existingDateStr === formattedCheckInDate) {
                            alert(`A booking for ${this.manualBooking.guestName} in room ${this.manualBooking.roomNumber} on ${formattedCheckInDate} already exists.`);
                            this.loading = false;
                            return;
                        }
                    }
                } catch (duplicateError) {
                    console.error('Error checking for duplicate bookings:', duplicateError);
                    // Continue with booking as we don't want to block if the duplicate check fails
                }

                // Check room availability before creating booking
                try {
                    const availability = await this.checkRoomAvailability(
                        this.manualBooking.roomNumber,
                        checkInDateTime,
                        checkOutDateTime
                    );
                    
                    if (!availability.available) {
                        this.loading = false;
                        
                        // Check if it's a system error or an availability conflict
                        if (availability.isSystemError) {
                            console.error('System error checking availability:', availability.error);
                            alert(`System Error: Could not verify room availability due to a technical issue. Please try again later.`);
                            return;
                        }
                        
                        // It's an availability conflict - show detailed error
                        const conflict = availability.conflictWith;
                        if (conflict) {
                            const conflictCheckIn = this.formatDate(conflict.checkIn);
                            const conflictCheckOut = this.formatDate(conflict.checkOut);
                            
                            // Create a more detailed alert
                            let errorMessage = `Booking Conflict Detected\n\n`;
                            errorMessage += `Room ${this.manualBooking.roomNumber} is already booked during this time period.\n\n`;
                            errorMessage += `Existing Booking:\n`;
                            errorMessage += `Guest: ${conflict.guestName}\n`;
                            errorMessage += `Check-in: ${conflictCheckIn}\n`;
                            errorMessage += `Check-out: ${conflictCheckOut}\n\n`;
                            errorMessage += `Please select a different room or time period.`;
                            
                            alert(errorMessage);
                        } else {
                            alert(`This room is not available for the selected dates and times. Please choose a different room or time period.`);
                        }
                        return;
                    }
                } catch (availabilityError) {
                    console.error('Error checking room availability:', availabilityError);
                    alert('We encountered an error while checking room availability. Please try again.');
                    this.loading = false;
                    return;
                }

                // Get the calculated costs
                const bookingCosts = calculateBookingCosts(
                    this.calculateNights,
                    this.manualBooking.bookingType,
                    this.hasCheckOut,
                    this.manualBooking.hasTvRemote,
                    this.calculateHours
                );

                // Create the booking data
                const bookingData = {
                    guestName: this.manualBooking.guestName,
                    email: this.manualBooking.email || 'manual-booking@lodgeease.com',
                    contactNumber: this.manualBooking.contactNumber || 'Not provided',
                    checkIn: Timestamp.fromDate(checkInDateTime),
                    checkOut: Timestamp.fromDate(checkOutDateTime),
                    createdAt: Timestamp.now(),
                    propertyDetails: {
                        name: 'Ever Lodge',
                        location: 'Baguio City, Philippines',
                        roomType: this.manualBooking.roomType || 'Standard',
                        roomNumber: this.manualBooking.roomNumber,
                        floorLevel: this.manualBooking.floorLevel || '1'
                    },
                    paymentStatus: 'paid',
                    status: this.manualBooking.status,
                    bookingType: this.manualBooking.bookingType,
                    
                    // Add calculated values
                    nightlyRate: bookingCosts.nightlyRate,
                    numberOfNights: this.calculateNights,
                    duration: this.hasCheckOut ? 0 : this.manualBooking.duration,
                    subtotal: bookingCosts.subtotal,
                    serviceFee: bookingCosts.serviceFeeAmount,
                    totalPrice: bookingCosts.totalAmount,
                    hasTvRemote: this.manualBooking.hasTvRemote,
                    tvRemoteFee: bookingCosts.tvRemoteFee,
                    source: 'admin',
                    
                    // Additional metadata
                    guests: parseInt(this.manualBooking.guests) || 1,
                    adminNotes: this.manualBooking.notes || '',
                    isManualBooking: true,
                    isHourlyRate: false
                };

                // Save to Firestore
                const bookingRef = await addDoc(collection(db, 'everlodgebookings'), bookingData);
                
                // Log the activity
                await logRoomActivity(
                    'manual_booking_created',
                    `Manual booking created for ${this.manualBooking.guestName}, Room ${this.manualBooking.roomNumber}, Total: ₱${bookingCosts.totalAmount}`
                );

                // Show success message
                alert('Booking created successfully! Booking ID: ' + bookingRef.id);
                
                // Reset form and close modal
                this.resetManualBookingForm();
                this.closeManualBookingModal();
                
                // Refresh bookings list
                this.fetchBookings();
                
            } catch (error) {
                console.error('Error submitting manual booking:', error);
                alert('Error creating booking: ' + error.message);
            } finally {
                this.loading = false;
            }
        },
        
        // Update pricing when form values change
        updateBookingTypeAndPricing() {
            // Just refresh the computed values
            this.$forceUpdate();
        },

        async handleLogout() {
            try {
                await signOut(auth);
                window.location.href = '../Login/index.html';
            } catch (error) {
                console.error('Error signing out:', error);
                alert('Error signing out. Please try again.');
            }
        },

        checkAuthState() {
            auth.onAuthStateChanged(user => {
                this.isAuthenticated = !!user;
                if (!user) {
                    window.location.href = '../Login/index.html';
                } else {

                    this.fetchBookings(); // Fetch bookings when user is authenticated
                }
                this.loading = false;
            });
        },

        filterByDate() {
            if (!this.startDate || !this.endDate) {
                alert('Please select both start and end dates');
                return;
            }
            this.fetchBookings(); // This will trigger the filteredBookings computed property
        },

        resetFilter() {
            this.startDate = '';
            this.endDate = '';
            this.currentDate = new Date();
            this.searchQuery = '';
        },

        updateDateAndPrice() {
            // This method is called when any date or time input changes
            console.log('Updating dates and prices');
            
            // Set checkIn and checkOut Javascript Date objects
            if (this.manualBooking.checkInDate) {
                const checkInDate = new Date(this.manualBooking.checkInDate);
                if (this.manualBooking.checkInTime) {
                    const [hours, minutes] = this.manualBooking.checkInTime.split(':').map(Number);
                    checkInDate.setHours(hours, minutes, 0);
                }
                this.manualBooking.checkIn = checkInDate;
            }
            
            // Only set checkOut if both date and time are provided
            if (this.hasCheckOut) {
                const checkOutDate = new Date(this.manualBooking.checkOutDate);
                if (this.manualBooking.checkOutTime) {
                    const [hours, minutes] = this.manualBooking.checkOutTime.split(':').map(Number);
                    checkOutDate.setHours(hours, minutes, 0);
                }
                this.manualBooking.checkOut = checkOutDate;
            } else {
                // Clear the checkOut value if either date or time is missing
                this.manualBooking.checkOut = null;
            }
            
            // Force Vue to re-compute night calculations and pricing
            this.$forceUpdate();
        },
        
        formatDisplayDate(date) {
            return date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        },

        goToPreviousDay() {
            const prevDate = new Date(this.currentDate);
            prevDate.setDate(prevDate.getDate() - 1);
            this.currentDate = prevDate;
        },

        goToNextDay() {
            const nextDate = new Date(this.currentDate);
            nextDate.setDate(nextDate.getDate() + 1);
            this.currentDate = nextDate;
        },

        goToToday() {
            this.currentDate = new Date();
        },
    },
    async mounted() {
        // Then continue with normal initialization
        this.checkAuthState(); // This will handle auth check and fetch bookings
    }
});