import { db } from '../../AdminSide/firebase.js';
import { auth } from '../../AdminSide/firebase.js'; // Add auth import
import { collection, addDoc, Timestamp, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class ReviewSystem {
    constructor(lodgeId) {
        this.lodgeId = lodgeId;
        this.currentRating = 0;
        this.currentPage = 1;
        this.reviewsPerPage = 10;
        this.allReviews = [];
    }

    initialize() {
        this.initializeStarRating();
        this.initializeReviewForm();
        this.loadReviews();
    }

    initializeStarRating() {
        const starRating = document.getElementById('star-rating');
        const stars = starRating.querySelectorAll('.fa-star');
        
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const rating = parseInt(star.getAttribute('data-rating'));
                this.currentRating = rating;
                this.updateStars(rating);
            });

            star.addEventListener('mouseover', () => {
                const rating = parseInt(star.getAttribute('data-rating'));
                this.highlightStars(rating);
            });

            star.addEventListener('mouseout', () => {
                this.highlightStars(this.currentRating);
            });
        });
    }

    updateStars(rating) {
        const stars = document.querySelectorAll('#star-rating .fa-star');
        stars.forEach((star, index) => {
            star.classList.toggle('text-yellow-500', index < rating);
            star.classList.toggle('text-gray-300', index >= rating);
        });
    }

    highlightStars(rating) {
        this.updateStars(rating);
    }

    initializeReviewForm() {
        const reviewForm = document.getElementById('review-form');
        if (!reviewForm) {
            console.error('Review form not found');
            return;
        }

        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            try {
                const user = auth.currentUser;
                if (!user) {
                    alert('Please log in to submit a review');
                    return;
                }

                if (this.currentRating === 0) {
                    alert('Please select a rating');
                    return;
                }

                const reviewText = document.getElementById('review-text').value.trim();
                if (!reviewText) {
                    alert('Please enter your review');
                    return;
                }

                const reviewData = {
                    userId: user.uid,
                    userName: user.displayName || user.email.split('@')[0],
                    rating: this.currentRating,
                    review: reviewText,
                    lodgeId: this.lodgeId,
                    createdAt: Timestamp.now()
                };

                await this.submitReview(reviewData);
                
                // Clear form and reset rating
                this.currentRating = 0;
                reviewForm.reset();
                this.updateStars(0);
                
                alert('Thank you for your review!');
                await this.loadReviews(); // Reload reviews after submission
            } catch (error) {
                console.error('Error submitting review:', error);
                // Removed the error alert
            }
        });
    }

    async submitReview(reviewData) {
        const reviewsRef = collection(db, 'reviews');
        await addDoc(reviewsRef, reviewData);
    }

    async loadReviews() {
        // Create or get containers if they don't exist
        let reviewsContainer = document.getElementById('user-reviews-list');
        let loadingIndicator = document.getElementById('reviews-loading');
        let noReviewsMessage = document.getElementById('no-reviews');
        
        // If elements don't exist, create them
        if (!reviewsContainer || !loadingIndicator || !noReviewsMessage) {
            const reviewsSection = document.getElementById('reviews-section');
            if (!reviewsSection) {
                console.error('Reviews section not found');
                return;
            }

            if (!reviewsContainer) {
                reviewsContainer = document.createElement('div');
                reviewsContainer.id = 'user-reviews-list';
                reviewsContainer.className = 'space-y-4';
                reviewsSection.appendChild(reviewsContainer);
            }

            if (!loadingIndicator) {
                loadingIndicator = document.createElement('div');
                loadingIndicator.id = 'reviews-loading';
                loadingIndicator.className = 'text-center py-4';
                loadingIndicator.innerHTML = `
                    <i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i>
                    <p class="text-gray-500 mt-2">Loading reviews...</p>
                `;
                reviewsContainer.appendChild(loadingIndicator);
            }

            if (!noReviewsMessage) {
                noReviewsMessage = document.createElement('div');
                noReviewsMessage.id = 'no-reviews';
                noReviewsMessage.className = 'hidden text-center py-8 text-gray-500';
                noReviewsMessage.innerHTML = `
                    <i class="fas fa-comment-slash text-4xl mb-3"></i>
                    <p>No reviews yet. Be the first to leave a review!</p>
                `;
                reviewsContainer.appendChild(noReviewsMessage);
            }
        }

        try {
            loadingIndicator.classList.remove('hidden');
            noReviewsMessage.classList.add('hidden');
            reviewsContainer.innerHTML = '';

            const reviewsRef = collection(db, 'reviews');
            const q = query(reviewsRef, where('lodgeId', '==', this.lodgeId));
            const querySnapshot = await getDocs(q);
            this.allReviews = [];
            
            querySnapshot.forEach((doc) => {
                this.allReviews.push({ id: doc.id, ...doc.data() });
            });

            this.allReviews.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);

            loadingIndicator.classList.add('hidden');

            if (this.allReviews.length === 0) {
                noReviewsMessage.classList.remove('hidden');
                return;
            }

            this.updateAverageRating(this.allReviews);
            this.displayReviewPage(1);
            this.setupPagination();

        } catch (error) {
            console.error('Error loading reviews:', error);
            this.handleLoadError(loadingIndicator, reviewsContainer);
        }
    }

    displayReviewPage(page) {
        const container = document.getElementById('user-reviews-list');
        container.innerHTML = '';

        const startIndex = (page - 1) * this.reviewsPerPage;
        const endIndex = Math.min(startIndex + this.reviewsPerPage, this.allReviews.length);
        const pageReviews = this.allReviews.slice(startIndex, endIndex);

        // Create reviews container with fixed height and scrolling
        const reviewsWrapper = document.createElement('div');
        reviewsWrapper.className = 'max-h-[600px] overflow-y-auto space-y-4 mb-4 p-2';
        
        pageReviews.forEach(review => {
            const reviewEl = document.createElement('div');
            reviewEl.className = 'bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow';
            
            const date = review.createdAt.toDate();
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            reviewEl.innerHTML = `
                <div class="flex items-center mb-4">
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-800">${review.userName}</h4>
                        <p class="text-sm text-gray-500">${formattedDate}</p>
                    </div>
                    <div class="flex text-yellow-500">
                        ${Array(review.rating).fill('★').join('')}${Array(5-review.rating).fill('☆').join('')}
                    </div>
                </div>
                <p class="text-gray-700">${review.review}</p>
            `;

            reviewsWrapper.appendChild(reviewEl);
        });

        container.appendChild(reviewsWrapper);
    }

    setupPagination() {
        const totalPages = Math.ceil(this.allReviews.length / this.reviewsPerPage);
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'flex justify-center items-center space-x-2 mt-4';
        
        // Previous button
        const prevButton = document.createElement('button');
        prevButton.className = 'px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50';
        prevButton.textContent = '←';
        prevButton.disabled = this.currentPage === 1;
        prevButton.onclick = () => this.changePage(this.currentPage - 1);
        
        // Page numbers
        const pageNumbers = document.createElement('div');
        pageNumbers.className = 'flex space-x-2';
        
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.className = `px-3 py-1 rounded ${
                i === this.currentPage ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'
            }`;
            pageButton.textContent = i;
            pageButton.onclick = () => this.changePage(i);
            pageNumbers.appendChild(pageButton);
        }
        
        // Next button
        const nextButton = document.createElement('button');
        nextButton.className = 'px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50';
        nextButton.textContent = '→';
        nextButton.disabled = this.currentPage === totalPages;
        nextButton.onclick = () => this.changePage(this.currentPage + 1);
        
        paginationContainer.append(prevButton, pageNumbers, nextButton);
        document.getElementById('user-reviews-list').appendChild(paginationContainer);
    }

    changePage(page) {
        this.currentPage = page;
        this.displayReviewPage(page);
        this.setupPagination();
    }

    updateAverageRating(reviews) {
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : '0.0';
        document.querySelector('.text-5xl.font-bold.text-blue-600').textContent = averageRating;
    }

    handleLoadError(loadingIndicator, container) {
        if (loadingIndicator && loadingIndicator.classList) {
            loadingIndicator.classList.add('hidden');
        }
        
        if (container) {
            container.innerHTML = `
                <div class="text-center py-4 text-red-500">
                    <p>Error loading reviews. Please try again later.</p>
                </div>
            `;
        }
    }
}
