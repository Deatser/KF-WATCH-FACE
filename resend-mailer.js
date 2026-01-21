// resend-mailer.js - отправка почты через Resend API
const { Resend } = require('resend')

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
		const cleanSiteUrl = SITE_URL.replace(/\/$/, '') // Убираем завершающий слэш если есть
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
	return `
Заказ #${order.orderId} успешно оплачен!

Детали заказа:
Номер заказа: #${order.orderId}
Циферблат: ${order.productName || order.productId}
Email покупателя: ${order.customerEmail}
Сумма оплаты: ${order.price} ₽
Статус: Оплачено ✓
Дата оплаты: ${new Date(order.paidAt).toLocaleString('ru-RU')}

Ваш циферблат готов к скачиванию:
${downloadUrl}

Как установить циферблат:

1. WearLoad (рекомендуем):
   - Установите приложение WearLoad на телефон
   - Скачайте файл по ссылке выше
   - Откройте файл через WearLoad
   - Следуйте инструкциям в приложении

2. ADB App Control:
   - Установите ADB App Control на ПК
   - Включите отладку по USB на часах
   - Подключите часы к ПК
   - Загрузите файл через программу

3. Bugjaeger:
   - Установите Bugjaeger на телефон
   - Включите отладку по Bluetooth на часах
   - Подключите часы к телефону
   - Загрузите файл через приложение

Важно:
- Ссылка активна 30 дней
- Сохраните это письмо для доступа к файлу
- Файл в формате APK для установки на часы Wear OS

Нужна помощь с установкой?
Telegram поддержка: https://t.me/krek_free

© 2026 KF WATCH FACE. Все права защищены.
    `.trim()
}

// Генерация HTML версии письма
function generateHtmlEmail(order, downloadUrl) {
	const formattedDate = new Date(order.paidAt).toLocaleString('ru-RU')
	const productDisplayName = order.productName || order.productId

	return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Заказ #${order.orderId} оплачен</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f0e8;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #8b7355 0%, #a89176 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
        }
        .content {
            padding: 30px;
        }
        .order-details {
            background: #f9f9f9;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 25px;
            border-left: 4px solid #8b7355;
        }
        .detail-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #eee;
        }
        .detail-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        .detail-label {
            color: #666;
            font-weight: 500;
            flex: 1;
        }
        .detail-value {
            color: #1a1a1a;
            font-weight: 600;
            flex: 1;
            text-align: right;
        }
        .status-badge {
            background: #4CAF50;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.9em;
            font-weight: 600;
        }
        .download-section {
            text-align: center;
            padding: 30px;
            background: linear-gradient(135deg, #f5f0e8 0%, #e8dfd0 100%);
            border-radius: 12px;
            margin: 25px 0;
            border: 2px solid #8b7355;
        }
        .btn-download {
            display: inline-block;
            background: linear-gradient(135deg, #8b7355 0%, #a89176 100%);
            color: white;
            text-decoration: none;
            padding: 16px 40px;
            border-radius: 25px;
            font-weight: 600;
            font-size: 16px;
            margin: 15px 0;
            transition: transform 0.3s ease;
            box-shadow: 0 4px 12px rgba(139, 115, 85, 0.3);
        }
        .btn-download:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(139, 115, 85, 0.4);
        }
        .instructions {
            margin-top: 30px;
            padding: 25px;
            background: #f0f7ff;
            border-radius: 10px;
            border-left: 4px solid #2196F3;
        }
        .instructions h3 {
            color: #2196F3;
            margin-bottom: 15px;
        }
        .install-methods {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-top: 20px;
        }
        .install-method {
            background: white;
            border-radius: 8px;
            padding: 15px;
            border: 1px solid #e0e0e0;
        }
        .method-title {
            color: #8b7355;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .method-recommended {
            background: #fff3cd;
            border: 1px solid #ffc107;
            color: #856404;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: 600;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffc107;
            color: #856404;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
            font-size: 14px;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
            text-align: center;
        }
        .support-link {
            color: #8b7355;
            text-decoration: none;
            font-weight: 600;
        }
        .url-box {
            background: white;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
            word-break: break-all;
            font-family: monospace;
            font-size: 14px;
            color: #333;
            margin: 15px 0;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Заказ #${order.orderId} оплачен</h1>
        </div>
        
        <div class="content">
            <div class="order-details">
                <h2 style="color: #1a1a1a; margin-top: 0; margin-bottom: 20px; font-size: 1.2rem;">
                    <i class="fas fa-receipt"></i> Детали заказа
                </h2>
                
                <div class="detail-item">
                    <span class="detail-label">Номер заказа:</span>
                    <span class="detail-value">#${order.orderId}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Циферблат:</span>
                    <span class="detail-value">${productDisplayName}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Email покупателя:</span>
                    <span class="detail-value">${order.customerEmail}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Сумма оплаты:</span>
                    <span class="detail-value">${order.price} ₽</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Статус:</span>
                    <span class="detail-value">
                        <span class="status-badge">Оплачено ✓</span>
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Дата оплаты:</span>
                    <span class="detail-value">${formattedDate}</span>
                </div>
            </div>
            
            <div class="download-section">
                <h2 style="color: #1a1a1a; margin-bottom: 20px; font-size: 1.3rem;">
                    <i class="fas fa-download"></i> Ваш циферблат готов!
                </h2>
                <p style="margin-bottom: 25px; color: #555; font-size: 1rem;">
                    Файл циферблата в формате APK для установки на часы Wear OS
                </p>
                
                <a href="${downloadUrl}" class="btn-download">
                    📥 Ваш циферблат тут
                </a>
                
                <div style="margin-top: 20px;">
                    <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
                        Или скопируйте ссылку:
                    </p>
                    <div class="url-box">
                        ${downloadUrl}
                    </div>
                </div>
                
                <p style="margin-top: 20px; color: #666; font-size: 14px;">
                    <i class="fas fa-info-circle"></i> Размер: ~5-10 MB | Формат: APK
                </p>
            </div>
            
            <div class="instructions">
                <h3><i class="fas fa-info-circle"></i> Как установить циферблат:</h3>
                
                <div class="install-methods">
                    <div class="install-method">
                        <div class="method-title">
                            <i class="fas fa-mobile-alt"></i> WearLoad
                            <span class="method-recommended">Рекомендуем</span>
                        </div>
                        <p style="margin: 0; color: #333; font-size: 0.95rem;">
                            Самый простой способ через смартфон. Установите приложение WearLoad, 
                            скачайте файл и откройте его через приложение.
                        </p>
                    </div>
                    
                    <div class="install-method">
                        <div class="method-title">
                            <i class="fas fa-cogs"></i> ADB App Control
                        </div>
                        <p style="margin: 0; color: #333; font-size: 0.95rem;">
                            Для установки через ПК. Требуется включить отладку по USB 
                            на часах и подключить их к компьютеру.
                        </p>
                    </div>
                    
                    <div class="install-method">
                        <div class="method-title">
                            <i class="fas fa-bug"></i> Bugjaeger
                        </div>
                        <p style="margin: 0; color: #333; font-size: 0.95rem;">
                            Для установки через смартфон по Bluetooth. Требуется включить 
                            отладку по Bluetooth на часах.
                        </p>
                    </div>
                </div>
            </div>
            
            <div class="warning">
                <strong>⚠️ Важно:</strong> Ссылка активна 30 дней. Сохраните это письмо 
                для доступа к файлу в будущем.
            </div>
            
            <div class="footer">
                <p>Нужна помощь с установкой?</p>
                <p style="margin: 15px 0;">
                    <a href="https://t.me/krek_free" target="_blank" class="support-link">
                        <i class="fab fa-telegram"></i> Написать в Telegram поддержку
                    </a>
                </p>
                <p style="margin-top: 15px; font-size: 13px; color: #888;">
                    © 2026 KF WATCH FACE. Все права защищены.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `.trim()
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
