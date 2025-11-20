let currentUser = null;
let firebaseInitialized = false;
let googleAPILoaded = false;
let googleAPIClientId = '485825680289-gk0ajamk1j60q1qg1da9806o1gdhb2mt.apps.googleusercontent.com';
let googleAPIKey = 'AIzaSyBoQvjpuYK0uSDuSnxGhGBw0o5amm1n4zQ'; // يجب إضافة Google Calendar API Key هنا
let googleTokenClient = null;

// تهيئة Google API
async function initGoogleAPI() {
  if (googleAPILoaded) return true;
  
  try {
    // الانتظار حتى يتم تحميل gapi
    let retries = 0;
    while (typeof gapi === 'undefined' && retries < 20) {
      await new Promise(resolve => setTimeout(resolve, 200));
      retries++;
    }
    
    if (typeof gapi === 'undefined') {
      throw new Error('Google API library not loaded');
    }
    
    // تحميل Google API Client (بدون auth2 - سنستخدم Google Identity Services)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout loading Google API'));
      }, 15000);
      
      gapi.load('client', {
        callback: () => {
          clearTimeout(timeout);
          resolve();
        },
        onerror: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
    
    // تهيئة Google API Client
    // ملاحظة: تحتاج إلى API Key منفصل لـ Google Calendar API
    // اذهب إلى: https://console.cloud.google.com/apis/credentials
    // أنشئ API Key جديد وافتحه لـ Google Calendar API
    const apiKey = googleAPIKey || firebaseConfig.apiKey; // استخدام API Key منفصل إذا كان متاحاً
    
    await gapi.client.init({
      apiKey: apiKey,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
    });
    
    // تهيئة Google Identity Services (GIS) - الطريقة الجديدة
    // الانتظار حتى يتم تحميل Google Identity Services
    let gisRetries = 0;
    while (typeof google === 'undefined' && gisRetries < 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      gisRetries++;
    }
    
    if (typeof google !== 'undefined' && google.accounts) {
      try {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: googleAPIClientId,
          scope: 'https://www.googleapis.com/auth/calendar.events',
          callback: (tokenResponse) => {
            console.log('Token received:', tokenResponse);
          }
        });
        console.log('Google Identity Services initialized');
      } catch (gisError) {
        console.warn('Google Identity Services initialization warning:', gisError);
        // لا نرمي خطأ هنا لأن GIS قد لا يكون ضرورياً للعمل الأساسي
      }
    } else {
      console.warn('Google Identity Services not available yet, will retry when needed');
    }
    
    googleAPILoaded = true;
    console.log('Google API initialized successfully');
    return true;
  } catch (error) {
    console.warn('Google API initialization failed:', error);
    googleAPILoaded = false;
    return false;
  }
}

// دالة لتسجيل الدخول إلى Google باستخدام Google Identity Services (GIS)
async function signInToGoogle() {
  try {
    if (!googleAPILoaded) {
      const initialized = await initGoogleAPI();
      if (!initialized) {
        throw new Error('Failed to initialize Google API');
      }
    }
    
    // التأكد من تهيئة Google Identity Services إذا لم يتم تهيئتها
    if (!googleTokenClient) {
      // الانتظار قليلاً للتأكد من تحميل Google Identity Services
      let gisRetries = 0;
      while (typeof google === 'undefined' && gisRetries < 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        gisRetries++;
      }
      
      if (typeof google !== 'undefined' && google.accounts) {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: googleAPIClientId,
          scope: 'https://www.googleapis.com/auth/calendar.events',
          callback: (tokenResponse) => {
            console.log('Token received:', tokenResponse);
          }
        });
      }
    }
    
    // استخدام Google Identity Services (GIS) الجديد
    if (typeof google !== 'undefined' && google.accounts && googleTokenClient) {
      return new Promise((resolve, reject) => {
        // التحقق من وجود token صالح
        const token = gapi.client.getToken();
        if (token && token.expires_at && token.expires_at > Date.now()) {
          console.log('Already have valid token');
          resolve(token);
          return;
        }
        
        // طلب token جديد
        googleTokenClient.callback = (tokenResponse) => {
          if (tokenResponse.error) {
            console.error('Token error:', tokenResponse.error);
            reject(new Error(tokenResponse.error));
            return;
          }
          
          // تعيين token للـ API client
          gapi.client.setToken(tokenResponse);
          console.log('Signed in to Google successfully');
          resolve(tokenResponse);
        };
        
        googleTokenClient.requestAccessToken({ prompt: 'consent' });
      });
    } else {
      throw new Error('Google Identity Services not available. Please refresh the page and try again.');
    }
  } catch (error) {
    console.error('Error signing in to Google:', error);
    throw error;
  }
}

// تهيئة Firebase والبيانات
async function initializeFirebase() {
  if (firebaseInitialized) return;
  
  try {
    // تهيئة المستخدمين الافتراضيين
    const usersData = await getFirebaseData('users');
    if (!usersData) {
      const adminPassword = await getFirebaseData('adminPassword') || "123456";
      const defaultUsers = {
        admin: {
          username: "admin",
          password: adminPassword,
          role: "admin",
          createdAt: new Date().toLocaleString()
        }
      };
      await setFirebaseData('users', defaultUsers);
    } else {
      // تحديث كلمة مرور admin إذا كانت موجودة
      const adminPassword = await getFirebaseData('adminPassword');
      if (adminPassword && usersData.admin && usersData.admin.password !== adminPassword) {
        await updateFirebaseData('users/admin', { password: adminPassword });
      }
    }
    
    // تهيئة البيانات الأخرى
    const leadsData = await getFirebaseData('leads');
    if (!leadsData) {
      await setFirebaseData('leads', {});
    }
    
    const meetingsData = await getFirebaseData('meetings');
    if (!meetingsData) {
      await setFirebaseData('meetings', {});
    }
    
    const notificationsData = await getFirebaseData('notifications');
    if (!notificationsData) {
      await setFirebaseData('notifications', {});
    }
    
    firebaseInitialized = true;
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
}

// تهيئة Firebase عند تحميل الصفحة
if (typeof firebase !== 'undefined' && typeof database !== 'undefined') {
  initializeFirebase();
}

// Helper functions for data access (Firebase only)
async function getUsers() {
  if (typeof database === 'undefined' || !database) {
    throw new Error('Firebase database is not initialized');
  }
  const usersArray = await getFirebaseArray('users');
  return usersArray || [];
}

async function setUsers(users) {
  if (typeof database === 'undefined' || !database) {
    throw new Error('Firebase database is not initialized');
  }
  await setFirebaseArray('users', users);
  return true;
}

async function getLeads() {
  if (typeof database === 'undefined' || !database) {
    throw new Error('Firebase database is not initialized');
  }
  const leadsArray = await getFirebaseArray('leads');
  return leadsArray || [];
}

async function setLeads(leads) {
  if (typeof database === 'undefined' || !database) {
    throw new Error('Firebase database is not initialized');
  }
  await setFirebaseArray('leads', leads);
  return true;
}

async function getMeetings() {
  if (typeof database === 'undefined' || !database) {
    throw new Error('Firebase database is not initialized');
  }
  const meetingsArray = await getFirebaseArray('meetings');
  return meetingsArray || [];
}

async function setMeetings(meetings) {
  if (typeof database === 'undefined' || !database) {
    throw new Error('Firebase database is not initialized');
  }
  await setFirebaseArray('meetings', meetings);
  return true;
}

async function getNotifications() {
  if (typeof database === 'undefined' || !database) {
    throw new Error('Firebase database is not initialized');
  }
  const notificationsArray = await getFirebaseArray('notifications');
  return notificationsArray || [];
}

async function setNotifications(notifications) {
  if (typeof database === 'undefined' || !database) {
    throw new Error('Firebase database is not initialized');
  }
  await setFirebaseArray('notifications', notifications);
  return true;
}

// دالة للحصول على currentUser من localStorage (محلي لكل جهاز)
function getCurrentUserFromLocalStorage() {
  try {
    const currentUserData = localStorage.getItem('currentUser');
    if (currentUserData) {
      return JSON.parse(currentUserData);
    }
    return null;
  } catch (error) {
    console.error('Error getting current user from localStorage:', error);
    return null;
  }
}

// دالة لحفظ currentUser في localStorage (محلي لكل جهاز)
function setCurrentUserInLocalStorage(user) {
  try {
    localStorage.setItem('currentUser', JSON.stringify(user));
    return true;
  } catch (error) {
    console.error('Error setting current user in localStorage:', error);
    return false;
  }
}

// تسجيل الدخول
document.getElementById("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  
  const users = await getUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    // التحقق من حالة المستخدم (مفعّل أم معطل)
    const isActive = user.isActive !== false; // افتراضياً مفعّل إذا لم يكن محدد
    if (!isActive) {
      document.getElementById("loginError").textContent = "هذا الحساب معطل. يرجى الاتصال بالمدير";
      return;
    }
    
    currentUser = user;
    setCurrentUserInLocalStorage(user);
    // توجيه حسب الصلاحيات أو الدور
    let redirect = "dashboard.html";
    if (user.role === "admin") {
      redirect = "dashboard.html";
    } else if (user.permissions && user.permissions.length > 0) {
      // توجيه إلى أول صفحة متاحة في الصلاحيات
      if (user.permissions.includes("dashboard.html")) {
        redirect = "dashboard.html";
      } else if (user.permissions.includes("my-leads.html")) {
        redirect = "my-leads.html";
      } else if (user.permissions.includes("my-meetings.html")) {
        redirect = "my-meetings.html";
      } else {
        redirect = user.permissions[0];
      }
    } else if (user.role === "sales" || user.role === "telesales") {
      redirect = "my-leads.html";
    }
    window.location.href = redirect;
  } else {
    document.getElementById("loginError").textContent = "بيانات غير صحيحة";
  }
});

// التحقق من الصلاحيات
function hasPermission(page) {
  if (!currentUser) return false;
  
  // صفحة clear.html متاحة فقط للأدمن
  if (page === "clear.html") {
    return currentUser.role === "admin";
  }
  
  // الأدمن لديه جميع الصلاحيات
  if (currentUser.role === "admin") return true;
  
  // التحقق من الصلاحيات المخصصة
  const permissions = currentUser.permissions || [];
  return permissions.includes(page);
}

// التحقق من الصلاحيات عند تحميل الصفحة
function checkPagePermission(page) {
  if (!hasPermission(page)) {
    alert("غير مصرح لك بالوصول إلى هذه الصفحة");
    // توجيه إلى صفحة مناسبة حسب الصلاحيات
    if (hasPermission("my-leads.html")) {
      window.location.href = "my-leads.html";
    } else if (hasPermission("my-meetings.html")) {
      window.location.href = "my-meetings.html";
    } else {
      window.location.href = "index.html";
    }
    return false;
  }
  return true;
}

// تحميل المستخدم
async function loadCurrentUser() {
  try {
    // الحصول على المستخدم من localStorage (محلي لكل جهاز)
    const user = getCurrentUserFromLocalStorage();
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    
    // تعيين المستخدم الحالي أولاً (قبل محاولة التحديث)
    currentUser = user;
    
    // تحديث بيانات المستخدم من قاعدة البيانات (لضمان الحصول على أحدث الصلاحيات)
    const users = await getUsers();
    const updatedUser = users.find(u => u.username === user.username);
    if (updatedUser) {
      currentUser = updatedUser;
      setCurrentUserInLocalStorage(updatedUser);
    }
  } catch (error) {
    console.error('Error loading user from database:', error);
    window.location.href = "index.html";
    return;
  }
  
  document.querySelectorAll("#currentUser").forEach(el => 
    el.textContent = `${currentUser.username} (${getRoleText(currentUser.role)})`
  );

  // إخفاء/إظهار الروابط حسب الصلاحيات
  if (currentUser.role === "admin" || hasPermission("users.html")) {
    document.querySelectorAll("#usersLink").forEach(l => l.style.display = "inline");
  } else {
    document.querySelectorAll("#usersLink").forEach(l => l.style.display = "none");
  }
  
  // إظهار رابط تغيير كلمة مرور المدير للمدير فقط
  if (currentUser.role === "admin") {
    document.querySelectorAll("#adminPasswordLink").forEach(l => l.style.display = "inline");
  } else {
    document.querySelectorAll("#adminPasswordLink").forEach(l => l.style.display = "none");
  }

  // إخفاء رابط "الرئيسية" إذا لم يكن لديه صلاحية
  if (!hasPermission("dashboard.html")) {
    document.querySelectorAll("a[href='dashboard.html']").forEach(a => a.style.display = "none");
  }
  
  // إخفاء الروابط الأخرى حسب الصلاحيات
  const pageLinks = {
    "leads.html": "جميع العملاء",
    "my-leads.html": "عملائي",
    "meetings.html": "جميع الاجتماعات",
    "my-meetings.html": "اجتماعاتي",
    "performance-dashboard.html": "لوحة الأداء",
    "clear.html": "مسح البيانات"
  };
  
  Object.keys(pageLinks).forEach(page => {
    if (!hasPermission(page)) {
      document.querySelectorAll(`a[href='${page}']`).forEach(a => a.style.display = "none");
    }
  });

  // تهيئة واجهة الإشعارات
  initNotificationsUI();
  // تظليل رابط الصفحة الحالية في شريط التنقل
  highlightActiveNav();
}

// إظهار صفحة التحميل
function showLoadingPage() {
  const loadingPage = document.getElementById("loadingPage");
  if (loadingPage) {
    loadingPage.classList.remove("hidden");
  }
}

// إخفاء صفحة التحميل
function hideLoadingPage() {
  const loadingPage = document.getElementById("loadingPage");
  if (loadingPage) {
    loadingPage.classList.add("hidden");
  }
}

async function logout() {
  try {
    localStorage.removeItem('currentUser');
  } catch (error) {
    console.error('Error removing current user from localStorage:', error);
  }
  currentUser = null;
  window.location.href = "index.html";
}

// تغيير كلمة مرور المدير أو إنشاء حساب المدير
async function changeAdminPassword() {
  const currentPasswordInput = document.getElementById("currentPassword");
  const currentPassword = currentPasswordInput ? currentPasswordInput.value : "";
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const errorDiv = document.getElementById("passwordError");
  const successDiv = document.getElementById("passwordSuccess");
  
  // إخفاء الرسائل السابقة
  if (errorDiv) errorDiv.style.display = "none";
  if (successDiv) successDiv.style.display = "none";
  
  // التحقق من صحة البيانات
  if (newPassword.length < 6) {
    if (errorDiv) {
      errorDiv.textContent = "كلمة المرور الجديدة يجب أن تكون على الأقل 6 أحرف";
      errorDiv.style.display = "block";
    }
    return;
  }
  
  if (newPassword !== confirmPassword) {
    if (errorDiv) {
      errorDiv.textContent = "كلمة المرور الجديدة وتأكيد كلمة المرور غير متطابقين";
      errorDiv.style.display = "block";
    }
    return;
  }
  
  // الحصول على المستخدمين
  let users = await getUsers();
  const adminUser = users.find(u => u.username === "admin");
  
  // إذا كان حساب المدير موجوداً
  if (adminUser) {
    // التحقق من كلمة المرور الحالية إذا تم إدخالها
    if (currentPassword && adminUser.password !== currentPassword) {
      if (errorDiv) {
        errorDiv.textContent = "كلمة المرور الحالية غير صحيحة";
        errorDiv.style.display = "block";
      }
      return;
    }
    
    // تحديث كلمة المرور
    adminUser.password = newPassword;
  } else {
    // إنشاء حساب المدير الجديد
    const newAdminUser = {
      id: "admin", // استخدام "admin" كـ id
      username: "admin",
      password: newPassword,
      role: "admin",
      createdAt: new Date().toLocaleString()
    };
    users.push(newAdminUser);
  }
  
  // حفظ المستخدمين في Firebase
  const saveResult = await setUsers(users);
  if (!saveResult) {
    if (errorDiv) {
      errorDiv.textContent = "حدث خطأ أثناء حفظ البيانات. يرجى المحاولة مرة أخرى.";
      errorDiv.style.display = "block";
    }
    return;
  }
  
  // حفظ كلمة المرور في Firebase
  try {
    await setFirebaseData('adminPassword', newPassword);
  } catch (error) {
    console.error('Error saving admin password:', error);
  }
  
  // التحقق من أن البيانات تم حفظها بشكل صحيح
  try {
    // إعادة جلب البيانات للتأكد
    const verifyUsers = await getUsers();
    const verifyAdmin = verifyUsers.find(u => u.username === "admin");
    if (!verifyAdmin || verifyAdmin.password !== newPassword) {
      console.warn('Data verification failed, retrying...');
      // إعادة المحاولة
      await setUsers(users);
    }
  } catch (error) {
    console.error('Error verifying saved data:', error);
  }
  
  // تحديث المستخدم الحالي إذا كان هو المدير
  if (currentUser && currentUser.username === "admin") {
    currentUser.password = newPassword;
    setCurrentUserInLocalStorage(currentUser);
  }
  
  // عرض رسالة النجاح
  if (successDiv) {
    successDiv.textContent = adminUser ? "تم تغيير كلمة المرور بنجاح!" : "تم إنشاء حساب المدير بنجاح!";
    successDiv.style.display = "block";
  }
  
  // مسح الحقول
  if (currentPasswordInput) currentPasswordInput.value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  
  // إخفاء رسالة النجاح بعد 3 ثوان
  setTimeout(() => {
    if (successDiv) successDiv.style.display = "none";
  }, 3000);
}

// تحديث مواضع العناصر اللاصقة (sticky)
function updateStickyPositions() {
  const header = document.querySelector("header");
  const navbar = document.querySelector(".navbar");
  const filterBar = document.querySelector("#leadsFilters, #myLeadsFilters, #meetingsFilters, #myMeetingsFilters");
  
  let headerHeight = 70; // القيمة الافتراضية
  let navbarHeight = 60; // القيمة الافتراضية
  let filterHeight = 0; // القيمة الافتراضية
  
  if (header) {
    headerHeight = header.offsetHeight || header.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--header-height", `${headerHeight}px`);
  }
  
  if (navbar) {
    navbarHeight = navbar.offsetHeight || navbar.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--navbar-height", `${navbarHeight}px`);
  }
  
  if (filterBar) {
    filterHeight = filterBar.offsetHeight || filterBar.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--filter-height", `${filterHeight}px`);
  } else {
    // إذا لم تكن هناك فلاتر، استخدم 0
    document.documentElement.style.setProperty("--filter-height", "0px");
  }
  
  // حساب الموضع الصحيح لرأس الجدول
  const theadTop = headerHeight + navbarHeight + filterHeight;
  document.documentElement.style.setProperty("--thead-top", `${theadTop}px`);
}

// تظليل الرابط النشط في شريط الصفحات
function highlightActiveNav() {
  const current = (location.pathname.split("/").pop() || "").toLowerCase();
  const anchors = document.querySelectorAll("nav.navbar a[href]");
  anchors.forEach(a => {
    const href = (a.getAttribute("href") || "").toLowerCase();
    const isActive = href === current;
    if (isActive) {
      a.setAttribute("aria-current", "page");
      a.style.background = "#2E3192";
      a.style.color = "#fff";
      a.style.borderRadius = "6px";
      a.style.padding = "0.35rem 0.6rem";
      a.style.textDecoration = "none";
      a.style.fontWeight = "600";
    } else {
      // لا تغيّر باقي الروابط بشكل قسري، اترك الستايل الافتراضي
      a.removeAttribute("aria-current");
    }
  });
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: formatDateForInput(start),
    end: formatDateForInput(end)
  };
}

function parseDateInput(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return isNaN(date.getTime()) ? null : date;
}

// ===== إشعارات: دوال مساعدة =====
function pushNotification(type, message, targets) {
  // targets: مصفوفة أسماء مستخدمين محددين، أو كلمات مفتاحية مثل 'leads_page'
  (async () => {
    const notifications = await getNotifications();
    notifications.unshift({
      id: Date.now().toString() + Math.random().toString(16).slice(2),
      type,
      message,
      targets: Array.isArray(targets) ? targets : [targets],
      createdAt: new Date().toISOString(),
      readBy: []
    });
    await setNotifications(notifications);
  })();
  renderNotificationsUI(); // تحديث فوري إن وُجدت الواجهة
}

async function getUserNotifications(username) {
  const notifications = await getNotifications();
  return notifications.filter(n => {
    if (!Array.isArray(n.targets)) return false;
    // صلاحية leads_page
    const leadsPageTarget = n.targets.includes('leads_page') && hasPermission('leads.html');
    const isDirectTarget = n.targets.includes(username);
    return leadsPageTarget || isDirectTarget;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function markNotificationRead(id) {
  const notifications = await getNotifications();
  const idx = notifications.findIndex(n => n.id === id);
  if (idx !== -1) {
    const rb = new Set(notifications[idx].readBy || []);
    rb.add(currentUser.username);
    notifications[idx].readBy = Array.from(rb);
    await setNotifications(notifications);
    renderNotificationsUI();
  }
}

async function markAllNotificationsRead() {
  const notifications = await getNotifications();
  notifications.forEach(n => {
    const rb = new Set(n.readBy || []);
    rb.add(currentUser.username);
    n.readBy = Array.from(rb);
  });
  await setNotifications(notifications);
  renderNotificationsUI();
}

async function getUnreadCountForUser() {
  const list = await getUserNotifications(currentUser.username);
  return list.filter(n => !(n.readBy || []).includes(currentUser.username)).length;
}

// ===== إشعارات: واجهة المستخدم =====
function initNotificationsUI() {
  const header = document.querySelector("header");
  if (!header) return;
  let bell = document.getElementById("notifBell");
  if (!bell) {
    const userInfo = header.querySelector(".user-info");
    if (!userInfo) return;
    bell = document.createElement("div");
    bell.id = "notifBell";
    bell.style.display = "inline-block";
    bell.style.margin = "0 0.5rem";
    bell.innerHTML = `
      <button id="notifBellBtn" title="الإشعارات" style="position:relative; border-radius:999px; padding:0.4rem 0.6rem;">
        🔔
        <span id="notifBadge" style="position:absolute; top:-6px; right:-6px; background:#e74c3c; color:#fff; border-radius:999px; padding:0 6px; font-size:0.75rem; display:none;">0</span>
      </button>
      <div id="notifDropdown" style="display:none; position:absolute; left:0; top:2.2rem; min-width:280px; background:#fff; box-shadow:0 10px 25px rgba(0,0,0,0.15); border-radius:8px; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem; background:#f6f7fb;">
          <strong>الإشعارات</strong>
          <button id="markAllReadBtn" class="small" style="background:#2E3192;">تعيين الكل كمقروء</button>
        </div>
        <div id="notifList" style="max-height:300px; overflow:auto;"></div>
      </div>
    `;
    // أدخل الجرس بين اسم المستخدم وزر تسجيل الخروج
    const userSpan = userInfo.querySelector("#currentUser");
    const logoutBtn = userInfo.querySelector("button");
    if (logoutBtn) {
      userInfo.insertBefore(bell, logoutBtn);
    } else if (userSpan) {
      userSpan.insertAdjacentElement("afterend", bell);
    } else {
      userInfo.appendChild(bell);
    }

    const toggleDropdown = () => {
      const dd = document.getElementById("notifDropdown");
      if (!dd) return;
      const showing = dd.style.display === "block";
      dd.style.display = showing ? "none" : "block";
      // القائمة متموضعة بالنسبة للجرس نفسه
      if (!showing) dd.style.left = "0";
    };

    document.getElementById("notifBellBtn").addEventListener("click", toggleDropdown);
    document.getElementById("markAllReadBtn").addEventListener("click", markAllNotificationsRead);
    // أغلق عند النقر خارجاً
    document.addEventListener("click", (e) => {
      const dd = document.getElementById("notifDropdown");
      const within = bell.contains(e.target);
      if (!within && dd && dd.style.display === "block") {
        dd.style.display = "none";
      }
    });
    // عند تغيير حجم النافذة أعد ضبط محاذاة القائمة إذا كانت مفتوحة
    window.addEventListener("resize", () => {
      const dd = document.getElementById("notifDropdown");
      if (dd && dd.style.display === "block") {
        const rect = bell.getBoundingClientRect();
        const spaceRight = window.innerWidth - rect.left;
        if (spaceRight < 300) {
          dd.style.left = "auto";
          dd.style.right = "0";
        } else {
          dd.style.right = "auto";
          dd.style.left = "0";
        }
      }
      // تحديث مواضع العناصر اللاصقة عند تغيير حجم النافذة
      updateStickyPositions();
    });
    // تحديث عند تغييرات التخزين (تبويبات متعددة)
    window.addEventListener("storage", (e) => {
      if (e.key === "notifications") renderNotificationsUI();
    });
  }
  renderNotificationsUI();
}

async function renderNotificationsUI() {
  const badge = document.getElementById("notifBadge");
  const listEl = document.getElementById("notifList");
  if (!badge || !listEl || !currentUser) return;
  const list = await getUserNotifications(currentUser.username);
  const unread = list.filter(n => !(n.readBy || []).includes(currentUser.username)).length;
  badge.textContent = unread;
  badge.style.display = unread > 0 ? "inline-block" : "none";
  // بناء القائمة
  listEl.innerHTML = list.length === 0
    ? `<div style="padding:0.75rem; color:#777;">لا توجد إشعارات</div>`
    : list.slice(0, 15).map(n => {
        const read = (n.readBy || []).includes(currentUser.username);
        return `
          <div style="padding:0.75rem; border-bottom:1px solid #eee; background:${read ? '#fff' : '#f3f6ff'};">
            <div style="font-size:0.9rem; color:#333; margin-bottom:0.25rem;">${escapeHtml(n.message)}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <small style="color:#888;">${formatDateTime(n.createdAt)}</small>
              ${read ? '' : `<button class="small" onclick="markNotificationRead('${n.id}')" style="background:#27ae60;">تم</button>`}
            </div>
          </div>
        `;
      }).join("");
}

// لوحة التحكم
async function initDashboard() {
  showLoadingPage();
  try {
    await loadCurrentUser();
    if (!checkPagePermission("dashboard.html")) {
      return;
    }
    await updateStats();
    await loadRecent();
  } finally {
    hideLoadingPage();
  }
}

async function updateStats() {
  const leads = await getLeads();
  document.getElementById("totalLeads").textContent = leads.length;
  document.getElementById("newCount").textContent = leads.filter(l => l.status === "new").length;
  document.getElementById("inProgress").textContent = leads.filter(l => l.status === "in-progress").length;
  const failedEl = document.getElementById("failedCount");
  if (failedEl) {
    failedEl.textContent = leads.filter(l => l.status === "failed").length;
  }
  document.getElementById("done").textContent = leads.filter(l => l.status === "done").length;
}

async function loadRecent() {
  let leads = await getLeads();
  leads = leads
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
  const tbody = document.querySelector("#recentTable tbody");
  tbody.innerHTML = "";
  leads.forEach(lead => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(lead.company)}</td>
      <td>${formatPhoneWithIcons(lead.phone)}</td>
      <td>${getTypeText(lead.type)}</td>
      <td><span class="status ${lead.status}">${getStatusText(lead.status)}</span></td>
      <td>${lead.assignedTo || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// صفحة العملاء
async function initLeadsPage() {
  showLoadingPage();
  try {
    await loadCurrentUser();
    if (!checkPagePermission("leads.html")) {
      return;
    }
    ensureLeadsFiltersUI();
    await loadLeadsTable();
    document.getElementById("addLeadForm").addEventListener("submit", addLead);
    document.getElementById("editLeadForm").addEventListener("submit", updateLead);
    // تحديث مواضع العناصر اللاصقة
    setTimeout(() => {
      updateStickyPositions();
    }, 200);
    // إضافة مربع اختيار "جعل العميل للجميع" مع افتراض الإضافة لنفسي فقط
    const addForm = document.getElementById("addLeadForm");
    if (addForm && !document.getElementById("addForAllCheckbox")) {
      const wrapper = document.createElement("div");
      wrapper.style.marginTop = "0.5rem";
      wrapper.innerHTML = `
        <label style="display:flex; align-items:center; gap:0.5rem; background:#f3f6f9; padding:0.5rem 0.75rem; border-radius:6px; font-size:0.9rem;">
          <input type="checkbox" id="addForAllCheckbox" />
          جعل هذا العميل متاحًا للجميع (غير مخصص)
        </label>
        <small style="color:#777; line-height:1.4; display:block; margin-top:0.25rem;">بالوضع الافتراضي سيتم إضافة العميل لك فقط. فعّل هذا الخيار لجعله متاحًا للجميع.</small>
      `;
      addForm.appendChild(wrapper);
    }
  } finally {
    hideLoadingPage();
  }
}

function ensureLeadsFiltersUI() {
  const table = document.getElementById("leadsTable");
  if (!table) return;
  if (!document.getElementById("leadsFilters")) {
    const bar = document.createElement("div");
    bar.id = "leadsFilters";
    bar.style.display = "flex";
    bar.style.flexWrap = "wrap";
    bar.style.gap = "0.5rem";
    bar.style.margin = "0.75rem 0";
    bar.style.background = "#f6f7fb";
    bar.style.padding = "0.6rem";
    bar.style.borderRadius = "8px";
    bar.innerHTML = `
      <select id="leadsTypeFilter" style="min-width:180px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
        <option value="">كل الأنواع</option>
        <option value="cold">Cold Lead</option>
        <option value="hot">Hot Lead</option>
        <option value="hunt">Hunt Lead</option>
      </select>
      <select id="leadsResponseFilter" style="min-width:200px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
        <option value="">كل حالات الرد</option>
        <option value="لم يتم المحاوله">لم يتم المحاوله</option>
        <option value="تم الرد">تم الرد</option>
        <option value="لم يتم الرد">لم يتم الرد</option>
        <option value="اعاده التواصل">اعاده التواصل</option>
      </select>
      <select id="leadsCallFilter" style="min-width:200px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
        <option value="">كل حالات المكالمة</option>
        <option value="new">جديد</option>
        <option value="failed">لم يتم التحويل</option>
        <option value="done">تم التحويل</option>
      </select>
      <input type="date" id="leadsDateFrom" style="padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;" />
      <input type="date" id="leadsDateTo" style="padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;" />
      <input type="text" id="leadsSearchInput" placeholder="بحث باسم الشركة أو الهاتف" style="min-width:220px; padding:0.4rem 0.6rem; border:1px solid #dfe3ea; border-radius:6px;" />
      <button id="leadsResetFilters" class="small" style="margin-inline-start:auto; background:#e67e22; color:#fff; padding:0.45rem 0.8rem; border:none; border-radius:6px; cursor:pointer;">مسح الفلاتر</button>
    `;
    table.parentElement.insertBefore(bar, table);
    const { start, end } = getCurrentMonthRange();
    const leadsDateFrom = document.getElementById("leadsDateFrom");
    const leadsDateTo = document.getElementById("leadsDateTo");
    if (leadsDateFrom && !leadsDateFrom.value) leadsDateFrom.value = start;
    if (leadsDateTo && !leadsDateTo.value) leadsDateTo.value = end;
    ["leadsTypeFilter","leadsResponseFilter","leadsCallFilter","leadsDateFrom","leadsDateTo"].forEach(id => {
      document.getElementById(id).addEventListener("change", loadLeadsTable);
    });
    document.getElementById("leadsSearchInput").addEventListener("input", loadLeadsTable);
    document.getElementById("leadsResetFilters").addEventListener("click", () => {
      const typeSel = document.getElementById("leadsTypeFilter");
      const respSel = document.getElementById("leadsResponseFilter");
      const callSel = document.getElementById("leadsCallFilter");
      const dateFrom = document.getElementById("leadsDateFrom");
      const dateTo = document.getElementById("leadsDateTo");
      const searchInput = document.getElementById("leadsSearchInput");
      if (typeSel) typeSel.value = "";
      if (respSel) respSel.value = "";
      if (callSel) callSel.value = "";
      if (dateFrom) dateFrom.value = "";
      if (dateTo) dateTo.value = "";
      if (searchInput) searchInput.value = "";
      loadLeadsTable();
    });
    
    // تحديث مواضع العناصر اللاصقة بعد إنشاء الفلاتر
    setTimeout(() => {
      updateStickyPositions();
    }, 100);
  }
}

async function addLead(e) {
  e.preventDefault();
  const leads = await getLeads();
  const forAll = !!document.getElementById("addForAllCheckbox")?.checked;
  const newLead = {
    id: Date.now().toString(),
    company: document.getElementById("company").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    storeLink: document.getElementById("storeLink").value.trim() || "-",
    type: document.getElementById("type").value,
    status: "new",
    assignedTo: forAll ? null : currentUser.username,
    enteredBy: currentUser.username,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // حالة الرد الافتراضية
    responseStatus: "لم يتم المحاوله",
    responseStatusUpdatedAt: new Date().toISOString(),
    notes: ""
  };
  leads.push(newLead);
  await setLeads(leads);
  closeModal();
  loadLeadsTable();
  // إشعار: عميل جديد
  pushNotification("new_lead", `تم إضافة عميل جديد: ${newLead.company}`, ["leads_page"]);
}

// صفحة العملاء - جميع العملاء
async function loadLeadsTable() {
  let leads = await getLeads();
  const isAdmin = currentUser.role === "admin";
  const isManager = currentUser.role === "manager";
  const isSales = currentUser.role === "sales" || currentUser.role === "telesales";

  // تحويل جميع حالات in-progress إلى failed
  let needsUpdate = false;
  leads.forEach(lead => {
    if (lead.status === "in-progress") {
      lead.status = "failed";
      lead.updatedAt = new Date().toISOString();
      needsUpdate = true;
    }
  });
  if (needsUpdate) {
    await setLeads(leads);
  }

  // تطبيق منطق الإرجاع التلقائي قبل العرض
  (async () => {
    await autoReturnUnansweredLeads(leads);
    leads = await getLeads(); // إعادة جلب البيانات بعد التحديث
  })();

  leads.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // إظهار فقط العملاء الجدد للسيلز
  if (isSales) {
    leads = leads.filter(l => l.status === "new" && !l.assignedTo);
  } else if (isManager) {
    // المدير يرى: العملاء غير المخصصين + عملائه + عملاء من يرأسهم
    // المدير يرى: العملاء غير المخصصين + عملائه + عملاء من يرأسهم
    // سيتم تحديث هذا الجزء لاحقاً لاستخدام async
    leads = leads.filter(l => {
      // العملاء غير المخصصين
      if (!l.assignedTo) return true;
      // عملائه الشخصية
      if (l.assignedTo === currentUser.username) return true;
      // عملاء من يرأسهم (سيتم تحديثه لاحقاً)
      return false;
    });
  } else if (!isAdmin) {
    leads = leads.filter(l => l.status === "new" || l.assignedTo === currentUser.username);
  }

  // تطبيق فلاتر الصفحة
  const typeFilter = document.getElementById("leadsTypeFilter")?.value || "";
  const responseFilter = document.getElementById("leadsResponseFilter")?.value || "";
  const callFilter = document.getElementById("leadsCallFilter")?.value || "";
  const dateFromStr = document.getElementById("leadsDateFrom")?.value || "";
  const dateToStr = document.getElementById("leadsDateTo")?.value || "";
  const searchQuery = (document.getElementById("leadsSearchInput")?.value || "").trim().toLowerCase();
  const dateFrom = parseDateInput(dateFromStr);
  const dateTo = parseDateInput(dateToStr, true);
  leads = leads.filter(l => {
    const typeOk = !typeFilter || l.type === typeFilter;
    const resp = l.responseStatus || "لم يتم المحاوله";
    const responseOk = !responseFilter || resp === responseFilter;
    // تحويل in-progress إلى failed للفلترة
    const leadStatus = (l.status === "in-progress") ? "failed" : l.status;
    const callOk = !callFilter || leadStatus === callFilter;
    const createdAt = l.createdAt ? new Date(l.createdAt) : null;
    const dateOk = (!dateFrom || (createdAt && createdAt >= dateFrom)) &&
                   (!dateTo || (createdAt && createdAt <= dateTo));
    const company = (l.company || "").toLowerCase();
    const phone = (l.phone || "").toLowerCase();
    const searchOk = !searchQuery || company.includes(searchQuery) || phone.includes(searchQuery);
    return typeOk && responseOk && callOk && dateOk && searchOk;
  });

  const leadsCountEl = document.getElementById("leadsCount");
  if (leadsCountEl) {
    leadsCountEl.textContent = leads.length;
  }

  const tbody = document.querySelector("#leadsTable tbody");
  tbody.innerHTML = "";

  // من يمكن التوجيه لهم بحسب الدور (للمدير ورئيس القسم)
  let assignableUsers = [];
  const usersAll = await getUsers();
  if (isManager) {
    // موظفو المدير + المدير نفسه
    assignableUsers = usersAll.filter(u => u.manager === currentUser.username && u.username !== "admin");
    const selfUser = usersAll.find(u => u.username === currentUser.username);
    if (selfUser) {
      const exists = assignableUsers.some(u => u.username === selfUser.username);
      if (!exists) assignableUsers.push(selfUser);
    }
  } else if (isAdmin) {
    // الأدمن يمكنه اختيار أي مستخدم بمن فيهم admin نفسه
    assignableUsers = usersAll.slice();
  }

  leads.forEach((lead, index) => {
    const canAssign = lead.status === "new" && !lead.assignedTo;
    const isMine = lead.assignedTo === currentUser.username;
    const canEdit = isMine || isAdmin || isManager;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${formatDateTime(lead.createdAt)}</td>
      <td>${escapeHtml(lead.company)}</td>
      <td>${formatPhoneWithIcons(lead.phone)}</td>
      <td>${lead.storeLink !== "-" ? `<a href="${lead.storeLink}" target="_blank">link</a>` : "-"}</td>
      <td>${getTypeText(lead.type)}</td>
      <td><span class="status">${getResponseStatusText(lead.responseStatus)}</span></td>
      <td><span class="status ${lead.status}">${getStatusText(lead.status)}</span></td>
      <td>${lead.assignedTo || "-"}</td>
      <td class="notes-cell">
        <span class="notes-display" title="${escapeHtml(lead.notes || '')}" style="cursor: help;">${escapeHtml(lead.notes.substring(0, 50))}${lead.notes.length > 50 ? "..." : ""}</span>
      </td>
      <td>
        ${(() => {
          const buttons = [];
          if (canEdit) buttons.push({html: `<button onclick="showEditLeadModal('${lead.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(m => m.classList.remove('show'));">تعديل</button>`});
          if (canAssign) buttons.push({html: `<button onclick="assignToMe('${lead.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(m => m.classList.remove('show'));">أنا سأتابع</button>`});
          if (isManager || isAdmin) {
            buttons.push({html: `
              <div style="padding:0.5rem; border-bottom:1px solid #f0f0f0;">
                <select id="assignLeadTo_${lead.id}" style="width:100%; padding:0.4rem; margin-bottom:0.5rem; border:1px solid #ddd; border-radius:4px;">
                  <option value="">— اختر موظف —</option>
                  ${assignableUsers.map(u => `<option value="${u.username}">${u.username} (${getRoleText(u.role)})</option>`).join('')}
                </select>
                <button onclick="assignLeadToUser('${lead.id}', document.getElementById('assignLeadTo_${lead.id}').value); document.querySelectorAll('.actions-menu-dropdown.show').forEach(m => m.classList.remove('show'));" style="width:100%; padding:0.5rem; background:#2E3192; color:#fff; border:none; border-radius:4px; cursor:pointer;">توجيه</button>
              </div>
            `});
          }
          return createActionsMenu(buttons, typeof lead !== 'undefined' ? lead.id : (typeof m !== 'undefined' ? m.id : Date.now()));
        })()}
      </td>
    `;
    tbody.appendChild(row);
  });
}

// === دوال Excel ===
function downloadExcelTemplate() {
  // إنشاء قالب Excel
  const templateData = [
    ['اسم الشركة', 'رقم الهاتف', 'رابط المتجر (اختياري)', 'ملاحظات (اختياري)']
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "العملاء");
  
  // تحميل الملف
  XLSX.writeFile(wb, "قالب_العملاء.xlsx");
}

// تصدير بيانات المستخدمين إلى Excel
async function exportUsersToExcel() {
  try {
    // التحقق من الصلاحيات - فقط المدير
    await loadCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
      alert("غير مصرح لك بتصدير بيانات المستخدمين. هذه الميزة متاحة فقط للمدير.");
      return;
    }
    
    // الحصول على جميع المستخدمين
    const users = await getUsers();
    
    // تحضير البيانات للتصدير
    const exportData = [];
    
    // إضافة العناوين
    exportData.push([
      'اسم المستخدم',
      'الدور',
      'رقم الهاتف',
      'المدير المباشر',
      'تاريخ الإنشاء',
      'الحالة',
      'الصلاحيات'
    ]);
    
    // إضافة بيانات المستخدمين (باستثناء admin)
    users.filter(user => user.username !== "admin").forEach(user => {
      const permissions = user.permissions || [];
      const permText = permissions.length > 0 
        ? permissions.map(p => {
            const names = {
              "dashboard.html": "الرئيسية",
              "leads.html": "جميع العملاء",
              "my-leads.html": "عملائي",
              "meetings.html": "جميع الاجتماعات",
              "my-meetings.html": "اجتماعاتي",
              "users.html": "المستخدمين",
              "clear.html": "مسح البيانات"
            };
            return names[p] || p;
          }).join(", ")
        : "لا توجد صلاحيات";
      
      const managerName = user.manager 
        ? (users.find(u => u.username === user.manager)?.username || user.manager)
        : "-";
      
      const isActive = user.isActive !== false;
      const status = isActive ? "مفعّل" : "معطل";
      
      exportData.push([
        user.username,
        getRoleText(user.role),
        user.phone || "-",
        managerName,
        user.createdAt || "-",
        status,
        permText
      ]);
    });
    
    // إنشاء ورقة العمل
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    
    // تحديد عرض الأعمدة
    const colWidths = [
      { wch: 20 }, // اسم المستخدم
      { wch: 15 }, // الدور
      { wch: 15 }, // رقم الهاتف
      { wch: 20 }, // المدير المباشر
      { wch: 20 }, // تاريخ الإنشاء
      { wch: 10 }, // الحالة
      { wch: 50 }  // الصلاحيات
    ];
    ws['!cols'] = colWidths;
    
    // إنشاء المصنف
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المستخدمين");
    
    // تحميل الملف
    const fileName = `المستخدمين_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    alert("تم تصدير بيانات المستخدمين بنجاح!");
  } catch (error) {
    console.error("Error exporting users to Excel:", error);
    alert("حدث خطأ أثناء تصدير بيانات المستخدمين. يرجى المحاولة مرة أخرى.");
  }
}

function importFromExcel(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      
      // تخطي الصف الأول (العناوين)
      const rows = jsonData.slice(1).filter(row => row.length > 0 && row[0]);
      
      if (rows.length === 0) {
        alert("لا توجد بيانات في الملف");
        return;
      }
      
      // عرض نافذة لاختيار النوع أولاً
      showImportTypeSelection(rows);
    } catch (error) {
      alert("حدث خطأ في قراءة الملف: " + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
  
  // إعادة تعيين input
  event.target.value = '';
}

function showImportTypeSelection(rows) {
  // حفظ البيانات مؤقتاً في localStorage
  const tempKey = "temp_import_rows_" + Date.now();
  localStorage.setItem(tempKey, JSON.stringify(rows));
  
  // إنشاء modal لاختيار النوع
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.display = "block";
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close" onclick="this.parentElement.parentElement.remove(); localStorage.removeItem('${tempKey}');">×</span>
      <h2>اختر نوع العملاء</h2>
      <p style="margin: 1rem 0; color: #555;">سيتم تطبيق النوع المحدد على جميع العملاء المستوردين (${rows.length} عميل)</p>
      <select id="importTypeSelect" style="width: 100%; padding: 0.5rem; margin: 1rem 0; font-size: 1rem;">
        <option value="cold">Cold Lead</option>
        <option value="hot">Hot Lead</option>
        <option value="hunt">Hunt Lead</option>
      </select>
      <div style="display: flex; gap: 1rem;">
        <button id="confirmTypeBtn" style="background: #27ae60; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 5px; cursor: pointer; flex: 1;">التالي</button>
        <button onclick="this.closest('.modal').remove(); localStorage.removeItem('${tempKey}');" style="background: #95a5a6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 5px; cursor: pointer; flex: 1;">إلغاء</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // إضافة مستمع للزر
  document.getElementById("confirmTypeBtn").addEventListener("click", function() {
    const selectedType = document.getElementById("importTypeSelect").value;
    const savedRows = JSON.parse(localStorage.getItem(tempKey) || "[]");
    localStorage.removeItem(tempKey);
    modal.remove();
    // الانتقال إلى اختيار المستخدم
    showImportUserSelection(savedRows, selectedType);
  });
}

function showImportUserSelection(rows, selectedType) {
  const isAdmin = currentUser.role === "admin";
  const isManager = currentUser.role === "manager";
  const isSales = currentUser.role === "sales" || currentUser.role === "telesales";
  
  // إذا كان المستخدم سيلز أو تلي سيلز، اعرض خيار الاستيراد لنفسه أو للجميع
  if (isSales) {
    const tempKey = "temp_import_rows_" + Date.now();
    localStorage.setItem(tempKey, JSON.stringify({ rows, type: selectedType }));
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.display = "block";
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close" onclick="this.parentElement.parentElement.remove(); localStorage.removeItem('${tempKey}');">×</span>
        <h2>خيارات الاستيراد</h2>
        <p style="margin: 0.5rem 0; color: #555;">النوع المحدد: <strong>${getTypeText(selectedType)}</strong></p>
        <label style="display:flex; align-items:center; gap:0.5rem; background:#f3f6f9; padding:0.75rem; border-radius:6px; font-size:0.9rem;">
          <input type="checkbox" id="importGeneralCheckboxSimple">
          جعل العملاء متاحين لجميع الموظفين (غير مخصص)
        </label>
        <small style="color:#777; line-height:1.4;">بالوضع الافتراضي سيتم تعيين العملاء لك فقط. فعّل هذا الخيار لجعلهم متاحين للجميع.</small>
        <div style="display:flex; gap:1rem; margin-top:1rem;">
          <button id="confirmImportBtnSimple" style="background:#27ae60; color:#fff; border:none; padding:0.75rem 1.5rem; border-radius:5px; cursor:pointer; flex:1;">استيراد</button>
          <button onclick="this.closest('.modal').remove(); localStorage.removeItem('${tempKey}');" style="background:#95a5a6; color:#fff; border:none; padding:0.75rem 1.5rem; border-radius:5px; cursor:pointer; flex:1;">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById("confirmImportBtnSimple").addEventListener("click", function() {
      const saved = JSON.parse(localStorage.getItem(tempKey) || "{}");
      const general = !!document.getElementById("importGeneralCheckboxSimple")?.checked;
      localStorage.removeItem(tempKey);
      modal.remove();
      importLeadsFromExcel(saved.rows || [], general ? null : currentUser.username, saved.type);
    });
    return;
  }
  
  // إذا كان admin أو manager، نعرض قائمة لاختيار المستخدم
  if (isAdmin || isManager) {
    (async () => {
      const users = await getUsers();
      let availableUsers = [];
      
      if (isAdmin) {
        // Admin يمكنه اختيار أي مستخدم
        availableUsers = users.filter(u => u.username !== "admin");
      } else if (isManager) {
        // Manager يمكنه اختيار نفسه أو من يرأسهم
        availableUsers = users.filter(u => 
          u.username === currentUser.username || 
          (u.manager === currentUser.username && u.username !== "admin")
        );
      }
    
    // حفظ البيانات مؤقتاً في localStorage
    const tempKey = "temp_import_data_" + Date.now();
    localStorage.setItem(tempKey, JSON.stringify({ rows, type: selectedType }));
    
    const optionsHtml = availableUsers.length > 0
      ? availableUsers.map(u => `<option value="${u.username}">${u.username} (${getRoleText(u.role)})</option>`).join('')
      : '<option value="" disabled selected>لا يوجد مستخدمين متاحين للاختيار</option>';

    // تصنيف المستخدمين حسب الدور
    const salesUsers = availableUsers.filter(u => u.role === "sales");
    const telesalesUsers = availableUsers.filter(u => u.role === "telesales");
    const allSalesAndTelesales = [...salesUsers, ...telesalesUsers];
    
    // إنشاء modal لاختيار طريقة التوزيع
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.display = "block";
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <span class="close" onclick="this.parentElement.parentElement.remove(); localStorage.removeItem('${tempKey}');">×</span>
        <h2>اختر طريقة توزيع العملاء</h2>
        <p style="margin: 0.5rem 0; color: #555;">النوع المحدد: <strong>${getTypeText(selectedType)}</strong></p>
        <p style="margin: 0.5rem 0; color: #555;">عدد العملاء: <strong>${rows.length}</strong></p>
        
        <div style="display: flex; flex-direction: column; gap: 0.75rem; margin: 1.5rem 0;">
          <label style="display:flex; align-items:center; gap:0.75rem; background:#f3f6f9; padding:1rem; border-radius:8px; cursor:pointer; border:2px solid #dfe3ea; transition:all 0.2s;">
            <input type="radio" name="distributionType" value="single" id="distSingle" style="width:20px; height:20px; cursor:pointer;">
            <div style="flex:1;">
              <strong style="display:block; margin-bottom:0.25rem;">تعيين لمستخدم محدد</strong>
              <small style="color:#777;">اختر مستخدم واحد لتعيين جميع العملاء له</small>
            </div>
          </label>
          
          <label style="display:flex; align-items:center; gap:0.75rem; background:#f3f6f9; padding:1rem; border-radius:8px; cursor:pointer; border:2px solid #dfe3ea; transition:all 0.2s;">
            <input type="radio" name="distributionType" value="sales" id="distSales" style="width:20px; height:20px; cursor:pointer;" ${salesUsers.length === 0 ? 'disabled' : ''}>
            <div style="flex:1;">
              <strong style="display:block; margin-bottom:0.25rem;">توزيع على السيلز فقط (${salesUsers.length} مستخدم)</strong>
              <small style="color:#777;">سيتم توزيع العملاء بالتساوي على جميع موظفي السيلز</small>
            </div>
          </label>
          
          <label style="display:flex; align-items:center; gap:0.75rem; background:#f3f6f9; padding:1rem; border-radius:8px; cursor:pointer; border:2px solid #dfe3ea; transition:all 0.2s;">
            <input type="radio" name="distributionType" value="telesales" id="distTelesales" style="width:20px; height:20px; cursor:pointer;" ${telesalesUsers.length === 0 ? 'disabled' : ''}>
            <div style="flex:1;">
              <strong style="display:block; margin-bottom:0.25rem;">توزيع على التلي سيلز فقط (${telesalesUsers.length} مستخدم)</strong>
              <small style="color:#777;">سيتم توزيع العملاء بالتساوي على جميع موظفي التلي سيلز</small>
            </div>
          </label>
          
          <label style="display:flex; align-items:center; gap:0.75rem; background:#f3f6f9; padding:1rem; border-radius:8px; cursor:pointer; border:2px solid #dfe3ea; transition:all 0.2s;">
            <input type="radio" name="distributionType" value="both" id="distBoth" style="width:20px; height:20px; cursor:pointer;" ${allSalesAndTelesales.length === 0 ? 'disabled' : ''}>
            <div style="flex:1;">
              <strong style="display:block; margin-bottom:0.25rem;">توزيع على السيلز والتلي سيلز (${allSalesAndTelesales.length} مستخدم)</strong>
              <small style="color:#777;">سيتم توزيع العملاء بالتساوي على جميع موظفي السيلز والتلي سيلز</small>
            </div>
          </label>
          
          <label style="display:flex; align-items:center; gap:0.75rem; background:#f3f6f9; padding:1rem; border-radius:8px; cursor:pointer; border:2px solid #dfe3ea; transition:all 0.2s;">
            <input type="radio" name="distributionType" value="general" id="distGeneral" style="width:20px; height:20px; cursor:pointer;">
            <div style="flex:1;">
              <strong style="display:block; margin-bottom:0.25rem;">إتاحتها للجميع (غير مخصص)</strong>
              <small style="color:#777;">سيتم إضافة العملاء كعُملاء غير مخصصين ويمكن لأي موظف اختيارهم لاحقاً</small>
            </div>
          </label>
        </div>
        
        <div id="singleUserContainer" style="display:none; margin:1rem 0;">
          <label style="display:block; margin-bottom:0.5rem; font-weight:600;">اختر المستخدم:</label>
          <select id="importUserSelect" style="width: 100%; padding: 0.5rem; font-size: 1rem; border:1px solid #dfe3ea; border-radius:6px;">
            ${optionsHtml}
          </select>
        </div>
        
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
          <button id="confirmImportBtn" style="background: #27ae60; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 5px; cursor: pointer; flex: 1; font-size:1rem; font-weight:600;">استيراد</button>
          <button onclick="this.closest('.modal').remove(); localStorage.removeItem('${tempKey}');" style="background: #95a5a6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 5px; cursor: pointer; flex: 1;">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // إضافة مستمعات للأزرار الراديوية
    const singleUserContainer = document.getElementById("singleUserContainer");
    const userSelect = document.getElementById("importUserSelect");
    const distributionRadios = document.querySelectorAll('input[name="distributionType"]');
    
    // إضافة مستمعات لتغيير طريقة التوزيع
    distributionRadios.forEach(radio => {
      radio.addEventListener('change', function() {
        if (this.value === 'single') {
          singleUserContainer.style.display = 'block';
        } else {
          singleUserContainer.style.display = 'none';
        }
      });
    });
    
    // اجعل الاختيار الافتراضي "تعيين لمستخدم محدد" إذا كان هناك مستخدمون متاحون
    if (availableUsers.length > 0) {
      document.getElementById("distSingle").checked = true;
      singleUserContainer.style.display = 'block';
      // اجعل الاختيار الافتراضي للمستخدم الحالي
      if (userSelect) {
        const hasCurrent = Array.from(userSelect.options).some(opt => opt.value === currentUser.username);
        if (hasCurrent) {
          userSelect.value = currentUser.username;
        } else if (userSelect.options.length > 0) {
          userSelect.selectedIndex = 0;
        }
      }
    } else {
      // إذا لم يكن هناك مستخدمون متاحون، فعّل الخيار العام تلقائياً
      document.getElementById("distGeneral").checked = true;
    }

    document.getElementById("confirmImportBtn").addEventListener("click", function() {
      const selectedDistribution = document.querySelector('input[name="distributionType"]:checked')?.value;
      
      if (!selectedDistribution) {
        alert("يرجى اختيار طريقة توزيع العملاء.");
        return;
      }
      
      if (selectedDistribution === 'single') {
        if (!userSelect || !userSelect.value) {
          alert("يرجى اختيار مستخدم لتعيين العملاء له.");
          return;
        }
      }
      
      const savedData = JSON.parse(localStorage.getItem(tempKey) || "{}");
      localStorage.removeItem(tempKey);
      modal.remove();
      
      // تحديد المستخدمين المستهدفين حسب طريقة التوزيع
      let targetUsers = [];
      if (selectedDistribution === 'single') {
        targetUsers = userSelect.value;
      } else if (selectedDistribution === 'sales') {
        targetUsers = salesUsers.map(u => u.username);
      } else if (selectedDistribution === 'telesales') {
        targetUsers = telesalesUsers.map(u => u.username);
      } else if (selectedDistribution === 'both') {
        targetUsers = allSalesAndTelesales.map(u => u.username);
      } else if (selectedDistribution === 'general') {
        targetUsers = null; // null يعني غير مخصص
      }
      
      importLeadsFromExcel(savedData.rows || [], targetUsers, savedData.type);
    });
    })();
  }
}

async function importLeadsFromExcel(rows, assignedTo, selectedType) {
  const leads = await getLeads();
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  // تحديد طريقة التوزيع
  // assignedTo يمكن أن يكون: null (غير مخصص), string (مستخدم واحد), array (قائمة مستخدمين للتوزيع)
  const isArray = Array.isArray(assignedTo);
  const isSingleUser = typeof assignedTo === 'string';
  const isGeneral = assignedTo === null;
  
  // إذا كان assignedTo مصفوفة، نوزع العملاء بالتساوي
  let userIndex = 0;
  if (isArray && assignedTo.length > 0) {
    // توزيع بالتساوي على المستخدمين
    rows.forEach((row, index) => {
      try {
        const company = (row[0] || "").toString().trim();
        const phone = (row[1] || "").toString().trim();
        const storeLink = (row[2] || "").toString().trim() || "-";
        const notes = (row[3] || "").toString().trim() || "";
        
        // التحقق من البيانات المطلوبة
        if (!company || !phone) {
          errors.push(`الصف ${index + 2}: اسم الشركة ورقم الهاتف مطلوبان`);
          errorCount++;
          return;
        }
        
        // استخدام النوع المحدد من المستخدم
        const validTypes = ["cold", "hot", "hunt"];
        const finalType = validTypes.includes(selectedType) ? selectedType : "cold";
        
        // توزيع بالتساوي: نأخذ المستخدم التالي من القائمة
        const assignedUser = assignedTo[userIndex % assignedTo.length];
        userIndex++;

        const newLead = {
          id: Date.now().toString() + index,
          company: company,
          phone: phone,
          storeLink: storeLink,
          type: finalType,
          status: "new",
          assignedTo: assignedUser,
          enteredBy: currentUser.username,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // حالة الرد الافتراضية
          responseStatus: "لم يتم المحاوله",
          responseStatusUpdatedAt: new Date().toISOString(),
          notes: notes,
          convertedToMeeting: false
        };
        
        leads.push(newLead);
        successCount++;
      } catch (error) {
        errors.push(`الصف ${index + 2}: ${error.message}`);
        errorCount++;
      }
    });
  } else {
    // الحالة العادية: مستخدم واحد أو غير مخصص
    rows.forEach((row, index) => {
      try {
        const company = (row[0] || "").toString().trim();
        const phone = (row[1] || "").toString().trim();
        const storeLink = (row[2] || "").toString().trim() || "-";
        const notes = (row[3] || "").toString().trim() || "";
        
        // التحقق من البيانات المطلوبة
        if (!company || !phone) {
          errors.push(`الصف ${index + 2}: اسم الشركة ورقم الهاتف مطلوبان`);
          errorCount++;
          return;
        }
        
        // استخدام النوع المحدد من المستخدم
        const validTypes = ["cold", "hot", "hunt"];
        const finalType = validTypes.includes(selectedType) ? selectedType : "cold";
        
        const finalAssignedTo = isSingleUser ? assignedTo : null;

        const newLead = {
          id: Date.now().toString() + index,
          company: company,
          phone: phone,
          storeLink: storeLink,
          type: finalType,
          status: "new",
          assignedTo: finalAssignedTo,
          enteredBy: currentUser.username,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // حالة الرد الافتراضية
          responseStatus: "لم يتم المحاوله",
          responseStatusUpdatedAt: new Date().toISOString(),
          notes: notes,
          convertedToMeeting: false
        };
        
        leads.push(newLead);
        successCount++;
      } catch (error) {
        errors.push(`الصف ${index + 2}: ${error.message}`);
        errorCount++;
      }
    });
  }
  
  await setLeads(leads);
  
  // عرض النتيجة
  let message = `تم استيراد ${successCount} عميل بنجاح`;
  if (isArray && assignedTo.length > 0) {
    message += `\n\nتم توزيعهم بالتساوي على ${assignedTo.length} مستخدم: ${assignedTo.join(', ')}`;
  } else if (isSingleUser) {
    message += `\n\nتم تعيينهم للمستخدم: ${assignedTo}`;
  } else if (isGeneral) {
    message += `\n\nتم إضافة العملاء كعُملاء غير مخصصين ومتاحة لجميع الموظفين.`;
  }
  if (errorCount > 0) {
    message += `\n\nحدثت ${errorCount} أخطاء:\n${errors.slice(0, 5).join('\n')}`;
    if (errors.length > 5) {
      message += `\n... و ${errors.length - 5} أخطاء أخرى`;
    }
  }
  alert(message);
  
  // إعادة تحميل الجدول
  loadLeadsTable();

  // إشعار: استيراد عملاء
  if (successCount > 0) {
    pushNotification("new_lead", `تم استيراد ${successCount} عميل جديد`, ["leads_page"]);
  }
}

async function assignToMe(id) {
  const leads = await getLeads();
  const lead = leads.find(l => l.id === id);
  if (lead.assignedTo) return alert("المستخدم موجود مسبقًا");
  lead.assignedTo = currentUser.username;
  lead.status = "in-progress";
  lead.updatedAt = new Date().toISOString();
  await setLeads(leads);
  loadLeadsTable();
}

// توجيه عميل إلى موظف محدد بواسطة المدير ورئيس القسم
async function assignLeadToUser(id, username) {
  if (!username) {
    alert("يرجى اختيار موظف لتوجيه العميل له");
    return;
  }
  if (!(currentUser.role === "manager" || currentUser.role === "admin")) {
    alert("غير مصرح لك بهذا الإجراء");
    return;
  }
  const leads = await getLeads();
  const lead = leads.find(l => l.id === id);
  if (!lead) return;

  const users = await getUsers();
  const targetUser = users.find(u => u.username === username);
  if (!targetUser) {
    alert("يرجى اختيار مستخدم صالح");
    return;
  }

  // قواعد السماح بإعادة التوجيه:
  // - العملاء بحالة new: مسموح توجيهها لمن تنطبق عليه الصلاحيات أدناه
  // - العملاء بغير حالة new: مسموح للـ admin إعادة توجيهها لأي مستخدم،
  //   ومسموح للمدير إعادة توجيهها لنفسه أو لأي موظف تحت إدارته
  if (lead.status !== "new") {
    const isAdmin = currentUser.role === "admin";
    const managerCanAssignToTarget = currentUser.role === "manager" && (targetUser.username === currentUser.username || targetUser.manager === currentUser.username);
    if (!(isAdmin || managerCanAssignToTarget)) {
      alert("لا يمكنك إعادة توجيه هذا العميل إلا لنفسك أو لموظف تحت إدارتك.");
      return;
    }
  }

  // تحقق العلاقة في حالة المدير فقط (مع السماح بالتوجيه لنفسه)
  if (currentUser.role === "manager") {
    const isSelf = targetUser.username === currentUser.username;
    if (!isSelf && targetUser.manager !== currentUser.username) {
      alert("لا يمكنك توجيه العميل إلا لموظف تحت إدارتك أو لنفسك");
      return;
    }
  }

  lead.assignedTo = username;
  lead.status = "in-progress";
  lead.updatedAt = new Date().toISOString();
  await setLeads(leads);
  loadLeadsTable();
  alert(`تم توجيه العميل إلى ${username}`);

  // إشعار: توجيه عميل لمستخدم محدد (لا ترسل للمرسل إذا كان يوجه لنفسه)
  if (username !== currentUser.username) {
    pushNotification("lead_assigned", `تم توجيه عميل إليك: ${lead.company}`, [username]);
  }
}

// توزيع الاجتماعات تلقائياً على الموظفين بالتساوي حسب الإعدادات
async function assignMeetingToSalesEqually(meetings) {
  const users = await getUsers();
  const settings = await getSystemSettings();
  const distributionMode = settings.meetingDistributionMode || "sales_and_telesales";
  
  // تحديد نوع الموظفين حسب الإعدادات
  let eligibleUsers = [];
  if (distributionMode === "sales_only") {
    eligibleUsers = users.filter(u => u.role === "sales");
  } else if (distributionMode === "telesales_only") {
    eligibleUsers = users.filter(u => u.role === "telesales");
  } else if (distributionMode === "sales_and_telesales") {
    eligibleUsers = users.filter(u => u.role === "sales" || u.role === "telesales");
  }
  
  // إذا لم يكن هناك موظفين مؤهلين، لا يتم التخصيص
  if (eligibleUsers.length === 0) {
    return null;
  }
  
  // حساب عدد الاجتماعات لكل موظف
  const meetingCounts = {};
  eligibleUsers.forEach(user => {
    meetingCounts[user.username] = meetings.filter(m => m.assignedTo === user.username).length;
  });
  
  // العثور على الموظف الذي لديه أقل عدد اجتماعات
  let minCount = Infinity;
  let selectedUser = null;
  
  eligibleUsers.forEach(user => {
    const count = meetingCounts[user.username] || 0;
    if (count < minCount) {
      minCount = count;
      selectedUser = user.username;
    }
  });
  
  // إذا كان هناك تعادل، نختار الأول في القائمة
  if (selectedUser) {
    return selectedUser;
  }
  
  return null;
}

async function updateLeadStatus(id, status, callback) {
  const leads = await getLeads();
  const lead = leads.find(l => l.id === id);
  // تحويل "in-progress" إلى "failed" إذا كان موجوداً
  if (lead.status === "in-progress") {
    lead.status = "failed";
  } else {
    lead.status = status;
  }
  lead.updatedAt = new Date().toISOString();
  await setLeads(leads);
  if (callback && typeof callback === 'function') {
    callback();
  } else {
    loadLeadsTable();
  }
}

async function editNotes(id, callback) {
  const leads = await getLeads();
  const lead = leads.find(l => l.id === id);
  const note = prompt("اكتب الملاحظات:", lead.notes);
  if (note !== null) {
    lead.notes = note;
    lead.updatedAt = new Date().toISOString();
    await setLeads(leads);
    
    // مزامنة الملاحظات مع الاجتماع المرتبط (إن وجد)
    const meetings = await getMeetings();
    const relatedMeeting = meetings.find(m => m.leadId === id);
    if (relatedMeeting) {
      relatedMeeting.telesalesNotes = note;
      relatedMeeting.updatedAt = new Date().toISOString();
      await setMeetings(meetings);
    }
    
    if (callback && typeof callback === 'function') {
      callback();
    } else {
      loadLeadsTable();
    }
  }
}

// عرض نافذة منبثقة لتعديل الملاحظات (لصفحة عملائي)
async function showEditNotesModal(leadId) {
  const leads = await getLeads();
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  
  const modal = document.getElementById("editNotesModal");
  if (!modal) {
    console.error("Modal editNotesModal not found");
    return;
  }
  
  document.getElementById("editNotesLeadId").value = leadId;
  document.getElementById("editNotesText").value = lead.notes || "";
  document.getElementById("editDraftText").value = lead.draft || "";
  modal.style.display = "block";
}

function closeNotesModal() {
  const modal = document.getElementById("editNotesModal");
  if (modal) {
    modal.style.display = "none";
    document.getElementById("editNotesLeadId").value = "";
    document.getElementById("editNotesText").value = "";
    document.getElementById("editDraftText").value = "";
  }
}

// حفظ الملاحظات من النافذة المنبثقة
async function saveNotesFromModal() {
  const leadId = document.getElementById("editNotesLeadId").value;
  const notes = document.getElementById("editNotesText").value;
  const draft = document.getElementById("editDraftText").value;
  
  if (!leadId) return;
  
  const leads = await getLeads();
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  
  lead.notes = notes;
  lead.draft = draft; // حفظ المسودة
  lead.updatedAt = new Date().toISOString();
  await setLeads(leads);
  
  // مزامنة الملاحظات مع الاجتماع المرتبط (إن وجد)
  // ملاحظة: المسودة لا يتم مزامنتها مع الاجتماع
  const meetings = await getMeetings();
  const relatedMeeting = meetings.find(m => m.leadId === leadId);
  if (relatedMeeting) {
    relatedMeeting.telesalesNotes = notes;
    relatedMeeting.updatedAt = new Date().toISOString();
    await setMeetings(meetings);
  }
  
  closeNotesModal();
  loadMyLeadsTable();
}

// عرض نموذج تعديل العميل
async function showEditLeadModal(leadId) {
  const leads = await getLeads();
  const lead = leads.find(l => l.id === leadId);
  
  if (!lead) {
    alert("العميل غير موجود");
    return;
  }
  
  // التحقق من الصلاحيات
  const isAdmin = currentUser.role === "admin";
  const isManager = currentUser.role === "manager";
  const isMine = lead.assignedTo === currentUser.username;
  const canEdit = isMine || isAdmin || isManager;
  
  if (!canEdit) {
    alert("غير مصرح لك بتعديل هذا العميل");
    return;
  }
  
  // تعبئة النموذج
  document.getElementById("editLeadId").value = lead.id;
  document.getElementById("editCompany").value = lead.company;
  document.getElementById("editPhone").value = lead.phone;
  document.getElementById("editStoreLink").value = lead.storeLink !== "-" ? lead.storeLink : "";
  document.getElementById("editType").value = lead.type;
  
  // عرض النموذج
  document.getElementById("editLeadModal").style.display = "block";
}

// تحديث بيانات العميل
async function updateLead(e) {
  e.preventDefault();
  const leadId = document.getElementById("editLeadId").value;
  const company = document.getElementById("editCompany").value.trim();
  const phone = document.getElementById("editPhone").value.trim();
  const storeLink = document.getElementById("editStoreLink").value.trim() || "-";
  const type = document.getElementById("editType").value;
  
  const leads = await getLeads();
  const lead = leads.find(l => l.id === leadId);
  
  if (!lead) {
    alert("العميل غير موجود");
    return;
  }
  
  // التحقق من الصلاحيات مرة أخرى
  const isAdmin = currentUser.role === "admin";
  const isManager = currentUser.role === "manager";
  const isMine = lead.assignedTo === currentUser.username;
  const canEdit = isMine || isAdmin || isManager;
  
  if (!canEdit) {
    alert("غير مصرح لك بتعديل هذا العميل");
    return;
  }
  
  // تحديث البيانات
  lead.company = company;
  lead.phone = phone;
  lead.storeLink = storeLink;
  lead.type = type;
  lead.updatedAt = new Date().toISOString();
  
  await setLeads(leads);
  
  alert("تم تحديث بيانات العميل بنجاح!");
  closeModal();
  
  // تحديث الجداول
  if (document.getElementById("leadsTable")) {
    loadLeadsTable();
  }
  if (document.getElementById("myLeadsTable")) {
    loadMyLeadsTable();
  }
}

function getStatusText(status) {
  // تحويل in-progress إلى failed للعرض
  if (status === "in-progress") {
    status = "failed";
  }
  const map = {
    "new": "جديد",
    "in-progress": "لم يتم التحويل",
    "failed": "لم يتم التحويل",
    "done": "تم التحويل"
  };
  return map[status] || status;
}

function getResponseStatusText(value) {
  const map = {
    "لم يتم المحاوله": "لم يتم المحاوله",
    "تم الرد": "تم الرد",
    "لم يتم الرد": "لم يتم الرد",
    "اعاده التواصل": "اعاده التواصل"
  };
  return map[value] || value || "لم يتم المحاوله";
}

function getResponseStatusStyle(status) {
  const styles = {
    "لم يتم المحاوله": "background:#7f8c8d; color:#fff;",
    "تم الرد": "background:#27ae60; color:#fff;",
    "لم يتم الرد": "background:#e67e22; color:#fff;",
    "اعاده التواصل": "background:#8e44ad; color:#fff;"
  };
  return `${styles[status] || "background:#95a5a6; color:#fff;"} display:inline-block; padding:0.15rem 0.6rem; border-radius:999px; font-size:0.85rem;`;
}

async function updateResponseStatus(id, newValue, callback) {
  const allowedValues = ["لم يتم المحاوله","تم الرد","لم يتم الرد","اعاده التواصل"];
  if (!allowedValues.includes(newValue)) return;
  const leads = await getLeads();
  const lead = leads.find(l => l.id === id);
  if (!lead) return;
  // منع الرجوع إلى "لم يتم المحاوله" إذا تم تغييرها من قبل
  if (newValue === "لم يتم المحاوله" && lead.responseStatus && lead.responseStatus !== "لم يتم المحاوله") {
    alert("لا يمكن الرجوع إلى حالة 'لم يتم المحاوله'");
    if (typeof callback === 'function') callback();
    return;
  }
  lead.responseStatus = newValue;
  lead.responseStatusUpdatedAt = new Date().toISOString();
  lead.updatedAt = new Date().toISOString();
  // إعادة تعيين تحويل لاجتماع وحالة التحويل عند الرجوع إلى "لم يتم الرد" أو "اعاده التواصل"
  if (newValue === "لم يتم الرد" || newValue === "اعاده التواصل") {
    lead.convertedToMeeting = false;
    // إعادة تعيين حالة التحويل إلى "لم يتم التحويل" إذا كانت "تم التحويل"
    if (lead.status === "done") {
      lead.status = "failed";
    }
  }
  await setLeads(leads);
  if (typeof callback === 'function') callback();
}

async function autoReturnUnansweredLeads(leads) {
  let changed = false;
  const settings = await getSystemSettings();
  const hours = Math.max(1, Number(settings.autoReturnHours || 48)); // افتراضي 48 ساعة
  const THRESHOLD_MS = hours * 60 * 60 * 1000;
  const now = Date.now();
  (leads || []).forEach(lead => {
    if (lead.assignedTo && (lead.responseStatus === "لم يتم الرد")) {
      const updatedAt = new Date(lead.responseStatusUpdatedAt || lead.updatedAt || lead.createdAt).getTime();
      if (now - updatedAt >= THRESHOLD_MS) {
        // إرجاع إلى القائمة العامة
        lead.assignedTo = null;
        lead.status = "new";
        lead.responseStatus = "اعاده التواصل";
        lead.responseStatusUpdatedAt = new Date().toISOString();
        lead.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
  });
  if (changed) {
    await setLeads(leads);
  }
}

// إعدادات النظام العامة
async function getSystemSettings() {
  try {
    if (typeof database === 'undefined' || !database) {
      return {};
    }
    const settings = await getFirebaseData('settings');
    return settings || {};
  } catch (error) {
    console.error('Error getting system settings:', error);
    return {};
  }
}

async function setSystemSettings(next) {
  try {
    if (typeof database === 'undefined' || !database) {
      return false;
    }
    await setFirebaseData('settings', next || {});
    return true;
  } catch (error) {
    console.error('Error setting system settings:', error);
    return false;
  }
}
function getTypeText(type) {
  const map = {
    "cold": "Cold Lead",
    "hot": "Hot Lead",
    "hunt": "Hunt Lead"
  };
  return map[type] || type;
}

function getRoleText(role) {
  const map = {
    "admin": "مدير",
    "manager": "رئيس قسم",
    "sales": "سيلز",
    "telesales": "تلي سيلز"
  };
  return map[role] || role;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// دالة مساعدة لإنشاء قائمة منسدلة للأزرار
function createActionsMenu(buttons, uniqueId) {
  if (!buttons || buttons.length === 0) return '';
  const menuId = 'actionsMenu_' + (uniqueId || Date.now() + '_' + Math.random().toString(36).substr(2, 9));
  const buttonsHtml = buttons.map(btn => {
    if (!btn || !btn.html) return '';
    return btn.html;
  }).filter(Boolean).join('');
  
  if (!buttonsHtml) return '';
  
  return `
    <div class="actions-menu">
      <button class="actions-menu-btn" onclick="toggleActionsMenu('${menuId}')" type="button">⋯</button>
      <div class="actions-menu-dropdown" id="${menuId}">
        ${buttonsHtml}
      </div>
    </div>
  `;
}

function toggleActionsMenu(menuId) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  
  // إغلاق جميع القوائم الأخرى
  document.querySelectorAll('.actions-menu-dropdown.show').forEach(m => {
    if (m.id !== menuId) {
      m.classList.remove('show');
    }
  });
  
  // تبديل القائمة الحالية
  menu.classList.toggle('show');
}

// إغلاق القوائم عند النقر خارجها
document.addEventListener('click', function(event) {
  if (!event.target.closest('.actions-menu')) {
    document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => {
      menu.classList.remove('show');
    });
  }
});

function closeModal() {
  document.querySelectorAll(".modal").forEach(m => m.style.display = "none");
  document.querySelectorAll("form").forEach(f => f.reset());
}

function showAddModal() {
  document.getElementById("addModal").style.display = "block";
}

// صفحة المستخدمين
async function initUsersPage() {
  showLoadingPage();
  try {
    await loadCurrentUser();
    if (!checkPagePermission("users.html")) {
      return;
    }
    await loadUsersTable();
    document.getElementById("addUserForm").addEventListener("submit", addUser);
    document.getElementById("editUserForm").addEventListener("submit", editUser);
    // لوحة إعدادات المدير: زمن إعادة تدوير "لم يتم الرد"
    ensureAutoReturnSettingsUI();
    
    // إضافة مستمع لتغيير الدور لإظهار/إخفاء حقل المدير المباشر
    document.getElementById("newRole").addEventListener("change", function() {
      updateManagerFieldVisibility("newRole", "newManager");
    });
    // ملاحظة: زر تقارير جميع المستخدمين سيظهر تلقائياً بعد تحميل البيانات في loadUsersTable
    document.getElementById("editRole").addEventListener("change", function() {
      updateManagerFieldVisibility("editRole", "editManager");
    });
  } finally {
    hideLoadingPage();
  }
}

function ensureAutoReturnSettingsUI() {
  const isAdmin = currentUser.role === "admin";
  // يظهر هذا الإعداد للأدمن فقط
  if (!isAdmin) return;
  const usersTable = document.getElementById("usersTable");
  if (!usersTable) return;
  if (document.getElementById("autoReturnPanel")) return;

  (async () => {
    const settings = await getSystemSettings();
    const hours = Number(settings.autoReturnHours || 48);

  const panel = document.createElement("div");
  panel.id = "autoReturnPanel";
  panel.style.background = "#f6f7fb";
  panel.style.padding = "0.75rem";
  panel.style.borderRadius = "8px";
  panel.style.margin = "0.75rem 0";
  panel.style.display = "flex";
  panel.style.flexWrap = "wrap";
  panel.style.alignItems = "center";
  panel.style.gap = "0.6rem";
  panel.innerHTML = `
    <strong style="margin-inline-end:0.5rem;">إعدادات إعادة تدوير المكالمات</strong>
    <span style="color:#666;">(إرجاع العملاء بحالة "لم يتم الرد" إلى القائمة العامة بعد مدة محددة)</span>
    <div style="display:flex; align-items:center; gap:0.4rem; margin-inline-start:auto;">
      <label for="autoReturnHours" style="font-size:0.95rem; color:#333;">المدة بالساعات:</label>
      <input type="number" id="autoReturnHours" min="1" step="1" value="${hours}" style="width:90px; padding:0.35rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px; text-align:center;" />
      <button id="saveAutoReturnBtn" class="small" style="background:#2E3192; color:#fff; padding:0.45rem 0.8rem; border:none; border-radius:6px; cursor:pointer;">حفظ</button>
    </div>
  `;
  usersTable.parentElement.insertBefore(panel, usersTable);

  document.getElementById("saveAutoReturnBtn").addEventListener("click", async () => {
    const input = document.getElementById("autoReturnHours");
    const val = Math.max(1, Number(input.value || 0));
    const next = await getSystemSettings();
    next.autoReturnHours = val;
    await setSystemSettings(next);
    alert("تم حفظ إعدادات إعادة التدوير بنجاح.");
  });
  })();
  
  // إضافة لوحة التحكم في توزيع الاجتماعات
  ensureMeetingDistributionSettingsUI();
}

function ensureMeetingDistributionSettingsUI() {
  const isAdmin = currentUser.role === "admin";
  // يظهر هذا الإعداد للأدمن فقط
  if (!isAdmin) return;
  const usersTable = document.getElementById("usersTable");
  if (!usersTable) return;
  if (document.getElementById("meetingDistributionPanel")) return;

  (async () => {
    const settings = await getSystemSettings();
    const distributionMode = settings.meetingDistributionMode || "sales_and_telesales"; // sales_only, telesales_only, sales_and_telesales

  const panel = document.createElement("div");
  panel.id = "meetingDistributionPanel";
  panel.style.background = "#e8f5e9";
  panel.style.padding = "0.75rem";
  panel.style.borderRadius = "8px";
  panel.style.margin = "0.75rem 0";
  panel.style.display = "flex";
  panel.style.flexWrap = "wrap";
  panel.style.alignItems = "center";
  panel.style.gap = "0.6rem";
  panel.innerHTML = `
    <strong style="margin-inline-end:0.5rem;">إعدادات توزيع الاجتماعات التلقائي</strong>
    <span style="color:#666;">(تحديد من سيتم توزيع الاجتماعات عليهم تلقائياً عند التحويل)</span>
    <div style="display:flex; align-items:center; gap:0.4rem; margin-inline-start:auto;">
      <label for="meetingDistributionMode" style="font-size:0.95rem; color:#333;">نوع التوزيع:</label>
      <select id="meetingDistributionMode" style="padding:0.35rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px; min-width:200px;">
        <option value="sales_only" ${distributionMode === 'sales_only' ? 'selected' : ''}>السيلز فقط</option>
        <option value="telesales_only" ${distributionMode === 'telesales_only' ? 'selected' : ''}>التلي سيلز فقط</option>
        <option value="sales_and_telesales" ${distributionMode === 'sales_and_telesales' ? 'selected' : ''}>السيلز والتلي سيلز معاً</option>
      </select>
      <button id="saveMeetingDistributionBtn" class="small" style="background:#27ae60; color:#fff; padding:0.45rem 0.8rem; border:none; border-radius:6px; cursor:pointer;">حفظ</button>
    </div>
  `;
  usersTable.parentElement.insertBefore(panel, usersTable);

  document.getElementById("saveMeetingDistributionBtn").addEventListener("click", async () => {
    const select = document.getElementById("meetingDistributionMode");
    const mode = select.value;
    const next = await getSystemSettings();
    next.meetingDistributionMode = mode;
    await setSystemSettings(next);
    alert("تم حفظ إعدادات توزيع الاجتماعات بنجاح.");
  });
  })();
}
// تحميل قائمة رؤساء الأقسام
async function loadManagersList(selectId) {
  const users = await getUsers();
  const managers = users.filter(u => u.role === "manager" || u.role === "admin");
  const select = document.getElementById(selectId);
  
  // حفظ القيمة الحالية
  const currentValue = select.value;
  
  // مسح الخيارات القديمة (باستثناء الخيار الأول)
  select.innerHTML = '<option value="">-- اختر المدير المباشر --</option>';
  
  // إضافة رؤساء الأقسام
  managers.forEach(manager => {
    const option = document.createElement("option");
    option.value = manager.username;
    option.textContent = `${manager.username} (${getRoleText(manager.role)})`;
    select.appendChild(option);
  });
  
  // استعادة القيمة السابقة
  if (currentValue) {
    select.value = currentValue;
  }
}

// إظهار/إخفاء حقل المدير المباشر حسب الدور
function updateManagerFieldVisibility(roleSelectId, managerSelectId) {
  const roleSelect = document.getElementById(roleSelectId);
  const managerSelect = document.getElementById(managerSelectId);
  
  if (!roleSelect || !managerSelect) return;
  
  const role = roleSelect.value;
  // إظهار حقل المدير المباشر فقط للدورات التي ليست مدير أو رئيس قسم
  if (role === "sales" || role === "telesales") {
    managerSelect.style.display = "block";
    managerSelect.required = true;
  } else {
    managerSelect.style.display = "none";
    managerSelect.required = false;
    managerSelect.value = "";
  }
}

function showUserModal() {
  document.getElementById("userModal").style.display = "block";
  // إعادة تعيين النموذج
  document.getElementById("addUserForm").reset();
  document.querySelectorAll('input[name="perm"]').forEach(cb => cb.checked = false);
  // تحميل قائمة رؤساء الأقسام
  loadManagersList("newManager");
  // إظهار/إخفاء حقل المدير المباشر حسب الدور
  updateManagerFieldVisibility("newRole", "newManager");
}

async function showEditUserModal() {
  const username = prompt("أدخل اسم المستخدم الذي تريد تعديله:");
  if (!username) return;
  
  const users = await getUsers();
  const user = users.find(u => u.username === username);
  if (!user) {
    alert("المستخدم غير موجود");
    return;
  }
  
  if (user.username === "admin") {
    alert("لا يمكن تعديل حساب الأدمن");
    return;
  }
  
  // تعبئة النموذج
  document.getElementById("editUsername").value = user.username;
  document.getElementById("editUsernameDisplay").value = user.username;
  document.getElementById("editRole").value = user.role;
  document.getElementById("editPassword").value = "";
  document.getElementById("editPhone").value = user.phone || "";
  
  // تحميل قائمة رؤساء الأقسام وتعيين القيمة (باستخدام await)
  await loadManagersList("editManager");
  // تعيين القيمة بعد تحميل القائمة
  const managerSelect = document.getElementById("editManager");
  if (managerSelect && user.manager) {
    managerSelect.value = user.manager;
  }
  
  // إظهار/إخفاء حقل المدير المباشر حسب الدور
  updateManagerFieldVisibility("editRole", "editManager");
  
  // تعبئة الصلاحيات
  document.querySelectorAll('input[name="permEdit"]').forEach(cb => {
    cb.checked = (user.permissions || []).includes(cb.value);
  });
  
  document.getElementById("editUserModal").style.display = "block";
}

async function editUser(e) {
  e.preventDefault();
  const username = document.getElementById("editUsername").value;
  const password = document.getElementById("editPassword").value;
  const phone = document.getElementById("editPhone").value.trim();
  const role = document.getElementById("editRole").value;
  const manager = document.getElementById("editManager").value;
  
  // جمع الصلاحيات المحددة
  const permissions = [];
  document.querySelectorAll('input[name="permEdit"]:checked').forEach(checkbox => {
    permissions.push(checkbox.value);
  });
  
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.username === username);
  if (userIndex === -1) {
    alert("المستخدم غير موجود");
    return;
  }
  
  // تحديث البيانات
  users[userIndex].role = role;
  users[userIndex].permissions = permissions;
  users[userIndex].phone = phone || "";
  users[userIndex].manager = manager || "";
  if (password.trim()) {
    users[userIndex].password = password;
  }
  
  await setUsers(users);
  closeModal();
  loadUsersTable();
  alert("تم تحديث المستخدم بنجاح");
}

async function editUserModal(username) {
  const users = await getUsers();
  const user = users.find(u => u.username === username);
  if (!user) return;
  
  if (user.username === "admin") {
    alert("لا يمكن تعديل حساب الأدمن");
    return;
  }
  
  // تعبئة النموذج
  document.getElementById("editUsername").value = user.username;
  document.getElementById("editUsernameDisplay").value = user.username;
  document.getElementById("editRole").value = user.role;
  document.getElementById("editPassword").value = "";
  document.getElementById("editPhone").value = user.phone || "";
  
  // تحميل قائمة رؤساء الأقسام وتعيين القيمة (باستخدام await)
  await loadManagersList("editManager");
  // تعيين القيمة بعد تحميل القائمة
  const managerSelect = document.getElementById("editManager");
  if (managerSelect && user.manager) {
    managerSelect.value = user.manager;
  }
  
  // إظهار/إخفاء حقل المدير المباشر حسب الدور
  updateManagerFieldVisibility("editRole", "editManager");
  
  // تعبئة الصلاحيات
  document.querySelectorAll('input[name="permEdit"]').forEach(cb => {
    cb.checked = (user.permissions || []).includes(cb.value);
  });
  
  document.getElementById("editUserModal").style.display = "block";
}

async function addUser(e) {
  e.preventDefault();
  const username = document.getElementById("newUsername").value;
  const password = document.getElementById("newPassword").value;
  const phone = document.getElementById("newPhone").value.trim();
  const role = document.getElementById("newRole").value;
  const manager = document.getElementById("newManager").value;

  // جمع الصلاحيات المحددة
  const permissions = [];
  document.querySelectorAll('input[name="perm"]:checked').forEach(checkbox => {
    permissions.push(checkbox.value);
  });

  const users = await getUsers();
  if (users.find(u => u.username === username)) {
    alert("المستخدم موجود مسبقًا");
    return;
  }

  users.push({
    id: Date.now().toString(),
    username,
    password,
    role,
    phone: phone || "",
    manager: manager || "",
    permissions: permissions,
    isActive: true, // المستخدم الجديد مفعّل افتراضياً
    createdAt: new Date().toLocaleString()
  });
  await setUsers(users);
  closeModal();
  loadUsersTable();
}

async function loadUsersTable() {
  // إخفاء أزرار التقارير حتى يتم تحميل البيانات
  const allReportsBtn = document.getElementById("allReportsBtn");
  if (allReportsBtn) {
    allReportsBtn.style.display = "none";
  }
  
  const users = await getUsers();
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";
  
  // تصفية المستخدمين حسب الصلاحيات
  let filteredUsers = users;
  
  // إذا كان المستخدم الحالي ليس admin ولكن لديه صلاحية users.html
  if (currentUser.role !== "admin" && hasPermission("users.html")) {
    // يرى نفسه والمستخدمين الذين يرأسهم فقط
    filteredUsers = users.filter(user => {
      // إخفاء admin دائماً
      if (user.username === "admin") return false;
      // يرى نفسه
      if (user.username === currentUser.username) return true;
      // يرى المستخدمين الذين يرأسهم (الذين لديهم هذا المستخدم كمدير مباشر)
      if (user.manager === currentUser.username) return true;
      // لا يرى رؤساء الأقسام الآخرين
      return false;
    });
  } else if (currentUser.role === "admin") {
    // الأدمن يرى الجميع عدا نفسه (admin)
    filteredUsers = users.filter(user => user.username !== "admin");
  } else {
    // إذا لم يكن لديه صلاحية، لا يرى أحداً (لكن هذا لن يحدث بسبب checkPagePermission)
    filteredUsers = [];
  }
  
  filteredUsers.forEach((user) => {
    const permissions = user.permissions || [];
    const permText = permissions.length > 0 
      ? permissions.map(p => {
          const names = {
            "dashboard.html": "الرئيسية",
            "leads.html": "جميع العملاء",
            "my-leads.html": "عملائي",
            "meetings.html": "جميع الاجتماعات",
            "my-meetings.html": "اجتماعاتي",
            "users.html": "المستخدمين",
            "performance-dashboard.html": "لوحة الأداء",
            "clear.html": "مسح البيانات"
          };
          return names[p] || p;
        }).join(", ")
      : "لا توجد صلاحيات";
    
    // الحصول على اسم المدير المباشر
    const managerName = user.manager 
      ? (users.find(u => u.username === user.manager)?.username || user.manager)
      : "-";
    
    const isActive = user.isActive !== false; // افتراضياً مفعّل إذا لم يكن محدد
    const canToggle = currentUser.role === "admin" || currentUser.role === "manager";
    
    const tr = document.createElement("tr");
    tr.style.opacity = isActive ? "1" : "0.6";
    tr.innerHTML = `
      <td>${user.username} ${!isActive ? '<span style="color:#e74c3c; font-size:0.8rem;">(معطل)</span>' : ''}</td>
      <td>${getRoleText(user.role)}</td>
      <td>${user.phone || "-"}</td>
      <td>${managerName}</td>
      <td>${user.createdAt}</td>
      <td style="font-size:0.85rem; max-width:200px;">${permText}</td>
      <td>
        <button onclick="openReports('${user.username}')" style="background:#9b59b6; margin-left:0.5rem;">تقارير</button>
        <button onclick="editUserModal('${user.username}')" style="background:#3498db; margin-left:0.5rem;">تعديل</button>
        ${canToggle ? `<button onclick="toggleUserStatus('${user.username}')" style="background:${isActive ? '#e67e22' : '#27ae60'}; margin-left:0.5rem;">${isActive ? 'تعطيل' : 'تفعيل'}</button>` : ""}
        ${currentUser.role === "admin" ? `<button onclick="deleteUser('${user.username}')" style="background:#e74c3c">حذف</button>` : ""}
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // إظهار أزرار التقارير بعد تحميل البيانات
  if (allReportsBtn && (currentUser.role === "admin" || currentUser.role === "manager")) {
    allReportsBtn.style.display = "inline-block";
  }
  
  // إظهار زر التصدير للمدير فقط
  const exportUsersBtn = document.getElementById("exportUsersBtn");
  if (exportUsersBtn && currentUser.role === "admin") {
    exportUsersBtn.style.display = "inline-block";
  }
}

async function deleteUser(username) {
  if (confirm("هل تريد حذف هذا المستخدم؟")) {
    const users = await getUsers();
    const index = users.findIndex(u => u.username === username);
    if (index !== -1) {
      users.splice(index, 1);
      await setUsers(users);
      loadUsersTable();
    }
  }
}

// تعطيل/تفعيل المستخدم
async function toggleUserStatus(username) {
  const users = await getUsers();
  const user = users.find(u => u.username === username);
  
  if (!user) {
    alert("المستخدم غير موجود");
    return;
  }
  
  // التحقق من الصلاحيات
  const canToggle = currentUser.role === "admin" || currentUser.role === "manager";
  if (!canToggle) {
    alert("غير مصرح لك بهذا الإجراء");
    return;
  }
  
  const isActive = user.isActive !== false; // افتراضياً مفعّل
  const newStatus = !isActive;
  
  if (confirm(`هل تريد ${newStatus ? 'تفعيل' : 'تعطيل'} المستخدم "${username}"؟`)) {
    user.isActive = newStatus;
    await setUsers(users);
    await loadUsersTable();
    alert(`تم ${newStatus ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح`);
  }
}

// صفحة عملائي
async function initMyLeads() {
  showLoadingPage();
  try {
    await loadCurrentUser();
    if (!checkPagePermission("my-leads.html")) {
      return;
    }
    // تطبيق الإرجاع التلقائي قبل التحميل
    const leads = await getLeads();
    await autoReturnUnansweredLeads(leads);
    ensureMyLeadsFiltersUI();
    await loadMyLeadsTable();
    document.getElementById("editLeadForm")?.addEventListener("submit", updateLead);
    // إضافة event listener لنموذج تعديل الملاحظات
    document.getElementById("editNotesForm")?.addEventListener("submit", function(e) {
    e.preventDefault();
    saveNotesFromModal();
  });
    // تحديث مواضع العناصر اللاصقة
    setTimeout(() => {
      updateStickyPositions();
    }, 200);
  } finally {
    hideLoadingPage();
  }
}

function ensureMyLeadsFiltersUI() {
  const table = document.getElementById("myLeadsTable");
  if (!table) return;
  if (!document.getElementById("myLeadsFilters")) {
    const bar = document.createElement("div");
    bar.id = "myLeadsFilters";
    bar.style.display = "flex";
    bar.style.flexWrap = "wrap";
    bar.style.gap = "0.5rem";
    bar.style.margin = "0.75rem 0";
    bar.style.background = "#f6f7fb";
    bar.style.padding = "0.6rem";
    bar.style.borderRadius = "8px";
    bar.innerHTML = `
      <select id="myTypeFilter" style="min-width:180px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
        <option value="">كل الأنواع</option>
        <option value="cold">Cold Lead</option>
        <option value="hot">Hot Lead</option>
        <option value="hunt">Hunt Lead</option>
      </select>
      <select id="myResponseFilter" style="min-width:200px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
        <option value="">كل حالات الرد</option>
        <option value="لم يتم المحاوله">لم يتم المحاوله</option>
        <option value="تم الرد">تم الرد</option>
        <option value="لم يتم الرد">لم يتم الرد</option>
        <option value="اعاده التواصل">اعاده التواصل</option>
      </select>
      <select id="myCallFilter" style="min-width:200px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
        <option value="">كل حالات التحويل</option>
        <option value="new">جديد</option>
        <option value="failed">لم يتم التحويل</option>
        <option value="done">تم التحويل</option>
      </select>
      <input type="date" id="myDateFrom" style="padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;" />
      <input type="date" id="myDateTo" style="padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;" />
      <input type="text" id="mySearchInput" placeholder="بحث باسم الشركة أو الهاتف" style="min-width:220px; padding:0.4rem 0.6rem; border:1px solid #dfe3ea; border-radius:6px;" />
      <button id="myResetFilters" class="small" style="margin-inline-start:auto; background:#e67e22; color:#fff; padding:0.45rem 0.8rem; border:none; border-radius:6px; cursor:pointer;">مسح الفلاتر</button>
    `;
    table.parentElement.insertBefore(bar, table);
    const { start, end } = getCurrentMonthRange();
    const myDateFrom = document.getElementById("myDateFrom");
    const myDateTo = document.getElementById("myDateTo");
    if (myDateFrom && !myDateFrom.value) myDateFrom.value = start;
    if (myDateTo && !myDateTo.value) myDateTo.value = end;
    ["myTypeFilter","myResponseFilter","myCallFilter","myDateFrom","myDateTo"].forEach(id => {
      document.getElementById(id).addEventListener("change", loadMyLeadsTable);
    });
    document.getElementById("mySearchInput").addEventListener("input", loadMyLeadsTable);
    document.getElementById("myResetFilters").addEventListener("click", () => {
      const typeSel = document.getElementById("myTypeFilter");
      const respSel = document.getElementById("myResponseFilter");
      const callSel = document.getElementById("myCallFilter");
      const dateFrom = document.getElementById("myDateFrom");
      const dateTo = document.getElementById("myDateTo");
      const searchInput = document.getElementById("mySearchInput");
      if (typeSel) typeSel.value = "";
      if (respSel) respSel.value = "";
      if (callSel) callSel.value = "";
      if (dateFrom) dateFrom.value = "";
      if (dateTo) dateTo.value = "";
      if (searchInput) searchInput.value = "";
      loadMyLeadsTable();
    });
    
    // تحديث مواضع العناصر اللاصقة بعد إنشاء الفلاتر
    setTimeout(() => {
      updateStickyPositions();
    }, 100);
  }
}

function ensureMeetingsFiltersUI() {
  const table = document.getElementById("meetingsTable");
  if (!table || document.getElementById("meetingsFilters")) return;

  const bar = document.createElement("div");
  bar.id = "meetingsFilters";
  bar.style.display = "flex";
  bar.style.flexWrap = "wrap";
  bar.style.gap = "0.5rem";
  bar.style.margin = "0.75rem 0";
  bar.style.background = "#f6f7fb";
  bar.style.padding = "0.6rem";
  bar.style.borderRadius = "8px";

  const isAdmin = currentUser.role === "admin";
  const isManager = currentUser.role === "manager";
  let employeeSelectHtml = "";

  if (isAdmin || isManager) {
    (async () => {
      const users = await getUsers();
      let employeeUsers = [];
      if (isAdmin) {
        employeeUsers = users;
      } else {
        employeeUsers = users.filter(u => u.manager === currentUser.username);
        const selfUser = users.find(u => u.username === currentUser.username);
        if (selfUser && !employeeUsers.some(u => u.username === selfUser.username)) {
          employeeUsers.push(selfUser);
        }
      }

    const employeeOptions = ['<option value="">كل الموظفين</option>', '<option value="__unassigned">غير مخصصة</option>']
      .concat(employeeUsers
        .filter(u => u.username !== "admin" || isAdmin)
        .map(u => `<option value="${u.username}">${u.username}</option>`))
      .join("");

    employeeSelectHtml = `
      <select id="meetingsEmployeeFilter" style="min-width:180px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
        ${employeeOptions}
      </select>
    `;
    })();
  }

  bar.innerHTML = `
    <select id="meetingsTypeFilter" style="min-width:160px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
      <option value="">كل الأنواع</option>
      <option value="cold meetings">Cold</option>
      <option value="hot meetings">Hot</option>
      <option value="hunt meetings">Hunt</option>
    </select>
    <select id="meetingsStatusFilter" style="min-width:160px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
      <option value="">دخول الاجتماع</option>
      <option value="new">جديد</option>
      <option value="follow-up">إعادة متابعة</option>
      <option value="failed">فشل دخول الاجتماع</option>
      <option value="done">تم دخول الاجتماع</option>
    </select>
    <select id="meetingsConversionFilter" style="min-width:160px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
      <option value="">التعاقدات</option>
      <option value="funded">تم التعاقد</option>
      <option value="unfunded">لم يتم التعاقد</option>
    </select>
    ${employeeSelectHtml}
    <input type="date" id="meetingsDateFrom" style="padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;" />
    <input type="date" id="meetingsDateTo" style="padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;" />
    <input type="text" id="meetingsSearchInput" placeholder="بحث باسم الشركة أو الهاتف" style="min-width:220px; padding:0.4rem 0.6rem; border:1px solid #dfe3ea; border-radius:6px;" />
    <button id="meetingsResetFilters" class="small" style="margin-inline-start:auto; background:#e67e22; color:#fff; padding:0.45rem 0.8rem; border:none; border-radius:6px; cursor:pointer;">مسح الفلاتر</button>
  `;
  table.parentElement.insertBefore(bar, table);

  const { start, end } = getCurrentMonthRange();
  const meetingsDateFrom = document.getElementById("meetingsDateFrom");
  const meetingsDateTo = document.getElementById("meetingsDateTo");
  if (meetingsDateFrom && !meetingsDateFrom.value) meetingsDateFrom.value = start;
  if (meetingsDateTo && !meetingsDateTo.value) meetingsDateTo.value = end;

  ["meetingsTypeFilter", "meetingsStatusFilter", "meetingsConversionFilter", "meetingsEmployeeFilter", "meetingsDateFrom", "meetingsDateTo"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", loadMeetingsTable);
      }
    });
  document.getElementById("meetingsSearchInput").addEventListener("input", loadMeetingsTable);

  document.getElementById("meetingsResetFilters").addEventListener("click", () => {
    ["meetingsTypeFilter", "meetingsStatusFilter", "meetingsConversionFilter", "meetingsEmployeeFilter", "meetingsDateFrom", "meetingsDateTo"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const employeeEl = document.getElementById("meetingsEmployeeFilter");
    if (employeeEl) employeeEl.value = "";
    const searchInput = document.getElementById("meetingsSearchInput");
    if (searchInput) searchInput.value = "";
    loadMeetingsTable();
  });
  
  // تحديث مواضع العناصر اللاصقة بعد إنشاء الفلاتر
  setTimeout(() => {
    updateStickyPositions();
  }, 100);
}

function ensureMyMeetingsFiltersUI() {
  const table = document.getElementById("myMeetingsTable");
  if (!table || document.getElementById("myMeetingsFilters")) return;

  const bar = document.createElement("div");
  bar.id = "myMeetingsFilters";
  bar.style.display = "flex";
  bar.style.flexWrap = "wrap";
  bar.style.gap = "0.5rem";
  bar.style.margin = "0.75rem 0";
  bar.style.background = "#f6f7fb";
  bar.style.padding = "0.6rem";
  bar.style.borderRadius = "8px";
  bar.innerHTML = `
    <select id="myMeetingsTypeFilter" style="min-width:160px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
      <option value="">كل الأنواع</option>
      <option value="cold meetings">Cold</option>
      <option value="hot meetings">Hot</option>
      <option value="hunt meetings">Hunt</option>
    </select>
    <select id="myMeetingsStatusFilter" style="min-width:160px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
      <option value="">كل حالات دخول الاجتماع</option>
      <option value="new">جديد</option>
      <option value="follow-up">إعادة متابعة</option>
      <option value="failed">فشل دخول الاجتماع</option>
      <option value="done">تم دخول الاجتماع</option>
    </select>
    <select id="myMeetingsConversionFilter" style="min-width:160px; padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;">
      <option value="">كل التعاقدات</option>
      <option value="funded">تم التعاقد</option>
      <option value="unfunded">لم يتم التعاقد</option>
    </select>
    <input type="date" id="myMeetingsDateFrom" style="padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;" />
    <input type="date" id="myMeetingsDateTo" style="padding:0.4rem 0.5rem; border:1px solid #dfe3ea; border-radius:6px;" />
    <input type="text" id="myMeetingsSearchInput" placeholder="بحث باسم الشركة أو الهاتف" style="min-width:220px; padding:0.4rem 0.6rem; border:1px solid #dfe3ea; border-radius:6px;" />
    <button id="myMeetingsResetFilters" class="small" style="margin-inline-start:auto; background:#e67e22; color:#fff; padding:0.45rem 0.8rem; border:none; border-radius:6px; cursor:pointer;">مسح الفلاتر</button>
  `;
  table.parentElement.insertBefore(bar, table);

  const { start, end } = getCurrentMonthRange();
  const myMeetingsDateFrom = document.getElementById("myMeetingsDateFrom");
  const myMeetingsDateTo = document.getElementById("myMeetingsDateTo");
  if (myMeetingsDateFrom && !myMeetingsDateFrom.value) myMeetingsDateFrom.value = start;
  if (myMeetingsDateTo && !myMeetingsDateTo.value) myMeetingsDateTo.value = end;

  ["myMeetingsTypeFilter", "myMeetingsStatusFilter", "myMeetingsConversionFilter", "myMeetingsDateFrom", "myMeetingsDateTo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", loadMyMeetingsTable);
    }
  });
  document.getElementById("myMeetingsSearchInput").addEventListener("input", loadMyMeetingsTable);

  document.getElementById("myMeetingsResetFilters").addEventListener("click", () => {
    ["myMeetingsTypeFilter", "myMeetingsStatusFilter", "myMeetingsConversionFilter", "myMeetingsDateFrom", "myMeetingsDateTo"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const searchInput = document.getElementById("myMeetingsSearchInput");
    if (searchInput) searchInput.value = "";
    loadMyMeetingsTable();
  });
  
  // تحديث مواضع العناصر اللاصقة بعد إنشاء الفلاتر
  setTimeout(() => {
    updateStickyPositions();
  }, 100);
}

async function loadMyLeadsTable() {
  let leads = await getLeads();
  
  // تحويل جميع حالات in-progress إلى failed
  let needsUpdate = false;
  leads.forEach(lead => {
    if (lead.status === "in-progress") {
      lead.status = "failed";
      lead.updatedAt = new Date().toISOString();
      needsUpdate = true;
    }
  });
  if (needsUpdate) {
    await setLeads(leads);
  }
  
  let myLeads = leads
    .filter(l => l.assignedTo === currentUser.username)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // تطبيق فلاتر الصفحة
  const typeFilter = document.getElementById("myTypeFilter")?.value || "";
  const responseFilter = document.getElementById("myResponseFilter")?.value || "";
  const callFilter = document.getElementById("myCallFilter")?.value || "";
  const dateFromStr = document.getElementById("myDateFrom")?.value || "";
  const dateToStr = document.getElementById("myDateTo")?.value || "";
  const searchQuery = (document.getElementById("mySearchInput")?.value || "").trim().toLowerCase();
  const dateFrom = parseDateInput(dateFromStr);
  const dateTo = parseDateInput(dateToStr, true);
  myLeads = myLeads.filter(l => {
    const typeOk = !typeFilter || l.type === typeFilter;
    const resp = l.responseStatus || "لم يتم المحاوله";
    const responseOk = !responseFilter || resp === responseFilter;
    // تحويل in-progress إلى failed للفلترة
    const leadStatus = (l.status === "in-progress") ? "failed" : l.status;
    const callOk = !callFilter || leadStatus === callFilter;
    const createdAt = l.createdAt ? new Date(l.createdAt) : null;
    const dateOk = (!dateFrom || (createdAt && createdAt >= dateFrom)) &&
                   (!dateTo || (createdAt && createdAt <= dateTo));
    const company = (l.company || "").toLowerCase();
    const phone = (l.phone || "").toLowerCase();
    const searchOk = !searchQuery || company.includes(searchQuery) || phone.includes(searchQuery);
    return typeOk && responseOk && callOk && dateOk && searchOk;
  });

  document.getElementById("myCount").textContent = myLeads.length;

  const tbody = document.querySelector("#myLeadsTable tbody");
  tbody.innerHTML = "";

  // الحصول على جميع الاجتماعات للبحث عن ملاحظات السيلز
  const meetings = await getMeetings();
  
  myLeads.forEach((lead, i) => {
    const isConverted = lead.convertedToMeeting || false;
    const canChangeCallStatus = (lead.responseStatus === "تم الرد");
    const canConvert = !isConverted && lead.responseStatus === "تم الرد" && lead.status === "done";
    const canShowMeetingDetails = isConverted;
    
    // البحث عن الاجتماع المرتبط بالعميل للحصول على ملاحظات الاجتماع (notes)
    const relatedMeeting = meetings.find(m => m.leadId === lead.id);
    const meetingNotes = relatedMeeting && relatedMeeting.notes ? relatedMeeting.notes : "-";
    const meetingNotesDisplay = meetingNotes !== "-" 
      ? `<span title="${escapeHtml(meetingNotes)}" style="cursor: help;">${escapeHtml(meetingNotes.substring(0, 100))}${meetingNotes.length > 100 ? "..." : ""}</span>`
      : "-";
    
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${formatDateTime(lead.createdAt)}</td>
      <td>${escapeHtml(lead.company)}</td>
      <td>${formatPhoneWithIcons(lead.phone)}</td>
      <td>${lead.storeLink && lead.storeLink !== "-" ? `<a href="${lead.storeLink}" target="_blank">link</a>` : "-"}</td>
      <td>${getTypeText(lead.type)}</td>
      <td>
        <span class="status" style="${getResponseStatusStyle(lead.responseStatus)}">${getResponseStatusText(lead.responseStatus)}</span>
        <select onchange="updateResponseStatus('${lead.id}', this.value, loadMyLeadsTable)" style="margin-top:0.35rem; width:100%;">
          ${['لم يتم المحاوله','تم الرد','لم يتم الرد','اعاده التواصل'].map(val => {
            const disabledInitial = (val === 'لم يتم المحاوله' && lead.responseStatus !== 'لم يتم المحاوله');
            const selected = (lead.responseStatus || 'لم يتم المحاوله') === val ? 'selected' : '';
            return `<option value="${val}" ${selected} ${disabledInitial ? 'disabled' : ''}>${val}</option>`;
          }).join('')}
        </select>
      </td>
      <td>
        <span class="status ${lead.status}">${getStatusText(lead.status)}</span>
        <select onchange="updateLeadStatus('${lead.id}', this.value, loadMyLeadsTable)" ${canChangeCallStatus ? '' : 'disabled'} style="margin-top:0.35rem; width:100%;">
          <option value="failed" ${lead.status === 'failed' || !lead.status || lead.status === 'in-progress' ? 'selected' : ''}>لم يتم التحويل</option>
          <option value="done" ${lead.status === 'done' ? 'selected' : ''}>تم التحويل</option>
        </select>
      </td>
      <td class="notes-cell">
        <span class="notes-display" title="${escapeHtml(lead.notes || '')}" style="cursor: help;">${lead.notes ? escapeHtml(lead.notes.substring(0, 30)) + (lead.notes.length > 30 ? "..." : "") : "-"}</span>
        <button onclick="showEditNotesModal('${lead.id}')" class="small">عرض</button>
      </td>
      <td class="notes-cell" style="background: #f8f9fa; padding: 0.5rem; border-radius: 4px; font-size: 0.85rem; color: #555; max-width: 200px; cursor: help;" title="${lead.draft ? escapeHtml(lead.draft) : '-'}">
        ${lead.draft ? escapeHtml(lead.draft.substring(0, 100)) + (lead.draft.length > 100 ? "..." : "") : "-"}
      </td>
      <td class="notes-cell" style="background: #f8f9fa; padding: 0.5rem; border-radius: 4px; font-size: 0.85rem; color: #555; max-width: 200px;">
        ${meetingNotesDisplay}
      </td>
      <td>
        ${(() => {
          const buttons = [];
          if (!isConverted) {
            buttons.push({html: `<button onclick="showEditLeadModal('${lead.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(m => m.classList.remove('show'));">تعديل</button>`});
          }
          if (isConverted) {
            buttons.push({html: `<button disabled>تم التحويل</button>`});
          } else if (canConvert) {
            buttons.push({html: `<button onclick="startMeetingConversion('${lead.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(m => m.classList.remove('show'));">تحويل إلى ميتنج</button>`});
          } else {
            buttons.push({html: `<button disabled>لا يمكن التحويل إلى ميتنج</button>`});
          }
          if (canShowMeetingDetails) {
            buttons.push({html: `<button onclick="(async () => { await openMeetingDetailsForLead('${lead.id}'); })(); document.querySelectorAll('.actions-menu-dropdown.show').forEach(m => m.classList.remove('show'));">تفاصيل الاجتماع</button>`});
          }
          return createActionsMenu(buttons, lead.id);
        })()}
      </td>
    `;
    tbody.appendChild(row);
  });
}

// === نظام الميتنجز ===
// تم نقل البيانات إلى Firebase

async function startMeetingConversion(leadId) {
  const leads = await getLeads();
  const lead = leads.find(l => l.id === leadId);
  if (!lead || lead.assignedTo !== currentUser.username) {
    alert("غير مصرح");
    return;
  }
  if (lead.convertedToMeeting) {
    alert("تم تحويل هذا العميل إلى ميتنج مسبقاً");
    return;
  }
  const canConvert = lead.responseStatus === "تم الرد" && lead.status === "done";
  if (!canConvert) {
    alert("لا يمكنك تحويل العميل إلى ميتنج إلا بعد ضبط حالة الرد إلى (تم الرد) وحالة المكالمة إلى (تم التحويل).");
    return;
  }
  const meetings = await getMeetings();
  const existingMeeting = meetings.find(m => m.leadId === leadId);
  if (existingMeeting) {
    alert("تم إنشاء اجتماع لهذا العميل مسبقاً.");
    return;
  }
  ensureMeetingDetailsModal();
  meetingDetailsContext = {
    mode: "create",
    leadId: lead.id
  };
  const modal = document.getElementById("meetingDetailsModal");
  const form = document.getElementById("meetingDetailsForm");
  const info = document.getElementById("meetingDetailsInfo");
  const title = document.getElementById("meetingDetailsTitle");
  form.style.display = "block";
  info.style.display = "none";
  title.textContent = `تفاصيل الاجتماع - ${lead.company}`;
  document.getElementById("meetingDateInput").value = "";
  document.getElementById("meetingTimeInput").value = "";
  document.getElementById("meetingLinkInput").value = "";
  document.getElementById("meetingNotesInput").value = "";
  
  // إخفاء حقل ملاحظات الاجتماع عند إنشاء اجتماع جديد من صفحة عملائي
  const notesContainer = document.getElementById("meetingNotesContainer");
  if (notesContainer) {
    notesContainer.style.display = "none";
  }
  
  // إخفاء الحقول الإدارية عند إنشاء اجتماع جديد
  const adminFields = document.getElementById("adminOnlyFields");
  if (adminFields) {
    adminFields.style.display = "none";
  }
  
  // إظهار خيار تحويل الميتنج للموظف نفسه
  const assignToSelfContainer = document.getElementById("assignToSelfContainer");
  const assignToSelfCheckbox = document.getElementById("assignToSelfCheckbox");
  if (assignToSelfContainer && assignToSelfCheckbox) {
    assignToSelfContainer.style.display = "block";
    assignToSelfCheckbox.checked = false; // افتراضياً غير محدد
  }
  
  // إعداد إنشاء رابط الاجتماع تلقائياً
  setupMeetingLinkAutoGeneration();
  
  modal.style.display = "block";
}

async function assignMeeting(id) {
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  if (meeting.assignedTo) return alert("تم اختياره مسبقًا");
  meeting.assignedTo = currentUser.username;
  meeting.status = "in-progress";
  await setMeetings(meetings);
  loadMeetingsTable();
}

// توجيه اجتماع إلى موظف محدد بواسطة المدير
async function assignMeetingToUser(id, username) {
  if (!username) {
    alert("يرجى اختيار موظف لتوجيه الاجتماع له");
    return;
  }
  if (!(currentUser.role === "manager" || currentUser.role === "admin")) {
    alert("غير مصرح لك بهذا الإجراء");
    return;
  }
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  if (!meeting) return;

  const users = await getUsers();
  const targetUser = users.find(u => u.username === username);
  if (!targetUser) {
    alert("يرجى اختيار مستخدم صالح");
    return;
  }

  // قواعد السماح بإعادة التوجيه:
  // - الاجتماعات بحالة new: مسموح توجيهها لمن تنطبق عليه الصلاحيات أدناه
  // - الاجتماعات بغير حالة new: مسموح للـ admin إعادة توجيهها لأي مستخدم،
  //   ومسموح للمدير إعادة توجيهها لنفسه أو لأي موظف تحت إدارته
  if (meeting.status !== "new") {
    const isAdmin = currentUser.role === "admin";
    const managerCanAssignToTarget = currentUser.role === "manager" && (targetUser.username === currentUser.username || targetUser.manager === currentUser.username);
    if (!(isAdmin || managerCanAssignToTarget)) {
      alert("لا يمكنك إعادة توجيه هذا الاجتماع إلا لنفسك أو لموظف تحت إدارتك.");
      return;
    }
  }

  // تحقق العلاقة في حالة المدير فقط (مع السماح بالتوجيه لنفسه)
  if (currentUser.role === "manager") {
    const isSelf = targetUser.username === currentUser.username;
    if (!isSelf && targetUser.manager !== currentUser.username) {
      alert("لا يمكنك توجيه الاجتماع إلا لموظف تحت إدارتك أو لنفسك");
      return;
    }
  }

  meeting.assignedTo = username;
  meeting.status = "in-progress";
  await setMeetings(meetings);
  loadMeetingsTable();
  alert(`تم توجيه الاجتماع إلى ${username}`);

  // إشعار: توجيه اجتماع لمستخدم محدد (لا ترسل للمرسل إذا كان يوجه لنفسه)
  if (username !== currentUser.username) {
    pushNotification("meeting_assigned", `تم توجيه اجتماع إليك: ${meeting.company}`, [username]);
  }
}
async function updateMeetingStatus(id, status) {
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  if (!meeting) return;
  
  // التحقق من حالة القفل
  if (meeting.locked === true) {
    const canEditLocked = (currentUser.role === "admin" || currentUser.role === "manager");
    if (!canEditLocked) {
      alert("تم قفل هذا الاجتماع. لا يمكنك التعديل إلا عن طريق المدير أو رئيس القسم.");
      return;
    }
  }
  
  // حفظ الحالة السابقة للتحقق من التغيير
  const previousStatus = meeting.status;
  
  meeting.status = status;
  
  // إذا تم إرجاع حالة دخول الاجتماع إلى "فشل دخول الاجتماع" أو "جديد" أو "إعادة متابعة"،
  // يتم إرجاع حالة التعاقد تلقائياً إلى "لم يتم التعاقد"
  if ((status === "failed" || status === "new" || status === "in-progress" || status === "follow-up") && previousStatus === "done") {
    // إذا كانت الحالة السابقة "تم دخول الاجتماع" وتم تغييرها إلى "فشل" أو "جديد" أو "إعادة متابعة"
    if (meeting.conversion === "funded") {
      meeting.conversion = "unfunded";
      meeting.price = ""; // إزالة السعر أيضاً
    }
  }
  
  // إذا تم تغيير الحالة إلى "فشل" أو "تم"، تجميد قيمة المتابعة (followUp) على آخر قيمة مسجلة
  if ((status === "failed" || status === "done") && (previousStatus === "new" || previousStatus === "in-progress" || previousStatus === "follow-up")) {
    // الحالة الحالية للمتابعة تبقى كما هي (مجمدة)
    // لا حاجة لتغييرها
  }
  
  await setMeetings(meetings);
  
  // تحديث جدول اجتماعاتي لإظهار/إخفاء خيارات التحويل وزر الحفظ
  if (document.getElementById("myMeetingsTable")) {
    loadMyMeetingsTable();
  }
  
  // تحديث الجداول الأخرى
  if (document.getElementById("meetingsTable")) {
    loadMeetingsTable();
  }
}

// تحديث نوع المتابعة
async function updateFollowUp(meetingId, followUpType) {
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === meetingId);
  if (!meeting) return;
  
  // التحقق من أن الحالة تسمح بالتعديل (new أو in-progress أو follow-up)
  if (meeting.status !== "new" && meeting.status !== "in-progress" && meeting.status !== "follow-up") {
    alert("لا يمكن تعديل نوع المتابعة إلا عندما تكون حالة الاجتماع 'جديد' أو 'إعادة متابعة'");
    return;
  }
  
  meeting.followUp = followUpType;
  meeting.updatedAt = new Date().toISOString();
  await setMeetings(meetings);
  
  // تحديث الجداول
  if (document.getElementById("myMeetingsTable")) {
    loadMyMeetingsTable();
  }
  if (document.getElementById("meetingsTable")) {
    loadMeetingsTable();
  }
}

async function editMeetingLink(id, link) {
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  meeting.meetingLink = link;
  await setMeetings(meetings);
  loadMeetingsTable();
  loadMyMeetingsTable();
}

async function editMeetingNotes(id) {
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  if (!meeting) return;
  
  const note = prompt("الملاحظات:", meeting.notes);
  if (note !== null) {
    meeting.notes = note;
    await setMeetings(meetings);
    
    // تحديث فوري للواجهة
    const row = document.querySelector(`tr[data-meeting-id="${id}"]`);
    if (row) {
      const notesDisplay = row.querySelector('.notes-display');
      if (notesDisplay) {
        notesDisplay.textContent = escapeHtml(note.substring(0, 20)) + (note.length > 20 ? "..." : "");
      }
    }
    
    // تحديث الجداول الأخرى
    if (document.getElementById("meetingsTable")) {
      loadMeetingsTable();
    }
  }
}

async function updateConversion(id, value) {
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  if (!meeting) return;
  
  // التحقق من حالة القفل
  if (meeting.locked === true) {
    const canEditLocked = (currentUser.role === "admin" || currentUser.role === "manager");
    if (!canEditLocked) {
      alert("تم قفل هذا الاجتماع. لا يمكنك التعديل إلا عن طريق المدير أو رئيس القسم.");
      return;
    }
  }
  
  meeting.conversion = value;
  if (value === "unfunded") meeting.price = "";
  await setMeetings(meetings);
  
  // تحديث جدول اجتماعاتي لإظهار/إخفاء زر الحفظ
  if (document.getElementById("myMeetingsTable")) {
    loadMyMeetingsTable();
  }
  
  // تحديث الجداول الأخرى
  if (document.getElementById("meetingsTable")) {
    loadMeetingsTable();
  }
}

async function updatePrice(id, price) {
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  if (!meeting) return;
  
  // التحقق من حالة القفل
  if (meeting.locked === true) {
    const canEditLocked = (currentUser.role === "admin" || currentUser.role === "manager");
    if (!canEditLocked) {
      alert("تم قفل هذا الاجتماع. لا يمكنك التعديل إلا عن طريق المدير أو رئيس القسم.");
      return;
    }
  }
  
  meeting.price = price;
  await setMeetings(meetings);
  
  // تحديث فوري - السعر محفوظ في localStorage
  // لا حاجة لإعادة تحميل الجدول لأن الحقل موجود بالفعل
  // لكن نحدث الجداول الأخرى إذا كانت موجودة
  if (document.getElementById("meetingsTable")) {
    loadMeetingsTable();
  }
  // تحديث جدول اجتماعاتي لإظهار زر الحفظ إذا كانت الشروط متوفرة
  if (document.getElementById("myMeetingsTable")) {
    loadMyMeetingsTable();
  }
}

async function lockMeeting(id) {
  if (!confirm("هل أنت متأكد من قفل هذا الاجتماع؟ بعد القفل لن تتمكن من تعديل بيانات الاجتماع إلا عن طريق المدير أو رئيس القسم.")) {
    return;
  }
  
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  if (!meeting) return;
  
  // التحقق من الشروط: الحالة يجب أن تكون "تم" والتحويل "ممول" والسعر موجود
  if (meeting.status !== "done" || meeting.conversion !== "funded" || !meeting.price || meeting.price === "") {
    alert("لا يمكن قفل الاجتماع إلا إذا كانت الحالة 'تم' والتحويل 'ممول' وتم إدخال السعر.");
    return;
  }
  
  meeting.locked = true;
  meeting.lockedAt = new Date().toISOString();
  meeting.lockedBy = currentUser.username;
  await setMeetings(meetings);
  
  alert("تم قفل الاجتماع بنجاح. لن تتمكن من تعديل بياناته إلا عن طريق المدير أو رئيس القسم.");
  
  // تحديث الجداول
  if (document.getElementById("myMeetingsTable")) {
    loadMyMeetingsTable();
  }
  if (document.getElementById("meetingsTable")) {
    loadMeetingsTable();
  }
}

// إرجاع الاجتماع إلى القائمة العامة
async function returnMeetingToPool(id) {
  if (!confirm("هل تريد إرجاع هذا الاجتماع إلى القائمة العامة؟ سيتم إزالته من اجتماعاتك.")) {
    return;
  }
  
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === id);
  
  if (!meeting) {
    alert("الاجتماع غير موجود");
    return;
  }
  
  // التحقق من حالة القفل
  if (meeting.locked === true) {
    const canEditLocked = (currentUser.role === "admin" || currentUser.role === "manager");
    if (!canEditLocked) {
      alert("تم قفل هذا الاجتماع. لا يمكنك إرجاعه إلى القائمة العامة إلا عن طريق المدير أو رئيس القسم.");
      return;
    }
  }
  
  // التحقق من الصلاحيات
  const canReturn = currentUser.role === "admin" || 
                    currentUser.role === "manager" || 
                    meeting.assignedTo === currentUser.username;
  
  if (!canReturn) {
    alert("غير مصرح لك بهذا الإجراء");
    return;
  }
  
  // إرجاع الاجتماع: إزالة التخصيص وتغيير الحالة إلى جديد
  meeting.assignedTo = null;
  meeting.status = "new";
  
  await setMeetings(meetings);
  
  alert("تم إرجاع الاجتماع إلى القائمة العامة بنجاح");
  loadMyMeetingsTable();
  
  // إذا كان المستخدم في صفحة جميع الاجتماعات، قم بتحديثها أيضاً
  if (document.getElementById("meetingsTable")) {
    loadMeetingsTable();
  }
}

// صفحة جميع الميتنجز
async function initMeetingsPage() {
  showLoadingPage();
  try {
    await loadCurrentUser();
    if (!checkPagePermission("meetings.html")) {
      return;
    }
    ensureMeetingsFiltersUI();
    await loadMeetingsTable();
    // تحديث مواضع العناصر اللاصقة
    setTimeout(() => {
      updateStickyPositions();
    }, 200);
  } finally {
    hideLoadingPage();
  }
}

// صفحة جميع الميتنجز
async function loadMeetingsTable() {
  let meetings = await getMeetings();
  meetings = meetings.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const isAdmin = currentUser.role === "admin";
  const isManager = currentUser.role === "manager";
  const isSales = currentUser.role === "sales" || currentUser.role === "telesales";

  // إظهار فقط الميتنجز الجديدة (غير مخصصة) للسيلز
  if (isSales) {
    meetings = meetings.filter(m => (m.status === "new" || m.status === "in-progress" || m.status === "follow-up") && !m.assignedTo);
  }

  const typeFilter = document.getElementById("meetingsTypeFilter")?.value || "";
  const statusFilter = document.getElementById("meetingsStatusFilter")?.value || "";
  const conversionFilter = document.getElementById("meetingsConversionFilter")?.value || "";
  const employeeFilter = document.getElementById("meetingsEmployeeFilter")?.value || "";
  const dateFromStr = document.getElementById("meetingsDateFrom")?.value || "";
  const dateToStr = document.getElementById("meetingsDateTo")?.value || "";
  const searchQuery = (document.getElementById("meetingsSearchInput")?.value || "").trim().toLowerCase();
  const dateFrom = parseDateInput(dateFromStr);
  const dateTo = parseDateInput(dateToStr, true);

  meetings = meetings.filter(m => {
    const typeOk = !typeFilter || m.type === typeFilter;
    // معالجة الفلترة: إذا كان statusFilter === "new"، يجب أن يتطابق مع "new" أو "in-progress"
    const statusOk = !statusFilter || m.status === statusFilter || (statusFilter === "new" && m.status === "in-progress");
    const conversionValue = m.conversion || "unfunded";
    const conversionOk = !conversionFilter || conversionValue === conversionFilter;
    const meetingDate = (() => {
      const candidates = [m.scheduledAt, m.createdAt];
      for (const value of candidates) {
        if (!value) continue;
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    })();
    const dateOk = (!dateFrom || (meetingDate && meetingDate >= dateFrom)) &&
                   (!dateTo || (meetingDate && meetingDate <= dateTo));
    let employeeOk = true;
    if (employeeFilter === "__unassigned") {
      employeeOk = !m.assignedTo;
    } else if (employeeFilter) {
      employeeOk = m.assignedTo === employeeFilter;
    }
    const company = (m.company || "").toLowerCase();
    const phone = (m.phone || "").toLowerCase();
    const searchOk = !searchQuery || company.includes(searchQuery) || phone.includes(searchQuery);
    return typeOk && statusOk && conversionOk && employeeOk && dateOk && searchOk;
  });

  const meetingsCountEl = document.getElementById("meetingsCount");
  if (meetingsCountEl) {
    meetingsCountEl.textContent = meetings.length;
  }

  const tbody = document.querySelector("#meetingsTable tbody");
  tbody.innerHTML = "";

  // من يمكن التوجيه لهم بحسب الدور
  let assignableUsers = [];
  const usersAll = await getUsers();
  if (isManager) {
    // موظفو المدير + المدير نفسه
    assignableUsers = usersAll.filter(u => u.manager === currentUser.username && u.username !== "admin");
    const selfUser = usersAll.find(u => u.username === currentUser.username);
    if (selfUser) {
      const exists = assignableUsers.some(u => u.username === selfUser.username);
      if (!exists) assignableUsers.push(selfUser);
    }
  } else if (isAdmin) {
    // الأدمن يمكنه اختيار أي مستخدم بمن فيهم admin نفسه
    assignableUsers = usersAll.slice();
  }

  // جلب العملاء المرتبطين بالاجتماعات لمزامنة الملاحظات
  const leads = await getLeads();

  meetings.forEach((m, i) => {
    const canAssign = (m.status === "new" || m.status === "in-progress" || m.status === "follow-up") && !m.assignedTo;
    const scheduledText = m.scheduledAt ? formatDateTime(m.scheduledAt) : "لم يتم تحديده";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(m.company)}</td>
      <td>${m.phone ? formatPhoneWithIcons(m.phone) : "-"}</td>
      <td>${m.type === "hunt meetings" ? "Hunt" : (m.type === "hot meetings" ? "Hot" : "Cold")}</td>
      <td>${scheduledText}</td>
      <td>
        <span class="status ${m.status}" ${m.status === 'follow-up' ? 'style="color: #e67e22; font-weight: bold;"' : ''}>${m.status === 'done' ? 'تم دخول الاجتماع' : (m.status === 'failed' ? 'فشل دخول الاجتماع' : (m.status === 'follow-up' ? 'إعادة متابعة' : (m.status === 'in-progress' || m.status === 'new' ? (m.status === 'new' ? 'جديد' : 'تحت التنفيذ') : getStatusText(m.status))))}</span>
        ${(isManager || isAdmin) ? `
          <select onchange="updateMeetingStatus('${m.id}', this.value)" style="margin-top:0.35rem; width:100%;">
            <option value="new" ${m.status === 'new' || m.status === 'in-progress' ? 'selected' : ''}>جديد</option>
            <option value="follow-up" ${m.status === 'follow-up' ? 'selected' : ''}>إعادة متابعة</option>
            <option value="failed" ${m.status === 'failed' ? 'selected' : ''}>فشل دخول الاجتماع</option>
            <option value="done" ${m.status === 'done' ? 'selected' : ''}>تم دخول الاجتماع</option>
          </select>
        ` : ""}
      </td>
      <td>
        ${(() => {
          const canEditFollowUp = (m.status === "new" || m.status === "in-progress" || m.status === "follow-up");
          const followUpValue = m.followUp || "";
          return `
            <select onchange="updateFollowUp('${m.id}', this.value)" ${canEditFollowUp ? '' : 'disabled'} style="width:100%; padding:0.4rem; border:1px solid #ddd; border-radius:4px;">
              <option value="">-- اختر --</option>
              <option value="call" ${followUpValue === 'call' ? 'selected' : ''}>Call</option>
              <option value="whatsapp" ${followUpValue === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
            </select>
            ${!canEditFollowUp && followUpValue ? `<small style="display:block; margin-top:0.35rem; color:#7f8c8d;">${followUpValue === 'call' ? 'Call' : 'WhatsApp'}</small>` : ""}
          `;
        })()}
      </td>
      <td>${m.assignedTo || "-"}</td>
      <td class="notes-cell" style="background: #f8f9fa; padding: 0.5rem; border-radius: 4px; font-size: 0.85rem; color: #555; max-width: 200px;">
        ${(() => {
          // مزامنة ملاحظات السيلز من العميل المرتبط
          const relatedLead = leads.find(l => l.id === m.leadId);
          const salesNotes = relatedLead && relatedLead.notes ? relatedLead.notes : (m.telesalesNotes || "");
          return salesNotes ? escapeHtml(salesNotes.substring(0, 100)) + (salesNotes.length > 100 ? "..." : "") : "لا توجد ملاحظات";
        })()}
      </td>
      <td class="notes-cell">${escapeHtml(m.notes.substring(0, 20))}${m.notes.length > 20 ? "..." : ""}</td>
      <td>
        ${(() => {
          const buttons = [];
          // إضافة زر فتح رابط الاجتماع إذا كان موجوداً
          if (m.meetingLink && m.meetingLink.trim() !== "") {
            buttons.push({html: `<button onclick="window.open('${escapeHtml(m.meetingLink)}', '_blank'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));" style="background:#1a73e8; color:#fff;">دخول الاجتماع</button>`});
          }
          buttons.push({html: `<button onclick="(async () => { await viewMeetingDetails('${m.id}'); })(); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));">تفاصيل الاجتماع</button>`});
          if (isManager || isAdmin) {
            buttons.push({html: `<button onclick="openMeetingDetailsForEdit('${m.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));">تعديل الاجتماع</button>`});
          }
          if (canAssign) {
            buttons.push({html: `<button onclick="assignMeeting('${m.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));">أنا سأتابع</button>`});
          }
          if (isManager || isAdmin) {
            buttons.push({html: `
              <div style="padding:0.5rem; border-bottom:1px solid #f0f0f0;">
                <select id="assignTo_${m.id}" style="width:100%; padding:0.4rem; margin-bottom:0.5rem; border:1px solid #ddd; border-radius:4px;">
                  <option value="">— اختر موظف —</option>
                  ${assignableUsers.map(u => `<option value="${u.username}">${u.username} (${getRoleText(u.role)})</option>`).join('')}
                </select>
                <button onclick="assignMeetingToUser('${m.id}', document.getElementById('assignTo_${m.id}').value); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));" style="width:100%; padding:0.5rem; background:#2E3192; color:#fff; border:none; border-radius:4px; cursor:pointer;">توجيه</button>
              </div>
            `});
          }
          return createActionsMenu(buttons, typeof lead !== 'undefined' ? lead.id : (typeof m !== 'undefined' ? m.id : Date.now()));
        })()}
      </td>
    `;
    tbody.appendChild(row);
  });
}

// صفحة ميتنجزي
async function initMyMeetings() {
  showLoadingPage();
  try {
    await loadCurrentUser();
    if (!checkPagePermission("my-meetings.html")) {
      return;
    }
    ensureMyMeetingsFiltersUI();
    await loadMyMeetingsTable();
    // تحديث مواضع العناصر اللاصقة
    setTimeout(() => {
      updateStickyPositions();
    }, 200);
  } finally {
    hideLoadingPage();
  }
}

async function loadMyMeetingsTable() {
  let meetings = await getMeetings();
  meetings = meetings
    .filter(m => m.assignedTo === currentUser.username)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const typeFilter = document.getElementById("myMeetingsTypeFilter")?.value || "";
  const statusFilter = document.getElementById("myMeetingsStatusFilter")?.value || "";
  const conversionFilter = document.getElementById("myMeetingsConversionFilter")?.value || "";
  const dateFromStr = document.getElementById("myMeetingsDateFrom")?.value || "";
  const dateToStr = document.getElementById("myMeetingsDateTo")?.value || "";
  const searchQuery = (document.getElementById("myMeetingsSearchInput")?.value || "").trim().toLowerCase();
  const dateFrom = parseDateInput(dateFromStr);
  const dateTo = parseDateInput(dateToStr, true);

  meetings = meetings.filter(m => {
    const typeOk = !typeFilter || m.type === typeFilter;
    // معالجة الفلترة: إذا كان statusFilter === "new"، يجب أن يتطابق مع "new" أو "in-progress"
    const statusOk = !statusFilter || m.status === statusFilter || (statusFilter === "new" && m.status === "in-progress");
    const conversionValue = m.conversion || "unfunded";
    const conversionOk = !conversionFilter || conversionValue === conversionFilter;
    const meetingDate = (() => {
      const candidates = [m.scheduledAt, m.createdAt];
      for (const value of candidates) {
        if (!value) continue;
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    })();
    const dateOk = (!dateFrom || (meetingDate && meetingDate >= dateFrom)) &&
                   (!dateTo || (meetingDate && meetingDate <= dateTo));
    const company = (m.company || "").toLowerCase();
    const phone = (m.phone || "").toLowerCase();
    const searchOk = !searchQuery || company.includes(searchQuery) || phone.includes(searchQuery);
    return typeOk && statusOk && conversionOk && dateOk && searchOk;
  });

  const myMeetingCountEl = document.getElementById("myMeetingCount");
  if (myMeetingCountEl) {
    myMeetingCountEl.textContent = meetings.length;
  }
  const tbody = document.querySelector("#myMeetingsTable tbody");
  tbody.innerHTML = "";
  
  // التحقق من الصلاحيات لإرجاع الاجتماع
  const canReturn = currentUser.role === "admin" || currentUser.role === "manager";
  
  meetings.forEach((m, i) => {
    const isOwner = m.assignedTo === currentUser.username;
    const canReturnMeeting = canReturn || isOwner;
    const isLocked = m.locked === true;
    const canEditLocked = (currentUser.role === "admin" || currentUser.role === "manager");
    const canEditConversion = m.status === "done" && (!isLocked || canEditLocked);
    const showSaveButton = m.status === "done" && m.conversion === "funded" && m.price && m.price !== "" && !isLocked;
    
    const row = document.createElement("tr");
    row.setAttribute("data-meeting-id", m.id);
    const scheduledText = m.scheduledAt ? formatDateTime(m.scheduledAt) : "لم يتم تحديده";
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(m.company)}</td>
      <td>${m.phone ? formatPhoneWithIcons(m.phone) : "-"}</td>
      <td>${m.type === "cold meetings" ? "Cold" : (m.type === "hot meetings" ? "Hot" : "Hunt")}</td>
      <td>${scheduledText}</td>
      <td>
        <span class="status ${m.status}" data-status="${m.status}" ${m.status === 'follow-up' ? 'style="color: #e67e22; font-weight: bold;"' : ''}>${m.status === 'done' ? 'تم دخول الاجتماع' : (m.status === 'failed' ? 'فشل دخول الاجتماع' : (m.status === 'follow-up' ? 'إعادة متابعة' : (m.status === 'in-progress' || m.status === 'new' ? (m.status === 'new' ? 'جديد' : 'تحت التنفيذ') : getStatusText(m.status))))}</span>
        <select onchange="updateMeetingStatus('${m.id}', this.value)" ${isLocked && !canEditLocked ? 'disabled' : ''} style="margin-top:0.35rem; width:100%;">
          <option value="new" ${m.status === 'new' || m.status === 'in-progress' ? 'selected' : ''}>جديد</option>
          <option value="follow-up" ${m.status === 'follow-up' ? 'selected' : ''}>إعادة متابعة</option>
          <option value="failed" ${m.status === 'failed' ? 'selected' : ''}>فشل دخول الاجتماع</option>
          <option value="done" ${m.status === 'done' ? 'selected' : ''}>تم دخول الاجتماع</option>
        </select>
        ${isLocked && !canEditLocked ? `<small style="display:block; margin-top:0.35rem; color:#e74c3c;">تم قفل الاجتماع - التعديل متاح فقط للمدير أو رئيس القسم</small>` : ""}
      </td>
      <td>
        ${(() => {
          const canEditFollowUp = (m.status === "new" || m.status === "in-progress" || m.status === "follow-up") && (!isLocked || canEditLocked);
          const followUpValue = m.followUp || "";
          return `
            <select onchange="updateFollowUp('${m.id}', this.value)" ${canEditFollowUp ? '' : 'disabled'} style="width:100%; padding:0.4rem; border:1px solid #ddd; border-radius:4px;">
              <option value="">-- اختر --</option>
              <option value="call" ${followUpValue === 'call' ? 'selected' : ''}>Call</option>
              <option value="whatsapp" ${followUpValue === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
            </select>
            ${!canEditFollowUp && followUpValue ? `<small style="display:block; margin-top:0.35rem; color:#7f8c8d;">${followUpValue === 'call' ? 'Call' : 'WhatsApp'}</small>` : ""}
          `;
        })()}
      </td>
      <td class="conversion-cell">
        <select onchange="updateConversion('${m.id}', this.value)" ${canEditConversion ? '' : 'disabled'}>
          <option value="unfunded" ${m.conversion === 'unfunded' ? 'selected' : ''}>لم يتم التعاقد</option>
          <option value="funded" ${m.conversion === 'funded' ? 'selected' : ''}>تم التعاقد</option>
        </select>
        ${m.conversion === 'funded' ? (isLocked && !canEditLocked ? `<div style="margin-top:0.5rem; padding:0.5rem; background:#f8f9fa; border:1px solid #dee2e6; border-radius:4px; color:#495057;"><strong>السعر:</strong> ${m.price || 'غير محدد'}</div>` : `<input type="number" value="${m.price || ''}" onchange="updatePrice('${m.id}', this.value)" placeholder="السعر" class="price-input" ${canEditConversion ? '' : 'disabled'} />`) : ""}
        ${showSaveButton ? `<button onclick="lockMeeting('${m.id}')" class="small" style="background:#27ae60; color:#fff; margin-top:0.5rem; width:100%;">حفظ</button>` : ""}
        ${canEditConversion ? '' : `<small style="display:block; margin-top:0.35rem; color:#7f8c8d;">التعديل متاح اذا كانت حاله الاجتماع"تم"</small>`}
        ${isLocked && !canEditLocked ? `<small style="display:block; margin-top:0.35rem; color:#e74c3c;">تم حفظ السعر - لا يمكن التعديل</small>` : ""}
      </td>
      <td>
        ${(() => {
          const buttons = [];
          // إضافة زر فتح رابط الاجتماع إذا كان موجوداً
          if (m.meetingLink && m.meetingLink.trim() !== "") {
            buttons.push({html: `<button onclick="window.open('${escapeHtml(m.meetingLink)}', '_blank'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));" style="background:#1a73e8; color:#fff;">دخول الاجتماع</button>`});
          }
          buttons.push({html: `<button onclick="${isLocked && !canEditLocked ? 'viewMeetingDetailsLocked' : 'openMeetingDetailsForMyMeeting'}('${m.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));">تفاصيل الاجتماع</button>`});
          if (m.status === 'failed') {
            buttons.push({html: `<button onclick="registerNewMeetingFromFailed('${m.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));">تسجيل اجتماع جديد</button>`});
          }
          if (canReturnMeeting && (!isLocked || canEditLocked)) {
            buttons.push({html: `<button onclick="returnMeetingToPool('${m.id}'); document.querySelectorAll('.actions-menu-dropdown.show').forEach(menu => menu.classList.remove('show'));">إرجاع للقائمة العامة</button>`});
          }
          return createActionsMenu(buttons, m.id);
        })()}
      </td>
    `;
    tbody.appendChild(row);
  });
}

let meetingDetailsContext = null;

function ensureMeetingDetailsModal() {
  if (document.getElementById("meetingDetailsModal")) return;
  const modal = document.createElement("div");
  modal.id = "meetingDetailsModal";
  modal.className = "modal";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px;">
      <span class="close" onclick="closeMeetingDetailsModal()">×</span>
      <h2 id="meetingDetailsTitle" style="margin-bottom:1rem;">تفاصيل الاجتماع</h2>
      <div id="meetingDetailsForm">
        <label style="display:block; margin-bottom:0.35rem;">تاريخ الاجتماع</label>
        <input type="date" id="meetingDateInput" style="width:100%; padding:0.5rem; margin-bottom:0.75rem; border-radius:6px; border:1px solid #ccc;">
        <label style="display:block; margin-bottom:0.35rem;">وقت الاجتماع</label>
        <input type="time" id="meetingTimeInput" style="width:100%; padding:0.5rem; margin-bottom:0.75rem; border-radius:6px; border:1px solid #ccc;">
        <label style="display:block; margin-bottom:0.35rem;">رابط الاجتماع</label>
        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem;">
          <input type="url" id="meetingLinkInput" placeholder="https://meet.google.com/xxx-yyyy-zzz" style="flex:1; padding:0.5rem; border-radius:6px; border:1px solid #ccc;">
          <button type="button" id="createMeetingLinkBtn" onclick="createNewMeetingLink()" style="background:#1a73e8; color:#fff; border:none; padding:0.5rem 1rem; border-radius:6px; cursor:pointer; white-space:nowrap; font-size:0.9rem;">إنشاء اجتماع جديد</button>
        </div>
        <p style="font-size:0.85rem; color:#666; margin:-0.5rem 0 0.75rem 0; line-height:1.4;">انقر على "إنشاء اجتماع جديد" لفتح Google Meet</p>
        <div id="assignToSelfContainer" style="display:none; margin-bottom:1rem; padding:0.75rem; background:#f8f9fa; border-radius:6px; border:1px solid #dee2e6;">
          <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
            <input type="checkbox" id="assignToSelfCheckbox" />
            <span style="font-weight:500;">تحويل الميتنج لي وإضافته في اجتماعاتي</span>
          </label>
        </div>
        <div id="adminOnlyFields" style="display:none;">
          <label style="display:block; margin-bottom:0.35rem;">دخول الاجتماع</label>
          <select id="meetingStatusInput" style="width:100%; padding:0.5rem; margin-bottom:0.75rem; border-radius:6px; border:1px solid #ccc;">
            <option value="in-progress">تحت التنفيذ</option>
            <option value="failed">فشل دخول الاجتماع</option>
            <option value="done">تم دخول الاجتماع</option>
          </select>
          <label style="display:block; margin-bottom:0.35rem;">التعاقد</label>
          <select id="meetingConversionInput" style="width:100%; padding:0.5rem; margin-bottom:0.75rem; border-radius:6px; border:1px solid #ccc;">
            <option value="unfunded">لم يتم التعاقد</option>
            <option value="funded">تم التعاقد</option>
          </select>
          <div id="priceFieldContainer" style="display:none;">
            <label style="display:block; margin-bottom:0.35rem;">سعر التمويل</label>
            <input type="number" id="meetingPriceInput" placeholder="أدخل السعر" style="width:100%; padding:0.5rem; margin-bottom:0.75rem; border-radius:6px; border:1px solid #ccc;">
          </div>
        </div>
        <div id="meetingNotesContainer">
          <label style="display:block; margin-bottom:0.35rem;">ملاحظات الاجتماع (اختياري)</label>
          <textarea id="meetingNotesInput" rows="3" style="width:100%; padding:0.5rem; margin-bottom:1rem; border-radius:6px; border:1px solid #ccc;"></textarea>
        </div>
        <div style="display:flex; gap:0.75rem;">
          <button id="saveMeetingDetailsBtn" onclick="saveMeetingDetails()" style="background:#27ae60; color:#fff; border:none; padding:0.6rem 1.2rem; border-radius:6px; cursor:pointer;">حفظ</button>
          <button type="button" onclick="closeMeetingDetailsModal()" style="background:#95a5a6; color:#fff; border:none; padding:0.6rem 1.2rem; border-radius:6px; cursor:pointer;">إلغاء</button>
        </div>
      </div>
      <div id="meetingDetailsInfo" style="display:none; line-height:1.6; color:#333;"></div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // إضافة مستمعي الأحداث لإنشاء رابط الاجتماع تلقائياً
  setupMeetingLinkAutoGeneration();
}

// دالة لإنشاء رابط Google Meet تلقائياً باستخدام Google Calendar API
async function createNewMeetingLink() {
  const dateInput = document.getElementById("meetingDateInput");
  const timeInput = document.getElementById("meetingTimeInput");
  const linkInput = document.getElementById("meetingLinkInput");
  const titleElement = document.getElementById("meetingDetailsTitle");
  
  // التحقق من وجود التاريخ والوقت
  if (!dateInput || !timeInput || !linkInput) {
    alert('يرجى التأكد من وجود حقول التاريخ والوقت');
    return;
  }
  
  const date = dateInput.value;
  const time = timeInput.value;
  
  if (!date || !time) {
    alert('يرجى تحديد تاريخ ووقت الاجتماع أولاً');
    dateInput.focus();
    return;
  }
  
  // الحصول على اسم الشركة من العنوان
  let companyName = "اجتماع";
  if (titleElement && titleElement.textContent) {
    const match = titleElement.textContent.match(/تفاصيل الاجتماع - (.+)/);
    if (match) {
      companyName = match[1];
    }
  }
  
  // إظهار رسالة تحميل
  const originalBtn = document.getElementById("createMeetingLinkBtn");
  const originalText = originalBtn ? originalBtn.textContent : "إنشاء اجتماع جديد";
  if (originalBtn) {
    originalBtn.disabled = true;
    originalBtn.textContent = "جاري الإنشاء...";
  }
  
  try {
    // محاولة تهيئة Google API أولاً
    const apiInitialized = await initGoogleAPI();
    
    if (apiInitialized && typeof gapi !== 'undefined' && gapi.client) {
      try {
        // التحقق من تسجيل الدخول
        console.log('Requesting Google sign-in...');
        await signInToGoogle();
        
        // إنشاء رابط Google Meet باستخدام Google Calendar API
        console.log('Generating Google Meet link...');
        const meetingLink = await generateGoogleMeetLink(date, time, companyName);
        
        if (meetingLink) {
          linkInput.value = meetingLink;
          linkInput.style.backgroundColor = "#e8f5e9";
          setTimeout(() => {
            linkInput.style.backgroundColor = "";
          }, 2000);
          
          // إظهار رسالة نجاح
          alert('تم إنشاء رابط الاجتماع بنجاح!\n\nالرابط: ' + meetingLink);
          
          if (originalBtn) {
            originalBtn.disabled = false;
            originalBtn.textContent = originalText;
          }
          return;
        } else {
          throw new Error('لم يتم إنشاء رابط الاجتماع');
        }
      } catch (apiError) {
        console.error('Google API error:', apiError);
        // إذا فشل API، استخدم الطريقة البديلة
        throw apiError;
      }
    } else {
      throw new Error('Google API غير متاح');
    }
  } catch (error) {
    console.error('Error creating meeting link:', error);
    console.error('Error message:', error.message);
    
    // في حالة الفشل، افتح Google Calendar لإنشاء الاجتماع يدوياً
    const dateTime = new Date(`${date}T${time}`);
    const googleCalendarUrl = createGoogleCalendarLink(dateTime, companyName);
    const calendarWindow = window.open(googleCalendarUrl, '_blank');
    
    if (calendarWindow) {
      alert('تم فتح Google Calendar لإنشاء الاجتماع.\n\nبعد إنشاء الاجتماع:\n1. انسخ رابط Google Meet من الحدث\n2. الصق الرابط في حقل "رابط الاجتماع"\n\nخطأ API: ' + error.message);
      linkInput.placeholder = "انسخ رابط الاجتماع من Google Calendar والصقه هنا";
      linkInput.focus();
    } else {
      alert('يرجى السماح بفتح النوافذ المنبثقة لإنشاء الاجتماع\n\nخطأ: ' + error.message);
    }
  } finally {
    if (originalBtn) {
      originalBtn.disabled = false;
      originalBtn.textContent = originalText;
    }
  }
}

// دالة لإنشاء رابط Google Meet باستخدام Google Calendar API
async function generateGoogleMeetLink(date, time, title) {
  // دمج التاريخ والوقت
  const dateTime = new Date(`${date}T${time}`);
  const endDateTime = new Date(dateTime);
  endDateTime.setHours(endDateTime.getHours() + 1); // اجتماع لمدة ساعة
  
  // التحقق من وجود Google API Client
  if (typeof gapi === 'undefined' || !gapi.client) {
    throw new Error('Google API غير متاح - سيتم فتح Google Calendar');
  }
  
  // التحقق من تحميل Calendar API
  if (!gapi.client.calendar) {
    await gapi.client.load('calendar', 'v3');
  }
  
  try {
    // استخدام Google Calendar API لإنشاء حدث مع Google Meet
    const event = {
      summary: title,
      description: `اجتماع مع ${title}`,
      start: {
        dateTime: dateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    };
    
    console.log('Creating calendar event with Google Meet...');
    const response = await gapi.client.calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1
    });
    
    console.log('Calendar event created:', response);
    
    // استخراج رابط Google Meet
    if (response.result) {
      // طريقة 1: من conferenceData
      if (response.result.conferenceData && response.result.conferenceData.entryPoints) {
        const meetLink = response.result.conferenceData.entryPoints.find(
          ep => ep.entryPointType === 'video'
        );
        if (meetLink && meetLink.uri) {
          console.log('Google Meet link found:', meetLink.uri);
          return meetLink.uri;
        }
      }
      
      // طريقة 2: من hangoutLink (للتوافق مع الإصدارات القديمة)
      if (response.result.hangoutLink) {
        console.log('Google Meet link found (hangoutLink):', response.result.hangoutLink);
        return response.result.hangoutLink;
      }
      
      // طريقة 3: من location
      if (response.result.location && response.result.location.includes('meet.google.com')) {
        console.log('Google Meet link found (location):', response.result.location);
        return response.result.location;
      }
    }
    
    throw new Error('لم يتم إنشاء رابط الاجتماع في الاستجابة');
  } catch (error) {
    console.error('Error creating Google Meet link via API:', error);
    console.error('Error details:', error.message, error.stack);
    throw error;
  }
}

// دالة لإنشاء معرف اجتماع فريد
function generateMeetingId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const nums = '0123456789';
  const allChars = chars + nums;
  
  let meetingId = '';
  for (let i = 0; i < 12; i++) {
    meetingId += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  
  return meetingId.match(/.{1,3}/g).join('-');
}

// دالة لإنشاء رابط Google Calendar مع تفعيل Google Meet
function createGoogleCalendarLink(dateTime, title) {
  const endDateTime = new Date(dateTime);
  endDateTime.setHours(endDateTime.getHours() + 1);
  
  const formatForCalendar = (dt) => {
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    const hours = String(dt.getHours()).padStart(2, '0');
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}00`;
  };
  
  const start = formatForCalendar(dateTime);
  const end = formatForCalendar(endDateTime);
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details: `اجتماع مع ${title}`,
    add: 'meet' // هذا يضيف رابط Google Meet تلقائياً
  });
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// إعداد إنشاء رابط الاجتماع تلقائياً عند تحديد التاريخ والوقت
// تم إزالة هذه الوظيفة لأن الروابط الوهمية لا تعمل
// يتم استخدام زر "إنشاء اجتماع جديد" بدلاً منها
function setupMeetingLinkAutoGeneration() {
  // لا حاجة لإنشاء روابط وهمية - المستخدم سيستخدم زر "إنشاء اجتماع جديد"
  // أو سيدخل الرابط يدوياً
}

async function openMeetingDetailsForLead(leadId) {
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.leadId === leadId);
  if (!meeting) {
    alert("لم يتم إنشاء اجتماع لهذا العميل بعد. يرجى تحويل العميل إلى اجتماع أولاً.");
    return;
  }
  await viewMeetingDetails(meeting.id);
}

async function viewMeetingDetails(meetingId, hidePrice = false) {
  ensureMeetingDetailsModal();
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === meetingId);
  if (!meeting) return;
  meetingDetailsContext = { meetingId: meeting.id, mode: "view" };
  const leads = await getLeads();
  const lead = leads.find(l => l.id === meeting.leadId);
  const modal = document.getElementById("meetingDetailsModal");
  const form = document.getElementById("meetingDetailsForm");
  const info = document.getElementById("meetingDetailsInfo");
  const title = document.getElementById("meetingDetailsTitle");
  form.style.display = "none";
  info.style.display = "block";
  title.textContent = `تفاصيل الاجتماع - ${meeting.company}`;
  const scheduledText = meeting.scheduledAt ? formatDateTime(meeting.scheduledAt) : "لم يتم تحديده";
  const linkHtml = meeting.meetingLink ? `<a href="${meeting.meetingLink}" target="_blank">${meeting.meetingLink}</a>` : "لا يوجد";
  const storeLinkHtml = lead && lead.storeLink && lead.storeLink !== "-" ? `<a href="${lead.storeLink}" target="_blank">${lead.storeLink}</a>` : "لا يوجد";
  // استخدام "التعاقد" و "تم التعاقد" / "لم يتم التعاقد" في جميع الصفحات
  const conversionLabel = "التعاقد";
  const conversionText = meeting.conversion === "funded" ? "تم التعاقد" : "لم يتم التعاقد";
  const priceText = meeting.conversion === "funded" && meeting.price ? meeting.price : "غير محدد";
  const statusText = meeting.status === 'done' ? 'تم دخول الاجتماع' : (meeting.status === 'failed' ? 'فشل دخول الاجتماع' : (meeting.status === 'in-progress' ? 'تحت التنفيذ' : getStatusText(meeting.status)));
  const lockedText = meeting.locked ? " (مقفول)" : "";
  
  info.innerHTML = `
    <p><strong>الشركة:</strong> ${escapeHtml(meeting.company)}</p>
    <p><strong>تاريخ ووقت الاجتماع:</strong> ${scheduledText}</p>
    <p><strong>رابط الاجتماع:</strong> ${linkHtml}</p>
    <p><strong>رابط المتجر:</strong> ${storeLinkHtml}</p>
    <p><strong>دخول الاجتماع:</strong> ${statusText}${lockedText}</p>
    <p><strong>${conversionLabel}:</strong> ${conversionText}</p>
    ${!hidePrice && meeting.conversion === "funded" ? `<p><strong>سعر التمويل:</strong> ${priceText}</p>` : ""}
    <p><strong>ملاحظات التلي سيلز:</strong> ${meeting.telesalesNotes ? escapeHtml(meeting.telesalesNotes) : "لا توجد"}</p>
    <p><strong>ملاحظات الاجتماع:</strong> ${meeting.notes ? escapeHtml(meeting.notes) : "لا توجد"}</p>
    <p><strong>تم التحويل بواسطة:</strong> ${meeting.createdBy || "-"}</p>
    <p><strong>الموظف المتابع:</strong> ${meeting.assignedTo || "-"}</p>
    ${meeting.locked && meeting.lockedAt ? `<p><strong>تم القفل في:</strong> ${formatDateTime(meeting.lockedAt)}</p>` : ""}
    ${meeting.locked && meeting.lockedBy ? `<p><strong>تم القفل بواسطة:</strong> ${meeting.lockedBy}</p>` : ""}
    <div style="margin-top:1rem; text-align:center;">
      <button type="button" onclick="closeMeetingDetailsModal()" style="background:#2E3192; color:#fff; border:none; padding:0.6rem 1.2rem; border-radius:6px; cursor:pointer;">إغلاق</button>
    </div>
  `;
  modal.style.display = "block";
}

async function viewMeetingDetailsLocked(meetingId) {
  // عرض تفاصيل الاجتماع المقفول بدون إمكانية التعديل
  ensureMeetingDetailsModal();
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === meetingId);
  if (!meeting) {
    alert("الاجتماع غير موجود.");
    return;
  }
  await viewMeetingDetails(meetingId, true); // إخفاء سعر التمويل في صفحة عملائي
}

async function openMeetingDetailsForEdit(meetingId) {
  // فتح نموذج التعديل للمدير ورئيس القسم - يمكنهم التعديل حتى لو كان الاجتماع مقفولاً
  ensureMeetingDetailsModal();
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === meetingId);
  if (!meeting) {
    alert("الاجتماع غير موجود.");
    return;
  }
  
  // التحقق من الصلاحيات
  const canEditLocked = (currentUser.role === "admin" || currentUser.role === "manager");
  if (!canEditLocked) {
    alert("غير مصرح لك بهذا الإجراء. هذا الزر متاح فقط للمدير ورئيس القسم.");
    return;
  }
  
  meetingDetailsContext = { meetingId: meeting.id, mode: "edit" };
  const modal = document.getElementById("meetingDetailsModal");
  const form = document.getElementById("meetingDetailsForm");
  const info = document.getElementById("meetingDetailsInfo");
  const title = document.getElementById("meetingDetailsTitle");
  form.style.display = "block";
  const leads = await getLeads();
  const lead = leads.find(l => l.id === meeting.leadId);
  const storeLinkHtml = lead && lead.storeLink && lead.storeLink !== "-" ? `<a href="${lead.storeLink}" target="_blank">${lead.storeLink}</a>` : "لا يوجد";
  
  const isLocked = meeting.locked === true;
  
  info.innerHTML = `
    <div style="background:#f8f9fd; padding:0.75rem; border-radius:6px; margin-top:1rem; line-height:1.6;">
      <p style="margin:0 0 0.4rem;"><strong>رابط المتجر:</strong> ${storeLinkHtml}</p>
      <p style="margin:0 0 0.4rem;"><strong>ملاحظات التلي سيلز:</strong> ${meeting.telesalesNotes ? escapeHtml(meeting.telesalesNotes) : "لا توجد"}</p>
      <p style="margin:0;"><strong>تم التحويل بواسطة:</strong> ${meeting.createdBy || "-"}</p>
      ${isLocked ? `<p style="margin:0.4rem 0 0; color:#e67e22;"><strong>⚠️ هذا الاجتماع مقفول - أنت كمدير/رئيس قسم يمكنك التعديل عليه</strong></p>` : ""}
    </div>
  `;
  info.style.display = "block";
  title.textContent = `تعديل الاجتماع - ${meeting.company}${isLocked ? " (مقفول)" : ""}`;
  
  // ملء الحقول الأساسية
  document.getElementById("meetingDateInput").value = meeting.scheduledAt ? new Date(meeting.scheduledAt).toISOString().slice(0,10) : "";
  document.getElementById("meetingTimeInput").value = meeting.scheduledAt ? new Date(meeting.scheduledAt).toISOString().slice(11,16) : "";
  document.getElementById("meetingLinkInput").value = meeting.meetingLink || "";
  document.getElementById("meetingNotesInput").value = meeting.notes || "";
  
  // إظهار الحقول الإدارية وملؤها
  const adminFields = document.getElementById("adminOnlyFields");
  if (adminFields) {
    adminFields.style.display = "block";
    document.getElementById("meetingStatusInput").value = meeting.status || "in-progress";
    document.getElementById("meetingConversionInput").value = meeting.conversion || "unfunded";
    
    // إظهار/إخفاء حقل السعر بناءً على التحويل
    const priceContainer = document.getElementById("priceFieldContainer");
    const priceInput = document.getElementById("meetingPriceInput");
    if (meeting.conversion === "funded") {
      priceContainer.style.display = "block";
      priceInput.value = meeting.price || "";
    } else {
      priceContainer.style.display = "none";
      priceInput.value = "";
    }
    
    // إضافة event listener لتغيير التحويل
    document.getElementById("meetingConversionInput").onchange = function() {
      if (this.value === "funded") {
        priceContainer.style.display = "block";
      } else {
        priceContainer.style.display = "none";
        priceInput.value = "";
      }
    };
  }
  
  // إظهار حقل ملاحظات الاجتماع للمدير ورئيس القسم
  const notesContainer = document.getElementById("meetingNotesContainer");
  if (notesContainer) {
    notesContainer.style.display = "block";
  }
  
  // إخفاء خيار تحويل الميتنج للموظف نفسه في وضع التعديل
  const assignToSelfContainer = document.getElementById("assignToSelfContainer");
  if (assignToSelfContainer) {
    assignToSelfContainer.style.display = "none";
  }
  
  // تفعيل جميع الحقول للمدير ورئيس القسم
  document.getElementById("meetingDateInput").disabled = false;
  document.getElementById("meetingTimeInput").disabled = false;
  document.getElementById("meetingLinkInput").disabled = false;
  document.getElementById("meetingNotesInput").disabled = false;
  document.getElementById("saveMeetingDetailsBtn").disabled = false;
  if (adminFields) {
    document.getElementById("meetingStatusInput").disabled = false;
    document.getElementById("meetingConversionInput").disabled = false;
    document.getElementById("meetingPriceInput").disabled = false;
  }
  document.getElementById("saveMeetingDetailsBtn").style.opacity = "1";
  document.getElementById("saveMeetingDetailsBtn").style.cursor = "pointer";
  document.getElementById("meetingDateInput").style.pointerEvents = "auto";
  document.getElementById("meetingTimeInput").style.pointerEvents = "auto";
  document.getElementById("meetingLinkInput").style.pointerEvents = "auto";
  document.getElementById("meetingNotesInput").style.pointerEvents = "auto";
  document.getElementById("saveMeetingDetailsBtn").style.pointerEvents = "auto";
  
  modal.style.display = "block";
}

async function openMeetingDetailsForMyMeeting(meetingId) {
  ensureMeetingDetailsModal();
  const meetings = await getMeetings();
  const meeting = meetings.find(m => m.id === meetingId);
  if (!meeting) {
    alert("الاجتماع غير موجود.");
    return;
  }
  
  // التحقق من حالة القفل
  const isLocked = meeting.locked === true;
  const canEditLocked = (currentUser.role === "admin" || currentUser.role === "manager");
  if (isLocked && !canEditLocked) {
    alert("تم قفل هذا الاجتماع. لا يمكنك التعديل عليه إلا عن طريق المدير أو رئيس القسم.");
    await viewMeetingDetails(meetingId, true); // إخفاء سعر التمويل في صفحة عملائي
    return;
  }
  
  meetingDetailsContext = { meetingId: meeting.id, mode: "edit" };
  const modal = document.getElementById("meetingDetailsModal");
  const form = document.getElementById("meetingDetailsForm");
  const info = document.getElementById("meetingDetailsInfo");
  const title = document.getElementById("meetingDetailsTitle");
  form.style.display = "block";
  const leads = await getLeads();
  const lead = leads.find(l => l.id === meeting.leadId);
  const storeLinkHtml = lead && lead.storeLink && lead.storeLink !== "-" ? `<a href="${lead.storeLink}" target="_blank">${lead.storeLink}</a>` : "لا يوجد";
  
  const canEdit = !isLocked || canEditLocked;
  
  info.innerHTML = `
    <div style="background:#f8f9fd; padding:0.75rem; border-radius:6px; margin-top:1rem; line-height:1.6;">
      <p style="margin:0 0 0.4rem;"><strong>رابط المتجر:</strong> ${storeLinkHtml}</p>
      <p style="margin:0 0 0.4rem;"><strong>ملاحظات التلي سيلز:</strong> ${meeting.telesalesNotes ? escapeHtml(meeting.telesalesNotes) : "لا توجد"}</p>
      <p style="margin:0;"><strong>تم التحويل بواسطة:</strong> ${meeting.createdBy || "-"}</p>
      ${isLocked && !canEditLocked ? `<p style="margin:0.4rem 0 0; color:#e74c3c;"><strong>تم قفل الاجتماع - التعديل متاح فقط للمدير أو رئيس القسم</strong></p>` : ""}
    </div>
  `;
  info.style.display = "block";
  title.textContent = `تفاصيل الاجتماع - ${meeting.company}`;
  document.getElementById("meetingDateInput").value = meeting.scheduledAt ? new Date(meeting.scheduledAt).toISOString().slice(0,10) : "";
  document.getElementById("meetingTimeInput").value = meeting.scheduledAt ? new Date(meeting.scheduledAt).toISOString().slice(11,16) : "";
  document.getElementById("meetingLinkInput").value = meeting.meetingLink || "";
  document.getElementById("meetingNotesInput").value = meeting.notes || "";
  
  // إخفاء الحقول الإدارية للمستخدمين العاديين
  const adminFields = document.getElementById("adminOnlyFields");
  if (adminFields) {
    adminFields.style.display = "none";
  }
  
  // إظهار حقل ملاحظات الاجتماع في وضع التعديل
  const notesContainer = document.getElementById("meetingNotesContainer");
  if (notesContainer) {
    notesContainer.style.display = "block";
  }
  
  // إخفاء خيار تحويل الميتنج للموظف نفسه في وضع التعديل
  const assignToSelfContainer = document.getElementById("assignToSelfContainer");
  if (assignToSelfContainer) {
    assignToSelfContainer.style.display = "none";
  }
  
  // تعطيل الحقول إذا كان الاجتماع مقفولاً
  document.getElementById("meetingDateInput").disabled = !canEdit;
  document.getElementById("meetingTimeInput").disabled = !canEdit;
  document.getElementById("meetingLinkInput").disabled = !canEdit;
  document.getElementById("meetingNotesInput").disabled = !canEdit;
  document.getElementById("saveMeetingDetailsBtn").disabled = !canEdit;
  if (!canEdit) {
    document.getElementById("saveMeetingDetailsBtn").style.opacity = "0.6";
    document.getElementById("saveMeetingDetailsBtn").style.cursor = "not-allowed";
    // إضافة style pointer-events لمنع النقر
    document.getElementById("meetingDateInput").style.pointerEvents = "none";
    document.getElementById("meetingTimeInput").style.pointerEvents = "none";
    document.getElementById("meetingLinkInput").style.pointerEvents = "none";
    document.getElementById("meetingNotesInput").style.pointerEvents = "none";
    document.getElementById("saveMeetingDetailsBtn").style.pointerEvents = "none";
  } else {
    document.getElementById("saveMeetingDetailsBtn").style.opacity = "1";
    document.getElementById("saveMeetingDetailsBtn").style.cursor = "pointer";
    // إزالة pointer-events
    document.getElementById("meetingDateInput").style.pointerEvents = "auto";
    document.getElementById("meetingTimeInput").style.pointerEvents = "auto";
    document.getElementById("meetingLinkInput").style.pointerEvents = "auto";
    document.getElementById("meetingNotesInput").style.pointerEvents = "auto";
    document.getElementById("saveMeetingDetailsBtn").style.pointerEvents = "auto";
    
    // إعداد إنشاء رابط الاجتماع تلقائياً (للتعديل أيضاً)
    setupMeetingLinkAutoGeneration();
  }
  
  modal.style.display = "block";
}

async function saveMeetingDetails() {
  if (!meetingDetailsContext) return;
  const dateVal = document.getElementById("meetingDateInput").value;
  const timeVal = document.getElementById("meetingTimeInput").value;
  const linkVal = document.getElementById("meetingLinkInput").value.trim();
  // الحصول على ملاحظات الاجتماع فقط إذا كان الحقل مرئياً
  const notesContainer = document.getElementById("meetingNotesContainer");
  const notesVal = (notesContainer && notesContainer.style.display !== "none") 
    ? document.getElementById("meetingNotesInput").value.trim() 
    : "";

  if (!dateVal || !timeVal) {
    alert("يرجى تحديد تاريخ ووقت الاجتماع.");
    return;
  }
  // رابط الاجتماع أصبح اختياري - لا يوجد تحقق إلزامي

  const scheduledIso = new Date(`${dateVal}T${timeVal}`).toISOString();

  if (meetingDetailsContext.mode === "edit") {
    const meetings = await getMeetings();
    const meeting = meetings.find(m => m.id === meetingDetailsContext.meetingId);
    if (!meeting) return;
    
    // التحقق من حالة القفل
    if (meeting.locked === true) {
      const canEditLocked = (currentUser.role === "admin" || currentUser.role === "manager");
      if (!canEditLocked) {
        alert("تم قفل هذا الاجتماع. لا يمكنك التعديل إلا عن طريق المدير أو رئيس القسم.");
        closeMeetingDetailsModal();
        return;
      }
    }
    
    meeting.scheduledAt = scheduledIso;
    meeting.meetingLink = linkVal;
    meeting.notes = notesVal;
    
    // حفظ الحقول الإدارية إذا كانت موجودة (للمدير ورئيس القسم)
    const adminFields = document.getElementById("adminOnlyFields");
    if (adminFields && adminFields.style.display !== "none") {
      const statusInput = document.getElementById("meetingStatusInput");
      const conversionInput = document.getElementById("meetingConversionInput");
      const priceInput = document.getElementById("meetingPriceInput");
      
      if (statusInput) {
        meeting.status = statusInput.value;
      }
      if (conversionInput) {
        meeting.conversion = conversionInput.value;
        if (conversionInput.value === "funded" && priceInput) {
          meeting.price = priceInput.value || "";
        } else {
          meeting.price = "";
        }
      }
    }
    
    meeting.updatedAt = new Date().toISOString();
    await setMeetings(meetings);
    alert("تم تحديث تفاصيل الاجتماع بنجاح.");
    closeMeetingDetailsModal();
    if (document.getElementById("meetingsTable")) {
      loadMeetingsTable();
    }
    if (document.getElementById("myMeetingsTable")) {
      loadMyMeetingsTable();
    }
    if (document.getElementById("myLeadsTable")) {
      loadMyLeadsTable();
    }
  } else if (meetingDetailsContext.mode === "create") {
    const leads = await getLeads();
    const meetings = await getMeetings();
    const lead = leads.find(l => l.id === meetingDetailsContext.leadId);
    if (!lead) {
      alert("تعذر العثور على العميل.");
      return;
    }
    const existingMeeting = meetings.find(m => m.leadId === lead.id);
    if (existingMeeting) {
      alert("تم إنشاء اجتماع لهذا العميل مسبقاً.");
      closeMeetingDetailsModal();
      return;
    }
    // التحقق من خيار تحويل الميتنج للموظف نفسه
    const assignToSelfCheckbox = document.getElementById("assignToSelfCheckbox");
    let assignedTo = null;
    
    if (assignToSelfCheckbox && assignToSelfCheckbox.checked) {
      // تحويل الميتنج للموظف نفسه
      assignedTo = currentUser.username;
    } else {
      // توزيع الاجتماع تلقائياً على موظفي السيلز بالتساوي
      assignedTo = await assignMeetingToSalesEqually(meetings);
    }
    
    const newMeeting = {
      id: Date.now().toString(),
      leadId: lead.id,
      company: lead.company,
      phone: lead.phone,
      type: lead.type === "cold" ? "cold meetings" : (lead.type === "hot" ? "hot meetings" : "hunt meetings"),
      status: assignedTo ? "in-progress" : "new",
      assignedTo: assignedTo,
      createdAt: new Date().toISOString(),
      scheduledAt: scheduledIso,
      meetingLink: linkVal,
      notes: notesVal,
      telesalesNotes: lead.notes || "",
      conversion: "unfunded",
      price: "",
      createdBy: currentUser.username
    };
    meetings.push(newMeeting);
    await setMeetings(meetings);
    lead.convertedToMeeting = true;
    lead.updatedAt = new Date().toISOString();
    await setLeads(leads);
    
    // إرسال إشعار للموظف إذا تم التوزيع التلقائي أو التحويل للموظف نفسه
    if (assignedTo) {
      const assignToSelfCheckbox = document.getElementById("assignToSelfCheckbox");
      if (assignToSelfCheckbox && assignToSelfCheckbox.checked) {
        // إذا تم التحويل للموظف نفسه، لا حاجة لإرسال إشعار
        alert(`تم إنشاء الاجتماع وتحويل العميل بنجاح. تم تحويل الميتنج لك وإضافته في اجتماعاتك.`);
      } else {
        pushNotification("meeting_assigned", `تم توجيه اجتماع إليك تلقائياً: ${lead.company}`, [assignedTo]);
        alert(`تم إنشاء الاجتماع وتحويل العميل بنجاح. تم توجيه الاجتماع تلقائياً إلى ${assignedTo}.`);
      }
    } else {
      alert("تم إنشاء الاجتماع وتحويل العميل بنجاح.");
    }
    closeMeetingDetailsModal();
    if (document.getElementById("meetingsTable")) {
      loadMeetingsTable();
    }
    if (document.getElementById("myMeetingsTable")) {
      loadMyMeetingsTable();
    }
    if (document.getElementById("leadsTable")) {
      loadLeadsTable();
    }
    if (document.getElementById("myLeadsTable")) {
      loadMyLeadsTable();
    }
  } else if (meetingDetailsContext.mode === "createFromFailed") {
    const meetings = await getMeetings();
    const failedMeeting = meetings.find(m => m.id === meetingDetailsContext.failedMeetingId);
    if (!failedMeeting) {
      alert("تعذر العثور على الاجتماع الأصلي.");
      return;
    }
    
    // التحقق من أن الاجتماع فاشل
    if (failedMeeting.status !== "failed") {
      alert("يمكن تسجيل اجتماع جديد فقط للاجتماعات الفاشلة.");
      closeMeetingDetailsModal();
      return;
    }
    
    // إنشاء اجتماع جديد بنفس البيانات
    const newMeeting = {
      id: Date.now().toString(),
      leadId: failedMeeting.leadId,
      company: failedMeeting.company,
      phone: failedMeeting.phone,
      type: failedMeeting.type,
      status: "in-progress", // تلقائياً تحت التنفيذ لأنه مخصص للموظف
      assignedTo: failedMeeting.assignedTo, // نفس الموظف
      createdAt: new Date().toISOString(),
      scheduledAt: scheduledIso,
      meetingLink: linkVal,
      notes: notesVal,
      telesalesNotes: failedMeeting.telesalesNotes || "",
      conversion: "unfunded",
      price: "",
      createdBy: currentUser.username
    };
    
    meetings.push(newMeeting);
    await setMeetings(meetings);
    
    alert("تم تسجيل الاجتماع الجديد بنجاح.");
    closeMeetingDetailsModal();
    if (document.getElementById("meetingsTable")) {
      loadMeetingsTable();
    }
    if (document.getElementById("myMeetingsTable")) {
      loadMyMeetingsTable();
    }
  }
}

async function registerNewMeetingFromFailed(meetingId) {
  const meetings = await getMeetings();
  const failedMeeting = meetings.find(m => m.id === meetingId);
  if (!failedMeeting) {
    alert("الاجتماع غير موجود.");
    return;
  }
  
  // التحقق من أن الاجتماع فاشل
  if (failedMeeting.status !== "failed") {
    alert("يمكن تسجيل اجتماع جديد فقط للاجتماعات الفاشلة.");
    return;
  }
  
  // التحقق من أن الاجتماع مخصص للمستخدم الحالي
  if (failedMeeting.assignedTo !== currentUser.username) {
    alert("غير مصرح لك بهذا الإجراء.");
    return;
  }
  
  ensureMeetingDetailsModal();
  meetingDetailsContext = {
    mode: "createFromFailed",
    failedMeetingId: failedMeeting.id
  };
  const modal = document.getElementById("meetingDetailsModal");
  const form = document.getElementById("meetingDetailsForm");
  const info = document.getElementById("meetingDetailsInfo");
  const title = document.getElementById("meetingDetailsTitle");
  form.style.display = "block";
  info.style.display = "block";
  title.textContent = `تسجيل اجتماع جديد - ${failedMeeting.company}`;
  
  // عرض معلومات الاجتماع الأصلي
  const leads = await getLeads();
  const lead = leads.find(l => l.id === failedMeeting.leadId);
  const storeLinkHtml = lead && lead.storeLink && lead.storeLink !== "-" ? `<a href="${lead.storeLink}" target="_blank">${lead.storeLink}</a>` : "لا يوجد";
  
  info.innerHTML = `
    <div style="background:#f8f9fd; padding:0.75rem; border-radius:6px; margin-bottom:1rem; line-height:1.6;">
      <p style="margin:0 0 0.4rem;"><strong>الشركة:</strong> ${escapeHtml(failedMeeting.company)}</p>
      <p style="margin:0 0 0.4rem;"><strong>رقم الهاتف:</strong> ${failedMeeting.phone || "-"}</p>
      <p style="margin:0 0 0.4rem;"><strong>رابط المتجر:</strong> ${storeLinkHtml}</p>
      <p style="margin:0;"><strong>ملاحظات التلي سيلز:</strong> ${failedMeeting.telesalesNotes ? escapeHtml(failedMeeting.telesalesNotes) : "لا توجد"}</p>
    </div>
    <p style="color:#e67e22; font-weight:bold; margin-bottom:0.5rem;">يرجى إدخال تفاصيل الاجتماع الجديد:</p>
  `;
  
  // مسح الحقول
  document.getElementById("meetingDateInput").value = "";
  document.getElementById("meetingTimeInput").value = "";
  document.getElementById("meetingLinkInput").value = "";
  document.getElementById("meetingNotesInput").value = "";
  
  // إخفاء الحقول الإدارية
  const adminFields = document.getElementById("adminOnlyFields");
  if (adminFields) {
    adminFields.style.display = "none";
  }
  
  // إظهار حقل ملاحظات الاجتماع
  const notesContainer = document.getElementById("meetingNotesContainer");
  if (notesContainer) {
    notesContainer.style.display = "block";
  }
  
  // إخفاء خيار تحويل الميتنج للموظف نفسه
  const assignToSelfContainer = document.getElementById("assignToSelfContainer");
  if (assignToSelfContainer) {
    assignToSelfContainer.style.display = "none";
  }
  
  // إعداد إنشاء رابط الاجتماع تلقائياً
  setupMeetingLinkAutoGeneration();
  
  modal.style.display = "block";
}

function closeMeetingDetailsModal() {
  const modal = document.getElementById("meetingDetailsModal");
  if (modal) {
    modal.style.display = "none";
  }
  meetingDetailsContext = null;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// دوال النسخ والواتساب
function copyPhoneNumber(phone) {
  navigator.clipboard.writeText(phone).then(() => {
    alert(`تم نسخ الرقم: ${phone}`);
  }).catch(err => {
    // طريقة بديلة للنسخ
    const textArea = document.createElement("textarea");
    textArea.value = phone;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert(`تم نسخ الرقم: ${phone}`);
  });
}

function openWhatsApp(phone) {
  // تنظيف الرقم من أي رموز غير ضرورية
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  // فتح الواتساب في تبويب جديد
  window.open(`https://wa.me/${cleanPhone}`, '_blank');
}

function formatPhoneWithIcons(phone) {
  if (!phone) return "-";
  // تنظيف الرقم من أي رموز خاصة في onclick
  const cleanPhoneForJS = phone.replace(/'/g, "\\'");
  return `
    <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 200px;">
      <a href="tel:${phone}" style="flex: 1; text-decoration: none; color: #3498db;">${phone}</a>
      <button onclick="copyPhoneNumber('${cleanPhoneForJS}'); event.stopPropagation();" style="background: #3498db; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 3px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; justify-content: center;" title="نسخ الرقم">📋</button>
      <button onclick="openWhatsApp('${cleanPhoneForJS}'); event.stopPropagation();" style="background: #25D366; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 3px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; justify-content: center;" title="فتح الواتساب">💬</button>
    </div>
  `;
}

// === نظام التقارير ===
async function openReports(username) {
  try {
    // التحقق من الصلاحيات - فقط المدير ورئيس القسم
    await loadCurrentUser();
    
    if (!currentUser) {
      alert("يجب تسجيل الدخول أولاً");
      window.location.href = "index.html";
      return;
    }
    
    // التحقق من الدور - admin أو manager
    const allowedRoles = ["admin", "manager"];
    if (!allowedRoles.includes(currentUser.role)) {
      alert("غير مصرح لك بالوصول إلى التقارير. هذه الصفحة متاحة فقط للمدير ورئيس القسم.");
      return;
    }
    
    // حفظ اسم المستخدم في Firebase للوصول إليه في صفحة التقارير
    await setFirebaseData('reportUser', username);
    window.location.href = "reports.html";
  } catch (error) {
    console.error("Error in openReports:", error);
    alert("حدث خطأ أثناء فتح التقارير. يرجى المحاولة مرة أخرى.");
  }
}

async function openAllReports() {
  try {
    // التحقق من الصلاحيات - فقط المدير ورئيس القسم
    await loadCurrentUser();
    
    if (!currentUser) {
      alert("يجب تسجيل الدخول أولاً");
      window.location.href = "index.html";
      return;
    }
    
    // التحقق من الدور - admin أو manager
    const allowedRoles = ["admin", "manager"];
    if (!allowedRoles.includes(currentUser.role)) {
      alert("غير مصرح لك بالوصول إلى تقارير جميع المستخدمين. هذه الصفحة متاحة فقط للمدير ورئيس القسم.");
      return;
    }
    
    window.location.href = "all-reports.html";
  } catch (error) {
    console.error("Error in openAllReports:", error);
    alert("حدث خطأ أثناء فتح تقارير جميع المستخدمين. يرجى المحاولة مرة أخرى.");
  }
}

async function calculateReports(username, startDate, endDate) {
  const leads = await getLeads();
  const meetings = await getMeetings();
  
  // تحويل التواريخ إلى Date objects للمقارنة
  const start = startDate ? new Date(startDate) : new Date(0); // إذا لم يتم تحديد تاريخ، نبدأ من البداية
  const end = endDate ? new Date(endDate + "T23:59:59") : new Date(); // إذا لم يتم تحديد تاريخ، ننتهي الآن
  
  // تصفية البيانات حسب المستخدم والتاريخ
  const userLeads = leads.filter(lead => {
    if (lead.assignedTo !== username) return false;
    const leadDate = new Date(lead.createdAt);
    return leadDate >= start && leadDate <= end;
  });
  
  const userMeetings = meetings.filter(meeting => {
    if (meeting.assignedTo !== username) return false;
    // استخدام تاريخ إنشاء الاجتماع أو تاريخ الجدولة (أيهما متاح)
    const meetingDate = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
    return meetingDate >= start && meetingDate <= end;
  });
  
  // حساب إحصائيات Leads
  const coldLeads = userLeads.filter(l => l.type === "cold");
  const hotLeads = userLeads.filter(l => l.type === "hot");
  const huntLeads = userLeads.filter(l => l.type === "hunt");
  
  // حساب إحصائيات Leads حسب حالة الرد (responseStatus)
  const getLeadStats = (leadsArray) => ({
    total: leadsArray.length,
    notAttempted: leadsArray.filter(l => (l.responseStatus || "لم يتم المحاوله") === "لم يتم المحاوله").length,
    responded: leadsArray.filter(l => l.responseStatus === "تم الرد").length,
    noResponse: leadsArray.filter(l => l.responseStatus === "لم يتم الرد").length,
    reContact: leadsArray.filter(l => l.responseStatus === "اعاده التواصل").length
  });
  
  const coldLeadStats = getLeadStats(coldLeads);
  const hotLeadStats = getLeadStats(hotLeads);
  const huntLeadStats = getLeadStats(huntLeads);
  
  // حساب إحصائيات Meetings
  const coldMeetings = userMeetings.filter(m => m.type === "cold meetings");
  const hotMeetings = userMeetings.filter(m => m.type === "hot meetings");
  const huntMeetings = userMeetings.filter(m => m.type === "hunt meetings");
  
  // حساب إحصائيات Meetings حسب الحالة
  const getMeetingStats = (meetingsArray) => ({
    total: meetingsArray.length,
    new: meetingsArray.filter(m => m.status === "new" || m.status === "in-progress").length, // جديد يشمل new و in-progress
    followUp: meetingsArray.filter(m => m.status === "follow-up").length,
    done: meetingsArray.filter(m => m.status === "done").length,
    failed: meetingsArray.filter(m => m.status === "failed").length
  });
  
  const coldMeetingStats = getMeetingStats(coldMeetings);
  const hotMeetingStats = getMeetingStats(hotMeetings);
  const huntMeetingStats = getMeetingStats(huntMeetings);
  
  // حساب إحصائيات Meetings الممولة
  const getFundedStats = (meetingsArray) => {
    const funded = meetingsArray.filter(m => m.conversion === "funded");
    const totalPrice = funded.reduce((sum, m) => {
      const price = parseFloat(m.price) || 0;
      return sum + price;
    }, 0);
    return {
      count: funded.length,
      totalPrice: totalPrice
    };
  };
  
  const coldFunded = getFundedStats(coldMeetings);
  const hotFunded = getFundedStats(hotMeetings);
  const huntFunded = getFundedStats(huntMeetings);
  const totalFunded = getFundedStats(userMeetings);
  
  return {
    // Leads
    coldLeads: coldLeadStats,
    hotLeads: hotLeadStats,
    huntLeads: huntLeadStats,
    totalLeads: userLeads.length,
    
    // Meetings
    coldMeetings: coldMeetingStats,
    hotMeetings: hotMeetingStats,
    huntMeetings: huntMeetingStats,
    totalMeetings: userMeetings.length,
    
    // Funded Meetings
    coldFunded: coldFunded,
    hotFunded: hotFunded,
    huntFunded: huntFunded,
    totalFunded: totalFunded
  };
}

async function loadReports() {
  try {
    await loadCurrentUser();
    
    // التحقق من الصلاحيات - فقط المدير ورئيس القسم
    if (!currentUser) {
      alert("يجب تسجيل الدخول أولاً");
      window.location.href = "index.html";
      return;
    }
    
    // التحقق من الدور - admin أو manager
    const allowedRoles = ["admin", "manager"];
    if (!allowedRoles.includes(currentUser.role)) {
      alert("غير مصرح لك بالوصول إلى التقارير. هذه الصفحة متاحة فقط للمدير ورئيس القسم.");
      window.location.href = "index.html";
      return;
    }
  
  const reportUsername = await getFirebaseData('reportUser');
  if (!reportUsername) {
    alert("لم يتم تحديد مستخدم");
    window.location.href = "users.html";
    return;
  }
  
  // عرض اسم المستخدم
  document.getElementById("reportUserName").textContent = reportUsername;
  
  // تعيين التاريخ الافتراضي (الشهر الحالي)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");
  
  // استخدام formatDateForInput لتجنب مشاكل التوقيت
  startDateInput.value = formatDateForInput(firstDay);
  endDateInput.value = formatDateForInput(lastDay);
  
  // التحقق من وجود العناصر في الصفحة
  if (!startDateInput || !endDateInput) {
    throw new Error("عناصر التاريخ غير موجودة في الصفحة");
  }
  
  // حساب وعرض التقارير
  await updateReports();
  
  // إضافة مستمعي الأحداث لتحديث التقارير عند تغيير التاريخ
  startDateInput.addEventListener("change", updateReports);
  endDateInput.addEventListener("change", updateReports);
  } catch (error) {
    console.error("Error in loadReports:", error);
    console.error("Error details:", error.message, error.stack);
    alert(`حدث خطأ أثناء تحميل التقارير: ${error.message || 'خطأ غير معروف'}. يرجى المحاولة مرة أخرى.`);
  }
}

async function updateReports() {
  try {
    const reportUsername = await getFirebaseData('reportUser');
    if (!reportUsername) {
      console.error("reportUsername is null or undefined");
      return;
    }
    
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    
    if (!startDateInput || !endDateInput) {
      console.error("Date inputs not found");
      return;
    }
    
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    
    if (!startDate || !endDate) {
      alert("يرجى تحديد تاريخ البداية والنهاية");
      return;
    }
    
    const stats = await calculateReports(reportUsername, startDate, endDate);
    
    // التحقق من وجود العناصر قبل عرض البيانات
    const getElement = (id) => {
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`Element with id "${id}" not found`);
      }
      return el;
    };
    
    // الحصول على جميع العناصر
    const elements = {
      // Leads elements (حسب حالة الرد)
      coldLeadsTotal: getElement("coldLeadsTotal"),
      coldLeadsNotAttempted: getElement("coldLeadsNotAttempted"),
      coldLeadsResponded: getElement("coldLeadsResponded"),
      coldLeadsNoResponse: getElement("coldLeadsNoResponse"),
      coldLeadsReContact: getElement("coldLeadsReContact"),
      hotLeadsTotal: getElement("hotLeadsTotal"),
      hotLeadsNotAttempted: getElement("hotLeadsNotAttempted"),
      hotLeadsResponded: getElement("hotLeadsResponded"),
      hotLeadsNoResponse: getElement("hotLeadsNoResponse"),
      hotLeadsReContact: getElement("hotLeadsReContact"),
      huntLeadsTotal: getElement("huntLeadsTotal"),
      huntLeadsNotAttempted: getElement("huntLeadsNotAttempted"),
      huntLeadsResponded: getElement("huntLeadsResponded"),
      huntLeadsNoResponse: getElement("huntLeadsNoResponse"),
      huntLeadsReContact: getElement("huntLeadsReContact"),
      totalLeads: getElement("totalLeads"),
      // Meetings elements
      coldMeetingsTotal: getElement("coldMeetingsTotal"),
      coldMeetingsDone: getElement("coldMeetingsDone"),
      coldMeetingsNew: getElement("coldMeetingsNew"),
      coldMeetingsFollowUp: getElement("coldMeetingsFollowUp"),
      coldMeetingsFailed: getElement("coldMeetingsFailed"),
      hotMeetingsTotal: getElement("hotMeetingsTotal"),
      hotMeetingsDone: getElement("hotMeetingsDone"),
      hotMeetingsNew: getElement("hotMeetingsNew"),
      hotMeetingsFollowUp: getElement("hotMeetingsFollowUp"),
      hotMeetingsFailed: getElement("hotMeetingsFailed"),
      huntMeetingsTotal: getElement("huntMeetingsTotal"),
      huntMeetingsDone: getElement("huntMeetingsDone"),
      huntMeetingsNew: getElement("huntMeetingsNew"),
      huntMeetingsFollowUp: getElement("huntMeetingsFollowUp"),
      huntMeetingsFailed: getElement("huntMeetingsFailed"),
      totalMeetings: getElement("totalMeetings"),
      // Funded elements
      coldFundedCount: getElement("coldFundedCount"),
      coldFundedPrice: getElement("coldFundedPrice"),
      hotFundedCount: getElement("hotFundedCount"),
      hotFundedPrice: getElement("hotFundedPrice"),
      huntFundedCount: getElement("huntFundedCount"),
      huntFundedPrice: getElement("huntFundedPrice"),
      totalFundedCount: getElement("totalFundedCount"),
      totalFundedPrice: getElement("totalFundedPrice"),
      // Performance elements
      conversionRate: getElement("conversionRate"),
      conversionRateDetails: getElement("conversionRateDetails"),
      successRate: getElement("successRate"),
      successRateDetails: getElement("successRateDetails"),
      fundingRate: getElement("fundingRate"),
      fundingRateDetails: getElement("fundingRateDetails"),
      avgFundingValue: getElement("avgFundingValue"),
      avgFundingValueDetails: getElement("avgFundingValueDetails"),
      successfulMeetings: getElement("successfulMeetings"),
      successfulMeetingsDetails: getElement("successfulMeetingsDetails"),
      failedMeetings: getElement("failedMeetings"),
      failedMeetingsDetails: getElement("failedMeetingsDetails")
    };
  
  // عرض إحصائيات Leads (حسب حالة الرد)
  if (elements.coldLeadsTotal) elements.coldLeadsTotal.textContent = stats.coldLeads.total;
  if (elements.coldLeadsNotAttempted) elements.coldLeadsNotAttempted.textContent = stats.coldLeads.notAttempted;
  if (elements.coldLeadsResponded) elements.coldLeadsResponded.textContent = stats.coldLeads.responded;
  if (elements.coldLeadsNoResponse) elements.coldLeadsNoResponse.textContent = stats.coldLeads.noResponse;
  if (elements.coldLeadsReContact) elements.coldLeadsReContact.textContent = stats.coldLeads.reContact;
  
  if (elements.hotLeadsTotal) elements.hotLeadsTotal.textContent = stats.hotLeads.total;
  if (elements.hotLeadsNotAttempted) elements.hotLeadsNotAttempted.textContent = stats.hotLeads.notAttempted;
  if (elements.hotLeadsResponded) elements.hotLeadsResponded.textContent = stats.hotLeads.responded;
  if (elements.hotLeadsNoResponse) elements.hotLeadsNoResponse.textContent = stats.hotLeads.noResponse;
  if (elements.hotLeadsReContact) elements.hotLeadsReContact.textContent = stats.hotLeads.reContact;
  
  if (elements.huntLeadsTotal) elements.huntLeadsTotal.textContent = stats.huntLeads.total;
  if (elements.huntLeadsNotAttempted) elements.huntLeadsNotAttempted.textContent = stats.huntLeads.notAttempted;
  if (elements.huntLeadsResponded) elements.huntLeadsResponded.textContent = stats.huntLeads.responded;
  if (elements.huntLeadsNoResponse) elements.huntLeadsNoResponse.textContent = stats.huntLeads.noResponse;
  if (elements.huntLeadsReContact) elements.huntLeadsReContact.textContent = stats.huntLeads.reContact;
  
  if (elements.totalLeads) elements.totalLeads.textContent = stats.totalLeads;
  
  // عرض إحصائيات Meetings
  if (elements.coldMeetingsTotal) elements.coldMeetingsTotal.textContent = stats.coldMeetings.total;
  if (elements.coldMeetingsDone) elements.coldMeetingsDone.textContent = stats.coldMeetings.done;
  if (elements.coldMeetingsNew) elements.coldMeetingsNew.textContent = stats.coldMeetings.new;
  if (elements.coldMeetingsFollowUp) elements.coldMeetingsFollowUp.textContent = stats.coldMeetings.followUp || 0;
  if (elements.coldMeetingsFailed) elements.coldMeetingsFailed.textContent = stats.coldMeetings.failed;
  
  if (elements.hotMeetingsTotal) elements.hotMeetingsTotal.textContent = stats.hotMeetings.total;
  if (elements.hotMeetingsDone) elements.hotMeetingsDone.textContent = stats.hotMeetings.done;
  if (elements.hotMeetingsNew) elements.hotMeetingsNew.textContent = stats.hotMeetings.new;
  if (elements.hotMeetingsFollowUp) elements.hotMeetingsFollowUp.textContent = stats.hotMeetings.followUp || 0;
  if (elements.hotMeetingsFailed) elements.hotMeetingsFailed.textContent = stats.hotMeetings.failed;
  
  if (elements.huntMeetingsTotal) elements.huntMeetingsTotal.textContent = stats.huntMeetings.total;
  if (elements.huntMeetingsDone) elements.huntMeetingsDone.textContent = stats.huntMeetings.done;
  if (elements.huntMeetingsNew) elements.huntMeetingsNew.textContent = stats.huntMeetings.new;
  if (elements.huntMeetingsFollowUp) elements.huntMeetingsFollowUp.textContent = stats.huntMeetings.followUp || 0;
  if (elements.huntMeetingsFailed) elements.huntMeetingsFailed.textContent = stats.huntMeetings.failed;
  
  if (elements.totalMeetings) elements.totalMeetings.textContent = stats.totalMeetings;
  
  // عرض إحصائيات Meetings الممولة
  if (elements.coldFundedCount) elements.coldFundedCount.textContent = stats.coldFunded.count;
  if (elements.coldFundedPrice) elements.coldFundedPrice.textContent = stats.coldFunded.totalPrice.toFixed(2);
  
  if (elements.hotFundedCount) elements.hotFundedCount.textContent = stats.hotFunded.count;
  if (elements.hotFundedPrice) elements.hotFundedPrice.textContent = stats.hotFunded.totalPrice.toFixed(2);
  
  if (elements.huntFundedCount) elements.huntFundedCount.textContent = stats.huntFunded.count;
  if (elements.huntFundedPrice) elements.huntFundedPrice.textContent = stats.huntFunded.totalPrice.toFixed(2);
  
  if (elements.totalFundedCount) elements.totalFundedCount.textContent = stats.totalFunded.count;
  if (elements.totalFundedPrice) elements.totalFundedPrice.textContent = stats.totalFunded.totalPrice.toFixed(2);
  
  // حساب تقارير الأداء والمعدلات
  const conversionRate = stats.totalLeads > 0 ? ((stats.totalMeetings / stats.totalLeads) * 100).toFixed(2) : 0;
  const successRate = stats.totalMeetings > 0 ? ((stats.coldMeetings.done + stats.hotMeetings.done + stats.huntMeetings.done) / stats.totalMeetings * 100).toFixed(2) : 0;
  const fundingRate = stats.totalMeetings > 0 ? ((stats.totalFunded.count / stats.totalMeetings) * 100).toFixed(2) : 0;
  const avgFundingValue = stats.totalFunded.count > 0 ? (stats.totalFunded.totalPrice / stats.totalFunded.count).toFixed(2) : 0;
  const successfulMeetings = stats.coldMeetings.done + stats.hotMeetings.done + stats.huntMeetings.done;
  const failedMeetings = stats.coldMeetings.failed + stats.hotMeetings.failed + stats.huntMeetings.failed;
  
  if (elements.conversionRate) elements.conversionRate.textContent = conversionRate + "%";
  if (elements.conversionRateDetails) elements.conversionRateDetails.textContent = `${stats.totalMeetings} اجتماع من ${stats.totalLeads} عميل`;
  
  if (elements.successRate) elements.successRate.textContent = successRate + "%";
  if (elements.successRateDetails) elements.successRateDetails.textContent = `${successfulMeetings} اجتماع ناجح من ${stats.totalMeetings} اجتماع`;
  
  if (elements.fundingRate) elements.fundingRate.textContent = fundingRate + "%";
  if (elements.fundingRateDetails) elements.fundingRateDetails.textContent = `${stats.totalFunded.count} تعاقد من ${stats.totalMeetings} اجتماع`;
  
  if (elements.avgFundingValue) elements.avgFundingValue.textContent = avgFundingValue;
  if (elements.avgFundingValueDetails) elements.avgFundingValueDetails.textContent = `متوسط السعر لكل تعاقد`;
  
  if (elements.successfulMeetings) elements.successfulMeetings.textContent = successfulMeetings;
  if (elements.successfulMeetingsDetails) elements.successfulMeetingsDetails.textContent = `Cold: ${stats.coldMeetings.done}, Hot: ${stats.hotMeetings.done}, Hunt: ${stats.huntMeetings.done}`;
  
  if (elements.failedMeetings) elements.failedMeetings.textContent = failedMeetings;
  if (elements.failedMeetingsDetails) elements.failedMeetingsDetails.textContent = `Cold: ${stats.coldMeetings.failed}, Hot: ${stats.hotMeetings.failed}, Hunt: ${stats.huntMeetings.failed}`;
  } catch (error) {
    console.error("Error in updateReports:", error);
    console.error("Error details:", error.message, error.stack);
    alert(`حدث خطأ أثناء تحديث التقارير: ${error.message || 'خطأ غير معروف'}. يرجى المحاولة مرة أخرى.`);
  }
}

async function calculateAllUsersReports(startDate, endDate) {
  const users = await getUsers();
  const allStats = [];
  
  // تحديد المستخدمين الذين يجب عرض تقاريرهم
  let usersToShow = [];
  
  if (currentUser.role === "admin") {
    // Admin يرى جميع المستخدمين عدا admin
    usersToShow = users.filter(user => user.username !== "admin");
  } else if (currentUser.role === "manager") {
    // Manager يرى نفسه والمستخدمين الذين يرأسهم
    usersToShow = users.filter(user => 
      user.username !== "admin" && 
      (user.username === currentUser.username || user.manager === currentUser.username)
    );
  } else {
    // المستخدمون الآخرون لا يرون تقارير متعددة
    usersToShow = [];
  }
  
  // حساب التقارير لكل مستخدم
  for (const user of usersToShow) {
    const stats = await calculateReports(user.username, startDate, endDate);
    allStats.push({
      username: user.username,
      role: user.role,
      stats: stats
    });
  }
  
  return allStats;
}

async function loadAllReports() {
  try {
    await loadCurrentUser();
    
    // التحقق من الصلاحيات - فقط المدير ورئيس القسم
    if (!currentUser) {
      alert("يجب تسجيل الدخول أولاً");
      window.location.href = "index.html";
      return;
    }
    
    // التحقق من الدور - admin أو manager
    const allowedRoles = ["admin", "manager"];
    if (!allowedRoles.includes(currentUser.role)) {
      alert("غير مصرح لك بالوصول إلى تقارير جميع المستخدمين. هذه الصفحة متاحة فقط للمدير ورئيس القسم.");
      window.location.href = "index.html";
      return;
    }
  
  // لا حاجة للتحقق من وجود مستخدمين يرأسهم لأن المدير سيعرض تقاريره الشخصية على الأقل
  
  // تعيين التاريخ الافتراضي (الشهر الحالي)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");
  
  // استخدام formatDateForInput لتجنب مشاكل التوقيت
  startDateInput.value = formatDateForInput(firstDay);
  endDateInput.value = formatDateForInput(lastDay);
  
  // إخفاء صفحة التحميل
  const loadingPage = document.getElementById("loadingPage");
  if (loadingPage) {
    loadingPage.style.display = "none";
  }
  
  // حساب وعرض التقارير
  await updateAllReports();
  
  // إضافة مستمعي الأحداث لتحديث التقارير عند تغيير التاريخ
  startDateInput.addEventListener("change", updateAllReports);
  endDateInput.addEventListener("change", updateAllReports);
  } catch (error) {
    console.error("Error in loadAllReports:", error);
    // إخفاء صفحة التحميل حتى في حالة الخطأ
    const loadingPage = document.getElementById("loadingPage");
    if (loadingPage) {
      loadingPage.style.display = "none";
    }
    alert("حدث خطأ أثناء تحميل تقارير جميع المستخدمين. يرجى المحاولة مرة أخرى.");
  }
}

async function updateAllReports() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  
  if (!startDate || !endDate) {
    alert("يرجى تحديد تاريخ البداية والنهاية");
    return;
  }
  
  const allStats = await calculateAllUsersReports(startDate, endDate);
  const tbody = document.querySelector("#allReportsTable tbody");
  tbody.innerHTML = "";
  
  // حساب الإجماليات
  let totalColdLeads = 0, totalHotLeads = 0, totalHuntLeads = 0, totalLeads = 0;
  let totalColdMeetings = 0, totalHotMeetings = 0, totalHuntMeetings = 0, totalMeetings = 0;
  let totalColdFunded = 0, totalHotFunded = 0, totalHuntFunded = 0, totalFunded = 0;
  let totalColdFundedPrice = 0, totalHotFundedPrice = 0, totalHuntFundedPrice = 0, totalFundedPrice = 0;
  
  allStats.forEach(userData => {
    const { username, role, stats } = userData;
    
    // إضافة صف للمستخدم
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${username}</strong><br><small>${getRoleText(role)}</small></td>
      <td>${stats.coldLeads.total}</td>
      <td>${stats.coldLeads.notAttempted}</td>
      <td>${stats.coldLeads.responded}</td>
      <td>${stats.coldLeads.noResponse}</td>
      <td>${stats.coldLeads.reContact}</td>
      <td>${stats.hotLeads.total}</td>
      <td>${stats.hotLeads.notAttempted}</td>
      <td>${stats.hotLeads.responded}</td>
      <td>${stats.hotLeads.noResponse}</td>
      <td>${stats.hotLeads.reContact}</td>
      <td>${stats.huntLeads.total}</td>
      <td>${stats.huntLeads.notAttempted}</td>
      <td>${stats.huntLeads.responded}</td>
      <td>${stats.huntLeads.noResponse}</td>
      <td>${stats.huntLeads.reContact}</td>
      <td><strong>${stats.totalLeads}</strong></td>
      <td>${stats.coldMeetings.total}</td>
      <td>${stats.coldMeetings.new}</td>
      <td>${stats.coldMeetings.followUp || 0}</td>
      <td>${stats.coldMeetings.done}</td>
      <td>${stats.coldMeetings.failed}</td>
      <td>${stats.hotMeetings.total}</td>
      <td>${stats.hotMeetings.new}</td>
      <td>${stats.hotMeetings.followUp || 0}</td>
      <td>${stats.hotMeetings.done}</td>
      <td>${stats.hotMeetings.failed}</td>
      <td>${stats.huntMeetings.total}</td>
      <td>${stats.huntMeetings.new}</td>
      <td>${stats.huntMeetings.followUp || 0}</td>
      <td>${stats.huntMeetings.done}</td>
      <td>${stats.huntMeetings.failed}</td>
      <td><strong>${stats.totalMeetings}</strong></td>
      <td>${stats.coldFunded.count}</td>
      <td>${stats.coldFunded.totalPrice.toFixed(2)}</td>
      <td>${stats.hotFunded.count}</td>
      <td>${stats.hotFunded.totalPrice.toFixed(2)}</td>
      <td>${stats.huntFunded.count}</td>
      <td>${stats.huntFunded.totalPrice.toFixed(2)}</td>
      <td><strong>${stats.totalFunded.count}</strong></td>
      <td><strong>${stats.totalFunded.totalPrice.toFixed(2)}</strong></td>
    `;
    tbody.appendChild(tr);
    
    // جمع الإجماليات
    totalColdLeads += stats.coldLeads.total;
    totalHotLeads += stats.hotLeads.total;
    totalHuntLeads += stats.huntLeads.total;
    totalLeads += stats.totalLeads;
    
    totalColdMeetings += stats.coldMeetings.total;
    totalHotMeetings += stats.hotMeetings.total;
    totalHuntMeetings += stats.huntMeetings.total;
    totalMeetings += stats.totalMeetings;
    
    totalColdFunded += stats.coldFunded.count;
    totalHotFunded += stats.hotFunded.count;
    totalHuntFunded += stats.huntFunded.count;
    totalFunded += stats.totalFunded.count;
    
    totalColdFundedPrice += stats.coldFunded.totalPrice;
    totalHotFundedPrice += stats.hotFunded.totalPrice;
    totalHuntFundedPrice += stats.huntFunded.totalPrice;
    totalFundedPrice += stats.totalFunded.totalPrice;
  });
  
  // إضافة صف الإجمالي
  const totalRow = document.createElement("tr");
  totalRow.className = "total-row";
  totalRow.innerHTML = `
    <td><strong>الإجمالي</strong></td>
    <td><strong>${totalColdLeads}</strong></td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td><strong>${totalHotLeads}</strong></td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td><strong>${totalHuntLeads}</strong></td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td><strong>${totalLeads}</strong></td>
    <td><strong>${totalColdMeetings}</strong></td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td><strong>${totalHotMeetings}</strong></td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td><strong>${totalHuntMeetings}</strong></td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td><strong>${totalMeetings}</strong></td>
    <td><strong>${totalColdFunded}</strong></td>
    <td><strong>${totalColdFundedPrice.toFixed(2)}</strong></td>
    <td><strong>${totalHotFunded}</strong></td>
    <td><strong>${totalHotFundedPrice.toFixed(2)}</strong></td>
    <td><strong>${totalHuntFunded}</strong></td>
    <td><strong>${totalHuntFundedPrice.toFixed(2)}</strong></td>
    <td><strong>${totalFunded}</strong></td>
    <td><strong>${totalFundedPrice.toFixed(2)}</strong></td>
  `;
  tbody.appendChild(totalRow);
}

// === لوحة تحكم الأداء ===
// متغيرات عامة للمخططات
let funnelChart = null;
let conversionByTypeChart = null;
let contractDonutChart = null;

async function calculateAndDisplayKPIs(monthFilter = "all") {
  try {
    const leads = await getLeads();
    const meetings = await getMeetings();
    
    // فلترة البيانات حسب الشهر
    let filteredLeads = leads;
    let filteredMeetings = meetings;
    
    if (monthFilter !== "all") {
      const [year, month] = monthFilter.split("-");
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
      
      filteredLeads = leads.filter(lead => {
        const leadDate = new Date(lead.createdAt);
        return leadDate >= startDate && leadDate <= endDate;
      });
      
      filteredMeetings = meetings.filter(meeting => {
        const meetingDate = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
        return meetingDate >= startDate && meetingDate <= endDate;
      });
    }
    
    // حساب KPIs
    const kpis = calculateKPIs(filteredLeads, filteredMeetings);
    
    // حساب KPIs للشهر السابق (للمقارنة MoM)
    let previousMonthKPIs = null;
    if (monthFilter !== "all") {
      const [year, month] = monthFilter.split("-");
      const prevMonth = parseInt(month) - 1;
      const prevYear = prevMonth === 0 ? parseInt(year) - 1 : parseInt(year);
      const prevMonthStr = `${prevYear}-${String(prevMonth === 0 ? 12 : prevMonth).padStart(2, '0')}`;
      
      const prevStartDate = new Date(prevYear, prevMonth === 0 ? 11 : prevMonth - 1, 1);
      const prevEndDate = new Date(prevYear, prevMonth === 0 ? 12 : prevMonth, 0, 23, 59, 59);
      
      const prevLeads = leads.filter(lead => {
        const leadDate = new Date(lead.createdAt);
        return leadDate >= prevStartDate && leadDate <= prevEndDate;
      });
      
      const prevMeetings = meetings.filter(meeting => {
        const meetingDate = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
        return meetingDate >= prevStartDate && meetingDate <= prevEndDate;
      });
      
      previousMonthKPIs = calculateKPIs(prevLeads, prevMeetings);
    }
    
    // عرض KPIs
    displayKPIs(kpis, previousMonthKPIs);
    
    // إنشاء المخططات
    createFunnelChart(filteredLeads, filteredMeetings);
    createConversionByTypeChart(filteredLeads, filteredMeetings);
    createContractDonutChart(filteredMeetings);
    
    // إنشاء جدول KPIs الشهري
    await createKPIMonthlyTable(monthFilter);
    
  } catch (error) {
    console.error("Error calculating KPIs:", error);
    alert("حدث خطأ أثناء حساب البيانات. يرجى المحاولة مرة أخرى.");
  }
}

function calculateKPIs(leads, meetings) {
  // KPI 1: إجمالي محاولات الاتصال (Leads where responseStatus is NOT 'لم يتم المحاوله')
  const kpi1 = leads.filter(l => (l.responseStatus || "لم يتم المحاوله") !== "لم يتم المحاوله").length;
  
  // KPI 2: الأرقام الجديدة الواردة (Total new leads created)
  const kpi2 = leads.length;
  
  // KPI 3: معدل الرد على المكالمات
  const respondedLeads = leads.filter(l => l.responseStatus === "تم الرد").length;
  const kpi3 = kpi1 > 0 ? ((respondedLeads / kpi1) * 100).toFixed(2) : 0;
  
  // KPI 4: معدل التحويل إلى الاجتماع (Leads that responded and have meetings)
  const leadsWithMeetings = leads.filter(l => {
    if (l.responseStatus !== "تم الرد") return false;
    return meetings.some(m => m.leadId === l.id && m.scheduledAt);
  }).length;
  const kpi4 = respondedLeads > 0 ? ((leadsWithMeetings / respondedLeads) * 100).toFixed(2) : 0;
  
  // KPI 5: معدل التحويل للتعاقد (Contract Conversion Rate)
  // استبعاد الاجتماعات الملغاة
  const relevantMeetings = meetings.filter(m => m.status !== "cancelled" && m.status !== "ملغى");
  const contractedMeetings = relevantMeetings.filter(m => m.conversion === "funded").length;
  const kpi5 = relevantMeetings.length > 0 ? ((contractedMeetings / relevantMeetings.length) * 100).toFixed(2) : 0;
  
  // KPI 6: التعاقدات (العدد) - Meetings where conversion = 'funded'
  const kpi6 = meetings.filter(m => m.conversion === "funded").length;
  
  // KPI 7: متوسط قيمة التعاقد
  const fundedMeetings = meetings.filter(m => m.conversion === "funded");
  const totalPrice = fundedMeetings.reduce((sum, m) => sum + (parseFloat(m.price) || 0), 0);
  const kpi7 = kpi6 > 0 ? (totalPrice / kpi6).toFixed(2) : 0;
  
  // KPI 8: نسبة الاجتماعات التي تم دخولها ولم يتم التعاقد
  // (status = "done" AND conversion = "unfunded") / إجمالي الاجتماعات
  const totalMeetings = meetings.length;
  const meetingsDoneUnfunded = meetings.filter(m => m.status === "done" && (m.conversion === "unfunded" || !m.conversion)).length;
  const kpi8 = totalMeetings > 0 ? ((meetingsDoneUnfunded / totalMeetings) * 100).toFixed(2) : 0;
  
  // KPI 9: نسبة حضور الاجتماعات
  // نحتاج إجمالي الاجتماعات المجدولة لحساب KPI 9
  const scheduledMeetings = meetings.filter(m => m.scheduledAt).length;
  const attendedMeetings = meetings.filter(m => m.status === "done").length;
  const kpi9 = scheduledMeetings > 0 ? ((attendedMeetings / scheduledMeetings) * 100).toFixed(2) : 0;
  
  // KPI 10: عملاء احتاجوا Second Meeting (Leads with more than one meeting)
  const leadMeetingCounts = {};
  meetings.forEach(m => {
    if (m.leadId) {
      leadMeetingCounts[m.leadId] = (leadMeetingCounts[m.leadId] || 0) + 1;
    }
  });
  const kpi10 = Object.values(leadMeetingCounts).filter(count => count > 1).length;
  
  // KPI 11: نسبة الاجتماعات المنتهية (Meetings with status 'done' out of all meetings)
  // totalMeetings تم تعريفه أعلاه
  const kpi11 = totalMeetings > 0 ? ((attendedMeetings / totalMeetings) * 100).toFixed(2) : 0;
  
  // KPI 12: متوسط عدد الاجتماعات قبل الإنهاء (Average meetings per lead before conversion)
  const convertedLeads = leads.filter(l => l.status === "done" || meetings.some(m => m.leadId === l.id && m.conversion === "funded"));
  const meetingsPerConvertedLead = convertedLeads.map(lead => {
    const leadMeetings = meetings.filter(m => m.leadId === lead.id);
    return leadMeetings.length;
  });
  const totalMeetingsForConverted = meetingsPerConvertedLead.reduce((sum, count) => sum + count, 0);
  const kpi12 = convertedLeads.length > 0 ? (totalMeetingsForConverted / convertedLeads.length).toFixed(1) : 0;
  
  // KPI 13: إجمالي قيمة التعاقدات
  const kpi13 = totalPrice.toFixed(2);
  
  return {
    kpi1, kpi2, kpi3, kpi4, kpi5, kpi6, kpi7, kpi8, kpi9, kpi10, kpi11, kpi12, kpi13,
    totalLeads: leads.length,
    respondedLeads,
    scheduledMeetings: scheduledMeetings,
    attendedMeetings,
    fundedMeetings: kpi6,
    totalPrice
  };
}

function displayKPIs(kpis, previousKPIs = null) {
  // KPI 6
  const kpi6El = document.getElementById("kpi6");
  if (kpi6El) {
    kpi6El.textContent = kpis.kpi6.toLocaleString();
    if (previousKPIs) {
      const change = kpis.kpi6 - previousKPIs.kpi6;
      const percentChange = previousKPIs.kpi6 > 0 ? ((change / previousKPIs.kpi6) * 100).toFixed(1) : 0;
      const trendEl = document.getElementById("kpi6Trend");
      if (trendEl) {
        trendEl.innerHTML = `
          <span>MoM:</span>
          <span style="color: ${change >= 0 ? '#27ae60' : '#e74c3c'}; font-weight: 700;">
            ${change >= 0 ? '↑' : '↓'} ${Math.abs(percentChange)}%
          </span>
        `;
      }
    }
  }
  
  // KPI 13
  const kpi13El = document.getElementById("kpi13");
  if (kpi13El) {
    kpi13El.textContent = `${parseFloat(kpis.kpi13).toLocaleString()} ر.س`;
    if (previousKPIs) {
      const change = parseFloat(kpis.kpi13) - parseFloat(previousKPIs.kpi13);
      const percentChange = parseFloat(previousKPIs.kpi13) > 0 ? ((change / parseFloat(previousKPIs.kpi13)) * 100).toFixed(1) : 0;
      const trendEl = document.getElementById("kpi13Trend");
      if (trendEl) {
        trendEl.innerHTML = `
          <span>MoM:</span>
          <span style="color: ${change >= 0 ? '#27ae60' : '#e74c3c'}; font-weight: 700;">
            ${change >= 0 ? '↑' : '↓'} ${Math.abs(percentChange)}%
          </span>
        `;
      }
    }
  }
  
  // KPI 4: معدل التحويل إلى الاجتماع
  const kpi4El = document.getElementById("kpi4");
  if (kpi4El) {
    kpi4El.textContent = `${kpis.kpi4}%`;
  }
  
  // KPI 5: معدل التحويل للتعاقد
  const kpi5El = document.getElementById("kpi5");
  if (kpi5El) {
    kpi5El.textContent = `${kpis.kpi5}%`;
  }
}

function createFunnelChart(leads, meetings) {
  const ctx = document.getElementById("funnelChart");
  if (!ctx) return;
  
  // حساب المراحل
  const totalLeads = leads.length;
  const attemptedCalls = leads.filter(l => (l.responseStatus || "لم يتم المحاوله") !== "لم يتم المحاوله").length;
  const respondedCalls = leads.filter(l => l.responseStatus === "تم الرد").length;
  const scheduledMeetings = meetings.filter(m => m.scheduledAt).length;
  const contracted = meetings.filter(m => m.conversion === "funded").length;
  
  // حساب معدلات التحويل
  const conversion1 = attemptedCalls > 0 ? ((respondedCalls / attemptedCalls) * 100).toFixed(1) : 0;
  const conversion2 = respondedCalls > 0 ? ((scheduledMeetings / respondedCalls) * 100).toFixed(1) : 0;
  const conversion3 = scheduledMeetings > 0 ? ((contracted / scheduledMeetings) * 100).toFixed(1) : 0;
  
  if (funnelChart) {
    funnelChart.destroy();
  }
  
  funnelChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [
        `كل الأرقام (${totalLeads})`,
        `محاولات الاتصال (${attemptedCalls})`,
        `رد على المكالمات (${respondedCalls})`,
        `اجتماعات مجدولة (${scheduledMeetings})`,
        `عملوا تعاقد (${contracted})`
      ],
      datasets: [{
        label: 'العدد',
        data: [totalLeads, attemptedCalls, respondedCalls, scheduledMeetings, contracted],
        backgroundColor: [
          'rgba(79, 70, 229, 0.8)',
          'rgba(79, 70, 229, 0.7)',
          'rgba(79, 70, 229, 0.6)',
          'rgba(16, 185, 129, 0.7)',
          'rgba(16, 185, 129, 0.9)'
        ],
        borderColor: [
          'rgba(79, 70, 229, 1)',
          'rgba(79, 70, 229, 1)',
          'rgba(79, 70, 229, 1)',
          'rgba(16, 185, 129, 1)',
          'rgba(16, 185, 129, 1)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            afterLabel: function(context) {
              const index = context.dataIndex;
              if (index === 1) return `معدل التحويل: ${conversion1}%`;
              if (index === 2) return `معدل التحويل: ${conversion2}%`;
              if (index === 3) return `معدل التحويل: ${conversion3}%`;
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          position: 'top'
        }
      }
    }
  });
}

function createConversionByTypeChart(leads, meetings) {
  const ctx = document.getElementById("conversionByTypeChart");
  if (!ctx) return;
  
  const types = ['hot', 'cold', 'hunt'];
  const typeLabels = { 'hot': 'Hot', 'cold': 'Cold', 'hunt': 'Hunt' };
  
  // إعداد البيانات بنفس هيكل kpi5_finalChartData
  const kpi5_finalChartData = [];
  const bookedData = [];
  const failedData = [];
  const totalData = [];
  const conversionRates = [];
  
  types.forEach(type => {
    const typeLeads = leads.filter(l => l.type === type);
    const attempted = typeLeads.filter(l => (l.responseStatus || "لم يتم المحاوله") !== "لم يتم المحاوله");
    
    // اجتماعات محجوزة: Leads that responded AND have at least one meeting where status = 'done'
    const respondedLeads = typeLeads.filter(l => l.responseStatus === "تم الرد");
    const leadIds = respondedLeads.map(l => l.id);
    const booked = leadIds.filter(leadId => {
      return meetings.some(m => m.leadId === leadId && m.status === "done");
    }).length;
    
    // فشل التأهيل: attempted but did not result in booked meeting
    const failed = attempted.length - booked;
    const total = attempted.length;
    const conversionRate = total > 0 ? ((booked / total) * 100).toFixed(1) : 0;
    
    kpi5_finalChartData.push({
      type: typeLabels[type],
      'اجتماع محجوز': booked,
      'فشل التأهيل/مفقود': failed,
      'الإجمالي': total
    });
    
    bookedData.push(booked);
    failedData.push(failed);
    totalData.push(total);
    conversionRates.push(conversionRate);
  });
  
  // دالة مساعدة لتنسيق الأرقام
  const formatNumber = (value) => {
    return new Intl.NumberFormat('ar-SA').format(value);
  };
  
  if (conversionByTypeChart) {
    conversionByTypeChart.destroy();
  }
  
  conversionByTypeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: types.map(t => typeLabels[t]),
      datasets: [
        {
          label: 'اجتماع محجوز',
          data: bookedData,
          backgroundColor: '#10b981', // Tailwind green-600
          borderColor: '#10b981',
          borderWidth: 0,
          borderRadius: {
            topLeft: 10,
            topRight: 10,
            bottomLeft: 0,
            bottomRight: 0
          }
        },
        {
          label: 'فشل التأهيل/مفقود',
          data: failedData,
          backgroundColor: '#fca5a5', // Tailwind red-300
          borderColor: '#fca5a5',
          borderWidth: 0,
          borderRadius: {
            topLeft: 10,
            topRight: 10,
            bottomLeft: 0,
            bottomRight: 0
          }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 10,
          bottom: 10
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12
            },
            textDirection: 'rtl'
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          padding: 12,
          titleFont: {
            size: 14,
            weight: 'bold'
          },
          bodyFont: {
            size: 12
          },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: function(context) {
              const index = context[0].dataIndex;
              return `نوع العميل: ${kpi5_finalChartData[index].type}`;
            },
            label: function(context) {
              const index = context.dataIndex;
              const data = kpi5_finalChartData[index];
              const booked = data['اجتماع محجوز'];
              const failed = data['فشل التأهيل/مفقود'];
              const total = data['الإجمالي'];
              const conversionRate = conversionRates[index];
              
              // عرض التلميحة عند المرور على أي عمود
              return [
                `إجمالي محاولات المكالمات: ${formatNumber(total)}`,
                '─────────────────────',
                `اجتماعات محجوزة: ${formatNumber(booked)}`,
                `مفقود / فشل: ${formatNumber(failed)}`,
                '',
                `نسبة التحويل (مكالمة إلى اجتماع): ${conversionRate}%`
              ];
            },
            afterLabel: function(context) {
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#374151', // رمادي داكن
            font: {
              size: 12
            }
          }
        },
        y: {
          beginAtZero: true,
          position: 'right', // المحور الرأسي على اليمين
          grid: {
            color: 'rgba(0, 0, 0, 0.1)',
            drawBorder: false,
            lineWidth: 1,
            borderDash: [3, 3] // خط متقطع
          },
          ticks: {
            color: '#374151',
            font: {
              size: 11
            }
          }
        }
      }
    }
  });
}

function createContractDonutChart(meetings) {
  const ctx = document.getElementById("contractDonutChart");
  if (!ctx) return;
  
  // استبعاد الاجتماعات الملغاة
  const relevantMeetings = meetings.filter(m => m.status !== "cancelled" && m.status !== "ملغى");
  const contracted = relevantMeetings.filter(m => m.conversion === "funded").length;
  const notContracted = relevantMeetings.filter(m => m.conversion !== "funded" || !m.conversion).length;
  
  const totalRelevant = relevantMeetings.length;
  const conversionRate = totalRelevant > 0 ? ((contracted / totalRelevant) * 100).toFixed(1) : 0;
  
  // تحديث النصوص فوق المخطط
  document.getElementById("conversionRate").textContent = `${conversionRate}%`;
  document.getElementById("conversionRateValue").textContent = conversionRate;
  document.getElementById("totalRelevantMeetings").textContent = totalRelevant;
  document.getElementById("convertedMeetings").textContent = contracted;
  
  if (contractDonutChart) {
    contractDonutChart.destroy();
  }
  
  contractDonutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['تم التعاقد', 'غير متعاقد/قيد التفاوض'],
      datasets: [{
        data: [contracted, notContracted],
        backgroundColor: [
          'rgba(16, 185, 129, 0.8)',
          'rgba(79, 70, 229, 0.8)'
        ],
        borderColor: [
          'rgba(16, 185, 129, 1)',
          'rgba(79, 70, 229, 1)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

async function createKPIMonthlyTable(selectedMonth = "all") {
  const leads = await getLeads();
  const meetings = await getMeetings();
  
  const months = [
    { value: "2025-09", label: "سبتمبر 2025" },
    { value: "2025-10", label: "أكتوبر 2025" },
    { value: "2025-11", label: "نوفمبر 2025" }
  ];
  
  const tbody = document.getElementById("kpiTableBody");
  if (!tbody) return;
  
  tbody.innerHTML = "";
  
  months.forEach(month => {
    const [year, monthNum] = month.value.split("-");
    const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59);
    
    const monthLeads = leads.filter(lead => {
      const leadDate = new Date(lead.createdAt);
      return leadDate >= startDate && leadDate <= endDate;
    });
    
    const monthMeetings = meetings.filter(meeting => {
      const meetingDate = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
      return meetingDate >= startDate && meetingDate <= endDate;
    });
    
    const kpis = calculateKPIs(monthLeads, monthMeetings);
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; background: var(--surface-alt);">${month.label}</td>
      <td>${kpis.kpi1.toLocaleString()}</td>
      <td>${kpis.kpi2.toLocaleString()}</td>
      <td>${kpis.kpi3}%</td>
      <td>${kpis.kpi4}%</td>
      <td>${kpis.kpi5}%</td>
      <td>${kpis.kpi6.toLocaleString()}</td>
      <td>${parseFloat(kpis.kpi7).toLocaleString()} ر.س</td>
      <td>${kpis.kpi8}%</td>
      <td>${kpis.kpi9}%</td>
      <td>${kpis.kpi10.toLocaleString()}</td>
      <td>${kpis.kpi12}</td>
      <td style="font-weight: 700; color: #27ae60;">${parseFloat(kpis.kpi13).toLocaleString()} ر.س</td>
    `;
    tbody.appendChild(tr);
  });
}
