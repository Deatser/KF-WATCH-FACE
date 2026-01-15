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
} from './modals.js'

// Конфигурация каруселей
const CAROUSEL_CONFIG = {
	// Для новинки: нет ограничений
	newProduct: {
		// Убраны все ограничения
	},
}

// DOM элементы
const productsContainer = document.getElementById('productsContainer')
const loadingIndicator = document.getElementById('loadingIndicator')
const newProductCarousel = document.getElementById('newProductCarousel')
const newProductDots = document.getElementById('newProductDots')

// Переменные состояния
let allProducts = [] // Теперь будем хранить товары из папки watch
let latestProduct = null // Товар-новинка

// Карусель новинки
let newProductCurrentSlide = 0
let newProductTotalSlides = 0

// Переменные для свайпов
let touchStartX = 0
let touchEndX = 0
let touchStartY = 0
let touchEndY = 0

// Функция для извлечения номера из имени папки KF###
function extractFolderNumber(folderName) {
	const match = folderName.match(/KF(\d{3})/i)
	if (match && match[1]) {
		return parseInt(match[1], 10)
	}
	return 0
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
						['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(f.type.toLowerCase())
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
								folder.name
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
			})
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

		// Первый товар после сортировки - новинка
		const latestProduct = products.length > 0 ? products[0] : null
		// Остальные товары (без новинки)
		const otherProducts = products.length > 1 ? products.slice(1) : []

		return {
			products: otherProducts,
			latestProduct: latestProduct,
		}
	} catch (error) {
		console.error('Ошибка загрузки товаров:', error)
		showErrorMessage('Ошибка загрузки каталога')
		return { products: [], latestProduct: null }
	}
}

// Вспомогательная функция для расчета цены на основе имени папки
function calculatePriceFromFolderName(folderName) {
	return 150
}

// Инициализация карусели для новинки с реальными изображениями, кликабельностью и свайпами
function initNewProductCarousel(product) {
	// Если нет товара-новинки, используем заглушку
	if (!product) {
		initNewProductCarouselPlaceholder()
		return
	}

	// Используем реальные изображения из папки новинки
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

	newProductTotalSlides = images.length
	CAROUSEL_CONFIG.newProduct.currentPhotoCount = newProductTotalSlides

	// Очищаем карусель
	newProductCarousel.innerHTML = ''
	newProductDots.innerHTML = ''

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
			img.src = image.url
			img.alt = `Фото ${product.name} - ${index + 1}`
			img.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 16px;
                cursor: pointer;
                transition: transform 0.3s ease;
            `
			img.onerror = function () {
				// Если изображение не загрузилось, показываем заглушку
				showPlaceholderImage(imageDiv, index)
			}
			imageDiv.appendChild(img)
		} else {
			// Заглушка
			showPlaceholderImage(imageDiv, index)
		}

		slide.appendChild(imageDiv)
		newProductCarousel.appendChild(slide)

		// Создаем точку навигации с более яркими цветами
		const dot = createCarouselDot(index)
		newProductDots.appendChild(dot)
	})

	// Обновляем информацию о новинке
	updateNewProductInfo(product)

	// Добавляем обработчики для кнопок навигации
	document.querySelectorAll('.carousel-btn.prev-btn').forEach(btn => {
		btn.addEventListener('click', e => {
			e.stopPropagation()
			goToNewProductSlide(newProductCurrentSlide - 1)
		})
	})

	document.querySelectorAll('.carousel-btn.next-btn').forEach(btn => {
		btn.addEventListener('click', e => {
			e.stopPropagation()
			goToNewProductSlide(newProductCurrentSlide + 1)
		})
	})

	// === ДОБАВЛЯЕМ КЛИКАБЕЛЬНОСТЬ КАРТИНКИ НОВИНКИ ===
	if (newProductCarousel && product) {
		// Делаем весь контейнер карусели кликабельным
		newProductCarousel.style.cursor = 'pointer'
		newProductCarousel.style.position = 'relative'
		newProductCarousel.style.transition = 'all 0.3s ease'

		// Добавляем полупрозрачный оверлей при наведении
		const hoverOverlay = document.createElement('div')
		hoverOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(139, 115, 85, 0.1);
            border-radius: 16px;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
            z-index: 1;
        `
		newProductCarousel.appendChild(hoverOverlay)

		// Добавляем иконку "глаз" в правом верхнем углу
		const viewIcon = document.createElement('div')
		viewIcon.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            width: 36px;
            height: 36px;
            background: rgba(139, 115, 85, 0.9);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 0.9rem;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 2;
            pointer-events: none;
        `
		viewIcon.innerHTML = '<i class="fas fa-external-link-alt"></i>'
		newProductCarousel.appendChild(viewIcon)

		// Обработчик клика на карусель
		newProductCarousel.addEventListener('click', function (e) {
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

		// Эффекты при наведении - как у обычных товаров
		newProductCarousel.addEventListener('mouseenter', function () {
			this.style.transform = 'translateY(-6px)'
			hoverOverlay.style.opacity = '1'
			viewIcon.style.opacity = '1'
			this.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.15)'
		})

		newProductCarousel.addEventListener('mouseleave', function () {
			this.style.transform = 'translateY(0)'
			hoverOverlay.style.opacity = '0'
			viewIcon.style.opacity = '0'
			this.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.1)'
		})

		// Также делаем кликабельными все слайды внутри
		const slides = newProductCarousel.querySelectorAll('.carousel-slide')
		slides.forEach(slide => {
			slide.style.cursor = 'pointer'
		})
	}

	// === ДОБАВЛЯЕМ КЛИКАБЕЛЬНОСТЬ ЗАГОЛОВКА НОВИНКИ ===
	const newProductTitle = document.querySelector('.new-product-title')
	if (newProductTitle && product) {
		newProductTitle.style.cursor = 'pointer'
		newProductTitle.style.position = 'relative'
		newProductTitle.style.transition = 'all 0.3s ease'

		// Добавляем иконку стрелки после заголовка
		const titleWrapper = newProductTitle.parentElement
		const arrowIcon = document.createElement('span')
		arrowIcon.style.cssText = `
            margin-left: 10px;
            color: #8b7355;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
            display: inline-block;
        `
		arrowIcon.innerHTML = '<i class="fas fa-arrow-right"></i>'
		newProductTitle.parentNode.insertBefore(
			arrowIcon,
			newProductTitle.nextSibling
		)

		// Обработчик клика на заголовок
		newProductTitle.addEventListener('click', function (e) {
			e.stopPropagation()
			window.location.href = `/purchase/${product.id}`
		})

		// Эффекты при наведении
		newProductTitle.addEventListener('mouseenter', function () {
			this.style.color = '#8b7355'
			this.style.paddingLeft = '5px'
			arrowIcon.style.opacity = '1'
			arrowIcon.style.transform = 'translateX(5px)'
		})

		newProductTitle.addEventListener('mouseleave', function () {
			this.style.color = '#1a1a1a'
			this.style.paddingLeft = '0'
			arrowIcon.style.opacity = '0'
			arrowIcon.style.transform = 'translateX(0)'
		})
	}

	// === ДОБАВЛЯЕМ КЛИКАБЕЛЬНОСТЬ БЛОКА ЦЕНЫ НОВИНКИ ===
	const priceBlock = document.querySelector('.new-product-price')
	if (priceBlock && product) {
		priceBlock.style.cursor = 'pointer'
		priceBlock.style.transition = 'transform 0.3s ease'

		priceBlock.addEventListener('click', function (e) {
			e.stopPropagation()
			window.location.href = `/purchase/${product.id}`
		})

		priceBlock.addEventListener('mouseenter', function () {
			this.style.transform = 'scale(1.05)'
		})

		priceBlock.addEventListener('mouseleave', function () {
			this.style.transform = 'scale(1)'
		})
	}

	// === ДОБАВЛЯЕМ ПОДДЕРЖКУ СВАЙПОВ ДЛЯ КАРУСЕЛИ НОВИНКИ ===
	initSwipeForCarousel(newProductCarousel, 'new')

	// Автопрокрутка карусели
	startNewProductCarouselAutoPlay()

	// Останавливаем автопрокрутку при наведении на карусель новинки
	newProductCarousel.addEventListener('mouseenter', () => {
		clearInterval(newProductCarouselInterval)
	})

	newProductCarousel.addEventListener('mouseleave', () => {
		startNewProductCarouselAutoPlay()
	})

	// Также останавливаем автопрокрутку при касании на мобильных
	newProductCarousel.addEventListener('touchstart', () => {
		clearInterval(newProductCarouselInterval)
	})

	newProductCarousel.addEventListener('touchend', () => {
		setTimeout(() => {
			startNewProductCarouselAutoPlay()
		}, 5000) // Возобновляем через 5 секунд
	})
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

// Создание точки карусели
function createCarouselDot(index) {
	const dot = document.createElement('button')
	dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`
	dot.dataset.index = index
	dot.addEventListener('click', () => goToNewProductSlide(index))
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
		titleElement.textContent = formattedName
	}

	// Обновляем описание
	const descriptionElement = document.querySelector('.new-product-description')
	if (descriptionElement) {
		descriptionElement.textContent = `Циферблат ${formattedName} - самый новый цифровой циферблат для умных часов WearOS 4+. Современный дизайн с максимальной функциональностью.`
	}

	// Обновляем цену
	const priceElement = document.querySelector('.new-product-price .price')
	if (priceElement) {
		priceElement.textContent = `${formatPrice(150)} ₽`
	}

	// Обновляем старую цену (скидка 20%)
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
		btn.addEventListener('click', () =>
			goToNewProductSlide(newProductCurrentSlide - 1)
		)
	})

	document.querySelectorAll('.carousel-btn.next-btn').forEach(btn => {
		btn.addEventListener('click', () =>
			goToNewProductSlide(newProductCurrentSlide + 1)
		)
	})

	// Добавляем поддержку свайпов для заглушки
	initSwipeForCarousel(newProductCarousel, 'new')

	// Автопрокрутка карусели
	startNewProductCarouselAutoPlay()
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
}

// Автопрокрутка карусели новинки
let newProductCarouselInterval
function startNewProductCarouselAutoPlay() {
	clearInterval(newProductCarouselInterval)
	newProductCarouselInterval = setInterval(() => {
		goToNewProductSlide(newProductCurrentSlide + 1)
	}, 5000)
}

// Функция для отображения ВСЕХ товаров сразу
function renderAllProducts(productsToRender) {
	productsToRender.forEach(product => {
		renderProductCard(product)
	})
	// После отрисовки всех товаров инициализируем свайпы для всех каруселей
	initSwipeForAllProductCarousels()
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
			if (type === 'new') {
				goToNewProductSlide(newProductCurrentSlide - 1)
			} else if (type === 'product' && productId) {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`
				)
				const totalSlides = slides.length
				goToProductSlide(
					productId,
					(currentSlide - 1 + totalSlides) % totalSlides
				)
			}
		} else {
			// Свайп влево
			if (type === 'new') {
				goToNewProductSlide(newProductCurrentSlide + 1)
			} else if (type === 'product' && productId) {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`
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
			if (type === 'new') {
				goToNewProductSlide(newProductCurrentSlide - 1)
			} else if (type === 'product' && productId) {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`
				)
				const totalSlides = slides.length
				goToProductSlide(
					productId,
					(currentSlide - 1 + totalSlides) % totalSlides
				)
			}
		} else {
			// Свайп влево
			if (type === 'new') {
				goToNewProductSlide(newProductCurrentSlide + 1)
			} else if (type === 'product' && productId) {
				const currentSlide = getCurrentProductSlide(productId)
				const slides = document.querySelectorAll(
					`[data-product-id="${productId}"] .product-slide`
				)
				const totalSlides = slides.length
				goToProductSlide(productId, (currentSlide + 1) % totalSlides)
			}
		}
	}
}

function renderProductCard(product) {
	const productCard = document.createElement('div')
	productCard.className = 'product-card'
	productCard.dataset.folder = product.folderName

	// ВАЖНО: Используем правильные классы, которые определены в CSS
	productCard.innerHTML = `
        <div class="product-carousel" data-product-id="${product.id}" style="cursor: pointer;">
            <!-- Контейнер для слайдов с правильным классом -->
            <div class="product-carousel-slides" data-product-id="${product.id}"></div>
            
            <!-- Навигационные точки -->
            <div class="product-carousel-controls" id="dots-${product.id}">
                <!-- Точки будут добавляться через JS -->
            </div>
            
            <!-- Кнопки навигации -->
            <div class="product-carousel-nav">
                <button class="product-carousel-btn prev-btn" data-product-id="${product.id}">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button class="product-carousel-btn next-btn" data-product-id="${product.id}">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
        <div class="product-info">
            <h3 class="product-title" style="cursor: pointer;" data-product-id="${product.id}">${product.name}</h3>
            <p class="product-price">150 ₽</p>
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
		`.product-carousel-slides[data-product-id="${productId}"]`
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
			img.src = image.url
			img.alt = `Фото товара ${index + 1}`
			img.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
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

			dot.addEventListener('click', () => goToProductSlide(productId, index))
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

			dot.addEventListener('click', () => goToProductSlide(productId, i))
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
					`[data-product-id="${productId}"] .product-slide`
				)
				const totalSlides = slides.length

				if (e.target.closest('.prev-btn')) {
					goToProductSlide(
						productId,
						(currentSlide - 1 + totalSlides) % totalSlides
					)
				} else if (e.target.closest('.next-btn')) {
					goToProductSlide(productId, (currentSlide + 1) % totalSlides)
				}
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
		`[data-product-id="${productId}"] .product-slide`
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
		`[data-product-id="${productId}"] .product-slide`
	)
	const dots = document.querySelectorAll(
		`#dots-${productId} .product-carousel-dot`
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
		productsGrid.style.gridTemplateColumns = 'repeat(2, 1fr)'
	} else {
		catalogContainer.style.width = '100%'
		productsGrid.style.gridTemplateColumns = '1fr'
	}
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
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

	// Загружаем товары из папки watch
	const { products, latestProduct } = await loadProductsFromWatch()

	allProducts = products

	// Инициализируем карусель для новинки
	initNewProductCarousel(latestProduct)

	if (allProducts.length > 0) {
		// Загружаем ВСЕ товары сразу (без бесконечной прокрутки)
		renderAllProducts(allProducts)

		// Скрываем индикатор загрузки
		loadingIndicator.style.display = 'none'
	} else if (latestProduct) {
		// Если есть только новинка, но нет других товаров
		loadingIndicator.style.display = 'none'
	}

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
