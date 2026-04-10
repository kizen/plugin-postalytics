import requests
from requests.auth import HTTPBasicAuth
import time

isDevEnv = inputs.get("is_dev_env", False)
BASE_URL = "https://api-dev.postalytics.com/api/v1/" if isDevEnv else "https://api.postalytics.com/api/v1/"

required_fields = ["input_city", "input_state", "input_street1", "input_zip", "input_first_name", "input_last_name",]

missing_field_names = [req_field for req_field in required_fields if not getattr(inputs, req_field)]

if missing_field_names:
    raise ValueError(f'Contact missing required fields: {", ".join(missing_field_names)} \n Inputs: {inputs}')

payload = {
    "first_name": inputs.input_first_name,
    "last_name": inputs.input_last_name,
    "address_street": inputs.input_street1,
    "address_street2": inputs.input_street2,
    "address_city": inputs.input_city,
    "address_state": inputs.input_state.name, # need to use .name because it's a dropdown
    "address_zip": inputs.input_zip,
    "email_address": inputs.input_email
    # "mobile_phone": inputs.input_phone_mobile,
    # "phone": inputs.input_phone_home,
}

response = requests.post(
    f"{BASE_URL}/send/{inputs.campaign_id}",
    json=payload,
    headers={
       "Content-Type": "application/json",
       "Authorization": f"Basic {secrets['postalytics__api_key']}"
    },
)

retry_count = 0
while response.status_code == 429 and retry_count < 3:
  retry_count += 1
  retry_after = int(response.headers.get("Retry-After"))
  if not retry_after:
      retry_after = 2 ** retry_count
  time.sleep(retry_after)

  response = requests.post(
      f"{BASE_URL}/v1/send/{inputs.campaign_id}",
      json=payload,
      headers={
         "Content-Type": "application/json",
         "Authorization": f"Basic {secrets['postalytics__api_key']}"
      },

  )

if response.status_code != 200:
  raise Exception(f"Error sending data to Postalytics: {response.status_code} - {response.text}")