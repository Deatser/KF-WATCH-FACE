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
	initBurgerMenu,
} from './modals.js'

const CAROUSEL_CONFIG = {
	// Для предложения дня: нет ограничений
	dailyOffer: {},
}

// DOM элементы
const productsContainer = document.getElementById('productsContainer')
const loadingIndicator = document.getElementById('loadingIndicator')
const dailyOfferCarousel = document.getElementById('dailyOfferCarousel')
const dailyOfferDots = document.getElementById('dailyOfferDots')
const dailyOfferBuyButton = document.getElementById('dailyOfferBuyButton')
const dailyOfferTitle = document.getElementById('dailyOfferTitle')
const dailyOfferWatchName = document.getElementById('dailyOfferWatchName')
const dailyOfferPrice = document.getElementById('dailyOfferPrice')
const dailyOfferOldPrice = document.getElementById('dailyOfferOldPrice')

// Таймер
const timerHours = document.getElementById('timerHours')
const timerMinutes = document.getElementById('timerMinutes')
const timerSeconds = document.getElementById('timerSeconds')

// Переменные состояния
let allProducts = [] // Все товары из папки watch
let dailyOfferProduct = null // Товар дня
let previousDailyProductId = null // Предыдущий товар дня (для сброса isdaily)

// Карусель предложения дня
let dailyOfferCurrentSlide = 0
let dailyOfferTotalSlides = 0
let dailyOfferCarouselInterval

// Таймер
let offerTimerInterval

// Переменные для свайпов
let touchStartX = 0
let touchEndX = 0
let touchStartY = 0
let touchEndY = 0

// Таймер для периодической проверки изображений
let imageCheckInterval

// Функция для извлечения номера из имени папки KF###
function extractFolderNumber(folderName) {
	const match = folderName.match(/KF(\d{3})/i)
	if (match && match[1]) {
		return parseInt(match[1], 10)
	}
	return 0
}

// НОВАЯ ФУНКЦИЯ: Обновление isdaily в Firebase
async function updateDailyOfferInFirebase(newDailyProductId) {
	try {
		// Проверяем, инициализирован ли Firebase
		if (!firebase.apps.length) {
			console.log('Firebase не инициализирован, пропускаем обновление')
			return
		}

		const database = firebase.database()

		// 1. Сбрасываем предыдущий товар дня (если был)
		if (previousDailyProductId) {
			try {
				await database.ref('items/' + previousDailyProductId).update({
					isdaily: false,
				})
				console.log(
					`Сбросили isdaily для предыдущего товара дня: ${previousDailyProductId}`,
				)
			} catch (error) {
				console.error('Ошибка при сбросе предыдущего товара дня:', error)
			}
		}

		// 2. Устанавливаем новый товар дня
		if (newDailyProductId) {
			try {
				await database.ref('items/' + newDailyProductId).update({
					isdaily: true,
				})
				console.log(
					`Установили isdaily=true для нового товара дня: ${newDailyProductId}`,
				)

				// Сохраняем ID текущего товара дня как предыдущий для следующего обновления
				previousDailyProductId = newDailyProductId
			} catch (error) {
				// Если папка не существует, создаем её
				if (
					error.code === 'PERMISSION_DENIED' ||
					error.message.includes('does not exist')
				) {
					try {
						await database.ref('items/' + newDailyProductId).set({
							isdaily: true,
						})
						console.log(
							`Создали папку и установили isdaily=true для товара дня: ${newDailyProductId}`,
						)
						previousDailyProductId = newDailyProductId
					} catch (createError) {
						console.error(
							'Ошибка при создании папки для товара дня:',
							createError,
						)
					}
				} else {
					console.error('Ошибка при установке нового товара дня:', error)
				}
			}
		}
	} catch (error) {
		console.error('Общая ошибка при обновлении товара дня в Firebase:', error)
	}
}

// НОВАЯ ФУНКЦИЯ: Получение текущего товара дня из Firebase
async function getCurrentDailyOfferFromFirebase() {
	try {
		if (!firebase.apps.length) {
			console.log('Firebase не инициализирован')
			return null
		}

		const database = firebase.database()
		const snapshot = await database.ref('items').once('value')

		if (!snapshot.exists()) {
			console.log('Нет товаров в Firebase')
			return null
		}

		const items = snapshot.val()
		let dailyProduct = null

		// Ищем товар с isdaily: true
		for (const [itemId, itemData] of Object.entries(items)) {
			if (itemData && itemData.isdaily === true) {
				dailyProduct = {
					id: itemId,
					...itemData,
				}
				// Сохраняем как предыдущий товар дня
				previousDailyProductId = itemId
				break
			}
		}

		if (dailyProduct) {
			console.log('Найден товар дня из Firebase:', dailyProduct.id)
		} else {
			console.log('Товар дня не найден в Firebase')
		}

		return dailyProduct
	} catch (error) {
		console.error('Ошибка при получении товара дня из Firebase:', error)
		return null
	}
}

// Функция для загрузки товаров из папки watch
async function loadProductsFromWatch() {
	try {
		console.log('Загрузка товаров из папки watch...')

		const response = await fetch('/api/watch-content')

		if (!response.ok) {
			throw new Error(`Ошибка загрузки: ${response.status}`)
		}

		const data = await response.json()

		if (!data.folders || data.folders.length === 0) {
			console.log('Папка watch пуста')
			showEmptyCatalogMessage()
			return { products: [], latestProduct: null }
		}

		console.log(`Загружено ${data.folders.length} папок из watch`)
		console.log(`====================================================`)

		// Преобразуем папки в товары
		const products = await Promise.all(
			data.folders.map(async (folder, index) => {
				// Получаем цену из файла price.txt если он есть
				let price = 0
				if (folder.files) {
					const priceFile = folder.files.find(f => f.name === 'price.txt')
					if (priceFile) {
						// В реальном приложении здесь нужно загружать содержимое файла
						// Сейчас используем детерминированную цену на основе имени папки
						price = calculatePriceFromFolderName(folder.name)
					}
				}

				// Получаем изображения из папки
				let images = []
				if (folder.files) {
					// Фильтруем только изображения
					const imageFiles = folder.files.filter(f =>
						['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(
							f.type.toLowerCase(),
						),
					)

					// Если есть изображения, берем ВСЕ изображения (без ограничений)
					if (imageFiles.length > 0) {
						// Сортируем по имени для предсказуемости
						imageFiles.sort((a, b) => a.name.localeCompare(b.name))

						// Берем ВСЕ изображения (без ограничения)
						images = imageFiles.map(file => ({
							name: file.name,
							type: file.type,
							url: `/api/view-file?folder=${encodeURIComponent(
								folder.name,
							)}&file=${encodeURIComponent(file.name)}`,
						}))
					}
				}

				// Если нет изображений, используем 3 заглушки
				const hasRealImages = images.length > 0

				return {
					id: index + 1,
					name: folder.name,
					price: price,
					images: images,
					hasRealImages: hasRealImages,
					folderName: folder.name,
					folderNumber: extractFolderNumber(folder.name),
				}
			}),
		)

		// Сортируем товары по номеру папки (KF001, KF002 и т.д.)
		products.sort((a, b) => {
			// Сначала папки с номером KF###
			const aHasNumber = a.folderNumber > 0
			const bHasNumber = b.folderNumber > 0

			if (aHasNumber && bHasNumber) {
				return b.folderNumber - a.folderNumber // Новые первыми
			} else if (aHasNumber && !bHasNumber) {
				return -1
			} else if (!aHasNumber && bHasNumber) {
				return 1
			} else {
				// Если оба без номера, сортируем по имени
				return a.name.localeCompare(b.name)
			}
		})

		// Возвращаем все товары для случайного выбора
		return {
			products: products, // Все товары
		}
	} catch (error) {
		console.error('Ошибка загрузки товаров:', error)
		showErrorMessage('Ошибка загрузки каталога')
		return { products: [], latestProduct: null }
	}
}

// Вспомогательная функция для расчета цены на основе имени папки
function calculatePriceFromFolderName(folderName) {
	return 150 // Обычная цена 150 для всех товаров
}

// Функция: Приоритетная загрузка первого фото каждого товара
async function loadPriorityImages(products) {
	const priorityPromises = []
	const startTime = performance.now()

	products.forEach(product => {
		if (product.images && product.images.length > 0) {
			// Загружаем только ПЕРВОЕ фото каждого товара
			const firstImage = product.images[0]
			if (firstImage.url) {
				const promise = new Promise(resolve => {
					const img = new Image()
					img.src = firstImage.url

					img.onload = () => {
						resolve({ success: true, product: product.name })
					}
					img.onerror = () => {
						resolve({ success: false, product: product.name })
					}
				})
				priorityPromises.push(promise)
			}
		}
	})

	const results = await Promise.allSettled(priorityPromises)

	const endTime = performance.now()
	const loadingTime = ((endTime - startTime) / 1000).toFixed(2)

	const successCount = results.filter(
		r => r.status === 'fulfilled' && r.value.success,
	).length
	const failedCount = priorityPromises.length - successCount

	console.log(
		`Завершена Загрузка первых фото: ${(endTime - startTime).toFixed(2)}ms`,
	)

	return endTime - startTime // Возвращаем время в мс
}

// Функция: Фоновая загрузка остальных фото
async function loadRemainingImagesBackground(products) {
	console.time('Загрузка остальных фото')
	const startTime = performance.now()

	let remainingImagesCount = 0
	let loadedCount = 0
	let failedCount = 0

	// Подсчитываем общее количество оставшихся фото
	products.forEach(product => {
		if (product.images && product.images.length > 1) {
			remainingImagesCount += product.images.length - 1
		}
	})

	if (remainingImagesCount === 0) {
		console.log('ℹ️ Нет дополнительных фото для загрузки')
		console.timeEnd('Загрузка остальных фото')
		return { time: 0, loaded: 0, total: 0 }
	}

	console.log(
		`📊 Всего дополнительных фото для фоновой загрузки: ${remainingImagesCount}`,
	)

	const loadPromises = []

	products.forEach(product => {
		if (product.images && product.images.length > 1) {
			// Пропускаем первое фото (оно уже загружено)
			const remainingImages = product.images.slice(1)

			remainingImages.forEach(image => {
				if (image.url) {
					const promise = new Promise(resolve => {
						const img = new Image()
						img.src = image.url

						img.onload = () => {
							loadedCount++
							resolve({ success: true })
						}

						img.onerror = () => {
							loadedCount++
							failedCount++
							resolve({ success: false })
						}
					})
					loadPromises.push(promise)
				}
			})
		}
	})

	console.log('⏳ Загрузка остальных фото началась...')

	// Ждем завершения ВСЕХ фото
	await Promise.allSettled(loadPromises)

	const endTime = performance.now()
	const totalTime = endTime - startTime

	console.timeEnd('Загрузка остальных фото')
	console.log(`✅ Загрузка остальных фото завершена: ${totalTime.toFixed(2)}ms`)
	console.log(`📊 Загружено: ${loadedCount}/${remainingImagesCount} фото`)
	console.log(`❌ Не удалось загрузить: ${failedCount} фото`)

	return {
		time: totalTime,
		loaded: loadedCount,
		total: remainingImagesCount,
		failed: failedCount,
	}
}

// НОВАЯ ФУНКЦИЯ: Проверка и обновление изображений при взаимодействии
function checkAndUpdateImagesOnInteraction() {
	// Проверяем все ленивые изображения в карусели предложения дня
	const dailyCarousel = document.getElementById('dailyOfferCarousel')
	if (dailyCarousel) {
		const lazyImages = dailyCarousel.querySelectorAll('img[data-src]')
		lazyImages.forEach(img => {
			if (img.dataset.src && !img.src) {
				img.src = img.dataset.src
				img.onload = () => {
					img.style.opacity = '1'
				}
			}
		})
	}

	// Проверяем все ленивые изображения в карточках товаров
	document.querySelectorAll('.product-carousel').forEach(carousel => {
		const lazyImages = carousel.querySelectorAll('img[data-src]')
		lazyImages.forEach(img => {
			if (img.dataset.src && !img.src) {
				img.src = img.dataset.src
				img.onload = () => {
					img.style.opacity = '1'
				}
			}
		})
	})
}

// НОВАЯ ФУНКЦИЯ: Запуск периодической проверки изображений
function startPeriodicImageCheck() {
	// Останавливаем предыдущий интервал, если он есть
	if (imageCheckInterval) {
		clearInterval(imageCheckInterval)
	}

	// Запускаем проверку каждую секунду
	imageCheckInterval = setInterval(() => {
		checkAndUpdateImagesOnInteraction()
	}, 1000) // Проверка каждую секунду
}

// Инициализация карусели для предложения дня
function initDailyOfferCarousel(product) {
	// Если нет товара дня, используем заглушку
	if (!product) {
		initDailyOfferCarouselPlaceholder()
		return
	}

	// Используем реальные изображения из папки товара дня
	let images = []
	if (product.images && product.images.length > 0) {
		images = product.images
	} else {
		// Если нет изображений, используем 5 заглушек
		images = Array(5)
			.fill()
			.map((_, i) => ({
				name: `placeholder_${i + 1}`,
				type: 'placeholder',
				url: null,
			}))
	}

	dailyOfferTotalSlides = images.length
	CAROUSEL_CONFIG.dailyOffer.currentPhotoCount = dailyOfferTotalSlides

	// Очищаем карусель
	dailyOfferCarousel.innerHTML = ''
	dailyOfferDots.innerHTML = ''

	// Создаем слайды
	images.forEach((image, index) => {
		// Создаем слайд
		const slide = document.createElement('div')
		slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`
		slide.dataset.index = index

		const imageDiv = document.createElement('div')
		imageDiv.className = 'carousel-image'

		if (image.url && image.type !== 'placeholder') {
			// Реальное изображение
			const img = document.createElement('img')

			// ПРИОРИТЕТНАЯ ЗАГРУЗКА: первое фото сразу, остальные lazy
			if (index === 0) {
				img.src = image.url // Первое фото уже загружено
			} else {
				img.dataset.src = image.url // Остальные - lazy
				img.style.opacity = '0.7' // Полупрозрачные пока не загружены
			}

			img.alt = `Фото ${product.name} - ${index + 1}`
			img.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 16px;
                cursor: pointer;
                transition: transform 0.3s ease, opacity 0.3s ease;
            `
			img.onerror = function () {
				// Если изображение не загрузилось, показываем заглушку
				showPlaceholderImage(imageDiv, index)
			}

			img.onload = function () {
				if (index > 0) {
					this.style.opacity = '1'
				}
			}

			imageDiv.appendChild(img)
		} else {
			// Заглушка
			showPlaceholderImage(imageDiv, index)
		}

		slide.appendChild(imageDiv)
		dailyOfferCarousel.appendChild(slide)

		// Создаем точку навигации
		const dot = createCarouselDot(index)
		dailyOfferDots.appendChild(dot)
	})

	// Обновляем информацию о предложении дня
	updateDailyOfferInfo(product)

	// Добавляем обработчики для кнопок навигации
	document.querySelectorAll('.carousel-btn.prev-btn').forEach(btn => {
		btn.addEventListener('click', e => {
			e.stopPropagation()
			goToDailyOfferSlide(dailyOfferCurrentSlide - 1)
			// НОВОЕ: Проверяем и обновляем изображения при клике
			checkAndUpdateImagesOnInteraction()
		})
	})

	document.querySelectorAll('.carousel-btn.next-btn').forEach(btn => {
		btn.addEventListener('click', e => {
			e.stopPropagation()
			goToDailyOfferSlide(dailyOfferCurrentSlide + 1)
			// НОВОЕ: Проверяем и обновляем изображения при клике
			checkAndUpdateImagesOnInteraction()
		})
	})

	// Добавляем кликабельность карусели предложения дня
	if (dailyOfferCarousel && product) {
		dailyOfferCarousel.style.cursor = 'pointer'
		dailyOfferCarousel.style.position = 'relative'
		dailyOfferCarousel.style.transition = 'all 0.3s ease'

		// Обработчик клика на карусель
		dailyOfferCarousel.addEventListener('click', function (e) {
			// Не перенаправляем если клик был на кнопки навигации или точки
			if (
				e.target.closest('.carousel-btn') ||
				e.target.closest('.carousel-dot') ||
				e.target.closest('.carousel-controls')
			) {
				return
			}
			// Переходим на страницу покупки
			window.location.href = `/purchase/${product.id}`
		})
	}

	// Добавляем поддержку свайпов для карусели предложения дня
	initSwipeForCarousel(dailyOfferCarousel, 'daily')

	// Останавливаем автопрокрутку при наведении (оставляем для надежности)
	dailyOfferCarousel.addEventListener('mouseenter', () => {
		clearInterval(dailyOfferCarouselInterval)
	})

	dailyOfferCarousel.addEventListener('mouseleave', () => {
		// Не запускаем автопрокрутку
	})

	// Догружаем остальные фото при hover на карусель
	dailyOfferCarousel.addEventListener('mouseenter', function () {
		const lazyImages = this.querySelectorAll('img[data-src]')
		lazyImages.forEach(img => {
			if (img.dataset.src && !img.src) {
				img.src = img.dataset.src
			}
		})
	})
}

// Заглушка для карусели предложения дня (если нет товаров)
function initDailyOfferCarouselPlaceholder() {
	dailyOfferTotalSlides = 5
	CAROUSEL_CONFIG.dailyOffer.currentPhotoCount = dailyOfferTotalSlides

	// Очищаем карусель
	dailyOfferCarousel.innerHTML = ''
	dailyOfferDots.innerHTML = ''

	// Создаем слайды-заглушки
	for (let i = 0; i < dailyOfferTotalSlides; i++) {
		const slide = document.createElement('div')
		slide.className = `carousel-slide ${i === 0 ? 'active' : ''}`
		slide.dataset.index = i

		const imageDiv = document.createElement('div')
		imageDiv.className = 'carousel-image'
		showPlaceholderImage(imageDiv, i)

		slide.appendChild(imageDiv)
		dailyOfferCarousel.appendChild(slide)

		const dot = createCarouselDot(i)
		dailyOfferDots.appendChild(dot)
	}

	// Делаем заголовок и описание нейтральными
	updateDailyOfferInfo({
		name: 'ПРЕДЛОЖЕНИЕ ДНЯ',
		price: 120,
	})

	// Добавляем обработчики для кнопок навигации
	document.querySelectorAll('.carousel-btn.prev-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			goToDailyOfferSlide(dailyOfferCurrentSlide - 1)
			// НОВОЕ: Проверяем и обновляем изображения при клике
			checkAndUpdateImagesOnInteraction()
		})
	})

	document.querySelectorAll('.carousel-btn.next-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			goToDailyOfferSlide(dailyOfferCurrentSlide + 1)
			// НОВОЕ: Проверяем и обновляем изображения при клике
			checkAndUpdateImagesOnInteraction()
		})
	})

	// Добавляем поддержку свайпов для заглушки
	initSwipeForCarousel(dailyOfferCarousel, 'daily')
}

// Обновление информации о предложении дня
function updateDailyOfferInfo(product) {
	const formattedName = product.name

	// Обновляем название часов (просто KF181 без "Циферблат")
	const watchNameElement = document.getElementById('dailyOfferWatchName')
	if (watchNameElement) {
		watchNameElement.textContent = `Циферблат ${formattedName}` // Добавили "Циферблат"
		watchNameElement.style.cssText = `
            font-size: 3rem;
            color: #1a1a1a;
            margin: 10px 0 30px 0;
            font-weight: 700;
            text-align: center;
            letter-spacing: 1px;
        `
	}

	// Синхронизируем с мобильной версией названия
	const mobileWatchName = document.getElementById('mobileDailyOfferWatchName')
	if (mobileWatchName && watchNameElement) {
		mobileWatchName.textContent = watchNameElement.textContent
	}

	// Обновляем цену (специальная цена для товара дня 120)
	if (dailyOfferPrice) {
		dailyOfferPrice.textContent = `${formatPrice(120)} ₽`
	}

	// Обновляем старую цену (150)
	if (dailyOfferOldPrice) {
		dailyOfferOldPrice.textContent = `${formatPrice(150)} ₽`
	}
}

// Переход к определенному слайду в карусели предложения дня
function goToDailyOfferSlide(index) {
	// Корректируем индекс
	if (index < 0) {
		index = dailyOfferTotalSlides - 1
	} else if (index >= dailyOfferTotalSlides) {
		index = 0
	}

	// Обновляем текущий слайд
	dailyOfferCurrentSlide = index

	// Обновляем отображение слайдов
	document.querySelectorAll('.carousel-slide').forEach((slide, i) => {
		slide.classList.toggle('active', i === index)
	})

	// Обновляем точки навигации
	document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
		dot.classList.toggle('active', i === index)

		if (i === index) {
			dot.style.background = '#8b7355'
			dot.style.borderColor = '#8b7355'
			dot.style.transform = 'scale(1.2)'
			dot.style.boxShadow = '0 0 8px rgba(139, 115, 85, 0.6)'
		} else {
			dot.style.background = 'rgba(255, 255, 255, 0.3)'
			dot.style.borderColor = 'rgba(139, 115, 85, 0.5)'
			dot.style.transform = 'scale(1)'
			dot.style.boxShadow = 'none'
		}
	})

	// НОВОЕ: Проверяем и обновляем изображения при смене слайда
	checkAndUpdateImagesOnInteraction()
}

// Автопрокрутка карусели предложения дня (НЕ ИСПОЛЬЗУЕТСЯ - закомментировано)
function startDailyOfferCarouselAutoPlay() {
	clearInterval(dailyOfferCarouselInterval)
	dailyOfferCarouselInterval = setInterval(() => {
		goToDailyOfferSlide(dailyOfferCurrentSlide + 1)
	}, 5000)
}

// Функция для создания заглушки в карусели новинки
function showPlaceholderImage(container, index) {
	container.style.cssText = `
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #f5f0e8 0%, #e8dfd0 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
    `

	const icon = document.createElement('i')
	icon.className = 'fas fa-clock'
	icon.style.cssText = `
        font-size: 3.5rem;
        color: #8b7355;
        opacity: 0.8;
    `

	container.appendChild(icon)
}

// Функция для генерации случайного товара дня (основана на текущей дате)
function getDailyOfferProduct(products) {
	if (products.length === 0) return null

	// Используем текущую дату как seed для детерминированного случайного выбора
	const today = new Date()
	const seed =
		today.getFullYear() * 9999 + (today.getMonth() + 1) * 100 + today.getDate()

	// Простой детерминированный генератор (одинаковый для всех в один день)
	let randomIndex = seed % products.length

	// Добавляем смещение на номер дня в году для разнообразия
	const dayOfYear = Math.floor(
		(today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24),
	)
	randomIndex = (randomIndex + dayOfYear) % products.length

	return products[randomIndex]
}

// Инициализация таймера обратного отсчета с синхронизацией для мобильной версии
function initOfferTimer() {
	clearInterval(offerTimerInterval)

	// Функция обновления таймера с синхронизацией для мобильной версии
	function updateTimer() {
		const now = new Date()
		const endOfDay = new Date(now)
		endOfDay.setHours(23, 59, 59, 999)

		const diff = endOfDay - now

		if (diff <= 0) {
			// День закончился, обновляем товар дня
			updateDailyOffer()
			return
		}

		const hours = Math.floor(diff / (1000 * 60 * 60))
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
		const seconds = Math.floor((diff % (1000 * 60)) / 1000)

		// Форматирование с ведущими нулями
		const hoursStr = hours.toString().padStart(2, '0')
		const minutesStr = minutes.toString().padStart(2, '0')
		const secondsStr = seconds.toString().padStart(2, '0')

		// Обновляем десктопный таймер
		if (timerHours) timerHours.textContent = hoursStr
		if (timerMinutes) timerMinutes.textContent = minutesStr
		if (timerSeconds) timerSeconds.textContent = secondsStr

		// Синхронизируем с мобильным таймером
		const hoursMobile = document.getElementById('timerHoursMobile')
		const minutesMobile = document.getElementById('timerMinutesMobile')
		const secondsMobile = document.getElementById('timerSecondsMobile')

		if (hoursMobile) hoursMobile.textContent = hoursStr
		if (minutesMobile) minutesMobile.textContent = minutesStr
		if (secondsMobile) secondsMobile.textContent = secondsStr
	}

	// Первоначальное обновление
	updateTimer()

	// Запускаем интервал
	offerTimerInterval = setInterval(updateTimer, 1000)
}

// Обновление предложения дня
async function updateDailyOffer() {
	console.log('Обновление предложения дня...')

	// 1. Получаем текущий товар дня из Firebase (если есть)
	const currentDailyFromFirebase = await getCurrentDailyOfferFromFirebase()

	// 2. Выбираем новый случайный товар
	const newDailyProduct = getDailyOfferProduct(allProducts)

	// 3. Проверяем, не является ли новый товар уже текущим товаром дня
	if (
		currentDailyFromFirebase &&
		newDailyProduct &&
		currentDailyFromFirebase.id === newDailyProduct.folderName
	) {
		console.log('Новый товар дня совпадает с текущим, оставляем без изменений')
		dailyOfferProduct = newDailyProduct
	} else {
		// 4. Обновляем товар дня в Firebase
		if (newDailyProduct) {
			await updateDailyOfferInFirebase(newDailyProduct.folderName)
		}
		dailyOfferProduct = newDailyProduct
	}

	// 5. Если есть товар дня
	if (dailyOfferProduct) {
		// Инициализируем карусель
		initDailyOfferCarousel(dailyOfferProduct)

		// Обновляем кнопку покупки
		if (dailyOfferBuyButton) {
			dailyOfferBuyButton.href = `/purchase/${dailyOfferProduct.id}`
		}

		// Синхронизируем мобильную кнопку покупки
		const mobileBuyBtn = document.getElementById('mobileDailyOfferBuyButton')
		if (mobileBuyBtn) {
			mobileBuyBtn.href = `/purchase/${dailyOfferProduct.id}`
		}
	} else {
		// Если нет товаров, показываем заглушку
		initDailyOfferCarousel(null)
	}

	// 6. Перезапускаем таймер
	initOfferTimer()

	// 7. Сохраняем выбор в localStorage для кеширования
	if (dailyOfferProduct) {
		const today = new Date().toDateString()
		localStorage.setItem('dailyOfferDate', today)
		localStorage.setItem('dailyOfferProductId', dailyOfferProduct.id)
	}
}

// Создание точки карусели
function createCarouselDot(index) {
	const dot = document.createElement('button')
	dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`
	dot.dataset.index = index
	dot.addEventListener('click', () => {
		goToNewProductSlide(index)
		// НОВОЕ: Проверяем и обновляем изображения при клике
		checkAndUpdateImagesOnInteraction()
	})
	dot.style.cssText = `
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        border: 2px solid rgba(139, 115, 85, 0.5);
        cursor: pointer;
        padding: 0;
        transition: all 0.3s ease;
    `

	// Стили для активной точки
	if (index === 0) {
		dot.style.background = '#8b7355'
		dot.style.borderColor = '#8b7355'
		dot.style.transform = 'scale(1.2)'
		dot.style.boxShadow = '0 0 8px rgba(139, 115, 85, 0.6)'
	}

	dot.addEventListener('mouseover', () => {
		if (!dot.classList.contains('active')) {
			dot.style.background = 'rgba(139, 115, 85, 0.7)'
			dot.style.borderColor = '#8b7355'
		}
	})

	dot.addEventListener('mouseout', () => {
		if (!dot.classList.contains('active')) {
			dot.style.background = 'rgba(255, 255, 255, 0.3)'
			dot.style.borderColor = 'rgba(139, 115, 85, 0.5)'
		}
	})

	return dot
}

// Обновление информации о новинке
function updateNewProductInfo(product) {
	const formattedName = product.name

	// Обновляем заголовок
	const titleElement = document.querySelector('.new-product-title')
	if (titleElement) {
		titleElement.textContent = `Циферблат ${formattedName}` // Добавьте здесь
	}

	// Обновляем описание
	const descriptionElement = document.querySelector('.new-product-description')
	if (descriptionElement) {
		descriptionElement.textContent = `Циферблат ${formattedName} - самый новый цифровой циферблат для умных часов WearOS 4+. Современный дизайн с максимальной функциональностью.`
	}

	// Обновляем цену (обычная цена 150)
	const priceElement = document.querySelector('.new-product-price .price')
	if (priceElement) {
		priceElement.textContent = `${formatPrice(150)} ₽`
	}

	// Обновляем старую цену (190)
	const oldPriceElement = document.querySelector('.price-old')
	if (oldPriceElement) {
		const oldPrice = 190
		oldPriceElement.textContent = `${formatPrice(oldPrice)} ₽`
	}

	// Обновляем ссылку "Купить сейчас"
	const buyButton = document.querySelector('.new-product-details .btn-primary')
	if (buyButton) {
		buyButton.href = `/purchase/${product.id}`
	}

	// Обновляем статистику
	const statsContainer = document.querySelector('.new-product-stats')
	if (statsContainer) {
		statsContainer.innerHTML = `
            <div class="stat">
                <i class="fas fa-sliders-h"></i>
                <span>Предустановленные ярлыки</span>
            </div>
            <div class="stat">
                <i class="fas fa-palette"></i>
                <span>Изменяемые цвета</span>
            </div>
            <div class="stat">
                <i class="fas fa-heartbeat"></i>
                <span>Мониторинг пульса BPM</span>
            </div>
        `
	}
}

// Заглушка для карусели новинки (если нет товаров)
function initNewProductCarouselPlaceholder() {
	newProductTotalSlides = 5
	CAROUSEL_CONFIG.newProduct.currentPhotoCount = newProductTotalSlides

	// Очищаем карусель
	newProductCarousel.innerHTML = ''
	newProductDots.innerHTML = ''

	// Создаем слайды-заглушки
	for (let i = 0; i < newProductTotalSlides; i++) {
		const slide = document.createElement('div')
		slide.className = `carousel-slide ${i === 0 ? 'active' : ''}`
		slide.dataset.index = i

		const imageDiv = document.createElement('div')
		imageDiv.className = 'carousel-image'
		showPlaceholderImage(imageDiv, i)

		slide.appendChild(imageDiv)
		newProductCarousel.appendChild(slide)

		const dot = createCarouselDot(i)
		newProductDots.appendChild(dot)
	}

	// Делаем заголовок и описание нейтральными
	const titleElement = document.querySelector('.new-product-title')
	if (titleElement) {
		titleElement.textContent = 'НОВАЯ МОДЕЛЬ'
	}

	const descriptionElement = document.querySelector('.new-product-description')
	if (descriptionElement) {
		descriptionElement.textContent =
			'Самый новый цифровой циферблат для умных часов WearOS 4+. Современный дизайн с максимальной функциональностью.'
	}

	// Добавляем обработчики для кнопок навигации
	document.querySelectorAll('.carousel-btn.prev-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			goToNewProductSlide(newProductCurrentSlide - 1)
			// НОВОЕ: Проверяем и обновляем изображения при клике
			checkAndUpdateImagesOnInteraction()
		})
	})

	document.querySelectorAll('.carousel-btn.next-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			goToNewProductSlide(newProductCurrentSlide + 1)
			// НОВОЕ: Проверяем и обновляем изображения при клике
			checkAndUpdateImagesOnInteraction()
		})
	})

	// Добавляем поддержку свайпов для заглушки
	initSwipeForCarousel(newProductCarousel, 'new')
}

// Переход к определенному слайду в карусели новинки
function goToNewProductSlide(index) {
	// Корректируем индекс
	if (index < 0) {
		index = newProductTotalSlides - 1
	} else if (index >= newProductTotalSlides) {
		index = 0
	}

	// Обновляем текущий слайд
	newProductCurrentSlide = index

	// Обновляем отображение слайдов
	document.querySelectorAll('.carousel-slide').forEach((slide, i) => {
		slide.classList.toggle('active', i === index)
	})

	// Обновляем точки навигации с яркими стилями
	document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
		dot.classList.toggle('active', i === index)

		if (i === index) {
			dot.style.background = '#8b7355'
			dot.style.borderColor = '#8b7355'
			dot.style.transform = 'scale(1.2)'
			dot.style.boxShadow = '0 0 8px rgba(139, 115, 85, 0.6)'
		} else {
			dot.style.background = 'rgba(255, 255, 255, 0.3)'
			dot.style.borderColor = 'rgba(139, 115, 85, 0.5)'
			dot.style.transform = 'scale(1)'
			dot.style.boxShadow = 'none'
		}
	})

	// НОВОЕ: Проверяем и обновляем изображения при смене слайда
	checkAndUpdateImagesOnInteraction()
}

// Функция для отображения ВСЕХ товаров сразу
function renderAllProducts(productsToRender) {
	const renderStartTime = performance.now()

	productsToRender.forEach(product => {
		// Проверяем, является ли этот товар товаром дня
		const isDailyOffer =
			dailyOfferProduct && product.id === dailyOfferProduct.id
		renderProductCard(product, isDailyOffer)
	})

	const renderEndTime = performance.now()
	const renderTime = renderEndTime - renderStartTime

	console.log(
		`✅ Отрисовка фото и создание карточек товаров: ${renderTime.toFixed(2)}ms`,
	)

	// После отрисовки всех товаров инициализируем свайпы для всех каруселей
	initSwipeForAllProductCarousels()

	return renderTime
}

// Инициализация свайпов для всех карточек товаров
function initSwipeForAllProductCarousels() {
	document.querySelectorAll('.product-carousel').forEach(carousel => {
		const productId = carousel.dataset.productId
		if (productId) {
			initSwipeForCarousel(carousel, 'product', productId)
		}
	})
}

// Инициализация свайпов для карусели
function initSwipeForCarousel(carousel, type, productId = null) {
	if (!carousel) return

	carousel.addEventListener('touchstart', function (e) {
		touchStartX = e.changedTouches[0].screenX
		touchStartY = e.changedTouches[0].screenY
	})

	carousel.addEventListener('touchend', function (e) {
		touchEndX = e.changedTouches[0].screenX
		touchEndY = e.changedTouches[0].screenY
		handleSwipeGesture(type, productId)
		// НОВОЕ: Проверяем и обновляем изображения после свайпа
		checkAndUpdateImagesOnInteraction()
	})

	// Также добавим поддержку мыши для тестирования
	let mouseDownX = 0
	let mouseUpX = 0

	carousel.addEventListener('mousedown', function (e) {
		mouseDownX = e.clientX
	})

	carousel.addEventListener('mouseup', function (e) {
		mouseUpX = e.clientX
		handleMouseSwipe(mouseDownX, mouseUpX, type, productId)
		// НОВОЕ: Проверяем и обновляем изображения после свайпа мышью
		checkAndUpdateImagesOnInteraction()
	})
}

// Обработка жеста свайпа
function handleSwipeGesture(type, productId) {
	const swipeThreshold = 50 // минимальное расстояние для свайпа
	const swipeDistance = touchEndX - touchStartX
	const verticalDistance = Math.abs(touchEndY - touchStartY)

	// Игнорируем вертикальные свайпы (скролл страницы)
	if (Math.abs(swipeDistance) < verticalDistance) {
		return
	}

	if (Math.abs(swipeDistance) > swipeThreshold) {
		if (swipeDistance > 0) {
			// Свайп вправо
			if (type === 'daily') {
				goToDailyOfferSlide(dailyOfferCurrentSlide - 1)
			} else if (type === 'product' && productId) {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`,
				)
				const totalSlides = slides.length
				goToProductSlide(
					productId,
					(currentSlide - 1 + totalSlides) % totalSlides,
				)
			}
		} else {
			// Свайп влево
			if (type === 'daily') {
				goToDailyOfferSlide(dailyOfferCurrentSlide + 1)
			} else if (type === 'product' && productId) {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`,
				)
				const totalSlides = slides.length
				goToProductSlide(productId, (currentSlide + 1) % totalSlides)
			}
		}
	}
}

// Обработка свайпа мышью (для тестирования)
function handleMouseSwipe(startX, endX, type, productId) {
	const swipeThreshold = 50
	const swipeDistance = endX - startX

	if (Math.abs(swipeDistance) > swipeThreshold) {
		if (swipeDistance > 0) {
			// Свайп вправо
			if (type === 'daily') {
				goToDailyOfferSlide(dailyOfferCurrentSlide - 1)
			} else if (type === 'product' && productId) {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`,
				)
				const totalSlides = slides.length
				goToProductSlide(
					productId,
					(currentSlide - 1 + totalSlides) % totalSlides,
				)
			}
		} else {
			// Свайп влево
			if (type === 'daily') {
				goToDailyOfferSlide(dailyOfferCurrentSlide + 1)
			} else if (type === 'product' && productId) {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`,
				)
				const totalSlides = slides.length
				goToProductSlide(productId, (currentSlide + 1) % totalSlides)
			}
		}
	}
}

function renderProductCard(product, isDailyOffer = false) {
	const productCard = document.createElement('div')
	productCard.className = 'product-card'
	productCard.dataset.folder = product.folderName

	// Определяем цену в зависимости от того, это товар дня или обычный товар
	const currentPrice = isDailyOffer ? 120 : 150
	const oldPrice = isDailyOffer ? 150 : 190
	const showDiscount = isDailyOffer

	// ВАЖНО: Используем правильные классы, которые определены в CSS
	productCard.innerHTML = `
        <div class="product-carousel" data-product-id="${
					product.id
				}" style="cursor: pointer;">
            <!-- Контейнер для слайдов с правильным классом -->
            <div class="product-carousel-slides" data-product-id="${
							product.id
						}"></div>
            
            <!-- Навигационные точки -->
            <div class="product-carousel-controls" id="dots-${product.id}">
                <!-- Точки будут добавляться через JS -->
            </div>
            
            <!-- Кнопки навигации -->
            <div class="product-carousel-nav">
                <button class="product-carousel-btn prev-btn" data-product-id="${
									product.id
								}">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button class="product-carousel-btn next-btn" data-product-id="${
									product.id
								}">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
        <div class="product-info">
            <h3 class="product-title" style="cursor: pointer;" data-product-id="${
							product.id
						}">Циферблат ${product.name}</h3>
            <div class="product-price-container">
                <span class="product-price">${currentPrice} ₽</span>
                ${
									showDiscount
										? `<span class="product-price-old">${oldPrice} ₽</span>`
										: ''
								}
                ${
									showDiscount
										? `<span class="product-discount">-20%</span>`
										: ''
								}
            </div>
            <a href="/purchase/${product.id}" class="btn-buy">
                <i class="fas fa-shopping-cart"></i> Купить
            </a>
        </div>
    `

	productsContainer.appendChild(productCard)

	// Инициализируем карусель для этого товара
	initProductCarousel(product.id, product.images, product.hasRealImages)

	// Добавляем обработчики кликов на картинку и название
	addProductClickHandlers(productCard, product.id)

	// Если это товар дня, добавляем специальный бейдж
	if (isDailyOffer) {
		const badge = document.createElement('div')
		badge.className = 'product-daily-badge'
		badge.innerHTML = '<i class="fas fa-star"></i> ТОВАР ДНЯ'
		badge.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
            color: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            z-index: 10;
            box-shadow: 0 4px 10px rgba(255, 107, 107, 0.3);
        `
		productCard.style.position = 'relative'
		productCard.appendChild(badge)
	}
}
// Добавление обработчиков кликов на картинку и название товара
function addProductClickHandlers(productCard, productId) {
	// Клик на карусель (картинку)
	const carousel = productCard.querySelector('.product-carousel')
	if (carousel) {
		carousel.addEventListener('click', function (e) {
			// Не перенаправляем если клик был на кнопки навигации или точки
			if (
				e.target.closest('.product-carousel-btn') ||
				e.target.closest('.product-carousel-dot') ||
				e.target.closest('.product-carousel-controls')
			) {
				return
			}
			// Переходим на страницу покупки
			window.location.href = `/purchase/${productId}`
		})

		// Добавляем стиль при наведении
		carousel.style.transition = 'all 0.3s ease'
		carousel.addEventListener('mouseenter', function () {
			this.style.transform = 'scale(1.02)'
			this.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.15)'

			// ПРИ НАВЕДЕНИИ: догружаем все фото этого товара
			const lazyImages = this.querySelectorAll('img[data-src]')
			lazyImages.forEach(img => {
				if (img.dataset.src && !img.src) {
					img.src = img.dataset.src
					img.onload = () => {
						img.style.opacity = '1'
					}
				}
			})
		})

		carousel.addEventListener('mouseleave', function () {
			this.style.transform = 'scale(1)'
			this.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)'
		})
	}

	// Клик на название товара
	const title = productCard.querySelector('.product-title')
	if (title) {
		title.addEventListener('click', function (e) {
			e.stopPropagation()
			window.location.href = `/purchase/${productId}`
		})

		// Добавляем стиль при наведении
		title.style.transition = 'color 0.3s ease'
		title.addEventListener('mouseenter', function () {
			this.style.color = '#8b7355'
		})

		title.addEventListener('mouseleave', function () {
			this.style.color = '#1a1a1a'
		})
	}
}

// Инициализация карусели для товара
function initProductCarousel(productId, images, hasRealImages) {
	const slidesContainer = document.querySelector(
		`.product-carousel-slides[data-product-id="${productId}"]`,
	)
	const dotsContainer = document.getElementById(`dots-${productId}`)

	// Очищаем контейнеры
	if (slidesContainer) slidesContainer.innerHTML = ''
	if (dotsContainer) dotsContainer.innerHTML = ''

	// Если есть реальные изображения
	if (hasRealImages && images && images.length > 0) {
		// Создаем слайды с реальными изображениями
		images.forEach((image, index) => {
			const slide = document.createElement('div')
			slide.className = `product-slide ${index === 0 ? 'active' : ''}`
			slide.dataset.index = index
			slide.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                opacity: ${index === 0 ? '1' : '0'};
                transition: opacity 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #f5f0e8;
            `

			const img = document.createElement('img')

			// ПРИОРИТЕТНАЯ ЗАГРУЗКА: первое фото сразу, остальные lazy
			if (index === 0) {
				img.src = image.url // Первое фото уже загружено
			} else {
				img.dataset.src = image.url // Остальные - lazy
				img.style.opacity = '0.5' // Полупрозрачные пока не загружены
			}

			img.alt = `Фото товара ${index + 1}`
			img.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
                transition: opacity 0.3s ease;
            `
			img.onerror = function () {
				// Если изображение не загрузилось, показываем заглушку
				this.style.display = 'none'
				const fallback = document.createElement('div')
				fallback.style.cssText = `
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
                    font-size: 2.5rem;
                    color: #8b7355;
                    opacity: 0.5;
                `
				fallback.appendChild(icon)
				slide.appendChild(fallback)
			}

			img.onload = function () {
				if (index > 0) {
					this.style.opacity = '1'
				}
			}

			slide.appendChild(img)
			slidesContainer.appendChild(slide)

			// Создаем точку навигации с яркими стилями
			const dot = document.createElement('button')
			dot.className = `product-carousel-dot ${index === 0 ? 'active' : ''}`
			dot.dataset.index = index
			dot.dataset.productId = productId

			// Яркие стили для точек
			dot.style.cssText = `
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.4);
                border: 1px solid rgba(139, 115, 85, 0.6);
                cursor: pointer;
                padding: 0;
                transition: all 0.3s ease;
            `

			if (index === 0) {
				dot.style.background = '#8b7355'
				dot.style.borderColor = '#8b7355'
				dot.style.transform = 'scale(1.3)'
				dot.style.boxShadow = '0 0 6px rgba(139, 115, 85, 0.8)'
			}

			// Эффекты при наведении
			dot.addEventListener('mouseover', () => {
				if (!dot.classList.contains('active')) {
					dot.style.background = 'rgba(139, 115, 85, 0.8)'
					dot.style.borderColor = '#8b7355'
					dot.style.transform = 'scale(1.1)'
				}
			})

			dot.addEventListener('mouseout', () => {
				if (!dot.classList.contains('active')) {
					dot.style.background = 'rgba(255, 255, 255, 0.4)'
					dot.style.borderColor = 'rgba(139, 115, 85, 0.6)'
					dot.style.transform = 'scale(1)'
				}
			})

			dot.addEventListener('click', () => {
				goToProductSlide(productId, index)
				// НОВОЕ: Проверяем и обновляем изображения при клике на точку
				checkAndUpdateImagesOnInteraction()
			})
			dotsContainer.appendChild(dot)
		})
	} else {
		// Если нет реальных изображений, используем 3 заглушки
		const numImages = 3
		const colors = generateColors(productId, numImages)

		for (let i = 0; i < numImages; i++) {
			const slide = document.createElement('div')
			slide.className = `product-slide ${i === 0 ? 'active' : ''}`
			slide.dataset.index = i
			slide.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                opacity: ${i === 0 ? '1' : '0'};
                transition: opacity 0.3s ease;
                background: linear-gradient(135deg, ${
									colors[i]
								} 0%, ${adjustColor(colors[i], -20)} 100%);
                display: flex;
                align-items: center;
                justify-content: center;
            `

			const placeholder = document.createElement('div')
			placeholder.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
            `

			const icon = document.createElement('i')
			icon.className = 'fas fa-clock'
			icon.style.cssText = `
                font-size: 2.5rem;
                color: #8b7355;
                opacity: 0.8;
            `

			placeholder.appendChild(icon)
			slide.appendChild(placeholder)
			slidesContainer.appendChild(slide)

			// Создаем точку навигации с яркими стилями
			const dot = document.createElement('button')
			dot.className = `product-carousel-dot ${i === 0 ? 'active' : ''}`
			dot.dataset.index = i
			dot.dataset.productId = productId

			dot.style.cssText = `
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.4);
                border: 1px solid rgba(139, 115, 85, 0.6);
                cursor: pointer;
                padding: 0;
                transition: all 0.3s ease;
            `

			if (i === 0) {
				dot.style.background = '#8b7355'
				dot.style.borderColor = '#8b7355'
				dot.style.transform = 'scale(1.3)'
				dot.style.boxShadow = '0 0 6px rgba(139, 115, 85, 0.8)'
			}

			// Эффекты при наведении
			dot.addEventListener('mouseover', () => {
				if (!dot.classList.contains('active')) {
					dot.style.background = 'rgba(139, 115, 85, 0.8)'
					dot.style.borderColor = '#8b7355'
					dot.style.transform = 'scale(1.1)'
				}
			})

			dot.addEventListener('mouseout', () => {
				if (!dot.classList.contains('active')) {
					dot.style.background = 'rgba(255, 255, 255, 0.4)'
					dot.style.borderColor = 'rgba(139, 115, 85, 0.6)'
					dot.style.transform = 'scale(1)'
				}
			})

			dot.addEventListener('click', () => {
				goToProductSlide(productId, i)
				// НОВОЕ: Проверяем и обновляем изображения при клике на точку
				checkAndUpdateImagesOnInteraction()
			})
			dotsContainer.appendChild(dot)
		}
	}

	// Добавляем обработчики для кнопок навигации
	document
		.querySelectorAll(`.product-carousel-btn[data-product-id="${productId}"]`)
		.forEach(btn => {
			btn.addEventListener('click', e => {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`,
				)
				const totalSlides = slides.length

				if (e.target.closest('.prev-btn')) {
					goToProductSlide(
						productId,
						(currentSlide - 1 + totalSlides) % totalSlides,
					)
				} else if (e.target.closest('.next-btn')) {
					goToProductSlide(productId, (currentSlide + 1) % totalSlides)
				}

				// НОВОЕ: Проверяем и обновляем изображения при клике на кнопки
				checkAndUpdateImagesOnInteraction()
			})
		})
}

// Вспомогательная функция для генерации цветов
function generateColors(productId, count) {
	const colorSets = [
		['#f5f0e8', '#e8dfd0', '#d9ccb8', '#c9b8a0'],
		['#2c2c2c', '#1a1a1a', '#0a0a0a', '#333333'],
		['#f8f8f8', '#f0f0f0', '#e8e8e8', '#e0e0e0'],
		['#1e3a5f', '#2a4a7a', '#345a94', '#3e6aae'],
		['#2d5a27', '#3a6a32', '#478a3c', '#54aa46'],
	]

	const colorSet = colorSets[productId % colorSets.length]
	return colorSet.slice(0, count)
}

// Получение текущего слайда товара
function getCurrentProductSlide(productId) {
	const slides = document.querySelectorAll(
		`[data-product-id="${productId}"] .product-slide`,
	)
	let currentIndex = 0

	slides.forEach((slide, index) => {
		if (slide.classList.contains('active')) {
			currentIndex = index
		}
	})

	return currentIndex
}

// Переход к определенному слайду товара
function goToProductSlide(productId, index) {
	const slides = document.querySelectorAll(
		`[data-product-id="${productId}"] .product-slide`,
	)
	const dots = document.querySelectorAll(
		`#dots-${productId} .product-carousel-dot`,
	)

	// Обновляем слайды
	slides.forEach((slide, i) => {
		slide.classList.toggle('active', i === index)
		slide.style.opacity = i === index ? '1' : '0'
	})

	// Обновляем точки с яркими стилями
	dots.forEach((dot, i) => {
		dot.classList.toggle('active', i === index)

		if (i === index) {
			dot.style.background = '#8b7355'
			dot.style.borderColor = '#8b7355'
			dot.style.transform = 'scale(1.3)'
			dot.style.boxShadow = '0 0 6px rgba(139, 115, 85, 0.8)'
		} else {
			dot.style.background = 'rgba(255, 255, 255, 0.4)'
			dot.style.borderColor = 'rgba(139, 115, 85, 0.6)'
			dot.style.transform = 'scale(1)'
			dot.style.boxShadow = 'none'
		}
	})

	// НОВОЕ: Проверяем и обновляем изображения при смене слайда
	checkAndUpdateImagesOnInteraction()
}

// Вспомогательная функция для форматирования цены
function formatPrice(price) {
	return price.toLocaleString('ru-RU')
}

// Вспомогательная функция для настройки цвета
function adjustColor(color, amount) {
	return color
}

// Функция для отображения сообщения о пустом каталоге
function showEmptyCatalogMessage() {
	productsContainer.innerHTML = `
        <div class="empty-catalog" style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
            <i class="fas fa-box-open" style="font-size: 4rem; color: #8b7355; opacity: 0.5; margin-bottom: 20px;"></i>
            <h3 style="color: #1a1a1a; margin-bottom: 10px; font-size: 1.5rem;">Каталог пуст</h3>
            <p style="color: #666; font-size: 1.1rem; max-width: 500px; margin: 0 auto;">
                В папке watch еще нет товаров. Добавьте товары через админ-панель.
            </p>
        </div>
    `
	loadingIndicator.style.display = 'none'

	// Скрываем блок с новинкой
	const newArrivalSection = document.querySelector('.new-arrival')
	if (newArrivalSection) {
		newArrivalSection.style.display = 'none'
	}
}

// Функция для отображения сообщения об ошибке
function showErrorMessage(message) {
	productsContainer.innerHTML = `
        <div class="error-message" style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 4rem; color: #ff6b6b; margin-bottom: 20px;"></i>
            <h3 style="color: #1a1a1a; margin-bottom: 10px; font-size: 1.5rem;">Ошибка загрузки</h3>
            <p style="color: #666; font-size: 1.1rem; max-width: 500px; margin: 0 auto;">
                ${message}
            </p>
            <button id="retryButton" class="btn-buy" style="margin-top: 20px; width: auto; padding: 10px 30px;">
                Попробовать снова
            </button>
        </div>
    `

	document.getElementById('retryButton')?.addEventListener('click', () => {
		location.reload()
	})

	loadingIndicator.style.display = 'none'

	// Скрываем блок с новинкой
	const newArrivalSection = document.querySelector('.new-arrival')
	if (newArrivalSection) {
		newArrivalSection.style.display = 'none'
	}
}

// Фиксация хедера и эффект при скролле
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

// Функция для адаптации каталога под 65% ширины
function adjustCatalogLayout() {
	const catalogContainer = document.querySelector('.catalog-container')
	const productsGrid = document.querySelector('.products-container')

	if (!catalogContainer || !productsGrid) return

	if (window.innerWidth >= 1600) {
		catalogContainer.style.width = '65%'
		productsGrid.style.gridTemplateColumns = 'repeat(5, 1fr)'
	} else if (window.innerWidth >= 1400) {
		catalogContainer.style.width = '75%'
		productsGrid.style.gridTemplateColumns = 'repeat(5, 1fr)'
	} else if (window.innerWidth >= 1200) {
		catalogContainer.style.width = '80%'
		productsGrid.style.gridTemplateColumns = 'repeat(4, 1fr)'
	} else if (window.innerWidth >= 1100) {
		catalogContainer.style.width = '85%'
		productsGrid.style.gridTemplateColumns = 'repeat(4, 1fr)'
	} else if (window.innerWidth >= 992) {
		catalogContainer.style.width = '90%'
		productsGrid.style.gridTemplateColumns = 'repeat(3, 1fr)'
	} else if (window.innerWidth >= 768) {
		catalogContainer.style.width = '95%'
		productsGrid.style.gridTemplateColumns = 'repeat(3, 1fr)' // Изменено с 2 на 3
	} else if (window.innerWidth >= 550) {
		catalogContainer.style.width = '100%'
		productsGrid.style.gridTemplateColumns = 'repeat(2, 1fr)' // 2 колонки для средних телефонов
	} else if (window.innerWidth >= 320) {
		catalogContainer.style.width = '100%'
		productsGrid.style.gridTemplateColumns = 'repeat(2, 1fr)' // 2 колонки для маленьких телефонов
	} else {
		catalogContainer.style.width = '100%'
		productsGrid.style.gridTemplateColumns = '1fr' // 1 колонка для очень маленьких
	}
}

// ФУНКЦИЯ ДЛЯ СИНХРОНИЗАЦИИ ТАЙМЕРА МЕЖДУ ДЕСКТОПНОЙ И МОБИЛЬНОЙ ВЕРСИЯМИ
function syncTimer() {
	const hours = document.getElementById('timerHours')
	const minutes = document.getElementById('timerMinutes')
	const seconds = document.getElementById('timerSeconds')
	const hoursMobile = document.getElementById('timerHoursMobile')
	const minutesMobile = document.getElementById('timerMinutesMobile')
	const secondsMobile = document.getElementById('timerSecondsMobile')

	// Если элементы существуют, синхронизируем значения
	if (hours && hoursMobile) {
		hoursMobile.textContent = hours.textContent
	}
	if (minutes && minutesMobile) {
		minutesMobile.textContent = minutes.textContent
	}
	if (seconds && secondsMobile) {
		secondsMobile.textContent = seconds.textContent
	}
}

// ФУНКЦИЯ ДЛЯ СИНХРОНИЗАЦИИ НАЗВАНИЙ ЧАСОВ
function syncWatchNames() {
	const desktopWatchName = document.getElementById('dailyOfferWatchName')
	const mobileWatchName = document.getElementById('mobileDailyOfferWatchName')

	if (desktopWatchName && mobileWatchName && desktopWatchName.textContent) {
		mobileWatchName.textContent = desktopWatchName.textContent
	}
}

// ФУНКЦИЯ ДЛЯ СИНХРОНИЗАЦИИ ЦЕН
function syncPrices() {
	const desktopPrice = document.querySelector('.desktop-price .price')
	const mobilePrice = document.querySelector('.mobile-price .price')
	const desktopOldPrice = document.querySelector('.desktop-price .price-old')
	const mobileOldPrice = document.querySelector('.mobile-price .price-old')
	const desktopDiscount = document.querySelector(
		'.desktop-price .discount-badge',
	)
	const mobileDiscount = document.querySelector('.mobile-price .discount-badge')

	if (desktopPrice && mobilePrice) {
		mobilePrice.textContent = desktopPrice.textContent
	}
	if (desktopOldPrice && mobileOldPrice) {
		mobileOldPrice.textContent = desktopOldPrice.textContent
	}
	if (desktopDiscount && mobileDiscount) {
		mobileDiscount.textContent = desktopDiscount.textContent
	}
}

// ФУНКЦИЯ ДЛЯ СИНХРОНИЗАЦИИ ССЫЛОК НА ПОКУПКУ
function syncBuyLinks() {
	const desktopBuyBtn = document.getElementById('dailyOfferBuyButton')
	const mobileBuyBtn = document.getElementById('mobileDailyOfferBuyButton')

	if (desktopBuyBtn && mobileBuyBtn && desktopBuyBtn.href) {
		mobileBuyBtn.href = desktopBuyBtn.href
	}
}

// ФУНКЦИЯ ДЛЯ ПОЛНОЙ СИНХРОНИЗАЦИИ ВСЕХ ДАННЫХ
function syncAllMobileData() {
	syncWatchNames()
	syncPrices()
	syncTimer()
	syncBuyLinks()
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
	console.log('⏱️ Начало загрузки страницы')
	const pageLoadStartTime = performance.now()

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
	initBurgerMenu()

	// Загружаем товары из папки watch
	const { products } = await loadProductsFromWatch()
	allProducts = products

	// Инициализируем предложение дня
	await updateDailyOffer()

	if (allProducts.length > 0) {
		// 1. Загружаем первые фото каждого товара
		const firstImagesTime = await loadPriorityImages(allProducts)

		// 2. Рендерим товары с уже загруженными первыми фото
		const renderTime = renderAllProducts(allProducts)

		// 3. Выводим итоговое время для видимости товаров
		const firstVisibleTime = firstImagesTime + renderTime
		console.log(
			`✅ Итоговое время загрузки чтобы было видно товары с первым фото: ${firstVisibleTime.toFixed(
				2,
			)}ms - Сайт можно смотреть и ПЕРВЫЕ фото есть`,
		)

		// 4. В фоне загружаем остальные фото и ждем их завершения
		const remainingImagesResult =
			await loadRemainingImagesBackground(allProducts)

		// 5. НОВОЕ: Запускаем периодическую проверку изображений
		startPeriodicImageCheck()

		// 6. Выводим финальный лог
		const totalLoadTime = performance.now() - pageLoadStartTime
		console.log(
			`✅ Финальная загрузка страницы - ${totalLoadTime.toFixed(
				2,
			)}ms Вообще все ${remainingImagesResult.loaded} фото загружены`,
		)
		console.log(
			`🎉 Полное время загрузки страницы: ${totalLoadTime.toFixed(2)}ms`,
		)
	} else {
		// Если нет товаров
		loadingIndicator.style.display = 'none'
	}

	// СИНХРОНИЗАЦИЯ ДАННЫХ ДЛЯ МОБИЛЬНОЙ ВЕРСИИ
	// 1. Синхронизируем все данные сразу
	syncAllMobileData()

	// 2. Наблюдаем за изменениями в десктопном названии часов
	const desktopWatchName = document.getElementById('dailyOfferWatchName')
	if (desktopWatchName) {
		const nameObserver = new MutationObserver(function (mutations) {
			mutations.forEach(function (mutation) {
				if (
					mutation.type === 'characterData' ||
					mutation.type === 'childList'
				) {
					syncWatchNames()
				}
			})
		})

		nameObserver.observe(desktopWatchName, {
			characterData: true,
			childList: true,
			subtree: true,
		})
	}

	// 3. Наблюдаем за изменениями в таймере
	const timerElements = [
		document.getElementById('timerHours'),
		document.getElementById('timerMinutes'),
		document.getElementById('timerSeconds'),
	]

	timerElements.forEach(element => {
		if (element) {
			const timerObserver = new MutationObserver(function (mutations) {
				mutations.forEach(function (mutation) {
					if (
						mutation.type === 'characterData' ||
						mutation.type === 'childList'
					) {
						syncTimer()
					}
				})
			})

			timerObserver.observe(element, {
				characterData: true,
				childList: true,
				subtree: true,
			})
		}
	})

	// 4. Наблюдаем за изменениями в ценах
	const priceElements = document.querySelectorAll(
		'.desktop-price .price, .desktop-price .price-old, .desktop-price .discount-badge',
	)
	priceElements.forEach(element => {
		if (element) {
			const priceObserver = new MutationObserver(function (mutations) {
				mutations.forEach(function (mutation) {
					if (
						mutation.type === 'characterData' ||
						mutation.type === 'childList'
					) {
						syncPrices()
					}
				})
			})

			priceObserver.observe(element, {
				characterData: true,
				childList: true,
				subtree: true,
			})
		}
	})

	// 5. Наблюдаем за изменениями в ссылке покупки
	const desktopBuyBtn = document.getElementById('dailyOfferBuyButton')
	if (desktopBuyBtn) {
		const linkObserver = new MutationObserver(function (mutations) {
			mutations.forEach(function (mutation) {
				if (
					mutation.type === 'attributes' &&
					mutation.attributeName === 'href'
				) {
					syncBuyLinks()
				}
			})
		})

		linkObserver.observe(desktopBuyBtn, {
			attributes: true,
			attributeFilter: ['href'],
		})
	}

	// 6. Периодическая проверка синхронизации (на всякий случай)
	setInterval(syncAllMobileData, 2000)

	// 7. Синхронизация при изменении размера окна
	window.addEventListener('resize', syncAllMobileData)

	// Вызываем при загрузке и изменении размера окна
	adjustCatalogLayout()
	window.addEventListener('resize', adjustCatalogLayout)

	// Плавный скролл к началу
	setTimeout(() => {
		window.scrollTo({
			top: 0,
			behavior: 'smooth',
		})
	}, 100)
})
