import hashlib
import json
import urllib.parse

# Твои данные
MERCHANT_LOGIN = "0"
PASSWORD1 = "1"
OUT_SUM = 1.0
INV_ID = 99999994  # новый ID
DESCRIPTION = "Тест ручной ссылки"
EMAIL = "koranitplay@gmail.com"

# Формируем Receipt
receipt_data = {
    "sno": "usn_income",
    "items": [{
        "name": "Циферблат KF159 для умных часов",
        "quantity": 1,
        "sum": 1.0,
        "payment_method": "full_payment",
        "payment_object": "commodity",
        "tax": "none"
    }]
}

# 1. Преобразуем в JSON
receipt_json = json.dumps(receipt_data, ensure_ascii=False, separators=(',', ':'))
print("📋 Receipt JSON:", receipt_json)

# 2. URL-кодируем ОДИН раз
encoded_receipt = urllib.parse.quote(receipt_json, safe='')
print("\n📋 Receipt URL-encoded:")
print(encoded_receipt[:150] + "..." if len(encoded_receipt) > 150 else encoded_receipt)

# 3. Формируем строку для подписи
# Формат: MerchantLogin:OutSum:InvId:Receipt:Пароль#1
signature_string = f"{MERCHANT_LOGIN}:{OUT_SUM}:{INV_ID}:{encoded_receipt}:{PASSWORD1}"
print("\n📝 Строка для подписи:")
print(signature_string)

# 4. Вычисляем MD5-подпись
signature = hashlib.md5(signature_string.encode('utf-8')).hexdigest()
print(f"\n🔐 Подпись (MD5): {signature}")

# 5. Формируем параметры
params = {
    "MerchantLogin": MERCHANT_LOGIN,
    "OutSum": OUT_SUM,
    "InvId": INV_ID,
    "Receipt": encoded_receipt,
    "Description": DESCRIPTION,
    "Email": EMAIL,
    "Culture": "ru",
    "IsTest": 0,
    "SignatureValue": signature
}

# 6. Собираем URL
base_url = "https://auth.robokassa.ru/Merchant/Index.aspx"

# Кодируем каждый параметр
query_parts = []
for key, value in params.items():
    encoded_key = urllib.parse.quote(str(key), safe='')
    encoded_value = urllib.parse.quote(str(value), safe='')
    query_parts.append(f"{encoded_key}={encoded_value}")

query_string = "&".join(query_parts)
final_url = f"{base_url}?{query_string}"

print("\n" + "="*60)
print("✅ РУЧНАЯ ССЫЛКА СОЗДАНА")
print("="*60)

print(f"\n🔗 Полная ссылка ({len(final_url)} символов):")
print(final_url)

print("\n🔍 Проверка кодирования:")
print(f"- Содержит %2522 (двойное кодирование): {'%2522' in final_url}")
print(f"- Содержит %22 (правильное кодирование): {'%22' in final_url}")

# Сохраняем ссылку в файл для удобства
with open("payment_link.txt", "w", encoding="utf-8") as f:
    f.write(final_url)

print("\n💾 Ссылка сохранена в файл 'payment_link.txt'")
print("\n⚠️  ОТКРОЙТЕ эту ссылку и проверьте:")
print("1. Цена должна быть 1 ₽ (не 0 ₽!)")
print("2. В описании товара должен быть 'Циферблат KF159'")
print("3. Если всё ок — оплатите и проверьте чек в ЛК")
