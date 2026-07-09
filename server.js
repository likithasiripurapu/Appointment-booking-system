const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'healthcare_secret_key_123';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/healthcare';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Mode indicator
let dbMode = 'JSON'; // 'MongoDB' or 'JSON'
const JSON_DB_PATH = path.join(__dirname, 'db.json');

// In-Memory/JSON Database State
let localDB = {
  users: [],
  appointments: [],
  invoices: []
};

// Mongoose Schemas (used if MongoDB connects successfully)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['patient', 'doctor', 'receptionist', 'admin'] },
  specialty: { type: String }, // For doctors
  createdAt: { type: Date, default: Date.now },
  availability: [{
    date: { type: String, required: true }, // YYYY-MM-DD
    time: { type: String, required: true }, // HH:MM
    isBooked: { type: Boolean, default: false }
  }]
});

const appointmentSchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  patientName: { type: String, required: true },
  doctorId: { type: String, required: true },
  doctorName: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  time: { type: String, required: true }, // HH:MM
  reason: { type: String, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'cancelled', 'completed'] },
  createdAt: { type: Date, default: Date.now },
  notes: { type: String },
  heartRate: { type: String },
  bloodPressure: { type: String },
  weight: { type: String },
  healthScore: { type: String },
  prescription: [{
    medication: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    duration: { type: String, required: true }
  }],
  reports: [{
    name: { type: String },
    fileContent: { type: String }, // Base64 or text representation of file
    dateUploaded: { type: String },
    verified: { type: Boolean, default: false }
  }]
});

const invoiceSchema = new mongoose.Schema({
  appointmentId: { type: String },
  patientId: { type: String, required: true },
  patientName: { type: String, required: true },
  doctorName: { type: String, required: true },
  consultationFee: { type: Number, default: 0 },
  medicines: [{
    medication: { type: String },
    unitPrice: { type: Number },
    quantity: { type: Number },
    totalPrice: { type: Number }
  }],
  subtotal: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  amount: { type: Number, required: true }, // Grand Total
  status: { type: String, default: 'unpaid', enum: ['unpaid', 'paid'] },
  paymentMethod: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'info' }, // 'info', 'success', 'warning', 'reminder'
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

let UserModel;
let AppointmentModel;
let InvoiceModel;
let NotificationModel;

// Helper to seed initial data in JSON DB or MongoDB
const seedData = async () => {
  const defaultUsers = [
    {
      name: 'System Admin',
      email: 'admin@healthcare.com',
      password: await bcrypt.hash('admin123', 10),
      role: 'admin'
    },
    {
      name: 'Dr. Sarah Smith',
      email: 'doctor@healthcare.com',
      password: await bcrypt.hash('doctor123', 10),
      role: 'doctor',
      specialty: 'Cardiology'
    },
    {
      name: 'Dr. Robert Jones',
      email: 'dr.jones@healthcare.com',
      password: await bcrypt.hash('doctor123', 10),
      role: 'doctor',
      specialty: 'Pediatrics'
    },
    {
      name: 'Dr. Emily Davis',
      email: 'dr.davis@healthcare.com',
      password: await bcrypt.hash('doctor123', 10),
      role: 'doctor',
      specialty: 'Neurology'
    },
    {
      name: 'Dr. James Wilson',
      email: 'dr.wilson@healthcare.com',
      password: await bcrypt.hash('doctor123', 10),
      role: 'doctor',
      specialty: 'Dermatology'
    },
    {
      name: 'Alice Cooper',
      email: 'receptionist@healthcare.com',
      password: await bcrypt.hash('receptionist123', 10),
      role: 'receptionist'
    },
    {
      name: 'John Doe',
      email: 'patient@healthcare.com',
      password: await bcrypt.hash('patient123', 10),
      role: 'patient'
    }
  ];

  if (dbMode === 'MongoDB') {
    try {
      const count = await UserModel.countDocuments();
      if (count === 0) {
        await UserModel.insertMany(defaultUsers);
        console.log('MongoDB successfully seeded with default users.');
      }
    } catch (err) {
      console.error('Error seeding MongoDB:', err);
    }
  } else {
    // Seed JSON Database
    if (!fs.existsSync(JSON_DB_PATH)) {
      localDB.users = defaultUsers.map((u, index) => ({
        id: (index + 1).toString(),
        ...u,
        createdAt: new Date().toISOString()
      }));
      localDB.appointments = [
        {
          id: 'appt1',
          patientId: '7',
          patientName: 'John Doe',
          doctorId: '2',
          doctorName: 'Dr. Sarah Smith',
          date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
          time: '10:00',
          reason: 'Routine cardiovascular checkup',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      ];
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      console.log('JSON database created and seeded at:', JSON_DB_PATH);
    } else {
      try {
        const fileContent = fs.readFileSync(JSON_DB_PATH, 'utf-8');
        localDB = JSON.parse(fileContent);
        if (!localDB.invoices) {
          localDB.invoices = [];
        }
        console.log('JSON database loaded successfully. Found', localDB.users.length, 'users.');
      } catch (err) {
        console.error('Error reading JSON DB, resetting...', err);
        fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      }
    }
  }
};

// Attempt MongoDB Connection
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB at', MONGO_URI);
    dbMode = 'MongoDB';
    UserModel = mongoose.model('User', userSchema);
    AppointmentModel = mongoose.model('Appointment', appointmentSchema);
    InvoiceModel = mongoose.model('Invoice', invoiceSchema);
    NotificationModel = mongoose.model('Notification', notificationSchema);
    seedData();
  })
  .catch(err => {
    console.log('MongoDB connection failed. Falling back to local JSON database.');
    console.log('Reason:', err.message);
    dbMode = 'JSON';
    seedData();
  });

const getDoctorConsultationFee = (doctorName) => {
  const name = (doctorName || '').toLowerCase();
  if (name.includes('sarah') || name.includes('smith')) return 1200; // Cardiology
  if (name.includes('robert') || name.includes('jones')) return 800; // Pediatrics
  if (name.includes('emily') || name.includes('davis')) return 1500; // Neurology
  if (name.includes('james') || name.includes('wilson')) return 1000; // Dermatology
  return 500; // General Practice default
};

const getMedicinePresetPrice = (medName) => {
  const nameLower = (medName || '').toLowerCase();
  if (nameLower.includes('paracetamol')) return 30;
  if (nameLower.includes('amoxicillin')) return 120;
  if (nameLower.includes('cetirizine')) return 45;
  if (nameLower.includes('atorvastatin')) return 150;
  if (nameLower.includes('metformin')) return 60;
  if (nameLower.includes('pantoprazole')) return 90;
  if (nameLower.includes('cough')) return 85;
  if (nameLower.includes('vitamin') || nameLower.includes('multivitamin')) return 110;
  return 50; // Fallback price
};

async function createNotification(userId, message, type = 'info') {
  try {
    if (dbMode === 'MongoDB') {
      const newNotif = new NotificationModel({
        userId,
        message,
        type,
        read: false
      });
      await newNotif.save();
    } else {
      if (!localDB.notifications) localDB.notifications = [];
      localDB.notifications.push({
        id: Date.now().toString() + Math.random().toString().slice(2, 6),
        userId,
        message,
        type,
        read: false,
        createdAt: new Date().toISOString()
      });
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
    }
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}

async function generateAppointmentReminders(userId) {
  try {
    let appts = [];
    if (dbMode === 'MongoDB') {
      appts = await AppointmentModel.find({ patientId: userId, status: 'approved' });
    } else {
      appts = (localDB.appointments || []).filter(a => a.patientId === userId && a.status === 'approved');
    }

    const now = new Date();
    
    for (const appt of appts) {
      let timeStr = appt.time;
      let hours = 0;
      let minutes = 0;
      
      if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
        const parts = timeStr.match(/^(\d+):(\d+)\s*(am|pm)$/i);
        if (parts) {
          hours = parseInt(parts[1]);
          minutes = parseInt(parts[2]);
          const ampm = parts[3].toLowerCase();
          if (ampm === 'pm' && hours < 12) hours += 12;
          if (ampm === 'am' && hours === 12) hours = 0;
        }
      } else {
        const parts = timeStr.split(':');
        if (parts.length >= 2) {
          hours = parseInt(parts[0]);
          minutes = parseInt(parts[1]);
        }
      }
      
      const [year, month, day] = appt.date.split('-').map(Number);
      const apptDateTime = new Date(year, month - 1, day, hours, minutes);
      
      const diffMs = apptDateTime - now;
      const diffMinutes = diffMs / (1000 * 60);
      
      // If the appointment is in the future and starts in exactly 5 minutes (rounded)
      if (Math.round(diffMinutes) === 5) {
        const msg = `Reminder: Your appointment with ${appt.doctorName} starts in 5 minutes at ${appt.time}!`;
        let exists = false;
        if (dbMode === 'MongoDB') {
          exists = await NotificationModel.findOne({ userId, message: msg });
        } else {
          exists = localDB.notifications && localDB.notifications.some(n => n.userId === userId && n.message === msg);
        }
        
        if (!exists) {
          await createNotification(userId, msg, 'reminder');
        }
      }
    }
  } catch (err) {
    console.error('Error generating reminders:', err);
  }
}

// JSON Database Helper Methods
const jsonGetUsers = () => localDB.users;
const jsonGetUserByEmail = (email) => localDB.users.find(u => u.email.toLowerCase() === email.toLowerCase());
const jsonGetUserById = (id) => localDB.users.find(u => u.id === id);
const jsonAddUser = (user) => {
  const newUser = { id: Date.now().toString(), ...user, createdAt: new Date().toISOString() };
  localDB.users.push(newUser);
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
  return newUser;
};
const jsonGetAppointments = () => localDB.appointments;
const jsonAddAppointment = (appt) => {
  const newAppt = { id: Date.now().toString(), ...appt, status: 'pending', createdAt: new Date().toISOString() };
  localDB.appointments.push(newAppt);
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
  return newAppt;
};
const jsonUpdateAppointment = (id, status, notes, prescription, heartRate, bloodPressure, weight, healthScore) => {
  const appt = localDB.appointments.find(a => a.id === id);
  if (appt) {
    appt.status = status;
    if (status === 'completed') {
      if (notes !== undefined) appt.notes = notes;
      if (prescription !== undefined) appt.prescription = prescription;
      if (heartRate !== undefined) appt.heartRate = heartRate;
      if (bloodPressure !== undefined) appt.bloodPressure = bloodPressure;
      if (weight !== undefined) appt.weight = weight;
      if (healthScore !== undefined) appt.healthScore = healthScore;
    }
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
    return appt;
  }
  return null;
};

const jsonGetInvoices = () => localDB.invoices || [];
const jsonAddInvoice = (inv) => {
  const newInv = { id: Date.now().toString(), ...inv, status: 'unpaid', createdAt: new Date().toISOString() };
  if (!localDB.invoices) localDB.invoices = [];
  localDB.invoices.push(newInv);
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
  return newInv;
};
const jsonPayInvoice = (id, paymentMethod) => {
  if (!localDB.invoices) return null;
  const inv = localDB.invoices.find(i => i.id === id);
  if (inv) {
    inv.status = 'paid';
    if (paymentMethod) inv.paymentMethod = paymentMethod;
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
    return inv;
  }
  return null;
};

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

/* --- API ROUTES --- */

// Register Patient
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailNorm = email.toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (dbMode === 'MongoDB') {
      const existingUser = await UserModel.findOne({ email: emailNorm });
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const newUser = new UserModel({
        name,
        email: emailNorm,
        password: hashedPassword,
        role: 'patient'
      });
      await newUser.save();

      const token = jwt.sign({ id: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({
        token,
        user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role }
      });
    } else {
      const existingUser = jsonGetUserByEmail(emailNorm);
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const newUser = jsonAddUser({
        name,
        email: emailNorm,
        password: hashedPassword,
        role: 'patient'
      });

      const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({
        token,
        user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailNorm = email.toLowerCase();

    if (dbMode === 'MongoDB') {
      const user = await UserModel.findOne({ email: emailNorm });
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, specialty: user.specialty }
      });
    } else {
      const user = jsonGetUserByEmail(emailNorm);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, specialty: user.specialty }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get current user details
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    if (dbMode === 'MongoDB') {
      const user = await UserModel.findById(req.user.id).select('-password');
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } else {
      const user = jsonGetUserById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List Doctors
app.get('/api/doctors', async (req, res) => {
  try {
    if (dbMode === 'MongoDB') {
      const doctors = await UserModel.find({ role: 'doctor' }).select('name email specialty');
      res.json(doctors);
    } else {
      const doctors = jsonGetUsers()
        .filter(u => u.role === 'doctor')
        .map(u => ({ id: u.id, name: u.name, email: u.email, specialty: u.specialty }));
      res.json(doctors);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching doctors' });
  }
});

// Get Doctor's Availability (Doctor Only)
app.get('/api/doctor/availability', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'Access denied. Doctor role required.' });
    }
    if (dbMode === 'MongoDB') {
      const doctor = await UserModel.findById(req.user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
      res.json(doctor.availability || []);
    } else {
      const doctor = jsonGetUserById(req.user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
      res.json(doctor.availability || []);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching availability' });
  }
});

// Add Doctor Availability Slot (Doctor Only)
app.post('/api/doctor/availability', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'Access denied. Doctor role required.' });
    }
    const { date, time } = req.body;
    if (!date || !time) {
      return res.status(400).json({ error: 'Date and time are required' });
    }

    if (dbMode === 'MongoDB') {
      const doctor = await UserModel.findById(req.user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
      
      const exists = doctor.availability.some(s => s.date === date && s.time === time);
      if (exists) return res.status(400).json({ error: 'This time slot already exists' });

      doctor.availability.push({ date, time, isBooked: false });
      await doctor.save();
      res.status(201).json(doctor.availability);
    } else {
      const doctor = jsonGetUserById(req.user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
      
      if (!doctor.availability) doctor.availability = [];
      const exists = doctor.availability.some(s => s.date === date && s.time === time);
      if (exists) return res.status(400).json({ error: 'This time slot already exists' });

      const newSlot = { id: Date.now().toString(), date, time, isBooked: false };
      doctor.availability.push(newSlot);
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      res.status(201).json(doctor.availability);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error adding availability slot' });
  }
});

// Delete Doctor Availability Slot (Doctor Only)
app.delete('/api/doctor/availability/:slotId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'Access denied. Doctor role required.' });
    }
    const { slotId } = req.params;

    if (dbMode === 'MongoDB') {
      const doctor = await UserModel.findById(req.user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

      const slot = doctor.availability.id(slotId);
      if (!slot) return res.status(404).json({ error: 'Slot not found' });
      if (slot.isBooked) return res.status(400).json({ error: 'Cannot delete a booked slot' });

      doctor.availability.pull(slotId);
      await doctor.save();
      res.json({ message: 'Slot deleted successfully', availability: doctor.availability });
    } else {
      const doctor = jsonGetUserById(req.user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

      const slotIdx = doctor.availability.findIndex(s => s.id === slotId || s._id === slotId);
      if (slotIdx === -1) return res.status(404).json({ error: 'Slot not found' });
      if (doctor.availability[slotIdx].isBooked) return res.status(400).json({ error: 'Cannot delete a booked slot' });

      doctor.availability.splice(slotIdx, 1);
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      res.json({ message: 'Slot deleted successfully', availability: doctor.availability });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error deleting availability slot' });
  }
});

// Get Specific Doctor Availability Slots (Patient/Public)
app.get('/api/doctors/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    if (dbMode === 'MongoDB') {
      const doctor = await UserModel.findById(id);
      if (!doctor || doctor.role !== 'doctor') {
        return res.status(404).json({ error: 'Doctor not found' });
      }
      res.json(doctor.availability || []);
    } else {
      const doctor = jsonGetUserById(id);
      if (!doctor || doctor.role !== 'doctor') {
        return res.status(404).json({ error: 'Doctor not found' });
      }
      res.json(doctor.availability || []);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching doctor availability' });
  }
});

// Get/List Appointments (Filtered by Auth user and role)
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { id, role } = req.user;

    if (dbMode === 'MongoDB') {
      let query = {};
      if (role === 'patient') {
        query = { patientId: id };
      } else if (role === 'doctor') {
        query = { doctorId: id };
      }
      // Admins and Receptionists see all appointments
      const appts = await AppointmentModel.find(query).sort({ date: 1, time: 1 });
      res.json(appts);
    } else {
      let appts = jsonGetAppointments();
      if (role === 'patient') {
        appts = appts.filter(a => a.patientId === id);
      } else if (role === 'doctor') {
        appts = appts.filter(a => a.doctorId === id);
      }
      // Sort: date ascending, time ascending
      appts.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      res.json(appts);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching appointments' });
  }
});

// Create Appointment
app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { doctorId, doctorName, date, time, reason } = req.body;
    if (!doctorId || !doctorName || !date || !time || !reason) {
      return res.status(400).json({ error: 'Missing required booking details' });
    }

    // Get Patient details from current auth context
    let patientName = '';
    const patientId = req.user.id;

    if (dbMode === 'MongoDB') {
      const patient = await UserModel.findById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient account not found' });
      patientName = patient.name;

      const doctor = await UserModel.findById(doctorId);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

      const slot = doctor.availability.find(s => s.date === date && s.time === time);
      if (!slot) {
        return res.status(400).json({ error: 'Selected time slot is not available for booking' });
      }
      if (slot.isBooked) {
        return res.status(400).json({ error: 'Selected time slot is already booked' });
      }
      slot.isBooked = true;
      await doctor.save();

      const newAppt = new AppointmentModel({
        patientId,
        patientName,
        doctorId,
        doctorName,
        date,
        time,
        reason,
        status: 'pending'
      });
      await newAppt.save();
      await createNotification(patientId, `Your appointment request with ${doctorName} is pending approval.`, 'info');
      res.status(201).json(newAppt);
    } else {
      const patient = jsonGetUserById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient account not found' });
      patientName = patient.name;

      const doctor = jsonGetUserById(doctorId);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

      if (!doctor.availability) doctor.availability = [];
      const slot = doctor.availability.find(s => s.date === date && s.time === time);
      if (!slot) {
        return res.status(400).json({ error: 'Selected time slot is not available for booking' });
      }
      if (slot.isBooked) {
        return res.status(400).json({ error: 'Selected time slot is already booked' });
      }
      slot.isBooked = true;
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));

      const newAppt = jsonAddAppointment({
        patientId,
        patientName,
        doctorId,
        doctorName,
        date,
        time,
        reason
      });
      await createNotification(patientId, `Your appointment request with ${doctorName} is pending approval.`, 'info');
      res.status(201).json(newAppt);
    }
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Server error booking appointment' });
  }
});

// Update Appointment Status
app.put('/api/appointments/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, prescription, heartRate, bloodPressure, weight, healthScore } = req.body;
    const userRole = req.user.role;

    if (!['pending', 'approved', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // Authorization constraints:
    // Patients can only cancel their own appointments
    // Doctors, Receptionists, Admins can approve/cancel/complete
    if (dbMode === 'MongoDB') {
      const appt = await AppointmentModel.findById(id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });

      if (userRole === 'patient') {
        if (appt.patientId !== req.user.id) {
          return res.status(403).json({ error: 'Unauthorized to modify this appointment' });
        }
        if (status !== 'cancelled') {
          return res.status(403).json({ error: 'Patients can only cancel appointments' });
        }
      }

      appt.status = status;
      if (status === 'completed') {
        if (notes !== undefined) appt.notes = notes;
        if (prescription !== undefined) appt.prescription = prescription;
        if (heartRate !== undefined) appt.heartRate = heartRate;
        if (bloodPressure !== undefined) appt.bloodPressure = bloodPressure;
        if (weight !== undefined) appt.weight = weight;
        if (healthScore !== undefined) appt.healthScore = healthScore;
      }
      await appt.save();

      // Free up slot if cancelled
      if (status === 'cancelled') {
        const doctor = await UserModel.findById(appt.doctorId);
        if (doctor) {
          const slot = doctor.availability.find(s => s.date === appt.date && s.time === appt.time);
          if (slot) {
            slot.isBooked = false;
            await doctor.save();
          }
        }
      }

      // Populate invoice with prescribed medicines
      if (status === 'completed' && prescription) {
        let invoice = await InvoiceModel.findOne({ appointmentId: id });
        const fee = getDoctorConsultationFee(appt.doctorName);
        if (!invoice) {
          invoice = new InvoiceModel({
            appointmentId: id,
            patientId: appt.patientId,
            patientName: appt.patientName,
            doctorName: appt.doctorName,
            consultationFee: fee,
            medicines: [],
            status: 'unpaid',
            paymentMethod: ''
          });
        }
        
        if (Array.isArray(prescription)) {
          invoice.medicines = prescription.map(p => {
            const unitPrice = getMedicinePresetPrice(p.medication);
            const qty = 1;
            return {
              medication: p.medication,
              unitPrice: unitPrice,
              quantity: qty,
              totalPrice: unitPrice * qty
            };
          });
        }
        
        const medTotal = invoice.medicines.reduce((sum, item) => sum + item.totalPrice, 0);
        invoice.subtotal = fee + medTotal;
        invoice.gstAmount = Math.round(invoice.subtotal * 0.18);
        invoice.amount = invoice.subtotal + invoice.gstAmount;
        await invoice.save();
      }

      // Auto-generate invoice when approved
      if (status === 'approved') {
        const existingInvoice = await InvoiceModel.findOne({ appointmentId: id });
        if (!existingInvoice) {
          const fee = getDoctorConsultationFee(appt.doctorName);
          const gst = Math.round(fee * 0.18);
          const grandTotal = fee + gst;
          const newInvoice = new InvoiceModel({
            appointmentId: id,
            patientId: appt.patientId,
            patientName: appt.patientName,
            doctorName: appt.doctorName,
            consultationFee: fee,
            medicines: [],
            subtotal: fee,
            gstAmount: gst,
            amount: grandTotal,
            status: 'unpaid',
            paymentMethod: ''
          });
          await newInvoice.save();
        }
      }
      
      if (status === 'approved') {
        await createNotification(appt.patientId, `Your appointment with ${appt.doctorName} on ${appt.date} at ${appt.time} has been approved.`, 'success');
      } else if (status === 'cancelled') {
        await createNotification(appt.patientId, `Your appointment with ${appt.doctorName} on ${appt.date} at ${appt.time} has been cancelled.`, 'warning');
      } else if (status === 'completed') {
        await createNotification(appt.patientId, `Your consultation with ${appt.doctorName} is completed. Prescription and invoice are available.`, 'success');
      }

      res.json(appt);
    } else {
      const appts = jsonGetAppointments();
      const appt = appts.find(a => a.id === id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });

      if (userRole === 'patient') {
        if (appt.patientId !== req.user.id) {
          return res.status(403).json({ error: 'Unauthorized to modify this appointment' });
        }
        if (status !== 'cancelled') {
          return res.status(403).json({ error: 'Patients can only cancel appointments' });
        }
      }

      const updated = jsonUpdateAppointment(id, status, notes, prescription, heartRate, bloodPressure, weight, healthScore);

      // Free up slot if cancelled
      if (status === 'cancelled') {
        const doctor = jsonGetUserById(appt.doctorId);
        if (doctor && doctor.availability) {
          const slot = doctor.availability.find(s => s.date === appt.date && s.time === appt.time);
          if (slot) {
            slot.isBooked = false;
            fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
          }
        }
      }

      // Populate invoice with prescribed medicines
      if (status === 'completed' && prescription) {
        if (!localDB.invoices) localDB.invoices = [];
        let invoice = localDB.invoices.find(i => i.appointmentId === id);
        const fee = getDoctorConsultationFee(updated.doctorName);
        if (!invoice) {
          invoice = {
            id: Date.now().toString(),
            appointmentId: id,
            patientId: updated.patientId,
            patientName: updated.patientName,
            doctorName: updated.doctorName,
            consultationFee: fee,
            medicines: [],
            status: 'unpaid',
            paymentMethod: '',
            createdAt: new Date().toISOString()
          };
          localDB.invoices.push(invoice);
        }

        if (Array.isArray(prescription)) {
          invoice.medicines = prescription.map(p => {
            const unitPrice = getMedicinePresetPrice(p.medication);
            const qty = 1;
            return {
              medication: p.medication,
              unitPrice: unitPrice,
              quantity: qty,
              totalPrice: unitPrice * qty
            };
          });
        }

        const medTotal = invoice.medicines.reduce((sum, item) => sum + item.totalPrice, 0);
        invoice.subtotal = fee + medTotal;
        invoice.gstAmount = Math.round(invoice.subtotal * 0.18);
        invoice.amount = invoice.subtotal + invoice.gstAmount;
        
        fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      }

      // Auto-generate invoice when approved
      if (status === 'approved') {
        if (!localDB.invoices) localDB.invoices = [];
        const existingInvoice = localDB.invoices.find(i => i.appointmentId === id);
        if (!existingInvoice) {
          const fee = getDoctorConsultationFee(appt.doctorName);
          const gst = Math.round(fee * 0.18);
          const grandTotal = fee + gst;
          jsonAddInvoice({
            appointmentId: id,
            patientId: appt.patientId,
            patientName: appt.patientName,
            doctorName: appt.doctorName,
            consultationFee: fee,
            medicines: [],
            subtotal: fee,
            gstAmount: gst,
            amount: grandTotal,
            paymentMethod: ''
          });
        }
      }
      
      if (status === 'approved') {
        await createNotification(updated.patientId, `Your appointment with ${updated.doctorName} on ${updated.date} at ${updated.time} has been approved.`, 'success');
      } else if (status === 'cancelled') {
        await createNotification(updated.patientId, `Your appointment with ${updated.doctorName} on ${updated.date} at ${updated.time} has been cancelled.`, 'warning');
      } else if (status === 'completed') {
        await createNotification(updated.patientId, `Your consultation with ${updated.doctorName} is completed. Prescription and invoice are available.`, 'success');
      }

      res.json(updated);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error updating status' });
  }
});

// Get User Notifications (and auto generate reminders)
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await generateAppointmentReminders(userId);
    
    let notifs = [];
    if (dbMode === 'MongoDB') {
      notifs = await NotificationModel.find({ userId }).sort({ createdAt: -1 });
    } else {
      if (!localDB.notifications) localDB.notifications = [];
      notifs = localDB.notifications
        .filter(n => n.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    res.json(notifs);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Server error fetching notifications' });
  }
});

// Mark all notifications as read
app.post('/api/notifications/read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    if (dbMode === 'MongoDB') {
      await NotificationModel.updateMany({ userId }, { read: true });
    } else {
      if (localDB.notifications) {
        localDB.notifications.forEach(n => {
          if (n.userId === userId) n.read = true;
        });
        fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error reading notifications:', error);
    res.status(500).json({ error: 'Server error updating notifications' });
  }
});

const chatbotSessions = {};

// AI Chatbot Symptoms Analysis
app.post('/api/chatbot', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Please enter a message' });
    }

    const text = message.toLowerCase();
    let specialty = 'General Practice';
    
    if (text.includes('heart') || text.includes('chest') || text.includes('cardio') || text.includes('bpm') || text.includes('breath')) {
      specialty = 'Cardiology';
    } else if (text.includes('child') || text.includes('kid') || text.includes('baby') || text.includes('infant') || text.includes('pediatric') || text.includes('son') || text.includes('daughter')) {
      specialty = 'Pediatrics';
    } else if (text.includes('headache') || text.includes('brain') || text.includes('neuro') || text.includes('migraine') || text.includes('seizure') || text.includes('spine')) {
      specialty = 'Neurology';
    } else if (text.includes('rash') || text.includes('skin') || text.includes('itch') || text.includes('dermatology') || text.includes('acne') || text.includes('pimples')) {
      specialty = 'Dermatology';
    }

    // Find doctor with matching specialty
    let doctor = null;
    if (dbMode === 'MongoDB') {
      doctor = await UserModel.findOne({ role: 'doctor', specialty });
      if (!doctor) doctor = await UserModel.findOne({ role: 'doctor' });
    } else {
      doctor = (localDB.users || []).find(u => u.role === 'doctor' && u.specialty === specialty);
      if (!doctor) doctor = (localDB.users || []).find(u => u.role === 'doctor');
    }

    if (!doctor) {
      return res.json({
        reply: `Based on your symptoms, I suggest consulting a specialist in **${specialty}**. However, there are no doctors currently available in our system.`
      });
    }

    // Fetch availability slots
    const slots = (doctor.availability || []).filter(s => !s.isBooked);

    if (slots.length === 0) {
      return res.json({
        reply: `Analyzing symptoms: **${message}**.<br><br>This indicates potential issues related to **${specialty}**. I recommend a checkup with **${doctor.name}**.<br><br>Unfortunately, Dr. ${doctor.name.split(' ').pop()} has no free availability slots right now. Please try again later or look for another practitioner.`
      });
    }

    // Store doctor context in chatbotSessions
    chatbotSessions[req.user.id] = {
      doctorId: doctor.id || doctor._id.toString(),
      doctorName: doctor.name,
      symptoms: message
    };

    const options = slots.map(s => ({
      slotId: s.id || s._id ? (s.id || s._id).toString() : `${s.date}_${s.time}`,
      label: `${s.date} at ${s.time}`
    }));

    res.json({
      reply: `Analyzing symptoms: **${message}**.<br><br>This indicates a potential issue related to **${specialty}**. I highly recommend consulting with **${doctor.name}**.<br><br>Please select one of their available slots to schedule a consultation:`,
      options
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: 'Server error processing chatbot query' });
  }
});

// Chatbot select slot
app.post('/api/chatbot/select-slot', authenticateToken, async (req, res) => {
  try {
    const { slotId } = req.body;
    const session = chatbotSessions[req.user.id];
    
    if (!session) {
      return res.status(400).json({ error: 'Session expired. Please describe your symptoms again.' });
    }

    let doctor = null;
    if (dbMode === 'MongoDB') {
      doctor = await UserModel.findById(session.doctorId);
    } else {
      doctor = (localDB.users || []).find(u => u.id === session.doctorId);
    }

    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const slot = doctor.availability.find(s => 
      (s.id && s.id.toString() === slotId) || 
      (s._id && s._id.toString() === slotId) ||
      (`${s.date}_${s.time}` === slotId)
    );

    if (!slot || slot.isBooked) {
      return res.status(400).json({ error: 'Selected slot is no longer available' });
    }

    session.slot = slot;

    res.json({
      reply: `You have selected **${slot.date} at ${slot.time}** with **${doctor.name}**.<br><br>Shall I confirm this appointment booking for you?`,
      confirmAction: true
    });
  } catch (error) {
    console.error('Select slot error:', error);
    res.status(500).json({ error: 'Server error selecting slot' });
  }
});

// Chatbot confirm booking
app.post('/api/chatbot/confirm', authenticateToken, async (req, res) => {
  try {
    const session = chatbotSessions[req.user.id];
    if (!session || !session.slot) {
      return res.status(400).json({ error: 'No active slot selection found' });
    }

    const { doctorId, doctorName, slot, symptoms } = session;
    const patientId = req.user.id;
    let patientName = '';

    if (dbMode === 'MongoDB') {
      const patient = await UserModel.findById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient account not found' });
      patientName = patient.name;

      const doctor = await UserModel.findById(doctorId);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

      const dSlot = doctor.availability.find(s => s.date === slot.date && s.time === slot.time);
      if (!dSlot || dSlot.isBooked) {
        return res.status(400).json({ error: 'Slot is already booked' });
      }
      dSlot.isBooked = true;
      await doctor.save();

      const newAppt = new AppointmentModel({
        patientId,
        patientName,
        doctorId,
        doctorName,
        date: slot.date,
        time: slot.time,
        reason: `AI Assist: ${symptoms}`,
        status: 'pending'
      });
      await newAppt.save();
      await createNotification(patientId, `Your appointment request with ${doctorName} is pending approval.`, 'info');
    } else {
      const patient = jsonGetUserById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient account not found' });
      patientName = patient.name;

      const doctor = jsonGetUserById(doctorId);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

      const dSlot = doctor.availability.find(s => s.date === slot.date && s.time === slot.time);
      if (!dSlot || dSlot.isBooked) {
        return res.status(400).json({ error: 'Slot is already booked' });
      }
      dSlot.isBooked = true;
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));

      jsonAddAppointment({
        patientId,
        patientName,
        doctorId,
        doctorName,
        date: slot.date,
        time: slot.time,
        reason: `AI Assist: ${symptoms}`
      });
      await createNotification(patientId, `Your appointment request with ${doctorName} is pending approval.`, 'info');
    }

    delete chatbotSessions[req.user.id];

    res.json({
      reply: `🎉 **Appointment Booked Successfully!**<br><br>I have scheduled a consultation for you with **${doctorName}** on **${slot.date} at ${slot.time}**.<br><br>The appointment is currently pending confirmation from staff.`
    });
  } catch (error) {
    console.error('Chatbot confirm error:', error);
    res.status(500).json({ error: 'Server error booking appointment' });
  }
});

// Admin System Stats
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (dbMode === 'MongoDB') {
      const totalPatients = await UserModel.countDocuments({ role: 'patient' });
      const totalDoctors = await UserModel.countDocuments({ role: 'doctor' });
      const totalStaff = await UserModel.countDocuments({ role: 'receptionist' });
      const totalAppointments = await AppointmentModel.countDocuments();
      const pendingAppointments = await AppointmentModel.countDocuments({ status: 'pending' });

      const invoices = await InvoiceModel.find();
      const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
      const pendingCollection = invoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + i.amount, 0);

      // Fetch recent activities
      const recentUsers = await UserModel.find().sort({ createdAt: -1 }).limit(5);
      const recentAppts = await AppointmentModel.find().sort({ createdAt: -1 }).limit(5);
      const recentInvoices = await InvoiceModel.find().sort({ createdAt: -1 }).limit(5);

      const activities = [];
      recentUsers.forEach(u => {
        activities.push({
          type: 'user',
          message: `New user registration: **${u.name}** registered as a **${u.role}**.`,
          time: u.createdAt
        });
      });
      recentAppts.forEach(a => {
        activities.push({
          type: 'appointment',
          message: `Appointment updated/created: **${a.patientName}** with **${a.doctorName}** - Status: **${a.status}**.`,
          time: a.createdAt || new Date(a.date)
        });
      });
      recentInvoices.forEach(i => {
        activities.push({
          type: 'invoice',
          message: `Invoice generated for **${i.patientName}** - Amount: **₹${i.amount}** (${i.status.toUpperCase()}).`,
          time: i.createdAt || new Date()
        });
      });

      activities.sort((a, b) => new Date(b.time) - new Date(a.time));

      res.json({
        totalPatients,
        totalDoctors,
        totalStaff,
        totalAppointments,
        pendingAppointments,
        totalRevenue,
        pendingCollection,
        recentActivities: activities.slice(0, 10),
        dbMode
      });
    } else {
      const users = jsonGetUsers();
      const appts = jsonGetAppointments();
      const invoices = localDB.invoices || [];
      const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
      const pendingCollection = invoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + i.amount, 0);

      // Slice recent items
      const recentUsers = [...users].sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
      const recentAppts = [...appts].sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
      const recentInvoices = [...invoices].sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

      const activities = [];
      recentUsers.forEach(u => {
        activities.push({
          type: 'user',
          message: `New user registration: **${u.name}** registered as a **${u.role}**.`,
          time: u.createdAt || new Date()
        });
      });
      recentAppts.forEach(a => {
        activities.push({
          type: 'appointment',
          message: `Appointment updated/created: **${a.patientName}** with **${a.doctorName}** - Status: **${a.status}**.`,
          time: a.createdAt || new Date(a.date)
        });
      });
      recentInvoices.forEach(i => {
        activities.push({
          type: 'invoice',
          message: `Invoice generated for **${i.patientName}** - Amount: **₹${i.amount}** (${i.status.toUpperCase()}).`,
          time: i.createdAt || new Date()
        });
      });

      activities.sort((a, b) => new Date(b.time) - new Date(a.time));

      res.json({
        totalPatients: users.filter(u => u.role === 'patient').length,
        totalDoctors: users.filter(u => u.role === 'doctor').length,
        totalStaff: users.filter(u => u.role === 'receptionist').length,
        totalAppointments: appts.length,
        pendingAppointments: appts.filter(a => a.status === 'pending').length,
        totalRevenue,
        pendingCollection,
        recentActivities: activities.slice(0, 10),
        dbMode
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching statistics' });
  }
});

// List Invoices
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const { id, role } = req.user;
    if (dbMode === 'MongoDB') {
      let query = {};
      if (role === 'patient') {
        query = { patientId: id };
      }
      const invoices = await InvoiceModel.find(query).sort({ createdAt: -1 });
      res.json(invoices);
    } else {
      let invoices = localDB.invoices || [];
      if (role === 'patient') {
        invoices = invoices.filter(i => i.patientId === id);
      }
      invoices = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json(invoices);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching invoices' });
  }
});

// Pay Invoice
app.post('/api/invoices/:id/pay', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod } = req.body;
    if (dbMode === 'MongoDB') {
      const invoice = await InvoiceModel.findById(id);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      invoice.status = 'paid';
      if (paymentMethod) invoice.paymentMethod = paymentMethod;
      await invoice.save();
      res.json(invoice);
    } else {
      const updated = jsonPayInvoice(id, paymentMethod);
      if (!updated) return res.status(404).json({ error: 'Invoice not found' });
      res.json(updated);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error paying invoice' });
  }
});

// Create Invoice (Receptionist/Admin)
app.post('/api/invoices', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'receptionist' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only receptionist or admin can issue invoices' });
    }

    const { patientId, patientName, doctorName, consultationFee, medicines, subtotal, gstAmount, amount, status, paymentMethod } = req.body;

    if (!patientId || !patientName || !doctorName || amount === undefined) {
      return res.status(400).json({ error: 'Missing required invoice details' });
    }

    if (dbMode === 'MongoDB') {
      const newInvoice = new InvoiceModel({
        patientId,
        patientName,
        doctorName,
        consultationFee: consultationFee || 0,
        medicines: medicines || [],
        subtotal: subtotal || 0,
        gstAmount: gstAmount || 0,
        amount,
        status: status || 'unpaid',
        paymentMethod: paymentMethod || ''
      });
      await newInvoice.save();
      res.status(201).json(newInvoice);
    } else {
      const newInvoice = jsonAddInvoice({
        patientId,
        patientName,
        doctorName,
        consultationFee: consultationFee || 0,
        medicines: medicines || [],
        subtotal: subtotal || 0,
        gstAmount: gstAmount || 0,
        amount,
        status: status || 'unpaid',
        paymentMethod: paymentMethod || ''
      });
      res.status(201).json(newInvoice);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error creating invoice' });
  }
});

// List Patients (Receptionist/Admin access)
app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'receptionist' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (dbMode === 'MongoDB') {
      const patients = await UserModel.find({ role: 'patient' }).select('-password');
      res.json(patients);
    } else {
      const patients = jsonGetUsers().filter(u => u.role === 'patient');
      const sanitized = patients.map(({ password, ...p }) => p);
      res.json(sanitized);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching patients' });
  }
});

// Admin User Management - List Users
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (dbMode === 'MongoDB') {
      const users = await UserModel.find().select('-password').sort({ createdAt: -1 });
      res.json(users);
    } else {
      const usersWithoutPassword = jsonGetUsers().map(({ password, ...u }) => u);
      usersWithoutPassword.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json(usersWithoutPassword);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin User Management - Create Staff User
app.post('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, email, password, role, specialty } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required user details' });
    }

    if (!['doctor', 'receptionist', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid staff role' });
    }

    const emailNorm = email.toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (dbMode === 'MongoDB') {
      const existingUser = await UserModel.findOne({ email: emailNorm });
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const newStaff = new UserModel({
        name,
        email: emailNorm,
        password: hashedPassword,
        role,
        specialty: role === 'doctor' ? specialty : undefined
      });
      await newStaff.save();
      const { password: _, ...savedUser } = newStaff.toObject();
      res.status(201).json(savedUser);
    } else {
      const existingUser = jsonGetUserByEmail(emailNorm);
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const newStaff = jsonAddUser({
        name,
        email: emailNorm,
        password: hashedPassword,
        role,
        specialty: role === 'doctor' ? specialty : undefined
      });
      const { password: _, ...savedUser } = newStaff;
      res.status(201).json(savedUser);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error creating staff account' });
  }
});

// Admin User Management - Update User (Edit, Suspend/Activate, Approve Registration)
app.put('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { name, email, role, specialty, status, fees, workingHours, isApproved } = req.body;

    if (dbMode === 'MongoDB') {
      const user = await UserModel.findById(id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (name !== undefined) user.name = name;
      if (email !== undefined) user.email = email.toLowerCase();
      if (role !== undefined) user.role = role;
      if (specialty !== undefined) user.specialty = specialty;
      if (status !== undefined) user.status = status; // 'active' | 'suspended'
      if (fees !== undefined) user.fees = fees;
      if (workingHours !== undefined) user.workingHours = workingHours;
      if (isApproved !== undefined) user.isApproved = isApproved;

      await user.save();
      const { password: _, ...updatedUser } = user.toObject();
      res.json(updatedUser);
    } else {
      const user = (localDB.users || []).find(u => u.id === id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (name !== undefined) user.name = name;
      if (email !== undefined) user.email = email.toLowerCase();
      if (role !== undefined) user.role = role;
      if (specialty !== undefined) user.specialty = specialty;
      if (status !== undefined) user.status = status;
      if (fees !== undefined) user.fees = fees;
      if (workingHours !== undefined) user.workingHours = workingHours;
      if (isApproved !== undefined) user.isApproved = isApproved;

      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      const { password: _, ...updatedUser } = user;
      res.json(updatedUser);
    }
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Server error updating user profile' });
  }
});

// Admin User Management - Delete User
app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    if (dbMode === 'MongoDB') {
      const deleted = await UserModel.findByIdAndDelete(id);
      if (!deleted) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, message: 'User removed successfully' });
    } else {
      const index = (localDB.users || []).findIndex(u => u.id === id);
      if (index === -1) return res.status(404).json({ error: 'User not found' });
      localDB.users.splice(index, 1);
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      res.json({ success: true, message: 'User removed successfully' });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error removing user' });
  }
});

// Medical Records: Upload report/document to appointment
app.post('/api/appointments/:id/reports', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, fileContent } = req.body;

    if (!name || !fileContent) {
      return res.status(400).json({ error: 'Report name and content are required' });
    }

    const newReport = {
      name,
      fileContent,
      dateUploaded: new Date().toISOString().split('T')[0],
      verified: false
    };

    if (dbMode === 'MongoDB') {
      const appt = await AppointmentModel.findById(id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });
      
      appt.reports.push(newReport);
      await appt.save();
      res.json(appt.reports[appt.reports.length - 1]);
    } else {
      const appt = localDB.appointments.find(a => a.id === id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });
      
      if (!appt.reports) appt.reports = [];
      const reportId = Date.now().toString();
      const finalReport = { id: reportId, ...newReport };
      appt.reports.push(finalReport);
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      res.json(finalReport);
    }
  } catch (error) {
    console.error('Error uploading report:', error);
    res.status(500).json({ error: 'Server error uploading report' });
  }
});

// Medical Records: Verify report/document
app.put('/api/appointments/:id/reports/:reportId/verify', authenticateToken, async (req, res) => {
  try {
    const { id, reportId } = req.params;
    if (!['admin', 'doctor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized to verify medical records' });
    }

    if (dbMode === 'MongoDB') {
      const appt = await AppointmentModel.findById(id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });
      
      const report = appt.reports.id(reportId);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      
      report.verified = true;
      await appt.save();
      res.json(report);
    } else {
      const appt = localDB.appointments.find(a => a.id === id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });
      
      const report = (appt.reports || []).find(r => r.id === reportId);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      
      report.verified = true;
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      res.json(report);
    }
  } catch (error) {
    console.error('Error verifying report:', error);
    res.status(500).json({ error: 'Server error verifying report' });
  }
});

// Medical Records: Delete report/document
app.delete('/api/appointments/:id/reports/:reportId', authenticateToken, async (req, res) => {
  try {
    const { id, reportId } = req.params;
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required to delete reports' });
    }

    if (dbMode === 'MongoDB') {
      const appt = await AppointmentModel.findById(id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });
      
      const report = appt.reports.id(reportId);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      
      report.remove();
      await appt.save();
      res.json({ success: true, message: 'Report removed' });
    } else {
      const appt = localDB.appointments.find(a => a.id === id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });
      
      const index = (appt.reports || []).findIndex(r => r.id === reportId);
      if (index === -1) return res.status(404).json({ error: 'Report not found' });
      
      appt.reports.splice(index, 1);
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      res.json({ success: true, message: 'Report removed' });
    }
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Server error deleting report' });
  }
});

// Fallback all other routes to index.html (supporting client-side SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`Smart Healthcare System running on port ${PORT}`);
  console.log(`Backend Mode: Database is running on ${dbMode} fallback`);
  console.log(`Frontend served at http://localhost:${PORT}`);
  console.log('==================================================');
});
