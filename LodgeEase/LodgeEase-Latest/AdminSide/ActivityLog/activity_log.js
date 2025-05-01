import { 
    auth, 
    db, 
    collection, 
    query, 
    where, 
    getDocs,
    orderBy,
    Timestamp,
    onSnapshot,
    getDoc,
    doc,
    addDoc,
    signOut 
} from '../firebase.js';
import { ActivityLogger, activityLogger } from './activityLogger.js';
import { checkAuthentication } from '../js/auth-check.js';
import { PageLogger } from '../js/pageLogger.js'; // Update import to use PageLogger instead of logPageView
import { roomActivityLogger } from './roomActivityLogger.js';

// Use the existing Firebase instance
// const auth = getAuth(app); // This line is no longer needed

// Add this helper function at the top
async function verifyAdminAuth() {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('Not authenticated');
    }
    
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists() || userDoc.data().role !== 'admin') {
        throw new Error('Not authorized as admin');
    }
    return true;
}

// Add createActivityLog function at the top
async function createActivityLog(actionType, details, userId = null, userName = null) {
    try {
        const user = auth.currentUser;
        const logEntry = {
            actionType,
            details,
            timestamp: Timestamp.now(),
            userId: userId || user?.uid || 'system',
            userName: userName || user?.email || 'Unknown User',
            userRole: 'admin' // Since this is admin side
        };

        await addDoc(collection(db, 'activityLogs'), logEntry);
        console.log('Activity logged:', logEntry);
    } catch (error) {
        console.error('Error logging activity:', error);
        throw error; // Propagate error for handling
    }
}

// Move this function to the top level for better visibility
async function checkActivityLogsCollection() {
    console.log('Checking activity logs collection...');
    try {
        // Verify admin authentication first
        await verifyAdminAuth();
        
        const logsRef = collection(db, 'activityLogs');
        const snapshot = await getDocs(logsRef);
        
        // Detailed logging
        console.log('Activity Logs Collection Check:', {
            collectionPath: logsRef.path,
            exists: !snapshot.empty,
            count: snapshot.size,
            currentUser: auth.currentUser?.uid
        });

        if (snapshot.empty) {
            console.log('No logs found in collection');
        } else {
            snapshot.forEach(doc => {
                console.log('Log entry:', {
                    id: doc.id,
                    timestamp: doc.data().timestamp?.toDate?.(),
                    actionType: doc.data().actionType,
                    userName: doc.data().userName,
                    details: doc.data().details
                });
            });
        }
    } catch (error) {
        console.error('Error checking activity logs collection:', error);
    }
}

// Update Vue instance to use PageLogger
new Vue({
    el: '#app',
    data: {
        isAuthenticated: false,
        currentUser: null
    },
    async created() {
        // Check authentication status only
        auth.onAuthStateChanged((user) => {
            this.isAuthenticated = !!user;
            this.currentUser = user;
        });
    },
    methods: {
        // async handleLogout() {
        //     try {
        //         await signOut();
        //         window.location.href = '../Login/index.html';
        //     } catch (error) {
        //         console.error('Logout error:', error);
        //     }
        // }
    }
});

// Update the auth state checking to remove duplicate navigation logging
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Activity log page loaded');
    
    auth.onAuthStateChanged(async (user) => {
        try {
            if (!user) {
                console.log('No user detected, redirecting to login...');
                if (window.currentUnsubscribe) window.currentUnsubscribe();
                window.location.href = '../Login/index.html';
                return;
            }

            // Verify admin status
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                console.log('User is not an admin, redirecting...');
                if (window.currentUnsubscribe) window.currentUnsubscribe();
                window.location.href = '../Login/index.html';
                return;
            }

            // Initialize filters
            await setupFilters();

            // Setup real-time listener and store the unsubscribe function
            window.currentUnsubscribe = setupActivityLogListener();

            // Add filter change event listeners
            document.getElementById('userFilter')?.addEventListener('change', applyFilters);
            document.getElementById('actionFilter')?.addEventListener('change', applyFilters);
            document.getElementById('dateFilter')?.addEventListener('change', applyFilters);

        } catch (error) {
            console.error('Error in auth state change:', error);
        }
    });

    // Cleanup on page unload
    window.addEventListener('unload', () => {
        if (window.currentUnsubscribe) window.currentUnsubscribe();
    });

    // Update the action filter options in activity_log.html
    const actionFilter = document.getElementById('actionFilter');
    if (actionFilter) {
        const roomOption = document.createElement('option');
        roomOption.value = 'room_deletion';
        roomOption.textContent = 'Room Deletions';
        actionFilter.appendChild(roomOption);
    }
});

async function setupFilters() {
    try {
        const userFilter = document.getElementById('userFilter');
        if (!userFilter) {
            console.error('User filter element not found');
            return;
        }

        userFilter.innerHTML = '<option value="">All Users</option>';
        
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        const sortedUsers = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            sortedUsers.push({
                id: doc.id,
                name: userData.fullname || userData.username || 'Unknown User'
            });
        });

        // Sort users alphabetically
        sortedUsers.sort((a, b) => a.name.localeCompare(b.name));

        sortedUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            userFilter.appendChild(option);
        });

    } catch (error) {
        console.error('Error setting up filters:', error);
        // Show error in UI if needed
        const userFilter = document.getElementById('userFilter');
        if (userFilter) {
            userFilter.innerHTML = '<option value="">Error loading users</option>';
        }
    }
}

// Completely rewrite the setupActivityLogListener function to avoid index requirements
function setupActivityLogListener() {
    const logsContainer = document.getElementById('activityLogTable');
    const loadingState = document.getElementById('loadingState');
    
    if (!logsContainer || !loadingState) {
        console.error('Required DOM elements not found');
        return;
    }

    try {
        loadingState.classList.remove('hidden');
        
        // Create a simple query with only timestamp ordering
        // This avoids needing composite indexes for multiple filter conditions
        const logsRef = collection(db, 'activityLogs');
        const logsQuery = query(logsRef, orderBy('timestamp', 'desc'));
        
        // Set up listener with in-memory filtering
        return onSnapshot(logsQuery, (snapshot) => {
            loadingState.classList.add('hidden');
            
            if (snapshot.empty) {
                logsContainer.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                            No activity logs found
                        </td>
                    </tr>
                `;
                return;
            }

            // Get filter values for in-memory filtering
            const userFilter = document.getElementById('userFilter')?.value || '';
            const actionFilter = document.getElementById('actionFilter')?.value || '';
            const dateFilter = document.getElementById('dateFilter')?.value || '';
            
            console.log('Applying filters:', { userFilter, actionFilter, dateFilter });
            
            // Apply filters in memory
            let filteredLogs = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    timestampDate: data.timestamp?.toDate() || new Date(),
                    formattedDate: data.timestamp?.toDate().toISOString().split('T')[0] || ''
                };
            });
            
            // User filter
            if (userFilter) {
                filteredLogs = filteredLogs.filter(log => {
                    // Check both userId and userName for more flexibility
                    return (log.userId === userFilter) || (log.userName === userFilter);
                });
            }
            
            // Action filter
            if (actionFilter) {
                filteredLogs = filteredLogs.filter(log => 
                    log.actionType === actionFilter
                );
            }
            
            // Date filter
            if (dateFilter) {
                filteredLogs = filteredLogs.filter(log => 
                    log.formattedDate === dateFilter
                );
            }
            
            // Log filtered results for debugging
            console.log(`Filtered logs: ${filteredLogs.length} of ${snapshot.docs.length} total`);
            
            if (filteredLogs.length === 0) {
                logsContainer.innerHTML = `
                    <tr>
                        <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                            No activity logs match the selected filters
                        </td>
                    </tr>
                `;
                return;
            }
            
            // Generate HTML for filtered logs
            const logsHtml = filteredLogs.map(log => {
                // Enhanced styling for room deletions
                let actionClass = getActionColor(log.actionType);
                let actionDetails = log.details || 'No details';

                // Special handling for room deletions
                if (log.actionType === 'room_deletion') {
                    actionClass = 'bg-red-100 text-red-800';
                    actionDetails = `🗑️ ${actionDetails}`; // Add deletion icon
                }

                return `
                    <tr class="hover:bg-gray-50">
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" data-date="${log.formattedDate}">
                            ${log.timestampDate.toLocaleString()}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" data-user="${log.userName || ''}">
                            ${log.userName || 'Unknown User'}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm" data-action="${log.actionType || ''}">
                            <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${actionClass}">
                                ${(log.actionType || 'UNKNOWN').toUpperCase()}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-sm text-gray-500">
                            ${actionDetails}
                            ${log.module ? `<br><span class="text-xs text-gray-400">(${log.module})</span>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
            
            logsContainer.innerHTML = logsHtml;
            
            // Populate user filter if not already set
            if (!userFilter) {
                populateUserFilter(filteredLogs);
            }
            
            // Update filter status
            updateFilterStatus(filteredLogs.length, snapshot.docs.length);
        }, (error) => {
            console.error('Error in activity log listener:', error);
            handleError(error, logsContainer, loadingState);
        });

    } catch (error) {
        console.error('Error setting up activity log listener:', error);
        handleError(error, logsContainer, loadingState);
        return () => {}; // Return empty function as fallback
    }
}

// Add this helper function for error handling
function handleError(error, container, loadingState) {
    loadingState?.classList.add('hidden');
    if (container) {
        container.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-4 text-center text-red-500">
                    Error: ${error.message}
                    ${error.code ? `(Code: ${error.code})` : ''} 
                </td>
            </tr>
        `;
    }
}

function createLogRow(log) {
    const row = document.createElement('tr');
    row.className = 'hover:bg-gray-50';
    
    let timestampStr = 'Invalid Date';
    try {
        const timestamp = log.timestamp instanceof Timestamp 
            ? log.timestamp.toDate() 
            : new Date(log.timestamp);
        
        timestampStr = timestamp.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        console.error('Error formatting timestamp:', e, log.timestamp);
    }

    // Enhanced log details display
    const details = log.details || 'No details provided';
    const actionType = log.actionType || 'Unknown Action';
    const userName = log.userName || 'Unknown User';

    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">${timestampStr}</td>
        <td class="px-6 py-4 whitespace-nowrap">${userName}</td>
        <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getActionColor(actionType)}">
                ${actionType.toUpperCase()}
            </span>
        </td>
        <td class="px-6 py-4">${details}</td>
    `;
    
    return row;
}

// Update the getActionColor function to include room_deletion
function getActionColor(actionType) {
    const colors = {
        login: 'bg-green-100 text-green-800',
        logout: 'bg-red-100 text-red-800',
        navigation: 'bg-blue-100 text-blue-800',
        booking: 'bg-purple-100 text-purple-800',
        room: 'bg-indigo-100 text-indigo-800',
        room_deletion: 'bg-red-100 text-red-800', 
        room_add: 'bg-green-100 text-green-800',
        room_update: 'bg-yellow-100 text-yellow-800',
        request: 'bg-yellow-100 text-yellow-800'
    };
    return colors[actionType?.toLowerCase()] || 'bg-gray-100 text-gray-800';
}

// Add the action filter dropdown
const actionFilterContainer = document.getElementById('actionFilterContainer');
if (actionFilterContainer) {
    actionFilterContainer.innerHTML = `
        <select id="actionFilter" class="w-full border rounded px-3 py-2">
            <option value="">All Activities</option>
            <option value="login">Logins</option>
            <option value="logout">Logouts</option>
            <option value="navigation">Navigation</option>
            <option value="booking">Booking</option>
            <option value="room">Room Management</option>
            <option value="room_deletion">Room Deletions</option>
            <option value="request">Requests</option>
        </select>
    `;
}

// Add to room_management.js
console.log('Activity logger initialized:', activityLogger);
console.log('Room activity logger initialized:', roomActivityLogger);

// Example of proper usage (only add this if you're testing)
// roomActivityLogger.logRoomDeletion({ 
//   propertyDetails: { 
//     roomNumber: 'Test101', 
//     roomType: 'Standard' 
//   } 
// });

// Filter functions
function applyFilters() {
    try {
        console.log('Applying filters...');
        // Get the current unsubscribe function if it exists
        if (window.currentUnsubscribe && typeof window.currentUnsubscribe === 'function') {
            window.currentUnsubscribe();
        }
        
        // Set up a new listener with the current filters
        window.currentUnsubscribe = setupActivityLogListener();
    } catch (error) {
        console.error('Error applying filters:', error);
        alert('Error applying filters. Please check the console for details.');
    }
}

function clearFilters() {
    try {
        // Reset all filter inputs
        document.getElementById('userFilter').value = '';
        document.getElementById('actionFilter').value = '';
        document.getElementById('dateFilter').value = '';
        
        // Apply the cleared filters
        applyFilters();
    } catch (error) {
        console.error('Error clearing filters:', error);
    }
}

// Update the updateFilterStatus function to accept counts
function updateFilterStatus(visibleCount, totalCount) {
    // If there's a status element, update it
    const statusElement = document.getElementById('filterStatus');
    if (statusElement) {
        statusElement.textContent = `Showing ${visibleCount} of ${totalCount} records`;
    }
}

// Populate user filter with unique users when data is loaded
function populateUserFilter(activityLogs) {
    const userFilter = document.getElementById('userFilter');
    if (!userFilter) return;
    
    // Get unique userNames from the logs
    const users = new Set();
    activityLogs.forEach(log => {
        if (log.userName) {
            users.add(log.userName);
        }
    });
    
    // Keep only the default option
    while (userFilter.options.length > 1) {
        userFilter.remove(1);
    }
    
    // Add user options alphabetically
    [...users].sort().forEach(userName => {
        const option = document.createElement('option');
        option.value = userName;
        option.textContent = userName;
        userFilter.appendChild(option);
    });
}

// Update the existing function that renders activity logs
function renderActivityLogs(logs) {
    // ...existing code...
    
    // Add data attributes for filtering
    tableBody.innerHTML = logs.map(log => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap" data-date="${formatDateForFilter(log.timestamp)}">
                ${formatTimestamp(log.timestamp)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap" data-user="${log.user?.email || ''}">
                ${log.user?.email || 'Unknown User'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap" data-action="${log.action || ''}">
                ${formatAction(log.action)}
            </td>
            <td class="px-6 py-4">
                ${log.details || 'No details provided'}
            </td>
        </tr>
    `).join('');
    
    // Populate user filter after loading data
    populateUserFilter(logs);
    
    // Initialize filter status
    updateFilterStatus();
}

// Helper function to format date for filter
function formatDateForFilter(timestamp) {
    if (!timestamp) return '';
    
    try {
        let date;
        if (timestamp instanceof Timestamp) {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else if (typeof timestamp === 'object' && timestamp.seconds) {
            // Firebase Timestamp object format
            date = new Date(timestamp.seconds * 1000);
        } else {
            date = new Date(timestamp);
        }
        
        return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
    } catch (error) {
        console.error('Error formatting date for filter:', error);
        return '';
    }
}

// Expose filter functions to global scope for the onclick/onchange handlers
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;