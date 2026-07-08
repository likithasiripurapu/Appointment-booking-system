// AuraHealth - Premium Smart Healthcare Single Page Application Client Logic

// Global State
const state = {
  user: null,
  token: localStorage.getItem('token') || null,
  appointments: [],
  doctors: [],
  adminUsers: [],
  currentPath: 'landing', // 'landing' | 'services' | 'how-it-works' | 'about' | 'login' | 'register' | 'dashboard'
  currentTab: 'overview',  // Active dashboard tab
  specialtyFilter: '',    // Filter doctors by specialty
  appointmentSearch: '',  // Search appointments table
  bookingSelectedDoctor: null // Selected doctor object for appointment form
};

// Base API URL (same origin since Express serves it)
const API_BASE = window.location.origin;

// Helper: JWT decoder (Base64 decode payload without external dependencies)
function decodeToken(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Fetch API Wrapper with Authorization Header & Auth Guard
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // Token expired or invalid, force logout
        handleLogout();
        showToast('Session expired. Please log in again.', 'error');
        throw new Error('Unauthorized');
      }
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  } catch (error) {
    console.error('API Error:', error.message);
    throw error;
  }
}

// Toast Notifications System
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Slide out and remove
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s reverse forwards';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

// Route Navigation
function navigate(path) {
  state.currentPath = path;

  // If moving to dashboard and not logged in, reroute to login
  if (path === 'dashboard' && !state.token) {
    state.currentPath = 'login';
  }

  // If moving to auth views and already logged in, skip to dashboard
  if ((path === 'login' || path === 'register') && state.token) {
    state.currentPath = 'dashboard';
  }

  render();
}

// Initial App Startup Authentication Check
async function checkAuth() {
  if (state.token) {
    try {
      const decoded = decodeToken(state.token);
      if (decoded && decoded.exp * 1000 > Date.now()) {
        const userData = await apiFetch('/api/auth/me');
        state.user = userData;
      } else {
        handleLogout();
      }
    } catch (e) {
      handleLogout();
    }
  }
  navigate(state.token ? 'dashboard' : 'landing');
}

/* --- Global Event Handlers registered on window --- */
window.app = {
  navigate,

  switchTab: (tabName) => {
    state.currentTab = tabName;
    // Reset temporary states
    state.bookingSelectedDoctor = null;
    state.specialtyFilter = '';
    state.appointmentSearch = '';
    render();
  },

  // Auth Operations
  handleLogin: async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      state.token = response.token;
      state.user = response.user;
      localStorage.setItem('token', response.token);

      showToast(`Welcome back, ${state.user.name}!`, 'success');
      state.currentTab = 'overview';
      navigate('dashboard');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  handleRegister: async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm').value;

    if (password !== confirmPassword) {
      return showToast('Passwords do not match', 'error');
    }

    try {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });

      state.token = response.token;
      state.user = response.user;
      localStorage.setItem('token', response.token);

      showToast('Registration successful!', 'success');
      state.currentTab = 'overview';
      navigate('dashboard');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  handleLogout: () => {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    showToast('Logged out successfully', 'info');
    navigate('landing');
  },

  // Quick fill tester credentials
  quickFill: (role) => {
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    if (!emailInput || !passInput) return;

    if (role === 'admin') {
      emailInput.value = 'admin@healthcare.com';
      passInput.value = 'admin123';
    } else if (role === 'doctor') {
      emailInput.value = 'doctor@healthcare.com';
      passInput.value = 'doctor123';
    } else if (role === 'receptionist') {
      emailInput.value = 'receptionist@healthcare.com';
      passInput.value = 'receptionist123';
    } else if (role === 'patient') {
      emailInput.value = 'patient@healthcare.com';
      passInput.value = 'patient123';
    }
    showToast(`${role.toUpperCase()} credentials pre-filled.`, 'info');
  },

  // Doctor Selector in Patient Booking Form
  selectDoctor: (docId, docName) => {
    state.bookingSelectedDoctor = { id: docId, name: docName };
    render();
  },

  // Patient Booking Submission
  handleBookAppointment: async (e) => {
    e.preventDefault();
    if (!state.bookingSelectedDoctor) {
      return showToast('Please select a doctor', 'error');
    }

    const date = document.getElementById('book-date').value;
    const time = document.getElementById('book-time').value;
    const reason = document.getElementById('book-reason').value;

    if (!date || !time || !reason) {
      return showToast('Please fill all booking details', 'error');
    }

    try {
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: state.bookingSelectedDoctor.id,
          doctorName: state.bookingSelectedDoctor.name,
          date,
          time,
          reason
        })
      });

      showToast('Appointment booked successfully! Pending approval.', 'success');
      state.currentTab = 'appointments';
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  // Receptionist Booking Submission (Book for any patient)
  handleReceptionistBookSubmit: async (e) => {
    if (e) e.preventDefault();
    const patientName = state.receptionPatientName;
    const patientEmail = state.receptionPatientEmail;
    const doctor = state.receptionSelectedDoctor;
    const reason = state.receptionReason;

    if (!patientName || !patientEmail || !doctor || !reason) {
      return showToast('Please complete all patient fields and select a doctor', 'error');
    }

    const monthNumbers = {
      'July': '07',
      'August': '08',
      'September': '09'
    };

    const mm = monthNumbers[state.receptionSelectedMonth || 'July'];
    const dd = String(state.receptionSelectedDateNum || 8).padStart(2, '0');
    const date = `2026-${mm}-${dd}`;
    const time = state.receptionSelectedSlot || '9:00 AM';
    const finalReason = `${reason} (${state.receptionSelectedMode || 'In-person'})`;

    try {
      let userResponse;
      try {
        userResponse = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name: patientName, email: patientEmail, password: 'temporary_booking_password' })
        });
      } catch (err) {
        // Email already registered, proceed to book
      }

      const targetToken = userResponse ? userResponse.token : null;

      const payload = {
        doctorId: doctor.id || doctor._id,
        doctorName: doctor.name,
        date,
        time,
        reason: finalReason
      };

      await apiFetch('/api/appointments', {
        method: 'POST',
        headers: targetToken ? { 'Authorization': `Bearer ${targetToken}` } : {},
        body: JSON.stringify(payload)
      });

      showToast('Walk-in booking registered successfully!', 'success');
      
      // Clear receptionist state
      state.receptionPatientName = '';
      state.receptionPatientEmail = '';
      state.receptionSelectedDoctor = null;
      state.receptionReason = '';
      state.receptionSelectedMonth = 'July';
      state.receptionSelectedDateNum = 8;
      state.receptionSelectedSlot = '9:00 AM';
      state.receptionSelectedMode = 'In-person';
      state.receptionStep = 1;

      state.currentTab = 'overview';
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  // Update Appointment Status (Approve / Cancel / Complete)
  handleUpdateStatus: async (apptId, nextStatus) => {
    try {
      await apiFetch(`/api/appointments/${apptId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      showToast(`Appointment status updated to ${nextStatus}.`, 'success');
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  // Admin Create New Staff
  handleCreateStaff: async (e) => {
    e.preventDefault();
    const name = document.getElementById('staff-name').value;
    const email = document.getElementById('staff-email').value;
    const password = document.getElementById('staff-password').value;
    const role = document.getElementById('staff-role').value;
    const specialty = document.getElementById('staff-specialty').value;

    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          specialty: role === 'doctor' ? specialty : undefined
        })
      });

      showToast(`Successfully created ${role} account.`, 'success');
      e.target.reset();
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  // Filters & Search
  setSpecialtyFilter: (specialty) => {
    state.specialtyFilter = specialty;
    render();
  },

  searchAppointments: (e) => {
    state.appointmentSearch = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('.data-table tbody tr');
    rows.forEach(row => {
      const text = row.innerText.toLowerCase();
      if (text.includes(state.appointmentSearch)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  },

  openBookingModal: async () => {
    const existingOverlay = document.getElementById('booking-modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'booking-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '1000';
    
    overlay.innerHTML = `
      <div class="scheduling-modal-card">
        <div class="modal-doctor-header">
          <div class="doc-avatar-box">AH</div>
          <div class="doc-header-info">
            <span class="doc-header-name">Book Appointment</span>
            <span class="doc-header-specialty">Loading available practitioners...</span>
          </div>
          <i data-lucide="x" class="modal-close-icon" onclick="app.closeBookingModal()"></i>
        </div>
        <div class="modal-section-body" id="modal-body-container">
          <div style="text-align: center; padding: 32px;">
            <p style="color: var(--text-muted);">Fetching list of available doctors...</p>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    lucide.createIcons();

    try {
      const docs = await apiFetch('/api/doctors');
      state.doctors = docs;
      state.bookingSelectedDoctor = null;
      app.renderModalDoctorList();
    } catch (err) {
      showToast(err.message, 'error');
      app.closeBookingModal();
    }
  },

  renderModalDoctorList: () => {
    const overlay = document.getElementById('booking-modal-overlay');
    if (!overlay) return;

    const header = overlay.querySelector('.modal-doctor-header');
    header.innerHTML = `
      <div class="doc-avatar-box"><i data-lucide="stethoscope" style="width:18px; height:18px;"></i></div>
      <div class="doc-header-info">
        <span class="doc-header-name">Choose Practitioner</span>
        <span class="doc-header-specialty">Select a doctor to book with</span>
      </div>
      <i data-lucide="x" class="modal-close-icon" onclick="app.closeBookingModal()"></i>
    `;

    const docs = state.doctors || [];
    const docCardsHtml = docs.map(doc => {
      const initials = doc.name.replace('Dr. ', '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      return `
        <div class="modal-doctor-card" onclick="app.selectDoctorInModal('${doc.id || doc._id}')">
          <div class="doc-avatar">${initials}</div>
          <div class="doc-details">
            <span class="doc-name">${doc.name}</span>
            <span class="doc-spec">${doc.specialty || 'General Practice'} • AuraHealth Staff</span>
          </div>
        </div>
      `;
    }).join('');

    const body = overlay.querySelector('#modal-body-container');
    body.innerHTML = `
      <div class="modal-doctor-list">
        ${docCardsHtml || '<p style="color: var(--text-muted); text-align: center;">No clinical practitioners available.</p>'}
      </div>
    `;
    
    lucide.createIcons();
  },

  selectDoctorInModal: (docId) => {
    const doc = state.doctors.find(d => (d.id || d._id) === docId);
    if (!doc) return;

    state.bookingSelectedDoctor = doc;
    state.bookingSelectedMonth = 'July';
    state.bookingSelectedDateNum = 8;
    state.bookingSelectedSlot = '9:00 AM';
    state.bookingSelectedMode = 'In-person';

    app.renderModalScheduling();
  },

  renderModalScheduling: () => {
    const overlay = document.getElementById('booking-modal-overlay');
    if (!overlay || !state.bookingSelectedDoctor) return;

    const doc = state.bookingSelectedDoctor;
    const initials = doc.name.replace('Dr. ', '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    const header = overlay.querySelector('.modal-doctor-header');
    header.innerHTML = `
      <i data-lucide="arrow-left" class="modal-back-icon" onclick="app.goBackToDoctorList()"></i>
      <div class="doc-avatar-box">${initials}</div>
      <div class="doc-header-info">
        <span class="doc-header-name">${doc.name}</span>
        <span class="doc-header-specialty">${doc.specialty || 'General Practice'} • $140 consultation</span>
      </div>
      <i data-lucide="x" class="modal-close-icon" onclick="app.closeBookingModal()"></i>
    `;

    const monthDates = {
      'July': [
        { day: 'Mon', num: 8 },
        { day: 'Tue', num: 9 },
        { day: 'Wed', num: 10 },
        { day: 'Thu', num: 11 },
        { day: 'Fri', num: 12 }
      ],
      'August': [
        { day: 'Mon', num: 10 },
        { day: 'Tue', num: 11 },
        { day: 'Wed', num: 12 },
        { day: 'Thu', num: 13 },
        { day: 'Fri', num: 14 }
      ],
      'September': [
        { day: 'Mon', num: 7 },
        { day: 'Tue', num: 8 },
        { day: 'Wed', num: 9 },
        { day: 'Thu', num: 10 },
        { day: 'Fri', num: 11 }
      ]
    };

    const selectedMonth = state.bookingSelectedMonth || 'July';
    const weekdays = monthDates[selectedMonth];

    const datePillsHtml = weekdays.map(w => `
      <button onclick="app.selectBookingDate(${w.num})" 
              class="date-pill-btn ${state.bookingSelectedDateNum === w.num ? 'selected' : ''}">
        <span class="date-pill-day">${w.day}</span>
        <span class="date-pill-number">${w.num}</span>
      </button>
    `).join('');

    const slots = ['9:00 AM', '10:30 AM', '1:15 PM', '3:30 PM', '5:00 PM'];
    const slotPillsHtml = slots.map(s => `
      <button onclick="app.selectBookingSlot('${s}')" 
              class="slot-pill-btn ${state.bookingSelectedSlot === s ? 'selected' : ''}">
        ${s}
      </button>
    `).join('');

    const modeTogglesHtml = `
      <button onclick="app.selectBookingMode('In-person')" 
              class="mode-toggle-btn ${state.bookingSelectedMode === 'In-person' ? 'selected' : ''}">
        <i data-lucide="map-pin" style="width:16px; height:16px;"></i> In-person
      </button>
      <button onclick="app.selectBookingMode('Video')" 
              class="mode-toggle-btn ${state.bookingSelectedMode === 'Video' ? 'selected' : ''}">
        <i data-lucide="video" style="width:16px; height:16px;"></i> Video
      </button>
    `;

    // Remove footer if exists
    const footer = overlay.querySelector('.modal-footer-summary');
    if (footer) footer.remove();

    const body = overlay.querySelector('#modal-body-container');
    body.innerHTML = `
      <div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
          <span class="modal-section-title" style="margin-bottom: 0;">
            <i data-lucide="calendar" style="width:16px; height:16px;"></i> Select month
          </span>
          <div style="display: flex; gap: 8px;">
            <button onclick="app.selectBookingMonth('July')" class="month-pill-btn ${selectedMonth === 'July' ? 'selected' : ''}">July</button>
            <button onclick="app.selectBookingMonth('August')" class="month-pill-btn ${selectedMonth === 'August' ? 'selected' : ''}">August</button>
            <button onclick="app.selectBookingMonth('September')" class="month-pill-btn ${selectedMonth === 'September' ? 'selected' : ''}">September</button>
          </div>
        </div>
        <div class="modal-date-slider">
          ${datePillsHtml}
        </div>
      </div>

      <div>
        <span class="modal-section-title">
          <i data-lucide="clock" style="width:16px; height:16px;"></i> Available slots
        </span>
        <div class="modal-slots-grid">
          ${slotPillsHtml}
        </div>
      </div>

      <div>
        <span class="modal-section-title">
          <i data-lucide="phone-call" style="width:16px; height:16px;"></i> Consultation mode
        </span>
        <div class="consult-mode-container" style="margin-bottom: 24px;">
          ${modeTogglesHtml}
        </div>
      </div>

      <!-- Action Button inside body -->
      <div style="margin-top: 8px;">
        <button class="btn btn-primary" onclick="app.handleConfirmBooking()" style="width: 100%; padding: 14px; font-weight: 600; font-size: 15px; border-radius: var(--radius-md);">
          Confirm booking
        </button>
      </div>
    `;

    lucide.createIcons();
  },

  selectBookingDate: (num) => {
    state.bookingSelectedDateNum = num;
    app.renderModalScheduling();
  },

  selectBookingSlot: (slot) => {
    state.bookingSelectedSlot = slot;
    app.renderModalScheduling();
  },

  selectBookingMode: (mode) => {
    state.bookingSelectedMode = mode;
    app.renderModalScheduling();
  },

  selectBookingMonth: (month) => {
    state.bookingSelectedMonth = month;
    const monthDates = {
      'July': [
        { day: 'Mon', num: 8 },
        { day: 'Tue', num: 9 },
        { day: 'Wed', num: 10 },
        { day: 'Thu', num: 11 },
        { day: 'Fri', num: 12 }
      ],
      'August': [
        { day: 'Mon', num: 10 },
        { day: 'Tue', num: 11 },
        { day: 'Wed', num: 12 },
        { day: 'Thu', num: 13 },
        { day: 'Fri', num: 14 }
      ],
      'September': [
        { day: 'Mon', num: 7 },
        { day: 'Tue', num: 8 },
        { day: 'Wed', num: 9 },
        { day: 'Thu', num: 10 },
        { day: 'Fri', num: 11 }
      ]
    };
    const dates = monthDates[month];
    state.bookingSelectedDateNum = dates[0].num;
    app.renderModalScheduling();
  },

  selectReceptionistDoctor: (docId) => {
    state.receptionistSelectedDoctor = state.doctors.find(d => (d.id || d._id) === docId);
    loadDashboardData();
  },

  selectReceptionistMonth: (month) => {
    state.receptionistSelectedMonth = month;
    const monthDates = {
      'July': [8, 9, 10, 11, 12],
      'August': [10, 11, 12, 13, 14],
      'September': [7, 8, 9, 10, 11]
    };
    state.receptionistSelectedDateNum = monthDates[month][0];
    loadDashboardData();
  },

  selectReceptionistDate: (num) => {
    state.receptionistSelectedDateNum = num;
    loadDashboardData();
  },

  selectReceptionistSlot: (slot) => {
    state.receptionistSelectedSlot = slot;
    loadDashboardData();
  },

  selectReceptionistMode: (mode) => {
    state.receptionistSelectedMode = mode;
    loadDashboardData();
  },

  selectReceptionDoctor: (docId) => {
    const name = state.receptionPatientName ? state.receptionPatientName.trim() : '';
    const email = state.receptionPatientEmail ? state.receptionPatientEmail.trim() : '';
    if (!name || !email) {
      return showToast('Please enter Patient Name and Email before choosing a doctor', 'error');
    }
    state.receptionSelectedDoctor = state.doctors.find(d => (d.id || d._id) === docId);
    state.receptionStep = 2;
    loadDashboardData();
  },

  goBackToReceptionStep1: () => {
    state.receptionStep = 1;
    loadDashboardData();
  },

  selectReceptionMonth: (month) => {
    state.receptionSelectedMonth = month;
    const monthDates = {
      'July': [8, 9, 10, 11, 12],
      'August': [10, 11, 12, 13, 14],
      'September': [7, 8, 9, 10, 11]
    };
    state.receptionSelectedDateNum = monthDates[month][0];
    loadDashboardData();
  },

  selectReceptionDate: (num) => {
    state.receptionSelectedDateNum = num;
    loadDashboardData();
  },

  selectReceptionSlot: (slot) => {
    state.receptionSelectedSlot = slot;
    loadDashboardData();
  },

  selectReceptionMode: (mode) => {
    state.receptionSelectedMode = mode;
    loadDashboardData();
  },

  openReceptionBookingModal: async () => {
    app.closeReceptionBookingModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'reception-modal-overlay';
    overlay.style.zIndex = '1000';
    
    overlay.innerHTML = `
      <div class="scheduling-modal-card">
        <div class="modal-doctor-header">
          <div class="doc-avatar-box"><i data-lucide="stethoscope" style="width:18px; height:18px;"></i></div>
          <div class="doc-header-info">
            <span class="doc-header-name">Reception Booking</span>
            <span class="doc-header-specialty">Loading booking panel...</span>
          </div>
          <i data-lucide="x" class="modal-close-icon" onclick="app.closeReceptionBookingModal()"></i>
        </div>
        <div class="modal-section-body" id="reception-modal-body-container">
          <div style="text-align: center; padding: 32px;">
            <p style="color: var(--text-muted);">Fetching list of available doctors...</p>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    lucide.createIcons();

    state.receptionPatientName = '';
    state.receptionPatientPhone = '';
    state.receptionPatientEmail = '';
    state.receptionReason = '';
    state.receptionSelectedDoctor = null;
    state.receptionSelectedMonth = 'July';
    state.receptionSelectedDateNum = 8;
    state.receptionSelectedSlot = '9:00 AM';
    state.receptionSelectedMode = 'In-person';

    try {
      const docs = await apiFetch('/api/doctors');
      state.doctors = docs;
      app.renderReceptionModalPatientDetails();
    } catch (err) {
      showToast(err.message, 'error');
      app.closeReceptionBookingModal();
    }
  },

  closeReceptionBookingModal: () => {
    const overlay = document.getElementById('reception-modal-overlay');
    if (overlay) overlay.remove();
  },

  renderReceptionModalPatientDetails: () => {
    const overlay = document.getElementById('reception-modal-overlay');
    if (!overlay) return;

    const header = overlay.querySelector('.modal-doctor-header');
    header.innerHTML = `
      <div class="doc-avatar-box"><i data-lucide="user" style="width:18px; height:18px;"></i></div>
      <div class="doc-header-info">
        <span class="doc-header-name">Patient Details</span>
        <span class="doc-header-specialty">Enter patient information</span>
      </div>
      <i data-lucide="x" class="modal-close-icon" onclick="app.closeReceptionBookingModal()"></i>
    `;

    const body = overlay.querySelector('#reception-modal-body-container');
    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--text-main); display: block;">Patient Full Name</label>
          <div class="input-wrapper">
            <i data-lucide="user" style="width: 16px; height: 16px; left: 12px; color: var(--text-muted);"></i>
            <input type="text" id="modal-rep-name" class="input-control" placeholder="e.g. John Doe" style="padding-left: 38px; height: 44px; border-radius: var(--radius-md); font-size: 14px;" required value="${state.receptionPatientName || ''}" oninput="state.receptionPatientName = this.value">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--text-main); display: block;">Mobile Number</label>
          <div class="input-wrapper">
            <i data-lucide="phone" style="width: 16px; height: 16px; left: 12px; color: var(--text-muted);"></i>
            <input type="tel" id="modal-rep-phone" class="input-control" placeholder="e.g. +1 555-0199" style="padding-left: 38px; height: 44px; border-radius: var(--radius-md); font-size: 14px;" required value="${state.receptionPatientPhone || ''}" oninput="state.receptionPatientPhone = this.value">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--text-main); display: block;">Email Address</label>
          <div class="input-wrapper">
            <i data-lucide="mail" style="width: 16px; height: 16px; left: 12px; color: var(--text-muted);"></i>
            <input type="email" id="modal-rep-email" class="input-control" placeholder="e.g. john@example.com" style="padding-left: 38px; height: 44px; border-radius: var(--radius-md); font-size: 14px;" required value="${state.receptionPatientEmail || ''}" oninput="state.receptionPatientEmail = this.value">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--text-main); display: block;">Reason for Visit</label>
          <div class="input-wrapper">
            <i data-lucide="file-text" style="width: 16px; height: 16px; left: 12px; color: var(--text-muted);"></i>
            <input type="text" id="modal-rep-reason" class="input-control" placeholder="e.g. Consultation / checkup" style="padding-left: 38px; height: 44px; border-radius: var(--radius-md); font-size: 14px;" required value="${state.receptionReason || ''}" oninput="state.receptionReason = this.value">
          </div>
        </div>
        
        <button class="btn btn-primary" onclick="app.nextToDoctorSelection()" style="width: 100%; padding: 14px; font-weight: 600; font-size: 15px; border-radius: var(--radius-md); margin-top: 8px;">
          Continue to Choose Practitioner
        </button>
      </div>
    `;

    lucide.createIcons();
  },

  nextToDoctorSelection: () => {
    const name = state.receptionPatientName ? state.receptionPatientName.trim() : '';
    const phone = state.receptionPatientPhone ? state.receptionPatientPhone.trim() : '';
    const email = state.receptionPatientEmail ? state.receptionPatientEmail.trim() : '';
    const reason = state.receptionReason ? state.receptionReason.trim() : '';

    if (!name || !phone || !email || !reason) {
      return showToast('Please fill out all patient fields to continue', 'error');
    }
    app.renderReceptionModalDoctorList();
  },

  renderReceptionModalDoctorList: () => {
    const overlay = document.getElementById('reception-modal-overlay');
    if (!overlay) return;

    const header = overlay.querySelector('.modal-doctor-header');
    header.innerHTML = `
      <i data-lucide="arrow-left" class="modal-back-icon" onclick="app.renderReceptionModalPatientDetails()"></i>
      <div class="doc-avatar-box"><i data-lucide="stethoscope" style="width:18px; height:18px;"></i></div>
      <div class="doc-header-info">
        <span class="doc-header-name">Choose Practitioner</span>
        <span class="doc-header-specialty">Select a doctor to book with</span>
      </div>
      <i data-lucide="x" class="modal-close-icon" onclick="app.closeReceptionBookingModal()"></i>
    `;

    const docs = state.doctors || [];
    const docCardsHtml = docs.map(doc => {
      const initials = doc.name.replace('Dr. ', '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      return `
        <div class="modal-doctor-card" onclick="app.selectReceptionDoctorInModal('${doc.id || doc._id}')" style="margin-bottom: 8px;">
          <div class="doc-avatar">${initials}</div>
          <div class="doc-details">
            <span class="doc-name">${doc.name}</span>
            <span class="doc-spec">${doc.specialty || 'General Practice'} • AuraHealth Staff</span>
          </div>
        </div>
      `;
    }).join('');

    const body = overlay.querySelector('#reception-modal-body-container');
    body.innerHTML = `
      <div class="modal-doctor-list" style="max-height: 380px; overflow-y: auto; padding-right: 4px;">
        ${docCardsHtml || '<p style="color: var(--text-muted); text-align: center;">No clinical practitioners available.</p>'}
      </div>
    `;

    lucide.createIcons();
  },

  selectReceptionDoctorInModal: (docId) => {
    state.receptionSelectedDoctor = state.doctors.find(d => (d.id || d._id) === docId);
    state.receptionSelectedMonth = 'July';
    state.receptionSelectedDateNum = 8;
    state.receptionSelectedSlot = '9:00 AM';
    state.receptionSelectedMode = 'In-person';
    app.renderReceptionModalScheduling();
  },

  renderReceptionModalScheduling: () => {
    const overlay = document.getElementById('reception-modal-overlay');
    if (!overlay || !state.receptionSelectedDoctor) return;

    const doc = state.receptionSelectedDoctor;
    const initials = doc.name.replace('Dr. ', '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    const header = overlay.querySelector('.modal-doctor-header');
    header.innerHTML = `
      <i data-lucide="arrow-left" class="modal-back-icon" onclick="app.renderReceptionModalDoctorList()"></i>
      <div class="doc-avatar-box">${initials}</div>
      <div class="doc-header-info">
        <span class="doc-header-name">${doc.name}</span>
        <span class="doc-header-specialty">${doc.specialty || 'General Practice'} • $140 consultation</span>
      </div>
      <i data-lucide="x" class="modal-close-icon" onclick="app.closeReceptionBookingModal()"></i>
    `;

    const selectedMonth = state.receptionSelectedMonth;
    const monthButtonsHtml = ['July', 'August', 'September'].map(m => `
      <button type="button" onclick="app.selectReceptionMonthInModal('${m}')" class="month-pill-btn ${selectedMonth === m ? 'selected' : ''}">${m}</button>
    `).join('');

    const monthDates = {
      'July': [
        { day: 'Mon', num: 8 },
        { day: 'Tue', num: 9 },
        { day: 'Wed', num: 10 },
        { day: 'Thu', num: 11 },
        { day: 'Fri', num: 12 }
      ],
      'August': [
        { day: 'Mon', num: 10 },
        { day: 'Tue', num: 11 },
        { day: 'Wed', num: 12 },
        { day: 'Thu', num: 13 },
        { day: 'Fri', num: 14 }
      ],
      'September': [
        { day: 'Mon', num: 7 },
        { day: 'Tue', num: 8 },
        { day: 'Wed', num: 9 },
        { day: 'Thu', num: 10 },
        { day: 'Fri', num: 11 }
      ]
    };
    const weekdays = monthDates[selectedMonth];
    const datePillsHtml = weekdays.map(w => `
      <button type="button" onclick="app.selectReceptionDateInModal(${w.num})" 
              class="date-pill-btn ${state.receptionSelectedDateNum === w.num ? 'selected' : ''}">
        <span class="date-pill-day">${w.day}</span>
        <span class="date-pill-number">${w.num}</span>
      </button>
    `).join('');

    const slots = ['9:00 AM', '10:30 AM', '1:15 PM', '3:30 PM', '5:00 PM'];
    const slotPillsHtml = slots.map(s => `
      <button type="button" onclick="app.selectReceptionSlotInModal('${s}')" 
              class="slot-pill-btn ${state.receptionSelectedSlot === s ? 'selected' : ''}">
        ${s}
      </button>
    `).join('');

    const modeTogglesHtml = `
      <button type="button" onclick="app.selectReceptionModeInModal('In-person')" 
              class="mode-toggle-btn ${state.receptionSelectedMode === 'In-person' ? 'selected' : ''}">
        <i data-lucide="map-pin" style="width:16px; height:16px;"></i> In-person
      </button>
      <button type="button" onclick="app.selectReceptionModeInModal('Video')" 
              class="mode-toggle-btn ${state.receptionSelectedMode === 'Video' ? 'selected' : ''}">
        <i data-lucide="video" style="width:16px; height:16px;"></i> Video
      </button>
    `;

    const body = overlay.querySelector('#reception-modal-body-container');
    body.innerHTML = `
      <div>
        <span class="modal-section-title">
          <i data-lucide="calendar" style="width:16px; height:16px;"></i> Select month
        </span>
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          ${monthButtonsHtml}
        </div>
      </div>

      <div class="modal-date-slider">
        ${datePillsHtml}
      </div>

      <div>
        <span class="modal-section-title">
          <i data-lucide="clock" style="width:16px; height:16px;"></i> Available slots
        </span>
        <div class="modal-slots-grid">
          ${slotPillsHtml}
        </div>
      </div>

      <div>
        <span class="modal-section-title">
          <i data-lucide="phone-call" style="width:16px; height:16px;"></i> Consultation mode
        </span>
        <div class="consult-mode-container" style="margin-bottom: 24px;">
          ${modeTogglesHtml}
        </div>
      </div>

      <div style="margin-top: 8px;">
        <button class="btn btn-primary" onclick="app.confirmReceptionBooking()" style="width: 100%; padding: 14px; font-weight: 600; font-size: 15px; border-radius: var(--radius-md);">
          Confirm booking
        </button>
      </div>
    `;

    lucide.createIcons();
  },

  selectReceptionMonthInModal: (month) => {
    state.receptionSelectedMonth = month;
    const monthDates = {
      'July': [8, 9, 10, 11, 12],
      'August': [10, 11, 12, 13, 14],
      'September': [7, 8, 9, 10, 11]
    };
    state.receptionSelectedDateNum = monthDates[month][0];
    app.renderReceptionModalScheduling();
  },

  selectReceptionDateInModal: (num) => {
    state.receptionSelectedDateNum = num;
    app.renderReceptionModalScheduling();
  },

  selectReceptionSlotInModal: (slot) => {
    state.receptionSelectedSlot = slot;
    app.renderReceptionModalScheduling();
  },

  selectReceptionModeInModal: (mode) => {
    state.receptionSelectedMode = mode;
    app.renderReceptionModalScheduling();
  },

  confirmReceptionBooking: async () => {
    const patientName = state.receptionPatientName;
    const patientPhone = state.receptionPatientPhone;
    const patientEmail = state.receptionPatientEmail;
    const doctor = state.receptionSelectedDoctor;
    const reason = state.receptionReason || 'General Walk-In';

    if (!patientName || !patientPhone || !patientEmail || !doctor) {
      return showToast('Please complete all patient fields and select a doctor', 'error');
    }

    const monthNumbers = {
      'July': '07',
      'August': '08',
      'September': '09'
    };

    const mm = monthNumbers[state.receptionSelectedMonth || 'July'];
    const dd = String(state.receptionSelectedDateNum || 8).padStart(2, '0');
    const date = `2026-${mm}-${dd}`;
    const time = state.receptionSelectedSlot || '9:00 AM';
    const finalReason = `${reason} (Mobile: ${patientPhone}) (${state.receptionSelectedMode || 'In-person'})`;

    try {
      let userResponse;
      try {
        userResponse = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name: patientName, email: patientEmail, password: 'temporary_booking_password' })
        });
      } catch (err) {
        // Email already registered, proceed to book
      }

      const targetToken = userResponse ? userResponse.token : null;

      const payload = {
        doctorId: doctor.id || doctor._id,
        doctorName: doctor.name,
        date,
        time,
        reason: finalReason
      };

      await apiFetch('/api/appointments', {
        method: 'POST',
        headers: targetToken ? { 'Authorization': `Bearer ${targetToken}` } : {},
        body: JSON.stringify(payload)
      });

      showToast('Walk-in booking registered successfully!', 'success');
      app.closeReceptionBookingModal();
      
      // Refresh dashboard
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  goBackToDoctorList: () => {
    state.bookingSelectedDoctor = null;
    const overlay = document.getElementById('booking-modal-overlay');
    if (overlay) {
      const footer = overlay.querySelector('.modal-footer-summary');
      if (footer) footer.remove();
    }
    app.renderModalDoctorList();
  },

  closeBookingModal: () => {
    const overlay = document.getElementById('booking-modal-overlay');
    if (overlay) overlay.remove();
  },

  handleConfirmBooking: async () => {
    if (!state.bookingSelectedDoctor || !state.bookingSelectedDateNum || !state.bookingSelectedSlot || !state.bookingSelectedMode) {
      return showToast('Please complete all selection fields', 'error');
    }

    const monthNumbers = {
      'July': '07',
      'August': '08',
      'September': '09'
    };

    const mm = monthNumbers[state.bookingSelectedMonth || 'July'];
    const dd = String(state.bookingSelectedDateNum).padStart(2, '0');
    const date = `2026-${mm}-${dd}`;
    const time = state.bookingSelectedSlot;
    const reason = `Consultation (${state.bookingSelectedMode})`;

    try {
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: state.bookingSelectedDoctor.id || state.bookingSelectedDoctor._id,
          doctorName: state.bookingSelectedDoctor.name,
          date,
          time,
          reason
        })
      });

      showToast('Appointment booked successfully! Pending approval.', 'success');
      app.closeBookingModal();
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
};

/* --- RENDER LOGIC --- */

function render() {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;

  // Insert Floating Mesh Background
  let backgroundHtml = `
    <div class="mesh-bg">
      <div class="mesh-circle mesh-1"></div>
      <div class="mesh-circle mesh-2"></div>
    </div>
  `;

  // SPA Route Switcher
  const publicPaths = ['landing', 'services', 'how-it-works', 'about'];

  if (publicPaths.includes(state.currentPath)) {
    appContainer.innerHTML = backgroundHtml + renderPublicHeaderHTML(state.currentPath) + renderPublicPageContentHTML(state.currentPath);
  } else if (state.currentPath === 'login') {
    appContainer.innerHTML = backgroundHtml + renderAuthHTML('login');
  } else if (state.currentPath === 'register') {
    appContainer.innerHTML = backgroundHtml + renderAuthHTML('register');
  } else if (state.currentPath === 'dashboard') {
    appContainer.innerHTML = renderDashboardHTML();
    loadDashboardData();
  }

  lucide.createIcons();
}

/* --- PUBLIC PAGES GENERATORS --- */

// Header navbar template with login button in the top-right end
function renderPublicHeaderHTML(activePath) {
  const actionButton = state.token
    ? `<button onclick="app.navigate('dashboard')" class="btn btn-primary">Dashboard</button>`
    : `<button onclick="app.navigate('login')" class="btn btn-primary">Login</button>`;

  return `
    <header class="navbar fade-in">
      <div class="container navbar-container">
        <div class="logo" style="cursor:pointer;" onclick="app.navigate('landing')">
          <i data-lucide="shield-check"></i>
          <span>AuraHealth</span>
        </div>
        <nav class="nav-links">
          <a href="#" onclick="app.navigate('landing'); return false;" class="nav-link ${activePath === 'landing' ? 'active' : ''}">Home</a>
          <a href="#" onclick="app.navigate('services'); return false;" class="nav-link ${activePath === 'services' ? 'active' : ''}">Services</a>
          <a href="#" onclick="app.navigate('how-it-works'); return false;" class="nav-link ${activePath === 'how-it-works' ? 'active' : ''}">How It Works</a>
          <a href="#" onclick="app.navigate('about'); return false;" class="nav-link ${activePath === 'about' ? 'active' : ''}">About Us</a>
          ${actionButton}
        </nav>
      </div>
    </header>
  `;
}

// Router switcher for public pages
function renderPublicPageContentHTML(path) {
  if (path === 'landing') return renderLandingHTML();
  if (path === 'services') return renderServicesHTML();
  if (path === 'how-it-works') return renderHowItWorksHTML();
  if (path === 'about') return renderAboutHTML();
  return '';
}

// 1. HOME LANDING PAGE
function renderLandingHTML() {
  return `
    <main class="container">
      <section class="hero slide-up">
        <div class="badge">
          <i data-lucide="sparkles"></i>
          Next-Gen Clinical Scheduling
        </div>
        <h1 class="hero-title">Smart Healthcare,<br>Elevated Care Experience.</h1>
        <p class="hero-subtitle">
          Secure, intuitive scheduling designed to streamline operations for patients, doctors, and medical reception staff alike.
        </p>
        <div class="hero-actions">
          <button onclick="app.navigate('login')" class="btn btn-primary btn-lg">
            <i data-lucide="calendar"></i> Book Appointment
          </button>
        </div>
      </section>
    </main>
  `;
}

// 2. SERVICES PAGE
function renderServicesHTML() {
  return `
    <main class="container fade-in">
      <div class="page-header">
        <h1>Our Clinical Services</h1>
        <p>AuraHealth provides advanced medical support across specialized fields with state-of-the-art diagnostics.</p>
      </div>

      <section class="specialty-grid">
        <div class="card specialty-card">
          <div class="feature-icon-wrapper">
            <i data-lucide="heart"></i>
          </div>
          <h3>Cardiology Department</h3>
          <p>Complete cardiovascular diagnostics and therapeutics supervised by certified cardiac surgeons.</p>
          <ul class="specialty-list">
            <li><i data-lucide="check-circle-2"></i> Electrocardiogram (ECG)</li>
            <li><i data-lucide="check-circle-2"></i> Preventive Hypertension Therapy</li>
            <li><i data-lucide="check-circle-2"></i> Holter Telemetry Monitoring</li>
          </ul>
          <button onclick="app.navigate('login')" class="btn btn-outline">Schedule Cardiology</button>
        </div>

        <div class="card specialty-card">
          <div class="feature-icon-wrapper">
            <i data-lucide="baby"></i>
          </div>
          <h3>Pediatrics Clinic</h3>
          <p>Compassionate healthcare, developmental tracking, and vaccination services for children.</p>
          <ul class="specialty-list">
            <li><i data-lucide="check-circle-2"></i> Growth & Development Audits</li>
            <li><i data-lucide="check-circle-2"></i> Childhood Immunizations</li>
            <li><i data-lucide="check-circle-2"></i> Acute Pediatric Care</li>
          </ul>
          <button onclick="app.navigate('login')" class="btn btn-outline">Schedule Pediatrics</button>
        </div>

        <div class="card specialty-card">
          <div class="feature-icon-wrapper">
            <i data-lucide="brain"></i>
          </div>
          <h3>Neurology Center</h3>
          <p>Advanced neurological checkups, migraine consultation, and central nervous system diagnostics.</p>
          <ul class="specialty-list">
            <li><i data-lucide="check-circle-2"></i> Sleep Disorder Diagnostics</li>
            <li><i data-lucide="check-circle-2"></i> EEG Brainwave Mapping</li>
            <li><i data-lucide="check-circle-2"></i> Cognitive Therapy</li>
          </ul>
          <button onclick="app.navigate('login')" class="btn btn-outline">Schedule Neurology</button>
        </div>

        <div class="card specialty-card">
          <div class="feature-icon-wrapper">
            <i data-lucide="sparkles"></i>
          </div>
          <h3>Dermatology Clinic</h3>
          <p>Clinical care for complex skin conditions, diagnostic biopsies, and therapeutic solutions.</p>
          <ul class="specialty-list">
            <li><i data-lucide="check-circle-2"></i> Eczema & Psoriasis Therapy</li>
            <li><i data-lucide="check-circle-2"></i> Skin Pathology Audits</li>
            <li><i data-lucide="check-circle-2"></i> Laser Acne Treatments</li>
          </ul>
          <button onclick="app.navigate('login')" class="btn btn-outline">Schedule Dermatology</button>
        </div>
      </section>
    </main>
  `;
}

// 3. HOW IT WORKS PAGE
function renderHowItWorksHTML() {
  return `
    <main class="container fade-in">
      <div class="page-header">
        <h1>How It Works</h1>
        <p>AuraHealth coordinates patients and medical personnel using a simple 4-step scheduling pipeline.</p>
      </div>

      <section class="timeline-container">
        <div class="timeline-line"></div>

        <div class="timeline-step slide-up" style="animation-delay: 0.1s">
          <div class="timeline-number">1</div>
          <div class="card timeline-content">
            <h3>Authenticate Portal Profile</h3>
            <p>Access the unified login terminal. Patients can securely register an email profile, while clinical doctors, administrators, and reception staff use assigned credentials.</p>
          </div>
        </div>

        <div class="timeline-step slide-up" style="animation-delay: 0.2s">
          <div class="timeline-number">2</div>
          <div class="card timeline-content">
            <h3>Select Specialist Physician</h3>
            <p>Patients filter doctors by specialty, review availability slots in real-time, and draft consultation motives. Receptionists can record walk-in requests globally.</p>
          </div>
        </div>

        <div class="timeline-step slide-up" style="animation-delay: 0.3s">
          <div class="timeline-number">3</div>
          <div class="card timeline-content">
            <h3>Receive Queue Confirmation</h3>
            <p>Assigned doctors receive pending bookings instantly on their schedule tab. Appointments can be approved, rescheduled, or cancelled immediately.</p>
          </div>
        </div>

        <div class="timeline-step slide-up" style="animation-delay: 0.4s">
          <div class="timeline-number">4</div>
          <div class="card timeline-content">
            <h3>Complete Medical Consultation</h3>
            <p>Once consultation completes, the doctor updates the record status to "completed" in a single click, archiving the patient encounter safely.</p>
          </div>
        </div>
      </section>
    </main>
  `;
}

// 4. ABOUT US PAGE
function renderAboutHTML() {
  return `
    <main class="container fade-in" style="padding-top: 40px;">
      <div class="page-header">
        <h1>About AuraHealth</h1>
        <p>Combining world-class clinical care with smart digital integrations to elevate health administration.</p>
      </div>

      <section class="about-grid">
        <div class="about-content">
          <h2>Pioneering the Digital Clinic</h2>
          <p>Founded with the target of reducing queue overheads, AuraHealth establishes a direct real-time communication node between clinical administrators, medical practitioners, and patients.</p>
          <p>Our centralized scheduling database streamlines physician workloads, while allowing patients to coordinate diagnostics on their terms, anywhere, anytime.</p>
        </div>
        <div class="about-info-cards">
          <div class="card about-info-card">
            <i data-lucide="map-pin"></i>
            <h4>Clinic Location</h4>
            <p>123 Health Parkway, Suite 500, Medical Plaza</p>
          </div>
          <div class="card about-info-card">
            <i data-lucide="calendar"></i>
            <h4>Working Hours</h4>
            <p>Mon - Sat: 8:00 AM - 8:00 PM<br>Sunday: Emergency Only</p>
          </div>
          <div class="card about-info-card">
            <i data-lucide="phone-call"></i>
            <h4>Support Hotline</h4>
            <p>+1 (555) 019-2834<br>support@aurahealth.com</p>
          </div>
          <div class="card about-info-card">
            <i data-lucide="database"></i>
            <h4>System Architecture</h4>
            <p>MongoDB Schema with file-based JSON redundancy</p>
          </div>
        </div>
      </section>
    </main>
  `;
}

// 5. AUTHENTICATION (LOGIN / REGISTER)
function renderAuthHTML(mode) {
  const isLogin = mode === 'login';

  return `
    <header class="navbar fade-in">
      <div class="container navbar-container">
        <div class="logo" style="cursor:pointer;" onclick="app.navigate('landing')">
          <i data-lucide="shield-check"></i>
          <span>AuraHealth</span>
        </div>
        <button onclick="app.navigate('landing')" class="btn btn-outline">
          <i data-lucide="arrow-left"></i> Home
        </button>
      </div>
    </header>

    <div class="auth-wrapper">
      <div class="card auth-card slide-up">
        <div class="auth-header">
          <h2>${isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p>${isLogin ? 'Enter credentials to access your dashboard' : 'Register for patient booking access'}</p>
        </div>
        
        <form onsubmit="app.${isLogin ? 'handleLogin' : 'handleRegister'}(event)">
          ${!isLogin ? `
            <div class="form-group">
              <label for="reg-name">Full Name</label>
              <div class="input-wrapper">
                <i data-lucide="user"></i>
                <input type="text" id="reg-name" class="input-control" placeholder="John Doe" required>
              </div>
            </div>
          ` : ''}
          
          <div class="form-group">
            <label for="login-email">Email Address</label>
            <div class="input-wrapper">
              <i data-lucide="mail"></i>
              <input type="email" id="${isLogin ? 'login-email' : 'reg-email'}" class="input-control" placeholder="name@example.com" required>
            </div>
          </div>
          
          <div class="form-group">
            <label for="login-password">Password</label>
            <div class="input-wrapper">
              <i data-lucide="lock"></i>
              <input type="password" id="${isLogin ? 'login-password' : 'reg-password'}" class="input-control" placeholder="••••••••" required>
            </div>
          </div>

          ${!isLogin ? `
            <div class="form-group">
              <label for="reg-confirm">Confirm Password</label>
              <div class="input-wrapper">
                <i data-lucide="shield-alert"></i>
                <input type="password" id="reg-confirm" class="input-control" placeholder="••••••••" required>
              </div>
            </div>
          ` : ''}

          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px; height: 46px;">
            ${isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        ${isLogin ? `
          <div class="auth-toggle">
            Don't have an account? <a href="#" onclick="app.navigate('register')">Create one here</a>
          </div>
        ` : `
          <div class="auth-toggle">
            Already have an account? <a href="#" onclick="app.navigate('login')">Sign in here</a>
          </div>
        `}
      </div>
    </div>
  `;
}

// 6. DASHBOARD SHELL
function renderDashboardHTML() {
  const user = state.user;
  if (!user) return '';

  // Configure Sidebar Menu items based on role
  let menuItems = [];
  if (user.role === 'patient') {
    menuItems = [
      { id: 'overview', label: 'My Portal', icon: 'activity' },
      { id: 'appointments', label: 'Booking History', icon: 'clock' }
    ];
  } else if (user.role === 'doctor') {
    menuItems = [
      { id: 'overview', label: 'Dashboard', icon: 'grid' },
      { id: 'appointments', label: 'Patient Schedule', icon: 'calendar-check' }
    ];
  } else if (user.role === 'receptionist') {
    menuItems = [
      { id: 'overview', label: 'Global Schedule', icon: 'list-todo' },
      { id: 'appointments', label: 'Manage Requests', icon: 'check-square' }
    ];
  } else if (user.role === 'admin') {
    menuItems = [
      { id: 'overview', label: 'System Analytics', icon: 'bar-chart-3' },
      { id: 'staff', label: 'Staff Management', icon: 'users-2' }
    ];
  }

  const sidebarMenuHtml = menuItems.map(item => `
    <li>
      <button onclick="app.switchTab('${item.id}')" class="sidebar-btn ${state.currentTab === item.id ? 'active' : ''}">
        <i data-lucide="${item.icon}"></i>
        <span>${item.label}</span>
      </button>
    </li>
  `).join('');

  return `
    <div class="dashboard-layout">
      <!-- Left Fixed Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-logo">
          <div class="logo">
            <i data-lucide="shield-check"></i>
            <span>AuraHealth</span>
          </div>
        </div>

        <ul class="sidebar-menu">
          ${sidebarMenuHtml}
        </ul>

        <div class="sidebar-footer">
          <div class="user-profile-badge">
            <div class="user-avatar">
              ${user.name.charAt(0).toUpperCase()}
            </div>
            <div class="user-info">
              <span class="user-name">${user.name}</span>
              <span class="user-role">${user.role}</span>
            </div>
          </div>
          <button onclick="app.handleLogout()" class="btn btn-outline" style="width: 100%">
            <i data-lucide="log-out"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <!-- Main Panel Workspace -->
      <main class="dashboard-main">
        <header class="dashboard-header">
          <div class="dashboard-title">
            <h1 id="workspace-title">Loading...</h1>
            <p id="workspace-subtitle">Fetching data from backend</p>
          </div>
          <div class="dashboard-actions" id="workspace-header-actions">
            <!-- Dynamic elements loaded here -->
          </div>
        </header>

        <!-- Dynamic Content Workspace Panel -->
        <section id="dashboard-workspace-panel" class="fade-in">
          <div class="card" style="padding: 40px; display: flex; flex-direction: column; gap: 16px;">
            <div class="skeleton-line" style="width: 60%"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line" style="width: 80%"></div>
          </div>
        </section>
      </main>
    </div>
  `;
}

// 7. LOAD & RENDER DATA ON DASHBOARD TAB CHANGE
async function loadDashboardData() {
  const panel = document.getElementById('dashboard-workspace-panel');
  const title = document.getElementById('workspace-title');
  const subtitle = document.getElementById('workspace-subtitle');
  const headerActions = document.getElementById('workspace-header-actions');
  if (!panel || !state.user) return;

  try {
    const role = state.user.role;

    // PATIENT DASHBOARD
    if (role === 'patient') {
      if (state.currentTab === 'overview') {
        title.innerText = `Hello, ${state.user.name}`;
        subtitle.innerText = "Welcome to your health dashboard. Manage your bookings below.";
        headerActions.innerHTML = `
          <button onclick="app.openBookingModal()" class="btn btn-primary">
            <i data-lucide="plus"></i> Book Appointment
          </button>
        `;

        const appts = await apiFetch('/api/appointments');
        state.appointments = appts;

        const nextAppt = appts.find(a => a.status === 'approved' || a.status === 'pending');

        panel.innerHTML = `
          <div class="stats-cards">
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Appointments</span>
                <span class="stat-value">${appts.length}</span>
              </div>
              <div class="stat-card-icon blue">
                <i data-lucide="calendar"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Approved Bookings</span>
                <span class="stat-value">${appts.filter(a => a.status === 'approved').length}</span>
              </div>
              <div class="stat-card-icon green">
                <i data-lucide="check-circle-2"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Pending Bookings</span>
                <span class="stat-value">${appts.filter(a => a.status === 'pending').length}</span>
              </div>
              <div class="stat-card-icon orange">
                <i data-lucide="clock-3"></i>
              </div>
            </div>
          </div>

          <div class="card slide-up">
            <h2 style="font-size: 20px; margin-bottom: 24px;">Next Scheduled Session</h2>
            ${nextAppt ? `
              <div style="display: flex; justify-content: space-between; align-items: center; background: var(--primary-soft); padding: 20px; border-radius: var(--radius-md); border: 1px dashed rgba(37, 99, 235, 0.3);">
                <div>
                  <h4 style="font-size: 18px; margin-bottom: 4px;">${nextAppt.doctorName}</h4>
                  <p style="font-size: 14px; color: var(--text-muted);">Reason: ${nextAppt.reason}</p>
                </div>
                <div style="text-align: right;">
                  <span class="status-pill ${nextAppt.status}" style="margin-bottom: 8px;">${nextAppt.status.toUpperCase()}</span>
                  <p style="font-size: 14px; font-weight: 600;">${nextAppt.date} @ ${nextAppt.time}</p>
                </div>
              </div>
            ` : `
              <p style="color: var(--text-muted); font-size: 15px;">No active appointments scheduled. <a href="#" onclick="app.openBookingModal(); return false;" style="color: var(--primary); font-weight: 600;">Book an appointment</a>.</p>
            `}
          </div>
        `;
      }

      else if (state.currentTab === 'book') {
        title.innerText = "Schedule Appointment";
        subtitle.innerText = "Filter doctors by clinical specialty and select date and time.";
        headerActions.innerHTML = '';

        const docs = await apiFetch('/api/doctors');
        state.doctors = docs;

        const specialties = [...new Set(docs.map(d => d.specialty || 'General Practice'))];
        const specButtons = ['All', ...specialties].map(spec => `
          <button onclick="app.setSpecialtyFilter('${spec === 'All' ? '' : spec}')" 
                  class="btn ${((spec === 'All' && !state.specialtyFilter) || state.specialtyFilter === spec) ? 'btn-primary' : 'btn-outline'}" 
                  style="padding: 6px 14px; font-size: 12px;">
            ${spec}
          </button>
        `).join('');

        const filteredDocs = state.specialtyFilter
          ? docs.filter(d => d.specialty === state.specialtyFilter)
          : docs;

        const docsGridHtml = filteredDocs.map(doc => `
          <div onclick="app.selectDoctor('${doc.id || doc._id}', '${doc.name}')" 
               class="card doctor-card ${state.bookingSelectedDoctor?.id === (doc.id || doc._id) ? 'selected' : ''}">
            <div class="doctor-avatar-circle">
              <i data-lucide="stethoscope"></i>
            </div>
            <div class="doctor-info-wrap">
              <h3>${doc.name}</h3>
              <p>${doc.specialty || 'General Practice'}</p>
              <p style="font-size: 12px; margin-top: 6px; color: var(--primary);">
                <i data-lucide="check" style="width: 12px; display: inline; vertical-align: middle;"></i> Available Today
              </p>
            </div>
          </div>
        `).join('');

        panel.innerHTML = `
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 16px; margin-bottom: 12px; color: var(--text-muted);">Specialty Filters</h3>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${specButtons}
            </div>
          </div>

          <h3 style="font-size: 18px; margin-bottom: 16px;">1. Select Clinical Specialist</h3>
          <div class="doctor-selection-grid">
            ${docsGridHtml || '<p style="grid-column: 1/-1; color: var(--text-muted);">No specialist doctors found matching filter.</p>'}
          </div>

          ${state.bookingSelectedDoctor ? `
            <div class="card slide-up" style="max-width: 600px;">
              <h3 style="font-size: 18px; margin-bottom: 20px;">2. Booking Details for ${state.bookingSelectedDoctor.name}</h3>
              <form onsubmit="app.handleBookAppointment(event)">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                  <div class="form-group">
                    <label>Appointment Date</label>
                    <input type="date" id="book-date" class="input-control" style="padding-left: 14px;" required min="${new Date().toISOString().split('T')[0]}">
                  </div>
                  <div class="form-group">
                    <label>Time Slot</label>
                    <input type="time" id="book-time" class="input-control" style="padding-left: 14px;" required>
                  </div>
                </div>
                <div class="form-group" style="margin-bottom: 24px;">
                  <label>Reason for Visit</label>
                  <textarea id="book-reason" class="input-control" placeholder="Describe symptoms or reasons..." style="padding-left: 14px; min-height: 80px;" required></textarea>
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; height: 46px;">
                  Confirm & Book Appointment
                </button>
              </form>
            </div>
          ` : ''}
        `;
      }

      else if (state.currentTab === 'appointments') {
        title.innerText = "Booking History";
        subtitle.innerText = "Overview of all active, past and pending clinic schedules.";

        headerActions.innerHTML = `
          <div class="input-wrapper" style="width: 260px;">
            <i data-lucide="search" style="font-size: 16px;"></i>
            <input type="text" oninput="app.searchAppointments(event)" class="input-control" placeholder="Search appointments..." style="padding-top: 8px; padding-bottom: 8px;">
          </div>
        `;

        const appts = await apiFetch('/api/appointments');
        state.appointments = appts;

        const rows = appts.map(appt => `
          <tr>
            <td style="font-weight:600;">${appt.doctorName}</td>
            <td>${appt.date}</td>
            <td>${appt.time}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${appt.reason}</td>
            <td><span class="status-pill ${appt.status}">${appt.status.toUpperCase()}</span></td>
            <td>
              ${appt.status === 'pending' ? `
                <button onclick="app.handleUpdateStatus('${appt.id || appt._id}', 'cancelled')" class="btn btn-outline btn-icon" style="color:var(--danger); border-color:rgba(239, 68, 68, 0.2);" title="Cancel Booking">
                  <i data-lucide="x-circle" style="width: 16px; height: 16px;"></i>
                </button>
              ` : '-'}
            </td>
          </tr>
        `).join('');

        panel.innerHTML = `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No appointment records found.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    // DOCTOR DASHBOARD
    else if (role === 'doctor') {
      if (state.currentTab === 'overview') {
        title.innerText = "Medical Portal";
        subtitle.innerText = "Check your schedules, consult histories and confirm pending appointments.";
        headerActions.innerHTML = '';

        const appts = await apiFetch('/api/appointments');
        state.appointments = appts;

        const todayStr = new Date().toISOString().split('T')[0];
        const todayAppts = appts.filter(a => a.date === todayStr);

        panel.innerHTML = `
          <div class="stats-cards">
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Consults</span>
                <span class="stat-value">${appts.length}</span>
              </div>
              <div class="stat-card-icon blue">
                <i data-lucide="stethoscope"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Today's Appointments</span>
                <span class="stat-value">${todayAppts.length}</span>
              </div>
              <div class="stat-card-icon green">
                <i data-lucide="calendar"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Pending Actions</span>
                <span class="stat-value">${appts.filter(a => a.status === 'pending').length}</span>
              </div>
              <div class="stat-card-icon orange">
                <i data-lucide="clock"></i>
              </div>
            </div>
          </div>

          <div class="card slide-up">
            <h2 style="font-size: 20px; margin-bottom: 24px;">Today's Schedule (${todayStr})</h2>
            ${todayAppts.length > 0 ? `
              <div class="table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Time</th>
                      <th>Reason</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${todayAppts.map(a => `
                      <tr>
                        <td style="font-weight:600;">${a.patientName}</td>
                        <td>${a.time}</td>
                        <td>${a.reason}</td>
                        <td><span class="status-pill ${a.status}">${a.status.toUpperCase()}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <p style="color: var(--text-muted); font-size: 15px;">No appointments scheduled for today.</p>
            `}
          </div>
        `;
      }

      else if (state.currentTab === 'appointments') {
        title.innerText = "Patient Schedule Manager";
        subtitle.innerText = "Review all bookings, approve, decline or complete consultations.";
        headerActions.innerHTML = '';

        const appts = await apiFetch('/api/appointments');
        state.appointments = appts;

        const rows = appts.map(appt => `
          <tr>
            <td style="font-weight:600;">${appt.patientName}</td>
            <td>${appt.date}</td>
            <td>${appt.time}</td>
            <td>${appt.reason}</td>
            <td><span class="status-pill ${appt.status}">${appt.status.toUpperCase()}</span></td>
            <td>
              <div style="display: flex; gap: 8px;">
                ${appt.status === 'pending' ? `
                  <button onclick="app.handleUpdateStatus('${appt.id || appt._id}', 'approved')" class="btn btn-outline btn-icon" style="color:var(--success); border-color:rgba(16, 185, 129, 0.2);" title="Approve">
                    <i data-lucide="check" style="width: 16px; height: 16px;"></i>
                  </button>
                  <button onclick="app.handleUpdateStatus('${appt.id || appt._id}', 'cancelled')" class="btn btn-outline btn-icon" style="color:var(--danger); border-color:rgba(239, 68, 68, 0.2);" title="Decline">
                    <i data-lucide="x" style="width: 16px; height: 16px;"></i>
                  </button>
                ` : ''}
                ${appt.status === 'approved' ? `
                  <button onclick="app.handleUpdateStatus('${appt.id || appt._id}', 'completed')" class="btn btn-primary btn-icon" title="Mark Completed">
                    <i data-lucide="check-square" style="width: 16px; height: 16px;"></i>
                  </button>
                ` : ''}
                ${appt.status === 'completed' || appt.status === 'cancelled' ? '-' : ''}
              </div>
            </td>
          </tr>
        `).join('');

        panel.innerHTML = `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Action controls</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No patient bookings assigned.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    // RECEPTIONIST DASHBOARD
    else if (role === 'receptionist') {
      if (state.currentTab === 'overview') {
        title.innerText = "Clinic Reception desk";
        subtitle.innerText = "Monitor active patient check-ins and oversee daily doctor queues.";
        headerActions.innerHTML = `
          <button onclick="app.switchTab('book-global')" class="btn btn-primary">
            <i data-lucide="plus"></i> Reception Booking
          </button>
        `;

        const appts = await apiFetch('/api/appointments');
        state.appointments = appts;

        panel.innerHTML = `
          <div class="stats-cards">
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Consultations</span>
                <span class="stat-value">${appts.length}</span>
              </div>
              <div class="stat-card-icon blue">
                <i data-lucide="list"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Pending Verification</span>
                <span class="stat-value">${appts.filter(a => a.status === 'pending').length}</span>
              </div>
              <div class="stat-card-icon orange">
                <i data-lucide="clock"></i>
              </div>
            </div>
          </div>

          <div class="card slide-up">
            <h2 style="font-size: 20px; margin-bottom: 24px;">Global Appointment Ledger</h2>
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>Date / Time</th>
                    <th>Reason</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${appts.map(a => `
                    <tr>
                      <td style="font-weight:600;">${a.patientName}</td>
                      <td>${a.doctorName}</td>
                      <td>${a.date} @ ${a.time}</td>
                      <td>${a.reason}</td>
                      <td><span class="status-pill ${a.status}">${a.status.toUpperCase()}</span></td>
                    </tr>
                  `).join('') || '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No records.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      else if (state.currentTab === 'book-global') {
        title.innerText = "Reception Booking Workspace";
        subtitle.innerText = "Access the patient registration and scheduling overlay.";
        headerActions.innerHTML = '';

        panel.innerHTML = `
          <div class="card slide-up" style="max-width: 600px; padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 24px; margin: 0 auto;">
            <div class="stat-card-icon blue" style="width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--primary-soft); color: var(--primary);">
              <i data-lucide="calendar-plus" style="width: 32px; height: 32px;"></i>
            </div>
            <div>
              <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">Create Reception Booking</h2>
              <p style="color: var(--text-muted); max-width: 400px; margin: 0 auto; font-size: 15px; line-height: 1.5;">
                Register walk-in patients, select practitioner credentials, and configure consultation dates using the premium scheduler.
              </p>
            </div>
            <button onclick="app.openReceptionBookingModal()" class="btn btn-primary" style="padding: 12px 28px; font-size: 15px;">
              <i data-lucide="plus"></i> Open Scheduler Modal
            </button>
          </div>
        `;
        
        // Auto-trigger modal
        setTimeout(() => {
          app.openReceptionBookingModal();
        }, 100);

        lucide.createIcons();
      }

      else if (state.currentTab === 'appointments') {
        title.innerText = "Schedule Approval Panel";
        subtitle.innerText = "Approve pending walk-ins and coordinate rescheduling constraints.";
        headerActions.innerHTML = '';

        const appts = await apiFetch('/api/appointments');
        state.appointments = appts;

        const rows = appts.map(appt => `
          <tr>
            <td style="font-weight:600;">${appt.patientName}</td>
            <td>${appt.doctorName}</td>
            <td>${appt.date} @ ${appt.time}</td>
            <td>${appt.reason}</td>
            <td><span class="status-pill ${appt.status}">${appt.status.toUpperCase()}</span></td>
            <td>
              <div style="display: flex; gap: 8px;">
                ${appt.status === 'pending' ? `
                  <button onclick="app.handleUpdateStatus('${appt.id || appt._id}', 'approved')" class="btn btn-outline btn-icon" style="color:var(--success); border-color:rgba(16, 185, 129, 0.2);" title="Approve">
                    <i data-lucide="check" style="width: 16px; height: 16px;"></i>
                  </button>
                  <button onclick="app.handleUpdateStatus('${appt.id || appt._id}', 'cancelled')" class="btn btn-outline btn-icon" style="color:var(--danger); border-color:rgba(239, 68, 68, 0.2);" title="Cancel">
                    <i data-lucide="x" style="width: 16px; height: 16px;"></i>
                  </button>
                ` : '-'}
              </div>
            </td>
          </tr>
        `).join('');

        panel.innerHTML = `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date/Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No records found.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    // ADMINISTRATOR DASHBOARD
    else if (role === 'admin') {
      if (state.currentTab === 'overview') {
        title.innerText = "System Administration Panel";
        subtitle.innerText = "Manage clinical registers, view telemetry and check database configurations.";
        headerActions.innerHTML = '';

        const stats = await apiFetch('/api/admin/stats');

        panel.innerHTML = `
          <div class="stats-cards">
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Patients</span>
                <span class="stat-value">${stats.totalPatients}</span>
              </div>
              <div class="stat-card-icon blue">
                <i data-lucide="users"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Doctors</span>
                <span class="stat-value">${stats.totalDoctors}</span>
              </div>
              <div class="stat-card-icon green">
                <i data-lucide="stethoscope"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Appointments</span>
                <span class="stat-value">${stats.totalAppointments}</span>
              </div>
              <div class="stat-card-icon orange">
                <i data-lucide="calendar"></i>
              </div>
            </div>
          </div>

          <div class="card slide-up">
            <h3 style="font-size: 18px; margin-bottom: 16px;">Telemetry & Connectivity</h3>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                <span style="font-weight:600;">Active Database Engine</span>
                <span style="color:var(--primary); font-weight:700;">${stats.dbMode} Mode</span>
              </div>
              <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                <span style="font-weight:600;">Backend Server Connection</span>
                <span style="color:var(--success); font-weight:700;">Operational</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="font-weight:600;">Pending Schedules Ledger</span>
                <span>${stats.pendingAppointments} records</span>
              </div>
            </div>
          </div>
        `;
      }

      else if (state.currentTab === 'staff') {
        title.innerText = "User Account Management";
        subtitle.innerText = "Seed and manage authorization access roles for Doctors and Receptionist staff.";
        headerActions.innerHTML = '';

        const usersList = await apiFetch('/api/admin/users');

        const rows = usersList.map(u => `
          <tr>
            <td style="font-weight:600;">${u.name}</td>
            <td>${u.email}</td>
            <td><span class="status-pill approved" style="text-transform:uppercase;">${u.role}</span></td>
            <td>${u.specialty || '-'}</td>
          </tr>
        `).join('');

        panel.innerHTML = `
          <div style="display:grid; grid-template-columns: 1fr 1.5fr; gap:32px; align-items: flex-start;">
            <div class="card">
              <h3 style="font-size: 18px; margin-bottom: 20px;">Create Staff Account</h3>
              <form onsubmit="app.handleCreateStaff(event)">
                <div class="form-group">
                  <label>Full Name</label>
                  <input type="text" id="staff-name" class="input-control" placeholder="Dr. Mark Miller" style="padding-left:14px;" required>
                </div>
                <div class="form-group">
                  <label>Email Address</label>
                  <input type="email" id="staff-email" class="input-control" placeholder="miller@healthcare.com" style="padding-left:14px;" required>
                </div>
                <div class="form-group">
                  <label>Initial Password</label>
                  <input type="password" id="staff-password" class="input-control" placeholder="••••••••" style="padding-left:14px;" required>
                </div>
                <div class="form-group">
                  <label>Role</label>
                  <select id="staff-role" class="input-control" style="padding-left:14px;" required onchange="const s = document.getElementById('spec-group'); this.value === 'doctor' ? s.style.display='' : s.style.display='none'">
                    <option value="doctor">Doctor</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div class="form-group" id="spec-group">
                  <label>Clinical Specialty (Doctor only)</label>
                  <input type="text" id="staff-specialty" class="input-control" placeholder="e.g. Cardiology, Neurology" style="padding-left:14px;">
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; height:46px; margin-top: 10px;">
                  Register Staff
                </button>
              </form>
            </div>

            <div class="card" style="padding: 24px;">
              <h3 style="font-size: 18px; margin-bottom: 20px;">Active System Users</h3>
              <div class="table-wrapper" style="margin-top:0;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Specialty</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      }
    }

    lucide.createIcons();

  } catch (error) {
    showToast(error.message, 'error');
    panel.innerHTML = `
      <div class="card" style="border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); text-align: center; padding: 48px;">
        <i data-lucide="alert-circle" style="color:var(--danger); width: 48px; height: 48px; margin-bottom: 16px;"></i>
        <h3 style="font-size: 20px; color: var(--danger); margin-bottom: 8px;">Workspace Loading Failed</h3>
        <p style="color: var(--text-muted); font-size: 15px; margin-bottom: 20px;">${error.message}</p>
        <button onclick="loadDashboardData()" class="btn btn-secondary">
          <i data-lucide="refresh-cw"></i> Retry Connection
        </button>
      </div>
    `;
    lucide.createIcons();
  }
}

// Initial Bootstrapper call
window.addEventListener('DOMContentLoaded', checkAuth);
