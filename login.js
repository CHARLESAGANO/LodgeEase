new Vue({
    el: '.login-container',
    data() {
        return {
            username: '',
            password: '',
            remember: false,
            loading: false,
            errorMessage: '',
            successMessage: ''
        };
    },
    methods: {
        async handleLogin() {
            this.errorMessage = '';
            this.successMessage = '';
            this.loading = true;

            // Basic form validation
            if (!this.username || !this.password) {
                this.errorMessage = "Username and password are required.";
                this.loading = false;
                return;
            }

            try {
                // Simulate an API call with Axios
                const response = await axios.post('https://yourapiurl.com/login', {
                    username: this.username,
                    password: this.password,
                    remember: this.remember
                });

                // Assuming the API response contains a success message
                if (response.data.success) {
                    this.successMessage = "Login successful!";
                    // Redirect or proceed as needed
                    window.location.href = "/dashboard";
                } else {
                    this.errorMessage = "Invalid login credentials.";
                }
            } catch (error) {
                this.errorMessage = "An error occurred. Please try again later.";
            } finally {
                this.loading = false;
            }
        }
    }
});
