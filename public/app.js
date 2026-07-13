// AuraHealth - Premium Smart Healthcare Single Page Application Client Logic

// Global State
const state = {
  user: null,
  token: localStorage.getItem('token') || null,
  appointments: [],
  doctors: [],
  adminUsers: [],
  invoices: [],
  prescriptionMeds: [],
  prescribingAppointmentId: null,
  payingInvoiceId: null,
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

// Helper: Determine if a medication course is still active based on prescribing date and duration
function getMedicationStatus(appointmentDate, duration) {
  try {
    const apptDate = new Date(appointmentDate);
    const today = new Date();
    const diffTime = Math.abs(today - apptDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let durationDays = 7; // default
    if (duration) {
      const match = duration.match(/(\d+)/);
      if (match) {
        const val = parseInt(match[1]);
        if (duration.toLowerCase().includes('month')) {
          durationDays = val * 30;
        } else if (duration.toLowerCase().includes('week')) {
          durationDays = val * 7;
        } else {
          durationDays = val;
        }
      }
    }
    
    return diffDays <= durationDays ? 'Active' : 'Completed';
  } catch (e) {
    return 'Completed';
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

function handleLogout() {
  if (state.notificationsInterval) {
    clearInterval(state.notificationsInterval);
    state.notificationsInterval = null;
  }
  state.token = null;
  state.user = null;
  state.lastNotificationIds = undefined;
  localStorage.removeItem('token');
  showToast('Logged out successfully', 'info');
  navigate('landing');
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

  handleLogout,

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
  selectDoctor: async (docId, docName) => {
    state.bookingSelectedDoctor = { id: docId, name: docName };
    state.doctorSlots = [];
    state.selectedBookingSlot = null;
    render();
    try {
      const slots = await apiFetch(`/api/doctors/${docId}/availability`);
      state.doctorSlots = slots.filter(s => !s.isBooked);
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  selectBookingSlot: (slotId) => {
    const slot = state.doctorSlots.find(s => String(s.id || s._id) === String(slotId));
    state.selectedBookingSlot = slot;
    render();
  },

  // Patient Booking Submission
  handleBookAppointment: async (e) => {
    e.preventDefault();
    if (!state.bookingSelectedDoctor) {
      return showToast('Please select a doctor', 'error');
    }
    if (!state.selectedBookingSlot) {
      return showToast('Please select an available time slot', 'error');
    }

    const reason = document.getElementById('book-reason').value;
    if (!reason) {
      return showToast('Please enter the reason for your visit', 'error');
    }

    try {
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: state.bookingSelectedDoctor.id,
          doctorName: state.bookingSelectedDoctor.name,
          date: state.selectedBookingSlot.date,
          time: state.selectedBookingSlot.time,
          reason
        })
      });

      showToast('Appointment booked successfully! Pending approval.', 'success');
      state.selectedBookingSlot = null;
      state.bookingSelectedDoctor = null;
      state.doctorSlots = [];
      state.currentTab = 'appointments';
      loadDashboardData();
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

  toggleUserStatus: async (userId, currentStatus) => {
    try {
      const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      showToast(`User account status updated to ${nextStatus}.`, 'success');
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  deleteUser: async (userId) => {
    if (!confirm('Are you absolutely sure you want to permanently remove this user account? This action cannot be undone.')) {
      return;
    }
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      });
      showToast('User account successfully removed.', 'success');
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  toggleDoctorApproval: async (doctorId, currentApproval) => {
    try {
      const nextApproval = !currentApproval;
      await apiFetch(`/api/admin/users/${doctorId}`, {
        method: 'PUT',
        body: JSON.stringify({ isApproved: nextApproval })
      });
      showToast(`Doctor approval status set to ${nextApproval ? 'APPROVED' : 'PENDING'}.`, 'success');
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  updateDoctorSettings: async (doctorId) => {
    try {
      const fees = parseFloat(document.getElementById(`doc-fees-${doctorId}`).value) || 0;
      const workingHours = document.getElementById(`doc-hours-${doctorId}`).value;
      const specialty = document.getElementById(`doc-spec-${doctorId}`).value;

      await apiFetch(`/api/admin/users/${doctorId}`, {
        method: 'PUT',
        body: JSON.stringify({ fees, workingHours, specialty })
      });
      showToast('Doctor credentials and availability settings saved successfully.', 'success');
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  verifyReport: async (apptId, reportId) => {
    try {
      await apiFetch(`/api/appointments/${apptId}/reports/${reportId}/verify`, {
        method: 'PUT'
      });
      showToast('Clinical report verified successfully.', 'success');
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  deleteReport: async (apptId, reportId) => {
    if (!confirm('Are you sure you want to delete this clinical document?')) return;
    try {
      await apiFetch(`/api/appointments/${apptId}/reports/${reportId}`, {
        method: 'DELETE'
      });
      showToast('Clinical report deleted successfully.', 'success');
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  uploadReportSimulate: async (apptId) => {
    const name = document.getElementById(`sim-report-name-${apptId}`).value;
    const fileContent = document.getElementById(`sim-report-desc-${apptId}`).value;
    if (!name || !fileContent) {
      showToast('Please specify document title and description', 'warning');
      return;
    }
    try {
      await apiFetch(`/api/appointments/${apptId}/reports`, {
        method: 'POST',
        body: JSON.stringify({ name, fileContent })
      });
      showToast('Clinical report uploaded successfully.', 'success');
      render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  exportCSV: (reportType) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (reportType === 'appointments') {
      csvContent += "Appointment ID,Patient Name,Doctor Name,Date,Time,Status,Reason\n";
      (state.appointments || []).forEach(a => {
        csvContent += `"${a.id || a._id}","${a.patientName}","${a.doctorName}","${a.date}","${a.time}","${a.status}","${a.reason || ''}"\n`;
      });
    } else if (reportType === 'revenue') {
      csvContent += "Invoice ID,Patient Name,Doctor,Fees,Medicine Total,GST Amount,Grand Total,Status\n";
      (state.invoices || []).forEach(i => {
        csvContent += `"${i.id || i._id}","${i.patientName}","${i.doctorName || ''}",${i.consultationFee || 0},${i.medicinesTotal || 0},${i.gstAmount || 0},${i.amount},"${i.status}"\n`;
      });
    } else {
      csvContent += "User ID,Name,Email,Role,Specialty,Status\n";
      (state.usersList || []).forEach(u => {
        csvContent += `"${u.id || u._id}","${u.name}","${u.email}","${u.role}","${u.specialty || ''}","${u.status || 'active'}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aurahealth_${reportType}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report CSV file downloaded successfully.', 'success');
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

  selectDoctorInModal: async (docId) => {
    const doc = state.doctors.find(d => (d.id || d._id) === docId);
    if (!doc) return;

    state.bookingSelectedDoctor = doc;
    state.modalDoctorSlots = [];
    state.selectedModalSlot = null;

    // Show loading scheduling screen in modal
    const overlay = document.getElementById('booking-modal-overlay');
    if (overlay) {
      const body = overlay.querySelector('#modal-body-container');
      body.innerHTML = `
        <div style="text-align: center; padding: 48px;">
          <p style="color: var(--text-muted);">Loading doctor's availability slots...</p>
        </div>
      `;
    }

    try {
      const slots = await apiFetch(`/api/doctors/${docId}/availability`);
      state.modalDoctorSlots = slots.filter(s => !s.isBooked);
      app.renderModalScheduling();
    } catch (err) {
      showToast(err.message, 'error');
    }
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
        <span class="doc-header-specialty">${doc.specialty || 'General Practice'} • AuraHealth Staff</span>
      </div>
      <i data-lucide="x" class="modal-close-icon" onclick="app.closeBookingModal()"></i>
    `;

    const slots = state.modalDoctorSlots || [];

    const slotPillsHtml = slots.length === 0 
      ? `<div style="padding: 24px; text-align: center; border: 1px dashed var(--border-color); border-radius: 8px; color: var(--text-muted); font-size: 14px; grid-column: 1/-1;">
          No available time slots found for this doctor.
         </div>`
      : slots.map(slot => {
          const isSelected = state.selectedModalSlot && String(state.selectedModalSlot.id || state.selectedModalSlot._id) === String(slot.id || slot._id);
          return `
            <button onclick="app.selectModalSlot('${slot.id || slot._id}')" 
                    class="slot-pill-btn ${isSelected ? 'selected' : ''}"
                    style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: auto; padding: 12px; gap: 4px; border-radius: 12px; border: 2px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}; background: ${isSelected ? 'var(--primary-soft)' : 'rgba(255, 255, 255, 0.4)'}; cursor: pointer; transition: all 0.2s;">
              <strong style="font-size: 12px; display: block; color: var(--text-main);">${slot.date}</strong>
              <span style="font-size: 13px; font-weight: 700; color: var(--primary);">${slot.time}</span>
            </button>
          `;
        }).join('');

    const body = overlay.querySelector('#modal-body-container');
    body.innerHTML = `
      <div>
        <span class="modal-section-title">
          <i data-lucide="clock" style="width:16px; height:16px;"></i> Available Doctor Slots
        </span>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; max-height: 220px; overflow-y: auto; padding: 4px; margin-bottom: 20px;">
          ${slotPillsHtml}
        </div>
      </div>

      <div style="margin-top: 16px;">
        <span class="modal-section-title">
          <i data-lucide="file-text" style="width:16px; height:16px;"></i> Reason for Visit
        </span>
        <input type="text" id="modal-booking-reason" class="input-control" placeholder="e.g. Annual physical, skin rash check" style="height: 44px; border-radius: 8px; font-size: 14px; padding-left: 12px;" required>
      </div>

      <div style="margin-top: 24px;">
        <button class="btn btn-primary" onclick="app.handleConfirmBooking()" style="width: 100%; padding: 14px; font-weight: 600; font-size: 15px; border-radius: var(--radius-md);">
          Confirm Booking
        </button>
      </div>
    `;

    lucide.createIcons();
  },

  selectModalSlot: (slotId) => {
    const slot = state.modalDoctorSlots.find(s => String(s.id || s._id) === String(slotId));
    state.selectedModalSlot = slot;
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
      <div style="display: flex; flex-direction: column; gap: 24px; padding-top: 8px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label>Patient Full Name</label>
          <div class="input-wrapper">
            <i data-lucide="user"></i>
            <input type="text" id="modal-rep-name" class="input-control" placeholder="" required value="${state.receptionPatientName || ''}" oninput="state.receptionPatientName = this.value">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label>Mobile Number</label>
          <div class="input-wrapper">
            <i data-lucide="phone"></i>
            <input type="tel" id="modal-rep-phone" class="input-control" placeholder="" required value="${state.receptionPatientPhone || ''}" oninput="state.receptionPatientPhone = this.value">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label>Email Address</label>
          <div class="input-wrapper">
            <i data-lucide="mail"></i>
            <input type="email" id="modal-rep-email" class="input-control" placeholder="" required value="${state.receptionPatientEmail || ''}" oninput="state.receptionPatientEmail = this.value">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label>Reason for Visit</label>
          <div class="input-wrapper">
            <i data-lucide="file-text"></i>
            <input type="text" id="modal-rep-reason" class="input-control" placeholder="" required value="${state.receptionReason || ''}" oninput="state.receptionReason = this.value">
          </div>
        </div>
        
        <button class="btn btn-primary" onclick="app.nextToDoctorSelection()" style="width: 100%; margin-top: 4px;">
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
    if (!state.bookingSelectedDoctor) {
      return showToast('Please select a practitioner', 'error');
    }
    if (!state.selectedModalSlot) {
      return showToast('Please select an available doctor time slot', 'error');
    }

    const reasonInput = document.getElementById('modal-booking-reason');
    const reason = reasonInput ? reasonInput.value.trim() : '';
    if (!reason) {
      return showToast('Please enter the reason for your visit', 'error');
    }

    try {
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: state.bookingSelectedDoctor.id || state.bookingSelectedDoctor._id,
          doctorName: state.bookingSelectedDoctor.name,
          date: state.selectedModalSlot.date,
          time: state.selectedModalSlot.time,
          reason
        })
      });

      showToast('Appointment booked successfully! Pending approval.', 'success');
      state.selectedModalSlot = null;
      state.bookingSelectedDoctor = null;
      app.closeBookingModal();
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  loadNotifications: async () => {
    try {
      const notifs = await apiFetch('/api/notifications');
      
      const prevIds = state.lastNotificationIds;
      const currentIds = notifs.map(n => n.id || n._id);
      state.lastNotificationIds = currentIds;

      const badge = document.getElementById('notification-badge');
      const unread = notifs.some(n => !n.read);
      if (badge) {
        badge.style.display = unread ? 'block' : 'none';
      }
      
      const list = document.getElementById('notifications-list');
      if (list) {
        if (notifs.length === 0) {
          list.innerHTML = `<p style="color: var(--text-muted); font-size:13px; text-align:center; padding:16px 0; margin: 0;">No notifications found.</p>`;
        } else {
          list.innerHTML = notifs.map(n => {
            let icon = 'info';
            let color = 'var(--text-muted)';
            if (n.type === 'success') { icon = 'check-circle'; color = 'var(--success)'; }
            else if (n.type === 'warning') { icon = 'alert-triangle'; color = 'var(--danger)'; }
            else if (n.type === 'reminder') { icon = 'bell-ring'; color = 'var(--primary)'; }
            
            return `
              <div style="display:flex; gap:10px; padding:8px; border-radius:8px; background:${n.read ? 'transparent' : 'var(--primary-soft)'}; border: 1px solid ${n.read ? 'transparent' : 'rgba(var(--primary-rgb), 0.1)'}; transition: background 0.2s;">
                <div style="color:${color}; display:flex; align-items:center; justify-content:center; padding-top:2px;">
                  <i data-lucide="${icon}" style="width:16px; height:16px;"></i>
                </div>
                <div style="flex:1;">
                  <p style="font-size:12px; margin:0; font-weight:${n.read ? '400' : '600'}; color:var(--text-main); line-height:1.4;">${n.message}</p>
                  <span style="font-size:10px; color:var(--text-muted); margin-top:4px; display:block;">${new Date(n.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            `;
          }).join('');
          lucide.createIcons();
        }
      }

      if (prevIds !== undefined) {
        const newUnread = notifs.filter(n => !n.read && !prevIds.includes(n.id || n._id));
        if (newUnread.length > 0) {
          app.playChimeSound();
          app.speakText(newUnread[0].message);
        }
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  },

  playChimeSound: () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const playChime = (time, freq) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(0.15, time + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
        osc.start(time);
        osc.stop(time + 0.4);
      };
      const now = audioCtx.currentTime;
      playChime(now, 523.25);
      playChime(now + 0.12, 659.25);
    } catch (err) {
      console.log('Web Audio chime sound blocked or unsupported');
    }
  },

  speakText: (text) => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        utterance.volume = 0.8;
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => 
          (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('Microsoft')) && 
          v.lang.startsWith('en')
        );
        if (preferredVoice) utterance.voice = preferredVoice;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.log('Text-to-speech blocked or unsupported');
    }
  },

  toggleNotificationsDropdown: () => {
    const dropdown = document.getElementById('notifications-dropdown');
    if (!dropdown) return;
    const isShowing = dropdown.style.display === 'block';
    dropdown.style.display = isShowing ? 'none' : 'block';
    if (!isShowing) {
      app.loadNotifications();
    }
  },

  markNotificationsRead: async () => {
    try {
      await apiFetch('/api/notifications/read', { method: 'POST' });
      if (state.notifications) {
        state.notifications.forEach(n => n.read = true);
      }
      const badge = document.getElementById('notification-badge');
      if (badge) badge.style.display = 'none';
      app.loadNotifications();
    } catch (err) {
      console.error('Error marking notifications read:', err);
    }
  },

  renderChatbotTab: () => {
    const panel = document.getElementById('dashboard-workspace-panel');
    if (!panel) return;

    if (!state.chatbotMessages) {
      state.chatbotMessages = [
        {
          sender: 'bot',
          text: `Hello! I am **AuraBot**, your virtual healthcare assistant. 🩺<br><br>Please describe the symptoms you are experiencing (e.g. *chest pain*, *skin rash*, *neurological issues*, or *child pediatric concerns*). I will analyze your symptoms and suggest available appointments with our specialist practitioners.`,
          timestamp: new Date()
        }
      ];
    }

    const messagesHtml = state.chatbotMessages.map((msg, index) => {
      const isBot = msg.sender === 'bot';
      const initials = isBot ? 'AB' : state.user.name.charAt(0).toUpperCase();
      return `
        <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-direction: ${isBot ? 'row' : 'row-reverse'}; align-items: flex-start;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: ${isBot ? 'var(--primary)' : 'var(--primary-soft)'}; color: ${isBot ? 'white' : 'var(--primary)'}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0;">
            ${initials}
          </div>
          <div style="max-width: 70%;">
            <div class="card" style="padding: 12px 16px; border-radius: ${isBot ? '0 16px 16px 16px' : '16px 0 16px 16px'}; background: ${isBot ? 'white' : 'var(--primary-soft)'}; border: 1px solid var(--border-color); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); display: inline-block;">
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: var(--text-main); text-align: left;">${msg.text}</p>
              ${msg.options ? `
                <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                  ${msg.options.map(opt => `
                    <button onclick="app.handleChatbotOptionClick(${index}, '${opt.slotId}')" class="btn btn-outline" style="font-size: 13px; padding: 8px 12px; text-align: left; display: block; width: 100%;">
                      <i data-lucide="calendar" style="width: 14px; height: 14px; display: inline; vertical-align: middle; margin-right: 6px;"></i>
                      ${opt.label}
                    </button>
                  `).join('')}
                </div>
              ` : ''}
              ${msg.confirmAction ? `
                <div style="margin-top: 12px; display: flex; gap: 8px;">
                  <button onclick="app.handleChatbotConfirm(${index})" class="btn btn-primary" style="font-size: 13px; padding: 6px 12px;">Confirm Booking</button>
                  <button onclick="app.handleChatbotCancel(${index})" class="btn btn-outline" style="font-size: 13px; padding: 6px 12px;">Cancel</button>
                </div>
              ` : ''}
            </div>
            <span style="font-size: 10px; color: var(--text-muted); margin-top: 4px; display: block; text-align: ${isBot ? 'left' : 'right'}">
              ${msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="card" style="padding: 0; display: flex; flex-direction: column; height: calc(100vh - 240px); min-height: 480px; overflow: hidden; border-radius: var(--radius-lg); background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(20px); border: 1px solid var(--border-color);">
        <!-- Chat header -->
        <div style="padding: 16px 24px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 12px; background: rgba(255, 255, 255, 0.8);">
          <div style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e;"></div>
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--text-main);">AuraBot Chat</h3>
            <p style="margin: 0; font-size: 11px; color: var(--text-muted);">Always Active Clinical AI</p>
          </div>
        </div>
        
        <!-- Messages Area -->
        <div id="chatbot-messages-container" style="flex: 1; padding: 24px; overflow-y: auto; display: flex; flex-direction: column;">
          ${messagesHtml}
        </div>
        
        <!-- Input Area -->
        <div style="padding: 16px 24px; border-top: 1px solid var(--border-color); background: rgba(255, 255, 255, 0.8);">
          <form onsubmit="app.handleChatbotSubmit(event)" style="display: flex; gap: 12px;">
            <input type="text" id="chatbot-input-field" class="input-control" placeholder="Describe symptoms or reply..." style="flex: 1; height: 44px; font-size: 14px; border-radius: 22px; padding: 0 20px;" required autocomplete="off">
            <button type="submit" class="btn btn-primary" style="width: 44px; height: 44px; padding: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i data-lucide="send" style="width: 18px; height: 18px;"></i>
            </button>
          </form>
        </div>
      </div>
    `;

    lucide.createIcons();
    
    // Auto-scroll to bottom of chat
    const container = document.getElementById('chatbot-messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  },

  handleChatbotSubmit: async (e) => {
    e.preventDefault();
    const input = document.getElementById('chatbot-input-field');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';

    // Append patient message
    state.chatbotMessages.push({
      sender: 'patient',
      text,
      timestamp: new Date()
    });
    app.renderChatbotTab();

    // Show AI typing message
    const botMsgIndex = state.chatbotMessages.length;
    state.chatbotMessages.push({
      sender: 'bot',
      text: '<span class="skeleton-line" style="display:inline-block; width:80px; margin:0;"></span>',
      timestamp: new Date()
    });
    app.renderChatbotTab();

    try {
      const response = await apiFetch('/api/chatbot', {
        method: 'POST',
        body: JSON.stringify({ message: text })
      });

      // Update typing message with real reply
      state.chatbotMessages[botMsgIndex] = {
        sender: 'bot',
        text: response.reply,
        options: response.options,
        confirmAction: response.confirmAction,
        timestamp: new Date()
      };
    } catch (err) {
      state.chatbotMessages[botMsgIndex] = {
        sender: 'bot',
        text: `Error analyzing request: ${err.message}`,
        timestamp: new Date()
      };
    }
    app.renderChatbotTab();
  },

  handleChatbotOptionClick: async (index, slotId) => {
    state.chatbotMessages.push({
      sender: 'patient',
      text: `Requesting slot selection`,
      timestamp: new Date()
    });
    
    const botMsgIndex = state.chatbotMessages.length;
    state.chatbotMessages.push({
      sender: 'bot',
      text: '<span class="skeleton-line" style="display:inline-block; width:80px; margin:0;"></span>',
      timestamp: new Date()
    });
    app.renderChatbotTab();

    try {
      const response = await apiFetch('/api/chatbot/select-slot', {
        method: 'POST',
        body: JSON.stringify({ slotId })
      });

      state.chatbotMessages[botMsgIndex] = {
        sender: 'bot',
        text: response.reply,
        confirmAction: response.confirmAction,
        timestamp: new Date()
      };
    } catch (err) {
      state.chatbotMessages[botMsgIndex] = {
        sender: 'bot',
        text: `Error selecting slot: ${err.message}`,
        timestamp: new Date()
      };
    }
    app.renderChatbotTab();
  },

  handleChatbotConfirm: async (index) => {
    const botMsgIndex = state.chatbotMessages.length;
    state.chatbotMessages.push({
      sender: 'bot',
      text: 'Processing your appointment booking...',
      timestamp: new Date()
    });
    app.renderChatbotTab();

    try {
      const response = await apiFetch('/api/chatbot/confirm', {
        method: 'POST'
      });

      state.chatbotMessages[botMsgIndex] = {
        sender: 'bot',
        text: response.reply,
        timestamp: new Date()
      };
      app.loadNotifications();
    } catch (err) {
      state.chatbotMessages[botMsgIndex] = {
        sender: 'bot',
        text: `Booking failed: ${err.message}`,
        timestamp: new Date()
      };
    }
    app.renderChatbotTab();
  },

  handleChatbotCancel: (index) => {
    state.chatbotMessages.push({
      sender: 'bot',
      text: 'Booking cancelled. You can describe new symptoms whenever you are ready.',
      timestamp: new Date()
    });
    app.renderChatbotTab();
  },

  // Clinical prescription writer modal
  openPrescriptionModal: (apptId, patientName) => {
    state.prescribingAppointmentId = apptId;
    
    // Find existing prescription details to pre-populate
    const appt = state.appointments.find(a => String(a.id || a._id) === String(apptId));
    const existingNotes = appt && appt.notes ? appt.notes : '';
    state.prescriptionMeds = appt && appt.prescription ? [...appt.prescription] : [];
    
    const existing = document.getElementById('prescription-modal-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'prescription-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '1000';
    
    overlay.innerHTML = `
      <div class="scheduling-modal-card" style="max-width: 550px;">
        <div class="modal-doctor-header">
          <div class="doc-avatar-box"><i data-lucide="file-heart" style="width:18px; height:18px;"></i></div>
          <div class="doc-header-info">
            <span class="doc-header-name">Clinical Encounter Record</span>
            <span class="doc-header-specialty">Patient: ${patientName}</span>
          </div>
          <i data-lucide="x" class="modal-close-icon" onclick="app.closePrescriptionModal()"></i>
        </div>
        <div class="modal-section-body" style="padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 6px; display: block;">Clinical Notes / Diagnosis</label>
            <textarea id="prescription-notes" class="input-control" placeholder="" style="padding-left: 14px; min-height: 100px; font-size: 14px; border-radius: var(--radius-md);">${existingNotes}</textarea>
          </div>

          <div>
            <span class="modal-section-title" style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <i data-lucide="pill" style="width:16px; height:16px;"></i> Prescribe Medications
            </span>
            
            <div style="background: var(--bg-main); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; display: block;">Medication Name</label>
                <input type="text" id="med-name" class="input-control" placeholder="" style="padding-left:12px; height: 38px; font-size: 13px; border-radius: 8px;">
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; display: block;">Dosage</label>
                  <input type="text" id="med-dosage" class="input-control" placeholder="" style="padding-left:12px; height: 38px; font-size: 13px; border-radius: 8px;">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; display: block;">Frequency</label>
                  <input type="text" id="med-freq" class="input-control" placeholder="" style="padding-left:12px; height: 38px; font-size: 13px; border-radius: 8px;">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; display: block;">Duration</label>
                  <input type="text" id="med-dur" class="input-control" placeholder="" style="padding-left:12px; height: 38px; font-size: 13px; border-radius: 8px;">
                </div>
              </div>
              <button type="button" class="btn btn-secondary" onclick="app.addPrescriptionMed()" style="padding: 8px; font-size: 12px; font-weight: 600; height: 34px; border-radius: 8px;">
                + Add to Prescription
              </button>
            </div>

            <div id="added-meds-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 120px; overflow-y: auto;">
              <!-- dynamic list -->
            </div>
          </div>

          <button class="btn btn-primary" onclick="app.submitClinicalRecord()" style="width: 100%; padding: 14px; font-weight: 600; font-size: 15px; border-radius: var(--radius-md); margin-top: 8px;">
            Save Record & Complete Appointment
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    app.renderPrescriptionMedsList();
    lucide.createIcons();
  },
  
  closePrescriptionModal: () => {
    const overlay = document.getElementById('prescription-modal-overlay');
    if (overlay) overlay.remove();
  },
  
  addPrescriptionMed: () => {
    const name = document.getElementById('med-name').value.trim();
    const dosage = document.getElementById('med-dosage').value.trim();
    const freq = document.getElementById('med-freq').value.trim();
    const dur = document.getElementById('med-dur').value.trim();
    
    if (!name || !dosage || !freq || !dur) {
      return showToast('Please fill all medication details', 'error');
    }
    
    state.prescriptionMeds.push({ medication: name, dosage, frequency: freq, duration: dur });
    
    document.getElementById('med-name').value = '';
    document.getElementById('med-dosage').value = '';
    document.getElementById('med-freq').value = '';
    document.getElementById('med-dur').value = '';
    
    app.renderPrescriptionMedsList();
  },
  
  renderPrescriptionMedsList: () => {
    const container = document.getElementById('added-meds-list');
    if (!container) return;
    
    if (state.prescriptionMeds.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; text-align: center; font-style: italic;">No medications prescribed yet.</p>`;
      return;
    }
    
    container.innerHTML = state.prescriptionMeds.map((med, index) => `
      <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
        <div style="font-size: 13px;">
          <strong style="color: var(--primary);">${med.medication}</strong> - ${med.dosage} (${med.frequency} for ${med.duration})
        </div>
        <i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--danger); cursor: pointer;" onclick="app.removePrescriptionMed(${index})"></i>
      </div>
    `).join('');
    
    lucide.createIcons();
  },
  
  removePrescriptionMed: (index) => {
    state.prescriptionMeds.splice(index, 1);
    app.renderPrescriptionMedsList();
  },
  
  submitClinicalRecord: async () => {
    const notes = document.getElementById('prescription-notes').value.trim();

    if (!notes) {
      return showToast('Please enter clinical notes / diagnosis details', 'error');
    }
    
    try {
      await apiFetch(`/api/appointments/${state.prescribingAppointmentId}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'completed',
          notes,
          prescription: state.prescriptionMeds
        })
      });
      
      showToast('Encounter notes and prescription saved successfully!', 'success');
      app.closePrescriptionModal();
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  // Record Vitals separate modal
  openVitalsModal: (apptId, patientName) => {
    state.vitalsAppointmentId = apptId;
    
    const appt = state.appointments.find(a => String(a.id || a._id) === String(apptId));
    
    const existing = document.getElementById('vitals-modal-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'vitals-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '1000';
    
    overlay.innerHTML = `
      <div class="scheduling-modal-card" style="max-width: 500px; padding: 0; overflow: hidden; display: flex; flex-direction: column;">
        <div class="modal-doctor-header">
          <div class="doc-avatar-box"><i data-lucide="activity" style="width:18px; height:18px;"></i></div>
          <div class="doc-header-info">
            <span class="doc-header-name">Record Patient Vitals</span>
            <span class="doc-header-specialty">Patient: ${patientName}</span>
          </div>
          <i data-lucide="x" class="modal-close-icon" onclick="app.closeVitalsModal()"></i>
        </div>
        <div class="modal-section-body" style="padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label>Heart Rate</label>
              <div class="input-wrapper">
                <i data-lucide="activity"></i>
                <input type="text" id="vital-heart-rate" class="input-control" placeholder="72 bpm" oninput="app.calculateHealthScore()" value="${appt && appt.heartRate ? appt.heartRate : ''}">
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label>Blood Pressure</label>
              <div class="input-wrapper">
                <i data-lucide="heart"></i>
                <input type="text" id="vital-blood-pressure" class="input-control" placeholder="120/80 mmHg" oninput="app.calculateHealthScore()" value="${appt && appt.bloodPressure ? appt.bloodPressure : ''}">
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label>Weight</label>
              <div class="input-wrapper">
                <i data-lucide="scale"></i>
                <input type="text" id="vital-weight" class="input-control" placeholder="65 kg" value="${appt && appt.weight ? appt.weight : ''}">
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label>Health Score</label>
              <div class="input-wrapper">
                <i data-lucide="award"></i>
                <input type="text" id="vital-health-score" class="input-control" placeholder="Auto-calculated" value="${appt && appt.healthScore ? appt.healthScore : ''}">
              </div>
            </div>
          </div>

          <button class="btn btn-primary" onclick="app.submitVitalsRecord()" style="width: 100%; height: 48px; font-weight: 600; font-size: 15px; border-radius: var(--radius-md); margin-top: 10px;">
            Save Vital Metrics
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    lucide.createIcons();
    // Calculate initial health score if data exists
    if (appt && (appt.heartRate || appt.bloodPressure)) {
      app.calculateHealthScore();
    }
  },
  
  closeVitalsModal: () => {
    const overlay = document.getElementById('vitals-modal-overlay');
    if (overlay) overlay.remove();
  },

  calculateHealthScore: () => {
    const hrInput = document.getElementById('vital-heart-rate');
    const bpInput = document.getElementById('vital-blood-pressure');
    const hsInput = document.getElementById('vital-health-score');
    if (!hrInput || !bpInput || !hsInput) return;

    const hrVal = hrInput.value.trim();
    const bpVal = bpInput.value.trim();

    let deductions = 0;
    let calculationsMade = false;

    // 1. Evaluate Heart Rate (bpm)
    if (hrVal) {
      const hr = parseInt(hrVal.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(hr)) {
        calculationsMade = true;
        if (hr < 45 || hr > 140) {
          deductions += 30; // Severe bradycardia/tachycardia
        } else if (hr < 50 || hr > 120) {
          deductions += 20; // Moderate bradycardia/tachycardia
        } else if (hr < 60 || hr > 100) {
          deductions += 10; // Mild bradycardia/tachycardia
        } else if (hr > 85) {
          deductions += 3;  // Slightly elevated normal
        } else if (hr < 55) {
          deductions += 3;  // Slightly low normal
        }
      }
    }

    // 2. Evaluate Blood Pressure (Systolic/Diastolic)
    if (bpVal) {
      const parts = bpVal.split('/');
      if (parts.length === 2) {
        const sys = parseInt(parts[0].replace(/[^0-9]/g, ''), 10);
        const dia = parseInt(parts[1].replace(/[^0-9]/g, ''), 10);
        if (!isNaN(sys) && !isNaN(dia)) {
          calculationsMade = true;
          
          let bpDeduction = 0;
          
          // Hypertensive Crisis
          if (sys >= 180 || dia >= 120) {
            bpDeduction = 35;
          }
          // Stage 2 Hypertension
          else if ((sys >= 140 && sys < 180) || (dia >= 90 && dia < 120)) {
            bpDeduction = 25;
          }
          // Stage 1 Hypertension
          else if ((sys >= 130 && sys < 140) || (dia >= 80 && dia < 90)) {
            bpDeduction = 15;
          }
          // Elevated
          else if (sys >= 120 && sys < 130 && dia < 80) {
            bpDeduction = 5;
          }
          // Hypotension (Low Blood Pressure)
          else if (sys < 90 || dia < 60) {
            bpDeduction = 15;
          }
          // Normal: Systolic < 120 and Diastolic < 80
          else {
            bpDeduction = 0;
          }
          
          deductions += bpDeduction;
        }
      }
    }

    // Bound the final score between 30 and 100
    const finalScore = Math.max(30, Math.min(100, 100 - deductions));

    if (calculationsMade) {
      hsInput.value = `${finalScore} / 100`;
    } else {
      hsInput.value = '';
    }
  },

  submitVitalsRecord: async () => {
    const heartRate = document.getElementById('vital-heart-rate').value.trim();
    const bloodPressure = document.getElementById('vital-blood-pressure').value.trim();
    const weight = document.getElementById('vital-weight').value.trim();
    const healthScore = document.getElementById('vital-health-score').value.trim();
    
    try {
      const appt = state.appointments && state.appointments.find(a => String(a.id || a._id) === String(state.vitalsAppointmentId));
      
      await apiFetch(`/api/appointments/${state.vitalsAppointmentId}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: (appt && appt.status === 'approved') ? 'completed' : (appt ? appt.status : 'completed'),
          notes: appt ? appt.notes : undefined,
          prescription: appt ? appt.prescription : undefined,
          heartRate,
          bloodPressure,
          weight,
          healthScore
        })
      });
      
      showToast('Patient vitals saved successfully!', 'success');
      app.closeVitalsModal();
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  // Checkout payment modal
  openPaymentModal: (invoiceId, amount, docName) => {
    state.payingInvoiceId = invoiceId;
    
    const existing = document.getElementById('payment-modal-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'payment-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '1000';
    
    overlay.innerHTML = `
      <div class="scheduling-modal-card" style="max-width: 460px; padding: 0; overflow: hidden;">
        <div style="background: linear-gradient(135deg, var(--primary), #4f46e5); color: #ffffff; padding: 24px; text-align: center; position: relative;">
          <h2 style="font-family:'Outfit', sans-serif; font-size: 20px; font-weight: 700; margin-bottom: 4px;">AuraHealth Payment Checkout</h2>
          <p style="font-size: 13px; opacity: 0.85;">Secure 256-bit encrypted checkout gateway</p>
          <i data-lucide="x" style="position: absolute; top: 20px; right: 20px; cursor: pointer; color: #ffffff;" onclick="app.closePaymentModal()"></i>
        </div>

        <div style="padding: 28px; display: flex; flex-direction: column; gap: 20px;">
          <div style="background: var(--bg-main); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-size: 11px; color: var(--text-muted); display: block; font-weight: 600; text-transform: uppercase;">Service Fee</span>
              <span style="font-size: 14px; font-weight: 700; color: var(--text-main);">${docName} consultation</span>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 22px; font-family:'Outfit', sans-serif; font-weight: 800; color: var(--primary);">$${amount}.00</span>
            </div>
          </div>

          <div class="credit-card-preview">
            <div class="card-chip"></div>
            <div class="card-number-display">•••• •••• •••• ••••</div>
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: auto;">
              <div>
                <div class="card-label">CARD HOLDER</div>
                <div class="card-holder-display">YOUR NAME</div>
              </div>
              <div style="text-align: right;">
                <div class="card-label">EXPIRES</div>
                <div class="card-expiry-display">MM/YY</div>
              </div>
            </div>
          </div>

          <form onsubmit="app.handlePayInvoiceSubmit(event)" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 12px; font-weight: 600; margin-bottom: 6px; display: block;">Cardholder Name</label>
              <input type="text" id="pay-name" class="input-control" placeholder="e.g. John Doe" style="padding-left:14px; height: 42px; font-size: 14px;" required 
                     oninput="document.querySelector('.card-holder-display').innerText = this.value.toUpperCase() || 'YOUR NAME'">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 12px; font-weight: 600; margin-bottom: 6px; display: block;">Card Number</label>
              <input type="text" id="pay-card" class="input-control" placeholder="4000 1234 5678 9010" style="padding-left:14px; height: 42px; font-size: 14px;" required maxlength="19"
                     oninput="this.value = this.value.replace(/[^0-9]/g, '').replace(/(.{4})/g, '$1 ').trim(); document.querySelector('.card-number-display').innerText = this.value || '•••• •••• •••• ••••'">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 12px; font-weight: 600; margin-bottom: 6px; display: block;">Expiration Date</label>
                <input type="text" id="pay-expiry" class="input-control" placeholder="MM/YY" style="padding-left:14px; height: 42px; font-size: 14px;" required maxlength="5"
                       oninput="this.value = this.value.replace(/[^0-9]/g, '').replace(/(.{2})/g, '$1/').replace(/\\/$/, '').trim(); document.querySelector('.card-expiry-display').innerText = this.value || 'MM/YY'">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 12px; font-weight: 600; margin-bottom: 6px; display: block;">CVC</label>
                <input type="password" id="pay-cvc" class="input-control" placeholder="•••" style="padding-left:14px; height: 42px; font-size: 14px;" required maxlength="3" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
              </div>
            </div>
            
            <button type="submit" id="pay-submit-btn" class="btn btn-primary" style="width: 100%; padding: 14px; font-weight: 600; font-size: 15px; border-radius: var(--radius-md); margin-top: 10px; height: 46px;">
              Complete $${amount}.00 Payment
            </button>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    lucide.createIcons();
  },
  
  closePaymentModal: () => {
    const overlay = document.getElementById('payment-modal-overlay');
    if (overlay) overlay.remove();
  },
  
  handlePayInvoiceSubmit: async (e) => {
    e.preventDefault();
    const btn = document.getElementById('pay-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="spin" style="width:16px; height:16px; animation: spin 1s infinite linear;"></i> Verifying Card Details...`;
      lucide.createIcons();
    }
    
    setTimeout(async () => {
      try {
        await apiFetch(`/api/invoices/${state.payingInvoiceId}/pay`, {
          method: 'POST'
        });
        
        const card = document.querySelector('.scheduling-modal-card');
        if (card) {
          card.innerHTML = `
            <div style="padding: 48px 32px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 20px;">
              <div style="width: 72px; height: 72px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 32px;">
                <i data-lucide="check-circle" style="width: 42px; height: 42px;"></i>
              </div>
              <div>
                <h2 style="font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">Payment Successful!</h2>
                <p style="color: var(--text-muted); font-size: 14px; max-width: 320px; margin: 0 auto; line-height: 1.5;">Your transaction was processed successfully. A PDF receipt has been sent to your registered email address.</p>
              </div>
              <button onclick="app.closePaymentModal(); render();" class="btn btn-primary" style="padding: 10px 24px; margin-top: 8px;">
                Return to Billing
              </button>
            </div>
          `;
          lucide.createIcons();
        }
        
        showToast('Payment successful!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerText = `Complete Payment`;
        }
      }
    }, 1500);
  },

  // Collect payment at receptionist desk (Cash / UPI)
  collectReceptionPayment: async (invoiceId, paymentMethod) => {
    try {
      await apiFetch(`/api/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod })
      });
      showToast(`Payment via ${paymentMethod} recorded successfully!`, 'success');
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  // Open invoice creation modal
  openCreateInvoiceModal: async () => {
    try {
      const patients = await apiFetch('/api/patients');
      state.invoiceMedicines = []; // temporary medicines for this invoice
      
      const existing = document.getElementById('create-invoice-modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'create-invoice-modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.style.zIndex = '1000';

      const patientOptions = patients.map(p => `<option value="${p.id || p._id}">${p.name}</option>`).join('');

      overlay.innerHTML = `
        <div class="scheduling-modal-card" style="max-width: 680px; padding: 0; overflow: hidden; display: flex; flex-direction: column;">
          <div class="modal-doctor-header">
            <div class="doc-avatar-box"><i data-lucide="receipt" style="width:18px; height:18px;"></i></div>
            <div class="doc-header-info">
              <span class="doc-header-name">Issue Custom Bill Invoice</span>
              <span class="doc-header-specialty">Create a professional hospital bill receipt</span>
            </div>
            <i data-lucide="x" class="modal-close-icon" onclick="app.closeCreateInvoiceModal()"></i>
          </div>

          <div style="padding: 24px; display: flex; flex-direction: column; gap: 20px; max-height: 80vh; overflow-y: auto;">
            <!-- Step 1: Patient & Doctor Selection -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <div class="form-group" style="margin-bottom:0;">
                <label>Select Patient</label>
                <div class="input-wrapper">
                  <i data-lucide="user"></i>
                  <select id="invoice-patient-select" class="input-control">
                    ${patientOptions || '<option value="">No patients registered</option>'}
                  </select>
                </div>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label>Select Doctor / Consultation</label>
                <div class="input-wrapper">
                  <i data-lucide="stethoscope"></i>
                  <select id="invoice-doctor-select" class="input-control" onchange="app.updateInvoiceCalculations()">
                    <option value="Dr. Sarah Smith|1200">Dr. Sarah Smith (Cardiology) - ₹1,200</option>
                    <option value="Dr. Robert Jones|800">Dr. Robert Jones (Pediatrics) - ₹800</option>
                    <option value="Dr. Emily Davis|1500">Dr. Emily Davis (Neurology) - ₹1,500</option>
                    <option value="Dr. James Wilson|1000">Dr. James Wilson (Dermatology) - ₹1,000</option>
                    <option value="General Practice Specialist|500" selected>General Practice Specialist - ₹500</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Step 2: Medicine Presets Row -->
            <div style="border: 1px solid var(--border-color); padding: 12px 16px; border-radius: var(--radius-md); background: #ffffff; box-shadow: var(--shadow-sm);">
              <h4 style="font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 700; margin-bottom: 8px; color: var(--text-main);">Add Prescribed Medicines</h4>
              <div style="display: grid; grid-template-columns: 2fr 1fr auto; gap: 12px; align-items: flex-end;">
                <div class="form-group" style="margin-bottom:0;">
                  <label style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Medicine Name</label>
                  <div class="input-wrapper">
                    <i data-lucide="pill"></i>
                    <select id="invoice-med-select" class="input-control">
                      <option value="Paracetamol 650mg|30">Paracetamol 650mg (strip) - ₹30</option>
                      <option value="Amoxicillin 500mg|120">Amoxicillin 500mg (strip) - ₹120</option>
                      <option value="Cetirizine 10mg|45">Cetirizine 10mg (strip) - ₹45</option>
                      <option value="Atorvastatin 10mg|150">Atorvastatin 10mg (strip) - ₹150</option>
                      <option value="Metformin 500mg|60">Metformin 500mg (strip) - ₹60</option>
                      <option value="Pantoprazole 40mg|90">Pantoprazole 40mg (strip) - ₹90</option>
                      <option value="Cough Syrup (100ml)|85">Cough Syrup (100ml bottle) - ₹85</option>
                      <option value="Multivitamin Capsules|110">Multivitamin Capsules (strip) - ₹110</option>
                    </select>
                  </div>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Quantity</label>
                  <div class="input-wrapper">
                    <i data-lucide="hash"></i>
                    <input type="number" id="invoice-med-qty" class="input-control" min="1" value="1" placeholder="Qty">
                  </div>
                </div>
                <button onclick="app.addInvoiceMedicineRow()" class="btn btn-secondary" style="height: 48px; padding: 0 16px; border-radius: var(--radius-md); display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                  <i data-lucide="plus" style="width: 14px; height: 14px;"></i> Add
                </button>
              </div>

              <!-- List of added medicines -->
              <div id="invoice-added-meds-list" style="display: flex; flex-direction: column; gap: 8px;">
                <!-- Dynamically filled -->
              </div>
            </div>

            <!-- Step 3: Payment Status Details -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center; border-top: 1px solid var(--border-color); padding-top: 20px;">
              <div class="form-group" style="margin-bottom:0;">
                <label>Payment Status</label>
                <div class="input-wrapper">
                  <i data-lucide="credit-card"></i>
                  <select id="invoice-status-select" class="input-control" onchange="app.toggleInvoiceMethodSelect(this.value)">
                    <option value="unpaid">Unpaid / Outstanding Dues</option>
                    <option value="paid">Paid Invoice</option>
                  </select>
                </div>
              </div>
              <div class="form-group" id="invoice-method-group" style="margin-bottom:0; display:none;">
                <label>Payment Method</label>
                <div class="input-wrapper">
                  <i data-lucide="wallet"></i>
                  <select id="invoice-method-select" class="input-control">
                    <option value="Cash">Cash Counter Payment</option>
                    <option value="UPI">UPI Transaction (GPay/PhonePe)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Calculations Box -->
            <div style="background: rgba(255, 255, 255, 0.4); border: 1px solid var(--border-color); padding: 18px; border-radius: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: var(--text-muted);">
              <div style="display: flex; justify-content: space-between;">
                <span>Consultation Charge:</span>
                <span style="font-weight: 600; color: var(--text-main);" id="calc-consultation">₹0</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Medicines Subtotal:</span>
                <span style="font-weight: 600; color: var(--text-main);" id="calc-medicines">₹0</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>GST (18%):</span>
                <span style="font-weight: 600; color: var(--text-main);" id="calc-gst">₹0</span>
              </div>
              <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 12px; font-size: 16px; color: var(--text-main);">
                <strong>Grand Total:</strong>
                <strong style="color: var(--primary);" id="calc-grand-total">₹0</strong>
              </div>
            </div>

            <button onclick="app.submitCreateInvoice()" class="btn btn-primary" style="width: 100%; height: 50px; font-weight: 600; font-size: 15px; border-radius: var(--radius-md); margin-top: 6px;">
              Generate & Record Bill Receipt
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      lucide.createIcons();
      app.updateInvoiceCalculations();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  closeCreateInvoiceModal: () => {
    const overlay = document.getElementById('create-invoice-modal-overlay');
    if (overlay) overlay.remove();
  },

  toggleInvoiceMethodSelect: (status) => {
    const group = document.getElementById('invoice-method-group');
    if (group) {
      group.style.display = status === 'paid' ? 'block' : 'none';
    }
  },

  addInvoiceMedicineRow: () => {
    const medSelect = document.getElementById('invoice-med-select');
    const qtyInput = document.getElementById('invoice-med-qty');
    if (!medSelect || !qtyInput) return;

    const [medName, medPrice] = medSelect.value.split('|');
    const qty = parseInt(qtyInput.value, 10) || 1;
    const price = parseInt(medPrice, 10);

    state.invoiceMedicines.push({
      medication: medName,
      unitPrice: price,
      quantity: qty,
      totalPrice: price * qty
    });

    qtyInput.value = 1;
    app.renderInvoiceMedicineList();
    app.updateInvoiceCalculations();
  },

  removeInvoiceMedicineRow: (idx) => {
    state.invoiceMedicines.splice(idx, 1);
    app.renderInvoiceMedicineList();
    app.updateInvoiceCalculations();
  },

  renderInvoiceMedicineList: () => {
    const container = document.getElementById('invoice-added-meds-list');
    if (!container) return;

    if (state.invoiceMedicines.length === 0) {
      container.innerHTML = '';
      container.style.marginTop = '0px';
      return;
    }

    container.style.marginTop = '12px';
    container.innerHTML = state.invoiceMedicines.map((m, idx) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid var(--border-color); padding: 8px 12px; border-radius: 6px; font-size:12px;">
        <div>
          <strong style="color:var(--text-main);">${m.medication}</strong> 
          <span style="color:var(--text-muted);">x${m.quantity} (@ ₹${m.unitPrice})</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <strong style="color:var(--text-main);">₹${m.totalPrice}</strong>
          <i data-lucide="trash-2" style="width:14px; height:14px; color:var(--danger); cursor:pointer;" onclick="app.removeInvoiceMedicineRow(${idx})"></i>
        </div>
      </div>
    `).join('');
    lucide.createIcons();
  },

  updateInvoiceCalculations: () => {
    const docSelect = document.getElementById('invoice-doctor-select');
    if (!docSelect) return;

    const [_, docPrice] = docSelect.value.split('|');
    const consultFee = parseInt(docPrice, 10) || 0;

    const medsFee = state.invoiceMedicines.reduce((sum, m) => sum + m.totalPrice, 0);
    const subtotal = consultFee + medsFee;
    const gst = Math.round(subtotal * 0.18);
    const total = subtotal + gst;

    document.getElementById('calc-consultation').innerText = `₹${consultFee}`;
    document.getElementById('calc-medicines').innerText = `₹${medsFee}`;
    document.getElementById('calc-gst').innerText = `₹${gst}`;
    document.getElementById('calc-grand-total').innerText = `₹${total}`;
  },

  submitCreateInvoice: async () => {
    const patientSelect = document.getElementById('invoice-patient-select');
    const docSelect = document.getElementById('invoice-doctor-select');
    const statusSelect = document.getElementById('invoice-status-select');
    const methodSelect = document.getElementById('invoice-method-select');

    if (!patientSelect || !docSelect || !statusSelect) return;

    const patientId = patientSelect.value;
    const patientName = patientSelect.options[patientSelect.selectedIndex].text.split(' (')[0];
    const [doctorName, docPrice] = docSelect.value.split('|');
    const consultFee = parseInt(docPrice, 10) || 0;

    const status = statusSelect.value;
    const paymentMethod = status === 'paid' ? methodSelect.value : '';

    const medsFee = state.invoiceMedicines.reduce((sum, m) => sum + m.totalPrice, 0);
    const subtotal = consultFee + medsFee;
    const gst = Math.round(subtotal * 0.18);
    const amount = subtotal + gst;

    try {
      await apiFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          patientName,
          doctorName,
          consultationFee: consultFee,
          medicines: state.invoiceMedicines,
          subtotal,
          gstAmount: gst,
          amount,
          status,
          paymentMethod
        })
      });

      showToast('Invoice generated successfully!', 'success');
      app.closeCreateInvoiceModal();
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  openInvoiceReceiptModal: async (invoiceId) => {
    try {
      const invoices = await apiFetch('/api/invoices');
      const inv = invoices.find(i => String(i.id || i._id) === String(invoiceId));
      if (!inv) return showToast('Invoice not found', 'error');

      const existing = document.getElementById('receipt-modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'receipt-modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.style.zIndex = '1100';

      const formattedDate = new Date(inv.createdAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      let medRows = '';
      if (inv.medicines && inv.medicines.length > 0) {
        medRows = inv.medicines.map((m, idx) => `
          <tr style="border-bottom: 1px dashed #e2e8f0;">
            <td style="padding: 10px 0;">${idx + 2}. ${m.medication}</td>
            <td style="padding: 10px 0; text-align: right;">₹${m.unitPrice}</td>
            <td style="padding: 10px 0; text-align: center;">${m.quantity}</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 600;">₹${m.totalPrice}</td>
          </tr>
        `).join('');
      }

      overlay.innerHTML = `
        <div class="invoice-print-card" style="max-width: 600px; padding: 0; display:flex; flex-direction:column;">
          <!-- Receipt Controls Header -->
          <div class="no-print" style="background: #f1f5f9; padding: 12px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; font-size: 13px; color: #475569;">Invoice Receipt View</span>
            <div style="display: flex; gap: 8px;">
              <button onclick="window.print()" class="btn btn-primary" style="padding: 6px 14px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                <i data-lucide="printer" style="width:12px; height:12px;"></i> Print Receipt
              </button>
              <button onclick="document.getElementById('receipt-modal-overlay').remove()" class="btn btn-outline" style="padding: 6px 14px; font-size: 12px;">
                Close
              </button>
            </div>
          </div>

          <!-- Printable Area -->
          <div id="invoice-print-area" style="padding: 40px; background: #ffffff;">
            <!-- Hospital Brand Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 24px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; color: #2563eb; font-weight: 800; font-size: 24px; margin-bottom: 6px;">
                  <i data-lucide="shield-check" style="width:28px; height:28px; fill:#2563eb; color:#fff;"></i>
                  <span style="font-family:'Outfit', sans-serif;">AuraHealth Hospital</span>
                </div>
                <p style="font-size: 11px; color: #64748b; margin: 0; line-height: 1.4;">
                  123 Health Parkway, Medical Plaza, Bangalore - 560001<br>
                  Email: billing@aurahealth.com | Helpline: +91 80 5550 1928<br>
                  <strong>GSTIN: 29AABCA1234A1Z5</strong>
                </p>
              </div>
              <div style="text-align: right;">
                <h2 style="font-family:'Outfit', sans-serif; font-size: 20px; font-weight: 800; color: #1e293b; margin: 0 0 6px;">TAX INVOICE</h2>
                <span class="status-pill ${inv.status}" style="font-weight: 700; font-size: 11px; padding: 4px 10px; border:none; display: inline-block;">
                  ${inv.status.toUpperCase()}
                </span>
              </div>
            </div>

            <!-- Meta details (Patient / Date) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; font-size: 13px; color: #475569; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div>
                <span style="color:#64748b; font-size:11px; display:block; text-transform:uppercase; font-weight:600; margin-bottom:4px;">Patient Details</span>
                <strong style="color:#1e293b; font-size: 15px;">${inv.patientName}</strong>
                <span style="display:block; margin-top:2px;">ID: ${inv.patientId}</span>
              </div>
              <div style="text-align: right;">
                <span style="color:#64748b; font-size:11px; display:block; text-transform:uppercase; font-weight:600; margin-bottom:4px;">Invoice Metadata</span>
                <strong>Inv #:</strong> AH-${inv.id || inv._id || 'N/A'}<br>
                <strong>Date:</strong> ${formattedDate}<br>
                <strong>Payment Mode:</strong> ${inv.paymentMethod || 'Online Checkout'}
              </div>
            </div>

            <!-- Invoice Items Table -->
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569; margin-bottom: 24px;">
              <thead>
                <tr style="border-bottom: 2px solid #cbd5e1; text-align: left; font-weight: 700; color: #1e293b;">
                  <th style="padding: 10px 0;">Item Description</th>
                  <th style="padding: 10px 0; text-align: right;">Unit Cost</th>
                  <th style="padding: 10px 0; text-align: center;">Qty</th>
                  <th style="padding: 10px 0; text-align: right;">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 12px 0;">1. Doctor Consultation Fee (${inv.doctorName})</td>
                  <td style="padding: 12px 0; text-align: right;">₹${inv.consultationFee || inv.subtotal || inv.amount}</td>
                  <td style="padding: 12px 0; text-align: center;">1</td>
                  <td style="padding: 12px 0; text-align: right; font-weight: 600;">₹${inv.consultationFee || inv.subtotal || inv.amount}</td>
                </tr>
                ${medRows}
              </tbody>
            </table>

            <!-- Summary Calculations -->
            <div style="display: flex; justify-content: flex-end; font-size: 13px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              <div style="width: 240px; display:flex; flex-direction:column; gap:8px;">
                <div style="display: flex; justify-content: space-between;">
                  <span>Subtotal:</span>
                  <span style="font-weight: 600;">₹${inv.subtotal || inv.amount}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span>GST (18%):</span>
                  <span style="font-weight: 600;">₹${inv.gstAmount || 0}</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 2px solid #3b82f6; padding-top: 10px; font-size: 16px; color: #1e293b;">
                  <strong>Grand Total:</strong>
                  <strong style="color: #2563eb;">₹${inv.amount}</strong>
                </div>
              </div>
            </div>

            <!-- Invoice Footer -->
            <div style="margin-top: 40px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p>Thank you for choosing AuraHealth Multispecialty Hospital. Get well soon!</p>
              <p style="font-style: italic; color: #94a3b8; margin-top:4px;">This is a computer-generated invoice and requires no physical signature.</p>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      lucide.createIcons();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  toggleAvailabilityTime: (time) => {
    if (!Array.isArray(state.selectedAvailabilityTimes)) {
      state.selectedAvailabilityTimes = [];
    }

    const exists = state.selectedAvailabilityTimes.includes(time);
    if (exists) {
      state.selectedAvailabilityTimes = state.selectedAvailabilityTimes.filter(t => t !== time);
    } else {
      state.selectedAvailabilityTimes.push(time);
    }

    const button = document.getElementById(`pill-${time.replace(':', '-').replace(' ', '-')}`) || document.getElementById(`pill-custom-${time.replace(':', '-').replace(' ', '-')}`);
    if (button) {
      button.classList.toggle('selected', !exists);
    }
  },

  addCustomTime: () => {
    const customTimeInput = document.getElementById('custom-time-input');
    if (!customTimeInput || !customTimeInput.value) return showToast('Please select a custom time', 'error');
    
    const time = customTimeInput.value;
    if (!Array.isArray(state.selectedAvailabilityTimes)) {
      state.selectedAvailabilityTimes = [];
    }
    
    if (!state.selectedAvailabilityTimes.includes(time)) {
      state.selectedAvailabilityTimes.push(time);
      showToast(`Custom time ${time} selected`, 'success');
      
      const customPillsContainer = document.getElementById('custom-time-pills');
      if (customPillsContainer) {
        const id = `pill-custom-${time.replace(':', '-').replace(' ', '-')}`;
        if (!document.getElementById(id)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.id = id;
          btn.className = 'time-select-pill selected';
          btn.innerText = time;
          btn.onclick = () => app.toggleAvailabilityTime(time);
          customPillsContainer.appendChild(btn);
        }
      }
    } else {
      showToast('This time is already selected', 'info');
    }
  },


  addDoctorSlot: async () => {
    const dateInput = document.getElementById('slot-date');
    if (!dateInput) return;

    const date = dateInput.value.trim();
    const selectedTimes = Array.isArray(state.selectedAvailabilityTimes) ? state.selectedAvailabilityTimes : [];

    if (!date) {
      return showToast('Please select a date', 'error');
    }
    if (selectedTimes.length === 0) {
      return showToast('Please select at least one time slot', 'error');
    }

    try {
      for (const time of selectedTimes) {
        await apiFetch('/api/doctor/availability', {
          method: 'POST',
          body: JSON.stringify({ date, time })
        });
      }
      showToast(`Published ${selectedTimes.length} availability slot${selectedTimes.length > 1 ? 's' : ''} successfully!`, 'success');
      state.selectedAvailabilityTimes = [];
      document.querySelectorAll('.time-select-pill.selected').forEach(btn => btn.classList.remove('selected'));
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  deleteDoctorSlot: async (slotId) => {
    if (!confirm('Are you sure you want to delete this availability slot?')) return;
    try {
      await apiFetch(`/api/doctor/availability/${slotId}`, {
        method: 'DELETE'
      });
      showToast('Slot deleted successfully', 'success');
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
      { id: 'chatbot', label: 'AI AuraBot', icon: 'bot' },
      { id: 'appointments', label: 'Booking History', icon: 'clock' },
      { id: 'medical-records', label: 'Medical History', icon: 'folder-heart' },
      { id: 'billing', label: 'Billing & Invoices', icon: 'credit-card' }
    ];
  } else if (user.role === 'doctor') {
    menuItems = [
      { id: 'overview', label: 'Dashboard', icon: 'grid' },
      { id: 'appointments', label: 'Patient Schedule', icon: 'calendar-check' },
      { id: 'availability', label: 'Manage Slots', icon: 'clock' }
    ];
  } else if (user.role === 'receptionist') {
    menuItems = [
      { id: 'overview', label: 'Global Schedule', icon: 'list-todo' },
      { id: 'appointments', label: 'Manage Requests', icon: 'check-square' },
      { id: 'billing', label: 'Billing Counter', icon: 'credit-card' }
    ];
  } else if (user.role === 'admin') {
    menuItems = [
      { id: 'overview', label: 'Admin Dashboard', icon: 'layout-dashboard' },
      { id: 'users', label: 'User Control', icon: 'users-2' },
      { id: 'doctors', label: 'Doctor Control', icon: 'stethoscope' },
      { id: 'records', label: 'Medical Records', icon: 'folder-heart' },
      { id: 'analytics', label: 'Visual Analytics', icon: 'bar-chart-3' },
      { id: 'reports', label: 'System Reports', icon: 'clipboard-list' }
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
          <div class="dashboard-actions" style="display:flex; align-items:center; gap:16px;">
            <div id="workspace-header-actions" style="display:flex; gap:8px;">
              <!-- Dynamic elements loaded here -->
            </div>
            
            <!-- Notification Bell -->
            <div class="notification-bell-container" style="position: relative;">
              <button onclick="app.toggleNotificationsDropdown()" class="btn btn-outline btn-icon" style="position: relative; border-radius: 50%; width: 40px; height: 40px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); border: 1px solid var(--border-color); cursor:pointer;">
                <i data-lucide="bell" style="width: 18px; height: 18px;"></i>
                <span id="notification-badge" style="display: none; position: absolute; top: 0; right: 0; width: 10px; height: 10px; background: var(--danger); border-radius: 50%; border: 2px solid white;"></span>
              </button>
              
              <!-- Dropdown Panel -->
              <div id="notifications-dropdown" class="card slide-up" style="display: none; position: absolute; top: 48px; right: 0; width: 320px; max-height: 400px; overflow-y: auto; z-index: 1000; box-shadow: 0 10px 25px rgba(0,0,0,0.1); padding: 16px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px); border-radius: var(--radius-lg);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                  <span style="font-weight: 700; font-size: 14px;">Notifications</span>
                  <button onclick="app.markNotificationsRead()" class="btn-text" style="font-size: 12px; color: var(--primary); font-weight:600; background:none; border:none; cursor:pointer;">Mark all read</button>
                </div>
                <div id="notifications-list" style="display: flex; flex-direction: column; gap: 8px;">
                  <!-- Loaded dynamically -->
                </div>
              </div>
            </div>
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

  app.loadNotifications();

  if (!state.notificationsInterval) {
    state.notificationsInterval = setInterval(() => {
      if (state.token && state.currentPath === 'dashboard') {
        app.loadNotifications();
      } else {
        clearInterval(state.notificationsInterval);
        state.notificationsInterval = null;
      }
    }, 10000);
  }

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

        // Extract and format all medications prescribed to the patient
        const completedAppts = appts.filter(a => a.status === 'completed');
        const allMeds = [];
        completedAppts.forEach(a => {
          if (a.prescription && a.prescription.length > 0) {
            a.prescription.forEach(m => {
              allMeds.push({
                medication: m.medication,
                dosage: m.dosage,
                frequency: m.frequency,
                duration: m.duration,
                doctorName: a.doctorName,
                date: a.date,
                status: getMedicationStatus(a.date, m.duration)
              });
            });
          }
        });

        // Sort: Active medications first, then sorted chronologically
        allMeds.sort((a, b) => {
          if (a.status === 'Active' && b.status !== 'Active') return -1;
          if (a.status !== 'Active' && b.status === 'Active') return 1;
          return b.date.localeCompare(a.date);
        });

        const medsListHtml = allMeds.length > 0
          ? allMeds.map(m => `
              <div class="card" style="display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; margin-bottom: 12px; transition: transform 0.2s ease, box-shadow 0.2s ease; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-card);" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                <div style="display: flex; align-items: center; gap: 16px;">
                  <div style="width: 48px; height: 48px; border-radius: 24px; background: #e6fcf5; color: #0ca678; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i data-lucide="pill" style="width: 22px; height: 22px;"></i>
                  </div>
                  <div>
                    <h4 style="font-size: 16px; color: var(--text-main); font-weight: 700; margin: 0;">${m.medication} ${m.dosage}</h4>
                    <p style="font-size: 14px; color: var(--text-muted); margin: 2px 0 4px;">${m.frequency}</p>
                    <p style="font-size: 12px; color: var(--text-muted); opacity: 0.85; margin: 0;">${m.doctorName} • Duration: ${m.duration}</p>
                  </div>
                </div>
                <div>
                  <span class="status-pill" style="background: ${m.status === 'Active' ? '#e6fcf5' : '#e8f7ff'}; color: ${m.status === 'Active' ? '#0ca678' : '#0077b6'}; border: none; font-weight: 700; font-size: 12px; padding: 6px 12px;">
                    ${m.status}
                  </span>
                </div>
              </div>
            `).join('')
          : `<p style="color: var(--text-muted); font-size: 15px; font-style: italic;">No active or past prescriptions found.</p>`;

        const completedWithVitals = completedAppts.filter(a => a.heartRate || a.bloodPressure || a.weight || a.healthScore);
        completedWithVitals.sort((a, b) => {
          const parseDateTime = (dateStr, timeStr) => {
            try {
              if (!dateStr) return 0;
              const cleanTime = (timeStr || '00:00').trim();
              const match = cleanTime.match(/^(\d+):(\d+)\s*(AM|PM)?$/i);
              let hours = 0;
              let minutes = 0;
              if (match) {
                hours = parseInt(match[1], 10);
                minutes = parseInt(match[2], 10);
                const ampm = match[3];
                if (ampm) {
                  if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
                  if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
                }
              } else {
                const parts = cleanTime.split(':');
                hours = parseInt(parts[0], 10) || 0;
                minutes = parseInt(parts[1], 10) || 0;
              }
              const d = new Date(dateStr);
              d.setHours(hours, minutes, 0, 0);
              return d.getTime();
            } catch (err) {
              return 0;
            }
          };
          return parseDateTime(b.date, b.time) - parseDateTime(a.date, a.time);
        });
        const latestVitals = completedWithVitals[0] || null;

        let vitalsBannerHtml = '';
        if (latestVitals) {
          vitalsBannerHtml = `
            <div class="card slide-up" style="display: flex; align-items: center; padding: 20px 24px; margin-bottom: 24px; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-card); gap: 24px; overflow-x: auto;">
              <div style="width: 52px; height: 52px; border-radius: 26px; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i data-lucide="heart" style="width: 24px; height: 24px; fill: #0284c7;"></i>
              </div>
              <div style="display: flex; align-items: center; width: 100%; justify-content: space-between; min-width: 500px;">
                <div style="flex: 1; padding-right: 16px;">
                  <span style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 4px;">Heart rate</span>
                  <strong style="font-size: 20px; color: var(--text-main); font-weight: 700;">${latestVitals.heartRate || '—'}</strong>
                </div>
                <div style="width: 1px; height: 36px; background: var(--border-color); margin-right: 24px;"></div>
                <div style="flex: 1; padding-right: 16px;">
                  <span style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 4px;">Blood pressure</span>
                  <strong style="font-size: 20px; color: var(--text-main); font-weight: 700;">${latestVitals.bloodPressure || '—'}</strong>
                </div>
                <div style="width: 1px; height: 36px; background: var(--border-color); margin-right: 24px;"></div>
                <div style="flex: 1; padding-right: 16px;">
                  <span style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 4px;">Weight</span>
                  <strong style="font-size: 20px; color: var(--text-main); font-weight: 700;">${latestVitals.weight || '—'}</strong>
                </div>
                <div style="width: 1px; height: 36px; background: var(--border-color); margin-right: 24px;"></div>
                <div style="flex: 1;">
                  <span style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 4px;">Health score</span>
                  <strong style="font-size: 20px; color: #0f766e; font-weight: 700;">${latestVitals.healthScore || '—'}</strong>
                </div>
              </div>
            </div>
          `;
        }

        panel.innerHTML = `
          ${vitalsBannerHtml}
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

          <div class="card slide-up" style="margin-bottom: 24px;">
            <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 20px; color: var(--text-main);">Next Scheduled Session</h2>
            ${nextAppt ? `
              <div style="display: flex; justify-content: space-between; align-items: center; background: var(--primary-soft); padding: 20px; border-radius: var(--radius-md); border: 1px dashed rgba(37, 99, 235, 0.3);">
                <div>
                  <h4 style="font-size: 18px; margin-bottom: 4px; font-weight: 700;">${nextAppt.doctorName}</h4>
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

          <div class="card slide-up">
            <h2 style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">Prescriptions</h2>
            <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 20px;">Current and past medications.</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${medsListHtml}
            </div>
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
              <h3 style="font-size: 18px; margin-bottom: 20px;">2. Available Time Slots for ${state.bookingSelectedDoctor.name}</h3>
              
              ${(!state.doctorSlots || state.doctorSlots.length === 0) ? `
                <div style="padding: 24px; text-align: center; border: 1px dashed var(--border-color); border-radius: 8px; background: var(--bg-main); color: var(--text-muted); font-size:14px; margin-bottom:20px;">
                  <i data-lucide="calendar-off" style="width: 24px; height: 24px; margin: 0 auto 12px; display:block; color:var(--text-muted);"></i>
                  No available time slots found for this doctor. Please select another doctor.
                </div>
              ` : `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-bottom: 20px; max-height: 200px; overflow-y: auto; padding: 4px;">
                  ${state.doctorSlots.map(slot => {
                    const isSelected = state.selectedBookingSlot && String(state.selectedBookingSlot.id || state.selectedBookingSlot._id) === String(slot.id || slot._id);
                    return `
                      <div onclick="app.selectBookingSlot('${slot.id || slot._id}')" 
                           style="border: 2px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}; 
                                  background: ${isSelected ? 'var(--primary-soft)' : 'rgba(255, 255, 255, 0.4)'}; 
                                  color: ${isSelected ? 'var(--primary)' : 'var(--text-main)'};
                                  padding: 10px; text-align: center; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                           onmouseover="this.style.transform='translateY(-2px)'"
                           onmouseout="this.style.transform='translateY(0)'">
                        <strong style="font-size:12px; display:block;">${slot.date}</strong>
                        <span style="font-size:13px; font-weight:700; margin-top:2px; display:block;">${slot.time}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}

              <form onsubmit="app.handleBookAppointment(event)">
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

      else if (state.currentTab === 'medical-records') {
        title.innerText = "Medical History";
        subtitle.innerText = "Access your past consultations, clinical diagnoses, and prescriptions.";
        headerActions.innerHTML = '';

        const appts = await apiFetch('/api/appointments');
        const completedAppts = appts.filter(a => a.status === 'completed');

        if (completedAppts.length === 0) {
          panel.innerHTML = `
            <div class="card" style="text-align: center; padding: 48px; color: var(--text-muted);">
              <div class="stat-card-icon blue" style="width: 48px; height: 48px; margin: 0 auto 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--primary-soft); color: var(--primary);">
                <i data-lucide="folder-heart" style="width: 24px; height: 24px;"></i>
              </div>
              <p style="font-size: 15px;">No clinical records found in your archive.</p>
            </div>
          `;
        } else {
          const recordsHtml = completedAppts.map(a => {
            const medsHtml = (a.prescription && a.prescription.length > 0)
              ? `<div style="display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 10px;">
                  ${a.prescription.map(m => {
                    const status = getMedicationStatus(a.date, m.duration);
                    return `
                      <div class="card" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: rgba(255, 255, 255, 0.4); border: 1px solid var(--border-color); border-radius: var(--radius-md); transition: transform 0.2s ease;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                        <div style="display: flex; align-items: center; gap: 14px;">
                          <div style="width: 44px; height: 44px; border-radius: 22px; background: #e6fcf5; color: #0ca678; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i data-lucide="pill" style="width: 20px; height: 20px;"></i>
                          </div>
                          <div>
                            <h4 style="font-size: 15px; color: var(--text-main); font-weight: 700; margin: 0;">${m.medication} ${m.dosage}</h4>
                            <p style="font-size: 13px; color: var(--text-muted); margin: 2px 0 4px;">${m.frequency}</p>
                            <p style="font-size: 11px; color: var(--text-muted); opacity: 0.8; margin: 0;">Prescribed by ${a.doctorName} • Duration: ${m.duration}</p>
                          </div>
                        </div>
                        <div>
                          <span class="status-pill" style="background: ${status === 'Active' ? '#e6fcf5' : '#e8f7ff'}; color: ${status === 'Active' ? '#0ca678' : '#0077b6'}; border: none; font-weight: 700; font-size: 11px; padding: 5px 10px;">
                            ${status}
                          </span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>`
              : `<p style="font-size: 13px; color: var(--text-muted); font-style: italic; background: var(--bg-main); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin: 0;">No medications prescribed for this consult.</p>`;

            const vitalsHtml = (a.heartRate || a.bloodPressure || a.weight || a.healthScore)
              ? `<div>
                  <h4 style="font-size: 12px; font-weight: 700; margin-bottom: 8px; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 6px;">
                    <i data-lucide="heart" style="width: 14px; height: 14px; color: var(--danger);"></i> Consultation Vitals
                  </h4>
                  <div style="display: flex; align-items: center; padding: 12px 16px; background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-md); gap: 16px; overflow-x: auto; font-size: 13px;">
                    <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted);">
                      <span>Heart rate: <strong style="color: var(--text-main);">${a.heartRate || '—'}</strong></span>
                    </div>
                    <div style="width: 1px; height: 14px; background: var(--border-color);"></div>
                    <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted);">
                      <span>Blood pressure: <strong style="color: var(--text-main);">${a.bloodPressure || '—'}</strong></span>
                    </div>
                    <div style="width: 1px; height: 14px; background: var(--border-color);"></div>
                    <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted);">
                      <span>Weight: <strong style="color: var(--text-main);">${a.weight || '—'}</strong></span>
                    </div>
                    <div style="width: 1px; height: 14px; background: var(--border-color);"></div>
                    <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted);">
                      <span>Health score: <strong style="color: #0f766e;">${a.healthScore || '—'}</strong></span>
                    </div>
                  </div>
                </div>`
              : '';

            return `
              <div class="card slide-up" style="display: flex; flex-direction: column; gap: 20px; margin-bottom: 24px; border: 1px solid var(--border-color); background: var(--bg-card);">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 44px; height: 44px; border-radius: var(--radius-full); background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; border: 1px solid rgba(37,99,235,0.1);">
                      ${a.doctorName.replace('Dr. ', '').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0;">Consultation with ${a.doctorName}</h3>
                      <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Date: ${a.date} • Reason: ${a.reason}</p>
                    </div>
                  </div>
                  <span class="status-pill completed" style="font-size: 11px; font-weight: 700; padding: 4px 10px;">CONSULTATION OVER</span>
                </div>
                
                ${vitalsHtml}
                
                <div>
                  <h4 style="font-size: 12px; font-weight: 700; margin-bottom: 8px; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 6px;">
                    <i data-lucide="file-text" style="width: 14px; height: 14px; color: var(--primary);"></i> Clinical Notes & Diagnosis
                  </h4>
                  <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6; background: var(--bg-main); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin: 0;">
                    ${a.notes || 'No clinical notes provided.'}
                  </p>
                </div>
                
                <div>
                  <h4 style="font-size: 12px; font-weight: 700; margin-bottom: 8px; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 6px;">
                    <i data-lucide="pill" style="width: 14px; height: 14px; color: #0ca678;"></i> Prescription Details
                  </h4>
                  ${medsHtml}
                </div>
              </div>
            `;
          }).join('');

          panel.innerHTML = recordsHtml;
        }
      }

      else if (state.currentTab === 'billing') {
        title.innerText = "Billing & Invoices";
        subtitle.innerText = "Settle clinical consultation fees and access payment receipts.";
        headerActions.innerHTML = '';

        const invoices = await apiFetch('/api/invoices');

        if (invoices.length === 0) {
          panel.innerHTML = `
            <div class="card" style="text-align: center; padding: 48px; color: var(--text-muted);">
              <div class="stat-card-icon blue" style="width: 48px; height: 48px; margin: 0 auto 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--primary-soft); color: var(--primary);">
                <i data-lucide="receipt" style="width: 24px; height: 24px;"></i>
              </div>
              <p style="font-size: 15px;">No outstanding or paid invoices found.</p>
            </div>
          `;
        } else {
          const rows = invoices.map(inv => {
            const detailStr = inv.medicines && inv.medicines.length > 0 
              ? `${inv.doctorName} Consult + Medicines`
              : `${inv.doctorName} Consultation`;
            return `
              <tr>
                <td style="font-weight:600;">${detailStr}</td>
                <td style="font-weight:700;">₹${inv.amount}</td>
                <td>${new Date(inv.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                <td><span class="status-pill ${inv.status}">${inv.status.toUpperCase()}</span></td>
                <td>
                  <div style="display:flex; gap:8px; align-items:center;">
                    ${inv.status === 'unpaid' ? `
                      <button onclick="app.openPaymentModal('${inv.id || inv._id}', ${inv.amount}, '${inv.doctorName}')" class="btn btn-primary" style="padding: 6px 14px; font-size: 12px; display:inline-flex; align-items:center; gap:4px;">
                        <i data-lucide="credit-card" style="width:12px; height:12px;"></i> Pay Now
                      </button>
                    ` : `
                      <span style="color: var(--success); font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">
                        <i data-lucide="check" style="width:14px; height:14px;"></i> Paid
                      </span>
                    `}
                    <button onclick="app.openInvoiceReceiptModal('${inv.id || inv._id}')" class="btn btn-outline" style="padding: 6px 14px; font-size: 12px; display:inline-flex; align-items:center; gap:4px;">
                      <i data-lucide="file-text" style="width:12px; height:12px;"></i> View Bill
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');

          panel.innerHTML = `
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Invoice Details</th>
                    <th>Grand Total</th>
                    <th>Date Generated</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
          `;
          lucide.createIcons();
        }
      } else if (state.currentTab === 'chatbot') {
        title.innerText = "AuraBot Clinical AI";
        subtitle.innerText = "Explain your symptoms, receive diagnostic insights, and book matched doctor appointments instantly.";
        headerActions.innerHTML = '';
        app.renderChatbotTab();
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
                  <button onclick="app.openVitalsModal('${appt.id || appt._id}', '${appt.patientName}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;" title="Record Vitals">
                    <i data-lucide="activity" style="width: 14px; height: 14px;"></i> Record Vitals
                  </button>
                  <button onclick="app.openPrescriptionModal('${appt.id || appt._id}', '${appt.patientName}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;" title="Keep Prescription">
                    <i data-lucide="file-signature" style="width: 14px; height: 14px;"></i> Keep Prescription
                  </button>
                ` : ''}
                ${appt.status === 'completed' ? `
                  <button onclick="app.openVitalsModal('${appt.id || appt._id}', '${appt.patientName}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;" title="Record Vitals">
                    <i data-lucide="activity" style="width: 14px; height: 14px;"></i> Record Vitals
                  </button>
                  <button onclick="app.openPrescriptionModal('${appt.id || appt._id}', '${appt.patientName}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;" title="Keep Prescription">
                    <i data-lucide="edit" style="width: 14px; height: 14px;"></i> Keep Prescription
                  </button>
                ` : ''}
                ${appt.status === 'cancelled' ? '-' : ''}
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

      else if (state.currentTab === 'availability') {
        title.innerText = "Consultation Availability Manager";
        subtitle.innerText = "Publish your free slots so patients can schedule appointments directly.";
        headerActions.innerHTML = '';

        const slots = await apiFetch('/api/doctor/availability');

        // Reset selected slots array on tab load
        if (!state.selectedAvailabilityTimes) {
          state.selectedAvailabilityTimes = [];
        }

        const rows = slots.map(slot => {
          const statusClass = slot.isBooked ? 'completed' : 'pending';
          const statusText = slot.isBooked ? 'Booked' : 'Free / Available';

          return `
            <tr>
              <td style="font-weight:600;">${slot.date}</td>
              <td style="font-weight:700; color:var(--primary);">${slot.time}</td>
              <td><span class="status-pill ${statusClass}">${statusText}</span></td>
              <td>
                ${!slot.isBooked ? `
                  <button onclick="app.deleteDoctorSlot('${slot.id || slot._id}')" class="btn btn-outline btn-icon" style="color:var(--danger); border-color:rgba(239, 68, 68, 0.2);" title="Delete Slot">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                  </button>
                ` : '—'}
              </td>
            </tr>
          `;
        }).join('');

        panel.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 32px;">
            <!-- Publish Slots Card -->
            <div class="card slide-up" style="padding: 32px;">
              <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 24px; display: flex; align-items: center; gap: 10px;">
                <i data-lucide="plus-circle" style="color: var(--primary); width: 22px; height: 22px;"></i> Add Consultation Availability
              </h3>
              
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 32px; align-items: start;">
                <!-- Column 1: Date Picker -->
                <div>
                  <h4 style="font-size: 14px; font-weight: 700; color: var(--text-main); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                    <span style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); font-size: 11px;">1</span>
                    Select Date
                  </h4>
                  <div style="display: flex; justify-content: flex-start; margin-top: 16px;">
                    <div id="inline-date-picker"></div>
                  </div>
                  <!-- Hidden input to store date value -->
                  <input type="hidden" id="slot-date">
                </div>

                <!-- Column 2: Time Selection -->
                <div style="display: flex; flex-direction: column; gap: 20px;">
                  <h4 style="font-size: 14px; font-weight: 700; color: var(--text-main); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                    <span style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); font-size: 11px;">2</span>
                    Select Time Slots (Click to select multiple)
                  </h4>

                  <!-- Morning Grid -->
                  <div>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px; margin-bottom: 10px; letter-spacing: 0.05em;">
                      <i data-lucide="sun" style="width: 14px; height: 14px; color: #f59e0b;"></i> Morning Sessions
                    </span>
                    <div class="availability-time-grid">
                      ${['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM'].map(time => `
                        <button type="button" id="pill-${time.replace(':', '-').replace(' ', '-')}" onclick="app.toggleAvailabilityTime('${time}')" class="time-select-pill">
                          ${time}
                        </button>
                      `).join('')}
                    </div>
                  </div>

                  <!-- Afternoon Grid -->
                  <div>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px; margin-bottom: 10px; letter-spacing: 0.05em;">
                      <i data-lucide="sunset" style="width: 14px; height: 14px; color: #3b82f6;"></i> Afternoon & Evening
                    </span>
                    <div class="availability-time-grid">
                      ${['12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM'].map(time => `
                        <button type="button" id="pill-${time.replace(':', '-').replace(' ', '-')}" onclick="app.toggleAvailabilityTime('${time}')" class="time-select-pill">
                          ${time}
                        </button>
                      `).join('')}
                    </div>
                  </div>

                  <!-- Custom Time Selection -->
                  <div>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px; margin-bottom: 10px; letter-spacing: 0.05em;">
                      <i data-lucide="clock" style="width: 14px; height: 14px; color: #10b981;"></i> Custom Time
                    </span>
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
                      <div class="input-wrapper" style="margin: 0; width: 140px; height: 38px;">
                        <input type="text" id="custom-time-input" class="input-control" placeholder="Select time" style="height: 38px; min-height: 38px;">
                      </div>
                      <button type="button" onclick="app.addCustomTime()" class="btn btn-outline" style="height: 38px; padding: 0 16px; font-size: 12px; border-radius: var(--radius-md);">
                        Add Time
                      </button>
                    </div>
                    <div id="custom-time-pills" class="availability-time-grid"></div>
                  </div>

                  <!-- Action Button -->
                  <button onclick="app.addDoctorSlot()" class="btn btn-primary" style="width: 100%; height: 50px; font-size: 15px; font-weight: 700; margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i data-lucide="calendar-plus"></i> Publish Availability Slots
                  </button>
                </div>
              </div>
            </div>

            <!-- Ledger Card -->
            <div class="card slide-up">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3 style="font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 10px;">
                  <i data-lucide="table-properties" style="color: var(--primary); width: 22px; height: 22px;"></i> My Availability Ledger
                </h3>
                <span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">
                  Showing ${slots.length} total published slots
                </span>
              </div>
              
              <div class="table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time Slot</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows || '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 48px;">No availability slots published yet. Select a date and time above to add.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
        lucide.createIcons();
        if (typeof flatpickr !== 'undefined') {
          const todayStr = new Date().toISOString().split('T')[0];
          const dateInput = document.getElementById('slot-date');
          if (dateInput) {
            dateInput.value = todayStr;
          }
          flatpickr("#inline-date-picker", {
            inline: true,
            dateFormat: "Y-m-d",
            minDate: "today",
            defaultDate: todayStr,
            onChange: function(selectedDates, dateStr, instance) {
              if (dateInput) {
                dateInput.value = dateStr;
              }
            }
          });

          flatpickr("#custom-time-input", {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false
          });

        }
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

      else if (state.currentTab === 'billing') {
        title.innerText = "Billing Ledger & Cash Counter";
        subtitle.innerText = "Generate professional invoices, record cash/UPI payments, and issue itemized medical bills.";
        headerActions.innerHTML = `
          <button onclick="app.openCreateInvoiceModal()" class="btn btn-primary">
            <i data-lucide="plus"></i> Issue Custom Bill
          </button>
        `;

        const invoices = await apiFetch('/api/invoices');

        const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
        const totalUnpaid = invoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + i.amount, 0);

        const rows = invoices.map(inv => {
          const formattedDate = new Date(inv.createdAt).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
          const detailStr = inv.medicines && inv.medicines.length > 0 
            ? `${inv.doctorName} Consult + ${inv.medicines.length} Medicine(s)`
            : `${inv.doctorName} Consultation`;

          return `
            <tr>
              <td style="font-weight:600;">${inv.patientName}</td>
              <td style="font-size:13px; color:var(--text-muted);">${detailStr}</td>
              <td style="font-weight:700;">₹${inv.amount}</td>
              <td>${formattedDate}</td>
              <td><span class="status-pill ${inv.status}">${inv.status.toUpperCase()}</span></td>
              <td style="font-weight:600; color:var(--text-muted); font-size:13px;">${inv.paymentMethod || '—'}</td>
              <td>
                <div style="display:flex; gap:8px; align-items:center;">
                  ${inv.status === 'unpaid' ? `
                    <button onclick="app.collectReceptionPayment('${inv.id || inv._id}', 'Cash')" class="btn btn-success" style="padding: 6px 12px; font-size: 11px; display:inline-flex; align-items:center; gap:4px; background:#e6fcf5; color:#0ca678; border:1px solid #c3fae8;">
                      <i data-lucide="banknote" style="width:12px; height:12px;"></i> Cash
                    </button>
                    <button onclick="app.collectReceptionPayment('${inv.id || inv._id}', 'UPI')" class="btn btn-primary" style="padding: 6px 12px; font-size: 11px; display:inline-flex; align-items:center; gap:4px; background:#e8f7ff; color:#0077b6; border:1px solid #c5f0ff;">
                      <i data-lucide="smartphone" style="width:12px; height:12px;"></i> UPI
                    </button>
                  ` : ''}
                  <button onclick="app.openInvoiceReceiptModal('${inv.id || inv._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 11px; display:inline-flex; align-items:center; gap:4px;">
                    <i data-lucide="file-text" style="width:12px; height:12px;"></i> View Bill
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');

        panel.innerHTML = `
          <div class="stats-cards" style="margin-bottom:24px;">
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Paid Collection</span>
                <span class="stat-value" style="color:var(--success);">₹${totalPaid}</span>
              </div>
              <div class="stat-card-icon green">
                <i data-lucide="check-check"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Outstanding Dues</span>
                <span class="stat-value" style="color:var(--danger);">₹${totalUnpaid}</span>
              </div>
              <div class="stat-card-icon orange">
                <i data-lucide="alert-circle"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Invoices Issued</span>
                <span class="stat-value">${invoices.length}</span>
              </div>
              <div class="stat-card-icon blue">
                <i data-lucide="receipt"></i>
              </div>
            </div>
          </div>

          <div class="card slide-up">
            <h2 style="font-size: 18px; margin-bottom: 20px; font-weight:700;">Billing Records Ledger</h2>
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>Invoice Details</th>
                    <th>Grand Total</th>
                    <th>Date Issued</th>
                    <th>Status</th>
                    <th>Method</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding:32px;">No bills or invoices issued yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        `;
        lucide.createIcons();
      }
    }

    // ADMINISTRATOR DASHBOARD
    else if (role === 'admin') {
      const stats = await apiFetch('/api/admin/stats');
      const usersList = await apiFetch('/api/admin/users');
      state.usersList = usersList;

      const appts = await apiFetch('/api/appointments');
      state.appointments = appts;

      const invoices = await apiFetch('/api/invoices');
      state.invoices = invoices;

      if (state.currentTab === 'overview') {
        title.innerText = "System Administration Panel";
        subtitle.innerText = "Manage clinical registers, view telemetry and check database configurations.";
        headerActions.innerHTML = '';

        const recentActivitiesHtml = (stats.recentActivities && stats.recentActivities.length > 0)
          ? stats.recentActivities.map(act => {
              let icon = 'info';
              let color = 'var(--primary)';
              if (act.type === 'user') { icon = 'user-plus'; color = '#3b82f6'; }
              else if (act.type === 'appointment') { icon = 'calendar'; color = '#f59e0b'; }
              else if (act.type === 'invoice') { icon = 'receipt'; color = '#10b981'; }

              return `
                <div style="display:flex; gap:16px; align-items:flex-start; border-bottom:1px solid var(--border-color); padding:12px 0;">
                  <div style="width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.8); display:flex; align-items:center; justify-content:center; color:${color}; border:1px solid var(--border-color); flex-shrink:0;">
                    <i data-lucide="${icon}" style="width:16px; height:16px;"></i>
                  </div>
                  <div style="flex:1;">
                    <p style="margin:0; font-size:14px; color:var(--text-main); line-height:1.4;">${act.message}</p>
                    <span style="font-size:11px; color:var(--text-muted);">${new Date(act.time).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              `;
            }).join('')
          : '<p style="color:var(--text-muted); font-size:14px; font-style:italic;">No recent activities logged.</p>';

        panel.innerHTML = `
          <div class="stats-cards" style="margin-bottom: 24px;">
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

          <div class="stats-cards" style="margin-bottom: 24px;">
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Total Revenue</span>
                <span class="stat-value" style="color: var(--success); font-weight: 800;">₹${stats.totalRevenue || 0}.00</span>
              </div>
              <div class="stat-card-icon green">
                <i data-lucide="indian-rupee"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Pending Collections</span>
                <span class="stat-value" style="color: var(--warning); font-weight: 800;">₹${stats.pendingCollection || 0}.00</span>
              </div>
              <div class="stat-card-icon orange">
                <i data-lucide="clock"></i>
              </div>
            </div>
            <div class="card stat-card">
              <div class="stat-data">
                <span class="text-muted">Paid Invoices</span>
                <span class="stat-value" style="font-weight: 800;">${invoices.filter(i=>i.status==='paid').length} Bills</span>
              </div>
              <div class="stat-card-icon blue">
                <i data-lucide="receipt"></i>
              </div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1.5fr; gap:24px; align-items:flex-start;">
            <div class="card slide-up">
              <h3 style="font-size: 16px; margin-bottom: 16px; font-weight:700; color:var(--text-main);">Telemetry & Connectivity</h3>
              <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                  <span style="font-weight:600; font-size:13px;">Active Database Engine</span>
                  <span style="color:var(--primary); font-weight:700; font-size:13px;">${stats.dbMode} Mode</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                  <span style="font-weight:600; font-size:13px;">Backend Server Connection</span>
                  <span style="color:var(--success); font-weight:700; font-size:13px;">Operational</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="font-weight:600; font-size:13px;">Pending Schedules Ledger</span>
                  <span style="font-size:13px;">${stats.pendingAppointments} records</span>
                </div>
              </div>
            </div>

            <div class="card slide-up" style="padding:20px 24px;">
              <h3 style="font-size:16px; margin-bottom: 16px; font-weight:700; color:var(--text-main);">Recent Activities Log</h3>
              <div style="max-height: 280px; overflow-y:auto; padding-right:6px;">
                ${recentActivitiesHtml}
              </div>
            </div>
          </div>
        `;
      }

      else if (state.currentTab === 'users') {
        title.innerText = "User Account Management";
        subtitle.innerText = "Add, suspend, edit, or remove system users (Patients, Doctors, Receptionists, Admins).";
        headerActions.innerHTML = '';

        const rows = usersList.map(u => `
          <tr>
            <td style="font-weight:600;">
              <div>${u.name}</div>
              <div style="font-size:11px; color:var(--text-muted); font-weight:400;">ID: ${u.id || u._id}</div>
            </td>
            <td>${u.email}</td>
            <td><span class="status-pill approved" style="text-transform:uppercase; font-size:11px;">${u.role}</span></td>
            <td>
              <span class="status-pill ${u.status === 'suspended' ? 'cancelled' : 'approved'}" style="text-transform:capitalize; font-size:11px;">
                ${u.status || 'active'}
              </span>
            </td>
            <td>
              <div style="display:flex; gap:6px;">
                <button onclick="app.toggleUserStatus('${u.id || u._id}', '${u.status || 'active'}')" class="btn btn-outline" style="padding:4px 8px; font-size:11px;">
                  <i data-lucide="ban" style="width:12px; height:12px; display:inline; vertical-align:middle;"></i>
                  ${u.status === 'suspended' ? 'Activate' : 'Suspend'}
                </button>
                <button onclick="app.deleteUser('${u.id || u._id}')" class="btn btn-outline" style="padding:4px 8px; font-size:11px; color:var(--danger); border-color:rgba(239, 68, 68, 0.2);">
                  <i data-lucide="trash-2" style="width:12px; height:12px; display:inline; vertical-align:middle;"></i>
                  Remove
                </button>
              </div>
            </td>
          </tr>
        `).join('');

        panel.innerHTML = `
          <div style="display:grid; grid-template-columns: 1fr 1.8fr; gap:32px; align-items: flex-start;">
            <div class="card">
              <h3 style="font-size: 16px; margin-bottom: 20px; font-weight:700;">Register New Account</h3>
              <form onsubmit="app.handleCreateStaff(event)">
                <div class="form-group">
                  <label>Full Name</label>
                  <input type="text" id="staff-name" class="input-control" placeholder="e.g. Dr. Mark Miller" style="padding-left:14px;" required>
                </div>
                <div class="form-group">
                  <label>Email Address</label>
                  <input type="email" id="staff-email" class="input-control" placeholder="email@auramed.com" style="padding-left:14px;" required>
                </div>
                <div class="form-group">
                  <label>Initial Password</label>
                  <input type="password" id="staff-password" class="input-control" placeholder="••••••••" style="padding-left:14px;" required>
                </div>
                <div class="form-group">
                  <label>Role</label>
                  <select id="staff-role" class="input-control" style="padding-left:14px;" required onchange="const s = document.getElementById('spec-group-admin'); this.value === 'doctor' ? s.style.display='' : s.style.display='none'">
                    <option value="doctor">Doctor</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="patient">Patient</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div class="form-group" id="spec-group-admin">
                  <label>Clinical Specialty (Doctor only)</label>
                  <input type="text" id="staff-specialty" class="input-control" placeholder="e.g. Cardiology, Pediatrics" style="padding-left:14px;">
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%; height:46px; margin-top: 10px;">
                  Create Account
                </button>
              </form>
            </div>

            <div class="card" style="padding: 24px;">
              <h3 style="font-size: 16px; margin-bottom: 20px; font-weight:700;">Active System Directory</h3>
              <div class="table-wrapper" style="margin-top:0;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>User Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Actions</th>
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

      else if (state.currentTab === 'doctors') {
        title.innerText = "Doctor Management Panel";
        subtitle.innerText = "Approve doctor registrations, assign departments, consultation fees, and working hours.";
        headerActions.innerHTML = '';

        const docs = usersList.filter(u => u.role === 'doctor');
        
        const rows = docs.map(d => {
          const availabilityCount = d.availability ? d.availability.filter(s=>!s.isBooked).length : 0;
          return `
            <tr>
              <td style="font-weight:600;">${d.name}</td>
              <td>
                <input type="text" id="doc-spec-${d.id || d._id}" class="input-control" value="${d.specialty || 'General Practice'}" style="height:32px; width:130px; font-size:13px; padding-left:8px;">
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:13px; font-weight:700; color:var(--text-main);">₹</span>
                  <input type="number" id="doc-fees-${d.id || d._id}" class="input-control" value="${d.fees || 500}" style="height:32px; width:80px; font-size:13px; padding-left:8px;">
                </div>
              </td>
              <td>
                <input type="text" id="doc-hours-${d.id || d._id}" class="input-control" value="${d.workingHours || '09:00 AM - 05:00 PM'}" style="height:32px; width:180px; font-size:13px; padding-left:8px;">
              </td>
              <td>
                <span class="status-pill ${d.isApproved ? 'approved' : 'pending'}" style="font-size:11px;">
                  ${d.isApproved ? 'Approved' : 'Pending Approval'}
                </span>
              </td>
              <td>
                <div style="display:flex; gap:6px;">
                  <button onclick="app.toggleDoctorApproval('${d.id || d._id}', ${d.isApproved || false})" class="btn btn-outline" style="padding:4px 8px; font-size:11px;">
                    ${d.isApproved ? 'Revoke Approval' : 'Approve'}
                  </button>
                  <button onclick="app.updateDoctorSettings('${d.id || d._id}')" class="btn btn-primary" style="padding:4px 8px; font-size:11px; min-width:auto; height:32px; width:32px; display:flex; align-items:center; justify-content:center;">
                    <i data-lucide="save" style="width:14px; height:14px;"></i>
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');

        panel.innerHTML = `
          <div class="card" style="padding: 24px;">
            <h3 style="font-size: 16px; margin-bottom: 20px; font-weight:700;">Clinical Practice Settings</h3>
            <div class="table-wrapper" style="margin-top:0;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Doctor Name</th>
                    <th>Clinical Specialty</th>
                    <th>Consultation Fee (₹)</th>
                    <th>Working Hours</th>
                    <th>Approval Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">No doctors registered in the system.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      else if (state.currentTab === 'records') {
        title.innerText = "Medical Records Repository";
        subtitle.innerText = "Access patient diagnoses, health scores, prescriptions, and upload/verify medical documents.";
        headerActions.innerHTML = `
          <div style="display:flex; gap:12px;">
            <input type="text" oninput="app.searchAppointments(event)" placeholder="Search by Patient Name..." class="input-control" style="width:250px; height:40px; padding-left:14px; font-size:14px;">
          </div>
        `;

        const completedAppts = appts.filter(a => a.status === 'completed');

        const recordsHtml = completedAppts.map(a => {
          const reportsListHtml = (a.reports && a.reports.length > 0)
            ? a.reports.map(r => `
                <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-card); padding:10px 14px; border-radius:6px; border:1px solid var(--border-color); margin-top:8px;">
                  <div>
                    <h5 style="margin:0; font-size:13px; font-weight:700; color:var(--text-main);">${r.name}</h5>
                    <p style="margin:2px 0 0; font-size:12px; color:var(--text-muted); font-style:italic;">${r.fileContent}</p>
                    <span style="font-size:10px; color:var(--text-muted); opacity:0.8;">Uploaded: ${r.dateUploaded}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="status-pill ${r.verified ? 'approved' : 'pending'}" style="font-size:10px; padding:2px 8px;">
                      ${r.verified ? 'Verified' : 'Pending Verification'}
                    </span>
                    ${!r.verified ? `
                      <button onclick="app.verifyReport('${a.id || a._id}', '${r.id || r._id}')" class="btn btn-outline" style="padding:4px 8px; font-size:10px; height:24px;">
                        Verify
                      </button>
                    ` : ''}
                    <button onclick="app.deleteReport('${a.id || a._id}', '${r.id || r._id}')" class="btn btn-outline" style="padding:4px 8px; font-size:10px; height:24px; color:var(--danger); border-color:rgba(239,68,68,0.2);">
                      Delete
                    </button>
                  </div>
                </div>
              `).join('')
            : '<p style="color:var(--text-muted); font-size:12px; font-style:italic; margin-top:8px;">No uploaded medical documents found.</p>';

          const medsHtml = (a.prescription && a.prescription.length > 0)
            ? a.prescription.map(m => `
                <div style="font-size:13px; padding:4px 0; border-bottom:1px dashed var(--border-color);">
                  <strong>${m.medication}</strong> - ${m.dosage} | ${m.frequency} (${m.duration})
                </div>
              `).join('')
            : '<span style="color:var(--text-muted); font-size:13px;">No medicines prescribed.</span>';

          return `
            <div class="card slide-up" style="margin-bottom:24px; padding:24px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px;">
                <div>
                  <h4 style="margin:0; font-size:16px; font-weight:700; color:var(--text-main);">${a.patientName}</h4>
                  <p style="margin:2px 0 0; font-size:12px; color:var(--text-muted);">Consultant: ${a.doctorName} • Consultation Date: ${a.date}</p>
                </div>
                <div style="display:flex; gap:12px; align-items:center;">
                  <span class="status-pill approved" style="font-size:11px;">Completed Visit</span>
                  <span style="font-size:13px; font-weight:700; color:var(--primary);">Health Score: ${a.healthScore || 'N/A'}</span>
                </div>
              </div>

              <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:32px;">
                <div>
                  <div style="margin-bottom:12px;">
                    <h5 style="margin:0 0 6px; font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px;">Clinical Diagnosis & Notes</h5>
                    <p style="margin:0; font-size:14px; color:var(--text-main); line-height:1.5;">${a.notes || 'No clinical notes provided.'}</p>
                  </div>
                  <div>
                    <h5 style="margin:0 0 6px; font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px;">Prescribed Medications</h5>
                    <div>${medsHtml}</div>
                  </div>
                </div>

                <div>
                  <div style="background:rgba(255,255,255,0.4); padding:12px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:16px;">
                    <h5 style="margin:0 0 8px; font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted);">Patient Vital Metrics</h5>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px;">
                      <div>BPM: <strong>${a.heartRate || '-'}</strong></div>
                      <div>Blood Pressure: <strong>${a.bloodPressure || '-'}</strong></div>
                      <div style="grid-column:span 2;">Body Weight: <strong>${a.weight || '-'} kg</strong></div>
                    </div>
                  </div>
                  
                  <!-- Upload simulator -->
                  <div>
                    <h5 style="margin:0 0 6px; font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted);">Clinical Documents</h5>
                    ${reportsListHtml}
                    
                    <div style="margin-top:12px; border-top:1px dashed var(--border-color); padding-top:12px;">
                      <h6 style="margin:0 0 6px; font-size:11px; font-weight:700; color:var(--text-muted);">Simulate Report Upload</h6>
                      <div style="display:flex; flex-direction:column; gap:6px;">
                        <input type="text" id="sim-report-name-${a.id || a._id}" placeholder="Report Title (e.g. ECG Report)" class="input-control" style="height:28px; font-size:12px; padding-left:8px;">
                        <input type="text" id="sim-report-desc-${a.id || a._id}" placeholder="Brief file content simulation..." class="input-control" style="height:28px; font-size:12px; padding-left:8px;">
                        <button onclick="app.uploadReportSimulate('${a.id || a._id}')" class="btn btn-primary" style="height:28px; font-size:11px; padding:0 8px; min-width:auto; margin-top:2px;">
                          Upload
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('');

        panel.innerHTML = `
          <div style="margin-top:20px;">
            ${recordsHtml || '<div class="card" style="text-align:center; padding:48px; color:var(--text-muted);">No completed clinical consultations found.</div>'}
          </div>
        `;
        lucide.createIcons();
      }

      else if (state.currentTab === 'analytics') {
        title.innerText = "Interactive Telemetry & Charts";
        subtitle.innerText = "Statistical trends, consultation rates, and specialization demand insights.";
        headerActions.innerHTML = '';

        // Compute analytics data
        const approvedCount = appts.filter(a => a.status === 'approved').length;
        const pendingCount = appts.filter(a => a.status === 'pending').length;
        const cancelledCount = appts.filter(a => a.status === 'cancelled').length;
        const completedCount = appts.filter(a => a.status === 'completed').length;
        const totalCount = appts.length || 1;

        const docs = usersList.filter(u => u.role === 'doctor');
        const docStatsHtml = docs.map(d => {
          const docAppts = appts.filter(a => a.doctorId === (d.id || d._id)).length;
          const pct = Math.min(100, Math.round((docAppts / totalCount) * 100));
          return `
            <div style="margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                <span style="font-weight:600;">${d.name} (${d.specialty || 'General'})</span>
                <span style="font-weight:700;">${docAppts} consultations (${pct}%)</span>
              </div>
              <div style="width:100%; height:8px; background:rgba(0,0,0,0.05); border-radius:4px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:var(--primary); border-radius:4px; transition:width 0.8s ease-in-out;"></div>
              </div>
            </div>
          `;
        }).join('');

        panel.innerHTML = `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px; align-items:flex-start;">
            <div class="card">
              <h3 style="font-size: 16px; margin-bottom: 20px; font-weight:700;">Appointment Status Share</h3>
              <div style="display:flex; flex-direction:column; gap:16px;">
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                    <span style="font-weight:600; color:#10b981;">Completed Visited</span>
                    <span>${completedCount} (${Math.round((completedCount/totalCount)*100)}%)</span>
                  </div>
                  <div style="width:100%; height:8px; background:rgba(0,0,0,0.05); border-radius:4px; overflow:hidden;">
                    <div style="width:${(completedCount/totalCount)*100}%; height:100%; background:#10b981;"></div>
                  </div>
                </div>
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                    <span style="font-weight:600; color:#3b82f6;">Approved / Active</span>
                    <span>${approvedCount} (${Math.round((approvedCount/totalCount)*100)}%)</span>
                  </div>
                  <div style="width:100%; height:8px; background:rgba(0,0,0,0.05); border-radius:4px; overflow:hidden;">
                    <div style="width:${(approvedCount/totalCount)*100}%; height:100%; background:#3b82f6;"></div>
                  </div>
                </div>
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                    <span style="font-weight:600; color:#f59e0b;">Pending Review</span>
                    <span>${pendingCount} (${Math.round((pendingCount/totalCount)*100)}%)</span>
                  </div>
                  <div style="width:100%; height:8px; background:rgba(0,0,0,0.05); border-radius:4px; overflow:hidden;">
                    <div style="width:${(pendingCount/totalCount)*100}%; height:100%; background:#f59e0b;"></div>
                  </div>
                </div>
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                    <span style="font-weight:600; color:#ef4444;">Cancelled</span>
                    <span>${cancelledCount} (${Math.round((cancelledCount/totalCount)*100)}%)</span>
                  </div>
                  <div style="width:100%; height:8px; background:rgba(0,0,0,0.05); border-radius:4px; overflow:hidden;">
                    <div style="width:${(cancelledCount/totalCount)*100}%; height:100%; background:#ef4444;"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <h3 style="font-size: 16px; margin-bottom: 20px; font-weight:700;">Doctor Consultations Performance</h3>
              <div>
                ${docStatsHtml || '<p style="color:var(--text-muted); font-size:13px; font-style:italic;">No consultations logged.</p>'}
              </div>
            </div>
            
            <div class="card" style="grid-column: span 2;">
              <h3 style="font-size: 16px; margin-bottom: 20px; font-weight:700;">Weekly Patient Growth Curve (SVG Telemetry)</h3>
              <div style="width:100%; height:200px; display:flex; align-items:flex-end; position:relative; padding-top:20px;">
                <svg viewBox="0 0 500 150" style="width:100%; height:100%; overflow:visible;">
                  <defs>
                    <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.3"/>
                      <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.0"/>
                    </linearGradient>
                  </defs>
                  <path d="M 0 130 C 50 120, 100 80, 150 90 C 200 100, 250 40, 300 50 C 350 60, 400 20, 450 10 L 500 20 L 500 150 L 0 150 Z" fill="url(#curveGradient)"></path>
                  <path d="M 0 130 C 50 120, 100 80, 150 90 C 200 100, 250 40, 300 50 C 350 60, 400 20, 450 10 L 500 20" fill="none" stroke="var(--primary)" stroke-width="3"></path>
                  <circle cx="150" cy="90" r="5" fill="var(--primary)" stroke="white" stroke-width="2"></circle>
                  <circle cx="300" cy="50" r="5" fill="var(--primary)" stroke="white" stroke-width="2"></circle>
                  <circle cx="450" cy="10" r="5" fill="var(--primary)" stroke="white" stroke-width="2"></circle>
                  <text x="140" y="75" font-size="10" fill="var(--text-main)">Week 1</text>
                  <text x="290" y="35" font-size="10" fill="var(--text-main)">Week 2</text>
                  <text x="440" y="25" font-size="10" fill="var(--text-main)">Week 3 (Peak)</text>
                </svg>
              </div>
            </div>
          </div>
        `;
      }

      else if (state.currentTab === 'reports') {
        title.innerText = "System Audit Reports";
        subtitle.innerText = "Filter clinical metrics, evaluate department revenues, and export raw data files.";
        headerActions.innerHTML = '';

        panel.innerHTML = `
          <div class="card" style="margin-bottom:24px; padding:24px;">
            <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">Export Operational Matrices</h3>
            <p style="font-size:14px; color:var(--text-muted); margin-bottom:20px;">Download raw data in standard CSV format for offsite compliance records.</p>
            <div style="display:flex; gap:16px;">
              <button onclick="app.exportCSV('users')" class="btn btn-outline" style="flex:1;">
                <i data-lucide="users-2" style="width:16px; height:16px; display:inline; vertical-align:middle; margin-right:6px;"></i>
                Export User Directory
              </button>
              <button onclick="app.exportCSV('appointments')" class="btn btn-outline" style="flex:1;">
                <i data-lucide="calendar" style="width:16px; height:16px; display:inline; vertical-align:middle; margin-right:6px;"></i>
                Export Consultations Ledger
              </button>
              <button onclick="app.exportCSV('revenue')" class="btn btn-outline" style="flex:1;">
                <i data-lucide="indian-rupee" style="width:16px; height:16px; display:inline; vertical-align:middle; margin-right:6px;"></i>
                Export Billing Ledger
              </button>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
            <div class="card">
              <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">System Performance Summaries</h3>
              <div style="display:flex; flex-direction:column; gap:12px; font-size:14px;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                  <span>Daily consultations average</span>
                  <strong>${Math.round(appts.length / 7) || 1} visits/day</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                  <span>Invoice collection efficiency</span>
                  <strong style="color:var(--success);">${Math.round((invoices.filter(i=>i.status==='paid').length / (invoices.length || 1))*100)}% paid</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Average ticket size (consult fees + meds)</span>
                  <strong>₹${Math.round(stats.totalRevenue / (invoices.filter(i=>i.status==='paid').length || 1)) || 0}</strong>
                </div>
              </div>
            </div>

            <div class="card">
              <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">Departmental Audits</h3>
              <div style="display:flex; flex-direction:column; gap:12px; font-size:14px;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                  <span>Cardiology Clinic</span>
                  <strong>₹${invoices.filter(i=>i.doctorName && i.doctorName.includes('Sarah')).reduce((sum,i)=>sum+i.amount,0)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                  <span>Neurology Clinic</span>
                  <strong>₹${invoices.filter(i=>i.doctorName && i.doctorName.includes('Emily')).reduce((sum,i)=>sum+i.amount,0)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Pediatric / Dermatological Care</span>
                  <strong>₹${invoices.filter(i=>i.doctorName && (i.doctorName.includes('Robert') || i.doctorName.includes('James'))).reduce((sum,i)=>sum+i.amount,0)}</strong>
                </div>
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
