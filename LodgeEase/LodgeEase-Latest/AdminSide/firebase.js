console.log('AdminSide/firebase.js: Script execution started.');

// Import Firebase modules using CDN paths
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    setPersistence, 
    browserLocalPersistence,
    signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
    createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword,
    sendPasswordResetEmail as firebaseSendPasswordResetEmail,
    fetchSignInMethodsForEmail as firebaseFetchSignInMethodsForEmail
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore,
    collection as firestoreCollection,
    getDocs as firestoreGetDocs,
    addDoc as firestoreAddDoc,
    updateDoc as firestoreUpdateDoc,
    deleteDoc as firestoreDeleteDoc,
    doc as firestoreDoc,
    getDoc as firestoreGetDoc,
    setDoc as firestoreSetDoc,
    query as firestoreQuery,
    where as firestoreWhere,
    Timestamp as FirestoreTimestamp,
    orderBy as firestoreOrderBy,
    limit as firestoreLimit,
    enableMultiTabIndexedDbPersistence,
    onSnapshot as firestoreOnSnapshot
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

// Create a module-level firebase instance
let _app;
let _auth;
let _db;
let _analytics = null;
let _isInitialized = false;

// Call initialization early
initializeFirebaseInternal(); // Ensure this is called before potential exports are accessed

// Initialize Firebase - only called once
function initializeFirebaseInternal() {
    if (_isInitialized) {
        console.log('AdminSide/firebase.js: Firebase already initialized.');
        return;
    }
    console.log('AdminSide/firebase.js: initializeFirebaseInternal() called.');
    
    try {
        if (!getApps().length) {
            console.log('AdminSide/firebase.js: No Firebase apps initialized. Initializing new app.');
            _app = initializeApp(firebaseConfig);
        } else {
            console.log('AdminSide/firebase.js: Firebase app already exists. Getting existing app.');
            _app = getApp();
        }
        console.log('AdminSide/firebase.js: _app initialized/retrieved. App name:', _app ? _app.name : 'N/A');
        if (_app && _app.options) {
            console.log('AdminSide/firebase.js: _app.options.apiKey type:', typeof _app.options.apiKey);
        } else {
            console.error('AdminSide/firebase.js: _app or _app.options is not available.');
        }

        _auth = getAuth(_app);
        console.log('AdminSide/firebase.js: _auth initialized.');
        
        _db = getFirestore(_app);
        console.log('AdminSide/firebase.js: getFirestore(_app) called. _db assigned.');
        console.log('AdminSide/firebase.js: _db after assignment. Type:', typeof _db, 'Constructor:', _db ? _db.constructor.name : 'N/A');

        if (_db && typeof _db.collection === 'function') {
            console.log('AdminSide/firebase.js: _db appears to be a valid Firestore instance immediately after assignment.');
                } else {
            console.error('AdminSide/firebase.js: _db is NOT a valid Firestore instance immediately after assignment. Keys:', _db ? Object.keys(_db) : 'null');
                }
            
        _isInitialized = true;
        console.log('AdminSide/firebase.js: Firebase initialization complete. _isInitialized = true');
        window._firebaseInitialized = true; // For checking in other scripts if needed
        
    } catch (error) {
        console.error('AdminSide/firebase.js: Error during Firebase initialization:', error);
        // Fallback for _db to prevent further errors if initialization failed catastrophically
        _db = { collection: () => console.error('Fallback _db: Firestore not initialized') }; 
    }
}

// Redundant explicit call (already called at the top) but ensures it if there are hoisting issues with functions
// if (typeof window !== 'undefined' && !window._firebaseInitialized) {
// initializeFirebaseInternal();
// } else if (typeof window === 'undefined') {
// initializeFirebaseInternal(); // For non-browser environments if any
// }

console.log('AdminSide/firebase.js: Exports are being defined. Current _db type:', typeof _db);

// Create getters for basic Firebase objects
export const app = _app;
export const auth = _auth;
export const db = _db;
export const analytics = _analytics;

// Export Firestore functions (wrapped)
export const collection = (...args) => firestoreCollection(...args);
export const getDocs = (...args) => firestoreGetDocs(...args);
export const addDoc = (...args) => firestoreAddDoc(...args);
export const updateDoc = (...args) => firestoreUpdateDoc(...args);
export const deleteDoc = (...args) => firestoreDeleteDoc(...args);
export const doc = (...args) => firestoreDoc(...args);
export const getDoc = (...args) => firestoreGetDoc(...args);
export const setDoc = (...args) => firestoreSetDoc(...args);
export const query = (...args) => firestoreQuery(...args);
export const where = (...args) => firestoreWhere(...args);
export const Timestamp = FirestoreTimestamp;
export const orderBy = (...args) => firestoreOrderBy(...args);
export const limit = (...args) => firestoreLimit(...args);
export const onSnapshot = (...args) => firestoreOnSnapshot(...args);

// Export auth functions (wrapped)
export const signInWithEmailAndPassword = (...args) => firebaseSignInWithEmailAndPassword(...args);
export const createUserWithEmailAndPassword = (...args) => firebaseCreateUserWithEmailAndPassword(...args);
export const sendPasswordResetEmail = (...args) => firebaseSendPasswordResetEmail(...args);
export const fetchSignInMethodsForEmail = (...args) => firebaseFetchSignInMethodsForEmail(...args);

// Add rate limiting for registration attempts
const registrationAttempts = new Map();

// Business logic functions now use the module-level instances
async function signIn(userIdentifier, password) {
    try {
        let email = userIdentifier;
        
        // If userIdentifier is not an email, try to find the email by username
        if (!email.includes('@')) {
            const usersRef = firestoreCollection(_db, "users");
            const q = firestoreQuery(usersRef, firestoreWhere("username", "==", userIdentifier.toLowerCase()));
            const querySnapshot = await firestoreGetDocs(q);
            
            if (querySnapshot.empty) {
                throw new Error('User not found');
            }
            
            email = querySnapshot.docs[0].data().email;
        }
        
        const userCredential = await firebaseSignInWithEmailAndPassword(_auth, email, password);
        const userDoc = await firestoreGetDoc(firestoreDoc(_db, "users", userCredential.user.uid));
        
        if (!userDoc.exists() || !userDoc.data().isAdmin) {
            await _auth.signOut();
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
        const usersRef = firestoreCollection(_db, "users");
        const normalizedUsername = username.toLowerCase().trim();
        const q = firestoreQuery(usersRef, firestoreWhere("username", "==", normalizedUsername));
        const querySnapshot = await firestoreGetDocs(q);
        
        if (!querySnapshot.empty) {
            throw new Error('Username already exists');
        }

        // Create auth user
        const userCredential = await firebaseCreateUserWithEmailAndPassword(_auth, email, password);
        
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

        await setDoc(firestoreDoc(_db, "users", userCredential.user.uid), userData);

        // Log registration
        await addDoc(firestoreCollection(_db, 'activityLogs'), {
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
        const user = _auth.currentUser;
        if (user) {
            await logAdminActivity(user.uid, 'logout', 'User logged out');
        }
        await _auth.signOut();
        return true;
    } catch (error) {
        console.error('Sign out error:', error);
        throw error;
    }
}

async function getCurrentUser() {
    return new Promise((resolve, reject) => {
        const unsubscribe = _auth.onAuthStateChanged(user => {
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

    const userDoc = await getDoc(doc(_db, 'users', user.uid));
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
        const userDoc = await getDoc(doc(_db, "users", userId));
        const userData = userDoc.data();
        
        if (!userData || !userData.isAdmin) {
            console.log('User does not have admin permissions:', userId);
            return null;
        }

        // Ensure activityLogs collection exists
        const logsRef = collection(_db, 'activityLogs');
        
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
        
        const userDoc = await getDoc(doc(_db, "users", userId));
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
            status: bookingData.status || 'confirmed',
            // Include all other fields from the original booking data to prevent loss of information
            guestName: bookingData.guestName || 'Guest',
            email: bookingData.email || '',
            contactNumber: bookingData.contactNumber || '',
            bookingType: bookingData.bookingType || 'standard',
            duration: bookingData.duration || 0,
            subtotal: bookingData.subtotal || 0,
            paymentStatus: bookingData.paymentStatus || 'pending',
            isHourlyRate: bookingData.isHourlyRate || false
        };

        // Validate the formatted data
        validateBookingData(formattedBooking);

        // Check for duplicate bookings before adding to Firestore
        const bookingsRef = collection(_db, 'everlodgebookings');
        
        // Get user ID and room number for duplicate check
        const userId = bookingData.userId;
        const roomNumber = bookingData.propertyDetails?.roomNumber;
        
        // Only proceed with duplicate check if we have userId and roomNumber
        if (userId && roomNumber) {
            // Create query to check for potential duplicates - same user, same room, around same time period
            const duplicateQuery = query(
                bookingsRef,
                where('propertyDetails.roomNumber', '==', roomNumber),
                where('userId', '==', userId)
            );
            
            const querySnapshot = await getDocs(duplicateQuery);
            
            // Check for potential duplicates
            for (const doc of querySnapshot.docs) {
                const existingBooking = doc.data();
                
                try {
                    // Convert timestamps to Date objects for comparison
                    let existingCheckIn;
                    
                    // Safely handle existingBooking.checkIn that might be in different formats
                    if (existingBooking.checkIn) {
                        if (typeof existingBooking.checkIn.toDate === 'function') {
                            existingCheckIn = existingBooking.checkIn.toDate();
                        } else if (existingBooking.checkIn instanceof Date) {
                            existingCheckIn = existingBooking.checkIn;
                        } else if (typeof existingBooking.checkIn === 'string') {
                            existingCheckIn = new Date(existingBooking.checkIn);
                        } else if (typeof existingBooking.checkIn === 'object' && existingBooking.checkIn.seconds) {
                            existingCheckIn = new Date(existingBooking.checkIn.seconds * 1000);
                        } else {
                            console.warn('Unhandled checkIn format, skipping duplicate check for this booking');
                            continue; // Skip this booking if we can't parse the date
                        }
                    } else {
                        console.warn('Missing checkIn date, skipping duplicate check for this booking');
                        continue; // Skip this booking
                    }
                    
                    const newCheckIn = formattedBooking.checkIn.toDate();
                    
                    // Check if check-in dates are within 12 hours of each other (likely duplicate)
                    const hourDifference = Math.abs((existingCheckIn - newCheckIn) / (1000 * 60 * 60));
                    
                    if (hourDifference < 12) {
                        console.log('Potential duplicate booking detected:', {
                            existingId: doc.id,
                            existingCheckIn: existingCheckIn.toISOString(),
                            newCheckIn: newCheckIn.toISOString(),
                            hourDifference
                        });
                        
                        // Prevent duplicate by returning the existing booking ID
                        return doc.id;
                    }
                } catch (parseError) {
                    console.error('Error parsing dates during duplicate check:', parseError);
                    // Continue with the next booking instead of failing the whole function
                    continue;
                }
            }
        }

        // No duplicate found, add to Firestore
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
        const bookingRef = doc(_db, 'everlodgebookings', bookingId);
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
        await logAdminActivity(_auth.currentUser.uid, 'booking', `Updated booking ${bookingId}`);
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
        const roomsRef = collection(_db, "rooms");
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
        const roomRef = doc(_db, "rooms", roomId);
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

        const roomsRef = collection(_db, "rooms");
        const docRef = await addDoc(roomsRef, {
            ...roomData,
            createdAt: Timestamp.fromDate(new Date())
        });
        
        console.log("Room added with data:", roomData); // Debug log
        await logAdminActivity(_auth.currentUser.uid, 'room', `Added new room ${roomData.roomNumber}`);
        return docRef.id;
    } catch (error) {
        console.error("Error adding room: ", error);
        throw error;
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

        const roomRef = doc(_db, "rooms", roomId);
        await updateDoc(roomRef, roomData);
        console.log("Room updated with ID: ", roomId);
    } catch (error) {
        console.error("Error updating room: ", error);
        throw error;
    }
}

// Delete a room
async function deleteRoom(roomId) {
    try {
        const roomRef = doc(_db, "rooms", roomId);
        await deleteDoc(roomRef);
        console.log("Room deleted with ID: ", roomId);
    } catch (error) {
        console.error("Error deleting room: ", error);
        throw error;
    }
}

// Fix the setAdminRole function
async function setAdminRole(userId) {
    try {
        const userRef = doc(_db, "users", userId);
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
            const collRef = collection(_db, collName);
            await setDoc(doc(_db, `${collName}/_config`), {
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
        const analyticsRef = collection(_db, 'analytics');
        const analyticsDoc = {
            type,
            data,
            timestamp: Timestamp.now(),
            userId: _auth.currentUser?.uid,
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
        const bookingsRef = collection(_db, 'everlodgebookings');
        const roomsRef = collection(_db, 'rooms');
        
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
        const user = _auth.currentUser;
        if (!user) return false;

        // During development, always return true
        return true;

        // For production, uncomment the following:
        /*
        const userDoc = await getDoc(doc(_db, "users", user.uid));
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
                const snapshot = await getDocs(collection(_db, collectionName));
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (error) {
                console.warn(`Error fetching ${collectionName}:`, error);
                return []; // Return empty array instead of throwing
            }
        };

        // Fetch all collections in parallel
        const [bookings, rooms, sales, customers, activities] = await Promise.all([
            fetchWithFallback('everlodgebookings'),
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
                collection(_db, 'everlodgebookings'),
                where('createdAt', '>=', startDate),
                orderBy('createdAt', 'desc')
            ),
            rooms: query(
                collection(_db, 'rooms'),
                where('updatedAt', '>=', startDate),
                orderBy('updatedAt', 'desc')
            ),
            sales: query(
                collection(_db, 'sales'),
                where('date', '>=', startDate),
                orderBy('date', 'desc')
            ),
            activities: query(
                collection(_db, 'activityLogs'),
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
        const user = _auth.currentUser;
        if (!user || !(await verifyAdminPermissions())) {
            throw new Error('Insufficient permissions');
        }

        const roomsRef = collection(_db, 'rooms');
        const roomsSnapshot = await getDocs(roomsRef);
        const rooms = roomsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch related booking data for rooms
        const bookingsRef = collection(_db, 'everlodgebookings');
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
                collectionGroup: 'everlodgebookings',
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
            console.warn('Unhandled date format, using current time:', date);
            return Timestamp.now();
        }

        // Validate the parsed date
        if (isNaN(parsedDate.getTime())) {
            console.warn('Invalid date provided, using current time:', date);
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
        // Check if Firebase app is already initialized
        if (getApps().length === 0) {
            // If no apps exist, initialize a new one
            _app = initializeApp(firebaseConfig);
            console.log('Firebase initialized successfully from initializeFirebase()');
            return { app: _app, auth: _auth, db: _db };
        } else {
            // If an app already exists, use the existing one
            _app = getApp();
            console.log('Using existing Firebase app in initializeFirebase()');
            return { app: _app, auth: _auth, db: _db };
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return false;
    }
}

// Add error handling utility function
async function executeFirebaseOperation(operation, errorMessage) {
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

// Billing functions for everlodgebilling collection
async function fetchBillingData() {
    try {
        const user = await checkAdminAuth();
        if (!user) return [];

        // Log the action
        await logAdminActivity(user.uid, 'view_billing', 'Viewed billing data');

        // First get all bookings data to integrate with billing
        const bookingsQuery = query(collection(_db, 'everlodgebookings'), orderBy('createdAt', 'desc'));
        const bookingsSnapshot = await getDocs(bookingsQuery);
        const bookings = bookingsSnapshot.docs
            .filter(doc => {
                // Filter out bookings that are marked as hidden in billing
                const data = doc.data();
                return !data.hiddenInBilling;
            })
            .map(doc => {
                const data = doc.data();
                console.log('Raw booking data for billing:', data);
                return {
                    id: doc.id,
                    ...data,
                    source: 'bookings'
                };
            });

        // Then get billing data
        const billingQuery = query(collection(_db, 'everlodgebilling'), orderBy('createdAt', 'desc'));
        const billingSnapshot = await getDocs(billingQuery);
        const billingRecords = billingSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            source: 'everlodgebilling'
        }));

        // Create a map to track which bookings already have corresponding billing records
        // This helps prevent duplicates when the same booking appears in both collections
        const processedBookings = new Map();
        
        // First, add all billing records to our result set and mark their booking IDs as processed
        // This ensures dedicated billing records take precedence
        billingRecords.forEach(bill => {
            if (bill.bookingId) {
                processedBookings.set(bill.bookingId, true);
            }
        });
        
        // Next, add booking records that don't have a corresponding billing record
        const bookingBills = bookings
            .filter(booking => {
                // Skip this booking if we already have a billing record for it
                if (processedBookings.has(booking.id)) {
                    return false;
                }
                
                // Also skip if we have a booking with the same guest, room, and dates
                // This catches duplicate bookings even if IDs don't match
                for (const bill of billingRecords) {
                    if (booking.guestName === bill.customerName && 
                        booking.roomNumber === bill.roomNumber &&
                        new Date(booking.checkIn).toDateString() === new Date(bill.date).toDateString()) {
                        return false;
                    }
                }
                
                return true;
            })
            .map(booking => {
                // Extract room details with enhanced fallback options
                const roomNumber = booking.roomNumber || 
                    (booking.propertyDetails && booking.propertyDetails.roomNumber) || 
                    (booking.room && booking.room.number) || '';
                
                const roomType = booking.roomType || 
                    (booking.propertyDetails && booking.propertyDetails.roomType) || 
                    (booking.room && booking.room.type) || '';
                
                // Create billing record from booking
                return {
                    id: null, // Will be assigned when saved
                    bookingId: booking.id,
                    customerName: booking.guestName || (booking.guest && booking.guest.name) || (booking.propertyDetails && booking.propertyDetails.guestName) || 'Guest',
                    date: booking.checkIn,
                    checkOut: booking.checkOut,
                    roomNumber: roomNumber,
                    roomType: roomType,
                    baseCost: booking.subtotal || booking.basePrice || booking.price || 0,
                    serviceFee: booking.serviceFee || 0,
                    totalAmount: booking.total || booking.totalPrice || booking.amount || 0,
                    expenses: [],
                    status: 'pending',
                    source: 'bookings'
                };
            });
        
        // Combine and return all records, ensuring no duplicates
        return [...billingRecords, ...bookingBills];
    } catch (error) {
        console.error('Error fetching billing data:', error);
        throw error;
    }
}

async function addBillingRecord(billingData) {
    try {
        const user = await checkAdminAuth();
        if (!user) throw new Error('Authentication required');

        // Format and validate billing data
        const formattedData = {
            ...billingData,
            totalAmount: parseFloat(calculateBillingTotal(billingData)),
            createdAt: Timestamp.now(),
            createdBy: user.uid,
            status: billingData.status || 'unpaid'
        };

        // Add to everlodgebilling collection
        const docRef = await addDoc(collection(_db, 'everlodgebilling'), formattedData);
        
        // Log the action
        await logAdminActivity(user.uid, 'add_billing', `Added billing record for ${billingData.customerName}`);
        
        return {
            id: docRef.id,
            ...formattedData
        };
    } catch (error) {
        console.error('Error adding billing record:', error);
        throw error;
    }
}

async function updateBillingRecord(billingId, updateData) {
    try {
        const user = await checkAdminAuth();
        if (!user) throw new Error('Authentication required');

        // Handle case where billingId is not provided but we have a bookingId
        if (!billingId && updateData.bookingId) {
            return await addBillingRecord(updateData);
        }
        
        // Validate billingId to prevent error with doc reference
        if (!billingId || typeof billingId !== 'string' || billingId.trim() === '') {
            throw new Error('Invalid billing ID: Must be a non-empty string');
        }

        // If expenses are included, recalculate total
        let data = { ...updateData };
        data.totalAmount = parseFloat(calculateBillingTotal(data));
        data.updatedAt = Timestamp.now();
        data.updatedBy = user.uid;

        // Update in everlodgebilling collection
        const billingRef = doc(_db, 'everlodgebilling', billingId);
        await updateDoc(billingRef, data);
        
        // Log the action
        await logAdminActivity(user.uid, 'update_billing', `Updated billing record ${billingId}`);
        
        // If this is linked to a booking, update the booking total too
        if (data.bookingId) {
            try {
                const bookingRef = doc(_db, 'everlodgebookings', data.bookingId);
                const bookingSnapshot = await getDoc(bookingRef);
                
                if (bookingSnapshot.exists()) {
                    await updateDoc(bookingRef, {
                        total: data.totalAmount,
                        updatedAt: Timestamp.now()
                    });
                }
            } catch (bookingError) {
                console.error('Error updating associated booking:', bookingError);
                // Continue even if booking update fails
            }
        }
        
        return { id: billingId, ...data };
    } catch (error) {
        console.error('Error updating billing record:', error);
        throw error;
    }
}

async function deleteBillingRecord(billingId) {
    try {
        const user = await checkAdminAuth();
        if (!user) throw new Error('Authentication required');

        // If billingId is null, this is an unsaved booking-based bill
        if (!billingId) {
            return true;
        }

        // Delete from everlodgebilling collection
        const billingRef = doc(_db, 'everlodgebilling', billingId);
        await deleteDoc(billingRef);
        
        // Log the action
        await logAdminActivity(user.uid, 'delete_billing', `Deleted billing record ${billingId}`);
        
        return true;
    } catch (error) {
        console.error('Error deleting billing record:', error);
        throw error;
    }
}

function calculateBillingTotal(billData) {
    let total = 0;
    
    // Add base cost if available
    if (billData.baseCost) {
        total += parseFloat(billData.baseCost) || 0;
    }
    
    // Add all expenses
    if (billData.expenses && Array.isArray(billData.expenses)) {
        total += billData.expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);
    }
    
    return total.toFixed(2);
}

// Function to update billing information in everlodgebookings collection
async function updateBookingBilling(bookingId, billingData) {
    try {
        const user = await checkAdminAuth();
        if (!user) throw new Error('Authentication required');

        if (!bookingId) throw new Error('Booking ID is required');

        // First, get the current booking data to compare with the edited version
        const bookingRef = doc(_db, 'everlodgebookings', bookingId);
        const bookingSnapshot = await getDoc(bookingRef);
        
        if (!bookingSnapshot.exists()) {
            throw new Error('Booking not found');
        }
        
        const existingData = bookingSnapshot.data();
        const updateData = {};
        
        // Only update fields that have changed
        if (parseFloat(billingData.baseCost) !== parseFloat(existingData.basePrice || 0)) {
            updateData.basePrice = parseFloat(billingData.baseCost) || 0;
        }
        
        const totalAmount = parseFloat(billingData.totalAmount) || 0;
        if (totalAmount !== parseFloat(existingData.total || 0)) {
            updateData.total = totalAmount;
        }
        
        // Check if check-in date has changed - compare with time precision
        if (billingData.date && existingData.checkIn) {
            const newCheckIn = billingData.date instanceof Date ? billingData.date : new Date(billingData.date);
            const existingCheckIn = existingData.checkIn.toDate ? existingData.checkIn.toDate() : new Date(existingData.checkIn);
            
            // Compare with time precision - convert to milliseconds for accurate comparison
            if (newCheckIn.getTime() !== existingCheckIn.getTime()) {
                updateData.checkIn = Timestamp.fromDate(newCheckIn);
            }
        }
        
        // Check if check-out date has changed - compare with time precision
        if (billingData.checkOut && existingData.checkOut) {
            const newCheckOut = billingData.checkOut instanceof Date ? billingData.checkOut : new Date(billingData.checkOut);
            const existingCheckOut = existingData.checkOut.toDate ? existingData.checkOut.toDate() : new Date(existingData.checkOut);
            
            // Compare with time precision - convert to milliseconds for accurate comparison
            if (newCheckOut.getTime() !== existingCheckOut.getTime()) {
                updateData.checkOut = Timestamp.fromDate(newCheckOut);
            }
        }
        
        // Check if expenses have changed by comparing JSON strings
        const existingExpensesJSON = JSON.stringify(existingData.additionalCharges || []);
        const newExpensesJSON = JSON.stringify(billingData.expenses || []);
        
        if (existingExpensesJSON !== newExpensesJSON) {
            updateData.additionalCharges = billingData.expenses || [];
        }
        
        // Only proceed with update if there are changes
        if (Object.keys(updateData).length > 0) {
            // Add metadata
            updateData.updatedAt = Timestamp.now();
            updateData.updatedBy = user.uid;
            
            // Update the booking record with only the changed fields
            await updateDoc(bookingRef, updateData);
            
            // Log the action
            await logAdminActivity(user.uid, 'update_booking_billing', `Updated billing for booking ${bookingId}`);
            
            return { success: true, id: bookingId, changes: Object.keys(updateData) };
        } else {
            // No changes made
            return { success: true, id: bookingId, changes: [] };
        }
    } catch (error) {
        console.error('Error updating booking billing:', error);
        throw error;
    }
}

// Function to delete a booking record
async function deleteBookingRecord(bookingId) {
    try {
        const user = await checkAdminAuth();
        if (!user) throw new Error('Authentication required');

        if (!bookingId) throw new Error('Booking ID is required');

        // Delete from everlodgebookings collection
        const bookingRef = doc(_db, 'everlodgebookings', bookingId);
        await deleteDoc(bookingRef);
        
        // Log the action
        await logAdminActivity(user.uid, 'delete_booking', `Deleted booking record ${bookingId}`);
        
        return true;
    } catch (error) {
        console.error('Error deleting booking record:', error);
        throw error;
    }
}

// Function to mark a booking as hidden in billing view without deleting it
async function markBookingHiddenInBilling(bookingId) {
    try {
        const user = await checkAdminAuth();
        if (!user) throw new Error('Authentication required');

        if (!bookingId) throw new Error('Booking ID is required');

        // Get reference to the booking
        const bookingRef = doc(_db, 'everlodgebookings', bookingId);
        
        // Update the booking to mark it as hidden in billing
        await updateDoc(bookingRef, {
            hiddenInBilling: true,
            updatedAt: Timestamp.now(),
            updatedBy: user.uid
        });
        
        // Log the action
        await logAdminActivity(user.uid, 'hide_booking_in_billing', `Marked booking ${bookingId} as hidden in billing view`);
        
        return true;
    } catch (error) {
        console.error('Error marking booking as hidden in billing:', error);
        throw error;
    }
}

// Function to save a draft booking
async function saveDraftBooking(bookingData) {
    try {
        // Ensure dates are properly formatted for Firestore
        const formattedBooking = {
            ...bookingData,
            checkIn: bookingData.checkIn instanceof Date ? 
                    Timestamp.fromDate(bookingData.checkIn) : 
                    (typeof bookingData.checkIn === 'string' ? 
                     Timestamp.fromDate(new Date(bookingData.checkIn)) : 
                     bookingData.checkIn),
            checkOut: bookingData.checkOut instanceof Date ? 
                     Timestamp.fromDate(bookingData.checkOut) : 
                     (typeof bookingData.checkOut === 'string' ? 
                      Timestamp.fromDate(new Date(bookingData.checkOut)) : 
                      bookingData.checkOut),
            createdAt: Timestamp.now()
        };
        
        // Save to the draftBookings collection
        const draftBookingsRef = collection(_db, "draftBookings");
        const docRef = await addDoc(draftBookingsRef, formattedBooking);
        
        console.log("Draft booking added with ID: ", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Error adding draft booking: ", error);
        throw error;
    }
}

// Function to fetch a draft booking
async function getDraftBooking(bookingId) {
    try {
        const bookingRef = doc(_db, "draftBookings", bookingId);
        const bookingDoc = await getDoc(bookingRef);
        
        if (bookingDoc.exists()) {
            return { id: bookingDoc.id, ...bookingDoc.data() };
        } else {
            console.log("No draft booking found with ID:", bookingId);
            return null;
        }
    } catch (error) {
        console.error("Error getting draft booking: ", error);
        throw error;
    }
}

// Function to delete a draft booking
async function deleteDraftBooking(bookingId) {
    try {
        const bookingRef = doc(_db, "draftBookings", bookingId);
        await deleteDoc(bookingRef);
        console.log("Draft booking deleted with ID: ", bookingId);
        return true;
    } catch (error) {
        console.error("Error deleting draft booking: ", error);
        throw error;
    }
}

// Function to confirm a draft booking
async function confirmDraftBooking(bookingId) {
    try {
        // Get the draft booking
        const draftBookingRef = doc(_db, "draftBookings", bookingId);
        const draftBookingDoc = await getDoc(draftBookingRef);
        
        if (!draftBookingDoc.exists()) {
            throw new Error("Draft booking not found");
        }
        
        const draftBookingData = draftBookingDoc.data();
        
        // Add to everlodgebookings collection
        const bookingsRef = collection(_db, "everlodgebookings");
        const confirmedBookingRef = await addDoc(bookingsRef, {
            ...draftBookingData,
            status: "confirmed",
            paymentStatus: "paid",
            confirmedAt: Timestamp.now()
        });
        
        // Delete the draft booking
        await deleteDoc(draftBookingRef);
        
        console.log("Draft booking confirmed with ID:", confirmedBookingRef.id);
        return confirmedBookingRef.id;
    } catch (error) {
        console.error("Error confirming draft booking: ", error);
        throw error;
    }
}

// Export everything needed
export {
    // Custom functions
    signIn,
    signOut,
    register,
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
    initializeFirebase,
    executeFirebaseOperation,
    fetchBillingData,
    addBillingRecord,
    updateBillingRecord,
    deleteBillingRecord,
    deleteBookingRecord,
    markBookingHiddenInBilling,
    updateBookingBilling,
    calculateBillingTotal,
    // Add new draft booking functions
    saveDraftBooking,
    getDraftBooking,
    deleteDraftBooking,
    confirmDraftBooking
};
