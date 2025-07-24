// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    signInWithCustomToken,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    addDoc,
    query, 
    where, 
    getDocs,
    updateDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    setLogLevel
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION ---
// IMPORTANT: These variables are placeholders and will be populated by the environment.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-appointment-app';

// --- FIREBASE INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setLogLevel('debug'); // Enable detailed logging for debugging permissions

// --- DATABASE PATH BUILDERS ---
// This ensures all data is stored in paths compliant with the environment's security rules.
const getUsersCollectionPath = () => `artifacts/${appId}/public/data/users`;
const getSchedulesCollectionPath = () => `artifacts/${appId}/public/data/schedules`;
const getAppointmentsCollectionPath = () => `artifacts/${appId}/public/data/appointments`;

// --- GLOBAL STATE ---
let currentUser = null;
let currentUserRole = null;
let unsubscribeListeners = [];

// --- DOM ELEMENTS ---
const dom = {
    loadingSpinner: document.getElementById('loading-spinner'),
    authView: document.getElementById('auth-view'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    authError: document.getElementById('auth-error'),
    userInfo: document.getElementById('user-info'),
    userEmail: document.getElementById('user-email'),
    logoutBtn: document.getElementById('logout-btn'),
    
    adminDashboard: document.getElementById('admin-dashboard'),
    teacherDashboard: document.getElementById('teacher-dashboard'),
    studentDashboard: document.getElementById('student-dashboard'),
    pendingApprovalView: document.getElementById('pending-approval-view'),

    // Admin
    pendingStudentsList: document.getElementById('pending-students-list'),
    teachersListAdmin: document.getElementById('teachers-list-admin'),
    addTeacherBtn: document.getElementById('add-teacher-btn'),
    teacherModal: document.getElementById('teacher-modal'),
    teacherModalTitle: document.getElementById('teacher-modal-title'),
    teacherForm: document.getElementById('teacher-form'),
    cancelTeacherModal: document.getElementById('cancel-teacher-modal'),
    teacherIdInput: document.getElementById('teacher-id'),
    teacherNameInput: document.getElementById('teacher-name'),
    teacherEmailInput: document.getElementById('teacher-email'),
    teacherPasswordInput: document.getElementById('teacher-password'),
    teacherDepartmentInput: document.getElementById('teacher-department'),
    teacherSubjectInput: document.getElementById('teacher-subject'),

    // Teacher
    scheduleForm: document.getElementById('schedule-form'),
    teacherScheduleList: document.getElementById('teacher-schedule-list'),
    teacherAppointmentsList: document.getElementById('teacher-appointments-list'),

    // Student
    teacherSearch: document.getElementById('teacher-search'),
    teachersListStudent: document.getElementById('teachers-list-student'),
    studentAppointmentsList: document.getElementById('student-appointments-list'),
    bookingModal: document.getElementById('booking-modal'),
    bookingForm: document.getElementById('booking-form'),
    bookingTeacherName: document.getElementById('booking-teacher-name'),
    bookingTeacherId: document.getElementById('booking-teacher-id'),
    bookingTimeSlot: document.getElementById('booking-time-slot'),
    bookingMessage: document.getElementById('booking-message'),
    cancelBookingModal: document.getElementById('cancel-booking-modal'),
    
    // Alert Modal
    alertModal: document.getElementById('alert-modal'),
    alertIcon: document.getElementById('alert-icon'),
    alertTitle: document.getElementById('alert-title'),
    alertMessage: document.getElementById('alert-message'),
    alertOkBtn: document.getElementById('alert-ok-btn'),
};

// --- UTILITY FUNCTIONS ---
const showLoading = (show) => {
    dom.loadingSpinner.classList.toggle('hidden', !show);
};

const showAlert = (title, message, isSuccess = true) => {
    dom.alertTitle.textContent = title;
    dom.alertMessage.textContent = message;
    
    const iconContainer = dom.alertIcon;
    if (isSuccess) {
        iconContainer.className = 'mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4';
        iconContainer.innerHTML = `<i class="fas fa-check text-green-600"></i>`;
        dom.alertOkBtn.className = 'w-full btn-primary py-2 px-4 rounded-md font-semibold';
    } else {
        iconContainer.className = 'mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4';
        iconContainer.innerHTML = `<i class="fas fa-times text-red-600"></i>`;
        dom.alertOkBtn.className = 'w-full btn-danger py-2 px-4 rounded-md font-semibold';
    }
    
    dom.alertModal.classList.remove('hidden');
};

const hideAllViews = () => {
    dom.authView.classList.add('hidden');
    dom.adminDashboard.classList.add('hidden');
    dom.teacherDashboard.classList.add('hidden');
    dom.studentDashboard.classList.add('hidden');
    dom.pendingApprovalView.classList.add('hidden');
};

const clearAllLists = () => {
    dom.pendingStudentsList.innerHTML = '';
    dom.teachersListAdmin.innerHTML = '';
    dom.teacherScheduleList.innerHTML = '';
    dom.teacherAppointmentsList.innerHTML = '';
    dom.teachersListStudent.innerHTML = '';
    dom.studentAppointmentsList.innerHTML = '';
};

const cleanupListeners = () => {
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
    console.log("Cleaned up all Firestore listeners.");
};

// --- AUTHENTICATION LOGIC ---
const initAuth = async () => {
     console.log("Initializing authentication...");
     showLoading(true);
     try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            console.log("Attempting to sign in with custom token.");
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            console.log("No custom token found, user needs to sign in manually or is anonymous.");
        }
     } catch (error) {
         console.error("Error signing in with custom token:", error);
         await signInAnonymously(auth);
     }

    onAuthStateChanged(auth, async (user) => {
        cleanupListeners();
        clearAllLists();
        
        if (user && !user.isAnonymous) {
            console.log(`User logged in: ${user.email} (UID: ${user.uid})`);
            currentUser = user;
            dom.userEmail.textContent = user.email;
            dom.userInfo.classList.remove('hidden');
            
            const userDocRef = doc(db, getUsersCollectionPath(), user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                currentUserRole = userData.role;
                console.log(`User role is: ${currentUserRole}`);
                hideAllViews();

                if (userData.role === 'student' && userData.status === 'pending') {
                    dom.pendingApprovalView.classList.remove('hidden');
                } else {
                    loadDashboard(userData.role);
                }
            } else {
                console.log("User document not found for UID:", user.uid, "at path:", userDocRef.path, ". This can happen after registration before the doc is created, or if the user was deleted.");
            }
        } else {
            console.log("User logged out or is anonymous.");
            currentUser = null;
            currentUserRole = null;
            hideAllViews();
            dom.authView.classList.remove('hidden');
            dom.userInfo.classList.add('hidden');
        }
        showLoading(false);
    });
};

// --- DASHBOARD LOADING & FUNCTIONALITY ---
// All the functions from the previous script remain the same here.
// loadDashboard, loadAdminData, renderPendingStudent, etc.

const loadDashboard = (role) => {
    hideAllViews();
    switch (role) {
        case 'admin':
            dom.adminDashboard.classList.remove('hidden');
            loadAdminData();
            break;
        case 'teacher':
            dom.teacherDashboard.classList.remove('hidden');
            loadTeacherData();
            break;
        case 'student':
            dom.studentDashboard.classList.remove('hidden');
            loadStudentData();
            break;
    }
};

// --- ADMIN FUNCTIONALITY ---
const loadAdminData = () => {
    console.log("Loading Admin Dashboard data.");
    const usersCollection = collection(db, getUsersCollectionPath());

    const pendingStudentsQuery = query(usersCollection, where("role", "==", "student"), where("status", "==", "pending"));
    const unsubPending = onSnapshot(pendingStudentsQuery, (snapshot) => {
        dom.pendingStudentsList.innerHTML = '';
        if (snapshot.empty) {
            dom.pendingStudentsList.innerHTML = `<p class="text-slate-500 text-sm">No pending student registrations.</p>`;
        } else {
            snapshot.forEach(doc => renderPendingStudent(doc.id, doc.data()));
        }
    }, err => console.error("Error fetching pending students:", err));
    unsubscribeListeners.push(unsubPending);

    const teachersQuery = query(usersCollection, where("role", "==", "teacher"));
    const unsubTeachers = onSnapshot(teachersQuery, (snapshot) => {
        dom.teachersListAdmin.innerHTML = '';
         if (snapshot.empty) {
            dom.teachersListAdmin.innerHTML = `<p class="text-slate-500 text-sm">No teachers found.</p>`;
        } else {
            snapshot.forEach(doc => renderTeacherAdmin(doc.id, doc.data()));
        }
    }, err => console.error("Error fetching teachers:", err));
    unsubscribeListeners.push(unsubTeachers);
};

const renderPendingStudent = (id, data) => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between bg-slate-50 p-3 rounded-md';
    div.innerHTML = `<div><p class="font-semibold">${data.name}</p><p class="text-sm text-slate-600">${data.email}</p></div><button data-id="${id}" class="approve-student-btn btn-primary px-3 py-1 rounded-md text-sm">Approve</button>`;
    dom.pendingStudentsList.appendChild(div);
};

const renderTeacherAdmin = (id, data) => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between bg-slate-50 p-3 rounded-md';
    div.innerHTML = `<div><p class="font-semibold">${data.name}</p><p class="text-sm text-slate-600">${data.department} - ${data.subject}</p></div><div class="space-x-2"><button data-id="${id}" class="delete-teacher-btn btn-danger px-2 py-1 rounded-md text-xs"><i class="fas fa-trash"></i></button></div>`;
    dom.teachersListAdmin.appendChild(div);
};


// --- TEACHER FUNCTIONALITY ---
const loadTeacherData = () => {
    console.log("Loading Teacher Dashboard data.");
    const teacherId = currentUser.uid;

    const scheduleDocRef = doc(db, getSchedulesCollectionPath(), teacherId);
    const unsubSchedule = onSnapshot(scheduleDocRef, (doc) => {
        dom.teacherScheduleList.innerHTML = '';
        if (doc.exists() && doc.data().slots) {
            doc.data().slots.sort().forEach(slot => renderTeacherSchedule(slot));
        } else {
            dom.teacherScheduleList.innerHTML = `<p class="text-slate-500 text-sm">You have no available slots.</p>`;
        }
    }, err => console.error("Error fetching schedule:", err));
    unsubscribeListeners.push(unsubSchedule);

    const appointmentsQuery = query(collection(db, getAppointmentsCollectionPath()), where("teacherId", "==", teacherId));
    const unsubAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
        dom.teacherAppointmentsList.innerHTML = '';
        if (snapshot.empty) {
            dom.teacherAppointmentsList.innerHTML = `<p class="text-slate-500 text-sm">You have no appointments.</p>`;
        } else {
            snapshot.docs.sort((a,b) => new Date(a.data().appointmentTime) - new Date(b.data().appointmentTime)).forEach(doc => renderTeacherAppointment(doc.id, doc.data()));
        }
    }, err => console.error("Error fetching teacher appointments:", err));
    unsubscribeListeners.push(unsubAppointments);
};

const renderTeacherSchedule = (slot) => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between bg-slate-50 p-2 rounded-md';
    div.innerHTML = `<p class="text-sm">${new Date(slot).toLocaleString()}</p><button data-slot="${slot}" class="delete-slot-btn text-red-500 hover:text-red-700 text-xs"><i class="fas fa-times-circle"></i></button>`;
    dom.teacherScheduleList.appendChild(div);
};
        
const renderTeacherAppointment = (id, data) => {
    const div = document.createElement('div');
    div.className = 'p-4 border border-slate-200 rounded-lg';
    let statusClass = '';
    switch(data.status) {
        case 'booked': statusClass = 'bg-yellow-100 text-yellow-800'; break;
        case 'approved': statusClass = 'bg-green-100 text-green-800'; break;
        case 'cancelled': statusClass = 'bg-red-100 text-red-800'; break;
    }
    div.innerHTML = `<div class="flex justify-between items-start"><div><p class="font-bold">${data.studentName}</p><p class="text-sm text-slate-600">${new Date(data.appointmentTime).toLocaleString()}</p></div><span class="text-xs font-semibold px-2 py-1 rounded-full ${statusClass}">${data.status}</span></div><p class="text-sm mt-2 bg-slate-50 p-2 rounded-md"><strong>Message:</strong> ${data.message}</p>${data.status === 'booked' ? `<div class="mt-3 flex space-x-2"><button data-id="${id}" class="approve-appointment-btn flex-1 btn-primary text-sm py-1 px-2 rounded-md">Approve</button><button data-id="${id}" class="cancel-appointment-btn flex-1 btn-danger text-sm py-1 px-2 rounded-md">Cancel</button></div>` : ''}`;
    dom.teacherAppointmentsList.appendChild(div);
};

// --- STUDENT FUNCTIONALITY ---
let allTeachers = [];
const loadStudentData = () => {
    console.log("Loading Student Dashboard data.");
    const teachersQuery = query(collection(db, getUsersCollectionPath()), where("role", "==", "teacher"));
    const unsubTeachers = onSnapshot(teachersQuery, (snapshot) => {
        allTeachers = [];
        snapshot.forEach(doc => allTeachers.push({ id: doc.id, ...doc.data() }));
        renderStudentTeachersList();
    }, err => console.error("Error fetching teachers for student:", err));
    unsubscribeListeners.push(unsubTeachers);

    const appointmentsQuery = query(collection(db, getAppointmentsCollectionPath()), where("studentId", "==", currentUser.uid));
    const unsubAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
        dom.studentAppointmentsList.innerHTML = '';
        if (snapshot.empty) {
            dom.studentAppointmentsList.innerHTML = `<p class="text-slate-500 text-sm">You have no booked appointments.</p>`;
        } else {
            snapshot.docs.sort((a,b) => new Date(a.data().appointmentTime) - new Date(b.data().appointmentTime)).forEach(doc => renderStudentAppointment(doc.id, doc.data()));
        }
    }, err => console.error("Error fetching student appointments:", err));
    unsubscribeListeners.push(unsubAppointments);
};

const renderStudentTeachersList = () => {
    dom.teachersListStudent.innerHTML = '';
    const searchTerm = dom.teacherSearch.value.toLowerCase();
    const filteredTeachers = allTeachers.filter(t => t.name.toLowerCase().includes(searchTerm) || t.department.toLowerCase().includes(searchTerm) || t.subject.toLowerCase().includes(searchTerm));
    if (filteredTeachers.length === 0) {
        dom.teachersListStudent.innerHTML = `<p class="text-slate-500 text-sm">No teachers match your search.</p>`;
        return;
    }
    filteredTeachers.forEach(teacher => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-slate-50 p-3 rounded-md';
        div.innerHTML = `<div><p class="font-semibold">${teacher.name}</p><p class="text-sm text-slate-600">${teacher.department} - ${teacher.subject}</p></div><button data-id="${teacher.id}" data-name="${teacher.name}" class="book-appointment-btn btn-primary px-3 py-1 rounded-md text-sm">Book</button>`;
        dom.teachersListStudent.appendChild(div);
    });
};

const renderStudentAppointment = (id, data) => {
    const div = document.createElement('div');
    div.className = 'p-3 border border-slate-200 rounded-lg';
    let statusClass = '', statusIcon = '';
    switch(data.status) {
        case 'booked': statusClass = 'text-yellow-600'; statusIcon = 'fas fa-hourglass-half'; break;
        case 'approved': statusClass = 'text-green-600'; statusIcon = 'fas fa-check-circle'; break;
        case 'cancelled': statusClass = 'text-red-600'; statusIcon = 'fas fa-times-circle'; break;
    }
    div.innerHTML = `<div class="flex justify-between items-start"><div><p class="font-semibold">vs. ${data.teacherName}</p><p class="text-sm text-slate-600">${new Date(data.appointmentTime).toLocaleString()}</p></div><span class="font-semibold text-sm ${statusClass}"><i class="${statusIcon} mr-1"></i>${data.status}</span></div>`;
    dom.studentAppointmentsList.appendChild(div);
};


// --- EVENT LISTENERS ---
// All event listeners from the previous script remain the same here.
dom.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading(true);
    dom.authError.textContent = '';
    const email = dom.loginForm['login-email'].value;
    const password = dom.loginForm['login-password'].value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        dom.authError.textContent = error.message;
        showLoading(false);
    }
});

dom.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading(true);
    dom.authError.textContent = '';
    const name = dom.registerForm['register-name'].value;
    const email = dom.registerForm['register-email'].value;
    const password = dom.registerForm['register-password'].value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, getUsersCollectionPath(), userCredential.user.uid), {
            name: name, email: email, role: 'student', status: 'pending', createdAt: serverTimestamp()
        });
    } catch (error) {
        dom.authError.textContent = error.message;
        showLoading(false);
    }
});

dom.logoutBtn.addEventListener('click', () => signOut(auth));

dom.pendingStudentsList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('approve-student-btn')) {
        showLoading(true);
        await updateDoc(doc(db, getUsersCollectionPath(), e.target.dataset.id), { status: 'approved' });
        showAlert('Success', 'Student has been approved.');
        showLoading(false);
    }
});

dom.teachersListAdmin.addEventListener('click', async (e) => {
    const button = e.target.closest('.delete-teacher-btn');
    if (button && confirm('Are you sure?')) {
        showLoading(true);
        await deleteDoc(doc(db, getUsersCollectionPath(), button.dataset.id));
        showAlert('Success', 'Teacher has been deleted.');
        showLoading(false);
    }
});

dom.addTeacherBtn.addEventListener('click', () => {
    dom.teacherForm.reset();
    dom.teacherModalTitle.textContent = 'Add New Teacher';
    dom.teacherIdInput.value = '';
    dom.teacherPasswordInput.required = true;
    dom.teacherModal.classList.remove('hidden');
});

dom.cancelTeacherModal.addEventListener('click', () => dom.teacherModal.classList.add('hidden'));

dom.teacherForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading(true);
    try {
        const tempAuth = getAuth(initializeApp(firebaseConfig, 'Secondary'));
        const userCredential = await createUserWithEmailAndPassword(tempAuth, dom.teacherEmailInput.value, dom.teacherPasswordInput.value);
        await setDoc(doc(db, getUsersCollectionPath(), userCredential.user.uid), {
            name: dom.teacherNameInput.value, email: dom.teacherEmailInput.value, department: dom.teacherDepartmentInput.value,
            subject: dom.teacherSubjectInput.value, role: 'teacher', createdAt: serverTimestamp()
        });
        await signOut(tempAuth);
        showAlert('Success', 'Teacher has been added.');
        dom.teacherModal.classList.add('hidden');
    } catch (error) {
        showAlert('Error', error.message, false);
    } finally {
        showLoading(false);
    }
});

dom.scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading(true);
    const scheduleDocRef = doc(db, getSchedulesCollectionPath(), currentUser.uid);
    const scheduleDoc = await getDoc(scheduleDocRef);
    const existingSlots = (scheduleDoc.exists() && scheduleDoc.data().slots) || [];
    await setDoc(scheduleDocRef, { slots: [...existingSlots, dom.scheduleForm['schedule-datetime'].value] }, { merge: true });
    showAlert('Success', 'New time slot added.');
    dom.scheduleForm.reset();
    showLoading(false);
});

dom.teacherScheduleList.addEventListener('click', async (e) => {
    const button = e.target.closest('.delete-slot-btn');
    if (button && confirm('Are you sure?')) {
        showLoading(true);
        const scheduleDocRef = doc(db, getSchedulesCollectionPath(), currentUser.uid);
        const scheduleDoc = await getDoc(scheduleDocRef);
        const updatedSlots = (scheduleDoc.data().slots || []).filter(s => s !== button.dataset.slot);
        await updateDoc(scheduleDocRef, { slots: updatedSlots });
        showAlert('Success', 'Time slot removed.');
        showLoading(false);
    }
});

dom.teacherAppointmentsList.addEventListener('click', async (e) => {
    const appointmentId = e.target.dataset.id;
    if (!appointmentId) return;
    const appointmentDocRef = doc(db, getAppointmentsCollectionPath(), appointmentId);
    if (e.target.classList.contains('approve-appointment-btn')) {
        await updateDoc(appointmentDocRef, { status: 'approved' });
        showAlert('Success', 'Appointment approved.');
    } else if (e.target.classList.contains('cancel-appointment-btn')) {
        await updateDoc(appointmentDocRef, { status: 'cancelled' });
        showAlert('Success', 'Appointment cancelled.');
    }
});

dom.teacherSearch.addEventListener('input', renderStudentTeachersList);

dom.teachersListStudent.addEventListener('click', async (e) => {
    const button = e.target.closest('.book-appointment-btn');
    if (button) {
        showLoading(true);
        dom.bookingTeacherId.value = button.dataset.id;
        dom.bookingTeacherName.textContent = button.dataset.name;
        const scheduleDocRef = doc(db, getSchedulesCollectionPath(), button.dataset.id);
        const scheduleDoc = await getDoc(scheduleDocRef);
        dom.bookingTimeSlot.innerHTML = '<option value="">Select a time</option>';
        if (scheduleDoc.exists() && scheduleDoc.data().slots) {
            const appointmentsSnapshot = await getDocs(query(collection(db, getAppointmentsCollectionPath()), where("teacherId", "==", button.dataset.id)));
            const bookedSlots = appointmentsSnapshot.docs.map(d => d.data().appointmentTime);
            scheduleDoc.data().slots.filter(slot => !bookedSlots.includes(slot) && new Date(slot) > new Date()).sort().forEach(slot => {
                const option = document.createElement('option');
                option.value = slot;
                option.textContent = new Date(slot).toLocaleString();
                dom.bookingTimeSlot.appendChild(option);
            });
        }
        if(dom.bookingTimeSlot.options.length <= 1) dom.bookingTimeSlot.innerHTML = '<option value="">No available slots</option>';
        dom.bookingForm.reset();
        dom.bookingModal.classList.remove('hidden');
        showLoading(false);
    }
});

dom.cancelBookingModal.addEventListener('click', () => dom.bookingModal.classList.add('hidden'));

dom.bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!dom.bookingTimeSlot.value) { showAlert('Error', 'Please select a time slot.', false); return; }
    showLoading(true);
    const teacherDoc = await getDoc(doc(db, getUsersCollectionPath(), dom.bookingTeacherId.value));
    const studentDoc = await getDoc(doc(db, getUsersCollectionPath(), currentUser.uid));
    try {
        await addDoc(collection(db, getAppointmentsCollectionPath()), {
            studentId: currentUser.uid, studentName: studentDoc.data().name, teacherId: dom.bookingTeacherId.value,
            teacherName: teacherDoc.data().name, appointmentTime: dom.bookingTimeSlot.value,
            message: dom.bookingMessage.value, status: 'booked', createdAt: serverTimestamp()
        });
        showAlert('Success', 'Appointment booked and pending approval.');
        dom.bookingModal.classList.add('hidden');
    } catch (error) {
        showAlert('Error', error.message, false);
    } finally {
        showLoading(false);
    }
});

document.querySelectorAll('.auth-tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        document.querySelectorAll('.auth-tab-btn').forEach(btn => {
            btn.classList.remove('text-indigo-600', 'border-indigo-600');
            btn.classList.add('text-slate-500');
        });
        button.classList.add('text-indigo-600', 'border-indigo-600');
        button.classList.remove('text-slate-500');
        dom.loginForm.classList.toggle('hidden', tab !== 'login');
        dom.registerForm.classList.toggle('hidden', tab !== 'register');
        dom.authError.textContent = '';
    });
});

dom.alertOkBtn.addEventListener('click', () => dom.alertModal.classList.add('hidden'));

// --- INITIALIZE APP ---
window.onload = initAuth;