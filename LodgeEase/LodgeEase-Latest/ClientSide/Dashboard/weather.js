const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast?latitude=16.4164&longitude=120.5931&hourly=rain,apparent_temperature,precipitation_probability,weather_code&timezone=Asia%2FSingapore';

const weatherIcons = {
    0: 'fa-sun',           // Clear sky
    1: 'fa-cloud-sun',     // Partly cloudy
    2: 'fa-cloud',         // Cloudy
    3: 'fa-cloud',         // Overcast
    45: 'fa-smog',         // Foggy
    48: 'fa-smog',         // Depositing rime fog
    51: 'fa-cloud-rain',   // Light drizzle
    53: 'fa-cloud-rain',   // Moderate drizzle
    55: 'fa-cloud-rain',   // Dense drizzle
    61: 'fa-cloud-showers-heavy', // Slight rain
    63: 'fa-cloud-showers-heavy', // Moderate rain
    65: 'fa-cloud-showers-heavy', // Heavy rain
    80: 'fa-cloud-rain',   // Light rain showers
    81: 'fa-cloud-rain',   // Moderate rain showers
    82: 'fa-cloud-rain',   // Violent rain showers
};

async function fetchWeatherData() {
    try {
        const response = await fetch(WEATHER_API_URL);
        const data = await response.json();

        // Get current hour
        const currentHour = new Date().getHours();

        // Safely extract data with fallback values
        const currentTemp = Math.round(data.hourly?.apparent_temperature?.[currentHour] || 0);
        const weatherCode = data.hourly?.weather_code?.[currentHour] || 0;
        const rainAmount = data.hourly?.rain?.[currentHour] || 0;
        const precipProb = data.hourly?.precipitation_probability?.[currentHour] || 0;

        // Update DOM elements
        document.getElementById('current-temp').textContent = `${currentTemp}°C`;
        document.getElementById('rain-chance').textContent = `${rainAmount} mm`;
        document.getElementById('precipitation').textContent = `${precipProb}%`;
        document.getElementById('feels-like').textContent = `${currentTemp}°C`;

        // Update weather icon
        const weatherIcon = document.getElementById('weather-icon');
        weatherIcon.className = `fas ${weatherIcons[weatherCode] || 'fa-cloud'} text-2xl text-yellow-600`;

        // Update weather description
        const descriptions = {
            0: 'Clear Sky',
            1: 'Partly Cloudy',
            2: 'Cloudy',
            3: 'Overcast',
            45: 'Foggy',
            48: 'Foggy',
            51: 'Light Drizzle',
            53: 'Drizzle',
            55: 'Heavy Drizzle',
            61: 'Light Rain',
            63: 'Rain',
            65: 'Heavy Rain',
            80: 'Light Showers',
            81: 'Rain Showers',
            82: 'Heavy Showers',
        };
        document.getElementById('weather-description').textContent = descriptions[weatherCode] || 'Unknown';

    } catch (error) {
        console.error('Error fetching weather data:', error);

        // Display fallback values in case of an error
        document.getElementById('current-temp').textContent = '--°C';
        document.getElementById('rain-chance').textContent = '-- mm';
        document.getElementById('precipitation').textContent = '--%';
        document.getElementById('feels-like').textContent = '--°C';
        document.getElementById('weather-description').textContent = 'Weather Unavailable';
        document.getElementById('weather-icon').className = 'fas fa-exclamation-circle text-2xl text-red-600';
    }
}

// Update weather every 30 minutes
fetchWeatherData();
setInterval(fetchWeatherData, 30 * 60 * 1000);
