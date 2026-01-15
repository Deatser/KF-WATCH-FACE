import {
	initContactsModal,
	initFaqModal,
	initAboutModal,
	initInstallGuideLinks,
	initInstallMethodModal,
	initWearloadGuideModal,
	initAdbGuideModal,
	initBugjaegerGuideModal,
	initEscapeKeyHandler,
	initTermsModal,
	initPrivacyModal,
} from './modals.js'

// Глобальные переменные
let currentProduct = null
let currentSlide = 0
let totalSlides = 0
let carouselInterval = null
let imagesPreloaded = false

// Функция предзагрузки изображений
function preloadImages(imageUrls) {
	if (imagesPreloaded) return

	imageUrls.forEach(url => {
		const img = new Image()
		img.src = url
	})

	imagesPreloaded = true
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', async function () {
	initFixedHeader()
	initAboutModal()
	initInstallGuideLinks()
	initInstallMethodModal()
	initWearloadGuideModal()
	initAdbGuideModal()
	initBugjaegerGuideModal()
	initContactsModal()
	initFaqModal()
	initEscapeKeyHandler()
	initTermsModal()
	initPrivacyModal()

	// Инициализация Firebase и проверка прав админа
	await initAuth()

	// Получаем ID товара из URL
	const productId = getProductIdFromURL()

	if (!productId) {
		showError('Товар не найден')
		return
	}

	// Загружаем ВСЕ данные товара одним запросом
	await loadProductDataOptimized(productId)

	// Инициализируем фиксированный хедер
	initFixedHeader()
})

// Оптимизированная загрузка данных товара
async function loadProductDataOptimized(productId) {
	try {
		// Показываем индикатор загрузки
		showLoadingIndicator(true)

		const response = await fetch(`/api/product/${productId}`)

		if (!response.ok) {
			throw new Error(`Ошибка загрузки: ${response.status}`)
		}

		const product = await response.json()
		currentProduct = product

		// Обновляем UI
		updateProductUI()

		// Предзагружаем все изображения
		if (product.images && product.images.length > 0) {
			const imageUrls = product.images.map(img => img.url)
			preloadImages(imageUrls)

			// Создаем карусель с уже готовыми данными
			createCarouselFromData(product.images)
		} else {
			// Если нет изображений, показываем заглушку
			showCarouselPlaceholder()
		}

		// Отображаем описание
		if (product.description) {
			displayProductDescription(product.description)
		} else {
			// Пробуем загрузить описание отдельно
			await loadProductDescription()
		}

		// Инициализируем форму
		initForm()

		// Добавляем обработчики событий
		initEventListeners()

		// Запускаем автопрокрутку
		startCarouselAutoPlay()

		// Скрываем индикатор загрузки
		showLoadingIndicator(false)
	} catch (error) {
		console.error('Ошибка загрузки товара:', error)
		showError('Ошибка загрузки данных товара')
		showLoadingIndicator(false)
	}
}

// Функция для отображения/скрытия индикатора загрузки
function showLoadingIndicator(show) {
	const carouselContainer = document.getElementById('productCarousel')
	const descriptionContent = document.getElementById('descriptionContent')

	if (show) {
		// Показываем индикатор загрузки в карусели
		if (carouselContainer) {
			carouselContainer.innerHTML = `
                <div class="loading-indicator" style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    flex-direction: column;
                    gap: 20px;
                ">
                    <div class="spinner" style="
                        width: 50px;
                        height: 50px;
                        border: 5px solid #f3f3f3;
                        border-top: 5px solid #8b7355;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></div>
                    <p style="color: #8b7355; font-weight: 500;">Загрузка изображений...</p>
                </div>
            `
		}

		// Показываем индикатор в описании
		if (descriptionContent) {
			descriptionContent.innerHTML = `
                <div class="loading-text" style="
                    padding: 20px;
                    text-align: center;
                    color: #666;
                ">
                    <i class="fas fa-spinner fa-spin"></i> Загрузка описания...
                </div>
            `
		}
	}
}

// Создание карусели из готовых данных
function createCarouselFromData(images) {
	const carouselContainer = document.getElementById('productCarousel')
	const dotsContainer = document.getElementById('carouselDots')

	// Очищаем контейнеры
	carouselContainer.innerHTML = ''
	dotsContainer.innerHTML = ''

	totalSlides = images.length

	// Создаем все слайды сразу
	images.forEach((image, index) => {
		// Создаем слайд
		const slide = document.createElement('div')
		slide.className = `carousel-slide-large ${index === 0 ? 'active' : ''}`
		slide.dataset.index = index

		const img = document.createElement('img')
		img.src = image.url
		img.alt = `Фото циферблата ${index + 1}`
		img.loading = index === 0 ? 'eager' : 'lazy' // Оптимизация загрузки

		// Предзагрузка следующего изображения
		if (index === 1) {
			const nextImg = new Image()
			nextImg.src = images[1].url
		}

		slide.appendChild(img)
		carouselContainer.appendChild(slide)

		// Создаем точку
		createCarouselDot(dotsContainer, index)
	})

	// Устанавливаем первый слайд активным
	goToSlide(0)
}

// Инициализация авторизации
async function initAuth() {
	try {
		// Ожидаем загрузки Firebase
		await new Promise(resolve => {
			const checkFirebase = () => {
				if (typeof firebase !== 'undefined' && firebase.auth) {
					resolve()
				} else {
					setTimeout(checkFirebase, 100)
				}
			}
			checkFirebase()
		})

		// Подписываемся на изменения состояния авторизации
		firebase.auth().onAuthStateChanged(user => {
			updateAuthUI(user)
		})

		// Инициализация обработчиков кнопок
		initAuthHandlers()
	} catch (error) {
		console.error('Ошибка инициализации авторизации:', error)
	}
}

// Обновление UI в зависимости от состояния авторизации
function updateAuthUI(user) {
	const userInfo = document.getElementById('userInfo')
	const authForm = document.getElementById('authForm')
	const authSuggestion = document.getElementById('authSuggestion')
	const emailInput = document.getElementById('customerEmail')

	if (user) {
		// Пользователь авторизован
		userInfo.style.display = 'block'
		authForm.style.display = 'none'
		document.getElementById('userEmailDisplay').textContent = user.email

		// Заполняем email в форме покупки, если поле пустое
		if (emailInput && !emailInput.value) {
			emailInput.value = user.email
			validateEmail()
		}

		// Скрываем рекомендацию по регистрации
		if (authSuggestion) {
			authSuggestion.classList.remove('show')
		}

		// Проверяем права администратора
		checkAdminStatus(user.email)
	} else {
		// Пользователь не авторизован
		userInfo.style.display = 'none'
		authForm.style.display = 'block'

		// Показываем рекомендацию по регистрации
		if (authSuggestion) {
			authSuggestion.classList.add('show')
		}
	}
}

// Инициализация обработчиков для авторизации
function initAuthHandlers() {
	// Кнопка входа
	const loginBtn = document.getElementById('loginBtn')
	if (loginBtn) {
		loginBtn.addEventListener('click', loginUser)
	}

	// Кнопка регистрации
	const registerBtn = document.getElementById('registerBtn')
	if (registerBtn) {
		registerBtn.addEventListener('click', registerUser)
	}

	// Кнопка выхода
	const logoutBtn = document.getElementById('logoutBtn')
	if (logoutBtn) {
		logoutBtn.addEventListener('click', logoutUser)
	}

	// Ссылки в рекомендации
	const loginLink = document.getElementById('loginLink')
	const registerLink = document.getElementById('registerLink')

	if (loginLink) {
		loginLink.addEventListener('click', function (e) {
			e.preventDefault()
			// Открываем меню пользователя
			const userMenu = document.getElementById('userMenu')
			if (userMenu) {
				userMenu.classList.add('show')
				// Фокусируемся на поле email
				const authEmail = document.getElementById('authEmail')
				if (authEmail) {
					authEmail.focus()
				}
			}
		})
	}

	if (registerLink) {
		registerLink.addEventListener('click', function (e) {
			e.preventDefault()
			// Открываем меню пользователя
			const userMenu = document.getElementById('userMenu')
			if (userMenu) {
				userMenu.classList.add('show')
				// Фокусируемся на поле email
				const authEmail = document.getElementById('authEmail')
				if (authEmail) {
					authEmail.focus()
				}
			}
		})
	}

	// Кнопка меню пользователя
	const userMenuBtn = document.getElementById('userMenuBtn')
	if (userMenuBtn) {
		userMenuBtn.addEventListener('click', function (e) {
			e.stopPropagation()
			const userMenu = document.getElementById('userMenu')
			if (userMenu) {
				userMenu.classList.toggle('show')
			}
		})
	}

	// Закрытие меню при клике вне его
	document.addEventListener('click', function (e) {
		const userMenu = document.getElementById('userMenu')
		const userMenuBtn = document.getElementById('userMenuBtn')

		if (userMenu && userMenuBtn) {
			if (!userMenu.contains(e.target) && e.target !== userMenuBtn) {
				userMenu.classList.remove('show')
			}
		}
	})

	// Ввод в полях авторизации (Enter для отправки)
	const authEmail = document.getElementById('authEmail')
	const authPassword = document.getElementById('authPassword')

	if (authEmail && authPassword) {
		authEmail.addEventListener('keypress', function (e) {
			if (e.key === 'Enter') {
				authPassword.focus()
			}
		})

		authPassword.addEventListener('keypress', function (e) {
			if (e.key === 'Enter') {
				loginUser()
			}
		})
	}
}

// Проверка статуса админа
function checkAdminStatus(email) {
	const adminEmails = ['admin@', 'krekfree.com', 'krek_free.com']
	const isAdmin = adminEmails.some(adminEmail => email.includes(adminEmail))

	const adminLink = document.getElementById('adminPanelLink')
	if (adminLink && isAdmin) {
		adminLink.style.display = 'block'
	}
}

// Функции авторизации
function loginUser() {
	const email = document.getElementById('authEmail').value
	const password = document.getElementById('authPassword').value
	const errorDiv = document.getElementById('authError')

	if (!email || !password) {
		showAuthError('Заполните все поля')
		return
	}

	errorDiv.textContent = ''
	errorDiv.classList.remove('show')

	firebase
		.auth()
		.signInWithEmailAndPassword(email, password)
		.then(userCredential => {
			showAuthSuccess('Успешный вход!')
			setTimeout(() => {
				const userMenu = document.getElementById('userMenu')
				if (userMenu) {
					userMenu.classList.remove('show')
				}
			}, 2000)
		})
		.catch(error => {
			showAuthError(getAuthErrorMessage(error.code))
		})
}

function registerUser() {
	const email = document.getElementById('authEmail').value
	const password = document.getElementById('authPassword').value
	const errorDiv = document.getElementById('authError')

	if (!email || !password) {
		showAuthError('Заполните все поля')
		return
	}

	if (password.length < 6) {
		showAuthError('Пароль должен содержать минимум 6 символов')
		return
	}

	errorDiv.textContent = ''
	errorDiv.classList.remove('show')

	firebase
		.auth()
		.createUserWithEmailAndPassword(email, password)
		.then(userCredential => {
			showAuthSuccess('Аккаунт создан! Вы вошли в систему.')
			setTimeout(() => {
				const userMenu = document.getElementById('userMenu')
				if (userMenu) {
					userMenu.classList.remove('show')
				}
			}, 2000)
		})
		.catch(error => {
			showAuthError(getAuthErrorMessage(error.code))
		})
}

function logoutUser() {
	firebase
		.auth()
		.signOut()
		.then(() => {
			const userMenu = document.getElementById('userMenu')
			if (userMenu) {
				userMenu.classList.remove('show')
			}
		})
		.catch(error => {
			showAuthError('Ошибка при выходе из системы')
		})
}

function showAuthError(message) {
	const errorDiv = document.getElementById('authError')
	errorDiv.textContent = message
	errorDiv.style.color = '#ff6b6b'
	errorDiv.classList.add('show')
}

function showAuthSuccess(message) {
	const errorDiv = document.getElementById('authError')
	errorDiv.textContent = message
	errorDiv.style.color = '#4CAF50'
	errorDiv.classList.add('show')
}

// Получение ID товара из URL
function getProductIdFromURL() {
	const pathMatch = window.location.pathname.match(/\/purchase\/(\d+)/)
	if (pathMatch && pathMatch[1]) {
		return parseInt(pathMatch[1])
	}

	const urlParams = new URLSearchParams(window.location.search)
	const paramId = urlParams.get('id')
	if (paramId) {
		return parseInt(paramId)
	}

	return null
}

// Загрузка данных товара (старая версия - заменена на loadProductDataOptimized)
async function loadProductData(productId) {
	try {
		// Используем оптимизированный метод
		return await loadProductDataOptimized(productId)
	} catch (error) {
		console.error('Ошибка загрузки товара:', error)
		throw error
	}
}

// Извлечение номера из имени папки KF###
function extractFolderNumber(folderName) {
	const match = folderName.match(/KF(\d{3})/i)
	if (match && match[1]) {
		return parseInt(match[1], 10)
	}
	return 0
}

// Обновление UI с данными товара
function updateProductUI() {
	if (!currentProduct) return

	// Форматируем название (KF194 → KF 194)
	const formattedName =
		currentProduct.displayName ||
		currentProduct.name.replace(/(KF)(\d{3})/i, '$1 $2')

	// Обновляем заголовки
	document.getElementById(
		'productTitle'
	).textContent = `Циферблат ${formattedName}`
	document.getElementById(
		'productNameBreadcrumb'
	).textContent = `Циферблат ${formattedName}`
	document.getElementById(
		'orderProductName'
	).textContent = `Циферблат ${formattedName}`

	// Обновляем бейдж новинки
	const newBadge = document.getElementById('newBadge')
	if (currentProduct.isNewProduct) {
		newBadge.style.display = 'block'
	} else {
		newBadge.style.display = 'none'
	}

	// Обновляем цены
	const currentPrice = document.querySelector('.current-price')
	if (currentPrice) {
		currentPrice.textContent = `${currentProduct.price} ₽`
	}

	const oldPriceElement = document.getElementById('oldPrice')
	if (currentProduct.isNewProduct && currentProduct.oldPrice) {
		oldPriceElement.textContent = `${currentProduct.oldPrice} ₽`
		oldPriceElement.style.display = 'inline'
	} else {
		oldPriceElement.style.display = 'none'
	}

	// Обновляем итоговую сумму
	const totalPrice = document.getElementById('totalPrice')
	if (totalPrice) {
		totalPrice.textContent = `${currentProduct.price} ₽`
	}
}

// Инициализация карусели (адаптированная)
function initCarousel() {
	// Если данные уже загружены, создаем карусель из них
	if (currentProduct && currentProduct.images) {
		createCarouselFromData(currentProduct.images)
	} else {
		// Иначе показываем заглушку
		showCarouselPlaceholder()
	}
}

// Создание слайда карусели
function createCarouselSlide(container, image, index) {
	const slide = document.createElement('div')
	slide.className = `carousel-slide-large ${index === 0 ? 'active' : ''}`
	slide.dataset.index = index

	const img = document.createElement('img')
	img.src = image.url
	img.alt = `Фото циферблата ${index + 1}`
	img.onerror = function () {
		this.style.display = 'none'
		const placeholder = document.createElement('div')
		placeholder.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #f5f0e8 0%, #e8dfd0 100%);
            display: flex;
            align-items: center;
            justify-content: center;
        `
		const icon = document.createElement('i')
		icon.className = 'fas fa-image'
		icon.style.cssText = `
            font-size: 3rem;
            color: #8b7355;
            opacity: 0.5;
        `
		placeholder.appendChild(icon)
		slide.appendChild(placeholder)
	}

	slide.appendChild(img)
	container.appendChild(slide)
}

// Создание точки карусели
function createCarouselDot(container, index) {
	const dot = document.createElement('button')
	dot.className = `carousel-dot-large ${index === 0 ? 'active' : ''}`
	dot.dataset.index = index
	dot.addEventListener('click', () => goToSlide(index))
	container.appendChild(dot)
}

// Заглушка для карусели (когда нет изображений)
function showCarouselPlaceholder() {
	const carouselContainer = document.getElementById('productCarousel')
	const dotsContainer = document.getElementById('carouselDots')

	if (!carouselContainer) return

	carouselContainer.innerHTML = ''
	dotsContainer.innerHTML = ''

	const slide = document.createElement('div')
	slide.className = 'carousel-slide-large active'
	slide.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #f5f0e8 0%, #e8dfd0 100%);
    `

	const icon = document.createElement('i')
	icon.className = 'fas fa-clock'
	icon.style.cssText = `
        font-size: 4rem;
        color: #8b7355;
        opacity: 0.8;
    `

	slide.appendChild(icon)
	carouselContainer.appendChild(slide)

	// Создаем одну точку
	const dot = document.createElement('button')
	dot.className = 'carousel-dot-large active'
	dotsContainer.appendChild(dot)

	totalSlides = 1
}

// Переход к указанному слайду
function goToSlide(index) {
	// Корректируем индекс
	if (index < 0) index = totalSlides - 1
	if (index >= totalSlides) index = 0

	currentSlide = index

	// Обновляем слайды
	document.querySelectorAll('.carousel-slide-large').forEach((slide, i) => {
		slide.classList.toggle('active', i === index)
	})

	// Обновляем точки
	document.querySelectorAll('.carousel-dot-large').forEach((dot, i) => {
		dot.classList.toggle('active', i === index)
	})

	// Предзагружаем следующее изображение
	if (currentProduct && currentProduct.images) {
		const nextIndex = (index + 1) % totalSlides
		if (nextIndex !== index && currentProduct.images[nextIndex]) {
			const nextImg = new Image()
			nextImg.src = currentProduct.images[nextIndex].url
		}
	}

	// Сбрасываем автопрокрутку
	resetCarouselAutoPlay()
}

// Автопрокрутка карусели
function startCarouselAutoPlay() {
	clearInterval(carouselInterval)
	carouselInterval = setInterval(() => {
		goToSlide(currentSlide + 1)
	}, 5000)
}

function resetCarouselAutoPlay() {
	clearInterval(carouselInterval)
	startCarouselAutoPlay()
}

// Загрузка описания товара
async function loadProductDescription() {
	try {
		if (!currentProduct) return

		const descriptionContent = document.getElementById('descriptionContent')

		// Пробуем загрузить описание из файла Описание.txt
		const response = await fetch(
			`/api/view-file?folder=${encodeURIComponent(
				currentProduct.folderName
			)}&file=Описание.txt`
		)

		if (response.ok) {
			const descriptionText = await response.text()
			displayProductDescription(descriptionText)
		} else {
			// Пробуем другие возможные названия файлов
			const possibleNames = [
				'описание.txt',
				'description.txt',
				'Описание.txt',
				'DESCRIPTION.txt',
			]

			for (const fileName of possibleNames) {
				try {
					const altResponse = await fetch(
						`/api/view-file?folder=${encodeURIComponent(
							currentProduct.folderName
						)}&file=${encodeURIComponent(fileName)}`
					)
					if (altResponse.ok) {
						const altDescriptionText = await altResponse.text()
						displayProductDescription(altDescriptionText)
						return
					}
				} catch (e) {
					// Продолжаем попытки
				}
			}

			// Если файла нет, показываем стандартное описание
			showDefaultDescription()
		}
	} catch (error) {
		console.error('Ошибка загрузки описания:', error)
		showDefaultDescription()
	}
}

// Отображение описания товара с форматированием
function displayProductDescription(text) {
	const descriptionContent = document.getElementById('descriptionContent')

	// Очищаем лишние пробелы в начале и конце
	text = text.trim()

	// Заменяем разные типы переносов на стандартные
	text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

	// Разбиваем на строки
	const lines = text.split('\n')

	// Форматируем текст
	let formattedHTML = ''
	let inList = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim()

		// Пропускаем пустые строки (будут использоваться как разделители абзацев)
		if (!line) {
			if (inList) {
				formattedHTML += '</ul>'
				inList = false
			}
			continue
		}

		// Проверяем, является ли строка заголовком
		if (
			line.includes('Описание :') ||
			line.includes('Описание:') ||
			line.includes('ЦИФЕРБЛАТ') ||
			(line.includes('Циферблат') && line.length < 100)
		) {
			if (inList) {
				formattedHTML += '</ul>'
				inList = false
			}

			// Выделяем заголовки
			formattedHTML += `<h3 style="margin-top: 20px; margin-bottom: 10px; color: #8b7355; font-weight: 600;">${line}</h3>`
			continue
		}

		// Проверяем, является ли строка элементом списка (начинается с дефиса, звездочки или цифры с точкой)
		if (
			line.startsWith('- ') ||
			line.startsWith('* ') ||
			/^\d+\.\s/.test(line)
		) {
			if (!inList) {
				formattedHTML +=
					'<ul style="margin: 10px 0 15px 20px; padding: 0; list-style-type: disc; color: #333;">'
				inList = true
			}

			// Убираем маркер списка
			const listItem = line.replace(/^[-*\d\.\s]+/, '').trim()
			formattedHTML += `<li style="margin-bottom: 8px; line-height: 1.5;">${listItem}</li>`
			continue
		}

		// Если мы были в списке, а текущая строка не элемент списка - закрываем список
		if (inList) {
			formattedHTML += '</ul>'
			inList = false
		}

		// Проверяем, является ли строка короткой (возможно подзаголовок)
		if (line.length < 60 && !line.includes('.') && !line.includes(',')) {
			formattedHTML += `<p style="margin: 15px 0 8px 0; font-weight: 600; color: #1a1a1a;">${line}</p>`
			continue
		}

		// Обычный абзац
		formattedHTML += `<p style="margin: 10px 0; line-height: 1.6; text-align: justify;">${line}</p>`
	}

	// Закрываем список если он остался открытым
	if (inList) {
		formattedHTML += '</ul>'
	}

	// Добавляем стили для красивого отображения
	descriptionContent.innerHTML = `
        <div style="
            font-family: 'Comfortaa', cursive;
            color: #333;
            font-size: 0.95rem;
            line-height: 1.6;
        ">
            ${formattedHTML}
        </div>
    `

	// Если форматирование не сработало, показываем текст как есть с сохранением переносов
	if (!formattedHTML.trim()) {
		descriptionContent.innerHTML = `
            <div style="white-space: pre-wrap; font-family: 'Comfortaa', cursive; line-height: 1.6; color: #333;">
                ${text}
            </div>
        `
	}
}

// Стандартное описание
function showDefaultDescription() {
	const descriptionContent = document.getElementById('descriptionContent')
	const formattedName = currentProduct
		? currentProduct.displayName ||
		  currentProduct.name.replace(/(KF)(\d{3})/i, '$1 $2')
		: ''

	descriptionContent.innerHTML = `
        <p><strong>Циферблат ${formattedName}</strong> - это цифровой циферблат для умных часов под управлением операционной системы WearOS 4 и выше.</p>
        
        <p>Циферблаты KF WATCH FACE - это современные циферблаты для Wear OS с максимальной функциональностью.</p>
        
        <h4>Основные функции:</h4>
        <ul>
            <li>Настройка циферблата непосредственно с часов (больше настроек, чем в программе на телефоне Wearable)</li>
            <li>Частота сердечных сокращений BPM (ударов в минуту)</li>
            <li>День недели, дата, месяц</li>
            <li>Дистанция, км (посменно отображается с количеством шагов)</li>
            <li>Процент заряда батареи</li>
            <li>Настраиваемые ярлыки с возможностью маскировки под стиль</li>
            <li>Предустановленные ярлыки</li>
            <li>Настраиваемые поля/усложнения (зависит от часов)</li>
            <li>AOD (2 режима: полный и минимальный)</li>
            <li>Изменяемые цвета</li>
        </ul>
        
        <p>При покупке циферблата вы получите ссылку на файл циферблата в формате *.apk, а также ссылки по инструкции на установку (через ADB App Control или Bugjaeger).</p>
    `
}

// Инициализация формы
function initForm() {
	const emailInput = document.getElementById('customerEmail')
	const payButton = document.getElementById('payButton')

	// Валидация email при вводе
	if (emailInput && payButton) {
		emailInput.addEventListener('input', validateEmail)
	}

	// Заполняем email, если пользователь авторизован
	firebase.auth().onAuthStateChanged(user => {
		if (user && emailInput && !emailInput.value) {
			emailInput.value = user.email
			validateEmail()
		}
	})
}

// Валидация email
function validateEmail() {
	const emailInput = document.getElementById('customerEmail')
	const payButton = document.getElementById('payButton')

	if (!emailInput || !payButton) return

	const email = emailInput.value.trim()
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

	if (emailRegex.test(email)) {
		payButton.disabled = false
		emailInput.style.borderColor = '#4CAF50'
	} else {
		payButton.disabled = true
		emailInput.style.borderColor = email ? '#ff6b6b' : '#e0e0e0'
	}
}

// Инициализация обработчиков событий
function initEventListeners() {
	// Кнопки навигации карусели (ВНЕ точек)
	const prevBtn = document.querySelector('.carousel-nav-btn-outer.prev-btn')
	const nextBtn = document.querySelector('.carousel-nav-btn-outer.next-btn')

	if (prevBtn) {
		prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1))
	}

	if (nextBtn) {
		nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1))
	}

	// Остановка автопрокрутки при наведении на карусель
	const carouselContainer = document.getElementById('productCarousel')
	if (carouselContainer) {
		carouselContainer.addEventListener('mouseenter', () => {
			clearInterval(carouselInterval)
		})

		carouselContainer.addEventListener('mouseleave', () => {
			startCarouselAutoPlay()
		})
	}

	// Кнопка оплаты
	const payButton = document.getElementById('payButton')
	if (payButton) {
		payButton.addEventListener('click', () => {
			processPayment()
		})
	}

	// Кнопки навигации клавиатурой
	document.addEventListener('keydown', e => {
		if (e.key === 'ArrowLeft') {
			goToSlide(currentSlide - 1)
		} else if (e.key === 'ArrowRight') {
			goToSlide(currentSlide + 1)
		}
	})
}

// Обработка оплаты
function processPayment() {
	if (!currentProduct) return

	const emailInput = document.getElementById('customerEmail')
	const email = emailInput.value.trim()

	if (!email) {
		alert('Пожалуйста, введите ваш email')
		emailInput.focus()
		return
	}

	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	if (!emailRegex.test(email)) {
		alert('Пожалуйста, введите корректный email')
		emailInput.focus()
		return
	}

	const payButton = document.getElementById('payButton')
	payButton.disabled = true
	payButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обработка...'

	setTimeout(() => {
		alert(
			`Заказ на циферблат ${currentProduct.name} оформлен!\n\nСсылка на скачивание и инструкция будут отправлены на email: ${email}\n\nВ ближайшее время с вами также свяжутся в Telegram для поддержки.`
		)
		payButton.disabled = false
		payButton.innerHTML = '<i class="fas fa-lock"></i> Оплатить'
	}, 2000)
}

// Показать ошибку
function showError(message) {
	const descriptionContent = document.getElementById('descriptionContent')
	descriptionContent.innerHTML = `
        <div class="error-message" style="text-align: center; padding: 40px 20px; color: #ff6b6b;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
            <h3 style="margin-bottom: 10px;">Ошибка</h3>
            <p>${message}</p>
            <button onclick="window.location.href='/'" class="btn-buy" style="margin-top: 20px; padding: 10px 30px;">
                Вернуться в каталог
            </button>
        </div>
    `

	// Скрываем кнопку оплаты
	const payButton = document.getElementById('payButton')
	if (payButton) {
		payButton.style.display = 'none'
	}
}

// Получение понятного сообщения об ошибке
function getAuthErrorMessage(errorCode) {
	const messages = {
		'auth/email-already-in-use': 'Этот email уже используется другим аккаунтом',
		'auth/invalid-email': 'Неверный формат email',
		'auth/operation-not-allowed': 'Регистрация по email отключена',
		'auth/weak-password': 'Пароль слишком слабый',
		'auth/user-disabled': 'Аккаунт отключен',
		'auth/user-not-found': 'Пользователь с таким email не найден',
		'auth/wrong-password': 'Неверный пароль',
	}

	return messages[errorCode] || 'Произошла ошибка при авторизации'
}

// Фиксация хедера
function initFixedHeader() {
	const header = document.querySelector('.header')
	const scrollThreshold = 50

	window.addEventListener('scroll', function () {
		if (window.scrollY > scrollThreshold) {
			header.classList.add('scrolled')
		} else {
			header.classList.remove('scrolled')
		}
	})
}

// Добавляем CSS анимацию для спиннера
const style = document.createElement('style')
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .carousel-slide-large img {
        transition: opacity 0.3s ease;
    }
    
    .carousel-slide-large:not(.active) img {
        opacity: 0;
    }
    
    .carousel-slide-large.active img {
        opacity: 1;
        animation: fadeIn 0.5s ease;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`
document.head.appendChild(style)
