import requests
from requests.auth import HTTPBasicAuth
import time

BASE_URL = "https://api-dev.postalytics.com/api/v1"

required_fields = ["input_city", "input_state", "input_street1", "input_zip", "input_first_name", "input_last_name",]

missing_field_names = [req_field for req_field in required_fields if not getattr(inputs, req_field)]

if missing_field_names:
    raise ValueError(f'Contact missing required fields: {", ".join(missing_field_names)} \n Inputs: {inputs}')

contact_fields = requests.get(
    "https://staging.kizen.com/api/custom-objects/client_client/fields/search",
    headers={
        "x-api-key": "6df39d4c-1d85-4b06-930d-f195d513c641",
        "x-user-id": "77acf7b1-b7b0-4768-a285-6addf06dc570",
        "x-business-id": "eedc1c3a-281d-4a26-88ea-a684c85fa612",
    },
).json()

state_field = next((d for d in contact_fields if d.get("name") == "state"), None)

if state_field and state_field.get("options"):
    state_map = {opt['id']: opt['name'] for opt in state_field['options']}
    if str(inputs.input_state) not in state_map:
        raise ValueError(f"Invalid state value: {inputs.input_state}")
    input_state_string = state_map[str(inputs.input_state)]
else:
    raise ValueError("State field options not found.")

payload = {
    "first_name": inputs.input_first_name,
    "last_name": inputs.input_last_name,
    "address_street": inputs.input_street1,
    "address_street2": inputs.input_street2,
    "address_city": inputs.input_city,
    "address_state": input_state_string,
    "address_zip": inputs.input_zip,
    "email_address": inputs.input_email
    # "mobile_phone": inputs.input_phone_mobile,
    # "phone": inputs.input_phone_home,
}

response = requests.post(
    f"{BASE_URL}/send/{inputs.campaign_id}",
    json=payload,
    headers={"Content-Type": "application/json"},
    auth=HTTPBasicAuth(secrets['postalytics__api_key'], ""),
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
  # REMOVE SECRETS FROM DEBUG MESSAGE
  raise Exception(f"Error sending data to Postalytics: {response.status_code} - {response.text} \n Secrets: {secrets}")