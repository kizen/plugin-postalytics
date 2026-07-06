import time

BASE_URL = "/external-integrations/proxy/postalytics"

is_dev_env = inputs.is_dev_env or False
service_name = "dev" if is_dev_env else "prod"

required_fields = ["input_city", "input_state", "input_street1", "input_zip", "input_first_name", "input_last_name",]

missing_field_names = [req_field for req_field in required_fields if not getattr(inputs, req_field)]

if missing_field_names:
    raise ValueError(f'Contact missing required fields: {", ".join(missing_field_names)}')

payload = {
    "first_name": inputs.input_first_name,
    "last_name": inputs.input_last_name,
    "address_street": inputs.input_street1,
    "address_street2": inputs.input_street2,
    "address_city": inputs.input_city,
    "address_state": inputs.input_state.name, # need to use .name because it's a dropdown
    "address_zip": inputs.input_zip,
    "email_address": inputs.input_email,
    "mobile_phone": inputs.input_phone_mobile,
    "phone": inputs.input_phone_home,
}

url = f"{BASE_URL}/{service_name}/send/{inputs.campaign_id}"

try:
    response = kizen.api.post(url, json=payload, headers={"Content-Type": "application/json"})
except Exception as e:
    raise Exception(f"An error occurred while sending data to Postalytics: {str(e)}")

retry_count = 0
while response.status_code == 429 and retry_count < 3:
    retry_count += 1
    retry_after_header = response.headers.get("Retry-After")
    try:
        retry_after = int(retry_after_header) if retry_after_header else 0
    except (TypeError, ValueError):
        retry_after = 0
    if retry_after <= 0:
        retry_after = 2 ** retry_count
    time.sleep(retry_after)

    try:
        response = kizen.api.post(url, json=payload, headers={"Content-Type": "application/json"})
    except Exception as e:
        raise Exception(f"An error occurred while sending data to Postalytics: {str(e)}")

if not response.ok:
    raise Exception(f"Error sending data to Postalytics: {response.status_code} - {response.text}")

body = response.json().get("body") or {}
outputs.send_date = body.get("send_date")