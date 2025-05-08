import { 
    auth, 
    db, 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs, 
    Timestamp, 
    orderBy 
} from '../firebase.js';

/**
 * ReviewSystem class for handling lodge reviews functionality
 */
export class ReviewSystem {
    /**
     * Create a new ReviewSystem for a specific property
     * @param {string} propertyId - The ID of the property for reviews
     */
    constructor(propertyId) {
        this.propertyId = propertyId;
        this.reviews = [];
        this.currentRating = 0;
        this.isInitialized = false;
    }

    /**
     * Initialize the review system by setting up event listeners
     */
    initialize() {
        try {
            console.log(`Initializing review system for ${this.propertyId}`);
            // Set up star rating functionality
            this.setupStarRating();
            
            // Set up review form submission
            this.setupReviewForm();
            
            // Load existing reviews
            this.loadReviews();
            
            this.isInitialized = true;
            console.log('Review system initialized successfully');
        } catch (error) {
            console.error('Error initializing review system:', error);
        }
    }

    /**
     * Set up star rating functionality
     */
    setupStarRating() {
        const starContainer = document.getElementById('star-rating');
        if (!starContainer) {
            console.warn('Star rating container not found');
            return;
        }

        const stars = starContainer.querySelectorAll('i');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const rating = parseInt(star.getAttribute('data-rating'));
                this.currentRating = rating;
                
                // Update UI to reflect the selected rating
                stars.forEach((s, index) => {
                    if (index < rating) {
                        s.classList.remove('text-gray-300');
                        s.classList.add('text-yellow-500');
                    } else {
                        s.classList.remove('text-yellow-500');
                        s.classList.add('text-gray-300');
                    }
                });
            });
            
            // Add hover effect
            star.addEventListener('mouseenter', () => {
                const rating = parseInt(star.getAttribute('data-rating'));
                
                stars.forEach((s, index) => {
                    if (index < rating) {
                        s.classList.add('text-yellow-500');
                        s.classList.remove('text-gray-300');
                    }
                });
            });
            
            star.addEventListener('mouseleave', () => {
                stars.forEach((s, index) => {
                    if (index < this.currentRating) {
                        s.classList.add('text-yellow-500');
                        s.classList.remove('text-gray-300');
                    } else {
                        s.classList.remove('text-yellow-500');
                        s.classList.add('text-gray-300');
                    }
                });
            });
        });
    }

    /**
     * Set up review form submission
     */
    setupReviewForm() {
        const reviewForm = document.getElementById('review-form');
        if (!reviewForm) {
            console.warn('Review form not found');
            return;
        }

        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Check if user is logged in
            if (!auth.currentUser) {
                alert('Please log in to submit a review');
                return;
            }
            
            // Get review text
            const reviewText = document.getElementById('review-text').value.trim();
            if (!reviewText) {
                alert('Please enter a review');
                return;
            }
            
            // Check if rating is selected
            if (this.currentRating === 0) {
                alert('Please select a rating');
                return;
            }
            
            try {
                // Submit the review
                await this.submitReview(reviewText, this.currentRating);
                
                // Reset form
                reviewForm.reset();
                this.currentRating = 0;
                
                // Reset star UI
                const stars = document.querySelectorAll('#star-rating i');
                stars.forEach(star => {
                    star.classList.remove('text-yellow-500');
                    star.classList.add('text-gray-300');
                });
                
                // Show success message
                alert('Review submitted successfully!');
                
                // Reload reviews
                this.loadReviews();
            } catch (error) {
                console.error('Error submitting review:', error);
                alert('Failed to submit review. Please try again.');
            }
        });
    }

    /**
     * Submit a new review
     * @param {string} text - The review text
     * @param {number} rating - The rating (1-5)
     * @returns {Promise} - Promise that resolves when the review is submitted
     */
    async submitReview(text, rating) {
        try {
            const user = auth.currentUser;
            if (!user) {
                throw new Error('User not logged in');
            }
            
            // Get user data
            let userName = user.displayName || 'Guest';
            
            try {
                // Try to get the user's name from the users collection
                const userDoc = await getDocs(query(
                    collection(db, 'users'),
                    where('__name__', '==', user.uid)
                ));
                
                if (!userDoc.empty) {
                    const userData = userDoc.docs[0].data();
                    userName = userData.fullname || userData.username || userName;
                }
            } catch (error) {
                console.warn('Error getting user data:', error);
                // Continue with default name
            }
            
            // Create review object
            const reviewData = {
                propertyId: this.propertyId,
                text,
                rating,
                userId: user.uid,
                userName,
                createdAt: Timestamp.now()
            };
            
            // Add to Firestore
            await addDoc(collection(db, 'reviews'), reviewData);
            console.log('Review added successfully');
        } catch (error) {
            console.error('Error submitting review:', error);
            throw error;
        }
    }

    /**
     * Load existing reviews from Firestore
     */
    async loadReviews() {
        try {
            console.log(`Loading reviews for ${this.propertyId}`);
            
            // Show loading indicator
            const loadingIndicator = document.getElementById('reviews-loading');
            if (loadingIndicator) {
                loadingIndicator.classList.remove('hidden');
            }
            
            // Get reviews
            const reviewsQuery = query(
                collection(db, 'reviews'),
                where('propertyId', '==', this.propertyId),
                orderBy('createdAt', 'desc')
            );
            
            const reviewSnapshot = await getDocs(reviewsQuery);
            this.reviews = reviewSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            console.log(`Loaded ${this.reviews.length} reviews`);
            
            // Display reviews
            this.displayReviews();
            
            // Hide loading indicator
            if (loadingIndicator) {
                loadingIndicator.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading reviews:', error);
            
            // Hide loading indicator
            const loadingIndicator = document.getElementById('reviews-loading');
            if (loadingIndicator) {
                loadingIndicator.classList.add('hidden');
            }
            
            // Show error message
            const reviewsList = document.getElementById('user-reviews-list');
            if (reviewsList) {
                reviewsList.innerHTML = `
                    <div class="text-center py-4">
                        <p class="text-red-500">Failed to load reviews. Please try again later.</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Display reviews in the UI
     */
    displayReviews() {
        const reviewsList = document.getElementById('user-reviews-list');
        const noReviewsMessage = document.getElementById('no-reviews');
        
        if (!reviewsList) {
            console.warn('Reviews list container not found');
            return;
        }
        
        if (this.reviews.length === 0) {
            // Show no reviews message
            if (noReviewsMessage) {
                noReviewsMessage.classList.remove('hidden');
            }
            
            reviewsList.innerHTML = '';
            return;
        }
        
        // Hide no reviews message
        if (noReviewsMessage) {
            noReviewsMessage.classList.add('hidden');
        }
        
        // Generate HTML for each review
        const reviewsHTML = this.reviews.map(review => {
            // Format date
            const date = review.createdAt instanceof Timestamp ? 
                review.createdAt.toDate() : 
                new Date(review.createdAt);
                
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            // Generate star rating HTML
            const starRating = this.generateStarRating(review.rating);
            
            return `
                <div class="border-b pb-6">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center">
                            <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center mr-3">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <h4 class="font-medium">${review.userName || 'Guest'}</h4>
                                <p class="text-xs text-gray-500">${formattedDate}</p>
                            </div>
                        </div>
                        <div class="text-yellow-500">
                            ${starRating}
                        </div>
                    </div>
                    <p class="text-gray-700">${review.text}</p>
                </div>
            `;
        }).join('');
        
        reviewsList.innerHTML = reviewsHTML;
    }

    /**
     * Generate star rating HTML
     * @param {number} rating - The rating (1-5)
     * @returns {string} - Star rating HTML
     */
    generateStarRating(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                stars += '<i class="fas fa-star"></i>';
            } else {
                stars += '<i class="far fa-star"></i>';
            }
        }
        return stars;
    }
}
