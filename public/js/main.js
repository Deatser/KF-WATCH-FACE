// main.js - Оптимизированная версия для быстрой загрузки

// Конфигурация каруселей
const CAROUSEL_CONFIG = {
	newProduct: {},
}

// DOM элементы
const productsContainer = document.getElementById('productsContainer')
const loadingIndicator = document.getElementById('loadingIndicator')
const newProductCarousel = document.getElementById('newProductCarousel')
const newProductDots = document.getElementById('newProductDots')

// Переменные состояния
let currentPage = 1
const itemsPerPage = 10
let isLoading = false
let allProducts = []
let latestProduct = null

// Карусель новинки
let newProductCurrentSlide = 0
let newProductTotalSlides = 0

// Функция для извлечения номера из имени папки KF###
function extractFolderNumber(folderName) {
	const match = folderName.match(/KF(\d{3})/i)
	if (match && match[1]) {
		return parseInt(match[1], 10)
	}
	return 0
}

// Оптимизированная загрузка товаров
async function loadProductsOptimized() {
	try {
		console.log('Загрузка товаров (оптимизированная)...')

		const response = await fetch('/api/products')

		if (!response.ok) {
			throw new Error(`Ошибка загрузки: ${response.status}`)
		}

		const data = await response.json()

		// Сохраняем новинку
		latestProduct = data.latestProduct

		// Формируем остальные товары
		allProducts = data.products || []

		console.log(`Загружено: ${allProducts.length} товаров + новинка`)

		return {
			products: allProducts,
			latestProduct: latestProduct,
		}
	} catch (error) {
		console.error('Ошибка загрузки товаров:', error)
		showErrorMessage('Ошибка загрузки каталога')
		return { products: [], latestProduct: null }
	}
}

// Инициализация карусели для новинки с оптимизацией
function initNewProductCarouselOptimized(product) {
	if (!product || !product.images || product.images.length === 0) {
		initNewProductCarouselPlaceholder()
		return
	}

	newProductTotalSlides = product.images.length

	// Очищаем карусель
	newProductCarousel.innerHTML = ''
	newProductDots.innerHTML = ''

	// Предзагружаем все изображения новинки
	product.images.forEach((image, index) => {
		if (index < 3) {
			// Предзагружаем только первые 3 для скорости
			const img = new Image()
			img.src = image.url
		}
	})

	// Создаем слайды
	product.images.forEach((image, index) => {
		const slide = document.createElement('div')
		slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`
		slide.dataset.index = index

		const imageDiv = document.createElement('div')
		imageDiv.className = 'carousel-image'

		const img = document.createElement('img')
		img.src = image.url
		img.alt = `Фото ${product.name} - ${index + 1}`
		img.loading = index === 0 ? 'eager' : 'lazy'
		img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 16px;
            cursor: pointer;
            transition: transform 0.3s ease;
        `

		img.onerror = function () {
			showPlaceholderImage(imageDiv, index)
		}

		imageDiv.appendChild(img)
		slide.appendChild(imageDiv)
		newProductCarousel.appendChild(slide)

		const dot = createCarouselDot(index)
		newProductDots.appendChild(dot)
	})

	// Обновляем информацию о новинке
	updateNewProductInfo(product)

	// Добавляем обработчики
	setupNewProductCarouselInteractions(product)

	// Автопрокрутка
	startNewProductCarouselAutoPlay()
}

// Оптимизированная функция для отображения товаров
function renderProductsOptimized(productsToRender) {
	productsToRender.forEach(product => {
		renderProductCardOptimized(product)
	})
}

function renderProductCardOptimized(product) {
	const productCard = document.createElement('div')
	productCard.className = 'product-card'
	productCard.dataset.folder = product.folderName

	productCard.innerHTML = `
        <div class="product-carousel" data-product-id="${
					product.id
				}" style="cursor: pointer;">
            <div class="product-carousel-slides" data-product-id="${
							product.id
						}">
                ${
									product.hasImage
										? `<img src="${product.imageUrl}" 
                          alt="${product.name}" 
                          loading="lazy"
                          style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`
										: `<div style="
                        width:100%; 
                        height:100%; 
                        background: linear-gradient(135deg, #f5f0e8 0%, #e8dfd0 100%);
                        border-radius:12px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                    ">
                        <i class="fas fa-clock" style="font-size:2.5rem; color:#8b7355; opacity:0.8;"></i>
                    </div>`
								}
            </div>
            <div class="product-carousel-controls" id="dots-${
							product.id
						}"></div>
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
						}">
                ${product.displayName || product.name}
            </h3>
            <p class="product-price">${product.price || 150} ₽</p>
            <a href="/purchase/${product.id}" class="btn-buy">
                <i class="fas fa-shopping-cart"></i> Купить
            </a>
        </div>
    `

	productsContainer.appendChild(productCard)
	addProductClickHandlers(productCard, product.id)
}

// Добавляем плавный скролл для ссылок каталога
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
	anchor.addEventListener('click', function (e) {
		e.preventDefault()

		const targetId = this.getAttribute('href')
		if (targetId === '#') return

		const targetElement = document.querySelector(targetId)
		if (targetElement) {
			window.scrollTo({
				top: targetElement.offsetTop - 80,
				behavior: 'smooth',
			})
		}
	})
})

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
	const formattedName =
		product.displayName || product.name.replace(/(KF)(\d{3})/i, '$1 $2')

	const titleElement = document.querySelector('.new-product-title')
	if (titleElement) {
		titleElement.textContent = formattedName
	}

	const descriptionElement = document.querySelector('.new-product-description')
	if (descriptionElement) {
		descriptionElement.textContent = `Циферблат ${formattedName} - самый новый цифровой циферблат для умных часов WearOS 4+. Современный дизайн с максимальной функциональностью.`
	}

	const priceElement = document.querySelector('.new-product-price .price')
	if (priceElement) {
		priceElement.textContent = `${product.price || 150} ₽`
	}

	const oldPriceElement = document.querySelector('.price-old')
	if (oldPriceElement && product.isNewProduct) {
		oldPriceElement.textContent = `${product.oldPrice || 190} ₽`
	}

	const buyButton = document.querySelector('.new-product-details .btn-primary')
	if (buyButton) {
		buyButton.href = `/purchase/${product.id || 1}`
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

// Заглушка для карусели новинки
function initNewProductCarouselPlaceholder() {
	newProductTotalSlides = 5

	newProductCarousel.innerHTML = ''
	newProductDots.innerHTML = ''

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

	const titleElement = document.querySelector('.new-product-title')
	if (titleElement) {
		titleElement.textContent = 'НОВАЯ МОДЕЛЬ'
	}

	const descriptionElement = document.querySelector('.new-product-description')
	if (descriptionElement) {
		descriptionElement.textContent =
			'Самый новый цифровой циферблат для умных часов WearOS 4+. Современный дизайн с максимальной функциональностью.'
	}

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

	startNewProductCarouselAutoPlay()
}

// Переход к слайду в карусели новинки
function goToNewProductSlide(index) {
	if (index < 0) {
		index = newProductTotalSlides - 1
	} else if (index >= newProductTotalSlides) {
		index = 0
	}

	newProductCurrentSlide = index

	document.querySelectorAll('.carousel-slide').forEach((slide, i) => {
		slide.classList.toggle('active', i === index)
	})

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

// Добавление обработчиков кликов
function addProductClickHandlers(productCard, productId) {
	const carousel = productCard.querySelector('.product-carousel')
	if (carousel) {
		carousel.addEventListener('click', function (e) {
			if (
				e.target.closest('.product-carousel-btn') ||
				e.target.closest('.product-carousel-dot') ||
				e.target.closest('.product-carousel-controls')
			) {
				return
			}
			window.location.href = `/purchase/${productId}`
		})

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

	const title = productCard.querySelector('.product-title')
	if (title) {
		title.addEventListener('click', function (e) {
			e.stopPropagation()
			window.location.href = `/purchase/${productId}`
		})

		title.style.transition = 'color 0.3s ease'
		title.addEventListener('mouseenter', function () {
			this.style.color = '#8b7355'
		})

		title.addEventListener('mouseleave', function () {
			this.style.color = '#1a1a1a'
		})
	}
}

// Настройка взаимодействий для карусели новинки
function setupNewProductCarouselInteractions(product) {
	if (!newProductCarousel || !product) return

	newProductCarousel.style.cursor = 'pointer'
	newProductCarousel.style.position = 'relative'
	newProductCarousel.style.transition = 'all 0.3s ease'

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

	newProductCarousel.addEventListener('click', function (e) {
		if (
			e.target.closest('.carousel-btn') ||
			e.target.closest('.carousel-dot') ||
			e.target.closest('.carousel-controls')
		) {
			return
		}
		window.location.href = `/purchase/${product.id || 1}`
	})

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
			window.location.href = `/purchase/${product.id || 1}`
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
			window.location.href = `/purchase/${product.id || 1}`
		})

		priceBlock.addEventListener('mouseenter', function () {
			this.style.transform = 'scale(1.05)'
		})

		priceBlock.addEventListener('mouseleave', function () {
			this.style.transform = 'scale(1)'
		})
	}
}

// Функция для загрузки следующей порции товаров
function loadMoreProducts() {
	if (isLoading) return

	isLoading = true
	loadingIndicator.style.display = 'block'

	setTimeout(() => {
		const startIndex = (currentPage - 1) * itemsPerPage
		const endIndex = startIndex + itemsPerPage

		const productsToRender = allProducts.slice(startIndex, endIndex)

		if (productsToRender.length > 0) {
			renderProductsOptimized(productsToRender)
			currentPage++
		} else {
			loadingIndicator.innerHTML = '<p>Все товары загружены</p>'
		}

		isLoading = false
		if (productsToRender.length < itemsPerPage) {
			loadingIndicator.style.display = 'none'
		}
	}, 500)
}

// Функция для обработки бесконечной прокрутки
function handleInfiniteScroll() {
	const scrollPosition = window.innerHeight + window.scrollY
	const pageHeight = document.documentElement.scrollHeight
	const threshold = 300

	if (scrollPosition >= pageHeight - threshold && !isLoading) {
		loadMoreProducts()
	}
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

	// Загружаем товары оптимизированным способом
	const { products, latestProduct } = await loadProductsOptimized()
	allProducts = products

	// Инициализируем карусель для новинки
	initNewProductCarouselOptimized(latestProduct)

	if (allProducts.length > 0) {
		loadMoreProducts()
		window.addEventListener('scroll', handleInfiniteScroll)
	} else if (latestProduct) {
		loadingIndicator.innerHTML = '<p>Новинка загружена</p>'
		loadingIndicator.style.display = 'none'
	}

	// Останавливаем автопрокрутку при наведении
	newProductCarousel.addEventListener('mouseenter', () => {
		clearInterval(newProductCarouselInterval)
	})

	newProductCarousel.addEventListener('mouseleave', () => {
		startNewProductCarouselAutoPlay()
	})

	// Адаптация макета
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
