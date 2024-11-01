document.getElementById('accountSettingsForm').addEventListener('submit', function(event) {
    event.preventDefault();
    alert('Account settings updated successfully!');
});

document.getElementById('appPreferencesForm').addEventListener('submit', function(event) {
    event.preventDefault();
    alert('Preferences saved successfully!');
});
