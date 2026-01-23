# Postalytics Plugin

## Overview

The Postalytics plugin integrates with the Postalytics API to enable sending direct mail (postcards and letters) campaigns to contacts directly from the Kizen platform. The plugin supports both development and production environments and provides a seamless workflow for selecting and sending mail campaigns to individual contacts.

### Key Components

#### 1. Configuration File (`kizen.json`)

The main configuration file defines:

- **Authentication**: Uses basic auth token authentication with API key stored as a secret
- **Environments**: Supports both dev and prod environments with separate API endpoints
  - Dev: `https://api-dev.postalytics.com/api/v1/`
  - Prod: `https://api.postalytics.com/api/v1/`
- **Optional Entitlement**: `postalytics_enabled` - must be set to either "dev" to use Sandbox, missing entitlement defaults to "prod"
- **Secret Storage**: API key stored as `postalytics__api_key` in integration secrets

#### 2. Actions

##### Send Campaign Mail (`src/actions/sendMail/`)

**Purpose**: Allows users to send a Postalytics campaign to a single contact from the contact detail page.

**Implementation** (`script.js`):
The action performs the following workflow:

1. **Environment Validation**

   - Checks if Postalytics is enabled for the business
   - Validates environment is either "dev" or "prod"

2. **Contact Field Processing**

   - Processes all contact fields
   - Handles multi-value fields by converting them to arrays
   - Validates required fields are present

3. **Required Fields Validation**
   Ensures the following fields exist on the contact:

   - `first_name`
   - `last_name`
   - `street_address_1`
   - `city`
   - `state`
   - `zipcode`

4. **Campaign Selection**

   - Fetches available campaigns from Postalytics API (`/campaigns/drips` endpoint)
   - Presents a dropdown prompt for user to select campaign
   - Each campaign has a `name` and `endpoint_id`

5. **Field Mapping**
   Maps Kizen contact fields to Postalytics API fields:

   ```
   Kizen Field        →    Postalytics Field
   street_address_1   →    address_street
   street_address_2   →    address_street2
   city               →    address_city
   state              →    address_state
   zipcode            →    address_zip
   first_name         →    first_name
   last_name          →    last_name
   email              →    email_address
   phone_mobile       →    mobile_phone
   phone_home         →    phone
   ```

6. **Special Field Processing**

   - **Dynamic Tags**: Extracts tag names/values from array
   - **Money Fields**: Uses description or value
   - **Rating Fields**: Uses value or name
   - **Multi-value Fields**: Joins with comma separator

7. **API Request**
   - Sends POST request to `/send/{campaign_endpoint_id}`
   - Includes mapped contact data as JSON payload
   - Shows success/failure toast notification

#### 3. Automation Steps

##### Send Mail Automation (`src/automationSteps/sendMailAutomation/`)

**Purpose**: Enables automated sending of Postalytics campaigns to contacts through automation workflows.

**Implementation** (`script.py`):
The user must define the `endpoint` variable. Contact fields are prepopulated and able to be overridden.

The automation step performs the following:

1. **Required Field Validation**

   - Validates all required address fields are present in inputs
   - Required fields: `input_city`, `input_state`, `input_street1`, `input_zip`, `input_first_name`, `input_last_name`

2. **State Field Mapping**

   - Fetches contact field definitions from Kizen API
   - Maps state field IDs to state names for proper API formatting
   - Validates state value exists in field options

3. **Payload Construction**

   - Maps input fields to Postalytics API format
   - Includes optional email field if provided

4. **API Request with Retry Logic**
   - Sends POST request to `/send/{campaign_id}` endpoint
   - Implements automatic retry on rate limiting (429 status)
   - Uses exponential backoff with up to 3 retries
   - Respects `Retry-After` header when present

**Required Secrets**:

- `postalytics__api_key`: Base64-encoded API key for authentication

## API Integration

### Authentication

- **Type**: Basic Authentication
- **Username**: API Key (stored as secret)
- **Password**: Empty string

### Key Endpoints

1. **Get Campaigns**

   - Path: `/campaigns/drips`
   - Method: GET
   - Returns: List of available campaigns with `name` and `endpoint_id`

2. **Send Campaign**
   - Path: `/send/{campaign_endpoint_id}`
   - Method: POST
   - Headers: `Content-Type: application/json`
   - Body: Contact data mapped to Postalytics fields

### Proxy Pattern

All API calls go through Kizen's proxy:

```python
/external-integrations/proxy/postalytics/{env}/{endpoint}
```

Where `{env}` is either "dev" or "prod"

## Setup Requirements

### 1. Business Configuration

- Enable entitlement `postalytics_enabled` with value "dev" to use Sandbox account
- Configure API key in integration secrets as `postalytics__api_key`
  1. Open Postalytics account dashboard
  2. Go to Connect->API Key settings
  3. Copy base64-encoded token (`Basic {base64_encoded_token}`) from Authorization Header and paste in integration secret

### 2. Contact Object Requirements

The contact object (`client_client`) must have these fields:

- Basic address fields (street, city, state, zip)
- Name fields (first_name, last_name)
- Optional: email, phone fields

### 3. Postalytics Account Setup

- Kizen dev sandbox credentials available in 1Password
- Create `Triggered Drip` campaigns in Postalytics dashboard

## Error Handling

### Common Error Scenarios

1. **Invalid Entitlement**: Shows error if `postalytics_enabled` is not set to "dev" or "prod"
2. **Missing Required Fields**: Lists all missing required fields
3. **No Campaigns Available**: Shows toast notification
4. **API Failures**: Displays error message with details

### Rate Limiting

The automation script implements exponential backoff:

- Retries up to 3 times on 429 status
- Uses `Retry-After` header or exponential delay if not available

## Development Workflow

### Testing the Plugin

1. Set up a test business with `postalytics_enabled` entitlement set to "dev"
2. Configure API key in integration secrets
3. Create test contact with all required fields
4. Navigate to contact detail page
5. Run "Send Campaign Mail" action
6. Select campaign and confirm

### Common Issues and Solutions

1. **"Postalytics entitlement is invalid"**

   - Solution: Add `postalytics_enabled: "dev"` to business or remove to set to "prod"

2. **"Required fields are missing"**

   - Solution: Ensure contact has all address fields populated

3. **"No campaigns found"**

   - Solution: Create campaigns in Postalytics dashboard

4. **API Authentication Failures**
   - Solution: Verify API key is correctly stored in secrets

## Release Management

### Release Process

1. Update version in `kizen.json`
2. Test in dev environment
3. Update release branches and environments in config
4. Deploy to production when ready

## Support and Troubleshooting

### Contact Support

For issues or questions:

1. Verify configuration in `kizen.json`
2. Ensure Postalytics account is properly configured
3. Contact integration team for API key or entitlement issues

## Security Considerations

### API Key Management

- Use Kizen's secret management system
- Rotate keys periodically
- Use separate keys for dev/prod environments

### Data Privacy

- Contact data is sent to Postalytics servers
- Ensure compliance with data protection regulations
- Implement appropriate consent mechanisms
- Log minimal PII in debug messages

## Appendix

### Sample API Responses

#### Campaigns List Response

```json
{
  "drips": [
    {
      "name": "Welcome Campaign",
      "endpoint_id": "abc123"
    },
    {
      "name": "Holiday Promotion",
      "endpoint_id": "def456"
    }
  ]
}
```

#### Send Campaign Success Response

```json
{
  "send_date": "2024-12-08T10:00:00Z",
  "status": "queued",
  "recipient_id": "xyz789"
}
```
