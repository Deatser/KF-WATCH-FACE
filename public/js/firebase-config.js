// js/firebase-config.js

// Firebase конфигурация
const firebaseConfig = {
	apiKey: 'AIzaSyAINukGK-Eklftf-2cKG1eE6UeViUocwU0',
	authDomain: 'krekfree.firebaseapp.com',
	projectId: 'krekfree',
	storageBucket: 'krekfree.firebasestorage.app',
	messagingSenderId: '234608388001',
	appId: '1:234608388001:web:d1d9514062221de856cde0',
	measurementId: 'G-XRGPB3BKMK',
	// ВАЖНО: Добавь databaseURL из Firebase Console
	databaseURL:
		'https://krekfree-default-rtdb.europe-west1.firebasedatabase.app/', // ← ЗАМЕНИ НА СВОЙ
}

// Инициализируем Firebase
const app = firebase.initializeApp(firebaseConfig)

// Получаем сервисы
const auth = firebase.auth()
const database = firebase.database()

// Делаем глобально доступными
window.firebaseApp = app
window.firebaseAuth = auth
window.firebaseDatabase = database

console.log('✅ Firebase подключен!')
