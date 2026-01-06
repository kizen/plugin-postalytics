this.preserve = true;

const contact = await this.currentEntity();
const contactObj = await this.currentObject();
const business = this.currentBusiness;

let pluginEnv = business?.entitlements?.postalytics_enabled || "prod";

console.log(this.config);

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

console.log("Contact fields:", contactFields);
console.log("Contact fieldnames map:", contactFieldMap);

let campaigns = [];
try {
  const campaignsResponse = await this.get(`/external-integrations/proxy/postalytics/${pluginEnv}/campaigns/drips`);
  campaigns = campaignsResponse.drips || [];
} catch (error) {
  throw new Error("Error fetching campaigns:", error);
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
const postalyticsFieldMap = {
  [contactFieldMap[this.config.firstName] || "street_address_1"]: "address_street",
  [contactFieldMap[this.config.streetAddress2] || "street_address_2"]: "address_street2",
  [contactFieldMap[this.config.city] || "city"]: "address_city",
  [contactFieldMap[this.config.state] || "state"]: "address_state",
  [contactFieldMap[this.config.zipCode] || "zipcode"]: "address_zip",
  [contactFieldMap[this.config.firstName] || "first_name"]: "first_name",
  [contactFieldMap[this.config.lastName] || "last_name"]: "last_name",
  [contactFieldMap[this.config.email] || "email"]: "email_address",
  [contactFieldMap[this.config.mobilePhone] || "mobile_phone"]: "mobile_phone",
  [contactFieldMap[this.config.homePhone] || "home_phone"]: "phone",
};

console.log("Postalytics field map:", postalyticsFieldMap);

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

console.log("Processed contact fields:", processedContactFields);

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

  console.log("Postalytics payload:", postalyticsPayload);

  const requiredFields = ["address_city", "address_state", "address_street", "address_zip", "first_name", "last_name"];
  const missingFields = requiredFields.filter((field) => !postalyticsPayload[field]);

  if (missingFields.length > 0) {
    throw new Error(`The following required fields are missing from the contact: ${missingFields.join(", ")}`);
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
      `Campaign "${selectedCampaign.label}" has been sent to ${contactFields.first_name.value} ${contactFields.last_name.value}.`,
      { variant: "success", autohide: true }
    );
  } else {
    this.showToast("Campaign failed to send.", { variant: "failure", autohide: true });
  }
} catch (error) {
  throw new Error("Error sending campaign mail:", error);
}
