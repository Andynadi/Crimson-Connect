document.addEventListener('DOMContentLoaded', function () {
    const addSlotBtn = document.getElementById('add-slot');
    const submitSlotsBtn = document.getElementById('submit-slots');
    const slotsList = document.getElementById('slots-list');
    const dateInput = document.getElementById('date');
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('email-error');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const locationCheckboxes = document.querySelectorAll('input[name="locations"]');

    /** 🚨 Set Default Availability Based on Database */
    async function setDefaultAvailability() {
        try {
            const response = await fetch('/api/default-availability');
            const data = await response.json();

            dateInput.value = data.date;
            startTimeInput.value = data.startTime;
            endTimeInput.value = data.endTime;
        } catch (error) {
            console.error('❌ Error setting default availability:', error);
            // Fallback: Set to next day if API fails
            const today = new Date();
            const nextDay = new Date(today);
            nextDay.setDate(today.getDate() + 1);
            const defaultDate = nextDay.toISOString().split('T')[0];
            dateInput.value = defaultDate;
            startTimeInput.value = '12:00';
            endTimeInput.value = '15:00';
        }
    }

    // Set defaults when the page loads
    setDefaultAvailability();

    /** 🚨 Prevent Past Dates from Being Selected */
    function setMinDate() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const minDate = today.toISOString().split('T')[0];
        dateInput.setAttribute("min", minDate);
    }
    setMinDate();

    /** 🔎 Validate .edu Email in REAL-TIME */
    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.edu$/.test(email.toLowerCase());
    }

    function handleEmailValidation() {
        if (validateEmail(emailInput.value)) {
            emailError.style.display = 'none';
            emailInput.setCustomValidity('');
        } else {
            emailError.style.display = 'block';
            emailInput.setCustomValidity('Invalid email format');
        }
    }
    emailInput.addEventListener('input', handleEmailValidation);
    emailInput.addEventListener('blur', handleEmailValidation);

    /** Get Selected Locations */
    function getSelectedLocations() {
        return Array.from(locationCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
    }

    /** ❌ Prevent Overlapping and Duplicate Slots */
    function timeToMinutes(time) {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
    }

    function checkForOverlap(newSlot) {
        return Array.from(slotsList.children).some(slot => {
            const existingDate = slot.dataset.date;
            const existingStartTime = slot.dataset.startTime;
            const existingEndTime = slot.dataset.endTime;
            const existingLocations = slot.dataset.locations.split(',');
            
            if (existingDate !== newSlot.date) return false;
            
            // Check if there's any overlap in locations
            const hasLocationOverlap = newSlot.locations.some(location => 
                existingLocations.includes(location)
            );
            if (!hasLocationOverlap) return false;

            const existingStart = timeToMinutes(existingStartTime);
            const existingEnd = timeToMinutes(existingEndTime);
            const newStart = timeToMinutes(newSlot.startTime);
            const newEnd = timeToMinutes(newSlot.endTime);

            return (newStart < existingEnd && newEnd > existingStart);
        });
    }

    /** 🚦 Validate Slots Before Adding */
    function validateSlot() {
        if (!validateEmail(emailInput.value)) {
            alert("Please use a valid .edu email address");
            return false;
        }

        if (!dateInput.value || new Date(dateInput.value) < new Date().setHours(0, 0, 0, 0)) {
            alert("You cannot select a past date.");
            return false;
        }

        if (!startTimeInput.value || !endTimeInput.value || startTimeInput.value >= endTimeInput.value) {
            alert("Invalid time range. End time must be after start time.");
            return false;
        }

        const selectedLocations = getSelectedLocations();
        if (selectedLocations.length === 0) {
            alert("Please select at least one location.");
            return false;
        }

        return true;
    }

    /** 🏗️ Add New Slot */
    addSlotBtn.addEventListener('click', function () {
        if (!validateSlot()) return;

        const selectedLocations = getSelectedLocations();
        const newSlot = {
            email: emailInput.value,
            date: dateInput.value,
            startTime: startTimeInput.value,
            endTime: endTimeInput.value,
            locations: selectedLocations
        };

        if (checkForOverlap(newSlot)) {
            alert("You have already added an overlapping or duplicate time slot for one or more selected locations.");
            return;
        }

        const li = document.createElement('li');
        li.textContent = `${newSlot.date} | ${newSlot.startTime} - ${newSlot.endTime} | ${newSlot.locations.join(', ')}`;
        li.dataset.date = newSlot.date;
        li.dataset.startTime = newSlot.startTime;
        li.dataset.endTime = newSlot.endTime;
        li.dataset.locations = newSlot.locations.join(',');

        const removeBtn = document.createElement('button');
        removeBtn.textContent = "×";
        removeBtn.className = "remove-slot";
        removeBtn.onclick = () => li.remove();
        li.appendChild(removeBtn);

        slotsList.appendChild(li);
    });

    /** 🌟 Handle Matching Preference Modal */
    const createMatchingPreferenceModal = () => {
        return new Promise((resolve) => {
            const modal = document.getElementById('matching-preference-modal');
            modal.style.display = 'flex';

            document.getElementById('match-all-slots').addEventListener('click', () => {
                modal.style.display = 'none';
                resolve('all');
            });

            document.getElementById('match-one-slot').addEventListener('click', () => {
                modal.style.display = 'none';
                resolve('one');
            });

            document.getElementById('close-modal').addEventListener('click', () => {
                modal.style.display = 'none';
                resolve(null);
            });
        });
    };

    /** 🚀 Submit All Slots */
    submitSlotsBtn.addEventListener('click', async function () {
        if (!validateSlot()) return;

        const optOut1to1 = document.getElementById('opt-out-1to1').checked;
        const optOutRepeat = document.getElementById('opt-out-repeat').checked;
        const optOutSameSchool = document.getElementById('opt-out-same-school').checked;
        const onlyMatchSameSchool = document.getElementById('only-match-same-school').checked;
        const selectedExperiences = Array.from(document.querySelectorAll('input[name="experiences"]:checked'))
            .map(checkbox => checkbox.value);

        const slots = Array.from(slotsList.children).map(slot => ({
            email: emailInput.value,
            date: slot.dataset.date,
            startTime: slot.dataset.startTime,
            endTime: slot.dataset.endTime,
            locations: slot.dataset.locations.split(',')
        }));

        if (slots.length === 0) {
            alert('Please add at least one valid time slot.');
            return;
        }

        let matchingPreference = "one";
        if (slots.length > 1) {
            matchingPreference = await createMatchingPreferenceModal();
            if (matchingPreference === null) {
                return; // User closed the modal, do not proceed with submission
            }
        }

        submitSlotsBtn.disabled = true;
        submitSlotsBtn.textContent = 'Submitting...';

        try {
            const response = await fetch('http://localhost:5500/api/submit-availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: emailInput.value, 
                    slots,
                    optOut1to1,
                    optOutRepeat,
                    optOutSameSchool,
                    onlyMatchSameSchool,
                    experiences: selectedExperiences,
                    matchingPreference
                })
            });

            if (!response.ok) throw new Error(await response.text());

            alert('Availability submitted successfully!');
            slotsList.innerHTML = '';
            emailInput.value = '';
        } catch (error) {
            console.error('Submission error:', error);
            alert('Submission failed. Please try again.');
        } finally {
            submitSlotsBtn.disabled = false;
            submitSlotsBtn.textContent = 'Submit Availability';
        }
    });

    /** 🔒 Mutual Exclusivity for School Filters */
    const optOutSchool = document.getElementById("opt-out-same-school");
    const onlyMatchSchool = document.getElementById("only-match-same-school");

    optOutSchool.addEventListener("change", function() {
        if (this.checked) {
            onlyMatchSchool.checked = false;
        }
    });

    onlyMatchSchool.addEventListener("change", function() {
        if (this.checked) {
            optOutSchool.checked = false;
        }
    });
});