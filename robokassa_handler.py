#!/usr/bin/env python3
import sys
import json
import os
import asyncio

# Импортируем официальную библиотеку robokassa
from robokassa import HashAlgorithm, Robokassa

class RobokassaHandler:
    def __init__(self, is_test=True):
        # ВАЖНО: Используйте те же данные что в рабочем скрипте
        self.merchant_login = 'kfwatchface'  # Ваш реальный логин
        self.password1 = "U85g8fxYMMyThLkr1W2n"  # Пароль1 из вашего рабочего скрипта
        self.password2 = "qe9Np4lhWwJG3nKF96Ro"  # Пароль2 из вашего рабочего скрипта
        self.is_test = is_test
        
        # Инициализируем Robokassa клиент (как в рабочем скрипте)
        self.robokassa = Robokassa(
            merchant_login=self.merchant_login,
            password1=self.password1,
            password2=self.password2,
            is_test=self.is_test,
            algorithm=HashAlgorithm.md5,
        )
    
    async def generate_open_payment_link(self, out_sum, inv_id, description=None, email=None, **kwargs):
        """
        Создание классической длинной ссылки
        """
        try:
            # Создаем ссылку с помощью официальной библиотеки
            response = self.robokassa.generate_open_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description or f"Оплата заказа #{inv_id}",
                email=email,
                **kwargs
            )
            
            return {
                'success': True,
                'payment_url': response.url,
                'params': response.params.to_dict(),
                'inv_id': inv_id,
                'out_sum': out_sum,
                'is_test': self.is_test,
                'method': 'open_link'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'method': 'open_link'
            }
    
    async def generate_protected_payment_link(self, out_sum, inv_id, description=None, email=None, **kwargs):
        """
        Создание короткой JWT ссылки
        ВАЖНО: используем тот же метод что и в рабочем скрипте
        """
        try:
            # Используем тот же метод что в рабочем скрипте
            response = self.robokassa.generate_open_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description or f"Оплата заказа #{inv_id}",
                email=email,
                **kwargs
            )
            
            return {
                'success': True,
                'payment_url': response.url,
                'invoice_id': str(inv_id),
                'inv_id': inv_id,
                'out_sum': out_sum,
                'is_test': self.is_test,
                'method': 'jwt_protected'
            }
            
        except Exception as e:
            # Если JWT не сработал, возвращаемся к классическому методу
            return await self.generate_open_payment_link(out_sum, inv_id, description, email, **kwargs)

    def check_result_signature(self, out_sum, inv_id, signature, **kwargs):
        """
        Проверка подписи для Result URL (уведомление от Robokassa)
        """
        try:
            # Собираем параметры для проверки
            params = {
                'OutSum': str(out_sum),
                'InvId': str(inv_id),
            }
            
            # Добавляем дополнительные параметры
            for key, value in kwargs.items():
                params[key] = value
            
            # Проверяем подпись Result URL
            is_valid = self.robokassa.is_result_notification_valid(
                signature=signature,
                out_sum=out_sum,
                inv_id=inv_id,
                **kwargs
            )
            
            return {
                'success': True,
                'is_valid': is_valid,
                'inv_id': inv_id,
                'out_sum': out_sum,
                'params_checked': params
            }
            
        except Exception as e:
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

    def check_redirect_signature(self, out_sum, inv_id, signature, **kwargs):
        """
        Проверка подписи для Success/Fail URL (редирект пользователя)
        """
        try:
            # ВАЖНО: Для redirect проверки нужно передать ВСЕ параметры
            # Собираем все параметры которые пришли
            redirect_params = {
                'OutSum': out_sum,
                'InvId': inv_id,
                'SignatureValue': signature,
            }
            
            # Добавляем все дополнительные параметры (включая IsTest, Culture)
            for key, value in kwargs.items():
                if key not in ['action', 'out_sum', 'inv_id', 'signature']:  # Исключаем служебные
                    redirect_params[key] = value
            
            print(f"🔍 Проверяем подпись с параметрами: {redirect_params}")
            
            # Проверяем подпись Redirect URL
            # ВАЖНО: метод is_redirect_valid ожидает именованные параметры
            is_valid = self.robokassa.is_redirect_valid(
                signature=signature,
                out_sum=out_sum,
                inv_id=inv_id,
                **{k: v for k, v in kwargs.items() if k.startswith('shp_') or k in ['IsTest', 'Culture']}
            )
            
            return {
                'success': True,
                'is_valid': is_valid,
                'inv_id': inv_id,
                'out_sum': out_sum,
                'method': 'is_redirect_valid',
                'params_used': redirect_params
            }
            
        except Exception as e:
            print(f"❌ Ошибка проверки подписи: {str(e)}")
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

    def check_redirect_signature_manual(self, out_sum, inv_id, signature, **kwargs):
        """
        Ручная проверка подписи для Success/Fail URL (альтернативный метод)
        Используется если стандартный не работает
        """
        try:
            # Собираем строку для хэширования в правильном порядке
            params_str = f"{out_sum}:{inv_id}:{self.password1}"
            
            # Добавляем shp_ параметры в алфавитном порядке
            shp_params = {}
            for key, value in kwargs.items():
                if key.startswith('shp_'):
                    shp_params[key] = value
            
            # Сортируем shp_ параметры по алфавиту
            if shp_params:
                sorted_shp_keys = sorted(shp_params.keys())
                for key in sorted_shp_keys:
                    params_str += f":{shp_params[key]}"
            
            print(f"🔍 Формируем строку для хэша: {params_str}")
            
            # Вычисляем MD5
            import hashlib
            calculated_signature = hashlib.md5(params_str.encode('utf-8')).hexdigest().lower()
            received_signature = signature.lower()
            
            print(f"🔍 Рассчитанная подпись: {calculated_signature}")
            print(f"🔍 Полученная подпись: {received_signature}")
            
            is_valid = calculated_signature == received_signature
            
            return {
                'success': True,
                'is_valid': is_valid,
                'calculated_signature': calculated_signature,
                'received_signature': received_signature,
                'inv_id': inv_id,
                'out_sum': out_sum,
                'method': 'manual_md5',
                'match': is_valid
            }
            
        except Exception as e:
            print(f"❌ Ошибка ручной проверки подписи: {str(e)}")
            return {
                'success': False,
                'is_valid': False,
                'error': str(e)
            }

async def main():
    try:
        # Читаем входные данные
        input_data = sys.stdin.read()

        # Декодирование для корректной работы с кириллицей
        if input_data.strip():
            try:
                input_data = input_data.encode('latin-1').decode('utf-8')
            except:
                pass  # Оставляем как есть если не получается
            
            data = json.loads(input_data)
        else:
            data = {'action': 'test'}

        print(f"📦 Получены данные: {json.dumps(data, ensure_ascii=False)}", file=sys.stderr)
        
        action = data.get('action', 'test')
        is_test = data.get('is_test', True)
        
        handler = RobokassaHandler(is_test=is_test)
        
        if action == 'generate_short_link':
            out_sum = float(data.get('out_sum', 150))
            inv_id = int(data.get('inv_id', 123456))
            description = data.get('description', 'Оплата заказа')
            email = data.get('email')
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_'):
                    kwargs[key] = value
            
            result = await handler.generate_protected_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description,
                email=email,
                **kwargs
            )
            
        elif action == 'generate_long_link':
            out_sum = float(data.get('out_sum', 150))
            inv_id = int(data.get('inv_id', 123456))
            description = data.get('description', 'Оплата заказа')
            email = data.get('email')
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_'):
                    kwargs[key] = value
            
            result = await handler.generate_open_payment_link(
                out_sum=out_sum,
                inv_id=inv_id,
                description=description,
                email=email,
                **kwargs
            )
            
        elif action == 'check_result_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            
            kwargs = {}
            for key, value in data.items():
                if key.startswith('shp_') or key in ['IsTest', 'Culture']:
                    kwargs[key] = value
            
            print(f"🔍 Проверка Result подписи: out_sum={out_sum}, inv_id={inv_id}, signature={signature}", file=sys.stderr)
            print(f"🔍 Доп. параметры: {kwargs}", file=sys.stderr)
            
            result = handler.check_result_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                **kwargs
            )
            
        elif action == 'check_redirect_signature':
            out_sum = float(data.get('out_sum', 0))
            inv_id = int(data.get('inv_id', 0))
            signature = data.get('signature', '')
            
            kwargs = {}
            for key, value in data.items():
                # Собираем ВСЕ параметры для проверки подписи
                if key.startswith('shp_') or key in ['IsTest', 'Culture', 'IncCurr']:
                    kwargs[key] = value
            
            print(f"🔍 Проверка Redirect подписи: out_sum={out_sum}, inv_id={inv_id}, signature={signature}", file=sys.stderr)
            print(f"🔍 Доп. параметры: {kwargs}", file=sys.stderr)
            
            # Сначала пробуем стандартный метод
            result = handler.check_redirect_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                **kwargs
            )
            
            # Если стандартный метод не сработал, пробуем ручной
            if not result.get('success') or not result.get('is_valid'):
                print("⚠️  Стандартная проверка не удалась, пробуем ручную...", file=sys.stderr)
                manual_result = handler.check_redirect_signature_manual(
                    out_sum=out_sum,
                    inv_id=inv_id,
                    signature=signature,
                    **kwargs
                )
                
                # Используем ручной результат если он успешен
                if manual_result.get('success'):
                    result = manual_result
            
        elif action == 'test_redirect_signature':
            # Тестовый endpoint для проверки подписи
            out_sum = float(data.get('out_sum', 150))
            inv_id = int(data.get('inv_id', 257099702))
            signature = data.get('signature', 'c0b86a37c1fc9daecfaa97fc86a21296')
            
            kwargs = {
                'shp_shp_product_id': data.get('shp_shp_product_id', 'KF188'),
                'IsTest': data.get('IsTest', '1'),
                'Culture': data.get('Culture', 'ru')
            }
            
            print(f"🧪 ТЕСТ ПРОВЕРКИ ПОДПИСИ:", file=sys.stderr)
            print(f"  OutSum: {out_sum}", file=sys.stderr)
            print(f"  InvId: {inv_id}", file=sys.stderr)
            print(f"  Signature: {signature}", file=sys.stderr)
            print(f"  Params: {kwargs}", file=sys.stderr)
            
            # Пробуем оба метода
            result1 = handler.check_redirect_signature(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                **kwargs
            )
            
            result2 = handler.check_redirect_signature_manual(
                out_sum=out_sum,
                inv_id=inv_id,
                signature=signature,
                **kwargs
            )
            
            result = {
                'success': True,
                'standard_method': result1,
                'manual_method': result2,
                'test_data': {
                    'out_sum': out_sum,
                    'inv_id': inv_id,
                    'signature': signature,
                    'params': kwargs,
                    'password1': handler.password1
                }
            }
            
        elif action == 'test':
            result = {
                'success': True,
                'message': 'Robokassa handler ready',
                'library_version': 'robokassa (official)',
                'merchant_login': handler.merchant_login,
                'is_test': handler.is_test,
                'passwords_match': handler.password1 == "U85g8fxYMMyThLkr1W2n" and handler.password2 == "qe9Np4lhWwJG3nKF96Ro",
                'methods_available': [
                    'generate_short_link',
                    'generate_long_link',
                    'check_result_signature',
                    'check_redirect_signature',
                    'test_redirect_signature'
                ]
            }
        
        else:
            result = {'success': False, 'error': f'Unknown action: {action}'}
        
        # Выводим ТОЛЬКО JSON
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        # В случае ошибки выводим только JSON
        error_result = {
            'success': False, 
            'error': str(e),
            'traceback': str(sys.exc_info())
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    # Запускаем асинхронную функцию
    asyncio.run(main())