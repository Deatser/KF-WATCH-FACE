#!/usr/bin/env python3
import sys
import json
import os
import hashlib
import urllib.parse

class RobokassaHandler:
    def __init__(self, is_test=False):
        self.merchant_login = os.environ.get('ROBOKASSA_LOGIN', '')
        self.password1 = os.environ.get('ROBOKASSA_PASS1', '')
        self.password2 = os.environ.get('ROBOKASSA_PASS2', '')
        self.is_test = is_test
        
        if not self.password1 or not self.password2:
            raise ValueError("Robokassa пароли не установлены")

    async def generate_protected_payment_link(self, out_sum, inv_id, description=None, email=None, **kwargs):
        """
        Создание платежной ссылки с Receipt (РАБОЧИЙ РУЧНОЙ МЕТОД)
        """
        try:
            # Получаем название товара
            product_name = kwargs.get('product_name', '')
            if not product_name and description:
                # Пытаемся извлечь KFXXX из описания
                import re
                match = re.search(r'KF\d{3}', description)
                if match:
                    product_name = f"Циферблат {match.group(0)}"
            
            if not product_name:
                product_name = f"Циферблат #{inv_id}"
            
            # 1. Формируем Receipt
            receipt_data = {
                "sno": "usn_income",  # УСН доходы
                "items": [{
                    "name": product_name[:128],
                    "quantity": 1,
                    "sum": float(out_sum),
                    "payment_method": "full_payment",
                    "payment_object": "commodity",
                    "tax": "none"
                }]
            }
            
            # 2. Преобразуем в JSON
            receipt_json = json.dumps(receipt_data, ensure_ascii=False, separators=(',', ':'))
            
            # 3. URL-кодируем ОДИН раз
            encoded_receipt = urllib.parse.quote(receipt_json, safe='')
            
            # 4. Формируем строку для подписи
            signature_string = f"{self.merchant_login}:{out_sum}:{inv_id}:{encoded_receipt}:{self.password1}"
            
            # 5. Вычисляем MD5
            signature = hashlib.md5(signature_string.encode('utf-8')).hexdigest()
            
            # 6. Формируем параметры
            params = {
                "MerchantLogin": self.merchant_login,
                "OutSum": out_sum,
                "InvId": inv_id,
                "Receipt": encoded_receipt,
                "Description": description or f"Оплата заказа #{inv_id}",
                "Email": email or "",
                "Culture": "ru",
                "IsTest": 1 if self.is_test else 0,
                "SignatureValue": signature
            }
            
            # 7. Собираем URL
            base_url = "https://auth.robokassa.ru/Merchant/Index.aspx"
            
            query_parts = []
            for key, value in params.items():
                if value is not None and str(value) != "":
                    encoded_key = urllib.parse.quote(str(key), safe='')
                    encoded_value = urllib.parse.quote(str(value), safe='')
                    query_parts.append(f"{encoded_key}={encoded_value}")
            
            query_string = "&".join(query_parts)
            payment_url = f"{base_url}?{query_string}"
            
            return {
                'success': True,
                'payment_url': payment_url,
                'invoice_id': str(inv_id),
                'inv_id': inv_id,
                'out_sum': out_sum,
                'is_test': self.is_test,
                'method': 'manual_with_receipt',
                'receipt_data': receipt_data,
                'signature_string': signature_string,  # для отладки
                'encoded_receipt': encoded_receipt     # для отладки
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'method': 'manual_with_receipt'
            }

    def check_result_signature(self, out_sum, inv_id, signature, receipt=None, **kwargs):
        """
        Проверка подписи для Result URL с учетом разных вариантов
        """
        try:
            print(f"🔍 DEBUG: Starting signature check")
            print(f"  out_sum: {out_sum}")
            print(f"  inv_id: {inv_id}")
            print(f"  signature: {signature}")
            print(f"  receipt: {receipt}")
            print(f"  merchant_login: {self.merchant_login}")
            
            # Вариант 1: С Receipt (если Robokassa его отправил)
            if receipt:
                signature_string_with_receipt = f"{self.merchant_login}:{out_sum}:{inv_id}:{receipt}:{self.password2}"
                calculated_with_receipt = hashlib.md5(signature_string_with_receipt.encode('utf-8')).hexdigest()
                print(f"  With receipt string: {signature_string_with_receipt}")
                print(f"  With receipt calculated: {calculated_with_receipt}")
                
                if calculated_with_receipt.lower() == signature.lower():
                    return {
                        'success': True,
                        'is_valid': True,
                        'method': 'with_receipt',
                        'inv_id': inv_id,
                        'out_sum': out_sum,
                        'calculated': calculated_with_receipt
                    }
            
            # Вариант 2: Без Receipt (Robokassa часто не отправляет Receipt в Result URL)
            signature_string_without_receipt = f"{self.merchant_login}:{out_sum}:{inv_id}:{self.password2}"
            calculated_without_receipt = hashlib.md5(signature_string_without_receipt.encode('utf-8')).hexdigest()
            print(f"  Without receipt string: {signature_string_without_receipt}")
            print(f"  Without receipt calculated: {calculated_without_receipt}")
            
            # Вариант 3: С пустым Receipt (двойное двоеточие)
            signature_string_empty_receipt = f"{self.merchant_login}:{out_sum}:{inv_id}::{self.password2}"
            calculated_empty_receipt = hashlib.md5(signature_string_empty_receipt.encode('utf-8')).hexdigest()
            print(f"  Empty receipt string: {signature_string_empty_receipt}")
            print(f"  Empty receipt calculated: {calculated_empty_receipt}")
            
            # Проверяем все варианты
            if calculated_without_receipt.lower() == signature.lower():
                return {
                    'success': True,
                    'is_valid': True,
                    'method': 'without_receipt',
                    'inv_id': inv_id,
                    'out_sum': out_sum,
                    'calculated': calculated_without_receipt
                }
            
            if calculated_empty_receipt.lower() == signature.lower():
                return {
                    'success': True,
                    'is_valid': True,
                    'method': 'empty_receipt',
                    'inv_id': inv_id,
                    'out_sum': out_sum,
                    'calculated': calculated_empty_receipt
                }
            
            # Все варианты не прошли
            return {
                'success': True,
                'is_valid': False,
                'method': 'none',
                'inv_id': inv_id,
                'out_sum': out_sum,
                'calculated_without': calculated_without_receipt,
                'calculated_empty': calculated_empty_receipt,
                'received': signature
            }
            
        except Exception as e:
            print(f"❌ ERROR in check_result_signature: {str(e)}")
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

    def check_result_signature_simple(self, out_sum, inv_id, signature, **kwargs):
        """
        Упрощенная проверка подписи для Result URL (без Receipt)
        """
        try:
            # Robokassa НЕ передает Receipt в Result URL
            signature_string = f"{self.merchant_login}:{out_sum}:{inv_id}:{self.password2}"
            calculated = hashlib.md5(signature_string.encode('utf-8')).hexdigest()
            is_valid = (calculated.lower() == signature.lower())
            
            return {
                'success': True,
                'is_valid': is_valid,
                'calculated': calculated,
                'received': signature,
                'inv_id': inv_id,
                'out_sum': out_sum
            }
            
        except Exception as e:
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

    def check_redirect_signature(self, out_sum, inv_id, signature, receipt=None, **kwargs):
        """
        Проверка подписи для Success/Fail URL
        """
        try:
            if receipt:
                signature_string = f"{out_sum}:{inv_id}:{receipt}:{self.password1}"
            else:
                signature_string = f"{out_sum}:{inv_id}:{self.password1}"
            
            calculated = hashlib.md5(signature_string.encode('utf-8')).hexdigest()
            is_valid = (calculated.lower() == signature.lower())
            
            return {
                'success': True,
                'is_valid': is_valid,
                'inv_id': inv_id,
                'out_sum': out_sum
            }
            
        except Exception as e:
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

    def calculate_signature_debug(self, out_sum, inv_id, **kwargs):
        """
        Отладочная функция для расчета подписи
        """
        try:
            # Для отладки создаем тестовый Receipt
            receipt_data = {
                "sno": "usn_income",
                "items": [{
                    "name": "Тестовый товар",
                    "quantity": 1,
                    "sum": float(out_sum),
                    "payment_method": "full_payment",
                    "payment_object": "commodity",
                    "tax": "none"
                }]
            }
            
            receipt_json = json.dumps(receipt_data, ensure_ascii=False, separators=(',', ':'))
            encoded_receipt = urllib.parse.quote(receipt_json, safe='')
            
            # Подпись для генерации (с Receipt)
            params_str_with_receipt = f"{self.merchant_login}:{out_sum}:{inv_id}:{encoded_receipt}:{self.password1}"
            calculated_signature_with = hashlib.md5(params_str_with_receipt.encode('utf-8')).hexdigest()
            
            # Подпись для Result URL (без Receipt)
            params_str_without = f"{self.merchant_login}:{out_sum}:{inv_id}:{self.password2}"
            calculated_signature_without = hashlib.md5(params_str_without.encode('utf-8')).hexdigest()
            
            return {
                'success': True,
                'calculated_signature_with_receipt': calculated_signature_with,
                'calculated_signature_without_receipt': calculated_signature_without,
                'params_string_with_receipt': params_str_with_receipt,
                'params_string_without_receipt': params_str_without,
                'receipt_encoded': encoded_receipt
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

async def main():
    try:
        input_data = sys.stdin.read()
        
        if input_data.strip():
            try:
                data = json.loads(input_data)
            except json.JSONDecodeError as e:
                error_result = {'success': False, 'error': f'Invalid JSON: {str(e)}'}
                print(json.dumps(error_result, ensure_ascii=False))
                sys.exit(1)
        else:
            data = {'action': 'test'}
        
        action = data.get('action', 'test')
        is_test = data.get('is_test', False)
        
        handler = RobokassaHandler(is_test=is_test)
        
        if action == 'generate_short_link':
            out_sum = float(data.get('out_sum', 150))
            inv_id = int(data.get('inv_id', 123456))
            description = data.get('description', 'Оплата заказа')
            email = data.get('email')
            product_name = data.get('product_name', '')  # Новый параметр
            
            result = await handler.generate_protected_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description,
                email=email,
                product_name=product_name
            )
            
        elif action == 'check_result_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            receipt = data.get('receipt')  # Новый параметр
            
            result = handler.check_result_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                receipt=receipt
            )
            
        elif action == 'check_result_signature_simple':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            
            result = handler.check_result_signature_simple(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature
            )
            
        elif action == 'check_redirect_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            receipt = data.get('receipt')  # Новый параметр
            
            result = handler.check_redirect_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                receipt=receipt
            )
            
        elif action == 'debug_signature':
            out_sum = float(data.get('out_sum', 120))
            inv_id = int(data.get('inv_id', 281476090))
            
            result = handler.calculate_signature_debug(
                out_sum=out_sum,
                inv_id=inv_id
            )
            
        elif action == 'test':
            result = {
                'success': True,
                'message': 'Robokassa handler ready (MANUAL RECEIPT METHOD)',
                'merchant_login': handler.merchant_login,
                'is_test': handler.is_test,
                'methods_available': [
                    'generate_short_link',
                    'check_result_signature',
                    'check_result_signature_simple',
                    'check_redirect_signature',
                    'debug_signature'
                ],
                'note': 'Ручной метод с Receipt, без двойного кодирования'
            }
        
        else:
            result = {'success': False, 'error': f'Unknown action: {action}'}
        
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        error_result = {'success': False, 'error': str(e)}
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())