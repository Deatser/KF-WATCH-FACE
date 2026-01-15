// js/modals.js - Функции управления модальными окнами

// ====== ФУНКЦИИ ДЛЯ РАБОТЫ С МОДАЛЬНЫМИ ОКНАМИ ======

// Функция для работы с модальным окном "Контакты"
function initContactsModal() {
	const contactsModal = document.getElementById('contactsModal')
	const closeContactsModal = document.getElementById('closeContactsModal')
	const contactsLinks = [
		document.getElementById('contactsLink'),
		document.getElementById('contactsLinkFooter'),
	]

	if (!contactsModal) return

	// Открытие модального окна "Контакты"
	contactsLinks.forEach(link => {
		if (link) {
			link.addEventListener('click', function (e) {
				e.preventDefault()
				contactsModal.classList.add('show')
				document.body.style.overflow = 'hidden'
			})
		}
	})

	// Закрытие модального окна "Контакты"
	if (closeContactsModal) {
		closeContactsModal.addEventListener('click', function () {
			contactsModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		})
	}

	// Закрытие при клике на фон
	contactsModal.addEventListener('click', function (e) {
		if (e.target === contactsModal) {
			contactsModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})
}

// Функция для работы с модальным окном "FAQ"
function initFaqModal() {
	const faqModal = document.getElementById('faqModal')
	const closeFaqModal = document.getElementById('closeFaqModal')
	const faqLinks = [
		document.getElementById('faqLink'),
		document.getElementById('faqLinkFooter'),
		document.getElementById('installGuideLinkFaq'),
	]

	if (!faqModal) return

	// Открытие модального окна "FAQ"
	faqLinks.forEach(link => {
		if (link) {
			link.addEventListener('click', function (e) {
				e.preventDefault()
				faqModal.classList.add('show')
				document.body.style.overflow = 'hidden'
			})
		}
	})

	// Закрытие модального окна "FAQ"
	if (closeFaqModal) {
		closeFaqModal.addEventListener('click', function () {
			faqModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		})
	}

	// Закрытие при клике на фон
	faqModal.addEventListener('click', function (e) {
		if (e.target === faqModal) {
			faqModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})

	// Инициализация аккордеона FAQ
	initFaqAccordion()
}

// Функция для инициализации аккордеона FAQ
function initFaqAccordion() {
	const faqToggles = document.querySelectorAll('.faq-toggle')
	const faqQuestions = document.querySelectorAll('.faq-question')

	// Обработчик для клика на сам вопрос
	faqQuestions.forEach(question => {
		question.addEventListener('click', function (e) {
			// Проверяем, что клик не на кнопке с иконкой
			if (!e.target.closest('.faq-toggle')) {
				const faqItem = this.closest('.faq-item')
				const toggle = faqItem.querySelector('.faq-toggle')
				const answer = faqItem.querySelector('.faq-answer')

				toggleFaqItem(toggle, answer)
			}
		})
	})

	// Обработчик для клика на иконку
	faqToggles.forEach(toggle => {
		toggle.addEventListener('click', function (e) {
			e.stopPropagation() // Останавливаем всплытие
			const faqItem = this.closest('.faq-item')
			const answer = faqItem.querySelector('.faq-answer')

			toggleFaqItem(this, answer)
		})
	})
}

// Функция для переключения состояния FAQ
function toggleFaqItem(toggle, answer) {
	const isActive = answer.classList.contains('active')

	// Переключаем только текущий элемент
	if (!isActive) {
		// Открываем
		answer.classList.add('active')
		// Плавно поворачиваем стрелку
		toggle.style.transform = 'rotate(180deg)'
		toggle.style.transition = 'transform 0.5s ease'
	} else {
		// Закрываем
		answer.classList.remove('active')
		// Плавно возвращаем стрелку
		toggle.style.transform = 'rotate(0deg)'
		toggle.style.transition = 'transform 0.5s ease'
	}
}

// Функция для работы с модальным окном "О нас"
function initAboutModal() {
	const aboutLink = document.getElementById('aboutLink')
	const aboutLinkFooter = document.getElementById('aboutLinkFooter')
	const aboutModal = document.getElementById('aboutModal')
	const closeAboutModal = document.getElementById('closeAboutModal')

	if (!aboutModal) return

	// Открытие модального окна с десктопной ссылки
	if (aboutLink) {
		aboutLink.addEventListener('click', function (e) {
			e.preventDefault()
			aboutModal.classList.add('show')
			document.body.style.overflow = 'hidden'
		})
	}

	// Открытие модального окна с ссылки в футере
	if (aboutLinkFooter) {
		aboutLinkFooter.addEventListener('click', function (e) {
			e.preventDefault()
			aboutModal.classList.add('show')
			document.body.style.overflow = 'hidden'
		})
	}

	// Закрытие модального окна
	if (closeAboutModal) {
		closeAboutModal.addEventListener('click', function () {
			aboutModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		})
	}

	// Закрытие при клике на фон
	aboutModal.addEventListener('click', function (e) {
		if (e.target === aboutModal) {
			aboutModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})
}

function initInstallGuideLinks() {
	const installGuideLinks = ['installGuideLink', 'installGuideLinkFooter']

	installGuideLinks.forEach(id => {
		const link = document.getElementById(id)
		if (link) {
			link.addEventListener('click', function (e) {
				e.preventDefault()
				const installMethodModal = document.getElementById('installMethodModal')
				if (installMethodModal) {
					installMethodModal.classList.add('show')
					document.body.style.overflow = 'hidden'
				}
			})
		}
	})
}

// Функция для работы с модальным окном выбора способа установки
function initInstallMethodModal() {
	const installMethodModal = document.getElementById('installMethodModal')
	const closeInstallMethodModal = document.getElementById(
		'closeInstallMethodModal'
	)

	if (!installMethodModal) return

	// Закрытие модального окна
	if (closeInstallMethodModal) {
		closeInstallMethodModal.addEventListener('click', function () {
			installMethodModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		})
	}

	// Закрытие при клике на фон
	installMethodModal.addEventListener('click', function (e) {
		if (e.target === installMethodModal) {
			installMethodModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})

	// Обработчики кнопок выбора метода установки
	const methodButtons = document.querySelectorAll('.install-method-btn')
	methodButtons.forEach(button => {
		button.addEventListener('click', function () {
			const method = this.getAttribute('data-method')

			installMethodModal.classList.remove('show')

			if (method === 'wearload') {
				const wearLoadModal = document.getElementById('wearloadGuideModal')
				if (wearLoadModal) {
					wearLoadModal.classList.add('show')
				}
			} else if (method === 'adb') {
				const adbGuideModal = document.getElementById('adbGuideModal')
				if (adbGuideModal) {
					adbGuideModal.classList.add('show')
				}
			} else if (method === 'bugjaeger') {
				const bugjaegerGuideModal = document.getElementById(
					'bugjaegerGuideModal'
				)
				if (bugjaegerGuideModal) {
					bugjaegerGuideModal.classList.add('show')
				}
			}
		})
	})
}

// Функция для работы с модальным окном "Гайд по установке через WearLoad"
function initWearloadGuideModal() {
	const wearLoadModal = document.getElementById('wearloadGuideModal')
	const closeWearloadGuideModal = document.getElementById(
		'closeWearloadGuideModal'
	)

	if (!wearLoadModal) return

	// Закрытие модального окна
	if (closeWearloadGuideModal) {
		closeWearloadGuideModal.addEventListener('click', function () {
			wearLoadModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		})
	}

	// Закрытие при клике на фон
	wearLoadModal.addEventListener('click', function (e) {
		if (e.target === wearLoadModal) {
			wearLoadModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})
}

// Функция для работы с модальным окном "Гайд по установке через ADBAppControl"
function initAdbGuideModal() {
	const adbGuideModal = document.getElementById('adbGuideModal')
	const closeAdbGuideModal = document.getElementById('closeAdbGuideModal')

	if (!adbGuideModal) return

	// Закрытие модального окна
	if (closeAdbGuideModal) {
		closeAdbGuideModal.addEventListener('click', function () {
			adbGuideModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		})
	}

	// Закрытие при клике на фон
	adbGuideModal.addEventListener('click', function (e) {
		if (e.target === adbGuideModal) {
			adbGuideModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})
}

// Функция для работы с модальным окном "Гайд по установке через Bugjaeger"
function initBugjaegerGuideModal() {
	const bugjaegerGuideModal = document.getElementById('bugjaegerGuideModal')
	const closeBugjaegerGuideModal = document.getElementById(
		'closeBugjaegerGuideModal'
	)

	if (!bugjaegerGuideModal) return

	// Закрытие модального окна
	if (closeBugjaegerGuideModal) {
		closeBugjaegerGuideModal.addEventListener('click', function () {
			bugjaegerGuideModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		})
	}

	// Закрытие при клике на фон
	bugjaegerGuideModal.addEventListener('click', function (e) {
		if (e.target === bugjaegerGuideModal) {
			bugjaegerGuideModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})
}

// Функция для обработки клавиши Escape для всех модальных окон
function initEscapeKeyHandler() {
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') {
			const modals = [
				document.getElementById('contactsModal'),
				document.getElementById('faqModal'),
				document.getElementById('installMethodModal'),
				document.getElementById('wearloadGuideModal'),
				document.getElementById('adbGuideModal'),
				document.getElementById('bugjaegerGuideModal'),
				document.getElementById('aboutModal'),
			]

			modals.forEach(modal => {
				if (modal && modal.classList.contains('show')) {
					modal.classList.remove('show')
					document.body.style.overflow = 'auto'
				}
			})
		}
	})
}

// Функция для работы с модальным окном "Условия использования"
function initTermsModal() {
	const termsLink = document.getElementById('termsLink')
	const termsModal = document.getElementById('termsModal')
	const closeTermsModal = document.getElementById('closeTermsModal')

	if (!termsLink || !termsModal) return

	// Открытие модального окна
	termsLink.addEventListener('click', function (e) {
		e.preventDefault()
		termsModal.classList.add('show')
		document.body.style.overflow = 'hidden'
	})

	// Закрытие модального окна
	closeTermsModal.addEventListener('click', function () {
		termsModal.classList.remove('show')
		document.body.style.overflow = 'auto'
	})

	// Закрытие при клике на фон
	termsModal.addEventListener('click', function (e) {
		if (e.target === termsModal) {
			termsModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})

	// Закрытие по клавише Escape
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && termsModal.classList.contains('show')) {
			termsModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})
}

// Функция для работы с модальным окном "Политика конфиденциальности"
function initPrivacyModal() {
	const privacyLink = document.getElementById('privacyLink')
	const privacyModal = document.getElementById('privacyModal')
	const closePrivacyModal = document.getElementById('closePrivacyModal')

	if (!privacyLink || !privacyModal) return

	// Открытие модального окна
	privacyLink.addEventListener('click', function (e) {
		e.preventDefault()
		privacyModal.classList.add('show')
		document.body.style.overflow = 'hidden'
	})

	// Закрытие модального окна
	closePrivacyModal.addEventListener('click', function () {
		privacyModal.classList.remove('show')
		document.body.style.overflow = 'auto'
	})

	// Закрытие при клике на фон
	privacyModal.addEventListener('click', function (e) {
		if (e.target === privacyModal) {
			privacyModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})

	// Закрытие по клавише Escape
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && privacyModal.classList.contains('show')) {
			privacyModal.classList.remove('show')
			document.body.style.overflow = 'auto'
		}
	})
}

// Экспортируем все функции для использования в main.js
export {
	initContactsModal,
	initFaqModal,
	initAboutModal,
	initInstallGuideLinks,
	initInstallMethodModal,
	initWearloadGuideModal,
	initAdbGuideModal,
	initBugjaegerGuideModal,
	initEscapeKeyHandler,
	initFaqAccordion,
	initTermsModal,
	initPrivacyModal,
}
