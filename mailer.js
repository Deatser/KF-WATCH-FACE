// mailer.js - без dotenv
const nodemailer = require('nodemailer')

// Настройка Gmail - замени на свои данные
const EMAIL_USER = process.env.MAIL_USER
const EMAIL_PASS = process.env.MAIL_PASS
// Добавлена возможность задать через переменные окружения
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000'

const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: EMAIL_USER,
		pass: EMAIL_PASS,
	},
})

// Функция отправки письма
async function sendOrderEmail(order) {
	try {
		console.log(
			`📧 Sending email for order ${order.orderId} to ${order.customerEmail}`
		)

		// Ссылка для скачивания
		const downloadUrl = `${SITE_URL}/purchase/receiving/${order.receivingId}`

		// Простое текстовое письмо
		const mailOptions = {
			from: `"KF WATCH FACE" <${EMAIL_USER}>`,
			to: order.customerEmail,
			subject: `✅ Заказ #${order.orderId} оплачен - KF WATCH FACE`,
			text: `
Заказ #${order.orderId} успешно оплачен!

Циферблат: ${order.productName || order.productId}
Сумма: ${order.price} руб.
Дата: ${new Date(order.paidAt).toLocaleString('ru-RU')}

Ссылка для скачивания:
${downloadUrl}

Ссылка активна 30 дней.

Поддержка: https://t.me/krek_free

KF WATCH FACE
            `,
		}

		// Отправляем
		const info = await transporter.sendMail(mailOptions)
		console.log(`✅ Email sent: ${info.messageId}`)

		return { success: true, messageId: info.messageId }
	} catch (error) {
		console.error('❌ Email error:', error)
		return { success: false, error: error.message }
	}
}

// Тестовая функция
async function sendTestEmail() {
	console.log('📧 Testing email...')

	const testOrder = {
		orderId: 999999,
		productId: 'KF159',
		productName: 'Циферблат KF159',
		customerEmail: 'koranitplay@gmail.com', // твоя почта
		price: 150,
		paidAt: new Date().toISOString(),
		receivingId: 'test-123',
	}

	const result = await sendOrderEmail(testOrder)
	console.log('Test result:', result)
	return result
}

module.exports = { sendOrderEmail, sendTestEmail }
