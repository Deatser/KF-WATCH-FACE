// resend-mailer.js - отправка почты через Resend API
const { Resend } = require('resend')
const fs = require('fs')
const path = require('path')

// Получаем API ключ из переменных окружения
const RESEND_API_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.SITE_URL || 'https://www.kf-watchface.ru'

console.log('📧 ====== RESEND CONFIGURATION ======')
console.log(
	`📧 RESEND_API_KEY configured: ${RESEND_API_KEY ? 'YES (hidden)' : 'NO'}`
)
console.log(`📧 SITE_URL: ${SITE_URL}`)

if (!RESEND_API_KEY) {
	console.error('❌ CRITICAL: RESEND_API_KEY not configured!')
	console.error(
		'❌ Please set RESEND_API_KEY in Render.com Environment Variables'
	)
	console.error('❌ Get your API key from: https://resend.com/api-keys')
}

// Инициализируем Resend
const resend = new Resend(RESEND_API_KEY)

// Загружаем HTML шаблон
function loadEmailTemplate() {
	try {
		const templatePath = path.join(__dirname, 'email-template.html')
		if (fs.existsSync(templatePath)) {
			return fs.readFileSync(templatePath, 'utf8')
		} else {
			console.warn('⚠️ Email template not found, using default')
			return getDefaultTemplate()
		}
	} catch (error) {
		console.error('❌ Error loading email template:', error)
		return getDefaultTemplate()
	}
}

// Резервный шаблон
function getDefaultTemplate() {
	return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Заказ #{orderId} оплачен</title>
</head>
<body>
    <h1>Заказ #{orderId} оплачен</h1>
    <p>Циферблат: {productName}</p>
    <p>Ссылка для скачивания: {downloadUrl}</p>
</body>
</html>
    `
}

// Функция отправки письма
async function sendOrderEmail(order) {
	try {
		console.log(`📧 ====== RESEND: START SENDING EMAIL ======`)
		console.log(`📧 Order: ${order.orderId}`)
		console.log(`📧 To: ${order.customerEmail}`)
		console.log(`📧 Product: ${order.productName}`)
		console.log(`📧 ReceivingId: ${order.receivingId}`)

		// Проверяем наличие API ключа
		if (!RESEND_API_KEY) {
			console.error('❌ ERROR: RESEND_API_KEY not configured')
			return { success: false, error: 'Resend API key not configured' }
		}

		// Проверяем наличие receivingId
		if (!order.receivingId) {
			console.error('❌ ERROR: No receivingId provided for email')
			return { success: false, error: 'No receivingId provided' }
		}

		// Исправляем URL (убираем лишний слэш)
		const cleanSiteUrl = SITE_URL.replace(/\/$/, '')
		const downloadUrl = `${cleanSiteUrl}/purchase/receiving/${order.receivingId}`

		console.log(`🔗 Clean Download URL: ${downloadUrl}`)

		// Отправляем через Resend API
		console.log(`📧 Sending via Resend API...`)

		const { data, error } = await resend.emails.send({
			from: 'KF WatchFace <support@kf-watchface.ru>',
			to: order.customerEmail,
			subject: `✅ Заказ #${order.orderId} оплачен - KF WATCH FACE`,
			text: generatePlainTextEmail(order, downloadUrl),
			html: generateHtmlEmail(order, downloadUrl),
		})

		if (error) {
			console.error('❌ RESEND API ERROR:')
			console.error('❌ Error:', error)
			return {
				success: false,
				error: error.message,
				details: error,
			}
		}

		console.log(`✅ RESEND EMAIL SENT SUCCESSFULLY!`)
		console.log(`📧 Email ID: ${data.id}`)
		console.log(`📧 ====== EMAIL SENT ======`)

		return {
			success: true,
			messageId: data.id,
			data: data,
		}
	} catch (error) {
		console.error('❌ RESEND UNEXPECTED ERROR:')
		console.error('❌ Error message:', error.message)
		console.error('❌ Stack trace:', error.stack)

		return {
			success: false,
			error: error.message,
			details: error,
		}
	}
}

// Генерация текстовой версии письма
function generatePlainTextEmail(order, downloadUrl) {
	const formattedDate = new Date(order.paidAt).toLocaleString('ru-RU')
	const productDisplayName = order.productName || order.productId

	return `
✅ Заказ #${order.orderId} оплачен

📋 ДЕТАЛИ ЗАКАЗА:
━━━━━━━━━━━━━━━━━━━━━━━━
• Номер заказа: #${order.orderId}
• Циферблат: ${productDisplayName}
• Email покупателя: ${order.customerEmail}
• Сумма оплаты: ${order.price} ₽
• Статус: Оплачено ✓
• Дата оплаты: ${formattedDate}

📥 ВАШ ЦИФЕРБЛАТ ГОТОВ:
━━━━━━━━━━━━━━━━━━━━━━━━
Ссылка для скачивания:
${downloadUrl}

Формат: APK
Размер: ~5-10 MB
Доступен: 30 дней

🛠️ КАК УСТАНОВИТЬ:
━━━━━━━━━━━━━━━━━━━━━━━━
🎯 РЕКОМЕНДУЕМЫЙ СПОСОБ:
1. WearLoad (через смартфон)
   - Установите WearLoad на телефон
   - Скачайте файл по ссылке выше
   - Откройте файл через WearLoad
   - Следуйте инструкциям в приложении

🔧 АЛЬТЕРНАТИВНЫЕ СПОСОБЫ:
2. ADB App Control (через ПК)
   - Установите ADB App Control на ПК
   - Включите отладку по USB на часах
   - Подключите часы к ПК
   - Загрузите файл через программу

3. Bugjaeger (через смартфон)
   - Установите Bugjaeger на телефон
   - Включите отладку по Bluetooth на часах
   - Подключите часы к телефону
   - Загрузите файл через приложение

⚠️ ВАЖНАЯ ИНФОРМАЦИЯ:
━━━━━━━━━━━━━━━━━━━━━━━━
• Ссылка активна 30 дней
• Сохраните это письмо для доступа к файлу
• Файл предназначен для часов Wear OS
• Нужна помощь? Пишите в поддержку

📞 ПОДДЕРЖКА:
━━━━━━━━━━━━━━━━━━━━━━━━
Telegram: https://t.me/krek_free

© 2026 KF WATCH FACE. Все права защищены.
━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim()
}

// Генерация HTML версии письма
function generateHtmlEmail(order, downloadUrl) {
	const template = loadEmailTemplate()

	// Заменяем плейсхолдеры
	return template
		.replace(/{orderId}/g, order.orderId)
		.replace(/{productId}/g, order.productId || '')
		.replace(/{productName}/g, order.productName || order.productId)
		.replace(/{customerEmail}/g, order.customerEmail)
		.replace(/{price}/g, order.price)
		.replace(/{paidAt}/g, new Date(order.paidAt).toLocaleString('ru-RU'))
		.replace(/{downloadUrl}/g, downloadUrl)
		.replace(/{siteUrl}/g, SITE_URL.replace(/\/$/, ''))
}

// Тестовая функция
async function sendTestEmail() {
	console.log('📧 ====== TESTING RESEND EMAIL ======')
	console.log('📅 Time:', new Date().toISOString())
	console.log(
		`📧 RESEND_API_KEY configured: ${RESEND_API_KEY ? 'YES (hidden)' : 'NO'}`
	)
	console.log(`📧 SITE_URL: ${SITE_URL}`)

	if (!RESEND_API_KEY) {
		console.error('❌ Cannot test: RESEND_API_KEY not configured')
		return { success: false, error: 'API key not configured' }
	}

	const testOrder = {
		orderId: 999999,
		productId: 'KF159',
		productName: 'Циферблат KF159',
		customerEmail: 'koranitplay@gmail.com',
		price: 150,
		paidAt: new Date().toISOString(),
		receivingId: 'test-123',
	}

	console.log('📧 Test order data:', testOrder)

	const result = await sendOrderEmail(testOrder)

	console.log('📧 Test result:', result)
	console.log('📧 ====== RESEND EMAIL TEST COMPLETE ======')

	return result
}

module.exports = { sendOrderEmail, sendTestEmail }
