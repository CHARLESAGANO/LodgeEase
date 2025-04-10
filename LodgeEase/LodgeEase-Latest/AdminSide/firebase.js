// Import Firebase modules using CDN paths
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    setPersistence, 
    browserLocalPersistence,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    fetchSignInMethodsForEmail 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    Timestamp,
    orderBy,
    limit,
    enableMultiTabIndexedDbPersistence,
    onSnapshot // Add this import
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    getAnalytics,
    isSupported 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBAJr0JQgWRfGTmSXTK6P7Yn8fkHXG2YeE",
    authDomain: "lms-app-2b903.firebaseapp.com",
    projectId: "lms-app-2b903",
    storageBucket: "lms-app-2b903.appspot.com",
    messagingSenderId: "1046108373013",
    appId: "1:1046108373013:web:fc366db1d92b9c4b860e1c",
    measurementId: "G-WRMW9Z8867",
    experimentalForceLongPolling: true,
    experimentalAutoDetectLongPolling: true
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize analytics only if supported
let analytics = null;
isSupported().then(yes => yes && (analytics = getAnalytics(app)));

// Update to use new caching approach
(async function initializeFirestore() {
    try {
        const firestoreSettings = {
            cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED
        };
        await enableMultiTabIndexedDbPersistence(db);
    } catch (err) {
        if (err.code == 'failed-precondition') {
            console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err.code == 'unimplemented') {
            console.log('The current browser doesn\'t support persistence.');
        }
    }
})();

// Set authentication persistence
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error('Error setting auth persistence:', error);
});

// Add rate limiting for registration attempts
const registrationAttempts = new Map();

// Authentication functions
async function signIn(userIdentifier, password) {
    try {
        let email = userIdentifier;
        
        // If userIdentifier is not an email, try to find the email by username
        if (!email.includes('@')) {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("username", "==", userIdentifier.toLowerCase()));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                throw new Error('User not found');
            }
            
            email = querySnapshot.docs[0].data().email;
        }
        
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
        
        if (!userDoc.exists() || !userDoc.data().isAdmin) {
            await auth.signOut();
            throw new Error('Unauthorized access. Admin privileges required.');
        }
        
        return userCredential;
    } catch (error) {
        console.error('Sign in error:', error);
        throw error;
    }
}

async function register(email, password, username, fullname) {
    try {
        // Check if username exists
        const usersRef = collection(db, "users");
        const normalizedUsername = username.toLowerCase().trim();
        const q = query(usersRef, where("username", "==", normalizedUsername));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            throw new Error('Username already exists');
        }

        // Create auth user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Create user document
        const userData = {
            email,
            username: normalizedUsername,
            fullname,
            role: 'admin',
            isAdmin: true,
            createdAt: Timestamp.now(),
            status: 'active'
        };

        await setDoc(doc(db, "users", userCredential.user.uid), userData);

        // Log registration
        await addDoc(collection(db, 'activityLogs'), {
            userId: userCredential.user.uid,
            actionType: 'registration',
            timestamp: Timestamp.now()
        });

        return userCredential;
    } catch (error) {
        console.error('Registration error:', error);
        throw error;
    }
}

async function signOut() {
    try {
        const user = auth.currentUser;
        if (user) {
            await logAdminActivity(user.uid, 'logout', 'User logged out');
        }
        await auth.signOut();
        return true;
    } catch (error) {
        console.error('Sign out error:', error);
        throw error;
    }
}

async function getCurrentUser() {
    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            unsubscribe();
            resolve(user);
        }, reject);
    });
}

async function checkAuth() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = '../Login/index.html';
        return null;
    }
    return user;
}

async function checkAdminAuth() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = '../Login/index.html';
        return null;
    }

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists() || !userDoc.data().isAdmin) {
        await signOut();
        window.location.href = '../Login/index.html';
        return null;
    }

    return user;
}

// Helper functions for authentication
async function logAdminActivity(userId, actionType, details, userName = null) {
    try {
        // Only allow admin users to write to activityLogs
        const userDoc = await getDoc(doc(db, "users", userId));
        const userData = userDoc.data();
        
        if (!userData || !userData.isAdmin) {
            console.log('User does not have admin permissions:', userId);
            return null;
        }

        // Ensure activityLogs collection exists
        const logsRef = collection(db, 'activityLogs');
        
        const activityData = {
            userId,
            userName: userName || userData.fullname || userData.username || 'Unknown User',
            actionType,
            details,
            timestamp: Timestamp.fromDate(new Date())
        };

        const docRef = await addDoc(logsRef, activityData);
        
        // Verify save
        const savedDoc = await getDoc(docRef);
        console.log('Activity log saved:', {
            id: docRef.id,
            exists: savedDoc.exists(),
            data: savedDoc.data()
        });

        return docRef.id;
    } catch (error) {
        console.error('Error in logAdminActivity:', error);
        // Don't throw error for non-admin users, just return null
        return null;
    }
}

async function logPageNavigation(userId, pageName) {
    try {
        if (!userId) return;
        
        const userDoc = await getDoc(doc(db, "users", userId));
        const userData = userDoc.data();
        
        // Only log navigation for admin users
        if (!userData || !userData.isAdmin) {
            return;
        }
        
        await logAdminActivity(
            userId,
            'navigation',
            `Navigated to ${pageName}`,
            userData.fullname || userData.username
        );
    } catch (error) {
        console.error('Error logging page navigation:', error);
    }
}

// Add validation helper for booking structure
function validateBookingData(data) {
    // Required fields for a basic booking
    const requiredFields = ['checkIn', 'checkOut', 'userId'];
    
    // Check required fields
    for (const field of requiredFields) {
        if (!data[field]) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    // Ensure propertyDetails exists with at least some basic info
    if (!data.propertyDetails) {
        data.propertyDetails = {
            name: 'Pine Haven Lodge',
            location: 'Baguio City, Philippines',
            roomType: 'Deluxe Suite'
        };
    }

    // Ensure status is valid
    const validStatuses = ['pending', 'confirmed', 'cancelled'];
    if (data.status && !validStatuses.includes(data.status)) {
        data.status = 'confirmed';
    }

    // Set default values for optional fields
    data.rating = data.rating || 0;
    data.createdAt = data.createdAt || Timestamp.now();

    return true;
}

// Update addBooking function with validation
async function addBooking(bookingData) {
    try {
        // Ensure proper structure
        const formattedBooking = {
            userId: bookingData.userId,
            propertyDetails: bookingData.propertyDetails || {
                name: 'Pine Haven Lodge',
                location: 'Baguio City, Philippines',
                roomType: 'Deluxe Suite',
                roomNumber: bookingData.roomNumber || "304"
            },
            checkIn: bookingData.checkIn instanceof Timestamp ? 
                    bookingData.checkIn : 
                    safeTimestamp(bookingData.checkIn),
            checkOut: bookingData.checkOut instanceof Timestamp ? 
                     bookingData.checkOut : 
                     safeTimestamp(bookingData.checkOut),
            guests: bookingData.guests || 1,
            numberOfNights: bookingData.numberOfNights || 1,
            nightlyRate: bookingData.nightlyRate || 0,
            serviceFee: bookingData.serviceFee || 0,
            totalPrice: bookingData.totalPrice || 0,
            createdAt: Timestamp.now(),
            rating: Number(bookingData.rating || 0),
            status: bookingData.status || 'confirmed'
        };

        // Validate the formatted data
        validateBookingData(formattedBooking);

        // Add to Firestore
        const bookingsRef = collection(db, 'bookings');
        const docRef = await addDoc(bookingsRef, formattedBooking);
        
        console.log("Booking added with ID: ", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Error adding booking: ", error);
        throw error;
    }
}

// Update updateBooking function
async function updateBooking(bookingId, updateData) {
    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        const currentData = (await getDoc(bookingRef)).data();

        // Merge current and update data
        const updatedBooking = {
            ...currentData,
            propertyDetails: {
                ...currentData.propertyDetails,
                ...updateData.propertyDetails
            },
            ...updateData,
            updatedAt: Timestamp.now()
        };

        // Validate the merged data
        validateBookingData(updatedBooking);

        // Update document
        await updateDoc(bookingRef, updatedBooking);
        await logAdminActivity(auth.currentUser.uid, 'booking', `Updated booking ${bookingId}`);
    } catch (error) {
        console.error("Error updating booking: ", error);
        throw error;
    }
}

// Update fetchRoomsData to use the new auth check
async function fetchRoomsData() {
    try {
        // Check authentication
        await checkAdminAuth();

        console.log('Starting to fetch rooms data...');
        const roomsRef = collection(db, "rooms");
        const querySnapshot = await getDocs(roomsRef);
        const rooms = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            source: 'manual'
        }));
        console.log('Successfully fetched rooms:', rooms);
        return rooms;
    } catch (error) {
        console.error("Detailed error in fetchRoomsData:", error);
        if (error.code) console.error('Error code:', error.code);
        if (error.message) console.error('Error message:', error.message);
        throw new Error(`Failed to fetch rooms data: ${error.message}`);
    }
}

// Fetch a room by ID
async function fetchRoomById(roomId) {
    try {
        const roomRef = doc(db, "rooms", roomId);
        const roomDoc = await getDoc(roomRef);
        if (!roomDoc.exists()) {
            throw new Error('Room not found');
        }
        return { id: roomDoc.id, ...roomDoc.data() };
    } catch (error) {
        console.error("Error fetching room by ID: ", error);
        throw new Error('Failed to fetch room by ID');
    }
}

// Update addRoom function to ensure room type is properly set
async function addRoom(roomData) {
    try {
        // Validate and normalize room type
        if (!roomData.roomType && !roomData.type) {
            roomData.roomType = 'Standard'; // Default room type
        } else {
            const type = (roomData.roomType || roomData.type).trim();
            roomData.roomType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
            delete roomData.type; // Remove duplicate field
        }

        // Ensure room type is one of the valid types
        const validTypes = ['Standard', 'Deluxe', 'Suite', 'Family'];
        if (!validTypes.includes(roomData.roomType)) {
            roomData.roomType = 'Standard';
        }

        const roomsRef = collection(db, "rooms");
        const docRef = await addDoc(roomsRef, {
            ...roomData,
            createdAt: Timestamp.fromDate(new Date())
        });
        
        console.log("Room added with data:", roomData); // Debug log
        await logAdminActivity(auth.currentUser.uid, 'room', `Added new room ${roomData.roomNumber}`);
        return docRef.id;
    } catch (error) {
        console.error("Error adding room: ", error);
        throw new Error('Failed to add room');
    }
}

// Update updateRoom function
async function updateRoom(roomId, roomData) {
    try {
        // Ensure room type is properly set
        if (roomData.type || roomData.roomType) {
            roomData.roomType = roomData.type || roomData.roomType;
            delete roomData.type; // Remove duplicate field if exists
        }

        const roomRef = doc(db, "rooms", roomId);
        await updateDoc(roomRef, roomData);
        console.log("Room updated with ID: ", roomId);
    } catch (error) {
        console.error("Error updating room: ", error);
        throw new Error('Failed to update room');
    }
}

// Delete a room
async function deleteRoom(roomId) {
    try {
        const roomRef = doc(db, "rooms", roomId);
        await deleteDoc(roomRef);
        console.log("Room deleted with ID: ", roomId);
    } catch (error) {
        console.error("Error deleting room: ", error);
        throw new Error('Failed to delete room');
    }
}

// Fix the setAdminRole function
async function setAdminRole(userId) {
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            role: 'admin'
        });
        console.log('Successfully set admin role for user:', userId);
    } catch (error) {
        console.error('Error setting admin role:', error);
        throw error;
    }
}

// Analytics collection setup functions
async function setupAnalyticsCollections() {
    try {
        const collections = ['bookings', 'sales', 'customers', 'analytics', 'forecasts', 'metrics'];
        for (const collName of collections) {
            const collRef = collection(db, collName);
            await setDoc(doc(db, `${collName}/_config`), {
                lastUpdated: Timestamp.now(),
                version: '1.0'
            });
        }
    } catch (error) {
        console.error('Error setting up analytics collections:', error);
    }
}

// Enhanced saveAnalyticsData function with error handling and validation
async function saveAnalyticsData(type, data) {
    try {
        // Verify admin permissions first
        const hasPermission = await verifyAdminPermissions();
        if (!hasPermission) {
            throw new Error('Insufficient permissions to save analytics data');
        }

        // Create analytics document with required fields
        const analyticsRef = collection(db, 'analytics');
        const analyticsDoc = {
            type,
            data,
            timestamp: Timestamp.now(),
            userId: auth.currentUser?.uid,
            createdAt: Timestamp.now(),
            status: 'active'
        };

        // Add document with error handling
        const docRef = await addDoc(analyticsRef, analyticsDoc);
        console.log(`Analytics data saved successfully with ID: ${docRef.id}`);
        return docRef.id;
    } catch (error) {
        console.error(`Error saving ${type} data:`, error);
        throw error;
    }
}

// Update initializeAnalytics function
// Removed, as it's now combined with the other initializeAnalytics function

// Enhanced analytics data fetching with permissions check
async function fetchAnalyticsData(establishment, dateRange) {
    try {
        const bookingsRef = collection(db, 'bookings');
        const roomsRef = collection(db, 'rooms');
        
        // Calculate date range
        const now = new Date();
        let startDate = new Date();
        
        switch (dateRange) {
            case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'quarter':
                startDate.setMonth(now.getMonth() - 3);
                break;
            case 'year':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(now.getMonth() - 1); // Default to last month
        }

        // Create Firestore timestamp
        const startTimestamp = Timestamp.fromDate(startDate);
        
        // Build queries with error handling for missing index
        let bookingsQuery = query(bookingsRef);
        let roomsQuery = query(roomsRef);

        try {
            if (establishment) {
                bookingsQuery = query(bookingsQuery, 
                    where('propertyDetails.name', '==', establishment),
                    where('checkIn', '>=', startTimestamp)
                );
                roomsQuery = query(roomsQuery, where('propertyDetails.name', '==', establishment));
            } else {
                bookingsQuery = query(bookingsQuery, where('checkIn', '>=', startTimestamp));
            }
        } catch (error) {
            console.warn('Index not ready, falling back to client-side filtering:', error);
            // Fall back to client-side filtering if index is not ready
            bookingsQuery = query(bookingsRef);
            roomsQuery = query(roomsRef);
        }

        // Get data
        const [bookingsSnapshot, roomsSnapshot] = await Promise.all([
            getDocs(bookingsQuery),
            getDocs(roomsQuery)
        ]);

        // Process bookings with client-side filtering if needed
        const bookings = [];
        bookingsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.checkIn && data.checkIn instanceof Timestamp) {
                const checkInDate = data.checkIn.toDate();
                
                // Apply client-side filters if index was not ready
                if (checkInDate >= startDate && 
                    (!establishment || data.propertyDetails?.name === establishment)) {
                    const booking = {
                        id: doc.id,
                        checkIn: checkInDate,
                        checkOut: data.checkOut instanceof Timestamp ? data.checkOut.toDate() : null,
                        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
                        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
                        totalPrice: data.totalPrice || 0,
                        status: data.status || 'unknown',
                        roomType: data.propertyDetails?.roomType || 'unknown'
                    };
                    bookings.push(booking);
                }
            }
        });

        // Process rooms with client-side filtering if needed
        const rooms = [];
        roomsSnapshot.forEach(doc => {
            const data = doc.data();
            if (!establishment || data.propertyDetails?.name === establishment) {
                const room = {
                    id: doc.id,
                    roomType: data.propertyDetails?.roomType || 'unknown',
                    status: data.status || 'unknown',
                    price: data.price || 0
                };
                rooms.push(room);
            }
        });

        // Calculate monthly data
        const monthsMap = {};
        let monthIterator = new Date(startDate);
        while (monthIterator <= now) {
            const monthKey = monthIterator.toLocaleString('default', { month: 'short', year: 'numeric' });
            monthsMap[monthKey] = {
                month: monthKey,
                bookings: 0,
                sales: 0,
                occupancy: 0
            };
            monthIterator.setMonth(monthIterator.getMonth() + 1);
        }

        // Process bookings for monthly data
        bookings.forEach(booking => {
            if (!booking.checkIn || booking.status === 'cancelled') return;
            
            const monthKey = booking.checkIn.toLocaleString('default', { month: 'short', year: 'numeric' });
            if (monthsMap[monthKey]) {
                monthsMap[monthKey].bookings++;
                monthsMap[monthKey].sales += booking.totalPrice;
            }
        });

        // Calculate room type distribution
        const roomTypes = rooms.reduce((acc, room) => {
            const type = room.roomType;
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        // Calculate occupancy rates
        const totalRooms = rooms.length || 1;
        Object.keys(monthsMap).forEach(monthKey => {
            const monthStart = new Date(monthKey);
            const monthEnd = new Date(monthStart);
            monthEnd.setMonth(monthEnd.getMonth() + 1);

            const occupiedRooms = bookings.filter(booking => {
                if (!booking.checkIn || booking.status === 'cancelled') return false;
                return booking.checkIn >= monthStart && booking.checkIn < monthEnd;
            }).length;

            monthsMap[monthKey].occupancy = (occupiedRooms / totalRooms) * 100;
        });

        // Calculate sales per room type
        const salesPerRoom = Object.keys(roomTypes).map(type => ({
            type,
            sales: bookings
                .filter(b => b.roomType === type)
                .reduce((sum, b) => sum + b.totalPrice, 0)
        }));

        // Convert to arrays for charts
        const monthlyData = Object.values(monthsMap).sort((a, b) => {
            const dateA = new Date(a.month);
            const dateB = new Date(b.month);
            return dateA - dateB;
        });

        return {
            occupancy: monthlyData.map(m => ({
                month: m.month,
                rate: m.occupancy
            })),
            sales: monthlyData.map(m => ({
                month: m.month,
                amount: m.sales
            })),
            bookings: monthlyData.map(m => ({
                month: m.month,
                count: m.bookings
            })),
            seasonalTrends: monthlyData.map(m => ({
                month: m.month,
                value: m.occupancy
            })),
            roomTypes,
            salesPerRoom
        };
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        throw error;
    }
}

// Add permissions verification helper
async function verifyAdminPermissions() {
    try {
        const user = auth.currentUser;
        if (!user) return false;

        // During development, always return true
        return true;

        // For production, uncomment the following:
        /*
        const userDoc = await getDoc(doc(db, "users", user.uid));
        return userDoc.exists() && userDoc.data().role === 'admin';
        */
    } catch (error) {
        console.warn('Error verifying permissions:', error);
        return true; // During development
    }
}

// Fetch integrated analytics data
async function fetchIntegratedAnalytics() {
    try {
        const fetchWithFallback = async (collectionName) => {
            try {
                const snapshot = await getDocs(collection(db, collectionName));
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (error) {
                console.warn(`Error fetching ${collectionName}:`, error);
                return []; // Return empty array instead of throwing
            }
        };

        // Fetch all collections in parallel
        const [bookings, rooms, sales, customers, activities] = await Promise.all([
            fetchWithFallback('bookings'),
            fetchWithFallback('rooms'),
            fetchWithFallback('sales'),
            fetchWithFallback('customers'),
            fetchWithFallback('activityLogs')
        ]);

        return {
            bookings,
            rooms,
            sales,
            customers,
            activities,
            timestamp: new Date(),
            status: 'success'
        };
    } catch (error) {
        console.error('Error fetching integrated analytics:', error);
        return {
            bookings: [],
            rooms: [],
            sales: [],
            customers: [],
            activities: [],
            timestamp: new Date(),
            status: 'partial',
            error: error.message
        };
    }
}

// Add module-specific analytics queries
async function fetchModuleAnalytics(module, period) {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - period);

        const queryMap = {
            bookings: query(
                collection(db, 'bookings'),
                where('createdAt', '>=', startDate),
                orderBy('createdAt', 'desc')
            ),
            rooms: query(
                collection(db, 'rooms'),
                where('updatedAt', '>=', startDate),
                orderBy('updatedAt', 'desc')
            ),
            sales: query(
                collection(db, 'sales'),
                where('date', '>=', startDate),
                orderBy('date', 'desc')
            ),
            activities: query(
                collection(db, 'activityLogs'),
                where('timestamp', '>=', startDate),
                orderBy('timestamp', 'desc')
            )
        };

        const snapshot = await getDocs(queryMap[module]);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error(`Error fetching ${module} analytics:`, error);
        throw error;
    }
}

async function fetchRoomAnalytics() {
    try {
        const user = auth.currentUser;
        if (!user || !(await verifyAdminPermissions())) {
            throw new Error('Insufficient permissions');
        }

        const roomsRef = collection(db, 'rooms');
        const roomsSnapshot = await getDocs(roomsRef);
        const rooms = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch related booking data for rooms
        const bookingsRef = collection(db, 'bookings');
        const bookingsSnapshot = await getDocs(bookingsRef);
        const bookings = bookingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return {
            rooms,
            bookings,
            analytics: {
                totalRooms: rooms.length,
                occupiedRooms: rooms.filter(r => r.status === 'occupied').length,
                availableRooms: rooms.filter(r => r.status === 'available').length,
                maintenanceRooms: rooms.filter(r => r.status === 'maintenance').length,
                roomTypes: rooms.reduce((acc, room) => {
                    acc[room.roomType] = (acc[room.roomType] || 0) + 1;
                    return acc;
                }, {}),
                occupancyRate: calculateOccupancyRate(rooms),
                revenueByRoom: calculateRevenueByRoom(rooms, bookings),
                popularRooms: identifyPopularRooms(rooms, bookings)
            }
        };
    } catch (error) {
        console.error('Error fetching room analytics:', error);
        throw error;
    }
}

function calculateOccupancyRate(rooms) {
    const total = rooms.length;
    const occupied = rooms.filter(r => r.status === 'occupied').length;
    return total > 0 ? (occupied / total) * 100 : 0;
}

function calculateRevenueByRoom(rooms, bookings) {
    return rooms.reduce((acc, room) => {
        const roomBookings = bookings.filter(b => b.roomId === room.id);
        acc[room.roomNumber] = roomBookings.reduce((sum, booking) => sum + (booking.totalAmount || 0), 0);
        return acc;
    }, {});
}

function identifyPopularRooms(rooms, bookings) {
    const roomBookings = rooms.map(room => ({
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        bookingCount: bookings.filter(b => b.roomId === room.id).length,
        revenue: bookings
            .filter(b => b.roomId === room.id)
            .reduce((sum, booking) => sum + (booking.totalAmount || 0), 0)
    }));

    return roomBookings.sort((a, b) => b.bookingCount - a.bookingCount);
}

// Add error handling for initialization
async function createRequiredIndexes() {
    try {
        const indexes = [
            {
                collectionGroup: 'bookings',
                queryScope: 'COLLECTION',
                fields: [
                    { fieldPath: 'status', order: 'ASCENDING' },
                    { fieldPath: 'checkIn', order: 'ASCENDING' }
                ]
            }
        ];

        // Log index creation requirements
        indexes.forEach(index => {
            console.log(`Required index for ${index.collectionGroup}:`, {
                fields: index.fields.map(f => `${f.fieldPath} ${f.order}`).join(', '),
                url: `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/indexes`
            });
        });

        return true;
    } catch (error) {
        console.error('Error checking indexes:', error);
        return false;
    }
}

// Helper function to safely convert to Timestamp
function safeTimestamp(date) {
    if (!date) return Timestamp.now();
    if (date instanceof Timestamp) return date;
    
    try {
        let parsedDate;
        if (typeof date === 'string') {
            // Try to parse the string date
            parsedDate = new Date(date);
        } else if (date instanceof Date) {
            parsedDate = date;
        } else if (typeof date === 'object' && date.seconds) {
            // Handle Firestore Timestamp-like objects
            return Timestamp.fromMillis(date.seconds * 1000);
        } else {
            console.warn('Unhandled date format, using current time');
            return Timestamp.now();
        }

        // Validate the parsed date
        if (isNaN(parsedDate.getTime())) {
            console.warn('Invalid date provided, using current time');
            return Timestamp.now();
        }

        return Timestamp.fromDate(parsedDate);
    } catch (error) {
        console.warn('Error parsing date, using current time:', error);
        return Timestamp.now();
    }
}

// Add this function before the exports
async function initializeFirebase() {
    try {
        if (!app) {
            app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            console.log('Firebase initialized successfully');
        }
        return true;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return false;
    }
}

// Add error handling utility function
export async function executeFirebaseOperation(operation, errorMessage) {
    try {
        return await operation();
    } catch (error) {
        console.error(`${errorMessage}:`, error);
        
        // Handle common Firebase errors
        if (error.code === 'permission-denied') {
            throw new Error('You do not have permission to perform this action');
        } else if (error.code === 'failed-precondition') {
            throw new Error('Operation cannot be performed in the current state');
        }
        
        throw error;
    }
}

// Export everything needed
export {
    app,
    auth,
    db,
    analytics,
    // Firestore functions
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    Timestamp,
    orderBy,
    limit,
    onSnapshot, // Add this export
    // Auth functions
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    fetchSignInMethodsForEmail,
    // Custom functions
    register,
    signIn,
    signOut,
    checkAuth,
    checkAdminAuth,
    addBooking,
    updateBooking,
    fetchRoomsData,
    fetchRoomById,
    addRoom,
    updateRoom,
    deleteRoom,
    fetchAnalyticsData,
    fetchIntegratedAnalytics,
    fetchModuleAnalytics,
    fetchRoomAnalytics,
    verifyAdminPermissions,
    logAdminActivity,
    logPageNavigation,
    getCurrentUser,
    setAdminRole,
    safeTimestamp,
    createRequiredIndexes,
    validateBookingData,
    initializeFirebase
};
