const contact = await this.currentEntity();
const contactObj = await this.currentObject();
const business = this.currentBusiness;

let pluginEnv = business?.entitlements?.postalytics_enabled || "prod";

if (pluginEnv !== "dev" && pluginEnv !== "prod") {
  throw new Error(`Unknown Postalytics environment: ${pluginEnv}`);
}

async function processContactFields(contact, obj) {
  const fields = {};
  const fieldnames = {};

  // Build field name mapping
  obj.fields.forEach((field) => {
    fieldnames[field.id] = field.name;
    if (field.is_default) {
      fields[field.name] = {
        field: field.id,
        field_display_name: field.display_name,
        field_type: field.field_type,
        value: contact[field.name],
        name: null,
      };
    }
  });

  // Converts multival fields to arrays
  contact.fields.forEach((fieldval) => {
    const fieldName = fieldnames[fieldval.field];
    if (!fieldName) return;

    if (fields[fieldName]) {
      fields[fieldName] = Array.isArray(fields[fieldName])
        ? [...fields[fieldName], fieldval]
        : [fields[fieldName], fieldval];
    } else {
      fields[fieldName] = fieldval;
    }
  });

  return { fields, fieldnames };
}

const { fields: contactFields, fieldnames: contactFieldMap } = await processContactFields(contact, contactObj);

let campaigns = [];
try {
  const campaignsResponse = await this.get(`/external-integrations/proxy/postalytics/${pluginEnv}/campaigns/drips`);
  campaigns = campaignsResponse.drips || [];
} catch (error) {
  this.showToast(Error(`Error fetching campaigns: ${error.message}`), { variant: "failure", autohide: false });
  return;
}

if (campaigns.length === 0) {
  this.showToast("No campaigns found in Postalytics account.", { variant: "failure", autohide: true });
  return;
}

const result = await this.prompt({
  title: "Send Campaign Mail",
  confirmButton: {
    label: "Send Mail",
    variant: "standard",
  },
  cancelButton: {
    label: "Cancel",
    variant: "text",
  },
  size: "medium",
  content: [
    {
      type: "description",
      content: "Select the campaign you would like to send to this contact.",
    },
    {
      type: "dropdown",
      label: "Campaign",
      id: "campaign",
      required: true,
      placeholder: "Select a campaign",
      options: campaigns.map((campaign) => ({
        label: campaign.name,
        value: campaign.endpoint_id,
      })),
    },
  ],
});

if (result.canceled) {
  this.showToast("Aborted by user.", { variant: "failure", autohide: true });
  return;
}

// Map of required fields: kizen field -> postalytics field
// Uses contactFieldMap to get the actual kizen field names from config setup assistant selection field ids
// Fallback to default field names if no mapping exists
const postalyticsFieldMap = {
  [contactFieldMap[this.config.streetAddress1.fieldId] || "street_address_1"]: "address_street",
  [contactFieldMap[this.config.streetAddress2.fieldId] || "street_address_2"]: "address_street2",
  [contactFieldMap[this.config.city.fieldId] || "city"]: "address_city",
  [contactFieldMap[this.config.state.fieldId] || "state"]: "address_state",
  [contactFieldMap[this.config.zipCode.fieldId] || "zipcode"]: "address_zip",
  [contactFieldMap[this.config.firstName.fieldId] || "first_name"]: "first_name",
  [contactFieldMap[this.config.lastName.fieldId] || "last_name"]: "last_name",
  [contactFieldMap[this.config.email.fieldId] || "email"]: "email_address",
  [contactFieldMap[this.config.mobilePhone.fieldId] || "mobile_phone"]: "mobile_phone",
  [contactFieldMap[this.config.homePhone.fieldId] || "home_phone"]: "phone",
};

const processField = (field) => {
  if (Array.isArray(field)) {
    return field.map((f) => processField(f));
  } else if (field.field_type == "dynamictags" && Array.isArray(field.value)) {
    // Custom dynamictags field is array of objects, Native tags field is object with array value
    return field.value.map((tag) => tag.name || tag.value);
  } else if (field.field_type == "money") {
    return field.name.description || field.value;
  } else if (field.field_type == "rating") {
    // Rating has number for value and label for name
    return field.value || field.name;
  } else {
    // Don't include if both name and value are empty
    return field.name || field.value;
  }
};

const processedContactFields = Object.keys(contactFields).reduce((acc, key) => {
  acc[key] = processField(contactFields[key]);
  return acc;
}, {});

try {
  const selectedCampaign = result.values.campaign;
  const postalyticsPayload = Object.fromEntries(
    Object.entries(postalyticsFieldMap)
      .filter(([kizenField]) => contactFields[kizenField])
      .map(([kizenField, postalyticsField]) => {
        const processedField = processField(contactFields[kizenField]);
        if (Array.isArray(processedField)) {
          return [postalyticsField, processedField.join(", ")];
        }
        return [postalyticsField, processedField];
      })
  );

  const requiredFields = ["address_city", "address_state", "address_street", "address_zip", "first_name", "last_name"];
  const missingFields = requiredFields.filter((field) => !postalyticsPayload[field]);

  if (missingFields.length > 0) {
    this.showToast(`The following required fields are missing from the contact: ${missingFields.join(", ")}`, {
      variant: "failure",
      autohide: true,
    });
    return;
  }

  const sendResponse = await this.post(
    `/external-integrations/proxy/postalytics/${pluginEnv}/send/${selectedCampaign.value}`,
    postalyticsPayload,
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  if (sendResponse?.send_date) {
    this.showToast(
      `Campaign "${selectedCampaign.label}" has been sent to ${postalyticsPayload.first_name} ${postalyticsPayload.last_name}.`,
      { variant: "success", autohide: true }
    );
  } else {
    this.showToast("Campaign failed to send.", { variant: "failure", autohide: true });
  }
} catch (error) {
  this.showToast(`Error sending campaign mail: ${error.message}`, { variant: "failure", autohide: false });
}
