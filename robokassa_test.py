from robokassa import HashAlgorithm, Robokassa

robokassa = Robokassa(
    merchant_login="kfwatchface",  # демо-аккаунт
    password1="1",
    password2="1",
    is_test=True,
    algorithm=HashAlgorithm.md5,
)

response = robokassa.generate_open_payment_link(
    out_sum=150,
    inv_id=123456,
    description="Тестовый платеж",
    email="test@example.com"
)

print("✅ Ссылка:", response.url)
print("✅ Параметры:", response.params.to_dict())
