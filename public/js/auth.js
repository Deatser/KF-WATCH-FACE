// js/auth.js

class AuthManager {
	constructor() {
		this.auth = window.firebaseAuth
		this.database = window.firebaseDatabase
		this.init()
	}

	init() {
		this.setupEventListeners()
		this.checkAuthState()
	}

	setupEventListeners() {
		// Кнопка открытия меню пользователя
		const userMenuBtn = document.getElementById('userMenuBtn')
		const userMenu = document.getElementById('userMenu')

		if (userMenuBtn && userMenu) {
			userMenuBtn.addEventListener('click', e => {
				e.stopPropagation()
				userMenu.classList.toggle('show')
			})

			// Закрытие меню при клике вне его
			document.addEventListener('click', e => {
				if (!userMenu.contains(e.target) && !userMenuBtn.contains(e.target)) {
					userMenu.classList.remove('show')
				}
			})

			// Кнопки авторизации
			document
				.getElementById('loginBtn')
				?.addEventListener('click', () => this.login())
			document
				.getElementById('registerBtn')
				?.addEventListener('click', () => this.register())
			document
				.getElementById('logoutBtn')
				?.addEventListener('click', () => this.logout())
		}
	}

	checkAuthState() {
		this.auth.onAuthStateChanged(async user => {
			if (user) {
				// Проверяем роль пользователя
				const isAdmin = await this.checkUserRole(user.uid)

				// Обновляем интерфейс
				this.updateUI(user, isAdmin)

				// Показываем/скрываем ссылку АДМИН ПАНЕЛЬ
				this.toggleAdminLink(isAdmin)
			} else {
				this.updateUI(null, false)
				// Скрываем ссылку АДМИН ПАНЕЛЬ если пользователь вышел
				this.toggleAdminLink(false)
			}
		})
	}

	async checkUserRole(userId) {
		try {
			const userRef = this.database.ref('users/' + userId)
			const snapshot = await userRef.once('value')
			const userData = snapshot.val()

			// Проверяем, есть ли пользователь в базе данных и является ли он админом
			if (userData && userData.role === 'admin') {
				console.log('👑 Пользователь является администратором')
				return true
			}

			console.log('👤 Пользователь является обычным пользователем')
			return false
		} catch (error) {
			console.error('Ошибка проверки роли:', error)
			return false
		}
	}

	async login() {
		const email = document.getElementById('authEmail').value
		const password = document.getElementById('authPassword').value
		const errorDiv = document.getElementById('authError')

		if (!email || !password) {
			this.showError('Заполните все поля', errorDiv)
			return
		}

		try {
			const userCredential = await this.auth.signInWithEmailAndPassword(
				email,
				password
			)

			// Обновляем время последнего входа в базе данных
			await this.updateLastLoginInDatabase(userCredential.user.uid)

			this.clearForm()
		} catch (error) {
			let errorMessage = 'Ошибка входа'

			switch (error.code) {
				case 'auth/user-not-found':
				case 'auth/invalid-login-credentials':
					errorMessage = 'Неверный email или пароль'
					break
				case 'auth/wrong-password':
					errorMessage = 'Неверный пароль'
					break
				case 'auth/invalid-email':
					errorMessage = 'Неверный формат email'
					break
				case 'auth/user-disabled':
					errorMessage = 'Аккаунт заблокирован'
					break
				case 'auth/too-many-requests':
					errorMessage = 'Слишком много попыток. Попробуйте позже'
					break
				default:
					errorMessage = 'Неверный email или пароль'
			}

			this.showError(errorMessage, errorDiv)
		}
	}

	async register() {
		const email = document.getElementById('authEmail').value
		const password = document.getElementById('authPassword').value
		const errorDiv = document.getElementById('authError')

		if (!email || !password) {
			this.showError('Заполните все поля', errorDiv)
			return
		}

		if (password.length < 6) {
			this.showError('Пароль должен быть не менее 6 символов', errorDiv)
			return
		}

		try {
			const userCredential = await this.auth.createUserWithEmailAndPassword(
				email,
				password
			)

			// СОХРАНЯЕМ ПОЛЬЗОВАТЕЛЯ В БАЗУ ДАННЫХ ПРИ РЕГИСТРАЦИИ
			await this.saveUserToDatabase(userCredential.user.uid, {
				email: email,
				createdAt: new Date().toISOString(),
				lastLogin: new Date().toISOString(),
				role: 'user', // По умолчанию обычный пользователь
			})

			this.showSuccess('Регистрация успешна!')
			this.closeMenu()
			this.clearForm()
		} catch (error) {
			let errorMessage = 'Ошибка регистрации'

			switch (error.code) {
				case 'auth/email-already-in-use':
					errorMessage = 'Аккаунт с таким email уже существует'
					break
				case 'auth/invalid-email':
					errorMessage = 'Неверный формат email'
					break
				case 'auth/weak-password':
					errorMessage = 'Пароль слишком слабый. Минимум 6 символов'
					break
				case 'auth/operation-not-allowed':
					errorMessage = 'Регистрация временно недоступна'
					break
				default:
					errorMessage = error.message
			}

			this.showError(errorMessage, errorDiv)
		}
	}

	// Метод: Сохранение пользователя в базу данных
	async saveUserToDatabase(userId, userData) {
		try {
			await this.database.ref('users/' + userId).set(userData)
			console.log('✅ Пользователь сохранен в базе данных:', userId)
			console.log('Данные:', userData)
			return true
		} catch (error) {
			console.error('❌ Ошибка сохранения пользователя в базу данных:', error)

			// Показываем пользователю ошибку, но не прерываем регистрацию
			console.log(
				'Пользователь создан в Authentication, но не сохранен в Realtime Database'
			)
			console.log('Проверь правила безопасности Firebase!')

			return false
		}
	}

	// Метод: Обновление времени входа в базе данных
	async updateLastLoginInDatabase(userId) {
		try {
			// Сначала проверяем, есть ли пользователь в базе данных
			const userRef = this.database.ref('users/' + userId)
			const snapshot = await userRef.once('value')

			if (snapshot.exists()) {
				// Обновляем только lastLogin
				await userRef.child('lastLogin').set(new Date().toISOString())
				console.log('🕐 Время входа обновлено для пользователя:', userId)
			} else {
				// Если пользователя нет в базе данных (старый пользователь), создаем запись
				const user = this.auth.currentUser
				if (user) {
					await this.saveUserToDatabase(userId, {
						email: user.email,
						createdAt: new Date().toISOString(),
						lastLogin: new Date().toISOString(),
						role: 'user',
					})
					console.log('📝 Создана запись для старого пользователя:', userId)
				}
			}
		} catch (error) {
			console.error('Ошибка обновления времени входа:', error)
		}
	}

	async logout() {
		try {
			await this.auth.signOut()
			this.closeMenu()

			// Скрываем ссылку АДМИН ПАНЕЛЬ при выходе
			this.toggleAdminLink(false)
		} catch (error) {
			console.error('Ошибка выхода:', error)
			this.showError(
				'Ошибка при выходе из аккаунта',
				document.getElementById('authError')
			)
		}
	}

	updateUI(user, isAdmin = false) {
		const userInfo = document.getElementById('userInfo')
		const authForm = document.getElementById('authForm')
		const userEmailDisplay = document.getElementById('userEmailDisplay')
		const userMenu = document.getElementById('userMenu')

		if (user) {
			// Пользователь вошел
			if (userInfo) userInfo.style.display = 'block'
			if (authForm) authForm.style.display = 'none'
			if (userEmailDisplay) {
				userEmailDisplay.textContent = user.email
				if (isAdmin) {
					userEmailDisplay.innerHTML +=
						' <span style="color: #8b7355; font-size: 0.8em;">(Админ)</span>'
				}
			}

			// Закрываем меню после входа
			setTimeout(() => {
				if (userMenu) userMenu.classList.remove('show')
			}, 2000)
		} else {
			// Пользователь не вошел
			if (userInfo) userInfo.style.display = 'none'
			if (authForm) authForm.style.display = 'block'
			if (userEmailDisplay) userEmailDisplay.textContent = ''
		}
	}

	// НОВЫЙ МЕТОД: Показать/скрыть ссылку АДМИН ПАНЕЛЬ
	toggleAdminLink(isAdmin) {
		const adminLink = document.getElementById('adminPanelLink')
		if (adminLink) {
			if (isAdmin) {
				adminLink.style.display = 'block'
				console.log('🔗 Ссылка "АДМИН ПАНЕЛЬ" показана')
			} else {
				adminLink.style.display = 'none'
				console.log('🔗 Ссылка "АДМИН ПАНЕЛЬ" скрыта')
			}
		} else {
			console.warn('❌ Элемент adminPanelLink не найден в DOM')
		}
	}

	showError(message, errorDiv) {
		if (errorDiv) {
			errorDiv.textContent = message
			errorDiv.classList.add('show')

			setTimeout(() => {
				errorDiv.classList.remove('show')
			}, 5000)
		}
	}

	showSuccess(message) {
		// Простое уведомление
		const notification = document.createElement('div')
		notification.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			background: #4CAF50;
			color: white;
			padding: 15px 20px;
			border-radius: 5px;
			z-index: 10000;
			animation: slideIn 0.3s ease;
		`
		notification.textContent = message
		document.body.appendChild(notification)

		setTimeout(() => {
			notification.remove()
		}, 3000)
	}

	closeMenu() {
		const userMenu = document.getElementById('userMenu')
		if (userMenu) {
			userMenu.classList.remove('show')
		}
	}

	clearForm() {
		document.getElementById('authEmail').value = ''
		document.getElementById('authPassword').value = ''
		const errorDiv = document.getElementById('authError')
		if (errorDiv) {
			errorDiv.textContent = ''
			errorDiv.classList.remove('show')
		}
	}
}

// Инициализируем когда DOM загружен и Firebase готов
document.addEventListener('DOMContentLoaded', () => {
	// Ждем немного чтобы Firebase успел загрузиться
	setTimeout(() => {
		if (window.firebaseAuth && window.firebaseDatabase) {
			window.authManager = new AuthManager()
			console.log('✅ AuthManager инициализирован')

			// Проверяем сразу при загрузке страницы
			const auth = window.firebaseAuth
			if (auth.currentUser) {
				console.log('👤 Пользователь уже авторизован, проверяем роль...')
				window.authManager.checkUserRole(auth.currentUser.uid).then(isAdmin => {
					window.authManager.toggleAdminLink(isAdmin)
				})
			}
		} else {
			console.error('❌ Firebase не загружен')
		}
	}, 500)
})

// Обновление бургер-меню при изменении статуса авторизации
function updateBurgerAuthState(user) {
	const burgerUserInfo = document.getElementById('burgerUserInfo')
	const burgerUserEmailDisplay = document.getElementById(
		'burgerUserEmailDisplay'
	)
	const burgerLogoutBtn = document.getElementById('burgerLogoutBtn')

	if (burgerUserInfo && burgerUserEmailDisplay && burgerLogoutBtn) {
		if (user) {
			burgerUserEmailDisplay.textContent = user.email
			burgerUserInfo.style.display = 'block'

			burgerLogoutBtn.addEventListener('click', function () {
				logoutUser()
			})
		} else {
			burgerUserInfo.style.display = 'none'
		}
	}
}

// Вызовите эту функцию при инициализации и изменении статуса авторизации
// Добавьте в конец функции initializeAuth():
if (user) {
	updateBurgerAuthState(user)
}

// И в функцию loginUser() после успешного входа:
updateBurgerAuthState(user)

// И в функцию logoutUser():
updateBurgerAuthState(null)
