// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAz7L_-eGbqN6trrhhzPd9XycekKZk3q6Q",
  authDomain: "sales-crm-db849.firebaseapp.com",
  databaseURL: "https://sales-crm-db849-default-rtdb.firebaseio.com",
  projectId: "sales-crm-db849",
  storageBucket: "sales-crm-db849.firebasestorage.app",
  messagingSenderId: "147917951818",
  appId: "1:147917951818:web:81f9b34c8b6a6d69aee7b3",
  measurementId: "G-ZQK6BQVQQN"
};

// Initialize Firebase (wait for firebase to be loaded)
let app, database, analytics;

if (typeof firebase !== 'undefined') {
  app = firebase.initializeApp(firebaseConfig);
  database = firebase.database();
  if (firebase.analytics) {
    analytics = firebase.analytics();
  }
}

