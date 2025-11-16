// Firebase Database Helper Functions

// Get data from Firebase
async function getFirebaseData(path) {
  try {
    const snapshot = await database.ref(path).once('value');
    return snapshot.val();
  } catch (error) {
    console.error('Error getting data from Firebase:', error);
    return null;
  }
}

// Set data in Firebase
async function setFirebaseData(path, data) {
  try {
    await database.ref(path).set(data);
    return true;
  } catch (error) {
    console.error('Error setting data in Firebase:', error);
    return false;
  }
}

// Update data in Firebase
async function updateFirebaseData(path, updates) {
  try {
    await database.ref(path).update(updates);
    return true;
  } catch (error) {
    console.error('Error updating data in Firebase:', error);
    return false;
  }
}

// Push data to Firebase (for arrays)
async function pushFirebaseData(path, data) {
  try {
    const newRef = database.ref(path).push();
    await newRef.set(data);
    return newRef.key;
  } catch (error) {
    console.error('Error pushing data to Firebase:', error);
    return null;
  }
}

// Remove data from Firebase
async function removeFirebaseData(path) {
  try {
    await database.ref(path).remove();
    return true;
  } catch (error) {
    console.error('Error removing data from Firebase:', error);
    return false;
  }
}

// Listen to data changes in Firebase
function onFirebaseDataChange(path, callback) {
  database.ref(path).on('value', (snapshot) => {
    callback(snapshot.val());
  });
}

// Stop listening to data changes
function offFirebaseDataChange(path) {
  database.ref(path).off('value');
}

// Get array from Firebase object
async function getFirebaseArray(path) {
  try {
    const data = await getFirebaseData(path);
    if (!data) return [];
    // Convert object to array
    return Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    }));
  } catch (error) {
    console.error('Error getting array from Firebase:', error);
    return [];
  }
}

// Set array in Firebase (convert array to object)
async function setFirebaseArray(path, array) {
  try {
    if (typeof database === 'undefined') {
      return false;
    }
    // Convert array to object with id as key
    const object = {};
    array.forEach(item => {
      // استخدام id الموجود أو username كـ id أو إنشاء id جديد
      let id = item.id;
      if (!id) {
        // محاولة استخدام username كـ id إذا كان موجوداً
        id = item.username || Date.now().toString() + Math.random().toString(36).substr(2, 9);
      }
      const { id: _, ...itemData } = item;
      object[id] = itemData;
    });
    await database.ref(path).set(object);
    return true;
  } catch (error) {
    console.error('Error setting array in Firebase:', error);
    return false;
  }
}

// Add item to array in Firebase
async function addToFirebaseArray(path, item) {
  try {
    const id = item.id || Date.now().toString();
    const { id: _, ...itemData } = item;
    await setFirebaseData(`${path}/${id}`, itemData);
    return id;
  } catch (error) {
    console.error('Error adding item to Firebase array:', error);
    return null;
  }
}

// Update item in array in Firebase
async function updateFirebaseArrayItem(path, id, updates) {
  try {
    await updateFirebaseData(`${path}/${id}`, updates);
    return true;
  } catch (error) {
    console.error('Error updating item in Firebase array:', error);
    return false;
  }
}

// Remove item from array in Firebase
async function removeFromFirebaseArray(path, id) {
  try {
    await removeFirebaseData(`${path}/${id}`);
    return true;
  } catch (error) {
    console.error('Error removing item from Firebase array:', error);
    return false;
  }
}

// Get item by ID from Firebase array
async function getFirebaseArrayItem(path, id) {
  try {
    const data = await getFirebaseData(`${path}/${id}`);
    if (!data) return null;
    return { id, ...data };
  } catch (error) {
    console.error('Error getting item from Firebase array:', error);
    return null;
  }
}

