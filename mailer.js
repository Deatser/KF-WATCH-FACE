// mailer.js - без dotenv
const nodemailer = require('nodemailer')

// Настройка Gmail - замени на свои данные
const EMAIL_USER = process.env.MAIL_USER
const EMAIL_PASS = process.env.MAIL_PASS
// Добавлена возможность задать через переменные окружения
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000'

// Детальное логирование переменных окружения (без показа пароля)
console.log('📧 ====== EMAIL CONFIGURATION ======')
console.log(`📧 EMAIL_USER configured: ${EMAIL_USER ? 'YES' : 'NO'}`)
console.log(`📧 EMAIL_USER value: ${EMAIL_USER}`)
console.log(`📧 EMAIL_PASS configured: ${EMAIL_PASS ? 'YES (hidden)' : 'NO'}`)
console.log(`📧 SITE_URL: ${SITE_URL}`)

if (!EMAIL_USER || !EMAIL_PASS) {
	console.error('❌ CRITICAL: Email credentials not configured!')
	console.error(
		'❌ Please set MAIL_USER and MAIL_PASS in Render.com Environment Variables'
	)
} else {
	console.log('✅ Email credentials are configured')
}

const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: EMAIL_USER,
		pass: EMAIL_PASS,
	},
	// Добавляем настройки для Render.com
	host: 'smtp.gmail.com',
	port: 587,
	secure: false, // true для порта 465, false для 587
	requireTLS: true,
	connectionTimeout: 10000, // 10 секунд таймаут
	greetingTimeout: 10000,
	socketTimeout: 10000,
	tls: {
		rejectUnauthorized: false, // Важно для Render.com
	},
})

// Функция отправки письма
async function sendOrderEmail(order) {
	try {
		console.log(`📧 ====== START SENDING EMAIL ======`)
		console.log(`📧 Order: ${order.orderId}`)
		console.log(`📧 To: ${order.customerEmail}`)
		console.log(`📧 Product: ${order.productName}`)
		console.log(`📧 ReceivingId: ${order.receivingId}`)

		// Проверяем наличие переменных окружения
		if (!EMAIL_USER || !EMAIL_PASS) {
			console.error(
				'❌ ERROR: Email credentials not configured in environment variables'
			)
			console.error(`❌ EMAIL_USER: ${EMAIL_USER ? 'SET' : 'NOT SET'}`)
			console.error(`❌ EMAIL_PASS: ${EMAIL_PASS ? 'SET (hidden)' : 'NOT SET'}`)
			return { success: false, error: 'Email credentials not configured' }
		}

		// Проверяем наличие receivingId
		if (!order.receivingId) {
			console.error('❌ ERROR: No receivingId provided for email')
			return { success: false, error: 'No receivingId provided' }
		}

		// Ссылка для скачивания
		const downloadUrl = `${SITE_URL}/purchase/receiving/${order.receivingId}`
		console.log(`🔗 Download URL: ${downloadUrl}`)

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
			html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #8b7355; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .btn { display: inline-block; background: #8b7355; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Заказ #${order.orderId} оплачен</h1>
        </div>
        <div class="content">
            <h2>KF WATCH FACE</h2>
            <p><strong>Циферблат:</strong> ${
							order.productName || order.productId
						}</p>
            <p><strong>Сумма:</strong> ${order.price} руб.</p>
            <p><strong>Дата оплаты:</strong> ${new Date(
							order.paidAt
						).toLocaleString('ru-RU')}</p>
            
            <p style="margin: 25px 0;">Ссылка для скачивания файла:</p>
            <a href="${downloadUrl}" class="btn">📥 Скачать циферблат</a>
            
            <p>Или скопируйте ссылку:</p>
            <p style="background: #eee; padding: 10px; border-radius: 5px; word-break: break-all;">
                ${downloadUrl}
            </p>
            
            <div class="footer">
                <p>Ссылка активна 30 дней.</p>
                <p>Поддержка: <a href="https://t.me/krek_free">https://t.me/krek_free</a></p>
            </div>
        </div>
    </div>
</body>
</html>
            `,
		}

		console.log(`📧 Connecting to Gmail SMTP...`)
		console.log(`📧 Host: smtp.gmail.com:587`)
		console.log(`📧 Using secure connection: TLS`)

		// Проверяем подключение
		console.log(`📧 Verifying SMTP connection...`)
		await transporter.verify()
		console.log(`✅ SMTP connection verified successfully`)

		// Отправляем
		console.log(`📧 Sending email...`)
		const info = await transporter.sendMail(mailOptions)

		console.log(`✅ EMAIL SENT SUCCESSFULLY!`)
		console.log(`📧 Message ID: ${info.messageId}`)
		console.log(`📧 Response: ${info.response}`)
		console.log(`📧 Accepted recipients: ${info.accepted}`)
		console.log(`📧 Rejected recipients: ${info.rejected}`)
		console.log(`📧 ====== EMAIL SENT ======`)

		return {
			success: true,
			messageId: info.messageId,
			response: info.response,
		}
	} catch (error) {
		console.error('❌ EMAIL ERROR DETAILS:')
		console.error('❌ Error message:', error.message)
		console.error('❌ Error code:', error.code)
		console.error('❌ Error command:', error.command)

		if (error.responseCode) {
			console.error('❌ Response Code:', error.responseCode)
		}
		if (error.response) {
			console.error('❌ SMTP Response:', error.response)
		}

		// Проверяем типичные ошибки Gmail
		if (error.code === 'EAUTH') {
			console.error('❌ AUTHENTICATION ERROR: Invalid email credentials')
			console.error(
				'❌ Make sure you are using App Password, not regular password'
			)
			console.error('❌ Enable 2-Step Verification and create App Password:')
			console.error('❌ https://myaccount.google.com/security')
		} else if (error.code === 'ETIMEDOUT') {
			console.error('❌ TIMEOUT ERROR: Connection to Gmail SMTP timed out')
			console.error('❌ This might be due to Render.com network restrictions')
		} else if (error.code === 'ECONNREFUSED') {
			console.error('❌ CONNECTION REFUSED: Gmail SMTP not accessible')
			console.error('❌ Render.com might be blocking port 587')
		}

		console.error('❌ Full error:', error)

		return {
			success: false,
			error: error.message,
			details: {
				code: error.code,
				command: error.command,
				responseCode: error.responseCode,
			},
		}
	}
}

// Тестовая функция с детальным логированием
async function sendTestEmail() {
	console.log('📧 ====== TESTING EMAIL FUNCTION ======')
	console.log('📅 Time:', new Date().toISOString())
	console.log(`📧 EMAIL_USER: ${EMAIL_USER}`)
	console.log(`📧 SITE_URL: ${SITE_URL}`)
	console.log(`📧 Current NODE_ENV: ${process.env.NODE_ENV || 'not set'}`)

	// Проверяем все переменные окружения (для отладки)
	console.log('📧 All environment variables starting with MAIL:')
	Object.keys(process.env).forEach(key => {
		if (key.includes('MAIL') || key.includes('EMAIL')) {
			const value = key.includes('PASS') ? '***HIDDEN***' : process.env[key]
			console.log(`   ${key}: ${value}`)
		}
	})

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
	console.log('📧 ====== EMAIL TEST COMPLETE ======')

	return result
}

module.exports = { sendOrderEmail, sendTestEmail }
